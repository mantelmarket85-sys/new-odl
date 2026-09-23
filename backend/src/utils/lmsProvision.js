// ============================================================
//  LMS PROVISIONING (Section 9 + Section 10)
//  ------------------------------------------------------------
//  When an ADCS student's enrollment is confirmed, the admissions
//  system provisions a dedicated LmsUser account and copies the
//  student's profile + document status into an LmsStudentProfile.
//
//  This module exposes provisionLmsForStudent() which is called
//  from confirmEnrollment() for ADCS students only. It is fully
//  idempotent — safe to re-run on the same enrollment.
// ============================================================

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Map a Document.type / EducationDocument.docType to the profile URL field.
function docPath(documents, type) {
  const d = documents.find((x) => (x.type || '').toLowerCase() === type);
  return d ? d.filePath : null;
}

// Determine which required documents are missing.
// A document is "missing" if its URL is null/empty.
function computeMissingDocs(urls) {
  const checks = [
    { key: 'photoUrl', label: 'Photo' },
    { key: 'cnicDocUrl', label: 'CNIC copy' },
    { key: 'matricCertUrl', label: 'Matric certificate' },
    { key: 'intermediateCertUrl', label: 'Intermediate / FA / FSc certificate' },
    { key: 'migrationCertUrl', label: 'Migration certificate' },
    { key: 'domicileCertUrl', label: 'Domicile certificate' },
  ];
  return checks.filter((c) => !urls[c.key]).map((c) => c.label);
}

/**
 * Build the document URL set for a user from their Document + Education docs.
 */
function collectDocumentUrls(user) {
  const documents = user.documents || [];
  const educations = user.educations || [];

  // Flatten all education documents with their docType.
  const eduDocs = [];
  for (const ed of educations) {
    for (const d of ed.documents || []) {
      eduDocs.push({ level: ed.level, docType: (d.docType || '').toLowerCase(), filePath: d.filePath });
    }
  }
  const findEdu = (level, types) => {
    const hit = eduDocs.find(
      (d) => (!level || d.level === level) && types.includes(d.docType)
    );
    return hit ? hit.filePath : null;
  };

  // Matric (10 years), Intermediate (12 years / FSc)
  const matricCertUrl =
    findEdu('10years', ['certificate', 'char_cert', 'dmc', 'provisional']) ||
    findEdu(null, ['matric', 'ssc']);
  const intermediateCertUrl =
    findEdu('12years', ['certificate', 'char_cert', 'dmc', 'provisional']) ||
    findEdu('11years', ['certificate', 'char_cert', 'dmc', 'part1_dmc']) ||
    findEdu(null, ['fsc', 'hssc', 'intermediate']);

  // Migration / Domicile certificates may live as generic Documents.
  const migrationCertUrl = docPath(documents, 'migration') || docPath(documents, 'migration_cert');
  const domicileCertUrl = docPath(documents, 'domicile') || docPath(documents, 'domicile_cert');

  const photoUrl = docPath(documents, 'photo') || (user.profile ? user.profile.photoPath : null);
  // CNIC copy — either a front scan or a combined doc.
  const cnicDocUrl =
    docPath(documents, 'cnic_front') || docPath(documents, 'cnic') || docPath(documents, 'cnic_back');

  // Any uploaded docs that are not part of the standard required set.
  const standardTypes = new Set([
    'photo', 'cnic_front', 'cnic_back', 'cnic', 'migration', 'migration_cert',
    'domicile', 'domicile_cert', 'application_fee_receipt', 'fee_receipt',
  ]);
  const otherDocs = documents
    .filter((d) => !standardTypes.has((d.type || '').toLowerCase()))
    .map((d) => ({ type: d.type, url: d.filePath, name: d.fileName || null }));

  return {
    photoUrl,
    cnicDocUrl,
    matricCertUrl,
    intermediateCertUrl,
    migrationCertUrl,
    domicileCertUrl,
    otherDocs,
  };
}

/**
 * Provision (or refresh) the LMS account + profile for an ADCS student.
 *
 * @param {object} args
 * @param {number} args.userId        - admissions User id
 * @param {object} args.enrollment    - the freshly-confirmed Enrollment row (with rollNumber, registrationNumber, lmsUsername, lmsPassword)
 * @param {object} args.program       - the Program (for name/shortForm/department)
 * @param {object} args.cycle         - the AdmissionCycle (for session)
 * @returns {Promise<{lmsUser: object, profile: object}>}
 */
async function provisionLmsForStudent({ userId, enrollment, program, cycle }) {
  const rollNumber = enrollment.rollNumber;
  if (!rollNumber) return null; // nothing to provision without a roll number

  // Load the full admissions profile + documents for the copy step.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      documents: true,
      educations: { include: { documents: true } },
    },
  });
  if (!user) return null;

  const prof = user.profile || {};
  const urls = collectDocumentUrls(user);
  const missingDocs = computeMissingDocs(urls);

  // ----- 1. Create or fetch the LmsUser (username = Roll Number) -----
  let lmsUser = await prisma.lmsUser.findUnique({ where: { username: rollNumber } });

  if (!lmsUser) {
    // Use the same temporary password issued on the enrollment card so the
    // student can log into the LMS with the credentials shown to them.
    const tempPassword = enrollment.lmsPassword || rollNumber;
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    lmsUser = await prisma.lmsUser.create({
      data: {
        username: rollNumber,
        passwordHash,
        role: 'Student',
        isActive: true,
        mustChangePassword: true,
        linkedRollNumber: rollNumber,
      },
    });
  }

  // Link the LmsUser back to the Enrollment + mark account created.
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { lmsUserId: lmsUser.id, lmsAccountCreated: true },
  });

  // ----- 2. Create or update the LmsStudentProfile -----
  const fullName = [prof.firstName, prof.lastName].filter(Boolean).join(' ').trim() || user.username || user.email;
  const domicile = [prof.domicileDistrict, prof.domicileProvince].filter(Boolean).join(', ') || null;

  const profileData = {
    fullName,
    fatherName: prof.fatherName || '',
    cnic: prof.cnic || '',
    dateOfBirth: prof.dateOfBirth || '',
    gender: prof.gender || '',
    religion: prof.religion || null,
    nationality: prof.nationality || null,
    domicile,
    phone: prof.phone || prof.guardianPhone || prof.whatsappNumber || null,
    email: user.email || null,
    address: prof.address || [prof.presStreet, prof.presDistrict].filter(Boolean).join(', ') || null,
    program: program?.name || 'Associate Degree in Computer Science',
    programShortForm: program?.shortForm || program?.code || 'ADCS',
    department: program?.department?.name || 'Computer Science',
    rollNumber,
    registrationNumber: enrollment.registrationNumber || '',
    session: cycle?.title || '',
    enrollmentDate: enrollment.enrolledAt || new Date(),
    photoUrl: urls.photoUrl,
    cnicDocUrl: urls.cnicDocUrl,
    matricCertUrl: urls.matricCertUrl,
    intermediateCertUrl: urls.intermediateCertUrl,
    migrationCertUrl: urls.migrationCertUrl,
    domicileCertUrl: urls.domicileCertUrl,
    otherDocsJson: JSON.stringify(urls.otherDocs || []),
    missingDocs: JSON.stringify(missingDocs),
  };

  const profile = await prisma.lmsStudentProfile.upsert({
    where: { lmsUserId: lmsUser.id },
    update: profileData,
    create: { lmsUserId: lmsUser.id, ...profileData },
  });

  // ----- 3. AUTOMATIC COURSE ENROLLMENT (Requirement #2) -----
  // As soon as the student is provisioned from Admissions, auto-enroll them
  // into the approved Scheme of Study for their current semester. Idempotent
  // and non-blocking — a failure here must not break enrollment confirmation.
  try {
    // Lazy require to avoid any circular-dependency surprises at load time.
    const { autoEnrollStudent } = require('../services/autoEnrollService');
    await autoEnrollStudent(lmsUser.id);
  } catch (enrollErr) {
    console.error('[lmsProvision] auto-enroll failed for', rollNumber, enrollErr.message);
  }

  return { lmsUser, profile };
}

module.exports = { provisionLmsForStudent, computeMissingDocs, collectDocumentUrls };

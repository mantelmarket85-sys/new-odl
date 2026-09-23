// ============================================================
//  ADMISSIONS → LMS LIVE PROFILE SYNC  (Requirement #16)
//  ------------------------------------------------------------
//  The LMS must reflect the ACTUAL Admissions System records for a
//  student — full profile, documents, missing documents and the
//  verification status — without modifying the Admissions System.
//
//  This module READS admissions tables (User / Profile / Document /
//  Education / Application / Enrollment) and produces a unified,
//  always-current view. It NEVER writes to admissions tables.
//
//  Resolution path:
//    LmsUser.id  --(Enrollment.lmsUserId)-->  Enrollment.userId
//                -->  admissions User (+ profile, documents, educations,
//                     applications)
//
//  When an LmsUser is not linked to an Enrollment (e.g. directly-seeded
//  demo accounts), we gracefully fall back to the LmsStudentProfile
//  snapshot so the LMS still shows real, stored data.
// ============================================================
const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const { collectDocumentUrls, computeMissingDocs } = require('../utils/lmsProvision');

// Required document checklist (label + which profile/url key carries it).
const REQUIRED_DOCS = [
  { key: 'photoUrl', label: 'Photo' },
  { key: 'cnicDocUrl', label: 'CNIC copy' },
  { key: 'matricCertUrl', label: 'Matric certificate' },
  { key: 'intermediateCertUrl', label: 'Intermediate / FA / FSc certificate' },
  { key: 'migrationCertUrl', label: 'Migration certificate' },
  { key: 'domicileCertUrl', label: 'Domicile certificate' },
];

/**
 * Find the admissions Enrollment row linked to an LmsUser (if any).
 */
async function findEnrollment(lmsUserId) {
  return prisma.enrollment.findFirst({ where: { lmsUserId } });
}

/**
 * Derive a human verification status for the student from admissions records.
 *  - "Verified"   → enrollment ENROLLED/ACTIVE and no missing required docs
 *  - "In Review"  → enrolled but some required documents still missing
 *  - "Pending"    → application not yet enrolled / no enrollment record
 */
function deriveVerification({ enrollment, application, missingDocs }) {
  const enrStatus = (enrollment?.status || '').toUpperCase();
  const appStatus = (application?.status || '').toUpperCase();
  const enrolled = ['ENROLLED', 'ACTIVE', 'CONFIRMED'].includes(enrStatus) || ['ENROLLED', 'APPROVED', 'ACCEPTED'].includes(appStatus);

  // Additional Fixes §8 — Once the Director has PUBLISHED the enrollment
  // ("Show to Student"), the student has a Reg#/Roll#/LMS account and is a
  // fully admitted, active LMS student. The verification/pending banner must
  // permanently disappear at that point regardless of the raw enrollment.status
  // string (which some legacy rows keep as "PENDING"). credentialsPublished is
  // the authoritative signal, alongside an assigned Reg#/Roll#.
  const published = !!(enrollment && (
    enrollment.credentialsPublished === true ||
    (enrollment.registrationNumber && enrollment.rollNumber)
  ));

  if (published) {
    return { status: 'Verified', tone: 'success', detail: 'Admission confirmed — you are an enrolled student.' };
  }
  if (enrolled && (!missingDocs || missingDocs.length === 0)) {
    return { status: 'Verified', tone: 'success', detail: 'All admission records verified.' };
  }
  if (enrolled) {
    return { status: 'Documents Pending', tone: 'warning', detail: `${missingDocs.length} document(s) outstanding.` };
  }
  return { status: 'Pending Verification', tone: 'warning', detail: 'Awaiting admissions confirmation.' };
}

/**
 * Build the LIVE, unified student profile for an LmsUser.
 * Always returns a profile object (snapshot fallback when not linked).
 *
 * @param {object} lmsUser  - { id, username, ... }
 * @returns {Promise<{profile:object, source:'admissions-live'|'snapshot', enrollmentLinked:boolean}>}
 */
async function buildLiveStudentProfile(lmsUser) {
  const snapshot = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: lmsUser.id } });
  const enrollment = await findEnrollment(lmsUser.id);

  // --- No admissions linkage → return snapshot enriched with derived bits ---
  if (!enrollment) {
    const missingDocs = parseMissing(snapshot?.missingDocs);
    const otherDocs = parseJsonArray(snapshot?.otherDocsJson);
    const verification = deriveVerification({ enrollment: null, application: null, missingDocs });
    return {
      source: 'snapshot',
      enrollmentLinked: false,
      profile: decorate(snapshot || {}, { missingDocs, otherDocs, verification, username: lmsUser.username }),
    };
  }

  // --- Live read from admissions ---
  const user = await prisma.user.findUnique({
    where: { id: enrollment.userId },
    include: {
      profile: true,
      documents: true,
      educations: { include: { documents: true } },
      applications: { include: { program: { include: { department: true } }, admissionCycle: true }, orderBy: { id: 'desc' }, take: 1 },
    },
  });
  if (!user) {
    const missingDocs = parseMissing(snapshot?.missingDocs);
    return {
      source: 'snapshot',
      enrollmentLinked: true,
      profile: decorate(snapshot || {}, { missingDocs, otherDocs: parseJsonArray(snapshot?.otherDocsJson), verification: deriveVerification({ enrollment, application: null, missingDocs }), username: lmsUser.username }),
    };
  }

  const prof = user.profile || {};
  const application = (user.applications && user.applications[0]) || null;
  const program = application?.program || null;
  const cycle = application?.admissionCycle || null;

  const urls = collectDocumentUrls(user);
  const missingDocs = computeMissingDocs(urls);
  const verification = deriveVerification({ enrollment, application, missingDocs });

  const fullName = [prof.firstName, prof.lastName].filter(Boolean).join(' ').trim()
    || snapshot?.fullName || user.username || user.email;
  const domicile = [prof.domicileDistrict, prof.domicileProvince].filter(Boolean).join(', ') || snapshot?.domicile || null;

  const live = {
    // identifiers
    fullName,
    fatherName: prof.fatherName || snapshot?.fatherName || '',
    cnic: prof.cnic || snapshot?.cnic || '',
    dateOfBirth: prof.dateOfBirth || snapshot?.dateOfBirth || '',
    gender: prof.gender || snapshot?.gender || '',
    religion: prof.religion || snapshot?.religion || null,
    nationality: prof.nationality || snapshot?.nationality || null,
    domicile,
    // contact
    phone: prof.phone || prof.guardianPhone || prof.whatsappNumber || snapshot?.phone || null,
    email: user.email || snapshot?.email || null,
    address: prof.address || [prof.presStreet, prof.presDistrict].filter(Boolean).join(', ') || snapshot?.address || null,
    // academic
    program: program?.name || snapshot?.program || 'Associate Degree in Computer Science',
    programShortForm: program?.shortForm || program?.code || snapshot?.programShortForm || 'ADCS',
    department: program?.department?.name || snapshot?.department || 'Computer Science',
    rollNumber: enrollment.rollNumber || snapshot?.rollNumber || '',
    registrationNumber: enrollment.registrationNumber || snapshot?.registrationNumber || '',
    session: cycle?.title || snapshot?.session || '',
    enrollmentDate: enrollment.enrolledAt || snapshot?.enrollmentDate || null,
    // documents
    photoUrl: urls.photoUrl || snapshot?.photoUrl || null,
    cnicDocUrl: urls.cnicDocUrl || snapshot?.cnicDocUrl || null,
    matricCertUrl: urls.matricCertUrl || snapshot?.matricCertUrl || null,
    intermediateCertUrl: urls.intermediateCertUrl || snapshot?.intermediateCertUrl || null,
    migrationCertUrl: urls.migrationCertUrl || snapshot?.migrationCertUrl || null,
    domicileCertUrl: urls.domicileCertUrl || snapshot?.domicileCertUrl || null,
  };

  // If the student uploaded a profile photo inside the LMS (stored on the
  // snapshot), prefer it over the admissions photo so their update sticks.
  if (snapshot?.photoUrl && snapshot.photoUrl.includes('/uploads/photos/')) {
    live.photoUrl = snapshot.photoUrl;
  }

  return {
    source: 'admissions-live',
    enrollmentLinked: true,
    profile: decorate(live, { missingDocs, otherDocs: urls.otherDocs || [], verification, username: lmsUser.username, applicationStatus: application?.status, enrollmentStatus: enrollment.status }),
  };
}

// Attach derived, presentation-friendly fields used by the LMS Settings UI.
function decorate(base, { missingDocs, otherDocs, verification, username, applicationStatus, enrollmentStatus }) {
  return {
    ...base,
    username,
    missingDocs: missingDocs || [],
    otherDocs: otherDocs || [],
    verification,
    verificationStatus: verification?.status || 'Unknown',
    applicationStatus: applicationStatus || null,
    enrollmentStatus: enrollmentStatus || null,
    // Convenience document checklist (label/url/present) for rendering.
    documentChecklist: REQUIRED_DOCS.map((d) => ({
      label: d.label,
      url: base[d.key] || null,
      present: !!base[d.key],
    })),
  };
}

function parseMissing(json) {
  const arr = parseJsonArray(json);
  return Array.isArray(arr) ? arr : [];
}
function parseJsonArray(json) {
  if (!json) return [];
  try { const v = JSON.parse(json); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ============================================================
//  DEPARTMENT / PROGRAM → LMS SYNC  (Master Prompt Section 9 & 11)
//  ------------------------------------------------------------
//  When the Super Admin creates a department + programs in the
//  Admissions Portal, the LMS academic structure is automatically
//  mirrored: each admissions Program becomes an LmsProgram (matched by
//  code), and a set of semester templates is created. This is fully
//  idempotent and NEVER modifies the LMS beyond this mirroring.
// ============================================================

/**
 * Mirror a single admissions Program into an LmsProgram (upsert by code) and
 * ensure its numbered semester templates exist. Returns the LmsProgram.
 */
async function syncProgramToLms(program, department) {
  if (!program || !program.code) return null;
  const deptName = (department && department.name) || program.department?.name || null;
  const semesters = program.semesters || 4;
  const durationYears = (() => {
    const m = String(program.duration || '').match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : Math.max(1, semesters / 2);
  })();

  const existing = await prisma.lmsProgram.findUnique({ where: { code: program.code } });
  let lmsProgram;
  if (existing) {
    lmsProgram = await prisma.lmsProgram.update({
      where: { code: program.code },
      data: {
        name: program.name,
        shortForm: program.shortForm || program.code,
        department: deptName,
        totalSemesters: semesters,
        durationYears,
        isActive: program.isActive !== false,
        isDeleted: false,
        deletedAt: null,
      },
    });
  } else {
    lmsProgram = await prisma.lmsProgram.create({
      data: {
        code: program.code,
        name: program.name,
        shortForm: program.shortForm || program.code,
        department: deptName,
        totalSemesters: semesters,
        durationYears,
        isActive: program.isActive !== false,
      },
    });
  }

  // Ensure numbered semester templates (Semester 1..N) exist.
  for (let n = 1; n <= semesters; n++) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.lmsSemester.upsert({
      where: { programId_number: { programId: lmsProgram.id, number: n } },
      update: { isDeleted: false, deletedAt: null, isActive: true },
      create: { programId: lmsProgram.id, number: n, title: `Semester ${n}`, isActive: true },
    }).catch(() => {});
  }

  return lmsProgram;
}

/**
 * Mirror a whole department (its programs) into the LMS. Idempotent.
 */
async function syncDepartmentToLms(department, programs) {
  const list = programs && programs.length
    ? programs
    : await prisma.program.findMany({ where: { departmentId: department.id } });
  const results = [];
  for (const p of list) {
    // eslint-disable-next-line no-await-in-loop
    const r = await syncProgramToLms(p, department).catch((e) => {
      console.error('[admissionsSync] syncProgramToLms failed:', e.message);
      return null;
    });
    if (r) results.push(r);
  }
  return results;
}

// ============================================================
//  DEPARTMENT STAFF → LMS SYNC  (Additional Fixes §2)
//  ------------------------------------------------------------
//  The Course Coordinator and Department Focal Person are LMS-SIDE
//  roles. When the Super Admin assigns / creates them for a
//  department, they must automatically become LMS users with the
//  correct LMS role and be tied to their department (via the
//  LmsProgram.department string), keeping the workflow department-
//  isolated. The Admissions Coordinator is NOT provisioned in the
//  LMS (they operate purely in the Admissions Portal).
// ============================================================

/**
 * Ensure the given LMS staff user has an LmsStudentProfile row whose
 * `department` field is set to the CANONICAL admissions department name.
 *
 * THIS IS THE CRITICAL DEPARTMENT-ISOLATION LINK. The LMS scope resolver
 * (utils/lmsDeptScope.js and coordinator.resolveScopedPrograms) reads this
 * exact field to decide which department a Focal Person / Course Coordinator
 * belongs to. Previously this was never written, so staff had no department
 * and the scope fell back to "see everything" — the isolation bug where a
 * Computer-Science focal person could see Mathematics students.
 *
 * Idempotent & non-breaking: creates the profile if missing, otherwise only
 * updates the `department` (and staff designation) so a staff member is always
 * strictly bound to exactly one department.
 */
async function ensureStaffDepartmentProfile(lmsUserId, department, lmsRole) {
  const dept = department ? String(department).trim() : '';
  if (!lmsUserId || !dept) return;
  const designation = lmsRole === 'FocalPerson' ? 'Department Focal Person'
    : lmsRole === 'CourseCoordinator' ? 'Course Coordinator' : null;
  try {
    const existing = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId } });
    if (existing) {
      // Only re-write the department (isolation key). Never overwrite other
      // profile fields the staff member may have edited themselves.
      if (String(existing.department || '').trim() !== dept) {
        await prisma.lmsStudentProfile.update({ where: { lmsUserId }, data: { department: dept } });
      }
      return;
    }
    // Create a minimal staff profile. The many student-only columns are
    // required by the schema, so seed them with harmless placeholders — this
    // row exists purely to carry the department isolation key + designation.
    await prisma.lmsStudentProfile.create({
      data: {
        lmsUserId,
        fullName: '', fatherName: '', cnic: '', dateOfBirth: '', gender: '',
        program: '', programShortForm: '', department: dept,
        rollNumber: '', registrationNumber: '', session: '',
        enrollmentDate: new Date(),
        designation,
      },
    });
  } catch (e) {
    console.error('[admissionsSync] ensureStaffDepartmentProfile failed:', e.message);
  }
}

/**
 * Ensure a single admissions staff User has a matching LmsUser with the
 * given LMS role. Idempotent (matches by username, then email).
 *
 * @param {object} user      admissions User row ({ id, email, username })
 * @param {string} lmsRole   'CourseCoordinator' | 'FocalPerson'
 * @param {string} [tempPassword] plaintext temp password for a brand-new LMS account
 * @param {string} [department]   canonical admissions department name (stored on
 *                                the staff LmsStudentProfile for STRICT isolation)
 */
async function ensureLmsStaffUser(user, lmsRole, tempPassword, department) {
  if (!user || !user.username) return null;
  const username = String(user.username).toLowerCase().trim();
  const email = user.email ? String(user.email).toLowerCase().trim() : null;

  let lmsUser = await prisma.lmsUser.findUnique({ where: { username } }).catch(() => null);
  if (!lmsUser && email) {
    lmsUser = await prisma.lmsUser.findUnique({ where: { email } }).catch(() => null);
  }

  if (lmsUser) {
    // Keep the role in sync (a user reassigned to a different LMS staff role).
    if (lmsUser.role !== lmsRole) {
      lmsUser = await prisma.lmsUser.update({ where: { id: lmsUser.id }, data: { role: lmsRole, isActive: true } });
    }
    // CRITICAL: (re)bind this existing staff user to their department so
    // isolation works — this also repairs legacy staff created before this fix.
    await ensureStaffDepartmentProfile(lmsUser.id, department, lmsRole);
    return lmsUser;
  }

  // Create a fresh LMS staff account. Use the provided temp password when the
  // Super Admin created the account inline; otherwise generate a random one.
  const plain = tempPassword && String(tempPassword).length >= 6
    ? String(tempPassword)
    : `Lms${Math.random().toString(36).slice(2, 8)}!`;
  const passwordHash = await bcrypt.hash(plain, 10);
  try {
    const created = await prisma.lmsUser.create({
      data: {
        username,
        email: email || null,
        passwordHash,
        role: lmsRole,
        isActive: true,
        mustChangePassword: true,
      },
    });
    // CRITICAL: bind the brand-new staff user to their department.
    await ensureStaffDepartmentProfile(created.id, department, lmsRole);
    return created;
  } catch (e) {
    console.error('[admissionsSync] ensureLmsStaffUser failed:', e.message);
    return null;
  }
}

/**
 * Provision LMS accounts for a department's Course Coordinator & Focal Person.
 * @param {object} department  Prisma Department row (with courseCoordinator/focalPerson relations OR ids)
 * @param {object} [creds]     optional plaintext temp passwords: { courseCoordinator, focalPerson }
 */
async function syncStaffToLms(department, creds = {}) {
  if (!department) return;
  const results = {};
  // Resolve staff user rows (accept either included relations or raw ids).
  const ccUser = department.courseCoordinator
    || (department.courseCoordinatorId ? await prisma.user.findUnique({ where: { id: department.courseCoordinatorId } }) : null);
  const fpUser = department.focalPerson
    || (department.focalPersonId ? await prisma.user.findUnique({ where: { id: department.focalPersonId } }) : null);

  if (ccUser) {
    results.courseCoordinator = await ensureLmsStaffUser(ccUser, 'CourseCoordinator', creds.courseCoordinator, department.name);
  }
  if (fpUser) {
    results.focalPerson = await ensureLmsStaffUser(fpUser, 'FocalPerson', creds.focalPerson, department.name);
  }
  return results;
}

module.exports = {
  buildLiveStudentProfile, REQUIRED_DOCS,
  syncProgramToLms, syncDepartmentToLms, syncStaffToLms, ensureLmsStaffUser,
  ensureStaffDepartmentProfile,
};

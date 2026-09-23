// ============================================================
//  ENROLLMENT CREDENTIALS (Master Prompt Section 7 / 8 / 9)
//  ------------------------------------------------------------
//  Centralised roll number + registration number + LMS credential
//  generation, used by every enrollment path (admin.js, coordinator.js,
//  fee.js) so the rules are identical everywhere and impossible to drift.
//
//  Rules (updated per Master Prompt):
//   - Roll Number + Registration Number + LMS account are created for
//     EVERY program using that program's OWN configured numbering scheme.
//   - The student sequence number (serial) is IDENTICAL in both the Roll
//     Number and the Registration Number for the same student.
//   - The LMS username is the student's Roll Number (unchanged behaviour).
//   - Credentials are generated immediately on fee approval but remain
//     HIDDEN from the student until the Director publishes them
//     ("Show to Student") — see credentialsPublished on Enrollment.
// ============================================================

const { PrismaClient } = require('@prisma/client');
const { generateRollNumberDetailed } = require('./rollNumber');
const { generateRegistrationNumber, extractRollSerial } = require('./registrationNumber');
const { provisionLmsForStudent } = require('./lmsProvision');

const prisma = new PrismaClient();

// Kept for backward compatibility with any callers that still reference it.
function isAdcsProgram(program) {
  if (!program) return false;
  const code = String(program.code || '').toUpperCase();
  if (code === 'ADCS' || code === 'ADP-CS') return true;
  const name = String(program.name || '').toLowerCase();
  return name.includes('associate degree in computer science');
}

// Generate a random temporary LMS password: 8–12 chars, alphanumeric.
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const len = 8 + Math.floor(Math.random() * 5); // 8..12
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Confirm enrollment for one application's user.
 *
 * Generates Roll Number + Registration Number (shared serial) + LMS account
 * for ANY program using the program's own numbering scheme. Fully idempotent —
 * on re-runs existing numbers/credentials are preserved.
 *
 * @param {object} args
 * @param {object} args.application - includes program + admissionCycle + userId
 * @param {object} args.existingEnrollment - current Enrollment row or null
 * @returns {Promise<object>} the upserted Enrollment row
 */
async function confirmEnrollment({ application, existingEnrollment }) {
  let program = application.program;
  const cycle = application.admissionCycle;
  const userId = application.userId;

  // Ensure we have the full program row (with numbering config + department).
  if (program?.id && (program.instituteCode === undefined || program.department === undefined)) {
    program = await prisma.program.findUnique({
      where: { id: program.id },
      include: { department: true },
    }) || program;
  }

  // Preserve already-issued numbers on re-runs.
  const hasRoll = existingEnrollment?.rollNumber && existingEnrollment.rollNumber !== 'Pending';
  const hasReg = existingEnrollment?.registrationNumber && existingEnrollment.registrationNumber !== 'Pending';

  let rollNumber;
  let regNumber;
  let serial;

  if (hasRoll) {
    rollNumber = existingEnrollment.rollNumber;
    serial = extractRollSerial(rollNumber);
  } else {
    // Generate the roll number first; it decides the shared student sequence number.
    const detailed = await generateRollNumberDetailed({ program, cycle });
    rollNumber = detailed.rollNumber;
    serial = detailed.serial;

    // Advance the program's serial counter so the next student gets serial+1.
    // Guarded so a failure here never breaks enrollment.
    try {
      if (program?.id) {
        await prisma.program.update({
          where: { id: program.id },
          data: { regNextSerial: (serial || 100) + 1 },
        });
      }
    } catch (_) { /* non-fatal */ }
  }

  if (hasReg) {
    regNumber = existingEnrollment.registrationNumber;
  } else {
    regNumber = await generateRegistrationNumber({ cycle, program, rollNumber, serial });
  }

  // LMS username mirrors the roll number (unchanged behaviour).
  const lmsUsername = rollNumber;

  // Preserve an already-issued temp password / activation state on re-runs.
  const keepTemp = existingEnrollment && (existingEnrollment.lmsPassword || existingEnrollment.lmsActivated || existingEnrollment.lmsPasswordHash);
  const tempPassword = keepTemp ? existingEnrollment.lmsPassword : generateTempPassword();

  const data = {
    rollNumber,
    registrationNumber: regNumber,
    lmsUsername,
    feePaid: true,
    enrolledAt: existingEnrollment?.enrolledAt || new Date(),
    status: 'ENROLLED',
  };
  // Only (re)issue the temp password when one isn't already established.
  if (!keepTemp) {
    data.lmsPassword = tempPassword;
    data.lmsPasswordHash = null;
    data.lmsMustChangePassword = true;
    data.lmsActivated = false;
  }
  // NOTE: credentialsPublished is intentionally NOT set here — it stays at its
  // existing value (default false). The Director unlocks it via "Show to Student".

  const enrollment = await prisma.enrollment.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  // ----------------------------------------------------------------
  // Provision the dedicated LMS account and copy the student profile
  // into the LMS. Fully idempotent. Failures here must never break the
  // enrollment confirmation, so we guard with try/catch.
  // ----------------------------------------------------------------
  try {
    let programForLms = program;
    if (!programForLms?.department && programForLms?.id) {
      programForLms = await prisma.program.findUnique({
        where: { id: programForLms.id },
        include: { department: true },
      });
    }
    await provisionLmsForStudent({
      userId,
      enrollment,
      program: programForLms || program,
      cycle,
    });
  } catch (e) {
    console.error('[enrollmentCredentials] LMS provisioning failed (non-fatal):', e.message);
  }

  return enrollment;
}

module.exports = { confirmEnrollment, isAdcsProgram, generateTempPassword };

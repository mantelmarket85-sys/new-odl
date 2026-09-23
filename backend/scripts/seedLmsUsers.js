// ============================================================
//  SEED LMS USERS (demo accounts for all 7 roles)
//  ------------------------------------------------------------
//  Creates one demo LmsUser per staff role so every role's login +
//  forced-password-change flow can be exercised end to end.
//  Student accounts are created automatically on ADCS enrollment.
//
//  All demo accounts use temp password "Temp@1234" and require a
//  forced password change on first login (mustChangePassword=true).
//
//  Run: node scripts/seedLmsUsers.js
// ============================================================

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEMO_TEMP_PASSWORD = 'Temp@1234';

// username → role  (canonical LmsRole)
const STAFF = [
  { username: 'teacher01', role: 'Teacher' },
  { username: 'coordinator01', role: 'CourseCoordinator' },
  { username: 'focal01', role: 'FocalPerson' },
  { username: 'examctrl01', role: 'ExamController' },
  { username: 'qec01', role: 'QECCoordinator' },
  { username: 'provost01', role: 'Provost' },
];

(async () => {
  const passwordHash = await bcrypt.hash(DEMO_TEMP_PASSWORD, 12);

  for (const s of STAFF) {
    // Upsert so re-running always restores a known testable state
    // (temp password + forced password change).
    await prisma.lmsUser.upsert({
      where: { username: s.username },
      update: { passwordHash, role: s.role, isActive: true, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
      create: {
        username: s.username,
        passwordHash,
        role: s.role,
        isActive: true,
        mustChangePassword: true,
      },
    });
    console.log(`✓ Seeded ${s.username} (${s.role}) — temp password: ${DEMO_TEMP_PASSWORD}`);
  }

  // Reset the existing demo student to a known temp password for easy testing.
  const studentRoll = 'ADCS-F26-101';
  const studentUser = await prisma.lmsUser.findUnique({ where: { username: studentRoll } });
  if (studentUser) {
    await prisma.lmsUser.update({
      where: { id: studentUser.id },
      data: { passwordHash, mustChangePassword: true, isActive: true, failedLoginAttempts: 0, lockedUntil: null },
    });
    // Reflect the temp password on the admissions transition card too.
    await prisma.enrollment.updateMany({
      where: { rollNumber: studentRoll },
      data: { lmsPassword: DEMO_TEMP_PASSWORD, lmsMustChangePassword: true, lmsActivated: false, lmsPasswordChanged: false },
    });
    console.log(`✓ Reset student ${studentRoll} — temp password: ${DEMO_TEMP_PASSWORD}`);
  }

  console.log('\nDone seeding LMS demo users.');
  await prisma.$disconnect();
})().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});

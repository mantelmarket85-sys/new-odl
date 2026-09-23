// ============================================================
//  BACKFILL LMS ACCOUNTS
//  ------------------------------------------------------------
//  Provisions LmsUser + LmsStudentProfile for ADCS students who
//  were already ENROLLED before the LmsUser system existed.
//  Idempotent — safe to run multiple times.
//
//  Run: node scripts/backfillLmsAccounts.js
// ============================================================

const { PrismaClient } = require('@prisma/client');
const { provisionLmsForStudent } = require('../src/utils/lmsProvision');
const { isAdcsProgram } = require('../src/utils/enrollmentCredentials');

const prisma = new PrismaClient();

(async () => {
  const enrollments = await prisma.enrollment.findMany({
    where: { status: 'ENROLLED', rollNumber: { not: null } },
    include: {
      user: { include: { applications: { include: { program: { include: { department: true } }, admissionCycle: true } } } },
    },
  });

  let provisioned = 0;
  for (const enr of enrollments) {
    const app = (enr.user.applications || []).find((a) => isAdcsProgram(a.program)) || enr.user.applications?.[0];
    if (!app) continue;
    if (!isAdcsProgram(app.program)) continue;

    const result = await provisionLmsForStudent({
      userId: enr.userId,
      enrollment: enr,
      program: app.program,
      cycle: app.admissionCycle,
    });
    if (result) {
      provisioned++;
      console.log(`✓ Provisioned LMS account for ${enr.rollNumber} (lmsUserId=${result.lmsUser.id})`);
    }
  }

  console.log(`\nDone. Provisioned/refreshed ${provisioned} LMS account(s).`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error('Backfill failed:', e);
  process.exit(1);
});

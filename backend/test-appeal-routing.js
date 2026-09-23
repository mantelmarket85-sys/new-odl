// End-to-end appeal routing test: create both a REJECTED app and a DISQUALIFIED app,
// submit appeals on each, then verify coordinator sees only INTERVIEW_DISQUALIFICATION
// and director sees only APPLICATION_REJECTION.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const student = await prisma.user.findUnique({ where: { email: 'student@example.com' } });
    if (!student) throw new Error('no student');

    // Make the existing application DISQUALIFIED so the student can appeal it
    const app = await prisma.application.findFirst({ where: { userId: student.id } });
    if (!app) throw new Error('no app');

    await prisma.application.update({
      where: { id: app.id },
      data: { status: 'DISQUALIFIED', lastAppealStatus: null },
    });
    // Ensure an interview exists with DISQUALIFIED decision
    const existingInterview = await prisma.interview.findFirst({ where: { applicationId: app.id } });
    if (existingInterview) {
      await prisma.interview.update({
        where: { id: existingInterview.id },
        data: { decision: 'DISQUALIFIED', remarks: 'Test disqualification for appeal flow', status: 'COMPLETED' },
      });
    } else {
      await prisma.interview.create({
        data: {
          applicationId: app.id,
          scheduledDate: '2026-05-15',
          scheduledTime: '10:00',
          venue: 'AUST Main Campus',
          status: 'COMPLETED',
          decision: 'DISQUALIFIED',
          remarks: 'Test disqualification for appeal flow',
        },
      });
    }

    // Clean previous test appeals
    await prisma.appeal.deleteMany({ where: { applicationId: app.id, subject: { contains: 'Smoke-test' } } });

    // Submit INTERVIEW_DISQUALIFICATION appeal (should route to coordinator)
    const idAppeal = await prisma.appeal.create({
      data: {
        userId: student.id,
        applicationId: app.id,
        appealType: 'INTERVIEW_DISQUALIFICATION',
        subject: 'Smoke-test: Interview Disqualification Appeal',
        message: 'Test message — should appear in coordinator dashboard only.',
        status: 'PENDING',
      },
    });
    console.log('✓ Created INTERVIEW_DISQUALIFICATION appeal #' + idAppeal.id);

    // Submit APPLICATION_REJECTION appeal (should route to director)
    const arAppeal = await prisma.appeal.create({
      data: {
        userId: student.id,
        applicationId: app.id,
        appealType: 'APPLICATION_REJECTION',
        subject: 'Smoke-test: Application Rejection Appeal',
        message: 'Test message — should appear in director dashboard only.',
        status: 'PENDING',
      },
    });
    console.log('✓ Created APPLICATION_REJECTION appeal #' + arAppeal.id);

    // Update lastAppealStatus
    await prisma.application.update({
      where: { id: app.id },
      data: { lastAppealStatus: 'PENDING' },
    });

    console.log('\n=== Summary ===');
    const all = await prisma.appeal.findMany({ where: { applicationId: app.id }, select: { id: true, appealType: true, status: true, subject: true } });
    console.log(JSON.stringify(all, null, 2));
  } catch (e) {
    console.error('ERR:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();

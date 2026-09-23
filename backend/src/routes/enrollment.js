const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  authenticate,
  requireAdmin,
  requireAdminOrCoordinator,
  attachCoordinatorScope,
  coordinatorProgramFilter,
} = require('../middleware/auth');
const { notify } = require('../utils/notify');
const { sendEnrollmentConfirmedEmail } = require('../utils/email');

const router = express.Router();
const prisma = new PrismaClient();

// ------------------------------------------------------------
// Publish (reveal) the generated credentials for a set of enrolled users.
// Flips credentialsPublished=true, notifies the student, and sends the
// enrollment-confirmed email (with the credentials) — deferred from the
// fee-approval step so credentials stay hidden until "Show to Student".
// Returns the number of enrollments published.
// ------------------------------------------------------------
async function publishCredentialsForUserIds(userIds) {
  if (!userIds.length) return 0;
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: { in: userIds }, status: 'ENROLLED' },
  });
  let published = 0;
  for (const enr of enrollments) {
    // Only publish rows that actually have generated credentials.
    if (!enr.rollNumber || !enr.registrationNumber) continue;
    if (!enr.credentialsPublished) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.enrollment.update({
        where: { id: enr.id },
        data: { credentialsPublished: true, credentialsPublishedAt: new Date() },
      });
    }
    // Resolve program name for messaging.
    // eslint-disable-next-line no-await-in-loop
    const app = await prisma.application.findFirst({
      where: { userId: enr.userId, status: 'ENROLLED' },
      include: { program: true },
      orderBy: { id: 'desc' },
    });
    const programName = app?.program?.name || 'your program';
    // eslint-disable-next-line no-await-in-loop
    await notify(enr.userId, '🎉 Enrollment Published — Credentials Available',
      `Congratulations! You are successfully enrolled in ${programName}. Your Registration Number, Roll Number and LMS credentials are now available in your dashboard. You can log into the LMS using these credentials.`).catch(() => {});
    try {
      // eslint-disable-next-line no-await-in-loop
      const userRow = await prisma.user.findUnique({
        where: { id: enr.userId },
        select: { email: true, emailNotifications: true },
      });
      if (userRow?.emailNotifications && userRow?.email) {
        sendEnrollmentConfirmedEmail(
          userRow.email, programName,
          enr.rollNumber, enr.registrationNumber, enr.lmsUsername,
        ).catch(() => {});
      }
    } catch (_) { /* non-fatal */ }
    published += 1;
  }
  return published;
}

// ------------------------------------------------------------
// Resolve the set of enrolled userIds for a given program / department.
// A user is "enrolled" for a program if they have an Application with
// status ENROLLED for that program (the Enrollment row has no programId).
// ------------------------------------------------------------
async function enrolledUserIdsForProgram(programId) {
  const apps = await prisma.application.findMany({
    where: { programId: Number(programId), status: 'ENROLLED' },
    select: { userId: true },
  });
  return [...new Set(apps.map((a) => a.userId))];
}

async function enrolledUserIdsForDepartment(departmentId) {
  const programs = await prisma.program.findMany({
    where: { departmentId: Number(departmentId) },
    select: { id: true },
  });
  const programIds = programs.map((p) => p.id);
  if (!programIds.length) return [];
  const apps = await prisma.application.findMany({
    where: { programId: { in: programIds }, status: 'ENROLLED' },
    select: { userId: true },
  });
  return [...new Set(apps.map((a) => a.userId))];
}

// ------------------------------------------------------------
// SHOW TO STUDENT — publish (reveal) generated credentials.
// Master Prompt Section 8: available at Individual Student, Program and
// Department level. Only Director Admissions / Super Admin (requireAdmin).
// The Reg#, Roll#, LMS account/username/password were already auto-generated
// on fee approval; publishing simply reveals them to the student.
// ------------------------------------------------------------

// PUT /api/enrollment/publish/user/:userId — Individual Student level
router.put('/publish/user/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: 'Invalid userId' });
    const published = await publishCredentialsForUserIds([userId]);
    if (published === 0) {
      return res.status(400).json({
        error: 'No publishable enrollment found for this student (credentials may not be generated yet).',
        published,
      });
    }
    res.json({ success: true, published, message: 'Credentials published to student.' });
  } catch (error) {
    console.error('Publish credentials (user) error:', error);
    res.status(500).json({ error: 'Failed to publish credentials' });
  }
});

// PUT /api/enrollment/publish/program/:programId — Entire Program level
router.put('/publish/program/:programId', authenticate, requireAdmin, async (req, res) => {
  try {
    const programId = Number(req.params.programId);
    if (!programId) return res.status(400).json({ error: 'Invalid programId' });
    const userIds = await enrolledUserIdsForProgram(programId);
    const published = await publishCredentialsForUserIds(userIds);
    res.json({
      success: true,
      published,
      totalEnrolled: userIds.length,
      message: `Credentials published for ${published} student(s) in this program.`,
    });
  } catch (error) {
    console.error('Publish credentials (program) error:', error);
    res.status(500).json({ error: 'Failed to publish credentials for program' });
  }
});

// PUT /api/enrollment/publish/department/:departmentId — Entire Department level
router.put('/publish/department/:departmentId', authenticate, requireAdmin, async (req, res) => {
  try {
    const departmentId = Number(req.params.departmentId);
    if (!departmentId) return res.status(400).json({ error: 'Invalid departmentId' });
    const userIds = await enrolledUserIdsForDepartment(departmentId);
    const published = await publishCredentialsForUserIds(userIds);
    res.json({
      success: true,
      published,
      totalEnrolled: userIds.length,
      message: `Credentials published for ${published} student(s) in this department.`,
    });
  } catch (error) {
    console.error('Publish credentials (department) error:', error);
    res.status(500).json({ error: 'Failed to publish credentials for department' });
  }
});

// GET /api/enrollment/my — student's own enrollment + roll/registration/lms username
// Per updated spec: After enrollment confirmation, students MUST see Roll Number,
// Registration Number, and LMS Username on dashboard/profile/enrollment section.
router.get('/my', authenticate, async (req, res) => {
  try {
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId: req.user.id },
    });

    if (!enrollment) {
      return res.json({ enrollment: null });
    }

    // Credentials exist on the row once fee is approved, but they are only
    // revealed to the student after the Director publishes them
    // ("Show to Student"). Until then the student sees a "Pending" state.
    const hasCredentials = !!(enrollment.lmsUsername && enrollment.rollNumber);
    const published = !!enrollment.credentialsPublished;

    const safe = {
      id: enrollment.id,
      userId: enrollment.userId,
      // True once numbers/LMS account have been generated (fee approved).
      hasCredentials,
      // Backward-compat flag used by older frontend code paths.
      isAdcs: hasCredentials,
      // Whether the Director has published (shown) the credentials.
      credentialsPublished: published,
      // Only expose the actual values once published; otherwise null → the
      // student portal shows "Pending".
      rollNumber: published ? (enrollment.rollNumber || null) : null,
      registrationNumber: published ? (enrollment.registrationNumber || null) : null,
      lmsUsername: published ? (enrollment.lmsUsername || null) : null,
      // The plain temporary LMS password is returned ONLY after publishing AND
      // while the student has not yet completed the forced first LMS login.
      // Additional Fixes §8 — the temporary password is shown ONCE, before the
      // student's first LMS login / password change. After lmsActivated or
      // lmsPasswordChanged flips true it is NEVER displayed again (and the
      // stored plaintext is cleared to null on password change anyway).
      lmsTempPassword:
        published
        && enrollment.lmsMustChangePassword
        && !enrollment.lmsActivated
        && !enrollment.lmsPasswordChanged
          ? enrollment.lmsPassword || null
          : null,
      lmsMustChangePassword: enrollment.lmsMustChangePassword,
      lmsActivated: enrollment.lmsActivated,
      lmsPasswordChanged: !!enrollment.lmsPasswordChanged,
      // (Master Prompt §13) Once the Director has PUBLISHED the credentials they
      // remain visible PERMANENTLY. The card must NOT revert to "Pending" after
      // the student logs into the LMS. Only the temporary password is hidden
      // after the first LMS login / password change (handled by lmsTempPassword
      // above). Registration Number, Roll Number and LMS Username stay visible.
      showCredentialsCard: published && hasCredentials,
      enrolledAt: enrollment.enrolledAt,
      feePaid: enrollment.feePaid,
      status: enrollment.status,
      createdAt: enrollment.createdAt,
      updatedAt: enrollment.updatedAt,
    };

    res.json({ enrollment: safe });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch enrollment' });
  }
});

// GET /api/enrollment/all — admin/coordinator view all enrollments
router.get('/all', authenticate, requireAdminOrCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const applications = await prisma.application.findMany({
      where: { status: { in: ['FEE_APPROVED', 'ENROLLED', 'FEE_PAID'] }, ...coordinatorProgramFilter(req) },
      include: {
        program: { include: { department: true } },
        admissionCycle: true,
        user: {
          select: {
            id: true, email: true, username: true,
            profile: true,
            educations: true,
            documents: true,
            enrollment: true,
          },
        },
        meritEntry: true,
        feePayment: true,
      },
      orderBy: { submittedAt: 'desc' },
    });
    res.json({ applications });
  } catch (error) {
    console.error('Get enrollment list error:', error);
    res.status(500).json({ error: 'Failed to fetch enrollment list' });
  }
});

module.exports = router;

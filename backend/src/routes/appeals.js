const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  authenticate,
  requireStudent,
  requireAdmin,
  requireCoordinator,
  attachCoordinatorScope,
  coordinatorProgramFilter,
  coordinatorCanAccessProgram,
} = require('../middleware/auth');
const { uploadReceipt } = require('../middleware/upload');
const { notify } = require('../utils/notify');
const {
  sendAppealSubmittedEmail,
  sendAppealDecisionEmail,
} = require('../utils/email');

const router = express.Router();
const prisma = new PrismaClient();

async function logStatus(applicationId, userId, status, remarks, actorRole) {
  try {
    await prisma.statusEvent.create({
      data: { applicationId, userId, status, remarks: remarks || null, actorRole: actorRole || null },
    });
  } catch (e) { /* non-fatal */ }
}

// GET /api/appeals
// Routing rule:
//   • INTERVIEW_DISQUALIFICATION appeals → Coordinator queue
//   • APPLICATION_REJECTION / FEE_REJECTION / GENERAL → Director queue
// Coordinators only see interview appeals; Director sees the rest.
router.get('/', authenticate, attachCoordinatorScope, async (req, res) => {
  try {
    if (req.user.role === 'student') {
      const appeals = await prisma.appeal.findMany({
        where: { userId: req.user.id },
        include: { application: { include: { program: true, interview: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ appeals });
    }

    // Director / Coordinator — filter by appeal type
    const { status } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = status;

    if (req.user.role === 'coordinator') {
      where.appealType = 'INTERVIEW_DISQUALIFICATION';
      // Department scoping: only appeals for applications in the coordinator's programs.
      where.application = { is: coordinatorProgramFilter(req) };
    } else if (req.user.role === 'director_admissions' || req.user.role === 'admin' || req.user.role === 'super_admin') {
      // Director / Super Admin sees everything EXCEPT interview disqualification appeals (those go to coordinator)
      where.appealType = { not: 'INTERVIEW_DISQUALIFICATION' };
    }

    const appeals = await prisma.appeal.findMany({
      where,
      include: {
        application: { include: { program: true, interview: true } },
        user: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true, cnic: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ appeals });
  } catch (error) {
    console.error('Get appeals error:', error);
    res.status(500).json({ error: 'Failed to fetch appeals' });
  }
});

// GET /api/appeals/my-applications
router.get('/my-applications', authenticate, requireStudent, async (req, res) => {
  try {
    const applications = await prisma.application.findMany({
      where: { userId: req.user.id },
      include: { program: true },
      orderBy: { submittedAt: 'desc' },
    });
    res.json({ applications });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// ============================================================
// POST /api/appeals — student submits appeal on EXISTING application
// Appeal types:
//   APPLICATION_REJECTION       (rejected by Director)
//   INTERVIEW_DISQUALIFICATION  (disqualified by Coordinator)
//   FEE_REJECTION
//   GENERAL
// ============================================================
router.post('/', authenticate, requireStudent, uploadReceipt.single('proof'), async (req, res) => {
  try {
    const { applicationId, appealType, subject, message } = req.body;

    if (!appealType || !subject || !message) {
      return res.status(400).json({ error: 'Appeal type, subject, and message are required' });
    }

    const validTypes = ['APPLICATION_REJECTION', 'INTERVIEW_DISQUALIFICATION', 'FEE_REJECTION', 'GENERAL'];
    if (!validTypes.includes(appealType)) {
      return res.status(400).json({ error: 'Invalid appeal type' });
    }

    let appId = applicationId ? parseInt(applicationId) : null;

    // Verify ownership
    let app = null;
    if (appId) {
      app = await prisma.application.findFirst({ where: { id: appId, userId: req.user.id } });
      if (!app) return res.status(404).json({ error: 'Application not found' });
    }

    let proofPath = null;
    if (req.file) {
      proofPath = `/uploads/receipts/${req.file.filename}`;
      await prisma.document.create({
        data: {
          userId: req.user.id,
          type: 'appeal_proof',
          filePath: proofPath,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
        },
      });
    }

    const appeal = await prisma.appeal.create({
      data: {
        userId: req.user.id,
        applicationId: appId,
        appealType,
        subject,
        message,
        proofPath,
        status: 'PENDING',
      },
      include: { application: { include: { program: true } } },
    });

    // Update application snapshot fields & status to APPEAL_SUBMITTED
    if (app) {
      await prisma.application.update({
        where: { id: app.id },
        data: {
          status: 'APPEAL_SUBMITTED',
          appealCount: { increment: 1 },
          lastAppealStatus: 'PENDING',
        },
      });
      await logStatus(app.id, req.user.id, 'APPEAL_SUBMITTED', subject, 'student');
    }

    await notify({
      userId: req.user.id,
      title: 'Appeal Submitted',
      message: `Your appeal "${subject}" has been submitted and is under review.`,
      skipEmail: true,
    });

    // Dedicated appeal-submitted email
    try {
      const userRow = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { email: true, emailNotifications: true },
      });
      if (userRow?.emailNotifications && userRow?.email) {
        sendAppealSubmittedEmail(userRow.email, appealType, appId || 0).catch(() => {});
      }
    } catch (_) {}

    res.status(201).json({ message: 'Appeal submitted successfully', appeal });
  } catch (error) {
    console.error('Submit appeal error:', error);
    res.status(500).json({ error: 'Failed to submit appeal' });
  }
});

// ============================================================
// PUT /api/appeals/:id/decision — director OR coordinator decides
// Body: status (ACCEPTED|REJECTED|APPROVED for back-compat), response
// ============================================================
async function decideAppeal(req, res) {
  try {
    // Accept BOTH `status` and `decision` field names from clients
    // (the frontend coordinator dashboard sends `decision`; the director
    // dashboard historically sent `status`). This avoids the
    // "Status must be ACCEPTED or REJECTED" error caused by mismatched keys.
    const rawDecision = req.body.status || req.body.decision || req.body.action;
    const response = req.body.response || req.body.adminResponse || req.body.remarks;
    const upper = (rawDecision || '').toString().trim().toUpperCase();
    // Accept new (ACCEPTED/REJECTED) and legacy (APPROVED/REJECTED) and shorthand (ACCEPT/REJECT)
    const normalised = (upper === 'APPROVED' || upper === 'ACCEPT') ? 'ACCEPTED'
                     : (upper === 'REJECT') ? 'REJECTED'
                     : upper;
    if (!['ACCEPTED', 'REJECTED'].includes(normalised)) {
      return res.status(400).json({
        error: 'Decision must be ACCEPTED or REJECTED',
        received: rawDecision || null,
      });
    }
    if (normalised === 'REJECTED' && (!response || !String(response).trim())) {
      return res.status(400).json({
        error: 'A response/reason is required when rejecting an appeal (the student will see it).',
      });
    }

    const appeal = await prisma.appeal.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { application: { include: { program: true, interview: true } } },
    });
    if (!appeal) return res.status(404).json({ error: 'Appeal not found' });

    // Role-based authorisation:
    //   • INTERVIEW_DISQUALIFICATION must be decided by Coordinator
    //   • All other appeal types must be decided by Director
    if (appeal.appealType === 'INTERVIEW_DISQUALIFICATION') {
      if (req.user.role !== 'coordinator') {
        return res.status(403).json({
          error: 'Interview-disqualification appeals must be reviewed by the Coordinator.',
        });
      }
      // Department scoping: a coordinator can only decide appeals in their department.
      if (!coordinatorCanAccessProgram(req, appeal.application?.programId)) {
        return res.status(403).json({
          error: 'Access denied. This appeal belongs to another department.',
        });
      }
    } else {
      if (req.user.role !== 'director_admissions' && req.user.role !== 'admin') {
        return res.status(403).json({
          error: 'Only the Director can decide this appeal type.',
        });
      }
    }

    const updated = await prisma.appeal.update({
      where: { id: parseInt(req.params.id) },
      data: {
        status: normalised,
        adminResponse: response || null,
        decidedBy: req.user.role,
        decidedAt: new Date(),
      },
    });

    // Apply effects based on appeal type
    if (appeal.applicationId) {
      const app = appeal.application;

      if (normalised === 'ACCEPTED') {
        if (appeal.appealType === 'APPLICATION_REJECTION') {
          await prisma.application.update({
            where: { id: app.id },
            data: {
              status: 'UNDER_REVIEW',
              lastAppealStatus: 'ACCEPTED',
              rejectionReason: null,
              adminRemarks: 'Appeal accepted — application restored for review',
            },
          });
          await logStatus(app.id, appeal.userId, 'APPEAL_ACCEPTED', response, req.user.role);
          await logStatus(app.id, appeal.userId, 'UNDER_REVIEW', 'Application restored after appeal', req.user.role);
        } else if (appeal.appealType === 'INTERVIEW_DISQUALIFICATION') {
          // Coordinator accepted — application stays under coordinator
          // Status moves to FORWARDED so the coordinator can schedule a retake interview
          // (existing interview history is PRESERVED — we do not delete it)
          await prisma.application.update({
            where: { id: app.id },
            data: {
              status: 'FORWARDED',
              lastAppealStatus: 'ACCEPTED',
              adminRemarks: 'Appeal accepted by coordinator — eligible for retake interview',
            },
          });
          await logStatus(app.id, appeal.userId, 'APPEAL_ACCEPTED', response, req.user.role);
          await logStatus(app.id, appeal.userId, 'FORWARDED',
            'Eligible for retake interview after appeal acceptance', 'coordinator');
        } else if (appeal.appealType === 'FEE_REJECTION') {
          await prisma.application.update({
            where: { id: app.id },
            data: { status: 'FEE_PENDING', lastAppealStatus: 'ACCEPTED' },
          });
          await prisma.feePayment.updateMany({
            where: { applicationId: app.id },
            data: { status: 'PENDING', adminRemarks: 'Appeal accepted — please re-upload receipt' },
          });
          await logStatus(app.id, appeal.userId, 'APPEAL_ACCEPTED', response, req.user.role);
        }
      } else {
        // REJECTED — keep application in its prior failed state but record outcome
        await prisma.application.update({
          where: { id: app.id },
          data: { lastAppealStatus: 'REJECTED' },
        });
        await logStatus(app.id, appeal.userId, 'APPEAL_REJECTED', response, req.user.role);
      }
    }

    // Build message — interview-appeal acceptance hints at retake
    let notifyMsg = `Your appeal "${appeal.subject}" has been ${normalised === 'ACCEPTED' ? 'accepted' : 'rejected'}.${response ? ' Response: ' + response : ''}`;
    if (normalised === 'ACCEPTED' && appeal.appealType === 'INTERVIEW_DISQUALIFICATION') {
      notifyMsg += ' The Coordinator will schedule a retake interview soon.';
    }
    await notify({
      userId: appeal.userId,
      title: `Appeal ${normalised}`,
      message: notifyMsg,
      skipEmail: true,
    });

    // Dedicated appeal-decision email
    try {
      const userRow = await prisma.user.findUnique({
        where: { id: appeal.userId },
        select: { email: true, emailNotifications: true },
      });
      if (userRow?.emailNotifications && userRow?.email) {
        sendAppealDecisionEmail(
          userRow.email,
          appeal.appealType,
          normalised,
          appeal.applicationId || 0,
          response,
        ).catch(() => {});
      }
    } catch (_) {}

    res.json({ message: 'Appeal decision recorded', appeal: updated });
  } catch (error) {
    console.error('Appeal decision error:', error);
    res.status(500).json({ error: 'Failed to update appeal decision' });
  }
}

// Either director or coordinator may decide
function requireDirectorOrCoordinator(req, res, next) {
  if (req.user && (req.user.role === 'director_admissions' || req.user.role === 'admin' || req.user.role === 'coordinator')) {
    return next();
  }
  return res.status(403).json({ error: 'Director or Coordinator access required' });
}

router.put('/:id/decision', authenticate, requireDirectorOrCoordinator, attachCoordinatorScope, decideAppeal);

module.exports = router;

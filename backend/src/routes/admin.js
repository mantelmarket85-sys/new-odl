const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { notify } = require('../utils/notify');
const { generateRollNumber } = require('../utils/rollNumber');
const { generateRegistrationNumber } = require('../utils/registrationNumber');
const { confirmEnrollment } = require('../utils/enrollmentCredentials');
const { computeMerit } = require('../utils/meritWeights');
const {
  sendApplicationForwardedEmail,
  sendApplicationRejectedEmail,
  sendFeeStatusEmail,
  sendEnrollmentConfirmedEmail,
} = require('../utils/email');

const router = express.Router();
const prisma = new PrismaClient();

// Common include — director sees FULL student data
const FULL_APP_INCLUDE = {
  // Additional Fixes §9 — include the program's department so the Director's
  // Application Management can group applications by Department → Program.
  program: { include: { department: true } },
  admissionCycle: true,
  interview: true,
  meritEntry: true,
  feePayment: true,
  appeals: { orderBy: { createdAt: 'desc' } },
  statusEvents: { orderBy: { createdAt: 'desc' } },
  user: {
    select: {
      id: true, email: true, username: true, role: true, createdAt: true,
      termsAccepted: true, termsAcceptedAt: true,
      privacyAccepted: true, privacyAcceptedAt: true,
      profile: true,
      educations: { include: { documents: true } },
      documents: true,
      enrollment: true,
      transactions: { orderBy: { createdAt: 'desc' } },
    },
  },
};

// Helper — log status event
async function logStatus(applicationId, userId, status, remarks, actorRole) {
  try {
    await prisma.statusEvent.create({
      data: { applicationId, userId, status, remarks: remarks || null, actorRole: actorRole || null },
    });
  } catch (e) { /* non-fatal */ }
}

// ============================================================
// GET /api/admin/stats
// ============================================================
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const [totalApps, submitted, underReview, forwarded, rejected, needInfo,
      totalStudents, interviewScheduled, interviewCompleted, qualified, disqualified,
      meritListed, feePending, feePaid, feeApproved, enrolled, resultAwaited,
      appealsPending, totalTxns, successTxns] = await Promise.all([
      prisma.application.count(),
      prisma.application.count({ where: { status: 'SUBMITTED' } }),
      prisma.application.count({ where: { status: 'UNDER_REVIEW' } }),
      prisma.application.count({ where: { status: 'FORWARDED' } }),
      prisma.application.count({ where: { status: 'REJECTED' } }),
      prisma.application.count({ where: { status: 'NEED_INFO' } }),
      prisma.user.count({ where: { role: 'student' } }),
      prisma.application.count({ where: { status: 'INTERVIEWED' } }),
      prisma.application.count({ where: { status: 'INTERVIEW_COMPLETED' } }),
      prisma.application.count({ where: { status: 'QUALIFIED' } }),
      prisma.application.count({ where: { status: 'DISQUALIFIED' } }),
      prisma.application.count({ where: { status: 'SELECTED' } }),
      prisma.application.count({ where: { status: 'FEE_PENDING' } }),
      prisma.application.count({ where: { status: 'FEE_PAID' } }),
      prisma.application.count({ where: { status: 'FEE_APPROVED' } }),
      prisma.application.count({ where: { status: 'ENROLLED' } }),
      prisma.application.count({ where: { OR: [{ status: 'RESULT_AWAITED' }, { resultStatus: 'Waiting' }] } }),
      prisma.appeal.count({ where: { status: 'PENDING' } }),
      prisma.transaction.count(),
      prisma.transaction.count({ where: { status: 'SUCCESS' } }),
    ]);

    res.json({
      stats: {
        totalApplications: totalApps, submitted, underReview, forwarded,
        rejected, needInfo, totalStudents, interviewScheduled, interviewCompleted,
        qualified, disqualified, meritListed, feePending, feePaid, feeApproved,
        enrolled, resultAwaited, appealsPending,
        totalTransactions: totalTxns, successfulTransactions: successTxns,
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================================
// GET /api/admin/dept-application-counts
// Phase 2 — Director dashboard: per-department card counts.
// Returns, for every department, the number of NEW (awaiting-forward)
// applications plus a total, so the Director can see at a glance which
// departments have applications waiting to be forwarded to a Coordinator.
// "New" = statuses that the Director has not yet forwarded/decided:
//   SUBMITTED, PENDING, UNDER_REVIEW, NEED_INFO, RESULT_AWAITED.
// ============================================================
const NEW_APP_STATUSES = ['SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'NEED_INFO', 'RESULT_AWAITED'];

router.get('/dept-application-counts', authenticate, requireAdmin, async (req, res) => {
  try {
    const cycleId = req.query.cycleId ? parseInt(req.query.cycleId) : null;
    const departments = await prisma.department.findMany({
      include: { programs: { select: { id: true, name: true, shortForm: true, code: true } } },
      orderBy: { name: 'asc' },
    });

    const results = [];
    for (const dept of departments) {
      const programIds = dept.programs.map((p) => p.id);
      const baseWhere = { programId: { in: programIds.length ? programIds : [-1] } };
      if (cycleId) baseWhere.admissionCycleId = cycleId;

      const [newCount, totalCount, forwardedCount, enrolledCount] = await Promise.all([
        prisma.application.count({ where: { ...baseWhere, status: { in: NEW_APP_STATUSES } } }),
        prisma.application.count({ where: baseWhere }),
        prisma.application.count({ where: { ...baseWhere, status: 'FORWARDED' } }),
        prisma.application.count({ where: { ...baseWhere, status: 'ENROLLED' } }),
      ]);

      results.push({
        departmentId: dept.id,
        departmentName: dept.name,
        programCount: dept.programs.length,
        newApplications: newCount,
        totalApplications: totalCount,
        forwarded: forwardedCount,
        enrolled: enrolledCount,
        hasCoordinator: !!dept.coordinatorId,
      });
    }

    const grandNew = results.reduce((s, r) => s + r.newApplications, 0);
    res.json({ departments: results, totalNewApplications: grandNew });
  } catch (error) {
    console.error('Admin dept-application-counts error:', error);
    res.status(500).json({ error: 'Failed to fetch department application counts' });
  }
});

// ============================================================
// PUT /api/admin/applications/forward-department
// Phase 2 — Director dashboard "Forward All" for a department: forwards
// every NEW application in the given department to its Coordinator.
// ============================================================
router.put('/applications/forward-department', authenticate, requireAdmin, async (req, res) => {
  try {
    const departmentId = parseInt(req.body.departmentId);
    const cycleId = req.body.cycleId ? parseInt(req.body.cycleId) : null;
    if (!departmentId) return res.status(400).json({ error: 'departmentId is required' });

    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      include: { programs: { select: { id: true } } },
    });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const programIds = dept.programs.map((p) => p.id);
    const where = {
      programId: { in: programIds.length ? programIds : [-1] },
      status: { in: NEW_APP_STATUSES },
    };
    if (cycleId) where.admissionCycleId = cycleId;

    const apps = await prisma.application.findMany({ where, include: { program: true } });
    if (!apps.length) return res.json({ message: 'No new applications to forward in this department.', count: 0 });

    await prisma.application.updateMany({ where, data: { status: 'FORWARDED' } });

    for (const app of apps) {
      try {
        await logStatus(app.id, app.userId, 'FORWARDED', `Forwarded by Director (department: ${dept.name})`, 'director_admissions');
        await notify({
          userId: app.userId,
          title: 'Application Forwarded',
          message: `Your application for ${app.program?.name || 'your program'} has been approved by the Director and forwarded to the Department Coordinator.`,
          skipEmail: true,
        });
      } catch (e) { /* best-effort per-app notify */ }
    }

    res.json({ message: `${apps.length} application(s) forwarded to the ${dept.name} coordinator.`, count: apps.length });
  } catch (error) {
    console.error('Admin forward-department error:', error);
    res.status(500).json({ error: 'Failed to forward department applications' });
  }
});

// GET /api/admin/applications — full student data
// Phase 2 performance: optional pagination. When the client passes ?page= and
// ?pageSize=, the response is paginated (and includes pagination metadata).
// When omitted, behaviour is unchanged (full list) for backward compatibility.
router.get('/applications', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = status;

    const applications = await prisma.application.findMany({
      where,
      include: FULL_APP_INCLUDE,
      orderBy: { submittedAt: 'desc' },
    });

    let filtered = applications;
    if (search) {
      const s = search.toLowerCase();
      filtered = applications.filter(app => {
        const p = app.user.profile;
        return (app.user.email || '').toLowerCase().includes(s) ||
          (app.user.username || '').toLowerCase().includes(s) ||
          (p?.firstName && p.firstName.toLowerCase().includes(s)) ||
          (p?.lastName && p.lastName.toLowerCase().includes(s)) ||
          (p?.cnic && p.cnic.includes(s)) ||
          (app.user.enrollment?.rollNumber || '').toLowerCase().includes(s) ||
          (app.user.enrollment?.registrationNumber || '').toLowerCase().includes(s);
      });
    }

    // Optional pagination (only when explicitly requested by the client).
    const total = filtered.length;
    if (req.query.page || req.query.pageSize) {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 25));
      const start = (page - 1) * pageSize;
      const pageItems = filtered.slice(start, start + pageSize);
      return res.json({
        applications: pageItems,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    }

    res.json({ applications: filtered, total });
  } catch (error) {
    console.error('Admin get applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// GET /api/admin/applications/:id
router.get('/applications/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const application = await prisma.application.findUnique({
      where: { id: parseInt(req.params.id) },
      include: FULL_APP_INCLUDE,
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    res.json({ application });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch application details' });
  }
});

// ============================================================
// PUT /api/admin/applications/:id/decision — Director's decision
// Director has FULL OVERRIDE: any stage → any stage. Supported statuses:
//   FORWARDED, REJECTED, UNDER_REVIEW, NEED_INFO, RESULT_AWAITED,
//   QUALIFIED, DISQUALIFIED, SELECTED, FEE_PENDING, FEE_PAID,
//   FEE_APPROVED, ENROLLED, INTERVIEWED, INTERVIEW_COMPLETED, PENDING, SUBMITTED
// Rejection reason REQUIRED for REJECTED.
// Validates safe transitions, preserves history (statusEvent log),
// and synchronises related sub-records (interview, merit, enrollment).
// ============================================================
router.put('/applications/:id/decision', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks, rejectionReason } = req.body;

    // Director full-override status whitelist
    const validStatuses = [
      'PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'FORWARDED',
      'REJECTED', 'NEED_INFO', 'RESULT_AWAITED',
      'INTERVIEWED', 'INTERVIEW_COMPLETED',
      'QUALIFIED', 'DISQUALIFIED', 'SELECTED',
      'FEE_PENDING', 'FEE_PAID', 'FEE_APPROVED', 'ENROLLED',
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (status === 'REJECTED') {
      const reason = rejectionReason || remarks;
      if (!reason || !String(reason).trim() || String(reason).trim().length < 5) {
        return res.status(400).json({ error: 'A clear rejection reason (min 5 characters) is required when rejecting an application' });
      }
    }

    const application = await prisma.application.findUnique({
      where: { id: parseInt(id) },
      include: { program: true, interview: true, meritEntry: true },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const previousStatus = application.status;

    // Build update payload
    const updateData = {
      status,
      adminRemarks: remarks || null,
    };

    if (status === 'REJECTED') {
      updateData.rejectionReason = rejectionReason || remarks;
    } else {
      // Director re-accepts a previously rejected application — clear the
      // old rejection reason so the student no longer sees it.
      if (previousStatus === 'REJECTED') {
        updateData.rejectionReason = null;
      }
    }

    const updated = await prisma.application.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: { program: true },
    });

    // ======================================================================
    // Sync related sub-records when Director overrides downstream stages.
    // The goal is to AVOID stale data so that all dashboards (student,
    // coordinator, director) and merit lists reflect the override instantly.
    // ======================================================================

    // 1) DISQUALIFIED → re-accepting: clear merit + reset interview decision
    //    so the coordinator can evaluate again without stale "Disqualified" flag.
    if (previousStatus === 'DISQUALIFIED' && status !== 'DISQUALIFIED') {
      if (application.interview) {
        await prisma.interview.update({
          where: { id: application.interview.id },
          data: {
            decision: 'PENDING',
            // If returning to FORWARDED/INTERVIEWED, also reset interview status
            // so coordinator can re-schedule / re-evaluate the same record.
            ...(status === 'FORWARDED' || status === 'UNDER_REVIEW'
              ? { status: 'SCHEDULED', marks: null, remarks: 'Reset by Director override' }
              : {}),
          },
        }).catch(() => {});
      }
    }

    // 2) Director forces DISQUALIFIED — strip merit eligibility
    if (status === 'DISQUALIFIED') {
      await prisma.meritEntry.deleteMany({ where: { applicationId: application.id } }).catch(() => {});
      // Also mark interview as DISQUALIFIED-decided if one exists
      if (application.interview) {
        await prisma.interview.update({
          where: { id: application.interview.id },
          data: { decision: 'DISQUALIFIED', status: 'COMPLETED' },
        }).catch(() => {});
      }
    }

    // 3) Director sends application BACK TO COORDINATOR (FORWARDED) →
    //    reset interview so coordinator can schedule/evaluate again.
    //    This is the "Re-forward to Coordinator" workflow.
    if (status === 'FORWARDED' && previousStatus !== 'FORWARDED') {
      if (application.interview) {
        await prisma.interview.update({
          where: { id: application.interview.id },
          data: {
            decision: 'PENDING',
            status: 'SCHEDULED',
            marks: null,
            remarks: 'Reset by Director — re-forwarded to coordinator',
          },
        }).catch(() => {});
      }
      // Clear stale merit so coordinator can rebuild it after re-evaluation
      await prisma.meritEntry.deleteMany({ where: { applicationId: application.id } }).catch(() => {});
    }

    // 4) Director forces SELECTED (Force Merit-List) — ensure a finalized merit
    //    entry exists so the student appears on the merit list immediately.
    if (status === 'SELECTED') {
      const existingMerit = await prisma.meritEntry.findUnique({
        where: { applicationId: application.id },
      }).catch(() => null);
      if (!existingMerit) {
        // Build a minimal merit entry from current educations + interview marks
        const educations = await prisma.education.findMany({ where: { userId: application.userId } });
        const matric = educations.find(e => e.level === '10years');
        const fsc = educations.find(e => e.level === '12years') || educations.find(e => e.level === '11years');
        const matricPct = matric && matric.totalMarks > 0 ? (matric.marks / matric.totalMarks) * 100 : 0;
        let fscPct = 0;
        if (fsc) {
          const m = fsc.marks ?? fsc.partOneMarks;
          const t = fsc.totalMarks ?? fsc.partOneTotalMarks;
          if (m && t > 0) fscPct = (m / t) * 100;
        }
        const interviewMarks = application.interview?.marks || 0;
        const cycle = await prisma.admissionCycle.findUnique({ where: { id: application.admissionCycleId } });
        const program = await prisma.program.findUnique({ where: { id: application.programId } }).catch(() => null);
        // Per-program merit criteria (Additional Fixes §3).
        const { matricWeighted, fscWeighted, interviewWeighted, totalMerit } = computeMerit({
          matricPercent: matricPct, fscPercent: fscPct, interviewMarks, program, cycle,
        });
        await prisma.meritEntry.create({
          data: {
            applicationId: application.id,
            userId: application.userId,
            matricPercent: matricPct,
            fscPercent: fscPct,
            interviewMarks,
            matricWeighted, fscWeighted, interviewWeighted, totalMerit,
            isFinalized: true,
          },
        }).catch(() => {});
      } else if (!existingMerit.isFinalized) {
        await prisma.meritEntry.update({
          where: { applicationId: application.id },
          data: { isFinalized: true },
        }).catch(() => {});
      }
    }

    // 5) Director forces ENROLLED override — ensure enrollment row exists with PENDING numbers
    if (status === 'ENROLLED') {
      const existing = await prisma.enrollment.findUnique({ where: { userId: application.userId } });
      if (!existing) {
        await prisma.enrollment.create({
          data: {
            userId: application.userId,
            rollNumber: 'Pending',
            registrationNumber: 'Pending',
            feePaid: true,
            enrolledAt: new Date(),
            status: 'ENROLLED',
          },
        }).catch(() => {});
      } else if (existing.status !== 'ENROLLED') {
        await prisma.enrollment.update({
          where: { userId: application.userId },
          data: { status: 'ENROLLED', enrolledAt: existing.enrolledAt || new Date() },
        }).catch(() => {});
      }
    }

    // 6) Director moves to REJECTED from ENROLLED / SELECTED — also revert
    //    the enrollment so the student no longer appears as enrolled.
    if (status === 'REJECTED' && (previousStatus === 'ENROLLED' || previousStatus === 'SELECTED')) {
      await prisma.enrollment.updateMany({
        where: { userId: application.userId },
        data: { status: 'PENDING', feePaid: false },
      }).catch(() => {});
      await prisma.meritEntry.deleteMany({ where: { applicationId: application.id } }).catch(() => {});
    }

    // Audit log (history preserved)
    await logStatus(
      updated.id,
      application.userId,
      status,
      `Director override: ${previousStatus} → ${status}${remarks || rejectionReason ? ` · ${remarks || rejectionReason}` : ''}`,
      'director_admissions'
    );

    const statusMessages = {
      UNDER_REVIEW:        `Your application for ${application.program.name} is now under Director's review.`,
      FORWARDED:           `Your application for ${application.program.name} has been approved by the Director and forwarded to the Department Coordinator.`,
      REJECTED:            `Your application for ${application.program.name} has been rejected by the Director. Reason: ${rejectionReason || remarks}. You may submit an appeal from your dashboard.`,
      NEED_INFO:           `Additional information is required for your ${application.program.name} application.${remarks ? ' Details: ' + remarks : ''}`,
      RESULT_AWAITED:      `Your application for ${application.program.name} is on hold pending final FSc result.${remarks ? ' Note: ' + remarks : ''}`,
      INTERVIEWED:         `Director has set your application to Interview Scheduled.${remarks ? ' Note: ' + remarks : ''}`,
      INTERVIEW_COMPLETED: `Director has marked your interview as completed.${remarks ? ' Note: ' + remarks : ''}`,
      QUALIFIED:           `Director has qualified your application for ${application.program.name}.${remarks ? ' Note: ' + remarks : ''}`,
      DISQUALIFIED:        `Director has disqualified your application for ${application.program.name}.${remarks ? ' Reason: ' + remarks : ''} You may submit an appeal.`,
      SELECTED:            `You have been merit-listed for ${application.program.name} by Director override.`,
      FEE_PENDING:         `Director has set your fee status to pending.${remarks ? ' Note: ' + remarks : ''}`,
      FEE_PAID:            `Director has marked your fee as paid (under verification).`,
      FEE_APPROVED:        `Director has approved your fee payment.`,
      ENROLLED:            `Director has enrolled you in ${application.program.name}. Welcome to AUST!`,
    };

    // If re-accepting from REJECTED, prepend a clarifying line
    let msg = statusMessages[status] || `Your application status has been updated to ${status.replace(/_/g, ' ')}.`;
    if (previousStatus === 'REJECTED' && status !== 'REJECTED') {
      msg = `Good news — the Director has reopened your previously rejected application. ${msg}`;
    }

    if (msg) {
      await notify({
        userId: application.userId,
        title: `Application ${status === 'NEED_INFO' ? 'Needs Update' : status.replace(/_/g, ' ')}`,
        message: msg,
        skipEmail: status === 'REJECTED' || status === 'FORWARDED', // dedicated emails sent below
      });
    }

    // Dedicated email templates for important statuses
    try {
      const userRow = await prisma.user.findUnique({
        where: { id: application.userId },
        select: { email: true, emailNotifications: true },
      });
      if (userRow?.emailNotifications && userRow?.email) {
        if (status === 'REJECTED') {
          sendApplicationRejectedEmail(userRow.email, application.program.name, application.id, rejectionReason || remarks).catch(() => {});
        } else if (status === 'FORWARDED') {
          sendApplicationForwardedEmail(userRow.email, application.program.name, application.id).catch(() => {});
        }
      }
    } catch (_) {}

    res.json({ message: 'Decision recorded', application: updated, previousStatus });
  } catch (error) {
    console.error('Admin decision error:', error);
    res.status(500).json({ error: 'Failed to update decision' });
  }
});

// ============================================================
// PUT /api/admin/applications/:id/reopen — Director re-accepts/reopens an application
// Convenience shortcut for moving a REJECTED / DISQUALIFIED / NEED_INFO
// application back into the review pipeline. Body: { targetStatus?, remarks }
// ============================================================
router.put('/applications/:id/reopen', authenticate, requireAdmin, async (req, res) => {
  try {
    const { targetStatus, remarks } = req.body;
    const allowed = ['UNDER_REVIEW', 'FORWARDED', 'INTERVIEWED', 'SELECTED', 'FEE_PENDING'];
    const next = allowed.includes(targetStatus) ? targetStatus : 'UNDER_REVIEW';

    const application = await prisma.application.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { program: true, interview: true },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const previousStatus = application.status;

    const updated = await prisma.application.update({
      where: { id: application.id },
      data: {
        status: next,
        rejectionReason: null,
        adminRemarks: remarks || 'Reopened by Director',
        lastAppealStatus: null, // clear stale appeal flag
      },
    });

    // Reset interview record if reopening into interview / forward stage so
    // the coordinator can schedule / re-evaluate cleanly.
    if (['INTERVIEWED', 'FORWARDED', 'UNDER_REVIEW'].includes(next) && application.interview) {
      await prisma.interview.update({
        where: { id: application.interview.id },
        data: {
          decision: 'PENDING',
          status: 'SCHEDULED',
          marks: null,
          remarks: 'Reset by Director — application reopened',
        },
      }).catch(() => {});
    }

    // If reopening from a downstream stage, clear stale merit so coordinator
    // can recompute it after re-evaluation.
    if (['UNDER_REVIEW', 'FORWARDED', 'INTERVIEWED'].includes(next)) {
      await prisma.meritEntry.deleteMany({
        where: { applicationId: application.id, isFinalized: false },
      }).catch(() => {});
    }

    // If reopening into FEE_PENDING, also reset enrollment to PENDING so that
    // the student is no longer treated as enrolled.
    if (next === 'FEE_PENDING') {
      await prisma.enrollment.updateMany({
        where: { userId: application.userId, status: 'ENROLLED' },
        data: { status: 'PENDING', feePaid: false },
      }).catch(() => {});
    }

    await logStatus(application.id, application.userId, next,
      `Director reopened application (was ${previousStatus}). ${remarks || ''}`,
      'director_admissions');

    await notify({
      userId: application.userId,
      title: 'Application Reopened',
      message: `The Director has reopened your application for ${application.program.name}. Current status: ${next.replace(/_/g, ' ')}.${remarks ? ' Note: ' + remarks : ''}`,
    });

    res.json({ message: 'Application reopened', application: updated, previousStatus });
  } catch (error) {
    console.error('Reopen application error:', error);
    res.status(500).json({ error: 'Failed to reopen application' });
  }
});

// PUT /api/admin/applications/forward-bulk
router.put('/applications/forward-bulk', authenticate, requireAdmin, async (req, res) => {
  try {
    const { applicationIds } = req.body;
    if (!applicationIds || applicationIds.length === 0) {
      return res.status(400).json({ error: 'No applications selected' });
    }

    const ids = applicationIds.map(Number);
    const result = await prisma.application.updateMany({
      where: {
        id: { in: ids },
        status: { in: ['SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'RESULT_AWAITED'] },
        resultStatus: { not: 'Waiting' },
      },
      data: { status: 'FORWARDED' },
    });

    const apps = await prisma.application.findMany({
      where: { id: { in: ids }, status: 'FORWARDED' },
      include: { program: true, user: { select: { email: true, emailNotifications: true } } },
    });

    for (const app of apps) {
      await logStatus(app.id, app.userId, 'FORWARDED', 'Bulk forwarded by Director', 'director_admissions');
      await notify({
        userId: app.userId,
        title: 'Application Forwarded',
        message: `Your application for ${app.program.name} has been approved by the Director and forwarded to the Department Coordinator.`,
        skipEmail: true,
      });
      // Dedicated forwarded email (richer template than generic notify email)
      if (app.user?.emailNotifications && app.user?.email) {
        sendApplicationForwardedEmail(app.user.email, app.program.name, app.id).catch(() => {});
      }
    }

    res.json({ message: `${result.count} applications forwarded to coordinator` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to forward applications' });
  }
});

// PUT /api/admin/applications/forward-enrollment
router.put('/applications/forward-enrollment', authenticate, requireAdmin, async (req, res) => {
  try {
    const { applicationIds } = req.body;
    if (!applicationIds || applicationIds.length === 0) {
      return res.status(400).json({ error: 'No applications selected' });
    }

    const apps = await prisma.application.findMany({
      where: { id: { in: applicationIds.map(Number) }, status: 'FEE_APPROVED' },
      include: { program: true },
    });

    await prisma.application.updateMany({
      where: { id: { in: apps.map(a => a.id) } },
      data: { status: 'FEE_APPROVED', adminRemarks: 'READY_FOR_ENROLLMENT' },
    });

    for (const app of apps) {
      await notify(app.userId, 'Forwarded for Enrollment',
        `Your application for ${app.program.name} has been forwarded to the Department Coordinator for enrollment.`);
    }

    res.json({ message: `${apps.length} applications forwarded for enrollment` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to forward applications' });
  }
});

// PUT /api/admin/fee/confirm/:paymentId
router.put('/fee/confirm/:paymentId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, remarks } = req.body;
    if (!['APPROVED', 'REJECTED', 'NEEDS_INFO'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const payment = await prisma.feePayment.findUnique({
      where: { id: parseInt(req.params.paymentId) },
      include: {
        application: { include: { program: true, admissionCycle: true } },
        user: { select: { id: true, enrollment: true } },
      },
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const updated = await prisma.feePayment.update({
      where: { id: parseInt(req.params.paymentId) },
      data: { status, adminRemarks: remarks || null },
    });

    let appStatus;
    let enrollment = null;
    let rollNumber = null;
    let regNumber = null;

    if (status === 'APPROVED') {
      appStatus = 'ENROLLED';

      // ADCS-only roll/registration/LMS credential generation (shared helper).
      enrollment = await confirmEnrollment({
        application: { ...payment.application, userId: payment.userId },
        existingEnrollment: payment.user.enrollment,
      });
      rollNumber = enrollment.rollNumber || null;
      regNumber = enrollment.registrationNumber || null;
    } else if (status === 'REJECTED' || status === 'NEEDS_INFO') {
      appStatus = 'FEE_PENDING';
    }

    await prisma.application.update({
      where: { id: payment.applicationId },
      data: { status: appStatus },
    });
    await logStatus(payment.applicationId, payment.userId, appStatus, `Fee ${status}`, 'director_admissions');

    const messages = {
      APPROVED: `Your fee payment for ${payment.application.program.name} has been confirmed by the Director. ${rollNumber ? `Your Roll Number is ${rollNumber}. ` : ''}You are now enrolled.`,
      REJECTED: `Your fee payment for ${payment.application.program.name} has been rejected.${remarks ? ' Reason: ' + remarks : ''}`,
      NEEDS_INFO: `Additional information is required regarding your fee payment.${remarks ? ' Details: ' + remarks : ''}`,
    };

    await notify({
      userId: payment.userId,
      title: `Fee Payment ${status === 'APPROVED' ? 'Confirmed — Enrolled' : status === 'REJECTED' ? 'Rejected' : 'Needs Info'}`,
      message: messages[status],
      skipEmail: true, // dedicated email below
    });

    // Dedicated email templates for fee status + enrollment confirmation
    try {
      const userRow = await prisma.user.findUnique({
        where: { id: payment.userId },
        select: { email: true, emailNotifications: true },
      });
      if (userRow?.emailNotifications && userRow?.email) {
        sendFeeStatusEmail(userRow.email, payment.application.program.name, status, remarks).catch(() => {});
        if (status === 'APPROVED' && enrollment) {
          sendEnrollmentConfirmedEmail(
            userRow.email,
            payment.application.program.name,
            enrollment.rollNumber,
            enrollment.registrationNumber,
            enrollment.lmsUsername,
          ).catch(() => {});
        }
      }
    } catch (_) {}

    res.json({
      message: 'Fee review updated',
      payment: updated,
      enrollment: enrollment ? {
        rollNumber: enrollment.rollNumber,
        registrationNumber: enrollment.registrationNumber,
        status: enrollment.status,
      } : null,
    });
  } catch (error) {
    console.error('Review fee error:', error);
    res.status(500).json({ error: 'Failed to review fee payment' });
  }
});

// GET /api/admin/application/:id/pdf-data
router.get('/application/:id/pdf-data', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'director_admissions' && req.user.role !== 'coordinator' && req.user.role !== 'student') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const application = await prisma.application.findUnique({
      where: { id: parseInt(req.params.id) },
      include: FULL_APP_INCLUDE,
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    // Students can only view their own
    if (req.user.role === 'student' && application.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ application });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch application data' });
  }
});

// PUT /api/admin/enrollment/:userId/roll-number
router.put('/enrollment/:userId/roll-number', authenticate, requireAdmin, async (req, res) => {
  try {
    const { rollNumber } = req.body;
    if (!rollNumber) return res.status(400).json({ error: 'Roll number is required' });

    const enrollment = await prisma.enrollment.findUnique({
      where: { userId: parseInt(req.params.userId) },
    });
    if (enrollment) {
      const updated = await prisma.enrollment.update({
        where: { userId: parseInt(req.params.userId) },
        data: { rollNumber },
      });
      return res.json({ message: 'Roll number updated', enrollment: updated });
    }
    const created = await prisma.enrollment.create({
      data: { userId: parseInt(req.params.userId), rollNumber, status: 'PENDING' },
    });
    res.json({ message: 'Roll number assigned', enrollment: created });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Roll number already in use' });
    res.status(500).json({ error: 'Failed to update roll number' });
  }
});

// PUT /api/admin/enrollment/:userId/registration-number
router.put('/enrollment/:userId/registration-number', authenticate, requireAdmin, async (req, res) => {
  try {
    const { registrationNumber } = req.body;
    if (!registrationNumber) return res.status(400).json({ error: 'Registration number is required' });

    const enrollment = await prisma.enrollment.findUnique({
      where: { userId: parseInt(req.params.userId) },
    });
    if (enrollment) {
      const updated = await prisma.enrollment.update({
        where: { userId: parseInt(req.params.userId) },
        data: { registrationNumber: String(registrationNumber).trim() },
      });
      return res.json({ message: 'Registration number updated', enrollment: updated });
    }
    const created = await prisma.enrollment.create({
      data: {
        userId: parseInt(req.params.userId),
        registrationNumber: String(registrationNumber).trim(),
        status: 'PENDING',
      },
    });
    res.json({ message: 'Registration number assigned', enrollment: created });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Registration number already in use' });
    res.status(500).json({ error: 'Failed to update registration number' });
  }
});

module.exports = router;

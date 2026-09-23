const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  authenticate,
  requireCoordinator,
  attachCoordinatorScope,
  coordinatorProgramFilter,
  coordinatorCanAccessProgram,
} = require('../middleware/auth');
const { generateRollNumber } = require('../utils/rollNumber');
const { generateRegistrationNumber } = require('../utils/registrationNumber');
const {
  confirmEnrollment,
  isAdcsProgram,
  generateTempPassword,
} = require('../utils/enrollmentCredentials');
const { notify } = require('../utils/notify');
const { computeMerit } = require('../utils/meritWeights');
const { applicationResultAwaited, isResultAwaited } = require('../utils/resultAwaited');
const {
  sendInterviewScheduledEmail,
  sendInterviewDecisionEmail,
  sendEnrollmentConfirmedEmail,
} = require('../utils/email');

const router = express.Router();
const prisma = new PrismaClient();

const FULL_APP_INCLUDE = {
  program: true,
  admissionCycle: true,
  interview: true,
  meritEntry: true,
  feePayment: true,
  appeals: { orderBy: { createdAt: 'desc' } },
  statusEvents: { orderBy: { createdAt: 'desc' } },
  user: {
    select: {
      id: true, email: true, username: true, role: true, createdAt: true,
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

// Detect a URL inside any string (for interview meeting links)
function extractUrl(text) {
  if (!text) return null;
  const m = String(text).match(/https?:\/\/[^\s,]+/i);
  return m ? m[0] : null;
}

// GET /api/coordinator/stats
router.get('/stats', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    // Department scope filter (programId IN coordinator's programs).
    const pf = coordinatorProgramFilter(req); // { programId: { in: [...] } }
    const appWhere = (status) => ({ ...pf, status });
    // Interviews / merit / enrollment must be scoped through the related application.
    const interviewWhere = (status) => ({ status, application: { is: pf } });

    const [forwarded, interviewScheduled, interviewCompleted, qualified, disqualified, enrolled, totalMerit, feePending, feePaid] = await Promise.all([
      prisma.application.count({ where: appWhere('FORWARDED') }),
      prisma.interview.count({ where: interviewWhere('SCHEDULED') }),
      prisma.interview.count({ where: interviewWhere('COMPLETED') }),
      prisma.application.count({ where: appWhere('QUALIFIED') }),
      prisma.application.count({ where: appWhere('DISQUALIFIED') }),
      prisma.application.count({ where: appWhere('ENROLLED') }),
      prisma.meritEntry.count({ where: { application: { is: pf } } }),
      prisma.application.count({ where: appWhere('FEE_PENDING') }),
      prisma.application.count({ where: appWhere('FEE_PAID') }),
    ]);
    res.json({ stats: { forwarded, interviewScheduled, interviewCompleted, qualified, disqualified, enrolled, totalMerit, feePending, feePaid } });
  } catch (error) {
    console.error('Coordinator stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/coordinator/applications
router.get('/applications', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const { status } = req.query;
    // Always start from the coordinator's department scope.
    const where = { ...coordinatorProgramFilter(req) };
    if (status && status !== 'all') {
      where.status = status;
    } else {
      where.status = {
        in: ['FORWARDED', 'INTERVIEWED', 'INTERVIEW_COMPLETED', 'QUALIFIED', 'DISQUALIFIED',
             'SELECTED', 'FEE_PENDING', 'FEE_PAID', 'FEE_APPROVED', 'ENROLLED'],
      };
    }

    const applications = await prisma.application.findMany({
      where,
      include: FULL_APP_INCLUDE,
      orderBy: { submittedAt: 'desc' },
    });

    res.json({ applications, total: applications.length });
  } catch (error) {
    console.error('Coordinator applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// ============================================================
// INITIAL MERIT LIST (Master Prompt Section 5)
// ------------------------------------------------------------
// Before interviews, the Admissions Coordinator reviews the applications the
// Director forwarded (status FORWARDED) and decides, per application, whether
// the applicant is Eligible or Not Eligible for interview. Only ELIGIBLE
// applicants appear on the Initial Merit List ("Selected for Interview").
// This runs BEFORE the existing interview + final-merit workflow and does not
// alter it.
// ============================================================

// PUT /api/coordinator/interview-eligibility/:applicationId
// Body: { eligibility: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'PENDING' }
router.put('/interview-eligibility/:applicationId', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const eligibility = String(req.body.eligibility || '').toUpperCase();
    if (!['ELIGIBLE', 'NOT_ELIGIBLE', 'PENDING'].includes(eligibility)) {
      return res.status(400).json({ error: 'eligibility must be ELIGIBLE, NOT_ELIGIBLE or PENDING' });
    }
    const application = await prisma.application.findUnique({
      where: { id: parseInt(req.params.applicationId) },
      include: { program: true },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (!coordinatorCanAccessProgram(req, application.programId)) {
      return res.status(403).json({ error: 'Access denied. This application belongs to another department.' });
    }

    // Additional Fixes §5 — Result Awaited applicants cannot be marked ELIGIBLE
    // for interview until their declared result is entered.
    if (eligibility === 'ELIGIBLE' && await applicationResultAwaited(application)) {
      return res.status(400).json({
        error: 'This applicant\'s result is still awaited. They cannot be marked Eligible for Interview until the declared result is updated.',
        code: 'RESULT_AWAITED',
      });
    }

    const updated = await prisma.application.update({
      where: { id: application.id },
      data: { interviewEligibility: eligibility },
    });

    const label = eligibility === 'ELIGIBLE' ? 'Eligible for Interview'
      : eligibility === 'NOT_ELIGIBLE' ? 'Not Eligible for Interview' : 'Pending review';
    await logStatus(application.id, application.userId, application.status,
      `Interview eligibility set to ${label} by Admissions Coordinator`, 'coordinator');

    if (eligibility === 'ELIGIBLE') {
      await prisma.notification.create({
        data: {
          userId: application.userId,
          title: 'Shortlisted for Interview',
          message: `Congratulations! You have been shortlisted for interview for ${application.program.name}. You now appear on the Initial Merit List (Selected for Interview).`,
        },
      }).catch(() => {});
    } else if (eligibility === 'NOT_ELIGIBLE') {
      await prisma.notification.create({
        data: {
          userId: application.userId,
          title: 'Interview Eligibility Update',
          message: `After review of your application for ${application.program.name}, you have not been shortlisted for the interview stage.`,
        },
      }).catch(() => {});
    }

    res.json({ message: `Marked as ${label}`, application: updated });
  } catch (error) {
    console.error('Set interview eligibility error:', error);
    res.status(500).json({ error: 'Failed to update interview eligibility' });
  }
});

// PUT /api/coordinator/interview-eligibility-bulk
// Body: { applicationIds: number[], eligibility: 'ELIGIBLE' | 'NOT_ELIGIBLE' }
router.put('/interview-eligibility-bulk', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const { applicationIds, eligibility: raw } = req.body;
    const eligibility = String(raw || '').toUpperCase();
    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({ error: 'applicationIds array is required' });
    }
    if (!['ELIGIBLE', 'NOT_ELIGIBLE', 'PENDING'].includes(eligibility)) {
      return res.status(400).json({ error: 'eligibility must be ELIGIBLE, NOT_ELIGIBLE or PENDING' });
    }
    const ids = applicationIds.map(Number);
    // Scope to the coordinator's own department programs.
    const scoped = await prisma.application.findMany({
      where: { id: { in: ids }, ...coordinatorProgramFilter(req) },
      select: { id: true, userId: true },
    });
    let scopedIds = scoped.map((a) => a.id);
    if (scopedIds.length === 0) return res.status(403).json({ error: 'No accessible applications in the selection.' });

    // Additional Fixes §5 — when marking ELIGIBLE, skip any applicant whose
    // result is still awaited (they can't proceed past Initial Merit).
    let blocked = [];
    let targets = scoped;
    if (eligibility === 'ELIGIBLE') {
      const checks = await Promise.all(scoped.map(async (a) => ({ a, awaited: await isResultAwaited(a.userId) })));
      targets = checks.filter((c) => !c.awaited).map((c) => c.a);
      blocked = checks.filter((c) => c.awaited).map((c) => c.a.id);
      scopedIds = targets.map((a) => a.id);
    }
    if (scopedIds.length === 0) {
      return res.status(400).json({
        error: 'All selected applicants are still awaiting their result and cannot be marked Eligible for Interview.',
        code: 'RESULT_AWAITED', blocked,
      });
    }

    await prisma.application.updateMany({
      where: { id: { in: scopedIds } },
      data: { interviewEligibility: eligibility },
    });
    for (const a of targets) {
      await logStatus(a.id, a.userId, undefined,
        `Interview eligibility set to ${eligibility} (bulk) by Admissions Coordinator`, 'coordinator').catch(() => {});
    }
    res.json({
      message: `${scopedIds.length} application(s) updated${blocked.length ? `, ${blocked.length} skipped (result awaited)` : ''}`,
      count: scopedIds.length, blocked,
    });
  } catch (error) {
    console.error('Bulk interview eligibility error:', error);
    res.status(500).json({ error: 'Failed to update interview eligibility' });
  }
});

// GET /api/coordinator/initial-merit-list
// Returns the coordinator's department applications grouped by eligibility so
// the UI can show the review queue + the Initial Merit List (ELIGIBLE only).
router.get('/initial-merit-list', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const apps = await prisma.application.findMany({
      where: {
        ...coordinatorProgramFilter(req),
        status: { in: ['FORWARDED', 'INTERVIEWED', 'INTERVIEW_COMPLETED', 'QUALIFIED'] },
      },
      include: {
        program: { include: { department: true } },
        interview: true,
        user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true, cnic: true } } } },
      },
      orderBy: { submittedAt: 'asc' },
    });
    const selected = apps.filter((a) => a.interviewEligibility === 'ELIGIBLE');
    const notEligible = apps.filter((a) => a.interviewEligibility === 'NOT_ELIGIBLE');
    const pending = apps.filter((a) => !a.interviewEligibility || a.interviewEligibility === 'PENDING');
    // Publish state (Additional Fixes §6) — reflect the active cycle's flag.
    const cycle = await prisma.admissionCycle.findFirst({ where: { isOpen: true }, orderBy: { id: 'desc' } })
      || await prisma.admissionCycle.findFirst({ orderBy: { id: 'desc' } });
    res.json({
      title: 'Initial Merit List – Selected for Interview',
      selected, notEligible, pending, all: apps,
      published: !!cycle?.initialMeritPublished,
      publishedAt: cycle?.initialMeritPublishedAt || null,
      cycleId: cycle?.id || null,
    });
  } catch (error) {
    console.error('Initial merit list error:', error);
    res.status(500).json({ error: 'Failed to fetch initial merit list' });
  }
});

// ------------------------------------------------------------
// PUT /api/coordinator/initial-merit-list/publish  (Additional Fixes §6)
//   Admissions Coordinator publishes the Initial Merit List so students can
//   finally see whether they are Selected for Interview / Not Selected.
//   Body: { publish?: boolean, cycleId?: number }  (publish defaults to true)
// ------------------------------------------------------------
router.put('/initial-merit-list/publish', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const publish = req.body.publish !== false; // default true
    const cycle = req.body.cycleId
      ? await prisma.admissionCycle.findUnique({ where: { id: parseInt(req.body.cycleId) } })
      : (await prisma.admissionCycle.findFirst({ where: { isOpen: true }, orderBy: { id: 'desc' } })
        || await prisma.admissionCycle.findFirst({ orderBy: { id: 'desc' } }));
    if (!cycle) return res.status(404).json({ error: 'No admission cycle found to publish.' });

    await prisma.admissionCycle.update({
      where: { id: cycle.id },
      data: {
        initialMeritPublished: publish,
        initialMeritPublishedAt: publish ? new Date() : null,
      },
    });

    // Notify the shortlisted students in this coordinator's department so they
    // know the list is live (only when publishing).
    if (publish) {
      const selected = await prisma.application.findMany({
        where: { ...coordinatorProgramFilter(req), admissionCycleId: cycle.id, interviewEligibility: 'ELIGIBLE' },
        select: { userId: true, program: { select: { name: true } } },
      });
      for (const a of selected) {
        await prisma.notification.create({
          data: {
            userId: a.userId,
            title: 'Initial Merit List Published',
            message: `The Initial Merit List is now published. You have been Selected for Interview for ${a.program?.name || 'your program'}.`,
          },
        }).catch(() => {});
      }
    }

    res.json({ message: publish ? 'Initial Merit List published' : 'Initial Merit List unpublished', published: publish, cycleId: cycle.id });
  } catch (error) {
    console.error('Publish initial merit list error:', error);
    res.status(500).json({ error: 'Failed to publish initial merit list' });
  }
});

// GET /api/coordinator/applications/:id
router.get('/applications/:id', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const application = await prisma.application.findUnique({
      where: { id: parseInt(req.params.id) },
      include: FULL_APP_INCLUDE,
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    // Department scoping: a coordinator can only read their own department's applications.
    if (!coordinatorCanAccessProgram(req, application.programId)) {
      return res.status(403).json({ error: 'Access denied. This application belongs to another department.' });
    }
    res.json({ application });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch application detail' });
  }
});

// ============================================================
// POST /api/coordinator/interview/retake — retake interview after appeal acceptance
// Preserves the previous interview record's history into the status timeline,
// then resets the same Interview row to SCHEDULED so it can be re-evaluated.
// SAME application — no new application is created.
// Body: applicationId, scheduledDate, scheduledTime, venue, meetingLink
// ============================================================
router.post('/interview/retake', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const { applicationId, scheduledDate, scheduledTime, venue, meetingLink } = req.body;
    if (!applicationId || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ error: 'Application ID, date and time are required' });
    }

    const application = await prisma.application.findUnique({
      where: { id: parseInt(applicationId) },
      include: { program: true, interview: true, appeals: { orderBy: { createdAt: 'desc' } } },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (!coordinatorCanAccessProgram(req, application.programId)) {
      return res.status(403).json({ error: 'Access denied. This application belongs to another department.' });
    }

    // Must have an accepted interview-disqualification appeal
    const interviewAppeal = application.appeals.find(
      a => a.appealType === 'INTERVIEW_DISQUALIFICATION' && a.status === 'ACCEPTED'
    );
    if (!interviewAppeal) {
      return res.status(400).json({
        error: 'Retake interview requires an accepted interview-disqualification appeal on this application.',
      });
    }

    // Defensive: ensure application is in a state where retake makes sense.
    // After appeal acceptance the status is moved to FORWARDED. If the application
    // is still showing DISQUALIFIED (stale state), pull it back to FORWARDED first.
    if (!['FORWARDED', 'INTERVIEWED', 'DISQUALIFIED'].includes(application.status)) {
      return res.status(400).json({
        error: `Cannot schedule a retake interview while application is in '${application.status}'. Expected FORWARDED, INTERVIEWED or DISQUALIFIED.`,
      });
    }

    const detectedFromVenue = extractUrl(venue);
    const linkFinal = (meetingLink && String(meetingLink).trim())
      ? String(meetingLink).trim()
      : detectedFromVenue;
    const venueFinal = (venue && String(venue).trim()) || (linkFinal ? 'Online Interview' : 'AUST Campus');

    // Preserve previous interview snapshot in the timeline
    if (application.interview) {
      const prev = application.interview;
      const snapshot = `Previous interview: date ${prev.scheduledDate || '-'} ${prev.scheduledTime || ''}, venue "${prev.venue || '-'}", decision ${prev.decision || '-'}, marks ${prev.marks ?? '-'}, remarks ${prev.remarks || '-'}`;
      await logStatus(application.id, application.userId, 'INTERVIEW_COMPLETED', snapshot, 'coordinator');
    }

    // Reset same Interview row for retake (history preserved in status events)
    let interview;
    if (application.interview) {
      interview = await prisma.interview.update({
        where: { id: application.interview.id },
        data: {
          scheduledDate, scheduledTime,
          venue: venueFinal,
          meetingLink: linkFinal,
          status: 'SCHEDULED',
          decision: 'PENDING',
          marks: null,
          remarks: 'Retake scheduled after accepted appeal',
        },
      });
    } else {
      interview = await prisma.interview.create({
        data: {
          applicationId: application.id,
          userId: application.userId,
          scheduledDate, scheduledTime,
          venue: venueFinal,
          meetingLink: linkFinal,
          status: 'SCHEDULED',
          decision: 'PENDING',
          remarks: 'Retake scheduled after accepted appeal',
        },
      });
    }

    await prisma.application.update({
      where: { id: application.id },
      data: { status: 'INTERVIEWED' },
    });
    await logStatus(application.id, application.userId, 'INTERVIEWED',
      'Retake interview scheduled', 'coordinator');

    const linkLine = linkFinal ? ` Meeting Link: ${linkFinal}` : '';
    await prisma.notification.create({
      data: {
        userId: application.userId,
        title: 'Retake Interview Scheduled',
        message: `Your retake interview for ${application.program.name} is on ${scheduledDate} at ${scheduledTime}. Venue: ${venueFinal}.${linkLine}`,
        link: linkFinal || null,
      },
    });

    res.status(200).json({ message: 'Retake interview scheduled', interview });
  } catch (error) {
    console.error('Retake interview error:', error);
    res.status(500).json({ error: 'Failed to schedule retake interview' });
  }
});

// ============================================================
// POST /api/coordinator/interview — schedule (or reschedule) interview
// Body fields: applicationId, scheduledDate, scheduledTime, venue, meetingLink
// ============================================================
router.post('/interview', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const { applicationId, scheduledDate, scheduledTime, venue, meetingLink, mode } = req.body;
    if (!applicationId || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ error: 'Application ID, date and time are required' });
    }

    const application = await prisma.application.findUnique({
      where: { id: parseInt(applicationId) },
      include: { program: true },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (!coordinatorCanAccessProgram(req, application.programId)) {
      return res.status(403).json({ error: 'Access denied. This application belongs to another department.' });
    }

    // Additional Fixes §5 & §7 — only interview-eligible applicants may be
    // scheduled, and result-awaited applicants are blocked entirely.
    if (application.interviewEligibility !== 'ELIGIBLE') {
      return res.status(400).json({ error: 'Only applicants marked Eligible for Interview can be scheduled.' });
    }
    if (await applicationResultAwaited(application)) {
      return res.status(400).json({ error: 'This applicant\'s result is still awaited and cannot be scheduled for interview.', code: 'RESULT_AWAITED' });
    }

    // Interview mode (§7): PHYSICAL or ONLINE. When online, a meeting link is used.
    const isOnline = String(mode || '').toUpperCase() === 'ONLINE' || !!(meetingLink && String(meetingLink).trim());
    // Auto-detect URL if pasted into venue
    const detectedFromVenue = extractUrl(venue);
    const linkFinal = isOnline
      ? ((meetingLink && String(meetingLink).trim()) ? String(meetingLink).trim() : detectedFromVenue)
      : null;
    const venueFinal = (venue && String(venue).trim())
      || (isOnline ? 'Online Interview' : 'AUST Campus');

    const existing = await prisma.interview.findUnique({ where: { applicationId: parseInt(applicationId) } });

    let interview;
    if (existing) {
      interview = await prisma.interview.update({
        where: { applicationId: parseInt(applicationId) },
        data: {
          scheduledDate, scheduledTime,
          venue: venueFinal,
          meetingLink: linkFinal,
          status: 'SCHEDULED',
          decision: 'PENDING',
        },
      });
    } else {
      interview = await prisma.interview.create({
        data: {
          applicationId: parseInt(applicationId),
          userId: application.userId,
          scheduledDate, scheduledTime,
          venue: venueFinal,
          meetingLink: linkFinal,
          status: 'SCHEDULED',
          decision: 'PENDING',
        },
      });
    }

    await prisma.application.update({
      where: { id: parseInt(applicationId) },
      data: { status: 'INTERVIEWED' },
    });
    await logStatus(parseInt(applicationId), application.userId, 'INTERVIEWED', 'Interview scheduled', 'coordinator');

    const linkLine = linkFinal ? ` Meeting Link: ${linkFinal}` : '';
    const titleLine = existing ? 'Interview Rescheduled' : 'Interview Scheduled';
    await prisma.notification.create({
      data: {
        userId: application.userId,
        title: titleLine,
        message: `Your interview for ${application.program.name} is on ${scheduledDate} at ${scheduledTime}. Venue: ${venueFinal}.${linkLine}`,
        link: linkFinal || null,
      },
    });

    // Dedicated interview-scheduled email
    try {
      const userRow = await prisma.user.findUnique({
        where: { id: application.userId },
        select: { email: true, emailNotifications: true },
      });
      if (userRow?.emailNotifications && userRow?.email) {
        sendInterviewScheduledEmail(
          userRow.email,
          application.program.name,
          parseInt(applicationId),
          scheduledDate,
          scheduledTime,
          venueFinal,
          linkFinal,
        ).catch(() => {});
      }
    } catch (_) {}

    res.status(existing ? 200 : 201).json({ message: existing ? 'Interview rescheduled' : 'Interview scheduled', interview });
  } catch (error) {
    console.error('Schedule interview error:', error);
    res.status(500).json({ error: 'Failed to schedule interview' });
  }
});

// ============================================================
// POST /api/coordinator/interview/bulk
// Schedule interviews for MULTIPLE applications at once.
// Body: { applicationIds: number[], scheduledDate, scheduledTime, venue, meetingLink? }
// ============================================================
router.post('/interview/bulk', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const { applicationIds, scheduledDate, scheduledTime, venue, meetingLink, mode } = req.body;
    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({ error: 'applicationIds must be a non-empty array' });
    }
    if (!scheduledDate || !scheduledTime) {
      return res.status(400).json({ error: 'scheduledDate and scheduledTime are required' });
    }

    const detectedFromVenue = extractUrl(venue);
    const isOnline = String(mode || '').toUpperCase() === 'ONLINE' || !!(meetingLink && String(meetingLink).trim());
    const linkFinal = isOnline
      ? ((meetingLink && String(meetingLink).trim()) ? String(meetingLink).trim() : detectedFromVenue)
      : null;
    const venueFinal = isOnline
      ? ((venue && String(venue).trim()) || 'Online Interview')
      : ((venue && String(venue).trim()) || 'AUST Campus');

    const ids = applicationIds.map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));

    // Allow scheduling/rescheduling on these statuses (forward → ready for interview)
    const ALLOWED = ['FORWARDED', 'INTERVIEWED', 'INTERVIEW_COMPLETED'];

    // Department scoping: only fetch applications inside the coordinator's programs.
    const apps = await prisma.application.findMany({
      where: { id: { in: ids }, ...coordinatorProgramFilter(req) },
      include: { program: true },
    });

    const results = { scheduled: [], rescheduled: [], skipped: [] };

    for (const app of apps) {
      if (!ALLOWED.includes(app.status)) {
        results.skipped.push({ id: app.id, reason: `Status ${app.status} not eligible for scheduling` });
        continue;
      }
      // Additional Fixes §5 & §7 — only interview-eligible, non-result-awaited.
      if (app.interviewEligibility !== 'ELIGIBLE') {
        results.skipped.push({ id: app.id, reason: 'Not marked Eligible for Interview' });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      if (await isResultAwaited(app.userId)) {
        results.skipped.push({ id: app.id, reason: 'Result awaited' });
        continue;
      }
      try {
        const existing = await prisma.interview.findUnique({ where: { applicationId: app.id } });

        if (existing) {
          await prisma.interview.update({
            where: { applicationId: app.id },
            data: {
              scheduledDate, scheduledTime,
              venue: venueFinal,
              meetingLink: linkFinal,
              status: 'SCHEDULED',
              decision: 'PENDING',
            },
          });
          results.rescheduled.push(app.id);
        } else {
          await prisma.interview.create({
            data: {
              applicationId: app.id,
              userId: app.userId,
              scheduledDate, scheduledTime,
              venue: venueFinal,
              meetingLink: linkFinal,
              status: 'SCHEDULED',
              decision: 'PENDING',
            },
          });
          results.scheduled.push(app.id);
        }

        await prisma.application.update({
          where: { id: app.id },
          data: { status: 'INTERVIEWED' },
        });
        await logStatus(app.id, app.userId, 'INTERVIEWED', 'Interview scheduled (bulk)', 'coordinator');

        const linkLine = linkFinal ? ` Meeting Link: ${linkFinal}` : '';
        const titleLine = existing ? 'Interview Rescheduled' : 'Interview Scheduled';
        await prisma.notification.create({
          data: {
            userId: app.userId,
            title: titleLine,
            message: `Your interview for ${app.program.name} is on ${scheduledDate} at ${scheduledTime}. Venue: ${venueFinal}.${linkLine}`,
            link: linkFinal || null,
          },
        });

        // Dedicated bulk-scheduled interview email
        try {
          const userRow = await prisma.user.findUnique({
            where: { id: app.userId },
            select: { email: true, emailNotifications: true },
          });
          if (userRow?.emailNotifications && userRow?.email) {
            sendInterviewScheduledEmail(
              userRow.email,
              app.program.name,
              app.id,
              scheduledDate,
              scheduledTime,
              venueFinal,
              linkFinal,
            ).catch(() => {});
          }
        } catch (_) {}
      } catch (e) {
        results.skipped.push({ id: app.id, reason: e.message || 'Unknown error' });
      }
    }

    // Note any IDs that were not found in DB
    const foundIds = new Set(apps.map((a) => a.id));
    for (const id of ids) {
      if (!foundIds.has(id)) results.skipped.push({ id, reason: 'Application not found' });
    }

    res.json({
      message: `Bulk interview scheduling complete: ${results.scheduled.length} scheduled, ${results.rescheduled.length} rescheduled, ${results.skipped.length} skipped`,
      ...results,
    });
  } catch (error) {
    console.error('Bulk schedule interview error:', error);
    res.status(500).json({ error: 'Failed to bulk-schedule interviews' });
  }
});

// ============================================================
// PUT /api/coordinator/interview/:id/evaluate
// Body fields: decision (QUALIFIED|DISQUALIFIED), marks (if qualified), remarks
// ============================================================
router.put('/interview/:id/evaluate', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const { decision, marks, remarks } = req.body;
    if (!['QUALIFIED', 'DISQUALIFIED'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be QUALIFIED or DISQUALIFIED' });
    }
    if (decision === 'QUALIFIED' && (marks === undefined || marks === null || marks === '' || marks < 0 || marks > 100)) {
      return res.status(400).json({ error: 'Interview marks (0–100) are required for Qualified decision' });
    }
    if (decision === 'DISQUALIFIED' && (!remarks || !String(remarks).trim())) {
      return res.status(400).json({ error: 'Remarks/reason is required for Disqualified decision' });
    }

    const interview = await prisma.interview.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { application: { include: { program: true, admissionCycle: true } } },
    });
    if (!interview) return res.status(404).json({ error: 'Interview not found' });
    if (!coordinatorCanAccessProgram(req, interview.application.programId)) {
      return res.status(403).json({ error: 'Access denied. This interview belongs to another department.' });
    }

    const app = interview.application;
    const cycle = app.admissionCycle;

    const updated = await prisma.interview.update({
      where: { id: parseInt(req.params.id) },
      data: {
        decision,
        marks: decision === 'QUALIFIED' ? parseFloat(marks) : null,
        remarks: remarks || null,
        status: 'COMPLETED',
      },
    });

    if (decision === 'QUALIFIED') {
      // Calculate merit using education marks + interview marks
      const educations = await prisma.education.findMany({ where: { userId: app.userId } });
      const matric = educations.find(e => e.level === '10years');
      const fsc = educations.find(e => e.level === '12years');
      const fscFallback = fsc || educations.find(e => e.level === '11years');

      const matricPct = matric && matric.totalMarks > 0 ? (matric.marks / matric.totalMarks) * 100 : 0;
      let fscPct = 0;
      if (fscFallback) {
        const m = fscFallback.marks ?? fscFallback.partOneMarks;
        const t = fscFallback.totalMarks ?? fscFallback.partOneTotalMarks;
        if (m && t > 0) fscPct = (m / t) * 100;
      }

      // Per-program merit criteria (Additional Fixes §3).
      const { matricWeighted, fscWeighted, interviewWeighted, totalMerit } = computeMerit({
        matricPercent: matricPct, fscPercent: fscPct, interviewMarks: parseFloat(marks),
        program: app.program, cycle,
      });

      await prisma.meritEntry.upsert({
        where: { applicationId: app.id },
        update: {
          matricPercent: matricPct, fscPercent: fscPct, interviewMarks: parseFloat(marks),
          matricWeighted, fscWeighted, interviewWeighted, totalMerit,
        },
        create: {
          applicationId: app.id, userId: app.userId,
          matricPercent: matricPct, fscPercent: fscPct, interviewMarks: parseFloat(marks),
          matricWeighted, fscWeighted, interviewWeighted, totalMerit,
        },
      });

      await prisma.application.update({
        where: { id: app.id },
        data: { status: 'QUALIFIED' },
      });
      await logStatus(app.id, app.userId, 'INTERVIEW_COMPLETED', 'Interview completed', 'coordinator');
      await logStatus(app.id, app.userId, 'QUALIFIED', `Qualified with ${marks} marks`, 'coordinator');

      await notify({
        userId: app.userId,
        title: 'Interview Completed — Qualified',
        message: `Your interview for ${app.program.name} is complete. You have qualified with ${marks} marks. You are eligible for merit list processing.`,
        skipEmail: true,
      });
    } else {
      // Disqualified — remove from merit eligibility
      await prisma.meritEntry.deleteMany({ where: { applicationId: app.id } });
      await prisma.application.update({
        where: { id: app.id },
        data: { status: 'DISQUALIFIED' },
      });
      await logStatus(app.id, app.userId, 'INTERVIEW_COMPLETED', 'Interview completed', 'coordinator');
      await logStatus(app.id, app.userId, 'DISQUALIFIED', remarks, 'coordinator');

      await notify({
        userId: app.userId,
        title: 'Disqualified in Interview',
        message: `Your interview for ${app.program.name} has been completed. Decision: Disqualified. Reason: ${remarks}. You may submit an appeal from your dashboard.`,
        skipEmail: true,
      });
    }

    // Dedicated interview-decision email
    try {
      const userRow = await prisma.user.findUnique({
        where: { id: app.userId },
        select: { email: true, emailNotifications: true },
      });
      if (userRow?.emailNotifications && userRow?.email) {
        sendInterviewDecisionEmail(
          userRow.email,
          app.program.name,
          app.id,
          decision,
          decision === 'QUALIFIED' ? marks : null,
          remarks,
        ).catch(() => {});
      }
    } catch (_) {}

    res.json({ message: 'Interview evaluation saved', interview: updated });
  } catch (error) {
    console.error('Evaluate interview error:', error);
    res.status(500).json({ error: 'Failed to record interview evaluation' });
  }
});

// ============================================================
// (Legacy) PUT /api/coordinator/interview/:id/marks — kept for back-compat
// ============================================================
router.put('/interview/:id/marks', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const { marks, remarks } = req.body;
    if (marks === undefined || marks < 0 || marks > 100) {
      return res.status(400).json({ error: 'Interview marks must be between 0 and 100' });
    }

    // Department scoping for the legacy path (the delegate target's middleware
    // does not re-run, so enforce access here too).
    const intv = await prisma.interview.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { application: { select: { programId: true } } },
    });
    if (!intv) return res.status(404).json({ error: 'Interview not found' });
    if (!coordinatorCanAccessProgram(req, intv.application.programId)) {
      return res.status(403).json({ error: 'Access denied. This interview belongs to another department.' });
    }

    // Delegate to the new evaluate endpoint with QUALIFIED
    req.body = { decision: 'QUALIFIED', marks, remarks };
    return router.handle({ ...req, url: `/interview/${req.params.id}/evaluate`, method: 'PUT' }, res);
  } catch (error) {
    console.error('Enter marks error:', error);
    res.status(500).json({ error: 'Failed to enter interview marks' });
  }
});

// ============================================================
// POST /api/coordinator/enroll/:applicationId — final enrollment step
// ============================================================
router.post('/enroll/:applicationId', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { rollNumber: manualRollNumber, registrationNumber: manualRegNumber } = req.body;

    const application = await prisma.application.findUnique({
      where: { id: parseInt(applicationId) },
      include: {
        user: { select: { id: true, email: true, profile: true, enrollment: true } },
        program: true,
        admissionCycle: true,
        feePayment: true,
      },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (!coordinatorCanAccessProgram(req, application.programId)) {
      return res.status(403).json({ error: 'Access denied. This application belongs to another department.' });
    }

    const feeIsPaid = application.feePayment && ['PENDING', 'APPROVED'].includes(application.feePayment.status);
    const feeIsApproved = application.feePayment && application.feePayment.status === 'APPROVED';
    const enrollmentSucceeded = feeIsPaid;

    const existingReg  = application.user.enrollment?.registrationNumber || null;
    const existingRoll = application.user.enrollment?.rollNumber || null;
    const adcs = isAdcsProgram(application.program);

    let enrollment;

    // Manual override (coordinator typed roll/reg) — ADCS only. For non-ADCS the
    // numbering scheme is not finalised so manual numbers are ignored.
    const wantsManual = adcs && ((manualRollNumber && String(manualRollNumber).trim()) || (manualRegNumber && String(manualRegNumber).trim()));

    if (feeIsApproved && !wantsManual) {
      // Use the shared, ADCS-only helper (generates roll/reg/LMS for ADCS,
      // confirms-only for non-ADCS).
      enrollment = await confirmEnrollment({
        application: { ...application, userId: application.user.id },
        existingEnrollment: application.user.enrollment,
      });
    } else {
      // Pending fee, or a manual ADCS override.
      let rollNumber;
      let regNumber;
      if (adcs) {
        if (manualRollNumber && String(manualRollNumber).trim()) rollNumber = String(manualRollNumber).trim();
        else if (existingRoll && existingRoll !== 'Pending') rollNumber = existingRoll;
        else if (enrollmentSucceeded) rollNumber = await generateRollNumber({ programCode: application.program.code, cycle: application.admissionCycle });
        else rollNumber = 'Pending';

        if (manualRegNumber && String(manualRegNumber).trim()) regNumber = String(manualRegNumber).trim();
        else if (existingReg && existingReg !== 'Pending') regNumber = existingReg;
        else if (enrollmentSucceeded) regNumber = await generateRegistrationNumber({ cycle: application.admissionCycle, program: application.program, rollNumber });
        else regNumber = 'Pending';
      } else {
        // Non-ADCS: never assign numbers.
        rollNumber = null;
        regNumber = null;
      }

      const finalStatus = feeIsApproved ? 'ENROLLED' : 'PENDING';
      const lmsUsername = (adcs && rollNumber && rollNumber !== 'Pending') ? rollNumber : null;
      // Issue a temp LMS password only for a real ADCS username that doesn't have one yet.
      const needTemp = adcs && lmsUsername && !application.user.enrollment?.lmsPassword
        && !application.user.enrollment?.lmsPasswordHash && !application.user.enrollment?.lmsActivated;
      const tempPw = needTemp ? generateTempPassword() : undefined;
      const baseData = {
        rollNumber, registrationNumber: regNumber,
        lmsUsername,
        feePaid: !!feeIsPaid,
        enrolledAt: feeIsApproved ? new Date() : null,
        status: finalStatus,
      };
      if (needTemp) {
        baseData.lmsPassword = tempPw;
        baseData.lmsMustChangePassword = true;
        baseData.lmsActivated = false;
      }
      enrollment = await prisma.enrollment.upsert({
        where: { userId: application.user.id },
        update: baseData,
        create: { userId: application.user.id, ...baseData },
      });
    }

    const rollNumber = enrollment.rollNumber;
    const regNumber = enrollment.registrationNumber;

    if (feeIsApproved) {
      await prisma.application.update({
        where: { id: parseInt(applicationId) },
        data: { status: 'ENROLLED' },
      });
      await logStatus(parseInt(applicationId), application.user.id, 'ENROLLED', 'Enrolled by coordinator', 'coordinator');
    }

    await prisma.notification.create({
      data: {
        userId: application.user.id,
        title: feeIsApproved ? 'Enrollment Confirmed' : 'Enrollment Pending Fee',
        message: feeIsApproved
          ? `Congratulations! You are enrolled in ${application.program.name}. Your Roll Number is ${rollNumber}.`
          : `Your enrollment is pending fee payment. Your Roll Number and Registration Number will be issued after payment confirmation.`,
      },
    });

    // Dedicated enrollment-confirmed email with all credentials
    if (feeIsApproved) {
      try {
        const userRow = await prisma.user.findUnique({
          where: { id: application.user.id },
          select: { email: true, emailNotifications: true },
        });
        if (userRow?.emailNotifications && userRow?.email) {
          sendEnrollmentConfirmedEmail(
            userRow.email,
            application.program.name,
            enrollment.rollNumber,
            enrollment.registrationNumber,
            enrollment.lmsUsername,
          ).catch(() => {});
        }
      } catch (_) {}
    }

    res.json({
      message: feeIsApproved ? 'Student enrolled successfully' : 'Enrollment pending fee payment',
      enrollment: {
        rollNumber: enrollment.rollNumber,
        registrationNumber: enrollment.registrationNumber,
        lmsUsername: enrollment.lmsUsername,
        feePaid: enrollment.feePaid,
        status: enrollment.status,
      },
    });
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ error: 'Failed to enroll student' });
  }
});

// PUT /api/coordinator/enrollment/:userId/roll-number
router.put('/enrollment/:userId/roll-number', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const { rollNumber } = req.body;
    if (!rollNumber) return res.status(400).json({ error: 'Roll number is required' });

    // Department scoping: the target student must have an application in this
    // coordinator's department.
    if (req.user.role === 'coordinator') {
      const owns = await prisma.application.findFirst({
        where: { userId: parseInt(req.params.userId), ...coordinatorProgramFilter(req) },
        select: { id: true },
      });
      if (!owns) return res.status(403).json({ error: 'Access denied. This student belongs to another department.' });
    }

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
    console.error('Roll number update error:', error);
    res.status(500).json({ error: 'Failed to update roll number' });
  }
});

router.put('/enrollment/:userId/registration-number', authenticate, requireCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const { registrationNumber } = req.body;
    if (!registrationNumber) return res.status(400).json({ error: 'Registration number is required' });

    // Department scoping: the target student must have an application in this
    // coordinator's department.
    if (req.user.role === 'coordinator') {
      const owns = await prisma.application.findFirst({
        where: { userId: parseInt(req.params.userId), ...coordinatorProgramFilter(req) },
        select: { id: true },
      });
      if (!owns) return res.status(403).json({ error: 'Access denied. This student belongs to another department.' });
    }

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
    console.error('Registration number update error:', error);
    if (error.code === 'P2002') return res.status(400).json({ error: 'Registration number already in use' });
    res.status(500).json({ error: 'Failed to update registration number' });
  }
});

module.exports = router;

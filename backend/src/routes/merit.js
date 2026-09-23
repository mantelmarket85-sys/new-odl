const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  authenticate,
  requireAdmin,
  requireAdminOrCoordinator,
  attachCoordinatorScope,
  coordinatorProgramFilter,
  coordinatorCanAccessProgram,
} = require('../middleware/auth');
const { sendMeritListedEmail } = require('../utils/email');
const { computeMerit } = require('../utils/meritWeights');

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================
// GET /api/merit/initial — INITIAL MERIT LIST (Master Prompt Section 5)
// ------------------------------------------------------------
//   Student  → whether THEY are shortlisted for interview.
//   Coordinator (scoped) / Director / Super Admin → the full initial list
//   (ELIGIBLE applicants = "Selected for Interview") plus pending/not-eligible.
// This is the PRE-interview list and is separate from the (post-interview)
// Final Merit List returned by GET /api/merit.
// ============================================================
router.get('/initial', authenticate, attachCoordinatorScope, async (req, res) => {
  try {
    const title = 'Initial Merit List – Selected for Interview';
    if (req.user.role === 'student') {
      const apps = await prisma.application.findMany({
        where: { userId: req.user.id },
        include: { program: true, admissionCycle: { select: { initialMeritPublished: true } } },
      });
      // Additional Fixes §6 — students only see their Initial Merit result once
      // the Admissions Coordinator has PUBLISHED it for that cycle.
      const isPublished = (a) => !!a.admissionCycle?.initialMeritPublished;
      const publishedApps = apps.filter(isPublished);
      const published = apps.length > 0 && apps.every(isPublished)
        ? true
        : publishedApps.length > 0;
      const shortlisted = publishedApps.some((a) => a.interviewEligibility === 'ELIGIBLE');
      const notEligible = publishedApps.some((a) => a.interviewEligibility === 'NOT_ELIGIBLE');
      return res.json({
        title,
        published,
        shortlisted,
        notEligible,
        applications: apps.map((a) => ({
          id: a.id,
          program: a.program?.name,
          // Hide eligibility until published.
          interviewEligibility: isPublished(a) ? a.interviewEligibility : 'PENDING',
          published: isPublished(a),
          status: a.status,
        })),
      });
    }

    // Staff view (coordinator scoped to their department).
    const isCoord = req.user.role === 'coordinator';
    const scope = isCoord ? coordinatorProgramFilter(req) : {};
    const apps = await prisma.application.findMany({
      where: {
        ...scope,
        status: { in: ['FORWARDED', 'INTERVIEWED', 'INTERVIEW_COMPLETED', 'QUALIFIED'] },
      },
      include: {
        program: { include: { department: true } },
        interview: true,
        user: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true, cnic: true } } } },
      },
      orderBy: { submittedAt: 'asc' },
    });
    res.json({
      title,
      selected: apps.filter((a) => a.interviewEligibility === 'ELIGIBLE'),
      notEligible: apps.filter((a) => a.interviewEligibility === 'NOT_ELIGIBLE'),
      pending: apps.filter((a) => !a.interviewEligibility || a.interviewEligibility === 'PENDING'),
    });
  } catch (error) {
    console.error('Initial merit list error:', error);
    res.status(500).json({ error: 'Failed to fetch initial merit list' });
  }
});

// GET /api/merit — student: own merit; admin/coordinator: full list
router.get('/', authenticate, attachCoordinatorScope, async (req, res) => {
  try {
    if (req.user.role === 'student') {
      // ------------------------------------------------------------
      // MERIT VISIBILITY (Phase 2): a student may ONLY see their own
      // merit information. We must NEVER expose the full merit list —
      // no other applicants' names, scores or ranks. Each of the
      // student's own entries (one per program they applied to) carries
      // its own score, rank and status.
      //
      // The rank shown is computed on the server against the finalized
      // pool for THAT program only (rank number, no peer identities).
      // ------------------------------------------------------------
      const entries = await prisma.meritEntry.findMany({
        where: { userId: req.user.id },
        include: {
          application: { include: { program: { include: { department: true } } } },
        },
        orderBy: { totalMerit: 'desc' },
      });

      // Compute a per-program rank for the student's own finalized entries
      // without returning any peer data. If the entry already has a stored
      // rank we keep it; otherwise we derive it from the finalized pool.
      const enriched = [];
      for (const e of entries) {
        let rank = e.rank || null;
        if (!rank && e.isFinalized && e.application?.programId) {
          // eslint-disable-next-line no-await-in-loop
          const higher = await prisma.meritEntry.count({
            where: {
              isFinalized: true,
              application: { is: { programId: e.application.programId } },
              totalMerit: { gt: e.totalMerit },
            },
          });
          rank = higher + 1;
        }
        enriched.push({ ...e, rank });
      }

      // meritList intentionally EMPTY for students — full lists are never
      // exposed to applicants.
      return res.json({ myEntries: enriched, meritList: [] });
    }

    // Admin or coordinator — full list (coordinator scoped to their department).
    // Also annotate each entry with a per-student lock flag so the UI can
    // disable controls row-by-row without an extra round-trip.
    const meritWhere = req.user.role === 'coordinator'
      ? { application: { is: coordinatorProgramFilter(req) } }
      : {};
    const entries = await prisma.meritEntry.findMany({
      where: meritWhere,
      orderBy: { totalMerit: 'desc' },
      include: {
        application: { include: { program: { include: { department: true } }, admissionCycle: true } },
        user: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true, cnic: true } },
          },
        },
      },
    });
    const annotated = entries.map(e => ({
      ...e,
      // Per-student lock: only THIS student is locked once they enroll.
      enrollmentLocked: ENROLLED_STATUSES.includes(e.application?.status),
      applicationStatus: e.application?.status || null,
    }));
    res.json({ meritList: annotated });
  } catch (error) {
    console.error('Get merit error:', error);
    res.status(500).json({ error: 'Failed to fetch merit list' });
  }
});

// ============================================================
// PER-STUDENT enrollment lock.
//
// The merit list is NEVER locked globally. The lock applies on a
// student-by-student basis: only THAT student's merit row is locked once
// THAT student has reached FEE_APPROVED or ENROLLED.
//
// The Director keeps full control over every other student in the list,
// even after the merit list has been finalized, until each one of them
// individually reaches the enrollment stage.
// ============================================================
const ENROLLED_STATUSES = ['FEE_APPROVED', 'ENROLLED'];

// Is THIS specific application/student locked by their own enrollment?
async function isApplicationEnrollmentLocked(applicationId) {
  if (!applicationId) return false;
  const app = await prisma.application.findUnique({
    where: { id: parseInt(applicationId) },
    select: { status: true },
  });
  if (!app) return false;
  return ENROLLED_STATUSES.includes(app.status);
}

// Convenience wrapper for endpoints that receive a meritEntry id.
async function isMeritEntryEnrollmentLocked(meritEntryId) {
  const entry = await prisma.meritEntry.findUnique({
    where: { id: parseInt(meritEntryId) },
    select: { applicationId: true },
  });
  if (!entry) return false;
  return isApplicationEnrollmentLocked(entry.applicationId);
}

// How many students in the list are individually locked? Used by the UI
// for an informational badge — never to globally disable controls.
async function countEnrollmentLockedApplications() {
  return prisma.application.count({
    where: { status: { in: ENROLLED_STATUSES } },
  });
}

// PUT /api/merit/:id — edit individual merit score
//   - Coordinator: only when entry NOT finalized (existing behaviour)
//   - Director:    allowed even AFTER finalization, UNTIL THIS SPECIFIC
//                  student reaches FEE_APPROVED / ENROLLED stage. Other
//                  students remain editable.
router.put('/:id', authenticate, requireAdminOrCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const { matricPercent, fscPercent, interviewMarks } = req.body;
    const entry = await prisma.meritEntry.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { application: { include: { admissionCycle: true, program: true } } },
    });
    if (!entry) return res.status(404).json({ error: 'Merit entry not found' });

    // Coordinator department scoping — cannot edit another department's merit entry.
    if (!coordinatorCanAccessProgram(req, entry.application?.programId)) {
      return res.status(403).json({ error: 'Access denied. This merit entry belongs to another department.' });
    }

    const isDirector = req.user.role === 'director_admissions' || req.user.role === 'admin';

    // Block coordinator edits once finalized (Director has locked the list)
    if (entry.isFinalized && !isDirector) {
      return res.status(403).json({ error: 'Merit list has been finalized by the Director. No further edits allowed.' });
    }

    // Per-student lock: only THIS student is locked once THEY reach
    // FEE_APPROVED / ENROLLED. Other students stay editable.
    if (ENROLLED_STATUSES.includes(entry.application.status)) {
      return res.status(403).json({
        error: 'This student has already completed enrollment. Their merit record is locked. Other students in the list remain editable.',
      });
    }

    const cycle = entry.application.admissionCycle;
    const program = entry.application.program;
    const mp = matricPercent !== undefined ? parseFloat(matricPercent) : entry.matricPercent;
    const fp = fscPercent !== undefined ? parseFloat(fscPercent) : entry.fscPercent;
    const im = interviewMarks !== undefined ? parseFloat(interviewMarks) : entry.interviewMarks;

    // Per-program merit criteria (Additional Fixes §3). Interview weight of 0%
    // automatically drops interview marks from the calculation.
    const { matricWeighted, fscWeighted, interviewWeighted, totalMerit } = computeMerit({
      matricPercent: mp, fscPercent: fp, interviewMarks: im, program, cycle,
    });

    const updated = await prisma.meritEntry.update({
      where: { id: parseInt(req.params.id) },
      data: {
        matricPercent: mp, fscPercent: fp, interviewMarks: im,
        matricWeighted, fscWeighted, interviewWeighted, totalMerit,
      },
    });

    // Audit trail — record the change so the student timeline reflects it
    await prisma.statusEvent.create({
      data: {
        applicationId: entry.applicationId,
        userId: entry.userId,
        status: 'SELECTED',
        remarks: `Merit score updated by ${isDirector ? 'Director' : 'Coordinator'} (Total ${totalMerit.toFixed(2)}%)`,
        actorRole: req.user.role,
      },
    }).catch(() => {});

    res.json({ message: 'Merit entry updated', entry: updated });
  } catch (error) {
    console.error('Update merit error:', error);
    res.status(500).json({ error: 'Failed to update merit entry' });
  }
});

// ============================================================
// DIRECTOR-ONLY: full merit list control (before any student is enrolled)
// ============================================================

// POST /api/merit/add — Director adds a student to the merit list manually.
// Body: { applicationId, matricPercent?, fscPercent?, interviewMarks? }
// If the application already has a meritEntry, returns 409.
//
// Per-student lock: a student already at FEE_APPROVED / ENROLLED cannot be
// re-added (they've already completed enrollment). Other students are not
// affected — adding new students is always allowed.
router.post('/add', authenticate, requireAdmin, async (req, res) => {
  try {
    const { applicationId, matricPercent, fscPercent, interviewMarks } = req.body;
    if (!applicationId) return res.status(400).json({ error: 'applicationId is required' });

    if (await isApplicationEnrollmentLocked(applicationId)) {
      return res.status(403).json({
        error: 'This student has already completed enrollment and cannot be modified.',
      });
    }

    const application = await prisma.application.findUnique({
      where: { id: parseInt(applicationId) },
      include: { admissionCycle: true, meritEntry: true, interview: true, program: true },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.meritEntry) {
      return res.status(409).json({ error: 'This application already has a merit entry' });
    }

    const cycle = application.admissionCycle;
    const program = application.program;
    const mp = parseFloat(matricPercent ?? 0);
    const fp = parseFloat(fscPercent ?? 0);
    const im = parseFloat(interviewMarks ?? application.interview?.marks ?? 0);
    // Per-program merit criteria (Additional Fixes §3).
    const { matricWeighted, fscWeighted, interviewWeighted, totalMerit } = computeMerit({
      matricPercent: mp, fscPercent: fp, interviewMarks: im, program, cycle,
    });

    const entry = await prisma.meritEntry.create({
      data: {
        applicationId: application.id,
        userId: application.userId,
        matricPercent: mp,
        fscPercent: fp,
        interviewMarks: im,
        matricWeighted, fscWeighted, interviewWeighted, totalMerit,
        isFinalized: false,
      },
    });

    await prisma.statusEvent.create({
      data: {
        applicationId: application.id,
        userId: application.userId,
        status: 'SELECTED',
        remarks: `Added to merit list by Director (Total ${totalMerit.toFixed(2)}%)`,
        actorRole: req.user.role,
      },
    }).catch(() => {});

    await prisma.notification.create({
      data: {
        userId: application.userId,
        title: 'Added to Merit Pool',
        message: 'You have been added to the merit list by the Director. The final ranking will be visible once the merit list is finalized.',
      },
    }).catch(() => {});

    res.status(201).json({ message: 'Merit entry created', entry });
  } catch (error) {
    console.error('Add merit error:', error);
    res.status(500).json({ error: 'Failed to add merit entry' });
  }
});

// DELETE /api/merit/:id — Director removes a student from the merit list.
// Per-student lock: only blocks if THIS specific student is enrolled. Other
// students in the list can still be removed independently.
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const entry = await prisma.meritEntry.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!entry) return res.status(404).json({ error: 'Merit entry not found' });

    // Per-student lock — only blocks if THIS student is already enrolled.
    const app = await prisma.application.findUnique({ where: { id: entry.applicationId } });
    if (app && ENROLLED_STATUSES.includes(app.status)) {
      return res.status(403).json({
        error: 'Cannot remove: this student has already completed enrollment. Other students in the list remain editable.',
      });
    }

    await prisma.meritEntry.delete({ where: { id: entry.id } });

    // If application status was already SELECTED/FEE_PENDING, roll it back to QUALIFIED
    if (app && ['SELECTED', 'FEE_PENDING'].includes(app.status)) {
      await prisma.application.update({
        where: { id: app.id },
        data: { status: 'QUALIFIED', adminRemarks: 'Removed from merit list by Director' },
      });
    }

    await prisma.statusEvent.create({
      data: {
        applicationId: entry.applicationId,
        userId: entry.userId,
        status: 'QUALIFIED',
        remarks: 'Removed from merit list by Director',
        actorRole: req.user.role,
      },
    }).catch(() => {});

    await prisma.notification.create({
      data: {
        userId: entry.userId,
        title: 'Removed from Merit List',
        message: 'You have been removed from the merit list by the Director. Please contact the admissions office for details.',
      },
    }).catch(() => {});

    res.json({ message: 'Merit entry removed' });
  } catch (error) {
    console.error('Remove merit error:', error);
    res.status(500).json({ error: 'Failed to remove merit entry' });
  }
});

// PUT /api/merit/:id/rank — Director manually overrides a merit rank.
// Body: { rank: <int> } — 1 is the topmost.
// Re-numbers all other entries to keep ranks contiguous, BUT skips already-
// enrolled students so their ranks stay frozen on their original position.
router.put('/:id/rank', authenticate, requireAdmin, async (req, res) => {
  try {
    const newRank = parseInt(req.body.rank);
    if (!newRank || newRank < 1) return res.status(400).json({ error: 'rank must be a positive integer' });

    const target = await prisma.meritEntry.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { application: { select: { status: true } } },
    });
    if (!target) return res.status(404).json({ error: 'Merit entry not found' });

    // Per-student lock: cannot re-rank a student who has already enrolled.
    if (ENROLLED_STATUSES.includes(target.application.status)) {
      return res.status(403).json({
        error: 'Cannot change rank: this student has already completed enrollment. Other students in the list remain editable.',
      });
    }

    // Pull all entries with their current application status so we can
    // distinguish enrolled (locked) entries from editable ones.
    const all = await prisma.meritEntry.findMany({
      orderBy: [{ rank: 'asc' }, { totalMerit: 'desc' }],
      include: { application: { select: { status: true } } },
    });

    // Enrolled rows keep their existing rank — they're frozen.
    const lockedRows  = all.filter(e => ENROLLED_STATUSES.includes(e.application.status) && e.id !== target.id);
    const movableRows = all.filter(e => !ENROLLED_STATUSES.includes(e.application.status) && e.id !== target.id);

    const clamped = Math.min(Math.max(1, newRank), movableRows.length + 1);
    movableRows.splice(clamped - 1, 0, target);

    // Persist: locked rows keep their stored rank; movable rows are
    // renumbered, skipping any rank already held by a locked row.
    const lockedRanks = new Set(lockedRows.map(r => r.rank).filter(Boolean));
    let nextRank = 1;
    for (const row of movableRows) {
      while (lockedRanks.has(nextRank)) nextRank++;
      await prisma.meritEntry.update({
        where: { id: row.id },
        data: { rank: nextRank },
      });
      nextRank++;
    }

    await prisma.statusEvent.create({
      data: {
        applicationId: target.applicationId,
        userId: target.userId,
        status: 'SELECTED',
        remarks: `Merit rank set to #${clamped} by Director`,
        actorRole: req.user.role,
      },
    }).catch(() => {});

    res.json({ message: `Rank updated to #${clamped}`, rank: clamped });
  } catch (error) {
    console.error('Rank update error:', error);
    res.status(500).json({ error: 'Failed to update rank' });
  }
});

// POST /api/merit/reopen — Director re-opens the (non-enrolled portion of
// the) finalized merit list. Already-enrolled students keep their finalized
// state — only the still-editable portion is reopened.
router.post('/reopen', authenticate, requireAdmin, async (req, res) => {
  try {
    // Section 7: per-program reopen independence. When a programId is supplied,
    // only that program's finalized non-enrolled entries are reopened.
    const programId = req.body?.programId ? parseInt(req.body.programId) : null;
    const programScope = programId ? { programId, status: { notIn: ENROLLED_STATUSES } } : { status: { notIn: ENROLLED_STATUSES } };

    // Find the set of merit entries that belong to NON-enrolled students.
    // Those are the ones we can safely reopen.
    const reopenable = await prisma.meritEntry.findMany({
      where: {
        isFinalized: true,
        application: programScope,
      },
      select: { id: true },
    });

    if (reopenable.length === 0) {
      return res.status(400).json({
        error: 'Nothing to reopen. All merit entries belong to already-enrolled students.',
      });
    }

    // Unlock only the non-enrolled merit entries. Enrolled rows stay locked.
    await prisma.meritEntry.updateMany({
      where: { id: { in: reopenable.map(e => e.id) } },
      data: { isFinalized: false },
    });

    // Roll FEE_PENDING applications back to SELECTED so director can edit and
    // the announce-fee step can be re-run after re-finalization. Anything
    // already FEE_PAID/FEE_APPROVED/ENROLLED is left untouched.
    const rollbackWhere = programId ? { status: 'FEE_PENDING', programId } : { status: 'FEE_PENDING' };
    const rolledBack = await prisma.application.findMany({
      where: rollbackWhere,
      select: { id: true, userId: true },
    });
    await prisma.application.updateMany({
      where: rollbackWhere,
      data: { status: 'SELECTED', adminRemarks: 'Merit list reopened by Director for revision' },
    });

    for (const app of rolledBack) {
      await prisma.statusEvent.create({
        data: {
          applicationId: app.id,
          userId: app.userId,
          status: 'SELECTED',
          remarks: 'Merit list reopened by Director — fee payment temporarily paused',
          actorRole: req.user.role,
        },
      }).catch(() => {});
      await prisma.notification.create({
        data: {
          userId: app.userId,
          title: 'Merit List Reopened',
          message: 'The Director has reopened the merit list for review. Fee payment is temporarily paused. You will be notified once the list is re-finalized.',
        },
      }).catch(() => {});
    }

    res.json({
      message: `Merit list reopened for ${reopenable.length} student(s). ${rolledBack.length} application(s) rolled back from FEE_PENDING to SELECTED. Already-enrolled students were not affected.`,
      reopenedCount: reopenable.length,
      rolledBackCount: rolledBack.length,
    });
  } catch (error) {
    console.error('Reopen merit error:', error);
    res.status(500).json({ error: 'Failed to reopen merit list' });
  }
});

// GET /api/merit/eligible-applications — Director helper: list applications
// that are eligible to be added to the merit list (no merit entry yet).
router.get('/eligible-applications', authenticate, requireAdmin, async (req, res) => {
  try {
    const apps = await prisma.application.findMany({
      where: {
        meritEntry: null,
        status: { in: ['INTERVIEWED', 'INTERVIEW_COMPLETED', 'QUALIFIED', 'FORWARDED'] },
      },
      include: {
        program: true,
        interview: true,
        user: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true, cnic: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
    });
    res.json({ applications: apps });
  } catch (error) {
    console.error('Eligible apps error:', error);
    res.status(500).json({ error: 'Failed to fetch eligible applications' });
  }
});

// GET /api/merit/lock-status — per-student lock map for the frontend.
// Returns:
//   - enrollmentLocked: false  (kept for backward compatibility — the list is
//                               NEVER globally locked under the new policy)
//   - lockedApplicationIds:    array of applicationIds whose individual rows
//                              are locked because that student has enrolled
//   - lockedCount / totalCount / finalizedCount / anyFinalized / allFinalized
router.get('/lock-status', authenticate, requireAdminOrCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const isCoord = req.user.role === 'coordinator';
    const scope = isCoord ? coordinatorProgramFilter(req) : {};
    const meritScope = isCoord ? { application: { is: scope } } : {};
    const lockedApps = await prisma.application.findMany({
      where: { status: { in: ENROLLED_STATUSES }, ...scope },
      select: { id: true },
    });
    const finalizedCount = await prisma.meritEntry.count({ where: { isFinalized: true, ...meritScope } });
    const totalCount = await prisma.meritEntry.count({ where: meritScope });
    res.json({
      // Globally never locked — control is per-student now.
      enrollmentLocked: false,
      perStudentLock: true,
      lockedApplicationIds: lockedApps.map(a => a.id),
      lockedCount: lockedApps.length,
      finalizedCount,
      totalCount,
      anyFinalized: finalizedCount > 0,
      allFinalized: totalCount > 0 && finalizedCount === totalCount,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lock status' });
  }
});

// Minimum FSC eligibility for the merit list (university policy).
const MIN_FSC_PERCENT_FOR_MERIT = 45;

// POST /api/merit/finalize — finalize and publish merit list (admin only) — LOCKS the list
// Eligibility rule: only entries with FSC% >= 45 are kept on the merit list.
// Entries below 45% are removed from merit eligibility BEFORE ranking, and the
// associated applications are set back to QUALIFIED (without merit selection).
router.post('/finalize', authenticate, requireAdmin, async (req, res) => {
  try {
    // Section 7: per-program finalize independence. When a `programId` is
    // supplied, only that program's merit pool is finalized; other programs'
    // lists remain untouched. When omitted, the legacy global finalize runs.
    const programId = req.body?.programId ? parseInt(req.body.programId) : null;
    const meritWhere = programId ? { application: { is: { programId } } } : {};

    // Per-student lock policy: finalization NEVER touches already-enrolled
    // students. Their merit row keeps its existing rank and isFinalized flag.
    // Only the non-enrolled, non-finalized portion is (re)ranked and
    // (re)finalized.
    const allEntries = await prisma.meritEntry.findMany({
      where: meritWhere,
      orderBy: { totalMerit: 'desc' },
      include: { application: { include: { program: true } } },
    });

    if (allEntries.length === 0) {
      return res.status(400).json({ error: programId ? 'No merit entries to finalize for this program' : 'No merit entries to finalize' });
    }

    // Frozen rows = enrolled students. They keep their existing rank and
    // finalized flag. New finalization never moves them.
    const frozen   = allEntries.filter(e => ENROLLED_STATUSES.includes(e.application.status));

    // Working set = everyone else. From this set we split eligible / ineligible.
    const working  = allEntries.filter(e => !ENROLLED_STATUSES.includes(e.application.status));

    if (working.every(e => e.isFinalized) && working.length > 0) {
      return res.status(400).json({ error: 'All non-enrolled merit entries are already finalized. Use Reopen to make further changes.' });
    }

    // Split working set: eligible (>=45%) vs ineligible (<45%)
    const eligible   = working.filter(e => (e.fscPercent || 0) >= MIN_FSC_PERCENT_FOR_MERIT);
    const ineligible = working.filter(e => (e.fscPercent || 0) <  MIN_FSC_PERCENT_FOR_MERIT);

    if (eligible.length === 0) {
      return res.status(400).json({
        error: `No applicants meet the minimum FSC requirement of ${MIN_FSC_PERCENT_FOR_MERIT}% for the merit list.`,
      });
    }

    // Drop ineligible entries from merit pool — they cannot pay enrollment fee
    for (const entry of ineligible) {
      await prisma.meritEntry.delete({ where: { id: entry.id } }).catch(() => {});
      // Application stays at QUALIFIED (or whatever it was) but never moves to FEE_PENDING
      await prisma.application.update({
        where: { id: entry.applicationId },
        data: {
          adminRemarks: `Below ${MIN_FSC_PERCENT_FOR_MERIT}% FSC threshold — not eligible for merit selection`,
        },
      }).catch(() => {});
      await prisma.statusEvent.create({
        data: {
          applicationId: entry.applicationId,
          userId: entry.userId,
          status: 'QUALIFIED',
          remarks: `Removed from merit list — FSC ${entry.fscPercent?.toFixed(2)}% is below the ${MIN_FSC_PERCENT_FOR_MERIT}% threshold`,
          actorRole: 'system',
        },
      }).catch(() => {});
      await prisma.notification.create({
        data: {
          userId: entry.userId,
          title: 'Not Eligible for Merit List',
          message: `Your FSc score of ${entry.fscPercent?.toFixed(2)}% is below the minimum ${MIN_FSC_PERCENT_FOR_MERIT}% required for the final merit list. The enrollment fee is not available.`,
        },
      }).catch(() => {});
    }

    // Frozen (already-enrolled) rows keep their existing rank — we
    // renumber the eligible non-enrolled rows around them.
    const frozenRanks = new Set(frozen.map(f => f.rank).filter(Boolean));

    // Re-sort eligible entries (already sorted) and assign ranks + finalize.
    // Skip ranks already held by frozen / enrolled rows.
    eligible.sort((a, b) => b.totalMerit - a.totalMerit);
    let nextRank = 1;
    for (const entry of eligible) {
      while (frozenRanks.has(nextRank)) nextRank++;
      await prisma.meritEntry.update({
        where: { id: entry.id },
        data: { rank: nextRank, isFinalized: true },
      });
      entry.rank = nextRank; // keep local copy in sync for messaging
      nextRank++;
    }

    // Move eligible applications to FEE_PENDING so students can now pay
    await prisma.application.updateMany({
      where: {
        id: { in: eligible.map(e => e.applicationId) },
        status: { in: ['SELECTED', 'INTERVIEWED', 'INTERVIEW_COMPLETED', 'QUALIFIED'] },
      },
      data: { status: 'FEE_PENDING' },
    });

    // Status events + notifications for eligible students
    for (const entry of eligible) {
      await prisma.statusEvent.create({
        data: {
          applicationId: entry.applicationId,
          userId: entry.userId,
          status: 'FEE_PENDING',
          remarks: `Merit list finalized. Rank #${entry.rank}. Enrollment fee unlocked.`,
          actorRole: 'system',
        },
      }).catch(() => {});
      await prisma.notification.create({
        data: {
          userId: entry.userId,
          title: 'Merit List Finalized — You are Selected!',
          message: `The merit list for ${entry.application.program.name} has been finalized. Your rank: #${entry.rank} with a merit score of ${entry.totalMerit.toFixed(2)}%. You can now proceed to pay the admission fee from the Fee tab.`,
        },
      }).catch(() => {});

      // Dedicated merit-listed email
      try {
        const userRow = await prisma.user.findUnique({
          where: { id: entry.userId },
          select: { email: true, emailNotifications: true },
        });
        if (userRow?.emailNotifications && userRow?.email) {
          sendMeritListedEmail(
            userRow.email,
            entry.application.program.name,
            entry.applicationId,
            entry.rank,
          ).catch(() => {});
        }
      } catch (_) {}
    }

    res.json({
      message: `Merit list finalized. ${eligible.length} eligible entr${eligible.length === 1 ? 'y' : 'ies'} ranked.${ineligible.length > 0 ? ` ${ineligible.length} entr${ineligible.length === 1 ? 'y' : 'ies'} below ${MIN_FSC_PERCENT_FOR_MERIT}% FSC removed from merit.` : ''}${frozen.length > 0 ? ` ${frozen.length} already-enrolled entr${frozen.length === 1 ? 'y was' : 'ies were'} preserved unchanged.` : ''} Director can still edit non-enrolled students; use Reopen if students need to be moved back to SELECTED.`,
      eligibleCount: eligible.length,
      removedCount: ineligible.length,
      frozenCount: frozen.length,
      minFscPercent: MIN_FSC_PERCENT_FOR_MERIT,
    });
  } catch (error) {
    console.error('Finalize merit error:', error);
    res.status(500).json({ error: 'Failed to finalize merit list' });
  }
});

module.exports = router;

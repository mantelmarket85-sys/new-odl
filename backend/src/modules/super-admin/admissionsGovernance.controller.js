// ============================================================
//  SUPER ADMIN — ADMISSIONS GOVERNANCE CONTROLLER
//  ------------------------------------------------------------
//  Lets the Super Admin perform EVERY Director-Admissions and
//  Admissions-Coordinator action from his own command center, with
//  the SAME database effect the original role would produce. Every
//  action is logged to SaActivityLog; every decision that changes an
//  application status also writes a StatusEvent (so the admissions
//  timeline reflects it exactly as a Director decision would) and,
//  when it is an override of an existing decision, an OverrideLog row
//  with a mandatory reason.
//
//  This module ADDS new namespaced endpoints. It does NOT modify any
//  existing admissions route, controller, service or table. It only
//  writes to the SAME records the admissions system already owns, so
//  the change reflects across the whole platform in real time.
// ============================================================
const { prisma, logSaActivity, logOverride } = require('./superAdmin.service');

// Director full-override status whitelist (mirrors routes/admin.js).
const VALID_STATUSES = [
  'PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'FORWARDED',
  'REJECTED', 'NEED_INFO', 'RESULT_AWAITED',
  'INTERVIEWED', 'INTERVIEW_COMPLETED',
  'QUALIFIED', 'DISQUALIFIED', 'SELECTED',
  'FEE_PENDING', 'FEE_PAID', 'FEE_APPROVED', 'ENROLLED',
];

function pageArgs(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// ------------------------------------------------------------------
// LIST APPLICATIONS — every application across all departments /
// programs / batches with full detail (Director-level visibility).
// ------------------------------------------------------------------
async function listApplications(req, res) {
  try {
    const { page, pageSize, skip, take } = pageArgs(req);
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.programId) where.programId = parseInt(req.query.programId, 10);
    // Part C — Department filter enforced at the DB query level (via the
    // program's departmentId) so the dashboard never mixes departments.
    if (req.query.departmentId) where.program = { departmentId: parseInt(req.query.departmentId, 10) };
    if (req.query.cycleId) where.admissionCycleId = parseInt(req.query.cycleId, 10);
    if (req.query.search) {
      where.user = {
        OR: [
          { email: { contains: req.query.search } },
          { username: { contains: req.query.search } },
        ],
      };
    }
    const [rows, total] = await Promise.all([
      prisma.application.findMany({
        where, skip, take, orderBy: { submittedAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, username: true, profile: { select: { firstName: true, lastName: true, fatherName: true, cnic: true, phone: true } } } },
          program: { select: { id: true, name: true, departmentId: true, department: { select: { id: true, name: true } } } },
          admissionCycle: { select: { id: true, title: true } },
          interview: true,
          meritEntry: true,
          feePayment: { select: { id: true, status: true, amount: true } },
        },
      }),
      prisma.application.count({ where }),
    ]);
    res.json({ applications: rows, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) {
    console.error('SA listApplications error:', e);
    res.status(500).json({ error: 'Failed to load applications' });
  }
}

// ------------------------------------------------------------------
// APPLICATION DETAIL — full candidate profile + documents + timeline.
// ------------------------------------------------------------------
async function getApplication(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const app = await prisma.application.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true, email: true, username: true,
            profile: true,
            educations: true,
          },
        },
        program: true,
        admissionCycle: true,
        interview: true,
        meritEntry: true,
        feePayment: true,
        statusEvents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!app) return res.status(404).json({ error: 'Application not found' });
    // documents are stored on the user
    const documents = await prisma.document.findMany({ where: { userId: app.userId }, orderBy: { createdAt: 'desc' } });
    res.json({ application: app, documents });
  } catch (e) {
    console.error('SA getApplication error:', e);
    res.status(500).json({ error: 'Failed to load application' });
  }
}

// ------------------------------------------------------------------
// DECISION — approve / reject / set any status (Director effect).
// Mirrors the core effect of routes/admin.js PUT /applications/:id/decision:
//   - validates status, requires a reason on REJECT
//   - updates the application
//   - syncs interview/merit sub-records on key transitions
//   - writes a StatusEvent (timeline) and SaActivityLog
//   - writes an OverrideLog when overriding an existing decision
// ------------------------------------------------------------------
async function decideApplication(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, remarks, rejectionReason, reason } = req.body || {};
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (status === 'REJECTED') {
      const r = rejectionReason || remarks || reason;
      if (!r || String(r).trim().length < 5) {
        return res.status(400).json({ error: 'A clear rejection reason (min 5 characters) is required when rejecting an application' });
      }
    }

    const application = await prisma.application.findUnique({
      where: { id },
      include: { program: true, interview: true, meritEntry: true },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const previousStatus = application.status;

    const updateData = { status, adminRemarks: remarks || null };
    if (status === 'REJECTED') {
      updateData.rejectionReason = rejectionReason || remarks || reason;
    } else if (previousStatus === 'REJECTED') {
      updateData.rejectionReason = null;
    }

    const updated = await prisma.application.update({
      where: { id },
      data: updateData,
      include: { program: true },
    });

    // ---- Sync sub-records (mirror Director behaviour) ----
    if (status === 'DISQUALIFIED') {
      await prisma.meritEntry.deleteMany({ where: { applicationId: id } }).catch(() => {});
      if (application.interview) {
        await prisma.interview.update({
          where: { id: application.interview.id },
          data: { decision: 'DISQUALIFIED', status: 'COMPLETED' },
        }).catch(() => {});
      }
    }
    if (previousStatus === 'DISQUALIFIED' && status !== 'DISQUALIFIED' && application.interview) {
      await prisma.interview.update({
        where: { id: application.interview.id },
        data: { decision: 'PENDING' },
      }).catch(() => {});
    }
    if (status === 'FORWARDED' && previousStatus !== 'FORWARDED') {
      if (application.interview) {
        await prisma.interview.update({
          where: { id: application.interview.id },
          data: { decision: 'PENDING', status: 'SCHEDULED', marks: null, remarks: 'Reset by Super Admin — re-forwarded to coordinator' },
        }).catch(() => {});
      }
      await prisma.meritEntry.deleteMany({ where: { applicationId: id } }).catch(() => {});
    }

    // ---- StatusEvent timeline (same as a Director decision) ----
    await prisma.statusEvent.create({
      data: {
        applicationId: id,
        userId: application.userId,
        status,
        remarks: remarks || rejectionReason || reason || null,
        actorRole: 'super_admin',
      },
    }).catch(() => {});

    // ---- Audit ----
    await logSaActivity({
      req, module: 'admissions', action: 'application_decision',
      description: `Set application #${id} → ${status} (was ${previousStatus})`,
      metadata: { applicationId: id, from: previousStatus, to: status },
    });
    // It's an override whenever we change a non-trivial existing decision.
    if (previousStatus && previousStatus !== status) {
      await logOverride({
        req, targetModule: 'admissions.application', targetId: id,
        action: 'status_change', originalValue: previousStatus, newValue: status,
        reason: reason || remarks || rejectionReason || 'Super Admin governance decision',
      });
    }

    res.json({ success: true, application: updated });
  } catch (e) {
    console.error('SA decideApplication error:', e);
    res.status(500).json({ error: 'Failed to update application decision' });
  }
}

// ------------------------------------------------------------------
// DOCUMENT VERIFICATION — coordinator effect. Records a verification
// status + remark per document via SaActivityLog (the admissions
// Document model has no status column, so we keep the verification
// state in the audit/override log without altering the table — fully
// non-destructive). Returns the candidate's documents.
// ------------------------------------------------------------------
async function listCandidateDocuments(req, res) {
  try {
    const userId = parseInt(req.params.userId, 10);
    const documents = await prisma.document.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    res.json({ documents });
  } catch (e) {
    console.error('SA listCandidateDocuments error:', e);
    res.status(500).json({ error: 'Failed to load documents' });
  }
}

async function verifyDocument(req, res) {
  try {
    const documentId = parseInt(req.params.id, 10);
    const { verificationStatus, remarks } = req.body || {};
    const allowed = ['VERIFIED', 'MISSING', 'REJECTED', 'PENDING'];
    if (!allowed.includes(verificationStatus)) {
      return res.status(400).json({ error: 'verificationStatus must be one of VERIFIED|MISSING|REJECTED|PENDING' });
    }
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    await logSaActivity({
      req, module: 'admissions', action: 'document_verify',
      description: `Document #${documentId} (${doc.type}) marked ${verificationStatus}`,
      metadata: { documentId, userId: doc.userId, verificationStatus, remarks: remarks || null },
    });
    res.json({ success: true, documentId, verificationStatus, remarks: remarks || null });
  } catch (e) {
    console.error('SA verifyDocument error:', e);
    res.status(500).json({ error: 'Failed to verify document' });
  }
}

// ------------------------------------------------------------------
// MERIT LISTS — per program / per cycle (Director visibility).
// ------------------------------------------------------------------
async function listMerit(req, res) {
  try {
    const where = {};
    if (req.query.programId) where.application = { programId: parseInt(req.query.programId, 10) };
    const entries = await prisma.meritEntry.findMany({
      where,
      orderBy: [{ totalMerit: 'desc' }],
      include: {
        application: { select: { id: true, status: true, programId: true, program: { select: { id: true, name: true, departmentId: true, department: { select: { id: true, name: true } } } } } },
        user: { select: { id: true, email: true, username: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      take: 1000,
    });
    res.json({ merit: entries });
  } catch (e) {
    console.error('SA listMerit error:', e);
    res.status(500).json({ error: 'Failed to load merit list' });
  }
}

// ------------------------------------------------------------------
// ADMISSIONS STATISTICS — totals + per-program / per-status charts.
// ------------------------------------------------------------------
async function admissionsStats(req, res) {
  try {
    const [byStatus, byProgram, totals] = await Promise.all([
      prisma.application.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.application.groupBy({ by: ['programId'], _count: { _all: true } }),
      prisma.application.count(),
    ]);
    const programs = await prisma.program.findMany({ select: { id: true, name: true } });
    const programMap = Object.fromEntries(programs.map((p) => [p.id, p.name]));
    res.json({
      totalApplications: totals,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      byProgram: byProgram.map((p) => ({ programId: p.programId, program: programMap[p.programId] || `#${p.programId}`, count: p._count._all })),
    });
  } catch (e) {
    console.error('SA admissionsStats error:', e);
    res.status(500).json({ error: 'Failed to load admissions stats' });
  }
}

// ------------------------------------------------------------------
// ADMISSION CYCLES (exclusive config) — open/close cycles, set merit
// criteria, min qualification, weightage, roll/registration formats.
// Operates on the SAME AdmissionCycle records the admissions system
// uses, so changes reflect everywhere instantly.
// ------------------------------------------------------------------
async function listCycles(req, res) {
  try {
    const cycles = await prisma.admissionCycle.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { applications: true } } },
    });
    res.json({ cycles });
  } catch (e) {
    console.error('SA listCycles error:', e);
    res.status(500).json({ error: 'Failed to load admission cycles' });
  }
}

async function updateCycle(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Cycle not found' });

    const b = req.body || {};
    const data = {};
    const numFields = ['minMarksPercent', 'matricWeight', 'fscWeight', 'interviewWeight', 'applicationProcessingFee'];
    const strFields = ['title', 'startDate', 'endDate', 'termCode', 'instituteCode', 'facultyCode', 'departmentCode'];
    numFields.forEach((f) => { if (b[f] !== undefined && b[f] !== null && b[f] !== '') data[f] = Number(b[f]); });
    strFields.forEach((f) => { if (b[f] !== undefined) data[f] = String(b[f]); });
    if (b.isOpen !== undefined) data.isOpen = !!b.isOpen;

    const updated = await prisma.admissionCycle.update({ where: { id }, data });
    await logSaActivity({
      req, module: 'admissions', action: 'cycle_update',
      description: `Updated admission cycle #${id} (${updated.title})`,
      metadata: { cycleId: id, changes: data },
    });
    res.json({ success: true, cycle: updated });
  } catch (e) {
    console.error('SA updateCycle error:', e);
    res.status(500).json({ error: 'Failed to update admission cycle' });
  }
}

async function toggleCycle(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { isOpen } = req.body || {};
    const existing = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Cycle not found' });
    const updated = await prisma.admissionCycle.update({ where: { id }, data: { isOpen: !!isOpen } });
    await logSaActivity({
      req, module: 'admissions', action: 'cycle_toggle',
      description: `${isOpen ? 'Opened' : 'Closed'} admission cycle #${id} (${updated.title})`,
      metadata: { cycleId: id, isOpen: !!isOpen },
    });
    res.json({ success: true, cycle: updated });
  } catch (e) {
    console.error('SA toggleCycle error:', e);
    res.status(500).json({ error: 'Failed to toggle admission cycle' });
  }
}

module.exports = {
  listApplications, getApplication, decideApplication,
  listCandidateDocuments, verifyDocument,
  listMerit, admissionsStats,
  listCycles, updateCycle, toggleCycle,
};

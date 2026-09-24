// ============================================================
//  SUPER ADMIN — REPORTS & OVERRIDE SERVICE
//  ------------------------------------------------------------
//  Report aggregation + CSV export, plus the OVERRIDE endpoints
//  that let the super admin force-change records in other modules.
//  Every override is logged PERMANENTLY to OverrideLog (with a
//  mandatory reason) via superAdmin.service.logOverride().
// ============================================================
const prisma = require('../../utils/prisma');
const { logOverride, logSaActivity } = require('./superAdmin.service');

// ---- CSV helper ---------------------------------------------------------
function toCsv(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach((r) => lines.push(headers.map((h) => escape(r[h])).join(',')));
  return lines.join('\n');
}

function sendCsv(res, filename, rows) {
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// ---- Reports: summary ---------------------------------------------------
async function reportSummary(req, res) {
  try {
    const [
      totalApplications, enrolled, totalStudents, totalFaculty,
      totalCourses, totalDepartments,
    ] = await Promise.all([
      prisma.application.count(),
      prisma.application.count({ where: { status: 'ENROLLED' } }),
      prisma.lmsUser.count({ where: { role: 'Student' } }),
      prisma.lmsUser.count({ where: { role: 'Teacher' } }),
      prisma.lmsCourse.count({ where: { isDeleted: false } }).catch(() => 0),
      prisma.department.count(),
    ]);
    const byStatus = await prisma.application.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => []);
    res.json({
      totals: { totalApplications, enrolled, totalStudents, totalFaculty, totalCourses, totalDepartments },
      applicationsByStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    });
  } catch (e) {
    console.error('SA reportSummary error:', e);
    res.status(500).json({ error: 'Failed to build report summary' });
  }
}

// ---- Reports: exports (CSV) ---------------------------------------------
async function exportUsers(req, res) {
  try {
    const [admUsers, lmsUsers] = await Promise.all([
      prisma.user.findMany({ select: { id: true, email: true, username: true, role: true, isActive: true, createdAt: true } }),
      prisma.lmsUser.findMany({ select: { id: true, email: true, username: true, role: true, isActive: true, createdAt: true } }),
    ]);
    const rows = [
      ...admUsers.map((u) => ({ system: 'admissions', id: u.id, username: u.username || '', email: u.email || '', role: u.role, active: u.isActive, createdAt: u.createdAt?.toISOString() })),
      ...lmsUsers.map((u) => ({ system: 'lms', id: u.id, username: u.username || '', email: u.email || '', role: u.role, active: u.isActive, createdAt: u.createdAt?.toISOString() })),
    ];
    await logSaActivity({ req, module: 'reports', action: 'export_users', description: `Exported ${rows.length} users` });
    sendCsv(res, `users-${Date.now()}.csv`, rows);
  } catch (e) {
    console.error('SA exportUsers error:', e);
    res.status(500).json({ error: 'Failed to export users' });
  }
}

async function exportApplications(req, res) {
  try {
    const apps = await prisma.application.findMany({
      select: { id: true, status: true, resultStatus: true, submittedAt: true, updatedAt: true },
      orderBy: { submittedAt: 'desc' },
    });
    const rows = apps.map((a) => ({
      id: a.id, status: a.status, resultStatus: a.resultStatus,
      submittedAt: a.submittedAt?.toISOString(), updatedAt: a.updatedAt?.toISOString?.() || '',
    }));
    await logSaActivity({ req, module: 'reports', action: 'export_applications', description: `Exported ${rows.length} applications` });
    sendCsv(res, `applications-${Date.now()}.csv`, rows);
  } catch (e) {
    console.error('SA exportApplications error:', e);
    res.status(500).json({ error: 'Failed to export applications' });
  }
}

async function exportActivityLog(req, res) {
  try {
    const logs = await prisma.saActivityLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5000 });
    const rows = logs.map((l) => ({
      id: l.id, actor: l.actorName || '', role: l.actorRole || '', module: l.module,
      action: l.action, description: l.description || '', ip: l.ipAddress || '',
      createdAt: l.createdAt?.toISOString(),
    }));
    sendCsv(res, `activity-log-${Date.now()}.csv`, rows);
  } catch (e) {
    console.error('SA exportActivityLog error:', e);
    res.status(500).json({ error: 'Failed to export activity log' });
  }
}

// ---- List applications (for the override workflow) ----------------------
async function listApplications(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const [rows, total] = await Promise.all([
      prisma.application.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { submittedAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, username: true } },
          program: { select: { name: true, shortForm: true } },
        },
      }),
      prisma.application.count({ where }),
    ]);
    const applications = rows.map((a) => ({ ...a, createdAt: a.submittedAt }));
    res.json({ applications, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) {
    console.error('SA listApplications error:', e);
    res.status(500).json({ error: 'Failed to load applications' });
  }
}

// ---- OVERRIDE: application status ----------------------------------------
// Force-set an admissions application status (e.g. reverse a rejection).
async function overrideApplicationStatus(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { newStatus, reason } = req.body;
    if (!newStatus) return res.status(400).json({ error: 'newStatus is required.' });
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required for any override.' });

    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) return res.status(404).json({ error: 'Application not found.' });
    const original = app.status;

    const updated = await prisma.application.update({ where: { id }, data: { status: newStatus } });
    await logOverride({
      req, targetModule: 'admissions.application', targetId: id, action: 'override_status',
      originalValue: { status: original }, newValue: { status: newStatus }, reason,
    });
    await logSaActivity({ req, module: 'reports', action: 'override_application', description: `Override application #${id} status ${original} → ${newStatus}` });
    res.json({ application: updated, message: 'Application status overridden.' });
  } catch (e) {
    console.error('SA overrideApplicationStatus error:', e);
    res.status(500).json({ error: 'Failed to override application status' });
  }
}

// ---- OVERRIDE: course result --------------------------------------------
// Force-edit/publish a LMS course result.
async function overrideCourseResult(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required for any override.' });

    const result = await prisma.courseResult.findUnique({ where: { id } });
    if (!result) return res.status(404).json({ error: 'Result not found.' });
    const { isImmutableStatus } = require('../../utils/lmsGrading');
    if (isImmutableStatus(result.status)) {
      return res.status(409).json({ error: 'Submitted/finalized results cannot be edited by any role, including Super Admin.' });
    }

    const editable = ['assignmentMarks', 'quizMarks', 'midMarks', 'finalMarks', 'totalPercent', 'letterGrade', 'gradePoints', 'status', 'remarks'];
    const data = {};
    const original = {};
    editable.forEach((k) => {
      if (req.body[k] !== undefined) {
        original[k] = result[k];
        data[k] = (typeof result[k] === 'number') ? parseFloat(req.body[k]) : req.body[k];
      }
    });
    if (data.status === 'PUBLISHED' && !result.publishedAt) data.publishedAt = new Date();

    const updated = await prisma.courseResult.update({ where: { id }, data });
    await logOverride({
      req, targetModule: 'lms.courseResult', targetId: id, action: 'override_result',
      originalValue: original, newValue: data, reason,
    });
    await logSaActivity({ req, module: 'reports', action: 'override_result', description: `Override course result #${id}` });
    res.json({ result: updated, message: 'Course result overridden.' });
  } catch (e) {
    console.error('SA overrideCourseResult error:', e);
    res.status(500).json({ error: 'Failed to override course result' });
  }
}

// ---- OVERRIDE: fee challan status ---------------------------------------
async function overrideFeeChallan(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { newStatus, reason } = req.body;
    if (!newStatus) return res.status(400).json({ error: 'newStatus is required.' });
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required for any override.' });

    const challan = await prisma.lmsFeeChallan.findUnique({ where: { id } });
    if (!challan) return res.status(404).json({ error: 'Fee challan not found.' });
    const original = challan.status;

    const data = { status: newStatus };
    if (newStatus === 'PAID' && !challan.paidAt) data.paidAt = new Date();
    const updated = await prisma.lmsFeeChallan.update({ where: { id }, data });
    await logOverride({
      req, targetModule: 'lms.feeChallan', targetId: id, action: 'override_fee_status',
      originalValue: { status: original }, newValue: { status: newStatus }, reason,
    });
    await logSaActivity({ req, module: 'reports', action: 'override_fee', description: `Override fee challan #${id} ${original} → ${newStatus}` });
    res.json({ challan: updated, message: 'Fee challan status overridden.' });
  } catch (e) {
    console.error('SA overrideFeeChallan error:', e);
    res.status(500).json({ error: 'Failed to override fee challan' });
  }
}

module.exports = {
  reportSummary,
  listApplications,
  exportUsers, exportApplications, exportActivityLog,
  overrideApplicationStatus, overrideCourseResult, overrideFeeChallan,
};

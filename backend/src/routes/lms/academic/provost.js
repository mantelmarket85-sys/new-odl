// ============================================================
//  PROVOST ROUTES  — /api/lms/academic/provost/*
// ------------------------------------------------------------
//  Phase 7 — Provost (University Executive). Purely additive.
//  Provides university-wide oversight: executive dashboard,
//  university analytics, departments / programs / faculty /
//  students directories, finance (revenue, fee approvals, fee &
//  exam-fee announcements, fines, defaulters), QEC snapshot,
//  strategic initiatives, policies, reports (+CSV export),
//  activity logs, account settings.
//
//  Finance role is merged into Provost. All data is read from
//  existing models (LmsUser, CourseOffering, Course, AcademicTerm,
//  CourseRegistration, LmsFeeChallan, ApprovalRequest,
//  StrategicInitiative, Policy, Survey/SurveyResponse,
//  ComplianceItem, LmsAnnouncement, LmsNotification, LmsAuditLog) —
//  no schema changes required.
// ============================================================
const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const prisma = require('../../../utils/prisma');
const { lmsAuth, lmsRequireRole } = require('../../../middleware/lmsAuth');
const { validate } = require('../../../middleware/validate');
const {
  asyncHandler, parseListQuery, paginated, httpError, safeJson,
} = require('../../../utils/lmsHelpers');
const { audit } = require('../../../utils/lmsAudit');
const { notify, notifyMany } = require('../../../utils/lmsNotify');
const { displayName, nameMap } = require('../../../utils/lmsWorkflow');
const {
  resolveStudentPositions, generateChallansForAnnouncement, getActiveBlocks, studentMatchesScope,
} = require('../../../utils/provostFinance');

const router = express.Router();
router.use(lmsAuth);

// Provost owns all of this; Finance is merged into Provost.
const PROVOST = lmsRequireRole('Provost');

// ------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------
function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

async function currentTerm() {
  return prisma.academicTerm.findFirst({ where: { isCurrent: true } })
    || prisma.academicTerm.findFirst({ orderBy: { id: 'desc' } });
}

// Map a fee-challan status → UI label.
const CHALLAN_LABEL = { PAID: 'Approved', UNPAID: 'Pending', OVERDUE: 'Rejected', WAIVED: 'Waived' };

function challanType(c) {
  // Derive a readable fee type from the title (best-effort, deterministic).
  const t = (c.title || '').toLowerCase();
  if (t.includes('hostel')) return 'Hostel Fee';
  if (t.includes('transport')) return 'Transport Fee';
  if (t.includes('library')) return 'Library Fee';
  if (t.includes('exam')) return 'Examination Fee';
  if (t.includes('admission')) return 'Admission Fee';
  return 'Semester Fee';
}

function daysBetween(a, b) {
  return Math.max(0, Math.round((b - a) / 86400000));
}

// Build the canonical university department roster from real data:
// group teachers + students by their program's department.
async function buildDepartments() {
  const programs = await prisma.lmsProgram.findMany({
    where: { isDeleted: false },
    include: { _count: { select: { courses: true } } },
  });

  // Offerings (current + historical) link teachers ↔ courses ↔ programs.
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false },
    include: {
      course: { select: { id: true, code: true, programId: true } },
      teacher: { select: { id: true, username: true, profile: { select: { fullName: true } } } },
      _count: { select: { registrations: true } },
    },
  });

  // Map course → program → department.
  const courseProgram = {};
  const progDept = {};
  for (const p of programs) progDept[p.id] = p.department || 'General';

  // Resolve each course's program/department via LmsCourse.
  const courseIds = [...new Set(offerings.map((o) => o.course?.id).filter(Boolean))];
  const courses = courseIds.length ? await prisma.lmsCourse.findMany({
    where: { id: { in: courseIds } }, select: { id: true, programId: true },
  }) : [];
  const courseToProg = Object.fromEntries(courses.map((c) => [c.id, c.programId]));

  // Aggregate per-department.
  const dept = {};
  const ensure = (name) => {
    if (!dept[name]) dept[name] = { name, students: 0, faculty: new Set(), programs: new Set(), chair: '—' };
    return dept[name];
  };

  for (const p of programs) ensure(p.department || 'General').programs.add(p.code);

  for (const o of offerings) {
    const progId = o.course ? courseToProg[o.course.id] : null;
    const deptName = progId ? (progDept[progId] || 'General') : 'General';
    const d = ensure(deptName);
    d.students += o._count.registrations;
    if (o.teacher) d.faculty.add(o.teacher.id);
  }

  // Pick a chair per department = teacher with most offerings there.
  const facultyByDept = {};
  for (const o of offerings) {
    if (!o.teacher) continue;
    const progId = o.course ? courseToProg[o.course.id] : null;
    const deptName = progId ? (progDept[progId] || 'General') : 'General';
    facultyByDept[deptName] = facultyByDept[deptName] || {};
    const name = displayName(o.teacher);
    facultyByDept[deptName][name] = (facultyByDept[deptName][name] || 0) + 1;
  }

  return Object.values(dept).map((d) => {
    const chairs = facultyByDept[d.name] || {};
    const chair = Object.entries(chairs).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    return {
      name: d.name,
      chair,
      students: d.students,
      faculty: d.faculty.size,
      programs: d.programs.size,
    };
  }).sort((a, b) => b.students - a.students);
}

// Build fee-approval rows from real LmsFeeChallan records.
async function buildFeeApprovals() {
  const challans = await prisma.lmsFeeChallan.findMany({ orderBy: { createdAt: 'desc' } });
  const ids = [...new Set(challans.map((c) => c.studentId))];
  const names = await nameMap(ids);
  const users = ids.length ? await prisma.lmsUser.findMany({
    where: { id: { in: ids } }, select: { id: true, username: true },
  }) : [];
  const rollMap = Object.fromEntries(users.map((u) => [u.id, u.username]));

  return challans.map((c) => {
    const overdue = c.status === 'UNPAID' && c.dueDate && new Date(c.dueDate) < new Date();
    const status = overdue ? 'Rejected' : (CHALLAN_LABEL[c.status] || 'Pending');
    return {
      id: c.challanNo,
      rawId: c.id,
      student: names[c.studentId] || c.studentId,
      roll: rollMap[c.studentId] || '',
      type: challanType(c),
      amount: c.totalAmount,
      method: c.paymentRef ? 'Bank Transfer' : 'OneLink',
      date: (c.paidAt || c.createdAt).toISOString().slice(0, 10),
      batch: '—',
      semester: c.termId || 1,
      status,
      dueDate: c.dueDate || null,
    };
  });
}

// ============================================================
//  DASHBOARD — University command center KPIs.
// ============================================================
router.get('/dashboard', PROVOST, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const [
    totalStudents, totalFaculty, totalPrograms, surveys, challans, approvalsPending,
  ] = await Promise.all([
    prisma.lmsUser.count({ where: { role: 'Student' } }),
    prisma.lmsUser.count({ where: { role: 'Teacher' } }),
    prisma.lmsProgram.count({ where: { isDeleted: false } }),
    prisma.survey.findMany({
      where: { isDeleted: false },
      include: { questions: { where: { type: 'RATING' } }, responses: true },
    }),
    prisma.lmsFeeChallan.findMany(),
    prisma.approvalRequest.count({ where: { assignedRole: 'Provost', status: { in: ['PENDING', 'IN_REVIEW', 'ESCALATED'] } } }),
  ]);

  const departments = await buildDepartments();

  // Satisfaction = avg survey rating.
  let sum = 0; let n = 0;
  for (const s of surveys) {
    const rq = s.questions.map((q) => q.id);
    for (const r of s.responses) {
      const ans = safeJson(r.answersJson, {});
      const vals = rq.map((id) => Number(ans[String(id)])).filter((v) => Number.isFinite(v) && v > 0);
      if (vals.length) { sum += vals.reduce((a, b) => a + b, 0) / vals.length; n += 1; }
    }
  }
  const satisfaction = n ? round1(sum / n) : 0;

  const feesCollectedYTD = challans.filter((c) => c.status === 'PAID').reduce((a, c) => a + c.totalAmount, 0);
  const pendingFees = challans.filter((c) => c.status !== 'PAID' && c.status !== 'WAIVED').reduce((a, c) => a + c.totalAmount, 0);

  // Monthly collection (group PAID challans by month).
  const monthly = {};
  for (const c of challans) {
    if (c.status !== 'PAID') continue;
    const d = c.paidAt || c.createdAt;
    const key = new Date(d).toLocaleString('en', { month: 'short' });
    monthly[key] = (monthly[key] || 0) + c.totalAmount;
  }
  const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyCollection = monthOrder
    .filter((m) => monthly[m] !== undefined)
    .map((m) => ({ month: m, collected: round1(monthly[m] / 1000000) }));

  res.json({
    term: term ? term.title : '—',
    kpis: {
      totalStudents,
      totalFaculty,
      totalPrograms,
      totalDepartments: departments.length,
      feesCollectedYTD,
      pendingFees,
      satisfaction,
      ranking: '—',
    },
    departments: departments.map((d) => ({ name: d.name, students: d.students, faculty: d.faculty })),
    monthlyCollection,
    pendingApprovals: approvalsPending,
  });
}));

// ============================================================
//  ANALYTICS — strategic KPIs + growth + ratios + collection.
// ============================================================
router.get('/analytics', PROVOST, asyncHandler(async (req, res) => {
  const [totalStudents, totalFaculty, surveys, challans] = await Promise.all([
    prisma.lmsUser.count({ where: { role: 'Student' } }),
    prisma.lmsUser.count({ where: { role: 'Teacher' } }),
    prisma.survey.findMany({ where: { isDeleted: false }, include: { questions: { where: { type: 'RATING' } }, responses: true } }),
    prisma.lmsFeeChallan.findMany(),
  ]);

  let sum = 0; let n = 0;
  for (const s of surveys) {
    const rq = s.questions.map((q) => q.id);
    for (const r of s.responses) {
      const ans = safeJson(r.answersJson, {});
      const vals = rq.map((id) => Number(ans[String(id)])).filter((v) => Number.isFinite(v) && v > 0);
      if (vals.length) { sum += vals.reduce((a, b) => a + b, 0) / vals.length; n += 1; }
    }
  }
  const satisfaction = n ? round2(sum / n) : 0;

  const departments = await buildDepartments();
  const ratio = departments.map((d) => ({ name: (d.name || '').split(' ')[0], ratio: d.faculty ? round1(d.students / d.faculty) : 0 }));

  // Historical growth from quality metrics if present, else derive from headcount.
  const growthMetrics = await prisma.qualityMetric.findMany({
    where: { metric: 'StudentBody', scope: 'INSTITUTION' }, orderBy: { id: 'asc' },
  }).catch(() => []);
  let growth;
  if (growthMetrics.length) {
    growth = growthMetrics.map((m) => ({ year: m.periodLabel || '—', students: Math.round(m.value) }));
  } else {
    growth = [{ year: 'Current', students: totalStudents }];
  }
  const growthPct = growth.length > 1
    ? Math.round(((growth[growth.length - 1].students - growth[0].students) / Math.max(1, growth[0].students)) * 100)
    : 0;

  const monthly = {};
  for (const c of challans) {
    if (c.status !== 'PAID') continue;
    const d = c.paidAt || c.createdAt;
    const key = new Date(d).toLocaleString('en', { month: 'short' });
    monthly[key] = (monthly[key] || 0) + c.totalAmount;
  }
  const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyCollection = monthOrder
    .filter((m) => monthly[m] !== undefined)
    .map((m) => ({ month: m, collected: round1(monthly[m] / 1000000) }));

  res.json({
    kpis: { totalStudents, totalFaculty, satisfaction, growthPct },
    growth,
    ratio,
    monthlyCollection,
  });
}));

// ============================================================
//  DEPARTMENTS · FACULTY · STUDENTS
// ============================================================
router.get('/departments', PROVOST, asyncHandler(async (req, res) => {
  res.json({ items: await buildDepartments() });
}));

router.get('/faculty', PROVOST, asyncHandler(async (req, res) => {
  const departments = await buildDepartments();
  const totalFaculty = departments.reduce((a, d) => a + d.faculty, 0);
  res.json({
    items: departments.map((d) => ({
      name: d.name, chair: d.chair, faculty: d.faculty, students: d.students,
      facultyRatio: d.faculty ? (d.students / d.faculty).toFixed(1) : '0.0',
    })),
    stats: { totalFaculty, departments: departments.length },
  });
}));

router.get('/students', PROVOST, asyncHandler(async (req, res) => {
  const departments = await buildDepartments();
  const [totalStudents, totalPrograms] = await Promise.all([
    prisma.lmsUser.count({ where: { role: 'Student' } }),
    prisma.lmsProgram.count({ where: { isDeleted: false } }),
  ]);
  res.json({
    byDept: departments.map((d) => ({ name: (d.name || '').split(' ')[0], students: d.students })),
    stats: {
      totalStudents,
      totalPrograms,
      avgPerDept: departments.length ? Math.round(totalStudents / departments.length) : 0,
      largestDept: departments.length ? Math.max(...departments.map((d) => d.students)) : 0,
    },
  });
}));

// ============================================================
//  PROGRAMS — university program catalogue.
// ============================================================
router.get('/programs', PROVOST, asyncHandler(async (req, res) => {
  const programs = await prisma.lmsProgram.findMany({
    where: { isDeleted: false },
    include: { semesters: { where: { isDeleted: false }, include: { courses: { where: { isDeleted: false }, select: { creditHours: true } } } } },
    orderBy: { code: 'asc' },
  });

  // Student headcount per program via offerings → courses.
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false },
    include: { course: { select: { id: true } }, _count: { select: { registrations: true } } },
  });
  const courseIds = [...new Set(offerings.map((o) => o.course?.id).filter(Boolean))];
  const courses = courseIds.length ? await prisma.lmsCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, programId: true } }) : [];
  const courseToProg = Object.fromEntries(courses.map((c) => [c.id, c.programId]));
  const studentsByProg = {};
  for (const o of offerings) {
    const pid = o.course ? courseToProg[o.course.id] : null;
    if (pid == null) continue;
    studentsByProg[pid] = (studentsByProg[pid] || 0) + o._count.registrations;
  }

  res.json({
    items: programs.map((p) => {
      const credits = p.semesters.reduce((a, s) => a + s.courses.reduce((b, c) => b + (c.creditHours || 0), 0), 0);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        dept: p.department || 'General',
        duration: `${p.durationYears} yrs`,
        credits,
        students: studentsByProg[p.id] || 0,
        status: p.isActive ? 'Active' : 'Inactive',
      };
    }),
  });
}));

// ============================================================
//  FINANCE — revenue vs target, fee-type breakdown, latest fees.
// ============================================================
router.get('/finance', PROVOST, asyncHandler(async (req, res) => {
  const challans = await prisma.lmsFeeChallan.findMany({ orderBy: { createdAt: 'desc' } });

  // Revenue per month (PAID) vs a target derived as 110% of revenue.
  const monthly = {};
  for (const c of challans) {
    if (c.status !== 'PAID') continue;
    const d = c.paidAt || c.createdAt;
    const key = new Date(d).toLocaleString('en', { month: 'short' });
    monthly[key] = (monthly[key] || 0) + c.totalAmount;
  }
  const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const revenueChart = monthOrder
    .filter((m) => monthly[m] !== undefined)
    .map((m) => ({ month: m, revenue: round1(monthly[m] / 1000000), target: round1((monthly[m] * 1.1) / 1000000) }));

  const approved = challans.filter((c) => c.status === 'PAID').reduce((a, c) => a + c.totalAmount, 0);
  const pending = challans.filter((c) => c.status === 'UNPAID').reduce((a, c) => a + c.totalAmount, 0);

  // Fee-type breakdown (exclude rejected/overdue).
  const byType = {};
  for (const c of challans) {
    if (c.status === 'WAIVED') continue;
    const t = challanType(c);
    byType[t] = (byType[t] || 0) + c.totalAmount;
  }
  const feeTypeData = Object.entries(byType).map(([type, amount]) => ({ type, amount }));

  const latest = challans.slice(0, 4).map((c) => ({
    id: c.challanNo, title: c.title, issued: c.createdAt.toISOString().slice(0, 10),
    deadline: c.dueDate || '—', amount: c.totalAmount,
    status: c.status === 'PAID' ? 'Paid' : (c.status === 'UNPAID' ? 'Active' : c.status),
  }));

  res.json({
    revenueChart,
    feeTypeData,
    latest,
    stats: {
      totalRevenue: round1(revenueChart.reduce((a, x) => a + x.revenue, 0)),
      totalTarget: round1(revenueChart.reduce((a, x) => a + x.target, 0)),
      approved,
      pending,
      activeAnnouncements: challans.filter((c) => c.status === 'UNPAID').length,
    },
  });
}));

// ============================================================
//  FEE APPROVALS — review/approve/reject student fee submissions.
// ============================================================
router.get('/fee-approvals', PROVOST, asyncHandler(async (req, res) => {
  const items = await buildFeeApprovals();
  res.json({
    items,
    stats: {
      pending: items.filter((a) => a.status === 'Pending').length,
      approved: items.filter((a) => a.status === 'Approved').length,
      rejected: items.filter((a) => a.status === 'Rejected').length,
      totalAmount: items.filter((a) => a.status === 'Approved').reduce((s, a) => s + a.amount, 0),
    },
  });
}));

router.put('/fee-approvals/:id', PROVOST, validate([
  body('action').isIn(['approve', 'reject']).withMessage('action must be approve or reject'),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const challan = await prisma.lmsFeeChallan.findUnique({ where: { id } });
  if (!challan) throw httpError(404, 'Fee record not found');
  const action = req.body.action;
  const before = { status: challan.status };
  const data = action === 'approve'
    ? { status: 'PAID', paidAt: new Date(), paymentRef: req.body.reference || `PROV-${Date.now()}` }
    : { status: 'OVERDUE' };
  const updated = await prisma.lmsFeeChallan.update({ where: { id }, data });
  await audit(req, action === 'approve' ? 'PROVOST_FEE_APPROVE' : 'PROVOST_FEE_REJECT', 'LmsFeeChallan', id, { before, after: { status: updated.status } });
  await notify(challan.studentId, {
    title: action === 'approve' ? 'Fee payment approved' : 'Fee payment rejected',
    message: `${challan.title} (${challan.challanNo}) was ${action === 'approve' ? 'approved' : 'rejected'}.`,
    type: action === 'approve' ? 'SUCCESS' : 'WARNING',
  });
  res.json({ success: true, status: updated.status });
}));

// ============================================================
//  DEFAULTERS — students with overdue / unpaid fees.
// ============================================================
router.get('/defaulters', PROVOST, asyncHandler(async (req, res) => {
  const all = await buildFeeApprovals();
  const now = new Date();
  const items = all.filter((a) => a.status === 'Pending' || a.status === 'Rejected').map((a) => {
    const due = a.dueDate ? new Date(a.dueDate) : null;
    const daysOverdue = due && due < now ? daysBetween(due, now) : 0;
    return { ...a, daysOverdue, attempts: a.status === 'Rejected' ? 2 : 1 };
  });
  res.json({
    items,
    stats: {
      total: items.length,
      totalDue: items.reduce((s, f) => s + f.amount, 0),
      critical: items.filter((d) => d.daysOverdue > 30).length,
      recent: items.filter((d) => d.daysOverdue <= 7).length,
    },
  });
}));

router.post('/defaulters/:id/notify', PROVOST, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const challan = await prisma.lmsFeeChallan.findUnique({ where: { id } });
  if (!challan) throw httpError(404, 'Fee record not found');
  await notify(challan.studentId, {
    title: 'Fee payment reminder',
    message: `Reminder: ${challan.title} (${challan.challanNo}) of Rs. ${challan.totalAmount.toLocaleString()} is overdue. Please clear your dues.`,
    type: 'WARNING',
  });
  await audit(req, 'PROVOST_DEFAULTER_NOTIFY', 'LmsFeeChallan', id, {});
  res.json({ success: true });
}));

// ============================================================
//  FEE ANNOUNCEMENTS — university-wide fee notifications.
//  Stored as LmsAnnouncement (audience ALL) tagged [FEE].
// ============================================================
const FEE_TAG = '[FEE]';
const EXAMFEE_TAG = '[EXAMFEE]';

function parseAnnMeta(message) {
  // message format: "<description> ||META:{json}"
  const idx = message.indexOf('||META:');
  if (idx === -1) return { description: message, meta: {} };
  const description = message.slice(0, idx).trim();
  const meta = safeJson(message.slice(idx + 7), {});
  return { description, meta };
}

function buildAnnMessage(description, meta) {
  return `${description || ''} ||META:${JSON.stringify(meta || {})}`;
}

async function listFeeAnnouncements(tag) {
  const rows = await prisma.lmsAnnouncement.findMany({
    where: { isDeleted: false, title: { startsWith: tag } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => {
    const { description, meta } = parseAnnMeta(r.message);
    const deadline = meta.deadline ? new Date(meta.deadline) : null;
    const now = new Date();
    let status = 'Active';
    if (deadline && deadline < now) status = 'Closed';
    if (meta.scheduledFor && new Date(meta.scheduledFor) > now) status = 'Scheduled';
    return {
      id: r.id,
      title: r.title.replace(tag, '').trim(),
      description,
      amount: Number(meta.amount) || 0,
      program: meta.program || 'All Programs',
      batch: meta.batch || 'All Batches',
      semester: meta.semester || 'All Semesters',
      examType: meta.examType || null,
      deadline: meta.deadline || '—',
      issued: r.createdAt.toISOString().slice(0, 10),
      status,
    };
  });
}

router.get('/fee-announcements', PROVOST, asyncHandler(async (req, res) => {
  const items = await listFeeAnnouncements(FEE_TAG);
  res.json({
    items,
    stats: {
      total: items.length,
      active: items.filter((a) => a.status === 'Active').length,
      scheduled: items.filter((a) => a.status === 'Scheduled').length,
      closed: items.filter((a) => a.status === 'Closed').length,
    },
  });
}));

router.post('/fee-announcements', PROVOST, validate([
  body('title').isString().trim().isLength({ min: 3 }).withMessage('Title is required (min 3 chars).'),
  body('amount').optional().isNumeric(),
]), asyncHandler(async (req, res) => {
  const { title, description, amount, program, batch, semester, deadline } = req.body;
  const ann = await prisma.lmsAnnouncement.create({
    data: {
      authorId: req.lmsUser.id,
      title: `${FEE_TAG} ${title}`.trim(),
      message: buildAnnMessage(description, { amount, program, batch, semester, deadline }),
      audience: 'ALL',
    },
  });
  await audit(req, 'PROVOST_FEE_ANNOUNCE_CREATE', 'LmsAnnouncement', ann.id, { after: { title } });
  res.status(201).json({ id: ann.id });
}));

router.delete('/fee-announcements/:id', PROVOST, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ann = await prisma.lmsAnnouncement.findUnique({ where: { id } });
  if (!ann) throw httpError(404, 'Announcement not found');
  await prisma.lmsAnnouncement.update({ where: { id }, data: { isDeleted: true } });
  await audit(req, 'PROVOST_FEE_ANNOUNCE_DELETE', 'LmsAnnouncement', id, {});
  res.json({ success: true });
}));

// ============================================================
//  EXAM FEE ANNOUNCEMENTS
// ============================================================
router.get('/exam-fee-announcements', PROVOST, asyncHandler(async (req, res) => {
  const items = await listFeeAnnouncements(EXAMFEE_TAG);
  res.json({
    items,
    stats: {
      total: items.length,
      active: items.filter((a) => a.status === 'Active').length,
      scheduled: items.filter((a) => a.status === 'Scheduled').length,
      closed: items.filter((a) => a.status === 'Closed').length,
    },
  });
}));

router.post('/exam-fee-announcements', PROVOST, validate([
  body('title').isString().trim().isLength({ min: 3 }).withMessage('Title is required (min 3 chars).'),
  body('amount').optional().isNumeric(),
]), asyncHandler(async (req, res) => {
  const { title, description, amount, program, batch, semester, deadline, examType } = req.body;
  const ann = await prisma.lmsAnnouncement.create({
    data: {
      authorId: req.lmsUser.id,
      title: `${EXAMFEE_TAG} ${title}`.trim(),
      message: buildAnnMessage(description, { amount, program, batch, semester, deadline, examType }),
      audience: 'ALL',
    },
  });
  await audit(req, 'PROVOST_EXAMFEE_ANNOUNCE_CREATE', 'LmsAnnouncement', ann.id, { after: { title } });
  res.status(201).json({ id: ann.id });
}));

router.delete('/exam-fee-announcements/:id', PROVOST, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ann = await prisma.lmsAnnouncement.findUnique({ where: { id } });
  if (!ann) throw httpError(404, 'Announcement not found');
  await prisma.lmsAnnouncement.update({ where: { id }, data: { isDeleted: true } });
  await audit(req, 'PROVOST_EXAMFEE_ANNOUNCE_DELETE', 'LmsAnnouncement', id, {});
  res.json({ success: true });
}));

// ============================================================
//  FINES — disciplinary penalties / late fees stored as
//  ApprovalRequest(type=FEE, entity=FINE).
// ============================================================
const FINE_LABEL = { PENDING: 'Pending', APPROVED: 'Paid', REJECTED: 'Waived', IN_REVIEW: 'Pending' };

router.get('/fines', PROVOST, asyncHandler(async (req, res) => {
  const rows = await prisma.approvalRequest.findMany({
    where: { type: 'FEE', entity: 'FINE' }, orderBy: { createdAt: 'desc' },
  });
  const ids = [...new Set(rows.map((r) => r.requestedById))];
  const names = await nameMap(ids);
  const users = ids.length ? await prisma.lmsUser.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } }) : [];
  const rollMap = Object.fromEntries(users.map((u) => [u.id, u.username]));

  // Resolve each fined student's department so fines can be shown /
  // filtered department-wise (no schema change — derived from existing
  // program → department mapping).
  const positions = await resolveStudentPositions();

  let items = rows.map((r) => {
    const p = safeJson(r.payloadJson, {});
    const pos = positions.get(r.requestedById) || {};
    return {
      id: `FINE-${r.id}`,
      rawId: r.id,
      student: names[r.requestedById] || r.requestedById,
      roll: rollMap[r.requestedById] || p.roll || '',
      department: pos.department || '',
      program: pos.program || '',
      title: r.title,
      reason: r.description || p.reason || '',
      amount: Number(p.amount) || 0,
      issuedOn: r.createdAt.toISOString().slice(0, 10),
      deadline: r.dueDate || '—',
      status: FINE_LABEL[r.status] || 'Pending',
    };
  });

  // Distinct departments across ALL fines (for the smart-filter dropdown) —
  // computed before filtering so every option remains selectable.
  const departments = [...new Set(items.map((f) => f.department).filter(Boolean))].sort();

  // Optional department-wise filter (smart filter support).
  const deptFilter = req.query.department ? String(req.query.department).trim() : '';
  if (deptFilter) items = items.filter((f) => f.department === deptFilter);

  res.json({
    items,
    departments,
    stats: {
      total: items.length,
      totalAmount: items.reduce((s, f) => s + f.amount, 0),
      pendingAmount: items.filter((f) => f.status === 'Pending').reduce((s, f) => s + f.amount, 0),
      collected: items.filter((f) => f.status === 'Paid').reduce((s, f) => s + f.amount, 0),
    },
  });
}));

router.post('/fines', PROVOST, validate([
  body('roll').isString().trim().notEmpty().withMessage('Student roll # is required.'),
  body('title').isString().trim().isLength({ min: 3 }).withMessage('Fine title is required.'),
  body('amount').isNumeric().withMessage('Amount is required.'),
]), asyncHandler(async (req, res) => {
  const { roll, title, reason, amount, deadline } = req.body;
  const student = await prisma.lmsUser.findFirst({ where: { username: String(roll).trim(), role: 'Student' } });
  if (!student) throw httpError(404, `No student found with roll # ${roll}`);
  const fine = await prisma.approvalRequest.create({
    data: {
      type: 'FEE', entity: 'FINE', entityId: student.id,
      title, description: reason || null,
      payloadJson: JSON.stringify({ amount: Number(amount), roll, reason }),
      requestedById: student.id, requestedRole: 'Student',
      assignedRole: 'Provost', status: 'PENDING', dueDate: deadline || null,
    },
  });
  await audit(req, 'PROVOST_FINE_CREATE', 'ApprovalRequest', fine.id, { after: { title, amount } });
  await notify(student.id, { title: 'New fine issued', message: `${title} — Rs. ${Number(amount).toLocaleString()}`, type: 'WARNING' });
  res.status(201).json({ id: fine.id });
}));

router.put('/fines/:id', PROVOST, validate([
  body('action').isIn(['paid', 'waive']).withMessage('action must be paid or waive'),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const fine = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!fine || fine.entity !== 'FINE') throw httpError(404, 'Fine not found');
  const status = req.body.action === 'paid' ? 'APPROVED' : 'REJECTED';
  const updated = await prisma.approvalRequest.update({
    where: { id }, data: { status, decidedById: req.lmsUser.id, decidedRole: 'Provost', decidedAt: new Date() },
  });
  await audit(req, 'PROVOST_FINE_UPDATE', 'ApprovalRequest', id, { before: { status: fine.status }, after: { status: updated.status } });
  res.json({ success: true, status: FINE_LABEL[updated.status] });
}));

// ============================================================
//  STRATEGIC INITIATIVES
// ============================================================
const SI_STATUS = ['PROPOSED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'REJECTED'];

router.get('/initiatives', PROVOST, asyncHandler(async (req, res) => {
  const rows = await prisma.strategicInitiative.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({
    items: rows.map((r) => ({
      id: r.id, title: r.title, category: r.category, description: r.description,
      status: r.status, priority: r.priority, budget: r.budget, progress: r.progress,
      startDate: r.startDate, targetDate: r.targetDate,
    })),
    stats: {
      total: rows.length,
      inProgress: rows.filter((r) => r.status === 'IN_PROGRESS').length,
      completed: rows.filter((r) => r.status === 'COMPLETED').length,
      proposed: rows.filter((r) => r.status === 'PROPOSED').length,
    },
  });
}));

router.post('/initiatives', PROVOST, validate([
  body('title').isString().trim().isLength({ min: 3 }),
]), asyncHandler(async (req, res) => {
  const { title, category, description, priority, budget, targetDate } = req.body;
  const si = await prisma.strategicInitiative.create({
    data: {
      title, category: category || 'STRATEGIC', description: description || null,
      priority: priority || 'NORMAL', budget: budget != null ? Number(budget) : null,
      targetDate: targetDate || null, createdById: req.lmsUser.id,
    },
  });
  await audit(req, 'PROVOST_INITIATIVE_CREATE', 'StrategicInitiative', si.id, { after: { title } });
  res.status(201).json({ id: si.id });
}));

router.put('/initiatives/:id', PROVOST, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const si = await prisma.strategicInitiative.findUnique({ where: { id } });
  if (!si) throw httpError(404, 'Initiative not found');
  const data = {};
  for (const k of ['title', 'category', 'description', 'priority', 'targetDate', 'startDate']) {
    if (req.body[k] !== undefined) data[k] = req.body[k];
  }
  if (req.body.status !== undefined) {
    if (!SI_STATUS.includes(req.body.status)) throw httpError(400, 'Invalid status');
    data.status = req.body.status;
  }
  if (req.body.progress !== undefined) data.progress = Math.max(0, Math.min(100, parseInt(req.body.progress, 10)));
  if (req.body.budget !== undefined) data.budget = req.body.budget != null ? Number(req.body.budget) : null;
  const updated = await prisma.strategicInitiative.update({ where: { id }, data });
  await audit(req, 'PROVOST_INITIATIVE_UPDATE', 'StrategicInitiative', id, { before: { status: si.status, progress: si.progress }, after: { status: updated.status, progress: updated.progress } });
  res.json({ id: updated.id, status: updated.status, progress: updated.progress });
}));

// ============================================================
//  POLICIES
// ============================================================
router.get('/policies', PROVOST, asyncHandler(async (req, res) => {
  const rows = await prisma.policy.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({
    items: rows.map((r) => ({
      id: r.id, code: r.code, title: r.title, category: r.category,
      status: r.status, version: r.version, effectiveDate: r.effectiveDate,
    })),
    stats: {
      total: rows.length,
      published: rows.filter((r) => r.status === 'PUBLISHED').length,
      underReview: rows.filter((r) => r.status === 'UNDER_REVIEW').length,
      draft: rows.filter((r) => r.status === 'DRAFT').length,
    },
  });
}));

router.put('/policies/:id', PROVOST, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const pol = await prisma.policy.findUnique({ where: { id } });
  if (!pol) throw httpError(404, 'Policy not found');
  const data = {};
  for (const k of ['title', 'category', 'body', 'effectiveDate', 'status']) {
    if (req.body[k] !== undefined) data[k] = req.body[k];
  }
  if (req.body.status === 'PUBLISHED') { data.approvedById = req.lmsUser.id; data.approvedAt = new Date(); }
  const updated = await prisma.policy.update({ where: { id }, data });
  await audit(req, 'PROVOST_POLICY_UPDATE', 'Policy', id, { before: { status: pol.status }, after: { status: updated.status } });
  res.json({ id: updated.id, status: updated.status });
}));

// ============================================================
//  REPORTS (+ CSV export)
// ============================================================
async function buildReport(kind) {
  if (kind === 'departments') return (await buildDepartments());
  if (kind === 'finance') {
    const challans = await prisma.lmsFeeChallan.findMany();
    const monthly = {};
    for (const c of challans) {
      if (c.status !== 'PAID') continue;
      const d = c.paidAt || c.createdAt;
      const key = new Date(d).toLocaleString('en', { month: 'short' });
      monthly[key] = (monthly[key] || 0) + c.totalAmount;
    }
    const order = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return order.filter((m) => monthly[m] !== undefined).map((m) => ({ month: m, collected: round1(monthly[m] / 1000000) }));
  }
  if (kind === 'fees') {
    return (await buildFeeApprovals()).map((a) => ({
      id: a.id, student: a.student, program: a.roll, amount: a.amount,
      paid: a.status === 'Approved' ? a.amount : 0, status: a.status,
    }));
  }
  if (kind === 'qec') {
    const surveys = await prisma.survey.findMany({ where: { isDeleted: false }, include: { questions: { where: { type: 'RATING' } }, responses: true } });
    const offIds = [...new Set(surveys.map((s) => s.offeringId).filter(Boolean))];
    const offs = offIds.length ? await prisma.courseOffering.findMany({ where: { id: { in: offIds } }, include: { teacher: { select: { id: true, username: true, profile: { select: { fullName: true } } } } } }) : [];
    const offMap = Object.fromEntries(offs.map((o) => [o.id, o]));
    return surveys.map((s) => {
      const rq = s.questions.map((q) => q.id);
      let sum = 0; let n = 0;
      for (const r of s.responses) {
        const ans = safeJson(r.answersJson, {});
        const vals = rq.map((id) => Number(ans[String(id)])).filter((v) => Number.isFinite(v) && v > 0);
        if (vals.length) { sum += vals.reduce((a, b) => a + b, 0) / vals.length; n += 1; }
      }
      const off = s.offeringId ? offMap[s.offeringId] : null;
      return { title: s.title, teacher: off?.teacher ? displayName(off.teacher) : '—', responses: s.responses.length, ratingAvg: n ? round2(sum / n) : 0, status: s.isActive ? 'Active' : 'Closed' };
    });
  }
  throw httpError(400, 'Unknown report kind');
}

router.get('/reports/:kind', PROVOST, asyncHandler(async (req, res) => {
  const rows = await buildReport(req.params.kind);
  res.json({ items: rows });
}));

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
  return lines.join('\n');
}

router.get('/reports/:kind/export', PROVOST, asyncHandler(async (req, res) => {
  const kind = req.params.kind;
  const rows = await buildReport(kind);
  const csv = toCsv(rows);
  await audit(req, 'PROVOST_REPORT_EXPORT', 'Report', kind, { after: { count: rows.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="provost-${kind}-report.csv"`);
  res.send('\uFEFF' + (csv || 'No data'));
}));

// ============================================================
//  ACTIVITY LOGS — university-wide audit trail.
// ============================================================
const ENTITY_TYPE = {
  Survey: 'survey', SurveyResponse: 'survey', QualityMetric: 'result', ComplianceItem: 'qec',
  ImprovementPlan: 'qec', LmsAnnouncement: 'fee', LmsFeeChallan: 'finance', ApprovalRequest: 'finance',
  StrategicInitiative: 'system', Policy: 'system', CourseOffering: 'teacher', CourseRegistration: 'enrollment',
  CourseResult: 'result', Attendance: 'attendance', LmsUser: 'student', Transcript: 'exam',
};

router.get('/audit', PROVOST, asyncHandler(async (req, res) => {
  const { skip, take, page, pageSize } = parseListQuery(req.query);
  const [rows, total] = await Promise.all([
    prisma.lmsAuditLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.lmsAuditLog.count(),
  ]);
  const names = await nameMap(rows.map((r) => r.actorId).filter(Boolean));
  const items = rows.map((r) => ({
    id: r.id,
    timestamp: r.createdAt.toISOString().replace('T', ' ').slice(0, 16),
    user: r.actorId ? (names[r.actorId] || r.actorRole || 'System') : (r.actorRole || 'System'),
    role: r.actorRole,
    type: ENTITY_TYPE[r.entity] || 'system',
    action: r.action,
    target: r.entityId ? `${r.entity} #${r.entityId}` : (r.entity || '—'),
    time: r.createdAt,
  }));
  res.json(paginated(items, total, { page, pageSize }));
}));

// ============================================================
//  ACCOUNT SETTINGS
// ============================================================
router.get('/me', PROVOST, asyncHandler(async (req, res) => {
  const u = await prisma.lmsUser.findUnique({
    where: { id: req.lmsUser.id },
    select: { id: true, username: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true, profile: true },
  });
  res.json({ user: u });
}));

router.put('/me/profile', PROVOST, validate([
  body('username').optional().isString().trim().isLength({ min: 3 }),
  body('email').optional().isEmail().withMessage('A valid email is required.'),
]), asyncHandler(async (req, res) => {
  const data = {};
  if (req.body.username !== undefined) data.username = String(req.body.username).trim();
  if (req.body.email !== undefined) data.email = req.body.email ? String(req.body.email).toLowerCase().trim() : null;
  if (!Object.keys(data).length) throw httpError(400, 'Nothing to update');
  try {
    const u = await prisma.lmsUser.update({ where: { id: req.lmsUser.id }, data, select: { id: true, username: true, email: true, role: true } });
    await audit(req, 'PROVOST_PROFILE_UPDATE', 'LmsUser', req.lmsUser.id, { after: data });
    res.json({ user: u });
  } catch (e) {
    if (e.code === 'P2002') throw httpError(409, 'That username or email is already taken.');
    throw e;
  }
}));

const STRONG_PW = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
router.put('/me/password', PROVOST, validate([
  body('currentPassword').isString().notEmpty(),
  body('newPassword').isString().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.lmsUser.findUnique({ where: { id: req.lmsUser.id } });
  if (!user) throw httpError(404, 'Account not found');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw httpError(401, 'Current password is incorrect.');
  if (!STRONG_PW.test(newPassword)) {
    throw httpError(400, 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.');
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.lmsUser.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
  await audit(req, 'PROVOST_PASSWORD_CHANGE', 'LmsUser', user.id, {});
  res.json({ success: true });
}));

// Live sidebar counts.
router.get('/counts', PROVOST, asyncHandler(async (req, res) => {
  const [approvals, defaulters, unread] = await Promise.all([
    prisma.approvalRequest.count({ where: { assignedRole: 'Provost', status: { in: ['PENDING', 'IN_REVIEW', 'ESCALATED'] } } }),
    prisma.lmsFeeChallan.count({ where: { status: { in: ['UNPAID', 'OVERDUE'] } } }),
    prisma.lmsNotification.count({ where: { userId: req.lmsUser.id, isRead: false } }),
  ]);
  res.json({ approvals, defaulters, notifications: unread });
}));

// ============================================================
// ============================================================
//  PROVOST FINANCE MODULE  (Requirements 1–16)
//  Real-time fee management: dashboard, semester/exam fee
//  announcements (auto Account-Book integration), fee records,
//  advanced search, student fee profile, pending/submitted,
//  summary cards, block/unblock, reports + export.
//  All endpoints read/write real DB data only (no dummy data).
// ============================================================
// ============================================================

// Shared: enrich a list of challans with student position info.
function challanStatusLabel(c) {
  if (c.status === 'PAID') return 'Paid';
  if (c.status === 'WAIVED') return 'Waived';
  const overdue = c.dueDate && new Date(c.dueDate) < new Date();
  return overdue ? 'Overdue' : 'Pending';
}

// ------------------------------------------------------------
// 1. REAL-TIME FINANCE DASHBOARD
// ------------------------------------------------------------
router.get('/finance/dashboard', PROVOST, asyncHandler(async (req, res) => {
  const [positions, challans, announcements, activeBlocks] = await Promise.all([
    resolveStudentPositions(),
    prisma.lmsFeeChallan.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.lmsFeeAnnouncement.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    getActiveBlocks(),
  ]);

  const totalStudents = positions.size;
  const paid = challans.filter((c) => c.status === 'PAID');
  const pending = challans.filter((c) => c.status !== 'PAID' && c.status !== 'WAIVED');
  const collected = paid.reduce((a, c) => a + c.totalAmount, 0);
  const pendingAmt = pending.reduce((a, c) => a + c.totalAmount, 0);

  const semesterRecords = challans.filter((c) => c.feeType === 'SEMESTER').length;
  const examRecords = challans.filter((c) => c.feeType === 'EXAMINATION').length;

  // Students with at least one pending challan = "students with pending payments".
  const studentsWithPending = new Set(pending.map((c) => c.studentId)).size;
  const studentsWithSubmitted = new Set(paid.map((c) => c.studentId)).size;

  // Department / Program / Semester-wise fee statistics (real, from challans).
  const groupStat = (keyFn) => {
    const m = {};
    for (const c of challans) {
      const k = keyFn(c) || '—';
      if (!m[k]) m[k] = { key: k, collected: 0, pending: 0, total: 0, count: 0 };
      m[k].total += c.totalAmount; m[k].count += 1;
      if (c.status === 'PAID') m[k].collected += c.totalAmount;
      else if (c.status !== 'WAIVED') m[k].pending += c.totalAmount;
    }
    return Object.values(m).sort((a, b) => b.total - a.total);
  };

  // Recent fee activities (latest challan transitions).
  const ids = [...new Set(challans.slice(0, 15).map((c) => c.studentId))];
  const names = await nameMap(ids);
  const recentActivities = challans.slice(0, 10).map((c) => ({
    id: c.id,
    student: names[c.studentId] || c.studentId,
    title: c.title,
    feeType: c.feeType || '—',
    amount: c.totalAmount,
    status: challanStatusLabel(c),
    date: (c.paidAt || c.updatedAt || c.createdAt),
  }));

  res.json({
    kpis: {
      totalStudents,
      totalCollected: collected,
      totalPending: pendingAmt,
      semesterFeeRecords: semesterRecords,
      examFeeRecords: examRecords,
      submittedPayments: paid.length,
      pendingPayments: pending.length,
      blockedStudents: activeBlocks.size,
      unblockedStudents: totalStudents - activeBlocks.size,
      studentsWithPending,
      studentsWithSubmitted,
    },
    departmentStats: groupStat((c) => c.department),
    programStats: groupStat((c) => c.program),
    semesterStats: groupStat((c) => (c.semester != null ? `Semester ${c.semester}` : null)),
    recentActivities,
    recentAnnouncements: announcements.map((a) => ({
      id: a.id, title: a.title, feeType: a.feeType, scope: a.scope,
      amount: a.amount, studentCount: a.studentCount, totalBilled: a.totalBilled,
      status: a.status, createdAt: a.createdAt,
    })),
  });
}));

// ------------------------------------------------------------
// 3 & 4. FEE ANNOUNCEMENTS (Semester + Examination) with auto
// Account-Book integration. feeType = SEMESTER | EXAMINATION.
// ------------------------------------------------------------
router.get('/finance/announcements', PROVOST, asyncHandler(async (req, res) => {
  const feeType = req.query.feeType ? String(req.query.feeType).toUpperCase() : undefined;
  const where = feeType ? { feeType } : {};
  const items = await prisma.lmsFeeAnnouncement.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json({
    items: items.map((a) => ({
      id: a.id, feeType: a.feeType, title: a.title, description: a.description,
      amount: a.amount, dueDate: a.dueDate, scope: a.scope, department: a.department,
      program: a.program, semester: a.semester, section: a.section, status: a.status,
      studentCount: a.studentCount, totalBilled: a.totalBilled, createdAt: a.createdAt,
    })),
    stats: {
      total: items.length,
      active: items.filter((a) => a.status === 'ACTIVE').length,
      totalBilled: items.reduce((s, a) => s + a.totalBilled, 0),
    },
  });
}));

router.post('/finance/announcements', PROVOST, validate([
  body('feeType').isIn(['SEMESTER', 'EXAMINATION']).withMessage('feeType must be SEMESTER or EXAMINATION.'),
  body('title').isString().trim().isLength({ min: 3 }).withMessage('Title is required (min 3 chars).'),
  body('amount').isNumeric().withMessage('Amount is required.'),
  body('scope').optional().isIn(['UNIVERSITY', 'DEPARTMENT', 'PROGRAM', 'SEMESTER', 'SECTION']),
]), asyncHandler(async (req, res) => {
  const {
    feeType, title, description, amount, dueDate,
    scope = 'UNIVERSITY', department, program, semester, section,
  } = req.body;

  const ann = await prisma.lmsFeeAnnouncement.create({
    data: {
      feeType,
      title: String(title).trim(),
      description: description ? String(description) : null,
      amount: Number(amount),
      dueDate: dueDate || null,
      scope: String(scope).toUpperCase(),
      department: department || null,
      program: program || null,
      semester: semester != null && semester !== '' ? parseInt(semester, 10) : null,
      section: section || null,
      status: 'ACTIVE',
      createdById: req.lmsUser.id,
    },
  });

  // Auto-generate challans into matching students' Account Books.
  const positions = await resolveStudentPositions();
  const { count, totalBilled } = await generateChallansForAnnouncement(ann, positions);
  const updated = await prisma.lmsFeeAnnouncement.update({
    where: { id: ann.id },
    data: { studentCount: count, totalBilled },
  });

  // Notify the matched students so they immediately see the fee.
  const matchedIds = [...positions.values()]
    .filter((pos) => studentMatchesScope(pos, ann))
    .map((pos) => pos.studentId);
  if (matchedIds.length) {
    await notifyMany(matchedIds, {
      title: feeType === 'EXAMINATION' ? 'New Examination Fee' : 'New Semester Fee',
      message: `${title} — Rs. ${Number(amount).toLocaleString('en-PK')}${dueDate ? `, due ${dueDate}` : ''}. Please pay from your Account Book.`,
      type: 'FEE',
    });
  }

  await audit(req, 'PROVOST_FEE_ANNOUNCE', 'LmsFeeAnnouncement', updated.id, { after: { title, feeType, scope, count } });
  res.status(201).json({ announcement: updated, challansCreated: count, totalBilled });
}));

router.delete('/finance/announcements/:id', PROVOST, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ann = await prisma.lmsFeeAnnouncement.findUnique({ where: { id } });
  if (!ann) throw httpError(404, 'Announcement not found');
  // Close the announcement and remove its UNPAID auto-generated challans
  // (paid challans are preserved as financial records).
  await prisma.lmsFeeChallan.deleteMany({ where: { sourceAnnouncementId: id, status: 'UNPAID' } });
  await prisma.lmsFeeAnnouncement.update({ where: { id }, data: { status: 'CLOSED' } });
  await audit(req, 'PROVOST_FEE_ANNOUNCE_CLOSE', 'LmsFeeAnnouncement', id, {});
  res.json({ success: true });
}));

// ------------------------------------------------------------
// Filter-options for scoped announcements / record filters.
// ------------------------------------------------------------
router.get('/finance/filter-options', PROVOST, asyncHandler(async (req, res) => {
  const positions = await resolveStudentPositions();
  const list = [...positions.values()];
  const distinct = (arr) => [...new Set(arr.filter((x) => x != null && x !== ''))];
  res.json({
    departments: distinct(list.map((p) => p.department)).sort(),
    programs: distinct(list.map((p) => p.program)).sort(),
    semesters: distinct(list.map((p) => p.semester)).sort((a, b) => a - b),
    sections: distinct(list.map((p) => p.section)).sort(),
  });
}));

// ------------------------------------------------------------
// Shared builder: full fee record rows enriched with position.
// Supports filters: department, program, semester, section, status, feeType, q.
// ------------------------------------------------------------
async function buildFeeRecords(query) {
  const positions = await resolveStudentPositions();
  const blocks = await getActiveBlocks();
  const where = {};
  if (query.feeType) where.feeType = String(query.feeType).toUpperCase();
  const challans = await prisma.lmsFeeChallan.findMany({ where, orderBy: { createdAt: 'desc' } });

  let rows = challans.map((c) => {
    const pos = positions.get(c.studentId) || {};
    return {
      id: c.id,
      challanNo: c.challanNo,
      studentId: c.studentId,
      student: pos.fullName || c.studentId,
      roll: pos.rollNumber || '',
      cnic: pos.cnic || '',
      program: c.program || pos.program || '',
      department: c.department || pos.department || '',
      semester: c.semester != null ? c.semester : pos.semester,
      section: c.section || pos.section || '',
      title: c.title,
      feeType: c.feeType || '—',
      amount: c.totalAmount,
      status: challanStatusLabel(c),
      rawStatus: c.status,
      dueDate: c.dueDate,
      paidAt: c.paidAt,
      paymentRef: c.paymentRef,
      createdAt: c.createdAt,
      blocked: blocks.has(c.studentId),
    };
  });

  // Apply filters (real, server-side).
  const f = (k) => (query[k] != null && query[k] !== '' ? String(query[k]) : null);
  if (f('department')) rows = rows.filter((r) => r.department === f('department'));
  if (f('program')) rows = rows.filter((r) => r.program === f('program'));
  if (f('semester')) rows = rows.filter((r) => String(r.semester) === f('semester'));
  if (f('section')) rows = rows.filter((r) => r.section === f('section'));
  if (f('status')) rows = rows.filter((r) => r.status.toLowerCase() === f('status').toLowerCase());
  if (f('q')) {
    const q = f('q').toLowerCase();
    rows = rows.filter((r) => r.student.toLowerCase().includes(q)
      || r.roll.toLowerCase().includes(q) || r.cnic.toLowerCase().includes(q));
  }
  return rows;
}

// ------------------------------------------------------------
// 5. COMPLETE STUDENT FEE RECORDS (filterable)
// ------------------------------------------------------------
router.get('/finance/records', PROVOST, asyncHandler(async (req, res) => {
  const rows = await buildFeeRecords(req.query);
  res.json({
    items: rows,
    stats: {
      total: rows.length,
      collected: rows.filter((r) => r.rawStatus === 'PAID').reduce((s, r) => s + r.amount, 0),
      pending: rows.filter((r) => r.rawStatus !== 'PAID' && r.rawStatus !== 'WAIVED').reduce((s, r) => s + r.amount, 0),
    },
  });
}));

// ------------------------------------------------------------
// 8. PENDING FEES MODULE
// ------------------------------------------------------------
router.get('/finance/pending', PROVOST, asyncHandler(async (req, res) => {
  const rows = (await buildFeeRecords(req.query)).filter((r) => r.rawStatus === 'UNPAID' || r.rawStatus === 'OVERDUE');
  res.json({
    items: rows,
    stats: { count: rows.length, amount: rows.reduce((s, r) => s + r.amount, 0) },
  });
}));

// ------------------------------------------------------------
// 9. SUBMITTED FEES MODULE
// ------------------------------------------------------------
router.get('/finance/submitted', PROVOST, asyncHandler(async (req, res) => {
  const rows = (await buildFeeRecords(req.query)).filter((r) => r.rawStatus === 'PAID');
  res.json({
    items: rows,
    stats: { count: rows.length, amount: rows.reduce((s, r) => s + r.amount, 0) },
  });
}));

// ------------------------------------------------------------
// 6. ADVANCED STUDENT SEARCH
//    filters: q (name/roll/cnic), program, semester, section, department
// ------------------------------------------------------------
router.get('/finance/students', PROVOST, asyncHandler(async (req, res) => {
  const positions = await resolveStudentPositions();
  const blocks = await getActiveBlocks();
  const challans = await prisma.lmsFeeChallan.findMany();

  // Aggregate per-student fee totals.
  const agg = {};
  for (const c of challans) {
    if (!agg[c.studentId]) agg[c.studentId] = { paid: 0, pending: 0, total: 0 };
    agg[c.studentId].total += c.totalAmount;
    if (c.status === 'PAID') agg[c.studentId].paid += c.totalAmount;
    else if (c.status !== 'WAIVED') agg[c.studentId].pending += c.totalAmount;
  }

  let list = [...positions.values()].map((p) => {
    const a = agg[p.studentId] || { paid: 0, pending: 0, total: 0 };
    return {
      studentId: p.studentId,
      name: p.fullName,
      roll: p.rollNumber,
      cnic: p.cnic,
      program: p.program,
      department: p.department,
      semester: p.semester,
      section: p.section,
      paid: a.paid,
      pending: a.pending,
      total: a.total,
      feeStatus: a.pending > 0 ? 'Pending' : (a.total > 0 ? 'Cleared' : 'No Dues'),
      blocked: blocks.has(p.studentId),
    };
  });

  const f = (k) => (req.query[k] != null && req.query[k] !== '' ? String(req.query[k]) : null);
  if (f('q')) {
    const q = f('q').toLowerCase();
    list = list.filter((r) => (r.name || '').toLowerCase().includes(q)
      || (r.roll || '').toLowerCase().includes(q) || (r.cnic || '').toLowerCase().includes(q));
  }
  if (f('program')) list = list.filter((r) => r.program === f('program'));
  if (f('department')) list = list.filter((r) => r.department === f('department'));
  if (f('semester')) list = list.filter((r) => String(r.semester) === f('semester'));
  if (f('section')) list = list.filter((r) => r.section === f('section'));

  list.sort((a, b) => (a.roll || '').localeCompare(b.roll || ''));
  res.json({ items: list, total: list.length });
}));

// ------------------------------------------------------------
// 7. COMPLETE STUDENT FEE PROFILE
// ------------------------------------------------------------
router.get('/finance/students/:id/profile', PROVOST, asyncHandler(async (req, res) => {
  const studentId = req.params.id;
  const positions = await resolveStudentPositions();
  const pos = positions.get(studentId);
  if (!pos) throw httpError(404, 'Student not found');

  const [challans, blocks] = await Promise.all([
    prisma.lmsFeeChallan.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }),
    prisma.lmsStudentBlock.findMany({ where: { studentId }, orderBy: { blockedAt: 'desc' } }),
  ]);

  const paid = challans.filter((c) => c.status === 'PAID');
  const pending = challans.filter((c) => c.status !== 'PAID' && c.status !== 'WAIVED');
  const mapChallan = (c) => ({
    id: c.id, challanNo: c.challanNo, title: c.title, feeType: c.feeType || '—',
    amount: c.totalAmount, status: challanStatusLabel(c), rawStatus: c.status,
    semester: c.semester, section: c.section, dueDate: c.dueDate, paidAt: c.paidAt,
    paymentRef: c.paymentRef, createdAt: c.createdAt,
  });

  const activeBlock = blocks.find((b) => b.unblockedAt === null) || null;

  res.json({
    student: {
      studentId,
      name: pos.fullName,
      roll: pos.rollNumber,
      cnic: pos.cnic,
      fatherName: pos.fatherName,
      program: pos.program,
      programName: pos.programName,
      department: pos.department,
      semester: pos.semester,
      section: pos.section,
      email: pos.email,
      phone: pos.phone,
      registrationNumber: pos.registrationNumber,
      session: pos.session,
      photoUrl: pos.photoUrl,
    },
    feeStatus: pending.length ? 'Pending' : (challans.length ? 'Cleared' : 'No Dues'),
    blocked: !!activeBlock,
    totals: {
      billed: challans.reduce((s, c) => s + c.totalAmount, 0),
      paid: paid.reduce((s, c) => s + c.totalAmount, 0),
      pending: pending.reduce((s, c) => s + c.totalAmount, 0),
    },
    semesterFeeHistory: challans.filter((c) => c.feeType === 'SEMESTER').map(mapChallan),
    examFeeHistory: challans.filter((c) => c.feeType === 'EXAMINATION').map(mapChallan),
    allChallans: challans.map(mapChallan),
    transactions: paid.map((c) => ({
      challanNo: c.challanNo, title: c.title, amount: c.totalAmount,
      paidAt: c.paidAt, paymentRef: c.paymentRef,
    })),
    blockHistory: blocks.map((b) => ({
      id: b.id, reason: b.reason, blockedAt: b.blockedAt, unblockedAt: b.unblockedAt,
      unblockNote: b.unblockNote, semester: b.semester, section: b.section,
      active: b.unblockedAt === null,
    })),
  });
}));

// ------------------------------------------------------------
// 10. PROFESSIONAL CARDS — Departments / Programs / Semesters summary
// ------------------------------------------------------------
router.get('/finance/cards', PROVOST, asyncHandler(async (req, res) => {
  const positions = await resolveStudentPositions();
  const challans = await prisma.lmsFeeChallan.findMany();

  const posList = [...positions.values()];
  const challanByStudent = {};
  for (const c of challans) {
    if (!challanByStudent[c.studentId]) challanByStudent[c.studentId] = [];
    challanByStudent[c.studentId].push(c);
  }

  const buildCards = (keyFn) => {
    const m = {};
    for (const p of posList) {
      const k = keyFn(p);
      if (k == null || k === '') continue;
      if (!m[k]) m[k] = { key: k, students: 0, collected: 0, pending: 0, submittedCount: 0, pendingCount: 0 };
      m[k].students += 1;
      const cs = challanByStudent[p.studentId] || [];
      let hasPending = false; let hasSubmitted = false;
      for (const c of cs) {
        if (c.status === 'PAID') { m[k].collected += c.totalAmount; hasSubmitted = true; }
        else if (c.status !== 'WAIVED') { m[k].pending += c.totalAmount; hasPending = true; }
      }
      if (hasPending) m[k].pendingCount += 1;
      if (hasSubmitted) m[k].submittedCount += 1;
    }
    return Object.values(m).sort((a, b) => b.students - a.students);
  };

  res.json({
    departments: buildCards((p) => p.department),
    programs: buildCards((p) => p.program),
    semesters: buildCards((p) => (p.semester != null ? `Semester ${p.semester}` : null)),
  });
}));

// ------------------------------------------------------------
// 13 & 14. BLOCK / UNBLOCK STUDENT (with history + position snapshot)
// ------------------------------------------------------------
router.post('/finance/students/:id/block', PROVOST, validate([
  body('reason').isString().trim().isLength({ min: 3 }).withMessage('Block reason is required.'),
]), asyncHandler(async (req, res) => {
  const studentId = req.params.id;
  const positions = await resolveStudentPositions();
  const pos = positions.get(studentId);
  if (!pos) throw httpError(404, 'Student not found');

  // Already blocked?
  const open = await prisma.lmsStudentBlock.findFirst({ where: { studentId, unblockedAt: null } });
  if (open) throw httpError(409, 'Student is already blocked.');

  const block = await prisma.lmsStudentBlock.create({
    data: {
      studentId,
      reason: String(req.body.reason).trim(),
      semester: pos.semester != null ? pos.semester : null,
      section: pos.section || null,
      program: pos.program || null,
      department: pos.department || null,
      blockedById: req.lmsUser.id,
    },
  });
  // Reflect on the LmsUser (keeps existing isActive semantics; login still
  // works for non-finance use — block is enforced at finance/account level).
  await notify(studentId, {
    title: 'Account Blocked — Fee Pending',
    message: `Your account has been blocked. Reason: ${block.reason}. Please clear your dues to continue.`,
    type: 'FEE',
  });
  await audit(req, 'PROVOST_STUDENT_BLOCK', 'LmsStudentBlock', block.id, { after: { studentId, reason: block.reason } });
  res.status(201).json({ block });
}));

router.post('/finance/students/:id/unblock', PROVOST, asyncHandler(async (req, res) => {
  const studentId = req.params.id;
  const open = await prisma.lmsStudentBlock.findFirst({ where: { studentId, unblockedAt: null }, orderBy: { blockedAt: 'desc' } });
  if (!open) throw httpError(404, 'No active block found for this student.');

  // Continuation-after-unblock: the position snapshot (semester/section/
  // program/department) stored at block time is preserved on the row, so
  // the student resumes from exactly the same academic position. We do NOT
  // touch their registrations / enrollment, guaranteeing no data loss.
  const updated = await prisma.lmsStudentBlock.update({
    where: { id: open.id },
    data: {
      unblockedById: req.lmsUser.id,
      unblockedAt: new Date(),
      unblockNote: req.body.note ? String(req.body.note).trim() : null,
    },
  });
  await notify(studentId, {
    title: 'Account Unblocked',
    message: 'Your account has been unblocked. You may continue from your current semester and section.',
    type: 'FEE',
  });
  await audit(req, 'PROVOST_STUDENT_UNBLOCK', 'LmsStudentBlock', updated.id, {
    after: { studentId, resumeSemester: updated.semester, resumeSection: updated.section },
  });
  res.json({
    block: updated,
    continuation: {
      semester: updated.semester,
      section: updated.section,
      program: updated.program,
      department: updated.department,
      message: 'Student continues from the same academic position. No records lost.',
    },
  });
}));

// ------------------------------------------------------------
// BULK BLOCK — block many students at once (due to pending fees).
//   Body: { studentIds: string[], reason: string }
//   Skips students already blocked or not found; returns a per-student
//   summary. All DB writes are real-time; the student status reflects
//   immediately across the system (blocked list, students list, profile).
// ------------------------------------------------------------
router.post('/finance/students/bulk-block', PROVOST, validate([
  body('studentIds').isArray({ min: 1 }).withMessage('Select at least one student.'),
  body('reason').isString().trim().isLength({ min: 3 }).withMessage('Block reason is required.'),
]), asyncHandler(async (req, res) => {
  const reason = String(req.body.reason).trim();
  const ids = [...new Set((req.body.studentIds || []).map((x) => String(x)))];
  const positions = await resolveStudentPositions();
  const openBlocks = await prisma.lmsStudentBlock.findMany({ where: { studentId: { in: ids }, unblockedAt: null } });
  const alreadyBlocked = new Set(openBlocks.map((b) => b.studentId));

  const blocked = [];
  const skipped = [];
  for (const studentId of ids) {
    const pos = positions.get(studentId);
    if (!pos) { skipped.push({ studentId, reason: 'not_found' }); continue; }
    if (alreadyBlocked.has(studentId)) { skipped.push({ studentId, reason: 'already_blocked' }); continue; }
    const block = await prisma.lmsStudentBlock.create({
      data: {
        studentId,
        reason,
        semester: pos.semester != null ? pos.semester : null,
        section: pos.section || null,
        program: pos.program || null,
        department: pos.department || null,
        blockedById: req.lmsUser.id,
      },
    });
    await notify(studentId, {
      title: 'Account Blocked — Fee Pending',
      message: `Your account has been blocked. Reason: ${reason}. Please clear your dues to continue.`,
      type: 'FEE',
    }).catch(() => {});
    blocked.push({ studentId, blockId: block.id });
  }
  await audit(req, 'PROVOST_STUDENT_BULK_BLOCK', 'LmsStudentBlock', null, {
    after: { count: blocked.length, reason, studentIds: blocked.map((b) => b.studentId) },
  });
  res.status(201).json({
    success: true,
    blockedCount: blocked.length,
    skippedCount: skipped.length,
    blocked,
    skipped,
  });
}));

// ------------------------------------------------------------
// BULK RESTORE (UNBLOCK) — unblock/restore many students at once.
//   Body: { studentIds: string[], note?: string }
//   The position snapshot is preserved per student, so each student
//   resumes from exactly the same academic position. Real-time DB writes.
// ------------------------------------------------------------
router.post('/finance/students/bulk-unblock', PROVOST, validate([
  body('studentIds').isArray({ min: 1 }).withMessage('Select at least one student.'),
]), asyncHandler(async (req, res) => {
  const note = req.body.note ? String(req.body.note).trim() : null;
  const ids = [...new Set((req.body.studentIds || []).map((x) => String(x)))];
  const openBlocks = await prisma.lmsStudentBlock.findMany({
    where: { studentId: { in: ids }, unblockedAt: null },
    orderBy: { blockedAt: 'desc' },
  });
  // Keep only the latest open block per student (defensive — there should be one).
  const latestByStudent = new Map();
  for (const b of openBlocks) if (!latestByStudent.has(b.studentId)) latestByStudent.set(b.studentId, b);

  const restored = [];
  const skipped = [];
  for (const studentId of ids) {
    const open = latestByStudent.get(studentId);
    if (!open) { skipped.push({ studentId, reason: 'not_blocked' }); continue; }
    const updated = await prisma.lmsStudentBlock.update({
      where: { id: open.id },
      data: { unblockedById: req.lmsUser.id, unblockedAt: new Date(), unblockNote: note },
    });
    await notify(studentId, {
      title: 'Account Unblocked',
      message: 'Your account has been unblocked. You may continue from your current semester and section.',
      type: 'FEE',
    }).catch(() => {});
    restored.push({ studentId, semester: updated.semester, section: updated.section });
  }
  await audit(req, 'PROVOST_STUDENT_BULK_UNBLOCK', 'LmsStudentBlock', null, {
    after: { count: restored.length, studentIds: restored.map((r) => r.studentId) },
  });
  res.json({
    success: true,
    restoredCount: restored.length,
    skippedCount: skipped.length,
    restored,
    skipped,
  });
}));

// List of blocked students (with active block details).
router.get('/finance/blocked', PROVOST, asyncHandler(async (req, res) => {
  const positions = await resolveStudentPositions();
  const open = await prisma.lmsStudentBlock.findMany({ where: { unblockedAt: null }, orderBy: { blockedAt: 'desc' } });
  res.json({
    items: open.map((b) => {
      const p = positions.get(b.studentId) || {};
      return {
        id: b.id, studentId: b.studentId, name: p.fullName || b.studentId, roll: p.rollNumber || '',
        program: b.program || p.program, department: b.department || p.department,
        semester: b.semester != null ? b.semester : p.semester, section: b.section || p.section,
        reason: b.reason, blockedAt: b.blockedAt,
      };
    }),
    total: open.length,
  });
}));

// ------------------------------------------------------------
// 16. REPORTS + EXPORT (PDF via printable HTML, Excel via CSV)
//   kinds: department | program | semester | section | submitted |
//          pending | examination | semesterfee | blocked | unblocked
// ------------------------------------------------------------
async function buildReport(kind, query) {
  const rows = await buildFeeRecords({});
  const positions = await resolveStudentPositions();
  const k = String(kind || '').toLowerCase();

  const groupBy = (keyFn, label) => {
    const m = {};
    for (const r of rows) {
      const key = keyFn(r) || '—';
      if (!m[key]) m[key] = { group: key, students: new Set(), collected: 0, pending: 0, total: 0, count: 0 };
      m[key].students.add(r.studentId);
      m[key].total += r.amount; m[key].count += 1;
      if (r.rawStatus === 'PAID') m[key].collected += r.amount;
      else if (r.rawStatus !== 'WAIVED') m[key].pending += r.amount;
    }
    return {
      title: label,
      columns: ['Group', 'Students', 'Records', 'Collected (Rs.)', 'Pending (Rs.)', 'Total (Rs.)'],
      rows: Object.values(m).map((g) => [g.group, g.students.size, g.count, g.collected, g.pending, g.total]),
    };
  };

  const listBy = (filterFn, label) => {
    const filtered = rows.filter(filterFn);
    return {
      title: label,
      columns: ['Roll', 'Student', 'Program', 'Dept', 'Sem', 'Sec', 'Fee Type', 'Amount (Rs.)', 'Status'],
      rows: filtered.map((r) => [r.roll, r.student, r.program, r.department, r.semester, r.section, r.feeType, r.amount, r.status]),
    };
  };

  switch (k) {
    case 'department': return groupBy((r) => r.department, 'Department-wise Fee Report');
    case 'program': return groupBy((r) => r.program, 'Program-wise Fee Report');
    case 'semester': return groupBy((r) => (r.semester != null ? `Semester ${r.semester}` : '—'), 'Semester-wise Fee Report');
    case 'section': return groupBy((r) => r.section, 'Section-wise Fee Report');
    case 'submitted': return listBy((r) => r.rawStatus === 'PAID', 'Submitted Fee Report');
    case 'pending': return listBy((r) => r.rawStatus !== 'PAID' && r.rawStatus !== 'WAIVED', 'Pending Fee Report');
    case 'examination': return listBy((r) => r.feeType === 'EXAMINATION', 'Examination Fee Report');
    case 'semesterfee': return listBy((r) => r.feeType === 'SEMESTER', 'Semester Fee Report');
    case 'blocked': {
      const open = await prisma.lmsStudentBlock.findMany({ where: { unblockedAt: null }, orderBy: { blockedAt: 'desc' } });
      return {
        title: 'Blocked Students Report',
        columns: ['Roll', 'Student', 'Program', 'Sem', 'Sec', 'Reason', 'Blocked On'],
        rows: open.map((b) => { const p = positions.get(b.studentId) || {}; return [p.rollNumber || '', p.fullName || b.studentId, b.program || p.program, b.semester, b.section, b.reason, new Date(b.blockedAt).toISOString().slice(0, 10)]; }),
      };
    }
    case 'unblocked': {
      const closed = await prisma.lmsStudentBlock.findMany({ where: { unblockedAt: { not: null } }, orderBy: { unblockedAt: 'desc' } });
      return {
        title: 'Unblocked Students Report',
        columns: ['Roll', 'Student', 'Program', 'Sem', 'Sec', 'Reason', 'Unblocked On'],
        rows: closed.map((b) => { const p = positions.get(b.studentId) || {}; return [p.rollNumber || '', p.fullName || b.studentId, b.program || p.program, b.semester, b.section, b.reason, new Date(b.unblockedAt).toISOString().slice(0, 10)]; }),
      };
    }
    default: return groupBy((r) => r.department, 'Department-wise Fee Report');
  }
}

router.get('/finance/reports/:kind', PROVOST, asyncHandler(async (req, res) => {
  const report = await buildReport(req.params.kind, req.query);
  res.json(report);
}));

router.get('/finance/reports/:kind/export', PROVOST, asyncHandler(async (req, res) => {
  const report = await buildReport(req.params.kind, req.query);
  const format = String(req.query.format || 'csv').toLowerCase();

  if (format === 'pdf' || format === 'html') {
    // Printable HTML (the client opens it and uses Print → Save as PDF).
    const tableRows = report.rows.map((r) => `<tr>${r.map((c) => `<td>${c == null ? '' : String(c)}</td>`).join('')}</tr>`).join('');
    const head = report.columns.map((c) => `<th>${c}</th>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${report.title}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}h1{font-size:18px}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
      th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
      th{background:#0c4a6e;color:#fff}tr:nth-child(even){background:#f1f5f9}
      .meta{color:#64748b;font-size:12px;margin-bottom:8px}</style></head>
      <body><h1>AUST ODL — ${report.title}</h1>
      <div class="meta">Generated ${new Date().toLocaleString('en-GB')} · ${report.rows.length} rows</div>
      <table><thead><tr>${head}</tr></thead><tbody>${tableRows}</tbody></table>
      <script>window.onload=()=>window.print()</script></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  // CSV (opens in Excel).
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csv = [report.columns.map(esc).join(','), ...report.rows.map((r) => r.map(esc).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${report.title.replace(/\s+/g, '_')}.csv"`);
  return res.send(csv);
}));

// ============================================================
// STUDENT APPEALS — appeals routed to the Provost.
// Only appeals explicitly addressed to PROVOST are shown.
// ============================================================
router.get('/student-appeals', PROVOST, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'createdAt' });
  const where = { isDeleted: false, targetRole: 'PROVOST' };
  if (req.query.status && req.query.status !== 'ALL') {
    const st = String(req.query.status).toUpperCase();
    if (st === 'PENDING') where.status = { in: ['OPEN', 'IN_REVIEW'] };
    else where.status = st;
  }
  const [items, total] = await Promise.all([
    prisma.studentAppeal.findMany({
      where,
      include: { student: { select: { id: true, username: true, profile: { select: { fullName: true, rollNumber: true, program: true } } } } },
      orderBy: { createdAt: q.sortDir }, skip: q.skip, take: q.take,
    }),
    prisma.studentAppeal.count({ where }),
  ]);
  let rows = items.map((a) => ({
    id: a.id, studentId: a.studentId,
    studentName: a.student?.profile?.fullName || a.student?.username,
    roll: a.student?.profile?.rollNumber || a.student?.username,
    program: a.student?.profile?.program || null,
    type: a.type, subject: a.subject, description: a.description,
    attachmentUrl: a.filePath || null, attachmentName: a.fileName || null,
    status: a.status, response: a.response || null,
    createdAt: a.createdAt, decidedAt: a.handledAt || a.updatedAt,
  }));
  if (req.query.search) {
    const s = String(req.query.search).toLowerCase();
    rows = rows.filter((a) => [a.studentName, a.roll, a.subject, a.type].some((v) => (v || '').toLowerCase().includes(s)));
  }
  res.json(paginated(rows, total, q));
}));

router.put('/student-appeals/:id/decide', PROVOST, validate([
  body('action').isIn(['approve', 'reject', 'review']),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action, response } = req.body;
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted || appeal.targetRole !== 'PROVOST') throw httpError(404, 'Appeal not found.');
  const statusMap = { approve: 'RESOLVED', reject: 'REJECTED', review: 'IN_REVIEW' };
  const newStatus = statusMap[action];
  const updated = await prisma.studentAppeal.update({
    where: { id },
    data: { status: newStatus, response: response || appeal.response, handledById: req.lmsUser.id, handledAt: action === 'review' ? null : new Date() },
  });
  await audit(req, `PROVOST_APPEAL_${action.toUpperCase()}`, 'StudentAppeal', String(id), { before: { status: appeal.status }, after: { status: newStatus } });
  await notify(appeal.studentId, { title: `Appeal ${newStatus.toLowerCase()}`, message: response || `Your appeal "${appeal.subject}" was ${newStatus.toLowerCase()} by the Provost.`, type: 'APPEAL', link: '/student/appeals' });
  res.json({ appeal: updated });
}));

module.exports = router;

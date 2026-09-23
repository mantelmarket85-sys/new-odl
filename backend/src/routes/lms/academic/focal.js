// ============================================================
//  FOCAL PERSON ROUTES  — /api/lms/academic/focal/*
//  ------------------------------------------------------------
//  Phase 4 — Focal Person. Production-ready, fully DB-backed
//  department-oversight APIs. RBAC: FocalPerson (Provost may also
//  read for university oversight where noted). Every mutating
//  action writes an LmsAuditLog row and notifies affected user(s).
//
//  Modules: Dashboard (Dept/Faculty/Student KPIs + Pending
//  Approvals) · Department Monitoring (progress/academic/resource/
//  faculty) · Student Affairs (cases/requests/escalations/
//  complaints) · Faculty Coordination (performance/issues/workload)
//  · Approvals (academic/faculty/student/escalation) · Reports ·
//  Analytics (dept/faculty/student/trend) · Communication
//  (notifications/messaging/announcements) · Escalation Matrix ·
//  Workflow Engine · Audit Logs · Activity Tracking · Risk Monitoring.
// ============================================================
const express = require('express');
const { body } = require('express-validator');
const prisma = require('../../../utils/prisma');
const { lmsAuth, lmsRequireRole } = require('../../../middleware/lmsAuth');
const { validate } = require('../../../middleware/validate');
const { asyncHandler, parseListQuery, paginated, httpError, safeJson } = require('../../../utils/lmsHelpers');
const { creditLabel } = require('../../../utils/lmsCredit');
const { audit } = require('../../../utils/lmsAudit');
const { notify, notifyMany } = require('../../../utils/lmsNotify');
const { computeGPA } = require('../../../utils/lmsGrading');
const { displayName, nameMap, nextRole, ESCALATION_CHAIN } = require('../../../utils/lmsWorkflow');
const {
  buildDeptScope, programWhere, courseWhere, offeringWhere,
  studentWhere, teacherWhere, byOfferingWhere, byStudentWhere,
} = require('../../../utils/lmsDeptScope');
const { uploadPhoto } = require('../../../middleware/upload');
const realtime = require('../../../utils/lmsRealtime');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const router = express.Router();

// ============================================================
// REAL-TIME EVENT STREAM (SSE) — GET /focal/events?token=<jwt>
// Registered BEFORE the auth middleware (EventSource cannot send
// Authorization headers). Lets the Focal Person receive live lab-task
// activity (`labtask-monitor`), assessment updates, presence, etc. (Req 2).
// ============================================================
router.get('/events', asyncHandler(async (req, res) => {
  const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Token required' });
  let decoded;
  try { decoded = jwt.verify(token, process.env.JWT_SECRET); } catch (_) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (decoded.system !== 'lms') return res.status(401).json({ error: 'Invalid session' });
  const userId = decoded.userId;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  realtime.addClient(userId, res);

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) { /* closed */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    realtime.removeClient(userId, res);
  });
}));

router.use(lmsAuth);

// ------------------------------------------------------------
// Department scope middleware. Resolves req.scope = the focal
// person's department scope (program/course/offering/student/
// teacher id sets). Provost is unscoped (university oversight).
// Every focal endpoint composes its `where` from this so a focal
// person ONLY ever sees their own department's data.
// ------------------------------------------------------------
async function withScope(req, res, next) {
  try {
    req.scope = await buildDeptScope(req.lmsUser);
    next();
  } catch (e) {
    next(e);
  }
}
router.use(withScope);

// FocalPerson area guard. Provost gets read-only oversight where noted.
const FOCAL = lmsRequireRole('FocalPerson');
const FOCAL_OR_GOV = lmsRequireRole('FocalPerson', 'Provost');

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function currentTerm() {
  return prisma.academicTerm.findFirst({ where: { isCurrent: true, isActive: true } });
}

// Fine details are embedded inside the Escalation.description using a
// parseable tag so we never have to add a DB column (table-safe / additive).
const FINE_TAG_PREFIX = '[FINE]';
function parseFineTag(description) {
  if (!description || typeof description !== 'string') return null;
  const idx = description.indexOf(FINE_TAG_PREFIX);
  if (idx === -1) return null;
  const json = description.slice(idx + FINE_TAG_PREFIX.length).trim();
  const parsed = safeJson(json, null);
  if (!parsed) return null;
  return {
    fineDescription: parsed.fineDescription || null,
    fineAmount: Number(parsed.fineAmount) || 0,
    remarks: parsed.remarks || null,
  };
}
// Human-readable case description with the fine tag stripped out.
function stripFineTag(description) {
  if (!description || typeof description !== 'string') return description || '';
  const idx = description.indexOf(FINE_TAG_PREFIX);
  return (idx === -1 ? description : description.slice(0, idx)).trim();
}

/** Compute attendance % across all sessions/records of an offering. */
function attendancePct(sessions) {
  let present = 0;
  let total = 0;
  for (const s of sessions) {
    for (const r of s.records || []) {
      total += 1;
      if (r.status === 'PRESENT' || r.status === 'LATE') present += 1;
    }
  }
  return total ? Math.round((present / total) * 1000) / 10 : 0;
}

/** Build a risk profile for a student from their published results. */
function studentRisk(results) {
  const gpa = computeGPA(results.map((r) => ({ gradePoints: r.gradePoints, creditHours: r.creditHours })));
  const failing = results.filter((r) => r.percent < 50).length;
  let risk = 'LOW';
  if (gpa < 1.5 || failing >= 2) risk = 'HIGH';
  else if (gpa < 2.0 || failing === 1) risk = 'MEDIUM';
  return { gpa, failing, risk };
}

// ============================================================
// DASHBOARD — Department KPIs · Faculty KPIs · Student KPIs · Pending Approvals
// ============================================================
router.get('/dashboard', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const scope = req.scope;

  // Department-scoped where fragments.
  const offWhere = { isDeleted: false, termId, ...offeringWhere(scope) };
  const studGiven = scope.unscoped ? {} : studentWhere(scope);
  const teachGiven = scope.unscoped ? {} : teacherWhere(scope);
  const regScopeWhere = scope.unscoped ? {} : byOfferingWhere(scope);
  const resScopeWhere = scope.unscoped ? {} : byOfferingWhere(scope);

  const [
    totalPrograms, totalCourses, totalOfferings, totalSections,
    totalTeachers, activeTeachers, totalStudents, activeStudents,
    totalRegistrations, withdrawnRegs, retakeRegs,
    pendingApprovals, openEscalations, criticalEscalations,
    draftResults, publishedResults,
    offerings,
    recentEscalations, recentApprovals,
  ] = await Promise.all([
    prisma.lmsProgram.count({ where: { isDeleted: false, ...programWhere(scope) } }),
    prisma.lmsCourse.count({ where: { isDeleted: false, ...courseWhere(scope) } }),
    prisma.courseOffering.count({ where: offWhere }),
    prisma.section.count({ where: { isDeleted: false, ...(scope.unscoped ? {} : byOfferingWhere(scope)) } }),
    prisma.lmsUser.count({ where: { role: 'Teacher', ...teachGiven } }),
    prisma.lmsUser.count({ where: { role: 'Teacher', isActive: true, ...teachGiven } }),
    prisma.lmsUser.count({ where: { role: 'Student', ...studGiven } }),
    prisma.lmsUser.count({ where: { role: 'Student', isActive: true, ...studGiven } }),
    prisma.courseRegistration.count({ where: { status: 'ENROLLED', ...regScopeWhere } }),
    prisma.courseRegistration.count({ where: { status: 'WITHDRAWN', ...regScopeWhere } }),
    prisma.courseRegistration.count({ where: { registrationType: 'RETAKE', ...regScopeWhere } }),
    prisma.approvalRequest.count({ where: { assignedRole: 'FocalPerson', status: { in: ['PENDING', 'IN_REVIEW'] } } }),
    prisma.escalation.count({ where: { currentRole: 'FocalPerson', status: { in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] } } }),
    prisma.escalation.count({ where: { currentRole: 'FocalPerson', severity: 'CRITICAL', status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.courseResult.count({ where: { status: 'DRAFT', ...resScopeWhere } }),
    prisma.courseResult.count({ where: { status: 'PUBLISHED', ...resScopeWhere } }),
    prisma.courseOffering.findMany({
      where: offWhere,
      include: {
        course: true,
        teacher: { select: { id: true, username: true } },
        _count: { select: { registrations: true } },
        attendanceSessions: { include: { records: { select: { status: true } } } },
        results: { select: { status: true, totalPercent: true } },
      },
    }),
    prisma.escalation.findMany({ where: { currentRole: 'FocalPerson' }, orderBy: { createdAt: 'desc' }, take: 6 }),
    prisma.approvalRequest.findMany({ where: { assignedRole: 'FocalPerson' }, orderBy: { createdAt: 'desc' }, take: 6 }),
  ]);

  // Department progress per offering.
  const courseProgress = offerings.map((o) => {
    const att = attendancePct(o.attendanceSessions);
    const published = o.results.filter((r) => r.status === 'PUBLISHED');
    const passed = published.filter((r) => r.totalPercent >= 50).length;
    return {
      offeringId: o.id,
      course: `${o.course.code} — ${o.course.title}`,
      teacher: o.teacher ? o.teacher.username : 'Unassigned',
      students: o._count.registrations,
      attendancePct: att,
      resultsPublished: published.length,
      passRate: published.length ? Math.round((passed / published.length) * 100) : 0,
    };
  });

  // KPI aggregates.
  const avgAttendance = courseProgress.length
    ? Math.round((courseProgress.reduce((a, c) => a + c.attendancePct, 0) / courseProgress.length) * 10) / 10
    : 0;
  const withResults = courseProgress.filter((c) => c.resultsPublished > 0);
  const avgPassRate = withResults.length
    ? Math.round(withResults.reduce((a, c) => a + c.passRate, 0) / withResults.length)
    : 0;

  // Faculty load (department-scoped).
  const teacherLoads = await prisma.courseOffering.groupBy({
    by: ['teacherId'], where: { isDeleted: false, termId, teacherId: { not: null }, ...offeringWhere(scope) }, _count: true,
  });

  // Alerts / risk.
  const unassigned = offerings.filter((o) => !o.teacherId).map((o) => `${o.course.code} has no teacher assigned`);
  const lowAttendance = courseProgress.filter((c) => c.attendancePct > 0 && c.attendancePct < 75)
    .map((c) => `${c.course} attendance is ${c.attendancePct}%`);
  const lowPass = courseProgress.filter((c) => c.resultsPublished > 0 && c.passRate < 60)
    .map((c) => `${c.course} pass rate is ${c.passRate}%`);

  const names = await nameMap([...recentEscalations.map((e) => e.raisedById), ...recentApprovals.map((a) => a.requestedById)]);

  res.json({
    term: term || null,
    scopedDepartment: scope.department || null,
    departmentKpis: {
      totalPrograms, totalCourses, totalOfferings, totalSections,
      avgAttendance, avgPassRate,
      activeOfferings: offerings.filter((o) => o.status === 'ACTIVE').length,
    },
    facultyKpis: {
      totalTeachers, activeTeachers,
      inactiveTeachers: totalTeachers - activeTeachers,
      assignedOfferings: teacherLoads.length,
      avgLoad: teacherLoads.length ? Math.round((teacherLoads.reduce((a, t) => a + t._count, 0) / teacherLoads.length) * 10) / 10 : 0,
    },
    studentKpis: {
      totalStudents, activeStudents,
      inactiveStudents: totalStudents - activeStudents,
      totalRegistrations, withdrawnRegs, retakeRegs,
    },
    pendingApprovals,
    openEscalations, criticalEscalations,
    draftResults, publishedResults,
    courseProgress,
    facultyLoad: teacherLoads.map((t) => ({ teacherId: t.teacherId, offerings: t._count })),
    alerts: [...unassigned, ...lowAttendance, ...lowPass],
    recentEscalations: recentEscalations.map((e) => ({ ...e, raisedByName: e.raisedById ? names[e.raisedById] : 'System' })),
    recentApprovals: recentApprovals.map((a) => ({ ...a, requestedByName: names[a.requestedById] || a.requestedById })),
  });
}));

// ============================================================
// DEPARTMENT MONITORING
//   /monitoring/progress  · /monitoring/academic
//   /monitoring/resources · /monitoring/faculty
// ============================================================

// Department Progress — per-offering completion / attendance / pass-rate.
router.get('/monitoring/progress', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offeringWhere(req.scope) },
    include: {
      course: { include: { program: true, semester: true } },
      teacher: { select: { username: true } },
      attendanceSessions: { include: { records: { select: { status: true } } } },
      results: { select: { status: true, totalPercent: true } },
      _count: { select: { registrations: true, assignments: true, quizzes: true } },
    },
    orderBy: { id: 'asc' },
  });
  res.json({
    term: term ? term.title : null,
    courses: offerings.map((o) => {
      const pub = o.results.filter((r) => r.status === 'PUBLISHED');
      const passed = pub.filter((r) => r.totalPercent >= 50).length;
      const completion = o._count.registrations ? Math.round((pub.length / o._count.registrations) * 100) : 0;
      return {
        offeringId: o.id,
        code: o.course.code, title: o.course.title,
        program: o.course.program ? o.course.program.shortForm : null,
        semester: o.course.semester ? o.course.semester.number : null,
        teacher: o.teacher ? o.teacher.username : 'Unassigned',
        students: o._count.registrations,
        assignments: o._count.assignments,
        quizzes: o._count.quizzes,
        attendancePct: attendancePct(o.attendanceSessions),
        published: pub.length,
        completion,
        passRate: pub.length ? Math.round((passed / pub.length) * 100) : 0,
      };
    }),
  });
}));

// Academic Monitoring — assessment activity (assignments/quizzes/results) per offering.
router.get('/monitoring/academic', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offeringWhere(req.scope) },
    include: {
      course: { select: { code: true, title: true } },
      teacher: { select: { username: true } },
      assignments: { where: { isDeleted: false }, include: { submissions: { select: { status: true } } } },
      quizzes: { where: { isDeleted: false }, include: { attempts: { select: { status: true } } } },
      results: { select: { status: true, midMarks: true, finalMarks: true, totalPercent: true } },
      _count: { select: { registrations: true } },
    },
  });
  res.json({
    courses: offerings.map((o) => {
      const assignSubs = o.assignments.reduce((a, x) => a + x.submissions.length, 0);
      const assignGraded = o.assignments.reduce((a, x) => a + x.submissions.filter((s) => s.status === 'GRADED').length, 0);
      const quizAttempts = o.quizzes.reduce((a, x) => a + x.attempts.length, 0);
      const midEntered = o.results.filter((r) => r.midMarks > 0).length;
      const finalEntered = o.results.filter((r) => r.finalMarks > 0).length;
      const pub = o.results.filter((r) => r.status === 'PUBLISHED');
      return {
        offeringId: o.id,
        course: `${o.course.code} — ${o.course.title}`,
        teacher: o.teacher ? o.teacher.username : 'Unassigned',
        students: o._count.registrations,
        assignments: o.assignments.length, assignmentSubmissions: assignSubs, assignmentGraded: assignGraded,
        quizzes: o.quizzes.length, quizAttempts,
        midEntered, finalEntered, published: pub.length,
      };
    }),
  });
}));

// Resource Monitoring — section/room capacity utilisation + materials.
router.get('/monitoring/resources', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offeringWhere(req.scope) },
    include: {
      course: { select: { code: true, title: true } },
      sections: { where: { isDeleted: false }, include: { _count: { select: { registrations: true } } } },
      materials: { where: { isDeleted: false }, select: { id: true } },
      liveClasses: { select: { id: true } },
      _count: { select: { registrations: true } },
    },
  });
  const rooms = {};
  for (const o of offerings) {
    for (const s of o.sections) {
      const room = s.room || 'Unassigned';
      if (!rooms[room]) rooms[room] = { room, sections: 0, capacity: 0, enrolled: 0 };
      rooms[room].sections += 1;
      rooms[room].capacity += s.capacity;
      rooms[room].enrolled += s._count.registrations;
    }
  }
  res.json({
    courses: offerings.map((o) => {
      const cap = o.sections.reduce((a, s) => a + s.capacity, 0);
      const enr = o.sections.reduce((a, s) => a + s._count.registrations, 0);
      return {
        offeringId: o.id,
        course: `${o.course.code} — ${o.course.title}`,
        sections: o.sections.length,
        capacity: cap, enrolled: enr || o._count.registrations,
        utilisation: cap ? Math.round(((enr || o._count.registrations) / cap) * 100) : 0,
        materials: o.materials.length,
        liveClasses: o.liveClasses.length,
      };
    }),
    rooms: Object.values(rooms).map((r) => ({ ...r, utilisation: r.capacity ? Math.round((r.enrolled / r.capacity) * 100) : 0 })),
  });
}));

// Faculty Monitoring — per-teacher workload, attendance discipline, result entry.
router.get('/monitoring/faculty', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const teachers = await prisma.lmsUser.findMany({
    where: { role: 'Teacher', ...(req.scope.unscoped ? {} : teacherWhere(req.scope)) },
    select: { id: true, username: true, isActive: true, lastLoginAt: true },
    orderBy: { username: 'asc' },
  });
  const offs = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, teacherId: { not: null }, ...offeringWhere(req.scope) },
    include: {
      course: { select: { code: true, creditHours: true } },
      attendanceSessions: { include: { records: { select: { status: true } } } },
      results: { select: { status: true } },
      _count: { select: { registrations: true } },
    },
  });
  const map = {};
  for (const t of teachers) map[t.id] = { teacherId: t.id, teacher: t.username, isActive: t.isActive, lastLoginAt: t.lastLoginAt, offerings: 0, credits: 0, students: 0, sessions: 0, resultsPublished: 0, attendancePct: 0, _attTotals: { p: 0, t: 0 } };
  for (const o of offs) {
    const m = map[o.teacherId];
    if (!m) continue;
    m.offerings += 1;
    m.credits += o.course.creditHours;
    m.students += o._count.registrations;
    m.sessions += o.attendanceSessions.length;
    m.resultsPublished += o.results.filter((r) => r.status === 'PUBLISHED').length;
    for (const s of o.attendanceSessions) for (const r of s.records) { m._attTotals.t += 1; if (r.status === 'PRESENT' || r.status === 'LATE') m._attTotals.p += 1; }
  }
  const faculty = Object.values(map).map((m) => {
    m.attendancePct = m._attTotals.t ? Math.round((m._attTotals.p / m._attTotals.t) * 1000) / 10 : 0;
    delete m._attTotals;
    return m;
  });
  res.json({ faculty });
}));

// ============================================================
// STUDENT AFFAIRS — Cases · Requests · Escalations · Complaints
//   Implemented over the Escalation model (category-driven) +
//   StudentAppeal (student requests). Focal can act on both.
// ============================================================

// Student Cases (escalations with student subjects).
router.get('/student-affairs/cases', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const where = { category: { in: ['STUDENT_CASE', 'DISCIPLINE'] } };
  if (req.lmsUser.role === 'FocalPerson') where.currentRole = 'FocalPerson';
  if (req.query.status) where.status = String(req.query.status);
  const items = await prisma.escalation.findMany({ where, orderBy: { createdAt: 'desc' } });
  const names = await nameMap([...items.map((i) => i.raisedById), ...items.map((i) => i.studentId)]);
  res.json({ cases: items.map((e) => ({ ...e, raisedByName: e.raisedById ? names[e.raisedById] : 'System', studentName: e.studentId ? names[e.studentId] : null })) });
}));

// Student Requests — StudentAppeals routed to / visible by focal.
router.get('/student-affairs/requests', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'createdAt' });
  const where = { isDeleted: false };
  if (req.query.status) where.status = String(req.query.status);
  // Appeal routing: focal sees appeals EITHER legacy (no targetRole) OR
  // explicitly addressed to FOCAL_PERSON.
  where.OR = [{ targetRole: null }, { targetRole: 'FOCAL_PERSON' }];
  // Department scope: restrict to the focal person's department students
  // (Provost / unscoped sees all).
  const scope = req.scope;
  if (scope && !scope.unscoped) {
    where.studentId = { in: scope.studentIds.length ? scope.studentIds : ['__none__'] };
  }
  const [items, total] = await Promise.all([
    prisma.studentAppeal.findMany({
      where, orderBy: q.orderBy, skip: q.skip, take: q.take,
      include: { student: { select: { id: true, username: true, profile: { select: { fullName: true } } } } },
    }),
    prisma.studentAppeal.count({ where }),
  ]);
  res.json(paginated(items.map((a) => ({
    id: a.id, type: a.type, subject: a.subject, message: a.description, status: a.status,
    response: a.response, studentId: a.studentId, student: a.student ? displayName(a.student) : null,
    roll: a.student ? a.student.username : null, createdAt: a.createdAt, decidedAt: a.handledAt,
  })), total, q));
}));

// Decide a student request (appeal).
router.put('/student-affairs/requests/:id/decide', FOCAL, validate([
  body('action').isIn(['RESOLVE', 'REJECT', 'IN_REVIEW']).withMessage('Invalid action'),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action, response } = req.body;
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal) throw httpError(404, 'Request not found');
  const statusMap = { RESOLVE: 'RESOLVED', REJECT: 'REJECTED', IN_REVIEW: 'IN_REVIEW' };
  const updated = await prisma.studentAppeal.update({
    where: { id },
    data: { status: statusMap[action], response: response || appeal.response, handledAt: action === 'IN_REVIEW' ? null : new Date(), handledById: req.lmsUser.id },
  });
  await audit(req, `STUDENT_REQUEST_${action}`, 'StudentAppeal', id, { before: { status: appeal.status }, after: { status: updated.status } });
  await notify(appeal.studentId, { title: `Request ${updated.status.toLowerCase()}`, message: `Your request "${appeal.subject}" was ${updated.status.toLowerCase()} by the Focal Person.`, type: 'APPEAL', link: '/student/appeals' });
  res.json({ request: updated });
}));

// Complaints — escalations of category COMPLAINT.
router.get('/student-affairs/complaints', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const where = { category: 'COMPLAINT' };
  if (req.lmsUser.role === 'FocalPerson') where.currentRole = 'FocalPerson';
  if (req.query.status) where.status = String(req.query.status);
  const items = await prisma.escalation.findMany({ where, orderBy: { createdAt: 'desc' } });
  const names = await nameMap([...items.map((i) => i.raisedById), ...items.map((i) => i.studentId)]);
  res.json({ complaints: items.map((e) => ({ ...e, raisedByName: e.raisedById ? names[e.raisedById] : 'System', studentName: e.studentId ? names[e.studentId] : null })) });
}));

// ============================================================
// ESCALATIONS / ESCALATION MATRIX  (full workflow engine)
// ============================================================
router.get('/escalation-matrix', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  res.json({
    chain: ESCALATION_CHAIN,
    matrix: ESCALATION_CHAIN.map((role, i) => ({
      level: i + 1, role,
      escalatesTo: nextRole(role),
    })),
  });
}));

router.get('/escalations', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const where = {};
  if (req.lmsUser.role === 'FocalPerson') where.currentRole = 'FocalPerson';
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.category) where.category = String(req.query.category);
  if (req.query.severity) where.severity = String(req.query.severity);
  const items = await prisma.escalation.findMany({ where, orderBy: { createdAt: 'desc' } });
  const names = await nameMap([...items.map((i) => i.raisedById), ...items.map((i) => i.studentId), ...items.map((i) => i.assignedToId)]);
  res.json({ escalations: items.map((e) => ({ ...e, raisedByName: e.raisedById ? names[e.raisedById] : 'System', studentName: e.studentId ? names[e.studentId] : null, assignedToName: e.assignedToId ? names[e.assignedToId] : null })) });
}));

router.get('/escalations/:id', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const e = await prisma.escalation.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: 'asc' } } } });
  if (!e) throw httpError(404, 'Escalation not found');
  const names = await nameMap([e.raisedById, e.studentId, e.assignedToId, ...e.events.map((ev) => ev.actorId)]);
  res.json({ escalation: { ...e, raisedByName: e.raisedById ? names[e.raisedById] : 'System', studentName: e.studentId ? names[e.studentId] : null, assignedToName: e.assignedToId ? names[e.assignedToId] : null, events: e.events.map((ev) => ({ ...ev, actorName: ev.actorId ? names[ev.actorId] : 'System' })) } });
}));

router.post('/escalations', FOCAL, validate([
  body('category').trim().notEmpty(),
  body('subject').trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { category, subject, description, severity, studentId, offeringId, currentRole, assignedToId, dueDate } = req.body;
  const e = await prisma.escalation.create({
    data: {
      category, subject, description: description || null, severity: severity || 'MEDIUM',
      raisedById: req.lmsUser.id, raisedRole: req.lmsUser.role,
      currentRole: currentRole || 'FocalPerson', studentId: studentId || null,
      assignedToId: assignedToId || null,
      offeringId: offeringId ? parseInt(offeringId, 10) : null, dueDate: dueDate || null,
    },
  });
  await prisma.escalationEvent.create({ data: { escalationId: e.id, action: 'CREATED', actorId: req.lmsUser.id, actorRole: req.lmsUser.role, toRole: e.currentRole, note: 'Escalation opened.' } });
  await audit(req, 'ESCALATION_CREATE', 'Escalation', e.id, { after: e });
  if (assignedToId) await notify(assignedToId, { title: 'Escalation assigned', message: `You were assigned to: ${subject}`, type: 'INFO' });
  res.status(201).json({ escalation: e });
}));

router.put('/escalations/:id/action', FOCAL, validate([
  body('action').isIn(['ESCALATE', 'RESOLVE', 'COMMENT', 'IN_PROGRESS', 'CLOSE', 'REASSIGN']).withMessage('Invalid action'),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action, note, resolution, assignedToId } = req.body;
  const e = await prisma.escalation.findUnique({ where: { id } });
  if (!e) throw httpError(404, 'Escalation not found');
  let data = {};
  let toRole = e.currentRole;
  if (action === 'ESCALATE') {
    toRole = nextRole(e.currentRole) || 'Provost';
    data = { status: 'ESCALATED', currentRole: toRole };
  } else if (action === 'RESOLVE') {
    data = { status: 'RESOLVED', resolution: resolution || note || null, resolvedById: req.lmsUser.id, resolvedAt: new Date() };
  } else if (action === 'CLOSE') {
    data = { status: 'CLOSED', resolvedById: req.lmsUser.id, resolvedAt: new Date() };
  } else if (action === 'IN_PROGRESS') {
    data = { status: 'IN_PROGRESS' };
  } else if (action === 'REASSIGN') {
    data = { assignedToId: assignedToId || null };
  }
  const updated = await prisma.escalation.update({ where: { id }, data });
  await prisma.escalationEvent.create({ data: { escalationId: id, action, actorId: req.lmsUser.id, actorRole: req.lmsUser.role, fromRole: e.currentRole, toRole, note: note || resolution || null } });
  await audit(req, `ESCALATION_${action}`, 'Escalation', id, { before: { status: e.status, currentRole: e.currentRole }, after: { status: updated.status, currentRole: updated.currentRole } });
  if (action === 'ESCALATE') await notifyMany((await prisma.lmsUser.findMany({ where: { role: toRole, isActive: true }, select: { id: true } })).map((u) => u.id), { title: 'Escalation received', message: `An escalation was escalated to you: ${e.subject}`, type: 'INFO' });
  res.json({ escalation: updated });
}));

// ============================================================
// FACULTY COORDINATION — Performance · Issues · Workload Tracking
// ============================================================
router.get('/faculty/performance', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const results = await prisma.courseResult.findMany({
    where: { status: 'PUBLISHED', offering: { termId }, ...byOfferingWhere(req.scope) },
    include: { offering: { include: { teacher: { select: { id: true, username: true } }, course: { select: { code: true } } } } },
  });
  const map = {};
  for (const r of results) {
    const t = r.offering.teacher;
    if (!t) continue;
    if (!map[t.id]) map[t.id] = { teacherId: t.id, teacher: t.username, sum: 0, n: 0, pass: 0 };
    map[t.id].sum += r.totalPercent; map[t.id].n += 1; if (r.totalPercent >= 50) map[t.id].pass += 1;
  }
  // Teacher evaluation survey scores (avg rating) if present. Surveys are
  // tied to an offering (loose offeringId, no FK) → resolve teacher via a
  // separate offering lookup.
  const evalSurveys = await prisma.survey.findMany({
    where: { type: 'TEACHER_EVAL', offeringId: { not: null } },
    include: { questions: true, responses: true },
  });
  const evalOfferingIds = [...new Set(evalSurveys.map((s) => s.offeringId).filter(Boolean))];
  const evalOfferings = evalOfferingIds.length
    ? await prisma.courseOffering.findMany({ where: { id: { in: evalOfferingIds } }, select: { id: true, teacherId: true } })
    : [];
  const offeringTeacher = Object.fromEntries(evalOfferings.map((o) => [o.id, o.teacherId]));
  const evalScore = {};
  for (const s of evalSurveys) {
    const ratingQ = s.questions.filter((q) => q.type === 'RATING').map((q) => String(q.id));
    const tid = offeringTeacher[s.offeringId] || null;
    if (!tid) continue;
    for (const resp of s.responses) {
      const ans = safeJson(resp.answersJson, {});
      const vals = ratingQ.map((qid) => Number(ans[qid])).filter((v) => Number.isFinite(v));
      if (!vals.length) continue;
      if (!evalScore[tid]) evalScore[tid] = { sum: 0, n: 0 };
      evalScore[tid].sum += vals.reduce((a, b) => a + b, 0) / vals.length;
      evalScore[tid].n += 1;
    }
  }
  res.json({
    faculty: Object.values(map).map((f) => ({
      teacherId: f.teacherId, teacher: f.teacher,
      avgPercent: f.n ? Math.round((f.sum / f.n) * 10) / 10 : 0,
      passRate: f.n ? Math.round((f.pass / f.n) * 100) : 0,
      results: f.n,
      evalRating: evalScore[f.teacherId] && evalScore[f.teacherId].n ? Math.round((evalScore[f.teacherId].sum / evalScore[f.teacherId].n) * 10) / 10 : null,
    })),
  });
}));

// Faculty Issues — escalations of category FACULTY_ISSUE.
router.get('/faculty/issues', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const where = { category: 'FACULTY_ISSUE' };
  if (req.lmsUser.role === 'FocalPerson') where.currentRole = 'FocalPerson';
  if (req.query.status) where.status = String(req.query.status);
  const items = await prisma.escalation.findMany({ where, orderBy: { createdAt: 'desc' } });
  const names = await nameMap([...items.map((i) => i.raisedById), ...items.map((i) => i.assignedToId)]);
  res.json({ issues: items.map((e) => ({ ...e, raisedByName: e.raisedById ? names[e.raisedById] : 'System', assignedToName: e.assignedToId ? names[e.assignedToId] : null })) });
}));

router.get('/faculty/workload', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const offs = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offeringWhere(req.scope) },
    include: {
      course: { select: { code: true, title: true, creditHours: true } },
      teacher: { select: { id: true, username: true } },
      _count: { select: { registrations: true } },
    },
  });
  const map = {};
  for (const o of offs) {
    const key = o.teacherId || 'UNASSIGNED';
    if (!map[key]) map[key] = { teacherId: o.teacherId, teacher: o.teacher ? o.teacher.username : 'Unassigned', courses: [], totalCredits: 0, totalStudents: 0 };
    map[key].courses.push({ code: o.course.code, title: o.course.title, students: o._count.registrations });
    map[key].totalCredits += o.course.creditHours;
    map[key].totalStudents += o._count.registrations;
  }
  const workload = Object.values(map);
  const loads = workload.filter((w) => w.teacherId).map((w) => w.courses.length);
  const avg = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 0;
  res.json({
    workload: workload.map((w) => ({ ...w, courseCount: w.courses.length, balance: w.teacherId ? (w.courses.length > avg + 1 ? 'OVERLOADED' : w.courses.length < avg - 1 ? 'UNDERLOADED' : 'BALANCED') : 'NONE' })),
    avgLoad: Math.round(avg * 10) / 10,
  });
}));

// ============================================================
// ENROLLMENT / PROMOTION / RETAKE / WITHDRAW / DROP (academic admin)
// ============================================================

// Enrollments overview (registrations grouped by offering, with pending=NEW this term).
router.get('/enrollments', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const regs = await prisma.courseRegistration.findMany({
    where: { offering: { termId }, ...byOfferingWhere(req.scope) },
    include: {
      offering: { include: { course: { select: { code: true, title: true } } } },
      student: { select: { id: true, username: true, isActive: true, profile: { select: { fullName: true, session: true } } } },
      section: { select: { name: true } },
    },
    orderBy: { registeredAt: 'desc' },
  });
  res.json({
    enrollments: regs.map((r) => ({
      id: r.id, studentId: r.studentId, student: displayName(r.student), roll: r.student.username,
      course: `${r.offering.course.code} — ${r.offering.course.title}`, offeringId: r.offeringId,
      section: r.section ? r.section.name : null, type: r.registrationType, status: r.status,
      session: r.student.profile ? r.student.profile.session : null, registeredAt: r.registeredAt,
    })),
  });
}));

// Approve/confirm or reject an enrollment registration.
router.put('/enrollments/:id/action', FOCAL, validate([
  body('action').isIn(['CONFIRM', 'WITHDRAW', 'DROP', 'COMPLETE']).withMessage('Invalid action'),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action, reason } = req.body;
  const reg = await prisma.courseRegistration.findUnique({ where: { id }, include: { offering: { include: { course: true } } } });
  if (!reg) throw httpError(404, 'Registration not found');
  const statusMap = { CONFIRM: 'ENROLLED', WITHDRAW: 'WITHDRAWN', DROP: 'DROPPED', COMPLETE: 'COMPLETED' };
  const data = { status: statusMap[action] };
  if (action === 'WITHDRAW' || action === 'DROP') data.withdrawnAt = new Date();
  const updated = await prisma.courseRegistration.update({ where: { id }, data });
  await audit(req, `ENROLLMENT_${action}`, 'CourseRegistration', id, { before: { status: reg.status }, after: { status: updated.status, reason } });
  await notify(reg.studentId, { title: `Enrollment ${updated.status.toLowerCase()}`, message: `Your registration for ${reg.offering.course.code} is now ${updated.status.toLowerCase()}.`, type: 'INFO', link: '/student/courses' });
  res.json({ registration: updated });
}));

// Promotions — students eligible to advance (computed from published GPA).
router.get('/promotions', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const results = await prisma.courseResult.findMany({
    where: { status: 'PUBLISHED', ...byOfferingWhere(req.scope) },
    include: {
      student: { select: { id: true, username: true, profile: { select: { fullName: true, session: true, program: true } } } },
      offering: { include: { course: { select: { creditHours: true } } } },
    },
  });
  const byStudent = {};
  for (const r of results) {
    const sid = r.studentId;
    if (!byStudent[sid]) byStudent[sid] = { studentId: sid, roll: r.student.username, name: displayName(r.student), session: r.student.profile ? r.student.profile.session : null, program: r.student.profile ? r.student.profile.program : null, results: [] };
    byStudent[sid].results.push({ gradePoints: r.gradePoints, creditHours: r.offering.course.creditHours, percent: r.totalPercent });
  }
  const students = Object.values(byStudent).map((s) => {
    const { gpa, failing } = studentRisk(s.results);
    return { studentId: s.studentId, roll: s.roll, name: s.name, session: s.session, program: s.program, gpa, courses: s.results.length, failing, eligible: gpa >= 2.0 && failing === 0, status: gpa >= 2.0 && failing === 0 ? 'Eligible' : 'Pending' };
  }).sort((a, b) => b.gpa - a.gpa);
  res.json({ promotions: students });
}));

// Retakes — registrations of type RETAKE + failing students.
router.get('/retakes', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const retakeRegs = await prisma.courseRegistration.findMany({
    where: { registrationType: 'RETAKE', ...byOfferingWhere(req.scope) },
    include: {
      offering: { include: { course: { select: { code: true, title: true } } } },
      student: { select: { id: true, username: true, profile: { select: { fullName: true } } } },
    },
    orderBy: { registeredAt: 'desc' },
  });
  // Failing results = retake candidates.
  const failing = await prisma.courseResult.findMany({
    where: { status: 'PUBLISHED', totalPercent: { lt: 50 }, ...byOfferingWhere(req.scope) },
    include: {
      offering: { include: { course: { select: { code: true, title: true } } } },
      student: { select: { id: true, username: true, profile: { select: { fullName: true } } } },
    },
  });
  res.json({
    retakes: retakeRegs.map((r) => ({ id: r.id, studentId: r.studentId, student: displayName(r.student), roll: r.student.username, course: `${r.offering.course.code} — ${r.offering.course.title}`, status: r.status, registeredAt: r.registeredAt })),
    candidates: failing.map((r) => ({ studentId: r.studentId, student: displayName(r.student), roll: r.student.username, course: `${r.offering.course.code} — ${r.offering.course.title}`, percent: r.totalPercent, grade: r.letterGrade })),
  });
}));

// ------------------------------------------------------------
// WITHDRAWAL DEADLINE (client requirement 4.1)
// ------------------------------------------------------------
// The Focal Person sets a single date as the course-withdrawal deadline.
// Students may withdraw only up to and including this date; afterwards the
// withdraw option is blocked for everyone. The date is stored in
// SystemConfiguration under a fixed key and read in real time by students.
const WITHDRAW_DEADLINE_KEY = 'lms_withdraw_deadline';

async function getWithdrawDeadline() {
  const row = await prisma.systemConfiguration.findUnique({ where: { key: WITHDRAW_DEADLINE_KEY } }).catch(() => null);
  const value = row && row.value ? row.value : null;
  return { deadline: value || null, updatedAt: row ? row.updatedAt : null };
}

// GET current withdrawal deadline (Focal view).
router.get('/withdraw-deadline', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const { deadline, updatedAt } = await getWithdrawDeadline();
  const now = new Date();
  const isPast = deadline ? now > new Date(deadline) : false;
  res.json({ deadline, updatedAt, isPast, serverNow: now.toISOString() });
}));

// SET / UPDATE the withdrawal deadline (Focal only). Pass { deadline: ISO }
// or { deadline: null } to clear it. Change takes effect immediately.
router.put('/withdraw-deadline', FOCAL, asyncHandler(async (req, res) => {
  let value = req.body.deadline;
  if (value === '' || value === undefined) value = null;
  if (value !== null) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw httpError(400, 'Invalid date.');
    value = d.toISOString();
  }
  const row = await prisma.systemConfiguration.upsert({
    where: { key: WITHDRAW_DEADLINE_KEY },
    update: { value, description: 'LMS course-withdrawal deadline (set by Focal Person)' },
    create: { key: WITHDRAW_DEADLINE_KEY, value, description: 'LMS course-withdrawal deadline (set by Focal Person)' },
  });
  await audit(req, 'WITHDRAW_DEADLINE_SET', 'SystemConfiguration', row.id, { after: { deadline: value } });
  const now = new Date();
  res.json({ success: true, deadline: value, updatedAt: row.updatedAt, isPast: value ? now > new Date(value) : false, serverNow: now.toISOString() });
}));

// Withdraws — withdrawn registrations.
router.get('/withdraws', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const regs = await prisma.courseRegistration.findMany({
    where: { status: 'WITHDRAWN', ...byOfferingWhere(req.scope) },
    include: {
      offering: { include: { course: { select: { code: true, title: true } } } },
      student: { select: { id: true, username: true, profile: { select: { fullName: true } } } },
    },
    orderBy: { withdrawnAt: 'desc' },
  });
  res.json({ withdraws: regs.map((r) => ({ id: r.id, studentId: r.studentId, student: displayName(r.student), roll: r.student.username, course: `${r.offering.course.code} — ${r.offering.course.title}`, withdrawnAt: r.withdrawnAt })) });
}));

// ------------------------------------------------------------
// RESTORE a single withdrawn registration back to ENROLLED.
// Requirement #1: Focal Person can restore a withdrawn student so
// they regain access to the course in real time. Reactivates the
// student account if it was inactive, logs the action and notifies
// the student. Department-scoped & fully DB-backed (no dummy data).
// ------------------------------------------------------------
router.put('/withdraws/:id/restore', FOCAL, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const reg = await prisma.courseRegistration.findUnique({
    where: { id },
    include: {
      offering: { include: { course: { select: { code: true, title: true } } } },
      student: { select: { id: true, username: true, isActive: true, profile: { select: { fullName: true } } } },
    },
  });
  if (!reg) throw httpError(404, 'Registration not found');
  if (reg.status !== 'WITHDRAWN') throw httpError(400, 'Only withdrawn registrations can be restored.');
  // Department guard.
  if (!req.scope.unscoped && !req.scope.studentIds.includes(reg.studentId)) {
    throw httpError(403, 'This student is not in your department.');
  }

  const updated = await prisma.courseRegistration.update({
    where: { id },
    data: { status: 'ENROLLED', withdrawnAt: null },
  });
  // Restoring a course also re-activates the student account so they
  // regain full LMS access according to their enrollment.
  if (!reg.student.isActive) {
    await prisma.lmsUser.update({ where: { id: reg.studentId }, data: { isActive: true } });
  }

  await audit(req, 'STUDENT_RESTORE', 'CourseRegistration', id, {
    after: { studentId: reg.studentId, course: reg.offering.course.code, status: 'ENROLLED' },
  });
  await notify(reg.studentId, {
    title: 'Course access restored',
    message: `Your withdrawn course "${reg.offering.course.code} — ${reg.offering.course.title}" has been restored to active by the Focal Person. You now have full access again.`,
    type: 'SUCCESS',
    link: '/student/courses',
  });

  res.json({
    success: true,
    registration: {
      id: updated.id, studentId: reg.studentId, student: displayName(reg.student),
      roll: reg.student.username, course: `${reg.offering.course.code} — ${reg.offering.course.title}`,
      status: updated.status,
    },
  });
}));

// ------------------------------------------------------------
// RESTORE ALL withdrawn registrations for a single student in one
// action (and reactivate the account). Convenience for "Restore
// Student" at the student level. Requirement #1.
// ------------------------------------------------------------
router.put('/students/:id/restore', FOCAL, asyncHandler(async (req, res) => {
  const studentId = req.params.id;
  if (!req.scope.unscoped && !req.scope.studentIds.includes(studentId)) {
    throw httpError(403, 'This student is not in your department.');
  }
  const student = await prisma.lmsUser.findFirst({
    where: { id: studentId, role: 'Student' },
    select: { id: true, username: true, isActive: true, profile: { select: { fullName: true } } },
  });
  if (!student) throw httpError(404, 'Student not found');

  const withdrawn = await prisma.courseRegistration.findMany({ where: { studentId, status: 'WITHDRAWN' } });
  const result = await prisma.courseRegistration.updateMany({
    where: { studentId, status: 'WITHDRAWN' },
    data: { status: 'ENROLLED', withdrawnAt: null },
  });
  if (!student.isActive) {
    await prisma.lmsUser.update({ where: { id: studentId }, data: { isActive: true } });
  }

  await audit(req, 'STUDENT_RESTORE_ALL', 'LmsUser', 0, {
    after: { studentId, roll: student.username, restoredCourses: result.count },
  });
  await notify(studentId, {
    title: 'Account restored to active',
    message: `Your account and ${result.count} withdrawn course(s) have been restored to active by the Focal Person. You now have full LMS access according to your enrollment.`,
    type: 'SUCCESS',
    link: '/student/dashboard',
  });

  res.json({
    success: true,
    studentId, roll: student.username, student: displayName(student),
    restoredCount: result.count, isActive: true,
    restoredCourses: withdrawn.length,
  });
}));

// Student Drop — deactivate a student account (and notify).
router.get('/dropped-students', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const dropped = await prisma.courseRegistration.findMany({
    where: { status: 'DROPPED', ...byOfferingWhere(req.scope) },
    include: {
      offering: { include: { course: { select: { code: true } } } },
      student: { select: { id: true, username: true, isActive: true, profile: { select: { fullName: true } } } },
    },
    orderBy: { withdrawnAt: 'desc' },
  });
  res.json({ dropped: dropped.map((r) => ({ id: r.id, studentId: r.studentId, student: displayName(r.student), roll: r.student.username, course: r.offering.course.code, active: r.student.isActive, droppedAt: r.withdrawnAt })) });
}));

// ============================================================
// STUDENT SEARCH / DIRECTORY + DEACTIVATIONS
// ============================================================
router.get('/students', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'username' });
  const where = { role: 'Student', ...(req.scope.unscoped ? {} : studentWhere(req.scope)) };
  if (req.query.search) {
    const s = String(req.query.search);
    where.OR = [
      { username: { contains: s } },
      { email: { contains: s } },
      { profile: { fullName: { contains: s } } },
      { profile: { fatherName: { contains: s } } },
      { profile: { cnic: { contains: s } } },
      { profile: { phone: { contains: s } } },
      { profile: { rollNumber: { contains: s } } },
      { profile: { registrationNumber: { contains: s } } },
    ];
  }
  if (req.query.program) where.profile = { ...(where.profile || {}), programShortForm: String(req.query.program) };
  if (req.query.session) where.profile = { ...(where.profile || {}), session: String(req.query.session) };
  if (req.query.active === 'true') where.isActive = true;
  if (req.query.active === 'false') where.isActive = false;
  const [items, total] = await Promise.all([
    prisma.lmsUser.findMany({ where, orderBy: { username: q.sortDir }, skip: q.skip, take: q.take, select: { id: true, username: true, isActive: true, lastLoginAt: true, profile: true, _count: { select: { registrations: true } } } }),
    prisma.lmsUser.count({ where }),
  ]);
  res.json(paginated(items.map((s) => ({
    id: s.id, roll: s.username, name: displayName(s), isActive: s.isActive, lastLoginAt: s.lastLoginAt,
    program: s.profile ? s.profile.program : null, session: s.profile ? s.profile.session : null,
    cnic: s.profile ? s.profile.cnic : null, email: s.profile ? s.profile.email : null, phone: s.profile ? s.profile.phone : null,
    registrations: s._count.registrations,
  })), total, q));
}));

// ============================================================
// §4.2 — STUDENT SEARCH FOR "NEW CASE" (Discipline & Fines).
// Returns every department student with the full set of filterable
// attributes (Program, Semester, Session, Batch, Name, Roll Number,
// Email, CNIC, Phone Number) plus the distinct option lists, so the
// New Case page can filter and find the student in real time.
// NOTE: declared BEFORE '/students/:id' so it is not swallowed by it.
// ============================================================
router.get('/student-search', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const where = { role: 'Student', ...(req.scope.unscoped ? {} : studentWhere(req.scope)) };
  const students = await prisma.lmsUser.findMany({
    where,
    orderBy: { username: 'asc' },
    select: {
      id: true, username: true, email: true, isActive: true,
      profile: {
        select: {
          fullName: true, fatherName: true, cnic: true, phone: true, email: true,
          program: true, programShortForm: true, department: true,
          rollNumber: true, registrationNumber: true, session: true,
        },
      },
      // Current-term registrations tell us which semester the student is in.
      registrations: {
        where: { status: { in: ['ENROLLED', 'COMPLETED'] } },
        select: {
          section: { select: { name: true } },
          offering: {
            select: {
              term: { select: { id: true, code: true, title: true, isCurrent: true } },
              course: {
                select: {
                  semester: { select: { id: true, number: true, title: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const programs = new Set(); const semesters = new Set();
  const sessions = new Set(); const batches = new Set(); const departments = new Set();

  const items = students.map((s) => {
    const p = s.profile || {};
    // Prefer the semester of the CURRENT term's registrations; fall back to the
    // highest semester number the student is registered in.
    const semNumbers = [];
    let currentSem = null;
    let sessionLabel = '';
    for (const r of s.registrations) {
      const sem = r.offering && r.offering.course ? r.offering.course.semester : null;
      const t = r.offering ? r.offering.term : null;
      if (sem && typeof sem.number === 'number') {
        semNumbers.push(sem.number);
        if (t && t.isCurrent) {
          if (!currentSem || sem.number > currentSem.number) currentSem = sem;
        }
      }
      if (t && t.isCurrent && !sessionLabel) sessionLabel = t.title || t.code || '';
    }
    if (!currentSem && semNumbers.length) {
      const max = Math.max(...semNumbers);
      currentSem = { number: max, title: `Semester ${max}` };
    }
    const semesterLabel = currentSem ? (currentSem.title || `Semester ${currentSem.number}`) : '';
    const batch = p.session || '';
    // "Session" is the running academic term; when there is no current-term
    // registration we fall back to the admission session so the filter is never empty.
    const sessionValue = sessionLabel || batch;
    const section = s.registrations.find((r) => r.section) ? s.registrations.find((r) => r.section).section.name : '';

    if (p.program) programs.add(p.program);
    if (semesterLabel) semesters.add(semesterLabel);
    if (sessionValue) sessions.add(sessionValue);
    if (batch) batches.add(batch);
    if (p.department) departments.add(p.department);

    return {
      id: s.id,
      name: p.fullName || s.username,
      fatherName: p.fatherName || '',
      roll: p.rollNumber || s.username,
      username: s.username,
      registrationNumber: p.registrationNumber || '',
      email: p.email || s.email || '',
      cnic: p.cnic || '',
      phone: p.phone || '',
      program: p.program || '',
      programShortForm: p.programShortForm || '',
      department: p.department || '',
      semester: semesterLabel,
      semesterNumber: currentSem ? currentSem.number : null,
      session: sessionValue,
      batch,
      section,
      isActive: s.isActive,
      courses: s.registrations.length,
    };
  });

  const sortedList = (set) => Array.from(set).filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

  res.json({
    students: items,
    total: items.length,
    filterOptions: {
      programs: sortedList(programs),
      semesters: sortedList(semesters),
      sessions: sortedList(sessions),
      batches: sortedList(batches),
      departments: sortedList(departments),
    },
  });
}));

// Full student detail (profile + registrations + results + attendance +
// assignments + quizzes + mid/final marks + GPA/CGPA + academic history).
router.get('/students/:id', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const id = req.params.id;
  // Department guard: a focal person may only open a student in their dept.
  if (!req.scope.unscoped && !req.scope.studentIds.includes(id)) {
    throw httpError(403, 'This student is not in your department.');
  }
  const student = await prisma.lmsUser.findFirst({
    where: { id, role: 'Student' },
    select: {
      id: true, username: true, isActive: true, lastLoginAt: true, createdAt: true, profile: true,
      registrations: { include: { offering: { include: { course: { select: { code: true, title: true, creditHours: true } }, term: { select: { title: true } }, teacher: { select: { username: true, profile: { select: { fullName: true } } } } } }, section: { select: { name: true } } } },
      courseResults: { include: { offering: { include: { course: { select: { code: true, title: true, creditHours: true } }, term: { select: { title: true } }, teacher: { select: { username: true, profile: { select: { fullName: true } } } } } } } },
      attendanceRecords: { select: { status: true } },
      assignmentSubmissions: { select: { status: true, marks: true, assignment: { select: { title: true, totalMarks: true, offering: { select: { teacher: { select: { username: true, profile: { select: { fullName: true } } } } } } } } } },
      quizAttempts: { select: { status: true, score: true, maxScore: true, quiz: { select: { title: true, offering: { select: { teacher: { select: { username: true, profile: { select: { fullName: true } } } } } } } } } },
    },
  });
  if (!student) throw httpError(404, 'Student not found');

  const published = student.courseResults.filter((r) => r.status === 'PUBLISHED');
  // Real teacher name (profile.fullName) with a humanized-username fallback.
  const teacherName = (off) => (off && off.teacher ? displayName(off.teacher) : 'Unassigned');

  const results = published.map((r) => ({
    code: r.offering.course.code, title: r.offering.course.title, creditHours: r.offering.course.creditHours,
    term: r.offering.term ? r.offering.term.title : null,
    teacher: teacherName(r.offering),
    assignmentMarks: r.assignmentMarks, quizMarks: r.quizMarks, midMarks: r.midMarks, finalMarks: r.finalMarks,
    percent: r.totalPercent, grade: r.letterGrade, gradePoints: r.gradePoints,
  }));
  const { gpa, failing, risk } = studentRisk(results.map((r) => ({ gradePoints: r.gradePoints, creditHours: r.creditHours, percent: r.percent })));

  // CGPA across ALL published results (every term).
  const cgpa = computeGPA(published.map((r) => ({ gradePoints: r.gradePoints, creditHours: r.offering.course.creditHours })));

  // Attendance aggregate.
  const att = student.attendanceRecords;
  const attPresent = att.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length;
  const attendancePct = att.length ? Math.round((attPresent / att.length) * 1000) / 10 : 0;

  // Academic history grouped by term.
  const byTerm = {};
  for (const r of published) {
    const t = r.offering.term ? r.offering.term.title : 'Unknown';
    if (!byTerm[t]) byTerm[t] = { term: t, courses: 0, credits: 0, points: 0 };
    byTerm[t].courses += 1;
    byTerm[t].credits += r.offering.course.creditHours;
    byTerm[t].points += r.gradePoints * r.offering.course.creditHours;
  }
  const academicHistory = Object.values(byTerm).map((t) => ({
    term: t.term, courses: t.courses, credits: t.credits,
    gpa: t.credits ? Math.round((t.points / t.credits) * 100) / 100 : 0,
  }));

  // --- Fine Record (Requirement #3) — real disciplinary fines joined
  // to their Account-Book challan for live PAID/UNPAID status. ---------
  const fineCases = await prisma.escalation.findMany({
    where: { studentId: id, category: 'DISCIPLINE' },
    orderBy: { createdAt: 'desc' },
  });
  const fineCaseIds = fineCases.map((c) => c.id);
  const fineChallans = fineCaseIds.length
    ? await prisma.lmsFeeChallan.findMany({ where: { sourceAnnouncementId: { in: fineCaseIds } } })
    : [];
  const challanByCase = {};
  for (const ch of fineChallans) challanByCase[ch.sourceAnnouncementId] = ch;
  const fineRecord = fineCases
    .map((c) => {
      const f = parseFineTag(c.description);
      if (!f || f.fineAmount <= 0) return null;
      const ch = challanByCase[c.id] || null;
      return {
        id: c.id, title: c.subject, description: f.fineDescription, amount: f.fineAmount,
        remarks: f.remarks, issueDate: c.createdAt,
        status: ch ? ch.status : 'UNPAID', dueDate: ch ? ch.dueDate : null,
        paidAt: ch ? ch.paidAt : null,
      };
    })
    .filter(Boolean);

  res.json({
    student: {
      id: student.id, roll: student.username, name: displayName(student), isActive: student.isActive,
      profile: student.profile, lastLoginAt: student.lastLoginAt, createdAt: student.createdAt,
      enrollmentHistory: student.registrations.map((r) => ({
        id: r.id, course: `${r.offering.course.code} — ${r.offering.course.title}`,
        section: r.section ? r.section.name : null, term: r.offering.term ? r.offering.term.title : null,
        status: r.status, type: r.registrationType, registeredAt: r.registeredAt,
      })),
      registrations: student.registrations.map((r) => ({ id: r.id, course: `${r.offering.course.code} — ${r.offering.course.title}`, status: r.status, type: r.registrationType, teacher: teacherName(r.offering) })),
      results,
      // Mid-term & final-term breakdowns surfaced explicitly (Requirement #3).
      midTerm: published.map((r) => ({ code: r.offering.course.code, title: r.offering.course.title, term: r.offering.term ? r.offering.term.title : null, teacher: teacherName(r.offering), marks: r.midMarks })),
      finalTerm: published.map((r) => ({ code: r.offering.course.code, title: r.offering.course.title, term: r.offering.term ? r.offering.term.title : null, teacher: teacherName(r.offering), marks: r.finalMarks })),
      assignments: student.assignmentSubmissions.map((s) => ({ title: s.assignment ? s.assignment.title : 'Assignment', status: s.status, marks: s.marks, total: s.assignment ? s.assignment.totalMarks : null, teacher: s.assignment && s.assignment.offering ? teacherName(s.assignment.offering) : 'Unassigned' })),
      quizzes: student.quizAttempts.map((a) => ({ title: a.quiz ? a.quiz.title : 'Quiz', status: a.status, score: a.score, total: a.maxScore, teacher: a.quiz && a.quiz.offering ? teacherName(a.quiz.offering) : 'Unassigned' })),
      attendance: { present: attPresent, total: att.length, pct: attendancePct },
      academicHistory,
      fineRecord,
      gpa, cgpa, failing, risk,
    },
  });
}));

router.get('/deactivations', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  // Deactivation requests modelled as escalations of category DISCIPLINE with subject prefix, plus list inactive students.
  const inactive = await prisma.lmsUser.findMany({
    where: { role: 'Student', isActive: false, ...(req.scope.unscoped ? {} : studentWhere(req.scope)) },
    select: { id: true, username: true, profile: { select: { fullName: true, program: true } }, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ deactivated: inactive.map((s) => ({ id: s.id, roll: s.username, name: displayName(s), program: s.profile ? s.profile.program : null, deactivatedAt: s.updatedAt })) });
}));

// Toggle a student's active status (deactivate / reactivate / drop).
// A drop (isActive=false) REQUIRES a reason + optional remarks; the student
// receives a notification carrying the drop reason (per requirements).
router.put('/students/:id/active', FOCAL, validate([
  body('isActive').isBoolean().withMessage('isActive boolean required'),
]), asyncHandler(async (req, res) => {
  const id = req.params.id;
  const { isActive, reason, remarks } = req.body;
  // Department guard.
  if (!req.scope.unscoped && !req.scope.studentIds.includes(id)) {
    throw httpError(403, 'This student is not in your department.');
  }
  if (!isActive && (!reason || !String(reason).trim())) {
    throw httpError(400, 'A drop reason is required.');
  }
  const student = await prisma.lmsUser.findFirst({ where: { id, role: 'Student' } });
  if (!student) throw httpError(404, 'Student not found');
  const updated = await prisma.lmsUser.update({ where: { id }, data: { isActive: !!isActive }, select: { id: true, username: true, isActive: true } });
  const fullReason = [reason, remarks].filter((x) => x && String(x).trim()).join(' — ');
  await audit(req, isActive ? 'STUDENT_REACTIVATE' : 'STUDENT_DROP', 'LmsUser', id, { before: { isActive: student.isActive }, after: { isActive, reason, remarks } });
  await notify(id, {
    title: isActive ? 'Account reactivated' : 'You have been dropped',
    message: isActive
      ? 'Your account has been reactivated by the Focal Person.'
      : `You have been dropped by the Focal Person. Reason: ${fullReason || 'Not specified'}.`,
    type: isActive ? 'INFO' : 'WARNING',
    link: '/student/dashboard',
  });
  res.json({ student: updated, reason: fullReason || null });
}));

// ============================================================
// DISCIPLINE — disciplinary cases (escalations category DISCIPLINE).
// ============================================================
router.get('/discipline', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const where = { category: 'DISCIPLINE' };
  if (req.lmsUser.role === 'FocalPerson') where.currentRole = 'FocalPerson';
  // Department scope: only cases whose subject student is in this focal's
  // department (or cases the focal raised). Unscoped roles see all.
  if (!req.scope.unscoped) {
    where.studentId = { in: req.scope.studentIds.length ? req.scope.studentIds : ['__none__'] };
  }
  const items = await prisma.escalation.findMany({ where, orderBy: { createdAt: 'desc' } });
  const names = await nameMap([...items.map((i) => i.studentId), ...items.map((i) => i.raisedById)]);
  res.json({
    cases: items.map((e) => ({
      ...e,
      // Clean case description (fine tag stripped) for display.
      caseDescription: stripFineTag(e.description),
      studentName: e.studentId ? names[e.studentId] : null,
      raisedByName: e.raisedById ? names[e.raisedById] : 'System',
      // Surface structured fine details parsed from the description tag.
      fine: parseFineTag(e.description),
    })),
  });
}));

// Create a Discipline & Fine case against a department student.
// Per requirement #9: select student by name, enter case description,
// fine description, fine amount, remarks → student gets a real-time
// notification with the fine details (which the frontend pops up).
router.post('/discipline', FOCAL, validate([
  body('studentId').trim().notEmpty().withMessage('Select a student'),
  body('subject').trim().notEmpty().withMessage('Case title is required'),
]), asyncHandler(async (req, res) => {
  const { studentId, subject, description, fineDescription, fineAmount, remarks, severity } = req.body;
  // Department guard — focal may only fine their own department's students.
  if (!req.scope.unscoped && !req.scope.studentIds.includes(studentId)) {
    throw httpError(403, 'This student is not in your department.');
  }
  const student = await prisma.lmsUser.findFirst({ where: { id: studentId, role: 'Student' }, select: { id: true, username: true } });
  if (!student) throw httpError(404, 'Student not found');

  const fineAmt = fineAmount != null && String(fineAmount).trim() !== '' ? Number(fineAmount) : 0;
  if (fineAmount != null && String(fineAmount).trim() !== '' && (!Number.isFinite(fineAmt) || fineAmt < 0)) {
    throw httpError(400, 'Fine amount must be a valid non-negative number.');
  }
  // Embed structured fine details into the description with a parseable tag
  // so we never need a new DB column (additive, table-safe).
  const fineTag = JSON.stringify({ fineDescription: fineDescription || null, fineAmount: fineAmt, remarks: remarks || null });
  const fullDescription = `${description || ''}\n${FINE_TAG_PREFIX}${fineTag}`.trim();

  const e = await prisma.escalation.create({
    data: {
      category: 'DISCIPLINE',
      subject,
      description: fullDescription,
      severity: severity || (fineAmt > 0 ? 'HIGH' : 'MEDIUM'),
      raisedById: req.lmsUser.id,
      raisedRole: req.lmsUser.role,
      currentRole: 'FocalPerson',
      studentId,
      status: 'OPEN',
    },
  });
  await prisma.escalationEvent.create({
    data: { escalationId: e.id, action: 'CREATED', actorId: req.lmsUser.id, actorRole: req.lmsUser.role, toRole: 'FocalPerson', note: `Disciplinary case opened${fineAmt > 0 ? ` with a fine of ${fineAmt}` : ''}.` },
  });

  // --- Requirement #2: Fine Management Integration ---------------
  // When a fine amount is imposed, auto-generate a real LmsFeeChallan
  // in the student's Account Book so they can view & pay it directly.
  // The challan is linked back to the discipline case via sourceAnnouncementId
  // (re-used as the escalation id) so the Focal Person can see live
  // payment status. No dummy data — every figure comes from this case.
  let challan = null;
  if (fineAmt > 0) {
    // Snapshot the student's scope so the fine remains filterable/accurate.
    const prof = await prisma.lmsStudentProfile.findUnique({
      where: { lmsUserId: studentId },
      select: { programShortForm: true, department: true },
    });
    const term = await currentTerm();
    // Due date: 14 days from now (YYYY-MM-DD).
    const due = new Date(); due.setDate(due.getDate() + 14);
    const dueStr = due.toISOString().slice(0, 10);
    const challanNo = `FINE-${e.id}-${Date.now().toString().slice(-6)}`;
    challan = await prisma.lmsFeeChallan.create({
      data: {
        studentId,
        termId: term ? term.id : null,
        challanNo,
        title: `Fine: ${subject}`,
        lineItems: JSON.stringify([{ label: fineDescription || subject, amount: fineAmt }]),
        totalAmount: fineAmt,
        dueDate: dueStr,
        status: 'UNPAID',
        feeType: 'OTHER',
        program: prof ? prof.programShortForm : null,
        department: prof ? prof.department : null,
        description: fineDescription || description || subject,
        // Tag the originating discipline case (Escalation.id) so payment
        // status can be cross-referenced for the Focal Person view.
        sourceAnnouncementId: e.id,
      },
    });
    await audit(req, 'FINE_CHALLAN_CREATE', 'LmsFeeChallan', challan.id, {
      after: { studentId, amount: fineAmt, challanNo, escalationId: e.id },
    });
  }

  await audit(req, 'DISCIPLINE_CASE_CREATE', 'Escalation', e.id, { after: { studentId, subject, fineAmount: fineAmt } });
  // Real-time notification to the student with the fine details.
  const fineLine = fineAmt > 0 ? ` A fine of ${fineAmt} has been imposed.` : '';
  const reasonLine = fineDescription ? ` Reason: ${fineDescription}.` : (description ? ` Details: ${description}.` : '');
  await notify(studentId, {
    title: fineAmt > 0 ? `Disciplinary fine: ${subject}` : `Disciplinary case: ${subject}`,
    message: `A disciplinary case "${subject}" has been registered against you by the Focal Person.${fineLine}${reasonLine}${remarks ? ` Remarks: ${remarks}.` : ''}`.trim(),
    type: 'WARNING',
    link: '/student/dashboard',
  });
  res.status(201).json({
    case: { ...e, studentName: student.username, fine: parseFineTag(e.description) },
    challan: challan ? {
      id: challan.id, challanNo: challan.challanNo, title: challan.title,
      totalAmount: challan.totalAmount, dueDate: challan.dueDate, status: challan.status,
    } : null,
  });
}));

// ------------------------------------------------------------
// FINES — live list of every fine the Focal Person has imposed,
// joined to its Account-Book challan so real-time PAID/UNPAID
// payment status is visible. Requirement #2 (Focal can view fine
// payment status in real time). Department-scoped, no dummy data.
// ------------------------------------------------------------
router.get('/fines', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  // Discipline cases that carry a fine, within department scope.
  const where = { category: 'DISCIPLINE' };
  if (!req.scope.unscoped) {
    where.studentId = { in: req.scope.studentIds.length ? req.scope.studentIds : ['__none__'] };
  }
  const cases = await prisma.escalation.findMany({ where, orderBy: { createdAt: 'desc' } });
  const fineCases = cases.filter((c) => {
    const f = parseFineTag(c.description);
    return f && f.fineAmount > 0;
  });
  // Pull the linked challans (status = real payment state).
  const ids = fineCases.map((c) => c.id);
  const challans = ids.length
    ? await prisma.lmsFeeChallan.findMany({ where: { sourceAnnouncementId: { in: ids } } })
    : [];
  const byCase = {};
  for (const ch of challans) byCase[ch.sourceAnnouncementId] = ch;

  const names = await nameMap(fineCases.map((c) => c.studentId));
  const rows = fineCases.map((c) => {
    const f = parseFineTag(c.description);
    const ch = byCase[c.id] || null;
    return {
      id: c.id,
      studentId: c.studentId,
      student: c.studentId ? names[c.studentId] : null,
      title: c.subject,
      fineDescription: f ? f.fineDescription : null,
      fineAmount: f ? f.fineAmount : 0,
      remarks: f ? f.remarks : null,
      issueDate: c.createdAt,
      // Real-time payment status from the Account-Book challan.
      challanId: ch ? ch.id : null,
      challanNo: ch ? ch.challanNo : null,
      status: ch ? ch.status : 'UNPAID',
      dueDate: ch ? ch.dueDate : null,
      paidAt: ch ? ch.paidAt : null,
      paymentRef: ch ? ch.paymentRef : null,
    };
  });
  const summary = rows.reduce((acc, r) => {
    acc.total += r.fineAmount;
    if (r.status === 'PAID') { acc.paid += r.fineAmount; acc.paidCount += 1; }
    else { acc.outstanding += r.fineAmount; acc.unpaidCount += 1; }
    return acc;
  }, { total: 0, paid: 0, outstanding: 0, paidCount: 0, unpaidCount: 0, count: rows.length });

  res.json({ fines: rows, summary });
}));

// ============================================================
// ASSESSMENT MONITOR — per-component (assignment/quiz/mid/final/result).
// ============================================================
router.get('/assessment-monitor', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offeringWhere(req.scope) },
    include: {
      // §4.3/§4.4 — program + semester metadata is needed so the Focal Person's
      // Lab Task Monitor / Results modules can offer smart filters.
      course: {
        select: {
          code: true, title: true, hasLab: true, creditHours: true,
          theoryCredit: true, labCredit: true,
          program: { select: { id: true, name: true, shortForm: true, department: true } },
          semester: { select: { id: true, number: true, title: true } },
        },
      },
      term: { select: { id: true, code: true, title: true } },
      teacher: { select: { username: true, profile: { select: { fullName: true } } } },
      assignments: { where: { isDeleted: false }, include: { submissions: { select: { status: true } } } },
      quizzes: { where: { isDeleted: false }, include: { attempts: { select: { status: true } } } },
      // Lab tasks (Req 2 — Focal Person sees lab tasks/marks/submissions live).
      labTasks: { where: { isDeleted: false }, include: { submissions: { select: { status: true } } } },
      results: { select: { status: true, midMarks: true, finalMarks: true, totalPercent: true } },
      _count: { select: { registrations: true } },
    },
  });

  // ---- §4.3/§4.4 — per-offering student batches (admission session of the
  // enrolled students) so "Batch" is filterable at course level too.
  const allOfferingIds = offerings.map((o) => o.id);
  const labOfferingIds = offerings.filter((o) => o.course.hasLab === true).map((o) => o.id);
  const regs = allOfferingIds.length
    ? await prisma.courseRegistration.findMany({
      where: { offeringId: { in: allOfferingIds }, status: { in: ['ENROLLED', 'COMPLETED'] } },
      select: {
        id: true, offeringId: true, studentId: true, status: true,
        section: { select: { name: true } },
        student: {
          select: {
            id: true, username: true, email: true, isActive: true,
            profile: {
              select: {
                fullName: true, cnic: true, phone: true, email: true,
                program: true, programShortForm: true, department: true,
                rollNumber: true, registrationNumber: true, session: true,
              },
            },
          },
        },
      },
    })
    : [];
  const batchesByOffering = {};
  for (const r of regs) {
    const b = (r.student && r.student.profile && r.student.profile.session) ? String(r.student.profile.session) : '';
    if (!b) continue;
    if (!batchesByOffering[r.offeringId]) batchesByOffering[r.offeringId] = new Set();
    batchesByOffering[r.offeringId].add(b);
  }

  // ---- §4.3 — every lab-task submission for the lab offerings, so lab detail
  // can be shown INDIVIDUALLY PER STUDENT after the filters are applied.
  const labSubmissions = labOfferingIds.length
    ? await prisma.labTaskSubmission.findMany({
      where: { labTask: { offeringId: { in: labOfferingIds }, isDeleted: false } },
      select: {
        id: true, studentId: true, status: true, marks: true, submittedAt: true, gradedAt: true, feedback: true,
        labTask: { select: { id: true, offeringId: true, title: true, totalMarks: true, dueDate: true } },
      },
      orderBy: { submittedAt: 'desc' },
    })
    : [];
  const subsByOfferingStudent = {};
  for (const s of labSubmissions) {
    const key = `${s.labTask.offeringId}|${s.studentId}`;
    if (!subsByOfferingStudent[key]) subsByOfferingStudent[key] = [];
    subsByOfferingStudent[key].push(s);
  }

  const assignments = []; const quizzes = []; const mid = []; const final = []; const results = []; const labTasks = [];
  const labStudents = [];
  const programSet = new Set(); const semesterSet = new Set(); const sessionSet = new Set();
  const batchSet = new Set(); const courseSet = new Set();
  const labProgramSet = new Set(); const labSemesterSet = new Set(); const labSessionSet = new Set();
  const labBatchSet = new Set(); const labCourseSet = new Set();

  for (const o of offerings) {
    const course = `${o.course.code} — ${o.course.title}`;
    const teacher = o.teacher ? (o.teacher.profile && o.teacher.profile.fullName ? o.teacher.profile.fullName : o.teacher.username) : 'Unassigned';
    // Shared filterable metadata (§4.3 / §4.4).
    const programName = o.course.program ? (o.course.program.name || '') : '';
    const programShort = o.course.program ? (o.course.program.shortForm || '') : '';
    const semesterLabel = o.course.semester
      ? (o.course.semester.title || `Semester ${o.course.semester.number}`) : '';
    const sessionLabel = o.term ? (o.term.title || o.term.code || '') : '';
    const offeringBatches = Array.from(batchesByOffering[o.id] || []).sort();
    const meta = {
      courseCode: o.course.code,
      courseTitle: o.course.title,
      programId: o.course.program ? o.course.program.id : null,
      program: programName,
      programShortForm: programShort,
      department: o.course.program ? (o.course.program.department || '') : '',
      semesterId: o.course.semester ? o.course.semester.id : null,
      semesterNumber: o.course.semester ? o.course.semester.number : null,
      semester: semesterLabel,
      sessionId: o.term ? o.term.id : null,
      session: sessionLabel,
      batches: offeringBatches,
      batch: offeringBatches.join(', '),
      credits: creditLabel(o.course),
    };
    if (programName) programSet.add(programName);
    if (semesterLabel) semesterSet.add(semesterLabel);
    if (sessionLabel) sessionSet.add(sessionLabel);
    for (const b of offeringBatches) batchSet.add(b);
    courseSet.add(course);

    const subs = o.assignments.reduce((a, x) => a + x.submissions.length, 0);
    const graded = o.assignments.reduce((a, x) => a + x.submissions.filter((s) => s.status === 'GRADED').length, 0);
    assignments.push({ offeringId: o.id, course, teacher, count: o.assignments.length, submissions: subs, graded, pending: subs - graded });
    quizzes.push({ offeringId: o.id, course, teacher, count: o.quizzes.length, attempts: o.quizzes.reduce((a, x) => a + x.attempts.length, 0) });
    // Lab task monitoring — only for lab courses.
    if (o.course.hasLab === true) {
      const labSubs = o.labTasks.reduce((a, x) => a + x.submissions.length, 0);
      const labGraded = o.labTasks.reduce((a, x) => a + x.submissions.filter((s) => s.status === 'GRADED').length, 0);
      labTasks.push({
        offeringId: o.id, course, teacher, ...meta,
        count: o.labTasks.length, submissions: labSubs, graded: labGraded, pending: labSubs - labGraded,
        students: o._count.registrations,
      });
      if (programName) labProgramSet.add(programName);
      if (semesterLabel) labSemesterSet.add(semesterLabel);
      if (sessionLabel) labSessionSet.add(sessionLabel);
      for (const b of offeringBatches) labBatchSet.add(b);
      labCourseSet.add(course);

      // ---- §4.3 — individual lab detail per student for THIS lab course.
      const taskCount = o.labTasks.length;
      for (const r of regs) {
        if (r.offeringId !== o.id) continue;
        const p = r.student.profile || {};
        const mine = subsByOfferingStudent[`${o.id}|${r.studentId}`] || [];
        const gradedSubs = mine.filter((s) => s.status === 'GRADED');
        const obtained = gradedSubs.reduce((a, s) => a + (typeof s.marks === 'number' ? s.marks : 0), 0);
        const totalMarks = gradedSubs.reduce((a, s) => a + (s.labTask.totalMarks || 0), 0);
        const studentBatch = p.session || '';
        if (studentBatch) labBatchSet.add(studentBatch);
        labStudents.push({
          key: `${o.id}-${r.studentId}`,
          offeringId: o.id,
          course, courseCode: o.course.code, courseTitle: o.course.title, teacher,
          program: p.program || programName,
          programShortForm: p.programShortForm || programShort,
          department: p.department || meta.department,
          semester: semesterLabel,
          semesterNumber: meta.semesterNumber,
          session: sessionLabel,
          batch: studentBatch,
          section: r.section ? r.section.name : '',
          studentId: r.studentId,
          name: p.fullName || r.student.username,
          roll: p.rollNumber || r.student.username,
          registrationNumber: p.registrationNumber || '',
          email: p.email || r.student.email || '',
          cnic: p.cnic || '',
          phone: p.phone || '',
          isActive: r.student.isActive,
          tasks: taskCount,
          submitted: mine.length,
          graded: gradedSubs.length,
          pending: Math.max(taskCount - mine.length, 0),
          notGraded: Math.max(mine.length - gradedSubs.length, 0),
          obtained: Math.round(obtained * 100) / 100,
          totalMarks: Math.round(totalMarks * 100) / 100,
          percent: totalMarks > 0 ? Math.round((obtained / totalMarks) * 1000) / 10 : 0,
          lastSubmittedAt: mine.length ? mine[0].submittedAt : null,
          details: o.labTasks.map((lt) => {
            const s = mine.find((x) => x.labTask.id === lt.id);
            return {
              labTaskId: lt.id,
              title: lt.title,
              dueDate: lt.dueDate,
              totalMarks: lt.totalMarks,
              status: s ? s.status : 'NOT SUBMITTED',
              marks: s && typeof s.marks === 'number' ? s.marks : null,
              submittedAt: s ? s.submittedAt : null,
              feedback: s ? (s.feedback || '') : '',
            };
          }),
        });
      }
    }
    const midEntered = o.results.filter((r) => r.midMarks > 0).length;
    const finalEntered = o.results.filter((r) => r.finalMarks > 0).length;
    mid.push({ offeringId: o.id, course, teacher, students: o._count.registrations, entered: midEntered, pct: o._count.registrations ? Math.round((midEntered / o._count.registrations) * 100) : 0 });
    final.push({ offeringId: o.id, course, teacher, students: o._count.registrations, entered: finalEntered, pct: o._count.registrations ? Math.round((finalEntered / o._count.registrations) * 100) : 0 });
    const pub = o.results.filter((r) => r.status === 'PUBLISHED');
    const passed = pub.filter((r) => r.totalPercent >= 50).length;
    // §4.4 — Results & Analytics rows carry program/semester/session/batch so the
    // module can filter on them in real time.
    results.push({
      offeringId: o.id, course, teacher, ...meta,
      students: o._count.registrations, published: pub.length,
      passRate: pub.length ? Math.round((passed / pub.length) * 100) : 0,
    });
  }

  const sortedList = (set) => Array.from(set).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
  res.json({
    assignments,
    quizzes,
    mid,
    final,
    results,
    labTasks,
    // §4.3 — individual per-student lab detail rows.
    labStudents,
    // Filter option lists so the UI never has to guess.
    filterOptions: {
      programs: sortedList(programSet),
      semesters: sortedList(semesterSet),
      sessions: sortedList(sessionSet),
      batches: sortedList(batchSet),
      courses: sortedList(courseSet),
      lab: {
        programs: sortedList(labProgramSet),
        semesters: sortedList(labSemesterSet),
        sessions: sortedList(labSessionSet),
        batches: sortedList(labBatchSet),
        courses: sortedList(labCourseSet),
      },
    },
    term: term ? { id: term.id, code: term.code, title: term.title } : null,
  });
}));

// ============================================================
// ATTENDANCE ANALYTICS — student-level + offering-level.
// ============================================================
router.get('/attendance', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offeringWhere(req.scope) },
    include: {
      course: { select: { code: true, title: true } },
      attendanceSessions: { include: { records: { select: { studentId: true, status: true } } } },
    },
  });
  // Per-offering.
  const courses = offerings.map((o) => ({ offeringId: o.id, course: `${o.course.code} — ${o.course.title}`, sessions: o.attendanceSessions.length, attendancePct: attendancePct(o.attendanceSessions) }));
  // Per-student aggregate.
  const stu = {};
  for (const o of offerings) for (const s of o.attendanceSessions) for (const r of s.records) {
    if (!stu[r.studentId]) stu[r.studentId] = { studentId: r.studentId, present: 0, total: 0 };
    stu[r.studentId].total += 1;
    if (r.status === 'PRESENT' || r.status === 'LATE') stu[r.studentId].present += 1;
  }
  const ids = Object.keys(stu);
  const names = await nameMap(ids);
  const profiles = await prisma.lmsUser.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
  const rollMap = Object.fromEntries(profiles.map((p) => [p.id, p.username]));
  const students = Object.values(stu).map((s) => {
    const pct = s.total ? Math.round((s.present / s.total) * 1000) / 10 : 0;
    return { studentId: s.studentId, name: names[s.studentId] || s.studentId, roll: rollMap[s.studentId] || '', present: s.present, total: s.total, pct, short: pct < 75 };
  }).sort((a, b) => a.pct - b.pct);
  const dist = [
    { range: '≥90%', count: students.filter((s) => s.pct >= 90).length },
    { range: '75-89%', count: students.filter((s) => s.pct >= 75 && s.pct < 90).length },
    { range: '60-74%', count: students.filter((s) => s.pct >= 60 && s.pct < 75).length },
    { range: '<60%', count: students.filter((s) => s.pct < 60).length },
  ];
  res.json({ courses, students, distribution: dist, shortStudents: students.filter((s) => s.short) });
}));

// ============================================================
// SCHEME OF STUDY — program curriculum by semester.
// ============================================================
router.get('/scheme', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const programId = req.query.programId ? parseInt(req.query.programId, 10) : undefined;
  const programs = await prisma.lmsProgram.findMany({
    where: { isDeleted: false, ...programWhere(req.scope), ...(programId ? { id: programId } : {}) },
    include: {
      semesters: {
        where: { isDeleted: false }, orderBy: { number: 'asc' },
        include: { courses: { where: { isDeleted: false }, orderBy: { code: 'asc' } } },
      },
    },
    orderBy: { name: 'asc' },
  });
  res.json({
    programs: programs.map((p) => {
      let totalCredits = 0; let totalCourses = 0;
      const semesters = p.semesters.map((s) => {
        const credits = s.courses.reduce((a, c) => a + c.creditHours, 0);
        totalCredits += credits; totalCourses += s.courses.length;
        return { number: s.number, title: s.title, courses: s.courses.map((c) => ({ code: c.code, title: c.title, creditHours: c.creditHours, hasLab: c.hasLab === true, theoryCredit: c.theoryCredit != null ? c.theoryCredit : c.creditHours, labCredit: c.labCredit != null ? c.labCredit : 0, creditLabel: creditLabel(c) })), credits };
      });
      return { id: p.id, code: p.code, name: p.name, shortForm: p.shortForm, totalSemesters: p.totalSemesters, totalCourses, totalCredits, semesters };
    }),
  });
}));

// ============================================================
// SURVEYS — department survey results visibility.
// ============================================================
router.get('/surveys', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  // Department scope: surveys tied to a department offering, plus general
  // (department-agnostic) surveys with no offeringId.
  const surveyWhere = { isDeleted: false };
  if (!req.scope.unscoped) {
    surveyWhere.OR = [
      { offeringId: { in: req.scope.offeringIds.length ? req.scope.offeringIds : [-1] } },
      { offeringId: null },
    ];
  }
  const surveys = await prisma.survey.findMany({
    where: surveyWhere,
    orderBy: { createdAt: 'desc' },
    include: { questions: true, _count: { select: { responses: true } } },
  });
  // Resolve offering → course/teacher names (no FK relation on Survey).
  const offIds = [...new Set(surveys.map((s) => s.offeringId).filter(Boolean))];
  const offs = offIds.length
    ? await prisma.courseOffering.findMany({ where: { id: { in: offIds } }, include: { course: { select: { code: true } }, teacher: { select: { username: true } } } })
    : [];
  const offMap = Object.fromEntries(offs.map((o) => [o.id, o]));
  res.json({
    surveys: surveys.map((s) => {
      const o = s.offeringId ? offMap[s.offeringId] : null;
      return {
        id: s.id, title: s.title, type: s.type, status: s.isActive ? 'Active' : 'Closed',
        offeringId: s.offeringId, course: o ? o.course.code : null,
        teacher: o && o.teacher ? o.teacher.username : null,
        questions: s.questions.length, responses: s._count.responses,
        createdAt: s.createdAt,
      };
    }),
  });
}));

router.get('/surveys/:id/results', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const survey = await prisma.survey.findUnique({ where: { id }, include: { questions: { orderBy: { order: 'asc' } }, responses: true } });
  if (!survey) throw httpError(404, 'Survey not found');
  const summary = survey.questions.map((q) => {
    if (q.type === 'RATING') {
      const vals = survey.responses.map((r) => Number(safeJson(r.answersJson, {})[String(q.id)])).filter((v) => Number.isFinite(v));
      const avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0;
      const dist = [1, 2, 3, 4, 5].map((n) => ({ rating: n, count: vals.filter((v) => Math.round(v) === n).length }));
      return { questionId: q.id, text: q.text, type: q.type, avg, count: vals.length, distribution: dist };
    }
    const texts = survey.responses.map((r) => safeJson(r.answersJson, {})[String(q.id)]).filter((t) => t && String(t).trim());
    return { questionId: q.id, text: q.text, type: q.type, responses: texts };
  });
  res.json({ survey: { id: survey.id, title: survey.title, type: survey.type, responses: survey.responses.length }, summary });
}));

// ============================================================
// APPROVALS  (Academic · Faculty · Student · Escalation)
//  Generic workflow inbox for the Focal Person.
// ============================================================
router.get('/approvals', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'createdAt' });
  const where = {};
  if (req.lmsUser.role === 'FocalPerson') where.assignedRole = 'FocalPerson';
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.type) where.type = String(req.query.type);
  const [items, total] = await Promise.all([
    prisma.approvalRequest.findMany({ where, orderBy: q.orderBy, skip: q.skip, take: q.take }),
    prisma.approvalRequest.count({ where }),
  ]);
  const names = await nameMap(items.map((i) => i.requestedById));
  res.json(paginated(items.map((i) => ({ ...i, requestedByName: names[i.requestedById] || i.requestedById, payload: safeJson(i.payloadJson, {}) })), total, q));
}));

router.get('/approvals/:id', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ar = await prisma.approvalRequest.findUnique({ where: { id }, include: { history: { orderBy: { createdAt: 'asc' } } } });
  if (!ar) throw httpError(404, 'Approval request not found');
  const ids = [ar.requestedById, ar.decidedById, ...ar.history.map((h) => h.actorId)];
  const names = await nameMap(ids);
  res.json({
    request: { ...ar, requestedByName: names[ar.requestedById] || ar.requestedById, decidedByName: ar.decidedById ? names[ar.decidedById] : null, payload: safeJson(ar.payloadJson, {}) },
    history: ar.history.map((h) => ({ ...h, actorName: h.actorId ? (names[h.actorId] || h.actorId) : 'System' })),
  });
}));

router.post('/approvals', FOCAL, validate([
  body('type').trim().notEmpty(),
  body('title').trim().notEmpty(),
  body('assignedRole').trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { type, title, description, entity, entityId, assignedRole, priority, payload, dueDate } = req.body;
  const ar = await prisma.approvalRequest.create({
    data: {
      type, title, description: description || null, entity: entity || null, entityId: entityId ? String(entityId) : null,
      assignedRole, priority: priority || 'NORMAL', payloadJson: JSON.stringify(payload || {}),
      requestedById: req.lmsUser.id, requestedRole: req.lmsUser.role, dueDate: dueDate || null,
    },
  });
  await prisma.approvalHistory.create({ data: { requestId: ar.id, action: 'SUBMITTED', actorId: req.lmsUser.id, actorRole: req.lmsUser.role, toStatus: 'PENDING', note: 'Request submitted.' } });
  await audit(req, 'APPROVAL_CREATE', 'ApprovalRequest', ar.id, { after: ar });
  // Notify the assigned-role users.
  const recip = await prisma.lmsUser.findMany({ where: { role: assignedRole, isActive: true }, select: { id: true } });
  await notifyMany(recip.map((u) => u.id), { title: 'New approval request', message: title, type: 'INFO' });
  res.status(201).json({ request: ar });
}));

router.put('/approvals/:id/decide', FOCAL, validate([
  body('action').isIn(['APPROVE', 'REJECT', 'ESCALATE', 'IN_REVIEW']).withMessage('Invalid action'),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action, note } = req.body;
  const ar = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!ar) throw httpError(404, 'Approval request not found');
  if (ar.assignedRole !== 'FocalPerson' && req.lmsUser.role === 'FocalPerson') {
    throw httpError(403, 'This request is not assigned to you.');
  }
  const fromStatus = ar.status;
  let data = {}; let histAction = action;
  if (action === 'APPROVE') data = { status: 'APPROVED', decidedById: req.lmsUser.id, decidedRole: req.lmsUser.role, decisionNote: note || null, decidedAt: new Date() };
  else if (action === 'REJECT') data = { status: 'REJECTED', decidedById: req.lmsUser.id, decidedRole: req.lmsUser.role, decisionNote: note || null, decidedAt: new Date() };
  else if (action === 'IN_REVIEW') data = { status: 'IN_REVIEW' };
  else if (action === 'ESCALATE') {
    const up = nextRole(ar.assignedRole) || 'Provost';
    data = { status: 'ESCALATED', assignedRole: up, escalatedToRole: up, decisionNote: note || null };
    histAction = 'ESCALATED';
  }
  const updated = await prisma.approvalRequest.update({ where: { id }, data });
  await prisma.approvalHistory.create({ data: { requestId: id, action: histAction, actorId: req.lmsUser.id, actorRole: req.lmsUser.role, fromStatus, toStatus: updated.status, note: note || null } });
  await audit(req, `APPROVAL_${histAction}`, 'ApprovalRequest', id, { before: { status: fromStatus }, after: { status: updated.status } });
  await notify(ar.requestedById, { title: `Request ${updated.status.toLowerCase()}`, message: `Your request "${ar.title}" was ${updated.status.toLowerCase()}.`, type: 'APPEAL' });
  if (action === 'ESCALATE') {
    const recip = await prisma.lmsUser.findMany({ where: { role: updated.assignedRole, isActive: true }, select: { id: true } });
    await notifyMany(recip.map((u) => u.id), { title: 'Escalated approval', message: `"${ar.title}" was escalated to you.`, type: 'INFO' });
  }
  res.json({ request: updated });
}));

// ============================================================
// REPORTS — Department · Faculty · Student · Academic
// ============================================================
router.get('/reports/:kind', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const kind = req.params.kind;
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  if (kind === 'department') {
    const offerings = await prisma.courseOffering.findMany({
      where: { isDeleted: false, termId, ...offeringWhere(req.scope) },
      include: { course: { include: { program: true } }, teacher: { select: { username: true } }, attendanceSessions: { include: { records: { select: { status: true } } } }, results: { select: { status: true, totalPercent: true } }, _count: { select: { registrations: true } } },
    });
    return res.json({ report: 'department', term: term ? term.title : null, rows: offerings.map((o) => {
      const pub = o.results.filter((r) => r.status === 'PUBLISHED');
      const pass = pub.filter((r) => r.totalPercent >= 50).length;
      return { code: o.course.code, title: o.course.title, program: o.course.program ? o.course.program.shortForm : null, teacher: o.teacher ? o.teacher.username : 'Unassigned', students: o._count.registrations, attendancePct: attendancePct(o.attendanceSessions), published: pub.length, passRate: pub.length ? Math.round((pass / pub.length) * 100) : 0 };
    }) });
  }

  if (kind === 'faculty') {
    const offs = await prisma.courseOffering.findMany({ where: { isDeleted: false, termId, teacherId: { not: null }, ...offeringWhere(req.scope) }, include: { course: { select: { creditHours: true } }, teacher: { select: { id: true, username: true } }, _count: { select: { registrations: true } } } });
    const map = {};
    for (const o of offs) { const k = o.teacherId; if (!map[k]) map[k] = { teacher: o.teacher.username, courses: 0, credits: 0, students: 0 }; map[k].courses += 1; map[k].credits += o.course.creditHours; map[k].students += o._count.registrations; }
    return res.json({ report: 'faculty', rows: Object.values(map) });
  }

  if (kind === 'student') {
    const students = await prisma.lmsUser.findMany({ where: { role: 'Student', ...(req.scope.unscoped ? {} : studentWhere(req.scope)) }, include: { profile: { select: { fullName: true, session: true, program: true } }, _count: { select: { registrations: true } }, courseResults: { where: { status: 'PUBLISHED' }, include: { offering: { include: { course: { select: { creditHours: true } } } } } } } });
    return res.json({ report: 'student', rows: students.map((s) => {
      const rs = s.courseResults.map((r) => ({ gradePoints: r.gradePoints, creditHours: r.offering.course.creditHours, percent: r.totalPercent }));
      const { gpa, risk } = studentRisk(rs);
      return { roll: s.username, name: displayName(s), session: s.profile ? s.profile.session : null, program: s.profile ? s.profile.program : null, active: s.isActive, registrations: s._count.registrations, gpa, risk };
    }) });
  }

  if (kind === 'academic') {
    const results = await prisma.courseResult.findMany({ where: { status: 'PUBLISHED', offering: { termId }, ...byOfferingWhere(req.scope) } });
    const dist = { A: 0, 'A-': 0, 'B+': 0, B: 0, 'B-': 0, 'C+': 0, C: 0, 'C-': 0, 'D+': 0, D: 0, F: 0 };
    let totalPct = 0;
    for (const r of results) { if (dist[r.letterGrade] !== undefined) dist[r.letterGrade] += 1; totalPct += r.totalPercent; }
    const pass = results.filter((r) => r.totalPercent >= 50).length;
    return res.json({ report: 'academic', term: term ? term.title : null, total: results.length, passRate: results.length ? Math.round((pass / results.length) * 100) : 0, avgPercent: results.length ? Math.round((totalPct / results.length) * 10) / 10 : 0, gradeDistribution: dist });
  }

  throw httpError(400, `Unknown report kind: ${kind}`);
}));

// ============================================================
// REPORTS & ANALYTICS — COMPLETE MODULE (Requirement #5)
//  ------------------------------------------------------------
//  A single, professional, fully real-time reporting engine with
//  tabs: enrollment · attendance · assignment · quizzes · midterm ·
//  semester · course · section · program · performance.
//  Every tab supports Program / Semester / Section filtering.
//  Real teacher names are always returned (profile.fullName).
//  No dummy data — 100% DB-backed.
// ============================================================

// Helper: real teacher display name for an offering.
function offTeacherName(off) {
  return off && off.teacher ? displayName(off.teacher) : 'Unassigned';
}

// Build the canonical "registration row" dataset for the focal's scope,
// enriched with program / semester / section / teacher so every report
// tab can filter consistently. Returns an array of plain rows.
async function buildRegistrationRows(scope) {
  const where = { ...byOfferingWhere(scope) };
  const regs = await prisma.courseRegistration.findMany({
    where,
    include: {
      section: { select: { name: true } },
      student: { select: { id: true, username: true, profile: { select: { fullName: true, programShortForm: true, program: true, department: true } } } },
      offering: {
        include: {
          course: { select: { code: true, title: true, creditHours: true, program: { select: { shortForm: true, name: true } }, semester: { select: { number: true, title: true } } } },
          term: { select: { title: true } },
          teacher: { select: { username: true, profile: { select: { fullName: true } } } },
        },
      },
    },
    orderBy: { id: 'desc' },
  });
  return regs.map((r) => ({
    regId: r.id,
    studentId: r.studentId,
    roll: r.student.username,
    studentName: displayName(r.student),
    program: r.offering.course.program ? r.offering.course.program.shortForm : (r.student.profile ? r.student.profile.programShortForm : null),
    programTitle: r.offering.course.program ? r.offering.course.program.name : (r.student.profile ? r.student.profile.program : null),
    semester: r.offering.course.semester ? r.offering.course.semester.number : null,
    semesterTitle: r.offering.course.semester ? r.offering.course.semester.title : null,
    section: r.section ? r.section.name : null,
    courseCode: r.offering.course.code,
    courseTitle: r.offering.course.title,
    creditHours: r.offering.course.creditHours,
    offeringId: r.offering.id,
    teacher: offTeacherName(r.offering),
    term: r.offering.term ? r.offering.term.title : null,
    status: r.status,
    registeredAt: r.registeredAt,
  }));
}

// Apply Program / Semester / Section filters to a row set.
function applyReportFilters(rows, query) {
  return rows.filter((r) => {
    if (query.program && query.program !== 'all' && String(r.program) !== String(query.program)) return false;
    if (query.semester && query.semester !== 'all' && String(r.semester) !== String(query.semester)) return false;
    if (query.section && query.section !== 'all' && String(r.section) !== String(query.section)) return false;
    return true;
  });
}

// Distinct filter options derived from the actual data (no dummy values).
function buildFilterOptions(rows) {
  const programs = [...new Set(rows.map((r) => r.program).filter(Boolean))].sort();
  const semesters = [...new Set(rows.map((r) => r.semester).filter((v) => v != null))].sort((a, b) => a - b);
  const sections = [...new Set(rows.map((r) => r.section).filter(Boolean))].sort();
  return { programs, semesters, sections };
}

router.get('/reports2/:tab', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const tab = String(req.params.tab || '').toLowerCase();
  const scope = req.scope;
  const q = { program: req.query.program, semester: req.query.semester, section: req.query.section };

  // The registration backbone (used by enrollment/section/program/semester/course).
  const allRows = await buildRegistrationRows(scope);
  const filterOptions = buildFilterOptions(allRows);
  const rows = applyReportFilters(allRows, q);
  const offeringIds = [...new Set(rows.map((r) => r.offeringId))];
  const studentIds = [...new Set(rows.map((r) => r.studentId))];

  // ---------- ENROLLMENT ----------
  if (tab === 'enrollment') {
    return res.json({
      tab, filterOptions,
      rows: rows.map((r) => ({
        roll: r.roll, student: r.studentName, program: r.program, semester: r.semester,
        section: r.section, course: `${r.courseCode} — ${r.courseTitle}`, teacher: r.teacher,
        status: r.status, term: r.term, registeredAt: r.registeredAt,
      })),
      summary: {
        total: rows.length,
        enrolled: rows.filter((r) => r.status === 'ENROLLED').length,
        withdrawn: rows.filter((r) => r.status === 'WITHDRAWN').length,
        dropped: rows.filter((r) => r.status === 'DROPPED').length,
        students: studentIds.length,
      },
    });
  }

  // ---------- ATTENDANCE ----------
  if (tab === 'attendance') {
    const recs = offeringIds.length
      ? await prisma.attendanceRecord.findMany({
          where: { session: { offeringId: { in: offeringIds } } },
          select: { studentId: true, status: true, session: { select: { offeringId: true } } },
        })
      : [];
    // Per registration row, compute attendance for that student in that offering.
    const key = (sid, oid) => `${sid}::${oid}`;
    const agg = {};
    for (const rec of recs) {
      const k = key(rec.studentId, rec.session.offeringId);
      if (!agg[k]) agg[k] = { present: 0, total: 0 };
      agg[k].total += 1;
      if (rec.status === 'PRESENT' || rec.status === 'LATE') agg[k].present += 1;
    }
    const out = rows.map((r) => {
      const a = agg[key(r.studentId, r.offeringId)] || { present: 0, total: 0 };
      const pct = a.total ? Math.round((a.present / a.total) * 1000) / 10 : 0;
      return {
        roll: r.roll, student: r.studentName, program: r.program, semester: r.semester, section: r.section,
        course: `${r.courseCode} — ${r.courseTitle}`, teacher: r.teacher,
        present: a.present, total: a.total, attendancePct: pct,
      };
    });
    const withData = out.filter((o) => o.total > 0);
    const avg = withData.length ? Math.round((withData.reduce((s, o) => s + o.attendancePct, 0) / withData.length) * 10) / 10 : 0;
    return res.json({ tab, filterOptions, rows: out, summary: { records: out.length, avgAttendance: avg, below75: out.filter((o) => o.total > 0 && o.attendancePct < 75).length } });
  }

  // ---------- ASSIGNMENT ----------
  if (tab === 'assignment') {
    const subs = offeringIds.length
      ? await prisma.assignmentSubmission.findMany({
          where: { assignment: { offeringId: { in: offeringIds } }, studentId: { in: studentIds } },
          select: {
            studentId: true, status: true, marks: true, submittedAt: true,
            assignment: { select: { title: true, totalMarks: true, offeringId: true } },
            student: { select: { username: true, profile: { select: { fullName: true } } } },
          },
        })
      : [];
    const offMeta = {};
    for (const r of rows) offMeta[r.offeringId] = r;
    const out = subs.map((s) => {
      const meta = offMeta[s.assignment.offeringId] || {};
      return {
        roll: s.student.username, student: displayName(s.student),
        program: meta.program, semester: meta.semester, section: meta.section,
        course: meta.courseCode ? `${meta.courseCode} — ${meta.courseTitle}` : null,
        teacher: meta.teacher || 'Unassigned',
        title: s.assignment.title, status: s.status,
        submissionDate: s.submittedAt, marks: s.marks, total: s.assignment.totalMarks,
      };
    });
    return res.json({
      tab, filterOptions, rows: out,
      summary: {
        total: out.length,
        submitted: out.filter((o) => o.status === 'SUBMITTED' || o.status === 'GRADED').length,
        graded: out.filter((o) => o.status === 'GRADED').length,
        pending: out.filter((o) => o.status !== 'SUBMITTED' && o.status !== 'GRADED').length,
      },
    });
  }

  // ---------- QUIZZES ----------
  if (tab === 'quizzes') {
    const attempts = offeringIds.length
      ? await prisma.quizAttempt.findMany({
          where: { quiz: { offeringId: { in: offeringIds } }, studentId: { in: studentIds } },
          select: {
            studentId: true, status: true, score: true, maxScore: true, submittedAt: true,
            quiz: { select: { title: true, offeringId: true } },
            student: { select: { username: true, profile: { select: { fullName: true } } } },
          },
        })
      : [];
    const offMeta = {};
    for (const r of rows) offMeta[r.offeringId] = r;
    const out = attempts.map((a) => {
      const meta = offMeta[a.quiz.offeringId] || {};
      return {
        roll: a.student.username, student: displayName(a.student),
        program: meta.program, semester: meta.semester, section: meta.section,
        course: meta.courseCode ? `${meta.courseCode} — ${meta.courseTitle}` : null,
        teacher: meta.teacher || 'Unassigned',
        title: a.quiz.title, status: a.status,
        obtained: a.score, total: a.maxScore, submittedAt: a.submittedAt,
      };
    });
    return res.json({
      tab, filterOptions, rows: out,
      summary: {
        total: out.length,
        submitted: out.filter((o) => o.status === 'SUBMITTED' || o.status === 'GRADED').length,
        graded: out.filter((o) => o.status === 'GRADED').length,
        pending: out.filter((o) => o.status !== 'SUBMITTED' && o.status !== 'GRADED').length,
      },
    });
  }

  // ---------- MID-TERM ----------
  if (tab === 'midterm') {
    const results = offeringIds.length
      ? await prisma.courseResult.findMany({
          where: { offeringId: { in: offeringIds }, studentId: { in: studentIds } },
          select: {
            studentId: true, midMarks: true, midMax: true, letterGrade: true, totalPercent: true, offeringId: true,
            student: { select: { username: true, profile: { select: { fullName: true } } } },
          },
        })
      : [];
    const offMeta = {};
    for (const r of rows) offMeta[r.offeringId] = r;
    const out = results.map((r) => {
      const meta = offMeta[r.offeringId] || {};
      return {
        roll: r.student.username, student: displayName(r.student),
        program: meta.program, semester: meta.semester, section: meta.section,
        course: meta.courseCode ? `${meta.courseCode} — ${meta.courseTitle}` : null,
        teacher: meta.teacher || 'Unassigned',
        marks: r.midMarks, total: r.midMax, grade: r.letterGrade,
      };
    });
    return res.json({ tab, filterOptions, rows: out, summary: { total: out.length } });
  }

  // ---------- SEMESTER (semester-wise performance) ----------
  if (tab === 'semester') {
    const results = offeringIds.length
      ? await prisma.courseResult.findMany({
          where: { offeringId: { in: offeringIds }, status: 'PUBLISHED', studentId: { in: studentIds } },
          select: { studentId: true, gradePoints: true, totalPercent: true, offeringId: true },
        })
      : [];
    const offMeta = {};
    for (const r of rows) offMeta[r.offeringId] = r;
    // Group by semester number.
    const bySem = {};
    for (const r of results) {
      const meta = offMeta[r.offeringId] || {};
      const sem = meta.semester != null ? meta.semester : 'N/A';
      if (!bySem[sem]) bySem[sem] = { semester: sem, students: new Set(), results: 0, sumPct: 0, sumGp: 0, sumCh: 0, pass: 0 };
      const g = bySem[sem];
      g.students.add(r.studentId);
      g.results += 1; g.sumPct += r.totalPercent;
      g.sumGp += r.gradePoints * (meta.creditHours || 3); g.sumCh += (meta.creditHours || 3);
      if (r.totalPercent >= 50) g.pass += 1;
    }
    const out = Object.values(bySem).map((g) => ({
      semester: g.semester, students: g.students.size, results: g.results,
      avgPercent: g.results ? Math.round((g.sumPct / g.results) * 10) / 10 : 0,
      avgGPA: g.sumCh ? Math.round((g.sumGp / g.sumCh) * 100) / 100 : 0,
      passRate: g.results ? Math.round((g.pass / g.results) * 100) : 0,
    })).sort((a, b) => (a.semester > b.semester ? 1 : -1));
    return res.json({ tab, filterOptions, rows: out, summary: { semesters: out.length } });
  }

  // ---------- COURSE (course-wise) ----------
  if (tab === 'course') {
    const results = offeringIds.length
      ? await prisma.courseResult.findMany({
          where: { offeringId: { in: offeringIds }, status: 'PUBLISHED' },
          select: { offeringId: true, totalPercent: true },
        })
      : [];
    const byOff = {};
    for (const r of rows) {
      if (!byOff[r.offeringId]) byOff[r.offeringId] = { course: `${r.courseCode} — ${r.courseTitle}`, code: r.courseCode, program: r.program, semester: r.semester, teacher: r.teacher, students: new Set(), published: 0, pass: 0, sumPct: 0 };
      byOff[r.offeringId].students.add(r.studentId);
    }
    for (const r of results) {
      const g = byOff[r.offeringId]; if (!g) continue;
      g.published += 1; g.sumPct += r.totalPercent; if (r.totalPercent >= 50) g.pass += 1;
    }
    const out = Object.values(byOff).map((g) => ({
      course: g.course, code: g.code, program: g.program, semester: g.semester, teacher: g.teacher,
      students: g.students.size, published: g.published,
      avgPercent: g.published ? Math.round((g.sumPct / g.published) * 10) / 10 : 0,
      passRate: g.published ? Math.round((g.pass / g.published) * 100) : 0,
    }));
    return res.json({ tab, filterOptions, rows: out, summary: { courses: out.length } });
  }

  // ---------- SECTION (section-wise) ----------
  if (tab === 'section') {
    const bySec = {};
    for (const r of rows) {
      const sec = r.section || 'N/A';
      if (!bySec[sec]) bySec[sec] = { section: sec, students: new Set(), courses: new Set(), programs: new Set(), enrolled: 0 };
      const g = bySec[sec];
      g.students.add(r.studentId); g.courses.add(r.courseCode);
      if (r.program) g.programs.add(r.program);
      if (r.status === 'ENROLLED') g.enrolled += 1;
    }
    const out = Object.values(bySec).map((g) => ({
      section: g.section, students: g.students.size, courses: g.courses.size,
      programs: [...g.programs].join(', '), enrolledRegistrations: g.enrolled,
    })).sort((a, b) => (a.section > b.section ? 1 : -1));
    return res.json({ tab, filterOptions, rows: out, summary: { sections: out.length } });
  }

  // ---------- PROGRAM (program-wise) ----------
  if (tab === 'program') {
    const byProg = {};
    for (const r of rows) {
      const prog = r.program || 'N/A';
      if (!byProg[prog]) byProg[prog] = { program: prog, programTitle: r.programTitle, students: new Set(), courses: new Set(), sections: new Set(), enrolled: 0 };
      const g = byProg[prog];
      g.students.add(r.studentId); g.courses.add(r.courseCode);
      if (r.section) g.sections.add(r.section);
      if (r.status === 'ENROLLED') g.enrolled += 1;
    }
    const out = Object.values(byProg).map((g) => ({
      program: g.program, programTitle: g.programTitle, students: g.students.size,
      courses: g.courses.size, sections: g.sections.size, enrolledRegistrations: g.enrolled,
    })).sort((a, b) => (a.program > b.program ? 1 : -1));
    return res.json({ tab, filterOptions, rows: out, summary: { programs: out.length } });
  }

  // ---------- PERFORMANCE (per-student complete performance) ----------
  if (tab === 'performance') {
    // Per-student aggregation across the filtered scope.
    const sIds = studentIds;
    const [results, attendance, subs, attempts, profiles] = await Promise.all([
      sIds.length ? prisma.courseResult.findMany({ where: { studentId: { in: sIds }, status: 'PUBLISHED', offeringId: { in: offeringIds } }, select: { studentId: true, gradePoints: true, totalPercent: true, midMarks: true, finalMarks: true, offeringId: true, offering: { select: { course: { select: { creditHours: true } } } } } }) : [],
      sIds.length ? prisma.attendanceRecord.findMany({ where: { studentId: { in: sIds }, session: { offeringId: { in: offeringIds } } }, select: { studentId: true, status: true } }) : [],
      sIds.length ? prisma.assignmentSubmission.findMany({ where: { studentId: { in: sIds }, assignment: { offeringId: { in: offeringIds } } }, select: { studentId: true, status: true } }) : [],
      sIds.length ? prisma.quizAttempt.findMany({ where: { studentId: { in: sIds }, quiz: { offeringId: { in: offeringIds } } }, select: { studentId: true, status: true } }) : [],
      sIds.length ? prisma.lmsStudentProfile.findMany({ where: { lmsUserId: { in: sIds } }, select: { lmsUserId: true, fullName: true, programShortForm: true } }) : [],
    ]);
    const profMap = {}; for (const p of profiles) profMap[p.lmsUserId] = p;
    // Meta (section/semester/program) per student from rows.
    const sMeta = {}; for (const r of rows) if (!sMeta[r.studentId]) sMeta[r.studentId] = r;
    const acc = {};
    const ensure = (sid) => (acc[sid] || (acc[sid] = { sumGp: 0, sumCh: 0, sumPct: 0, nRes: 0, midSum: 0, finSum: 0, present: 0, attTotal: 0, asgGraded: 0, asgTotal: 0, quizGraded: 0, quizTotal: 0 }));
    for (const r of results) { const a = ensure(r.studentId); const ch = r.offering.course.creditHours || 3; a.sumGp += r.gradePoints * ch; a.sumCh += ch; a.sumPct += r.totalPercent; a.nRes += 1; a.midSum += r.midMarks; a.finSum += r.finalMarks; }
    for (const r of attendance) { const a = ensure(r.studentId); a.attTotal += 1; if (r.status === 'PRESENT' || r.status === 'LATE') a.present += 1; }
    for (const s of subs) { const a = ensure(s.studentId); a.asgTotal += 1; if (s.status === 'GRADED') a.asgGraded += 1; }
    for (const q2 of attempts) { const a = ensure(q2.studentId); a.quizTotal += 1; if (q2.status === 'GRADED') a.quizGraded += 1; }

    const out = sIds.map((sid) => {
      const a = acc[sid] || { sumGp: 0, sumCh: 0, sumPct: 0, nRes: 0, midSum: 0, finSum: 0, present: 0, attTotal: 0, asgGraded: 0, asgTotal: 0, quizGraded: 0, quizTotal: 0 };
      const meta = sMeta[sid] || {};
      const prof = profMap[sid] || {};
      return {
        roll: meta.roll, student: prof.fullName || meta.studentName,
        program: meta.program || prof.programShortForm, semester: meta.semester, section: meta.section,
        cgpa: a.sumCh ? Math.round((a.sumGp / a.sumCh) * 100) / 100 : 0,
        gpa: a.sumCh ? Math.round((a.sumGp / a.sumCh) * 100) / 100 : 0,
        avgPercent: a.nRes ? Math.round((a.sumPct / a.nRes) * 10) / 10 : 0,
        attendancePct: a.attTotal ? Math.round((a.present / a.attTotal) * 1000) / 10 : 0,
        assignmentPerf: a.asgTotal ? Math.round((a.asgGraded / a.asgTotal) * 100) : 0,
        quizPerf: a.quizTotal ? Math.round((a.quizGraded / a.quizTotal) * 100) : 0,
        midAvg: a.nRes ? Math.round((a.midSum / a.nRes) * 10) / 10 : 0,
        finalAvg: a.nRes ? Math.round((a.finSum / a.nRes) * 10) / 10 : 0,
        courses: a.nRes,
      };
    });
    const avg = (key) => out.length ? Math.round((out.reduce((s, o) => s + (o[key] || 0), 0) / out.length) * 10) / 10 : 0;
    return res.json({
      tab, filterOptions, rows: out,
      summary: { students: out.length, avgCGPA: avg('cgpa'), avgAttendance: avg('attendancePct'), avgPercent: avg('avgPercent') },
    });
  }

  throw httpError(400, `Unknown report tab: ${tab}`);
}));

// ============================================================
// ANALYTICS — Department · Faculty · Student · Trend
// ============================================================
router.get('/analytics', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const [offerings, results, terms] = await Promise.all([
    prisma.courseOffering.findMany({ where: { isDeleted: false, termId, ...offeringWhere(req.scope) }, include: { course: { select: { code: true } }, teacher: { select: { username: true } }, attendanceSessions: { include: { records: { select: { status: true } } } }, results: { select: { status: true, totalPercent: true } }, _count: { select: { registrations: true } } } }),
    prisma.courseResult.findMany({ where: { status: 'PUBLISHED', offering: { termId }, ...byOfferingWhere(req.scope) }, include: { offering: { include: { teacher: { select: { username: true } }, course: { select: { code: true } } } } } }),
    prisma.academicTerm.findMany({ orderBy: { id: 'asc' } }),
  ]);

  // Department performance.
  const deptPerformance = offerings.map((o) => {
    const pub = o.results.filter((r) => r.status === 'PUBLISHED');
    const passed = pub.filter((r) => r.totalPercent >= 50).length;
    return { course: o.course.code, students: o._count.registrations, attendancePct: attendancePct(o.attendanceSessions), passRate: pub.length ? Math.round((passed / pub.length) * 100) : 0 };
  });

  // Faculty analytics.
  const facMap = {};
  for (const r of results) {
    const t = r.offering.teacher ? r.offering.teacher.username : 'Unassigned';
    if (!facMap[t]) facMap[t] = { teacher: t, sum: 0, n: 0, pass: 0 };
    facMap[t].sum += r.totalPercent; facMap[t].n += 1; if (r.totalPercent >= 50) facMap[t].pass += 1;
  }
  const facultyAnalytics = Object.values(facMap).map((f) => ({ teacher: f.teacher, avgPercent: f.n ? Math.round((f.sum / f.n) * 10) / 10 : 0, passRate: f.n ? Math.round((f.pass / f.n) * 100) : 0, results: f.n }));

  // Student distribution.
  const buckets = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '50-59': 0, '<50': 0 };
  for (const r of results) {
    const p = r.totalPercent;
    if (p >= 90) buckets['90-100'] += 1; else if (p >= 80) buckets['80-89'] += 1; else if (p >= 70) buckets['70-79'] += 1;
    else if (p >= 60) buckets['60-69'] += 1; else if (p >= 50) buckets['50-59'] += 1; else buckets['<50'] += 1;
  }

  // Trend analysis — pass rate + avg per term across all terms.
  const allResults = await prisma.courseResult.findMany({ where: { status: 'PUBLISHED', ...byOfferingWhere(req.scope) }, include: { offering: { select: { termId: true } } } });
  const trendMap = {};
  for (const t of terms) trendMap[t.id] = { term: t.title, sum: 0, n: 0, pass: 0 };
  for (const r of allResults) { const tm = trendMap[r.offering.termId]; if (!tm) continue; tm.sum += r.totalPercent; tm.n += 1; if (r.totalPercent >= 50) tm.pass += 1; }
  const trend = Object.values(trendMap).map((t) => ({ term: t.term, avgPercent: t.n ? Math.round((t.sum / t.n) * 10) / 10 : 0, passRate: t.n ? Math.round((t.pass / t.n) * 100) : 0, results: t.n }));

  res.json({ term: term ? term.title : null, departmentPerformance: deptPerformance, facultyAnalytics, studentDistribution: buckets, trend });
}));

// ============================================================
// COMMUNICATION — Notifications · Messaging · Announcements
// ============================================================
router.get('/announcements', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const items = await prisma.lmsAnnouncement.findMany({
    where: { isDeleted: false, authorId: req.lmsUser.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ announcements: items });
}));

router.post('/announcements', FOCAL, validate([
  body('title').trim().notEmpty(),
  body('message').trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { title, message, audience } = req.body;
  const ann = await prisma.lmsAnnouncement.create({ data: { authorId: req.lmsUser.id, title, message, audience: audience || 'ALL' } });
  const roleFilter = audience === 'TEACHERS' ? ['Teacher'] : audience === 'STUDENTS' ? ['Student'] : ['Student', 'Teacher'];
  const users = await prisma.lmsUser.findMany({ where: { role: { in: roleFilter }, isActive: true }, select: { id: true } });
  await notifyMany(users.map((u) => u.id), { title: `Announcement: ${title}`, message, type: 'ANNOUNCEMENT' });
  await audit(req, 'ANNOUNCEMENT_CREATE', 'LmsAnnouncement', ann.id, { after: ann });
  res.status(201).json({ announcement: ann, notified: users.length });
}));

router.delete('/announcements/:id', FOCAL, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await prisma.lmsAnnouncement.update({ where: { id }, data: { isDeleted: true } });
  await audit(req, 'ANNOUNCEMENT_DELETE', 'LmsAnnouncement', id, {});
  res.json({ message: 'Announcement deleted' });
}));

router.get('/messages/contacts', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  // Department scope: a focal person may only message their own department's
  // students and teachers, plus governance roles (Provost / Director QEC /
  // Exam Controller) so escalation/coordination still works. Unscoped roles
  // (Provost) get the full directory.
  const where = { isActive: true, id: { not: req.lmsUser.id } };
  if (!req.scope.unscoped) {
    const deptUserIds = [...new Set([...(req.scope.studentIds || []), ...(req.scope.teacherIds || [])])];
    where.OR = [
      { id: { in: deptUserIds.length ? deptUserIds : ['__none__'] } },
      { role: { in: ['Provost', 'QECCoordinator', 'ExamController'] } },
    ];
  }
  const users = await prisma.lmsUser.findMany({
    where,
    select: { id: true, username: true, role: true, profile: { select: { fullName: true } } },
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
  });
  // Unread counters per sender (real-time messaging — Requirement #4).
  const unread = await prisma.lmsThreadMessage.groupBy({
    by: ['senderId'],
    where: { recipientId: req.lmsUser.id, isRead: false },
    _count: { _all: true },
  });
  const unreadMap = {};
  for (const u of unread) unreadMap[u.senderId] = u._count._all;
  // Last message + timestamp per contact, for conversation previews / ordering.
  const last = await prisma.lmsThreadMessage.findMany({
    where: { OR: [{ senderId: req.lmsUser.id }, { recipientId: req.lmsUser.id }] },
    orderBy: { createdAt: 'desc' },
    select: { senderId: true, recipientId: true, body: true, createdAt: true },
  });
  const lastMap = {};
  for (const m of last) {
    const other = m.senderId === req.lmsUser.id ? m.recipientId : m.senderId;
    if (!lastMap[other]) lastMap[other] = { lastMessage: m.body, lastAt: m.createdAt };
  }
  const contacts = users.map((u) => ({
    id: u.id, username: u.username, name: displayName(u), role: u.role,
    unread: unreadMap[u.id] || 0,
    lastMessage: lastMap[u.id]?.lastMessage || null,
    lastAt: lastMap[u.id]?.lastAt || null,
  }));
  // Surface contacts with recent activity / unread first, then alphabetical.
  contacts.sort((a, b) => {
    if ((b.unread > 0) !== (a.unread > 0)) return (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0);
    if (a.lastAt && b.lastAt) return new Date(b.lastAt) - new Date(a.lastAt);
    if (a.lastAt) return -1;
    if (b.lastAt) return 1;
    return a.name.localeCompare(b.name);
  });
  res.json({ contacts });
}));

router.get('/messages/:userId', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const me = req.lmsUser.id; const other = req.params.userId;
  const msgs = await prisma.lmsThreadMessage.findMany({ where: { OR: [{ senderId: me, recipientId: other }, { senderId: other, recipientId: me }] }, orderBy: { createdAt: 'asc' } });
  // Mark incoming messages as read (real-time read receipts — Requirement #4).
  await prisma.lmsThreadMessage.updateMany({ where: { senderId: other, recipientId: me, isRead: false }, data: { isRead: true } });
  res.json({
    messages: msgs.map((m) => ({
      id: m.id, body: m.body, subject: m.subject,
      mine: m.senderId === me, isRead: m.isRead, createdAt: m.createdAt,
    })),
  });
}));

router.post('/messages/:userId', FOCAL, validate([body('body').trim().notEmpty()]), asyncHandler(async (req, res) => {
  const recipientId = req.params.userId;
  // Department guard: focal may only message their dept students/teachers or
  // governance roles. Provost (unscoped) may message anyone.
  if (!req.scope.unscoped) {
    const inDept = (req.scope.studentIds || []).includes(recipientId) || (req.scope.teacherIds || []).includes(recipientId);
    if (!inDept) {
      const recipient = await prisma.lmsUser.findUnique({ where: { id: recipientId }, select: { role: true } });
      const govRole = recipient && ['Provost', 'QECCoordinator', 'ExamController'].includes(recipient.role);
      if (!govRole) throw httpError(403, 'You can only message contacts in your department.');
    }
  }
  const msg = await prisma.lmsThreadMessage.create({ data: { senderId: req.lmsUser.id, recipientId, body: req.body.body, subject: req.body.subject || null } });
  await notify(recipientId, { title: 'New message', message: `${req.lmsUser.username} sent you a message`, type: 'MESSAGE', link: '/focal/quick-messages' });
  res.status(201).json({ message: { id: msg.id, body: msg.body, subject: msg.subject, mine: true, isRead: msg.isRead, createdAt: msg.createdAt } });
}));

// Lightweight unread-total endpoint for live badge polling (Requirement #4).
router.get('/messages-unread/count', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const total = await prisma.lmsThreadMessage.count({ where: { recipientId: req.lmsUser.id, isRead: false } });
  res.json({ unread: total });
}));

// ============================================================
// AUDIT LOGS / ACTIVITY TRACKING
// ============================================================
router.get('/audit', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'createdAt' });
  const where = {};
  if (req.query.action) where.action = { contains: String(req.query.action) };
  if (req.query.entity) where.entity = String(req.query.entity);
  if (req.query.actorId) where.actorId = String(req.query.actorId);
  if (req.query.actorRole) where.actorRole = String(req.query.actorRole);
  const [items, total] = await Promise.all([
    prisma.lmsAuditLog.findMany({ where, orderBy: q.orderBy, skip: q.skip, take: q.take, include: { actor: { select: { username: true, role: true } } } }),
    prisma.lmsAuditLog.count({ where }),
  ]);
  res.json(paginated(items.map((i) => ({ id: i.id, action: i.action, entity: i.entity, entityId: i.entityId, actor: i.actor ? i.actor.username : 'System', actorRole: i.actorRole, ip: i.ip, createdAt: i.createdAt })), total, q));
}));

// ============================================================
// RISK MONITORING — at-risk students + course risk flags.
// ============================================================
router.get('/risk', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const results = await prisma.courseResult.findMany({
    where: { status: 'PUBLISHED', offering: { termId }, ...byOfferingWhere(req.scope) },
    include: {
      student: { select: { id: true, username: true, profile: { select: { fullName: true } } } },
      offering: { include: { course: { select: { code: true, creditHours: true } } } },
    },
  });
  const byStudent = {};
  for (const r of results) {
    const sid = r.studentId;
    if (!byStudent[sid]) byStudent[sid] = { studentId: sid, roll: r.student.username, name: displayName(r.student), results: [] };
    byStudent[sid].results.push({ gradePoints: r.gradePoints, creditHours: r.offering.course.creditHours, percent: r.totalPercent, course: r.offering.course.code });
  }
  const students = Object.values(byStudent).map((s) => {
    const { gpa, failing, risk } = studentRisk(s.results);
    return { studentId: s.studentId, roll: s.roll, name: s.name, gpa, courses: s.results.length, failing, risk };
  }).sort((a, b) => a.gpa - b.gpa);

  // Course-level risk.
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offeringWhere(req.scope) },
    include: { course: { select: { code: true, title: true } }, attendanceSessions: { include: { records: { select: { status: true } } } }, results: { select: { status: true, totalPercent: true } } },
  });
  const courseRisk = offerings.map((o) => {
    const att = attendancePct(o.attendanceSessions);
    const pub = o.results.filter((r) => r.status === 'PUBLISHED');
    const passed = pub.filter((r) => r.totalPercent >= 50).length;
    const passRate = pub.length ? Math.round((passed / pub.length) * 100) : null;
    const flags = [];
    if (att > 0 && att < 75) flags.push('LOW_ATTENDANCE');
    if (passRate !== null && passRate < 60) flags.push('LOW_PASS_RATE');
    return { offeringId: o.id, course: `${o.course.code} — ${o.course.title}`, attendancePct: att, passRate, risk: flags.length >= 2 ? 'HIGH' : flags.length === 1 ? 'MEDIUM' : 'LOW', flags };
  }).filter((c) => c.risk !== 'LOW');

  res.json({
    atRiskStudents: students.filter((s) => s.risk !== 'LOW'),
    allStudents: students,
    courseRisk,
    summary: {
      highRiskStudents: students.filter((s) => s.risk === 'HIGH').length,
      mediumRiskStudents: students.filter((s) => s.risk === 'MEDIUM').length,
      atRiskCourses: courseRisk.length,
    },
  });
}));

// ============================================================
// NOTIFICATIONS (Focal's own inbox)
// ============================================================
router.get('/notifications', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  const items = await prisma.lmsNotification.findMany({ where: { userId: req.lmsUser.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  const unread = await prisma.lmsNotification.count({ where: { userId: req.lmsUser.id, isRead: false } });
  res.json({ notifications: items, unread });
}));

router.put('/notifications/:id/read', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  await prisma.lmsNotification.updateMany({ where: { id: parseInt(req.params.id, 10), userId: req.lmsUser.id }, data: { isRead: true } });
  res.json({ message: 'ok' });
}));

router.put('/notifications/read-all', FOCAL_OR_GOV, asyncHandler(async (req, res) => {
  await prisma.lmsNotification.updateMany({ where: { userId: req.lmsUser.id, isRead: false }, data: { isRead: true } });
  res.json({ message: 'ok' });
}));

// ============================================================
// SETTINGS — Focal Person profile, photo & password.
//   Reuses LmsStudentProfile as a generic staff-profile store keyed
//   on lmsUserId (same pattern as Course Coordinator). The focal's
//   `department` lives here and drives ALL department scoping, so it
//   is intentionally READ-ONLY from the Settings UI (only the Provost/
//   admin assigns a focal's department).
// ============================================================
async function getOrInitFocalProfile(userId, username, email) {
  let profile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: userId } });
  if (!profile) {
    profile = await prisma.lmsStudentProfile.create({
      data: {
        lmsUserId: userId,
        fullName: username || 'Focal Person',
        fatherName: '',
        cnic: '',
        dateOfBirth: '',
        gender: '',
        program: 'N/A',
        programShortForm: 'N/A',
        department: '',
        designation: 'Focal Person',
        employeeId: `FP-${userId.slice(-6)}`,
        rollNumber: `FOCAL-${userId.slice(-6)}`,
        registrationNumber: `FOCAL-${userId.slice(-6)}`,
        session: 'N/A',
        enrollmentDate: new Date(),
        email: email || null,
      },
    });
  }
  return profile;
}

// GET own profile (creates a default row on first access)
router.get('/me/profile', FOCAL, asyncHandler(async (req, res) => {
  const u = req.lmsUser;
  const full = await prisma.lmsUser.findUnique({ where: { id: u.id }, select: { email: true, lastLoginAt: true, createdAt: true } });
  const profile = await getOrInitFocalProfile(u.id, u.username, full ? full.email : null);
  res.json({
    profile,
    account: {
      id: u.id, username: u.username, email: full ? full.email : null, role: u.role,
      isActive: u.isActive, lastLoginAt: full ? full.lastLoginAt : null, createdAt: full ? full.createdAt : null,
    },
  });
}));

// UPDATE own profile (personal info). Department is NOT editable here —
// it governs scoping and is assigned by the Provost/admin.
router.put('/me/profile', FOCAL, asyncHandler(async (req, res) => {
  const u = req.lmsUser;
  await getOrInitFocalProfile(u.id, u.username, u.email);
  const b = req.body || {};
  const profile = await prisma.lmsStudentProfile.update({
    where: { lmsUserId: u.id },
    data: {
      fullName: b.fullName != null ? String(b.fullName) : undefined,
      fatherName: b.fatherName != null ? String(b.fatherName) : undefined,
      address: b.address != null ? String(b.address) : undefined,
      phone: b.phone != null ? String(b.phone) : undefined,
      whatsapp: b.whatsapp != null ? String(b.whatsapp) : undefined,
      email: b.email != null ? String(b.email) : undefined,
      designation: b.designation != null ? String(b.designation) : undefined,
      employeeId: b.employeeId != null ? String(b.employeeId) : undefined,
      // department intentionally omitted — read-only for focal persons.
    },
  });
  // Keep the account email in sync if it changed.
  if (b.email != null && String(b.email).trim()) {
    await prisma.lmsUser.update({ where: { id: u.id }, data: { email: String(b.email).trim() } }).catch(() => {});
  }
  await audit(req, 'FOCAL_PROFILE_UPDATE', 'LmsStudentProfile', u.id, { after: profile });
  res.json({ profile });
}));

// Upload / change profile picture
router.post('/me/photo', FOCAL, uploadPhoto.single('photo'), asyncHandler(async (req, res) => {
  const u = req.lmsUser;
  if (!req.file) throw httpError(400, 'No photo uploaded');
  await getOrInitFocalProfile(u.id, u.username, u.email);
  const photoUrl = `/uploads/photos/${req.file.filename}`;
  const profile = await prisma.lmsStudentProfile.update({ where: { lmsUserId: u.id }, data: { photoUrl } });
  await audit(req, 'FOCAL_PHOTO_UPDATE', 'LmsStudentProfile', u.id, { photoUrl });
  res.json({ profile, photoUrl });
}));

// Change password (verifies current password)
router.put('/me/password', FOCAL, validate([
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
]), asyncHandler(async (req, res) => {
  const u = req.lmsUser;
  const { currentPassword, newPassword } = req.body;
  const full = await prisma.lmsUser.findUnique({ where: { id: u.id } });
  const ok = await bcrypt.compare(String(currentPassword), full.passwordHash);
  if (!ok) throw httpError(400, 'Current password is incorrect');
  const strong = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!strong.test(String(newPassword))) {
    throw httpError(400, 'Password must be 8+ chars with an uppercase letter, a number and a special character');
  }
  const passwordHash = await bcrypt.hash(String(newPassword), 12);
  await prisma.lmsUser.update({ where: { id: u.id }, data: { passwordHash, mustChangePassword: false } });
  await audit(req, 'FOCAL_PASSWORD_CHANGE', 'LmsUser', u.id, {});
  res.json({ message: 'Password changed successfully' });
}));

module.exports = router;

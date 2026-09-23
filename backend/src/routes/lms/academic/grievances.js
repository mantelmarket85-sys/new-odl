// ============================================================
//  LMS SUPPORT & GRIEVANCES — UNIFIED STAFF ROUTER
//  ------------------------------------------------------------
//  Mounted at /api/lms/academic/grievances/*
//
//  This is an ADDITIVE staff-facing management surface for the upgraded
//  LMS Support & Grievances portal. It does NOT replace or modify any of
//  the existing per-role appeal endpoints (teacher /appeals,
//  coordinator /student-appeals, focal, exam, provost) — those keep
//  working exactly as before. It layers the full case-management feature
//  set (conversation, internal notes, expanded status workflow,
//  assignment / reassignment, escalation, SLA, audit timeline, stats)
//  on top of the SAME StudentAppeal records, with strict server-side
//  authorization for each LMS role.
//
//  The Admissions Appeal (`Appeal`) module is entirely separate and is
//  never referenced here.
//
//  Visibility model (server-enforced, mirrors the existing routing):
//    Teacher            → cases addressed to TEACHER for them, OR cases
//                         tied to an offering they teach / their students
//    CourseCoordinator  → cases from students in their department, OR
//                         addressed to COURSE_COORDINATOR
//    FocalPerson        → cases addressed to FOCAL_PERSON / FINANCE
//    ExamController     → cases addressed to EXAM_CONTROLLER
//    QECCoordinator     → cases addressed to QEC_COORDINATOR (quality)
//    Provost/SuperAdmin → all cases (governance oversight)
// ============================================================

const express = require('express');
const { body } = require('express-validator');
const prisma = require('../../../utils/prisma');
const { lmsAuth } = require('../../../middleware/lmsAuth');
const { validate } = require('../../../middleware/validate');
const { asyncHandler, httpError } = require('../../../utils/lmsHelpers');
const { audit } = require('../../../utils/lmsAudit');
const { notify, notifyMany } = require('../../../utils/lmsNotify');
const appealRouting = require('../../../utils/lmsAppealRouting');
const grievance = require('../../../utils/lmsGrievance');

const router = express.Router();

// Every route requires an authenticated, active LMS user. Students are
// explicitly rejected — they use the student-facing /student/appeals API.
router.use(lmsAuth);
router.use((req, res, next) => {
  if (req.lmsUser.role === 'Student') return res.status(403).json({ error: 'Staff access only.' });
  next();
});

// Map a canonical LmsUser.role → the routing role token used on cases.
const DB_ROLE_TO_ROUTE = {
  Teacher: 'TEACHER',
  CourseCoordinator: 'COURSE_COORDINATOR',
  FocalPerson: 'FOCAL_PERSON',
  ExamController: 'EXAM_CONTROLLER',
  QECCoordinator: 'QEC_COORDINATOR',
  Provost: 'PROVOST',
};

const isGovernance = (role) => role === 'Provost' || role === 'SuperAdmin';

/**
 * Resolve the set of student ids that fall within a Course Coordinator's
 * / Focal Person's department (reusing the same department scope the
 * existing modules use). Returns null when the role is not department
 * scoped (governance) — meaning "no student filter".
 */
async function departmentStudentIds(req) {
  const role = req.lmsUser.role;
  if (isGovernance(role)) return null; // no restriction
  // Reuse the appeal-routing department context: find the staff member's
  // department, then all students in it.
  const staffProfile = await prisma.lmsStudentProfile
    .findUnique({ where: { lmsUserId: req.lmsUser.id }, select: { department: true, programShortForm: true } })
    .catch(() => null);
  const dept = staffProfile?.department ? String(staffProfile.department).trim() : '';
  if (!dept) return undefined; // unknown scope → fall back to routing-only visibility
  const students = await prisma.lmsUser.findMany({
    where: { role: 'Student', profile: { department: dept } },
    select: { id: true },
  });
  return students.map((s) => s.id);
}

/**
 * Build the Prisma `where` clause describing which cases the current
 * staff user may see. Enforced on the SERVER for every list/detail call.
 */
async function visibilityWhere(req) {
  const role = req.lmsUser.role;
  const base = { isDeleted: false };
  if (isGovernance(role)) return base; // Provost / SuperAdmin: all cases.

  const routeToken = DB_ROLE_TO_ROUTE[role];

  if (role === 'Teacher') {
    // Cases explicitly addressed to this teacher, OR tied to an offering
    // they teach, OR from a student enrolled with them.
    const offerings = await prisma.courseOffering.findMany({ where: { teacherId: req.lmsUser.id }, select: { id: true } });
    const offIds = offerings.map((o) => o.id);
    const regs = offIds.length
      ? await prisma.courseRegistration.findMany({ where: { offeringId: { in: offIds } }, select: { studentId: true } })
      : [];
    const studentIds = [...new Set(regs.map((r) => r.studentId))];
    return {
      ...base,
      OR: [
        { targetRole: 'TEACHER', targetUserId: req.lmsUser.id },
        { offeringId: { in: offIds.length ? offIds : [-1] } },
        { studentId: { in: studentIds.length ? studentIds : ['__none__'] }, targetRole: null },
      ],
    };
  }

  if (role === 'CourseCoordinator') {
    const ids = await departmentStudentIds(req);
    const or = [{ targetRole: 'COURSE_COORDINATOR' }];
    if (Array.isArray(ids)) or.push({ studentId: { in: ids.length ? ids : ['__none__'] } });
    // legacy (no targetRole) department cases
    if (Array.isArray(ids)) or.push({ targetRole: null, studentId: { in: ids.length ? ids : ['__none__'] } });
    return { ...base, OR: or };
  }

  if (role === 'FocalPerson') {
    // Focal handles departmental grievances + administrative/finance.
    const ids = await departmentStudentIds(req);
    const or = [{ targetRole: 'FOCAL_PERSON' }, { targetRole: 'FINANCE' }];
    if (Array.isArray(ids)) or.push({ targetRole: null, studentId: { in: ids.length ? ids : ['__none__'] } });
    return { ...base, OR: or };
  }

  // ExamController / QECCoordinator → cases routed to their token only.
  if (routeToken) return { ...base, targetRole: routeToken };

  // Unknown role → see nothing.
  return { ...base, id: -1 };
}

/** Assert the current staff user may act on a specific case (write ops). */
async function assertCanManage(req, appeal) {
  const where = await visibilityWhere(req);
  const match = await prisma.studentAppeal.findFirst({ where: { ...where, id: appeal.id } });
  if (!match) throw httpError(403, 'You do not have access to this case.');
}

// Shape a case for the staff API (adds presentation fields + optional
// student name). Does not mutate the DB row.
async function shapeStaffCase(a, studentMap = {}) {
  return {
    ...a,
    caseCode: grievance.displayCode(a),
    caseType: grievance.effectiveCaseType(a),
    caseTypeLabel: grievance.CASE_TYPE_LABEL[grievance.effectiveCaseType(a)],
    categoryLabel: grievance.categoryLabel(a.category),
    statusLabel: grievance.STATUS_LABEL[a.status] || a.status,
    priority: a.priority || 'MEDIUM',
    targetRoleLabel: a.targetRole ? (grievance.ROUTE_ROLE_LABEL[a.targetRole] || a.targetRole) : null,
    studentName: studentMap[a.studentId] || null,
  };
}

// ------------------------------------------------------------
// GET /  — list cases visible to this staff user (with filters).
//   query: status, caseType, category, priority, q (search), sla
// ------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
  const where = await visibilityWhere(req);
  const { status, caseType, category, priority, q, sla } = req.query;
  if (status) where.status = String(status).toUpperCase();
  if (priority) where.priority = String(priority).toUpperCase();
  if (category) where.category = String(category);
  if (caseType) {
    const ct = String(caseType).toUpperCase();
    // legacy rows (null) count as APPEAL
    if (ct === 'APPEAL') where.OR = [...(where.OR || []), { caseType: 'APPEAL' }, { caseType: null }];
    else where.caseType = ct;
  }

  let rows = await prisma.studentAppeal.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 500 });

  // Text search (case code / subject) — done in-memory for portability.
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((r) => (grievance.displayCode(r).toLowerCase().includes(needle) || (r.subject || '').toLowerCase().includes(needle)));
  }
  if (sla === 'breached') rows = rows.filter((r) => r.slaBreached || (r.slaDueAt && new Date(r.slaDueAt) < new Date() && !['RESOLVED', 'CLOSED', 'REJECTED'].includes(r.status)));

  // Backfill case codes + resolve student names.
  for (const r of rows) if (!r.caseCode) r.caseCode = await grievance.ensureCaseCode(r);
  const studentIds = [...new Set(rows.map((r) => r.studentId))];
  const students = studentIds.length
    ? await prisma.lmsUser.findMany({ where: { id: { in: studentIds } }, include: { profile: { select: { fullName: true } } } })
    : [];
  const studentMap = Object.fromEntries(students.map((s) => [s.id, s.profile?.fullName || s.username]));

  const shaped = await Promise.all(rows.map((r) => shapeStaffCase(r, studentMap)));
  res.json({ cases: shaped });
}));

// ------------------------------------------------------------
// GET /stats  — role-appropriate dashboard metrics.
// ------------------------------------------------------------
router.get('/stats', asyncHandler(async (req, res) => {
  const where = await visibilityWhere(req);
  const rows = await prisma.studentAppeal.findMany({
    where,
    select: { status: true, caseType: true, category: true, priority: true, slaDueAt: true, slaBreached: true, assignedUserId: true, feedbackResolved: true, feedbackRating: true, createdAt: true, handledAt: true },
  });
  const now = new Date();
  const count = (fn) => rows.filter(fn).length;
  const breached = (r) => r.slaBreached || (r.slaDueAt && new Date(r.slaDueAt) < now && !['RESOLVED', 'CLOSED', 'REJECTED'].includes(r.status));

  // Analytics groupings.
  const byKey = (key, mapper = (x) => x) => {
    const m = {};
    for (const r of rows) { const k = mapper(r[key]) || 'Unknown'; m[k] = (m[k] || 0) + 1; }
    return m;
  };
  // Average resolution time (hours) for resolved/closed with handledAt.
  const resolvedRows = rows.filter((r) => ['RESOLVED', 'CLOSED'].includes(r.status) && r.handledAt);
  const avgResolutionHours = resolvedRows.length
    ? Math.round(resolvedRows.reduce((s, r) => s + (new Date(r.handledAt) - new Date(r.createdAt)) / 3.6e6, 0) / resolvedRows.length)
    : null;
  const rated = rows.filter((r) => r.feedbackRating);
  const avgRating = rated.length ? Number((rated.reduce((s, r) => s + r.feedbackRating, 0) / rated.length).toFixed(2)) : null;

  res.json({
    total: rows.length,
    newCases: count((r) => r.status === 'OPEN'),
    assignedToMe: count((r) => r.assignedUserId === req.lmsUser.id),
    inProgress: count((r) => ['IN_PROGRESS', 'IN_REVIEW', 'ASSIGNED', 'REOPENED'].includes(r.status)),
    awaitingStudent: count((r) => r.status === 'AWAITING_STUDENT'),
    escalated: count((r) => r.status === 'ESCALATED' || r.escalated),
    slaBreached: count(breached),
    resolved: count((r) => r.status === 'RESOLVED'),
    closed: count((r) => r.status === 'CLOSED'),
    rejected: count((r) => r.status === 'REJECTED'),
    analytics: {
      byCaseType: byKey('caseType', (v) => grievance.CASE_TYPE_LABEL[v || 'APPEAL']),
      byStatus: byKey('status', (v) => grievance.STATUS_LABEL[v] || v),
      byPriority: byKey('priority', (v) => v || 'MEDIUM'),
      byCategory: byKey('category', (v) => grievance.categoryLabel(v) || 'Uncategorised'),
      avgResolutionHours,
      avgRating,
    },
  });
}));

// ------------------------------------------------------------
// GET /:id  — full case (conversation + internal notes + timeline).
// ------------------------------------------------------------
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Case not found.');
  await assertCanManage(req, appeal);
  if (!appeal.caseCode) appeal.caseCode = await grievance.ensureCaseCode(appeal);

  const [student, messages, notes, history] = await Promise.all([
    prisma.lmsUser.findUnique({ where: { id: appeal.studentId }, include: { profile: { select: { fullName: true, rollNumber: true, department: true, program: true } } } }),
    prisma.grievanceMessage.findMany({ where: { appealId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.grievanceInternalNote.findMany({ where: { appealId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.grievanceStatusHistory.findMany({ where: { appealId: id }, orderBy: { createdAt: 'asc' } }),
  ]);
  // Mark student→staff messages as read by staff.
  await prisma.grievanceMessage.updateMany({ where: { appealId: id, senderRole: 'Student', isReadByStaff: false }, data: { isReadByStaff: true } }).catch(() => {});

  const studentMap = { [appeal.studentId]: student?.profile?.fullName || student?.username };
  res.json({
    case: {
      ...(await shapeStaffCase(appeal, studentMap)),
      student: student ? { id: student.id, name: student.profile?.fullName || student.username, rollNumber: student.profile?.rollNumber, department: student.profile?.department, program: student.profile?.program } : null,
    },
    messages: messages.map((m) => ({ id: m.id, senderRole: m.senderRole, mine: m.senderId === req.lmsUser.id, isStudent: m.senderRole === 'Student', body: m.body, fileName: m.fileName, filePath: m.filePath, createdAt: m.createdAt })),
    internalNotes: notes.map((n) => ({ id: n.id, authorRole: n.authorRole, mine: n.authorId === req.lmsUser.id, body: n.body, createdAt: n.createdAt })),
    history: history.map((h) => ({ id: h.id, action: h.action, actorRole: h.actorRole, fromValue: h.fromValue, toValue: h.toValue, note: h.note, createdAt: h.createdAt })),
  });
}));

// ------------------------------------------------------------
// POST /:id/reply  — staff reply in the case conversation (visible to student).
// ------------------------------------------------------------
router.post('/:id/reply', validate([body('body').isString().isLength({ min: 1 })]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Case not found.');
  await assertCanManage(req, appeal);

  const msg = await prisma.grievanceMessage.create({
    data: { appealId: id, senderId: req.lmsUser.id, senderRole: req.lmsUser.role, body: String(req.body.body).slice(0, 4000), isReadByStaff: true },
  });
  await prisma.studentAppeal.update({ where: { id }, data: { updatedAt: new Date() } });
  await notify(appeal.studentId, { title: 'New reply on your case', message: `A reply was added to "${appeal.subject}" (${grievance.displayCode(appeal)})`, type: 'APPEAL', link: '/student/appeals' });
  await audit(req, 'GRIEVANCE_STAFF_REPLY', 'StudentAppeal', id, { after: { messageId: msg.id } });
  res.status(201).json({ message: { id: msg.id, senderRole: req.lmsUser.role, mine: true, isStudent: false, body: msg.body, createdAt: msg.createdAt } });
}));

// ------------------------------------------------------------
// POST /:id/internal-note  — staff-only note. NEVER visible to students
// (students cannot query this table). Enforced server-side.
// ------------------------------------------------------------
router.post('/:id/internal-note', validate([body('body').isString().isLength({ min: 1 })]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Case not found.');
  await assertCanManage(req, appeal);

  const note = await prisma.grievanceInternalNote.create({
    data: { appealId: id, authorId: req.lmsUser.id, authorRole: req.lmsUser.role, body: String(req.body.body).slice(0, 4000) },
  });
  await audit(req, 'GRIEVANCE_INTERNAL_NOTE', 'StudentAppeal', id, { after: { noteId: note.id } });
  res.status(201).json({ note: { id: note.id, authorRole: req.lmsUser.role, mine: true, body: note.body, createdAt: note.createdAt } });
}));

// ------------------------------------------------------------
// PUT /:id/status  — change the case status (expanded workflow).
// ------------------------------------------------------------
router.put('/:id/status', validate([body('status').isString()]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const newStatus = String(req.body.status).toUpperCase();
  if (!grievance.STATUSES.includes(newStatus)) throw httpError(400, 'Invalid status.');
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Case not found.');
  await assertCanManage(req, appeal);

  const data = { status: newStatus };
  if (['RESOLVED', 'CLOSED', 'REJECTED'].includes(newStatus)) { data.handledAt = new Date(); data.handledById = req.lmsUser.id; }
  if (req.body.response) data.response = String(req.body.response).slice(0, 4000);
  const updated = await prisma.studentAppeal.update({ where: { id }, data });

  await grievance.logHistory(id, { actorId: req.lmsUser.id, actorRole: req.lmsUser.role, action: 'STATUS_CHANGE', fromValue: appeal.status, toValue: newStatus, note: req.body.response || null });
  await notify(appeal.studentId, { title: `Case ${grievance.STATUS_LABEL[newStatus].toLowerCase()}`, message: req.body.response || `Your case "${appeal.subject}" (${grievance.displayCode(appeal)}) is now ${grievance.STATUS_LABEL[newStatus]}.`, type: 'APPEAL', link: '/student/appeals' });
  await audit(req, 'GRIEVANCE_STATUS', 'StudentAppeal', id, { before: { status: appeal.status }, after: { status: newStatus } });
  res.json({ case: await shapeStaffCase(updated) });
}));

// ------------------------------------------------------------
// PUT /:id/priority  — staff override of priority (recomputes SLA).
// ------------------------------------------------------------
router.put('/:id/priority', validate([body('priority').isString()]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const priority = grievance.normalisePriority(req.body.priority);
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Case not found.');
  await assertCanManage(req, appeal);

  const updated = await prisma.studentAppeal.update({ where: { id }, data: { priority, slaDueAt: grievance.slaDueFrom(priority, appeal.createdAt ? new Date(appeal.createdAt) : new Date()), slaBreached: false } });
  await grievance.logHistory(id, { actorId: req.lmsUser.id, actorRole: req.lmsUser.role, action: 'PRIORITY', fromValue: appeal.priority || 'MEDIUM', toValue: priority });
  await audit(req, 'GRIEVANCE_PRIORITY', 'StudentAppeal', id, { before: { priority: appeal.priority }, after: { priority } });
  res.json({ case: await shapeStaffCase(updated) });
}));

// ------------------------------------------------------------
// PUT /:id/assign  — assign / reassign the case to a responsible role
// and/or a specific staff user. Records the change on the timeline.
//   body: { targetRole?, assignedUserId?, reason? }
// ------------------------------------------------------------
router.put('/:id/assign', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Case not found.');
  await assertCanManage(req, appeal);

  const data = {};
  const fromRole = appeal.targetRole || null;
  let newRole = req.body.targetRole ? String(req.body.targetRole).toUpperCase() : appeal.targetRole;
  if (req.body.targetRole) {
    if (!grievance.ROUTE_ROLE_LABEL[newRole]) throw httpError(400, 'Invalid role.');
    data.targetRole = newRole;
    // When routing to a role queue (not a specific teacher) clear targetUserId.
    if (newRole !== 'TEACHER') data.targetUserId = null;
  }
  if (req.body.assignedUserId !== undefined) {
    data.assignedUserId = req.body.assignedUserId || null;
    data.assignedAt = req.body.assignedUserId ? new Date() : null;
    if (appeal.status === 'OPEN') data.status = 'ASSIGNED';
  }
  const updated = await prisma.studentAppeal.update({ where: { id }, data });

  const action = fromRole && newRole && fromRole !== newRole ? 'REASSIGN' : 'ASSIGN';
  await grievance.logHistory(id, { actorId: req.lmsUser.id, actorRole: req.lmsUser.role, action, fromValue: grievance.ROUTE_ROLE_LABEL[fromRole] || fromRole, toValue: grievance.ROUTE_ROLE_LABEL[newRole] || newRole, note: req.body.reason || null });

  // Notify the new recipients.
  let recipientIds = [];
  if (data.assignedUserId) recipientIds = [data.assignedUserId];
  else if (newRole) {
    const staff = await grievance.resolveRouteStaff(newRole, appeal.studentId, updated.targetUserId);
    recipientIds = staff.map((s) => s.id);
  }
  if (recipientIds.length) await notifyMany(recipientIds, { title: 'A case was assigned to you', message: `"${appeal.subject}" (${grievance.displayCode(appeal)})`, type: 'APPEAL' });
  await audit(req, `GRIEVANCE_${action}`, 'StudentAppeal', id, { before: { targetRole: fromRole, assignedUserId: appeal.assignedUserId }, after: { targetRole: newRole, assignedUserId: data.assignedUserId } });
  res.json({ case: await shapeStaffCase(updated) });
}));

// ------------------------------------------------------------
// POST /:id/escalate  — escalate the case (moves to the next level).
//   body: { toRole?, reason? }
// ------------------------------------------------------------
router.post('/:id/escalate', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Case not found.');
  await assertCanManage(req, appeal);

  // Default escalation ladder if no explicit target supplied.
  const LADDER = { TEACHER: 'COURSE_COORDINATOR', COURSE_COORDINATOR: 'FOCAL_PERSON', FOCAL_PERSON: 'PROVOST', EXAM_CONTROLLER: 'PROVOST', QEC_COORDINATOR: 'PROVOST', FINANCE: 'PROVOST' };
  const fromRole = appeal.targetRole || DB_ROLE_TO_ROUTE[req.lmsUser.role] || 'COURSE_COORDINATOR';
  const toRole = req.body.toRole ? String(req.body.toRole).toUpperCase() : (LADDER[fromRole] || 'PROVOST');
  if (!grievance.ROUTE_ROLE_LABEL[toRole]) throw httpError(400, 'Invalid escalation target.');

  const updated = await prisma.studentAppeal.update({
    where: { id },
    data: { targetRole: toRole, targetUserId: null, assignedUserId: null, assignedAt: null, status: 'ESCALATED', escalated: true, escalatedAt: new Date() },
  });
  await grievance.logHistory(id, { actorId: req.lmsUser.id, actorRole: req.lmsUser.role, action: 'ESCALATE', fromValue: grievance.ROUTE_ROLE_LABEL[fromRole] || fromRole, toValue: grievance.ROUTE_ROLE_LABEL[toRole] || toRole, note: req.body.reason || null });

  const staff = await grievance.resolveRouteStaff(toRole, appeal.studentId);
  if (staff.length) await notifyMany(staff.map((s) => s.id), { title: 'Escalated case', message: `"${appeal.subject}" (${grievance.displayCode(appeal)}) was escalated to you.`, type: 'APPEAL' });
  await notify(appeal.studentId, { title: 'Your case was escalated', message: `"${appeal.subject}" (${grievance.displayCode(appeal)}) was escalated to ${grievance.ROUTE_ROLE_LABEL[toRole]}.`, type: 'APPEAL', link: '/student/appeals' });
  await audit(req, 'GRIEVANCE_ESCALATE', 'StudentAppeal', id, { before: { targetRole: fromRole }, after: { targetRole: toRole } });
  res.json({ case: await shapeStaffCase(updated) });
}));

// ------------------------------------------------------------
// GET /meta/config  — routing/category/status vocab for staff UIs.
// ------------------------------------------------------------
router.get('/meta/config', asyncHandler(async (req, res) => {
  res.json({
    caseTypes: grievance.CASE_TYPES.map((v) => ({ value: v, label: grievance.CASE_TYPE_LABEL[v] })),
    categories: grievance.CATEGORY_CATALOG,
    priorities: grievance.PRIORITIES,
    statuses: grievance.STATUSES.map((v) => ({ value: v, label: grievance.STATUS_LABEL[v] })),
    roles: Object.entries(grievance.ROUTE_ROLE_LABEL).map(([value, label]) => ({ value, label })),
  });
}));

module.exports = router;

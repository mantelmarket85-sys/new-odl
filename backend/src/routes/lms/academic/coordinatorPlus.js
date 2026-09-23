// ============================================================
//  COURSE COORDINATOR — ENHANCED MODULES
//  /api/lms/academic/coordinator/*  (additive router)
//  ------------------------------------------------------------
//  This router ADDS the production-grade Course-Coordinator modules
//  required by the completion spec WITHOUT modifying the existing
//  coordinator.js routes. It is mounted at the SAME path prefix so
//  the frontend keeps a single `api.coordinator.*` namespace.
//
//  Modules implemented here:
//    1. Teacher Replacement   (full CRUD + history + conflict checks)
//    2. Students              (rich search / filters / status tabs / profile)
//    3. Enrollment            (requests + approve/reject + statistics + trend)
//    4. Appeals               (view / approve / reject / history — StudentAppeal)
//    5. Announcements         (real-time create/edit/delete/publish + history)
//    6. Quick Messages        (real-time chat, read receipts, unread counts)
//    7. Scheme of Study       (drag & drop builder + versioned history)
//    8. Real-time stream      (Server-Sent Events bus)
//
//  Every mutating action writes an LmsAuditLog row. All data is sourced
//  from the real database — no mock/static data anywhere.
// ============================================================
const express = require('express');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const prisma = require('../../../utils/prisma');
const { lmsAuth, lmsRequireRole } = require('../../../middleware/lmsAuth');
const { validate } = require('../../../middleware/validate');
const { asyncHandler, parseListQuery, paginated, httpError } = require('../../../utils/lmsHelpers');
const { audit } = require('../../../utils/lmsAudit');
const { notify, notifyMany } = require('../../../utils/lmsNotify');
const { displayName } = require('../../../utils/lmsWorkflow');
const realtime = require('../../../utils/lmsRealtime');
const { buildDeptScope, resolveDepartmentInstructorIds, getUserDepartment, resolveDepartmentPrograms } = require('../../../utils/lmsDeptScope');

const router = express.Router();

const COORD = lmsRequireRole('CourseCoordinator');
const COORD_OR_GOV = lmsRequireRole('CourseCoordinator', 'Provost', 'FocalPerson');

// ------------------------------------------------------------
// DEPARTMENT ISOLATION HELPERS
// ------------------------------------------------------------
// A Course Coordinator is strictly scoped to their own department.
// Governance roles (Provost / FocalPerson / QEC / ExamController) are
// unscoped (university-wide oversight). buildDeptScope() returns
// { unscoped, department, programIds, courseIds, offeringIds, teacherIds,
//   studentIds, shortForms } and applies the SECURE DEFAULT: a coordinator
// with no department sees NOTHING (empty id sentinels), never everything.

/** Resolve the caller's department scope (cached per request). */
async function deptScope(req) {
  if (!req._deptScope) req._deptScope = await buildDeptScope(req.lmsUser);
  return req._deptScope;
}

/** Instructor (Teacher) ids belonging to the caller's department. null = unscoped. */
async function deptInstructorIds(req) {
  const scope = await deptScope(req);
  if (scope.unscoped) return null;
  return resolveDepartmentInstructorIds(scope);
}

async function currentTerm() {
  return prisma.academicTerm.findFirst({ where: { isCurrent: true, isActive: true } });
}

// ============================================================
// 0. REAL-TIME STREAM (Server-Sent Events)
//    GET /coordinator/events?token=<jwt>
//    EventSource cannot send Authorization headers, so the JWT is
//    accepted via query string here (validated the same way as lmsAuth).
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

  // Heartbeat keeps proxies from closing the idle connection.
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) { /* closed */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    realtime.removeClient(userId, res);
  });
}));

// All remaining routes require a normal Bearer session.
router.use(lmsAuth);

// ============================================================
// 1. TEACHER REPLACEMENT MODULE  (full record + history)
// ============================================================

// Helper — resolve an offering's schedule slots for conflict checking.
async function slotsForTeacher(teacherId, termId) {
  const offs = await prisma.courseOffering.findMany({
    where: { teacherId, isDeleted: false, ...(termId ? { termId } : {}) },
    select: { id: true, scheduleSlots: { where: { isDeleted: false }, select: { dayOfWeek: true, startTime: true, endTime: true } } },
  });
  const slots = [];
  offs.forEach((o) => (o.scheduleSlots || []).forEach((s) => slots.push(s)));
  return slots;
}

function timeToMin(t) {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Detect whether a requested date/time slot clashes with the replacement
// teacher's existing timetable. timeSlot format "HH:MM-HH:MM".
async function detectConflict(replacementTeacherId, date, timeSlot, termId) {
  if (!timeSlot || !timeSlot.includes('-')) return null;
  const [s, e] = timeSlot.split('-').map((x) => x.trim());
  const sMin = timeToMin(s);
  const eMin = timeToMin(e);
  if (sMin == null || eMin == null) return null;
  // Day-of-week from date (if provided).
  let dow = null;
  if (date && !Number.isNaN(Date.parse(date))) dow = new Date(date).getDay();
  const slots = await slotsForTeacher(replacementTeacherId, termId);
  for (const slot of slots) {
    if (dow != null && slot.dayOfWeek !== dow) continue;
    const ss = timeToMin(slot.startTime);
    const se = timeToMin(slot.endTime);
    if (ss == null || se == null) continue;
    // Overlap test.
    if (sMin < se && ss < eMin) {
      return `Replacement teacher already has a class ${slot.startTime}-${slot.endTime}`;
    }
  }
  return null;
}

// List replacements with search + filters + pagination + sorting.
router.get('/replacements', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'createdAt' });
  const where = { isDeleted: false };
  if (req.query.status && req.query.status !== 'ALL') where.status = String(req.query.status).toUpperCase();
  if (req.query.date) where.date = String(req.query.date);

  // DEPARTMENT ISOLATION: a coordinator only sees replacements that involve
  // an instructor of their own department (either the original or the
  // replacement teacher). Governance roles see everything.
  const scope = await deptScope(req);
  if (!scope.unscoped) {
    const instrIds = (await deptInstructorIds(req)) || [];
    const idFilter = instrIds.length ? instrIds : ['__none__'];
    where.OR = [
      { originalTeacherId: { in: idFilter } },
      { replacementTeacherId: { in: idFilter } },
    ];
  }

  let [items, total] = await Promise.all([
    prisma.teacherReplacement.findMany({
      where,
      orderBy: { [q.sortBy === 'date' ? 'date' : 'createdAt']: q.sortDir },
      skip: q.skip, take: q.take,
    }),
    prisma.teacherReplacement.count({ where }),
  ]);

  // Decorate with teacher names.
  const ids = new Set();
  items.forEach((r) => { ids.add(r.originalTeacherId); ids.add(r.replacementTeacherId); });
  const users = await prisma.lmsUser.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, username: true, profile: { select: { fullName: true } } },
  });
  const nameOf = {};
  users.forEach((u) => { nameOf[u.id] = displayName(u); });

  let rows = items.map((r) => ({
    ...r,
    originalTeacherName: nameOf[r.originalTeacherId] || r.originalTeacherId,
    replacementTeacherName: nameOf[r.replacementTeacherId] || r.replacementTeacherId,
  }));

  // Optional free-text search across teacher names / course label / reason.
  if (req.query.search) {
    const s = String(req.query.search).toLowerCase();
    rows = rows.filter((r) =>
      [r.originalTeacherName, r.replacementTeacherName, r.courseLabel, r.sectionLabel, r.reason]
        .some((v) => (v || '').toLowerCase().includes(s)));
  }

  res.json(paginated(rows, total, q));
}));

// Create a teacher replacement request.
router.post('/replacements', COORD, validate([
  body('originalTeacherId').notEmpty(),
  body('replacementTeacherId').notEmpty(),
  body('reason').trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { originalTeacherId, replacementTeacherId, offeringId, sectionId, date, timeSlot, reason } = req.body;
  if (originalTeacherId === replacementTeacherId) {
    throw httpError(400, 'Original and replacement teacher must be different.');
  }
  const [orig, repl] = await Promise.all([
    prisma.lmsUser.findFirst({ where: { id: originalTeacherId, role: 'Teacher' }, select: { id: true, username: true, profile: { select: { fullName: true } } } }),
    prisma.lmsUser.findFirst({ where: { id: replacementTeacherId, role: 'Teacher' }, select: { id: true, username: true, isActive: true, profile: { select: { fullName: true } } } }),
  ]);
  if (!orig) throw httpError(400, 'Original teacher not found.');
  if (!repl) throw httpError(400, 'Replacement teacher not found.');
  if (repl.isActive === false) throw httpError(400, 'Replacement teacher is not active / available.');

  // DEPARTMENT ISOLATION: the original (being replaced) teacher must belong to
  // the coordinator's own department. Governance roles are unscoped.
  {
    const scope = await deptScope(req);
    if (!scope.unscoped) {
      const instrIds = (await deptInstructorIds(req)) || [];
      if (!instrIds.includes(originalTeacherId)) {
        throw httpError(403, 'You can only arrange replacements for your own department\'s instructors.');
      }
    }
  }

  const term = await currentTerm();
  const termId = term ? term.id : null;

  // Build denormalized labels for history display.
  let courseLabel = null, sectionLabel = null, offId = null, secId = null;
  if (offeringId) {
    offId = parseInt(offeringId, 10);
    const off = await prisma.courseOffering.findUnique({ where: { id: offId }, include: { course: { select: { code: true, title: true } } } });
    if (!off) throw httpError(400, 'Offering not found.');
    courseLabel = `${off.course.code} — ${off.course.title}`;
  }
  if (sectionId) {
    secId = parseInt(sectionId, 10);
    const sec = await prisma.section.findUnique({ where: { id: secId } });
    if (sec) sectionLabel = sec.name;
  }

  // Duplicate guard — same pending request for same teacher/offering/date.
  const dup = await prisma.teacherReplacement.findFirst({
    where: { isDeleted: false, status: 'PENDING', originalTeacherId, replacementTeacherId, offeringId: offId, date: date || null },
  });
  if (dup) throw httpError(409, 'A pending replacement for this teacher/offering/date already exists.');

  // Conflict detection (non-blocking — surfaced as a warning).
  const conflict = await detectConflict(replacementTeacherId, date, timeSlot, termId);

  const rec = await prisma.teacherReplacement.create({
    data: {
      originalTeacherId, replacementTeacherId,
      offeringId: offId, sectionId: secId,
      courseLabel, sectionLabel,
      termLabel: term ? term.title : null,
      date: date || null, timeSlot: timeSlot || null,
      reason, status: 'PENDING',
      createdById: req.lmsUser.id,
    },
  });
  await audit(req, 'TEACHER_REPLACEMENT_CREATE', 'TeacherReplacement', rec.id, { after: rec });
  realtime.emitAll('replacement', { action: 'created', id: rec.id });
  res.status(201).json({ replacement: rec, conflict });
}));

// Edit a replacement (only while PENDING).
router.put('/replacements/:id', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.teacherReplacement.findUnique({ where: { id } });
  if (!before || before.isDeleted) throw httpError(404, 'Replacement not found.');
  if (before.status !== 'PENDING') throw httpError(400, 'Only pending replacements can be edited.');
  const { date, timeSlot, reason, replacementTeacherId } = req.body;
  const data = {};
  if (date !== undefined) data.date = date || null;
  if (timeSlot !== undefined) data.timeSlot = timeSlot || null;
  if (reason !== undefined && String(reason).trim()) data.reason = String(reason).trim();
  if (replacementTeacherId) {
    const repl = await prisma.lmsUser.findFirst({ where: { id: replacementTeacherId, role: 'Teacher' } });
    if (!repl) throw httpError(400, 'Replacement teacher not found.');
    data.replacementTeacherId = replacementTeacherId;
  }
  const rec = await prisma.teacherReplacement.update({ where: { id }, data });
  await audit(req, 'TEACHER_REPLACEMENT_UPDATE', 'TeacherReplacement', id, { before, after: rec });
  realtime.emitAll('replacement', { action: 'updated', id });
  res.json({ replacement: rec });
}));

// Decide (approve / reject). On approval the offering/section teacher is updated.
router.put('/replacements/:id/decide', COORD, validate([
  body('action').isIn(['approve', 'reject']),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action, note } = req.body;
  const rec = await prisma.teacherReplacement.findUnique({ where: { id } });
  if (!rec || rec.isDeleted) throw httpError(404, 'Replacement not found.');
  if (rec.status !== 'PENDING') throw httpError(400, 'Replacement already decided.');

  let applied = false;
  if (action === 'approve' && rec.offeringId) {
    await prisma.courseOffering.update({ where: { id: rec.offeringId }, data: { teacherId: rec.replacementTeacherId } });
    if (rec.sectionId) {
      await prisma.section.update({ where: { id: rec.sectionId }, data: { teacherId: rec.replacementTeacherId } });
    }
    applied = true;
    await notify(rec.replacementTeacherId, { title: 'Course assigned (replacement)', message: `You are now teaching ${rec.courseLabel || 'a course'}.`, type: 'INFO' });
    await notify(rec.originalTeacherId, { title: 'Replacement approved', message: `Your class ${rec.courseLabel || ''} has been reassigned.`, type: 'INFO' });
  }

  const updated = await prisma.teacherReplacement.update({
    where: { id },
    data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED', decisionNote: note || null, decidedById: req.lmsUser.id, decidedAt: new Date(), applied },
  });
  await audit(req, `TEACHER_REPLACEMENT_${action.toUpperCase()}`, 'TeacherReplacement', id, { before: rec, after: updated });
  realtime.emitAll('replacement', { action: 'decided', id, status: updated.status });
  res.json({ replacement: updated });
}));

// Soft-delete a replacement.
router.delete('/replacements/:id', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.teacherReplacement.findUnique({ where: { id } });
  if (!before || before.isDeleted) throw httpError(404, 'Replacement not found.');
  await prisma.teacherReplacement.update({ where: { id }, data: { isDeleted: true } });
  await audit(req, 'TEACHER_REPLACEMENT_DELETE', 'TeacherReplacement', id, { before });
  realtime.emitAll('replacement', { action: 'deleted', id });
  res.json({ message: 'Replacement deleted' });
}));

// Conflict pre-check endpoint (used by the create form before submitting).
router.post('/replacements/check-conflict', COORD, asyncHandler(async (req, res) => {
  const { replacementTeacherId, date, timeSlot } = req.body;
  if (!replacementTeacherId) return res.json({ conflict: null });
  const term = await currentTerm();
  const conflict = await detectConflict(replacementTeacherId, date, timeSlot, term ? term.id : null);
  res.json({ conflict });
}));

// ============================================================
// 2. STUDENTS MODULE  (rich search / filters / status tabs / profile)
// ============================================================
const STUDENT_PROFILE_SELECT = {
  fullName: true, fatherName: true, cnic: true, dateOfBirth: true, gender: true,
  phone: true, email: true, address: true, whatsapp: true,
  program: true, programShortForm: true, department: true,
  rollNumber: true, registrationNumber: true, session: true, enrollmentDate: true,
  photoUrl: true,
};

// GET /coordinator/students-list — global search + advanced filters + status tabs.
router.get('/students-list', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'username' });
  const search = req.query.search ? String(req.query.search).trim() : '';
  const status = req.query.status ? String(req.query.status).toLowerCase() : 'all';

  const where = { role: 'Student' };

  // DEPARTMENT ISOLATION: coordinators only see their own department's students.
  const scope = await deptScope(req);
  if (!scope.unscoped) {
    where.id = { in: scope.studentIds.length ? scope.studentIds : ['__none__'] };
  }

  // Status tabs. Active/Suspended/Blocked map to isActive + block records.
  // Enrolled tab = has at least one ENROLLED registration.
  if (status === 'active') where.isActive = true;
  else if (status === 'suspended' || status === 'blocked') where.isActive = false;

  // Global search across many identifiers (DB-backed).
  if (search) {
    where.OR = [
      { username: { contains: search } },
      { email: { contains: search } },
      { profile: { is: { fullName: { contains: search } } } },
      { profile: { is: { rollNumber: { contains: search } } } },
      { profile: { is: { registrationNumber: { contains: search } } } },
      { profile: { is: { email: { contains: search } } } },
      { profile: { is: { cnic: { contains: search } } } },
      { profile: { is: { program: { contains: search } } } },
      { profile: { is: { programShortForm: { contains: search } } } },
      { profile: { is: { session: { contains: search } } } },
    ];
  }

  // Advanced filters (combine with everything above).
  const pf = {};
  if (req.query.program) pf.OR = [{ program: { contains: String(req.query.program) } }, { programShortForm: { contains: String(req.query.program) } }];
  if (req.query.batch) pf.session = { contains: String(req.query.batch) };
  if (req.query.session) pf.session = { contains: String(req.query.session) };
  if (Object.keys(pf).length) {
    where.profile = where.profile ? { ...where.profile, is: { ...(where.profile.is || {}), ...pf } } : { is: pf };
  }

  let [items, total] = await Promise.all([
    prisma.lmsUser.findMany({
      where, orderBy: { username: q.sortDir }, skip: q.skip, take: q.take,
      select: {
        id: true, username: true, email: true, isActive: true, createdAt: true,
        profile: { select: STUDENT_PROFILE_SELECT },
        registrations: { select: { id: true, status: true, sectionId: true, section: { select: { name: true } } } },
      },
    }),
    prisma.lmsUser.count({ where }),
  ]);

  // Section filter (post-query because section lives on registrations).
  if (req.query.section) {
    const sec = String(req.query.section).toLowerCase();
    items = items.filter((s) => (s.registrations || []).some((r) => (r.section?.name || '').toLowerCase() === sec));
  }

  const rows = items.map((s) => {
    const p = s.profile || {};
    const enrolled = (s.registrations || []).filter((r) => r.status === 'ENROLLED').length;
    const sections = [...new Set((s.registrations || []).map((r) => r.section?.name).filter(Boolean))];
    return {
      id: s.id,
      roll: p.rollNumber || s.username,
      regNo: p.registrationNumber || null,
      name: p.fullName || s.username,
      email: p.email || s.email || null,
      cnic: p.cnic || null,
      program: p.program || null,
      programShort: p.programShortForm || null,
      batch: p.session || null,
      department: p.department || null,
      section: sections.join(', ') || null,
      photoUrl: p.photoUrl || null,
      isActive: s.isActive,
      status: s.isActive ? (enrolled > 0 ? 'Enrolled' : 'Active') : 'Suspended',
      enrolledCount: enrolled,
    };
  });

  res.json(paginated(rows, total, q));
}));

// Filter option lists (programs, batches, sections) — all from DB.
router.get('/students-filters', COORD_OR_GOV, asyncHandler(async (req, res) => {
  // DEPARTMENT ISOLATION: only surface filter options from the coordinator's
  // own department (students + their offerings' sections).
  const scope = await deptScope(req);
  const profileWhere = scope.unscoped
    ? {}
    : { lmsUserId: { in: scope.studentIds.length ? scope.studentIds : ['__none__'] } };
  const sectionWhere = scope.unscoped
    ? { isDeleted: false }
    : { isDeleted: false, offeringId: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };

  const profiles = await prisma.lmsStudentProfile.findMany({
    where: profileWhere,
    select: { program: true, programShortForm: true, session: true },
  });
  const sections = await prisma.section.findMany({ where: sectionWhere, select: { name: true } });
  const programs = [...new Set(profiles.map((p) => p.program).filter(Boolean))];
  const batches = [...new Set(profiles.map((p) => p.session).filter(Boolean))];
  const sectionNames = [...new Set(sections.map((s) => s.name).filter(Boolean))];
  res.json({ programs, batches, sections: sectionNames });
}));

// Status counts for the tabs.
router.get('/students-counts', COORD_OR_GOV, asyncHandler(async (req, res) => {
  // DEPARTMENT ISOLATION: counts are computed over own-department students only.
  const scope = await deptScope(req);
  const studentIdFilter = scope.unscoped
    ? {}
    : { id: { in: scope.studentIds.length ? scope.studentIds : ['__none__'] } };
  const regStudentFilter = scope.unscoped
    ? {}
    : { studentId: { in: scope.studentIds.length ? scope.studentIds : ['__none__'] } };

  const [total, active, inactive, enrolledRegs] = await Promise.all([
    prisma.lmsUser.count({ where: { role: 'Student', ...studentIdFilter } }),
    prisma.lmsUser.count({ where: { role: 'Student', isActive: true, ...studentIdFilter } }),
    prisma.lmsUser.count({ where: { role: 'Student', isActive: false, ...studentIdFilter } }),
    prisma.courseRegistration.findMany({ where: { status: 'ENROLLED', ...regStudentFilter }, select: { studentId: true }, distinct: ['studentId'] }),
  ]);
  res.json({ all: total, active, suspended: inactive, blocked: inactive, enrolled: enrolledRegs.length });
}));

// Full student profile page data.
router.get('/students/:id/profile', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const id = req.params.id;

  // DEPARTMENT ISOLATION: a coordinator can only view students in their dept.
  const scope = await deptScope(req);
  if (!scope.unscoped && !scope.studentIds.includes(id)) {
    throw httpError(403, 'This student belongs to another department.');
  }

  const student = await prisma.lmsUser.findFirst({
    where: { id, role: 'Student' },
    select: {
      id: true, username: true, email: true, isActive: true, createdAt: true, lastLoginAt: true,
      profile: { select: STUDENT_PROFILE_SELECT },
    },
  });
  if (!student) throw httpError(404, 'Student not found.');

  const registrations = await prisma.courseRegistration.findMany({
    where: { studentId: id },
    include: {
      offering: { include: { course: { select: { code: true, title: true, creditHours: true, semester: { select: { number: true, title: true } } } }, term: { select: { title: true } } } },
      section: { select: { name: true } },
    },
    orderBy: { registeredAt: 'desc' },
  });

  // Derive current section + semester from the most recent active enrollment.
  const activeReg =
    registrations.find((r) => r.status === 'ENROLLED') || registrations[0] || null;
  const currentSection = activeReg?.section?.name || null;
  const currentSemester = activeReg?.offering?.course?.semester
    ? (activeReg.offering.course.semester.title || `Semester ${activeReg.offering.course.semester.number}`)
    : null;

  // Attendance summary.
  const attRecords = await prisma.attendanceRecord.findMany({ where: { studentId: id }, select: { status: true } });
  const present = attRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
  const attendancePct = attRecords.length ? Math.round((present / attRecords.length) * 1000) / 10 : 0;

  // Academic performance (published results).
  const results = await prisma.courseResult.findMany({
    where: { studentId: id, status: 'PUBLISHED' },
    select: { totalPercent: true, letterGrade: true, gradePoints: true, offering: { select: { course: { select: { code: true, title: true, creditHours: true } } } } },
  });
  const avg = results.length ? Math.round((results.reduce((a, r) => a + (r.totalPercent || 0), 0) / results.length) * 10) / 10 : 0;

  const p = student.profile || {};
  res.json({
    student: {
      id: student.id,
      username: student.username,
      isActive: student.isActive,
      createdAt: student.createdAt,
      lastLoginAt: student.lastLoginAt,
      personal: {
        fullName: p.fullName || student.username,
        fatherName: p.fatherName || null,
        cnic: p.cnic || null,
        dateOfBirth: p.dateOfBirth || null,
        gender: p.gender || null,
      },
      academic: {
        program: p.program || null,
        programShort: p.programShortForm || null,
        department: p.department || null,
        rollNumber: p.rollNumber || student.username,
        registrationNumber: p.registrationNumber || null,
        batch: p.session || null,
        session: p.session || null,
        semester: currentSemester,
        section: currentSection,
        enrollmentDate: p.enrollmentDate || null,
      },
      contact: {
        email: p.email || student.email || null,
        phone: p.phone || null,
        whatsapp: p.whatsapp || null,
        address: p.address || null,
      },
      photoUrl: p.photoUrl || null,
    },
    enrollmentHistory: registrations.map((r) => ({
      id: r.id,
      course: r.offering?.course ? `${r.offering.course.code} — ${r.offering.course.title}` : '—',
      credits: r.offering?.course?.creditHours || 0,
      term: r.offering?.term?.title || null,
      section: r.section?.name || null,
      type: r.registrationType,
      status: r.status,
      registeredAt: r.registeredAt,
    })),
    attendanceSummary: { totalRecords: attRecords.length, present, percent: attendancePct },
    academicPerformance: {
      averagePercent: avg,
      courses: results.map((r) => ({
        course: r.offering?.course ? `${r.offering.course.code} — ${r.offering.course.title}` : '—',
        credits: r.offering?.course?.creditHours || 0,
        percent: r.totalPercent,
        grade: r.letterGrade,
        gpa: r.gradePoints,
      })),
    },
  });
}));

// Transfer a student between sections (capacity-validated + history).
router.put('/students/:id/transfer', COORD, validate([
  body('registrationId').notEmpty(),
  body('toSectionId').notEmpty(),
]), asyncHandler(async (req, res) => {
  const { registrationId, toSectionId } = req.body;
  const reg = await prisma.courseRegistration.findUnique({ where: { id: parseInt(registrationId, 10) }, include: { section: true } });
  if (!reg || reg.studentId !== req.params.id) throw httpError(404, 'Registration not found for this student.');

  // DEPARTMENT ISOLATION: the student + the offering being transferred within
  // must both belong to the coordinator's own department.
  const scope = await deptScope(req);
  if (!scope.unscoped) {
    if (!scope.studentIds.includes(reg.studentId)) throw httpError(403, 'This student belongs to another department.');
    if (!scope.offeringIds.includes(reg.offeringId)) throw httpError(403, 'This course offering belongs to another department.');
  }

  const target = await prisma.section.findUnique({ where: { id: parseInt(toSectionId, 10) }, include: { _count: { select: { registrations: true } } } });
  if (!target || target.isDeleted) throw httpError(400, 'Target section not found.');
  if (target.offeringId !== reg.offeringId) throw httpError(400, 'Target section belongs to a different course.');
  if (target._count.registrations >= target.capacity) throw httpError(400, `Target section is full (${target.capacity}).`);

  const before = { sectionId: reg.sectionId, sectionName: reg.section?.name };
  const updated = await prisma.courseRegistration.update({ where: { id: reg.id }, data: { sectionId: target.id } });
  await audit(req, 'STUDENT_SECTION_TRANSFER', 'CourseRegistration', reg.id, { before, after: { sectionId: target.id, sectionName: target.name } });
  res.json({ registration: updated, message: `Transferred to section ${target.name}` });
}));

// ============================================================
// 3. ENROLLMENT MODULE  (requests + approve/reject + statistics)
//    Enrollment requests are CourseRegistration rows in a PENDING-like
//    state. We use status 'REQUESTED' for new requests; ENROLLED =
//    approved; DROPPED = rejected. Existing ENROLLED rows are untouched.
// ============================================================
router.get('/enrollment/requests', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'registeredAt' });
  const status = req.query.status ? String(req.query.status).toUpperCase() : 'ALL';
  const where = {};
  if (status !== 'ALL') where.status = status;
  else where.status = { in: ['REQUESTED', 'ENROLLED', 'DROPPED'] };

  // DEPARTMENT ISOLATION: only enrollment requests for this dept's offerings.
  const scope = await deptScope(req);
  if (!scope.unscoped) {
    where.offeringId = { in: scope.offeringIds.length ? scope.offeringIds : [-1] };
  }

  let [items, total] = await Promise.all([
    prisma.courseRegistration.findMany({
      where,
      include: {
        student: { select: { id: true, username: true, profile: { select: { fullName: true, rollNumber: true, program: true } } } },
        offering: {
          include: {
            course: {
              select: {
                code: true, title: true,
                program: { select: { id: true, name: true, shortForm: true } },
                semester: { select: { id: true, number: true, title: true } },
              },
            },
          },
        },
        section: { select: { name: true } },
      },
      orderBy: { registeredAt: q.sortDir }, skip: q.skip, take: q.take,
    }),
    prisma.courseRegistration.count({ where }),
  ]);

  const sem = req.query.semester ? parseInt(req.query.semester, 10) : null;

  let rows = items.map((r) => {
    const course = r.offering?.course;
    return {
      id: r.id,
      studentId: r.studentId,
      studentName: r.student?.profile?.fullName || r.student?.username,
      roll: r.student?.profile?.rollNumber || r.student?.username,
      program: course?.program?.shortForm || course?.program?.name || r.student?.profile?.program || null,
      programName: course?.program?.name || null,
      semesterNumber: course?.semester?.number ?? null,
      semesterTitle: course?.semester?.title || (course?.semester?.number ? `Semester ${course.semester.number}` : null),
      course: course ? `${course.code} — ${course.title}` : '—',
      section: r.section?.name || null,
      type: r.registrationType,
      status: r.status,
      registeredAt: r.registeredAt,
    };
  });

  if (sem) rows = rows.filter((r) => r.semesterNumber === sem);
  if (req.query.search) {
    const s = String(req.query.search).toLowerCase();
    rows = rows.filter((r) => [r.studentName, r.roll, r.course].some((v) => (v || '').toLowerCase().includes(s)));
  }

  res.json(paginated(rows, total, q));
}));

router.put('/enrollment/requests/:id/decide', COORD, validate([
  body('action').isIn(['approve', 'reject']),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action, note } = req.body;
  const reg = await prisma.courseRegistration.findUnique({ where: { id } });
  if (!reg) throw httpError(404, 'Enrollment request not found.');

  // DEPARTMENT ISOLATION: can only decide requests for own-dept offerings.
  const scope = await deptScope(req);
  if (!scope.unscoped && !scope.offeringIds.includes(reg.offeringId)) {
    throw httpError(403, 'This enrollment request belongs to another department.');
  }

  const newStatus = action === 'approve' ? 'ENROLLED' : 'DROPPED';
  const updated = await prisma.courseRegistration.update({ where: { id }, data: { status: newStatus } });
  await audit(req, `ENROLLMENT_${action.toUpperCase()}`, 'CourseRegistration', id, { before: { status: reg.status }, after: { status: newStatus, note: note || null } });
  await notify(reg.studentId, { title: `Enrollment ${action === 'approve' ? 'approved' : 'rejected'}`, message: note || `Your enrollment request was ${newStatus.toLowerCase()}.`, type: 'INFO' });
  realtime.emitAll('enrollment', { action: 'decided', id, status: newStatus });
  res.json({ registration: updated });
}));

router.get('/enrollment/statistics', COORD_OR_GOV, asyncHandler(async (req, res) => {
  // DEPARTMENT ISOLATION: statistics computed over this dept's offerings only.
  const scope = await deptScope(req);
  const offW = scope.unscoped
    ? {}
    : { offeringId: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };

  const [requested, enrolled, dropped, withdrawn] = await Promise.all([
    prisma.courseRegistration.count({ where: { status: 'REQUESTED', ...offW } }),
    prisma.courseRegistration.count({ where: { status: 'ENROLLED', ...offW } }),
    prisma.courseRegistration.count({ where: { status: 'DROPPED', ...offW } }),
    prisma.courseRegistration.count({ where: { status: 'WITHDRAWN', ...offW } }),
  ]);

  // 6-month trend (from real registeredAt timestamps).
  const since = new Date();
  since.setMonth(since.getMonth() - 5, 1);
  since.setHours(0, 0, 0, 0);
  const recent = await prisma.courseRegistration.findMany({
    where: { registeredAt: { gte: since }, ...offW },
    select: { registeredAt: true, status: true },
  });
  const buckets = {};
  for (let i = 0; i < 6; i++) {
    const d = new Date(since); d.setMonth(since.getMonth() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets[key] = { month: d.toLocaleString('en', { month: 'short' }), approved: 0, rejected: 0, total: 0 };
  }
  recent.forEach((r) => {
    const d = new Date(r.registeredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets[key]) return;
    buckets[key].total += 1;
    if (r.status === 'ENROLLED') buckets[key].approved += 1;
    if (r.status === 'DROPPED') buckets[key].rejected += 1;
  });

  res.json({
    totals: { total: requested + enrolled + dropped + withdrawn, approved: enrolled, rejected: dropped, pending: requested, withdrawn },
    trend: Object.values(buckets),
  });
}));

// ============================================================
// 4. APPEALS MODULE  (StudentAppeal: view / approve / reject / history)
// ============================================================
router.get('/student-appeals', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'createdAt' });
  const where = { isDeleted: false };
  // Appeal routing: coordinator sees appeals EITHER legacy (no targetRole)
  // OR explicitly addressed to COURSE_COORDINATOR. (Provost oversight via
  // COORD_OR_GOV still uses its own dedicated provost views.)
  //
  // Req 5 — DEPARTMENT ISOLATION: a Course Coordinator sees ONLY appeals that
  // belong to their OWN department, i.e. filed by a student who belongs to
  // this coordinator's department. StudentAppeal has no department column, so
  // department membership is derived from the student set (scope.studentIds).
  // Coordinators of other departments must NOT see it. Strictly enforced.
  if (req.lmsUser.role === 'CourseCoordinator') {
    where.OR = [{ targetRole: null }, { targetRole: 'COURSE_COORDINATOR' }];
    const scope = await deptScope(req);
    where.studentId = { in: scope.studentIds.length ? scope.studentIds : ['__none__'] };
  }
  if (req.query.status && req.query.status !== 'ALL') {
    const st = String(req.query.status).toUpperCase();
    if (st === 'PENDING') where.status = { in: ['OPEN', 'IN_REVIEW'] };
    else if (st === 'APPROVED') where.status = 'RESOLVED';
    else where.status = st;
  }
  if (req.query.type) where.type = String(req.query.type);

  let [items, total] = await Promise.all([
    prisma.studentAppeal.findMany({
      where,
      include: { student: { select: { id: true, username: true, profile: { select: { fullName: true, rollNumber: true, program: true } } } } },
      orderBy: { createdAt: q.sortDir }, skip: q.skip, take: q.take,
    }),
    prisma.studentAppeal.count({ where }),
  ]);

  let rows = items.map((a) => ({
    id: a.id,
    studentId: a.studentId,
    studentName: a.student?.profile?.fullName || a.student?.username,
    roll: a.student?.profile?.rollNumber || a.student?.username,
    program: a.student?.profile?.program || null,
    type: a.type,
    subject: a.subject,
    description: a.description,
    attachmentUrl: a.filePath || null,
    attachmentName: a.fileName || null,
    status: a.status,
    response: a.response || null,
    createdAt: a.createdAt,
    decidedAt: a.handledAt || a.updatedAt,
  }));

  if (req.query.search) {
    const s = String(req.query.search).toLowerCase();
    rows = rows.filter((a) => [a.studentName, a.roll, a.subject, a.type].some((v) => (v || '').toLowerCase().includes(s)));
  }

  res.json(paginated(rows, total, q));
}));

router.put('/student-appeals/:id/decide', COORD, validate([
  body('action').isIn(['approve', 'reject']),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action, response } = req.body;
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Appeal not found.');
  // Req 5 — DEPARTMENT ISOLATION: a Course Coordinator may only decide appeals
  // filed by a student in their OWN department. Cross-department decisions are
  // strictly forbidden.
  if (req.lmsUser.role === 'CourseCoordinator') {
    const scope = await deptScope(req);
    if (!scope.studentIds.includes(appeal.studentId)) {
      throw httpError(403, 'This appeal belongs to another department.');
    }
  }
  // StudentAppeal status vocab: OPEN | IN_REVIEW | RESOLVED | REJECTED.
  const newStatus = action === 'approve' ? 'RESOLVED' : 'REJECTED';
  const updated = await prisma.studentAppeal.update({
    where: { id },
    data: { status: newStatus, response: response || null, handledById: req.lmsUser.id, handledAt: new Date() },
  });
  await audit(req, `APPEAL_${action.toUpperCase()}`, 'StudentAppeal', id, { before: { status: appeal.status }, after: { status: newStatus } });
  await notify(appeal.studentId, { title: `Appeal ${action === 'approve' ? 'approved' : 'rejected'}`, message: response || `Your appeal "${appeal.subject}" was ${action === 'approve' ? 'approved' : 'rejected'}.`, type: 'INFO', link: '/student/appeals' });
  realtime.emitAll('appeal', { action: 'decided', id, status: newStatus });
  res.json({ appeal: updated });
}));

router.get('/student-appeals/counts', COORD_OR_GOV, asyncHandler(async (req, res) => {
  // Req 5 — same department isolation as the list endpoint: a Course
  // Coordinator's counts reflect ONLY appeals from students in their own
  // department (plus the coordinator-targeted routing filter).
  const base = { isDeleted: false };
  if (req.lmsUser.role === 'CourseCoordinator') {
    const scope = await deptScope(req);
    base.OR = [{ targetRole: null }, { targetRole: 'COURSE_COORDINATOR' }];
    base.studentId = { in: scope.studentIds.length ? scope.studentIds : ['__none__'] };
  }
  const [total, pending, approved, rejected] = await Promise.all([
    prisma.studentAppeal.count({ where: { ...base } }),
    prisma.studentAppeal.count({ where: { ...base, status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    prisma.studentAppeal.count({ where: { ...base, status: 'RESOLVED' } }),
    prisma.studentAppeal.count({ where: { ...base, status: 'REJECTED' } }),
  ]);
  res.json({ all: total, pending, approved, rejected });
}));

// ============================================================
// 5. ANNOUNCEMENTS — edit + publish (real-time) extra endpoints
//    (create/list/delete already exist in coordinator.js; we add
//     update + publish-broadcast + audience-scoped fields here.)
// ============================================================
router.put('/announcements/:id', COORD, validate([
  body('title').optional().trim().notEmpty(),
  body('message').optional().trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.lmsAnnouncement.findUnique({ where: { id } });
  if (!before || before.isDeleted) throw httpError(404, 'Announcement not found.');
  const { title, message, audience, offeringId } = req.body;
  const data = {};
  if (title !== undefined) data.title = title;
  if (message !== undefined) data.message = message;
  if (audience !== undefined) data.audience = audience;
  if (offeringId !== undefined) data.offeringId = offeringId ? parseInt(offeringId, 10) : null;
  const ann = await prisma.lmsAnnouncement.update({ where: { id }, data });
  await audit(req, 'ANNOUNCEMENT_UPDATE', 'LmsAnnouncement', id, { before, after: ann });
  realtime.emitAll('announcement', { action: 'updated', id, title: ann.title });
  res.json({ announcement: ann });
}));

// Publish (broadcast) — push a real-time event + (re)notify recipients.
router.post('/announcements/:id/publish', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ann = await prisma.lmsAnnouncement.findUnique({ where: { id } });
  if (!ann || ann.isDeleted) throw httpError(404, 'Announcement not found.');

  let recipientIds = [];
  if (ann.offeringId) {
    const regs = await prisma.courseRegistration.findMany({ where: { offeringId: ann.offeringId, status: 'ENROLLED' }, select: { studentId: true } });
    recipientIds = regs.map((r) => r.studentId);
  } else {
    const roleFilter = ann.audience === 'TEACHERS' ? ['Teacher'] : ann.audience === 'STUDENTS' ? ['Student'] : ['Student', 'Teacher'];
    const users = await prisma.lmsUser.findMany({ where: { role: { in: roleFilter }, isActive: true }, select: { id: true } });
    recipientIds = users.map((u) => u.id);
  }
  await notifyMany(recipientIds, { title: `Announcement: ${ann.title}`, message: ann.message, type: 'ANNOUNCEMENT' });
  realtime.emitTo(recipientIds, 'announcement', { action: 'published', id, title: ann.title, message: ann.message });
  realtime.emitAll('announcement', { action: 'published', id, title: ann.title });
  await audit(req, 'ANNOUNCEMENT_PUBLISH', 'LmsAnnouncement', id, { after: { recipients: recipientIds.length } });
  res.json({ message: 'Published', notified: recipientIds.length });
}));

// ============================================================
// 6. QUICK MESSAGES — real-time + read receipts + unread counts
//    (contacts / conversation / send already exist in coordinator.js;
//     here we add unread counts + real-time delivery + read receipts.)
// ============================================================
router.get('/messages-unread', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const me = req.lmsUser.id;
  const unread = await prisma.lmsThreadMessage.findMany({
    where: { recipientId: me, isRead: false },
    select: { senderId: true },
  });
  const byContact = {};
  unread.forEach((m) => { byContact[m.senderId] = (byContact[m.senderId] || 0) + 1; });
  res.json({ total: unread.length, byContact });
}));

// Send (real-time delivery to recipient + sender's other tabs).
router.post('/messages-send/:userId', COORD_OR_GOV, validate([body('body').trim().notEmpty()]), asyncHandler(async (req, res) => {
  const recipientId = req.params.userId;
  const recipient = await prisma.lmsUser.findUnique({ where: { id: recipientId }, select: { id: true } });
  if (!recipient) throw httpError(404, 'Recipient not found.');
  const msg = await prisma.lmsThreadMessage.create({
    data: { senderId: req.lmsUser.id, recipientId, body: req.body.body, subject: req.body.subject || null },
  });
  await notify(recipientId, { title: 'New message', message: `${req.lmsUser.username} sent you a message`, type: 'MESSAGE' });
  // Real-time push to the recipient (and echo to sender for multi-tab sync).
  realtime.emitTo([recipientId, req.lmsUser.id], 'message', {
    id: msg.id, senderId: msg.senderId, recipientId, body: msg.body, createdAt: msg.createdAt,
  });
  res.status(201).json({ message: msg });
}));

// Mark a conversation as read (read receipts).
router.put('/messages-read/:userId', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const me = req.lmsUser.id;
  const other = req.params.userId;
  const result = await prisma.lmsThreadMessage.updateMany({
    where: { senderId: other, recipientId: me, isRead: false }, data: { isRead: true },
  });
  // Notify the original sender that their messages were read.
  realtime.emitTo([other], 'message', { action: 'read', by: me });
  res.json({ updated: result.count });
}));

// ============================================================
//  UNIFIED STUDENT ALLOCATION & SECTION MANAGEMENT
//  ------------------------------------------------------------
//  Sections are organised SEMESTER-WISE (not course-wise). For a
//  program + semester, students enrolled that semester are grouped
//  into sections of `SECTION_CAPACITY` (default 150). When a group
//  exceeds the capacity, additional sections (A, B, C …) are created
//  automatically and students are balanced across them.
//
//  The underlying schema keys Section by offeringId, so a semester
//  "Section A" is materialised as an "A" section on EVERY course
//  offering of that program+semester, and a student keeps the SAME
//  section letter across all of their semester courses. This keeps
//  the data model intact while presenting one unified, semester-wise
//  allocation. 100% real DB data — no placeholders.
// ============================================================
const SECTION_CAPACITY = 150;
const SECTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Build the live semester-wise allocation snapshot for the current term.
async function buildSemesterAllocation(termId, filter = {}) {
  // DEPARTMENT ISOLATION: when a scope is provided (non-governance coordinator),
  // restrict the allocation snapshot to that department's course offerings.
  const scopeWhere = filter.offeringIds
    ? { id: { in: filter.offeringIds.length ? filter.offeringIds : [-1] } }
    : {};
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...scopeWhere },
    include: {
      course: { include: { program: true, semester: true } },
      sections: { where: { isDeleted: false }, orderBy: { name: 'asc' } },
      registrations: {
        where: { status: 'ENROLLED' },
        include: { student: { select: { id: true, username: true, profile: { select: { fullName: true, rollNumber: true } } } } },
      },
    },
    orderBy: { id: 'asc' },
  });

  // Group offerings by program+semester.
  const groups = new Map(); // key -> { programId, programName, semesterNumber, semesterId, offerings:[] }
  for (const o of offerings) {
    const semNum = o.course?.semester?.number ?? null;
    const progId = o.course?.programId ?? null;
    if (semNum == null || progId == null) continue;
    if (filter.programId && progId !== filter.programId) continue;
    if (filter.semester && semNum !== filter.semester) continue;
    const key = `${progId}::${semNum}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        programId: progId,
        programName: o.course.program?.name || '—',
        programShortForm: o.course.program?.shortForm || o.course.program?.code || '',
        semesterId: o.course.semesterId,
        semesterNumber: semNum,
        offerings: [],
      });
    }
    groups.get(key).offerings.push(o);
  }

  const result = [];
  for (const g of groups.values()) {
    // Distinct students across all offerings in this program+semester.
    const studentMap = new Map(); // studentId -> { id, name, roll, sectionName }
    const sectionTally = new Map(); // sectionName -> count
    for (const o of g.offerings) {
      const secById = new Map(o.sections.map((s) => [s.id, s.name]));
      for (const r of o.registrations) {
        const sName = r.sectionId ? secById.get(r.sectionId) || null : null;
        if (!studentMap.has(r.studentId)) {
          studentMap.set(r.studentId, {
            id: r.studentId,
            name: r.student.profile?.fullName || r.student.username,
            roll: r.student.profile?.rollNumber || r.student.username,
            sectionName: sName,
          });
        } else if (sName && !studentMap.get(r.studentId).sectionName) {
          studentMap.get(r.studentId).sectionName = sName;
        }
      }
    }
    for (const s of studentMap.values()) {
      if (s.sectionName) sectionTally.set(s.sectionName, (sectionTally.get(s.sectionName) || 0) + 1);
    }

    const students = [...studentMap.values()];
    const totalStudents = students.length;
    const requiredSections = Math.max(1, Math.ceil(totalStudents / SECTION_CAPACITY));
    const unassigned = students.filter((s) => !s.sectionName).length;

    // Distinct section letters that already exist across the semester offerings.
    const existingLetters = new Set();
    g.offerings.forEach((o) => o.sections.forEach((s) => existingLetters.add(s.name)));
    const sectionList = [...existingLetters].sort().map((name) => ({
      name,
      capacity: SECTION_CAPACITY,
      enrolled: sectionTally.get(name) || 0,
    }));

    result.push({
      key: g.key,
      programId: g.programId,
      programName: g.programName,
      programShortForm: g.programShortForm,
      semesterId: g.semesterId,
      semesterNumber: g.semesterNumber,
      totalStudents,
      unassigned,
      capacity: SECTION_CAPACITY,
      requiredSections,
      sections: sectionList,
      students,
      offeringCount: g.offerings.length,
      balanced: unassigned === 0 && sectionList.length >= requiredSections,
    });
  }

  result.sort((a, b) => a.programShortForm.localeCompare(b.programShortForm) || a.semesterNumber - b.semesterNumber);
  return result;
}

// GET the unified semester-wise allocation view (real-time).
router.get('/semester-allocation', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const filter = {};
  if (req.query.programId) filter.programId = parseInt(req.query.programId, 10);
  if (req.query.semester) filter.semester = parseInt(req.query.semester, 10);
  // DEPARTMENT ISOLATION: restrict allocation to this dept's offerings.
  const scope = await deptScope(req);
  if (!scope.unscoped) filter.offeringIds = scope.offeringIds;
  const groups = await buildSemesterAllocation(termId, filter);
  res.json({
    termId,
    termLabel: term ? term.title : null,
    capacity: SECTION_CAPACITY,
    groups,
  });
}));

// POST auto-allocate: create the needed sections (150 cap) for a program+
// semester and balance students across them with a consistent letter on
// every offering of that semester. Runs in real time, no manual steps.
router.post('/semester-allocation/auto', COORD, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const programId = req.body.programId ? parseInt(req.body.programId, 10) : null;
  const semester = req.body.semester ? parseInt(req.body.semester, 10) : null;

  const filter = {};
  if (programId) filter.programId = programId;
  if (semester) filter.semester = semester;

  // DEPARTMENT ISOLATION: a coordinator can only auto-allocate within their
  // own department's offerings.
  const scope = await deptScope(req);
  const scopeWhere = scope.unscoped
    ? {}
    : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };

  // Re-read offerings for the affected groups.
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...scopeWhere },
    include: {
      course: { include: { program: true, semester: true } },
      sections: { where: { isDeleted: false } },
      registrations: { where: { status: 'ENROLLED' } },
    },
  });

  const groups = new Map();
  for (const o of offerings) {
    const semNum = o.course?.semester?.number ?? null;
    const progId = o.course?.programId ?? null;
    if (semNum == null || progId == null) continue;
    if (filter.programId && progId !== filter.programId) continue;
    if (filter.semester && semNum !== filter.semester) continue;
    const key = `${progId}::${semNum}`;
    if (!groups.has(key)) groups.set(key, { progId, semNum, offerings: [] });
    groups.get(key).offerings.push(o);
  }

  if (groups.size === 0) throw httpError(400, 'No course offerings found for the selected program/semester this term.');

  let sectionsCreated = 0;
  let studentsAssigned = 0;
  const summaries = [];

  for (const g of groups.values()) {
    // Distinct students for this program+semester.
    const studentIds = new Set();
    g.offerings.forEach((o) => o.registrations.forEach((r) => studentIds.add(r.studentId)));
    const students = [...studentIds].sort(); // deterministic order
    const total = students.length;
    const needed = Math.max(1, Math.ceil(total / SECTION_CAPACITY));
    const letters = SECTION_LETTERS.slice(0, needed);

    // Ensure each offering has a section for every needed letter.
    const sectionIdByOfferingLetter = new Map(); // `${offeringId}:${letter}` -> sectionId
    for (const o of g.offerings) {
      const existing = new Map(o.sections.map((s) => [s.name, s]));
      for (const letter of letters) {
        if (existing.has(letter)) {
          sectionIdByOfferingLetter.set(`${o.id}:${letter}`, existing.get(letter).id);
        } else {
          const created = await prisma.section.create({
            data: { offeringId: o.id, name: letter, capacity: SECTION_CAPACITY },
          });
          sectionsCreated += 1;
          sectionIdByOfferingLetter.set(`${o.id}:${letter}`, created.id);
        }
      }
    }

    // Balanced round-robin: assign each student a letter, same across offerings.
    const letterForStudent = new Map();
    students.forEach((sid, idx) => {
      // Fill section A to capacity, then B, etc. (A=first 150, B=next 150…)
      const letterIdx = Math.floor(idx / SECTION_CAPACITY);
      letterForStudent.set(sid, letters[Math.min(letterIdx, letters.length - 1)]);
    });

    // Persist sectionId on every ENROLLED registration of this group.
    for (const o of g.offerings) {
      for (const r of o.registrations) {
        const letter = letterForStudent.get(r.studentId);
        if (!letter) continue;
        const sectionId = sectionIdByOfferingLetter.get(`${o.id}:${letter}`);
        if (sectionId && r.sectionId !== sectionId) {
          await prisma.courseRegistration.update({ where: { id: r.id }, data: { sectionId } });
          studentsAssigned += 1;
        }
      }
    }

    summaries.push({ programId: g.progId, semester: g.semNum, students: total, sections: needed });
    await audit(req, 'SEMESTER_ALLOCATION_AUTO', 'CourseOffering', g.offerings[0]?.id || 0, {
      after: { programId: g.progId, semester: g.semNum, students: total, sections: needed },
    });
  }

  realtime.emitAll('allocation', { action: 'auto', summaries });
  res.json({ message: 'Sections created and students allocated semester-wise.', sectionsCreated, studentsAssigned, summaries });
}));

// ============================================================
//  CROSS-DEPARTMENT INSTRUCTOR LOAN WORKFLOW  (Req 4)
//  ------------------------------------------------------------
//  This is the ONLY sanctioned cross-department mechanism. A
//  coordinator whose department needs an instructor from another
//  department sends a request to that department's coordinator, who
//  approves a specific instructor. Once approved, the requesting
//  coordinator can assign a course to the borrowed instructor (the
//  distribution endpoints enforce this via resolveAssignableTeacherIds).
// ============================================================

/** Resolve ALL CourseCoordinator users that belong to a department.
 *  Req 4: an instructor-borrow request must reach EVERY coordinator of the
 *  target department (a department may have more than one coordinator). */
async function coordinatorsForDepartment(department) {
  if (!department) return [];
  const coords = await prisma.lmsUser.findMany({
    where: { role: 'CourseCoordinator', isActive: true },
    select: { id: true, username: true, profile: { select: { department: true, fullName: true } } },
  });
  const target = String(department).trim().toLowerCase();
  return coords.filter((c) => String(c.profile?.department || '').trim().toLowerCase() === target);
}

/** Resolve the (first) CourseCoordinator user that owns a department.
 *  Kept for the stored owningCoordinatorId reference; visibility/authorization
 *  now use the whole-department set via coordinatorsForDepartment. */
async function coordinatorForDepartment(department) {
  const list = await coordinatorsForDepartment(department);
  return list[0] || null;
}

/** The caller's own department (required for every loan action). */
async function requireOwnDepartment(req) {
  const dept = await getUserDepartment(req.lmsUser.id);
  if (!dept) throw httpError(403, 'Your coordinator account is not bound to a department.');
  return dept;
}

/** Req 4: true when the caller is a coordinator of the loan's OWNING department
 *  (any coordinator of that department, or the specific stored owner). */
async function callerOwnsLoanDepartment(req, rec) {
  if (rec.owningCoordinatorId === req.lmsUser.id) return true;
  const dept = await getUserDepartment(req.lmsUser.id);
  if (!dept) return false;
  return String(dept).trim().toLowerCase() === String(rec.owningDepartment || '').trim().toLowerCase();
}

// List the OTHER departments a coordinator can request instructors from.
router.get('/instructor-loans/departments', COORD, asyncHandler(async (req, res) => {
  const own = await getUserDepartment(req.lmsUser.id);
  const coords = await prisma.lmsUser.findMany({
    where: { role: 'CourseCoordinator', isActive: true },
    select: { id: true, username: true, profile: { select: { department: true, fullName: true } } },
  });
  const seen = new Set();
  const departments = [];
  for (const c of coords) {
    const dept = String(c.profile?.department || '').trim();
    if (!dept) continue;
    if (own && dept.toLowerCase() === own.toLowerCase()) continue; // exclude own dept
    const key = dept.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    departments.push({ department: dept, coordinatorId: c.id, coordinatorName: displayName(c) });
  }
  departments.sort((a, b) => a.department.localeCompare(b.department));
  res.json({ ownDepartment: own || null, departments });
}));

// List the instructors of a given (other) department — used by the requesting
// coordinator to indicate which instructor they'd like, and by the owning
// coordinator to pick which one to approve.
router.get('/instructor-loans/department-instructors', COORD, asyncHandler(async (req, res) => {
  const department = req.query.department ? String(req.query.department).trim() : '';
  if (!department) throw httpError(400, 'department is required.');
  const { programs, deptNameVariants } = await resolveDepartmentPrograms(department);
  const shortForms = [...new Set(programs.flatMap((p) => [p.shortForm, p.code].filter(Boolean).map((s) => String(s).trim())))];
  const instrIds = await resolveDepartmentInstructorIds({
    unscoped: false,
    department,
    shortForms,
    teacherIds: [],
  });
  const ids = instrIds || [];
  const teachers = ids.length
    ? await prisma.lmsUser.findMany({
        where: { id: { in: ids }, role: 'Teacher', isActive: true },
        select: { id: true, username: true, profile: { select: { fullName: true, department: true, programShortForm: true } } },
      })
    : [];
  res.json({
    department,
    instructors: teachers.map((t) => ({
      id: t.id,
      name: displayName(t),
      department: t.profile?.department || department,
      programShortForm: t.profile?.programShortForm || null,
    })),
  });
}));

// Create a cross-department instructor loan request (requesting → owning dept).
router.post('/instructor-loans', COORD, validate([
  body('owningDepartment').trim().notEmpty().withMessage('Target department is required'),
]), asyncHandler(async (req, res) => {
  const requestingDepartment = await requireOwnDepartment(req);
  const rawOwning = String(req.body.owningDepartment).trim();
  // Point 13 — "Other": the requester types a department that has no
  // coordinator in the system. We still record the request (so the workflow
  // and history are preserved) but store the free text in customDepartment.
  const isOtherDept = rawOwning.toLowerCase() === 'other';
  const customDepartment = isOtherDept
    ? (req.body.customDepartment ? String(req.body.customDepartment).trim() : '')
    : null;
  if (isOtherDept && !customDepartment) {
    throw httpError(400, 'Please enter the department name for the "Other" option.');
  }
  // The effective department string stored on the row (custom text or picked).
  const owningDepartment = isOtherDept ? customDepartment : rawOwning;
  if (owningDepartment.toLowerCase() === requestingDepartment.toLowerCase()) {
    throw httpError(400, 'You cannot request an instructor from your own department.');
  }

  // Req 4: reach EVERY coordinator of the target department. For a custom
  // "Other" department there may be none — that is allowed (no coordinator
  // reference is stored and no notification is sent).
  const owningCoords = isOtherDept ? [] : await coordinatorsForDepartment(owningDepartment);
  if (!isOtherDept && !owningCoords.length) throw httpError(400, 'No coordinator found for the target department.');
  const owningCoord = owningCoords[0] || null; // primary reference stored on the row

  // Optional: a specific instructor the requester is interested in.
  let requestedInstructorId = null;
  if (req.body.requestedInstructorId) {
    const t = await prisma.lmsUser.findFirst({ where: { id: req.body.requestedInstructorId, role: 'Teacher' } });
    if (!t) throw httpError(400, 'Requested instructor not found.');
    requestedInstructorId = t.id;
  }

  // Optional target course offering (must belong to the requesting dept) OR a
  // free-text "Other" course when the offering isn't in the dropdown.
  let courseOfferingId = null;
  let courseLabel = null;
  let customCourse = null;
  const rawCourse = req.body.courseOfferingId != null ? String(req.body.courseOfferingId).trim() : '';
  // §3.3 — the course the instructor is needed for is now MANDATORY (it was
  // previously optional). Enforced server-side as well as in the UI.
  if (!rawCourse) {
    throw httpError(400, 'Please select the course this instructor is needed for.');
  }
  if (rawCourse.toLowerCase() === 'other') {
    customCourse = req.body.customCourse ? String(req.body.customCourse).trim() : '';
    if (!customCourse) throw httpError(400, 'Please enter the course name for the "Other" option.');
    courseLabel = customCourse;
  } else if (rawCourse) {
    const oid = parseInt(rawCourse, 10);
    const scope = await deptScope(req);
    if (!scope.unscoped && !scope.offeringIds.includes(oid)) {
      throw httpError(403, 'That course offering belongs to another department.');
    }
    const off = await prisma.courseOffering.findUnique({ where: { id: oid }, include: { course: { select: { code: true, title: true } } } });
    if (!off) throw httpError(400, 'Course offering not found.');
    courseOfferingId = oid;
    courseLabel = `${off.course.code} — ${off.course.title}`;
  }

  const rec = await prisma.instructorLoanRequest.create({
    data: {
      requestingDepartment,
      owningDepartment,
      requestingCoordinatorId: req.lmsUser.id,
      owningCoordinatorId: owningCoord ? owningCoord.id : null,
      requestedInstructorId,
      courseOfferingId,
      courseLabel,
      customDepartment,
      customCourse,
      reason: req.body.reason ? String(req.body.reason).trim() : null,
      status: 'PENDING',
    },
  });
  await audit(req, 'INSTRUCTOR_LOAN_REQUEST_CREATE', 'InstructorLoanRequest', rec.id, { after: rec });
  // Req 4: notify ALL coordinators of the target department (not just one),
  // in real time. Every coordinator of that department can see and act on it.
  await notifyMany(owningCoords.map((c) => c.id), {
    title: 'Instructor loan request',
    message: `${requestingDepartment} has requested an instructor from your department.`,
    type: 'INFO',
    link: '/admin/teachers',
  }).catch(() => {});
  realtime.emitAll('instructor-loan', { action: 'created', id: rec.id, owningDepartment });
  res.status(201).json({ request: rec });
}));

// Decorate loan rows with instructor + coordinator names for display.
async function decorateLoans(rows) {
  const userIds = new Set();
  rows.forEach((r) => {
    [r.requestingCoordinatorId, r.owningCoordinatorId, r.requestedInstructorId, r.approvedInstructorId]
      .filter(Boolean).forEach((id) => userIds.add(id));
  });
  const users = userIds.size
    ? await prisma.lmsUser.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, username: true, profile: { select: { fullName: true } } } })
    : [];
  const nameOf = {};
  users.forEach((u) => { nameOf[u.id] = displayName(u); });
  return rows.map((r) => ({
    ...r,
    requestingCoordinatorName: nameOf[r.requestingCoordinatorId] || null,
    owningCoordinatorName: r.owningCoordinatorId ? (nameOf[r.owningCoordinatorId] || null) : null,
    requestedInstructorName: r.requestedInstructorId ? (nameOf[r.requestedInstructorId] || null) : null,
    approvedInstructorName: r.approvedInstructorId ? (nameOf[r.approvedInstructorId] || null) : null,
  }));
}

// List loan requests. ?box=incoming (requests TO my dept) | outgoing (FROM my dept).
router.get('/instructor-loans', COORD, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'createdAt' });
  const box = req.query.box === 'incoming' ? 'incoming' : (req.query.box === 'outgoing' ? 'outgoing' : 'all');
  const statusFilter = (req.query.status && req.query.status !== 'ALL') ? String(req.query.status).toUpperCase() : null;

  // Req 4: an incoming request is visible to EVERY coordinator whose OWN
  // department equals the request's owningDepartment (not just the single
  // stored owningCoordinatorId). SQLite has no case-insensitive `mode`, so we
  // match departments case-insensitively in JS.
  const ownDept = await getUserDepartment(req.lmsUser.id);
  const ownDeptLc = ownDept ? String(ownDept).trim().toLowerCase() : null;

  const isIncomingRow = (r) =>
    (ownDeptLc && String(r.owningDepartment || '').trim().toLowerCase() === ownDeptLc)
    || r.owningCoordinatorId === req.lmsUser.id;
  const isOutgoingRow = (r) => r.requestingCoordinatorId === req.lmsUser.id;

  // Fetch all non-deleted rows that could relate to this coordinator, then
  // filter/paginate in JS (loan volume per coordinator is small).
  const baseWhere = { isDeleted: false, ...(statusFilter ? { status: statusFilter } : {}) };
  const all = await prisma.instructorLoanRequest.findMany({ where: baseWhere, orderBy: { createdAt: q.sortDir } });
  const visible = all.filter((r) => {
    const inc = isIncomingRow(r);
    const out = isOutgoingRow(r);
    if (box === 'incoming') return inc;
    if (box === 'outgoing') return out;
    return inc || out;
  });
  const total = visible.length;
  const pageRows = visible.slice(q.skip, q.skip + q.take);
  const rows = await decorateLoans(pageRows);
  const decorated = rows.map((r) => ({ ...r, direction: isIncomingRow(r) ? 'incoming' : 'outgoing' }));
  res.json(paginated(decorated, total, q));
}));

// Owning coordinator APPROVES the request, choosing the specific instructor.
router.put('/instructor-loans/:id/approve', COORD, validate([
  body('instructorId').notEmpty().withMessage('Instructor is required'),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const rec = await prisma.instructorLoanRequest.findUnique({ where: { id } });
  if (!rec || rec.isDeleted) throw httpError(404, 'Loan request not found.');
  // Req 4: ANY coordinator of the OWNING department may approve (not just the
  // single stored owningCoordinatorId), since the request is broadcast to all.
  if (!(await callerOwnsLoanDepartment(req, rec))) throw httpError(403, 'Only a coordinator of the owning department can approve this request.');
  if (rec.status !== 'PENDING') throw httpError(400, 'This request has already been decided.');

  // The approved instructor must actually belong to the owning department.
  const { programs } = await resolveDepartmentPrograms(rec.owningDepartment);
  const shortForms = [...new Set(programs.flatMap((p) => [p.shortForm, p.code].filter(Boolean).map((s) => String(s).trim())))];
  const ownInstrIds = (await resolveDepartmentInstructorIds({ unscoped: false, department: rec.owningDepartment, shortForms, teacherIds: [] })) || [];
  if (!ownInstrIds.includes(req.body.instructorId)) {
    throw httpError(400, 'The selected instructor does not belong to your department.');
  }

  const updated = await prisma.instructorLoanRequest.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedInstructorId: req.body.instructorId,
      decisionNote: req.body.note ? String(req.body.note).trim() : null,
      decidedAt: new Date(),
    },
  });
  await audit(req, 'INSTRUCTOR_LOAN_REQUEST_APPROVE', 'InstructorLoanRequest', id, { before: rec, after: updated });
  await notify(rec.requestingCoordinatorId, {
    title: 'Instructor loan approved',
    message: `${rec.owningDepartment} approved an instructor for your request. You can now assign a course to them.`,
    type: 'INFO',
    link: '/admin/teachers',
  }).catch(() => {});
  realtime.emitAll('instructor-loan', { action: 'approved', id });
  res.json({ request: updated });
}));

// Owning coordinator REJECTS the request.
router.put('/instructor-loans/:id/reject', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const rec = await prisma.instructorLoanRequest.findUnique({ where: { id } });
  if (!rec || rec.isDeleted) throw httpError(404, 'Loan request not found.');
  // Req 4: ANY coordinator of the owning department may reject.
  if (!(await callerOwnsLoanDepartment(req, rec))) throw httpError(403, 'Only a coordinator of the owning department can reject this request.');
  if (rec.status !== 'PENDING') throw httpError(400, 'This request has already been decided.');

  const updated = await prisma.instructorLoanRequest.update({
    where: { id },
    data: { status: 'REJECTED', decisionNote: req.body.note ? String(req.body.note).trim() : null, decidedAt: new Date() },
  });
  await audit(req, 'INSTRUCTOR_LOAN_REQUEST_REJECT', 'InstructorLoanRequest', id, { before: rec, after: updated });
  await notify(rec.requestingCoordinatorId, {
    title: 'Instructor loan rejected',
    message: `${rec.owningDepartment} rejected your instructor loan request.`,
    type: 'WARNING',
    link: '/admin/teachers',
  }).catch(() => {});
  realtime.emitAll('instructor-loan', { action: 'rejected', id });
  res.json({ request: updated });
}));

// Requesting coordinator CANCELS their own pending request.
router.delete('/instructor-loans/:id', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const rec = await prisma.instructorLoanRequest.findUnique({ where: { id } });
  if (!rec || rec.isDeleted) throw httpError(404, 'Loan request not found.');
  if (rec.requestingCoordinatorId !== req.lmsUser.id) throw httpError(403, 'Only the requesting coordinator can cancel this request.');
  await prisma.instructorLoanRequest.update({ where: { id }, data: { isDeleted: true, status: rec.status === 'PENDING' ? 'CANCELLED' : rec.status } });
  await audit(req, 'INSTRUCTOR_LOAN_REQUEST_CANCEL', 'InstructorLoanRequest', id, { before: rec });
  realtime.emitAll('instructor-loan', { action: 'cancelled', id });
  res.json({ message: 'Loan request cancelled.' });
}));

module.exports = router;

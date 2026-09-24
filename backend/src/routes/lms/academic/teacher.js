// ============================================================
//  TEACHER MODULE ROUTES  — /api/lms/academic/teacher/*
//  ------------------------------------------------------------
//  All endpoints require an authenticated LmsUser with role Teacher
//  (CourseCoordinator may also act as a teacher for monitoring; we
//  allow Teacher only here and expose coordinator monitoring later).
//
//  Covers: Course Management, Attendance Management, Assignment
//  Creation & Grading, Quiz Management, Result Management, Gradebook.
// ============================================================
const express = require('express');
const { body } = require('express-validator');
const prisma = require('../../../utils/prisma');
const { lmsAuth, lmsRequireRole } = require('../../../middleware/lmsAuth');
const { validate } = require('../../../middleware/validate');
const { asyncHandler, paginated, parseListQuery, httpError, safeJson } = require('../../../utils/lmsHelpers');
const { creditLabel } = require('../../../utils/lmsCredit');
const { audit } = require('../../../utils/lmsAudit');
const academic = require('../../../services/academicService');
const { buildResultGrades, resolveOfferingWeights, isImmutableStatus } = require('../../../utils/lmsGrading');
const lifecycle = require('../../../services/resultLifecycle');
const { slotsFromWeightage } = require('../../../utils/academicPolicy');
const { uploadLmsMaterial, uploadLmsLectureFallback, uploadLmsLibrary, uploadLmsAvatar, uploadLmsMessage, uploadLmsSubmission } = require('../../../middleware/upload');
const { notify } = require('../../../utils/lmsNotify');
const bbb = require('../../../utils/bbb');
const ai = require('../../../utils/aiGenerate');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const realtime = require('../../../utils/lmsRealtime');

const router = express.Router();

// Strong-password policy (matches the LMS auth policy in lmsAuthV2.js):
// min 8 chars, ≥1 uppercase, ≥1 number, ≥1 special character.
const STRONG_PW = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// ============================================================
// REAL-TIME EVENT STREAM (SSE)  — GET /teacher/events?token=<jwt>
// Registered BEFORE the auth middleware because EventSource cannot send
// Authorization headers; the JWT is validated here from the query string.
// Powers live updates for assignment statistics, messages, etc. (Req 9/10).
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
  const wasOffline = !realtime.isOnline(userId);
  realtime.addClient(userId, res);
  // Announce presence to everyone (clients filter to their own contacts).
  if (wasOffline) realtime.emitAll('presence', { userId, online: true });

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) { /* closed */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    realtime.removeClient(userId, res);
    if (!realtime.isOnline(userId)) realtime.emitAll('presence', { userId, online: false });
  });
}));

router.use(lmsAuth);
router.use(lmsRequireRole('Teacher', 'CourseCoordinator'));

// Gradebook PIN (5 digits). Required before marks/gradebook APIs.
router.get('/gradebook-pin/status', asyncHandler(async (req, res) => {
  res.json(await lifecycle.pinStatus(req.lmsUser.id));
}));

router.post('/gradebook-pin', asyncHandler(async (req, res) => {
  const out = await lifecycle.setPin(req, {
    pin: req.body.pin,
    confirmPin: req.body.confirmPin,
    currentPin: req.body.currentPin,
  });
  res.json(out);
}));

router.post('/gradebook-pin/verify', asyncHandler(async (req, res) => {
  await lifecycle.verifyPin(req.lmsUser.id, req.body.pin);
  const token = lifecycle.issueGradebookToken(req.lmsUser);
  await audit(req, 'GRADEBOOK_ACCESSED', 'LmsUser', req.lmsUser.id, {});
  res.json({ token, expiresIn: 1800 });
}));

// --- helper: ensure the current teacher owns the offering ---
async function getOwnedOffering(req, offeringId) {
  const offering = await prisma.courseOffering.findFirst({
    where: { id: offeringId, isDeleted: false },
    include: { course: true, term: true },
  });
  if (!offering) throw httpError(404, 'Offering not found');
  // CourseCoordinator can access any offering for monitoring; Teacher only own.
  if (req.lmsUser.role === 'Teacher' && offering.teacherId !== req.lmsUser.id) {
    throw httpError(403, 'You are not assigned to this course offering');
  }
  return offering;
}

function offeringWhereForTeacher(req) {
  if (req.lmsUser.role === 'CourseCoordinator') return { isDeleted: false };
  return { isDeleted: false, teacherId: req.lmsUser.id };
}

async function coordinatorCounts(offering) {
  const { counts } = await lifecycle.loadWeightage(offering);
  return counts || { assignment: 0, quiz: 0, lab: 0, project: 0, mid: 0, final: 0 };
}

function requireGradebookPin(req) {
  return lifecycle.requireGradebook(req);
}

async function assertOfferingUnlocked(offeringId) {
  return lifecycle.assertOfferingMutable(offeringId);
}

// ============================================================
// DASHBOARD
// ============================================================
router.get('/dashboard', asyncHandler(async (req, res) => {
  const where = offeringWhereForTeacher(req);
  const offerings = await prisma.courseOffering.findMany({
    where,
    include: {
      course: true, term: true,
      _count: { select: { registrations: true, assignments: true, quizzes: true } },
    },
    orderBy: { id: 'desc' },
  });
  const offeringIds = offerings.map((o) => o.id);
  const [totalStudents, pendingGrading, pendingQuizGrading, recentSubmissions] = await Promise.all([
    prisma.courseRegistration.count({ where: { offeringId: { in: offeringIds }, status: 'ENROLLED' } }),
    prisma.assignmentSubmission.count({
      where: { assignment: { offeringId: { in: offeringIds } }, status: { in: ['SUBMITTED', 'LATE'] }, marks: null },
    }),
    prisma.quizAttempt.count({
      where: { quiz: { offeringId: { in: offeringIds } }, status: 'SUBMITTED' },
    }),
    prisma.assignmentSubmission.findMany({
      where: { assignment: { offeringId: { in: offeringIds } } },
      include: {
        assignment: { include: { offering: { include: { course: true } } } },
        student: { include: { profile: true } },
      },
      orderBy: { submittedAt: 'desc' },
      take: 10,
    }),
  ]);
  res.json({
    stats: {
      offeringsCount: offerings.length,
      totalStudents,
      pendingGrading,
      pendingQuizGrading,
    },
    offerings,
    recentSubmissions,
  });
}));

// ============================================================
// MY COURSES (offerings)
// ============================================================
router.get('/offerings', asyncHandler(async (req, res) => {
  const where = offeringWhereForTeacher(req);
  if (req.query.termId) where.termId = parseInt(req.query.termId, 10);
  const offerings = await prisma.courseOffering.findMany({
    where,
    include: {
      course: { include: { program: true, semester: true } },
      term: true,
      sections: { where: { isDeleted: false } },
      // labTasks count powers the separate Lab Card (Req 1.1) shown for every
      // course whose LmsCourse.hasLab === true.
      _count: { select: { registrations: true, assignments: true, quizzes: true, materials: true, labTasks: true } },
    },
    orderBy: { id: 'desc' },
  });
  res.json({ offerings });
}));

router.get('/offerings/:id', asyncHandler(async (req, res) => {
  const offering = await getOwnedOffering(req, parseInt(req.params.id, 10));
  const full = await prisma.courseOffering.findUnique({
    where: { id: offering.id },
    include: {
      course: { include: { program: true, semester: true } },
      term: true,
      sections: { where: { isDeleted: false }, include: { _count: { select: { registrations: true } } } },
      _count: { select: { registrations: true, assignments: true, quizzes: true, materials: true } },
    },
  });
  res.json({ offering: full });
}));

// Roster of students in an offering
router.get('/offerings/:id/students', asyncHandler(async (req, res) => {
  await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const regs = await prisma.courseRegistration.findMany({
    where: { offeringId, status: { in: ['ENROLLED', 'COMPLETED'] } },
    include: {
      student: { include: { profile: true } },
      section: true,
    },
    orderBy: { registeredAt: 'asc' },
  });
  const students = regs.map((r) => {
    const p = r.student.profile || {};
    return {
      registrationId: r.id,
      studentId: r.studentId,
      username: r.student.username,
      rollNumber: r.student.linkedRollNumber,
      name: p.fullName || r.student.username,
      fatherName: p.fatherName || null,
      cnic: p.cnic || null,
      phone: p.phone || null,
      whatsapp: p.whatsapp || null,
      email: p.email || null,
      gender: p.gender || null,
      dateOfBirth: p.dateOfBirth || null,
      address: p.address || null,
      program: p.program || null,
      photoUrl: p.photoUrl || null,
      section: r.section ? r.section.name : null,
      registrationType: r.registrationType,
      status: r.status,
    };
  });
  res.json({ students });
}));

// ============================================================
// ATTENDANCE MANAGEMENT
// ============================================================
// List sessions for an offering
router.get('/offerings/:id/attendance/sessions', asyncHandler(async (req, res) => {
  await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const sessions = await prisma.attendanceSession.findMany({
    where: { offeringId },
    include: { _count: { select: { records: true } } },
    orderBy: { date: 'desc' },
  });
  res.json({ sessions });
}));

// Create a session
router.post('/offerings/:id/attendance/sessions', validate([
  body('date').trim().notEmpty().withMessage('Session date is required'),
]), asyncHandler(async (req, res) => {
  await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const { date, topic, durationMin } = req.body;
  const session = await prisma.attendanceSession.create({
    data: { offeringId, date: date.trim(), topic: topic || null, durationMin: durationMin ? parseInt(durationMin, 10) : 60 },
  });
  await audit(req, 'ATTENDANCE_SESSION_CREATE', 'AttendanceSession', session.id, { after: session });
  res.status(201).json({ session });
}));

// Get a session with current records merged against full roster
router.get('/attendance/sessions/:sessionId', asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    include: { records: true },
  });
  if (!session) throw httpError(404, 'Session not found');
  await getOwnedOffering(req, session.offeringId);
  const regs = await prisma.courseRegistration.findMany({
    where: { offeringId: session.offeringId, status: 'ENROLLED' },
    include: { student: { include: { profile: true } } },
  });
  const recMap = {};
  for (const r of session.records) recMap[r.studentId] = r;
  const roster = regs.map((r) => ({
    studentId: r.studentId,
    name: r.student.profile ? r.student.profile.fullName : r.student.username,
    rollNumber: r.student.linkedRollNumber,
    status: recMap[r.studentId] ? recMap[r.studentId].status : 'PRESENT',
    remarks: recMap[r.studentId] ? recMap[r.studentId].remarks : null,
  }));
  res.json({ session: { id: session.id, date: session.date, topic: session.topic, durationMin: session.durationMin }, roster });
}));

// Mark/update attendance for a session (bulk upsert)
router.post('/attendance/sessions/:sessionId/mark', validate([
  body('records').isArray({ min: 1 }).withMessage('records[] is required'),
]), asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  const session = await prisma.attendanceSession.findUnique({ where: { id: sessionId } });
  if (!session) throw httpError(404, 'Session not found');
  await getOwnedOffering(req, session.offeringId);
  const valid = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'];
  const records = req.body.records;
  const ops = [];
  for (const rec of records) {
    if (!rec.studentId || !valid.includes(rec.status)) continue;
    ops.push(
      prisma.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId: rec.studentId } },
        update: { status: rec.status, remarks: rec.remarks || null },
        create: { sessionId, studentId: rec.studentId, status: rec.status, remarks: rec.remarks || null },
      })
    );
  }
  await prisma.$transaction(ops);
  await audit(req, 'ATTENDANCE_MARK', 'AttendanceSession', sessionId, { after: { count: ops.length } });
  res.json({ message: `Attendance saved for ${ops.length} student(s)` });
}));

// Attendance summary for an offering (per-student percentages)
router.get('/offerings/:id/attendance/summary', asyncHandler(async (req, res) => {
  await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const regs = await prisma.courseRegistration.findMany({
    where: { offeringId, status: 'ENROLLED' },
    include: { student: { include: { profile: true } } },
  });
  const rows = [];
  for (const r of regs) {
    // eslint-disable-next-line no-await-in-loop
    const sum = await academic.attendanceSummary(offeringId, r.studentId);
    rows.push({
      studentId: r.studentId,
      name: r.student.profile ? r.student.profile.fullName : r.student.username,
      rollNumber: r.student.linkedRollNumber,
      present: sum.present, absent: sum.absent, late: sum.late, leave: sum.leave,
      percentage: sum.percentage,
    });
  }
  const overall = await academic.attendanceSummary(offeringId);
  res.json({ totalSessions: overall.totalSessions, rows });
}));

// ============================================================
// ASSIGNMENTS — create / list / grade
// ============================================================
router.get('/offerings/:id/assignments', asyncHandler(async (req, res) => {
  await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const assignments = await prisma.assignment2.findMany({
    where: { offeringId, isDeleted: false },
    include: { _count: { select: { submissions: true } } },
    orderBy: { dueDate: 'desc' },
  });
  res.json({ assignments });
}));

router.post('/offerings/:id/assignments', validate([
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('dueDate').trim().notEmpty().withMessage('Due date is required'),
]), asyncHandler(async (req, res) => {
  const offering = await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const counts = await coordinatorCounts(offering);
  if (counts.assignment <= 0) throw httpError(400, 'The Course Coordinator has not configured Assignments for this course.');
  const existing = await prisma.assignment2.count({ where: { offeringId, isDeleted: false } });
  if (existing >= counts.assignment) throw httpError(400, `Coordinator configured ${counts.assignment} assignment(s). You cannot create more.`);
  const { title, description, totalMarks, dueDate, startTime, endTime, allowLate, isPublished } = req.body;
  const assignment = await prisma.assignment2.create({
    data: {
      offeringId,
      title: title.trim(),
      description: description || null,
      totalMarks: totalMarks != null ? parseFloat(totalMarks) : 100,
      dueDate: dueDate.trim(),
      startTime: startTime || null,
      endTime: endTime || null,
      allowLate: allowLate != null ? !!allowLate : true,
      isPublished: isPublished != null ? !!isPublished : true,
    },
  });
  // Notify enrolled students when published.
  if (assignment.isPublished) {
    const regs = await prisma.courseRegistration.findMany({ where: { offeringId, status: 'ENROLLED' }, select: { studentId: true } });
    for (const r of regs) await notify(r.studentId, { title: 'New assignment posted', message: assignment.title, type: 'ASSIGNMENT', link: '/student/assignments' });
  }
  await audit(req, 'ASSIGNMENT_CREATE', 'Assignment2', assignment.id, { after: assignment });
  res.status(201).json({ assignment });
}));

router.put('/assignments/:assignmentId', asyncHandler(async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const before = await prisma.assignment2.findUnique({ where: { id: assignmentId } });
  if (!before) throw httpError(404, 'Assignment not found');
  await getOwnedOffering(req, before.offeringId);
  const { title, description, totalMarks, dueDate, startTime, endTime, allowLate, isPublished } = req.body;
  const assignment = await prisma.assignment2.update({
    where: { id: assignmentId },
    data: {
      title: title ?? before.title,
      description: description ?? before.description,
      totalMarks: totalMarks != null ? parseFloat(totalMarks) : before.totalMarks,
      dueDate: dueDate ?? before.dueDate,
      startTime: startTime !== undefined ? (startTime || null) : before.startTime,
      endTime: endTime !== undefined ? (endTime || null) : before.endTime,
      allowLate: allowLate != null ? !!allowLate : before.allowLate,
      isPublished: isPublished != null ? !!isPublished : before.isPublished,
    },
  });
  await audit(req, 'ASSIGNMENT_UPDATE', 'Assignment2', assignmentId, { before, after: assignment });
  res.json({ assignment });
}));

router.delete('/assignments/:assignmentId', asyncHandler(async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const before = await prisma.assignment2.findUnique({ where: { id: assignmentId } });
  if (!before) throw httpError(404, 'Assignment not found');
  await getOwnedOffering(req, before.offeringId);
  const assignment = await prisma.assignment2.update({
    where: { id: assignmentId },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await audit(req, 'ASSIGNMENT_DELETE', 'Assignment2', assignmentId, { after: assignment });
  res.json({ message: 'Assignment deleted', assignment });
}));

// Submissions for an assignment (for grading)
router.get('/assignments/:assignmentId/submissions', asyncHandler(async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const assignment = await prisma.assignment2.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw httpError(404, 'Assignment not found');
  await getOwnedOffering(req, assignment.offeringId);
  const subs = await prisma.assignmentSubmission.findMany({
    where: { assignmentId },
    include: { student: { include: { profile: true } } },
    orderBy: { submittedAt: 'asc' },
  });
  res.json({ assignment, submissions: subs });
}));

// Grade a single submission
router.put('/submissions/:submissionId/grade', validate([
  body('marks').isFloat({ min: 0 }).withMessage('marks must be a number >= 0'),
]), asyncHandler(async (req, res) => {
  const submissionId = parseInt(req.params.submissionId, 10);
  const sub = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    include: { assignment: true },
  });
  if (!sub) throw httpError(404, 'Submission not found');
  await getOwnedOffering(req, sub.assignment.offeringId);
  const marks = parseFloat(req.body.marks);
  if (marks > sub.assignment.totalMarks) throw httpError(400, `Marks cannot exceed ${sub.assignment.totalMarks}`);
  const updated = await prisma.assignmentSubmission.update({
    where: { id: submissionId },
    data: {
      marks,
      feedback: req.body.feedback || null,
      status: 'GRADED',
      gradedById: req.lmsUser.id,
      gradedAt: new Date(),
    },
  });
  await audit(req, 'SUBMISSION_GRADE', 'AssignmentSubmission', submissionId, { after: { marks } });
  realtime.emitTo(sub.studentId, 'result', { action: 'assignment-graded', offeringId: sub.assignment.offeringId });
  res.json({ submission: updated });
}));

// ============================================================
// LAB TASKS (Lab Management — Req 1.2 / 1.3)
//  Teacher module: upload lab tasks, review submissions, upload marks.
//  Lab tasks exist ONLY for offerings whose course has a Lab component
//  (LmsCourse.hasLab === true). The number of lab tasks is NOT fixed —
//  the teacher may create as many as required. Everything is organised /
//  filterable by Semester, Section and Program. Marks uploaded here are
//  visible to the student, Focal Person and Results in real time.
// ============================================================

// Ensure an offering belongs to the teacher AND its course has a lab.
async function getOwnedLabOffering(req, offeringId) {
  const offering = await prisma.courseOffering.findFirst({
    where: { id: offeringId, isDeleted: false },
    include: { course: true, term: true },
  });
  if (!offering) throw httpError(404, 'Offering not found');
  if (req.lmsUser.role === 'Teacher' && offering.teacherId !== req.lmsUser.id) {
    throw httpError(403, 'You are not assigned to this course offering');
  }
  if (!offering.course || offering.course.hasLab !== true) {
    throw httpError(400, 'This course does not have a lab component');
  }
  return offering;
}

// Cross-offering lab tasks list for the Teacher Lab Tasks module, with
// Semester / Section / Program filters. Only lab courses are surfaced.
router.get('/lab-tasks', asyncHandler(async (req, res) => {
  const where = offeringWhereForTeacher(req);
  const labOfferings = await prisma.courseOffering.findMany({
    where: { ...where, course: { is: { hasLab: true, isDeleted: false } } },
    include: {
      course: { include: { program: true, semester: true } },
      term: true,
      sections: { where: { isDeleted: false } },
      labTasks: {
        where: { isDeleted: false },
        include: { _count: { select: { submissions: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { id: 'desc' },
  });
  const rows = [];
  // The complete set of lab courses this teacher is teaching — surfaced
  // INDEPENDENTLY of whether any lab task has been created yet. Without this,
  // a freshly-distributed lab course (0 tasks) produced no rows at all, so the
  // UI wrongly reported "No lab courses" and disabled the New Lab Task button,
  // making it impossible to create the first task. (Bug fix — Task 5.)
  const offerings = [];
  for (const o of labOfferings) {
    offerings.push({
      offeringId: o.id,
      courseCode: o.course.code,
      courseTitle: o.course.title,
      program: o.course.program ? { id: o.course.program.id, shortForm: o.course.program.shortForm, name: o.course.program.name } : null,
      semester: o.course.semester ? { id: o.course.semester.id, number: o.course.semester.number, title: o.course.semester.title } : null,
      sections: o.sections.map((s) => ({ id: s.id, name: s.name })),
      labTaskCount: o.labTasks.length,
    });
    for (const t of o.labTasks) {
      // pending grading = submitted/late without marks
      const graded = await prisma.labTaskSubmission.count({ where: { labTaskId: t.id, status: 'GRADED' } });
      const submissionCount = t._count.submissions;
      rows.push({
        id: t.id,
        offeringId: o.id,
        title: t.title,
        description: t.description,
        totalMarks: t.totalMarks,
        dueDate: t.dueDate,
        isPublished: t.isPublished,
        sectionId: t.sectionId,
        courseCode: o.course.code,
        courseTitle: o.course.title,
        program: o.course.program ? { id: o.course.program.id, shortForm: o.course.program.shortForm, name: o.course.program.name } : null,
        semester: o.course.semester ? { id: o.course.semester.id, number: o.course.semester.number, title: o.course.semester.title } : null,
        sections: o.sections.map((s) => ({ id: s.id, name: s.name })),
        submissionCount,
        graded,
        pendingGrading: submissionCount - graded,
      });
    }
  }
  res.json({ labTasks: rows, labOfferings: offerings });
}));

// List lab tasks for a single (lab) offering.
router.get('/offerings/:id/lab-tasks', asyncHandler(async (req, res) => {
  const offering = await getOwnedLabOffering(req, parseInt(req.params.id, 10));
  const labTasks = await prisma.labTask.findMany({
    where: { offeringId: offering.id, isDeleted: false },
    include: { _count: { select: { submissions: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const sections = await prisma.section.findMany({ where: { offeringId: offering.id, isDeleted: false } });
  res.json({
    offering: {
      id: offering.id,
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
    },
    sections: sections.map((s) => ({ id: s.id, name: s.name })),
    labTasks,
  });
}));

// Create a lab task.
router.post('/offerings/:id/lab-tasks', uploadLmsMaterial.single('file'), validate([
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('dueDate').trim().notEmpty().withMessage('Due date is required'),
]), asyncHandler(async (req, res) => {
  const offering = await getOwnedLabOffering(req, parseInt(req.params.id, 10));
  const offeringId = offering.id;
  const counts = await coordinatorCounts(offering);
  if (counts.lab <= 0) throw httpError(400, 'The Course Coordinator has not configured Lab tasks for this course.');
  const existingLabs = await prisma.labTask.count({ where: { offeringId, isDeleted: false } });
  if (existingLabs >= counts.lab) throw httpError(400, `Coordinator configured ${counts.lab} lab task(s). You cannot create more.`);
  const { title, description, totalMarks, dueDate, allowLate, isPublished, sectionId } = req.body;
  const labTask = await prisma.labTask.create({
    data: {
      offeringId,
      title: title.trim(),
      description: description || null,
      totalMarks: totalMarks != null && totalMarks !== '' ? parseFloat(totalMarks) : 100,
      dueDate: dueDate.trim(),
      sectionId: sectionId ? parseInt(sectionId, 10) : null,
      allowLate: allowLate != null ? (allowLate === true || allowLate === 'true') : true,
      isPublished: isPublished != null ? (isPublished === true || isPublished === 'true') : true,
      filePath: req.file ? `/uploads/lms-materials/${req.file.filename}` : null,
      fileName: req.file ? req.file.originalname : null,
    },
  });
  // Notify enrolled students (real-time) when published.
  if (labTask.isPublished) {
    const regWhere = { offeringId, status: 'ENROLLED' };
    if (labTask.sectionId) regWhere.sectionId = labTask.sectionId;
    const regs = await prisma.courseRegistration.findMany({ where: regWhere, select: { studentId: true } });
    for (const r of regs) {
      await notify(r.studentId, { title: 'New lab task posted', message: labTask.title, type: 'LAB_TASK', link: '/student/lab-tasks' });
      realtime.emitTo(r.studentId, 'labtask', { action: 'published', labTaskId: labTask.id, offeringId });
    }
  }
  await audit(req, 'LABTASK_CREATE', 'LabTask', labTask.id, { after: labTask });
  res.status(201).json({ labTask });
}));

// Update a lab task.
router.put('/lab-tasks/:labTaskId', uploadLmsMaterial.single('file'), asyncHandler(async (req, res) => {
  const labTaskId = parseInt(req.params.labTaskId, 10);
  const before = await prisma.labTask.findUnique({ where: { id: labTaskId } });
  if (!before) throw httpError(404, 'Lab task not found');
  await getOwnedLabOffering(req, before.offeringId);
  const { title, description, totalMarks, dueDate, allowLate, isPublished, sectionId } = req.body;
  const labTask = await prisma.labTask.update({
    where: { id: labTaskId },
    data: {
      title: title ?? before.title,
      description: description !== undefined ? (description || null) : before.description,
      totalMarks: totalMarks != null && totalMarks !== '' ? parseFloat(totalMarks) : before.totalMarks,
      dueDate: dueDate ?? before.dueDate,
      sectionId: sectionId !== undefined ? (sectionId ? parseInt(sectionId, 10) : null) : before.sectionId,
      allowLate: allowLate != null ? (allowLate === true || allowLate === 'true') : before.allowLate,
      isPublished: isPublished != null ? (isPublished === true || isPublished === 'true') : before.isPublished,
      filePath: req.file ? `/uploads/lms-materials/${req.file.filename}` : before.filePath,
      fileName: req.file ? req.file.originalname : before.fileName,
    },
  });
  await audit(req, 'LABTASK_UPDATE', 'LabTask', labTaskId, { before, after: labTask });
  res.json({ labTask });
}));

// Delete (soft) a lab task.
router.delete('/lab-tasks/:labTaskId', asyncHandler(async (req, res) => {
  const labTaskId = parseInt(req.params.labTaskId, 10);
  const before = await prisma.labTask.findUnique({ where: { id: labTaskId } });
  if (!before) throw httpError(404, 'Lab task not found');
  await getOwnedLabOffering(req, before.offeringId);
  const labTask = await prisma.labTask.update({
    where: { id: labTaskId },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await audit(req, 'LABTASK_DELETE', 'LabTask', labTaskId, { after: labTask });
  res.json({ message: 'Lab task deleted', labTask });
}));

// Review submissions for a lab task (for grading). Includes every enrolled
// student (even those who have not submitted) so the teacher can upload marks.
router.get('/lab-tasks/:labTaskId/submissions', asyncHandler(async (req, res) => {
  const labTaskId = parseInt(req.params.labTaskId, 10);
  const labTask = await prisma.labTask.findUnique({ where: { id: labTaskId } });
  if (!labTask) throw httpError(404, 'Lab task not found');
  await getOwnedLabOffering(req, labTask.offeringId);
  const regWhere = { offeringId: labTask.offeringId, status: { in: ['ENROLLED', 'COMPLETED'] } };
  if (labTask.sectionId) regWhere.sectionId = labTask.sectionId;
  const [regs, subs] = await Promise.all([
    prisma.courseRegistration.findMany({
      where: regWhere,
      include: { student: { include: { profile: true } }, section: true },
      orderBy: { registeredAt: 'asc' },
    }),
    prisma.labTaskSubmission.findMany({ where: { labTaskId } }),
  ]);
  const subByStudent = {};
  for (const s of subs) subByStudent[s.studentId] = s;
  const rows = regs.map((r) => {
    const p = r.student.profile || {};
    const s = subByStudent[r.studentId] || null;
    return {
      studentId: r.studentId,
      rollNumber: r.student.linkedRollNumber || r.student.username,
      name: p.fullName || r.student.username,
      section: r.section ? r.section.name : null,
      submission: s ? {
        id: s.id, status: s.status, marks: s.marks, feedback: s.feedback,
        submittedAt: s.submittedAt, fileName: s.fileName, filePath: s.filePath, content: s.content,
      } : null,
    };
  });
  res.json({ labTask, submissions: rows });
}));

// Upload / update marks for a single student's lab task (real-time to student,
// Focal Person and Results). Creates the submission row if the student had not
// submitted (teacher-entered marks).
router.put('/lab-tasks/:labTaskId/marks/:studentId', validate([
  body('marks').isFloat({ min: 0 }).withMessage('marks must be a number >= 0'),
]), asyncHandler(async (req, res) => {
  const labTaskId = parseInt(req.params.labTaskId, 10);
  const studentId = req.params.studentId;
  const labTask = await prisma.labTask.findUnique({ where: { id: labTaskId } });
  if (!labTask) throw httpError(404, 'Lab task not found');
  const offering = await getOwnedLabOffering(req, labTask.offeringId);
  const reg = await prisma.courseRegistration.findFirst({ where: { offeringId: labTask.offeringId, studentId } });
  if (!reg) throw httpError(404, 'Student is not registered in this offering');
  const marks = parseFloat(req.body.marks);
  if (marks > labTask.totalMarks) throw httpError(400, `Marks cannot exceed ${labTask.totalMarks}`);
  const data = {
    marks,
    feedback: req.body.feedback || null,
    status: 'GRADED',
    gradedById: req.lmsUser.id,
    gradedAt: new Date(),
  };
  const submission = await prisma.labTaskSubmission.upsert({
    where: { labTaskId_studentId: { labTaskId, studentId } },
    update: data,
    create: { labTaskId, studentId, status: 'GRADED', ...data },
  });
  await audit(req, 'LABTASK_MARKS', 'LabTaskSubmission', submission.id, { after: { marks } });
  // Real-time: student sees the grade immediately; also nudge Focal Persons.
  await notify(studentId, { title: 'Lab task marks updated', message: `Your marks for lab task "${labTask.title}" were updated`, type: 'LAB_TASK', link: '/student/lab-tasks' });
  realtime.emitTo(studentId, 'labtask', { action: 'graded', labTaskId, offeringId: labTask.offeringId, marks });
  realtime.emitAll('labtask-monitor', { action: 'graded', labTaskId, offeringId: labTask.offeringId });
  res.json({ submission });
}));

// Grade an existing lab task submission by submission id (parallel to
// assignment grading). Kept for symmetry with the assignment flow.
router.put('/lab-submissions/:submissionId/grade', validate([
  body('marks').isFloat({ min: 0 }).withMessage('marks must be a number >= 0'),
]), asyncHandler(async (req, res) => {
  const submissionId = parseInt(req.params.submissionId, 10);
  const sub = await prisma.labTaskSubmission.findUnique({ where: { id: submissionId }, include: { labTask: true } });
  if (!sub) throw httpError(404, 'Submission not found');
  const offering = await getOwnedLabOffering(req, sub.labTask.offeringId);
  const marks = parseFloat(req.body.marks);
  if (marks > sub.labTask.totalMarks) throw httpError(400, `Marks cannot exceed ${sub.labTask.totalMarks}`);
  const updated = await prisma.labTaskSubmission.update({
    where: { id: submissionId },
    data: { marks, feedback: req.body.feedback || null, status: 'GRADED', gradedById: req.lmsUser.id, gradedAt: new Date() },
  });
  await audit(req, 'LABTASK_MARKS', 'LabTaskSubmission', submissionId, { after: { marks } });
  await notify(sub.studentId, { title: 'Lab task marks updated', message: `Your marks for lab task "${sub.labTask.title}" were updated`, type: 'LAB_TASK', link: '/student/lab-tasks' });
  realtime.emitTo(sub.studentId, 'labtask', { action: 'graded', labTaskId: sub.labTaskId, offeringId: sub.labTask.offeringId, marks });
  realtime.emitAll('labtask-monitor', { action: 'graded', labTaskId: sub.labTaskId, offeringId: sub.labTask.offeringId });
  res.json({ submission: updated });
}));

// ---------- ASSIGNMENT QUESTIONS (MCQ / SHORT / DESCRIPTIVE) ----------
// Helper to recompute an assignment's totalMarks from its questions.
async function recomputeAssignmentMarks(assignmentId) {
  const agg = await prisma.assignment2Question.aggregate({ where: { assignmentId }, _sum: { marks: true } });
  const sum = agg._sum.marks;
  if (sum != null && sum > 0) {
    await prisma.assignment2.update({ where: { id: assignmentId }, data: { totalMarks: sum } });
  }
}

// List questions for an assignment (full, includes correct answers for teacher).
router.get('/assignments/:assignmentId/questions', asyncHandler(async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const assignment = await prisma.assignment2.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw httpError(404, 'Assignment not found');
  await getOwnedOffering(req, assignment.offeringId);
  const questions = await prisma.assignment2Question.findMany({ where: { assignmentId }, orderBy: { order: 'asc' } });
  res.json({ assignment, questions: questions.map((q) => ({ ...q, options: safeJson(q.optionsJson, []) })) });
}));

// Add a question to an assignment.
router.post('/assignments/:assignmentId/questions', validate([
  body('text').trim().notEmpty().withMessage('Question text is required'),
]), asyncHandler(async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const assignment = await prisma.assignment2.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw httpError(404, 'Assignment not found');
  await getOwnedOffering(req, assignment.offeringId);
  const { text, type, options, correctAnswer, marks, order } = req.body;
  const qType = ['MCQ', 'SHORT', 'DESCRIPTIVE'].includes(type) ? type : 'MCQ';
  const question = await prisma.assignment2Question.create({
    data: {
      assignmentId,
      text: text.trim(),
      type: qType,
      optionsJson: JSON.stringify(Array.isArray(options) ? options : []),
      correctAnswer: correctAnswer != null ? String(correctAnswer) : null,
      marks: marks != null ? parseFloat(marks) : 1,
      order: order != null ? parseInt(order, 10) : 0,
    },
  });
  await recomputeAssignmentMarks(assignmentId);
  await audit(req, 'ASSIGNMENT_QUESTION_ADD', 'Assignment2Question', question.id, { after: { assignmentId } });
  res.status(201).json({ question: { ...question, options: safeJson(question.optionsJson, []) } });
}));

// Delete a question.
router.delete('/assignment-questions/:questionId', asyncHandler(async (req, res) => {
  const questionId = parseInt(req.params.questionId, 10);
  const question = await prisma.assignment2Question.findUnique({ where: { id: questionId }, include: { assignment: true } });
  if (!question) throw httpError(404, 'Question not found');
  await getOwnedOffering(req, question.assignment.offeringId);
  await prisma.assignment2Question.delete({ where: { id: questionId } });
  await recomputeAssignmentMarks(question.assignmentId);
  res.json({ message: 'Question deleted' });
}));

// AI-generate assignment questions (returns drafts; not auto-saved).
router.post('/assignments/:assignmentId/ai-generate', asyncHandler(async (req, res) => {
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const assignment = await prisma.assignment2.findUnique({
    where: { id: assignmentId },
    include: { offering: { include: { course: true } } },
  });
  if (!assignment) throw httpError(404, 'Assignment not found');
  await getOwnedOffering(req, assignment.offeringId);
  const topic = (req.body.topic || '').trim();
  if (!topic) throw httpError(400, 'Please provide a topic for AI generation');
  const count = Math.max(1, Math.min(20, parseInt(req.body.count, 10) || 5));
  const types = Array.isArray(req.body.types) && req.body.types.length ? req.body.types : ['MCQ', 'SHORT'];
  const context = assignment.offering && assignment.offering.course
    ? `${assignment.offering.course.code} — ${assignment.offering.course.title}` : '';
  try {
    const questions = await ai.generateQuestions({ topic, count, types, context });
    if (req.body.save) {
      const ops = questions.map((q, i) => prisma.assignment2Question.create({
        data: {
          assignmentId, text: q.text, type: q.type,
          optionsJson: JSON.stringify(q.options || []),
          correctAnswer: q.correctAnswer, marks: q.marks, order: i,
        },
      }));
      await prisma.$transaction(ops);
      await recomputeAssignmentMarks(assignmentId);
    }
    res.json({ questions, saved: !!req.body.save });
  } catch (e) {
    throw httpError(e.statusCode || 502, e.message || 'AI generation failed');
  }
}));

// ============================================================
// QUIZZES — create / questions / publish / attempts / grade
// ============================================================
router.get('/offerings/:id/quizzes', asyncHandler(async (req, res) => {
  await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const quizzes = await prisma.quiz.findMany({
    where: { offeringId, isDeleted: false },
    include: { _count: { select: { questions: true, attempts: true } } },
    orderBy: { id: 'desc' },
  });
  res.json({ quizzes });
}));

router.post('/offerings/:id/quizzes', validate([
  body('title').trim().notEmpty().withMessage('Quiz title is required'),
]), asyncHandler(async (req, res) => {
  const offering = await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const counts = await coordinatorCounts(offering);
  if (counts.quiz <= 0) throw httpError(400, 'The Course Coordinator has not configured Quizzes for this course.');
  const existingQuizzes = await prisma.quiz.count({ where: { offeringId, isDeleted: false } });
  if (existingQuizzes >= counts.quiz) throw httpError(400, `Coordinator configured ${counts.quiz} quiz(zes). You cannot create more.`);
  const { title, description, durationMin, startAt, endAt, shuffle } = req.body;
  const quiz = await prisma.quiz.create({
    data: {
      offeringId,
      title: title.trim(),
      description: description || null,
      durationMin: durationMin ? parseInt(durationMin, 10) : 30,
      startAt: startAt || null,
      endAt: endAt || null,
      shuffle: shuffle != null ? !!shuffle : true,
    },
  });
  await audit(req, 'QUIZ_CREATE', 'Quiz', quiz.id, { after: quiz });
  res.status(201).json({ quiz });
}));

// Quiz detail with questions (full, includes correct answers for teacher)
router.get('/quizzes/:quizId', asyncHandler(async (req, res) => {
  const quizId = parseInt(req.params.quizId, 10);
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { orderBy: { order: 'asc' } } },
  });
  if (!quiz) throw httpError(404, 'Quiz not found');
  await getOwnedOffering(req, quiz.offeringId);
  const questions = quiz.questions.map((q) => ({ ...q, options: safeJson(q.optionsJson, []) }));
  res.json({ quiz: { ...quiz, questions } });
}));

// Add a question to a quiz
router.post('/quizzes/:quizId/questions', validate([
  body('text').trim().notEmpty().withMessage('Question text is required'),
]), asyncHandler(async (req, res) => {
  const quizId = parseInt(req.params.quizId, 10);
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw httpError(404, 'Quiz not found');
  await getOwnedOffering(req, quiz.offeringId);
  const { text, type, options, correctAnswer, marks, order } = req.body;
  const qType = ['MCQ', 'TRUEFALSE', 'SHORT', 'DESCRIPTIVE'].includes(type) ? type : 'MCQ';
  const question = await prisma.quizQuestion.create({
    data: {
      quizId,
      text: text.trim(),
      type: qType,
      optionsJson: JSON.stringify(Array.isArray(options) ? options : (qType === 'TRUEFALSE' ? ['True', 'False'] : [])),
      correctAnswer: correctAnswer != null ? String(correctAnswer) : null,
      marks: marks != null ? parseFloat(marks) : 1,
      order: order != null ? parseInt(order, 10) : 0,
    },
  });
  // Recompute quiz totalMarks.
  const agg = await prisma.quizQuestion.aggregate({ where: { quizId }, _sum: { marks: true } });
  await prisma.quiz.update({ where: { id: quizId }, data: { totalMarks: agg._sum.marks || 0 } });
  await audit(req, 'QUIZ_QUESTION_ADD', 'QuizQuestion', question.id, { after: { quizId } });
  res.status(201).json({ question: { ...question, options: safeJson(question.optionsJson, []) } });
}));

router.delete('/quiz-questions/:questionId', asyncHandler(async (req, res) => {
  const questionId = parseInt(req.params.questionId, 10);
  const question = await prisma.quizQuestion.findUnique({ where: { id: questionId }, include: { quiz: true } });
  if (!question) throw httpError(404, 'Question not found');
  await getOwnedOffering(req, question.quiz.offeringId);
  await prisma.quizQuestion.delete({ where: { id: questionId } });
  const agg = await prisma.quizQuestion.aggregate({ where: { quizId: question.quizId }, _sum: { marks: true } });
  await prisma.quiz.update({ where: { id: question.quizId }, data: { totalMarks: agg._sum.marks || 0 } });
  res.json({ message: 'Question deleted' });
}));

// AI-generate quiz questions. When save=true the questions are persisted
// to the quiz; otherwise drafts are returned for teacher review.
router.post('/quizzes/:quizId/ai-generate', asyncHandler(async (req, res) => {
  const quizId = parseInt(req.params.quizId, 10);
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { offering: { include: { course: true } } },
  });
  if (!quiz) throw httpError(404, 'Quiz not found');
  await getOwnedOffering(req, quiz.offeringId);
  const topic = (req.body.topic || '').trim();
  if (!topic) throw httpError(400, 'Please provide a topic for AI generation');
  const count = Math.max(1, Math.min(20, parseInt(req.body.count, 10) || 5));
  const types = Array.isArray(req.body.types) && req.body.types.length ? req.body.types : ['MCQ'];
  const context = quiz.offering && quiz.offering.course
    ? `${quiz.offering.course.code} — ${quiz.offering.course.title}` : '';
  try {
    const questions = await ai.generateQuestions({ topic, count, types, context });
    if (req.body.save) {
      const ops = questions.map((q, i) => prisma.quizQuestion.create({
        data: {
          quizId, text: q.text, type: q.type,
          optionsJson: JSON.stringify(q.options || []),
          correctAnswer: q.correctAnswer, marks: q.marks, order: i,
        },
      }));
      await prisma.$transaction(ops);
      const agg = await prisma.quizQuestion.aggregate({ where: { quizId }, _sum: { marks: true } });
      await prisma.quiz.update({ where: { id: quizId }, data: { totalMarks: agg._sum.marks || 0 } });
    }
    res.json({ questions, saved: !!req.body.save });
  } catch (e) {
    throw httpError(e.statusCode || 502, e.message || 'AI generation failed');
  }
}));

// Publish / unpublish a quiz
router.put('/quizzes/:quizId/publish', asyncHandler(async (req, res) => {
  const quizId = parseInt(req.params.quizId, 10);
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, include: { _count: { select: { questions: true } } } });
  if (!quiz) throw httpError(404, 'Quiz not found');
  await getOwnedOffering(req, quiz.offeringId);
  const publish = req.body.isPublished !== false;
  if (publish && quiz._count.questions === 0) throw httpError(400, 'Add at least one question before publishing');
  const updated = await prisma.quiz.update({ where: { id: quizId }, data: { isPublished: publish } });
  await audit(req, 'QUIZ_PUBLISH', 'Quiz', quizId, { after: { isPublished: publish } });
  res.json({ quiz: updated });
}));

// View quiz attempts (for grading SHORT answers)
router.get('/quizzes/:quizId/attempts', asyncHandler(async (req, res) => {
  const quizId = parseInt(req.params.quizId, 10);
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw httpError(404, 'Quiz not found');
  await getOwnedOffering(req, quiz.offeringId);
  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId },
    include: { student: { include: { profile: true } } },
    orderBy: { submittedAt: 'desc' },
  });
  const rows = attempts.map((a) => ({
    ...a,
    answers: safeJson(a.answersJson, {}),
    studentName: a.student.profile ? a.student.profile.fullName : a.student.username,
    rollNumber: a.student.linkedRollNumber,
  }));
  res.json({ quiz, attempts: rows });
}));

// Manually adjust an attempt's score (e.g., after grading SHORT answers)
router.put('/quiz-attempts/:attemptId/grade', validate([
  body('score').isFloat({ min: 0 }).withMessage('score must be >= 0'),
]), asyncHandler(async (req, res) => {
  const attemptId = parseInt(req.params.attemptId, 10);
  const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId }, include: { quiz: true } });
  if (!attempt) throw httpError(404, 'Attempt not found');
  await getOwnedOffering(req, attempt.quiz.offeringId);
  const score = parseFloat(req.body.score);
  if (score > attempt.maxScore) throw httpError(400, `Score cannot exceed ${attempt.maxScore}`);
  const updated = await prisma.quizAttempt.update({
    where: { id: attemptId },
    data: { score, status: 'GRADED', gradedAt: new Date() },
  });
  await audit(req, 'QUIZ_ATTEMPT_GRADE', 'QuizAttempt', attemptId, { after: { score } });
  realtime.emitTo(attempt.studentId, 'result', { action: 'quiz-graded', offeringId: attempt.quiz.offeringId });
  res.json({ attempt: updated });
}));

// ============================================================
// GRADEBOOK + RESULT MANAGEMENT
// ============================================================
// Gradebook: aggregate per-student component marks for an offering.
// Computes assignment avg, quiz avg from real submissions/attempts, and
// merges any existing CourseResult (mid/final marks set by teacher).
router.get('/offerings/:id/gradebook', asyncHandler(async (req, res) => {
  const offering = await getOwnedOffering(req, parseInt(req.params.id, 10));
  requireGradebookPin(req);
  const offeringId = offering.id;

  const [regs, assignments, quizzes, labTasks, results] = await Promise.all([
    prisma.courseRegistration.findMany({
      where: { offeringId, status: { in: ['ENROLLED', 'COMPLETED'] } },
      include: { student: { include: { profile: true } } },
    }),
    prisma.assignment2.findMany({ where: { offeringId, isDeleted: false }, include: { submissions: true }, orderBy: { id: 'asc' } }),
    prisma.quiz.findMany({ where: { offeringId, isDeleted: false }, include: { attempts: true }, orderBy: { id: 'asc' } }),
    prisma.labTask.findMany({ where: { offeringId, isDeleted: false }, include: { submissions: true }, orderBy: { id: 'asc' } }),
    prisma.courseResult.findMany({ where: { offeringId } }),
  ]);

  const resultMap = {};
  for (const r of results) resultMap[r.studentId] = r;

  // Client requirement 2.3 — the weightage (and which components exist) is the
  // Course Coordinator's CourseWeightage, shared identically by Gradebook and
  // Marks. Resolve it once for this offering.
  const { weights: resolvedWeights, components, slots: coordSlots, counts, totalWeight } = await resolveOfferingWeights(prisma, offering);
  const hasLab = resolvedWeights.labWeight > 0;

  const round2 = (v) => Math.round(Number(v) * 100) / 100;
  const convertToWeight = (obtained, total, itemWeight) => {
    if (obtained == null || total == null || Number(total) <= 0) return null;
    const cap = Number(itemWeight) || 0;
    const converted = (Number(obtained) / Number(total)) * cap;
    return round2(Math.min(Math.max(converted, 0), cap));
  };

  // Columns come ONLY from Course Coordinator configuration (counts + weights).
  const items = (coordSlots || []).map((slot) => {
    let mapped = null;
    if (slot.kind === 'assignment') mapped = assignments[slot.index - 1] || null;
    else if (slot.kind === 'quiz') mapped = quizzes[slot.index - 1] || null;
    else if (slot.kind === 'lab') mapped = labTasks[slot.index - 1] || null;
    return {
      ...slot,
      id: mapped ? mapped.id : null,
      label: mapped?.title || slot.label,
      totalMarks: mapped?.totalMarks || 100,
    };
  });

  // Pre-index submissions/attempts by student.
  const rows = regs.map((reg) => {
    const sid = reg.studentId;
    // Assignment: average percentage across graded assignments * 100.
    let aPctSum = 0; let aCount = 0;
    for (const a of assignments) {
      const sub = a.submissions.find((s) => s.studentId === sid && s.marks != null);
      if (sub) { aPctSum += (sub.marks / (a.totalMarks || 1)); aCount += 1; }
    }
    const assignmentMarks = aCount > 0 ? Math.round((aPctSum / aCount) * 10000) / 100 : 0;
    // Quiz: average percentage across graded attempts * 100.
    let qPctSum = 0; let qCount = 0;
    for (const qz of quizzes) {
      const att = qz.attempts.find((t) => t.studentId === sid && t.score != null);
      if (att && att.maxScore > 0) { qPctSum += (att.score / att.maxScore); qCount += 1; }
    }
    const quizMarks = qCount > 0 ? Math.round((qPctSum / qCount) * 10000) / 100 : 0;

    const existing = resultMap[sid];
    const componentMarks = {
      assignmentMarks: existing ? existing.assignmentMarks : assignmentMarks,
      assignmentMax: 100,
      quizMarks: existing ? existing.quizMarks : quizMarks,
      quizMax: 100,
      midMarks: existing ? existing.midMarks : 0,
      midMax: existing ? existing.midMax : 100,
      finalMarks: existing ? existing.finalMarks : 0,
      finalMax: existing ? existing.finalMax : 100,
      // Lab component — present in the payload only meaningfully when the
      // coordinator gave Lab a weight (hasLab); harmless otherwise.
      labMarks: existing ? (existing.labMarks || 0) : 0,
      labMax: existing ? (existing.labMax || 100) : 100,
      projectMarks: existing ? (existing.projectMarks || 0) : 0,
      projectMax: existing ? (existing.projectMax || 100) : 100,
    };
    const grades = buildResultGrades(componentMarks, resolvedWeights);

    const published = !!(existing && isImmutableStatus(existing.status));
    const cells = {};
    for (const item of items) {
      if (item.kind === 'assignment' && item.id) {
        const a = assignments.find((x) => x.id === item.id);
        const sub = a ? a.submissions.find((s) => s.studentId === sid && s.marks != null) : null;
        const obtained = sub ? Number(sub.marks) : null;
        const total = a ? Number(a.totalMarks) : item.totalMarks;
        cells[item.key] = { obtained, total, converted: convertToWeight(obtained, total, item.itemWeight), pending: obtained == null };
      } else if (item.kind === 'quiz' && item.id) {
        const qz = quizzes.find((x) => x.id === item.id);
        const att = qz ? qz.attempts.find((t) => t.studentId === sid && t.score != null) : null;
        const obtained = att ? Number(att.score) : null;
        const total = att && Number(att.maxScore) > 0 ? Number(att.maxScore) : (qz ? Number(qz.totalMarks) : item.totalMarks);
        cells[item.key] = { obtained, total, converted: convertToWeight(obtained, total, item.itemWeight), pending: obtained == null };
      } else if (item.kind === 'lab' && item.id) {
        const t = labTasks.find((x) => x.id === item.id);
        const sub = t ? t.submissions.find((s) => s.studentId === sid && s.marks != null) : null;
        const obtained = sub ? Number(sub.marks) : null;
        const total = t ? Number(t.totalMarks) : item.totalMarks;
        cells[item.key] = { obtained, total, converted: convertToWeight(obtained, total, item.itemWeight), pending: obtained == null };
      } else if (item.kind === 'mid') {
        const raw = existing ? existing.midMarks : null;
        const entered = raw != null && (published || Number(raw) > 0);
        const obtained = entered ? Number(raw) : null;
        const total = existing ? Number(existing.midMax) : 100;
        cells[item.key] = { obtained, total, converted: convertToWeight(obtained, total, item.itemWeight), pending: !entered };
      } else if (item.kind === 'final') {
        const raw = existing ? existing.finalMarks : null;
        const entered = raw != null && (published || Number(raw) > 0);
        const obtained = entered ? Number(raw) : null;
        const total = existing ? Number(existing.finalMax) : 100;
        cells[item.key] = { obtained, total, converted: convertToWeight(obtained, total, item.itemWeight), pending: !entered };
      } else {
        const obtained = item.marksField && existing ? existing[item.marksField] : null;
        const total = item.maxField && existing ? existing[item.maxField] : item.totalMarks;
        const entered = obtained != null && (published || Number(obtained) > 0);
        cells[item.key] = { obtained: entered ? Number(obtained) : null, total, converted: convertToWeight(entered ? obtained : null, total, item.itemWeight), pending: !entered };
      }
    }

    return {
      studentId: sid,
      name: reg.student.profile ? reg.student.profile.fullName : reg.student.username,
      rollNumber: reg.student.linkedRollNumber,
      computedAssignment: assignmentMarks,
      computedQuiz: quizMarks,
      ...componentMarks,
      ...grades,
      cells,
      resultStatus: existing ? existing.status : 'DRAFT',
      resultId: existing ? existing.id : null,
    };
  });

  res.json({
    offering: {
      id: offering.id,
      courseTitle: offering.course.title,
      courseCode: offering.course.code,
      hasLab,
      // Backwards-compatible flat weights (used by existing badges) — now
      // sourced from the coordinator's CourseWeightage.
      weights: {
        assignment: resolvedWeights.assignmentWeight,
        quiz: resolvedWeights.quizWeight,
        mid: resolvedWeights.midWeight,
        final: resolvedWeights.finalWeight,
        lab: resolvedWeights.labWeight,
        project: resolvedWeights.projectWeight,
      },
      // Ordered component list (the single source of truth for which columns
      // BOTH the Gradebook and Marks module render, with identical weightage).
      components,
      // Per-item columns from Course Coordinator configuration only.
      items,
      counts: counts || null,
      totalWeight: totalWeight || null,
      locked: results.some((r) => isImmutableStatus(r.status)),
    },
    rows,
  });
}));

// Save/update results (bulk). Teacher sets mid/final marks and optionally
// overrides assignment/quiz aggregates. We compute the weighted grade.
router.post('/offerings/:id/results', validate([
  body('results').isArray({ min: 1 }).withMessage('results[] is required'),
]), asyncHandler(async (req, res) => {
  const offering = await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = offering.id;
  requireGradebookPin(req);
  await assertOfferingUnlocked(offeringId);
  // 1.4.1 Marks lock: once the Exam Controller has PUBLISHED a student's result
  // (compilation/finalization), the teacher can no longer edit those marks.
  const publishedLock = await prisma.courseResult.findMany({
    where: { offeringId },
    select: { studentId: true, status: true },
  });
  const lockedRows = publishedLock.filter((r) => isImmutableStatus(r.status));
  const lockedStudents = new Set(publishedLock.map((r) => r.studentId));
  const attemptedLocked = req.body.results.filter((r) => r.studentId && lockedStudents.has(r.studentId));
  if (attemptedLocked.length > 0) {
    throw httpError(409, `Marks are locked for ${attemptedLocked.length} student(s): submitted/finalized results cannot be edited by any role.`);
  }
  // Client requirement 2.3 — grade with the coordinator's weightage.
  const { weights: resolvedWeights } = await resolveOfferingWeights(prisma, offering);
  const ops = [];
  for (const r of req.body.results) {
    if (!r.studentId) continue;
    const componentMarks = {
      assignmentMarks: r.assignmentMarks != null ? parseFloat(r.assignmentMarks) : 0,
      assignmentMax: r.assignmentMax != null ? parseFloat(r.assignmentMax) : 100,
      quizMarks: r.quizMarks != null ? parseFloat(r.quizMarks) : 0,
      quizMax: r.quizMax != null ? parseFloat(r.quizMax) : 100,
      midMarks: r.midMarks != null ? parseFloat(r.midMarks) : 0,
      midMax: r.midMax != null ? parseFloat(r.midMax) : 100,
      finalMarks: r.finalMarks != null ? parseFloat(r.finalMarks) : 0,
      finalMax: r.finalMax != null ? parseFloat(r.finalMax) : 100,
      labMarks: r.labMarks != null ? parseFloat(r.labMarks) : 0,
      labMax: r.labMax != null ? parseFloat(r.labMax) : 100,
      projectMarks: r.projectMarks != null ? parseFloat(r.projectMarks) : 0,
      projectMax: r.projectMax != null ? parseFloat(r.projectMax) : 100,
    };
    const grades = buildResultGrades(componentMarks, resolvedWeights);
    ops.push(
      prisma.courseResult.upsert({
        where: { offeringId_studentId: { offeringId, studentId: r.studentId } },
        update: { ...componentMarks, ...grades, remarks: r.remarks || null },
        create: { offeringId, studentId: r.studentId, ...componentMarks, ...grades, remarks: r.remarks || null, status: 'DRAFT' },
      })
    );
  }
  await prisma.$transaction(ops);
  await audit(req, 'RESULTS_SAVE', 'CourseOffering', offeringId, { after: { count: ops.length } });
  realtime.emitTo(req.body.results.map((row) => row.studentId).filter(Boolean), 'result', { action: 'marks-saved', offeringId });
  res.json({ message: `Saved results for ${ops.length} student(s)` });
}));

router.put('/offerings/:id/results/publish', asyncHandler(async (req, res) => {
  throw httpError(400, 'Use Submit Result to Exam Controller (Gradebook PIN required). Teacher publish no longer releases marks to students.');
}));

router.get('/offerings/:id/review', asyncHandler(async (req, res) => {
  const offering = await getOwnedOffering(req, parseInt(req.params.id, 10));
  requireGradebookPin(req);
  const review = await lifecycle.offeringReview(offering);
  res.json({ review });
}));

router.get('/result-reviews', asyncHandler(async (req, res) => {
  requireGradebookPin(req);
  const offerings = await prisma.courseOffering.findMany({
    where: offeringWhereForTeacher(req),
    include: { course: true, term: true },
    orderBy: { id: 'desc' },
  });
  const reviews = [];
  for (const o of offerings) reviews.push(await lifecycle.offeringReview(o));
  res.json({ reviews });
}));

router.post('/offerings/:id/submit-result', asyncHandler(async (req, res) => {
  const offering = await getOwnedOffering(req, parseInt(req.params.id, 10));
  requireGradebookPin(req);
  const out = await lifecycle.submitOffering(req, offering, req.body.pin);
  res.json({ message: 'Result submitted to the Exam Controller and locked.', ...out });
}));

// ============================================================
// MARKS — real-time add / edit / delete of a single student's result
// (semester/course/section-wise; complements the bulk gradebook save).
// ============================================================
// Upsert one student's component marks for an offering.
router.put('/offerings/:id/marks/:studentId', asyncHandler(async (req, res) => {
  const offering = await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = offering.id;
  requireGradebookPin(req);
  await assertOfferingUnlocked(offeringId);
  const studentId = req.params.studentId;
  // Guard: student must be registered in this offering.
  const reg = await prisma.courseRegistration.findFirst({ where: { offeringId, studentId } });
  if (!reg) throw httpError(404, 'Student is not registered in this offering');
  const existing = await prisma.courseResult.findUnique({ where: { offeringId_studentId: { offeringId, studentId } } });
  if (existing && isImmutableStatus(existing.status)) {
    throw httpError(409, 'Marks are locked: submitted/finalized results cannot be edited by any role.');
  }
  const num = (v, d) => (v != null && v !== '' ? parseFloat(v) : d);
  const componentMarks = {
    assignmentMarks: num(req.body.assignmentMarks, existing ? existing.assignmentMarks : 0),
    assignmentMax: num(req.body.assignmentMax, existing ? existing.assignmentMax : 100),
    quizMarks: num(req.body.quizMarks, existing ? existing.quizMarks : 0),
    quizMax: num(req.body.quizMax, existing ? existing.quizMax : 100),
    midMarks: num(req.body.midMarks, existing ? existing.midMarks : 0),
    midMax: num(req.body.midMax, existing ? existing.midMax : 100),
    finalMarks: num(req.body.finalMarks, existing ? existing.finalMarks : 0),
    finalMax: num(req.body.finalMax, existing ? existing.finalMax : 100),
    labMarks: num(req.body.labMarks, existing ? (existing.labMarks || 0) : 0),
    labMax: num(req.body.labMax, existing ? (existing.labMax || 100) : 100),
    projectMarks: num(req.body.projectMarks, existing ? (existing.projectMarks || 0) : 0),
    projectMax: num(req.body.projectMax, existing ? (existing.projectMax || 100) : 100),
  };
  // Client requirement 2.3 — grade with the coordinator's weightage.
  const { weights: resolvedWeights } = await resolveOfferingWeights(prisma, offering);
  const grades = buildResultGrades(componentMarks, resolvedWeights);
  const result = await prisma.courseResult.upsert({
    where: { offeringId_studentId: { offeringId, studentId } },
    update: { ...componentMarks, ...grades, remarks: req.body.remarks ?? (existing ? existing.remarks : null) },
    create: { offeringId, studentId, ...componentMarks, ...grades, remarks: req.body.remarks || null, status: 'DRAFT' },
  });
  // Real-time: if already published, students see the update immediately.
  await notify(studentId, { title: 'Marks updated', message: `Your marks for ${offering.course ? offering.course.code : 'a course'} were updated`, type: 'RESULT', link: '/student/results' });
  await audit(req, 'MARKS_UPSERT', 'CourseResult', result.id, { after: componentMarks });
  realtime.emitTo(studentId, 'result', { action: 'marks-updated', offeringId });
  res.json({ result: { ...result } });
}));

// Delete (reset) a student's result for an offering.
router.delete('/offerings/:id/marks/:studentId', asyncHandler(async (req, res) => {
  const offering = await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = offering.id;
  requireGradebookPin(req);
  await assertOfferingUnlocked(offeringId);
  const studentId = req.params.studentId;
  const existing = await prisma.courseResult.findUnique({ where: { offeringId_studentId: { offeringId, studentId } } });
  if (!existing) throw httpError(404, 'No marks recorded for this student');
  if (isImmutableStatus(existing.status)) {
    throw httpError(409, 'Marks are locked: submitted/finalized results cannot be deleted by any role.');
  }
  await prisma.courseResult.delete({ where: { offeringId_studentId: { offeringId, studentId } } });
  await audit(req, 'MARKS_DELETE', 'CourseResult', existing.id, {});
  realtime.emitTo(studentId, 'result', { action: 'marks-deleted', offeringId });
  res.json({ message: 'Marks deleted' });
}));

// ============================================================
// STUDENT EXPORTS — Excel / PDF (Individual / Section / Course / Bulk)
// ============================================================
// Gather rich student rows for an offering (optionally filtered by section).
async function studentRowsForOffering(offeringId, sectionName) {
  const regs = await prisma.courseRegistration.findMany({
    where: { offeringId, status: { in: ['ENROLLED', 'COMPLETED'] } },
    include: { student: { include: { profile: true } }, section: true },
    orderBy: { registeredAt: 'asc' },
  });
  return regs
    .filter((r) => !sectionName || (r.section && r.section.name === sectionName))
    .map((r) => {
      const p = r.student.profile || {};
      return {
        rollNumber: r.student.linkedRollNumber || r.student.username,
        name: p.fullName || r.student.username,
        fatherName: p.fatherName || '',
        cnic: p.cnic || '',
        phone: p.phone || '',
        email: p.email || '',
        whatsapp: p.whatsapp || '',
        gender: p.gender || '',
        section: r.section ? r.section.name : '',
        program: p.program || '',
        status: r.status,
      };
    });
}

function applyStudentFilters(rows, q) {
  let out = rows;
  const like = (v, term) => String(v || '').toLowerCase().includes(String(term).toLowerCase());
  if (q.name) out = out.filter((r) => like(r.name, q.name));
  if (q.roll) out = out.filter((r) => like(r.rollNumber, q.roll));
  if (q.cnic) out = out.filter((r) => like(r.cnic, q.cnic));
  if (q.phone) out = out.filter((r) => like(r.phone, q.phone) || like(r.whatsapp, q.phone));
  if (q.section) out = out.filter((r) => like(r.section, q.section));
  if (q.search) out = out.filter((r) => like(r.name, q.search) || like(r.rollNumber, q.search) || like(r.cnic, q.search) || like(r.phone, q.search));
  return out;
}

// Export a single offering's roster as Excel.
router.get('/offerings/:id/students/export/excel', asyncHandler(async (req, res) => {
  const offering = await getOwnedOffering(req, parseInt(req.params.id, 10));
  const rows = applyStudentFilters(await studentRowsForOffering(offering.id, req.query.section), req.query);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.columns = [
    { header: 'Roll No', key: 'rollNumber', width: 18 },
    { header: 'Name', key: 'name', width: 26 },
    { header: 'Father Name', key: 'fatherName', width: 24 },
    { header: 'CNIC', key: 'cnic', width: 18 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'WhatsApp', key: 'whatsapp', width: 16 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Gender', key: 'gender', width: 10 },
    { header: 'Section', key: 'section', width: 12 },
    { header: 'Program', key: 'program', width: 28 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  const code = offering.course ? offering.course.code : `offering-${offering.id}`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="students-${code}.xlsx"`);
  res.send(Buffer.from(buf));
}));

// Export a single offering's roster (or an individual student) as PDF.
router.get('/offerings/:id/students/export/pdf', asyncHandler(async (req, res) => {
  const offering = await getOwnedOffering(req, parseInt(req.params.id, 10));
  let rows = applyStudentFilters(await studentRowsForOffering(offering.id, req.query.section), req.query);
  if (req.query.studentRoll) rows = rows.filter((r) => r.rollNumber === req.query.studentRoll);
  const code = offering.course ? offering.course.code : `offering-${offering.id}`;
  const title = offering.course ? `${offering.course.code} — ${offering.course.title}` : `Offering ${offering.id}`;

  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="students-${code}.pdf"`);
  doc.pipe(res);
  doc.fontSize(16).text('AUST ODL — Student List', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor('#555').text(title, { align: 'center' });
  doc.moveDown(0.5);
  doc.fillColor('#000');

  const headers = ['Roll No', 'Name', 'Father Name', 'CNIC', 'Phone', 'Section'];
  const widths = [90, 150, 130, 110, 90, 60];
  const startX = doc.x;
  const drawRow = (cells, opts = {}) => {
    const y = doc.y;
    let x = startX;
    doc.fontSize(9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
    cells.forEach((c, i) => { doc.text(String(c || ''), x + 2, y + 2, { width: widths[i] - 4, ellipsis: true }); x += widths[i]; });
    doc.moveTo(startX, doc.y + 2).lineTo(startX + widths.reduce((a, b) => a + b, 0), doc.y + 2).strokeColor('#ddd').stroke();
    doc.moveDown(0.2);
  };
  drawRow(headers, { bold: true });
  if (rows.length === 0) {
    doc.moveDown(1).fontSize(11).fillColor('#888').text('No students found.', { align: 'center' });
  } else {
    rows.forEach((r) => {
      if (doc.y > 520) { doc.addPage({ margin: 36, size: 'A4', layout: 'landscape' }); drawRow(headers, { bold: true }); }
      drawRow([r.rollNumber, r.name, r.fatherName, r.cnic, r.phone, r.section]);
    });
  }
  doc.moveDown(1).fontSize(8).fillColor('#999').text(`Total: ${rows.length} student(s) · Generated ${new Date().toLocaleString()}`);
  doc.end();
}));

// Bulk export across ALL of the teacher's offerings as one Excel workbook
// (one sheet per course).
router.get('/students/export/excel', asyncHandler(async (req, res) => {
  const offerings = await myOfferings(req);
  const wb = new ExcelJS.Workbook();
  for (const o of offerings) {
    const rows = applyStudentFilters(await studentRowsForOffering(o.id, req.query.section), req.query);
    const name = (o.course ? o.course.code : `OFF-${o.id}`).slice(0, 28).replace(/[\\/?*[\]:]/g, '-');
    const ws = wb.addWorksheet(name || `Sheet${o.id}`);
    ws.columns = [
      { header: 'Roll No', key: 'rollNumber', width: 18 },
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Father Name', key: 'fatherName', width: 24 },
      { header: 'CNIC', key: 'cnic', width: 18 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'WhatsApp', key: 'whatsapp', width: 16 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Gender', key: 'gender', width: 10 },
      { header: 'Section', key: 'section', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
  }
  if (offerings.length === 0) wb.addWorksheet('Students');
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="all-students.xlsx"');
  res.send(Buffer.from(buf));
}));

// ============================================================
// COURSE MATERIALS
// ============================================================
router.get('/offerings/:id/materials', asyncHandler(async (req, res) => {
  await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const materials = await prisma.courseMaterial.findMany({
    where: { offeringId, isDeleted: false },
    orderBy: [{ weekNumber: 'asc' }, { id: 'desc' }],
  });
  res.json({ materials });
}));

router.post('/offerings/:id/materials', uploadLmsLibrary.single('file'), asyncHandler(async (req, res) => {
  await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const { title, type, url, weekNumber, description, resourceType } = req.body;
  if (!title) throw httpError(400, 'Material title is required');
  const rType = ['BOOK', 'SLIDES', 'NOTES', 'PDF', 'OTHER'].includes(resourceType) ? resourceType : null;
  const material = await prisma.courseMaterial.create({
    data: {
      offeringId,
      title,
      type: type || (req.file ? 'FILE' : 'LINK'),
      filePath: req.file ? `/uploads/lms-library/${req.file.filename}` : null,
      fileName: req.file ? req.file.originalname : null,
      fileSize: req.file ? req.file.size : null,
      url: url || null,
      weekNumber: weekNumber ? parseInt(weekNumber, 10) : 1,
      description: description || null,
      resourceType: rType,
      uploadedById: req.lmsUser.id,
    },
  });
  await audit(req, 'MATERIAL_CREATE', 'CourseMaterial', material.id, { after: material });
  res.status(201).json({ material });
}));

router.delete('/materials/:materialId', asyncHandler(async (req, res) => {
  const materialId = parseInt(req.params.materialId, 10);
  const before = await prisma.courseMaterial.findUnique({ where: { id: materialId } });
  if (!before) throw httpError(404, 'Material not found');
  await getOwnedOffering(req, before.offeringId);
  const material = await prisma.courseMaterial.update({
    where: { id: materialId },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await audit(req, 'MATERIAL_DELETE', 'CourseMaterial', materialId, { after: material });
  res.json({ message: 'Material deleted' });
}));

// ============================================================
// ANNOUNCEMENTS (teacher posts to an offering)
// ============================================================
router.post('/offerings/:id/announcements', validate([
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
]), asyncHandler(async (req, res) => {
  await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const ann = await prisma.lmsAnnouncement.create({
    data: {
      offeringId,
      authorId: req.lmsUser.id,
      title: req.body.title.trim(),
      message: req.body.message.trim(),
      audience: 'STUDENTS',
    },
  });
  await audit(req, 'ANNOUNCEMENT_CREATE', 'LmsAnnouncement', ann.id, { after: ann });
  res.status(201).json({ announcement: ann });
}));

router.get('/offerings/:id/announcements', asyncHandler(async (req, res) => {
  await getOwnedOffering(req, parseInt(req.params.id, 10));
  const offeringId = parseInt(req.params.id, 10);
  const announcements = await prisma.lmsAnnouncement.findMany({
    where: { offeringId, isDeleted: false },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ announcements });
}));

// ============================================================
// PHASE-2 TEACHER AGGREGATE ENDPOINTS (cross-offering views)
// ============================================================

// Helper: ids of offerings the teacher owns (or all, for coordinator)
async function myOfferings(req, { activeOnly = false } = {}) {
  const where = offeringWhereForTeacher(req);
  const offerings = await prisma.courseOffering.findMany({
    where,
    include: { course: { include: { semester: true } }, term: true, sections: { where: { isDeleted: false } } },
    orderBy: { id: 'desc' },
  });
  return offerings;
}

// ============================================================
// MESSAGE GROUP SYNC — auto-create/sync a course chat group for each
// of the teacher's offerings, auto-enrolling all registered students
// plus the teacher. Idempotent; safe to call on every contacts fetch.
// ============================================================
async function syncCourseGroups(req) {
  // Delegate to the shared course-group utility so membership (add AND remove
  // on enrollment changes) stays consistent across student & teacher sides.
  const courseGroups = require('../../../utils/lmsCourseGroups');
  const offerings = await myOfferings(req);
  const result = [];
  for (const o of offerings) {
    if (!o.course) continue;
    const group = await courseGroups.syncOfferingGroup(o);
    if (group) result.push({ group, offering: o });
  }
  return result;
}

// ---------- COURSE HISTORY (all offerings incl. past terms) ----------
router.get('/history', asyncHandler(async (req, res) => {
  const offerings = await myOfferings(req);
  const ids = offerings.map((o) => o.id);
  const [regs, results] = await Promise.all([
    prisma.courseRegistration.groupBy({ by: ['offeringId'], where: { offeringId: { in: ids } }, _count: { _all: true } }),
    prisma.courseResult.groupBy({ by: ['offeringId'], where: { offeringId: { in: ids }, status: 'PUBLISHED' }, _count: { _all: true } }),
  ]);
  const regMap = {}; for (const r of regs) regMap[r.offeringId] = r._count._all;
  const resMap = {}; for (const r of results) resMap[r.offeringId] = r._count._all;
  const courses = offerings.map((o) => ({
    offeringId: o.id,
    courseCode: o.course ? o.course.code : '—',
    courseTitle: o.course ? o.course.title : '—',
    creditHours: o.course ? o.course.creditHours : null,
    creditLabel: o.course ? creditLabel(o.course) : null,
    hasLab: o.course ? o.course.hasLab === true : false,
    theoryCredit: o.course ? (o.course.theoryCredit != null ? o.course.theoryCredit : o.course.creditHours) : null,
    labCredit: o.course ? (o.course.labCredit != null ? o.course.labCredit : 0) : null,
    termCode: o.term ? o.term.code : '—',
    termTitle: o.term ? o.term.title : '—',
    isActive: o.term ? !!o.term.isActive : false,
    students: regMap[o.id] || 0,
    resultsPublished: resMap[o.id] || 0,
  }));
  res.json({ courses });
}));

// ---------- LECTURE UPLOADS (recorded/video materials across courses) ----------
router.get('/lectures', asyncHandler(async (req, res) => {
  const offerings = await myOfferings(req);
  const ids = offerings.map((o) => o.id);
  const offMap = {}; for (const o of offerings) offMap[o.id] = o;
  const materials = await prisma.courseMaterial.findMany({
    where: { offeringId: { in: ids }, isDeleted: false, type: 'VIDEO' },
    orderBy: { createdAt: 'desc' },
  });
  const bySubject = {};
  for (const m of materials) {
    const o = offMap[m.offeringId];
    const key = o.course ? o.course.code : String(m.offeringId);
    const semester = o.course && o.course.semester ? (o.course.semester.title || (o.course.semester.number != null ? `Semester ${o.course.semester.number}` : '')) : '';
    if (!bySubject[key]) bySubject[key] = { offeringId: m.offeringId, courseCode: key, courseTitle: o.course ? o.course.title : '', semester, lectures: [] };
    bySubject[key].lectures.push({
      id: m.id, title: m.title, week: m.weekNumber,
      url: m.url, fileName: m.fileName, filePath: m.filePath,
      description: m.description, durationMin: m.durationMin, lectureNumber: m.lectureNumber,
      createdAt: m.createdAt, kind: 'VIDEO',
    });
  }
  // ALL offerings assigned to this teacher (dynamic dropdown source for the
  // Upload Lecture form) — includes semester + course, even courses with no
  // lectures yet. Distinct semesters are also returned for a semester filter.
  const offeringsList = offerings.map((o) => {
    const sem = o.course && o.course.semester
      ? (o.course.semester.title || (o.course.semester.number != null ? `Semester ${o.course.semester.number}` : ''))
      : '';
    const semNumber = o.course && o.course.semester ? o.course.semester.number : null;
    return {
      offeringId: o.id,
      courseCode: o.course ? o.course.code : '',
      courseTitle: o.course ? o.course.title : '',
      semester: sem,
      semesterNumber: semNumber,
      semesterId: o.course ? o.course.semesterId : null,
      termTitle: o.term ? o.term.title : '',
    };
  });
  const semMap = {};
  for (const o of offeringsList) {
    const key = o.semesterId != null ? `s${o.semesterId}` : (o.semester || 'none');
    if (!semMap[key]) semMap[key] = { id: o.semesterId, label: o.semester || '—', number: o.semesterNumber, offeringIds: [] };
    semMap[key].offeringIds.push(o.offeringId);
  }
  const semesters = Object.values(semMap).sort((a, b) => (a.number || 0) - (b.number || 0));
  res.json({ subjects: Object.values(bySubject), offerings: offeringsList, semesters });
}));

// Create a lecture (VIDEO material) — offering must be owned
router.post('/lectures', uploadLmsLectureFallback.single('file'), asyncHandler(async (req, res) => {
  const offeringId = parseInt(req.body.offeringId, 10);
  if (!offeringId) throw httpError(400, 'offeringId is required');
  await getOwnedOffering(req, offeringId);
  const { title, url, weekNumber, description, durationMin, lectureNumber } = req.body;
  if (!title) throw httpError(400, 'title is required');
  // Client requirement 2.2 — recorded lectures are added by URL ONLY. Any file
  // that still slips through (already 5MB-capped by the multer fallback) is
  // discarded and a URL is required.
  if (req.file) { try { require('fs').unlinkSync(req.file.path); } catch (_) { /* ignore */ } }
  if (!url || !String(url).trim()) throw httpError(400, 'Provide a video URL (YouTube or external link). Direct file upload is not supported.');
  const material = await prisma.courseMaterial.create({
    data: {
      offeringId, title, type: 'VIDEO',
      filePath: null,
      fileName: null,
      url: String(url).trim(),
      weekNumber: weekNumber ? parseInt(weekNumber, 10) : 1,
      description: description || null,
      durationMin: durationMin ? parseInt(durationMin, 10) : null,
      lectureNumber: lectureNumber ? parseInt(lectureNumber, 10) : null,
      uploadedById: req.lmsUser.id,
    },
  });
  // Notify enrolled students that a new recorded lecture is available.
  const regs = await prisma.courseRegistration.findMany({ where: { offeringId, status: 'ENROLLED' }, select: { studentId: true } });
  for (const r of regs) await notify(r.studentId, { title: 'New recorded lecture', message: title, type: 'LECTURE', link: '/student/recorded-lectures' });
  await audit(req, 'LECTURE_CREATE', 'CourseMaterial', material.id, { after: material });
  res.status(201).json({ material });
}));

// Edit lecture information and/or REPLACE the video (file or URL).
// Accepts multipart so a new file can be uploaded to replace the old one.
router.put('/lectures/:id', uploadLmsLectureFallback.single('file'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.courseMaterial.findUnique({ where: { id } });
  if (!before || before.isDeleted) throw httpError(404, 'Lecture not found');
  await getOwnedOffering(req, before.offeringId);

  const data = {};
  const { title, url, weekNumber, description, durationMin, lectureNumber } = req.body;
  if (title !== undefined && String(title).trim()) data.title = String(title).trim();
  if (weekNumber !== undefined) data.weekNumber = parseInt(weekNumber, 10) || 1;
  if (description !== undefined) data.description = description || null;
  if (durationMin !== undefined) data.durationMin = durationMin ? parseInt(durationMin, 10) : null;
  if (lectureNumber !== undefined) data.lectureNumber = lectureNumber ? parseInt(lectureNumber, 10) : null;

  // Client requirement 2.2 — URL ONLY. Discard any uploaded file (already
  // 5MB-capped) and only allow replacing the video source with a new URL.
  if (req.file) { try { require('fs').unlinkSync(req.file.path); } catch (_) { /* ignore */ } }
  if (url !== undefined && String(url).trim()) {
    data.url = String(url).trim();
    data.filePath = null;
    data.fileName = null;
  }

  const material = await prisma.courseMaterial.update({ where: { id }, data });
  await audit(req, 'LECTURE_UPDATE', 'CourseMaterial', id, { before, after: material });
  res.json({ material });
}));

router.delete('/lectures/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.courseMaterial.findUnique({ where: { id } });
  if (!before) throw httpError(404, 'Lecture not found');
  await getOwnedOffering(req, before.offeringId);
  await prisma.courseMaterial.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  await audit(req, 'LECTURE_DELETE', 'CourseMaterial', id, {});
  res.json({ message: 'Lecture deleted' });
}));

// ---------- LIBRARY (non-video resources, per-teacher scoped) ----------
// Per the Teacher-module spec each teacher only sees their OWN uploaded
// resources (scoped by uploadedById). CourseCoordinators monitor all.
// VIDEO materials are excluded here — those belong to Recorded Lectures.
router.get('/library', asyncHandler(async (req, res) => {
  const offerings = await myOfferings(req);
  const ids = offerings.map((o) => o.id);
  const offMap = {}; for (const o of offerings) offMap[o.id] = o;
  const where = {
    offeringId: { in: ids },
    isDeleted: false,
    NOT: { type: 'VIDEO' },
  };
  // Teacher: only own uploads. Legacy rows with NULL uploadedById are
  // surfaced too so pre-existing materials are not lost.
  if (req.lmsUser.role === 'Teacher') {
    where.OR = [{ uploadedById: req.lmsUser.id }, { uploadedById: null }];
  }
  const materials = await prisma.courseMaterial.findMany({ where, orderBy: { createdAt: 'desc' } });
  const categories = {};
  for (const m of materials) {
    const o = offMap[m.offeringId];
    if (!o) continue;
    const key = o.course ? o.course.code : String(m.offeringId);
    const semester = o.course && o.course.semester ? (o.course.semester.title || (o.course.semester.number != null ? `Semester ${o.course.semester.number}` : '')) : '';
    if (!categories[key]) categories[key] = { offeringId: m.offeringId, courseCode: key, courseTitle: o.course ? o.course.title : '', semester, items: [] };
    categories[key].items.push({
      id: m.id, title: m.title, type: m.type, week: m.weekNumber,
      resourceType: m.resourceType, description: m.description, fileSize: m.fileSize,
      url: m.url, fileName: m.fileName, filePath: m.filePath, createdAt: m.createdAt,
    });
  }
  const offeringsList = offerings.map((o) => {
    const sem = o.course && o.course.semester
      ? (o.course.semester.title || (o.course.semester.number != null ? `Semester ${o.course.semester.number}` : ''))
      : '';
    return {
      offeringId: o.id,
      courseCode: o.course ? o.course.code : '',
      courseTitle: o.course ? o.course.title : '',
      semester: sem,
    };
  });
  res.json({ categories: Object.values(categories), total: materials.length, offerings: offeringsList });
}));

// Create a library resource (non-video) — 5MB cap, per-teacher scoped.
router.post('/library', uploadLmsLibrary.single('file'), asyncHandler(async (req, res) => {
  const offeringId = parseInt(req.body.offeringId, 10);
  if (!offeringId) throw httpError(400, 'offeringId is required');
  await getOwnedOffering(req, offeringId);
  const { title, url, weekNumber, description, resourceType } = req.body;
  if (!title) throw httpError(400, 'Title is required');
  if (!req.file && !url) throw httpError(400, 'Provide a file or a URL');
  const rType = ['BOOK', 'SLIDES', 'NOTES', 'PDF', 'OTHER'].includes(resourceType) ? resourceType : 'OTHER';
  const material = await prisma.courseMaterial.create({
    data: {
      offeringId, title,
      type: req.file ? 'FILE' : 'LINK',
      filePath: req.file ? `/uploads/lms-library/${req.file.filename}` : null,
      fileName: req.file ? req.file.originalname : null,
      fileSize: req.file ? req.file.size : null,
      url: url || null,
      weekNumber: weekNumber ? parseInt(weekNumber, 10) : 1,
      description: description || null,
      resourceType: rType,
      uploadedById: req.lmsUser.id,
    },
  });
  await audit(req, 'LIBRARY_CREATE', 'CourseMaterial', material.id, { after: material });
  res.status(201).json({ material });
}));

// Edit a library resource and/or REPLACE its file/URL (own only for teachers).
// Accepts multipart so a new file can replace the old one.
router.put('/library/:id', uploadLmsLibrary.single('file'), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.courseMaterial.findUnique({ where: { id } });
  if (!before || before.isDeleted) throw httpError(404, 'Resource not found');
  await getOwnedOffering(req, before.offeringId);
  if (req.lmsUser.role === 'Teacher' && before.uploadedById && before.uploadedById !== req.lmsUser.id) {
    throw httpError(403, 'You can only edit your own resources');
  }

  const data = {};
  const { title, url, weekNumber, description, resourceType } = req.body;
  if (title !== undefined && String(title).trim()) data.title = String(title).trim();
  if (weekNumber !== undefined) data.weekNumber = parseInt(weekNumber, 10) || 1;
  if (description !== undefined) data.description = description || null;
  if (resourceType !== undefined && ['BOOK', 'SLIDES', 'NOTES', 'PDF', 'OTHER'].includes(resourceType)) {
    data.resourceType = resourceType;
  }

  // Replace the source: a new file takes priority, else a new URL.
  if (req.file) {
    data.type = 'FILE';
    data.filePath = `/uploads/lms-library/${req.file.filename}`;
    data.fileName = req.file.originalname;
    data.fileSize = req.file.size;
    data.url = null;
  } else if (url !== undefined && String(url).trim()) {
    data.type = 'LINK';
    data.url = String(url).trim();
    data.filePath = null;
    data.fileName = null;
    data.fileSize = null;
  }

  const material = await prisma.courseMaterial.update({ where: { id }, data });
  await audit(req, 'LIBRARY_UPDATE', 'CourseMaterial', id, { before, after: material });
  res.json({ material });
}));

// Delete a library resource (own only for teachers).
router.delete('/library/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.courseMaterial.findUnique({ where: { id } });
  if (!before) throw httpError(404, 'Resource not found');
  await getOwnedOffering(req, before.offeringId);
  if (req.lmsUser.role === 'Teacher' && before.uploadedById && before.uploadedById !== req.lmsUser.id) {
    throw httpError(403, 'You can only delete your own resources');
  }
  await prisma.courseMaterial.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  await audit(req, 'LIBRARY_DELETE', 'CourseMaterial', id, {});
  res.json({ message: 'Resource deleted' });
}));

// ---------- LIVE CLASSES (across courses) ----------
router.get('/live-classes', asyncHandler(async (req, res) => {
  const offerings = await myOfferings(req);
  const ids = offerings.map((o) => o.id);
  const offMap = {}; for (const o of offerings) offMap[o.id] = o;
  const classes = await prisma.liveClass.findMany({
    where: { offeringId: { in: ids }, isDeleted: false },
    orderBy: { scheduledAt: 'desc' },
  });
  const bbbConfigured = bbb.isConfigured();
  res.json({
    bbbConfigured,
    offerings: offerings.map((o) => ({ id: o.id, courseCode: o.course ? o.course.code : '', courseTitle: o.course ? o.course.title : '' })),
    liveClasses: classes.map((c) => {
      const o = offMap[c.offeringId];
      const status = (c.status || '').toUpperCase();
      const canJoin = ['LIVE', 'SCHEDULED'].includes(status) && (bbbConfigured || !!c.joinUrl);
      return {
        id: c.id, title: c.title, description: c.description,
        scheduledAt: c.scheduledAt, durationMin: c.durationMin,
        status: c.status, joinUrl: c.joinUrl, recordingUrl: c.recordingUrl,
        offeringId: c.offeringId, bbbConfigured, canJoin,
        courseCode: o && o.course ? o.course.code : '',
        courseTitle: o && o.course ? o.course.title : '',
      };
    }),
  });
}));

// SCHEDULING IS COORDINATOR-ONLY (client requirement 2.1).
// Teachers may no longer create live classes; only the Course Coordinator
// builds the live-class timetable. This endpoint is intentionally blocked.
router.post('/live-classes', asyncHandler(async (req, res) => {
  throw httpError(403, 'Only the Course Coordinator can schedule live classes.');
}));

// PUT is now restricted to non-schedule fields ONLY (client requirement 2.1).
// Teachers may add a recording URL or flip status while running a class, but
// they may NOT change the topic, date/time or duration — that is the
// coordinator's responsibility. Any attempt to change scheduling fields is
// rejected with 403.
router.put('/live-classes/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.liveClass.findUnique({
    where: { id },
    include: { offering: { include: { course: true } } },
  });
  if (!before || before.isDeleted) throw httpError(404, 'Live class not found');
  await getOwnedOffering(req, before.offeringId);
  // Block scheduling changes by teachers.
  if (req.body.scheduledAt !== undefined || req.body.durationMin !== undefined || req.body.title !== undefined) {
    throw httpError(403, 'Only the Course Coordinator can change the schedule (topic, date/time or duration) of a live class.');
  }
  const data = {};
  // Only allow recording URL + status (e.g. to publish a recording).
  for (const k of ['joinUrl', 'status', 'recordingUrl']) if (req.body[k] !== undefined) data[k] = req.body[k];
  const rescheduled = false;
  const lc = await prisma.liveClass.update({ where: { id }, data });
  await audit(req, 'LIVECLASS_UPDATE', 'LiveClass', id, { before, after: lc, rescheduled });
  res.json({ liveClass: lc, rescheduled });
}));

// Reschedule is COORDINATOR-ONLY (client requirement 2.1) — blocked for teachers.
router.put('/live-classes/:id/reschedule', asyncHandler(async (req, res) => {
  throw httpError(403, 'Only the Course Coordinator can reschedule live classes.');
}));

// JOIN a live class as the moderator (teacher/host).
// When BigBlueButton is configured, ensures the meeting exists and returns
// a signed moderator join URL. Otherwise falls back to the manually
// published joinUrl on the record.
router.get('/live-classes/:id/join', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const lc = await prisma.liveClass.findUnique({
    where: { id },
    include: { offering: { include: { course: true } } },
  });
  if (!lc || lc.isDeleted) throw httpError(404, 'Live class not found');
  await getOwnedOffering(req, lc.offeringId);

  const profile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: req.lmsUser.id } });
  const hostName = (profile && profile.fullName) || req.lmsUser.username;

  let joinUrl = lc.joinUrl;
  let provider = 'manual';
  if (bbb.isConfigured()) {
    try {
      await bbb.ensureMeeting({
        liveClassId: lc.id,
        name: `${lc.offering && lc.offering.course ? lc.offering.course.code + ' — ' : ''}${lc.title}`,
        durationMin: lc.durationMin,
        record: true,
      });
      joinUrl = bbb.joinUrl({ liveClassId: lc.id, fullName: hostName, role: 'moderator', userId: req.lmsUser.id });
      provider = 'BigBlueButton';
      // Persist the BBB attendee join URL so enrolled students can join the
      // same meeting (student side reads lc.joinUrl). We store the attendee
      // variant so students do not get moderator privileges.
      const studentUrl = bbb.joinUrl({ liveClassId: lc.id, fullName: 'Student', role: 'attendee' });
      if (lc.joinUrl !== studentUrl) {
        await prisma.liveClass.update({ where: { id: lc.id }, data: { joinUrl: studentUrl, status: 'LIVE' } });
      } else if (lc.status !== 'LIVE') {
        await prisma.liveClass.update({ where: { id: lc.id }, data: { status: 'LIVE' } });
      }
    } catch (e) {
      // Fall back to manual URL if BBB call fails.
      if (!joinUrl) throw httpError(502, `Could not start the BigBlueButton meeting: ${e.message}`);
      provider = 'manual';
    }
  }
  if (!joinUrl) throw httpError(400, 'No meeting link is available. Configure BigBlueButton or set a join URL.');

  await audit(req, 'LIVECLASS_JOIN', 'LiveClass', id, { provider });
  res.json({
    join: {
      id: lc.id, title: lc.title, description: lc.description,
      status: lc.status, scheduledAt: lc.scheduledAt, durationMin: lc.durationMin,
      joinUrl, provider, role: 'moderator', hostName,
      courseCode: lc.offering && lc.offering.course ? lc.offering.course.code : '',
      courseTitle: lc.offering && lc.offering.course ? lc.offering.course.title : '',
      bbbConfigured: bbb.isConfigured(),
    },
  });
}));

// End a live class (moderator). Ends the BBB meeting if running and marks ENDED.
router.put('/live-classes/:id/end', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const lc = await prisma.liveClass.findUnique({ where: { id } });
  if (!lc || lc.isDeleted) throw httpError(404, 'Live class not found');
  await getOwnedOffering(req, lc.offeringId);
  if (bbb.isConfigured()) { try { await bbb.endMeeting({ liveClassId: id }); } catch (_) { /* ignore */ } }
  const updated = await prisma.liveClass.update({ where: { id }, data: { status: 'ENDED' } });
  await audit(req, 'LIVECLASS_END', 'LiveClass', id, {});
  res.json({ liveClass: updated });
}));

// Deleting a scheduled live class is COORDINATOR-ONLY (client requirement 2.1).
router.delete('/live-classes/:id', asyncHandler(async (req, res) => {
  throw httpError(403, 'Only the Course Coordinator can delete a scheduled live class.');
}));

// ---------- APPEALS (students of teacher's offerings) ----------
router.get('/appeals', asyncHandler(async (req, res) => {
  const offerings = await myOfferings(req);
  const offIds = offerings.map((o) => o.id);
  const offMap = {}; for (const o of offerings) offMap[o.id] = o;
  // appeals scoped to my offerings OR by students enrolled in my offerings
  const enrolled = await prisma.courseRegistration.findMany({ where: { offeringId: { in: offIds } }, select: { studentId: true } });
  const studentIds = [...new Set(enrolled.map((e) => e.studentId))];
  const teacherId = req.lmsUser.id;
  const appeals = await prisma.studentAppeal.findMany({
    where: {
      isDeleted: false,
      AND: [
        {
          OR: [
            { offeringId: { in: offIds } },
            { studentId: { in: studentIds }, offeringId: null },
          ],
        },
        {
          // Appeal routing: a teacher sees an appeal only when it is
          // EITHER legacy (no targetRole — back-compat) OR explicitly
          // addressed to THIS teacher (targetRole TEACHER + targetUserId).
          OR: [
            { targetRole: null },
            { targetRole: 'TEACHER', targetUserId: teacherId },
          ],
        },
      ],
    },
    include: { student: { include: { profile: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ appeals: appeals.map((a) => ({
    id: a.id, type: a.type, subject: a.subject, description: a.description,
    status: a.status, response: a.response, createdAt: a.createdAt, handledAt: a.handledAt,
    fileName: a.fileName, filePath: a.filePath,
    offeringId: a.offeringId,
    courseCode: a.offeringId && offMap[a.offeringId] && offMap[a.offeringId].course ? offMap[a.offeringId].course.code : null,
    studentName: a.student && a.student.profile ? a.student.profile.fullName : (a.student ? a.student.username : '—'),
    studentRoll: a.student ? a.student.username : '—',
  })) });
}));

router.put('/appeals/:id', validate([
  body('status').optional().isIn(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED']),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Appeal not found');
  // authorization: appeal must belong to an offering the teacher owns or to an enrolled student
  if (appeal.offeringId) {
    await getOwnedOffering(req, appeal.offeringId);
  } else if (req.lmsUser.role === 'Teacher') {
    const offs = await myOfferings(req);
    const offIds = offs.map((o) => o.id);
    const enrolled = await prisma.courseRegistration.findFirst({ where: { offeringId: { in: offIds }, studentId: appeal.studentId } });
    if (!enrolled) throw httpError(403, 'This appeal is not from your student');
  }
  const data = {};
  if (req.body.status !== undefined) data.status = req.body.status;
  if (req.body.response !== undefined) data.response = req.body.response;
  if (req.body.status && ['RESOLVED', 'REJECTED'].includes(req.body.status)) {
    data.handledById = req.lmsUser.id;
    data.handledAt = new Date();
  }
  const updated = await prisma.studentAppeal.update({ where: { id }, data });
  await notify(appeal.studentId, { title: 'Your request was updated', message: `Status: ${updated.status}`, type: 'APPEAL', link: '/student/appeals' });
  await audit(req, 'APPEAL_UPDATE', 'StudentAppeal', id, { before: appeal, after: updated });
  res.json({ appeal: updated });
}));

// ---------- ASSIGNMENTS (aggregate across courses) ----------
router.get('/assignments', asyncHandler(async (req, res) => {
  const offerings = await myOfferings(req);
  const ids = offerings.map((o) => o.id);
  const offMap = {}; for (const o of offerings) offMap[o.id] = o;
  const assignments = await prisma.assignment2.findMany({
    where: { offeringId: { in: ids }, isDeleted: false },
    include: { _count: { select: { submissions: true } } },
    orderBy: { dueDate: 'desc' },
  });
  // submitted (any submission) vs graded (marks != null) vs pending (marks null)
  const [graded, total, enrolled] = await Promise.all([
    prisma.assignmentSubmission.groupBy({ by: ['assignmentId'], where: { assignment: { offeringId: { in: ids } }, NOT: { marks: null } }, _count: { _all: true } }),
    prisma.assignmentSubmission.groupBy({ by: ['assignmentId'], where: { assignment: { offeringId: { in: ids } } }, _count: { _all: true } }),
    prisma.courseRegistration.groupBy({ by: ['offeringId'], where: { offeringId: { in: ids }, status: 'ENROLLED' }, _count: { _all: true } }),
  ]);
  const gradedMap = {}; for (const g of graded) gradedMap[g.assignmentId] = g._count._all;
  const totalMap = {}; for (const t of total) totalMap[t.assignmentId] = t._count._all;
  const enrolledMap = {}; for (const e of enrolled) enrolledMap[e.offeringId] = e._count._all;
  res.json({ assignments: assignments.map((a) => {
    const o = offMap[a.offeringId];
    const submitted = totalMap[a.id] || 0;
    const gradedCount = gradedMap[a.id] || 0;
    const totalStudents = enrolledMap[a.offeringId] || 0;
    return {
      id: a.id, title: a.title, description: a.description, totalMarks: a.totalMarks,
      dueDate: a.dueDate, startTime: a.startTime, endTime: a.endTime, isPublished: a.isPublished, offeringId: a.offeringId,
      courseCode: o && o.course ? o.course.code : '',
      courseTitle: o && o.course ? o.course.title : '',
      semester: o && o.course && o.course.semester ? o.course.semester.title : null,
      submissionCount: a._count.submissions,
      submitted,
      graded: gradedCount,
      pending: Math.max(0, submitted - gradedCount),
      pendingGrading: Math.max(0, submitted - gradedCount),
      totalStudents,
      notSubmitted: Math.max(0, totalStudents - submitted),
    };
  }) });
}));

// ---------- QUIZZES (aggregate across courses) ----------
router.get('/quizzes', asyncHandler(async (req, res) => {
  const offerings = await myOfferings(req);
  const ids = offerings.map((o) => o.id);
  const offMap = {}; for (const o of offerings) offMap[o.id] = o;
  const quizzes = await prisma.quiz.findMany({
    where: { offeringId: { in: ids }, isDeleted: false },
    include: { _count: { select: { questions: true, attempts: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ quizzes: quizzes.map((q) => {
    const o = offMap[q.offeringId];
    return {
      id: q.id, title: q.title, description: q.description, totalMarks: q.totalMarks,
      durationMin: q.durationMin, isPublished: q.isPublished, offeringId: q.offeringId,
      courseCode: o && o.course ? o.course.code : '',
      courseTitle: o && o.course ? o.course.title : '',
      questionCount: q._count.questions,
      attemptCount: q._count.attempts,
    };
  }) });
}));

// ============================================================
// MESSAGES (teacher side) — Req 10: real-time 1-to-1 + course group
// chat, file/image sharing, read receipts, online/offline presence,
// search and notifications.
// ============================================================

// --- Upload a message attachment (returns URL to embed in a message) ---
router.post('/messages/attachment', uploadLmsMessage.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, 'No file uploaded');
  const url = `/uploads/lms-messages/${req.file.filename}`;
  const isImage = /^image\//.test(req.file.mimetype);
  res.status(201).json({
    attachmentUrl: url,
    attachmentName: req.file.originalname,
    attachmentType: isImage ? 'image' : (req.file.mimetype || 'file'),
  });
}));

// --- Contacts (students) + course groups, with unread counts & presence ---
router.get('/messages/contacts', asyncHandler(async (req, res) => {
  const teacherId = req.lmsUser.id;
  // Sync course groups first so they always reflect current enrollment.
  const synced = await syncCourseGroups(req);
  const offerings = await myOfferings(req);
  const ids = offerings.map((o) => o.id);
  const offMap = {}; for (const o of offerings) offMap[o.id] = o;
  const regs = await prisma.courseRegistration.findMany({
    where: { offeringId: { in: ids } },
    include: { student: { include: { profile: true } } },
  });
  const map = {};
  for (const r of regs) {
    if (!r.student) continue;
    if (!map[r.student.id]) {
      map[r.student.id] = {
        id: r.student.id,
        name: r.student.profile ? r.student.profile.fullName : r.student.username,
        roll: r.student.username,
        photoUrl: r.student.profile ? r.student.profile.photoUrl : null,
        courses: [],
      };
    }
    const o = offMap[r.offeringId];
    if (o && o.course) map[r.student.id].courses.push(o.course.code);
  }
  const unread = await prisma.lmsThreadMessage.groupBy({
    by: ['senderId'], where: { recipientId: teacherId, isRead: false, groupId: null }, _count: { _all: true },
  });
  const unreadMap = {}; for (const u of unread) unreadMap[u.senderId] = u._count._all;
  const contacts = Object.values(map).map((c) => ({
    ...c,
    courses: [...new Set(c.courses)],
    unread: unreadMap[c.id] || 0,
    online: realtime.isOnline(c.id),
  }));

  // Build group summaries with unread counts.
  const groups = [];
  for (const { group, offering } of synced) {
    const member = await prisma.lmsMessageGroupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: teacherId } },
    });
    const memberCount = await prisma.lmsMessageGroupMember.count({ where: { groupId: group.id } });
    const unreadCount = await prisma.lmsThreadMessage.count({
      where: { groupId: group.id, id: { gt: member ? member.lastReadMessageId : 0 }, senderId: { not: teacherId } },
    });
    groups.push({
      id: group.id,
      name: group.name,
      courseCode: offering.course ? offering.course.code : null,
      memberCount,
      unread: unreadCount,
    });
  }

  res.json({ contacts, groups });
}));

// --- Group message thread ---
router.get('/messages/group/:groupId', asyncHandler(async (req, res) => {
  const teacherId = req.lmsUser.id;
  const groupId = parseInt(req.params.groupId, 10);
  const member = await prisma.lmsMessageGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: teacherId } },
  });
  if (!member) throw httpError(403, 'You are not a member of this group');
  const messages = await prisma.lmsThreadMessage.findMany({
    where: { groupId }, orderBy: { createdAt: 'asc' }, take: 300,
    include: { sender: { include: { profile: true } } },
  });
  // Mark group as read up to the latest message for this member.
  const lastId = messages.length ? messages[messages.length - 1].id : member.lastReadMessageId;
  if (lastId > member.lastReadMessageId) {
    await prisma.lmsMessageGroupMember.update({ where: { id: member.id }, data: { lastReadMessageId: lastId } });
  }
  res.json({
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderId === teacherId,
      senderId: m.senderId,
      senderName: m.sender && m.sender.profile ? m.sender.profile.fullName : (m.sender ? m.sender.username : 'Unknown'),
      attachmentUrl: m.attachmentUrl,
      attachmentName: m.attachmentName,
      attachmentType: m.attachmentType,
      createdAt: m.createdAt,
    })),
  });
}));

// --- Post to a course group ---
router.post('/messages/group/:groupId', validate([
  body('body').optional().isString(),
]), asyncHandler(async (req, res) => {
  const teacherId = req.lmsUser.id;
  const groupId = parseInt(req.params.groupId, 10);
  const member = await prisma.lmsMessageGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: teacherId } },
  });
  if (!member) throw httpError(403, 'You are not a member of this group');
  const bodyText = String(req.body.body || '').slice(0, 4000);
  if (!bodyText && !req.body.attachmentUrl) throw httpError(400, 'Message body or attachment required');
  const group = await prisma.lmsMessageGroup.findUnique({ where: { id: groupId } });
  const message = await prisma.lmsThreadMessage.create({
    data: {
      senderId: teacherId,
      recipientId: null,
      groupId,
      body: bodyText,
      attachmentUrl: req.body.attachmentUrl || null,
      attachmentName: req.body.attachmentName || null,
      attachmentType: req.body.attachmentType || null,
    },
  });
  // Bump owner's read pointer (own message is read).
  await prisma.lmsMessageGroupMember.update({ where: { id: member.id }, data: { lastReadMessageId: message.id } });
  // Emit to all group members in real time.
  const members = await prisma.lmsMessageGroupMember.findMany({ where: { groupId }, select: { userId: true } });
  const memberIds = members.map((m) => m.userId);
  const senderName = req.lmsUser.username;
  realtime.emitTo(memberIds, 'message', {
    action: 'group',
    groupId,
    groupName: group ? group.name : null,
    message: { id: message.id, body: message.body, senderId: teacherId, senderName, mine: false, attachmentUrl: message.attachmentUrl, attachmentName: message.attachmentName, attachmentType: message.attachmentType, createdAt: message.createdAt },
  });
  // Notify offline members.
  for (const uid of memberIds) {
    if (uid === teacherId) continue;
    notify(uid, { title: `New message in ${group ? group.name : 'course group'}`, message: `${senderName}: ${bodyText.slice(0, 80)}`, type: 'MESSAGE', link: '/student/messages' }).catch(() => {});
  }
  res.status(201).json({ message: { id: message.id, body: message.body, mine: true, attachmentUrl: message.attachmentUrl, attachmentName: message.attachmentName, attachmentType: message.attachmentType, createdAt: message.createdAt } });
}));

// --- 1-to-1 thread ---
router.get('/messages/:userId', asyncHandler(async (req, res) => {
  const teacherId = req.lmsUser.id;
  const otherId = req.params.userId;
  const messages = await prisma.lmsThreadMessage.findMany({
    where: { groupId: null, OR: [ { senderId: teacherId, recipientId: otherId }, { senderId: otherId, recipientId: teacherId } ] },
    orderBy: { createdAt: 'asc' }, take: 300,
  });
  // Mark incoming as read, emit read receipt to the other party.
  const unreadIds = messages.filter((m) => m.senderId === otherId && !m.isRead).map((m) => m.id);
  if (unreadIds.length) {
    await prisma.lmsThreadMessage.updateMany({ where: { id: { in: unreadIds } }, data: { isRead: true } });
    realtime.emitTo([otherId], 'message', { action: 'read', by: teacherId });
  }
  res.json({
    messages: messages.map((m) => ({
      id: m.id, body: m.body, subject: m.subject, mine: m.senderId === teacherId,
      attachmentUrl: m.attachmentUrl, attachmentName: m.attachmentName, attachmentType: m.attachmentType,
      createdAt: m.createdAt, isRead: m.isRead,
    })),
    online: realtime.isOnline(otherId),
  });
}));

router.post('/messages/:userId', validate([
  body('body').optional().isString(),
]), asyncHandler(async (req, res) => {
  const teacherId = req.lmsUser.id;
  const recipientId = req.params.userId;
  // verify recipient is enrolled in one of teacher's offerings
  const offerings = await myOfferings(req);
  const ids = offerings.map((o) => o.id);
  const enrolled = await prisma.courseRegistration.findFirst({ where: { offeringId: { in: ids }, studentId: recipientId } });
  if (!enrolled && req.lmsUser.role === 'Teacher') throw httpError(403, 'You can only message students in your courses');
  const bodyText = String(req.body.body || '').slice(0, 4000);
  if (!bodyText && !req.body.attachmentUrl) throw httpError(400, 'Message body or attachment required');
  const message = await prisma.lmsThreadMessage.create({
    data: {
      senderId: teacherId, recipientId, subject: req.body.subject || null, body: bodyText,
      attachmentUrl: req.body.attachmentUrl || null,
      attachmentName: req.body.attachmentName || null,
      attachmentType: req.body.attachmentType || null,
    },
  });
  const payload = { id: message.id, body: message.body, mine: false, attachmentUrl: message.attachmentUrl, attachmentName: message.attachmentName, attachmentType: message.attachmentType, createdAt: message.createdAt };
  realtime.emitTo([recipientId, teacherId], 'message', { action: 'direct', from: teacherId, to: recipientId, message: payload });
  await notify(recipientId, { title: 'New message from your teacher', message: `${req.lmsUser.username} sent you a message`, type: 'MESSAGE', link: '/student/messages' });
  res.status(201).json({ message: { ...payload, mine: true } });
}));

// ---------- PROFILE / SETTINGS ----------
router.get('/profile', asyncHandler(async (req, res) => {
  const profile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: req.lmsUser.id } });
  res.json({ profile, username: req.lmsUser.username, role: req.lmsUser.role });
}));

// Ensures a profile row exists for the current LMS user. Teachers created
// outside the admissions flow may have no LmsStudentProfile yet; the model
// requires several non-null columns, so we seed them with empty placeholders
// (NOT display mock data — these are blank strings the teacher fills in via
// Settings) so the full editable profile can function for everyone.
async function ensureProfile(req) {
  let profile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: req.lmsUser.id } });
  if (profile) return profile;
  profile = await prisma.lmsStudentProfile.create({
    data: {
      lmsUserId: req.lmsUser.id,
      fullName: req.lmsUser.username || '',
      fatherName: '', cnic: '', dateOfBirth: '', gender: '',
      program: '', programShortForm: '', department: '',
      rollNumber: '', registrationNumber: '', session: '',
      enrollmentDate: new Date(),
    },
  });
  return profile;
}

router.put('/profile', validate([
  body('phone').optional().isString(),
  body('email').optional().isString(),
  body('address').optional().isString(),
]), asyncHandler(async (req, res) => {
  await ensureProfile(req);
  const data = {};
  const setStr = (key, max) => { if (req.body[key] !== undefined) data[key] = String(req.body[key]).slice(0, max); };
  // Contact info
  setStr('phone', 30);
  setStr('email', 120);
  setStr('address', 300);
  setStr('whatsapp', 30);
  setStr('maritalStatus', 30);
  // Personal info (full editable profile per Settings spec)
  if (req.body.fullName !== undefined && String(req.body.fullName).trim()) setStr('fullName', 120);
  if (req.body.fatherName !== undefined) setStr('fatherName', 120);
  if (req.body.cnic !== undefined) setStr('cnic', 30);
  if (req.body.dateOfBirth !== undefined) setStr('dateOfBirth', 30);
  if (req.body.gender !== undefined) setStr('gender', 20);
  const profile = await prisma.lmsStudentProfile.update({ where: { lmsUserId: req.lmsUser.id }, data });
  await audit(req, 'PROFILE_UPDATE', 'LmsStudentProfile', profile.id, { after: data });
  res.json({ profile });
}));

// Upload / update the teacher's profile photo (avatar).
router.post('/profile/photo', uploadLmsAvatar.single('photo'), asyncHandler(async (req, res) => {
  await ensureProfile(req);
  if (!req.file) throw httpError(400, 'No photo uploaded');
  const photoUrl = `/uploads/lms-avatars/${req.file.filename}`;
  const profile = await prisma.lmsStudentProfile.update({ where: { lmsUserId: req.lmsUser.id }, data: { photoUrl } });
  await audit(req, 'PROFILE_PHOTO_UPDATE', 'LmsStudentProfile', profile.id, { after: { photoUrl } });
  // Real-time push: notify the teacher's own open sessions so any header /
  // sidebar avatar refreshes immediately without a manual page reload.
  try { realtime.emitTo([req.lmsUser.id], 'profile:update', { photoUrl }); } catch (_) { /* noop */ }
  res.json({ profile, photoUrl });
}));

// ------------------------------------------------------------
// CHANGE PASSWORD — teacher updates their own password.
//  Verifies the current password, enforces the strong-password policy,
//  stores the new bcrypt hash (saltRounds 12) and clears the
//  must-change flag. After this call ONLY the new password is accepted
//  at the next login (the old hash is overwritten). LMS-side only —
//  the Admissions System is never touched.
// ------------------------------------------------------------
router.put('/me/password', validate([
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
]), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const full = await prisma.lmsUser.findUnique({ where: { id: req.lmsUser.id } });
  if (!full) throw httpError(404, 'Account not found');
  const ok = await bcrypt.compare(String(currentPassword), full.passwordHash);
  if (!ok) throw httpError(400, 'Current password is incorrect');
  if (String(currentPassword) === String(newPassword)) {
    throw httpError(400, 'New password must be different from the current password');
  }
  if (!STRONG_PW.test(String(newPassword))) {
    throw httpError(400, 'Password must be 8+ chars with an uppercase letter, a number and a special character');
  }
  const passwordHash = await bcrypt.hash(String(newPassword), 12);
  await prisma.lmsUser.update({
    where: { id: req.lmsUser.id },
    data: { passwordHash, mustChangePassword: false },
  });
  await audit(req, 'PASSWORD_CHANGE', 'LmsUser', req.lmsUser.id, {});
  res.json({ message: 'Password changed successfully' });
}));

router.get('/settings', asyncHandler(async (req, res) => {
  let prefs = await prisma.notificationPref.findUnique({ where: { studentId: req.lmsUser.id } });
  if (!prefs) prefs = await prisma.notificationPref.create({ data: { studentId: req.lmsUser.id } });
  res.json({ settings: prefs });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const allowed = ['emailEnabled', 'pushEnabled', 'assignmentAlerts', 'quizAlerts', 'resultAlerts', 'announcementAlerts', 'language', 'theme'];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
  const prefs = await prisma.notificationPref.upsert({
    where: { studentId: req.lmsUser.id }, update: data, create: { studentId: req.lmsUser.id, ...data },
  });
  res.json({ settings: prefs });
}));

// ============================================================
// WEEKLY SCHEDULE / TIMETABLE — teacher sees ONLY their own classes
// ============================================================
router.get('/schedule', asyncHandler(async (req, res) => {
  const where = offeringWhereForTeacher(req); // { isDeleted:false, teacherId } for Teacher
  const myOfferingsList = await prisma.courseOffering.findMany({ where, select: { id: true } });
  const offeringIds = myOfferingsList.map((o) => o.id);
  const slots = await prisma.scheduleSlot.findMany({
    where: { offeringId: { in: offeringIds }, isDeleted: false },
    include: { offering: { include: { course: true } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay = days.map((name, i) => ({ day: name, dayOfWeek: i, slots: [] }));
  for (const s of slots) {
    byDay[s.dayOfWeek].slots.push({
      id: s.id,
      courseCode: s.offering.course.code,
      courseTitle: s.offering.course.title,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
      mode: s.mode,
      slotType: s.slotType || 'THEORY',
    });
  }
  res.json({ schedule: byDay });
}));

module.exports = router;



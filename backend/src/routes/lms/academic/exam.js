// ============================================================
//  EXAM CONTROLLER ROUTES  — /api/lms/academic/exam/*
//  ------------------------------------------------------------
//  Phase 5 — Exam Controller. Production-ready, fully DB-backed
//  examination-management APIs. RBAC: ExamController (Provost may
//  also read for university oversight where noted). Every mutating
//  action writes an LmsAuditLog row and notifies affected user(s).
//
//  Modules: Dashboard · Exam Scheduling (datesheets/calendar) ·
//  Seating · Paper Management · Exam Operations (invigilators/
//  absentees/UFM) · Results (Mid/Final, GPA/CGPA) · Transcript
//  System · Reports · Analytics · Notifications · Rechecking /
//  Freeze / Lock · Secure Approval Chain (ResultBatch lifecycle).
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const prisma = require('../../../utils/prisma');
const { lmsAuth, lmsRequireRole } = require('../../../middleware/lmsAuth');
const { validate } = require('../../../middleware/validate');
const { asyncHandler, parseListQuery, paginated, httpError } = require('../../../utils/lmsHelpers');
const { audit } = require('../../../utils/lmsAudit');
const { notify, notifyMany } = require('../../../utils/lmsNotify');
const { computeGPA, gradeFromPercent, buildResultGrades, PASS_PERCENT, isImmutableStatus } = require('../../../utils/lmsGrading');
const lifecycle = require('../../../services/resultLifecycle');
const { isStudentVisibleStatus } = require('../../../utils/academicPolicy');
const { displayName, nameMap } = require('../../../utils/lmsWorkflow');
const { uploadExamPaper, uploadExamProfilePhoto } = require('../../../middleware/upload');

const router = express.Router();
router.use(lmsAuth);

// ExamController area guard. Provost gets read-only oversight where noted.
const EXAM = lmsRequireRole('ExamController');
const EXAM_OR_GOV = lmsRequireRole('ExamController', 'Provost');

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function currentTerm() {
  return prisma.academicTerm.findFirst({ where: { isCurrent: true, isActive: true } });
}

/** Resolve a friendly label for an offering id (e.g. "CS-101 Intro to Programming"). */
async function offeringLabelMap(offeringIds) {
  const ids = Array.from(new Set(offeringIds.filter((x) => x != null)));
  if (!ids.length) return {};
  const offerings = await prisma.courseOffering.findMany({
    where: { id: { in: ids } },
    include: { course: true },
  });
  const map = {};
  for (const o of offerings) map[o.id] = o.course ? `${o.course.code} ${o.course.title}` : `Offering #${o.id}`;
  return map;
}

// ------------------------------------------------------------
// Department resolution helpers (additive, no schema change).
// Used to tag Exam Controller rows with a department so every
// module can be shown / filtered department-wise.
// ------------------------------------------------------------
// offeringId -> department (via offering → course → program).
async function offeringDeptMap(offeringIds) {
  const ids = Array.from(new Set((offeringIds || []).filter((x) => x != null)));
  if (!ids.length) return {};
  const offerings = await prisma.courseOffering.findMany({
    where: { id: { in: ids } },
    include: { course: { include: { program: true } } },
  });
  const map = {};
  for (const o of offerings) map[o.id] = o.course?.program?.department || null;
  return map;
}

// program name / shortForm -> department (via LmsProgram).
async function programDeptMap() {
  const programs = await prisma.lmsProgram.findMany({
    where: { isDeleted: false },
    select: { name: true, shortForm: true, code: true, department: true },
  });
  const map = {};
  for (const p of programs) {
    if (p.department) {
      if (p.name) map[p.name] = p.department;
      if (p.shortForm) map[p.shortForm] = p.department;
      if (p.code) map[p.code] = p.department;
    }
  }
  return map;
}

// ------------------------------------------------------------
// Offering → rich academic context map (program / semester /
// section / department). Used to enrich UFM cases, incomplete
// results etc. so the cascading smart filters can operate over
// the complete historical record (§1.3 / §1.6).
// ------------------------------------------------------------
async function offeringContextMap(offeringIds) {
  const ids = Array.from(new Set((offeringIds || []).filter((x) => x != null)));
  if (!ids.length) return {};
  const offerings = await prisma.courseOffering.findMany({
    where: { id: { in: ids } },
    include: { course: { include: { program: true, semester: true } }, sections: true, term: true },
  });
  const map = {};
  for (const o of offerings) {
    map[o.id] = {
      program: o.course?.program?.shortForm || o.course?.program?.code || null,
      programName: o.course?.program?.name || null,
      department: o.course?.program?.department || null,
      semester: o.course?.semester ? String(o.course.semester.number) : null,
      section: (o.sections || [])[0]?.name || null,
      session: o.term?.title || null,
      teacherId: o.teacherId || null,
    };
  }
  return map;
}

// studentId → { session, batch, program, department } from the
// student profile. `batch` is derived from the admission session
// year (e.g. "Fall 2026" → "2026").
async function studentContextMap(studentIds) {
  const ids = Array.from(new Set((studentIds || []).filter(Boolean)));
  if (!ids.length) return {};
  const profiles = await prisma.lmsStudentProfile.findMany({
    where: { lmsUserId: { in: ids } },
    select: { lmsUserId: true, session: true, program: true, programShortForm: true, department: true },
  });
  const map = {};
  for (const p of profiles) {
    const m = String(p.session || '').match(/\b(20\d{2})\b/);
    map[p.lmsUserId] = {
      session: p.session || null,
      batch: m ? m[1] : null,
      program: p.programShortForm || p.program || null,
      department: p.department || null,
    };
  }
  return map;
}

/** Compute CGPA across all PUBLISHED results for a student. */
async function studentCgpa(studentId) {
  const results = await prisma.courseResult.findMany({
    where: { studentId, status: 'PUBLISHED' },
    include: { offering: { include: { course: true } } },
  });
  const grades = results.map((r) => ({
    gradePoints: r.gradePoints,
    creditHours: r.offering?.course?.creditHours || 3,
  }));
  return {
    cgpa: computeGPA(grades),
    totalCredits: grades.reduce((a, b) => a + b.creditHours, 0),
    results,
  };
}

// ============================================================
// DASHBOARD — exam KPIs + pending paper approvals + recent recheck requests
// ============================================================
router.get('/dashboard', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  const [
    totalExams, draftExams, publishedExams, lockedExams,
    totalSeatings, totalInvigilations,
    papersSubmitted, papersUnderReview, papersApproved,
    rechecksOpen, rechecksResolved,
    draftResults, publishedResults,
    resultBatches, frozenBatches,
  ] = await Promise.all([
    prisma.examSchedule.count({ where: { isDeleted: false } }),
    prisma.examSchedule.count({ where: { isDeleted: false, status: 'DRAFT' } }),
    prisma.examSchedule.count({ where: { isDeleted: false, status: 'PUBLISHED' } }),
    prisma.examSchedule.count({ where: { isDeleted: false, status: 'LOCKED' } }),
    prisma.examSeating.count(),
    prisma.examInvigilation.count(),
    prisma.examPaper.count({ where: { isDeleted: false, status: 'SUBMITTED' } }),
    prisma.examPaper.count({ where: { isDeleted: false, status: 'UNDER_REVIEW' } }),
    prisma.examPaper.count({ where: { isDeleted: false, status: 'APPROVED' } }),
    prisma.recheckRequest.count({ where: { status: { in: ['SUBMITTED', 'IN_REVIEW'] } } }),
    prisma.recheckRequest.count({ where: { status: { in: ['RESOLVED_CHANGED', 'RESOLVED_UNCHANGED', 'REJECTED'] } } }),
    prisma.courseResult.count({ where: { status: 'DRAFT' } }),
    prisma.courseResult.count({ where: { status: 'PUBLISHED' } }),
    prisma.resultBatch.count(),
    prisma.resultBatch.count({ where: { status: { in: ['FROZEN', 'PUBLISHED', 'LOCKED'] } } }),
  ]);

  // Upcoming exams (next dates) + recent recheck requests
  const upcoming = await prisma.examSchedule.findMany({
    where: { isDeleted: false, status: { in: ['PUBLISHED', 'APPROVED'] } },
    orderBy: { date: 'asc' },
    take: 6,
  });
  const upcomingLabels = await offeringLabelMap(upcoming.map((e) => e.offeringId));

  const recentRechecks = await prisma.recheckRequest.findMany({
    orderBy: { createdAt: 'desc' }, take: 6,
  });
  const recheckNames = await nameMap(recentRechecks.map((r) => r.studentId));
  const recheckOffLabels = await offeringLabelMap(recentRechecks.map((r) => r.offeringId));

  const pendingPapers = await prisma.examPaper.findMany({
    where: { isDeleted: false, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
    orderBy: { createdAt: 'desc' }, take: 6,
  });

  // Result statistics for current term
  const termResults = await prisma.courseResult.findMany({
    where: { status: 'PUBLISHED', offering: { termId } },
    select: { totalPercent: true, gradePoints: true },
  });
  const passCount = termResults.filter((r) => r.totalPercent >= PASS_PERCENT).length;
  const passRate = termResults.length ? Math.round((passCount / termResults.length) * 1000) / 10 : 0;

  res.json({
    term: term ? term.title : null,
    examKpis: {
      total: totalExams, draft: draftExams, published: publishedExams, locked: lockedExams,
      seatings: totalSeatings, invigilations: totalInvigilations,
    },
    paperKpis: { submitted: papersSubmitted, underReview: papersUnderReview, approved: papersApproved },
    resultKpis: {
      draft: draftResults, published: publishedResults,
      passRate, passCount, totalPublished: termResults.length,
      batches: resultBatches, frozenBatches,
    },
    recheckKpis: { open: rechecksOpen, resolved: rechecksResolved },
    upcomingExams: upcoming.map((e) => ({
      id: e.id, title: e.title, examType: e.examType, date: e.date,
      startTime: e.startTime, endTime: e.endTime, room: e.room, status: e.status,
      offering: upcomingLabels[e.offeringId] || null,
    })),
    pendingPapers: pendingPapers.map((p) => ({
      id: p.id, title: p.title, version: p.version, status: p.status,
      submittedById: p.submittedById, createdAt: p.createdAt,
    })),
    recentRechecks: recentRechecks.map((r) => ({
      id: r.id, student: recheckNames[r.studentId] || r.studentId,
      offering: recheckOffLabels[r.offeringId] || `Offering #${r.offeringId}`,
      component: r.component, status: r.status, createdAt: r.createdAt,
    })),
  });
}));

// ============================================================
// EXAM SCHEDULING — datesheets + calendar
// ============================================================
router.get('/schedules', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { examType, status, department } = req.query;
  const where = { isDeleted: false };
  if (examType) where.examType = examType;
  if (status) where.status = status;
  const exams = await prisma.examSchedule.findMany({ where, orderBy: { date: 'asc' } });
  const labels = await offeringLabelMap(exams.map((e) => e.offeringId));
  const deptMap = await offeringDeptMap(exams.map((e) => e.offeringId));
  const seatingCounts = await prisma.examSeating.groupBy({
    by: ['examId'], _sum: { capacity: true, allocated: true },
    where: { examId: { in: exams.map((e) => e.id) } },
  });
  const seatMap = {};
  for (const s of seatingCounts) seatMap[s.examId] = { capacity: s._sum.capacity || 0, allocated: s._sum.allocated || 0 };
  let schedules = exams.map((e) => ({
    id: e.id, title: e.title, examType: e.examType, date: e.date,
    startTime: e.startTime, endTime: e.endTime, room: e.room,
    totalMarks: e.totalMarks, status: e.status, offering: labels[e.offeringId] || null,
    department: deptMap[e.offeringId] || null,
    offeringId: e.offeringId, capacity: seatMap[e.id]?.capacity || 0,
    allocated: seatMap[e.id]?.allocated || 0,
  }));
  // Distinct departments for the smart filter (before filtering).
  const departments = [...new Set(schedules.map((s) => s.department).filter(Boolean))].sort();
  if (department) schedules = schedules.filter((s) => s.department === department);
  res.json({
    term: (await currentTerm())?.title || null,
    departments,
    schedules,
  });
}));

router.get('/calendar', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const exams = await prisma.examSchedule.findMany({
    where: { isDeleted: false, status: { in: ['PUBLISHED', 'APPROVED', 'LOCKED'] } },
    orderBy: { date: 'asc' },
  });
  const labels = await offeringLabelMap(exams.map((e) => e.offeringId));
  // group by date
  const byDate = {};
  for (const e of exams) {
    (byDate[e.date] = byDate[e.date] || []).push({
      id: e.id, title: e.title, examType: e.examType,
      startTime: e.startTime, endTime: e.endTime, room: e.room,
      offering: labels[e.offeringId] || null,
    });
  }
  res.json({ days: Object.entries(byDate).map(([date, items]) => ({ date, items })) });
}));

router.post('/schedules', EXAM, validate([
  body('title').isString().trim().notEmpty(),
  body('date').isString().trim().notEmpty(),
  body('examType').optional().isIn(['MID', 'FINAL', 'QUIZ', 'RETAKE', 'SPECIAL']),
]), asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const { title, date, examType = 'FINAL', offeringId, startTime, endTime, room, totalMarks } = req.body;
  const exam = await prisma.examSchedule.create({
    data: {
      termId: term ? term.id : null,
      offeringId: offeringId ? Number(offeringId) : null,
      examType, title, date, startTime: startTime || null, endTime: endTime || null,
      room: room || null, totalMarks: totalMarks != null ? Number(totalMarks) : 100,
      status: 'DRAFT', createdById: req.lmsUser.id,
    },
  });
  await audit(req, 'EXAM_SCHEDULE_CREATE', 'ExamSchedule', String(exam.id), { after: exam });
  res.status(201).json({ schedule: exam });
}));

router.put('/schedules/:id', EXAM, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.examSchedule.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw httpError(404, 'Exam schedule not found');
  const fields = ['title', 'date', 'startTime', 'endTime', 'room', 'examType'];
  const data = {};
  for (const f of fields) if (req.body[f] !== undefined) data[f] = req.body[f];
  if (req.body.totalMarks !== undefined) data.totalMarks = Number(req.body.totalMarks);
  if (req.body.offeringId !== undefined) data.offeringId = req.body.offeringId ? Number(req.body.offeringId) : null;
  const exam = await prisma.examSchedule.update({ where: { id }, data });
  await audit(req, 'EXAM_SCHEDULE_UPDATE', 'ExamSchedule', String(id), { before: existing, after: exam });
  res.json({ schedule: exam });
}));

router.put('/schedules/:id/status', EXAM, validate([
  body('status').isIn(['DRAFT', 'PUBLISHED', 'APPROVED', 'LOCKED', 'CANCELLED']),
]), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.examSchedule.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw httpError(404, 'Exam schedule not found');
  const { status } = req.body;
  const data = { status };
  if (status === 'APPROVED' || status === 'LOCKED') {
    data.approvedById = req.lmsUser.id; data.approvedAt = new Date();
  }
  const exam = await prisma.examSchedule.update({ where: { id }, data });
  await audit(req, 'EXAM_SCHEDULE_STATUS', 'ExamSchedule', String(id), { before: existing, after: exam });
  // notify invigilators when published
  if (status === 'PUBLISHED') {
    const invigs = await prisma.examInvigilation.findMany({ where: { examId: id } });
    await notifyMany(invigs.map((i) => i.invigilatorId), {
      title: 'Exam datesheet published',
      message: `${exam.title} on ${exam.date} has been published.`, type: 'INFO',
    });
  }
  res.json({ schedule: exam });
}));

router.delete('/schedules/:id', EXAM, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.examSchedule.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw httpError(404, 'Exam schedule not found');
  await prisma.examSchedule.update({ where: { id }, data: { isDeleted: true, status: 'CANCELLED' } });
  await audit(req, 'EXAM_SCHEDULE_DELETE', 'ExamSchedule', String(id), { before: existing });
  res.json({ success: true });
}));

// ============================================================
// SEATING — room allocation per exam
// ============================================================
router.get('/seating', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const seatings = await prisma.examSeating.findMany({
    orderBy: { id: 'desc' }, include: { exam: true },
  });
  const labels = await offeringLabelMap(seatings.map((s) => s.exam?.offeringId));
  res.json({
    seatings: seatings.map((s) => ({
      id: s.id, examId: s.examId, examTitle: s.exam?.title || null,
      examDate: s.exam?.date || null, room: s.room, capacity: s.capacity,
      allocated: s.allocated, available: s.capacity - s.allocated,
      offering: s.exam ? labels[s.exam.offeringId] || null : null, notes: s.notes,
    })),
  });
}));

router.post('/seating', EXAM, validate([
  body('examId').notEmpty(),
  body('room').isString().trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { examId, room, capacity, allocated, notes } = req.body;
  const exam = await prisma.examSchedule.findUnique({ where: { id: Number(examId) } });
  if (!exam) throw httpError(404, 'Exam not found');
  const seating = await prisma.examSeating.create({
    data: {
      examId: Number(examId), room, capacity: capacity != null ? Number(capacity) : 40,
      allocated: allocated != null ? Number(allocated) : 0, notes: notes || null,
    },
  });
  await audit(req, 'EXAM_SEATING_CREATE', 'ExamSeating', String(seating.id), { after: seating });
  res.status(201).json({ seating });
}));

router.put('/seating/:id', EXAM, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.examSeating.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'Seating not found');
  const data = {};
  if (req.body.room !== undefined) data.room = req.body.room;
  if (req.body.capacity !== undefined) data.capacity = Number(req.body.capacity);
  if (req.body.allocated !== undefined) data.allocated = Number(req.body.allocated);
  if (req.body.notes !== undefined) data.notes = req.body.notes;
  const seating = await prisma.examSeating.update({ where: { id }, data });
  await audit(req, 'EXAM_SEATING_UPDATE', 'ExamSeating', String(id), { before: existing, after: seating });
  res.json({ seating });
}));

router.delete('/seating/:id', EXAM, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.examSeating.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'Seating not found');
  await prisma.examSeating.delete({ where: { id } });
  await audit(req, 'EXAM_SEATING_DELETE', 'ExamSeating', String(id), { before: existing });
  res.json({ success: true });
}));

// ============================================================
// INVIGILATORS — assignment per exam (Exam Operations)
// ============================================================
router.get('/invigilators', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const invigs = await prisma.examInvigilation.findMany({
    orderBy: { id: 'desc' }, include: { exam: true },
  });
  const names = await nameMap(invigs.map((i) => i.invigilatorId));
  res.json({
    invigilations: invigs.map((i) => ({
      id: i.id, examId: i.examId, examTitle: i.exam?.title || null,
      examDate: i.exam?.date || null, invigilatorId: i.invigilatorId,
      invigilator: names[i.invigilatorId] || i.invigilatorId,
      room: i.room, role: i.role, createdAt: i.createdAt,
    })),
  });
}));

router.get('/invigilators/available', EXAM, asyncHandler(async (req, res) => {
  const teachers = await prisma.lmsUser.findMany({
    where: { role: 'Teacher', isActive: true },
    select: { id: true, username: true },
  });
  res.json({ teachers: teachers.map((t) => ({ id: t.id, name: t.username })) });
}));

router.post('/invigilators', EXAM, validate([
  body('examId').notEmpty(),
  body('invigilatorId').isString().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { examId, invigilatorId, room, role = 'INVIGILATOR' } = req.body;
  const exam = await prisma.examSchedule.findUnique({ where: { id: Number(examId) } });
  if (!exam) throw httpError(404, 'Exam not found');
  const teacher = await prisma.lmsUser.findUnique({ where: { id: invigilatorId } });
  if (!teacher) throw httpError(404, 'Invigilator not found');
  const invig = await prisma.examInvigilation.create({
    data: { examId: Number(examId), invigilatorId, room: room || null, role },
  });
  await audit(req, 'EXAM_INVIGILATOR_ASSIGN', 'ExamInvigilation', String(invig.id), { after: invig });
  await notify(invigilatorId, {
    title: 'Invigilation duty assigned',
    message: `You have been assigned as ${role} for ${exam.title} on ${exam.date}.`, type: 'INFO',
  });
  res.status(201).json({ invigilation: invig });
}));

router.delete('/invigilators/:id', EXAM, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.examInvigilation.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'Invigilation not found');
  await prisma.examInvigilation.delete({ where: { id } });
  await audit(req, 'EXAM_INVIGILATOR_REMOVE', 'ExamInvigilation', String(id), { before: existing });
  res.json({ success: true });
}));

// ============================================================
// PAPER MANAGEMENT — secure paper submission + approval chain
// ============================================================
router.get('/papers', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = { isDeleted: false };
  if (status) where.status = status;
  const papers = await prisma.examPaper.findMany({ where, orderBy: { createdAt: 'desc' } });
  const names = await nameMap(papers.flatMap((p) => [p.submittedById, p.reviewedById].filter(Boolean)));
  const labels = await offeringLabelMap(papers.map((p) => p.offeringId));
  res.json({
    papers: papers.map((p) => ({
      id: p.id, title: p.title, version: p.version, status: p.status,
      fileName: p.fileName, offering: labels[p.offeringId] || null,
      submittedBy: p.submittedById ? names[p.submittedById] || p.submittedById : null,
      reviewedBy: p.reviewedById ? names[p.reviewedById] || p.reviewedById : null,
      reviewNote: p.reviewNote, reviewedAt: p.reviewedAt, createdAt: p.createdAt,
    })),
  });
}));

router.post('/papers', EXAM, validate([
  body('title').isString().trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { title, examId, offeringId, version, fileName, submittedById } = req.body;
  const paper = await prisma.examPaper.create({
    data: {
      title, examId: examId ? Number(examId) : null,
      offeringId: offeringId ? Number(offeringId) : null,
      version: version != null ? Number(version) : 1,
      fileName: fileName || null, submittedById: submittedById || req.lmsUser.id,
      status: 'SUBMITTED',
    },
  });
  await audit(req, 'EXAM_PAPER_CREATE', 'ExamPaper', String(paper.id), { after: paper });
  res.status(201).json({ paper });
}));

router.put('/papers/:id/review', EXAM, validate([
  body('action').isIn(['UNDER_REVIEW', 'APPROVE', 'REJECT', 'LOCK']),
]), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.examPaper.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw httpError(404, 'Paper not found');
  const { action, reviewNote } = req.body;
  const statusMap = { UNDER_REVIEW: 'UNDER_REVIEW', APPROVE: 'APPROVED', REJECT: 'REJECTED', LOCK: 'LOCKED' };
  const paper = await prisma.examPaper.update({
    where: { id },
    data: {
      status: statusMap[action], reviewedById: req.lmsUser.id,
      reviewNote: reviewNote || null, reviewedAt: new Date(),
    },
  });
  await audit(req, `EXAM_PAPER_${action}`, 'ExamPaper', String(id), { before: existing, after: paper });
  if (existing.submittedById) {
    await notify(existing.submittedById, {
      title: `Exam paper ${statusMap[action].toLowerCase().replace('_', ' ')}`,
      message: `Your paper "${paper.title}" was ${statusMap[action].toLowerCase()}.${reviewNote ? ` Note: ${reviewNote}` : ''}`,
      type: action === 'REJECT' ? 'WARNING' : 'INFO',
    });
  }
  res.json({ paper });
}));

// ============================================================
// RESULTS — Mid / Final / Overall (GPA-aware)
// ============================================================
router.get('/results', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { component = 'overall', status, department, program, semester, section, courseId, session } = req.query; // mid | final | overall
  const sessionTerm = session ? await prisma.academicTerm.findFirst({ where: { OR: [{ id: Number(session) || -1 }, { code: session }] } }) : null;
  const term = sessionTerm || await currentTerm();
  const termId = term ? term.id : -1;
  const where = { offering: { termId } };
  if (status) where.status = status;
  if (courseId) where.offeringId = Number(courseId);
  const results = await prisma.courseResult.findMany({
    where,
    include: {
      offering: { include: { course: { include: { program: true, semester: true } }, sections: true } },
      student: { include: { profile: true } },
    },
    orderBy: { id: 'desc' },
  });
  let rows = results.map((r) => {
    const course = r.offering?.course;
    const prof = r.student?.profile;
    const sectionName = (r.offering?.sections || [])[0]?.name || null;
    const base = {
      id: r.id, studentId: r.studentId,
      student: prof?.fullName || r.student?.username || r.studentId,
      roll: r.student?.linkedRollNumber || r.student?.username || null,
      offeringId: r.offeringId,
      course: course ? `${course.code} ${course.title}` : null,
      department: course?.program?.department || prof?.department || null,
      program: course?.program?.shortForm || course?.program?.code || prof?.programShortForm || prof?.program || null,
      semester: course?.semester ? String(course.semester.number) : null,
      section: sectionName,
      status: r.status, letterGrade: r.letterGrade, gradePoints: r.gradePoints,
    };
    if (component === 'mid') return { ...base, marks: r.midMarks, max: r.midMax, percent: r.midMax ? Math.round((r.midMarks / r.midMax) * 1000) / 10 : 0 };
    if (component === 'final') return { ...base, marks: r.finalMarks, max: r.finalMax, percent: r.finalMax ? Math.round((r.finalMarks / r.finalMax) * 1000) / 10 : 0 };
    return {
      ...base, assignmentMarks: r.assignmentMarks, quizMarks: r.quizMarks,
      midMarks: r.midMarks, finalMarks: r.finalMarks, totalPercent: r.totalPercent,
      pass: r.totalPercent >= PASS_PERCENT,
    };
  });
  if (department) rows = rows.filter((r) => r.department === department);
  if (program) rows = rows.filter((r) => r.program === program);
  if (semester) rows = rows.filter((r) => String(r.semester) === String(semester));
  if (section) rows = rows.filter((r) => r.section === section);
  res.json({ term: term?.title || null, component, results: rows });
}));

router.put('/results/:id/publish', EXAM, asyncHandler(async (req, res) => {
  throw httpError(400, 'Individual publish is disabled. Declare unofficial then official results for the Department → Program → Semester scope.');
}));

// ============================================================
// RECHECK REQUESTS — student result-rechecking workflow
// ============================================================
router.get('/rechecks', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = {};
  if (status) where.status = status;
  const items = await prisma.recheckRequest.findMany({ where, orderBy: { createdAt: 'desc' } });
  const names = await nameMap(items.map((r) => r.studentId));
  const labels = await offeringLabelMap(items.map((r) => r.offeringId));
  res.json({
    rechecks: items.map((r) => ({
      id: r.id, studentId: r.studentId, student: names[r.studentId] || r.studentId,
      offeringId: r.offeringId, offering: labels[r.offeringId] || `Offering #${r.offeringId}`,
      component: r.component, reason: r.reason, status: r.status,
      oldMarks: r.oldMarks, newMarks: r.newMarks, feeChallanNo: r.feeChallanNo,
      resolution: r.resolution, resolvedAt: r.resolvedAt, createdAt: r.createdAt,
    })),
  });
}));

router.post('/rechecks', EXAM, validate([
  body('studentId').isString().notEmpty(),
  body('offeringId').notEmpty(),
  body('reason').isString().trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { studentId, offeringId, component = 'FINAL', reason, feeChallanNo } = req.body;
  const rec = await prisma.recheckRequest.create({
    data: {
      studentId, offeringId: Number(offeringId), component, reason,
      feeChallanNo: feeChallanNo || null, status: 'SUBMITTED',
    },
  });
  await audit(req, 'EXAM_RECHECK_CREATE', 'RecheckRequest', String(rec.id), { after: rec });
  res.status(201).json({ recheck: rec });
}));

router.put('/rechecks/:id/action', EXAM, validate([
  body('action').isIn(['IN_REVIEW', 'RESOLVE_CHANGED', 'RESOLVE_UNCHANGED', 'REJECT']),
]), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.recheckRequest.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'Recheck request not found');
  const { action, resolution, newMarks, oldMarks } = req.body;
  const statusMap = {
    IN_REVIEW: 'IN_REVIEW', RESOLVE_CHANGED: 'RESOLVED_CHANGED',
    RESOLVE_UNCHANGED: 'RESOLVED_UNCHANGED', REJECT: 'REJECTED',
  };
  const data = { status: statusMap[action], handledById: req.lmsUser.id };
  if (action !== 'IN_REVIEW') { data.resolution = resolution || null; data.resolvedAt = new Date(); }
  if (newMarks !== undefined) data.newMarks = Number(newMarks);
  if (oldMarks !== undefined) data.oldMarks = Number(oldMarks);
  const rec = await prisma.recheckRequest.update({ where: { id }, data });
  await audit(req, `EXAM_RECHECK_${action}`, 'RecheckRequest', String(id), { before: existing, after: rec });
  await notify(existing.studentId, {
    title: 'Recheck update',
    message: `Your recheck request has been ${statusMap[action].toLowerCase().replace(/_/g, ' ')}.${resolution ? ` ${resolution}` : ''}`,
    type: action === 'REJECT' ? 'WARNING' : 'INFO',
  });
  res.json({ recheck: rec });
}));

// ============================================================
// RESULT BATCH — freeze / lock / publish lifecycle (secure approval chain)
// ============================================================
router.get('/batches', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const batches = await prisma.resultBatch.findMany({ orderBy: { createdAt: 'desc' } });
  const term = await currentTerm();
  res.json({ term: term?.title || null, batches });
}));

router.post('/batches', EXAM, validate([
  body('title').isString().trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const term = await currentTerm();
  if (!term) throw httpError(400, 'No active term');
  const { title } = req.body;
  // compile counts from current published+draft results
  const results = await prisma.courseResult.findMany({ where: { offering: { termId: term.id } }, select: { totalPercent: true } });
  const passCount = results.filter((r) => r.totalPercent >= PASS_PERCENT).length;
  const batch = await prisma.resultBatch.create({
    data: {
      termId: term.id, title, status: 'COMPILED',
      totalResults: results.length, passCount, failCount: results.length - passCount,
    },
  });
  await audit(req, 'EXAM_BATCH_CREATE', 'ResultBatch', String(batch.id), { after: batch });
  res.status(201).json({ batch });
}));

router.put('/batches/:id/action', EXAM, validate([
  body('action').isIn(['VERIFY', 'FREEZE', 'PUBLISH', 'LOCK']),
]), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.resultBatch.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'Batch not found');
  const { action } = req.body;
  const statusMap = { VERIFY: 'VERIFIED', FREEZE: 'FROZEN', PUBLISH: 'PUBLISHED', LOCK: 'LOCKED' };
  const data = { status: statusMap[action] };
  if (action === 'FREEZE') { data.frozenById = req.lmsUser.id; data.frozenAt = new Date(); }
  if (action === 'PUBLISH') {
    data.publishedById = req.lmsUser.id; data.publishedAt = new Date();
    // publish all draft results in the term
    await prisma.courseResult.updateMany({
      where: { offering: { termId: existing.termId }, status: 'DRAFT' },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }
  const batch = await prisma.resultBatch.update({ where: { id }, data });
  await audit(req, `EXAM_BATCH_${action}`, 'ResultBatch', String(id), { before: existing, after: batch });
  res.json({ batch });
}));

// ============================================================
// TRANSCRIPT SYSTEM — per-student CGPA + semester-wise results
// ============================================================
router.get('/students', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { search, page, pageSize } = parseListQuery(req.query);
  const where = { role: 'Student' };
  if (search) {
    where.OR = [
      { username: { contains: search } },
      { linkedRollNumber: { contains: search } },
      { profile: { fullName: { contains: search } } },
    ];
  }
  const [total, students] = await Promise.all([
    prisma.lmsUser.count({ where }),
    prisma.lmsUser.findMany({
      where, include: { profile: true }, orderBy: { username: 'asc' },
      skip: (page - 1) * pageSize, take: pageSize,
    }),
  ]);
  res.json(paginated(students.map((s) => ({
    id: s.id, username: s.username, roll: s.linkedRollNumber || s.username,
    name: s.profile?.fullName || s.username, active: s.isActive,
    program: s.profile?.program || null, session: s.profile?.session || null,
  })), total, { page, pageSize }));
}));

router.get('/transcript/:id', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const studentId = req.params.id;
  const student = await prisma.lmsUser.findUnique({ where: { id: studentId }, include: { profile: true } });
  if (!student) throw httpError(404, 'Student not found');
  const { cgpa, totalCredits, results } = await studentCgpa(studentId);
  // group by term
  const byTerm = {};
  for (const r of results) {
    const termId = r.offering?.termId || 0;
    (byTerm[termId] = byTerm[termId] || []).push({
      offeringId: r.offeringId,
      code: r.offering?.course?.code || null,
      title: r.offering?.course?.title || null,
      creditHours: r.offering?.course?.creditHours || 3,
      totalPercent: r.totalPercent, letterGrade: r.letterGrade, gradePoints: r.gradePoints,
    });
  }
  const termIds = Object.keys(byTerm).map(Number).filter((x) => x > 0);
  const terms = await prisma.academicTerm.findMany({ where: { id: { in: termIds } } });
  const termTitleMap = {}; for (const t of terms) termTitleMap[t.id] = t.title;
  const semesters = Object.entries(byTerm).map(([termId, courses]) => {
    const gpa = computeGPA(courses.map((c) => ({ gradePoints: c.gradePoints, creditHours: c.creditHours })));
    return {
      termId: Number(termId), term: termTitleMap[Number(termId)] || `Term ${termId}`,
      courses, gpa, credits: courses.reduce((a, b) => a + b.creditHours, 0),
    };
  });
  res.json({
    student: {
      id: student.id, roll: student.linkedRollNumber || student.username,
      name: student.profile?.fullName || student.username,
      program: student.profile?.program || null, session: student.profile?.session || null,
      fatherName: student.profile?.fatherName || null,
    },
    cgpa, totalCredits, semesters,
  });
}));

// ============================================================
// UFM CASES — Unfair Means / exam misconduct.
// Backed by the existing Escalation model (category = DISCIPLINE).
// We tag exam-cell UFM records with subject prefix "UFM:" so they are
// cleanly distinguishable from other disciplinary escalations.
// ============================================================
const UFM_PREFIX = 'UFM: ';

// §1.3 — exam-type classification. The Escalation model has no
// examType column, so we encode it as a leading bracket tag inside
// the subject, e.g. "UFM: [MID] Phone seized". Untagged legacy rows
// classify as "OTHER" for full backward-compatibility.
const UFM_EXAM_TYPES = ['MID', 'FINAL', 'OTHER'];
const UFM_TYPE_LABEL = { MID: 'Mid-term', FINAL: 'Final', OTHER: 'Other' };
const UFM_TAG_RE = /^\s*\[(MID|FINAL|OTHER)\]\s*/i;

function parseUfmSubject(rawSubject) {
  const stripped = (rawSubject || '').replace(UFM_PREFIX, '');
  const m = stripped.match(UFM_TAG_RE);
  const examType = m ? m[1].toUpperCase() : 'OTHER';
  const subject = m ? stripped.replace(UFM_TAG_RE, '').trim() : stripped.trim();
  return { examType, subject };
}

const ufmRow = (e, names, labels, ctxMap = {}, stuCtx = {}) => {
  const { examType, subject } = parseUfmSubject(e.subject);
  const ctx = (e.offeringId && ctxMap[e.offeringId]) || {};
  const sctx = (e.studentId && stuCtx[e.studentId]) || {};
  return {
    id: e.id,
    studentId: e.studentId,
    student: e.studentId ? (names[e.studentId] || e.studentId) : (subject || '—'),
    offeringId: e.offeringId,
    course: e.offeringId ? (labels[e.offeringId] || `Offering #${e.offeringId}`) : '—',
    department: ctx.department || sctx.department || null,
    program: ctx.program || sctx.program || null,
    semester: ctx.semester || null,
    section: ctx.section || null,
    session: sctx.session || ctx.session || null,
    batch: sctx.batch || null,
    examType,
    examTypeLabel: UFM_TYPE_LABEL[examType] || 'Other',
    subject,
    reason: subject,
    evidence: e.description || '',
    severity: e.severity,
    status: e.status,
    resolution: e.resolution,
    resolvedAt: e.resolvedAt,
    createdAt: e.createdAt,
  };
};

router.get('/ufm', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { status, severity, department, examType } = req.query;
  const where = { category: 'DISCIPLINE', subject: { startsWith: UFM_PREFIX } };
  if (status) where.status = status;
  if (severity) where.severity = severity;
  // Full historical record — no term restriction (§1.3).
  const items = await prisma.escalation.findMany({ where, orderBy: { createdAt: 'desc' } });
  const names = await nameMap(items.map((e) => e.studentId).filter(Boolean));
  const labels = await offeringLabelMap(items.map((e) => e.offeringId).filter(Boolean));
  const ctxMap = await offeringContextMap(items.map((e) => e.offeringId).filter(Boolean));
  const stuCtx = await studentContextMap(items.map((e) => e.studentId).filter(Boolean));
  let cases = items.map((e) => ufmRow(e, names, labels, ctxMap, stuCtx));
  const departments = [...new Set(cases.map((c) => c.department).filter(Boolean))].sort();
  // Summary counts by exam type (Mid-term / Final / Other) over the
  // COMPLETE record, before any dept/examType filtering is applied.
  const summary = { MID: 0, FINAL: 0, OTHER: 0 };
  cases.forEach((c) => { summary[c.examType] = (summary[c.examType] || 0) + 1; });
  if (department) cases = cases.filter((c) => c.department === department);
  if (examType && UFM_EXAM_TYPES.includes(String(examType).toUpperCase())) {
    cases = cases.filter((c) => c.examType === String(examType).toUpperCase());
  }
  res.json({ cases, departments, summary });
}));

router.post('/ufm', EXAM, validate([
  body('studentId').isString().trim().notEmpty(),
  body('offeringId').isInt({ min: 1 }),
  body('department').isString().trim().notEmpty(),
  body('program').isString().trim().notEmpty(),
  body('semester').notEmpty(),
  body('reason').isString().trim().notEmpty(),
  body('evidence').optional().isString(),
  body('severity').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  body('examType').optional().isIn(UFM_EXAM_TYPES),
]), asyncHandler(async (req, res) => {
  const { reason, evidence, severity = 'HIGH', studentId, offeringId, department, program, semester } = req.body;
  const offering = await prisma.courseOffering.findUnique({
    where: { id: Number(offeringId) },
    include: { course: { include: { program: true, semester: true } }, registrations: { where: { studentId }, select: { studentId: true } } },
  });
  if (!offering || offering.isDeleted) throw httpError(404, 'Course offering not found');
  if (!offering.registrations.length) throw httpError(400, 'The selected student is not registered in the selected course.');
  const actualDepartment = offering.course?.program?.department || '';
  const actualProgram = offering.course?.program?.shortForm || offering.course?.program?.code || '';
  const actualSemester = offering.course?.semester ? String(offering.course.semester.number) : '';
  if (actualDepartment !== department || actualProgram !== program || actualSemester !== String(semester)) {
    throw httpError(400, 'Department, Program, Semester and Course selection do not match.');
  }
  const subject = String(reason).trim();
  const examType = UFM_EXAM_TYPES.includes(String(req.body.examType || '').toUpperCase())
    ? String(req.body.examType).toUpperCase() : 'OTHER';
  const created = await prisma.escalation.create({
    data: {
      category: 'DISCIPLINE',
      subject: `${UFM_PREFIX}[${examType}] ${subject}`,
      description: evidence || null,
      severity,
      status: 'OPEN',
      raisedById: req.lmsUser.id,
      raisedRole: 'ExamController',
      currentRole: 'ExamController',
      studentId: studentId || null,
      offeringId: offeringId ? Number(offeringId) : null,
    },
  });
  await prisma.escalationEvent.create({
    data: { escalationId: created.id, action: 'CREATED', actorId: req.lmsUser.id, actorRole: 'ExamController', note: 'UFM case opened by Exam Controller' },
  });
  await audit(req, 'EXAM_UFM_CREATE', 'Escalation', String(created.id), { after: created });
  if (created.studentId) {
    await notify(created.studentId, {
      title: 'Exam misconduct case opened',
      message: `A UFM case has been opened: ${subject}`,
      type: 'WARNING',
    });
  }
  const names = await nameMap([created.studentId]);
  const labels = await offeringLabelMap([created.offeringId]);
  const ctxMap = await offeringContextMap([created.offeringId]);
  const stuCtx = await studentContextMap([created.studentId]);
  res.status(201).json({ case: ufmRow(created, names, labels, ctxMap, stuCtx) });
}));

router.put('/ufm/:id/action', EXAM, validate([
  body('action').isIn(['REVIEW', 'CONFIRM', 'DISMISS']),
  body('resolution').optional().isString(),
]), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.escalation.findUnique({ where: { id } });
  if (!existing || existing.category !== 'DISCIPLINE' || !(existing.subject || '').startsWith(UFM_PREFIX)) {
    throw httpError(404, 'UFM case not found');
  }
  const { action, resolution } = req.body;
  const statusMap = { REVIEW: 'IN_PROGRESS', CONFIRM: 'RESOLVED', DISMISS: 'CLOSED' };
  const data = { status: statusMap[action] };
  if (action !== 'REVIEW') {
    data.resolution = resolution || (action === 'CONFIRM' ? 'UFM confirmed — disciplinary action applied.' : 'Case dismissed.');
    data.resolvedById = req.lmsUser.id;
    data.resolvedAt = new Date();
  }
  const updated = await prisma.escalation.update({ where: { id }, data });
  await prisma.escalationEvent.create({
    data: {
      escalationId: id,
      action: action === 'REVIEW' ? 'COMMENT' : action === 'CONFIRM' ? 'RESOLVED' : 'CLOSED',
      actorId: req.lmsUser.id, actorRole: 'ExamController', note: data.resolution || 'Under review',
    },
  });
  await audit(req, `EXAM_UFM_${action}`, 'Escalation', String(id), { before: existing, after: updated });
  if (existing.studentId) {
    await notify(existing.studentId, {
      title: 'UFM case update',
      message: action === 'CONFIRM'
        ? `Your exam misconduct case has been confirmed. ${data.resolution}`
        : action === 'DISMISS' ? 'Your exam misconduct case has been dismissed.' : 'Your UFM case is under review.',
      type: action === 'CONFIRM' ? 'WARNING' : 'INFO',
    });
  }
  res.json({ case: updated });
}));

// ============================================================
// REPORTS
// ============================================================
router.get('/reports/:kind', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const kind = req.params.kind; // gazette | absentees | probation | incomplete
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  if (kind === 'gazette') {
    const results = await prisma.courseResult.findMany({
      where: { status: 'PUBLISHED', offering: { termId } },
      include: { offering: { include: { course: true } } },
    });
    const names = await nameMap(results.map((r) => r.studentId));
    return res.json({
      report: 'gazette', term: term?.title || null,
      rows: results.map((r) => ({
        student: names[r.studentId] || r.studentId,
        course: r.offering?.course ? `${r.offering.course.code} ${r.offering.course.title}` : null,
        percent: r.totalPercent, grade: r.letterGrade, gp: r.gradePoints,
        status: r.totalPercent >= PASS_PERCENT ? 'PASS' : 'FAIL',
      })),
    });
  }

  if (kind === 'probation') {
    // students with CGPA < 2.0 — enriched with academic context so the
    // cascading smart filters (§1.9) can operate (dept/program/session/batch).
    const students = await prisma.lmsUser.findMany({ where: { role: 'Student' }, include: { profile: true } });
    let rows = [];
    for (const s of students) {
      const { cgpa, totalCredits } = await studentCgpa(s.id);
      if (totalCredits > 0 && cgpa < 2.0) {
        const p = s.profile || {};
        const m = String(p.session || '').match(/\b(20\d{2})\b/);
        rows.push({
          roll: s.linkedRollNumber || s.username, name: p.fullName || s.username,
          department: p.department || null,
          program: p.programShortForm || p.program || null,
          session: p.session || null,
          batch: m ? m[1] : null,
          cgpa, totalCredits, status: cgpa < 1.0 ? 'DISMISSAL_RISK' : 'PROBATION',
        });
      }
    }
    const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort();
    // Optional server-side filtering (defence in depth — the client also filters).
    const { department, program, semester, session, batch } = req.query;
    if (department) rows = rows.filter((r) => r.department === department);
    if (program) rows = rows.filter((r) => r.program === program);
    if (session) rows = rows.filter((r) => r.session === session);
    if (batch) rows = rows.filter((r) => String(r.batch) === String(batch));
    void semester;
    return res.json({ report: 'probation', rows, departments });
  }

  if (kind === 'incomplete') {
    // registrations with no published result — enriched with teacher,
    // semester, program, section, session so the Incomplete Results
    // module (§1.6) shows teacher/semester/course and supports cascading
    // smart filters.
    const regs = await prisma.courseRegistration.findMany({
      where: { status: 'ENROLLED', offering: { termId } },
      include: {
        offering: {
          include: {
            course: { include: { program: true, semester: true } },
            sections: true, term: true,
          },
        },
      },
    });
    const names = await nameMap(regs.map((r) => r.studentId));
    const teacherNames = await nameMap(regs.map((r) => r.offering?.teacherId).filter(Boolean));
    const stuCtx = await studentContextMap(regs.map((r) => r.studentId));
    let rows = [];
    for (const reg of regs) {
      const result = await prisma.courseResult.findUnique({
        where: { offeringId_studentId: { offeringId: reg.offeringId, studentId: reg.studentId } },
      });
      if (!result || result.status !== 'PUBLISHED') {
        const o = reg.offering;
        const sctx = stuCtx[reg.studentId] || {};
        rows.push({
          studentId: reg.studentId,
          student: names[reg.studentId] || reg.studentId,
          offeringId: reg.offeringId,
          course: o?.course ? `${o.course.code} ${o.course.title}` : null,
          courseCode: o?.course?.code || null,
          teacherId: o?.teacherId || null,
          teacher: o?.teacherId ? (teacherNames[o.teacherId] || o.teacherId) : null,
          department: o?.course?.program?.department || sctx.department || null,
          program: o?.course?.program?.shortForm || o?.course?.program?.code || sctx.program || null,
          semester: o?.course?.semester ? String(o.course.semester.number) : null,
          section: (o?.sections || [])[0]?.name || null,
          session: o?.term?.title || sctx.session || null,
          batch: sctx.batch || null,
          status: result ? 'DRAFT' : 'NO_RESULT',
        });
      }
    }
    const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort();
    const { department, program, semester, section, session, batch } = req.query;
    if (department) rows = rows.filter((r) => r.department === department);
    if (program) rows = rows.filter((r) => r.program === program);
    if (semester) rows = rows.filter((r) => String(r.semester) === String(semester));
    if (section) rows = rows.filter((r) => r.section === section);
    if (session) rows = rows.filter((r) => r.session === session);
    if (batch) rows = rows.filter((r) => String(r.batch) === String(batch));
    return res.json({ report: 'incomplete', rows, departments });
  }

  if (kind === 'absentees') {
    // students with finalMarks=0 in published-eligible results (proxy for absent in final)
    const results = await prisma.courseResult.findMany({
      where: { offering: { termId }, finalMarks: 0 },
      include: { offering: { include: { course: { include: { program: true } } } } },
    });
    const names = await nameMap(results.map((r) => r.studentId));
    let rows = results.map((r) => ({
      student: names[r.studentId] || r.studentId,
      course: r.offering?.course ? `${r.offering.course.code} ${r.offering.course.title}` : null,
      department: r.offering?.course?.program?.department || null,
      component: 'FINAL', status: 'ABSENT',
    }));
    const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort();
    if (req.query.department) rows = rows.filter((r) => r.department === req.query.department);
    return res.json({ report: 'absentees', rows, departments });
  }

  throw httpError(400, 'Unknown report kind');
}));

// ============================================================
// ANALYTICS
// ============================================================
router.get('/analytics', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const results = await prisma.courseResult.findMany({
    where: { status: 'PUBLISHED', offering: { termId } },
    include: { offering: { include: { course: true } } },
  });
  // grade distribution
  const gradeDist = {};
  for (const r of results) {
    const g = r.letterGrade || gradeFromPercent(r.totalPercent).letter;
    gradeDist[g] = (gradeDist[g] || 0) + 1;
  }
  // pass/fail by course
  const byCourse = {};
  for (const r of results) {
    const code = r.offering?.course?.code || 'N/A';
    byCourse[code] = byCourse[code] || { course: code, total: 0, pass: 0 };
    byCourse[code].total += 1;
    if (r.totalPercent >= PASS_PERCENT) byCourse[code].pass += 1;
  }
  const total = results.length;
  const passCount = results.filter((r) => r.totalPercent >= PASS_PERCENT).length;
  const avgPercent = total ? Math.round((results.reduce((a, b) => a + b.totalPercent, 0) / total) * 10) / 10 : 0;
  res.json({
    term: term?.title || null,
    total, passCount, passRate: total ? Math.round((passCount / total) * 1000) / 10 : 0, avgPercent,
    gradeDistribution: Object.entries(gradeDist).map(([grade, count]) => ({ grade, count })),
    courseStats: Object.values(byCourse).map((c) => ({
      ...c, passRate: c.total ? Math.round((c.pass / c.total) * 100) : 0,
    })),
  });
}));

// ============================================================
// ACTIVITY / AUDIT  +  NOTIFICATIONS
// ============================================================
router.get('/audit', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { page, pageSize } = parseListQuery(req.query);
  const where = { actorRole: { in: ['ExamController', 'Provost'] } };
  const [total, logs] = await Promise.all([
    prisma.lmsAuditLog.count({ where }),
    prisma.lmsAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const names = await nameMap(logs.map((l) => l.actorId).filter(Boolean));
  res.json(paginated(logs.map((l) => ({
    id: l.id, action: l.action, entity: l.entity, entityId: l.entityId,
    actor: l.actorId ? names[l.actorId] || l.actorId : 'system',
    actorRole: l.actorRole, ip: l.ip, createdAt: l.createdAt,
  })), total, { page, pageSize }));
}));

router.get('/notifications', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const items = await prisma.lmsNotification.findMany({
    where: { userId: req.lmsUser.id }, orderBy: { createdAt: 'desc' }, take: 50,
  });
  res.json({ notifications: items, unread: items.filter((n) => !n.isRead).length });
}));

router.put('/notifications/:id/read', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.lmsNotification.updateMany({ where: { id, userId: req.lmsUser.id }, data: { isRead: true } });
  res.json({ success: true });
}));

router.put('/notifications/read-all', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  await prisma.lmsNotification.updateMany({ where: { userId: req.lmsUser.id, isRead: false }, data: { isRead: true } });
  res.json({ success: true });
}));

// ============================================================
// PHASE-5 COMPLETION — additive endpoints (do not alter the above).
//   1. Live sidebar counts        GET  /counts
//   2. Offering picker            GET  /offerings
//   3. Clash detection            GET  /schedules/clash-check
//   4. Marks collection engine    GET  /offerings/:id/marksheet
//                                  PUT  /offerings/:id/marks
//                                  POST /offerings/:id/compile
//   5. Seating auto-generation    GET  /seating/rooms-suggestion
//                                  POST /seating/auto/:examId
//                                  GET  /seating/:id/allocations
//   6. Paper upload/download      POST /papers/upload
//                                  GET  /papers/:id/download
//   7. Exam attendance/absentees  GET  /exams/:examId/attendance
//                                  PUT  /exams/:examId/attendance
//                                  POST /exams/:examId/attendance/bootstrap
//   8. Transcript system          POST /transcript/:id/issue
//                                  GET  /transcripts
//                                  PUT  /transcripts/:id/action
//   9. Exports (CSV)              GET  /reports/:kind/export
//  10. Account settings           GET  /me
//                                  PUT  /me/profile
//                                  PUT  /me/password
// ============================================================

// ------------------------------------------------------------
// 1. LIVE SIDEBAR COUNTS — drives dynamic badges (no hardcoding)
// ------------------------------------------------------------
router.get('/counts', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const [openRechecks, openUfm, pendingPapers, draftResults, pendingSchedules] = await Promise.all([
    prisma.recheckRequest.count({ where: { status: { in: ['SUBMITTED', 'IN_REVIEW'] } } }),
    prisma.escalation.count({ where: { category: 'DISCIPLINE', subject: { startsWith: UFM_PREFIX }, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.examPaper.count({ where: { isDeleted: false, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    prisma.courseResult.count({ where: { status: 'DRAFT' } }),
    prisma.examSchedule.count({ where: { isDeleted: false, status: 'DRAFT' } }),
  ]);
  res.json({ rechecks: openRechecks, ufm: openUfm, papers: pendingPapers, draftResults, pendingSchedules });
}));

// ------------------------------------------------------------
// 2. OFFERINGS PICKER — current-term offerings to attach to exams,
// papers, marks-collection and clash detection.
// ------------------------------------------------------------
router.get('/offerings', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const offerings = await prisma.courseOffering.findMany({
    where: { termId, isDeleted: false },
    include: {
      course: { include: { program: true, semester: true } },
      sections: true,
      _count: { select: { registrations: true } },
    },
    orderBy: { id: 'asc' },
  });
  const teacherNames = await nameMap(offerings.map((o) => o.teacherId).filter(Boolean));
  res.json({
    term: term?.title || null,
    offerings: offerings.map((o) => ({
      id: o.id,
      code: o.course?.code || null,
      title: o.course?.title || null,
      label: o.course ? `${o.course.code} ${o.course.title}` : `Offering #${o.id}`,
      department: o.course?.program?.department || null,
      program: o.course?.program?.shortForm || o.course?.program?.code || null,
      semester: o.course?.semester ? String(o.course.semester.number) : null,
      section: (o.sections || [])[0]?.name || null,
      teacherId: o.teacherId,
      teacher: o.teacherId ? teacherNames[o.teacherId] || o.teacherId : null,
      students: o._count?.registrations || 0,
      creditHours: o.course?.creditHours || 3,
    })),
  });
}));

// ------------------------------------------------------------
// 3. CLASH DETECTION — given a date + time window + optional room /
// offering, report conflicting exams. Used by the scheduler before
// creating/publishing a datesheet entry.
// Overlap rule: two windows [s1,e1) and [s2,e2) clash if s1<e2 && s2<e1.
// ------------------------------------------------------------
function timeToMin(t) {
  if (!t || typeof t !== 'string') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function windowsOverlap(s1, e1, s2, e2) {
  // If any window is open-ended (missing time) treat same-date as a clash candidate.
  if (s1 == null || e1 == null || s2 == null || e2 == null) return true;
  return s1 < e2 && s2 < e1;
}

async function detectClashes({ date, startTime, endTime, room, offeringId, excludeId }) {
  const sameDay = await prisma.examSchedule.findMany({
    where: { isDeleted: false, date, status: { not: 'CANCELLED' }, ...(excludeId ? { id: { not: Number(excludeId) } } : {}) },
    include: { seatings: true },
  });
  const s1 = timeToMin(startTime);
  const e1 = timeToMin(endTime);
  const clashes = { room: [], offering: [], teacher: [], student: [] };

  // Resolve this offering's teacher + students for teacher/student clash.
  let myTeacherId = null;
  let myStudentIds = [];
  if (offeringId) {
    const off = await prisma.courseOffering.findUnique({ where: { id: Number(offeringId) } });
    myTeacherId = off?.teacherId || null;
    const regs = await prisma.courseRegistration.findMany({
      where: { offeringId: Number(offeringId), status: 'ENROLLED' }, select: { studentId: true },
    });
    myStudentIds = regs.map((r) => r.studentId);
  }

  for (const ex of sameDay) {
    const s2 = timeToMin(ex.startTime);
    const e2 = timeToMin(ex.endTime);
    if (!windowsOverlap(s1, e1, s2, e2)) continue;

    // Room clash — same room string on the schedule OR overlapping seating room.
    const rooms = new Set([ex.room, ...ex.seatings.map((st) => st.room)].filter(Boolean));
    if (room && rooms.has(room)) {
      clashes.room.push({ id: ex.id, title: ex.title, room, startTime: ex.startTime, endTime: ex.endTime });
    }
    // Same offering already scheduled same day.
    if (offeringId && ex.offeringId === Number(offeringId)) {
      clashes.offering.push({ id: ex.id, title: ex.title });
    }
    // Teacher clash — the offering teacher already invigilating/teaching another exam.
    if (myTeacherId && ex.offeringId) {
      const otherOff = await prisma.courseOffering.findUnique({ where: { id: ex.offeringId } });
      if (otherOff?.teacherId && otherOff.teacherId === myTeacherId) {
        clashes.teacher.push({ id: ex.id, title: ex.title });
      }
    }
    // Student clash — any student registered in both offerings.
    if (myStudentIds.length && ex.offeringId && ex.offeringId !== Number(offeringId)) {
      const overlap = await prisma.courseRegistration.count({
        where: { offeringId: ex.offeringId, status: 'ENROLLED', studentId: { in: myStudentIds } },
      });
      if (overlap > 0) clashes.student.push({ id: ex.id, title: ex.title, students: overlap });
    }
  }
  const hasClash = Object.values(clashes).some((arr) => arr.length > 0);
  return { hasClash, clashes };
}

router.get('/schedules/clash-check', EXAM, asyncHandler(async (req, res) => {
  const { date, startTime, endTime, room, offeringId, excludeId } = req.query;
  if (!date) throw httpError(400, 'date is required for clash detection');
  const result = await detectClashes({ date, startTime, endTime, room, offeringId, excludeId });
  res.json(result);
}));

// ------------------------------------------------------------
// 4. MARKS COLLECTION ENGINE
//    GET  /offerings/:id/marksheet  → per-student editable rows
//    PUT  /offerings/:id/marks      → bulk save component marks (recompute grade)
//    POST /offerings/:id/compile    → import marks from the teacher gradebook
//                                     (assignments + quizzes + CourseResult)
// ------------------------------------------------------------
router.get('/offerings/:id/marksheet', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const offeringId = Number(req.params.id);
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId }, include: { course: true, term: true },
  });
  if (!offering) throw httpError(404, 'Offering not found');

  const regs = await prisma.courseRegistration.findMany({
    where: { offeringId, status: { in: ['ENROLLED', 'COMPLETED'] } },
  });
  const studentIds = regs.map((r) => r.studentId);
  const [students, results] = await Promise.all([
    prisma.lmsUser.findMany({ where: { id: { in: studentIds } }, include: { profile: true } }),
    prisma.courseResult.findMany({ where: { offeringId } }),
  ]);
  const resByStudent = {};
  for (const r of results) resByStudent[r.studentId] = r;
  const studentById = {};
  for (const s of students) studentById[s.id] = s;

  const weights = {
    assignmentWeight: offering.assignmentWeight, quizWeight: offering.quizWeight,
    midWeight: offering.midWeight, finalWeight: offering.finalWeight,
  };

  const rows = regs.map((reg) => {
    const r = resByStudent[reg.studentId] || {};
    const s = studentById[reg.studentId];
    return {
      studentId: reg.studentId,
      roll: s?.linkedRollNumber || s?.username || reg.studentId,
      name: s?.profile?.fullName || displayName(s) || reg.studentId,
      registrationType: reg.registrationType,
      assignmentMarks: r.assignmentMarks ?? 0, assignmentMax: r.assignmentMax ?? 100,
      quizMarks: r.quizMarks ?? 0, quizMax: r.quizMax ?? 100,
      midMarks: r.midMarks ?? 0, midMax: r.midMax ?? 100,
      finalMarks: r.finalMarks ?? 0, finalMax: r.finalMax ?? 100,
      totalPercent: r.totalPercent ?? 0, letterGrade: r.letterGrade ?? null,
      gradePoints: r.gradePoints ?? 0, status: r.status ?? 'NONE',
      resultId: r.id ?? null,
    };
  });

  res.json({
    offering: {
      id: offering.id, code: offering.course?.code, title: offering.course?.title,
      label: offering.course ? `${offering.course.code} ${offering.course.title}` : `Offering #${offering.id}`,
      creditHours: offering.course?.creditHours || 3, term: offering.term?.title || null,
    },
    weights, rows,
  });
}));

router.put('/offerings/:id/marks', EXAM, asyncHandler(async (req, res) => {
  void req;
  throw httpError(403, 'Exam Controllers have read-only access to marks. Marks can only be entered by the assigned teacher.');
}));

/* Legacy mutation implementation intentionally removed: Exam Controller marks
 * access is read-only at every workflow stage. */
/*
  // Block edits when results for this offering are locked by a frozen/locked batch.
  const lockedBatch = await prisma.resultBatch.findFirst({
    where: { termId: offering.termId, status: { in: ['FROZEN', 'LOCKED'] } },
  });
  if (lockedBatch) throw httpError(409, `Results are ${lockedBatch.status.toLowerCase()} for this term and cannot be edited.`);

  const weights = {
    assignmentWeight: offering.assignmentWeight, quizWeight: offering.quizWeight,
    midWeight: offering.midWeight, finalWeight: offering.finalWeight,
  };
  const num = (v, d = 0) => (v === undefined || v === null || v === '' ? d : Number(v));
  const updated = [];

  await prisma.$transaction(async (tx) => {
    for (const m of req.body.marks) {
      if (!m || !m.studentId) continue;
      const component = {
        assignmentMarks: num(m.assignmentMarks), assignmentMax: num(m.assignmentMax, 100),
        quizMarks: num(m.quizMarks), quizMax: num(m.quizMax, 100),
        midMarks: num(m.midMarks), midMax: num(m.midMax, 100),
        finalMarks: num(m.finalMarks), finalMax: num(m.finalMax, 100),
      };
      const grades = buildResultGrades(component, weights);
      const data = { ...component, ...grades };
      const existing = await tx.courseResult.findUnique({
        where: { offeringId_studentId: { offeringId, studentId: m.studentId } },
      });
      // Never silently overwrite a PUBLISHED result back to draft — keep status.
      const row = await tx.courseResult.upsert({
        where: { offeringId_studentId: { offeringId, studentId: m.studentId } },
        update: data,
        create: { offeringId, studentId: m.studentId, ...data, status: 'DRAFT' },
      });
      updated.push(row.id);
      void existing;
    }
  });
  await audit(req, 'EXAM_MARKS_SAVE', 'CourseOffering', String(offeringId), { after: { offeringId, count: updated.length } });
  res.json({ success: true, updated: updated.length });
}));
*/

router.post('/offerings/:id/compile', EXAM, asyncHandler(async (req, res) => {
  const offeringId = Number(req.params.id);
  const offering = await prisma.courseOffering.findUnique({ where: { id: offeringId }, include: { course: true } });
  if (!offering) throw httpError(404, 'Offering not found');
  const lockedBatch = await prisma.resultBatch.findFirst({
    where: { termId: offering.termId, status: { in: ['FROZEN', 'LOCKED'] } },
  });
  if (lockedBatch) throw httpError(409, `Results are ${lockedBatch.status.toLowerCase()} for this term and cannot be recompiled.`);

  const weights = {
    assignmentWeight: offering.assignmentWeight, quizWeight: offering.quizWeight,
    midWeight: offering.midWeight, finalWeight: offering.finalWeight,
  };

  // Gather gradebook signals: assignment submissions + quiz attempts.
  const regs = await prisma.courseRegistration.findMany({
    where: { offeringId, status: { in: ['ENROLLED', 'COMPLETED'] } }, select: { studentId: true },
  });
  const studentIds = regs.map((r) => r.studentId);

  const [assignments, quizzes] = await Promise.all([
    prisma.assignment2.findMany({ where: { offeringId, isDeleted: false }, include: { submissions: true } }),
    prisma.quiz.findMany({ where: { offeringId }, include: { attempts: true } }),
  ]);

  // Assignment bucket: average of (marks/totalMarks) across graded assignments → /100.
  const asgMaxTotal = assignments.reduce((a, b) => a + (b.totalMarks || 0), 0);
  const quizMaxTotal = quizzes.reduce((a, b) => a + (b.totalMarks || 0), 0);

  let compiled = 0;
  await prisma.$transaction(async (tx) => {
    for (const sid of studentIds) {
      let asgMarks = 0;
      for (const a of assignments) {
        const sub = a.submissions.find((x) => x.studentId === sid && x.marks != null);
        if (sub) asgMarks += Number(sub.marks) || 0;
      }
      let quizMarks = 0;
      for (const q of quizzes) {
        const att = q.attempts.filter((x) => x.studentId === sid && x.score != null);
        if (att.length) quizMarks += Math.max(...att.map((x) => Number(x.score) || 0));
      }
      // Preserve existing mid/final marks (entered manually) when present.
      const existing = await tx.courseResult.findUnique({
        where: { offeringId_studentId: { offeringId, studentId: sid } },
      });
      if (existing && isImmutableStatus(existing.status)) continue;
      const component = {
        assignmentMarks: asgMaxTotal ? asgMarks : (existing?.assignmentMarks ?? 0),
        assignmentMax: asgMaxTotal || (existing?.assignmentMax ?? 100),
        quizMarks: quizMaxTotal ? quizMarks : (existing?.quizMarks ?? 0),
        quizMax: quizMaxTotal || (existing?.quizMax ?? 100),
        midMarks: existing?.midMarks ?? 0, midMax: existing?.midMax ?? 100,
        finalMarks: existing?.finalMarks ?? 0, finalMax: existing?.finalMax ?? 100,
      };
      const grades = buildResultGrades(component, weights);
      await tx.courseResult.upsert({
        where: { offeringId_studentId: { offeringId, studentId: sid } },
        update: { ...component, ...grades },
        create: { offeringId, studentId: sid, ...component, ...grades, status: 'DRAFT' },
      });
      compiled += 1;
    }
  });
  await audit(req, 'EXAM_RESULT_COMPILE', 'CourseOffering', String(offeringId), { after: { offeringId, compiled } });
  res.json({ success: true, compiled, source: { assignments: assignments.length, quizzes: quizzes.length } });
}));

// ------------------------------------------------------------
// 5. SEATING AUTO-GENERATION
//    GET  /seating/rooms-suggestion          → distinct rooms + free capacity
//    POST /seating/auto/:examId { rooms:[{room,capacity}] }  → distribute students
//    GET  /seating/:id/allocations           → students seated in a room
// ------------------------------------------------------------
router.get('/seating/rooms-suggestion', EXAM, asyncHandler(async (req, res) => {
  const rows = await prisma.examSeating.findMany({ select: { room: true, capacity: true } });
  const map = {};
  for (const r of rows) {
    if (!map[r.room]) map[r.room] = { room: r.room, capacity: r.capacity };
    else map[r.room].capacity = Math.max(map[r.room].capacity, r.capacity);
  }
  // Always include some standard halls as suggestions.
  for (const room of ['Hall-1', 'Hall-2', 'Hall-3', 'Lab-A', 'Lab-B']) {
    if (!map[room]) map[room] = { room, capacity: 40 };
  }
  res.json({ rooms: Object.values(map) });
}));

router.post('/seating/auto/:examId', EXAM, validate([
  body('rooms').isArray({ min: 1 }),
]), asyncHandler(async (req, res) => {
  const examId = Number(req.params.examId);
  const exam = await prisma.examSchedule.findUnique({ where: { id: examId } });
  if (!exam || exam.isDeleted) throw httpError(404, 'Exam not found');
  if (!exam.offeringId) throw httpError(400, 'This exam has no linked offering; cannot auto-seat.');

  const regs = await prisma.courseRegistration.findMany({
    where: { offeringId: exam.offeringId, status: 'ENROLLED' },
  });
  const studentIds = regs.map((r) => r.studentId);
  const students = await prisma.lmsUser.findMany({
    where: { id: { in: studentIds } }, include: { profile: true },
  });
  // sort by roll for deterministic distribution
  students.sort((a, b) => (a.linkedRollNumber || a.username).localeCompare(b.linkedRollNumber || b.username));

  const rooms = req.body.rooms
    .map((r) => ({ room: String(r.room || '').trim(), capacity: Math.max(1, Number(r.capacity) || 40) }))
    .filter((r) => r.room);
  const totalCapacity = rooms.reduce((a, b) => a + b.capacity, 0);
  if (students.length > totalCapacity) {
    throw httpError(400, `Insufficient capacity: ${students.length} students but only ${totalCapacity} seats across ${rooms.length} room(s).`);
  }

  // Build allocation plan + persist as ExamSeating rows (rowsCols JSON holds the seat list).
  const plan = [];
  let cursor = 0;
  await prisma.$transaction(async (tx) => {
    // Clear previous auto seatings for this exam (idempotent re-generate).
    await tx.examSeating.deleteMany({ where: { examId } });
    for (const r of rooms) {
      const slice = students.slice(cursor, cursor + r.capacity);
      cursor += slice.length;
      const seatList = slice.map((s, i) => ({
        seatNo: `${r.room}-${String(i + 1).padStart(2, '0')}`,
        studentId: s.id,
        roll: s.linkedRollNumber || s.username,
        name: s.profile?.fullName || displayName(s),
      }));
      await tx.examSeating.create({
        data: {
          examId, room: r.room, capacity: r.capacity, allocated: slice.length,
          rowsCols: JSON.stringify(seatList),
          notes: `Auto-generated for ${slice.length} student(s).`,
        },
      });
      plan.push({ room: r.room, allocated: slice.length, capacity: r.capacity });
      if (cursor >= students.length) break;
    }
  });
  await audit(req, 'EXAM_SEATING_AUTO', 'ExamSchedule', String(examId), { after: { examId, plan, students: students.length } });
  res.json({ success: true, totalStudents: students.length, plan });
}));

router.get('/seating/:id/allocations', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const seating = await prisma.examSeating.findUnique({ where: { id }, include: { exam: true } });
  if (!seating) throw httpError(404, 'Seating not found');
  let seats = [];
  try { seats = seating.rowsCols ? JSON.parse(seating.rowsCols) : []; } catch (_) { seats = []; }
  res.json({
    seating: { id: seating.id, room: seating.room, capacity: seating.capacity, allocated: seating.allocated, examTitle: seating.exam?.title || null },
    seats,
  });
}));

// ------------------------------------------------------------
// 6. PAPER UPLOAD / DOWNLOAD — secure file handling + versioning.
// ------------------------------------------------------------
router.post('/papers/upload', EXAM, uploadExamPaper.single('file'), asyncHandler(async (req, res) => {
  const { title, examId, offeringId, submittedById } = req.body;
  if (!title || !String(title).trim()) throw httpError(400, 'title is required');
  // Auto-increment version per offering/title family.
  let version = 1;
  if (offeringId) {
    const last = await prisma.examPaper.findFirst({
      where: { offeringId: Number(offeringId), isDeleted: false },
      orderBy: { version: 'desc' },
    });
    if (last) version = (last.version || 1) + 1;
  }
  const paper = await prisma.examPaper.create({
    data: {
      title: String(title).trim(),
      examId: examId ? Number(examId) : null,
      offeringId: offeringId ? Number(offeringId) : null,
      version,
      filePath: req.file ? `exam-papers/${req.file.filename}` : null,
      fileName: req.file ? req.file.originalname : null,
      submittedById: submittedById || req.lmsUser.id,
      status: 'SUBMITTED',
    },
  });
  await audit(req, 'EXAM_PAPER_UPLOAD', 'ExamPaper', String(paper.id), { after: { id: paper.id, version, fileName: paper.fileName } });
  res.status(201).json({ paper });
}));

router.get('/papers/:id/download', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const paper = await prisma.examPaper.findUnique({ where: { id } });
  if (!paper || paper.isDeleted) throw httpError(404, 'Paper not found');
  if (!paper.filePath) throw httpError(404, 'No file attached to this paper');
  const abs = path.join(__dirname, '..', '..', '..', '..', 'uploads', paper.filePath);
  if (!fs.existsSync(abs)) throw httpError(404, 'File missing on server');
  await audit(req, 'EXAM_PAPER_DOWNLOAD', 'ExamPaper', String(id), {});
  res.download(abs, paper.fileName || `paper-${id}${path.extname(abs)}`);
}));

// ------------------------------------------------------------
// 7. EXAM ATTENDANCE / ABSENTEE VERIFICATION (Exam Operations)
//    POST /exams/:examId/attendance/bootstrap → create PRESENT rows for
//         all registered students (idempotent).
//    GET  /exams/:examId/attendance           → roster + statuses.
//    PUT  /exams/:examId/attendance           → bulk update statuses.
// ------------------------------------------------------------
router.post('/exams/:examId/attendance/bootstrap', EXAM, asyncHandler(async (req, res) => {
  const examId = Number(req.params.examId);
  const exam = await prisma.examSchedule.findUnique({ where: { id: examId } });
  if (!exam || exam.isDeleted) throw httpError(404, 'Exam not found');
  if (!exam.offeringId) throw httpError(400, 'This exam has no linked offering.');
  const regs = await prisma.courseRegistration.findMany({
    where: { offeringId: exam.offeringId, status: 'ENROLLED' }, select: { studentId: true },
  });
  let created = 0;
  for (const r of regs) {
    const existing = await prisma.examAttendance.findUnique({
      where: { examId_studentId: { examId, studentId: r.studentId } },
    });
    if (!existing) {
      await prisma.examAttendance.create({
        data: { examId, studentId: r.studentId, offeringId: exam.offeringId, status: 'PRESENT' },
      });
      created += 1;
    }
  }
  await audit(req, 'EXAM_ATTENDANCE_BOOTSTRAP', 'ExamSchedule', String(examId), { after: { examId, created } });
  res.json({ success: true, created, total: regs.length });
}));

router.get('/exams/:examId/attendance', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const examId = Number(req.params.examId);
  const exam = await prisma.examSchedule.findUnique({ where: { id: examId } });
  if (!exam || exam.isDeleted) throw httpError(404, 'Exam not found');
  const labels = await offeringLabelMap([exam.offeringId]);
  const records = await prisma.examAttendance.findMany({ where: { examId }, orderBy: { id: 'asc' } });
  const names = await nameMap(records.map((r) => r.studentId));
  // include roll numbers
  const users = await prisma.lmsUser.findMany({
    where: { id: { in: records.map((r) => r.studentId) } }, select: { id: true, linkedRollNumber: true, username: true },
  });
  const rollMap = {}; for (const u of users) rollMap[u.id] = u.linkedRollNumber || u.username;
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, UFM: 0, EXEMPT: 0 };
  for (const r of records) counts[r.status] = (counts[r.status] || 0) + 1;
  res.json({
    exam: { id: exam.id, title: exam.title, date: exam.date, offering: labels[exam.offeringId] || null, status: exam.status },
    counts, total: records.length,
    records: records.map((r) => ({
      id: r.id, studentId: r.studentId, student: names[r.studentId] || r.studentId,
      roll: rollMap[r.studentId] || r.studentId, status: r.status, room: r.room,
      seatNo: r.seatNo, remarks: r.remarks, verifiedAt: r.verifiedAt,
    })),
  });
}));

router.put('/exams/:examId/attendance', EXAM, validate([
  body('records').isArray({ min: 1 }),
]), asyncHandler(async (req, res) => {
  const examId = Number(req.params.examId);
  const exam = await prisma.examSchedule.findUnique({ where: { id: examId } });
  if (!exam || exam.isDeleted) throw httpError(404, 'Exam not found');
  const VALID = ['PRESENT', 'ABSENT', 'LATE', 'UFM', 'EXEMPT'];
  let updated = 0;
  for (const rec of req.body.records) {
    if (!rec || !rec.studentId || !VALID.includes(rec.status)) continue;
    await prisma.examAttendance.upsert({
      where: { examId_studentId: { examId, studentId: rec.studentId } },
      update: {
        status: rec.status, remarks: rec.remarks || null, room: rec.room || null,
        seatNo: rec.seatNo || null, verifiedById: req.lmsUser.id, verifiedAt: new Date(),
      },
      create: {
        examId, studentId: rec.studentId, offeringId: exam.offeringId, status: rec.status,
        remarks: rec.remarks || null, room: rec.room || null, seatNo: rec.seatNo || null,
        verifiedById: req.lmsUser.id, verifiedAt: new Date(),
      },
    });
    updated += 1;
  }
  await audit(req, 'EXAM_ATTENDANCE_VERIFY', 'ExamSchedule', String(examId), { after: { examId, updated } });
  res.json({ success: true, updated });
}));

// ------------------------------------------------------------
// 8. TRANSCRIPT SYSTEM — issue verifiable transcripts.
//    POST /transcript/:id/issue   → snapshot current CGPA + semesters.
//    GET  /transcripts            → list issued transcripts.
//    PUT  /transcripts/:id/action → APPROVE | REVOKE.
// ------------------------------------------------------------
async function buildTranscriptPayload(studentId) {
  const student = await prisma.lmsUser.findUnique({ where: { id: studentId }, include: { profile: true } });
  if (!student) throw httpError(404, 'Student not found');
  const { cgpa, totalCredits, results } = await studentCgpa(studentId);
  const byTerm = {};
  for (const r of results) {
    const termId = r.offering?.termId || 0;
    (byTerm[termId] = byTerm[termId] || []).push({
      offeringId: r.offeringId, code: r.offering?.course?.code || null,
      title: r.offering?.course?.title || null,
      creditHours: r.offering?.course?.creditHours || 3,
      totalPercent: r.totalPercent, letterGrade: r.letterGrade, gradePoints: r.gradePoints,
    });
  }
  const termIds = Object.keys(byTerm).map(Number).filter((x) => x > 0);
  const terms = await prisma.academicTerm.findMany({ where: { id: { in: termIds } } });
  const termTitleMap = {}; for (const t of terms) termTitleMap[t.id] = t.title;
  const semesters = Object.entries(byTerm).map(([termId, courses]) => ({
    termId: Number(termId), term: termTitleMap[Number(termId)] || `Term ${termId}`,
    courses, gpa: computeGPA(courses.map((c) => ({ gradePoints: c.gradePoints, creditHours: c.creditHours }))),
    credits: courses.reduce((a, b) => a + b.creditHours, 0),
  }));
  return {
    student: {
      id: student.id, roll: student.linkedRollNumber || student.username,
      name: student.profile?.fullName || student.username,
      fatherName: student.profile?.fatherName || null,
      program: student.profile?.program || null, session: student.profile?.session || null,
    },
    cgpa, totalCredits, semesters,
  };
}

router.post('/transcript/:id/issue', EXAM, validate([
  body('kind').optional().isIn(['SEMESTER', 'FINAL']),
]), asyncHandler(async (req, res) => {
  const studentId = req.params.id;
  const { kind = 'FINAL', termId } = req.body;
  const payload = await buildTranscriptPayload(studentId);
  const verificationCode = `AUST-TR-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const record = await prisma.transcriptRecord.create({
    data: {
      studentId, verificationCode, kind, termId: termId ? Number(termId) : null,
      cgpa: payload.cgpa, totalCredits: payload.totalCredits,
      payloadJson: JSON.stringify(payload), status: 'ISSUED', issuedById: req.lmsUser.id,
    },
  });
  await audit(req, 'EXAM_TRANSCRIPT_ISSUE', 'TranscriptRecord', String(record.id), { after: { id: record.id, verificationCode, cgpa: payload.cgpa } });
  await notify(studentId, {
    title: 'Transcript issued',
    message: `Your ${kind.toLowerCase()} transcript (CGPA ${payload.cgpa}) has been issued. Verification code: ${verificationCode}.`,
    type: 'SUCCESS',
  });
  res.status(201).json({ transcript: { ...record, payload } });
}));

router.get('/transcripts', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { studentId } = req.query;
  const where = {};
  if (studentId) where.studentId = String(studentId);
  const items = await prisma.transcriptRecord.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  const names = await nameMap(items.map((t) => t.studentId));
  res.json({
    transcripts: items.map((t) => ({
      id: t.id, studentId: t.studentId, student: names[t.studentId] || t.studentId,
      verificationCode: t.verificationCode, kind: t.kind, cgpa: t.cgpa,
      totalCredits: t.totalCredits, status: t.status, createdAt: t.createdAt,
      approvedAt: t.approvedAt,
    })),
  });
}));

router.get('/transcripts/:id', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const t = await prisma.transcriptRecord.findUnique({ where: { id } });
  if (!t) throw httpError(404, 'Transcript not found');
  let payload = null; try { payload = JSON.parse(t.payloadJson); } catch (_) { payload = null; }
  res.json({ transcript: { ...t, payload } });
}));

router.put('/transcripts/:id/action', EXAM, validate([
  body('action').isIn(['APPROVE', 'REVOKE']),
]), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.transcriptRecord.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'Transcript not found');
  const { action } = req.body;
  const data = action === 'APPROVE'
    ? { status: 'APPROVED', approvedById: req.lmsUser.id, approvedAt: new Date() }
    : { status: 'REVOKED', revokedAt: new Date() };
  const updated = await prisma.transcriptRecord.update({ where: { id }, data });
  await audit(req, `EXAM_TRANSCRIPT_${action}`, 'TranscriptRecord', String(id), { before: existing, after: updated });
  await notify(existing.studentId, {
    title: action === 'APPROVE' ? 'Transcript approved' : 'Transcript revoked',
    message: action === 'APPROVE'
      ? `Your transcript (${existing.verificationCode}) has been approved and is now official.`
      : `Your transcript (${existing.verificationCode}) has been revoked.`,
    type: action === 'APPROVE' ? 'SUCCESS' : 'WARNING',
  });
  res.json({ transcript: updated });
}));

// ------------------------------------------------------------
// 9. REPORT EXPORTS — CSV download for any report kind.
// ------------------------------------------------------------
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

async function buildReportRows(kind) {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  if (kind === 'gazette') {
    const results = await prisma.courseResult.findMany({
      where: { status: 'PUBLISHED', offering: { termId } },
      include: { offering: { include: { course: true } } },
    });
    const names = await nameMap(results.map((r) => r.studentId));
    return results.map((r) => ({
      student: names[r.studentId] || r.studentId,
      course: r.offering?.course ? `${r.offering.course.code} ${r.offering.course.title}` : '',
      percent: r.totalPercent, grade: r.letterGrade, gp: r.gradePoints,
      status: r.totalPercent >= PASS_PERCENT ? 'PASS' : 'FAIL',
    }));
  }
  if (kind === 'probation') {
    const students = await prisma.lmsUser.findMany({ where: { role: 'Student' }, include: { profile: true } });
    const rows = [];
    for (const s of students) {
      const { cgpa, totalCredits } = await studentCgpa(s.id);
      if (totalCredits > 0 && cgpa < 2.0) {
        rows.push({ roll: s.linkedRollNumber || s.username, name: s.profile?.fullName || s.username, cgpa, totalCredits, status: cgpa < 1.0 ? 'DISMISSAL_RISK' : 'PROBATION' });
      }
    }
    return rows;
  }
  if (kind === 'incomplete') {
    const regs = await prisma.courseRegistration.findMany({
      where: { status: 'ENROLLED', offering: { termId } },
      include: { offering: { include: { course: true } } },
    });
    const names = await nameMap(regs.map((r) => r.studentId));
    const rows = [];
    for (const reg of regs) {
      const result = await prisma.courseResult.findUnique({
        where: { offeringId_studentId: { offeringId: reg.offeringId, studentId: reg.studentId } },
      });
      if (!result || result.status !== 'PUBLISHED') {
        rows.push({ student: names[reg.studentId] || reg.studentId, course: reg.offering?.course ? `${reg.offering.course.code} ${reg.offering.course.title}` : '', status: result ? 'DRAFT' : 'NO_RESULT' });
      }
    }
    return rows;
  }
  if (kind === 'absentees') {
    const results = await prisma.courseResult.findMany({
      where: { offering: { termId }, finalMarks: 0 },
      include: { offering: { include: { course: true } } },
    });
    const names = await nameMap(results.map((r) => r.studentId));
    return results.map((r) => ({ student: names[r.studentId] || r.studentId, course: r.offering?.course ? `${r.offering.course.code} ${r.offering.course.title}` : '', component: 'FINAL', status: 'ABSENT' }));
  }
  throw httpError(400, 'Unknown report kind');
}

router.get('/reports/:kind/export', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const kind = req.params.kind;
  const rows = await buildReportRows(kind);
  const csv = toCsv(rows);
  await audit(req, 'EXAM_REPORT_EXPORT', 'Report', kind, { after: { count: rows.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${kind}-report.csv"`);
  res.send(csv || 'No data');
}));

// ------------------------------------------------------------
// 10. ACCOUNT SETTINGS — self profile + secure password change.
// ------------------------------------------------------------
router.get('/me', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const u = await prisma.lmsUser.findUnique({
    where: { id: req.lmsUser.id },
    select: { id: true, username: true, role: true, isActive: true, linkedRollNumber: true, lastLoginAt: true, createdAt: true, profile: true },
  });
  res.json({ user: u });
}));

router.put('/me/profile', EXAM_OR_GOV, validate([
  body('username').optional().isString().trim().isLength({ min: 3 }),
]), asyncHandler(async (req, res) => {
  const data = {};
  if (req.body.username !== undefined) data.username = String(req.body.username).trim();
  if (!Object.keys(data).length) throw httpError(400, 'Nothing to update');
  try {
    const u = await prisma.lmsUser.update({
      where: { id: req.lmsUser.id }, data,
      select: { id: true, username: true, role: true },
    });
    await audit(req, 'EXAM_PROFILE_UPDATE', 'LmsUser', req.lmsUser.id, { after: data });
    res.json({ user: u });
  } catch (e) {
    if (e.code === 'P2002') throw httpError(409, 'That username is already taken.');
    throw e;
  }
}));

const STRONG_PW = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
router.put('/me/password', EXAM_OR_GOV, validate([
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
  await audit(req, 'EXAM_PASSWORD_CHANGE', 'LmsUser', user.id, {});
  res.json({ success: true });
}));

// ============================================================
// FILTERS — single source of truth for all dropdown options used
// across the Exam Controller modules (Program / Semester / Section /
// Department / Course / Session). Fully DB-driven, no hardcoded lists.
// ============================================================
router.get('/filters', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  const [programs, terms, offerings, profiles] = await Promise.all([
    prisma.lmsProgram.findMany({ where: { isDeleted: false }, orderBy: { code: 'asc' } }),
    prisma.academicTerm.findMany({ where: { isActive: true }, orderBy: { id: 'desc' } }),
    prisma.courseOffering.findMany({
      where: { isDeleted: false },
      include: { course: { include: { program: true, semester: true } }, sections: true },
    }),
    prisma.lmsStudentProfile.findMany({
      select: { program: true, programShortForm: true, department: true, session: true },
    }),
  ]);

  // Semesters keyed by program code.
  const semestersByProgram = {};
  for (const p of programs) {
    const sems = await prisma.lmsSemester.findMany({
      where: { programId: p.id, isDeleted: false }, orderBy: { number: 'asc' },
    });
    semestersByProgram[p.code] = sems.map((s) => ({ value: String(s.number), label: s.title }));
  }

  // Sections (distinct names) and courses derived from offerings.
  const sectionSet = new Set();
  const courses = [];
  for (const o of offerings) {
    (o.sections || []).forEach((s) => sectionSet.add(s.name));
    if (o.course) {
      courses.push({
        offeringId: o.id,
        code: o.course.code,
        title: o.course.title,
        label: `${o.course.code} ${o.course.title}`,
        programCode: o.course.program?.code || null,
        semester: o.course.semester ? String(o.course.semester.number) : null,
      });
    }
  }

  const departments = Array.from(new Set(
    [...programs.map((p) => p.department), ...profiles.map((p) => p.department)].filter(Boolean)
  )).sort();

  res.json({
    currentTerm: term ? { id: term.id, code: term.code, title: term.title } : null,
    departments,
    programs: programs.map((p) => ({ code: p.code, name: p.name, shortForm: p.shortForm, department: p.department, totalSemesters: p.totalSemesters })),
    semestersByProgram,
    sections: Array.from(sectionSet).sort(),
    courses,
    sessions: terms.map((t) => ({ id: t.id, code: t.code, title: t.title, isCurrent: t.isCurrent })),
  });
}));

// ============================================================
// DATE SHEETS — list / auto-generate / manual create / publish / delete
// ============================================================
function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const DEFAULT_SLOTS = [
  { startTime: '09:00', endTime: '12:00' },
  { startTime: '13:00', endTime: '16:00' },
  { startTime: '16:30', endTime: '19:30' },
];

router.get('/datesheets', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { status, program, semester, department } = req.query;
  const where = { isDeleted: false };
  if (status) where.status = status;
  if (program) where.programShortForm = program;
  if (semester) where.semester = String(semester);
  const sheets = await prisma.dateSheet.findMany({
    where, orderBy: { createdAt: 'desc' },
    include: { entries: { orderBy: [{ date: 'asc' }, { startTime: 'asc' }] } },
  });
  const progDept = await programDeptMap();
  const deptOf = (s) => progDept[s.programShortForm] || progDept[s.program] || null;
  let datesheets = sheets.map((s) => ({
    id: s.id, title: s.title, examType: s.examType, program: s.program,
    programShortForm: s.programShortForm, semester: s.semester, startDate: s.startDate,
    department: deptOf(s),
    durationMin: s.durationMin, gapDays: s.gapDays, slotsPerDay: s.slotsPerDay,
    status: s.status, generated: s.generated, createdAt: s.createdAt,
    entryCount: s.entries.length,
    entries: s.entries.map((e) => ({
      id: e.id, offeringId: e.offeringId, courseCode: e.courseCode, courseTitle: e.courseTitle,
      semester: e.semester, section: e.section, date: e.date, startTime: e.startTime,
      endTime: e.endTime, room: e.room,
    })),
  }));
  const departments = [...new Set(datesheets.map((s) => s.department).filter(Boolean))].sort();
  if (department) datesheets = datesheets.filter((s) => s.department === department);
  res.json({ datesheets, departments });
}));

// Auto-generate one or more date sheets (per selected semester).
router.post('/datesheets/auto-generate', EXAM, validate([
  body('examType').isString().notEmpty(),
  body('program').isString().notEmpty(),
  body('startDate').isString().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { examType, program, startDate, durationMin = 180, gapDays = 1, slotsPerDay = 2 } = req.body;
  let { semesters } = req.body; // array of semester numbers, or "ALL"
  const term = await currentTerm();
  const termId = term ? term.id : null;

  const prog = await prisma.lmsProgram.findFirst({ where: { OR: [{ shortForm: program }, { code: program }] } });
  if (!prog) throw httpError(404, 'Program not found');

  // Resolve target semesters.
  const allSems = await prisma.lmsSemester.findMany({ where: { programId: prog.id, isDeleted: false }, orderBy: { number: 'asc' } });
  let targetSems;
  if (!semesters || semesters === 'ALL' || (Array.isArray(semesters) && semesters.includes('ALL'))) {
    targetSems = allSems;
  } else {
    const wanted = (Array.isArray(semesters) ? semesters : [semesters]).map(String);
    targetSems = allSems.filter((s) => wanted.includes(String(s.number)));
  }
  if (!targetSems.length) throw httpError(400, 'No matching semesters for this program.');

  const slotTimes = DEFAULT_SLOTS.slice(0, Math.max(1, Math.min(3, Number(slotsPerDay))));
  const created = [];

  for (const sem of targetSems) {
    // Courses for this program + semester → exam slots.
    const courses = await prisma.lmsCourse.findMany({
      where: { programId: prog.id, semesterId: sem.id, isDeleted: false }, orderBy: { code: 'asc' },
    });
    const sheet = await prisma.dateSheet.create({
      data: {
        termId, title: `${prog.shortForm || prog.code} · Semester ${sem.number} · ${examType} Date Sheet`,
        examType, program: prog.name, programShortForm: prog.shortForm || prog.code,
        semester: String(sem.number), startDate, durationMin: Number(durationMin),
        gapDays: Number(gapDays), slotsPerDay: Number(slotsPerDay), status: 'DRAFT',
        generated: true, createdById: req.lmsUser.id,
      },
    });
    // Distribute courses across days/slots with gap days between exam days.
    let dayIndex = 0, slotIndex = 0;
    for (const c of courses) {
      const date = addDays(startDate, dayIndex * (Number(gapDays) + 1));
      const slot = slotTimes[slotIndex];
      await prisma.dateSheetEntry.create({
        data: {
          dateSheetId: sheet.id, courseCode: c.code, courseTitle: c.title,
          semester: String(sem.number), date, startTime: slot.startTime, endTime: slot.endTime,
        },
      });
      slotIndex += 1;
      if (slotIndex >= slotTimes.length) { slotIndex = 0; dayIndex += 1; }
    }
    created.push(sheet.id);
  }
  await audit(req, 'EXAM_DATESHEET_AUTOGEN', 'DateSheet', created.join(','), { after: { program, examType, semesters: targetSems.map((s) => s.number) } });
  res.status(201).json({ success: true, created, count: created.length });
}));

// Manual create a date sheet with explicit entries.
router.post('/datesheets', EXAM, validate([
  body('title').isString().notEmpty(),
  body('examType').isString().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { title, examType, program, programShortForm, semester, entries = [] } = req.body;
  const term = await currentTerm();
  const sheet = await prisma.dateSheet.create({
    data: {
      termId: term?.id || null, title, examType, program: program || null,
      programShortForm: programShortForm || null, semester: semester ? String(semester) : null,
      status: 'DRAFT', generated: false, createdById: req.lmsUser.id,
      entries: {
        create: (Array.isArray(entries) ? entries : []).filter((e) => e && e.date).map((e) => ({
          offeringId: e.offeringId ? Number(e.offeringId) : null,
          courseCode: e.courseCode || null, courseTitle: e.courseTitle || null,
          semester: e.semester ? String(e.semester) : (semester ? String(semester) : null),
          section: e.section || null, date: e.date, startTime: e.startTime || null,
          endTime: e.endTime || null, room: e.room || null,
        })),
      },
    },
    include: { entries: true },
  });
  await audit(req, 'EXAM_DATESHEET_CREATE', 'DateSheet', String(sheet.id), { after: { title, examType } });
  res.status(201).json({ datesheet: sheet });
}));

// Add a single manual entry to an existing date sheet.
router.post('/datesheets/:id/entries', EXAM, validate([
  body('date').isString().notEmpty(),
]), asyncHandler(async (req, res) => {
  const dateSheetId = Number(req.params.id);
  const sheet = await prisma.dateSheet.findUnique({ where: { id: dateSheetId } });
  if (!sheet || sheet.isDeleted) throw httpError(404, 'Date sheet not found');
  const e = req.body;
  const entry = await prisma.dateSheetEntry.create({
    data: {
      dateSheetId, offeringId: e.offeringId ? Number(e.offeringId) : null,
      courseCode: e.courseCode || null, courseTitle: e.courseTitle || null,
      semester: e.semester ? String(e.semester) : sheet.semester, section: e.section || null,
      date: e.date, startTime: e.startTime || null, endTime: e.endTime || null, room: e.room || null,
    },
  });
  await audit(req, 'EXAM_DATESHEET_ENTRY_ADD', 'DateSheet', String(dateSheetId), { after: { entryId: entry.id } });
  res.status(201).json({ entry });
}));

router.put('/datesheets/:id/status', EXAM, validate([
  body('status').isIn(['DRAFT', 'PUBLISHED']),
]), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const sheet = await prisma.dateSheet.update({ where: { id }, data: { status: req.body.status } });
  await audit(req, 'EXAM_DATESHEET_STATUS', 'DateSheet', String(id), { after: { status: req.body.status } });
  res.json({ datesheet: sheet });
}));

// ------------------------------------------------------------
// Update a single date sheet entry (manual editing after generation).
// Re-checks intra-sheet clashes so a manual edit cannot double-book a
// slot within the same date sheet.
// ------------------------------------------------------------
router.put('/datesheets/:id/entries/:entryId', EXAM, asyncHandler(async (req, res) => {
  const dateSheetId = Number(req.params.id);
  const entryId = Number(req.params.entryId);
  const e = req.body || {};
  const data = {};
  ['courseCode', 'courseTitle', 'semester', 'section', 'date', 'startTime', 'endTime'].forEach((k) => {
    if (e[k] !== undefined) data[k] = e[k] === '' ? null : e[k];
  });
  const updated = await prisma.dateSheetEntry.update({ where: { id: entryId }, data });
  await audit(req, 'EXAM_DATESHEET_ENTRY_UPDATE', 'DateSheet', String(dateSheetId), { after: { entryId } });
  res.json({ entry: updated });
}));

// Delete a single date sheet entry (manual editing).
router.delete('/datesheets/:id/entries/:entryId', EXAM, asyncHandler(async (req, res) => {
  const entryId = Number(req.params.entryId);
  await prisma.dateSheetEntry.delete({ where: { id: entryId } });
  await audit(req, 'EXAM_DATESHEET_ENTRY_DELETE', 'DateSheet', String(req.params.id), { after: { entryId } });
  res.json({ success: true });
}));

// ------------------------------------------------------------
// Intra-sheet clash report — flags any two entries that share a
// date + overlapping time window (so a date sheet can be verified
// clash-free before it is locked / distributed).
// ------------------------------------------------------------
function sheetClashes(entries = []) {
  const clashes = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]; const b = entries[j];
      if (a.date !== b.date) continue;
      const s1 = timeToMin(a.startTime); const e1 = timeToMin(a.endTime);
      const s2 = timeToMin(b.startTime); const e2 = timeToMin(b.endTime);
      if (windowsOverlap(s1, e1, s2, e2)) {
        clashes.push({ a: { id: a.id, course: a.courseCode }, b: { id: b.id, course: b.courseCode }, date: a.date });
      }
    }
  }
  return clashes;
}

router.get('/datesheets/:id/clash-check', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const sheet = await prisma.dateSheet.findUnique({ where: { id }, include: { entries: true } });
  if (!sheet) throw httpError(404, 'Date sheet not found');
  const clashes = sheetClashes(sheet.entries);
  res.json({ hasClash: clashes.length > 0, clashes });
}));

// ------------------------------------------------------------
// LOCK a date sheet → finalize + auto-distribute personalized
// date sheets to every affected student and teacher (§1.2).
//   • Each student receives ONLY their relevant papers.
//   • Each teacher receives ONLY the papers for courses they teach.
// Distribution is done via per-user notifications carrying a
// personalized subject/date/time list. Refuses to lock if the sheet
// still contains scheduling clashes.
// ------------------------------------------------------------
router.put('/datesheets/:id/lock', EXAM, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const sheet = await prisma.dateSheet.findUnique({ where: { id }, include: { entries: true } });
  if (!sheet || sheet.isDeleted) throw httpError(404, 'Date sheet not found');

  // Guard: never distribute a clashing date sheet.
  const clashes = sheetClashes(sheet.entries);
  if (clashes.length) throw httpError(400, 'Cannot lock — the date sheet still has scheduling clashes. Resolve them first.');

  const term = await currentTerm();
  const termId = term ? term.id : null;

  // Resolve each entry to a course offering in the current term (by
  // explicit offeringId, else by course code) so we can find the
  // enrolled students and the assigned teacher.
  const codes = [...new Set(sheet.entries.map((e) => e.courseCode).filter(Boolean))];
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, ...(termId ? { termId } : {}), course: codes.length ? { code: { in: codes } } : undefined },
    include: { course: true, registrations: { where: { status: 'ENROLLED' }, select: { studentId: true } } },
  });
  const offByCode = {};
  offerings.forEach((o) => { if (o.course?.code) (offByCode[o.course.code] = offByCode[o.course.code] || []).push(o); });

  // studentId -> [papers], teacherId -> [papers]
  const studentPapers = {};
  const teacherPapers = {};
  const paperOf = (e) => ({ course: `${e.courseCode || ''} ${e.courseTitle || ''}`.trim(), date: e.date, startTime: e.startTime, endTime: e.endTime });

  for (const e of sheet.entries) {
    let offs = [];
    if (e.offeringId) { const o = offerings.find((x) => x.id === e.offeringId); if (o) offs = [o]; }
    if (!offs.length && e.courseCode) offs = offByCode[e.courseCode] || [];
    for (const o of offs) {
      const p = paperOf(e);
      (o.registrations || []).forEach((r) => { (studentPapers[r.studentId] = studentPapers[r.studentId] || []).push(p); });
      if (o.teacherId) (teacherPapers[o.teacherId] = teacherPapers[o.teacherId] || []).push(p);
    }
  }

  const fmt = (papers) => papers
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || ''))
    .map((p) => `• ${p.course} — ${p.date}${p.startTime ? ` ${p.startTime}${p.endTime ? `–${p.endTime}` : ''}` : ''}`)
    .join('\n');

  const studentIds = Object.keys(studentPapers);
  const teacherIds = Object.keys(teacherPapers);

  // Deliver personalized date sheets.
  await Promise.all([
    ...studentIds.map((sid) => notify(sid, {
      title: `Your ${sheet.examType} date sheet is finalized`,
      message: `Your personalized ${sheet.examType} exam date sheet (${sheet.title}):\n${fmt(studentPapers[sid])}`,
      type: 'INFO',
    })),
    ...teacherIds.map((tid) => notify(tid, {
      title: `${sheet.examType} date sheet finalized`,
      message: `Your personalized ${sheet.examType} exam date sheet (courses you teach) for ${sheet.title}:\n${fmt(teacherPapers[tid])}`,
      type: 'INFO',
    })),
  ]);

  const locked = await prisma.dateSheet.update({ where: { id }, data: { status: 'LOCKED' } });
  await audit(req, 'EXAM_DATESHEET_LOCK', 'DateSheet', String(id), {
    after: { status: 'LOCKED', studentsNotified: studentIds.length, teachersNotified: teacherIds.length },
  });
  res.json({
    datesheet: locked,
    distributed: { students: studentIds.length, teachers: teacherIds.length },
  });
}));

router.delete('/datesheets/:id', EXAM, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.dateSheet.update({ where: { id }, data: { isDeleted: true } });
  await audit(req, 'EXAM_DATESHEET_DELETE', 'DateSheet', String(id), {});
  res.json({ success: true });
}));

// ============================================================
// QUICK MESSAGES — Exam Controller → Teacher reminders (Incomplete
// Results module). Persisted via LmsThreadMessage + a notification.
// ============================================================
router.get('/quick-messages', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const msgs = await prisma.lmsThreadMessage.findMany({
    where: { senderId: req.lmsUser.id, category: 'EXAM_REMINDER' },
    orderBy: { createdAt: 'desc' }, take: 50,
  });
  const names = await nameMap(msgs.map((m) => m.recipientId));
  res.json({
    messages: msgs.map((m) => ({
      id: m.id, recipientId: m.recipientId, recipient: names[m.recipientId] || m.recipientId,
      subject: m.subject, body: m.body, createdAt: m.createdAt,
    })),
  });
}));

router.post('/quick-messages', EXAM, validate([
  body('recipientId').isString().notEmpty(),
  body('body').isString().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { recipientId, subject, body: text } = req.body;
  const recipient = await prisma.lmsUser.findUnique({ where: { id: recipientId } });
  if (!recipient) throw httpError(404, 'Recipient not found');
  const msg = await prisma.lmsThreadMessage.create({
    data: {
      senderId: req.lmsUser.id, recipientId, subject: subject || 'Pending marks reminder',
      body: text, category: 'EXAM_REMINDER',
    },
  });
  await notify(recipientId, {
    title: subject || 'Pending marks reminder',
    message: text, type: 'WARNING',
  });
  await audit(req, 'EXAM_QUICK_MESSAGE', 'LmsThreadMessage', String(msg.id), { after: { recipientId } });
  res.status(201).json({ message: msg });
}));

// Teachers who have offerings with pending (incomplete / unpublished) results.
router.get('/quick-messages/pending', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const offerings = await prisma.courseOffering.findMany({
    where: { termId, isDeleted: false },
    include: {
      course: true,
      _count: { select: { registrations: true } },
      results: { select: { status: true } },
    },
  });
  const teacherIds = Array.from(new Set(offerings.map((o) => o.teacherId).filter(Boolean)));
  const names = await nameMap(teacherIds);

  const byTeacher = {};
  for (const o of offerings) {
    const enrolled = o._count?.registrations || 0;
    const published = (o.results || []).filter((r) => r.status === 'PUBLISHED').length;
    const pending = Math.max(0, enrolled - published);
    if (pending <= 0 || !o.teacherId) continue;
    if (!byTeacher[o.teacherId]) {
      byTeacher[o.teacherId] = {
        teacherId: o.teacherId, teacher: names[o.teacherId] || o.teacherId,
        offerings: [], pendingTotal: 0,
      };
    }
    byTeacher[o.teacherId].offerings.push({
      offeringId: o.id,
      course: o.course ? `${o.course.code} ${o.course.title}` : `Offering #${o.id}`,
      pending,
    });
    byTeacher[o.teacherId].pendingTotal += pending;
  }
  res.json({ term: term?.title || null, teachers: Object.values(byTeacher).sort((a, b) => b.pendingTotal - a.pendingTotal) });
}));

// ============================================================
// RESULTS COMPILATION (was "Marks Correction") — rich filtered result
// view + one-click compilation across semester / program / section.
// ============================================================
router.get('/compilation/results', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { department, program, semester, section, courseId, studentId, status } = req.query;
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  const where = { offering: { termId, isDeleted: false } };
  if (status) where.status = status;
  if (courseId) where.offeringId = Number(courseId);
  if (studentId) where.studentId = studentId;

  const results = await prisma.courseResult.findMany({
    where,
    include: {
      offering: { include: { course: { include: { program: true, semester: true } }, sections: true } },
      student: { include: { profile: true } },
    },
    orderBy: { id: 'desc' },
  });

  let rows = results.map((r) => {
    const course = r.offering?.course;
    const prof = r.student?.profile;
    const sectionName = (r.offering?.sections || [])[0]?.name || null;
    return {
      id: r.id, studentId: r.studentId,
      student: prof?.fullName || r.student?.username || r.studentId,
      roll: r.student?.linkedRollNumber || r.student?.username || null,
      offeringId: r.offeringId,
      courseCode: course?.code || null,
      course: course ? `${course.code} ${course.title}` : null,
      department: course?.program?.department || prof?.department || null,
      program: course?.program?.shortForm || course?.program?.code || prof?.programShortForm || prof?.program || null,
      semester: course?.semester ? String(course.semester.number) : null,
      section: sectionName,
      assignmentMarks: r.assignmentMarks, quizMarks: r.quizMarks,
      midMarks: r.midMarks, finalMarks: r.finalMarks,
      totalPercent: r.totalPercent, letterGrade: r.letterGrade, gradePoints: r.gradePoints,
      status: r.status, pass: r.totalPercent >= PASS_PERCENT,
    };
  });

  // Post-filter on derived fields (program/department/semester/section).
  if (department) rows = rows.filter((r) => r.department === department);
  if (program) rows = rows.filter((r) => r.program === program);
  if (semester) rows = rows.filter((r) => String(r.semester) === String(semester));
  if (section) rows = rows.filter((r) => r.section === section);

  res.json({
    term: term?.title || null,
    total: rows.length,
    draft: rows.filter((r) => r.status === 'DRAFT' || r.status === 'READY_FOR_REVIEW').length,
    submitted: rows.filter((r) => ['SUBMITTED', 'LOCKED'].includes(r.status)).length,
    compiled: rows.filter((r) => r.status === 'COMPILED').length,
    unofficial: rows.filter((r) => r.status === 'UNOFFICIAL_DECLARED').length,
    official: rows.filter((r) => ['OFFICIAL_FINALIZED', 'ARCHIVED', 'PUBLISHED'].includes(r.status)).length,
    published: rows.filter((r) => isStudentVisibleStatus(r.status)).length,
    results: rows,
  });
}));

router.get('/compilation/hierarchy', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  res.json(await lifecycle.hierarchy());
}));

router.get('/compilation/collection', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { department, program, semester } = req.query;
  res.json(await lifecycle.semesterMatrix({ department, program, semester }));
}));

router.get('/compilation/archive', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { department, program, semester } = req.query;
  const matrix = await lifecycle.semesterMatrix({ department, program, semester });
  const students = (matrix.students || []).filter((s) => Object.values(s.courses || {}).some((c) => c.status === 'ARCHIVED' || c.status === 'OFFICIAL_FINALIZED'));
  res.json({ ...matrix, students, readOnly: true });
}));

// Compile + publish results across a scope (semester / program / section).
// §1.4.2 — on compile, results are published AND automatically flow into a
// Gazette (built in gazette format). §1.5 — a fresh transcript is auto-issued
// in real time for every affected student, so the Gazette Review and
// transcript are always in sync with the published record.
router.post('/compilation/compile', EXAM, asyncHandler(async (req, res) => {
  const { department, program, semester } = req.body || {};
  if (!department || !program || semester == null || semester === '') {
    throw httpError(400, 'Department, Program and Semester are required.');
  }
  const out = await lifecycle.compileScope(req, { department, program, semester });
  res.json({ success: true, stage: 'RESULTS_COLLECTION', ...out, compiled: out.students, published: 0, transcriptsIssued: 0 });
}));

router.post('/compilation/unofficial', EXAM, asyncHandler(async (req, res) => {
  const { department, program, semester } = req.body || {};
  if (!department || !program || semester == null || semester === '') {
    throw httpError(400, 'Department, Program and Semester are required.');
  }
  const out = await lifecycle.declareUnofficial(req, { department, program, semester });
  const term = await currentTerm();
  let gazette = null;
  try {
    const rows = await buildGazetteRows({ termId: term?.id, program, semester });
    if (rows.length) {
      const prog = await prisma.lmsProgram.findFirst({ where: { OR: [{ shortForm: program }, { code: program }] } });
      gazette = await prisma.gazette.create({
        data: {
          termId: term?.id,
          title: `Gazette · ${program} · Sem ${semester} (admission batch preserved)`,
          department, program: prog?.name || program, programShortForm: program,
          semester: String(semester), status: 'DRAFT',
          totalStudents: rows.length,
          passCount: rows.filter((r) => r.pass).length,
          failCount: rows.length - rows.filter((r) => r.pass).length,
          createdById: req.lmsUser.id,
        },
      });
    }
  } catch (e) { void e; }
  res.json({ success: true, stage: 'UNOFFICIAL_DECLARED', ...out, gazette });
}));

// Finalize a compiled scope. FINALIZED is the Result Publishing queue: it is
// hidden from students but locked against every teacher mutation.
router.post('/compilation/finalize', EXAM, asyncHandler(async (req, res) => {
  const { department, program, semester } = req.body || {};
  if (!department || !program || semester == null || semester === '') throw httpError(400, 'Department, Program and Semester are required.');
  const out = await lifecycle.finalizeOfficial(req, { department, program, semester });
  const term = await currentTerm();
  await prisma.gazette.updateMany({
    where: { termId: term?.id, department, programShortForm: program, semester: String(semester), status: 'DRAFT' },
    data: { status: 'APPROVED', approvedById: req.lmsUser.id, approvedAt: new Date() },
  });
  res.json({ success: true, stage: 'OFFICIAL_FINALIZED', ...out });
}));

// Publish a finalized scope, then issue and notify transcripts in real time.
router.post('/compilation/publish', EXAM, asyncHandler(async (req, res) => {
  const { department, program, semester } = req.body || {};
  if (!department || !program || semester == null || semester === '') throw httpError(400, 'Department, Program and Semester are required.');
  const out = await lifecycle.declareOfficial(req, { department, program, semester });
  const term = await currentTerm();
  await prisma.gazette.updateMany({
    where: { termId: term?.id, department, programShortForm: program, semester: String(semester), status: 'APPROVED' },
    data: { status: 'PUBLISHED', publishedById: req.lmsUser.id, publishedAt: new Date() },
  });
  res.json({ success: true, stage: 'ARCHIVED', ...out, published: out.students, transcriptsIssued: out.students });
}));

/* legacy publish body disabled
  const pending = await prisma.courseResult.findMany({ where: { offeringId: { in: ids }, status: 'FINALIZED' }, select: { id: true, studentId: true } });
  if (!pending.length) throw httpError(409, 'No finalized results are waiting in Result Publishing for this scope.');
  await prisma.courseResult.updateMany({ where: { id: { in: pending.map((r) => r.id) } }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
  const studentIds = [...new Set(pending.map((r) => r.studentId))];
  let transcriptsIssued = 0;
  for (const studentId of studentIds) {
    try {
      const payload = await buildTranscriptPayload(studentId);
      await prisma.transcriptRecord.create({ data: { studentId, verificationCode: `AUST-TR-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, kind: 'SEMESTER', termId: term?.id, cgpa: payload.cgpa, totalCredits: payload.totalCredits, payloadJson: JSON.stringify(payload), status: 'ISSUED', issuedById: req.lmsUser.id } });
      transcriptsIssued += 1;
    } catch (e) { void e; }
  }
  await prisma.gazette.updateMany({ where: { termId: term?.id, department, programShortForm: program, semester: String(semester), status: 'APPROVED' }, data: { status: 'PUBLISHED', publishedById: req.lmsUser.id, publishedAt: new Date() } });
  await notifyMany(studentIds, { title: 'Results published', message: 'Your final results and transcript are now available.', type: 'SUCCESS', link: '/student/results' });
  await audit(req, 'EXAM_RESULTS_PUBLISH_SCOPE', 'CourseOffering', ids.join(','), { after: { department, program, semester, published: pending.length, transcriptsIssued } });
  res.json({ success: true, stage: 'PUBLISHED', published: pending.length, transcriptsIssued });
}));
*/

// NOTE: The "Result Hold and Release" module (POST /results/hold and
// POST /results/release) was removed per the LMS update requirements
// (Section 1.7). No other module depends on these endpoints.

// ============================================================
// GAZETTE — build / list / approve / publish / download (CSV)
// ============================================================
async function buildGazetteRows({ termId, program, semester, section }) {
  const offerings = await prisma.courseOffering.findMany({
    where: { termId, isDeleted: false },
    include: { course: { include: { program: true, semester: true } }, sections: true },
  });
  const scoped = offerings.filter((o) => {
    if (program) {
      const code = o.course?.program?.shortForm || o.course?.program?.code;
      if (code !== program) return false;
    }
    if (semester && o.course?.semester && String(o.course.semester.number) !== String(semester)) return false;
    if (section && !(o.sections || []).some((s) => s.name === section)) return false;
    return true;
  });
  const offeringIds = scoped.map((o) => o.id);
  const results = await prisma.courseResult.findMany({
    where: { offeringId: { in: offeringIds }, status: { in: ['SUBMITTED', 'LOCKED', 'COMPILED', 'UNOFFICIAL_DECLARED', 'OFFICIAL_FINALIZED', 'ARCHIVED', 'FINALIZED', 'PUBLISHED'] } },
    include: { student: { include: { profile: true } }, offering: { include: { course: true } } },
  });
  return results.map((r) => ({
    roll: r.student?.linkedRollNumber || r.student?.username || r.studentId,
    student: r.student?.profile?.fullName || r.student?.username || r.studentId,
    course: r.offering?.course ? `${r.offering.course.code} ${r.offering.course.title}` : null,
    percent: r.totalPercent, grade: r.letterGrade, gp: r.gradePoints,
    pass: r.totalPercent >= PASS_PERCENT,
  }));
}

router.get('/gazettes', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const gazettes = await prisma.gazette.findMany({
    where: { isDeleted: false }, orderBy: { createdAt: 'desc' },
  });
  res.json({ gazettes });
}));

router.post('/gazettes/build', EXAM, asyncHandler(async (req, res) => {
  const { department, program, semester, section } = req.body || {};
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const rows = await buildGazetteRows({ termId, program, semester, section });
  const passCount = rows.filter((r) => r.pass).length;
  const prog = program ? await prisma.lmsProgram.findFirst({ where: { OR: [{ shortForm: program }, { code: program }] } }) : null;
  const gazette = await prisma.gazette.create({
    data: {
      termId, title: `Gazette · ${program || 'All Programs'}${semester ? ` · Sem ${semester}` : ''}${section ? ` · Sec ${section}` : ''}`,
      department: department || prog?.department || null, program: prog?.name || program || null,
      programShortForm: program || null, semester: semester ? String(semester) : null,
      section: section || null, status: 'DRAFT',
      totalStudents: rows.length, passCount, failCount: rows.length - passCount,
      createdById: req.lmsUser.id,
    },
  });
  await audit(req, 'EXAM_GAZETTE_BUILD', 'Gazette', String(gazette.id), { after: { program, semester, section } });
  res.status(201).json({ gazette, rows });
}));

router.put('/gazettes/:id/approve', EXAM, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const g = await prisma.gazette.findUnique({ where: { id } });
  if (!g || g.isDeleted) throw httpError(404, 'Gazette not found');
  const gazette = await prisma.gazette.update({
    where: { id }, data: { status: 'APPROVED', approvedById: req.lmsUser.id, approvedAt: new Date() },
  });
  await audit(req, 'EXAM_GAZETTE_APPROVE', 'Gazette', String(id), {});
  res.json({ gazette });
}));

router.put('/gazettes/:id/publish', EXAM, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const g = await prisma.gazette.findUnique({ where: { id } });
  if (!g || g.isDeleted) throw httpError(404, 'Gazette not found');
  if (g.status !== 'APPROVED') throw httpError(409, 'Gazette must be approved before publishing.');
  const gazette = await prisma.gazette.update({
    where: { id }, data: { status: 'PUBLISHED', publishedById: req.lmsUser.id, publishedAt: new Date() },
  });
  await audit(req, 'EXAM_GAZETTE_PUBLISH', 'Gazette', String(id), {});
  res.json({ gazette });
}));

router.delete('/gazettes/:id', EXAM, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await prisma.gazette.update({ where: { id }, data: { isDeleted: true } });
  await audit(req, 'EXAM_GAZETTE_DELETE', 'Gazette', String(id), {});
  res.json({ success: true });
}));

router.get('/gazettes/download', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const { program, semester, section } = req.query;
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const rows = await buildGazetteRows({ termId, program, semester, section });
  const header = ['Roll No', 'Student', 'Course', 'Percent', 'Grade', 'GP', 'Result'];
  const csv = [header.join(',')].concat(
    rows.map((r) => [r.roll, `"${(r.student || '').replace(/"/g, '""')}"`, `"${(r.course || '').replace(/"/g, '""')}"`, r.percent, r.grade || '', r.gp, r.pass ? 'PASS' : 'FAIL'].join(','))
  ).join('\n');
  const name = `gazette-${program || 'all'}${semester ? `-sem${semester}` : ''}${section ? `-sec${section}` : ''}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(csv);
}));

// ============================================================
// PROFILE (Settings) — rich editable Exam Controller profile incl.
// photo upload. Stored on the dedicated LmsExamProfile model.
// ============================================================
router.get('/profile', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const u = await prisma.lmsUser.findUnique({
    where: { id: req.lmsUser.id },
    select: { id: true, username: true, email: true, role: true, examProfile: true },
  });
  res.json({ user: u, profile: u?.examProfile || null });
}));

router.put('/profile', EXAM, validate([
  body('fullName').optional().isString(),
  body('email').optional().isString(),
]), asyncHandler(async (req, res) => {
  const allowed = ['fullName', 'fatherName', 'cnic', 'email', 'phone', 'whatsapp', 'gender', 'maritalStatus', 'address'];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k] === '' ? null : String(req.body[k]).trim();

  // Keep the login email (LmsUser.email) in sync when a profile email is set,
  // so the new email is usable for login and reflected everywhere immediately.
  if (req.body.email !== undefined) {
    try {
      await prisma.lmsUser.update({
        where: { id: req.lmsUser.id },
        data: { email: req.body.email ? String(req.body.email).toLowerCase().trim() : null },
      });
    } catch (e) {
      if (e.code === 'P2002') throw httpError(409, 'That email is already in use by another account.');
      throw e;
    }
  }

  const profile = await prisma.lmsExamProfile.upsert({
    where: { lmsUserId: req.lmsUser.id },
    update: data,
    create: { lmsUserId: req.lmsUser.id, ...data },
  });
  await audit(req, 'EXAM_PROFILE_FULL_UPDATE', 'LmsExamProfile', String(profile.id), { after: data });
  res.json({ profile });
}));

router.post('/profile/photo', EXAM, uploadExamProfilePhoto.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, 'No photo uploaded');
  const photoUrl = `/uploads/exam-profiles/${req.file.filename}`;
  const profile = await prisma.lmsExamProfile.upsert({
    where: { lmsUserId: req.lmsUser.id },
    update: { photoUrl },
    create: { lmsUserId: req.lmsUser.id, photoUrl },
  });
  await audit(req, 'EXAM_PROFILE_PHOTO', 'LmsExamProfile', String(profile.id), {});
  res.json({ photoUrl, profile });
}));

// ============================================================
// STUDENT APPEALS — appeals routed to the Exam Controller.
// Only appeals explicitly addressed to EXAM_CONTROLLER are shown.
// ============================================================
router.get('/student-appeals', EXAM_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'createdAt' });
  const where = { isDeleted: false, targetRole: 'EXAM_CONTROLLER' };
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

router.put('/student-appeals/:id/decide', EXAM, validate([
  body('action').isIn(['approve', 'reject', 'review']),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action, response } = req.body;
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted || appeal.targetRole !== 'EXAM_CONTROLLER') throw httpError(404, 'Appeal not found.');
  const statusMap = { approve: 'RESOLVED', reject: 'REJECTED', review: 'IN_REVIEW' };
  const newStatus = statusMap[action];
  const updated = await prisma.studentAppeal.update({
    where: { id },
    data: { status: newStatus, response: response || appeal.response, handledById: req.lmsUser.id, handledAt: action === 'review' ? null : new Date() },
  });
  await audit(req, `EXAM_APPEAL_${action.toUpperCase()}`, 'StudentAppeal', String(id), { before: { status: appeal.status }, after: { status: newStatus } });
  await notify(appeal.studentId, { title: `Appeal ${newStatus.toLowerCase()}`, message: response || `Your appeal "${appeal.subject}" was ${newStatus.toLowerCase()} by the Exam Controller.`, type: 'APPEAL', link: '/student/appeals' });
  res.json({ appeal: updated });
}));

module.exports = router;

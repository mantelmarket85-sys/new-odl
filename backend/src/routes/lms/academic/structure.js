// ============================================================
//  ACADEMIC STRUCTURE ROUTES  — /api/lms/academic/*
//  ------------------------------------------------------------
//  Programs, Semesters, Academic Terms, Courses, Course Offerings,
//  and Sections. These define the academic skeleton the Student +
//  Teacher modules operate on.
//
//  Read access: any authenticated LMS user.
//  Write access: CourseCoordinator (admin) + Provost + FocalPerson
//  (governance). Teachers can read their own offerings.
// ============================================================
const express = require('express');
const { body, param } = require('express-validator');
const prisma = require('../../../utils/prisma');
const { lmsAuth, lmsRequireRole } = require('../../../middleware/lmsAuth');
const { validate } = require('../../../middleware/validate');
const { asyncHandler, parseListQuery, paginated, httpError } = require('../../../utils/lmsHelpers');
const { audit } = require('../../../utils/lmsAudit');
const { buildDeptScope } = require('../../../utils/lmsDeptScope');
const { withCreditLabel } = require('../../../utils/lmsCredit');

const router = express.Router();
router.use(lmsAuth);

// Phase 1 §8/§11/§14 — DEPARTMENT ISOLATION at the DB-query level.
// The academic structure catalog (programs / courses / semesters) is shared
// data, but a department-bound Course Coordinator or Focal Person must only
// ever see the rows belonging to THEIR department. Governance roles
// (Provost / QEC / ExamController) and non-LMS admins are unscoped. We resolve
// the caller's scope once and expose helpers that inject a department filter
// into the Prisma `where`. Roles that are not department-bound (e.g. Teacher,
// Student read views) keep the previous unscoped behaviour.
const DEPT_BOUND_ROLES = ['CourseCoordinator', 'FocalPerson'];

async function scopeForRequest(req) {
  if (!DEPT_BOUND_ROLES.includes(req.lmsUser.role)) return null; // unscoped
  return buildDeptScope(req.lmsUser);
}

// Roles allowed to manage academic structure.
const MANAGE = lmsRequireRole('CourseCoordinator', 'Provost', 'FocalPerson');

/**
 * Normalize a course credit-hour payload into { creditHours, hasLab,
 * theoryCredit, labCredit }. Accepts either the new breakdown fields
 * (hasLab + theoryCredit + labCredit) OR a plain creditHours value.
 *  - Theory-only: theoryCredit == creditHours, labCredit null.
 *  - Lab component: creditHours = theory + lab (total), both stored.
 * Fully back-compatible: when only creditHours is sent it behaves exactly
 * as before (theory-only, hasLab false).
 */
function normalizeCredit(body) {
  const hasLab = body.hasLab === true || body.hasLab === 'true' || body.hasLab === 1 || body.hasLab === '1';
  if (hasLab) {
    const theory = Math.max(0, parseInt(body.theoryCredit, 10) || 0);
    const lab = Math.max(0, parseInt(body.labCredit, 10) || 0);
    const total = (theory + lab) || (parseInt(body.creditHours, 10) || 3);
    return { creditHours: total, hasLab: true, theoryCredit: theory, labCredit: lab };
  }
  // Theory-only. If theoryCredit given use it, else fall back to creditHours.
  const theory = body.theoryCredit != null && body.theoryCredit !== ''
    ? Math.max(0, parseInt(body.theoryCredit, 10) || 0)
    : (parseInt(body.creditHours, 10) || 3);
  return { creditHours: theory, hasLab: false, theoryCredit: theory, labCredit: null };
}

/**
 * Ensure a program's LmsSemester rows (Semester 1..N) exist to match its
 * configured `totalSemesters`. This is the single source of truth that makes
 * the Courses module + Scheme of Study semester dropdowns auto-populate
 * directly from the Program's "Total Semesters" setting.
 *
 *  - Missing semester slots (1..total) are created.
 *  - Existing slots within range are revived if previously soft-deleted.
 *  - Slots ABOVE the new total are soft-deleted ONLY when they hold no
 *    courses (so reducing the count never orphans assigned courses).
 *
 * Safe to call repeatedly (idempotent). Returns the in-range semester rows.
 */
async function syncProgramSemesters(programId, totalSemesters) {
  const total = Math.max(1, parseInt(totalSemesters, 10) || 1);

  // All existing semester rows for this program (including soft-deleted).
  const existing = await prisma.lmsSemester.findMany({
    where: { programId },
    include: { _count: { select: { courses: true } } },
    orderBy: { number: 'asc' },
  });
  const byNumber = new Map(existing.map((s) => [s.number, s]));

  // Create or revive slots 1..total.
  for (let n = 1; n <= total; n++) {
    const row = byNumber.get(n);
    if (!row) {
      await prisma.lmsSemester.create({
        data: { programId, number: n, title: `Semester ${n}` },
      });
    } else if (row.isDeleted) {
      await prisma.lmsSemester.update({
        where: { id: row.id },
        data: { isDeleted: false, deletedAt: null, isActive: true },
      });
    }
  }

  // Soft-delete out-of-range slots that have no courses attached.
  for (const row of existing) {
    if (row.number > total && !row.isDeleted) {
      const courseCount = row._count?.courses ?? 0;
      if (courseCount === 0) {
        await prisma.lmsSemester.update({
          where: { id: row.id },
          data: { isDeleted: true, deletedAt: new Date(), isActive: false },
        });
      }
    }
  }

  return prisma.lmsSemester.findMany({
    where: { programId, isDeleted: false },
    orderBy: { number: 'asc' },
  });
}

// ============================================================
// ACADEMIC TERMS
// ============================================================
router.get('/terms', asyncHandler(async (req, res) => {
  const terms = await prisma.academicTerm.findMany({
    where: { isActive: true },
    orderBy: { id: 'desc' },
  });
  res.json({ terms });
}));

router.get('/terms/current', asyncHandler(async (req, res) => {
  const term = await prisma.academicTerm.findFirst({ where: { isCurrent: true, isActive: true } });
  res.json({ term });
}));

router.post('/terms', MANAGE, validate([
  body('code').trim().notEmpty().withMessage('Term code is required'),
  body('title').trim().notEmpty().withMessage('Term title is required'),
]), asyncHandler(async (req, res) => {
  const { code, title, startDate, endDate, isCurrent } = req.body;
  if (isCurrent) {
    await prisma.academicTerm.updateMany({ data: { isCurrent: false } });
  }
  const term = await prisma.academicTerm.create({
    data: { code: code.trim(), title: title.trim(), startDate, endDate, isCurrent: !!isCurrent },
  });
  await audit(req, 'TERM_CREATE', 'AcademicTerm', term.id, { after: term });
  res.status(201).json({ term });
}));

router.put('/terms/:id/set-current', MANAGE, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await prisma.academicTerm.updateMany({ data: { isCurrent: false } });
  const term = await prisma.academicTerm.update({ where: { id }, data: { isCurrent: true } });
  await audit(req, 'TERM_SET_CURRENT', 'AcademicTerm', id, { after: term });
  res.json({ term });
}));

// ============================================================
// PROGRAMS
// ============================================================
router.get('/programs', asyncHandler(async (req, res) => {
  // DEPARTMENT ISOLATION (Phase 1 §7/§8/§14): a department-bound coordinator/
  // focal person only sees their own department's programs. Governance roles
  // are unscoped.
  const where = { isDeleted: false };
  const scope = await scopeForRequest(req);
  if (scope && !scope.unscoped) {
    where.id = { in: scope.programIds.length ? scope.programIds : [-1] };
  }
  const programs = await prisma.lmsProgram.findMany({
    where,
    include: { _count: { select: { semesters: true, courses: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ programs });
}));

router.get('/programs/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const program = await prisma.lmsProgram.findFirst({
    where: { id, isDeleted: false },
    include: {
      semesters: { where: { isDeleted: false }, orderBy: { number: 'asc' } },
      courses: { where: { isDeleted: false }, orderBy: { code: 'asc' } },
    },
  });
  if (!program) throw httpError(404, 'Program not found');
  res.json({ program });
}));

router.post('/programs', MANAGE, validate([
  body('code').trim().notEmpty().withMessage('Program code is required'),
  body('name').trim().notEmpty().withMessage('Program name is required'),
]), asyncHandler(async (req, res) => {
  const { code, name, shortForm, department, totalSemesters, durationYears } = req.body;
  const total = totalSemesters ? parseInt(totalSemesters, 10) : 4;
  const program = await prisma.lmsProgram.create({
    data: {
      code: code.trim(),
      name: name.trim(),
      shortForm: shortForm || '',
      department: department || null,
      totalSemesters: total,
      durationYears: durationYears ? parseFloat(durationYears) : 2,
    },
  });
  // Auto-generate Semester 1..N rows so course/scheme dropdowns populate.
  await syncProgramSemesters(program.id, total);
  await audit(req, 'PROGRAM_CREATE', 'LmsProgram', program.id, { after: program });
  res.status(201).json({ program });
}));

router.put('/programs/:id', MANAGE, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, shortForm, department, totalSemesters, durationYears, isActive } = req.body;
  const before = await prisma.lmsProgram.findUnique({ where: { id } });
  if (!before) throw httpError(404, 'Program not found');
  const nextTotal = totalSemesters != null ? parseInt(totalSemesters, 10) : before.totalSemesters;
  const program = await prisma.lmsProgram.update({
    where: { id },
    data: {
      name: name ?? before.name,
      shortForm: shortForm ?? before.shortForm,
      department: department ?? before.department,
      totalSemesters: nextTotal,
      durationYears: durationYears != null ? parseFloat(durationYears) : before.durationYears,
      isActive: isActive != null ? !!isActive : before.isActive,
    },
  });
  // Keep the program's Semester 1..N rows in sync with the configured total
  // (creates missing slots, prunes empty out-of-range ones).
  await syncProgramSemesters(id, nextTotal);
  await audit(req, 'PROGRAM_UPDATE', 'LmsProgram', id, { before, after: program });
  res.json({ program });
}));

router.delete('/programs/:id', MANAGE, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const program = await prisma.lmsProgram.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), isActive: false },
  });
  await audit(req, 'PROGRAM_DELETE', 'LmsProgram', id, { after: program });
  res.json({ message: 'Program archived', program });
}));

// ============================================================
// SEMESTERS (within a program)
// ============================================================
router.get('/programs/:programId/semesters', asyncHandler(async (req, res) => {
  const programId = parseInt(req.params.programId, 10);
  let semesters = await prisma.lmsSemester.findMany({
    where: { programId, isDeleted: false },
    include: { _count: { select: { courses: true } } },
    orderBy: { number: 'asc' },
  });
  // Self-heal: if the program defines totalSemesters but its Semester rows are
  // missing/incomplete (legacy data), generate them on demand so the dropdown
  // always reflects the program's configured total.
  const program = await prisma.lmsProgram.findFirst({ where: { id: programId, isDeleted: false } });
  if (program && program.totalSemesters > semesters.length) {
    await syncProgramSemesters(programId, program.totalSemesters);
    semesters = await prisma.lmsSemester.findMany({
      where: { programId, isDeleted: false },
      include: { _count: { select: { courses: true } } },
      orderBy: { number: 'asc' },
    });
  }
  res.json({ semesters });
}));

router.post('/programs/:programId/semesters', MANAGE, validate([
  body('number').isInt({ min: 1 }).withMessage('Semester number must be >= 1'),
]), asyncHandler(async (req, res) => {
  const programId = parseInt(req.params.programId, 10);
  const number = parseInt(req.body.number, 10);
  const title = req.body.title || `Semester ${number}`;
  const semester = await prisma.lmsSemester.create({ data: { programId, number, title } });
  await audit(req, 'SEMESTER_CREATE', 'LmsSemester', semester.id, { after: semester });
  res.status(201).json({ semester });
}));

// ============================================================
// COURSES (catalog)
// ============================================================
router.get('/courses', asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'code' });
  const where = { isDeleted: false };
  const requestedProgramId = req.query.programId ? parseInt(req.query.programId, 10) : null;
  if (req.query.semesterId) where.semesterId = parseInt(req.query.semesterId, 10);
  if (q.search) {
    where.OR = [
      { code: { contains: q.search } },
      { title: { contains: q.search } },
    ];
  }
  // DEPARTMENT ISOLATION (Phase 1 §8/§14): a department-bound coordinator/focal
  // person only sees courses that belong to their own department's programs.
  // Legacy cross-department courses are excluded at the query level. If the
  // caller also requests a specific programId we intersect it with the scope
  // so they can never widen their view to another department's program.
  const scope = await scopeForRequest(req);
  if (scope && !scope.unscoped) {
    const allowed = scope.programIds.length ? scope.programIds : [-1];
    if (requestedProgramId != null) {
      where.programId = allowed.includes(requestedProgramId) ? requestedProgramId : -1;
    } else {
      where.programId = { in: allowed };
    }
  } else if (requestedProgramId != null) {
    where.programId = requestedProgramId;
  }
  const [items, total] = await Promise.all([
    prisma.lmsCourse.findMany({
      where, orderBy: q.orderBy, skip: q.skip, take: q.take,
      include: { program: true, semester: true, _count: { select: { offerings: true } } },
    }),
    prisma.lmsCourse.count({ where }),
  ]);
  res.json(paginated(items.map(withCreditLabel), total, q));
}));

router.get('/courses/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const course = await prisma.lmsCourse.findFirst({
    where: { id, isDeleted: false },
    include: { program: true, semester: true },
  });
  if (!course) throw httpError(404, 'Course not found');
  res.json({ course: withCreditLabel(course) });
}));

router.post('/courses', MANAGE, validate([
  body('code').trim().notEmpty().withMessage('Course code is required'),
  body('title').trim().notEmpty().withMessage('Course title is required'),
]), asyncHandler(async (req, res) => {
  const { code, title, description, creditHours, programId, semesterId } = req.body;
  const credit = normalizeCredit(req.body);
  const course = await prisma.lmsCourse.create({
    data: {
      code: code.trim(),
      title: title.trim(),
      description: description || null,
      creditHours: credit.creditHours,
      hasLab: credit.hasLab,
      theoryCredit: credit.theoryCredit,
      labCredit: credit.labCredit,
      programId: programId ? parseInt(programId, 10) : null,
      semesterId: semesterId ? parseInt(semesterId, 10) : null,
    },
  });
  await audit(req, 'COURSE_CREATE', 'LmsCourse', course.id, { after: course });
  res.status(201).json({ course });
}));

// Bulk-create multiple courses for one program in a single call.
// Used by the "Add Multiple Courses" flow in the Courses module so a
// coordinator can enter several courses (each with its own semester) at once.
router.post('/courses/bulk', MANAGE, validate([
  body('programId').notEmpty().withMessage('programId is required'),
  body('courses').isArray({ min: 1 }).withMessage('At least one course is required'),
]), asyncHandler(async (req, res) => {
  const programId = parseInt(req.body.programId, 10);
  const program = await prisma.lmsProgram.findFirst({ where: { id: programId, isDeleted: false } });
  if (!program) throw httpError(400, 'Program not found');

  const rows = Array.isArray(req.body.courses) ? req.body.courses : [];
  const created = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const code = (r.code || '').trim();
    const title = (r.title || '').trim();
    if (!code || !title) {
      errors.push({ index: i, code, message: 'Course code and name are required' });
      continue;
    }
    try {
      const credit = normalizeCredit(r);
      const course = await prisma.lmsCourse.create({
        data: {
          code,
          title,
          description: r.description || null,
          creditHours: credit.creditHours,
          hasLab: credit.hasLab,
          theoryCredit: credit.theoryCredit,
          labCredit: credit.labCredit,
          programId,
          semesterId: r.semesterId ? parseInt(r.semesterId, 10) : null,
        },
      });
      created.push(course);
      await audit(req, 'COURSE_CREATE', 'LmsCourse', course.id, { after: course });
    } catch (e) {
      // Most likely a unique-constraint clash on `code`.
      const msg = String(e?.code) === 'P2002'
        ? `Course code "${code}" already exists`
        : (e.message || 'Failed to create course');
      errors.push({ index: i, code, message: msg });
    }
  }

  res.status(created.length ? 201 : 400).json({ created, createdCount: created.length, errors });
}));

router.put('/courses/:id', MANAGE, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.lmsCourse.findUnique({ where: { id } });
  if (!before) throw httpError(404, 'Course not found');
  const { title, description, creditHours, programId, semesterId, isActive } = req.body;
  // Distinguish "key omitted" (keep existing) from "explicit null" (clear value).
  // This allows the Scheme of Study drag&drop to UNASSIGN a course's semester.
  const hasSemesterKey = Object.prototype.hasOwnProperty.call(req.body, 'semesterId');
  const nextSemesterId = hasSemesterKey
    ? (semesterId == null || semesterId === '' ? null : parseInt(semesterId, 10))
    : before.semesterId;

  // Credit-hour breakdown: only recompute when the caller sends any credit
  // field (creditHours / hasLab / theoryCredit / labCredit). A bare
  // drag&drop { semesterId } update MUST NOT touch existing credit values.
  const touchesCredit = ['creditHours', 'hasLab', 'theoryCredit', 'labCredit']
    .some((k) => Object.prototype.hasOwnProperty.call(req.body, k));
  let creditData = {};
  if (touchesCredit) {
    const c = normalizeCredit(req.body);
    creditData = { creditHours: c.creditHours, hasLab: c.hasLab, theoryCredit: c.theoryCredit, labCredit: c.labCredit };
  }

  const course = await prisma.lmsCourse.update({
    where: { id },
    data: {
      title: title ?? before.title,
      description: description ?? before.description,
      programId: programId != null ? parseInt(programId, 10) : before.programId,
      semesterId: nextSemesterId,
      isActive: isActive != null ? !!isActive : before.isActive,
      ...creditData,
    },
  });
  await audit(req, 'COURSE_UPDATE', 'LmsCourse', id, { before, after: course });
  res.json({ course });
}));

router.delete('/courses/:id', MANAGE, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const course = await prisma.lmsCourse.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), isActive: false },
  });
  await audit(req, 'COURSE_DELETE', 'LmsCourse', id, { after: course });
  res.json({ message: 'Course archived', course });
}));

// ============================================================
// COURSE OFFERINGS (course taught in a term by a teacher)
// ============================================================
router.get('/offerings', asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'id' });
  const where = { isDeleted: false };
  if (req.query.termId) where.termId = parseInt(req.query.termId, 10);
  if (req.query.teacherId) where.teacherId = String(req.query.teacherId);
  if (req.query.courseId) where.courseId = parseInt(req.query.courseId, 10);
  // DEPARTMENT ISOLATION (Phase 1 §8/§14): restrict offerings to the caller's
  // own department courses. Governance/unscoped roles see everything.
  const scope = await scopeForRequest(req);
  if (scope && !scope.unscoped) {
    where.courseId = { in: scope.courseIds.length ? scope.courseIds : [-1] };
  }
  const [items, total] = await Promise.all([
    prisma.courseOffering.findMany({
      where, orderBy: q.orderBy, skip: q.skip, take: q.take,
      include: {
        course: { include: { program: true, semester: true } },
        term: true,
        teacher: { select: { id: true, username: true, role: true } },
        _count: { select: { registrations: true, sections: true } },
      },
    }),
    prisma.courseOffering.count({ where }),
  ]);
  res.json(paginated(items, total, q));
}));

router.get('/offerings/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const offering = await prisma.courseOffering.findFirst({
    where: { id, isDeleted: false },
    include: {
      course: { include: { program: true, semester: true } },
      term: true,
      teacher: { select: { id: true, username: true, role: true } },
      sections: { where: { isDeleted: false } },
      _count: { select: { registrations: true } },
    },
  });
  if (!offering) throw httpError(404, 'Offering not found');
  res.json({ offering });
}));

router.post('/offerings', MANAGE, validate([
  body('courseId').isInt().withMessage('courseId is required'),
  body('termId').isInt().withMessage('termId is required'),
]), asyncHandler(async (req, res) => {
  const { courseId, termId, teacherId, assignmentWeight, quizWeight, midWeight, finalWeight } = req.body;
  // Validate weights sum if all provided.
  const aw = assignmentWeight != null ? parseFloat(assignmentWeight) : 20;
  const qw = quizWeight != null ? parseFloat(quizWeight) : 15;
  const mw = midWeight != null ? parseFloat(midWeight) : 25;
  const fw = finalWeight != null ? parseFloat(finalWeight) : 40;
  if (Math.abs((aw + qw + mw + fw) - 100) > 0.01) {
    throw httpError(400, 'Assessment weights must total 100');
  }
  const offering = await prisma.courseOffering.create({
    data: {
      courseId: parseInt(courseId, 10),
      termId: parseInt(termId, 10),
      teacherId: teacherId || null,
      assignmentWeight: aw, quizWeight: qw, midWeight: mw, finalWeight: fw,
    },
    include: { course: true, term: true },
  });
  await audit(req, 'OFFERING_CREATE', 'CourseOffering', offering.id, { after: offering });
  res.status(201).json({ offering });
}));

router.put('/offerings/:id', MANAGE, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.courseOffering.findUnique({ where: { id } });
  if (!before) throw httpError(404, 'Offering not found');
  const { teacherId, assignmentWeight, quizWeight, midWeight, finalWeight, status } = req.body;
  const aw = assignmentWeight != null ? parseFloat(assignmentWeight) : before.assignmentWeight;
  const qw = quizWeight != null ? parseFloat(quizWeight) : before.quizWeight;
  const mw = midWeight != null ? parseFloat(midWeight) : before.midWeight;
  const fw = finalWeight != null ? parseFloat(finalWeight) : before.finalWeight;
  if (Math.abs((aw + qw + mw + fw) - 100) > 0.01) {
    throw httpError(400, 'Assessment weights must total 100');
  }
  const offering = await prisma.courseOffering.update({
    where: { id },
    data: {
      teacherId: teacherId !== undefined ? (teacherId || null) : before.teacherId,
      assignmentWeight: aw, quizWeight: qw, midWeight: mw, finalWeight: fw,
      status: status ?? before.status,
    },
  });
  await audit(req, 'OFFERING_UPDATE', 'CourseOffering', id, { before, after: offering });
  res.json({ offering });
}));

router.delete('/offerings/:id', MANAGE, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const offering = await prisma.courseOffering.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), status: 'CANCELLED' },
  });
  await audit(req, 'OFFERING_DELETE', 'CourseOffering', id, { after: offering });
  res.json({ message: 'Offering cancelled', offering });
}));

// ============================================================
// SECTIONS (within an offering)
// ============================================================
router.get('/offerings/:offeringId/sections', asyncHandler(async (req, res) => {
  const offeringId = parseInt(req.params.offeringId, 10);
  const sections = await prisma.section.findMany({
    where: { offeringId, isDeleted: false },
    include: {
      teacher: { select: { id: true, username: true } },
      _count: { select: { registrations: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json({ sections });
}));

router.post('/offerings/:offeringId/sections', MANAGE, validate([
  body('name').trim().notEmpty().withMessage('Section name is required'),
]), asyncHandler(async (req, res) => {
  const offeringId = parseInt(req.params.offeringId, 10);
  const { name, capacity, teacherId, room } = req.body;
  const section = await prisma.section.create({
    data: {
      offeringId,
      name: name.trim(),
      capacity: capacity ? parseInt(capacity, 10) : 150,
      teacherId: teacherId || null,
      room: room || null,
    },
  });
  await audit(req, 'SECTION_CREATE', 'Section', section.id, { after: section });
  res.status(201).json({ section });
}));

router.put('/sections/:id', MANAGE, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.section.findUnique({ where: { id } });
  if (!before) throw httpError(404, 'Section not found');
  const { name, capacity, teacherId, room } = req.body;
  const section = await prisma.section.update({
    where: { id },
    data: {
      name: name ?? before.name,
      capacity: capacity != null ? parseInt(capacity, 10) : before.capacity,
      teacherId: teacherId !== undefined ? (teacherId || null) : before.teacherId,
      room: room ?? before.room,
    },
  });
  await audit(req, 'SECTION_UPDATE', 'Section', id, { before, after: section });
  res.json({ section });
}));

router.delete('/sections/:id', MANAGE, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const section = await prisma.section.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await audit(req, 'SECTION_DELETE', 'Section', id, { after: section });
  res.json({ message: 'Section deleted', section });
}));

module.exports = router;

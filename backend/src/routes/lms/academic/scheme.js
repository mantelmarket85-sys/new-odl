// ============================================================
//  SCHEME OF STUDY  — /api/lms/academic/coordinator/schemes/*
//  ------------------------------------------------------------
//  Drag & drop semester-wise curriculum builder. All structural
//  changes persist to the DB instantly and snapshot a version into
//  SchemeVersion for history. Referential integrity + duplicate
//  guards enforced. 100% real-data (LmsCourse / SchemeCourse).
// ============================================================
const express = require('express');
const { body } = require('express-validator');
const prisma = require('../../../utils/prisma');
const { lmsAuth, lmsRequireRole } = require('../../../middleware/lmsAuth');
const { validate } = require('../../../middleware/validate');
const { asyncHandler, httpError } = require('../../../utils/lmsHelpers');
const { audit } = require('../../../utils/lmsAudit');
const { getUserDepartment, resolveDepartmentPrograms } = require('../../../utils/lmsDeptScope');

const router = express.Router();
router.use(lmsAuth);

const COORD = lmsRequireRole('CourseCoordinator');
const COORD_OR_GOV = lmsRequireRole('CourseCoordinator', 'Provost', 'FocalPerson');

// ------------------------------------------------------------
// §10 Department isolation for Scheme of Study.
// A Course Coordinator may only list / create / edit schemes for
// Programs belonging to THEIR OWN department. Governance roles
// (Provost) keep university-wide read access. FocalPerson is scoped
// to their own department too.
//   Returns: { isGov: bool, programIds: number[]|null }
//   programIds === null  => unrestricted (governance)
//   programIds === []    => no resolvable department => sees NOTHING
// ------------------------------------------------------------
async function schemeScope(lmsUser) {
  if (lmsUser.role === 'Provost' || lmsUser.role === 'QECCoordinator' || lmsUser.role === 'ExamController') {
    return { isGov: true, programIds: null };
  }
  const department = await getUserDepartment(lmsUser.id);
  if (!department) return { isGov: false, programIds: [] };
  const { programs } = await resolveDepartmentPrograms(department);
  return { isGov: false, programIds: programs.map((p) => p.id) };
}

// Fetch a scheme and guarantee the caller is allowed to mutate it (own dept).
async function loadOwnedScheme(lmsUser, schemeId) {
  const scheme = await prisma.schemeOfStudy.findFirst({ where: { id: schemeId, isDeleted: false } });
  if (!scheme) throw httpError(404, 'Scheme not found.');
  const scope = await schemeScope(lmsUser);
  if (!scope.isGov && !scope.programIds.includes(scheme.programId)) {
    throw httpError(403, 'This scheme belongs to another department.');
  }
  return scheme;
}

// Build the JSON snapshot of a scheme's current structure.
async function snapshot(schemeId) {
  const items = await prisma.schemeCourse.findMany({
    where: { schemeId },
    include: { course: { select: { code: true, title: true, creditHours: true } } },
    orderBy: [{ semester: 'asc' }, { orderIndex: 'asc' }],
  });
  return items.map((i) => ({
    courseId: i.courseId, code: i.course.code, title: i.course.title,
    credits: i.course.creditHours, semester: i.semester, orderIndex: i.orderIndex,
  }));
}

async function recordVersion(schemeId, changedById, changeNote) {
  const scheme = await prisma.schemeOfStudy.findUnique({ where: { id: schemeId } });
  if (!scheme) return;
  const snap = await snapshot(schemeId);
  const version = scheme.version + 1;
  await prisma.schemeOfStudy.update({ where: { id: schemeId }, data: { version } });
  await prisma.schemeVersion.create({
    data: { schemeId, version, snapshotJson: JSON.stringify(snap), changedById, changeNote: changeNote || null },
  });
}

// ------------------------------------------------------------
// List schemes (optionally by program).
// ------------------------------------------------------------
router.get('/schemes', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const where = { isDeleted: false };
  if (req.query.programId) where.programId = parseInt(req.query.programId, 10);

  // §10 — restrict to the coordinator's own department programs.
  const scope = await schemeScope(req.lmsUser);
  if (!scope.isGov) {
    const allowed = scope.programIds.length ? scope.programIds : [-1];
    if (where.programId) {
      // Requested a specific program — deny if it's outside their department.
      if (!scope.programIds.includes(where.programId)) {
        return res.json({ schemes: [] });
      }
    } else {
      where.programId = { in: allowed };
    }
  }

  const schemes = await prisma.schemeOfStudy.findMany({
    where,
    include: { program: { select: { id: true, name: true, shortForm: true, totalSemesters: true } }, _count: { select: { items: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ schemes: schemes.map((s) => ({
    id: s.id, name: s.name, description: s.description, version: s.version,
    isActive: s.isActive, programId: s.programId,
    program: s.program ? { id: s.program.id, name: s.program.name, shortForm: s.program.shortForm, totalSemesters: s.program.totalSemesters } : null,
    courseCount: s._count.items, updatedAt: s.updatedAt,
  })) });
}));

// ------------------------------------------------------------
// Full scheme builder view: semester columns + the scheme items +
// the pool of program courses NOT yet placed in this scheme.
// "All existing courses must automatically appear in scheme builder."
// ------------------------------------------------------------
router.get('/schemes/:id', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const scheme = await prisma.schemeOfStudy.findFirst({
    where: { id, isDeleted: false },
    include: { program: { select: { id: true, name: true, shortForm: true, totalSemesters: true } } },
  });
  if (!scheme) throw httpError(404, 'Scheme not found.');

  // §10 — a coordinator/focal person may only open a scheme from their own department.
  const viewScope = await schemeScope(req.lmsUser);
  if (!viewScope.isGov && !viewScope.programIds.includes(scheme.programId)) {
    throw httpError(403, 'This scheme belongs to another department.');
  }

  const items = await prisma.schemeCourse.findMany({
    where: { schemeId: id },
    include: { course: { select: { id: true, code: true, title: true, creditHours: true } } },
    orderBy: [{ semester: 'asc' }, { orderIndex: 'asc' }],
  });

  // All active program courses (auto-load). Those already in the scheme are
  // flagged so the frontend can show the unassigned pool.
  const allCourses = await prisma.lmsCourse.findMany({
    where: { isDeleted: false, isActive: true, programId: scheme.programId },
    select: { id: true, code: true, title: true, creditHours: true, semesterId: true },
    orderBy: { code: 'asc' },
  });
  const placed = new Set(items.map((i) => i.courseId));

  const totalSemesters = scheme.program?.totalSemesters || 4;
  const semesters = [];
  for (let n = 1; n <= totalSemesters; n++) {
    semesters.push({
      number: n,
      title: `Semester ${n}`,
      courses: items.filter((i) => i.semester === n).map((i) => ({
        schemeCourseId: i.id, courseId: i.courseId, code: i.course.code,
        title: i.course.title, credits: i.course.creditHours, orderIndex: i.orderIndex,
      })),
    });
  }

  res.json({
    scheme: { id: scheme.id, name: scheme.name, description: scheme.description, version: scheme.version, isActive: scheme.isActive,
      program: scheme.program ? { id: scheme.program.id, name: scheme.program.name, shortForm: scheme.program.shortForm, totalSemesters } : null },
    semesters,
    unassigned: allCourses.filter((c) => !placed.has(c.id)).map((c) => ({ courseId: c.id, code: c.code, title: c.title, credits: c.creditHours })),
    totalCourses: allCourses.length,
  });
}));

// Version history.
router.get('/schemes/:id/history', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await loadOwnedScheme(req.lmsUser, id); // §10 own-dept guard
  const versions = await prisma.schemeVersion.findMany({
    where: { schemeId: id }, orderBy: { version: 'desc' },
  });
  res.json({ versions: versions.map((v) => ({ id: v.id, version: v.version, changeNote: v.changeNote, createdAt: v.createdAt, items: JSON.parse(v.snapshotJson || '[]') })) });
}));

// ------------------------------------------------------------
// Create scheme.
// ------------------------------------------------------------
router.post('/schemes', COORD, validate([
  body('programId').notEmpty(),
  body('name').trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const programId = parseInt(req.body.programId, 10);
  const program = await prisma.lmsProgram.findUnique({ where: { id: programId } });
  if (!program) throw httpError(400, 'Program not found.');

  // §10 — coordinator may only create schemes for their own department programs.
  const scope = await schemeScope(req.lmsUser);
  if (!scope.isGov && !scope.programIds.includes(programId)) {
    throw httpError(403, 'You can only create a Scheme of Study for programs in your own department.');
  }

  const scheme = await prisma.schemeOfStudy.create({
    data: { programId, name: req.body.name.trim(), description: req.body.description || null, createdById: req.lmsUser.id },
  });
  await prisma.schemeVersion.create({ data: { schemeId: scheme.id, version: 1, snapshotJson: '[]', changedById: req.lmsUser.id, changeNote: 'Scheme created' } });
  await audit(req, 'SCHEME_CREATE', 'SchemeOfStudy', scheme.id, { after: scheme });
  res.status(201).json({ scheme });
}));

// Edit scheme metadata.
router.put('/schemes/:id', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await loadOwnedScheme(req.lmsUser, id); // §10 own-dept guard
  const data = {};
  if (req.body.name !== undefined && String(req.body.name).trim()) data.name = String(req.body.name).trim();
  if (req.body.description !== undefined) data.description = req.body.description || null;
  if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive;
  const scheme = await prisma.schemeOfStudy.update({ where: { id }, data });
  await audit(req, 'SCHEME_UPDATE', 'SchemeOfStudy', id, { before, after: scheme });
  res.json({ scheme });
}));

// Delete scheme (soft).
router.delete('/schemes/:id', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await loadOwnedScheme(req.lmsUser, id); // §10 own-dept guard
  await prisma.schemeOfStudy.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  await audit(req, 'SCHEME_DELETE', 'SchemeOfStudy', id, { before });
  res.json({ message: 'Scheme deleted' });
}));

// ------------------------------------------------------------
// DRAG & DROP — add / move / reorder / remove a course.
// Every change updates the DB instantly + records a version.
// ------------------------------------------------------------

// Add a course into a semester (drag from pool -> semester).
router.post('/schemes/:id/items', COORD, validate([
  body('courseId').notEmpty(),
  body('semester').notEmpty(),
]), asyncHandler(async (req, res) => {
  const schemeId = parseInt(req.params.id, 10);
  const courseId = parseInt(req.body.courseId, 10);
  const semester = parseInt(req.body.semester, 10);

  const scheme = await loadOwnedScheme(req.lmsUser, schemeId); // §10 own-dept guard
  // Referential integrity - course must exist and belong to the same program.
  const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, isDeleted: false } });
  if (!course) throw httpError(400, 'Course does not exist.');
  if (course.programId && course.programId !== scheme.programId) throw httpError(400, 'Course belongs to a different program.');
  // Duplicate guard - unique(schemeId, courseId).
  const existing = await prisma.schemeCourse.findFirst({ where: { schemeId, courseId } });
  if (existing) throw httpError(409, 'Course already assigned in this scheme.');

  const count = await prisma.schemeCourse.count({ where: { schemeId, semester } });
  const item = await prisma.schemeCourse.create({ data: { schemeId, courseId, semester, orderIndex: count } });
  await recordVersion(schemeId, req.lmsUser.id, `Added ${course.code} to Semester ${semester}`);
  await audit(req, 'SCHEME_ITEM_ADD', 'SchemeCourse', item.id, { after: { schemeId, courseId, semester } });
  res.status(201).json({ item });
}));

// Move a course to a different semester / position (drag between columns).
router.put('/schemes/:id/items/:itemId/move', COORD, validate([
  body('semester').notEmpty(),
]), asyncHandler(async (req, res) => {
  const schemeId = parseInt(req.params.id, 10);
  const itemId = parseInt(req.params.itemId, 10);
  const semester = parseInt(req.body.semester, 10);
  const orderIndex = req.body.orderIndex != null ? parseInt(req.body.orderIndex, 10) : null;

  await loadOwnedScheme(req.lmsUser, schemeId); // §10 own-dept guard
  const item = await prisma.schemeCourse.findUnique({ where: { id: itemId } });
  if (!item || item.schemeId !== schemeId) throw httpError(404, 'Scheme item not found.');

  const before = { semester: item.semester, orderIndex: item.orderIndex };
  let nextOrder = orderIndex;
  if (nextOrder == null) {
    nextOrder = await prisma.schemeCourse.count({ where: { schemeId, semester } });
  }
  const updated = await prisma.schemeCourse.update({ where: { id: itemId }, data: { semester, orderIndex: nextOrder } });
  await recordVersion(schemeId, req.lmsUser.id, `Moved course to Semester ${semester}`);
  await audit(req, 'SCHEME_ITEM_MOVE', 'SchemeCourse', itemId, { before, after: { semester, orderIndex: nextOrder } });
  res.json({ item: updated });
}));

// Reorder courses within a semester (bulk order update).
router.put('/schemes/:id/reorder', COORD, validate([
  body('semester').notEmpty(),
  body('order').isArray(),
]), asyncHandler(async (req, res) => {
  const schemeId = parseInt(req.params.id, 10);
  const semester = parseInt(req.body.semester, 10);
  const order = req.body.order; // array of schemeCourse ids in new order

  await loadOwnedScheme(req.lmsUser, schemeId); // §10 own-dept guard

  await prisma.$transaction(
    order.map((itemId, idx) =>
      prisma.schemeCourse.update({ where: { id: parseInt(itemId, 10) }, data: { orderIndex: idx, semester } })
    )
  );
  await recordVersion(schemeId, req.lmsUser.id, `Reordered Semester ${semester}`);
  await audit(req, 'SCHEME_REORDER', 'SchemeOfStudy', schemeId, { after: { semester, order } });
  res.json({ message: 'Reordered' });
}));

// Remove a course from the scheme (drag back to pool / delete).
router.delete('/schemes/:id/items/:itemId', COORD, asyncHandler(async (req, res) => {
  const schemeId = parseInt(req.params.id, 10);
  const itemId = parseInt(req.params.itemId, 10);
  await loadOwnedScheme(req.lmsUser, schemeId); // §10 own-dept guard
  const item = await prisma.schemeCourse.findUnique({ where: { id: itemId } });
  if (!item || item.schemeId !== schemeId) throw httpError(404, 'Scheme item not found.');
  await prisma.schemeCourse.delete({ where: { id: itemId } });
  await recordVersion(schemeId, req.lmsUser.id, `Removed a course from the scheme`);
  await audit(req, 'SCHEME_ITEM_REMOVE', 'SchemeCourse', itemId, { before: item });
  res.json({ message: 'Removed' });
}));

module.exports = router;

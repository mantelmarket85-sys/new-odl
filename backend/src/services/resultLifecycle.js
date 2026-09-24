// ============================================================
//  Result lifecycle — PIN, lock, submit, compile, declare,
//  finalize, archive. Server-side only. No frontend shortcuts.
// ============================================================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { audit } = require('../utils/lmsAudit');
const { httpError } = require('../utils/lmsHelpers');
const {
  ROUND, buildResultGrades, computeGPA, academicStanding,
  isImmutableStatus, isStudentVisibleStatus, isOfficialStatus,
  slotsFromWeightage, admissionBatchOf, programLevelFromName,
  weightedMarks,
} = require('../utils/academicPolicy');
const { resolveOfferingWeights } = require('../utils/lmsGrading');

const PIN_RE = /^\d{5}$/;
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const GB_TOKEN_TTL = '30m';

function assertPinFormat(pin) {
  if (!PIN_RE.test(String(pin || ''))) throw httpError(400, 'Gradebook PIN must be exactly 5 digits.');
}

async function pinAttemptRow(userId) {
  try {
    return await prisma.gradebookPinAttempt.upsert({
      where: { userId },
      update: {},
      create: { userId, failedCount: 0 },
    });
  } catch {
    return { userId, failedCount: 0, lockedUntil: null };
  }
}

async function recordPinFail(userId) {
  try {
    const row = await pinAttemptRow(userId);
    const failedCount = (row.failedCount || 0) + 1;
    const lockedUntil = failedCount >= PIN_MAX_FAILS ? new Date(Date.now() + PIN_LOCK_MS) : null;
    await prisma.gradebookPinAttempt.update({
      where: { userId },
      data: { failedCount: lockedUntil ? 0 : failedCount, lockedUntil, lastAttemptAt: new Date() },
    });
    if (lockedUntil) throw httpError(429, 'Too many incorrect PIN attempts. Try again in 15 minutes.');
    throw httpError(401, `Incorrect Gradebook PIN. ${PIN_MAX_FAILS - failedCount} attempt(s) remaining.`);
  } catch (e) {
    if (e.statusCode) throw e;
    throw httpError(401, 'Incorrect Gradebook PIN.');
  }
}

async function recordPinSuccess(userId) {
  try {
    await prisma.gradebookPinAttempt.upsert({
      where: { userId },
      update: { failedCount: 0, lockedUntil: null, lastAttemptAt: new Date() },
      create: { userId, failedCount: 0 },
    });
  } catch { /* optional table */ }
}

async function assertNotPinLocked(userId) {
  try {
    const row = await prisma.gradebookPinAttempt.findUnique({ where: { userId } });
    if (row?.lockedUntil && new Date(row.lockedUntil) > new Date()) {
      const mins = Math.ceil((new Date(row.lockedUntil) - Date.now()) / 60000);
      throw httpError(429, `Gradebook PIN is locked. Try again in ${mins} minute(s).`);
    }
  } catch (e) {
    if (e.statusCode) throw e;
  }
}

async function pinStatus(userId) {
  const user = await prisma.lmsUser.findUnique({ where: { id: userId } });
  return { set: !!(user && user.gradebookPinHash) };
}

async function setPin(req, { pin, confirmPin, currentPin }) {
  const user = await prisma.lmsUser.findUnique({ where: { id: req.lmsUser.id } });
  if (!user) throw httpError(404, 'Account not found');
  assertPinFormat(pin);
  if (confirmPin != null && String(confirmPin) !== String(pin)) throw httpError(400, 'PIN confirmation does not match.');
  if (user.gradebookPinHash) {
    if (!currentPin) throw httpError(400, 'Current Gradebook PIN is required to change it.');
    await verifyPin(req.lmsUser.id, currentPin);
  }
  const gradebookPinHash = await bcrypt.hash(String(pin), 12);
  await prisma.lmsUser.update({
    where: { id: user.id },
    data: { gradebookPinHash, gradebookPinSetAt: new Date() },
  });
  await audit(req, user.gradebookPinHash ? 'GRADEBOOK_PIN_CHANGED' : 'GRADEBOOK_PIN_CREATED', 'LmsUser', user.id, {});
  await recordPinSuccess(user.id);
  return { set: true };
}

async function verifyPin(userId, pin) {
  assertPinFormat(pin);
  await assertNotPinLocked(userId);
  const user = await prisma.lmsUser.findUnique({ where: { id: userId } });
  if (!user || !user.gradebookPinHash) throw httpError(400, 'Set a 5-digit Gradebook PIN first.');
  const ok = await bcrypt.compare(String(pin), user.gradebookPinHash);
  if (!ok) await recordPinFail(userId);
  await recordPinSuccess(userId);
  return true;
}

function issueGradebookToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw httpError(500, 'Server JWT secret is not configured.');
  return jwt.sign(
    { system: 'lms', kind: 'gradebook', userId: user.id, role: user.role },
    secret,
    { expiresIn: GB_TOKEN_TTL }
  );
}

function verifyGradebookToken(token) {
  if (!token) throw httpError(403, 'Gradebook PIN verification required.');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.system !== 'lms' || decoded.kind !== 'gradebook') throw new Error('bad');
    return decoded;
  } catch {
    throw httpError(403, 'Gradebook session expired. Enter your PIN again.');
  }
}

function requireGradebook(req) {
  const token = req.headers['x-gradebook-token'] || req.body?.gradebookToken;
  const decoded = verifyGradebookToken(token);
  if (decoded.userId !== req.lmsUser.id) throw httpError(403, 'Gradebook session does not match this account.');
  return decoded;
}

function assertMutableResult(result, label = 'result') {
  if (result && isImmutableStatus(result.status)) {
    throw httpError(409, `This ${label} is ${result.status} and cannot be modified by any role.`);
  }
}

async function assertOfferingMutable(offeringId) {
  const locked = await prisma.courseResult.findFirst({
    where: { offeringId, status: { in: [...require('../utils/academicPolicy').IMMUTABLE_STATES] } },
    select: { status: true },
  });
  if (locked) throw httpError(409, `Results for this course are ${locked.status} and cannot be edited.`);
}

async function loadWeightage(offering) {
  const { weights, components, source } = await resolveOfferingWeights(prisma, offering);
  let cw = null;
  try {
    if (offering.courseId) cw = await prisma.courseWeightage.findUnique({ where: { courseId: offering.courseId } });
  } catch { cw = null; }
  const slots = slotsFromWeightage(cw, offering);
  return { weights, components, source, cw, slots };
}

async function offeringReview(offering) {
  const { weights, slots, cw } = await loadWeightage(offering);
  const offeringId = offering.id;
  const [regs, assignments, quizzes, labTasks, results] = await Promise.all([
    prisma.courseRegistration.findMany({
      where: { offeringId, status: { in: ['ENROLLED', 'COMPLETED'] } },
      include: { student: { include: { profile: true } } },
    }),
    prisma.assignment2.findMany({ where: { offeringId, isDeleted: false }, orderBy: { id: 'asc' } }),
    prisma.quiz.findMany({ where: { offeringId, isDeleted: false }, orderBy: { id: 'asc' } }),
    prisma.labTask.findMany({ where: { offeringId, isDeleted: false }, orderBy: { id: 'asc' } }),
    prisma.courseResult.findMany({ where: { offeringId } }),
  ]);
  const resultMap = {};
  for (const r of results) resultMap[r.studentId] = r;

  const expected = {
    assignment: slots.counts.assignment,
    quiz: slots.counts.quiz,
    lab: slots.counts.lab,
    project: slots.counts.project,
    mid: slots.counts.mid,
    final: slots.counts.final,
  };
  const created = {
    assignment: assignments.length,
    quiz: quizzes.length,
    lab: labTasks.length,
    project: expected.project,
    mid: expected.mid,
    final: expected.final,
  };

  const missingAssessments = [];
  for (const k of Object.keys(expected)) {
    if (created[k] < expected[k]) missingAssessments.push({ kind: k, expected: expected[k], created: created[k] });
  }

  const students = [];
  let complete = 0;
  for (const reg of regs) {
    const r = resultMap[reg.studentId];
    const grades = r ? buildResultGrades(r, weights) : null;
    const incomplete = !r || r.status === 'DRAFT' && missingComponent(r, slots);
    if (!incomplete && r) complete += 1;
    students.push({
      studentId: reg.studentId,
      name: reg.student?.profile?.fullName || reg.student?.username,
      rollNumber: reg.student?.linkedRollNumber || reg.student?.username,
      totalPercent: grades ? grades.totalPercent : null,
      letterGrade: grades ? grades.letterGrade : null,
      gradePoints: grades ? grades.gradePoints : null,
      status: r?.status || 'MISSING',
      incomplete,
    });
  }

  const anyLocked = results.some((r) => isImmutableStatus(r.status));
  const allSubmitted = results.length > 0 && results.every((r) => isImmutableStatus(r.status));
  const weightOk = Math.abs(slots.totalWeight - 100) < 0.51;
  const ready = !anyLocked && missingAssessments.length === 0 && students.length > 0
    && students.every((s) => !s.incomplete) && weightOk;

  return {
    offeringId,
    courseCode: offering.course?.code,
    courseTitle: offering.course?.title,
    creditHours: offering.course?.creditHours,
    totalStudents: students.length,
    completeStudents: complete,
    missingStudents: students.filter((s) => s.incomplete).length,
    expectedAssessments: expected,
    createdAssessments: created,
    missingAssessments,
    totalWeight: slots.totalWeight,
    weightOk,
    ready,
    locked: anyLocked,
    submitted: allSubmitted,
    status: allSubmitted ? (results[0]?.status || 'SUBMITTED') : 'DRAFT',
    students,
    slots: slots.slots,
    weights,
    source: cw ? 'coordinator' : 'offering',
  };
}

function missingComponent(r, slots) {
  if (!r) return true;
  const need = (field, maxField, count) => {
    if (!count) return false;
    const v = r[field];
    return v == null;
  };
  // Mid/final/project: pending if never entered and still draft zeros without lock
  if (slots.counts.mid && (r.midMarks == null)) return true;
  if (slots.counts.final && (r.finalMarks == null)) return true;
  return false;
}

async function submitOffering(req, offering, pin) {
  await verifyPin(req.lmsUser.id, pin);
  const review = await offeringReview(offering);
  if (review.locked) throw httpError(409, 'This course result is already submitted and locked.');
  if (!review.weightOk) throw httpError(400, `Assessment weightage totals ${review.totalWeight}% — it must equal 100% before submission.`);
  if (review.missingAssessments.length) {
    throw httpError(400, `Create all coordinator-configured assessments first (${review.missingAssessments.map((m) => `${m.kind} ${m.created}/${m.expected}`).join(', ')}).`);
  }
  if (review.missingStudents > 0) {
    throw httpError(400, `${review.missingStudents} student(s) still have incomplete marks. Submission of an incomplete course is not allowed.`);
  }
  if (!review.totalStudents) throw httpError(400, 'No enrolled students to submit.');

  const { weights } = await loadWeightage(offering);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const rows = await tx.courseResult.findMany({ where: { offeringId: offering.id } });
    for (const r of rows) {
      if (isImmutableStatus(r.status)) throw httpError(409, 'A result in this course is already locked.');
      const grades = buildResultGrades(r, weights);
      await tx.courseResult.update({
        where: { id: r.id },
        data: {
          ...grades,
          status: 'SUBMITTED',
          submittedAt: now,
          submittedById: req.lmsUser.id,
          lockedAt: now,
          version: (r.version || 1) + 1,
        },
      });
    }
    await tx.courseRegistration.updateMany({
      where: { offeringId: offering.id, status: 'ENROLLED' },
      data: { status: 'COMPLETED' },
    });
  });
  await audit(req, 'RESULT_SUBMITTED', 'CourseOffering', offering.id, {
    after: { offeringId: offering.id, students: review.totalStudents, lockedAt: now },
  });
  return { status: 'SUBMITTED', locked: true, students: review.totalStudents };
}

function scopeFilter(o, { department, program, semester, batch }) {
  const dept = o.course?.program?.department;
  const prog = o.course?.program?.shortForm || o.course?.program?.code;
  const sem = o.course?.semester ? String(o.course.semester.number) : null;
  if (department && dept !== department) return false;
  if (program && prog !== program) return false;
  if (semester && String(sem) !== String(semester)) return false;
  void batch;
  return true;
}

const CONTROLLER_VISIBLE = ['SUBMITTED', 'LOCKED', 'COMPILED', 'UNOFFICIAL_DECLARED', 'OFFICIAL_FINALIZED', 'ARCHIVED', 'FINALIZED', 'PUBLISHED'];

async function hierarchy() {
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false },
    include: {
      course: { include: { program: true, semester: true } },
      term: true,
      results: { select: { status: true, studentId: true } },
    },
  });
  const submitted = offerings.filter((o) => (o.results || []).some((r) => CONTROLLER_VISIBLE.includes(r.status)));
  const tree = {};
  for (const o of submitted) {
    const dept = o.course?.program?.department || 'Unknown Department';
    const progName = o.course?.program?.name || 'Unknown Program';
    const progCode = o.course?.program?.shortForm || o.course?.program?.code || 'NA';
    const sem = o.course?.semester ? Number(o.course.semester.number) : 0;
    if (!tree[dept]) tree[dept] = { department: dept, programs: {} };
    if (!tree[dept].programs[progCode]) {
      tree[dept].programs[progCode] = { program: progName, programShortForm: progCode, programId: o.course?.programId, semesters: {} };
    }
    if (!tree[dept].programs[progCode].semesters[sem]) {
      tree[dept].programs[progCode].semesters[sem] = { semester: sem, courses: 0, submittedCourses: 0 };
    }
    tree[dept].programs[progCode].semesters[sem].courses += 1;
    tree[dept].programs[progCode].semesters[sem].submittedCourses += 1;
  }
  return {
    departments: Object.values(tree).map((d) => ({
      department: d.department,
      programs: Object.values(d.programs).map((p) => ({
        ...p,
        semesters: Object.values(p.semesters).sort((a, b) => a.semester - b.semester),
      })),
    })),
  };
}

async function semesterMatrix({ department, program, semester }) {
  if (!department || !program || semester == null) throw httpError(400, 'Department, program and semester are required.');
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false },
    include: {
      course: { include: { program: true, semester: true } },
      term: true,
      results: { include: { student: { include: { profile: true } } } },
    },
  });
  const scoped = offerings.filter((o) => scopeFilter(o, { department, program, semester })
    && (o.results || []).some((r) => CONTROLLER_VISIBLE.includes(r.status)));
  const courses = scoped.map((o) => ({
    offeringId: o.id,
    courseCode: o.course?.code,
    courseTitle: o.course?.title,
    creditHours: o.course?.creditHours || 3,
    status: (o.results || [])[0]?.status || 'SUBMITTED',
  }));
  const byStudent = {};
  for (const o of scoped) {
    for (const r of o.results || []) {
      if (!CONTROLLER_VISIBLE.includes(r.status)) continue;
      const sid = r.studentId;
      if (!byStudent[sid]) {
        const p = r.student?.profile;
        byStudent[sid] = {
          studentId: sid,
          name: p?.fullName || r.student?.username,
          rollNumber: r.student?.linkedRollNumber || p?.rollNumber,
          registrationNumber: p?.registrationNumber,
          admissionBatch: admissionBatchOf(p),
          currentSession: p?.currentSession || o.term?.title,
          program: p?.program,
          department: p?.department,
          courses: {},
        };
      }
      byStudent[sid].courses[o.id] = {
        offeringId: o.id,
        courseCode: o.course?.code,
        creditHours: o.course?.creditHours || 3,
        totalPercent: r.totalPercent,
        letterGrade: r.letterGrade,
        gradePoints: r.gradePoints,
        status: r.status,
      };
    }
  }
  const students = Object.values(byStudent).map((s) => {
    const rows = Object.values(s.courses).map((c) => ({
      gradePoints: c.gradePoints,
      creditHours: c.creditHours,
      letterGrade: c.letterGrade,
    }));
    const gpa = computeGPA(rows);
    const totalCredits = rows.reduce((a, c) => a + (Number(c.creditHours) || 0), 0);
    return { ...s, gpa, totalCredits, courseCount: rows.length };
  });
  return { department, program, semester: Number(semester), courses, students };
}

async function compileScope(req, { department, program, semester }) {
  const matrix = await semesterMatrix({ department, program, semester });
  if (!matrix.courses.length) throw httpError(400, 'No submitted course results in this scope.');
  const now = new Date();
  const offeringIds = matrix.courses.map((c) => c.offeringId);
  await prisma.$transaction(async (tx) => {
    await tx.courseResult.updateMany({
      where: { offeringId: { in: offeringIds }, status: { in: ['SUBMITTED', 'LOCKED'] } },
      data: { status: 'COMPILED', compiledAt: now },
    });
    for (const s of matrix.students) {
      const prior = await tx.courseResult.findMany({
        where: { studentId: s.studentId, status: { in: CONTROLLER_VISIBLE } },
        include: { offering: { include: { course: { include: { semester: true } } } } },
      });
      const allRows = prior.map((r) => ({
        gradePoints: r.gradePoints,
        creditHours: r.offering?.course?.creditHours || 3,
        letterGrade: r.letterGrade,
        semesterNumber: r.offering?.course?.semester?.number,
      }));
      const semRows = allRows.filter((r) => String(r.semesterNumber) === String(semester));
      const gpa = computeGPA(semRows);
      const cgpa = computeGPA(allRows);
      const totalCredits = allRows.reduce((a, r) => a + (Number(r.creditHours) || 0), 0);
      const earnedCredits = allRows.filter((r) => String(r.letterGrade).toUpperCase() !== 'F' && r.letterGrade !== 'W' && r.letterGrade !== 'I')
        .reduce((a, r) => a + (Number(r.creditHours) || 0), 0);
      const level = programLevelFromName(s.program);
      const standing = academicStanding({ gpa, cgpa, semesterNumber: Number(semester), programLevel: level });
      const key = { studentId: s.studentId, semesterNumber: Number(semester), programShortForm: program };
      const existing = await tx.semesterResult.findUnique({
        where: { studentId_semesterNumber_programShortForm: key },
      }).catch(() => null);
      const data = {
        studentId: s.studentId,
        programShortForm: program,
        department,
        admissionBatch: s.admissionBatch,
        semesterNumber: Number(semester),
        sessionLabel: s.currentSession,
        gpa, cgpa, totalCredits, earnedCredits,
        academicStanding: standing.status,
        status: 'COMPILED',
        compiledAt: now,
      };
      if (existing) {
        if (isOfficialStatus(existing.status) || existing.status === 'ARCHIVED') {
          throw httpError(409, 'Official/archived semester results cannot be recompiled.');
        }
        await tx.semesterResult.update({ where: { id: existing.id }, data });
      } else {
        await tx.semesterResult.create({ data });
      }
    }
  });
  await audit(req, 'RESULT_COMPILED', 'SemesterResult', `${program}-S${semester}`, { after: { department, program, semester, students: matrix.students.length } });
  return { compiled: true, students: matrix.students.length, courses: matrix.courses.length };
}

async function declareUnofficial(req, scope) {
  const matrix = await semesterMatrix(scope);
  const offeringIds = matrix.courses.map((c) => c.offeringId);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.courseResult.updateMany({
      where: { offeringId: { in: offeringIds }, status: { in: ['SUBMITTED', 'LOCKED', 'COMPILED'] } },
      data: { status: 'UNOFFICIAL_DECLARED', publishedAt: now },
    });
    await tx.semesterResult.updateMany({
      where: {
        programShortForm: scope.program,
        semesterNumber: Number(scope.semester),
        department: scope.department,
        status: { in: ['COMPILED'] },
      },
      data: { status: 'UNOFFICIAL_DECLARED', unofficialDeclaredAt: now, unofficialDeclaredById: req.lmsUser.id },
    });
  });
  const studentIds = matrix.students.map((s) => s.studentId);
  try {
    const { notifyMany } = require('../utils/lmsNotify');
    await notifyMany(studentIds, {
      title: 'Unofficial result declared',
      message: 'Your unofficial transcript is now available.',
      type: 'SUCCESS',
      link: '/student/results',
    });
  } catch { /* optional */ }
  await audit(req, 'UNOFFICIAL_RESULT_DECLARED', 'SemesterResult', `${scope.program}-S${scope.semester}`, {
    after: { ...scope, students: studentIds.length },
  });
  return { declared: true, status: 'UNOFFICIAL_DECLARED', students: studentIds.length };
}

async function finalizeOfficial(req, scope) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const srs = await tx.semesterResult.findMany({
      where: {
        programShortForm: scope.program,
        semesterNumber: Number(scope.semester),
        department: scope.department,
        status: 'UNOFFICIAL_DECLARED',
      },
    });
    if (!srs.length) throw httpError(409, 'Declare the unofficial result before official finalization.');
    await tx.semesterResult.updateMany({
      where: { id: { in: srs.map((s) => s.id) } },
      data: { status: 'OFFICIAL_FINALIZED', officialFinalizedAt: now },
    });
  });
  await audit(req, 'RESULT_FINALIZED', 'SemesterResult', `${scope.program}-S${scope.semester}`, { after: scope });
  return { finalized: true, status: 'OFFICIAL_FINALIZED' };
}

async function declareOfficial(req, scope) {
  const matrix = await semesterMatrix(scope);
  const offeringIds = matrix.courses.map((c) => c.offeringId);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const srs = await tx.semesterResult.findMany({
      where: {
        programShortForm: scope.program,
        semesterNumber: Number(scope.semester),
        department: scope.department,
        status: { in: ['UNOFFICIAL_DECLARED', 'OFFICIAL_FINALIZED'] },
      },
    });
    if (!srs.length) throw httpError(409, 'Finalize the unofficial result before official declaration.');
    await tx.semesterResult.updateMany({
      where: { id: { in: srs.map((s) => s.id) } },
      data: {
        status: 'ARCHIVED',
        officialDeclaredAt: now,
        officialDeclaredById: req.lmsUser.id,
        archivedAt: now,
      },
    });
    await tx.courseResult.updateMany({
      where: { offeringId: { in: offeringIds }, status: { in: ['UNOFFICIAL_DECLARED', 'OFFICIAL_FINALIZED', 'COMPILED'] } },
      data: { status: 'ARCHIVED' },
    });
  });
  await audit(req, 'OFFICIAL_RESULT_DECLARED', 'SemesterResult', `${scope.program}-S${scope.semester}`, { after: scope });
  await audit(req, 'RESULT_ARCHIVED', 'SemesterResult', `${scope.program}-S${scope.semester}`, { after: scope });
  return { declared: true, archived: true, status: 'ARCHIVED', students: matrix.students.length };
}

async function visibleTranscript(studentId) {
  const profile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: studentId } });
  const results = await prisma.courseResult.findMany({
    where: { studentId, status: { in: [...require('../utils/academicPolicy').STUDENT_VISIBLE_STATES] } },
    include: { offering: { include: { course: { include: { semester: true, program: true } }, term: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const semMap = {};
  try {
    const srs = await prisma.semesterResult.findMany({ where: { studentId } });
    for (const s of srs) semMap[`${s.programShortForm || ''}:${s.semesterNumber}`] = s;
  } catch { /* table may not exist yet */ }

  const terms = {};
  const rows = [];
  for (const r of results) {
    const course = r.offering?.course;
    const term = r.offering?.term;
    const semNo = course?.semester?.number;
    const prog = course?.program?.shortForm || profile?.programShortForm;
    const sr = semMap[`${prog || ''}:${semNo}`];
    const publication = sr?.status || r.status;
    if (!isStudentVisibleStatus(publication) && !isStudentVisibleStatus(r.status)) continue;
    const ch = course?.creditHours || 3;
    const row = {
      resultId: r.id,
      courseCode: course?.code || '—',
      courseTitle: course?.title || '—',
      creditHours: ch,
      termCode: term?.code || `SEM-${semNo || 'NA'}`,
      termTitle: course?.semester?.title || term?.title || `Semester ${semNo || ''}`,
      semesterNumber: semNo,
      totalPercent: r.totalPercent,
      letterGrade: r.letterGrade,
      gradePoints: r.gradePoints,
      publicationStatus: publication,
      official: isOfficialStatus(publication) || publication === 'ARCHIVED',
    };
    rows.push(row);
    const key = String(semNo || term?.code || 'NA');
    if (!terms[key]) {
      terms[key] = {
        termCode: row.termCode,
        termTitle: row.termTitle,
        semesterNumber: semNo,
        publicationStatus: publication,
        official: row.official,
        gpa: sr?.gpa ?? null,
        cgpa: sr?.cgpa ?? null,
        rows: [],
      };
    }
    terms[key].rows.push(row);
  }
  const termSummaries = Object.values(terms).map((t) => ({
    ...t,
    gpa: t.gpa != null ? t.gpa : computeGPA(t.rows),
    totalCredits: t.rows.reduce((s, x) => s + (x.creditHours || 0), 0),
  }));
  termSummaries.sort((a, b) => (a.semesterNumber || 0) - (b.semesterNumber || 0));
  const cgpa = computeGPA(rows);
  const totalCredits = rows.reduce((s, x) => s + (x.creditHours || 0), 0);
  return {
    cgpa,
    totalCredits,
    terms: termSummaries,
    rows,
    admissionBatch: admissionBatchOf(profile),
    currentSession: profile?.currentSession || profile?.session,
    currentSemester: profile?.currentSemester,
    program: profile?.program,
    department: profile?.department,
    studentName: profile?.fullName,
    rollNumber: profile?.rollNumber,
    registrationNumber: profile?.registrationNumber,
  };
}

module.exports = {
  pinStatus,
  setPin,
  verifyPin,
  issueGradebookToken,
  verifyGradebookToken,
  requireGradebook,
  assertMutableResult,
  assertOfferingMutable,
  loadWeightage,
  offeringReview,
  submitOffering,
  hierarchy,
  semesterMatrix,
  compileScope,
  declareUnofficial,
  finalizeOfficial,
  declareOfficial,
  visibleTranscript,
  weightedMarks,
  CONTROLLER_VISIBLE,
};

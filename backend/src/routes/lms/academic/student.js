// ============================================================
//  STUDENT MODULE ROUTES  — /api/lms/academic/student/*
//  ------------------------------------------------------------
//  All endpoints require an authenticated LmsUser with role Student.
//
//  Covers: Course Registration, Attendance (view), Assignments
//  (view + submit), Quiz Attempts, Results, Gradebook, Transcript.
//  Everything is scoped to req.lmsUser.id (the student).
// ============================================================
const express = require('express');
const { body } = require('express-validator');
const prisma = require('../../../utils/prisma');
const { lmsAuth, lmsRequireRole } = require('../../../middleware/lmsAuth');
const { validate } = require('../../../middleware/validate');
const { asyncHandler, httpError, safeJson } = require('../../../utils/lmsHelpers');
const { audit } = require('../../../utils/lmsAudit');
const { notify, notifyMany } = require('../../../utils/lmsNotify');
const realtime = require('../../../utils/lmsRealtime');
const appealRouting = require('../../../utils/lmsAppealRouting');
const courseGroups = require('../../../utils/lmsCourseGroups');
const { creditLabel } = require('../../../utils/lmsCredit');
const academic = require('../../../services/academicService');
const { uploadLmsSubmission, uploadPhoto, uploadLmsMessage } = require('../../../middleware/upload');
const { buildLiveStudentProfile } = require('../../../services/admissionsSync');
const { computeMissingDocs } = require('../../../utils/lmsProvision');
const bbb = require('../../../utils/bbb');
const aiTutor = require('../../../utils/aiGenerate');
const { logActivity } = require('../../../utils/activityLog');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');

const router = express.Router();

// Strong-password policy (matches the LMS auth policy in lmsAuthV2.js):
// min 8 chars, ≥1 uppercase, ≥1 number, ≥1 special character.
const STRONG_PW = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// Point 6 — recorded-lecture auto-attendance threshold (% of a lecture that
// must be watched). Configurable via env, not hard-coded as institutional
// policy; defaults to 70%.
const WATCH_ATTENDANCE_THRESHOLD = Number(process.env.LMS_WATCH_ATTENDANCE_THRESHOLD) || 70;

// ============================================================
// STUDENT DEPARTMENT SCOPE (Requirement #2.2)
// ------------------------------------------------------------
// A student must ONLY ever see information related to their OWN
// department. This resolves the set of LmsProgram IDs (and their
// LmsCourse IDs) that belong to the student's own program/department
// from their LmsStudentProfile. Every "catalog"-style endpoint that
// could otherwise surface other departments' offerings (e.g. course
// registration) is filtered through this scope.
//
// Resolution (never leaks another department):
//   1. Match the student's own LmsProgram by shortForm/name/code from
//      their profile → that program's department.
//   2. Include ALL LmsPrograms sharing that department (a department may
//      run several programs; a student sees their whole department).
//   3. Secure default: if the student's program/department cannot be
//      resolved, restrict to their own program only (or nothing) — we
//      never widen to all departments.
//
// Cached on the request object so repeated calls in one request are cheap.
async function resolveStudentDeptScope(req) {
  if (req._studentDeptScope) return req._studentDeptScope;
  const studentId = req.lmsUser.id;
  const profile = await prisma.lmsStudentProfile
    .findUnique({ where: { lmsUserId: studentId }, select: { program: true, programShortForm: true, department: true } })
    .catch(() => null);

  const programIds = new Set();
  let department = profile && profile.department ? String(profile.department).trim() : '';

  // 1. Resolve the student's own program (by shortForm / name).
  let ownProgram = null;
  if (profile) {
    ownProgram = await prisma.lmsProgram.findFirst({
      where: {
        isDeleted: false,
        OR: [
          { shortForm: profile.programShortForm || '___none___' },
          { name: profile.program || '___none___' },
        ],
      },
      select: { id: true, department: true },
    }).catch(() => null);
    if (ownProgram) {
      programIds.add(ownProgram.id);
      if (!department && ownProgram.department) department = String(ownProgram.department).trim();
    }
  }

  // 2. Include every program in the same department.
  if (department) {
    const deptTarget = department.toLowerCase();
    const sameDept = await prisma.lmsProgram.findMany({
      where: { isDeleted: false },
      select: { id: true, department: true },
    }).catch(() => []);
    sameDept.forEach((p) => {
      if (String(p.department || '').trim().toLowerCase() === deptTarget) programIds.add(p.id);
    });
  }

  const programIdList = [...programIds];
  // Course IDs under those programs (secure default sentinel if none).
  let courseIds = [];
  if (programIdList.length) {
    const courses = await prisma.lmsCourse.findMany({
      where: { isDeleted: false, programId: { in: programIdList } },
      select: { id: true },
    }).catch(() => []);
    courseIds = courses.map((c) => c.id);
  }

  const scope = {
    department: department || null,
    programIds: programIdList,
    // Empty sentinels so an unresolved student sees NOTHING (never all depts).
    courseIds: courseIds.length ? courseIds : [-1],
  };
  req._studentDeptScope = scope;
  return scope;
}

// ============================================================
// ADMISSION-TIME FEE HISTORY (Requirement #2.3 — read-only)
// ------------------------------------------------------------
// Resolve the admission-time fees the student already paid during the
// admissions process, so the LMS Account Book shows the COMPLETE fee
// picture (application processing fee + admission/enrollment fee).
//
// STRICTLY READ-ONLY: reads admissions tables (Enrollment → User →
// Application / FeePayment / AdmissionCycle) through the existing
// Enrollment.lmsUserId link. It NEVER writes to the Admission System.
//
// Returns an array of synthetic challan-shaped entries (always PAID,
// non-payable) that render seamlessly alongside LMS challans.
async function resolveAdmissionFeeEntries(lmsUserId) {
  const entries = [];
  // Link LMS student → admissions Enrollment → admissions User.
  const enrollment = await prisma.enrollment.findFirst({ where: { lmsUserId } }).catch(() => null);
  if (!enrollment || !enrollment.userId) return entries;

  // Latest application for this admissions user (carries the processing-fee
  // flags and the linked FeePayment for the admission fee).
  const application = await prisma.application.findFirst({
    where: { userId: enrollment.userId },
    orderBy: { submittedAt: 'desc' },
    include: { feePayment: true, admissionCycle: true },
  }).catch(() => null);
  if (!application) return entries;

  // 1. Application processing fee (paid at application time).
  if (application.procFeePaid) {
    const amount = application.admissionCycle ? Number(application.admissionCycle.applicationProcessingFee || 0) : 0;
    entries.push({
      id: `adm-proc-${application.id}`,
      challanNo: application.procFeeTxnId || `APP-${application.id}`,
      title: 'Application Processing Fee (Admission)',
      lineItems: [{ label: 'Application processing fee', amount }],
      totalAmount: amount,
      dueDate: null,
      status: 'PAID',
      paidAt: application.procFeePaidAt || null,
      paymentRef: application.procFeeTxnId || null,
      createdAt: application.submittedAt || null,
      source: 'admission',
      readOnly: true,
    });
  }

  // 2. Admission / enrollment fee (the FeePayment approved during admissions).
  const fp = application.feePayment;
  if (fp && (String(fp.status || '').toUpperCase() === 'APPROVED' || String(fp.status || '').toUpperCase() === 'PAID' || fp.paidAt)) {
    const amount = Number(fp.amount || 0);
    entries.push({
      id: `adm-fee-${fp.id}`,
      challanNo: fp.txnId || `ADM-${fp.id}`,
      title: 'Admission Fee',
      lineItems: [{ label: 'Admission / enrollment fee', amount }],
      totalAmount: amount,
      dueDate: null,
      status: 'PAID',
      paidAt: fp.paidAt || null,
      paymentRef: fp.txnId || null,
      createdAt: fp.createdAt || null,
      source: 'admission',
      readOnly: true,
    });
  }

  return entries;
}

// ============================================================
// REAL-TIME EVENT STREAM (SSE) — GET /student/events?token=<jwt>
// Registered BEFORE the auth middleware (EventSource cannot send
// Authorization headers). Powers live messaging, presence, etc.
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
router.use(lmsRequireRole('Student'));

// --- helper: ensure the student is registered (ENROLLED/COMPLETED) in offering ---
async function requireRegistered(studentId, offeringId) {
  const reg = await prisma.courseRegistration.findUnique({
    where: { offeringId_studentId: { offeringId, studentId } },
  });
  if (!reg || !['ENROLLED', 'COMPLETED'].includes(reg.status)) {
    throw httpError(403, 'You are not registered in this course');
  }
  return reg;
}

// ============================================================
// DASHBOARD
// ============================================================
router.get('/dashboard', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  // Req 3.5 — auto-enroll into 1st-semester Scheme of Study courses (idempotent).
  try { await autoEnrollFirstSemester(studentId, req); } catch (_) { /* non-fatal */ }
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId, status: { in: ['ENROLLED', 'COMPLETED'] } },
    include: {
      offering: {
        include: {
          // Pull the course with its semester so the card can show the real
          // semester number (Requirement #1 — Professional Course Card).
          course: { include: { semester: true } },
          term: true,
          // Teachers are LmsUsers backed by an LmsStudentProfile row (the
          // shared profile store). Use the teacher's REAL full name +
          // designation from that profile instead of the raw username.
          teacher: { include: { profile: true } },
        },
      },
      // The student's assigned section (e.g. "A") for this offering.
      section: true,
    },
  });
  const offeringIds = regs.map((r) => r.offeringId);

  const [pendingAssignments, upcomingQuizzes, publishedResults] = await Promise.all([
    prisma.assignment2.count({
      where: {
        offeringId: { in: offeringIds }, isPublished: true, isDeleted: false,
        submissions: { none: { studentId } },
      },
    }),
    prisma.quiz.count({
      where: { offeringId: { in: offeringIds }, isPublished: true, isDeleted: false, attempts: { none: { studentId } } },
    }),
    prisma.courseResult.count({ where: { studentId, status: 'PUBLISHED' } }),
  ]);

  // Attendance overall
  let attendedSum = 0; let markedSum = 0;
  for (const r of regs) {
    // eslint-disable-next-line no-await-in-loop
    const s = await academic.attendanceSummary(r.offeringId, studentId);
    attendedSum += s.attended; markedSum += s.marked;
  }
  const overallAttendance = markedSum > 0 ? Math.round((attendedSum / markedSum) * 10000) / 100 : 0;

  const transcript = await academic.studentTranscript(studentId);

  // --- per-course progress + next live class (real-time) ---
  const now = new Date();
  const liveWindowEnd = (lc) => new Date(new Date(lc.scheduledAt).getTime() + (lc.durationMin || 60) * 60000);

  // Real teacher display name + designation. The teacher's full name lives in
  // their LmsStudentProfile (the shared profile store used for staff too). We
  // prefer that real name and only fall back to the username when no profile
  // exists. (Requirement #1 — replace "Teacher 1/2" placeholders.)
  const teacherInfo = (t) => {
    if (!t) return { name: 'TBA', designation: null, photoUrl: null };
    const fullName = t.profile && t.profile.fullName ? t.profile.fullName.trim() : '';
    return {
      name: fullName || t.username || 'TBA',
      designation: (t.profile && t.profile.designation) || null,
      // Real instructor photo (from the teacher's LmsStudentProfile snapshot).
      // Surfaced so the dashboard course card shows the teacher's live avatar
      // and updates in real time when the teacher changes their photo.
      photoUrl: (t.profile && t.profile.photoUrl) || null,
    };
  };

  const courseCards = await Promise.all(regs.map(async (r) => {
    const offeringId = r.offeringId;

    // Assessment completion (real published items vs. student's submissions/attempts)
    const [totalAssignments, doneAssignments, totalQuizzes, doneQuizzes, attSummary] = await Promise.all([
      prisma.assignment2.count({ where: { offeringId, isPublished: true, isDeleted: false } }),
      prisma.assignment2.count({ where: { offeringId, isPublished: true, isDeleted: false, submissions: { some: { studentId } } } }),
      prisma.quiz.count({ where: { offeringId, isPublished: true, isDeleted: false } }),
      prisma.quiz.count({ where: { offeringId, isPublished: true, isDeleted: false, attempts: { some: { studentId } } } }),
      academic.attendanceSummary(offeringId, studentId),
    ]);

    const totalItems = totalAssignments + totalQuizzes;
    const doneItems = doneAssignments + doneQuizzes;
    const assessmentPct = totalItems > 0 ? (doneItems / totalItems) : null;
    const attPct = attSummary.marked > 0 ? (attSummary.attended / attSummary.marked) : null;

    // Blend assessment completion with attendance when both available; otherwise use whichever exists.
    let progress = 0;
    if (assessmentPct !== null && attPct !== null) progress = Math.round((assessmentPct * 0.7 + attPct * 0.3) * 100);
    else if (assessmentPct !== null) progress = Math.round(assessmentPct * 100);
    else if (attPct !== null) progress = Math.round(attPct * 100);
    if (r.status === 'COMPLETED') progress = 100;

    // Live classes for this offering
    const liveClasses = await prisma.liveClass.findMany({
      where: { offeringId, isDeleted: false, status: { not: 'CANCELLED' } },
      orderBy: { scheduledAt: 'asc' },
    });

    // currently live: explicit LIVE status OR within scheduled window
    const liveNowClass = liveClasses.find((lc) => {
      const status = (lc.status || '').toUpperCase();
      if (status === 'LIVE') return true;
      const start = new Date(lc.scheduledAt);
      return status !== 'ENDED' && start <= now && now <= liveWindowEnd(lc);
    });

    // next upcoming class (scheduled in the future, not ended)
    const nextClass = liveClasses.find((lc) => {
      const status = (lc.status || '').toUpperCase();
      return status !== 'ENDED' && new Date(lc.scheduledAt) > now;
    });

    const liveRef = liveNowClass || nextClass;

    const ti = teacherInfo(r.offering.teacher);

    // Semester label — real semester from the course's LmsSemester (number or
    // title). Falls back to null so the UI can hide it gracefully.
    const sem = r.offering.course.semester;
    const semesterLabel = sem
      ? (sem.title || (sem.number != null ? `Semester ${sem.number}` : null))
      : null;

    return {
      registrationId: r.id,
      offeringId,
      courseCode: r.offering.course.code,
      courseTitle: r.offering.course.title,
      creditHours: r.offering.course.creditHours ?? null,
      // Req 3.1 — expose lab flag + lab credit so the dashboard can render a
      // separate, distinct lab card for every lab-bearing course.
      hasLab: r.offering.course.hasLab === true,
      labCredit: r.offering.course.labCredit != null ? r.offering.course.labCredit : null,
      theoryCredit: r.offering.course.theoryCredit != null ? r.offering.course.theoryCredit : (r.offering.course.creditHours ?? null),
      term: r.offering.term.title,
      semester: semesterLabel,
      semesterNumber: sem ? sem.number ?? null : null,
      section: r.section ? r.section.name : null,
      teacher: ti.name,
      teacherDesignation: ti.designation,
      teacherPhotoUrl: ti.photoUrl,
      status: r.status,
      registrationType: r.registrationType,
      progress,
      // Lecture counts drive the "Completed / Remaining lectures" UI on the card.
      completedLectures: doneItems,
      totalLectures: totalItems,
      remainingLectures: Math.max(0, totalItems - doneItems),
      assessmentsDone: doneItems,
      assessmentsTotal: totalItems,
      attendancePct: attPct !== null ? Math.round(attPct * 10000) / 100 : null,
      liveNow: !!liveNowClass,
      liveClass: liveRef
        ? {
            id: liveRef.id,
            title: liveRef.title,
            scheduledAt: liveRef.scheduledAt,
            durationMin: liveRef.durationMin,
            status: liveNowClass ? 'LIVE' : (liveRef.status || 'SCHEDULED'),
          }
        : null,
    };
  }));

  // Current semester label from the active term (real, not hardcoded).
  const currentTerm = await prisma.academicTerm.findFirst({ where: { isCurrent: true, isActive: true } });

  res.json({
    stats: {
      activeCourses: regs.filter((r) => r.status === 'ENROLLED').length,
      enrolledCourses: regs.filter((r) => r.status === 'ENROLLED').length,
      completedCourses: regs.filter((r) => r.status === 'COMPLETED').length,
      pendingAssignments,
      upcomingQuizzes,
      publishedResults,
      overallAttendance,
      cgpa: transcript.cgpa,
      currentSemester: currentTerm ? currentTerm.title : (r0Term(regs)),
      creditsEarned: transcript.totalCredits ?? transcript.creditsEarned ?? null,
    },
    courses: courseCards,
  });
}));

// Fallback to the term of the first registration when no current term flag set.
function r0Term(regs) {
  return regs.length && regs[0].offering && regs[0].offering.term ? regs[0].offering.term.title : null;
}

// ============================================================
// COURSE REGISTRATION
// ============================================================
// Available offerings (current term) the student is NOT yet registered in.
router.get('/offerings/available', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const term = await prisma.academicTerm.findFirst({ where: { isCurrent: true, isActive: true } });
  if (!term) return res.json({ term: null, offerings: [] });
  const myRegs = await prisma.courseRegistration.findMany({ where: { studentId }, select: { offeringId: true } });
  const myOfferingIds = myRegs.map((r) => r.offeringId);
  // DEPARTMENT ISOLATION (Req #2.2): only offer courses from the student's OWN
  // department/program. Never surface another department's offerings.
  const deptScope = await resolveStudentDeptScope(req);
  const offerings = await prisma.courseOffering.findMany({
    where: { termId: term.id, isDeleted: false, status: 'ACTIVE', id: { notIn: myOfferingIds }, courseId: { in: deptScope.courseIds } },
    include: {
      course: { include: { program: true, semester: true } },
      teacher: { include: { profile: true } },
      sections: { where: { isDeleted: false }, include: { _count: { select: { registrations: true } } } },
      _count: { select: { registrations: true } },
    },
    orderBy: { id: 'asc' },
  });
  res.json({ term, offerings });
}));

// My registrations
router.get('/registrations', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId },
    include: { offering: { include: { course: true, term: true } }, section: true },
    orderBy: { registeredAt: 'desc' },
  });
  res.json({ registrations: regs });
}));

// ------------------------------------------------------------
// WITHDRAWAL DEADLINE (client requirement 4.1) — read-only for students.
// The Focal Person sets this; students see it in real time and may withdraw
// only up to and including the deadline.
// ------------------------------------------------------------
const WITHDRAW_DEADLINE_KEY = 'lms_withdraw_deadline';

async function getWithdrawDeadlineState() {
  const row = await prisma.systemConfiguration.findUnique({ where: { key: WITHDRAW_DEADLINE_KEY } }).catch(() => null);
  const deadline = row && row.value ? row.value : null;
  const now = new Date();
  // A deadline of null means "no deadline set" → withdrawals are allowed.
  const isOpen = !deadline || now <= new Date(deadline);
  return { deadline, isOpen, isPast: !!deadline && now > new Date(deadline), serverNow: now.toISOString() };
}

router.get('/withdraw-deadline', asyncHandler(async (req, res) => {
  res.json(await getWithdrawDeadlineState());
}));

// Withdraw from an enrolled course — blocked once the deadline has passed
// (client requirement 4.1).
router.put('/registrations/:id/withdraw', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const reg = await prisma.courseRegistration.findUnique({
    where: { id },
    include: { offering: { include: { course: { select: { code: true, title: true } } } } },
  });
  if (!reg || reg.studentId !== studentId) throw httpError(404, 'Registration not found');
  if (reg.status !== 'ENROLLED') throw httpError(400, 'Only enrolled courses can be withdrawn.');

  // Enforce the Focal Person's withdrawal deadline.
  const { deadline, isOpen } = await getWithdrawDeadlineState();
  if (!isOpen) {
    throw httpError(403, `The course withdrawal deadline (${deadline ? new Date(deadline).toLocaleString() : ''}) has passed. Withdrawals are closed.`);
  }

  const updated = await prisma.courseRegistration.update({
    where: { id },
    data: { status: 'WITHDRAWN', withdrawnAt: new Date() },
  });
  await audit(req, 'STUDENT_WITHDRAW', 'CourseRegistration', id, {
    after: { studentId, course: reg.offering.course.code, status: 'WITHDRAWN' },
  });
  res.json({ success: true, registration: updated });
}));

// ------------------------------------------------------------
// AUTO-ENROLL (Req 3.5) — manual course registration is REMOVED.
// A student is automatically enrolled in ALL 1st-semester courses of the
// Scheme of Study defined for their department/program. This runs implicitly
// on dashboard/course loads and is idempotent.
//
// Source resolution for the "1st semester" course set:
//   1. Prefer the active SchemeOfStudy for the student's program, taking its
//      SchemeCourse items where semester === 1.
//   2. Fall back to the program's LmsSemester (number === 1) courses when no
//      active scheme exists.
// Each resolved course is mapped to an ACTIVE offering in the CURRENT term and
// upserted as an ENROLLED CourseRegistration.
// ------------------------------------------------------------
async function resolveStudentProgram(studentId) {
  const profile = await prisma.lmsStudentProfile
    .findUnique({ where: { lmsUserId: studentId }, select: { program: true, programShortForm: true } })
    .catch(() => null);
  if (!profile) return null;
  return prisma.lmsProgram.findFirst({
    where: { OR: [{ shortForm: profile.programShortForm }, { name: profile.program }], isDeleted: false },
  });
}

async function firstSemesterCourseIds(programId) {
  // 1) Active Scheme of Study for this program.
  const scheme = await prisma.schemeOfStudy.findFirst({
    where: { programId, isActive: true, isDeleted: false },
    orderBy: { version: 'desc' },
    include: { items: { where: { semester: 1 } } },
  });
  if (scheme && scheme.items.length) {
    return scheme.items.map((i) => i.courseId);
  }
  // 2) Fallback: LmsSemester number === 1 courses.
  const sem = await prisma.lmsSemester.findFirst({
    where: { programId, number: 1, isDeleted: false },
    include: { courses: { where: { isDeleted: false }, select: { id: true } } },
  });
  return sem ? sem.courses.map((c) => c.id) : [];
}

// Perform the auto-enrollment. Returns { enrolled, alreadyEnrolled, missingOfferings }.
async function autoEnrollFirstSemester(studentId, req) {
  const program = await resolveStudentProgram(studentId);
  if (!program) return { enrolled: 0, alreadyEnrolled: 0, missingOfferings: 0, reason: 'no-program' };
  const term = await prisma.academicTerm.findFirst({ where: { isCurrent: true, isActive: true } });
  if (!term) return { enrolled: 0, alreadyEnrolled: 0, missingOfferings: 0, reason: 'no-term' };
  const courseIds = await firstSemesterCourseIds(program.id);
  if (!courseIds.length) return { enrolled: 0, alreadyEnrolled: 0, missingOfferings: 0, reason: 'no-scheme' };

  // Map first-semester courses to ACTIVE offerings in the current term.
  const offerings = await prisma.courseOffering.findMany({
    where: { termId: term.id, courseId: { in: courseIds }, isDeleted: false, status: 'ACTIVE' },
    select: { id: true, courseId: true },
  });
  let enrolled = 0;
  let alreadyEnrolled = 0;
  for (const off of offerings) {
    const existing = await prisma.courseRegistration.findUnique({
      where: { offeringId_studentId: { offeringId: off.id, studentId } },
    });
    if (existing && ['ENROLLED', 'COMPLETED'].includes(existing.status)) { alreadyEnrolled++; continue; }
    if (existing) {
      await prisma.courseRegistration.update({
        where: { id: existing.id },
        data: { status: 'ENROLLED', registrationType: 'REGULAR', registeredAt: new Date(), withdrawnAt: null },
      });
    } else {
      await prisma.courseRegistration.create({
        data: { offeringId: off.id, studentId, registrationType: 'REGULAR', status: 'ENROLLED' },
      });
    }
    enrolled++;
  }
  const missingOfferings = courseIds.length - offerings.length;
  if (enrolled > 0 && req) {
    try { await audit(req, 'COURSE_AUTO_ENROLL', 'CourseRegistration', 0, { after: { enrolled, term: term.code, program: program.code } }); } catch (_) { /* ignore */ }
  }
  return { enrolled, alreadyEnrolled, missingOfferings };
}

// Explicit trigger (used by the frontend once after login). Idempotent.
router.post('/auto-enroll', asyncHandler(async (req, res) => {
  const result = await autoEnrollFirstSemester(req.lmsUser.id, req);
  res.json({ ...result, message: 'Auto-enrollment processed' });
}));

// Manual registration is disabled (Req 3.5 — removed). Kept as an explicit
// 410 so any stale client receives a clear message instead of a silent 404.
router.post('/register', asyncHandler(async (req, res) => {
  throw httpError(410, 'Manual course registration has been removed. You are automatically enrolled in your 1st-semester Scheme of Study courses.');
}));

// ============================================================
// MY COURSES + COURSE DETAIL
// ============================================================
router.get('/courses', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  // Req 3.5 — ensure the student is auto-enrolled in their 1st-semester
  // Scheme of Study courses (idempotent, no manual registration needed).
  try { await autoEnrollFirstSemester(studentId, req); } catch (_) { /* non-fatal */ }
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId, status: { in: ['ENROLLED', 'COMPLETED'] } },
    include: {
      offering: {
        include: {
          course: { include: { program: true, semester: true } },
          term: true,
          teacher: { include: { profile: true } },
          _count: { select: { assignments: true, quizzes: true, materials: true, labTasks: true } },
        },
      },
      section: true,
    },
    orderBy: { registeredAt: 'desc' },
  });
  res.json({ courses: regs });
}));

router.get('/courses/:offeringId', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringId = parseInt(req.params.offeringId, 10);
  await requireRegistered(studentId, offeringId);
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: { course: { include: { program: true, semester: true } }, term: true, teacher: { include: { profile: true } } },
  });
  const [materials, announcements, attendance] = await Promise.all([
    prisma.courseMaterial.findMany({ where: { offeringId, isDeleted: false }, orderBy: [{ weekNumber: 'asc' }] }),
    prisma.lmsAnnouncement.findMany({ where: { offeringId, isDeleted: false }, orderBy: { createdAt: 'desc' } }),
    academic.attendanceSummary(offeringId, studentId),
  ]);

  // Log course access for the activity timeline (fire-and-forget).
  logActivity({
    studentId,
    type: 'COURSE_ACCESS',
    title: `Opened course: ${offering.course.title}`,
    courseCode: offering.course.code,
    courseTitle: offering.course.title,
    refType: 'CourseOffering',
    refId: offeringId,
    req,
  });

  res.json({ offering, materials, announcements, attendance });
}));

// Explicit course-access log endpoint (used by lightweight frontend
// triggers, e.g. opening a course module from the dashboard). (Req #7)
router.post('/courses/:offeringId/access', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringId = parseInt(req.params.offeringId, 10);
  await requireRegistered(studentId, offeringId);
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId }, include: { course: true },
  });
  if (offering) {
    await logActivity({
      studentId, type: 'COURSE_ACCESS',
      title: `Accessed course: ${offering.course.title}`,
      courseCode: offering.course.code, courseTitle: offering.course.title,
      refType: 'CourseOffering', refId: offeringId, req,
    });
  }
  res.json({ ok: true });
}));

// ============================================================
// AI TUTOR (Requirement #3) — self-hosted conversational tutor.
// Persists conversation history per-student. Course-specific
// assistance via optional courseCode.
// ============================================================
router.get('/ai-tutor/history', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const messages = await prisma.aiTutorMessage.findMany({
    where: { studentId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  res.json({ messages, aiConfigured: aiTutor.isConfigured() });
}));

router.post('/ai-tutor/chat', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const message = (req.body && req.body.message ? String(req.body.message) : '').trim();
  const courseCode = req.body && req.body.courseCode ? String(req.body.courseCode) : null;
  if (!message) throw httpError(400, 'A message is required.');

  // Resolve course context (must be an enrolled course).
  let course = null;
  if (courseCode) {
    const offeringIds = await myOfferingIds(studentId, ['ENROLLED']);
    const offering = await prisma.courseOffering.findFirst({
      where: { id: { in: offeringIds }, course: { code: courseCode } },
      include: { course: true },
    });
    if (offering) course = { code: offering.course.code, title: offering.course.title };
  }

  // Load recent history for continuity.
  const prior = await prisma.aiTutorMessage.findMany({
    where: { studentId }, orderBy: { createdAt: 'desc' }, take: 8,
  });
  const history = prior.reverse().map((m) => ({ role: m.role, content: m.content }));

  const profile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: studentId } });
  const studentName = (profile && profile.fullName) || req.lmsUser.username;

  // Persist the user message.
  await prisma.aiTutorMessage.create({
    data: { studentId, role: 'user', content: message, courseCode, courseTitle: course ? course.title : null },
  });

  const result = await aiTutor.chatTutor({ message, course, history, studentName });

  // Persist the assistant reply.
  const saved = await prisma.aiTutorMessage.create({
    data: { studentId, role: 'assistant', content: result.reply, courseCode, courseTitle: course ? course.title : null },
  });

  await logActivity({
    studentId, type: 'AI_TUTOR',
    title: 'Used the AI Tutor',
    description: message.slice(0, 120),
    courseCode, courseTitle: course ? course.title : null,
    refType: 'AiTutorMessage', refId: saved.id, req,
  });

  res.json({ reply: result.reply, aiConfigured: result.configured !== false, messageId: saved.id, createdAt: saved.createdAt });
}));

// Record a logout event for the activity timeline (Requirement #7).
router.post('/logout-activity', asyncHandler(async (req, res) => {
  await logActivity({ studentId: req.lmsUser.id, type: 'LOGOUT', title: 'Signed out', req });
  res.json({ ok: true });
}));

// ============================================================
// ATTENDANCE (view)
// ============================================================
router.get('/courses/:offeringId/attendance', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringId = parseInt(req.params.offeringId, 10);
  await requireRegistered(studentId, offeringId);
  // Enhanced weighted (40% live + 60% recorded) summary with the
  // per-session and per-lecture breakdown for the detailed view.
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: { course: true, teacher: { include: { profile: true } } },
  });
  const summary = await academic.weightedAttendance(offeringId, studentId);
  // Keep the legacy `attendanceSummary` shape too for back-compat consumers.
  const legacy = await academic.attendanceSummary(offeringId, studentId);
  res.json({
    ...legacy,
    ...summary,
    watchThreshold: WATCH_ATTENDANCE_THRESHOLD,
    courseCode: offering?.course?.code || '—',
    courseTitle: offering?.course?.title || '—',
    teacherName: offering?.teacher?.profile?.fullName || offering?.teacher?.username || 'Not assigned',
  });
}));

router.get('/attendance', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId, status: { in: ['ENROLLED', 'COMPLETED'] } },
    include: { offering: { include: { course: true, teacher: { include: { profile: true } } } } },
  });
  const rows = [];
  for (const r of regs) {
    // eslint-disable-next-line no-await-in-loop
    const s = await academic.weightedAttendance(r.offeringId, studentId);
    rows.push({
      offeringId: r.offeringId,
      courseCode: r.offering.course.code,
      courseTitle: r.offering.course.title,
      teacherName: r.offering.teacher?.profile?.fullName || r.offering.teacher?.username || 'Not assigned',
      // Weighted attendance fields
      overallPercentage: s.overallPercentage,
      livePercentage: s.livePercentage,
      recordedPercentage: s.recordedPercentage,
      status: s.status,
      totalLiveClasses: s.totalLiveClasses,
      attendedLiveClasses: s.attendedLiveClasses,
      totalRecordedLectures: s.totalRecordedLectures,
      watchedRecordedLectures: s.watchedRecordedLectures,
      liveWeight: s.liveWeight,
      recordedWeight: s.recordedWeight,
      // Legacy fields (kept for back-compat)
      present: s.present, absent: s.absent, late: s.late, leave: s.leave,
      totalSessions: s.totalLiveClasses, percentage: s.overallPercentage,
    });
  }
  res.json({ courses: rows });
}));

// Mark a recorded lecture as watched (drives the 60% recorded component
// of the weighted attendance). Idempotent per (student, lecture).
router.post('/attendance/recorded/:offeringId/watch', validate([
  body('lectureKey').isString().isLength({ min: 1 }).withMessage('lectureKey is required'),
]), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringId = parseInt(req.params.offeringId, 10);
  await requireRegistered(studentId, offeringId);
  const lectureKey = String(req.body.lectureKey).slice(0, 100);
  await prisma.recordedLectureView.upsert({
    where: { studentId_lectureKey: { studentId, lectureKey } },
    update: { watched: true, watchedAt: new Date(), offeringId },
    create: { studentId, offeringId, lectureKey, watched: true },
  });
  // Return the recomputed weighted attendance so the UI updates instantly.
  const summary = await academic.weightedAttendance(offeringId, studentId);
  try { realtime.emitTo([studentId], 'attendance:update', { offeringId, overallPercentage: summary.overallPercentage }); } catch (_) { /* noop */ }
  res.json({ success: true, attendance: summary });
}));

// Point 6 — AUTOMATIC recorded-lecture attendance via real watch progress.
// The player reports the furthest point reached; attendance is auto-granted
// once the student has watched at least WATCH_ATTENDANCE_THRESHOLD (default
// 70%) of THAT specific lecture. Progress is monotonic (we keep the MAX
// watchedSeconds ever reported) so a page refresh / reopen never resets it,
// and once `watched` is true it is never revoked. Student-scoped & idempotent.
router.post('/attendance/recorded/:offeringId/progress', validate([
  body('lectureKey').isString().isLength({ min: 1 }).withMessage('lectureKey is required'),
  body('watchedSeconds').isFloat({ min: 0 }).withMessage('watchedSeconds must be a number >= 0'),
  body('durationSeconds').isFloat({ min: 0 }).withMessage('durationSeconds must be a number >= 0'),
]), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringId = parseInt(req.params.offeringId, 10);
  await requireRegistered(studentId, offeringId);
  const lectureKey = String(req.body.lectureKey).slice(0, 100);
  const incomingWatched = Math.max(0, Number(req.body.watchedSeconds) || 0);
  const duration = Math.max(0, Number(req.body.durationSeconds) || 0);

  const existing = await prisma.recordedLectureView.findUnique({
    where: { studentId_lectureKey: { studentId, lectureKey } },
  });

  // Monotonic: never let progress go backwards on refresh/seek-back.
  const prevSeconds = existing ? Number(existing.watchedSeconds) || 0 : 0;
  const watchedSeconds = Math.max(prevSeconds, incomingWatched);
  const effectiveDuration = duration > 0 ? duration : (existing ? Number(existing.durationSeconds) || 0 : 0);
  const cappedWatched = effectiveDuration > 0 ? Math.min(watchedSeconds, effectiveDuration) : watchedSeconds;
  const progressPercent = effectiveDuration > 0
    ? Math.round(Math.min(100, (cappedWatched / effectiveDuration) * 100) * 100) / 100
    : 0;
  // Once watched, stays watched (never revoked). Auto-grant at threshold.
  const alreadyWatched = existing ? existing.watched : false;
  const watched = alreadyWatched || progressPercent >= WATCH_ATTENDANCE_THRESHOLD;
  const justCrossed = watched && !alreadyWatched;

  await prisma.recordedLectureView.upsert({
    where: { studentId_lectureKey: { studentId, lectureKey } },
    update: {
      offeringId,
      watchedSeconds: cappedWatched,
      durationSeconds: effectiveDuration,
      progressPercent,
      watched,
      ...(justCrossed ? { watchedAt: new Date() } : {}),
    },
    create: {
      studentId, offeringId, lectureKey,
      watchedSeconds: cappedWatched,
      durationSeconds: effectiveDuration,
      progressPercent,
      watched,
      watchedAt: watched ? new Date() : new Date(0),
    },
  });

  const summary = await academic.weightedAttendance(offeringId, studentId);
  try { realtime.emitTo([studentId], 'attendance:update', { offeringId, overallPercentage: summary.overallPercentage }); } catch (_) { /* noop */ }
  if (justCrossed) {
    try {
      await audit(req, 'RECORDED_ATTENDANCE_AUTO', 'RecordedLectureView', 0, { after: { lectureKey, progressPercent } });
    } catch (_) { /* noop */ }
  }
  res.json({
    success: true,
    lectureKey,
    progressPercent,
    watched,
    threshold: WATCH_ATTENDANCE_THRESHOLD,
    attendance: summary,
  });
}));

// ============================================================
// ASSIGNMENTS (view + submit)
// ============================================================
router.get('/assignments', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId, status: 'ENROLLED' }, select: { offeringId: true },
  });
  const offeringIds = regs.map((r) => r.offeringId);
  const assignments = await prisma.assignment2.findMany({
    where: { offeringId: { in: offeringIds }, isPublished: true, isDeleted: false },
    include: {
      // Include the teacher (with profile) so the assignment card can show the
      // real instructor name (Requirement #4 — Assignment Details).
      offering: { include: { course: true, teacher: { include: { profile: true } } } },
      submissions: { where: { studentId } },
    },
    orderBy: { dueDate: 'asc' },
  });
  const teacherName = (t) => {
    if (!t) return 'TBA';
    return (t.profile && t.profile.fullName && t.profile.fullName.trim()) || t.username || 'TBA';
  };
  const rows = assignments.map((a) => {
    const sub = a.submissions[0] || null;
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      totalMarks: a.totalMarks,
      dueDate: a.dueDate,
      allowLate: a.allowLate,
      courseCode: a.offering.course.code,
      courseTitle: a.offering.course.title,
      offeringId: a.offeringId,
      // Real instructor name + the assignment brief attachment (Requirement #4).
      teacher: teacherName(a.offering.teacher),
      attachmentUrl: a.filePath || null,
      attachmentName: a.fileName || null,
      submission: sub ? { id: sub.id, status: sub.status, marks: sub.marks, feedback: sub.feedback, submittedAt: sub.submittedAt, fileName: sub.fileName, filePath: sub.filePath } : null,
    };
  });
  res.json({ assignments: rows });
}));

router.get('/assignments/:id', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const assignment = await prisma.assignment2.findFirst({
    where: { id, isPublished: true, isDeleted: false },
    include: { offering: { include: { course: true } } },
  });
  if (!assignment) throw httpError(404, 'Assignment not found');
  await requireRegistered(studentId, assignment.offeringId);
  const submission = await prisma.assignmentSubmission.findUnique({
    where: { assignmentId_studentId: { assignmentId: id, studentId } },
  });
  res.json({ assignment, submission });
}));

// Submit / resubmit an assignment
router.post('/assignments/:id/submit', uploadLmsSubmission.single('file'), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const assignment = await prisma.assignment2.findFirst({ where: { id, isPublished: true, isDeleted: false } });
  if (!assignment) throw httpError(404, 'Assignment not found');
  await requireRegistered(studentId, assignment.offeringId);

  const now = new Date();
  const due = new Date(assignment.dueDate);
  const isLate = !Number.isNaN(due.getTime()) && now > due;
  if (isLate && !assignment.allowLate) throw httpError(400, 'The deadline has passed and late submissions are not allowed');

  const content = req.body.content || null;
  if (!content && !req.file) throw httpError(400, 'Provide submission text or a file');

  const data = {
    content,
    filePath: req.file ? `/uploads/lms-submissions/${req.file.filename}` : undefined,
    fileName: req.file ? req.file.originalname : undefined,
    status: isLate ? 'LATE' : 'SUBMITTED',
    submittedAt: now,
    marks: null,
    feedback: null,
  };
  const submission = await prisma.assignmentSubmission.upsert({
    where: { assignmentId_studentId: { assignmentId: id, studentId } },
    update: data,
    create: { assignmentId: id, studentId, ...data },
  });
  await audit(req, 'ASSIGNMENT_SUBMIT', 'AssignmentSubmission', submission.id, { after: { status: submission.status } });

  // Activity timeline (Req #7).
  try {
    const off = await prisma.courseOffering.findUnique({ where: { id: assignment.offeringId }, include: { course: true } });
    await logActivity({
      studentId, type: 'ASSIGNMENT_SUBMIT',
      title: `Submitted assignment: ${assignment.title}`,
      description: submission.status === 'LATE' ? 'Submitted after the deadline' : 'Submitted on time',
      courseCode: off ? off.course.code : null,
      courseTitle: off ? off.course.title : null,
      refType: 'Assignment', refId: id, req,
    });
  } catch (_) { /* ignore */ }

  // Real-time: notify the course teacher so their assignment statistics
  // (Total/Submitted/Pending/Graded) update live without a refresh (Req 9).
  try {
    const offering = await prisma.courseOffering.findUnique({ where: { id: assignment.offeringId }, select: { teacherId: true } });
    if (offering?.teacherId) {
      realtime.emitTo(offering.teacherId, 'assignment', {
        action: 'submitted',
        assignmentId: id,
        offeringId: assignment.offeringId,
        status: submission.status,
      });
    }
  } catch (_) { /* non-fatal */ }

  res.status(201).json({ submission });
}));

// ============================================================
// LAB TASKS (Lab Management — Req 3.2)
// ------------------------------------------------------------
// A student sees lab tasks grouped by their LAB courses (offerings whose
// course.hasLab === true). From each lab course they can view its lab tasks,
// submit lab work, and see the grade for each lab task. All marks entered by
// the teacher are reflected here in real time.
// ============================================================

// Section-scope helper: which of the student's enrolled offerings are labs,
// and the student's own section per offering (lab tasks can be section-scoped).
async function studentLabRegistrations(studentId) {
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId, status: { in: ['ENROLLED', 'COMPLETED'] } },
    include: {
      offering: { include: { course: { include: { program: true, semester: true } }, term: true } },
      section: true,
    },
    orderBy: { registeredAt: 'desc' },
  });
  return regs.filter((r) => r.offering && r.offering.course && r.offering.course.hasLab === true);
}

// Grouped list: one entry per LAB course the student is enrolled in, each with
// its lab tasks + the student's submission/grade for each task (Req 3.2 cards).
router.get('/lab-tasks', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const labRegs = await studentLabRegistrations(studentId);
  const courses = [];
  for (const reg of labRegs) {
    const off = reg.offering;
    // A lab task is visible to the student when published, and either not
    // section-scoped OR scoped to the student's own section.
    const tasks = await prisma.labTask.findMany({
      where: {
        offeringId: off.id,
        isDeleted: false,
        isPublished: true,
        OR: [{ sectionId: null }, ...(reg.sectionId ? [{ sectionId: reg.sectionId }] : [])],
      },
      include: { submissions: { where: { studentId } } },
      orderBy: { id: 'asc' },
    });
    courses.push({
      offeringId: off.id,
      courseCode: off.course.code,
      courseTitle: off.course.title,
      creditLabel: creditLabel(off.course),
      program: off.course.program
        ? { id: off.course.program.id, shortForm: off.course.program.shortForm, name: off.course.program.name }
        : null,
      semester: off.course.semester
        ? { id: off.course.semester.id, number: off.course.semester.number, title: off.course.semester.title }
        : null,
      term: off.term ? { id: off.term.id, code: off.term.code, title: off.term.title } : null,
      section: reg.section ? { id: reg.section.id, name: reg.section.name } : null,
      labTasks: tasks.map((t) => {
        const sub = t.submissions[0] || null;
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          totalMarks: t.totalMarks,
          dueDate: t.dueDate,
          allowLate: t.allowLate,
          filePath: t.filePath,
          fileName: t.fileName,
          submission: sub
            ? {
                id: sub.id,
                status: sub.status,
                submittedAt: sub.submittedAt,
                filePath: sub.filePath,
                fileName: sub.fileName,
                content: sub.content,
                marks: sub.marks,
                feedback: sub.feedback,
                gradedAt: sub.gradedAt,
              }
            : null,
        };
      }),
    });
  }
  res.json({ courses });
}));

// Single lab task detail (with the student's own submission/grade).
router.get('/lab-tasks/:id', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const labTask = await prisma.labTask.findFirst({
    where: { id, isDeleted: false, isPublished: true },
    include: { offering: { include: { course: true } } },
  });
  if (!labTask) throw httpError(404, 'Lab task not found');
  // Must be a lab course and the student must be registered.
  if (!labTask.offering || labTask.offering.course.hasLab !== true) throw httpError(404, 'Lab task not found');
  const reg = await requireRegistered(studentId, labTask.offeringId);
  if (labTask.sectionId && reg.sectionId && labTask.sectionId !== reg.sectionId) {
    throw httpError(403, 'This lab task is not assigned to your section');
  }
  const submission = await prisma.labTaskSubmission.findUnique({
    where: { labTaskId_studentId: { labTaskId: id, studentId } },
  });
  res.json({ labTask, submission });
}));

// Submit / resubmit a lab task (Req 3.2 — upload lab work).
router.post('/lab-tasks/:id/submit', uploadLmsSubmission.single('file'), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const labTask = await prisma.labTask.findFirst({
    where: { id, isDeleted: false, isPublished: true },
    include: { offering: { include: { course: true } } },
  });
  if (!labTask) throw httpError(404, 'Lab task not found');
  if (!labTask.offering || labTask.offering.course.hasLab !== true) throw httpError(404, 'Lab task not found');
  const reg = await requireRegistered(studentId, labTask.offeringId);
  if (labTask.sectionId && reg.sectionId && labTask.sectionId !== reg.sectionId) {
    throw httpError(403, 'This lab task is not assigned to your section');
  }

  const now = new Date();
  const due = new Date(labTask.dueDate);
  const isLate = !Number.isNaN(due.getTime()) && now > due;
  if (isLate && !labTask.allowLate) throw httpError(400, 'The deadline has passed and late submissions are not allowed');

  const content = req.body.content || null;
  if (!content && !req.file) throw httpError(400, 'Provide submission text or a file');

  const data = {
    content,
    filePath: req.file ? `/uploads/lms-submissions/${req.file.filename}` : undefined,
    fileName: req.file ? req.file.originalname : undefined,
    status: isLate ? 'LATE' : 'SUBMITTED',
    submittedAt: now,
    marks: null,
    feedback: null,
    gradedById: null,
    gradedAt: null,
  };
  const submission = await prisma.labTaskSubmission.upsert({
    where: { labTaskId_studentId: { labTaskId: id, studentId } },
    update: data,
    create: { labTaskId: id, studentId, ...data },
  });
  await audit(req, 'LABTASK_SUBMIT', 'LabTaskSubmission', submission.id, { after: { status: submission.status } });

  try {
    await logActivity({
      studentId, type: 'LABTASK_SUBMIT',
      title: `Submitted lab task: ${labTask.title}`,
      description: submission.status === 'LATE' ? 'Submitted after the deadline' : 'Submitted on time',
      courseCode: labTask.offering.course.code,
      courseTitle: labTask.offering.course.title,
      refType: 'LabTask', refId: id, req,
    });
  } catch (_) { /* ignore */ }

  // Real-time: notify the course teacher (their lab-task stats update live)
  // and nudge Focal Persons via the shared monitor channel (Req 2).
  try {
    const offering = await prisma.courseOffering.findUnique({ where: { id: labTask.offeringId }, select: { teacherId: true } });
    if (offering?.teacherId) {
      realtime.emitTo(offering.teacherId, 'labtask', {
        action: 'submitted', labTaskId: id, offeringId: labTask.offeringId, status: submission.status,
      });
    }
    realtime.emitAll('labtask-monitor', { action: 'submitted', labTaskId: id, offeringId: labTask.offeringId });
  } catch (_) { /* non-fatal */ }

  res.status(201).json({ submission });
}));

// ============================================================
// QUIZZES (view + attempt)
// ============================================================
router.get('/quizzes', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId, status: 'ENROLLED' }, select: { offeringId: true },
  });
  const offeringIds = regs.map((r) => r.offeringId);
  const quizzes = await prisma.quiz.findMany({
    where: { offeringId: { in: offeringIds }, isPublished: true, isDeleted: false },
    include: {
      offering: { include: { course: true } },
      attempts: { where: { studentId } },
      _count: { select: { questions: true } },
    },
    orderBy: { id: 'desc' },
  });
  const rows = quizzes.map((q) => {
    const att = q.attempts[0] || null;
    return {
      id: q.id,
      title: q.title,
      description: q.description,
      totalMarks: q.totalMarks,
      durationMin: q.durationMin,
      startAt: q.startAt,
      endAt: q.endAt,
      questionCount: q._count.questions,
      courseCode: q.offering.course.code,
      courseTitle: q.offering.course.title,
      offeringId: q.offeringId,
      attempt: att ? { id: att.id, status: att.status, score: att.score, maxScore: att.maxScore, submittedAt: att.submittedAt } : null,
    };
  });
  res.json({ quizzes: rows });
}));

// Start an attempt → returns questions WITHOUT correct answers
router.post('/quizzes/:id/start', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const quiz = await prisma.quiz.findFirst({
    where: { id, isPublished: true, isDeleted: false },
    include: { questions: { orderBy: { order: 'asc' } } },
  });
  if (!quiz) throw httpError(404, 'Quiz not found');
  await requireRegistered(studentId, quiz.offeringId);

  // Time window check
  const now = new Date();
  if (quiz.startAt && now < new Date(quiz.startAt)) throw httpError(400, 'Quiz has not started yet');
  if (quiz.endAt && now > new Date(quiz.endAt)) throw httpError(400, 'Quiz window has closed');

  const existing = await prisma.quizAttempt.findUnique({
    where: { quizId_studentId: { quizId: id, studentId } },
  });
  if (existing && existing.status !== 'IN_PROGRESS') throw httpError(409, 'You have already attempted this quiz');

  const attempt = existing || await prisma.quizAttempt.create({
    data: { quizId: id, studentId, maxScore: quiz.totalMarks, status: 'IN_PROGRESS' },
  });

  let questions = academic.publicQuizQuestions(quiz.questions);
  if (quiz.shuffle) questions = questions.sort(() => Math.random() - 0.5);
  await audit(req, 'QUIZ_START', 'QuizAttempt', attempt.id, { after: { quizId: id } });
  res.json({
    attempt: { id: attempt.id, startedAt: attempt.startedAt, status: attempt.status },
    quiz: { id: quiz.id, title: quiz.title, durationMin: quiz.durationMin, totalMarks: quiz.totalMarks },
    questions,
  });
}));

// Submit an attempt → auto-grade objective questions
router.post('/quizzes/:id/submit', validate([
  body('answers').exists().withMessage('answers is required'),
]), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const quiz = await prisma.quiz.findFirst({
    where: { id, isPublished: true, isDeleted: false },
    include: { questions: true },
  });
  if (!quiz) throw httpError(404, 'Quiz not found');
  await requireRegistered(studentId, quiz.offeringId);

  const attempt = await prisma.quizAttempt.findUnique({
    where: { quizId_studentId: { quizId: id, studentId } },
  });
  if (!attempt) throw httpError(400, 'Start the quiz before submitting');
  if (attempt.status !== 'IN_PROGRESS') throw httpError(409, 'This attempt is already submitted');

  const answers = typeof req.body.answers === 'string' ? safeJson(req.body.answers, {}) : (req.body.answers || {});
  const graded = academic.gradeQuizAttempt(quiz.questions, answers);
  const updated = await prisma.quizAttempt.update({
    where: { id: attempt.id },
    data: {
      answersJson: JSON.stringify(answers),
      score: graded.score,
      maxScore: graded.maxScore,
      status: graded.needsManual ? 'SUBMITTED' : 'GRADED',
      submittedAt: new Date(),
      gradedAt: graded.needsManual ? null : new Date(),
    },
  });
  await audit(req, 'QUIZ_SUBMIT', 'QuizAttempt', updated.id, { after: { score: graded.score } });

  // Activity timeline (Req #7).
  try {
    const off = await prisma.courseOffering.findUnique({ where: { id: quiz.offeringId }, include: { course: true } });
    await logActivity({
      studentId, type: 'QUIZ_ATTEMPT',
      title: `Attempted quiz: ${quiz.title}`,
      description: `Score ${graded.score}/${graded.maxScore}`,
      courseCode: off ? off.course.code : null,
      courseTitle: off ? off.course.title : null,
      refType: 'Quiz', refId: id, req,
    });
  } catch (_) { /* ignore */ }

  res.json({
    attempt: { id: updated.id, score: updated.score, maxScore: updated.maxScore, status: updated.status },
    autoGraded: !graded.needsManual,
  });
}));

// ============================================================
// RESULTS + GRADEBOOK + TRANSCRIPT
// ============================================================
// Published results across all courses
router.get('/results', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const results = await prisma.courseResult.findMany({
    where: { studentId, status: 'PUBLISHED' },
    include: { offering: { include: { course: true, term: true } } },
    orderBy: { publishedAt: 'desc' },
  });
  // Attach lab task marks for lab courses (Req 3.3 — show lab task details incl.
  // marks in the Results module). Non-lab courses get an empty array.
  const withLab = [];
  for (const r of results) {
    const isLab = r.offering && r.offering.course && r.offering.course.hasLab === true;
    let labTasks = [];
    if (isLab) {
      const tasks = await prisma.labTask.findMany({
        where: { offeringId: r.offeringId, isDeleted: false, isPublished: true },
        include: { submissions: { where: { studentId } } },
        orderBy: { id: 'asc' },
      });
      labTasks = tasks.map((t) => ({
        id: t.id, title: t.title, totalMarks: t.totalMarks,
        marks: t.submissions[0] ? t.submissions[0].marks : null,
        status: t.submissions[0] ? t.submissions[0].status : 'NOT_SUBMITTED',
      }));
    }
    // Point 7 — attach the DYNAMIC weightage-driven marks breakdown so the
    // Results table renders exactly the categories/items the Course
    // Coordinator configured (falls back to offering weights when unset).
    let breakdown = null;
    try { breakdown = await academic.resultBreakdown(r.offeringId, studentId); } catch (_) { breakdown = null; }
    withLab.push({ ...r, hasLab: isLab, labTasks, breakdown });
  }
  res.json({ results: withLab });
}));

// Task 4 — AUTO-GENERATED results table for EVERY enrolled course, grouped by
// term. For each course the table is built straight from the Course
// Coordinator's weightage config (exact # of quizzes / assignments / mid /
// final / lab). Courses with no published result yet appear with 0s
// (pending=true); published courses reflect their real marks. This lets the
// student Results page render the correct table the instant a course is
// distributed/registered — no manual refresh and no waiting for publish.
router.get('/results/all', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId, status: 'ENROLLED' },
    include: { offering: { include: { course: true, term: true } } },
    orderBy: { registeredAt: 'asc' },
  });

  const termsMap = {};
  for (const reg of regs) {
    const off = reg.offering;
    if (!off || off.isDeleted || !off.course) continue;
    let breakdown = null;
    try { breakdown = await academic.resultBreakdownPreview(off.id, studentId); } catch (_) { breakdown = null; }
    if (!breakdown) continue;

    const term = off.term || { id: 0, code: '—', title: 'Current' };
    const termKey = term.code || `term-${term.id}`;
    if (!termsMap[termKey]) {
      termsMap[termKey] = {
        termCode: termKey,
        termTitle: term.title || term.code || 'Current',
        rows: [],
      };
    }
    termsMap[termKey].rows.push({
      resultId: breakdown.resultId,
      offeringId: off.id,
      courseCode: breakdown.courseCode,
      courseTitle: breakdown.courseTitle,
      creditHours: breakdown.creditHours,
      hasLab: breakdown.hasLab,
      pending: breakdown.pending,
      published: breakdown.published,
      totalPercent: breakdown.totalPercent,
      letterGrade: breakdown.letterGrade,
      gradePoints: breakdown.gradePoints,
      breakdown,
    });
  }

  const terms = Object.values(termsMap);
  res.json({ terms });
}));

// Point 7 — standalone dynamic result breakdown for one offering.
router.get('/results/:offeringId/breakdown', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringId = parseInt(req.params.offeringId, 10);
  await requireRegistered(studentId, offeringId);
  const breakdown = await academic.resultBreakdown(offeringId, studentId);
  if (!breakdown) throw httpError(404, 'No published result for this course');
  res.json({ breakdown });
}));

// Per-course gradebook (student view of own components)
router.get('/courses/:offeringId/gradebook', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringId = parseInt(req.params.offeringId, 10);
  await requireRegistered(studentId, offeringId);
  const offering = await prisma.courseOffering.findUnique({ where: { id: offeringId }, include: { course: true } });
  const isLab = offering.course && offering.course.hasLab === true;
  const [assignments, quizzes, result, labTasks] = await Promise.all([
    prisma.assignment2.findMany({
      where: { offeringId, isDeleted: false, isPublished: true },
      include: { submissions: { where: { studentId } } },
    }),
    prisma.quiz.findMany({
      where: { offeringId, isDeleted: false, isPublished: true },
      include: { attempts: { where: { studentId } } },
    }),
    prisma.courseResult.findUnique({ where: { offeringId_studentId: { offeringId, studentId } } }),
    // Lab task marks (Req 3.3) — only for lab courses.
    isLab
      ? prisma.labTask.findMany({
          where: { offeringId, isDeleted: false, isPublished: true },
          include: { submissions: { where: { studentId } } },
          orderBy: { id: 'asc' },
        })
      : Promise.resolve([]),
  ]);
  res.json({
    offering: { id: offering.id, courseCode: offering.course.code, courseTitle: offering.course.title,
      hasLab: isLab,
      weights: { assignment: offering.assignmentWeight, quiz: offering.quizWeight, mid: offering.midWeight, final: offering.finalWeight } },
    assignments: assignments.map((a) => ({
      id: a.id, title: a.title, totalMarks: a.totalMarks,
      marks: a.submissions[0] ? a.submissions[0].marks : null,
      status: a.submissions[0] ? a.submissions[0].status : 'NOT_SUBMITTED',
    })),
    quizzes: quizzes.map((q) => ({
      id: q.id, title: q.title, totalMarks: q.totalMarks,
      score: q.attempts[0] ? q.attempts[0].score : null,
      status: q.attempts[0] ? q.attempts[0].status : 'NOT_ATTEMPTED',
    })),
    labTasks: labTasks.map((t) => ({
      id: t.id, title: t.title, totalMarks: t.totalMarks, dueDate: t.dueDate,
      marks: t.submissions[0] ? t.submissions[0].marks : null,
      feedback: t.submissions[0] ? t.submissions[0].feedback : null,
      status: t.submissions[0] ? t.submissions[0].status : 'NOT_SUBMITTED',
    })),
    result: result && result.status === 'PUBLISHED' ? result : null,
  });
}));

// Full transcript with GPA per term + CGPA
router.get('/transcript', asyncHandler(async (req, res) => {
  const transcript = await academic.studentTranscript(req.lmsUser.id);
  res.json(transcript);
}));

// ============================================================
// RESULT / TRANSCRIPT DOWNLOAD (Req 3.4 — Download instead of Print)
// ------------------------------------------------------------
// Server-side PDF generation replacing the old browser Print for every
// Results view: full transcript (all sessions/semesters), a single
// semester/term result, and the overall cumulative result.
// ============================================================

// Small shared helper: draw a document header with the student's identity.
function drawResultHeader(doc, profile, subtitle) {
  doc.fontSize(16).fillColor('#111').text('AUST ODL — Academic Record', { align: 'center' });
  if (subtitle) { doc.moveDown(0.15); doc.fontSize(11).fillColor('#555').text(subtitle, { align: 'center' }); }
  doc.moveDown(0.5);
  doc.fillColor('#000').fontSize(10);
  if (profile) {
    const line = [
      profile.fullName ? `Name: ${profile.fullName}` : null,
      profile.rollNumber ? `Roll No: ${profile.rollNumber}` : null,
      profile.program ? `Program: ${profile.program}` : null,
    ].filter(Boolean).join('     ');
    if (line) doc.text(line);
    if (profile.department) doc.text(`Department: ${profile.department}`);
  }
  doc.moveDown(0.4);
}

// Draw a table of result rows (course code/title/credits/percent/grade/points).
function drawResultTable(doc, rows) {
  const headers = ['Course Code', 'Course Title', 'Cr.Hrs', 'Total %', 'Grade', 'GP'];
  const widths = [90, 220, 55, 65, 55, 45];
  const startX = doc.x;
  const drawRow = (cells, opts = {}) => {
    const y = doc.y;
    let x = startX;
    doc.fontSize(9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
    cells.forEach((c, i) => { doc.text(String(c == null ? '' : c), x + 2, y + 2, { width: widths[i] - 4, ellipsis: true }); x += widths[i]; });
    doc.moveTo(startX, doc.y + 2).lineTo(startX + widths.reduce((a, b) => a + b, 0), doc.y + 2).strokeColor('#ddd').stroke();
    doc.moveDown(0.25);
  };
  drawRow(headers, { bold: true });
  if (!rows.length) {
    doc.moveDown(0.5).fontSize(10).fillColor('#888').text('No published results.', { align: 'center' }).fillColor('#000');
    return;
  }
  rows.forEach((r) => {
    if (doc.y > 760) { doc.addPage(); drawRow(headers, { bold: true }); }
    drawRow([
      r.courseCode, r.courseTitle, r.creditHours,
      r.totalPercent != null ? Number(r.totalPercent).toFixed(1) : '—',
      r.letterGrade || '—',
      r.gradePoints != null ? Number(r.gradePoints).toFixed(2) : '—',
    ]);
  });
}

// Full transcript / all sessions & semesters (Req 3.4).
router.get('/transcript/download', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const [transcript, profile] = await Promise.all([
    academic.studentTranscript(studentId),
    prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: studentId } }).catch(() => null),
  ]);
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="transcript.pdf"');
  doc.pipe(res);
  drawResultHeader(doc, profile, 'Official Transcript — All Semesters');
  for (const t of transcript.terms) {
    doc.moveDown(0.3).fontSize(12).font('Helvetica-Bold').fillColor('#1d4ed8')
      .text(`${t.termTitle || t.termCode}  ·  GPA: ${Number(t.gpa || 0).toFixed(2)}  ·  Credits: ${t.totalCredits}`);
    doc.fillColor('#000').font('Helvetica').moveDown(0.2);
    drawResultTable(doc, t.rows);
    doc.moveDown(0.4);
  }
  doc.moveDown(0.5).fontSize(12).font('Helvetica-Bold')
    .text(`CGPA: ${Number(transcript.cgpa || 0).toFixed(2)}     Total Credits: ${transcript.totalCredits}`);
  doc.font('Helvetica').fontSize(8).fillColor('#999').moveDown(0.6)
    .text(`Generated ${new Date().toLocaleString()}`);
  doc.end();
}));

// Overall / cumulative result (all published courses in one flat table).
router.get('/results/download', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const [transcript, profile] = await Promise.all([
    academic.studentTranscript(studentId),
    prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: studentId } }).catch(() => null),
  ]);
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="results-cumulative.pdf"');
  doc.pipe(res);
  drawResultHeader(doc, profile, 'Cumulative Result — All Courses');
  drawResultTable(doc, transcript.rows);
  doc.moveDown(0.5).fontSize(12).font('Helvetica-Bold')
    .text(`CGPA: ${Number(transcript.cgpa || 0).toFixed(2)}     Total Credits: ${transcript.totalCredits}`);
  doc.font('Helvetica').fontSize(8).fillColor('#999').moveDown(0.6)
    .text(`Generated ${new Date().toLocaleString()}`);
  doc.end();
}));

// Single semester / term result (Req 3.4 — semester-wise download).
router.get('/results/download/term/:termCode', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const termCode = req.params.termCode;
  const [transcript, profile] = await Promise.all([
    academic.studentTranscript(studentId),
    prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: studentId } }).catch(() => null),
  ]);
  const term = transcript.terms.find((t) => t.termCode === termCode);
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="result-${termCode}.pdf"`);
  doc.pipe(res);
  drawResultHeader(doc, profile, `Semester Result — ${term ? (term.termTitle || term.termCode) : termCode}`);
  drawResultTable(doc, term ? term.rows : []);
  if (term) {
    doc.moveDown(0.5).fontSize(12).font('Helvetica-Bold')
      .text(`GPA: ${Number(term.gpa || 0).toFixed(2)}     Credits: ${term.totalCredits}`);
  }
  doc.font('Helvetica').fontSize(8).fillColor('#999').moveDown(0.6)
    .text(`Generated ${new Date().toLocaleString()}`);
  doc.end();
}));

// ============================================================
// HELPER: the student's currently-registered offering ids
// ============================================================
async function myOfferingIds(studentId, statuses = ['ENROLLED', 'COMPLETED']) {
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId, status: { in: statuses } },
    select: { offeringId: true },
  });
  return regs.map((r) => r.offeringId);
}

// ============================================================
// PROFILE (student profile snapshot)
// ============================================================
// Returns a LIVE, unified view of the student's profile synchronized with
// the Admissions System (full profile, documents, missing documents and
// verification status). Falls back to the stored snapshot when an LmsUser
// is not linked to an admissions Enrollment. (Requirement #16)
router.get('/profile', asyncHandler(async (req, res) => {
  const { profile, source, enrollmentLinked } = await buildLiveStudentProfile(req.lmsUser);
  res.json({ profile, username: req.lmsUser.username, source, enrollmentLinked });
}));

// Force a fresh re-read from Admissions (used by the "Sync now" button).
router.get('/profile/sync', asyncHandler(async (req, res) => {
  const { profile, source, enrollmentLinked } = await buildLiveStudentProfile(req.lmsUser);
  await audit(req, 'PROFILE_SYNC', 'LmsStudentProfile', null, { source });
  res.json({ profile, username: req.lmsUser.username, source, enrollmentLinked, syncedAt: new Date() });
}));

// Update editable contact fields only (phone/email/address). Academic
// fields are read-only (managed by admissions/coordinator). Writes to the
// LMS snapshot only — never to the Admissions System.
router.put('/profile', validate([
  body('phone').optional().isString(),
  body('email').optional().isString(),
  body('address').optional().isString(),
]), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const data = {};
  if (req.body.phone !== undefined) data.phone = String(req.body.phone).slice(0, 30);
  if (req.body.email !== undefined) data.email = String(req.body.email).slice(0, 120);
  if (req.body.address !== undefined) data.address = String(req.body.address).slice(0, 300);
  // Upsert so a snapshot always exists for storing LMS-editable fields.
  await prisma.lmsStudentProfile.upsert({
    where: { lmsUserId: studentId },
    update: data,
    create: {
      lmsUserId: studentId,
      fullName: req.lmsUser.username, fatherName: '', cnic: '', dateOfBirth: '', gender: '',
      program: '', programShortForm: '', department: '', rollNumber: req.lmsUser.username,
      registrationNumber: '', session: '', enrollmentDate: new Date(), ...data,
    },
  });
  await audit(req, 'PROFILE_UPDATE', 'LmsStudentProfile', studentId, { after: data });
  const { profile } = await buildLiveStudentProfile(req.lmsUser);
  res.json({ profile });
}));

// Upload / replace the student's profile picture. Stored on the LMS snapshot
// (the Admissions System is never modified). Served from /uploads/photos.
router.post('/profile/photo', uploadPhoto.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, 'No image uploaded');
  const studentId = req.lmsUser.id;
  const photoUrl = `/uploads/photos/${req.file.filename}`;
  await prisma.lmsStudentProfile.upsert({
    where: { lmsUserId: studentId },
    update: { photoUrl },
    create: {
      lmsUserId: studentId, photoUrl,
      fullName: req.lmsUser.username, fatherName: '', cnic: '', dateOfBirth: '', gender: '',
      program: '', programShortForm: '', department: '', rollNumber: req.lmsUser.username,
      registrationNumber: '', session: '', enrollmentDate: new Date(),
    },
  });
  await audit(req, 'PROFILE_PHOTO_UPDATE', 'LmsStudentProfile', studentId, { photoUrl });
  const { profile } = await buildLiveStudentProfile(req.lmsUser);
  res.json({ profile, photoUrl });
}));

// ------------------------------------------------------------
// INCOMPLETE / MISSING DOCUMENTS — let the student submit any
// outstanding admission documents. Saves the uploaded file to the
// matching field on the LMS profile snapshot (Admissions System is
// never modified), recomputes the missing-docs list, and returns the
// refreshed profile so the UI updates in real time.
// ------------------------------------------------------------
const DOC_KEY_MAP = {
  photoUrl: { field: 'photoUrl', label: 'Photo' },
  cnicDocUrl: { field: 'cnicDocUrl', label: 'CNIC copy' },
  matricCertUrl: { field: 'matricCertUrl', label: 'Matric certificate' },
  intermediateCertUrl: { field: 'intermediateCertUrl', label: 'Intermediate / FA / FSc certificate' },
  migrationCertUrl: { field: 'migrationCertUrl', label: 'Migration certificate' },
  domicileCertUrl: { field: 'domicileCertUrl', label: 'Domicile certificate' },
};
// Allow lookup by human label too (frontend may send the label).
const DOC_LABEL_TO_KEY = Object.fromEntries(
  Object.entries(DOC_KEY_MAP).map(([k, v]) => [v.label.toLowerCase(), k])
);

router.post('/profile/documents', uploadLmsSubmission.single('document'), asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, 'No document uploaded');
  const studentId = req.lmsUser.id;

  // Resolve which document field this upload satisfies.
  const raw = String(req.body.docKey || req.body.label || '').trim();
  let key = DOC_KEY_MAP[raw] ? raw : DOC_LABEL_TO_KEY[raw.toLowerCase()];
  const fileUrl = `/uploads/lms-submissions/${req.file.filename}`;

  // Load existing snapshot so we can recompute the missing-docs list.
  const snapshot = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: studentId } });

  const data = {};
  if (key) {
    data[DOC_KEY_MAP[key].field] = fileUrl;
  } else {
    // Unknown/extra document — append to otherDocsJson instead of dropping it.
    let others = [];
    try { others = JSON.parse(snapshot?.otherDocsJson || '[]'); } catch { others = []; }
    if (!Array.isArray(others)) others = [];
    others.push({ label: raw || req.file.originalname || 'Document', url: fileUrl, uploadedAt: new Date().toISOString() });
    data.otherDocsJson = JSON.stringify(others);
  }

  // Recompute the missing-docs list from the merged set of document URLs.
  const merged = {
    photoUrl: data.photoUrl || snapshot?.photoUrl || null,
    cnicDocUrl: data.cnicDocUrl || snapshot?.cnicDocUrl || null,
    matricCertUrl: data.matricCertUrl || snapshot?.matricCertUrl || null,
    intermediateCertUrl: data.intermediateCertUrl || snapshot?.intermediateCertUrl || null,
    migrationCertUrl: data.migrationCertUrl || snapshot?.migrationCertUrl || null,
    domicileCertUrl: data.domicileCertUrl || snapshot?.domicileCertUrl || null,
  };
  const missing = computeMissingDocs(merged);
  data.missingDocs = JSON.stringify(missing);

  await prisma.lmsStudentProfile.upsert({
    where: { lmsUserId: studentId },
    update: data,
    create: {
      lmsUserId: studentId, ...data,
      fullName: req.lmsUser.username, fatherName: '', cnic: '', dateOfBirth: '', gender: '',
      program: '', programShortForm: '', department: '', rollNumber: req.lmsUser.username,
      registrationNumber: '', session: '', enrollmentDate: new Date(),
    },
  });

  await audit(req, 'PROFILE_DOC_UPLOAD', 'LmsStudentProfile', studentId, { docKey: key || raw, fileUrl });
  const { profile } = await buildLiveStudentProfile(req.lmsUser);
  // Real-time: notify the student's own session so other open tabs refresh.
  realtime.emitTo([studentId], 'profile', { action: 'documents', missingCount: missing.length });
  res.json({ profile, uploaded: { docKey: key || raw, url: fileUrl }, missingDocs: missing });
}));

// ============================================================
// ANNOUNCEMENTS (offering-scoped + global) — read-only for students
// ============================================================
router.get('/announcements', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringIds = await myOfferingIds(studentId);
  const items = await prisma.lmsAnnouncement.findMany({
    where: {
      isDeleted: false,
      audience: { in: ['STUDENTS', 'ALL'] },
      OR: [
        { offeringId: { in: offeringIds } },
        { offeringId: null },
      ],
    },
    include: {
      offering: { include: { course: true } },
      author: { select: { id: true, username: true, role: true, profile: { select: { fullName: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ announcements: items.map((a) => ({
    id: a.id,
    title: a.title,
    message: a.message,
    audience: a.audience,
    createdAt: a.createdAt,
    courseCode: a.offering ? a.offering.course.code : null,
    courseTitle: a.offering ? a.offering.course.title : null,
    author: a.author && a.author.profile ? a.author.profile.fullName : (a.author ? a.author.username : 'System'),
    authorRole: a.author ? a.author.role : null,
    important: a.audience === 'ALL',
  })) });
}));

// Record an announcement view for the activity timeline (Req #7).
router.post('/announcements/:id/view', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const a = await prisma.lmsAnnouncement.findUnique({
    where: { id }, include: { offering: { include: { course: true } } },
  });
  if (a && !a.isDeleted) {
    await logActivity({
      studentId, type: 'ANNOUNCEMENT_VIEW',
      title: `Viewed announcement: ${a.title}`,
      courseCode: a.offering ? a.offering.course.code : null,
      courseTitle: a.offering ? a.offering.course.title : null,
      refType: 'LmsAnnouncement', refId: id, req,
    });
  }
  res.json({ ok: true });
}));

// NOTE: The student Academic Calendar module was removed per requirement #8.
// The previous GET /calendar endpoint (and its CalendarEvent aggregation)
// has been deleted from the student LMS scope. Deadlines remain available
// via the Assignments, Quizzes, Live Classes and Schedule modules.

// ============================================================
// WEEKLY SCHEDULE / TIMETABLE — from ScheduleSlot for registered offerings
// ============================================================
router.get('/schedule', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringIds = await myOfferingIds(studentId, ['ENROLLED']);
  const slots = await prisma.scheduleSlot.findMany({
    where: { offeringId: { in: offeringIds }, isDeleted: false },
    include: { offering: { include: { course: true, teacher: { include: { profile: true } } } } },
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
      teacher: s.offering.teacher && s.offering.teacher.profile ? s.offering.teacher.profile.fullName : 'TBA',
    });
  }
  res.json({ schedule: byDay });
}));

// ============================================================
// LIVE CLASSES — list for registered offerings
// ============================================================
router.get('/live-classes', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringIds = await myOfferingIds(studentId, ['ENROLLED']);
  const items = await prisma.liveClass.findMany({
    where: { offeringId: { in: offeringIds }, isDeleted: false },
    include: { offering: { include: { course: true, teacher: { include: { profile: true } } } } },
    orderBy: { scheduledAt: 'desc' },
  });
  const bbbConfigured = bbb.isConfigured();
  res.json({
    bbbConfigured,
    liveClasses: items.map((lc) => {
      const status = (lc.status || '').toUpperCase();
      const canJoin = ['LIVE', 'SCHEDULED'].includes(status) && (bbbConfigured || !!lc.joinUrl);
      return {
        id: lc.id,
        title: lc.title,
        description: lc.description,
        scheduledAt: lc.scheduledAt,
        durationMin: lc.durationMin,
        status: lc.status,
        joinUrl: lc.joinUrl,
        recordingUrl: lc.recordingUrl,
        bbbConfigured,
        canJoin,
        courseCode: lc.offering.course.code,
        courseTitle: lc.offering.course.title,
        teacher: lc.offering.teacher && lc.offering.teacher.profile ? lc.offering.teacher.profile.fullName : 'TBA',
      };
    }),
  });
}));

// ============================================================
// JOIN A LIVE CLASS (BigBlueButton) — returns the validated join URL +
// session metadata so the LMS can render the full BBB classroom in-app.
// The student must be enrolled in the class's offering. (Requirement #3)
// ============================================================
router.get('/live-classes/:id/join', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const lc = await prisma.liveClass.findUnique({
    where: { id },
    include: { offering: { include: { course: true, teacher: { include: { profile: true } } } } },
  });
  if (!lc || lc.isDeleted) throw httpError(404, 'Live class not found');
  // Enrollment guard.
  await requireRegistered(studentId, lc.offeringId);

  const status = (lc.status || '').toUpperCase();
  if (!['LIVE', 'SCHEDULED'].includes(status)) {
    throw httpError(400, status === 'ENDED' ? 'This class has ended.' : 'This class is not available to join.');
  }

  // Resolve the student's display name (used as the BBB attendee name).
  const profile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: studentId } });
  const attendeeName = (profile && profile.fullName) || req.lmsUser.username;

  // ----------------------------------------------------------------
  // Build the join URL. When BBB is configured (self-hosted), produce
  // a freshly-signed attendee join URL (ensuring the meeting exists).
  // Otherwise fall back to the manually-published lc.joinUrl.
  // ----------------------------------------------------------------
  let joinUrl = null;
  let provider = 'BigBlueButton';
  let bbbConfigured = bbb.isConfigured();

  if (bbbConfigured) {
    try {
      // Idempotently ensure the BBB meeting exists, then sign an attendee URL.
      const meeting = await bbb.ensureMeeting({
        liveClassId: lc.id,
        name: lc.title,
        durationMin: lc.durationMin,
        record: true,
      });
      joinUrl = bbb.joinUrl({
        liveClassId: lc.id,
        fullName: attendeeName,
        role: 'attendee',
        attendeePW: meeting.attendeePW,
        userId: studentId,
      });
    } catch (err) {
      // If signing fails, degrade to the stored joinUrl when present.
      joinUrl = lc.joinUrl || null;
      bbbConfigured = false;
    }
  } else {
    joinUrl = lc.joinUrl || null;
  }

  if (!joinUrl) throw httpError(400, 'No meeting link has been published for this class yet.');

  // Personalise the stored URL fallback with the attendee name.
  if (!bbbConfigured) {
    try {
      const u = new URL(joinUrl);
      if (!u.searchParams.get('fullName') && !u.searchParams.get('displayName')) {
        u.searchParams.set('fullName', attendeeName);
      }
      joinUrl = u.toString();
    } catch (_) { /* non-absolute URL — pass through unchanged */ }
  }

  // ----------------------------------------------------------------
  // Record attendance (join time). Reuse an open session (no leftAt)
  // for this student/class if one exists within the last 5 minutes so
  // re-opening the modal does not spam rows.
  // ----------------------------------------------------------------
  let attendanceId = null;
  try {
    const recent = await prisma.liveClassAttendance.findFirst({
      where: {
        liveClassId: lc.id,
        studentId,
        leftAt: null,
        joinedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
      orderBy: { joinedAt: 'desc' },
    });
    if (recent) {
      attendanceId = recent.id;
    } else {
      const rec = await prisma.liveClassAttendance.create({
        data: {
          liveClassId: lc.id,
          studentId,
          role: 'attendee',
          meetingId: bbb.meetingIdFor(lc.id),
        },
      });
      attendanceId = rec.id;
    }
  } catch (err) {
    // attendance tracking must not block joining
    // eslint-disable-next-line no-console
    console.error('[live-class join] attendance record failed:', err.message);
  }

  await audit(req, 'LIVE_CLASS_JOIN', 'LiveClass', id, { offeringId: lc.offeringId });
  await logActivity({
    studentId,
    type: 'LIVE_CLASS',
    title: `Joined live class: ${lc.title}`,
    description: lc.offering.course.title,
    courseCode: lc.offering.course.code,
    courseTitle: lc.offering.course.title,
    refType: 'LiveClass',
    refId: lc.id,
    req,
  });

  res.json({
    join: {
      id: lc.id,
      title: lc.title,
      description: lc.description,
      status: lc.status,
      scheduledAt: lc.scheduledAt,
      durationMin: lc.durationMin,
      joinUrl,
      provider,
      bbbConfigured,
      attendanceId,
      attendeeName,
      courseCode: lc.offering.course.code,
      courseTitle: lc.offering.course.title,
      teacher: lc.offering.teacher && lc.offering.teacher.profile ? lc.offering.teacher.profile.fullName : 'TBA',
    },
  });
}));

// ============================================================
// LEAVE A LIVE CLASS — records leave time + computed duration for
// attendance tracking. Called by the frontend when the student
// closes the in-app classroom. (Requirement #2)
// ============================================================
router.post('/live-classes/:id/leave', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const attendanceId = req.body && req.body.attendanceId ? parseInt(req.body.attendanceId, 10) : null;

  // Find the open attendance session to close.
  let session = null;
  if (attendanceId) {
    session = await prisma.liveClassAttendance.findFirst({
      where: { id: attendanceId, studentId, liveClassId: id },
    });
  }
  if (!session) {
    session = await prisma.liveClassAttendance.findFirst({
      where: { liveClassId: id, studentId, leftAt: null },
      orderBy: { joinedAt: 'desc' },
    });
  }
  if (!session) return res.json({ ok: true, updated: false });

  const leftAt = new Date();
  const durationSec = Math.max(0, Math.round((leftAt.getTime() - new Date(session.joinedAt).getTime()) / 1000));
  await prisma.liveClassAttendance.update({
    where: { id: session.id },
    data: { leftAt, durationSec },
  });

  res.json({ ok: true, updated: true, durationSec });
}));

// ============================================================
// LIVE CLASS RECORDINGS — fetch published recordings for a class.
// Combines stored recordingUrl with live BBB getRecordings results.
// (Requirement #2)
// ============================================================
router.get('/live-classes/:id/recordings', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const lc = await prisma.liveClass.findUnique({
    where: { id },
    include: { offering: { include: { course: true } } },
  });
  if (!lc || lc.isDeleted) throw httpError(404, 'Live class not found');
  await requireRegistered(studentId, lc.offeringId);

  const recordings = [];
  if (lc.recordingUrl) {
    recordings.push({
      recordID: `stored-${lc.id}`,
      name: lc.title,
      state: 'published',
      playbackUrl: lc.recordingUrl,
      type: 'presentation',
      source: 'STORED',
    });
  }
  try {
    const bbbRecs = await bbb.getRecordings(id);
    for (const r of bbbRecs) recordings.push({ ...r, source: 'BBB' });
  } catch (_) { /* ignore */ }

  res.json({
    recordings,
    courseCode: lc.offering.course.code,
    courseTitle: lc.offering.course.title,
  });
}));

// ============================================================
// RECORDED LECTURES — CourseMaterial of type VIDEO, grouped by course
// ============================================================
router.get('/recorded-lectures', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringIds = await myOfferingIds(studentId);
  const mats = await prisma.courseMaterial.findMany({
    where: { offeringId: { in: offeringIds }, isDeleted: false, type: { in: ['VIDEO', 'RECORDING'] } },
    include: { offering: { include: { course: true } } },
    orderBy: [{ weekNumber: 'asc' }, { createdAt: 'desc' }],
  });
  // also any LiveClass recordings
  const recs = await prisma.liveClass.findMany({
    where: { offeringId: { in: offeringIds }, isDeleted: false, recordingUrl: { not: null } },
    include: { offering: { include: { course: true } } },
    orderBy: { scheduledAt: 'desc' },
  });
  // Point 6 — load the student's watch-progress for these lectures so the UI
  // can show live completion % and the auto-attendance state per lecture.
  const allKeys = [...mats.map((m) => `m${m.id}`), ...recs.map((r) => `lc${r.id}`)];
  const views = allKeys.length
    ? await prisma.recordedLectureView.findMany({
        where: { studentId, lectureKey: { in: allKeys } },
        select: { lectureKey: true, watched: true, progressPercent: true },
      })
    : [];
  const viewByKey = {};
  for (const v of views) viewByKey[v.lectureKey] = v;

  const groups = {};
  const add = (courseCode, courseTitle, lecture) => {
    if (!groups[courseCode]) groups[courseCode] = { courseCode, courseTitle, lectures: [] };
    groups[courseCode].lectures.push(lecture);
  };
  for (const m of mats) {
    const key = `m${m.id}`;
    const v = viewByKey[key];
    add(m.offering.course.code, m.offering.course.title, {
      id: key, lectureKey: key, offeringId: m.offeringId, title: m.title, week: m.weekNumber,
      url: m.url || m.filePath, filePath: m.filePath, fileName: m.fileName,
      description: m.description, durationMin: m.durationMin, lectureNumber: m.lectureNumber,
      createdAt: m.createdAt, kind: 'MATERIAL',
      watched: v ? v.watched : false, progressPercent: v ? (Number(v.progressPercent) || 0) : 0,
    });
  }
  for (const r of recs) {
    const key = `lc${r.id}`;
    const v = viewByKey[key];
    add(r.offering.course.code, r.offering.course.title, {
      id: key, lectureKey: key, offeringId: r.offeringId, title: r.title, url: r.recordingUrl,
      createdAt: r.scheduledAt, kind: 'LIVE_RECORDING',
      watched: v ? v.watched : false, progressPercent: v ? (Number(v.progressPercent) || 0) : 0,
    });
  }
  res.json({ subjects: Object.values(groups), attendanceThreshold: WATCH_ATTENDANCE_THRESHOLD });
}));

// ============================================================
// LIBRARY / COURSE MATERIALS — all materials grouped by course + week
// ============================================================
router.get('/materials', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringIds = await myOfferingIds(studentId);
  const mats = await prisma.courseMaterial.findMany({
    where: { offeringId: { in: offeringIds }, isDeleted: false },
    include: { offering: { include: { course: true } } },
    orderBy: [{ weekNumber: 'asc' }, { createdAt: 'desc' }],
  });
  const categories = {};
  for (const m of mats) {
    const code = m.offering.course.code;
    if (!categories[code]) categories[code] = { courseCode: code, courseTitle: m.offering.course.title, items: [] };
    categories[code].items.push({
      id: m.id, title: m.title, type: m.type, week: m.weekNumber,
      url: m.url || m.filePath, filePath: m.filePath, fileName: m.fileName,
      resourceType: m.resourceType, description: m.description, fileSize: m.fileSize,
      createdAt: m.createdAt,
    });
  }
  res.json({ categories: Object.values(categories), total: mats.length });
}));

// ============================================================
// COURSE LIBRARY — professional course cards for ENROLLED courses
// only, each with Course Name, Code, Teacher, Semester and a live
// Resource Count. Clicking a card loads that course's resources via
// GET /library/:offeringId.
// ============================================================
router.get('/library', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  // Only courses the student is currently enrolled in.
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId, status: { in: ['ENROLLED', 'COMPLETED'] } },
    include: {
      offering: {
        include: {
          course: { include: { program: true, semester: true } },
          term: true,
          teacher: { include: { profile: true } },
        },
      },
    },
    orderBy: { registeredAt: 'desc' },
  });

  const offeringIds = regs.map((r) => r.offeringId);
  // Live resource count per offering (materials only).
  const counts = offeringIds.length
    ? await prisma.courseMaterial.groupBy({
        by: ['offeringId'],
        where: { offeringId: { in: offeringIds }, isDeleted: false },
        _count: { _all: true },
      })
    : [];
  const countMap = Object.fromEntries(counts.map((c) => [c.offeringId, c._count._all]));

  const courses = regs.map((r) => {
    const off = r.offering;
    const course = off?.course;
    return {
      offeringId: r.offeringId,
      courseCode: course?.code || '—',
      courseTitle: course?.title || '—',
      teacherName: off?.teacher?.profile?.fullName || off?.teacher?.username || 'Not assigned',
      semester: course?.semester?.title || course?.semester?.name || off?.term?.title || '—',
      program: course?.program?.shortForm || course?.program?.name || null,
      creditHours: course?.creditHours || null,
      resourceCount: countMap[r.offeringId] || 0,
      status: r.status,
    };
  });

  res.json({ courses });
}));

// Resources for ONE enrolled course (used when a library card is opened).
router.get('/library/:offeringId', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringId = parseInt(req.params.offeringId, 10);
  await requireRegistered(studentId, offeringId);
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: {
      course: { include: { program: true, semester: true } },
      term: true,
      teacher: { include: { profile: true } },
    },
  });
  const mats = await prisma.courseMaterial.findMany({
    where: { offeringId, isDeleted: false },
    orderBy: [{ weekNumber: 'asc' }, { createdAt: 'desc' }],
  });
  const resources = mats.map((m) => ({
    id: m.id, title: m.title, type: m.type, week: m.weekNumber,
    url: m.url || m.filePath, filePath: m.filePath, fileName: m.fileName,
    resourceType: m.resourceType, description: m.description, fileSize: m.fileSize,
    createdAt: m.createdAt,
  }));
  res.json({
    course: {
      offeringId,
      courseCode: offering?.course?.code || '—',
      courseTitle: offering?.course?.title || '—',
      teacherName: offering?.teacher?.profile?.fullName || offering?.teacher?.username || 'Not assigned',
      semester: offering?.course?.semester?.title || offering?.course?.semester?.name || offering?.term?.title || '—',
    },
    resources,
    total: resources.length,
  });
}));

// ============================================================
// STICKY NOTES (personal) — full CRUD
// ============================================================
router.get('/notes', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const notes = await prisma.studentNote.findMany({
    where: { studentId, isDeleted: false },
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
  });
  res.json({ notes });
}));

router.post('/notes', validate([
  body('content').isString().isLength({ min: 1 }).withMessage('content is required'),
]), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const { title, content, color, tag, pinned, reminderAt } = req.body;
  const note = await prisma.studentNote.create({
    data: {
      studentId,
      title: title || null,
      content: String(content).slice(0, 4000),
      color: color || 'yellow',
      tag: tag || null,
      pinned: !!pinned,
      reminderAt: reminderAt ? new Date(reminderAt) : null,
    },
  });
  res.status(201).json({ note });
}));

router.put('/notes/:id', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.studentNote.findFirst({ where: { id, studentId, isDeleted: false } });
  if (!existing) throw httpError(404, 'Note not found');
  const { title, content, color, tag, pinned, reminderAt } = req.body;
  const data = {};
  if (title !== undefined) data.title = title;
  if (content !== undefined) data.content = String(content).slice(0, 4000);
  if (color !== undefined) data.color = color;
  if (tag !== undefined) data.tag = tag;
  if (pinned !== undefined) data.pinned = !!pinned;
  if (reminderAt !== undefined) data.reminderAt = reminderAt ? new Date(reminderAt) : null;
  const note = await prisma.studentNote.update({ where: { id }, data });
  res.json({ note });
}));

router.delete('/notes/:id', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.studentNote.findFirst({ where: { id, studentId, isDeleted: false } });
  if (!existing) throw httpError(404, 'Note not found');
  await prisma.studentNote.update({ where: { id }, data: { isDeleted: true } });
  res.json({ success: true });
}));

// ============================================================
// SUPPORT & GRIEVANCES  (formerly "APPEALS / STUDENT REQUESTS")
// ------------------------------------------------------------
// The LMS "Appeals" module is upgraded into a full Support &
// Grievances portal. ALL existing appeal behaviour is preserved:
//   • GET  /appeals              — list the student's cases (enriched)
//   • GET  /appeals/recipients   — recipient options (roles + teachers)
//   • POST /appeals              — submit a new case (grievance / support
//                                   / appeal / suggestion / feedback)
// New, additive endpoints layer richer case management on top:
//   • GET  /appeals/categories   — configurable category catalog
//   • GET  /appeals/stats        — student dashboard metrics
//   • GET  /appeals/:id          — full case (conversation + timeline)
//   • POST /appeals/:id/reply    — add a message to the conversation
//   • POST /appeals/:id/reopen   — reopen an eligible resolved case
//   • POST /appeals/:id/feedback — submit satisfaction feedback
// The Admissions Appeal module is entirely separate and untouched.
// ============================================================
const grievance = require('../../../utils/lmsGrievance');

// Human-readable label for a case's routed recipient (used by the
// student-facing tracking UI). Kept for backward compatibility.
const APPEAL_ROLE_LABEL = {
  TEACHER: 'Teacher',
  COURSE_COORDINATOR: 'Course Coordinator',
  FOCAL_PERSON: 'Focal Person',
  EXAM_CONTROLLER: 'Exam Coordinator',
  QEC_COORDINATOR: 'QEC Coordinator',
  PROVOST: 'Provost',
  FINANCE: 'Finance',
};

// Shape a StudentAppeal row for the student-facing API (adds the
// Support & Grievances presentation fields without mutating the DB row).
function shapeStudentCase(a, teacherMap = {}) {
  return {
    ...a,
    caseCode: grievance.displayCode(a),
    caseType: grievance.effectiveCaseType(a),
    caseTypeLabel: grievance.CASE_TYPE_LABEL[grievance.effectiveCaseType(a)],
    categoryLabel: grievance.categoryLabel(a.category),
    statusLabel: grievance.STATUS_LABEL[a.status] || a.status,
    priority: a.priority || 'MEDIUM',
    targetRoleLabel: a.targetRole ? (APPEAL_ROLE_LABEL[a.targetRole] || a.targetRole) : null,
    targetUserName: a.targetRole === 'TEACHER' && a.targetUserId ? (teacherMap[a.targetUserId] || null) : null,
  };
}

router.get('/appeals', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const appeals = await prisma.studentAppeal.findMany({
    where: { studentId, isDeleted: false },
    orderBy: { createdAt: 'desc' },
  });
  // Lazily backfill immutable public case codes for legacy rows.
  for (const a of appeals) {
    if (!a.caseCode) a.caseCode = await grievance.ensureCaseCode(a);
  }
  // Resolve the chosen teacher's display name for tracking (best-effort).
  const teacherIds = [...new Set(appeals.filter((a) => a.targetRole === 'TEACHER' && a.targetUserId).map((a) => a.targetUserId))];
  let teacherMap = {};
  if (teacherIds.length) {
    const teachers = await prisma.lmsUser.findMany({
      where: { id: { in: teacherIds } },
      include: { profile: { select: { fullName: true } } },
    });
    teacherMap = Object.fromEntries(teachers.map((t) => [t.id, t.profile?.fullName || t.username]));
  }
  const enriched = appeals.map((a) => shapeStudentCase(a, teacherMap));
  res.json({ appeals: enriched });
}));

// Configurable category catalog + case types + priorities (drives the
// Submit New Case form).
router.get('/appeals/categories', asyncHandler(async (req, res) => {
  res.json({
    caseTypes: grievance.CASE_TYPES.map((v) => ({ value: v, label: grievance.CASE_TYPE_LABEL[v] })),
    categories: grievance.CATEGORY_CATALOG,
    priorities: grievance.PRIORITIES,
  });
}));

// Student dashboard metrics (Section 8).
router.get('/appeals/stats', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const rows = await prisma.studentAppeal.findMany({
    where: { studentId, isDeleted: false },
    select: { status: true, caseType: true, updatedAt: true },
  });
  const count = (fn) => rows.filter(fn).length;
  res.json({
    total: rows.length,
    open: count((r) => r.status === 'OPEN'),
    inProgress: count((r) => ['IN_PROGRESS', 'IN_REVIEW', 'ASSIGNED', 'REOPENED'].includes(r.status)),
    awaiting: count((r) => r.status === 'AWAITING_STUDENT'),
    resolved: count((r) => r.status === 'RESOLVED'),
    closed: count((r) => r.status === 'CLOSED'),
    rejected: count((r) => r.status === 'REJECTED'),
    escalated: count((r) => r.status === 'ESCALATED'),
    appeals: count((r) => grievance.effectiveCaseType(r) === 'APPEAL'),
  });
}));

// Dynamic recipient options for the case form: available roles + the
// list of teachers CURRENTLY teaching this student (Teacher dropdown).
// Extended with QEC Coordinator + Finance so the full portal routing is
// available; the legacy roles are unchanged.
router.get('/appeals/recipients', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const base = await appealRouting.appealRecipients(studentId);
  // Additive routing targets (QEC / Finance) resolved via the grievance helper.
  const [qec, finance] = await Promise.all([
    grievance.resolveRouteStaff('QEC_COORDINATOR', studentId),
    grievance.resolveRouteStaff('FINANCE', studentId),
  ]);
  const roles = [...base.roles];
  // Update the EXAM_CONTROLLER label to "Exam Coordinator" for consistency.
  for (const r of roles) if (r.value === 'EXAM_CONTROLLER') r.label = 'Exam Coordinator';
  roles.push({ value: 'QEC_COORDINATOR', label: 'QEC Coordinator', available: qec.length > 0 });
  roles.push({ value: 'FINANCE', label: 'Finance', available: finance.length > 0 });
  res.json({ roles, teachers: base.teachers });
}));

router.post('/appeals', uploadLmsSubmission.single('file'), validate([
  body('subject').isString().isLength({ min: 2 }).withMessage('subject is required'),
  body('description').isString().isLength({ min: 2 }).withMessage('description is required'),
]), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const { type, subject, description, offeringId } = req.body;

  // --- Support & Grievances metadata (all additive / optional) ---
  const caseType = req.body.caseType ? String(req.body.caseType).toUpperCase() : null;
  const validCaseType = grievance.CASE_TYPES.includes(caseType) ? caseType : null;
  const category = req.body.category ? String(req.body.category) : null;
  const priority = grievance.normalisePriority(req.body.priority);

  // --- Optional context auto-attached from an LMS page ("Report an Issue") ---
  const ctx = {
    contextType: req.body.contextType || null,
    contextLabel: req.body.contextLabel || null,
    courseCode: req.body.courseCode || null,
    assignmentId: req.body.assignmentId ? parseInt(req.body.assignmentId, 10) : null,
    submissionId: req.body.submissionId ? parseInt(req.body.submissionId, 10) : null,
    quizId: req.body.quizId ? parseInt(req.body.quizId, 10) : null,
    examId: req.body.examId ? parseInt(req.body.examId, 10) : null,
    resultId: req.body.resultId ? parseInt(req.body.resultId, 10) : null,
  };

  // --- Routing: explicit recipient OR default routing from category ---
  let targetRole = req.body.targetRole ? String(req.body.targetRole).toUpperCase() : null;
  let targetUserId = req.body.targetTeacherId || req.body.targetUserId || null;
  if (!targetRole && (validCaseType || category)) {
    targetRole = grievance.defaultRouteRole(validCaseType, category);
  }
  let recipientIds = [];

  if (targetRole) {
    if (!APPEAL_ROLE_LABEL[targetRole]) throw httpError(400, 'Invalid recipient role');
    if (targetRole === 'TEACHER') {
      if (!targetUserId) throw httpError(400, 'Please select a teacher');
      const teacher = await appealRouting.validateTeacherTarget(studentId, String(targetUserId));
      if (!teacher) throw httpError(400, 'Selected teacher is not currently teaching you');
      recipientIds = [teacher.id];
    } else {
      targetUserId = null;
      const staff = await grievance.resolveRouteStaff(targetRole, studentId);
      if (!staff.length) throw httpError(400, `No ${APPEAL_ROLE_LABEL[targetRole]} is available to receive this case`);
      recipientIds = staff.map((s) => s.id);
    }
  }

  const now = new Date();
  const caseCode = await grievance.nextCaseCode(now);
  const appeal = await prisma.studentAppeal.create({
    data: {
      studentId,
      type: type || 'GENERAL',
      subject: String(subject).slice(0, 200),
      description: String(description).slice(0, 4000),
      offeringId: offeringId ? parseInt(offeringId, 10) : null,
      targetRole,
      targetUserId,
      filePath: req.file ? `/uploads/lms-submissions/${req.file.filename}` : null,
      fileName: req.file ? req.file.originalname : null,
      status: 'OPEN',
      // Support & Grievances fields.
      caseCode,
      caseType: validCaseType,
      category,
      priority,
      slaDueAt: grievance.slaDueFrom(priority, now),
      ...ctx,
    },
  });

  // Case-scoped timeline entry.
  await grievance.logHistory(appeal.id, {
    actorId: studentId, actorRole: 'Student', action: 'CREATE',
    toValue: 'OPEN', note: `Case submitted (${grievance.CASE_TYPE_LABEL[validCaseType || 'APPEAL']})`,
  });

  // Notify ONLY the routed recipient(s) — in real time.
  if (recipientIds.length) {
    const studentName = req.lmsUser.username;
    const typeLabel = grievance.CASE_TYPE_LABEL[validCaseType || 'APPEAL'];
    await notifyMany(recipientIds, {
      title: `New ${typeLabel.toLowerCase()}`,
      message: `${studentName} submitted a ${typeLabel.toLowerCase()}: "${appeal.subject}" (${caseCode})`,
      type: 'APPEAL',
      link: appealRouting.APPEAL_ROLES && appealRouting.APPEAL_ROLES[targetRole] === 'Teacher' ? '/teacher/appeals' : undefined,
    });
    try { realtime.emitTo(recipientIds, 'appeal:new', { id: appeal.id, subject: appeal.subject }); } catch (_) { /* noop */ }
  }

  await audit(req, 'GRIEVANCE_CREATE', 'StudentAppeal', appeal.id, { after: { caseCode, caseType: validCaseType, category, priority, subject: appeal.subject, targetRole, targetUserId } });
  res.status(201).json({ appeal: shapeStudentCase(appeal) });
}));

// ------------------------------------------------------------
// Full case view for the student (owner only) — includes the
// conversation thread and the case-scoped timeline. Internal notes
// are NEVER returned here (staff-only).
// ------------------------------------------------------------
router.get('/appeals/:id', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Case not found');
  // Object-level ownership check (IDOR protection).
  if (appeal.studentId !== studentId) throw httpError(403, 'You do not have access to this case');
  if (!appeal.caseCode) appeal.caseCode = await grievance.ensureCaseCode(appeal);

  const [messages, history] = await Promise.all([
    prisma.grievanceMessage.findMany({ where: { appealId: id }, orderBy: { createdAt: 'asc' } }),
    prisma.grievanceStatusHistory.findMany({ where: { appealId: id }, orderBy: { createdAt: 'asc' } }),
  ]);
  // Mark staff→student messages as read by the student.
  await prisma.grievanceMessage.updateMany({ where: { appealId: id, senderRole: { not: 'Student' }, isReadByStudent: false }, data: { isReadByStudent: true } }).catch(() => {});

  res.json({
    appeal: shapeStudentCase(appeal),
    messages: messages.map((m) => ({ id: m.id, senderRole: m.senderRole, mine: m.senderId === studentId, body: m.body, fileName: m.fileName, filePath: m.filePath, createdAt: m.createdAt })),
    history: history.map((h) => ({ id: h.id, action: h.action, actorRole: h.actorRole, fromValue: h.fromValue, toValue: h.toValue, note: h.note, createdAt: h.createdAt })),
  });
}));

// Add a reply to the case conversation (student side).
router.post('/appeals/:id/reply', uploadLmsSubmission.single('file'), validate([
  body('body').isString().isLength({ min: 1 }).withMessage('message is required'),
]), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Case not found');
  if (appeal.studentId !== studentId) throw httpError(403, 'You do not have access to this case');

  const msg = await prisma.grievanceMessage.create({
    data: {
      appealId: id,
      senderId: studentId,
      senderRole: 'Student',
      body: String(req.body.body).slice(0, 4000),
      filePath: req.file ? `/uploads/lms-submissions/${req.file.filename}` : null,
      fileName: req.file ? req.file.originalname : null,
      isReadByStudent: true,
    },
  });
  // Bump updatedAt so staff queues surface the activity.
  await prisma.studentAppeal.update({ where: { id }, data: { updatedAt: new Date() } });

  // Notify the assigned staff / routed recipients.
  let recipientIds = [];
  if (appeal.assignedUserId) recipientIds = [appeal.assignedUserId];
  else if (appeal.targetRole) {
    const staff = await grievance.resolveRouteStaff(appeal.targetRole, studentId, appeal.targetUserId);
    recipientIds = staff.map((s) => s.id);
  }
  if (recipientIds.length) {
    await notifyMany(recipientIds, { title: 'New reply on a case', message: `${req.lmsUser.username} replied to "${appeal.subject}" (${grievance.displayCode(appeal)})`, type: 'APPEAL' });
  }
  await audit(req, 'GRIEVANCE_REPLY', 'StudentAppeal', id, { after: { messageId: msg.id } });
  res.status(201).json({ message: { id: msg.id, senderRole: 'Student', mine: true, body: msg.body, fileName: msg.fileName, createdAt: msg.createdAt } });
}));

// Reopen an eligible resolved / closed / rejected case.
router.post('/appeals/:id/reopen', validate([
  body('reason').optional().isString(),
]), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Case not found');
  if (appeal.studentId !== studentId) throw httpError(403, 'You do not have access to this case');
  if (!grievance.REOPENABLE.has(appeal.status)) throw httpError(400, 'This case cannot be reopened in its current state');

  const updated = await prisma.studentAppeal.update({ where: { id }, data: { status: 'REOPENED', handledAt: null } });
  await grievance.logHistory(id, { actorId: studentId, actorRole: 'Student', action: 'REOPEN', fromValue: appeal.status, toValue: 'REOPENED', note: req.body.reason || null });

  // Notify staff.
  let recipientIds = [];
  if (appeal.assignedUserId) recipientIds = [appeal.assignedUserId];
  else if (appeal.targetRole) {
    const staff = await grievance.resolveRouteStaff(appeal.targetRole, studentId, appeal.targetUserId);
    recipientIds = staff.map((s) => s.id);
  }
  if (recipientIds.length) {
    await notifyMany(recipientIds, { title: 'Case reopened', message: `${req.lmsUser.username} reopened "${appeal.subject}" (${grievance.displayCode(appeal)})`, type: 'APPEAL' });
  }
  await audit(req, 'GRIEVANCE_REOPEN', 'StudentAppeal', id, { before: { status: appeal.status }, after: { status: 'REOPENED' } });
  res.json({ appeal: shapeStudentCase(updated) });
}));

// Submit satisfaction feedback after resolution / closure (Section 22).
router.post('/appeals/:id/feedback', validate([
  body('resolved').isBoolean().withMessage('resolved (yes/no) is required'),
  body('rating').optional().isInt({ min: 1, max: 5 }),
  body('comment').optional().isString(),
]), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const appeal = await prisma.studentAppeal.findUnique({ where: { id } });
  if (!appeal || appeal.isDeleted) throw httpError(404, 'Case not found');
  if (appeal.studentId !== studentId) throw httpError(403, 'You do not have access to this case');

  const resolved = req.body.resolved === true || req.body.resolved === 'true';
  const rating = req.body.rating ? parseInt(req.body.rating, 10) : null;
  const data = {
    feedbackResolved: resolved,
    feedbackRating: rating,
    feedbackComment: req.body.comment ? String(req.body.comment).slice(0, 2000) : null,
    feedbackAt: new Date(),
  };
  // If the student says it was NOT resolved, reopen for further work.
  if (!resolved && grievance.REOPENABLE.has(appeal.status)) data.status = 'REOPENED';
  const updated = await prisma.studentAppeal.update({ where: { id }, data });
  await grievance.logHistory(id, { actorId: studentId, actorRole: 'Student', action: 'FEEDBACK', toValue: resolved ? 'RESOLVED_CONFIRMED' : 'NOT_RESOLVED', note: rating ? `Rating: ${rating}/5` : null });
  await audit(req, 'GRIEVANCE_FEEDBACK', 'StudentAppeal', id, { after: { resolved, rating } });
  res.json({ appeal: shapeStudentCase(updated) });
}));

// ============================================================
// SURVEYS / FEEDBACK FORMS — list available + submit responses
// ============================================================
router.get('/surveys', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const offeringIds = await myOfferingIds(studentId);
  const now = new Date();
  const surveys = await prisma.survey.findMany({
    where: {
      isDeleted: false, isActive: true,
      audience: { in: ['STUDENTS', 'ALL'] },
      OR: [{ offeringId: null }, { offeringId: { in: offeringIds } }],
    },
    include: {
      questions: { orderBy: { order: 'asc' } },
      responses: { where: { studentId }, select: { id: true, submittedAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  // Resolve course info for offering-scoped surveys.
  const offIds = [...new Set(surveys.map((s) => s.offeringId).filter(Boolean))];
  const offs = offIds.length
    ? await prisma.courseOffering.findMany({ where: { id: { in: offIds } }, include: { course: true } })
    : [];
  const offMap = {};
  for (const o of offs) offMap[o.id] = o.course;
  res.json({ surveys: surveys.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    type: s.type,
    isAnonymous: s.isAnonymous,
    opensAt: s.opensAt,
    closesAt: s.closesAt,
    open: (!s.opensAt || now >= new Date(s.opensAt)) && (!s.closesAt || now <= new Date(s.closesAt)),
    courseCode: s.offeringId && offMap[s.offeringId] ? offMap[s.offeringId].code : null,
    courseTitle: s.offeringId && offMap[s.offeringId] ? offMap[s.offeringId].title : null,
    questions: s.questions.map((q) => ({ id: q.id, text: q.text, type: q.type, options: safeJson(q.optionsJson, []), required: q.required })),
    completed: s.responses.length > 0,
    submittedAt: s.responses[0] ? s.responses[0].submittedAt : null,
  })) });
}));

router.post('/surveys/:id/submit', validate([
  body('answers').exists().withMessage('answers is required'),
]), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const survey = await prisma.survey.findFirst({ where: { id, isDeleted: false, isActive: true }, include: { questions: true } });
  if (!survey) throw httpError(404, 'Survey not found');
  const now = new Date();
  if (survey.opensAt && now < new Date(survey.opensAt)) throw httpError(400, 'Survey has not opened yet');
  if (survey.closesAt && now > new Date(survey.closesAt)) throw httpError(400, 'Survey has closed');
  const existing = await prisma.surveyResponse.findUnique({ where: { surveyId_studentId: { surveyId: id, studentId } } });
  if (existing) throw httpError(409, 'You have already responded to this survey');
  const answers = typeof req.body.answers === 'string' ? safeJson(req.body.answers, {}) : (req.body.answers || {});
  // Validate required
  for (const q of survey.questions) {
    if (q.required && (answers[q.id] === undefined || answers[q.id] === '' || answers[q.id] === null)) {
      throw httpError(400, `Please answer: ${q.text}`);
    }
  }
  const response = await prisma.surveyResponse.create({
    data: { surveyId: id, studentId, answersJson: JSON.stringify(answers) },
  });
  await audit(req, 'SURVEY_SUBMIT', 'SurveyResponse', response.id, { after: { surveyId: id } });
  res.status(201).json({ success: true, responseId: response.id });
}));

// ============================================================
// FEES / ACCOUNT BOOK — challans + payment status
// ============================================================
router.get('/fees', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const challans = await prisma.lmsFeeChallan.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  });

  // Req #2.3 — the Account Book must ALSO show the admission-time application
  // fee (paid during admissions) so the student sees their COMPLETE fee
  // history. This is READ-ONLY: it reads admissions records via the
  // Enrollment→User→Application link and NEVER writes to the Admission System.
  // Rendered as a synthetic, already-PAID entry so it appears alongside LMS
  // challans without a "Pay Now" action.
  const admissionEntries = await resolveAdmissionFeeEntries(studentId).catch(() => []);

  // Map DB challans to the response shape.
  const challanEntries = challans.map((c) => ({
    id: c.id, challanNo: c.challanNo, title: c.title,
    lineItems: safeJson(c.lineItems, []), totalAmount: c.totalAmount,
    dueDate: c.dueDate, status: c.status, paidAt: c.paidAt, paymentRef: c.paymentRef,
    createdAt: c.createdAt, source: 'lms',
  }));

  // Admission fees first (oldest history), then LMS challans (newest first).
  const allEntries = [...admissionEntries, ...challanEntries];

  const summary = allEntries.reduce((acc, c) => {
    acc.total += c.totalAmount;
    if (c.status === 'PAID') acc.paid += c.totalAmount;
    else if (c.status !== 'WAIVED') acc.outstanding += c.totalAmount;
    return acc;
  }, { total: 0, paid: 0, outstanding: 0 });

  res.json({ challans: allEntries, summary });
}));

// PAY a fee challan directly from the Account Book (online payment).
// Marks the challan PAID in real time so Provost & student records update
// immediately. Additive — does not alter the existing /fees GET behaviour.
router.post('/fees/:id/pay', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  // Admission-time fees are read-only synthetic entries (non-numeric ids like
  // "adm-proc-1") sourced from the Admission System — they are already paid and
  // can never be paid/altered from the LMS.
  if (!Number.isInteger(id)) throw httpError(400, 'This fee cannot be paid from the LMS.');
  const challan = await prisma.lmsFeeChallan.findFirst({ where: { id, studentId } });
  if (!challan) throw httpError(404, 'Fee challan not found');
  if (challan.status === 'PAID') throw httpError(409, 'This fee has already been paid.');

  const method = (req.body && req.body.method) ? String(req.body.method) : 'OneLink';
  const paymentRef = `PAY-${Date.now().toString().slice(-8)}-${id}`;
  const updated = await prisma.lmsFeeChallan.update({
    where: { id },
    data: { status: 'PAID', paidAt: new Date(), paymentRef },
  });

  // Req #2.3 — reflect the paid/remaining status change in REAL TIME so the
  // student's Account Book (and any live finance views) update immediately.
  try {
    realtime.emitTo([studentId], 'fee:paid', {
      id: updated.id, challanNo: updated.challanNo, status: updated.status,
      paidAt: updated.paidAt, paymentRef: updated.paymentRef,
    });
  } catch (_) { /* non-blocking */ }

  res.json({
    success: true,
    challan: {
      id: updated.id, challanNo: updated.challanNo, status: updated.status,
      paidAt: updated.paidAt, paymentRef: updated.paymentRef, method,
    },
  });
}));

// ============================================================
// NOTIFICATIONS — in-app notifications + unread count + mark read
// ============================================================
router.get('/notifications', asyncHandler(async (req, res) => {
  const userId = req.lmsUser.id;
  const [items, unread] = await Promise.all([
    prisma.lmsNotification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.lmsNotification.count({ where: { userId, isRead: false } }),
  ]);
  res.json({ notifications: items, unread });
}));

router.put('/notifications/:id/read', asyncHandler(async (req, res) => {
  const userId = req.lmsUser.id;
  const id = parseInt(req.params.id, 10);
  const n = await prisma.lmsNotification.findFirst({ where: { id, userId } });
  if (!n) throw httpError(404, 'Notification not found');
  await prisma.lmsNotification.update({ where: { id }, data: { isRead: true } });
  res.json({ success: true });
}));

router.put('/notifications/read-all', asyncHandler(async (req, res) => {
  const userId = req.lmsUser.id;
  await prisma.lmsNotification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  res.json({ success: true });
}));

// ============================================================
// SETTINGS — notification preferences + theme/language + password
// ============================================================
router.get('/settings', asyncHandler(async (req, res) => {
  const userId = req.lmsUser.id;
  let prefs = await prisma.notificationPref.findUnique({ where: { studentId: userId } });
  if (!prefs) prefs = await prisma.notificationPref.create({ data: { studentId: userId } });
  res.json({ settings: prefs });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const userId = req.lmsUser.id;
  const allowed = ['emailEnabled', 'pushEnabled', 'assignmentAlerts', 'quizAlerts', 'resultAlerts', 'announcementAlerts', 'language', 'theme'];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];
  const prefs = await prisma.notificationPref.upsert({
    where: { studentId: userId },
    update: data,
    create: { studentId: userId, ...data },
  });
  res.json({ settings: prefs });
}));

// ------------------------------------------------------------
// CHANGE PASSWORD — student updates their own password.
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
  // Keep the Admissions transition flags in sync (student linked by roll number),
  // mirroring the behaviour of the first-login change-password flow. Non-fatal.
  if (full.linkedRollNumber) {
    try {
      await prisma.enrollment.updateMany({
        where: { rollNumber: full.linkedRollNumber },
        data: { lmsPasswordChanged: true, lmsMustChangePassword: false, lmsPassword: null },
      });
    } catch (_) { /* ignore */ }
  }
  await audit(req, 'PASSWORD_CHANGE', 'LmsUser', req.lmsUser.id, {});
  res.json({ message: 'Password changed successfully' });
}));

// ============================================================
// ACTIVITY TIMELINE — derived from the student's real actions
// (submissions, quiz attempts, registrations, results, appeals).
// ============================================================
// ============================================================
// ACTIVITY TIMELINE (Requirement #7) — real-time, searchable,
// filterable. Merges logged StudentActivity events (login, logout,
// live-class participation, course access, announcement views,
// AI Tutor usage, etc.) with derived academic events (submissions,
// quiz attempts, registrations, results, appeals).
//
// Query params:
//   type   — filter by activity type (e.g. LOGIN, AI_TUTOR, ...)
//   q      — free-text search across title/description/course
//   from   — ISO date (inclusive lower bound)
//   to     — ISO date (inclusive upper bound)
//   limit  — max rows (default 100, max 300)
// ============================================================
const ACTIVITY_ICON = {
  LOGIN: 'LogIn', LOGOUT: 'LogOut', ASSIGNMENT_SUBMIT: 'Upload', SUBMISSION: 'Upload',
  QUIZ_ATTEMPT: 'FileQuestion', QUIZ: 'FileQuestion', ATTENDANCE: 'UserCheck',
  LIVE_CLASS: 'Radio', COURSE_ACCESS: 'BookOpen', REGISTRATION: 'BookOpen',
  ANNOUNCEMENT_VIEW: 'Megaphone', AI_TUTOR: 'Bot', RESULT: 'Award',
  APPEAL: 'FileText', OTHER: 'Activity',
};

router.get('/activity', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const typeFilter = (req.query.type || '').toString().trim().toUpperCase();
  const q = (req.query.q || '').toString().trim().toLowerCase();
  const fromStr = (req.query.from || '').toString().trim();
  const toStr = (req.query.to || '').toString().trim();
  const limit = Math.min(300, Math.max(1, parseInt(req.query.limit, 10) || 100));

  const from = fromStr ? new Date(fromStr) : null;
  const to = toStr ? new Date(`${toStr}T23:59:59.999Z`) : null;

  const [logged, subs, attempts, regs, results, appeals] = await Promise.all([
    prisma.studentActivity.findMany({
      where: {
        studentId,
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: { createdAt: 'desc' }, take: 300,
    }),
    prisma.assignmentSubmission.findMany({
      where: { studentId },
      include: { assignment: { include: { offering: { include: { course: true } } } } },
      orderBy: { submittedAt: 'desc' }, take: 50,
    }),
    prisma.quizAttempt.findMany({
      where: { studentId, submittedAt: { not: null } },
      include: { quiz: { include: { offering: { include: { course: true } } } } },
      orderBy: { submittedAt: 'desc' }, take: 50,
    }),
    prisma.courseRegistration.findMany({
      where: { studentId },
      include: { offering: { include: { course: true } } },
      orderBy: { registeredAt: 'desc' }, take: 50,
    }),
    prisma.courseResult.findMany({
      where: { studentId, status: 'PUBLISHED' },
      include: { offering: { include: { course: true } } },
      orderBy: { publishedAt: 'desc' }, take: 50,
    }),
    prisma.studentAppeal.findMany({ where: { studentId, isDeleted: false }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);

  const timeline = [];
  // Logged real-time activities (primary source).
  for (const a of logged) {
    timeline.push({
      id: `act-${a.id}`,
      type: a.type,
      icon: ACTIVITY_ICON[a.type] || 'Activity',
      title: a.title,
      description: a.description || null,
      course: a.courseCode || null,
      courseTitle: a.courseTitle || null,
      at: a.createdAt,
      meta: a.metadata ? safeJson(a.metadata) : null,
      source: 'LOGGED',
    });
  }
  // Derived academic events (kept for completeness / historical data).
  for (const s of subs) timeline.push({ id: `sub-${s.id}`, type: 'ASSIGNMENT_SUBMIT', icon: 'Upload', title: `Submitted "${s.assignment.title}"`, course: s.assignment.offering.course.code, at: s.submittedAt, meta: { status: s.status, marks: s.marks }, source: 'DERIVED' });
  for (const a of attempts) timeline.push({ id: `qz-${a.id}`, type: 'QUIZ_ATTEMPT', icon: 'FileQuestion', title: `Attempted quiz "${a.quiz.title}"`, course: a.quiz.offering.course.code, at: a.submittedAt, meta: { score: a.score, maxScore: a.maxScore }, source: 'DERIVED' });
  for (const r of regs) timeline.push({ id: `reg-${r.id}`, type: 'COURSE_ACCESS', icon: 'BookOpen', title: `Enrolled in ${r.offering.course.code}`, course: r.offering.course.code, at: r.registeredAt, meta: { status: r.status }, source: 'DERIVED' });
  for (const r of results) timeline.push({ id: `res-${r.id}`, type: 'RESULT', icon: 'Award', title: `Result published for ${r.offering.course.code}`, course: r.offering.course.code, at: r.publishedAt, meta: { grade: r.letterGrade, percent: r.totalPercent }, source: 'DERIVED' });
  for (const ap of appeals) timeline.push({ id: `ap-${ap.id}`, type: 'OTHER', icon: 'FileText', title: `Raised request: ${ap.subject}`, at: ap.createdAt, meta: { status: ap.status }, source: 'DERIVED' });

  // Apply date filter to derived rows too.
  let rows = timeline.filter((t) => t.at != null);
  if (from) rows = rows.filter((t) => new Date(t.at) >= from);
  if (to) rows = rows.filter((t) => new Date(t.at) <= to);
  // Type filter.
  if (typeFilter) rows = rows.filter((t) => (t.type || '').toUpperCase() === typeFilter);
  // Free-text search.
  if (q) {
    rows = rows.filter((t) =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.course || '').toLowerCase().includes(q) ||
      (t.courseTitle || '').toLowerCase().includes(q),
    );
  }

  rows.sort((x, y) => new Date(y.at) - new Date(x.at));

  // Build the set of available types for the filter UI.
  const typeCounts = {};
  for (const t of rows) typeCounts[t.type] = (typeCounts[t.type] || 0) + 1;

  res.json({ timeline: rows.slice(0, limit), total: rows.length, typeCounts });
}));

// ============================================================
// BADGES / ACHIEVEMENTS — derived from real performance
// ============================================================
router.get('/badges', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const [results, attendanceCourses, subs, attempts] = await Promise.all([
    prisma.courseResult.findMany({ where: { studentId, status: 'PUBLISHED' } }),
    (async () => {
      const ids = await myOfferingIds(studentId);
      let attended = 0; let marked = 0;
      for (const oid of ids) {
        // eslint-disable-next-line no-await-in-loop
        const s = await academic.attendanceSummary(oid, studentId);
        attended += s.attended; marked += s.marked;
      }
      return marked > 0 ? (attended / marked) * 100 : 0;
    })(),
    prisma.assignmentSubmission.count({ where: { studentId } }),
    prisma.quizAttempt.count({ where: { studentId, status: { in: ['SUBMITTED', 'GRADED'] } } }),
  ]);
  const transcript = await academic.studentTranscript(studentId);
  const aPlus = results.filter((r) => (r.letterGrade || '').startsWith('A')).length;
  const badges = [
    { id: 'first-steps', name: 'First Steps', description: 'Registered for your first course', icon: 'BookOpen', earned: true, tier: 'bronze' },
    { id: 'submitter', name: 'Diligent Submitter', description: 'Submitted 1+ assignment', icon: 'Upload', earned: subs >= 1, tier: 'bronze' },
    { id: 'quiz-taker', name: 'Quiz Taker', description: 'Attempted 1+ quiz', icon: 'FileQuestion', earned: attempts >= 1, tier: 'bronze' },
    { id: 'attendance-star', name: 'Attendance Star', description: '90%+ overall attendance', icon: 'UserCheck', earned: attendanceCourses >= 90, tier: 'silver' },
    { id: 'high-achiever', name: 'High Achiever', description: 'Earned an A grade', icon: 'Award', earned: aPlus >= 1, tier: 'gold' },
    { id: 'deans-list', name: "Dean's List", description: 'CGPA 3.7 or above', icon: 'Crown', earned: transcript.cgpa >= 3.7, tier: 'gold' },
  ];
  res.json({
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
    totalCount: badges.length,
    cgpa: transcript.cgpa,
    aGrades: aPlus,
  });
}));

// ============================================================
// AI INSIGHTS — real performance analytics (no external AI;
// computed from the student's actual marks/attendance/results).
// ============================================================
router.get('/insights', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const transcript = await academic.studentTranscript(studentId);
  const offeringIds = await myOfferingIds(studentId);

  // Per-course performance
  const courseStats = [];
  for (const oid of offeringIds) {
    // eslint-disable-next-line no-await-in-loop
    const att = await academic.attendanceSummary(oid, studentId);
    // eslint-disable-next-line no-await-in-loop
    const result = await prisma.courseResult.findUnique({
      where: { offeringId_studentId: { offeringId: oid, studentId } },
      include: { offering: { include: { course: true } } },
    });
    // eslint-disable-next-line no-await-in-loop
    const offering = await prisma.courseOffering.findUnique({ where: { id: oid }, include: { course: true } });
    courseStats.push({
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
      attendance: att.percentage,
      percent: result && result.status === 'PUBLISHED' ? result.totalPercent : null,
      grade: result && result.status === 'PUBLISHED' ? result.letterGrade : null,
    });
  }

  // Risk detection (low attendance / low marks)
  const recommendations = [];
  for (const c of courseStats) {
    if (c.attendance < 75) recommendations.push({ priority: 'high', course: c.courseCode, message: `Attendance is ${c.attendance}% in ${c.courseCode} — below the 75% requirement. Attend upcoming classes.` });
    if (c.percent != null && c.percent < 50) recommendations.push({ priority: 'high', course: c.courseCode, message: `Your score in ${c.courseCode} is ${c.percent}%. Consider revisiting course materials and reaching out to your teacher.` });
  }
  if (recommendations.length === 0) recommendations.push({ priority: 'low', message: 'You are on track across all courses. Keep up the good work!' });

  // GPA trend across terms
  const gpaTrend = transcript.terms.map((t) => ({ term: t.termTitle, gpa: t.gpa }));

  res.json({
    cgpa: transcript.cgpa,
    totalCredits: transcript.totalCredits,
    courseStats,
    gpaTrend,
    recommendations,
    avgAttendance: courseStats.length ? Math.round(courseStats.reduce((a, c) => a + c.attendance, 0) / courseStats.length) : 0,
  });
}));

// ============================================================
// MESSAGES — direct messaging with the student's teachers
// ============================================================
// Upload a message attachment.
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

// Contacts: teachers of the student's registered offerings + course groups.
router.get('/messages/contacts', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;

  // Auto-create / sync course groups for the student's enrolled courses so
  // groups always reflect current enrollment (no teacher login required).
  // Students do NOT message teachers directly — course groups are the only
  // channel, and each group auto-includes the teacher + enrolled students.
  await courseGroups.syncGroupsForStudent(studentId);

  // Direct teacher messaging is disabled by policy. Contacts list is empty.
  const contacts = [];

  // Course groups the student is a member of.
  const memberships = await prisma.lmsMessageGroupMember.findMany({
    where: { userId: studentId },
    include: { group: true },
  });
  // Resolve course codes for the groups' offerings in one query.
  const grpOfferingIds = memberships.filter((m) => m.group).map((m) => m.group.offeringId);
  const grpOfferings = grpOfferingIds.length
    ? await prisma.courseOffering.findMany({ where: { id: { in: grpOfferingIds } }, include: { course: true } })
    : [];
  const grpOffMap = {}; for (const o of grpOfferings) grpOffMap[o.id] = o;
  const groups = [];
  for (const m of memberships) {
    if (!m.group) continue;
    const off = grpOffMap[m.group.offeringId];
    const memberCount = await prisma.lmsMessageGroupMember.count({ where: { groupId: m.groupId } });
    const unreadCount = await prisma.lmsThreadMessage.count({
      where: { groupId: m.groupId, id: { gt: m.lastReadMessageId }, senderId: { not: studentId } },
    });
    groups.push({
      id: m.group.id,
      name: m.group.name,
      courseCode: off && off.course ? off.course.code : null,
      memberCount,
      unread: unreadCount,
    });
  }

  res.json({ contacts, groups });
}));

// Group message thread.
router.get('/messages/group/:groupId', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const groupId = parseInt(req.params.groupId, 10);
  const member = await prisma.lmsMessageGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: studentId } },
  });
  if (!member) throw httpError(403, 'You are not a member of this group');
  const messages = await prisma.lmsThreadMessage.findMany({
    where: { groupId }, orderBy: { createdAt: 'asc' }, take: 300,
    include: { sender: { include: { profile: true } } },
  });
  const lastId = messages.length ? messages[messages.length - 1].id : member.lastReadMessageId;
  if (lastId > member.lastReadMessageId) {
    await prisma.lmsMessageGroupMember.update({ where: { id: member.id }, data: { lastReadMessageId: lastId } });
  }
  res.json({
    messages: messages.map((m) => ({
      id: m.id, body: m.body, mine: m.senderId === studentId, senderId: m.senderId,
      senderName: m.sender && m.sender.profile ? m.sender.profile.fullName : (m.sender ? m.sender.username : 'Unknown'),
      attachmentUrl: m.attachmentUrl, attachmentName: m.attachmentName, attachmentType: m.attachmentType,
      createdAt: m.createdAt,
    })),
  });
}));

// Post to a course group.
router.post('/messages/group/:groupId', validate([
  body('body').optional().isString(),
]), asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const groupId = parseInt(req.params.groupId, 10);
  const member = await prisma.lmsMessageGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: studentId } },
  });
  if (!member) throw httpError(403, 'You are not a member of this group');
  const bodyText = String(req.body.body || '').slice(0, 4000);
  if (!bodyText && !req.body.attachmentUrl) throw httpError(400, 'Message body or attachment required');
  const group = await prisma.lmsMessageGroup.findUnique({ where: { id: groupId } });
  const message = await prisma.lmsThreadMessage.create({
    data: {
      senderId: studentId, recipientId: null, groupId, body: bodyText,
      attachmentUrl: req.body.attachmentUrl || null,
      attachmentName: req.body.attachmentName || null,
      attachmentType: req.body.attachmentType || null,
    },
  });
  await prisma.lmsMessageGroupMember.update({ where: { id: member.id }, data: { lastReadMessageId: message.id } });
  const members = await prisma.lmsMessageGroupMember.findMany({ where: { groupId }, select: { userId: true } });
  const memberIds = members.map((m) => m.userId);
  const senderName = req.lmsUser.profile ? req.lmsUser.profile.fullName : req.lmsUser.username;
  realtime.emitTo(memberIds, 'message', {
    action: 'group', groupId, groupName: group ? group.name : null,
    message: { id: message.id, body: message.body, senderId: studentId, senderName, mine: false, attachmentUrl: message.attachmentUrl, attachmentName: message.attachmentName, attachmentType: message.attachmentType, createdAt: message.createdAt },
  });
  for (const uid of memberIds) {
    if (uid === studentId) continue;
    notify(uid, { title: `New message in ${group ? group.name : 'course group'}`, message: `${req.lmsUser.username}: ${bodyText.slice(0, 80)}`, type: 'MESSAGE' }).catch(() => {});
  }
  res.status(201).json({ message: { id: message.id, body: message.body, mine: true, attachmentUrl: message.attachmentUrl, attachmentName: message.attachmentName, attachmentType: message.attachmentType, createdAt: message.createdAt } });
}));

// Conversation with a specific user (both directions).
router.get('/messages/:userId', asyncHandler(async (req, res) => {
  // Direct (1-to-1) messaging to teachers is disabled. Students communicate
  // only through auto-created course groups.
  throw httpError(403, 'Direct messaging is disabled. Please use your course groups.');
  // eslint-disable-next-line no-unreachable
  const studentId = req.lmsUser.id;
  const otherId = req.params.userId;
  const messages = await prisma.lmsThreadMessage.findMany({
    where: {
      groupId: null,
      OR: [
        { senderId: studentId, recipientId: otherId },
        { senderId: otherId, recipientId: studentId },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  // Mark received as read + emit read receipt
  const unreadIds = messages.filter((m) => m.senderId === otherId && !m.isRead).map((m) => m.id);
  if (unreadIds.length) {
    await prisma.lmsThreadMessage.updateMany({ where: { id: { in: unreadIds } }, data: { isRead: true } });
    realtime.emitTo([otherId], 'message', { action: 'read', by: studentId });
  }
  res.json({
    messages: messages.map((m) => ({
      id: m.id, body: m.body, subject: m.subject, mine: m.senderId === studentId,
      attachmentUrl: m.attachmentUrl, attachmentName: m.attachmentName, attachmentType: m.attachmentType,
      createdAt: m.createdAt, isRead: m.isRead,
    })),
    online: realtime.isOnline(otherId),
  });
}));

// Send a message to a teacher (must teach one of the student's courses).
router.post('/messages/:userId', validate([
  body('body').optional().isString(),
]), asyncHandler(async (req, res) => {
  // Direct (1-to-1) messaging to teachers is disabled. Students communicate
  // only through auto-created course groups.
  throw httpError(403, 'Direct messaging is disabled. Please use your course groups.');
  // eslint-disable-next-line no-unreachable
  const studentId = req.lmsUser.id;
  const recipientId = req.params.userId;
  // Verify recipient teaches a course the student is registered in.
  const offeringIds = await myOfferingIds(studentId);
  const teaches = await prisma.courseOffering.findFirst({
    where: { id: { in: offeringIds }, teacherId: recipientId },
  });
  if (!teaches) throw httpError(403, 'You can only message your course teachers');
  const bodyText = String(req.body.body || '').slice(0, 4000);
  if (!bodyText && !req.body.attachmentUrl) throw httpError(400, 'Message body or attachment required');
  const message = await prisma.lmsThreadMessage.create({
    data: {
      senderId: studentId, recipientId, subject: req.body.subject || null, body: bodyText,
      attachmentUrl: req.body.attachmentUrl || null,
      attachmentName: req.body.attachmentName || null,
      attachmentType: req.body.attachmentType || null,
    },
  });
  const payload = { id: message.id, body: message.body, mine: false, attachmentUrl: message.attachmentUrl, attachmentName: message.attachmentName, attachmentType: message.attachmentType, createdAt: message.createdAt };
  realtime.emitTo([recipientId, studentId], 'message', { action: 'direct', from: studentId, to: recipientId, message: payload });
  await notify(recipientId, { title: 'New message', message: `${req.lmsUser.username} sent you a message`, type: 'MESSAGE' });
  res.status(201).json({ message: { ...payload, mine: true } });
}));

// ============================================================
// STUDY SCHEME — program semester/course plan with student progress
// ============================================================
router.get('/scheme', asyncHandler(async (req, res) => {
  const studentId = req.lmsUser.id;
  const profile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: studentId } });
  // Find the LmsProgram by short form / name
  let program = null;
  if (profile) {
    program = await prisma.lmsProgram.findFirst({
      where: { OR: [{ shortForm: profile.programShortForm }, { name: profile.program }], isDeleted: false },
    });
  }
  if (!program) return res.json({ program: null, semesters: [] });

  const semesters = await prisma.lmsSemester.findMany({
    where: { programId: program.id, isDeleted: false },
    include: { courses: { where: { isDeleted: false } } },
    orderBy: { number: 'asc' },
  });

  // Student's results by course code for progress
  const results = await prisma.courseResult.findMany({
    where: { studentId, status: 'PUBLISHED' },
    include: { offering: { include: { course: true } } },
  });
  const passedByCode = {};
  for (const r of results) passedByCode[r.offering.course.code] = { grade: r.letterGrade, percent: r.totalPercent };
  // Currently registered courses
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId, status: 'ENROLLED' },
    include: { offering: { include: { course: true } } },
  });
  const inProgress = new Set(regs.map((r) => r.offering.course.code));

  res.json({
    program: { id: program.id, code: program.code, name: program.name, shortForm: program.shortForm, totalSemesters: program.totalSemesters },
    semesters: semesters.map((s) => ({
      number: s.number,
      title: s.title,
      courses: s.courses.map((c) => ({
        code: c.code, title: c.title, creditHours: c.creditHours,
        hasLab: c.hasLab === true,
        theoryCredit: c.theoryCredit != null ? c.theoryCredit : c.creditHours,
        labCredit: c.labCredit != null ? c.labCredit : 0,
        creditLabel: creditLabel(c),
        status: passedByCode[c.code] ? 'COMPLETED' : (inProgress.has(c.code) ? 'IN_PROGRESS' : 'PENDING'),
        grade: passedByCode[c.code] ? passedByCode[c.code].grade : null,
      })),
    })),
  });
}));

module.exports = router;

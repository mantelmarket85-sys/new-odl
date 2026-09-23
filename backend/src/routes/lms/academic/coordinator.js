// ============================================================
//  COURSE COORDINATOR ROUTES  — /api/lms/academic/coordinator/*
//  ------------------------------------------------------------
//  Phase 3 — Course Coordinator. Production-ready, fully DB-backed
//  academic-management APIs. RBAC: CourseCoordinator only (Provost
//  may also read via the shared structure routes). Every mutating
//  action writes an LmsAuditLog row and (where relevant) notifies the
//  affected user(s).
//
//  Modules: Dashboard · Course Management (allocation/mapping/
//  planning/curriculum/credit verify) · Teacher Management
//  (assignment/replacement/workload) · Academic Monitoring
//  (attendance/assignment/quiz/mid/final/grade/progress) · Result
//  Monitoring (marks/grade/GPA verify + approval) · Reports ·
//  Approvals · Communication (announcements/messages/threads) ·
//  Analytics · Escalation · Audit Trail · Alerts.
// ============================================================
const express = require('express');
const { body } = require('express-validator');
const prisma = require('../../../utils/prisma');
const { lmsAuth, lmsRequireRole } = require('../../../middleware/lmsAuth');
const { validate } = require('../../../middleware/validate');
const { asyncHandler, parseListQuery, paginated, httpError, safeJson } = require('../../../utils/lmsHelpers');
const { audit } = require('../../../utils/lmsAudit');
const { notify, notifyMany } = require('../../../utils/lmsNotify');
const { computeGPA, buildResultGrades } = require('../../../utils/lmsGrading');
const { displayName, nameMap, nextRole } = require('../../../utils/lmsWorkflow');
const { uploadPhoto } = require('../../../middleware/upload');
const { resolveDepartmentPrograms, resolveDepartmentInstructorIds } = require('../../../utils/lmsDeptScope');
const realtime = require('../../../utils/lmsRealtime');
const bcrypt = require('bcryptjs');
// BigBlueButton helper — the coordinator OWNS live-class scheduling (client
// requirement 2.1). When BBB is configured we pre-create the meeting so the
// attendee join URL is ready the moment the class is scheduled.
const bbb = require('../../../utils/bbb');

const router = express.Router();
router.use(lmsAuth);
// Coordinator-area guard. Provost is allowed read-only oversight where noted.
const COORD = lmsRequireRole('CourseCoordinator');
const COORD_OR_GOV = lmsRequireRole('CourseCoordinator', 'Provost', 'FocalPerson');

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function currentTerm() {
  return prisma.academicTerm.findFirst({ where: { isCurrent: true, isActive: true } });
}

/**
 * Resolve the set of programs a Course Coordinator may manage.
 *
 * DEPARTMENT ISOLATION (Critical Requirement — highest priority):
 *   A Course Coordinator must ONLY ever see programs, courses, schemes,
 *   students and reports for their OWN assigned department. Previously this
 *   function fell back to returning ALL programs when the coordinator had no
 *   department OR when a fuzzy name match failed — that leaked other
 *   departments (e.g. a Computer-Science coordinator seeing Electrical &
 *   Mathematics programs). Both insecure fallbacks are now removed.
 *
 *   The program set is resolved AUTHORITATIVELY via the shared dept-scope
 *   resolver (admissions Department → its Program codes → LmsPrograms, plus an
 *   exact department-name match), so it is robust against free-text
 *   department-name variations WITHOUT ever crossing department boundaries.
 *
 *   Secure default: a coordinator with no resolvable department sees NOTHING.
 *
 * Returns { programs, scopedDepartment }.
 */
async function resolveScopedPrograms(lmsUser, { include } = {}) {
  // Governance oversight roles (Provost / QEC / ExamController) are not
  // department-bound and keep university-wide visibility.
  if (['Provost', 'QECCoordinator', 'ExamController'].includes(lmsUser.role)) {
    const findOpts = { where: { isDeleted: false }, orderBy: { name: 'asc' } };
    if (include) findOpts.include = include;
    const programs = await prisma.lmsProgram.findMany(findOpts);
    return { programs, scopedDepartment: null };
  }

  const profile = await prisma.lmsStudentProfile
    .findUnique({ where: { lmsUserId: lmsUser.id } })
    .catch(() => null);
  const dept = profile && profile.department ? profile.department.trim() : '';

  // No department configured → SECURE DEFAULT: see nothing (strict isolation).
  if (!dept) {
    return { programs: [], scopedDepartment: null };
  }

  // Authoritative program set for this department.
  const { programs: scopedList } = await resolveDepartmentPrograms(dept);
  const scopedIds = scopedList.map((p) => p.id);
  if (!scopedIds.length) {
    return { programs: [], scopedDepartment: dept };
  }

  const findOpts = {
    where: { isDeleted: false, id: { in: scopedIds } },
    orderBy: { name: 'asc' },
  };
  if (include) findOpts.include = include;
  const programs = await prisma.lmsProgram.findMany(findOpts);
  return { programs, scopedDepartment: dept };
}

/**
 * Resolve the full department data scope for a Course Coordinator: the set of
 * program / course / offering / student / teacher ids that belong to their
 * OWN department. Governance roles (Provost / QEC / ExamController) get
 * { isGov:true } and are treated as unscoped by callers.
 *
 * This is the single source of truth used by every list/report endpoint so
 * NO cross-department data ever leaks. Secure default: an unbound coordinator
 * resolves to empty id sets (sees nothing).
 */
async function resolveCoordinatorScope(lmsUser) {
  if (['Provost', 'QECCoordinator', 'ExamController'].includes(lmsUser.role)) {
    return { isGov: true };
  }
  const { programs, scopedDepartment } = await resolveScopedPrograms(lmsUser);
  const programIds = programs.map((p) => p.id);
  const courses = programIds.length
    ? await prisma.lmsCourse.findMany({ where: { isDeleted: false, programId: { in: programIds } }, select: { id: true } })
    : [];
  const courseIds = courses.map((c) => c.id);
  const offerings = courseIds.length
    ? await prisma.courseOffering.findMany({ where: { courseId: { in: courseIds } }, select: { id: true, teacherId: true } })
    : [];
  const offeringIds = offerings.map((o) => o.id);
  const teacherIds = [...new Set(offerings.map((o) => o.teacherId).filter(Boolean))];
  const regs = offeringIds.length
    ? await prisma.courseRegistration.findMany({ where: { offeringId: { in: offeringIds } }, select: { studentId: true }, distinct: ['studentId'] })
    : [];
  const shortForms = programs.flatMap((p) => [p.shortForm, p.code]).filter(Boolean).map((s) => String(s).trim());
  const profs = (scopedDepartment || shortForms.length)
    ? await prisma.lmsStudentProfile.findMany({
        where: { OR: [ ...(scopedDepartment ? [{ department: scopedDepartment }] : []), ...(shortForms.length ? [{ programShortForm: { in: shortForms } }] : []) ] },
        select: { lmsUserId: true },
      })
    : [];
  const studentIds = [...new Set([...regs.map((r) => r.studentId), ...profs.map((p) => p.lmsUserId)])];
  return { isGov: false, scopedDepartment, department: scopedDepartment, programIds, courseIds, offeringIds, teacherIds, studentIds, shortForms };
}

/**
 * Resolve the INSTRUCTOR (Teacher) user-ids that belong to this coordinator's
 * OWN department. Broader than scope.teacherIds: matches teacher staff-profiles
 * by department name / program short-form AND includes anyone teaching a scoped
 * offering. Returns null for governance (no restriction). Returns [] when a
 * scoped coordinator has no department (secure default: sees no instructors).
 */
async function resolveCoordinatorInstructorIds(lmsUser) {
  const scope = await resolveCoordinatorScope(lmsUser);
  if (scope.isGov) return null;
  // resolveDepartmentInstructorIds expects a buildDeptScope-shaped object.
  return resolveDepartmentInstructorIds({
    unscoped: false,
    department: scope.scopedDepartment,
    shortForms: scope.shortForms || [],
    teacherIds: scope.teacherIds || [],
  });
}

/**
 * DEPARTMENT ISOLATION guard: a Course Coordinator may only create/edit/delete
 * a schedule slot / roster / section / assignment for a course offering that
 * belongs to THEIR OWN department. Governance roles are unrestricted.
 */
async function assertOfferingInScope(lmsUser, offeringId) {
  const scope = await resolveCoordinatorScope(lmsUser);
  if (scope.isGov) return;
  if (!scope.offeringIds.includes(offeringId)) {
    throw httpError(403, 'This course offering belongs to another department.');
  }
}

/**
 * The set of Teacher user-ids a coordinator may ASSIGN to their offerings:
 * their own-department instructors PLUS any instructor APPROVED to be borrowed
 * into their department via the cross-department instructor-request workflow
 * (InstructorLoanRequest, status APPROVED). Returns null for governance.
 */
async function resolveAssignableTeacherIds(lmsUser) {
  const ownIds = await resolveCoordinatorInstructorIds(lmsUser);
  if (ownIds === null) return null; // governance — unrestricted
  const scope = await resolveCoordinatorScope(lmsUser);
  const dept = scope.scopedDepartment;
  let borrowed = [];
  if (dept) {
    const loans = await prisma.instructorLoanRequest.findMany({
      where: { requestingDepartment: dept, status: 'APPROVED', approvedInstructorId: { not: null } },
      select: { approvedInstructorId: true },
    }).catch(() => []);
    borrowed = loans.map((l) => l.approvedInstructorId).filter(Boolean);
  }
  return [...new Set([...ownIds, ...borrowed])];
}

/** Throw 403 if teacherId is not assignable by this coordinator. */
async function assertTeacherAssignable(lmsUser, teacherId) {
  const ids = await resolveAssignableTeacherIds(lmsUser);
  if (ids === null) return; // governance
  if (!ids.includes(teacherId)) {
    throw httpError(403, 'You can only assign instructors from your own department (or an approved borrowed instructor).');
  }
}

/** Compute an offering's attendance % across all sessions/records. */
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

// ============================================================
// DASHBOARD
// ============================================================
router.get('/dashboard', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  // DEPARTMENT ISOLATION: resolve this coordinator's own department scope so
  // every dashboard counter reflects ONLY their department. Governance roles
  // (Provost / QEC / ExamController) remain university-wide.
  const { programs: scopedPrograms, scopedDepartment } = await resolveScopedPrograms(req.lmsUser);
  const isGov = ['Provost', 'QECCoordinator', 'ExamController'].includes(req.lmsUser.role);
  const scopedProgramIds = scopedPrograms.map((p) => p.id);
  // Course / offering / student id sets for this department.
  const scopedCourses = (!isGov)
    ? await prisma.lmsCourse.findMany({ where: { isDeleted: false, programId: { in: scopedProgramIds.length ? scopedProgramIds : [-1] } }, select: { id: true } })
    : [];
  const scopedCourseIds = scopedCourses.map((c) => c.id);
  const scopedOfferings = (!isGov)
    ? await prisma.courseOffering.findMany({ where: { courseId: { in: scopedCourseIds.length ? scopedCourseIds : [-1] } }, select: { id: true, teacherId: true } })
    : [];
  const scopedOfferingIds = scopedOfferings.map((o) => o.id);
  const scopedTeacherIds = [...new Set(scopedOfferings.map((o) => o.teacherId).filter(Boolean))];
  // Students in this department (via registrations in scoped offerings + profile dept).
  let scopedStudentIds = [];
  if (!isGov) {
    const regs = scopedOfferingIds.length
      ? await prisma.courseRegistration.findMany({ where: { offeringId: { in: scopedOfferingIds } }, select: { studentId: true }, distinct: ['studentId'] })
      : [];
    const shortForms = scopedPrograms.flatMap((p) => [p.shortForm, p.code]).filter(Boolean).map((s) => String(s).trim());
    const profs = (scopedDepartment || shortForms.length)
      ? await prisma.lmsStudentProfile.findMany({
          where: { OR: [ ...(scopedDepartment ? [{ department: scopedDepartment }] : []), ...(shortForms.length ? [{ programShortForm: { in: shortForms } }] : []) ] },
          select: { lmsUserId: true },
        })
      : [];
    scopedStudentIds = [...new Set([...regs.map((r) => r.studentId), ...profs.map((p) => p.lmsUserId)])];
  }

  // where-fragment builders (empty object = no restriction for governance).
  const progW   = isGov ? {} : { id: { in: scopedProgramIds.length ? scopedProgramIds : [-1] } };
  const courseW = isGov ? {} : { id: { in: scopedCourseIds.length ? scopedCourseIds : [-1] } };
  const offW    = isGov ? {} : { id: { in: scopedOfferingIds.length ? scopedOfferingIds : [-1] } };
  const teachW  = isGov ? {} : { id: { in: scopedTeacherIds.length ? scopedTeacherIds : ['__none__'] } };
  const studIdW = isGov ? {} : { id: { in: scopedStudentIds.length ? scopedStudentIds : ['__none__'] } };
  const regByOffW = isGov ? {} : { offeringId: { in: scopedOfferingIds.length ? scopedOfferingIds : [-1] } };
  const sectByOffW = isGov ? {} : { offeringId: { in: scopedOfferingIds.length ? scopedOfferingIds : [-1] } };

  const [
    totalPrograms, totalCourses, totalOfferings, totalSections,
    totalTeachers, totalStudents, totalRegistrations,
    pendingApprovals, openEscalations,
    draftResults, publishedResults,
    offerings,
    // --- Additional real-time counts (prompt: enriched dashboard) ---
    activeStudents, suspendedStudents,
    totalAppeals, openAppeals,
    totalAnnouncements, totalSchedules,
    totalEnrollmentsAll,
    recentAudit, latestAnnouncements,
  ] = await Promise.all([
    prisma.lmsProgram.count({ where: { isDeleted: false, ...progW } }),
    prisma.lmsCourse.count({ where: { isDeleted: false, ...courseW } }),
    prisma.courseOffering.count({ where: { isDeleted: false, termId, ...offW } }),
    prisma.section.count({ where: { isDeleted: false, ...sectByOffW } }),
    prisma.lmsUser.count({ where: { role: 'Teacher', isActive: true, ...teachW } }),
    prisma.lmsUser.count({ where: { role: 'Student', isActive: true, ...studIdW } }),
    prisma.courseRegistration.count({ where: { status: 'ENROLLED', ...regByOffW } }),
    prisma.approvalRequest.count({ where: { assignedRole: 'CourseCoordinator', status: { in: ['PENDING', 'IN_REVIEW'] } } }),
    prisma.escalation.count({ where: { currentRole: 'CourseCoordinator', status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.courseResult.count({ where: { status: 'DRAFT', ...regByOffW } }),
    prisma.courseResult.count({ where: { status: 'PUBLISHED', ...regByOffW } }),
    prisma.courseOffering.findMany({
      where: { isDeleted: false, termId, ...offW },
      include: {
        course: true,
        teacher: { select: { id: true, username: true } },
        _count: { select: { registrations: true } },
        attendanceSessions: { include: { records: { select: { status: true } } } },
        results: { select: { status: true, totalPercent: true } },
      },
    }),
    prisma.lmsUser.count({ where: { role: 'Student', isActive: true, ...studIdW } }),
    prisma.lmsUser.count({ where: { role: 'Student', isActive: false, ...studIdW } }),
    prisma.studentAppeal.count({ where: { isDeleted: false, ...(isGov ? {} : { studentId: { in: scopedStudentIds.length ? scopedStudentIds : ['__none__'] } }) } }),
    prisma.studentAppeal.count({ where: { isDeleted: false, status: { in: ['OPEN', 'IN_REVIEW'] }, ...(isGov ? {} : { studentId: { in: scopedStudentIds.length ? scopedStudentIds : ['__none__'] } }) } }),
    prisma.lmsAnnouncement.count({ where: { isDeleted: false } }),
    prisma.scheduleSlot.count({ where: { isDeleted: false, ...offW } }),
    prisma.courseRegistration.count({ where: { ...regByOffW } }),
    prisma.lmsAuditLog.findMany({
      orderBy: { createdAt: 'desc' }, take: 8,
      include: { actor: { select: { username: true, role: true } } },
    }),
    prisma.lmsAnnouncement.findMany({
      where: { isDeleted: false }, orderBy: { createdAt: 'desc' }, take: 5,
      include: { author: { select: { username: true } } },
    }),
  ]);

  // Academic progress widgets per offering.
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

  // Unassigned offerings = alerts.
  const unassigned = offerings.filter((o) => !o.teacherId).map((o) => `${o.course.code} has no teacher assigned`);
  const lowAttendance = courseProgress.filter((c) => c.attendancePct > 0 && c.attendancePct < 75)
    .map((c) => `${c.course} attendance is ${c.attendancePct}%`);

  // Faculty workload (department-scoped).
  const teacherLoads = await prisma.courseOffering.groupBy({
    by: ['teacherId'], where: { isDeleted: false, termId, teacherId: { not: null }, ...offW }, _count: true,
  });
  // Distinct course instructors = teachers assigned to ≥1 offering this term.
  const totalCourseInstructors = teacherLoads.length;

  // Recent activities — real audit-log entries (human readable).
  const recentActivities = recentAudit.map((a) => ({
    id: a.id,
    action: a.action,
    entity: a.entity,
    actor: a.actor ? a.actor.username : 'system',
    actorRole: a.actorRole || (a.actor ? a.actor.role : null),
    at: a.createdAt,
    text: `${a.actor ? a.actor.username : 'system'} · ${String(a.action || '').replace(/_/g, ' ').toLowerCase()} (${a.entity})`,
  }));

  // Latest announcements (real).
  const latestAnnouncementList = latestAnnouncements.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    audience: n.audience,
    author: n.author ? n.author.username : '—',
    createdAt: n.createdAt,
  }));

  res.json({
    term: term || null,
    stats: {
      totalPrograms, totalCourses, totalOfferings, totalSections,
      totalTeachers, totalStudents, totalRegistrations,
      pendingApprovals, openEscalations,
      draftResults, publishedResults,
      avgClassSize: totalOfferings ? Math.round(totalRegistrations / totalOfferings) : 0,
      // Enriched real-time counts
      activeStudents, suspendedStudents,
      totalCourseInstructors,
      totalEnrollments: totalEnrollmentsAll,
      totalAppeals, openAppeals,
      totalAnnouncements, totalSchedules,
    },
    courseProgress,
    facultyLoad: teacherLoads.map((t) => ({ teacherId: t.teacherId, offerings: t._count })),
    alerts: [...unassigned, ...lowAttendance],
    recentActivities,
    latestAnnouncements: latestAnnouncementList,
  });
}));

// ============================================================
// COORDINATOR PROFILE / ACCOUNT (Settings module)
//  Reuses LmsStudentProfile as a generic staff-profile store
//  (keyed on lmsUserId). Additive — no other role affected.
// ============================================================
async function getOrInitCoordProfile(userId, username, email) {
  let profile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: userId } });
  if (!profile) {
    profile = await prisma.lmsStudentProfile.create({
      data: {
        lmsUserId: userId,
        fullName: username || 'Course Coordinator',
        fatherName: '',
        cnic: '',
        dateOfBirth: '',
        gender: '',
        program: 'N/A',
        programShortForm: 'N/A',
        department: '',
        rollNumber: `COORD-${userId.slice(-6)}`,
        registrationNumber: `COORD-${userId.slice(-6)}`,
        session: 'N/A',
        enrollmentDate: new Date(),
        email: email || null,
      },
    });
  }
  return profile;
}

// GET own profile (creates a default row on first access)
router.get('/me/profile', COORD, asyncHandler(async (req, res) => {
  const u = req.lmsUser;
  const full = await prisma.lmsUser.findUnique({ where: { id: u.id }, select: { email: true, lastLoginAt: true, createdAt: true } });
  const profile = await getOrInitCoordProfile(u.id, u.username, full ? full.email : null);
  res.json({ profile, account: { id: u.id, username: u.username, email: full ? full.email : null, role: u.role, isActive: u.isActive, lastLoginAt: full ? full.lastLoginAt : null, createdAt: full ? full.createdAt : null } });
}));

// UPDATE own profile (personal info)
router.put('/me/profile', COORD, asyncHandler(async (req, res) => {
  const u = req.lmsUser;
  await getOrInitCoordProfile(u.id, u.username, u.email);
  const b = req.body || {};
  const profile = await prisma.lmsStudentProfile.update({
    where: { lmsUserId: u.id },
    data: {
      fullName: b.fullName != null ? String(b.fullName) : undefined,
      fatherName: b.fatherName != null ? String(b.fatherName) : undefined,
      cnic: b.cnic != null ? String(b.cnic) : undefined,
      dateOfBirth: b.dateOfBirth != null ? String(b.dateOfBirth) : undefined,
      gender: b.gender != null ? String(b.gender) : undefined,
      maritalStatus: b.maritalStatus != null ? String(b.maritalStatus) : undefined,
      address: b.address != null ? String(b.address) : undefined,
      phone: b.phone != null ? String(b.phone) : undefined,
      whatsapp: b.whatsapp != null ? String(b.whatsapp) : undefined,
      email: b.email != null ? String(b.email) : undefined,
      department: b.department != null ? String(b.department) : undefined,
    },
  });
  await audit(req, 'COORD_PROFILE_UPDATE', 'LmsStudentProfile', u.id, { after: profile });
  res.json({ profile });
}));

// Upload / change profile picture
router.post('/me/photo', COORD, uploadPhoto.single('photo'), asyncHandler(async (req, res) => {
  const u = req.lmsUser;
  if (!req.file) throw httpError(400, 'No photo uploaded');
  await getOrInitCoordProfile(u.id, u.username, u.email);
  const photoUrl = `/uploads/photos/${req.file.filename}`;
  const profile = await prisma.lmsStudentProfile.update({ where: { lmsUserId: u.id }, data: { photoUrl } });
  await audit(req, 'COORD_PHOTO_UPDATE', 'LmsStudentProfile', u.id, { photoUrl });
  res.json({ profile, photoUrl });
}));

// Change password (verifies current password — proper flow, not temp token)
router.put('/me/password', COORD, validate([
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
  await audit(req, 'COORD_PASSWORD_CHANGE', 'LmsUser', u.id, {});
  res.json({ message: 'Password changed successfully' });
}));

// Department-scoped programs list. If the coordinator profile has a
// department set, only programs in that department are returned;
// otherwise all programs are returned (back-compat).
router.get('/programs', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const { programs, scopedDepartment } = await resolveScopedPrograms(req.lmsUser, {
    include: { _count: { select: { semesters: true, courses: true } } },
  });
  res.json({ programs, scopedDepartment });
}));

// ============================================================
// COURSE MANAGEMENT
//  (catalog CRUD lives in structure.js; here we add coordinator-
//   specific allocation/mapping/planning/curriculum/credit views)
// ============================================================

// Semester course planning: courses grouped by semester for a program.
router.get('/planning', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const programId = req.query.programId ? parseInt(req.query.programId, 10) : undefined;
  // DEPARTMENT ISOLATION: only this coordinator's own programs.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const scopeIdW = scope.isGov ? {} : { id: { in: scope.programIds.length ? scope.programIds : [-1] } };
  const programs = await prisma.lmsProgram.findMany({
    where: { isDeleted: false, ...scopeIdW, ...(programId ? { id: programId } : {}) },
    include: {
      semesters: {
        where: { isDeleted: false },
        orderBy: { number: 'asc' },
        include: {
          courses: {
            where: { isDeleted: false },
            include: { _count: { select: { offerings: true } } },
            orderBy: { code: 'asc' },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  res.json({ programs });
}));

// Curriculum monitoring + credit-hour verification.
router.get('/curriculum', COORD_OR_GOV, asyncHandler(async (req, res) => {
  // DEPARTMENT ISOLATION: only this coordinator's own programs.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const scopeIdW = scope.isGov ? {} : { id: { in: scope.programIds.length ? scope.programIds : [-1] } };
  const programs = await prisma.lmsProgram.findMany({
    where: { isDeleted: false, ...scopeIdW },
    include: {
      semesters: { where: { isDeleted: false }, orderBy: { number: 'asc' } },
      courses: { where: { isDeleted: false }, include: { semester: true } },
    },
  });
  const report = programs.map((p) => {
    const bySem = {};
    for (const s of p.semesters) bySem[s.number] = { semester: s.number, title: s.title, courses: 0, creditHours: 0 };
    let totalCredits = 0;
    for (const c of p.courses) {
      const num = c.semester ? c.semester.number : 0;
      if (!bySem[num]) bySem[num] = { semester: num, title: c.semester ? c.semester.title : 'Unassigned', courses: 0, creditHours: 0 };
      bySem[num].courses += 1;
      bySem[num].creditHours += c.creditHours;
      totalCredits += c.creditHours;
    }
    const unassigned = p.courses.filter((c) => !c.semesterId).length;
    return {
      programId: p.id, code: p.code, name: p.name,
      totalSemesters: p.totalSemesters, totalCourses: p.courses.length, totalCredits,
      unassignedCourses: unassigned,
      bySemester: Object.values(bySem).sort((a, b) => a.semester - b.semester),
      // Credit-hour verification flag: ADCS-style ~ 60–72 credits over the degree.
      creditFlag: totalCredits < 24 ? 'LOW' : totalCredits > 80 ? 'HIGH' : 'OK',
    };
  });
  res.json({ curriculum: report });
}));

// Course allocation/mapping: offerings in current term with teacher + counts.
router.get('/allocation', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = req.query.termId ? parseInt(req.query.termId, 10) : (term ? term.id : -1);
  // DEPARTMENT ISOLATION: only offerings for this coordinator's own courses.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offW },
    include: {
      course: { include: { program: true, semester: true } },
      teacher: { select: { id: true, username: true } },
      sections: { where: { isDeleted: false }, include: { _count: { select: { registrations: true } } } },
      _count: { select: { registrations: true } },
    },
    orderBy: { id: 'asc' },
  });
  res.json({
    termId,
    offerings: offerings.map((o) => ({
      id: o.id,
      course: { id: o.course.id, code: o.course.code, title: o.course.title, creditHours: o.course.creditHours, program: o.course.program ? o.course.program.shortForm : null, semester: o.course.semester ? o.course.semester.number : null },
      teacherId: o.teacherId,
      teacher: o.teacher ? o.teacher.username : null,
      status: o.status,
      students: o._count.registrations,
      sections: o.sections.map((s) => ({ id: s.id, name: s.name, capacity: s.capacity, enrolled: s._count.registrations })),
      weights: { assignment: o.assignmentWeight, quiz: o.quizWeight, mid: o.midWeight, final: o.finalWeight },
    })),
  });
}));

// ============================================================
// TEACHER MANAGEMENT — assignment / replacement / workload
// ============================================================
router.get('/teachers', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  // DEPARTMENT ISOLATION: only this coordinator's own-department instructors.
  const instructorIds = await resolveCoordinatorInstructorIds(req.lmsUser);
  const teacherW = instructorIds === null ? {} : { id: { in: instructorIds.length ? instructorIds : ['__none__'] } };
  const teachers = await prisma.lmsUser.findMany({
    where: { role: 'Teacher', ...teacherW },
    select: {
      id: true, username: true, isActive: true, lastLoginAt: true, createdAt: true,
      profile: { select: { fullName: true, photoUrl: true } },
    },
    orderBy: { username: 'asc' },
  });
  // Workload counts (current term).
  const loads = await prisma.courseOffering.groupBy({
    by: ['teacherId'], where: { isDeleted: false, termId, teacherId: { not: null } }, _count: true,
  });
  const loadMap = {};
  loads.forEach((l) => { loadMap[l.teacherId] = l._count; });
  // Student counts per teacher.
  const offs = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, teacherId: { not: null } },
    select: { teacherId: true, _count: { select: { registrations: true } } },
  });
  const studentMap = {};
  offs.forEach((o) => { studentMap[o.teacherId] = (studentMap[o.teacherId] || 0) + o._count.registrations; });

  res.json({
    teachers: teachers.map((t) => ({
      id: t.id,
      username: t.username,
      name: t.profile?.fullName || t.username,
      photoUrl: t.profile?.photoUrl || null,
      isActive: t.isActive,
      lastLoginAt: t.lastLoginAt,
      offerings: loadMap[t.id] || 0,
      students: studentMap[t.id] || 0,
    })),
  });
}));

// Assign / change a teacher on an offering.
router.put('/offerings/:id/assign-teacher', COORD, validate([
  body('teacherId').notEmpty().withMessage('teacherId is required'),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { teacherId } = req.body;
  const before = await prisma.courseOffering.findUnique({ where: { id }, include: { course: true } });
  if (!before) throw httpError(404, 'Offering not found');
  // DEPARTMENT ISOLATION: offering + teacher must be in own department
  // (or an approved cross-department borrowed instructor).
  await assertOfferingInScope(req.lmsUser, id);
  await assertTeacherAssignable(req.lmsUser, teacherId);
  const teacher = await prisma.lmsUser.findFirst({ where: { id: teacherId, role: 'Teacher' } });
  if (!teacher) throw httpError(400, 'Invalid teacher');
  const offering = await prisma.courseOffering.update({ where: { id }, data: { teacherId } });
  await audit(req, 'TEACHER_ASSIGN', 'CourseOffering', id, { before: { teacherId: before.teacherId }, after: { teacherId } });
  await notify(teacherId, { title: 'Course assigned', message: `You have been assigned to ${before.course.code} — ${before.course.title}.`, type: 'INFO', link: `/teacher/offerings/${id}` });
  res.json({ offering });
}));

// Replace a teacher across ALL their offerings in the current term (or a single offering).
router.post('/teachers/replace', COORD, validate([
  body('fromTeacherId').notEmpty(),
  body('toTeacherId').notEmpty(),
]), asyncHandler(async (req, res) => {
  const { fromTeacherId, toTeacherId, offeringId } = req.body;
  const toTeacher = await prisma.lmsUser.findFirst({ where: { id: toTeacherId, role: 'Teacher' } });
  if (!toTeacher) throw httpError(400, 'Replacement teacher invalid');
  const term = await currentTerm();
  const where = offeringId
    ? { id: parseInt(offeringId, 10) }
    : { teacherId: fromTeacherId, termId: term ? term.id : -1, isDeleted: false };
  const affected = await prisma.courseOffering.findMany({ where, select: { id: true } });
  await prisma.courseOffering.updateMany({ where, data: { teacherId: toTeacherId } });
  // Also move sections that pointed at the old teacher.
  await prisma.section.updateMany({ where: { teacherId: fromTeacherId, offeringId: { in: affected.map((a) => a.id) } }, data: { teacherId: toTeacherId } });
  await audit(req, 'TEACHER_REPLACE', 'CourseOffering', offeringId || 'bulk', { before: { fromTeacherId }, after: { toTeacherId, offerings: affected.map((a) => a.id) } });
  await notify(toTeacherId, { title: 'Courses reassigned to you', message: `${affected.length} course offering(s) have been reassigned to you.`, type: 'INFO' });
  await notify(fromTeacherId, { title: 'Courses reassigned', message: `${affected.length} of your offerings were reassigned.`, type: 'INFO' });
  res.json({ message: `Reassigned ${affected.length} offering(s)`, count: affected.length });
}));

// Courses currently assigned to a specific teacher (current term by default).
// Drives the Teacher Replacement UI so the course dropdown shows ONLY the
// courses already assigned to the selected (outgoing) teacher.
router.get('/teachers/:teacherId/offerings', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const teacherId = req.params.teacherId;
  const teacher = await prisma.lmsUser.findFirst({ where: { id: teacherId, role: 'Teacher' } });
  if (!teacher) throw httpError(404, 'Teacher not found');

  const where = { teacherId, isDeleted: false };
  // Optional session scoping; default to the current term when not provided.
  if (req.query.sessionId) {
    where.termId = parseInt(req.query.sessionId, 10);
  } else {
    const term = await currentTerm();
    if (term) where.termId = term.id;
  }

  const offerings = await prisma.courseOffering.findMany({
    where,
    include: {
      course: { select: { code: true, title: true, creditHours: true } },
      term: { select: { id: true, code: true, title: true } },
      _count: { select: { registrations: true } },
    },
    orderBy: { id: 'asc' },
  });

  res.json({
    teacherId,
    offerings: offerings.map((o) => ({
      id: o.id,
      courseCode: o.course ? o.course.code : '—',
      courseTitle: o.course ? o.course.title : '—',
      creditHours: o.course ? o.course.creditHours : null,
      session: o.term ? o.term.title : null,
      sessionId: o.termId,
      students: o._count.registrations,
    })),
  });
}));

// Workload distribution summary.
router.get('/workload', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  // DEPARTMENT ISOLATION: only this coordinator's own offerings.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
  const offs = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offW },
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
  res.json({ workload: Object.values(map) });
}));

// ============================================================
// COURSE DISTRIBUTION
//  A "distribution" = a CourseOffering (course + session/term) with a
//  teacher + section assignment. The UI uses cascading dropdowns:
//    Teacher · Program · Semester · Course (by semester) · Session(Term)
//    · Section · (Assign Teacher)
//  Create / Edit / Delete persist to CourseOffering + Section. Additive.
// ============================================================

// Dropdown source data for the distribution form.
router.get('/distribution/options', COORD_OR_GOV, asyncHandler(async (req, res) => {
  // Department scope (same forgiving rule as /programs — never returns an
  // empty program list while programs exist, so the cascade can't dead-end).
  const { programs: scopedPrograms, scopedDepartment } = await resolveScopedPrograms(req.lmsUser);

  const programIds = scopedPrograms.map((p) => p.id);
  const [teachers, terms, semesters] = await Promise.all([
    prisma.lmsUser.findMany({ where: { role: 'Teacher', isActive: true }, orderBy: { username: 'asc' }, select: { id: true, username: true, profile: { select: { fullName: true } } } }),
    // Sessions = academic terms. Prefer active terms, but if none are flagged
    // active fall back to ALL terms so the Session dropdown is never empty.
    prisma.academicTerm.findMany({ orderBy: { id: 'desc' }, select: { id: true, code: true, title: true, isCurrent: true, isActive: true } }),
    // Semesters within the scoped programs (for the Edit form's Semester dropdown).
    prisma.lmsSemester.findMany({
      where: { isDeleted: false, ...(programIds.length ? { programId: { in: programIds } } : {}) },
      orderBy: [{ programId: 'asc' }, { number: 'asc' }],
      select: { id: true, number: true, title: true, programId: true },
    }),
  ]);

  const activeTerms = terms.filter((t) => t.isActive);
  const sessionTerms = activeTerms.length ? activeTerms : terms;

  res.json({
    programs: scopedPrograms.map((p) => ({ id: p.id, code: p.code, name: p.name, shortForm: p.shortForm, department: p.department })),
    teachers: teachers.map((t) => ({ id: t.id, name: t.profile?.fullName || t.username, username: t.username })),
    sessions: sessionTerms.map((t) => ({ id: t.id, code: t.code, title: t.title, isCurrent: t.isCurrent })),
    semesters: semesters.map((s) => ({ id: s.id, number: s.number, title: s.title || `Semester ${s.number}`, programId: s.programId })),
    scopedDepartment,
  });
}));

// Courses for a program + semester (drives the cascading "Course" dropdown).
//
// Client requirement 3.1 — courses that are ALREADY ASSIGNED to a teacher
// (i.e. already have a CourseOffering with a teacher in the current session)
// must NOT appear in the "Add Row" dropdown. Only unassigned courses are
// returned. Pass ?includeAssigned=1 to bypass (e.g. when editing).
router.get('/distribution/courses', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const where = { isDeleted: false, isActive: true };
  // DEPARTMENT ISOLATION: only courses under this coordinator's own programs.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  if (!scope.isGov) {
    where.id = { in: scope.courseIds.length ? scope.courseIds : [-1] };
  }
  if (req.query.programId) where.programId = parseInt(req.query.programId, 10);
  if (req.query.semesterId) where.semesterId = parseInt(req.query.semesterId, 10);
  const courses = await prisma.lmsCourse.findMany({
    where,
    orderBy: { code: 'asc' },
    select: { id: true, code: true, title: true, creditHours: true, semesterId: true, semester: { select: { number: true } } },
  });

  // Determine which of these courses are already assigned to a teacher in the
  // current session, so they can be filtered out of the dropdown.
  const includeAssigned = String(req.query.includeAssigned || '') === '1';
  const term = await currentTerm();
  const termId = req.query.sessionId ? parseInt(req.query.sessionId, 10) : (term ? term.id : -1);
  const courseIds = courses.map((c) => c.id);
  let assignedCourseIds = new Set();
  if (courseIds.length) {
    const assignedOfferings = await prisma.courseOffering.findMany({
      where: {
        isDeleted: false,
        termId,
        courseId: { in: courseIds },
        teacherId: { not: null }, // "assigned" = has a teacher
      },
      select: { courseId: true },
    });
    assignedCourseIds = new Set(assignedOfferings.map((o) => o.courseId));
  }

  const visible = includeAssigned ? courses : courses.filter((c) => !assignedCourseIds.has(c.id));
  res.json({
    courses: visible.map((c) => ({
      id: c.id, code: c.code, title: c.title, creditHours: c.creditHours,
      semester: c.semester ? c.semester.number : null,
    })),
    // Also expose the set of already-assigned course ids (informational).
    assignedCourseIds: Array.from(assignedCourseIds),
  });
}));

// List existing distributions (offerings) — searchable + session-scoped.
router.get('/distribution', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = req.query.sessionId ? parseInt(req.query.sessionId, 10) : (term ? term.id : -1);
  const search = (req.query.search || '').toString().toLowerCase();

  // DEPARTMENT ISOLATION: only offerings for this coordinator's own courses.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offWhere = { isDeleted: false, termId };
  if (!scope.isGov) {
    offWhere.id = { in: scope.offeringIds.length ? scope.offeringIds : [-1] };
  }
  const offerings = await prisma.courseOffering.findMany({
    where: offWhere,
    include: {
      course: { include: { program: { select: { id: true, shortForm: true, name: true } }, semester: { select: { id: true, number: true } } } },
      teacher: { select: { id: true, username: true, profile: { select: { fullName: true } } } },
      term: { select: { id: true, code: true, title: true } },
      sections: { where: { isDeleted: false }, select: { id: true, name: true, capacity: true, room: true, _count: { select: { registrations: true } } } },
      _count: { select: { registrations: true } },
    },
    orderBy: { id: 'asc' },
  });

  let rows = offerings.map((o) => ({
    id: o.id,
    courseId: o.courseId,
    courseCode: o.course.code,
    courseTitle: o.course.title,
    creditHours: o.course.creditHours,
    programId: o.course.program ? o.course.program.id : null,
    program: o.course.program ? o.course.program.shortForm : null,
    programName: o.course.program ? o.course.program.name : null,
    semesterId: o.course.semester ? o.course.semester.id : null,
    semester: o.course.semester ? o.course.semester.number : null,
    teacherId: o.teacherId,
    teacher: o.teacher ? (o.teacher.profile?.fullName || o.teacher.username) : null,
    session: o.term ? o.term.title : null,
    sessionId: o.termId,
    status: o.status,
    students: o._count.registrations,
    sections: o.sections.map((s) => ({ id: s.id, name: s.name, capacity: s.capacity, room: s.room, enrolled: s._count.registrations })),
  }));

  if (search) {
    rows = rows.filter((r) =>
      (r.courseCode || '').toLowerCase().includes(search) ||
      (r.courseTitle || '').toLowerCase().includes(search) ||
      (r.teacher || '').toLowerCase().includes(search) ||
      (r.program || '').toLowerCase().includes(search));
  }

  res.json({
    sessionId: termId,
    distributions: rows,
    summary: {
      total: rows.length,
      assigned: rows.filter((r) => r.teacherId).length,
      unassigned: rows.filter((r) => !r.teacherId).length,
      students: rows.reduce((a, r) => a + r.students, 0),
    },
  });
}));

// ============================================================
// §3.2 — NEW DISTRIBUTION (multi-course, manual course entry)
// ------------------------------------------------------------
// Creates MANY distributions in one call. The coordinator picks
// Program → Semester → Batch(session), then adds one or more
// courses MANUALLY (course code + title entered by hand) and
// assigns a teacher to each. Each row may target a DIFFERENT
// semester and/or batch, so the payload carries per-row
// semesterId / sessionId overrides.
//
// For every row we:
//   1. find an existing course by code (within scope), or CREATE
//      the course from the manually-entered code/title,
//   2. create (or revive) the CourseOffering for (course, term),
//   3. assign the teacher + create the section.
//
// Response reports per-row success/failure so partial batches are
// transparent rather than silently dropped.
// ============================================================
router.post('/distribution/batch', COORD, validate([
  body('programId').notEmpty().withMessage('Program is required'),
  body('courses').isArray({ min: 1 }).withMessage('At least one course is required'),
]), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const programId = parseInt(b.programId, 10);
  const defaultSemesterId = b.semesterId ? parseInt(b.semesterId, 10) : null;
  const defaultSessionId = b.sessionId ? parseInt(b.sessionId, 10) : null;

  const program = await prisma.lmsProgram.findFirst({ where: { id: programId, isDeleted: false } });
  if (!program) throw httpError(400, 'Invalid program');

  // DEPARTMENT ISOLATION — the program must be in the coordinator's own scope.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  if (!scope.isGov && !(scope.programIds || []).includes(programId)) {
    throw httpError(403, 'This program belongs to another department.');
  }

  const rows = Array.isArray(b.courses) ? b.courses : [];
  const created = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const code = String(r.code || '').trim();
    const title = String(r.title || '').trim();
    const semesterId = r.semesterId ? parseInt(r.semesterId, 10) : defaultSemesterId;
    const sessionId = r.sessionId ? parseInt(r.sessionId, 10) : defaultSessionId;

    try {
      if (!code) throw httpError(400, 'Course code is required');
      if (!title) throw httpError(400, 'Course name is required');
      if (!sessionId) throw httpError(400, 'Batch / session is required');

      const term = await prisma.academicTerm.findUnique({ where: { id: sessionId } });
      if (!term) throw httpError(400, 'Invalid batch / session');

      if (semesterId) {
        const sem = await prisma.lmsSemester.findFirst({ where: { id: semesterId, isDeleted: false } });
        if (!sem) throw httpError(400, 'Invalid semester');
        if (sem.programId && sem.programId !== programId) {
          throw httpError(400, 'That semester belongs to a different program');
        }
      }

      // 1. Reuse an existing course with this code, else create it manually.
      let course = await prisma.lmsCourse.findFirst({ where: { code, isDeleted: false } });
      if (course) {
        if (!scope.isGov && course.programId && course.programId !== programId) {
          throw httpError(403, `Course ${code} already exists under another program.`);
        }
        // Keep the course aligned with the chosen program/semester.
        const patch = {};
        if (!course.programId) patch.programId = programId;
        if (semesterId && !course.semesterId) patch.semesterId = semesterId;
        if (Object.keys(patch).length) {
          course = await prisma.lmsCourse.update({ where: { id: course.id }, data: patch });
        }
      } else {
        const creditHours = r.creditHours != null && r.creditHours !== '' ? parseInt(r.creditHours, 10) : 3;
        const hasLab = !!r.hasLab;
        const labCredit = hasLab ? (r.labCredit != null && r.labCredit !== '' ? parseInt(r.labCredit, 10) : 1) : 0;
        course = await prisma.lmsCourse.create({
          data: {
            code,
            title,
            creditHours: Number.isFinite(creditHours) ? creditHours : 3,
            hasLab,
            theoryCredit: Math.max(0, (Number.isFinite(creditHours) ? creditHours : 3) - labCredit),
            labCredit: hasLab ? labCredit : null,
            programId,
            semesterId: semesterId || null,
          },
        });
        await audit(req, 'COURSE_CREATE', 'LmsCourse', course.id, { after: course });
      }

      // 2. Validate the teacher (own department or approved borrowed).
      let teacherId = null;
      if (r.teacherId) {
        await assertTeacherAssignable(req.lmsUser, r.teacherId);
        const t = await prisma.lmsUser.findFirst({ where: { id: r.teacherId, role: 'Teacher' } });
        if (!t) throw httpError(400, 'Invalid teacher');
        teacherId = t.id;
      }

      // 3. Offering for (course, term) — schema enforces uniqueness.
      const existing = await prisma.courseOffering.findFirst({ where: { courseId: course.id, termId: sessionId } });
      if (existing && !existing.isDeleted) {
        throw httpError(409, `A distribution for ${code} in ${term.title} already exists`);
      }
      let offering;
      if (existing && existing.isDeleted) {
        offering = await prisma.courseOffering.update({
          where: { id: existing.id },
          data: { isDeleted: false, deletedAt: null, teacherId, status: 'ACTIVE' },
        });
      } else {
        offering = await prisma.courseOffering.create({
          data: { courseId: course.id, termId: sessionId, teacherId, status: 'ACTIVE' },
        });
      }

      // 4. Section.
      const sectionName = String(r.sectionName || b.sectionName || 'A').trim() || 'A';
      const dupe = await prisma.section.findFirst({ where: { offeringId: offering.id, name: sectionName } });
      if (!dupe) {
        await prisma.section.create({
          data: {
            offeringId: offering.id,
            name: sectionName,
            capacity: r.capacity ? parseInt(r.capacity, 10) : (b.capacity ? parseInt(b.capacity, 10) : 150),
            teacherId: teacherId || null,
          },
        });
      }

      if (teacherId) {
        await notify(teacherId, {
          title: 'Course assigned',
          message: `You have been assigned to ${course.code} — ${course.title} (${term.title}).`,
          type: 'INFO',
          link: `/teacher/offerings/${offering.id}`,
        }).catch(() => {});
      }

      await audit(req, 'DISTRIBUTION_CREATE', 'CourseOffering', offering.id, {
        after: { courseId: course.id, termId: sessionId, teacherId, semesterId },
      });

      created.push({
        index: i,
        offeringId: offering.id,
        courseId: course.id,
        code: course.code,
        title: course.title,
        semesterId: semesterId || null,
        sessionId,
        teacherId,
      });
    } catch (e) {
      errors.push({ index: i, code, message: e?.message || 'Failed to create distribution' });
    }
  }

  res.status(created.length ? 201 : 400).json({
    message: created.length
      ? `${created.length} distribution(s) created${errors.length ? `, ${errors.length} failed` : ''}`
      : 'No distributions were created',
    created,
    errors,
  });
}));

// Create a distribution: offering (course + session) + optional teacher + section.
router.post('/distribution', COORD, validate([
  body('courseId').notEmpty().withMessage('Course is required'),
  body('sessionId').notEmpty().withMessage('Session is required'),
]), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const courseId = parseInt(b.courseId, 10);
  const termId = parseInt(b.sessionId, 10);

  const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, isDeleted: false } });
  if (!course) throw httpError(400, 'Invalid course');
  const term = await prisma.academicTerm.findUnique({ where: { id: termId } });
  if (!term) throw httpError(400, 'Invalid session');

  // DEPARTMENT ISOLATION: the course must belong to the coordinator's own
  // department's scheme of studies (governance roles are unscoped).
  {
    const scope = await resolveCoordinatorScope(req.lmsUser);
    if (!scope.isGov && !scope.courseIds.includes(courseId)) {
      throw httpError(403, 'This course belongs to another department.');
    }
  }

  // The schema enforces one offering per (course, term).
  const existing = await prisma.courseOffering.findFirst({ where: { courseId, termId } });
  if (existing && !existing.isDeleted) throw httpError(409, 'A distribution for this course & session already exists');

  let teacherId = null;
  if (b.teacherId) {
    // DEPARTMENT ISOLATION: only own-department (or approved borrowed) instructors.
    await assertTeacherAssignable(req.lmsUser, b.teacherId);
    const t = await prisma.lmsUser.findFirst({ where: { id: b.teacherId, role: 'Teacher' } });
    if (!t) throw httpError(400, 'Invalid teacher');
    teacherId = t.id;
  }

  let offering;
  if (existing && existing.isDeleted) {
    offering = await prisma.courseOffering.update({ where: { id: existing.id }, data: { isDeleted: false, deletedAt: null, teacherId, status: 'ACTIVE' } });
  } else {
    offering = await prisma.courseOffering.create({ data: { courseId, termId, teacherId, status: 'ACTIVE' } });
  }

  // Optional section creation (name + capacity 150 default).
  if (b.sectionName) {
    const name = String(b.sectionName).trim();
    const dupe = await prisma.section.findFirst({ where: { offeringId: offering.id, name } });
    if (!dupe) {
      await prisma.section.create({
        data: {
          offeringId: offering.id,
          name,
          capacity: b.capacity ? parseInt(b.capacity, 10) : 150,
          teacherId: teacherId || null,
        },
      });
    }
  }

  if (teacherId) {
    await notify(teacherId, { title: 'Course assigned', message: `You have been assigned to ${course.code} — ${course.title} (${term.title}).`, type: 'INFO', link: `/teacher/offerings/${offering.id}` }).catch(() => {});
  }
  await audit(req, 'DISTRIBUTION_CREATE', 'CourseOffering', offering.id, { after: { courseId, termId, teacherId } });
  res.status(201).json({ message: 'Distribution created', offeringId: offering.id });
}));

// Edit a distribution. Supports editing:
//   - Assigned Teacher (offering teacher)
//   - Course Assignment (which course this offering points to)
//   - Semester & Credit Hours (stored on the LmsCourse)
//   - Section (name / capacity / room / section teacher)
//   - Status (ACTIVE / COMPLETED / CANCELLED)
// All updates persist immediately to the database.
router.put('/distribution/:offeringId', COORD, asyncHandler(async (req, res) => {
  const offeringId = parseInt(req.params.offeringId, 10);
  const b = req.body || {};
  const before = await prisma.courseOffering.findFirst({
    where: { id: offeringId, isDeleted: false },
    include: { course: true, sections: { where: { isDeleted: false }, orderBy: { id: 'asc' } } },
  });
  if (!before) throw httpError(404, 'Distribution not found');

  // DEPARTMENT ISOLATION: this distribution must belong to the coordinator's dept.
  await assertOfferingInScope(req.lmsUser, offeringId);

  const data = {};

  // --- Assigned Teacher (offering level) ---
  if (b.teacherId !== undefined) {
    if (b.teacherId) {
      // Only own-department (or approved borrowed) instructors.
      await assertTeacherAssignable(req.lmsUser, b.teacherId);
      const t = await prisma.lmsUser.findFirst({ where: { id: b.teacherId, role: 'Teacher' } });
      if (!t) throw httpError(400, 'Invalid teacher');
      data.teacherId = t.id;
    } else {
      data.teacherId = null;
    }
  }

  // --- Course Assignment (re-point this offering to a different course) ---
  if (b.courseId !== undefined && b.courseId !== null && parseInt(b.courseId, 10) !== before.courseId) {
    const newCourseId = parseInt(b.courseId, 10);
    const newCourse = await prisma.lmsCourse.findFirst({ where: { id: newCourseId, isDeleted: false } });
    if (!newCourse) throw httpError(400, 'Invalid course');
    // DEPARTMENT ISOLATION: can only re-point to a course in own dept's scheme.
    {
      const scope = await resolveCoordinatorScope(req.lmsUser);
      if (!scope.isGov && !scope.courseIds.includes(newCourseId)) {
        throw httpError(403, 'This course belongs to another department.');
      }
    }
    // Respect the unique (courseId, termId) constraint.
    const clash = await prisma.courseOffering.findFirst({
      where: { courseId: newCourseId, termId: before.termId, isDeleted: false, id: { not: offeringId } },
    });
    if (clash) throw httpError(409, 'Another distribution already exists for that course in this session');
    data.courseId = newCourseId;
  }

  if (b.status && ['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(b.status)) data.status = b.status;

  // --- Apply offering-level updates ---
  const offering = Object.keys(data).length
    ? await prisma.courseOffering.update({ where: { id: offeringId }, data })
    : before;

  // --- Course-level updates: Semester & Credit Hours ---
  // These live on the LmsCourse record. We update the course this offering
  // points to (after any re-assignment above).
  const targetCourseId = data.courseId || before.courseId;
  const courseData = {};
  if (b.creditHours !== undefined && b.creditHours !== null && b.creditHours !== '') {
    const ch = parseInt(b.creditHours, 10);
    if (!Number.isNaN(ch) && ch >= 0 && ch <= 12) courseData.creditHours = ch;
  }
  if (b.semesterId !== undefined) {
    if (b.semesterId) {
      const sem = await prisma.lmsSemester.findFirst({ where: { id: parseInt(b.semesterId, 10), isDeleted: false } });
      if (!sem) throw httpError(400, 'Invalid semester');
      courseData.semesterId = sem.id;
    } else {
      courseData.semesterId = null;
    }
  }
  if (Object.keys(courseData).length) {
    await prisma.lmsCourse.update({ where: { id: targetCourseId }, data: courseData });
  }

  // --- Section update: edit the primary section, or create one if requested ---
  if (b.sectionName !== undefined || b.capacity !== undefined || b.room !== undefined || b.sectionTeacherId !== undefined) {
    const sectionName = b.sectionName !== undefined && b.sectionName !== null && String(b.sectionName).trim()
      ? String(b.sectionName).trim() : null;
    const primary = before.sections[0] || null;

    // Resolve section teacher (defaults to the offering teacher if provided).
    let sectionTeacherId;
    if (b.sectionTeacherId !== undefined) {
      sectionTeacherId = b.sectionTeacherId || null;
      if (sectionTeacherId) {
        // Only own-department (or approved borrowed) instructors.
        await assertTeacherAssignable(req.lmsUser, sectionTeacherId);
        const st = await prisma.lmsUser.findFirst({ where: { id: sectionTeacherId, role: 'Teacher' } });
        if (!st) throw httpError(400, 'Invalid section teacher');
      }
    }

    const secData = {};
    if (sectionName) secData.name = sectionName;
    if (b.capacity !== undefined && b.capacity !== null && b.capacity !== '') {
      const cap = parseInt(b.capacity, 10);
      if (!Number.isNaN(cap) && cap > 0) secData.capacity = cap;
    }
    if (b.room !== undefined) secData.room = b.room ? String(b.room) : null;
    if (sectionTeacherId !== undefined) secData.teacherId = sectionTeacherId;

    if (primary) {
      // Guard the unique (offeringId, name) constraint when renaming.
      if (secData.name && secData.name !== primary.name) {
        const dupe = await prisma.section.findFirst({ where: { offeringId, name: secData.name, isDeleted: false, id: { not: primary.id } } });
        if (dupe) throw httpError(409, `A section named "${secData.name}" already exists for this distribution`);
      }
      if (Object.keys(secData).length) {
        await prisma.section.update({ where: { id: primary.id }, data: secData });
      }
    } else if (sectionName) {
      // No section yet — create one with the provided details.
      await prisma.section.create({
        data: {
          offeringId,
          name: sectionName,
          capacity: secData.capacity || 150,
          room: secData.room ?? null,
          teacherId: secData.teacherId ?? (data.teacherId ?? before.teacherId) ?? null,
        },
      });
    }
  }

  // --- Notify newly assigned teacher ---
  if (data.teacherId && data.teacherId !== before.teacherId) {
    await notify(data.teacherId, { title: 'Course assigned', message: `You have been assigned to ${before.course.code} — ${before.course.title}.`, type: 'INFO', link: `/teacher/offerings/${offeringId}` }).catch(() => {});
  }

  await audit(req, 'DISTRIBUTION_UPDATE', 'CourseOffering', offeringId, {
    before: { teacherId: before.teacherId, status: before.status, courseId: before.courseId },
    after: { ...data, ...courseData },
  });
  res.json({ message: 'Distribution updated', offeringId });
}));

// Assign / change the teacher only (the "Assign Teacher" button).
router.put('/distribution/:offeringId/assign', COORD, validate([
  body('teacherId').notEmpty().withMessage('Teacher is required'),
]), asyncHandler(async (req, res) => {
  const offeringId = parseInt(req.params.offeringId, 10);
  const before = await prisma.courseOffering.findFirst({ where: { id: offeringId, isDeleted: false }, include: { course: true } });
  if (!before) throw httpError(404, 'Distribution not found');
  // DEPARTMENT ISOLATION: offering + teacher must be in own department
  // (or an approved cross-department borrowed instructor).
  await assertOfferingInScope(req.lmsUser, offeringId);
  await assertTeacherAssignable(req.lmsUser, req.body.teacherId);
  const t = await prisma.lmsUser.findFirst({ where: { id: req.body.teacherId, role: 'Teacher' } });
  if (!t) throw httpError(400, 'Invalid teacher');
  await prisma.courseOffering.update({ where: { id: offeringId }, data: { teacherId: t.id } });
  await notify(t.id, { title: 'Course assigned', message: `You have been assigned to ${before.course.code} — ${before.course.title}.`, type: 'INFO', link: `/teacher/offerings/${offeringId}` }).catch(() => {});
  await audit(req, 'DISTRIBUTION_ASSIGN', 'CourseOffering', offeringId, { before: { teacherId: before.teacherId }, after: { teacherId: t.id } });
  res.json({ message: 'Teacher assigned', offeringId });
}));

// Delete a distribution (soft — preserves registrations/history).
router.delete('/distribution/:offeringId', COORD, asyncHandler(async (req, res) => {
  const offeringId = parseInt(req.params.offeringId, 10);
  const before = await prisma.courseOffering.findFirst({ where: { id: offeringId, isDeleted: false } });
  if (!before) throw httpError(404, 'Distribution not found');
  const regCount = await prisma.courseRegistration.count({ where: { offeringId, status: 'ENROLLED' } });
  if (regCount > 0 && String(req.query.force || '') !== 'true') {
    throw httpError(409, `This distribution has ${regCount} enrolled student(s). Pass force=true to remove it.`);
  }
  await prisma.courseOffering.update({ where: { id: offeringId }, data: { isDeleted: true, deletedAt: new Date(), status: 'CANCELLED' } });
  await audit(req, 'DISTRIBUTION_DELETE', 'CourseOffering', offeringId, { before: { courseId: before.courseId, termId: before.termId } });
  res.json({ message: 'Distribution removed' });
}));

// ============================================================
// ACADEMIC MONITORING
// ============================================================
// Attendance monitoring (per offering).
router.get('/monitoring/attendance', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  // DEPARTMENT ISOLATION: only this coordinator's own offerings.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offW },
    include: {
      course: { select: { code: true, title: true } },
      teacher: { select: { username: true } },
      attendanceSessions: { include: { records: { select: { status: true } } } },
      _count: { select: { registrations: true } },
    },
  });
  res.json({
    courses: offerings.map((o) => ({
      offeringId: o.id,
      course: `${o.course.code} — ${o.course.title}`,
      teacher: o.teacher ? o.teacher.username : 'Unassigned',
      students: o._count.registrations,
      sessions: o.attendanceSessions.length,
      attendancePct: attendancePct(o.attendanceSessions),
    })),
  });
}));

// Assignment + quiz monitoring.
router.get('/monitoring/assessments', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  // DEPARTMENT ISOLATION: only this coordinator's own offerings.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offW },
    include: {
      course: { select: { code: true, title: true } },
      teacher: { select: { username: true } },
      assignments: { where: { isDeleted: false }, include: { _count: { select: { submissions: true } }, submissions: { select: { status: true } } } },
      quizzes: { where: { isDeleted: false }, include: { _count: { select: { attempts: true } }, attempts: { select: { status: true } } } },
      _count: { select: { registrations: true } },
    },
  });
  res.json({
    courses: offerings.map((o) => {
      const assignSubs = o.assignments.reduce((a, x) => a + x.submissions.length, 0);
      const assignGraded = o.assignments.reduce((a, x) => a + x.submissions.filter((s) => s.status === 'GRADED').length, 0);
      const quizAttempts = o.quizzes.reduce((a, x) => a + x.attempts.length, 0);
      return {
        offeringId: o.id,
        course: `${o.course.code} — ${o.course.title}`,
        teacher: o.teacher ? o.teacher.username : 'Unassigned',
        students: o._count.registrations,
        assignments: o.assignments.length,
        assignmentSubmissions: assignSubs,
        assignmentGraded: assignGraded,
        assignmentPending: assignSubs - assignGraded,
        quizzes: o.quizzes.length,
        quizAttempts,
      };
    }),
  });
}));

// Mid / Final / Grade monitoring (result status per offering).
router.get('/monitoring/results', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  // DEPARTMENT ISOLATION: only this coordinator's own offerings.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offW },
    include: {
      course: { select: { code: true, title: true } },
      teacher: { select: { username: true } },
      results: { select: { status: true, totalPercent: true, midMarks: true, finalMarks: true, letterGrade: true } },
      _count: { select: { registrations: true } },
    },
  });
  res.json({
    courses: offerings.map((o) => {
      const draft = o.results.filter((r) => r.status === 'DRAFT').length;
      const published = o.results.filter((r) => r.status === 'PUBLISHED');
      const passed = published.filter((r) => r.totalPercent >= 50).length;
      const midEntered = o.results.filter((r) => r.midMarks > 0).length;
      const finalEntered = o.results.filter((r) => r.finalMarks > 0).length;
      return {
        offeringId: o.id,
        course: `${o.course.code} — ${o.course.title}`,
        teacher: o.teacher ? o.teacher.username : 'Unassigned',
        students: o._count.registrations,
        midEntered, finalEntered,
        draftResults: draft,
        publishedResults: published.length,
        passRate: published.length ? Math.round((passed / published.length) * 100) : 0,
      };
    }),
  });
}));

// Academic progress tracking — at-risk students.
router.get('/monitoring/progress', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  // DEPARTMENT ISOLATION: only this coordinator's own offerings.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offNestedIdW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
  // Build per-student published results + attendance to compute GPA + risk.
  const results = await prisma.courseResult.findMany({
    where: { status: 'PUBLISHED', offering: { termId, ...offNestedIdW } },
    include: {
      student: { select: { id: true, username: true, profile: { select: { fullName: true } } } },
      offering: { include: { course: { select: { creditHours: true, code: true } } } },
    },
  });
  const byStudent = {};
  for (const r of results) {
    const sid = r.studentId;
    if (!byStudent[sid]) byStudent[sid] = { studentId: sid, name: displayName(r.student), roll: r.student.username, results: [] };
    byStudent[sid].results.push({ gradePoints: r.gradePoints, creditHours: r.offering.course.creditHours, percent: r.totalPercent, letter: r.letterGrade, course: r.offering.course.code });
  }
  const students = Object.values(byStudent).map((s) => {
    const gpa = computeGPA(s.results);
    const failing = s.results.filter((r) => r.percent < 50).length;
    let risk = 'LOW';
    if (gpa < 1.5 || failing >= 2) risk = 'HIGH';
    else if (gpa < 2.0 || failing === 1) risk = 'MEDIUM';
    return { ...s, gpa, courses: s.results.length, failing, risk };
  }).sort((a, b) => a.gpa - b.gpa);
  res.json({ students, atRisk: students.filter((s) => s.risk !== 'LOW') });
}));

// ============================================================
// RESULT MONITORING — verification + approval workflow
// ============================================================
// Detailed gradebook for an offering (marks verification).
router.get('/offerings/:id/results', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    include: { course: true, teacher: { select: { username: true } } },
  });
  if (!offering) throw httpError(404, 'Offering not found');
  // DEPARTMENT ISOLATION: offering must belong to own department.
  await assertOfferingInScope(req.lmsUser, id);
  const results = await prisma.courseResult.findMany({
    where: { offeringId: id },
    include: { student: { select: { id: true, username: true, profile: { select: { fullName: true } } } } },
    orderBy: { totalPercent: 'desc' },
  });
  res.json({
    offering: { id: offering.id, course: `${offering.course.code} — ${offering.course.title}`, teacher: offering.teacher ? offering.teacher.username : null, weights: { assignment: offering.assignmentWeight, quiz: offering.quizWeight, mid: offering.midWeight, final: offering.finalWeight } },
    results: results.map((r) => ({
      id: r.id, studentId: r.studentId, name: displayName(r.student), roll: r.student.username,
      assignmentMarks: r.assignmentMarks, quizMarks: r.quizMarks, midMarks: r.midMarks, finalMarks: r.finalMarks,
      totalPercent: r.totalPercent, letterGrade: r.letterGrade, gradePoints: r.gradePoints, status: r.status,
    })),
  });
}));

// Approve an offering's results (coordinator sign-off → notifies teacher/exam).
router.post('/offerings/:id/results/approve', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const offering = await prisma.courseOffering.findUnique({ where: { id }, include: { course: true } });
  if (!offering) throw httpError(404, 'Offering not found');
  // DEPARTMENT ISOLATION: offering must belong to own department.
  await assertOfferingInScope(req.lmsUser, id);
  const updated = await prisma.courseResult.updateMany({
    where: { offeringId: id, status: 'PUBLISHED' },
    data: { remarks: 'Coordinator approved' },
  });
  // Close any matching RESULT approval requests for this offering.
  await prisma.approvalRequest.updateMany({
    where: { type: 'RESULT', entity: 'CourseOffering', entityId: String(id), status: { in: ['PENDING', 'IN_REVIEW'] } },
    data: { status: 'APPROVED', decidedById: req.lmsUser.id, decidedRole: req.lmsUser.role, decidedAt: new Date(), decisionNote: 'Approved by coordinator' },
  });
  await audit(req, 'RESULT_APPROVE', 'CourseOffering', id, { after: { approved: updated.count } });
  if (offering.teacherId) await notify(offering.teacherId, { title: 'Results approved', message: `Results for ${offering.course.code} were approved by the coordinator.`, type: 'RESULT' });
  res.json({ message: `Approved ${updated.count} result(s)`, count: updated.count });
}));

// ============================================================
// APPROVALS  (generic workflow inbox for the coordinator)
// ============================================================
router.get('/approvals', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'createdAt' });
  const where = { assignedRole: req.lmsUser.role === 'Provost' ? undefined : 'CourseCoordinator' };
  if (req.lmsUser.role !== 'Provost') where.assignedRole = 'CourseCoordinator';
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.type) where.type = String(req.query.type);
  const [items, total] = await Promise.all([
    prisma.approvalRequest.findMany({ where, orderBy: q.orderBy, skip: q.skip, take: q.take }),
    prisma.approvalRequest.count({ where }),
  ]);
  const names = await nameMap(items.map((i) => i.requestedById));
  res.json(paginated(items.map((i) => ({ ...i, requestedByName: names[i.requestedById] || i.requestedById, payload: safeJson(i.payloadJson, {}) })), total, q));
}));

router.get('/approvals/:id', COORD_OR_GOV, asyncHandler(async (req, res) => {
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

// Create an approval request (coordinator can raise upward e.g. to Focal/Provost).
router.post('/approvals', COORD, validate([
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
  res.status(201).json({ request: ar });
}));

// Decide an approval request (approve / reject / escalate).
router.put('/approvals/:id/decide', COORD, validate([
  body('action').isIn(['APPROVE', 'REJECT', 'ESCALATE', 'IN_REVIEW']).withMessage('Invalid action'),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action, note } = req.body;
  const ar = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!ar) throw httpError(404, 'Approval request not found');
  if (ar.assignedRole !== 'CourseCoordinator' && req.lmsUser.role === 'CourseCoordinator') {
    throw httpError(403, 'This request is not assigned to you.');
  }
  const fromStatus = ar.status;
  let data = {};
  let histAction = action;
  if (action === 'APPROVE') {
    data = { status: 'APPROVED', decidedById: req.lmsUser.id, decidedRole: req.lmsUser.role, decisionNote: note || null, decidedAt: new Date() };
  } else if (action === 'REJECT') {
    data = { status: 'REJECTED', decidedById: req.lmsUser.id, decidedRole: req.lmsUser.role, decisionNote: note || null, decidedAt: new Date() };
  } else if (action === 'IN_REVIEW') {
    data = { status: 'IN_REVIEW' };
  } else if (action === 'ESCALATE') {
    const up = nextRole(ar.assignedRole) || 'Provost';
    data = { status: 'ESCALATED', assignedRole: up, escalatedToRole: up, decisionNote: note || null };
    histAction = 'ESCALATED';
  }
  const updated = await prisma.approvalRequest.update({ where: { id }, data });
  await prisma.approvalHistory.create({ data: { requestId: id, action: histAction, actorId: req.lmsUser.id, actorRole: req.lmsUser.role, fromStatus, toStatus: updated.status, note: note || null } });
  await audit(req, `APPROVAL_${histAction}`, 'ApprovalRequest', id, { before: { status: fromStatus }, after: { status: updated.status } });
  // Notify requester.
  await notify(ar.requestedById, { title: `Request ${updated.status.toLowerCase()}`, message: `Your request "${ar.title}" was ${updated.status.toLowerCase()}.`, type: 'APPEAL' });
  res.json({ request: updated });
}));

// ============================================================
// ESCALATIONS  (coordinator inbox + create + advance)
// ============================================================
router.get('/escalations', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const where = {};
  if (req.lmsUser.role === 'CourseCoordinator') where.currentRole = 'CourseCoordinator';
  if (req.query.status) where.status = String(req.query.status);
  const items = await prisma.escalation.findMany({ where, orderBy: { createdAt: 'desc' } });
  const names = await nameMap([...items.map((i) => i.raisedById), ...items.map((i) => i.studentId)]);
  res.json({ escalations: items.map((e) => ({ ...e, raisedByName: e.raisedById ? names[e.raisedById] : 'System', studentName: e.studentId ? names[e.studentId] : null })) });
}));

router.get('/escalations/:id', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const e = await prisma.escalation.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: 'asc' } } } });
  if (!e) throw httpError(404, 'Escalation not found');
  const names = await nameMap([e.raisedById, e.studentId, ...e.events.map((ev) => ev.actorId)]);
  res.json({ escalation: { ...e, raisedByName: e.raisedById ? names[e.raisedById] : 'System', studentName: e.studentId ? names[e.studentId] : null, events: e.events.map((ev) => ({ ...ev, actorName: ev.actorId ? names[ev.actorId] : 'System' })) } });
}));

router.post('/escalations', COORD, validate([
  body('category').trim().notEmpty(),
  body('subject').trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { category, subject, description, severity, studentId, offeringId, currentRole, dueDate } = req.body;
  const e = await prisma.escalation.create({
    data: {
      category, subject, description: description || null, severity: severity || 'MEDIUM',
      raisedById: req.lmsUser.id, raisedRole: req.lmsUser.role,
      currentRole: currentRole || 'CourseCoordinator', studentId: studentId || null,
      offeringId: offeringId ? parseInt(offeringId, 10) : null, dueDate: dueDate || null,
    },
  });
  await prisma.escalationEvent.create({ data: { escalationId: e.id, action: 'CREATED', actorId: req.lmsUser.id, actorRole: req.lmsUser.role, toRole: e.currentRole, note: 'Escalation opened.' } });
  await audit(req, 'ESCALATION_CREATE', 'Escalation', e.id, { after: e });
  res.status(201).json({ escalation: e });
}));

router.put('/escalations/:id/action', COORD, validate([
  body('action').isIn(['ESCALATE', 'RESOLVE', 'COMMENT', 'IN_PROGRESS', 'CLOSE']).withMessage('Invalid action'),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { action, note, resolution } = req.body;
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
  }
  const updated = await prisma.escalation.update({ where: { id }, data });
  await prisma.escalationEvent.create({ data: { escalationId: id, action, actorId: req.lmsUser.id, actorRole: req.lmsUser.role, fromRole: e.currentRole, toRole, note: note || resolution || null } });
  await audit(req, `ESCALATION_${action}`, 'Escalation', id, { before: { status: e.status, currentRole: e.currentRole }, after: { status: updated.status, currentRole: updated.currentRole } });
  res.json({ escalation: updated });
}));

// ============================================================
// COMMUNICATION — announcements + messaging + threads
// ============================================================
// Coordinator announcements (broadcast to students and/or teachers).
router.get('/announcements', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const items = await prisma.lmsAnnouncement.findMany({
    where: { isDeleted: false, authorId: req.lmsUser.id },
    include: { offering: { include: { course: { select: { code: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ announcements: items });
}));

router.post('/announcements', COORD, validate([
  body('title').trim().notEmpty(),
  body('message').trim().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { title, message, audience, offeringId } = req.body;
  const ann = await prisma.lmsAnnouncement.create({
    data: { authorId: req.lmsUser.id, title, message, audience: audience || 'ALL', offeringId: offeringId ? parseInt(offeringId, 10) : null },
  });
  // Build recipient list.
  let recipientIds = [];
  if (offeringId) {
    const regs = await prisma.courseRegistration.findMany({ where: { offeringId: parseInt(offeringId, 10), status: 'ENROLLED' }, select: { studentId: true } });
    recipientIds = regs.map((r) => r.studentId);
  } else {
    const roleFilter = audience === 'TEACHERS' ? ['Teacher'] : audience === 'STUDENTS' ? ['Student'] : ['Student', 'Teacher'];
    const users = await prisma.lmsUser.findMany({ where: { role: { in: roleFilter }, isActive: true }, select: { id: true } });
    recipientIds = users.map((u) => u.id);
  }
  await notifyMany(recipientIds, { title: `Announcement: ${title}`, message, type: 'ANNOUNCEMENT' });
  await audit(req, 'ANNOUNCEMENT_CREATE', 'LmsAnnouncement', ann.id, { after: ann });
  res.status(201).json({ announcement: ann, notified: recipientIds.length });
}));

router.delete('/announcements/:id', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await prisma.lmsAnnouncement.update({ where: { id }, data: { isDeleted: true } });
  await audit(req, 'ANNOUNCEMENT_DELETE', 'LmsAnnouncement', id, {});
  res.json({ message: 'Announcement deleted' });
}));

// Messaging — contacts (teachers + students) and direct threads.
router.get('/messages/contacts', COORD_OR_GOV, asyncHandler(async (req, res) => {
  // DEPARTMENT ISOLATION: a coordinator may message their OWN department's
  // teachers & students, plus governance/other-staff roles (cross-cutting).
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const staffRoles = ['CourseCoordinator', 'FocalPerson', 'ExamController', 'QECCoordinator', 'Provost'];
  let where;
  if (scope.isGov) {
    where = { role: { in: ['Teacher', 'Student', ...staffRoles] }, isActive: true, id: { not: req.lmsUser.id } };
  } else {
    const deptPeopleIds = [...new Set([...scope.studentIds, ...scope.teacherIds])];
    where = {
      isActive: true,
      id: { not: req.lmsUser.id },
      OR: [
        { id: { in: deptPeopleIds.length ? deptPeopleIds : ['__none__'] } },
        { role: { in: staffRoles } },
      ],
    };
  }
  const users = await prisma.lmsUser.findMany({
    where,
    select: { id: true, username: true, role: true, profile: { select: { fullName: true } } },
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
  });
  res.json({ contacts: users.map((u) => ({ id: u.id, username: u.username, name: displayName(u), role: u.role })) });
}));

router.get('/messages/:userId', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const me = req.lmsUser.id;
  const other = req.params.userId;
  const msgs = await prisma.lmsThreadMessage.findMany({
    where: { OR: [{ senderId: me, recipientId: other }, { senderId: other, recipientId: me }] },
    orderBy: { createdAt: 'asc' },
  });
  await prisma.lmsThreadMessage.updateMany({ where: { senderId: other, recipientId: me, isRead: false }, data: { isRead: true } });
  res.json({ messages: msgs });
}));

router.post('/messages/:userId', COORD, validate([body('body').trim().notEmpty()]), asyncHandler(async (req, res) => {
  const msg = await prisma.lmsThreadMessage.create({
    data: { senderId: req.lmsUser.id, recipientId: req.params.userId, body: req.body.body, subject: req.body.subject || null },
  });
  await notify(req.params.userId, { title: 'New message', message: `${req.lmsUser.username} sent you a message`, type: 'MESSAGE', link: '/admin/messages' });
  res.status(201).json({ message: msg });
}));

// ============================================================
// REPORTS
// ============================================================
router.get('/reports/:kind', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const kind = req.params.kind;
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  // DEPARTMENT ISOLATION: every report is limited to this coordinator's own
  // department (offerings / students). Governance roles are unscoped.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
  const offNestedW = scope.isGov ? {} : { offering: { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } } };
  const studW = scope.isGov ? {} : { id: { in: scope.studentIds.length ? scope.studentIds : ['__none__'] } };

  if (kind === 'courses') {
    const offerings = await prisma.courseOffering.findMany({
      where: { isDeleted: false, termId, ...offW },
      include: { course: true, teacher: { select: { username: true } }, _count: { select: { registrations: true, assignments: true, quizzes: true } }, results: { select: { status: true, totalPercent: true } } },
    });
    return res.json({ report: 'courses', term: term ? term.title : null, rows: offerings.map((o) => {
      const pub = o.results.filter((r) => r.status === 'PUBLISHED');
      const pass = pub.filter((r) => r.totalPercent >= 50).length;
      return { code: o.course.code, title: o.course.title, credits: o.course.creditHours, teacher: o.teacher ? o.teacher.username : 'Unassigned', students: o._count.registrations, assignments: o._count.assignments, quizzes: o._count.quizzes, published: pub.length, passRate: pub.length ? Math.round((pass / pub.length) * 100) : 0 };
    }) });
  }

  if (kind === 'faculty') {
    const offs = await prisma.courseOffering.findMany({ where: { isDeleted: false, termId, teacherId: { not: null }, ...offW }, include: { course: { select: { creditHours: true } }, teacher: { select: { id: true, username: true } }, _count: { select: { registrations: true } } } });
    const map = {};
    for (const o of offs) {
      const k = o.teacherId;
      if (!map[k]) map[k] = { teacher: o.teacher.username, courses: 0, credits: 0, students: 0 };
      map[k].courses += 1; map[k].credits += o.course.creditHours; map[k].students += o._count.registrations;
    }
    return res.json({ report: 'faculty', rows: Object.values(map) });
  }

  if (kind === 'students') {
    const students = await prisma.lmsUser.findMany({ where: { role: 'Student', isActive: true, ...studW }, include: { profile: { select: { fullName: true, rollNumber: true, session: true } }, _count: { select: { registrations: true } } } });
    return res.json({ report: 'students', rows: students.map((s) => ({ roll: s.username, name: displayName(s), session: s.profile ? s.profile.session : null, registrations: s._count.registrations })) });
  }

  if (kind === 'attendance') {
    const offerings = await prisma.courseOffering.findMany({ where: { isDeleted: false, termId, ...offW }, include: { course: true, attendanceSessions: { include: { records: { select: { status: true } } } } } });
    return res.json({ report: 'attendance', rows: offerings.map((o) => ({ code: o.course.code, title: o.course.title, sessions: o.attendanceSessions.length, attendancePct: attendancePct(o.attendanceSessions) })) });
  }

  if (kind === 'semester' || kind === 'performance') {
    const results = await prisma.courseResult.findMany({ where: { status: 'PUBLISHED', offering: { termId, ...(scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } }) } }, include: { offering: { include: { course: { select: { code: true, creditHours: true } } } } } });
    const dist = { A: 0, 'A-': 0, 'B+': 0, B: 0, 'B-': 0, 'C+': 0, C: 0, 'C-': 0, 'D+': 0, D: 0, F: 0 };
    let totalPct = 0;
    for (const r of results) { if (dist[r.letterGrade] !== undefined) dist[r.letterGrade] += 1; totalPct += r.totalPercent; }
    const pass = results.filter((r) => r.totalPercent >= 50).length;
    return res.json({ report: kind, term: term ? term.title : null, total: results.length, passRate: results.length ? Math.round((pass / results.length) * 100) : 0, avgPercent: results.length ? Math.round((totalPct / results.length) * 10) / 10 : 0, gradeDistribution: dist });
  }

  if (kind === 'assignment' || kind === 'quiz') {
    const offerings = await prisma.courseOffering.findMany({ where: { isDeleted: false, termId, ...offW }, include: { course: true, assignments: { where: { isDeleted: false }, include: { submissions: { select: { status: true } } } }, quizzes: { where: { isDeleted: false }, include: { attempts: { select: { status: true, score: true } } } } } });
    return res.json({ report: kind, rows: offerings.map((o) => kind === 'assignment'
      ? { code: o.course.code, assignments: o.assignments.length, submissions: o.assignments.reduce((a, x) => a + x.submissions.length, 0), graded: o.assignments.reduce((a, x) => a + x.submissions.filter((s) => s.status === 'GRADED').length, 0) }
      : { code: o.course.code, quizzes: o.quizzes.length, attempts: o.quizzes.reduce((a, x) => a + x.attempts.length, 0) }) });
  }

  throw httpError(400, `Unknown report kind: ${kind}`);
}));

// ============================================================
// ANALYTICS
// ============================================================
router.get('/analytics', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  // DEPARTMENT ISOLATION: analytics limited to this coordinator's offerings.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
  const offNestedIdW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };

  const [offerings, results] = await Promise.all([
    prisma.courseOffering.findMany({ where: { isDeleted: false, termId, ...offW }, include: { course: true, teacher: { select: { username: true } }, attendanceSessions: { include: { records: { select: { status: true } } } }, results: { select: { status: true, totalPercent: true } }, _count: { select: { registrations: true } } } }),
    prisma.courseResult.findMany({ where: { status: 'PUBLISHED', offering: { termId, ...offNestedIdW } }, include: { offering: { include: { teacher: { select: { username: true } }, course: { select: { code: true } } } } } }),
  ]);

  // Course completion analytics.
  const courseCompletion = offerings.map((o) => {
    const pub = o.results.filter((r) => r.status === 'PUBLISHED').length;
    const completion = o._count.registrations ? Math.round((pub / o._count.registrations) * 100) : 0;
    return { course: o.course.code, completion, attendancePct: attendancePct(o.attendanceSessions) };
  });

  // Faculty performance analytics (avg result % per teacher).
  const facMap = {};
  for (const r of results) {
    const t = r.offering.teacher ? r.offering.teacher.username : 'Unassigned';
    if (!facMap[t]) facMap[t] = { teacher: t, sum: 0, n: 0, pass: 0 };
    facMap[t].sum += r.totalPercent; facMap[t].n += 1; if (r.totalPercent >= 50) facMap[t].pass += 1;
  }
  const facultyPerformance = Object.values(facMap).map((f) => ({ teacher: f.teacher, avgPercent: f.n ? Math.round((f.sum / f.n) * 10) / 10 : 0, passRate: f.n ? Math.round((f.pass / f.n) * 100) : 0, results: f.n }));

  // Student performance distribution.
  const buckets = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '50-59': 0, '<50': 0 };
  for (const r of results) {
    const p = r.totalPercent;
    if (p >= 90) buckets['90-100'] += 1; else if (p >= 80) buckets['80-89'] += 1; else if (p >= 70) buckets['70-79'] += 1;
    else if (p >= 60) buckets['60-69'] += 1; else if (p >= 50) buckets['50-59'] += 1; else buckets['<50'] += 1;
  }

  // Risk detection: low-attendance + failing courses.
  const riskCourses = courseCompletion.filter((c) => c.attendancePct > 0 && c.attendancePct < 75).map((c) => c.course);

  res.json({ term: term ? term.title : null, courseCompletion, facultyPerformance, studentDistribution: buckets, riskCourses });
}));

// ============================================================
// AUDIT TRAIL  (coordinator-visible academic action log)
// ============================================================
router.get('/audit', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'createdAt' });
  const where = {};
  if (req.query.action) where.action = { contains: String(req.query.action) };
  if (req.query.entity) where.entity = String(req.query.entity);
  if (req.query.actorId) where.actorId = String(req.query.actorId);
  const [items, total] = await Promise.all([
    prisma.lmsAuditLog.findMany({ where, orderBy: q.orderBy, skip: q.skip, take: q.take, include: { actor: { select: { username: true, role: true } } } }),
    prisma.lmsAuditLog.count({ where }),
  ]);
  res.json(paginated(items.map((i) => ({ id: i.id, action: i.action, entity: i.entity, entityId: i.entityId, actor: i.actor ? i.actor.username : 'System', actorRole: i.actorRole, ip: i.ip, createdAt: i.createdAt })), total, q));
}));

// ============================================================
// NOTIFICATIONS / ALERTS (coordinator's own inbox)
// ============================================================
router.get('/notifications', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const items = await prisma.lmsNotification.findMany({ where: { userId: req.lmsUser.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  const unread = await prisma.lmsNotification.count({ where: { userId: req.lmsUser.id, isRead: false } });
  res.json({ notifications: items, unread });
}));

router.put('/notifications/:id/read', COORD_OR_GOV, asyncHandler(async (req, res) => {
  await prisma.lmsNotification.updateMany({ where: { id: parseInt(req.params.id, 10), userId: req.lmsUser.id }, data: { isRead: true } });
  res.json({ message: 'ok' });
}));

router.put('/notifications/read-all', COORD_OR_GOV, asyncHandler(async (req, res) => {
  await prisma.lmsNotification.updateMany({ where: { userId: req.lmsUser.id, isRead: false }, data: { isRead: true } });
  res.json({ message: 'ok' });
}));

// Students list (for allocation / search / messaging).
router.get('/students', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const q = parseListQuery(req.query, { defaultSort: 'username' });
  const where = { role: 'Student' };
  // DEPARTMENT ISOLATION: a Course Coordinator only ever sees their own
  // department's students. Governance roles see all.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  if (!scope.isGov) {
    where.id = { in: scope.studentIds.length ? scope.studentIds : ['__none__'] };
  }
  if (req.query.search) where.OR = [{ username: { contains: String(req.query.search) } }];
  const [items, total] = await Promise.all([
    prisma.lmsUser.findMany({ where, orderBy: { username: q.sortDir }, skip: q.skip, take: q.take, select: { id: true, username: true, isActive: true, profile: { select: { fullName: true, rollNumber: true, session: true, program: true } }, _count: { select: { registrations: true } } } }),
    prisma.lmsUser.count({ where }),
  ]);
  res.json(paginated(items.map((s) => ({ id: s.id, roll: s.username, name: displayName(s), isActive: s.isActive, session: s.profile ? s.profile.session : null, registrations: s._count.registrations })), total, q));
}));

// ============================================================
// SECTION MANAGEMENT — roster, auto-create, student transfer
// (Default section capacity for the coordinator is 150 students.)
// ============================================================
const DEFAULT_SECTION_CAPACITY = 150;

/* Roster for an offering: every enrolled student + which section they sit in.
   Powers the drag-and-drop student transfer board. */
router.get('/offerings/:offeringId/roster', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const offeringId = parseInt(req.params.offeringId, 10);
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: { course: { include: { program: true, semester: true } } },
  });
  if (!offering) throw httpError(404, 'Offering not found');
  // DEPARTMENT ISOLATION: offering must belong to own department.
  await assertOfferingInScope(req.lmsUser, offeringId);

  const [sections, registrations] = await Promise.all([
    prisma.section.findMany({
      where: { offeringId, isDeleted: false },
      include: { _count: { select: { registrations: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.courseRegistration.findMany({
      where: { offeringId, status: { in: ['ENROLLED', 'COMPLETED'] } },
      include: {
        student: { select: { id: true, username: true, isActive: true, profile: { select: { fullName: true, rollNumber: true, session: true, program: true } } } },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  res.json({
    offering: {
      id: offering.id,
      course: { code: offering.course.code, title: offering.course.title, semester: offering.course.semester ? offering.course.semester.number : null, program: offering.course.program ? offering.course.program.shortForm : null },
    },
    sections: sections.map((s) => ({ id: s.id, name: s.name, capacity: s.capacity, room: s.room, enrolled: s._count.registrations })),
    students: registrations.map((r) => ({
      registrationId: r.id,
      studentId: r.studentId,
      sectionId: r.sectionId,
      roll: r.student.username,
      name: displayName(r.student),
      isActive: r.student.isActive,
      session: r.student.profile ? r.student.profile.session : null,
      status: r.status,
    })),
  });
}));

/* Auto-create sections for an offering: split the enrolled students evenly
   across N sections of the given capacity (default 150). Existing sections
   are left intact; new sections are named after the last existing letter. */
router.post('/offerings/:offeringId/sections/auto', COORD, asyncHandler(async (req, res) => {
  const offeringId = parseInt(req.params.offeringId, 10);
  const offering = await prisma.courseOffering.findUnique({ where: { id: offeringId } });
  if (!offering) throw httpError(404, 'Offering not found');
  // DEPARTMENT ISOLATION: offering must belong to own department.
  await assertOfferingInScope(req.lmsUser, offeringId);

  const capacity = req.body.capacity ? parseInt(req.body.capacity, 10) : DEFAULT_SECTION_CAPACITY;
  if (!capacity || capacity < 1) throw httpError(400, 'Invalid capacity');

  const [existing, regs] = await Promise.all([
    prisma.section.findMany({ where: { offeringId, isDeleted: false }, orderBy: { name: 'asc' } }),
    prisma.courseRegistration.findMany({ where: { offeringId, status: { in: ['ENROLLED', 'COMPLETED'] } }, orderBy: { id: 'asc' } }),
  ]);

  // How many sections do we need to seat everyone (at least 1)?
  const needed = Math.max(1, Math.ceil(regs.length / capacity));
  const toCreate = Math.max(0, needed - existing.length);
  if (toCreate === 0) {
    return res.json({ message: 'Enough sections already exist', created: 0, sections: existing });
  }

  // Next section letters (A, B, C…). Find the highest existing letter.
  const usedNames = new Set(existing.map((s) => s.name.toUpperCase()));
  const created = [];
  let charCode = 65; // 'A'
  for (let i = 0; i < toCreate; i++) {
    // find next free letter
    while (usedNames.has(String.fromCharCode(charCode))) charCode++;
    const name = String.fromCharCode(charCode);
    usedNames.add(name);
    const sec = await prisma.section.create({
      data: { offeringId, name, capacity, teacherId: offering.teacherId || null, room: null },
    });
    created.push(sec);
    await audit(req, 'SECTION_CREATE', 'Section', sec.id, { after: sec });
  }

  // Distribute UNASSIGNED registrations round-robin across all sections.
  const allSections = [...existing, ...created];
  const unassigned = regs.filter((r) => !r.sectionId);
  for (let i = 0; i < unassigned.length; i++) {
    const target = allSections[i % allSections.length];
    await prisma.courseRegistration.update({ where: { id: unassigned[i].id }, data: { sectionId: target.id } });
  }
  if (unassigned.length) await audit(req, 'SECTION_AUTO_ALLOCATE', 'CourseOffering', offeringId, { after: { distributed: unassigned.length, sections: allSections.length } });

  res.status(201).json({ message: `Created ${created.length} section(s)`, created: created.length, distributed: unassigned.length, sections: allSections });
}));

/* Transfer a single student (registration) to another section of the SAME
   offering. Enforces the target section capacity. Powers drag & drop. */
router.put('/registrations/:id/section', COORD, validate([
  body('sectionId').optional({ nullable: true }),
]), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const reg = await prisma.courseRegistration.findUnique({ where: { id } });
  if (!reg) throw httpError(404, 'Registration not found');
  // DEPARTMENT ISOLATION: registration's offering must belong to own department.
  await assertOfferingInScope(req.lmsUser, reg.offeringId);

  const rawTarget = req.body.sectionId;
  const targetSectionId = rawTarget == null || rawTarget === '' ? null : parseInt(rawTarget, 10);

  if (targetSectionId != null) {
    const target = await prisma.section.findUnique({
      where: { id: targetSectionId },
      include: { _count: { select: { registrations: true } } },
    });
    if (!target || target.isDeleted) throw httpError(404, 'Target section not found');
    if (target.offeringId !== reg.offeringId) throw httpError(400, 'Section belongs to a different offering');
    // Capacity guard (skip if the student is already in this section)
    if (reg.sectionId !== targetSectionId && target._count.registrations >= target.capacity) {
      throw httpError(409, `Section ${target.name} is full (${target.capacity}/${target.capacity})`);
    }
  }

  const before = { sectionId: reg.sectionId };
  const updated = await prisma.courseRegistration.update({ where: { id }, data: { sectionId: targetSectionId } });
  await audit(req, 'STUDENT_SECTION_TRANSFER', 'CourseRegistration', id, { before, after: { sectionId: targetSectionId } });
  res.json({ registration: updated });
}));

// ============================================================
// WEEKLY SCHEDULE / TIMETABLE
//   • Full timetable view (all offerings of current term)
//   • Create / edit (drag&drop move) / delete slots
//   • Clash detection: teacher, room, and section/offering conflicts
//   • Auto timetable generator (clash-free)
// ============================================================
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toMinutes = (t) => {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

/* Detect clashes for a candidate slot against all existing slots in the term.
   Returns an array of clash descriptors. excludeId skips a slot (for edits). */
async function detectSlotClashes({ termId, offeringId, dayOfWeek, startTime, endTime, room, excludeId }) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start == null || end == null || end <= start) {
    return [{ type: 'INVALID_TIME', message: 'End time must be after start time (HH:MM).' }];
  }
  // The candidate offering's teacher (teacher clash) and the offering itself.
  const candidateOffering = await prisma.courseOffering.findUnique({ where: { id: offeringId } });
  if (!candidateOffering) return [{ type: 'NO_OFFERING', message: 'Offering not found.' }];

  const sameDaySlots = await prisma.scheduleSlot.findMany({
    where: { dayOfWeek, isDeleted: false, ...(excludeId ? { id: { not: excludeId } } : {}), offering: { termId, isDeleted: false } },
    include: { offering: { include: { course: true } } },
  });

  const clashes = [];
  for (const s of sameDaySlots) {
    const sStart = toMinutes(s.startTime);
    const sEnd = toMinutes(s.endTime);
    if (!overlaps(start, end, sStart, sEnd)) continue;
    // Teacher clash
    if (candidateOffering.teacherId && s.offering.teacherId && candidateOffering.teacherId === s.offering.teacherId) {
      clashes.push({ type: 'TEACHER', slotId: s.id, message: `Teacher already teaches ${s.offering.course.code} at ${s.startTime}-${s.endTime}` });
    }
    // Room clash
    if (room && s.room && room.toLowerCase() === s.room.toLowerCase()) {
      clashes.push({ type: 'ROOM', slotId: s.id, message: `Room "${room}" is occupied by ${s.offering.course.code} at ${s.startTime}-${s.endTime}` });
    }
    // Same-offering clash (a section/offering cannot be in two places at once)
    if (s.offeringId === offeringId) {
      clashes.push({ type: 'SECTION', slotId: s.id, message: `${candidateOffering ? '' : ''}This offering already has a class at ${s.startTime}-${s.endTime}` });
    }
  }
  return clashes;
}

/* Whether an offering's course carries a distinct Lab component. */
async function offeringHasLab(offeringId) {
  const off = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: { course: { select: { hasLab: true } } },
  });
  return !!(off && off.course && off.course.hasLab === true);
}

/* Standard weekly period grid + rooms reused by auto-generation and the
   automatic Lab-slot placement so behaviour is consistent everywhere. */
const SCHEDULE_DAYS = [1, 2, 3, 4, 5];
const SCHEDULE_PERIODS = [
  ['08:00', '09:30'], ['09:30', '11:00'], ['11:00', '12:30'],
  ['12:30', '14:00'], ['14:00', '15:30'], ['15:30', '17:00'],
];
const LAB_ROOMS = ['Lab-1', 'Lab-2', 'Lab-3'];

/**
 * Ensure a course WITH a Lab component has an auto-created LAB slot alongside
 * its THEORY slot. The Lab slot shares the SAME offering (hence the SAME
 * instructor — Theory & Lab are always taught by the same instructor; there is
 * no separate-instructor option). Finds the first clash-free period. Idempotent:
 * if a lab slot already exists for the offering it does nothing.
 *
 * @returns {object|null} the created lab slot, or null if none was created.
 */
async function ensureLabSlot(termId, offeringId, { roomHint } = {}) {
  if (!(await offeringHasLab(offeringId))) return null;
  const existingLab = await prisma.scheduleSlot.findFirst({
    where: { offeringId, isDeleted: false, slotType: 'LAB' },
  });
  if (existingLab) return null; // already has a lab slot
  let roomCursor = 0;
  for (const day of SCHEDULE_DAYS) {
    for (const [startTime, endTime] of SCHEDULE_PERIODS) {
      const room = roomHint || LAB_ROOMS[roomCursor % LAB_ROOMS.length];
      const clashes = await detectSlotClashes({ termId, offeringId, dayOfWeek: day, startTime, endTime, room });
      if (clashes.length === 0) {
        return prisma.scheduleSlot.create({
          data: { offeringId, dayOfWeek: day, startTime, endTime, room, mode: 'ONSITE', slotType: 'LAB' },
        });
      }
      roomCursor += 1;
    }
  }
  return null;
}

/* GET full weekly timetable for the current (or given) term. */
router.get('/schedule', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = req.query.termId ? parseInt(req.query.termId, 10) : (term ? term.id : -1);
  // DEPARTMENT ISOLATION: only slots for this coordinator's own offerings.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offNestedIdW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
  const slots = await prisma.scheduleSlot.findMany({
    where: { isDeleted: false, offering: { termId, isDeleted: false, ...offNestedIdW } },
    include: { offering: { include: { course: { include: { semester: true } }, teacher: { select: { id: true, username: true } } } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
  const byDay = DAYS.map((name, i) => ({ day: name, dayOfWeek: i, slots: [] }));
  for (const s of slots) {
    byDay[s.dayOfWeek].slots.push({
      id: s.id,
      offeringId: s.offeringId,
      courseCode: s.offering.course.code,
      courseTitle: s.offering.course.title,
      semester: s.offering.course.semester ? s.offering.course.semester.number : null,
      teacherId: s.offering.teacherId,
      teacher: s.offering.teacher ? s.offering.teacher.username : null,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
      mode: s.mode,
      slotType: s.slotType || 'THEORY',
    });
  }
  res.json({ termId, days: byDay, totalSlots: slots.length });
}));

/* Clash check (used before creating/moving a slot in the UI). */
router.post('/schedule/clash-check', COORD, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = req.body.termId ? parseInt(req.body.termId, 10) : (term ? term.id : -1);
  // DEPARTMENT ISOLATION: offering must belong to this coordinator's department.
  await assertOfferingInScope(req.lmsUser, parseInt(req.body.offeringId, 10));
  const clashes = await detectSlotClashes({
    termId,
    offeringId: parseInt(req.body.offeringId, 10),
    dayOfWeek: parseInt(req.body.dayOfWeek, 10),
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    room: req.body.room || null,
    excludeId: req.body.excludeId ? parseInt(req.body.excludeId, 10) : null,
  });
  res.json({ clashes, ok: clashes.length === 0 });
}));

/* Create a schedule slot (rejects on clash unless force=true). */
router.post('/schedule', COORD, validate([
  body('offeringId').notEmpty(),
  body('dayOfWeek').notEmpty(),
  body('startTime').matches(/^\d{1,2}:\d{2}$/).withMessage('startTime must be HH:MM'),
  body('endTime').matches(/^\d{1,2}:\d{2}$/).withMessage('endTime must be HH:MM'),
]), asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const offeringId = parseInt(req.body.offeringId, 10);
  const dayOfWeek = parseInt(req.body.dayOfWeek, 10);
  const { startTime, endTime, room = null, mode = 'ONSITE', force = false } = req.body;

  // DEPARTMENT ISOLATION: can only schedule offerings in own department.
  await assertOfferingInScope(req.lmsUser, offeringId);

  const clashes = await detectSlotClashes({ termId, offeringId, dayOfWeek, startTime, endTime, room });
  if (clashes.length && !force) {
    return res.status(409).json({ error: 'Schedule clash detected', clashes });
  }
  const slot = await prisma.scheduleSlot.create({ data: { offeringId, dayOfWeek, startTime, endTime, room, mode, slotType: 'THEORY' } });
  await audit(req, 'SCHEDULE_SLOT_CREATE', 'ScheduleSlot', slot.id, { after: slot });
  // Req 2: auto-create a Lab slot for courses that have a Lab component (same
  // offering => same instructor). Idempotent — skips if a LAB slot exists.
  const labSlot = await ensureLabSlot(termId, offeringId);
  if (labSlot) await audit(req, 'SCHEDULE_LAB_AUTO_CREATE', 'ScheduleSlot', labSlot.id, { after: labSlot });
  res.status(201).json({ slot, labSlot: labSlot || null, clashes });
}));

/* Edit / move a slot (drag&drop). Re-checks clashes (excluding itself). */
router.put('/schedule/:id', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.scheduleSlot.findUnique({ where: { id } });
  if (!before) throw httpError(404, 'Schedule slot not found');
  // DEPARTMENT ISOLATION: slot's offering must belong to own department.
  await assertOfferingInScope(req.lmsUser, before.offeringId);
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  const dayOfWeek = req.body.dayOfWeek != null ? parseInt(req.body.dayOfWeek, 10) : before.dayOfWeek;
  const startTime = req.body.startTime ?? before.startTime;
  const endTime = req.body.endTime ?? before.endTime;
  const room = req.body.room !== undefined ? req.body.room : before.room;
  const mode = req.body.mode ?? before.mode;
  const force = !!req.body.force;

  const clashes = await detectSlotClashes({ termId, offeringId: before.offeringId, dayOfWeek, startTime, endTime, room, excludeId: id });
  if (clashes.length && !force) {
    return res.status(409).json({ error: 'Schedule clash detected', clashes });
  }
  // Preserve slotType (a LAB slot stays LAB; legacy null => THEORY).
  const slot = await prisma.scheduleSlot.update({ where: { id }, data: { dayOfWeek, startTime, endTime, room, mode, slotType: before.slotType || 'THEORY' } });
  await audit(req, 'SCHEDULE_SLOT_UPDATE', 'ScheduleSlot', id, { before, after: slot });
  // Req 2: guarantee a Lab slot still exists for lab courses (in case none yet).
  const labSlot = await ensureLabSlot(termId, before.offeringId);
  if (labSlot) await audit(req, 'SCHEDULE_LAB_AUTO_CREATE', 'ScheduleSlot', labSlot.id, { after: labSlot });
  res.json({ slot, labSlot: labSlot || null, clashes });
}));

/* Delete a slot. */
router.delete('/schedule/:id', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.scheduleSlot.findUnique({ where: { id } });
  if (!before) throw httpError(404, 'Schedule slot not found');
  // DEPARTMENT ISOLATION: slot's offering must belong to own department.
  await assertOfferingInScope(req.lmsUser, before.offeringId);
  // Req 2: deleting the THEORY slot also removes its auto-created LAB slot(s),
  // since the lab cannot exist without the theory class it accompanies.
  await prisma.scheduleSlot.update({ where: { id }, data: { isDeleted: true } });
  if ((before.slotType || 'THEORY') === 'THEORY') {
    await prisma.scheduleSlot.updateMany({
      where: { offeringId: before.offeringId, isDeleted: false, slotType: 'LAB' },
      data: { isDeleted: true },
    });
  }
  await audit(req, 'SCHEDULE_SLOT_DELETE', 'ScheduleSlot', id, { before });
  res.json({ message: 'Schedule slot deleted' });
}));

/* Auto timetable generator: assigns clash-free weekly slots to every
   offering of the current term that has none yet. Uses Mon-Fri and a set
   of standard period start times; picks the first non-clashing slot. */
router.post('/schedule/auto-generate', COORD, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  if (!term) throw httpError(400, 'No active term');
  const termId = term.id;
  const clearExisting = !!req.body.clearExisting;

  // DEPARTMENT ISOLATION: auto-generate only for this coordinator's own offerings.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offNestedIdW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };

  const offerings = await prisma.courseOffering.findMany({
    where: { termId, isDeleted: false, ...offNestedIdW },
    include: { course: true, scheduleSlots: { where: { isDeleted: false } } },
    orderBy: { id: 'asc' },
  });

  if (clearExisting) {
    await prisma.scheduleSlot.updateMany({ where: { isDeleted: false, offering: { termId, ...offNestedIdW } }, data: { isDeleted: true } });
  }

  // Period grid: Mon(1)..Fri(5), standard 1h30 periods.
  const days = [1, 2, 3, 4, 5];
  const periods = [
    ['08:00', '09:30'], ['09:30', '11:00'], ['11:00', '12:30'],
    ['12:30', '14:00'], ['14:00', '15:30'], ['15:30', '17:00'],
  ];
  const rooms = ['R-101', 'R-102', 'R-103', 'Lab-1', 'Lab-2'];

  let created = 0;
  let labCreated = 0;
  let roomCursor = 0;
  for (const o of offerings) {
    if (!clearExisting && o.scheduleSlots.length > 0) continue; // already scheduled
    // Each offering gets 2 weekly meetings.
    let placed = 0;
    outer:
    for (const day of days) {
      for (const [startTime, endTime] of periods) {
        if (placed >= 2) break outer;
        const room = rooms[roomCursor % rooms.length];
        const clashes = await detectSlotClashes({ termId, offeringId: o.id, dayOfWeek: day, startTime, endTime, room });
        if (clashes.length === 0) {
          await prisma.scheduleSlot.create({ data: { offeringId: o.id, dayOfWeek: day, startTime, endTime, room, mode: 'ONSITE', slotType: 'THEORY' } });
          created += 1;
          placed += 1;
          roomCursor += 1;
        }
      }
    }
    // Req 2: for lab courses, auto-add a separate Lab slot (same instructor).
    if (placed > 0) {
      const labSlot = await ensureLabSlot(termId, o.id);
      if (labSlot) { created += 1; labCreated += 1; }
    }
  }
  await audit(req, 'SCHEDULE_AUTO_GENERATE', 'AcademicTerm', termId, { after: { created, labCreated, clearExisting } });
  res.json({ message: `Auto-generated ${created} class slot(s)${labCreated ? ` (${labCreated} lab)` : ''}`, created, labCreated });
}));

// ============================================================
// CLASS MONITORING — real-time live/scheduled/ongoing/completed classes
//   Read-only oversight: instructor details + student participation.
// ============================================================
router.get('/monitoring/classes', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const now = new Date();
  // DEPARTMENT ISOLATION: only live classes for this coordinator's own offerings.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const offW = scope.isGov ? {} : { offeringId: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
  const liveClasses = await prisma.liveClass.findMany({
    where: { isDeleted: false, ...offW },
    include: {
      offering: {
        include: {
          course: { include: { semester: true } },
          teacher: { select: { id: true, username: true, profile: { select: { fullName: true } } } },
          _count: { select: { registrations: true } },
        },
      },
    },
    orderBy: { scheduledAt: 'desc' },
  });

  // Enrich + derive a real-time effective status.
  const items = liveClasses.map((lc) => {
    const start = new Date(lc.scheduledAt);
    const end = new Date(start.getTime() + (lc.durationMin || 60) * 60000);
    let effective = lc.status;
    if (lc.status === 'CANCELLED') effective = 'CANCELLED';
    else if (lc.status === 'ENDED') effective = 'COMPLETED';
    else if (lc.status === 'LIVE') effective = 'LIVE';
    else {
      // SCHEDULED → derive ONGOING / SCHEDULED / COMPLETED from the clock
      if (now >= start && now <= end) effective = 'ONGOING';
      else if (now > end) effective = 'COMPLETED';
      else effective = 'SCHEDULED';
    }
    return {
      id: lc.id,
      offeringId: lc.offeringId,
      title: lc.title,
      courseCode: lc.offering.course.code,
      courseTitle: lc.offering.course.title,
      semester: lc.offering.course.semester ? lc.offering.course.semester.number : null,
      instructor: lc.offering.teacher ? (lc.offering.teacher.profile?.fullName || lc.offering.teacher.username) : 'Unassigned',
      instructorId: lc.offering.teacherId,
      scheduledAt: lc.scheduledAt,
      durationMin: lc.durationMin,
      rawStatus: lc.status,
      status: effective,
      enrolled: lc.offering._count.registrations,
      joinUrl: lc.joinUrl,
      recordingUrl: lc.recordingUrl,
      mode: 'ONLINE',
    };
  });

  // Participation: for COMPLETED/ONGOING classes, look up the attendance
  // session on that date (if any) for present counts.
  const offeringDatePairs = items.map((i) => ({ offeringId: i.offeringId, date: new Date(i.scheduledAt).toISOString().slice(0, 10) }));
  const sessions = await prisma.attendanceSession.findMany({
    where: { OR: offeringDatePairs.map((p) => ({ offeringId: p.offeringId, date: p.date })) },
    include: { records: true },
  });
  const sessionMap = {};
  for (const s of sessions) {
    const present = s.records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    sessionMap[`${s.offeringId}|${s.date}`] = { present, total: s.records.length };
  }
  items.forEach((i) => {
    const key = `${i.offeringId}|${new Date(i.scheduledAt).toISOString().slice(0, 10)}`;
    const part = sessionMap[key];
    i.participation = part ? part.present : null;
    i.participationTotal = part ? part.total : null;
    i.participationPct = part && part.total ? Math.round((part.present / part.total) * 100) : null;
  });

  const summary = {
    total: items.length,
    live: items.filter((i) => i.status === 'LIVE').length,
    ongoing: items.filter((i) => i.status === 'ONGOING').length,
    scheduled: items.filter((i) => i.status === 'SCHEDULED').length,
    completed: items.filter((i) => i.status === 'COMPLETED').length,
    cancelled: items.filter((i) => i.status === 'CANCELLED').length,
  };

  res.json({ generatedAt: now.toISOString(), summary, classes: items });
}));

// ============================================================
// LIVE CLASS SCHEDULING (Course Coordinator ONLY) — client requirement 2.1
// ------------------------------------------------------------
// The Course Coordinator is the SOLE owner of the live-class timetable.
// Teachers can no longer schedule/reschedule/edit/delete classes; they may
// only run (Go Live / Join / End) the classes the coordinator scheduled for
// their own offerings.
//
// These endpoints CREATE / UPDATE / DELETE LiveClass records, scoped by
// department isolation (a coordinator may only touch offerings in their own
// department). When BigBlueButton is configured, the meeting is pre-created
// so the attendee join URL is ready immediately. The assigned teacher and all
// enrolled students are notified.
// ============================================================

// List the offerings this coordinator can schedule live classes for, each with
// its assigned teacher (so the scheduling UI can show "who will host").
router.get('/live-classes/offerings', COORD, asyncHandler(async (req, res) => {
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const offW = scope.isGov ? {} : { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, ...offW },
    include: {
      course: { include: { semester: true } },
      sections: true,
      teacher: { select: { id: true, username: true, profile: { select: { fullName: true } } } },
    },
    orderBy: { id: 'asc' },
  });
  res.json({
    offerings: offerings.map((o) => ({
      id: o.id,
      courseCode: o.course ? o.course.code : '',
      courseTitle: o.course ? o.course.title : '',
      section: (o.sections && o.sections.length) ? o.sections.map((s) => s.name).join(', ') : null,
      semester: o.course && o.course.semester ? o.course.semester.number : null,
      teacherId: o.teacherId,
      teacher: o.teacher ? (o.teacher.profile?.fullName || o.teacher.username) : 'Unassigned',
    })),
  });
}));

// Create (schedule) a live class for one of the coordinator's offerings.
router.post('/live-classes', COORD, validate([
  body('offeringId').exists().withMessage('offeringId is required'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('scheduledAt').notEmpty().withMessage('scheduledAt is required'),
]), asyncHandler(async (req, res) => {
  const offeringId = parseInt(req.body.offeringId, 10);
  await assertOfferingInScope(req.lmsUser, offeringId);
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: { course: true },
  });
  if (!offering || offering.isDeleted) throw httpError(404, 'Course offering not found');

  const lc = await prisma.liveClass.create({
    data: {
      offeringId,
      title: req.body.title.trim(),
      description: req.body.description ? String(req.body.description).trim() : null,
      scheduledAt: new Date(req.body.scheduledAt),
      durationMin: req.body.durationMin ? parseInt(req.body.durationMin, 10) : 60,
      joinUrl: req.body.joinUrl ? String(req.body.joinUrl).trim() : null,
      status: 'SCHEDULED',
      // The offering's assigned teacher is the host of the class.
      hostId: offering.teacherId || null,
    },
  });

  // Pre-create the BBB meeting + attendee join URL when configured.
  if (bbb.isConfigured() && !lc.joinUrl) {
    try {
      await bbb.ensureMeeting({ liveClassId: lc.id, name: lc.title, durationMin: lc.durationMin, record: true });
      const studentUrl = bbb.joinUrl({ liveClassId: lc.id, fullName: 'Student', role: 'attendee' });
      await prisma.liveClass.update({ where: { id: lc.id }, data: { joinUrl: studentUrl } });
      lc.joinUrl = studentUrl;
    } catch (_) { /* fall back to manual joinUrl flow */ }
  }

  const courseCode = offering.course ? offering.course.code : '';
  const when = lc.scheduledAt ? new Date(lc.scheduledAt).toLocaleString() : '';
  // Notify the assigned teacher.
  if (offering.teacherId) {
    await notify(offering.teacherId, {
      title: 'New live class scheduled',
      message: `${courseCode ? courseCode + ' — ' : ''}${lc.title}${when ? ' on ' + when : ''}`,
      type: 'LIVE_CLASS', link: '/teacher/live-classes',
    });
  }
  // Notify enrolled students.
  const regs = await prisma.courseRegistration.findMany({ where: { offeringId, status: 'ENROLLED' }, select: { studentId: true } });
  for (const r of regs) await notify(r.studentId, {
    title: 'New live class scheduled',
    message: `${courseCode ? courseCode + ' — ' : ''}${lc.title}${when ? ' on ' + when : ''}`,
    type: 'LIVE_CLASS', link: '/student/live-classes',
  });
  await audit(req, 'COORD_LIVECLASS_CREATE', 'LiveClass', lc.id, { after: lc });
  res.status(201).json({ liveClass: lc });
}));

// Update / reschedule a live class (coordinator-owned).
router.put('/live-classes/:id', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.liveClass.findUnique({
    where: { id },
    include: { offering: { include: { course: true } } },
  });
  if (!before || before.isDeleted) throw httpError(404, 'Live class not found');
  await assertOfferingInScope(req.lmsUser, before.offeringId);

  const data = {};
  for (const k of ['title', 'description', 'joinUrl', 'status', 'recordingUrl']) {
    if (req.body[k] !== undefined) data[k] = req.body[k];
  }
  let rescheduled = false;
  if (req.body.scheduledAt !== undefined) {
    data.scheduledAt = new Date(req.body.scheduledAt);
    if (before.scheduledAt && data.scheduledAt.getTime() !== new Date(before.scheduledAt).getTime()) rescheduled = true;
  }
  if (req.body.durationMin !== undefined) {
    data.durationMin = parseInt(req.body.durationMin, 10);
    if (data.durationMin !== before.durationMin) rescheduled = true;
  }
  const lc = await prisma.liveClass.update({ where: { id }, data });

  if (rescheduled) {
    const when = lc.scheduledAt ? new Date(lc.scheduledAt).toLocaleString() : '';
    const courseCode = before.offering && before.offering.course ? before.offering.course.code : '';
    if (before.offering && before.offering.teacherId) {
      await notify(before.offering.teacherId, {
        title: 'Live class rescheduled',
        message: `${courseCode ? courseCode + ' — ' : ''}${lc.title} is now on ${when}`,
        type: 'LIVE_CLASS', link: '/teacher/live-classes',
      });
    }
    const regs = await prisma.courseRegistration.findMany({ where: { offeringId: before.offeringId, status: 'ENROLLED' }, select: { studentId: true } });
    for (const r of regs) await notify(r.studentId, {
      title: 'Live class rescheduled',
      message: `${courseCode ? courseCode + ' — ' : ''}${lc.title} is now on ${when}`,
      type: 'LIVE_CLASS', link: '/student/live-classes',
    });
  }
  await audit(req, 'COORD_LIVECLASS_UPDATE', 'LiveClass', id, { before, after: lc, rescheduled });
  res.json({ liveClass: lc, rescheduled });
}));

// Delete (cancel) a live class (coordinator-owned).
router.delete('/live-classes/:id', COORD, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = await prisma.liveClass.findUnique({ where: { id } });
  if (!before || before.isDeleted) throw httpError(404, 'Live class not found');
  await assertOfferingInScope(req.lmsUser, before.offeringId);
  await prisma.liveClass.update({ where: { id }, data: { isDeleted: true } });
  await audit(req, 'COORD_LIVECLASS_DELETE', 'LiveClass', id, { before });
  res.json({ message: 'Live class deleted' });
}));

// ============================================================
// COURSE INSTRUCTOR MANAGEMENT
//  Add / Edit / Delete / View instructor (Teacher) profiles.
//  Personal info is stored in LmsStudentProfile (reused as a
//  generic staff-profile store, keyed on the unique lmsUserId).
//  Assigned subjects / sections / courses are derived live from
//  CourseOffering + Section. Additive coordinator endpoints — no
//  other role's behaviour is changed.
// ============================================================

// Ensure (and lazily create) a profile row for a teacher account.
async function getOrInitInstructorProfile(userId, username, email) {
  let profile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: userId } });
  if (!profile) {
    profile = await prisma.lmsStudentProfile.create({
      data: {
        lmsUserId: userId,
        fullName: username || 'Instructor',
        fatherName: '',
        cnic: '',
        dateOfBirth: '',
        gender: '',
        program: 'N/A',
        programShortForm: 'N/A',
        department: '',
        rollNumber: `INST-${userId.slice(-6)}`,
        registrationNumber: `INST-${userId.slice(-6)}`,
        session: 'N/A',
        enrollmentDate: new Date(),
        email: email || null,
      },
    });
  }
  return profile;
}

// Map a profile + account into the public instructor shape.
function instructorPersonalInfo(profile) {
  if (!profile) return {};
  return {
    fullName: profile.fullName || '',
    fatherName: profile.fatherName || '',
    cnic: profile.cnic || '',
    dateOfBirth: profile.dateOfBirth || '',
    gender: profile.gender || '',
    maritalStatus: profile.maritalStatus || '',
    designation: (() => { try { const o = profile.otherDocsJson ? JSON.parse(profile.otherDocsJson) : null; return o && o.designation ? o.designation : ''; } catch { return ''; } })(),
    qualification: (() => { try { const o = profile.otherDocsJson ? JSON.parse(profile.otherDocsJson) : null; return o && o.qualification ? o.qualification : ''; } catch { return ''; } })(),
    specialization: (() => { try { const o = profile.otherDocsJson ? JSON.parse(profile.otherDocsJson) : null; return o && o.specialization ? o.specialization : ''; } catch { return ''; } })(),
    phone: profile.phone || '',
    whatsapp: profile.whatsapp || '',
    address: profile.address || '',
    department: profile.department || '',
    photoUrl: profile.photoUrl || null,
  };
}

// LIST instructors with profile summary + live workload (current term).
router.get('/instructors', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const { search = '', status = '' } = req.query;
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  // DEPARTMENT ISOLATION: a Course Coordinator only ever sees their OWN
  // department's instructors. Governance roles see all.
  const instructorIds = await resolveCoordinatorInstructorIds(req.lmsUser);
  const teacherW = instructorIds === null ? {} : { id: { in: instructorIds.length ? instructorIds : ['__none__'] } };

  const teachers = await prisma.lmsUser.findMany({
    where: { role: 'Teacher', ...teacherW },
    select: { id: true, username: true, email: true, isActive: true, lastLoginAt: true, createdAt: true, profile: true },
    orderBy: { username: 'asc' },
  });

  // Live workload — offerings, students, sections per teacher (current term).
  const offs = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, teacherId: { not: null } },
    select: { teacherId: true, _count: { select: { registrations: true, sections: true } } },
  });
  const offMap = {};
  offs.forEach((o) => {
    const m = offMap[o.teacherId] || { offerings: 0, students: 0, sections: 0 };
    m.offerings += 1;
    m.students += o._count.registrations;
    m.sections += o._count.sections;
    offMap[o.teacherId] = m;
  });

  let rows = teachers.map((t) => {
    const pi = instructorPersonalInfo(t.profile);
    const w = offMap[t.id] || { offerings: 0, students: 0, sections: 0 };
    return {
      id: t.id,
      username: t.username,
      email: t.email || (t.profile ? t.profile.email : null) || null,
      name: pi.fullName || t.username,
      designation: pi.designation,
      department: pi.department,
      phone: pi.phone,
      photoUrl: pi.photoUrl,
      isActive: t.isActive,
      lastLoginAt: t.lastLoginAt,
      createdAt: t.createdAt,
      offerings: w.offerings,
      sections: w.sections,
      students: w.students,
    };
  });

  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter((r) =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.username || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      (r.designation || '').toLowerCase().includes(q) ||
      (r.department || '').toLowerCase().includes(q));
  }
  if (status === 'active') rows = rows.filter((r) => r.isActive);
  else if (status === 'inactive') rows = rows.filter((r) => !r.isActive);

  res.json({
    instructors: rows,
    summary: {
      total: rows.length,
      active: rows.filter((r) => r.isActive).length,
      inactive: rows.filter((r) => !r.isActive).length,
      assigned: rows.filter((r) => r.offerings > 0).length,
    },
  });
}));

// VIEW one instructor — full personal info + assigned subjects/sections/courses.
router.get('/instructors/:id', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const u = await prisma.lmsUser.findFirst({
    where: { id, role: 'Teacher' },
    select: { id: true, username: true, email: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
  if (!u) throw httpError(404, 'Instructor not found');
  // DEPARTMENT ISOLATION: only own-department instructors are viewable.
  const instructorIds = await resolveCoordinatorInstructorIds(req.lmsUser);
  if (instructorIds !== null && !instructorIds.includes(id)) {
    throw httpError(403, 'This instructor belongs to another department.');
  }
  const profile = await getOrInitInstructorProfile(u.id, u.username, u.email);
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  const offerings = await prisma.courseOffering.findMany({
    where: { isDeleted: false, termId, teacherId: id },
    include: {
      course: { select: { code: true, title: true, creditHours: true } },
      sections: { select: { id: true, name: true, capacity: true, room: true, _count: { select: { registrations: true } } } },
      _count: { select: { registrations: true } },
    },
    orderBy: { id: 'asc' },
  });

  const assignments = offerings.map((o) => ({
    offeringId: o.id,
    courseCode: o.course.code,
    courseTitle: o.course.title,
    creditHours: o.course.creditHours,
    students: o._count.registrations,
    sections: o.sections.map((s) => ({ id: s.id, name: s.name, capacity: s.capacity, room: s.room, enrolled: s._count.registrations })),
  }));

  res.json({
    instructor: {
      id: u.id,
      username: u.username,
      email: u.email || profile.email || null,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      personalInfo: instructorPersonalInfo(profile),
    },
    assignments,
    workload: {
      offerings: assignments.length,
      sections: assignments.reduce((a, c) => a + c.sections.length, 0),
      students: assignments.reduce((a, c) => a + c.students, 0),
      totalCredits: assignments.reduce((a, c) => a + (c.creditHours || 0), 0),
    },
    term: term ? { id: term.id, name: term.name } : null,
  });
}));

// CREATE a new instructor (Teacher account + profile).
router.post('/instructors', COORD, validate([
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
]), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const username = String(b.username).trim();
  const email = b.email ? String(b.email).trim().toLowerCase() : null;

  // Uniqueness checks.
  const existsUser = await prisma.lmsUser.findUnique({ where: { username } });
  if (existsUser) throw httpError(409, 'A user with this username already exists');
  if (email) {
    const existsEmail = await prisma.lmsUser.findUnique({ where: { email } });
    if (existsEmail) throw httpError(409, 'A user with this email already exists');
  }

  const passwordHash = await bcrypt.hash(String(b.password), 12);
  const extra = JSON.stringify({
    designation: b.designation || '',
    qualification: b.qualification || '',
    specialization: b.specialization || '',
  });

  // DEPARTMENT ISOLATION: an instructor created by a Course Coordinator is
  // bound to that coordinator's OWN department (so it stays within scope).
  // Governance roles may pass an explicit department. Secure default: own dept.
  let instructorDept = b.department ? String(b.department) : '';
  if (req.lmsUser.role === 'CourseCoordinator') {
    const scope = await resolveCoordinatorScope(req.lmsUser);
    if (scope.scopedDepartment) instructorDept = scope.scopedDepartment;
  }

  const user = await prisma.lmsUser.create({
    data: {
      username,
      email,
      passwordHash,
      role: 'Teacher',
      isActive: true,
      mustChangePassword: true,
      profile: {
        create: {
          fullName: String(b.fullName),
          fatherName: b.fatherName ? String(b.fatherName) : '',
          cnic: b.cnic ? String(b.cnic) : '',
          dateOfBirth: b.dateOfBirth ? String(b.dateOfBirth) : '',
          gender: b.gender ? String(b.gender) : '',
          maritalStatus: b.maritalStatus ? String(b.maritalStatus) : null,
          phone: b.phone ? String(b.phone) : null,
          whatsapp: b.whatsapp ? String(b.whatsapp) : null,
          address: b.address ? String(b.address) : null,
          email,
          program: 'N/A',
          programShortForm: 'N/A',
          department: instructorDept,
          rollNumber: `INST-${Date.now().toString().slice(-8)}`,
          registrationNumber: `INST-${Date.now().toString().slice(-8)}`,
          session: 'N/A',
          enrollmentDate: new Date(),
          otherDocsJson: extra,
        },
      },
    },
    select: { id: true, username: true, email: true, isActive: true, profile: true },
  });

  await audit(req, 'INSTRUCTOR_CREATE', 'LmsUser', user.id, { after: { username, email, fullName: b.fullName } });
  await notify(user.id, { title: 'Welcome to the LMS', message: 'Your instructor account has been created. Please change your password on first login.', type: 'INFO' }).catch(() => {});
  res.status(201).json({ message: 'Instructor created', instructor: { id: user.id, username: user.username, email: user.email, isActive: user.isActive, personalInfo: instructorPersonalInfo(user.profile) } });
}));

// EDIT an instructor (account fields + personal info, optional password reset).
router.put('/instructors/:id', COORD, validate([
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
]), asyncHandler(async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  const u = await prisma.lmsUser.findFirst({ where: { id, role: 'Teacher' } });
  if (!u) throw httpError(404, 'Instructor not found');
  // DEPARTMENT ISOLATION: only own-department instructors are editable.
  const editScopeIds = await resolveCoordinatorInstructorIds(req.lmsUser);
  if (editScopeIds !== null && !editScopeIds.includes(id)) {
    throw httpError(403, 'This instructor belongs to another department.');
  }
  await getOrInitInstructorProfile(u.id, u.username, u.email);

  // Account-level updates (email / active / password).
  const userData = {};
  if (b.email !== undefined) {
    const email = b.email ? String(b.email).trim().toLowerCase() : null;
    if (email) {
      const clash = await prisma.lmsUser.findFirst({ where: { email, id: { not: id } } });
      if (clash) throw httpError(409, 'A user with this email already exists');
    }
    userData.email = email;
  }
  if (b.isActive !== undefined) userData.isActive = !!b.isActive;
  if (b.password) {
    if (String(b.password).length < 8) throw httpError(400, 'Password must be at least 8 characters');
    userData.passwordHash = await bcrypt.hash(String(b.password), 12);
    userData.mustChangePassword = true;
  }
  if (Object.keys(userData).length) {
    await prisma.lmsUser.update({ where: { id }, data: userData });
  }

  // Merge extra fields (designation/qualification/specialization) into otherDocsJson.
  const current = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: id } });
  let extra = {};
  try { extra = current && current.otherDocsJson ? JSON.parse(current.otherDocsJson) : {}; } catch { extra = {}; }
  if (b.designation !== undefined) extra.designation = String(b.designation || '');
  if (b.qualification !== undefined) extra.qualification = String(b.qualification || '');
  if (b.specialization !== undefined) extra.specialization = String(b.specialization || '');

  const profile = await prisma.lmsStudentProfile.update({
    where: { lmsUserId: id },
    data: {
      fullName: b.fullName != null ? String(b.fullName) : undefined,
      fatherName: b.fatherName != null ? String(b.fatherName) : undefined,
      cnic: b.cnic != null ? String(b.cnic) : undefined,
      dateOfBirth: b.dateOfBirth != null ? String(b.dateOfBirth) : undefined,
      gender: b.gender != null ? String(b.gender) : undefined,
      maritalStatus: b.maritalStatus != null ? String(b.maritalStatus) : undefined,
      phone: b.phone != null ? String(b.phone) : undefined,
      whatsapp: b.whatsapp != null ? String(b.whatsapp) : undefined,
      address: b.address != null ? String(b.address) : undefined,
      email: b.email != null ? (b.email ? String(b.email).trim().toLowerCase() : null) : undefined,
      department: b.department != null ? String(b.department) : undefined,
      otherDocsJson: JSON.stringify(extra),
    },
  });

  await audit(req, 'INSTRUCTOR_UPDATE', 'LmsUser', id, { after: { account: userData, profile: { fullName: profile.fullName } } });
  res.json({ message: 'Instructor updated', instructor: { id, personalInfo: instructorPersonalInfo(profile) } });
}));

// Upload / change an instructor's profile picture.
router.post('/instructors/:id/photo', COORD, uploadPhoto.single('photo'), asyncHandler(async (req, res) => {
  const id = req.params.id;
  const u = await prisma.lmsUser.findFirst({ where: { id, role: 'Teacher' } });
  if (!u) throw httpError(404, 'Instructor not found');
  // DEPARTMENT ISOLATION: only own-department instructors.
  const photoScopeIds = await resolveCoordinatorInstructorIds(req.lmsUser);
  if (photoScopeIds !== null && !photoScopeIds.includes(id)) {
    throw httpError(403, 'This instructor belongs to another department.');
  }
  if (!req.file) throw httpError(400, 'No photo uploaded');
  await getOrInitInstructorProfile(u.id, u.username, u.email);
  const photoUrl = `/uploads/photos/${req.file.filename}`;
  await prisma.lmsStudentProfile.update({ where: { lmsUserId: id }, data: { photoUrl } });
  await audit(req, 'INSTRUCTOR_PHOTO_UPDATE', 'LmsStudentProfile', id, { photoUrl });
  res.json({ message: 'Photo updated', photoUrl });
}));

// DELETE an instructor. Default = soft delete (deactivate) so historical
// records (offerings, sections, audit) stay intact. ?hard=true permanently
// removes the account, first unassigning it from offerings/sections.
router.delete('/instructors/:id', COORD, asyncHandler(async (req, res) => {
  const id = req.params.id;
  const hard = String(req.query.hard || '') === 'true';
  const u = await prisma.lmsUser.findFirst({ where: { id, role: 'Teacher' } });
  if (!u) throw httpError(404, 'Instructor not found');
  // DEPARTMENT ISOLATION: only own-department instructors are deletable.
  const delScopeIds = await resolveCoordinatorInstructorIds(req.lmsUser);
  if (delScopeIds !== null && !delScopeIds.includes(id)) {
    throw httpError(403, 'This instructor belongs to another department.');
  }

  if (!hard) {
    await prisma.lmsUser.update({ where: { id }, data: { isActive: false } });
    await audit(req, 'INSTRUCTOR_DEACTIVATE', 'LmsUser', id, { before: { isActive: u.isActive } });
    return res.json({ message: 'Instructor deactivated', mode: 'soft' });
  }

  // Hard delete — unassign from offerings / sections to avoid orphan refs.
  await prisma.courseOffering.updateMany({ where: { teacherId: id }, data: { teacherId: null } });
  await prisma.section.updateMany({ where: { teacherId: id }, data: { teacherId: null } });
  await prisma.lmsUser.delete({ where: { id } }); // profile cascade-deletes
  await audit(req, 'INSTRUCTOR_DELETE', 'LmsUser', id, { before: { username: u.username } });
  res.json({ message: 'Instructor permanently deleted', mode: 'hard' });
}));

// ============================================================
// WEIGHTAGE MODULE (Req 3)
//  Configure assessment weightage (Mid Term, Final Term, Quizzes,
//  Assignments, Lab Tasks) per course — filtered by Semester + Program.
//  • Number of Quizzes / Assignments / Lab Tasks is configurable, and each
//    individual item can carry its own weightage.
//  • Lab Task weightage is offered ONLY for courses that have a Lab
//    component (course.hasLab); it is hidden entirely for non-lab subjects.
//  • Department-isolated: a coordinator only sees/edits their own programs.
// ============================================================

// Serialize/deserialize the per-item weightage arrays stored as JSON text.
function parseItems(raw) {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}
function serializeItems(arr) {
  if (!Array.isArray(arr)) return null;
  const clean = arr
    .map((it, i) => ({ label: String(it?.label || `Item ${i + 1}`), weight: Number(it?.weight) || 0 }))
    .filter((it) => it.label);
  return clean.length ? JSON.stringify(clean) : null;
}

// Shape a CourseWeightage row (or defaults) for the client. Lab fields are
// zeroed / suppressed when the course has no lab.
function shapeWeightage(course, w) {
  const hasLab = !!course.hasLab;
  const base = w || {};
  return {
    courseId: course.id,
    hasLab,
    midWeight: base.midWeight != null ? base.midWeight : 25,
    finalWeight: base.finalWeight != null ? base.finalWeight : 40,
    quizWeight: base.quizWeight != null ? base.quizWeight : 15,
    assignmentWeight: base.assignmentWeight != null ? base.assignmentWeight : 20,
    labTaskWeight: hasLab ? (base.labTaskWeight != null ? base.labTaskWeight : 0) : 0,
    // Semester Project (lab) weightage — only meaningful for lab courses (Req 1.3).
    semesterProjectWeight: hasLab ? (base.semesterProjectWeight != null ? base.semesterProjectWeight : 0) : 0,
    quizCount: base.quizCount != null ? base.quizCount : 0,
    assignmentCount: base.assignmentCount != null ? base.assignmentCount : 0,
    labTaskCount: hasLab ? (base.labTaskCount != null ? base.labTaskCount : 0) : 0,
    quizItems: parseItems(base.quizItems),
    assignmentItems: parseItems(base.assignmentItems),
    labTaskItems: hasLab ? parseItems(base.labTaskItems) : [],
    configured: !!w,
    updatedAt: base.updatedAt || null,
  };
}

// List courses for weightage config — smart filter by Program + Semester.
router.get('/weightage/courses', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const programId = req.query.programId ? parseInt(req.query.programId, 10) : undefined;
  const semesterId = req.query.semesterId ? parseInt(req.query.semesterId, 10) : undefined;
  // DEPARTMENT ISOLATION: only this coordinator's own programs/courses.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  const courseScopeW = scope.isGov ? {} : { id: { in: scope.courseIds.length ? scope.courseIds : [-1] } };
  const courses = await prisma.lmsCourse.findMany({
    where: {
      isDeleted: false,
      ...courseScopeW,
      ...(programId ? { programId } : {}),
      ...(semesterId ? { semesterId } : {}),
    },
    include: { weightage: true, program: true, semester: true },
    orderBy: { code: 'asc' },
  });
  res.json({
    courses: courses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      creditHours: c.creditHours,
      hasLab: !!c.hasLab,
      program: c.program ? { id: c.program.id, shortForm: c.program.shortForm, name: c.program.name } : null,
      semester: c.semester ? { id: c.semester.id, number: c.semester.number, title: c.semester.title } : null,
      weightage: shapeWeightage(c, c.weightage),
    })),
  });
}));

// Get a single course's weightage config.
router.get('/weightage/:courseId', COORD_OR_GOV, asyncHandler(async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const course = await prisma.lmsCourse.findFirst({
    where: { id: courseId, isDeleted: false },
    include: { weightage: true, program: true, semester: true },
  });
  if (!course) throw httpError(404, 'Course not found');
  // DEPARTMENT ISOLATION.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  if (!scope.isGov && !scope.courseIds.includes(courseId)) {
    throw httpError(403, 'This course belongs to another department.');
  }
  res.json({
    course: { id: course.id, code: course.code, title: course.title, hasLab: !!course.hasLab },
    weightage: shapeWeightage(course, course.weightage),
  });
}));

// Save (upsert) a course's weightage config.
router.put('/weightage/:courseId', COORD, asyncHandler(async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, isDeleted: false } });
  if (!course) throw httpError(404, 'Course not found');
  // DEPARTMENT ISOLATION.
  const scope = await resolveCoordinatorScope(req.lmsUser);
  if (!scope.isGov && !scope.courseIds.includes(courseId)) {
    throw httpError(403, 'This course belongs to another department.');
  }
  const hasLab = !!course.hasLab;
  const b = req.body || {};
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };

  const data = {
    midWeight: num(b.midWeight, 25),
    finalWeight: num(b.finalWeight, 40),
    quizWeight: num(b.quizWeight, 15),
    assignmentWeight: num(b.assignmentWeight, 20),
    // Lab task weightage is only meaningful for lab courses; force 0 otherwise.
    labTaskWeight: hasLab ? num(b.labTaskWeight, 0) : 0,
    // Semester Project (lab) weightage — lab courses only (Req 1.3).
    semesterProjectWeight: hasLab ? num(b.semesterProjectWeight, 0) : 0,
    quizCount: Math.trunc(num(b.quizCount, 0)),
    assignmentCount: Math.trunc(num(b.assignmentCount, 0)),
    labTaskCount: hasLab ? Math.trunc(num(b.labTaskCount, 0)) : 0,
    quizItems: serializeItems(b.quizItems),
    assignmentItems: serializeItems(b.assignmentItems),
    labTaskItems: hasLab ? serializeItems(b.labTaskItems) : null,
    updatedById: req.lmsUser.id,
  };

  const saved = await prisma.courseWeightage.upsert({
    where: { courseId },
    create: { courseId, ...data },
    update: data,
  });
  await audit(req, 'COURSE_WEIGHTAGE_SAVE', 'CourseWeightage', saved.id, { after: saved });

  // Results breakdowns recalculate immediately for every student enrolled in
  // an offering of this course; no client polling delay is required.
  const offeringIds = (await prisma.courseOffering.findMany({
    where: { courseId, isDeleted: false },
    select: { id: true },
  })).map((offering) => offering.id);
  if (offeringIds.length) {
    const registrations = await prisma.courseRegistration.findMany({
      where: { offeringId: { in: offeringIds }, status: { in: ['ENROLLED', 'COMPLETED'] } },
      select: { studentId: true },
    });
    realtime.emitTo([...new Set(registrations.map((registration) => registration.studentId))], 'weightage', { courseId });
  }

  // Total weightage sanity flag (not enforced — just surfaced to the UI).
  const total = data.midWeight + data.finalWeight + data.quizWeight + data.assignmentWeight + data.labTaskWeight + data.semesterProjectWeight;
  res.json({
    message: 'Weightage saved',
    weightage: shapeWeightage(course, saved),
    total,
    balanced: Math.abs(total - 100) < 0.001,
  });
}));

module.exports = router;

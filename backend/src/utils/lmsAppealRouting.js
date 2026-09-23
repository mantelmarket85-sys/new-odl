// ============================================================
//  LMS APPEAL ROUTING HELPER
//  ------------------------------------------------------------
//  Resolves the precise set of staff recipients for a student's
//  appeal. A student addresses an appeal to exactly ONE role:
//
//    TEACHER            → ONE specific teacher (must be currently
//                         teaching the student). targetUserId set.
//    COURSE_COORDINATOR → CourseCoordinator(s) for the student's
//                         department/program.
//    FOCAL_PERSON       → FocalPerson(s) for the student's department.
//    EXAM_CONTROLLER    → ExamController(s) (university-wide).
//    PROVOST            → Provost(s) (university-wide).
//
//  Department resolution mirrors lmsDeptScope: a staff member's
//  department lives in LmsStudentProfile.department (generic staff
//  profile). We match the student's department/programShortForm
//  against staff profiles of the requested role.
//
//  Additive & non-breaking — used only by the enhanced Appeals module.
// ============================================================

const prisma = require('./prisma');

const APPEAL_ROLES = {
  TEACHER: 'Teacher',
  COURSE_COORDINATOR: 'CourseCoordinator',
  FOCAL_PERSON: 'FocalPerson',
  EXAM_CONTROLLER: 'ExamController',
  PROVOST: 'Provost',
};

// Roles whose scope is the whole university (no department filtering).
const UNIVERSITY_WIDE = new Set(['EXAM_CONTROLLER', 'PROVOST']);

/**
 * The set of teachers currently teaching a given student. A teacher is
 * "currently teaching" the student when the student has an ENROLLED
 * registration in an ACTIVE offering taught by that teacher (or a
 * section taught by that teacher).
 *
 * Returns [{ id, name, courseCodes: [], offeringIds: [] }]
 */
async function teachersForStudent(studentId) {
  const regs = await prisma.courseRegistration.findMany({
    where: { studentId, status: 'ENROLLED' },
    include: {
      offering: {
        include: { course: true, teacher: { include: { profile: true } } },
      },
      section: { include: { teacher: { include: { profile: true } } } },
    },
  });

  const map = new Map();
  const addTeacher = (teacher, courseCode, offeringId) => {
    if (!teacher) return;
    const existing = map.get(teacher.id) || {
      id: teacher.id,
      name: teacher.profile?.fullName || teacher.username,
      username: teacher.username,
      courseCodes: new Set(),
      offeringIds: new Set(),
    };
    if (courseCode) existing.courseCodes.add(courseCode);
    if (offeringId) existing.offeringIds.add(offeringId);
    map.set(teacher.id, existing);
  };

  for (const r of regs) {
    if (!r.offering || r.offering.status === 'CANCELLED' || r.offering.isDeleted) continue;
    const code = r.offering.course?.code;
    // Prefer the section teacher when present, else the offering teacher.
    addTeacher(r.section?.teacher, code, r.offeringId);
    addTeacher(r.offering?.teacher, code, r.offeringId);
  }

  return [...map.values()].map((t) => ({
    id: t.id,
    name: t.name,
    username: t.username,
    courseCodes: [...t.courseCodes],
    offeringIds: [...t.offeringIds],
  }));
}

/** Resolve the student's department + program short-forms. */
async function studentDeptContext(studentId) {
  const profile = await prisma.lmsStudentProfile
    .findUnique({
      where: { lmsUserId: studentId },
      select: { department: true, programShortForm: true, program: true },
    })
    .catch(() => null);
  const department = profile?.department ? String(profile.department).trim() : '';
  const shortForms = [];
  if (profile?.programShortForm) shortForms.push(String(profile.programShortForm).trim());
  return { department, shortForms };
}

/**
 * Resolve the staff LmsUser ids that hold a given role for a student.
 * For department-scoped roles we match staff whose profile.department
 * equals the student's department OR whose profile.programShortForm
 * overlaps the student's program. If no department match is found we
 * fall back to ALL staff of that role (so the student is never blocked
 * in an un-provisioned environment).
 */
async function staffForRole(targetRole, studentId) {
  const dbRole = APPEAL_ROLES[targetRole];
  if (!dbRole) return [];

  const roleUsers = await prisma.lmsUser.findMany({
    where: { role: dbRole, isActive: true },
    include: { profile: { select: { department: true, programShortForm: true, fullName: true } } },
  });

  if (UNIVERSITY_WIDE.has(targetRole)) {
    return roleUsers.map((u) => ({ id: u.id, name: u.profile?.fullName || u.username, username: u.username }));
  }

  const { department, shortForms } = await studentDeptContext(studentId);
  if (!department && shortForms.length === 0) {
    // No dept context → fall back to all staff of that role.
    return roleUsers.map((u) => ({ id: u.id, name: u.profile?.fullName || u.username, username: u.username }));
  }

  const matched = roleUsers.filter((u) => {
    const d = u.profile?.department ? String(u.profile.department).trim() : '';
    const sf = u.profile?.programShortForm ? String(u.profile.programShortForm).trim() : '';
    if (department && d && d === department) return true;
    if (sf && shortForms.includes(sf)) return true;
    return false;
  });

  const list = (matched.length ? matched : roleUsers).map((u) => ({
    id: u.id,
    name: u.profile?.fullName || u.username,
    username: u.username,
  }));
  return list;
}

/**
 * Build the recipient option list for the appeal form. Returns the
 * available roles and, for TEACHER, the dynamic list of teachers
 * currently teaching the student.
 */
async function appealRecipients(studentId) {
  const [teachers, coordinators, focals, examControllers, provosts] = await Promise.all([
    teachersForStudent(studentId),
    staffForRole('COURSE_COORDINATOR', studentId),
    staffForRole('FOCAL_PERSON', studentId),
    staffForRole('EXAM_CONTROLLER', studentId),
    staffForRole('PROVOST', studentId),
  ]);

  return {
    roles: [
      { value: 'TEACHER', label: 'Teacher', available: teachers.length > 0 },
      { value: 'COURSE_COORDINATOR', label: 'Course Coordinator', available: coordinators.length > 0 },
      { value: 'FOCAL_PERSON', label: 'Focal Person', available: focals.length > 0 },
      { value: 'EXAM_CONTROLLER', label: 'Exam Controller', available: examControllers.length > 0 },
      { value: 'PROVOST', label: 'Provost', available: provosts.length > 0 },
    ],
    teachers,
  };
}

/** Validate that targetUserId is a teacher currently teaching the student. */
async function validateTeacherTarget(studentId, targetUserId) {
  const teachers = await teachersForStudent(studentId);
  return teachers.find((t) => t.id === targetUserId) || null;
}

module.exports = {
  APPEAL_ROLES,
  teachersForStudent,
  staffForRole,
  appealRecipients,
  validateTeacherTarget,
  studentDeptContext,
};

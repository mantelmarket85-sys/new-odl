// ============================================================
//  LMS ROLES (Section 4 / Section 7)
//  ------------------------------------------------------------
//  The LMS has exactly 7 roles. Because the SQLite connector does
//  not support native Prisma enums, the LmsUser.role column is a
//  String validated against this canonical list in application code.
//
//  The keys below are the CANONICAL role names stored in the DB and
//  embedded in the LMS JWT. The LMS frontend uses its own internal
//  role keys (student, teacher, admin, focal_person, exam_coordinator,
//  director_qec, provost) — the mapping is provided so the auth layer
//  can translate the DB role to the frontend route base and vice versa.
// ============================================================

// Canonical LMS roles (stored in LmsUser.role + LMS JWT payload).
// 'SuperAdmin' is additive — it lets the single highest-authority account
// authenticate through the SAME LMS login UI (unified login) and be routed
// to the Super Admin command center.
const LMS_ROLES = [
  'Student',
  'Teacher',
  'CourseCoordinator',
  'FocalPerson',
  'ExamController',
  'QECCoordinator',
  'Provost',
  'SuperAdmin',
];

// Canonical DB role  →  LMS frontend internal role key.
const ROLE_TO_FRONTEND = {
  Student: 'student',
  Teacher: 'teacher',
  CourseCoordinator: 'admin',
  FocalPerson: 'focal_person',
  ExamController: 'exam_coordinator',
  QECCoordinator: 'director_qec',
  Provost: 'provost',
  SuperAdmin: 'super_admin',
};

// LMS frontend internal role key  →  canonical DB role.
const FRONTEND_TO_ROLE = Object.fromEntries(
  Object.entries(ROLE_TO_FRONTEND).map(([k, v]) => [v, k])
);

function isValidLmsRole(role) {
  return LMS_ROLES.includes(role);
}

module.exports = {
  LMS_ROLES,
  ROLE_TO_FRONTEND,
  FRONTEND_TO_ROLE,
  isValidLmsRole,
};

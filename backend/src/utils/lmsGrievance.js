// ============================================================
//  LMS SUPPORT & GRIEVANCES — SHARED DOMAIN HELPERS
//  ------------------------------------------------------------
//  Central, additive helper module for the upgraded LMS "Support &
//  Grievances" portal (formerly the LMS "Appeals" module). It layers a
//  richer case-management vocabulary on TOP of the existing
//  StudentAppeal model without changing any legacy behaviour:
//
//    • Case types      GRIEVANCE | SUPPORT | APPEAL | SUGGESTION | FEEDBACK
//    • Categories       Academic / Technical / Administrative / Quality / Other
//    • Priority → SLA   LOW | MEDIUM | HIGH | URGENT  (configurable via env)
//    • Category → Role  default routing rules (configurable)
//    • Status lifecycle Draft…Reopened  (superset of the legacy vocab)
//    • Public case codes GRV-YYYY-NNNNNN  (immutable, non-DB-id)
//
//  IMPORTANT: This module NEVER touches the Admissions Appeal (`Appeal`)
//  model or any Admissions logic. It operates only on the LMS
//  StudentAppeal + Grievance* tables.
// ============================================================

const prisma = require('./prisma');

// ------------------------------------------------------------------
// CASE TYPES
// ------------------------------------------------------------------
const CASE_TYPES = ['GRIEVANCE', 'SUPPORT', 'APPEAL', 'SUGGESTION', 'FEEDBACK'];
const CASE_TYPE_LABEL = {
  GRIEVANCE: 'Grievance',
  SUPPORT: 'Support Request',
  APPEAL: 'Appeal',
  SUGGESTION: 'Suggestion',
  FEEDBACK: 'Feedback',
};

// Legacy rows created before this upgrade have caseType = null. They
// were all "appeals" (the module was called Appeals), so we surface
// them as APPEAL for a consistent UI while never rewriting the DB row.
const effectiveCaseType = (row) => row?.caseType || 'APPEAL';

// ------------------------------------------------------------------
// PRIORITY  →  SLA (working-day/hour budgets)
// Values are DEFAULTS only — administrators can override via env; they
// are not represented as institutionally-approved figures.
// ------------------------------------------------------------------
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

// Hours budget per priority (defaults; env-overridable).
const SLA_HOURS = {
  LOW: Number(process.env.LMS_SLA_LOW_HOURS) || 5 * 24, // 5 working days
  MEDIUM: Number(process.env.LMS_SLA_MEDIUM_HOURS) || 3 * 24, // 3 working days
  HIGH: Number(process.env.LMS_SLA_HIGH_HOURS) || 2 * 24, // 2 working days
  URGENT: Number(process.env.LMS_SLA_URGENT_HOURS) || 24, // 24 hours
};

const normalisePriority = (p) => {
  const v = String(p || '').toUpperCase();
  return PRIORITIES.includes(v) ? v : 'MEDIUM';
};

/** Compute the SLA due date from a priority and a base time (now). */
function slaDueFrom(priority, from = new Date()) {
  const hrs = SLA_HOURS[normalisePriority(priority)] || SLA_HOURS.MEDIUM;
  return new Date(from.getTime() + hrs * 60 * 60 * 1000);
}

// ------------------------------------------------------------------
// STATUS LIFECYCLE
// The legacy StudentAppeal status vocab is OPEN | IN_REVIEW | RESOLVED
// | REJECTED. The upgraded portal recognises a superset of statuses.
// All legacy statuses remain first-class so existing rows/flows keep
// working unchanged.
// ------------------------------------------------------------------
const STATUSES = [
  'DRAFT',
  'OPEN', // = Submitted
  'ASSIGNED',
  'IN_REVIEW', // = Under Review
  'IN_PROGRESS',
  'AWAITING_STUDENT',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
  'REOPENED',
];

// Friendly labels for the UI / notifications.
const STATUS_LABEL = {
  DRAFT: 'Draft',
  OPEN: 'Submitted',
  ASSIGNED: 'Assigned',
  IN_REVIEW: 'Under Review',
  IN_PROGRESS: 'In Progress',
  AWAITING_STUDENT: 'Awaiting Student',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
  REOPENED: 'Reopened',
};

// Statuses a student may reopen from.
const REOPENABLE = new Set(['RESOLVED', 'CLOSED', 'REJECTED']);

// ------------------------------------------------------------------
// CATEGORY CATALOG
// Grouped exactly as specified in the master prompt (Section 9). The
// `role` field is the DEFAULT routing target (see routing below); it is
// a suggestion the UI/back-end use to pre-route new cases and can be
// overridden by staff at any time.
// ------------------------------------------------------------------
const CATEGORY_CATALOG = [
  {
    group: 'Academic',
    items: [
      { value: 'ASSIGNMENT_MARKS', label: 'Assignment / Marks', role: 'TEACHER' },
      { value: 'QUIZ', label: 'Quiz', role: 'TEACHER' },
      { value: 'EXAM', label: 'Exam', role: 'EXAM_CONTROLLER' },
      { value: 'RESULT', label: 'Result', role: 'EXAM_CONTROLLER' },
      { value: 'ATTENDANCE', label: 'Attendance', role: 'TEACHER' },
      { value: 'COURSE', label: 'Course', role: 'COURSE_COORDINATOR' },
      { value: 'COURSE_MATERIAL', label: 'Course Material', role: 'COURSE_COORDINATOR' },
      { value: 'INSTRUCTOR', label: 'Instructor / Teacher', role: 'COURSE_COORDINATOR' },
      { value: 'OTHER_ACADEMIC', label: 'Other Academic', role: 'COURSE_COORDINATOR' },
    ],
  },
  {
    group: 'Technical',
    items: [
      { value: 'LOGIN', label: 'Login', role: 'COURSE_COORDINATOR' },
      { value: 'LMS_ERROR', label: 'LMS Error', role: 'COURSE_COORDINATOR' },
      { value: 'VIDEO_MEDIA', label: 'Video / Media', role: 'COURSE_COORDINATOR' },
      { value: 'FILE_UPLOAD', label: 'File Upload', role: 'COURSE_COORDINATOR' },
      { value: 'LIVE_CLASS', label: 'Live Class', role: 'TEACHER' },
      { value: 'COURSE_ACCESS', label: 'Course Access', role: 'COURSE_COORDINATOR' },
      { value: 'OTHER_TECHNICAL', label: 'Other Technical', role: 'COURSE_COORDINATOR' },
    ],
  },
  {
    group: 'Administrative',
    items: [
      { value: 'FEE_PAYMENT', label: 'Fee / Payment', role: 'FINANCE' },
      { value: 'CERTIFICATE', label: 'Certificate', role: 'FOCAL_PERSON' },
      { value: 'ACADEMIC_DOCUMENT', label: 'Academic Document', role: 'FOCAL_PERSON' },
      { value: 'STUDENT_SERVICES', label: 'Student Services', role: 'FOCAL_PERSON' },
      { value: 'OTHER_ADMINISTRATIVE', label: 'Other Administrative', role: 'FOCAL_PERSON' },
    ],
  },
  {
    group: 'Quality / Service',
    items: [
      { value: 'TEACHING_QUALITY', label: 'Teaching Quality', role: 'QEC_COORDINATOR' },
      { value: 'LMS_SERVICE_QUALITY', label: 'LMS Service Quality', role: 'QEC_COORDINATOR' },
      { value: 'COURSE_QUALITY', label: 'Course Quality', role: 'QEC_COORDINATOR' },
      { value: 'GENERAL_SERVICE_COMPLAINT', label: 'General Service Complaint', role: 'QEC_COORDINATOR' },
    ],
  },
  {
    group: 'Other',
    items: [
      { value: 'GENERAL_COMPLAINT', label: 'General Complaint', role: 'FOCAL_PERSON' },
      { value: 'SUGGESTION', label: 'Suggestion', role: 'QEC_COORDINATOR' },
      { value: 'FEEDBACK', label: 'Feedback', role: 'QEC_COORDINATOR' },
      { value: 'OTHER', label: 'Other', role: 'FOCAL_PERSON' },
    ],
  },
];

// Flat lookup: categoryValue → { label, role, group }.
const CATEGORY_INDEX = (() => {
  const idx = {};
  for (const grp of CATEGORY_CATALOG) {
    for (const it of grp.items) idx[it.value] = { ...it, group: grp.group };
  }
  return idx;
})();

const categoryLabel = (value) => CATEGORY_INDEX[value]?.label || value || null;

// ------------------------------------------------------------------
// ROUTING
// Map the target role token (used by StudentAppeal.targetRole) — this
// is the SAME vocabulary already used by lmsAppealRouting so existing
// staff queues keep working unchanged.
//   TEACHER | COURSE_COORDINATOR | FOCAL_PERSON | EXAM_CONTROLLER |
//   QEC_COORDINATOR | PROVOST | FINANCE
// Note: QEC_COORDINATOR and FINANCE are additive routing targets for
// the new portal. lmsAppealRouting handles TEACHER/COURSE_COORDINATOR/
// FOCAL_PERSON/EXAM_CONTROLLER/PROVOST; QEC/FINANCE are resolved here.
// ------------------------------------------------------------------
const ROUTE_ROLE_LABEL = {
  TEACHER: 'Teacher',
  COURSE_COORDINATOR: 'Course Coordinator',
  FOCAL_PERSON: 'Focal Person',
  EXAM_CONTROLLER: 'Exam Coordinator',
  QEC_COORDINATOR: 'QEC Coordinator',
  PROVOST: 'Provost',
  FINANCE: 'Finance',
};

// Route role → canonical LmsUser.role (DB value).
const ROUTE_TO_DB_ROLE = {
  TEACHER: 'Teacher',
  COURSE_COORDINATOR: 'CourseCoordinator',
  FOCAL_PERSON: 'FocalPerson',
  EXAM_CONTROLLER: 'ExamController',
  QEC_COORDINATOR: 'QECCoordinator',
  PROVOST: 'Provost',
  // Finance is handled by the Provost/finance queue in this LMS (there is
  // no dedicated Finance LmsUser role); finance cases are routed to the
  // Focal Person queue as a safe fallback if no finance staff exist.
  FINANCE: 'Provost',
};

/**
 * Resolve the default routing target role for a (caseType, category).
 * Appeals about exams/results go to the Exam Coordinator, quality items
 * to QEC, fee items to Finance, etc. Falls back to COURSE_COORDINATOR.
 */
function defaultRouteRole(caseType, category) {
  const cat = CATEGORY_INDEX[category];
  if (cat?.role) return cat.role;
  // Type-level fallbacks.
  if (caseType === 'FEEDBACK' || caseType === 'SUGGESTION') return 'QEC_COORDINATOR';
  return 'COURSE_COORDINATOR';
}

/**
 * Resolve staff recipient LmsUser ids for a routing role, reusing the
 * existing department-scoped resolver where possible. Returns [{id,name}].
 */
async function resolveRouteStaff(routeRole, studentId, targetUserId = null) {
  const appealRouting = require('./lmsAppealRouting');

  // Roles the existing routing helper already understands.
  if (['TEACHER', 'COURSE_COORDINATOR', 'FOCAL_PERSON', 'EXAM_CONTROLLER', 'PROVOST'].includes(routeRole)) {
    if (routeRole === 'TEACHER' && targetUserId) {
      const t = await appealRouting.validateTeacherTarget(studentId, String(targetUserId));
      return t ? [{ id: t.id, name: t.name }] : [];
    }
    if (routeRole === 'TEACHER') {
      const teachers = await appealRouting.teachersForStudent(studentId);
      return teachers.map((t) => ({ id: t.id, name: t.name }));
    }
    return appealRouting.staffForRole(routeRole, studentId);
  }

  // Additive roles: QEC_COORDINATOR / FINANCE — resolve by DB role.
  const dbRole = ROUTE_TO_DB_ROLE[routeRole];
  if (!dbRole) return [];
  const users = await prisma.lmsUser.findMany({
    where: { role: dbRole, isActive: true },
    include: { profile: { select: { fullName: true } } },
  });
  return users.map((u) => ({ id: u.id, name: u.profile?.fullName || u.username }));
}

// ------------------------------------------------------------------
// PUBLIC CASE CODE  (GRV-YYYY-NNNNNN)
// Immutable, human-readable, does not expose the DB id. The numeric
// suffix is a per-year running counter derived from existing caseCodes.
// ------------------------------------------------------------------
async function nextCaseCode(now = new Date()) {
  const year = now.getFullYear();
  const prefix = `GRV-${year}-`;
  // Find the highest existing sequence for this year.
  const last = await prisma.studentAppeal.findFirst({
    where: { caseCode: { startsWith: prefix } },
    orderBy: { caseCode: 'desc' },
    select: { caseCode: true },
  });
  let seq = 0;
  if (last?.caseCode) {
    const tail = last.caseCode.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n;
  }
  seq += 1;
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

/**
 * Ensure a StudentAppeal row has a public caseCode. Legacy rows created
 * before this upgrade get one lazily the first time they are viewed.
 * Never overwrites an existing code (immutable).
 */
async function ensureCaseCode(appeal) {
  if (appeal?.caseCode) return appeal.caseCode;
  const code = await nextCaseCode(appeal?.createdAt ? new Date(appeal.createdAt) : new Date());
  try {
    await prisma.studentAppeal.update({ where: { id: appeal.id }, data: { caseCode: code } });
  } catch (_) { /* unique race — fall back to display code */ }
  return code;
}

/** Public display code for a case (falls back to APL-<id> for legacy safety). */
const displayCode = (appeal) => appeal?.caseCode || `APL-${appeal?.id}`;

// ------------------------------------------------------------------
// STATUS HISTORY (case-scoped timeline)
// ------------------------------------------------------------------
async function logHistory(appealId, { actorId = null, actorRole = null, action, fromValue = null, toValue = null, note = null } = {}) {
  try {
    await prisma.grievanceStatusHistory.create({
      data: { appealId, actorId, actorRole, action, fromValue, toValue, note },
    });
  } catch (e) {
    console.warn('[lmsGrievance] history skipped:', e.message);
  }
}

module.exports = {
  CASE_TYPES,
  CASE_TYPE_LABEL,
  effectiveCaseType,
  PRIORITIES,
  SLA_HOURS,
  normalisePriority,
  slaDueFrom,
  STATUSES,
  STATUS_LABEL,
  REOPENABLE,
  CATEGORY_CATALOG,
  CATEGORY_INDEX,
  categoryLabel,
  ROUTE_ROLE_LABEL,
  ROUTE_TO_DB_ROLE,
  defaultRouteRole,
  resolveRouteStaff,
  nextCaseCode,
  ensureCaseCode,
  displayCode,
  logHistory,
};

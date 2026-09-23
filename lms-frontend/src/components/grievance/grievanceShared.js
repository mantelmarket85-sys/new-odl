// ============================================================
//  SUPPORT & GRIEVANCES — SHARED FRONTEND VOCABULARY / HELPERS
//  ------------------------------------------------------------
//  Client-side mirror of backend/src/utils/lmsGrievance.js labels so
//  the staff UI can render friendly text/colours without a round-trip.
//  The backend always sends *Label fields too; these are fallbacks and
//  colour maps only. Kept intentionally free of React so it can be
//  imported by any component.
// ============================================================

// Status → { label, color } (color = Badge/Tailwind token used across UI).
export const STATUS_META = {
  DRAFT: { label: "Draft", color: "slate" },
  OPEN: { label: "Submitted", color: "blue" },
  ASSIGNED: { label: "Assigned", color: "cyan" },
  IN_REVIEW: { label: "Under Review", color: "amber" },
  IN_PROGRESS: { label: "In Progress", color: "violet" },
  AWAITING_STUDENT: { label: "Awaiting Student", color: "orange" },
  ESCALATED: { label: "Escalated", color: "rose" },
  RESOLVED: { label: "Resolved", color: "emerald" },
  CLOSED: { label: "Closed", color: "green" },
  REJECTED: { label: "Rejected", color: "red" },
  REOPENED: { label: "Reopened", color: "purple" },
};

export const statusMeta = (s) => STATUS_META[s] || { label: s || "—", color: "slate" };

// Priority → { label, color }.
export const PRIORITY_META = {
  LOW: { label: "Low", color: "slate" },
  MEDIUM: { label: "Medium", color: "blue" },
  HIGH: { label: "High", color: "amber" },
  URGENT: { label: "Urgent", color: "rose" },
};
export const priorityMeta = (p) => PRIORITY_META[p] || PRIORITY_META.MEDIUM;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

// Case type → colour (labels come from backend caseTypeLabel).
export const CASE_TYPE_COLOR = {
  GRIEVANCE: "rose",
  SUPPORT: "blue",
  APPEAL: "violet",
  SUGGESTION: "cyan",
  FEEDBACK: "emerald",
};
export const caseTypeColor = (t) => CASE_TYPE_COLOR[t] || "slate";

export const CASE_TYPE_LABEL = {
  GRIEVANCE: "Grievance",
  SUPPORT: "Support Request",
  APPEAL: "Appeal",
  SUGGESTION: "Suggestion",
  FEEDBACK: "Feedback",
};

// Routing role → label (mirror of backend ROUTE_ROLE_LABEL).
export const ROUTE_ROLE_LABEL = {
  TEACHER: "Teacher",
  COURSE_COORDINATOR: "Course Coordinator",
  FOCAL_PERSON: "Focal Person",
  EXAM_CONTROLLER: "Exam Coordinator",
  QEC_COORDINATOR: "QEC Coordinator",
  PROVOST: "Provost",
  FINANCE: "Finance",
};

// LmsUser.role (raw) → friendly label for message/note authors.
export const ACTOR_ROLE_LABEL = {
  Student: "Student",
  Teacher: "Teacher",
  CourseCoordinator: "Course Coordinator",
  FocalPerson: "Focal Person",
  ExamController: "Exam Coordinator",
  QECCoordinator: "QEC Coordinator",
  Provost: "Provost",
  SuperAdmin: "Administrator",
};
export const actorRoleLabel = (r) => ACTOR_ROLE_LABEL[r] || r || "Staff";

// Statuses a staff member can move a case into (grouped for the menu).
export const WORKFLOW_STATUSES = [
  "ASSIGNED",
  "IN_REVIEW",
  "IN_PROGRESS",
  "AWAITING_STUDENT",
  "RESOLVED",
  "CLOSED",
  "REJECTED",
];

// Human-friendly timeline action verbs.
export const HISTORY_ACTION_LABEL = {
  STATUS_CHANGE: "Status changed",
  PRIORITY: "Priority updated",
  ASSIGN: "Assigned",
  REASSIGN: "Reassigned",
  ESCALATE: "Escalated",
  CREATED: "Case created",
  REOPEN: "Reopened",
};
export const historyActionLabel = (a) => HISTORY_ACTION_LABEL[a] || (a || "").replace(/_/g, " ");

// Date formatting shared across the portal.
export const fmtDateTime = (d) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(d); }
};
export const fmtDate = (d) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return String(d); }
};

// Relative "time left / overdue" for SLA badges.
export function slaState(caseRow) {
  const terminal = ["RESOLVED", "CLOSED", "REJECTED"].includes(caseRow?.status);
  const due = caseRow?.slaDueAt ? new Date(caseRow.slaDueAt) : null;
  if (!due) return null;
  const now = new Date();
  const ms = due - now;
  const breached = caseRow?.slaBreached || (!terminal && ms < 0);
  const hours = Math.round(Math.abs(ms) / 3.6e6);
  const label = hours >= 48
    ? `${Math.round(hours / 24)}d`
    : `${hours}h`;
  if (terminal) return { color: "slate", text: "SLA closed", breached: false, terminal: true };
  if (breached) return { color: "rose", text: `Overdue ${label}`, breached: true };
  return { color: hours <= 12 ? "amber" : "emerald", text: `${label} left`, breached: false };
}

// ============================================================
//  TEACHER — SUPPORT & GRIEVANCES
//  Upgraded from the legacy Appeals UI to the unified Support &
//  Grievances staff portal (case list/filter, conversation,
//  internal notes, assign/reassign, priority, status, escalation,
//  SLA, timeline, resolution/closure). Data + authorization are
//  server-scoped to this teacher's cases via /grievances.
// ============================================================
import StaffGrievancePortal from "../../components/grievance/StaffGrievancePortal";

const TeacherAppeals = () => (
  <StaffGrievancePortal
    title="Support & Grievances"
    subtitle="Review and resolve support requests, grievances and appeals from your students"
    breadcrumb={["Teacher", "Support & Grievances"]}
    icon="ShieldAlert"
  />
);

export default TeacherAppeals;

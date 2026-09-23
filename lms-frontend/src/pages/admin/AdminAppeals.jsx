// ============================================================
//  COURSE COORDINATOR — SUPPORT & GRIEVANCES
//  Upgraded from the legacy Appeals decision table to the unified
//  Support & Grievances staff portal (case list/filter, conversation,
//  internal notes, assign/reassign, priority, status, escalation, SLA,
//  timeline, resolution/closure). Server-scoped to this coordinator's
//  department cases via /grievances.
// ============================================================
import StaffGrievancePortal from "../../components/grievance/StaffGrievancePortal";

const AdminAppeals = () => (
  <StaffGrievancePortal
    title="Support & Grievances"
    subtitle="Manage, route and resolve student cases across your department"
    breadcrumb={["Course Coordinator", "Support & Grievances"]}
    icon="ShieldAlert"
  />
);

export default AdminAppeals;

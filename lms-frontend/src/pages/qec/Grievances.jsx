// ============================================================
//  QEC COORDINATOR — SUPPORT & GRIEVANCES
//  Handles quality / service cases, suggestions and feedback routed
//  to QEC_COORDINATOR. Uses the unified staff portal; server scopes
//  visibility to this role.
// ============================================================
import StaffGrievancePortal from "../../components/grievance/StaffGrievancePortal";

const QecGrievances = () => (
  <StaffGrievancePortal
    title="Support & Grievances"
    subtitle="Quality, service, suggestion and feedback cases routed to the QEC"
    breadcrumb={["QEC Coordinator", "Support & Grievances"]}
    icon="ShieldAlert"
  />
);

export default QecGrievances;

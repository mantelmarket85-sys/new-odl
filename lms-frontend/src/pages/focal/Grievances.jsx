// ============================================================
//  FOCAL PERSON — SUPPORT & GRIEVANCES
//  Handles departmental grievances plus administrative / finance
//  cases routed to FOCAL_PERSON / FINANCE. Uses the unified staff
//  portal; server scopes visibility to this Focal Person's remit.
// ============================================================
import StaffGrievancePortal from "../../components/grievance/StaffGrievancePortal";

const FocalGrievances = () => (
  <StaffGrievancePortal
    title="Support & Grievances"
    subtitle="Departmental grievances plus administrative and finance-related student cases"
    breadcrumb={["Focal Person", "Support & Grievances"]}
    icon="ShieldAlert"
  />
);

export default FocalGrievances;

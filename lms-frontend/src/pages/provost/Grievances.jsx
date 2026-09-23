// ============================================================
//  PROVOST — SUPPORT & GRIEVANCES (university-wide oversight)
//  Governance view over ALL cases, including finance-routed cases
//  (Finance is merged into the Provost office in this LMS). Uses the
//  unified staff portal; the server grants Provost full visibility
//  and every management action (assign, escalate, resolve/close).
// ============================================================
import StaffGrievancePortal from "../../components/grievance/StaffGrievancePortal";

const ProvostGrievances = () => (
  <StaffGrievancePortal
    title="Support & Grievances"
    subtitle="University-wide oversight of all student support, grievance, finance and appeal cases"
    breadcrumb={["Provost", "Support & Grievances"]}
    icon="ShieldAlert"
  />
);

export default ProvostGrievances;

// ============================================================
//  EXAM COORDINATOR — SUPPORT & GRIEVANCES
//  Handles exam / result cases routed to EXAM_CONTROLLER. Uses the
//  unified staff portal; server scopes visibility to this role.
// ============================================================
import StaffGrievancePortal from "../../components/grievance/StaffGrievancePortal";

const ExamGrievances = () => (
  <StaffGrievancePortal
    title="Support & Grievances"
    subtitle="Exam and result-related student cases routed to the Exam Coordinator"
    breadcrumb={["Exam Coordinator", "Support & Grievances"]}
    icon="ShieldAlert"
  />
);

export default ExamGrievances;

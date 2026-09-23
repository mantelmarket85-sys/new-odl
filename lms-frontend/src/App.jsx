import { Routes, Route, Navigate } from "react-router-dom";
import LmsProtectedRoute from "./components/LmsProtectedRoute";

// Auth
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";
import VerifyOTP from "./pages/auth/VerifyOTP";
import ResetPassword from "./pages/auth/ResetPassword";
import ForceChangePassword from "./pages/auth/ForceChangePassword";

// Layout
import DashboardLayout from "./components/layout/DashboardLayout";

// Student pages
import StudentDashboard from "./pages/student/Dashboard";
import StudentCourses from "./pages/student/Courses";
import StudentCourseDetail from "./pages/student/CourseDetail";
import StudentLabTasks from "./pages/student/StudentLabTasks";
import StudentWithdrawal from "./pages/student/Withdrawal";
import StudentLiveClasses from "./pages/student/LiveClasses";
import StudentRecorded from "./pages/student/RecordedLectures";
import StudentAssignments from "./pages/student/Assignments";
import StudentQuizzes from "./pages/student/Quizzes";
import StudentAssessments from "./pages/student/Assessments";
import StudentAttendance from "./pages/student/Attendance";
import StudentResults from "./pages/student/Results";
import StudentCGPA from "./pages/student/CGPACalculator";
import StudentAccount from "./pages/student/AccountBook";
import StudentNotes from "./pages/student/StickyNotes";
import StudentScheme from "./pages/student/StudyScheme";
import StudentSchedule from "./pages/student/Schedule";
import StudentMessages from "./pages/student/Messages";
import StudentAnnouncements from "./pages/student/Announcements";
import StudentSettings from "./pages/student/Settings";
import StudentLibrary from "./pages/student/Library";
import StudentAIInsights from "./pages/student/AIInsights";
import StudentBadges from "./pages/student/Badges";
import StudentActivity from "./pages/student/ActivityTimeline";
import StudentAppeals from "./pages/student/Appeals";
import StudentAITutor from "./pages/student/AITutor";
import StudentMidTerm from "./pages/student/MidTerm";
import StudentFinalTerm from "./pages/student/FinalTerm";
import StudentSurveys from "./pages/student/Surveys";

// Teacher pages
import TeacherDashboard from "./pages/teacher/Dashboard";
import TeacherSubjects from "./pages/teacher/Subjects";
import TeacherManageOffering from "./pages/teacher/ManageOffering";
import TeacherOfferingPicker from "./pages/teacher/OfferingPicker";
import TeacherLectures from "./pages/teacher/LectureUploads";
import TeacherLive from "./pages/teacher/TeacherLiveClasses";
import TeacherLibrary from "./pages/teacher/TeacherLibrary";
import TeacherAppeals from "./pages/teacher/TeacherAppeals";
import TeacherMidTerm from "./pages/teacher/TeacherMidTerm";
import TeacherFinalTerm from "./pages/teacher/TeacherFinalTerm";
import TeacherMessages from "./pages/teacher/TeacherMessages";
import TeacherSettings from "./pages/teacher/TeacherSettings";
import TeacherCourseHistory from "./pages/teacher/CourseHistory";
import TeacherLabTasks from "./pages/teacher/TeacherLabTasks";

// Admin (Course Coordinator) pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminDegrees from "./pages/admin/Degrees";
import AdminCourses from "./pages/admin/Courses";
import AdminSchemes from "./pages/admin/Schemes";
import AdminTeachers from "./pages/admin/Teachers";
import AdminStudents from "./pages/admin/AdminStudents";
import AdminSections from "./pages/admin/Sections";
import AdminEnrollments from "./pages/admin/Enrollments";
import AdminAnnouncements from "./pages/admin/AdminAnnouncements";
import AdminReports from "./pages/admin/Reports";
import AdminAppeals from "./pages/admin/AdminAppeals";
import AdminWeeklySchedule from "./pages/admin/WeeklySchedule";
import AdminWeightage from "./pages/admin/Weightage";
import AdminTeacherAssignment from "./pages/admin/TeacherAssignment";
// §3.2 — dedicated professional table-style "New Distribution" page
import AdminNewDistribution from "./pages/admin/NewDistribution";
import AdminStudentAllocation from "./pages/admin/StudentAllocation";
import CoordinatorSettings from "./pages/admin/CoordinatorSettings";
import AdminClassMonitoring from "./pages/admin/ClassMonitoring";
import AdminLiveClassSchedule from "./pages/admin/LiveClassSchedule";
import AdminTeacherReplacement from "./pages/admin/TeacherReplacement";
import AdminQuickMessages from "./pages/admin/QuickMessages";

// Focal Person pages
import FocalDashboard from "./pages/focal/Dashboard";
import FocalOverview from "./pages/focal/Overview";
import FocalEnrollments from "./pages/focal/Enrollments";
import FocalPromotions from "./pages/focal/Promotions";
import FocalRetakes from "./pages/focal/Retakes";
import FocalWithdraws from "./pages/focal/Withdraws";
import FocalScheme from "./pages/focal/SchemeOfStudy";
import FocalStudentSearch from "./pages/focal/StudentSearch";
import FocalStudentDrop from "./pages/focal/StudentDrop";
import FocalAssessmentMonitor from "./pages/focal/AssessmentMonitor";
import FocalAttendance from "./pages/focal/AttendanceAnalytics";
import FocalQuickMessages from "./pages/focal/QuickMessages";
import FocalSurveys from "./pages/focal/Surveys";
import FocalDeactivations from "./pages/focal/Deactivations";
import FocalReports from "./pages/focal/Reports";
import FocalActivityLogs from "./pages/focal/ActivityLogs";
import FocalSettings from "./pages/focal/Settings";
import FocalDiscipline from "./pages/focal/Discipline";
import FocalFineManagement from "./pages/focal/FineManagement";
import FocalGrievances from "./pages/focal/Grievances";

// Exam Controller pages
import ExamDashboard from "./pages/exam/Dashboard";
import ExamSchedule from "./pages/exam/Schedule";
import ExamDatesheets from "./pages/exam/Datesheets";
import ExamMidTerm from "./pages/exam/MidTerm";
import ExamFinalTerm from "./pages/exam/FinalTerm";
import ExamTracking from "./pages/exam/Tracking";
import ExamReports from "./pages/exam/Reports";
import ExamAnalytics from "./pages/exam/Analytics";
import ExamActivityLogs from "./pages/exam/ActivityLogs";
import ExamSettings from "./pages/exam/Settings";
import ExamUFM from "./pages/exam/UFMCases";
import ExamAbsentees from "./pages/exam/Absentees";
import ExamMarksCorrection from "./pages/exam/MarksCorrection";
import ExamIncomplete from "./pages/exam/Incomplete";
import ExamGazette from "./pages/exam/Gazette";
import ExamProbation from "./pages/exam/Probation";
import ExamSeating from "./pages/exam/Seating";
import ExamGrievances from "./pages/exam/Grievances";

// QEC Coordinator pages
import QecDashboard from "./pages/qec/Dashboard";
import QecAnalytics from "./pages/qec/Analytics";
import QecSurveys from "./pages/qec/Surveys";
import QecCourseEvaluation from "./pages/qec/CourseEvaluation";
import QecFeedback from "./pages/qec/Feedback";
import QecDepartments from "./pages/qec/Departments";
import QecReports from "./pages/qec/Reports";
import QecCompliance from "./pages/qec/Compliance";
import QecActivityLogs from "./pages/qec/ActivityLogs";
import QecSettings from "./pages/qec/Settings";
import QecFacultyEval from "./pages/qec/FacultyEval";
import QecProgramEval from "./pages/qec/ProgramEval";
import QecSelfAssessment from "./pages/qec/SelfAssessment";
import QecGrievances from "./pages/qec/Grievances";

// Provost pages
import ProvostDashboard from "./pages/provost/Dashboard";
import ProvostAnalytics from "./pages/provost/Analytics";
import ProvostDepartments from "./pages/provost/Departments";
import ProvostPrograms from "./pages/provost/Programs";
import ProvostFaculty from "./pages/provost/Faculty";
import ProvostStudents from "./pages/provost/Students";
import ProvostFinance from "./pages/provost/Finance";
import ProvostFeeApprovals from "./pages/provost/FeeApprovals";
import ProvostReports from "./pages/provost/Reports";
import ProvostActivityLogs from "./pages/provost/ActivityLogs";
import ProvostSettings from "./pages/provost/Settings";
import ProvostFeeAnnouncements from "./pages/provost/FeeAnnouncements";
import ProvostExamFeeAnnouncements from "./pages/provost/ExamFeeAnnouncements";
import ProvostFines from "./pages/provost/Fines";
import ProvostDefaulters from "./pages/provost/Defaulters";
import ProvostFeeManagement from "./pages/provost/FeeManagement";
import ProvostFeeAnnounce from "./pages/provost/FeeAnnounce";
import ProvostFeeRecords from "./pages/provost/FeeRecords";
import ProvostFeeReports from "./pages/provost/FeeReports";
import ProvostGrievances from "./pages/provost/Grievances";

/* =========================================================================
 * Role → URL base mapping (Finance role merged into Provost)
 * ======================================================================= */
const ROLE_BASE = {
  student: "/student",
  teacher: "/teacher",
  admin: "/admin",
  focal_person: "/focal",
  exam_coordinator: "/exam",
  director_qec: "/qec",
  provost: "/provost",
};

/* Every existing route is wrapped with this Protected component. It now
 * delegates to LmsProtectedRoute (Section 5.3/5.4) which enforces:
 *   - authentication (→ /login)
 *   - forced password change (→ /force-change-password)
 *   - role authorization (→ 403)
 * The single-`role` prop is preserved so existing route declarations are
 * unchanged; it is forwarded as a one-element allowedRoles array. */
const Protected = ({ role, children }) => {
  return (
    <LmsProtectedRoute allowedRoles={role ? [role] : undefined}>
      {children}
    </LmsProtectedRoute>
  );
};

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify-otp" element={<VerifyOTP />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Forced first-login password change (Section 5.6) */}
      <Route path="/force-change-password" element={<ForceChangePassword />} />

      {/* ============ STUDENT ============ */}
      <Route
        path="/student"
        element={
          <Protected role="student">
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<StudentDashboard />} />
        <Route path="courses" element={<StudentCourses />} />
        <Route path="courses/:offeringId" element={<StudentCourseDetail />} />
        {/* Req 3.2 — Student Lab Tasks module */}
        <Route path="lab-tasks" element={<StudentLabTasks />} />
        {/* Req 3.5 — manual "Register for Course" removed; students are
            auto-enrolled into their 1st-semester Scheme of Study courses. */}
        <Route path="withdrawal" element={<StudentWithdrawal />} />
        <Route path="live-classes" element={<StudentLiveClasses />} />
        <Route path="recorded" element={<StudentRecorded />} />
        <Route path="assignments" element={<StudentAssignments />} />
        <Route path="quizzes" element={<StudentQuizzes />} />
        <Route path="assessments" element={<StudentAssessments />} />
        <Route path="attendance" element={<StudentAttendance />} />
        <Route path="results" element={<StudentResults />} />
        <Route path="cgpa" element={<StudentCGPA />} />
        <Route path="account" element={<StudentAccount />} />
        <Route path="notes" element={<StudentNotes />} />
        <Route path="scheme" element={<StudentScheme />} />
        <Route path="schedule" element={<StudentSchedule />} />
        <Route path="messages" element={<StudentMessages />} />
        <Route path="announcements" element={<StudentAnnouncements />} />
        <Route path="settings" element={<StudentSettings />} />
        <Route path="library" element={<StudentLibrary />} />
        <Route path="ai-insights" element={<StudentAIInsights />} />
        <Route path="badges" element={<StudentBadges />} />
        <Route path="activity" element={<StudentActivity />} />
        <Route path="appeals" element={<StudentAppeals />} />
        <Route path="ai-tutor" element={<StudentAITutor />} />
        <Route path="midterm" element={<StudentMidTerm />} />
        <Route path="finalterm" element={<StudentFinalTerm />} />
        <Route path="surveys" element={<StudentSurveys />} />
      </Route>

      {/* ============ TEACHER ============ */}
      <Route
        path="/teacher"
        element={
          <Protected role="teacher">
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<TeacherDashboard />} />
        <Route path="subjects" element={<TeacherSubjects />} />
        <Route path="lab-tasks" element={<TeacherLabTasks />} />
        <Route path="offerings/:offeringId" element={<TeacherManageOffering />} />
        <Route path="lectures" element={<TeacherLectures />} />
        <Route path="live-classes" element={<TeacherLive />} />
        <Route
          path="assignments"
          element={
            <TeacherOfferingPicker
              title="Assignments"
              subtitle="Select a course to create, view and grade assignments"
              icon="FileText"
              tab="assignments"
              scope="assignments"
            />
          }
        />
        <Route
          path="quizzes"
          element={
            <TeacherOfferingPicker
              title="Quizzes"
              subtitle="Select a course to manage quizzes and questions"
              icon="FileQuestion"
              tab="quizzes"
              scope="quizzes"
            />
          }
        />
        <Route
          path="marks"
          element={
            <TeacherOfferingPicker
              title="Marks & Gradebook"
              subtitle="Select a course to enter marks and publish results"
              icon="Award"
              tab="marks"
              scope="marks"
            />
          }
        />
        <Route
          path="attendance"
          element={
            <TeacherOfferingPicker
              title="Attendance"
              subtitle="Select a course to record and review attendance"
              icon="CalendarCheck"
              tab="attendance"
              scope="attendance"
            />
          }
        />
        <Route
          path="students"
          element={
            <TeacherOfferingPicker
              title="Students"
              subtitle="Select a course to view enrolled students"
              icon="Users"
              tab="students"
              scope="students"
            />
          }
        />
        <Route
          path="announcements"
          element={
            <TeacherOfferingPicker
              title="Announcements"
              subtitle="Select a course to post and manage announcements"
              icon="Megaphone"
              tab="announcements"
              scope="announcements"
            />
          }
        />
        <Route path="library" element={<TeacherLibrary />} />
        <Route path="appeals" element={<TeacherAppeals />} />
        <Route path="midterm" element={<TeacherMidTerm />} />
        <Route path="finalterm" element={<TeacherFinalTerm />} />
        <Route path="messages" element={<TeacherMessages />} />
        <Route path="history" element={<TeacherCourseHistory />} />
        <Route path="settings" element={<TeacherSettings />} />
      </Route>

      {/* ============ COURSE COORDINATOR (admin) ============ */}
      <Route
        path="/admin"
        element={
          <Protected role="admin">
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="degrees" element={<AdminDegrees />} />
        <Route path="courses" element={<AdminCourses />} />
        <Route path="subjects" element={<AdminCourses />} />
        <Route path="schemes" element={<AdminSchemes />} />
        <Route path="teachers" element={<AdminTeachers />} />
        <Route path="students" element={<AdminStudents />} />
        {/* Section Management merged into the unified Student Allocation & Sections module */}
        <Route path="sections" element={<Navigate to="/admin/student-allocation" replace />} />
        <Route path="enrollments" element={<AdminEnrollments />} />
        <Route path="announcements" element={<AdminAnnouncements />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="appeals" element={<AdminAppeals />} />
        <Route path="schedule" element={<AdminWeeklySchedule />} />
        <Route path="weightage" element={<AdminWeightage />} />
        <Route path="teacher-assignment" element={<AdminTeacherAssignment />} />
        <Route path="teacher-assignment/new" element={<AdminNewDistribution />} />
        <Route path="student-allocation" element={<AdminStudentAllocation />} />
        <Route path="class-monitoring" element={<AdminClassMonitoring />} />
        <Route path="live-classes" element={<AdminLiveClassSchedule />} />
        <Route path="teacher-replacement" element={<AdminTeacherReplacement />} />
        <Route path="quick-messages" element={<AdminQuickMessages />} />
        <Route path="settings" element={<CoordinatorSettings />} />
      </Route>

      {/* ============ FOCAL PERSON ============ */}
      <Route
        path="/focal"
        element={
          <Protected role="focal_person">
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<FocalDashboard />} />
        <Route path="overview" element={<FocalOverview />} />
        <Route path="enrollments" element={<FocalEnrollments />} />
        <Route path="promotions" element={<FocalPromotions />} />
        <Route path="retakes" element={<FocalRetakes />} />
        <Route path="withdraws" element={<FocalWithdraws />} />
        <Route path="scheme" element={<FocalScheme />} />
        <Route path="student-search" element={<FocalStudentSearch />} />
        <Route path="student-drop" element={<FocalStudentDrop />} />
        <Route path="results" element={<FocalAssessmentMonitor variant="results" />} />
        {/* Req 2 — Focal Person lab-task oversight (live, view-only) */}
        <Route path="lab-tasks" element={<FocalAssessmentMonitor variant="labtasks" />} />
        <Route path="attendance" element={<FocalAttendance />} />
        <Route path="quick-messages" element={<FocalQuickMessages />} />
        <Route path="surveys" element={<FocalSurveys />} />
        <Route path="deactivations" element={<FocalDeactivations />} />
        <Route path="discipline" element={<FocalDiscipline />} />
        <Route path="fines" element={<FocalFineManagement />} />
        <Route path="grievances" element={<FocalGrievances />} />
        <Route path="reports" element={<FocalReports />} />
        <Route path="activity-logs" element={<FocalActivityLogs />} />
        <Route path="settings" element={<FocalSettings />} />
      </Route>
      <Route path="/focal_person" element={<Navigate to="/focal" replace />} />

      {/* ============ EXAM CONTROLLER ============ */}
      <Route
        path="/exam"
        element={
          <Protected role="exam_coordinator">
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<ExamDashboard />} />
        <Route path="schedule" element={<ExamSchedule />} />
        <Route path="datesheets" element={<ExamDatesheets />} />
        <Route path="attendance" element={<ExamSeating />} />
        <Route path="midterm" element={<ExamMidTerm />} />
        <Route path="finalterm" element={<ExamFinalTerm />} />
        <Route path="tracking" element={<ExamTracking />} />
        <Route path="ufm" element={<ExamUFM />} />
        <Route path="absentees" element={<ExamAbsentees />} />
        <Route path="results-compilation" element={<ExamMarksCorrection />} />
        <Route path="incomplete" element={<ExamIncomplete />} />
        <Route path="gazette" element={<ExamGazette />} />
        <Route path="probation" element={<ExamProbation />} />
        <Route path="grievances" element={<ExamGrievances />} />
        <Route path="reports" element={<ExamReports />} />
        <Route path="analytics" element={<ExamAnalytics />} />
        <Route path="activity-logs" element={<ExamActivityLogs />} />
        <Route path="settings" element={<ExamSettings />} />
      </Route>
      <Route path="/exam_coordinator" element={<Navigate to="/exam" replace />} />

      {/* ============ QEC COORDINATOR ============ */}
      <Route
        path="/qec"
        element={
          <Protected role="director_qec">
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<QecDashboard />} />
        <Route path="analytics" element={<QecAnalytics />} />
        <Route path="surveys" element={<QecSurveys />} />
        <Route path="faculty-eval" element={<QecFacultyEval />} />
        <Route path="course-evaluation" element={<QecCourseEvaluation />} />
        <Route path="program-eval" element={<QecProgramEval />} />
        <Route path="self-assessment" element={<QecSelfAssessment />} />
        <Route path="feedback" element={<QecFeedback />} />
        <Route path="grievances" element={<QecGrievances />} />
        <Route path="departments" element={<QecDepartments />} />
        <Route path="reports" element={<QecReports />} />
        <Route path="compliance" element={<QecCompliance />} />
        <Route path="activity-logs" element={<QecActivityLogs />} />
        <Route path="settings" element={<QecSettings />} />
      </Route>
      <Route path="/director_qec" element={<Navigate to="/qec" replace />} />

      {/* ============ PROVOST (with merged Finance Coordinator) ============ */}
      <Route
        path="/provost"
        element={
          <Protected role="provost">
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<ProvostDashboard />} />
        <Route path="analytics" element={<ProvostAnalytics />} />
        <Route path="departments" element={<ProvostDepartments />} />
        <Route path="programs" element={<ProvostPrograms />} />
        <Route path="faculty" element={<ProvostFaculty />} />
        <Route path="students" element={<ProvostStudents />} />
        <Route path="finance" element={<ProvostFinance />} />
        {/* Provost Fee Management module */}
        <Route path="fee-management" element={<ProvostFeeManagement />} />
        <Route path="fee-announce" element={<ProvostFeeAnnounce />} />
        <Route path="fee-records" element={<ProvostFeeRecords />} />
        <Route path="fee-reports" element={<ProvostFeeReports />} />
        <Route path="fee-announcements" element={<ProvostFeeAnnouncements />} />
        <Route path="exam-fee-announcements" element={<ProvostExamFeeAnnouncements />} />
        <Route path="fee-approvals" element={<ProvostFeeApprovals />} />
        <Route path="fines" element={<ProvostFines />} />
        <Route path="defaulters" element={<ProvostDefaulters />} />
        <Route path="grievances" element={<ProvostGrievances />} />
        <Route path="reports" element={<ProvostReports />} />
        <Route path="activity-logs" element={<ProvostActivityLogs />} />
        <Route path="settings" element={<ProvostSettings />} />
      </Route>
      {/* Legacy redirects: finance coordinator merged into provost */}
      <Route path="/finance" element={<Navigate to="/provost/finance" replace />} />
      <Route path="/finance_coordinator" element={<Navigate to="/provost" replace />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

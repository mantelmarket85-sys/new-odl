import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import * as Icons from "lucide-react";
import Logo from "../common/Logo";
import { useAuth } from "../../context/AuthContext";
import { ROLE_META } from "../../context/AuthContext";
import api from "../../services/api";

/* =========================================================================
 * STUDENT MENU (existing)
 *   - "Academic Progress" label removed/renamed as per spec
 * ======================================================================= */
const studentMenu = [
  { section: "MAIN" },
  { label: "Dashboard", icon: "LayoutDashboard", to: "/student" },
  { label: "My Courses", icon: "BookOpen", to: "/student/courses" },
  { label: "Live Classes", icon: "Video", to: "/student/live-classes", badge: "Live", badgeColor: "rose" },
  { label: "Recorded Lectures", icon: "PlayCircle", to: "/student/recorded" },
  { label: "Course Library", icon: "Library", to: "/student/library" },
  { label: "AI Tutor", icon: "Bot", to: "/student/ai-tutor", badge: "AI", badgeColor: "violet" },
  { section: "ACADEMICS" },
  { label: "Assignments", icon: "FileText", to: "/student/assignments" },
  { label: "Lab Tasks", icon: "FlaskConical", to: "/student/lab-tasks" },
  { label: "Quizzes", icon: "FileQuestion", to: "/student/quizzes" },
  /* Removed: Academic Progress module (per restructuring spec) */
  { label: "Mid Term Exam", icon: "FileEdit", to: "/student/midterm" },
  { label: "Final Term Exam", icon: "FileCheck2", to: "/student/finalterm" },
  { label: "Attendance", icon: "CalendarCheck", to: "/student/attendance" },
  { label: "Results", icon: "Award", to: "/student/results" },
  { label: "CGPA Calculator", icon: "Calculator", to: "/student/cgpa" },
  { label: "Study Scheme", icon: "GraduationCap", to: "/student/scheme" },
  { label: "Course Withdrawal", icon: "LogOut", to: "/student/withdrawal" },
  { section: "ACHIEVEMENTS" },
  { label: "AI Insights", icon: "Sparkles", to: "/student/ai-insights", badge: "AI", badgeColor: "violet" },
  { label: "Badges", icon: "Trophy", to: "/student/badges" },
  { label: "Activity", icon: "Activity", to: "/student/activity" },
  { section: "COMMUNICATION" },
  { label: "Messages", icon: "MessageSquare", to: "/student/messages" },
  { label: "Announcements", icon: "Megaphone", to: "/student/announcements" },
  { label: "Support & Grievances", icon: "ShieldAlert", to: "/student/appeals" },
  { label: "QEC Surveys", icon: "ClipboardList", to: "/student/surveys", badge: "QEC", badgeColor: "violet" },
  { section: "OTHER" },
  { label: "Accounts Book", icon: "Wallet", to: "/student/account" },
  { label: "Sticky Notes", icon: "StickyNote", to: "/student/notes" },
  { label: "Schedule", icon: "Calendar", to: "/student/schedule" },
  { label: "Settings", icon: "Settings", to: "/student/settings" },
];

/* =========================================================================
 * TEACHER MENU
 *   - "Lecture Uploads" remains; new "Course Material" entry added
 *   - "Course History" added (historical data section)
 * ======================================================================= */
const teacherMenu = [
  { section: "MAIN" },
  { label: "Dashboard", icon: "LayoutDashboard", to: "/teacher" },
  { label: "My Courses", icon: "BookOpen", to: "/teacher/subjects" },
  { label: "Live Classes", icon: "Video", to: "/teacher/live-classes" },
  { label: "Recorded Lectures", icon: "Video", to: "/teacher/lectures" },
  { label: "Course Library", icon: "Library", to: "/teacher/library" },
  { section: "ACADEMICS" },
  { label: "Assignments", icon: "FileText", to: "/teacher/assignments" },
  { label: "Lab Tasks", icon: "FlaskConical", to: "/teacher/lab-tasks" },
  { label: "Quizzes", icon: "FileQuestion", to: "/teacher/quizzes" },
  { label: "Mid Term Exam", icon: "FileEdit", to: "/teacher/midterm" },
  { label: "Final Term Exam", icon: "FileCheck2", to: "/teacher/finalterm" },
  { label: "Marks", icon: "Award", to: "/teacher/marks" },
  { label: "Attendance", icon: "CalendarCheck", to: "/teacher/attendance" },
  { label: "Students", icon: "Users", to: "/teacher/students" },
  { label: "Course History", icon: "History", to: "/teacher/history" },
  { section: "COMMUNICATION" },
  { label: "Announcements", icon: "Megaphone", to: "/teacher/announcements" },
  { label: "Messages", icon: "MessageSquare", to: "/teacher/messages" },
  { label: "Support & Grievances", icon: "ShieldAlert", to: "/teacher/appeals" },
  { section: "OTHER" },
  { label: "Settings", icon: "Settings", to: "/teacher/settings" },
];

/* =========================================================================
 * COURSE COORDINATOR (admin) MENU
 *   - "Faculty Management" → "Course Instructor"
 *   - "Teacher Assignment" → "Course Distribution"
 *   - "Fee Approvals" REMOVED (moved to Finance Coordinator / Provost)
 *   - "Class Monitoring" added (view-only live class oversight)
 * ======================================================================= */
const adminMenu = [
  { section: "OVERVIEW" },
  { label: "Dashboard", icon: "LayoutDashboard", to: "/admin" },
  { label: "Reports & Analytics", icon: "BarChart3", to: "/admin/reports" },
  { section: "ACADEMIC MANAGEMENT" },
  { label: "Programs", icon: "GraduationCap", to: "/admin/degrees" },
  { label: "Courses & Schemes", icon: "BookOpen", to: "/admin/courses" },
  { label: "Weekly Schedule", icon: "CalendarRange", to: "/admin/schedule" },
  { label: "Weightage", icon: "Scale", to: "/admin/weightage" },
  { label: "Class Monitoring", icon: "Radio", to: "/admin/class-monitoring", badge: "Live", badgeColor: "rose" },
  { label: "Live Class Schedule", icon: "Video", to: "/admin/live-classes" },
  { section: "PEOPLE & ASSIGNMENTS" },
  { label: "Course Instructor", icon: "UserCog", to: "/admin/teachers" },
  { label: "Course Distribution", icon: "UserCheck", to: "/admin/teacher-assignment" },
  { label: "Teacher Replacement", icon: "Replace", to: "/admin/teacher-replacement" },
  { label: "Students", icon: "Users", to: "/admin/students" },
  { label: "Student Allocation & Sections", icon: "UsersRound", to: "/admin/student-allocation" },
  { label: "Enrollments", icon: "ClipboardCheck", to: "/admin/enrollments" },
  { section: "COMMUNICATION" },
  { label: "Support & Grievances", icon: "ShieldAlert", to: "/admin/appeals" },
  { label: "Announcements", icon: "Megaphone", to: "/admin/announcements" },
  { label: "Quick Messages", icon: "Send", to: "/admin/quick-messages", badge: "New", badgeColor: "violet" },
  { label: "Settings", icon: "Settings", to: "/admin/settings" },
];

/* =========================================================================
 * FOCAL PERSON MENU — Department-level academic oversight
 *   - REMOVED: Quizzes / Assignments / Mid / Final monitoring (per spec)
 *   - REMOVED: Transcripts module (merged into Student Search)
 *   - NEW: Discipline & Fines
 *   - NEW: Enrollment Analytics (within Reports)
 * ======================================================================= */
const focalMenu = [
  { section: "MAIN" },
  { label: "Dashboard", icon: "LayoutDashboard", to: "/focal" },
  { label: "Department Overview", icon: "Building2", to: "/focal/overview" },
  { section: "ENROLLMENT MANAGEMENT" },
  { label: "Manage Enrollments", icon: "ClipboardCheck", to: "/focal/enrollments", badge: "12", badgeColor: "amber" },
  { label: "Semester Promotions", icon: "TrendingUp", to: "/focal/promotions" },
  { label: "Retake & Improvement", icon: "RotateCcw", to: "/focal/retakes" },
  { label: "Withdraw Cases", icon: "LogOut", to: "/focal/withdraws" },
  { label: "Scheme of Study", icon: "GraduationCap", to: "/focal/scheme" },
  { section: "STUDENT MANAGEMENT" },
  { label: "Student Search", icon: "Search", to: "/focal/student-search" },
  { label: "Student Block", icon: "UserX", to: "/focal/student-drop" },
  { label: "Discipline & Fines", icon: "AlertOctagon", to: "/focal/discipline", badge: "New", badgeColor: "violet" },
  { label: "Fine Management", icon: "DollarSign", to: "/focal/fines", badge: "New", badgeColor: "emerald" },
  { section: "MONITORING (VIEW ONLY)" },
  { label: "Lab Tasks Monitor", icon: "FlaskConical", to: "/focal/lab-tasks" },
  { label: "Attendance Analytics", icon: "CalendarCheck", to: "/focal/attendance" },
  { label: "Results Analytics", icon: "Award", to: "/focal/results" },
  { section: "COMMUNICATION & QEC" },
  { label: "Messages", icon: "MessageSquare", to: "/focal/quick-messages" },
  { label: "Support & Grievances", icon: "ShieldAlert", to: "/focal/grievances" },
  { label: "Surveys & QEC", icon: "ClipboardList", to: "/focal/surveys" },
  { label: "Teacher Deactivation", icon: "UserMinus", to: "/focal/deactivations", badge: "1", badgeColor: "amber" },
  { section: "REPORTING" },
  { label: "Reports & Analytics", icon: "BarChart3", to: "/focal/reports" },
  { label: "Activity Logs", icon: "ScrollText", to: "/focal/activity-logs" },
  { label: "Settings", icon: "Settings", to: "/focal/settings" },
];

/* =========================================================================
 * EXAM CONTROLLER MENU (renamed from Exam Coordinator)
 *   - NEW: UFM Cases, Absentee Verification, Rechecking, Marks Correction,
 *          Result Hold/Release, Gazette Review, Probation Flagging
 * ======================================================================= */
const examMenu = [
  { section: "OVERVIEW" },
  { label: "Dashboard", icon: "LayoutDashboard", to: "/exam" },
  { section: "EXAM OPERATIONS" },
  { label: "Online Exam Management", icon: "Monitor", to: "/exam/schedule", badge: "Online", badgeColor: "blue" },
  { label: "Date Sheets", icon: "FileText", to: "/exam/datesheets" },
  { label: "Attendance", icon: "CalendarCheck", to: "/exam/attendance" },
  { section: "CASES & VERIFICATION" },
  { label: "UFM Cases", icon: "AlertTriangle", to: "/exam/ufm", badgeKey: "ufm", badgeColor: "rose" },
  { label: "Absentee Verification", icon: "UserX", to: "/exam/absentees" },
  { label: "Incomplete Results", icon: "FileWarning", to: "/exam/incomplete" },
  { section: "RESULT AND MANAGEMENT" },
  { label: "Results Compilation", icon: "Edit3", to: "/exam/results-compilation", badgeKey: "draftResults", badgeColor: "violet" },
  { label: "Results Collection", icon: "Table2", to: "/exam/results-collection" },
  { label: "Result Finalizing & Official Declaration", icon: "Lock", to: "/exam/result-finalizing" },
  { label: "Result Archive", icon: "Archive", to: "/exam/result-archive" },
  { label: "Gazette Review", icon: "BookCheck", to: "/exam/gazette" },
  { label: "Probation Flagging", icon: "Flag", to: "/exam/probation" },
  { section: "MONITORING" },
  { label: "Mid Term Monitoring", icon: "FileEdit", to: "/exam/midterm" },
  { label: "Final Term Monitoring", icon: "FileCheck2", to: "/exam/finalterm" },
  { label: "Exam Tracking", icon: "Activity", to: "/exam/tracking" },
  { section: "STUDENT SUPPORT" },
  { label: "Support & Grievances", icon: "ShieldAlert", to: "/exam/grievances" },
  { section: "REPORTS" },
  { label: "Exam Reports", icon: "BarChart3", to: "/exam/reports" },
  { label: "Result Analytics", icon: "TrendingUp", to: "/exam/analytics" },
  { label: "Activity Logs", icon: "ScrollText", to: "/exam/activity-logs" },
  { label: "Settings", icon: "Settings", to: "/exam/settings" },
];

/* =========================================================================
 * QEC COORDINATOR MENU (renamed from Director QEC)
 *   - NEW: Survey announcement system w/ lock/unlock
 *   - NEW: Faculty / Course / Program Evaluation
 *   - NEW: Self-Assessment & Corrective Action
 *   - NEW: Anonymous Feedback
 * ======================================================================= */
const qecMenu = [
  { section: "OVERVIEW" },
  { label: "Dashboard", icon: "LayoutDashboard", to: "/qec" },
  { label: "Quality Analytics", icon: "BarChart3", to: "/qec/analytics" },
  { section: "SURVEYS" },
  { label: "Survey Management", icon: "ClipboardList", to: "/qec/surveys", badge: "New", badgeColor: "violet" },
  { label: "Anonymous Feedback", icon: "MessageCircle", to: "/qec/feedback" },
  { label: "Support & Grievances", icon: "ShieldAlert", to: "/qec/grievances" },
  { section: "EVALUATION" },
  { label: "Faculty Evaluation", icon: "Star", to: "/qec/faculty-eval" },
  { label: "Course Evaluation", icon: "BookCheck", to: "/qec/course-evaluation" },
  { label: "Program Evaluation", icon: "GraduationCap", to: "/qec/program-eval" },
  { label: "Self-Assessment", icon: "ListChecks", to: "/qec/self-assessment" },
  { section: "REPORTS" },
  { label: "Department Performance", icon: "Building2", to: "/qec/departments" },
  { label: "QA Reports", icon: "FileBarChart", to: "/qec/reports" },
  { label: "Compliance", icon: "ShieldCheck", to: "/qec/compliance" },
  { label: "Activity Logs", icon: "ScrollText", to: "/qec/activity-logs" },
  { label: "Settings", icon: "Settings", to: "/qec/settings" },
];

/* =========================================================================
 * PROVOST MENU — University-wide executive oversight + Finance Coordination
 *   - MERGED in former Finance Coordinator responsibilities:
 *     Fee Announcements, Fee Approvals, Fee Monitoring, Defaulters, Fines
 * ======================================================================= */
const provostMenu = [
  { section: "EXECUTIVE OVERVIEW" },
  { label: "Dashboard", icon: "LayoutDashboard", to: "/provost" },
  { label: "Executive Analytics", icon: "BarChart3", to: "/provost/analytics" },
  { section: "GOVERNANCE" },
  { label: "Departments", icon: "Building2", to: "/provost/departments" },
  { label: "Programs", icon: "GraduationCap", to: "/provost/programs" },
  { label: "Faculty Overview", icon: "UserCog", to: "/provost/faculty" },
  { label: "Student Overview", icon: "Users", to: "/provost/students" },
  { section: "FEE MANAGEMENT" },
  { label: "Fee Management", icon: "Wallet", to: "/provost/fee-management" },
  { label: "Announce Fees", icon: "Megaphone", to: "/provost/fee-announce" },
  { label: "Student Fee Records", icon: "Users", to: "/provost/fee-records" },
  { label: "Fee Reports", icon: "FileBarChart", to: "/provost/fee-reports" },
  { section: "FINANCE COORDINATION" },
  { label: "Financial Overview", icon: "Wallet", to: "/provost/finance" },
  { label: "Fee Announcements", icon: "Megaphone", to: "/provost/fee-announcements" },
  { label: "Exam Fee Announcements", icon: "FileText", to: "/provost/exam-fee-announcements", badge: "New", badgeColor: "rose" },
  { label: "Fee Approvals", icon: "BadgeCheck", to: "/provost/fee-approvals", badge: "3", badgeColor: "amber" },
  { label: "Fines Management", icon: "AlertCircle", to: "/provost/fines" },
  { label: "Defaulters", icon: "UserMinus", to: "/provost/defaulters" },
  { section: "STUDENT SUPPORT" },
  { label: "Support & Grievances", icon: "ShieldAlert", to: "/provost/grievances" },
  { section: "REPORTING" },
  { label: "Strategic Reports", icon: "FileBarChart", to: "/provost/reports" },
  { label: "Activity Logs", icon: "ScrollText", to: "/provost/activity-logs" },
  { label: "Settings", icon: "Settings", to: "/provost/settings" },
];

const MENUS = {
  student: studentMenu,
  teacher: teacherMenu,
  admin: adminMenu,
  focal_person: focalMenu,
  exam_coordinator: examMenu,
  director_qec: qecMenu,
  provost: provostMenu,
};

/* Per-role base path used by the user card link + active matcher. */
const ROLE_BASE = {
  student: "/student",
  teacher: "/teacher",
  admin: "/admin",
  focal_person: "/focal",
  exam_coordinator: "/exam",
  director_qec: "/qec",
  provost: "/provost",
};

const Sidebar = ({ isOpen, onClose, collapsed, onToggleCollapse }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const menu = MENUS[user?.role] || studentMenu;
  const base = ROLE_BASE[user?.role] || "/student";
  const meta = ROLE_META[user?.role] || ROLE_META.student;

  // Live sidebar badge counts for the Exam Controller (replaces hardcoded badges).
  const [counts, setCounts] = useState({});
  useEffect(() => {
    if (user?.role !== "exam_coordinator") return;
    let live = true;
    const fetchCounts = () => {
      api.exam.counts()
        .then((res) => { if (live) setCounts(res || {}); })
        .catch(() => {});
    };
    fetchCounts();
    const t = setInterval(fetchCounts, 60000); // refresh every minute
    return () => { live = false; clearInterval(t); };
  }, [user?.role]);

  const resolveBadge = (item) => {
    if (item.badge) return item.badge;            // static badge (e.g. "Online")
    if (item.badgeKey) {
      const n = counts[item.badgeKey];
      return n && n > 0 ? String(n) : null;       // hide zero counts
    }
    return null;
  };

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen ${collapsed ? "lg:w-[78px]" : "w-72"} bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 z-50 transform transition-all duration-300
        ${isOpen ? "translate-x-0 w-72" : "-translate-x-full"} lg:translate-x-0 flex flex-col`}
      >
        {/* Logo */}
        <div className={`px-4 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center ${collapsed ? "lg:justify-center" : "justify-between"}`}>
          {!collapsed ? <Logo size="sm" to={base} /> : (
            <div className="hidden lg:block">
              <Logo size="sm" showText={false} to={base} />
            </div>
          )}
          {!collapsed && (
            <div className="flex items-center gap-1">
              <button onClick={onToggleCollapse} className="hidden lg:flex p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400">
                <Icons.PanelLeftClose size={18} />
              </button>
              <button onClick={onClose} className="lg:hidden p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400">
                <Icons.X size={20} />
              </button>
            </div>
          )}
        </div>
        {collapsed && (
          <button onClick={onToggleCollapse} className="hidden lg:flex mx-auto mt-2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400">
            <Icons.PanelLeftOpen size={18} />
          </button>
        )}

        {/* User card */}
        {!collapsed && (
          <div className="px-3 py-3 border-b border-slate-100 dark:border-slate-800">
            <div className={`flex items-center gap-3 p-2.5 rounded-xl bg-gradient-to-br ${meta.color} bg-opacity-10 border border-app`}
              style={{ backgroundImage: undefined }}>
              <div className="relative">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user?.name} className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-800 shadow object-cover" />
                ) : (
                  <span className="w-10 h-10 rounded-full border-2 border-white dark:border-slate-800 shadow inline-flex items-center justify-center bg-gradient-to-br from-primary-600 to-indigo-600 text-white font-bold text-sm">
                    {(user?.name || "U").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                  </span>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-app truncate">{user?.name}</p>
                <p className="text-[10px] text-primary-700 dark:text-primary-400 font-bold uppercase tracking-wider truncate">
                  {meta.label}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto no-scrollbar px-2.5 py-3 space-y-0.5">
          {menu.map((item, idx) => {
            if (item.section) {
              if (collapsed) return <div key={idx} className="my-2 border-t border-slate-100 dark:border-slate-800" />;
              return (
                <p key={idx} className="text-[10px] tracking-[0.15em] font-bold text-slate-400 dark:text-slate-500 px-2 mt-4 mb-1.5 uppercase">{item.section}</p>
              );
            }
            const Icon = Icons[item.icon] || Icons.Circle;
            const active = location.pathname === item.to;
            const badge = resolveBadge(item);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === base}
                onClick={onClose}
                title={collapsed ? item.label : ""}
                className={({ isActive }) =>
                  `relative flex items-center ${collapsed ? "lg:justify-center" : "gap-3"} px-3 py-2.5 rounded-xl text-sm font-medium transition-all group
                  ${isActive
                    ? "bg-gradient-to-r from-primary-600 to-blue-500 text-white shadow-lg shadow-primary-500/30"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-primary-700 dark:hover:text-primary-300"
                  }`
                }
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!collapsed && badge && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    item.badgeColor === "rose" ? "bg-rose-500 text-white animate-pulse" :
                    item.badgeColor === "amber" ? "bg-amber-500 text-white" :
                    item.badgeColor === "violet" ? "bg-violet-500 text-white" :
                    "bg-blue-500 text-white"
                  }`}>{badge}</span>
                )}
                {active && !collapsed && <Icons.ChevronRight size={14} className="opacity-80" />}
              </NavLink>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-2.5 py-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={logout}
            title={collapsed ? "Logout" : ""}
            className={`w-full flex items-center ${collapsed ? "lg:justify-center" : "gap-3"} px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition`}
          >
            <Icons.LogOut size={18} />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

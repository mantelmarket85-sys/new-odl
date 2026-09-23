import { motion } from "framer-motion";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, FileText, FileQuestion, Award, CalendarCheck, GraduationCap,
  Megaphone, Radio, Clock, User, Wallet, Bell, CheckCircle2,
  TrendingUp, Layers, Activity as ActivityIcon, FlaskConical,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api, { fileUrl } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

/* Quick-access tiles (req #3). All navigate to real, existing student pages. */
const QUICK_LINKS = [
  { label: "My Courses", icon: BookOpen, to: "/student/courses", color: "from-blue-500 to-indigo-600" },
  { label: "Assignments", icon: FileText, to: "/student/assignments", color: "from-amber-500 to-orange-600" },
  { label: "Quizzes", icon: FileQuestion, to: "/student/quizzes", color: "from-purple-500 to-violet-600" },
  { label: "Attendance", icon: CalendarCheck, to: "/student/attendance", color: "from-emerald-500 to-teal-600" },
  { label: "Results", icon: Award, to: "/student/results", color: "from-rose-500 to-pink-600" },
  { label: "Fee Status", icon: Wallet, to: "/student/account", color: "from-teal-500 to-cyan-600" },
  { label: "Announcements", icon: Megaphone, to: "/student/announcements", color: "from-fuchsia-500 to-pink-600" },
  // Req 3.2 — Lab Tasks quick link (replaces the removed manual "Register" tile;
  // Req 3.5 auto-enrolls students, so manual registration is no longer offered).
  { label: "Lab Tasks", icon: FlaskConical, to: "/student/lab-tasks", color: "from-indigo-500 to-cyan-600" },
];

// Quick-access buttons surfaced on every course card. Each opens the chosen
// module SCOPED to that specific course (Requirement #1 — direct access, no
// multi-page navigation). Course filter is keyed off the real course code.
const COURSE_MODULES = [
  { key: "assignments", label: "Assignments", icon: FileText, to: (c) => `/student/assignments?course=${encodeURIComponent(c.courseCode)}` },
  { key: "quizzes", label: "Quizzes", icon: FileQuestion, to: (c) => `/student/quizzes?course=${encodeURIComponent(c.courseCode)}` },
  { key: "attendance", label: "Attendance", icon: CalendarCheck, to: (c) => `/student/attendance?course=${encodeURIComponent(c.courseCode)}` },
  { key: "announcements", label: "Announce", icon: Megaphone, to: (c) => `/student/announcements?course=${encodeURIComponent(c.courseCode)}` },
];

// Deterministic gradient per course so each card has its own colour (visual
// only — derived from the real course code, no hardcoded course list).
const CARD_GRADIENTS = [
  "from-blue-600 to-indigo-600",
  "from-violet-600 to-purple-600",
  "from-emerald-600 to-teal-600",
  "from-rose-600 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-cyan-600 to-sky-600",
];
const gradientFor = (code = "") => {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return CARD_GRADIENTS[h % CARD_GRADIENTS.length];
};
const initials = (s = "") =>
  s.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
const fmtTime = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};
const timeAgo = (d) => {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const progressColor = (p) => {
  if (p >= 75) return "from-emerald-500 to-teal-500";
  if (p >= 40) return "from-blue-500 to-indigo-500";
  return "from-amber-500 to-orange-500";
};

/* Faculty / course card — mirrors the reference layout, real data only. */
const CourseCard = ({ c, index, navigate }) => {
  const progress = Math.max(0, Math.min(100, c.progress ?? 0));
  const live = c.liveNow;
  const lc = c.liveClass;
  const grad = gradientFor(c.courseCode);
  const go = (e, path) => { e.stopPropagation(); navigate(path); };

  let nextLabel = null;
  if (live) nextLabel = "Live Now";
  else if (lc) nextLabel = `${fmtDate(lc.scheduledAt)}, ${fmtTime(lc.scheduledAt)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      /* h-full so every card fills its grid row to an equal height (grid rows
         stretch by default) — this keeps the whole row of cards aligned. */
      className="flex flex-col h-full rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden hover:shadow-lg transition"
    >
      {/* Gradient banner with course code + credit hours + LIVE badge */}
      <div className={`relative bg-gradient-to-r ${grad} px-4 pt-3 pb-7`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-bold text-white/95 bg-white/20 px-2 py-0.5 rounded-md truncate max-w-[60%]">{c.courseCode}</span>
          {live ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-white bg-rose-600 px-2 py-1 rounded-full animate-pulse shrink-0">
              <Radio size={11} /> Live Now
            </span>
          ) : c.creditHours != null ? (
            <span className="text-[10px] font-bold text-white/95 bg-white/20 px-2 py-0.5 rounded-md shrink-0">{c.creditHours} CH</span>
          ) : null}
        </div>
      </div>

      {/* Teacher avatar overlapping the banner — shows the instructor's real
          uploaded photo when available (updates in real time when the teacher
          changes their profile photo), otherwise falls back to initials. */}
      <div className="px-4 -mt-5">
        <div className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-900 ring-2 ring-white dark:ring-slate-900 shadow flex items-center justify-center overflow-hidden">
          {c.teacherPhotoUrl ? (
            <img src={fileUrl(c.teacherPhotoUrl)} alt={c.teacher} className="w-9 h-9 rounded-xl object-cover" />
          ) : (
            <span className="w-9 h-9 rounded-xl bg-slate-800 text-white text-xs font-bold inline-flex items-center justify-center">
              {initials(c.teacher)}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pt-2 pb-3 flex flex-col flex-1 min-w-0">
        <p className="font-bold text-app leading-tight truncate">{c.teacher}</p>
        <p className="text-[11px] text-muted-app leading-tight truncate">
          {c.teacherDesignation || "Course Instructor"}
        </p>
        <button
          onClick={(e) => go(e, `/student/courses/${c.offeringId}`)}
          className="text-left mt-1.5 min-w-0"
        >
          <h4 className="font-display font-bold text-primary-600 dark:text-primary-400 hover:underline leading-tight line-clamp-2 min-h-[2.5em]">{c.courseTitle}</h4>
        </button>

        {/* Academic meta chips: Credit Hours · Semester · Section */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {c.creditHours != null && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300">
              <Layers size={10} /> {c.creditHours} Credit Hrs
            </span>
          )}
          {c.semester && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300">
              <GraduationCap size={10} /> {c.semester}
            </span>
          )}
          {c.section && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <User size={10} /> Sec {c.section}
            </span>
          )}
        </div>

        {/* Progress bar + completed / remaining lectures */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
            <span className="text-muted-app">Course Progress</span>
            <span className="text-app">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, delay: index * 0.04 + 0.1 }}
              className={`h-full rounded-full bg-gradient-to-r ${progressColor(progress)}`}
            />
          </div>
          {(c.totalLectures ?? 0) > 0 ? (
            <div className="flex items-center justify-between text-[10px] text-muted-app mt-1.5">
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 size={11} /> {c.completedLectures ?? 0} completed
              </span>
              <span className="inline-flex items-center gap-1 font-semibold">
                <Clock size={11} /> {c.remainingLectures ?? 0} remaining
              </span>
            </div>
          ) : (
            <p className="text-[10px] text-muted-app mt-1.5">{progress >= 100 ? "Course completed" : "Not started yet"}</p>
          )}
        </div>

        {/* Next live class line */}
        <div className="mt-2 text-xs text-muted-app">
          <span className="font-semibold text-app">Next: </span>
          {nextLabel ? (
            <span className={live ? "text-rose-600 font-bold" : ""}>{nextLabel}</span>
          ) : (
            <span>No upcoming class</span>
          )}
        </div>

        {live && (
          <button
            onClick={(e) => go(e, `/student/live-classes?join=${lc.id}`)}
            className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition"
          >
            <Radio size={15} /> Join Live Class
          </button>
        )}
      </div>

      {/* Quick-access buttons (Assignment · Quiz · Attendance · Announcements) */}
      <div className="mt-auto border-t border-slate-100 dark:border-slate-800 grid grid-cols-2">
        {COURSE_MODULES.map((m, mi) => (
          <button
            key={m.key}
            onClick={(e) => go(e, m.to(c))}
            title={`Open ${m.label} for ${c.courseCode}`}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold text-secondary-app hover:text-primary-600 hover:bg-primary-50/60 dark:hover:bg-primary-500/10 transition
              ${mi % 2 !== 1 ? "border-r border-slate-100 dark:border-slate-800" : ""}
              ${mi < 2 ? "border-b border-slate-100 dark:border-slate-800" : ""}`}
          >
            <m.icon size={14} />
            <span className="leading-none">{m.label}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
};

/* Req 3.1 — a SEPARATE, distinct lab card rendered for every enrolled course
   that has a lab component (course.hasLab === true). Visually differentiated
   from the regular course card (indigo→cyan gradient + FlaskConical) and links
   straight into the student Lab Tasks module. */
const LabCard = ({ c, index, navigate }) => {
  const go = (e, path) => { e.stopPropagation(); navigate(path); };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="flex flex-col h-full rounded-2xl border border-indigo-200 dark:border-indigo-900/40 ring-1 ring-indigo-100 dark:ring-indigo-900/30 bg-white dark:bg-slate-900 overflow-hidden hover:shadow-lg transition"
    >
      <div className="relative bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 pt-3 pb-7">
        <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
        <div className="relative flex items-center justify-between">
          <span className="font-mono text-[11px] font-bold text-white/95 bg-white/20 px-2 py-0.5 rounded-md">{c.courseCode} · LAB</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-white bg-white/20 px-2 py-1 rounded-full">
            <FlaskConical size={11} /> Lab
          </span>
        </div>
      </div>
      <div className="px-4 -mt-5">
        <div className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-900 ring-2 ring-white dark:ring-slate-900 shadow flex items-center justify-center">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-600 text-white inline-flex items-center justify-center">
            <FlaskConical size={18} />
          </span>
        </div>
      </div>
      <div className="px-4 pt-2 pb-3 flex flex-col flex-1 min-w-0">
        <h4 className="font-display font-bold text-app leading-tight line-clamp-2 min-h-[2.5em]">{c.courseTitle} — Lab</h4>
        <p className="text-[11px] text-muted-app leading-tight mt-0.5 truncate">Lab component of {c.courseCode}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
            <Layers size={10} /> {c.labCredit != null ? c.labCredit : 1} Lab Credit
          </span>
          {c.semester && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
              <GraduationCap size={10} /> {c.semester}
            </span>
          )}
          {c.section && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              <User size={10} /> Sec {c.section}
            </span>
          )}
        </div>
        <button
          onClick={(e) => go(e, "/student/lab-tasks")}
          className="mt-auto pt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:opacity-90 text-white text-sm font-bold transition"
        >
          <FlaskConical size={15} /> Open Lab Tasks
        </button>
      </div>
    </motion.div>
  );
};

/* Compact academic-summary stat card (reference top row). */
const SummaryCard = ({ icon: Icon, label, value, sub, color, onClick, delay }) => (
  <motion.button
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    onClick={onClick}
    className="text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 hover:shadow-md hover:border-primary-300 transition"
  >
    <div className="flex items-start justify-between">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-app">{label}</p>
      <span className={`p-1.5 rounded-lg bg-gradient-to-br ${color} text-white`}><Icon size={14} /></span>
    </div>
    <p className="font-display text-2xl font-extrabold text-app mt-1 leading-none">{value}</p>
    {sub && <p className="text-[11px] text-muted-app mt-1">{sub}</p>}
  </motion.button>
);

const ACTIVITY_ICONS = { REGISTRATION: BookOpen, ASSIGNMENT: FileText, QUIZ: FileQuestion, RESULT: Award, ANNOUNCEMENT: Megaphone, ATTENDANCE: CalendarCheck };

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => api.student.dashboard(), []);
  const { data: feeData } = useApi(() => api.student.fees(), []);
  const { data: actData } = useApi(() => api.student.activity(), []);

  const stats = data?.stats || {};
  const courses = useMemo(() => data?.courses || [], [data]);

  // Req 3.1 — render list: each course card, plus a SEPARATE distinct lab card
  // for every enrolled course that carries a lab component (hasLab === true).
  const courseCards = useMemo(() => {
    const list = [];
    for (const c of courses) {
      list.push({ ...c, kind: "course", key: `course-${c.registrationId}` });
      if (c.hasLab) list.push({ ...c, kind: "lab", key: `lab-${c.registrationId}` });
    }
    return list;
  }, [courses]);

  // Real fee status derived from the admission/LMS fee challans.
  const fee = useMemo(() => {
    const challans = feeData?.challans || [];
    if (!challans.length) return null;
    const unpaid = challans.filter((c) => (c.status || "").toUpperCase() !== "PAID");
    const totalDue = unpaid.reduce((s, c) => s + (c.totalAmount || 0), 0);
    return { allPaid: unpaid.length === 0, unpaidCount: unpaid.length, totalDue, count: challans.length };
  }, [feeData]);

  const activity = useMemo(() => (actData?.timeline || []).slice(0, 6), [actData]);

  // Real CGPA → percentage for the gauge ring (out of 4.0).
  const cgpa = Number(stats.cgpa ?? 0);
  const cgpaPct = Math.max(0, Math.min(100, (cgpa / 4) * 100));

  const fullName = user?.name || user?.username || "Student";
  const firstName = fullName.split(/\s+/)[0];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your academic activity at a glance"
        icon="LayoutDashboard"
        breadcrumb={["Dashboard"]}
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-3xl" />
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : (
        <>
          {/* ============ WELCOME HERO ============ */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-blue-700 to-indigo-800 text-white p-6 lg:p-7 mb-5">
            <div className="absolute -right-10 -top-10 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute right-24 bottom-0 w-40 h-40 bg-indigo-400/20 rounded-full blur-2xl" />
            <div className="relative flex flex-col lg:flex-row lg:items-center gap-6 justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {user?.session && <span className="text-[11px] font-bold bg-white/15 px-2.5 py-1 rounded-full">{user.session}</span>}
                  <span className="text-[11px] font-bold bg-white/15 px-2.5 py-1 rounded-full">Student</span>
                  {user?.verificationStatus && (
                    <span className="text-[11px] font-bold bg-emerald-500/30 px-2.5 py-1 rounded-full">{user.verificationStatus}</span>
                  )}
                </div>
                <h2 className="font-display text-3xl lg:text-4xl font-extrabold leading-tight">
                  Welcome back, {firstName}! <span className="inline-block">👋</span>
                </h2>
                <p className="text-sm text-white/85 mt-2">
                  {user?.program || "—"}
                  {(user?.rollNumber || user?.studentId) ? ` · ${user.rollNumber || user.studentId}` : ""}
                  {stats.currentSemester ? ` · ${stats.currentSemester}` : ""}
                </p>
                <div className="flex flex-wrap gap-2.5 mt-4">
                  <button onClick={() => navigate("/student/live-classes")} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold transition">
                    <Radio size={15} /> Join Live Class
                  </button>
                  <button onClick={() => navigate("/student/library")} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-bold transition backdrop-blur">
                    <BookOpen size={15} /> Course Library
                  </button>
                  <button onClick={() => navigate("/student/ai-insights")} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-bold transition backdrop-blur">
                    <TrendingUp size={15} /> AI Insights
                  </button>
                </div>
              </div>

              {/* CGPA gauge + quick academic facts (real) */}
              <div className="flex items-center gap-5 shrink-0">
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 120 120" className="w-28 h-28 -rotate-90">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="12" />
                    <circle
                      cx="60" cy="60" r="52" fill="none" stroke="white" strokeWidth="12" strokeLinecap="round"
                      strokeDasharray={`${(cgpaPct / 100) * 326.7} 326.7`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-white/80">CGPA</span>
                    <span className="font-display text-2xl font-extrabold">{cgpa.toFixed(2)}</span>
                    <span className="text-[10px] text-white/70">/ 4.0</span>
                  </div>
                </div>
                <div className="hidden sm:block text-sm space-y-1">
                  <p><span className="text-white/70">Semester:</span> <span className="font-bold">{stats.currentSemester || "—"}</span></p>
                  <p><span className="text-white/70">Credits:</span> <span className="font-bold">{stats.creditsEarned ?? 0}</span></p>
                  <p><span className="text-white/70">Enrolled:</span> <span className="font-bold">{stats.enrolledCourses ?? 0}</span></p>
                  <p><span className="text-white/70">Attendance:</span> <span className="font-bold">{stats.overallAttendance ?? 0}%</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* ============ ACADEMIC SUMMARY CARDS (6) ============ */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            <SummaryCard icon={Award} label="Current CGPA" value={cgpa.toFixed(2)} sub={`${stats.publishedResults ?? 0} result(s)`} color="from-rose-500 to-pink-600" onClick={() => navigate("/student/results")} delay={0} />
            <SummaryCard icon={CalendarCheck} label="Attendance" value={`${stats.overallAttendance ?? 0}%`} sub={stats.currentSemester || ""} color="from-emerald-500 to-teal-600" onClick={() => navigate("/student/attendance")} delay={0.04} />
            <SummaryCard icon={BookOpen} label="Enrolled" value={stats.enrolledCourses ?? 0} sub="courses" color="from-blue-500 to-indigo-600" onClick={() => navigate("/student/courses")} delay={0.08} />
            <SummaryCard icon={CheckCircle2} label="Completed" value={stats.completedCourses ?? 0} sub="courses" color="from-violet-500 to-purple-600" onClick={() => navigate("/student/courses")} delay={0.12} />
            <SummaryCard icon={FileText} label="Assignments" value={stats.pendingAssignments ?? 0} sub="pending" color="from-amber-500 to-orange-600" onClick={() => navigate("/student/assignments")} delay={0.16} />
            <SummaryCard icon={Wallet} label="Fee Status" value={fee ? (fee.allPaid ? "Paid" : `Rs ${fee.totalDue.toLocaleString()}`) : "—"} sub={fee ? (fee.allPaid ? "all clear" : `${fee.unpaidCount} due`) : "no record"} color="from-teal-500 to-cyan-600" onClick={() => navigate("/student/account")} delay={0.2} />
          </div>

          {/* ============ QUICK ACCESS ============ */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 mb-5">
            <h3 className="font-display font-bold text-lg text-app mb-4">Quick Access</h3>
            <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {QUICK_LINKS.map((q, i) => (
                <motion.button
                  key={q.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => navigate(q.to)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-primary-300 hover:shadow-md transition group"
                >
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${q.color} text-white group-hover:scale-110 transition`}>
                    <q.icon size={18} />
                  </div>
                  <span className="text-[11px] font-semibold text-app text-center leading-tight">{q.label}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* ============ COURSES & FACULTY + RECENT ACTIVITY ============ */}
          <div className="grid xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display font-bold text-lg text-app">Your Courses &amp; Faculty</h3>
                  <p className="text-xs text-muted-app">Connect with your teachers and access course materials</p>
                </div>
                <button onClick={() => navigate("/student/courses")} className="text-primary-600 text-sm font-semibold hover:underline shrink-0">View All →</button>
              </div>
              {courses.length === 0 ? (
                <EmptyState icon="BookOpen" title="No courses yet" description="You will be enrolled automatically based on your program scheme." className="py-10" />
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {courseCards.map((item, i) => (
                    item.kind === "lab" ? (
                      <LabCard key={item.key} c={item} index={i} navigate={navigate} />
                    ) : (
                      <CourseCard key={item.key} c={item} index={i} navigate={navigate} />
                    )
                  ))}
                </div>
              )}
            </div>

            {/* Recent Activity (real timeline) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 h-fit">
              <h3 className="font-display font-bold text-lg text-app mb-4 flex items-center gap-2">
                <ActivityIcon size={18} className="text-primary-600" /> Recent Activity
              </h3>
              {activity.length === 0 ? (
                <div className="py-8 text-center">
                  <Layers size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-muted-app">No recent activity</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activity.map((a, i) => {
                    const Icon = ACTIVITY_ICONS[a.type] || Bell;
                    return (
                      <div key={i} className="flex gap-3">
                        <span className="w-8 h-8 rounded-xl bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
                          <Icon size={15} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-app leading-tight">{a.title}</p>
                          <p className="text-[11px] text-muted-app mt-0.5">{timeAgo(a.at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;

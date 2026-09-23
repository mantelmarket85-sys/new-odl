import { Link } from "react-router-dom";
import {
  ClipboardCheck, TrendingUp, RotateCcw, UserX, Building2,
  Send, ScrollText, FileText, Award, CalendarCheck, AlertTriangle,
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import RoleBanner from "../../components/enterprise/RoleBanner";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

const DIST_COLORS = ["#10b981", "#3b82f6", "#6366f1", "#f59e0b", "#ec4899", "#ef4444"];

const FocalDashboard = () => {
  const { data, loading, error, reload } = useApi(() => api.focal.dashboard(), []);
  const { data: analytics } = useApi(() => api.focal.analytics(), []);

  const dept = data?.departmentKpis || {};
  const faculty = data?.facultyKpis || {};
  const studentKpis = data?.studentKpis || {};
  const courseProgress = data?.courseProgress || [];
  const alerts = data?.alerts || [];
  const recentEscalations = data?.recentEscalations || [];
  const recentApprovals = data?.recentApprovals || [];

  // Enrollment-by-course series from live course progress
  const enrollSeries = courseProgress.map((c) => ({
    course: (c.course || "").split("—")[0].trim(),
    count: c.students || 0,
  }));

  // Grade distribution buckets from analytics
  const distribution = analytics?.studentDistribution
    ? Object.entries(analytics.studentDistribution).map(([name, value], i) => ({
        name,
        value,
        color: DIST_COLORS[i % DIST_COLORS.length],
      }))
    : [];
  const distributionTotal = distribution.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      <RoleBanner
        icon="Building2"
        eyebrow={<><Building2 size={12} /> Focal Person · {data?.term?.title || "Department"}</>}
        title="Department Command Center"
        subtitle="Manage enrollments, monitor academics, drop students, and broadcast reminders — all in one place."
        actions={
          <>
            <Link to="/focal/enrollments" className="px-4 py-2 bg-white text-slate-900 text-sm font-bold rounded-xl">
              Manage Enrollments
            </Link>
            <Link to="/focal/quick-messages" className="px-4 py-2 bg-white/15 text-white text-sm font-bold rounded-xl border border-white/30">
              Quick Reminder
            </Link>
          </>
        }
      />

      {error ? (
        <ErrorState title="Couldn't load dashboard" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Total Students"     value={(studentKpis.totalStudents ?? 0).toLocaleString()} icon="Users"         color="blue"   trend={`${studentKpis.activeStudents ?? 0} active`} />
            <StatCard title="Faculty"            value={faculty.totalTeachers ?? 0}      icon="UserCog"       color="emerald" delay={0.05} />
            <StatCard title="Courses"            value={dept.totalCourses ?? 0}          icon="BookOpen"      color="purple"  delay={0.1} />
            <StatCard title="Offerings"          value={dept.totalOfferings ?? 0}        icon="GraduationCap" color="cyan"    delay={0.15} />
            <StatCard title="Registrations"      value={(studentKpis.totalRegistrations ?? 0).toLocaleString()} icon="ClipboardCheck" color="indigo" delay={0.2} />
            <StatCard title="Pending Approvals"  value={data?.pendingApprovals ?? 0}     icon="FileCheck"     color="amber"   delay={0.25} />
            <StatCard title="Open Escalations"   value={data?.openEscalations ?? 0}      icon="AlertTriangle" color="rose"    delay={0.3} />
            <StatCard title="Avg Attendance"     value={`${dept.avgAttendance ?? 0}%`}   icon="CalendarCheck" color="emerald" delay={0.35} />
          </div>

          {alerts.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4">
              <h3 className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300 mb-2">
                <AlertTriangle size={16} /> Department Alerts ({alerts.length})
              </h3>
              <div className="space-y-1.5">
                {alerts.map((a, i) => (
                  <div key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {a.message || a.title || JSON.stringify(a)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charts */}
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 card-base p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-display font-bold text-lg text-app">Enrollment by Course</h3>
                  <p className="text-xs text-muted-app">Registered students per offering · {data?.term?.title}</p>
                </div>
                <TrendingUp className="text-emerald-500" />
              </div>
              {enrollSeries.length === 0 ? (
                <EmptyState icon="BookOpen" title="No offerings yet" description="Create course offerings to see enrollment." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={enrollSeries}>
                    <defs>
                      <linearGradient id="focalArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-30" />
                    <XAxis dataKey="course" tick={{ fontSize: 11, fill: "currentColor" }} className="text-slate-500 dark:text-slate-400" />
                    <YAxis tick={{ fontSize: 11, fill: "currentColor" }} allowDecimals={false} className="text-slate-500 dark:text-slate-400" />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "none", borderRadius: 12, color: "white" }} />
                    <Area type="monotone" dataKey="count" stroke="#06b6d4" strokeWidth={2.5} fill="url(#focalArea)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card-base p-5">
              <h3 className="font-display font-bold text-lg text-app mb-3">Grade Distribution</h3>
              {distributionTotal === 0 ? (
                <EmptyState icon="PieChart" title="No results yet" description="Published results will populate this chart." />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={distribution} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={2}>
                      {distribution.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Quick Access Tiles */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { to: "/focal/enrollments",     icon: ClipboardCheck, label: "Enrollments",       color: "from-blue-500 to-indigo-600" },
              { to: "/focal/promotions",      icon: TrendingUp,     label: "Promotions",        color: "from-emerald-500 to-teal-600" },
              { to: "/focal/retakes",         icon: RotateCcw,      label: "Retake & Improve",  color: "from-rose-500 to-red-600" },
              { to: "/focal/student-drop",    icon: UserX,          label: "Student Block",     color: "from-slate-600 to-slate-800" },
              { to: "/focal/attendance",      icon: CalendarCheck,  label: "Attendance",        color: "from-cyan-500 to-sky-600" },
              { to: "/focal/results",         icon: Award,          label: "Results",           color: "from-amber-500 to-orange-600" },
              { to: "/focal/surveys",         icon: FileText,       label: "Surveys",           color: "from-violet-500 to-purple-600" },
              { to: "/focal/quick-messages",  icon: Send,           label: "Quick Reminders",   color: "from-pink-500 to-fuchsia-600" },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <Link key={t.to} to={t.to} className={`group p-4 rounded-2xl bg-gradient-to-br ${t.color} text-white shadow-lg hover:scale-[1.02] transition`}>
                  <Icon size={22} className="mb-2 opacity-90" />
                  <p className="font-bold text-sm">{t.label}</p>
                  <p className="text-[10px] opacity-80 mt-1">Open module →</p>
                </Link>
              );
            })}
          </div>

          {/* Pending Approvals + Recent Escalations */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card-base overflow-hidden">
              <div className="px-5 py-4 border-b border-app flex items-center justify-between">
                <h3 className="font-display font-bold text-lg text-app">Pending Approvals</h3>
                <Link to="/focal/overview" className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline">View all →</Link>
              </div>
              {recentApprovals.length === 0 ? (
                <div className="p-5"><EmptyState icon="FileCheck" title="No pending approvals" description="Approval requests assigned to you appear here." /></div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentApprovals.slice(0, 6).map((a) => (
                    <div key={a.id} className="p-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <span className="text-[9px] font-bold uppercase px-2 py-1 rounded-full bg-primary-100 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300">{a.type}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-app font-medium truncate">{a.title}</p>
                        <p className="text-[10px] text-muted-app mt-0.5">by {a.requestedByName || a.requestedRole} · {a.priority}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${a.status === "PENDING" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-emerald-100 text-emerald-700"}`}>{a.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card-base overflow-hidden">
              <div className="px-5 py-4 border-b border-app flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ScrollText size={18} className="text-primary-600 dark:text-primary-400" />
                  <h3 className="font-display font-bold text-lg text-app">Recent Escalations</h3>
                </div>
              </div>
              {recentEscalations.length === 0 ? (
                <div className="p-5"><EmptyState icon="AlertTriangle" title="No escalations" description="Open escalations appear here." /></div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentEscalations.slice(0, 6).map((e) => (
                    <div key={e.id} className="p-3 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full ${e.severity === "CRITICAL" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>{e.severity}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-app font-medium truncate">{e.subject}</p>
                        <p className="text-[10px] text-muted-app mt-0.5">{e.category} · by {e.raisedByName || e.raisedRole}</p>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{e.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FocalDashboard;

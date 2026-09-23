import { motion } from "framer-motion";
import { TrendingUp, ClipboardCheck, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import StatCard from "../../components/common/StatCard";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Edu3DScene } from "../../components/common/Edu3D";
import useApi from "../../hooks/useApi";
import api, { fileUrl } from "../../services/api";
import { Skeleton, SkeletonRow } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

const DIST_COLORS = ["#10b981", "#2563eb", "#6366f1", "#f59e0b", "#ec4899", "#ef4444"];

const AdminDashboard = () => {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => api.coordinator.dashboard(), []);
  const { data: teacherData } = useApi(() => api.coordinator.teachers(), []);
  const { data: analytics } = useApi(() => api.coordinator.analytics(), []);

  const stats = data?.stats || {};
  const courseProgress = data?.courseProgress || [];
  const alerts = data?.alerts || [];
  const teachers = teacherData?.teachers || [];
  const recentActivities = data?.recentActivities || [];
  const latestAnnouncements = data?.latestAnnouncements || [];

  const timeAgo = (iso) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  // Build enrollment-by-course series from live course progress (real registrations per course)
  const enrollmentSeries = courseProgress.map((c) => ({
    course: (c.course || "").split("—")[0].trim(),
    count: c.students || 0,
  }));

  // Student grade distribution from analytics (real grade buckets)
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
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-1/3 w-56 h-56 bg-primary-500/30 rounded-full blur-3xl" />
        <Edu3DScene variant="coordinator" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur rounded-full text-xs font-semibold mb-3 border border-white/20">
              <ClipboardCheck size={12} /> Course Coordinator · {data?.term?.title || "ADCS"}
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold mb-2">
              Welcome, {user?.name || "Coordinator"} 🛡️
            </h1>
            <p className="text-white/85 text-sm">
              Manage the academic program — instructors, students, courses, sections and monitoring — from one dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 relative z-10">
            <Link to="/admin/degrees" className="px-4 py-2 bg-white text-slate-900 text-sm font-bold rounded-xl">Programs</Link>
            <Link to="/admin/teachers" className="px-4 py-2 bg-white/15 text-white text-sm font-bold rounded-xl border border-white/30">Faculty</Link>
          </div>
        </div>
      </motion.div>

      {error ? (
        <ErrorState title="Couldn't load dashboard" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Total Programs" value={stats.totalPrograms ?? 0} icon="GraduationCap" color="indigo" delay={0} />
            <StatCard title="Total Courses" value={stats.totalCourses ?? 0} icon="BookOpen" color="purple" delay={0.03} />
            <StatCard title="Total Sections" value={stats.totalSections ?? 0} icon="Layers" color="cyan" delay={0.06} />
            <StatCard title="Total Students" value={(stats.totalStudents ?? 0).toLocaleString()} icon="Users" color="blue" delay={0.09} />
            <StatCard title="Active Students" value={(stats.activeStudents ?? 0).toLocaleString()} icon="UserCheck" color="emerald" delay={0.12} />
            <StatCard title="Suspended Students" value={stats.suspendedStudents ?? 0} icon="UserX" color="rose" delay={0.15} />
            <StatCard title="Total Teachers" value={stats.totalTeachers ?? 0} icon="UserCog" color="emerald" delay={0.18} />
            <StatCard title="Course Instructors" value={stats.totalCourseInstructors ?? 0} icon="Briefcase" color="amber" delay={0.21} />
            <StatCard title="Total Enrollments" value={(stats.totalEnrollments ?? 0).toLocaleString()} icon="ClipboardCheck" color="blue" delay={0.24} />
            <StatCard title="Total Appeals" value={stats.totalAppeals ?? 0} icon="FileText" color="amber" delay={0.27} />
            <StatCard title="Total Announcements" value={stats.totalAnnouncements ?? 0} icon="Megaphone" color="purple" delay={0.3} />
            <StatCard title="Weekly Schedules" value={stats.totalSchedules ?? 0} icon="Calendar" color="cyan" delay={0.33} />
            <StatCard title="Pending Approvals" value={stats.pendingApprovals ?? 0} icon="FileCheck" color="rose" delay={0.36} />
            <StatCard title="Open Escalations" value={stats.openEscalations ?? 0} icon="AlertTriangle" color="rose" delay={0.39} />
            <StatCard title="Offerings" value={stats.totalOfferings ?? 0} icon="GraduationCap" color="indigo" delay={0.42} />
            <StatCard title="Avg Class Size" value={stats.avgClassSize ?? 0} icon="UserCheck" color="emerald" delay={0.45} />
          </div>

          {alerts.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4">
              <h3 className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300 mb-2">
                <AlertTriangle size={16} /> Academic Alerts ({alerts.length})
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

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Enrollment by Course</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Registered students per offering · {data?.term?.title}</p>
                </div>
                <TrendingUp className="text-emerald-500" />
              </div>
              {enrollmentSeries.length === 0 ? (
                <EmptyState icon="BookOpen" title="No offerings yet" description="Create course offerings to see enrollment." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={enrollmentSeries}>
                    <defs>
                      <linearGradient id="enrollGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="course" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2.5} fill="url(#enrollGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 mb-3">Grade Distribution</h3>
              {distributionTotal === 0 ? (
                <EmptyState icon="PieChart" title="No results yet" description="Published results will populate the grade distribution." />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={distribution} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={4}>
                        {distribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1 mt-2">
                    {distribution.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded" style={{ background: d.color }} /> {d.name}</span>
                        <span className="font-bold">{d.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Course Progress</h3>
                <Link to="/admin/class-monitoring" className="text-xs font-semibold text-primary-600">Monitor</Link>
              </div>
              {courseProgress.length === 0 ? (
                <div className="p-5"><EmptyState icon="BookOpen" title="No courses" description="No active offerings this term." /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                      <th className="px-4 py-3">Course</th>
                      <th className="px-4 py-3 text-center">Students</th>
                      <th className="px-4 py-3 text-center">Attend.</th>
                      <th className="px-4 py-3 text-center">Pass %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseProgress.map((c) => (
                      <tr key={c.offeringId} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                        <td className="px-4 py-3 font-semibold text-xs">{c.course}</td>
                        <td className="px-4 py-3 text-center">{c.students}</td>
                        <td className="px-4 py-3 text-center">{c.attendancePct}%</td>
                        <td className="px-4 py-3 text-center font-bold">{c.passRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Faculty</h3>
                <Link to="/admin/teachers" className="text-xs font-semibold text-primary-600">View all</Link>
              </div>
              {teachers.length === 0 ? (
                <div className="p-5">{teacherData ? <EmptyState icon="UserCog" title="No faculty" /> : <SkeletonRow cols={3} />}</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {teachers.slice(0, 5).map((t) => (
                    <div key={t.id} className="p-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <img src={t.photoUrl ? fileUrl(t.photoUrl) : `https://ui-avatars.com/api/?name=${encodeURIComponent(t.name)}&background=2563eb&color=fff`} onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(t.name)}&background=2563eb&color=fff`; }} className="w-10 h-10 rounded-full object-cover" alt={t.name} />
                      <div className="flex-1">
                        <p className="font-bold text-sm">{t.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t.offerings} offering{t.offerings === 1 ? "" : "s"}{t.isActive ? "" : " · inactive"}</p>
                      </div>
                      <div className="text-right text-xs">
                        <p className="font-bold">{t.students}</p>
                        <p className="text-slate-500 dark:text-slate-400">students</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Activities + Latest Announcements (real-time) */}
          <div className="grid lg:grid-cols-2 gap-4">
            <section id="recent-activities" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Recent Activities</h3>
                <Link to="/admin/reports" className="text-xs font-semibold text-primary-600">Reports</Link>
              </div>
              {recentActivities.length === 0 ? (
                <div className="p-5"><EmptyState icon="Activity" title="No recent activity" description="System activity will appear here." /></div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentActivities.map((a) => (
                    <li key={a.id} className="px-5 py-3 flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 capitalize truncate">{a.text}</p>
                        {a.actorRole && <p className="text-xs text-slate-500 dark:text-slate-400">{a.actorRole}</p>}
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">{timeAgo(a.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section id="latest-announcements" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Latest Announcements</h3>
                <Link to="/admin/announcements" className="text-xs font-semibold text-primary-600">Manage</Link>
              </div>
              {latestAnnouncements.length === 0 ? (
                <div className="p-5"><EmptyState icon="Megaphone" title="No announcements" description="Published announcements will appear here." /></div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {latestAnnouncements.map((n) => (
                    <li key={n.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{n.title}</p>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">{n.audience}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{n.author} · {timeAgo(n.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;

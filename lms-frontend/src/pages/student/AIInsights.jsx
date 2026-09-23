import { motion } from "framer-motion";
import { useMemo } from "react";
import { Sparkles, TrendingUp, AlertTriangle, Target, BookOpen } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from "recharts";

const priorityChip = (p) => {
  const v = (p || "").toUpperCase();
  if (v === "HIGH") return "bg-rose-100 text-rose-700";
  if (v === "MEDIUM") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
};

const AIInsights = () => {
  const { data, loading, error, reload } = useApi(() => api.student.insights(), []);

  const courseStats = useMemo(() => data?.courseStats || [], [data]);
  const gpaTrend = useMemo(() => data?.gpaTrend || [], [data]);
  const recommendations = useMemo(() => data?.recommendations || [], [data]);

  if (loading) {
    return (
      <div>
        <PageHeader title="AI Insights" subtitle="Personalized analytics on your academic performance" icon="Sparkles" breadcrumb={["Dashboard", "AI Insights"]} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const hasData = courseStats.length > 0 || gpaTrend.length > 0 || recommendations.length > 0;

  return (
    <div>
      <PageHeader title="AI Insights" subtitle="Personalized analytics on your academic performance" icon="Sparkles" breadcrumb={["Dashboard", "AI Insights"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : !hasData ? (
        <EmptyState icon="Sparkles" title="Not enough data yet" description="Insights appear once you have grades, attendance, and assessment activity recorded." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Current CGPA", value: data?.cgpa != null ? Number(data.cgpa).toFixed(2) : "—", color: "from-emerald-500 to-teal-600", icon: Target },
              { label: "Total Credits", value: data?.totalCredits ?? "—", color: "from-blue-500 to-indigo-600", icon: BookOpen },
              { label: "Avg Attendance", value: data?.avgAttendance != null ? `${Math.round(data.avgAttendance)}%` : "—", color: "from-purple-500 to-violet-600", icon: TrendingUp },
              { label: "Active Courses", value: courseStats.length, color: "from-amber-500 to-orange-600", icon: Sparkles },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`relative bg-gradient-to-br ${s.color} rounded-2xl p-4 text-white overflow-hidden`}>
                <div className="absolute -right-2 -top-2 w-20 h-20 bg-white/10 rounded-full blur-xl" />
                <s.icon size={20} className="mb-2" />
                <p className="font-display text-2xl font-extrabold">{s.value}</p>
                <p className="text-xs opacity-90">{s.label}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-5">
            {gpaTrend.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 mb-3">GPA Trend</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={gpaTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="term" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 4]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="gpa" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {courseStats.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 mb-3">Performance by Course</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={courseStats.map((c) => ({ code: c.courseCode, percent: c.percent, attendance: c.attendance }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="percent" fill="#10b981" radius={[6, 6, 0, 0]} name="Grade %" />
                    <Bar dataKey="attendance" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Attendance %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {recommendations.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2"><Sparkles size={18} className="text-primary-600" /> Recommendations</h3>
              <div className="space-y-2.5">
                {recommendations.map((r, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                    <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.priority && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityChip(r.priority)}`}>{r.priority}</span>}
                        {r.course && <span className="text-[10px] font-mono font-bold text-primary-600">{r.course}</span>}
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{r.message}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AIInsights;

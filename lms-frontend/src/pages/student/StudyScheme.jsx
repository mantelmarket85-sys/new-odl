import { motion } from "framer-motion";
import { useMemo } from "react";
import { GraduationCap, CheckCircle2, Circle, Clock } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { formatCredits } from "../../utils/credit";

const statusStyle = (s) => {
  const v = (s || "").toUpperCase();
  if (v === "COMPLETED" || v === "PASSED") return { icon: CheckCircle2, color: "text-emerald-600", chip: "bg-emerald-100 text-emerald-700", label: "Completed" };
  if (v === "IN_PROGRESS" || v === "ACTIVE" || v === "CURRENT") return { icon: Clock, color: "text-blue-600", chip: "bg-blue-100 text-blue-700", label: "In Progress" };
  return { icon: Circle, color: "text-slate-400", chip: "bg-slate-100 text-slate-600", label: "Upcoming" };
};

const StudyScheme = () => {
  const { data, loading, error, reload } = useApi(() => api.student.scheme(), []);

  const program = data?.program || null;
  const semesters = useMemo(() => data?.semesters || [], [data]);

  const totals = useMemo(() => {
    let credits = 0, done = 0, courses = 0, doneCourses = 0;
    semesters.forEach((s) => {
      (s.courses || []).forEach((c) => {
        courses += 1;
        credits += c.creditHours || 0;
        if (["COMPLETED", "PASSED"].includes((c.status || "").toUpperCase())) {
          doneCourses += 1;
          done += c.creditHours || 0;
        }
      });
    });
    return { credits, done, courses, doneCourses, pct: credits ? Math.round((done / credits) * 100) : 0 };
  }, [semesters]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Study Scheme" subtitle="Your complete degree roadmap" icon="GraduationCap" breadcrumb={["Dashboard", "Study Scheme"]} />
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Study Scheme" subtitle="Your complete degree roadmap" icon="GraduationCap" breadcrumb={["Dashboard", "Study Scheme"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : semesters.length === 0 ? (
        <EmptyState icon="GraduationCap" title="No study scheme available" description="Your program study scheme will appear here once configured." />
      ) : (
        <>
          <div className="bg-gradient-to-br from-primary-600 to-blue-500 rounded-2xl p-6 text-white mb-5 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <div className="flex items-center gap-3 mb-3">
              <GraduationCap size={26} />
              <div>
                <h2 className="font-display font-extrabold text-xl">{program?.name || program?.title || "Degree Program"}</h2>
                {program?.duration && <p className="text-sm opacity-90">{program.duration}</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div><p className="text-3xl font-extrabold">{totals.pct}%</p><p className="text-xs opacity-90">Completed</p></div>
              <div><p className="text-3xl font-extrabold">{totals.doneCourses}/{totals.courses}</p><p className="text-xs opacity-90">Courses</p></div>
              <div><p className="text-3xl font-extrabold">{totals.done}/{totals.credits}</p><p className="text-xs opacity-90">Credit Hours</p></div>
            </div>
          </div>

          <div className="space-y-4">
            {semesters.map((sem, i) => {
              const semCredits = (sem.courses || []).reduce((a, c) => a + (c.creditHours || 0), 0);
              return (
                <motion.div key={sem.number || i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-display font-bold text-slate-900 dark:text-slate-100">{sem.title || `Semester ${sem.number}`}</h3>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{semCredits} CH</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(sem.courses || []).map((c, j) => {
                      const st = statusStyle(c.status);
                      const StIcon = st.icon;
                      return (
                        <div key={c.code || j} className="px-5 py-3 flex items-center gap-3">
                          <StIcon size={18} className={st.color} />
                          <span className="font-mono font-bold text-sm text-primary-700 w-24">{c.code}</span>
                          <span className="flex-1 text-sm text-slate-900 dark:text-slate-100">{c.title}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{formatCredits(c)} CH{c.hasLab ? " (T+L)" : ""}</span>
                          {c.grade && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{c.grade}</span>}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.chip}`}>{st.label}</span>
                        </div>
                      );
                    })}
                    {(sem.courses || []).length === 0 && <p className="px-5 py-4 text-sm text-slate-400">No courses in this semester.</p>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default StudyScheme;

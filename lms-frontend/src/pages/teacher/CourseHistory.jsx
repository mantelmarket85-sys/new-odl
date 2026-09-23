import { motion } from "framer-motion";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { History, Users, Award, ArrowRight, BookOpen } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const CourseHistory = () => {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.teacher.history(), []);

  const courses = useMemo(() => data?.courses || [], [data]);

  const byTerm = useMemo(() => {
    const map = {};
    courses.forEach((c) => {
      const key = c.termCode || "NA";
      if (!map[key]) map[key] = { termCode: c.termCode, termTitle: c.termTitle, isActive: c.isActive, courses: [] };
      map[key].courses.push(c);
    });
    // active terms first
    return Object.values(map).sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0));
  }, [courses]);

  const totals = useMemo(() => ({
    courses: courses.length,
    students: courses.reduce((a, c) => a + (c.students || 0), 0),
    terms: byTerm.length,
  }), [courses, byTerm]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Course History" subtitle="All courses you have taught, by term" icon="History" breadcrumb={["Teacher", "History"]} />
        <div className="space-y-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Course History" subtitle="All courses you have taught, by term" icon="History" breadcrumb={["Teacher", "History"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : courses.length === 0 ? (
        <EmptyState icon="History" title="No course history" description="Courses you teach will appear here once a coordinator assigns offerings to you." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: "Total Courses", value: totals.courses, color: "from-blue-500 to-indigo-600", icon: BookOpen },
              { label: "Total Students", value: totals.students, color: "from-emerald-500 to-teal-600", icon: Users },
              { label: "Terms", value: totals.terms, color: "from-purple-500 to-violet-600", icon: History },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`relative bg-gradient-to-br ${s.color} rounded-2xl p-4 text-white overflow-hidden`}>
                <div className="absolute -right-2 -top-2 w-20 h-20 bg-white/10 rounded-full blur-xl" />
                <s.icon size={20} className="mb-2" />
                <p className="font-display text-3xl font-extrabold">{s.value}</p>
                <p className="text-xs opacity-90">{s.label}</p>
              </motion.div>
            ))}
          </div>

          <div className="space-y-5">
            {byTerm.map((term, ti) => (
              <motion.div key={term.termCode} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ti * 0.05 }} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="font-display font-bold text-slate-900 dark:text-slate-100">{term.termTitle || term.termCode}</h3>
                  {term.isActive && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Active</span>}
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                  {term.courses.map((c) => (
                    <button key={c.offeringId} onClick={() => navigate(`/teacher/offerings/${c.offeringId}`)} className="text-left rounded-xl border border-slate-100 dark:border-slate-800 p-4 hover:shadow-soft hover:-translate-y-0.5 transition group">
                      <p className="font-mono font-bold text-sm text-primary-700">{c.courseCode}</p>
                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 line-clamp-2 mt-0.5">{c.courseTitle}</p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                        <span className="flex items-center gap-1"><Users size={11} /> {c.students}</span>
                        <span className="flex items-center gap-1"><Award size={11} /> {c.resultsPublished} results</span>
                        {c.creditHours != null && <span>{c.creditLabel || c.creditHours} CH{c.hasLab ? " (T+L)" : ""}</span>}
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 mt-2 group-hover:gap-2 transition-all">Manage <ArrowRight size={13} /></span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default CourseHistory;

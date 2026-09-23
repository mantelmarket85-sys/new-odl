import { motion } from "framer-motion";
import { Megaphone, AlertTriangle, Calendar, User } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader";
import Badge from "../../components/common/Badge";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const Announcements = () => {
  const [searchParams] = useSearchParams();
  const { data, loading, error, reload } = useApi(() => api.student.announcements(), []);
  const [filter, setFilter] = useState(searchParams.get("course") || "All");

  // Deep-link from a course card: preset the course filter via ?course=<code>
  useEffect(() => {
    const c = searchParams.get("course");
    if (c) setFilter(c);
  }, [searchParams]);

  const announcements = useMemo(() => data?.announcements || [], [data]);
  const categories = useMemo(() => {
    const cats = new Set();
    announcements.forEach((a) => cats.add(a.courseCode || "General"));
    return ["All", ...cats];
  }, [announcements]);
  const filtered = filter === "All" ? announcements : announcements.filter((a) => (a.courseCode || "General") === filter);

  if (loading) {
    return (
      <div>
        <PageHeader title="Announcements" subtitle="Latest news and updates from the university" icon="Megaphone" breadcrumb={["Dashboard", "Announcements"]} />
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Announcements" subtitle="Latest news and updates from the university" icon="Megaphone" breadcrumb={["Dashboard", "Announcements"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : announcements.length === 0 ? (
        <EmptyState icon="Megaphone" title="No announcements" description="There are no announcements for your courses yet." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-5">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold ${filter === c ? "bg-primary-600 text-white" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-primary-300"}`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filtered.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`bg-white dark:bg-slate-900 rounded-2xl border-2 p-5 shadow-soft hover:shadow-lg transition ${a.important ? "border-rose-200 bg-rose-50/30" : "border-slate-100 dark:border-slate-800"}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${a.important ? "bg-rose-100 text-rose-700" : "bg-primary-100 text-primary-700"}`}>
                    {a.important ? <AlertTriangle size={22} /> : <Megaphone size={22} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">{a.title}</h3>
                      {a.important && <Badge color="rose">UNIVERSITY-WIDE</Badge>}
                      <Badge color="blue">{a.courseCode || "General"}</Badge>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-2 whitespace-pre-line">{a.message}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1"><User size={12} /> {a.author}{a.authorRole ? ` (${a.authorRole})` : ""}</span>
                      <span className="flex items-center gap-1"><Calendar size={12} /> {fmtDate(a.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Announcements;

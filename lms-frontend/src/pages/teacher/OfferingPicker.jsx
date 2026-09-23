import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, ArrowRight, Users } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import Badge from "../../components/common/Badge";
import { SkeletonCard } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-purple-500 to-violet-600",
  "from-cyan-500 to-sky-600",
];
const gradientFor = (key) => {
  let h = 0;
  for (let i = 0; i < String(key).length; i++) h = (h * 31 + String(key).charCodeAt(i)) % GRADIENTS.length;
  return GRADIENTS[h];
};

/**
 * Reusable course-picker landing page for the teacher sidebar items
 * (Assignments / Quizzes / Attendance / Marks / Students).
 *
 * It lists the teacher's REAL offerings (api.teacher.offerings) and deep-links
 * into the corresponding tab of ManageOffering. This replaces the old
 * mock-data pages with a fully API-driven flow.
 */
const OfferingPicker = ({ title, subtitle, icon = "BookOpen", tab, scope }) => {
  const navigate = useNavigate();
  const { data, loading, error } = useApi(() => api.teacher.offerings(), []);
  const offerings = data?.offerings || data || [];

  // `scope` restricts ManageOffering to only the relevant module's tab(s)
  // (Req 4-8). Defaults to the same value as `tab` when not supplied.
  const sc = scope || tab;
  const go = (id) => {
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    if (sc) params.set("scope", sc);
    const qs = params.toString();
    navigate(`/teacher/offerings/${id}${qs ? `?${qs}` : ""}`);
  };

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} icon={icon} />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <ErrorState description={error} />
      ) : offerings.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses assigned"
          description="You don't have any active course offerings yet. Once a coordinator assigns you a course, it will appear here."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offerings.map((o, i) => {
            const c = o.course || {};
            const counts = o._count || {};
            return (
              <motion.button
                key={o.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => go(o.id)}
                className="group text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-card-app overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition"
              >
                <div className={`h-20 bg-gradient-to-br ${gradientFor(c.code || o.id)} relative p-4`}>
                  <span className="text-white/90 text-xs font-bold tracking-wide">{c.code}</span>
                  <BookOpen className="absolute right-3 bottom-3 text-white/30" size={36} />
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-app line-clamp-2 mb-1">{c.title || "Course"}</h3>
                  <p className="text-xs text-muted-app mb-3">{o.term?.title || ""}</p>
                  <div className="flex items-center justify-between">
                    <Badge color="blue" size="sm" dot>
                      <Users size={12} className="mr-1 inline" />
                      {counts.registrations ?? 0} students
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 group-hover:gap-2 transition-all">
                      Open <ArrowRight size={15} />
                    </span>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OfferingPicker;

import { motion } from "framer-motion";
import { useMemo } from "react";
import * as Icons from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const TIER_STYLES = {
  GOLD: "from-amber-400 to-yellow-500",
  SILVER: "from-slate-300 to-slate-400",
  BRONZE: "from-orange-400 to-amber-600",
  PLATINUM: "from-cyan-300 to-blue-400",
};
const tierGradient = (t) => TIER_STYLES[(t || "").toUpperCase()] || "from-primary-500 to-blue-500";

const Badges = () => {
  const { data, loading, error, reload } = useApi(() => api.student.badges(), []);

  const badges = useMemo(() => data?.badges || [], [data]);
  const earnedCount = data?.earnedCount ?? badges.filter((b) => b.earned).length;
  const totalCount = data?.totalCount ?? badges.length;

  if (loading) {
    return (
      <div>
        <PageHeader title="Achievements & Badges" subtitle="Earn badges for your academic milestones" icon="Award" breadcrumb={["Dashboard", "Badges"]} />
        <Skeleton className="h-32 rounded-2xl mb-5" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Achievements & Badges" subtitle="Earn badges for your academic milestones" icon="Award" breadcrumb={["Dashboard", "Badges"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : badges.length === 0 ? (
        <EmptyState icon="Award" title="No badges available" description="Achievement badges will appear here as you progress through your courses." />
      ) : (
        <>
          <div className="bg-gradient-to-br from-primary-600 to-blue-500 rounded-2xl p-6 text-white mb-5 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><p className="text-3xl font-extrabold">{earnedCount}</p><p className="text-xs opacity-90">Badges Earned</p></div>
              <div><p className="text-3xl font-extrabold">{totalCount}</p><p className="text-xs opacity-90">Total Badges</p></div>
              {data?.cgpa != null && <div><p className="text-3xl font-extrabold">{Number(data.cgpa).toFixed(2)}</p><p className="text-xs opacity-90">CGPA</p></div>}
              {data?.aGrades != null && <div><p className="text-3xl font-extrabold">{data.aGrades}</p><p className="text-xs opacity-90">A Grades</p></div>}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {badges.map((b, i) => {
              const Icon = Icons[b.icon] || Icons.Award;
              return (
                <motion.div
                  key={b.id || i}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className={`relative rounded-2xl border p-5 text-center overflow-hidden ${b.earned ? "border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900" : "border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40"}`}
                >
                  <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-3 ${b.earned ? `bg-gradient-to-br ${tierGradient(b.tier)}` : "bg-slate-200 dark:bg-slate-700"}`}>
                    <Icon size={30} className={b.earned ? "text-white" : "text-slate-400 dark:text-slate-500"} />
                  </div>
                  <p className={`font-bold text-sm ${b.earned ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>{b.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{b.description}</p>
                  {b.tier && b.earned && <span className="inline-block mt-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{b.tier}</span>}
                  {!b.earned && <span className="inline-block mt-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500">Locked</span>}
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Badges;

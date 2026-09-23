import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Minus } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import DeptSmartFilter, { ALL_DEPTS, filterByDept, collectDepartments } from "../../components/common/DeptSmartFilter";

const QecFacultyEval = () => {
  const { data, loading, error, reload } = useApi(() => api.qec.facultyEval(), []);
  const allItems = data?.items || [];
  const stats = data?.stats || { facultyEvaluated: 0, avgRating: 0, totalEvaluations: 0, trendingUp: 0 };

  const [dept, setDept] = useState(ALL_DEPTS);
  const departments = useMemo(
    () => collectDepartments({ options: data?.departments || [], rows: allItems }),
    [data, allItems],
  );
  const items = useMemo(() => filterByDept(allItems, dept), [allItems, dept]);
  const scopedStats = useMemo(() => ({
    facultyEvaluated: items.filter((f) => Number(f.evaluations) > 0).length,
    avgRating: items.length ? items.reduce((sum, f) => sum + (Number(f.avgRating) || 0), 0) / items.length : 0,
    totalEvaluations: items.reduce((sum, f) => sum + (Number(f.evaluations) || 0), 0),
    trendingUp: items.filter((f) => f.trend === "up").length,
  }), [items]);

  return (
    <div>
      <PageHeader
        title="Faculty Evaluation"
        subtitle="Anonymous student evaluations of teaching faculty — performance, ratings and trends, separated by department"
        icon="Star"
        breadcrumb={["QEC", "Faculty Evaluation"]}
      />

      <div className="card-base p-3 mb-4 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-app">Filter faculty by department in real time.</p>
        <DeptSmartFilter value={dept} onChange={setDept} departments={departments} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard title="Faculty Evaluated" value={dept === ALL_DEPTS ? stats.facultyEvaluated : scopedStats.facultyEvaluated} icon="Users" color="violet" delay={0.05} />
        <StatCard title="Avg Rating" value={`${(dept === ALL_DEPTS ? (stats.avgRating || 0) : scopedStats.avgRating).toFixed(1)}/5`} icon="Star" color="amber" delay={0.1} />
        <StatCard title="Total Evaluations" value={dept === ALL_DEPTS ? stats.totalEvaluations : scopedStats.totalEvaluations} icon="Award" color="emerald" delay={0.15} />
        <StatCard title="Trending Up" value={dept === ALL_DEPTS ? stats.trendingUp : scopedStats.trendingUp} icon="TrendingUp" color="blue" delay={0.2} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card-base p-10 text-center text-sm text-muted-app">No faculty evaluations available yet.</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((f, i) => {
            const pct = (f.avgRating / 5) * 100;
            const diff = (f.avgRating - f.selfRating).toFixed(1);
            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card-base p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-app">{f.faculty}</h3>
                    <p className="text-xs text-muted-app">{f.department} · {f.courses} active courses</p>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${f.trend === "up" ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" : "bg-slate-100 dark:bg-slate-800 text-app"}`}>
                    {f.trend === "up" ? <TrendingUp size={10} /> : <Minus size={10} />}
                    {f.trend}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                  <div className="surface border border-app rounded-lg p-2">
                    <p className="text-[10px] text-muted-app">Student Avg</p>
                    <p className="font-bold text-app text-lg">{f.avgRating}</p>
                  </div>
                  <div className="surface border border-app rounded-lg p-2">
                    <p className="text-[10px] text-muted-app">Self Rating</p>
                    <p className="font-bold text-app text-lg">{f.selfRating}</p>
                  </div>
                  <div className="surface border border-app rounded-lg p-2">
                    <p className="text-[10px] text-muted-app">Evaluations</p>
                    <p className="font-bold text-app text-lg">{f.evaluations}</p>
                  </div>
                </div>

                <div className="mb-1">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-app">Rating Progress</span>
                    <span className="font-bold text-app">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} className={`h-full ${pct >= 90 ? "bg-emerald-500" : pct >= 80 ? "bg-blue-500" : pct >= 70 ? "bg-amber-500" : "bg-rose-500"}`} />
                  </div>
                </div>

                <p className="text-[11px] text-muted-app mt-2">
                  Self-perception gap: <span className={`font-bold ${diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{diff > 0 ? "+" : ""}{diff}</span>
                  {" "}({Math.abs(diff) > 0.3 ? "Significant" : "Aligned"})
                </p>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QecFacultyEval;

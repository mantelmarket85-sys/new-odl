import { motion } from "framer-motion";
import { Target, Star, ListChecks } from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";

const QecProgramEval = () => {
  const { data: pe, loading, error, reload } = useApi(() => api.qec.programEval(), []);

  if (error) {
    return (
      <div>
        <PageHeader title="Program Evaluation" subtitle="Program-level OBE attainment & quality indicators" icon="GraduationCap" breadcrumb={["QEC", "Program Evaluation"]} />
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  if (loading || !pe) {
    return (
      <div>
        <PageHeader title="Program Evaluation" subtitle="Loading…" icon="GraduationCap" breadcrumb={["QEC", "Program Evaluation"]} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const radarData = [
    { metric: "PLO", value: pe.ploAttainment },
    { metric: "CLO", value: pe.cloAttainment },
    { metric: "Satisfaction", value: pe.studentSatisfaction * 20 },
    { metric: "Graduation", value: pe.graduationRate },
    { metric: "Industry", value: pe.industryReadiness },
  ];
  const actionPct = pe.correctiveActions > 0 ? (pe.completedActions / pe.correctiveActions) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Program Evaluation"
        subtitle={pe.program}
        icon="GraduationCap"
        breadcrumb={["QEC", "Program Evaluation"]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard title="PLO Attainment" value={`${pe.ploAttainment}%`} icon="Target" color="emerald" delay={0.05} />
        <StatCard title="CLO Attainment" value={`${pe.cloAttainment}%`} icon="Target" color="blue" delay={0.1} />
        <StatCard title="Graduation Rate" value={`${pe.graduationRate}%`} icon="GraduationCap" color="purple" delay={0.15} />
        <StatCard title="Industry Ready" value={`${pe.industryReadiness}%`} icon="Users" color="amber" delay={0.2} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-base p-5">
          <h3 className="font-display font-bold text-app mb-3 flex items-center gap-2">
            <Target size={16} className="text-violet-600" /> Program Performance Radar
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid className="opacity-30" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar name="Score" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card-base p-5">
          <h3 className="font-display font-bold text-app mb-3 flex items-center gap-2">
            <Star size={16} className="text-amber-500" /> Recommendations
          </h3>
          <div className="space-y-2">
            {(pe.recommendations || []).map((r, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className="flex items-start gap-2 surface border border-app rounded-lg p-3">
                <div className="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {i + 1}
                </div>
                <p className="text-sm text-app">{r}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card-base p-5">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-display font-bold text-app flex items-center gap-2">
            <ListChecks size={16} className="text-emerald-600" /> Self-Assessment & Corrective Actions
          </h3>
          <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-1 rounded">{pe.selfAssessmentStatus}</span>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="surface border border-app rounded-lg p-4">
            <p className="text-xs text-muted-app">Cohort</p>
            <p className="font-bold text-app">{pe.cohort}</p>
            <p className="text-xs text-muted-app mt-2">Faculty: {pe.facultyCount} · Students: {pe.totalStudents}</p>
          </div>
          <div className="surface border border-app rounded-lg p-4">
            <p className="text-xs text-muted-app">Corrective Actions Progress</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-app">{pe.completedActions}</span>
              <span className="text-muted-app">/</span>
              <span className="text-2xl font-bold text-muted-app">{pe.correctiveActions}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600" style={{ width: `${actionPct}%` }} />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default QecProgramEval;

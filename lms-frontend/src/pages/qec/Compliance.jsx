import { CheckCircle2, AlertCircle, XCircle, Clock, MinusCircle } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";

const STATUS_CONF = {
  Compliant:      { icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-950/40" },
  Partial:         { icon: AlertCircle,  color: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-100 dark:bg-amber-950/40" },
  "Non-Compliant": { icon: XCircle,      color: "text-rose-600 dark:text-rose-400",       bg: "bg-rose-100 dark:bg-rose-950/40" },
  Pending:         { icon: Clock,        color: "text-slate-500 dark:text-slate-400",     bg: "bg-slate-100 dark:bg-slate-800/60" },
  "N/A":           { icon: MinusCircle,  color: "text-slate-500 dark:text-slate-400",     bg: "bg-slate-100 dark:bg-slate-800/60" },
};
const DEFAULT_CONF = STATUS_CONF.Pending;

const Compliance = () => {
  const { data, loading, error, reload } = useApi(() => api.qec.compliance(), []);
  const items = data?.items || [];
  const stats = data?.stats || { overall: 0, compliant: 0, partial: 0, noncomp: 0, pending: 0, total: 0 };

  return (
    <div>
      <PageHeader title="HEC Compliance" subtitle="Accreditation criteria compliance monitor" icon="ShieldCheck" breadcrumb={["QEC", "Compliance"]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard title="Overall Score" value={`${stats.overall}%`} icon="ShieldCheck" color="emerald" />
        <StatCard title="Compliant"     value={stats.compliant}     icon="CheckCircle2" color="blue" delay={0.05} />
        <StatCard title="Partial"       value={stats.partial}        icon="AlertCircle"  color="amber" delay={0.1} />
        <StatCard title="Non-Compliant" value={stats.noncomp}        icon="XCircle"      color="rose" delay={0.15} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card-base p-10 text-center text-sm text-muted-app">No compliance criteria configured yet.</div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const conf = STATUS_CONF[c.status] || DEFAULT_CONF;
            const Icon = conf.icon;
            return (
              <div key={c.id} className="card-base p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${conf.bg}`}>
                  <Icon size={20} className={conf.color} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-app text-sm">{c.criterion}</p>
                  <p className="text-[10px] text-muted-app mb-1">{c.category}</p>
                  <div className="mt-1 w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${c.score >= 80 ? "bg-emerald-500" : c.score >= 60 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${c.score}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${conf.color}`}>{c.score}%</p>
                  <p className="text-[10px] text-muted-app">{c.status}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Compliance;

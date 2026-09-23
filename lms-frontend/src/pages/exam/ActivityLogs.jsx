import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ScrollText, Search, Filter, User, Shield, FileText, Clock, RefreshCw,
  Database, AlertCircle, CheckCircle2,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";

/* Map audit action verbs → visual category */
const ACTION_META = (action = "") => {
  const a = action.toUpperCase();
  if (a.includes("DEACTIVATE") || a.includes("DROP")) return { color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-950/40", sev: "warning", icon: AlertCircle };
  if (a.includes("REACTIVATE") || a.includes("CONFIRM") || a.includes("APPROVE") || a.includes("RESOLVE") || a.includes("COMPLETE")) return { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-950/40", sev: "success", icon: CheckCircle2 };
  if (a.includes("ESCALAT") || a.includes("DISCIPLINE")) return { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950/40", sev: "warning", icon: Shield };
  if (a.includes("MESSAGE") || a.includes("ANNOUNCE") || a.includes("NOTIFY")) return { color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-100 dark:bg-sky-950/40", sev: "info", icon: FileText };
  return { color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-950/40", sev: "info", icon: Database };
};

const fmtTime = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

const ExamActivityLogs = () => {
  const [search, setSearch] = useState("");
  const [actorFilter, setActorFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");

  const { data, loading, error, reload } = useApi(() => api.exam.audit("?pageSize=200"), []);
  const items = data?.items || [];

  const actors = useMemo(() => Array.from(new Set(items.map((i) => i.actor).filter(Boolean))), [items]);
  const entities = useMemo(() => Array.from(new Set(items.map((i) => i.entity).filter(Boolean))), [items]);

  const filtered = useMemo(() => {
    return items.filter((log) => {
      const matchSearch =
        !search ||
        (log.actor || "").toLowerCase().includes(search.toLowerCase()) ||
        (log.action || "").toLowerCase().includes(search.toLowerCase()) ||
        (log.entity || "").toLowerCase().includes(search.toLowerCase()) ||
        (log.entityId || "").toLowerCase().includes(search.toLowerCase());
      const matchActor = actorFilter === "all" || log.actor === actorFilter;
      const matchEntity = entityFilter === "all" || log.entity === entityFilter;
      return matchSearch && matchActor && matchEntity;
    });
  }, [items, search, actorFilter, entityFilter]);

  const stats = useMemo(() => ({
    total: items.length,
    actors: actors.length,
    actions: new Set(items.map((i) => i.action)).size,
    warnings: items.filter((i) => ACTION_META(i.action).sev === "warning").length,
  }), [items, actors]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Logs"
        subtitle="Detailed audit trail of system actions performed across the exam cell."
        icon="ScrollText"
        breadcrumb={["Exam Controller", "Activity Logs"]}
        actions={
          <button onClick={reload} className="btn-secondary text-sm py-2 px-3 flex items-center gap-2">
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Events" value={stats.total} icon={ScrollText} color="indigo" delay={0} />
            <StatCard title="Distinct Actions" value={stats.actions} icon={Database} color="blue" delay={0.05} />
            <StatCard title="Actors" value={stats.actors} icon={User} color="emerald" delay={0.1} />
            <StatCard title="Sensitive Events" value={stats.warnings} icon={AlertCircle} color="amber" delay={0.15} />
          </div>

          {/* Filters */}
          <div className="card-base p-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search actor, action, entity…"
                  className="input-base pl-9 py-2 text-sm w-full"
                />
              </div>
              <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} className="input-base py-2 text-sm">
                <option value="all">All Actors</option>
                {actors.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="input-base py-2 text-sm">
                <option value="all">All Entities</option>
                {entities.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <p className="text-xs text-muted-app mt-3 inline-flex items-center gap-1">
              <Filter size={11} /> Showing <b className="text-app">{filtered.length}</b> of {items.length} events
            </p>
          </div>

          {/* Timeline */}
          <div className="card-base p-6">
            <h3 className="text-lg font-semibold text-app mb-4 flex items-center gap-2">
              <Clock size={18} className="text-primary-500" /> Activity Timeline
            </h3>
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <ScrollText size={48} className="mx-auto text-slate-300 dark:text-slate-700" />
                <p className="text-muted-app mt-3 text-sm">No activity matches your filters.</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-5 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
                <div className="space-y-3">
                  {filtered.map((log, i) => {
                    const meta = ACTION_META(log.action);
                    const Icon = meta.icon;
                    return (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.4) }}
                        className="relative pl-12"
                      >
                        <div className={`absolute left-2 top-3 w-6 h-6 rounded-full ${meta.bg} ${meta.color} flex items-center justify-center ring-4 ring-white dark:ring-slate-900`}>
                          <Icon size={12} />
                        </div>
                        <div className="surface border border-app rounded-xl p-4 hover:shadow-sm transition">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-bold text-app text-sm">{log.actor}</span>
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  {log.actorRole}
                                </span>
                              </div>
                              <p className="text-sm text-app">
                                <b className={meta.color}>{log.action}</b> on <b>{log.entity}</b>
                              </p>
                              {log.entityId && (
                                <p className="text-xs text-muted-app mt-1 font-mono break-all">#{log.entityId}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] text-muted-app flex items-center gap-1 justify-end">
                                <Clock size={10} /> {fmtTime(log.createdAt)}
                              </p>
                              {log.ip && (
                                <span className="inline-block mt-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  {log.ip}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ExamActivityLogs;

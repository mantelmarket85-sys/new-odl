// ============================================================
//  SUPPORT & GRIEVANCES — STAFF PORTAL (shared across all roles)
//  ------------------------------------------------------------
//  Single reusable page used by Teacher, Course Coordinator, Focal
//  Person, Exam Coordinator, QEC Coordinator and Provost. It renders:
//    • a stats strip (role-scoped counts)
//    • filters (status / case type / priority / SLA) + free-text search
//    • a case list (code, subject, student, badges, SLA)
//    • the full case drawer (conversation, internal notes, timeline,
//      assign/reassign, priority, status, escalation, resolve/close)
//
//  All data + authorization is server-side (api.grievances.*). The
//  only per-role prop is presentation (title / subtitle / breadcrumb).
//  This leaves every existing per-role appeal endpoint untouched.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import PageHeader from "../common/PageHeader";
import StatCard from "../common/StatCard";
import Badge from "../common/Badge";
import { Skeleton } from "../common/Skeleton";
import ErrorState from "../common/ErrorState";
import EmptyState from "../common/EmptyState";
import api from "../../services/api";
import GrievanceCaseDrawer from "./GrievanceCaseDrawer";
import {
  statusMeta, priorityMeta, caseTypeColor, PRIORITIES, CASE_TYPE_LABEL,
  fmtDateTime, slaState,
} from "./grievanceShared";

const STATUS_FILTERS = [
  { value: "", label: "All Statuses" },
  { value: "OPEN", label: "Submitted" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "IN_REVIEW", label: "Under Review" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "AWAITING_STUDENT", label: "Awaiting Student" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "REJECTED", label: "Rejected" },
];

const CASE_TYPE_FILTERS = [
  { value: "", label: "All Types" },
  ...Object.entries(CASE_TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

const StaffGrievancePortal = ({
  title = "Support & Grievances",
  subtitle = "Manage and resolve student cases",
  breadcrumb = ["Support & Grievances"],
  icon = "ShieldAlert",
}) => {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  // Filters
  const [status, setStatus] = useState("");
  const [caseType, setCaseType] = useState("");
  const [priority, setPriority] = useState("");
  const [slaOnly, setSlaOnly] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (caseType) p.set("caseType", caseType);
    if (priority) p.set("priority", priority);
    if (slaOnly) p.set("sla", "breached");
    if (debouncedQ) p.set("q", debouncedQ);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [status, caseType, priority, slaOnly, debouncedQ]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.grievances.list(buildParams());
      setCases(res.cases || []);
    } catch (e) {
      setError(e.message || "Failed to load cases");
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.grievances.stats();
      setStats(res);
    } catch { /* stats are best-effort */ }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const refreshAll = () => { loadList(); loadStats(); };

  const activeFilters = status || caseType || priority || slaOnly || debouncedQ;
  const clearFilters = () => { setStatus(""); setCaseType(""); setPriority(""); setSlaOnly(false); setQ(""); };

  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      { title: "Total Cases", value: stats.total, icon: "Inbox", color: "blue" },
      { title: "New / Submitted", value: stats.newCases, icon: "Sparkles", color: "cyan" },
      { title: "In Progress", value: stats.inProgress, icon: "Loader", color: "violet" },
      { title: "Awaiting Student", value: stats.awaitingStudent, icon: "Clock", color: "amber" },
      { title: "Escalated", value: stats.escalated, icon: "ArrowUpCircle", color: "rose" },
      { title: "SLA Breached", value: stats.slaBreached, icon: "AlarmClock", color: "rose" },
      { title: "Resolved", value: stats.resolved, icon: "CheckCircle2", color: "emerald" },
      { title: "Assigned to Me", value: stats.assignedToMe, icon: "UserCheck", color: "teal" },
    ];
  }, [stats]);

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        breadcrumb={breadcrumb}
        actions={
          <button onClick={refreshAll} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-400">
            <Icons.RefreshCw size={15} /> Refresh
          </button>
        }
      />

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {statCards.map((s, i) => (
            <StatCard key={s.title} {...s} delay={i * 0.03} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card-base p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Icons.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by case code or subject…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900">
          {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={caseType} onChange={(e) => setCaseType(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900">
          {CASE_TYPE_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900">
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{priorityMeta(p).label}</option>)}
        </select>
        <button onClick={() => setSlaOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition ${
            slaOnly ? "bg-rose-600 text-white border-rose-600" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          }`}>
          <Icons.AlarmClock size={15} /> SLA Breached
        </button>
        {activeFilters ? (
          <button onClick={clearFilters} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-rose-600">
            <Icons.X size={15} /> Clear
          </button>
        ) : null}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : error ? (
        <ErrorState description={error} onRetry={loadList} />
      ) : cases.length === 0 ? (
        <EmptyState
          icon="ShieldAlert"
          title={activeFilters ? "No matching cases" : "No cases yet"}
          description={activeFilters ? "Try adjusting or clearing the filters." : "Student support requests, grievances and appeals routed to you will appear here."}
        />
      ) : (
        <div className="space-y-2.5">
          {cases.map((c, i) => {
            const sm = statusMeta(c.status);
            const pm = priorityMeta(c.priority);
            const sla = slaState(c);
            return (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                onClick={() => setOpenId(c.id)}
                className="w-full text-left card-base p-4 hover:shadow-soft transition group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-bold text-primary-600 dark:text-primary-400">{c.caseCode}</span>
                      <Badge color={caseTypeColor(c.caseType)} size="sm">{c.caseTypeLabel}</Badge>
                      <Badge color={sm.color} size="sm" dot>{c.statusLabel || sm.label}</Badge>
                      <Badge color={pm.color} size="sm">{pm.label}</Badge>
                      {c.escalated && <Badge color="rose" size="sm">Escalated</Badge>}
                      {sla && !sla.terminal && <Badge color={sla.color} size="sm">{sla.text}</Badge>}
                    </div>
                    <p className="font-semibold text-sm text-app mt-1.5 truncate">{c.subject}</p>
                    <p className="text-xs text-muted-app line-clamp-1">{c.description}</p>
                    <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1"><Icons.User size={11} /> {c.studentName || "—"}</span>
                      {c.categoryLabel && <span className="flex items-center gap-1"><Icons.Tag size={11} /> {c.categoryLabel}</span>}
                      {c.targetRoleLabel && <span className="flex items-center gap-1"><Icons.Inbox size={11} /> {c.targetRoleLabel}</span>}
                      <span className="flex items-center gap-1"><Icons.Clock size={11} /> {fmtDateTime(c.updatedAt || c.createdAt)}</span>
                    </p>
                  </div>
                  <Icons.ChevronRight size={18} className="text-slate-300 group-hover:text-primary-500 shrink-0 mt-1" />
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {openId && (
        <GrievanceCaseDrawer
          caseId={openId}
          onClose={() => setOpenId(null)}
          onChanged={refreshAll}
        />
      )}
    </div>
  );
};

export default StaffGrievancePortal;

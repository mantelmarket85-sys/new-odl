import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radio, Video, ClipboardList, Search, RefreshCw, Circle, Clock, CheckCircle2,
  CalendarClock, GraduationCap, Users, Link2, PlayCircle, XCircle,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import ExportButtons from "../../components/enterprise/ExportButtons";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

const pctPill = (v) => {
  const n = Number(v) || 0;
  const cls = n >= 85 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
    : n >= 70 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
    : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
  return <span className={`inline-block text-[11px] font-bold px-2 py-1 rounded-full ${cls}`}>{n}%</span>;
};

const STATUS_META = {
  LIVE: { label: "Live", color: "rose", icon: Radio, badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300", dot: "text-rose-500" },
  ONGOING: { label: "Ongoing", color: "amber", icon: PlayCircle, badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", dot: "text-amber-500" },
  SCHEDULED: { label: "Scheduled", color: "blue", icon: CalendarClock, badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300", dot: "text-blue-500" },
  COMPLETED: { label: "Completed", color: "emerald", icon: CheckCircle2, badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", dot: "text-emerald-500" },
  CANCELLED: { label: "Cancelled", color: "slate", icon: XCircle, badge: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300", dot: "text-slate-400" },
};

const fmtWhen = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
};

const ClassMonitoring = () => {
  const [tab, setTab] = useState("classes");

  // Live/real-time classes (auto-refresh every 30s)
  const { data: cls, loading: clsLoading, error: clsError, reload: reloadCls } = useApi(() => api.coordinator.monitorClasses(), []);
  const { data: att, loading: attLoading, error: attError, reload: reloadAtt } = useApi(() => api.coordinator.monitorAttendance(), []);
  const { data: asmt, loading: asmtLoading, error: asmtError, reload: reloadAsmt } = useApi(() => api.coordinator.monitorAssessments(), []);

  useEffect(() => {
    if (tab !== "classes") return;
    const t = setInterval(() => reloadCls(), 30000);
    return () => clearInterval(t);
  }, [tab, reloadCls]);

  const classes = useMemo(() => cls?.classes || [], [cls]);
  const summary = cls?.summary || { total: 0, live: 0, ongoing: 0, scheduled: 0, completed: 0, cancelled: 0 };

  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");

  const filteredClasses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return classes.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (q && !c.courseCode?.toLowerCase().includes(q) && !c.title?.toLowerCase().includes(q) && !c.instructor?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [classes, statusFilter, query]);

  const attRows = att?.courses || [];
  const asmtRows = asmt?.courses || [];

  const attColumns = [
    { key: "course", label: "Course", render: (v) => <span className="font-bold text-app text-xs">{v}</span> },
    { key: "teacher", label: "Instructor", render: (v) => <span className="text-xs">{v}</span> },
    { key: "students", label: "Students" },
    { key: "sessions", label: "Sessions" },
    { key: "attendancePct", label: "Attendance", render: (v) => pctPill(v) },
  ];
  const asmtColumns = [
    { key: "course", label: "Course", render: (v) => <span className="font-bold text-app text-xs">{v}</span> },
    { key: "teacher", label: "Instructor", render: (v) => <span className="text-xs">{v}</span> },
    { key: "assignments", label: "Assignments" },
    { key: "assignmentSubmissions", label: "Submitted" },
    { key: "assignmentGraded", label: "Graded" },
    { key: "assignmentPending", label: "Pending", render: (v) => v > 0 ? <span className="font-bold text-amber-600">{v}</span> : "0" },
    { key: "quizzes", label: "Quizzes" },
    { key: "quizAttempts", label: "Quiz Attempts" },
  ];

  const statusTabs = [
    { id: "all", label: "All", count: summary.total },
    { id: "LIVE", label: "Live", count: summary.live },
    { id: "ONGOING", label: "Ongoing", count: summary.ongoing },
    { id: "SCHEDULED", label: "Scheduled", count: summary.scheduled },
    { id: "COMPLETED", label: "Completed", count: summary.completed },
    { id: "CANCELLED", label: "Cancelled", count: summary.cancelled },
  ];

  return (
    <div>
      <PageHeader title="Class Monitoring" subtitle="Real-time oversight of live, scheduled, ongoing and completed classes, plus attendance & assessment activity" icon="Radio" breadcrumb={["Course Coordinator", "Class Monitoring"]} />

      {/* Top stats — real-time class status */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard title="Live Now" value={summary.live} icon="Radio" color="rose" subtitle="In session" />
        <StatCard title="Ongoing" value={summary.ongoing} icon="PlayCircle" color="amber" subtitle="Within time" delay={0.05} />
        <StatCard title="Scheduled" value={summary.scheduled} icon="CalendarClock" color="blue" subtitle="Upcoming" delay={0.1} />
        <StatCard title="Completed" value={summary.completed} icon="CheckCircle2" color="emerald" subtitle="Finished" delay={0.15} />
      </div>

      {/* Main tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { id: "classes", label: "Live Classes", icon: Video },
          { id: "attendance", label: "Attendance", icon: Radio },
          { id: "assessments", label: "Assessments", icon: ClipboardList },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t.id ? "bg-gradient-to-r from-primary-600 to-blue-600 text-white shadow-lg shadow-primary-500/30" : "surface text-app border border-app hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
        <div className="ml-auto">
          {tab === "classes" && <button onClick={reloadCls} className="btn-secondary text-sm py-2 px-3"><RefreshCw size={14} className="inline mr-1" /> Refresh</button>}
          {tab === "attendance" && <ExportButtons title="Attendance Monitoring" columns={attColumns} rows={attRows} filename="attendance_monitoring" />}
          {tab === "assessments" && <ExportButtons title="Assessment Monitoring" columns={asmtColumns} rows={asmtRows} filename="assessment_monitoring" />}
        </div>
      </div>

      {tab === "classes" ? (
        <div>
          <div className="card-base p-3 mb-4 flex flex-col md:flex-row gap-2 md:items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by course, title or instructor..." className="input-base w-full pl-10 text-sm" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {statusTabs.map((s) => (
                <button key={s.id} onClick={() => setStatusFilter(s.id)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${statusFilter === s.id ? "bg-primary-600 text-white border-primary-600" : "surface border-app text-app hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                  {s.label} <span className="opacity-70">({s.count})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-sm text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
            <Video size={16} className="shrink-0 mt-0.5" />
            <span><b>Real-time monitoring.</b> Status updates automatically every 30 seconds. Coordinator view is read-only — instructors run their own classes.{cls?.generatedAt ? ` Last updated ${new Date(cls.generatedAt).toLocaleTimeString()}.` : ""}</span>
          </div>

          {clsError ? <ErrorState title="Couldn't load classes" description={clsError} onRetry={reloadCls} />
            : clsLoading ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
            : filteredClasses.length === 0 ? <EmptyState icon="Video" title="No classes found" description="No classes match the current filter. Instructors schedule live classes from their portal." />
            : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <AnimatePresence initial={false}>
                  {filteredClasses.map((c, i) => {
                    const meta = STATUS_META[c.status] || STATUS_META.SCHEDULED;
                    const Icon = meta.icon;
                    return (
                      <motion.div key={c.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.02 }}
                        className="card-base p-4 hover:shadow-lg transition-shadow">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-app text-sm">{c.courseCode}</span>
                            {c.semester && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-muted-app font-semibold">Sem {c.semester}</span>}
                          </div>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>
                            {c.status === "LIVE"
                              ? <Circle size={8} className={`${meta.dot} fill-current animate-pulse`} />
                              : <Icon size={10} />} {meta.label}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-app leading-tight line-clamp-2 mb-2">{c.title}</p>
                        <div className="space-y-1 text-xs text-muted-app">
                          <p className="inline-flex items-center gap-1.5"><GraduationCap size={12} /> {c.instructor}</p>
                          <p className="inline-flex items-center gap-1.5"><CalendarClock size={12} /> {fmtWhen(c.scheduledAt)} · {c.durationMin} min</p>
                          <p className="inline-flex items-center gap-1.5"><Users size={12} /> {c.enrolled} enrolled
                            {c.participation != null && <span className="text-app font-semibold ml-1">· {c.participation}/{c.participationTotal} attended ({c.participationPct}%)</span>}
                          </p>
                        </div>
                        {(c.joinUrl || c.recordingUrl) && (
                          <div className="mt-3 pt-2 border-t border-app flex gap-2">
                            {c.joinUrl && (c.status === "LIVE" || c.status === "ONGOING") && (
                              <a href={c.joinUrl} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1"><Link2 size={11} /> Join link</a>
                            )}
                            {c.recordingUrl && c.status === "COMPLETED" && (
                              <a href={c.recordingUrl} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><Video size={11} /> Recording</a>
                            )}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
        </div>
      ) : tab === "attendance" ? (
        attError ? <ErrorState title="Couldn't load attendance" description={attError} onRetry={reloadAtt} />
          : attLoading ? <div className="card-base p-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          : attRows.length === 0 ? <EmptyState icon="Radio" title="No attendance data" description="No sessions recorded yet." />
          : <EnterpriseTable columns={attColumns} rows={attRows} pageSize={10} />
      ) : (
        asmtError ? <ErrorState title="Couldn't load assessments" description={asmtError} onRetry={reloadAsmt} />
          : asmtLoading ? <div className="card-base p-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          : asmtRows.length === 0 ? <EmptyState icon="ClipboardList" title="No assessment data" description="No assignments or quizzes posted yet." />
          : <EnterpriseTable columns={asmtColumns} rows={asmtRows} pageSize={10} />
      )}
    </div>
  );
};

export default ClassMonitoring;

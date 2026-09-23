import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GraduationCap, Search, CheckCircle2, XCircle, Clock, TrendingUp,
  Layers, Users, BookOpen, RefreshCw, ChevronDown,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Badge from "../../components/common/Badge";
import { useToast } from "../../context/ToastContext";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

const STATUS_TABS = [
  { key: "ALL", label: "All" },
  { key: "REQUESTED", label: "Pending" },
  { key: "ENROLLED", label: "Approved" },
  { key: "DROPPED", label: "Rejected" },
];

const statusColor = (s) =>
  s === "ENROLLED" ? "emerald" : s === "DROPPED" ? "rose" : s === "REQUESTED" ? "amber" : "slate";
const statusLabel = (s) =>
  s === "ENROLLED" ? "Approved" : s === "DROPPED" ? "Rejected" : s === "REQUESTED" ? "Pending" : s;

// Gradient palette cycled per semester card.
const CARD_THEMES = [
  { ring: "from-blue-500/15 to-indigo-500/5", chip: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
  { ring: "from-emerald-500/15 to-teal-500/5", chip: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  { ring: "from-amber-500/15 to-orange-500/5", chip: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  { ring: "from-fuchsia-500/15 to-pink-500/5", chip: "bg-fuchsia-500", text: "text-fuchsia-600 dark:text-fuchsia-400" },
  { ring: "from-cyan-500/15 to-sky-500/5", chip: "bg-cyan-500", text: "text-cyan-600 dark:text-cyan-400" },
  { ring: "from-violet-500/15 to-purple-500/5", chip: "bg-violet-500", text: "text-violet-600 dark:text-violet-400" },
];

const Enrollments = () => {
  const { toast } = useToast();

  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [semester, setSemester] = useState("ALL");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadStats = useCallback(() => {
    api.coordinator.enrollmentStats().then(setStats).catch(() => {});
  }, []);

  const loadList = useCallback(async () => {
    setError("");
    try {
      // Pull a generous page so semester cards reflect all matching records.
      const qs = new URLSearchParams({ page: "1", pageSize: "500", status });
      if (debounced) qs.set("search", debounced);
      const res = await api.coordinator.enrollmentRequests(`?${qs.toString()}`);
      setRows(res.items || []);
      setTotal(res.pagination?.total ?? (res.items || []).length);
    } catch (err) {
      setError(err.message || "Failed to load enrollment requests");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, debounced]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { setLoading(true); loadList(); }, [loadList]);

  // Real-time refresh on enrollment / allocation events.
  useEffect(() => {
    let es;
    try {
      es = new EventSource(api.coordinator.eventsUrl());
      const refresh = () => { loadList(); loadStats(); };
      es.addEventListener("enrollment", refresh);
      es.addEventListener("allocation", refresh);
    } catch (_) { /* optional */ }
    return () => { if (es) es.close(); };
  }, [loadList, loadStats]);

  const decide = async (r, action) => {
    try {
      await api.coordinator.decideEnrollment(r.id, { action });
      toast(`Enrollment ${action === "approve" ? "approved" : "rejected"}`, { type: "success" });
      loadList();
      loadStats();
    } catch (err) {
      toast(err.message || "Decision failed", { type: "error" });
    }
  };

  const manualRefresh = () => { setRefreshing(true); loadList(); loadStats(); };

  // Distinct semesters present in the (status-filtered) data — for the dropdown.
  const semesterOptions = useMemo(() => {
    const set = new Map();
    rows.forEach((r) => {
      if (r.semesterNumber != null) set.set(r.semesterNumber, r.semesterTitle || `Semester ${r.semesterNumber}`);
    });
    return [...set.entries()].sort((a, b) => a[0] - b[0]).map(([num, title]) => ({ num, title }));
  }, [rows]);

  // Apply semester dropdown filter, then group by semester into cards.
  const groups = useMemo(() => {
    const filtered = semester === "ALL"
      ? rows
      : rows.filter((r) => String(r.semesterNumber) === String(semester));

    const map = new Map();
    filtered.forEach((r) => {
      const key = r.semesterNumber != null ? r.semesterNumber : "none";
      if (!map.has(key)) {
        map.set(key, {
          semesterNumber: r.semesterNumber,
          semesterTitle: r.semesterTitle || (r.semesterNumber != null ? `Semester ${r.semesterNumber}` : "Unassigned Semester"),
          records: [],
        });
      }
      map.get(key).records.push(r);
    });

    const arr = [...map.values()].sort((a, b) => {
      if (a.semesterNumber == null) return 1;
      if (b.semesterNumber == null) return -1;
      return a.semesterNumber - b.semesterNumber;
    });

    arr.forEach((g) => {
      g.approved = g.records.filter((r) => r.status === "ENROLLED").length;
      g.pending = g.records.filter((r) => r.status === "REQUESTED").length;
      g.rejected = g.records.filter((r) => r.status === "DROPPED").length;
      g.studentCount = new Set(g.records.map((r) => r.studentId)).size;
    });
    return arr;
  }, [rows, semester]);

  const totals = stats?.totals || { total: 0, approved: 0, rejected: 0, pending: 0 };

  return (
    <div>
      <PageHeader
        title="Enrollments"
        subtitle="Live enrollment records organised semester-wise. Review requests, approve or reject, and monitor trends — every record comes straight from the database."
        icon="GraduationCap"
        breadcrumb={["Course Coordinator", "Enrollments"]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard title="Total" value={totals.total} icon="GraduationCap" color="blue" />
        <StatCard title="Approved" value={totals.approved} icon="CheckCircle2" color="emerald" delay={0.05} />
        <StatCard title="Pending" value={totals.pending} icon="Clock" color="amber" delay={0.1} />
        <StatCard title="Rejected" value={totals.rejected} icon="XCircle" color="rose" delay={0.15} />
      </div>

      {/* Trend chart */}
      <div className="card-base p-4 mb-4">
        <p className="text-sm font-bold text-app mb-3 flex items-center gap-1.5"><TrendingUp size={15} className="text-primary-600" /> Enrollment Trend (last 6 months)</p>
        {!stats ? (
          <Skeleton className="h-56" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="approved" name="Approved" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="rejected" name="Rejected" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Filters toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              status === t.key ? "bg-primary-600 text-white border-primary-600" : "border-app text-muted-app hover:bg-slate-50 dark:hover:bg-slate-800/40"
            }`}
          >
            {t.label}
          </button>
        ))}

        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student, roll or course…" className="input-base pl-9 py-2 text-sm w-full" />
        </div>

        {/* Semester dropdown filter */}
        <div className="relative">
          <Layers size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            className="input-base pl-9 pr-8 py-2 text-sm appearance-none font-semibold cursor-pointer"
            aria-label="Filter by semester"
          >
            <option value="ALL">All Semesters</option>
            {semesterOptions.map((s) => (
              <option key={s.num} value={s.num}>{s.title}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
        </div>

        <button onClick={manualRefresh} className="px-3 py-2 rounded-xl border border-app text-sm font-bold text-app inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error ? (
        <ErrorState title="Couldn't load enrollments" description={error} onRetry={loadList} />
      ) : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div>
      ) : groups.length === 0 ? (
        <EmptyState icon="GraduationCap" title="No enrollment records" description="There are no enrollment records matching the current filters." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <AnimatePresence>
            {groups.map((g, idx) => {
              const theme = CARD_THEMES[idx % CARD_THEMES.length];
              return (
                <motion.section
                  key={g.semesterNumber ?? "none"}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, delay: idx * 0.03 }}
                  className="card-base overflow-hidden flex flex-col"
                  id={`semester-card-${g.semesterNumber ?? "none"}`}
                >
                  {/* Card header */}
                  <header className={`relative px-5 py-4 bg-gradient-to-br ${theme.ring} border-b border-app`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-xl ${theme.chip} text-white grid place-items-center font-extrabold text-lg shadow-sm`}>
                          {g.semesterNumber ?? "?"}
                        </div>
                        <div>
                          <h3 className="text-base font-extrabold text-app leading-tight">{g.semesterTitle}</h3>
                          <p className="text-xs text-muted-app flex items-center gap-1 mt-0.5">
                            <Users size={12} /> {g.studentCount} student{g.studentCount === 1 ? "" : "s"}
                            <span className="mx-1">·</span>
                            <BookOpen size={12} /> {g.records.length} record{g.records.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge color="emerald">{g.approved} approved</Badge>
                        {g.pending > 0 && <Badge color="amber">{g.pending} pending</Badge>}
                        {g.rejected > 0 && <Badge color="rose">{g.rejected} rejected</Badge>}
                      </div>
                    </div>
                  </header>

                  {/* Card body — roster */}
                  <div className="flex-1 overflow-y-auto max-h-[360px] divide-y divide-slate-100 dark:divide-slate-800">
                    {g.records.map((r) => (
                      <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <div className="min-w-0">
                          <p className="font-semibold text-app truncate">{r.studentName}</p>
                          <p className="text-xs text-muted-app truncate">
                            {r.roll}{r.program ? ` · ${r.program}` : ""} · {r.course}
                            {r.section ? <span className="ml-1 inline-flex items-center"><Layers size={10} className="mr-0.5" />Sec {r.section}</span> : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge color={statusColor(r.status)}>{statusLabel(r.status)}</Badge>
                          {r.status === "REQUESTED" && (
                            <div className="inline-flex items-center gap-1">
                              <button onClick={() => decide(r, "approve")} title="Approve" className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border border-emerald-200 dark:border-emerald-500/30"><CheckCircle2 size={14} /></button>
                              <button onClick={() => decide(r, "reject")} title="Reject" className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 border border-rose-200 dark:border-rose-500/30"><XCircle size={14} /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.section>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {!loading && !error && groups.length > 0 && (
        <p className="text-xs text-muted-app mt-4 text-center">
          Showing {groups.reduce((n, g) => n + g.records.length, 0)} record(s) across {groups.length} semester{groups.length === 1 ? "" : "s"} · {total} total in database
        </p>
      )}
    </div>
  );
};

export default Enrollments;

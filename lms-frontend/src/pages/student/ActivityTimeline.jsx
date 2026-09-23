import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState, useCallback, useEffect } from "react";
import * as Icons from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import api from "../../services/api";

// Visual metadata per activity type — gradient + label for the timeline.
const TYPE_META = {
  LOGIN: { icon: "LogIn", color: "from-emerald-500 to-green-600", dot: "bg-emerald-500", label: "Sign In" },
  LOGOUT: { icon: "LogOut", color: "from-slate-500 to-slate-600", dot: "bg-slate-500", label: "Sign Out" },
  ASSIGNMENT_SUBMIT: { icon: "Upload", color: "from-blue-500 to-indigo-600", dot: "bg-blue-500", label: "Assignment" },
  QUIZ_ATTEMPT: { icon: "FileQuestion", color: "from-purple-500 to-violet-600", dot: "bg-purple-500", label: "Quiz" },
  ATTENDANCE: { icon: "CalendarCheck", color: "from-cyan-500 to-blue-600", dot: "bg-cyan-500", label: "Attendance" },
  LIVE_CLASS: { icon: "Radio", color: "from-rose-500 to-pink-600", dot: "bg-rose-500", label: "Live Class" },
  COURSE_ACCESS: { icon: "BookOpen", color: "from-amber-500 to-orange-600", dot: "bg-amber-500", label: "Course" },
  ANNOUNCEMENT_VIEW: { icon: "Megaphone", color: "from-fuchsia-500 to-pink-600", dot: "bg-fuchsia-500", label: "Announcement" },
  AI_TUTOR: { icon: "Bot", color: "from-violet-500 to-purple-600", dot: "bg-violet-500", label: "AI Tutor" },
  RESULT: { icon: "Award", color: "from-emerald-500 to-teal-600", dot: "bg-emerald-500", label: "Result" },
  OTHER: { icon: "Activity", color: "from-slate-500 to-slate-600", dot: "bg-slate-500", label: "Other" },
};
const metaFor = (t) => TYPE_META[(t || "").toUpperCase()] || TYPE_META.OTHER;

const fmt = (d) => {
  if (!d) return "";
  try {
    const dt = new Date(d);
    const diff = (Date.now() - dt.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
};

const fmtExact = (d) => {
  try { return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return d; }
};

// Group timeline items by calendar day for a sectioned timeline.
const dayKey = (d) => {
  try { return new Date(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { return "Earlier"; }
};

const renderMeta = (meta) => {
  if (!meta) return null;
  if (typeof meta === "string") return meta;
  const parts = [];
  if (meta.status) parts.push(`Status: ${meta.status}`);
  if (meta.marks != null) parts.push(`Marks: ${meta.marks}`);
  if (meta.score != null && meta.maxScore != null) parts.push(`Score: ${meta.score}/${meta.maxScore}`);
  if (meta.grade) parts.push(`Grade: ${meta.grade}`);
  if (meta.percent != null) parts.push(`${meta.percent}%`);
  return parts.length ? parts.join(" · ") : null;
};

const ActivityTimeline = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (search.trim()) params.set("q", search.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const res = await api.student.activity(qs ? `?${qs}` : "");
      setData(res);
    } catch (e) {
      setError(e.message || "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search, from, to]);

  // Debounced reload when filters/search change.
  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
  }, [load]);

  const timeline = data?.timeline || [];
  const typeCounts = data?.typeCounts || {};

  // Build filter chips from the full set of known types (always show),
  // labelled with live counts when present.
  const filterChips = useMemo(() => {
    const order = ["LOGIN", "LOGOUT", "ASSIGNMENT_SUBMIT", "QUIZ_ATTEMPT", "ATTENDANCE", "LIVE_CLASS", "COURSE_ACCESS", "ANNOUNCEMENT_VIEW", "AI_TUTOR", "RESULT", "OTHER"];
    return order;
  }, []);

  const grouped = useMemo(() => {
    const groups = [];
    let current = null;
    for (const it of timeline) {
      const key = dayKey(it.at);
      if (!current || current.key !== key) {
        current = { key, items: [] };
        groups.push(current);
      }
      current.items.push(it);
    }
    return groups;
  }, [timeline]);

  const clearFilters = () => { setTypeFilter("ALL"); setSearch(""); setFrom(""); setTo(""); };
  const hasFilters = typeFilter !== "ALL" || search.trim() || from || to;

  return (
    <div>
      <PageHeader title="Activity Timeline" subtitle="A real-time history of your learning activity" icon="Activity" breadcrumb={["Dashboard", "Activity"]} />

      {/* ---- Filter & search bar ---- */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 mb-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Icons.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activity, course code, description…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Icons.CalendarRange size={15} />
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200" />
              <span className="text-slate-400">to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200" />
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"><Icons.X size={13} /> Clear</button>
            )}
          </div>
        </div>

        {/* Type filter chips */}
        <div className="flex gap-2 flex-wrap mt-3">
          <button onClick={() => setTypeFilter("ALL")} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${typeFilter === "ALL" ? "bg-primary-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>All</button>
          {filterChips.map((t) => {
            const m = metaFor(t);
            const count = typeCounts[t];
            const active = typeFilter === t;
            return (
              <button key={t} onClick={() => setTypeFilter(active ? "ALL" : t)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${active ? "bg-primary-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : m.dot}`} />
                {m.label}{count ? <span className={`text-[10px] ${active ? "text-white/80" : "text-slate-400"}`}>({count})</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : timeline.length === 0 ? (
        <EmptyState icon="Activity" title={hasFilters ? "No matching activity" : "No activity yet"} description={hasFilters ? "Try adjusting your filters or search." : "Your sign-ins, submissions, quiz attempts, live classes and more will appear here."} />
      ) : (
        <div className="space-y-7">
          {grouped.map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-2 mb-3">
                <Icons.CalendarDays size={14} className="text-slate-400" />
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{group.key}</p>
                <span className="text-[11px] text-slate-400">· {group.items.length} {group.items.length === 1 ? "activity" : "activities"}</span>
              </div>
              <div className="relative pl-6">
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-700" />
                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {group.items.map((it, i) => {
                      const m = metaFor(it.type);
                      const Icon = Icons[it.icon] || Icons[m.icon] || Icons.Activity;
                      const metaText = renderMeta(it.meta);
                      return (
                        <motion.div key={it.id || i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }} className="relative">
                          <div className={`absolute -left-6 top-3 w-6 h-6 rounded-full bg-gradient-to-br ${m.color} flex items-center justify-center ring-4 ring-white dark:ring-slate-950 shadow-sm`}>
                            <Icon size={12} className="text-white" />
                          </div>
                          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 ml-2 hover:border-primary-200 dark:hover:border-primary-800 transition">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-br ${m.color} text-white`}>{m.label}</span>
                                  {it.course && <span className="text-[10px] font-mono font-bold text-primary-600">{it.course}</span>}
                                </div>
                                <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 mt-1">{it.title}</p>
                                {it.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{it.description}</p>}
                                {it.courseTitle && !it.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{it.courseTitle}</p>}
                                {metaText && <p className="text-xs text-slate-400 mt-0.5">{metaText}</p>}
                              </div>
                              <span title={fmtExact(it.at)} className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">{fmt(it.at)}</span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityTimeline;

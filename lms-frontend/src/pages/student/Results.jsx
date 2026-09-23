import { motion, AnimatePresence } from "framer-motion";
import { Download, FileText, Award, TrendingUp, FlaskConical, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { useMemo, useState, useEffect, useRef, Fragment } from "react";
import PageHeader from "../../components/common/PageHeader";
import Badge from "../../components/common/Badge";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const gradeColor = (g) => {
  if (g === "A" || g === "A+") return "emerald";
  if (g === "A-" || g === "B+") return "blue";
  if (g === "B" || g === "B-") return "amber";
  if (g === "C+" || g === "C") return "purple";
  if (g === "F") return "rose";
  return "slate";
};

const Results = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.student.transcript(), []);
  // Req 3.3 — lab task marks are attached per result by the /results endpoint.
  const { data: resultsData, reload: reloadResults } = useApi(() => api.student.results(), []);
  // Task 4 — auto-generated, weightage-driven results table for EVERY enrolled
  // course (zero-state 0s before publish). Used to render the results table
  // even when the transcript has no published terms yet.
  const { data: allData, reload: reloadAll } = useApi(() => api.student.resultsAll(), []);
  const [active, setActive] = useState(0);

  // ----------------------------------------------------------------
  // MANUAL REFRESH ONLY (client requirement 1.3).
  // The Results page must NOT refresh by itself. All automatic refresh
  // mechanisms have been removed — no polling interval, no focus/online/
  // visibility auto-reload, no `aust:refresh` listener and no Server-Sent
  // Events auto-reload. The page loads its data once on mount (via useApi)
  // and only re-fetches when the user explicitly clicks the Refresh button.
  const [refreshing, setRefreshing] = useState(false);
  const reloadAllSources = useMemo(
    () => async () => {
      setRefreshing(true);
      try {
        await Promise.all([reload(), reloadResults(), reloadAll()]);
      } finally {
        setRefreshing(false);
      }
    },
    [reload, reloadResults, reloadAll]
  );

  // Download menu (Req 3.4 — replaces Print) + in-flight indicator.
  const [dlOpen, setDlOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const dlRef = useRef(null);
  // Expanded lab-task marks per result row.
  const [expanded, setExpanded] = useState({});

  // Task 4 — prefer the real transcript (graded/published terms). When it is
  // empty, fall back to the auto-generated weightage-driven table so every
  // enrolled course still shows up with 0s (zero-state) instead of an empty
  // page. The two shapes are compatible (termCode / termTitle / rows[]).
  const transcriptTerms = useMemo(() => data?.terms || [], [data]);
  const allTerms = useMemo(() => allData?.terms || [], [allData]);
  const usingZeroState = transcriptTerms.length === 0 && allTerms.length > 0;
  // Normalize zero-state terms so they carry the same fields the render path
  // expects (gpa / totalCredits), defaulting to 0 until marks are published.
  const terms = useMemo(() => {
    if (!usingZeroState) return transcriptTerms;
    return allTerms.map((t) => ({
      ...t,
      gpa: t.gpa ?? 0,
      totalCredits: (t.rows || []).reduce((s, r) => s + (Number(r.creditHours) || 0), 0),
    }));
  }, [usingZeroState, transcriptTerms, allTerms]);
  const cgpa = data?.cgpa ?? 0;
  const totalCredits = data?.totalCredits ?? 0;
  const current = terms[active] || null;

  const gpaSeries = useMemo(
    () => terms.map((t) => ({ semester: t.termCode, gpa: t.gpa })),
    [terms]
  );

  // Map resultId → lab info so each transcript row can surface its lab tasks.
  const labByResult = useMemo(() => {
    const m = {};
    for (const r of resultsData?.results || []) {
      if (r.hasLab) m[r.id] = r.labTasks || [];
    }
    return m;
  }, [resultsData]);

  // Point 7 — map resultId → dynamic weightage-driven breakdown so each
  // course row can expand into a table of exactly the categories/items the
  // Course Coordinator configured (nothing hard-coded).
  const breakdownByResult = useMemo(() => {
    const m = {};
    for (const r of resultsData?.results || []) {
      if (r.breakdown) m[r.id] = r.breakdown;
    }
    // Task 4 — also index the auto-generated (zero-state / pending) breakdowns
    // so pending courses can expand into their weightage-driven table too.
    for (const t of allData?.terms || []) {
      for (const row of t.rows || []) {
        if (row.breakdown && m[row.resultId] == null) m[row.resultId] = row.breakdown;
      }
    }
    return m;
  }, [resultsData, allData]);

  // Close the download menu on outside click.
  useEffect(() => {
    const onDoc = (e) => { if (dlRef.current && !dlRef.current.contains(e.target)) setDlOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runDownload = async (fn) => {
    setDownloading(true);
    setDlOpen(false);
    try {
      await fn();
      toast("Download started", "success");
    } catch (e) {
      toast(e?.message || "Download failed", "error");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Results & Transcripts" subtitle="Loading your academic record…" icon="Award" breadcrumb={["Dashboard", "Results"]} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Results & Transcripts"
        subtitle="Semester-wise marks, GPA, and academic record"
        icon="Award"
        breadcrumb={["Dashboard", "Results"]}
        actions={
          <div className="flex items-center gap-2">
          {/* Manual refresh (client requirement 1.3) — the page never
              refreshes on its own; the user triggers a re-fetch here. */}
          <button
            onClick={reloadAllSources}
            disabled={refreshing}
            title="Refresh results"
            className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1 disabled:opacity-60"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
          {/* Req 3.4 — Download replaces Print across the Results module.
             Covers full/cumulative transcript, the selected semester result,
             and every previous session/semester (per-term). */}
          <div className="relative" ref={dlRef}>
            <button
              onClick={() => setDlOpen((o) => !o)}
              disabled={downloading || terms.length === 0}
              className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1 disabled:opacity-60"
            >
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download
              <ChevronDown size={13} className={`transition ${dlOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {dlOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="absolute right-0 mt-2 w-72 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden"
                >
                  <button
                    onClick={() => runDownload(() => api.student.downloadTranscript("transcript.pdf"))}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800"
                  >
                    <FileText size={15} className="text-primary-600" /> Full Transcript (all semesters)
                  </button>
                  <button
                    onClick={() => runDownload(() => api.student.downloadResults("results-cumulative.pdf"))}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800"
                  >
                    <Award size={15} className="text-emerald-600" /> Overall / Cumulative Result
                  </button>
                  {current && (
                    <button
                      onClick={() => runDownload(() => api.student.downloadTermResult(current.termCode, `result-${current.termCode}.pdf`))}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800"
                    >
                      <FileText size={15} className="text-blue-600" /> This Semester ({current.termTitle})
                    </button>
                  )}
                  {terms.length > 1 && (
                    <div className="max-h-56 overflow-y-auto">
                      <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-app">Previous Sessions / Semesters</p>
                      {terms.map((t) => (
                        <button
                          key={t.termCode}
                          onClick={() => runDownload(() => api.student.downloadTermResult(t.termCode, `result-${t.termCode}.pdf`))}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                        >
                          <Download size={14} className="text-slate-500" /> {t.termTitle}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>
        }
      />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : terms.length === 0 ? (
        <EmptyState icon="Award" title="No courses yet" description="Your results table will appear here automatically once you are enrolled in courses." />
      ) : (
        <>
          {usingZeroState && (
            <div className="mb-5 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex items-start gap-3">
              <Award size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Results not published yet</p>
                <p className="text-xs text-amber-700/90 dark:text-amber-300/80">
                  This table is auto-generated from each course's assessment weightage. Every component shows 0 until your instructor enters marks — click <span className="font-semibold">Refresh</span> to pull the latest marks.
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: "CGPA", value: cgpa.toFixed ? cgpa.toFixed(2) : cgpa, color: "from-emerald-500 to-teal-600", icon: Award },
              { label: "Current GPA", value: current ? (current.gpa.toFixed ? current.gpa.toFixed(2) : current.gpa) : "—", color: "from-blue-500 to-indigo-600", icon: TrendingUp },
              { label: "Credits Earned", value: totalCredits, color: "from-purple-500 to-violet-600", icon: FileText },
              { label: "Terms", value: terms.length, color: "from-amber-500 to-orange-600", icon: TrendingUp },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`relative bg-gradient-to-br ${s.color} rounded-2xl p-4 text-white overflow-hidden`}>
                <div className="absolute -right-2 -top-2 w-20 h-20 bg-white/10 rounded-full blur-xl" />
                <s.icon size={22} className="mb-2" />
                <p className="font-display text-3xl font-extrabold">{s.value}</p>
                <p className="text-xs opacity-90">{s.label}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-4 mb-5">
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 mb-3">GPA Progression</h3>
              {gpaSeries.length <= 1 ? (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-app">More data will appear after additional terms.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={gpaSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="semester" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 4]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="gpa" stroke="#2563eb" strokeWidth={3} dot={{ fill: "#2563eb", r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="bg-gradient-to-br from-primary-600 to-blue-700 rounded-2xl p-5 text-white relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
              <p className="text-xs opacity-80 font-semibold uppercase tracking-wide">Academic Record</p>
              <p className="font-display text-2xl font-extrabold mt-2">{user?.name || user?.username}</p>
              <p className="text-xs opacity-90">Roll: {user?.username}</p>
              <div className="mt-4 p-3 bg-white/10 backdrop-blur rounded-xl">
                <div className="flex justify-between text-xs"><span className="opacity-80">CGPA:</span><span className="font-bold">{cgpa} / 4.0</span></div>
                <div className="flex justify-between text-xs mt-1"><span className="opacity-80">Credits earned:</span><span className="font-bold">{totalCredits}</span></div>
                <div className="flex justify-between text-xs mt-1"><span className="opacity-80">Status:</span><span className="font-bold text-emerald-300">{cgpa >= 2 ? "Good Standing" : "Probation"}</span></div>
              </div>
            </div>
          </div>

          {/* Term selector */}
          <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
            {terms.map((t, i) => (
              <button
                key={t.termCode}
                onClick={() => setActive(i)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap ${active === i ? "bg-primary-600 text-white shadow-lg" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-primary-300"}`}
              >
                {t.termTitle} <span className="ml-1 text-xs opacity-80">(GPA {t.gpa})</span>
              </button>
            ))}
          </div>

          {/* Detail table */}
          {current && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-soft">
              <div className="px-5 py-4 bg-gradient-to-r from-primary-50 to-blue-50 dark:from-slate-800 dark:to-slate-800 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">{current.termTitle}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{current.rows.length} courses · {current.totalCredits} credit hours</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div><p className="text-xs text-slate-500 dark:text-slate-400">GPA</p><p className="font-display font-extrabold text-xl gradient-text">{current.gpa}</p></div>
                  <div><p className="text-xs text-slate-500">Credits</p><p className="font-display font-extrabold text-xl text-slate-900 dark:text-slate-100">{current.totalCredits}</p></div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                      <th className="px-3 py-3">Code</th>
                      <th className="px-3 py-3">Course Title</th>
                      <th className="px-3 py-3 text-center">Cr.Hr</th>
                      <th className="px-3 py-3 text-center">Total %</th>
                      <th className="px-3 py-3 text-center">Grade</th>
                      <th className="px-3 py-3 text-center">Grade Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.rows.map((s) => {
                      const labTasks = labByResult[s.resultId] || [];
                      const isLab = labTasks.length > 0;
                      // Point 7 — dynamic breakdown from coordinator weightage.
                      const breakdown = breakdownByResult[s.resultId] || null;
                      const hasBreakdown = !!(breakdown && breakdown.categories && breakdown.categories.length);
                      const isOpen = !!expanded[s.resultId];
                      return (
                        <Fragment key={s.resultId}>
                          <tr className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900">
                            <td className="px-3 py-3 font-mono font-bold text-primary-700">
                              {s.courseCode}
                              {isLab && <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] font-bold text-indigo-600 dark:text-indigo-400"><FlaskConical size={10} /> LAB</span>}
                            </td>
                            <td className="px-3 py-3 font-semibold text-slate-900 dark:text-slate-100">
                              {s.courseTitle}
                              {hasBreakdown && (
                                <button
                                  onClick={() => setExpanded((m) => ({ ...m, [s.resultId]: !m[s.resultId] }))}
                                  className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 dark:text-primary-400 hover:underline"
                                >
                                  {isOpen ? "Hide" : "View"} marks breakdown
                                  <ChevronDown size={12} className={`transition ${isOpen ? "rotate-180" : ""}`} />
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">{s.creditHours}</td>
                            <td className="px-3 py-3 text-center font-bold text-slate-900 dark:text-slate-100">{s.totalPercent}%</td>
                            <td className="px-3 py-3 text-center"><Badge color={gradeColor(s.letterGrade)}>{s.letterGrade}</Badge></td>
                            <td className="px-3 py-3 text-center font-bold text-primary-700">{s.gradePoints}</td>
                          </tr>
                          {hasBreakdown && isOpen && (
                            <tr className="bg-primary-50/40 dark:bg-slate-950/40">
                              <td colSpan="6" className="px-5 py-3">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300 mb-2 flex items-center gap-1">
                                  <Award size={13} /> Assessment Breakdown
                                  <span className="ml-1 text-[9px] font-medium text-slate-400 normal-case">
                                    {breakdown.configured ? "(per coordinator weightage)" : "(default weightage)"}
                                  </span>
                                </p>
                                {/* Horizontal, coordinator-driven component plan. Only weighted values are shown. */}
                                <div className="overflow-x-auto">
                                  <table className="min-w-full text-xs border-separate border-spacing-0">
                                    <thead>
                                      <tr className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
                                        <th className="px-3 py-2 text-center border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">S.No.</th>
                                        <th className="px-3 py-2 text-left border-b border-slate-200 dark:border-slate-700 min-w-48">Course</th>
                                        {(breakdown.components || breakdown.categories || []).map((component) => (
                                          <th key={component.key} className="px-3 py-2 text-center border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                            {component.label}
                                            <span className="block normal-case text-[9px] font-medium text-slate-400">Weight {component.weight}</span>
                                          </th>
                                        ))}
                                        <th className="px-3 py-2 text-center border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">Weighted Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr className="bg-white/70 dark:bg-slate-900/50">
                                        <td className="px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-300">1</td>
                                        <td className="px-3 py-3 font-semibold text-slate-900 dark:text-slate-100">
                                          {breakdown.courseCode} — {breakdown.courseTitle}
                                        </td>
                                        {(breakdown.components || breakdown.categories || []).map((component) => (
                                          <td key={component.key} className="px-3 py-3 text-center font-bold text-slate-900 dark:text-slate-100">
                                            {component.weightedMarks == null ? (
                                              <span className="font-medium text-slate-400">Pending</span>
                                            ) : Number(component.weightedMarks).toFixed(2)}
                                          </td>
                                        ))}
                                        <td className="px-3 py-3 text-center font-extrabold text-primary-700 dark:text-primary-400">
                                          {Number(breakdown.weightedTotal ?? (breakdown.components || breakdown.categories || []).reduce((sum, component) => sum + (Number(component.weightedMarks) || 0), 0)).toFixed(2)}
                                          <span className="font-medium text-slate-400"> / {breakdown.totalWeight}</span>
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-slate-800 dark:to-slate-800 font-bold text-slate-900 dark:text-slate-100">
                      <td colSpan="2" className="px-3 py-3">TERM SUMMARY</td>
                      <td className="px-3 py-3 text-center">{current.totalCredits}</td>
                      <td colSpan="2" className="px-3 py-3 text-right">TERM GPA:</td>
                      <td className="px-3 py-3 text-center"><Badge color="emerald" size="lg">{current.gpa}</Badge></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Results;

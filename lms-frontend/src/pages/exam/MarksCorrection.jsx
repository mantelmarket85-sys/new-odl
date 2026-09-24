import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Send, Download, RefreshCw, Table2, ListChecks, Layers, Lock, FileCheck2, GraduationCap } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import StatusBadge from "../../components/common/StatusBadge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import CascadeFilters, { emptyCascade, ALL } from "../../components/common/CascadeFilters";

const num = (v, d = 0) => (v === undefined || v === null || v === "" ? d : Number(v));
const norm = (v) => (v && v !== ALL ? v : "");

const ExamMarksCorrection = () => {
  const { toast } = useToast();
  const pathTab = typeof window !== "undefined" && window.location.pathname.includes("result-archive")
    ? "archive"
    : (typeof window !== "undefined" && window.location.pathname.includes("result-finalizing")
      ? "publish"
      : (typeof window !== "undefined" && window.location.pathname.includes("results-collection")
        ? "collection"
        : "compilation"));
  const [tab, setTab] = useState(pathTab); // compilation | collection | unofficial | publish | archive

  /* ------------------------------------------------------------------ */
  /* RESULTS COMPILATION VIEW (real-time teacher-uploaded results)        */
  /* 1.4 — cascading smart filters via reusable CascadeFilters.           */
  /* ------------------------------------------------------------------ */
  const [cascade, setCascade] = useState(emptyCascade()); // dept→program→semester→section→course
  const [statusF, setStatusF] = useState("all");
  const [cmpData, setCmpData] = useState(null);
  const [cmpLoading, setCmpLoading] = useState(false);
  const [cmpErr, setCmpErr] = useState("");
  const [cmpSearch, setCmpSearch] = useState("");
  const [compilingScope, setCompilingScope] = useState(false);
  const [lastCompile, setLastCompile] = useState(null);
  const [finalizing, setFinalizing] = useState(false);

  const buildParams = useCallback(() => {
    const q = new URLSearchParams();
    if (norm(cascade.department)) q.set("department", cascade.department);
    if (norm(cascade.program)) q.set("program", cascade.program);
    if (norm(cascade.semester)) q.set("semester", cascade.semester);
    if (norm(cascade.section)) q.set("section", cascade.section);
    if (statusF && statusF !== "all") q.set("status", statusF);
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [cascade, statusF]);

  const loadCompilation = useCallback(async () => {
    setCmpLoading(true); setCmpErr("");
    try {
      const res = await api.exam.compilationResults(buildParams());
      setCmpData(res);
    } catch (e) { setCmpErr(e?.message || "Failed to load results"); setCmpData(null); }
    finally { setCmpLoading(false); }
  }, [buildParams]);

  // Re-load whenever the cascade / status filter changes (real-time filtering)
  // while on the compilation tab.
  useEffect(() => { if (tab === "compilation" || tab === "unofficial" || tab === "publish" || tab === "archive") loadCompilation(); }, [tab, loadCompilation]);

  const cmpRows = useMemo(() => {
    const rows = cmpData?.results || [];
    if (!cmpSearch.trim()) return rows;
    const q = cmpSearch.toLowerCase();
    return rows.filter((r) => [r.student, r.course, r.roll].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [cmpData, cmpSearch]);

  const compileScope = async () => {
    const program = norm(cascade.program);
    const semester = norm(cascade.semester);
    const section = norm(cascade.section);
    const department = norm(cascade.department);
    if (!department || !program || !semester) {
      toast?.("Select Department, Program and Semester to compile submitted teacher results", { type: "warning" });
      return;
    }
    if (!confirm(`Compile submitted results for ${department} / ${program} / Semester ${semester} into Results Collection?`)) return;
    setCompilingScope(true);
    try {
      const res = await api.exam.compileResults({ department, program, semester });
      setLastCompile(res);
      toast?.(`Compiled ${res.students || res.compiled} student(s) into Results Collection`, { type: "success" });
      await loadCompilation();
    } catch (e) { toast?.(e?.message || "Compilation failed", { type: "error" }); }
    finally { setCompilingScope(false); }
  };

  const unofficialScope = async () => {
    const department = norm(cascade.department); const program = norm(cascade.program); const semester = norm(cascade.semester);
    if (!department || !program || !semester) { toast?.("Select Department, Program and Semester before unofficial declaration", { type: "warning" }); return; }
    setFinalizing(true);
    try {
      const res = await api.exam.declareUnofficial({ department, program, semester });
      toast?.(`Unofficial result declared for ${res.students} student(s)`, { type: "success" });
      await loadCompilation();
    } catch (e) { toast?.(e?.message || "Unofficial declaration failed", { type: "error" }); }
    finally { setFinalizing(false); }
  };

  const finalizeScope = async () => {
    const department = norm(cascade.department); const program = norm(cascade.program); const semester = norm(cascade.semester);
    if (!department || !program || !semester) { toast?.("Select Department, Program and Semester before official finalization", { type: "warning" }); return; }
    setFinalizing(true);
    try { await api.exam.finalizeResults({ department, program, semester }); toast?.("Scope officially finalized. Declare official results to archive.", { type: "success" }); await loadCompilation(); reload(); }
    catch (e) { toast?.(e?.message || "Finalization failed", { type: "error" }); }
    finally { setFinalizing(false); }
  };

  /* ------------------------------------------------------------------ */
  /* PUBLISH VIEW (existing functionality, preserved)                    */
  /* ------------------------------------------------------------------ */
  const { data, loading, error, reload } = useApi(() => api.exam.results(), []);
  const results = useMemo(() => data?.results || [], [data]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [publishingScope, setPublishingScope] = useState(false);

  const filtered = useMemo(() => results.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return [r.student, r.course].filter(Boolean).some((v) => v.toLowerCase().includes(q));
    }
    return true;
  }), [results, statusFilter, search]);

  const stats = useMemo(() => ({
    total: results.length,
    draft: results.filter((r) => r.status === "DRAFT").length,
    published: results.filter((r) => r.status === "PUBLISHED").length,
  }), [results]);

  const publishScope = async () => {
    const department = norm(cascade.department); const program = norm(cascade.program); const semester = norm(cascade.semester);
    if (!department || !program || !semester) { toast?.("Select Department, Program and Semester before publishing", { type: "warning" }); return; }
    setPublishingScope(true);
    try { const res = await api.exam.publishResults({ department, program, semester }); toast?.(`Official result declared and archived for ${res.students || res.published} student(s)`, { type: "success" }); reload(); await loadCompilation(); }
    catch (e) { toast?.(e?.message || "Publishing failed", { type: "error" }); }
    finally { setPublishingScope(false); }
  };

  const publish = async (id) => {
    setBusy(true);
    try {
      await api.exam.publishResult(id);
      toast?.("Result published to student", { type: "success" });
      reload();
    } catch (e) { toast?.(e?.message || "Failed", { type: "error" }); } finally { setBusy(false); }
  };

  /* ------------------------------------------------------------------ */
  /* MARKS COLLECTION ENGINE                                             */
  /* ------------------------------------------------------------------ */
  const { data: offData, loading: offLoading } = useApi(() => api.exam.offerings(), []);
  const offerings = useMemo(() => offData?.offerings || [], [offData]);
  const [offeringId, setOfferingId] = useState("");
  const [collectionCascade, setCollectionCascade] = useState(emptyCascade());
  const collectionOfferings = useMemo(() => offerings.filter((o) => {
    if (norm(collectionCascade.department) && o.department !== collectionCascade.department) return false;
    if (norm(collectionCascade.program) && o.program !== collectionCascade.program) return false;
    if (norm(collectionCascade.semester) && String(o.semester) !== String(collectionCascade.semester)) return false;
    if (norm(collectionCascade.section) && o.section !== collectionCascade.section) return false;
    return true;
  }), [offerings, collectionCascade]);
  const [sheet, setSheet] = useState(null);   // { offering, weights, rows }
  const [rows, setRows] = useState([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetErr, setSheetErr] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [mSearch, setMSearch] = useState("");

  const loadSheet = useCallback(async (id) => {
    if (!id) return;
    setSheetLoading(true); setSheetErr("");
    try {
      const res = await api.exam.marksheet(id);
      setSheet(res);
      setRows((res.rows || []).map((r) => ({ ...r })));
    } catch (e) {
      setSheetErr(e?.message || "Failed to load marksheet");
      setSheet(null); setRows([]);
    } finally { setSheetLoading(false); }
  }, []);

  useEffect(() => { if (offeringId) loadSheet(offeringId); }, [offeringId, loadSheet]);

  const weights = sheet?.weights || {};
  const creditHours = sheet?.offering?.creditHours || 3;

  const livePercent = (r) => {
    const parts = [
      [num(r.assignmentMarks), num(r.assignmentMax, 100), num(weights.assignmentWeight)],
      [num(r.quizMarks), num(r.quizMax, 100), num(weights.quizWeight)],
      [num(r.midMarks), num(r.midMax, 100), num(weights.midWeight)],
      [num(r.finalMarks), num(r.finalMax, 100), num(weights.finalWeight)],
    ];
    let pct = 0, wsum = 0;
    for (const [m, mx, w] of parts) {
      if (w > 0 && mx > 0) { pct += (m / mx) * w; wsum += w; }
    }
    return wsum > 0 ? (pct / wsum) * 100 : 0;
  };

  const mFiltered = useMemo(() => {
    if (!mSearch.trim()) return rows;
    const q = mSearch.toLowerCase();
    return rows.filter((r) => [r.name, r.roll, r.studentId].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [rows, mSearch]);

  const isLockedRow = (r) => r.status === "PUBLISHED" || r.status === "LOCKED" || r.status === "FROZEN";

  const compile = async () => {
    if (!offeringId) return;
    setCompiling(true);
    try {
      const res = await api.exam.compileMarks(offeringId);
      toast?.(`Compiled ${res?.compiled ?? 0} student(s) from gradebook (assignments: ${res?.source?.assignments ?? 0}, quizzes: ${res?.source?.quizzes ?? 0})`, { type: "success" });
      await loadSheet(offeringId);
      reload();
    } catch (e) {
      toast?.(e?.message || "Failed to compile from gradebook", { type: "error" });
    } finally { setCompiling(false); }
  };

  const COMPONENTS = [
    { key: "assignment", label: "Assignment", w: weights.assignmentWeight },
    { key: "quiz", label: "Quiz", w: weights.quizWeight },
    { key: "mid", label: "Mid", w: weights.midWeight },
    { key: "final", label: "Final", w: weights.finalWeight },
  ];

  const TabBtn = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition ${tab === id ? "bg-primary-600 text-white" : "surface border border-app text-app"}`}
    >
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Result Lifecycle"
        subtitle="Department → Program → Semester compilation of teacher-submitted results. Unofficial declaration, official finalization, then read-only archive. No role can edit locked marks."
        icon="Layers"
        breadcrumb={["Exam Controller", "Result Lifecycle"]}
      />

      {/* TAB SWITCHER */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <TabBtn id="compilation" icon={Layers} label="Results Compilation" />
        <TabBtn id="collection" icon={Table2} label="Results Collection" />
        <TabBtn id="unofficial" icon={Send} label="Unofficial Declaration" />
        <TabBtn id="publish" icon={ListChecks} label="Official Declaration" />
        <TabBtn id="archive" icon={Lock} label="Archive" />
      </div>

      {/* ============================= COMPILATION TAB ============================= */}
      {(tab === "compilation" || tab === "unofficial") && (
        <div className="space-y-4">
          {/* 1.4 — reusable cascading smart filters */}
          <CascadeFilters
            value={cascade}
            onChange={setCascade}
            fields={["department", "program", "semester", "section"]}
          />

          <div className="card-base p-3 flex flex-wrap items-center gap-2">
            <button onClick={loadCompilation} disabled={cmpLoading} className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2 disabled:opacity-50">
              <RefreshCw size={14} className={cmpLoading ? "animate-spin" : ""} /> Reload
            </button>
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="input-base text-sm py-2">
              <option value="all">All Status</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="COMPILED">Compiled</option>
              <option value="UNOFFICIAL_DECLARED">Unofficial</option>
              <option value="OFFICIAL_FINALIZED">Official</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <div className="ml-auto">
              <div className="flex gap-2">
                <button onClick={compileScope} disabled={compilingScope} className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50"><Layers size={14} /> {compilingScope ? "Compiling…" : "Compile to Results Collection"}</button>
                <button onClick={unofficialScope} disabled={finalizing} className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50"><Send size={14} /> Declare Unofficial</button>
                <button onClick={finalizeScope} disabled={finalizing || !norm(cascade.department) || !norm(cascade.program) || !norm(cascade.semester)} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50"><Lock size={14} /> {finalizing ? "Finalizing…" : "Official Finalize"}</button>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-app -mt-1">
            Only teacher-submitted courses compile. Flow: Results Collection → Unofficial declaration → Official finalize → Archive. No role can edit after submit.
          </p>

          {/* §1.4.2 / §1.5 — surface the auto-Gazette + transcript flow after compile */}
          {lastCompile && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card-base p-4 border-l-4 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2 mb-2"><FileCheck2 size={16} /> Compilation complete — available in Results Collection</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="surface border border-app rounded-lg p-2.5"><p className="text-[10px] uppercase text-muted-app">Offerings</p><p className="font-bold text-app">{lastCompile.offerings}</p></div>
                <div className="surface border border-app rounded-lg p-2.5"><p className="text-[10px] uppercase text-muted-app">Results Compiled</p><p className="font-bold text-app">{lastCompile.compiled}</p></div>
                <div className="surface border border-app rounded-lg p-2.5"><p className="text-[10px] uppercase text-muted-app inline-flex items-center gap-1"><GraduationCap size={11} /> Workflow Stage</p><p className="font-bold text-app">Results Collection</p></div>
                <div className="surface border border-app rounded-lg p-2.5">
                  <p className="text-[10px] uppercase text-muted-app inline-flex items-center gap-1"><FileCheck2 size={11} /> Auto-Gazette</p>
                  {lastCompile.gazette
                    ? <p className="font-bold text-app truncate" title={lastCompile.gazette.title}>{lastCompile.gazette.title} <span className="font-normal text-muted-app">({lastCompile.gazette.totalStudents} students)</span></p>
                    : <p className="font-semibold text-muted-app">Not created (no rows)</p>}
                </div>
              </div>
              <p className="text-[11px] text-muted-app mt-2">Review in Results Collection, declare unofficial, then official finalize and archive.</p>
            </motion.div>
          )}

          {/* Stats */}
          {cmpData && (
            <div className="grid grid-cols-3 gap-3">
              <StatCard title="Results in Scope" value={cmpData.total} icon="ClipboardList" color="blue" />
              <StatCard title="Draft (Editable)" value={cmpData.draft} icon="Edit3" color="amber" delay={0.05} />
              <StatCard title="Published (Locked)" value={cmpData.published} icon="Lock" color="emerald" delay={0.1} />
            </div>
          )}

          {/* Search */}
          <div className="card-base p-3">
            <div className="relative w-full sm:max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={cmpSearch} onChange={(e) => setCmpSearch(e.target.value)} placeholder="Search student / roll / course…" className="input-base w-full pl-9 text-sm" />
            </div>
          </div>

          {/* Table */}
          {cmpErr ? (
            <ErrorState message={cmpErr} onRetry={loadCompilation} />
          ) : cmpLoading ? (
            <Skeleton className="h-96" />
          ) : cmpRows.length === 0 ? (
            <EmptyState message="No results found for the selected filters. Teacher-uploaded results appear here in real time." />
          ) : (
            <div className="card-base overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="surface border-b border-app">
                    <tr>
                      {["Roll", "Student", "Program", "Sem", "Sec", "Course", "Assign", "Quiz", "Mid", "Final", "Total %", "Grade", "Status"].map((h) => (
                        <th key={h} className="px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {cmpRows.map((r, i) => (
                      <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.01, 0.3) }} className="hover:surface">
                        <td className="px-2.5 py-1.5 font-mono text-app">{r.roll || "—"}</td>
                        <td className="px-2.5 py-1.5 font-semibold text-app whitespace-nowrap">{r.student}</td>
                        <td className="px-2.5 py-1.5 text-app">{r.program || "—"}</td>
                        <td className="px-2.5 py-1.5 text-app text-center">{r.semester || "—"}</td>
                        <td className="px-2.5 py-1.5 text-app text-center">{r.section || "—"}</td>
                        <td className="px-2.5 py-1.5 text-app whitespace-nowrap">{r.course || "—"}</td>
                        <td className="px-2.5 py-1.5 text-app text-center">{r.assignmentMarks ?? "—"}</td>
                        <td className="px-2.5 py-1.5 text-app text-center">{r.quizMarks ?? "—"}</td>
                        <td className="px-2.5 py-1.5 text-app text-center">{r.midMarks ?? "—"}</td>
                        <td className="px-2.5 py-1.5 text-app text-center">{r.finalMarks ?? "—"}</td>
                        <td className="px-2.5 py-1.5 font-bold text-app text-center">{r.totalPercent?.toFixed?.(1) ?? r.totalPercent ?? "—"}</td>
                        <td className="px-2.5 py-1.5 text-center"><span className="font-bold px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300">{r.letterGrade || "—"}</span></td>
                        <td className="px-2.5 py-1.5">
                          <span className="inline-flex items-center gap-1">
                            <StatusBadge status={r.status} />
                            {r.status === "PUBLISHED" && <Lock size={11} className="text-emerald-600 dark:text-emerald-400" title="Locked — marks finalized" />}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================= COLLECTION TAB ============================= */}
      {tab === "collection" && (
        <div className="space-y-4">
          <CascadeFilters value={collectionCascade} onChange={(next) => { setCollectionCascade(next); setOfferingId(""); setSheet(null); setRows([]); }} fields={["department", "program", "semester", "section"]} />
          <div className="card-base p-4">
            <div className="grid md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Select Course Offering</label>
                <select
                  value={offeringId}
                  onChange={(e) => setOfferingId(e.target.value)}
                  className="input-base w-full text-sm"
                  disabled={offLoading}
                >
                  <option value="">{offLoading ? "Loading offerings…" : "— Choose an offering —"}</option>
                  {collectionOfferings.map((o) => <option key={o.id} value={o.id}>{o.label}{o.section ? ` · Section ${o.section}` : ""}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => loadSheet(offeringId)}
                  disabled={!offeringId || sheetLoading}
                  className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={sheetLoading ? "animate-spin" : ""} /> Reload
                </button>
                <button
                  onClick={compile}
                  disabled={!offeringId || compiling || sheetLoading}
                  className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2 disabled:opacity-50"
                  title="Import assignment & quiz marks from the teacher gradebook"
                >
                  <Download size={14} /> {compiling ? "Compiling…" : "Compile from Gradebook"}
                </button>
              </div>
            </div>
            {sheet?.offering && (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-1 rounded-full surface border border-app text-app">Term: <b>{sheet.offering.term || "—"}</b></span>
                <span className="px-2 py-1 rounded-full surface border border-app text-app">Credits: <b>{creditHours}</b></span>
                {COMPONENTS.map((c) => (
                  <span key={c.key} className="px-2 py-1 rounded-full surface border border-app text-app">{c.label} weight: <b>{c.w}%</b></span>
                ))}
              </div>
            )}
          </div>

          {!offeringId ? (
            <EmptyState message="Select a course offering to review collected marks (read-only)." />
          ) : sheetErr ? (
            <ErrorState message={sheetErr} onRetry={() => loadSheet(offeringId)} />
          ) : sheetLoading ? (
            <Skeleton className="h-96" />
          ) : rows.length === 0 ? (
            <EmptyState message="No enrolled students found for this offering." />
          ) : (
            <>
              <div className="card-base p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
                  <input value={mSearch} onChange={(e) => setMSearch(e.target.value)} placeholder="Search student / roll…" className="input-base w-full pl-9 text-sm" />
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"><Lock size={12} /> Read-only review — Exam Controller cannot edit marks</span>
              </div>

              <div className="card-base overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="surface border-b border-app">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app sticky left-0 surface">Student</th>
                        {COMPONENTS.map((c) => (
                          <th key={c.key} className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-app" colSpan={2}>{c.label} <span className="font-normal normal-case">({c.w}%)</span></th>
                        ))}
                        <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-app">Total %</th>
                        <th className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-muted-app">Status</th>
                      </tr>
                      <tr className="surface border-b border-app">
                        <th className="px-3 py-1 sticky left-0 surface"></th>
                        {COMPONENTS.map((c) => (
                          <Fragment key={c.key}>
                            <th className="px-1 py-1 text-[9px] text-muted-app font-medium">Marks</th>
                            <th className="px-1 py-1 text-[9px] text-muted-app font-medium">Max</th>
                          </Fragment>
                        ))}
                        <th className="px-2 py-1 text-[9px] text-muted-app">Preview</th>
                        <th className="px-2 py-1"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app">
                      {mFiltered.map((r) => {
                        const pct = livePercent(r);
                        const locked = isLockedRow(r);
                        return (
                          <tr key={r.studentId} className="hover:surface">
                            <td className="px-3 py-1.5 sticky left-0 bg-[var(--surface-bg,#fff)] dark:bg-slate-900">
                              <div className="font-semibold text-app whitespace-nowrap">{r.name}</div>
                              <div className="text-[10px] text-muted-app">{r.roll}</div>
                            </td>
                            {["assignment", "quiz", "mid", "final"].map((k) => (
                              <Fragment key={k}>
                                <td className="px-1 py-1.5 text-center font-mono text-app">{r[`${k}Marks`]}</td>
                                <td className="px-1 py-1.5 text-center font-mono text-muted-app">{r[`${k}Max`]}</td>
                              </Fragment>
                            ))}
                            <td className="px-2 py-1.5 text-center font-bold text-app">{pct.toFixed(1)}%</td>
                            <td className="px-2 py-1.5 text-center">
                              {r.status && r.status !== "NONE" ? <StatusBadge status={r.status} /> : <span className="text-[10px] text-muted-app">New</span>}
                              {locked && <span className="text-[9px] text-emerald-600 mt-0.5 inline-flex items-center gap-0.5 justify-center"><Lock size={9} /> locked</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-[11px] text-muted-app">
                Marks are collected from the assigned teacher's gradebook. Exam Controller access is strictly <b>read-only</b> at every workflow stage.
              </p>
            </>
          )}
        </div>
      )}

      {/* ============================= PUBLISH TAB ============================= */}
      {tab === "publish" && (
        error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <Skeleton className="h-96" />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
              <StatCard title="Total Results" value={stats.total} icon="ClipboardList" color="blue" delay={0.05} />
              <StatCard title="Unofficial / Pending Official" value={stats.draft} icon="Edit3" color="amber" delay={0.1} />
              <StatCard title="Official / Archived" value={stats.published} icon="CheckCircle2" color="emerald" delay={0.15} />
            </div>

            <CascadeFilters value={cascade} onChange={setCascade} fields={["department", "program", "semester"]} />
            <div className="card-base p-4 mb-5">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student / course…" className="input-base w-full pl-9 text-sm" />
                </div>
                <div className="flex gap-2"><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-base text-sm flex-1">
                  <option value="all">All Status</option>
                  <option value="UNOFFICIAL_DECLARED">Unofficial</option>
                  <option value="OFFICIAL_FINALIZED">Official finalized</option>
                  <option value="ARCHIVED">Archived</option>
                </select><button onClick={publishScope} disabled={publishingScope || !norm(cascade.department) || !norm(cascade.program) || !norm(cascade.semester)} className="btn-primary text-sm px-3 disabled:opacity-50">{publishingScope ? "Declaring…" : "Declare Official & Archive"}</button></div>
              </div>
            </div>

            <div className="card-base overflow-hidden">
              {filtered.length === 0 ? <EmptyState message="No results match your filters." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="surface border-b border-app">
                      <tr>
                        {["Student", "Course", "Total %", "Grade", "GP", "Status", "Action"].map((h) => (
                          <th key={h} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app">
                      {filtered.map((r, i) => (
                        <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.4) }} className="hover:surface">
                          <td className="px-4 py-2 text-xs font-semibold text-app">{r.student}</td>
                          <td className="px-4 py-2 text-xs text-app">{r.course}</td>
                          <td className="px-4 py-2 text-xs font-bold text-app">{r.totalPercent?.toFixed?.(2) ?? r.totalPercent}</td>
                          <td className="px-4 py-2 text-xs"><span className="font-bold px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300">{r.letterGrade}</span></td>
                          <td className="px-4 py-2 text-xs text-app">{r.gradePoints}</td>
                          <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                          <td className="px-4 py-2">
                            {r.status === "DRAFT" && (
                              <button disabled={busy} onClick={() => publish(r.id)} className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50">
                                <Send size={11} /> Publish
                              </button>
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
};

export default ExamMarksCorrection;
ksCorrection;

import { useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Download, RefreshCw, FileCheck2, Send, Trash2, Hammer, GraduationCap, ShieldCheck } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import StatusBadge from "../../components/common/StatusBadge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import CascadeFilters, { emptyCascade, applyCascade, ALL } from "../../components/common/CascadeFilters";

const norm = (v) => (v && v !== ALL ? v : "");

const ExamGazette = () => {
  const { toast } = useToast();

  /* ---- Cascading filters (reusable) ---- */
  const [cascade, setCascade] = useState(emptyCascade());

  /* ---- Gazette list ---- */
  const { data: gzData, loading: gzLoading, error: gzError, reload: reloadGz } = useApi(() => api.exam.gazettes(), []);
  const allGazettes = useMemo(() => gzData?.gazettes || [], [gzData]);

  // Client-side cascade filter over the built gazettes.
  const gazettes = useMemo(
    () => applyCascade(allGazettes, cascade, (g) => ({
      department: g.department,
      program: g.programShortForm || g.program,
      semester: g.semester,
      section: g.section,
    })),
    [allGazettes, cascade]
  );

  /* ---- Live preview (report gazette) ---- */
  const { data: previewData, loading: pvLoading } = useApi(() => api.exam.report("gazette"), []);
  const previewRows = useMemo(() => previewData?.rows || [], [previewData]);

  /* ---- Auto-generated transcripts (verify §1.5 automatic transcript generation) ---- */
  const { data: trData, loading: trLoading, error: trError, reload: reloadTr } = useApi(() => api.exam.transcripts(), []);
  const transcripts = useMemo(() => trData?.transcripts || [], [trData]);

  const [busy, setBusy] = useState(false);

  const scopeParams = useCallback(() => {
    const q = new URLSearchParams();
    if (norm(cascade.program)) q.set("program", norm(cascade.program));
    if (norm(cascade.semester)) q.set("semester", norm(cascade.semester));
    if (norm(cascade.section)) q.set("section", norm(cascade.section));
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [cascade]);

  const refreshAll = useCallback(() => { reloadGz(); reloadTr(); }, [reloadGz, reloadTr]);

  const build = async () => {
    setBusy(true);
    try {
      const res = await api.exam.buildGazette({
        department: norm(cascade.department) || undefined,
        program: norm(cascade.program) || undefined,
        semester: norm(cascade.semester) || undefined,
        section: norm(cascade.section) || undefined,
      });
      toast?.(`Gazette built — ${res.gazette.totalStudents} student(s), ${res.gazette.passCount} pass`, { type: "success" });
      refreshAll();
    } catch (e) { toast?.(e?.message || "Failed to build gazette", { type: "error" }); } finally { setBusy(false); }
  };

  const approve = async (id) => {
    setBusy(true);
    try { await api.exam.approveGazette(id); toast?.("Gazette approved", { type: "success" }); reloadGz(); }
    catch (e) { toast?.(e?.message || "Failed", { type: "error" }); } finally { setBusy(false); }
  };
  const publish = async (id) => {
    if (!confirm("Publish this gazette? It can only be published after approval, and this finalizes results for the scope.")) return;
    setBusy(true);
    try {
      await api.exam.publishGazette(id);
      toast?.("Gazette published — student transcripts are generated automatically from the published results.", { type: "success" });
      refreshAll();
    }
    catch (e) { toast?.(e?.message || "Failed", { type: "error" }); } finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!confirm("Delete this gazette record?")) return;
    setBusy(true);
    try { await api.exam.deleteGazette(id); toast?.("Deleted", { type: "success" }); reloadGz(); }
    catch (e) { toast?.(e?.message || "Failed", { type: "error" }); } finally { setBusy(false); }
  };

  const downloadScope = async () => {
    try {
      const p = norm(cascade.program), s = norm(cascade.semester), sec = norm(cascade.section);
      const name = `gazette${p ? `-${p}` : ""}${s ? `-sem${s}` : ""}${sec ? `-${sec}` : ""}.csv`;
      await api.exam.downloadGazette(scopeParams(), name);
      toast?.("Gazette downloaded", { type: "success" });
    } catch (e) { toast?.(e?.message || "Download failed", { type: "error" }); }
  };

  const stats = useMemo(() => ({
    entries: previewRows.length,
    pass: previewRows.filter((r) => r.status === "PASS").length,
    fail: previewRows.filter((r) => r.status !== "PASS").length,
    transcripts: transcripts.length,
  }), [previewRows, transcripts]);

  const anyPublished = useMemo(() => gazettes.some((g) => g.status === "PUBLISHED"), [gazettes]);

  return (
    <div>
      <PageHeader
        title="Gazette Review"
        subtitle="Build, review, approve and publish official semester result gazettes. Publishing auto-generates verifiable student transcripts."
        icon="BookCheck"
        breadcrumb={["Exam Controller", "Gazette Review"]}
        actions={<button onClick={downloadScope} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2"><Download size={14} /> Download Gazette</button>}
      />

      {/* Cascading filters */}
      <div className="card-base p-4 mb-4">
        <CascadeFilters
          value={cascade}
          onChange={setCascade}
          fields={["department", "program", "semester", "section"]}
          extraRows={allGazettes}
          rowMap={(g) => ({ department: g.department, program: g.programShortForm || g.program, semester: g.semester, section: g.section })}
          showReset
        />
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button onClick={build} disabled={busy} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50"><Hammer size={14} /> Build Gazette (Scope)</button>
          <button onClick={downloadScope} className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2"><Download size={14} /> Download (Scope)</button>
          <button onClick={refreshAll} disabled={gzLoading || trLoading} className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2 disabled:opacity-50"><RefreshCw size={13} className={(gzLoading || trLoading) ? "animate-spin" : ""} /> Refresh</button>
        </div>
      </div>

      {anyPublished && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-4 p-3 rounded-xl border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <ShieldCheck size={16} /> A gazette in this scope is <b>PUBLISHED</b>. Results are finalized and verifiable transcripts have been auto-issued (see the Transcripts panel below).
        </motion.div>
      )}

      {/* Stats from live published results */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard title="Published Entries" value={stats.entries} icon="BookCheck" color="blue" delay={0.05} />
        <StatCard title="Passes" value={stats.pass} icon="CheckCircle2" color="emerald" delay={0.1} />
        <StatCard title="Fails" value={stats.fail} icon="XCircle" color="rose" delay={0.15} />
        <StatCard title="Transcripts Issued" value={stats.transcripts} icon="GraduationCap" color="purple" delay={0.2} />
      </div>

      {/* Gazette records */}
      <div className="card-base overflow-hidden mb-6">
        <div className="p-4 border-b border-app flex items-center justify-between">
          <h3 className="font-display font-bold text-app text-base">Compiled Gazettes {gazettes.length !== allGazettes.length && <span className="text-xs font-normal text-muted-app">({gazettes.length} of {allGazettes.length} in scope)</span>}</h3>
          <button onClick={reloadGz} disabled={gzLoading} className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1.5 disabled:opacity-50"><RefreshCw size={12} className={gzLoading ? "animate-spin" : ""} /> Refresh</button>
        </div>
        {gzError ? (
          <ErrorState message={gzError} onRetry={reloadGz} />
        ) : gzLoading ? (
          <Skeleton className="h-40" />
        ) : gazettes.length === 0 ? (
          <EmptyState message={allGazettes.length === 0 ? "No gazettes built yet. Compile results (Result Compilation) or use Build Gazette to create one from published results." : "No gazettes match the current filters. Adjust or reset the filters above."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="surface border-b border-app">
                <tr>
                  {["Title", "Dept", "Program", "Sem", "Sec", "Students", "Pass / Fail", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {gazettes.map((g, i) => (
                  <motion.tr key={g.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.3) }} className="hover:surface">
                    <td className="px-3 py-2 text-xs font-semibold text-app whitespace-nowrap">{g.title}</td>
                    <td className="px-3 py-2 text-xs text-app">{g.department || "—"}</td>
                    <td className="px-3 py-2 text-xs text-app">{g.programShortForm || g.program || "—"}</td>
                    <td className="px-3 py-2 text-xs text-app text-center">{g.semester || "—"}</td>
                    <td className="px-3 py-2 text-xs text-app text-center">{g.section || "—"}</td>
                    <td className="px-3 py-2 text-xs text-app text-center">{g.totalStudents}</td>
                    <td className="px-3 py-2 text-xs text-app text-center">{g.passCount} / {g.failCount}</td>
                    <td className="px-3 py-2"><StatusBadge status={g.status} /></td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {g.status === "DRAFT" && (
                          <button disabled={busy} onClick={() => approve(g.id)} className="px-2 py-1 rounded-lg bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"><FileCheck2 size={11} /> Approve</button>
                        )}
                        {g.status === "APPROVED" && (
                          <button disabled={busy} onClick={() => publish(g.id)} className="px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"><Send size={11} /> Publish</button>
                        )}
                        {g.status === "PUBLISHED" && (
                          <span className="text-[11px] text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Published</span>
                        )}
                        <button disabled={busy} onClick={() => remove(g.id)} className="p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-600 disabled:opacity-50" title="Delete"><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Auto-generated transcripts — verifies §1.5 automatic transcript generation */}
      <div className="card-base overflow-hidden mb-6">
        <div className="p-4 border-b border-app flex items-center justify-between">
          <h3 className="font-display font-bold text-app text-base inline-flex items-center gap-2"><GraduationCap size={16} className="text-purple-500" /> Auto-Generated Transcripts</h3>
          <button onClick={reloadTr} disabled={trLoading} className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1.5 disabled:opacity-50"><RefreshCw size={12} className={trLoading ? "animate-spin" : ""} /> Refresh</button>
        </div>
        {trError ? (
          <ErrorState message={trError} onRetry={reloadTr} />
        ) : trLoading ? (
          <Skeleton className="h-32" />
        ) : transcripts.length === 0 ? (
          <EmptyState message="No transcripts issued yet. Transcripts are generated automatically when results are compiled/published." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="surface border-b border-app">
                <tr>
                  {["Student", "Verification Code", "Kind", "CGPA", "Credits", "Status", "Issued"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {transcripts.map((t) => (
                  <tr key={t.id} className="hover:surface">
                    <td className="px-4 py-2 text-xs font-semibold text-app">{t.student}</td>
                    <td className="px-4 py-2 text-xs font-mono text-primary-600 dark:text-primary-300">{t.verificationCode}</td>
                    <td className="px-4 py-2 text-xs text-app">{t.kind}</td>
                    <td className="px-4 py-2 text-xs font-bold text-app">{t.cgpa}</td>
                    <td className="px-4 py-2 text-xs text-app">{t.totalCredits}</td>
                    <td className="px-4 py-2"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-2 text-xs text-muted-app">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live preview of published results */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-base overflow-hidden">
        <div className="p-4 border-b border-app">
          <h3 className="font-display font-bold text-app text-base">{previewData?.term || "Current Term"} — Published Result Preview</h3>
        </div>
        {pvLoading ? <Skeleton className="h-40" /> : previewRows.length === 0 ? <EmptyState message="No published results in the gazette yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="surface border-b border-app">
                <tr>
                  {["Student", "Course", "Percent", "Grade", "GP", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {previewRows.map((r, i) => (
                  <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.4) }} className="hover:surface">
                    <td className="px-4 py-2 text-xs font-semibold text-app">{r.student}</td>
                    <td className="px-4 py-2 text-xs text-app">{r.course}</td>
                    <td className="px-4 py-2 text-xs font-bold text-app">{r.percent?.toFixed?.(2) ?? r.percent}</td>
                    <td className="px-4 py-2 text-xs"><span className="font-bold px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300">{r.grade}</span></td>
                    <td className="px-4 py-2 text-xs text-app">{r.gp}</td>
                    <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ExamGazette;

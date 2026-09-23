import { useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Search, Download, MessageSquare, Send, RefreshCw } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import StatusBadge from "../../components/common/StatusBadge";
import Modal from "../../components/common/Modal";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import CascadeFilters, { emptyCascade, applyCascade } from "../../components/common/CascadeFilters";

const ExamIncomplete = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.exam.report("incomplete"), []);
  const rows = useMemo(() => data?.rows || [], [data]);
  const [search, setSearch] = useState("");
  const [cascade, setCascade] = useState(emptyCascade());

  /* ---- Quick Messages ---- */
  const [showMsg, setShowMsg] = useState(false);
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [msgBody, setMsgBody] = useState("Reminder: please upload/finalise the pending marks for your course(s) at the earliest so results can be compiled.");
  const [sending, setSending] = useState(false);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await api.exam.pendingTeachers();
      setPending(res.teachers || []);
    } catch (e) { toast?.(e?.message || "Failed to load pending teachers", { type: "error" }); }
    finally { setPendingLoading(false); }
  }, [toast]);

  const openMessages = () => { setShowMsg(true); setSelectedTeacher(""); loadPending(); };

  const sendMessage = async () => {
    if (!selectedTeacher) { toast?.("Select a teacher", { type: "warning" }); return; }
    if (!msgBody.trim()) { toast?.("Message cannot be empty", { type: "warning" }); return; }
    setSending(true);
    try {
      await api.exam.sendQuickMessage({ recipientId: selectedTeacher, subject: "Pending marks reminder", body: msgBody.trim() });
      toast?.("Reminder sent to teacher", { type: "success" });
      setSelectedTeacher("");
    } catch (e) { toast?.(e?.message || "Failed to send", { type: "error" }); }
    finally { setSending(false); }
  };

  const sendAll = async () => {
    if (!pending.length) { toast?.("No teachers with pending marks", { type: "info" }); return; }
    if (!confirm(`Send a reminder to all ${pending.length} teacher(s) with pending marks?`)) return;
    setSending(true);
    let ok = 0;
    try {
      for (const t of pending) {
        try {
          await api.exam.sendQuickMessage({ recipientId: t.teacherId, subject: "Pending marks reminder", body: msgBody.trim() });
          ok += 1;
        } catch { /* continue */ }
      }
      toast?.(`Reminder sent to ${ok} teacher(s)`, { type: "success" });
    } finally { setSending(false); }
  };

  const filtered = useMemo(() => {
    // 1.6 — cascading smart filters (department → program → semester, + session / batch / section)
    let list = applyCascade(rows, cascade, (r) => ({
      department: r.department,
      program: r.program,
      semester: r.semester,
      session: r.session,
      batch: r.batch,
      section: r.section,
    }));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => [r.student, r.course, r.teacher].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
    }
    return list;
  }, [rows, search, cascade]);

  const exportCsv = () => {
    if (!filtered.length) { toast?.("Nothing to export", { type: "info" }); return; }
    const headers = Object.keys(filtered[0]);
    const csv = [headers.join(","), ...filtered.map((r) => headers.map((h) => `"${r[h] ?? ""}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "incomplete-results.csv"; a.click();
    URL.revokeObjectURL(url); toast?.("Incomplete list exported", { type: "success" });
  };

  return (
    <div>
      <PageHeader
        title="Incomplete Results"
        subtitle="Course results that are not yet finalised or remain in draft state."
        icon="FileWarning"
        breadcrumb={["Exam Controller", "Incomplete"]}
        actions={
          <div className="flex gap-2">
            <button onClick={openMessages} className="btn-primary text-sm py-2 px-4 flex items-center gap-2"><MessageSquare size={14} /> Quick Messages</button>
            <button onClick={exportCsv} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2"><Download size={14} /> Export CSV</button>
          </div>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
            <StatCard title="Incomplete" value={filtered.length} icon="FileWarning" color="amber" delay={0.05} />
            <StatCard title="Courses" value={new Set(filtered.map((r) => r.course)).size} icon="BookOpen" color="blue" delay={0.1} />
            <StatCard title="Term" value={data?.term || "—"} icon="Calendar" color="purple" delay={0.15} />
          </div>

          {/* 1.6 — reusable cascading smart filters */}
          <CascadeFilters
            className="mb-4"
            value={cascade}
            onChange={setCascade}
            fields={["department", "program", "semester", "session", "batch", "section"]}
            extraRows={rows}
            rowMap={(r) => ({ department: r.department, session: r.session, batch: r.batch })}
          />

          <div className="card-base p-3 mb-5">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student / course / teacher…" className="input-base w-full pl-10 text-sm" />
            </div>
          </div>

          <div className="card-base overflow-hidden">
            {filtered.length === 0 ? <EmptyState message="No incomplete results — all results finalised." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="surface border-b border-app">
                    <tr>
                      {["Student", "Course", "Teacher", "Program", "Sem", "Section", "Session", "Status"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {filtered.map((r, i) => (
                      <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.4) }} className="hover:surface">
                        <td className="px-4 py-2 text-xs font-semibold text-app">{r.student}</td>
                        <td className="px-4 py-2 text-xs text-app">{r.course}</td>
                        <td className="px-4 py-2 text-xs text-muted-app">{r.teacher || "—"}</td>
                        <td className="px-4 py-2 text-xs text-app">{r.program || "—"}</td>
                        <td className="px-4 py-2 text-xs text-center text-app">{r.semester || "—"}</td>
                        <td className="px-4 py-2 text-xs text-center text-app">{r.section || "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-app">{r.session || "—"}</td>
                        <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* QUICK MESSAGES MODAL */}
      <Modal open={showMsg} onClose={() => setShowMsg(false)} title="Quick Messages — Pending Marks Reminders" subtitle="Notify teachers in real time about their pending / unpublished marks." icon="MessageSquare" maxWidth="max-w-lg">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-app">{pending.length} teacher(s) with pending marks</span>
            <button onClick={loadPending} disabled={pendingLoading} className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center gap-1.5 disabled:opacity-50"><RefreshCw size={12} className={pendingLoading ? "animate-spin" : ""} /> Refresh</button>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Select Teacher</label>
            <select value={selectedTeacher} onChange={(e) => setSelectedTeacher(e.target.value)} className="input-base w-full text-sm" disabled={pendingLoading}>
              <option value="">{pendingLoading ? "Loading…" : "— Choose a teacher —"}</option>
              {pending.map((t) => (
                <option key={t.teacherId} value={t.teacherId}>{t.teacher} · {t.pendingTotal} pending ({t.offerings.length} course{t.offerings.length !== 1 ? "s" : ""})</option>
              ))}
            </select>
          </div>

          {selectedTeacher && (
            <div className="card-base p-2.5 text-[11px] text-muted-app space-y-1">
              {(pending.find((t) => t.teacherId === selectedTeacher)?.offerings || []).map((o) => (
                <div key={o.offeringId} className="flex justify-between"><span className="text-app">{o.course}</span><span className="font-semibold text-amber-600">{o.pending} pending</span></div>
              ))}
            </div>
          )}

          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Message</label>
            <textarea value={msgBody} onChange={(e) => setMsgBody(e.target.value)} rows={4} className="input-base w-full text-sm" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={sendAll} disabled={sending || !pending.length} className="btn-secondary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50"><Send size={14} /> Send to All</button>
            <button onClick={sendMessage} disabled={sending || !selectedTeacher} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50"><Send size={14} /> {sending ? "Sending…" : "Send Reminder"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ExamIncomplete;

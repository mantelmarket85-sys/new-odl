// ============================================================
//  SUPPORT & GRIEVANCES — STAFF CASE DETAIL DRAWER
//  ------------------------------------------------------------
//  Slide-over panel showing a single case in full: header (code /
//  type / status / priority / SLA), student context, a tabbed body
//  (Conversation · Internal Notes · Timeline) and an action rail
//  (reply, status change, priority, assign/reassign, escalate,
//  resolve/close). Every action calls the unified staff router via
//  api.grievances.*; the server enforces which role may do what.
//
//  Reused by all six staff role pages — behaviour is identical; the
//  server scopes the data.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Icons from "lucide-react";
import api, { fileUrl } from "../../services/api";
import Badge from "../common/Badge";
import { useToast } from "../../context/ToastContext";
import {
  statusMeta, priorityMeta, PRIORITIES, caseTypeColor, actorRoleLabel,
  ROUTE_ROLE_LABEL, WORKFLOW_STATUSES, historyActionLabel, fmtDateTime, slaState,
} from "./grievanceShared";

const TABS = [
  { key: "conversation", label: "Conversation", icon: "MessagesSquare" },
  { key: "notes", label: "Internal Notes", icon: "StickyNote" },
  { key: "timeline", label: "Timeline", icon: "History" },
];

/* A small labelled control block. */
const Field = ({ label, children }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
    {children}
  </div>
);

const GrievanceCaseDrawer = ({ caseId, onClose, onChanged }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null); // { case, messages, internalNotes, history }
  const [tab, setTab] = useState("conversation");

  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const [escalateTo, setEscalateTo] = useState("");
  const [assignRole, setAssignRole] = useState("");
  const [assignReason, setAssignReason] = useState("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveStatus, setResolveStatus] = useState("RESOLVED");
  const [resolveMsg, setResolveMsg] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.grievances.case(caseId);
      setData(res);
    } catch (e) {
      setError(e.message || "Failed to load case");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (caseId) load(); }, [caseId]);

  const c = data?.case;
  const sla = useMemo(() => (c ? slaState(c) : null), [c]);
  const sm = c ? statusMeta(c.status) : null;
  const pm = c ? priorityMeta(c.priority) : null;
  const terminal = c && ["RESOLVED", "CLOSED", "REJECTED"].includes(c.status);

  const roleOptions = Object.entries(ROUTE_ROLE_LABEL);

  const afterMutate = (updatedCase) => {
    if (updatedCase) setData((d) => (d ? { ...d, case: { ...d.case, ...updatedCase } } : d));
    onChanged?.();
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const res = await api.grievances.reply(caseId, reply.trim());
      setData((d) => ({ ...d, messages: [...(d.messages || []), res.message] }));
      setReply("");
      onChanged?.();
    } catch (e) {
      toast(e.message || "Failed to send reply", { type: "error" });
    } finally { setBusy(false); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const res = await api.grievances.internalNote(caseId, note.trim());
      setData((d) => ({ ...d, internalNotes: [...(d.internalNotes || []), res.note] }));
      setNote("");
      toast("Internal note added", { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to add note", { type: "error" });
    } finally { setBusy(false); }
  };

  const changeStatus = async (status, response) => {
    setBusy(true);
    try {
      const res = await api.grievances.setStatus(caseId, status, response);
      afterMutate(res.case);
      await load();
      toast(`Case marked ${statusMeta(status).label}`, { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to update status", { type: "error" });
    } finally { setBusy(false); }
  };

  const changePriority = async (priority) => {
    setBusy(true);
    try {
      const res = await api.grievances.setPriority(caseId, priority);
      afterMutate(res.case);
      await load();
    } catch (e) {
      toast(e.message || "Failed to change priority", { type: "error" });
    } finally { setBusy(false); }
  };

  const doAssign = async () => {
    if (!assignRole) return;
    setBusy(true);
    try {
      const res = await api.grievances.assign(caseId, { targetRole: assignRole, reason: assignReason || undefined });
      afterMutate(res.case);
      await load();
      setAssignOpen(false); setAssignRole(""); setAssignReason("");
      toast("Case reassigned", { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to reassign", { type: "error" });
    } finally { setBusy(false); }
  };

  const doEscalate = async () => {
    setBusy(true);
    try {
      const res = await api.grievances.escalate(caseId, { toRole: escalateTo || undefined, reason: escalateReason || undefined });
      afterMutate(res.case);
      await load();
      setEscalateOpen(false); setEscalateReason(""); setEscalateTo("");
      toast("Case escalated", { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to escalate", { type: "error" });
    } finally { setBusy(false); }
  };

  const doResolve = async () => {
    await changeStatus(resolveStatus, resolveMsg || undefined);
    setResolveOpen(false); setResolveMsg("");
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm flex justify-end"
      >
        <motion.aside
          initial={{ x: 60, opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="h-full w-full max-w-3xl bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0">
              {loading ? (
                <div className="h-6 w-40 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              ) : c ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-primary-600 dark:text-primary-400">{c.caseCode}</span>
                    <Badge color={caseTypeColor(c.caseType)} size="sm">{c.caseTypeLabel}</Badge>
                    <Badge color={sm.color} size="sm" dot>{c.statusLabel || sm.label}</Badge>
                    <Badge color={pm.color} size="sm">{pm.label} priority</Badge>
                    {sla && <Badge color={sla.color} size="sm">{sla.text}</Badge>}
                    {c.escalated && <Badge color="rose" size="sm">Escalated</Badge>}
                  </div>
                  <h3 className="font-display font-bold text-lg text-app mt-1.5 truncate">{c.subject}</h3>
                </>
              ) : null}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0">
              <Icons.X size={18} />
            </button>
          </div>

          {error ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <div>
                <Icons.AlertTriangle className="mx-auto text-rose-500 mb-2" size={28} />
                <p className="text-sm text-slate-600 dark:text-slate-300">{error}</p>
                <button onClick={load} className="mt-3 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold">Retry</button>
              </div>
            </div>
          ) : loading || !c ? (
            <div className="flex-1 p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)}
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
              {/* Left: context + tabbed content */}
              <div className="flex-1 min-w-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-800">
                {/* Student + meta */}
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Field label="Student">
                    <p className="text-sm font-semibold text-app truncate">{c.student?.name || c.studentName || "—"}</p>
                    <p className="text-xs text-muted-app">{c.student?.rollNumber || ""}</p>
                  </Field>
                  <Field label="Category">
                    <p className="text-sm font-medium text-app">{c.categoryLabel || "—"}</p>
                  </Field>
                  <Field label="Assigned Queue">
                    <p className="text-sm font-medium text-app">{c.targetRoleLabel || "Unrouted"}</p>
                  </Field>
                  {c.courseCode && (
                    <Field label="Course"><p className="text-sm font-mono font-semibold text-app">{c.courseCode}</p></Field>
                  )}
                  {c.contextLabel && (
                    <Field label="Context"><p className="text-sm text-app truncate">{c.contextLabel}</p></Field>
                  )}
                  <Field label="Submitted"><p className="text-sm text-app">{fmtDateTime(c.createdAt)}</p></Field>
                </div>

                {/* Original description */}
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Description</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{c.description}</p>
                  {c.fileName && (
                    <a href={fileUrl(c.filePath || c.fileName)} target="_blank" rel="noreferrer"
                       className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 mt-2">
                      <Icons.Paperclip size={13} /> {c.fileName}
                    </a>
                  )}
                </div>

                {/* Tabs */}
                <div className="px-5 pt-3 flex gap-1.5 border-b border-slate-100 dark:border-slate-800">
                  {TABS.map((t) => {
                    const Icon = Icons[t.icon] || Icons.Circle;
                    const count = t.key === "conversation" ? data.messages?.length
                      : t.key === "notes" ? data.internalNotes?.length
                      : data.history?.length;
                    return (
                      <button key={t.key} onClick={() => setTab(t.key)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition ${
                          tab === t.key ? "border-primary-600 text-primary-600" : "border-transparent text-slate-500 hover:text-slate-700"
                        }`}>
                        <Icon size={14} /> {t.label}
                        {count ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{count}</span> : null}
                      </button>
                    );
                  })}
                </div>

                {/* Tab body */}
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                  {tab === "conversation" && (
                    <div className="space-y-3">
                      {(data.messages || []).length === 0 && (
                        <p className="text-sm text-muted-app text-center py-6">No conversation yet. Reply below to start.</p>
                      )}
                      {(data.messages || []).map((m) => (
                        <div key={m.id} className={`flex ${m.isStudent ? "justify-start" : "justify-end"}`}>
                          <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                            m.isStudent
                              ? "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                              : "bg-primary-600 text-white"
                          }`}>
                            <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${m.isStudent ? "text-slate-400" : "text-white/70"}`}>
                              {m.isStudent ? "Student" : actorRoleLabel(m.senderRole)}{m.mine ? " (you)" : ""}
                            </p>
                            <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                            {m.fileName && (
                              <a href={fileUrl(m.filePath || m.fileName)} target="_blank" rel="noreferrer"
                                 className={`inline-flex items-center gap-1 text-[11px] font-semibold mt-1 ${m.isStudent ? "text-primary-600" : "text-white underline"}`}>
                                <Icons.Paperclip size={11} /> {m.fileName}
                              </a>
                            )}
                            <p className={`text-[10px] mt-1 ${m.isStudent ? "text-slate-400" : "text-white/60"}`}>{fmtDateTime(m.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {tab === "notes" && (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
                        <Icons.Lock size={13} /> Internal notes are visible to staff only — never shown to the student.
                      </div>
                      {(data.internalNotes || []).length === 0 && (
                        <p className="text-sm text-muted-app text-center py-6">No internal notes yet.</p>
                      )}
                      {(data.internalNotes || []).map((n) => (
                        <div key={n.id} className="rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                            {actorRoleLabel(n.authorRole)}{n.mine ? " (you)" : ""} · {fmtDateTime(n.createdAt)}
                          </p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{n.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {tab === "timeline" && (
                    <ol className="relative border-l-2 border-slate-100 dark:border-slate-800 ml-2 space-y-4">
                      {(data.history || []).length === 0 && (
                        <p className="text-sm text-muted-app py-6 pl-4">No timeline events yet.</p>
                      )}
                      {(data.history || []).map((h) => (
                        <li key={h.id} className="ml-4">
                          <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-primary-500 border-2 border-white dark:border-slate-950" />
                          <p className="text-sm font-semibold text-app">{historyActionLabel(h.action)}</p>
                          <p className="text-xs text-muted-app">
                            {actorRoleLabel(h.actorRole)}
                            {h.fromValue || h.toValue ? ` · ${h.fromValue || "—"} → ${h.toValue || "—"}` : ""}
                          </p>
                          {h.note && <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 italic">“{h.note}”</p>}
                          <p className="text-[10px] text-slate-400 mt-0.5">{fmtDateTime(h.createdAt)}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {/* Composer (reply / note depending on tab) */}
                {tab !== "timeline" && (
                  <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                    {tab === "conversation" ? (
                      <div className="flex items-end gap-2">
                        <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2}
                          placeholder="Write a reply to the student…"
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900 resize-none" />
                        <button onClick={sendReply} disabled={busy || !reply.trim()}
                          className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0">
                          {busy ? <Icons.Loader2 size={15} className="animate-spin" /> : <Icons.Send size={15} />} Reply
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-end gap-2">
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                          placeholder="Add an internal note (staff-only)…"
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900 resize-none" />
                        <button onClick={addNote} disabled={busy || !note.trim()}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 shrink-0">
                          {busy ? <Icons.Loader2 size={15} className="animate-spin" /> : <Icons.StickyNote size={15} />} Note
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: action rail */}
              <div className="w-full lg:w-64 shrink-0 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50/60 dark:bg-slate-900/40">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Status</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {WORKFLOW_STATUSES.map((s) => {
                      const meta = statusMeta(s);
                      const activeS = c.status === s;
                      return (
                        <button key={s} disabled={busy || activeS} onClick={() => {
                          if (["RESOLVED", "CLOSED", "REJECTED"].includes(s)) { setResolveStatus(s); setResolveMsg(""); setResolveOpen(true); }
                          else changeStatus(s);
                        }}
                          className={`text-[11px] font-semibold px-2 py-1.5 rounded-lg border transition ${
                            activeS ? "bg-primary-600 text-white border-primary-600" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-400"
                          }`}>{meta.label}</button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Priority</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRIORITIES.map((p) => {
                      const meta = priorityMeta(p);
                      const activeP = (c.priority || "MEDIUM") === p;
                      return (
                        <button key={p} disabled={busy || activeP} onClick={() => changePriority(p)}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition ${
                            activeP ? "bg-primary-600 text-white border-primary-600" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-400"
                          }`}>{meta.label}</button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Actions</p>
                  <button onClick={() => { setAssignOpen((v) => !v); setEscalateOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-primary-400">
                    <Icons.UserPlus size={15} /> Assign / Reassign
                  </button>
                  {assignOpen && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 space-y-2 bg-white dark:bg-slate-900">
                      <select value={assignRole} onChange={(e) => setAssignRole(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-slate-900">
                        <option value="">Select queue…</option>
                        {roleOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <input value={assignReason} onChange={(e) => setAssignReason(e.target.value)} placeholder="Reason (optional)"
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-slate-900" />
                      <button onClick={doAssign} disabled={busy || !assignRole}
                        className="w-full btn-primary text-xs py-1.5 disabled:opacity-50">Confirm reassign</button>
                    </div>
                  )}

                  <button onClick={() => { setEscalateOpen((v) => !v); setAssignOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-rose-600 hover:border-rose-400">
                    <Icons.ArrowUpCircle size={15} /> Escalate
                  </button>
                  {escalateOpen && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 space-y-2 bg-white dark:bg-slate-900">
                      <select value={escalateTo} onChange={(e) => setEscalateTo(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-slate-900">
                        <option value="">Next level (auto)</option>
                        {roleOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <input value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} placeholder="Reason (optional)"
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-slate-900" />
                      <button onClick={doEscalate} disabled={busy}
                        className="w-full text-xs py-1.5 rounded-lg font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">Confirm escalate</button>
                    </div>
                  )}

                  {!terminal && (
                    <button onClick={() => { setResolveStatus("RESOLVED"); setResolveMsg(""); setResolveOpen(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
                      <Icons.CheckCircle2 size={15} /> Resolve / Close
                    </button>
                  )}
                </div>

                {(c.feedbackResolved !== null && c.feedbackResolved !== undefined) && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Student Feedback</p>
                    <p className="text-sm font-semibold text-app flex items-center gap-1">
                      {c.feedbackResolved ? <><Icons.ThumbsUp size={14} className="text-emerald-500" /> Marked resolved</> : <><Icons.ThumbsDown size={14} className="text-rose-500" /> Not resolved</>}
                    </p>
                    {c.feedbackRating ? <p className="text-xs text-amber-500 mt-1">{"★".repeat(c.feedbackRating)}{"☆".repeat(5 - c.feedbackRating)}</p> : null}
                    {c.feedbackComment && <p className="text-xs text-muted-app mt-1 italic">“{c.feedbackComment}”</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resolve / Close modal */}
          <AnimatePresence>
            {resolveOpen && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-[90] bg-slate-900/50 flex items-center justify-center p-4"
                onClick={() => setResolveOpen(false)}>
                <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
                  className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md p-5 border border-slate-200 dark:border-slate-800">
                  <h4 className="font-display font-bold text-app mb-3">Close this case</h4>
                  <div className="flex gap-2 mb-3">
                    {["RESOLVED", "CLOSED", "REJECTED"].map((s) => (
                      <button key={s} onClick={() => setResolveStatus(s)}
                        className={`flex-1 text-xs font-semibold py-2 rounded-lg border ${resolveStatus === s ? "bg-primary-600 text-white border-primary-600" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>
                        {statusMeta(s).label}</button>
                    ))}
                  </div>
                  <textarea value={resolveMsg} onChange={(e) => setResolveMsg(e.target.value)} rows={4}
                    placeholder="Resolution / response to the student (optional)…"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900" />
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={() => setResolveOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
                    <button onClick={doResolve} disabled={busy} className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50">
                      {busy ? <Icons.Loader2 size={15} className="animate-spin" /> : <Icons.CheckCircle2 size={15} />} Confirm
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
};

export default GrievanceCaseDrawer;

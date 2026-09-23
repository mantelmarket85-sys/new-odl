import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  Plus, Search, Paperclip, FileText, Send, ShieldAlert, Clock,
  CheckCircle2, XCircle, User, Users, GraduationCap, Gavel, Crown, ClipboardCheck,
  RotateCcw, Star, MessageSquare, History, ThumbsUp, ThumbsDown, RefreshCw,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import StatusBadge from "../../components/common/StatusBadge";
import EmptyState from "../../components/common/EmptyState";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import {
  statusMeta, priorityMeta, caseTypeColor, actorRoleLabel,
  historyActionLabel, fmtDateTime,
} from "../../components/grievance/grievanceShared";

const APPEAL_TYPES = ["GENERAL", "RECHECK", "GRIEVANCE", "DOCUMENT", "LEAVE", "RETAKE"];
// Support & Grievances case types + priorities (portal upgrade).
const CASE_TYPES = [
  { value: "GRIEVANCE", label: "Grievance" },
  { value: "SUPPORT", label: "Support Request" },
  { value: "APPEAL", label: "Appeal" },
  { value: "SUGGESTION", label: "Suggestion" },
  { value: "FEEDBACK", label: "Feedback" },
];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
// Statuses a student may reopen (mirror of backend grievance.REOPENABLE).
const REOPENABLE = new Set(["RESOLVED", "CLOSED", "REJECTED"]);
const fmt = (d) => (d ? new Date(d).toLocaleString() : "");
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "");

// Display label + icon per recipient role.
const ROLE_META = {
  TEACHER: { label: "Teacher", icon: GraduationCap },
  COURSE_COORDINATOR: { label: "Course Coordinator", icon: Users },
  FOCAL_PERSON: { label: "Focal Person", icon: User },
  EXAM_CONTROLLER: { label: "Exam Controller", icon: ClipboardCheck },
  PROVOST: { label: "Provost", icon: Crown },
};

// Map backend status → friendly tracking label.
const STATUS_LABEL = {
  OPEN: "Submitted",
  IN_REVIEW: "Under Review",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
  APPROVED: "Approved",
};

// ============================================================
//  STUDENT CASE MODAL — full Support & Grievances case view.
//  Wires the new endpoints: conversation (grievanceCase / grievanceReply),
//  reopen (grievanceReopen) and satisfaction feedback (grievanceFeedback).
//  Props: { caseId, onClose, onChanged, recipientLabel }
// ============================================================
const StudentCaseModal = ({ caseId, onClose, onChanged, recipientLabel }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null); // { appeal, messages, history }
  const [tab, setTab] = useState("conversation");

  // Composer state.
  const [reply, setReply] = useState("");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);

  // Reopen state.
  const [reopening, setReopening] = useState(false);

  // Feedback state.
  const [showFeedback, setShowFeedback] = useState(false);
  const [fbResolved, setFbResolved] = useState(null); // true / false
  const [fbRating, setFbRating] = useState(0);
  const [fbComment, setFbComment] = useState("");
  const [fbSaving, setFbSaving] = useState(false);

  const bottomRef = useRef(null);

  const load = useCallback(async ({ silent } = {}) => {
    // Keep the conversation on screen after Send — never flash a skeleton
    // when we already have case data.
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await api.student.grievanceCase(caseId);
      setData(res);
    } catch (e) {
      setError(e.message || "Failed to load case");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (caseId) load();
  }, [caseId, load]);

  // Auto-scroll conversation to the newest message.
  useEffect(() => {
    if (tab === "conversation" && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [data, tab]);

  const appeal = data?.appeal || null;
  const messages = data?.messages || [];
  const history = data?.history || [];
  const canReopen = appeal && REOPENABLE.has(appeal.status);
  const canFeedback = appeal && ["RESOLVED", "CLOSED"].includes(appeal.status);
  const alreadyFeedback = appeal && appeal.feedbackAt;

  const sendReply = async () => {
    if (!reply.trim() && !file) {
      toast("Type a message or attach a file", { type: "error" });
      return;
    }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("body", reply.trim() || "(attachment)");
      if (file) fd.append("file", file);
      await api.student.grievanceReply(caseId, fd);
      setReply("");
      setFile(null);
      await load({ silent: true });
      onChanged?.();
    } catch (e) {
      toast(e.message || "Failed to send reply", { type: "error" });
    } finally {
      setSending(false);
    }
  };

  const doReopen = async () => {
    setReopening(true);
    try {
      await api.student.grievanceReopen(caseId, {});
      toast("Case reopened — staff have been notified");
      await load({ silent: true });
      onChanged?.();
    } catch (e) {
      toast(e.message || "Failed to reopen case", { type: "error" });
    } finally {
      setReopening(false);
    }
  };

  const submitFeedback = async () => {
    if (fbResolved === null) {
      toast("Please tell us if your issue was resolved", { type: "error" });
      return;
    }
    setFbSaving(true);
    try {
      await api.student.grievanceFeedback(caseId, {
        resolved: fbResolved,
        rating: fbRating || undefined,
        comment: fbComment.trim() || undefined,
      });
      toast(fbResolved ? "Thank you for your feedback!" : "Case reopened for further review");
      setShowFeedback(false);
      setFbResolved(null);
      setFbRating(0);
      setFbComment("");
      await load({ silent: true });
      onChanged?.();
    } catch (e) {
      toast(e.message || "Failed to submit feedback", { type: "error" });
    } finally {
      setFbSaving(false);
    }
  };

  const st = appeal ? statusMeta(appeal.status) : null;
  const pr = appeal ? priorityMeta(appeal.priority) : null;

  return (
    <Modal
      open={!!caseId}
      onClose={onClose}
      title={appeal?.subject || "Case"}
      subtitle={appeal ? appeal.caseCode : ""}
      icon={ShieldAlert}
      maxWidth="max-w-2xl"
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : appeal ? (
        <div className="space-y-4">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={st.color}>{appeal.statusLabel || st.label}</Badge>
            <Badge color={caseTypeColor(appeal.caseType)}>{appeal.caseTypeLabel || appeal.caseType}</Badge>
            <Badge color={pr.color}>{pr.label} priority</Badge>
            {appeal.targetRoleLabel && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300">
                Sent to: {recipientLabel ? recipientLabel(appeal) : appeal.targetRoleLabel}
              </span>
            )}
          </div>

          {/* Existing feedback confirmation */}
          {alreadyFeedback && (
            <div className="text-[11px] font-semibold px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={13} />
              You submitted feedback on {fmtDateTime(appeal.feedbackAt)}
              {appeal.feedbackRating ? ` · rated ${appeal.feedbackRating}/5` : ""}
              {appeal.feedbackResolved === false ? " · marked unresolved" : ""}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-100 dark:border-slate-800">
            {[
              { id: "conversation", label: "Conversation", icon: MessageSquare },
              { id: "details", label: "Details", icon: FileText },
              { id: "timeline", label: "Timeline", icon: History },
            ].map((t) => {
              const TIcon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-2 text-xs font-bold flex items-center gap-1.5 border-b-2 -mb-px transition ${
                    tab === t.id
                      ? "border-primary-600 text-primary-600 dark:text-primary-400"
                      : "border-transparent text-muted-app hover:text-app"
                  }`}
                >
                  <TIcon size={13} /> {t.label}
                </button>
              );
            })}
          </div>

          {/* CONVERSATION TAB */}
          {tab === "conversation" && (
            <div className="space-y-3">
              <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                {/* Original submission as the first bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2.5 bg-primary-600 text-white">
                    <p className="text-[10px] font-bold opacity-80 mb-0.5">You · {fmtDateTime(appeal.createdAt)}</p>
                    <p className="text-sm whitespace-pre-line">{appeal.description}</p>
                    {appeal.fileName && (
                      <a href={api.fileUrl(appeal.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-[11px] underline opacity-90">
                        <Paperclip size={11} /> {appeal.fileName}
                      </a>
                    )}
                  </div>
                </div>
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${m.mine ? "rounded-br-sm bg-primary-600 text-white" : "rounded-bl-sm bg-slate-100 dark:bg-slate-800 text-app"}`}>
                      <p className={`text-[10px] font-bold mb-0.5 ${m.mine ? "opacity-80" : "text-muted-app"}`}>
                        {m.mine ? "You" : actorRoleLabel(m.senderRole)} · {fmtDateTime(m.createdAt)}
                      </p>
                      <p className="text-sm whitespace-pre-line">{m.body}</p>
                      {m.fileName && (
                        <a href={api.fileUrl(m.filePath)} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 mt-1.5 text-[11px] underline ${m.mine ? "opacity-90" : "text-primary-600 dark:text-primary-400"}`}>
                          <Paperclip size={11} /> {m.fileName}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows="2"
                  className="input-base text-sm"
                  placeholder="Write a reply to the staff handling your case…"
                />
                <div className="flex items-center gap-2">
                  <label className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5 cursor-pointer">
                    <Paperclip size={13} /> {file ? "1 file" : "Attach"}
                    <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </label>
                  {file && <span className="text-[11px] text-muted-app truncate max-w-[120px]">{file.name}</span>}
                  <button onClick={sendReply} disabled={sending} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 ml-auto">
                    <Send size={13} /> {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DETAILS TAB */}
          {tab === "details" && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-app mb-1.5">Description</p>
                <p className="text-sm text-app leading-relaxed p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 whitespace-pre-line">{appeal.description}</p>
              </div>
              {appeal.response && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-app mb-1.5">Latest Official Response</p>
                  <p className="text-sm text-app leading-relaxed p-3 rounded-xl border-l-4 border-primary-500 bg-primary-50 dark:bg-primary-950/30">{appeal.response}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                <div><p className="text-muted-app">Case Code</p><p className="font-bold font-mono text-app">{appeal.caseCode}</p></div>
                <div><p className="text-muted-app">Category</p><p className="font-bold text-app">{appeal.categoryLabel || "—"}</p></div>
                <div><p className="text-muted-app">Submitted</p><p className="font-bold text-app">{fmt(appeal.createdAt)}</p></div>
                <div><p className="text-muted-app">Last Updated</p><p className="font-bold text-app">{fmt(appeal.updatedAt || appeal.createdAt)}</p></div>
                {appeal.handledAt && <div><p className="text-muted-app">Handled</p><p className="font-bold text-app">{fmt(appeal.handledAt)}</p></div>}
                {appeal.slaDueAt && <div><p className="text-muted-app">Target Resolution</p><p className="font-bold text-app">{fmt(appeal.slaDueAt)}</p></div>}
              </div>
            </div>
          )}

          {/* TIMELINE TAB */}
          {tab === "timeline" && (
            <div className="space-y-3">
              {history.length === 0 ? (
                <p className="text-sm text-muted-app text-center py-6">No timeline activity yet.</p>
              ) : (
                <ol className="relative border-l-2 border-slate-100 dark:border-slate-800 ml-2 space-y-4">
                  {history.map((h) => (
                    <li key={h.id} className="ml-4">
                      <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-primary-500 border-2 border-white dark:border-slate-900" />
                      <p className="text-sm font-bold text-app">{historyActionLabel(h.action)}</p>
                      <p className="text-[11px] text-muted-app">
                        {actorRoleLabel(h.actorRole)}
                        {h.fromValue || h.toValue ? ` · ${h.fromValue || "—"} → ${h.toValue || "—"}` : ""}
                        {" · "}{fmtDateTime(h.createdAt)}
                      </p>
                      {h.note && <p className="text-xs text-app mt-0.5 italic">“{h.note}”</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* ACTION BAR: reopen + feedback */}
          {(canReopen || canFeedback) && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 flex flex-wrap gap-2">
              {canReopen && (
                <button onClick={doReopen} disabled={reopening} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                  <RotateCcw size={13} /> {reopening ? "Reopening…" : "Reopen case"}
                </button>
              )}
              {canFeedback && !showFeedback && (
                <button onClick={() => setShowFeedback(true)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                  <Star size={13} /> {alreadyFeedback ? "Update feedback" : "Give feedback"}
                </button>
              )}
            </div>
          )}

          {/* FEEDBACK FORM */}
          {showFeedback && (
            <div className="card-base p-4 bg-slate-50/60 dark:bg-slate-800/30 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-app">Was your issue resolved?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setFbResolved(true)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition ${fbResolved === true ? "bg-emerald-600 text-white" : "bg-white dark:bg-slate-800 text-app border border-slate-200 dark:border-slate-700"}`}
                >
                  <ThumbsUp size={14} /> Yes, resolved
                </button>
                <button
                  onClick={() => setFbResolved(false)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition ${fbResolved === false ? "bg-rose-600 text-white" : "bg-white dark:bg-slate-800 text-app border border-slate-200 dark:border-slate-700"}`}
                >
                  <ThumbsDown size={14} /> Not resolved
                </button>
              </div>
              {fbResolved === false && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">This will reopen your case so staff can continue working on it.</p>
              )}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-app mb-1.5">Rating (optional)</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setFbRating(n)} className="p-0.5">
                      <Star size={22} className={n <= fbRating ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"} />
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={fbComment}
                onChange={(e) => setFbComment(e.target.value)}
                rows="2"
                className="input-base text-sm"
                placeholder="Any comments about how your case was handled? (optional)"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowFeedback(false)} className="btn-secondary flex-1 text-sm" disabled={fbSaving}>Cancel</button>
                <button onClick={submitFeedback} className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5" disabled={fbSaving}>
                  <Send size={13} /> {fbSaving ? "Submitting…" : "Submit feedback"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
};

const Appeals = () => {
  const { data, loading, error, reload } = useApi(() => api.student.appeals(), []);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ caseType: "GRIEVANCE", priority: "MEDIUM", type: "GENERAL", subject: "", description: "", targetRole: "", targetTeacherId: "" });
  const [file, setFile] = useState(null);
  const { toast } = useToast();

  // Recipient options (roles + dynamic teacher list) — loaded for the form.
  const [recipients, setRecipients] = useState({ roles: [], teachers: [] });
  const [recipLoading, setRecipLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRecipLoading(true);
    api.student.appealRecipients()
      .then((r) => setRecipients({ roles: r.roles || [], teachers: r.teachers || [] }))
      .catch(() => setRecipients({ roles: [], teachers: [] }))
      .finally(() => setRecipLoading(false));
  }, [open]);

  // MANUAL REFRESH ONLY (client requirement 1.4).
  // The Support & Grievance page must NOT refresh by itself. The previous
  // 20s auto-refresh interval has been removed — data loads once on mount and
  // only re-fetches when the user explicitly clicks the Refresh button.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try { await reload(); } finally { setRefreshing(false); }
  };

  const appeals = useMemo(() => data?.appeals || [], [data]);

  const filtered = appeals.filter((a) => {
    if (filter !== "all" && a.status !== filter) return false;
    if (search && !a.subject.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const tabs = [
    { id: "all", label: "All", count: appeals.length },
    { id: "OPEN", label: "Submitted", count: appeals.filter((a) => a.status === "OPEN").length },
    { id: "IN_REVIEW", label: "Under Review", count: appeals.filter((a) => a.status === "IN_REVIEW").length },
    { id: "RESOLVED", label: "Resolved", count: appeals.filter((a) => a.status === "RESOLVED").length },
    { id: "REJECTED", label: "Rejected", count: appeals.filter((a) => a.status === "REJECTED").length },
  ];

  const submit = async () => {
    if (!form.subject.trim() || !form.description.trim()) { toast("Subject and description are required", { type: "error" }); return; }
    if (!form.targetRole) { toast("Please select who should receive this appeal", { type: "error" }); return; }
    if (form.targetRole === "TEACHER" && !form.targetTeacherId) { toast("Please select a teacher", { type: "error" }); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("caseType", form.caseType);
      fd.append("priority", form.priority);
      fd.append("type", form.type);
      fd.append("subject", form.subject);
      fd.append("description", form.description);
      fd.append("targetRole", form.targetRole);
      if (form.targetRole === "TEACHER") fd.append("targetTeacherId", form.targetTeacherId);
      if (file) fd.append("file", file);
      await api.student.createAppeal(fd);
      toast("Appeal submitted successfully!");
      setOpen(false);
      setForm({ caseType: "GRIEVANCE", priority: "MEDIUM", type: "GENERAL", subject: "", description: "", targetRole: "", targetTeacherId: "" });
      setFile(null);
      reload();
    } catch (e) {
      toast(e.message || "Failed to submit appeal", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const recipientLabel = (a) => {
    if (!a.targetRole) return "—";
    const meta = ROLE_META[a.targetRole];
    if (a.targetRole === "TEACHER") return `${meta?.label || "Teacher"}${a.targetUserName ? ` · ${a.targetUserName}` : ""}`;
    return meta?.label || a.targetRoleLabel || a.targetRole;
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Support & Grievances" subtitle="Submit and track your cases with teachers and administration" icon="ShieldAlert" breadcrumb={["Dashboard", "Support & Grievances"]} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Support & Grievances"
        subtitle="Submit grievances, support requests, appeals, suggestions & feedback — use Refresh to check for status updates"
        icon="ShieldAlert"
        breadcrumb={["Dashboard", "Support & Grievances"]}
        actions={
          <div className="flex items-center gap-2">
            {/* Manual refresh (client requirement 1.4) — the page never
                refreshes on its own; the user triggers a re-fetch here. */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh cases"
              className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
            </button>
            <button onClick={() => setOpen(true)} className="btn-primary text-sm py-2 px-3 flex items-center gap-1.5"><Plus size={14} /> Submit New Case</button>
          </div>
        }
      />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Total Submitted", value: appeals.length, color: "blue", icon: ShieldAlert },
              { label: "Open / In Review", value: appeals.filter((a) => ["OPEN", "IN_REVIEW"].includes(a.status)).length, color: "amber", icon: Clock },
              { label: "Resolved", value: appeals.filter((a) => a.status === "RESOLVED").length, color: "emerald", icon: CheckCircle2 },
              { label: "Rejected", value: appeals.filter((a) => a.status === "REJECTED").length, color: "rose", icon: XCircle },
            ].map((s, i) => {
              const SIcon = s.icon;
              return (
                <div key={i} className="card-base p-4 flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl bg-${s.color}-100 dark:bg-${s.color}-950/40 text-${s.color}-600 dark:text-${s.color}-400`}><SIcon size={18} /></div>
                  <div>
                    <p className="text-2xl font-display font-extrabold text-app">{s.value}</p>
                    <p className="text-[11px] text-muted-app font-semibold">{s.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card-base p-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setFilter(t.id)} className={`shrink-0 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${filter === t.id ? "bg-primary-600 text-white shadow" : "text-muted-app hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
                  {t.label} <span className={`text-[10px] ml-0.5 px-1 rounded ${filter === t.id ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800"}`}>{t.count}</span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search appeals…" className="input-base pl-9 text-xs py-2" />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="ShieldAlert" title="No appeals found" description="Try a different filter or submit a new appeal." action={() => setOpen(true)} actionLabel="Submit Appeal" />
          ) : (
            <div className="space-y-3">
              {filtered.map((a, i) => {
                const RoleIcon = a.targetRole && ROLE_META[a.targetRole] ? ROLE_META[a.targetRole].icon : Gavel;
                return (
                  <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} onClick={() => setSelected(a.id)} className="card-base p-5 cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 transition group">
                    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-[10px] font-mono font-bold text-primary-600 dark:text-primary-400">{a.caseCode || `APL-${a.id}`}</span>
                          <Badge color="slate" size="sm">{a.caseTypeLabel || a.type}</Badge>
                          <StatusBadge status={a.statusLabel || STATUS_LABEL[a.status] || a.status} size="sm" />
                          {a.targetRole && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300">
                              <RoleIcon size={11} /> {recipientLabel(a)}
                            </span>
                          )}
                        </div>
                        <h4 className="font-display font-bold text-base text-app group-hover:text-primary-600 dark:group-hover:text-primary-400 transition">{a.subject}</h4>
                        <p className="text-xs text-muted-app line-clamp-1 mt-0.5">{a.description}</p>
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-app">
                          {a.fileName && <span className="inline-flex items-center gap-1"><Paperclip size={11} />{a.fileName}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 text-xs">
                        <p className="text-muted-app">Submitted</p>
                        <p className="font-bold text-app">{fmtDate(a.createdAt)}</p>
                        <p className="text-muted-app mt-1">Last updated {fmtDate(a.updatedAt || a.handledAt || a.createdAt)}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* New Appeal modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Submit New Case" subtitle="Grievance · Support · Appeal · Suggestion · Feedback — routed to the right person" icon={ShieldAlert}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Case Type</label>
              <select value={form.caseType} onChange={(e) => setForm({ ...form, caseType: e.target.value })} className="input-base text-sm">
                {CASE_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input-base text-sm">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Submit Appeal To</label>
            <select
              value={form.targetRole}
              onChange={(e) => setForm({ ...form, targetRole: e.target.value, targetTeacherId: "" })}
              className="input-base text-sm"
            >
              <option value="">— Select recipient —</option>
              {recipients.roles.map((r) => (
                <option key={r.value} value={r.value} disabled={!r.available}>
                  {r.label}{!r.available ? " (unavailable)" : ""}
                </option>
              ))}
            </select>
          </div>

          {form.targetRole === "TEACHER" && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Select Teacher</label>
              {recipLoading ? (
                <Skeleton className="h-10 rounded-xl" />
              ) : recipients.teachers.length === 0 ? (
                <p className="text-xs text-rose-500 font-semibold">No teachers are currently teaching you.</p>
              ) : (
                <select value={form.targetTeacherId} onChange={(e) => setForm({ ...form, targetTeacherId: e.target.value })} className="input-base text-sm">
                  <option value="">— Choose your teacher —</option>
                  {recipients.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.courseCodes?.length ? ` — ${t.courseCodes.join(", ")}` : ""}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-[10px] text-muted-app mt-1">Only teachers currently teaching you are shown.</p>
            </div>
          )}

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-base text-sm">
              {APPEAL_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Subject</label>
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="input-base text-sm" placeholder="Concise title for your appeal" />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Detailed Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows="4" className="input-base text-sm" placeholder="Explain the issue clearly with relevant context..." />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Attachment (optional)</label>
            <label className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center gap-1 hover:border-primary-400 cursor-pointer">
              <FileText size={18} className="text-primary-600" />
              <span className="text-xs font-bold text-app">{file ? file.name : "Attach Document / Screenshot"}</span>
              <span className="text-[10px] text-muted-app">PDF, DOCX, PNG, JPG — max 10MB</span>
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
            <button onClick={submit} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={saving}>
              <Send size={14} /> {saving ? "Submitting…" : "Submit Appeal"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Full case modal — conversation, timeline, reopen & feedback */}
      {selected && (
        <StudentCaseModal
          caseId={selected}
          onClose={() => setSelected(null)}
          onChanged={reload}
          recipientLabel={(a) => recipientLabel(a)}
        />
      )}
    </div>
  );
};

export default Appeals;

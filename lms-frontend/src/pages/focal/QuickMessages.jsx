import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Send, Loader2, Search, Check, CheckCheck, Users, Zap } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

/* =========================================================================
 * Focal Person → Real-Time Messaging (Requirement #4)
 * Send / receive instantly (3s polling), read receipts, unread counters,
 * contact search and full conversation history. Real users only.
 * ======================================================================= */

const TEMPLATES = [
  { id: "quiz", label: "Submit Quiz Marks", text: "Reminder: Please upload the pending quiz marks for your course at the earliest." },
  { id: "attendance", label: "Update Attendance", text: "Reminder: Kindly update the attendance records for your sections." },
  { id: "evaluation", label: "Complete Evaluations", text: "Reminder: The course evaluation window is open. Please complete your evaluations." },
  { id: "grading", label: "Finalize Grading", text: "Reminder: Please finalize and submit the grading for your course before the deadline." },
  { id: "meeting", label: "Faculty Meeting", text: "Notice: A faculty coordination meeting is scheduled. Your attendance is requested." },
];

const POLL_MS = 3000;
const fmtTime = (d) => {
  if (!d) return "";
  try { return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return d; }
};
const roleColor = (r) => ({ Teacher: "indigo", Student: "emerald", Provost: "violet", QECCoordinator: "amber", ExamController: "rose" }[r] || "slate");

const FocalQuickMessages = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.focal.messageContacts(), []);
  const [contacts, setContacts] = useState([]);

  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [convError, setConvError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const endRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => { if (data?.contacts) setContacts(data.contacts); }, [data]);
  useEffect(() => { activeRef.current = active; }, [active]);

  // Refresh the contact list (unread counters + last message) in the background.
  const refreshContacts = useCallback(() => {
    api.focal.messageContacts().then((r) => r?.contacts && setContacts(r.contacts)).catch(() => {});
  }, []);

  const loadConversation = useCallback((contact, silent = false) => {
    if (!contact) return;
    if (!silent) { setLoadingConv(true); setConvError(""); }
    api.focal.conversation(contact.id)
      .then((res) => setMessages(res.messages || []))
      .catch((e) => { if (!silent) setConvError(e.message || "Failed to load conversation"); })
      .finally(() => { if (!silent) setLoadingConv(false); });
  }, []);

  // Load conversation when switching contacts.
  useEffect(() => { if (active) loadConversation(active); /* eslint-disable-next-line */ }, [active?.id]);

  // Real-time polling: refresh open conversation + contact unread badges.
  useEffect(() => {
    const t = setInterval(() => {
      if (activeRef.current) loadConversation(activeRef.current, true);
      refreshContacts();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [loadConversation, refreshContacts]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (text) => {
    const body = (text ?? draft).trim();
    if (!body || !active) return;
    setSending(true);
    try {
      const res = await api.focal.sendMessage(active.id, body);
      setMessages((m) => [...m, res.message]);
      setDraft("");
      setShowTemplates(false);
      refreshContacts();
    } catch (e) {
      toast?.(e.message || "Failed to send message", { type: "error" });
    } finally {
      setSending(false);
    }
  };

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.role || "").toLowerCase().includes(q) || (c.username || "").toLowerCase().includes(q));
  }, [contacts, search]);

  const totalUnread = useMemo(() => contacts.reduce((a, c) => a + (c.unread || 0), 0), [contacts]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Messages" subtitle="Real-time messaging with faculty, students and governance" icon="MessageSquare" breadcrumb={["Focal Person", "Messages"]} />
        <Skeleton className="h-[600px] rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Real-time messaging with faculty, students and governance — instant delivery, read receipts & unread counters."
        icon="MessageSquare"
        breadcrumb={["Focal Person", "Messages"]}
        actions={totalUnread > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <MessageSquare size={13} /> {totalUnread} unread
          </span>
        )}
      />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : contacts.length === 0 ? (
        <EmptyState icon="MessageSquare" title="No contacts" description="No messaging contacts available in your scope." />
      ) : (
        <div className="grid lg:grid-cols-3 gap-4 h-[600px]">
          {/* ---- Contacts list ---- */}
          <div className="card-base overflow-hidden flex flex-col">
            <div className="p-3 border-b border-app">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts…" className="input-base w-full pl-9 text-sm" />
              </div>
              <p className="text-[11px] text-muted-app mt-2 inline-flex items-center gap-1"><Users size={11} /> {filteredContacts.length} contact(s)</p>
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredContacts.map((c) => (
                <button key={c.id} onClick={() => setActive(c)} className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-app/60 transition ${active?.id === c.id ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                  <div className={`w-10 h-10 rounded-full bg-${roleColor(c.role)}-500 flex items-center justify-center text-white font-bold shrink-0`}>{c.name.charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-app truncate">{c.name}</p>
                      {c.lastAt && <span className="text-[9px] text-muted-app shrink-0">{fmtTime(c.lastAt).split(",")[0]}</span>}
                    </div>
                    <p className="text-[11px] text-muted-app truncate">{c.lastMessage || c.role}</p>
                  </div>
                  {c.unread > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white shrink-0">{c.unread}</span>}
                </button>
              ))}
              {filteredContacts.length === 0 && <p className="text-xs text-muted-app text-center py-6">No contacts match your search.</p>}
            </div>
          </div>

          {/* ---- Conversation ---- */}
          <div className="lg:col-span-2 card-base overflow-hidden flex flex-col">
            {active ? (
              <>
                <div className="px-5 py-3 border-b border-app flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full bg-${roleColor(active.role)}-500 flex items-center justify-center text-white font-bold`}>{active.name.charAt(0).toUpperCase()}</div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-app">{active.name}</p>
                    <p className="text-[11px] text-muted-app">{active.role} · @{active.username}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/30">
                  {loadingConv ? (
                    <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-2/3 rounded-2xl" />)}</div>
                  ) : convError ? (
                    <ErrorState description={convError} onRetry={() => loadConversation(active)} />
                  ) : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-app">No messages yet. Start the conversation!</div>
                  ) : (
                    messages.map((m) => (
                      <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl ${m.mine ? "bg-primary-600 text-white rounded-br-sm" : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm border border-app"}`}>
                          {m.subject && <p className="text-[11px] font-bold opacity-80 mb-0.5">{m.subject}</p>}
                          <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={`text-[10px] mt-1 flex items-center gap-1 ${m.mine ? "text-white/70 justify-end" : "text-muted-app"}`}>
                            {fmtTime(m.createdAt)}
                            {m.mine && (m.isRead ? <CheckCheck size={12} className="text-sky-200" /> : <Check size={12} className="text-white/60" />)}
                          </p>
                        </div>
                      </motion.div>
                    ))
                  )}
                  <div ref={endRef} />
                </div>

                {/* Quick templates (optional helper) */}
                {showTemplates && (
                  <div className="px-3 py-2 border-t border-app flex flex-wrap gap-2 surface">
                    {TEMPLATES.map((t) => (
                      <button key={t.id} disabled={sending} onClick={() => send(t.text)} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-app text-app hover:border-primary-400 disabled:opacity-50">
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="p-3 border-t border-app flex items-center gap-2">
                  <button onClick={() => setShowTemplates((v) => !v)} title="Quick templates" className={`p-2.5 rounded-xl border border-app ${showTemplates ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600" : "text-muted-app hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
                    <Zap size={18} />
                  </button>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder="Type a message…"
                    className="flex-1 input-base text-sm"
                  />
                  <button onClick={() => send()} disabled={sending || !draft.trim()} className="p-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
                    {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-sm text-muted-app">
                <MessageSquare size={36} className="opacity-30 mb-2" /> Select a contact to start messaging
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FocalQuickMessages;

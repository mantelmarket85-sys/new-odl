import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Send, Search, MessageSquare, Sparkles, Wifi, CheckCheck, Check } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Badge from "../../components/common/Badge";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

/* =========================================================================
 * Course Coordinator → Quick Messages (LIVE)
 *
 * Direct messaging console. Contacts come from /coordinator/messages/contacts,
 * the thread from /coordinator/messages/:userId, and sending posts to the
 * same endpoint. Quick-reply presets are pure text helpers (no mock data).
 * ======================================================================= */

const QUICK_PRESETS = [
  "Please share the latest attendance summary for your section.",
  "Kindly upload the pending result sheets before the deadline.",
  "Reminder: faculty meeting scheduled this week. Please confirm availability.",
  "Could you provide an update on the at-risk students in your course?",
];

const ROLE_COLOR = {
  Teacher: "blue", ExamController: "purple", FocalPerson: "amber",
  Provost: "rose", QECCoordinator: "emerald", Student: "slate",
};

const avatarFor = (name) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "User")}&background=2563eb&color=fff&bold=true&size=128`;

const AdminQuickMessages = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const myId = user?.userId;

  const { data, loading, error, reload } = useApi(() => api.coordinator.messageContacts(), []);
  const contacts = useMemo(() => data?.contacts || [], [data]);

  const [search, setSearch] = useState("");
  const [active, setActive] = useState(null); // selected contact
  const [thread, setThread] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState(false);
  const [unread, setUnread] = useState({ total: 0, byContact: {} });
  const endRef = useRef(null);
  const activeRef = useRef(null);
  useEffect(() => { activeRef.current = active; }, [active]);

  // ---- Unread counts ----
  const loadUnread = useCallback(() => {
    api.coordinator.messagesUnread().then(setUnread).catch(() => {});
  }, []);
  useEffect(() => { loadUnread(); }, [loadUnread]);

  // ---- Real-time message stream (SSE) ----
  useEffect(() => {
    let es;
    try {
      es = new EventSource(api.coordinator.eventsUrl());
      es.onopen = () => setLive(true);
      es.onerror = () => setLive(false);
      es.addEventListener("message", (ev) => {
        let payload = {};
        try { payload = JSON.parse(ev.data); } catch (_) { return; }
        if (payload.action === "read") return; // receipt for our outgoing messages
        const cur = activeRef.current;
        const involvesActive = cur && (payload.senderId === cur.id || payload.recipientId === cur.id);
        if (involvesActive && payload.senderId === cur.id) {
          // Incoming message in the open thread — append + mark read.
          setThread((t) => (t.some((m) => m.id === payload.id) ? t : [...t, payload]));
          api.coordinator.markMessagesRead(cur.id).then(loadUnread).catch(() => {});
        } else {
          loadUnread();
        }
      });
    } catch (_) { /* SSE optional */ }
    return () => { if (es) es.close(); };
  }, [loadUnread]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name?.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q) || c.role?.toLowerCase().includes(q));
  }, [contacts, search]);

  const loadThread = async (contact) => {
    setActive(contact);
    setLoadingThread(true);
    try {
      const res = await api.coordinator.conversation(contact.id);
      setThread(res.messages || []);
      // Mark this conversation as read (read receipts) + refresh unread badges.
      await api.coordinator.markMessagesRead(contact.id).catch(() => {});
      loadUnread();
    } catch (e) {
      toast(e.message || "Failed to load conversation", { type: "error" });
      setThread([]);
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, loadingThread]);

  const send = async () => {
    if (!active || !draft.trim()) return;
    setSending(true);
    try {
      const res = await api.coordinator.sendQuickMessage(active.id, draft.trim());
      if (res.message) setThread((t) => (t.some((m) => m.id === res.message.id) ? t : [...t, res.message]));
      setDraft("");
    } catch (e) {
      toast(e.message || "Send failed", { type: "error" });
    } finally {
      setSending(false);
    }
  };

  const roleCounts = useMemo(() => {
    const teachers = contacts.filter((c) => c.role === "Teacher").length;
    const staff = contacts.length - teachers;
    return { teachers, staff };
  }, [contacts]);

  return (
    <div>
      <PageHeader
        title="Quick Messages"
        subtitle="Real-time direct messaging with faculty and academic staff."
        icon="MessageSquare"
        breadcrumb={["Coordinator", "Quick Messages"]}
        actions={
          <span className={`text-[11px] font-bold inline-flex items-center gap-1 px-2 py-1 rounded-full border ${live ? "text-emerald-600 border-emerald-200 dark:border-emerald-500/30" : "text-muted-app border-app"}`}>
            <Wifi size={12} /> {live ? "Live" : "Offline"}
          </span>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard title="Contacts" value={contacts.length} icon="Users" color="blue" delay={0.05} />
        <StatCard title="Teachers" value={roleCounts.teachers} icon="GraduationCap" color="emerald" delay={0.1} />
        <StatCard title="Staff & Governance" value={roleCounts.staff} icon="Shield" color="purple" delay={0.15} />
        <StatCard title="Unread" value={unread.total} icon="Bell" color="rose" delay={0.2} />
      </div>

      {error ? (
        <ErrorState title="Couldn't load contacts" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid lg:grid-cols-3 gap-4">
          <Skeleton className="h-96 lg:col-span-1" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState icon="MessageSquare" title="No contacts available" description="There are no messaging contacts for your role yet." />
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Contacts list */}
          <div className="card-base p-0 overflow-hidden lg:col-span-1 flex flex-col" style={{ maxHeight: "70vh" }}>
            <div className="p-3 border-b border-app">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className="input-base pl-9 w-full text-sm py-2" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 && <p className="p-4 text-sm text-muted-app text-center">No contacts match.</p>}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => loadThread(c)}
                  className={`w-full flex items-center gap-3 p-3 text-left transition ${active?.id === c.id ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}`}
                >
                  <div className="relative">
                    <img src={avatarFor(c.name)} alt={c.name} className="w-10 h-10 rounded-full" />
                    {unread.byContact?.[c.id] > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">{unread.byContact[c.id]}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-app text-sm truncate">{c.name}</p>
                    <p className="text-xs text-muted-app truncate">{c.username}</p>
                  </div>
                  <Badge color={ROLE_COLOR[c.role] || "slate"}>{c.role}</Badge>
                </button>
              ))}
            </div>
          </div>

          {/* Conversation */}
          <div className="card-base p-0 overflow-hidden lg:col-span-2 flex flex-col" style={{ maxHeight: "70vh" }}>
            {!active ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <MessageSquare size={36} className="mx-auto mb-3 text-muted-app opacity-40" />
                  <p className="font-semibold text-app">Select a contact</p>
                  <p className="text-xs text-muted-app mt-1">Choose someone from the list to start messaging.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-app flex items-center gap-3">
                  <img src={avatarFor(active.name)} alt={active.name} className="w-9 h-9 rounded-full" />
                  <div className="flex-1">
                    <p className="font-bold text-app text-sm">{active.name}</p>
                    <p className="text-xs text-muted-app">{active.role} · {active.username}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingThread ? (
                    <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                  ) : thread.length === 0 ? (
                    <p className="text-sm text-muted-app text-center py-6">No messages yet. Say hello 👋</p>
                  ) : (
                    thread.map((m) => {
                      const mine = m.senderId === myId;
                      return (
                        <motion.div key={m.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-blue-600 text-white rounded-br-sm" : "surface border border-app text-app rounded-bl-sm"}`}>
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            <p className={`text-[10px] mt-1 flex items-center gap-1 ${mine ? "text-blue-100 justify-end" : "text-muted-app"}`}>
                              {new Date(m.createdAt).toLocaleString()}
                              {mine && (m.isRead ? <CheckCheck size={12} /> : <Check size={12} />)}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                  <div ref={endRef} />
                </div>

                {/* Quick presets */}
                <div className="px-3 pt-2 flex flex-wrap gap-1.5 border-t border-app">
                  {QUICK_PRESETS.map((p, i) => (
                    <button key={i} onClick={() => setDraft(p)} className="text-[11px] px-2 py-1 rounded-full surface border border-app text-muted-app hover:text-app inline-flex items-center gap-1">
                      <Sparkles size={10} /> {p.slice(0, 28)}…
                    </button>
                  ))}
                </div>

                {/* Composer */}
                <div className="p-3 flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    rows={2}
                    placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                    className="input-base flex-1 text-sm resize-none"
                  />
                  <button onClick={send} disabled={sending || !draft.trim()} className="btn-primary px-4 py-2.5 disabled:opacity-50">
                    <Send size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminQuickMessages;

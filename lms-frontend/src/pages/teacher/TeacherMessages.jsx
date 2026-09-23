import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, Loader2, Search, Users, ShieldCheck, Paperclip, FileText, X, Hash, CheckCheck, Check } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import useRealtime from "../../hooks/useRealtime";
import api, { fileUrl } from "../../services/api";
import { useToast } from "../../context/ToastContext";

const fmtTime = (d) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d;
  }
};

const initials = (name = "") =>
  name.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

// Display-only: course groups are stored as "CODE — Title" but must be shown
// as Course Name first, then Course Code (e.g. "Intro to CS — CS-101").
const courseGroupLabel = (name = "", code = "") => {
  if (!name) return name;
  const parts = name.split(" — ");
  if (parts.length >= 2) {
    const first = parts[0].trim();
    const title = parts.slice(1).join(" — ").trim();
    const cc = code || first;
    return `${title} — ${cc}`;
  }
  return code ? `${name} — ${code}` : name;
};

const Attachment = ({ msg }) => {
  if (!msg.attachmentUrl) return null;
  const url = fileUrl(msg.attachmentUrl);
  const isImage = msg.attachmentType === "image" || /^image\//.test(msg.attachmentType || "");
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mt-1.5">
        <img src={url} alt={msg.attachmentName || "image"} className="max-w-[220px] max-h-[220px] rounded-lg border border-black/10" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/10 hover:bg-black/20 transition-colors">
      <FileText size={16} />
      <span className="text-xs truncate max-w-[180px]">{msg.attachmentName || "Attachment"}</span>
    </a>
  );
};

const TeacherMessages = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.teacher.messageContacts(), []);
  const contacts = useMemo(() => data?.contacts || [], [data]);
  const groups = useMemo(() => data?.groups || [], [data]);

  // active = { kind: 'direct'|'group', ...contactOrGroup }
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [convError, setConvError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [attachment, setAttachment] = useState(null); // { attachmentUrl, attachmentName, attachmentType }
  const [uploading, setUploading] = useState(false);
  const [presence, setPresence] = useState({}); // userId -> bool
  const [otherOnline, setOtherOnline] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    // seed presence from contacts
    const p = {};
    for (const c of contacts) p[c.id] = !!c.online;
    setPresence((prev) => ({ ...prev, ...p }));
  }, [contacts]);

  useEffect(() => {
    if (!active && contacts.length > 0) setActive({ kind: "direct", ...contacts[0] });
  }, [contacts, active]);

  const loadConversation = useCallback((a) => {
    if (!a) return;
    setLoadingConv(true);
    setConvError("");
    const p = a.kind === "group" ? api.teacher.groupConversation(a.id) : api.teacher.conversation(a.id);
    p
      .then((res) => {
        setMessages(res.messages || []);
        if (a.kind === "direct") setOtherOnline(!!res.online);
      })
      .catch((e) => setConvError(e.message || "Failed to load conversation"))
      .finally(() => setLoadingConv(false));
  }, []);

  useEffect(() => {
    if (active) loadConversation(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.kind, active?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ---- Real-time stream ----
  useRealtime(api.teacher.eventsUrl, {
    message: (d) => {
      const a = activeRef.current;
      if (!d) return;
      if (d.action === "direct") {
        // incoming/outgoing direct message
        if (a && a.kind === "direct" && (String(d.from) === String(a.id) || String(d.to) === String(a.id))) {
          setMessages((m) => (m.some((x) => x.id === d.message.id) ? m : [...m, { ...d.message, mine: String(d.from) !== String(a.id) ? true : false }]));
        } else {
          reload();
        }
      } else if (d.action === "group") {
        if (a && a.kind === "group" && String(d.groupId) === String(a.id)) {
          setMessages((m) => (m.some((x) => x.id === d.message.id) ? m : [...m, d.message]));
        } else {
          reload();
        }
      } else if (d.action === "read") {
        // other party read my messages
        if (a && a.kind === "direct" && String(d.by) === String(a.id)) {
          setMessages((m) => m.map((x) => (x.mine ? { ...x, isRead: true } : x)));
        }
      }
    },
    presence: (d) => {
      if (!d) return;
      setPresence((prev) => ({ ...prev, [d.userId]: d.online }));
      const a = activeRef.current;
      if (a && a.kind === "direct" && String(d.userId) === String(a.id)) setOtherOnline(d.online);
    },
  }, []);

  const pickFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.teacher.uploadMessageAttachment(fd);
      setAttachment({ attachmentUrl: res.attachmentUrl, attachmentName: res.attachmentName, attachmentType: res.attachmentType });
    } catch (e) {
      toast(e.message || "Failed to upload attachment", { type: "error" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const send = async () => {
    const body = draft.trim();
    if ((!body && !attachment) || !active) return;
    setSending(true);
    try {
      const payload = { body, ...(attachment || {}) };
      const res = active.kind === "group"
        ? await api.teacher.sendGroupMessage(active.id, payload)
        : await api.teacher.sendMessage(active.id, payload);
      setMessages((m) => (m.some((x) => x.id === res.message.id) ? m : [...m, res.message]));
      setDraft("");
      setAttachment(null);
    } catch (e) {
      toast(e.message || "Failed to send message", { type: "error" });
    } finally {
      setSending(false);
    }
  };

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.roll || "").toLowerCase().includes(q) ||
        (c.courses || []).join(" ").toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => !q || g.name.toLowerCase().includes(q) || (g.courseCode || "").toLowerCase().includes(q));
  }, [groups, search]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Messages" subtitle="Chat with students and course groups" icon="MessageSquare" breadcrumb={["Dashboard", "Messages"]} />
        <Skeleton className="h-[560px] rounded-2xl" />
      </div>
    );
  }

  const isOnline = active && active.kind === "direct" ? otherOnline || presence[active.id] : false;

  return (
    <div>
      <PageHeader title="Messages" subtitle="Chat with students and course groups" icon="MessageSquare" breadcrumb={["Dashboard", "Messages"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : contacts.length === 0 && groups.length === 0 ? (
        <EmptyState
          icon="MessageSquare"
          title="No conversations yet"
          description="Students enrolled in your active course offerings and auto-created course groups will appear here."
        />
      ) : (
        <div className="grid lg:grid-cols-3 gap-4 h-[560px]">
          {/* Sidebar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people & groups..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {/* Course groups */}
              {filteredGroups.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Hash size={11} /> Course Groups</p>
                  {filteredGroups.map((g) => (
                    <button
                      key={`g${g.id}`}
                      onClick={() => setActive({ kind: "group", ...g })}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-50 dark:border-slate-800/60 ${
                        active?.kind === "group" && active?.id === g.id ? "bg-emerald-50 dark:bg-emerald-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                        <Hash size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{courseGroupLabel(g.name, g.courseCode)}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{g.memberCount} members</p>
                      </div>
                      {g.unread > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white">{g.unread}</span>}
                    </button>
                  ))}
                </div>
              )}
              {/* Students */}
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><Users size={11} /> Students ({contacts.length})</p>
              {filteredContacts.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-app">No students match your search.</div>
              ) : (
                filteredContacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActive({ kind: "direct", ...c })}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-50 dark:border-slate-800/60 ${
                      active?.kind === "direct" && active?.id === c.id ? "bg-emerald-50 dark:bg-emerald-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="relative shrink-0">
                      {c.photoUrl ? (
                        <img src={fileUrl(c.photoUrl)} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold">{initials(c.name)}</div>
                      )}
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${presence[c.id] ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{c.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {c.roll ? <span className="font-mono">{c.roll}</span> : null}
                        {c.roll && (c.courses || []).length ? " · " : ""}
                        {(c.courses || []).join(", ")}
                      </p>
                    </div>
                    {c.unread > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white">{c.unread}</span>}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Conversation */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col">
            {active ? (
              <>
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                  {active.kind === "group" ? (
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold"><Hash size={16} /></div>
                  ) : active.photoUrl ? (
                    <img src={fileUrl(active.photoUrl)} alt={active.name} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold">{initials(active.name)}</div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{active.kind === "group" ? courseGroupLabel(active.name, active.courseCode) : active.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {active.kind === "group" ? (
                        `${active.memberCount} members`
                      ) : (
                        <span className={isOnline ? "text-emerald-500 font-medium" : ""}>{isOnline ? "● Online" : "Offline"}</span>
                      )}
                    </p>
                  </div>
                  {active.kind === "direct" && (
                    <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck size={11} /> Instructor
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/30">
                  {loadingConv ? (
                    <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-2/3 rounded-2xl" />)}</div>
                  ) : convError ? (
                    <ErrorState description={convError} onRetry={() => loadConversation(active)} />
                  ) : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-slate-400">No messages yet. Start the conversation!</div>
                  ) : (
                    messages.map((m) => (
                      <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[75%] px-3.5 py-2 rounded-2xl ${
                            m.mine
                              ? "bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-br-sm"
                              : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm border border-slate-100 dark:border-slate-700"
                          }`}
                        >
                          {active.kind === "group" && !m.mine && <p className="text-[11px] font-bold opacity-80 mb-0.5">{m.senderName}</p>}
                          {m.subject && <p className="text-[11px] font-bold opacity-80 mb-0.5">{m.subject}</p>}
                          {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                          <Attachment msg={m} />
                          <p className={`text-[10px] mt-1 flex items-center gap-1 justify-end ${m.mine ? "text-white/70" : "text-slate-400"}`}>
                            {fmtTime(m.createdAt)}
                            {m.mine && active.kind === "direct" && (m.isRead ? <CheckCheck size={12} /> : <Check size={12} />)}
                          </p>
                        </div>
                      </motion.div>
                    ))
                  )}
                  <div ref={endRef} />
                </div>

                {attachment && (
                  <div className="px-3 pt-2 flex items-center gap-2">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                      <Paperclip size={13} /> <span className="truncate max-w-[200px]">{attachment.attachmentName}</span>
                      <button onClick={() => setAttachment(null)} className="text-slate-400 hover:text-rose-500"><X size={13} /></button>
                    </div>
                  </div>
                )}

                <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                  <input ref={fileRef} type="file" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip" />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach file" className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
                    {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                  </button>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={`Message ${active.name}...`}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button onClick={send} disabled={sending || (!draft.trim() && !attachment)} className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white hover:scale-105 active:scale-95 transition-transform disabled:opacity-50">
                    {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                <MessageSquare size={32} className="mr-2 opacity-40" /> Select a conversation
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherMessages;

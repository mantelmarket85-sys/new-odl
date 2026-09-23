import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, Bot, User, BookOpen, Lightbulb, Brain, FileQuestion,
  Code2, Calculator, RefreshCw, AlertTriangle, GraduationCap, Loader2,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

// Course-agnostic starter prompts — work for any subject.
const GENERIC_PROMPTS = [
  "Explain the most important concept in this course simply.",
  "Give me a step-by-step worked example.",
  "What should I revise before the exam?",
  "Create 3 practice questions with answers.",
];

const fmtTime = (d) => {
  try { return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};

const AITutor = () => {
  const { toast } = useToast();
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [activeCourse, setActiveCourse] = useState(null); // courseCode | null (general)
  const [messages, setMessages] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef(null);

  // Load enrolled courses (real, dynamic).
  useEffect(() => {
    (async () => {
      try {
        const res = await api.student.courses();
        const list = (res?.courses || []).map((c) => ({
          code: c.offering?.course?.code,
          title: c.offering?.course?.title,
          offeringId: c.offeringId,
        })).filter((c) => c.code);
        setCourses(list);
      } catch {
        setCourses([]);
      } finally {
        setCoursesLoading(false);
      }
    })();
  }, []);

  // Load conversation history (real, persisted).
  useEffect(() => {
    (async () => {
      try {
        const res = await api.student.aiTutorHistory();
        const msgs = (res?.messages || []).map((m) => ({
          id: m.id,
          role: m.role === "assistant" ? "ai" : "user",
          text: m.content,
          courseCode: m.courseCode,
          at: m.createdAt,
        }));
        setMessages(msgs);
        setAiConfigured(res?.aiConfigured !== false);
      } catch {
        setMessages([]);
      } finally {
        setHistoryLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const currentCourse = useMemo(
    () => courses.find((c) => c.code === activeCourse) || null,
    [courses, activeCourse],
  );

  const send = useCallback(async (text) => {
    const q = (text || input).trim();
    if (!q || thinking) return;
    const userMsg = { id: `u${Date.now()}`, role: "user", text: q, courseCode: activeCourse, at: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setThinking(true);
    try {
      const res = await api.student.aiTutorChat({ message: q, courseCode: activeCourse });
      setAiConfigured(res?.aiConfigured !== false);
      setMessages((m) => [...m, {
        id: res?.messageId || `a${Date.now()}`,
        role: "ai",
        text: res?.reply || "I couldn't generate a response. Please try again.",
        courseCode: activeCourse,
        at: res?.createdAt || new Date().toISOString(),
      }]);
    } catch (e) {
      toast(e.message || "The AI Tutor is unavailable right now.", { type: "error" });
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: "ai", text: "Sorry, I could not reach the AI service. Please try again in a moment.", at: new Date().toISOString() }]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, activeCourse, toast]);

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const courseIcon = (code) => {
    if (/^CS|^IT|^SE/i.test(code || "")) return Code2;
    if (/^MT|^MATH/i.test(code || "")) return Calculator;
    return BookOpen;
  };

  const showWelcome = !historyLoading && messages.length === 0;

  return (
    <div className="relative">
      <PageHeader
        title="AI Tutor"
        subtitle="Your personal academic assistant — ask anything about your enrolled courses"
        icon="Sparkles"
        breadcrumb={["Dashboard", "AI Tutor"]}
      />

      {/* AI availability banner */}
      {!aiConfigured && (
        <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p>The live AI engine is currently unavailable on this server. The tutor will still give you structured study guidance for your questions.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* ---- Course rail ---- */}
        <aside className="space-y-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <GraduationCap size={13} /> Your Courses
            </p>
            {coursesLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-xl" />)}</div>
            ) : (
              <div className="space-y-1.5">
                <button
                  onClick={() => setActiveCourse(null)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition ${activeCourse === null ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md" : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"}`}
                >
                  <Sparkles size={16} className="shrink-0" />
                  <span className="text-sm font-semibold">General Tutor</span>
                </button>
                {courses.map((c) => {
                  const Icon = courseIcon(c.code);
                  const active = activeCourse === c.code;
                  return (
                    <button
                      key={c.code}
                      onClick={() => setActiveCourse(c.code)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition ${active ? "bg-gradient-to-br from-primary-600 to-blue-600 text-white shadow-md" : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"}`}
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="min-w-0">
                        <span className={`block text-[10px] font-mono font-bold ${active ? "text-white/80" : "text-primary-600"}`}>{c.code}</span>
                        <span className="block text-sm font-semibold leading-tight truncate">{c.title}</span>
                      </span>
                    </button>
                  );
                })}
                {courses.length === 0 && (
                  <p className="text-xs text-slate-400 px-2 py-3">No enrolled courses yet. The general tutor is always available.</p>
                )}
              </div>
            )}
          </div>

          {/* Capabilities */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5"><Sparkles size={13} className="text-primary-600" /> What I can do</p>
            <div className="space-y-1.5">
              {[
                { icon: Brain, label: "Explain concepts clearly", color: "text-blue-600" },
                { icon: Calculator, label: "Step-by-step solutions", color: "text-violet-600" },
                { icon: FileQuestion, label: "Practice questions", color: "text-rose-600" },
                { icon: Lightbulb, label: "Study tips & strategies", color: "text-amber-600" },
              ].map((c) => (
                <div key={c.label} className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                  <c.icon size={14} className={c.color} /> {c.label}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ---- Chat ---- */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col h-[640px]">
          {/* Header */}
          <div className="px-5 py-3 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Bot size={20} />
              </div>
              <div>
                <p className="font-bold text-sm flex items-center gap-1.5">AUST AI Tutor <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-400/30"><span className="w-1.5 h-1.5 bg-emerald-300 rounded-full animate-pulse" /> Online</span></p>
                <p className="text-[11px] opacity-90">{currentCourse ? `${currentCourse.code} — ${currentCourse.title}` : "General academic assistance"}</p>
              </div>
            </div>
            <button onClick={() => setMessages([])} className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold flex items-center gap-1"><RefreshCw size={11} /> New Chat</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 dark:bg-slate-900/30">
            {historyLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
            ) : showWelcome ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white mb-4 shadow-lg">
                  <Bot size={30} />
                </div>
                <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">Hi! I'm your AI Tutor 🎓</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                  {currentCourse ? `Ask me anything about ${currentCourse.title}.` : "Pick a course on the left for focused help, or ask me anything below."}
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "ai" && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shrink-0"><Bot size={14} /></div>
                    )}
                    <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-gradient-to-br from-primary-600 to-blue-600 text-white" : "bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200"}`}>
                      {m.courseCode && <p className={`text-[10px] font-mono font-bold mb-1 ${m.role === "user" ? "text-white/70" : "text-primary-600"}`}>{m.courseCode}</p>}
                      <p className="text-sm whitespace-pre-line leading-relaxed">{m.text}</p>
                      {m.at && <p className={`text-[10px] mt-1 ${m.role === "user" ? "text-white/60" : "text-slate-400"}`}>{fmtTime(m.at)}</p>}
                    </div>
                    {m.role === "user" && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white shrink-0"><User size={14} /></div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}

            {/* Typing indicator */}
            {thinking && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shrink-0"><Bot size={14} /></div>
                <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl px-4 py-3">
                  <div className="flex gap-1.5 items-center">
                    <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: "0.12s" }} />
                    <span className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: "0.24s" }} />
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={endRef} />
          </div>

          {/* Suggested prompts (only when conversation is short) */}
          {messages.length <= 1 && !historyLoading && (
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5"><Lightbulb size={11} /> Try asking</p>
              <div className="flex flex-wrap gap-2">
                {GENERIC_PROMPTS.map((p, i) => (
                  <motion.button key={p} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => send(p)} className="text-xs px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-400 hover:bg-primary-50/40 dark:hover:bg-primary-950/30 transition">
                    {p}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows="1"
                placeholder={currentCourse ? `Ask about ${currentCourse.title}…` : "Ask the AI tutor anything…"}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 max-h-28"
              />
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => send()} disabled={!input.trim() || thinking} className="p-3 rounded-xl bg-gradient-to-br from-primary-600 to-blue-600 text-white shadow-lg shadow-primary-500/30 disabled:opacity-40 disabled:cursor-not-allowed">
                {thinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AITutor;

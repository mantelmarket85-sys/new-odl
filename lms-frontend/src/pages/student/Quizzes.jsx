import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FileQuestion, Search, Clock, Award, CheckCircle2, AlertCircle,
  Hash, Play, Eye, Loader2,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

/* Backend attempt status: none → Available, IN_PROGRESS → In Progress,
   SUBMITTED → Submitted (manual review), GRADED → Completed. */
const stateOf = (q) => {
  if (!q.attempt) return "AVAILABLE";
  return q.attempt.status; // IN_PROGRESS | SUBMITTED | GRADED
};
const STATE_META = {
  AVAILABLE: { label: "Available", icon: AlertCircle, bg: "bg-amber-100 dark:bg-amber-500/15", text: "text-amber-700 dark:text-amber-300" },
  IN_PROGRESS: { label: "In Progress", icon: Clock, bg: "bg-blue-100 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-300" },
  SUBMITTED: { label: "Under Review", icon: Clock, bg: "bg-purple-100 dark:bg-purple-500/15", text: "text-purple-700 dark:text-purple-300" },
  GRADED: { label: "Completed", icon: Award, bg: "bg-emerald-100 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300" },
};

const Quizzes = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { data, loading, error, reload } = useApi(() => api.student.quizzes(), []);
  const [search, setSearch] = useState(searchParams.get("course") || "");
  const [filter, setFilter] = useState("All");

  // Deep-link from a course card: preset the course filter via ?course=<code>
  useEffect(() => {
    const c = searchParams.get("course");
    if (c) setSearch(c);
  }, [searchParams]);

  // Quiz-taking session state
  const [session, setSession] = useState(null); // { quiz, questions, attempt }
  const [answers, setAnswers] = useState({});
  const [starting, setStarting] = useState(null); // quiz id being started
  const [submitting, setSubmitting] = useState(false);
  const [resultView, setResultView] = useState(null); // completed quiz to view

  const quizzes = useMemo(() => data?.quizzes || [], [data]);

  const totals = useMemo(() => {
    const t = { total: quizzes.length, available: 0, completed: 0 };
    quizzes.forEach((q) => {
      const s = stateOf(q);
      if (s === "AVAILABLE" || s === "IN_PROGRESS") t.available++;
      else if (s === "GRADED" || s === "SUBMITTED") t.completed++;
    });
    return t;
  }, [quizzes]);

  const filtered = useMemo(() => {
    return quizzes
      .filter((q) => {
        if (filter === "All") return true;
        const s = stateOf(q);
        if (filter === "Available") return s === "AVAILABLE" || s === "IN_PROGRESS";
        if (filter === "Completed") return s === "GRADED" || s === "SUBMITTED";
        return true;
      })
      .filter((q) => `${q.title} ${q.courseCode}`.toLowerCase().includes(search.toLowerCase()));
  }, [quizzes, filter, search]);

  const startQuiz = async (quiz) => {
    setStarting(quiz.id);
    try {
      const res = await api.student.startQuiz(quiz.id);
      setSession({ quiz: res.quiz, questions: res.questions || [], attempt: res.attempt });
      setAnswers({});
    } catch (e) {
      toast(e.message || "Could not start quiz", { type: "error" });
    } finally {
      setStarting(null);
    }
  };

  const submitQuiz = async () => {
    if (!session) return;
    // Backend expects an object keyed by questionId. For MCQ/TRUEFALSE the
    // value is the selected option index (as string); for SHORT it is text.
    const payload = {};
    session.questions.forEach((q) => {
      const v = answers[q.id];
      if (v != null && v !== "") payload[String(q.id)] = String(v);
    });
    setSubmitting(true);
    try {
      const res = await api.student.submitQuiz(session.quiz.id, payload);
      if (res.autoGraded || res.attempt?.status === "GRADED") {
        toast(`Quiz submitted — scored ${res.attempt?.score ?? res.score}/${res.attempt?.maxScore ?? res.maxScore}`, { type: "success" });
      } else {
        toast("Quiz submitted — pending review for short answers", { type: "success" });
      }
      setSession(null);
      await reload();
    } catch (e) {
      toast(e.message || "Submission failed", { type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="My Quizzes"
        subtitle="All quizzes across your registered courses"
        icon="FileQuestion"
        breadcrumb={["Dashboard", "Quizzes"]}
        actions={
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quizzes..." className="pl-9 pr-3 py-2 input-base w-full sm:w-64" />
          </div>
        }
      />

      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
          </div>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : quizzes.length === 0 ? (
        <EmptyState icon="FileQuestion" title="No quizzes yet" description="Your instructors haven't published any quizzes for your registered courses." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total", value: totals.total, icon: FileQuestion, color: "from-blue-500 to-indigo-500" },
              { label: "To Take", value: totals.available, icon: AlertCircle, color: "from-amber-500 to-orange-500" },
              { label: "Completed", value: totals.completed, icon: Award, color: "from-emerald-500 to-teal-500" },
              { label: "Avg Score", value: avgScore(quizzes), icon: CheckCircle2, color: "from-cyan-500 to-blue-500" },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card-base p-4 flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.color} text-white flex items-center justify-center shadow`}><s.icon size={20} /></div>
                <div><p className="text-2xl font-extrabold text-app tabular">{s.value}</p><p className="text-xs text-muted-app">{s.label}</p></div>
              </motion.div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-5">
            {["All", "Available", "Completed"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${filter === f ? "bg-primary-600 text-white" : "card-base text-secondary-app hover:border-primary-300"}`}>{f}</button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="card-base p-10 text-center"><FileQuestion size={32} className="mx-auto text-muted-app mb-2" /><p className="text-app font-semibold">No matching quizzes</p></div>
          ) : (
            <div className="space-y-3">
              {filtered.map((q, idx) => {
                const s = stateOf(q);
                const meta = STATE_META[s] || STATE_META.AVAILABLE;
                const Icon = meta.icon;
                const obtained = q.attempt?.score;
                return (
                  <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }} className="card-base p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-primary-600">{q.courseCode}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.bg} ${meta.text}`}>{meta.label}</span>
                        </div>
                        <h4 className="font-bold text-app mt-1">{q.title}</h4>
                        {q.description && <p className="text-xs text-muted-app mt-0.5">{q.description}</p>}
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-app">
                          <span className="flex items-center gap-1"><Clock size={12} /> {q.durationMin} min</span>
                          <span className="flex items-center gap-1"><Hash size={12} /> {q.questionCount} Q</span>
                          <span className="flex items-center gap-1"><Award size={12} /> {q.totalMarks} marks</span>
                          {obtained != null && <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold"><CheckCircle2 size={12} /> Scored {obtained}/{q.attempt.maxScore}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {(s === "AVAILABLE" || s === "IN_PROGRESS") && (
                          <button onClick={() => startQuiz(q)} disabled={starting === q.id} className="btn-primary !py-2 !px-3 text-xs">
                            {starting === q.id ? <><Loader2 size={12} className="animate-spin" /> Loading…</> : <><Play size={12} /> {s === "IN_PROGRESS" ? "Resume" : "Start"}</>}
                          </button>
                        )}
                        {(s === "GRADED" || s === "SUBMITTED") && (
                          <button onClick={() => setResultView(q)} className="btn-secondary !py-2 !px-3 text-xs"><Eye size={12} /> View</button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Quiz-taking modal */}
      <Modal open={!!session} onClose={() => !submitting && setSession(null)} title={session?.quiz?.title} subtitle={`${session?.quiz?.durationMin} min · ${session?.quiz?.totalMarks} marks`} icon={FileQuestion} maxWidth="max-w-3xl">
        {session && (
          <div className="space-y-5">
            {session.questions.map((q, i) => (
              <div key={q.id} className="card-base p-4">
                <div className="flex items-start gap-2">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-app">{q.text} <span className="text-xs text-muted-app font-normal">({q.marks} marks)</span></p>
                    <div className="mt-3 space-y-2">
                      {(q.type === "MCQ" || q.type === "TRUEFALSE") ? (
                        (q.options || []).map((opt, oi) => (
                          <label key={oi} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition ${String(answers[q.id]) === String(oi) ? "border-primary-500 bg-primary-50 dark:bg-primary-950/30" : "border-app hover:border-primary-300"}`}>
                            <input type="radio" name={`q-${q.id}`} value={oi} checked={String(answers[q.id]) === String(oi)} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} />
                            <span className="text-sm text-app">{opt}</span>
                          </label>
                        ))
                      ) : (
                        <textarea
                          value={answers[q.id] || ""}
                          onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                          rows={3}
                          placeholder="Type your answer…"
                          className="input-base w-full"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <button onClick={() => setSession(null)} disabled={submitting} className="btn-secondary text-sm">Cancel</button>
              <button onClick={submitQuiz} disabled={submitting} className="btn-primary text-sm">
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : "Submit Quiz"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Completed result modal */}
      <Modal open={!!resultView} onClose={() => setResultView(null)} title={resultView?.title} subtitle={resultView ? `${resultView.courseCode}` : ""} icon={Award}>
        {resultView && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="card-base p-3"><p className="text-xs text-muted-app">Questions</p><p className="font-bold text-app">{resultView.questionCount}</p></div>
              <div className="card-base p-3"><p className="text-xs text-muted-app">Total Marks</p><p className="font-bold text-app">{resultView.totalMarks}</p></div>
            </div>
            {resultView.attempt?.score != null ? (
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15 border border-emerald-300/40 dark:border-emerald-500/30">
                <p className="text-xs text-muted-app">Your Score</p>
                <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-300 mt-1 tabular">{resultView.attempt.score} <span className="text-lg text-secondary-app font-bold">/ {resultView.attempt.maxScore}</span></p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold">
                Submitted — pending instructor review.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

function avgScore(quizzes) {
  const graded = quizzes.filter((q) => q.attempt?.score != null && q.attempt?.maxScore);
  if (graded.length === 0) return "—";
  const pct = graded.reduce((a, q) => a + (q.attempt.score / q.attempt.maxScore) * 100, 0) / graded.length;
  return `${Math.round(pct)}%`;
}

export default Quizzes;

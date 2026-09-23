import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Clock, Award, Play, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Flag, Send, Eye, BookOpen, X } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import { useToast } from "../../context/ToastContext";

const mockExams = (kind) => [
  { id: `${kind}-1`, code: "CS-301", course: "Software Engineering", title: `${kind} Term Examination`, duration: 90, totalMarks: 60, questions: 30, date: "2025-05-25", time: "09:00 AM", status: "Upcoming", instructor: "Dr. Muhammad Naeem" },
  { id: `${kind}-2`, code: "CS-302", course: "Computer Networks", title: `${kind} Term Examination`, duration: 90, totalMarks: 60, questions: 28, date: "2025-05-27", time: "11:00 AM", status: "Available", instructor: "Dr. Muhammad Zeeshan" },
  { id: `${kind}-3`, code: "CS-303", course: "Data Structures", title: `${kind} Term Examination`, duration: 90, totalMarks: 60, questions: 32, date: "2025-05-20", time: "02:00 PM", status: "Submitted", instructor: "Dr. Asim Shahzad", obtained: 52, feedback: "Good understanding of trees and graphs. Improve on Big-O analysis." },
  { id: `${kind}-4`, code: "CS-304", course: "Web Engineering", title: `${kind} Term Examination`, duration: 90, totalMarks: 60, questions: 30, date: "2025-05-18", time: "10:00 AM", status: "Graded", instructor: "Dr. Asad Mehmood", obtained: 55, feedback: "Excellent project work. Strong understanding of React hooks and state management." },
];

const sampleQuestions = [
  { id: 1, type: "mcq", text: "Which SDLC model is most suitable for projects with rapidly changing requirements?", options: ["Waterfall", "Agile/Scrum", "Spiral", "V-Model"], marks: 2 },
  { id: 2, type: "mcq", text: "What is the primary purpose of a use case diagram?", options: ["Database design", "Capture functional requirements", "UI mockup", "Code optimization"], marks: 2 },
  { id: 3, type: "short", text: "Define 'Technical Debt' in software engineering (2-3 lines).", marks: 5 },
  { id: 4, type: "mcq", text: "Which testing type validates against business requirements?", options: ["Unit Testing", "Integration Testing", "Acceptance Testing", "Smoke Testing"], marks: 2 },
  { id: 5, type: "descriptive", text: "Explain the differences between Functional and Non-Functional Requirements. Provide 3 examples each.", marks: 10 },
  { id: 6, type: "mcq", text: "What does CI/CD stand for?", options: ["Code Integration / Code Deployment", "Continuous Integration / Continuous Delivery", "Critical Implementation / Critical Deployment", "Component Integration / Component Delivery"], marks: 2 },
  { id: 7, type: "short", text: "List 3 advantages of Microservices architecture.", marks: 5 },
  { id: 8, type: "descriptive", text: "Draw and explain the SDLC for an e-commerce website. Include all phases.", marks: 12 },
];

const StudentExam = ({ kind = "Mid" }) => {
  const [exams] = useState(mockExams(kind));
  const [active, setActive] = useState(null); // exam being taken
  const [review, setReview] = useState(null); // graded exam to review

  return (
    <div>
      <PageHeader
        title={`${kind} Term Examinations`}
        subtitle={`${kind === "Mid" ? "Mid-semester" : "End-semester"} online exams · Attempt, submit, review`}
        icon="FileText"
        breadcrumb={["Dashboard", `${kind} Term Exam`]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Upcoming" value={exams.filter(e => e.status === "Upcoming").length} icon="Clock" color="amber" delay={0.05} />
        <StatCard title="Available Now" value={exams.filter(e => e.status === "Available").length} icon="Play" color="emerald" delay={0.1} />
        <StatCard title="Submitted" value={exams.filter(e => e.status === "Submitted").length} icon="Send" color="violet" delay={0.15} />
        <StatCard title="Graded" value={exams.filter(e => e.status === "Graded").length} icon="Award" color="blue" delay={0.2} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {exams.map((e, i) => (
          <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card-base overflow-hidden">
            <div className={`h-1.5 ${
              e.status === "Available" ? "bg-gradient-to-r from-emerald-500 to-teal-500" :
              e.status === "Upcoming" ? "bg-gradient-to-r from-amber-500 to-orange-500" :
              e.status === "Submitted" ? "bg-gradient-to-r from-violet-500 to-purple-500" :
              "bg-gradient-to-r from-blue-500 to-indigo-500"
            }`} />
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-blue-600 flex items-center justify-center text-white shadow-md">
                    <FileText size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-primary-600 font-bold">{e.code} — {e.course}</p>
                    <p className="font-display font-bold text-app text-base mt-0.5">{e.title}</p>
                    <p className="text-xs text-muted-app mt-0.5">{e.instructor}</p>
                  </div>
                </div>
                <Badge color={e.status === "Available" ? "emerald" : e.status === "Upcoming" ? "amber" : e.status === "Submitted" ? "violet" : "blue"}>{e.status}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                <div className="surface border border-app p-2 rounded-lg text-center"><Clock size={12} className="mx-auto text-muted-app mb-0.5" /><p className="font-bold text-app">{e.duration}m</p><p className="text-[10px] text-muted-app">Duration</p></div>
                <div className="surface border border-app p-2 rounded-lg text-center"><FileText size={12} className="mx-auto text-muted-app mb-0.5" /><p className="font-bold text-app">{e.questions}</p><p className="text-[10px] text-muted-app">Questions</p></div>
                <div className="surface border border-app p-2 rounded-lg text-center"><Award size={12} className="mx-auto text-muted-app mb-0.5" /><p className="font-bold text-app">{e.totalMarks}</p><p className="text-[10px] text-muted-app">Marks</p></div>
              </div>

              <p className="text-xs text-muted-app mb-3">📅 {e.date} at <b>{e.time}</b></p>

              {e.status === "Graded" && (
                <div className="mb-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Your Score</span>
                    <span className="font-display text-xl font-bold text-emerald-700 dark:text-emerald-400">{e.obtained}/{e.totalMarks} ({Math.round((e.obtained / e.totalMarks) * 100)}%)</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 italic line-clamp-2">"{e.feedback}"</p>
                </div>
              )}

              <div className="flex gap-2">
                {e.status === "Available" && <button onClick={() => setActive(e)} className="flex-1 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-lg hover:scale-[1.02] flex items-center justify-center gap-1"><Play size={12} /> Start Exam</button>}
                {e.status === "Upcoming" && <button disabled className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-muted-app text-xs font-bold rounded-lg cursor-not-allowed"><Clock size={12} className="inline mr-1" /> Not Yet Available</button>}
                {e.status === "Submitted" && <button className="flex-1 py-2 bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 text-xs font-bold rounded-lg">Awaiting Grading</button>}
                {e.status === "Graded" && <button onClick={() => setReview(e)} className="flex-1 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-bold rounded-lg hover:scale-[1.02] flex items-center justify-center gap-1"><Eye size={12} /> Review Paper</button>}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {active && <ExamRunner exam={active} onSubmit={() => setActive(null)} onCancel={() => setActive(null)} />}
        {review && <ReviewModal exam={review} onClose={() => setReview(null)} />}
      </AnimatePresence>
    </div>
  );
};

/* ── Exam Runner with timer + navigator ── */
const ExamRunner = ({ exam, onSubmit, onCancel }) => {
  const [questions] = useState(sampleQuestions.slice(0, 6));
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState({});
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(exam.duration * 60);
  const [showSubmit, setShowSubmit] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const t = setInterval(() => setTimeLeft(x => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (timeLeft === 0) { toast("Time's up — auto-submitting", { type: "warning" }); setTimeout(onSubmit, 1500); }
  }, [timeLeft]); // eslint-disable-line

  const formatT = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const q = questions[current];
  const answered = Object.keys(answers).length;
  const flaggedCount = Object.values(flagged).filter(Boolean).length;

  const setAns = (val) => setAnswers({ ...answers, [q.id]: val });
  const toggleFlag = () => setFlagged({ ...flagged, [q.id]: !flagged[q.id] });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-app flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-blue-600 flex items-center justify-center text-white">
            <FileText size={18} />
          </div>
          <div>
            <p className="font-bold text-app text-sm">{exam.title}</p>
            <p className="text-xs text-muted-app">{exam.code} — {exam.course}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono font-bold ${
            timeLeft < 300 ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 animate-pulse" : "bg-primary-100 text-primary-700 dark:bg-primary-950/40 dark:text-primary-400"
          }`}>
            <Clock size={14} /> {formatT(timeLeft)}
          </div>
          <button onClick={() => setShowSubmit(true)} className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white text-sm font-bold shadow-lg shadow-rose-500/30 flex items-center gap-1.5"><Send size={13} /> Submit</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Question area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-primary-100 dark:bg-primary-950/40 text-primary-700 dark:text-primary-400">Question {current + 1} of {questions.length}</span>
                <span className="text-xs font-semibold px-2 py-1 rounded surface border border-app text-app">{q.marks} marks</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white ${q.type === "mcq" ? "bg-blue-500" : q.type === "short" ? "bg-emerald-500" : "bg-violet-500"}`}>
                  {q.type === "mcq" ? "MCQ" : q.type === "short" ? "Short" : "Descriptive"}
                </span>
              </div>
              <button onClick={toggleFlag} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${flagged[q.id] ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400" : "surface border border-app text-muted-app"}`}>
                <Flag size={12} /> {flagged[q.id] ? "Flagged" : "Flag"}
              </button>
            </div>

            <motion.div key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-base p-6 mb-6">
              <h3 className="text-lg font-bold text-app leading-relaxed mb-5">{q.text}</h3>

              {q.type === "mcq" && (
                <div className="space-y-2.5">
                  {q.options.map((o, i) => (
                    <button key={i} onClick={() => setAns(i)} className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                      answers[q.id] === i
                        ? "border-primary-500 bg-primary-50 dark:bg-primary-950/30"
                        : "border-app surface hover:border-primary-300"
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${answers[q.id] === i ? "bg-primary-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-app"}`}>{String.fromCharCode(65 + i)}</div>
                        <span className="text-app">{o}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {q.type === "short" && (
                <input value={answers[q.id] || ""} onChange={e => setAns(e.target.value)} placeholder="Type your short answer..." className="input-base" />
              )}

              {q.type === "descriptive" && (
                <textarea value={answers[q.id] || ""} onChange={e => setAns(e.target.value)} placeholder="Write your detailed answer here..." rows="8" className="input-base resize-none" />
              )}
            </motion.div>

            <div className="flex items-center justify-between">
              <button onClick={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0} className="px-4 py-2 rounded-xl surface border border-app text-app font-semibold flex items-center gap-1.5 disabled:opacity-40">
                <ChevronLeft size={14} /> Previous
              </button>
              {current === questions.length - 1 ? (
                <button onClick={() => setShowSubmit(true)} className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> Submit Exam
                </button>
              ) : (
                <button onClick={() => setCurrent(Math.min(questions.length - 1, current + 1))} className="px-4 py-2 rounded-xl bg-primary-600 text-white font-semibold flex items-center gap-1.5">
                  Next <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: navigator */}
        <div className="w-64 bg-white dark:bg-slate-900 border-l border-app overflow-y-auto p-4 hidden md:block">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-app mb-3">Question Navigator</p>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {questions.map((qq, i) => {
              const isAnswered = answers[qq.id] !== undefined && answers[qq.id] !== "";
              const isFlagged = flagged[qq.id];
              const isCurrent = i === current;
              return (
                <button key={qq.id} onClick={() => setCurrent(i)} className={`relative aspect-square rounded-lg text-xs font-bold transition-all ${
                  isCurrent ? "ring-2 ring-primary-500 scale-110" : ""
                } ${
                  isAnswered ? "bg-emerald-500 text-white" : isFlagged ? "bg-amber-400 text-white" : "surface border border-app text-app hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}>
                  {i + 1}
                  {isFlagged && !isAnswered && <Flag size={8} className="absolute top-0.5 right-0.5" />}
                </button>
              );
            })}
          </div>

          <div className="space-y-2 mb-4 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg surface border border-app">
              <span className="text-muted-app">Answered</span>
              <span className="font-bold text-emerald-600">{answered}/{questions.length}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg surface border border-app">
              <span className="text-muted-app">Flagged</span>
              <span className="font-bold text-amber-600">{flaggedCount}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg surface border border-app">
              <span className="text-muted-app">Remaining</span>
              <span className="font-bold text-rose-600">{questions.length - answered}</span>
            </div>
          </div>

          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3">
            <p className="text-[10px] font-bold text-amber-800 dark:text-amber-300 mb-1">📋 Legend</p>
            <div className="space-y-1 text-[11px] text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> Answered</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400" /> Flagged</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-app surface" /> Not visited</div>
            </div>
          </div>
        </div>
      </div>

      {/* Submit confirm */}
      <Modal open={showSubmit} onClose={() => setShowSubmit(false)} title="Submit Exam?">
        <div className="space-y-3">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-4">
            <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1 flex items-center gap-1.5"><AlertCircle size={14} /> Final Confirmation</p>
            <p className="text-xs text-amber-800 dark:text-amber-300">Once submitted, you cannot change your answers.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="p-3 rounded-xl surface border border-app">
              <p className="text-2xl font-bold text-emerald-600">{answered}</p>
              <p className="text-[10px] text-muted-app uppercase">Answered</p>
            </div>
            <div className="p-3 rounded-xl surface border border-app">
              <p className="text-2xl font-bold text-amber-600">{flaggedCount}</p>
              <p className="text-[10px] text-muted-app uppercase">Flagged</p>
            </div>
            <div className="p-3 rounded-xl surface border border-app">
              <p className="text-2xl font-bold text-rose-600">{questions.length - answered}</p>
              <p className="text-[10px] text-muted-app uppercase">Unanswered</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowSubmit(false)} className="btn-secondary flex-1">Continue Exam</button>
            <button onClick={() => { onSubmit(); toast("Exam submitted ✓", { type: "success" }); }} className="btn-primary flex-1">
              <Send size={14} className="inline mr-1" /> Submit Now
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
};

/* ── Review modal ── */
const ReviewModal = ({ exam, onClose }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
    <motion.div initial={{ y: 30 }} animate={{ y: 0 }} className="w-full max-w-3xl my-8 surface rounded-3xl border border-app shadow-2xl overflow-hidden">
      <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Eye size={20} /> Review Graded Paper</h2>
          <p className="text-xs opacity-90 mt-0.5">{exam.code} — {exam.course} · {exam.title}</p>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-white/20 flex items-center justify-center"><X size={18} /></button>
      </div>
      <div className="p-6 max-h-[75vh] overflow-y-auto">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-5 mb-5 relative overflow-hidden">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-yellow-300/30 rounded-full blur-2xl" />
          <div className="relative">
            <p className="text-xs uppercase tracking-wider opacity-90 mb-1">Your Score</p>
            <p className="font-display text-5xl font-extrabold">{exam.obtained}<span className="text-2xl opacity-80">/{exam.totalMarks}</span></p>
            <p className="text-sm opacity-90 mt-1">{Math.round((exam.obtained / exam.totalMarks) * 100)}% · Grade: {exam.obtained >= exam.totalMarks * 0.85 ? "A" : exam.obtained >= exam.totalMarks * 0.7 ? "B" : "C"}</p>
          </div>
        </div>

        <div className="card-base p-4 mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-app mb-2">Instructor Feedback</p>
          <p className="text-sm text-app italic leading-relaxed">"{exam.feedback}"</p>
          <p className="text-xs text-muted-app mt-2">— {exam.instructor}</p>
        </div>

        <p className="text-xs font-bold uppercase tracking-wider text-muted-app mb-3">Question-wise Review</p>
        <div className="space-y-3">
          {sampleQuestions.slice(0, 4).map((q, i) => {
            const got = i === 1 ? 0 : q.marks;
            return (
              <div key={q.id} className="card-base p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-app">Q{i + 1}. {q.type.toUpperCase()}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${got === q.marks ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : got === 0 ? "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400" : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"}`}>
                    {got}/{q.marks} marks
                  </span>
                </div>
                <p className="text-sm text-app mb-2">{q.text}</p>
                <div className="text-xs text-muted-app italic">{got === q.marks ? "✓ Correct answer" : got === 0 ? "✗ Incorrect — review the topic" : "Partial credit awarded"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  </motion.div>
);

export default StudentExam;

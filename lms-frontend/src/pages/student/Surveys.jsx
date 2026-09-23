import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { ClipboardList, CheckCircle2, Clock, X, Star, Loader2, Lock } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

const fmtDate = (d) => {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; }
};

const qType = (t) => (t || "TEXT").toUpperCase();

const SurveyModal = ({ survey, onClose, onSubmitted }) => {
  const { toast } = useToast();
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const setAnswer = (qid, val) => setAnswers((a) => ({ ...a, [qid]: val }));

  const submit = async () => {
    // client-side required validation
    for (const q of survey.questions) {
      if (q.required && (answers[q.id] === undefined || answers[q.id] === "" || answers[q.id] === null)) {
        toast(`Please answer: ${q.text}`, { type: "error" });
        return;
      }
    }
    setSubmitting(true);
    try {
      await api.student.submitSurvey(survey.id, answers);
      toast("Survey submitted. Thank you!", { type: "success" });
      onSubmitted();
    } catch (e) {
      toast(e.message || "Failed to submit survey", { type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl max-h-[88vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">{survey.title}</h3>
            {survey.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{survey.description}</p>}
            {survey.isAnonymous && <p className="text-[11px] text-emerald-600 font-semibold mt-1">Your response is anonymous</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {survey.questions.map((q, i) => {
            const t = qType(q.type);
            return (
              <div key={q.id}>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  {i + 1}. {q.text} {q.required && <span className="text-rose-500">*</span>}
                </p>
                {t === "RATING" ? (
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setAnswer(q.id, n)} className="p-1">
                        <Star size={26} className={n <= (answers[q.id] || 0) ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"} />
                      </button>
                    ))}
                  </div>
                ) : t === "MCQ" || t === "SINGLE" || t === "CHOICE" ? (
                  <div className="space-y-1.5">
                    {(q.options || []).map((opt, oi) => {
                      const val = typeof opt === "object" ? (opt.value ?? opt.label) : opt;
                      const label = typeof opt === "object" ? (opt.label ?? opt.value) : opt;
                      return (
                        <label key={oi} className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer ${answers[q.id] === val ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-slate-200 dark:border-slate-700"}`}>
                          <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === val} onChange={() => setAnswer(q.id, val)} className="text-primary-600" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <textarea value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} rows="3" placeholder="Your answer..." className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900" />
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={submit} disabled={submitting} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Submit Response
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const Surveys = () => {
  const { data, loading, error, reload } = useApi(() => api.student.surveys(), []);
  const [active, setActive] = useState(null);

  const surveys = useMemo(() => data?.surveys || [], [data]);
  const pending = surveys.filter((s) => !s.completed && s.open);
  const completed = surveys.filter((s) => s.completed);
  const closed = surveys.filter((s) => !s.completed && !s.open);

  if (loading) {
    return (
      <div>
        <PageHeader title="Surveys & Feedback" subtitle="Share your feedback to improve teaching quality" icon="ClipboardList" breadcrumb={["Dashboard", "Surveys"]} />
        <div className="grid md:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      </div>
    );
  }

  const Card = ({ s, idx }) => (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 flex flex-col">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {s.courseCode && <span className="text-[10px] font-mono font-bold text-primary-600">{s.courseCode}</span>}
        {s.type && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{s.type}</span>}
        {s.isAnonymous && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Anonymous</span>}
      </div>
      <p className="font-display font-bold text-slate-900 dark:text-slate-100">{s.title}</p>
      {s.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{s.description}</p>}
      <div className="text-[11px] text-slate-400 mt-2">{s.questions?.length || 0} question{(s.questions?.length || 0) === 1 ? "" : "s"}{s.closesAt ? ` · closes ${fmtDate(s.closesAt)}` : ""}</div>
      <div className="mt-auto pt-3">
        {s.completed ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 size={14} /> Submitted {s.submittedAt ? fmtDate(s.submittedAt) : ""}</span>
        ) : !s.open ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Lock size={14} /> Closed</span>
        ) : (
          <button onClick={() => setActive(s)} className="btn-primary text-sm w-full">Respond Now</button>
        )}
      </div>
    </motion.div>
  );

  return (
    <div>
      <PageHeader title="Surveys & Feedback" subtitle="Share your feedback to improve teaching quality" icon="ClipboardList" breadcrumb={["Dashboard", "Surveys"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : surveys.length === 0 ? (
        <EmptyState icon="ClipboardList" title="No surveys yet" description="Course evaluation and feedback surveys will appear here when published." />
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div>
              <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><Clock size={15} className="text-amber-500" /> Pending ({pending.length})</h3>
              <div className="grid md:grid-cols-2 gap-3">{pending.map((s, i) => <Card key={s.id} s={s} idx={i} />)}</div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-500" /> Completed ({completed.length})</h3>
              <div className="grid md:grid-cols-2 gap-3">{completed.map((s, i) => <Card key={s.id} s={s} idx={i} />)}</div>
            </div>
          )}
          {closed.length > 0 && (
            <div>
              <h3 className="font-display font-bold text-sm text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><Lock size={15} className="text-slate-400" /> Closed ({closed.length})</h3>
              <div className="grid md:grid-cols-2 gap-3">{closed.map((s, i) => <Card key={s.id} s={s} idx={i} />)}</div>
            </div>
          )}
        </div>
      )}

      {active && <SurveyModal survey={active} onClose={() => setActive(null)} onSubmitted={() => { setActive(null); reload(); }} />}
    </div>
  );
};

export default Surveys;

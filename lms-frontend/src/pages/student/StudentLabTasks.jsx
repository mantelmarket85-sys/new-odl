import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical, Search, Calendar, CheckCircle2, AlertCircle, Upload, Award,
  Hourglass, Paperclip, Loader2, Download, ArrowLeft, BookOpen, RefreshCw, Clock,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import useApi from "../../hooks/useApi";
import api, { fileUrl } from "../../services/api";

/* ---- status meta (mirrors the Assignments module) ---- */
const STATUS_META = {
  PENDING: { label: "Not submitted", icon: AlertCircle, bg: "bg-amber-100 dark:bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  SUBMITTED: { label: "Submitted", icon: Hourglass, bg: "bg-blue-100 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  LATE: { label: "Submitted (Late)", icon: Hourglass, bg: "bg-orange-100 dark:bg-orange-500/15", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  GRADED: { label: "Graded", icon: Award, bg: "bg-emerald-100 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
};
const statusOf = (t) => (t.submission ? t.submission.status : "PENDING");
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const isOverdue = (t) => {
  if (t.submission) return false;
  try { return new Date(t.dueDate) < new Date(); } catch { return false; }
};

const COURSE_GRADIENTS = [
  "from-indigo-600 to-cyan-600", "from-violet-600 to-indigo-600", "from-cyan-600 to-sky-600",
  "from-blue-600 to-indigo-600", "from-teal-600 to-cyan-600", "from-fuchsia-600 to-purple-600",
];
const gradientFor = (key = "") => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return COURSE_GRADIENTS[h % COURSE_GRADIENTS.length];
};

const StudentLabTasks = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.student.labTasks(), []);

  const [selected, setSelected] = useState(null); // offeringId | null
  const [active, setActive] = useState(null);      // lab task in modal
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const courses = useMemo(() => data?.courses || [], [data]);

  // Live updates: teacher publishes a lab task / posts marks → refresh.
  useEffect(() => {
    let es;
    try {
      const url = api.student.eventsUrl && api.student.eventsUrl();
      if (url) {
        es = new EventSource(url);
        const onLab = () => reload();
        es.addEventListener("labtask", onLab);
        es.addEventListener("result", onLab);
      }
    } catch (_) { /* SSE optional */ }
    return () => { try { es && es.close(); } catch (_) {} };
  }, [reload]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.offeringId === selected) || null,
    [courses, selected]
  );

  const totals = useMemo(() => {
    let tasks = 0, submitted = 0, graded = 0, pending = 0;
    for (const c of courses) {
      for (const t of c.labTasks || []) {
        tasks += 1;
        const s = statusOf(t);
        if (s === "GRADED") graded += 1;
        else if (s === "SUBMITTED" || s === "LATE") submitted += 1;
        else pending += 1;
      }
    }
    return { tasks, submitted, graded, pending };
  }, [courses]);

  const handleSubmit = async (labTask) => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast("Please choose a file to upload", "error"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.student.submitLabTask(labTask.id, fd);
      toast("Lab work submitted", "success");
      setActive(null);
      if (fileRef.current) fileRef.current.value = "";
      await reload();
    } catch (e) {
      toast(e?.message || "Failed to submit lab work", "error");
    } finally {
      setUploading(false);
    }
  };

  /* ---------- LAB TASK LIST for the selected course ---------- */
  const CourseTasks = ({ course }) => (
    <div>
      <button
        onClick={() => setSelected(null)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:underline mb-4"
      >
        <ArrowLeft size={16} /> All lab courses
      </button>

      <div className={`rounded-2xl bg-gradient-to-r ${gradientFor(course.courseCode)} text-white p-5 mb-5`}>
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical size={22} />
          <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">Lab</span>
        </div>
        <p className="font-mono text-xs opacity-90">{course.courseCode} · LAB</p>
        <h3 className="font-display font-bold text-xl">{course.courseTitle} — Lab</h3>
        <p className="text-xs opacity-90 mt-1">
          {course.program?.shortForm || course.program?.name || ""}
          {course.semester ? ` · ${course.semester.title || `Semester ${course.semester.number}`}` : ""}
          {course.section ? ` · Sec ${course.section.name}` : ""}
        </p>
      </div>

      {(course.labTasks || []).length === 0 ? (
        <EmptyState icon="FlaskConical" title="No lab tasks yet" description="Your teacher has not published any lab tasks for this course." />
      ) : (
        <div className="space-y-3">
          {course.labTasks.map((t, i) => {
            const s = statusOf(t);
            const meta = STATUS_META[s] || STATUS_META.PENDING;
            const overdue = isOverdue(t);
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-display font-bold text-app">{t.title}</h4>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.text}`}>
                        <meta.icon size={11} /> {meta.label}
                      </span>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300">
                          <Clock size={11} /> Overdue
                        </span>
                      )}
                    </div>
                    {t.description && <p className="text-sm text-muted-app mt-1 line-clamp-2">{t.description}</p>}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-app mt-2">
                      <span className="inline-flex items-center gap-1"><Calendar size={12} /> Due {fmtDate(t.dueDate)}</span>
                      <span className="inline-flex items-center gap-1"><Award size={12} /> {t.totalMarks} marks</span>
                      {t.filePath && (
                        <a href={fileUrl(t.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 font-semibold hover:underline">
                          <Paperclip size={12} /> Task file
                        </a>
                      )}
                    </div>
                    {/* Req 3.2 — grade per lab task, shown in real time. */}
                    {s === "GRADED" && t.submission && (
                      <div className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-lg">
                        <Award size={14} /> {t.submission.marks} / {t.totalMarks}
                        {t.submission.feedback && <span className="font-normal text-muted-app"> · {t.submission.feedback}</span>}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setActive({ ...t, courseCode: course.courseCode, courseTitle: course.courseTitle })}
                    className="shrink-0 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-xs font-bold hover:opacity-90 inline-flex items-center gap-1"
                  >
                    {t.submission ? <><Upload size={13} /> Resubmit</> : <><Upload size={13} /> Submit</>}
                  </button>
                </div>
                {t.submission?.filePath && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-muted-app flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500" /> Submitted {fmtDate(t.submission.submittedAt)} ·
                    <a href={fileUrl(t.submission.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 font-semibold hover:underline">
                      <Download size={12} /> {t.submission.fileName || "your file"}
                    </a>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Lab Tasks"
        subtitle="Submit lab work and view your grade for each lab task"
        icon="FlaskConical"
        breadcrumb={["Dashboard", "Lab Tasks"]}
        actions={
          <button onClick={reload} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-semibold">
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
      ) : error ? (
        <ErrorState title="Couldn't load lab tasks" description={error} onRetry={reload} />
      ) : courses.length === 0 ? (
        <EmptyState
          icon="FlaskConical"
          title="No lab courses"
          description="You are not enrolled in any course with a lab component yet."
        />
      ) : selectedCourse ? (
        <CourseTasks course={selectedCourse} />
      ) : (
        <>
          {/* summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Lab Courses", value: courses.length, color: "from-indigo-500 to-cyan-600", icon: FlaskConical },
              { label: "Lab Tasks", value: totals.tasks, color: "from-blue-500 to-indigo-600", icon: BookOpen },
              { label: "Submitted", value: totals.submitted, color: "from-violet-500 to-purple-600", icon: Hourglass },
              { label: "Graded", value: totals.graded, color: "from-emerald-500 to-teal-600", icon: Award },
            ].map((s) => (
              <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-app">{s.label}</p>
                  <span className={`p-1.5 rounded-lg bg-gradient-to-br ${s.color} text-white`}><s.icon size={14} /></span>
                </div>
                <p className="font-display text-2xl font-extrabold text-app mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Req 3.2 — a SEPARATE card per lab course. */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c, i) => {
              const tasks = c.labTasks || [];
              const graded = tasks.filter((t) => statusOf(t) === "GRADED").length;
              const pending = tasks.filter((t) => statusOf(t) === "PENDING").length;
              return (
                <motion.button
                  key={c.offeringId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setSelected(c.offeringId)}
                  className="text-left bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/40 ring-1 ring-indigo-100 dark:ring-indigo-900/30 shadow-soft overflow-hidden card-hover"
                >
                  <div className={`relative h-28 bg-gradient-to-br ${gradientFor(c.courseCode)} p-4 text-white`}>
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                    <div className="flex items-center gap-2 mb-2">
                      <FlaskConical size={24} />
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">Lab</span>
                    </div>
                    <p className="text-[11px] opacity-90 font-mono">{c.courseCode} · LAB</p>
                    <p className="font-display font-bold text-base leading-tight">{c.courseTitle} — Lab</p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-muted-app mb-3">
                      {c.program?.shortForm || c.program?.name || ""}
                      {c.semester ? ` · ${c.semester.title || `Semester ${c.semester.number}`}` : ""}
                      {c.section ? ` · Sec ${c.section.name}` : ""}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-app">{tasks.length} tasks</span>
                      {pending > 0 && <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">{pending} to do</span>}
                      {graded > 0 && <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">{graded} graded</span>}
                    </div>
                    <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      View lab tasks →
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </>
      )}

      {/* submit modal */}
      <AnimatePresence>
        {active && (
          <Modal open onClose={() => !uploading && setActive(null)} title={`${active.title} — ${active.courseCode}`}>
            <div className="space-y-4">
              {active.description && <p className="text-sm text-muted-app">{active.description}</p>}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-app">
                <span className="inline-flex items-center gap-1"><Calendar size={12} /> Due {fmtDate(active.dueDate)}</span>
                <span className="inline-flex items-center gap-1"><Award size={12} /> {active.totalMarks} marks</span>
                {active.filePath && (
                  <a href={fileUrl(active.filePath)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 font-semibold hover:underline">
                    <Paperclip size={12} /> Download task file
                  </a>
                )}
              </div>

              {active.submission?.status === "GRADED" ? (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-900/40 p-4">
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                    <Award size={16} /> Grade: {active.submission.marks} / {active.totalMarks}
                  </p>
                  {active.submission.feedback && <p className="text-sm text-muted-app mt-1">{active.submission.feedback}</p>}
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-muted-app mb-1">Upload your lab work</label>
                <input ref={fileRef} type="file" className="block w-full text-sm text-app file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-primary-600 file:text-white file:font-semibold" />
                {active.submission?.fileName && (
                  <p className="text-[11px] text-muted-app mt-1">Current: {active.submission.fileName}</p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setActive(null)} disabled={uploading} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold">Cancel</button>
                <button
                  onClick={() => handleSubmit(active)}
                  disabled={uploading}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {uploading ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : <><Upload size={15} /> Submit lab work</>}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StudentLabTasks;

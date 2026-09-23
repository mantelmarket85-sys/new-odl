import { useState, useMemo, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Search, Calendar, CheckCircle2, AlertCircle, Upload, Award,
  Hourglass, Eye, Paperclip, Loader2, Download, ChevronRight, ArrowLeft,
  User, BookOpen, RefreshCw, Clock,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import useApi from "../../hooks/useApi";
import api, { fileUrl } from "../../services/api";

/* Map backend submission status → display meta. PENDING = no submission yet. */
const STATUS_META = {
  PENDING: { label: "Pending", icon: AlertCircle, bg: "bg-amber-100 dark:bg-amber-500/15", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  SUBMITTED: { label: "Submitted", icon: Hourglass, bg: "bg-blue-100 dark:bg-blue-500/15", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  LATE: { label: "Submitted (Late)", icon: Hourglass, bg: "bg-orange-100 dark:bg-orange-500/15", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  GRADED: { label: "Graded", icon: Award, bg: "bg-emerald-100 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
};

// Normalize a status into one of the three top-level categories.
const categoryOf = (a) => {
  const s = a.submission ? a.submission.status : "PENDING";
  if (s === "GRADED") return "GRADED";
  if (s === "SUBMITTED" || s === "LATE") return "SUBMITTED";
  return "PENDING";
};
const statusOf = (a) => (a.submission ? a.submission.status : "PENDING");
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const isOverdue = (a) => {
  if (a.submission) return false;
  try { return new Date(a.dueDate) < new Date(); } catch { return false; }
};

const COURSE_GRADIENTS = [
  "from-blue-500 to-indigo-600", "from-emerald-500 to-teal-600", "from-violet-500 to-purple-600",
  "from-rose-500 to-pink-600", "from-amber-500 to-orange-600", "from-cyan-500 to-blue-600",
];

const Assignments = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, reload } = useApi(() => api.student.assignments(), []);

  const [selectedCourse, setSelectedCourse] = useState(null); // courseCode | null
  const [filter, setFilter] = useState("All"); // All | Pending | Submitted | Graded
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(null); // assignment in modal
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const assignments = useMemo(() => data?.assignments || [], [data]);

  // Deep-link from a dashboard course card: ?course=<code> selects that course.
  useEffect(() => {
    const c = searchParams.get("course");
    if (c) setSelectedCourse(c);
  }, [searchParams]);

  // Group assignments by course (only enrolled courses are returned by the API).
  const courses = useMemo(() => {
    const map = new Map();
    for (const a of assignments) {
      if (!map.has(a.courseCode)) {
        map.set(a.courseCode, {
          code: a.courseCode, title: a.courseTitle, teacher: a.teacher,
          items: [], pending: 0, submitted: 0, graded: 0,
        });
      }
      const g = map.get(a.courseCode);
      g.items.push(a);
      const cat = categoryOf(a);
      if (cat === "PENDING") g.pending++;
      else if (cat === "SUBMITTED") g.submitted++;
      else g.graded++;
    }
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [assignments]);

  const currentCourse = useMemo(
    () => courses.find((c) => c.code === selectedCourse) || null,
    [courses, selectedCourse],
  );

  // Assignments for the selected course, filtered by category + search.
  const courseAssignments = useMemo(() => {
    if (!currentCourse) return [];
    return currentCourse.items
      .filter((a) => filter === "All" || categoryOf(a) === filter.toUpperCase())
      .filter((a) => `${a.title} ${a.description || ""}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [currentCourse, filter, search]);

  const goBack = () => {
    setSelectedCourse(null);
    setFilter("All");
    setSearch("");
    const next = new URLSearchParams(searchParams);
    next.delete("course");
    setSearchParams(next, { replace: true });
  };

  const openCourse = (code) => {
    setSelectedCourse(code);
    setFilter("All");
    setSearch("");
  };

  const handleSubmit = async () => {
    if (!active) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast("Please choose a file to upload", { type: "error" });
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      await api.student.submitAssignment(active.id, fd);
      toast(active.submission ? "Submission replaced successfully" : "Assignment submitted successfully", { type: "success" });
      setActive(null);
      await reload();
    } catch (e) {
      toast(e.message || "Submission failed", { type: "error" });
    } finally {
      setUploading(false);
    }
  };

  // -------- COURSE LIST VIEW --------
  const renderCourseGrid = () => (
    <>
      {courses.length === 0 ? (
        <EmptyState icon="FileText" title="No assignments yet" description="Your instructors haven't posted any assignments for your enrolled courses." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c, i) => (
            <motion.button
              key={c.code}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -4 }}
              onClick={() => openCourse(c.code)}
              className="text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden hover:shadow-lg hover:border-primary-200 dark:hover:border-primary-800 transition group"
            >
              <div className={`h-2 bg-gradient-to-r ${COURSE_GRADIENTS[i % COURSE_GRADIENTS.length]}`} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-mono font-bold text-primary-600">{c.code}</span>
                    <h4 className="font-display font-bold text-slate-900 dark:text-slate-100 leading-tight mt-0.5">{c.title}</h4>
                  </div>
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${COURSE_GRADIENTS[i % COURSE_GRADIENTS.length]} text-white flex items-center justify-center shadow shrink-0`}>
                    <BookOpen size={20} />
                  </div>
                </div>
                {c.teacher && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5"><User size={12} /> {c.teacher}</p>}
                <div className="flex items-center gap-3 mt-4 text-xs">
                  <span className="flex items-center gap-1 text-amber-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {c.pending} Pending</span>
                  <span className="flex items-center gap-1 text-blue-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {c.submitted} Submitted</span>
                  <span className="flex items-center gap-1 text-emerald-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {c.graded} Graded</span>
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-500">{c.items.length} assignment{c.items.length !== 1 ? "s" : ""}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 group-hover:gap-2 transition-all">View <ChevronRight size={14} /></span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </>
  );

  // -------- COURSE DETAIL (assignment list) VIEW --------
  const renderCourseDetail = () => (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <button onClick={goBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-primary-600 w-fit">
          <ArrowLeft size={16} /> All Courses
        </button>
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assignments…" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-600 to-blue-600 text-white flex items-center justify-center shadow shrink-0"><BookOpen size={22} /></div>
          <div className="min-w-0">
            <span className="text-[11px] font-mono font-bold text-primary-600">{currentCourse?.code}</span>
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 leading-tight">{currentCourse?.title}</h3>
            {currentCourse?.teacher && <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5"><User size={12} /> {currentCourse.teacher}</p>}
          </div>
        </div>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {["All", "Pending", "Submitted", "Graded"].map((f) => {
          const count = f === "All" ? currentCourse?.items.length : (f === "Pending" ? currentCourse?.pending : f === "Submitted" ? currentCourse?.submitted : currentCourse?.graded);
          return (
            <button key={f} onClick={() => setFilter(f)} className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${filter === f ? "bg-primary-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
              {f} {count != null ? <span className={filter === f ? "text-white/80" : "text-slate-400"}>({count})</span> : null}
            </button>
          );
        })}
      </div>

      {courseAssignments.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-10 text-center">
          <FileText size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="font-semibold text-slate-600 dark:text-slate-300">No {filter !== "All" ? filter.toLowerCase() : ""} assignments</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {courseAssignments.map((a, idx) => {
              const s = statusOf(a);
              const meta = STATUS_META[s] || STATUS_META.PENDING;
              const overdue = isOverdue(a);
              const obtained = a.submission?.marks;
              return (
                <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(idx * 0.04, 0.3) }} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 hover:border-primary-200 dark:hover:border-primary-800 transition">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.bg} ${meta.text}`}>{meta.label}</span>
                        {overdue && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">Overdue</span>}
                        {a.attachmentUrl && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500"><Paperclip size={11} /> Attachment</span>}
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 mt-1.5">{a.title}</h4>
                      {a.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{a.description}</p>}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1"><Calendar size={12} /> Due: <span className="font-semibold text-slate-700 dark:text-slate-300">{fmtDate(a.dueDate)}</span></span>
                        <span className="flex items-center gap-1"><Award size={12} /> {a.totalMarks} marks</span>
                        {obtained != null && <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold"><CheckCircle2 size={12} /> {obtained}/{a.totalMarks}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {categoryOf(a) === "PENDING" ? (
                        <button onClick={() => setActive(a)} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700"><Upload size={13} /> Submit</button>
                      ) : (
                        <button onClick={() => setActive(a)} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"><Eye size={13} /> View Details</button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        title="My Assignments"
        subtitle={currentCourse ? `${currentCourse.code} — ${currentCourse.title}` : "Select a course to view its assignments"}
        icon="FileText"
        breadcrumb={["Dashboard", "Assignments", ...(currentCourse ? [currentCourse.code] : [])]}
      />

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : currentCourse ? (
        renderCourseDetail()
      ) : (
        renderCourseGrid()
      )}

      {/* ---- Submit / Replace / View detail modal ---- */}
      <Modal open={!!active} onClose={() => setActive(null)} title={active?.title} subtitle={active ? `${active.courseCode} — ${active.courseTitle}` : ""} icon={FileText}>
        {active && (
          <div className="space-y-4">
            {/* Details grid */}
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3"><p className="text-xs text-slate-500">Due Date</p><p className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><Clock size={13} /> {fmtDate(active.dueDate)}</p></div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3"><p className="text-xs text-slate-500">Total Marks</p><p className="font-bold text-slate-900 dark:text-slate-100">{active.totalMarks}</p></div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3"><p className="text-xs text-slate-500">Teacher</p><p className="font-bold text-slate-900 dark:text-slate-100">{active.teacher || "TBA"}</p></div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3"><p className="text-xs text-slate-500">Submission Status</p><p className="font-bold text-slate-900 dark:text-slate-100">{STATUS_META[statusOf(active)]?.label}</p></div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3"><p className="text-xs text-slate-500">Obtained Marks</p><p className="font-bold text-slate-900 dark:text-slate-100">{active.submission?.marks != null ? `${active.submission.marks}/${active.totalMarks}` : "—"}</p></div>
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3"><p className="text-xs text-slate-500">Late Allowed</p><p className="font-bold text-slate-900 dark:text-slate-100">{active.allowLate ? "Yes" : "No"}</p></div>
            </div>

            {active.description && (
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3"><p className="text-xs text-slate-500 mb-1">Description</p><p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{active.description}</p></div>
            )}

            {/* Teacher attachment */}
            {active.attachmentUrl && (
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3">
                <p className="text-xs text-slate-500 mb-1">Assignment Attachment</p>
                <div className="flex items-center gap-2">
                  <Paperclip size={14} className="text-slate-400" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{active.attachmentName || "Attachment"}</span>
                  <a href={/^https?:\/\//.test(active.attachmentUrl) ? active.attachmentUrl : fileUrl(active.attachmentUrl)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-primary-600 text-xs font-semibold hover:underline"><Download size={12} /> Download</a>
                </div>
              </div>
            )}

            {/* Existing submission (View / Download / Replace) */}
            {active.submission && (
              <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                <p className="text-xs text-slate-500">Your Submission</p>
                <div className="flex items-center gap-2 mt-2">
                  <Paperclip size={14} className="text-slate-400" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{active.submission.fileName || (active.submission.filePath ? "Submitted file" : "Text submission")}</span>
                  {active.submission.filePath && (
                    <a href={fileUrl(active.submission.filePath)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-primary-600 text-xs font-semibold hover:underline"><Download size={12} /> Download</a>
                  )}
                </div>
                {active.submission.marks != null && (
                  <div className="mt-3 flex items-center justify-between p-3 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    <span className="font-semibold flex items-center gap-2"><CheckCircle2 size={16} /> Graded</span>
                    <span className="font-bold">{active.submission.marks}/{active.totalMarks}</span>
                  </div>
                )}
                {active.submission.feedback && (
                  <div className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-sm">
                    <p className="text-xs text-slate-500 mb-0.5">Teacher Feedback</p>
                    <p className="text-slate-800 dark:text-slate-200">{active.submission.feedback}</p>
                  </div>
                )}
              </div>
            )}

            {/* Upload / Replace zone — graded assignments cannot be re-submitted */}
            {statusOf(active) !== "GRADED" && (
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center">
                {active.submission ? <RefreshCw size={28} className="mx-auto text-slate-400 mb-2" /> : <Upload size={28} className="mx-auto text-slate-400 mb-2" />}
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{active.submission ? "Replace your submission" : "Upload your submission"}</p>
                <input ref={fileRef} type="file" className="block mx-auto text-sm text-slate-600 dark:text-slate-400" />
                <p className="text-[10px] text-slate-400 mt-2">PDF, DOC, ZIP up to 25 MB</p>
                <button onClick={handleSubmit} disabled={uploading} className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 disabled:opacity-50">
                  {uploading ? <><Loader2 size={12} className="animate-spin" /> Uploading…</> : active.submission ? <><RefreshCw size={12} /> Replace Submission</> : <><Upload size={12} /> Upload & Submit</>}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Assignments;

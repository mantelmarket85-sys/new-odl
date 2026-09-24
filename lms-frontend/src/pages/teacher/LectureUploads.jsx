import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Youtube as YoutubeIcon, Trash2, Search, Play, Video,
  ChevronDown, ChevronRight, Layers, BookOpen, PlayCircle, FileVideo,
  X, Plus, Link as LinkIcon, Loader2, Pencil, Maximize2, Save,
} from "lucide-react";
import { useState, useMemo } from "react";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api, { fileUrl } from "../../services/api";
import { useToast } from "../../context/ToastContext";

/* =========================================================================
 * Teacher → Recorded Lectures (real data, owner-scoped by backend)
 * Structure: Subject (offering) → Week → Lectures (VIDEO CourseMaterial).
 * Lectures can be a YouTube/external URL or an uploaded video file.
 * ======================================================================= */

const ytId = (url = "") => {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};
const isHttp = (u = "") => /^https?:\/\//i.test(u);
// Resolve a playable source. IMPORTANT: prefer `filePath` (the actual
// served path under /uploads/...) over `fileName` (the original upload
// name, which is NOT a URL). Using fileName previously produced broken
// <video src> URLs — the root cause of lectures "not playing".
const resolveSrc = (l) => {
  if (l.url && isHttp(l.url)) return l.url;
  if (l.filePath) return fileUrl(l.filePath);
  if (l.url) return fileUrl(l.url);
  return null;
};
const fmtDate = (d) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
};

const blankForm = { id: null, semesterId: "", offeringId: "", title: "", weekNumber: 1, lectureNumber: "", durationMin: "", description: "", mode: "url", url: "", file: null };
const fmtDuration = (m) => {
  const n = Number(m);
  if (!n || n <= 0) return null;
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

const TeacherLectureUploads = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.teacher.lectures(), []);

  const subjects = useMemo(() => data?.subjects || [], [data]);
  // ALL offerings assigned to the teacher (dynamic dropdown source) — not
  // just those that already have lectures. Falls back to lectured subjects.
  const allOfferings = useMemo(() => {
    if (data?.offerings?.length) return data.offerings;
    return subjects.map((s) => ({ offeringId: s.offeringId, courseCode: s.courseCode, courseTitle: s.courseTitle, semester: s.semester, semesterId: null }));
  }, [data, subjects]);
  const allSemesters = useMemo(() => data?.semesters || [], [data]);

  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");
  const [expanded, setExpanded] = useState({});
  const [openWeeks, setOpenWeeks] = useState({});
  const [preview, setPreview] = useState(null);

  const [openUpload, setOpenUpload] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  /* group each subject's lectures by week */
  const subjectsWithWeeks = useMemo(() => {
    return subjects.map((s) => {
      const weekMap = {};
      for (const l of s.lectures || []) {
        const wk = l.week || 1;
        if (!weekMap[wk]) weekMap[wk] = { week: wk, lectures: [] };
        weekMap[wk].lectures.push(l);
      }
      const weeks = Object.values(weekMap).sort((a, b) => a.week - b.week);
      return { ...s, weeks };
    });
  }, [subjects]);

  const allWeeks = useMemo(() => {
    const set = new Set();
    subjectsWithWeeks.forEach((s) => s.weeks.forEach((w) => set.add(w.week)));
    return ["all", ...Array.from(set).sort((a, b) => a - b)];
  }, [subjectsWithWeeks]);

  const visibleSubjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subjectsWithWeeks
      .filter((s) => subjectFilter === "all" || s.courseCode === subjectFilter)
      .map((s) => {
        const weeks = (weekFilter === "all" ? s.weeks : s.weeks.filter((w) => String(w.week) === String(weekFilter)))
          .map((w) => ({
            ...w,
            lectures: w.lectures.filter(
              (l) => !q || `${l.title} ${s.courseCode} ${s.courseTitle}`.toLowerCase().includes(q)
            ),
          }))
          .filter((w) => w.lectures.length > 0);
        return { ...s, weeks };
      })
      .filter((s) => s.weeks.length > 0);
  }, [subjectsWithWeeks, subjectFilter, weekFilter, search]);

  const totalLectures = useMemo(
    () => subjectsWithWeeks.reduce((sum, s) => sum + (s.lectures?.length || 0), 0),
    [subjectsWithWeeks]
  );

  const toggleSubject = (code) => setExpanded((e) => ({ ...e, [code]: !e[code] }));
  const toggleWeek = (key) => setOpenWeeks((o) => ({ ...o, [key]: !o[key] }));

  // Offerings filtered by the chosen semester (cascading dropdown).
  const offeringsForSemester = useMemo(() => {
    if (!form.semesterId) return allOfferings;
    return allOfferings.filter((o) => String(o.semesterId ?? "") === String(form.semesterId));
  }, [allOfferings, form.semesterId]);

  const openUploadModal = () => {
    const first = allOfferings[0];
    setForm({ ...blankForm, semesterId: first?.semesterId ?? "", offeringId: first?.offeringId || "" });
    setOpenUpload(true);
  };

  // Open the modal pre-filled for EDITING an existing lecture.
  const openEditModal = (l, subject) => {
    const off = allOfferings.find((o) => o.offeringId === subject.offeringId);
    setForm({
      id: l.id,
      semesterId: off?.semesterId ?? "",
      offeringId: subject.offeringId,
      title: l.title || "",
      weekNumber: l.week || 1,
      lectureNumber: l.lectureNumber ?? "",
      durationMin: l.durationMin ?? "",
      description: l.description || "",
      mode: "url",
      url: l.url || "",
      file: null,
    });
    setOpenUpload(true);
  };

  const handleUpload = async () => {
    const editing = !!form.id;
    if (!form.offeringId) return toast("Select a course", { type: "error" });
    if (!form.title.trim()) return toast("Lecture title is required", { type: "error" });
    // Client requirement 2.2 — URL-only. When editing, the source can be left
    // unchanged (no new URL).
    if (!editing && !form.url.trim()) return toast("Provide a video URL (YouTube or external link)", { type: "error" });

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("offeringId", String(form.offeringId));
      fd.append("title", form.title.trim());
      fd.append("weekNumber", String(form.weekNumber || 1));
      if (form.lectureNumber !== "" && form.lectureNumber != null) fd.append("lectureNumber", String(form.lectureNumber));
      if (form.durationMin !== "" && form.durationMin != null) fd.append("durationMin", String(form.durationMin));
      fd.append("description", form.description.trim());
      // Only a URL is ever sent — no file part.
      if (form.url.trim()) fd.append("url", form.url.trim());

      if (editing) {
        await api.teacher.updateLecture(form.id, fd);
        toast("Lecture updated ✓", { type: "success" });
      } else {
        await api.teacher.createLecture(fd);
        toast("Lecture uploaded ✓", { type: "success" });
      }
      setOpenUpload(false);
      reload();
    } catch (e) {
      toast(e.message || "Failed to save lecture", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (l) => {
    if (!window.confirm(`Delete lecture "${l.title}"?`)) return;
    setDeletingId(l.id);
    try {
      await api.teacher.deleteLecture(l.id);
      toast("Lecture removed", { type: "success" });
      reload();
    } catch (e) {
      toast(e.message || "Failed to delete lecture", { type: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="My Recorded Lectures" subtitle="Lectures you've uploaded — organised by subject and week." icon="Video" breadcrumb={["Teacher", "Recorded Lectures"]} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        <div className="space-y-4">{[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Recorded Lectures"
        subtitle="Lectures you've uploaded — organised by your subjects and weeks."
        icon="Video"
        breadcrumb={["Teacher", "Recorded Lectures"]}
        actions={
          allOfferings.length > 0 && (
            <button onClick={openUploadModal} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
              <Upload size={14} /> Upload Lecture
            </button>
          )
        }
      />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : subjects.length === 0 ? (
        <EmptyState
          icon="Video"
          title="No lectures yet"
          description="You don't have any recorded lectures. Upload your first video lecture for one of your active courses."
          action={allOfferings.length > 0 ? openUploadModal : undefined}
          actionLabel="Upload Lecture"
        />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
            {[
              { label: "My Subjects", value: subjects.length, icon: BookOpen, color: "from-blue-500 to-blue-600" },
              { label: "Total Lectures", value: totalLectures, icon: PlayCircle, color: "from-purple-500 to-purple-600" },
              { label: "Visible (filter)", value: visibleSubjects.reduce((a, s) => a + s.weeks.reduce((b, w) => b + w.lectures.length, 0), 0), icon: FileVideo, color: "from-emerald-500 to-emerald-600" },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card-base p-4 flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.color} text-white flex items-center justify-center shadow shrink-0`}>
                  <s.icon size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-app">{s.label}</p>
                  <p className="text-lg font-bold text-app truncate">{s.value}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Filters */}
          <div className="card-base p-4 mb-5">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Subject</label>
                <div className="relative">
                  <BookOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="input-base w-full pl-9 text-sm">
                    <option value="all">All My Subjects</option>
                    {subjects.map((s) => <option key={s.offeringId} value={s.courseCode}>{s.courseCode}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Week</label>
                <div className="relative">
                  <Layers size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)} className="input-base w-full pl-9 text-sm">
                    {allWeeks.map((w) => <option key={w} value={w}>{w === "all" ? "All Weeks" : `Week ${w}`}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Search</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lecture or subject..." className="input-base w-full pl-9 text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Subject sections */}
          {visibleSubjects.length === 0 ? (
            <div className="card-base p-12 text-center">
              <FileVideo size={40} className="mx-auto text-muted-app mb-3" />
              <p className="font-semibold text-app">No lectures match the selected filters</p>
              <p className="text-xs text-muted-app mt-1">Try changing the subject or week.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleSubjects.map((s, i) => {
                const isOpen = expanded[s.courseCode] ?? (i < 2);
                const totalInSubject = s.weeks.reduce((a, w) => a + w.lectures.length, 0);
                return (
                  <motion.div key={s.courseCode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card-base overflow-hidden">
                    <button onClick={() => toggleSubject(s.courseCode)} className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center shadow shrink-0">
                          <BookOpen size={20} />
                        </div>
                        <div className="text-left min-w-0">
                          <p className="font-mono text-xs font-bold text-primary-600 dark:text-primary-400">{s.courseCode}{s.semester ? ` · ${s.semester}` : ""}</p>
                          <p className="font-bold text-app truncate">{s.courseTitle}</p>
                          <p className="text-xs text-muted-app truncate">
                            {s.weeks.length} week{s.weeks.length !== 1 ? "s" : ""} · {totalInSubject} lecture{totalInSubject !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <ChevronDown size={20} className={`text-muted-app shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="border-t border-app divide-y divide-slate-100 dark:divide-slate-800">
                            {s.weeks.map((w) => {
                              const wkKey = `${s.courseCode}-W${w.week}`;
                              const wkOpen = openWeeks[wkKey] ?? true;
                              return (
                                <div key={wkKey}>
                                  <button onClick={() => toggleWeek(wkKey)} className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-slate-50/60 dark:bg-slate-900/30 hover:bg-slate-100 dark:hover:bg-slate-800/50">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-[11px] font-bold">W{w.week}</span>
                                      <div className="text-left">
                                        <p className="text-sm font-bold text-app">Week {w.week}</p>
                                        <p className="text-[10px] text-muted-app">{w.lectures.length} lecture{w.lectures.length !== 1 ? "s" : ""}</p>
                                      </div>
                                    </div>
                                    <ChevronRight size={16} className={`text-muted-app transition-transform ${wkOpen ? "rotate-90" : ""}`} />
                                  </button>

                                  <AnimatePresence>
                                    {wkOpen && (
                                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                        <div className="px-5 py-3">
                                          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                            {w.lectures.map((l) => {
                                              const vid = ytId(l.url || "");
                                              const thumb = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null;
                                              return (
                                                <div key={l.id} className="card-base overflow-hidden group hover:shadow-lg transition-all">
                                                  <div className="relative aspect-video bg-slate-900 cursor-pointer" onClick={() => setPreview({ ...l, courseCode: s.courseCode, courseTitle: s.courseTitle })}>
                                                    {thumb ? (
                                                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                                                        <FileVideo size={32} className="text-slate-500" />
                                                      </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                      <div className="w-12 h-12 rounded-full bg-white/95 flex items-center justify-center">
                                                        <Play size={20} className="text-primary-700 ml-1" fill="currentColor" />
                                                      </div>
                                                    </div>
                                                    {vid ? (
                                                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-[9px] font-bold rounded flex items-center gap-1"><YoutubeIcon size={9} /> YouTube</div>
                                                    ) : l.fileName ? (
                                                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-emerald-600 text-white text-[9px] font-bold rounded flex items-center gap-1"><FileVideo size={9} /> File</div>
                                                    ) : (
                                                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded flex items-center gap-1"><LinkIcon size={9} /> Link</div>
                                                    )}
                                                    {fmtDuration(l.durationMin) && (
                                                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/75 text-white text-[9px] font-bold rounded">{fmtDuration(l.durationMin)}</div>
                                                    )}
                                                  </div>
                                                  <div className="p-3">
                                                    <div className="flex items-start gap-1.5">
                                                      {l.lectureNumber != null && (
                                                        <span className="inline-flex items-center justify-center shrink-0 h-5 px-1.5 rounded bg-primary-100 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 text-[10px] font-bold mt-0.5">#{l.lectureNumber}</span>
                                                      )}
                                                      <p className="font-bold text-sm text-app line-clamp-2">{l.title}</p>
                                                    </div>
                                                    {l.description && <p className="text-[11px] text-muted-app mt-1 line-clamp-2">{l.description}</p>}
                                                    <p className="text-[11px] text-muted-app mt-1">{fmtDate(l.createdAt)}</p>
                                                    <div className="flex gap-1 mt-2">
                                                      <button onClick={() => setPreview({ ...l, courseCode: s.courseCode, courseTitle: s.courseTitle })} className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 text-app text-xs font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                                        <Play size={11} className="inline mr-1" /> Play
                                                      </button>
                                                      <button onClick={() => openEditModal(l, s)} title="Edit / replace lecture" className="px-2.5 py-1.5 bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/40 transition-colors">
                                                        <Pencil size={12} />
                                                      </button>
                                                      <button onClick={() => handleDelete(l)} disabled={deletingId === l.id} className="px-2.5 py-1.5 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50">
                                                        {deletingId === l.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                      </button>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Upload / Edit Modal */}
      <Modal open={openUpload} onClose={() => setOpenUpload(false)} title={form.id ? "Edit Lecture" : "Upload New Lecture"} subtitle={form.id ? "Update lecture info or replace the video" : "Add a video lecture for one of your courses"} icon={form.id ? Pencil : Upload}>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Semester</label>
              <select className="input-base w-full text-sm" value={form.semesterId} onChange={(e) => {
                const semId = e.target.value;
                const list = semId ? allOfferings.filter((o) => String(o.semesterId ?? "") === String(semId)) : allOfferings;
                setForm((f) => ({ ...f, semesterId: semId, offeringId: list[0]?.offeringId || "" }));
              }}>
                <option value="">All Semesters</option>
                {allSemesters.map((s) => <option key={s.id ?? s.label} value={s.id ?? ""}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Course</label>
              <select className="input-base w-full text-sm" value={form.offeringId} onChange={(e) => setForm({ ...form, offeringId: e.target.value })}>
                <option value="">Select a course…</option>
                {offeringsForSemester.map((o) => <option key={o.offeringId} value={o.offeringId}>{o.courseCode} — {o.courseTitle}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Lecture Title</label>
            <input className="input-base w-full text-sm" placeholder="e.g. SDLC — Waterfall Model" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Week</label>
              <select className="input-base w-full text-sm" value={form.weekNumber} onChange={(e) => setForm({ ...form, weekNumber: e.target.value })}>
                {Array.from({ length: 16 }).map((_, i) => <option key={i} value={i + 1}>Week {i + 1}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Lecture No.</label>
              <input type="number" min={1} className="input-base w-full text-sm" placeholder="e.g. 1" value={form.lectureNumber} onChange={(e) => setForm({ ...form, lectureNumber: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Duration (min)</label>
              <input type="number" min={1} className="input-base w-full text-sm" placeholder="e.g. 45" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Description <span className="text-muted-app font-normal">(optional)</span></label>
            <textarea rows={2} className="input-base w-full text-sm" placeholder="Brief summary of what this lecture covers…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {/* Client requirement 2.2 — recorded lectures are added by LINK ONLY
              (YouTube or any external URL). Direct file upload has been removed. */}
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">
              Video URL{form.id ? <span className="text-muted-app font-normal"> — leave blank to keep current video</span> : ""}
            </label>
            <div className="relative">
              <YoutubeIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-red-500" />
              <input className="input-base w-full pl-10 text-sm" placeholder="https://youtube.com/watch?v=...  or any external video URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </div>
            <p className="text-[11px] text-muted-app mt-1">Paste a YouTube link or any external video URL. Direct file uploads are not supported.</p>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setOpenUpload(false)} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
            <button onClick={handleUpload} className="btn-primary flex-1" disabled={saving}>
              {saving
                ? <><Loader2 size={14} className="inline mr-1 animate-spin" /> {form.id ? "Saving…" : "Uploading…"}</>
                : form.id
                  ? <><Save size={14} className="inline mr-1" /> Save Changes</>
                  : <><Plus size={14} className="inline mr-1" /> Upload Lecture</>}
            </button>
          </div>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title} subtitle={preview?.courseTitle} icon={Play} maxWidth="max-w-3xl">
        {preview && (() => {
          const vid = ytId(preview.url || "");
          const src = resolveSrc(preview);
          return (
            <div>
              <div className="aspect-video rounded-xl overflow-hidden bg-black">
                {vid ? (
                  <iframe src={`https://www.youtube.com/embed/${vid}`} title={preview.title} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                ) : src ? (
                  // Native HTML5 player: controls give seeking + full-screen;
                  // preload metadata enables the seek bar; multiple <source>
                  // type hints help the browser pick a decoder for mp4/webm/ogg.
                  <video
                    key={src}
                    controls
                    controlsList="nodownload"
                    preload="metadata"
                    playsInline
                    className="w-full h-full"
                  >
                    <source src={src} />
                    Your browser does not support embedded video.
                  </video>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">No playable source</div>
                )}
              </div>
              {!vid && src && (
                <div className="flex justify-end mt-2">
                  <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:underline">
                    <Maximize2 size={12} /> Open in new tab (full screen)
                  </a>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-center">
                <div className="card-base p-3">
                  <p className="text-xs text-muted-app">Subject</p>
                  <p className="font-bold text-app">{preview.courseCode}</p>
                </div>
                <div className="card-base p-3">
                  <p className="text-xs text-muted-app">Lecture</p>
                  <p className="font-bold text-app">{preview.lectureNumber != null ? `#${preview.lectureNumber}` : "—"} · W{preview.week || 1}</p>
                </div>
                <div className="card-base p-3">
                  <p className="text-xs text-muted-app">Duration</p>
                  <p className="font-bold text-app">{fmtDuration(preview.durationMin) || "—"}</p>
                </div>
                <div className="card-base p-3">
                  <p className="text-xs text-muted-app">Uploaded</p>
                  <p className="font-bold text-app">{fmtDate(preview.createdAt)}</p>
                </div>
              </div>
              {preview.description && (
                <div className="card-base p-3 mt-3">
                  <p className="text-xs text-muted-app mb-1">Description</p>
                  <p className="text-sm text-app">{preview.description}</p>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default TeacherLectureUploads;

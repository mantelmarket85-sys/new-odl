import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Upload, Download, Trash2, BookOpen, FileText, Presentation,
  Link as LinkIcon, FileType2, Files, Plus, Loader2, Library as LibraryIcon,
  Filter, ChevronDown, UploadCloud, X, Eye, Pencil, Save,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import ResourceViewer from "../../components/common/ResourceViewer";
import useApi from "../../hooks/useApi";
import api, { fileUrl } from "../../services/api";
import { useToast } from "../../context/ToastContext";

/* =========================================================================
 * Teacher → Course Library (real data, per-teacher scoped by backend)
 * Resource types: Books / Slides / Notes / PDFs / Other.
 * Files capped at 5MB. Organised into course-wise, week-grouped cards.
 * ======================================================================= */

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

// Resource type catalogue (resourceType column on CourseMaterial)
const RESOURCE_TYPES = {
  BOOK: { label: "Book", plural: "Books", icon: BookOpen, color: "from-amber-500 to-orange-600", pill: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" },
  SLIDES: { label: "Slides", plural: "Slides", icon: Presentation, color: "from-violet-500 to-purple-600", pill: "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300" },
  NOTES: { label: "Notes", plural: "Notes", icon: FileText, color: "from-emerald-500 to-teal-600", pill: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" },
  PDF: { label: "PDF", plural: "PDFs", icon: FileType2, color: "from-rose-500 to-pink-600", pill: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300" },
  OTHER: { label: "Other", plural: "Other", icon: Files, color: "from-slate-500 to-slate-600", pill: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" },
};
const RESOURCE_KEYS = ["BOOK", "SLIDES", "NOTES", "PDF", "OTHER"];
const rMeta = (t) => RESOURCE_TYPES[t] || RESOURCE_TYPES.OTHER;

const fmtDate = (d) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
};
const fmtSize = (b) => {
  const n = Number(b);
  if (!n || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
const isHttp = (u = "") => /^https?:\/\//i.test(u);
const resolveSrc = (m) => {
  if (m.url && isHttp(m.url)) return m.url;
  if (m.filePath) return fileUrl(m.filePath);
  if (m.fileName) return fileUrl(m.fileName);
  if (m.url) return fileUrl(m.url);
  return null;
};

const blankForm = { id: null, offeringId: "", title: "", resourceType: "PDF", weekNumber: 1, description: "", mode: "file", url: "", file: null };

const TeacherLibrary = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.teacher.library(), []);

  const categories = useMemo(() => data?.categories || [], [data]);
  const offerings = useMemo(() => {
    if (data?.offerings?.length) return data.offerings;
    return categories.map((c) => ({ offeringId: c.offeringId, courseCode: c.courseCode, courseTitle: c.courseTitle, semester: c.semester }));
  }, [data, categories]);
  const canAdd = offerings.length > 0;

  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");
  const [expanded, setExpanded] = useState({});

  const [openUpload, setOpenUpload] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [viewing, setViewing] = useState(null);
  const fileInputRef = useRef(null);

  // Normalise items: legacy rows may have a NULL resourceType — infer a
  // sensible bucket so nothing is hidden.
  const inferType = (it) => {
    if (it.resourceType && RESOURCE_TYPES[it.resourceType]) return it.resourceType;
    const name = `${it.fileName || ""} ${it.url || ""} ${it.title || ""}`.toLowerCase();
    if (/\.pdf(\b|$)/.test(name)) return "PDF";
    if (/\.(ppt|pptx|key)(\b|$)/.test(name)) return "SLIDES";
    if (/\.(doc|docx|txt|md)(\b|$)/.test(name)) return "NOTES";
    if (/\.(epub|mobi)(\b|$)/.test(name)) return "BOOK";
    return "OTHER";
  };

  const allItems = useMemo(() => {
    const items = [];
    for (const c of categories) {
      for (const it of c.items || []) {
        items.push({
          ...it,
          resourceType: inferType(it),
          courseCode: c.courseCode,
          courseTitle: c.courseTitle,
          semester: c.semester,
          offeringId: c.offeringId,
        });
      }
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const allWeeks = useMemo(() => {
    const set = new Set();
    allItems.forEach((it) => set.add(it.week || 1));
    return ["all", ...Array.from(set).sort((a, b) => a - b)];
  }, [allItems]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((it) => {
      if (courseFilter !== "all" && it.courseCode !== courseFilter) return false;
      if (typeFilter !== "all" && it.resourceType !== typeFilter) return false;
      if (weekFilter !== "all" && String(it.week || 1) !== String(weekFilter)) return false;
      if (q && !`${it.title} ${it.courseCode} ${it.courseTitle} ${it.description || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allItems, search, courseFilter, typeFilter, weekFilter]);

  // Group filtered items course-wise, then by week (course-wise cards spec).
  const grouped = useMemo(() => {
    const byCourse = {};
    for (const it of filteredItems) {
      const key = it.courseCode;
      if (!byCourse[key]) byCourse[key] = { courseCode: it.courseCode, courseTitle: it.courseTitle, semester: it.semester, offeringId: it.offeringId, weeks: {} };
      const wk = it.week || 1;
      if (!byCourse[key].weeks[wk]) byCourse[key].weeks[wk] = [];
      byCourse[key].weeks[wk].push(it);
    }
    return Object.values(byCourse).map((c) => ({
      ...c,
      weekList: Object.keys(c.weeks).map(Number).sort((a, b) => a - b).map((w) => ({ week: w, items: c.weeks[w] })),
      count: Object.values(c.weeks).reduce((a, arr) => a + arr.length, 0),
    }));
  }, [filteredItems]);

  const stats = useMemo(() => {
    const byType = { BOOK: 0, SLIDES: 0, NOTES: 0, PDF: 0, OTHER: 0 };
    for (const it of allItems) byType[it.resourceType] = (byType[it.resourceType] || 0) + 1;
    return { total: allItems.length, ...byType, courses: categories.length };
  }, [allItems, categories]);

  const toggleCourse = (code) => setExpanded((e) => ({ ...e, [code]: !e[code] }));

  const openUploadModal = () => {
    setForm({ ...blankForm, offeringId: offerings[0]?.offeringId || categories[0]?.offeringId || "" });
    setDragOver(false);
    setOpenUpload(true);
  };

  // Open the modal pre-filled to EDIT an existing resource.
  const openEditModal = (it) => {
    setForm({
      id: it.id,
      offeringId: it.offeringId,
      title: it.title || "",
      resourceType: it.resourceType || "PDF",
      weekNumber: it.week || 1,
      description: it.description || "",
      mode: it.type === "LINK" ? "link" : "file",
      url: it.url || "",
      file: null,
    });
    setDragOver(false);
    setOpenUpload(true);
  };

  const pickFile = (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast(`"${file.name}" is ${fmtSize(file.size)} — files must be 5MB or smaller.`, { type: "error" });
      return;
    }
    setForm((f) => ({ ...f, file, mode: "file" }));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    pickFile(file);
  };

  const handleUpload = async () => {
    const editing = !!form.id;
    if (!form.offeringId) return toast("Select a course", { type: "error" });
    if (!form.title.trim()) return toast("Title is required", { type: "error" });
    // When editing, the source may be left unchanged.
    if (!editing && form.mode === "link" && !form.url.trim()) return toast("Provide a URL", { type: "error" });
    if (!editing && form.mode === "file" && !form.file) return toast("Choose or drop a file (max 5MB)", { type: "error" });
    if (form.mode === "file" && form.file && form.file.size > MAX_FILE_BYTES) {
      return toast("File exceeds the 5MB limit", { type: "error" });
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("offeringId", String(form.offeringId));
      fd.append("title", form.title.trim());
      fd.append("resourceType", form.resourceType);
      fd.append("weekNumber", String(form.weekNumber || 1));
      fd.append("description", form.description.trim());
      if (form.mode === "link" && form.url.trim()) fd.append("url", form.url.trim());
      if (form.mode === "file" && form.file) fd.append("file", form.file);

      if (editing) {
        await api.teacher.updateLibraryResource(form.id, fd);
        toast("Resource updated ✓", { type: "success" });
      } else {
        await api.teacher.createLibraryResource(fd);
        toast("Resource added to your library ✓", { type: "success" });
      }
      setOpenUpload(false);
      reload();
    } catch (e) {
      toast(e.message || "Failed to save resource", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (it) => {
    if (!window.confirm(`Delete "${it.title}" from your library?`)) return;
    setDeletingId(it.id);
    try {
      await api.teacher.deleteLibraryResource(it.id);
      toast("Resource removed", { type: "success" });
      reload();
    } catch (e) {
      toast(e.message || "Failed to delete resource", { type: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Course Library" subtitle="Resources you've shared with your students" icon="Library" breadcrumb={["Teacher", "Library"]} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <div className="space-y-4">{[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Course Library"
        subtitle="Your own resources — organised course-wise by week. Files up to 5MB."
        icon="Library"
        breadcrumb={["Teacher", "Library"]}
        actions={
          canAdd && (
            <button onClick={openUploadModal} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
              <Upload size={14} /> Add Resource
            </button>
          )
        }
      />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : categories.length === 0 ? (
        <EmptyState
          icon="Library"
          title="Your library is empty"
          description="You haven't shared any resources yet. Add books, slides, notes or PDFs (up to 5MB) for your active courses."
          action={canAdd ? openUploadModal : undefined}
          actionLabel="Add Resource"
        />
      ) : (
        <>
          {/* Stats by resource type */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
            <StatCard title="Total" value={stats.total} icon="Library" color="blue" delay={0} />
            <StatCard title="Books" value={stats.BOOK} icon="BookOpen" color="amber" delay={0.04} />
            <StatCard title="Slides" value={stats.SLIDES} icon="Presentation" color="purple" delay={0.08} />
            <StatCard title="Notes" value={stats.NOTES} icon="FileText" color="emerald" delay={0.12} />
            <StatCard title="PDFs" value={stats.PDF} icon="FileText" color="rose" delay={0.16} />
            <StatCard title="Other" value={stats.OTHER} icon="Files" color="cyan" delay={0.2} />
          </div>

          {/* Filters: Week / Type / Search + Course */}
          <div className="card-base p-4 mb-5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Course</label>
                <div className="relative">
                  <BookOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="input-base w-full pl-9 text-sm">
                    <option value="all">All Courses</option>
                    {categories.map((c) => <option key={c.offeringId} value={c.courseCode}>{c.courseCode} — {c.courseTitle}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Week</label>
                <div className="relative">
                  <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)} className="input-base w-full pl-9 text-sm">
                    {allWeeks.map((w) => <option key={w} value={w}>{w === "all" ? "All Weeks" : `Week ${w}`}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Type</label>
                <div className="relative">
                  <Files size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-base w-full pl-9 text-sm">
                    <option value="all">All Types</option>
                    {RESOURCE_KEYS.map((k) => <option key={k} value={k}>{RESOURCE_TYPES[k].plural}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Search</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, course or description..." className="input-base w-full pl-9 text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Course-wise, week-grouped cards */}
          {grouped.length === 0 ? (
            <div className="card-base p-12 text-center">
              <LibraryIcon size={40} className="mx-auto text-muted-app mb-3" />
              <p className="font-semibold text-app">No resources match your filters</p>
              <p className="text-xs text-muted-app mt-1">Try a different course, week, type or search term.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((c, i) => {
                const isOpen = expanded[c.courseCode] ?? (i < 2);
                return (
                  <motion.div key={c.courseCode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card-base overflow-hidden">
                    <button onClick={() => toggleCourse(c.courseCode)} className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center shadow shrink-0">
                          <LibraryIcon size={20} />
                        </div>
                        <div className="text-left min-w-0">
                          <p className="font-mono text-xs font-bold text-primary-600 dark:text-primary-400">{c.courseCode}{c.semester ? ` · ${c.semester}` : ""}</p>
                          <p className="font-bold text-app truncate">{c.courseTitle}</p>
                          <p className="text-xs text-muted-app truncate">{c.weekList.length} week{c.weekList.length !== 1 ? "s" : ""} · {c.count} resource{c.count !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <ChevronDown size={20} className={`text-muted-app shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="border-t border-app p-4 space-y-4">
                            {c.weekList.map((w) => (
                              <div key={w.week}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-[11px] font-bold">W{w.week}</span>
                                  <p className="text-sm font-bold text-app">Week {w.week}</p>
                                  <span className="text-[10px] text-muted-app">{w.items.length} item{w.items.length !== 1 ? "s" : ""}</span>
                                </div>
                                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                  {w.items.map((it) => {
                                    const meta = rMeta(it.resourceType);
                                    const Icon = meta.icon;
                                    const src = resolveSrc(it);
                                    const size = fmtSize(it.fileSize);
                                    return (
                                      <div key={it.id} className="surface border border-app rounded-xl p-3 flex flex-col">
                                        <div className="flex items-start gap-3">
                                          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${meta.color} text-white flex items-center justify-center shadow shrink-0`}>
                                            <Icon size={18} />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p className="font-bold text-sm text-app line-clamp-2">{it.title}</p>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${meta.pill}`}>{meta.label}</span>
                                              {size && <span className="text-[10px] text-muted-app">{size}</span>}
                                            </div>
                                          </div>
                                        </div>
                                        {it.description && <p className="text-[11px] text-muted-app mt-2 line-clamp-2">{it.description}</p>}
                                        <p className="text-[10px] text-muted-app mt-1">{fmtDate(it.createdAt)}</p>
                                        <div className="flex gap-1 mt-2.5">
                                          {src ? (
                                            <button onClick={() => setViewing({ url: src, title: it.title, fileName: it.fileName })} className="flex-1 py-1.5 bg-primary-600 text-white text-xs font-bold rounded-lg hover:bg-primary-700 transition-colors text-center">
                                              <Eye size={11} className="inline mr-1" /> View
                                            </button>
                                          ) : (
                                            <span className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 text-muted-app text-xs font-bold rounded-lg text-center">No source</span>
                                          )}
                                          {src && (
                                            <a href={src} target="_blank" rel="noreferrer" download title={it.type === "LINK" ? "Open link" : "Download"} className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-app rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                              {it.type === "LINK" ? <LinkIcon size={12} /> : <Download size={12} />}
                                            </a>
                                          )}
                                          <button onClick={() => openEditModal(it)} title="Edit / replace" className="px-2.5 py-1.5 bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/40 transition-colors">
                                            <Pencil size={12} />
                                          </button>
                                          <button onClick={() => handleDelete(it)} disabled={deletingId === it.id} title="Delete" className="px-2.5 py-1.5 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/40 transition-colors disabled:opacity-50">
                                            {deletingId === it.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
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

      {/* Resource preview / View */}
      <ResourceViewer open={!!viewing} onClose={() => setViewing(null)} resource={viewing} />

      {/* Upload / Edit Modal */}
      <Modal open={openUpload} onClose={() => setOpenUpload(false)} title={form.id ? "Edit Resource" : "Add Library Resource"} subtitle={form.id ? "Update info or replace the file/link" : "Books, Slides, Notes, PDFs or Other — files up to 5MB"} icon={form.id ? Pencil : Upload}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Course</label>
            <select className="input-base w-full text-sm" value={form.offeringId} onChange={(e) => setForm({ ...form, offeringId: e.target.value })}>
              <option value="">Select a course…</option>
              {offerings.map((c) => <option key={c.offeringId} value={c.offeringId}>{c.semester ? `${c.semester} · ` : ""}{c.courseCode} — {c.courseTitle}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Title</label>
            <input className="input-base w-full text-sm" placeholder="e.g. Chapter 5 — Reading Notes" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Resource Type</label>
            <div className="grid grid-cols-5 gap-1.5">
              {RESOURCE_KEYS.map((k) => {
                const m = RESOURCE_TYPES[k];
                const M = m.icon;
                const active = form.resourceType === k;
                return (
                  <button key={k} type="button" onClick={() => setForm({ ...form, resourceType: k })} className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-bold transition ${active ? "bg-primary-600 text-white border-primary-600" : "border-app text-app hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                    <M size={16} /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Week</label>
            <select className="input-base w-full text-sm" value={form.weekNumber} onChange={(e) => setForm({ ...form, weekNumber: e.target.value })}>
              {Array.from({ length: 16 }).map((_, i) => <option key={i} value={i + 1}>Week {i + 1}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Description <span className="text-muted-app font-normal">(optional)</span></label>
            <textarea rows={2} className="input-base w-full text-sm" placeholder="Brief note about this resource…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Source{form.id ? <span className="text-muted-app font-normal"> — leave blank to keep current</span> : ""}</label>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => setForm({ ...form, mode: "file" })} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${form.mode === "file" ? "bg-primary-600 text-white border-primary-600" : "border-app text-app"}`}>
                <UploadCloud size={12} className="inline mr-1" /> Upload File
              </button>
              <button type="button" onClick={() => setForm({ ...form, mode: "link" })} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${form.mode === "link" ? "bg-primary-600 text-white border-primary-600" : "border-app text-app"}`}>
                <LinkIcon size={12} className="inline mr-1" /> External Link
              </button>
            </div>
            {form.mode === "file" ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition ${dragOver ? "border-primary-500 bg-primary-50 dark:bg-primary-950/20" : "border-app hover:border-primary-400"}`}
              >
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] || null)} />
                {form.file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText size={18} className="text-primary-600" />
                    <div className="text-left min-w-0">
                      <p className="text-sm font-semibold text-app truncate max-w-[14rem]">{form.file.name}</p>
                      <p className="text-[11px] text-muted-app">{fmtSize(form.file.size)}</p>
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setForm({ ...form, file: null }); }} className="ml-1 p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <UploadCloud size={26} className="mx-auto text-muted-app mb-2" />
                    <p className="text-sm font-semibold text-app">Drag & drop a file here</p>
                    <p className="text-[11px] text-muted-app mt-0.5">or click to browse · max 5MB</p>
                  </>
                )}
              </div>
            ) : (
              <input className="input-base w-full text-sm" placeholder="https://..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setOpenUpload(false)} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
            <button onClick={handleUpload} className="btn-primary flex-1" disabled={saving}>
              {saving
                ? <><Loader2 size={14} className="inline mr-1 animate-spin" /> {form.id ? "Saving…" : "Adding…"}</>
                : form.id
                  ? <><Save size={14} className="inline mr-1" /> Save Changes</>
                  : <><Plus size={14} className="inline mr-1" /> Add Resource</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TeacherLibrary;

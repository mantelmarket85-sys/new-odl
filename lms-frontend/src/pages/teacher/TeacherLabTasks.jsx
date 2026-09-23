import { motion } from "framer-motion";
import {
  FlaskConical, Users, Calendar, Award, CheckCircle2, Clock,
  Search, Filter, Plus, X, Trash2, Save, Download, FileText, BookOpen, Layers,
} from "lucide-react";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader";
import Badge from "../../components/common/Badge";
import StatCard from "../../components/common/StatCard";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import authService, { API_BASE } from "../../services/authService";
import { useToast } from "../../context/ToastContext";

const fmtDate = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
};
const isOverdue = (d) => { if (!d) return false; const due = new Date(d); return !isNaN(due) && due < new Date(); };
const fileUrl = (p) => (p ? `${API_BASE.replace(/\/api$/, "")}${p.startsWith("/") ? "" : "/"}${p}` : null);

// Point 10 — reliably open the EXACT file a student uploaded. We fetch the
// file through an authenticated blob request (so it works regardless of the
// sandbox proxy / CORS / content negotiation) and open it in a new tab. A
// cache-busting param guarantees the LATEST uploaded file is shown, never a
// stale/placeholder copy. Falls back to a direct link if the fetch fails.
async function openSubmissionFile(filePath, fileName) {
  const direct = fileUrl(filePath);
  if (!direct) return;
  const bust = `${direct}${direct.includes("?") ? "&" : "?"}t=${Date.now()}`;
  try {
    const token = authService.getToken();
    const res = await fetch(bust, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    // Revoke after a delay so the new tab has time to load the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (!win) {
      // Popup blocked — fall back to a direct navigation.
      window.location.href = direct;
    }
    return true;
  } catch (_) {
    // Network/proxy fallback: open the public static URL directly.
    window.open(bust, "_blank", "noopener,noreferrer");
    return false;
  }
}

const TeacherLabTasks = () => {
  const [params, setParams] = useSearchParams();
  const preselectedOffering = params.get("offeringId");
  const { data, loading, error, reload } = useApi(() => api.teacher.allLabTasks(), []);
  const labTasks = useMemo(() => data?.labTasks || [], [data]);

  const [search, setSearch] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");

  const [createFor, setCreateFor] = useState(null); // offering row for create modal
  const [gradeTask, setGradeTask] = useState(null);  // lab task for submissions modal

  // Distinct filter options derived from the loaded lab tasks.
  const semesters = useMemo(() => {
    const m = {};
    for (const t of labTasks) if (t.semester) m[t.semester.id] = t.semester;
    return Object.values(m).sort((a, b) => (a.number || 0) - (b.number || 0));
  }, [labTasks]);
  const programs = useMemo(() => {
    const m = {};
    for (const t of labTasks) if (t.program) m[t.program.id] = t.program;
    return Object.values(m);
  }, [labTasks]);
  const sections = useMemo(() => {
    const m = {};
    for (const t of labTasks) for (const s of t.sections || []) m[s.id] = s;
    return Object.values(m);
  }, [labTasks]);

  // Distinct lab offerings (for the "New Lab Task" course picker).
  // Prefer the dedicated `labOfferings` list from the API — it includes EVERY
  // lab course the teacher teaches, even those with no lab task yet, so a
  // freshly-distributed lab course can still receive its first task. Fall back
  // to deriving from tasks only if the field is absent (older backend).
  const labOfferings = useMemo(() => {
    if (Array.isArray(data?.labOfferings) && data.labOfferings.length) {
      return data.labOfferings;
    }
    const m = {};
    for (const t of labTasks) {
      if (!m[t.offeringId]) m[t.offeringId] = {
        offeringId: t.offeringId, courseCode: t.courseCode, courseTitle: t.courseTitle,
        program: t.program, semester: t.semester, sections: t.sections || [],
      };
    }
    return Object.values(m);
  }, [data, labTasks]);

  const stats = useMemo(() => ({
    total: labTasks.length,
    published: labTasks.filter((t) => t.isPublished).length,
    submissions: labTasks.reduce((s, t) => s + (t.submissionCount || 0), 0),
    pending: labTasks.reduce((s, t) => s + (t.pendingGrading || 0), 0),
  }), [labTasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return labTasks.filter((t) => {
      if (semesterFilter !== "all" && String(t.semester?.id) !== semesterFilter) return false;
      if (programFilter !== "all" && String(t.program?.id) !== programFilter) return false;
      if (sectionFilter !== "all") {
        const inSection = t.sectionId ? String(t.sectionId) === sectionFilter
          : (t.sections || []).some((s) => String(s.id) === sectionFilter);
        if (!inSection) return false;
      }
      if (preselectedOffering && String(t.offeringId) !== preselectedOffering) return false;
      if (q && !`${t.title} ${t.courseCode} ${t.courseTitle}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [labTasks, search, semesterFilter, programFilter, sectionFilter, preselectedOffering]);

  const clearOfferingFilter = () => { params.delete("offeringId"); setParams(params, { replace: true }); };

  return (
    <div>
      <PageHeader
        title="Lab Tasks"
        subtitle="Upload lab tasks, review submissions and upload marks — filter by semester, section and program"
        icon="FlaskConical"
        breadcrumb={["Teacher", "Lab Tasks"]}
        actions={
          <button
            onClick={() => setCreateFor(labOfferings[0] || null)}
            disabled={labOfferings.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-indigo-600 to-cyan-600 text-white hover:opacity-90 transition disabled:opacity-50"
          >
            <Plus size={16} /> New Lab Task
          </button>
        }
      />

      {loading ? (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : labOfferings.length === 0 ? (
        <EmptyState icon="FlaskConical" title="No lab courses" description="You are not teaching any course with a lab component, so there are no lab tasks to manage." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard title="Lab Tasks" value={stats.total} icon="FlaskConical" color="indigo" delay={0} />
            <StatCard title="Published" value={stats.published} icon="CheckCircle2" color="emerald" delay={0.05} />
            <StatCard title="Submissions" value={stats.submissions} icon="Users" color="cyan" delay={0.1} />
            <StatCard title="Pending Grading" value={stats.pending} icon="Clock" color="amber" delay={0.15} />
          </div>

          {/* Filters — Semester / Section / Program (Req 1.2) */}
          <div className="card-base p-4 mb-5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Semester</label>
                <div className="relative">
                  <Layers size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} className="input-base w-full pl-9 text-sm">
                    <option value="all">All Semesters</option>
                    {semesters.map((s) => <option key={s.id} value={String(s.id)}>{s.title || `Semester ${s.number}`}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Section</label>
                <div className="relative">
                  <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className="input-base w-full pl-9 text-sm">
                    <option value="all">All Sections</option>
                    {sections.map((s) => <option key={s.id} value={String(s.id)}>Section {s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Program</label>
                <div className="relative">
                  <BookOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className="input-base w-full pl-9 text-sm">
                    <option value="all">All Programs</option>
                    {programs.map((p) => <option key={p.id} value={String(p.id)}>{p.shortForm || p.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Search</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lab task or course..." className="input-base w-full pl-9 text-sm" />
                </div>
              </div>
            </div>
            {preselectedOffering && (
              <button onClick={clearOfferingFilter} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                <X size={12} /> Clear course filter
              </button>
            )}
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="card-base p-12 text-center">
              <FlaskConical size={40} className="mx-auto text-muted-app mb-3" />
              {labTasks.length === 0 ? (
                <>
                  <p className="font-semibold text-app">No lab tasks created yet</p>
                  <p className="text-xs text-muted-app mt-1">
                    You are teaching {labOfferings.length} lab course{labOfferings.length === 1 ? "" : "s"}. Click <span className="font-semibold text-app">New Lab Task</span> above to create the first one.
                  </p>
                  <button
                    onClick={() => setCreateFor(labOfferings[0] || null)}
                    className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-indigo-600 to-cyan-600 text-white hover:opacity-90 transition"
                  >
                    <Plus size={16} /> New Lab Task
                  </button>
                </>
              ) : (
                <>
                  <p className="font-semibold text-app">No lab tasks match your filters</p>
                  <p className="text-xs text-muted-app mt-1">Create a lab task or adjust the filters above.</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((t, i) => {
                const overdue = isOverdue(t.dueDate);
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="card-base p-4 flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-600 text-white flex items-center justify-center shadow shrink-0">
                      <FlaskConical size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">{t.courseCode}</span>
                        {t.semester && <Badge color="slate">{t.semester.title || `Sem ${t.semester.number}`}</Badge>}
                        {t.program && <Badge color="blue">{t.program.shortForm}</Badge>}
                        <Badge color={t.isPublished ? "emerald" : "slate"}>{t.isPublished ? "Published" : "Draft"}</Badge>
                        {t.pendingGrading > 0 && <Badge color="amber">{t.pendingGrading} to grade</Badge>}
                        {overdue && t.isPublished && <Badge color="rose">Overdue</Badge>}
                      </div>
                      <p className="font-bold text-app truncate mt-0.5">{t.title}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-app flex-wrap">
                        <span className="inline-flex items-center gap-1"><Award size={12} /> {t.totalMarks ?? 0} marks</span>
                        <span className="inline-flex items-center gap-1"><Calendar size={12} /> Due {fmtDate(t.dueDate)}</span>
                        <span className="inline-flex items-center gap-1"><Users size={12} /> {t.submissionCount || 0} submission{(t.submissionCount || 0) !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <button onClick={() => setGradeTask(t)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary-600 text-white hover:bg-primary-700 transition">
                        Review &amp; Marks
                      </button>
                      <button onClick={async () => { if (window.confirm(`Delete lab task "${t.title}"?`)) { await api.teacher.deleteLabTask(t.id); reload(); } }} className="p-2 rounded-lg border border-app text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {createFor && (
        <CreateLabTaskModal
          offerings={labOfferings}
          initial={createFor}
          onClose={() => setCreateFor(null)}
          onSaved={() => { setCreateFor(null); reload(); }}
        />
      )}
      {gradeTask && (
        <SubmissionsModal
          task={gradeTask}
          onClose={() => setGradeTask(null)}
          onGraded={reload}
        />
      )}
    </div>
  );
};

// ------------------------------------------------------------
// Create Lab Task modal (upload lab task with optional file)
// ------------------------------------------------------------
function CreateLabTaskModal({ offerings, initial, onClose, onSaved }) {
  const [offeringId, setOfferingId] = useState(initial?.offeringId || offerings[0]?.offeringId || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [totalMarks, setTotalMarks] = useState(100);
  const [dueDate, setDueDate] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [allowLate, setAllowLate] = useState(true);
  const [isPublished, setIsPublished] = useState(true);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const currentOffering = offerings.find((o) => String(o.offeringId) === String(offeringId));
  const availableSections = currentOffering?.sections || [];

  const submit = async () => {
    setErr("");
    if (!title.trim()) { setErr("Title is required"); return; }
    if (!dueDate) { setErr("Due date is required"); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("description", description);
      fd.append("totalMarks", String(totalMarks));
      fd.append("dueDate", dueDate);
      if (sectionId) fd.append("sectionId", sectionId);
      fd.append("allowLate", String(allowLate));
      fd.append("isPublished", String(isPublished));
      if (file) fd.append("file", file);
      await api.teacher.createLabTask(offeringId, fd);
      onSaved();
    } catch (e) {
      setErr(e.message || "Failed to create lab task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card-base w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-app">
          <h3 className="font-display font-bold text-app flex items-center gap-2"><FlaskConical size={18} className="text-indigo-600" /> New Lab Task</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          {err && <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg p-2">{err}</div>}
          <div>
            <label className="text-xs font-bold text-muted-app block mb-1">Lab Course</label>
            <select value={offeringId} onChange={(e) => { setOfferingId(e.target.value); setSectionId(""); }} className="input-base w-full text-sm">
              {offerings.map((o) => <option key={o.offeringId} value={o.offeringId}>{o.courseCode} — {o.courseTitle}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-app block mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-base w-full text-sm" placeholder="e.g. Lab Task 1 — Intro to circuits" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-app block mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-base w-full text-sm" placeholder="Instructions for the lab task..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-app block mb-1">Total Marks</label>
              <input type="number" min="1" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} className="input-base w-full text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-app block mb-1">Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input-base w-full text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-app block mb-1">Section (optional)</label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="input-base w-full text-sm">
              <option value="">All sections</option>
              {availableSections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-app block mb-1">Attachment (optional)</label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input-base w-full text-sm" />
          </div>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-app"><input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} /> Allow late</label>
            <label className="inline-flex items-center gap-2 text-sm text-app"><input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} /> Publish now</label>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-app">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold border border-app">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-gradient-to-r from-indigo-600 to-cyan-600 text-white disabled:opacity-50">
            <Save size={15} /> {saving ? "Saving..." : "Create"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ------------------------------------------------------------
// Submissions + marks modal (review submissions, upload marks)
// ------------------------------------------------------------
function SubmissionsModal({ task, onClose, onGraded }) {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [savingAll, setSavingAll] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const [marks, setMarks] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.teacher.labTaskSubmissions(task.id);
      setRows(res.submissions || []);
      const m = {};
      for (const r of res.submissions || []) m[r.studentId] = r.submission?.marks ?? "";
      setMarks(m);
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  useEffect(() => { load(); }, [load]);

  const saveMarks = async (studentId) => {
    const val = marks[studentId];
    if (val === "" || val == null) return;
    setSavingId(studentId);
    try {
      await api.teacher.saveLabTaskMarks(task.id, studentId, { marks: parseFloat(val) });
      await load();
      onGraded && onGraded();
      toast("Marks saved", { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to save marks", { type: "error" });
    } finally {
      setSavingId(null);
    }
  };

  // Point 10 — "Save All": persist every entered mark in a single action.
  // Coexists with the per-student Save. Only rows with a valid numeric entry
  // are submitted; individual failures are collected and reported.
  const saveAll = async () => {
    const entries = Object.entries(marks).filter(([, v]) => v !== "" && v != null && !Number.isNaN(parseFloat(v)));
    if (entries.length === 0) { toast("Enter at least one mark first", { type: "error" }); return; }
    setSavingAll(true);
    let ok = 0;
    const failed = [];
    for (const [studentId, v] of entries) {
      try {
        await api.teacher.saveLabTaskMarks(task.id, studentId, { marks: parseFloat(v) });
        ok += 1;
      } catch (e) {
        failed.push(studentId);
      }
    }
    await load();
    onGraded && onGraded();
    setSavingAll(false);
    if (failed.length === 0) toast(`Saved marks for ${ok} student${ok === 1 ? "" : "s"}`, { type: "success" });
    else toast(`Saved ${ok}, ${failed.length} failed`, { type: "error" });
  };

  // Point 10 — open the exact latest file the student uploaded.
  const viewFile = async (r) => {
    if (!r.submission?.filePath) return;
    setViewingId(r.studentId);
    try {
      await openSubmissionFile(r.submission.filePath, r.submission.fileName);
    } catch (e) {
      toast("Could not open the file", { type: "error" });
    } finally {
      setViewingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card-base w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-app">
          <div>
            <h3 className="font-display font-bold text-app flex items-center gap-2"><FlaskConical size={18} className="text-indigo-600" /> {task.title}</h3>
            <p className="text-xs text-muted-app">{task.courseCode} · {task.totalMarks} marks · Review submissions and upload marks</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={saveAll}
              disabled={savingAll || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              title="Save all entered marks in one action"
            >
              <Save size={14} /> {savingAll ? "Saving all..." : "Save All"}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
          </div>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-app py-8">No enrolled students found for this lab task.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-app border-b border-app">
                    <th className="py-2 px-2">Roll No</th>
                    <th className="py-2 px-2">Name</th>
                    <th className="py-2 px-2">Section</th>
                    <th className="py-2 px-2">Submission</th>
                    <th className="py-2 px-2">Marks</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.studentId} className="border-b border-app/60">
                      <td className="py-2 px-2 font-mono text-xs">{r.rollNumber}</td>
                      <td className="py-2 px-2 font-semibold text-app">{r.name}</td>
                      <td className="py-2 px-2">{r.section || "—"}</td>
                      <td className="py-2 px-2">
                        {r.submission ? (
                          <div className="flex items-center gap-2">
                            <Badge color={r.submission.status === "GRADED" ? "emerald" : r.submission.status === "LATE" ? "amber" : "blue"}>{r.submission.status}</Badge>
                            {r.submission.filePath ? (
                              <button
                                type="button"
                                onClick={() => viewFile(r)}
                                disabled={viewingId === r.studentId}
                                title={r.submission.fileName || "View uploaded file"}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
                              >
                                <FileText size={12} /> {viewingId === r.studentId ? "Opening..." : "View"}
                              </button>
                            ) : (
                              <span className="text-[11px] text-muted-app italic">No file</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-app">Not submitted</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number" min="0" max={task.totalMarks}
                          value={marks[r.studentId] ?? ""}
                          onChange={(e) => setMarks((m) => ({ ...m, [r.studentId]: e.target.value }))}
                          className="input-base w-20 text-sm" placeholder="—"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <button onClick={() => saveMarks(r.studentId)} disabled={savingId === r.studentId} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-primary-600 text-white disabled:opacity-50">
                          {savingId === r.studentId ? "..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default TeacherLabTasks;

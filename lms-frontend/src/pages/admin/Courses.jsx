import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Edit3, Trash2, BookOpen, X, FileSpreadsheet, Layers, GraduationCap,
  GripVertical, Move, Inbox, Loader2, Rows3, Trash,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import Badge from "../../components/common/Badge";
import Modal from "../../components/common/Modal";
import { useToast } from "../../context/ToastContext";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { formatCredits } from "../../utils/credit";

/* =============================================================
   MODULE: Courses (catalog) + Scheme of Study (drag & drop builder)
   ------------------------------------------------------------
   • Courses tab — full course catalog (live API CRUD)
       - Add Course uses a clean Semester 1..N dropdown driven by the
         selected program's REAL semesters (fetched live), storing the
         semesterId with the course.
   • Scheme of Study tab — visual, drag-and-drop semester planner.
       - All existing courses appear automatically.
       - Drag a course card into a semester column → persists the new
         semesterId to the database via updateCourse(id,{semesterId}).
       - An "Unassigned" column holds courses with no semester yet.
   ============================================================= */

const emptyCourseForm = {
  code: "",
  title: "",
  description: "",
  creditHours: 3,
  hasLab: false,
  theoryCredit: 3,
  labCredit: 1,
  programId: "",
  semesterId: "",
};

const Courses = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState("courses");

  const { data: courseData, loading, error, reload } = useApi(() => api.coordinator.curriculum(), []);
  const { data: courseList, loading: clLoading, error: clError, reload: reloadCourses } =
    useApi(() => api.structure.courses("?limit=200"), []);
  // Department-scoped programs (coordinator only sees their department's programs)
  const { data: programData } = useApi(() => api.coordinator.scopedPrograms(), []);

  const courses = courseList?.items || [];
  const programs = programData?.programs || programData?.items || (Array.isArray(programData) ? programData : []);
  const scopedDepartment = programData?.scopedDepartment || null;

  /* ----- Courses state ----- */
  const [courseQuery, setCourseQuery] = useState("");
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [courseForm, setCourseForm] = useState(emptyCourseForm);
  const [saving, setSaving] = useState(false);

  /* ----- Semesters for the form's selected program (REAL semesters) ----- */
  const [formSemesters, setFormSemesters] = useState([]);
  const [formSemLoading, setFormSemLoading] = useState(false);

  const loadSemestersFor = async (programId) => {
    if (!programId) { setFormSemesters([]); return []; }
    setFormSemLoading(true);
    try {
      const res = await api.structure.programSemesters(programId);
      const sems = (res?.semesters || []).sort((a, b) => (a.number || 0) - (b.number || 0));
      setFormSemesters(sems);
      return sems;
    } catch {
      setFormSemesters([]);
      return [];
    } finally {
      setFormSemLoading(false);
    }
  };

  const filteredCourses = useMemo(() => {
    if (!courseQuery.trim()) return courses;
    const q = courseQuery.toLowerCase();
    return courses.filter(
      (s) =>
        s.code?.toLowerCase().includes(q) ||
        s.title?.toLowerCase().includes(q) ||
        s.program?.name?.toLowerCase().includes(q)
    );
  }, [courses, courseQuery]);

  // ---------- Course handlers ----------
  const openAddCourse = async () => {
    setEditingCourseId(null);
    const firstProgram = programs[0]?.id || "";
    setCourseForm({ ...emptyCourseForm, programId: firstProgram, semesterId: "" });
    setCourseModalOpen(true);
    await loadSemestersFor(firstProgram);
  };

  const openEditCourse = async (s) => {
    setEditingCourseId(s.id);
    setCourseForm({
      code: s.code || "",
      title: s.title || "",
      description: s.description || "",
      creditHours: s.creditHours || 3,
      hasLab: s.hasLab === true,
      theoryCredit: s.theoryCredit != null ? s.theoryCredit : (s.creditHours || 3),
      labCredit: s.labCredit != null ? s.labCredit : 1,
      programId: s.programId || "",
      semesterId: s.semesterId || "",
    });
    setCourseModalOpen(true);
    await loadSemestersFor(s.programId);
  };

  const handleCourseChange = (k, v) => setCourseForm((f) => ({ ...f, [k]: v }));

  // When the program in the form changes, reload its real semesters and reset the choice
  const handleProgramChange = async (programId) => {
    setCourseForm((f) => ({ ...f, programId, semesterId: "" }));
    await loadSemestersFor(programId);
  };

  const handleSaveCourse = async (e) => {
    e?.preventDefault?.();
    if (!courseForm.code.trim() || !courseForm.title.trim()) {
      toast("Course code and title are required", { type: "error" });
      return;
    }
    // Validate credit-hour breakdown.
    const theory = Number(courseForm.theoryCredit) || 0;
    const lab = Number(courseForm.labCredit) || 0;
    if (courseForm.hasLab && (theory <= 0 || lab <= 0)) {
      toast("Lab courses need both Theory and Lab credit hours (greater than 0)", { type: "error" });
      return;
    }
    if (!courseForm.hasLab && theory <= 0) {
      toast("Theory credit hours must be greater than 0", { type: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: courseForm.code.trim(),
        title: courseForm.title.trim(),
        description: courseForm.description || null,
        hasLab: !!courseForm.hasLab,
        theoryCredit: theory,
        labCredit: courseForm.hasLab ? lab : null,
        creditHours: courseForm.hasLab ? theory + lab : theory,
        programId: courseForm.programId || null,
        semesterId: courseForm.semesterId || null,
      };
      if (editingCourseId) {
        await api.coordinator.updateCourse(editingCourseId, payload);
        toast("Course updated successfully", { type: "success" });
      } else {
        await api.coordinator.createCourse(payload);
        toast("Course added successfully", { type: "success" });
      }
      setCourseModalOpen(false);
      setEditingCourseId(null);
      setCourseForm(emptyCourseForm);
      await reloadCourses();
      await reload();
    } catch (err) {
      toast(err.message || "Failed to save course", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourse = async (s) => {
    if (!window.confirm(`Archive course "${s.code} — ${s.title}"?`)) return;
    try {
      await api.coordinator.deleteCourse(s.id);
      toast("Course archived", { type: "success" });
      await reloadCourses();
      await reload();
    } catch (err) {
      toast(err.message || "Failed to delete course", { type: "error" });
    }
  };

  /* ----- Multi-course (bulk add) state ----- */
  const blankRow = () => ({ code: "", title: "", hasLab: false, theoryCredit: 3, labCredit: 1, semesterId: "" });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkProgramId, setBulkProgramId] = useState("");
  const [bulkSemesters, setBulkSemesters] = useState([]);
  const [bulkSemLoading, setBulkSemLoading] = useState(false);
  const [bulkRows, setBulkRows] = useState([blankRow(), blankRow()]);
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadBulkSemesters = async (programId) => {
    if (!programId) { setBulkSemesters([]); return; }
    setBulkSemLoading(true);
    try {
      const res = await api.structure.programSemesters(programId);
      const sems = (res?.semesters || []).sort((a, b) => (a.number || 0) - (b.number || 0));
      setBulkSemesters(sems);
    } catch {
      setBulkSemesters([]);
    } finally {
      setBulkSemLoading(false);
    }
  };

  const openBulkAdd = async () => {
    const firstProgram = programs[0]?.id ? String(programs[0].id) : "";
    setBulkProgramId(firstProgram);
    setBulkRows([blankRow(), blankRow()]);
    setBulkOpen(true);
    await loadBulkSemesters(firstProgram);
  };

  const handleBulkProgramChange = async (programId) => {
    setBulkProgramId(programId);
    // Reset each row's semester since semesters belong to the program.
    setBulkRows((rows) => rows.map((r) => ({ ...r, semesterId: "" })));
    await loadBulkSemesters(programId);
  };

  const updateBulkRow = (idx, key, value) =>
    setBulkRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  const addBulkRow = () => setBulkRows((rows) => [...rows, blankRow()]);
  const removeBulkRow = (idx) =>
    setBulkRows((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));

  const handleBulkSave = async (e) => {
    e?.preventDefault?.();
    if (!bulkProgramId) {
      toast("Select a program first", { type: "error" });
      return;
    }
    const filled = bulkRows.filter((r) => r.code.trim() || r.title.trim());
    if (filled.length === 0) {
      toast("Add at least one course (code and name)", { type: "error" });
      return;
    }
    const invalid = filled.find((r) => !r.code.trim() || !r.title.trim());
    if (invalid) {
      toast("Every course needs both a code and a name", { type: "error" });
      return;
    }
    setBulkSaving(true);
    try {
      const res = await api.coordinator.createCoursesBulk({
        programId: bulkProgramId,
        courses: filled.map((r) => {
          const theory = Number(r.theoryCredit) || 0;
          const lab = Number(r.labCredit) || 0;
          return {
            code: r.code.trim(),
            title: r.title.trim(),
            hasLab: !!r.hasLab,
            theoryCredit: theory,
            labCredit: r.hasLab ? lab : null,
            creditHours: r.hasLab ? theory + lab : theory,
            semesterId: r.semesterId || null,
          };
        }),
      });
      const made = res?.createdCount ?? (res?.created?.length || 0);
      const errs = res?.errors || [];
      if (made > 0) {
        toast(`${made} course${made > 1 ? "s" : ""} added successfully`, { type: "success" });
      }
      if (errs.length) {
        toast(errs.map((x) => `${x.code || "Row"}: ${x.message}`).join(" · "), { type: "error" });
      }
      if (made > 0 && errs.length === 0) {
        setBulkOpen(false);
        setBulkRows([blankRow(), blankRow()]);
      } else if (errs.length) {
        // Keep only the failed rows so the user can fix them.
        setBulkRows(
          errs.map((x) => {
            const r = filled[x.index] || blankRow();
            return { code: r.code, title: r.title, hasLab: r.hasLab, theoryCredit: r.theoryCredit, labCredit: r.labCredit, semesterId: r.semesterId };
          })
        );
      }
      await reloadCourses();
      await reload();
    } catch (err) {
      toast(err.message || "Failed to add courses", { type: "error" });
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Courses & Scheme of Study"
        subtitle={
          scopedDepartment
            ? `Manage the course catalog and build the scheme of study · ${scopedDepartment}`
            : "Manage the course catalog and build the scheme of study"
        }
        icon="BookOpen"
        breadcrumb={["Coordinator", "Courses & Scheme of Study"]}
      />

      <div className="card-base p-3 mb-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-blue-500 text-white flex items-center justify-center flex-shrink-0">
          <Layers size={16} />
        </div>
        <div className="text-sm">
          <p className="font-bold text-app">Two related views, one place.</p>
          <p className="text-muted-app">
            Use <span className="font-semibold text-app">Courses</span> to add or edit individual courses.
            Use <span className="font-semibold text-app">Scheme of Study</span> to drag &amp; drop courses into
            their semesters — changes save instantly to the database.
          </p>
        </div>
      </div>

      <div role="tablist" aria-label="Courses and Scheme of Study" className="card-base p-1.5 mb-5 inline-flex gap-1 w-full sm:w-auto">
        <button role="tab" aria-selected={tab === "courses"} onClick={() => setTab("courses")}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all
            ${tab === "courses" ? "bg-gradient-to-r from-primary-600 to-blue-500 text-white shadow-lg shadow-primary-500/30" : "text-app hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}>
          <BookOpen size={15} /> Courses
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${tab === "courses" ? "bg-white/25" : "bg-slate-100 dark:bg-slate-800 text-muted-app"}`}>{courses.length}</span>
        </button>
        <button role="tab" aria-selected={tab === "scheme"} onClick={() => setTab("scheme")}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all
            ${tab === "scheme" ? "bg-gradient-to-r from-primary-600 to-blue-500 text-white shadow-lg shadow-primary-500/30" : "text-app hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}>
          <FileSpreadsheet size={15} /> Scheme of Study
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === "courses" ? (
          <motion.div key="courses-tab" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <div className="flex flex-col sm:flex-row gap-2 mb-4 sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
                  <input value={courseQuery} onChange={(e) => setCourseQuery(e.target.value)} placeholder="Search by course code, title, or program…"
                    className="pl-9 pr-4 py-2.5 surface border border-app rounded-xl text-sm w-full sm:w-96 text-app" aria-label="Search courses" />
                </div>
                {courseQuery && <button onClick={() => setCourseQuery("")} className="btn-ghost text-xs py-1.5 px-2 inline-flex items-center gap-1"><X size={12} /> Clear</button>}
                <span className="text-xs text-muted-app font-semibold">Showing <span className="text-app font-bold">{filteredCourses.length}</span> of {courses.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={openBulkAdd} className="btn-secondary text-sm py-2.5 px-4"><Rows3 size={14} className="inline mr-1" /> Add Multiple</button>
                <button onClick={openAddCourse} className="btn-primary text-sm py-2.5 px-4"><Plus size={14} className="inline mr-1" /> Add Course</button>
              </div>
            </div>

            {clError ? (
              <ErrorState title="Couldn't load courses" description={clError} onRetry={reloadCourses} />
            ) : clLoading ? (
              <div className="card-base p-5 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : (
              <div className="card-base overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs font-semibold text-secondary-app uppercase">
                        <th className="px-4 py-3">Code</th>
                        <th className="px-4 py-3">Course Name</th>
                        <th className="px-4 py-3">Program</th>
                        <th className="px-4 py-3 text-center">Sem</th>
                        <th className="px-4 py-3 text-center">Credits</th>
                        <th className="px-4 py-3 text-center">Offerings</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence initial={false}>
                        {filteredCourses.map((s) => (
                          <motion.tr key={s.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}
                            className="border-t border-app hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-3 font-mono font-bold text-primary-700 dark:text-primary-400">{s.code}</td>
                            <td className="px-4 py-3 font-semibold text-app">{s.title}</td>
                            <td className="px-4 py-3"><Badge color="blue">{s.program?.shortForm || s.program?.code || "—"}</Badge></td>
                            <td className="px-4 py-3 text-center text-app">{s.semester?.number ?? "—"}</td>
                            <td className="px-4 py-3 text-center font-bold text-app">
                              <span className="font-mono">{formatCredits(s)}</span>
                              {s.hasLab && <span className="ml-1.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Lab</span>}
                            </td>
                            <td className="px-4 py-3 text-center text-muted-app">{s._count?.offerings ?? 0}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => openEditCourse(s)} className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition" title="Edit"><Edit3 size={14} /></button>
                                <button onClick={() => handleDeleteCourse(s)} className="p-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition" title="Archive"><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                      {filteredCourses.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-app">
                          <BookOpen size={28} className="mx-auto mb-2 opacity-40" />
                          <p className="font-semibold">No courses found</p>
                          <p className="text-xs mt-1">Try a different search or add a new course.</p>
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="scheme-tab" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <SchemeBuilder
              programs={programs}
              error={clError}
              loading={clLoading}
              reloadCourses={reloadCourses}
              reloadCurriculum={reload}
              toast={toast}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============ COURSE MODAL ============ */}
      <Modal open={courseModalOpen} onClose={() => setCourseModalOpen(false)}
        title={editingCourseId ? "Edit Course" : "Add New Course"}
        subtitle={editingCourseId ? "Update course details below" : "Fill in the details to add a new course"}
        icon={BookOpen} maxWidth="max-w-2xl">
        <form onSubmit={handleSaveCourse} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-secondary-app">Course Code *</label>
            <input value={courseForm.code} onChange={(e) => handleCourseChange("code", e.target.value)} placeholder="e.g. CS-301"
              className="input-base mt-1 w-full" required disabled={!!editingCourseId} />
          </div>
          <div>
            <label className="text-xs font-semibold text-secondary-app">Course Name *</label>
            <input value={courseForm.title} onChange={(e) => handleCourseChange("title", e.target.value)} placeholder="e.g. Software Engineering" className="input-base mt-1 w-full" required />
          </div>

          {/* ---- Credit-hours breakdown (Theory-only vs Theory+Lab) ---- */}
          <div className="rounded-xl border border-app p-3 bg-slate-50/60 dark:bg-slate-800/30">
            <label className="text-xs font-semibold text-secondary-app">Course Type *</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => handleCourseChange("hasLab", false)}
                className={`px-3 py-2 rounded-lg text-sm font-bold border transition ${!courseForm.hasLab ? "bg-primary-600 text-white border-primary-600 shadow" : "surface border-app text-app hover:border-primary-300"}`}>
                Theory Only
              </button>
              <button type="button" onClick={() => handleCourseChange("hasLab", true)}
                className={`px-3 py-2 rounded-lg text-sm font-bold border transition ${courseForm.hasLab ? "bg-primary-600 text-white border-primary-600 shadow" : "surface border-app text-app hover:border-primary-300"}`}>
                Theory + Lab
              </button>
            </div>

            {courseForm.hasLab ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="text-xs font-semibold text-secondary-app">Theory Credit Hours *</label>
                  <input type="number" min="0" max="6" value={courseForm.theoryCredit} onChange={(e) => handleCourseChange("theoryCredit", e.target.value)} className="input-base mt-1 w-full" required />
                </div>
                <div>
                  <label className="text-xs font-semibold text-secondary-app">Lab Credit Hours *</label>
                  <input type="number" min="0" max="6" value={courseForm.labCredit} onChange={(e) => handleCourseChange("labCredit", e.target.value)} className="input-base mt-1 w-full" required />
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <label className="text-xs font-semibold text-secondary-app">Theory Credit Hours *</label>
                <input type="number" min="0" max="6" value={courseForm.theoryCredit} onChange={(e) => handleCourseChange("theoryCredit", e.target.value)} className="input-base mt-1 w-full" required />
              </div>
            )}
            <p className="text-[11px] text-muted-app mt-2">
              Total credit hours:{" "}
              <span className="font-mono font-bold text-primary-700 dark:text-primary-400">
                {formatCredits({ hasLab: courseForm.hasLab, theoryCredit: Number(courseForm.theoryCredit) || 0, labCredit: Number(courseForm.labCredit) || 0 })}
              </span>
              {courseForm.hasLab && <span> — shown as “Theory+Lab” everywhere in the system.</span>}
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-secondary-app">Description</label>
            <textarea value={courseForm.description} onChange={(e) => handleCourseChange("description", e.target.value)} rows={2} placeholder="Optional course description" className="input-base mt-1 w-full" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-secondary-app">Program</label>
              <select value={courseForm.programId} onChange={(e) => handleProgramChange(e.target.value)} className="input-base mt-1 w-full">
                <option value="">— Select program —</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.shortForm || p.code} — {p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary-app">Semester</label>
              <select value={courseForm.semesterId} onChange={(e) => handleCourseChange("semesterId", e.target.value)} className="input-base mt-1 w-full" disabled={!courseForm.programId || formSemLoading}>
                <option value="">{formSemLoading ? "Loading semesters…" : "— Select semester —"}</option>
                {formSemesters.map((s) => <option key={s.id} value={s.id}>{s.title || `Semester ${s.number}`}</option>)}
              </select>
              {!courseForm.programId && <p className="text-[11px] text-muted-app mt-1">Select a program first to choose its semester.</p>}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-app">
            <button type="button" onClick={() => setCourseModalOpen(false)} className="btn-secondary text-sm py-2.5 px-4"><X size={14} className="inline mr-1" /> Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2.5 px-4 disabled:opacity-60">{saving ? "Saving…" : editingCourseId ? "Save Changes" : "Add Course"}</button>
          </div>
        </form>
      </Modal>

      {/* ============ MULTI-COURSE (BULK ADD) MODAL ============ */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)}
        title="Add Multiple Courses"
        subtitle="Select a program, then add several courses semester-wise at once"
        icon={Rows3} maxWidth="max-w-4xl">
        <form onSubmit={handleBulkSave} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-secondary-app">Program *</label>
            <select value={bulkProgramId} onChange={(e) => handleBulkProgramChange(e.target.value)} className="input-base mt-1 w-full" required>
              <option value="">— Select program —</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.shortForm || p.code} — {p.name}</option>)}
            </select>
            <p className="text-[11px] text-muted-app mt-1">
              {bulkSemLoading
                ? "Loading this program's semesters…"
                : bulkProgramId
                  ? `${bulkSemesters.length} semester(s) available for assignment.`
                  : "Pick a program to load its semesters."}
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-app">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs font-semibold text-secondary-app uppercase">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Course Code *</th>
                  <th className="px-3 py-2">Course Name *</th>
                  <th className="px-3 py-2 w-24 text-center">Lab?</th>
                  <th className="px-3 py-2 w-24 text-center">Theory *</th>
                  <th className="px-3 py-2 w-24 text-center">Lab</th>
                  <th className="px-3 py-2 w-44">Semester</th>
                  <th className="px-3 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((r, idx) => (
                  <tr key={idx} className="border-t border-app">
                    <td className="px-3 py-2 text-muted-app font-semibold">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <input value={r.code} onChange={(e) => updateBulkRow(idx, "code", e.target.value)} placeholder="e.g. CS-101" className="input-base w-full py-2" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={r.title} onChange={(e) => updateBulkRow(idx, "title", e.target.value)} placeholder="e.g. Programming Fundamentals" className="input-base w-full py-2" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={!!r.hasLab} onChange={(e) => updateBulkRow(idx, "hasLab", e.target.checked)} className="w-4 h-4 accent-primary-600" title="Has a Lab component" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" max="6" value={r.theoryCredit} onChange={(e) => updateBulkRow(idx, "theoryCredit", e.target.value)} className="input-base w-full py-2 text-center" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" max="6" value={r.labCredit} onChange={(e) => updateBulkRow(idx, "labCredit", e.target.value)} disabled={!r.hasLab} className="input-base w-full py-2 text-center disabled:opacity-40" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={r.semesterId} onChange={(e) => updateBulkRow(idx, "semesterId", e.target.value)} className="input-base w-full py-2" disabled={!bulkProgramId || bulkSemLoading}>
                        <option value="">— Semester —</option>
                        {bulkSemesters.map((s) => <option key={s.id} value={s.id}>{s.title || `Semester ${s.number}`}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button type="button" onClick={() => removeBulkRow(idx)} disabled={bulkRows.length <= 1}
                        className="p-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition disabled:opacity-40" title="Remove row">
                        <Trash size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" onClick={addBulkRow} className="btn-ghost text-sm py-2 px-3 inline-flex items-center gap-1.5">
            <Plus size={14} /> Add another course
          </button>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-app">
            <button type="button" onClick={() => setBulkOpen(false)} className="btn-secondary text-sm py-2.5 px-4"><X size={14} className="inline mr-1" /> Cancel</button>
            <button type="submit" disabled={bulkSaving} className="btn-primary text-sm py-2.5 px-4 disabled:opacity-60">{bulkSaving ? "Saving…" : "Save All Courses"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

/* =============================================================
   SCHEME BUILDER — drag & drop semester planner
   ============================================================= */
const SchemeBuilder = ({ programs, reloadCourses, reloadCurriculum, toast }) => {
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [semesters, setSemesters] = useState([]);
  const [schemeCourses, setSchemeCourses] = useState([]); // courses for selected program
  const [loadingScheme, setLoadingScheme] = useState(false);
  const [schemeErr, setSchemeErr] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // semesterId | "unassigned"
  const [savingMoveId, setSavingMoveId] = useState(null);

  // Default the program selection to the first available one
  useEffect(() => {
    if (!selectedProgramId && programs.length) setSelectedProgramId(String(programs[0].id));
  }, [programs, selectedProgramId]);

  const loadScheme = async (programId) => {
    if (!programId) return;
    setLoadingScheme(true);
    setSchemeErr(null);
    try {
      const [semRes, courseRes] = await Promise.all([
        api.structure.programSemesters(programId),
        api.structure.courses(`?programId=${programId}&limit=200`),
      ]);
      const sems = (semRes?.semesters || []).sort((a, b) => (a.number || 0) - (b.number || 0));
      setSemesters(sems);
      setSchemeCourses(courseRes?.items || []);
    } catch (err) {
      setSchemeErr(err.message || "Failed to load scheme of study");
    } finally {
      setLoadingScheme(false);
    }
  };

  useEffect(() => {
    if (selectedProgramId) loadScheme(selectedProgramId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProgramId]);

  const coursesBySemester = useMemo(() => {
    const groups = {};
    semesters.forEach((s) => { groups[s.id] = []; });
    groups.unassigned = [];
    schemeCourses.forEach((c) => {
      if (c.semesterId && groups[c.semesterId]) groups[c.semesterId].push(c);
      else groups.unassigned.push(c);
    });
    return groups;
  }, [semesters, schemeCourses]);

  // ---------- drag handlers ----------
  const onDragStart = (e, course) => {
    setDraggingId(course.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(course.id));
  };
  const onDragEnd = () => { setDraggingId(null); setDropTarget(null); };

  const moveCourse = async (course, targetSemesterId) => {
    // targetSemesterId === null means unassign
    const currentSem = course.semesterId || null;
    const target = targetSemesterId || null;
    if (currentSem === target) return; // no change

    // optimistic update
    setSavingMoveId(course.id);
    setSchemeCourses((prev) =>
      prev.map((c) => (c.id === course.id ? { ...c, semesterId: target } : c))
    );
    try {
      // Persist to DB. Pass 0 → backend interprets null only when != null,
      // so to UNASSIGN we send semesterId: null explicitly handled below.
      await api.coordinator.updateCourse(course.id, { semesterId: target });
      const semLabel =
        target == null
          ? "Unassigned"
          : semesters.find((s) => s.id === target)?.title || `Semester ${target}`;
      toast(`"${course.code}" moved to ${semLabel}`, { type: "success" });
      // refresh underlying data so the Courses tab + curriculum reflect the change
      await Promise.all([reloadCourses?.(), reloadCurriculum?.()]);
    } catch (err) {
      // rollback
      setSchemeCourses((prev) =>
        prev.map((c) => (c.id === course.id ? { ...c, semesterId: currentSem } : c))
      );
      toast(err.message || "Failed to move course", { type: "error" });
    } finally {
      setSavingMoveId(null);
    }
  };

  const onDrop = (e, targetSemesterId) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain")) || draggingId;
    const course = schemeCourses.find((c) => c.id === id);
    setDropTarget(null);
    setDraggingId(null);
    if (course) moveCourse(course, targetSemesterId);
  };

  const allowDrop = (e, target) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== target) setDropTarget(target);
  };

  const totalCredits = (list) => list.reduce((sum, c) => sum + (c.creditHours || 0), 0);

  if (schemeErr) {
    return <ErrorState title="Couldn't load scheme of study" description={schemeErr} onRetry={() => loadScheme(selectedProgramId)} />;
  }

  return (
    <div>
      {/* Program selector + hint */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs font-semibold text-secondary-app">Program</label>
          <select
            value={selectedProgramId}
            onChange={(e) => setSelectedProgramId(e.target.value)}
            className="input-base py-2 text-sm w-full sm:w-80"
          >
            {programs.length === 0 && <option value="">No programs available</option>}
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.shortForm || p.code} — {p.name}</option>
            ))}
          </select>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-muted-app font-semibold">
          <Move size={14} className="text-primary-600" />
          Drag any course card into a semester to build the scheme — saved instantly.
        </div>
      </div>

      {loadingScheme ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : semesters.length === 0 ? (
        <EmptyState icon="FileSpreadsheet" title="No semesters defined" description="This program has no semesters configured yet." />
      ) : (
        <div className="space-y-5">
          {/* Unassigned drop zone */}
          <SchemeColumn
            title="Unassigned Courses"
            subtitle="Drag from here into a semester"
            icon={<Inbox size={16} className="text-amber-500" />}
            accent="amber"
            isDropTarget={dropTarget === "unassigned"}
            onDragOver={(e) => allowDrop(e, "unassigned")}
            onDragLeave={() => setDropTarget((t) => (t === "unassigned" ? null : t))}
            onDrop={(e) => onDrop(e, null)}
            courses={coursesBySemester.unassigned || []}
            draggingId={draggingId}
            savingMoveId={savingMoveId}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            credits={totalCredits(coursesBySemester.unassigned || [])}
            horizontal
          />

          {/* Semester columns */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {semesters.map((sem) => (
              <SchemeColumn
                key={sem.id}
                title={sem.title || `Semester ${sem.number}`}
                subtitle={`${(coursesBySemester[sem.id] || []).length} course(s)`}
                icon={<GraduationCap size={16} className="text-primary-600" />}
                accent="blue"
                isDropTarget={dropTarget === sem.id}
                onDragOver={(e) => allowDrop(e, sem.id)}
                onDragLeave={() => setDropTarget((t) => (t === sem.id ? null : t))}
                onDrop={(e) => onDrop(e, sem.id)}
                courses={coursesBySemester[sem.id] || []}
                draggingId={draggingId}
                savingMoveId={savingMoveId}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                credits={totalCredits(coursesBySemester[sem.id] || [])}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const SchemeColumn = ({
  title, subtitle, icon, accent, isDropTarget, onDragOver, onDragLeave, onDrop,
  courses, draggingId, savingMoveId, onDragStart, onDragEnd, credits, horizontal,
}) => {
  const ring = isDropTarget
    ? accent === "amber"
      ? "ring-2 ring-amber-400 bg-amber-50/60 dark:bg-amber-500/5"
      : "ring-2 ring-primary-400 bg-primary-50/60 dark:bg-primary-500/5"
    : "";
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`card-base p-4 transition-all min-h-[8rem] ${ring}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-bold text-app text-sm inline-flex items-center gap-1.5">{icon} {title}</h4>
        <Badge color={accent === "amber" ? "amber" : "indigo"}>{credits} CH</Badge>
      </div>
      {subtitle && <p className="text-[11px] text-muted-app -mt-2 mb-3">{subtitle}</p>}
      <div className={horizontal ? "flex flex-wrap gap-2" : "space-y-2"}>
        {courses.map((c) => (
          <div
            key={c.id}
            draggable
            onDragStart={(e) => onDragStart(e, c)}
            onDragEnd={onDragEnd}
            className={`group cursor-grab active:cursor-grabbing select-none rounded-xl border border-app surface px-3 py-2 text-xs flex items-center gap-2 transition-all
              ${draggingId === c.id ? "opacity-40 scale-95" : "hover:shadow-md hover:border-primary-300"}
              ${horizontal ? "w-full sm:w-auto" : ""}`}
          >
            <GripVertical size={13} className="text-muted-app flex-shrink-0 group-hover:text-primary-500" />
            <div className="min-w-0">
              <span className="font-mono font-bold text-primary-700 dark:text-primary-400 mr-1.5">{c.code}</span>
              <span className="font-semibold text-app">{c.title}</span>
              <span className="text-muted-app ml-1.5">· {formatCredits(c)} cr{c.hasLab ? " (T+L)" : ""}</span>
            </div>
            {savingMoveId === c.id && <Loader2 size={12} className="animate-spin text-primary-500 ml-auto flex-shrink-0" />}
          </div>
        ))}
        {courses.length === 0 && (
          <div className="text-[11px] text-muted-app italic py-3 text-center border border-dashed border-app rounded-xl w-full">
            Drop courses here
          </div>
        )}
      </div>
    </div>
  );
};

export default Courses;

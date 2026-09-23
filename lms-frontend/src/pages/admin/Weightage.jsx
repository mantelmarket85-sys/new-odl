import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scale, Filter, Save, Loader2, X, Plus, Trash2, FlaskConical, BookOpen,
  AlertTriangle, CheckCircle2, Percent, ListChecks,
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

/* =============================================================
   MODULE: Weightage (Course Coordinator) — Req 3
   ------------------------------------------------------------
   • Smart filters by Semester + Program.
   • Configure assessment weightage for: Mid Term, Final Term,
     Quizzes, Assignments, Lab Tasks.
   • Number of Quizzes / Assignments / Lab Tasks is configurable, and
     each individual item carries its own weightage.
   • Lab Task weightage is shown ONLY for courses that have a Lab
     component; hidden entirely for non-lab subjects.
   • Semester-wise + Program-wise. Fully DB-backed via
     /lms/academic/coordinator/weightage/*.
   ============================================================= */

const emptyForm = {
  midWeight: 25, finalWeight: 40, quizWeight: 15, assignmentWeight: 20, labTaskWeight: 0,
  semesterProjectWeight: 0,
  quizCount: 0, assignmentCount: 0, labTaskCount: 0,
  quizItems: [], assignmentItems: [], labTaskItems: [],
};

// Sync a per-item array to a target count, preserving existing entries.
function resizeItems(items, count, prefix) {
  const next = [...(items || [])];
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  while (next.length < n) next.push({ label: `${prefix} ${next.length + 1}`, weight: 0 });
  next.length = n;
  return next;
}

// Point 12 — split a category total equally across `n` items. The remainder
// (from non-divisible totals) is spread onto the first items so the per-item
// weights always sum back to the category total. Values are rounded to 2 dp,
// e.g. 20% / 4 -> [5, 5, 5, 5]; 10% / 3 -> [3.34, 3.33, 3.33].
function equalSplit(total, n) {
  const count = Math.max(0, Math.trunc(Number(n) || 0));
  if (count === 0) return [];
  const t = Math.round((Number(total) || 0) * 100); // work in integer "cents" of a percent
  const base = Math.floor(t / count);
  let remainder = t - base * count;
  return Array.from({ length: count }, (_, i) => {
    const cents = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return Math.round(cents) / 100;
  });
}

// Apply an equal split of `total` across the given items, preserving labels.
function applyEqualSplit(items, total, count, prefix) {
  const resized = resizeItems(items, count, prefix);
  const weights = equalSplit(total, resized.length);
  return resized.map((it, i) => ({ ...it, weight: weights[i] ?? 0 }));
}

const ITEM_PREFIX = { quiz: "Quiz", assignment: "Assignment", labTask: "Lab Task" };

/* -------------------------------------------------------------
   §3.1 — AUTO-SCROLL / FOCUS-LOSS FIX
   -------------------------------------------------------------
   `ItemRows` and `CountField` used to be declared INSIDE the
   `Weightage` component body. Because a new function identity was
   created on every render, React treated them as a *different*
   component type on each keystroke and therefore unmounted and
   remounted the entire subtree — destroying and recreating the
   focused <input>. The browser then lost focus and the scroll
   container jumped back, which is what made the page appear to
   "auto-scroll by itself" while editing a field.

   Hoisting both components to module scope gives them a stable
   identity, so React now simply updates the existing inputs.
   Focus and scroll position are preserved and the user scrolls
   only when they choose to.

   No fields, content, labels, markup or calculation logic were
   changed — this is purely a component-identity fix.
   ------------------------------------------------------------- */
const ItemRows = ({ kind, prefix, items, setItem }) => {
  if (!items?.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={it.label ?? `${prefix} ${i + 1}`}
            onChange={(e) => setItem(kind, i, "label", e.target.value)}
            className="input-base flex-1 text-xs py-1.5"
            placeholder={`${prefix} ${i + 1}`}
          />
          <div className="relative w-24">
            <input
              type="number" min="0" step="0.5"
              value={it.weight ?? 0}
              onChange={(e) => setItem(kind, i, "weight", e.target.value)}
              className="input-base w-full text-xs py-1.5 pr-6"
            />
            <Percent size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      ))}
    </div>
  );
};

const CountField = ({ label, kind, icon: Icon, form, setCount, setCategoryWeight, setItem }) => (
  <div>
    <label className="text-xs font-semibold text-secondary-app flex items-center gap-1">
      <Icon size={12} /> {label}
    </label>
    <div className="grid grid-cols-2 gap-2 mt-1">
      <div>
        <span className="text-[10px] text-muted-app">Count</span>
        <input
          type="number" min="0"
          value={form[`${kind}Count`]}
          onChange={(e) => setCount(kind, e.target.value)}
          className="input-base w-full text-xs py-1.5"
        />
      </div>
      <div>
        <span className="text-[10px] text-muted-app">Category %</span>
        <input
          type="number" min="0" step="0.5"
          value={form[`${kind}Weight`]}
          onChange={(e) => setCategoryWeight(kind, e.target.value)}
          className="input-base w-full text-xs py-1.5"
        />
      </div>
    </div>
    {form[`${kind}Count`] > 0 && (
      <p className="mt-1 text-[10px] text-muted-app">
        Split equally across {Math.trunc(Number(form[`${kind}Count`]) || 0)} — edit any row below to override.
      </p>
    )}
    <ItemRows kind={kind} prefix={label.replace(/s$/, "")} items={form[`${kind}Items`] || []} setItem={setItem} />
  </div>
);

const Weightage = () => {
  const { toast } = useToast();

  // ---- Filters ----
  const progApi = useApi(() => api.coordinator.scopedPrograms(), []);
  const programs = useMemo(() => progApi.data?.programs || [], [progApi.data]);
  const [programId, setProgramId] = useState("");
  const [semesterId, setSemesterId] = useState("");

  const [semesters, setSemesters] = useState([]);
  useEffect(() => {
    let active = true;
    if (!programId) { setSemesters([]); setSemesterId(""); return; }
    api.structure.programSemesters(programId)
      .then((r) => { if (active) setSemesters(r.semesters || r || []); })
      .catch(() => { if (active) setSemesters([]); });
    setSemesterId("");
    return () => { active = false; };
  }, [programId]);

  // ---- Courses (filtered) ----
  const coursesApi = useApi(
    () => api.coordinator.weightageCourses(programId || undefined, semesterId || undefined),
    [programId, semesterId]
  );
  const courses = useMemo(() => coursesApi.data?.courses || [], [coursesApi.data]);

  // ---- Editor modal ----
  const [editing, setEditing] = useState(null); // course being configured
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const openEditor = (course) => {
    const w = course.weightage || {};
    setEditing(course);
    setForm({
      midWeight: w.midWeight ?? 25,
      finalWeight: w.finalWeight ?? 40,
      quizWeight: w.quizWeight ?? 15,
      assignmentWeight: w.assignmentWeight ?? 20,
      labTaskWeight: course.hasLab ? (w.labTaskWeight ?? 0) : 0,
      semesterProjectWeight: course.hasLab ? (w.semesterProjectWeight ?? 0) : 0,
      quizCount: w.quizCount ?? (w.quizItems?.length || 0),
      assignmentCount: w.assignmentCount ?? (w.assignmentItems?.length || 0),
      labTaskCount: course.hasLab ? (w.labTaskCount ?? (w.labTaskItems?.length || 0)) : 0,
      quizItems: w.quizItems?.length ? w.quizItems : [],
      assignmentItems: w.assignmentItems?.length ? w.assignmentItems : [],
      labTaskItems: course.hasLab && w.labTaskItems?.length ? w.labTaskItems : [],
    });
  };

  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Point 12 — Keep per-item arrays in sync with their counts AND auto-distribute
  // the category % equally across the items in real time. Changing the count
  // re-computes an equal split of the current category weight.
  const setCount = (kind, count) => {
    setForm((f) => {
      const prefix = ITEM_PREFIX[kind] || kind;
      const total = Number(f[`${kind}Weight`]) || 0;
      const items = applyEqualSplit(f[`${kind}Items`], total, count, prefix);
      return { ...f, [`${kind}Count`]: count, [`${kind}Items`]: items };
    });
  };

  // Point 12 — Changing the category % re-distributes it equally across the
  // existing items in real time. The coordinator can still override individual
  // item weights afterward via the per-item inputs (setItem).
  const setCategoryWeight = (kind, value) => {
    setForm((f) => {
      const prefix = ITEM_PREFIX[kind] || kind;
      const count = Math.trunc(Number(f[`${kind}Count`]) || 0);
      const next = { ...f, [`${kind}Weight`]: value };
      if (count > 0) {
        next[`${kind}Items`] = applyEqualSplit(f[`${kind}Items`], Number(value) || 0, count, prefix);
      }
      return next;
    });
  };

  const setItem = (kind, idx, key, value) => {
    setForm((f) => {
      const arrKey = `${kind}Items`;
      const arr = [...(f[arrKey] || [])];
      arr[idx] = { ...arr[idx], [key]: key === "weight" ? value : value };
      return { ...f, [arrKey]: arr };
    });
  };

  const totalCategory = useMemo(() => {
    const t =
      Number(form.midWeight || 0) +
      Number(form.finalWeight || 0) +
      Number(form.quizWeight || 0) +
      Number(form.assignmentWeight || 0) +
      (editing?.hasLab ? Number(form.labTaskWeight || 0) : 0) +
      (editing?.hasLab ? Number(form.semesterProjectWeight || 0) : 0);
    return Math.round(t * 100) / 100;
  }, [form, editing]);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const payload = {
        midWeight: Number(form.midWeight) || 0,
        finalWeight: Number(form.finalWeight) || 0,
        quizWeight: Number(form.quizWeight) || 0,
        assignmentWeight: Number(form.assignmentWeight) || 0,
        labTaskWeight: editing.hasLab ? Number(form.labTaskWeight) || 0 : 0,
        semesterProjectWeight: editing.hasLab ? Number(form.semesterProjectWeight) || 0 : 0,
        quizCount: Math.trunc(Number(form.quizCount) || 0),
        assignmentCount: Math.trunc(Number(form.assignmentCount) || 0),
        labTaskCount: editing.hasLab ? Math.trunc(Number(form.labTaskCount) || 0) : 0,
        quizItems: (form.quizItems || []).map((it) => ({ label: it.label, weight: Number(it.weight) || 0 })),
        assignmentItems: (form.assignmentItems || []).map((it) => ({ label: it.label, weight: Number(it.weight) || 0 })),
        labTaskItems: editing.hasLab ? (form.labTaskItems || []).map((it) => ({ label: it.label, weight: Number(it.weight) || 0 })) : [],
      };
      const res = await api.coordinator.saveWeightage(editing.id, payload);
      toast(res.balanced ? "Weightage saved (totals 100%)" : `Weightage saved — categories total ${res.total}%`, {
        type: res.balanced ? "success" : "warning",
      });
      setEditing(null);
      coursesApi.reload();
    } catch (err) {
      toast(err.message || "Save failed", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Weightage"
        subtitle="Configure assessment weightage (Mid, Final, Quizzes, Assignments, Lab Tasks) per course — filtered by Program & Semester."
        icon="Scale"
        breadcrumb={["Coordinator", "Weightage"]}
      />

      {/* Smart filters */}
      <div className="card-base p-4 mb-5">
        <div className="flex items-center gap-2 mb-3 text-sm font-bold text-app">
          <Filter size={15} className="text-primary-600" /> Smart Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-secondary-app">Program</label>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="input-base mt-1 w-full">
              <option value="">All Programs</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.shortForm || p.code} — {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-secondary-app">Semester</label>
            <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className="input-base mt-1 w-full" disabled={!programId}>
              <option value="">{programId ? "All Semesters" : "Select a program first"}</option>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>Semester {s.number}{s.title ? ` — ${s.title}` : ""}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Course list */}
      {coursesApi.error ? (
        <ErrorState title="Couldn't load courses" description={coursesApi.error} onRetry={coursesApi.reload} />
      ) : coursesApi.loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : courses.length === 0 ? (
        <EmptyState icon="Scale" title="No courses found" description="Adjust the program/semester filters to find courses to configure." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {courses.map((c, i) => {
            const w = c.weightage || {};
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="card-base p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-app">{c.code}</span>
                        {c.hasLab
                          ? <Badge color="violet"><FlaskConical size={10} className="inline mr-0.5" /> Lab</Badge>
                          : <Badge color="slate"><BookOpen size={10} className="inline mr-0.5" /> Theory</Badge>}
                        {w.configured
                          ? <Badge color="emerald"><CheckCircle2 size={10} className="inline mr-0.5" /> Configured</Badge>
                          : <Badge color="amber"><AlertTriangle size={10} className="inline mr-0.5" /> Not set</Badge>}
                      </div>
                      <p className="text-xs text-muted-app mt-0.5">{c.title}</p>
                      <p className="text-[11px] text-muted-app mt-0.5">
                        {c.program?.shortForm || "—"}{c.semester ? ` · Sem ${c.semester.number}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Weightage summary chips */}
                  <div className="flex flex-wrap gap-1.5 mt-3 text-[10px]">
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 font-semibold">Mid {w.midWeight ?? 25}%</span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 font-semibold">Final {w.finalWeight ?? 40}%</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 font-semibold">Quiz {w.quizWeight ?? 15}% ×{w.quizCount ?? 0}</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 font-semibold">Assign {w.assignmentWeight ?? 20}% ×{w.assignmentCount ?? 0}</span>
                    {c.hasLab && (
                      <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300 font-semibold">Lab Task {w.labTaskWeight ?? 0}% ×{w.labTaskCount ?? 0}</span>
                    )}
                    {c.hasLab && (
                      <span className="px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300 font-semibold">Semester Project {w.semesterProjectWeight ?? 0}%</span>
                    )}
                  </div>
                </div>

                <button onClick={() => openEditor(c)} className="btn-primary text-xs py-2 px-3 mt-4 self-start">
                  <ListChecks size={13} className="inline mr-1" /> Configure Weightage
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Editor modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)}
        title={editing ? `Weightage — ${editing.code}` : "Weightage"}
        subtitle={editing ? editing.title : ""}
        icon={Scale} maxWidth="max-w-2xl">
        {editing && (
          <div className="space-y-4">
            {/* Exam category weights */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-secondary-app">Mid Term %</label>
                <input type="number" min="0" step="0.5" value={form.midWeight} onChange={(e) => change("midWeight", e.target.value)} className="input-base mt-1 w-full text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-secondary-app">Final Term %</label>
                <input type="number" min="0" step="0.5" value={form.finalWeight} onChange={(e) => change("finalWeight", e.target.value)} className="input-base mt-1 w-full text-sm" />
              </div>
            </div>

            <div className="border-t border-app pt-3 grid grid-cols-1 gap-4">
              <CountField label="Quizzes" kind="quiz" icon={ListChecks} form={form} setCount={setCount} setCategoryWeight={setCategoryWeight} setItem={setItem} />
              <CountField label="Assignments" kind="assignment" icon={ListChecks} form={form} setCount={setCount} setCategoryWeight={setCategoryWeight} setItem={setItem} />
              {/* Lab Task section ONLY for lab courses */}
              {editing.hasLab && (
                <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-3">
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-violet-700 dark:text-violet-300">
                    <FlaskConical size={13} /> Lab Tasks (lab course)
                  </div>
                  <CountField label="Lab Tasks" kind="labTask" icon={FlaskConical} form={form} setCount={setCount} setCategoryWeight={setCategoryWeight} setItem={setItem} />
                  {/* Semester Project (lab) — coordinator-adjustable (Req 1.3) */}
                  <div className="mt-3 pt-3 border-t border-violet-200 dark:border-violet-800">
                    <label className="text-xs font-semibold text-secondary-app flex items-center gap-1">
                      <FlaskConical size={12} /> Semester Project (lab) %
                    </label>
                    <div className="relative w-full mt-1">
                      <input
                        type="number" min="0" step="0.5"
                        value={form.semesterProjectWeight}
                        onChange={(e) => change("semesterProjectWeight", e.target.value)}
                        className="input-base w-full text-sm py-1.5 pr-6"
                      />
                      <Percent size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                    <p className="text-[10px] text-muted-app mt-1">Weightage of the course's lab semester project, adjustable here.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Total indicator */}
            <div className={`rounded-xl p-3 text-xs font-semibold flex items-center gap-2 ${Math.abs(totalCategory - 100) < 0.001 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}>
              {Math.abs(totalCategory - 100) < 0.001 ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              Category weightage total: {totalCategory}% {Math.abs(totalCategory - 100) < 0.001 ? "(balanced)" : "(should total 100%)"}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-app">
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary text-sm py-2 px-4"><X size={14} className="inline mr-1" /> Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving} className="btn-primary text-sm py-2 px-4 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="inline mr-1 animate-spin" /> : <Save size={14} className="inline mr-1" />} Save Weightage
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Weightage;

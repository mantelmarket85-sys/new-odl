import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Layers, Plus, Trash2, History, GripVertical, BookOpen, Pencil,
  ChevronLeft, Layout, Boxes, CheckCircle2,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Badge from "../../components/common/Badge";
import Modal from "../../components/common/Modal";
import { useToast } from "../../context/ToastContext";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

/* =========================================================================
 * Course Coordinator → Scheme of Study (LIVE, drag & drop)
 *
 * Two views:
 *   1. Scheme list  — create / edit / delete schemes per program.
 *   2. Builder      — visual semester columns + an "unassigned pool" of the
 *                     program's courses (auto-loaded). Drag courses between
 *                     the pool and semesters; reorder within a semester.
 *                     Every drop persists instantly + records a version.
 * Uses native HTML5 drag & drop (no extra dependencies). Real DB data only.
 * ======================================================================= */

const Schemes = () => {
  const { toast } = useToast();

  const [view, setView] = useState("list"); // 'list' | 'builder'
  const [activeSchemeId, setActiveSchemeId] = useState(null);

  return view === "list" ? (
    <SchemeList
      onOpen={(id) => { setActiveSchemeId(id); setView("builder"); }}
      toast={toast}
    />
  ) : (
    <SchemeBuilder
      schemeId={activeSchemeId}
      onBack={() => { setView("list"); setActiveSchemeId(null); }}
      toast={toast}
    />
  );
};

/* ---------------- Scheme list ---------------- */
function SchemeList({ onOpen, toast }) {
  const [schemes, setSchemes] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ programId: "", name: "", description: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [s, p] = await Promise.all([
        api.coordinator.schemes(),
        api.coordinator.scopedPrograms(),
      ]);
      setSchemes(s.schemes || []);
      setPrograms(p.programs || []);
    } catch (err) {
      setError(err.message || "Failed to load schemes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ programId: programs[0]?.id || "", name: "", description: "" }); setOpen(true); };
  const openEdit = (s) => { setEditing(s); setForm({ programId: s.programId, name: s.name, description: s.description || "" }); setOpen(true); };

  const submit = async () => {
    if (!form.name.trim() || !form.programId) {
      toast("Program and name are required", { type: "error" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.coordinator.updateScheme(editing.id, { name: form.name.trim(), description: form.description });
        toast("Scheme updated", { type: "success" });
      } else {
        await api.coordinator.createScheme({ programId: form.programId, name: form.name.trim(), description: form.description });
        toast("Scheme created", { type: "success" });
      }
      setOpen(false);
      load();
    } catch (err) {
      toast(err.message || "Save failed", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete scheme "${s.name}"?`)) return;
    try {
      await api.coordinator.deleteScheme(s.id);
      toast("Scheme deleted", { type: "success" });
      load();
    } catch (err) {
      toast(err.message || "Delete failed", { type: "error" });
    }
  };

  return (
    <div>
      <PageHeader
        title="Scheme of Study"
        subtitle="Build semester-wise curricula for each program with a drag & drop interface. Version history is kept automatically."
        icon="Layers"
        breadcrumb={["Course Coordinator", "Scheme of Study"]}
        actions={<button onClick={openCreate} className="btn-primary text-sm inline-flex items-center gap-1.5"><Plus size={14} /> New Scheme</button>}
      />

      {error ? (
        <ErrorState title="Couldn't load schemes" description={error} onRetry={load} />
      ) : loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : schemes.length === 0 ? (
        <EmptyState icon="Layers" title="No schemes yet" description="Create a scheme of study to start mapping courses to semesters." action={openCreate} actionLabel="New Scheme" />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {schemes.map((s) => (
            <div key={s.id} className="card-base p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-950/40 text-primary-700 dark:text-primary-400 flex items-center justify-center"><Layers size={18} /></div>
                  <div>
                    <p className="font-bold text-app">{s.name}</p>
                    <p className="text-xs text-muted-app">{s.program?.shortForm || s.program?.name || "—"}</p>
                  </div>
                </div>
                {s.isActive && <Badge color="emerald">Active</Badge>}
              </div>
              {s.description && <p className="text-xs text-muted-app mt-2 line-clamp-2">{s.description}</p>}
              <div className="flex items-center gap-3 text-xs text-muted-app mt-3">
                <span className="inline-flex items-center gap-1"><BookOpen size={12} /> {s.courseCount} course(s)</span>
                <span>v{s.version}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-app">
                <button onClick={() => onOpen(s.id)} className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1 flex-1 justify-center"><Layout size={13} /> Open Builder</button>
                <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg border border-app text-blue-600" title="Edit"><Pencil size={14} /></button>
                <button onClick={() => remove(s)} className="p-1.5 rounded-lg border border-app text-rose-600" title="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Scheme" : "New Scheme"} icon={Layers} maxWidth="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Program *</label>
            <select value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })} disabled={!!editing} className="input-base py-2 text-sm w-full">
              <option value="">— Select program —</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.shortForm})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. ADCS Scheme 2026" className="input-base py-2 text-sm w-full" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="input-base py-2 text-sm w-full" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl border border-app text-sm font-bold text-app">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary text-sm disabled:opacity-60">{saving ? "Saving…" : editing ? "Save" : "Create"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- Drag & drop builder ---------------- */
function SchemeBuilder({ schemeId, onBack, toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dragItem, setDragItem] = useState(null); // { kind: 'pool'|'item', courseId, schemeCourseId, fromSemester }
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await api.coordinator.scheme(schemeId);
      setData(res);
    } catch (err) {
      setError(err.message || "Failed to load scheme");
    } finally {
      setLoading(false);
    }
  }, [schemeId]);

  useEffect(() => { load(); }, [load]);

  const totalCredits = useMemo(() => {
    if (!data) return 0;
    return data.semesters.reduce((sum, s) => sum + s.courses.reduce((a, c) => a + (c.credits || 0), 0), 0);
  }, [data]);
  const assignedCount = useMemo(() => data ? data.semesters.reduce((a, s) => a + s.courses.length, 0) : 0, [data]);

  // ---- Drop handlers ----
  const onDropToSemester = async (semesterNumber) => {
    if (!dragItem || busy) return;
    const item = dragItem;
    setDragItem(null);
    if (item.kind === "item" && item.fromSemester === semesterNumber) return; // same column, no-op (reorder handled separately)
    setBusy(true);
    try {
      if (item.kind === "pool") {
        await api.coordinator.addSchemeItem(schemeId, { courseId: item.courseId, semester: semesterNumber });
      } else {
        await api.coordinator.moveSchemeItem(schemeId, item.schemeCourseId, { semester: semesterNumber });
      }
      await load();
    } catch (err) {
      toast(err.message || "Operation failed", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const onDropToPool = async () => {
    if (!dragItem || busy || dragItem.kind !== "item") { setDragItem(null); return; }
    const item = dragItem;
    setDragItem(null);
    setBusy(true);
    try {
      await api.coordinator.removeSchemeItem(schemeId, item.schemeCourseId);
      await load();
    } catch (err) {
      toast(err.message || "Remove failed", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  // Reorder within a semester: drop onto a specific card.
  const onDropOnCard = async (semesterNumber, targetCourse) => {
    if (!dragItem || busy) return;
    const item = dragItem;
    setDragItem(null);
    if (item.kind !== "item" || item.fromSemester !== semesterNumber) {
      // Falls through to a normal move into this semester.
      if (item.kind === "pool" || item.fromSemester !== semesterNumber) { return onDropToSemester(semesterNumber); }
      return;
    }
    const sem = data.semesters.find((s) => s.number === semesterNumber);
    if (!sem) return;
    const ids = sem.courses.map((c) => c.schemeCourseId).filter((id) => id !== item.schemeCourseId);
    const targetIdx = sem.courses.findIndex((c) => c.schemeCourseId === targetCourse.schemeCourseId);
    ids.splice(targetIdx, 0, item.schemeCourseId);
    setBusy(true);
    try {
      await api.coordinator.reorderScheme(schemeId, { semester: semesterNumber, order: ids });
      await load();
    } catch (err) {
      toast(err.message || "Reorder failed", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const removeCard = async (c) => {
    setBusy(true);
    try {
      await api.coordinator.removeSchemeItem(schemeId, c.schemeCourseId);
      await load();
    } catch (err) {
      toast(err.message || "Remove failed", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    try {
      const res = await api.coordinator.schemeHistory(schemeId);
      setHistory(res.versions || []);
    } catch (_) { setHistory([]); }
  };

  if (loading) return <div className="space-y-3"><Skeleton className="h-12" /><div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64" />)}</div></div>;
  if (error) return <ErrorState title="Couldn't load scheme" description={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title={data.scheme.name}
        subtitle={`${data.scheme.program?.name || ""} · Drag courses between the pool and semesters. Every change saves instantly.`}
        icon="Layers"
        breadcrumb={["Course Coordinator", "Scheme of Study", "Builder"]}
        actions={
          <div className="flex gap-2">
            <button onClick={onBack} className="px-3 py-2 rounded-xl border border-app text-sm font-bold text-app inline-flex items-center gap-1.5"><ChevronLeft size={14} /> Back</button>
            <button onClick={openHistory} className="px-3 py-2 rounded-xl border border-app text-sm font-bold text-app inline-flex items-center gap-1.5"><History size={14} /> History (v{data.scheme.version})</button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard title="Total Courses" value={data.totalCourses} icon="BookOpen" color="blue" />
        <StatCard title="Assigned" value={assignedCount} icon="CheckCircle2" color="emerald" delay={0.05} />
        <StatCard title="Unassigned" value={data.unassigned.length} icon="Boxes" color="amber" delay={0.1} />
        <StatCard title="Total Credits" value={totalCredits} icon="Layers" color="indigo" delay={0.15} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Unassigned pool */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropToPool}
          className="card-base p-3 lg:col-span-1"
        >
          <p className="text-sm font-bold text-app mb-2 flex items-center gap-1.5"><Boxes size={15} className="text-amber-500" /> Unassigned Courses</p>
          <p className="text-[11px] text-muted-app mb-3">Drag a course into a semester. Drop a course here to remove it from the scheme.</p>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {data.unassigned.length === 0 ? (
              <p className="text-xs text-muted-app italic py-4 text-center">All program courses are assigned 🎉</p>
            ) : (
              data.unassigned.map((c) => (
                <CourseCard key={c.courseId} c={c}
                  onDragStart={() => setDragItem({ kind: "pool", courseId: c.courseId })}
                  pool />
              ))
            )}
          </div>
        </div>

        {/* Semester columns */}
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.semesters.map((sem) => {
            const credits = sem.courses.reduce((a, c) => a + (c.credits || 0), 0);
            return (
              <div key={sem.number}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDropToSemester(sem.number)}
                className="card-base p-3 flex flex-col min-h-[180px]"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-app">{sem.title}</p>
                  <Badge color="slate">{sem.courses.length} · {credits} cr</Badge>
                </div>
                <div className="space-y-2 flex-1">
                  {sem.courses.length === 0 ? (
                    <div className="border-2 border-dashed border-app rounded-xl py-6 text-center text-xs text-muted-app">Drop courses here</div>
                  ) : (
                    sem.courses.map((c) => (
                      <CourseCard key={c.schemeCourseId} c={c}
                        onDragStart={() => setDragItem({ kind: "item", schemeCourseId: c.schemeCourseId, courseId: c.courseId, fromSemester: sem.number })}
                        onDrop={(e) => { e.stopPropagation(); onDropOnCard(sem.number, c); }}
                        onRemove={() => removeCard(c)} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {busy && <p className="text-xs text-muted-app mt-3 inline-flex items-center gap-1"><CheckCircle2 size={12} className="animate-pulse" /> Saving…</p>}

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Version History" subtitle="Each structural change creates a new version." icon={History} maxWidth="max-w-lg">
        {history.length === 0 ? (
          <EmptyState icon="History" title="No history" description="Versions will appear as you build the scheme." />
        ) : (
          <ol className="relative border-l border-app ml-2 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {history.map((v) => (
              <li key={v.id} className="ml-4">
                <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-primary-500" />
                <div className="flex items-center gap-2">
                  <Badge color="blue">v{v.version}</Badge>
                  <span className="text-xs text-muted-app">{new Date(v.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-app mt-0.5">{v.changeNote || "Updated"}</p>
                <p className="text-[11px] text-muted-app">{v.items.length} course(s) in this version</p>
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </div>
  );
}

function CourseCard({ c, onDragStart, onDrop, onRemove, pool }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop}
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 cursor-grab active:cursor-grabbing ${pool ? "border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20" : "border-app surface"}`}
    >
      <GripVertical size={14} className="text-muted-app shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-app truncate">{c.code}</p>
        <p className="text-[11px] text-muted-app truncate">{c.title}</p>
      </div>
      <span className="text-[10px] text-muted-app shrink-0">{c.credits} cr</span>
      {onRemove && (
        <button onClick={onRemove} className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded shrink-0" title="Remove"><Trash2 size={12} /></button>
      )}
    </div>
  );
}

export default Schemes;

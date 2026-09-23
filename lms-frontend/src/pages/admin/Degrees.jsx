import { motion } from "framer-motion";
import { Plus, GraduationCap, Edit3, BookOpen, Layers, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";

const emptyForm = { code: "", name: "", shortForm: "", department: "", totalSemesters: 4, durationYears: 2 };

const Degrees = () => {
  const { toast } = useToast();
  // Department-scoped programs (coordinator only sees their department's programs).
  const { data, loading, error, reload } = useApi(() => api.coordinator.scopedPrograms(), []);
  const programs = data?.programs || data?.items || [];
  const scopedDepartment = data?.scopedDepartment || null;

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [viewProg, setViewProg] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const removeProgram = async (d) => {
    if (!window.confirm(`Archive program "${d.name}"? It will be hidden from active lists.`)) return;
    setDeleting(d.id);
    try {
      await api.coordinator.deleteProgram(d.id);
      toast("Program archived", { type: "success" });
      await reload();
    } catch (err) {
      toast(err.message || "Failed to delete program", { type: "error" });
    } finally {
      setDeleting(null);
    }
  };

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (d) => {
    setEditingId(d.id);
    setForm({
      code: d.code || "",
      name: d.name || "",
      shortForm: d.shortForm || "",
      department: d.department || "",
      totalSemesters: d.totalSemesters || 4,
      durationYears: d.durationYears || 2,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim() || (!editingId && !form.code.trim())) {
      toast("Program name and code are required", { type: "error" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        shortForm: form.shortForm.trim() || form.code.trim(),
        department: form.department.trim(),
        totalSemesters: Number(form.totalSemesters) || 4,
        durationYears: Number(form.durationYears) || 2,
      };
      if (editingId) {
        await api.coordinator.updateProgram(editingId, payload);
        toast("Program updated", { type: "success" });
      } else {
        await api.coordinator.createProgram(payload);
        toast("Program created", { type: "success" });
      }
      setOpen(false);
      await reload();
    } catch (err) {
      toast(err.message || "Failed to save program", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Degree Programs" subtitle={scopedDepartment ? `Programs in ${scopedDepartment}` : "Manage the academic programs assigned to you"} icon="GraduationCap" breadcrumb={["Coordinator", "Programs"]} actions={
        <button onClick={openAdd} className="btn-primary text-sm py-2 px-3"><Plus size={14} className="inline mr-1" /> New Program</button>
      } />

      {error ? (
        <ErrorState title="Couldn't load programs" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>
      ) : programs.length === 0 ? (
        <EmptyState icon="GraduationCap" title="No programs yet" description="Create your first degree program." action={openAdd} actionLabel="New Program" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((d, i) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-soft overflow-hidden card-hover">
              <div className="h-24 bg-gradient-to-br from-primary-600 to-blue-700 p-5 text-white relative overflow-hidden">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                <GraduationCap size={26} className="mb-1" />
                <p className="text-xs opacity-80 font-mono">{d.code}</p>
              </div>
              <div className="p-4">
                <p className="font-display font-bold text-slate-900 dark:text-slate-100 text-base leading-tight">{d.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{d.department}</p>
                <div className="grid grid-cols-3 gap-2 my-3 text-center">
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg"><p className="text-[10px] text-slate-500 dark:text-slate-400">Duration</p><p className="font-bold text-xs">{d.durationYears} yr</p></div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg"><p className="text-[10px] text-slate-500 dark:text-slate-400">Sems.</p><p className="font-bold text-xs">{d.totalSemesters}</p></div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg"><p className="text-[10px] text-slate-500 dark:text-slate-400">Courses</p><p className="font-bold text-xs">{d._count?.courses ?? 0}</p></div>
                </div>
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400"><Layers size={12} /> {d._count?.semesters ?? 0} semesters</span>
                  <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400"><BookOpen size={12} /> {d._count?.courses ?? 0} courses</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setViewProg(d)} className="py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"><Eye size={12} className="inline mr-1" /> View</button>
                  <button onClick={() => openEdit(d)} className="py-1.5 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 text-xs font-bold rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40"><Edit3 size={12} className="inline mr-1" /> Edit</button>
                  <button onClick={() => removeProgram(d)} disabled={deleting === d.id} className="py-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 disabled:opacity-50"><Trash2 size={12} className="inline mr-1" /> {deleting === d.id ? "…" : "Delete"}</button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "Edit Program" : "New Program"} icon={GraduationCap}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold mb-1 block text-secondary-app">Program Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-base w-full" placeholder="e.g. Associate Degree in Computer Science" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block text-secondary-app">Program Code *</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editingId} className="input-base w-full disabled:opacity-60" placeholder="e.g. ADCS" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block text-secondary-app">Short Form</label>
              <input value={form.shortForm} onChange={(e) => setForm({ ...form, shortForm: e.target.value })} className="input-base w-full" placeholder="e.g. ADCS" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block text-secondary-app">Department</label>
            <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="input-base w-full" placeholder="e.g. Department of Computing" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block text-secondary-app">Duration (years)</label>
              <input type="number" min="1" step="0.5" value={form.durationYears} onChange={(e) => setForm({ ...form, durationYears: e.target.value })} className="input-base w-full" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block text-secondary-app">Total Semesters</label>
              <input type="number" min="1" value={form.totalSemesters} onChange={(e) => setForm({ ...form, totalSemesters: e.target.value })} className="input-base w-full" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary flex-1 disabled:opacity-60">{saving ? "Saving…" : editingId ? "Save Changes" : "Create"}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!viewProg} onClose={() => setViewProg(null)} title="Program Details" icon={GraduationCap}>
        {viewProg && (
          <div className="space-y-3">
            <div>
              <p className="font-display font-bold text-lg text-app">{viewProg.name}</p>
              <p className="text-xs text-muted-app font-mono">{viewProg.code} · {viewProg.shortForm}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Department" value={viewProg.department || "—"} />
              <Field label="Status" value={viewProg.isActive === false ? "Inactive" : "Active"} />
              <Field label="Duration" value={`${viewProg.durationYears} year(s)`} />
              <Field label="Total Semesters" value={viewProg.totalSemesters} />
              <Field label="Semesters" value={viewProg._count?.semesters ?? 0} />
              <Field label="Courses" value={viewProg._count?.courses ?? 0} />
            </div>
            <button onClick={() => { const d = viewProg; setViewProg(null); openEdit(d); }} className="btn-primary w-full"><Edit3 size={14} className="inline mr-1" /> Edit Program</button>
          </div>
        )}
      </Modal>
    </div>
  );
};

const Field = ({ label, value }) => (
  <div className="surface border border-app rounded-xl p-3">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app mb-1">{label}</p>
    <p className="text-sm font-semibold text-app break-words">{value ?? "—"}</p>
  </div>
);

export default Degrees;

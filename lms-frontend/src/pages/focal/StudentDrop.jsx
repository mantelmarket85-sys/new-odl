import { useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import ExportButtons from "../../components/enterprise/ExportButtons";
import Modal from "../../components/common/Modal";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { UserX, UserCheck, AlertTriangle, Search, RotateCcw, Loader2 } from "lucide-react";
import { useToast } from "../../context/ToastContext";

const BLOCK_REASONS = ["Academic Failure", "Non-payment of Dues", "Disciplinary Action", "Voluntary Withdrawal", "Prolonged Absence", "Other"];
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

const StudentDrop = () => {
  const { data, loading, error, reload } = useApi(() => api.focal.deactivations(), []);
  const [open, setOpen] = useState(false);
  const [restoreModal, setRestoreModal] = useState(null);
  const [form, setForm] = useState({ student: null, reason: BLOCK_REASONS[0], customReason: "", remarks: "" });
  const [restoreNote, setRestoreNote] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const rows = data?.deactivated || [];

  const searchStudents = async (q) => {
    setStudentSearch(q);
    setForm((f) => ({ ...f, student: null }));
    if (!q.trim()) { setMatches([]); return; }
    setSearching(true);
    try {
      const r = await api.focal.students(`?search=${encodeURIComponent(q)}&active=true&pageSize=6`);
      setMatches(r.items || []);
    } catch { setMatches([]); }
    finally { setSearching(false); }
  };

  const submitBlock = async () => {
    if (!form.student) { toast("Pick a student first", { type: "warning", title: "Required" }); return; }
    if (form.reason === "Other" && !form.customReason.trim()) {
      toast("Custom reason is required when 'Other' is selected", { type: "warning", title: "Required" });
      return;
    }
    const reason = form.reason === "Other" ? form.customReason : form.reason;
    setSaving(true);
    try {
      await api.focal.setStudentActive(form.student.id, { isActive: false, reason, remarks: form.remarks });
      toast(`${form.student.name} has been blocked. LMS login is now disabled.`, { type: "success", title: "Student Blocked" });
      setForm({ student: null, reason: BLOCK_REASONS[0], customReason: "", remarks: "" });
      setStudentSearch(""); setMatches([]); setOpen(false);
      reload();
    } catch (e) {
      toast(e.message || "Failed to block", { type: "error", title: "Error" });
    } finally { setSaving(false); }
  };

  const submitRestore = async () => {
    setSaving(true);
    try {
      await api.focal.setStudentActive(restoreModal.id, { isActive: true, reason: restoreNote || "Restored by Focal Person" });
      toast(`${restoreModal.name} restored to LMS.`, { type: "success", title: "Student Restored" });
      setRestoreModal(null); setRestoreNote("");
      reload();
    } catch (e) {
      toast(e.message || "Failed to restore", { type: "error", title: "Error" });
    } finally { setSaving(false); }
  };

  const columns = [
    { key: "name", label: "Student", render: (v, r) => (
      <div><p className="font-bold text-app text-sm">{v}</p><p className="text-[10px] text-muted-app font-mono">{r.roll}</p></div>
    )},
    { key: "program", label: "Program" },
    { key: "deactivatedAt", label: "Blocked On", render: (v) => fmtDate(v) },
    { key: "_access", label: "LMS Access", render: () => (
      <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Disabled</span>
    )},
    { key: "actions", label: "Actions", sortable: false, render: (_, r) => (
      <button onClick={() => setRestoreModal(r)} className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1">
        <RotateCcw size={12} /> Restore
      </button>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Student Block & Restore"
        subtitle="Block a student from LMS or restore a previously blocked student."
        icon="UserX"
        breadcrumb={["Focal Person", "Student Block"]}
        actions={
          <button onClick={() => setOpen(true)} className="btn-primary inline-flex items-center gap-2 text-sm">
            <UserX size={15} /> Block a Student
          </button>
        }
      />

      <div className="mb-4 p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-900 dark:text-rose-200 text-sm">Block & Restore Policy</p>
            <ul className="text-xs text-rose-800 dark:text-rose-300 mt-1 space-y-0.5">
              <li>· On <b>Block</b>: Student loses LMS login access immediately. Records remain stored permanently.</li>
              <li>· On <b>Restore</b>: LMS access is re-enabled and the student can sign in again.</li>
              <li>· All block/restore actions are written to the audit trail.</li>
              <li>· If reason is "Other", a custom reason field becomes mandatory.</li>
            </ul>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState title="Couldn't load blocked students" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="card-base p-4 mb-4 flex justify-end">
            <ExportButtons title="Blocked Students" columns={columns.filter((c) => c.key !== "actions")} rows={rows} filename="blocked_students" />
          </div>
          {rows.length === 0 ? (
            <EmptyState icon="UserCheck" title="No blocked students" description="All students currently have active LMS access." />
          ) : (
            <EnterpriseTable columns={columns} rows={rows} />
          )}
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Block a Student" icon={UserX} maxWidth="max-w-xl">
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Search Student</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input type="text" value={studentSearch} onChange={(e) => searchStudents(e.target.value)} placeholder="Type name or roll number…" className="input-base pl-9 py-2.5 text-sm" />
              {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary-600" />}
            </div>
            {matches.length > 0 && !form.student && (
              <div className="mt-2 max-h-44 overflow-y-auto border border-app rounded-xl divide-y divide-app">
                {matches.map((m) => (
                  <button key={m.id} onClick={() => { setForm((f) => ({ ...f, student: m })); setStudentSearch(m.name); setMatches([]); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm">
                    <span className="font-bold text-app">{m.name}</span>
                    <span className="text-xs text-muted-app font-mono ml-2">{m.roll}</span>
                  </button>
                ))}
              </div>
            )}
            {form.student && (
              <div className="mt-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-sm">
                <b className="text-app">{form.student.name}</b>
                <span className="text-xs text-muted-app ml-2 font-mono">{form.student.roll}</span>
                <span className="text-xs text-muted-app ml-2">· {form.student.program}</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Reason</label>
            <select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="input-base py-2.5 text-sm w-full">
              {BLOCK_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {form.reason === "Other" && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Custom Reason <span className="text-rose-500">*</span></label>
              <textarea value={form.customReason} onChange={(e) => setForm((f) => ({ ...f, customReason: e.target.value }))} placeholder="Specify the reason…" rows={3} className="input-base py-2 text-sm w-full" />
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Remarks (optional)</label>
            <textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} placeholder="Additional remarks shown to the student in their block notification…" rows={2} className="input-base py-2 text-sm w-full" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl border border-app text-sm font-bold text-app">Cancel</button>
            <button disabled={saving} onClick={submitBlock} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />} Block Student
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!restoreModal} onClose={() => setRestoreModal(null)} title="Restore Student LMS Access" subtitle={restoreModal ? `${restoreModal.name} · ${restoreModal.roll}` : ""} icon={UserCheck} maxWidth="max-w-lg">
        {restoreModal && (
          <div className="px-6 py-5 space-y-4">
            <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-800 dark:text-emerald-300">
              Restoring will <b>re-enable LMS login</b> for this student.
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Restore Note (optional)</label>
              <textarea value={restoreNote} onChange={(e) => setRestoreNote(e.target.value)} placeholder="Reason for restoration / approval reference…" rows={3} className="input-base py-2 text-sm w-full" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setRestoreModal(null)} className="px-4 py-2 rounded-xl border border-app text-sm font-bold text-app">Cancel</button>
              <button disabled={saving} onClick={submitRestore} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />} Restore Access
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default StudentDrop;

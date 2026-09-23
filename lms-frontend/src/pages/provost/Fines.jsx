import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import StatusBadge from "../../components/common/StatusBadge";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";
import DeptSmartFilter, { ALL_DEPTS, filterByDept, collectDepartments } from "../../components/common/DeptSmartFilter";

const EMPTY_FORM = { roll: "", title: "", reason: "", amount: "", deadline: "" };

const ProvostFines = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.provost.fines(), []);
  const items = data?.items || [];
  const stats = data?.stats || {};

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Real-time department smart filter (client-side, instant — no reload).
  const [dept, setDept] = useState(ALL_DEPTS);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(null);

  // Department options come from the backend-provided list, falling back
  // to whatever departments appear on the loaded rows.
  const departments = useMemo(
    () => collectDepartments({ options: data?.departments || [], rows: items }),
    [data, items],
  );

  const filtered = useMemo(() => {
    const byDept = filterByDept(items, dept);
    return byDept.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!String(f.student).toLowerCase().includes(q) && !String(f.roll).toLowerCase().includes(q) && !String(f.title).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, dept]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const issue = async () => {
    if (!form.roll || !form.title || !form.amount) { toast("Roll #, title and amount are required", { type: "error" }); return; }
    setSaving(true);
    try {
      await api.provost.createFine({
        roll: form.roll.trim(),
        title: form.title.trim(),
        reason: form.reason,
        amount: Number(form.amount),
        deadline: form.deadline || undefined,
      });
      toast("Fine issued — student notified", { type: "success" });
      setShowAdd(false);
      setForm(EMPTY_FORM);
      reload();
    } catch (e) {
      toast(e.message || "Failed to issue fine", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (f) => {
    setUpdating(f.rawId);
    try {
      await api.provost.updateFine(f.rawId, { action: "paid" });
      toast(`Fine ${f.id} marked as paid`, { type: "success" });
      reload();
    } catch (e) {
      toast(e.message || "Failed to update fine", { type: "error" });
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Fines Management"
        subtitle="Department-wise fines tracking — disciplinary penalties, late fees and dues"
        icon="AlertCircle"
        breadcrumb={["Provost", "Fines"]}
        actions={
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
            <Plus size={14} /> New Fine
          </button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatCard title="Total Fines" value={stats.total ?? 0} icon="AlertCircle" color="rose" delay={0.05} />
            <StatCard title="Total Amount" value={`Rs. ${Number(stats.totalAmount ?? 0).toLocaleString()}`} icon="DollarSign" color="amber" delay={0.1} />
            <StatCard title="Pending" value={`Rs. ${Number(stats.pendingAmount ?? 0).toLocaleString()}`} icon="Clock" color="orange" delay={0.15} />
            <StatCard title="Collected" value={`Rs. ${Number(stats.collected ?? 0).toLocaleString()}`} icon="CheckCircle2" color="emerald" delay={0.2} />
          </div>

          <div className="card-base p-3 mb-5 flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by student name, roll, or title..." className="input-base w-full pl-10 text-sm" />
            </div>
            <DeptSmartFilter value={dept} onChange={setDept} departments={departments} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-base text-sm md:w-44">
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
              <option value="Waived">Waived</option>
            </select>
          </div>

          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-app">
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Fine ID</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Student</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Department</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Title</th>
                    <th className="text-right p-3 text-xs font-bold text-app uppercase">Amount</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Issued</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Deadline</th>
                    <th className="text-center p-3 text-xs font-bold text-app uppercase">Status</th>
                    <th className="text-center p-3 text-xs font-bold text-app uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="p-6 text-center text-sm text-muted-app">No fines found.</td></tr>
                  ) : filtered.map((f, i) => (
                    <motion.tr key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="border-b border-app hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3 font-mono text-xs font-bold text-primary-600 dark:text-primary-400">{f.id}</td>
                      <td className="p-3">
                        <p className="font-semibold text-app">{f.student}</p>
                        <p className="text-[11px] text-muted-app font-mono">{f.roll}</p>
                      </td>
                      <td className="p-3">
                        {f.department
                          ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60 font-semibold">{f.department}</span>
                          : <span className="text-muted-app opacity-40">—</span>}
                      </td>
                      <td className="p-3">
                        <p className="font-semibold text-app">{f.title}</p>
                        <p className="text-[11px] text-muted-app line-clamp-1">{f.reason}</p>
                      </td>
                      <td className="p-3 text-right font-bold text-app">Rs. {Number(f.amount || 0).toLocaleString()}</td>
                      <td className="p-3 text-xs text-muted-app">{f.issuedOn}</td>
                      <td className="p-3 text-xs text-muted-app">{f.deadline}</td>
                      <td className="p-3 text-center"><StatusBadge status={f.status} /></td>
                      <td className="p-3 text-center">
                        {f.status === "Pending" && (
                          <button disabled={updating === f.rawId} onClick={() => markPaid(f)} className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold hover:bg-emerald-200 dark:hover:bg-emerald-900/40 disabled:opacity-50 transition-colors">Mark Paid</button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Issue New Fine" icon="AlertCircle" maxWidth="max-w-xl">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Student Roll #</label>
            <input value={form.roll} onChange={(e) => setField("roll", e.target.value)} className="input-base w-full text-sm" placeholder="e.g. ADCS-23-101" />
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Fine Title</label>
            <input value={form.title} onChange={(e) => setField("title", e.target.value)} className="input-base w-full text-sm" placeholder="e.g. Plagiarism Penalty" />
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Reason</label>
            <textarea rows="3" value={form.reason} onChange={(e) => setField("reason", e.target.value)} className="input-base w-full text-sm" placeholder="Detailed reason..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Amount (Rs.)</label>
              <input type="number" value={form.amount} onChange={(e) => setField("amount", e.target.value)} className="input-base w-full text-sm" placeholder="5000" />
            </div>
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Deadline</label>
              <input type="date" value={form.deadline} onChange={(e) => setField("deadline", e.target.value)} className="input-base w-full text-sm" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1">Cancel</button>
            <button disabled={saving} onClick={issue} className="btn-primary flex-1 disabled:opacity-50">{saving ? "Issuing..." : "Issue Fine"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProvostFines;

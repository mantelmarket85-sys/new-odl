import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, CheckCircle2, XCircle, Eye } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import StatusBadge from "../../components/common/StatusBadge";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

const ProvostFeeApprovals = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.provost.feeApprovals(), []);
  const items = data?.items || [];
  const stats = data?.stats || {};

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const types = useMemo(() => ["all", ...Array.from(new Set(items.map((a) => a.type)))], [items]);

  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!String(a.student).toLowerCase().includes(q) && !String(a.roll).toLowerCase().includes(q) && !String(a.id).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, typeFilter]);

  const handleAction = async (action) => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.provost.decideFee(detail.rawId, { action: action === "Approved" ? "approve" : "reject" });
      toast(`Payment ${action.toLowerCase()}`, { type: action === "Approved" ? "success" : "error" });
      setDetail(null);
      reload();
    } catch (e) {
      toast(e.message || "Action failed", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Fee Approvals"
        subtitle="Review and approve student fee payment submissions"
        icon="BadgeCheck"
        breadcrumb={["Provost", "Fee Approvals"]}
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
            <StatCard title="Pending Review" value={stats.pending ?? 0} icon="Filter" color="amber" delay={0.05} />
            <StatCard title="Approved" value={stats.approved ?? 0} icon="CheckCircle2" color="emerald" delay={0.1} />
            <StatCard title="Rejected" value={stats.rejected ?? 0} icon="XCircle" color="rose" delay={0.15} />
            <StatCard title="Approved Total" value={`Rs. ${(Number(stats.totalAmount ?? 0) / 1000).toFixed(1)}K`} icon="DollarSign" color="blue" delay={0.2} />
          </div>

          <div className="card-base p-3 mb-5 flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID, name, or roll..." className="input-base w-full pl-10 text-sm" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-base text-sm md:w-40">
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-base text-sm md:w-44">
              {types.map((t) => <option key={t} value={t}>{t === "all" ? "All Types" : t}</option>)}
            </select>
          </div>

          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-app">
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Ref ID</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Student</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Type</th>
                    <th className="text-right p-3 text-xs font-bold text-app uppercase">Amount</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Method</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Date</th>
                    <th className="text-center p-3 text-xs font-bold text-app uppercase">Status</th>
                    <th className="text-center p-3 text-xs font-bold text-app uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="p-6 text-center text-sm text-muted-app">No fee submissions found.</td></tr>
                  ) : filtered.map((a, i) => (
                    <motion.tr key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="border-b border-app hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3 font-mono text-xs font-bold text-primary-600 dark:text-primary-400">{a.id}</td>
                      <td className="p-3">
                        <p className="font-semibold text-app">{a.student}</p>
                        <p className="text-[11px] text-muted-app font-mono">{a.roll}</p>
                      </td>
                      <td className="p-3 text-xs text-app">{a.type}</td>
                      <td className="p-3 text-right font-bold text-app">Rs. {Number(a.amount || 0).toLocaleString()}</td>
                      <td className="p-3 text-xs text-muted-app">{a.method}</td>
                      <td className="p-3 text-xs text-muted-app">{a.date}</td>
                      <td className="p-3 text-center"><StatusBadge status={a.status} /></td>
                      <td className="p-3 text-center">
                        <button onClick={() => setDetail(a)} className="px-2.5 py-1 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 text-[11px] font-semibold hover:bg-primary-100 dark:hover:bg-primary-900/40 inline-flex items-center gap-1">
                          <Eye size={11} /> Review
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Review Payment — ${detail?.id}`} icon="BadgeCheck" maxWidth="max-w-xl">
        {detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Student</p>
                <p className="font-semibold text-app">{detail.student}</p>
                <p className="text-[11px] text-muted-app font-mono">{detail.roll}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Amount</p>
                <p className="font-bold text-app text-lg">Rs. {Number(detail.amount || 0).toLocaleString()}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Type</p>
                <p className="font-semibold text-app">{detail.type}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Method</p>
                <p className="font-semibold text-app">{detail.method}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Batch / Semester</p>
                <p className="font-semibold text-app">{detail.batch} / Sem {detail.semester}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Date</p>
                <p className="font-semibold text-app">{detail.date}</p>
              </div>
            </div>

            {detail.reason && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Rejection Reason</p>
                <p className="text-sm text-app mt-1">{detail.reason}</p>
              </div>
            )}

            {detail.status === "Pending" && (
              <div className="flex gap-2 pt-2">
                <button disabled={busy} onClick={() => handleAction("Rejected")} className="flex-1 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                  <XCircle size={14} className="inline mr-1.5" /> Reject
                </button>
                <button disabled={busy} onClick={() => handleAction("Approved")} className="flex-1 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                  <CheckCircle2 size={14} className="inline mr-1.5" /> Approve
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProvostFeeApprovals;

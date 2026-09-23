import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { DollarSign, Search, RefreshCw, CheckCircle2, AlertCircle, Download } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";

/* =========================================================================
 * Focal Person → Fine Management (Requirement #2)
 * Live view of imposed fines joined to the student's Account-Book challan.
 * Shows real-time PAID / UNPAID status updated the moment a student pays.
 * Real data only — every row is a real disciplinary fine.
 * ======================================================================= */

const money = (n) => `Rs ${(Number(n) || 0).toLocaleString()}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

const FineManagement = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.focal.fines(), []);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fines = useMemo(() => data?.fines || [], [data]);
  const summary = data?.summary || {};

  const filtered = useMemo(() => fines.filter((f) => {
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(`${f.title} ${f.student} ${f.fineDescription} ${f.challanNo}`).toLowerCase().includes(q)) return false;
    }
    return true;
  }), [fines, search, statusFilter]);

  const exportCSV = () => {
    if (!filtered.length) { toast?.("Nothing to export", { type: "warning" }); return; }
    const cols = ["student", "title", "fineDescription", "fineAmount", "issueDate", "dueDate", "status", "challanNo", "paidAt"];
    const csv = [cols, ...filtered.map((r) => cols.map((c) => r[c]))]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fine_management.csv";
    a.click();
    toast?.("Fine report exported", { type: "success" });
  };

  const refresh = () => { reload(); toast?.("Refreshed payment status", { type: "success" }); };

  return (
    <div>
      <PageHeader
        title="Fine Management"
        subtitle="Track imposed fines and their live Account-Book payment status — updated in real time as students pay."
        icon="DollarSign"
        breadcrumb={["Focal Person", "Fine Management"]}
        actions={
          <div className="flex gap-2">
            <button onClick={refresh} className="btn-secondary text-sm py-2 px-3 flex items-center gap-2"><RefreshCw size={14} /> Refresh</button>
            <button onClick={exportCSV} className="btn-secondary text-sm py-2 px-3 flex items-center gap-2"><Download size={14} /> Export CSV</button>
          </div>
        }
      />

      {error ? (
        <ErrorState title="Couldn't load fines" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatCard title="Total Fines" value={summary.count ?? 0} icon="DollarSign" color="violet" delay={0.05} />
            <StatCard title="Total Amount" value={money(summary.total)} icon="Layers" color="blue" delay={0.1} />
            <StatCard title="Collected (Paid)" value={money(summary.paid)} icon="CheckCircle2" color="emerald" delay={0.15} />
            <StatCard title="Outstanding" value={money(summary.outstanding)} icon="AlertCircle" color="amber" delay={0.2} />
          </div>

          <div className="card-base p-3 mb-5 flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by student, fine title, challan no…" className="input-base w-full pl-10 text-sm" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-base text-sm md:w-44">
              <option value="all">All Status</option>
              <option value="UNPAID">Unpaid ({summary.unpaidCount ?? 0})</option>
              <option value="PAID">Paid ({summary.paidCount ?? 0})</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="DollarSign" title="No fines found" description="No fines match the current filters. Impose a fine from the Discipline & Fines module — it will appear here and in the student's Account Book instantly." />
          ) : (
            <div className="card-base overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[820px]">
                  <thead className="surface border-b border-app">
                    <tr>
                      {["Student", "Fine Title", "Description", "Amount", "Issue Date", "Due Date", "Challan #", "Status"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {filtered.map((f, i) => (
                      <motion.tr key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.3) }} className="hover:surface transition-colors">
                        <td className="px-3 py-2.5 font-bold text-app text-xs">{f.student}</td>
                        <td className="px-3 py-2.5 text-app text-xs font-semibold">{f.title}</td>
                        <td className="px-3 py-2.5 text-muted-app text-xs">{f.fineDescription || "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-app text-xs">{money(f.fineAmount)}</td>
                        <td className="px-3 py-2.5 text-muted-app text-xs">{fmtDate(f.issueDate)}</td>
                        <td className="px-3 py-2.5 text-muted-app text-xs">{fmtDate(f.dueDate)}</td>
                        <td className="px-3 py-2.5 font-mono text-muted-app text-[11px]">{f.challanNo || "—"}</td>
                        <td className="px-3 py-2.5">
                          {f.status === "PAID" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              <CheckCircle2 size={11} /> Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                              <AlertCircle size={11} /> Unpaid
                            </span>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
            <AlertCircle size={12} className="inline mr-1" />
            Fines imposed in <b>Discipline &amp; Fines</b> appear automatically in the student's <b>Account Book</b>. When the student pays there, the status here updates to <b>Paid</b> in real time.
          </div>
        </>
      )}
    </div>
  );
};

export default FineManagement;

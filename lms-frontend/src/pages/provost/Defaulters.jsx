import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Mail } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

const ProvostDefaulters = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.provost.defaulters(), []);
  const defaulters = data?.items || [];
  const stats = data?.stats || {};

  const [search, setSearch] = useState("");
  const [semFilter, setSemFilter] = useState("all");
  const [notifying, setNotifying] = useState(null);

  const semesters = useMemo(() => ["all", ...Array.from(new Set(defaulters.map((d) => d.semester)))], [defaulters]);

  const filtered = useMemo(() => {
    return defaulters.filter((d) => {
      if (semFilter !== "all" && d.semester !== semFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!String(d.student).toLowerCase().includes(q) && !String(d.roll).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [defaulters, search, semFilter]);

  const handleNotify = async (d) => {
    setNotifying(d.rawId);
    try {
      await api.provost.notifyDefaulter(d.rawId);
      toast(`Reminder sent to ${d.student}`, { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to send reminder", { type: "error" });
    } finally {
      setNotifying(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Defaulters"
        subtitle="Students with overdue fee payments — track and follow up"
        icon="UserMinus"
        breadcrumb={["Provost", "Defaulters"]}
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
            <StatCard title="Total Defaulters" value={stats.total ?? 0} icon="UserMinus" color="rose" delay={0.05} />
            <StatCard title="Total Due" value={`Rs. ${Number(stats.totalDue ?? 0).toLocaleString()}`} icon="DollarSign" color="amber" delay={0.1} />
            <StatCard title="Critical (>30 days)" value={stats.critical ?? 0} icon="AlertTriangle" color="orange" delay={0.15} />
            <StatCard title="Recent (<7 days)" value={stats.recent ?? 0} icon="Calendar" color="blue" delay={0.2} />
          </div>

          <div className="card-base p-3 mb-5 flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or roll..." className="input-base w-full pl-10 text-sm" />
            </div>
            <select value={semFilter} onChange={(e) => setSemFilter(e.target.value)} className="input-base text-sm md:w-40">
              {semesters.map((s) => <option key={s} value={s}>{s === "all" ? "All Semesters" : `Sem ${s}`}</option>)}
            </select>
          </div>

          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-app">
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Student</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Roll #</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Batch / Sem</th>
                    <th className="text-left p-3 text-xs font-bold text-app uppercase">Fee Type</th>
                    <th className="text-right p-3 text-xs font-bold text-app uppercase">Amount</th>
                    <th className="text-center p-3 text-xs font-bold text-app uppercase">Days Overdue</th>
                    <th className="text-center p-3 text-xs font-bold text-app uppercase">Attempts</th>
                    <th className="text-center p-3 text-xs font-bold text-app uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="p-6 text-center text-sm text-muted-app">No defaulters found.</td></tr>
                  ) : filtered.map((d, i) => (
                    <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="border-b border-app hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3 font-semibold text-app">{d.student}</td>
                      <td className="p-3 font-mono text-xs text-muted-app">{d.roll}</td>
                      <td className="p-3 text-xs text-app">{d.batch} / Sem {d.semester}</td>
                      <td className="p-3 text-xs text-app">{d.type}</td>
                      <td className="p-3 text-right font-bold text-app">Rs. {Number(d.amount || 0).toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${d.daysOverdue > 30 ? "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300" : d.daysOverdue > 14 ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" : "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"}`}>
                          {d.daysOverdue}d
                        </span>
                      </td>
                      <td className="p-3 text-center text-xs text-muted-app">{d.attempts}</td>
                      <td className="p-3 text-center">
                        <button disabled={notifying === d.rawId} onClick={() => handleNotify(d)} className="px-2.5 py-1 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 text-[11px] font-semibold hover:bg-primary-100 dark:hover:bg-primary-900/40 disabled:opacity-50 transition-colors inline-flex items-center gap-1">
                          <Mail size={11} /> Notify
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
    </div>
  );
};

export default ProvostDefaulters;

import { useMemo, useState } from "react";
import { Send, AlertTriangle } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import FilterPanel, { buildLmsFilters } from "../../components/enterprise/FilterPanel";
import ExportButtons from "../../components/enterprise/ExportButtons";
import { feeRecords } from "../../data/enterpriseData";
import { useToast } from "../../context/ToastContext";

const fmt = (n) => `Rs. ${n.toLocaleString()}`;

const Defaulters = () => {
  const [filters, setFilters] = useState({ semester: "all", course: "all", section: "all", session: "all", program: "all" });
  const onFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const reset = () => setFilters({ semester: "all", course: "all", section: "all", session: "all", program: "all" });
  const { toast } = useToast();

  /* Overdue + Pending */
  const rows = useMemo(() => feeRecords.filter((r) => {
    if (r.status !== "Overdue" && r.status !== "Pending") return false;
    if (filters.semester !== "all" && String(r.semester) !== filters.semester) return false;
    if (filters.program  !== "all" && r.program !== filters.program)            return false;
    return true;
  }), [filters]);

  const totalOutstanding = rows.reduce((s, r) => s + (r.amount - r.paid), 0);

  const sendReminder = (id) => toast?.(`Reminder sent for ${id}`, { type: "success", title: "Notice Sent" });
  const sendBulk = () => toast?.(`Reminder sent to ${rows.length} defaulters`, { type: "success", title: "Bulk Notice" });

  const columns = [
    { key: "id",       label: "Fee ID", render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: "student",  label: "Student", render: (v, r) => <div><p className="font-bold text-sm">{v}</p><p className="text-[10px] text-muted-app font-mono">{r.rollNo}</p></div> },
    { key: "program",  label: "Program" },
    { key: "semester", label: "Sem", render: (v) => `Sem ${v}` },
    { key: "amount",   label: "Due", render: fmt },
    { key: "dueDate",  label: "Due Date" },
    { key: "status",   label: "Status", render: (v) => (
      <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{v}</span>
    )},
    { key: "actions",  label: "Action", sortable: false, render: (_, r) => (
      <button onClick={() => sendReminder(r.id)} className="px-2.5 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1 hover:bg-amber-200">
        <Send size={12} /> Notice
      </button>
    )},
  ];

  return (
    <div>
      <PageHeader title="Defaulters" subtitle="Students with overdue or unpaid fees" icon="AlertTriangle" breadcrumb={["Finance", "Defaulters"]}
        actions={
          <div className="flex gap-2">
            <ExportButtons title="Fee Defaulters" columns={columns.filter((c) => c.key !== "actions")} rows={rows} filename="defaulters" />
            <button onClick={sendBulk} className="btn-primary text-sm inline-flex items-center gap-1.5">
              <Send size={14} /> Send Bulk Reminder
            </button>
          </div>
        } />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard title="Defaulters"      value={rows.length}    icon="AlertTriangle" color="rose" />
        <StatCard title="Outstanding"     value={fmt(totalOutstanding)} icon="Wallet"  color="amber"  delay={0.05} />
        <StatCard title="Avg. Days Late"  value="18 days"        icon="Clock"         color="indigo" delay={0.1} />
      </div>

      <FilterPanel filters={buildLmsFilters(filters)} onChange={onFilter} onReset={reset} />

      <EnterpriseTable columns={columns} rows={rows} pageSize={10} />
    </div>
  );
};

export default Defaulters;

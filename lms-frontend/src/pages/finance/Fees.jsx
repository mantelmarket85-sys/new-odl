import { useMemo, useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import FilterPanel, { buildLmsFilters } from "../../components/enterprise/FilterPanel";
import ExportButtons from "../../components/enterprise/ExportButtons";
import { feeRecords } from "../../data/enterpriseData";

const STATUS_CLS = {
  Paid:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  Pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Partial: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  Overdue: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
};

const fmt = (n) => `Rs. ${n.toLocaleString()}`;

const Fees = () => {
  const [filters, setFilters] = useState({ semester: "all", course: "all", section: "all", session: "all", program: "all", status: "all" });
  const onFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const reset = () => setFilters({ semester: "all", course: "all", section: "all", session: "all", program: "all", status: "all" });

  const rows = useMemo(() => feeRecords.filter((r) => {
    if (filters.semester !== "all" && String(r.semester) !== filters.semester) return false;
    if (filters.program  !== "all" && r.program !== filters.program)            return false;
    if (filters.status   !== "all" && r.status !== filters.status)              return false;
    return true;
  }), [filters]);

  const columns = [
    { key: "id",       label: "Fee ID", render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: "student",  label: "Student", render: (v, r) => (
      <div>
        <p className="font-bold text-app text-sm">{v}</p>
        <p className="text-[10px] text-muted-app font-mono">{r.rollNo}</p>
      </div>
    )},
    { key: "program",  label: "Program" },
    { key: "semester", label: "Sem", render: (v) => `Sem ${v}` },
    { key: "amount",   label: "Amount", render: fmt },
    { key: "paid",     label: "Paid",   render: fmt },
    { key: "method",   label: "Method", render: (v) => <span className="text-xs">{v}</span> },
    { key: "dueDate",  label: "Due Date" },
    { key: "status",   label: "Status", render: (v) => (
      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${STATUS_CLS[v] || "bg-slate-100 dark:bg-slate-800"}`}>{v}</span>
    )},
  ];

  return (
    <div>
      <PageHeader title="Fee Records" subtitle="Complete fee ledger across all students" icon="Receipt" breadcrumb={["Finance", "Fees"]} />
      <FilterPanel
        filters={[
          ...buildLmsFilters(filters),
          { key: "status", label: "Status", value: filters.status, options: [
            { value: "all", label: "All Status" },
            { value: "Paid", label: "Paid" },
            { value: "Pending", label: "Pending" },
            { value: "Partial", label: "Partial" },
            { value: "Overdue", label: "Overdue" },
          ]},
        ]}
        onChange={onFilter} onReset={reset}
        extra={<ExportButtons title="Fee Records" columns={columns} rows={rows} filename="fee_records" />}
      />
      <EnterpriseTable columns={columns} rows={rows} pageSize={10} />
    </div>
  );
};

export default Fees;

import { useMemo, useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import FilterPanel, { buildLmsFilters } from "../../components/enterprise/FilterPanel";
import ExportButtons from "../../components/enterprise/ExportButtons";
import { feeRecords } from "../../data/enterpriseData";

const fmt = (n) => `Rs. ${n.toLocaleString()}`;

const Payments = () => {
  const [filters, setFilters] = useState({ semester: "all", course: "all", section: "all", session: "all", program: "all", method: "all" });
  const onFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const reset = () => setFilters({ semester: "all", course: "all", section: "all", session: "all", program: "all", method: "all" });

  /* Only Paid + Partial */
  const rows = useMemo(() => feeRecords.filter((r) => {
    if (r.paid === 0) return false;
    if (filters.method !== "all" && r.method !== filters.method) return false;
    if (filters.semester !== "all" && String(r.semester) !== filters.semester) return false;
    if (filters.program  !== "all" && r.program !== filters.program)            return false;
    return true;
  }), [filters]);

  const columns = [
    { key: "id",       label: "Receipt #", render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: "student",  label: "Student", render: (v, r) => <div><p className="font-bold text-sm">{v}</p><p className="text-[10px] text-muted-app font-mono">{r.rollNo}</p></div> },
    { key: "amount",   label: "Total",    render: fmt },
    { key: "paid",     label: "Paid",     render: fmt },
    { key: "method",   label: "Method" },
    { key: "dueDate",  label: "Date" },
    { key: "status",   label: "Status" },
  ];

  return (
    <div>
      <PageHeader title="Payments Log" subtitle="All confirmed payments and partial payments" icon="Receipt" breadcrumb={["Finance", "Payments"]} />
      <FilterPanel
        filters={[
          ...buildLmsFilters(filters),
          { key: "method", label: "Method", value: filters.method, options: [
            { value: "all", label: "All Methods" },
            { value: "Bank Transfer", label: "Bank Transfer" },
            { value: "Easypaisa", label: "Easypaisa" },
            { value: "Online", label: "Online" },
            { value: "Cash", label: "Cash" },
          ]},
        ]}
        onChange={onFilter} onReset={reset}
        extra={<ExportButtons title="Payments Log" columns={columns} rows={rows} filename="payments_log" />}
      />
      <EnterpriseTable columns={columns} rows={rows} pageSize={10} />
    </div>
  );
};

export default Payments;

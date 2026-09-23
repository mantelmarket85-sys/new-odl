import { useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import ExportButtons from "../../components/enterprise/ExportButtons";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import { feeRecords, feeApprovals, monthlyCollection } from "../../data/enterpriseData";

const REPORTS = [
  { id: "ledger",       label: "Full Fee Ledger" },
  { id: "paid",         label: "Paid Receipts" },
  { id: "pending",      label: "Pending Payments" },
  { id: "overdue",      label: "Overdue Accounts" },
  { id: "approvals",    label: "Approval Queue" },
  { id: "monthly",      label: "Monthly Collection Trend" },
  { id: "outstanding",  label: "Outstanding Balance" },
];

const FinanceReports = () => {
  const [active, setActive] = useState("ledger");

  let rows = [], cols = [], title = "";
  const ledgerCols = [
    { key: "id", label: "Fee ID" }, { key: "student", label: "Student" }, { key: "rollNo", label: "Roll #" },
    { key: "amount", label: "Amount" }, { key: "paid", label: "Paid" }, { key: "method", label: "Method" },
    { key: "dueDate", label: "Due" }, { key: "status", label: "Status" },
  ];

  if (active === "ledger")      { rows = feeRecords; cols = ledgerCols; title = "Full Fee Ledger"; }
  if (active === "paid")        { rows = feeRecords.filter((r) => r.status === "Paid"); cols = ledgerCols; title = "Paid Receipts"; }
  if (active === "pending")     { rows = feeRecords.filter((r) => r.status === "Pending"); cols = ledgerCols; title = "Pending Payments"; }
  if (active === "overdue")     { rows = feeRecords.filter((r) => r.status === "Overdue"); cols = ledgerCols; title = "Overdue Accounts"; }
  if (active === "approvals")   {
    rows = feeApprovals;
    cols = [
      { key: "id", label: "Fee ID" }, { key: "student", label: "Student" },
      { key: "amount", label: "Amount" }, { key: "method", label: "Method" },
      { key: "slipUploaded", label: "Slip Date" }, { key: "status", label: "Status" },
    ];
    title = "Approval Queue";
  }
  if (active === "monthly")     {
    rows = monthlyCollection;
    cols = [{ key: "month", label: "Month" }, { key: "collected", label: "Collected (Rs. M)" }];
    title = "Monthly Collection Trend";
  }
  if (active === "outstanding") {
    rows = feeRecords.filter((r) => r.amount > r.paid).map((r) => ({ ...r, outstanding: r.amount - r.paid }));
    cols = [
      { key: "id", label: "Fee ID" }, { key: "student", label: "Student" },
      { key: "rollNo", label: "Roll #" }, { key: "amount", label: "Total" },
      { key: "paid", label: "Paid" }, { key: "outstanding", label: "Outstanding" }, { key: "status", label: "Status" },
    ];
    title = "Outstanding Balance";
  }

  return (
    <div>
      <PageHeader title="Finance Reports" subtitle="Generate exportable financial reports - PDF & Excel with identical structure" icon="BarChart3" breadcrumb={["Finance", "Reports"]} />

      <div className="card-base p-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {REPORTS.map((r) => (
            <button key={r.id} onClick={() => setActive(r.id)} className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
              active === r.id ? "bg-emerald-600 text-white shadow"
                : "bg-slate-100 dark:bg-slate-900 text-app hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:bg-slate-800"
            }`}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="card-base p-4 mb-4 flex items-center justify-between">
        <h3 className="font-display font-bold text-lg text-app">{title}</h3>
        <ExportButtons title={title} columns={cols} rows={rows} filename={`finance_${active}`} />
      </div>

      <EnterpriseTable columns={cols} rows={rows} pageSize={10} />
    </div>
  );
};

export default FinanceReports;

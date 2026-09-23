import { useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import ExportButtons from "../../components/enterprise/ExportButtons";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const REPORTS = [
  { id: "departments", label: "Department Roster" },
  { id: "finance",     label: "Finance Summary" },
  { id: "fees",        label: "Fee Ledger" },
  { id: "qec",         label: "QEC Surveys" },
];

const COLS = {
  departments: [{ key: "name", label: "Department" }, { key: "chair", label: "Chair" }, { key: "students", label: "Students" }, { key: "faculty", label: "Faculty" }, { key: "programs", label: "Programs" }],
  finance: [{ key: "month", label: "Month" }, { key: "collected", label: "Collected (Rs. M)" }],
  fees: [
    { key: "id", label: "Fee ID" }, { key: "student", label: "Student" }, { key: "program", label: "Program" },
    { key: "amount", label: "Amount" }, { key: "paid", label: "Paid" }, { key: "status", label: "Status" },
  ],
  qec: [
    { key: "title", label: "Survey" }, { key: "teacher", label: "Teacher" },
    { key: "responses", label: "Responses" }, { key: "ratingAvg", label: "Rating" }, { key: "status", label: "Status" },
  ],
};

const TITLES = { departments: "Department Roster", finance: "Finance Summary", fees: "Fee Ledger", qec: "QEC Surveys" };

const ProvostReports = () => {
  const [active, setActive] = useState("departments");
  const { data, loading, error, reload } = useApi(() => api.provost.report(active), [active]);

  const cols = COLS[active];
  const title = TITLES[active];
  const rows = Array.isArray(data) ? data : (data?.items || []);

  return (
    <div>
      <PageHeader title="Provost Reports" subtitle="University-wide executive reports - PDF & Excel with identical structure" icon="BarChart3" breadcrumb={["Provost", "Reports"]} />

      <div className="card-base p-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {REPORTS.map((r) => (
            <button key={r.id} onClick={() => setActive(r.id)} className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
              active === r.id ? "bg-amber-600 text-white shadow"
                : "bg-slate-100 dark:bg-slate-900 text-app hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:bg-slate-800"
            }`}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="card-base p-4 mb-4 flex items-center justify-between">
        <h3 className="font-display font-bold text-lg text-app">{title}</h3>
        <ExportButtons title={title} columns={cols} rows={rows} filename={`provost_${active}`} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
      ) : (
        <EnterpriseTable columns={cols} rows={rows} pageSize={10} />
      )}
    </div>
  );
};

export default ProvostReports;

import { useMemo, useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import ExportButtons from "../../components/enterprise/ExportButtons";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";

const REPORTS = [
  { id: "gazette", label: "Result Gazette", columns: [
    { key: "student", label: "Student" }, { key: "course", label: "Course" },
    { key: "percent", label: "Percent" }, { key: "grade", label: "Grade" },
    { key: "gp", label: "GP" }, { key: "status", label: "Status" },
  ] },
  { id: "probation", label: "Probation List", columns: [
    { key: "roll", label: "Roll" }, { key: "name", label: "Name" },
    { key: "cgpa", label: "CGPA" }, { key: "totalCredits", label: "Credits" },
    { key: "status", label: "Status" },
  ] },
  { id: "incomplete", label: "Incomplete Results", columns: [
    { key: "student", label: "Student" }, { key: "course", label: "Course" },
    { key: "status", label: "Status" },
  ] },
  { id: "absentees", label: "Absentees", columns: [
    { key: "student", label: "Student" }, { key: "course", label: "Course" },
    { key: "component", label: "Component" }, { key: "status", label: "Status" },
  ] },
];

const ExamReports = () => {
  const [active, setActive] = useState("gazette");
  const report = useMemo(() => REPORTS.find((r) => r.id === active), [active]);

  const { data, loading, error, reload } = useApi(() => api.exam.report(active), [active]);
  const rows = useMemo(() => data?.rows || [], [data]);

  return (
    <div>
      <PageHeader title="Exam Reports" subtitle="Generate and export official examination reports — PDF & Excel." icon="BarChart3" breadcrumb={["Exam Controller", "Reports"]} />

      <div className="card-base p-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {REPORTS.map((r) => (
            <button key={r.id} onClick={() => setActive(r.id)} className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
              active === r.id ? "bg-rose-600 text-white shadow"
                : "bg-slate-100 dark:bg-slate-900 text-app hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}>{r.label}</button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="card-base p-4 mb-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-display font-bold text-lg text-app">{report.label}</h3>
              <p className="text-xs text-muted-app">{data?.term || "Current Term"} · {rows.length} records</p>
            </div>
            <ExportButtons title={report.label} columns={report.columns} rows={rows} filename={`exam_${report.id}`} />
          </div>

          <EnterpriseTable columns={report.columns} rows={rows} pageSize={10} />
        </>
      )}
    </div>
  );
};

export default ExamReports;

import { useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import ExportButtons from "../../components/enterprise/ExportButtons";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const REPORTS = [
  { id: "surveys",   label: "All Surveys" },
  { id: "feedback",  label: "Anonymous Feedback" },
  { id: "faculty",   label: "Faculty Ratings" },
  { id: "courses",   label: "Course Evaluation" },
  { id: "depts",     label: "Department Compliance" },
];

const COLS = {
  surveys: [
    { key: "title", label: "Survey" }, { key: "teacher", label: "Teacher" },
    { key: "course", label: "Course" }, { key: "responses", label: "Responses" },
    { key: "ratingAvg", label: "Avg. Rating" }, { key: "status", label: "Status" },
  ],
  feedback: [
    { key: "anonymous", label: "Student" }, { key: "rating", label: "Rating" }, { key: "text", label: "Comment" },
  ],
  faculty: [
    { key: "teacher", label: "Faculty" }, { key: "total", label: "Surveys" },
    { key: "responses", label: "Responses" }, { key: "avg", label: "Avg. Rating" },
  ],
  courses: [
    { key: "course", label: "Course" }, { key: "total", label: "Surveys" },
    { key: "responses", label: "Responses" }, { key: "avg", label: "Avg. Rating" },
  ],
  depts: [
    { key: "category", label: "Body" }, { key: "criterion", label: "Criterion" },
    { key: "status", label: "Status" }, { key: "score", label: "Score" },
  ],
};

const QECReports = () => {
  const [active, setActive] = useState("surveys");
  const { data, loading, error, reload } = useApi(() => api.qec.report(active), [active]);

  const cols = COLS[active];
  const title = REPORTS.find((r) => r.id === active)?.label || "";
  const rows = Array.isArray(data) ? data : (data?.items || []);

  return (
    <div>
      <PageHeader title="QEC Reports" subtitle="Generate exportable quality reports - PDF & Excel with identical structure" icon="BarChart3" breadcrumb={["QEC", "Reports"]} />

      <div className="card-base p-3 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {REPORTS.map((r) => (
            <button key={r.id} onClick={() => setActive(r.id)} className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
              active === r.id ? "bg-purple-600 text-white shadow"
                : "bg-slate-100 dark:bg-slate-900 text-app hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:bg-slate-800"
            }`}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="card-base p-4 mb-4 flex items-center justify-between">
        <h3 className="font-display font-bold text-lg text-app">{title}</h3>
        <ExportButtons title={title} columns={cols} rows={rows} filename={`qec_${active}`} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
        </div>
      ) : (
        <EnterpriseTable columns={cols} rows={rows} pageSize={10} />
      )}
    </div>
  );
};

export default QECReports;

import { useMemo, useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import ExportButtons from "../../components/enterprise/ExportButtons";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import DeptSmartFilter, { ALL_DEPTS, filterByDept, collectDepartments } from "../../components/common/DeptSmartFilter";

const cols = [
  { key: "course",     label: "Course Code", render: (v) => <span className="font-bold text-app">{v}</span> },
  { key: "department", label: "Department", render: (v) => (v ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">{v}</span> : <span className="text-xs text-muted-app">—</span>) },
  { key: "teacher",    label: "Instructor", render: (v) => <span className="text-xs">{v}</span> },
  { key: "surveys",    label: "Evaluations" },
  { key: "responses",  label: "Total Responses" },
  { key: "avg",        label: "Avg. Rating", render: (v) => <span className="font-bold text-amber-600">{v} ★</span> },
];

const CourseEvaluation = () => {
  const { data, loading, error, reload } = useApi(() => api.qec.courseEvaluation(), []);
  const allGrouped = data?.items || [];

  const [dept, setDept] = useState(ALL_DEPTS);
  const departments = useMemo(
    () => collectDepartments({ options: data?.departments || [], rows: allGrouped }),
    [data, allGrouped],
  );
  const grouped = useMemo(() => filterByDept(allGrouped, dept), [allGrouped, dept]);

  return (
    <div>
      <PageHeader title="Course Evaluation" subtitle="Course-level quality metrics — anonymous student feedback aggregated by department" icon="BookOpen" breadcrumb={["QEC", "Course Evaluation"]}
        actions={<ExportButtons title="Course Evaluation" columns={cols} rows={grouped} filename="course_evaluation" />} />

      <div className="card-base p-3 mb-4 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-app">Filter courses by department in real time.</p>
        <DeptSmartFilter value={dept} onChange={setDept} departments={departments} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <EnterpriseTable columns={cols} rows={grouped} pageSize={10} />
      )}
    </div>
  );
};

export default CourseEvaluation;

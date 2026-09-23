import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import ExportButtons from "../../components/enterprise/ExportButtons";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";

const cols = [
  { key: "name",     label: "Department", render: (v) => <span className="font-bold text-app">{v}</span> },
  { key: "chair",    label: "Chair" },
  { key: "students", label: "Students" },
  { key: "faculty",  label: "Faculty" },
  { key: "programs", label: "Programs" },
  { key: "rating",   label: "QEC Rating", render: (v) => <span className="font-bold text-amber-600">{v} ★</span> },
  { key: "compliance", label: "Compliance", render: (v) => <span className="font-bold text-emerald-600">{v}</span> },
];

const Departments = () => {
  const { data, loading, error, reload } = useApi(() => api.qec.departments(), []);
  const rows = data?.items || [];

  return (
    <div>
      <PageHeader title="Department Quality" subtitle="Per-department quality, ratings, and compliance scores" icon="Building2" breadcrumb={["QEC", "Departments"]}
        actions={<ExportButtons title="Department Quality" columns={cols} rows={rows} filename="qec_departments" />} />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-80" />
      ) : (
        <EnterpriseTable columns={cols} rows={rows} pageSize={10} />
      )}
    </div>
  );
};

export default Departments;

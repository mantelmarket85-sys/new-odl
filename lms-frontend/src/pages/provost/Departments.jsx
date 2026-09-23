import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import ExportButtons from "../../components/enterprise/ExportButtons";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const Departments = () => {
  const { data, loading, error, reload } = useApi(() => api.provost.departments(), []);
  const rows = data?.items || [];

  const cols = [
    { key: "name",     label: "Department", render: (v) => <span className="font-bold text-app">{v}</span> },
    { key: "chair",    label: "Chair" },
    { key: "students", label: "Students", render: (v) => <span className="font-bold">{Number(v).toLocaleString()}</span> },
    { key: "faculty",  label: "Faculty" },
    { key: "programs", label: "Programs" },
  ];

  return (
    <div>
      <PageHeader title="Departments" subtitle="University-wide department directory" icon="Building2" breadcrumb={["Provost", "Departments"]}
        actions={<ExportButtons title="Departments" columns={cols} rows={rows} filename="provost_departments" />} />
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

export default Departments;

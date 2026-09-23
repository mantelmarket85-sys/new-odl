import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import ExportButtons from "../../components/enterprise/ExportButtons";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const Faculty = () => {
  const { data, loading, error, reload } = useApi(() => api.provost.faculty(), []);
  const rows = data?.items || [];
  const totalFaculty = data?.stats?.totalFaculty ?? 0;
  const deptCount = data?.stats?.departments ?? 0;

  const cols = [
    { key: "name",         label: "Department" },
    { key: "chair",        label: "Chair", render: (v) => <span className="font-bold text-app text-sm">{v}</span> },
    { key: "faculty",      label: "Faculty" },
    { key: "students",     label: "Students" },
    { key: "facultyRatio", label: "Student : Faculty", render: (v) => <span className="font-bold">1 : {v}</span> },
  ];

  return (
    <div>
      <PageHeader title="Faculty Overview" subtitle={`Total ${totalFaculty} faculty members across ${deptCount} departments`} icon="UserCog" breadcrumb={["Provost", "Faculty"]}
        actions={<ExportButtons title="University Faculty" columns={cols} rows={rows} filename="university_faculty" />} />
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

export default Faculty;

import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import ExportButtons from "../../components/enterprise/ExportButtons";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const Programs = () => {
  const { data, loading, error, reload } = useApi(() => api.provost.programs(), []);
  const rows = data?.items || [];

  const cols = [
    { key: "code",     label: "Code", render: (v) => <span className="font-mono font-bold text-app">{v}</span> },
    { key: "name",     label: "Program" },
    { key: "dept",     label: "Department" },
    { key: "duration", label: "Duration" },
    { key: "credits",  label: "Credits" },
    { key: "students", label: "Students" },
    { key: "status",   label: "Status", render: (v) => <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{v}</span> },
  ];

  return (
    <div>
      <PageHeader title="Programs" subtitle="All active academic programs across the university" icon="GraduationCap" breadcrumb={["Provost", "Programs"]}
        actions={<ExportButtons title="Programs" columns={cols} rows={rows} filename="programs" />} />
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

export default Programs;

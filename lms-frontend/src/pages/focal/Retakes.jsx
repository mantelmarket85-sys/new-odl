import { useState, useMemo } from "react";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import FilterPanel, { buildLmsFilters } from "../../components/enterprise/FilterPanel";
import ExportButtons from "../../components/enterprise/ExportButtons";
import StatusBadge from "../../components/common/StatusBadge";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useIsFocalPerson, stripCrossDeptFilters } from "../../utils/focalDept";

const Retakes = () => {
  const { data, loading, error, reload } = useApi(() => api.focal.retakes(), []);
  const [filters, setFilters] = useState({ semester: "all", course: "all", program: "all", session: "all" });
  const isFocal = useIsFocalPerson(); // Req #3: hide cross-department filters for focal role
  const [tab, setTab] = useState("candidates");

  const retakes = data?.retakes || [];
  const candidates = data?.candidates || [];

  const rows = tab === "candidates" ? candidates : retakes;
  const filtered = useMemo(() => rows.filter((r) => {
    if (filters.course !== "all" && !(r.course || "").startsWith(filters.course)) return false;
    return true;
  }), [rows, filters]);

  const candidateColumns = [
    { key: "student", label: "Student", render: (v, r) => (
      <div><p className="font-bold text-app text-sm">{v}</p><p className="text-[10px] text-muted-app font-mono">{r.roll}</p></div>
    )},
    { key: "course", label: "Course", render: (v) => <span className="text-xs">{v}</span> },
    { key: "percent", label: "Score", render: (v) => <span className="font-mono">{v}%</span> },
    { key: "grade", label: "Grade", render: (v) => (
      <span className="font-mono font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{v}</span>
    )},
  ];

  const retakeColumns = [
    { key: "student", label: "Student", render: (v, r) => (
      <div><p className="font-bold text-app text-sm">{v}</p><p className="text-[10px] text-muted-app font-mono">{r.roll}</p></div>
    )},
    { key: "course", label: "Course", render: (v) => <span className="text-xs">{v}</span> },
    { key: "status", label: "Status", render: (v) => <StatusBadge status={v} /> },
  ];

  const columns = tab === "candidates" ? candidateColumns : retakeColumns;

  return (
    <div>
      <PageHeader title="Retake & Improvement Cases" subtitle="Failed-subject candidates eligible for retake, plus active retake registrations." icon="RotateCcw" breadcrumb={["Focal Person", "Retakes"]} />

      {error ? (
        <ErrorState title="Couldn't load retakes" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="grid sm:grid-cols-4 gap-3 mb-4">
            <StatCard title="Retake Candidates" value={candidates.length} icon="AlertCircle" color="rose" />
            <StatCard title="Active Retakes"    value={retakes.length}    icon="RotateCcw" color="amber" delay={0.05} />
            <StatCard title="Failed Subjects"   value={candidates.length} icon="XCircle" color="rose" delay={0.1} />
            <StatCard title="Total Cases"        value={candidates.length + retakes.length} icon="ClipboardList" color="cyan" delay={0.15} />
          </div>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab("candidates")} className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === "candidates" ? "bg-primary-600 text-white" : "card-base text-app"}`}>Retake Candidates ({candidates.length})</button>
            <button onClick={() => setTab("active")} className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === "active" ? "bg-primary-600 text-white" : "card-base text-app"}`}>Active Retakes ({retakes.length})</button>
          </div>

          <FilterPanel
            filters={stripCrossDeptFilters(buildLmsFilters(filters), isFocal)}
            onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
            onReset={() => setFilters({ semester: "all", course: "all", program: "all", session: "all" })}
            extra={<ExportButtons title="Retake Cases" columns={columns} rows={filtered} filename="retakes" />}
          />

          {filtered.length === 0 ? (
            <EmptyState icon="RotateCcw" title="No cases" description={tab === "candidates" ? "No failed-subject candidates." : "No active retake registrations."} />
          ) : (
            <EnterpriseTable columns={columns} rows={filtered} />
          )}
        </>
      )}
    </div>
  );
};

export default Retakes;

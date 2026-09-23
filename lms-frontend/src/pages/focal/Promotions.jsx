import { useState, useMemo } from "react";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import FilterPanel, { buildLmsFilters } from "../../components/enterprise/FilterPanel";
import ExportButtons from "../../components/enterprise/ExportButtons";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { CheckCircle2 } from "lucide-react";
import { useIsFocalPerson, stripCrossDeptFilters } from "../../utils/focalDept";

const Promotions = () => {
  const [filters, setFilters] = useState({ semester: "all", program: "all", session: "all" });
  const { data, loading, error, reload } = useApi(() => api.focal.promotions(), []);
  const isFocal = useIsFocalPerson(); // Req #3: hide cross-department filters for focal role

  const promotionList = data?.promotions || [];

  const filtered = useMemo(() => promotionList.filter((p) => {
    if (filters.session !== "all" && p.session !== filters.session) return false;
    return true;
  }), [promotionList, filters]);

  const eligible = promotionList.filter((p) => p.eligible).length;
  const withRetake = promotionList.filter((p) => (p.failing || 0) > 0).length;
  const avgGpa = promotionList.length
    ? (promotionList.reduce((s, p) => s + (p.gpa || 0), 0) / promotionList.length).toFixed(2)
    : "0.00";

  const columns = [
    { key: "name", label: "Student", render: (v, r) => (
      <div>
        <p className="font-bold text-app text-sm">{v}</p>
        <p className="text-[10px] text-muted-app font-mono">{r.roll}</p>
      </div>
    )},
    { key: "program", label: "Program" },
    { key: "session", label: "Session" },
    { key: "gpa",  label: "GPA", render: (v) => <span className="font-mono">{(v ?? 0).toFixed(2)}</span> },
    { key: "courses", label: "Courses", render: (v) => <span className="font-mono">{v}</span> },
    { key: "failing", label: "Failing", render: (v) => (
      <span className={`font-mono font-bold ${v > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{v}</span>
    )},
    { key: "status", label: "Status", render: (v) => (
      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
        v === "Eligible" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                         : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
      }`}>{v}</span>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Semester Promotions"
        subtitle="Students eligible for promotion to the next semester — those with failed subjects can be auto-enrolled with RETAKE label."
        icon="TrendingUp"
        breadcrumb={["Focal Person", "Promotions"]}
      />

      {error ? (
        <ErrorState title="Couldn't load promotions" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid sm:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-4 gap-3 mb-4">
            <StatCard title="Total Students" value={promotionList.length} icon="TrendingUp" color="emerald" />
            <StatCard title="Eligible"       value={eligible}             icon="CheckCircle2" color="blue" delay={0.05} />
            <StatCard title="With Failing"   value={withRetake}           icon="AlertTriangle" color="amber" delay={0.1} />
            <StatCard title="Avg GPA"        value={avgGpa}               icon="Award" color="cyan" delay={0.15} />
          </div>

          <FilterPanel
            filters={stripCrossDeptFilters(buildLmsFilters(filters), isFocal)}
            onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
            onReset={() => setFilters({ semester: "all", program: "all", session: "all" })}
            extra={<ExportButtons title="Semester Promotions" columns={columns} rows={filtered} filename="promotions" />}
          />

          <div className="card-base p-3 mb-4 bg-blue-50/60 dark:bg-blue-950/20 border-blue-200/70 dark:border-blue-900/60">
            <p className="text-sm text-blue-900 dark:text-blue-200 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600" />
              Eligible students can be <b>promoted</b> to their next semester's scheme courses.
              Students <b>with failed subjects</b> get those courses tagged <b>RETAKE</b>.
            </p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="TrendingUp" title="No promotions" description="No students are eligible for promotion this term." />
          ) : (
            <EnterpriseTable columns={columns} rows={filtered} pageSize={10} />
          )}
        </>
      )}
    </div>
  );
};

export default Promotions;

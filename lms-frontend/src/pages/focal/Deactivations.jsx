import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import StatCard from "../../components/common/StatCard";
import ExportButtons from "../../components/enterprise/ExportButtons";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useToast } from "../../context/ToastContext";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

const Deactivations = () => {
  const { data, loading, error, reload } = useApi(() => api.focal.deactivations(), []);
  const [busyId, setBusyId] = useState(null);
  const { toast } = useToast();

  const rows = data?.deactivated || [];

  const reactivate = async (id) => {
    setBusyId(id);
    try {
      await api.focal.setStudentActive(id, { isActive: true });
      toast?.("Account reactivated", { type: "success", title: "Updated" });
      reload();
    } catch (e) {
      toast?.(e.message || "Action failed", { type: "error", title: "Error" });
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    { key: "name", label: "Student", render: (v, r) => (
      <div><p className="font-bold text-app text-sm">{v}</p><p className="text-[10px] text-muted-app font-mono">{r.roll}</p></div>
    )},
    { key: "program", label: "Program" },
    { key: "deactivatedAt", label: "Deactivated", render: (v) => fmtDate(v) },
    { key: "actions", label: "Actions", sortable: false, render: (_, r) => (
      <button disabled={busyId === r.id} onClick={() => reactivate(r.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold disabled:opacity-50">
        <RotateCcw size={13} /> Reactivate
      </button>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Deactivated Accounts"
        subtitle="Student accounts that are currently deactivated — reactivate to restore access."
        icon="UserMinus"
        breadcrumb={["Focal Person", "Deactivations"]}
      />

      {error ? (
        <ErrorState title="Couldn't load accounts" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <StatCard title="Deactivated"      value={rows.length} icon="UserMinus" color="purple" />
            <StatCard title="Programs Affected" value={new Set(rows.map((r) => r.program)).size} icon="GraduationCap" color="amber" delay={0.05} />
            <StatCard title="Recent (30d)"     value={rows.filter((r) => r.deactivatedAt && (Date.now() - new Date(r.deactivatedAt)) < 30 * 864e5).length} icon="Clock" color="rose" delay={0.1} />
          </div>

          <div className="card-base p-3 mb-4 flex justify-end">
            <ExportButtons title="Deactivated Accounts" columns={columns.filter((c) => c.key !== "actions")} rows={rows} filename="deactivations" />
          </div>

          {rows.length === 0 ? (
            <EmptyState icon="UserCheck" title="No deactivated accounts" description="All student accounts are currently active." />
          ) : (
            <EnterpriseTable columns={columns} rows={rows} />
          )}
        </>
      )}
    </div>
  );
};

export default Deactivations;

import { useState, useMemo } from "react";
import { CheckCircle2, XCircle, LogOut, Loader2 } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import FilterPanel, { buildLmsFilters } from "../../components/enterprise/FilterPanel";
import ExportButtons from "../../components/enterprise/ExportButtons";
import StatusBadge from "../../components/common/StatusBadge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import { useFocalDepartment, useIsFocalPerson, stripCrossDeptFilters } from "../../utils/focalDept";

const TYPE_BADGES = {
  REGULAR:     "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  RETAKE:      "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  IMPROVEMENT: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

const FocalEnrollments = () => {
  const { data, loading, error, reload } = useApi(() => api.focal.enrollments(), []);
  const [filters, setFilters] = useState({ semester: "all", course: "all", section: "all", session: "all", program: "all", status: "all" });
  const [busyId, setBusyId] = useState(null);
  const { toast } = useToast();
  // Department isolation (Req #3): dynamic, session-based department — never hardcoded.
  const focalDept = useFocalDepartment();
  const isFocal = useIsFocalPerson();

  const rows = data?.enrollments || [];

  const onFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const resetFilters = () => setFilters({ semester: "all", course: "all", section: "all", session: "all", program: "all", status: "all" });

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filters.course  !== "all" && !(r.course || "").startsWith(filters.course)) return false;
      if (filters.session !== "all" && r.session !== filters.session) return false;
      if (filters.status  !== "all" && r.status !== filters.status) return false;
      return true;
    });
  }, [rows, filters]);

  const doAction = async (id, action, label) => {
    setBusyId(id);
    try {
      await api.focal.enrollmentAction(id, { action });
      toast?.(`Enrollment ${label}`, { type: "success", title: "Updated" });
      reload();
    } catch (e) {
      toast?.(e.message || "Action failed", { type: "error", title: "Error" });
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    { key: "id",      label: "Reg ID", render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: "student", label: "Student", render: (v, r) => (
      <div>
        <p className="font-bold text-app text-sm">{v}</p>
        <p className="text-[10px] text-muted-app font-mono">{r.roll}</p>
      </div>
    )},
    { key: "course",   label: "Course", render: (v) => <span className="text-xs">{v}</span> },
    { key: "section",  label: "Section" },
    { key: "type",     label: "Type", render: (v) => (
      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${TYPE_BADGES[v] || "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}>{v}</span>
    )},
    { key: "session",  label: "Session" },
    { key: "status",   label: "Status", render: (v) => <StatusBadge status={v} /> },
    { key: "actions",  label: "Actions", sortable: false, render: (_, r) => (
      <div className="flex items-center gap-1">
        {busyId === r.id ? (
          <Loader2 size={14} className="animate-spin text-primary-600" />
        ) : r.status === "ENROLLED" ? (
          <>
            <button onClick={() => doAction(r.id, "COMPLETE", "completed")} title="Mark Completed" className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-950/60">
              <CheckCircle2 size={14} />
            </button>
            <button onClick={() => doAction(r.id, "WITHDRAW", "withdrawn")} title="Withdraw" className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-950/60">
              <LogOut size={14} />
            </button>
            <button onClick={() => doAction(r.id, "DROP", "dropped")} title="Drop" className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-950/60">
              <XCircle size={14} />
            </button>
          </>
        ) : (
          <span className="text-[10px] text-muted-app">—</span>
        )}
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="Enrollment Management"
        subtitle="Confirm, withdraw, and drop enrollments — retake / improvement cases supported."
        icon="ClipboardCheck"
        breadcrumb={["Focal Person", "Enrollments"]}
      />

      {error ? (
        <ErrorState title="Couldn't load enrollments" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <FilterPanel
            filters={[
              ...stripCrossDeptFilters(buildLmsFilters(filters), isFocal),
              { key: "status", label: "Status", value: filters.status, options: [
                { value: "all", label: "All Status" },
                { value: "ENROLLED", label: "Enrolled" },
                { value: "WITHDRAWN", label: "Withdrawn" },
                { value: "DROPPED", label: "Dropped" },
                { value: "COMPLETED", label: "Completed" },
              ]},
            ]}
            onChange={onFilter}
            onReset={resetFilters}
            extra={<ExportButtons title="Enrollment Requests" columns={columns.filter((c) => c.key !== "actions")} rows={filtered} filename="enrollments" />}
          />

          <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-sm text-blue-800 dark:text-blue-200">
            <b>{focalDept || "Department"}:</b> No course prerequisite restrictions are enforced. Actions update the live registration status and notify the student.
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="ClipboardCheck" title="No enrollments" description="No registrations match the current filters." />
          ) : (
            <EnterpriseTable columns={columns} rows={filtered} pageSize={10} />
          )}
        </>
      )}
    </div>
  );
};

export default FocalEnrollments;

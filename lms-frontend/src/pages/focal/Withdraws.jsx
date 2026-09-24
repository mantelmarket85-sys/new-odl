import { useState, useMemo, useEffect } from "react";
import { RotateCcw, CalendarClock, Save, Loader2 } from "lucide-react";
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
import { useToast } from "../../context/ToastContext";
import { useIsFocalPerson, stripCrossDeptFilters } from "../../utils/focalDept";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const Withdraws = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.focal.withdraws(), []);
  const { data: deadlineData, reload: reloadDeadline } = useApi(() => api.focal.getWithdrawDeadline(), []);
  const [filters, setFilters] = useState({ semester: "all", course: "all", program: "all", session: "all" });
  const isFocal = useIsFocalPerson(); // Req #3: hide cross-department filters for focal role
  const [restoring, setRestoring] = useState(null);
  const [deadlineInput, setDeadlineInput] = useState("");
  const [savingDeadline, setSavingDeadline] = useState(false);

  useEffect(() => {
    setDeadlineInput(toLocalInput(deadlineData?.deadline));
  }, [deadlineData]);

  const saveDeadline = async () => {
    setSavingDeadline(true);
    try {
      const iso = deadlineInput ? new Date(deadlineInput).toISOString() : null;
      await api.focal.setWithdrawDeadline(iso);
      toast(iso ? "Withdrawal deadline saved — students see it immediately." : "Withdrawal deadline cleared.", { type: "success" });
      await reloadDeadline();
    } catch (e) {
      toast(e.message || "Failed to save deadline", { type: "error" });
    } finally {
      setSavingDeadline(false);
    }
  };

  const rows = data?.withdraws || [];
  const filtered = useMemo(() => rows.filter((r) => {
    if (filters.course !== "all" && !(r.course || "").startsWith(filters.course)) return false;
    return true;
  }), [rows, filters]);

  const restore = async (row) => {
    if (!window.confirm(`Restore ${row.student} (${row.roll}) for "${row.course}" back to ACTIVE? They will immediately regain access to this course.`)) return;
    setRestoring(row.id);
    try {
      const res = await api.focal.restoreWithdraw(row.id);
      // Only treat as success when the backend explicitly confirms it AND the
      // registration is now ENROLLED. This prevents showing a false "success"
      // when the server returned a 200 without actually restoring the record.
      const ok = res && res.success === true
        && (!res.registration || res.registration.status === "ENROLLED");
      if (!ok) {
        throw new Error(res?.error || "Restore did not complete. Please try again.");
      }
      // Refresh the list and confirm the row is no longer withdrawn.
      const fresh = await reload();
      const stillThere = (fresh?.withdraws || []).some((w) => w.id === row.id);
      if (stillThere) {
        throw new Error("Restore failed — the student is still withdrawn. Please retry.");
      }
      toast(`Restore Successful — ${row.student} is active again and regained access in real time.`, { type: "success" });
    } catch (e) {
      // Clear failure feedback; the row stays in the list so the Focal Person
      // can immediately retry the restore.
      toast(`Restore Failed — ${e.message || "Please try again."}`, { type: "error" });
      reload();
    } finally {
      setRestoring(null);
    }
  };

  const columns = [
    { key: "student", label: "Student", render: (v, r) => (
      <div><p className="font-bold text-app text-sm">{v}</p><p className="text-[10px] text-muted-app font-mono">{r.roll}</p></div>
    )},
    { key: "course",  label: "Course",  render: (v) => <span className="text-xs">{v}</span> },
    { key: "withdrawnAt", label: "Withdrawn", render: (v) => fmtDate(v) },
    { key: "_action", label: "Action", sortable: false, render: (_v, r) => (
      <button
        onClick={() => restore(r)}
        disabled={restoring === r.id}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        title="Restore this withdrawn student to active"
      >
        <RotateCcw size={14} /> {restoring === r.id ? "Restoring…" : "Restore Student"}
      </button>
    )},
  ];

  return (
    <div>
      <PageHeader title="Withdraw Cases" subtitle="Withdrawn registrations — restore a student back to active in real time. Full audit trail maintained." icon="LogOut" breadcrumb={["Focal Person", "Withdraws"]} />

      {error ? (
        <ErrorState title="Couldn't load withdrawals" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="card-base p-4 mb-4 flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <p className="text-sm font-bold text-app flex items-center gap-1.5 mb-1">
                <CalendarClock size={15} className="text-primary-600" /> Course withdrawal deadline
              </p>
              <p className="text-xs text-muted-app mb-2">
                Students may withdraw up to and including this date. After it passes, the withdraw option is disabled. Leave blank to keep withdrawals open.
              </p>
              <input
                type="datetime-local"
                value={deadlineInput}
                onChange={(e) => setDeadlineInput(e.target.value)}
                className="input-base text-sm w-full md:max-w-xs"
              />
              {deadlineData?.deadline && (
                <p className={`text-[11px] mt-1.5 font-semibold ${deadlineData.isPast ? "text-rose-600" : "text-emerald-600"}`}>
                  {deadlineData.isPast ? "Deadline has passed — withdrawals are closed." : "Deadline is active."}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeadlineInput("")} className="btn-secondary text-sm" disabled={savingDeadline}>Clear</button>
              <button onClick={saveDeadline} disabled={savingDeadline} className="btn-primary text-sm inline-flex items-center gap-1.5">
                {savingDeadline ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save deadline
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-4 gap-3 mb-4">
            <StatCard title="Total Withdrawals" value={rows.length} icon="LogOut" color="amber" />
            <StatCard title="This Term"         value={rows.length} icon="CalendarDays" color="cyan" delay={0.05} />
            <StatCard title="Unique Students"   value={new Set(rows.map((r) => r.studentId)).size} icon="Users" color="blue" delay={0.1} />
            <StatCard title="Courses Affected"  value={new Set(rows.map((r) => r.course)).size} icon="BookOpen" color="purple" delay={0.15} />
          </div>

          <FilterPanel
            filters={stripCrossDeptFilters(buildLmsFilters(filters), isFocal)}
            onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
            onReset={() => setFilters({ semester: "all", course: "all", program: "all", session: "all" })}
            extra={<ExportButtons title="Withdraw Cases" columns={columns.filter((c) => c.key !== "_action")} rows={filtered} filename="withdraws" />}
          />

          {filtered.length === 0 ? (
            <EmptyState icon="LogOut" title="No withdrawals" description="No registrations are currently withdrawn." />
          ) : (
            <EnterpriseTable columns={columns} rows={filtered} />
          )}
        </>
      )}
    </div>
  );
};

export default Withdraws;

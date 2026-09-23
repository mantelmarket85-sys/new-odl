import { useState, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import FilterPanel, { buildLmsFilters } from "../../components/enterprise/FilterPanel";
import { useIsFocalPerson, stripCrossDeptFilters } from "../../utils/focalDept";
import ExportButtons from "../../components/enterprise/ExportButtons";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { AlertCircle } from "lucide-react";

const statusFor = (pct) => (pct >= 90 ? "Excellent" : pct >= 75 ? "Good" : pct >= 60 ? "Average" : "Critical");
const STATUS_COLOR = { Excellent: "emerald", Good: "blue", Average: "amber", Critical: "rose" };

const AttendanceAnalytics = () => {
  const { data, loading, error, reload } = useApi(() => api.focal.attendance(), []);
  const [filters, setFilters] = useState({ semester: "all", course: "all", section: "all", program: "all", session: "all", range: "all" });
  const isFocal = useIsFocalPerson(); // Req #3: hide cross-department filters for focal role

  const students = data?.students || [];
  const distribution = data?.distribution || [];

  const filtered = useMemo(() => students.filter((a) => {
    if (filters.range === "short" && !a.short) return false;
    if (filters.range === "high" && a.pct < 90) return false;
    if (filters.range === "low" && a.pct >= 60) return false;
    return true;
  }), [students, filters]);

  const lowAtt = students.filter((a) => a.short).length;
  const excellent = students.filter((a) => a.pct >= 90).length;
  const avg = students.length ? Math.round(students.reduce((s, a) => s + a.pct, 0) / students.length) : 0;

  const columns = [
    { key: "name", label: "Student", render: (v, r) => (
      <div><p className="font-bold text-app text-sm">{v}</p><p className="text-[10px] text-muted-app font-mono">{r.roll}</p></div>
    )},
    { key: "present", label: "Present", render: (v, r) => <span className="font-mono text-xs">{v}/{r.total}</span> },
    { key: "pct", label: "Attendance %", render: (v) => (
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-app">{v}%</span>
        <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full">
          <div className={`h-full rounded-full ${v >= 90 ? "bg-emerald-500" : v >= 75 ? "bg-blue-500" : v >= 60 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${v}%` }} />
        </div>
      </div>
    )},
    { key: "_status", label: "Status", render: (_, r) => {
      const st = statusFor(r.pct); const c = STATUS_COLOR[st] || "slate";
      return <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-${c}-100 text-${c}-700 dark:bg-${c}-950/40 dark:text-${c}-300`}>{st}</span>;
    }},
    { key: "short", label: "Short?", render: (v) => v
      ? <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">Yes</span>
      : <span className="text-[10px] text-emerald-600">No</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Attendance Analytics"
        subtitle="Track low attendance, percentage ranges and short-attendance students across the department."
        icon="CalendarCheck"
        breadcrumb={["Focal Person", "Attendance"]}
      />

      {error ? (
        <ErrorState title="Couldn't load attendance" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="grid sm:grid-cols-4 gap-3 mb-4">
            <StatCard title="Total Records"     value={students.length} icon="Users" color="blue" />
            <StatCard title="Excellent (≥90%)"  value={excellent}       icon="Trophy" color="emerald" delay={0.05} />
            <StatCard title="Short Attendance"  value={lowAtt}          icon="AlertCircle" color="rose" delay={0.1} />
            <StatCard title="Average %"         value={`${avg}%`}       icon="TrendingUp" color="amber" delay={0.15} />
          </div>

          <div className="card-base p-5 mb-4">
            <h3 className="font-display font-bold text-lg text-app mb-3">Attendance Range Distribution</h3>
            {distribution.length === 0 ? (
              <EmptyState icon="BarChart" title="No data" description="No attendance records yet." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-30" />
                  <XAxis dataKey="range" tick={{ fontSize: 11, fill: "currentColor" }} />
                  <YAxis tick={{ fontSize: 11, fill: "currentColor" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "none", borderRadius: 12, color: "white" }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#06b6d4" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <FilterPanel
            filters={[
              ...stripCrossDeptFilters(buildLmsFilters(filters), isFocal),
              { key: "range", label: "Range", value: filters.range, options: [
                { value: "all", label: "All" },
                { value: "high", label: "≥90%" },
                { value: "low", label: "<60%" },
                { value: "short", label: "Short Attendance Only" },
              ]},
            ]}
            onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
            onReset={() => setFilters({ semester: "all", course: "all", section: "all", program: "all", session: "all", range: "all" })}
            extra={<ExportButtons title="Attendance Analytics" columns={columns} rows={filtered} filename="attendance_analytics" />}
          />

          {lowAtt > 0 && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 text-sm text-rose-800 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle size={16} /> <b>{lowAtt}</b> student(s) have short attendance and need follow-up.
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState icon="CalendarCheck" title="No records" description="No attendance records match the current filters." />
          ) : (
            <EnterpriseTable columns={columns} rows={filtered} pageSize={10} />
          )}
        </>
      )}
    </div>
  );
};

export default AttendanceAnalytics;

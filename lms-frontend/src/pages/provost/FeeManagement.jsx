// ============================================================
//  PROVOST — Fee Management Dashboard (real-time)
//  Requirement 1 (dashboard) + 10 (professional summary cards).
//  100% real DB data via api.provost.feeMgmt.*
// ============================================================
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import DeptSmartFilter, { ALL_DEPTS, DeptScopeBadge } from "../../components/common/DeptSmartFilter";

const fmtMoney = (n) => `Rs. ${Number(n || 0).toLocaleString("en-PK")}`;
const fmtDate = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return String(d); }
};

const statusChip = (s) => {
  const v = (s || "").toLowerCase();
  if (v === "paid") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (v === "overdue") return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
  if (v === "waived") return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
};

const StatTable = ({ title, rows, labelKey = "key" }) => (
  <div className="card-base p-5">
    <h3 className="font-display font-bold text-app mb-3">{title}</h3>
    {(!rows || rows.length === 0) ? (
      <p className="text-sm text-muted-app">No data yet.</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-app text-xs uppercase tracking-wide border-b border-app">
              <th className="py-2">Group</th>
              <th className="py-2 text-right">Collected</th>
              <th className="py-2 text-right">Pending</th>
              <th className="py-2 text-right">Records</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-app/40 last:border-0">
                <td className="py-2 font-semibold text-app">{r[labelKey]}</td>
                <td className="py-2 text-right text-emerald-600 font-semibold">{fmtMoney(r.collected)}</td>
                <td className="py-2 text-right text-amber-600 font-semibold">{fmtMoney(r.pending)}</td>
                <td className="py-2 text-right text-muted-app">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

const SummaryCards = ({ title, cards }) => (
  <div>
    <h3 className="font-display font-bold text-app mb-3">{title}</h3>
    {(!cards || cards.length === 0) ? (
      <p className="text-sm text-muted-app mb-4">No data yet.</p>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {cards.map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className="card-base p-5 border-l-4 border-primary-500">
            <p className="font-display font-extrabold text-lg text-app">{c.key}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-sm">
              <span className="text-muted-app">Students</span><span className="text-right font-semibold text-app">{c.students}</span>
              <span className="text-muted-app">Collected</span><span className="text-right font-semibold text-emerald-600">{fmtMoney(c.collected)}</span>
              <span className="text-muted-app">Pending</span><span className="text-right font-semibold text-amber-600">{fmtMoney(c.pending)}</span>
              <span className="text-muted-app">Submitted</span><span className="text-right font-semibold text-app">{c.submittedCount}</span>
              <span className="text-muted-app">Pending Cnt</span><span className="text-right font-semibold text-app">{c.pendingCount}</span>
            </div>
          </motion.div>
        ))}
      </div>
    )}
  </div>
);

const FeeManagement = () => {
  const { data, loading, error, reload } = useApi(() => api.provost.feeMgmt.dashboard(), []);
  const { data: cardsData } = useApi(() => api.provost.feeMgmt.cards(), []);
  // Real-time department smart filter (client-side scoping — instant).
  const [dept, setDept] = useState(ALL_DEPTS);
  const isAll = !dept || dept === ALL_DEPTS;

  const departments = useMemo(() => {
    const set = new Set();
    (data?.departmentStats || []).forEach((r) => r?.key && set.add(r.key));
    (cardsData?.departments || []).forEach((c) => c?.key && set.add(c.key));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data, cardsData]);

  // The selected department's stat row / card (used to scope KPIs).
  const deptStat = useMemo(
    () => (isAll ? null : (data?.departmentStats || []).find((r) => r.key === dept) || null),
    [data, dept, isAll],
  );
  const deptCard = useMemo(
    () => (isAll ? null : (cardsData?.departments || []).find((c) => c.key === dept) || null),
    [cardsData, dept, isAll],
  );

  // KPIs — university-wide by default, department-scoped when a dept is picked.
  const k = useMemo(() => {
    const base = data?.kpis || {};
    if (isAll) return base;
    return {
      ...base,
      totalStudents: deptCard?.students ?? 0,
      totalCollected: deptStat?.collected ?? deptCard?.collected ?? 0,
      totalPending: deptStat?.pending ?? deptCard?.pending ?? 0,
      submittedPayments: deptCard?.submittedCount ?? 0,
      pendingPayments: deptCard?.pendingCount ?? 0,
    };
  }, [data, isAll, deptStat, deptCard]);

  // Recent activity / announcement lists scoped by department when selected.
  const recentActivities = useMemo(() => {
    const list = data?.recentActivities || [];
    return isAll ? list : list.filter((a) => (a.department || "") === dept);
  }, [data, dept, isAll]);
  const recentAnnouncements = useMemo(() => {
    const list = data?.recentAnnouncements || [];
    return isAll ? list : list.filter((a) => !a.department || a.department === dept);
  }, [data, dept, isAll]);

  const deptStatsRows = useMemo(() => {
    const rows = data?.departmentStats || [];
    return isAll ? rows : rows.filter((r) => r.key === dept);
  }, [data, dept, isAll]);
  const deptCards = useMemo(() => {
    const cards = cardsData?.departments || [];
    return isAll ? cards : cards.filter((c) => c.key === dept);
  }, [cardsData, dept, isAll]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Fee Management" subtitle="Real-time university finance overview" icon="Wallet" breadcrumb={["Provost", "Fee Management"]} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      </div>
    );
  }
  if (error) return (<div><PageHeader title="Fee Management" icon="Wallet" /><ErrorState description={error} onRetry={reload} /></div>);

  return (
    <div>
      <PageHeader title="Fee Management" subtitle="Real-time department-wise finance overview" icon="Wallet" breadcrumb={["Provost", "Fee Management"]} />

      <div className="card-base p-3 mb-6 flex flex-wrap items-center gap-3">
        <DeptSmartFilter value={dept} onChange={setDept} departments={departments} />
        <span className="text-xs text-muted-app">Showing:</span>
        <DeptScopeBadge dept={dept} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Students" value={k.totalStudents ?? 0} icon="Users" color="blue" delay={0} />
        <StatCard title="Total Collected" value={fmtMoney(k.totalCollected)} icon="CheckCircle2" color="emerald" delay={0.05} />
        <StatCard title="Total Pending" value={fmtMoney(k.totalPending)} icon="AlertTriangle" color="amber" delay={0.1} />
        <StatCard title="Semester Fee Records" value={k.semesterFeeRecords ?? 0} icon="FileText" color="indigo" delay={0.15} />
        <StatCard title="Exam Fee Records" value={k.examFeeRecords ?? 0} icon="ClipboardList" color="purple" delay={0.2} />
        <StatCard title="Submitted Payments" value={k.submittedPayments ?? 0} icon="Receipt" color="teal" delay={0.25} />
        <StatCard title="Pending Payments" value={k.pendingPayments ?? 0} icon="Clock" color="rose" delay={0.3} />
        <StatCard title="Blocked Students" value={k.blockedStudents ?? 0} icon="UserMinus" color="rose" delay={0.35} subtitle={`${k.unblockedStudents ?? 0} active`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <StatTable title="Department-wise Statistics" rows={deptStatsRows} />
        <StatTable title="Program-wise Statistics" rows={data?.programStats} />
        <StatTable title="Semester-wise Statistics" rows={data?.semesterStats} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="card-base p-5">
          <h3 className="font-display font-bold text-app mb-3">Recent Fee Activities</h3>
          {(!recentActivities || recentActivities.length === 0) ? (
            <EmptyState icon="Activity" title="No activity yet" description="Fee activities will appear here." />
          ) : (
            <div className="space-y-2">
              {recentActivities.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-app-subtle">
                  <div className="min-w-0">
                    <p className="font-semibold text-app truncate">{a.student}</p>
                    <p className="text-xs text-muted-app truncate">{a.title} · {a.feeType}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="font-bold text-app">{fmtMoney(a.amount)}</p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusChip(a.status)}`}>{a.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card-base p-5">
          <h3 className="font-display font-bold text-app mb-3">Recent Fee Announcements</h3>
          {(!recentAnnouncements || recentAnnouncements.length === 0) ? (
            <EmptyState icon="Megaphone" title="No announcements yet" description="Announced fees will appear here." />
          ) : (
            <div className="space-y-2">
              {recentAnnouncements.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-app-subtle">
                  <div className="min-w-0">
                    <p className="font-semibold text-app truncate">{a.title}</p>
                    <p className="text-xs text-muted-app truncate">{a.feeType} · {a.scope} · {a.studentCount} students · {fmtDate(a.createdAt)}</p>
                  </div>
                  <p className="font-bold text-app shrink-0 ml-3">{fmtMoney(a.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {cardsData && (
        <>
          <SummaryCards title="Department Cards" cards={deptCards} />
          {isAll && <SummaryCards title="Program Cards" cards={cardsData.programs} />}
          {isAll && <SummaryCards title="Semester Cards" cards={cardsData.semesters} />}
        </>
      )}
    </div>
  );
};

export default FeeManagement;

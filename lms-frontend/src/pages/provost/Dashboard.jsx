import { Link } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell } from "recharts";
import { Crown } from "lucide-react";
import RoleBanner from "../../components/enterprise/RoleBanner";
import StatCard from "../../components/common/StatCard";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const fmtPKR = (n) => `Rs. ${(Number(n || 0) / 1000000).toFixed(0)}M`;
const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#6366f1"];

const ProvostDashboard = () => {
  const { data, loading, error, reload } = useApi(() => api.provost.dashboard(), []);
  const kpis = data?.kpis || {};
  const departments = data?.departments || [];
  const monthlyCollection = data?.monthlyCollection || [];

  const deptStudents = departments.map((d) => ({ name: String(d.name).split(" ")[0], students: d.students }));
  const deptShare = departments.map((d, i) => ({
    name: String(d.name).split(" ")[0],
    value: d.students,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      <RoleBanner
        icon="Crown"
        eyebrow={<><Crown size={12} /> Provost · University Executive</>}
        title="University Command Center"
        subtitle="University-wide analytics, finance oversight, department comparisons, and accreditation metrics."
        actions={
          <>
            <Link to="/provost/departments" className="px-4 py-2 bg-white text-slate-900 text-sm font-bold rounded-xl">Departments</Link>
            <Link to="/provost/reports" className="px-4 py-2 bg-white/15 text-white text-sm font-bold rounded-xl border border-white/30">Reports</Link>
          </>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-60 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Total Students"    value={(kpis.totalStudents ?? 0).toLocaleString()} icon="Users"        color="blue" />
            <StatCard title="Total Faculty"      value={kpis.totalFaculty ?? 0}                     icon="UserCog"      color="emerald" delay={0.05} />
            <StatCard title="Programs"           value={kpis.totalPrograms ?? 0}                    icon="GraduationCap" color="amber"   delay={0.1} />
            <StatCard title="Departments"        value={kpis.totalDepartments ?? 0}                 icon="Building2"    color="purple"  delay={0.15} />
            <StatCard title="Fees YTD"           value={fmtPKR(kpis.feesCollectedYTD)}              icon="Wallet"       color="cyan"    delay={0.2} />
            <StatCard title="Pending Fees"      value={fmtPKR(kpis.pendingFees)}                   icon="AlertCircle"  color="rose"    delay={0.25} />
            <StatCard title="Satisfaction"      value={`${kpis.satisfaction ?? 0} ★`}              icon="Star"         color="indigo"  delay={0.3} />
            <StatCard title="Ranking"            value={kpis.ranking ?? "—"}                        icon="Award"        color="amber"   delay={0.35} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 card-base p-5">
              <h3 className="font-display font-bold text-lg text-app mb-3">Department Sizes (Students)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={deptStudents}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                  <Bar dataKey="students" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card-base p-5">
              <h3 className="font-display font-bold text-lg text-app mb-3">Distribution</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={deptShare} dataKey="value" nameKey="name" innerRadius={40} outerRadius={90} paddingAngle={3}>
                    {deptShare.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-base p-5">
            <h3 className="font-display font-bold text-lg text-app mb-1">Monthly Fee Collection (Rs. M)</h3>
            <p className="text-xs text-muted-app mb-3">University-wide cash inflow</p>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={monthlyCollection}>
                <defs>
                  <linearGradient id="provostGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                <Area type="monotone" dataKey="collected" stroke="#f59e0b" strokeWidth={3} fill="url(#provostGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};

export default ProvostDashboard;

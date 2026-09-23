import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, AreaChart, Area } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const Analytics = () => {
  const { data, loading, error, reload } = useApi(() => api.provost.analytics(), []);
  const kpis = data?.kpis || {};
  const growth = data?.growth || [];
  const ratioData = data?.ratio || [];
  const monthlyCollection = data?.monthlyCollection || [];

  return (
    <div>
      <PageHeader title="University Analytics" subtitle="Strategic KPIs, growth trends, and operational metrics" icon="BarChart3" breadcrumb={["Provost", "Analytics"]} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
          <div className="grid lg:grid-cols-2 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard title="Student Body"   value={(kpis.totalStudents ?? 0).toLocaleString()} icon="Users"      color="blue" />
            <StatCard title="Faculty Total"  value={kpis.totalFaculty ?? 0}                     icon="UserCog"    color="emerald" delay={0.05} />
            <StatCard title="Satisfaction"   value={`${kpis.satisfaction ?? 0} ★`}              icon="Star"       color="amber"   delay={0.1} />
            <StatCard title="Growth (5yr)"   value={`+${kpis.growthPct ?? 0}%`}                 icon="TrendingUp" color="purple"  delay={0.15} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card-base p-5">
              <h3 className="font-display font-bold text-lg text-app mb-3">Student Body Growth</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={growth}>
                  <defs>
                    <linearGradient id="growth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="year" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                  <Area type="monotone" dataKey="students" stroke="#f59e0b" strokeWidth={3} fill="url(#growth)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card-base p-5">
              <h3 className="font-display font-bold text-lg text-app mb-3">Student : Faculty Ratio</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ratioData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                  <Bar dataKey="ratio" fill="#a855f7" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="lg:col-span-2 card-base p-5">
              <h3 className="font-display font-bold text-lg text-app mb-3">Fee Collection Trend</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={monthlyCollection}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                  <Line type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;

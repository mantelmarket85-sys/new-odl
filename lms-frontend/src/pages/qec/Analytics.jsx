import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import DeptSmartFilter, { ALL_DEPTS, DeptScopeBadge } from "../../components/common/DeptSmartFilter";

const Analytics = () => {
  const [dept, setDept] = useState(ALL_DEPTS);
  // Real-time department scoping: re-fetch the analytics scoped to the selected
  // department (server-side aggregation) whenever the smart filter changes.
  const params = dept && dept !== ALL_DEPTS ? `?department=${encodeURIComponent(dept)}` : "";
  const { data, loading, error, reload } = useApi(() => api.qec.analytics(params), [params]);
  const departments = data?.departments || [];

  return (
    <div>
      <PageHeader title="QEC Analytics" subtitle="Trends, ratings distribution, and engagement metrics — segmented by department" icon="BarChart3" breadcrumb={["QEC", "Analytics"]} />

      <div className="card-base p-3 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-app">Viewing:</p>
          <DeptScopeBadge dept={dept} />
        </div>
        <DeptSmartFilter value={dept} onChange={setDept} departments={departments} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <Loaded data={data} />
      )}
    </div>
  );
};

const Loaded = ({ data }) => {
  const stats = data.stats || {};
  const ratingDist = data.ratingDistribution || [];
  const trend = data.trend || [];
  const responsesByCourse = data.responsesByCourse || [];
  const byDepartment = data.byDepartment || [];
  const avgRating = (stats.avgRating || 0).toFixed(2);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard title="Total Surveys"  value={stats.totalSurveys ?? 0} icon="ClipboardList" color="purple" />
        <StatCard title="Engagement"     value={`${stats.engagement ?? 0}%`}           icon="Users"        color="emerald" delay={0.05} />
        <StatCard title="Avg. Rating"    value={`${avgRating} ★`}        icon="Star"         color="amber"   delay={0.1} />
        <StatCard title="Total Responses" value={stats.totalResponses ?? 0}          icon="TrendingUp"   color="blue"    delay={0.15} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3">Rating Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={ratingDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                {ratingDist.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3">Quality Trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="semester" stroke="#94a3b8" fontSize={11} />
              <YAxis domain={[3.5, 5]} stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Line type="monotone" dataKey="rating" stroke="#a855f7" strokeWidth={3} dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {byDepartment.length > 0 && (
          <div className="lg:col-span-2 card-base p-5">
            <h3 className="font-display font-bold text-lg text-app mb-3">Responses by Department</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byDepartment}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="department" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                <Bar dataKey="responses" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="lg:col-span-2 card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3">Responses by Course</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={responsesByCourse}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="course" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Bar dataKey="responses" fill="#a855f7" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
};

export default Analytics;

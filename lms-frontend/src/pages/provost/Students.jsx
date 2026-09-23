import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const Students = () => {
  const { data, loading, error, reload } = useApi(() => api.provost.students(), []);
  const byDept = data?.byDept || [];
  const stats = data?.stats || {};

  return (
    <div>
      <PageHeader title="Student Body" subtitle="University-wide student headcount & department distribution" icon="Users" breadcrumb={["Provost", "Students"]} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard title="Total Students"    value={(stats.totalStudents ?? 0).toLocaleString()} icon="Users"        color="blue" />
            <StatCard title="Active Programs"   value={stats.totalPrograms ?? 0}                    icon="GraduationCap" color="emerald" delay={0.05} />
            <StatCard title="Avg. per Dept"     value={(stats.avgPerDept ?? 0).toLocaleString()}    icon="Building2" color="amber" delay={0.1} />
            <StatCard title="Largest Dept"      value={(stats.largestDept ?? 0).toLocaleString()}   icon="TrendingUp" color="purple" delay={0.15} />
          </div>

          <div className="card-base p-5">
            <h3 className="font-display font-bold text-lg text-app mb-3">Students by Department</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byDept}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                <Bar dataKey="students" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};

export default Students;

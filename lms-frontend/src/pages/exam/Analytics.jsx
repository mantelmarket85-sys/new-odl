import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

const ExamAnalytics = () => {
  const { data, loading, error, reload } = useApi(() => api.exam.analytics(), []);

  const gradeDist = useMemo(() => data?.gradeDistribution || [], [data]);
  const courseStats = useMemo(() => data?.courseStats || [], [data]);
  const topCourse = useMemo(() => {
    if (!courseStats.length) return null;
    return [...courseStats].sort((a, b) => b.passRate - a.passRate)[0];
  }, [courseStats]);

  return (
    <div>
      <PageHeader title="Exam Analytics" subtitle="Result quality, grade distribution and course-wise pass rates." icon="BarChart3" breadcrumb={["Exam Controller", "Analytics"]} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard title="Avg Pass Rate" value={`${data?.passRate ?? 0}%`} icon="TrendingUp" color="emerald" />
            <StatCard title="Total Results" value={data?.total ?? 0} icon="ClipboardList" color="blue" delay={0.05} />
            <StatCard title="Avg Percent" value={data?.avgPercent ?? 0} icon="Percent" color="amber" delay={0.1} />
            <StatCard title="Top Course" value={topCourse ? `${topCourse.course} · ${topCourse.passRate}%` : "—"} icon="Award" color="rose" delay={0.15} />
          </div>

          {(data?.total ?? 0) === 0 ? (
            <div className="card-base"><EmptyState message="No results available for analytics yet." /></div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="card-base p-5">
                <h3 className="font-display font-bold text-lg text-app mb-3">Grade Distribution</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={gradeDist}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="grade" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card-base p-5">
                <h3 className="font-display font-bold text-lg text-app mb-3">Pass Rate by Course</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={courseStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="course" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                    <Bar dataKey="passRate" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card-base p-5">
                <h3 className="font-display font-bold text-lg text-app mb-3">Grade Share</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={gradeDist} dataKey="count" nameKey="grade" innerRadius={50} outerRadius={95} paddingAngle={3}>
                      {gradeDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="card-base p-5">
                <h3 className="font-display font-bold text-lg text-app mb-3">Course Enrollment Volume</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={courseStats}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="course" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                    <Bar dataKey="total" fill="#f59e0b" radius={[8, 8, 0, 0]} name="Total" />
                    <Bar dataKey="pass" fill="#8b5cf6" radius={[8, 8, 0, 0]} name="Pass" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ExamAnalytics;

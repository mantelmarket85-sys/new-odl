import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import ExportButtons from "../../components/enterprise/ExportButtons";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const Ratings = () => {
  const { data, loading, error, reload } = useApi(() => api.qec.ratings(), []);

  const teachers = data?.items || [];
  const stats = data?.stats || { facultyRated: 0, topRated: "0", avgUniversity: "0", surveys: 0 };

  const chartData = teachers.map((t) => ({ name: (t.teacher || "").replace("Dr. ", ""), rating: Number(t.avg) }));

  const cols = [
    { key: "teacher",   label: "Faculty", render: (v) => <span className="font-bold text-app text-sm">{v}</span> },
    { key: "courses",   label: "Courses", render: (v) => <span className="text-xs">{v}</span> },
    { key: "surveys",   label: "Surveys" },
    { key: "responses", label: "Responses" },
    { key: "avg",       label: "Avg. Rating", render: (v) => (
      <span className="font-bold text-amber-600">{v} ★</span>
    )},
  ];

  return (
    <div>
      <PageHeader title="Faculty Ratings" subtitle="Anonymous teacher evaluations — aggregated from student surveys" icon="Star" breadcrumb={["QEC", "Ratings"]}
        actions={<ExportButtons title="Faculty Ratings" columns={cols} rows={teachers} filename="faculty_ratings" />} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard title="Faculty Rated"   value={stats.facultyRated} icon="Users"  color="purple" />
            <StatCard title="Top Rated"       value={stats.topRated + " ★"}   icon="Award"  color="amber"  delay={0.05} />
            <StatCard title="Avg. University" value={stats.avgUniversity + " ★"} icon="TrendingUp" color="emerald" delay={0.1} />
            <StatCard title="Surveys"          value={stats.surveys}   icon="ClipboardList" color="blue" delay={0.15} />
          </div>

          <div className="card-base p-5 mb-4">
            <h3 className="font-display font-bold text-lg text-app mb-3">Ratings Chart</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis domain={[0, 5]} stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                <Bar dataKey="rating" fill="#a855f7" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <EnterpriseTable columns={cols} rows={teachers} pageSize={10} />
        </>
      )}
    </div>
  );
};

export default Ratings;

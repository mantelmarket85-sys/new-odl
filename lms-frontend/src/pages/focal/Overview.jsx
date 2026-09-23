import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, CartesianGrid, XAxis, YAxis } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

const SEM_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#6366f1", "#06b6d4"];

const Overview = () => {
  const { data, loading, error, reload } = useApi(() => api.focal.dashboard(), []);
  const { data: scheme } = useApi(() => api.focal.scheme(), []);
  const { data: attendance } = useApi(() => api.focal.attendance(), []);

  const dept = data?.departmentKpis || {};
  const faculty = data?.facultyKpis || {};
  const studentKpis = data?.studentKpis || {};
  const courseProgress = data?.courseProgress || [];

  // Section-wise distribution from live course progress (students per offering)
  const sectionData = courseProgress.map((c) => ({
    name: (c.course || "").split("—")[0].trim(),
    count: c.students || 0,
  }));

  // Semester distribution from live scheme programs
  const program = scheme?.programs?.[0];
  const semData = (program?.semesters || []).map((s, i) => ({
    name: s.title || `Sem ${s.number}`,
    value: (s.courses || []).length,
    color: SEM_COLORS[i % SEM_COLORS.length],
  }));

  const attendanceDist = (attendance?.distribution || []).map((d, i) => ({
    ...d,
    color: SEM_COLORS[i % SEM_COLORS.length],
  }));

  return (
    <div>
      <PageHeader
        title="Department Overview"
        subtitle="Snapshot view of department health: students, faculty, courses, sections."
        icon="Building2"
        breadcrumb={["Focal Person", "Overview"]}
      />

      {error ? (
        <ErrorState title="Couldn't load overview" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard title="Total Students" value={studentKpis.totalStudents ?? 0}     icon="Users"         color="blue" />
            <StatCard title="Active Students" value={studentKpis.activeStudents ?? 0}   icon="UserCheck"     color="emerald" delay={0.05} />
            <StatCard title="Faculty"        value={faculty.totalTeachers ?? 0}         icon="UserCog"       color="purple" delay={0.1} />
            <StatCard title="Courses"        value={dept.totalCourses ?? 0}             icon="BookOpen"      color="amber" delay={0.15} />
            <StatCard title="Offerings"      value={dept.totalOfferings ?? 0}           icon="Layers"        color="cyan" delay={0.2} />
            <StatCard title="Registrations"  value={studentKpis.totalRegistrations ?? 0} icon="ClipboardCheck" color="rose" delay={0.25} />
            <StatCard title="Programs"       value={dept.totalPrograms ?? 0}            icon="GraduationCap" color="indigo" delay={0.3} />
            <StatCard title="Avg Pass Rate"  value={`${dept.avgPassRate ?? 0}%`}        icon="Award"         color="teal" delay={0.35} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 card-base p-5">
              <h3 className="font-display font-bold text-lg text-app mb-3">Enrollment by Course</h3>
              {sectionData.length === 0 ? (
                <EmptyState icon="BookOpen" title="No offerings" description="No active offerings this term." />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={sectionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "currentColor" }} />
                    <YAxis tick={{ fontSize: 11, fill: "currentColor" }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "none", borderRadius: 12, color: "white" }} />
                    <Bar dataKey="count" fill="#06b6d4" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card-base p-5">
              <h3 className="font-display font-bold text-lg text-app mb-3">Courses per Semester</h3>
              {semData.length === 0 ? (
                <EmptyState icon="PieChart" title="No scheme" description="No program scheme available." />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={semData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={2}>
                      {semData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {attendanceDist.length > 0 && (
            <div className="card-base p-5 mt-4">
              <h3 className="font-display font-bold text-lg text-app mb-3">Attendance Distribution</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={attendanceDist}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-30" />
                  <XAxis dataKey="range" tick={{ fontSize: 11, fill: "currentColor" }} />
                  <YAxis tick={{ fontSize: 11, fill: "currentColor" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "none", borderRadius: 12, color: "white" }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {attendanceDist.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Overview;

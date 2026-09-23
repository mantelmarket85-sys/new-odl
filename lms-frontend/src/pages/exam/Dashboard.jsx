import { Link } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { CalendarClock, ClipboardList, FileText } from "lucide-react";
import RoleBanner from "../../components/enterprise/RoleBanner";
import StatCard from "../../components/common/StatCard";
import StatusBadge from "../../components/common/StatusBadge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

const PIE_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6"];

const ExamDashboard = () => {
  const { data, loading, error, reload } = useApi(() => api.exam.dashboard(), []);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <div className="space-y-6"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;

  const ek = data.examKpis || {};
  const rk = data.resultKpis || {};
  const examMix = [
    { name: "Published", value: ek.published || 0 },
    { name: "Draft", value: ek.draft || 0 },
    { name: "Locked", value: ek.locked || 0 },
  ].filter((x) => x.value > 0);

  const resultBars = [
    { name: "Draft", count: rk.draft || 0 },
    { name: "Published", count: rk.published || 0 },
  ];

  return (
    <div className="space-y-6">
      <RoleBanner
        icon="ClipboardList"
        eyebrow={<><ClipboardList size={12} /> Exam Controller · Examination Cell</>}
        title="Examination Command Center"
        subtitle={`Plan date sheets, schedule online exams, compile and publish results.${data.term ? ` · ${data.term}` : ""}`}
        actions={
          <>
            <Link to="/exam/schedule" className="px-4 py-2 bg-white text-slate-900 text-sm font-bold rounded-xl">Online Exams</Link>
            <Link to="/exam/reports" className="px-4 py-2 bg-white/15 text-white text-sm font-bold rounded-xl border border-white/30">Export Reports</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="Total Exams"       value={ek.total || 0}          icon="ClipboardList" color="blue" />
        <StatCard title="Published Exams"   value={ek.published || 0}      icon="CalendarClock" color="cyan"    delay={0.05} />
        <StatCard title="Results Published" value={rk.totalPublished || 0} icon="CheckCircle2"  color="emerald" delay={0.1} />
        <StatCard title="Pass Rate"         value={`${rk.passRate ?? 0}%`} icon="TrendingUp"    color="indigo"  delay={0.15} />
        <StatCard title="Draft Results"     value={rk.draft || 0}          icon="FileWarning"   color="amber"   delay={0.2} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-1">Results Pipeline</h3>
          <p className="text-xs text-muted-app mb-3">Course results by publication status (live)</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={resultBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-1">Exam Status Mix</h3>
          <p className="text-xs text-muted-app mb-3">Draft / Published / Locked</p>
          {examMix.length === 0 ? <EmptyState message="No exams yet." /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={examMix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={4}>
                  {examMix.map((d, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3 flex items-center gap-2"><CalendarClock size={18} className="text-rose-500" /> Upcoming Online Exams</h3>
          <div className="space-y-2">
            {(data.upcomingExams || []).length === 0 ? <EmptyState message="No upcoming exams." /> :
              data.upcomingExams.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-xl border border-app">
                  <div className="min-w-0">
                    <p className="font-bold text-app text-sm truncate">{e.offering || e.title}</p>
                    <p className="text-xs text-muted-app">{e.date} · {e.startTime || ""}{e.room ? ` · ${e.room}` : ""}</p>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
              ))}
          </div>
        </div>

        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3 flex items-center gap-2"><FileText size={18} className="text-blue-500" /> Result Compilation Snapshot</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-app">
              <p className="text-xs text-muted-app">Draft Results</p>
              <p className="text-2xl font-bold text-app">{rk.draft || 0}</p>
            </div>
            <div className="p-4 rounded-xl border border-app">
              <p className="text-xs text-muted-app">Published Results</p>
              <p className="text-2xl font-bold text-app">{rk.published || 0}</p>
            </div>
            <div className="p-4 rounded-xl border border-app">
              <p className="text-xs text-muted-app">Pass Count</p>
              <p className="text-2xl font-bold text-emerald-600">{rk.passCount || 0}</p>
            </div>
            <div className="p-4 rounded-xl border border-app">
              <p className="text-xs text-muted-app">Result Batches</p>
              <p className="text-2xl font-bold text-app">{rk.batches || 0}</p>
            </div>
          </div>
          <Link to="/exam/results-compilation" className="btn-primary text-sm w-full mt-3 inline-block text-center">Open Results Compilation</Link>
        </div>
      </div>
    </div>
  );
};

export default ExamDashboard;

import { useMemo } from "react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

const ExamTracking = () => {
  const { data: schedData, loading: l1, error: e1, reload: r1 } = useApi(() => api.exam.schedules(), []);
  const { data: resData, loading: l2, error: e2, reload: r2 } = useApi(() => api.exam.results(), []);

  const schedules = useMemo(() => schedData?.schedules || [], [schedData]);
  const results = useMemo(() => resData?.results || [], [resData]);

  const loading = l1 || l2;
  const error = e1 || e2;
  const reload = () => { r1(); r2(); };

  const counts = useMemo(() => {
    const byStatus = (s) => schedules.filter((e) => e.status === s).length;
    const draftResults = results.filter((r) => r.status === "DRAFT").length;
    const publishedResults = results.filter((r) => r.status === "PUBLISHED").length;
    return {
      total: schedules.length,
      published: byStatus("PUBLISHED"),
      locked: byStatus("LOCKED"),
      draft: byStatus("DRAFT"),
      approved: byStatus("APPROVED"),
      pendingResults: draftResults,
      publishedResults,
    };
  }, [schedules, results]);

  const funnel = useMemo(() => [
    { stage: "Draft", value: counts.draft, fill: "#3b82f6" },
    { stage: "Published", value: counts.published, fill: "#10b981" },
    { stage: "Approved", value: counts.approved, fill: "#6366f1" },
    { stage: "Locked", value: counts.locked, fill: "#8b5cf6" },
    { stage: "Pending Results", value: counts.pendingResults, fill: "#f59e0b" },
    { stage: "Results Published", value: counts.publishedResults, fill: "#22c55e" },
  ], [counts]);

  return (
    <div>
      <PageHeader title="Exam Tracking" subtitle="End-to-end progress: scheduling → invigilation → results publication." icon="Activity" breadcrumb={["Exam Controller", "Tracking"]} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard title="Total Exams" value={counts.total} icon="ClipboardList" color="blue" />
            <StatCard title="Published Exams" value={counts.published} icon="Send" color="emerald" delay={0.05} />
            <StatCard title="Locked" value={counts.locked} icon="Lock" color="violet" delay={0.1} />
            <StatCard title="Pending Results" value={counts.pendingResults} icon="AlertTriangle" color="rose" delay={0.15} />
          </div>

          <div className="card-base p-5">
            <h3 className="font-display font-bold text-lg text-app mb-1">Exam Lifecycle Funnel</h3>
            <p className="text-xs text-muted-app mb-3">Distribution of exams and results across pipeline stages.</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="stage" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {funnel.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};

export default ExamTracking;

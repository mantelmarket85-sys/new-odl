import { Link } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { ScrollText, ShieldCheck } from "lucide-react";
import RoleBanner from "../../components/enterprise/RoleBanner";
import StatCard from "../../components/common/StatCard";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";

const QECDashboard = () => {
  const { data, loading, error, reload } = useApi(() => api.qec.dashboard(), []);

  if (error) {
    return (
      <div className="space-y-6">
        <RoleBanner
          icon="ShieldCheck"
          eyebrow={<><ShieldCheck size={12} /> Director QEC · Quality Enhancement Cell</>}
          title="Quality Assurance Command Center"
          subtitle="Anonymous surveys, faculty ratings, course evaluations, and accreditation compliance — all confidential."
        />
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const q = data.qualityKpis || {};
  const ev = data.evaluationKpis || {};
  const acc = data.accreditationKpis || {};
  const avgRating = (q.avgRating || 0).toFixed(2);
  const ratingDist = data.ratingDistribution || [];
  const recentFeedback = data.recentFeedback || [];

  return (
    <div className="space-y-6">
      <RoleBanner
        icon="ShieldCheck"
        eyebrow={<><ShieldCheck size={12} /> Director QEC · Quality Enhancement Cell</>}
        title="Quality Assurance Command Center"
        subtitle="Anonymous surveys, faculty ratings, course evaluations, and accreditation compliance — all confidential."
        actions={
          <>
            <Link to="/qec/surveys" className="px-4 py-2 bg-white text-slate-900 text-sm font-bold rounded-xl">View Surveys</Link>
            <Link to="/qec/reports" className="px-4 py-2 bg-white/15 text-white text-sm font-bold rounded-xl border border-white/30">Reports</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="Active Surveys"   value={ev.activeSurveys ?? 0}  icon="ClipboardList" color="cyan" />
        <StatCard title="Closed Surveys"   value={ev.closedSurveys ?? 0}  icon="CheckCircle2"  color="indigo"  delay={0.05} />
        <StatCard title="Total Responses" value={q.totalResponses ?? 0} icon="MessageSquare" color="emerald" delay={0.1} />
        <StatCard title="Avg. Rating"     value={`${avgRating} ★`} icon="Star"         color="amber"   delay={0.15} />
        <StatCard title="Compliance"      value={`${acc.compliancePct ?? 0}%`}            icon="ShieldCheck"  color="purple"  delay={0.2} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-1">Rating Distribution</h3>
          <p className="text-xs text-muted-app mb-3">Anonymous feedback ratings across all surveys</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ratingDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="stars" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-1">Overall Score</h3>
          <p className="text-xs text-muted-app mb-3">Faculty satisfaction</p>
          <ResponsiveContainer width="100%" height={220}>
            <RadialBarChart innerRadius="60%" outerRadius="100%" data={[{ name: "Score", value: (avgRating / 5) * 100, fill: "#a855f7" }]} startAngle={90} endAngle={-270}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar dataKey="value" cornerRadius={20} background={{ fill: "rgba(168,85,247,0.15)" }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <p className="text-center text-3xl font-extrabold text-app -mt-32">{avgRating}<span className="text-base text-muted-app">/5.0</span></p>
        </div>
      </div>

      <div className="card-base p-5">
        <h3 className="font-display font-bold text-lg text-app mb-3 flex items-center gap-2"><ScrollText size={18} className="text-purple-500" /> Recent Anonymous Feedback</h3>
        <div className="space-y-2">
          {recentFeedback.length === 0 ? (
            <p className="text-sm text-muted-app py-6 text-center">No feedback received yet.</p>
          ) : recentFeedback.slice(0, 4).map((f) => (
            <div key={f.id} className="p-3 rounded-xl border border-app">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">{f.anonymous}</span>
                <span className="text-amber-500 text-sm">{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span>
              </div>
              <p className="text-sm text-app italic">"{f.text}"</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QECDashboard;

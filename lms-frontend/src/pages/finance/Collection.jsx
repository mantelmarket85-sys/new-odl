import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import { monthlyCollection, feeRecords } from "../../data/enterpriseData";

const fmtPKR = (n) => `Rs. ${(n / 1000000).toFixed(1)}M`;

const Collection = () => {
  const totalPaid = feeRecords.reduce((s, r) => s + r.paid, 0);
  const totalDue = feeRecords.reduce((s, r) => s + r.amount, 0);
  const target = totalDue;
  const achieved = totalPaid;
  const target_pct = ((achieved / target) * 100).toFixed(1);

  const data = monthlyCollection.map((m) => ({
    ...m,
    target: 6.0,
  }));

  return (
    <div>
      <PageHeader title="Collection Center" subtitle="Track monthly targets vs achievements" icon="TrendingUp" breadcrumb={["Finance", "Collection"]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard title="YTD Collected"   value={fmtPKR(totalPaid)} icon="TrendingUp" color="emerald" />
        <StatCard title="YTD Target"      value={fmtPKR(target)}    icon="Target"     color="blue"    delay={0.05} />
        <StatCard title="Achievement %"   value={`${target_pct}%`}  icon="Award"      color="amber"   delay={0.1} />
        <StatCard title="Best Month"      value="8.7M (Jan)"        icon="Star"       color="rose"    delay={0.15} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3">Monthly Collection (Rs. M)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Bar dataKey="collected" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3">Target vs Achieved</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Legend />
              <Line type="monotone" dataKey="target" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="5 5" />
              <Line type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={3} dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Collection;

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell, Legend } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import { feeRecords, monthlyCollection } from "../../data/enterpriseData";

const fmtPKR = (n) => `Rs. ${(n / 1000000).toFixed(1)}M`;

const Analytics = () => {
  const totalDue = feeRecords.reduce((s, r) => s + r.amount, 0);
  const totalPaid = feeRecords.reduce((s, r) => s + r.paid, 0);
  const rate = ((totalPaid / totalDue) * 100).toFixed(1);

  const byProgram = ["ADCS"].map((p) => ({
    program: p,
    paid: feeRecords.filter((r) => r.program === p).reduce((s, r) => s + r.paid, 0) / 1000,
    due:  feeRecords.filter((r) => r.program === p).reduce((s, r) => s + r.amount, 0) / 1000,
  }));

  const methodDist = [
    { name: "Bank Transfer", value: feeRecords.filter((r) => r.method === "Bank Transfer").length, color: "#3b82f6" },
    { name: "Easypaisa",     value: feeRecords.filter((r) => r.method === "Easypaisa").length,    color: "#10b981" },
    { name: "Online",        value: feeRecords.filter((r) => r.method === "Online").length,        color: "#6366f1" },
    { name: "Cash",          value: feeRecords.filter((r) => r.method === "Cash").length,          color: "#f59e0b" },
    { name: "Unpaid",        value: feeRecords.filter((r) => r.method === "—").length,             color: "#ef4444" },
  ];

  return (
    <div>
      <PageHeader title="Financial Analytics" subtitle="Collection trends, method preferences, defaulter patterns" icon="BarChart3" breadcrumb={["Finance", "Analytics"]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard title="Collection Rate"  value={`${rate}%`}        icon="TrendingUp" color="emerald" />
        <StatCard title="Total Collected"  value={fmtPKR(totalPaid)} icon="Wallet"     color="blue"    delay={0.05} />
        <StatCard title="Outstanding"      value={fmtPKR(totalDue - totalPaid)} icon="AlertCircle" color="rose" delay={0.1} />
        <StatCard title="Best Month"       value="Jan · 8.7M"        icon="Award"      color="amber"   delay={0.15} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyCollection}>
              <defs>
                <linearGradient id="trend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Area type="monotone" dataKey="collected" stroke="#22c55e" strokeWidth={3} fill="url(#trend)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3">Payment Methods</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={methodDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                {methodDist.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="lg:col-span-2 card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3">Program-wise Collection (Rs. in thousands)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byProgram}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="program" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Legend />
              <Bar dataKey="due"  fill="#94a3b8" name="Total Due"  radius={[8, 8, 0, 0]} />
              <Bar dataKey="paid" fill="#10b981" name="Collected" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Analytics;

import { Link } from "react-router-dom";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Wallet, TrendingUp, AlertCircle, ScrollText, Receipt } from "lucide-react";
import RoleBanner from "../../components/enterprise/RoleBanner";
import StatCard from "../../components/common/StatCard";
import StatusBadge from "../../components/common/StatusBadge";
import { feeRecords, feeApprovals, monthlyCollection, activityLogs } from "../../data/enterpriseData";

const fmtPKR = (n) => `Rs. ${n.toLocaleString()}`;

const FinanceDashboard = () => {
  const totalDue = feeRecords.reduce((s, r) => s + r.amount, 0);
  const totalPaid = feeRecords.reduce((s, r) => s + r.paid, 0);
  const collection = ((totalPaid / totalDue) * 100).toFixed(1);
  const pendingApprovals = feeApprovals.length;
  const overdue = feeRecords.filter((r) => r.status === "Overdue").length;

  const statusDist = [
    { name: "Paid",    value: feeRecords.filter((r) => r.status === "Paid").length,    color: "#10b981" },
    { name: "Pending", value: feeRecords.filter((r) => r.status === "Pending").length, color: "#f59e0b" },
    { name: "Partial", value: feeRecords.filter((r) => r.status === "Partial").length, color: "#3b82f6" },
    { name: "Overdue", value: feeRecords.filter((r) => r.status === "Overdue").length, color: "#ef4444" },
  ];

  const logs = activityLogs.filter((l) => l.type === "finance").slice(0, 5);

  return (
    <div className="space-y-6">
      <RoleBanner
        icon="Wallet"
        eyebrow={<><Wallet size={12} /> Finance Coordinator · Accounts Office</>}
        title="Financial Command Center"
        subtitle="Track fee collection, approve payments, monitor defaulters, and publish financial reports."
        actions={
          <>
            <Link to="/finance/approvals" className="px-4 py-2 bg-white text-slate-900 text-sm font-bold rounded-xl">Approve Payments</Link>
            <Link to="/finance/reports" className="px-4 py-2 bg-white/15 text-white text-sm font-bold rounded-xl border border-white/30">Reports</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard title="Total Collected"    value={fmtPKR(totalPaid)}   icon="Wallet"       color="emerald" trend={`+${collection}%`} />
        <StatCard title="Total Receivables"   value={fmtPKR(totalDue)}    icon="Receipt"      color="blue"    delay={0.05} />
        <StatCard title="Pending Approvals"   value={pendingApprovals}     icon="ClipboardCheck" color="amber"   delay={0.1} />
        <StatCard title="Overdue"              value={overdue}              icon="AlertCircle"  color="rose"    delay={0.15} />
        <StatCard title="Collection Rate"     value={`${collection}%`}     icon="TrendingUp"   color="indigo"  delay={0.2} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-1">Monthly Collection</h3>
          <p className="text-xs text-muted-app mb-3">Rs. in millions, last 7 months</p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyCollection}>
              <defs>
                <linearGradient id="finGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Area type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={3} fill="url(#finGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-1">Payment Status</h3>
          <p className="text-xs text-muted-app mb-3">Distribution of all fee records</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statusDist} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={4}>
                {statusDist.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3 flex items-center gap-2"><Receipt size={18} className="text-amber-500" /> Pending Approvals</h3>
          <div className="space-y-2">
            {feeApprovals.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-app">
                <div>
                  <p className="font-bold text-app text-sm">{a.student}</p>
                  <p className="text-xs text-muted-app">{a.method} · {a.slipUploaded}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-app text-sm">{fmtPKR(a.amount)}</p>
                  <StatusBadge status="Pending" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app mb-3 flex items-center gap-2"><ScrollText size={18} className="text-blue-500" /> Recent Activity</h3>
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="p-3 rounded-xl border border-app">
                <p className="text-sm font-bold text-app">{l.action}</p>
                <p className="text-xs text-muted-app">{l.target}</p>
                <p className="text-[10px] text-muted-app mt-0.5">{l.timestamp} · {l.user}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceDashboard;

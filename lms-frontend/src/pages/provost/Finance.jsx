import { motion } from "framer-motion";
import { DollarSign, TrendingUp } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const ProvostFinance = () => {
  const { data, loading, error, reload } = useApi(() => api.provost.finance(), []);
  const revenueChart = data?.revenueChart || [];
  const feeTypeData = data?.feeTypeData || [];
  const latest = data?.latest || [];
  const stats = data?.stats || {};

  return (
    <div>
      <PageHeader
        title="Financial Overview"
        subtitle="University-wide financial coordination & revenue analytics"
        icon="Wallet"
        breadcrumb={["Provost", "Finance"]}
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
          <div className="grid lg:grid-cols-2 gap-5">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}</div>
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatCard title="Total Revenue (FY)" value={`Rs. ${Number(stats.totalRevenue ?? 0).toFixed(1)}M`} icon="TrendingUp" color="emerald" subtitle={`Target Rs. ${Number(stats.totalTarget ?? 0).toFixed(1)}M`} delay={0.05} />
            <StatCard title="Approved Payments" value={`Rs. ${(Number(stats.approved ?? 0) / 1000).toFixed(1)}K`} icon="DollarSign" color="blue" delay={0.1} />
            <StatCard title="Pending Approval" value={`Rs. ${(Number(stats.pending ?? 0) / 1000).toFixed(1)}K`} icon="CreditCard" color="amber" delay={0.15} />
            <StatCard title="Active Announcements" value={stats.activeAnnouncements ?? 0} icon="AlertCircle" color="purple" delay={0.2} />
          </div>

          <div className="grid lg:grid-cols-2 gap-5 mb-5">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-base p-5">
              <h3 className="font-display font-bold text-app mb-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-600" /> Revenue vs Target (Million Rs.)
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={revenueChart}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="tgt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "rgba(15, 23, 42, 0.95)", border: "none", borderRadius: 8, color: "#fff" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#rev)" name="Revenue" strokeWidth={2} />
                  <Area type="monotone" dataKey="target" stroke="#8b5cf6" fill="url(#tgt)" name="Target" strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card-base p-5">
              <h3 className="font-display font-bold text-app mb-3 flex items-center gap-2">
                <DollarSign size={16} className="text-amber-600" /> Collection by Fee Type
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={feeTypeData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "rgba(15, 23, 42, 0.95)", border: "none", borderRadius: 8, color: "#fff" }} />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card-base p-5">
            <h3 className="font-display font-bold text-app mb-3">Latest Fee Announcements</h3>
            <div className="space-y-2">
              {latest.length === 0 ? (
                <p className="text-sm text-muted-app py-4 text-center">No fee announcements yet.</p>
              ) : latest.slice(0, 4).map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 surface border border-app rounded-lg">
                  <div>
                    <p className="text-sm font-semibold text-app">{a.title}</p>
                    <p className="text-xs text-muted-app">Issued {a.issued} · Deadline {a.deadline}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-app">Rs. {Number(a.amount || 0).toLocaleString()}</p>
                    <p className="text-[10px] font-bold text-primary-600 dark:text-primary-400">{a.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
};

export default ProvostFinance;

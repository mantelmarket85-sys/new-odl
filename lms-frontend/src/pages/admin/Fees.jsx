import { useState } from "react";
import { motion } from "framer-motion";
import { Wallet, Search, Filter, Eye, CheckCircle2, XCircle, Clock, Download, TrendingUp, DollarSign, Banknote, CreditCard, Smartphone, Building2, AlertCircle } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import StatusBadge from "../../components/common/StatusBadge";
import EmptyState from "../../components/common/EmptyState";
import { pendingFeeApprovals, feePayments, revenueData } from "../../data/mockData";
import { useToast } from "../../context/ToastContext";

const methodIcons = {
  JazzCash: Smartphone,
  EasyPaisa: Smartphone,
  "Bank Transfer": Building2,
  "1Link": CreditCard,
};

const AdminFees = () => {
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [remarks, setRemarks] = useState("");
  const { toast } = useToast();

  const filteredPending = pendingFeeApprovals.filter(p => p.student.toLowerCase().includes(search.toLowerCase()) || p.studentId.toLowerCase().includes(search.toLowerCase()));

  const totalRevenue = feePayments.reduce((s, f) => s + f.amount, 0);
  const monthlyRevenue = revenueData[revenueData.length - 1].revenue;

  const approve = () => {
    toast(`Payment from ${selected?.student} approved!`, { type: "success" });
    setSelected(null);
    setRemarks("");
  };
  const reject = () => {
    toast(`Payment from ${selected?.student} rejected`, { type: "error" });
    setSelected(null);
    setRemarks("");
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Fee Management"
        subtitle="Review pending payments, approve submissions, and track revenue"
        icon="Wallet"
        breadcrumb={["Coordinator", "Fees"]}
        actions={
          <button onClick={() => toast("Generating financial report...", { type: "info" })} className="btn-primary">
            <Download size={16} className="mr-1.5 inline" /> Export Report
          </button>
        }
      />

      {/* Revenue stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Pending Approvals" value={pendingFeeApprovals.length} icon="Clock" color="amber" subtitle="Awaiting review" delay={0.05} />
        <StatCard title="Total Revenue" value={`PKR ${(totalRevenue / 1000).toFixed(0)}K`} icon="Banknote" color="emerald" subtitle="Lifetime" delay={0.1} />
        <StatCard title="This Month" value={`PKR ${monthlyRevenue}M`} icon="TrendingUp" color="blue" subtitle="+12% vs last month" delay={0.15} />
        <StatCard title="Approved Today" value={feePayments.filter(f => f.status === "Approved").length} icon="CheckCircle2" color="teal" delay={0.2} />
      </div>

      {/* Revenue chart */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="card-base p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-app text-lg flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-500" /> Revenue Overview (PKR Millions)
          </h3>
        </div>
        <div className="h-60">
          <ResponsiveContainer>
            <BarChart data={revenueData}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-app" />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-app" />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg-card)" }} />
              <Legend />
              <Bar dataKey="revenue" fill="url(#revGrad)" radius={[8, 8, 0, 0]} name="Revenue" />
              <Bar dataKey="expenses" fill="url(#expGrad)" radius={[8, 8, 0, 0]} name="Expenses" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { id: "pending", label: "Pending Approvals", count: pendingFeeApprovals.length },
          { id: "history", label: "Payment History", count: feePayments.length },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t.id
                ? "bg-gradient-to-r from-primary-600 to-blue-600 text-white shadow-lg shadow-primary-500/30"
                : "surface text-app border border-app hover:bg-slate-50 dark:hover:bg-slate-900 dark:hover:bg-slate-800"
            }`}
          >
            {t.label} <span className="ml-1 opacity-80">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-5">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by student name or ID..." className="input-base pl-10" />
        </div>
      </div>

      {tab === "pending" ? (
        filteredPending.length === 0 ? (
          <EmptyState icon="CheckCircle2" title="All caught up!" description="No pending fee approvals at this time." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPending.map((p, i) => {
              const MIcon = methodIcons[p.method] || CreditCard;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="card-base overflow-hidden hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
                >
                  <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3 gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600 dark:text-primary-400">{p.id}</span>
                          <StatusBadge status={p.status} />
                        </div>
                        <h3 className="font-bold text-app text-base">{p.student}</h3>
                        <p className="text-xs text-muted-app">{p.studentId} · {p.semester}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold gradient-text">PKR {(p.amount / 1000).toFixed(0)}K</div>
                        <div className="text-xs text-muted-app">{p.uploadedAt}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-4 p-2.5 rounded-xl surface border border-app">
                      <MIcon size={16} className="text-primary-500" />
                      <div className="flex-1">
                        <div className="text-xs text-muted-app">via {p.method}</div>
                        <div className="text-xs font-mono text-app">{p.trxId}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setSelected(p)} className="flex-1 px-3 py-2 rounded-xl surface border border-app text-app font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-900 dark:hover:bg-slate-800">
                        <Eye size={14} className="mr-1.5 inline" /> Review
                      </button>
                      <button onClick={() => { setSelected(p); setTimeout(() => approve(), 0); }} className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm">
                        <CheckCircle2 size={14} />
                      </button>
                      <button onClick={() => { setSelected(p); setTimeout(() => reject(), 0); }} className="px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-sm">
                        <XCircle size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )
      ) : (
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-app">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-app">Receipt</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-app">Semester</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-app">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-app">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-app">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-muted-app">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {feePayments.map((f, i) => (
                  <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-900 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono text-xs text-app">{f.id}</td>
                    <td className="px-4 py-3 text-app">{f.semester}</td>
                    <td className="px-4 py-3 font-bold text-app">PKR {f.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-app text-sm">{f.method}</td>
                    <td className="px-4 py-3 text-muted-app text-sm">{f.paidDate}</td>
                    <td className="px-4 py-3"><StatusBadge status={f.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review modal */}
      <Modal open={!!selected} onClose={() => { setSelected(null); setRemarks(""); }} title="Review Payment Submission" subtitle={selected?.id} icon={Wallet} maxWidth="max-w-2xl">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl surface border border-app">
                <div className="text-[10px] uppercase font-bold text-muted-app mb-0.5">Student</div>
                <div className="font-semibold text-app">{selected.student}</div>
                <div className="text-xs text-muted-app">{selected.studentId}</div>
              </div>
              <div className="p-2.5 rounded-xl surface border border-app">
                <div className="text-[10px] uppercase font-bold text-muted-app mb-0.5">Semester</div>
                <div className="font-semibold text-app">{selected.semester}</div>
              </div>
              <div className="p-2.5 rounded-xl surface border border-app">
                <div className="text-[10px] uppercase font-bold text-muted-app mb-0.5">Amount</div>
                <div className="font-bold gradient-text">PKR {selected.amount.toLocaleString()}</div>
              </div>
              <div className="p-2.5 rounded-xl surface border border-app">
                <div className="text-[10px] uppercase font-bold text-muted-app mb-0.5">Method</div>
                <div className="font-semibold text-app">{selected.method}</div>
              </div>
              <div className="col-span-2 p-2.5 rounded-xl surface border border-app">
                <div className="text-[10px] uppercase font-bold text-muted-app mb-0.5">Transaction ID</div>
                <div className="font-mono text-sm text-app">{selected.trxId}</div>
              </div>
            </div>

            {/* Mock proof preview */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-900 dark:to-slate-800 border border-app">
              <div className="text-xs font-semibold text-muted-app mb-2">Payment Proof (Attached)</div>
              <div className="aspect-video rounded-lg bg-gradient-to-br from-emerald-100 to-blue-100 dark:from-emerald-950/40 dark:to-blue-950/40 flex items-center justify-center border-2 border-dashed border-emerald-300 dark:border-emerald-800">
                <div className="text-center">
                  <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-app">payment_proof_{selected.id}.jpg</p>
                  <p className="text-xs text-muted-app">Click to view full image</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-app mb-1.5">Remarks (Optional)</label>
              <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} placeholder="Add notes about this submission..." className="input-base" />
            </div>

            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button onClick={() => { setSelected(null); setRemarks(""); }} className="btn-secondary">Cancel</button>
              <button onClick={reject} className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors">
                <XCircle size={14} className="mr-1.5 inline" /> Reject
              </button>
              <button onClick={approve} className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors">
                <CheckCircle2 size={14} className="mr-1.5 inline" /> Approve & Issue Receipt
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminFees;

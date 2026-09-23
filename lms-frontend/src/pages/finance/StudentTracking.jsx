import { useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import { feeRecords } from "../../data/enterpriseData";

const fmt = (n) => `Rs. ${n.toLocaleString()}`;

const StudentTracking = () => {
  const [selected, setSelected] = useState(feeRecords[0].rollNo);
  const student = feeRecords.find((r) => r.rollNo === selected);
  const history = feeRecords.filter((r) => r.rollNo === selected); /* Single record per student in mock */

  const balance = student.amount - student.paid;

  return (
    <div>
      <PageHeader title="Student Fee Tracking" subtitle="Detailed fee history and outstanding balance per student" icon="User" breadcrumb={["Finance", "Student Tracking"]} />

      <div className="card-base p-4 mb-4">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Select Student</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className="input-base py-2 text-sm w-full">
          {feeRecords.map((r) => <option key={r.rollNo} value={r.rollNo}>{r.student} — {r.rollNo}</option>)}
        </select>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card-base p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app mb-1">Total Receivable</p>
          <p className="text-2xl font-bold text-app">{fmt(student.amount)}</p>
        </div>
        <div className="card-base p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app mb-1">Paid to Date</p>
          <p className="text-2xl font-bold text-emerald-600">{fmt(student.paid)}</p>
        </div>
        <div className="card-base p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app mb-1">Balance</p>
          <p className={`text-2xl font-bold ${balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>{fmt(balance)}</p>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="p-4 border-b border-app">
          <h3 className="font-bold text-app">Payment History</h3>
          <p className="text-xs text-muted-app">{student.student} · {student.rollNo} · {student.program} · Sem {student.semester}</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/60">
            <tr>
              <th className="px-4 py-2 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Fee ID</th>
              <th className="px-4 py-2 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Due Date</th>
              <th className="px-4 py-2 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Amount</th>
              <th className="px-4 py-2 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Paid</th>
              <th className="px-4 py-2 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Method</th>
              <th className="px-4 py-2 text-left text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-b border-app last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-app">{h.id}</td>
                <td className="px-4 py-3 text-app">{h.dueDate}</td>
                <td className="px-4 py-3 text-app">{fmt(h.amount)}</td>
                <td className="px-4 py-3 text-emerald-600 font-bold">{fmt(h.paid)}</td>
                <td className="px-4 py-3 text-app">{h.method}</td>
                <td className="px-4 py-3 text-app">{h.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentTracking;

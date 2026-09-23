import { useState } from "react";
import { CheckCircle2, XCircle, FileText, Wallet } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import StatusBadge from "../../components/common/StatusBadge";
import ExportButtons from "../../components/enterprise/ExportButtons";
import { feeApprovals } from "../../data/enterpriseData";
import { useToast } from "../../context/ToastContext";

const fmt = (n) => `Rs. ${n.toLocaleString()}`;

const Approvals = () => {
  const [rows, setRows] = useState(feeApprovals);
  const { toast } = useToast();

  const act = (id, decision) => {
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, status: decision } : r));
    toast?.(`Payment ${id} marked ${decision}`, { type: "success", title: "Updated" });
  };

  const pending = rows.filter((r) => r.status === "Pending Approval").length;
  const approved = rows.filter((r) => r.status === "Approved").length;
  const rejected = rows.filter((r) => r.status === "Rejected").length;

  return (
    <div>
      <PageHeader title="Fee Approvals" subtitle="Review payment slips uploaded by students" icon="ClipboardCheck" breadcrumb={["Finance", "Approvals"]}
        actions={<ExportButtons title="Fee Approval Queue" columns={[
          { key: "id", label: "ID" }, { key: "student", label: "Student" },
          { key: "amount", label: "Amount" }, { key: "method", label: "Method" },
          { key: "slipUploaded", label: "Slip Date" }, { key: "status", label: "Status" },
        ]} rows={rows} filename="fee_approvals" />}
      />

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard title="Pending"   value={pending}  icon="Clock"        color="amber" />
        <StatCard title="Approved"  value={approved} icon="CheckCircle2" color="emerald" delay={0.05} />
        <StatCard title="Rejected"  value={rejected} icon="XCircle"      color="rose"    delay={0.1} />
      </div>

      <div className="space-y-3">
        {rows.map((a) => (
          <div key={a.id} className="card-base p-4 flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-700">
                <FileText size={20} />
              </div>
              <div>
                <p className="font-bold text-app">{a.student}</p>
                <p className="text-xs text-muted-app font-mono">{a.id}</p>
                <p className="text-xs text-muted-app">Slip uploaded: {a.slipUploaded}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-right">
                <p className="font-bold text-app text-lg">{fmt(a.amount)}</p>
                <p className="text-xs text-muted-app">{a.method}</p>
              </div>
              <StatusBadge status={a.status.replace(" Approval", "")} />
              {a.status === "Pending Approval" && (
                <div className="flex gap-1.5">
                  <button onClick={() => act(a.id, "Approved")} className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-200 text-xs font-bold inline-flex items-center gap-1">
                    <CheckCircle2 size={13} /> Approve
                  </button>
                  <button onClick={() => act(a.id, "Rejected")} className="px-3 py-1.5 rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-200 text-xs font-bold inline-flex items-center gap-1">
                    <XCircle size={13} /> Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Approvals;

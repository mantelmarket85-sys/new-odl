// ============================================================
//  PROVOST — Reports & Analytics
//  Requirement 16: Department/Program/Semester/Section/
//   Submitted/Pending/Examination/Semester/Blocked/Unblocked
//   reports + PDF (printable HTML) & Excel (CSV) export.
//  100% real DB data via api.provost.feeMgmt.report / exportReport
// ============================================================
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { FileDown, FileSpreadsheet, Printer } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

const REPORTS = [
  { kind: "department", label: "Department-wise", icon: "Building2", color: "blue" },
  { kind: "program", label: "Program-wise", icon: "GraduationCap", color: "indigo" },
  { kind: "semester", label: "Semester-wise", icon: "Layers", color: "purple" },
  { kind: "section", label: "Section-wise", icon: "Grid3x3", color: "cyan" },
  { kind: "submitted", label: "Submitted Fees", icon: "CheckCircle2", color: "emerald" },
  { kind: "pending", label: "Pending Fees", icon: "Clock", color: "amber" },
  { kind: "examination", label: "Examination Fees", icon: "FileSpreadsheet", color: "teal" },
  { kind: "semesterfee", label: "Semester Fees", icon: "Wallet", color: "blue" },
  { kind: "blocked", label: "Blocked Students", icon: "UserMinus", color: "rose" },
  { kind: "unblocked", label: "Unblocked Students", icon: "UserCheck", color: "emerald" },
];

const COLOR_BG = {
  blue: "from-blue-500 to-blue-600", indigo: "from-indigo-500 to-indigo-600",
  purple: "from-purple-500 to-purple-600", cyan: "from-cyan-500 to-cyan-600",
  emerald: "from-emerald-500 to-emerald-600", amber: "from-amber-500 to-amber-600",
  teal: "from-teal-500 to-teal-600", rose: "from-rose-500 to-rose-600",
};

const FeeReports = () => {
  const { toast } = useToast();
  const [kind, setKind] = useState("department");
  const [exporting, setExporting] = useState(false);

  const fetcher = useCallback(() => api.provost.feeMgmt.report(kind), [kind]);
  const { data, loading, error, reload } = useApi(fetcher, [kind]);

  const active = REPORTS.find((r) => r.kind === kind);

  const doExport = async (format) => {
    setExporting(true);
    try {
      await api.provost.feeMgmt.exportReport(kind, format);
      toast(`${format === "pdf" ? "Printable (PDF)" : "Excel (CSV)"} export downloaded`, { type: "success" });
    } catch (e) {
      toast(e.message || "Export failed", { type: "error" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Generate and export comprehensive fee reports"
        icon="FileText"
        breadcrumb={["Provost", "Reports"]}
        actions={
          <div className="flex gap-2">
            <button onClick={() => doExport("csv")} disabled={exporting} className="btn-secondary text-sm py-2 px-3 flex items-center gap-2 disabled:opacity-50"><FileSpreadsheet size={14} /> Excel</button>
            <button onClick={() => doExport("pdf")} disabled={exporting} className="btn-primary text-sm py-2 px-3 flex items-center gap-2 disabled:opacity-50"><FileDown size={14} /> PDF</button>
          </div>
        }
      />

      {/* Report type selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {REPORTS.map((r, i) => (
          <motion.button key={r.kind} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
            onClick={() => setKind(r.kind)}
            className={`card-base p-4 text-left transition-all ${kind === r.kind ? "ring-2 ring-primary-500 shadow-md" : "hover:shadow-md"}`}>
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${COLOR_BG[r.color] || COLOR_BG.blue} text-white flex items-center justify-center mb-2`}>
              <i className="fas fa-chart-bar text-sm" />
            </div>
            <p className="font-semibold text-app text-sm">{r.label}</p>
          </motion.button>
        ))}
      </div>

      {/* Report table */}
      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
      ) : !data || !data.rows || data.rows.length === 0 ? (
        <EmptyState icon="FileText" title="No data for this report" description="There are no records for the selected report type." />
      ) : (
        <div className="card-base overflow-hidden">
          <div className="px-5 py-4 border-b border-app flex items-center justify-between">
            <h3 className="font-display font-bold text-app">{data.title || active?.label}</h3>
            <span className="text-xs text-muted-app">{data.rows.length} row(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-app text-xs uppercase tracking-wide border-b border-app bg-app-subtle">
                  {(data.columns || []).map((c, i) => (
                    <th key={i} className={`py-3 px-4 ${i > 0 ? "text-right" : ""}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, ri) => (
                  <tr key={ri} className="border-b border-app/40 last:border-0 hover:bg-app-subtle/50">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`py-3 px-4 ${ci === 0 ? "font-semibold text-app" : "text-right text-muted-app"}`}>
                        {typeof cell === "number" && ci > 0 && data.columns?.[ci]?.includes("Rs.")
                          ? `Rs. ${Number(cell).toLocaleString("en-PK")}`
                          : String(cell ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeeReports;

import { useState, useMemo } from "react";
import PageHeader from "../../components/common/PageHeader";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import { Download, BarChart3, TrendingUp, Users, GraduationCap, BookOpen, FileSpreadsheet, Search, Printer, FileText } from "lucide-react";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";

const DIST_COLORS = ["#10b981", "#3b82f6", "#6366f1", "#f59e0b", "#ec4899", "#ef4444"];
const REPORT_KINDS = [
  { id: "courses", label: "Courses" },
  { id: "faculty", label: "Faculty" },
  { id: "students", label: "Students" },
  { id: "attendance", label: "Attendance" },
  { id: "performance", label: "Performance" },
];

function toCsv(rows) {
  if (!rows || rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const head = cols.join(",");
  const body = rows.map(r => cols.map(c => {
    const v = r[c] ?? "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }).join(",")).join("\n");
  return `${head}\n${body}`;
}

const Reports = () => {
  const { toast } = useToast();
  const { data: analytics, loading, error, reload } = useApi(() => api.coordinator.analytics(), []);
  const [reportKind, setReportKind] = useState("courses");
  const [query, setQuery] = useState("");
  const { data: reportData, loading: rLoading, error: rError, reload: reloadReport } = useApi(() => api.coordinator.report(reportKind), [reportKind]);

  const courseCompletion = analytics?.courseCompletion || [];
  const facultyPerformance = analytics?.facultyPerformance || [];
  const distribution = analytics?.studentDistribution
    ? Object.entries(analytics.studentDistribution).map(([name, value], i) => ({ name, value, color: DIST_COLORS[i % DIST_COLORS.length] }))
    : [];
  const rows = reportData?.rows || [];
  // Client-side search across all columns (real rows from DB).
  const filteredRows = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, query]);

  // Derived KPIs from live analytics
  const totalStudents = distribution.reduce((s, d) => s + d.value, 0);
  const avgCompletion = courseCompletion.length ? Math.round(courseCompletion.reduce((s, c) => s + (c.completion || 0), 0) / courseCompletion.length) : 0;
  const avgAttendance = courseCompletion.length ? Math.round(courseCompletion.reduce((s, c) => s + (c.attendancePct || 0), 0) / courseCompletion.length) : 0;
  const avgPass = facultyPerformance.length ? Math.round(facultyPerformance.reduce((s, f) => s + (f.passRate || 0), 0) / facultyPerformance.length) : 0;

  const downloadCsv = () => {
    const csv = toCsv(filteredRows);
    if (!csv) { toast("No data to export", { type: "warning" }); return; }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coordinator-${reportKind}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${reportKind} report exported (CSV)`, { type: "success" });
  };

  // Build a styled HTML table from the live filtered rows.
  const buildTableHtml = () => {
    if (!filteredRows.length) return "";
    const cols = Object.keys(filteredRows[0]);
    const thead = `<tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>`;
    const tbody = filteredRows
      .map((r) => `<tr>${cols.map((c) => `<td>${String(r[c] ?? "")}</td>`).join("")}</tr>`)
      .join("");
    return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  };

  // Export Excel — a real .xls (Excel-readable HTML spreadsheet) of the live data.
  const downloadExcel = () => {
    if (!filteredRows.length) { toast("No data to export", { type: "warning" }); return; }
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:4px 8px;font-family:Arial;font-size:12px}th{background:#2563eb;color:#fff}</style></head><body>${buildTableHtml()}</body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coordinator-${reportKind}-report.xls`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${reportKind} report exported (Excel)`, { type: "success" });
  };

  // Open a print-ready window (also used for "Save as PDF" via the browser print dialog).
  const openPrintWindow = (autoTitle) => {
    if (!filteredRows.length) { toast("No data to print", { type: "warning" }); return null; }
    const w = window.open("", "_blank");
    if (!w) { toast("Popup blocked — allow popups to print/export PDF", { type: "warning" }); return null; }
    const title = `${analytics?.term || "Current Term"} — ${reportKind.charAt(0).toUpperCase() + reportKind.slice(1)} Report`;
    w.document.write(`<html><head><title>${title}</title><meta charset="utf-8"><style>
      body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#0f172a}
      h1{font-size:18px;margin:0 0 2px} .sub{color:#64748b;font-size:12px;margin-bottom:16px}
      table{border-collapse:collapse;width:100%} th,td{border:1px solid #cbd5e1;padding:6px 10px;font-size:12px;text-align:left}
      th{background:#2563eb;color:#fff} tr:nth-child(even) td{background:#f8fafc}
      .footer{margin-top:16px;font-size:10px;color:#94a3b8}
    </style></head><body>
      <h1>${title}</h1>
      <div class="sub">Course Coordinator · Generated ${new Date().toLocaleString()} · ${filteredRows.length} record(s)</div>
      ${buildTableHtml()}
      <div class="footer">AUST ODL LMS — Course Coordinator Reports & Analytics</div>
    </body></html>`);
    w.document.close();
    w.focus();
    return w;
  };

  const printReport = () => {
    const w = openPrintWindow();
    if (w) setTimeout(() => { w.print(); }, 350);
  };

  const exportPdf = () => {
    // Browser "Save as PDF" via the print dialog of a clean report window.
    const w = openPrintWindow();
    if (w) { setTimeout(() => { w.print(); }, 350); toast("Use the print dialog → Save as PDF", { type: "info" }); }
  };

  return (
    <div>
      <PageHeader title="Academic Analytics & Reports" subtitle={`${analytics?.term || "Current term"} — performance, engagement & assessment analytics`} icon="BarChart3" breadcrumb={["Coordinator", "Reports"]}
        actions={
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadExcel} className="text-sm py-2 px-3 rounded-lg font-semibold bg-emerald-600 text-white hover:bg-emerald-700"><FileSpreadsheet size={14} className="inline mr-1" /> Excel</button>
            <button onClick={downloadCsv} className="text-sm py-2 px-3 rounded-lg font-semibold surface border border-app text-app hover:bg-slate-50 dark:hover:bg-slate-800"><Download size={14} className="inline mr-1" /> CSV</button>
            <button onClick={exportPdf} className="text-sm py-2 px-3 rounded-lg font-semibold bg-rose-600 text-white hover:bg-rose-700"><FileText size={14} className="inline mr-1" /> PDF</button>
            <button onClick={printReport} className="text-sm py-2 px-3 rounded-lg font-semibold bg-slate-700 text-white hover:bg-slate-800"><Printer size={14} className="inline mr-1" /> Print</button>
          </div>
        } />

      {error ? (
        <ErrorState title="Couldn't load analytics" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Students Graded", value: totalStudents, icon: Users, color: "from-blue-500 to-indigo-600" },
              { label: "Avg Pass Rate", value: `${avgPass}%`, icon: GraduationCap, color: "from-emerald-500 to-teal-600" },
              { label: "Avg Attendance", value: `${avgAttendance}%`, icon: TrendingUp, color: "from-purple-500 to-violet-600" },
              { label: "Avg Completion", value: `${avgCompletion}%`, icon: BookOpen, color: "from-amber-500 to-orange-600" },
            ].map((s) => (
              <div key={s.label} className={`bg-gradient-to-br ${s.color} rounded-2xl p-4 text-white`}>
                <s.icon size={20} className="mb-2" />
                <p className="text-2xl font-extrabold">{s.value}</p>
                <p className="text-xs opacity-90">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-5">
            <div className="card-base p-5">
              <h3 className="font-bold text-lg text-app mb-3">Course Completion (%)</h3>
              {courseCompletion.length === 0 ? <EmptyState icon="BookOpen" title="No data" /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={courseCompletion}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-30" />
                    <XAxis dataKey="course" tick={{ fontSize: 10, fill: "currentColor" }} />
                    <YAxis tick={{ fontSize: 11, fill: "currentColor" }} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "none", borderRadius: 12, color: "white" }} />
                    <Bar dataKey="completion" fill="#2563eb" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card-base p-5">
              <h3 className="font-bold text-lg text-app mb-3">Grade Distribution</h3>
              {distribution.length === 0 || totalStudents === 0 ? <EmptyState icon="PieChart" title="No results yet" /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={distribution} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={4}>
                      {distribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card-base p-5 lg:col-span-2">
              <h3 className="font-bold text-lg text-app mb-3">Faculty Performance (Avg % & Pass Rate)</h3>
              {facultyPerformance.length === 0 ? <EmptyState icon="UserCog" title="No data" /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={facultyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-30" />
                    <XAxis dataKey="teacher" tick={{ fontSize: 10, fill: "currentColor" }} />
                    <YAxis tick={{ fontSize: 11, fill: "currentColor" }} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "none", borderRadius: 12, color: "white" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="avgPercent" name="Avg %" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="passRate" name="Pass %" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}

      {/* Tabular report with CSV export */}
      <div className="card-base overflow-hidden">
        <div className="px-5 py-4 border-b border-app flex flex-wrap items-center gap-2">
          <FileSpreadsheet size={18} className="text-primary-600" />
          <h3 className="font-bold text-app">Detailed Report</h3>
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rows…"
              className="pl-8 pr-3 py-1.5 rounded-lg text-xs surface border border-app text-app w-44 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {REPORT_KINDS.map(k => (
            <button key={k.id} onClick={() => { setReportKind(k.id); setQuery(""); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${reportKind === k.id ? "bg-primary-600 text-white" : "surface border border-app text-app hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
              {k.label}
            </button>
          ))}
        </div>
        {rError ? <div className="p-5"><ErrorState title="Couldn't load report" description={rError} onRetry={reloadReport} /></div>
          : rLoading ? <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          : rows.length === 0 ? <div className="p-5"><EmptyState icon="FileSpreadsheet" title="No rows" description="This report has no data for the current term." /></div>
          : filteredRows.length === 0 ? <div className="p-5"><EmptyState icon="Search" title="No matches" description={`No rows match "${query}".`} /></div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-app">
                  <tr>
                    {Object.keys(filteredRows[0]).map(c => <th key={c} className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-app">{c}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      {Object.keys(filteredRows[0]).map(c => <td key={c} className="px-4 py-2.5 text-app">{String(r[c] ?? "—")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 text-xs text-muted-app border-t border-app">{filteredRows.length} of {rows.length} record(s)</div>
            </div>
          )}
      </div>
    </div>
  );
};

export default Reports;

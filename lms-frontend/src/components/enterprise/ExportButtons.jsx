import { FileSpreadsheet, FileText, Download } from "lucide-react";
import { useToast } from "../../context/ToastContext";

/* =========================================================================
 * <ExportButtons /> — paired PDF + Excel exporters.
 *
 * Both exports produce *identical* structures: the same column order,
 * the same row data, the same title.  Excel is generated as a CSV (Excel
 * opens it natively); PDF is generated client-side via window.print on a
 * popup window that mirrors the same table — guarantees structural parity.
 *
 * Props:
 *   title:   string                       — report title
 *   columns: [{ key, label }]             — column definitions
 *   rows:    [{ ... }]                    — data
 *   filename?: string                     — base filename without extension
 * ======================================================================= */
const ExportButtons = ({ title = "Report", columns = [], rows = [], filename }) => {
  const { toast } = useToast();
  const baseName = (filename || title).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  /* ---------- CSV (Excel-compatible) ---------- */
  const exportExcel = () => {
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.map((c) => esc(c.label)).join(",");
    const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(",")).join("\n");
    const csv = `${title}\n\n${header}\n${body}\n`;

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast?.(`Excel export ready: ${baseName}.csv`, { type: "success", title: "Export Complete" });
  };

  /* ---------- PDF (via print dialog) ---------- */
  const exportPDF = () => {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) {
      toast?.("Popup blocked — please allow popups to export PDF", { type: "error", title: "Export Blocked" });
      return;
    }
    const head = columns.map((c) => `<th>${c.label}</th>`).join("");
    const body = rows.map((r) =>
      `<tr>${columns.map((c) => `<td>${r[c.key] == null ? "" : String(r[c.key])}</td>`).join("")}</tr>`
    ).join("");

    win.document.write(`<!doctype html>
<html><head><meta charset="utf-8" /><title>${title}</title>
<style>
  *{box-sizing:border-box;font-family:'Segoe UI',Arial,Helvetica,sans-serif}
  body{margin:24px;color:#0f172a}
  h1{font-size:20px;margin:0 0 4px;font-weight:800}
  .meta{font-size:11px;color:#64748b;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
  th{background:#f1f5f9;font-size:10px;letter-spacing:0.05em;text-transform:uppercase}
  tr:nth-child(even) td{background:#f8fafc}
  .brand{display:flex;align-items:center;gap:8px;border-bottom:2px solid #1e3a8a;padding-bottom:8px;margin-bottom:8px}
  .brand b{color:#1e3a8a;font-size:14px}
  @media print{ body{margin:12mm} }
</style></head><body>
<div class="brand"><b>AUST · Open & Distance Learning</b> <span style="margin-left:auto;font-size:10px;color:#64748b">Enterprise LMS Report</span></div>
<h1>${title}</h1>
<div class="meta">Generated: ${new Date().toLocaleString()} · Records: ${rows.length}</div>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<script>window.onload=()=>{setTimeout(()=>window.print(),300)};</script>
</body></html>`);
    win.document.close();
    toast?.("PDF export window opened", { type: "success", title: "Export Ready" });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={exportPDF}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-950/50"
      >
        <FileText size={13} /> Export PDF
      </button>
      <button
        onClick={exportExcel}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-100 dark:hover:bg-emerald-950/50"
      >
        <FileSpreadsheet size={13} /> Export Excel
      </button>
    </div>
  );
};

export const QuickDownload = ({ onClick, label = "Download" }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-app text-app hover:bg-slate-100 dark:hover:bg-slate-800"
  >
    <Download size={13} /> {label}
  </button>
);

export default ExportButtons;

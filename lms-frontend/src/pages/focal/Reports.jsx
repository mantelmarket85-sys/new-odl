import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, ClipboardList, CalendarCheck, FileText, HelpCircle, GraduationCap,
  Layers, BookOpen, Users, Building2, TrendingUp, Search, Filter, Download,
  RefreshCw, X, FileDown, Printer,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Badge from "../../components/common/Badge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import { useToast } from "../../context/ToastContext";

/* =========================================================================
 * Focal Person → Reports & Analytics  (Requirement #5 — complete redesign)
 * Backed by GET /lms/academic/focal/reports2/:tab  with Program / Semester /
 * Section filters. 10 professional report tabs, real-time data only.
 * ======================================================================= */

// Cell renderers ----------------------------------------------------------
const pct = (v) => <span className="font-mono">{v ?? 0}%</span>;
const statusBadge = (v) => {
  const map = { ENROLLED: "emerald", GRADED: "emerald", SUBMITTED: "blue", PENDING: "amber", WITHDRAWN: "rose", DROPPED: "slate" };
  return <Badge color={map[v] || "slate"}>{v}</Badge>;
};
const gradeBadge = (v) => <Badge color={["A", "A-", "B+", "B"].includes(v) ? "emerald" : v === "F" ? "rose" : "amber"}>{v || "—"}</Badge>;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
const num = (v) => <span className="font-mono">{v ?? "—"}</span>;
const cgpaCell = (v) => <span className={`font-mono font-bold ${v >= 3 ? "text-emerald-600 dark:text-emerald-400" : v >= 2 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>{Number(v ?? 0).toFixed(2)}</span>;

// Per-tab definitions: icon, label, columns, KPI builder ------------------
const TABS = [
  {
    id: "enrollment", label: "A. Enrollment", icon: ClipboardList,
    cols: [
      { k: "roll", h: "Roll #", mono: true }, { k: "student", h: "Student", bold: true },
      { k: "program", h: "Program" }, { k: "semester", h: "Sem" }, { k: "section", h: "Sec" },
      { k: "course", h: "Course" }, { k: "teacher", h: "Teacher" },
      { k: "status", h: "Status", render: statusBadge }, { k: "term", h: "Term" },
      { k: "registeredAt", h: "Registered", render: fmtDate },
    ],
    kpis: (s) => [
      { title: "Registrations", value: s.total ?? 0, icon: "ClipboardList", color: "blue" },
      { title: "Enrolled", value: s.enrolled ?? 0, icon: "CheckCircle2", color: "emerald" },
      { title: "Students", value: s.students ?? 0, icon: "Users", color: "violet" },
      { title: "Withdrawn", value: s.withdrawn ?? 0, icon: "AlertCircle", color: "amber" },
    ],
  },
  {
    id: "attendance", label: "B. Attendance", icon: CalendarCheck,
    cols: [
      { k: "roll", h: "Roll #", mono: true }, { k: "student", h: "Student", bold: true },
      { k: "program", h: "Program" }, { k: "semester", h: "Sem" }, { k: "section", h: "Sec" },
      { k: "course", h: "Course" }, { k: "teacher", h: "Teacher" },
      { k: "present", h: "Present", render: num }, { k: "total", h: "Total", render: num },
      { k: "attendancePct", h: "Attendance", render: pct },
    ],
    kpis: (s) => [
      { title: "Records", value: s.records ?? 0, icon: "ClipboardList", color: "blue" },
      { title: "Avg Attendance", value: `${s.avgAttendance ?? 0}%`, icon: "TrendingUp", color: "emerald" },
      { title: "Below 75%", value: s.below75 ?? 0, icon: "AlertCircle", color: "rose" },
      { title: "—", value: "", icon: "CalendarCheck", color: "violet", hide: true },
    ],
  },
  {
    id: "assignment", label: "C. Assignment", icon: FileText,
    cols: [
      { k: "roll", h: "Roll #", mono: true }, { k: "student", h: "Student", bold: true },
      { k: "program", h: "Program" }, { k: "semester", h: "Sem" }, { k: "section", h: "Sec" },
      { k: "course", h: "Course" }, { k: "teacher", h: "Teacher" }, { k: "title", h: "Assignment" },
      { k: "status", h: "Status", render: statusBadge },
      { k: "marks", h: "Marks", render: (v, r) => <span className="font-mono">{v != null ? `${v}/${r.total ?? "?"}` : "—"}</span> },
      { k: "submissionDate", h: "Submitted", render: fmtDate },
    ],
    kpis: (s) => [
      { title: "Submissions", value: s.total ?? 0, icon: "FileText", color: "blue" },
      { title: "Graded", value: s.graded ?? 0, icon: "CheckCircle2", color: "emerald" },
      { title: "Submitted", value: s.submitted ?? 0, icon: "ClipboardList", color: "violet" },
      { title: "Pending", value: s.pending ?? 0, icon: "AlertCircle", color: "amber" },
    ],
  },
  {
    id: "quizzes", label: "D. Quizzes", icon: HelpCircle,
    cols: [
      { k: "roll", h: "Roll #", mono: true }, { k: "student", h: "Student", bold: true },
      { k: "program", h: "Program" }, { k: "semester", h: "Sem" }, { k: "section", h: "Sec" },
      { k: "course", h: "Course" }, { k: "teacher", h: "Teacher" }, { k: "title", h: "Quiz" },
      { k: "status", h: "Status", render: statusBadge },
      { k: "obtained", h: "Score", render: (v, r) => <span className="font-mono">{v != null ? `${v}/${r.total ?? "?"}` : "—"}</span> },
      { k: "submittedAt", h: "Submitted", render: fmtDate },
    ],
    kpis: (s) => [
      { title: "Attempts", value: s.total ?? 0, icon: "HelpCircle", color: "blue" },
      { title: "Graded", value: s.graded ?? 0, icon: "CheckCircle2", color: "emerald" },
      { title: "Submitted", value: s.submitted ?? 0, icon: "ClipboardList", color: "violet" },
      { title: "Pending", value: s.pending ?? 0, icon: "AlertCircle", color: "amber" },
    ],
  },
  {
    id: "midterm", label: "E. Mid-Term", icon: GraduationCap,
    cols: [
      { k: "roll", h: "Roll #", mono: true }, { k: "student", h: "Student", bold: true },
      { k: "program", h: "Program" }, { k: "semester", h: "Sem" }, { k: "section", h: "Sec" },
      { k: "course", h: "Course" }, { k: "teacher", h: "Teacher" },
      { k: "marks", h: "Marks", render: (v, r) => <span className="font-mono">{v ?? "—"}/{r.total ?? 100}</span> },
      { k: "grade", h: "Grade", render: gradeBadge },
    ],
    kpis: (s) => [
      { title: "Mid-Term Records", value: s.total ?? 0, icon: "GraduationCap", color: "blue" },
      { title: "—", value: "", hide: true }, { title: "—", value: "", hide: true }, { title: "—", value: "", hide: true },
    ],
  },
  {
    id: "semester", label: "F. Semester", icon: Layers,
    cols: [
      { k: "semester", h: "Semester", bold: true }, { k: "students", h: "Students", render: num },
      { k: "results", h: "Results", render: num }, { k: "avgPercent", h: "Avg %", render: pct },
      { k: "avgGPA", h: "Avg GPA", render: cgpaCell }, { k: "passRate", h: "Pass Rate", render: pct },
    ],
    kpis: (s) => [
      { title: "Semesters", value: s.semesters ?? 0, icon: "Layers", color: "blue" },
      { title: "—", value: "", hide: true }, { title: "—", value: "", hide: true }, { title: "—", value: "", hide: true },
    ],
  },
  {
    id: "course", label: "G. Course", icon: BookOpen,
    cols: [
      { k: "code", h: "Code", mono: true }, { k: "course", h: "Course", bold: true },
      { k: "program", h: "Program" }, { k: "semester", h: "Sem" }, { k: "teacher", h: "Teacher" },
      { k: "students", h: "Students", render: num }, { k: "published", h: "Published", render: num },
      { k: "avgPercent", h: "Avg %", render: pct }, { k: "passRate", h: "Pass Rate", render: pct },
    ],
    kpis: (s) => [
      { title: "Courses", value: s.courses ?? 0, icon: "BookOpen", color: "blue" },
      { title: "—", value: "", hide: true }, { title: "—", value: "", hide: true }, { title: "—", value: "", hide: true },
    ],
  },
  {
    id: "section", label: "H. Section", icon: Users,
    cols: [
      { k: "section", h: "Section", bold: true }, { k: "students", h: "Students", render: num },
      { k: "courses", h: "Courses", render: num }, { k: "programs", h: "Programs" },
      { k: "enrolledRegistrations", h: "Enrollments", render: num },
    ],
    kpis: (s) => [
      { title: "Sections", value: s.sections ?? 0, icon: "Users", color: "blue" },
      { title: "—", value: "", hide: true }, { title: "—", value: "", hide: true }, { title: "—", value: "", hide: true },
    ],
  },
  {
    id: "program", label: "I. Program", icon: Building2,
    cols: [
      { k: "program", h: "Program", bold: true }, { k: "programTitle", h: "Title" },
      { k: "students", h: "Students", render: num }, { k: "courses", h: "Courses", render: num },
      { k: "sections", h: "Sections", render: num }, { k: "enrolledRegistrations", h: "Enrollments", render: num },
    ],
    kpis: (s) => [
      { title: "Programs", value: s.programs ?? 0, icon: "Building2", color: "blue" },
      { title: "—", value: "", hide: true }, { title: "—", value: "", hide: true }, { title: "—", value: "", hide: true },
    ],
  },
  {
    id: "performance", label: "J. Performance", icon: TrendingUp,
    cols: [
      { k: "roll", h: "Roll #", mono: true }, { k: "student", h: "Student", bold: true },
      { k: "program", h: "Program" }, { k: "semester", h: "Sem" }, { k: "section", h: "Sec" },
      { k: "cgpa", h: "CGPA", render: cgpaCell }, { k: "gpa", h: "GPA", render: cgpaCell },
      { k: "avgPercent", h: "Avg %", render: pct }, { k: "attendancePct", h: "Attend", render: pct },
      { k: "assignmentPerf", h: "Asg %", render: pct }, { k: "quizPerf", h: "Quiz %", render: pct },
      { k: "midAvg", h: "Mid", render: num }, { k: "finalAvg", h: "Final", render: num },
    ],
    kpis: (s) => [
      { title: "Students", value: s.students ?? 0, icon: "Users", color: "blue" },
      { title: "Avg CGPA", value: Number(s.avgCGPA ?? 0).toFixed(2), icon: "TrendingUp", color: "emerald" },
      { title: "Avg Attendance", value: `${s.avgAttendance ?? 0}%`, icon: "CalendarCheck", color: "violet" },
      { title: "Avg %", value: `${s.avgPercent ?? 0}%`, icon: "Award", color: "amber" },
    ],
  },
];

const FilterSelect = ({ label, value, onChange, options, placeholder }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input-base text-sm py-2 min-w-[140px]">
      <option value="all">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{String(o)}</option>)}
    </select>
  </div>
);

const FocalReports = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState("enrollment");
  const [search, setSearch] = useState("");
  const [program, setProgram] = useState("all");
  const [semester, setSemester] = useState("all");
  const [section, setSection] = useState("all");

  // Reset secondary filters when switching tabs (filter options differ).
  useEffect(() => { setSearch(""); }, [tab]);

  const { data, loading, error, reload } = useApi(
    () => api.focal.report2(tab, { program, semester, section }),
    [tab, program, semester, section]
  );

  const def = TABS.find((t) => t.id === tab);
  const rows = useMemo(() => (Array.isArray(data?.rows) ? data.rows : []), [data]);
  const filterOptions = data?.filterOptions || { programs: [], semesters: [], sections: [] };
  const summary = data?.summary || {};

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [rows, search]);

  const kpis = useMemo(() => (def ? def.kpis(summary).filter((k) => !k.hide) : []), [def, summary]);

  const exportCSV = () => {
    if (!filtered.length) { toast?.("Nothing to export", { type: "warning" }); return; }
    const cols = def.cols.map((c) => c.k);
    const headers = def.cols.map((c) => c.h);
    const csvRows = [headers, ...filtered.map((r) => cols.map((c) => r[c]))];
    const csv = csvRows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${tab}_report.csv`;
    a.click();
    toast?.(`${def.label} report exported`, { type: "success" });
  };

  // Plain-text value for a cell (PDF / print use raw data, not the JSX cell).
  const cellText = (r, c) => {
    const v = r[c.k];
    if (v == null || v === "") return "—";
    return String(v);
  };

  // Build a clean, self-contained printable HTML document for the current
  // report — preserves a professional table layout for both Print and
  // Save-as-PDF. Exports the COMPLETE filtered dataset (not just the 200
  // shown on screen).
  const buildPrintableHTML = () => {
    const title = `${def?.label?.replace(/^[A-J]\.\s/, "") || "Report"} Report`;
    const activeFilters = [
      program !== "all" ? `Program: ${program}` : null,
      semester !== "all" ? `Semester: ${semester}` : null,
      section !== "all" ? `Section: ${section}` : null,
      search.trim() ? `Search: ${search.trim()}` : null,
    ].filter(Boolean).join(" · ") || "All records";
    const generatedAt = new Date().toLocaleString();
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const headerCells = def.cols.map((c) => `<th>${esc(c.h)}</th>`).join("");
    const bodyRows = filtered.map((r) =>
      `<tr>${def.cols.map((c) => `<td>${esc(cellText(r, c))}</td>`).join("")}</tr>`
    ).join("");

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1e293b; margin: 24px; }
  .report-head { border-bottom: 3px solid #4f46e5; padding-bottom: 12px; margin-bottom: 16px; }
  .report-head h1 { font-size: 20px; margin: 0 0 4px; color: #312e81; }
  .report-head .org { font-size: 13px; font-weight: 700; color: #4f46e5; margin: 0 0 6px; }
  .report-meta { font-size: 11px; color: #64748b; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
  thead th { background: #4f46e5; color: #fff; text-align: left; padding: 7px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .report-footer { margin-top: 14px; font-size: 10px; color: #94a3b8; text-align: right; }
  @media print { body { margin: 12mm; } thead { display: table-header-group; } }
</style></head>
<body>
  <div class="report-head">
    <p class="org">AUST ODL — Focal Person · Reports &amp; Analytics</p>
    <h1>${esc(title)}</h1>
    <p class="report-meta"><strong>Filters:</strong> ${esc(activeFilters)}</p>
    <p class="report-meta"><strong>Total records:</strong> ${filtered.length} &nbsp;·&nbsp; <strong>Generated:</strong> ${esc(generatedAt)}</p>
  </div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <p class="report-footer">AUST ODL Learning Management System · Confidential</p>
</body></html>`;
  };

  // Open a print window and trigger the dialog. Used by both Print (browser
  // print) and Export PDF (user chooses "Save as PDF" in the dialog).
  const openPrintWindow = (autoPrint, successMsg) => {
    if (!filtered.length) { toast?.("Nothing to export", { type: "warning" }); return; }
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) { toast?.("Please allow pop-ups to use Print / Export PDF.", { type: "error" }); return; }
    win.document.open();
    win.document.write(buildPrintableHTML());
    win.document.close();
    // Wait for content/layout before invoking print.
    const fire = () => {
      win.focus();
      if (autoPrint) win.print();
    };
    if (win.document.readyState === "complete") setTimeout(fire, 250);
    else win.onload = () => setTimeout(fire, 250);
    if (successMsg) toast?.(successMsg, { type: "success" });
  };

  const exportPDF = () => openPrintWindow(true, `${def?.label || "Report"} ready — choose "Save as PDF" in the print dialog.`);
  const printReport = () => openPrintWindow(true);

  const resetFilters = () => { setProgram("all"); setSemester("all"); setSection("all"); setSearch(""); };
  const hasActiveFilter = program !== "all" || semester !== "all" || section !== "all" || search.trim();

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Comprehensive real-time reports across enrollment, attendance, assessments and performance."
        icon="BarChart3"
        breadcrumb={["Focal Person", "Reports & Analytics"]}
        actions={
          <div className="flex gap-2 flex-wrap">
            <button onClick={reload} className="btn-secondary text-sm py-2 px-3 flex items-center gap-2">
              <RefreshCw size={14} /> Refresh
            </button>
            <button onClick={exportCSV} className="btn-secondary text-sm py-2 px-3 flex items-center gap-2">
              <Download size={14} /> Export CSV
            </button>
            <button onClick={exportPDF} className="btn-secondary text-sm py-2 px-3 flex items-center gap-2">
              <FileDown size={14} /> Export PDF
            </button>
            <button onClick={printReport} className="btn-secondary text-sm py-2 px-3 flex items-center gap-2">
              <Printer size={14} /> Print
            </button>
          </div>
        }
      />

      {/* ---- Professional top navigation: 10 tabs ---- */}
      <div className="card-base p-2 mb-4 overflow-x-auto">
        <div className="flex gap-1.5 min-w-max">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl transition whitespace-nowrap ${
                  active
                    ? "bg-primary-600 text-white shadow shadow-primary-500/30"
                    : "text-app hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Filters: Program / Semester / Section + search ---- */}
      <div className="card-base p-4 mb-4">
        <div className="flex items-end gap-3 flex-wrap">
          <FilterSelect label="Program" value={program} onChange={setProgram} options={filterOptions.programs} placeholder="All Programs" />
          <FilterSelect label="Semester" value={semester} onChange={setSemester} options={filterOptions.semesters} placeholder="All Semesters" />
          <FilterSelect label="Section" value={section} onChange={setSection} options={filterOptions.sections} placeholder="All Sections" />
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records…" className="input-base w-full pl-9 text-sm py-2" />
            </div>
          </div>
          {hasActiveFilter && (
            <button onClick={resetFilters} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl border border-app text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X size={13} /> Reset
            </button>
          )}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          {/* KPI strip */}
          {kpis.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {kpis.map((k, i) => (
                <StatCard key={`${tab}-${k.title}-${i}`} title={k.title} value={k.value} icon={k.icon} color={k.color} delay={i * 0.05} />
              ))}
            </div>
          )}

          {/* Data table */}
          <div className="card-base overflow-hidden">
            <div className="px-4 py-3 surface border-b border-app flex items-center justify-between">
              <h3 className="font-bold text-app text-base inline-flex items-center gap-2">
                {def && <def.icon size={16} className="text-primary-600 dark:text-primary-400" />}
                {def?.label?.replace(/^[A-J]\.\s/, "")} Report
              </h3>
              <span className="text-xs text-muted-app inline-flex items-center gap-1">
                <Filter size={11} /> <b className="text-app">{filtered.length}</b> record(s)
              </span>
            </div>
            {filtered.length === 0 ? (
              <div className="p-12 text-center">
                <BarChart3 className="mx-auto mb-3 text-muted-app" size={28} />
                <p className="text-sm text-muted-app">No records match the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="surface border-b border-app">
                    <tr>
                      {def.cols.map((c) => (
                        <th key={c.k} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app whitespace-nowrap">{c.h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {filtered.slice(0, 200).map((r, i) => (
                      <motion.tr
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.01, 0.3) }}
                        className="hover:surface transition-colors"
                      >
                        {def.cols.map((c) => (
                          <td key={c.k} className={`px-3 py-2 text-xs text-app ${c.mono ? "font-mono" : ""} ${c.bold ? "font-bold" : ""}`}>
                            {c.render ? c.render(r[c.k], r) : <span>{String(r[c.k] ?? "—")}</span>}
                          </td>
                        ))}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 200 && (
                  <div className="px-4 py-2 text-center text-xs text-muted-app surface border-t border-app">
                    Showing 200 of {filtered.length} records · Export CSV to view all
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default FocalReports;

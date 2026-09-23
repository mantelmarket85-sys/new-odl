import { useState, useEffect, useMemo } from "react";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import ExportButtons from "../../components/enterprise/ExportButtons";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import Badge from "../../components/common/Badge";
import { Eye, SlidersHorizontal, RotateCcw, FlaskConical, ChevronDown, ChevronRight } from "lucide-react";

/* =========================================================================
 * Universal Focal Person view-only monitor page (live data).
 *   variant = "assignments" | "quizzes" | "midterm" | "finalterm"
 *           | "labtasks" (§4.3) | "results" (§4.4)
 * Backed by GET /focal/assessment-monitor →
 *   { assignments, quizzes, mid, final, results, labTasks, labStudents, filterOptions }
 * ======================================================================= */
const courseCol = { key: "course", label: "Course", render: (v) => <span className="text-xs">{v}</span> };
const teacherCol = { key: "teacher", label: "Teacher" };

const CONFIG = {
  assignments: {
    title: "Assignments Monitor", subtitle: "View-only oversight of all assignments across the department.",
    icon: "FileText", dataKey: "assignments",
    columns: [
      courseCol, teacherCol,
      { key: "count", label: "Assignments", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "submissions", label: "Submissions", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "graded", label: "Graded", render: (v) => <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{v}</span> },
      { key: "pending", label: "Pending", render: (v) => <span className={`font-mono text-xs ${v > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-app"}`}>{v}</span> },
    ],
  },
  quizzes: {
    title: "Quizzes Monitor", subtitle: "View-only oversight of quizzes and attempts.",
    icon: "FileQuestion", dataKey: "quizzes",
    columns: [
      courseCol, teacherCol,
      { key: "count", label: "Quizzes", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "attempts", label: "Attempts", render: (v) => <span className="font-mono text-xs">{v}</span> },
    ],
  },
  midterm: {
    title: "Mid Exams Monitor", subtitle: "View-only oversight of mid-term examination marks entry.",
    icon: "FileEdit", dataKey: "mid",
    columns: [
      courseCol, teacherCol,
      { key: "students", label: "Students", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "entered", label: "Entered", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "pct", label: "Completion", render: (v) => <span className="font-mono text-xs font-bold">{v}%</span> },
    ],
  },
  finalterm: {
    title: "Final Exams Monitor", subtitle: "View-only oversight of final-term examination marks entry.",
    icon: "FileCheck2", dataKey: "final",
    columns: [
      courseCol, teacherCol,
      { key: "students", label: "Students", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "entered", label: "Entered", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "pct", label: "Completion", render: (v) => <span className="font-mono text-xs font-bold">{v}%</span> },
    ],
  },
  labtasks: {
    title: "Lab Tasks Monitor", subtitle: "View-only oversight of lab courses only — filter first, then review each student's lab record individually (live).",
    icon: "FlaskConical", dataKey: "labTasks",
    columns: [
      courseCol, teacherCol,
      { key: "program", label: "Program", render: (v) => <span className="text-xs">{v || "—"}</span> },
      { key: "semester", label: "Semester", render: (v) => <span className="text-xs">{v || "—"}</span> },
      { key: "session", label: "Session", render: (v) => <span className="text-xs">{v || "—"}</span> },
      { key: "count", label: "Lab Tasks", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "submissions", label: "Submissions", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "graded", label: "Graded", render: (v) => <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{v}</span> },
      { key: "pending", label: "Pending", render: (v) => <span className={`font-mono text-xs ${v > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-app"}`}>{v}</span> },
    ],
  },
  results: {
    title: "Results Monitor", subtitle: "View-only oversight of published results and pass rates.",
    icon: "Award", dataKey: "results",
    columns: [
      courseCol, teacherCol,
      { key: "program", label: "Program", render: (v) => <span className="text-xs">{v || "—"}</span> },
      { key: "semester", label: "Semester", render: (v) => <span className="text-xs">{v || "—"}</span> },
      { key: "session", label: "Session", render: (v) => <span className="text-xs">{v || "—"}</span> },
      { key: "batch", label: "Batch", render: (v) => <span className="text-xs">{v || "—"}</span> },
      { key: "students", label: "Students", render: (v) => <span className="font-mono text-xs">{v}</span> },
      { key: "published", label: "Published", render: (v) => <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{v}</span> },
      { key: "passRate", label: "Pass Rate", render: (v) => (
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${v >= 70 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : v >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"}`}>{v}%</span>
      )},
    ],
  },
};

/* ---------------------------------------------------------------------------
 * §4.3 / §4.4 — SMART FILTERS
 * Filter descriptors per variant. `type: "select"` pulls its options from the
 * server-provided filterOptions; `type: "text"` is a live contains-match.
 * ------------------------------------------------------------------------- */
const LAB_FILTERS = [
  { key: "department", label: "Department", type: "select", opt: "departments" },
  { key: "program", label: "Program", type: "select", opt: "programs", dependsOn: "department" },
  { key: "semester", label: "Semester", type: "select", opt: "semesters", dependsOn: "program" },
  { key: "session", label: "Session", type: "select", opt: "sessions" },
  { key: "batch", label: "Batch", type: "select", opt: "batches" },
  { key: "course", label: "Course", type: "select", opt: "courses" },
  { key: "name", label: "Name", type: "text", placeholder: "Student name…" },
  { key: "roll", label: "Roll No", type: "text", placeholder: "Roll number…" },
  { key: "email", label: "Email", type: "text", placeholder: "Email…" },
  { key: "phone", label: "Phone Number", type: "text", placeholder: "Phone…" },
  { key: "cnic", label: "CNIC", type: "text", placeholder: "CNIC…" },
];

const RESULT_FILTERS = [
  { key: "program", label: "Program", type: "select", opt: "programs" },
  { key: "semester", label: "Semester", type: "select", opt: "semesters" },
  { key: "course", label: "Course", type: "select", opt: "courses" },
  { key: "session", label: "Session", type: "select", opt: "sessions" },
  { key: "batch", label: "Batch", type: "select", opt: "batches" },
];

const FILTERS_BY_VARIANT = { labtasks: LAB_FILTERS, results: RESULT_FILTERS };

const emptyFilters = (defs) => defs.reduce((acc, f) => { acc[f.key] = ""; return acc; }, {});

/* Module-scope so React keeps the same component identity across renders
   (an in-body definition would remount the inputs and steal focus). */
const FilterPanel = ({ defs, values, options, onChange, onReset, activeCount, resultCount, totalCount }) => (
  <div className="card-base p-4 mb-4">
    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-center justify-center">
          <SlidersHorizontal size={14} className="text-blue-600 dark:text-blue-300" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-app">Smart Filters</h3>
          <p className="text-[11px] text-muted-app">Narrow the data down before reviewing the results.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {activeCount > 0 && <Badge color="blue" size="sm">{activeCount} active</Badge>}
        <Badge color="slate" size="sm">{resultCount} / {totalCount}</Badge>
        <button
          type="button"
          onClick={onReset}
          disabled={activeCount === 0}
          className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {defs.map((f) => (
        <div key={f.key}>
          <label className="block text-[11px] font-semibold text-secondary-app mb-1">{f.label}</label>
          {f.type === "select" ? (
            <select
              value={values[f.key] || ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              disabled={!!f.dependsOn && !values[f.dependsOn]}
              className="input-base py-2 text-xs w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{f.dependsOn && !values[f.dependsOn] ? `Select ${f.dependsOn[0].toUpperCase()}${f.dependsOn.slice(1)} first` : `All ${f.label}s`}</option>
              {(options[f.opt] || []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              value={values[f.key] || ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder={f.placeholder || f.label}
              className="input-base py-2 text-xs w-full"
            />
          )}
        </div>
      ))}
    </div>
  </div>
);

const STATUS_COLOR = {
  GRADED: "emerald",
  SUBMITTED: "blue",
  LATE: "amber",
  RESUBMIT: "orange",
  "NOT SUBMITTED": "rose",
};

/* §4.3 — one expandable panel per student, showing that student's lab
   details for the course individually (task-by-task). */
const StudentLabCard = ({ row, open, onToggle }) => (
  <div className="card-base overflow-hidden">
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-900/60 flex items-center justify-center shrink-0">
          <FlaskConical size={15} className="text-cyan-600 dark:text-cyan-300" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-app truncate">
            {row.name} <span className="font-mono text-xs text-muted-app">({row.roll})</span>
          </p>
          <p className="text-[11px] text-muted-app truncate">
            {row.course}
            {row.program ? ` · ${row.programShortForm || row.program}` : ""}
            {row.semester ? ` · ${row.semester}` : ""}
            {row.session ? ` · ${row.session}` : ""}
            {row.batch ? ` · Batch ${row.batch}` : ""}
            {row.section ? ` · Sec ${row.section}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge color="slate" size="sm">{row.submitted}/{row.tasks} submitted</Badge>
        <Badge color="emerald" size="sm">{row.graded} graded</Badge>
        {row.pending > 0 && <Badge color="rose" size="sm">{row.pending} missing</Badge>}
        <Badge color={row.percent >= 70 ? "emerald" : row.percent >= 50 ? "amber" : "rose"} size="sm">
          {row.percent}%
        </Badge>
        {open ? <ChevronDown size={16} className="text-muted-app" /> : <ChevronRight size={16} className="text-muted-app" />}
      </div>
    </button>

    {open && (
      <div className="border-t border-app p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          {[
            ["Roll No", row.roll],
            ["Registration", row.registrationNumber],
            ["Email", row.email],
            ["Phone", row.phone],
            ["CNIC", row.cnic],
            ["Department", row.department],
            ["Program", row.program],
            ["Semester", row.semester],
            ["Session", row.session],
            ["Batch", row.batch],
            ["Teacher", row.teacher],
          ].map(([k, v]) => (
            <div key={k} className="surface rounded-lg p-2 border border-app">
              <p className="text-[10px] uppercase tracking-wide text-muted-app font-semibold">{k}</p>
              <p className="text-app text-xs font-medium break-words">{v || "—"}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-secondary-app mb-2">
            Lab Task Detail · {row.obtained}/{row.totalMarks} marks
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted-app border-b border-app">
                  <th className="py-2 pr-3 font-semibold">Lab Task</th>
                  <th className="py-2 pr-3 font-semibold">Due Date</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Marks</th>
                  <th className="py-2 pr-3 font-semibold">Submitted</th>
                  <th className="py-2 font-semibold">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {(row.details || []).length === 0 ? (
                  <tr><td colSpan={6} className="py-3 text-muted-app">No lab tasks created for this course yet.</td></tr>
                ) : (
                  (row.details || []).map((d) => (
                    <tr key={d.labTaskId} className="border-b border-app/60 last:border-0">
                      <td className="py-2 pr-3 text-app">{d.title}</td>
                      <td className="py-2 pr-3 text-muted-app font-mono">{d.dueDate || "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge color={STATUS_COLOR[d.status] || "slate"} size="sm">{d.status}</Badge>
                      </td>
                      <td className="py-2 pr-3 font-mono text-app">
                        {d.marks != null ? `${d.marks} / ${d.totalMarks}` : `— / ${d.totalMarks}`}
                      </td>
                      <td className="py-2 pr-3 text-muted-app font-mono">
                        {d.submittedAt ? new Date(d.submittedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2 text-muted-app">{d.feedback || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}
  </div>
);

const STUDENT_EXPORT_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "department", label: "Department" },
  { key: "roll", label: "Roll No" },
  { key: "course", label: "Course" },
  { key: "program", label: "Program" },
  { key: "semester", label: "Semester" },
  { key: "session", label: "Session" },
  { key: "batch", label: "Batch" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "cnic", label: "CNIC" },
  { key: "tasks", label: "Lab Tasks" },
  { key: "submitted", label: "Submitted" },
  { key: "graded", label: "Graded" },
  { key: "pending", label: "Missing" },
  { key: "obtained", label: "Obtained" },
  { key: "totalMarks", label: "Total" },
  { key: "percent", label: "%" },
];

const contains = (value, needle) =>
  String(value || "").toLowerCase().includes(String(needle || "").trim().toLowerCase());

const AssessmentMonitor = ({ variant }) => {
  const cfg = CONFIG[variant] || CONFIG.assignments;
  const { data, loading, error, reload } = useApi(() => api.focal.assessmentMonitor(), []);
  const [search, setSearch] = useState("");

  const filterDefs = FILTERS_BY_VARIANT[variant] || null;
  const [filters, setFilters] = useState(() => (filterDefs ? emptyFilters(filterDefs) : {}));
  const [expanded, setExpanded] = useState({});

  // Req 2 — all lab-related changes are visible to the Focal Person in real
  // time. The teacher/student lab actions broadcast a 'labtask-monitor' event
  // (emitAll) which every connected Focal client receives; refresh on it.
  useEffect(() => {
    let es;
    try {
      const url = api.focal.eventsUrl && api.focal.eventsUrl();
      if (url) {
        es = new EventSource(url);
        const onChange = () => reload();
        es.addEventListener("labtask-monitor", onChange);
        es.addEventListener("labtask", onChange);
        es.addEventListener("assignment", onChange);
        es.addEventListener("result", onChange);
      }
    } catch (_) { /* SSE optional */ }
    return () => { try { es && es.close(); } catch (_) {} };
  }, [reload]);

  const setFilter = (key, value) => setFilters((f) => ({
    ...f,
    [key]: value,
    ...(key === "department" ? { program: "", semester: "" } : {}),
    ...(key === "program" ? { semester: "" } : {}),
  }));
  const resetFilters = () => setFilters(filterDefs ? emptyFilters(filterDefs) : {});
  const activeCount = filterDefs
    ? filterDefs.filter((f) => String(filters[f.key] || "").trim() !== "").length
    : 0;

  // §4.3 uses the lab-scoped option lists; §4.4 uses the full ones.
  const options = useMemo(() => {
    const fo = data?.filterOptions || {};
    if (variant !== "labtasks") return fo;
    const labRows = data?.labStudents || [];
    const uniq = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    const departmentRows = filters.department ? labRows.filter((r) => r.department === filters.department) : labRows;
    const programRows = filters.program ? departmentRows.filter((r) => r.program === filters.program) : departmentRows;
    return {
      ...(fo.lab || {}),
      departments: uniq(labRows.map((r) => r.department)),
      programs: uniq(departmentRows.map((r) => r.program)),
      semesters: uniq(programRows.map((r) => r.semester)),
    };
  }, [data, variant, filters.department, filters.program]);

  const allRows = data?.[cfg.dataKey] || [];

  /* ---- §4.3 — per-student lab rows, filtered by ALL ten smart filters ---- */
  const labStudentRows = useMemo(() => {
    if (variant !== "labtasks") return [];
    let out = data?.labStudents || [];
    if (filters.department) out = out.filter((r) => r.department === filters.department);
    if (filters.program) out = out.filter((r) => r.program === filters.program);
    if (filters.semester) out = out.filter((r) => r.semester === filters.semester);
    if (filters.session) out = out.filter((r) => r.session === filters.session);
    if (filters.batch) out = out.filter((r) => r.batch === filters.batch);
    if (filters.course) out = out.filter((r) => r.course === filters.course);
    if (filters.name) out = out.filter((r) => contains(r.name, filters.name));
    if (filters.roll) out = out.filter((r) => contains(r.roll, filters.roll) || contains(r.registrationNumber, filters.roll));
    if (filters.email) out = out.filter((r) => contains(r.email, filters.email));
    if (filters.phone) out = out.filter((r) => contains(r.phone, filters.phone));
    if (filters.cnic) out = out.filter((r) => contains(r.cnic, filters.cnic));
    return out;
  }, [data, filters, variant]);

  /* ---- course-level rows (all variants) ---- */
  const rows = useMemo(() => {
    let out = allRows;

    if (variant === "labtasks") {
      // Course-level summary is limited to the courses that survive the filters
      // (which already only ever contain lab courses, server-side).
      if (filters.department) out = out.filter((r) => r.department === filters.department);
      if (filters.program) out = out.filter((r) => r.program === filters.program);
      if (filters.semester) out = out.filter((r) => r.semester === filters.semester);
      if (filters.session) out = out.filter((r) => r.session === filters.session);
      if (filters.course) out = out.filter((r) => r.course === filters.course);
      if (filters.batch) out = out.filter((r) => (r.batches || []).includes(filters.batch));
      // Student-level filters constrain the course list to matching students.
      const studentFilterKeys = ["name", "roll", "email", "phone", "cnic", "batch"];
      if (studentFilterKeys.some((k) => String(filters[k] || "").trim() !== "")) {
        const keep = new Set(labStudentRows.map((r) => r.offeringId));
        out = out.filter((r) => keep.has(r.offeringId));
      }
    } else if (variant === "results") {
      if (filters.program) out = out.filter((r) => r.program === filters.program);
      if (filters.semester) out = out.filter((r) => r.semester === filters.semester);
      if (filters.course) out = out.filter((r) => r.course === filters.course);
      if (filters.session) out = out.filter((r) => r.session === filters.session);
      if (filters.batch) out = out.filter((r) => (r.batches || []).includes(filters.batch));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) => (r.course || "").toLowerCase().includes(q) || (r.teacher || "").toLowerCase().includes(q));
    }
    return out;
  }, [allRows, filters, search, variant, labStudentRows]);

  const showFilters = !!filterDefs;
  const filterResultCount = variant === "labtasks" ? labStudentRows.length : rows.length;
  const filterTotalCount = variant === "labtasks" ? (data?.labStudents || []).length : allRows.length;

  return (
    <div>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        icon={cfg.icon}
        breadcrumb={["Focal Person", "Monitoring", cfg.title.split(" ")[0]]}
        actions={
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60">
            <Eye size={12} /> View Only
          </span>
        }
      />

      {error ? (
        <ErrorState title="Couldn't load data" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          {/* §4.3 / §4.4 — smart filters are applied BEFORE the results below. */}
          {showFilters && (
            <FilterPanel
              defs={filterDefs}
              values={filters}
              options={options}
              onChange={setFilter}
              onReset={resetFilters}
              activeCount={activeCount}
              resultCount={filterResultCount}
              totalCount={filterTotalCount}
            />
          )}

          <div className="card-base p-3 mb-4 flex flex-wrap items-center justify-between gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by course or teacher…"
              className="input-base py-2 text-sm flex-1 min-w-[220px]"
            />
            <ExportButtons title={cfg.title} columns={cfg.columns} rows={rows} filename={variant} />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={cfg.icon}
              title={variant === "labtasks" ? "No lab courses match" : "No data"}
              description={
                variant === "labtasks"
                  ? "Only courses that have a lab component are listed here. Adjust the filters above to widen the search."
                  : "No matching records found."
              }
            />
          ) : (
            <EnterpriseTable columns={cfg.columns} rows={rows} pageSize={10} />
          )}

          {/* §4.3 — after the filters, the lab details for each course are shown
              individually for every student. */}
          {variant === "labtasks" && (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold text-app">Student Lab Details</h3>
                  <p className="text-[11px] text-muted-app">
                    Individual lab record per student, for each lab course that matches the filters above.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge color="slate" size="sm">{labStudentRows.length} student records</Badge>
                  <ExportButtons
                    title="Student Lab Details"
                    columns={STUDENT_EXPORT_COLUMNS}
                    rows={labStudentRows}
                    filename="lab-task-student-details"
                  />
                </div>
              </div>

              {labStudentRows.length === 0 ? (
                <EmptyState
                  icon="FlaskConical"
                  title="No student lab records"
                  description="No students match the current filters, or the matching lab courses have no enrolled students yet."
                />
              ) : (
                <div className="space-y-3">
                  {labStudentRows.slice(0, 200).map((row) => (
                    <StudentLabCard
                      key={row.key}
                      row={row}
                      open={!!expanded[row.key]}
                      onToggle={() => setExpanded((e) => ({ ...e, [row.key]: !e[row.key] }))}
                    />
                  ))}
                  {labStudentRows.length > 200 && (
                    <p className="text-[11px] text-muted-app text-center py-2">
                      Showing the first 200 of {labStudentRows.length} student records — refine the filters to narrow it down.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AssessmentMonitor;

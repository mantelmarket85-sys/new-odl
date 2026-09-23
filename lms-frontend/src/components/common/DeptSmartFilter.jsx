// ============================================================
//  DeptSmartFilter — reusable real-time department smart filter
//  ------------------------------------------------------------
//  Shared by the three university-level single roles that need
//  their entire experience segmented by department WITHOUT any
//  backend / schema / auth changes:
//    • QEC Coordinator
//    • Exam Controller
//    • Provost
//
//  Design goals:
//   - Real-time: selecting a department filters the already-loaded
//     rows client-side instantly (no page reload, no network wait).
//     Pages that also want to hit a scoped endpoint can read the
//     selected value and pass it as a `?department=` query param.
//   - Professional & clean: matches the existing LMS pill/badge UI.
//   - Zero coupling: pure presentational + a pure filter helper, so
//     it does not touch any other module or role.
// ============================================================
import { useMemo } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";

export const ALL_DEPTS = "__ALL__";

// Pure helper — filter an array of rows by the selected department.
// `field` may be a string key or a function (row) => deptName.
// When dept === ALL_DEPTS (or empty) the list is returned unchanged.
export function filterByDept(rows = [], dept = ALL_DEPTS, field = "department") {
  if (!Array.isArray(rows)) return [];
  if (!dept || dept === ALL_DEPTS) return rows;
  const target = String(dept).trim().toLowerCase();
  const read = typeof field === "function" ? field : (r) => (r ? r[field] : undefined);
  return rows.filter((r) => {
    const v = read(r);
    return v != null && String(v).trim().toLowerCase() === target;
  });
}

// Build a clean, sorted, de-duplicated department option list from
// any combination of a filter-options payload and/or the rows.
export function collectDepartments({ options = [], rows = [], field = "department" } = {}) {
  const set = new Set();
  (options || []).forEach((d) => {
    const v = typeof d === "string" ? d : d?.name || d?.department || d?.value;
    if (v && String(v).trim()) set.add(String(v).trim());
  });
  const read = typeof field === "function" ? field : (r) => (r ? r[field] : undefined);
  (rows || []).forEach((r) => {
    const v = read(r);
    if (v && String(v).trim()) set.add(String(v).trim());
  });
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Real-time department smart filter control (pill-style select).
// Props:
//   value        current selected department (ALL_DEPTS = all)
//   onChange     (dept) => void
//   departments  string[] of available department names
//   includeAll   show the "All Departments" option (default true)
//   label        left-hand label (default "Department")
//   compact      smaller footprint
const DeptSmartFilter = ({
  value = ALL_DEPTS,
  onChange,
  departments = [],
  includeAll = true,
  label = "Department",
  compact = false,
  className = "",
}) => {
  const opts = useMemo(() => {
    const clean = [...new Set((departments || []).filter(Boolean).map((d) => String(d).trim()))].sort(
      (a, b) => a.localeCompare(b),
    );
    return includeAll ? [ALL_DEPTS, ...clean] : clean;
  }, [departments, includeAll]);

  const displayLabel = (v) => (v === ALL_DEPTS ? "All Departments" : v);

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 ${
        compact ? "px-2 py-1" : "px-3 py-2"
      } shadow-sm ${className}`}
      data-role-filter="department"
    >
      <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <Building2 className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        <span className={`font-semibold ${compact ? "text-[11px]" : "text-xs"}`}>{label}</span>
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange && onChange(e.target.value)}
          className={`appearance-none bg-transparent pr-6 font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer ${
            compact ? "text-[11px]" : "text-sm"
          }`}
          aria-label="Filter by department"
        >
          {opts.map((o) => (
            <option key={o} value={o}>
              {displayLabel(o)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
      </div>
    </div>
  );
};

export default DeptSmartFilter;

// Small helper badge for showing the active scope inline in headers.
export const DeptScopeBadge = ({ dept }) => {
  const all = !dept || dept === ALL_DEPTS;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        all
          ? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700"
          : "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/60"
      }`}
    >
      {all ? "All Departments" : dept}
      {!all && <Check className="w-3 h-3" />}
    </span>
  );
};

import { Filter, RotateCcw } from "lucide-react";

/* =========================================================================
 * <FilterPanel /> — universal filter bar used across enterprise pages.
 *
 * Props:
 *   filters: { key, label, options:[{value,label}], value }[]
 *   onChange: (key, value) => void
 *   onReset: () => void
 *   extra?: react-node     (right-side actions like ExportButtons)
 * ======================================================================= */
const FilterPanel = ({ filters = [], onChange, onReset, extra }) => {
  return (
    <div className="card-base p-4 mb-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-end justify-between">
        <div className="flex flex-wrap gap-3 flex-1">
          <div className="flex items-center gap-2 text-app font-bold text-sm">
            <Filter size={16} className="text-primary-600 dark:text-primary-400" />
            Filters
          </div>
          {filters.map((f) => (
            <div key={f.key} className="min-w-[150px] flex-1 sm:flex-initial">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">
                {f.label}
              </label>
              <select
                value={f.value ?? "all"}
                onChange={(e) => onChange?.(f.key, e.target.value)}
                className="input-base py-2 px-2.5 text-sm w-full"
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {onReset && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-app text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}
          {extra}
        </div>
      </div>
    </div>
  );
};

/* Helper: build a standard set of LMS filter definitions with sane defaults.
   Pass current values; returned array is ready to feed <FilterPanel />. */
export const buildLmsFilters = (values = {}) => ([
  { key: "semester", label: "Semester", value: values.semester, options: [
    { value: "all", label: "All Semesters" },
    { value: "1", label: "Semester 1" },
    { value: "2", label: "Semester 2" },
    { value: "3", label: "Semester 3" },
    { value: "4", label: "Semester 4" },
  ]},
  { key: "course", label: "Course", value: values.course, options: [
    { value: "all", label: "All Courses" },
    { value: "CS101", label: "CS101 — Introduction to Computing" },
    { value: "CS102", label: "CS102 — Programming Fundamentals" },
    { value: "CS201", label: "CS201 — Object Oriented Programming" },
    { value: "CS202", label: "CS202 — Data Structures" },
    { value: "CS301", label: "CS301 — Database Systems" },
    { value: "CS302", label: "CS302 — Operating Systems" },
    { value: "CS401", label: "CS401 — Web Engineering" },
    { value: "CS402", label: "CS402 — Software Engineering" },
  ]},
  { key: "section", label: "Section", value: values.section, options: [
    { value: "all", label: "All Sections" },
    { value: "A", label: "Section A" },
    { value: "B", label: "Section B" },
    { value: "C", label: "Section C" },
  ]},
  { key: "session", label: "Session", value: values.session, options: [
    { value: "all", label: "All Sessions" },
    { value: "fall-2023", label: "Fall 2023" },
    { value: "spring-2024", label: "Spring 2024" },
    { value: "fall-2024", label: "Fall 2024" },
    { value: "spring-2025", label: "Spring 2025" },
  ]},
  { key: "program", label: "Program", value: values.program, options: [
    { value: "all", label: "All Programs" },
    { value: "ADCS", label: "ADCS — Associate Degree CS" },
    { value: "BSCS", label: "BSCS" },
    { value: "BSSE", label: "BSSE" },
  ]},
]);

export default FilterPanel;

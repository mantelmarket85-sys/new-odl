// ============================================================
//  CascadeFilters — reusable cascading smart-filter bar
//  ------------------------------------------------------------
//  Implements the "cascading smart filters" required across the
//  Exam Controller modules (LMS update spec §1):
//     Department  (select first)
//       └─ Program      (only programs of the selected department)
//            └─ Semester (only semesters of the selected program)
//     + optional Session / Batch / Section / Course selects.
//
//  Data source: api.exam.filters() which already returns
//     { departments, programs[{code,name,shortForm,department,totalSemesters}],
//       semestersByProgram, sections, courses, sessions }
//
//  Design goals (per spec): professional, clean, user-friendly,
//  fully functional cascading behaviour with zero backend/schema
//  changes. Pure presentational + controlled value object so it is
//  reusable and does not couple to any single module.
// ============================================================
import { useEffect, useMemo } from "react";
import { Building2, GraduationCap, Layers, CalendarRange, Users, BookOpen, Filter, RotateCcw } from "lucide-react";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

export const ALL = "all";

// Build a clean empty value object for the enabled fields.
export function emptyCascade() {
  return { department: ALL, program: ALL, semester: ALL, session: ALL, batch: ALL, section: ALL, course: ALL };
}

/**
 * Filter an array of rows against a cascade value object.
 * `map` maps a row -> { department, program, semester, session, batch, section, course }.
 * Any field left at ALL is ignored. Comparison is case-insensitive on strings.
 */
export function applyCascade(rows = [], value = {}, map = (r) => r) {
  if (!Array.isArray(rows)) return [];
  const eq = (a, b) => a != null && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  return rows.filter((row) => {
    const m = map(row) || {};
    for (const key of ["department", "program", "semester", "session", "batch", "section", "course"]) {
      const sel = value[key];
      if (!sel || sel === ALL) continue;
      const rv = m[key];
      if (rv == null) return false;
      if (key === "semester") { if (String(rv) !== String(sel)) return false; }
      else if (!eq(rv, sel)) return false;
    }
    return true;
  });
}

const Select = ({ icon: Icon, label, value, onChange, options, disabled, placeholderAll }) => (
  <div className={`flex flex-col gap-1 min-w-[140px] ${disabled ? "opacity-50" : ""}`}>
    <label className="text-[10px] uppercase font-bold text-muted-app flex items-center gap-1">
      <Icon size={11} /> {label}
    </label>
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="input-base text-sm"
    >
      <option value={ALL}>{placeholderAll}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

/**
 * Props:
 *   value     controlled value object (use emptyCascade())
 *   onChange  (nextValue) => void
 *   fields    array of which selects to show, in order. Default:
 *             ["department","program","semester"]. Supported:
 *             department | program | semester | session | batch | section | course
 *   extraRows optional rows used to enrich department/session/batch options
 *             (e.g. so historical values not in the current term still show).
 *   rowMap    map fn for extraRows -> { department, session, batch }
 */
const CascadeFilters = ({
  value,
  onChange,
  fields = ["department", "program", "semester"],
  extraRows = [],
  rowMap = (r) => r,
  className = "",
  showReset = true,
}) => {
  const { data } = useApi(() => api.exam.filters(), []);
  const v = value || emptyCascade();

  const departments = useMemo(() => {
    const set = new Set((data?.departments || []).filter(Boolean).map((d) => String(d).trim()));
    (extraRows || []).forEach((r) => { const d = rowMap(r)?.department; if (d) set.add(String(d).trim()); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data, extraRows, rowMap]);

  const programs = useMemo(() => data?.programs || [], [data]);
  const semestersByProgram = useMemo(() => data?.semestersByProgram || {}, [data]);
  const sections = useMemo(() => data?.sections || [], [data]);
  const courses = useMemo(() => data?.courses || [], [data]);

  // Sessions/batches: prefer backend sessions, enrich with row-derived values.
  const sessions = useMemo(() => {
    const set = new Set((data?.sessions || []).map((s) => s.title || s.code).filter(Boolean));
    (extraRows || []).forEach((r) => { const s = rowMap(r)?.session; if (s) set.add(String(s).trim()); });
    return [...set].sort();
  }, [data, extraRows, rowMap]);

  const batches = useMemo(() => {
    const set = new Set();
    (extraRows || []).forEach((r) => { const b = rowMap(r)?.batch; if (b) set.add(String(b).trim()); });
    // Fallback: derive batch (year) from sessions like "Fall 2026".
    sessions.forEach((s) => { const m = String(s).match(/\b(20\d{2})\b/); if (m) set.add(m[1]); });
    return [...set].sort();
  }, [extraRows, rowMap, sessions]);

  // Programs scoped to the selected department (cascading rule #2).
  const scopedPrograms = useMemo(() => {
    if (v.department === ALL) return programs;
    const target = String(v.department).trim().toLowerCase();
    return programs.filter((p) => String(p.department || "").trim().toLowerCase() === target);
  }, [programs, v.department]);

  // Semesters scoped to the selected program (cascading rule #3).
  const scopedSemesters = useMemo(() => {
    if (v.program === ALL) {
      // Union of all semesters across scoped programs.
      const set = new Map();
      scopedPrograms.forEach((p) => {
        (semestersByProgram[p.code] || semestersByProgram[p.shortForm] || []).forEach((s) => set.set(s.value, s));
        const n = p.totalSemesters || 0;
        for (let i = 1; i <= n; i++) if (!set.has(String(i))) set.set(String(i), { value: String(i), label: `Semester ${i}` });
      });
      return [...set.values()].sort((a, b) => Number(a.value) - Number(b.value));
    }
    const prog = programs.find((p) => (p.shortForm || p.code) === v.program || p.code === v.program || p.name === v.program);
    const key = prog?.code;
    const list = (key && semestersByProgram[key]) || [];
    if (list.length) return list;
    const n = prog?.totalSemesters || 8;
    return Array.from({ length: n }, (_, i) => ({ value: String(i + 1), label: `Semester ${i + 1}` }));
  }, [scopedPrograms, programs, semestersByProgram, v.program]);

  // Courses scoped to the selected program.
  const scopedCourses = useMemo(() => {
    if (v.program === ALL) return courses;
    return courses.filter((c) => c.programCode === v.program);
  }, [courses, v.program]);

  const set = (patch) => onChange?.({ ...v, ...patch });

  // When department changes, reset dependent selects so stale values don't linger.
  const onDept = (d) => set({ department: d, program: ALL, semester: ALL, course: ALL });
  const onProgram = (p) => set({ program: p, semester: ALL, course: ALL });

  const renderField = (f) => {
    switch (f) {
      case "department":
        return <Select key="d" icon={Building2} label="Department" value={v.department} onChange={onDept}
          placeholderAll="All Departments" options={departments.map((d) => ({ value: d, label: d }))} />;
      case "program":
        return <Select key="p" icon={GraduationCap} label="Program" value={v.program} onChange={onProgram}
          disabled={v.department === ALL} placeholderAll={v.department === ALL ? "Select Department first" : "All Programs"}
          options={scopedPrograms.map((p) => ({ value: p.shortForm || p.code, label: `${p.shortForm || p.code} — ${p.name}` }))} />;
      case "semester":
        return <Select key="s" icon={Layers} label="Semester" value={v.semester} onChange={(x) => set({ semester: x, section: ALL, course: ALL })}
          disabled={v.program === ALL} placeholderAll={v.program === ALL ? "Select Program first" : "All Semesters"} options={scopedSemesters.map((s) => ({ value: s.value, label: s.label }))} />;
      case "session":
        return <Select key="se" icon={CalendarRange} label="Session" value={v.session} onChange={(x) => set({ session: x })}
          placeholderAll="All Sessions" options={sessions.map((s) => ({ value: s, label: s }))} />;
      case "batch":
        return <Select key="b" icon={Users} label="Batch" value={v.batch} onChange={(x) => set({ batch: x })}
          placeholderAll="All Batches" options={batches.map((b) => ({ value: b, label: b }))} />;
      case "section":
        return <Select key="sec" icon={Users} label="Section" value={v.section} onChange={(x) => set({ section: x })}
          disabled={fields.includes("semester") && v.semester === ALL} placeholderAll={fields.includes("semester") && v.semester === ALL ? "Select Semester first" : "All Sections"} options={sections.map((s) => ({ value: s, label: `Section ${s}` }))} />;
      case "course":
        return <Select key="c" icon={BookOpen} label="Course" value={v.course} onChange={(x) => set({ course: x })}
          placeholderAll="All Courses" options={scopedCourses.map((c) => ({ value: c.label, label: c.label }))} />;
      default:
        return null;
    }
  };

  const activeCount = Object.entries(v).filter(([, val]) => val && val !== ALL).length;

  return (
    <div className={`card-base p-4 ${className}`}>
      <div className="flex flex-wrap items-end gap-3">
        {fields.map(renderField)}
        {showReset && (
          <button
            type="button"
            onClick={() => onChange?.(emptyCascade())}
            className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 self-end"
            title="Reset all filters"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>
      <p className="text-xs text-muted-app inline-flex items-center gap-1 mt-3">
        <Filter size={11} /> {activeCount === 0 ? "No filters applied — showing all records" : `${activeCount} active filter${activeCount > 1 ? "s" : ""}`}
      </p>
    </div>
  );
};

export default CascadeFilters;

import { useMemo, useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Filter, RefreshCw } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import StatusBadge from "../../components/common/StatusBadge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

/**
 * Shared term-results view used by both Mid Term and Final Term pages.
 * Provides professional, DB-driven filters: Session, Department, Program,
 * Semester, Section, Course. All real-time (no dummy data).
 */
const TermResultsView = ({ component, title, subtitle, icon, breadcrumbLabel }) => {
  const { data: filterData } = useApi(() => api.exam.filters(), []);
  const departments = useMemo(() => filterData?.departments || [], [filterData]);
  const programs = useMemo(() => filterData?.programs || [], [filterData]);
  const semestersByProgram = useMemo(() => filterData?.semestersByProgram || {}, [filterData]);
  const allSections = useMemo(() => filterData?.sections || [], [filterData]);
  const allCourses = useMemo(() => filterData?.courses || [], [filterData]);
  const sessions = useMemo(() => filterData?.sessions || [], [filterData]);

  const [f, setF] = useState({ session: "", department: "", program: "", semester: "", section: "", courseId: "" });
  const programObj = useMemo(() => programs.find((p) => p.shortForm === f.program || p.code === f.program), [programs, f.program]);
  const semesterOpts = useMemo(() => (programObj?.code ? (semestersByProgram[programObj.code] || []) : []), [programObj, semestersByProgram]);
  const courseOpts = useMemo(() => allCourses.filter((c) => {
    if (programObj && c.programCode && c.programCode !== programObj.code) return false;
    if (f.semester && c.semester && String(c.semester) !== String(f.semester)) return false;
    return true;
  }), [allCourses, programObj, f.semester]);

  const [rowsData, setRowsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const buildParams = useCallback(() => {
    const q = new URLSearchParams();
    q.set("component", component);
    if (f.session) q.set("session", f.session);
    if (f.department) q.set("department", f.department);
    if (f.program) q.set("program", f.program);
    if (f.semester) q.set("semester", f.semester);
    if (f.section) q.set("section", f.section);
    if (f.courseId) q.set("courseId", f.courseId);
    return `?${q.toString()}`;
  }, [component, f]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await api.exam.results(buildParams());
      setRowsData(res);
    } catch (e) { setError(e?.message || "Failed to load results"); setRowsData(null); }
    finally { setLoading(false); }
  }, [buildParams]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => rowsData?.results || [], [rowsData]);
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => [r.student, r.course, r.roll].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [rows, search]);

  const avg = rows.length ? Math.round(rows.reduce((a, b) => a + (b.percent || 0), 0) / rows.length * 10) / 10 : 0;

  return (
    <div>
      <PageHeader title={title} subtitle={`${subtitle}${rowsData?.term ? ` · ${rowsData.term}` : ""}`} icon={icon} breadcrumb={["Exam Controller", breadcrumbLabel]} />

      {/* Filters */}
      <div className="card-base p-4 mb-4">
        <div className="flex items-center gap-2 mb-3 text-xs font-bold text-muted-app uppercase"><Filter size={13} /> Filters</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Session</label>
            <select value={f.session} onChange={(e) => setF({ ...f, session: e.target.value })} className="input-base w-full text-sm">
              <option value="">Current Session</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}{s.isCurrent ? " (current)" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Department</label>
            <select value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} className="input-base w-full text-sm">
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Program</label>
            <select value={f.program} onChange={(e) => setF({ ...f, program: e.target.value, semester: "", courseId: "" })} className="input-base w-full text-sm">
              <option value="">All Programs</option>
              {programs.map((p) => <option key={p.code} value={p.shortForm || p.code}>{p.shortForm || p.code} — {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Semester</label>
            <select value={f.semester} onChange={(e) => setF({ ...f, semester: e.target.value, courseId: "" })} className="input-base w-full text-sm" disabled={!f.program}>
              <option value="">All Semesters</option>
              {semesterOpts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Section</label>
            <select value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} className="input-base w-full text-sm">
              <option value="">All Sections</option>
              {allSections.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Course</label>
            <select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })} className="input-base w-full text-sm">
              <option value="">All Courses</option>
              {courseOpts.map((c) => <option key={c.offeringId} value={c.offeringId}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button onClick={load} disabled={loading} className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Apply / Reload</button>
          <button onClick={() => setF({ session: "", department: "", program: "", semester: "", section: "", courseId: "" })} className="btn-secondary text-sm py-2 px-3">Clear</button>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : loading ? <Skeleton className="h-80" /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <StatCard title="Records" value={rows.length} icon="ClipboardList" color="blue" />
            <StatCard title="Avg %" value={avg} icon="TrendingUp" color="emerald" delay={0.05} />
            <StatCard title="Published" value={rows.filter((r) => r.status === "PUBLISHED").length} icon="CheckCircle2" color="violet" delay={0.1} />
          </div>
          <div className="card-base p-4 mb-4 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student / roll / course…" className="input-base w-full pl-9 text-sm" />
            </div>
            <span className="text-xs text-muted-app inline-flex items-center gap-1"><Filter size={11} /> {filtered.length} record(s)</span>
          </div>
          <div className="card-base overflow-hidden">
            {filtered.length === 0 ? <EmptyState message={`No ${component}-term results for the selected filters.`} /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="surface border-b border-app"><tr>
                    {["Roll", "Student", "Program", "Sem", "Sec", "Course", "Marks", "Max", "%", "Grade", "Status"].map((h) => <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase text-muted-app">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-app">
                    {filtered.map((r, i) => (
                      <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.01, 0.3) }} className="hover:surface">
                        <td className="px-3 py-2 text-xs font-mono text-app">{r.roll || "—"}</td>
                        <td className="px-3 py-2 text-xs font-bold text-app whitespace-nowrap">{r.student}</td>
                        <td className="px-3 py-2 text-xs text-app">{r.program || "—"}</td>
                        <td className="px-3 py-2 text-xs text-app text-center">{r.semester || "—"}</td>
                        <td className="px-3 py-2 text-xs text-app text-center">{r.section || "—"}</td>
                        <td className="px-3 py-2 text-xs text-app whitespace-nowrap">{r.course}</td>
                        <td className="px-3 py-2 text-xs text-app">{r.marks}</td>
                        <td className="px-3 py-2 text-xs text-muted-app">{r.max}</td>
                        <td className="px-3 py-2 text-xs text-app">{r.percent}%</td>
                        <td className="px-3 py-2 text-xs text-app">{r.letterGrade || "—"}</td>
                        <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TermResultsView;

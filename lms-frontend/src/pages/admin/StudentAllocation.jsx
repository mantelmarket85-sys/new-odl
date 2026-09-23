import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Users, Search, GraduationCap, Layers, Wand2, Loader2, CheckCircle2,
  AlertTriangle, UsersRound, Download, RefreshCw,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import { useToast } from "../../context/ToastContext";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

/* =========================================================================
 * Course Coordinator → Student Allocation & Sections (UNIFIED, LIVE)
 *
 * Merges the former "Student Allocation" and "Section Management" modules
 * into one. Sections are organised SEMESTER-WISE only (course-wise section
 * creation is removed). For each program + semester:
 *   • Default section capacity = 150 students.
 *   • Auto-create sections A, B, C… as enrollment exceeds 150 and
 *     auto-distribute students in a balanced way (first 150 → A, next → B…).
 *   • One click performs the allocation; no manual section creation.
 * All data is sourced live from /coordinator/semester-allocation — no mock
 * data anywhere.
 * ======================================================================= */

const fillColor = (pct) =>
  pct >= 90 ? "from-rose-500 to-pink-600" : pct >= 70 ? "from-amber-500 to-orange-600" : "from-emerald-500 to-teal-600";

const StudentAllocation = () => {
  const { toast } = useToast();

  const [data, setData] = useState({ groups: [], capacity: 150, termLabel: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [programFilter, setProgramFilter] = useState("all");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [autoBusy, setAutoBusy] = useState(null); // group key | "all"
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.coordinator.semesterAllocation();
      setData(res || { groups: [] });
    } catch (err) {
      setError(err.message || "Failed to load allocation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Real-time refresh on allocation events.
  useEffect(() => {
    let es;
    try {
      es = new EventSource(api.coordinator.eventsUrl());
      es.addEventListener("allocation", () => load());
    } catch (_) { /* SSE optional */ }
    return () => { if (es) es.close(); };
  }, [load]);

  const groups = useMemo(() => data.groups || [], [data]);
  const capacity = data.capacity || 150;

  const programs = useMemo(
    () => [...new Map(groups.map((g) => [g.programId, g.programShortForm || g.programName])).entries()],
    [groups]
  );
  const semesters = useMemo(
    () => [...new Set(groups.map((g) => g.semesterNumber))].sort((a, b) => a - b),
    [groups]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (programFilter !== "all" && String(g.programId) !== programFilter) return false;
      if (semesterFilter !== "all" && String(g.semesterNumber) !== semesterFilter) return false;
      if (q && !`${g.programShortForm} ${g.programName} semester ${g.semesterNumber}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [groups, query, programFilter, semesterFilter]);

  const stats = useMemo(() => {
    const totalStudents = groups.reduce((s, g) => s + g.totalStudents, 0);
    const totalSections = groups.reduce((s, g) => s + g.sections.length, 0);
    const unassigned = groups.reduce((s, g) => s + g.unassigned, 0);
    return { students: totalStudents, semesters: groups.length, sections: totalSections, unassigned };
  }, [groups]);

  const runAuto = async (group) => {
    const key = group ? group.key : "all";
    setAutoBusy(key);
    try {
      const body = group ? { programId: group.programId, semester: group.semesterNumber } : {};
      const res = await api.coordinator.autoAllocateSemester(body);
      toast(
        `${res.sectionsCreated} section(s) created · ${res.studentsAssigned} student(s) allocated`,
        { type: "success", title: "Allocation complete" }
      );
      await load();
    } catch (err) {
      toast(err.message || "Auto-allocation failed", { type: "error" });
    } finally {
      setAutoBusy(null);
    }
  };

  const exportCsv = () => {
    if (filtered.length === 0) { toast("Nothing to export", { type: "warning" }); return; }
    const rows = [];
    filtered.forEach((g) => {
      g.students.forEach((s) => {
        rows.push([g.programShortForm, `Semester ${g.semesterNumber}`, s.roll, `"${s.name}"`, s.sectionName || "Unassigned"].join(","));
      });
    });
    const head = "Program,Semester,Roll,Name,Section";
    const blob = new Blob([`${head}\n${rows.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "semester-allocation.csv"; a.click();
    URL.revokeObjectURL(url);
    toast("Allocation exported", { type: "success" });
  };

  return (
    <div>
      <PageHeader
        title="Student Allocation & Sections"
        subtitle={`Semester-wise section management · default capacity ${capacity} students/section${data.termLabel ? ` · ${data.termLabel}` : ""}`}
        icon="UsersRound"
        breadcrumb={["Course Coordinator", "Student Allocation & Sections"]}
        actions={
          <div className="flex gap-2">
            <button onClick={load} className="px-3 py-2 rounded-xl border border-app text-sm font-bold text-app inline-flex items-center gap-1.5">
              <RefreshCw size={14} /> Refresh
            </button>
            <button onClick={exportCsv} className="btn-secondary text-sm py-2 px-3"><Download size={14} className="inline mr-1" /> Export CSV</button>
            <button onClick={() => runAuto(null)} disabled={autoBusy === "all"} className="btn-primary text-sm py-2 px-3 inline-flex items-center gap-1.5 disabled:opacity-60">
              {autoBusy === "all" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              Auto-Allocate All
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard title="Students" value={stats.students} icon="Users" color="purple" delay={0.05} />
        <StatCard title="Semesters" value={stats.semesters} icon="GraduationCap" color="blue" delay={0.1} />
        <StatCard title="Sections" value={stats.sections} icon="Layers" color="emerald" delay={0.15} />
        <StatCard title="Unallocated" value={stats.unassigned} icon="AlertTriangle" color="amber" delay={0.2} />
      </div>

      <div className="card-base p-3 mb-5 flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by program or semester..." className="input-base w-full pl-10 text-sm" />
        </div>
        <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className="input-base text-sm md:w-48">
          <option value="all">All Programs</option>
          {programs.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} className="input-base text-sm md:w-44">
          <option value="all">All Semesters</option>
          {semesters.map((s) => <option key={s} value={s}>Semester {s}</option>)}
        </select>
      </div>

      {error ? (
        <ErrorState title="Couldn't load allocation" description={error} onRetry={load} />
      ) : loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="UsersRound" title="No semester groups found" description="No enrolled students for the selected filters this term." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((g, i) => {
            const pct = g.totalStudents ? Math.round((g.totalStudents / (g.requiredSections * capacity)) * 100) : 0;
            const busy = autoBusy === g.key;
            return (
              <motion.div key={g.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="card-base p-5 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                    <GraduationCap size={20} />
                  </div>
                  <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-xs font-bold rounded">
                    Semester {g.semesterNumber}
                  </span>
                </div>
                <p className="font-bold text-app leading-tight">{g.programShortForm || g.programName}</p>
                <p className="text-xs text-muted-app mb-3 truncate">{g.programName}</p>

                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-app">Enrolled students</span>
                    <span className="font-bold text-app">{g.totalStudents}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${fillColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-app">
                    <span>{g.sections.length} of {g.requiredSections} section(s)</span>
                    <span>Cap {capacity}/section</span>
                  </div>
                </div>

                {/* Section chips */}
                <div className="flex flex-wrap gap-1.5 mb-3 min-h-[1.5rem]">
                  {g.sections.length === 0 ? (
                    <span className="text-[11px] text-muted-app italic">No sections yet</span>
                  ) : (
                    g.sections.map((s) => (
                      <span key={s.name} className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-app border border-app">
                        {s.name} · {s.enrolled}/{s.capacity}
                      </span>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-app gap-2">
                  {g.balanced && g.unassigned === 0 ? (
                    <Badge color="emerald"><CheckCircle2 size={11} className="inline mr-0.5" /> Allocated</Badge>
                  ) : (
                    <Badge color="amber"><AlertTriangle size={11} className="inline mr-0.5" /> {g.unassigned} unallocated</Badge>
                  )}
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setViewing(g)} className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 inline-flex items-center gap-1 text-xs font-bold border border-blue-200 dark:border-blue-500/30">
                      <Users size={12} /> View
                    </button>
                    <button onClick={() => runAuto(g)} disabled={busy} className="px-2.5 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 inline-flex items-center gap-1 text-xs font-bold disabled:opacity-60">
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} Allocate
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* View modal — section roster for the semester group */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.programShortForm} · Semester ${viewing.semesterNumber}` : ""}
        subtitle={viewing ? `${viewing.totalStudents} student(s) · ${viewing.sections.length} section(s)` : ""}
        icon={UsersRound}
        maxWidth="max-w-lg"
      >
        {viewing && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {viewing.sections.map((s) => {
                const pct = s.capacity ? Math.round((s.enrolled / s.capacity) * 100) : 0;
                return (
                  <div key={s.name} className="surface p-3 rounded-xl border border-app text-center">
                    <p className="text-xs text-muted-app">Section {s.name}</p>
                    <p className="font-bold text-app text-lg">{s.enrolled}</p>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-1">
                      <div className={`h-full bg-gradient-to-r ${fillColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-app mt-0.5">of {s.capacity}</p>
                  </div>
                );
              })}
              {viewing.sections.length === 0 && <p className="col-span-3 text-xs text-muted-app italic text-center py-2">No sections created yet. Click Allocate to create them.</p>}
            </div>

            <div className="surface rounded-xl border border-app overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-xs font-bold uppercase text-muted-app flex items-center gap-1.5">
                <Layers size={12} /> Student → Section
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {viewing.students.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-app italic text-center">No enrolled students.</p>
                ) : (
                  viewing.students.map((s) => (
                    <div key={s.id} className="px-3 py-2 flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-app truncate">{s.name}</p>
                        <p className="text-[11px] text-muted-app">{s.roll}</p>
                      </div>
                      {s.sectionName ? (
                        <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-500/30">
                          Section {s.sectionName}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                          Unallocated
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <button
              onClick={() => { runAuto(viewing); setViewing(null); }}
              className="btn-primary w-full text-sm py-2.5 inline-flex items-center justify-center gap-1.5"
            >
              <Wand2 size={14} /> Auto-Allocate This Semester
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default StudentAllocation;

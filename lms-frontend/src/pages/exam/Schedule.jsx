import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Monitor, Plus, Search, Calendar, Clock, Eye, Trash2,
  CheckCircle2, Lock, Send, AlertTriangle, ShieldCheck, Radio, CalendarClock,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import StatusBadge from "../../components/common/StatusBadge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";

// Exam types the Exam Controller schedules. All exams are conducted fully
// online — there is NO room / physical seating concept in this system.
const EXAM_TYPES = ["MID", "FINAL", "QUIZ", "RETAKE", "SPECIAL"];

// Friendly, human label for an exam type — Mid-term / Final / Other.
const TYPE_LABEL = { MID: "Mid-term", FINAL: "Final", QUIZ: "Quiz", RETAKE: "Retake", SPECIAL: "Special" };
const typeCategory = (t) => (t === "MID" ? "Mid-term" : t === "FINAL" ? "Final" : "Other");

const TYPE_CLS = {
  MID: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  FINAL: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  QUIZ: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  RETAKE: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  SPECIAL: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

// ── Time helpers to classify an exam as upcoming / ongoing / occurred ──
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };

function examPhase(s) {
  const today = todayISO();
  if (!s.date) return "upcoming";
  if (s.date > today) return "upcoming";
  if (s.date < today) return "occurred";
  // Same day — use time window if present.
  const st = toMin(s.startTime);
  const en = toMin(s.endTime);
  const n = nowMin();
  if (st != null && en != null) {
    if (n < st) return "upcoming";
    if (n > en) return "occurred";
    return "ongoing";
  }
  return "ongoing"; // same day, no times → treat as running today
}

const PHASE_META = {
  ongoing: { label: "Ongoing", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", icon: Radio },
  upcoming: { label: "Upcoming", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300", icon: CalendarClock },
  occurred: { label: "Occurred", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", icon: CheckCircle2 },
};

const ExamSchedule = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.exam.schedules(), []);
  const { data: offData } = useApi(() => api.exam.offerings(), []);
  const schedules = useMemo(() => data?.schedules || [], [data]);
  const offerings = useMemo(() => offData?.offerings || [], [offData]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all"); // all | ongoing | upcoming
  const [dept, setDept] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", examType: "FINAL", startTime: "", endTime: "", totalMarks: 100, offeringId: "" });
  const [clash, setClash] = useState(null);
  const [clashChecking, setClashChecking] = useState(false);

  // offeringId -> { program, semester, section, department } for cascading filters.
  const offeringMeta = useMemo(() => {
    const m = {};
    offerings.forEach((o) => { m[o.id] = { program: o.program, semester: o.semester, section: o.section }; });
    return m;
  }, [offerings]);

  // Departments come from the schedule payload; programs from offerings.
  const departments = useMemo(
    () => [...new Set(schedules.map((s) => s.department).filter(Boolean))].sort(),
    [schedules],
  );

  // Program list scoped to selected department (cascading rule #2).
  const programOptions = useMemo(() => {
    // Map program -> department using offerings + schedules.
    const progDept = {};
    schedules.forEach((s) => { const meta = offeringMeta[s.offeringId]; if (meta?.program && s.department) progDept[meta.program] = s.department; });
    let progs = Array.from(new Set(offerings.map((o) => o.program).filter(Boolean)));
    if (dept !== "all") progs = progs.filter((p) => !progDept[p] || progDept[p] === dept);
    return progs.sort();
  }, [offerings, schedules, offeringMeta, dept]);

  const semesterOptions = useMemo(() => {
    let list = offerings;
    if (programFilter !== "all") list = list.filter((o) => o.program === programFilter);
    return Array.from(new Set(list.map((o) => o.semester).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
  }, [offerings, programFilter]);

  // The core requirement: only show ONGOING or UPCOMING/near exams — never
  // the full historical list. "Occurred" exams are excluded from the board.
  const board = useMemo(
    () => schedules.filter((s) => s.status !== "CANCELLED").filter((s) => examPhase(s) !== "occurred"),
    [schedules],
  );

  const filtered = useMemo(() => board.filter((s) => {
    if (typeFilter !== "all" && s.examType !== typeFilter) return false;
    if (phaseFilter !== "all" && examPhase(s) !== phaseFilter) return false;
    if (dept !== "all" && s.department !== dept) return false;
    const meta = offeringMeta[s.offeringId] || {};
    if (programFilter !== "all" && meta.program !== programFilter) return false;
    if (semesterFilter !== "all" && String(meta.semester) !== String(semesterFilter)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return [s.title, s.offering].filter(Boolean).some((v) => v.toLowerCase().includes(q));
    }
    return true;
  }), [board, typeFilter, phaseFilter, dept, programFilter, semesterFilter, search, offeringMeta]);

  // Group filtered exams date-wise for a clean, ordered board.
  const grouped = useMemo(() => {
    const byDate = {};
    filtered.forEach((s) => { (byDate[s.date] = byDate[s.date] || []).push(s); });
    return Object.keys(byDate).sort().map((date) => ({ date, items: byDate[date] }));
  }, [filtered]);

  const stats = useMemo(() => ({
    live: board.filter((s) => examPhase(s) === "ongoing").length,
    upcoming: board.filter((s) => examPhase(s) === "upcoming").length,
    mid: board.filter((s) => s.examType === "MID").length,
    final: board.filter((s) => s.examType === "FINAL").length,
  }), [board]);

  // Live clash detection whenever date/time/offering change in the create form.
  useEffect(() => {
    if (!showCreate || !form.date) { setClash(null); return; }
    let live = true;
    setClashChecking(true);
    const params = new URLSearchParams();
    params.set("date", form.date);
    if (form.startTime) params.set("startTime", form.startTime);
    if (form.endTime) params.set("endTime", form.endTime);
    if (form.offeringId) params.set("offeringId", form.offeringId);
    const t = setTimeout(() => {
      api.exam.clashCheck(`?${params.toString()}`)
        .then((res) => { if (live) setClash(res); })
        .catch(() => { if (live) setClash(null); })
        .finally(() => { if (live) setClashChecking(false); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [showCreate, form.date, form.startTime, form.endTime, form.offeringId]);

  const resetForm = () => setForm({ title: "", date: "", examType: "FINAL", startTime: "", endTime: "", totalMarks: 100, offeringId: "" });

  const create = async () => {
    if (!form.title.trim() || !form.date) { toast?.("Title and date are required", { type: "warning" }); return; }
    setBusy(true);
    try {
      const payload = { ...form, totalMarks: Number(form.totalMarks) };
      // Online exams have no room — never send a room value.
      delete payload.room;
      if (!payload.offeringId) delete payload.offeringId;
      else payload.offeringId = Number(payload.offeringId);
      await api.exam.createSchedule(payload);
      toast?.("Online exam scheduled", { type: "success" });
      setShowCreate(false); resetForm(); setClash(null); reload();
    } catch (e) { toast?.(e?.message || "Failed", { type: "error" }); } finally { setBusy(false); }
  };

  const setStatus = async (id, status) => {
    setBusy(true);
    try { await api.exam.setScheduleStatus(id, { status }); toast?.(`Exam ${status.toLowerCase()}`, { type: "success" }); reload(); }
    catch (e) { toast?.(e?.message || "Failed", { type: "error" }); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm("Cancel and remove this exam?")) return;
    setBusy(true);
    try { await api.exam.deleteSchedule(id); toast?.("Exam removed", { type: "success" }); reload(); }
    catch (e) { toast?.(e?.message || "Failed", { type: "error" }); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title="Online Exam Management"
        subtitle="Manage fully-online examinations — only ongoing and upcoming exams are shown here."
        icon="Monitor"
        breadcrumb={["Exam Controller", "Online Exam Management"]}
        actions={<button onClick={() => setShowCreate(true)} className="btn-primary text-sm py-2 px-3 flex items-center gap-2"><Plus size={14} /> New Online Exam</button>}
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          {/* Live banner */}
          <div className="mb-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-r from-emerald-50 to-transparent dark:from-emerald-950/30 px-4 py-3 flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              {stats.live > 0 ? `${stats.live} exam(s) running right now` : "No exams running at this moment"}
              <span className="font-normal text-emerald-700/70 dark:text-emerald-400/70"> · {stats.upcoming} upcoming</span>
            </p>
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/70 dark:bg-slate-900/50 text-emerald-700 dark:text-emerald-300"><Monitor size={12} /> 100% Online</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard title="Ongoing Now" value={stats.live} icon="Radio" color="emerald" />
            <StatCard title="Upcoming / Near" value={stats.upcoming} icon="CalendarClock" color="blue" delay={0.05} />
            <StatCard title="Mid-term Exams" value={stats.mid} icon="FileEdit" color="amber" delay={0.1} />
            <StatCard title="Final Exams" value={stats.final} icon="FileCheck2" color="rose" delay={0.15} />
          </div>

          {/* Smart cascading filters */}
          <div className="card-base p-4 mb-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="relative xl:col-span-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search exams…" className="input-base w-full pl-9 text-sm" />
              </div>
              <select value={dept} onChange={(e) => { setDept(e.target.value); setProgramFilter("all"); setSemesterFilter("all"); }} className="input-base text-sm">
                <option value="all">All Departments</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={programFilter} onChange={(e) => { setProgramFilter(e.target.value); setSemesterFilter("all"); }} className="input-base text-sm disabled:opacity-50 disabled:cursor-not-allowed" disabled={dept === "all"}>
                <option value="all">{dept === "all" ? "Select Department first" : "All Programs"}</option>
                {programOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} className="input-base text-sm disabled:opacity-50 disabled:cursor-not-allowed" disabled={programFilter === "all"}>
                <option value="all">{programFilter === "all" ? "Select Program first" : "All Semesters"}</option>
                {semesterOptions.map((s) => <option key={s} value={s}>Semester {s}</option>)}
              </select>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-base text-sm">
                <option value="all">All Types</option>
                {EXAM_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {[["all", "All"], ["ongoing", "Ongoing"], ["upcoming", "Upcoming"]].map(([v, l]) => (
                <button key={v} onClick={() => setPhaseFilter(v)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${phaseFilter === v ? "bg-primary-600 text-white border-primary-600" : "border-app text-muted-app hover:surface"}`}>
                  {l}
                </button>
              ))}
              <span className="text-xs text-muted-app ml-auto">{filtered.length} exam(s) shown</span>
            </div>
          </div>

          {/* Board */}
          {grouped.length === 0 ? (
            <div className="card-base"><EmptyState message="No ongoing or upcoming exams match your filters." /></div>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.date} className="card-base overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-app surface flex items-center gap-2">
                    <Calendar size={14} className="text-rose-500" />
                    <span className="text-sm font-bold text-app">{group.date}</span>
                    <span className="text-xs text-muted-app">· {group.items.length} exam(s)</span>
                  </div>
                  <div className="divide-y divide-app">
                    {group.items.map((s, i) => {
                      const meta = offeringMeta[s.offeringId] || {};
                      const phase = examPhase(s);
                      const Ph = PHASE_META[phase];
                      return (
                        <motion.div key={s.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.4) }}
                          className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 hover:surface">
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-app text-sm truncate">{s.offering || s.title}</p>
                            {s.offering && <p className="text-xs text-muted-app truncate">{s.title}</p>}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {s.department && <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">{s.department}</span>}
                              {meta.program && <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-app">{meta.program}</span>}
                              {meta.semester && <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-app">Sem {meta.semester}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${TYPE_CLS[s.examType] || TYPE_CLS.SPECIAL}`}>{typeCategory(s.examType)}</span>
                            <span className="inline-flex items-center gap-1 text-xs text-muted-app"><Clock size={12} /> {s.startTime || "—"}{s.endTime ? `–${s.endTime}` : ""}</span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${Ph.cls}`}><Ph.icon size={11} /> {Ph.label}</span>
                            <StatusBadge status={s.status} />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setDetail({ ...s, phase })} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-600" title="View"><Eye size={14} /></button>
                            {s.status === "DRAFT" && <button disabled={busy} onClick={() => setStatus(s.id, "PUBLISHED")} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600" title="Publish"><Send size={14} /></button>}
                            {s.status === "PUBLISHED" && <button disabled={busy} onClick={() => setStatus(s.id, "APPROVED")} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600" title="Approve"><CheckCircle2 size={14} /></button>}
                            {s.status === "APPROVED" && <button disabled={busy} onClick={() => setStatus(s.id, "LOCKED")} className="p-1.5 rounded-lg hover:bg-violet-50 text-violet-600" title="Lock"><Lock size={14} /></button>}
                            <button disabled={busy} onClick={() => remove(s.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600" title="Remove"><Trash2 size={14} /></button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* CREATE MODAL — online exam (no room field) */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setClash(null); }} title="Schedule Online Exam" icon="Monitor" maxWidth="max-w-lg">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Course Offering (optional)</label>
            <select value={form.offeringId} onChange={(e) => {
              const o = offerings.find((x) => String(x.id) === e.target.value);
              setForm((f) => ({ ...f, offeringId: e.target.value, title: o && !f.title.trim() ? `${o.label} Exam` : f.title }));
            }} className="input-base w-full text-sm">
              <option value="">— None —</option>
              {offerings.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-base w-full text-sm" placeholder="e.g. CS-101 Final Exam" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Date</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-base w-full text-sm" /></div>
            <div><label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Type</label><select value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value })} className="input-base w-full text-sm">{EXAM_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Start</label><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="input-base w-full text-sm" /></div>
            <div><label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">End</label><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="input-base w-full text-sm" /></div>
            <div><label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Marks</label><input type="number" value={form.totalMarks} onChange={(e) => setForm({ ...form, totalMarks: e.target.value })} className="input-base w-full text-sm" /></div>
          </div>

          {/* CLASH DETECTION FEEDBACK (teacher / student / same-course, no room) */}
          {form.date && (
            clashChecking ? (
              <div className="text-[11px] text-muted-app flex items-center gap-2"><Clock size={12} className="animate-pulse" /> Checking for scheduling clashes…</div>
            ) : clash ? (
              clash.hasClash ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs space-y-1">
                  <p className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><AlertTriangle size={13} /> Scheduling clash detected</p>
                  {clash.clashes?.offering?.length > 0 && <p className="text-amber-700 dark:text-amber-300">Same course already scheduled: {clash.clashes.offering.map((c) => c.title).join(", ")}</p>}
                  {clash.clashes?.teacher?.length > 0 && <p className="text-amber-700 dark:text-amber-300">Teacher conflict: {clash.clashes.teacher.map((c) => c.title).join(", ")}</p>}
                  {clash.clashes?.student?.length > 0 && <p className="text-amber-700 dark:text-amber-300">Student overlap: {clash.clashes.student.map((c) => `${c.title} (${c.students})`).join(", ")}</p>}
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">You can still proceed, but please review the conflicts above.</p>
                </div>
              ) : (
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><ShieldCheck size={12} /> No clashes — slot is clear.</div>
              )
            ) : null
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setShowCreate(false); setClash(null); }} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button onClick={create} disabled={busy} className="btn-primary text-sm py-2 px-4 disabled:opacity-50">{busy ? "Saving…" : "Create"}</button>
          </div>
        </div>
      </Modal>

      {/* DETAIL MODAL */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Exam Detail" icon="Eye" maxWidth="max-w-md">
        {detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="surface border border-app rounded-lg p-3"><p className="text-[10px] text-muted-app uppercase">Course / Title</p><p className="font-semibold text-app text-xs break-words">{detail.offering || detail.title}</p></div>
              <div className="surface border border-app rounded-lg p-3"><p className="text-[10px] text-muted-app uppercase">Exam Type</p><p className="font-semibold text-app text-xs">{typeCategory(detail.examType)} ({TYPE_LABEL[detail.examType]})</p></div>
              <div className="surface border border-app rounded-lg p-3"><p className="text-[10px] text-muted-app uppercase">Start Date / Time</p><p className="font-semibold text-app text-xs">{detail.date} · {detail.startTime || "—"}{detail.endTime ? `–${detail.endTime}` : ""}</p></div>
              <div className="surface border border-app rounded-lg p-3"><p className="text-[10px] text-muted-app uppercase">Status</p><p className="font-semibold text-app text-xs">{PHASE_META[detail.phase]?.label} · {detail.status}</p></div>
              <div className="surface border border-app rounded-lg p-3"><p className="text-[10px] text-muted-app uppercase">Department</p><p className="font-semibold text-app text-xs">{detail.department || "—"}</p></div>
              <div className="surface border border-app rounded-lg p-3"><p className="text-[10px] text-muted-app uppercase">Total Marks</p><p className="font-semibold text-app text-xs">{detail.totalMarks}</p></div>
              <div className="surface border border-app rounded-lg p-3 col-span-2"><p className="text-[10px] text-muted-app uppercase">Mode</p><p className="font-semibold text-app text-xs inline-flex items-center gap-1"><Monitor size={12} /> Conducted fully online — no physical room</p></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ExamSchedule;

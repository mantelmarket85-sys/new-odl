import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search, UserCheck, Plus, Trash2, GitBranch, AlertTriangle, Pencil,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import { useToast } from "../../context/ToastContext";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

const Field = ({ label, children, required }) => (
  <div>
    <label className="block text-xs font-bold uppercase tracking-wider text-secondary-app mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    {children}
  </div>
);

const statusColor = (s) => (s === "ACTIVE" ? "emerald" : s === "COMPLETED" ? "blue" : "slate");

const TeacherAssignment = () => {
  const { toast } = useToast();
  // §3.2 — "New Distribution" now opens a dedicated professional table-style page.
  const navigate = useNavigate();
  const location = useLocation();

  // Options (programs, teachers, sessions) — shared by list filter + create form.
  const { data: opts } = useApi(() => api.coordinator.distributionOptions(), []);
  const programs = opts?.programs || [];
  const teachers = opts?.teachers || [];
  const sessions = opts?.sessions || [];
  const allSemesters = opts?.semesters || [];

  const [sessionFilter, setSessionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (sessionFilter) p.set("sessionId", sessionFilter);
    if (debounced) p.set("search", debounced);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [sessionFilter, debounced]);

  const { data, loading, error, reload } = useApi(() => api.coordinator.distributions(query), [query]);
  const distributions = data?.distributions || [];
  const summary = data?.summary || { total: 0, assigned: 0, unassigned: 0, students: 0 };

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  // Edit modal
  const [editing, setEditing] = useState(null);
  // Assign-teacher modal
  const [assigning, setAssigning] = useState(null);
  const [assignTeacher, setAssignTeacher] = useState("");
  // Delete modal
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  // Refresh when the coordinator navigates back to this page (e.g. after
  // creating a distribution). No background polling — updates happen on
  // navigation or after an explicit action.
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [location.key]);

  const openAssign = (d) => { setAssigning(d); setAssignTeacher(d.teacherId || ""); };

  const saveAssign = async () => {
    if (!assignTeacher) { toast("Please select a teacher", { type: "error" }); return; }
    setBusy(true);
    try {
      await api.coordinator.assignDistributionTeacher(assigning.id, assignTeacher);
      toast("Teacher assigned ✓", { type: "success" });
      setAssigning(null);
      await reload();
    } catch (err) {
      toast(err?.data?.error || err.message || "Failed to assign teacher", { type: "error" });
    } finally { setBusy(false); }
  };

  const toggleStatus = async (d) => {
    const next = d.status === "ACTIVE" ? "COMPLETED" : "ACTIVE";
    try {
      await api.coordinator.updateDistribution(d.id, { status: next });
      toast(`Marked ${next.toLowerCase()} ✓`, { type: "success" });
      await reload();
    } catch (err) { toast(err?.data?.error || err.message, { type: "error" }); }
  };

  const confirmDelete = async (force) => {
    setBusy(true);
    try {
      await api.coordinator.deleteDistribution(deleting.id, force);
      toast("Distribution removed ✓", { type: "success" });
      setDeleting(null);
      await reload();
    } catch (err) {
      if (err?.status === 409 && !force) {
        // surface force option
        setDeleting((d) => ({ ...d, needsForce: true, forceMsg: err?.data?.error }));
      } else {
        toast(err?.data?.error || err.message || "Failed to delete", { type: "error" });
      }
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title="Course Distribution"
        subtitle="Distribute courses across sessions, sections & teachers using cascading selections — fully database-driven."
        icon="GitBranch"
        breadcrumb={["Coordinator", "Course Distribution"]}
        actions={
          <button onClick={() => navigate("/admin/teacher-assignment/new")} className="btn-primary flex items-center gap-1.5">
            <Plus size={16} /> New Distribution
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Distributions" value={summary.total} icon="GitBranch" color="blue" delay={0.05} />
        <StatCard title="Assigned" value={summary.assigned} icon="UserCheck" color="emerald" delay={0.1} />
        <StatCard title="Unassigned" value={summary.unassigned} icon="AlertTriangle" color="amber" delay={0.15} />
        <StatCard title="Students Served" value={summary.students} icon="Users" color="violet" delay={0.2} />
      </div>

      <div className="card-base p-4 mb-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Search size={16} className="text-muted-app" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by course, teacher or program…" className="flex-1 bg-transparent outline-none text-app text-sm" />
        </div>
        <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} className="input-base py-2 text-sm md:w-52">
          <option value="">Current Session</option>
          {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}{s.isCurrent ? " (current)" : ""}</option>)}
        </select>
      </div>

      {error ? (
        <ErrorState title="Couldn't load distributions" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="card-base p-5 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : distributions.length === 0 ? (
        <EmptyState icon="GitBranch" title="No distributions" description="Create a course distribution to assign courses to sessions, sections & teachers." />
      ) : (
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="surface border-b border-app">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-app">Course</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-app">Program</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-muted-app">Semester</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-app">Teacher</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-muted-app">Sections</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-muted-app">Students</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-muted-app">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase text-muted-app">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {distributions.map((o, i) => (
                  <motion.tr key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="hover:surface transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-app">{o.courseCode}</p>
                      <p className="text-xs text-muted-app">{o.courseTitle}</p>
                    </td>
                    <td className="px-4 py-3"><Badge color="violet">{o.program || "—"}</Badge></td>
                    <td className="px-4 py-3 text-center"><Badge color="blue">Sem {o.semester ?? "—"}</Badge></td>
                    <td className="px-4 py-3">
                      {o.teacher ? (
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                            {String(o.teacher).slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-semibold text-app">{o.teacher}</span>
                        </div>
                      ) : <Badge color="amber">Unassigned</Badge>}
                    </td>
                    <td className="px-4 py-3 text-center text-app">{o.sections?.length ?? 0}</td>
                    <td className="px-4 py-3 text-center text-app">{o.students}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleStatus(o)} title="Toggle status">
                        <Badge color={statusColor(o.status)}>{o.status}</Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(o)} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 text-blue-600" title="Edit distribution"><Pencil size={14} /></button>
                        <button onClick={() => openAssign(o)} className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600" title="Assign teacher"><UserCheck size={14} /></button>
                        <button onClick={() => setDeleting(o)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600" title="Delete distribution"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE DISTRIBUTION (cascading dropdowns) */}
      <CreateDistributionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        programs={programs}
        teachers={teachers}
        sessions={sessions}
        onCreated={() => { setCreateOpen(false); reload(); }}
      />

      {/* EDIT DISTRIBUTION (teacher, section, semester, credit hours, course) */}
      <EditDistributionModal
        distribution={editing}
        onClose={() => setEditing(null)}
        teachers={teachers}
        semesters={allSemesters}
        onSaved={() => { setEditing(null); reload(); }}
      />

      {/* ASSIGN TEACHER */}
      <Modal open={!!assigning} onClose={() => setAssigning(null)} title="Assign Teacher" subtitle={assigning ? `${assigning.courseCode} — ${assigning.courseTitle}` : ""} icon={UserCheck} maxWidth="max-w-md">
        {assigning && (
          <div className="space-y-4">
            <div className="surface p-3 rounded-xl border border-app text-sm">
              <p className="text-muted-app text-xs">Currently assigned</p>
              <p className="font-bold text-app">{assigning.teacher || "Unassigned"}</p>
            </div>
            <Field label="Select Teacher" required>
              <select value={assignTeacher} onChange={(e) => setAssignTeacher(e.target.value)} className="input-base w-full">
                <option value="">— Select teacher —</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setAssigning(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={saveAssign} disabled={busy} className="btn-primary flex-1 disabled:opacity-60">{busy ? "Assigning…" : "Assign Teacher"}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* DELETE */}
      <Modal open={!!deleting} onClose={() => !busy && setDeleting(null)} title="Remove Distribution" subtitle={deleting ? deleting.courseCode : ""} icon={Trash2} maxWidth="max-w-md">
        {deleting && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-sm bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{deleting.needsForce ? deleting.forceMsg : <>Remove the distribution for <strong>{deleting.courseCode}</strong>? This soft-deletes the offering; student records are preserved.</>}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleting(null)} disabled={busy} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => confirmDelete(!!deleting.needsForce)} disabled={busy} className="flex-1 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition disabled:opacity-60">
                {busy ? "Removing…" : deleting.needsForce ? "Force Remove" : "Remove"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ------------------------------------------------------------
// Create Distribution modal — cascading dropdowns:
//   Program → Semester → Course (by semester) → Session → Teacher → Section
// ------------------------------------------------------------
const CreateDistributionModal = ({ open, onClose, programs, teachers, sessions, onCreated }) => {
  const { toast } = useToast();
  const [programId, setProgramId] = useState("");
  const [semesters, setSemesters] = useState([]);
  const [semesterId, setSemesterId] = useState("");
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [sectionName, setSectionName] = useState("A");
  const [capacity, setCapacity] = useState(150);
  const [room, setRoom] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Reset everything when (re)opened; preselect current session.
  useEffect(() => {
    if (open) {
      setProgramId(""); setSemesters([]); setSemesterId(""); setCourses([]); setCourseId("");
      setTeacherId(""); setSectionName("A"); setCapacity(150); setRoom(""); setErr("");
      const current = sessions.find((s) => s.isCurrent);
      setSessionId(current ? String(current.id) : (sessions[0] ? String(sessions[0].id) : ""));
    }
  }, [open, sessions]);

  // Program → load semesters.
  useEffect(() => {
    setSemesterId(""); setCourses([]); setCourseId("");
    if (!programId) { setSemesters([]); return; }
    api.structure.programSemesters(programId)
      .then((d) => setSemesters(d.semesters || d || []))
      .catch(() => setSemesters([]));
  }, [programId]);

  // Program + Semester → load courses (filtered by semester).
  useEffect(() => {
    setCourseId("");
    if (!programId) { setCourses([]); return; }
    api.coordinator.distributionCourses(programId, semesterId || "")
      .then((d) => setCourses(d.courses || []))
      .catch(() => setCourses([]));
  }, [programId, semesterId]);

  // Derived labels for the live preview row (Point 14 — table-based UI).
  const selProgram = useMemo(() => programs.find((p) => String(p.id) === String(programId)), [programs, programId]);
  const selCourse = useMemo(() => courses.find((c) => String(c.id) === String(courseId)), [courses, courseId]);
  const selSession = useMemo(() => sessions.find((s) => String(s.id) === String(sessionId)), [sessions, sessionId]);
  const selTeacher = useMemo(() => teachers.find((t) => String(t.id) === String(teacherId)), [teachers, teacherId]);

  // Point 14 — validate the whole row before enabling submit.
  const validationError = useMemo(() => {
    if (!programId) return "Select a program.";
    if (!courseId) return "Select a course.";
    if (!sessionId) return "Select a session / batch.";
    if (sectionName && !sectionName.trim()) return "Section name cannot be blank.";
    const cap = capacity === "" ? null : parseInt(capacity, 10);
    if (cap != null && (!Number.isFinite(cap) || cap < 1)) return "Capacity must be a positive number.";
    return "";
  }, [programId, courseId, sessionId, sectionName, capacity]);

  const submit = async () => {
    setErr("");
    // Point 14 — block submission on any invalid field.
    if (validationError) return setErr(validationError);
    setSaving(true);
    try {
      await api.coordinator.createDistribution({
        courseId: parseInt(courseId, 10),
        sessionId: parseInt(sessionId, 10),
        teacherId: teacherId || undefined,
        sectionName: sectionName?.trim() || undefined,
        capacity: capacity ? parseInt(capacity, 10) : undefined,
        room: room?.trim() || undefined,
      });
      toast("Distribution created ✓", { type: "success" });
      onCreated?.();
    } catch (e) {
      setErr(e?.data?.error || e.message || "Failed to create distribution.");
    } finally { setSaving(false); }
  };

  // Point 14 — table-based configuration. Each parameter is a labeled row
  // (Parameter | Selection | Guidance) instead of a loose 2-col grid, giving
  // a clean, scannable, responsive tabular interface. A live preview row at
  // the bottom summarises exactly what will be created before submit.
  const rowCls = "border-t border-app align-middle";
  const labelCls = "px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-secondary-app whitespace-nowrap w-40 align-middle";
  const hintCls = "px-3 py-2.5 text-[11px] text-muted-app hidden md:table-cell";

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="New Course Distribution" subtitle="Configure the distribution row-by-row, then review & create" icon={GitBranch} maxWidth="max-w-3xl">
      <div className="space-y-4">
        {err && (
          <div className="flex items-center gap-2 text-sm bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
            <AlertTriangle size={15} /> {err}
          </div>
        )}

        {/* Point 14 — configuration table */}
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="surface border-b border-app">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase text-muted-app">Parameter</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase text-muted-app">Selection</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase text-muted-app hidden md:table-cell">Guidance</th>
                </tr>
              </thead>
              <tbody>
                <tr className={rowCls}>
                  <td className={labelCls}>Program <span className="text-rose-500">*</span></td>
                  <td className="px-3 py-2.5">
                    <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="input-base w-full">
                      <option value="">— Select program —</option>
                      {programs.map((p) => <option key={p.id} value={p.id}>{p.shortForm} — {p.name}</option>)}
                    </select>
                  </td>
                  <td className={hintCls}>Department / program that owns the course.</td>
                </tr>
                <tr className={rowCls}>
                  <td className={labelCls}>Semester</td>
                  <td className="px-3 py-2.5">
                    <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} disabled={!programId} className="input-base w-full disabled:opacity-60">
                      <option value="">All semesters</option>
                      {semesters.map((s) => <option key={s.id} value={s.id}>Semester {s.number}</option>)}
                    </select>
                  </td>
                  <td className={hintCls}>Optional — filters the course list.</td>
                </tr>
                <tr className={rowCls}>
                  <td className={labelCls}>Course <span className="text-rose-500">*</span></td>
                  <td className="px-3 py-2.5">
                    <select value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={!programId} className="input-base w-full disabled:opacity-60">
                      <option value="">{programId ? "— Select course —" : "Select program first"}</option>
                      {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}{c.semester ? ` (Sem ${c.semester})` : ""}</option>)}
                    </select>
                  </td>
                  <td className={hintCls}>The course being distributed.</td>
                </tr>
                <tr className={rowCls}>
                  <td className={labelCls}>Session / Batch <span className="text-rose-500">*</span></td>
                  <td className="px-3 py-2.5">
                    <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="input-base w-full">
                      <option value="">— Select session —</option>
                      {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}{s.isCurrent ? " (current)" : ""}</option>)}
                    </select>
                  </td>
                  <td className={hintCls}>Academic term the offering belongs to.</td>
                </tr>
                <tr className={rowCls}>
                  <td className={labelCls}>Teacher</td>
                  <td className="px-3 py-2.5">
                    <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="input-base w-full">
                      <option value="">Assign later</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className={hintCls}>Optional — can be assigned after creation.</td>
                </tr>
                <tr className={rowCls}>
                  <td className={labelCls}>Section</td>
                  <td className="px-3 py-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <input value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="Section (A)" className="input-base w-full" />
                      <input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" min={1} placeholder="Capacity" className="input-base w-full" />
                      <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room" className="input-base w-full" />
                    </div>
                  </td>
                  <td className={hintCls}>Name · capacity · room for the first section.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Point 14 — live preview table of what will be created */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-app mb-1.5">Preview</p>
          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="surface border-b border-app">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase text-muted-app">Program</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase text-muted-app">Course</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase text-muted-app">Session</th>
                    <th className="px-3 py-2 text-left text-[11px] font-bold uppercase text-muted-app">Teacher</th>
                    <th className="px-3 py-2 text-center text-[11px] font-bold uppercase text-muted-app">Section</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-app">
                    <td className="px-3 py-2.5 text-app">{selProgram ? selProgram.shortForm : <span className="text-muted-app italic">—</span>}</td>
                    <td className="px-3 py-2.5 text-app">{selCourse ? `${selCourse.code} — ${selCourse.title}` : <span className="text-muted-app italic">—</span>}</td>
                    <td className="px-3 py-2.5 text-app">{selSession ? selSession.title : <span className="text-muted-app italic">—</span>}</td>
                    <td className="px-3 py-2.5 text-app">{selTeacher ? selTeacher.name : <Badge color="amber">Unassigned</Badge>}</td>
                    <td className="px-3 py-2.5 text-center text-app">{sectionName?.trim() || "A"}{capacity ? ` · ${capacity}` : ""}{room?.trim() ? ` · ${room.trim()}` : ""}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t border-app">
          <button onClick={onClose} disabled={saving} className="btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={saving || !!validationError} className="btn-primary flex-1 disabled:opacity-60" title={validationError || ""}>{saving ? "Creating…" : "Create Distribution"}</button>
        </div>
      </div>
    </Modal>
  );
};

// ------------------------------------------------------------
// Edit Distribution modal — edit Assigned Teacher, Section,
// Semester, Credit Hours and the Course Assignment. All changes
// persist immediately to the database on save.
// ------------------------------------------------------------
const EditDistributionModal = ({ distribution, onClose, teachers, semesters, onSaved }) => {
  const { toast } = useToast();
  const open = !!distribution;

  const [teacherId, setTeacherId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [creditHours, setCreditHours] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [room, setRoom] = useState("");
  // Course Assignment — pick another course in the same program.
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Filter semesters to the distribution's program when known.
  const programSemesters = useMemo(() => {
    if (!distribution?.programId) return semesters;
    const filtered = semesters.filter((s) => s.programId === distribution.programId);
    return filtered.length ? filtered : semesters;
  }, [semesters, distribution]);

  // Prefill form whenever a distribution is opened.
  useEffect(() => {
    if (!distribution) return;
    setErr("");
    setTeacherId(distribution.teacherId || "");
    setSemesterId(distribution.semesterId ? String(distribution.semesterId) : "");
    setCreditHours(distribution.creditHours != null ? String(distribution.creditHours) : "");
    const primary = distribution.sections?.[0];
    setSectionName(primary?.name || "");
    setCapacity(primary?.capacity != null ? String(primary.capacity) : "");
    setRoom(primary?.room || "");
    setCourseId(distribution.courseId ? String(distribution.courseId) : "");
    // Load alternative courses for Course Assignment (same program).
    if (distribution.programId) {
      api.coordinator.distributionCourses(distribution.programId, "")
        .then((d) => setCourses(d.courses || []))
        .catch(() => setCourses([]));
    } else {
      setCourses([]);
    }
  }, [distribution]);

  const submit = async () => {
    setErr("");
    setSaving(true);
    try {
      await api.coordinator.updateDistribution(distribution.id, {
        teacherId: teacherId || "",
        sectionTeacherId: teacherId || "",
        courseId: courseId ? parseInt(courseId, 10) : undefined,
        semesterId: semesterId ? parseInt(semesterId, 10) : "",
        creditHours: creditHours !== "" ? parseInt(creditHours, 10) : undefined,
        sectionName: sectionName?.trim() || undefined,
        capacity: capacity !== "" ? parseInt(capacity, 10) : undefined,
        room: room?.trim() ?? undefined,
      });
      toast("Distribution updated ✓", { type: "success" });
      onSaved?.();
    } catch (e) {
      setErr(e?.data?.error || e.message || "Failed to update distribution.");
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Edit Distribution" subtitle={distribution ? `${distribution.courseCode} — ${distribution.courseTitle}` : ""} icon={Pencil} maxWidth="max-w-2xl">
      {distribution && (
        <div className="space-y-5">
          {err && (
            <div className="flex items-center gap-2 text-sm bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
              <AlertTriangle size={15} /> {err}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Course Assignment">
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="input-base w-full">
                {courses.length === 0 && <option value={courseId}>{distribution.courseCode} — {distribution.courseTitle}</option>}
                {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}{c.semester ? ` (Sem ${c.semester})` : ""}</option>)}
              </select>
            </Field>
            <Field label="Assigned Teacher">
              <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="input-base w-full">
                <option value="">Unassigned</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Semester">
              <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className="input-base w-full">
                <option value="">— Not set —</option>
                {programSemesters.map((s) => <option key={s.id} value={s.id}>Semester {s.number}</option>)}
              </select>
            </Field>
            <Field label="Credit Hours">
              <input value={creditHours} onChange={(e) => setCreditHours(e.target.value)} type="number" min={0} max={12} placeholder="3" className="input-base w-full" />
            </Field>
            <Field label="Section">
              <input value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="A" className="input-base w-full" />
            </Field>
            <Field label="Section Capacity">
              <input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" min={1} placeholder="150" className="input-base w-full" />
            </Field>
            <Field label="Room (optional)">
              <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="R-101" className="input-base w-full" />
            </Field>
          </div>

          <p className="text-xs text-muted-app">
            Note: Semester &amp; Credit Hours are properties of the course and apply wherever the course is used. Changes save to the database immediately.
          </p>

          <div className="flex gap-2 pt-3 border-t border-app">
            <button onClick={onClose} disabled={saving} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary flex-1">{saving ? "Saving…" : "Save Changes"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default TeacherAssignment;

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertOctagon, Plus, Search, CheckCircle2, AlertCircle, Loader2,
  SlidersHorizontal, RotateCcw, UserCheck, Users,
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
import Badge from "../../components/common/Badge";
import { useToast } from "../../context/ToastContext";

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : "—");

const money = (n) => (Number(n) || 0).toLocaleString();

/* =========================================================================
 * §4.2 — STUDENT SEARCH FILTERS for the "New Case" page.
 * Nine filters (Program, Semester, Session, Batch, Name, Roll Number, Email,
 * CNIC, Phone Number). Select filters draw their options from the server;
 * text filters are live contains-matches. Declared at module scope so React
 * keeps the same component identity across renders (an in-body definition
 * would remount the inputs and steal focus mid-typing).
 * ======================================================================= */
const STUDENT_FILTERS = [
  { key: "program", label: "Program", type: "select", opt: "programs" },
  { key: "semester", label: "Semester", type: "select", opt: "semesters" },
  { key: "session", label: "Session", type: "select", opt: "sessions" },
  { key: "batch", label: "Batch", type: "select", opt: "batches" },
  { key: "name", label: "Name", type: "text", placeholder: "Student name…" },
  { key: "roll", label: "Roll Number", type: "text", placeholder: "Roll number…" },
  { key: "email", label: "Email", type: "text", placeholder: "Email…" },
  { key: "cnic", label: "CNIC", type: "text", placeholder: "CNIC…" },
  { key: "phone", label: "Phone Number", type: "text", placeholder: "Phone…" },
];

const emptyStudentFilters = () =>
  STUDENT_FILTERS.reduce((acc, f) => { acc[f.key] = ""; return acc; }, {});

const contains = (value, needle) =>
  String(value || "").toLowerCase().includes(String(needle || "").trim().toLowerCase());

const StudentSearchPanel = ({
  values, options, onChange, onReset, activeCount,
  students, total, selectedId, onSelect, loading,
}) => (
  <div className="rounded-xl border border-app surface p-3 mb-1">
    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-center justify-center">
          <SlidersHorizontal size={13} className="text-blue-600 dark:text-blue-300" />
        </span>
        <div>
          <p className="text-xs font-bold text-app">Find the Student</p>
          <p className="text-[10px] text-muted-app">Filter by program, semester, session, batch or personal details.</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {activeCount > 0 && <Badge color="blue" size="sm">{activeCount} active</Badge>}
        <Badge color="slate" size="sm">{students.length} / {total}</Badge>
        <button
          type="button"
          onClick={onReset}
          disabled={activeCount === 0}
          className="btn-secondary text-[11px] py-1 px-2.5 inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw size={11} /> Reset
        </button>
      </div>
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
      {STUDENT_FILTERS.map((f) => (
        <div key={f.key}>
          <label className="block text-[10px] font-semibold text-secondary-app mb-1">{f.label}</label>
          {f.type === "select" ? (
            <select
              value={values[f.key] || ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="input-base py-1.5 text-[11px] w-full"
            >
              <option value="">All</option>
              {(options[f.opt] || []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              value={values[f.key] || ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder={f.placeholder || f.label}
              className="input-base py-1.5 text-[11px] w-full"
            />
          )}
        </div>
      ))}
    </div>

    <div className="max-h-52 overflow-y-auto rounded-lg border border-app divide-y divide-slate-100 dark:divide-slate-800">
      {loading ? (
        <p className="p-3 text-[11px] text-muted-app">Loading students…</p>
      ) : students.length === 0 ? (
        <div className="p-4 text-center">
          <Users size={18} className="mx-auto mb-1 text-muted-app" />
          <p className="text-[11px] text-muted-app">
            {total === 0 ? "No students found in your department." : "No students match these filters."}
          </p>
        </div>
      ) : (
        students.slice(0, 100).map((s) => {
          const active = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                active
                  ? "bg-primary-50 dark:bg-primary-950/40"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
              }`}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-app truncate">
                  {s.name} <span className="font-mono text-[10px] text-muted-app">({s.roll})</span>
                </p>
                <p className="text-[10px] text-muted-app truncate">
                  {[s.programShortForm || s.program, s.semester, s.session, s.batch ? `Batch ${s.batch}` : "", s.email]
                    .filter(Boolean).join(" · ")}
                </p>
              </div>
              {active && <UserCheck size={14} className="text-primary-600 dark:text-primary-400 shrink-0" />}
            </button>
          );
        })
      )}
    </div>
    {students.length > 100 && (
      <p className="text-[10px] text-muted-app mt-1.5">
        Showing the first 100 of {students.length} matches — narrow the filters further.
      </p>
    )}
  </div>
);

const FocalDiscipline = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.focal.discipline(), []);
  // §4.2 — department-scoped student directory with the full set of filterable
  // attributes for the "New Case" search section.
  const { data: studentsData, loading: studentsLoading } = useApi(() => api.focal.studentSearch(), []);
  const [studentFilters, setStudentFilters] = useState(emptyStudentFilters);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState({
    studentId: "", subject: "", description: "",
    fineDescription: "", fineAmount: "", remarks: "", severity: "MEDIUM",
  });
  const [saving, setSaving] = useState(false);

  const cases = data?.cases || [];
  const allStudents = studentsData?.students || [];
  const studentOptions = studentsData?.filterOptions || {};

  /* §4.2 — live, real-time filtering of the student directory. */
  const students = useMemo(() => {
    let out = allStudents;
    const f = studentFilters;
    if (f.program) out = out.filter((s) => s.program === f.program);
    if (f.semester) out = out.filter((s) => s.semester === f.semester);
    if (f.session) out = out.filter((s) => s.session === f.session);
    if (f.batch) out = out.filter((s) => s.batch === f.batch);
    if (f.name) out = out.filter((s) => contains(s.name, f.name) || contains(s.fatherName, f.name));
    if (f.roll) out = out.filter((s) => contains(s.roll, f.roll) || contains(s.registrationNumber, f.roll) || contains(s.username, f.roll));
    if (f.email) out = out.filter((s) => contains(s.email, f.email));
    if (f.cnic) out = out.filter((s) => contains(s.cnic, f.cnic));
    if (f.phone) out = out.filter((s) => contains(s.phone, f.phone));
    return out;
  }, [allStudents, studentFilters]);

  const studentFilterCount = STUDENT_FILTERS
    .filter((f) => String(studentFilters[f.key] || "").trim() !== "").length;
  const setStudentFilter = (key, value) => setStudentFilters((f) => ({ ...f, [key]: value }));
  const resetStudentFilters = () => setStudentFilters(emptyStudentFilters());
  const selectedStudent = allStudents.find((s) => s.id === form.studentId) || null;

  const filtered = useMemo(() => cases.filter((f) => {
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(f.subject || "").toLowerCase().includes(q) && !(f.studentName || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [cases, search, statusFilter]);

  const openCount = cases.filter((f) => f.status === "OPEN" || f.status === "IN_PROGRESS").length;
  const resolvedCount = cases.filter((f) => f.status === "RESOLVED" || f.status === "CLOSED").length;
  const totalFines = cases.reduce((a, f) => a + (f.fine?.fineAmount || 0), 0);

  const resolve = async (id) => {
    setBusyId(id);
    try {
      await api.focal.escalationAction(id, { action: "RESOLVE", resolution: "Resolved by Focal Person." });
      toast?.("Case resolved", { type: "success", title: "Updated" });
      reload();
    } catch (e) {
      toast?.(e.message || "Action failed", { type: "error", title: "Error" });
    } finally {
      setBusyId(null);
    }
  };

  const submit = async () => {
    if (!form.studentId) { toast?.("Please select a student", { type: "error" }); return; }
    if (!form.subject.trim()) { toast?.("Case title is required", { type: "error" }); return; }
    if (form.fineAmount !== "" && (isNaN(Number(form.fineAmount)) || Number(form.fineAmount) < 0)) {
      toast?.("Fine amount must be a valid non-negative number", { type: "error" });
      return;
    }
    setSaving(true);
    try {
      await api.focal.createDiscipline({
        studentId: form.studentId,
        subject: form.subject.trim(),
        description: form.description,
        fineDescription: form.fineDescription,
        fineAmount: form.fineAmount === "" ? 0 : Number(form.fineAmount),
        remarks: form.remarks,
        severity: form.severity,
      });
      toast?.("Disciplinary case registered. The student has been notified.", { type: "success", title: "Created" });
      setShowAdd(false);
      setForm({ studentId: "", subject: "", description: "", fineDescription: "", fineAmount: "", remarks: "", severity: "MEDIUM" });
      resetStudentFilters();
      reload();
    } catch (e) {
      toast?.(e.message || "Failed to create", { type: "error", title: "Error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Discipline & Conduct"
        subtitle="Open and track disciplinary cases. Cases route through the escalation workflow."
        icon="AlertOctagon"
        breadcrumb={["Focal Person", "Discipline"]}
        actions={
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
            <Plus size={14} /> New Case
          </button>
        }
      />

      {error ? (
        <ErrorState title="Couldn't load discipline cases" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatCard title="Total Cases" value={cases.length} icon="AlertOctagon" color="rose" delay={0.05} />
            <StatCard title="Open / In Progress" value={openCount} icon="AlertCircle" color="amber" delay={0.1} />
            <StatCard title="Resolved" value={resolvedCount} icon="CheckCircle2" color="emerald" delay={0.15} />
            <StatCard title="Total Fines" value={`Rs ${money(totalFines)}`} icon="AlertOctagon" color="amber" delay={0.2} />
          </div>

          <div className="card-base p-3 mb-5 flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by subject or student..." className="input-base w-full pl-10 text-sm" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-base text-sm md:w-44">
              <option value="all">All Status</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="CheckCircle2" title="No disciplinary cases" description="No cases match the current filters. Use “New Case” to open one." />
          ) : (
            <div className="space-y-3">
              {filtered.map((f, i) => (
                <motion.div key={f.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="card-base p-4 hover:shadow-md transition-all">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm ${f.status === "RESOLVED" || f.status === "CLOSED" ? "bg-gradient-to-br from-emerald-500 to-emerald-600" : "bg-gradient-to-br from-rose-500 to-rose-600"}`}>
                      {f.status === "RESOLVED" || f.status === "CLOSED" ? <CheckCircle2 size={20} /> : <AlertOctagon size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <p className="font-bold text-app">{f.subject}</p>
                          <p className="text-xs text-muted-app">
                            <span className="font-mono font-bold text-primary-600 dark:text-primary-400">#{f.id}</span>
                            {f.studentName ? <> · <span className="font-semibold">{f.studentName}</span></> : null}
                            {" · by "}{f.raisedByName}
                          </p>
                        </div>
                        <StatusBadge status={f.status} />
                      </div>
                      {(f.caseDescription || f.description) && <p className="text-sm text-muted-app mt-1">{f.caseDescription || f.description}</p>}
                      {f.fine && (f.fine.fineAmount > 0 || f.fine.fineDescription) && (
                        <div className="mt-2 inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs">
                          <span className="font-bold text-amber-700 dark:text-amber-300">Fine: Rs {money(f.fine.fineAmount)}</span>
                          {f.fine.fineDescription && <span className="text-amber-700/80 dark:text-amber-300/80">· {f.fine.fineDescription}</span>}
                          {f.fine.remarks && <span className="text-muted-app">· {f.fine.remarks}</span>}
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs">
                        <div className="surface border border-app rounded-lg p-2">
                          <p className="text-[10px] text-muted-app">Severity</p>
                          <p className="font-bold text-app">{f.severity}</p>
                        </div>
                        <div className="surface border border-app rounded-lg p-2">
                          <p className="text-[10px] text-muted-app">Current Role</p>
                          <p className="font-semibold text-app">{f.currentRole}</p>
                        </div>
                        <div className="surface border border-app rounded-lg p-2">
                          <p className="text-[10px] text-muted-app">Opened</p>
                          <p className="font-semibold text-app">{fmtDate(f.createdAt)}</p>
                        </div>
                      </div>
                      {(f.status === "OPEN" || f.status === "IN_PROGRESS") && (
                        <div className="flex gap-1.5 mt-3">
                          <button disabled={busyId === f.id} onClick={() => resolve(f.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold disabled:opacity-50">
                            {busyId === f.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Resolve
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Discipline & Fine" subtitle="Search for the student, then register a disciplinary case and optional fine" icon="AlertOctagon" maxWidth="max-w-3xl">
        <div className="space-y-3">
          {/* §4.2 — search filter section to find the student. */}
          <StudentSearchPanel
            values={studentFilters}
            options={studentOptions}
            onChange={setStudentFilter}
            onReset={resetStudentFilters}
            activeCount={studentFilterCount}
            students={students}
            total={allStudents.length}
            selectedId={form.studentId}
            onSelect={(id) => setForm((f) => ({ ...f, studentId: f.studentId === id ? "" : id }))}
            loading={studentsLoading}
          />

          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Student <span className="text-rose-500">*</span></label>
            <select value={form.studentId} onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))} className="input-base w-full text-sm">
              <option value="">— Select a student by name —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.roll})</option>
              ))}
            </select>
            {allStudents.length === 0 && <p className="text-[10px] text-muted-app mt-1">No students found in your department.</p>}
            {selectedStudent && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  ["Roll No", selectedStudent.roll],
                  ["Program", selectedStudent.programShortForm || selectedStudent.program],
                  ["Semester", selectedStudent.semester],
                  ["Session", selectedStudent.session],
                  ["Batch", selectedStudent.batch],
                  ["Email", selectedStudent.email],
                  ["CNIC", selectedStudent.cnic],
                  ["Phone", selectedStudent.phone],
                ].map(([k, v]) => (
                  <div key={k} className="surface border border-app rounded-lg p-2">
                    <p className="text-[10px] text-muted-app font-semibold uppercase tracking-wide">{k}</p>
                    <p className="text-[11px] text-app font-medium break-words">{v || "—"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Case Title <span className="text-rose-500">*</span></label>
            <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className="input-base w-full text-sm" placeholder="e.g. Plagiarism in CS-101 assignment" />
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Case Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows="2" className="input-base w-full text-sm" placeholder="Detailed description of the disciplinary case..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Fine Description</label>
              <input value={form.fineDescription} onChange={(e) => setForm((f) => ({ ...f, fineDescription: e.target.value }))} className="input-base w-full text-sm" placeholder="e.g. Library late penalty" />
            </div>
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Fine Amount (Rs)</label>
              <input type="number" min="0" value={form.fineAmount} onChange={(e) => setForm((f) => ({ ...f, fineAmount: e.target.value }))} className="input-base w-full text-sm" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Remarks</label>
            <textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} rows="2" className="input-base w-full text-sm" placeholder="Additional remarks (optional)..." />
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Severity</label>
            <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))} className="input-base w-full text-sm">
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle size={12} className="inline mr-1" /> The student receives a real-time notification with the fine details. This action is logged in the audit trail.
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1">Cancel</button>
            <button disabled={saving} onClick={submit} className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {saving && <Loader2 size={14} className="animate-spin" />} Register Case
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FocalDiscipline;

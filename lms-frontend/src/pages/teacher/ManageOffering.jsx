import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Users, CalendarCheck, FileText, FileQuestion, Award, Megaphone,
  Plus, Trash2, Save, CheckCircle2, Loader2, Eye, Upload, Download, X,
  Sparkles, ClipboardList, FileSpreadsheet, FileDown, Search, Filter,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import Badge from "../../components/common/Badge";
import Modal from "../../components/common/Modal";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import useApi from "../../hooks/useApi";
import useRealtime from "../../hooks/useRealtime";
import api, { fileUrl } from "../../services/api";

const TABS = [
  { key: "students", label: "Students", icon: Users },
  { key: "attendance", label: "Attendance", icon: CalendarCheck },
  { key: "assignments", label: "Assignments", icon: FileText },
  { key: "quizzes", label: "Quizzes", icon: FileQuestion },
  { key: "marks", label: "Marks", icon: ClipboardList },
  { key: "gradebook", label: "Gradebook", icon: Award },
  { key: "announcements", label: "Announcements", icon: Megaphone },
];

// Req 4-8: each teacher module is a focused workspace. When the page is opened
// from a specific sidebar module (?scope=…) we expose ONLY that module's
// tab(s) — e.g. the Assignments module shows assignment functions only, with
// no Attendance/Quizzes/Marks/Gradebook/Announcements options, etc.
// Marks & Gradebook are grouped as both are grade/result functions.
const SCOPE_TABS = {
  students: ["students"],
  attendance: ["attendance"],
  assignments: ["assignments"],
  quizzes: ["quizzes"],
  marks: ["marks", "gradebook"],
  gradebook: ["marks", "gradebook"],
  announcements: ["announcements"],
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

const ManageOffering = () => {
  const { offeringId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Visible tabs are scoped to the entry module (Req 4-8). With no scope
  // (e.g. opened from "My Courses") the full set is shown.
  const scope = searchParams.get("scope");
  const visibleTabs = useMemo(() => {
    const allowed = scope && SCOPE_TABS[scope];
    if (!allowed) return TABS;
    return TABS.filter((t) => allowed.includes(t.key));
  }, [scope]);

  const requestedTab = searchParams.get("tab");
  const initialTab = visibleTabs.some((t) => t.key === requestedTab)
    ? requestedTab
    : visibleTabs[0]?.key || "students";
  const [tab, setTab] = useState(initialTab);

  // Keep the active tab inside the allowed set if the scope changes.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === tab)) {
      setTab(visibleTabs[0]?.key || "students");
    }
  }, [visibleTabs, tab]);

  const { data, loading, error } = useApi(() => api.teacher.offering(offeringId), [offeringId]);
  const offering = data?.offering;
  const course = offering?.course;
  // Hide the tab bar entirely when the module exposes a single function —
  // the page then reads as a focused, single-purpose workspace.
  const showTabBar = visibleTabs.length > 1;

  return (
    <div>
      <button onClick={() => navigate("/teacher/subjects")} className="inline-flex items-center gap-1.5 text-sm text-muted-app hover:text-primary-600 mb-3">
        <ArrowLeft size={15} /> Back to My Courses
      </button>
      <PageHeader
        title={loading ? "Loading…" : course?.title || "Course"}
        subtitle={course ? `${course.code} · ${offering?.term?.title || ""}` : ""}
        icon="BookOpen"
        breadcrumb={["My Courses", course?.code || ""]}
      />

      {loading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : error ? (
        <ErrorState description={error} />
      ) : (
        <>
          {showTabBar && (
            <div className="flex gap-1.5 mb-5 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-slate-800">
              {visibleTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition ${
                    tab === t.key ? "border-primary-600 text-primary-600" : "border-transparent text-muted-app hover:text-app"
                  }`}
                >
                  <t.icon size={15} /> {t.label}
                </button>
              ))}
            </div>
          )}

          {tab === "students" && <StudentsTab offeringId={offeringId} />}
          {tab === "attendance" && <AttendanceTab offeringId={offeringId} />}
          {tab === "assignments" && <AssignmentsTab offeringId={offeringId} />}
          {tab === "quizzes" && <QuizzesTab offeringId={offeringId} />}
          {tab === "marks" && <MarksTab offeringId={offeringId} />}
          {tab === "gradebook" && <GradebookTab offeringId={offeringId} />}
          {tab === "announcements" && <AnnouncementsTab offeringId={offeringId} />}
        </>
      )}
    </div>
  );
};

/* ---------------- Students ---------------- */
function StudentsTab({ offeringId }) {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.teacher.students(offeringId), [offeringId]);
  const students = useMemo(() => data?.students || [], [data]);
  const [filters, setFilters] = useState({ search: "", section: "", cnic: "", phone: "" });
  const [profile, setProfile] = useState(null);

  const sections = useMemo(() => [...new Set(students.map((s) => s.section).filter(Boolean))], [students]);

  const filtered = useMemo(() => {
    const like = (v, t) => String(v || "").toLowerCase().includes(t.toLowerCase());
    return students.filter((s) => {
      if (filters.search && !(like(s.name, filters.search) || like(s.rollNumber, filters.search))) return false;
      if (filters.section && s.section !== filters.section) return false;
      if (filters.cnic && !like(s.cnic, filters.cnic)) return false;
      if (filters.phone && !(like(s.phone, filters.phone) || like(s.whatsapp, filters.phone))) return false;
      return true;
    });
  }, [students, filters]);

  const exportExcel = async (scope) => {
    try {
      const params = scope === "section" && filters.section ? `?section=${encodeURIComponent(filters.section)}` : "";
      await api.teacher.exportStudentsExcel(offeringId, params, `students${params ? "-" + filters.section : ""}.xlsx`);
      toast("Excel exported", { type: "success" });
    } catch (e) { toast(e.message, { type: "error" }); }
  };
  const exportPdf = async (scope, roll) => {
    try {
      let params = "";
      if (scope === "section" && filters.section) params = `?section=${encodeURIComponent(filters.section)}`;
      if (scope === "individual" && roll) params = `?studentRoll=${encodeURIComponent(roll)}`;
      await api.teacher.exportStudentsPdf(offeringId, params, `students${roll ? "-" + roll : ""}.pdf`);
      toast("PDF exported", { type: "success" });
    } catch (e) { toast(e.message, { type: "error" }); }
  };

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState description={error} onRetry={reload} />;
  if (students.length === 0) return <EmptyState icon="Users" title="No students enrolled" description="No students have registered for this offering yet." />;

  return (
    <div className="space-y-4">
      {/* Filters + Export toolbar */}
      <div className="card-base p-3 flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Name or Roll No" className="input-base w-full pl-8 text-sm" />
        </div>
        <select value={filters.section} onChange={(e) => setFilters({ ...filters, section: e.target.value })} className="input-base text-sm">
          <option value="">All Sections</option>
          {sections.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={filters.cnic} onChange={(e) => setFilters({ ...filters, cnic: e.target.value })} placeholder="CNIC" className="input-base text-sm w-32" />
        <input value={filters.phone} onChange={(e) => setFilters({ ...filters, phone: e.target.value })} placeholder="Phone" className="input-base text-sm w-32" />
        <div className="flex gap-1.5 ml-auto">
          <button onClick={() => exportExcel(filters.section ? "section" : "course")} className="btn-secondary text-xs"><FileSpreadsheet size={13} /> Excel</button>
          <button onClick={() => exportPdf(filters.section ? "section" : "course")} className="btn-secondary text-xs"><FileDown size={13} /> PDF</button>
        </div>
      </div>

      <p className="text-xs text-muted-app">{filtered.length} of {students.length} student(s)</p>

      <div className="card-base overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
              <th className="px-4 py-3">Roll No</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">CNIC</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Section</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.registrationId} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-3 font-mono font-bold text-primary-700">{s.rollNumber}</td>
                <td className="px-4 py-3 font-semibold text-app">{s.name}</td>
                <td className="px-4 py-3 text-xs">{s.cnic || "—"}</td>
                <td className="px-4 py-3 text-xs">{s.phone || "—"}</td>
                <td className="px-4 py-3">{s.section || "—"}</td>
                <td className="px-4 py-3"><Badge color="emerald" size="sm">{(s.status || "").toLowerCase()}</Badge></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setProfile(s)} className="text-primary-600 text-xs font-semibold hover:underline mr-3">Profile</button>
                  <button onClick={() => exportPdf("individual", s.rollNumber)} className="text-muted-app text-xs hover:underline">PDF</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Student profile modal */}
      <Modal open={!!profile} onClose={() => setProfile(null)} title="Student Profile" subtitle={profile?.rollNumber} icon={Users} maxWidth="max-w-lg">
        {profile && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {profile.photoUrl ? (
                <img src={fileUrl(profile.photoUrl)} alt={profile.name} className="w-16 h-16 rounded-full object-cover border border-app" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-xl">{(profile.name || "?")[0]}</div>
              )}
              <div><p className="font-bold text-app text-lg">{profile.name}</p><p className="text-xs font-mono text-muted-app">{profile.rollNumber}</p></div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ["Father Name", profile.fatherName], ["CNIC", profile.cnic], ["Phone", profile.phone],
                ["WhatsApp", profile.whatsapp], ["Email", profile.email], ["Gender", profile.gender],
                ["Date of Birth", profile.dateOfBirth], ["Section", profile.section], ["Program", profile.program],
                ["Address", profile.address],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-[10px] uppercase tracking-wide text-muted-app font-semibold">{k}</dt><dd className="text-app">{v || "—"}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------- Attendance ---------------- */
function AttendanceTab({ offeringId }) {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.teacher.sessions(offeringId), [offeringId]);
  const { data: offData } = useApi(() => api.teacher.offering(offeringId), [offeringId]);
  const sessionsRaw = useMemo(() => data?.sessions || [], [data]);
  const sectionOptions = useMemo(() => (offData?.offering?.sections || []).map((s) => s.name), [offData]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ date: "", topic: "", durationMin: 60, section: "" });
  const [roster, setRoster] = useState(null); // { session, records[] }
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);
  const [filterDate, setFilterDate] = useState("");

  const sessions = useMemo(() => filterDate ? sessionsRaw.filter((s) => s.date === filterDate) : sessionsRaw, [sessionsRaw, filterDate]);

  const createSession = async () => {
    if (!form.date) { toast("Pick a date", { type: "error" }); return; }
    setCreating(true);
    try {
      await api.teacher.createSession(offeringId, { date: form.date, topic: form.section ? `${form.topic ? form.topic + " · " : ""}Section ${form.section}` : form.topic, durationMin: form.durationMin });
      toast("Session created", { type: "success" });
      setForm({ date: "", topic: "", durationMin: 60, section: "" });
      await reload();
    } catch (e) { toast(e.message, { type: "error" }); }
    finally { setCreating(false); }
  };

  const openRoster = async (sessionId) => {
    try {
      const res = await api.teacher.session(sessionId);
      setRoster(res);
      const init = {};
      (res.records || res.roster || []).forEach((r) => { init[r.studentId] = r.status || "PRESENT"; });
      setMarks(init);
    } catch (e) { toast(e.message, { type: "error" }); }
  };

  const saveMarks = async () => {
    const records = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }));
    setSaving(true);
    try {
      const res = await api.teacher.markAttendance(roster.session.id, records);
      toast(res.message || "Attendance saved", { type: "success" });
      setRoster(null);
      await reload();
    } catch (e) { toast(e.message, { type: "error" }); }
    finally { setSaving(false); }
  };

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState description={error} onRetry={reload} />;

  const rosterList = roster ? (roster.records || roster.roster || []) : [];

  return (
    <div className="space-y-4">
      <div className="card-base p-4">
        <h3 className="font-bold text-app mb-3">New Session</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className="text-xs text-muted-app">Date</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-base block mt-1" /></div>
          {sectionOptions.length > 0 && (
            <div><label className="text-xs text-muted-app">Section</label>
              <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="input-base block mt-1">
                <option value="">All</option>
                {sectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className="flex-1 min-w-[160px]"><label className="text-xs text-muted-app">Topic</label><input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Lecture topic" className="input-base block mt-1 w-full" /></div>
          <div><label className="text-xs text-muted-app">Minutes</label><input type="number" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} className="input-base block mt-1 w-24" /></div>
          <button onClick={createSession} disabled={creating} className="btn-primary text-sm">{creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create</button>
        </div>
      </div>

      {/* Smart filter: by date */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-muted-app" />
        <label className="text-xs text-muted-app">Filter by date</label>
        <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="input-base text-sm" />
        {filterDate && <button onClick={() => setFilterDate("")} className="text-xs text-primary-600 hover:underline">Clear</button>}
      </div>

      {sessions.length === 0 ? (
        <EmptyState icon="CalendarCheck" title="No sessions yet" description="Create an attendance session above." />
      ) : (
        <div className="card-base overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 dark:bg-slate-900 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase"><th className="px-4 py-3">Date</th><th className="px-4 py-3">Topic</th><th className="px-4 py-3 text-center">Marked</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3 font-semibold text-app">{fmtDate(s.date)}</td>
                  <td className="px-4 py-3 text-muted-app">{s.topic || "—"}</td>
                  <td className="px-4 py-3 text-center">{s._count?.records ?? 0}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => openRoster(s.id)} className="text-primary-600 font-semibold text-xs hover:underline">Mark →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!roster} onClose={() => !saving && setRoster(null)} title="Mark Attendance" subtitle={roster ? fmtDate(roster.session?.date) : ""} icon={CalendarCheck} maxWidth="max-w-2xl">
        {roster && (
          <div className="space-y-3">
            {rosterList.map((r) => (
              <div key={r.studentId} className="flex items-center justify-between p-2.5 rounded-lg border border-app">
                <div><p className="font-semibold text-app text-sm">{r.name}</p><p className="text-xs text-muted-app font-mono">{r.rollNumber}</p></div>
                <div className="flex gap-1">
                  {["PRESENT", "ABSENT", "LATE", "LEAVE"].map((st) => (
                    <button key={st} onClick={() => setMarks((m) => ({ ...m, [r.studentId]: st }))} className={`px-2 py-1 rounded text-[10px] font-bold transition ${marks[r.studentId] === st ? (st === "PRESENT" ? "bg-emerald-600 text-white" : st === "ABSENT" ? "bg-rose-600 text-white" : st === "LATE" ? "bg-amber-600 text-white" : "bg-blue-600 text-white") : "bg-slate-100 dark:bg-slate-800 text-secondary-app"}`}>{st[0]}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex justify-end"><button onClick={saveMarks} disabled={saving} className="btn-primary text-sm">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save</button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------- Assignments ---------------- */
const EMPTY_ASSIGNMENT = { title: "", description: "", totalMarks: 100, dueDate: "", startTime: "", endTime: "", allowLate: true };
function AssignmentsTab({ offeringId }) {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.teacher.assignments(offeringId), [offeringId]);
  const assignments = data?.assignments || [];

  // Req 9: live statistics. When a student submits, the backend pushes an
  // `assignment` SSE event to this teacher; reload the aggregate counts so
  // Total/Submitted/Pending/Graded update without a manual refresh.
  useRealtime(api.teacher.eventsUrl, {
    assignment: (d) => {
      if (!d || String(d.offeringId) === String(offeringId)) reload();
    },
  }, [offeringId]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_ASSIGNMENT);
  const [busy, setBusy] = useState(false);
  const [subFor, setSubFor] = useState(null); // assignment for submissions view
  const [subs, setSubs] = useState([]);
  const [grades, setGrades] = useState({});
  const [qFor, setQFor] = useState(null); // assignment for questions modal

  const create = async () => {
    if (!form.title) { toast("Title required", { type: "error" }); return; }
    if (!form.dueDate) { toast("Due date required", { type: "error" }); return; }
    setBusy(true);
    try {
      const res = await api.teacher.createAssignment(offeringId, { ...form, totalMarks: parseFloat(form.totalMarks) || 100, isPublished: true });
      toast("Assignment posted — students notified", { type: "success" });
      setShowCreate(false); setForm(EMPTY_ASSIGNMENT);
      await reload();
      if (res.assignment) setQFor(res.assignment); // jump straight to add questions
    } catch (e) { toast(e.message, { type: "error" }); }
    finally { setBusy(false); }
  };

  const del = async (id) => {
    try { await api.teacher.deleteAssignment(id); toast("Deleted", { type: "success" }); await reload(); }
    catch (e) { toast(e.message, { type: "error" }); }
  };

  const togglePublish = async (a) => {
    try { await api.teacher.updateAssignment(a.id, { isPublished: !a.isPublished }); toast(a.isPublished ? "Unpublished" : "Published", { type: "success" }); await reload(); }
    catch (e) { toast(e.message, { type: "error" }); }
  };

  const openSubs = async (a) => {
    setSubFor(a);
    try {
      const res = await api.teacher.submissions(a.id);
      setSubs(res.submissions || []);
      const g = {};
      (res.submissions || []).forEach((s) => { if (s.marks != null) g[s.id] = s.marks; });
      setGrades(g);
    } catch (e) { toast(e.message, { type: "error" }); }
  };

  const grade = async (submissionId) => {
    try {
      await api.teacher.gradeSubmission(submissionId, { marks: parseFloat(grades[submissionId]), feedback: "" });
      toast("Graded — marks now visible to student", { type: "success" });
      await openSubs(subFor); await reload();
    } catch (e) { toast(e.message, { type: "error" }); }
  };

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState description={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={() => setShowCreate(true)} className="btn-primary text-sm"><Plus size={14} /> Create New Assignment</button></div>
      {assignments.length === 0 ? (
        <EmptyState icon="FileText" title="No assignments" description="Create an assignment to get started." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {assignments.map((a) => (
            <article key={a.id} className="assignment-card card-base p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-app">{a.title} {a.isPublished ? <Badge color="emerald" size="sm">Published</Badge> : <Badge color="slate" size="sm">Draft</Badge>}</p>
                  <p className="text-xs text-muted-app">Due {fmtDate(a.dueDate)}{a.startTime ? ` · ${a.startTime}` : ""}{a.endTime ? `–${a.endTime}` : ""} · {a.totalMarks} marks</p>
                </div>
                <button onClick={() => del(a.id)} className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 size={14} /></button>
              </div>
              {/* Stats: Total / Submitted / Pending / Graded */}
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="surface rounded-lg py-1.5 border border-app"><p className="font-extrabold text-app tabular">{a.totalStudents ?? 0}</p><p className="text-[9px] text-muted-app font-semibold uppercase">Total</p></div>
                <div className="surface rounded-lg py-1.5 border border-app"><p className="font-extrabold text-blue-600 dark:text-blue-400 tabular">{a.submitted ?? 0}</p><p className="text-[9px] text-muted-app font-semibold uppercase">Submitted</p></div>
                <div className="surface rounded-lg py-1.5 border border-app"><p className="font-extrabold text-amber-600 dark:text-amber-400 tabular">{a.pending ?? 0}</p><p className="text-[9px] text-muted-app font-semibold uppercase">Pending</p></div>
                <div className="surface rounded-lg py-1.5 border border-app"><p className="font-extrabold text-emerald-600 dark:text-emerald-400 tabular">{a.graded ?? 0}</p><p className="text-[9px] text-muted-app font-semibold uppercase">Graded</p></div>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-auto">
                <button onClick={() => openSubs(a)} className="btn-secondary text-xs"><Eye size={12} /> View / Grade</button>
                <button onClick={() => setQFor(a)} className="btn-secondary text-xs"><FileQuestion size={12} /> Questions</button>
                <button onClick={() => togglePublish(a)} className="btn-secondary text-xs">{a.isPublished ? "Unpublish" : "Publish"}</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Assignment" icon={FileText} maxWidth="max-w-lg">
        <div className="space-y-3">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="input-base w-full" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Instructions" rows={3} className="input-base w-full" />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-app">Total Marks</label><input type="number" value={form.totalMarks} onChange={(e) => setForm({ ...form, totalMarks: e.target.value })} className="input-base w-full mt-1" /></div>
            <div><label className="text-xs text-muted-app">Due Date</label><input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="input-base w-full mt-1" /></div>
            <div><label className="text-xs text-muted-app">Start Time</label><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="input-base w-full mt-1" /></div>
            <div><label className="text-xs text-muted-app">End Time</label><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="input-base w-full mt-1" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowLate} onChange={(e) => setForm({ ...form, allowLate: e.target.checked })} /> Allow late submissions</label>
          <p className="text-[11px] text-muted-app">After creating, you can add MCQ / Short / Descriptive questions manually or generate them with AI.</p>
          <div className="flex justify-end"><button onClick={create} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Post Assignment</button></div>
        </div>
      </Modal>

      <Modal open={!!subFor} onClose={() => setSubFor(null)} title="Submissions" subtitle={subFor?.title} icon={FileText} maxWidth="max-w-3xl">
        {subFor && (
          subs.length === 0 ? <p className="text-sm text-muted-app py-6 text-center">No submissions yet.</p> : (
            <div className="space-y-2">
              {subs.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-app">
                  <div>
                    <p className="font-semibold text-app text-sm">{s.student?.profile?.fullName || s.student?.username || s.studentId}</p>
                    <p className="text-xs text-muted-app">{s.status} · {fmtDate(s.submittedAt)}{s.fileName ? ` · ${s.fileName}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.filePath && <a href={fileUrl(s.filePath)} target="_blank" rel="noreferrer" className="text-primary-600 text-xs"><Download size={14} /></a>}
                    <input type="number" value={grades[s.id] ?? ""} onChange={(e) => setGrades((g) => ({ ...g, [s.id]: e.target.value }))} placeholder="Marks" className="input-base w-20 text-sm" />
                    <span className="text-xs text-muted-app">/{subFor.totalMarks}</span>
                    <button onClick={() => grade(s.id)} className="btn-primary text-xs">Grade</button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </Modal>

      <AssignmentQuestionsModal assignment={qFor} onClose={() => { setQFor(null); reload(); }} />
    </div>
  );
}

/* Assignment questions: manual MCQ/Short/Descriptive + AI generator */
function AssignmentQuestionsModal({ assignment, onClose }) {
  const { toast } = useToast();
  const [questions, setQuestions] = useState([]);
  const [q, setQ] = useState({ text: "", type: "MCQ", options: ["", "", "", ""], correctAnswer: "0", marks: 1 });
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState({ topic: "", count: 5, types: { MCQ: true, SHORT: true, DESCRIPTIVE: false } });
  const [aiBusy, setAiBusy] = useState(false);

  const load = async () => {
    if (!assignment) return;
    try { const res = await api.teacher.assignmentQuestions(assignment.id); setQuestions(res.questions || []); }
    catch (e) { toast(e.message, { type: "error" }); }
  };
  useEffect(() => { if (assignment) load(); /* eslint-disable-next-line */ }, [assignment]);

  if (!assignment) return null;

  const add = async () => {
    if (!q.text) { toast("Question text required", { type: "error" }); return; }
    const payload = {
      text: q.text, type: q.type, marks: parseFloat(q.marks) || 1,
      options: q.type === "MCQ" ? q.options.filter((o) => o.trim()) : [],
      correctAnswer: q.type === "MCQ" ? String(q.correctAnswer) : (q.correctAnswer || ""),
    };
    setBusy(true);
    try {
      await api.teacher.addAssignmentQuestion(assignment.id, payload);
      toast("Question added", { type: "success" });
      setQ({ text: "", type: "MCQ", options: ["", "", "", ""], correctAnswer: "0", marks: 1 });
      await load();
    } catch (e) { toast(e.message, { type: "error" }); }
    finally { setBusy(false); }
  };

  const del = async (qid) => {
    try { await api.teacher.deleteAssignmentQuestion(qid); await load(); }
    catch (e) { toast(e.message, { type: "error" }); }
  };

  const generate = async () => {
    if (!ai.topic.trim()) { toast("Enter a topic", { type: "error" }); return; }
    const types = Object.entries(ai.types).filter(([, v]) => v).map(([k]) => k);
    if (!types.length) { toast("Pick at least one type", { type: "error" }); return; }
    setAiBusy(true);
    try {
      const res = await api.teacher.aiGenerateAssignment(assignment.id, { topic: ai.topic, count: parseInt(ai.count, 10) || 5, types, save: true });
      toast(`AI added ${res.questions?.length || 0} question(s)`, { type: "success" });
      setAi({ ...ai, topic: "" });
      await load();
    } catch (e) { toast(e.message, { type: "error" }); }
    finally { setAiBusy(false); }
  };

  return (
    <Modal open={!!assignment} onClose={onClose} title="Assignment Questions" subtitle={assignment.title} icon={FileQuestion} maxWidth="max-w-3xl">
      <div className="space-y-4">
        {questions.length > 0 && (
          <div className="space-y-2">
            {questions.map((qq, i) => (
              <div key={qq.id} className="p-3 rounded-lg border border-app flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-app">{i + 1}. {qq.text} <span className="text-xs text-muted-app">({qq.marks}m, {qq.type})</span></p>
                <button onClick={() => del(qq.id)} className="text-rose-600 p-1"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        {/* AI generator */}
        <div className="card-base p-4 space-y-3 border border-violet-200 dark:border-violet-900/40">
          <p className="font-bold text-app text-sm flex items-center gap-1.5"><Sparkles size={15} className="text-violet-600" /> Generate by AI</p>
          <input value={ai.topic} onChange={(e) => setAi({ ...ai, topic: e.target.value })} placeholder="Topic name (e.g. Pointers in C)" className="input-base w-full" />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1"><label className="text-xs text-muted-app">Count</label><input type="number" min="1" max="20" value={ai.count} onChange={(e) => setAi({ ...ai, count: e.target.value })} className="input-base w-16 text-sm" /></div>
            {["MCQ", "SHORT", "DESCRIPTIVE"].map((t) => (
              <label key={t} className="flex items-center gap-1 text-xs text-app"><input type="checkbox" checked={ai.types[t]} onChange={(e) => setAi({ ...ai, types: { ...ai.types, [t]: e.target.checked } })} /> {t}</label>
            ))}
            <button onClick={generate} disabled={aiBusy} className="btn-primary text-xs ml-auto">{aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Generate</button>
          </div>
        </div>

        {/* Manual add */}
        <div className="card-base p-4 space-y-3">
          <p className="font-bold text-app text-sm">Add Question Manually</p>
          <input value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} placeholder="Question text" className="input-base w-full" />
          <div className="grid grid-cols-2 gap-3">
            <select value={q.type} onChange={(e) => setQ({ ...q, type: e.target.value, correctAnswer: e.target.value === "MCQ" ? "0" : "" })} className="input-base"><option value="MCQ">MCQ</option><option value="SHORT">Short Answer</option><option value="DESCRIPTIVE">Descriptive</option></select>
            <input type="number" value={q.marks} onChange={(e) => setQ({ ...q, marks: e.target.value })} placeholder="Marks" className="input-base" />
          </div>
          {q.type === "MCQ" ? (
            <div className="space-y-2">
              {q.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input type="radio" name="a-correct" checked={String(q.correctAnswer) === String(oi)} onChange={() => setQ({ ...q, correctAnswer: oi })} />
                  <input value={opt} onChange={(e) => { const n = [...q.options]; n[oi] = e.target.value; setQ({ ...q, options: n }); }} placeholder={`Option ${oi + 1}`} className="input-base flex-1" />
                </div>
              ))}
              <p className="text-[10px] text-muted-app">Select the radio for the correct answer.</p>
            </div>
          ) : (
            <textarea value={q.correctAnswer} onChange={(e) => setQ({ ...q, correctAnswer: e.target.value })} placeholder={q.type === "SHORT" ? "Model answer (optional)" : "Grading rubric / key points (optional)"} rows={2} className="input-base w-full" />
          )}
          <div className="flex justify-end"><button onClick={add} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add</button></div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Quizzes ---------------- */
function QuizzesTab({ offeringId }) {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.teacher.quizzes(offeringId), [offeringId]);
  const quizzes = data?.quizzes || [];
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", durationMin: 15 });
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState(null); // quiz being managed (questions)

  const create = async () => {
    if (!form.title) { toast("Title required", { type: "error" }); return; }
    setBusy(true);
    try {
      const res = await api.teacher.createQuiz(offeringId, { ...form, durationMin: parseInt(form.durationMin, 10) });
      toast("Quiz created — add questions", { type: "success" });
      setShowCreate(false); setForm({ title: "", description: "", durationMin: 15 });
      await reload();
      if (res.quiz) openManage(res.quiz.id);
    } catch (e) { toast(e.message, { type: "error" }); }
    finally { setBusy(false); }
  };

  const openManage = async (quizId) => {
    try { const res = await api.teacher.quiz(quizId); setManage(res.quiz || res); }
    catch (e) { toast(e.message, { type: "error" }); }
  };

  const togglePublish = async (q) => {
    try { await api.teacher.publishQuiz(q.id, !q.isPublished); toast(q.isPublished ? "Unpublished" : "Published", { type: "success" }); await reload(); }
    catch (e) { toast(e.message, { type: "error" }); }
  };

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState description={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={() => setShowCreate(true)} className="btn-primary text-sm"><Plus size={14} /> New Quiz</button></div>
      {quizzes.length === 0 ? (
        <EmptyState icon="FileQuestion" title="No quizzes" description="Create a quiz to get started." />
      ) : (
        <div className="space-y-2">
          {quizzes.map((q) => (
            <div key={q.id} className="card-base p-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-app">{q.title} {q.isPublished ? <Badge color="emerald" size="sm">Published</Badge> : <Badge color="slate" size="sm">Draft</Badge>}</p>
                <p className="text-xs text-muted-app">{q.durationMin} min · {q.totalMarks} marks</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openManage(q.id)} className="btn-secondary text-xs">Questions</button>
                <button onClick={() => togglePublish(q)} className="btn-secondary text-xs">{q.isPublished ? "Unpublish" : "Publish"}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Quiz" icon={FileQuestion}>
        <div className="space-y-3">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="input-base w-full" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} className="input-base w-full" />
          <div><label className="text-xs text-muted-app">Duration (min)</label><input type="number" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} className="input-base w-full mt-1" /></div>
          <div className="flex justify-end"><button onClick={create} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create</button></div>
        </div>
      </Modal>

      <QuestionsModal quiz={manage} onClose={() => { setManage(null); reload(); }} onChange={openManage} />
    </div>
  );
}

function QuestionsModal({ quiz, onClose, onChange }) {
  const { toast } = useToast();
  const [q, setQ] = useState({ text: "", type: "MCQ", options: ["", "", "", ""], correctAnswer: "0", marks: 1 });
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState({ topic: "", count: 5, types: { MCQ: true, SHORT: false, DESCRIPTIVE: false } });
  const [aiBusy, setAiBusy] = useState(false);
  if (!quiz) return null;
  const questions = quiz.questions || [];

  const addQuestion = async () => {
    if (!q.text) { toast("Question text required", { type: "error" }); return; }
    const payload = {
      text: q.text, type: q.type, marks: parseFloat(q.marks),
      options: q.type === "MCQ" ? q.options.filter((o) => o.trim()) : (q.type === "TRUEFALSE" ? ["True", "False"] : []),
      correctAnswer: (q.type === "SHORT" || q.type === "DESCRIPTIVE") ? (q.correctAnswer || "") : String(q.correctAnswer),
    };
    setBusy(true);
    try {
      await api.teacher.addQuestion(quiz.id, payload);
      toast("Question added", { type: "success" });
      setQ({ text: "", type: "MCQ", options: ["", "", "", ""], correctAnswer: "0", marks: 1 });
      onChange(quiz.id);
    } catch (e) { toast(e.message, { type: "error" }); }
    finally { setBusy(false); }
  };

  const delQuestion = async (qid) => {
    try { await api.teacher.deleteQuestion(qid); toast("Removed", { type: "success" }); onChange(quiz.id); }
    catch (e) { toast(e.message, { type: "error" }); }
  };

  const generate = async () => {
    if (!ai.topic.trim()) { toast("Enter a topic", { type: "error" }); return; }
    const types = Object.entries(ai.types).filter(([, v]) => v).map(([k]) => k);
    if (!types.length) { toast("Pick at least one type", { type: "error" }); return; }
    setAiBusy(true);
    try {
      const res = await api.teacher.aiGenerateQuiz(quiz.id, { topic: ai.topic, count: parseInt(ai.count, 10) || 5, types, save: true });
      toast(`AI added ${res.questions?.length || 0} question(s)`, { type: "success" });
      setAi({ ...ai, topic: "" });
      onChange(quiz.id);
    } catch (e) { toast(e.message, { type: "error" }); }
    finally { setAiBusy(false); }
  };

  const opts = q.type === "TRUEFALSE" ? ["True", "False"] : q.options;
  const hasOptions = q.type === "MCQ" || q.type === "TRUEFALSE";

  return (
    <Modal open={!!quiz} onClose={onClose} title="Quiz Questions" subtitle={quiz.title} icon={FileQuestion} maxWidth="max-w-3xl">
      <div className="space-y-4">
        {questions.length > 0 && (
          <div className="space-y-2">
            {questions.map((qq, i) => (
              <div key={qq.id} className="p-3 rounded-lg border border-app flex items-start justify-between gap-2">
                <div><p className="text-sm font-semibold text-app">{i + 1}. {qq.text} <span className="text-xs text-muted-app">({qq.marks}m, {qq.type})</span></p></div>
                <button onClick={() => delQuestion(qq.id)} className="text-rose-600 p-1"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        {/* AI quiz generator */}
        <div className="card-base p-4 space-y-3 border border-violet-200 dark:border-violet-900/40">
          <p className="font-bold text-app text-sm flex items-center gap-1.5"><Sparkles size={15} className="text-violet-600" /> Generate by AI</p>
          <input value={ai.topic} onChange={(e) => setAi({ ...ai, topic: e.target.value })} placeholder="Topic name (e.g. Loops and conditionals)" className="input-base w-full" />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1"><label className="text-xs text-muted-app">Count</label><input type="number" min="1" max="20" value={ai.count} onChange={(e) => setAi({ ...ai, count: e.target.value })} className="input-base w-16 text-sm" /></div>
            {["MCQ", "SHORT", "DESCRIPTIVE"].map((t) => (
              <label key={t} className="flex items-center gap-1 text-xs text-app"><input type="checkbox" checked={ai.types[t]} onChange={(e) => setAi({ ...ai, types: { ...ai.types, [t]: e.target.checked } })} /> {t}</label>
            ))}
            <button onClick={generate} disabled={aiBusy} className="btn-primary text-xs ml-auto">{aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Generate</button>
          </div>
        </div>

        <div className="card-base p-4 space-y-3">
          <p className="font-bold text-app text-sm">Add Question Manually</p>
          <input value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} placeholder="Question text" className="input-base w-full" />
          <div className="grid grid-cols-2 gap-3">
            <select value={q.type} onChange={(e) => setQ({ ...q, type: e.target.value, correctAnswer: e.target.value === "MCQ" || e.target.value === "TRUEFALSE" ? "0" : "" })} className="input-base"><option value="MCQ">MCQ</option><option value="TRUEFALSE">True/False</option><option value="SHORT">Short Answer</option><option value="DESCRIPTIVE">Descriptive</option></select>
            <input type="number" value={q.marks} onChange={(e) => setQ({ ...q, marks: e.target.value })} placeholder="Marks" className="input-base" />
          </div>
          {hasOptions ? (
            <div className="space-y-2">
              {opts.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input type="radio" name="correct" checked={String(q.correctAnswer) === String(oi)} onChange={() => setQ({ ...q, correctAnswer: oi })} />
                  {q.type === "MCQ" ? (
                    <input value={opt} onChange={(e) => { const n = [...q.options]; n[oi] = e.target.value; setQ({ ...q, options: n }); }} placeholder={`Option ${oi + 1}`} className="input-base flex-1" />
                  ) : (
                    <span className="text-sm text-app">{opt}</span>
                  )}
                </div>
              ))}
              <p className="text-[10px] text-muted-app">Select the radio for the correct answer.</p>
            </div>
          ) : (
            <textarea value={q.correctAnswer} onChange={(e) => setQ({ ...q, correctAnswer: e.target.value })} placeholder={q.type === "SHORT" ? "Model answer (optional)" : "Grading rubric / key points (optional)"} rows={2} className="input-base w-full" />
          )}
          <div className="flex justify-end"><button onClick={addQuestion} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add</button></div>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Marks (real-time per-student CRUD) ---------------- */
function MarksTab({ offeringId }) {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.teacher.gradebook(offeringId), [offeringId]);
  const rows = useMemo(() => data?.rows || [], [data]);
  // Client requirement 2.3 — the component columns (and their weightage) come
  // from the coordinator's CourseWeightage, identical to the Gradebook.
  const components = useMemo(() => data?.offering?.components || [
    { key: "assignment", label: "Assignment", marksField: "assignmentMarks", maxField: "assignmentMax", weight: 0 },
    { key: "quiz", label: "Quiz", marksField: "quizMarks", maxField: "quizMax", weight: 0 },
    { key: "mid", label: "Mid", marksField: "midMarks", maxField: "midMax", weight: 0 },
    { key: "final", label: "Final", marksField: "finalMarks", maxField: "finalMax", weight: 0 },
  ], [data]);
  const [edit, setEdit] = useState(null); // studentId being edited
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const startEdit = (r) => {
    setEdit(r.studentId);
    const f = {};
    components.forEach((c) => { f[c.marksField] = r[c.marksField] ?? 0; });
    setForm(f);
  };

  const save = async (r) => {
    setBusy(true);
    try {
      await api.teacher.saveStudentMarks(offeringId, r.studentId, form);
      toast("Marks saved — student notified", { type: "success" });
      setEdit(null);
      await reload();
    } catch (e) { toast(e.message, { type: "error" }); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete recorded marks for ${r.name}?`)) return;
    try { await api.teacher.deleteStudentMarks(offeringId, r.studentId); toast("Marks deleted", { type: "success" }); await reload(); }
    catch (e) { toast(e.message, { type: "error" }); }
  };

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState description={error} onRetry={reload} />;
  if (rows.length === 0) return <EmptyState icon="ClipboardList" title="No students" description="No enrolled students to record marks for." />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-app">Add, edit, or delete each student's component marks. Changes save in real time and notify the student.</p>
      <div className="card-base overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 dark:bg-slate-900 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
            <th className="px-3 py-3">Student</th>
            {components.map((c) => (
              <th key={c.key} className="px-3 py-3 text-center">{c.label}{c.weight ? <span className="block text-[9px] font-normal normal-case text-muted-app">{c.weight}%</span> : null}</th>
            ))}
            <th className="px-3 py-3 text-center">Total%</th><th className="px-3 py-3 text-center">Grade</th><th className="px-3 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const editing = edit === r.studentId;
              return (
                <tr key={r.studentId} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2"><p className="font-semibold text-app">{r.name}</p><p className="text-xs font-mono text-muted-app">{r.rollNumber}</p></td>
                  {components.map((c) => (
                    <td key={c.marksField} className="px-3 py-2 text-center">
                      {editing ? (
                        <input type="number" value={form[c.marksField] ?? ""} onChange={(e) => setForm({ ...form, [c.marksField]: e.target.value })} className="input-base w-16 text-center text-sm" />
                      ) : (
                        <span className="text-app">{r[c.marksField] ?? 0}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-bold">{r.totalPercent != null ? `${r.totalPercent}%` : "—"}</td>
                  <td className="px-3 py-2 text-center">{r.letterGrade ? <Badge color={r.letterGrade === "F" ? "rose" : "emerald"}>{r.letterGrade}</Badge> : "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {editing ? (
                      <>
                        <button onClick={() => save(r)} disabled={busy} className="btn-primary text-xs mr-1">{busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save</button>
                        <button onClick={() => setEdit(null)} className="btn-secondary text-xs">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(r)} className="text-primary-600 text-xs font-semibold hover:underline mr-3">{r.resultId ? "Edit" : "Add"}</button>
                        {r.resultId && <button onClick={() => remove(r)} className="text-rose-600 text-xs hover:underline">Delete</button>}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Gradebook ---------------- */
function GradebookTab({ offeringId }) {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.teacher.gradebook(offeringId), [offeringId]);
  const rows = useMemo(() => data?.rows || [], [data]);
  // Client requirement 2.3 — components (+ weightage) come from the
  // coordinator's CourseWeightage, identical to the Marks module.
  const components = useMemo(() => data?.offering?.components || [
    { key: "assignment", label: "Assignment", marksField: "assignmentMarks", maxField: "assignmentMax", weight: 0 },
    { key: "quiz", label: "Quiz", marksField: "quizMarks", maxField: "quizMax", weight: 0 },
    { key: "mid", label: "Mid", marksField: "midMarks", maxField: "midMax", weight: 0 },
    { key: "final", label: "Final", marksField: "finalMarks", maxField: "finalMax", weight: 0 },
  ], [data]);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    const init = {};
    rows.forEach((r) => {
      const e = {};
      components.forEach((c) => {
        if (c.key === "assignment") e[c.marksField] = r.assignmentMarks ?? r.computedAssignment ?? 0;
        else if (c.key === "quiz") e[c.marksField] = r.quizMarks ?? r.computedQuiz ?? 0;
        else e[c.marksField] = r[c.marksField] ?? 0;
      });
      init[r.studentId] = e;
    });
    setEdits(init);
  }, [rows, components]);

  const setVal = (sid, field, val) => setEdits((e) => ({ ...e, [sid]: { ...e[sid], [field]: val } }));

  const save = async () => {
    const results = rows.map((r) => {
      const row = { studentId: r.studentId };
      components.forEach((c) => {
        row[c.marksField] = parseFloat(edits[r.studentId]?.[c.marksField]) || 0;
        row[c.maxField] = r[c.maxField] ?? 100;
      });
      return row;
    });
    setSaving(true);
    try { const res = await api.teacher.saveResults(offeringId, results); toast(res.message || "Saved", { type: "success" }); await reload(); }
    catch (e) { toast(e.message, { type: "error" }); }
    finally { setSaving(false); }
  };

  const publish = async () => {
    setPublishing(true);
    try { const res = await api.teacher.publishResults(offeringId); toast(res.message || "Published", { type: "success" }); await reload(); }
    catch (e) { toast(e.message, { type: "error" }); }
    finally { setPublishing(false); }
  };

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState description={error} onRetry={reload} />;
  if (rows.length === 0) return <EmptyState icon="Award" title="No students" description="No enrolled students to grade." />;

  const badgeColors = { assignment: "blue", quiz: "purple", mid: "amber", final: "rose", lab: "indigo" };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {components.map((c) => (
            <Badge key={c.key} color={badgeColors[c.key] || "slate"}>{c.label} {c.weight}%</Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="btn-secondary text-sm">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Draft</button>
          <button onClick={publish} disabled={publishing} className="btn-primary text-sm">{publishing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Publish</button>
        </div>
      </div>
      <div className="card-base overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 dark:bg-slate-900 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
            <th className="px-3 py-3">Student</th>
            {components.map((c) => (
              <th key={c.key} className="px-3 py-3 text-center">{c.label}{c.weight ? <span className="block text-[9px] font-normal normal-case text-muted-app">{c.weight}%</span> : null}</th>
            ))}
            <th className="px-3 py-3 text-center">Total%</th><th className="px-3 py-3 text-center">Grade</th><th className="px-3 py-3 text-center">Status</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.studentId} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2"><p className="font-semibold text-app">{r.name}</p><p className="text-xs font-mono text-muted-app">{r.rollNumber}</p></td>
                {components.map((c) => (
                  <td key={c.marksField} className="px-3 py-2 text-center"><input type="number" value={edits[r.studentId]?.[c.marksField] ?? ""} onChange={(e) => setVal(r.studentId, c.marksField, e.target.value)} className="input-base w-16 text-center text-sm" /></td>
                ))}
                <td className="px-3 py-2 text-center font-bold">{r.totalPercent != null ? `${r.totalPercent}%` : "—"}</td>
                <td className="px-3 py-2 text-center">{r.letterGrade ? <Badge color={r.letterGrade === "F" ? "rose" : "emerald"}>{r.letterGrade}</Badge> : "—"}</td>
                <td className="px-3 py-2 text-center text-xs">{r.resultStatus ? <Badge color={r.resultStatus === "PUBLISHED" ? "emerald" : "slate"} size="sm">{r.resultStatus.toLowerCase()}</Badge> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-app">Tip: Assignment/Quiz columns are pre-filled from real submissions &amp; quiz attempts. Adjust then Save Draft, and Publish when ready (visible to students).</p>
    </div>
  );
}

/* ---------------- Announcements ---------------- */
function AnnouncementsTab({ offeringId }) {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.teacher.announcements(offeringId), [offeringId]);
  const list = data?.announcements || [];
  const [form, setForm] = useState({ title: "", message: "" });
  const [busy, setBusy] = useState(false);

  const post = async () => {
    if (!form.title || !form.message) { toast("Title and message required", { type: "error" }); return; }
    setBusy(true);
    try { await api.teacher.createAnnouncement(offeringId, { title: form.title, message: form.message }); toast("Posted — students notified", { type: "success" }); setForm({ title: "", message: "" }); await reload(); }
    catch (e) { toast(e.message, { type: "error" }); }
    finally { setBusy(false); }
  };

  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <ErrorState description={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="card-base p-4 space-y-3">
        <h3 className="font-bold text-app">New Announcement</h3>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="input-base w-full" />
        <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Message" rows={3} className="input-base w-full" />
        <div className="flex justify-end"><button onClick={post} disabled={busy} className="btn-primary text-sm">{busy ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />} Post</button></div>
      </div>
      {list.length === 0 ? (
        <EmptyState icon="Megaphone" title="No announcements" description="Post your first announcement above." />
      ) : (
        <div className="space-y-2">
          {list.map((a) => (
            <div key={a.id} className="card-base p-4">
              <div className="flex items-center justify-between"><p className="font-bold text-app">{a.title}</p><span className="text-xs text-muted-app">{fmtDate(a.createdAt)}</span></div>
              <p className="text-sm text-muted-app mt-1 whitespace-pre-wrap">{a.message || a.body || a.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ManageOffering;

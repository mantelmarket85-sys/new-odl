import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, Search, ChevronLeft, ChevronRight, GraduationCap, BookOpen,
  Filter, X, User, Phone, Mail, MapPin, CalendarDays, BarChart3,
  ClipboardCheck, ArrowRightLeft,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Badge from "../../components/common/Badge";
import Modal from "../../components/common/Modal";
import { useToast } from "../../context/ToastContext";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

const avatarFor = (name) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Student")}&background=2563eb&color=fff&bold=true&size=128`;

const PAGE_SIZE = 10;

const STATUS_TABS = [
  { key: "all", label: "All", countKey: "all" },
  { key: "active", label: "Active", countKey: "active" },
  { key: "suspended", label: "Suspended", countKey: "suspended" },
  { key: "blocked", label: "Blocked", countKey: "blocked" },
  { key: "enrolled", label: "Enrolled", countKey: "enrolled" },
];

const statusColor = (s) =>
  s === "Enrolled" ? "emerald" : s === "Active" ? "blue" : s === "Suspended" ? "amber" : "rose";

const AdminStudents = () => {
  const { toast } = useToast();

  // ---- Server-driven list ----
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("all");
  const [filters, setFilters] = useState({ program: "", batch: "", section: "" });
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ items: [], pagination: { total: 0, totalPages: 1, page: 1 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [counts, setCounts] = useState({ all: 0, active: 0, suspended: 0, blocked: 0, enrolled: 0 });
  const [filterOpts, setFilterOpts] = useState({ programs: [], batches: [], sections: [] });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Load filter options + counts once.
  useEffect(() => {
    api.coordinator.studentsFilters().then(setFilterOpts).catch(() => {});
    api.coordinator.studentsCounts().then(setCounts).catch(() => {});
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), status });
      if (debounced) qs.set("search", debounced);
      if (filters.program) qs.set("program", filters.program);
      if (filters.batch) qs.set("batch", filters.batch);
      if (filters.section) qs.set("section", filters.section);
      const res = await api.coordinator.studentsList(`?${qs.toString()}`);
      setList(res);
    } catch (err) {
      setError(err.message || "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [page, status, debounced, filters]);

  useEffect(() => { loadList(); }, [loadList]);

  const students = list.items || [];
  const pag = list.pagination || { total: 0, totalPages: 1, page: 1 };

  const clearFilters = () => { setFilters({ program: "", batch: "", section: "" }); setPage(1); };
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // ---- Profile modal ----
  const [profileId, setProfileId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const openProfile = async (id) => {
    setProfileId(id);
    setProfile(null);
    setProfileLoading(true);
    try {
      const res = await api.coordinator.studentProfile(id);
      setProfile(res);
    } catch (err) {
      toast(err.message || "Failed to load profile", { type: "error" });
      setProfileId(null);
    } finally {
      setProfileLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Search, filter and inspect student records — all data is read live from the database."
        icon="Users"
        breadcrumb={["Course Coordinator", "Students"]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatCard title="All Students" value={counts.all} icon="Users" color="blue" />
        <StatCard title="Active" value={counts.active} icon="CheckCircle2" color="emerald" delay={0.05} />
        <StatCard title="Enrolled" value={counts.enrolled} icon="GraduationCap" color="indigo" delay={0.1} />
        <StatCard title="Suspended" value={counts.suspended} icon="AlertTriangle" color="amber" delay={0.15} />
        <StatCard title="Blocked" value={counts.blocked} icon="XCircle" color="rose" delay={0.2} />
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              status === t.key ? "bg-primary-600 text-white border-primary-600" : "border-app text-muted-app hover:bg-slate-50 dark:hover:bg-slate-800/40"
            }`}
          >
            {t.label} <span className="opacity-70">({counts[t.countKey] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Search + filter toggle */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID, reg no, roll no, email, CNIC, program, batch…"
            className="input-base pl-9 py-2 text-sm w-full"
          />
        </div>
        <button onClick={() => setShowFilters((v) => !v)} className={`px-3 py-2 rounded-xl border text-sm font-bold inline-flex items-center gap-1.5 ${activeFilterCount ? "border-primary-500 text-primary-600" : "border-app text-muted-app"}`}>
          <Filter size={14} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="card-base p-4 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Program</label>
            <select value={filters.program} onChange={(e) => { setFilters((f) => ({ ...f, program: e.target.value })); setPage(1); }} className="input-base py-2 text-sm w-full">
              <option value="">All programs</option>
              {filterOpts.programs.filter((p) => p && p !== "N/A").map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Batch / Session</label>
            <select value={filters.batch} onChange={(e) => { setFilters((f) => ({ ...f, batch: e.target.value })); setPage(1); }} className="input-base py-2 text-sm w-full">
              <option value="">All batches</option>
              {filterOpts.batches.filter((b) => b && b !== "N/A").map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Section</label>
            <select value={filters.section} onChange={(e) => { setFilters((f) => ({ ...f, section: e.target.value })); setPage(1); }} className="input-base py-2 text-sm w-full">
              <option value="">All sections</option>
              {filterOpts.sections.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={clearFilters} className="px-3 py-2 rounded-xl border border-app text-sm font-bold text-muted-app inline-flex items-center gap-1.5"><X size={14} /> Clear</button>
          </div>
        </div>
      )}

      {error ? (
        <ErrorState title="Couldn't load students" description={error} onRetry={loadList} />
      ) : loading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : students.length === 0 ? (
        <EmptyState icon="Users" title="No students found" description="Try adjusting your search or filters." />
      ) : (
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-app">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-app">Student</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-app">Program</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-muted-app">Batch</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-muted-app">Section</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-muted-app">Enrolled</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-muted-app">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase text-muted-app">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={s.photoUrl ? api.fileUrl?.(s.photoUrl) || avatarFor(s.name) : avatarFor(s.name)} alt="" className="w-9 h-9 rounded-full object-cover" />
                        <div>
                          <p className="font-semibold text-app">{s.name}</p>
                          <p className="text-xs text-muted-app">{s.roll}{s.regNo ? ` · ${s.regNo}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-app">{s.programShort || s.program || "—"}</td>
                    <td className="px-4 py-3 text-center text-muted-app">{s.batch || "—"}</td>
                    <td className="px-4 py-3 text-center text-muted-app">{s.section || "—"}</td>
                    <td className="px-4 py-3 text-center font-bold text-app">{s.enrolledCount}</td>
                    <td className="px-4 py-3 text-center"><Badge color={statusColor(s.status)}>{s.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openProfile(s.id)} className="px-2.5 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 inline-flex items-center gap-1 text-xs font-bold border border-blue-200 dark:border-blue-500/30">
                        <User size={12} /> Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-app text-xs text-muted-app">
            <span>Page {pag.page} of {pag.totalPages} · {pag.total} student(s)</span>
            <div className="flex gap-2">
              <button disabled={pag.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 rounded-lg border border-app font-bold disabled:opacity-40 inline-flex items-center gap-1"><ChevronLeft size={13} /> Prev</button>
              <button disabled={pag.page >= pag.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-app font-bold disabled:opacity-40 inline-flex items-center gap-1">Next <ChevronRight size={13} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Profile modal */}
      <Modal open={!!profileId} onClose={() => setProfileId(null)} title="Student Profile" subtitle="Complete academic & personal record." icon={User} maxWidth="max-w-3xl">
        {profileLoading || !profile ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <StudentProfileView profile={profile} />
        )}
      </Modal>
    </div>
  );
};

/* ---- Profile detail (read-only sections) ---- */
function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app">{label}</p>
      <p className="text-sm text-app">{value || "—"}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card-base p-4">
      <p className="text-sm font-bold text-app mb-3 flex items-center gap-1.5"><Icon size={15} className="text-primary-600" /> {title}</p>
      {children}
    </div>
  );
}

function StudentProfileView({ profile }) {
  const s = profile.student;
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Header */}
      <div className="flex items-center gap-4">
        <img src={s.photoUrl ? api.fileUrl?.(s.photoUrl) || avatarFor(s.personal.fullName) : avatarFor(s.personal.fullName)} alt="" className="w-16 h-16 rounded-2xl object-cover" />
        <div>
          <p className="text-lg font-bold text-app">{s.personal.fullName}</p>
          <p className="text-xs text-muted-app">{s.academic.rollNumber}{s.academic.registrationNumber ? ` · ${s.academic.registrationNumber}` : ""}</p>
          <Badge color={s.isActive ? "emerald" : "rose"}>{s.isActive ? "Active" : "Inactive"}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Section icon={User} title="Personal">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full Name" value={s.personal.fullName} />
            <Field label="Father Name" value={s.personal.fatherName} />
            <Field label="CNIC" value={s.personal.cnic} />
            <Field label="Gender" value={s.personal.gender} />
            <Field label="Date of Birth" value={fmtDate(s.personal.dateOfBirth)} />
          </div>
        </Section>

        <Section icon={GraduationCap} title="Academic & Program">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Program" value={s.academic.program} />
            <Field label="Short Form" value={s.academic.programShort} />
            <Field label="Department" value={s.academic.department} />
            <Field label="Roll Number" value={s.academic.rollNumber} />
            <Field label="Reg. Number" value={s.academic.registrationNumber} />
            <Field label="Semester" value={s.academic.semester} />
            <Field label="Section" value={s.academic.section} />
            <Field label="Session" value={s.academic.session || s.academic.batch} />
            <Field label="Enrollment Date" value={fmtDate(s.academic.enrollmentDate)} />
          </div>
        </Section>

        <Section icon={Phone} title="Contact">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email" value={s.contact.email} />
            <Field label="Phone" value={s.contact.phone} />
            <Field label="WhatsApp" value={s.contact.whatsapp} />
            <Field label="Address" value={s.contact.address} />
          </div>
        </Section>

        <Section icon={BarChart3} title="Summary">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Attendance" value={`${profile.attendanceSummary.percent}% (${profile.attendanceSummary.present}/${profile.attendanceSummary.totalRecords})`} />
            <Field label="Avg. Performance" value={profile.academicPerformance.averagePercent ? `${profile.academicPerformance.averagePercent}%` : "—"} />
            <Field label="Last Login" value={s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : "Never"} />
            <Field label="Joined" value={fmtDate(s.createdAt)} />
          </div>
        </Section>
      </div>

      {/* Enrollment history */}
      <Section icon={BookOpen} title={`Enrollment History (${profile.enrollmentHistory.length})`}>
        {profile.enrollmentHistory.length === 0 ? (
          <p className="text-sm text-muted-app">No enrollment records.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-app">
                <tr className="text-left">
                  <th className="py-1.5">Course</th><th className="py-1.5 text-center">Credits</th>
                  <th className="py-1.5">Term</th><th className="py-1.5 text-center">Section</th>
                  <th className="py-1.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {profile.enrollmentHistory.map((e) => (
                  <tr key={e.id}>
                    <td className="py-1.5 text-app">{e.course}</td>
                    <td className="py-1.5 text-center text-muted-app">{e.credits}</td>
                    <td className="py-1.5 text-muted-app">{e.term || "—"}</td>
                    <td className="py-1.5 text-center text-muted-app">{e.section || "—"}</td>
                    <td className="py-1.5 text-center"><Badge color={e.status === "ENROLLED" ? "emerald" : e.status === "DROPPED" ? "rose" : "amber"}>{e.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Academic performance */}
      {profile.academicPerformance.courses.length > 0 && (
        <Section icon={ClipboardCheck} title="Academic Performance (Published Results)">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-app">
                <tr className="text-left">
                  <th className="py-1.5">Course</th><th className="py-1.5 text-center">Credits</th>
                  <th className="py-1.5 text-center">%</th><th className="py-1.5 text-center">Grade</th><th className="py-1.5 text-center">GPA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {profile.academicPerformance.courses.map((c, i) => (
                  <tr key={i}>
                    <td className="py-1.5 text-app">{c.course}</td>
                    <td className="py-1.5 text-center text-muted-app">{c.credits}</td>
                    <td className="py-1.5 text-center text-muted-app">{c.percent ?? "—"}</td>
                    <td className="py-1.5 text-center font-bold text-app">{c.grade || "—"}</td>
                    <td className="py-1.5 text-center text-muted-app">{c.gpa ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

export default AdminStudents;

import { motion } from "framer-motion";
import { Search, Filter, Grid3x3, List, BookOpen, FlaskConical } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader";
import { SkeletonCard } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api, { fileUrl } from "../../services/api";
import { formatCredits, courseHasLab } from "../../utils/credit";

// Deterministic gradient per course code so cards stay visually varied
// without relying on mock colors.
const GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-sky-600",
];
const gradientFor = (key = "") => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
};

const teacherName = (offering) => {
  const t = offering?.teacher;
  if (!t) return "TBA";
  return t.profile?.fullName || t.username || "TBA";
};

// Real instructor photo (from the teacher's live LmsStudentProfile). Returns the
// uploaded photo URL when set, otherwise null so the caller can fall back to a
// generated avatar. Updates in real time when the teacher changes their photo.
const teacherPhoto = (offering) => {
  const url = offering?.teacher?.profile?.photoUrl;
  return url ? fileUrl(url) : null;
};

// Generated initials avatar used only when the instructor has no real photo.
const avatarFor = (name) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Instructor")}&background=2563eb&color=fff`;

const Courses = () => {
  const navigate = useNavigate();
  const [view, setView] = useState("grid");
  const [search, setSearch] = useState("");
  const { data, loading, error, reload } = useApi(() => api.student.courses(), []);

  // Normalize registration rows into a flat course view-model.
  const courses = useMemo(() => {
    const rows = data?.courses || [];
    return rows.map((r) => {
      const o = r.offering || {};
      const c = o.course || {};
      const att = r.attendance || o.attendance || null;
      return {
        registrationId: r.id,
        offeringId: r.offeringId,
        code: c.code || "—",
        title: c.title || "Untitled Course",
        credits: c.creditHours != null ? formatCredits(c) : "—",
        program: c.program?.shortForm || c.program?.name || "",
        instructor: teacherName(o),
        instructorPhoto: teacherPhoto(o),
        students: o._count?.registrations ?? null,
        status: r.status,
        attendance: att?.percentage ?? null,
        gradient: gradientFor(c.code || c.title),
        hasLab: courseHasLab(c),
        labCredit: c.labCredit != null ? c.labCredit : null,
      };
    });
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) => c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [courses, search]);

  // Render list: every course card, plus a SEPARATE distinct lab card for
  // every course that has a lab component (Req 3.1).
  const cards = useMemo(() => {
    const list = [];
    for (const c of filtered) {
      list.push({ ...c, kind: "course", key: `course-${c.registrationId}` });
      if (c.hasLab) list.push({ ...c, kind: "lab", key: `lab-${c.registrationId}` });
    }
    return list;
  }, [filtered]);

  const openCourse = (offeringId) => navigate(`/student/courses/${offeringId}`);

  return (
    <div>
      <PageHeader
        title="My Courses"
        subtitle={
          loading
            ? "Loading your enrolled courses…"
            : `Currently enrolled in ${courses.length} course${courses.length === 1 ? "" : "s"}`
        }
        icon="BookOpen"
        breadcrumb={["Dashboard", "My Courses"]}
        actions={
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search courses..."
                className="pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
              />
            </div>
            <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
              <button onClick={() => setView("grid")} className={`p-1.5 rounded-lg ${view === "grid" ? "bg-primary-600 text-white" : "text-slate-500 dark:text-slate-400"}`}>
                <Grid3x3 size={16} />
              </button>
              <button onClick={() => setView("list")} className={`p-1.5 rounded-lg ${view === "list" ? "bg-primary-600 text-white" : "text-slate-500 dark:text-slate-400"}`}>
                <List size={16} />
              </button>
            </div>
          </>
        }
      />

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <ErrorState
          title="Couldn't load your courses"
          description={error}
          onRetry={reload}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="BookOpen"
          title={search ? "No matching courses" : "No courses yet"}
          description={
            search
              ? "Try a different search term."
              : "You are not yet enrolled in any courses. You are automatically enrolled in your 1st-semester Scheme of Study courses — check back shortly."
          }
        />
      ) : view === "grid" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c, i) => (
            c.kind === "lab" ? (
              <motion.div
                key={c.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-900/40 ring-1 ring-indigo-100 dark:ring-indigo-900/30 shadow-soft overflow-hidden card-hover"
              >
                <div className="relative h-32 bg-gradient-to-br from-indigo-600 to-cyan-600 p-5 text-white">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                  <div className="flex items-center gap-2 mb-3">
                    <FlaskConical size={30} />
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">Lab</span>
                  </div>
                  <p className="text-xs opacity-90 font-mono">{c.code} · LAB</p>
                  <p className="font-display font-bold text-lg leading-tight">{c.title} — Lab</p>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Lab credit:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{c.labCredit != null ? c.labCredit : "1"} (of {c.credits})</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      <p className="font-semibold text-indigo-600 dark:text-indigo-400">{c.program}</p>
                      <p>Lab component</p>
                    </div>
                    <button
                      onClick={() => navigate("/student/lab-tasks")}
                      className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-xs font-bold rounded-lg hover:opacity-90 inline-flex items-center gap-1"
                    >
                      <FlaskConical size={13} /> Lab Tasks
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
            <motion.div
              key={c.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-soft overflow-hidden card-hover"
            >
              <div className={`relative h-32 bg-gradient-to-br ${c.gradient} p-5 text-white`}>
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                <div className="absolute -right-2 -bottom-6 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
                <BookOpen size={32} className="mb-3" />
                <p className="text-xs opacity-90 font-mono">{c.code}</p>
                <p className="font-display font-bold text-lg leading-tight">{c.title}</p>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <img
                    src={c.instructorPhoto || avatarFor(c.instructor)}
                    onError={(e) => { e.currentTarget.src = avatarFor(c.instructor); }}
                    className="w-7 h-7 rounded-full object-cover"
                    alt={c.instructor}
                  />
                  <div className="text-xs">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">{c.instructor}</p>
                    <p className="text-slate-500 dark:text-slate-400">
                      {c.students != null ? `${c.students} students · ` : ""}{c.credits} cr
                    </p>
                  </div>
                </div>
                {c.attendance != null && (
                  <div className="space-y-1 mb-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-semibold">Attendance</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{c.attendance}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${c.attendance}%` }}
                        transition={{ delay: i * 0.1, duration: 0.8 }}
                        className={`h-full bg-gradient-to-r ${c.gradient} rounded-full`}
                      />
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    <p className="font-semibold text-primary-600">{c.program}</p>
                    <p className="capitalize">{(c.status || "").toLowerCase()}</p>
                  </div>
                  <button
                    onClick={() => openCourse(c.offeringId)}
                    className="px-3 py-1.5 bg-primary-600 text-white text-xs font-bold rounded-lg hover:bg-primary-700"
                  >
                    Open Course
                  </button>
                </div>
              </div>
            </motion.div>
            )
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Instructor</th>
                <th className="px-4 py-3">Credits</th>
                <th className="px-4 py-3">Attendance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.key} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900">
                  <td className="px-4 py-3 font-mono font-bold text-primary-700">{c.code}{c.kind === "lab" ? " · LAB" : ""}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{c.kind === "lab" ? <span className="inline-flex items-center gap-1"><FlaskConical size={13} className="text-indigo-600" />{c.title} — Lab</span> : c.title}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{c.instructor}</td>
                  <td className="px-4 py-3">{c.credits}</td>
                  <td className="px-4 py-3">
                    {c.attendance != null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                          <div className={`h-full bg-gradient-to-r ${c.gradient} rounded-full`} style={{ width: `${c.attendance}%` }} />
                        </div>
                        <span className="text-xs font-bold">{c.attendance}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">{(c.status || "").toLowerCase()}</td>
                  <td className="px-4 py-3">
                    {c.kind === "lab"
                      ? <button onClick={() => navigate("/student/lab-tasks")} className="text-indigo-600 font-semibold text-xs hover:underline">Lab Tasks →</button>
                      : <button onClick={() => openCourse(c.offeringId)} className="text-primary-600 font-semibold text-xs hover:underline">Open →</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Courses;

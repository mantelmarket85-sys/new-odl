import { motion } from "framer-motion";
import { Users, BookOpen, FileText, FileQuestion, Search, Video, Settings2, FlaskConical } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader";
import { SkeletonCard } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { formatCredits, courseHasLab } from "../../utils/credit";

const Subjects = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data, loading, error, reload } = useApi(() => api.teacher.offerings(), []);

  const offerings = useMemo(() => data?.offerings || [], [data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return offerings;
    return offerings.filter((o) => `${o.course?.code} ${o.course?.title}`.toLowerCase().includes(q));
  }, [offerings, search]);

  // Render list: every offering yields its regular course card, and every LAB
  // course additionally yields a SEPARATE, distinct lab card (Req 1.1).
  const cards = useMemo(() => {
    const list = [];
    for (const o of filtered) {
      list.push({ kind: "course", offering: o });
      if (courseHasLab(o.course)) list.push({ kind: "lab", offering: o });
    }
    return list;
  }, [filtered]);

  const totals = useMemo(() => ({
    courses: offerings.length,
    labs: offerings.filter((o) => courseHasLab(o.course)).length,
    students: offerings.reduce((a, o) => a + (o._count?.registrations || 0), 0),
    quizzes: offerings.reduce((a, o) => a + (o._count?.quizzes || 0), 0),
    assignments: offerings.reduce((a, o) => a + (o._count?.assignments || 0), 0),
  }), [offerings]);

  return (
    <div>
      <PageHeader
        title="My Courses"
        subtitle="All course offerings assigned to you"
        icon="BookOpen"
        breadcrumb={["Dashboard", "My Courses"]}
        actions={
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses..." className="pl-9 pr-3 py-2 input-base w-full sm:w-64" />
          </div>
        }
      />

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : offerings.length === 0 ? (
        <EmptyState icon="BookOpen" title="No courses assigned" description="You have not been assigned to teach any course offerings yet." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[
              { label: "Active Courses", value: totals.courses, icon: BookOpen, color: "from-emerald-500 to-teal-500" },
              { label: "Lab Courses", value: totals.labs, icon: FlaskConical, color: "from-indigo-500 to-cyan-500" },
              { label: "Total Students", value: totals.students, icon: Users, color: "from-blue-500 to-indigo-500" },
              { label: "Quizzes", value: totals.quizzes, icon: FileQuestion, color: "from-violet-500 to-purple-500" },
              { label: "Assignments", value: totals.assignments, icon: FileText, color: "from-amber-500 to-orange-500" },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card-base p-4 flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.color} text-white flex items-center justify-center shadow`}><s.icon size={20} /></div>
                <div><p className="text-2xl font-extrabold text-app tabular">{s.value}</p><p className="text-xs text-muted-app">{s.label}</p></div>
              </motion.div>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {cards.map((entry, i) => {
              const o = entry.offering;
              const c = o.course || {};
              const sections = Array.isArray(o.sections) ? o.sections : [];
              const sectionLabel = sections.length ? sections.map((s) => s.name).join(", ") : "—";
              const semesterLabel = c.semester?.title || (c.semester?.number ? `Semester ${c.semester.number}` : "—");

              // ---- LAB CARD (Req 1.1) — distinct card for the lab component ----
              if (entry.kind === "lab") {
                return (
                  <motion.article
                    key={`lab-${o.id}`}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="lab-card card-base overflow-hidden card-hover flex flex-col ring-1 ring-indigo-200 dark:ring-indigo-900/40"
                  >
                    <header className="bg-gradient-to-br from-indigo-600 to-cyan-600 p-5 text-white relative overflow-hidden">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                      <div className="flex items-center gap-2 mb-2">
                        <FlaskConical size={24} />
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">Lab</span>
                      </div>
                      <p className="text-[11px] opacity-90 font-mono">{c.code} · LAB · {o.term?.title}</p>
                      <p className="font-display font-bold text-lg leading-tight">{c.title} — Lab</p>
                    </header>

                    <div className="p-4 flex flex-col gap-3 flex-1">
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-app font-semibold">Semester</dt>
                          <dd className="font-semibold text-app">{semesterLabel}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-app font-semibold">Section</dt>
                          <dd className="font-semibold text-app">{sectionLabel}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-app font-semibold">Lab Credit</dt>
                          <dd className="font-semibold text-app">{c.labCredit != null ? c.labCredit : "1"} (of {formatCredits(c)})</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-app font-semibold">Enrolled Students</dt>
                          <dd className="font-semibold text-app flex items-center gap-1"><Users size={13} className="text-indigo-600 dark:text-indigo-400" />{o._count?.registrations ?? 0}</dd>
                        </div>
                      </dl>

                      <div className="grid grid-cols-1 gap-2 mt-auto pt-1">
                        <button onClick={() => navigate(`/teacher/lab-tasks?offeringId=${o.id}`)} className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-indigo-600 to-cyan-600 text-white hover:opacity-90 transition">
                          <FlaskConical size={14} /> Manage Lab Tasks
                        </button>
                      </div>
                    </div>
                  </motion.article>
                );
              }

              // ---- REGULAR COURSE CARD ----
              return (
                <motion.article key={`course-${o.id}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="course-card card-base overflow-hidden card-hover flex flex-col">
                  <header className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl" />
                    <BookOpen size={26} className="mb-2" />
                    <p className="text-[11px] opacity-90 font-mono">{c.code} · {o.term?.title}</p>
                    <p className="font-display font-bold text-lg leading-tight">{c.title}</p>
                  </header>

                  <div className="p-4 flex flex-col gap-3 flex-1">
                    {/* Course meta details */}
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-muted-app font-semibold">Semester</dt>
                        <dd className="font-semibold text-app">{semesterLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-muted-app font-semibold">Section</dt>
                        <dd className="font-semibold text-app">{sectionLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-muted-app font-semibold">Credit Hours</dt>
                        <dd className="font-semibold text-app">{formatCredits(c)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wide text-muted-app font-semibold">Enrolled Students</dt>
                        <dd className="font-semibold text-app flex items-center gap-1"><Users size={13} className="text-primary-600 dark:text-primary-400" />{o._count?.registrations ?? 0}</dd>
                      </div>
                    </dl>

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-2 mt-auto pt-1">
                      <button onClick={() => navigate(`/teacher/offerings/${o.id}?tab=quizzes&scope=quizzes`)} className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-app surface hover:bg-violet-50 dark:hover:bg-violet-900/20 text-violet-700 dark:text-violet-300 transition">
                        <FileQuestion size={14} /> Quizzes
                      </button>
                      <button onClick={() => navigate(`/teacher/offerings/${o.id}?tab=assignments&scope=assignments`)} className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-app surface hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-700 dark:text-amber-300 transition">
                        <FileText size={14} /> Assignments
                      </button>
                      <button onClick={() => navigate(`/teacher/lectures`)} className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border border-app surface hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-700 dark:text-blue-300 transition">
                        <Video size={14} /> Upload Lectures
                      </button>
                      <button onClick={() => navigate(`/teacher/offerings/${o.id}`)} className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-primary-600 text-white hover:bg-primary-700 transition">
                        <Settings2 size={14} /> Manage Course
                      </button>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Subjects;

import { motion } from "framer-motion";
import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BookOpen, FileText, Video, Link2, Download, Search, File, Eye, ArrowLeft,
  User, CalendarDays, Layers, GraduationCap,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import ResourceViewer from "../../components/common/ResourceViewer";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { fileUrl } from "../../services/api";

const typeMeta = (t) => {
  const v = (t || "").toUpperCase();
  if (v === "VIDEO") return { icon: Video, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-900/30" };
  if (v === "LINK" || v === "URL") return { icon: Link2, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" };
  if (v === "FILE" || v === "DOCUMENT" || v === "PDF") return { icon: FileText, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" };
  return { icon: File, color: "text-slate-600", bg: "bg-slate-50 dark:bg-slate-800" };
};

const resolveUrl = (it) => {
  if (it.url && /^https?:\/\//i.test(it.url)) return it.url;
  if (it.filePath && /^https?:\/\//i.test(it.filePath)) return it.filePath;
  if (it.filePath) return fileUrl(it.filePath);
  if (it.url) return fileUrl(it.url);
  if (it.fileName) return fileUrl(it.fileName);
  return null;
};

const fmtDate = (d) => {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; }
};

// Deterministic gradient per course code so cards look distinct.
const GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-sky-600",
];
const gradientFor = (code) => {
  let h = 0;
  for (const ch of String(code)) h = (h * 31 + ch.charCodeAt(0)) % GRADIENTS.length;
  return GRADIENTS[h];
};

const Library = () => {
  const [searchParams] = useSearchParams();
  const { data, loading, error, reload } = useApi(() => api.student.library(), []);

  // Selected course → opens its resource list.
  const [active, setActive] = useState(null); // { offeringId, ... }
  const [resData, setResData] = useState(null);
  const [resLoading, setResLoading] = useState(false);
  const [resError, setResError] = useState("");
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState(null);

  const courses = useMemo(() => data?.courses || [], [data]);

  // Deep-link: ?course=<code> opens that course directly.
  useEffect(() => {
    const code = searchParams.get("course");
    if (code && courses.length) {
      const found = courses.find((c) => c.courseCode === code);
      if (found) openCourse(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses]);

  const openCourse = (course) => {
    setActive(course);
    setResLoading(true);
    setResError("");
    setQ("");
    api.student.libraryCourse(course.offeringId)
      .then((r) => setResData(r))
      .catch((e) => setResError(e.message || "Failed to load resources"))
      .finally(() => setResLoading(false));
  };

  const closeCourse = () => { setActive(null); setResData(null); };

  const filteredResources = useMemo(() => {
    const items = resData?.resources || [];
    const ql = q.trim().toLowerCase();
    if (!ql) return items;
    return items.filter((it) => (it.title || "").toLowerCase().includes(ql) || (it.fileName || "").toLowerCase().includes(ql));
  }, [resData, q]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Course Library" subtitle="Your enrolled courses and their resources" icon="BookOpen" breadcrumb={["Dashboard", "Course Library"]} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      </div>
    );
  }

  // ---- Course detail view ----
  if (active) {
    return (
      <div>
        <PageHeader title="Course Library" subtitle={`${active.courseCode} — ${active.courseTitle}`} icon="BookOpen" breadcrumb={["Dashboard", "Course Library", active.courseCode]} />
        <button onClick={closeCourse} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700 mb-4"><ArrowLeft size={15} /> Back to courses</button>

        <div className="card-base p-5 mb-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-app font-bold"><GraduationCap size={15} className="text-primary-600" /> {active.courseTitle}</span>
            <span className="inline-flex items-center gap-1.5 text-muted-app"><User size={14} /> {active.teacherName}</span>
            <span className="inline-flex items-center gap-1.5 text-muted-app"><CalendarDays size={14} /> {active.semester}</span>
            <span className="inline-flex items-center gap-1.5 text-muted-app"><Layers size={14} /> {(resData?.total ?? active.resourceCount)} resource{(resData?.total ?? active.resourceCount) === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div className="relative mb-4 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search resources..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>

        {resLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : resError ? (
          <ErrorState description={resError} onRetry={() => openCourse(active)} />
        ) : filteredResources.length === 0 ? (
          <EmptyState icon="BookOpen" title="No resources" description="No resources have been uploaded for this course yet." />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {filteredResources.map((it, ii) => {
              const m = typeMeta(it.type);
              const Icon = m.icon;
              const url = resolveUrl(it);
              return (
                <div key={it.id || ii} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className={`p-2 rounded-lg ${m.bg}`}><Icon size={16} className={m.color} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{it.title}</p>
                    <p className="text-[11px] text-slate-400">{it.week != null ? `Week ${it.week} · ` : ""}{fmtDate(it.createdAt)}</p>
                  </div>
                  {url ? (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setViewing({ url, title: it.title, fileName: it.fileName })} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"><Eye size={13} /> View</button>
                      <a href={url} target="_blank" rel="noreferrer" download title="Download" className="inline-flex items-center justify-center px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"><Download size={13} /></a>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Unavailable</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <ResourceViewer open={!!viewing} onClose={() => setViewing(null)} resource={viewing} />
      </div>
    );
  }

  // ---- Course cards grid ----
  return (
    <div>
      <PageHeader title="Course Library" subtitle="Browse resources for the courses you are enrolled in" icon="BookOpen" breadcrumb={["Dashboard", "Course Library"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : courses.length === 0 ? (
        <EmptyState icon="BookOpen" title="No enrolled courses" description="Once you are enrolled in courses, their libraries will appear here." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c, i) => (
            <motion.button
              key={c.offeringId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => openCourse(c)}
              className="text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden hover:shadow-lg hover:border-primary-300 dark:hover:border-primary-700 transition group"
            >
              <div className={`h-20 bg-gradient-to-br ${gradientFor(c.courseCode)} p-4 flex flex-col justify-between`}>
                <div className="flex items-center justify-between">
                  <span className="text-white/90 font-mono text-xs font-bold bg-white/20 px-2 py-0.5 rounded-md">{c.courseCode}</span>
                  <BookOpen size={20} className="text-white/80" />
                </div>
                <p className="text-white font-display font-bold text-sm line-clamp-1">{c.courseTitle}</p>
              </div>
              <div className="p-4 space-y-2">
                <p className="text-sm font-bold text-app line-clamp-1">{c.courseTitle}</p>
                <div className="space-y-1.5 text-xs text-muted-app">
                  <p className="flex items-center gap-1.5"><User size={13} /> {c.teacherName}</p>
                  <p className="flex items-center gap-1.5"><CalendarDays size={13} /> {c.semester}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-600 dark:text-primary-400">
                    <Layers size={13} /> {c.resourceCount} resource{c.resourceCount === 1 ? "" : "s"}
                  </span>
                  <span className="text-xs font-semibold text-muted-app group-hover:text-primary-600">Open →</span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Library;

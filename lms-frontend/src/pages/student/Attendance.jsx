import { motion } from "framer-motion";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CalendarCheck, TrendingUp, AlertTriangle, CheckCircle2, ArrowLeft,
  Video, MonitorPlay, User, PlayCircle, Circle,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

// Status → color theme.
const statusTheme = (status) => {
  switch (status) {
    case "Excellent": return { text: "text-emerald-600", ring: "#10b981", bg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" };
    case "Good": return { text: "text-blue-600", ring: "#3b82f6", bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" };
    case "Warning": return { text: "text-amber-600", ring: "#f59e0b", bg: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
    default: return { text: "text-rose-600", ring: "#ef4444", bg: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" };
  }
};

// Reusable circular progress ring.
const CircularProgress = ({ value = 0, size = 96, stroke = 9, color = "#10b981", label }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-100 dark:text-slate-800" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-extrabold text-lg text-app">{value}%</span>
        {label && <span className="text-[9px] text-muted-app font-semibold uppercase">{label}</span>}
      </div>
    </div>
  );
};

const fmtDate = (d) => { if (!d) return "—"; try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
const dayName = (d) => { if (!d) return "—"; try { return new Date(d).toLocaleDateString("en-GB", { weekday: "long" }); } catch { return "—"; } };

// ---- Course detail (semester attendance for one course) ----
const CourseDetail = ({ course, onBack, onWatched }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true); setError("");
    api.student.courseAttendance(course.offeringId)
      .then((r) => setData(r))
      .catch((e) => setError(e.message || "Failed to load attendance"))
      .finally(() => setLoading(false));
  }, [course.offeringId]);

  useEffect(() => { load(); }, [load]);

  // Point 6 — manual "mark watched" for recorded lectures has been removed.
  // Attendance is now granted automatically from real watch progress (handled
  // in the Recorded Lectures player). This view is read-only for recorded
  // lecture attendance; live-class attendance is unchanged.
  const theme = statusTheme(data?.status);

  return (
    <div>
      <PageHeader title="Attendance" subtitle={`${course.courseCode} — ${course.courseTitle}`} icon="CalendarCheck" breadcrumb={["Dashboard", "Attendance", course.courseCode]} />
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700 mb-4"><ArrowLeft size={15} /> Back to overview</button>

      {loading ? (
        <div className="space-y-4"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-5">
            <div className="card-base p-5 flex flex-col items-center justify-center lg:col-span-1">
              <CircularProgress value={data.overallPercentage} size={120} stroke={11} color={theme.ring} label="Overall" />
              <span className={`mt-3 text-xs font-bold px-3 py-1 rounded-full ${theme.bg}`}>{data.status}</span>
            </div>
            <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-2 gap-4">
              <div className="card-base p-4">
                <div className="flex items-center gap-2 mb-2 text-blue-600"><MonitorPlay size={18} /><span className="text-xs font-bold uppercase">Live Classes ({data.liveWeight}%)</span></div>
                <p className="text-2xl font-display font-extrabold text-app">{data.livePercentage}%</p>
                <p className="text-xs text-muted-app mt-1">{data.attendedLiveClasses} / {data.totalLiveClasses} attended</p>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full mt-2"><div className="h-full rounded-full bg-blue-500" style={{ width: `${data.livePercentage}%` }} /></div>
              </div>
              <div className="card-base p-4">
                <div className="flex items-center gap-2 mb-2 text-violet-600"><Video size={18} /><span className="text-xs font-bold uppercase">Recorded ({data.recordedWeight}%)</span></div>
                <p className="text-2xl font-display font-extrabold text-app">{data.recordedPercentage}%</p>
                <p className="text-xs text-muted-app mt-1">{data.watchedRecordedLectures} / {data.totalRecordedLectures} watched</p>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full mt-2"><div className="h-full rounded-full bg-violet-500" style={{ width: `${data.recordedPercentage}%` }} /></div>
              </div>
              <div className="card-base p-4 col-span-2 flex items-center gap-4 flex-wrap text-sm">
                <span className="inline-flex items-center gap-1.5 text-muted-app"><User size={14} /> {data.teacherName}</span>
                <span className="text-emerald-600 font-semibold">Present: {data.present}</span>
                <span className="text-rose-600 font-semibold">Absent: {data.absent}</span>
                <span className="text-amber-600 font-semibold">Late: {data.late}</span>
                <span className="text-blue-600 font-semibold">Leave: {data.leave}</span>
                <span className="text-muted-app text-xs ml-auto">Formula: Live × 40% + Recorded × 60%</span>
              </div>
            </div>
          </div>

          {/* Date-wise live class attendance */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden mb-5">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-display font-bold text-base text-app">Live Class Attendance (Date-wise)</h3>
            </div>
            {(!data.byDate || data.byDate.length === 0) ? (
              <p className="px-5 py-6 text-sm text-muted-app">No live class sessions recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs font-semibold text-muted-app uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Day</th>
                      <th className="px-4 py-3">Topic</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byDate.map((s, i) => {
                      const st = s.status;
                      const color = st === "PRESENT" ? "bg-emerald-100 text-emerald-700" : st === "LATE" ? "bg-amber-100 text-amber-700" : st === "LEAVE" ? "bg-blue-100 text-blue-700" : st === "ABSENT" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600";
                      return (
                        <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-4 py-3 font-semibold text-app">{fmtDate(s.date)}</td>
                          <td className="px-4 py-3 text-muted-app">{dayName(s.date)}</td>
                          <td className="px-4 py-3 text-muted-app">{s.topic || "—"}</td>
                          <td className="px-4 py-3 text-center"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{st === "NOT_MARKED" ? "Not Marked" : st}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recorded lectures */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-display font-bold text-base text-app">Recorded Lectures</h3>
            </div>
            {(!data.lectures || data.lectures.length === 0) ? (
              <p className="px-5 py-6 text-sm text-muted-app">No recorded lectures available for this course yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.lectures.map((l) => (
                  <div key={l.key} className="px-5 py-3 flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${l.watched ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600" : "bg-slate-50 dark:bg-slate-800 text-slate-500"}`}>
                      {l.watched ? <CheckCircle2 size={16} /> : <Video size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-app truncate">{l.title}</p>
                      <p className="text-[11px] text-muted-app">{l.week != null ? `Week ${l.week} · ` : ""}{fmtDate(l.date)}</p>
                      {/* Point 6 — attendance is auto-granted from real watch progress
                          (>= threshold). No manual "mark watched" action. */}
                      {!l.watched && (
                        <div className="mt-1.5 max-w-[220px]">
                          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(100, Number(l.progressPercent) || 0)}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-app mt-0.5">{Math.round(Number(l.progressPercent) || 0)}% watched · reaches {data.watchThreshold || 70}% to mark present</p>
                        </div>
                      )}
                    </div>
                    {l.watched ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 size={13} /> Attended</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-app"><PlayCircle size={13} /> Watch in Recorded Lectures</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

// ---- Main: course-wise attendance dashboard ----
const Attendance = () => {
  const { data, loading, error, reload } = useApi(() => api.student.attendance(), []);
  const [searchParams] = useSearchParams();
  const [active, setActive] = useState(null);

  const rows = useMemo(() => data?.courses || [], [data]);

  // Deep-link from a course card.
  useEffect(() => {
    const code = searchParams.get("course");
    if (code && rows.length && !active) {
      const found = rows.find((r) => r.courseCode === code);
      if (found) setActive(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const totals = useMemo(() => {
    const n = rows.length || 1;
    const avg = Math.round((rows.reduce((a, b) => a + (b.overallPercentage || 0), 0) / n) * 100) / 100;
    const totalLive = rows.reduce((a, b) => a + (b.totalLiveClasses || 0), 0);
    const totalRecorded = rows.reduce((a, b) => a + (b.totalRecordedLectures || 0), 0);
    const shortCount = rows.filter((b) => (b.overallPercentage || 0) < 75).length;
    return { avg, totalLive, totalRecorded, shortCount };
  }, [rows]);

  if (active) {
    return <CourseDetail course={active} onBack={() => { setActive(null); reload(); }} onWatched={reload} />;
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Attendance" subtitle="Course-wise attendance across your enrolled courses" icon="CalendarCheck" breadcrumb={["Dashboard", "Attendance"]} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Course-wise attendance — Live Classes (40%) + Recorded Lectures (60%)" icon="CalendarCheck" breadcrumb={["Dashboard", "Attendance"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState icon="CalendarCheck" title="No enrolled courses" description="Your attendance dashboard appears once you are enrolled in courses." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Average Attendance", value: `${totals.avg}%`, color: "from-emerald-500 to-teal-600", icon: CheckCircle2 },
              { label: "Total Live Classes", value: totals.totalLive, color: "from-blue-500 to-indigo-600", icon: MonitorPlay },
              { label: "Recorded Lectures", value: totals.totalRecorded, color: "from-violet-500 to-purple-600", icon: Video },
              { label: "Short Attendance", value: totals.shortCount, color: "from-rose-500 to-pink-600", icon: AlertTriangle },
            ].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`relative bg-gradient-to-br ${s.color} rounded-2xl p-4 text-white overflow-hidden`}>
                <div className="absolute -right-2 -top-2 w-20 h-20 bg-white/10 rounded-full blur-xl" />
                <s.icon size={22} className="mb-2" />
                <p className="font-display text-3xl font-extrabold">{s.value}</p>
                <p className="text-xs opacity-90">{s.label}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((c, i) => {
              const theme = statusTheme(c.status);
              return (
                <motion.button
                  key={c.offeringId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setActive(c)}
                  className="text-left card-base p-5 hover:shadow-lg hover:border-primary-300 dark:hover:border-primary-700 transition group"
                >
                  <div className="flex items-start gap-4">
                    <CircularProgress value={c.overallPercentage} size={92} stroke={9} color={theme.ring} />
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-xs font-bold text-primary-600 dark:text-primary-400">{c.courseCode}</span>
                      <p className="font-display font-bold text-sm text-app line-clamp-2 mt-0.5">{c.courseTitle}</p>
                      <p className="text-[11px] text-muted-app flex items-center gap-1 mt-1"><User size={11} /> {c.teacherName}</p>
                      <span className={`inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${theme.bg}`}>{c.status}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-app"><MonitorPlay size={13} className="text-blue-500" /> Live: <span className="font-bold text-app">{c.attendedLiveClasses}/{c.totalLiveClasses}</span></div>
                    <div className="flex items-center gap-1.5 text-muted-app"><Video size={13} className="text-violet-500" /> Rec: <span className="font-bold text-app">{c.watchedRecordedLectures}/{c.totalRecordedLectures}</span></div>
                  </div>
                  <p className="text-[11px] text-primary-600 dark:text-primary-400 font-semibold mt-3 group-hover:underline">View detailed attendance →</p>
                </motion.button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default Attendance;

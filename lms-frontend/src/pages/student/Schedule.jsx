import { motion } from "framer-motion";
import { useMemo } from "react";
import { Clock, Video, BookOpen, MapPin } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

const Schedule = () => {
  const { data, loading, error, reload } = useApi(() => api.student.schedule(), []);
  // Show Monday–Friday only. Saturday & Sunday are holidays and are excluded
  // from the timetable entirely. The backend returns all 7 days (dayOfWeek
  // 0=Sunday .. 6=Saturday); we keep only 1..5 in Mon→Fri order.
  const days = useMemo(() => {
    const all = data?.schedule || [];
    return [1, 2, 3, 4, 5]
      .map((dow) => all.find((d) => d && d.dayOfWeek === dow))
      .filter(Boolean);
  }, [data]);

  const totalSlots = useMemo(() => days.reduce((a, d) => a + (d.slots?.length || 0), 0), [days]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Weekly Schedule" subtitle="Your full timetable for the current semester" icon="Calendar" breadcrumb={["Dashboard", "Schedule"]} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Weekly Schedule" subtitle="Your full timetable for the current semester" icon="Calendar" breadcrumb={["Dashboard", "Schedule"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : totalSlots === 0 ? (
        <EmptyState icon="Calendar" title="No timetable yet" description="Your class schedule will appear here once your courses are scheduled by the coordinator." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {days.map((d, i) => (
            <motion.div
              key={d.day}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-soft"
            >
              <div className="px-3 py-3 bg-gradient-to-r from-primary-600 to-blue-500 text-white text-center">
                <p className="font-display font-bold">{d.day}</p>
                <p className="text-[10px] opacity-80">{d.slots.length} class{d.slots.length === 1 ? "" : "es"}</p>
              </div>
              <div className="p-2 space-y-2 min-h-[300px]">
                {d.slots.map((c, j) => (
                  <div key={c.id || j} className={`p-2.5 rounded-xl border ${c.slotType === "LAB" ? "bg-violet-50 border-violet-200" : c.mode === "ONLINE" ? "bg-rose-50 border-rose-200" : "bg-blue-50 border-blue-200"}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {c.mode === "ONLINE" ? <Video size={11} className="text-rose-600" /> : <BookOpen size={11} className={c.slotType === "LAB" ? "text-violet-600" : "text-blue-600"} />}
                      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">{c.mode === "ONLINE" ? "Online" : "Onsite"}</span>
                      {c.slotType === "LAB" && <span className="ml-auto px-1.5 py-0.5 rounded bg-violet-500 text-white text-[8px] font-extrabold uppercase tracking-wide">Lab</span>}
                    </div>
                    <p className="text-[10px] font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1"><Clock size={10} /> {c.startTime}–{c.endTime}</p>
                    <p className="text-xs font-bold text-primary-700 mt-1">{c.courseCode}</p>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-tight">{c.courseTitle}{c.slotType === "LAB" ? " (Lab)" : ""}</p>
                    {c.room && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1"><MapPin size={9} /> {c.room}</p>}
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{c.teacher}</p>
                  </div>
                ))}
                {d.slots.length === 0 && (
                  <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500">No classes</div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Schedule;

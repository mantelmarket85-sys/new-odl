import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FileText, FileQuestion, CalendarCheck, Megaphone, Video, Library, Radio, FlaskConical } from "lucide-react";

const TeacherCard = ({ data, delay = 0 }) => {
  const isLive = data.status === "live";

  const actions = [
    { label: "Assignments", icon: FileText, count: data.assignments, to: `/student/assignments?course=${data.courseCode}`, color: "text-blue-600 dark:text-blue-400" },
    { label: "Quizzes", icon: FileQuestion, count: data.quizzes, to: `/student/quizzes?course=${data.courseCode}`, color: "text-amber-600 dark:text-amber-400" },
    { label: "Attendance", icon: CalendarCheck, count: `${data.attendance}%`, to: `/student/attendance?course=${data.courseCode}`, color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Announce", icon: Megaphone, count: data.announcements, to: `/student/announcements?course=${data.courseCode}`, color: "text-rose-600 dark:text-rose-400" },
    { label: "Live Class", icon: Video, count: null, to: `/student/live-classes?course=${data.courseCode}`, color: "text-purple-600 dark:text-purple-400" },
    { label: "Materials", icon: Library, count: null, to: `/student/library?course=${data.courseCode}`, color: "text-cyan-600 dark:text-cyan-400" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      whileHover={{ y: -6 }}
      className="group relative card-base overflow-hidden card-hover gradient-border"
    >
      {/* Color band */}
      <div className={`relative h-24 bg-gradient-to-br ${data.color}`}>
        <div className="absolute inset-0 bg-mesh opacity-30" />
        <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono font-bold bg-white/20 backdrop-blur text-white px-2 py-0.5 rounded-md border border-white/30">{data.courseCode}</span>
          <span className="text-[10px] font-bold bg-white/20 backdrop-blur text-white px-2 py-0.5 rounded-md border border-white/30">{data.isLab ? `${data.labCredits ?? data.credits} CH (Lab)` : `${data.credits} CH`}</span>
          {data.isLab && (
            <span className="text-[10px] font-bold bg-amber-500/90 text-white px-2 py-0.5 rounded-md border border-amber-300/30 inline-flex items-center gap-1">
              <FlaskConical size={10} /> LAB
            </span>
          )}
        </div>
        {isLive && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-rose-500 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg">
            <Radio size={10} className="animate-pulse" /> LIVE NOW
          </div>
        )}
        <div className="absolute -bottom-8 left-5">
          <img src={data.avatar} alt={data.teacher} className="w-16 h-16 rounded-2xl border-4 border-white dark:border-slate-900 shadow-xl" />
        </div>
      </div>

      <div className="pt-10 pb-4 px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-base text-app truncate">{data.teacher}</h3>
            <p className="text-[11px] text-muted-app line-clamp-2">{data.designation}</p>
          </div>
        </div>

        <p className="font-display font-extrabold text-lg gradient-text mt-2.5">{data.subject}</p>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
            <span className="text-muted-app">Course Progress</span>
            <span className="text-app">{data.progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${data.progress}%` }}
              transition={{ duration: 1, delay: delay + 0.2 }}
              className={`h-full bg-gradient-to-r ${data.color} rounded-full`}
            />
          </div>
        </div>

        {/* Next class */}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-muted-app">Next:</span>
          <span className={`font-bold ${isLive ? "text-rose-600 dark:text-rose-400 animate-pulse" : "text-app"}`}>{data.nextClass}</span>
        </div>

        {/* Action grid */}
        <div className="grid grid-cols-3 gap-1.5 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          {actions.map((a, i) => {
            const AIcon = a.icon;
            return (
              <Link
                key={i}
                to={a.to}
                className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 dark:hover:bg-slate-800/60 transition group/btn"
              >
                <div className={`p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 group-hover/btn:scale-110 transition ${a.color}`}>
                  <AIcon size={14} />
                </div>
                <span className="text-[10px] font-semibold text-app text-center leading-tight">{a.label}</span>
                {a.count !== null && a.count !== undefined && (
                  <span className="text-[9px] font-bold text-muted-app">{a.count}</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default TeacherCard;

import { motion } from "framer-motion";
import * as Icons from "lucide-react";

const StatCard = ({ title, value, icon = "Activity", trend, color = "blue", subtitle, delay = 0, onClick }) => {
  const Icon = Icons[icon] || Icons.Activity;
  const colors = {
    blue: { bg: "from-blue-500 to-indigo-600", glow: "shadow-blue-500/25" },
    emerald: { bg: "from-emerald-500 to-teal-600", glow: "shadow-emerald-500/25" },
    amber: { bg: "from-amber-500 to-orange-600", glow: "shadow-amber-500/25" },
    rose: { bg: "from-rose-500 to-pink-600", glow: "shadow-rose-500/25" },
    purple: { bg: "from-purple-500 to-violet-600", glow: "shadow-purple-500/25" },
    cyan: { bg: "from-cyan-500 to-blue-600", glow: "shadow-cyan-500/25" },
    indigo: { bg: "from-indigo-500 to-blue-600", glow: "shadow-indigo-500/25" },
    teal: { bg: "from-teal-500 to-cyan-600", glow: "shadow-teal-500/25" },
  };
  const c = colors[color] || colors.blue;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className={`relative card-base p-5 overflow-hidden group ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full bg-gradient-to-br ${c.bg} opacity-10 dark:opacity-20 group-hover:scale-125 transition-transform duration-500`} />
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300"
           style={{ background: `linear-gradient(90deg, transparent, var(--bg-app), transparent)` }} />
      <div className="flex items-start justify-between relative z-10 gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-app">{title}</p>
          <p className="text-3xl font-display font-extrabold text-app mt-2 tabular-nums">{value}</p>
          {subtitle && <p className="text-xs text-muted-app mt-1.5 truncate">{subtitle}</p>}
          {trend && (
            <div className={`inline-flex items-center gap-1 mt-2 text-xs font-bold px-2 py-0.5 rounded-full ${
              trend.startsWith("+")
                ? "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40"
                : "text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/40"
            }`}>
              {trend.startsWith("+") ? <Icons.TrendingUp size={12} /> : <Icons.TrendingDown size={12} />}
              {trend}
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl bg-gradient-to-br ${c.bg} shadow-lg ${c.glow}`}>
          <Icon size={20} className="text-white" strokeWidth={2.4} />
        </div>
      </div>
    </motion.div>
  );
};

export default StatCard;

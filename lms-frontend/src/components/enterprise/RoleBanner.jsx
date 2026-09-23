import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { useAuth, ROLE_META } from "../../context/AuthContext";

/* =========================================================================
 * <RoleBanner /> — premium gradient hero banner used by every enterprise
 * role's main dashboard.  Consistent ERP-grade welcome surface.
 *
 * Props:
 *   icon: string (lucide name)
 *   eyebrow: string  — small tag text (e.g. "Focal Person · Department of CS")
 *   title:   string
 *   subtitle:string
 *   actions: react-node
 *   variant?: 'auto'|'rose'|'cyan'|'green'|'purple'|'amber'|'violet'
 * ======================================================================= */
const VARIANT_BG = {
  rose:   "from-rose-900 via-red-900 to-slate-900",
  cyan:   "from-cyan-900 via-sky-900 to-slate-900",
  green:  "from-emerald-900 via-green-900 to-slate-900",
  purple: "from-purple-900 via-fuchsia-900 to-slate-900",
  amber:  "from-amber-900 via-orange-900 to-slate-900",
  violet: "from-violet-900 via-indigo-900 to-slate-900",
  blue:   "from-slate-900 via-blue-900 to-indigo-900",
  emerald:"from-emerald-900 via-teal-900 to-slate-900",
};

const RoleBanner = ({ icon = "LayoutDashboard", eyebrow, title, subtitle, actions, variant = "auto" }) => {
  const { user } = useAuth();
  const meta = ROLE_META[user?.role] || ROLE_META.student;
  const accent = variant === "auto" ? meta.accent : variant;
  const bg = VARIANT_BG[accent] || VARIANT_BG.blue;
  const Icon = Icons[icon] || Icons.LayoutDashboard;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative bg-gradient-to-br ${bg} rounded-3xl p-6 sm:p-8 text-white overflow-hidden`}
    >
      <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-1/3 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-start gap-4 min-w-0">
          <div className="shrink-0 p-3.5 rounded-2xl bg-white/10 backdrop-blur border border-white/20 shadow-lg">
            <Icon size={28} className="text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            {eyebrow && (
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur rounded-full text-xs font-semibold mb-2 border border-white/20">
                {eyebrow}
              </div>
            )}
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-tight">
              {title}
            </h1>
            {subtitle && <p className="text-blue-100/90 text-sm mt-1.5 max-w-2xl">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2 relative z-10 shrink-0">{actions}</div>}
      </div>
    </motion.div>
  );
};

export default RoleBanner;

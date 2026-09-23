import * as Icons from "lucide-react";
import { motion } from "framer-motion";
import PageHeader from "../common/PageHeader";

/* =========================================================================
 * <ComingSoonModule /> — used as a placeholder for less-critical sub-pages
 * inside enterprise role areas.  Maintains UI consistency.  Architecture
 * is ready for future expansion — content lives in `bullets`.
 * ======================================================================= */
const ComingSoonModule = ({
  title,
  subtitle,
  icon = "Sparkles",
  breadcrumb,
  bullets = [],
}) => {
  const Icon = Icons[icon] || Icons.Sparkles;
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} icon={icon} breadcrumb={breadcrumb} />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-base p-8 lg:p-12 text-center relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-violet-500/10 rounded-full blur-3xl" />

        <div className="relative">
          <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-600 to-blue-500 shadow-xl shadow-primary-500/30 flex items-center justify-center mb-4">
            <Icon size={36} className="text-white" />
          </div>
          <h2 className="font-display font-extrabold text-2xl text-app mb-2">Architecture Ready</h2>
          <p className="text-sm text-muted-app max-w-xl mx-auto">
            This module is structured and ready for future expansion. The
            backend integration points, data models, and UI patterns
            are already aligned with the rest of the enterprise system.
          </p>

          {bullets.length > 0 && (
            <div className="mt-6 grid sm:grid-cols-2 gap-2 max-w-xl mx-auto text-left">
              {bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-app">
                  <Icons.CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-app">{b}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ComingSoonModule;

import { motion } from "framer-motion";
import * as Icons from "lucide-react";

const PageHeader = ({ title, subtitle, icon = "LayoutDashboard", actions, breadcrumb }) => {
  const Icon = Icons[icon] || Icons.LayoutDashboard;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-6"
    >
      {breadcrumb && (
        <div className="flex items-center gap-1.5 text-xs text-muted-app mb-2.5 font-medium">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <Icons.ChevronRight size={12} className="opacity-50" />}
              <span className={i === breadcrumb.length - 1 ? "text-primary-600 dark:text-primary-400 font-semibold" : ""}>{b}</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary-600 to-blue-500 blur-lg opacity-40" />
            <div className="relative p-3 rounded-xl bg-gradient-to-br from-primary-600 to-blue-500 shadow-lg shadow-primary-500/30">
              <Icon size={22} className="text-white" strokeWidth={2.4} />
            </div>
          </div>
          <div>
            <h1 className="font-display font-extrabold text-2xl md:text-[28px] text-app leading-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted-app mt-1">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </motion.div>
  );
};

export default PageHeader;

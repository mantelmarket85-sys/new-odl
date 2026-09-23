import { motion } from "framer-motion";
import * as Icons from "lucide-react";

const EmptyState = ({
  icon = "Inbox",
  title = "Nothing here yet",
  description = "There is no data to display at the moment.",
  action,
  actionLabel,
  className = "",
}) => {
  const Icon = Icons[icon] || Icons.Inbox;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-dashed border-app surface ${className}`}
    >
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 blur-2xl" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 flex items-center justify-center border border-blue-200/50 dark:border-blue-800/50">
          <Icon size={28} className="text-primary-600 dark:text-primary-400" />
        </div>
      </div>
      <h3 className="font-bold text-lg text-app">{title}</h3>
      <p className="text-sm text-muted-app max-w-sm mt-1">{description}</p>
      {action && (
        <button onClick={action} className="btn-primary mt-5 text-sm">
          {actionLabel || "Get Started"}
        </button>
      )}
    </motion.div>
  );
};

export default EmptyState;

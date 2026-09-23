import { motion } from "framer-motion";
import { AlertOctagon, RefreshCcw } from "lucide-react";

const ErrorState = ({
  title = "Something went wrong",
  description = "We couldn't load this section. Please try again.",
  onRetry,
  className = "",
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-rose-200/60 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 ${className}`}
  >
    <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center mb-4">
      <AlertOctagon size={28} className="text-rose-600 dark:text-rose-400" />
    </div>
    <h3 className="font-bold text-lg text-app">{title}</h3>
    <p className="text-sm text-muted-app max-w-sm mt-1">{description}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition"
      >
        <RefreshCcw size={14} /> Try Again
      </button>
    )}
  </motion.div>
);

export default ErrorState;

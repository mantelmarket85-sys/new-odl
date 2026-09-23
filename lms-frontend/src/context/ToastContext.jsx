import { createContext, useContext, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

const ToastContext = createContext({ toast: () => {} });

const ICONS = {
  success: { Icon: CheckCircle2, color: "text-emerald-500", ring: "ring-emerald-500/30" },
  error:   { Icon: XCircle,      color: "text-rose-500",    ring: "ring-rose-500/30" },
  warning: { Icon: AlertTriangle,color: "text-amber-500",   ring: "ring-amber-500/30" },
  info:    { Icon: Info,         color: "text-sky-500",     ring: "ring-sky-500/30" },
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const remove = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  const toast = useCallback((message, opts = {}) => {
    const id = Date.now() + Math.random();
    const item = { id, message, type: opts.type || "success", title: opts.title };
    setToasts((t) => [...t, item]);
    setTimeout(() => remove(id), opts.duration || 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-3 max-w-sm w-[calc(100%-2.5rem)] sm:w-auto pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const { Icon, color, ring } = ICONS[t.type] || ICONS.success;
            return (
              <motion.div
                key={t.id}
                initial={{ x: 320, opacity: 0, scale: 0.9 }}
                animate={{ x: 0, opacity: 1, scale: 1 }}
                exit={{ x: 320, opacity: 0, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className={`pointer-events-auto glass rounded-2xl shadow-2xl ring-1 ${ring} p-4 flex items-start gap-3 min-w-[280px]`}
              >
                <Icon size={20} className={`${color} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  {t.title && <p className="font-bold text-sm text-app">{t.title}</p>}
                  <p className="text-sm text-app/90">{t.message}</p>
                </div>
                <button onClick={() => remove(t.id)} className="text-muted-app hover:text-app">
                  <X size={16} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

import { useState } from "react";
import { Send, Sparkles, History, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "../../context/ToastContext";

/* Default quick-message templates per spec. */
export const QUICK_TEMPLATES = [
  { id: "quiz_pending",       text: "Quiz Marks Pending",        category: "Marks" },
  { id: "assg_pending",       text: "Assignment Marks Pending",  category: "Marks" },
  { id: "att_missing",        text: "Attendance Missing",        category: "Attendance" },
  { id: "result_pending",     text: "Result Pending",            category: "Results" },
  { id: "material_missing",   text: "Course Material Missing",   category: "Material" },
  { id: "class_missed",       text: "Class Missed",              category: "Classes" },
  { id: "eval_required",      text: "Evaluation Required",       category: "Evaluation" },
];

/* =========================================================================
 * <QuickMessage /> — composite component used by Focal Person / Course
 * Coordinator to broadcast reminder templates to teachers.
 *
 * Props:
 *   recipients: [{ id, name }]
 * ======================================================================= */
const QuickMessage = ({ recipients = [] }) => {
  const { toast } = useToast();
  const [selectedTeacher, setSelectedTeacher] = useState(recipients[0]?.id || "");
  const [custom, setCustom] = useState("");
  const [history, setHistory] = useState([
    { id: 1, to: "Dr. Muhammad Naeem", text: "Quiz Marks Pending",      time: "2 hours ago" },
    { id: 2, to: "Dr. Asim Shahzad",   text: "Attendance Missing",      time: "Yesterday" },
    { id: 3, to: "Dr. Muhammad Zeeshan", text: "Course Material Missing", time: "3 days ago" },
  ]);

  const sendTemplate = (text) => {
    const teacher = recipients.find((r) => r.id === selectedTeacher);
    if (!teacher) {
      toast?.("Select a teacher first", { type: "warning", title: "No Recipient" });
      return;
    }
    setHistory((h) => [{ id: Date.now(), to: teacher.name, text, time: "Just now" }, ...h]);
    toast?.(`Sent to ${teacher.name}: ${text}`, { type: "success", title: "Message Sent" });
  };

  const sendCustom = () => {
    if (!custom.trim()) return;
    sendTemplate(custom.trim());
    setCustom("");
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Compose */}
      <div className="lg:col-span-2 card-base p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-violet-500" />
          <h3 className="font-display font-bold text-lg text-app">Compose Quick Reminder</h3>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Recipient (Teacher)</label>
          <select
            value={selectedTeacher}
            onChange={(e) => setSelectedTeacher(e.target.value)}
            className="input-base py-2 text-sm w-full"
          >
            {recipients.length === 0 && <option value="">No teachers available</option>}
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-2">One-Click Templates</label>
          <div className="flex flex-wrap gap-2">
            {QUICK_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => sendTemplate(t.text)}
                className="text-xs font-bold px-3 py-2 rounded-xl border border-app bg-white dark:bg-slate-900 hover:bg-primary-50 dark:hover:bg-primary-950/30 hover:border-primary-300 dark:hover:border-primary-800 text-app transition"
              >
                {t.text}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Custom Message</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Type your message…"
              className="input-base py-2.5 text-sm flex-1"
              onKeyDown={(e) => e.key === "Enter" && sendCustom()}
            />
            <button
              onClick={sendCustom}
              className="btn-primary inline-flex items-center gap-1.5 px-4 text-sm"
            >
              <Send size={14} /> Send
            </button>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="card-base p-5">
        <div className="flex items-center gap-2 mb-3">
          <History size={16} className="text-primary-600 dark:text-primary-400" />
          <h3 className="font-display font-bold text-lg text-app">Message History</h3>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          <AnimatePresence>
            {history.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-app"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-app">{m.to}</p>
                  <span className="text-[10px] text-muted-app shrink-0">{m.time}</span>
                </div>
                <p className="text-xs text-muted-app mt-1">{m.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default QuickMessage;

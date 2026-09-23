import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LogOut, AlertTriangle, CheckCircle2, Clock, BookOpen, Loader2, ShieldQuestion } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

const statusBadge = (status) => {
  const s = (status || "").toUpperCase();
  if (s === "WITHDRAWN") return { color: "rose", label: "Withdrawn" };
  if (s === "DROPPED") return { color: "amber", label: "Dropped" };
  if (s === "COMPLETED") return { color: "blue", label: "Completed" };
  return { color: "emerald", label: "Enrolled" };
};

const fmtDate = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; }
};

const Withdrawal = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.student.registrations(), []);
  const [target, setTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const registrations = useMemo(() => data?.registrations || [], [data]);
  const eligible = registrations.filter((r) => (r.status || "").toUpperCase() === "ENROLLED");
  const history = registrations.filter((r) => (r.status || "").toUpperCase() !== "ENROLLED");

  const confirmWithdraw = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      await api.student.withdraw(target.id);
      toast(`Withdrawal submitted for ${target.offering?.course?.code}`, { type: "success" });
      setTarget(null);
      reload();
    } catch (e) {
      toast(e.message || "Failed to submit withdrawal", { type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Course Withdrawal" subtitle="Request withdrawal from an enrolled course and track its status" icon="LogOut" breadcrumb={["Dashboard", "Course Withdrawal"]} />

      {/* Policy notice */}
      <div className="mb-5 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/30 p-4 flex items-start gap-3">
        <ShieldQuestion size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Withdrawing from a course follows your program's academic regulations and approval rules. A withdrawal may affect your enrolled credit hours and is subject to the official withdrawal deadline.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : (
        <>
          {/* Eligible courses */}
          <section className="mb-8">
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
              <BookOpen size={18} className="text-primary-600" /> Eligible Courses
            </h3>
            {eligible.length === 0 ? (
              <EmptyState icon="BookOpen" title="No eligible courses" description="You have no currently enrolled courses available for withdrawal." className="py-8" />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {eligible.map((r, i) => (
                  <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-primary-600">{r.offering?.course?.code}</span>
                      <Badge color="emerald" size="sm">enrolled</Badge>
                    </div>
                    <h4 className="font-bold text-app mt-1 leading-tight">{r.offering?.course?.title}</h4>
                    <p className="text-xs text-muted-app mt-1">{r.offering?.term?.title} · Registered {fmtDate(r.registeredAt)}</p>
                    <button onClick={() => setTarget(r)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/60 w-full justify-center">
                      <LogOut size={14} /> Request Withdrawal
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          {/* Withdrawal status / history */}
          <section>
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
              <Clock size={18} className="text-primary-600" /> Withdrawal Status
            </h3>
            {history.length === 0 ? (
              <EmptyState icon="Clock" title="No withdrawal requests" description="Your withdrawal requests and their status will appear here." className="py-8" />
            ) : (
              <div className="space-y-2.5">
                {history.map((r, i) => {
                  const sb = statusBadge(r.status);
                  const withdrawn = (r.status || "").toUpperCase() === "WITHDRAWN";
                  return (
                    <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl shrink-0 ${withdrawn ? "bg-rose-100 text-rose-600 dark:bg-rose-950/40" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                        {withdrawn ? <CheckCircle2 size={18} /> : <Clock size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-app">
                          <span className="font-mono text-xs text-primary-600 mr-2">{r.offering?.course?.code}</span>
                          {r.offering?.course?.title}
                        </p>
                        <p className="text-xs text-muted-app mt-0.5">
                          {withdrawn && r.withdrawnAt ? `Withdrawn on ${fmtDate(r.withdrawnAt)}` : `Registered ${fmtDate(r.registeredAt)}`} · {r.offering?.term?.title}
                        </p>
                      </div>
                      <Badge color={sb.color} size="sm">{sb.label}</Badge>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {/* Confirmation modal */}
      <Modal open={!!target} onClose={() => !submitting && setTarget(null)} title="Confirm Course Withdrawal" subtitle="This action will withdraw you from the selected course" icon={AlertTriangle} maxWidth="max-w-md">
        <div className="px-6 py-5">
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-4 mb-4">
            <p className="font-mono text-xs font-bold text-primary-600">{target?.offering?.course?.code}</p>
            <p className="font-bold text-app">{target?.offering?.course?.title}</p>
            <p className="text-xs text-muted-app mt-0.5">{target?.offering?.term?.title}</p>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
            Are you sure you want to withdraw from this course? Once withdrawn, you will lose access to its assignments, quizzes and materials. This follows your program's withdrawal regulations.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setTarget(null)} disabled={submitting} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60">Cancel</button>
            <button onClick={confirmWithdraw} disabled={submitting} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-60">
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />} Confirm Withdrawal
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Withdrawal;

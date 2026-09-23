import { useState } from "react";
import { motion } from "framer-motion";
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Plus,
  TrendingUp,
  Target,
  Award,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import { useToast } from "../../context/ToastContext";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";

/* Standard QEC self-assessment review areas (12 sections). The
 * completed/pending state is derived from each program's live progress
 * so the checklist mirrors real data without inventing values. */
const CHECKLIST_AREAS = [
  "Program Mission & Vision",
  "PLO Mapping & Attainment",
  "CLO Assessment",
  "Curriculum Review",
  "Faculty Qualifications",
  "Student Feedback Analysis",
  "Industry Advisory Input",
  "Graduate Survey Results",
  "Infrastructure Review",
  "Library & Resources",
  "Corrective Action Plan",
  "Final Report Compilation",
];

const statusColors = {
  Completed: "success",
  "In Progress": "info",
  "Pending Review": "warning",
  "Not Started": "default",
};

export default function SelfAssessment() {
  const { toast } = useToast();
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ program: "", lead: "", targetDate: "" });
  const [creating, setCreating] = useState(false);

  const { data, loading, error, reload } = useApi(() => api.qec.selfAssessment(), []);
  const { data: pe } = useApi(() => api.qec.programEval(), []);

  const programs = data?.items || [];
  const stats = data?.stats || { total: 0, completed: 0, inProgress: 0, correctiveActions: 0, completedActions: 0 };

  const checklistFor = (program) => {
    const completedCount = program ? program.completed : 0;
    return CHECKLIST_AREAS.map((area, i) => ({ id: i + 1, area, done: i < completedCount }));
  };

  const startCycle = async () => {
    const title = createForm.program
      ? `Self-Assessment Cycle — ${createForm.program}`
      : "Self-Assessment Cycle";
    setCreating(true);
    try {
      await api.qec.createPlan({
        title,
        area: createForm.program || "Program",
        finding: "New QEC self-assessment cycle initiated.",
        actionPlan: "Complete all 12 self-assessment review sections and compile the final report.",
        ownerRole: createForm.lead || "QECCoordinator",
        targetDate: createForm.targetDate || undefined,
        progress: 0,
      });
      toast("Self-assessment cycle initiated", { type: "success" });
      setShowCreate(false);
      setCreateForm({ program: "", lead: "", targetDate: "" });
      await reload();
    } catch (e) {
      toast(e.message || "Failed to start cycle", { type: "error" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Self-Assessment Reports"
        subtitle="QEC institutional self-assessment cycles, program reviews, and corrective action tracking"
        icon={ClipboardCheck}
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={16} className="mr-2" />
            New Assessment
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Programs" value={stats.total} icon={FileText} color="indigo" delay={0} />
        <StatCard title="Completed" value={stats.completed} icon={CheckCircle2} color="emerald" delay={0.05} />
        <StatCard title="In Progress" value={stats.inProgress} icon={Clock} color="amber" delay={0.1} />
        <StatCard
          title="Corrective Actions"
          value={`${stats.completedActions}/${stats.correctiveActions}`}
          icon={Target}
          color="rose"
          delay={0.15}
        />
      </div>

      {/* Programs */}
      <div className="card-base p-6">
        <h3 className="text-lg font-semibold text-app mb-4 flex items-center gap-2">
          <Award size={18} className="text-indigo-500" />
          Program-wise Self-Assessment Status
        </h3>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
          </div>
        ) : programs.length === 0 ? (
          <p className="text-sm text-muted-app py-8 text-center">No programs available for self-assessment.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {programs.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setSelected(p)}
                className="surface border border-app rounded-xl p-5 hover:shadow-md transition cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 pr-3">
                    <p className="font-semibold text-app text-sm">{p.name}</p>
                    <p className="text-xs text-muted-app mt-1">Lead: {p.lead}</p>
                  </div>
                  <Badge variant={statusColors[p.status] || "default"}>{p.status}</Badge>
                </div>

                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-app">
                      {p.completed}/{p.sections} sections completed
                    </span>
                    <span className="font-semibold text-app">{p.progress}%</span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${p.progress}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05 }}
                      className={`h-full rounded-full ${
                        p.progress === 100
                          ? "bg-emerald-500"
                          : p.progress >= 50
                          ? "bg-indigo-500"
                          : p.progress > 0
                          ? "bg-amber-500"
                          : "bg-slate-400"
                      }`}
                    />
                  </div>
                  <p className="text-xs text-muted-app">Due: {p.dueDate}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name}
        subtitle={`Self-Assessment • Lead: ${selected?.lead}`}
        icon={ClipboardCheck}
        maxWidth="max-w-3xl"
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="surface border border-app rounded-lg p-3 text-center">
                <p className="text-xs text-muted-app">PLO Attainment</p>
                <p className="text-xl font-bold text-emerald-600">{pe ? pe.ploAttainment : "—"}%</p>
              </div>
              <div className="surface border border-app rounded-lg p-3 text-center">
                <p className="text-xs text-muted-app">CLO Attainment</p>
                <p className="text-xl font-bold text-indigo-600">{pe ? pe.cloAttainment : "—"}%</p>
              </div>
              <div className="surface border border-app rounded-lg p-3 text-center">
                <p className="text-xs text-muted-app">Graduation Rate</p>
                <p className="text-xl font-bold text-amber-600">{pe ? pe.graduationRate : "—"}%</p>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-app mb-3 text-sm">Assessment Checklist</h4>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {checklistFor(selected).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between surface border border-app rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3">
                      {c.done ? (
                        <CheckCircle2 size={18} className="text-emerald-500" />
                      ) : (
                        <AlertCircle size={18} className="text-amber-500" />
                      )}
                      <span className="text-sm text-app">{c.area}</span>
                    </div>
                    <Badge variant={c.done ? "success" : "warning"}>
                      {c.done ? "Done" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="btn-secondary">
                Close
              </button>
              <button
                onClick={() => {
                  api.qec.exportReport("depts");
                  toast("Report exported successfully", { type: "success" });
                  setSelected(null);
                }}
                className="btn-primary"
              >
                <TrendingUp size={14} className="mr-2" />
                Generate Report
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Self-Assessment Cycle"
        subtitle="Start a new QEC self-assessment for a program"
        icon={Plus}
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-app mb-1 block">Program</label>
            <select
              className="input-base w-full"
              value={createForm.program}
              onChange={(e) => setCreateForm((f) => ({ ...f, program: e.target.value }))}
            >
              <option value="">Select a program…</option>
              {programs.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-app mb-1 block">Cycle</label>
              <input className="input-base w-full" defaultValue="2024-25" />
            </div>
            <div>
              <label className="text-sm font-medium text-app mb-1 block">Due Date</label>
              <input
                type="date"
                className="input-base w-full"
                value={createForm.targetDate}
                onChange={(e) => setCreateForm((f) => ({ ...f, targetDate: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-app mb-1 block">Assessment Lead</label>
            <input
              className="input-base w-full"
              placeholder="Faculty member name"
              value={createForm.lead}
              onChange={(e) => setCreateForm((f) => ({ ...f, lead: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={startCycle} disabled={creating} className="btn-primary disabled:opacity-60">
              {creating ? "Starting…" : "Start Cycle"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Megaphone, Plus, Search, Calendar, Trash2, Eye } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import StatusBadge from "../../components/common/StatusBadge";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

const EMPTY_FORM = { title: "", program: "All Programs", batch: "All Batches", semester: "All Semesters", amount: "", deadline: "", description: "" };

const ProvostFeeAnnouncements = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.provost.feeAnnouncements(), []);
  const items = data?.items || [];
  const stats = data?.stats || {};

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search && !String(a.title).toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, search, statusFilter]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const publish = async () => {
    if (!form.title || form.title.trim().length < 3) { toast("Title must be at least 3 characters", { type: "error" }); return; }
    setSaving(true);
    try {
      await api.provost.createFeeAnnouncement({
        title: form.title.trim(),
        description: form.description,
        amount: form.amount ? Number(form.amount) : 0,
        program: form.program,
        batch: form.batch,
        semester: form.semester,
        deadline: form.deadline || undefined,
      });
      toast("Fee announcement published", { type: "success" });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      reload();
    } catch (e) {
      toast(e.message || "Failed to publish", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const archive = async (a) => {
    setDeleting(a.id);
    try {
      await api.provost.deleteFeeAnnouncement(a.id);
      toast("Announcement archived", { type: "success" });
      reload();
    } catch (e) {
      toast(e.message || "Failed to archive", { type: "error" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Fee Announcements"
        subtitle="Publish and manage university-wide fee notifications"
        icon="Megaphone"
        breadcrumb={["Provost", "Fee Announcements"]}
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
            <Plus size={14} /> New Announcement
          </button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatCard title="Total" value={stats.total ?? 0} icon="Megaphone" color="blue" delay={0.05} />
            <StatCard title="Active" value={stats.active ?? 0} icon="CheckCircle2" color="emerald" delay={0.1} />
            <StatCard title="Scheduled" value={stats.scheduled ?? 0} icon="Clock" color="amber" delay={0.15} />
            <StatCard title="Closed" value={stats.closed ?? 0} icon="Filter" color="purple" delay={0.2} />
          </div>

          <div className="card-base p-3 mb-5 flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search announcements..." className="input-base w-full pl-10 text-sm" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-base text-sm md:w-44">
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="card-base p-8 text-center text-sm text-muted-app">No fee announcements found.</div>
            ) : filtered.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card-base p-4 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-sm">
                    <Megaphone size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-app">{a.title}</h3>
                      <StatusBadge status={a.status} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                      <div>
                        <span className="text-muted-app">Amount:</span>
                        <span className="ml-1 font-bold text-app">Rs. {Number(a.amount || 0).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-app">Batch:</span>
                        <span className="ml-1 font-semibold text-app">{a.batch}</span>
                      </div>
                      <div>
                        <span className="text-muted-app">Semester:</span>
                        <span className="ml-1 font-semibold text-app">{a.semester}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar size={11} className="text-rose-500" />
                        <span className="text-muted-app">Deadline:</span>
                        <span className="ml-1 font-semibold text-app">{a.deadline}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-3">
                      <button onClick={() => setDetail(a)} className="px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 text-xs font-semibold hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors flex items-center gap-1">
                        <Eye size={12} /> View
                      </button>
                      <button disabled={deleting === a.id} onClick={() => archive(a)} className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/40 disabled:opacity-50 transition-colors flex items-center gap-1">
                        <Trash2 size={12} /> Archive
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Fee Announcement" icon="Megaphone" maxWidth="max-w-xl">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Title</label>
            <input value={form.title} onChange={(e) => setField("title", e.target.value)} className="input-base w-full text-sm" placeholder="e.g. Spring 2025 Semester Fee" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Program</label>
              <select value={form.program} onChange={(e) => setField("program", e.target.value)} className="input-base w-full text-sm">
                <option>All Programs</option>
                <option>BS Computer Science</option>
                <option>BS Software Engineering</option>
                <option>BS Information Technology</option>
                <option>ADCS</option>
                <option>ADIT</option>
                <option>ADBA</option>
                <option>ADMM</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Batch</label>
              <select value={form.batch} onChange={(e) => setField("batch", e.target.value)} className="input-base w-full text-sm">
                <option>All Batches</option>
                <option>Fall 2024</option>
                <option>Spring 2024</option>
                <option>Fall 2023</option>
                <option>Spring 2023</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Semester</label>
              <select value={form.semester} onChange={(e) => setField("semester", e.target.value)} className="input-base w-full text-sm">
                <option>All Semesters</option>
                <option>Sem 1</option><option>Sem 2</option><option>Sem 3</option>
                <option>Sem 4</option><option>Sem 5</option><option>Sem 6</option>
                <option>Sem 7</option><option>Sem 8</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Amount (Rs.)</label>
              <input type="number" value={form.amount} onChange={(e) => setField("amount", e.target.value)} className="input-base w-full text-sm" placeholder="35000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Deadline</label>
              <input type="date" value={form.deadline} onChange={(e) => setField("deadline", e.target.value)} className="input-base w-full text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Description</label>
            <textarea rows="3" value={form.description} onChange={(e) => setField("description", e.target.value)} className="input-base w-full text-sm" placeholder="Optional details..." />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
            <button disabled={saving} onClick={publish} className="btn-primary flex-1 disabled:opacity-50">{saving ? "Publishing..." : "Publish"}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title} icon="Megaphone" maxWidth="max-w-xl">
        {detail && (
          <div className="space-y-3">
            {detail.description && <p className="text-sm text-app surface border border-app rounded-lg p-3">{detail.description}</p>}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Status</p>
                <StatusBadge status={detail.status} />
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Amount</p>
                <p className="font-bold text-app">Rs. {Number(detail.amount || 0).toLocaleString()}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Program</p>
                <p className="font-semibold text-app">{detail.program}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Batch</p>
                <p className="font-semibold text-app">{detail.batch}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Semester</p>
                <p className="font-semibold text-app">{detail.semester}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Deadline</p>
                <p className="font-semibold text-app">{detail.deadline}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProvostFeeAnnouncements;

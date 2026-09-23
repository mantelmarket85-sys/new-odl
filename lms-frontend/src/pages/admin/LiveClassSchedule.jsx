import { motion } from "framer-motion";
import { Video, Plus, Users, Calendar, Clock, Trash2, Pencil, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

/* ──────────── helpers ──────────── */
const STATUS_META = {
  SCHEDULED: { label: "Upcoming", color: "blue" },
  LIVE: { label: "Live Now", color: "rose" },
  ENDED: { label: "Completed", color: "slate" },
  CANCELLED: { label: "Cancelled", color: "amber" },
};
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
};
const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const blankForm = { offeringId: "", title: "", description: "", scheduledAt: "", durationMin: 90, joinUrl: "" };

/* =========================================================================
 * COURSE COORDINATOR — Live Class Schedule (client requirement 2.1)
 * The Course Coordinator is the SOLE owner of the live-class timetable.
 * They schedule / reschedule / delete live classes here; the assigned teacher
 * only runs them and every enrolled student sees their own timetable.
 * ======================================================================= */
const LiveClassSchedule = () => {
  const { toast } = useToast();
  // Live classes (reuses the existing monitoring/classes list which is already
  // department-scoped for the coordinator).
  const { data, loading, error, reload } = useApi(() => api.coordinator.monitorClasses(), []);
  // Offerings the coordinator can schedule for (with assigned teacher).
  const { data: offData, reload: reloadOfferings } = useApi(() => api.coordinator.liveClassOfferings(), []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const offerings = offData?.offerings || [];
  const classes = data?.classes || [];

  const offeringLabel = (o) =>
    `${o.courseCode} — ${o.courseTitle}${o.section ? ` (Sec ${o.section})` : ""} · ${o.teacher || "Unassigned"}`;

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...blankForm, offeringId: offerings[0]?.id || "" });
    setModalOpen(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setForm({
      offeringId: c.offeringId || "",
      title: c.title || "",
      description: c.description || "",
      scheduledAt: toLocalInput(c.scheduledAt),
      durationMin: c.durationMin || 90,
      joinUrl: c.joinUrl || "",
    });
    setModalOpen(true);
  };

  const refreshAll = () => { reload(); reloadOfferings(); };

  const handleSave = async () => {
    if (!form.title.trim()) return toast("Topic is required", { type: "error" });
    if (!form.scheduledAt) return toast("Date & time are required", { type: "error" });
    if (!editingId && !form.offeringId) return toast("Select a course", { type: "error" });

    setSaving(true);
    try {
      const base = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMin: Number(form.durationMin) || 90,
        joinUrl: form.joinUrl.trim() || undefined,
      };
      if (editingId) {
        await api.coordinator.updateLiveClass(editingId, base);
        toast("Live class updated ✓ Teacher & students notified", { type: "success" });
      } else {
        await api.coordinator.createLiveClass({ ...base, offeringId: form.offeringId });
        toast("Live class scheduled ✓ Teacher & students notified", { type: "success" });
      }
      setModalOpen(false);
      reload();
    } catch (e) {
      toast(e.message || "Failed to save live class", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete live class "${c.title}"? This cannot be undone.`)) return;
    setBusyId(c.id);
    try {
      await api.coordinator.deleteLiveClass(c.id);
      toast("Live class deleted", { type: "success" });
      reload();
    } catch (e) {
      toast(e.message || "Failed to delete", { type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      <button onClick={refreshAll} disabled={loading} className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1 disabled:opacity-50">
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
      </button>
      <button onClick={openCreate} disabled={loading || !!error || offerings.length === 0} className="btn-primary text-sm py-2 px-3 disabled:opacity-50">
        <Plus size={14} className="inline mr-1" /> Schedule Class
      </button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Live Class Schedule"
        subtitle="Build and manage the live-class timetable for your department's courses"
        icon="Video"
        breadcrumb={["Dashboard", "Live Class Schedule"]}
        actions={headerActions}
      />

      {loading && (
        <div className="grid lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      )}

      {!loading && error && <ErrorState description={error} onRetry={reload} />}

      {!loading && !error && classes.length === 0 && (
        <EmptyState
          icon="Video"
          title="No live classes scheduled"
          description={offerings.length === 0 ? "You don't have any active course offerings to schedule classes for." : "Schedule the first live session for one of your department's courses."}
          action={offerings.length > 0 ? openCreate : undefined}
          actionLabel="Schedule Class"
        />
      )}

      {!loading && !error && classes.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          {classes.map((c) => {
            const meta = STATUS_META[c.rawStatus] || STATUS_META.SCHEDULED;
            const isBusy = busyId === c.id;
            const canEdit = c.rawStatus === "SCHEDULED" || c.rawStatus === "CANCELLED";
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-base p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${c.rawStatus === "LIVE" ? "bg-gradient-to-br from-rose-500 to-pink-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}`}>
                      <Video size={20} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-primary-700 font-bold truncate">{c.courseCode} — {c.courseTitle}</p>
                      <p className="font-display font-bold text-app truncate">{c.title}</p>
                      <p className="text-[11px] text-muted-app truncate">Host: {c.instructor}</p>
                    </div>
                  </div>
                  <Badge color={meta.color}>{meta.label}</Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                  <div className="surface border border-app p-2 rounded-lg text-app truncate"><Calendar size={12} className="inline text-muted-app mr-1" /> {fmtDate(c.scheduledAt)}</div>
                  <div className="surface border border-app p-2 rounded-lg text-app truncate"><Clock size={12} className="inline text-muted-app mr-1" /> {fmtTime(c.scheduledAt)}</div>
                  <div className="surface border border-app p-2 rounded-lg text-app truncate"><Users size={12} className="inline text-muted-app mr-1" /> {c.enrolled ?? 0} enrolled</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <button onClick={() => openEdit(c)} className="flex-1 py-2 border border-app rounded-lg text-xs font-semibold text-app inline-flex items-center justify-center gap-1"><Pencil size={12} /> Reschedule / Edit</button>
                  )}
                  {c.joinUrl && (
                    <a href={c.joinUrl} target="_blank" rel="noreferrer" title="Open meeting link" className="px-3 py-2 border border-app rounded-lg text-xs font-semibold text-app"><ExternalLink size={12} className="inline mr-1" /> Link</a>
                  )}
                  <button onClick={() => handleDelete(c)} disabled={isBusy} title="Delete" className="px-3 py-2 border border-app rounded-lg text-xs font-semibold text-rose-600 disabled:opacity-50">
                    {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Schedule / Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Reschedule / Edit Live Class" : "Schedule Live Class"}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold mb-1 block">Course &amp; Teacher</label>
            <select className="input-base" value={form.offeringId} disabled={!!editingId} onChange={(e) => setForm({ ...form, offeringId: e.target.value })}>
              {!editingId && <option value="">Select a course…</option>}
              {offerings.map((o) => (
                <option key={o.id} value={o.id}>{offeringLabel(o)}</option>
              ))}
              {editingId && !offerings.find((o) => String(o.id) === String(form.offeringId)) && (
                <option value={form.offeringId}>Course #{form.offeringId}</option>
              )}
            </select>
            {editingId && <p className="text-[10px] text-muted-app mt-1">Course cannot be changed when editing.</p>}
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Topic</label>
            <input className="input-base" placeholder="e.g. Agile Methodologies" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Description <span className="text-muted-app font-normal">(optional)</span></label>
            <textarea className="input-base" rows={2} placeholder="What will be covered…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block">Date &amp; Time</label>
              <input type="datetime-local" className="input-base" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Duration (min)</label>
              <input type="number" min={5} className="input-base" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Join URL <span className="text-muted-app font-normal">(optional — fallback)</span></label>
            <input className="input-base" placeholder="https://meet.example.com/..." value={form.joinUrl} onChange={(e) => setForm({ ...form, joinUrl: e.target.value })} />
            <p className="text-[10px] text-muted-app mt-1">When BigBlueButton is configured on the server, a live room is created automatically — this URL is only used as a fallback.</p>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
            <button onClick={handleSave} className="btn-primary flex-1" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Update &amp; Notify" : "Schedule &amp; Notify"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LiveClassSchedule;

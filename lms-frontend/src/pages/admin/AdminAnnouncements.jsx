import { Plus, Megaphone, Trash2, Users, GraduationCap, Globe, Pencil, Send, Wifi } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import Badge from "../../components/common/Badge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";

const AUDIENCE_META = {
  ALL: { label: "Everyone", color: "blue", icon: Globe },
  STUDENTS: { label: "Students", color: "emerald", icon: GraduationCap },
  TEACHERS: { label: "Teachers", color: "purple", icon: Users },
};

const emptyForm = { title: "", message: "", audience: "ALL", offeringId: "" };

const AdminAnnouncements = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.coordinator.announcements(), []);
  const { data: offeringData } = useApi(() => api.structure.offerings("?limit=200"), []);
  const items = data?.announcements || [];
  const offerings = offeringData?.items || [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [live, setLive] = useState(false);

  // ---- Real-time: refresh feed on any announcement event ----
  const reloadRef = useCallback(() => reload(), [reload]);
  useEffect(() => {
    let es;
    try {
      es = new EventSource(api.coordinator.eventsUrl());
      es.onopen = () => setLive(true);
      es.onerror = () => setLive(false);
      es.addEventListener("announcement", () => reloadRef());
    } catch (_) { /* SSE optional */ }
    return () => { if (es) es.close(); };
  }, [reloadRef]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (a) => {
    setEditing(a);
    setForm({ title: a.title, message: a.message, audience: a.audience || "ALL", offeringId: a.offeringId ? String(a.offeringId) : "" });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast("Title and message are required", { type: "error" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.coordinator.updateAnnouncement(editing.id, {
          title: form.title.trim(),
          message: form.message.trim(),
          audience: form.audience,
          offeringId: form.offeringId || null,
        });
        toast("Announcement updated", { type: "success" });
      } else {
        const res = await api.coordinator.createAnnouncement({
          title: form.title.trim(),
          message: form.message.trim(),
          audience: form.audience,
          offeringId: form.offeringId || undefined,
        });
        toast(`Announcement posted — ${res.notified || 0} notified`, { type: "success" });
      }
      setOpen(false);
      setForm(emptyForm);
      setEditing(null);
      await reload();
    } catch (err) {
      toast(err.message || "Failed to save announcement", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const publish = async (a) => {
    try {
      const res = await api.coordinator.publishAnnouncement(a.id);
      toast(`Published in real time — ${res.notified || 0} recipient(s) notified`, { type: "success" });
    } catch (err) {
      toast(err.message || "Publish failed", { type: "error" });
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete announcement "${a.title}"?`)) return;
    try {
      await api.coordinator.deleteAnnouncement(a.id);
      toast("Announcement deleted", { type: "success" });
      await reload();
    } catch (err) {
      toast(err.message || "Failed to delete", { type: "error" });
    }
  };

  return (
    <div>
      <PageHeader title="Announcements" subtitle="Broadcast notices to students and faculty in real time." icon="Megaphone" breadcrumb={["Coordinator", "Announcements"]} actions={
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold inline-flex items-center gap-1 px-2 py-1 rounded-full border ${live ? "text-emerald-600 border-emerald-200 dark:border-emerald-500/30" : "text-muted-app border-app"}`}>
            <Wifi size={12} /> {live ? "Live" : "Offline"}
          </span>
          <button onClick={openCreate} className="btn-primary text-sm py-2 px-3"><Plus size={14} className="inline mr-1" /> New Announcement</button>
        </div>
      } />

      {error ? (
        <ErrorState title="Couldn't load announcements" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon="Megaphone" title="No announcements yet" description="Post your first announcement to notify students and faculty." action={openCreate} actionLabel="New Announcement" />
      ) : (
        <div className="space-y-3">
          {items.map((a, i) => {
            const meta = AUDIENCE_META[a.audience] || AUDIENCE_META.ALL;
            const Icon = a.offeringId ? Megaphone : meta.icon;
            return (
              <motion.div key={a.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-100 dark:border-slate-800 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-primary-100 dark:bg-primary-950/40 text-primary-700 dark:text-primary-400">
                      <Icon size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-bold text-app">{a.title}</h3>
                        <Badge color={meta.color}>{a.offering ? a.offering.code || "Course" : meta.label}</Badge>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{a.message}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{new Date(a.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => publish(a)} className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 rounded" title="Publish (real-time)"><Send size={14} /></button>
                    <button onClick={() => openEdit(a)} className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-blue-600 rounded" title="Edit"><Pencil size={14} /></button>
                    <button onClick={() => remove(a)} className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 rounded" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Announcement" : "New Announcement"} icon={Megaphone}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold mb-1 block text-secondary-app">Title *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-base w-full" placeholder="e.g. Mid-term schedule released" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block text-secondary-app">Audience</label>
              <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value, offeringId: "" })} className="input-base w-full" disabled={!!form.offeringId}>
                <option value="ALL">Everyone</option>
                <option value="STUDENTS">All Students</option>
                <option value="TEACHERS">All Teachers</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block text-secondary-app">Specific Course (optional)</label>
              <select value={form.offeringId} onChange={(e) => setForm({ ...form, offeringId: e.target.value })} className="input-base w-full">
                <option value="">— No specific course —</option>
                {offerings.map((o) => <option key={o.id} value={o.id}>{o.course?.code || o.courseId} — {o.course?.title || ""}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block text-secondary-app">Message *</label>
            <textarea rows="4" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="input-base w-full" placeholder="Write your announcement…" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary flex-1 disabled:opacity-60">{saving ? "Saving…" : editing ? "Save Changes" : "Post"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminAnnouncements;

import { motion } from "framer-motion";
import { Video, Users, Calendar, Clock, Play, Radio, ExternalLink, Loader2, Info, RefreshCw } from "lucide-react";
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

const blankRecording = { id: null, recordingUrl: "" };

// NOTE (client requirement 2.1): Teachers can NO LONGER schedule, reschedule,
// edit or delete live classes. Only the Course Coordinator builds the
// live-class timetable. This page is now read-only for scheduling — each
// teacher sees ONLY their own scheduled classes and may run them (Go Live /
// Enter Class / End) and add a recording after the session.
const TeacherLiveClasses = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.teacher.liveClasses(), []);

  const [busyId, setBusyId] = useState(null);

  // "Add Recording" modal (the only edit a teacher may still do — publish a
  // recording link for an ended class; it does NOT touch the schedule).
  const [recOpen, setRecOpen] = useState(false);
  const [rec, setRec] = useState(blankRecording);
  const [recSaving, setRecSaving] = useState(false);

  const classes = data?.liveClasses || [];

  // Join the live class as the moderator. With self-hosted BigBlueButton
  // configured on the backend, this returns a real signed moderator URL and
  // marks the class LIVE so enrolled students can join the same meeting.
  const handleJoin = async (c) => {
    setBusyId(c.id);
    try {
      const res = await api.teacher.joinLiveClass(c.id);
      const join = res?.join || res;
      const url = join?.joinUrl;
      if (!url) {
        toast("No meeting link available. Ask the Course Coordinator to configure BigBlueButton or set a Join URL on this class.", { type: "error" });
        return;
      }
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        toast("Pop-up blocked — allow pop-ups, then click Enter Class again.", { type: "error" });
      } else if (join.provider === "BigBlueButton") {
        toast("Joining BigBlueButton room as host… Students can now join.", { type: "success" });
      } else {
        toast("Opening meeting link…", { type: "success" });
      }
      reload();
    } catch (e) {
      toast(e.message || "Failed to start the meeting", { type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const handleEnd = async (c) => {
    if (!window.confirm(`End the live class "${c.title}"? The meeting room will close for everyone.`)) return;
    setBusyId(c.id);
    try {
      await api.teacher.endLiveClass(c.id);
      toast("Class ended", { type: "success" });
      reload();
    } catch (e) {
      toast(e.message || "Failed to end class", { type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const openRecording = (c) => {
    setRec({ id: c.id, recordingUrl: c.recordingUrl || "" });
    setRecOpen(true);
  };

  const handleSaveRecording = async () => {
    setRecSaving(true);
    try {
      // Only sends recordingUrl (+ status ENDED) — the backend rejects any
      // schedule change from a teacher, so this is schedule-safe.
      await api.teacher.updateLiveClass(rec.id, { recordingUrl: rec.recordingUrl.trim(), status: "ENDED" });
      toast("Recording link saved ✓", { type: "success" });
      setRecOpen(false);
      reload();
    } catch (e) {
      toast(e.message || "Failed to save recording", { type: "error" });
    } finally {
      setRecSaving(false);
    }
  };

  const headerActions = (
    <button onClick={reload} disabled={loading} className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1 disabled:opacity-50">
      <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Live Classes"
        subtitle="Run the live sessions scheduled for your courses by the Course Coordinator"
        icon="Video"
        breadcrumb={["Dashboard", "Live Classes"]}
        actions={headerActions}
      />

      {/* Info banner — scheduling is coordinator-owned (req 2.1). */}
      <div className="mb-5 rounded-2xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-4 py-3 flex items-start gap-3">
        <Info size={18} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Your live-class timetable is set by the <span className="font-semibold">Course Coordinator</span>.
          You can start and run each session below — you don't need to (and can't) schedule classes here.
        </p>
      </div>

      {loading && (
        <div className="grid lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      )}

      {!loading && error && <ErrorState description={error} onRetry={reload} />}

      {!loading && !error && classes.length === 0 && (
        <EmptyState
          icon="Video"
          title="No live classes scheduled"
          description="The Course Coordinator has not scheduled any live classes for your courses yet. They will appear here once scheduled."
        />
      )}

      {!loading && !error && classes.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          {classes.map((c) => {
            const meta = STATUS_META[c.status] || STATUS_META.SCHEDULED;
            const isBusy = busyId === c.id;
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-base p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${c.status === "LIVE" ? "bg-gradient-to-br from-rose-500 to-pink-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"}`}>
                      <Video size={20} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-primary-700 font-bold truncate">{c.courseCode} — {c.courseTitle}</p>
                      <p className="font-display font-bold text-app truncate">{c.title}</p>
                    </div>
                  </div>
                  <Badge color={meta.color}>{meta.label}</Badge>
                </div>

                {c.description && <p className="text-xs text-muted-app mb-3 line-clamp-2">{c.description}</p>}

                <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                  <div className="surface border border-app p-2 rounded-lg text-app truncate"><Calendar size={12} className="inline text-muted-app mr-1" /> {fmtDate(c.scheduledAt)}</div>
                  <div className="surface border border-app p-2 rounded-lg text-app truncate"><Clock size={12} className="inline text-muted-app mr-1" /> {fmtTime(c.scheduledAt)}</div>
                  <div className="surface border border-app p-2 rounded-lg text-app truncate"><Users size={12} className="inline text-muted-app mr-1" /> {c.durationMin || 0} min</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {c.status === "SCHEDULED" && (
                    <button onClick={() => handleJoin(c)} disabled={isBusy} className="flex-1 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-1">
                      {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Go Live
                    </button>
                  )}
                  {c.status === "LIVE" && (
                    <>
                      <button onClick={() => handleJoin(c)} disabled={isBusy} className="flex-1 py-2 bg-primary-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-1">
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Video size={12} />} Enter Class
                      </button>
                      <button onClick={() => handleEnd(c)} disabled={isBusy} className="px-3 py-2 bg-slate-700 text-white text-xs font-bold rounded-lg disabled:opacity-50">End</button>
                    </>
                  )}
                  {c.status === "ENDED" && c.recordingUrl && (
                    <a href={c.recordingUrl} target="_blank" rel="noreferrer" className="flex-1 py-2 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg text-center">
                      <Play size={12} className="inline mr-1" /> View Recording
                    </a>
                  )}
                  {c.status === "ENDED" && !c.recordingUrl && (
                    <button onClick={() => openRecording(c)} className="flex-1 py-2 surface border border-app text-app text-xs font-bold rounded-lg">Add Recording</button>
                  )}
                  {c.joinUrl && (c.status === "SCHEDULED" || c.status === "LIVE") && (
                    <a href={c.joinUrl} target="_blank" rel="noreferrer" title="Open meeting link" className="px-3 py-2 border border-app rounded-lg text-xs font-semibold text-app"><ExternalLink size={12} className="inline mr-1" /> Link</a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add / edit recording link — the only schedule-safe edit a teacher may make */}
      <Modal open={recOpen} onClose={() => setRecOpen(false)} title="Add Recording Link">
        <div className="space-y-3">
          <p className="text-xs text-muted-app">Publish the recording link for this completed class. This does not change the schedule.</p>
          <div>
            <label className="text-xs font-semibold mb-1 block">Recording URL</label>
            <input className="input-base" placeholder="https://..." value={rec.recordingUrl} onChange={(e) => setRec({ ...rec, recordingUrl: e.target.value })} />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setRecOpen(false)} className="btn-secondary flex-1" disabled={recSaving}>Cancel</button>
            <button onClick={handleSaveRecording} className="btn-primary flex-1" disabled={recSaving || !rec.recordingUrl.trim()}>
              {recSaving ? "Saving…" : "Save Recording"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TeacherLiveClasses;

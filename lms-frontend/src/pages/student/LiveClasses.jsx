import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Video, Radio, Clock, Calendar, ExternalLink, Play, User, X, Maximize2,
  Mic, MicOff, Camera, MessageSquare, Users, Hand, MonitorUp, PenTool,
  Presentation, Smile, BarChart3, Loader2, AlertTriangle,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { fileUrl } from "../../services/api";
import { useToast } from "../../context/ToastContext";

// The full set of BigBlueButton classroom features surfaced in the join panel.
const BBB_FEATURES = [
  { icon: Mic, label: "Audio Join" },
  { icon: MicOff, label: "Listen Only" },
  { icon: Camera, label: "Webcam" },
  { icon: MessageSquare, label: "Public & Private Chat" },
  { icon: Users, label: "Participants Panel" },
  { icon: Hand, label: "Raise Hand" },
  { icon: PenTool, label: "Multi-user Whiteboard" },
  { icon: Presentation, label: "Presentation Viewer" },
  { icon: MonitorUp, label: "Screen Sharing" },
  { icon: BarChart3, label: "Polls" },
  { icon: Smile, label: "Reactions & Emojis" },
  { icon: Video, label: "Breakout Rooms" },
];

const statusMeta = (s) => {
  const v = (s || "").toUpperCase();
  if (v === "LIVE") return { chip: "bg-rose-100 text-rose-700 animate-pulse", label: "Live Now", dot: "bg-rose-500" };
  if (v === "SCHEDULED" || v === "UPCOMING") return { chip: "bg-blue-100 text-blue-700", label: "Scheduled", dot: "bg-blue-500" };
  if (v === "ENDED" || v === "COMPLETED") return { chip: "bg-slate-100 text-slate-600", label: "Ended", dot: "bg-slate-400" };
  return { chip: "bg-slate-100 text-slate-600", label: s || "—", dot: "bg-slate-400" };
};

const fmtDateTime = (d) => {
  if (!d) return "";
  try { return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return d; }
};

const resolveRecording = (lc) => {
  if (!lc.recordingUrl) return null;
  return /^https?:\/\//i.test(lc.recordingUrl) ? lc.recordingUrl : fileUrl(lc.recordingUrl);
};

const LiveClasses = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, loading, error, reload } = useApi(() => api.student.liveClasses(), []);
  const [filter, setFilter] = useState("ALL");
  const [joining, setJoining] = useState(null); // id currently being joined
  const [room, setRoom] = useState(null); // active BBB classroom session
  const [autoJoined, setAutoJoined] = useState(false);

  // Open the in-app BigBlueButton classroom for a scheduled/live class.
  const joinClass = async (lc) => {
    setJoining(lc.id);
    try {
      const res = await api.student.joinLiveClass(lc.id);
      setRoom(res.join);
    } catch (e) {
      toast(e.message || "Unable to join the live class", { type: "error" });
    } finally {
      setJoining(null);
    }
  };

  // Leave the classroom — records leave time + duration for attendance.
  const leaveClass = async () => {
    const r = room;
    setRoom(null);
    if (r && r.id) {
      try { await api.student.leaveLiveClass(r.id, r.attendanceId); } catch { /* non-blocking */ }
    }
  };

  // Ensure leave is posted if the tab/window is closed while in a class.
  useEffect(() => {
    if (!room) return;
    const handler = () => {
      try {
        const url = `${api.base}/lms/academic/student/live-classes/${room.id}/leave`;
        const blob = new Blob([JSON.stringify({ attendanceId: room.attendanceId })], { type: "application/json" });
        if (navigator.sendBeacon) navigator.sendBeacon(url, blob);
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [room]);

  const classes = useMemo(() => {
    const all = data?.liveClasses || [];
    return [...all].sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  }, [data]);

  // Auto-open the classroom when deep-linked from a course card (?join=<id>).
  useEffect(() => {
    if (autoJoined || room) return;
    const joinId = searchParams.get("join");
    if (!joinId || classes.length === 0) return;
    const target = classes.find((c) => String(c.id) === String(joinId));
    if (target) {
      setAutoJoined(true);
      joinClass(target);
      const next = new URLSearchParams(searchParams);
      next.delete("join");
      setSearchParams(next, { replace: true });
    }
  }, [classes, searchParams, autoJoined, room]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    if (filter === "ALL") return classes;
    if (filter === "UPCOMING") return classes.filter((c) => ["SCHEDULED", "UPCOMING", "LIVE"].includes((c.status || "").toUpperCase()));
    if (filter === "RECORDED") return classes.filter((c) => ["ENDED", "COMPLETED"].includes((c.status || "").toUpperCase()));
    return classes;
  }, [classes, filter]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Live Classes" subtitle="Join live sessions and watch recordings" icon="Radio" breadcrumb={["Dashboard", "Live Classes"]} />
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Live Classes" subtitle="Join live sessions and watch recordings" icon="Radio" breadcrumb={["Dashboard", "Live Classes"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : classes.length === 0 ? (
        <EmptyState icon="Radio" title="No live classes" description="Live class sessions scheduled by your instructors will appear here." />
      ) : (
        <>
          <div className="flex gap-2 mb-5">
            {[["ALL", "All"], ["UPCOMING", "Upcoming & Live"], ["RECORDED", "Recorded"]].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold ${filter === k ? "bg-primary-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>{l}</button>
            ))}
          </div>

          {shown.length === 0 ? (
            <EmptyState icon="Radio" title="Nothing here" description="No classes match this filter." />
          ) : (
            <div className="space-y-3">
              {shown.map((lc, i) => {
                const sm = statusMeta(lc.status);
                const recording = resolveRecording(lc);
                const isLive = (lc.status || "").toUpperCase() === "LIVE";
                const ended = ["ENDED", "COMPLETED"].includes((lc.status || "").toUpperCase());
                return (
                  <motion.div key={lc.id || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shrink-0"><Video size={22} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sm.chip}`}>{sm.label}</span>
                        {lc.courseCode && <span className="text-[10px] font-mono font-bold text-primary-600">{lc.courseCode}</span>}
                      </div>
                      <p className="font-display font-bold text-slate-900 dark:text-slate-100 mt-1">{lc.title}</p>
                      {lc.description && <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{lc.description}</p>}
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDateTime(lc.scheduledAt)}</span>
                        {lc.durationMin && <span className="flex items-center gap-1"><Clock size={11} /> {lc.durationMin} min</span>}
                        {lc.teacher && <span className="flex items-center gap-1"><User size={11} /> {lc.teacher}</span>}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {isLive && lc.joinUrl ? (
                        <button onClick={() => joinClass(lc)} disabled={joining === lc.id} className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60">{joining === lc.id ? <Loader2 size={15} className="animate-spin" /> : <Radio size={15} />} Join Live</button>
                      ) : ended && recording ? (
                        <a href={recording} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700"><Play size={15} /> Watch Recording</a>
                      ) : !ended && lc.joinUrl ? (
                        <button onClick={() => joinClass(lc)} disabled={joining === lc.id} className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">{joining === lc.id ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />} Join Classroom</button>
                      ) : (
                        <span className="text-xs text-slate-400">No link</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---- BigBlueButton in-app classroom ---- */}
      <AnimatePresence>
        {room && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex flex-col"
          >
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-white shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-600/90"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> {(room.status || "").toUpperCase() === "LIVE" ? "LIVE" : "CLASSROOM"}</span>
                <div className="min-w-0">
                  <p className="font-display font-bold truncate">{room.title}</p>
                  <p className="text-[11px] text-slate-400 truncate">{room.courseCode} · {room.courseTitle} · {room.teacher} · BigBlueButton</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={room.joinUrl} target="_blank" rel="noreferrer" title="Open in new tab" className="p-2 rounded-lg hover:bg-slate-800 text-slate-300"><Maximize2 size={16} /></a>
                <button onClick={leaveClass} title="Leave classroom" className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700"><X size={15} /> Leave</button>
              </div>
            </div>

            {/* Body: embedded BBB classroom + feature rail */}
            <div className="flex-1 flex min-h-0">
              <div className="flex-1 bg-black relative">
                <iframe
                  title="BigBlueButton Classroom"
                  src={room.joinUrl}
                  className="w-full h-full border-0"
                  allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
                  allowFullScreen
                />
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-900/85 backdrop-blur text-white text-[11px] border border-slate-700">
                  <span className="flex items-center gap-1"><User size={12} /> {room.attendeeName}</span>
                  <span className="text-slate-500">·</span>
                  <span className="flex items-center gap-1"><Clock size={12} /> {room.durationMin} min</span>
                </div>
              </div>

              {/* Feature rail — mirrors the BBB classroom toolset */}
              <aside className="hidden lg:flex w-64 flex-col bg-slate-900 border-l border-slate-800 p-4 text-slate-300 overflow-y-auto shrink-0">
                <p className="text-[11px] uppercase tracking-wide font-bold text-slate-500 mb-3">Classroom Tools</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {BBB_FEATURES.map((f) => (
                    <div key={f.label} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-slate-800/60 text-[12px] font-medium">
                      <f.icon size={14} className="text-primary-400 shrink-0" /> {f.label}
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 rounded-xl bg-slate-800/60 text-[11px] text-slate-400 leading-relaxed">
                  <p className="flex items-center gap-1.5 font-semibold text-slate-300 mb-1"><AlertTriangle size={12} className="text-amber-400" /> Tip</p>
                  Allow camera & microphone access when prompted to use audio, webcam and screen sharing inside the BigBlueButton classroom.
                </div>
              </aside>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LiveClasses;

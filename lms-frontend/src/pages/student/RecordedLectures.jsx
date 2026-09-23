import { motion } from "framer-motion";
import { useMemo, useState, useRef, useCallback } from "react";
import { Video, Play, FileText, X, Download, Youtube as YoutubeIcon, CheckCircle2 } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { fileUrl } from "../../services/api";
import { useToast } from "../../context/ToastContext";

// Extract a YouTube video id from any common URL form
// (watch?v=, youtu.be/, /embed/, /v/).
const ytId = (url = "") => {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};

const resolveUrl = (lec) => {
  // Prefer the served path (filePath) over the original upload name (fileName).
  if (lec.url && /^https?:\/\//i.test(lec.url)) return lec.url;
  if (lec.filePath && /^https?:\/\//i.test(lec.filePath)) return lec.filePath;
  if (lec.filePath) return fileUrl(lec.filePath);
  if (lec.url) return fileUrl(lec.url);
  if (lec.fileName) return fileUrl(lec.fileName);
  return null;
};

const videoMime = (src = "") => {
  const ext = (src.split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  const map = {
    mp4: "video/mp4",
    webm: "video/webm",
    ogg: "video/ogg",
    ogv: "video/ogg",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mpeg: "video/mpeg",
    mpg: "video/mpeg",
    "3gp": "video/3gpp",
  };
  return map[ext] || "video/mp4";
};

const fmtDate = (d) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
};

const RecordedLectures = () => {
  const { data, loading, error, reload } = useApi(() => api.student.recordedLectures(), []);
  const { toast } = useToast();
  const [active, setActive] = useState(null);
  // Point 6 — live per-lecture watch progress (keyed by lectureKey) so the
  // cards can show completion % + auto-attendance status without a full reload.
  const [progress, setProgress] = useState({});

  const subjects = useMemo(() => data?.subjects || [], [data]);
  const total = useMemo(() => subjects.reduce((a, s) => a + (s.lectures?.length || 0), 0), [subjects]);
  const threshold = data?.attendanceThreshold || 70;

  // Track the furthest point reached in the currently-open lecture and throttle
  // progress reports to the backend (which auto-marks attendance at >=70%).
  const maxSecondsRef = useRef(0);
  const lastSentRef = useRef(0);
  const wonRef = useRef({}); // lectureKey -> true once attendance granted

  const progressFor = useCallback((lec) => {
    const p = progress[lec.lectureKey || lec.id];
    if (p) return p;
    return { watched: !!lec.watched, progressPercent: Number(lec.progressPercent) || 0 };
  }, [progress]);

  const sendProgress = useCallback(async (lec, watchedSeconds, durationSeconds, force = false) => {
    if (!lec) return;
    const key = lec.lectureKey || lec.id;
    const offeringId = lec.offeringId;
    if (!offeringId || !key) return;
    // Throttle: at most one report every ~10s of watch time unless forced.
    if (!force && watchedSeconds - lastSentRef.current < 10) return;
    lastSentRef.current = watchedSeconds;
    try {
      const res = await api.student.reportLectureProgress(offeringId, key, watchedSeconds, durationSeconds || 0);
      setProgress((prev) => ({ ...prev, [key]: { watched: res.watched, progressPercent: res.progressPercent } }));
      if (res.watched && !wonRef.current[key]) {
        wonRef.current[key] = true;
        toast(`Attendance marked — you watched ${threshold}% of "${lec.title}"`, { type: "success" });
      }
    } catch (_) { /* silent — progress will be retried on next tick */ }
  }, [toast, threshold]);

  const openLecture = (lec, url) => {
    maxSecondsRef.current = 0;
    lastSentRef.current = 0;
    setActive({ ...lec, url });
  };

  const handleTimeUpdate = (e, lec) => {
    const v = e.currentTarget;
    if (!v || !v.duration || Number.isNaN(v.duration)) return;
    // Only count forward progress (guards against seeking backwards).
    if (v.currentTime > maxSecondsRef.current) maxSecondsRef.current = v.currentTime;
    sendProgress(lec, maxSecondsRef.current, v.duration, false);
  };

  const handlePauseOrEnd = (e, lec) => {
    const v = e.currentTarget;
    if (!v || !v.duration || Number.isNaN(v.duration)) return;
    sendProgress(lec, Math.max(maxSecondsRef.current, v.currentTime), v.duration, true);
  };

  const closeModal = () => {
    // Flush the final progress before closing so a quick watch still counts.
    if (active && active.offeringId && maxSecondsRef.current > 0) {
      sendProgress(active, maxSecondsRef.current, 0, true);
    }
    setActive(null);
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Recorded Lectures" subtitle="Catch up on recorded class sessions" icon="Video" breadcrumb={["Dashboard", "Recorded Lectures"]} />
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Recorded Lectures" subtitle="Catch up on recorded class sessions" icon="Video" breadcrumb={["Dashboard", "Recorded Lectures"]} />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : total === 0 ? (
        <EmptyState icon="Video" title="No recorded lectures" description="Recorded lectures will appear here once your instructors upload them or live classes are recorded." />
      ) : (
        <div className="space-y-5">
          {subjects.map((s, si) => (
            (s.lectures || []).length > 0 && (
              <motion.div key={s.courseCode || si} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: si * 0.05 }} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-900/30"><Video size={18} className="text-rose-600" /></div>
                  <div>
                    <p className="font-mono font-bold text-sm text-primary-700">{s.courseCode}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{s.courseTitle}</p>
                  </div>
                  <span className="ml-auto text-xs font-semibold text-slate-500 dark:text-slate-400">{s.lectures.length} lecture{s.lectures.length === 1 ? "" : "s"}</span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                  {s.lectures.map((lec, li) => {
                    const url = resolveUrl(lec);
                    const vid = ytId(lec.url || "");
                    const thumb = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null;
                    // Anything that is a YouTube link, a VIDEO/RECORDING, or a
                    // known video file extension is playable in the modal.
                    const isVideo = !!vid
                      || ["VIDEO", "LIVE_RECORDING"].includes((lec.kind || "").toUpperCase())
                      || /\.(mp4|webm|ogg|ogv|mov|mkv|avi|mpeg|mpg|3gp)$/i.test(lec.fileName || lec.filePath || lec.url || "");
                    return (
                      <div key={lec.id || li} className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden hover:shadow-soft transition">
                        <div className="relative h-28 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center cursor-pointer" onClick={() => (isVideo && url ? openLecture(lec, url) : null)}>
                          {thumb ? (
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          ) : isVideo ? <Play size={32} className="text-white/80" /> : <FileText size={32} className="text-white/80" />}
                          {lec.week != null && <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/40 text-white">Week {lec.week}</span>}
                          {vid && <span className="absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded bg-red-600 text-white flex items-center gap-1"><YoutubeIcon size={9} /> YouTube</span>}
                          {(() => { const pr = progressFor(lec); return pr.watched ? (
                            <span className="absolute bottom-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1"><CheckCircle2 size={9} /> Attended</span>
                          ) : pr.progressPercent > 0 ? (
                            <span className="absolute bottom-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">{Math.round(pr.progressPercent)}%</span>
                          ) : null; })()}
                        </div>
                        <div className="p-3">
                          <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 line-clamp-2">{lec.title}</p>
                          <p className="text-[11px] text-slate-400 mt-1">{fmtDate(lec.createdAt)}</p>
                          {(() => { const pr = progressFor(lec); return isVideo && !pr.watched ? (
                            <div className="mt-2">
                              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(100, pr.progressPercent)}%` }} />
                              </div>
                              <p className="text-[9px] text-slate-400 mt-1">Watch {threshold}% to mark attendance automatically</p>
                            </div>
                          ) : null; })()}
                          <div className="flex gap-2 mt-2">
                            {isVideo && url ? (
                              <button onClick={() => openLecture(lec, url)} className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"><Play size={13} /> Watch</button>
                            ) : url ? (
                              <a href={url} target="_blank" rel="noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"><Download size={13} /> Open</a>
                            ) : (
                              <span className="flex-1 text-center text-xs text-slate-400 py-1.5">Unavailable</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )
          ))}
        </div>
      )}

      {active && (() => {
        const vid = ytId(active.url || "");
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeModal}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-slate-950 rounded-2xl overflow-hidden w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <p className="font-semibold text-white text-sm truncate">{active.title}</p>
                <div className="flex items-center gap-2">
                  <a href={active.url} target="_blank" rel="noreferrer" className="text-xs font-semibold px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white">Full screen / open</a>
                  <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-slate-800 text-white"><X size={18} /></button>
                </div>
              </div>
              {vid ? (
                // YouTube embed — supports full-screen, seeking, captions natively.
                <div className="w-full bg-black" style={{ aspectRatio: "16 / 9" }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`}
                    title={active.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <video
                  key={active.url}
                  controls
                  autoPlay
                  preload="metadata"
                  playsInline
                  controlsList="nodownload"
                  className="w-full max-h-[70vh] bg-black"
                  onTimeUpdate={(e) => handleTimeUpdate(e, active)}
                  onPause={(e) => handlePauseOrEnd(e, active)}
                  onEnded={(e) => handlePauseOrEnd(e, active)}
                >
                  <source src={active.url} type={videoMime(active.url)} />
                  Your browser does not support embedded video playback.{" "}
                  <a href={active.url} target="_blank" rel="noreferrer" className="underline">Open the video</a>.
                </video>
              )}
            </motion.div>
          </div>
        );
      })()}
    </div>
  );
};

export default RecordedLectures;

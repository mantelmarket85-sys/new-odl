import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Download, Plus, Wand2, Trash2, Edit3, X, AlertTriangle, Clock,
  MapPin, GraduationCap, Loader2, Printer, GripVertical, Info,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Badge from "../../components/common/Badge";
import Modal from "../../components/common/Modal";
import { useToast } from "../../context/ToastContext";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";

/* =========================================================================
 * Course Coordinator → Weekly Schedule / Timetable (LIVE)
 *
 * Full weekly timetable backed by ScheduleSlot. Coordinators can:
 *   • Auto-generate a clash-free timetable
 *   • Create / edit / delete class slots (with clash detection)
 *   • Drag & drop a class onto a different day/time cell (re-checks clashes)
 * Per-teacher and per-student schedule views are generated automatically
 * from the same slots (teacher /schedule, student /schedule endpoints).
 * No mock data.
 * ======================================================================= */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PERIODS = [
  ["08:00", "09:30"], ["09:30", "11:00"], ["11:00", "12:30"],
  ["12:30", "14:00"], ["14:00", "15:30"], ["15:30", "17:00"],
];
const WORK_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri columns in the grid

const slotColor = (sem) => {
  const palette = [
    "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500", "bg-cyan-600", "bg-indigo-500", "bg-teal-500",
  ];
  return palette[((sem || 0) - 1 + palette.length) % palette.length] || "bg-slate-500";
};

const emptyForm = { offeringId: "", dayOfWeek: 1, startTime: "08:00", endTime: "09:30", room: "", mode: "ONSITE" };

const WeeklySchedule = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.coordinator.schedule(), []);
  const allocApi = useApi(() => api.coordinator.allocation(), []);

  const days = useMemo(() => data?.days || [], [data]);
  const offerings = useMemo(() => allocApi.data?.offerings || [], [allocApi.data]);

  const [autoBusy, setAutoBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [clashes, setClashes] = useState([]);
  const [dragSlot, setDragSlot] = useState(null);
  const [dropCell, setDropCell] = useState(null);

  // Flatten all slots for quick lookups
  const allSlots = useMemo(() => days.flatMap((d) => d.slots.map((s) => ({ ...s, dayOfWeek: d.dayOfWeek }))), [days]);

  const stats = useMemo(() => ({
    slots: data?.totalSlots || 0,
    courses: new Set(allSlots.map((s) => s.courseCode)).size,
    teachers: new Set(allSlots.map((s) => s.teacherId).filter(Boolean)).size,
    rooms: new Set(allSlots.map((s) => s.room).filter(Boolean)).size,
  }), [data, allSlots]);

  // slot lookup by day + period start
  const slotAt = (dayOfWeek, startTime) =>
    allSlots.filter((s) => s.dayOfWeek === dayOfWeek && s.startTime === startTime);

  // ---------- handlers ----------
  const openAdd = (dayOfWeek, startTime, endTime) => {
    setEditing(null);
    setClashes([]);
    setForm({ ...emptyForm, offeringId: offerings[0]?.id || "", dayOfWeek: dayOfWeek ?? 1, startTime: startTime || "08:00", endTime: endTime || "09:30" });
    setModalOpen(true);
  };

  const openEdit = (slot) => {
    setEditing(slot);
    setClashes([]);
    setForm({ offeringId: slot.offeringId, dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime, room: slot.room || "", mode: slot.mode || "ONSITE" });
    setModalOpen(true);
  };

  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // live clash check whenever form changes (debounced-ish via effect)
  useEffect(() => {
    if (!modalOpen || !form.offeringId) { setClashes([]); return; }
    let active = true;
    const t = setTimeout(async () => {
      try {
        const res = await api.coordinator.scheduleClashCheck({
          offeringId: form.offeringId, dayOfWeek: form.dayOfWeek, startTime: form.startTime,
          endTime: form.endTime, room: form.room || null, excludeId: editing?.id || null,
        });
        if (active) setClashes(res.clashes || []);
      } catch { /* ignore */ }
    }, 350);
    return () => { active = false; clearTimeout(t); };
  }, [modalOpen, form.offeringId, form.dayOfWeek, form.startTime, form.endTime, form.room, editing]);

  const handleSave = async (e, force = false) => {
    e?.preventDefault?.();
    if (!form.offeringId) { toast("Select a course offering", { type: "error" }); return; }
    setSaving(true);
    try {
      const payload = { ...form, offeringId: Number(form.offeringId), dayOfWeek: Number(form.dayOfWeek), force };
      if (editing) await api.coordinator.updateSlot(editing.id, payload);
      else await api.coordinator.createSlot(payload);
      toast(editing ? "Class slot updated" : "Class slot created", { type: "success" });
      setModalOpen(false); setEditing(null); setForm(emptyForm); setClashes([]);
      reload();
    } catch (err) {
      // 409 clash → show the clash list and offer to force
      if (err.data?.clashes) {
        setClashes(err.data.clashes);
        toast("Schedule clash detected — review below", { type: "error" });
      } else {
        toast(err.message || "Save failed", { type: "error" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slot) => {
    if (!window.confirm(`Delete ${slot.courseCode} (${DAYS[slot.dayOfWeek]} ${slot.startTime})?`)) return;
    try {
      await api.coordinator.deleteSlot(slot.id);
      toast("Class slot deleted", { type: "success" });
      reload();
    } catch (err) {
      toast(err.message || "Delete failed", { type: "error" });
    }
  };

  const handleAutoGenerate = async () => {
    const hasExisting = (data?.totalSlots || 0) > 0;
    const clearExisting = hasExisting
      ? window.confirm("A timetable already exists.\n\nOK = Clear & regenerate everything.\nCancel = Only schedule offerings that have no slots yet.")
      : false;
    setAutoBusy(true);
    try {
      const res = await api.coordinator.autoGenerateSchedule({ clearExisting });
      toast(res.message, { type: "success" });
      reload();
    } catch (err) {
      toast(err.message || "Auto-generate failed", { type: "error" });
    } finally {
      setAutoBusy(false);
    }
  };

  // ---------- drag & drop move ----------
  const onDropCell = async (dayOfWeek, startTime, endTime) => {
    setDropCell(null);
    if (!dragSlot) return;
    const slot = dragSlot;
    setDragSlot(null);
    if (slot.dayOfWeek === dayOfWeek && slot.startTime === startTime) return;
    try {
      await api.coordinator.updateSlot(slot.id, { dayOfWeek, startTime, endTime, room: slot.room, mode: slot.mode });
      toast(`${slot.courseCode} moved to ${DAYS[dayOfWeek]} ${startTime}`, { type: "success" });
      reload();
    } catch (err) {
      if (err.data?.clashes) {
        const force = window.confirm(`Moving here causes a clash:\n\n${err.data.clashes.map((c) => "• " + c.message).join("\n")}\n\nMove anyway?`);
        if (force) {
          try {
            await api.coordinator.updateSlot(slot.id, { dayOfWeek, startTime, endTime, room: slot.room, mode: slot.mode, force: true });
            toast(`${slot.courseCode} moved (clash overridden)`, { type: "warning" });
            reload();
          } catch (e2) { toast(e2.message || "Move failed", { type: "error" }); }
        }
      } else {
        toast(err.message || "Move failed", { type: "error" });
      }
    }
  };

  const exportCsv = () => {
    if (allSlots.length === 0) { toast("Nothing to export", { type: "warning" }); return; }
    const head = "Day,Start,End,Course,Title,Type,Teacher,Room,Mode";
    const body = allSlots.map((s) => [DAYS[s.dayOfWeek], s.startTime, s.endTime, s.courseCode, `"${s.courseTitle}"`, s.slotType || "THEORY", s.teacher || "TBA", s.room || "", s.mode].join(",")).join("\n");
    const blob = new Blob([`${head}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "weekly-timetable.csv"; a.click();
    URL.revokeObjectURL(url);
    toast("Timetable exported", { type: "success" });
  };

  const printTimetable = () => window.print();

  return (
    <div>
      <PageHeader
        title="Weekly Schedule"
        subtitle="Build the weekly timetable with auto-generation, clash detection and drag-and-drop. Teachers & students see their own classes automatically."
        icon="Calendar"
        breadcrumb={["Coordinator", "Weekly Schedule"]}
        actions={
          <div className="flex flex-wrap gap-2">
            <button onClick={handleAutoGenerate} disabled={autoBusy} className="btn-primary text-sm py-2 px-3 disabled:opacity-60">
              {autoBusy ? <Loader2 size={14} className="inline mr-1 animate-spin" /> : <Wand2 size={14} className="inline mr-1" />} Auto-Generate
            </button>
            <button onClick={() => openAdd()} className="btn-secondary text-sm py-2 px-3"><Plus size={14} className="inline mr-1" /> Add Class</button>
            <button onClick={exportCsv} className="btn-secondary text-sm py-2 px-3"><Download size={14} className="inline mr-1" /> Export</button>
            <button onClick={printTimetable} className="btn-secondary text-sm py-2 px-3"><Printer size={14} className="inline mr-1" /> Print</button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard title="Class Slots" value={stats.slots} icon="Calendar" color="blue" delay={0.05} />
        <StatCard title="Courses" value={stats.courses} icon="BookOpen" color="purple" delay={0.1} />
        <StatCard title="Teachers" value={stats.teachers} icon="Users" color="emerald" delay={0.15} />
        <StatCard title="Rooms" value={stats.rooms} icon="MapPin" color="amber" delay={0.2} />
      </div>

      <div className="card-base p-3 mb-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center flex-shrink-0"><Info size={15} /></div>
        <p className="text-xs text-muted-app leading-relaxed">
          Click an empty cell to add a class, drag a class card to a new cell to reschedule it (clashes are detected automatically),
          or use <b className="text-app">Auto-Generate</b> to build a clash-free timetable. Each teacher and student automatically sees only their own classes.
          Courses with a <b className="text-app">Lab</b> component automatically get a separate <b className="text-app">Lab slot</b> (marked <span className="px-1 rounded bg-violet-500 text-white text-[9px] font-bold uppercase">Lab</span>), taught by the same instructor.
        </p>
      </div>

      {error ? (
        <ErrorState title="Couldn't load schedule" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="card-base p-5 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (
        <div className="card-base p-3 overflow-x-auto" id="timetable-grid">
          <table className="w-full border-collapse min-w-[820px]">
            <thead>
              <tr>
                <th className="p-2 text-xs font-bold text-muted-app uppercase w-24 text-left">Time</th>
                {WORK_DAYS.map((d) => (
                  <th key={d} className="p-2 text-xs font-bold text-app uppercase text-center">{DAYS[d]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map(([start, end]) => (
                <tr key={start}>
                  <td className="p-2 align-top">
                    <div className="text-xs font-bold text-app">{start}</div>
                    <div className="text-[10px] text-muted-app">{end}</div>
                  </td>
                  {WORK_DAYS.map((d) => {
                    const cellSlots = slotAt(d, start);
                    const isDrop = dropCell === `${d}-${start}`;
                    return (
                      <td key={d}
                        onDragOver={(e) => { e.preventDefault(); if (dropCell !== `${d}-${start}`) setDropCell(`${d}-${start}`); }}
                        onDragLeave={() => setDropCell((c) => (c === `${d}-${start}` ? null : c))}
                        onDrop={() => onDropCell(d, start, end)}
                        className={`p-1.5 align-top border border-app/60 min-w-[140px] transition-colors ${isDrop ? "bg-primary-50 dark:bg-primary-500/10 ring-2 ring-inset ring-primary-400" : ""}`}>
                        <div className="space-y-1.5 min-h-[3.5rem]">
                          <AnimatePresence initial={false}>
                            {cellSlots.map((s) => (
                              <motion.div key={s.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                                draggable
                                onDragStart={() => setDragSlot(s)}
                                onDragEnd={() => setDragSlot(null)}
                                className={`group cursor-grab active:cursor-grabbing rounded-lg text-white p-2 shadow-sm ${slotColor(s.semester)} ${dragSlot?.id === s.id ? "opacity-40" : ""}`}>
                                <div className="flex items-start justify-between gap-1">
                                  <span className="text-[11px] font-bold leading-tight">
                                    {s.courseCode}
                                    {s.slotType === "LAB" && <span className="ml-1 align-middle px-1 rounded bg-white/30 text-[8px] font-extrabold uppercase tracking-wide">Lab</span>}
                                  </span>
                                  <GripVertical size={11} className="opacity-60 flex-shrink-0" />
                                </div>
                                <p className="text-[10px] opacity-90 leading-tight line-clamp-2">{s.courseTitle}{s.slotType === "LAB" ? " — Lab" : ""}</p>
                                <div className="flex items-center gap-1 mt-1 text-[9px] opacity-90">
                                  {s.room && <span className="inline-flex items-center gap-0.5"><MapPin size={8} /> {s.room}</span>}
                                  <span className="px-1 rounded bg-white/20">{s.mode}</span>
                                </div>
                                {s.teacher && <p className="text-[9px] opacity-90 mt-0.5 inline-flex items-center gap-0.5"><GraduationCap size={8} /> {s.teacher}</p>}
                                <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openEdit(s)} className="flex-1 bg-white/20 rounded px-1 py-0.5 text-[9px] font-bold hover:bg-white/30"><Edit3 size={9} className="inline" /> Edit</button>
                                  <button onClick={() => handleDelete(s)} className="bg-white/20 rounded px-1.5 py-0.5 text-[9px] font-bold hover:bg-rose-500/60"><Trash2 size={9} /></button>
                                </div>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                          <button onClick={() => openAdd(d, start, end)} className="w-full text-[10px] text-muted-app border border-dashed border-app rounded-lg py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-primary-600 transition-colors">
                            <Plus size={10} className="inline" /> Add
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit slot modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? "Edit Class Slot" : "Add Class Slot"}
        subtitle="Schedule a weekly class — clashes are checked live"
        icon={Calendar} maxWidth="max-w-xl">
        <form onSubmit={(e) => handleSave(e, false)} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-secondary-app">Course Offering *</label>
            <select value={form.offeringId} onChange={(e) => change("offeringId", e.target.value)} className="input-base mt-1 w-full" required disabled={!!editing}>
              <option value="">— Select offering —</option>
              {offerings.map((o) => <option key={o.id} value={o.id}>{o.course?.code} — {o.course?.title} {o.teacher ? `(${o.teacher})` : ""}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-secondary-app">Day</label>
              <select value={form.dayOfWeek} onChange={(e) => change("dayOfWeek", Number(e.target.value))} className="input-base mt-1 w-full">
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary-app">Start</label>
              <input type="time" value={form.startTime} onChange={(e) => change("startTime", e.target.value)} className="input-base mt-1 w-full" required />
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary-app">End</label>
              <input type="time" value={form.endTime} onChange={(e) => change("endTime", e.target.value)} className="input-base mt-1 w-full" required />
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary-app">Mode</label>
              <select value={form.mode} onChange={(e) => change("mode", e.target.value)} className="input-base mt-1 w-full">
                <option value="ONSITE">Onsite</option>
                <option value="ONLINE">Online</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-secondary-app">Room</label>
            <input value={form.room} onChange={(e) => change("room", e.target.value)} placeholder="e.g. R-101 / Lab-1" className="input-base mt-1 w-full" />
          </div>

          {/* Live clash warnings */}
          {clashes.length > 0 && (
            <div className="rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 p-3">
              <p className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1 mb-1"><AlertTriangle size={13} /> {clashes.length} clash(es) detected</p>
              <ul className="text-[11px] text-rose-700 dark:text-rose-300 space-y-0.5 list-disc list-inside">
                {clashes.map((c, i) => <li key={i}><b>{c.type}:</b> {c.message}</li>)}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-app">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary text-sm py-2 px-4"><X size={14} className="inline mr-1" /> Cancel</button>
            {clashes.length > 0 && (
              <button type="button" onClick={(e) => handleSave(e, true)} disabled={saving} className="text-sm py-2 px-4 rounded-lg font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60">
                <AlertTriangle size={13} className="inline mr-1" /> Save Anyway
              </button>
            )}
            <button type="submit" disabled={saving || clashes.length > 0} className="btn-primary text-sm py-2 px-4 disabled:opacity-60" title={clashes.length ? "Resolve clashes or use Save Anyway" : ""}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Class"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default WeeklySchedule;

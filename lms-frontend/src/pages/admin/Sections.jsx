import { useEffect, useMemo, useState } from "react";
import {
  Plus, Users, Layers, Edit3, Trash2, X, Search, GraduationCap, BookOpen,
  Wand2, ArrowLeftRight, GripVertical, Loader2, DoorOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import { useToast } from "../../context/ToastContext";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

/* =========================================================================
 * Course Coordinator → Sections (LIVE)
 *
 * Sections belong to a course offering. Each offering is shown as a
 * professional card grouped by semester. Coordinators can:
 *   • Create sections manually (default capacity 150)
 *   • Auto-create + auto-distribute students into sections of 150
 *   • Edit / delete sections
 *   • Open a drag-and-drop "Manage Students" board to transfer students
 *     between sections of the same offering (persists to DB).
 * All data is live from the API — no mock data.
 * ======================================================================= */

const DEFAULT_CAPACITY = 150;
const emptyForm = { name: "", capacity: DEFAULT_CAPACITY, room: "" };

const fillColor = (pct) =>
  pct >= 90 ? "from-rose-500 to-pink-600" : pct >= 70 ? "from-amber-500 to-orange-600" : "from-emerald-500 to-teal-600";

const Sections = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.structure.offerings(), []);
  const offerings = useMemo(() => data?.items || [], [data]);

  const [sectionsByOffering, setSectionsByOffering] = useState({}); // offeringId -> sections[]
  const [loadingSections, setLoadingSections] = useState({});
  const [expanded, setExpanded] = useState({});
  const [query, setQuery] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [autoBusy, setAutoBusy] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [targetOffering, setTargetOffering] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Drag & drop transfer board
  const [manageOffering, setManageOffering] = useState(null);

  const semesters = useMemo(
    () => [...new Set(offerings.map((o) => o.course?.semester?.number).filter(Boolean))].sort((a, b) => a - b),
    [offerings]
  );

  const filtered = useMemo(() => {
    return offerings.filter((o) => {
      if (semesterFilter !== "all" && String(o.course?.semester?.number) !== String(semesterFilter)) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        if (!o.course?.code?.toLowerCase().includes(q) && !o.course?.title?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [offerings, query, semesterFilter]);

  // Group offerings by semester for professional, semester-wise cards
  const bySemester = useMemo(() => {
    const groups = new Map();
    filtered.forEach((o) => {
      const sem = o.course?.semester?.number ?? 0;
      if (!groups.has(sem)) groups.set(sem, []);
      groups.get(sem).push(o);
    });
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const loadSections = async (offeringId) => {
    setLoadingSections((m) => ({ ...m, [offeringId]: true }));
    try {
      const res = await api.structure.offeringSections(offeringId);
      setSectionsByOffering((m) => ({ ...m, [offeringId]: res.sections || [] }));
    } catch (e) {
      toast(e.message || "Failed to load sections", { type: "error" });
    } finally {
      setLoadingSections((m) => ({ ...m, [offeringId]: false }));
    }
  };

  const toggleExpand = (offeringId) => {
    const next = !expanded[offeringId];
    setExpanded((m) => ({ ...m, [offeringId]: next }));
    if (next && !sectionsByOffering[offeringId]) loadSections(offeringId);
  };

  const openAdd = (offering) => {
    setTargetOffering(offering);
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (offering, section) => {
    setTargetOffering(offering);
    setEditing(section);
    setForm({ name: section.name, capacity: section.capacity ?? DEFAULT_CAPACITY, room: section.room || "" });
    setModalOpen(true);
  };

  const handleChange = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!form.name.trim()) { toast("Section name is required", { type: "error" }); return; }
    setSaving(true);
    const offId = targetOffering.id;
    const payload = { name: form.name.trim(), capacity: Number(form.capacity) || DEFAULT_CAPACITY, room: form.room.trim() || null };
    try {
      if (editing) {
        await api.structure.updateSection(editing.id, payload);
        toast("Section updated successfully", { type: "success" });
      } else {
        await api.coordinator.createSection(offId, payload);
        toast("Section created successfully", { type: "success" });
      }
      await loadSections(offId);
      reload();
      setModalOpen(false);
      setEditing(null);
      setTargetOffering(null);
      setForm(emptyForm);
    } catch (err) {
      toast(err.message || "Save failed", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (offering, section) => {
    if (!window.confirm(`Delete section "${section.name}" from ${offering.course?.code}?`)) return;
    try {
      await api.structure.deleteSection(section.id);
      toast("Section deleted", { type: "success" });
      await loadSections(offering.id);
      reload();
    } catch (err) {
      toast(err.message || "Delete failed", { type: "error" });
    }
  };

  const handleAutoCreate = async (offering) => {
    const enrolled = offering._count?.registrations || 0;
    if (!window.confirm(
      `Auto-create sections for ${offering.course?.code}?\n\n` +
      `This creates sections of ${DEFAULT_CAPACITY} students each to seat all ${enrolled} enrolled student(s), ` +
      `then distributes any unassigned students evenly.`
    )) return;
    setAutoBusy(offering.id);
    try {
      const res = await api.coordinator.autoCreateSections(offering.id, DEFAULT_CAPACITY);
      toast(`${res.message}${res.distributed ? ` · ${res.distributed} students allocated` : ""}`, { type: "success" });
      setExpanded((m) => ({ ...m, [offering.id]: true }));
      await loadSections(offering.id);
      reload();
    } catch (err) {
      toast(err.message || "Auto-create failed", { type: "error" });
    } finally {
      setAutoBusy(null);
    }
  };

  const totalSections = useMemo(
    () => offerings.reduce((sum, o) => sum + (o._count?.sections || 0), 0),
    [offerings]
  );
  const totalStudents = useMemo(
    () => offerings.reduce((sum, o) => sum + (o._count?.registrations || 0), 0),
    [offerings]
  );

  return (
    <div>
      <PageHeader
        title="Section Management"
        subtitle="Semester-wise sections per course offering — capacity, rooms, auto-allocation & drag-and-drop student transfer."
        icon="Layers"
        breadcrumb={["Coordinator", "Sections"]}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Course Offerings", value: offerings.length, icon: BookOpen, color: "from-blue-500 to-cyan-500" },
          { label: "Total Sections", value: totalSections, icon: Layers, color: "from-purple-500 to-pink-600" },
          { label: "Semesters", value: semesters.length, icon: GraduationCap, color: "from-emerald-500 to-teal-600" },
          { label: "Enrolled", value: totalStudents, icon: Users, color: "from-amber-500 to-orange-600" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card-base p-4 flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.color} text-white flex items-center justify-center shadow`}>
              <s.icon size={20} />
            </div>
            <div>
              <p className="text-xs text-muted-app">{s.label}</p>
              <p className="text-lg font-bold text-app">{s.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Default-capacity hint */}
      <div className="card-base p-3 mb-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center flex-shrink-0">
          <Users size={15} />
        </div>
        <p className="text-sm text-muted-app">
          New sections default to a capacity of <span className="font-bold text-app">{DEFAULT_CAPACITY} students</span>.
          Use <span className="font-semibold text-app">Auto-Create</span> to generate &amp; fill sections automatically,
          or <span className="font-semibold text-app">Manage Students</span> to drag students between sections.
        </p>
      </div>

      {/* Filters */}
      <div className="card-base p-3 mb-5 flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by course code or title..." className="input-base w-full pl-10 text-sm" />
        </div>
        <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} className="input-base text-sm md:w-44">
          <option value="all">All Semesters</option>
          {semesters.map((s) => <option key={s} value={s}>Semester {s}</option>)}
        </select>
      </div>

      {error ? (
        <ErrorState title="Couldn't load offerings" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="card-base p-5 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="Layers" title="No offerings found" description="Try a different filter combination." />
      ) : (
        <div className="space-y-8">
          {bySemester.map(([sem, semOfferings]) => (
            <section key={sem} id={`semester-${sem}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-blue-500 text-white flex items-center justify-center">
                  <GraduationCap size={16} />
                </div>
                <h3 className="font-display font-bold text-lg text-app">{sem ? `Semester ${sem}` : "Unscheduled"}</h3>
                <span className="text-xs text-muted-app font-semibold">{semOfferings.length} offering(s)</span>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                {semOfferings.map((o) => {
                  const isOpen = expanded[o.id];
                  const secs = sectionsByOffering[o.id];
                  const sectionCount = o._count?.sections || 0;
                  const enrolled = o._count?.registrations || 0;
                  return (
                    <div key={o.id} className="card-base overflow-hidden">
                      <div className="p-4 border-b border-app">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-md flex-shrink-0">
                              <Layers size={18} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-app truncate">{o.course?.code} — {o.course?.title}</p>
                              <p className="text-xs text-muted-app">{sectionCount} section(s) · {enrolled} enrolled · {o.teacher?.username || "No teacher"}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => toggleExpand(o.id)} className="btn-secondary text-xs py-1.5 px-3">
                            <Layers size={12} className="inline mr-1" /> {isOpen ? "Hide" : "View"} Sections
                          </button>
                          <button onClick={() => openAdd(o)} className="btn-primary text-xs py-1.5 px-3">
                            <Plus size={12} className="inline mr-1" /> Add Section
                          </button>
                          <button onClick={() => handleAutoCreate(o)} disabled={autoBusy === o.id} className="text-xs py-1.5 px-3 rounded-lg font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-60 inline-flex items-center gap-1">
                            {autoBusy === o.id ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} Auto-Create
                          </button>
                          <button onClick={() => setManageOffering(o)} className="text-xs py-1.5 px-3 rounded-lg font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-500/20 inline-flex items-center gap-1">
                            <ArrowLeftRight size={12} /> Manage Students
                          </button>
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="p-4">
                              {loadingSections[o.id] ? (
                                <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                              ) : !secs || secs.length === 0 ? (
                                <p className="text-sm text-muted-app italic py-2">No sections yet. Use “Add Section” or “Auto-Create”.</p>
                              ) : (
                                <div className="grid sm:grid-cols-2 gap-3">
                                  {secs.map((sec) => {
                                    const used = sec._count?.registrations ?? 0;
                                    const pct = sec.capacity ? Math.round((used / sec.capacity) * 100) : 0;
                                    return (
                                      <div key={sec.id} className="surface border border-app rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-2">
                                          <p className="font-bold text-app">Section {sec.name}</p>
                                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-bold rounded">
                                            {used}/{sec.capacity}
                                          </span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-2">
                                          <div className={`h-full bg-gradient-to-r ${fillColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                        </div>
                                        {sec.room && <p className="text-xs text-muted-app mb-2 inline-flex items-center gap-1"><DoorOpen size={11} /> {sec.room}</p>}
                                        <div className="flex gap-2 mt-2">
                                          <button onClick={() => openEdit(o, sec)} className="flex-1 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20">
                                            <Edit3 size={11} className="inline mr-1" /> Edit
                                          </button>
                                          <button onClick={() => handleDelete(o, sec)} className="px-3 py-1.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20" title="Delete">
                                            <Trash2 size={11} />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Create / Edit Section Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Section" : "Create New Section"}
        subtitle={targetOffering ? `${targetOffering.course?.code} — ${targetOffering.course?.title}` : ""}
        icon={Layers}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Section Name *</label>
            <input value={form.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="e.g. A, B" className="input-base mt-1 w-full" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Capacity</label>
              <input type="number" min="1" value={form.capacity} onChange={(e) => handleChange("capacity", e.target.value)} placeholder={String(DEFAULT_CAPACITY)} className="input-base mt-1 w-full" />
              <p className="text-[11px] text-muted-app mt-1">Default {DEFAULT_CAPACITY} students per section.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-app uppercase tracking-wide">Room</label>
              <input value={form.room} onChange={(e) => handleChange("room", e.target.value)} placeholder="e.g. Lab-1" className="input-base mt-1 w-full" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-app">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary text-sm py-2 px-4">
              <X size={14} className="inline mr-1" /> Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 disabled:opacity-60">
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Section"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Drag & drop student transfer board */}
      <ManageStudentsModal
        offering={manageOffering}
        onClose={() => setManageOffering(null)}
        onChanged={() => { if (manageOffering) loadSections(manageOffering.id); reload(); }}
        toast={toast}
      />
    </div>
  );
};

/* =============================================================
   MANAGE STUDENTS — drag & drop transfer between sections
   ============================================================= */
const avatarFor = (name) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "Student")}&background=7c3aed&color=fff&bold=true&size=64`;

const ManageStudentsModal = ({ offering, onClose, onChanged, toast }) => {
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [draggingReg, setDraggingReg] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [savingReg, setSavingReg] = useState(null);
  const [q, setQ] = useState("");

  const load = async (offeringId) => {
    setLoading(true); setErr(null);
    try {
      const res = await api.coordinator.offeringRoster(offeringId);
      setRoster(res);
    } catch (e) {
      setErr(e.message || "Failed to load roster");
    } finally {
      setLoading(false);
    }
  };

  // Load when the modal opens for a new offering
  const openedId = offering?.id;
  useMemoOpen(openedId, () => { if (openedId) { setRoster(null); setQ(""); load(openedId); } });

  const studentsBySection = useMemo(() => {
    const map = { unassigned: [] };
    (roster?.sections || []).forEach((s) => { map[s.id] = []; });
    const ql = q.trim().toLowerCase();
    (roster?.students || []).forEach((st) => {
      if (ql && !st.name?.toLowerCase().includes(ql) && !st.roll?.toLowerCase().includes(ql)) return;
      if (st.sectionId && map[st.sectionId]) map[st.sectionId].push(st);
      else map.unassigned.push(st);
    });
    return map;
  }, [roster, q]);

  const sectionLiveCount = (sectionId) => (roster?.students || []).filter((s) => s.sectionId === sectionId).length;

  const move = async (student, targetSectionId) => {
    const current = student.sectionId || null;
    const target = targetSectionId || null;
    if (current === target) return;
    setSavingReg(student.registrationId);
    // optimistic
    setRoster((r) => ({ ...r, students: r.students.map((s) => s.registrationId === student.registrationId ? { ...s, sectionId: target } : s) }));
    try {
      await api.coordinator.transferStudentSection(student.registrationId, target);
      const label = target == null ? "Unassigned" : `Section ${(roster.sections.find((s) => s.id === target) || {}).name}`;
      toast(`${student.roll} moved to ${label}`, { type: "success" });
      onChanged?.();
    } catch (e) {
      // rollback
      setRoster((r) => ({ ...r, students: r.students.map((s) => s.registrationId === student.registrationId ? { ...s, sectionId: current } : s) }));
      toast(e.message || "Transfer failed", { type: "error" });
    } finally {
      setSavingReg(null);
    }
  };

  const onDrop = (e, targetSectionId) => {
    e.preventDefault();
    const regId = Number(e.dataTransfer.getData("text/plain")) || draggingReg;
    const student = (roster?.students || []).find((s) => s.registrationId === regId);
    setDropTarget(null); setDraggingReg(null);
    if (student) move(student, targetSectionId);
  };
  const allowDrop = (e, target) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dropTarget !== target) setDropTarget(target); };

  return (
    <Modal open={!!offering} onClose={onClose}
      title="Manage Students"
      subtitle={offering ? `${offering.course?.code} — drag students between sections` : ""}
      icon={ArrowLeftRight} maxWidth="max-w-5xl">
      {err ? (
        <ErrorState title="Couldn't load roster" description={err} onRetry={() => load(offering.id)} />
      ) : loading || !roster ? (
        <div className="grid sm:grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>
      ) : (
        <div>
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students by name or roll…" className="input-base w-full pl-9 text-sm" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {/* Unassigned column */}
            <TransferColumn
              title="Unassigned"
              meta={`${(studentsBySection.unassigned || []).length} student(s)`}
              accent="amber"
              isDropTarget={dropTarget === "unassigned"}
              onDragOver={(e) => allowDrop(e, "unassigned")}
              onDragLeave={() => setDropTarget((t) => (t === "unassigned" ? null : t))}
              onDrop={(e) => onDrop(e, null)}
              students={studentsBySection.unassigned || []}
              draggingReg={draggingReg} savingReg={savingReg}
              setDraggingReg={setDraggingReg}
            />
            {/* Section columns */}
            {(roster.sections || []).map((sec) => {
              const live = sectionLiveCount(sec.id);
              const full = live >= sec.capacity;
              return (
                <TransferColumn
                  key={sec.id}
                  title={`Section ${sec.name}`}
                  meta={`${live}/${sec.capacity}${full ? " · FULL" : ""}`}
                  accent={full ? "rose" : "blue"}
                  isDropTarget={dropTarget === sec.id}
                  onDragOver={(e) => allowDrop(e, sec.id)}
                  onDragLeave={() => setDropTarget((t) => (t === sec.id ? null : t))}
                  onDrop={(e) => onDrop(e, sec.id)}
                  students={studentsBySection[sec.id] || []}
                  draggingReg={draggingReg} savingReg={savingReg}
                  setDraggingReg={setDraggingReg}
                />
              );
            })}
          </div>
          {(roster.sections || []).length === 0 && (
            <p className="text-sm text-muted-app italic mt-3 text-center">No sections yet — create or auto-create sections first, then drag students in.</p>
          )}
        </div>
      )}
    </Modal>
  );
};

const TransferColumn = ({ title, meta, accent, isDropTarget, onDragOver, onDragLeave, onDrop, students, draggingReg, savingReg, setDraggingReg }) => {
  const ringClass = isDropTarget
    ? accent === "amber" ? "ring-2 ring-amber-400 bg-amber-50/60 dark:bg-amber-500/5"
      : accent === "rose" ? "ring-2 ring-rose-400 bg-rose-50/60 dark:bg-rose-500/5"
      : "ring-2 ring-primary-400 bg-primary-50/60 dark:bg-primary-500/5"
    : "";
  const badge = accent === "amber" ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300"
    : accent === "rose" ? "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300"
    : "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300";
  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      className={`surface border border-app rounded-xl p-3 transition-all ${ringClass}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="font-bold text-app text-sm">{title}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge}`}>{meta}</span>
      </div>
      <div className="space-y-1.5 min-h-[3rem]">
        {students.map((st) => (
          <div key={st.registrationId} draggable
            onDragStart={(e) => { setDraggingReg(st.registrationId); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(st.registrationId)); }}
            onDragEnd={() => setDraggingReg(null)}
            className={`cursor-grab active:cursor-grabbing select-none rounded-lg border border-app bg-white dark:bg-slate-800/60 px-2 py-1.5 flex items-center gap-2 text-xs transition-all
              ${draggingReg === st.registrationId ? "opacity-40 scale-95" : "hover:shadow-md hover:border-primary-300"}`}>
            <GripVertical size={12} className="text-muted-app flex-shrink-0" />
            <img src={avatarFor(st.name)} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-app truncate">{st.name}</p>
              <p className="text-[10px] text-muted-app font-mono">{st.roll}</p>
            </div>
            {savingReg === st.registrationId && <Loader2 size={12} className="animate-spin text-primary-500 flex-shrink-0" />}
          </div>
        ))}
        {students.length === 0 && (
          <div className="text-[11px] text-muted-app italic py-3 text-center border border-dashed border-app rounded-lg">Drop here</div>
        )}
      </div>
    </div>
  );
};

/* Tiny helper: run an effect whenever `key` changes (like useEffect on [key]). */
function useMemoOpen(key, fn) {
  useEffect(() => { fn(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
}

export default Sections;

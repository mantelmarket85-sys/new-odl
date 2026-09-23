import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Replace, ArrowRight, UserPlus2, Database, CheckCircle2, XCircle,
  Clock, Search, Filter, Trash2, Pencil, History, AlertTriangle,
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
import EmptyState from "../../components/common/EmptyState";
import SearchableSelect from "../../components/common/SearchableSelect";

/* =========================================================================
 * Course Coordinator → Teacher Replacement (LIVE, real DB)
 *
 * Full module: CRUD + decision workflow (approve/reject) + chronological
 * history timeline + timetable conflict validation + duplicate guard +
 * search / status filters / pagination / sorting.
 * Backed by /coordinator/replacements*. No mock data.
 * ======================================================================= */

const STATUS_TABS = [
  { key: "ALL", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
];

const statusColor = (s) =>
  s === "APPROVED" ? "emerald" : s === "REJECTED" ? "rose" : "amber";

const TIME_SLOTS = [
  "08:00 - 09:30", "09:30 - 11:00", "11:00 - 12:30",
  "12:30 - 14:00", "14:00 - 15:30", "15:30 - 17:00",
];

const emptyForm = {
  originalTeacherId: "", replacementTeacherId: "", offeringId: "",
  sectionId: "", date: "", timeSlot: "", reason: "",
};

const TeacherReplacement = () => {
  const { toast } = useToast();
  const allocApi = useApi(() => api.coordinator.allocation(), []);
  const teachersApi = useApi(() => api.coordinator.teachers(), []);

  const offerings = useMemo(() => allocApi.data?.offerings || [], [allocApi.data]);
  const teachers = useMemo(() => teachersApi.data?.teachers || [], [teachersApi.data]);

  // ---- List state (server-driven) ----
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState("desc");
  const [list, setList] = useState({ items: [], pagination: { total: 0, totalPages: 1, page: 1 } });
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  // Debounce search input.
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const qs = new URLSearchParams({
        page: String(page), pageSize: "10",
        sortBy: "createdAt", sortDir,
      });
      if (status !== "ALL") qs.set("status", status);
      if (debounced) qs.set("search", debounced);
      const res = await api.coordinator.replacements(`?${qs.toString()}`);
      setList(res);
    } catch (err) {
      setListError(err.message || "Failed to load replacements");
    } finally {
      setListLoading(false);
    }
  }, [page, status, debounced, sortDir]);

  useEffect(() => { loadList(); }, [loadList]);

  // ---- Real-time refresh on replacement events ----
  useEffect(() => {
    let es;
    try {
      es = new EventSource(api.coordinator.eventsUrl());
      es.addEventListener("replacement", () => loadList());
    } catch (_) { /* SSE optional */ }
    return () => { if (es) es.close(); };
  }, [loadList]);

  // ---- Create / edit modal ----
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);

  // Courses assigned to the selected ORIGINAL teacher (dynamic dropdown).
  const [teacherOfferings, setTeacherOfferings] = useState([]);
  const [loadingTeacherOfferings, setLoadingTeacherOfferings] = useState(false);

  // Whenever the original teacher changes, load ONLY the courses currently
  // assigned to that teacher. Clears any previously selected course.
  useEffect(() => {
    if (!form.originalTeacherId) {
      setTeacherOfferings([]);
      return;
    }
    let active = true;
    setLoadingTeacherOfferings(true);
    api.coordinator.teacherOfferings(form.originalTeacherId)
      .then((res) => { if (active) setTeacherOfferings(res.offerings || []); })
      .catch(() => { if (active) setTeacherOfferings([]); })
      .finally(() => { if (active) setLoadingTeacherOfferings(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.originalTeacherId]);

  const selectedOffering = useMemo(
    () => teacherOfferings.find((o) => String(o.id) === String(form.offeringId)),
    [teacherOfferings, form.offeringId]
  );

  // Live conflict pre-check whenever teacher/date/slot changes.
  useEffect(() => {
    if (!form.replacementTeacherId) { setConflict(null); return; }
    let active = true;
    const t = setTimeout(async () => {
      try {
        const res = await api.coordinator.checkReplacementConflict({
          replacementTeacherId: form.replacementTeacherId,
          date: form.date || null,
          timeSlot: form.timeSlot || null,
        });
        if (active) setConflict(res.conflict || null);
      } catch (_) { if (active) setConflict(null); }
    }, 400);
    return () => { active = false; clearTimeout(t); };
  }, [form.replacementTeacherId, form.date, form.timeSlot]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setConflict(null);
    setOpen(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setForm({
      originalTeacherId: r.originalTeacherId,
      replacementTeacherId: r.replacementTeacherId,
      offeringId: r.offeringId ? String(r.offeringId) : "",
      sectionId: r.sectionId ? String(r.sectionId) : "",
      date: r.date || "",
      timeSlot: r.timeSlot || "",
      reason: r.reason || "",
    });
    setConflict(null);
    setOpen(true);
  };

  const submit = async () => {
    if (!form.originalTeacherId || !form.replacementTeacherId) {
      toast("Select both the original and replacement teacher", { type: "error", title: "Validation" });
      return;
    }
    if (form.originalTeacherId === form.replacementTeacherId) {
      toast("Replacement teacher must differ from the original", { type: "error" });
      return;
    }
    if (!form.reason.trim()) {
      toast("A reason is required", { type: "error", title: "Validation" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.coordinator.updateReplacement(editing.id, {
          replacementTeacherId: form.replacementTeacherId,
          date: form.date || null,
          timeSlot: form.timeSlot || null,
          reason: form.reason,
        });
        toast("Replacement updated", { type: "success" });
      } else {
        const res = await api.coordinator.createReplacement({
          originalTeacherId: form.originalTeacherId,
          replacementTeacherId: form.replacementTeacherId,
          offeringId: form.offeringId ? Number(form.offeringId) : null,
          sectionId: form.sectionId ? Number(form.sectionId) : null,
          date: form.date || null,
          timeSlot: form.timeSlot || null,
          reason: form.reason,
        });
        if (res.conflict) {
          toast("Created — but a timetable conflict was detected for the replacement teacher.", { type: "warning", title: "Conflict noted" });
        } else {
          toast("Replacement request created", { type: "success" });
        }
      }
      setOpen(false);
      setForm(emptyForm);
      setEditing(null);
      loadList();
    } catch (err) {
      toast(err.message || "Operation failed", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const decide = async (r, action) => {
    try {
      await api.coordinator.decideReplacement(r.id, { action });
      toast(`Replacement ${action === "approve" ? "approved" : "rejected"}`, { type: "success" });
      loadList();
    } catch (err) {
      toast(err.message || "Decision failed", { type: "error" });
    }
  };

  const remove = async (r) => {
    if (!window.confirm("Delete this replacement record? (history is retained in audit log)")) return;
    try {
      await api.coordinator.deleteReplacement(r.id);
      toast("Replacement deleted", { type: "success" });
      loadList();
    } catch (err) {
      toast(err.message || "Delete failed", { type: "error" });
    }
  };

  // ---- History timeline modal ----
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await api.coordinator.replacements("?page=1&pageSize=100&sortBy=createdAt&sortDir=desc");
      setHistoryRows(res.items || []);
    } catch (_) {
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const items = list.items || [];
  const pag = list.pagination || { total: 0, totalPages: 1, page: 1 };

  const pendingCount = useMemo(() => items.filter((r) => r.status === "PENDING").length, [items]);

  return (
    <div>
      <PageHeader
        title="Teacher Replacement"
        subtitle="Request, review, approve or reject substitute-teacher assignments. Timetable conflicts are validated and a permanent history is kept."
        icon="Replace"
        breadcrumb={["Course Coordinator", "Teacher Replacement"]}
        actions={
          <div className="flex gap-2">
            <button onClick={openHistory} className="px-3 py-2 rounded-xl border border-app text-sm font-bold text-app inline-flex items-center gap-1.5">
              <History size={14} /> History
            </button>
            <button onClick={openCreate} className="btn-primary text-sm inline-flex items-center gap-1.5">
              <UserPlus2 size={14} /> New Replacement
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard title="On This Page" value={items.length} icon="Replace" color="blue" />
        <StatCard title="Pending (page)" value={pendingCount} icon="Clock" color="amber" delay={0.05} />
        <StatCard title="Faculty" value={teachers.length} icon="Users" color="indigo" delay={0.1} />
        <StatCard title="Total Records" value={pag.total} icon="Database" color="emerald" delay={0.15} />
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
              status === t.key
                ? "bg-primary-600 text-white border-primary-600"
                : "border-app text-muted-app hover:bg-slate-50 dark:hover:bg-slate-800/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by teacher, course, section or reason…"
            className="input-base pl-9 py-2 text-sm w-full"
          />
        </div>
        <select value={sortDir} onChange={(e) => { setSortDir(e.target.value); setPage(1); }} className="input-base py-2 text-sm">
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </div>

      {listError ? (
        <ErrorState title="Couldn't load replacements" description={listError} onRetry={loadList} />
      ) : listLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon="Replace" title="No replacements found" description="Create a new replacement request to get started." />
      ) : (
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-app">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-app">Replacement</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-app">Course / Section</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-muted-app">Date / Slot</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-muted-app">Reason</th>
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase text-muted-app">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase text-muted-app">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-app">
                        <span className="font-semibold">{r.originalTeacherName}</span>
                        <ArrowRight size={13} className="text-primary-600" />
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">{r.replacementTeacherName}</span>
                      </div>
                      <p className="text-[11px] text-muted-app mt-0.5">{r.termLabel || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-app">
                      {r.courseLabel || <span className="text-muted-app italic">—</span>}
                      {r.sectionLabel && <p className="text-xs text-muted-app">Section {r.sectionLabel}</p>}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-app">
                      {r.date || "—"}<br />
                      <span className="text-[11px]">{r.timeSlot || ""}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-app max-w-[220px]">{r.reason}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge color={statusColor(r.status)}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.status === "PENDING" ? (
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => decide(r, "approve")} title="Approve" className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border border-emerald-200 dark:border-emerald-500/30"><CheckCircle2 size={14} /></button>
                          <button onClick={() => decide(r, "reject")} title="Reject" className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 border border-rose-200 dark:border-rose-500/30"><XCircle size={14} /></button>
                          <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 border border-blue-200 dark:border-blue-500/30"><Pencil size={14} /></button>
                          <button onClick={() => remove(r)} title="Delete" className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 border border-app"><Trash2 size={14} /></button>
                        </div>
                      ) : (
                        <button onClick={() => remove(r)} title="Delete" className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 border border-app inline-flex"><Trash2 size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-app text-xs text-muted-app">
            <span>Page {pag.page} of {pag.totalPages} · {pag.total} record(s)</span>
            <div className="flex gap-2">
              <button disabled={pag.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 rounded-lg border border-app font-bold disabled:opacity-40">Prev</button>
              <button disabled={pag.page >= pag.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-app font-bold disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Replacement" : "New Teacher Replacement"} subtitle="Validate availability before approving the substitution." icon={Replace} maxWidth="max-w-lg">
        <div className="space-y-3">
          {!editing && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Original Teacher *</label>
              <SearchableSelect
                value={form.originalTeacherId}
                onChange={(v) => setForm({ ...form, originalTeacherId: v, offeringId: "", replacementTeacherId: form.replacementTeacherId === v ? "" : form.replacementTeacherId })}
                loading={teachersApi.loading}
                placeholder="— Select teacher —"
                searchPlaceholder="Search teacher by name…"
                emptyText={teachers.length === 0 ? "No teachers found" : "No matching teacher"}
                options={teachers.map((t) => ({ value: t.id, label: t.name, hint: `@${t.username}` }))}
              />
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Replacement Teacher *</label>
            <SearchableSelect
              value={form.replacementTeacherId}
              onChange={(v) => setForm({ ...form, replacementTeacherId: v })}
              loading={teachersApi.loading}
              placeholder="— Select teacher —"
              searchPlaceholder="Search teacher by name…"
              emptyText={teachers.length === 0 ? "No teachers found" : "No matching teacher"}
              options={teachers
                .filter((t) => t.id !== form.originalTeacherId)
                .map((t) => ({ value: t.id, label: t.name, hint: `@${t.username}` }))}
            />
          </div>

          {!editing && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Course (assigned to original teacher)</label>
              <select
                value={form.offeringId}
                onChange={(e) => setForm({ ...form, offeringId: e.target.value })}
                disabled={!form.originalTeacherId || loadingTeacherOfferings}
                className="input-base py-2 text-sm w-full disabled:opacity-60"
              >
                <option value="">
                  {!form.originalTeacherId
                    ? "Select the original teacher first"
                    : loadingTeacherOfferings
                      ? "Loading courses…"
                      : teacherOfferings.length === 0
                        ? "No courses assigned to this teacher"
                        : "— Select course —"}
                </option>
                {teacherOfferings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.courseCode} — {o.courseTitle}{o.session ? ` · ${o.session}` : ""} ({o.students} student{o.students !== 1 ? "s" : ""})
                  </option>
                ))}
              </select>
              {form.originalTeacherId && !loadingTeacherOfferings && teacherOfferings.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">This teacher has no courses assigned in the current session.</p>
              )}
              {selectedOffering && <p className="text-[11px] text-muted-app mt-1">{selectedOffering.creditHours != null ? `${selectedOffering.creditHours} credit hours` : ""}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-base py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Time Slot</label>
              <select value={form.timeSlot} onChange={(e) => setForm({ ...form, timeSlot: e.target.value })} className="input-base py-2 text-sm w-full">
                <option value="">— Select —</option>
                {TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Reason *</label>
            <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} placeholder="e.g. Medical leave, official duty…" className="input-base py-2 text-sm w-full" />
          </div>

          {conflict && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span><b>Timetable conflict:</b> {conflict.message || "The replacement teacher already has a class in this slot."}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl border border-app text-sm font-bold text-app">Cancel</button>
            <button onClick={submit} disabled={saving} className="btn-primary text-sm disabled:opacity-60">{saving ? "Saving…" : editing ? "Save Changes" : "Create Request"}</button>
          </div>
        </div>
      </Modal>

      {/* History timeline modal */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Replacement History" subtitle="Chronological timeline of all replacement requests." icon={History} maxWidth="max-w-2xl">
        {historyLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : historyRows.length === 0 ? (
          <EmptyState icon="History" title="No history yet" description="Replacement requests will appear here over time." />
        ) : (
          <ol className="relative border-l border-app ml-2 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {historyRows.map((r) => (
              <li key={r.id} className="ml-4">
                <span className={`absolute -left-1.5 w-3 h-3 rounded-full ${r.status === "APPROVED" ? "bg-emerald-500" : r.status === "REJECTED" ? "bg-rose-500" : "bg-amber-500"}`} />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-app">{new Date(r.createdAt).toLocaleString()}</span>
                  <Badge color={statusColor(r.status)}>{r.status}</Badge>
                </div>
                <p className="text-sm text-app mt-0.5">
                  <b>{r.originalTeacherName}</b> → <b className="text-emerald-700 dark:text-emerald-300">{r.replacementTeacherName}</b>
                  {r.courseLabel ? <> · {r.courseLabel}</> : null}
                </p>
                <p className="text-xs text-muted-app">{r.reason}{r.date ? ` · ${r.date}` : ""}{r.timeSlot ? ` · ${r.timeSlot}` : ""}</p>
                {r.decisionNote && <p className="text-[11px] text-muted-app italic mt-0.5">Note: {r.decisionNote}</p>}
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </div>
  );
};

export default TeacherReplacement;

// ============================================================
//  PROVOST — Student Fee Records & Management
//  Requirements 5,6,7,8,9,13,14,15:
//   - Complete fee records (dept/program/semester/section)
//   - Advanced student search
//   - Complete student profile (info + fee history + txns + block history)
//   - Pending fees / Submitted fees modules
//   - Block / Unblock students (with reason/date/history)
//   - Continuation after unblock (position preserved)
//  100% real DB data via api.provost.feeMgmt.*
// ============================================================
import { useState, useMemo, useCallback, useEffect } from "react";
import { Search, Eye, UserMinus, UserCheck, Filter, CheckSquare, Square } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import Modal from "../../components/common/Modal";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

const fmtMoney = (n) => `Rs. ${Number(n || 0).toLocaleString("en-PK")}`;
const fmtDate = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return String(d); }
};
const fmtDateTime = (d) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return String(d); }
};

const statusChip = (s) => {
  const v = (s || "").toLowerCase();
  if (v === "paid") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (v === "overdue") return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
  if (v === "waived") return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
};

const TABS = [
  { key: "students", label: "Students" },
  { key: "records", label: "All Records" },
  { key: "pendingStudents", label: "Pending" },
  { key: "pending", label: "Pending Fees" },
  { key: "submitted", label: "Submitted Fees" },
  { key: "blocked", label: "Blocked" },
];

const buildQuery = (f) => {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.department) p.set("department", f.department);
  if (f.program) p.set("program", f.program);
  if (f.semester) p.set("semester", f.semester);
  if (f.section) p.set("section", f.section);
  const s = p.toString();
  return s ? `?${s}` : "";
};

const FeeRecords = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState("students");
  const [filters, setFilters] = useState({ q: "", department: "", program: "", semester: "", section: "" });
  const qs = useMemo(() => buildQuery(filters), [filters]);

  const { data: opts } = useApi(() => api.provost.feeMgmt.filterOptions(), []);

  const fetcher = useCallback(() => {
    if (tab === "students") return api.provost.feeMgmt.students(qs);
    if (tab === "pendingStudents") return api.provost.feeMgmt.students(qs);
    if (tab === "records") return api.provost.feeMgmt.records(qs);
    if (tab === "pending") return api.provost.feeMgmt.pending(qs);
    if (tab === "submitted") return api.provost.feeMgmt.submitted(qs);
    if (tab === "blocked") return api.provost.feeMgmt.blocked();
    return Promise.resolve({ items: [] });
  }, [tab, qs]);

  const { data, loading, error, reload } = useApi(fetcher, [tab, qs]);
  const rawItems = data?.items || [];
  // The "Pending" tab shows only students that currently have pending fees.
  const items = tab === "pendingStudents"
    ? rawItems.filter((r) => Number(r.pending || 0) > 0)
    : rawItems;

  // Shared busy flag for all block/unblock (single + bulk) actions.
  const [busy, setBusy] = useState(false);

  // ---- Bulk selection (Pending students tab) ----
  const [selected, setSelected] = useState(() => new Set());
  // Clear selection whenever the tab or filters change.
  useEffect(() => { setSelected(new Set()); }, [tab, qs]);

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allVisibleIds = useMemo(() => items.map((r) => r.studentId), [items]);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(allVisibleIds)));

  const selectedBlockable = useMemo(
    () => items.filter((r) => selected.has(r.studentId) && !r.blocked).map((r) => r.studentId),
    [items, selected]
  );
  const selectedRestorable = useMemo(
    () => items.filter((r) => selected.has(r.studentId) && r.blocked).map((r) => r.studentId),
    [items, selected]
  );

  // ---- Bulk block / restore modals ----
  const [bulkBlockOpen, setBulkBlockOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkRestoreOpen, setBulkRestoreOpen] = useState(false);
  const [bulkNote, setBulkNote] = useState("");

  const doBulkBlock = async () => {
    if (!bulkReason || bulkReason.trim().length < 3) { toast("Enter a block reason", { type: "error" }); return; }
    if (selectedBlockable.length === 0) { toast("No unblocked students selected", { type: "error" }); return; }
    setBusy(true);
    try {
      const res = await api.provost.feeMgmt.bulkBlock({ studentIds: selectedBlockable, reason: bulkReason.trim() });
      toast(`${res.blockedCount} student(s) blocked${res.skippedCount ? `, ${res.skippedCount} skipped` : ""}`, { type: "success" });
      setBulkBlockOpen(false); setBulkReason(""); setSelected(new Set());
      reload();
    } catch (e) { toast(e.message || "Bulk block failed", { type: "error" }); }
    finally { setBusy(false); }
  };

  const doBulkRestore = async () => {
    if (selectedRestorable.length === 0) { toast("No blocked students selected", { type: "error" }); return; }
    setBusy(true);
    try {
      const res = await api.provost.feeMgmt.bulkUnblock({ studentIds: selectedRestorable, note: bulkNote.trim() || undefined });
      toast(`${res.restoredCount} student(s) restored${res.skippedCount ? `, ${res.skippedCount} skipped` : ""}`, { type: "success" });
      setBulkRestoreOpen(false); setBulkNote(""); setSelected(new Set());
      reload();
    } catch (e) { toast(e.message || "Bulk restore failed", { type: "error" }); }
    finally { setBusy(false); }
  };

  // ---- Student profile modal ----
  const [profileId, setProfileId] = useState(null);
  const { data: profile, loading: profLoading } = useApi(
    () => (profileId ? api.provost.feeMgmt.studentProfile(profileId) : Promise.resolve(null)),
    [profileId]
  );

  // ---- Block / Unblock ----
  const [blockTarget, setBlockTarget] = useState(null);
  const [blockReason, setBlockReason] = useState("");
  const [unblockTarget, setUnblockTarget] = useState(null);
  const [unblockNote, setUnblockNote] = useState("");

  const doBlock = async () => {
    if (!blockReason || blockReason.trim().length < 3) { toast("Enter a block reason", { type: "error" }); return; }
    setBusy(true);
    try {
      await api.provost.feeMgmt.block(blockTarget.studentId, { reason: blockReason.trim() });
      toast(`${blockTarget.name} has been blocked`, { type: "success" });
      setBlockTarget(null); setBlockReason("");
      reload();
    } catch (e) { toast(e.message || "Failed to block", { type: "error" }); }
    finally { setBusy(false); }
  };

  const doUnblock = async () => {
    setBusy(true);
    try {
      const res = await api.provost.feeMgmt.unblock(unblockTarget.studentId, { note: unblockNote.trim() || undefined });
      const cont = res?.continuation;
      toast(
        cont ? `${unblockTarget.name} unblocked — resumes Semester ${cont.semester}, Section ${cont.section}` : `${unblockTarget.name} unblocked`,
        { type: "success" }
      );
      setUnblockTarget(null); setUnblockNote("");
      reload();
    } catch (e) { toast(e.message || "Failed to unblock", { type: "error" }); }
    finally { setBusy(false); }
  };

  const setField = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters({ q: "", department: "", program: "", semester: "", section: "" });

  return (
    <div>
      <PageHeader
        title="Student Fee Records"
        subtitle="Complete fee records, advanced search, profiles, and student blocking"
        icon="Users"
        breadcrumb={["Provost", "Fee Records"]}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t.key ? "bg-primary-600 text-white shadow-md" : "bg-app-subtle text-muted-app hover:text-app"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "blocked" && (
        <div className="card-base p-3 mb-5 flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
            <input value={filters.q} onChange={(e) => setField("q", e.target.value)} placeholder="Search name / roll / CNIC…" className="input-base w-full pl-10 text-sm" />
          </div>
          <select value={filters.department} onChange={(e) => setField("department", e.target.value)} className="input-base text-sm lg:w-48">
            <option value="">All Departments</option>
            {(opts?.departments || []).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filters.program} onChange={(e) => setField("program", e.target.value)} className="input-base text-sm lg:w-36">
            <option value="">All Programs</option>
            {(opts?.programs || []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filters.semester} onChange={(e) => setField("semester", e.target.value)} className="input-base text-sm lg:w-32">
            <option value="">All Semesters</option>
            {(opts?.semesters || []).map((s) => <option key={s} value={s}>Sem {s}</option>)}
          </select>
          <select value={filters.section} onChange={(e) => setField("section", e.target.value)} className="input-base text-sm lg:w-28">
            <option value="">All Sections</option>
            {(opts?.sections || []).map((s) => <option key={s} value={s}>Sec {s}</option>)}
          </select>
          <button onClick={clearFilters} className="btn-secondary text-sm px-3 flex items-center gap-1"><Filter size={14} /> Clear</button>
        </div>
      )}

      {/* Bulk action bar — only on the Pending students tab when rows are selected */}
      {tab === "pendingStudents" && selected.size > 0 && (
        <div className="card-base p-3 mb-4 flex flex-wrap items-center gap-3 border border-primary-300 dark:border-primary-800">
          <span className="text-sm font-semibold text-app">{selected.size} selected</span>
          <div className="flex-1" />
          <button
            onClick={() => setBulkBlockOpen(true)}
            disabled={selectedBlockable.length === 0}
            className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 flex items-center gap-1.5"
          >
            <UserMinus size={15} /> Block Selected ({selectedBlockable.length})
          </button>
          <button
            onClick={() => setBulkRestoreOpen(true)}
            disabled={selectedRestorable.length === 0}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1.5"
          >
            <UserCheck size={15} /> Restore Selected ({selectedRestorable.length})
          </button>
          <button onClick={() => setSelected(new Set())} className="btn-secondary text-sm px-3">Clear</button>
        </div>
      )}

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon="Search" title="No data found" description="Try adjusting filters or search terms." />
      ) : (
        <div className="card-base overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-app text-xs uppercase tracking-wide border-b border-app bg-app-subtle">
                  {tab === "pendingStudents" ? (
                    <>
                      <th className="py-3 px-4 w-10">
                        <button onClick={toggleAll} className="text-primary-600 dark:text-primary-300" title={allSelected ? "Deselect all" : "Select all"}>
                          {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </th>
                      <th className="py-3 px-4">Student</th><th className="py-3 px-4">Program</th><th className="py-3 px-4">Sem / Sec</th>
                      <th className="py-3 px-4 text-right">Paid</th><th className="py-3 px-4 text-right">Pending</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th>
                    </>
                  ) : tab === "students" ? (
                    <>
                      <th className="py-3 px-4">Student</th><th className="py-3 px-4">Program</th><th className="py-3 px-4">Sem / Sec</th>
                      <th className="py-3 px-4 text-right">Paid</th><th className="py-3 px-4 text-right">Pending</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th>
                    </>
                  ) : tab === "blocked" ? (
                    <>
                      <th className="py-3 px-4">Student</th><th className="py-3 px-4">Reason</th><th className="py-3 px-4">Sem / Sec</th>
                      <th className="py-3 px-4">Blocked At</th><th className="py-3 px-4 text-right">Actions</th>
                    </>
                  ) : (
                    <>
                      <th className="py-3 px-4">Challan</th><th className="py-3 px-4">Student</th><th className="py-3 px-4">Fee</th>
                      <th className="py-3 px-4 text-right">Amount</th><th className="py-3 px-4">Status</th><th className="py-3 px-4">Due</th><th className="py-3 px-4 text-right">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={r.studentId ? `${r.studentId}-${r.id ?? i}` : r.id ?? i} className={`border-b border-app/40 last:border-0 hover:bg-app-subtle/50 ${tab === "pendingStudents" && selected.has(r.studentId) ? "bg-primary-50/60 dark:bg-primary-950/30" : ""}`}>
                    {tab === "pendingStudents" ? (
                      <>
                        <td className="py-3 px-4">
                          <button onClick={() => toggleOne(r.studentId)} className="text-primary-600 dark:text-primary-300" title={selected.has(r.studentId) ? "Deselect" : "Select"}>
                            {selected.has(r.studentId) ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-app">{r.name} {r.blocked && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">BLOCKED</span>}</p>
                          <p className="text-xs text-muted-app">{r.roll} · {r.cnic}</p>
                        </td>
                        <td className="py-3 px-4 text-muted-app">{r.program}</td>
                        <td className="py-3 px-4 text-muted-app">Sem {r.semester} / {r.section}</td>
                        <td className="py-3 px-4 text-right text-emerald-600 font-semibold">{fmtMoney(r.paid)}</td>
                        <td className="py-3 px-4 text-right text-amber-600 font-semibold">{fmtMoney(r.pending)}</td>
                        <td className="py-3 px-4"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusChip(r.feeStatus)}`}>{r.feeStatus}</span></td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => setProfileId(r.studentId)} className="p-1.5 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 hover:bg-primary-100" title="View profile"><Eye size={14} /></button>
                            {r.blocked ? (
                              <button onClick={() => setUnblockTarget({ studentId: r.studentId, name: r.name })} className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100" title="Restore (Unblock)"><UserCheck size={14} /></button>
                            ) : (
                              <button onClick={() => setBlockTarget({ studentId: r.studentId, name: r.name })} className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100" title="Block"><UserMinus size={14} /></button>
                            )}
                          </div>
                        </td>
                      </>
                    ) : tab === "students" ? (
                      <>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-app">{r.name} {r.blocked && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">BLOCKED</span>}</p>
                          <p className="text-xs text-muted-app">{r.roll} · {r.cnic}</p>
                        </td>
                        <td className="py-3 px-4 text-muted-app">{r.program}</td>
                        <td className="py-3 px-4 text-muted-app">Sem {r.semester} / {r.section}</td>
                        <td className="py-3 px-4 text-right text-emerald-600 font-semibold">{fmtMoney(r.paid)}</td>
                        <td className="py-3 px-4 text-right text-amber-600 font-semibold">{fmtMoney(r.pending)}</td>
                        <td className="py-3 px-4"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusChip(r.feeStatus)}`}>{r.feeStatus}</span></td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => setProfileId(r.studentId)} className="p-1.5 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 hover:bg-primary-100" title="View profile"><Eye size={14} /></button>
                            {r.blocked ? (
                              <button onClick={() => setUnblockTarget({ studentId: r.studentId, name: r.name })} className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100" title="Unblock"><UserCheck size={14} /></button>
                            ) : (
                              <button onClick={() => setBlockTarget({ studentId: r.studentId, name: r.name })} className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100" title="Block"><UserMinus size={14} /></button>
                            )}
                          </div>
                        </td>
                      </>
                    ) : tab === "blocked" ? (
                      <>
                        <td className="py-3 px-4"><p className="font-semibold text-app">{r.name}</p><p className="text-xs text-muted-app">{r.roll} · {r.program}</p></td>
                        <td className="py-3 px-4 text-muted-app max-w-xs truncate">{r.reason}</td>
                        <td className="py-3 px-4 text-muted-app">Sem {r.semester} / {r.section}</td>
                        <td className="py-3 px-4 text-muted-app">{fmtDateTime(r.blockedAt)}</td>
                        <td className="py-3 px-4 text-right">
                          <button onClick={() => setUnblockTarget({ studentId: r.studentId, name: r.name })} className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 flex items-center gap-1 ml-auto"><UserCheck size={12} /> Unblock</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-4 font-mono text-xs text-muted-app">{r.challanNo}</td>
                        <td className="py-3 px-4"><p className="font-semibold text-app">{r.student}</p><p className="text-xs text-muted-app">{r.roll} · Sem {r.semester}/{r.section}</p></td>
                        <td className="py-3 px-4"><p className="text-app">{r.title}</p><p className="text-xs text-muted-app">{r.feeType}</p></td>
                        <td className="py-3 px-4 text-right font-semibold text-app">{fmtMoney(r.amount)}</td>
                        <td className="py-3 px-4"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusChip(r.status)}`}>{r.status}</span></td>
                        <td className="py-3 px-4 text-muted-app">{fmtDate(r.dueDate)}</td>
                        <td className="py-3 px-4 text-right">
                          <button onClick={() => setProfileId(r.studentId)} className="p-1.5 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 hover:bg-primary-100" title="View student"><Eye size={14} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Student Profile Modal */}
      <Modal open={!!profileId} onClose={() => setProfileId(null)} title="Student Profile" icon="Users" maxWidth="max-w-3xl">
        {profLoading || !profile ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white flex items-center justify-center text-xl font-bold shrink-0">
                {(profile.student?.name || "?").charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-lg text-app">{profile.student?.name}
                  {profile.blocked && <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">BLOCKED</span>}
                </h3>
                <p className="text-sm text-muted-app">{profile.student?.roll} · {profile.student?.programName || profile.student?.program}</p>
                <p className="text-xs text-muted-app">{profile.student?.department} · Semester {profile.student?.semester} · Section {profile.student?.section}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              {[
                ["Father Name", profile.student?.fatherName],
                ["CNIC", profile.student?.cnic],
                ["Email", profile.student?.email],
                ["Phone", profile.student?.phone],
                ["Registration", profile.student?.registrationNumber],
                ["Session", profile.student?.session],
              ].map(([label, val]) => (
                <div key={label} className="surface border border-app rounded-lg p-2.5">
                  <p className="text-[10px] text-muted-app uppercase">{label}</p>
                  <p className="font-semibold text-app truncate">{val || "—"}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 p-3 text-center"><p className="text-xs text-muted-app">Billed</p><p className="font-bold text-app">{fmtMoney(profile.totals?.billed)}</p></div>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center"><p className="text-xs text-muted-app">Paid</p><p className="font-bold text-emerald-600">{fmtMoney(profile.totals?.paid)}</p></div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-center"><p className="text-xs text-muted-app">Pending</p><p className="font-bold text-amber-600">{fmtMoney(profile.totals?.pending)}</p></div>
            </div>

            {[["Semester Fee History", profile.semesterFeeHistory], ["Examination Fee History", profile.examFeeHistory]].map(([title, list]) => (
              <div key={title}>
                <h4 className="font-bold text-app text-sm mb-2">{title}</h4>
                {(!list || list.length === 0) ? <p className="text-xs text-muted-app">No records.</p> : (
                  <div className="space-y-1.5">
                    {list.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg bg-app-subtle text-sm">
                        <div className="min-w-0"><p className="font-semibold text-app truncate">{c.title}</p><p className="text-xs text-muted-app">{c.challanNo} · Due {fmtDate(c.dueDate)}</p></div>
                        <div className="text-right shrink-0 ml-3"><p className="font-bold text-app">{fmtMoney(c.amount)}</p><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusChip(c.status)}`}>{c.status}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div>
              <h4 className="font-bold text-app text-sm mb-2">Payment Transactions</h4>
              {(!profile.transactions || profile.transactions.length === 0) ? <p className="text-xs text-muted-app">No transactions.</p> : (
                <div className="space-y-1.5">
                  {profile.transactions.map((t, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-sm">
                      <div className="min-w-0"><p className="font-semibold text-app truncate">{t.title}</p><p className="text-xs text-muted-app">{t.paymentRef} · {fmtDateTime(t.paidAt)}</p></div>
                      <p className="font-bold text-emerald-600 shrink-0 ml-3">{fmtMoney(t.amount)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-bold text-app text-sm mb-2">Block / Unblock History</h4>
              {(!profile.blockHistory || profile.blockHistory.length === 0) ? <p className="text-xs text-muted-app">No block history.</p> : (
                <div className="space-y-1.5">
                  {profile.blockHistory.map((b) => (
                    <div key={b.id} className="p-2.5 rounded-lg bg-app-subtle text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-app">{b.reason}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.active ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>{b.active ? "ACTIVE" : "RESOLVED"}</span>
                      </div>
                      <p className="text-xs text-muted-app mt-1">Blocked: {fmtDateTime(b.blockedAt)} · Sem {b.semester}/{b.section}</p>
                      {b.unblockedAt && <p className="text-xs text-muted-app">Unblocked: {fmtDateTime(b.unblockedAt)}{b.unblockNote ? ` · ${b.unblockNote}` : ""}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-app">
              {profile.blocked ? (
                <button onClick={() => { setUnblockTarget({ studentId: profile.student.studentId, name: profile.student.name }); setProfileId(null); }} className="btn-primary flex-1 flex items-center justify-center gap-2"><UserCheck size={16} /> Unblock Student</button>
              ) : (
                <button onClick={() => { setBlockTarget({ studentId: profile.student.studentId, name: profile.student.name }); setProfileId(null); }} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 flex items-center justify-center gap-2"><UserMinus size={16} /> Block Student</button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Block Modal */}
      <Modal open={!!blockTarget} onClose={() => { setBlockTarget(null); setBlockReason(""); }} title="Block Student" icon="UserMinus" maxWidth="max-w-md">
        <div className="space-y-3">
          <p className="text-sm text-app">Block <span className="font-bold">{blockTarget?.name}</span>? The student's semester, section and enrollment are preserved and will be restored on unblock.</p>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Reason</label>
            <textarea rows="3" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} className="input-base w-full text-sm" placeholder="e.g. Non-payment of semester fee after due date" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => { setBlockTarget(null); setBlockReason(""); }} className="btn-secondary flex-1">Cancel</button>
            <button disabled={busy} onClick={doBlock} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50">{busy ? "Blocking…" : "Block"}</button>
          </div>
        </div>
      </Modal>

      {/* Unblock Modal */}
      <Modal open={!!unblockTarget} onClose={() => { setUnblockTarget(null); setUnblockNote(""); }} title="Unblock Student" icon="UserCheck" maxWidth="max-w-md">
        <div className="space-y-3">
          <p className="text-sm text-app">Unblock <span className="font-bold">{unblockTarget?.name}</span>? The student will continue from the exact same semester, section and academic position.</p>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Note (optional)</label>
            <textarea rows="2" value={unblockNote} onChange={(e) => setUnblockNote(e.target.value)} className="input-base w-full text-sm" placeholder="e.g. Fee cleared" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => { setUnblockTarget(null); setUnblockNote(""); }} className="btn-secondary flex-1">Cancel</button>
            <button disabled={busy} onClick={doUnblock} className="btn-primary flex-1 disabled:opacity-50">{busy ? "Unblocking…" : "Unblock"}</button>
          </div>
        </div>
      </Modal>

      {/* Bulk Block Modal */}
      <Modal open={bulkBlockOpen} onClose={() => { setBulkBlockOpen(false); setBulkReason(""); }} title="Block Selected Students" icon="UserMinus" maxWidth="max-w-md">
        <div className="space-y-3">
          <p className="text-sm text-app">Block <span className="font-bold">{selectedBlockable.length}</span> selected student(s) due to pending fees? Each student's semester, section and enrollment are preserved and restored on unblock.</p>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Reason</label>
            <textarea rows="3" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} className="input-base w-full text-sm" placeholder="e.g. Non-payment of semester fee after due date" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => { setBulkBlockOpen(false); setBulkReason(""); }} className="btn-secondary flex-1">Cancel</button>
            <button disabled={busy} onClick={doBulkBlock} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 disabled:opacity-50">{busy ? "Blocking…" : `Block ${selectedBlockable.length}`}</button>
          </div>
        </div>
      </Modal>

      {/* Bulk Restore Modal */}
      <Modal open={bulkRestoreOpen} onClose={() => { setBulkRestoreOpen(false); setBulkNote(""); }} title="Restore Selected Students" icon="UserCheck" maxWidth="max-w-md">
        <div className="space-y-3">
          <p className="text-sm text-app">Restore <span className="font-bold">{selectedRestorable.length}</span> selected blocked student(s)? Each student continues from the exact same semester, section and academic position.</p>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Note (optional)</label>
            <textarea rows="2" value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} className="input-base w-full text-sm" placeholder="e.g. Fees cleared" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => { setBulkRestoreOpen(false); setBulkNote(""); }} className="btn-secondary flex-1">Cancel</button>
            <button disabled={busy} onClick={doBulkRestore} className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50">{busy ? "Restoring…" : `Restore ${selectedRestorable.length}`}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FeeRecords;

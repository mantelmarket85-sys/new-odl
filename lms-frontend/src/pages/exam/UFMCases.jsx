import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Search, Eye, CheckCircle2, XCircle, Plus, FileText, Award, HelpCircle } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import StatusBadge from "../../components/common/StatusBadge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import CascadeFilters, { emptyCascade, applyCascade } from "../../components/common/CascadeFilters";

const SEV_CLS = {
  CRITICAL: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300",
  HIGH: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300",
  MEDIUM: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
  LOW: "bg-slate-100 dark:bg-slate-800 text-app",
};

const TYPE_CLS = {
  MID: "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  FINAL: "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300",
  OTHER: "bg-slate-100 dark:bg-slate-800 text-app",
};

// 1.3 — three clickable summary cards for the exam-type breakdown.
const SUMMARY_CARDS = [
  { key: "MID", label: "Mid-term", icon: FileText, color: "blue" },
  { key: "FINAL", label: "Final", icon: Award, color: "purple" },
  { key: "OTHER", label: "Other", icon: HelpCircle, color: "slate" },
];

const CARD_ACTIVE = {
  blue: "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/30",
  purple: "ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-950/30",
  slate: "ring-2 ring-slate-500 bg-slate-100 dark:bg-slate-800/60",
};
const CARD_ICON = {
  blue: "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300",
  purple: "bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300",
  slate: "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
};

const ExamUFMCases = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.exam.ufm(), []);
  const cases = useMemo(() => data?.cases || [], [data]);
  const summary = useMemo(() => data?.summary || { MID: 0, FINAL: 0, OTHER: 0 }, [data]);

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all"); // 1.3 — MID / FINAL / OTHER, driven by clickable cards
  const [cascade, setCascade] = useState(emptyCascade());
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const { data: offeringData } = useApi(() => api.exam.offerings(), []);
  const offerings = useMemo(() => offeringData?.offerings || [], [offeringData]);
  const [createStudents, setCreateStudents] = useState([]);
  const emptyForm = { department: "", program: "", semester: "", offeringId: "", studentId: "", reason: "", evidence: "", severity: "HIGH", examType: "MID" };
  const [form, setForm] = useState(emptyForm);

  const createDepartments = useMemo(() => [...new Set(offerings.map((o) => o.department).filter(Boolean))].sort(), [offerings]);
  const createPrograms = useMemo(() => [...new Set(offerings.filter((o) => !form.department || o.department === form.department).map((o) => o.program).filter(Boolean))].sort(), [offerings, form.department]);
  const createSemesters = useMemo(() => [...new Set(offerings.filter((o) => (!form.department || o.department === form.department) && (!form.program || o.program === form.program)).map((o) => o.semester).filter(Boolean))].sort((a, b) => Number(a) - Number(b)), [offerings, form.department, form.program]);
  const createCourses = useMemo(() => offerings.filter((o) => (!form.department || o.department === form.department) && (!form.program || o.program === form.program) && (!form.semester || String(o.semester) === String(form.semester))), [offerings, form.department, form.program, form.semester]);

  useEffect(() => {
    if (!form.offeringId) { setCreateStudents([]); return; }
    let active = true;
    api.exam.marksheet(form.offeringId).then((res) => { if (active) setCreateStudents(res?.rows || []); }).catch(() => { if (active) setCreateStudents([]); });
    return () => { active = false; };
  }, [form.offeringId]);

  const filtered = useMemo(() => {
    // 1.3 — cascading smart full-history filters (dept → program → semester, + session/batch/section)
    let list = applyCascade(cases, cascade, (c) => ({
      department: c.department,
      program: c.program,
      semester: c.semester,
      session: c.session,
      batch: c.batch,
      section: c.section,
    }));
    return list.filter((c) => {
      if (typeFilter !== "all" && c.examType !== typeFilter) return false;
      if (severityFilter !== "all" && c.severity !== severityFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return [c.student, c.subject, c.course].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      }
      return true;
    });
  }, [cases, search, severityFilter, statusFilter, typeFilter, cascade]);

  const stats = useMemo(() => ({
    total: cases.length,
    critical: cases.filter((c) => c.severity === "CRITICAL").length,
    open: cases.filter((c) => ["OPEN", "IN_PROGRESS"].includes(c.status)).length,
    confirmed: cases.filter((c) => c.status === "RESOLVED").length,
  }), [cases]);

  const toggleType = (key) => setTypeFilter((cur) => (cur === key ? "all" : key));

  const create = async () => {
    if (!form.department || !form.program || !form.semester || !form.offeringId || !form.studentId || !form.reason.trim()) {
      toast?.("Department, Program, Semester, Course, Student and Reason are required", { type: "warning" }); return;
    }
    setBusy(true);
    try {
      await api.exam.createUfm(form);
      toast?.("UFM case opened", { type: "success" });
      setShowCreate(false); setForm(emptyForm);
      reload();
    } catch (e) { toast?.(e?.message || "Failed", { type: "error" }); } finally { setBusy(false); }
  };

  const act = async (id, action) => {
    setBusy(true);
    try {
      await api.exam.ufmAction(id, { action });
      toast?.(`UFM case ${action === "CONFIRM" ? "confirmed" : action === "DISMISS" ? "dismissed" : "under review"}`, { type: action === "CONFIRM" ? "error" : action === "DISMISS" ? "info" : "success" });
      setDetail(null);
      reload();
    } catch (e) { toast?.(e?.message || "Failed", { type: "error" }); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        title="UFM Cases"
        subtitle="Unfair Means cases — review evidence and take disciplinary action."
        icon="AlertTriangle"
        breadcrumb={["Exam Controller", "UFM Cases"]}
        actions={<button onClick={() => setShowCreate(true)} className="btn-primary text-sm py-2 px-3 flex items-center gap-2"><Plus size={14} /> Open Case</button>}
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatCard title="Total Cases" value={stats.total} icon="AlertTriangle" color="rose" delay={0.05} />
            <StatCard title="Critical" value={stats.critical} icon="XCircle" color="orange" delay={0.1} />
            <StatCard title="Open / In Review" value={stats.open} icon="Eye" color="amber" delay={0.15} />
            <StatCard title="Confirmed" value={stats.confirmed} icon="CheckCircle2" color="purple" delay={0.2} />
          </div>

          {/* 1.3 — three clickable exam-type summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            {SUMMARY_CARDS.map(({ key, label, icon: Icon, color }, idx) => {
              const active = typeFilter === key;
              return (
                <motion.button
                  key={key}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * idx }}
                  onClick={() => toggleType(key)}
                  aria-pressed={active}
                  className={`card-base p-4 text-left flex items-center gap-4 transition-all hover:shadow-md ${active ? CARD_ACTIVE[color] : ""}`}
                >
                  <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${CARD_ICON[color]}`}>
                    <Icon size={20} />
                  </span>
                  <span className="flex-1">
                    <span className="block text-2xl font-bold text-app">{summary[key] ?? 0}</span>
                    <span className="block text-[11px] uppercase font-semibold text-muted-app">{label} UFM</span>
                  </span>
                  {active && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-600 text-white">FILTERING</span>}
                </motion.button>
              );
            })}
          </div>

          {/* 1.3 — cascading smart full-history filters */}
          <CascadeFilters
            className="mb-4"
            value={cascade}
            onChange={setCascade}
            fields={["department", "program", "semester", "session", "batch", "section"]}
            extraRows={cases}
            rowMap={(c) => ({ department: c.department, session: c.session, batch: c.batch })}
          />

          <div className="card-base p-3 mb-5 flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject / student / course…" className="input-base w-full pl-10 text-sm" />
            </div>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="input-base text-sm md:w-44">
              <option value="all">All Severity</option>
              {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-base text-sm md:w-44">
              <option value="all">All Status</option>
              {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="card-base overflow-hidden">
            {filtered.length === 0 ? <EmptyState message={cases.length ? "No UFM cases match the current filters." : "No UFM cases recorded."} /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="surface border-b border-app">
                    <tr>
                      {["Reason / Student", "Type", "Department", "Program", "Sem", "Course", "Details", "Severity", "Status", "Action"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {filtered.map((c, i) => (
                      <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.03, 0.4) }} className="hover:surface">
                        <td className="px-4 py-2">
                          <p className="font-semibold text-app text-xs">{c.subject}</p>
                          {c.studentId && <p className="text-[11px] text-muted-app">{c.student}</p>}
                        </td>
                        <td className="px-4 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${TYPE_CLS[c.examType] || TYPE_CLS.OTHER}`}>{c.examTypeLabel || c.examType}</span></td>
                        <td className="px-4 py-2 text-xs text-app">{c.department || "—"}</td>
                        <td className="px-4 py-2 text-xs text-app">{c.program || "—"}</td>
                        <td className="px-4 py-2 text-xs text-center text-app">{c.semester || "—"}</td>
                        <td className="px-4 py-2 text-xs text-app">{c.course}</td>
                        <td className="px-4 py-2 text-xs text-muted-app max-w-xs truncate">{c.evidence || "—"}</td>
                        <td className="px-4 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${SEV_CLS[c.severity] || SEV_CLS.LOW}`}>{c.severity}</span></td>
                        <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
                        <td className="px-4 py-2">
                          <button onClick={() => setDetail(c)} className="px-2.5 py-1 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 text-[11px] font-semibold inline-flex items-center gap-1"><Eye size={11} /> Review</button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* CREATE MODAL */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Open UFM Case" icon="AlertTriangle" maxWidth="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Exam Type</label>
            <select value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value })} className="input-base w-full text-sm">
              <option value="MID">Mid-term</option>
              <option value="FINAL">Final</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Department</label><select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value, program: "", semester: "", offeringId: "", studentId: "" })} className="input-base w-full text-sm"><option value="">Select Department</option>{createDepartments.map((d) => <option key={d}>{d}</option>)}</select></div>
            <div><label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Program</label><select value={form.program} disabled={!form.department} onChange={(e) => setForm({ ...form, program: e.target.value, semester: "", offeringId: "", studentId: "" })} className="input-base w-full text-sm disabled:opacity-50"><option value="">{form.department ? "Select Program" : "Select Department first"}</option>{createPrograms.map((p) => <option key={p}>{p}</option>)}</select></div>
            <div><label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Semester</label><select value={form.semester} disabled={!form.program} onChange={(e) => setForm({ ...form, semester: e.target.value, offeringId: "", studentId: "" })} className="input-base w-full text-sm disabled:opacity-50"><option value="">{form.program ? "Select Semester" : "Select Program first"}</option>{createSemesters.map((s) => <option key={s} value={s}>Semester {s}</option>)}</select></div>
            <div><label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Course</label><select value={form.offeringId} disabled={!form.semester} onChange={(e) => setForm({ ...form, offeringId: e.target.value, studentId: "" })} className="input-base w-full text-sm disabled:opacity-50"><option value="">{form.semester ? "Select Course" : "Select Semester first"}</option>{createCourses.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
          </div>
          <div><label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Student</label><select value={form.studentId} disabled={!form.offeringId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} className="input-base w-full text-sm disabled:opacity-50"><option value="">{form.offeringId ? "Select Student" : "Select Course first"}</option>{createStudents.map((s) => <option key={s.studentId} value={s.studentId}>{s.roll} — {s.name}</option>)}</select></div>
          <div><label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Reason</label><textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} className="input-base w-full text-sm" placeholder="Reason for the UFM case…" /></div>
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Evidence / Details</label>
            <textarea value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} rows={3} className="input-base w-full text-sm" placeholder="Describe the evidence…" />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Severity</label>
            <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="input-base w-full text-sm">
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button onClick={create} disabled={busy} className="btn-primary text-sm py-2 px-4 disabled:opacity-50">{busy ? "Saving…" : "Open Case"}</button>
          </div>
        </div>
      </Modal>

      {/* REVIEW MODAL */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="UFM Case Review" subtitle={detail?.subject} icon="AlertTriangle" maxWidth="max-w-xl">
        {detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Exam Type</p>
                <p className="font-semibold text-app">{detail.examTypeLabel || detail.examType || "—"}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Course</p>
                <p className="font-semibold text-app">{detail.course}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Student</p>
                <p className="font-semibold text-app">{detail.studentId ? detail.student : "—"}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3">
                <p className="text-[10px] text-muted-app uppercase">Program · Semester</p>
                <p className="font-semibold text-app">{detail.program || "—"}{detail.semester ? ` · Sem ${detail.semester}` : ""}</p>
              </div>
              <div className="surface border border-app rounded-lg p-3 col-span-2">
                <p className="text-[10px] text-muted-app uppercase">Reason</p>
                <p className="font-semibold text-app mb-2">{detail.reason || detail.subject || "—"}</p>
                <p className="text-[10px] text-muted-app uppercase">Evidence</p>
                <p className="font-semibold text-app">{detail.evidence || "—"}</p>
              </div>
              {detail.resolution && (
                <div className="surface border border-app rounded-lg p-3 col-span-2">
                  <p className="text-[10px] text-muted-app uppercase">Resolution</p>
                  <p className="font-semibold text-app">{detail.resolution}</p>
                </div>
              )}
            </div>
            {["OPEN", "IN_PROGRESS"].includes(detail.status) && (
              <div className="flex gap-2 pt-2 flex-wrap">
                {detail.status === "OPEN" && (
                  <button disabled={busy} onClick={() => act(detail.id, "REVIEW")} className="flex-1 px-4 py-2 rounded-xl bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-sm font-semibold disabled:opacity-50">
                    <Eye size={14} className="inline mr-1.5" /> Start Review
                  </button>
                )}
                <button disabled={busy} onClick={() => act(detail.id, "DISMISS")} className="flex-1 px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-app text-sm font-semibold disabled:opacity-50">
                  <XCircle size={14} className="inline mr-1.5" /> Dismiss
                </button>
                <button disabled={busy} onClick={() => act(detail.id, "CONFIRM")} className="flex-1 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold disabled:opacity-50">
                  <CheckCircle2 size={14} className="inline mr-1.5" /> Confirm UFM
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ExamUFMCases;

// ============================================================
//  PROVOST — Fee Announcement (Semester + Examination)
//  Requirements 3 & 4: announce fees with scope selection
//  (University / Department / Program / Semester / Section).
//  Announcing auto-generates Account Book challans (req 11)
//  and notifies matched students. 100% real DB data.
// ============================================================
import { useState } from "react";
import { motion } from "framer-motion";
import { Megaphone, Plus, Trash2, GraduationCap, FileSpreadsheet } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
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

const SCOPES = [
  { value: "UNIVERSITY", label: "University-wide (all students)" },
  { value: "DEPARTMENT", label: "Department" },
  { value: "PROGRAM", label: "Program" },
  { value: "SEMESTER", label: "Semester (within a Program)" },
  { value: "SECTION", label: "Section (within Program + Semester)" },
];

const EMPTY = { title: "", description: "", amount: "", dueDate: "", scope: "UNIVERSITY", department: "", program: "", semester: "", section: "" };

const FeeAnnounce = () => {
  const { toast } = useToast();
  const [feeType, setFeeType] = useState("SEMESTER");
  const { data, loading, error, reload } = useApi(() => api.provost.feeMgmt.announcements(feeType), [feeType]);
  const { data: opts } = useApi(() => api.provost.feeMgmt.filterOptions(), []);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const items = data?.items || [];
  const stats = data?.stats || {};
  const setField = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const openCreate = () => { setForm(EMPTY); setShowCreate(true); };

  const publish = async () => {
    if (!form.title || form.title.trim().length < 3) { toast("Title must be at least 3 characters", { type: "error" }); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast("Enter a valid amount", { type: "error" }); return; }
    // Scope validation
    if (["DEPARTMENT"].includes(form.scope) && !form.department) { toast("Select a department", { type: "error" }); return; }
    if (["PROGRAM", "SEMESTER", "SECTION"].includes(form.scope) && !form.program) { toast("Select a program", { type: "error" }); return; }
    if (["SEMESTER", "SECTION"].includes(form.scope) && !form.semester) { toast("Select a semester", { type: "error" }); return; }
    if (form.scope === "SECTION" && !form.section) { toast("Select a section", { type: "error" }); return; }

    setSaving(true);
    try {
      const res = await api.provost.feeMgmt.createAnnouncement({
        feeType,
        title: form.title.trim(),
        description: form.description || undefined,
        amount: Number(form.amount),
        dueDate: form.dueDate || undefined,
        scope: form.scope,
        department: form.department || undefined,
        program: form.program || undefined,
        semester: form.semester ? Number(form.semester) : undefined,
        section: form.section || undefined,
      });
      const count = res?.announcement?.studentCount ?? res?.studentCount ?? 0;
      toast(`Fee announced — ${count} student account book(s) updated`, { type: "success" });
      setShowCreate(false);
      setForm(EMPTY);
      reload();
    } catch (e) {
      toast(e.message || "Failed to announce fee", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a) => {
    setDeleting(a.id);
    try {
      await api.provost.feeMgmt.deleteAnnouncement(a.id);
      toast("Announcement removed (unpaid challans cleared)", { type: "success" });
      reload();
    } catch (e) {
      toast(e.message || "Failed to remove", { type: "error" });
    } finally {
      setDeleting(null);
    }
  };

  const isSemester = feeType === "SEMESTER";
  const accent = isSemester ? "from-indigo-500 to-blue-600" : "from-purple-500 to-fuchsia-600";

  return (
    <div>
      <PageHeader
        title="Fee Announcement"
        subtitle="Announce Semester & Examination fees — auto-generates student Account Book challans"
        icon="Megaphone"
        breadcrumb={["Provost", "Fee Announcement"]}
        actions={
          <button onClick={openCreate} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
            <Plus size={14} /> Announce {isSemester ? "Semester" : "Exam"} Fee
          </button>
        }
      />

      {/* Fee type tabs */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setFeeType("SEMESTER")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${feeType === "SEMESTER" ? "bg-indigo-600 text-white shadow-md" : "bg-app-subtle text-muted-app hover:text-app"}`}
        >
          <GraduationCap size={16} /> Semester Fee
        </button>
        <button
          onClick={() => setFeeType("EXAMINATION")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${feeType === "EXAMINATION" ? "bg-purple-600 text-white shadow-md" : "bg-app-subtle text-muted-app hover:text-app"}`}
        >
          <FileSpreadsheet size={16} /> Examination Fee
        </button>
      </div>

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
            <StatCard title={`${isSemester ? "Semester" : "Exam"} Announcements`} value={stats.total ?? 0} icon="Megaphone" color="blue" delay={0.05} />
            <StatCard title="Active" value={stats.active ?? 0} icon="CheckCircle2" color="emerald" delay={0.1} />
            <StatCard title="Total Billed" value={fmtMoney(stats.totalBilled)} icon="Wallet" color="amber" delay={0.15} />
          </div>

          {items.length === 0 ? (
            <EmptyState icon="Megaphone" title="No announcements yet" description={`Announce a ${isSemester ? "semester" : "examination"} fee to bill matching students automatically.`} />
          ) : (
            <div className="space-y-3">
              {items.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className="card-base p-4 hover:shadow-md transition-all">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent} text-white flex items-center justify-center shadow-sm shrink-0`}>
                      <Megaphone size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-bold text-app truncate">{a.title}</h3>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 shrink-0">{a.status}</span>
                      </div>
                      {a.description && <p className="text-xs text-muted-app mb-2 truncate">{a.description}</p>}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                        <div><span className="text-muted-app">Amount:</span> <span className="font-bold text-app">{fmtMoney(a.amount)}</span></div>
                        <div><span className="text-muted-app">Scope:</span> <span className="font-semibold text-app">{a.scope}</span></div>
                        <div><span className="text-muted-app">Students:</span> <span className="font-semibold text-app">{a.studentCount}</span></div>
                        <div><span className="text-muted-app">Billed:</span> <span className="font-semibold text-app">{fmtMoney(a.totalBilled)}</span></div>
                        <div><span className="text-muted-app">Due:</span> <span className="font-semibold text-app">{fmtDate(a.dueDate)}</span></div>
                      </div>
                      {(a.department || a.program || a.semester || a.section) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {a.department && <span className="text-[10px] px-2 py-0.5 rounded-full bg-app-subtle text-muted-app">Dept: {a.department}</span>}
                          {a.program && <span className="text-[10px] px-2 py-0.5 rounded-full bg-app-subtle text-muted-app">Prog: {a.program}</span>}
                          {a.semester && <span className="text-[10px] px-2 py-0.5 rounded-full bg-app-subtle text-muted-app">Sem: {a.semester}</span>}
                          {a.section && <span className="text-[10px] px-2 py-0.5 rounded-full bg-app-subtle text-muted-app">Sec: {a.section}</span>}
                        </div>
                      )}
                      <div className="mt-3">
                        <button disabled={deleting === a.id} onClick={() => remove(a)}
                          className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/40 disabled:opacity-50 transition-colors flex items-center gap-1">
                          <Trash2 size={12} /> {deleting === a.id ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={`Announce ${isSemester ? "Semester" : "Examination"} Fee`} icon="Megaphone" maxWidth="max-w-xl">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Title</label>
            <input value={form.title} onChange={(e) => setField("title", e.target.value)} className="input-base w-full text-sm" placeholder={isSemester ? "e.g. Fall 2026 Semester Fee" : "e.g. Final Exam Fee"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Amount (Rs.)</label>
              <input type="number" value={form.amount} onChange={(e) => setField("amount", e.target.value)} className="input-base w-full text-sm" placeholder="25000" />
            </div>
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Due Date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setField("dueDate", e.target.value)} className="input-base w-full text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Scope</label>
            <select value={form.scope} onChange={(e) => setField("scope", e.target.value)} className="input-base w-full text-sm">
              {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Scope-specific fields */}
          {form.scope === "DEPARTMENT" && (
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Department</label>
              <select value={form.department} onChange={(e) => setField("department", e.target.value)} className="input-base w-full text-sm">
                <option value="">Select department…</option>
                {(opts?.departments || []).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
          {["PROGRAM", "SEMESTER", "SECTION"].includes(form.scope) && (
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Program</label>
              <select value={form.program} onChange={(e) => setField("program", e.target.value)} className="input-base w-full text-sm">
                <option value="">Select program…</option>
                {(opts?.programs || []).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          {["SEMESTER", "SECTION"].includes(form.scope) && (
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Semester</label>
              <select value={form.semester} onChange={(e) => setField("semester", e.target.value)} className="input-base w-full text-sm">
                <option value="">Select semester…</option>
                {(opts?.semesters || []).map((s) => <option key={s} value={s}>Semester {s}</option>)}
              </select>
            </div>
          )}
          {form.scope === "SECTION" && (
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Section</label>
              <select value={form.section} onChange={(e) => setField("section", e.target.value)} className="input-base w-full text-sm">
                <option value="">Select section…</option>
                {(opts?.sections || []).map((s) => <option key={s} value={s}>Section {s}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Description (optional)</label>
            <textarea rows="2" value={form.description} onChange={(e) => setField("description", e.target.value)} className="input-base w-full text-sm" placeholder="Details about this fee…" />
          </div>

          <div className="rounded-xl bg-app-subtle p-3 text-xs text-muted-app">
            <i className="fas fa-info-circle mr-1" /> Announcing will automatically generate Account Book challans for all matching students and notify them in real time.
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
            <button disabled={saving} onClick={publish} className="btn-primary flex-1 disabled:opacity-50">{saving ? "Announcing…" : "Announce Fee"}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FeeAnnounce;

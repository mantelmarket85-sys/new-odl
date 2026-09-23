import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch, Plus, Trash2, Save, Loader2, AlertTriangle, CheckCircle2,
  ArrowLeft, Filter, BookOpen, UserCheck, FlaskConical, Layers, Info,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import Badge from "../../components/common/Badge";
import { useToast } from "../../context/ToastContext";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";

/* =============================================================
   §3.2 — NEW DISTRIBUTION (Course Distribution module)
   ------------------------------------------------------------
   Task 6 — responsive, table-driven redesign. Flow, in order:

     1. Program  (identifies the scheme / department)
     2. Semester dropdown  →  auto-loads that scheme's courses
     3. Batch (session) the distribution targets
     4. A responsive table: "+" adds a row; each row SELECTS a
        course from the scheme-course dropdown (no more typing)
        and SELECTS a teacher from the teacher dropdown.

   FRONTEND-ONLY redesign: the persisted payload is still built
   for api.coordinator.createDistributionBatch, with each row's
   { code, title, creditHours, hasLab } taken from the selected
   scheme course — so the backend, its validation and every place
   that later reads the distributions are completely unchanged.
   ============================================================= */

const emptyRow = () => ({
  key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  courseId: "",          // chosen from the scheme-course dropdown
  teacherId: "",         // chosen from the teacher dropdown
  sectionName: "A",
  capacity: 150,
});

const StepChip = ({ n, label, done, active }) => (
  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
    done
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : active
        ? "bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300"
        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
  }`}>
    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
      done ? "bg-emerald-600 text-white" : active ? "bg-primary-600 text-white" : "bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
    }`}>
      {done ? <CheckCircle2 size={12} /> : n}
    </span>
    {label}
  </div>
);

const NewDistribution = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  // ---- Options (programs / teachers / sessions) ----
  const { data: opts, loading: optsLoading } = useApi(() => api.coordinator.distributionOptions(), []);
  const programs = useMemo(() => opts?.programs || [], [opts]);
  const teachers = useMemo(() => opts?.teachers || [], [opts]);
  const sessions = useMemo(() => opts?.sessions || [], [opts]);

  // ---- STEP 1/2/3 — the three cascading scope selectors ----
  const [programId, setProgramId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [semesters, setSemesters] = useState([]);

  // Scheme courses auto-loaded once a semester is picked.
  const [schemeCourses, setSchemeCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  // STEP 1 → load the program's semesters (real time).
  useEffect(() => {
    let active = true;
    setSemesterId("");
    if (!programId) { setSemesters([]); return; }
    api.structure.programSemesters(programId)
      .then((d) => { if (active) setSemesters(d.semesters || d || []); })
      .catch(() => { if (active) setSemesters([]); });
    return () => { active = false; };
  }, [programId]);

  // STEP 2 → the moment a Semester is chosen, auto-display that scheme's courses.
  useEffect(() => {
    let active = true;
    setSchemeCourses([]);
    if (!programId || !semesterId) return;
    setCoursesLoading(true);
    api.coordinator.distributionCourses(programId, semesterId)
      .then((d) => { if (active) setSchemeCourses(d.courses || []); })
      .catch(() => { if (active) setSchemeCourses([]); })
      .finally(() => { if (active) setCoursesLoading(false); });
    return () => { active = false; };
  }, [programId, semesterId]);

  const filtersComplete = !!programId && !!semesterId && !!sessionId;

  // ---- STEP 4 — the responsive distribution rows ----
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (key) => setRows((rs) => rs.filter((r) => r.key !== key));
  const patchRow = (key, patch) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Changing the semester/program invalidates course selections (they belong to the old scheme).
  useEffect(() => { setRows([]); setResult(null); }, [programId, semesterId]);

  const courseById = useMemo(() => {
    const m = new Map();
    for (const c of schemeCourses) m.set(String(c.id), c);
    return m;
  }, [schemeCourses]);

  const courseLabel = (c) => `${c.code} — ${c.title}`;
  const teacherLabel = (id) => {
    const t = teachers.find((x) => String(x.id) === String(id));
    return t ? t.name : "—";
  };
  const semLabel = (id) => {
    const s = semesters.find((x) => String(x.id) === String(id));
    return s ? `Semester ${s.number}` : "—";
  };
  const sessLabel = (id) => {
    const s = sessions.find((x) => String(x.id) === String(id));
    return s ? s.title : "—";
  };

  // Real-time per-row validation.
  const rowErrors = useMemo(() => {
    const seen = new Set();
    return rows.map((r) => {
      const errs = [];
      if (!r.courseId) errs.push("Course required");
      if (!r.teacherId) errs.push("Teacher required");
      if (r.courseId) {
        if (seen.has(String(r.courseId))) errs.push("This course is already added");
        else seen.add(String(r.courseId));
      }
      const cap = r.capacity === "" ? null : parseInt(r.capacity, 10);
      if (cap != null && (!Number.isFinite(cap) || cap < 1)) errs.push("Capacity must be positive");
      return errs;
    });
  }, [rows]);

  const canSubmit = filtersComplete && rows.length > 0 && rowErrors.every((e) => e.length === 0);

  // Courses still available to add (dropdown hides already-selected ones per row).
  const usedCourseIds = useMemo(
    () => new Set(rows.map((r) => String(r.courseId)).filter(Boolean)),
    [rows]
  );

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await api.coordinator.createDistributionBatch({
        programId,
        semesterId: semesterId || undefined,
        sessionId: sessionId || undefined,
        courses: rows.map((r) => {
          const c = courseById.get(String(r.courseId));
          return {
            // code/title come from the SELECTED scheme course, not typed input.
            code: c?.code || "",
            title: c?.title || "",
            creditHours: c?.creditHours ?? 3,
            hasLab: /L$/i.test(c?.code || ""), // lab courses conventionally end in "L"
            labCredit: /L$/i.test(c?.code || "") ? 1 : 0,
            teacherId: r.teacherId,
            semesterId: semesterId || undefined,
            sessionId: sessionId || undefined,
            sectionName: r.sectionName?.trim() || "A",
            capacity: r.capacity || undefined,
          };
        }),
      });
      setResult(res);
      const okCount = res.created?.length || 0;
      const failCount = res.errors?.length || 0;
      if (okCount) {
        toast(
          `${okCount} distribution${okCount === 1 ? "" : "s"} created${failCount ? ` · ${failCount} failed` : " ✓"}`,
          { type: failCount ? "warning" : "success", title: "Distribution" }
        );
        // Drop the rows that succeeded so only failures remain for correction.
        const okIdx = new Set((res.created || []).map((c) => c.index));
        setRows((rs) => rs.filter((_, i) => !okIdx.has(i)));
      } else {
        toast("No distributions were created — see the errors below.", { type: "error", title: "Distribution" });
      }
    } catch (e) {
      const msg = e?.data?.error || e.message || "Failed to create distributions";
      setResult({ created: [], errors: [{ index: -1, message: msg }] });
      toast(msg, { type: "error", title: "Distribution" });
    } finally {
      setSaving(false);
    }
  };

  const th = "px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-app whitespace-nowrap";
  const td = "px-3 py-2.5 align-top";

  return (
    <div>
      <PageHeader
        title="New Course Distribution"
        subtitle="Pick Program → Semester to auto-load the scheme courses, choose the batch, then add rows and assign a teacher to each course."
        icon="GitBranch"
        breadcrumb={["Coordinator", "Course Distribution", "New Distribution"]}
        actions={
          <button
            onClick={() => navigate("/admin/teacher-assignment")}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft size={15} /> Back to Distributions
          </button>
        }
      />

      {/* Step indicator */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <StepChip n={1} label="Program" done={!!programId} active={!programId} />
        <StepChip n={2} label="Semester" done={!!semesterId} active={!!programId && !semesterId} />
        <StepChip n={3} label="Batch" done={!!sessionId} active={!!semesterId && !sessionId} />
        <StepChip n={4} label="Add Courses" done={rows.length > 0} active={filtersComplete && rows.length === 0} />
        <StepChip n={5} label="Assign Teacher" done={rows.length > 0 && rowErrors.every((e) => e.length === 0)} active={rows.length > 0} />
      </div>

      {/* ---- STEPS 1-3: program, semester (top), batch ---- */}
      <div className="card-base p-4 mb-5">
        <div className="flex items-center gap-2 mb-3 text-sm font-bold text-app">
          <Filter size={15} className="text-primary-600" /> Distribution Scope
        </div>
        {optsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-secondary-app">
                1. Program <span className="text-rose-500">*</span>
              </label>
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="input-base mt-1 w-full"
              >
                <option value="">— Select program —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.shortForm || p.code} — {p.name}</option>
                ))}
              </select>
            </div>
            {/* Semester dropdown — selecting it auto-displays the scheme courses below. */}
            <div>
              <label className="text-xs font-semibold text-secondary-app">
                2. Semester <span className="text-rose-500">*</span>
              </label>
              <select
                value={semesterId}
                onChange={(e) => setSemesterId(e.target.value)}
                disabled={!programId}
                className="input-base mt-1 w-full disabled:opacity-60"
              >
                <option value="">{programId ? "— Select semester —" : "Select a program first"}</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>Semester {s.number}{s.title ? ` — ${s.title}` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-secondary-app">
                3. Batch / Session <span className="text-rose-500">*</span>
              </label>
              <select
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                disabled={!semesterId}
                className="input-base mt-1 w-full disabled:opacity-60"
              >
                <option value="">{semesterId ? "— Select batch —" : "Select a semester first"}</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}{s.isCurrent ? " (current)" : ""}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Auto-displayed scheme courses for the chosen semester */}
        {programId && semesterId && (
          <div className="mt-4 rounded-xl border border-app surface p-3">
            <div className="flex items-center gap-2 mb-2 text-xs font-bold text-app">
              <BookOpen size={13} className="text-primary-600" />
              Scheme Courses — {semLabel(semesterId)}
              {!coursesLoading && <Badge color="blue">{schemeCourses.length}</Badge>}
            </div>
            {coursesLoading ? (
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-28" />)}
              </div>
            ) : schemeCourses.length === 0 ? (
              <p className="text-[11px] text-muted-app flex items-center gap-1.5">
                <Info size={12} className="text-slate-400" />
                No scheme courses found for this program &amp; semester.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {schemeCourses.map((c) => (
                  <span
                    key={c.id}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border ${
                      usedCourseIds.has(String(c.id))
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30"
                        : "border-app surface text-secondary-app"
                    }`}
                    title={c.title}
                  >
                    {usedCourseIds.has(String(c.id)) && <CheckCircle2 size={11} />}
                    <span className="font-mono font-bold">{c.code}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!filtersComplete && (
          <p className="mt-3 text-[11px] text-muted-app flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-amber-500" />
            Select Program, Semester and Batch to start adding courses.
          </p>
        )}
      </div>

      {/* ---- STEP 4: responsive distribution rows ---- */}
      <div className="card-base overflow-hidden mb-5">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-app surface">
          <div className="flex items-center gap-2 text-sm font-bold text-app">
            <Layers size={15} className="text-primary-600" /> Courses to Distribute
            {rows.length > 0 && <Badge color="blue">{rows.length}</Badge>}
          </div>
          <button
            onClick={addRow}
            disabled={!filtersComplete || schemeCourses.length === 0}
            title={
              !filtersComplete
                ? "Select Program, Semester and Batch first"
                : schemeCourses.length === 0
                  ? "This semester has no scheme courses"
                  : "Add a distribution row"
            }
            className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={15} /> Add Row
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Layers size={30} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-sm font-bold text-app">No courses added yet</p>
            <p className="text-xs text-muted-app mt-1">
              {filtersComplete
                ? 'Click "+ Add Row", pick a scheme course and assign its teacher.'
                : "Choose Program → Semester → Batch above to begin."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="surface border-b border-app">
                <tr>
                  <th className={`${th} w-10`}>#</th>
                  <th className={th}>Course *</th>
                  <th className={th}>Credits</th>
                  <th className={th}>Teacher *</th>
                  <th className={th}>Section</th>
                  <th className={th}>Capacity</th>
                  <th className={`${th} w-12`}></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {rows.map((r, i) => {
                    const errs = rowErrors[i] || [];
                    const selected = courseById.get(String(r.courseId));
                    return (
                      <motion.tr
                        key={r.key}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        className={`border-t border-app ${errs.length ? "bg-rose-50/40 dark:bg-rose-950/10" : ""}`}
                      >
                        <td className={`${td} text-xs font-bold text-muted-app`}>{i + 1}</td>
                        {/* Course dropdown (scheme courses only; hides ones already chosen) */}
                        <td className={td}>
                          <select
                            value={r.courseId}
                            onChange={(e) => patchRow(r.key, { courseId: e.target.value })}
                            className="input-base w-56 text-xs py-1.5"
                          >
                            <option value="">— Select course —</option>
                            {schemeCourses
                              .filter((c) => !usedCourseIds.has(String(c.id)) || String(c.id) === String(r.courseId))
                              .map((c) => (
                                <option key={c.id} value={c.id}>{courseLabel(c)}</option>
                              ))}
                          </select>
                        </td>
                        <td className={`${td} text-xs`}>
                          {selected
                            ? <span className="inline-flex items-center gap-1">
                                {selected.creditHours ?? "—"}
                                {/L$/i.test(selected.code) && (
                                  <Badge color="violet"><FlaskConical size={9} className="inline mr-0.5" />Lab</Badge>
                                )}
                              </span>
                            : <span className="text-muted-app">—</span>}
                        </td>
                        {/* Teacher dropdown */}
                        <td className={td}>
                          <select
                            value={r.teacherId}
                            onChange={(e) => patchRow(r.key, { teacherId: e.target.value })}
                            className="input-base w-44 text-xs py-1.5"
                          >
                            <option value="">— Select teacher —</option>
                            {teachers.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className={td}>
                          <input
                            value={r.sectionName}
                            onChange={(e) => patchRow(r.key, { sectionName: e.target.value })}
                            placeholder="A"
                            className="input-base w-14 text-xs py-1.5"
                          />
                        </td>
                        <td className={td}>
                          <input
                            type="number" min={1}
                            value={r.capacity}
                            onChange={(e) => patchRow(r.key, { capacity: e.target.value })}
                            placeholder="Cap"
                            className="input-base w-20 text-xs py-1.5"
                          />
                        </td>
                        <td className={td}>
                          <button
                            onClick={() => removeRow(r.key)}
                            title="Remove this row"
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}

        {/* Real-time validation feedback */}
        {rows.length > 0 && rowErrors.some((e) => e.length > 0) && (
          <div className="px-4 py-3 border-t border-app bg-rose-50/60 dark:bg-rose-950/20">
            <ul className="space-y-0.5">
              {rowErrors.map((errs, i) =>
                errs.length ? (
                  <li key={i} className="text-[11px] text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                    <AlertTriangle size={11} /> <b>Row {i + 1}:</b> {errs.join(" · ")}
                  </li>
                ) : null
              )}
            </ul>
          </div>
        )}
      </div>

      {/* ---- Live review table ---- */}
      {rows.length > 0 && (
        <div className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-app mb-1.5">
            Review — what will be created ({sessLabel(sessionId)} · {semLabel(semesterId)})
          </p>
          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="surface border-b border-app">
                  <tr>
                    <th className={th}>Course</th>
                    <th className={th}>Teacher</th>
                    <th className={th}>Section</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const c = courseById.get(String(r.courseId));
                    return (
                      <tr key={r.key} className="border-t border-app">
                        <td className="px-3 py-2.5 text-app">
                          {c
                            ? <>
                                <span className="font-mono font-bold">{c.code}</span>
                                <span className="text-muted-app"> — {c.title}</span>
                                {/L$/i.test(c.code) && <Badge color="violet"><FlaskConical size={9} className="inline mr-0.5" />Lab</Badge>}
                              </>
                            : <Badge color="amber">No course selected</Badge>}
                        </td>
                        <td className="px-3 py-2.5 text-app">
                          {r.teacherId
                            ? <span className="inline-flex items-center gap-1"><UserCheck size={12} className="text-emerald-600" />{teacherLabel(r.teacherId)}</span>
                            : <Badge color="amber">Not assigned</Badge>}
                        </td>
                        <td className="px-3 py-2.5 text-app">
                          {r.sectionName?.trim() || "A"}{r.capacity ? ` · ${r.capacity}` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---- Result feedback ---- */}
      {result && (
        <div className="card-base p-4 mb-5 space-y-2">
          {result.created?.length > 0 && (
            <div className="text-xs text-emerald-700 dark:text-emerald-300">
              <p className="font-bold flex items-center gap-1.5 mb-1">
                <CheckCircle2 size={13} /> Created ({result.created.length})
              </p>
              <ul className="space-y-0.5 pl-5 list-disc">
                {result.created.map((c) => (
                  <li key={c.offeringId}>
                    <b className="font-mono">{c.code}</b> — {c.title} → {teacherLabel(c.teacherId)} · {sessLabel(c.sessionId)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.errors?.length > 0 && (
            <div className="text-xs text-rose-700 dark:text-rose-300">
              <p className="font-bold flex items-center gap-1.5 mb-1">
                <AlertTriangle size={13} /> Failed ({result.errors.length})
              </p>
              <ul className="space-y-0.5 pl-5 list-disc">
                {result.errors.map((e, i) => (
                  <li key={i}>{e.code ? <b className="font-mono">{e.code}</b> : null} {e.code ? "— " : ""}{e.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ---- Actions ---- */}
      <div className="flex flex-wrap gap-2 justify-end">
        <button onClick={() => navigate("/admin/teacher-assignment")} disabled={saving} className="btn-secondary text-sm py-2.5 px-5">
          Cancel
        </button>
        <button
          onClick={addRow}
          disabled={!filtersComplete || schemeCourses.length === 0 || saving}
          className="btn-secondary text-sm py-2.5 px-5 disabled:opacity-50"
        >
          <Plus size={14} className="inline mr-1" /> Add Row
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit || saving}
          title={canSubmit ? "" : "Complete the scope and fix any row errors first"}
          className="btn-primary text-sm py-2.5 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving
            ? <><Loader2 size={14} className="inline mr-1.5 animate-spin" /> Creating…</>
            : <><Save size={14} className="inline mr-1.5" /> Create {rows.length || ""} Distribution{rows.length === 1 ? "" : "s"}</>}
        </button>
      </div>
    </div>
  );
};

export default NewDistribution;

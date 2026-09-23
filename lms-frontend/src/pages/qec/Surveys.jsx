import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ClipboardList, Plus, Search, Lock, Unlock, Eye, Calendar,
  ToggleLeft, ToggleRight, EyeOff, ShieldCheck, AlertTriangle,
  Pencil, Trash2, GripVertical, ArrowUp, ArrowDown, X, BarChart3,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import StatusBadge from "../../components/common/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { useAppSettings } from "../../context/AppSettingsContext";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import DeptSmartFilter, { ALL_DEPTS, filterByDept, collectDepartments } from "../../components/common/DeptSmartFilter";

/* =========================================================================
 * QEC → Survey Management (real-time, DB-backed)
 *
 *   - QEC Global Controls panel (localStorage flags via AppSettings) — UNCHANGED
 *   - Live survey list / stats / lock-unlock / create / EDIT / DELETE
 *   - MCQ Question Builder (add / edit / remove / reorder) with the
 *     standard 5-point Likert response scale
 *   - View Responses (per-question option distribution + comments)
 * ======================================================================= */

// Map create-modal survey type label → backend enum.
const TYPE_TO_ENUM = {
  "Student → Teacher": "TEACHER_EVAL",
  "Student → Course": "COURSE_EVAL",
  "Teacher → Self": "TEACHER_EVAL",
  "Final-Year": "QEC",
  "Alumni": "QEC",
  "Employer": "QEC",
};
const AUDIENCE_TO_ENUM = {
  "All Students": "STUDENTS",
  "Specific Batch": "STUDENTS",
  "Final Year Only": "STUDENTS",
  "All Teachers": "TEACHERS",
  "Industry Partners": "ALL",
};

// The mandatory 5-point Likert scale every MCQ question uses.
const LIKERT = ["Strongly Agree", "Agree", "Not Sure", "Disagree", "Strongly Disagree"];

const newMcqQuestion = (text = "") => ({ text, type: "MCQ", options: [...LIKERT], required: true });
const newTextQuestion = (text = "") => ({ text, type: "TEXT", options: [], required: false });

const DEFAULT_QUESTIONS = () => [
  newMcqQuestion("The overall quality met my expectations."),
  newMcqQuestion("Communication and support were effective."),
  newMcqQuestion("Learning objectives were clearly achieved."),
  newTextQuestion("Additional comments / suggestions"),
];

const QecSurveysPage = () => {
  const { toast } = useToast();
  const {
    surveysEnabled, setSurveysEnabled,
    feedbackReleased, setFeedbackReleased,
    resultsDeclared, setResultsDeclared,
  } = useAppSettings();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dept, setDept] = useState(ALL_DEPTS);
  const [program, setProgram] = useState("all");

  // Create / edit modal state.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = create, number = edit
  const [form, setForm] = useState({
    title: "", type: "Student → Course", audience: "All Students",
    rawType: null, rawAudience: null, closesAt: "", anonymous: true,
    // Department scoping (Req 1): "ALL" = overall survey for every department,
    // otherwise a specific department name = survey for that one department.
    deptScope: "ALL", department: "",
  });
  const [questions, setQuestions] = useState(DEFAULT_QUESTIONS());
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // View-responses modal state.
  const [responsesFor, setResponsesFor] = useState(null);
  const [responseData, setResponseData] = useState(null);
  const [loadingResponses, setLoadingResponses] = useState(false);

  const [busyId, setBusyId] = useState(null);

  const { data, loading, error, reload } = useApi(() => api.qec.surveys(), []);
  const surveys = data?.items || [];
  const stats = data?.stats || { active: 0, scheduled: 0, locked: 0, responses: 0 };

  const departments = useMemo(
    () => collectDepartments({ options: data?.departments || [], rows: surveys }),
    [data, surveys],
  );

  const programOptions = useMemo(() => (data?.programs || []).filter((p) => dept === ALL_DEPTS || p.department === dept).map((p) => p.value).filter((v, i, a) => a.indexOf(v) === i).sort(), [data, dept]);

  const filtered = useMemo(() => {
    return filterByDept(surveys, dept).filter((s) => {
      if (program !== "all" && s.program !== program) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [surveys, search, statusFilter, dept, program]);

  /* ----------------------------- Lock / Unlock ----------------------------- */
  const toggleLock = async (survey) => {
    const action = survey.status === "Locked" ? "unlock" : "lock";
    setBusyId(survey.rawId);
    try {
      await api.qec.setSurveyStatus(survey.rawId, { action });
      toast(`Survey ${action === "lock" ? "disabled" : "enabled"}`, { type: action === "lock" ? "info" : "success" });
      await reload();
    } catch (e) {
      toast(e.message || "Failed to update survey", { type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  /* ------------------------------- Delete ---------------------------------- */
  const deleteSurvey = async (survey) => {
    if (!window.confirm(`Delete survey "${survey.title}"? This cannot be undone.`)) return;
    setBusyId(survey.rawId);
    try {
      await api.qec.deleteSurvey(survey.rawId);
      toast("Survey deleted", { type: "info" });
      await reload();
    } catch (e) {
      toast(e.message || "Failed to delete survey", { type: "error" });
    } finally {
      setBusyId(null);
    }
  };

  /* --------------------------- Open create modal --------------------------- */
  const openCreate = () => {
    setEditingId(null);
    setForm({
      title: "", type: "Student → Course", audience: "All Students",
      rawType: null, rawAudience: null, closesAt: "", anonymous: true,
      // Pre-select the currently filtered department (if any) as a convenience.
      deptScope: dept && dept !== ALL_DEPTS ? "DEPARTMENT" : "ALL",
      department: dept && dept !== ALL_DEPTS ? dept : "",
    });
    setQuestions(DEFAULT_QUESTIONS());
    setEditorOpen(true);
  };

  /* ---------------------------- Open edit modal ---------------------------- */
  const openEdit = async (survey) => {
    setEditingId(survey.rawId);
    setEditorOpen(true);
    setLoadingDetail(true);
    setForm({
      title: survey.title,
      type: "Student → Course",
      audience: survey.audience === "TEACHERS" ? "All Teachers" : survey.audience === "ALL" ? "Industry Partners" : "All Students",
      rawType: survey.rawType,
      rawAudience: survey.audience,
      closesAt: survey.closesAt ? new Date(survey.closesAt).toISOString().slice(0, 10) : "",
      anonymous: !!survey.anonymous,
      deptScope: survey.scope === "DEPARTMENT" && survey.department ? "DEPARTMENT" : "ALL",
      department: survey.department || "",
    });
    try {
      const detail = await api.qec.survey(survey.rawId);
      const defs = detail.questionDefs || [];
      setQuestions(defs.length ? defs.map((q) => ({
        text: q.text,
        type: q.type === "TEXT" ? "TEXT" : "MCQ",
        options: q.type === "TEXT" ? [] : (q.options && q.options.length ? q.options : [...LIKERT]),
        required: q.required !== false,
      })) : DEFAULT_QUESTIONS());
    } catch (e) {
      toast(e.message || "Failed to load survey questions", { type: "error" });
      setQuestions(DEFAULT_QUESTIONS());
    } finally {
      setLoadingDetail(false);
    }
  };

  /* -------------------------- Question builder ops ------------------------- */
  const addMcq = () => setQuestions((qs) => [...qs, newMcqQuestion("")]);
  const addText = () => setQuestions((qs) => [...qs, newTextQuestion("")]);
  const removeQuestion = (i) => setQuestions((qs) => qs.filter((_, idx) => idx !== i));
  const updateQuestionText = (i, text) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, text } : q)));
  const toggleRequired = (i) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, required: !q.required } : q)));
  const move = (i, dir) => setQuestions((qs) => {
    const j = i + dir;
    if (j < 0 || j >= qs.length) return qs;
    const copy = [...qs];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });

  /* ------------------------------ Save survey ------------------------------ */
  const saveSurvey = async () => {
    if (!form.title.trim() || form.title.trim().length < 3) {
      toast("Please enter a survey title (min 3 characters).", { type: "warning" });
      return;
    }
    if (questions.length === 0) {
      toast("Add at least one question.", { type: "warning" });
      return;
    }
    if (questions.some((q) => !q.text.trim())) {
      toast("Every question must have text.", { type: "warning" });
      return;
    }
    if (form.deptScope === "DEPARTMENT" && !form.department) {
      toast("Select a department for a department-specific survey.", { type: "warning" });
      return;
    }
    const scope = form.deptScope === "DEPARTMENT" ? "DEPARTMENT" : "UNIVERSITY";
    const department = form.deptScope === "DEPARTMENT" ? form.department : null;
    const payloadQuestions = questions.map((q, i) => ({
      text: q.text.trim(),
      type: q.type,
      options: q.type === "MCQ" ? (q.options && q.options.length ? q.options : LIKERT) : [],
      required: q.required,
      order: i + 1,
    }));

    setSaving(true);
    try {
      if (editingId) {
        await api.qec.updateSurvey(editingId, {
          title: form.title.trim(),
          isAnonymous: form.anonymous,
          closesAt: form.closesAt || undefined,
          scope,
          department,
          questions: payloadQuestions,
        });
        toast("Survey updated", { type: "success" });
      } else {
        await api.qec.createSurvey({
          title: form.title.trim(),
          type: TYPE_TO_ENUM[form.type] || "QEC",
          audience: AUDIENCE_TO_ENUM[form.audience] || "STUDENTS",
          isAnonymous: form.anonymous,
          closesAt: form.closesAt || undefined,
          scope,
          department,
          questions: payloadQuestions,
        });
        toast(scope === "DEPARTMENT" ? `Survey created for ${department}` : "Overall survey created for all departments", { type: "success" });
      }
      setEditorOpen(false);
      await reload();
    } catch (e) {
      toast(e.message || "Failed to save survey", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  /* --------------------------- View responses ----------------------------- */
  const openResponses = async (survey) => {
    setResponsesFor(survey);
    setResponseData(null);
    setLoadingResponses(true);
    try {
      const detail = await api.qec.survey(survey.rawId);
      setResponseData(detail);
    } catch (e) {
      toast(e.message || "Failed to load responses", { type: "error" });
    } finally {
      setLoadingResponses(false);
    }
  };

  /* --------- Wire QEC global toggles (localStorage — unchanged) --------- */
  const handleSurveysToggle = () => {
    setSurveysEnabled(!surveysEnabled);
    toast(`Surveys ${!surveysEnabled ? "ENABLED" : "DISABLED"} for the entire LMS`, {
      type: !surveysEnabled ? "success" : "warning",
    });
  };
  const handleFeedbackToggle = () => {
    setFeedbackReleased(!feedbackReleased);
    toast(`Feedback visibility ${!feedbackReleased ? "released to teachers" : "hidden from teachers"}`, {
      type: !feedbackReleased ? "success" : "info",
    });
  };
  const handleResultsToggle = () => {
    setResultsDeclared(!resultsDeclared);
    toast(`Results ${!resultsDeclared ? "marked declared" : "set as not declared"}`, {
      type: !resultsDeclared ? "success" : "info",
    });
  };

  return (
    <div>
      <PageHeader
        title="Survey Management"
        subtitle="Create, announce, lock and analyse quality-assurance surveys — controls all student & teacher LMS gating"
        icon="ClipboardList"
        breadcrumb={["QEC", "Surveys"]}
        actions={
          <button onClick={openCreate} className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
            <Plus size={14} /> New Survey
          </button>
        }
      />

      {/* GLOBAL CONTROLS PANEL — UNCHANGED */}
      <div className="card-base p-4 mb-5 border-l-4 border-l-violet-500">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} className="text-violet-500" />
          <h3 className="font-bold text-app text-sm">QEC Global Controls</h3>
          <span className="text-[10px] text-muted-app ml-2">These flags propagate across the LMS in real time</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Surveys Enabled */}
          <button
            onClick={handleSurveysToggle}
            className={`p-3 rounded-xl border text-left transition-all ${
              surveysEnabled
                ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
                : "border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold text-muted-app">Surveys Module</span>
              {surveysEnabled
                ? <ToggleRight size={22} className="text-emerald-600" />
                : <ToggleLeft  size={22} className="text-rose-600" />
              }
            </div>
            <p className={`text-sm font-bold ${surveysEnabled ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
              {surveysEnabled ? "ENABLED" : "DISABLED"}
            </p>
            <p className="text-[10px] text-muted-app mt-1">
              {surveysEnabled
                ? "Students see survey module · Teachers/Students gated on completion"
                : "Survey module hidden from students · No gating applied"}
            </p>
          </button>

          {/* Results Declared */}
          <button
            onClick={handleResultsToggle}
            className={`p-3 rounded-xl border text-left transition-all ${
              resultsDeclared
                ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30"
                : "border-app surface"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold text-muted-app">Results Declared</span>
              {resultsDeclared
                ? <ToggleRight size={22} className="text-blue-600" />
                : <ToggleLeft  size={22} className="text-muted-app" />
              }
            </div>
            <p className={`text-sm font-bold ${resultsDeclared ? "text-blue-700 dark:text-blue-300" : "text-app"}`}>
              {resultsDeclared ? "YES" : "NOT YET"}
            </p>
            <p className="text-[10px] text-muted-app mt-1">
              Required (with feedback release) for teachers to see student feedback
            </p>
          </button>

          {/* Feedback Released */}
          <button
            onClick={handleFeedbackToggle}
            disabled={!resultsDeclared}
            className={`p-3 rounded-xl border text-left transition-all ${
              feedbackReleased
                ? "border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30"
                : "border-app surface"
            } ${!resultsDeclared ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold text-muted-app">Feedback Visibility</span>
              {feedbackReleased
                ? <Eye    size={20} className="text-violet-600" />
                : <EyeOff size={20} className="text-muted-app" />
              }
            </div>
            <p className={`text-sm font-bold ${feedbackReleased ? "text-violet-700 dark:text-violet-300" : "text-app"}`}>
              {feedbackReleased ? "VISIBLE TO TEACHERS" : "HIDDEN FROM TEACHERS"}
            </p>
            <p className="text-[10px] text-muted-app mt-1">
              {resultsDeclared ? "Toggle to release/withhold survey feedback" : "Declare results first to enable"}
            </p>
          </button>
        </div>

        {/* Status banner */}
        {surveysEnabled && (
          <div className="mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-start gap-2 text-xs">
            <AlertTriangle size={13} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-amber-700 dark:text-amber-300">
              <strong>Gating active:</strong> students who haven't submitted surveys cannot attempt exams · teachers who haven't submitted self-evaluation surveys cannot upload Final Term results.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard title="Active"          value={stats.active}    icon="Unlock"    color="emerald" delay={0.05} />
        <StatCard title="Scheduled"       value={stats.scheduled} icon="Calendar"  color="amber"   delay={0.1} />
        <StatCard title="Locked"          value={stats.locked}    icon="Lock"      color="rose"    delay={0.15} />
        <StatCard title="Total Responses" value={(stats.responses || 0).toLocaleString()} icon="Users" color="purple" delay={0.2} />
      </div>

      <div className="card-base p-3 mb-5 flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search surveys..." className="input-base w-full pl-10 text-sm" />
        </div>
        <DeptSmartFilter value={dept} onChange={(value) => { setDept(value); setProgram("all"); }} departments={departments} />
        <select value={program} onChange={(e) => setProgram(e.target.value)} disabled={dept === ALL_DEPTS} className="input-base text-sm md:w-44 disabled:opacity-50 disabled:cursor-not-allowed">
          <option value="all">{dept === ALL_DEPTS ? "Select Department first" : "All Programs"}</option>
          {programOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-base text-sm md:w-44">
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Scheduled">Scheduled</option>
          <option value="Locked">Locked</option>
          <option value="Closed">Closed</option>
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-base p-10 text-center text-sm text-muted-app">No surveys match your filters.</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map((s, i) => {
            const pct = s.totalExpected > 0 ? Math.round((s.responses / s.totalExpected) * 100) : 0;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card-base p-4 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-xs font-bold text-primary-600 dark:text-primary-400">{s.id}</p>
                    {s.anonymous && (
                      <span className="text-[9px] font-bold bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded">
                        ANONYMOUS
                      </span>
                    )}
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <h3 className="font-bold text-app mb-1">{s.title}</h3>
                <div className="mb-2 flex flex-wrap gap-1">
                  {s.scope === "DEPARTMENT" && s.department ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">{s.department}</span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-muted-app">All Departments</span>
                  )}
                  {s.program && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">{s.program}</span>}
                </div>
                <p className="text-xs text-muted-app mb-3">{s.type} · {s.target} · {s.questions} questions</p>

                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-app">Response Rate</span>
                    <span className="font-bold text-app">{s.responses} / {s.totalExpected} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} className="h-full bg-gradient-to-r from-violet-500 to-purple-600" />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-muted-app flex items-center gap-1"><Calendar size={11} /> Deadline: {s.deadline}</span>
                  <span className="text-muted-app">Locks after: {s.lockedAfter}</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => openResponses(s)} className="flex-1 min-w-[88px] py-1.5 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 text-xs font-semibold hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors flex items-center justify-center gap-1">
                    <BarChart3 size={11} /> Responses
                  </button>
                  <button onClick={() => openEdit(s)} className="px-3 py-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-xs font-semibold hover:bg-sky-200 dark:hover:bg-sky-900/40 transition-colors flex items-center gap-1">
                    <Pencil size={11} /> Edit
                  </button>
                  {s.status !== "Scheduled" && (
                    <button
                      onClick={() => toggleLock(s)}
                      disabled={busyId === s.rawId}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50 ${
                        s.status === "Locked"
                          ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                          : "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300"
                      }`}
                    >
                      {s.status === "Locked" ? <><Unlock size={11} /> Enable</> : <><Lock size={11} /> Disable</>}
                    </button>
                  )}
                  <button onClick={() => deleteSurvey(s)} disabled={busyId === s.rawId} className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors flex items-center gap-1 disabled:opacity-50">
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ============ CREATE / EDIT SURVEY MODAL (with MCQ builder) ============ */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editingId ? "Edit Survey" : "Create New Survey"} icon={editingId ? "Pencil" : "Plus"} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-app mb-1 block">Survey Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="input-base w-full text-sm"
              placeholder="e.g. Faculty Evaluation Spring 2025"
            />
          </div>

          {!editingId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-app mb-1 block">Survey Type</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input-base w-full text-sm">
                  <option>Student → Teacher</option>
                  <option>Student → Course</option>
                  <option>Teacher → Self</option>
                  <option>Final-Year</option>
                  <option>Alumni</option>
                  <option>Employer</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-app mb-1 block">Target Audience</label>
                <select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))} className="input-base w-full text-sm">
                  <option>All Students</option>
                  <option>Specific Batch</option>
                  <option>Final Year Only</option>
                  <option>All Teachers</option>
                  <option>Industry Partners</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-app mb-1 block">Deadline</label>
              <input type="date" value={form.closesAt} onChange={(e) => setForm((f) => ({ ...f, closesAt: e.target.value }))} className="input-base w-full text-sm" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-app pb-2">
                <input type="checkbox" checked={form.anonymous} onChange={(e) => setForm((f) => ({ ...f, anonymous: e.target.checked }))} className="rounded" /> Anonymous responses
              </label>
            </div>
          </div>

          {/* ---------------------- DEPARTMENT SCOPE ---------------------- */}
          <div className="border border-app rounded-xl p-3 bg-slate-50 dark:bg-slate-900/40">
            <label className="text-xs font-semibold text-app mb-2 block">Survey Scope</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, deptScope: "ALL", department: "" }))}
                className={`p-2.5 rounded-lg border text-left text-xs font-semibold transition-all ${
                  form.deptScope === "ALL"
                    ? "border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300"
                    : "border-app surface text-app"
                }`}
              >
                Overall — All Departments
                <span className="block text-[10px] font-normal text-muted-app mt-0.5">One survey covering every department at once</span>
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, deptScope: "DEPARTMENT" }))}
                className={`p-2.5 rounded-lg border text-left text-xs font-semibold transition-all ${
                  form.deptScope === "DEPARTMENT"
                    ? "border-violet-400 dark:border-violet-600 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300"
                    : "border-app surface text-app"
                }`}
              >
                Specific Department
                <span className="block text-[10px] font-normal text-muted-app mt-0.5">Target one department only</span>
              </button>
            </div>
            {form.deptScope === "DEPARTMENT" && (
              <select
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                className="input-base w-full text-sm"
              >
                <option value="">— Select a department —</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
          </div>

          {/* ---------------------- MCQ QUESTION BUILDER ---------------------- */}
          <div className="border-t border-app pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-app flex items-center gap-2"><ClipboardList size={14} /> Questions ({questions.length})</h4>
              <div className="flex gap-2">
                <button onClick={addMcq} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 flex items-center gap-1">
                  <Plus size={11} /> MCQ
                </button>
                <button onClick={addText} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-app flex items-center gap-1">
                  <Plus size={11} /> Comment
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted-app mb-3">
              Every MCQ question uses the standard 5-point scale: <strong>Strongly Agree · Agree · Not Sure · Disagree · Strongly Disagree</strong>. Respondents select exactly one option.
            </p>

            {loadingDetail ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {questions.map((q, i) => (
                  <div key={i} className="surface border border-app rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col items-center pt-1 text-muted-app">
                        <GripVertical size={14} />
                        <span className="text-[10px] font-bold mt-1">{i + 1}</span>
                      </div>
                      <div className="flex-1">
                        <input
                          value={q.text}
                          onChange={(e) => updateQuestionText(i, e.target.value)}
                          placeholder={q.type === "TEXT" ? "Open-ended comment question" : "MCQ question text"}
                          className="input-base w-full text-sm mb-1"
                        />
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${q.type === "TEXT" ? "bg-slate-200 dark:bg-slate-700 text-app" : "bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300"}`}>
                            {q.type === "TEXT" ? "OPEN COMMENT" : "MCQ · 5-POINT"}
                          </span>
                          <label className="flex items-center gap-1.5 text-[11px] text-muted-app">
                            <input type="checkbox" checked={q.required} onChange={() => toggleRequired(i)} className="rounded" /> Required
                          </label>
                        </div>
                        {q.type === "MCQ" && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {LIKERT.map((opt) => (
                              <span key={opt} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-muted-app border border-app">{opt}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded text-muted-app hover:text-app disabled:opacity-30" title="Move up"><ArrowUp size={13} /></button>
                        <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="p-1 rounded text-muted-app hover:text-app disabled:opacity-30" title="Move down"><ArrowDown size={13} /></button>
                        <button onClick={() => removeQuestion(i)} className="p-1 rounded text-rose-500 hover:text-rose-700" title="Remove"><X size={13} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-app">
            <button onClick={() => setEditorOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={saveSurvey} disabled={saving || loadingDetail} className="btn-primary flex-1 disabled:opacity-60">
              {saving ? "Saving…" : editingId ? "Save Changes" : "Create & Announce"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ===================== VIEW RESPONSES MODAL ===================== */}
      <Modal open={!!responsesFor} onClose={() => setResponsesFor(null)} title={responsesFor?.title} subtitle={`${responsesFor?.id} · Survey Responses`} icon="BarChart3" maxWidth="max-w-2xl">
        {loadingResponses ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : responseData ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
              <p className="text-sm text-app">
                <strong>{responseData.survey.responses}</strong> of <strong>{responseData.survey.totalExpected}</strong> respondents submitted
                ({responseData.survey.totalExpected > 0 ? Math.round((responseData.survey.responses / responseData.survey.totalExpected) * 100) : 0}% response rate)
                · Avg rating <strong>{responseData.survey.ratingAvg}</strong> / 5
              </p>
            </div>

            {responseData.questions.length === 0 ? (
              <p className="text-sm text-muted-app text-center py-6">This survey has no questions.</p>
            ) : responseData.questions.map((q) => (
              <div key={q.id} className="surface border border-app rounded-lg p-3">
                <p className="text-sm font-semibold text-app mb-2">{q.text}</p>

                {(q.type === "MCQ" || q.type === "RATING") && (
                  <div className="space-y-1.5">
                    {(q.options && q.options.length ? q.options : ["Strongly Agree", "Agree", "Not Sure", "Disagree", "Strongly Disagree"]).map((opt) => {
                      const count = (q.optionCounts && q.optionCounts[opt]) || 0;
                      const total = q.count || 0;
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={opt}>
                          <div className="flex justify-between text-[11px] text-muted-app mb-0.5">
                            <span>{opt}</span><span>{count} ({pct}%)</span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-violet-500 to-purple-600" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-muted-app pt-1">Average score: <strong>{q.avg}</strong> / 5 · {q.count} answers</p>
                  </div>
                )}

                {q.type === "YESNO" && (
                  <p className="text-xs text-app">Yes: <strong>{q.yes}</strong> · No: <strong>{q.no}</strong></p>
                )}

                {q.type === "TEXT" && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {(q.comments || []).length === 0 ? (
                      <p className="text-xs text-muted-app">No written comments yet.</p>
                    ) : q.comments.map((c, idx) => (
                      <p key={idx} className="text-xs text-app italic surface border border-app rounded p-2">"{c}"</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-app text-center py-6">No data.</p>
        )}
      </Modal>
    </div>
  );
};

export default QecSurveysPage;

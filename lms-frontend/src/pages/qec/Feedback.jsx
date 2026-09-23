import { useState, useMemo } from "react";
import PageHeader from "../../components/common/PageHeader";
import ExportButtons from "../../components/enterprise/ExportButtons";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import { Filter, RotateCcw } from "lucide-react";

const Feedback = () => {
  // Smart filters (all client-side over the full real-time data set).
  const [rating, setRating] = useState("all");
  const [survey, setSurvey] = useState("all");
  const [department, setDepartment] = useState("all");
  const [program, setProgram] = useState("all");
  const [semester, setSemester] = useState("all");
  const [course, setCourse] = useState("all");
  const [teacher, setTeacher] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, loading, error, reload } = useApi(() => api.qec.feedback(), []);
  const allFeedback = data?.items || [];
  const surveys = data?.surveys || [];
  const opts = data?.filterOptions || { departments: [], programs: [], semesters: [], courses: [], teachers: [], statuses: [] };

  const filtered = useMemo(() => allFeedback.filter((f) => {
    if (rating !== "all" && f.rating !== Number(rating)) return false;
    if (survey !== "all" && f.surveyId !== Number(survey)) return false;
    if (department !== "all" && f.department !== department) return false;
    if (program !== "all" && f.program !== program) return false;
    if (semester !== "all" && String(f.semester ?? "") !== String(semester)) return false;
    if (course !== "all" && f.course !== course) return false;
    if (teacher !== "all" && f.teacher !== teacher) return false;
    if (status !== "all" && f.status !== status) return false;
    if (from && new Date(f.submittedAt) < new Date(from)) return false;
    if (to && new Date(f.submittedAt) > new Date(`${to}T23:59:59`)) return false;
    return true;
  }), [allFeedback, rating, survey, department, program, semester, course, teacher, status, from, to]);

  const sentiment = filtered.length === 0 ? 0 :
    (filtered.reduce((s, f) => s + f.rating, 0) / filtered.length).toFixed(2);

  const resetFilters = () => {
    setRating("all"); setSurvey("all"); setDepartment("all"); setProgram("all");
    setSemester("all"); setCourse("all"); setTeacher("all"); setStatus("all");
    setFrom(""); setTo("");
  };

  return (
    <div>
      <PageHeader title="Anonymous Feedback" subtitle="Read all anonymous student feedback — completely confidential" icon="MessageSquare" breadcrumb={["QEC", "Feedback"]}
        actions={<ExportButtons title="Anonymous Feedback" columns={[
          { key: "anonymous", label: "Student" },
          { key: "course", label: "Course" },
          { key: "teacher", label: "Teacher" },
          { key: "rating", label: "Rating" },
          { key: "status", label: "Status" },
          { key: "text", label: "Comment" },
        ]} rows={filtered} filename="anonymous_feedback" />} />

      {/* SMART FILTERS */}
      <div className="card-base p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-app flex items-center gap-2"><Filter size={14} /> Smart Filters</h3>
          <button onClick={resetFilters} className="text-xs font-semibold text-muted-app hover:text-app flex items-center gap-1">
            <RotateCcw size={12} /> Reset
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Department</label>
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className="input-base py-2 text-sm w-full">
              <option value="all">All</option>
              {opts.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Program</label>
            <select value={program} onChange={(e) => setProgram(e.target.value)} className="input-base py-2 text-sm w-full">
              <option value="all">All</option>
              {opts.programs.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Semester</label>
            <select value={semester} onChange={(e) => setSemester(e.target.value)} className="input-base py-2 text-sm w-full">
              <option value="all">All</option>
              {opts.semesters.map((s) => <option key={s} value={s}>Semester {s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Course</label>
            <select value={course} onChange={(e) => setCourse(e.target.value)} className="input-base py-2 text-sm w-full">
              <option value="all">All</option>
              {opts.courses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Teacher</label>
            <select value={teacher} onChange={(e) => setTeacher(e.target.value)} className="input-base py-2 text-sm w-full">
              <option value="all">All</option>
              {opts.teachers.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Survey</label>
            <select value={survey} onChange={(e) => setSurvey(e.target.value)} className="input-base py-2 text-sm w-full">
              <option value="all">All Surveys</option>
              {surveys.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Rating</label>
            <select value={rating} onChange={(e) => setRating(e.target.value)} className="input-base py-2 text-sm w-full">
              <option value="all">All Ratings</option>
              {[5,4,3,2,1].map((r) => <option key={r} value={r}>{r} ★ only</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-base py-2 text-sm w-full">
              <option value="all">All</option>
              {opts.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">From Date</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-base py-2 text-sm w-full" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">To Date</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-base py-2 text-sm w-full" />
          </div>
          <div className="col-span-2 flex items-end">
            <div className="px-4 py-2 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/60 w-full">
              <p className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300">Sentiment</p>
              <p className="font-bold text-purple-800 dark:text-purple-200">{sentiment} ★ · {filtered.length} replies</p>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="card-base p-12 text-center text-muted-app">No feedback matches the selected filters</div>
          ) : filtered.map((f) => (
            <div key={f.id} className="card-base p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">{f.anonymous}</span>
                    {f.department && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">{f.department}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-app">
                    {f.surveyTitle}
                    {f.course ? ` · ${f.course}` : ""}{f.teacher ? ` · ${f.teacher}` : ""}
                  </p>
                </div>
                <span className="text-amber-500">{"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}</span>
              </div>
              <p className="text-sm text-app italic">"{f.text}"</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Feedback;

import { motion } from "framer-motion";
import {
  FileText, Users, Award, ArrowRight, BookOpen, ClipboardList, Search,
  GraduationCap, CheckCircle2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/common/PageHeader";
import Badge from "../../components/common/Badge";
import StatCard from "../../components/common/StatCard";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

/* =========================================================================
 * TEACHER → Mid / Final Term Examinations (real data)
 * ---------------------------------------------------------------------------
 * There is no dedicated "exam" entity in the LMS backend. Term exams are
 * authored as offering assignments/quizzes and graded through each course's
 * Gradebook. This page aggregates the teacher's courses (with their exam
 * assessment + results status from the real `history` endpoint) and routes
 * into the per-course management screens to author papers and publish marks.
 * ======================================================================= */

const TeacherExam = ({ kind = "Mid" }) => {
  const navigate = useNavigate();
  const lower = kind.toLowerCase();

  const history = useApi(() => api.teacher.history(), []);
  const assignmentsApi = useApi(() => api.teacher.allAssignments(), []);

  const [search, setSearch] = useState("");

  const loading = history.loading || assignmentsApi.loading;
  const error = history.error || assignmentsApi.error;

  const courses = useMemo(() => history.data?.courses || [], [history.data]);
  const assignments = useMemo(() => assignmentsApi.data?.assignments || [], [assignmentsApi.data]);

  // Per-offering exam assessment summary (assignments whose title mentions this term)
  const examsByOffering = useMemo(() => {
    const map = {};
    const termRe = new RegExp(`${lower}`, "i");
    for (const a of assignments) {
      if (!termRe.test(a.title || "")) continue;
      if (!map[a.offeringId]) map[a.offeringId] = { count: 0, submissions: 0, pending: 0 };
      map[a.offeringId].count += 1;
      map[a.offeringId].submissions += a.submissionCount || 0;
      map[a.offeringId].pending += a.pendingGrading || 0;
    }
    return map;
  }, [assignments, lower]);

  const activeCourses = useMemo(() => courses.filter((c) => c.isActive), [courses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeCourses.filter((c) => !q || `${c.courseCode} ${c.courseTitle}`.toLowerCase().includes(q));
  }, [activeCourses, search]);

  const stats = useMemo(() => {
    const examOfferings = Object.keys(examsByOffering).length;
    const totalSubs = Object.values(examsByOffering).reduce((s, e) => s + e.submissions, 0);
    const pending = Object.values(examsByOffering).reduce((s, e) => s + e.pending, 0);
    const published = activeCourses.filter((c) => c.resultsPublished).length;
    return { courses: activeCourses.length, examOfferings, totalSubs, pending, published };
  }, [examsByOffering, activeCourses]);

  if (loading) {
    return (
      <div>
        <PageHeader title={`${kind} Term Examinations`} subtitle={`Author papers and publish ${lower}-term results`} icon="FileText" breadcrumb={["Dashboard", `${kind} Term Exam`]} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${kind} Term Examinations`}
        subtitle={`Author exam papers, grade submissions and publish ${lower}-term results per course`}
        icon="FileText"
        breadcrumb={["Dashboard", `${kind} Term Exam`]}
      />

      {error ? (
        <ErrorState description={error} onRetry={() => { history.reload(); assignmentsApi.reload(); }} />
      ) : activeCourses.length === 0 ? (
        <EmptyState
          icon="FileText"
          title="No active courses"
          description="You have no active course offerings this term, so there are no exams to manage."
        />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard title="Active Courses" value={stats.courses} icon="BookOpen" color="blue" delay={0} />
            <StatCard title={`${kind}-Term Papers`} value={stats.examOfferings} icon="FileText" color="purple" delay={0.05} />
            <StatCard title="Submissions" value={stats.totalSubs} icon="Users" color="indigo" delay={0.1} />
            <StatCard title="Results Published" value={stats.published} icon="CheckCircle2" color="emerald" delay={0.15} />
          </div>

          {/* Info banner */}
          <div className="mb-5 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
            <GraduationCap size={15} className="mt-0.5 shrink-0" />
            <div>
              Create the <b>{kind}-Term</b> paper as an assignment or quiz inside a course, then enter and publish marks from the course <b>Gradebook</b>. Use the buttons below to jump straight to each course.
            </div>
          </div>

          {/* Search */}
          <div className="card-base p-3 mb-5">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search course..." className="input-base w-full pl-9 text-sm" />
            </div>
          </div>

          {/* Course cards */}
          {filtered.length === 0 ? (
            <div className="card-base p-12 text-center">
              <BookOpen size={40} className="mx-auto text-muted-app mb-3" />
              <p className="font-semibold text-app">No courses match your search</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((c, i) => {
                const ex = examsByOffering[c.offeringId] || { count: 0, submissions: 0, pending: 0 };
                return (
                  <motion.div
                    key={c.offeringId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.3) }}
                    className="card-base p-4 flex flex-col md:flex-row md:items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow shrink-0">
                      <FileText size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] text-primary-600 dark:text-primary-400">{c.courseCode}</span>
                        {c.resultsPublished ? <Badge color="emerald">Results Published</Badge> : <Badge color="amber">Results Pending</Badge>}
                        {ex.pending > 0 && <Badge color="rose">{ex.pending} to grade</Badge>}
                      </div>
                      <p className="font-bold text-app truncate mt-0.5">{c.courseTitle}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-app flex-wrap">
                        <span className="inline-flex items-center gap-1"><Users size={12} /> {c.students || 0} students</span>
                        <span className="inline-flex items-center gap-1"><ClipboardList size={12} /> {ex.count} {kind}-term paper{ex.count !== 1 ? "s" : ""}</span>
                        <span className="inline-flex items-center gap-1"><Award size={12} /> {ex.submissions} submission{ex.submissions !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button onClick={() => navigate(`/teacher/offerings/${c.offeringId}?tab=assignments`)} className="px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-bold hover:bg-primary-700">
                        <FileText size={12} className="inline mr-1" /> Author Paper
                      </button>
                      <button onClick={() => navigate(`/teacher/offerings/${c.offeringId}?tab=gradebook`)} className="px-3 py-2 rounded-lg border border-app text-app text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800">
                        <Award size={12} className="inline mr-1" /> Gradebook
                      </button>
                      <button onClick={() => navigate(`/teacher/offerings/${c.offeringId}?tab=quizzes`)} className="px-3 py-2 rounded-lg border border-app text-app text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800">
                        <ArrowRight size={12} className="inline mr-1" /> Quizzes
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TeacherExam;

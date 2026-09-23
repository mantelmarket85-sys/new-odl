import { motion } from "framer-motion";
import {
  HelpCircle, Users, Award, Clock, CheckCircle2, ListChecks,
  Search, Filter, ArrowRight, BookOpen,
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

const TeacherQuizzes = () => {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.teacher.allQuizzes(), []);

  const quizzes = useMemo(() => data?.quizzes || [], [data]);

  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // all | published | draft

  const courses = useMemo(() => {
    const map = {};
    for (const q of quizzes) if (!map[q.courseCode]) map[q.courseCode] = q.courseTitle;
    return Object.entries(map).map(([code, title]) => ({ code, title }));
  }, [quizzes]);

  const stats = useMemo(() => ({
    total: quizzes.length,
    published: quizzes.filter((q) => q.isPublished).length,
    questions: quizzes.reduce((s, q) => s + (q.questionCount || 0), 0),
    attempts: quizzes.reduce((s, q) => s + (q.attemptCount || 0), 0),
  }), [quizzes]);

  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return quizzes.filter((q) => {
      if (courseFilter !== "all" && q.courseCode !== courseFilter) return false;
      if (statusFilter === "published" && !q.isPublished) return false;
      if (statusFilter === "draft" && q.isPublished) return false;
      if (text && !`${q.title} ${q.courseCode} ${q.courseTitle}`.toLowerCase().includes(text)) return false;
      return true;
    });
  }, [quizzes, search, courseFilter, statusFilter]);

  const goManage = (q) => navigate(`/teacher/offerings/${q.offeringId}?tab=quizzes`);

  if (loading) {
    return (
      <div>
        <PageHeader title="Quizzes" subtitle="All quizzes across your courses" icon="HelpCircle" breadcrumb={["Teacher", "Quizzes"]} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Quizzes"
        subtitle="All quizzes across your courses — open a course to build or grade"
        icon="HelpCircle"
        breadcrumb={["Teacher", "Quizzes"]}
      />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : quizzes.length === 0 ? (
        <EmptyState
          icon="HelpCircle"
          title="No quizzes yet"
          description="You haven't created any quizzes. Open a course offering to create your first quiz."
        />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard title="Total Quizzes" value={stats.total} icon="HelpCircle" color="purple" delay={0} />
            <StatCard title="Published" value={stats.published} icon="CheckCircle2" color="emerald" delay={0.05} />
            <StatCard title="Questions" value={stats.questions} icon="ListChecks" color="blue" delay={0.1} />
            <StatCard title="Attempts" value={stats.attempts} icon="Users" color="amber" delay={0.15} />
          </div>

          {/* Filters */}
          <div className="card-base p-4 mb-5">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Course</label>
                <div className="relative">
                  <BookOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="input-base w-full pl-9 text-sm">
                    <option value="all">All Courses</option>
                    {courses.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.title}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Status</label>
                <div className="relative">
                  <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-base w-full pl-9 text-sm">
                    <option value="all">All</option>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Search</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quiz or course..." className="input-base w-full pl-9 text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="card-base p-12 text-center">
              <HelpCircle size={40} className="mx-auto text-muted-app mb-3" />
              <p className="font-semibold text-app">No quizzes match your filters</p>
              <p className="text-xs text-muted-app mt-1">Try a different course, status or search.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((q, i) => (
                <motion.button
                  key={q.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  onClick={() => goManage(q)}
                  className="w-full text-left card-base p-4 flex items-center gap-4 hover:shadow-lg transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 text-white flex items-center justify-center shadow shrink-0">
                    <HelpCircle size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-primary-600 dark:text-primary-400">{q.courseCode}</span>
                      <Badge color={q.isPublished ? "emerald" : "slate"}>{q.isPublished ? "Published" : "Draft"}</Badge>
                    </div>
                    <p className="font-bold text-app truncate mt-0.5">{q.title}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-app flex-wrap">
                      <span className="inline-flex items-center gap-1"><Award size={12} /> {q.totalMarks ?? 0} marks</span>
                      <span className="inline-flex items-center gap-1"><ListChecks size={12} /> {q.questionCount || 0} question{(q.questionCount || 0) !== 1 ? "s" : ""}</span>
                      {q.durationMin ? <span className="inline-flex items-center gap-1"><Clock size={12} /> {q.durationMin} min</span> : null}
                      <span className="inline-flex items-center gap-1"><Users size={12} /> {q.attemptCount || 0} attempt{(q.attemptCount || 0) !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 text-primary-600 dark:text-primary-400 text-sm font-semibold">
                    <span className="hidden sm:inline">Manage</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TeacherQuizzes;

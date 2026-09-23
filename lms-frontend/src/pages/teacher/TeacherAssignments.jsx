import { motion } from "framer-motion";
import {
  FileText, Users, Calendar, Award, ClipboardList, CheckCircle2, Clock,
  Search, Filter, ArrowRight, AlertCircle, BookOpen,
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

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
};
const isOverdue = (d) => {
  if (!d) return false;
  const due = new Date(d);
  return !isNaN(due) && due < new Date();
};

const TeacherAssignments = () => {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => api.teacher.allAssignments(), []);

  const assignments = useMemo(() => data?.assignments || [], [data]);

  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // all | published | draft | grading

  const courses = useMemo(() => {
    const map = {};
    for (const a of assignments) if (!map[a.courseCode]) map[a.courseCode] = a.courseTitle;
    return Object.entries(map).map(([code, title]) => ({ code, title }));
  }, [assignments]);

  const stats = useMemo(() => {
    return {
      total: assignments.length,
      published: assignments.filter((a) => a.isPublished).length,
      submissions: assignments.reduce((s, a) => s + (a.submissionCount || 0), 0),
      pending: assignments.reduce((s, a) => s + (a.pendingGrading || 0), 0),
    };
  }, [assignments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments.filter((a) => {
      if (courseFilter !== "all" && a.courseCode !== courseFilter) return false;
      if (statusFilter === "published" && !a.isPublished) return false;
      if (statusFilter === "draft" && a.isPublished) return false;
      if (statusFilter === "grading" && !(a.pendingGrading > 0)) return false;
      if (q && !`${a.title} ${a.courseCode} ${a.courseTitle}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [assignments, search, courseFilter, statusFilter]);

  const goManage = (a) => navigate(`/teacher/offerings/${a.offeringId}?tab=assignments`);

  if (loading) {
    return (
      <div>
        <PageHeader title="Assignments" subtitle="All assignments across your courses" icon="ClipboardList" breadcrumb={["Teacher", "Assignments"]} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Assignments"
        subtitle="All assignments across your courses — open a course to create or grade"
        icon="ClipboardList"
        breadcrumb={["Teacher", "Assignments"]}
      />

      {error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : assignments.length === 0 ? (
        <EmptyState
          icon="ClipboardList"
          title="No assignments yet"
          description="You haven't created any assignments. Open a course offering to create your first assignment."
        />
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard title="Total Assignments" value={stats.total} icon="ClipboardList" color="blue" delay={0} />
            <StatCard title="Published" value={stats.published} icon="CheckCircle2" color="emerald" delay={0.05} />
            <StatCard title="Submissions" value={stats.submissions} icon="Users" color="indigo" delay={0.1} />
            <StatCard title="Pending Grading" value={stats.pending} icon="Clock" color="amber" delay={0.15} />
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
                    <option value="grading">Needs Grading</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Search</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app pointer-events-none" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assignment or course..." className="input-base w-full pl-9 text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div className="card-base p-12 text-center">
              <ClipboardList size={40} className="mx-auto text-muted-app mb-3" />
              <p className="font-semibold text-app">No assignments match your filters</p>
              <p className="text-xs text-muted-app mt-1">Try a different course, status or search.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((a, i) => {
                const overdue = isOverdue(a.dueDate);
                return (
                  <motion.button
                    key={a.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    onClick={() => goManage(a)}
                    className="w-full text-left card-base p-4 flex items-center gap-4 hover:shadow-lg transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow shrink-0">
                      <FileText size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] text-primary-600 dark:text-primary-400">{a.courseCode}</span>
                        <Badge color={a.isPublished ? "emerald" : "slate"}>{a.isPublished ? "Published" : "Draft"}</Badge>
                        {a.pendingGrading > 0 && <Badge color="amber">{a.pendingGrading} to grade</Badge>}
                        {overdue && a.isPublished && <Badge color="rose">Overdue</Badge>}
                      </div>
                      <p className="font-bold text-app truncate mt-0.5">{a.title}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-app flex-wrap">
                        <span className="inline-flex items-center gap-1"><Award size={12} /> {a.totalMarks ?? 0} marks</span>
                        <span className="inline-flex items-center gap-1"><Calendar size={12} /> Due {fmtDate(a.dueDate)}</span>
                        <span className="inline-flex items-center gap-1"><Users size={12} /> {a.submissionCount || 0} submission{(a.submissionCount || 0) !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2 text-primary-600 dark:text-primary-400 text-sm font-semibold">
                      <span className="hidden sm:inline">Manage</span>
                      <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TeacherAssignments;

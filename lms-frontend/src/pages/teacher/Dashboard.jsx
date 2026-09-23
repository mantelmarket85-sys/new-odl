import { motion } from "framer-motion";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users, BookOpen, FileText, FileQuestion, Award, CalendarCheck, ArrowRight, ClipboardCheck } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Badge from "../../components/common/Badge";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

const FEATURES = [
  { label: "My Courses", icon: BookOpen, to: "/teacher/subjects", color: "from-blue-500 to-indigo-600" },
  { label: "Assignments", icon: FileText, to: "/teacher/assignments", color: "from-amber-500 to-orange-600" },
  { label: "Quizzes", icon: FileQuestion, to: "/teacher/quizzes", color: "from-emerald-500 to-teal-600" },
  { label: "Attendance", icon: CalendarCheck, to: "/teacher/attendance", color: "from-fuchsia-500 to-purple-600" },
  { label: "Marks & Results", icon: Award, to: "/teacher/marks", color: "from-cyan-500 to-blue-600" },
  { label: "Students", icon: Users, to: "/teacher/students", color: "from-rose-500 to-pink-600" },
];

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => api.teacher.dashboard(), []);

  const stats = data?.stats || {};
  const offerings = useMemo(() => data?.offerings || [], [data]);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name || user?.username || "Instructor"}`}
        subtitle="Manage your courses, assessments, attendance and grades"
        icon="LayoutDashboard"
        breadcrumb={["Dashboard"]}
      />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title="My Courses" value={stats.offeringsCount ?? 0} icon="BookOpen" color="blue" onClick={() => navigate("/teacher/subjects")} />
            <StatCard title="Total Students" value={stats.totalStudents ?? 0} icon="Users" color="emerald" delay={0.05} onClick={() => navigate("/teacher/students")} />
            <StatCard title="Pending Grading" value={stats.pendingGrading ?? 0} icon="ClipboardCheck" color="amber" delay={0.1} onClick={() => navigate("/teacher/assignments")} />
            <StatCard title="Quiz Reviews" value={stats.pendingQuizGrading ?? 0} icon="FileQuestion" color="purple" delay={0.15} onClick={() => navigate("/teacher/quizzes")} />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 mb-6">
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {FEATURES.map((f, i) => (
                <motion.button
                  key={f.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => navigate(f.to)}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-primary-300 hover:shadow-md transition group"
                >
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${f.color} text-white group-hover:scale-110 transition`}>
                    <f.icon size={20} />
                  </div>
                  <span className="text-xs font-semibold text-app text-center">{f.label}</span>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">My Course Offerings</h3>
              <button onClick={() => navigate("/teacher/subjects")} className="text-primary-600 text-sm font-semibold hover:underline">View all →</button>
            </div>
            {offerings.length === 0 ? (
              <EmptyState icon="BookOpen" title="No courses assigned" description="You have not been assigned to teach any course offerings yet." className="py-8" />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {offerings.map((o, i) => (
                  <motion.button
                    key={o.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => navigate(`/teacher/offerings/${o.id}`)}
                    className="text-left p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-primary-300 hover:shadow-md transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-primary-600">{o.course?.code}</span>
                      <Badge color="blue" size="sm">{o._count?.registrations ?? 0} students</Badge>
                    </div>
                    <h4 className="font-bold text-app mt-1 leading-tight">{o.course?.title}</h4>
                    <p className="text-xs text-muted-app mt-1">{o.term?.title}</p>
                    <p className="mt-2 text-primary-600 text-xs font-semibold inline-flex items-center gap-1">Manage <ArrowRight size={12} /></p>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TeacherDashboard;

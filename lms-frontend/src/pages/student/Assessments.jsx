import PageHeader from "../../components/common/PageHeader";
import { ClipboardList, FileText, FileQuestion, Award } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const Assessments = () => {
  const items = [
    { title: "Assignments", desc: "View and submit course assignments", icon: FileText, to: "/student/assignments", color: "from-amber-500 to-orange-600", count: "6 active" },
    { title: "Quizzes", desc: "Take online timed quizzes", icon: FileQuestion, to: "/student/quizzes", color: "from-emerald-500 to-teal-600", count: "2 available" },
    { title: "Mid-Term Exams", desc: "Mid-semester examinations", icon: ClipboardList, to: "#", color: "from-blue-500 to-indigo-600", count: "Dec 18-25" },
    { title: "Final Exams", desc: "End of semester finals", icon: Award, to: "#", color: "from-rose-500 to-pink-600", count: "Jan 15-30" },
  ];
  return (
    <div>
      <PageHeader title="Academic Progress" subtitle="All your evaluations in one place" icon="ClipboardList" breadcrumb={["Dashboard", "Academic Progress"]} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((it, i) => (
          <motion.div key={it.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Link to={it.to} className={`block bg-gradient-to-br ${it.color} rounded-2xl p-5 text-white shadow-lg hover:shadow-2xl hover:-translate-y-1 transition`}>
              <it.icon size={28} className="mb-3" />
              <p className="font-display font-bold text-xl">{it.title}</p>
              <p className="text-xs opacity-90 mt-1">{it.desc}</p>
              <p className="mt-3 inline-block px-2 py-1 bg-white/20 rounded-lg text-xs font-bold">{it.count}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Assessments;

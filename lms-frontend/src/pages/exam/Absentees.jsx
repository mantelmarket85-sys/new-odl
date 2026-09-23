import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { UserX, Search, Download } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import StatusBadge from "../../components/common/StatusBadge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import DeptSmartFilter, { ALL_DEPTS, filterByDept, collectDepartments } from "../../components/common/DeptSmartFilter";

const ExamAbsentees = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.exam.report("absentees"), []);
  const rows = useMemo(() => data?.rows || [], [data]);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState(ALL_DEPTS);

  const departments = useMemo(
    () => collectDepartments({ options: data?.departments || [], rows }),
    [data, rows],
  );

  const filtered = useMemo(() => {
    let list = filterByDept(rows, dept);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => [r.student, r.course, r.component].filter(Boolean).some((v) => v.toLowerCase().includes(q)));
    }
    return list;
  }, [rows, search, dept]);

  const exportCsv = () => {
    if (!rows.length) { toast?.("Nothing to export", { type: "info" }); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${r[h] ?? ""}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "absentees.csv"; a.click();
    URL.revokeObjectURL(url); toast?.("Absentee list exported", { type: "success" });
  };

  return (
    <div>
      <PageHeader
        title="Exam Absentees"
        subtitle="Students marked absent for an exam component this term."
        icon="UserX"
        breadcrumb={["Exam Controller", "Absentees"]}
        actions={<button onClick={exportCsv} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2"><Download size={14} /> Export CSV</button>}
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
            <StatCard title="Absentees" value={rows.length} icon="UserX" color="rose" delay={0.05} />
            <StatCard title="Courses" value={new Set(rows.map((r) => r.course)).size} icon="BookOpen" color="blue" delay={0.1} />
            <StatCard title="Term" value={data?.term || "—"} icon="Calendar" color="purple" delay={0.15} />
          </div>

          <div className="card-base p-3 mb-5 flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student / course…" className="input-base w-full pl-10 text-sm" />
            </div>
            <DeptSmartFilter value={dept} onChange={setDept} departments={departments} />
          </div>

          <div className="card-base overflow-hidden">
            {filtered.length === 0 ? <EmptyState message="No absentees recorded this term." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="surface border-b border-app">
                    <tr>
                      {["Student", "Department", "Course", "Component", "Status"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {filtered.map((r, i) => (
                      <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.4) }} className="hover:surface">
                        <td className="px-4 py-2 text-xs font-semibold text-app">{r.student}</td>
                        <td className="px-4 py-2">
                          {r.department ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">{r.department}</span> : <span className="text-[11px] text-muted-app">—</span>}
                        </td>
                        <td className="px-4 py-2 text-xs text-app">{r.course}</td>
                        <td className="px-4 py-2 text-xs text-muted-app">{r.component}</td>
                        <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ExamAbsentees;

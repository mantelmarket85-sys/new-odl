import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Search, Download } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import StatusBadge from "../../components/common/StatusBadge";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import CascadeFilters, { emptyCascade, applyCascade } from "../../components/common/CascadeFilters";

const ExamProbation = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.exam.report("probation"), []);
  const rows = useMemo(() => data?.rows || [], [data]);
  const [search, setSearch] = useState("");
  const [cascade, setCascade] = useState(emptyCascade());

  const filtered = useMemo(() => {
    // 1.9 — cascading smart filters (department → program, plus session / batch)
    let out = applyCascade(rows, cascade, (r) => ({
      department: r.department,
      program: r.program,
      session: r.session,
      batch: r.batch,
    }));
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) => [r.name, r.roll].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
    }
    return out;
  }, [rows, search, cascade]);

  const exportCsv = () => {
    if (!filtered.length) { toast?.("Nothing to export", { type: "info" }); return; }
    const headers = Object.keys(filtered[0]);
    const csv = [headers.join(","), ...filtered.map((r) => headers.map((h) => `"${r[h] ?? ""}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "probation-list.csv"; a.click();
    URL.revokeObjectURL(url); toast?.("Probation list exported", { type: "success" });
  };

  return (
    <div>
      <PageHeader
        title="Academic Probation"
        subtitle="Students whose CGPA falls below the minimum academic threshold."
        icon="AlertTriangle"
        breadcrumb={["Exam Controller", "Probation"]}
        actions={<button onClick={exportCsv} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2"><Download size={14} /> Export CSV</button>}
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
            <StatCard title="On Probation" value={filtered.length} icon="AlertTriangle" color="rose" delay={0.05} />
            <StatCard title="Avg CGPA" value={filtered.length ? (filtered.reduce((s, r) => s + (r.cgpa || 0), 0) / filtered.length).toFixed(2) : "0.00"} icon="TrendingDown" color="amber" delay={0.1} />
            <StatCard title="Term" value={data?.term || "—"} icon="Calendar" color="blue" delay={0.15} />
          </div>

          {/* 1.9 — reusable cascading smart filters */}
          <CascadeFilters
            className="mb-4"
            value={cascade}
            onChange={setCascade}
            fields={["department", "program", "session", "batch"]}
            extraRows={rows}
            rowMap={(r) => ({ department: r.department, session: r.session, batch: r.batch })}
          />

          <div className="card-base p-3 mb-5">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student / roll…" className="input-base w-full pl-10 text-sm" />
            </div>
          </div>

          <div className="card-base overflow-hidden">
            {filtered.length === 0 ? <EmptyState message="No students on academic probation." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="surface border-b border-app">
                    <tr>
                      {["Roll", "Name", "Program", "Session", "CGPA", "Credits", "Status"].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {filtered.map((r, i) => (
                      <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.03, 0.4) }} className="hover:surface">
                        <td className="px-4 py-2 text-xs font-mono text-muted-app">{r.roll}</td>
                        <td className="px-4 py-2 text-xs font-semibold text-app">{r.name}</td>
                        <td className="px-4 py-2 text-xs text-app">{r.program || "—"}</td>
                        <td className="px-4 py-2 text-xs text-muted-app">{r.session || "—"}</td>
                        <td className="px-4 py-2 text-xs font-bold text-rose-600 dark:text-rose-400">{r.cgpa?.toFixed?.(2) ?? r.cgpa}</td>
                        <td className="px-4 py-2 text-xs text-app">{r.totalCredits}</td>
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

export default ExamProbation;

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ScrollText, Search, Filter, Download, Activity,
  ClipboardCheck, GraduationCap, FileText, Calendar,
  UserCheck, DollarSign, Award, Cog, ClipboardList, UserX,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import Badge from "../../components/common/Badge";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import { useToast } from "../../context/ToastContext";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

/* =========================================================================
 * Provost → Activity Logs
 *
 *   - Categorized activity logs across the LMS (live audit trail)
 *   - Filterable by category & user with search
 *   - Visual category strip with counters
 * ======================================================================= */

const CATEGORIES = [
  { id: "all",        label: "All",          color: "slate",   icon: Activity },
  { id: "enrollment", label: "Enrollment",   color: "blue",    icon: ClipboardCheck },
  { id: "result",     label: "Results",      color: "emerald", icon: Award },
  { id: "attendance", label: "Attendance",   color: "cyan",    icon: Calendar },
  { id: "teacher",    label: "Teacher",      color: "indigo",  icon: GraduationCap },
  { id: "student",    label: "Student",      color: "violet",  icon: UserCheck },
  { id: "finance",    label: "Finance",      color: "amber",   icon: DollarSign },
  { id: "fee",        label: "Fee",          color: "amber",   icon: DollarSign },
  { id: "exam",       label: "Examination",  color: "rose",    icon: FileText },
  { id: "survey",     label: "Survey",       color: "purple",  icon: ClipboardList },
  { id: "qec",        label: "QEC",          color: "purple",  icon: ClipboardList },
  { id: "library",    label: "Library",      color: "teal",    icon: ScrollText },
  { id: "discipline", label: "Discipline",   color: "rose",    icon: UserX },
  { id: "system",     label: "System",       color: "slate",   icon: Cog },
];

const CATEGORY_BG = {
  enrollment: "from-blue-500 to-indigo-600",
  result:     "from-emerald-500 to-teal-600",
  attendance: "from-cyan-500 to-sky-600",
  teacher:    "from-indigo-500 to-blue-600",
  student:    "from-violet-500 to-purple-600",
  finance:    "from-amber-500 to-orange-600",
  fee:        "from-amber-500 to-orange-600",
  exam:       "from-rose-500 to-pink-600",
  survey:     "from-purple-500 to-fuchsia-600",
  qec:        "from-purple-500 to-fuchsia-600",
  library:    "from-teal-500 to-emerald-600",
  discipline: "from-rose-500 to-red-600",
  system:     "from-slate-500 to-slate-700",
};

const ProvostLogs = () => {
  const { toast } = useToast();
  const { data, loading, error, reload } = useApi(() => api.provost.audit("?limit=500"), []);
  const allLogs = useMemo(() => (data?.items || []).map((l) => ({
    ...l,
    action: l.action || "",
    target: l.target || "",
    user: l.user || "—",
    type: l.type || "system",
  })), [data]);

  const [category, setCategory] = useState("all");
  const [user, setUser] = useState("all");
  const [search, setSearch] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  const uniqueUsers = useMemo(
    () => Array.from(new Set(allLogs.map((l) => l.user))).sort(),
    [allLogs]
  );

  const counts = useMemo(() => {
    const m = { all: allLogs.length };
    CATEGORIES.forEach((c) => {
      if (c.id === "all") return;
      m[c.id] = allLogs.filter((l) => l.type === c.id).length;
    });
    return m;
  }, [allLogs]);

  const filtered = useMemo(() => {
    return allLogs.filter((l) => {
      if (category !== "all" && l.type !== category) return false;
      if (user !== "all" && l.user !== user) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !l.action.toLowerCase().includes(q) &&
          !l.target.toLowerCase().includes(q) &&
          !l.user.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [category, user, search]);

  const exportCSV = () => {
    const rows = [
      ["Timestamp", "User", "Category", "Action", "Target"],
      ...filtered.map((l) => [l.timestamp, l.user, l.type, l.action, l.target]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "activity_logs.csv";
    a.click();
    toast("Exported activity logs", { type: "success" });
  };

  return (
    <div>
      <PageHeader
        title="Activity Logs"
        subtitle={`University-wide audit trail · ${allLogs.length} events across ${CATEGORIES.length - 1} categories`}
        icon="ScrollText"
        breadcrumb={["Provost", "Activity Logs"]}
        actions={
          <button onClick={exportCSV} className="btn-secondary text-sm py-2 px-3 flex items-center gap-2">
            <Download size={14} /> Export CSV
          </button>
        }
      />

      {/* Stat strip — top-level numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard title="Total Events"     value={allLogs.length}        icon="Activity"       color="violet" delay={0.05} />
        <StatCard title="Today"            value={allLogs.filter((l) => l.timestamp.startsWith("2025-01-12")).length} icon="Calendar" color="blue" delay={0.1} />
        <StatCard title="Unique Users"     value={uniqueUsers.length}    icon="UserCheck"      color="emerald" delay={0.15} />
        <StatCard title="Categories"       value={CATEGORIES.length - 1} icon="Filter"         color="amber"   delay={0.2} />
      </div>

      {/* Category strip — visual filter */}
      <div className="card-base p-3 mb-5 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            const n = counts[c.id] || 0;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition border ${
                  active
                    ? "bg-primary-600 text-white border-primary-600 shadow shadow-primary-500/30"
                    : "surface border-app text-app hover:border-primary-300 dark:hover:border-primary-700"
                }`}
              >
                <Icon size={13} />
                {c.label}
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                    active ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800 text-muted-app"
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Secondary filters */}
      <div className="card-base p-3 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-app" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action, target, or user..."
            className="input-base w-full pl-9 text-sm"
          />
        </div>
        <select value={user} onChange={(e) => setUser(e.target.value)} className="input-base text-sm">
          <option value="all">All Users</option>
          {uniqueUsers.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* Logs table */}
      <div className="card-base overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="surface border-b border-app">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">Timestamp</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">User</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">Category</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">Action</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-sm text-muted-app">
                    <ScrollText className="mx-auto mb-2" size={26} />
                    No activity matches your filters.
                  </td>
                </tr>
              )}
              {filtered.map((l, i) => {
                const cat = CATEGORIES.find((c) => c.id === l.type) || CATEGORIES[0];
                return (
                  <motion.tr
                    key={l.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:surface transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-muted-app font-mono whitespace-nowrap">
                      {l.timestamp}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${CATEGORY_BG[l.type] || CATEGORY_BG.system} text-white text-[10px] font-bold flex items-center justify-center`}>
                          {l.user.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                        </div>
                        <span className="text-xs font-semibold text-app">{l.user}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={cat.color}>{cat.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-app">{l.action}</td>
                    <td className="px-4 py-3 text-xs text-muted-app">{l.target}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProvostLogs;

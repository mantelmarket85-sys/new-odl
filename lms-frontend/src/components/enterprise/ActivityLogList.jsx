import { useState, useMemo } from "react";
import { ScrollText, User, Clock, Activity, Filter } from "lucide-react";
import EnterpriseTable from "./EnterpriseTable";
import ExportButtons from "./ExportButtons";

/* =========================================================================
 * <ActivityLogList /> — uniform activity-log surface for every role.
 *
 * Props:
 *   logs: [{ id, timestamp, user, type, action, target }]
 *   title?: string
 * ======================================================================= */
const TYPE_COLORS = {
  enrollment: "blue",
  attendance: "emerald",
  result:     "amber",
  student:    "cyan",
  teacher:    "violet",
  system:     "slate",
  finance:    "green",
  exam:       "rose",
  survey:     "purple",
};

const ActivityLogList = ({ logs = [], title = "Activity Logs" }) => {
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(
    () => typeFilter === "all" ? logs : logs.filter((l) => l.type === typeFilter),
    [typeFilter, logs]
  );

  const types = useMemo(() => {
    const set = new Set(logs.map((l) => l.type));
    return Array.from(set);
  }, [logs]);

  const columns = [
    { key: "timestamp", label: "Timestamp", render: (v) => (
      <span className="inline-flex items-center gap-1 text-xs text-muted-app">
        <Clock size={11} /> {v}
      </span>
    )},
    { key: "user", label: "User", render: (v) => (
      <span className="inline-flex items-center gap-1.5 font-bold text-app text-sm">
        <User size={12} /> {v}
      </span>
    )},
    { key: "type", label: "Type", render: (v) => {
      const c = TYPE_COLORS[v] || "slate";
      return (
        <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-${c}-100 text-${c}-700 dark:bg-${c}-950/40 dark:text-${c}-300`}>
          {v}
        </span>
      );
    }},
    { key: "action", label: "Action" },
    { key: "target", label: "Target", render: (v) => <span className="text-muted-app text-xs">{v}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="card-base p-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText size={18} className="text-primary-600 dark:text-primary-400" />
          <h2 className="font-display font-bold text-lg text-app">{title}</h2>
          <span className="text-xs text-muted-app">· {filtered.length} entries</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-muted-app" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input-base py-1.5 px-2 text-xs"
            >
              <option value="all">All Types</option>
              {types.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <ExportButtons title={title} columns={columns} rows={filtered} filename={title} />
        </div>
      </div>
      <EnterpriseTable columns={columns} rows={filtered} pageSize={15} />
    </div>
  );
};

export default ActivityLogList;

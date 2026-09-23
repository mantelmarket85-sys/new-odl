import Badge from "./Badge";

const STATUS_MAP = {
  Pending: { color: "amber", dot: true },
  "Under Review": { color: "blue", dot: true },
  Approved: { color: "emerald", dot: false },
  Rejected: { color: "rose", dot: false },
  Resolved: { color: "emerald", dot: false },
  Active: { color: "emerald", dot: true },
  Inactive: { color: "slate", dot: false },
  Live: { color: "rose", dot: true },
  Upcoming: { color: "blue", dot: false },
  Completed: { color: "slate", dot: false },
  Submitted: { color: "blue", dot: false },
  Graded: { color: "emerald", dot: false },
  Late: { color: "rose", dot: false },
};

const StatusBadge = ({ status, size = "md", className = "" }) => {
  const cfg = STATUS_MAP[status] || { color: "slate", dot: false };
  return (
    <Badge color={cfg.color} size={size} dot={cfg.dot} className={className}>
      {status}
    </Badge>
  );
};

export default StatusBadge;

import { useMemo } from "react";
import ActivityLogList from "../../components/enterprise/ActivityLogList";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import useApi from "../../hooks/useApi";
import api from "../../services/api";

/* Map backend audit entity -> ActivityLogList visual type */
const ENTITY_TYPE = {
  Survey: "survey",
  SurveyResponse: "survey",
  QualityMetric: "result",
  ComplianceItem: "system",
  ImprovementPlan: "system",
  LmsAnnouncement: "teacher",
  LmsUser: "student",
};

const fmtTime = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

const QECLogs = () => {
  const { data, loading, error, reload } = useApi(() => api.qec.audit("?pageSize=200"), []);
  const items = data?.items || [];

  const logs = useMemo(
    () => items.map((r) => ({
      id: r.id,
      timestamp: fmtTime(r.time || r.timestamp),
      user: r.user || "System",
      type: ENTITY_TYPE[r.entity] || "system",
      action: r.action,
      target: r.entityId ? `${r.entity} #${r.entityId}` : r.entity,
    })),
    [items]
  );

  return (
    <div>
      <PageHeader title="Activity Logs" subtitle="Audit trail of all QEC actions" icon="ScrollText" breadcrumb={["QEC", "Activity Logs"]} />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <ActivityLogList logs={logs} title="QEC · Activity Log" />
      )}
    </div>
  );
};

export default QECLogs;

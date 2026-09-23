import ActivityLogList from "../../components/enterprise/ActivityLogList";
import PageHeader from "../../components/common/PageHeader";
import { activityLogs } from "../../data/enterpriseData";

const FinanceLogs = () => (
  <div>
    <PageHeader title="Activity Logs" subtitle="Audit trail of all finance-office actions" icon="ScrollText" breadcrumb={["Finance", "Activity Logs"]} />
    <ActivityLogList logs={activityLogs} title="Finance Office · Activity Log" />
  </div>
);

export default FinanceLogs;

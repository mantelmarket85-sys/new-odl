import React from 'react';

/**
 * Visual status badges + progress timeline pieces.
 *
 * Supported statuses (keep in sync with backend Application.status enum):
 *   SUBMITTED, UNDER_REVIEW, FORWARDED, RESULT_AWAITED,
 *   INTERVIEWED, INTERVIEW_COMPLETED, QUALIFIED, DISQUALIFIED,
 *   SELECTED, REJECTED, NEED_INFO,
 *   APPEAL_SUBMITTED, APPEAL_ACCEPTED, APPEAL_REJECTED,
 *   FEE_PENDING, FEE_PAID, FEE_APPROVED, ENROLLED, PENDING
 */
const STATUS_META = {
  PENDING:              { label: 'Pending',              color: '#6b7280', bg: '#f3f4f6', icon: '⌛' },
  SUBMITTED:            { label: 'Submitted',            color: '#1d4ed8', bg: '#dbeafe', icon: '📤' },
  UNDER_REVIEW:         { label: 'Under Review',         color: '#1e40af', bg: '#e0f2fe', icon: '🔍' },
  FORWARDED:            { label: 'Forwarded to Coordinator', color: '#0e7490', bg: '#cffafe', icon: '➡️' },
  RESULT_AWAITED:       { label: 'Result Awaited',       color: '#92400e', bg: '#fef3c7', icon: '⏳' },
  INTERVIEWED:          { label: 'Interview Scheduled',  color: '#7c3aed', bg: '#ede9fe', icon: '🗓️' },
  INTERVIEW_COMPLETED:  { label: 'Interview Completed',  color: '#5b21b6', bg: '#ede9fe', icon: '✅' },
  QUALIFIED:            { label: 'Qualified',            color: '#065f46', bg: '#d1fae5', icon: '⭐' },
  DISQUALIFIED:         { label: 'Disqualified',         color: '#991b1b', bg: '#fee2e2', icon: '✖️' },
  SELECTED:             { label: 'Merit Listed',         color: '#065f46', bg: '#d1fae5', icon: '🏆' },
  REJECTED:             { label: 'Rejected',             color: '#991b1b', bg: '#fee2e2', icon: '⛔' },
  NEED_INFO:            { label: 'Needs Update',         color: '#9a3412', bg: '#ffedd5', icon: '✍️' },
  APPEAL_SUBMITTED:     { label: 'Appeal Submitted',     color: '#7c2d12', bg: '#ffedd5', icon: '📨' },
  APPEAL_ACCEPTED:      { label: 'Appeal Accepted',      color: '#065f46', bg: '#d1fae5', icon: '✔️' },
  APPEAL_REJECTED:      { label: 'Appeal Rejected',      color: '#991b1b', bg: '#fee2e2', icon: '❌' },
  FEE_PENDING:          { label: 'Fee Pending',          color: '#92400e', bg: '#fef3c7', icon: '💰' },
  FEE_PAID:             { label: 'Fee Paid',             color: '#1d4ed8', bg: '#dbeafe', icon: '💳' },
  FEE_APPROVED:         { label: 'Fee Approved',         color: '#065f46', bg: '#d1fae5', icon: '✅' },
  ENROLLED:             { label: 'Enrolled',             color: '#065f46', bg: '#bbf7d0', icon: '🎓' },
};

export const getStatusMeta = (status) =>
  STATUS_META[status] || { label: String(status || 'Unknown').replace(/_/g, ' '), color: '#374151', bg: '#f3f4f6', icon: '•' };

export const StatusBadge = ({ status, size = 'md', resultStatus }) => {
  const meta = getStatusMeta(status);
  return (
    <span className={`status-badge size-${size}`} style={{
      color: meta.color, background: meta.bg,
      border: `1px solid ${meta.color}33`,
    }}>
      <span className="status-icon">{meta.icon}</span>
      <span className="status-text">{meta.label}</span>
      {resultStatus === 'Waiting' && status !== 'RESULT_AWAITED' && (
        <span className="result-awaited-pill" style={{
          marginLeft: 6, padding: '1px 6px', borderRadius: 9,
          background: '#fef3c7', color: '#92400e', fontSize: '0.75em', fontWeight: 600,
        }}>Result Awaited</span>
      )}
    </span>
  );
};

/**
 * StatusTimeline — vertical timeline of an application's status events.
 * events: [{ status, remarks, actorRole, createdAt }]
 */
export const StatusTimeline = ({ events = [] }) => {
  if (!events.length) {
    return <div className="status-timeline-empty">No status updates yet.</div>;
  }
  const fmt = (d) => {
    try {
      const dt = new Date(d);
      return dt.toLocaleString();
    } catch { return d; }
  };
  return (
    <div className="status-timeline">
      {events.map((e, i) => {
        const meta = getStatusMeta(e.status);
        return (
          <div key={e.id || i} className="status-timeline-item">
            <div className="status-timeline-dot" style={{ background: meta.color, color: '#fff' }}>
              {meta.icon}
            </div>
            <div className="status-timeline-line" />
            <div className="status-timeline-card">
              <div className="status-timeline-header">
                <span className="status-timeline-title">{meta.label}</span>
                <span className="status-timeline-time">{fmt(e.createdAt)}</span>
              </div>
              {e.remarks && <div className="status-timeline-remarks">{e.remarks}</div>}
              {e.actorRole && (
                <div className="status-timeline-actor">
                  by <strong>{e.actorRole.replace(/_/g, ' ')}</strong>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * ProgressTracker — horizontal progress with the main milestones.
 */
export const ProgressTracker = ({ status, resultStatus }) => {
  const STAGES = [
    { key: 'SUBMITTED',   label: 'Submitted' },
    { key: 'UNDER_REVIEW', label: 'Director Review' },
    { key: 'FORWARDED',   label: 'Coordinator' },
    { key: 'INTERVIEWED', label: 'Interview' },
    { key: 'QUALIFIED',   label: 'Merit' },
    { key: 'FEE_APPROVED', label: 'Fee' },
    { key: 'ENROLLED',    label: 'Enrolled' },
  ];

  const currentIdx = (() => {
    const map = {
      SUBMITTED: 0, RESULT_AWAITED: 0,
      UNDER_REVIEW: 1, NEED_INFO: 1, REJECTED: 1, APPEAL_SUBMITTED: 1, APPEAL_ACCEPTED: 1, APPEAL_REJECTED: 1,
      FORWARDED: 2,
      INTERVIEWED: 3, INTERVIEW_COMPLETED: 3, DISQUALIFIED: 3,
      QUALIFIED: 4, SELECTED: 4,
      FEE_PENDING: 5, FEE_PAID: 5, FEE_APPROVED: 5,
      ENROLLED: 6,
    };
    return map[status] ?? 0;
  })();

  const isFailedAt = (key) => {
    if (status === 'REJECTED' && key === 'UNDER_REVIEW') return true;
    if (status === 'DISQUALIFIED' && key === 'INTERVIEWED') return true;
    return false;
  };

  return (
    <div className="progress-tracker">
      {STAGES.map((stage, i) => {
        const done = i <= currentIdx && !isFailedAt(stage.key);
        const failed = isFailedAt(stage.key);
        const active = i === currentIdx;
        const cls = `pt-step${done ? ' pt-done' : ''}${active ? ' pt-active' : ''}${failed ? ' pt-failed' : ''}`;
        return (
          <React.Fragment key={stage.key}>
            <div className={cls}>
              <div className="pt-circle">{failed ? '✖' : (done ? '✓' : i + 1)}</div>
              <div className="pt-label">{stage.label}</div>
            </div>
            {i < STAGES.length - 1 && <div className={`pt-line${i < currentIdx ? ' pt-line-done' : ''}`} />}
          </React.Fragment>
        );
      })}
      {resultStatus === 'Waiting' && (
        <div className="pt-awaited-tag">⏳ Result Awaited</div>
      )}
    </div>
  );
};

export default StatusBadge;

import React from 'react';

// ============================================================
// Centralised status colours / labels for the entire admission
// workflow. Used across student, coordinator, director dashboards.
// ============================================================
const STATUS_CONFIG = {
  // Student-side
  SUBMITTED:           { label: 'Submitted',            bg: '#dbeafe', fg: '#1e40af' },
  UNDER_REVIEW:        { label: 'Under Review',         bg: '#e0e7ff', fg: '#4338ca' },
  RESULT_AWAITED:      { label: 'Result Awaited',       bg: '#fef3c7', fg: '#92400e' },
  NEED_INFO:           { label: 'Needs Update',         bg: '#fde68a', fg: '#92400e' },

  // Director decisions
  FORWARDED:           { label: 'Forwarded to Coordinator', bg: '#dbeafe', fg: '#1e40af' },
  REJECTED:            { label: 'Rejected',             bg: '#fee2e2', fg: '#991b1b' },

  // Coordinator interview flow
  INTERVIEWED:         { label: 'Interview Scheduled',  bg: '#cffafe', fg: '#155e75' },
  INTERVIEW_COMPLETED: { label: 'Interview Completed',  bg: '#bae6fd', fg: '#075985' },
  QUALIFIED:           { label: 'Qualified',            bg: '#dcfce7', fg: '#166534' },
  DISQUALIFIED:        { label: 'Disqualified',         bg: '#fee2e2', fg: '#991b1b' },
  // §2.1 Initial Merit List — Coordinator marked applicant Not Eligible for interview.
  NOT_ELIGIBLE:        { label: 'Not Eligible',         bg: '#fee2e2', fg: '#991b1b' },
  SELECTED:            { label: 'Merit Listed',         bg: '#dcfce7', fg: '#166534' },

  // Appeal — exact colour spec: Pending=Yellow, Under Review=Blue, Accepted=Green, Rejected=Red
  APPEAL_SUBMITTED:    { label: 'Appeal Pending',       bg: '#fef9c3', fg: '#854d0e' }, // Yellow
  APPEAL_PENDING:      { label: 'Appeal Pending',       bg: '#fef9c3', fg: '#854d0e' }, // Yellow
  APPEAL_UNDER_REVIEW: { label: 'Under Review',         bg: '#dbeafe', fg: '#1e40af' }, // Blue
  APPEAL_ACCEPTED:     { label: 'Appeal Accepted',      bg: '#dcfce7', fg: '#166534' }, // Green
  APPEAL_REJECTED:     { label: 'Appeal Rejected',      bg: '#fee2e2', fg: '#991b1b' }, // Red

  // Fee
  FEE_PENDING:         { label: 'Enrollment Pending',   bg: '#fef3c7', fg: '#92400e' },
  FEE_PAID:            { label: 'Fee Submitted',        bg: '#bfdbfe', fg: '#1e3a8a' },
  FEE_APPROVED:        { label: 'Fee Approved',         bg: '#a7f3d0', fg: '#065f46' },

  // Final
  ENROLLED:            { label: 'Enrolled',             bg: '#10b981', fg: '#ffffff' },
  PENDING:             { label: 'Pending',              bg: '#f1f5f9', fg: '#475569' },

  // Appeal generic
  ACCEPTED:            { label: 'Accepted',             bg: '#dcfce7', fg: '#166534' },
  APPROVED:            { label: 'Approved',             bg: '#dcfce7', fg: '#166534' },
};

const StatusBadge = ({ status, size = 'md' }) => {
  if (!status) return null;
  const cfg = STATUS_CONFIG[status] || { label: String(status).replace(/_/g, ' '), bg: '#f1f5f9', fg: '#475569' };
  const padding = size === 'sm' ? '2px 8px' : size === 'lg' ? '6px 14px' : '4px 10px';
  const fontSize = size === 'sm' ? '0.7rem' : size === 'lg' ? '0.9rem' : '0.78rem';
  return (
    <span
      style={{
        background: cfg.bg,
        color: cfg.fg,
        padding,
        fontSize,
        borderRadius: 12,
        fontWeight: 600,
        display: 'inline-block',
        whiteSpace: 'nowrap',
        letterSpacing: '0.2px',
      }}
    >
      {cfg.label}
    </span>
  );
};

export default StatusBadge;
export { STATUS_CONFIG };

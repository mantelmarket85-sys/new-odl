import React from 'react';
import { STATUS_CONFIG } from './StatusBadge';

const formatDateTime = (d) => {
  if (!d) return '';
  try {
    const dt = new Date(d);
    return dt.toLocaleString();
  } catch { return d; }
};

/**
 * Vertical timeline showing each status event for an application.
 * Renders: status pill + remarks + actor + timestamp.
 */
const StatusTimeline = ({ events = [] }) => {
  if (!events || events.length === 0) {
    return (
      <div style={{ color: '#64748b', fontSize: '0.85rem', padding: '0.75rem 0' }}>
        <i className="fas fa-clock" style={{ marginRight: 6, color: '#94a3b8' }}></i>
        No timeline events yet. Updates from the Director and Coordinator will appear here in real time.
      </div>
    );
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative' }}>
      <div style={{
        position: 'absolute', left: 7, top: 8, bottom: 8,
        width: 2, background: '#cbd5e1',
      }} />
      {events.map((ev, i) => {
        const cfg = STATUS_CONFIG[ev.status] || { bg: '#94a3b8', fg: '#0f172a', label: ev.status };
        return (
          <li key={ev.id || i} style={{ position: 'relative', paddingLeft: 28, paddingBottom: 16 }}>
            <span
              style={{
                position: 'absolute', left: 0, top: 4,
                width: 16, height: 16, borderRadius: '50%',
                background: cfg.bg, border: `3px solid ${cfg.fg}`,
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                background: cfg.bg, color: cfg.fg,
                padding: '3px 10px', fontSize: '0.75rem', fontWeight: 600,
                borderRadius: 12,
              }}>{cfg.label || ev.status}</span>
              {ev.actorRole && (
                <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'capitalize' }}>
                  by {String(ev.actorRole).replace(/_/g, ' ')}
                </span>
              )}
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                {formatDateTime(ev.createdAt)}
              </span>
            </div>
            {ev.remarks && (
              <div style={{ marginTop: 4, fontSize: '0.82rem', color: '#475569' }}>
                {ev.remarks}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default StatusTimeline;

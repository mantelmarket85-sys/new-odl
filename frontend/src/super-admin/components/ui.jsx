// ============================================================
//  SUPER ADMIN — SHARED UI PRIMITIVES
//  Toast, Skeleton, Breadcrumb, PageHeader, StatCard, Badge,
//  ConfirmationModal, OverrideModal, FormModal, EmptyState.
// ============================================================
import React, { createContext, useContext, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';

/* ---------------- Toast ---------------- */
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx) || { push: () => {} };

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="sa-toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`sa-toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

/* ---------------- Skeleton ---------------- */
export const Skeleton = ({ w = '100%', h = 16, style }) => (
  <div className="sa-skel" style={{ width: w, height: h, ...style }} />
);

export const SkeletonStats = ({ count = 4 }) => (
  <div className="sa-stats-grid">
    {Array.from({ length: count }).map((_, i) => (
      <div className="sa-stat" key={i}>
        <Skeleton w={42} h={42} style={{ borderRadius: 11, marginBottom: 14 }} />
        <Skeleton w={70} h={28} />
        <Skeleton w={110} h={12} style={{ marginTop: 8 }} />
      </div>
    ))}
  </div>
);

export const SkeletonTable = ({ rows = 6, cols = 5 }) => (
  <div className="sa-card">
    <div className="sa-card-pad">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'flex', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--sa-border)' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} w={`${100 / cols}%`} h={14} />
          ))}
        </div>
      ))}
    </div>
  </div>
);

/* ---------------- Breadcrumb ---------------- */
export const Breadcrumb = ({ items = [] }) => (
  <nav className="sa-breadcrumb" aria-label="Breadcrumb">
    <Link to="/super-admin"><i className="fas fa-home" /></Link>
    {items.map((it, i) => (
      <React.Fragment key={i}>
        <span className="sep">/</span>
        {it.to && i < items.length - 1
          ? <Link to={it.to}>{it.label}</Link>
          : <span className="current">{it.label}</span>}
      </React.Fragment>
    ))}
  </nav>
);

/* ---------------- Page header ---------------- */
export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="sa-page-head">
    <div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {actions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{actions}</div>}
  </div>
);

/* ---------------- Stat card ---------------- */
export const StatCard = ({ icon, color = 'blue', value, label }) => (
  <div className="sa-stat">
    <div className={`ic ${color}`}><i className={`fas ${icon}`} /></div>
    <div className="val">{value}</div>
    <div className="lbl">{label}</div>
  </div>
);

/* ---------------- Badge ---------------- */
export const Badge = ({ children, color = 'gray' }) => (
  <span className={`sa-badge ${color}`}>{children}</span>
);

/* ---------------- Empty ---------------- */
export const EmptyState = ({ icon = 'fa-inbox', title = 'Nothing here yet', text }) => (
  <div className="sa-empty">
    <i className={`fas ${icon}`} />
    <div style={{ fontWeight: 600, color: 'var(--sa-text-soft)' }}>{title}</div>
    {text && <div style={{ fontSize: 12.5, marginTop: 4 }}>{text}</div>}
  </div>
);

/* ---------------- Confirmation modal ---------------- */
export const ConfirmationModal = ({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose, loading }) => {
  if (!open) return null;
  return (
    <div className="sa-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sa-modal" role="dialog" aria-modal="true">
        <div className={`sa-modal-icon ${danger ? 'danger' : 'warn'}`}>
          <i className={`fas ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}`} />
        </div>
        <div className="sa-modal-head" style={{ textAlign: 'center' }}>
          <h3>{title}</h3>
          <p>{message}</p>
        </div>
        <div className="sa-modal-foot" style={{ justifyContent: 'center' }}>
          <button className="sa-btn sa-btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className={`sa-btn ${danger ? 'sa-btn-danger' : 'sa-btn-primary'}`} onClick={onConfirm} disabled={loading}>
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Override modal (requires reason) ---------------- */
export const OverrideModal = ({ open, title = 'Override action', message, onConfirm, onClose, loading, children }) => {
  const [reason, setReason] = useState('');
  if (!open) return null;
  return (
    <div className="sa-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sa-modal" role="dialog" aria-modal="true">
        <div className="sa-modal-icon danger"><i className="fas fa-shield-halved" /></div>
        <div className="sa-modal-head" style={{ textAlign: 'center' }}>
          <h3>{title}</h3>
          {message && <p>{message}</p>}
        </div>
        <div className="sa-modal-body">
          {children}
          <div className="sa-field" style={{ marginTop: children ? 14 : 0 }}>
            <label>Reason for override <span style={{ color: 'var(--sa-danger)' }}>*</span></label>
            <textarea className="sa-textarea" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="This reason is logged permanently to the override audit trail…" />
          </div>
        </div>
        <div className="sa-modal-foot">
          <button className="sa-btn sa-btn-ghost" onClick={() => { setReason(''); onClose(); }} disabled={loading}>Cancel</button>
          <button className="sa-btn sa-btn-danger" disabled={loading || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}>
            {loading ? 'Applying…' : 'Apply override'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Generic form modal ---------------- */
export const FormModal = ({ open, title, subtitle, onClose, onSubmit, submitLabel = 'Save', loading, children, size }) => {
  if (!open) return null;
  return (
    <div className="sa-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className={`sa-modal ${size === 'lg' ? 'lg' : ''}`} role="dialog" aria-modal="true"
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <div className="sa-modal-head">
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="sa-modal-body">{children}</div>
        <div className="sa-modal-foot">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button type="submit" className="sa-btn sa-btn-primary" disabled={loading}>{loading ? 'Saving…' : submitLabel}</button>
        </div>
      </form>
    </div>
  );
};

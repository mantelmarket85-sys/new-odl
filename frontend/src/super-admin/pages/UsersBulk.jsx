// ============================================================
//  SUPER ADMIN — BULK USER OPERATIONS
//  ------------------------------------------------------------
//  Multi-select users across either system, then apply in one go:
//    • Bulk password reset
//    • Bulk activate / deactivate (reason recorded)
//    • Bulk notification (creates a targeted SystemAnnouncement)
//    • Force logout an individual session
//  Every action is audit-logged exactly like the per-user action.
// ============================================================
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import saApi from '../saApi';
import {
  PageHeader, Breadcrumb, Badge, useToast, FormModal, ConfirmationModal,
  Skeleton, EmptyState,
} from '../components/ui';

export const BulkOperations = () => {
  const toast = useToast();
  const [system, setSystem] = useState('admissions');
  const [rows, setRows] = useState([]); const [roles, setRoles] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(''); const [roleFilter, setRoleFilter] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  // modals
  const [confirmReset, setConfirmReset] = useState(false);
  const [statusModal, setStatusModal] = useState(null); // { isActive }
  const [statusReason, setStatusReason] = useState('');
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notify, setNotify] = useState({ title: '', message: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await saApi.listUsers({ system, role: roleFilter || undefined, q: q || undefined });
      setRows(data.users || []); setRoles(data.roles || {});
      setSelected(new Set());
    } catch { toast.push('Failed to load users', 'error'); }
    finally { setLoading(false); }
  }, [system, roleFilter, q, toast]);
  useEffect(() => { load(); }, [system, roleFilter]); // eslint-disable-line

  const ids = useMemo(() => Array.from(selected), [selected]);
  const roleOptions = roles[system] || {};

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)));

  const doReset = async () => {
    setBusy(true);
    try {
      const { data } = await saApi.bulkResetPassword(system, ids);
      toast.push(`Passwords reset for ${data.results?.length ?? ids.length} users`, 'success');
      setConfirmReset(false); setSelected(new Set());
    } catch (e) { toast.push(e.response?.data?.error || 'Bulk reset failed', 'error'); }
    finally { setBusy(false); }
  };
  const doStatus = async () => {
    setBusy(true);
    try {
      const { data } = await saApi.bulkSetStatus(system, ids, statusModal.isActive, statusReason || undefined);
      toast.push(`${data.count} accounts ${statusModal.isActive ? 'activated' : 'deactivated'}`, 'success');
      setStatusModal(null); setStatusReason(''); load();
    } catch (e) { toast.push(e.response?.data?.error || 'Bulk status change failed', 'error'); }
    finally { setBusy(false); }
  };
  const doNotify = async () => {
    if (!notify.title || !notify.message) { toast.push('Title and message are required', 'error'); return; }
    setBusy(true);
    try {
      // Targeted by the currently selected role filter + system.
      await saApi.bulkNotify({ title: notify.title, message: notify.message, targetRole: roleFilter || undefined, targetSystem: system });
      toast.push('Notification queued as a system announcement', 'success');
      setNotifyOpen(false); setNotify({ title: '', message: '' });
    } catch (e) { toast.push(e.response?.data?.error || 'Failed to send notification', 'error'); }
    finally { setBusy(false); }
  };
  const forceLogout = async (u) => {
    try { await saApi.forceLogout(u.system, u.id); toast.push(`${u.username} will be forced to re-login`, 'success'); }
    catch { toast.push('Force logout failed', 'error'); }
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'User Management' }, { label: 'Bulk Operations' }]} />
      <PageHeader title="Bulk Operations"
        subtitle="Select multiple users and apply password resets, activation changes or notifications in one action." />

      {/* Toolbar */}
      <div className="sa-toolbar">
        <select className="sa-filter-select" value={system} onChange={(e) => { setSystem(e.target.value); setRoleFilter(''); }}>
          <option value="admissions">Admissions users</option>
          <option value="lms">LMS users</option>
        </select>
        <select className="sa-filter-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {Object.entries(roleOptions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: 6 }}>
          <input className="sa-input" placeholder="Search name / email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 200 }} />
          <button className="sa-btn sa-btn-ghost" type="submit"><i className="fas fa-magnifying-glass" /></button>
        </form>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: 'var(--sa-text-soft)', alignSelf: 'center' }}>{selected.size} selected</span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sa-card sa-card-pad" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="sa-btn sa-btn-ghost" onClick={() => setConfirmReset(true)}><i className="fas fa-key" /> Reset passwords</button>
          <button className="sa-btn sa-btn-primary" onClick={() => setStatusModal({ isActive: true })}><i className="fas fa-user-check" /> Activate</button>
          <button className="sa-btn sa-btn-danger" onClick={() => setStatusModal({ isActive: false })}><i className="fas fa-user-slash" /> Deactivate</button>
          <button className="sa-btn sa-btn-ghost" onClick={() => setNotifyOpen(true)}><i className="fas fa-bell" /> Notify</button>
        </div>
      )}

      {/* Table */}
      <div className="sa-card">
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} /></th>
                <th>User</th><th>Email</th><th>Role</th><th>Status</th><th style={{ textAlign: 'right' }}>Session</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={6}><Skeleton h={14} /></td></tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={6}><EmptyState text="No users match your filters." /></td></tr>
              ) : rows.map((u) => (
                <tr key={u.id}>
                  <td><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} /></td>
                  <td>{u.username}</td>
                  <td>{u.email}</td>
                  <td>{u.roleLabel || u.role}</td>
                  <td><Badge color={u.isActive ? 'green' : 'red'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => forceLogout(u)} title="Force logout"><i className="fas fa-right-from-bracket" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmationModal open={confirmReset} title="Reset passwords?"
        message={`Temporary passwords will be generated for ${ids.length} selected users.`}
        confirmLabel="Reset passwords" loading={busy} onClose={() => setConfirmReset(false)} onConfirm={doReset} />

      {statusModal && (
        <FormModal open title={`${statusModal.isActive ? 'Activate' : 'Deactivate'} ${ids.length} users?`}
          submitLabel={statusModal.isActive ? 'Activate' : 'Deactivate'} loading={busy}
          onClose={() => setStatusModal(null)} onSubmit={doStatus}>
          <div className="sa-field"><label>Reason {!statusModal.isActive && <span style={{ color: 'var(--sa-danger)' }}>(recorded)</span>}</label>
            <textarea className="sa-textarea" value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="Reason for this bulk change (audited)…" /></div>
        </FormModal>
      )}

      {notifyOpen && (
        <FormModal open title="Send notification" subtitle={`Target: ${system}${roleFilter ? ' · ' + (roleOptions[roleFilter] || roleFilter) : ' · all roles'}`}
          submitLabel="Send" loading={busy} onClose={() => setNotifyOpen(false)} onSubmit={doNotify}>
          <div className="sa-field"><label>Title *</label><input className="sa-input" value={notify.title} onChange={(e) => setNotify({ ...notify, title: e.target.value })} /></div>
          <div className="sa-field"><label>Message *</label><textarea className="sa-textarea" value={notify.message} onChange={(e) => setNotify({ ...notify, message: e.target.value })} /></div>
        </FormModal>
      )}
    </>
  );
};

export default BulkOperations;

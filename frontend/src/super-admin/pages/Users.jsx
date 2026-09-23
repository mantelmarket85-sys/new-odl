// ============================================================
//  SUPER ADMIN — USER MANAGEMENT (both systems)
//  List/filter all users, create accounts (any role/system),
//  activate/deactivate, reset password, change role, unlock.
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import {
  PageHeader, Breadcrumb, Badge, ConfirmationModal, FormModal, useToast,
} from '../components/ui';

const ADM_ROLES = { super_admin: 'Super Admin', director_admissions: 'Director Admissions', coordinator: 'Coordinator', student: 'Student', teacher: 'Teacher', lms_admin: 'LMS Admin' };
const LMS_ROLES = { Student: 'Student', Teacher: 'Teacher', CourseCoordinator: 'Course Coordinator', FocalPerson: 'Focal Person', ExamController: 'Exam Controller', QECCoordinator: 'QEC Coordinator', Provost: 'Provost', SuperAdmin: 'Super Admin' };

const Users = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [systemFilter, setSystemFilter] = useState('');
  const [confirm, setConfirm] = useState(null);       // { user, action }
  const [createOpen, setCreateOpen] = useState(false);
  const [roleEdit, setRoleEdit] = useState(null);      // user
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ system: 'lms', role: 'Teacher', username: '', email: '', fullName: '', department: '' });
  const [newRole, setNewRole] = useState('');
  const [tempPw, setTempPw] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [deptEdit, setDeptEdit] = useState(null);   // LMS staff user being (re)assigned
  const [deptValue, setDeptValue] = useState('');

  // Department-bound LMS staff roles whose isolation depends on a department.
  const DEPT_BOUND_ROLES = ['FocalPerson', 'CourseCoordinator'];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await saApi.listUsers(systemFilter ? { system: systemFilter } : {});
      setRows(data.users || []);
    } catch (e) { toast.push('Failed to load users', 'error'); }
    finally { setLoading(false); }
  }, [systemFilter, toast]);

  const loadDepartments = useCallback(async () => {
    try {
      const { data } = await saApi.listDepartments();
      setDepartments((data.departments || []).map((d) => d.name).filter(Boolean));
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadDepartments(); }, [loadDepartments]);

  const doStatus = async (u) => {
    setBusy(true);
    try {
      await saApi.setUserStatus(u.system, u.id, !u.isActive);
      toast.push(`User ${u.isActive ? 'deactivated' : 'activated'}`, 'success');
      setConfirm(null); load();
    } catch { toast.push('Action failed', 'error'); } finally { setBusy(false); }
  };

  const doReset = async (u) => {
    setBusy(true);
    try {
      const { data } = await saApi.resetPassword(u.system, u.id);
      // Backend returns `temporaryPassword` (Part A#4) — keep legacy fallbacks.
      setTempPw({ user: u, password: data.temporaryPassword || data.tempPassword || data.password });
      toast.push('Password reset', 'success'); setConfirm(null);
    } catch { toast.push('Reset failed', 'error'); } finally { setBusy(false); }
  };

  const doUnlock = async (u) => {
    setBusy(true);
    try { await saApi.unlockUser(u.system, u.id); toast.push('Account unlocked', 'success'); setConfirm(null); load(); }
    catch { toast.push('Unlock failed', 'error'); } finally { setBusy(false); }
  };

  const doCreate = async () => {
    if (!form.username) { toast.push('Username is required', 'error'); return; }
    // Department is REQUIRED for department-bound LMS staff so isolation works.
    if (form.system === 'lms' && DEPT_BOUND_ROLES.includes(form.role) && !form.department) {
      toast.push('Select a department for this Focal Person / Course Coordinator', 'error');
      return;
    }
    setBusy(true);
    try {
      const { data } = await saApi.createUser(form);
      // Backend returns `temporaryPassword` (Part A#4) — keep legacy fallbacks.
      setTempPw({ user: { username: form.username, system: form.system }, password: data.temporaryPassword || data.tempPassword || data.password });
      toast.push('User created', 'success');
      setCreateOpen(false);
      setForm({ system: 'lms', role: 'Teacher', username: '', email: '', fullName: '', department: '' });
      load();
    } catch (e) { toast.push(e.response?.data?.error || 'Create failed', 'error'); } finally { setBusy(false); }
  };

  const doAssignDept = async () => {
    if (!deptEdit) return;
    setBusy(true);
    try {
      await saApi.setLmsUserDepartment(deptEdit.id, deptValue);
      toast.push(`Department ${deptValue ? 'assigned' : 'cleared'}`, 'success');
      setDeptEdit(null); load();
    } catch (e) { toast.push(e.response?.data?.error || 'Failed', 'error'); } finally { setBusy(false); }
  };

  const doChangeRole = async () => {
    setBusy(true);
    try { await saApi.changeRole(roleEdit.system, roleEdit.id, newRole); toast.push('Role updated', 'success'); setRoleEdit(null); load(); }
    catch (e) { toast.push(e.response?.data?.error || 'Failed', 'error'); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'username', header: 'User', render: (r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.fullName || r.username || '—'}</div>
        <div style={{ fontSize: 11.5, color: 'var(--sa-text-muted)' }}>{r.email || r.username}</div>
      </div>
    ) },
    { key: 'system', header: 'System', render: (r) => <Badge color={r.system === 'lms' ? 'blue' : 'navy'}>{r.system}</Badge> },
    { key: 'roleLabel', header: 'Role', render: (r) => <Badge color="gray">{r.roleLabel || r.role}</Badge> },
    { key: 'department', header: 'Department', render: (r) => (
      r.system === 'lms' && DEPT_BOUND_ROLES.includes(r.role)
        ? (r.department ? <Badge color="blue">{r.department}</Badge> : <Badge color="red">Unassigned</Badge>)
        : <span style={{ color: 'var(--sa-text-muted)' }}>—</span>
    ) },
    { key: 'isActive', header: 'Status', render: (r) => (
      r.isLocked ? <Badge color="red">Locked</Badge> : <Badge color={r.isActive ? 'green' : 'amber'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>
    ) },
    { key: 'lastLoginAt', header: 'Last Login', render: (r) => r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleDateString() : '—' },
    { key: '__actions', header: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="sa-btn sa-btn-ghost sa-btn-sm" title="Change role" onClick={() => { setRoleEdit(r); setNewRole(r.role); }}><i className="fas fa-user-tag" /></button>
        {r.system === 'lms' && DEPT_BOUND_ROLES.includes(r.role) && (
          <button className="sa-btn sa-btn-ghost sa-btn-sm" title="Assign department" onClick={() => { setDeptEdit(r); setDeptValue(r.department || ''); }}><i className="fas fa-building" /></button>
        )}
        <button className="sa-btn sa-btn-ghost sa-btn-sm" title="Reset password" onClick={() => setConfirm({ user: r, action: 'reset' })}><i className="fas fa-key" /></button>
        {r.isLocked && <button className="sa-btn sa-btn-ghost sa-btn-sm" title="Unlock" onClick={() => setConfirm({ user: r, action: 'unlock' })}><i className="fas fa-lock-open" /></button>}
        <button className={`sa-btn sa-btn-sm ${r.isActive ? 'sa-btn-danger' : 'sa-btn-primary'}`} title={r.isActive ? 'Deactivate' : 'Activate'} onClick={() => setConfirm({ user: r, action: 'status' })}>
          <i className={`fas ${r.isActive ? 'fa-user-slash' : 'fa-user-check'}`} />
        </button>
      </div>
    ), tdStyle: { textAlign: 'right' } },
  ];

  const roleOptions = form.system === 'lms' ? LMS_ROLES : ADM_ROLES;

  return (
    <>
      <Breadcrumb items={[{ label: 'User Management' }]} />
      <PageHeader title="User Management" subtitle="Create and manage every account across the Admissions and LMS systems."
        actions={<button className="sa-btn sa-btn-primary" onClick={() => setCreateOpen(true)}><i className="fas fa-user-plus" /> Add User</button>} />

      <DataTable
        columns={columns} rows={rows} loading={loading} exportName="users"
        searchKeys={['username', 'email', 'fullName', 'role', 'roleLabel']}
        toolbarExtra={
          <select className="sa-select" style={{ width: 160 }} value={systemFilter} onChange={(e) => setSystemFilter(e.target.value)}>
            <option value="">All Systems</option>
            <option value="admissions">Admissions</option>
            <option value="lms">LMS</option>
          </select>
        }
      />

      {/* Confirm dialogs */}
      <ConfirmationModal open={confirm?.action === 'status'} danger={confirm?.user?.isActive}
        title={confirm?.user?.isActive ? 'Deactivate user?' : 'Activate user?'}
        message={`${confirm?.user?.username} (${confirm?.user?.system})`}
        confirmLabel={confirm?.user?.isActive ? 'Deactivate' : 'Activate'}
        loading={busy} onClose={() => setConfirm(null)} onConfirm={() => doStatus(confirm.user)} />
      <ConfirmationModal open={confirm?.action === 'reset'} title="Reset password?"
        message={`A new temporary password will be generated for ${confirm?.user?.username}.`}
        confirmLabel="Reset" loading={busy} onClose={() => setConfirm(null)} onConfirm={() => doReset(confirm.user)} />
      <ConfirmationModal open={confirm?.action === 'unlock'} title="Unlock account?"
        message={`Unlock ${confirm?.user?.username} and clear failed attempts.`}
        confirmLabel="Unlock" loading={busy} onClose={() => setConfirm(null)} onConfirm={() => doUnlock(confirm.user)} />

      {/* Create user */}
      <FormModal open={createOpen} title="Add User" subtitle="Create an account in either system. A temporary password is generated."
        submitLabel="Create User" loading={busy} onClose={() => setCreateOpen(false)} onSubmit={doCreate}>
        <div className="sa-field">
          <label>System</label>
          <select className="sa-select" value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value, role: e.target.value === 'lms' ? 'Teacher' : 'coordinator' })}>
            <option value="lms">LMS</option>
            <option value="admissions">Admissions</option>
          </select>
        </div>
        <div className="sa-field">
          <label>Role</label>
          <select className="sa-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {Object.entries(roleOptions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="sa-field"><label>Username</label><input className="sa-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
        <div className="sa-field"><label>Email</label><input className="sa-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="sa-field"><label>Full Name</label><input className="sa-input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
        {form.system === 'lms' && DEPT_BOUND_ROLES.includes(form.role) && (
          <div className="sa-field">
            <label>Department <span style={{ color: 'var(--sa-danger, #dc2626)' }}>*</span></label>
            <select className="sa-select" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              <option value="">— Select department —</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <div style={{ fontSize: 11.5, color: 'var(--sa-text-muted)', marginTop: 4 }}>
              This {form.role === 'FocalPerson' ? 'Focal Person' : 'Course Coordinator'} will only ever see this department's data. Multiple staff can share a department.
            </div>
          </div>
        )}
      </FormModal>

      {/* Assign / reassign department for an existing LMS staff user */}
      <FormModal open={!!deptEdit} title="Assign Department" subtitle={deptEdit?.username}
        submitLabel="Save" loading={busy} onClose={() => setDeptEdit(null)} onSubmit={doAssignDept}>
        <div className="sa-field">
          <label>Department</label>
          <select className="sa-select" value={deptValue} onChange={(e) => setDeptValue(e.target.value)}>
            <option value="">— Unassigned (sees nothing) —</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div style={{ fontSize: 11.5, color: 'var(--sa-text-muted)', marginTop: 4 }}>
            Strict isolation: this staff member will only see the selected department's students, programs, courses and reports.
          </div>
        </div>
      </FormModal>

      {/* Change role */}
      <FormModal open={!!roleEdit} title="Change Role" subtitle={roleEdit?.username}
        submitLabel="Update Role" loading={busy} onClose={() => setRoleEdit(null)} onSubmit={doChangeRole}>
        <div className="sa-field">
          <label>New Role</label>
          <select className="sa-select" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            {Object.entries(roleEdit?.system === 'lms' ? LMS_ROLES : ADM_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </FormModal>

      {/* Temp password reveal */}
      <FormModal open={!!tempPw} title="Temporary Password" subtitle={`For ${tempPw?.user?.username}`}
        submitLabel="Done" onClose={() => setTempPw(null)} onSubmit={() => setTempPw(null)}>
        <p style={{ fontSize: 13, color: 'var(--sa-text-soft)', marginBottom: 12 }}>Share this one-time password securely. The user must change it on first login.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="sa-input" readOnly value={tempPw?.password || ''} style={{ fontFamily: 'monospace', fontWeight: 700 }} />
          <button type="button" className="sa-btn sa-btn-ghost" onClick={() => { navigator.clipboard?.writeText(tempPw?.password || ''); toast.push('Copied', 'success'); }}><i className="fas fa-copy" /></button>
        </div>
      </FormModal>
    </>
  );
};

export default Users;

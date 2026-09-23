import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import api from '../utils/api';

const sidebarItems = [
  { key: 'overview', label: 'System Overview', icon: 'fa-chart-line' },
  { key: 'users', label: 'User Management', icon: 'fa-users' },
  { key: 'departments', label: 'Departments & Coordinators', icon: 'fa-building-columns' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'director_admissions', label: 'Director Admissions' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'student', label: 'Student / Applicant' },
];

const ASSIGNABLE_ROLES = [
  { value: 'director_admissions', label: 'Director Admissions' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'student', label: 'Student / Applicant' },
];

/* ════════════════ SUPER ADMIN DASHBOARD ════════════════ */
const SuperAdminDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderSection = () => {
    switch (activeTab) {
      case 'overview': return <OverviewSection />;
      case 'users': return <UsersSection />;
      case 'departments': return <DepartmentsOverviewSection />;
      default: return <OverviewSection />;
    }
  };

  return (
    <div>
      <nav className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu"><i className="fas fa-bars"></i></button>
          <div className="navbar-brand">
            <img src="/assets/aust-logo.png" alt="AUST" className="brand-logo" />
            <div className="brand-text">
              <strong>AUST</strong>
              <small>Super Admin Dashboard</small>
            </div>
          </div>
        </div>
        <div className="navbar-user">
          <span>{user?.email}</span>
          <span className="role-badge"><i className="fas fa-user-shield" style={{ marginRight: 5 }}></i>Super Admin</span>
          <Link to="/" className="nav-link"><i className="fas fa-house"></i></Link>
          <button onClick={logout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <i className="fas fa-arrow-right-from-bracket"></i> Logout
          </button>
        </div>
      </nav>
      <div className="page-wrapper">
        <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-section-title">Super Admin Panel</div>
          {sidebarItems.map(item => (
            <div key={item.key} className={`sidebar-item ${activeTab === item.key ? 'active' : ''}`}
              onClick={() => { setActiveTab(item.key); setSidebarOpen(false); }}>
              <span className="icon"><i className={`fas ${item.icon}`}></i></span><span>{item.label}</span>
            </div>
          ))}
        </aside>
        <main className="main-content">{renderSection()}</main>
      </div>
    </div>
  );
};

/* ════════════════ SYSTEM OVERVIEW ════════════════ */
const OverviewSection = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let on = true;
    setLoading(true);
    api.get('/super-admin/stats')
      .then(r => { if (on) setStats(r.data); })
      .catch(() => { if (on) setError('Failed to load system statistics'); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  if (loading) return <div className="loading" style={{ marginTop: '20vh' }}><span className="spinner"></span></div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!stats) return null;

  const s = stats.summary || {};
  const byRole = stats.usersByRole || {};
  const deptStats = stats.departmentStats || [];

  const roleLabel = (r) => ({
    super_admin: 'Super Admin', director_admissions: 'Director Admissions',
    coordinator: 'Coordinator', student: 'Students / Applicants',
  }[r] || r);

  return (
    <div>
      <h2 className="section-title">System Overview</h2>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon" style={{ background: '#e0f2fe' }}><i className="fas fa-users" style={{ color: '#0284c7' }}></i></div><div><div className="stat-value">{s.totalUsers ?? 0}</div><div className="stat-label">Total Users</div></div></div>
        <div className="stat-card"><div className="stat-icon" style={{ background: '#dcfce7' }}><i className="fas fa-user-check" style={{ color: '#16a34a' }}></i></div><div><div className="stat-value">{s.activeUsers ?? 0}</div><div className="stat-label">Active Users</div></div></div>
        <div className="stat-card"><div className="stat-icon" style={{ background: '#fee2e2' }}><i className="fas fa-user-slash" style={{ color: '#dc2626' }}></i></div><div><div className="stat-value">{s.inactiveUsers ?? 0}</div><div className="stat-label">Inactive Users</div></div></div>
        <div className="stat-card"><div className="stat-icon" style={{ background: '#fef3c7' }}><i className="fas fa-file-lines" style={{ color: '#d97706' }}></i></div><div><div className="stat-value">{s.totalApplications ?? 0}</div><div className="stat-label">Total Applications</div></div></div>
        <div className="stat-card"><div className="stat-icon" style={{ background: '#ede9fe' }}><i className="fas fa-graduation-cap" style={{ color: '#7c3aed' }}></i></div><div><div className="stat-value">{s.enrolledCount ?? 0}</div><div className="stat-label">Enrolled Students</div></div></div>
        <div className="stat-card"><div className="stat-icon" style={{ background: '#e0e7ff' }}><i className="fas fa-building-columns" style={{ color: '#4f46e5' }}></i></div><div><div className="stat-value">{s.totalDepartments ?? 0}</div><div className="stat-label">Departments</div></div></div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>Users by Role</h3>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Role</th><th>Count</th></tr></thead>
            <tbody>
              {Object.keys(byRole).length === 0 ? (
                <tr><td colSpan={2} style={{ textAlign: 'center' }}>No users</td></tr>
              ) : Object.entries(byRole).map(([r, c]) => (
                <tr key={r}><td>{roleLabel(r)}</td><td>{c}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>System-wide Stats by Department & Program</h3>
        {deptStats.length === 0 ? <p>No departments configured.</p> : deptStats.map((d) => (
          <div key={d.id} style={{ marginBottom: 18 }}>
            <h4 style={{ margin: '8px 0' }}>{d.name} <small style={{ color: '#6b7280' }}>({d.applications} applications · {d.enrolled} enrolled)</small></h4>
            <div className="table-responsive">
              <table className="data-table">
                <thead><tr><th>Program</th><th>Applications</th><th>Enrolled</th></tr></thead>
                <tbody>
                  {d.programs.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center' }}>No programs</td></tr>
                  ) : d.programs.map((p) => (
                    <tr key={p.id}><td>{p.shortForm ? `${p.name} (${p.shortForm})` : p.name}</td><td>{p.applications}</td><td>{p.enrolled}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ════════════════ USER MANAGEMENT ════════════════ */
const UsersSection = () => {
  const { user: current } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [roleFilter, setRoleFilter] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (roleFilter) params.role = roleFilter;
      if (q) params.q = q;
      const r = await api.get('/super-admin/users', { params });
      setUsers(r.data.users || []);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [roleFilter, q]);

  useEffect(() => { load(); }, [roleFilter]); // eslint-disable-line

  const flash = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 5000); };

  const toggleStatus = async (u) => {
    setBusyId(u.id);
    try {
      const r = await api.patch(`/super-admin/users/${u.id}/status`, { isActive: !u.isActive });
      flash('success', r.data.message || 'Status updated');
      load();
    } catch (e) {
      flash('error', e.response?.data?.error || 'Failed to update status');
    } finally { setBusyId(null); }
  };

  const resetPassword = async (u) => {
    if (!window.confirm(`Reset password for ${u.email}? A new temporary password will be generated.`)) return;
    setBusyId(u.id);
    try {
      const r = await api.post(`/super-admin/users/${u.id}/reset-password`);
      flash('success', `Temporary password for ${u.email}: ${r.data.temporaryPassword}`);
    } catch (e) {
      flash('error', e.response?.data?.error || 'Failed to reset password');
    } finally { setBusyId(null); }
  };

  const changeRole = async (u, newRole) => {
    if (newRole === u.role) return;
    if (!window.confirm(`Change role of ${u.email} to "${newRole}"?`)) { load(); return; }
    setBusyId(u.id);
    try {
      const r = await api.patch(`/super-admin/users/${u.id}/role`, { role: newRole });
      flash('success', r.data.message || 'Role updated');
      load();
    } catch (e) {
      flash('error', e.response?.data?.error || 'Failed to change role');
      load();
    } finally { setBusyId(null); }
  };

  return (
    <div>
      <h2 className="section-title">User Management</h2>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Role</label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <label>Search (email / username)</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type and press Search" />
          </div>
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
      </div>

      {loading ? (
        <div className="loading"><span className="spinner"></span></div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email / Username</th><th>Role</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center' }}>No users found</td></tr>
                ) : users.map((u) => {
                  const isSelf = current?.id === u.id;
                  return (
                    <tr key={u.id}>
                      <td>{u.fullName || '—'}</td>
                      <td>{u.email}<br /><small style={{ color: '#6b7280' }}>{u.username}</small></td>
                      <td>
                        {u.role === 'super_admin' ? (
                          <span className="role-badge">Super Admin</span>
                        ) : (
                          <select value={u.role} disabled={busyId === u.id} onChange={(e) => changeRole(u, e.target.value)}>
                            {ASSIGNABLE_ROLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        )}
                      </td>
                      <td>{u.managedDepartment?.name || '—'}</td>
                      <td>
                        <span className={`status-badge ${u.isActive ? 'status-approved' : 'status-rejected'}`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm btn-outline" disabled={busyId === u.id || isSelf}
                          title={isSelf ? "You can't deactivate yourself" : ''}
                          onClick={() => toggleStatus(u)}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>{' '}
                        <button className="btn btn-sm btn-outline" disabled={busyId === u.id}
                          onClick={() => resetPassword(u)}>
                          Reset Password
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/* ════════════════ DEPARTMENTS & COORDINATORS ════════════════ */
const DepartmentsOverviewSection = () => {
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let on = true;
    setLoading(true);
    api.get('/super-admin/departments')
      .then(r => { if (on) setDepts(r.data.departments || r.data || []); })
      .catch(() => { if (on) setError('Failed to load departments'); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, []);

  if (loading) return <div className="loading"><span className="spinner"></span></div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <h2 className="section-title">Departments &amp; Coordinators</h2>
      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Department</th><th>Coordinator</th><th>Programs</th><th>Status</th></tr></thead>
            <tbody>
              {depts.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center' }}>No departments</td></tr>
              ) : depts.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.name}</strong>{d.faculty ? <><br /><small style={{ color: '#6b7280' }}>{d.faculty}</small></> : null}</td>
                  <td>{d.coordinator ? (
                    <>{d.coordinator.email}<br /><small style={{ color: '#6b7280' }}>{d.coordinator.username}{d.coordinator.isActive === false ? ' · inactive' : ''}</small></>
                  ) : <span style={{ color: '#9ca3af' }}>Unassigned</span>}</td>
                  <td>{(d.programs || []).length === 0 ? '—' : (d.programs || []).map(p => p.shortForm || p.name).join(', ')}</td>
                  <td><span className={`status-badge ${d.isActive === false ? 'status-rejected' : 'status-approved'}`}>{d.isActive === false ? 'Inactive' : 'Active'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;

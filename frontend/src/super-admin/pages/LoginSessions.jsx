// ============================================================
//  SUPER ADMIN — LOGIN SESSIONS
//  Recent logins across both systems (last 30 days window).
// ============================================================
import React, { useEffect, useState } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import { PageHeader, Breadcrumb, Badge, useToast } from '../components/ui';

const LoginSessions = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => {
    try { const { data } = await saApi.activeSessions(); setRows(data.sessions || []); }
    catch { toast.push('Failed to load sessions', 'error'); } finally { setLoading(false); }
  })(); }, []); // eslint-disable-line

  const columns = [
    { key: 'username', header: 'User', render: (r) => r.username || r.email || '—' },
    { key: 'system', header: 'System', render: (r) => <Badge color={r.system === 'lms' ? 'blue' : 'navy'}>{r.system}</Badge> },
    { key: 'role', header: 'Role', render: (r) => <Badge color="gray">{r.role}</Badge> },
    { key: 'lastLoginAt', header: 'Last Login', render: (r) => r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString() : '—' },
    { key: 'lastLoginIp', header: 'IP', render: (r) => r.lastLoginIp || '—' },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'User Management' }, { label: 'Login Sessions' }]} />
      <PageHeader title="Login Sessions" subtitle="Recent active logins across the Admissions and LMS systems." />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="login-sessions" searchKeys={['username', 'email', 'role']} emptyText="No recent logins." />
    </>
  );
};

export default LoginSessions;

// ============================================================
//  SUPER ADMIN — ADMISSIONS MANAGEMENT PAGES
//  Applications (read), Status Overrides (override w/ reason).
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import {
  PageHeader, Breadcrumb, Badge, OverrideModal, useToast,
} from '../components/ui';

const STATUS_OPTIONS = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'FORWARDED', 'FEE_PENDING', 'FEE_PAID', 'INTERVIEW', 'ENROLLED', 'REJECTED', 'WITHDRAWN'];
const statusColor = (s) => (s === 'ENROLLED' ? 'green' : s === 'REJECTED' || s === 'WITHDRAWN' ? 'red' : s === 'FEE_PAID' ? 'blue' : 'amber');

function useApplications() {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [pg, setPg] = useState(null);
  const [loading, setLoading] = useState(true); const [page, setPage] = useState(1);
  const load = useCallback(async (p = page) => {
    setLoading(true);
    try { const { data } = await saApi.listApplications({ page: p, pageSize: 25 }); setRows(data.applications || []); setPg(data.pagination); }
    catch { toast.push('Failed to load applications', 'error'); } finally { setLoading(false); }
  }, [page, toast]);
  useEffect(() => { load(page); }, [page]); // eslint-disable-line
  return { rows, pg, loading, page, setPage, reload: () => load(page) };
}

export const Applications = () => {
  const { rows, pg, loading, page, setPage } = useApplications();
  const columns = [
    { key: 'applicationNo', header: 'App #', render: (r) => r.applicationNo || `#${r.id}` },
    { key: 'user', header: 'Applicant', render: (r) => r.user?.username || r.user?.email || '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge> },
    { key: 'createdAt', header: 'Submitted', render: (r) => new Date(r.createdAt).toLocaleDateString() },
  ];
  return (
    <>
      <Breadcrumb items={[{ label: 'Admissions' }, { label: 'Applications' }]} />
      <PageHeader title="Applications" subtitle="All admissions applications (read-only oversight)." />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="applications" searchKeys={['applicationNo', 'status']} pagination={pg} onPageChange={setPage} />
    </>
  );
};

export const Overrides = () => {
  const toast = useToast();
  const { rows, pg, loading, page, setPage, reload } = useApplications();
  const [target, setTarget] = useState(null);
  const [newStatus, setNewStatus] = useState('ENROLLED');
  const [busy, setBusy] = useState(false);

  const doOverride = async (reason) => {
    setBusy(true);
    try {
      await saApi.overrideApplication(target.id, { newStatus, reason });
      toast.push('Status overridden & logged', 'success'); setTarget(null); reload();
    } catch (e) { toast.push(e.response?.data?.error || 'Override failed', 'error'); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'applicationNo', header: 'App #', render: (r) => r.applicationNo || `#${r.id}` },
    { key: 'user', header: 'Applicant', render: (r) => r.user?.username || r.user?.email || '—' },
    { key: 'status', header: 'Current Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge> },
    { key: '__actions', header: '', render: (r) => (
      <button className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => { setTarget(r); setNewStatus(r.status === 'ENROLLED' ? 'UNDER_REVIEW' : 'ENROLLED'); }}>
        <i className="fas fa-shield-halved" /> Override
      </button>
    ), tdStyle: { textAlign: 'right' } },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'Admissions' }, { label: 'Status Overrides' }]} />
      <PageHeader title="Application Status Overrides" subtitle="Force-change an application status. Every override is logged permanently with a reason." />
      <DataTable columns={columns} rows={rows} loading={loading} searchKeys={['applicationNo', 'status']} pagination={pg} onPageChange={setPage} />

      <OverrideModal open={!!target} title="Override Application Status"
        message={`Application ${target?.applicationNo || `#${target?.id}`} — currently ${target?.status}`}
        loading={busy} onClose={() => setTarget(null)} onConfirm={doOverride}>
        <div className="sa-field">
          <label>New Status</label>
          <select className="sa-select" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </OverrideModal>
    </>
  );
};

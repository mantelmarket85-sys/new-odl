// ============================================================
//  SUPER ADMIN — ADMISSIONS GOVERNANCE PAGES
//  ------------------------------------------------------------
//  Full Director-Admissions + Coordinator command center:
//    Applications  — list, view detail, approve/reject/set any status
//                    (real effect), verify documents
//    Merit         — merit lists per program
//    Cycles        — open/close cycles + configure merit/qualification
//  Every decision writes through to the live admissions records.
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
// Phase 1 §3 — shared Admission Cycle panel (identical for Director & Super Admin).
import AdmissionCyclePanel from '../../components/admissions/AdmissionCyclePanel';
import {
  PageHeader, Breadcrumb, Badge, useToast, FormModal, ConfirmationModal, Skeleton, EmptyState,
} from '../components/ui';
// Part C — shared Department → Program grouping (single source of truth).
import { groupByDeptProgram, DeptProgramGroups, slug } from '../components/deptProgramGrouping';

const DECISION_STATUSES = [
  'SUBMITTED', 'UNDER_REVIEW', 'FORWARDED', 'INTERVIEWED', 'INTERVIEW_COMPLETED',
  'QUALIFIED', 'DISQUALIFIED', 'SELECTED', 'FEE_PENDING', 'FEE_PAID', 'FEE_APPROVED',
  'ENROLLED', 'NEED_INFO', 'REJECTED',
];
const statusColor = (s) =>
  s === 'ENROLLED' || s === 'SELECTED' || s === 'FEE_APPROVED' ? 'green'
  : s === 'REJECTED' || s === 'DISQUALIFIED' ? 'red'
  : s === 'FEE_PAID' || s === 'QUALIFIED' ? 'blue' : 'amber';

const applicantName = (r) => {
  const p = r.user?.profile;
  const full = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
  return full || r.user?.username || r.user?.email || '—';
};

// §13/§14/Part C — Department → Program grouping now lives in a single shared
// module so the Executive Dashboard and these governance pages use identical
// logic (no duplication).
/* ============================== APPLICATIONS ============================== */
export const Applications = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [pg, setPg] = useState(null);
  const [loading, setLoading] = useState(true); const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [detail, setDetail] = useState(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, pageSize: 25 };
      if (statusFilter) params.status = statusFilter;
      const { data } = await saApi.admApplications(params);
      setRows(data.applications || []); setPg(data.pagination);
    } catch { toast.push('Failed to load applications', 'error'); }
    finally { setLoading(false); }
  }, [statusFilter, toast]);
  useEffect(() => { load(page); }, [page, statusFilter]); // eslint-disable-line

  const columns = [
    { key: 'id', header: 'App #', render: (r) => `#${r.id}`, exportValue: (r) => r.id },
    { key: 'applicant', header: 'Applicant', render: applicantName, exportValue: applicantName },
    { key: 'cycle', header: 'Cycle', render: (r) => r.admissionCycle?.title || '—', exportValue: (r) => r.admissionCycle?.title },
    { key: 'status', header: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge>, exportValue: (r) => r.status },
    { key: 'submittedAt', header: 'Submitted', render: (r) => new Date(r.submittedAt).toLocaleDateString(), exportValue: (r) => r.submittedAt },
    { key: '__actions', header: '', render: (r) => (
      <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setDetail(r)}>
        <i className="fas fa-gavel" /> Manage
      </button>
    ), tdStyle: { textAlign: 'right' }, exportable: false },
  ];

  // §13 — organize by Department → Program (never mixed).
  const groups = groupByDeptProgram(
    rows,
    (r) => r.program?.department ? { id: r.program.department.id, name: r.program.department.name } : null,
    (r) => r.program ? { id: r.program.id, name: r.program.name } : null,
  );

  return (
    <>
      <Breadcrumb items={[{ label: 'Admissions' }, { label: 'Applications' }]} />
      <PageHeader title="Applications" subtitle="Organized by Department → Program. Decide with full Director authority — changes reflect live. Each program exports separately." />
      <div className="sa-toolbar" style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <select className="sa-filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {DECISION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {pg && pg.pages > 1 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
            <button className="sa-btn sa-btn-ghost sa-btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><i className="fas fa-chevron-left" /></button>
            <span style={{ fontSize: 12.5 }}>Page {pg.page} / {pg.pages}</span>
            <button className="sa-btn sa-btn-ghost sa-btn-sm" disabled={page >= pg.pages} onClick={() => setPage((p) => p + 1)}><i className="fas fa-chevron-right" /></button>
          </div>
        )}
      </div>
      {loading ? (
        <><Skeleton h={54} /><Skeleton h={120} style={{ marginTop: 12 }} /></>
      ) : (
        <DeptProgramGroups
          groups={groups}
          emptyText="No applications yet."
          renderProgram={(d, p) => (
            <DataTable
              columns={columns} rows={p.rows} loading={false}
              exportName={`applications-${slug(d.deptName)}-${slug(p.progName)}`}
              exportTitle={`Applications — ${d.deptName} / ${p.progName}`}
              searchKeys={['status']} emptyText="No applications." />
          )}
        />
      )}
      {detail && <ApplicationDetail id={detail.id} onClose={() => setDetail(null)} onChanged={() => load(page)} />}
    </>
  );
};

/* ----------------------- Application detail + decision ----------------------- */
const ApplicationDetail = ({ id, onClose, onChanged }) => {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await saApi.admApplication(id);
      setData(res.data); setStatus(res.data.application.status);
    } catch { toast.push('Failed to load application', 'error'); }
    finally { setLoading(false); }
  }, [id, toast]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (status === 'REJECTED' && remarks.trim().length < 5) {
      toast.push('A rejection reason (min 5 chars) is required', 'error'); return;
    }
    setBusy(true);
    try {
      await saApi.admDecision(id, { status, remarks, rejectionReason: status === 'REJECTED' ? remarks : undefined, reason: remarks });
      toast.push(`Application set to ${status}`, 'success');
      onChanged(); onClose();
    } catch (e) { toast.push(e.response?.data?.error || 'Decision failed', 'error'); }
    finally { setBusy(false); }
  };

  const verifyDoc = async (docId, vstatus) => {
    try {
      await saApi.admVerifyDoc(docId, { verificationStatus: vstatus });
      toast.push(`Document marked ${vstatus}`, 'success');
    } catch { toast.push('Failed to update document', 'error'); }
  };

  const app = data?.application;
  const p = app?.user?.profile;

  return (
    <FormModal open title={`Application #${id}`} subtitle={app ? applicantName(app) : ''}
      size="lg" submitLabel={`Apply: ${status}`} loading={busy} onClose={onClose} onSubmit={submit}>
      {loading ? (
        <><Skeleton h={18} /><Skeleton h={18} style={{ marginTop: 10 }} /><Skeleton h={120} style={{ marginTop: 10 }} /></>
      ) : !app ? <EmptyState text="Application not found." /> : (
        <>
          <dl className="sa-dl">
            <dt>Program</dt><dd>{app.program?.name || '—'}</dd>
            <dt>Cycle</dt><dd>{app.admissionCycle?.title || '—'}</dd>
            <dt>Father Name</dt><dd>{p?.fatherName || '—'}</dd>
            <dt>CNIC</dt><dd>{p?.cnic || '—'}</dd>
            <dt>Phone</dt><dd>{p?.phone || '—'}</dd>
            <dt>Current Status</dt><dd><Badge color={statusColor(app.status)}>{app.status}</Badge></dd>
          </dl>

          <div className="sa-field" style={{ marginTop: 16 }}>
            <label>Set / override status</label>
            <select className="sa-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {DECISION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="sa-field">
            <label>Remarks {status === 'REJECTED' && <span style={{ color: 'var(--sa-danger)' }}>* (required)</span>}</label>
            <textarea className="sa-textarea" value={remarks} onChange={(e) => setRemarks(e.target.value)}
              placeholder="Decision remarks / reason (logged to the application timeline & audit)…" />
          </div>

          <div style={{ marginTop: 18, fontWeight: 600, fontSize: 13 }}>Documents ({data.documents.length})</div>
          {data.documents.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--sa-text-muted)' }}>No documents uploaded.</div> : (
            <div className="sa-table-wrap" style={{ marginTop: 8 }}>
              <table className="sa-table">
                <thead><tr><th>Type</th><th>File</th><th style={{ textAlign: 'right' }}>Verify</th></tr></thead>
                <tbody>
                  {data.documents.map((d) => (
                    <tr key={d.id}>
                      <td>{d.type}</td>
                      <td>{d.fileName}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => verifyDoc(d.id, 'VERIFIED')}><i className="fas fa-check" /></button>
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => verifyDoc(d.id, 'REJECTED')} style={{ marginLeft: 4 }}><i className="fas fa-xmark" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </FormModal>
  );
};

/* ============================== MERIT ============================== */
export const Merit = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { const { data } = await saApi.admMerit(); setRows(data.merit || []); }
      catch { toast.push('Failed to load merit list', 'error'); }
      finally { setLoading(false); }
    })();
  }, [toast]);
  const [meritView, setMeritView] = useState('final'); // 'initial' | 'final'

  const columns = [
    { key: 'rank', header: 'Rank', render: (r) => r.rank ?? '—', exportValue: (r) => r.rank },
    { key: 'applicant', header: 'Applicant', render: (r) => r.user?.username || r.user?.email || '—', exportValue: (r) => r.user?.username },
    { key: 'totalMerit', header: 'Merit Score', render: (r) => r.totalMerit?.toFixed(2), exportValue: (r) => r.totalMerit },
    { key: 'isFinalized', header: 'Finalized', render: (r) => <Badge color={r.isFinalized ? 'green' : 'amber'}>{r.isFinalized ? 'Yes' : 'No'}</Badge>, exportValue: (r) => r.isFinalized },
  ];

  // §14 — Initial vs Final merit. Final = finalized entries only.
  const viewRows = meritView === 'final' ? rows.filter((r) => r.isFinalized) : rows;

  // §14 — Department → Program grouping (never mixed).
  const groups = groupByDeptProgram(
    viewRows,
    (r) => r.application?.program?.department ? { id: r.application.program.department.id, name: r.application.program.department.name } : null,
    (r) => r.application?.program ? { id: r.application.program.id, name: r.application.program.name } : null,
  );

  return (
    <>
      <Breadcrumb items={[{ label: 'Admissions' }, { label: 'Merit Lists' }]} />
      <PageHeader title="Merit Lists" subtitle="Organized by Department → Program. Switch between Initial and Final merit. Each program's list exports separately (PDF/Excel)." />
      <div className="sa-toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <div className="sa-segment" style={{ display: 'inline-flex', border: '1px solid var(--sa-border, #e2e8f0)', borderRadius: 8, overflow: 'hidden' }}>
          <button
            className={`sa-btn sa-btn-sm ${meritView === 'initial' ? 'sa-btn-primary' : 'sa-btn-ghost'}`}
            style={{ borderRadius: 0 }} onClick={() => setMeritView('initial')}>
            <i className="fas fa-list-ol" /> Initial Merit
          </button>
          <button
            className={`sa-btn sa-btn-sm ${meritView === 'final' ? 'sa-btn-primary' : 'sa-btn-ghost'}`}
            style={{ borderRadius: 0 }} onClick={() => setMeritView('final')}>
            <i className="fas fa-award" /> Final Merit
          </button>
        </div>
      </div>
      {loading ? (
        <><Skeleton h={54} /><Skeleton h={120} style={{ marginTop: 12 }} /></>
      ) : (
        <DeptProgramGroups
          groups={groups}
          emptyText={meritView === 'final' ? 'No finalized merit entries yet.' : 'No merit entries yet.'}
          renderProgram={(d, p) => (
            <DataTable
              columns={columns} rows={p.rows} loading={false}
              defaultSort={{ key: 'totalMerit', dir: 'desc' }}
              exportName={`${meritView}-merit-${slug(d.deptName)}-${slug(p.progName)}`}
              exportTitle={`${meritView === 'final' ? 'Final' : 'Initial'} Merit — ${d.deptName} / ${p.progName}`}
              searchKeys={[]} emptyText="No merit entries." />
          )}
        />
      )}
    </>
  );
};

/* ============================== CYCLES ============================== */
export const Cycles = () => {
  // Phase 1 §3 — the Super Admin's Admission Cycle screen now renders the SAME
  // AdmissionCyclePanel used by the Director Admissions dashboard. This gives
  // 100% parity (identical fields, buttons, filters, validation, behaviour) and
  // both roles operate on the SAME backend records (/api/admission-cycle) for
  // real-time shared sync — no duplicate module, no separate table.
  return (
    <>
      <Breadcrumb items={[{ label: 'Admissions' }, { label: 'Admission Cycles' }]} />
      <PageHeader title="Admission Cycles" subtitle="Announce, edit, open/close admission cycles and configure per-program merit, seats & fees. Identical to Director Admissions and fully synced in real time." />
      <div className="sa-card" style={{ padding: 16 }}>
        <AdmissionCyclePanel />
      </div>
    </>
  );
};

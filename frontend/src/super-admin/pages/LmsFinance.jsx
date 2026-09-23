// ============================================================
//  SUPER ADMIN — FEES & FINANCE GOVERNANCE  (Provost effect)
//  ------------------------------------------------------------
//  Announce a fee → creates a LmsFeeAnnouncement AND issues a
//  challan into every matching student's account book (exactly
//  like a Provost fee announcement). Review individual challans
//  (approve / reject submitted payments).
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import {
  PageHeader, Breadcrumb, Badge, useToast, FormModal, ConfirmationModal,
} from '../components/ui';

const TABS = [
  { key: 'challans', label: 'Challans', icon: 'fa-file-invoice-dollar' },
  { key: 'announce', label: 'Announce Fee', icon: 'fa-bullhorn' },
];

const challanColor = (s) =>
  s === 'PAID' || s === 'APPROVED' ? 'green'
  : s === 'REJECTED' ? 'red'
  : s === 'SUBMITTED' || s === 'UNDER_REVIEW' ? 'blue' : 'amber';

export const FeesFinance = () => {
  const [tab, setTab] = useState('challans');
  return (
    <>
      <Breadcrumb items={[{ label: 'LMS Oversight' }, { label: 'Fees & Finance' }]} />
      <PageHeader title="Fees & Finance"
        subtitle="Announce fees that bill students instantly, and review submitted challans — with full Provost authority." />
      <div className="sa-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`sa-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <i className={`fas ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        {tab === 'challans' && <ChallansTab />}
        {tab === 'announce' && <AnnounceTab onDone={() => setTab('challans')} />}
      </div>
    </>
  );
};

/* ----------------------------- Challans ----------------------------- */
const ChallansTab = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [pg, setPg] = useState(null);
  const [loading, setLoading] = useState(true); const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [reviewFor, setReviewFor] = useState(null); const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = { page: p, pageSize: 25 };
      if (statusFilter) params.status = statusFilter;
      const { data } = await saApi.lmsFeeChallans(params);
      setRows(data.challans || []); setPg(data.pagination);
    } catch { toast.push('Failed to load challans', 'error'); }
    finally { setLoading(false); }
  }, [statusFilter, toast]);
  useEffect(() => { load(page); }, [page, statusFilter]); // eslint-disable-line

  const review = async (action) => {
    setBusy(true);
    try {
      await saApi.lmsReviewFee(reviewFor.id, { action, reason: reason || undefined });
      toast.push(`Challan ${action === 'APPROVE' ? 'approved' : 'rejected'}`, 'success');
      setReviewFor(null); setReason(''); load(page);
    } catch (e) { toast.push(e.response?.data?.error || 'Review failed', 'error'); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'challanNo', header: 'Challan #', exportValue: (r) => r.challanNo },
    { key: 'title', header: 'Title', exportValue: (r) => r.title },
    { key: 'studentId', header: 'Student', render: (r) => r.student?.username || r.studentId, exportValue: (r) => r.student?.username || r.studentId },
    { key: 'totalAmount', header: 'Amount', render: (r) => `Rs ${r.totalAmount?.toLocaleString?.() ?? r.totalAmount}`, exportValue: (r) => r.totalAmount },
    { key: 'status', header: 'Status', render: (r) => <Badge color={challanColor(r.status)}>{r.status}</Badge>, exportValue: (r) => r.status },
    { key: 'dueDate', header: 'Due', render: (r) => r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—', exportValue: (r) => r.dueDate },
    { key: '__a', header: '', render: (r) => (
      <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setReviewFor(r)}><i className="fas fa-gavel" /> Review</button>
    ), tdStyle: { textAlign: 'right' }, exportable: false },
  ];

  const filters = (
    <select className="sa-filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
      <option value="">All statuses</option>
      {['UNPAID', 'SUBMITTED', 'UNDER_REVIEW', 'PAID', 'APPROVED', 'REJECTED'].map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  return (
    <>
      <DataTable columns={columns} rows={rows} loading={loading} filters={filters}
        exportName="fee-challans" exportTitle="Fee Challans" searchKeys={['challanNo', 'title']}
        pagination={pg} onPageChange={setPage} />
      {reviewFor && (
        <FormModal open title={`Review challan ${reviewFor.challanNo}`}
          subtitle={`${reviewFor.title} · Rs ${reviewFor.totalAmount}`}
          submitLabel="Approve payment" loading={busy} onClose={() => { setReviewFor(null); setReason(''); }} onSubmit={() => review('APPROVE')}>
          <div className="sa-field"><label>Decision note</label>
            <textarea className="sa-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional remark (required when rejecting)…" /></div>
          <button type="button" className="sa-btn sa-btn-danger" disabled={busy} onClick={() => { if (!reason.trim()) { toast.push('A reason is required to reject', 'error'); return; } review('REJECT'); }}>
            <i className="fas fa-xmark" /> Reject payment
          </button>
        </FormModal>
      )}
    </>
  );
};

/* ----------------------------- Announce fee ----------------------------- */
const blankFee = {
  feeType: 'TUITION', title: '', description: '', amount: '', dueDate: '',
  scope: 'UNIVERSITY', department: '', program: '', semester: '', section: '',
};
const AnnounceTab = ({ onDone }) => {
  const toast = useToast();
  const [f, setF] = useState(blankFee); const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const doAnnounce = async () => {
    setBusy(true);
    try {
      const { data } = await saApi.lmsAnnounceFee({
        ...f, amount: Number(f.amount),
        semester: f.semester ? Number(f.semester) : undefined,
        department: f.scope === 'DEPARTMENT' ? f.department : undefined,
        program: f.scope === 'PROGRAM' ? f.program : undefined,
      });
      toast.push(`Fee announced — ${data.challansCreated} challans issued to student account books`, 'success');
      setF(blankFee); setConfirm(false); onDone();
    } catch (e) { toast.push(e.response?.data?.error || 'Failed to announce fee', 'error'); }
    finally { setBusy(false); }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!f.title || !f.amount) { toast.push('Title and amount are required', 'error'); return; }
    setConfirm(true);
  };

  return (
    <form className="sa-card sa-card-pad" style={{ maxWidth: 640 }} onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="sa-field"><label>Fee type</label>
          <select className="sa-select" value={f.feeType} onChange={(e) => setF({ ...f, feeType: e.target.value })}>
            {['TUITION', 'EXAM', 'ADMISSION', 'SECURITY', 'LIBRARY', 'FINE', 'OTHER'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="sa-field"><label>Amount (Rs) *</label><input className="sa-input" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
      </div>
      <div className="sa-field"><label>Title *</label><input className="sa-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Spring 2025 Tuition Fee" /></div>
      <div className="sa-field"><label>Description</label><textarea className="sa-textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="sa-field"><label>Due date</label><input className="sa-input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
        <div className="sa-field"><label>Scope</label>
          <select className="sa-select" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>
            <option value="UNIVERSITY">Whole university</option>
            <option value="DEPARTMENT">By department</option>
            <option value="PROGRAM">By program</option>
          </select>
        </div>
      </div>
      {f.scope === 'DEPARTMENT' && (
        <div className="sa-field"><label>Department</label><input className="sa-input" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} placeholder="Department name as stored on student profiles" /></div>
      )}
      {f.scope === 'PROGRAM' && (
        <div className="sa-field"><label>Program (short form)</label><input className="sa-input" value={f.program} onChange={(e) => setF({ ...f, program: e.target.value })} placeholder="e.g. BSCS, BBA" /></div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="sa-field"><label>Semester (label on challan)</label><input className="sa-input" type="number" value={f.semester} onChange={(e) => setF({ ...f, semester: e.target.value })} /></div>
        <div className="sa-field"><label>Section (label on challan)</label><input className="sa-input" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} /></div>
      </div>
      <button className="sa-btn sa-btn-primary" type="submit"><i className="fas fa-bullhorn" /> Announce fee</button>

      <ConfirmationModal open={confirm} title="Issue this fee to students?"
        message={`A challan for Rs ${f.amount} ("${f.title}") will be added to every matching student's account book immediately.`}
        confirmLabel="Issue challans" loading={busy} onClose={() => setConfirm(false)} onConfirm={doAnnounce} />
    </form>
  );
};

export default FeesFinance;

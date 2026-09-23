// ============================================================
//  SUPER ADMIN — EXAMS & RECHECKS GOVERNANCE  (Exam Controller effect)
//  ------------------------------------------------------------
//  • Exams      — view scheduled exams (oversight)
//  • Rechecks   — process recheck requests: approve / reject /
//                 resolve with updated marks (writes through to
//                 the LMS exactly as the Exam Controller would).
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import {
  PageHeader, Breadcrumb, Badge, useToast, FormModal,
} from '../components/ui';

const TABS = [
  { key: 'rechecks', label: 'Recheck Requests', icon: 'fa-magnifying-glass-chart' },
  { key: 'exams', label: 'Exam Schedule', icon: 'fa-calendar-day' },
];

const recheckColor = (s) =>
  String(s).startsWith('RESOLVED') ? 'green'
  : s === 'REJECTED' ? 'red'
  : s === 'IN_PROGRESS' || s === 'UNDER_REVIEW' ? 'blue' : 'amber';

export const ExamsRechecks = () => {
  const [tab, setTab] = useState('rechecks');
  return (
    <>
      <Breadcrumb items={[{ label: 'LMS Oversight' }, { label: 'Exams & Rechecks' }]} />
      <PageHeader title="Exams & Rechecks"
        subtitle="Process recheck requests and oversee the exam schedule with full Exam Controller authority." />
      <div className="sa-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`sa-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <i className={`fas ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        {tab === 'rechecks' && <RechecksTab />}
        {tab === 'exams' && <ExamsTab />}
      </div>
    </>
  );
};

/* ----------------------------- Rechecks ----------------------------- */
const RechecksTab = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [editFor, setEditFor] = useState(null); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ status: 'RESOLVED_CHANGED', newMarks: '', resolution: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const { data } = await saApi.lmsRechecks(params);
      setRows(data.rechecks || []);
    } catch { toast.push('Failed to load recheck requests', 'error'); }
    finally { setLoading(false); }
  }, [statusFilter, toast]);
  useEffect(() => { load(); }, [load]);

  const openEdit = (r) => {
    setEditFor(r);
    setForm({ status: 'RESOLVED_CHANGED', newMarks: r.newMarks ?? '', resolution: r.resolution || '' });
  };
  const submit = async () => {
    setBusy(true);
    try {
      await saApi.lmsUpdateRecheck(editFor.id, {
        status: form.status,
        newMarks: form.newMarks !== '' ? Number(form.newMarks) : undefined,
        resolution: form.resolution || undefined,
      });
      toast.push(`Recheck #${editFor.id} → ${form.status}`, 'success');
      setEditFor(null); load();
    } catch (e) { toast.push(e.response?.data?.error || 'Failed to update recheck', 'error'); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'id', header: 'Req #', render: (r) => `#${r.id}`, exportValue: (r) => r.id },
    { key: 'studentId', header: 'Student', render: (r) => r.studentId, exportValue: (r) => r.studentId },
    { key: 'courseCode', header: 'Course', render: (r) => r.courseCode || r.offeringId || '—', exportValue: (r) => r.courseCode },
    { key: 'examType', header: 'Exam', render: (r) => r.examType || '—', exportValue: (r) => r.examType },
    { key: 'currentMarks', header: 'Current', render: (r) => r.currentMarks ?? '—', exportValue: (r) => r.currentMarks },
    { key: 'newMarks', header: 'New', render: (r) => r.newMarks ?? '—', exportValue: (r) => r.newMarks },
    { key: 'status', header: 'Status', render: (r) => <Badge color={recheckColor(r.status)}>{r.status}</Badge>, exportValue: (r) => r.status },
    { key: '__a', header: '', render: (r) => (
      <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => openEdit(r)}><i className="fas fa-gavel" /> Process</button>
    ), tdStyle: { textAlign: 'right' }, exportable: false },
  ];

  const filters = (
    <select className="sa-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
      <option value="">All statuses</option>
      {['PENDING', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED_CHANGED', 'RESOLVED_UNCHANGED', 'REJECTED'].map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  return (
    <>
      <DataTable columns={columns} rows={rows} loading={loading} filters={filters}
        exportName="recheck-requests" exportTitle="Recheck Requests" searchKeys={['courseCode', 'examType']}
        emptyText="No recheck requests." />
      {editFor && (
        <FormModal open title={`Process recheck #${editFor.id}`}
          subtitle={`Student ${editFor.studentId} · ${editFor.courseCode || ''} ${editFor.examType || ''}`}
          submitLabel="Apply decision" loading={busy} onClose={() => setEditFor(null)} onSubmit={submit}>
          <div className="sa-field"><label>Decision</label>
            <select className="sa-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="RESOLVED_CHANGED">Resolved — marks changed</option>
              <option value="RESOLVED_UNCHANGED">Resolved — marks unchanged</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          {form.status === 'RESOLVED_CHANGED' && (
            <div className="sa-field"><label>New marks</label><input className="sa-input" type="number" value={form.newMarks} onChange={(e) => setForm({ ...form, newMarks: e.target.value })} /></div>
          )}
          <div className="sa-field"><label>Resolution note</label><textarea className="sa-textarea" value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })} placeholder="Recorded with the recheck decision…" /></div>
        </FormModal>
      )}
    </>
  );
};

/* ----------------------------- Exams ----------------------------- */
const ExamsTab = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [pg, setPg] = useState(null);
  const [loading, setLoading] = useState(true); const [page, setPage] = useState(1);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try { const { data } = await saApi.lmsExams({ page: p, pageSize: 25 }); setRows(data.exams || []); setPg(data.pagination); }
    catch { toast.push('Failed to load exams', 'error'); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(page); }, [page]); // eslint-disable-line

  const columns = [
    { key: 'title', header: 'Exam', render: (r) => r.title || r.examType, exportValue: (r) => r.title || r.examType },
    { key: 'examType', header: 'Type', render: (r) => <Badge color="blue">{r.examType}</Badge>, exportValue: (r) => r.examType },
    { key: 'date', header: 'Date', render: (r) => r.date ? new Date(r.date).toLocaleDateString() : '—', exportValue: (r) => r.date },
    { key: 'status', header: 'Status', render: (r) => <Badge color={r.status === 'COMPLETED' ? 'green' : 'amber'}>{r.status}</Badge>, exportValue: (r) => r.status },
  ];
  return (
    <DataTable columns={columns} rows={rows} loading={loading} exportName="exam-schedule" exportTitle="Exam Schedule"
      searchKeys={['title', 'examType']} pagination={pg} onPageChange={setPage} emptyText="No exams scheduled." />
  );
};

export default ExamsRechecks;

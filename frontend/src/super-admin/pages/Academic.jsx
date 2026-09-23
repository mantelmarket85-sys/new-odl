// ============================================================
//  SUPER ADMIN — ACADEMIC CONFIGURATION PAGES
//  Sessions (batches), Grading Scale, Academic Terms (read-only).
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import {
  PageHeader, Breadcrumb, Badge, FormModal, ConfirmationModal, useToast,
} from '../components/ui';

/* ---------------- Academic sessions ---------------- */
export const Sessions = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [archive, setArchive] = useState(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', isActive: false });

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await saApi.listSessions(); setRows(data.sessions || []); }
    catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name) { toast.push('Name required', 'error'); return; }
    setBusy(true);
    try { await saApi.createSession(form); toast.push('Session created', 'success'); setOpen(false); setForm({ name: '', startDate: '', endDate: '', isActive: false }); load(); }
    catch (e) { toast.push(e.response?.data?.error || 'Failed', 'error'); } finally { setBusy(false); }
  };
  const toggleActive = async (s) => { try { await saApi.updateSession(s.id, { isActive: !s.isActive }); load(); } catch { toast.push('Failed', 'error'); } };
  const doArchive = async () => { setBusy(true); try { await saApi.archiveSession(archive.id); toast.push('Archived', 'success'); setArchive(null); load(); } catch { toast.push('Failed', 'error'); } finally { setBusy(false); } };

  const columns = [
    { key: 'name', header: 'Session', render: (r) => <strong>{r.name}</strong> },
    { key: 'startDate', header: 'Start', render: (r) => r.startDate ? new Date(r.startDate).toLocaleDateString() : '—' },
    { key: 'endDate', header: 'End', render: (r) => r.endDate ? new Date(r.endDate).toLocaleDateString() : '—' },
    { key: 'isActive', header: 'Status', render: (r) => r.isArchived ? <Badge color="gray">Archived</Badge> : <Badge color={r.isActive ? 'green' : 'amber'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: '__actions', header: '', render: (r) => !r.isArchived && (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => toggleActive(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</button>
        <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setArchive(r)}><i className="fas fa-box-archive" /></button>
      </div>
    ), tdStyle: { textAlign: 'right' } },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'Academic' }, { label: 'Sessions' }]} />
      <PageHeader title="Academic Sessions" subtitle="Batches / sessions such as Fall 2026, Spring 2027."
        actions={<button className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}><i className="fas fa-plus" /> New Session</button>} />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="sessions" searchKeys={['name']} />
      <FormModal open={open} title="New Academic Session" submitLabel="Create" loading={busy} onClose={() => setOpen(false)} onSubmit={create}>
        <div className="sa-field"><label>Name</label><input className="sa-input" placeholder="Fall 2026" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="sa-field"><label>Start Date</label><input className="sa-input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div className="sa-field"><label>End Date</label><input className="sa-input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Set as active session</label>
      </FormModal>
      <ConfirmationModal open={!!archive} title="Archive session?" message={`${archive?.name} will be archived and deactivated.`} confirmLabel="Archive" loading={busy} onClose={() => setArchive(null)} onConfirm={doArchive} />
    </>
  );
};

/* ---------------- Grading scale ---------------- */
export const Grading = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);
  const [form, setForm] = useState({ grade: '', gpaPoints: '', minMarks: '', maxMarks: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await saApi.listGrading(); setRows(data.scales || []); }
    catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.grade || form.gpaPoints === '' || form.minMarks === '' || form.maxMarks === '') { toast.push('All fields required', 'error'); return; }
    setBusy(true);
    try { await saApi.createGrade(form); toast.push('Grade added', 'success'); setOpen(false); setForm({ grade: '', gpaPoints: '', minMarks: '', maxMarks: '' }); load(); }
    catch { toast.push('Failed', 'error'); } finally { setBusy(false); }
  };
  const remove = async () => { setBusy(true); try { await saApi.deleteGrade(del.id); toast.push('Deleted', 'success'); setDel(null); load(); } catch { toast.push('Failed', 'error'); } finally { setBusy(false); } };

  const columns = [
    { key: 'grade', header: 'Grade', render: (r) => <Badge color="blue">{r.grade}</Badge> },
    { key: 'gpaPoints', header: 'GPA Points' },
    { key: 'minMarks', header: 'Min Marks' },
    { key: 'maxMarks', header: 'Max Marks' },
    { key: '__actions', header: '', render: (r) => <button className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => setDel(r)}><i className="fas fa-trash" /></button>, tdStyle: { textAlign: 'right' } },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'Academic' }, { label: 'Grading Scale' }]} />
      <PageHeader title="Grading Scale" subtitle="Letter grades, GPA points and mark ranges."
        actions={<button className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}><i className="fas fa-plus" /> Add Grade</button>} />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="grading-scale" searchKeys={['grade']} emptyText="No grades defined yet." />
      <FormModal open={open} title="Add Grade" submitLabel="Add" loading={busy} onClose={() => setOpen(false)} onSubmit={create}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="sa-field"><label>Grade</label><input className="sa-input" placeholder="A" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></div>
          <div className="sa-field"><label>GPA Points</label><input className="sa-input" type="number" step="0.01" value={form.gpaPoints} onChange={(e) => setForm({ ...form, gpaPoints: e.target.value })} /></div>
          <div className="sa-field"><label>Min Marks</label><input className="sa-input" type="number" value={form.minMarks} onChange={(e) => setForm({ ...form, minMarks: e.target.value })} /></div>
          <div className="sa-field"><label>Max Marks</label><input className="sa-input" type="number" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} /></div>
        </div>
      </FormModal>
      <ConfirmationModal open={!!del} danger title="Delete grade?" message={`Grade ${del?.grade}`} confirmLabel="Delete" loading={busy} onClose={() => setDel(null)} onConfirm={remove} />
    </>
  );
};

/* ---------------- Academic terms (read-only) ---------------- */
export const Terms = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => {
    try { const { data } = await saApi.listTerms(); setRows(data.terms || []); }
    catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); }
  })(); }, []); // eslint-disable-line

  const columns = [
    { key: 'code', header: 'Code', render: (r) => <Badge color="blue">{r.code}</Badge> },
    { key: 'title', header: 'Title', render: (r) => <strong>{r.title}</strong> },
    { key: 'startDate', header: 'Start' },
    { key: 'endDate', header: 'End' },
    { key: 'offerings', header: 'Offerings', render: (r) => r._count?.offerings ?? 0 },
    { key: 'isCurrent', header: 'Current', render: (r) => r.isCurrent ? <Badge color="green">Current</Badge> : <Badge color="gray">—</Badge> },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'Academic' }, { label: 'Terms' }]} />
      <PageHeader title="Academic Terms" subtitle="LMS teaching terms (read-only oversight)." />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="terms" searchKeys={['code', 'title']} />
    </>
  );
};

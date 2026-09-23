// ============================================================
//  SUPER ADMIN — LMS STUDENT CONTROL  (Focal Person + Provost effect)
//  ------------------------------------------------------------
//  Search any student, then perform full lifecycle actions with the
//  same effect the original role would produce: drop, restore, issue
//  fine, block, unblock, promote/detain. All write live to the LMS.
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import {
  PageHeader, Breadcrumb, Badge, useToast, FormModal, ConfirmationModal, OverrideModal,
} from '../components/ui';

export const StudentControl = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [pg, setPg] = useState(null);
  const [loading, setLoading] = useState(true); const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [fineFor, setFineFor] = useState(null);
  const [dropFor, setDropFor] = useState(null);
  const [restoreFor, setRestoreFor] = useState(null);
  const [blockFor, setBlockFor] = useState(null);
  const [promoteFor, setPromoteFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fine, setFine] = useState({ title: '', reason: '', amount: '', dueDate: '' });

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const { data } = await saApi.lmsSearchStudents({ page: p, pageSize: 25, q });
      setRows(data.students || []); setPg(data.pagination);
    } catch { toast.push('Failed to search students', 'error'); }
    finally { setLoading(false); }
  }, [q, toast]);
  useEffect(() => { load(page); }, [page]); // eslint-disable-line

  const submitFine = async () => {
    if (!fine.title || !fine.amount) { toast.push('Title and amount required', 'error'); return; }
    setBusy(true);
    try {
      await saApi.lmsIssueFine(fineFor.id, { ...fine, amount: Number(fine.amount) });
      toast.push('Fine issued — added to student account book', 'success');
      setFineFor(null); setFine({ title: '', reason: '', amount: '', dueDate: '' });
    } catch (e) { toast.push(e.response?.data?.error || 'Failed to issue fine', 'error'); }
    finally { setBusy(false); }
  };

  const submitDrop = async (reason) => {
    setBusy(true);
    try { await saApi.lmsDropStudent(dropFor.id, reason); toast.push('Student dropped — LMS access revoked', 'success'); setDropFor(null); load(page); }
    catch (e) { toast.push(e.response?.data?.error || 'Drop failed', 'error'); }
    finally { setBusy(false); }
  };
  const submitRestore = async () => {
    setBusy(true);
    try { await saApi.lmsRestoreStudent(restoreFor.id, 'Restored by Super Admin'); toast.push('Student restored — LMS access granted', 'success'); setRestoreFor(null); load(page); }
    catch (e) { toast.push(e.response?.data?.error || 'Restore failed', 'error'); }
    finally { setBusy(false); }
  };
  const submitBlock = async (reason) => {
    setBusy(true);
    try { await saApi.lmsBlockStudent(blockFor.id, reason); toast.push('Student blocked', 'success'); setBlockFor(null); }
    catch (e) { toast.push(e.response?.data?.error || 'Block failed', 'error'); }
    finally { setBusy(false); }
  };
  const submitPromotion = async (decision) => {
    setBusy(true);
    try { await saApi.lmsSetPromotion(promoteFor.id, { decision, reason: `Super Admin ${decision}` }); toast.push(`Student ${decision}D`, 'success'); setPromoteFor(null); }
    catch (e) { toast.push(e.response?.data?.error || 'Action failed', 'error'); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'username', header: 'Roll / Username', exportValue: (r) => r.username },
    { key: 'fullName', header: 'Name', render: (r) => r.profile?.fullName || '—', exportValue: (r) => r.profile?.fullName },
    { key: 'program', header: 'Program', render: (r) => r.profile?.programShortForm || '—', exportValue: (r) => r.profile?.programShortForm },
    { key: 'isActive', header: 'Access', render: (r) => <Badge color={r.isActive ? 'green' : 'red'}>{r.isActive ? 'Active' : 'Dropped'}</Badge>, exportValue: (r) => r.isActive ? 'Active' : 'Dropped' },
    { key: '__actions', header: '', render: (r) => (
      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setFineFor(r)} title="Issue fine"><i className="fas fa-money-bill" /></button>
        <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setPromoteFor(r)} title="Promotion"><i className="fas fa-arrow-up-right-dots" /></button>
        <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setBlockFor(r)} title="Block"><i className="fas fa-ban" /></button>
        {r.isActive
          ? <button className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => setDropFor(r)} title="Drop"><i className="fas fa-user-slash" /></button>
          : <button className="sa-btn sa-btn-primary sa-btn-sm" onClick={() => setRestoreFor(r)} title="Restore"><i className="fas fa-user-check" /></button>}
      </div>
    ), tdStyle: { textAlign: 'right' }, exportable: false },
  ];

  const filters = (
    <form onSubmit={(e) => { e.preventDefault(); setPage(1); load(1); }} style={{ display: 'flex', gap: 8 }}>
      <input className="sa-input" placeholder="Roll #, name, email, CNIC…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 230 }} />
      <button className="sa-btn sa-btn-primary" type="submit"><i className="fas fa-magnifying-glass" /> Search</button>
    </form>
  );

  return (
    <>
      <Breadcrumb items={[{ label: 'LMS Oversight' }, { label: 'Student Control' }]} />
      <PageHeader title="Student Control" subtitle="Search any student and act with Focal Person / Provost authority — drop, restore, fine, block, promote." />
      <DataTable columns={columns} rows={rows} loading={loading} searchable={false} filters={filters}
        exportName="students" exportTitle="LMS Students" pagination={pg} onPageChange={setPage} />

      {/* Issue fine */}
      {fineFor && (
        <FormModal open title={`Issue fine — ${fineFor.username}`} submitLabel="Issue fine" loading={busy} onClose={() => setFineFor(null)} onSubmit={submitFine}>
          <div className="sa-field"><label>Fine title *</label><input className="sa-input" value={fine.title} onChange={(e) => setFine({ ...fine, title: e.target.value })} /></div>
          <div className="sa-field"><label>Reason</label><input className="sa-input" value={fine.reason} onChange={(e) => setFine({ ...fine, reason: e.target.value })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="sa-field"><label>Amount (Rs) *</label><input className="sa-input" type="number" value={fine.amount} onChange={(e) => setFine({ ...fine, amount: e.target.value })} /></div>
            <div className="sa-field"><label>Due date</label><input className="sa-input" type="date" value={fine.dueDate} onChange={(e) => setFine({ ...fine, dueDate: e.target.value })} /></div>
          </div>
        </FormModal>
      )}

      {/* Promotion */}
      {promoteFor && (
        <FormModal open title={`Promotion — ${promoteFor.username}`} submitLabel="Promote" loading={busy}
          onClose={() => setPromoteFor(null)} onSubmit={() => submitPromotion('PROMOTE')}>
          <p style={{ fontSize: 13, color: 'var(--sa-text-soft)' }}>Promote completes the student's current registrations to the next semester. Use Detain to flag detention.</p>
          <button type="button" className="sa-btn sa-btn-danger" style={{ marginTop: 8 }} disabled={busy} onClick={() => submitPromotion('DETAIN')}>
            <i className="fas fa-hand" /> Detain instead
          </button>
        </FormModal>
      )}

      <OverrideModal open={!!dropFor} title={`Drop ${dropFor?.username}?`}
        message="The student will immediately lose LMS access and current registrations become DROPPED."
        loading={busy} onClose={() => setDropFor(null)} onConfirm={submitDrop} />

      <OverrideModal open={!!blockFor} title={`Block ${blockFor?.username}?`}
        message="A finance block will be recorded for this student."
        loading={busy} onClose={() => setBlockFor(null)} onConfirm={submitBlock} />

      <ConfirmationModal open={!!restoreFor} title={`Restore ${restoreFor?.username}?`}
        message="LMS access will be granted again and dropped registrations restored."
        confirmLabel="Restore student" loading={busy} onClose={() => setRestoreFor(null)} onConfirm={submitRestore} />
    </>
  );
};

export default StudentControl;

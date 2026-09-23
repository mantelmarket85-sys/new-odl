// ============================================================
//  SUPER ADMIN — TRANSFER RESPONSIBILITIES
//  ------------------------------------------------------------
//  Reassign all of one LMS staff member's teaching duties (course
//  offerings + sections) to another — with ZERO data loss. The
//  source keeps their account; only the live assignments move.
//  Used when a teacher leaves / is replaced mid-term.
// ============================================================
import React, { useEffect, useState } from 'react';
import saApi from '../saApi';
import {
  PageHeader, Breadcrumb, useToast, ConfirmationModal, Skeleton,
} from '../components/ui';

export const TransferDuties = () => {
  const toast = useToast();
  const [staff, setStaff] = useState([]); const [loading, setLoading] = useState(true);
  const [fromId, setFromId] = useState(''); const [toId, setToId] = useState('');
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Teaching staff are LMS users — load Teachers + Course Coordinators.
        const [t, c] = await Promise.all([
          saApi.listUsers({ system: 'lms', role: 'Teacher' }),
          saApi.listUsers({ system: 'lms', role: 'CourseCoordinator' }).catch(() => ({ data: { users: [] } })),
        ]);
        const merged = [...(t.data.users || []), ...(c.data.users || [])];
        // de-dup by id
        const seen = new Set(); const out = [];
        merged.forEach((u) => { if (!seen.has(u.id)) { seen.add(u.id); out.push(u); } });
        setStaff(out);
      } catch { toast.push('Failed to load staff', 'error'); }
      finally { setLoading(false); }
    })();
  }, [toast]);

  const fromUser = staff.find((u) => u.id === fromId);
  const toUser = staff.find((u) => u.id === toId);

  const submit = (e) => {
    e.preventDefault();
    if (!fromId || !toId) { toast.push('Select both source and target staff', 'error'); return; }
    if (fromId === toId) { toast.push('Source and target must be different', 'error'); return; }
    setConfirm(true);
  };
  const doTransfer = async () => {
    setBusy(true);
    try {
      const { data } = await saApi.transferResponsibilities({ fromId, toId, reason: reason || undefined });
      toast.push(`Transferred ${data.offeringsMoved} offerings & ${data.sectionsMoved} sections`, 'success');
      setConfirm(false); setFromId(''); setToId(''); setReason('');
    } catch (e) { toast.push(e.response?.data?.error || 'Transfer failed', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'User Management' }, { label: 'Transfer Duties' }]} />
      <PageHeader title="Transfer Responsibilities"
        subtitle="Move all teaching duties (course offerings & sections) from one staff member to another — with zero data loss." />

      {loading ? <Skeleton h={260} /> : (
        <form className="sa-card sa-card-pad" style={{ maxWidth: 620 }} onSubmit={submit}>
          <div className="sa-field"><label>Transfer from (source staff)</label>
            <select className="sa-select" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">— Choose staff —</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.username} · {u.roleLabel || u.role} · {u.email}</option>)}
            </select>
          </div>

          <div style={{ textAlign: 'center', color: 'var(--sa-text-soft)', margin: '4px 0' }}>
            <i className="fas fa-arrow-down" />
          </div>

          <div className="sa-field"><label>Transfer to (target staff)</label>
            <select className="sa-select" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">— Choose staff —</option>
              {staff.filter((u) => u.id !== fromId).map((u) => <option key={u.id} value={u.id}>{u.username} · {u.roleLabel || u.role} · {u.email}</option>)}
            </select>
          </div>

          <div className="sa-field"><label>Reason</label>
            <textarea className="sa-textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Teacher on long leave; duties reassigned mid-semester." /></div>

          <button className="sa-btn sa-btn-primary" type="submit"><i className="fas fa-people-arrows" /> Transfer duties</button>
        </form>
      )}

      <ConfirmationModal open={confirm} title="Transfer all duties?"
        message={`All course offerings & sections taught by ${fromUser?.username || ''} will be reassigned to ${toUser?.username || ''}. The source account is preserved.`}
        confirmLabel="Transfer now" loading={busy} onClose={() => setConfirm(false)} onConfirm={doTransfer} />
    </>
  );
};

export default TransferDuties;

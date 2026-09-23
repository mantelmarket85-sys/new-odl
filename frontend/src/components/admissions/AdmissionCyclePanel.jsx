// ============================================================
//  SHARED — ADMISSION CYCLE PANEL  (Phase 1 §3)
//  ------------------------------------------------------------
//  Single source of truth for the "Announce / Manage Admission
//  Cycle" screen. Rendered IDENTICALLY by BOTH the Director
//  Admissions dashboard AND the Super Admin (Admissions
//  Governance) screen so the two are guaranteed to have the
//  same fields / buttons / filters / validation / behaviour and
//  operate on the SAME backend records (/api/admission-cycle),
//  giving real-time shared sync between the two roles.
//
//  This component was extracted verbatim from the Director's
//  AnnounceCycleSection — no behaviour change, no duplicate DB.
// ============================================================
import { useEffect, useState } from 'react';
import api from '../../utils/api';

const AdmissionCyclePanel = () => {
  const [allPrograms, setAllPrograms] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  // editingCycleId: null = create mode, number = editing that cycle
  const [editingCycleId, setEditingCycleId] = useState(null);
  const blankForm = {
    title: '', startDate: '', endDate: '', termCode: 'F26',
    matricWeight: 30, fscWeight: 40, interviewWeight: 30,
    applicationProcessingFee: 1200,
  };
  const [form, setForm] = useState(blankForm);
  // Map of programId → per-program config { selected, meritCriteria, minMarksPercent, totalSeats, feeBreakdown:[{label,amount}] }
  const [programConfig, setProgramConfig] = useState({});

  const load = async () => {
    try {
      const [d, c] = await Promise.all([
        api.get('/departments'),
        api.get('/admission-cycle').catch(() => ({ data: { cycles: [] } })),
      ]);
      const list = [];
      (d.data.departments || []).forEach((dept) => {
        (dept.programs || []).forEach((p) => {
          list.push({ id: p.id, label: `${dept.name} — ${p.shortForm || p.code}`, name: p.name });
        });
      });
      setAllPrograms(list);
      setCycles(c.data.cycles || []);
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to load programs' });
    }
  };
  useEffect(() => {
    load();
    // §1.1 Real-time sync — keep the cycle list live without a manual refresh
    // so edits/deselects made elsewhere (or by the Super Admin panel, which
    // renders this same component on the same records) reflect here too.
    const t = setInterval(() => { if (!editingCycleId) load(); }, 10000);
    const onRefresh = () => { if (!editingCycleId) load(); };
    const onFocus = () => { if (!editingCycleId) load(); };
    window.addEventListener('aust:refresh', onRefresh);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('aust:refresh', onRefresh);
      window.removeEventListener('focus', onFocus);
    };
  }, [editingCycleId]);

  const toggleProgram = (id) => {
    setProgramConfig((prev) => {
      const next = { ...prev };
      if (next[id]?.selected) {
        next[id] = { ...next[id], selected: false };
      } else {
        next[id] = {
          selected: true,
          meritCriteria: next[id]?.meritCriteria || '',
          minMarksPercent: next[id]?.minMarksPercent ?? 50,
          totalSeats: next[id]?.totalSeats ?? 40,
          feeBreakdown: next[id]?.feeBreakdown || [{ label: 'Semester Fee', amount: '' }],
        };
      }
      return next;
    });
  };
  const setPC = (id, field, val) => setProgramConfig((prev) => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  const setFeeLine = (id, idx, field, val) => {
    setProgramConfig((prev) => {
      const lines = [...(prev[id].feeBreakdown || [])];
      lines[idx] = { ...lines[idx], [field]: val };
      return { ...prev, [id]: { ...prev[id], feeBreakdown: lines } };
    });
  };
  const addFeeLine = (id) => setProgramConfig((prev) => ({ ...prev, [id]: { ...prev[id], feeBreakdown: [...(prev[id].feeBreakdown || []), { label: '', amount: '' }] } }));
  const removeFeeLine = (id, idx) => setProgramConfig((prev) => ({ ...prev, [id]: { ...prev[id], feeBreakdown: prev[id].feeBreakdown.filter((_, i) => i !== idx) } }));
  const feeTotal = (id) => (programConfig[id]?.feeBreakdown || []).reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    // Merit weightage is now per-program (Additional Fixes §3) — no cycle-level
    // weight validation. Cycle still sends legacy defaults for backward-compat.
    const programs = Object.entries(programConfig)
      .filter(([, v]) => v.selected)
      .map(([pid, v]) => ({
        programId: parseInt(pid),
        meritCriteria: v.meritCriteria,
        minMarksPercent: parseFloat(v.minMarksPercent) || 50,
        totalSeats: parseInt(v.totalSeats) || 0,
        // Phase 2: Semester fee is NOT configured here anymore — it lives in the
        // Fee Management module. We intentionally omit `feeBreakdown` so the
        // backend preserves any fee already set there.
      }));
    if (!programs.length) return setMsg({ type: 'error', text: 'Select at least one program' });
    setSaving(true);
    try {
      if (editingCycleId) {
        const res = await api.put(`/admission-cycle/${editingCycleId}`, { ...form, programs });
        setMsg({ type: 'success', text: res.data.message || 'Admission cycle updated successfully' });
      } else {
        const res = await api.post('/admission-cycle/announce', { ...form, programs });
        setMsg({ type: 'success', text: res.data.message || 'Cycle announced' });
      }
      setProgramConfig({});
      setForm(blankForm);
      setEditingCycleId(null);
      load();
      // §1.1 Propagate the change everywhere it is used, in real time.
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || (editingCycleId ? 'Failed to update cycle' : 'Failed to announce cycle') });
    } finally { setSaving(false); }
  };

  const toggleCycle = async (id) => {
    try {
      await api.put(`/admission-cycle/${id}/toggle`);
      load();
      // §1.1 Deselect/select of a cycle must reflect everywhere in real time.
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch {}
  };

  // Open the announce form pre-filled with an existing cycle's values for editing.
  const editCycle = async (c) => {
    setMsg({ type: '', text: '' });
    setEditingCycleId(c.id);
    setForm({
      title: c.title || '',
      startDate: c.startDate || '',
      endDate: c.endDate || '',
      termCode: c.termCode || 'F26',
      matricWeight: c.matricWeight ?? 30,
      fscWeight: c.fscWeight ?? 40,
      interviewWeight: c.interviewWeight ?? 30,
      applicationProcessingFee: c.applicationFee ?? c.applicationProcessingFee ?? 1200,
    });
    // Load this cycle's per-program config and pre-select + pre-fill each.
    try {
      const res = await api.get(`/admission-cycle/${c.id}/programs`);
      const cfg = {};
      (res.data.programs || []).forEach((cp) => {
        // §1.1 Deselection fix: a program the Director previously deselected is
        // stored with isOpen=false. It must NOT be auto-reselected on reload —
        // it stays deselected until the Director explicitly re-checks it.
        if (cp.isOpen === false) return;
        const breakdown = Array.isArray(cp.feeBreakdown) && cp.feeBreakdown.length
          ? cp.feeBreakdown.map((li) => ({ label: li.label || '', amount: li.amount ?? '' }))
          : [{ label: 'Semester Fee', amount: '' }];
        cfg[cp.programId] = {
          selected: true,
          meritCriteria: cp.meritCriteria || '',
          minMarksPercent: cp.minMarksPercent ?? 50,
          totalSeats: cp.totalSeats ?? 40,
          feeBreakdown: breakdown,
        };
      });
      setProgramConfig(cfg);
    } catch {
      setProgramConfig({});
    }
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
  };

  const cancelEdit = () => {
    setEditingCycleId(null);
    setForm(blankForm);
    setProgramConfig({});
    setMsg({ type: '', text: '' });
  };

  return (
    <div>
      <h2 className="section-title">Announce Admissions Cycle</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {cycles.length > 0 && (
        <div className="card">
          <div className="card-header">Existing Cycles</div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Session</th><th>Period</th><th>Status</th><th>Proc. Fee</th><th>Actions</th></tr></thead>
              <tbody>
                {cycles.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.title}</strong></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.startDate} — {c.endDate}</td>
                    <td><span className={`badge badge-${c.isOpen ? 'open' : 'closed'}`}>{c.isOpen ? 'Open' : 'Closed'}</span></td>
                    <td>PKR {c.applicationFee ?? c.applicationProcessingFee}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-outline" title="Edit cycle" onClick={() => editCycle(c)}>
                          <i className="fas fa-pen" style={{ marginRight: 4 }}></i>Edit
                        </button>
                        <button className={`btn btn-sm ${c.isOpen ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleCycle(c.id)}>{c.isOpen ? 'Close' : 'Open'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">{editingCycleId ? `Edit Cycle — ${form.title || `#${editingCycleId}`}` : 'Announce New Cycle'}</div>
        {editingCycleId && (
          <div className="alert alert-info" style={{ margin: '0 0 1rem' }}>
            <i className="fas fa-circle-info" style={{ marginRight: 6 }}></i>
            Editing an existing cycle. Applications already submitted under this cycle are not affected — only the cycle and per-program settings are updated.
          </div>
        )}
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="form-group full-width"><label>Session Name <span className="required">*</span></label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Fall 2026 Admissions" required /></div>
            <div className="form-group"><label>Start Date <span className="required">*</span></label><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></div>
            <div className="form-group"><label>End Date <span className="required">*</span></label><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required /></div>
            <div className="form-group"><label>Term Code</label><input value={form.termCode} onChange={(e) => setForm({ ...form, termCode: e.target.value })} placeholder="F26" /></div>
            <div className="form-group"><label>Application Processing Fee (PKR)</label><input type="number" value={form.applicationProcessingFee} onChange={(e) => setForm({ ...form, applicationProcessingFee: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#1e40af' }}>
            <i className="fas fa-circle-info" style={{ marginRight: 6 }} />
            <b>Merit criteria (Matric / FSc / Interview weightage) are now configured per Program</b> by the Super Admin under
            Department &amp; Program Management. Each program can have its own weightage — including Interview = 0%.
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label style={{ fontWeight: 600 }}>Select Programs &amp; Configure <span className="required">*</span></label>
            {allPrograms.length === 0 && <div style={{ color: '#94a3b8', marginTop: 8 }}>No programs found. Create a department with programs first.</div>}
            {allPrograms.map((p) => {
              const cfg = programConfig[p.id] || {};
              return (
                <div key={p.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginTop: 8 }}>
                  <label style={{ fontWeight: 600 }}>
                    <input type="checkbox" checked={!!cfg.selected} onChange={() => toggleProgram(p.id)} /> {p.label}
                  </label>
                  {cfg.selected && (
                    <div style={{ marginTop: 10 }}>
                      <div className="form-grid">
                        <div className="form-group full-width"><label>Merit Criteria</label><input value={cfg.meritCriteria} onChange={(e) => setPC(p.id, 'meritCriteria', e.target.value)} placeholder="e.g. Matric 30% + FSc 40% + Interview 30%" /></div>
                        <div className="form-group"><label>Min Marks %</label><input type="number" value={cfg.minMarksPercent} onChange={(e) => setPC(p.id, 'minMarksPercent', e.target.value)} /></div>
                        <div className="form-group"><label>Total Seats</label><input type="number" value={cfg.totalSeats} onChange={(e) => setPC(p.id, 'totalSeats', e.target.value)} /></div>
                      </div>
                      {/* Phase 2: Semester Fee configuration removed from the Admission
                          Cycle. It now lives exclusively in the Fee Management module. */}
                      <div style={{ marginTop: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#166534' }}>
                        <i className="fas fa-circle-info" style={{ marginRight: 6 }} />
                        Semester / tuition fee for this program is configured in the <b>Fee Management</b> module (below), not here.
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? (editingCycleId ? 'Saving…' : 'Announcing…')
                : (editingCycleId ? 'Save Changes' : 'Announce Cycle')}
            </button>
            {editingCycleId && (
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={cancelEdit}>Cancel</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdmissionCyclePanel;

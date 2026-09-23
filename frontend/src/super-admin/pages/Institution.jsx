// ============================================================
//  SUPER ADMIN — INSTITUTION PAGES
//  Profile, Departments, Programs, Campuses (separate exports).
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import {
  PageHeader, Breadcrumb, Badge, FormModal, ConfirmationModal, useToast, Skeleton,
} from '../components/ui';

/* ---------------- University profile ---------------- */
export const Profile = () => {
  const toast = useToast();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { const { data } = await saApi.getProfile(); setP(data.profile); }
      catch { toast.push('Failed to load profile', 'error'); }
      finally { setLoading(false); }
    })();
  }, []); // eslint-disable-line

  const save = async () => {
    setBusy(true);
    try { const { data } = await saApi.updateProfile(p); setP(data.profile); toast.push('Profile saved', 'success'); }
    catch { toast.push('Save failed', 'error'); } finally { setBusy(false); }
  };

  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const fields = [
    ['name', 'University Name'], ['shortName', 'Short Name'], ['email', 'Email'], ['phone', 'Phone'],
    ['website', 'Website'], ['establishedYear', 'Established Year'], ['city', 'City'], ['province', 'Province'],
    ['country', 'Country'], ['accreditation', 'Accreditation'],
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'Institution' }, { label: 'University Profile' }]} />
      <PageHeader title="University Profile" subtitle="Core identity and contact details of the institution." />
      {loading ? <Skeleton h={320} /> : (
        <div className="sa-card sa-card-pad" style={{ maxWidth: 820 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {fields.map(([k, label]) => (
              <div className="sa-field" key={k}><label>{label}</label><input className="sa-input" value={p?.[k] || ''} onChange={set(k)} /></div>
            ))}
          </div>
          <div className="sa-field"><label>Address</label><textarea className="sa-textarea" value={p?.address || ''} onChange={set('address')} /></div>
          <div className="sa-field"><label>Vision & Mission</label><textarea className="sa-textarea" value={p?.visionMission || ''} onChange={set('visionMission')} /></div>
          <button className="sa-btn sa-btn-primary" onClick={save} disabled={busy}><i className="fas fa-floppy-disk" /> {busy ? 'Saving…' : 'Save Profile'}</button>
        </div>
      )}
    </>
  );
};

/* ---------------- Departments ---------------- */
export const Departments = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', faculty: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await saApi.listDepartments(); setRows(data.departments || []); }
    catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name) { toast.push('Name required', 'error'); return; }
    setBusy(true);
    try { await saApi.createDepartment(form); toast.push('Department created', 'success'); setOpen(false); setForm({ name: '', faculty: '' }); load(); }
    catch (e) { toast.push(e.response?.data?.error || 'Failed', 'error'); } finally { setBusy(false); }
  };
  const toggle = async (d) => {
    try { await saApi.updateDepartment(d.id, { isActive: !d.isActive }); load(); } catch { toast.push('Failed', 'error'); }
  };

  const columns = [
    { key: 'name', header: 'Department', render: (r) => <strong>{r.name}</strong> },
    { key: 'faculty', header: 'Faculty' },
    { key: 'programs', header: 'Programs', render: (r) => <Badge color="blue">{r.programs?.length || 0}</Badge> },
    { key: 'isActive', header: 'Status', render: (r) => <Badge color={r.isActive ? 'green' : 'amber'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: '__actions', header: '', render: (r) => <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => toggle(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</button>, tdStyle: { textAlign: 'right' } },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'Institution' }, { label: 'Departments' }]} />
      <PageHeader title="Departments" subtitle="Academic departments and faculties."
        actions={<button className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}><i className="fas fa-plus" /> Add Department</button>} />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="departments" searchKeys={['name', 'faculty']} />
      <FormModal open={open} title="Add Department" submitLabel="Create" loading={busy} onClose={() => setOpen(false)} onSubmit={create}>
        <div className="sa-field"><label>Name</label><input className="sa-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="sa-field"><label>Faculty</label><input className="sa-input" value={form.faculty} onChange={(e) => setForm({ ...form, faculty: e.target.value })} /></div>
      </FormModal>
    </>
  );
};

/* ---------------- Programs ---------------- */
export const Programs = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await saApi.listPrograms(); setRows(data.programs || []); }
    catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (p) => { try { await saApi.updateProgram(p.id, { isActive: !p.isActive }); load(); } catch { toast.push('Failed', 'error'); } };

  const columns = [
    { key: 'name', header: 'Program', render: (r) => <strong>{r.name}</strong> },
    { key: 'shortForm', header: 'Short' },
    { key: 'code', header: 'Code' },
    { key: 'department', header: 'Department', render: (r) => r.department?.name || '—' },
    { key: 'isActive', header: 'Status', render: (r) => <Badge color={r.isActive ? 'green' : 'amber'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: '__actions', header: '', render: (r) => <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => toggle(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</button>, tdStyle: { textAlign: 'right' } },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'Institution' }, { label: 'Programs' }]} />
      <PageHeader title="Programs" subtitle="Degree programs offered across departments." />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="programs" searchKeys={['name', 'shortForm', 'code']} />
    </>
  );
};

/* ----------------------------------------------------------------
 * Campuses module REMOVED (Master Prompt §2).
 * This is a single-campus Online Distance Learning (ODL) platform, so the
 * Campuses & Study Centers management screen, its route, sidebar entry and
 * backend endpoints have all been removed. No replacement export is exposed.
 * ---------------------------------------------------------------- */

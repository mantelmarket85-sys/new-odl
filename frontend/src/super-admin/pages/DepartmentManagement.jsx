// ============================================================
//  SUPER ADMIN — DEPARTMENT & PROGRAM MANAGEMENT (Master Prompt §1)
//  ------------------------------------------------------------
//  ONLY the Super Admin can create / edit / delete Departments &
//  Programs. Each department has:
//    • Name + Faculty
//    • One or more Programs (Name + Short Name e.g. ADCS / BSCS)
//    • Three staff roles — Admissions Coordinator, Course
//      Coordinator, Department Focal Person — each either selected
//      from existing users OR created inline (Name / Email /
//      Username / Temp Password)
//    • Per-Program Registration & Roll number format config
//        Reg#:  001 F26 C 01 06 101  (institute+term+faculty+dept+program+serial)
//        Roll#: ADCS-F26-101          (shortForm-term-serial)
//      Serial auto-increments (101,102,…) and is IDENTICAL in both.
//  On save everything is persisted real-time and auto-synced to LMS.
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import api from '../../utils/api';
import {
  PageHeader, Breadcrumb, Badge, useToast, FormModal, ConfirmationModal, Skeleton, EmptyState,
} from '../components/ui';

// Phase 1 §2 — a department may hold MULTIPLE staff per role. Each role now
// maps to a *list* form key ("*s") and a payload list key ("*List") plus the
// staffRole tag used to partition the candidate dropdowns.
const STAFF_ROLES = [
  { key: 'admissionsCoordinators', label: 'Admissions Coordinator', icon: 'fa-user-tie', roleTag: 'admissions_coordinator' },
  { key: 'courseCoordinators', label: 'Course Coordinator', icon: 'fa-chalkboard-user', roleTag: 'course_coordinator' },
  { key: 'focalPersons', label: 'Department Focal Person', icon: 'fa-user-shield', roleTag: 'focal_person' },
];

const emptyProgram = () => ({
  name: '', shortForm: '',
  instituteCode: '001', facultyCode: 'C', deptCode: '01',
  programNumericCode: '01', regNextSerial: 101,
  // Per-program merit criteria (Additional Fixes §3). Interview may be 0%.
  matricWeight: 30, fscWeight: 40, interviewWeight: 30,
});

const emptyStaffSpec = () => ({ mode: 'existing', userId: '', newUser: { name: '', email: '', username: '', password: '' } });

const emptyForm = () => ({
  name: '', faculty: '',
  programs: [emptyProgram()],
  // Phase 1 §2 — each role holds a LIST of staff specs (start with one empty row).
  admissionsCoordinators: [emptyStaffSpec()],
  courseCoordinators: [emptyStaffSpec()],
  focalPersons: [emptyStaffSpec()],
});

/* Live preview of the reg/roll number format for a program. */
const NumberingPreview = ({ p }) => {
  const term = 'F26';
  const serial = p.regNextSerial || 101;
  const reg = `${p.instituteCode || '001'}${term}${p.facultyCode || 'C'}${p.deptCode || '01'}${p.programNumericCode || '01'}${serial}`;
  const roll = `${(p.shortForm || 'XXXX').toUpperCase()}-${term}-${serial}`;
  return (
    <div style={{ marginTop: 8, fontSize: 12, background: '#f1f5f9', borderRadius: 6, padding: '8px 10px' }}>
      <div><b>Reg# preview:</b> <span style={{ fontFamily: 'monospace' }}>{reg}</span></div>
      <div style={{ marginTop: 2 }}><b>Roll# preview:</b> <span style={{ fontFamily: 'monospace' }}>{roll}</span></div>
      <div style={{ marginTop: 2, color: '#64748b' }}>Serial {serial} auto-increments (identical in Reg# &amp; Roll#).</div>
    </div>
  );
};

/* One staff row (existing/new toggle) inside a multi-staff role group. */
const StaffRow = ({ roleKey, idx, spec, onChange, onRemove, canRemove, candidates }) => (
  <div className="sa-card" style={{ padding: 10, marginBottom: 8, background: '#f8fafc' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
        <label style={{ cursor: 'pointer' }}>
          <input type="radio" name={`${roleKey}-${idx}-mode`} checked={spec.mode === 'existing'}
            onChange={() => onChange({ ...spec, mode: 'existing' })} /> Existing user
        </label>
        <label style={{ cursor: 'pointer' }}>
          <input type="radio" name={`${roleKey}-${idx}-mode`} checked={spec.mode === 'new'}
            onChange={() => onChange({ ...spec, mode: 'new' })} /> Create new
        </label>
      </div>
      {canRemove && (
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={onRemove}
          style={{ color: 'var(--sa-danger,#dc2626)' }} title="Remove this assignment">
          <i className="fas fa-xmark" />
        </button>
      )}
    </div>
    {spec.mode === 'existing' ? (
      <select className="sa-select" value={spec.userId}
        onChange={(e) => onChange({ ...spec, userId: e.target.value })}>
        <option value="">— Select existing user —</option>
        {candidates.map((u) => (
          <option key={u.id} value={u.id} disabled={u._takenElsewhere}>
            {u.username} ({u.email}) — {u.role}{u._takenElsewhere ? ' (already added)' : ''}
          </option>
        ))}
      </select>
    ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input className="sa-input" placeholder="Full name" value={spec.newUser.name}
          onChange={(e) => onChange({ ...spec, newUser: { ...spec.newUser, name: e.target.value } })} />
        <input className="sa-input" placeholder="Email" value={spec.newUser.email}
          onChange={(e) => onChange({ ...spec, newUser: { ...spec.newUser, email: e.target.value } })} />
        <input className="sa-input" placeholder="Username" value={spec.newUser.username}
          onChange={(e) => onChange({ ...spec, newUser: { ...spec.newUser, username: e.target.value } })} />
        <input className="sa-input" placeholder="Temp password" value={spec.newUser.password}
          onChange={(e) => onChange({ ...spec, newUser: { ...spec.newUser, password: e.target.value } })} />
      </div>
    )}
  </div>
);

/* A multi-staff role group — manages a LIST of assignments (Phase 1 §2).
   Every selected user stays an independent account; only the Department
   assignment is shared. Users already picked in another row of the SAME role
   are disabled to prevent duplicates. */
const StaffFieldMulti = ({ roleKey, label, icon, specs, onChange, candidates }) => {
  const selectedIds = specs
    .filter((s) => s.mode === 'existing' && s.userId)
    .map((s) => String(s.userId));
  const setRow = (i, next) => onChange(specs.map((s, idx) => (idx === i ? next : s)));
  const removeRow = (i) => onChange(specs.filter((_, idx) => idx !== i));
  const addRow = () => onChange([...specs, emptyStaffSpec()]);
  return (
    <div className="sa-card" style={{ padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          <i className={`fas ${icon}`} style={{ marginRight: 6 }} />{label}
          <span style={{ color: 'var(--sa-text-muted)', fontWeight: 400, marginLeft: 6, fontSize: 11.5 }}>
            (multiple allowed)
          </span>
        </div>
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={addRow}>
          <i className="fas fa-plus" /> Add
        </button>
      </div>
      {specs.map((spec, i) => {
        // Disable users already chosen in OTHER rows of this same role.
        const rowCandidates = candidates.map((u) => ({
          ...u,
          _takenElsewhere: selectedIds.includes(String(u.id)) && String(spec.userId) !== String(u.id),
        }));
        return (
          <StaffRow key={i} roleKey={roleKey} idx={i} spec={spec}
            candidates={rowCandidates}
            canRemove={specs.length > 1}
            onChange={(next) => setRow(i, next)}
            onRemove={() => removeRow(i)} />
        );
      })}
    </div>
  );
};

const staffName = (u) => (u ? `${u.username} (${u.email})` : '—');

/* Build the multi-staff spec list for a role from a department record.
   Prefers the new `staffAssignments` join rows; falls back to the legacy
   single FK column so the UI still works against older API responses. */
const specsFromDept = (d, roleTag, legacyFk) => {
  const rows = (d.staffAssignments || []).filter((s) => s.staffRole === roleTag);
  if (rows.length) {
    return rows.map((s) => ({ ...emptyStaffSpec(), mode: 'existing', userId: String(s.userId) }));
  }
  if (d[legacyFk]) {
    return [{ ...emptyStaffSpec(), mode: 'existing', userId: String(d[legacyFk]) }];
  }
  return [emptyStaffSpec()];
};

/* Render the assigned staff names for a role in the department card. */
const staffListNames = (d, roleTag, legacyRel) => {
  const rows = (d.staffAssignments || []).filter((s) => s.staffRole === roleTag);
  if (rows.length) return rows.map((s) => `${s.user.username} (${s.user.email})`).join(', ');
  return staffName(d[legacyRel]);
};

const DepartmentManagement = () => {
  const toast = useToast();
  const [departments, setDepartments] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [candidatesByRole, setCandidatesByRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // create/edit form state
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [deptRes, candRes] = await Promise.all([
        api.get('/departments'),
        api.get('/departments/staff-candidates'),
      ]);
      setDepartments(deptRes.data.departments || []);
      setCandidates(candRes.data.users || []);
      // (Master Prompt §1) role-partitioned candidate lists — each dropdown
      // shows ONLY users of the correct role and never mixes them.
      setCandidatesByRole(candRes.data.candidatesByRole || null);
    } catch {
      toast.push('Failed to load departments', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditId(null); setForm(emptyForm()); };
  const openEdit = (d) => {
    setEditId(d.id);
    setForm({
      name: d.name, faculty: d.faculty || '',
      programs: (d.programs || []).map((p) => ({
        id: p.id, name: p.name, shortForm: p.shortForm || p.code || '',
        instituteCode: p.instituteCode || '001', facultyCode: p.facultyCode || 'C',
        deptCode: p.deptCode || '01', programNumericCode: p.programNumericCode || '01',
        regNextSerial: p.regNextSerial || 101,
        matricWeight: p.matricWeight ?? 30, fscWeight: p.fscWeight ?? 40,
        interviewWeight: p.interviewWeight ?? 30,
      })),
      // Phase 1 §2 — hydrate the multi-staff lists from `staffAssignments`.
      // Fall back to the legacy single FK columns for older API responses.
      admissionsCoordinators: specsFromDept(d, 'admissions_coordinator', 'coordinatorId'),
      courseCoordinators: specsFromDept(d, 'course_coordinator', 'courseCoordinatorId'),
      focalPersons: specsFromDept(d, 'focal_person', 'focalPersonId'),
    });
  };

  const updateProgram = (idx, patch) => {
    setForm((f) => ({ ...f, programs: f.programs.map((p, i) => (i === idx ? { ...p, ...patch } : p)) }));
  };
  const addProgram = () => setForm((f) => ({ ...f, programs: [...f.programs, emptyProgram()] }));
  const removeProgram = (idx) => setForm((f) => ({ ...f, programs: f.programs.filter((_, i) => i !== idx) }));

  const normaliseStaff = (spec) => {
    if (spec.mode === 'existing') {
      return spec.userId ? { mode: 'existing', userId: Number(spec.userId) } : null;
    }
    const n = spec.newUser;
    if (!n.name && !n.email && !n.username) return null;
    return { mode: 'new', newUser: n };
  };

  // Phase 1 §2 — resolve a role's LIST of specs into a clean payload array,
  // dropping empty rows. Always send an array (empty array = "clear this role")
  // so the backend PUT explicitly reconciles the join table.
  const normaliseStaffList = (specs) => (specs || [])
    .map(normaliseStaff)
    .filter(Boolean);

  const buildPayload = () => ({
    name: form.name.trim(),
    faculty: form.faculty.trim(),
    programs: form.programs.map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      name: p.name.trim(),
      shortForm: p.shortForm.trim().toUpperCase(),
      instituteCode: p.instituteCode,
      facultyCode: p.facultyCode,
      deptCode: p.deptCode,
      programNumericCode: p.programNumericCode,
      regNextSerial: Number(p.regNextSerial) || 101,
      matricWeight: Number(p.matricWeight) || 0,
      fscWeight: Number(p.fscWeight) || 0,
      interviewWeight: Number(p.interviewWeight) || 0,
    })),
    // Multi-staff arrays (the backend accepts these `*s` list keys).
    admissionsCoordinators: normaliseStaffList(form.admissionsCoordinators),
    courseCoordinators: normaliseStaffList(form.courseCoordinators),
    focalPersons: normaliseStaffList(form.focalPersons),
  });

  const submit = async () => {
    if (!form.name.trim()) { toast.push('Department name is required', 'error'); return; }
    if (!form.programs.length || form.programs.some((p) => !p.name.trim() || !p.shortForm.trim())) {
      toast.push('Each program needs a Name and Short Name', 'error'); return;
    }
    const badMerit = form.programs.find((p) => {
      const total = (Number(p.matricWeight) || 0) + (Number(p.fscWeight) || 0) + (Number(p.interviewWeight) || 0);
      return Math.abs(total - 100) >= 0.01;
    });
    if (badMerit) {
      toast.push(`Merit criteria for "${badMerit.name || 'a program'}" must sum to 100%`, 'error'); return;
    }
    setBusy(true);
    try {
      const payload = buildPayload();
      if (editId) {
        await api.put(`/departments/${editId}`, payload);
        toast.push('Department updated & synced to LMS', 'success');
      } else {
        await api.post('/departments', payload);
        toast.push('Department created & synced to LMS', 'success');
      }
      setForm(null); setEditId(null); load();
    } catch (e) {
      toast.push(e.response?.data?.error || 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/departments/${deleteTarget.id}`);
      toast.push('Department removed', 'success');
      setDeleteTarget(null); load();
    } catch (e) {
      toast.push(e.response?.data?.error || 'Delete failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'Institution' }, { label: 'Department & Program Management' }]} />
      <PageHeader
        title="Department & Program Management"
        subtitle="Super Admin only — create/edit/delete departments & programs, assign the 3 staff roles, and configure per-program Registration & Roll number formats. Saved in real time and auto-synced to the LMS."
        actions={(
          <button className="sa-btn sa-btn-primary" onClick={openCreate}>
            <i className="fas fa-plus" /> New Department
          </button>
        )}
      />

      {loading ? (
        <><Skeleton h={60} /><Skeleton h={60} style={{ marginTop: 10 }} /></>
      ) : departments.length === 0 ? (
        <EmptyState icon="fa-sitemap" title="No departments yet" text="Create your first department to begin." />
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {departments.map((d) => (
            <div className="sa-card" key={d.id} style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>
                    <i className="fas fa-sitemap" style={{ marginRight: 8, color: 'var(--sa-primary,#2563eb)' }} />
                    {d.name}
                    {!d.isActive && <Badge color="gray" >Inactive</Badge>}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--sa-text-muted)', marginTop: 2 }}>{d.faculty || 'No faculty set'}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => openEdit(d)}><i className="fas fa-pen" /> Edit</button>
                  <button className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => setDeleteTarget(d)}><i className="fas fa-trash" /> Delete</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 12, fontSize: 12.5 }}>
                <div><b>Admissions Coordinator(s):</b><br />{staffListNames(d, 'admissions_coordinator', 'coordinator')}</div>
                <div><b>Course Coordinator(s):</b><br />{staffListNames(d, 'course_coordinator', 'courseCoordinator')}</div>
                <div><b>Focal Person(s):</b><br />{staffListNames(d, 'focal_person', 'focalPerson')}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Programs ({d.programs?.length || 0})</div>
                <div className="sa-table-wrap">
                  <table className="sa-table">
                    <thead><tr><th>Program</th><th>Short</th><th>Reg# format</th><th>Roll# format</th><th>Merit (M/F/I)</th><th>Next serial</th></tr></thead>
                    <tbody>
                      {(d.programs || []).map((p) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td><Badge color="blue">{p.shortForm || p.code}</Badge></td>
                          <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>
                            {`${p.instituteCode || '001'}·F26·${p.facultyCode || 'C'}·${p.deptCode || '01'}·${p.programNumericCode || '01'}·SERIAL`}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{`${(p.shortForm || p.code || 'XXXX')}-F26-SERIAL`}</td>
                          <td style={{ fontSize: 11.5 }}>
                            {`${p.matricWeight ?? 30}/${p.fscWeight ?? 40}/${p.interviewWeight ?? 30}`}
                            {(p.interviewWeight ?? 30) === 0 && <span title="Interview disabled"> 🚫</span>}
                          </td>
                          <td>{p.regNextSerial || 101}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <FormModal open size="lg"
          title={editId ? 'Edit Department' : 'New Department'}
          subtitle="Set programs, staff roles and per-program numbering. Everything is saved live and synced to the LMS."
          submitLabel={editId ? 'Save changes' : 'Create Department'}
          loading={busy} onClose={() => { setForm(null); setEditId(null); }} onSubmit={submit}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="sa-field"><label>Department Name *</label>
              <input className="sa-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Department of Computer Science" /></div>
            <div className="sa-field"><label>Faculty</label>
              <input className="sa-input" value={form.faculty} onChange={(e) => setForm({ ...form, faculty: e.target.value })} placeholder="e.g. Faculty of Science" /></div>
          </div>

          {/* -------- Programs -------- */}
          <div style={{ marginTop: 8, fontWeight: 600, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Programs</span>
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={addProgram}><i className="fas fa-plus" /> Add program</button>
          </div>
          {form.programs.map((p, idx) => (
            <div className="sa-card" key={idx} style={{ padding: 12, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Program #{idx + 1}</div>
                {form.programs.length > 1 && (
                  <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => removeProgram(idx)} style={{ color: 'var(--sa-danger)' }}><i className="fas fa-xmark" /></button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginTop: 6 }}>
                <input className="sa-input" placeholder="Program name (e.g. BS Computer Science)" value={p.name} onChange={(e) => updateProgram(idx, { name: e.target.value })} />
                <input className="sa-input" placeholder="Short (e.g. BSCS)" value={p.shortForm} onChange={(e) => updateProgram(idx, { shortForm: e.target.value.toUpperCase() })} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 10, color: 'var(--sa-text-muted)' }}>Registration & Roll number format</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginTop: 4 }}>
                <div className="sa-field" style={{ margin: 0 }}><label style={{ fontSize: 11 }}>Institute</label><input className="sa-input" value={p.instituteCode} onChange={(e) => updateProgram(idx, { instituteCode: e.target.value })} /></div>
                <div className="sa-field" style={{ margin: 0 }}><label style={{ fontSize: 11 }}>Faculty</label><input className="sa-input" value={p.facultyCode} onChange={(e) => updateProgram(idx, { facultyCode: e.target.value.toUpperCase() })} /></div>
                <div className="sa-field" style={{ margin: 0 }}><label style={{ fontSize: 11 }}>Dept</label><input className="sa-input" value={p.deptCode} onChange={(e) => updateProgram(idx, { deptCode: e.target.value })} /></div>
                <div className="sa-field" style={{ margin: 0 }}><label style={{ fontSize: 11 }}>Program</label><input className="sa-input" value={p.programNumericCode} onChange={(e) => updateProgram(idx, { programNumericCode: e.target.value })} /></div>
                <div className="sa-field" style={{ margin: 0 }}><label style={{ fontSize: 11 }}>Serial start</label><input className="sa-input" type="number" value={p.regNextSerial} onChange={(e) => updateProgram(idx, { regNextSerial: e.target.value })} /></div>
              </div>
              <NumberingPreview p={p} />

              {/* -------- Per-program Merit Criteria (§3) -------- */}
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 12, color: 'var(--sa-text-muted)' }}>
                Merit Criteria (weightage %) — Interview may be 0%
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginTop: 4 }}>
                <div className="sa-field" style={{ margin: 0 }}><label style={{ fontSize: 11 }}>Matric %</label><input className="sa-input" type="number" min="0" max="100" value={p.matricWeight} onChange={(e) => updateProgram(idx, { matricWeight: e.target.value })} /></div>
                <div className="sa-field" style={{ margin: 0 }}><label style={{ fontSize: 11 }}>FSc %</label><input className="sa-input" type="number" min="0" max="100" value={p.fscWeight} onChange={(e) => updateProgram(idx, { fscWeight: e.target.value })} /></div>
                <div className="sa-field" style={{ margin: 0 }}><label style={{ fontSize: 11 }}>Interview %</label><input className="sa-input" type="number" min="0" max="100" value={p.interviewWeight} onChange={(e) => updateProgram(idx, { interviewWeight: e.target.value })} /></div>
              </div>
              {(() => {
                const total = (Number(p.matricWeight) || 0) + (Number(p.fscWeight) || 0) + (Number(p.interviewWeight) || 0);
                const ok = Math.abs(total - 100) < 0.01;
                return (
                  <div style={{ marginTop: 4, fontSize: 11.5, color: ok ? '#16a34a' : '#dc2626' }}>
                    Total: {total}% {ok ? '✓' : '— should equal 100%'}
                    {Number(p.interviewWeight) === 0 && ok && <span style={{ color: '#64748b' }}> · Interview disabled — merit uses Matric + FSc only</span>}
                  </div>
                );
              })()}
            </div>
          ))}

          {/* -------- Staff roles (multi-assignment, Phase 1 §2) -------- */}
          <div style={{ marginTop: 14, fontWeight: 600, fontSize: 13 }}>Staff Assignment</div>
          <div style={{ fontSize: 11.5, color: 'var(--sa-text-muted)', marginBottom: 6 }}>
            Each role may have multiple people. Every selected user keeps their own
            independent account — only the Department assignment is shared.
          </div>
          <div style={{ marginTop: 6 }}>
            {STAFF_ROLES.map((r) => {
              // (Master Prompt §1) Show ONLY the users belonging to this exact
              // role — never mix roles across the three groups.
              const roleCandidates = (candidatesByRole && candidatesByRole[r.roleTag])
                ? candidatesByRole[r.roleTag]
                : candidates;
              return (
                <StaffFieldMulti key={r.key} roleKey={r.key} label={r.label} icon={r.icon}
                  specs={form[r.key]} candidates={roleCandidates}
                  onChange={(next) => setForm({ ...form, [r.key]: next })} />
              );
            })}
          </div>
        </FormModal>
      )}

      <ConfirmationModal open={!!deleteTarget} danger
        title="Delete department?"
        message={`"${deleteTarget?.name}" will be removed. If it has applications it will be deactivated instead of hard-deleted.`}
        confirmLabel="Delete" loading={busy}
        onClose={() => setDeleteTarget(null)} onConfirm={doDelete} />
    </>
  );
};

export default DepartmentManagement;

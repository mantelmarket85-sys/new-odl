// ============================================================
//  SUPER ADMIN — TEACHING ACTIONS  (Teacher + Course Coordinator effect)
//  ------------------------------------------------------------
//  Pick a course offering, then act exactly as the teacher would:
//    • Roster + upload/publish marks (weighted grade auto-computed)
//    • Mark attendance for a date
//    • Manage assignments & materials
//    • Manage sections + assign / replace the teacher
//  Every write lands in the SAME LMS tables the teacher writes to,
//  so results appear in student result cards, attendance in records,
//  etc. — and is mirrored to the LMS audit trail as the teacher role.
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import {
  PageHeader, Breadcrumb, Badge, useToast, FormModal, ConfirmationModal,
  Skeleton, EmptyState,
} from '../components/ui';

const TABS = [
  { key: 'marks', label: 'Marks', icon: 'fa-award' },
  { key: 'attendance', label: 'Attendance', icon: 'fa-user-check' },
  { key: 'assignments', label: 'Assignments', icon: 'fa-file-pen' },
  { key: 'materials', label: 'Materials', icon: 'fa-folder-open' },
  { key: 'sections', label: 'Sections', icon: 'fa-layer-group' },
  { key: 'teacher', label: 'Teacher', icon: 'fa-chalkboard-user' },
];

export const TeachingActions = () => {
  const toast = useToast();
  const [offerings, setOfferings] = useState([]);
  const [loadingOff, setLoadingOff] = useState(true);
  const [offeringId, setOfferingId] = useState('');
  const [tab, setTab] = useState('marks');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await saApi.lmsOfferings({ pageSize: 200 });
        setOfferings(data.offerings || []);
      } catch { toast.push('Failed to load offerings', 'error'); }
      finally { setLoadingOff(false); }
    })();
  }, [toast]);

  const offering = offerings.find((o) => String(o.id) === String(offeringId));

  return (
    <>
      <Breadcrumb items={[{ label: 'LMS Oversight' }, { label: 'Teaching Actions' }]} />
      <PageHeader title="Teaching Actions"
        subtitle="Act as the course teacher / coordinator — upload marks, mark attendance, manage assignments, materials, sections & teacher. Changes reflect live in the LMS." />

      {/* Offering selector */}
      <div className="sa-card sa-card-pad" style={{ marginBottom: 16 }}>
        <div className="sa-field" style={{ marginBottom: 0 }}>
          <label>Select course offering</label>
          {loadingOff ? <Skeleton h={38} /> : (
            <select className="sa-select" value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
              <option value="">— Choose an offering —</option>
              {offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.course?.code} · {o.course?.title} · {o.term?.code || o.term?.title || ''} {o.teacher ? `· ${o.teacher.username}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {!offeringId ? (
        <EmptyState icon="fa-hand-pointer" title="Select an offering" text="Choose a course offering above to manage its teaching actions." />
      ) : (
        <>
          <div className="sa-tabs">
            {TABS.map((t) => (
              <button key={t.key} className={`sa-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                <i className={`fas ${t.icon}`} /> {t.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            {tab === 'marks' && <MarksTab offeringId={Number(offeringId)} offering={offering} />}
            {tab === 'attendance' && <AttendanceTab offeringId={Number(offeringId)} />}
            {tab === 'assignments' && <AssignmentsTab offeringId={Number(offeringId)} />}
            {tab === 'materials' && <MaterialsTab offeringId={Number(offeringId)} />}
            {tab === 'sections' && <SectionsTab offeringId={Number(offeringId)} />}
            {tab === 'teacher' && <TeacherTab offeringId={Number(offeringId)} offering={offering} />}
          </div>
        </>
      )}
    </>
  );
};

/* ============================== MARKS ============================== */
const blankMarks = { assignmentMarks: '', quizMarks: '', midMarks: '', finalMarks: '', status: 'DRAFT', reason: '' };
const MarksTab = ({ offeringId, offering }) => {
  const toast = useToast();
  const [roster, setRoster] = useState([]); const [loading, setLoading] = useState(true);
  const [editFor, setEditFor] = useState(null); const [m, setM] = useState(blankMarks); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await saApi.lmsRoster(offeringId); setRoster(data.roster || []); }
    catch { toast.push('Failed to load roster', 'error'); }
    finally { setLoading(false); }
  }, [offeringId, toast]);
  useEffect(() => { load(); }, [load]);

  const openEdit = (r) => {
    const ex = r.result || {};
    setEditFor(r);
    setM({
      assignmentMarks: ex.assignmentMarks ?? '', quizMarks: ex.quizMarks ?? '',
      midMarks: ex.midMarks ?? '', finalMarks: ex.finalMarks ?? '',
      status: ex.status || 'DRAFT', reason: '',
    });
  };
  const submit = async () => {
    setBusy(true);
    try {
      await saApi.lmsUpsertResult(offeringId, {
        studentId: editFor.student.id,
        assignmentMarks: Number(m.assignmentMarks || 0), quizMarks: Number(m.quizMarks || 0),
        midMarks: Number(m.midMarks || 0), finalMarks: Number(m.finalMarks || 0),
        status: m.status, reason: m.reason || undefined,
      });
      toast.push(`Marks saved (${m.status}) — reflected in student result card`, 'success');
      setEditFor(null); load();
    } catch (e) { toast.push(e.response?.data?.error || 'Failed to save marks', 'error'); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'roll', header: 'Roll', render: (r) => r.student?.linkedRollNumber || r.student?.username || '—', exportValue: (r) => r.student?.linkedRollNumber || r.student?.username },
    { key: 'email', header: 'Email', render: (r) => r.student?.email || '—', exportValue: (r) => r.student?.email },
    { key: 'section', header: 'Section', render: (r) => r.section?.name || '—', exportValue: (r) => r.section?.name },
    { key: 'grade', header: 'Grade', render: (r) => r.result ? `${r.result.totalPercent}% · ${r.result.letterGrade} (${r.result.gradePoints})` : '—', exportValue: (r) => r.result?.letterGrade || '' },
    { key: 'status', header: 'Status', render: (r) => r.result ? <Badge color={r.result.status === 'PUBLISHED' ? 'green' : 'amber'}>{r.result.status}</Badge> : <Badge color="gray">NONE</Badge>, exportValue: (r) => r.result?.status || 'NONE' },
    { key: '__a', header: '', render: (r) => (
      <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => openEdit(r)}><i className="fas fa-pen" /> Marks</button>
    ), tdStyle: { textAlign: 'right' }, exportable: false },
  ];

  return (
    <>
      <DataTable columns={columns} rows={roster} loading={loading}
        searchKeys={['roll', 'email']} exportName="offering-marks" exportTitle="Offering Marks" emptyText="No enrolled students in this offering." />
      {editFor && (
        <FormModal open size="lg" title={`Marks — ${editFor.student?.username}`}
          subtitle="Enter component marks (out of 100). Weighted total & grade auto-computed."
          submitLabel="Save marks" loading={busy} onClose={() => setEditFor(null)} onSubmit={submit}>
          {offering && (
            <p style={{ fontSize: 12.5, color: 'var(--sa-text-soft)', marginTop: 0 }}>
              Weightage — Assignment {offering.assignmentWeight}% · Quiz {offering.quizWeight}% · Mid {offering.midWeight}% · Final {offering.finalWeight}%
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="sa-field"><label>Assignment (/100)</label><input className="sa-input" type="number" value={m.assignmentMarks} onChange={(e) => setM({ ...m, assignmentMarks: e.target.value })} /></div>
            <div className="sa-field"><label>Quiz (/100)</label><input className="sa-input" type="number" value={m.quizMarks} onChange={(e) => setM({ ...m, quizMarks: e.target.value })} /></div>
            <div className="sa-field"><label>Midterm (/100)</label><input className="sa-input" type="number" value={m.midMarks} onChange={(e) => setM({ ...m, midMarks: e.target.value })} /></div>
            <div className="sa-field"><label>Final (/100)</label><input className="sa-input" type="number" value={m.finalMarks} onChange={(e) => setM({ ...m, finalMarks: e.target.value })} /></div>
          </div>
          <div className="sa-field"><label>Status</label>
            <select className="sa-select" value={m.status} onChange={(e) => setM({ ...m, status: e.target.value })}>
              <option value="DRAFT">DRAFT (not visible to student)</option>
              <option value="PUBLISHED">PUBLISHED (visible in result card)</option>
            </select>
          </div>
          {editFor.result?.status === 'PUBLISHED' && (
            <div className="sa-field"><label>Override reason (editing a published result)</label>
              <input className="sa-input" value={m.reason} onChange={(e) => setM({ ...m, reason: e.target.value })} placeholder="Logged permanently to the override audit trail" /></div>
          )}
        </FormModal>
      )}
    </>
  );
};

/* ============================== ATTENDANCE ============================== */
const AttendanceTab = ({ offeringId }) => {
  const toast = useToast();
  const [roster, setRoster] = useState([]); const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState({}); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await saApi.lmsRoster(offeringId);
      setRoster(data.roster || []);
      const init = {}; (data.roster || []).forEach((r) => { init[r.student.id] = 'PRESENT'; });
      setMarks(init);
    } catch { toast.push('Failed to load roster', 'error'); }
    finally { setLoading(false); }
  }, [offeringId, toast]);
  useEffect(() => { load(); }, [load]);

  const setOne = (sid, val) => setMarks((m) => ({ ...m, [sid]: val }));
  const submit = async () => {
    setBusy(true);
    try {
      const records = Object.entries(marks).map(([studentId, status]) => ({ studentId, status }));
      const { data } = await saApi.lmsMarkAttendance(offeringId, { date, records });
      toast.push(`Attendance marked for ${data.marked} students on ${date}`, 'success');
    } catch (e) { toast.push(e.response?.data?.error || 'Failed to mark attendance', 'error'); }
    finally { setBusy(false); }
  };

  if (loading) return <Skeleton h={220} />;
  if (!roster.length) return <EmptyState text="No enrolled students to mark attendance." />;

  return (
    <div className="sa-card sa-card-pad">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="sa-field" style={{ marginBottom: 0 }}>
          <label>Attendance date</label>
          <input className="sa-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }} />
        <button className="sa-btn sa-btn-ghost" onClick={() => { const m = {}; roster.forEach((r) => { m[r.student.id] = 'PRESENT'; }); setMarks(m); }}>Mark all present</button>
        <button className="sa-btn sa-btn-primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save attendance'}</button>
      </div>
      <div className="sa-table-wrap">
        <table className="sa-table">
          <thead><tr><th>Roll</th><th>Email</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
          <tbody>
            {roster.map((r) => (
              <tr key={r.student.id}>
                <td>{r.student?.linkedRollNumber || r.student?.username}</td>
                <td>{r.student?.email}</td>
                <td style={{ textAlign: 'right' }}>
                  <select className="sa-select" style={{ maxWidth: 150, display: 'inline-block' }} value={marks[r.student.id] || 'PRESENT'} onChange={(e) => setOne(r.student.id, e.target.value)}>
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    <option value="LATE">Late</option>
                    <option value="LEAVE">Leave</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ============================== ASSIGNMENTS ============================== */
const AssignmentsTab = ({ offeringId }) => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: '', description: '', dueDate: '', totalMarks: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await saApi.lmsAssignments(offeringId); setRows(data.assignments || []); }
    catch { toast.push('Failed to load assignments', 'error'); }
    finally { setLoading(false); }
  }, [offeringId, toast]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!f.title || !f.dueDate) { toast.push('Title and due date are required', 'error'); return; }
    setBusy(true);
    try {
      await saApi.lmsCreateAssignment({ offeringId, ...f, totalMarks: f.totalMarks ? Number(f.totalMarks) : undefined });
      toast.push('Assignment created — visible to students', 'success');
      setOpen(false); setF({ title: '', description: '', dueDate: '', totalMarks: '' }); load();
    } catch (e) { toast.push(e.response?.data?.error || 'Failed to create assignment', 'error'); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'title', header: 'Title', exportValue: (r) => r.title },
    { key: 'dueDate', header: 'Due', render: (r) => r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—', exportValue: (r) => r.dueDate },
    { key: 'totalMarks', header: 'Marks', render: (r) => r.totalMarks ?? '—', exportValue: (r) => r.totalMarks },
  ];
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}><i className="fas fa-plus" /> New assignment</button>
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} exportName="assignments" exportTitle="Assignments" searchKeys={['title']} emptyText="No assignments yet." />
      {open && (
        <FormModal open title="New assignment" submitLabel="Create" loading={busy} onClose={() => setOpen(false)} onSubmit={submit}>
          <div className="sa-field"><label>Title *</label><input className="sa-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="sa-field"><label>Description</label><textarea className="sa-textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="sa-field"><label>Due date *</label><input className="sa-input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></div>
            <div className="sa-field"><label>Total marks</label><input className="sa-input" type="number" value={f.totalMarks} onChange={(e) => setF({ ...f, totalMarks: e.target.value })} /></div>
          </div>
        </FormModal>
      )}
    </>
  );
};

/* ============================== MATERIALS ============================== */
const MaterialsTab = ({ offeringId }) => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [delFor, setDelFor] = useState(null);
  const [f, setF] = useState({ title: '', type: 'LINK', url: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await saApi.lmsMaterials(offeringId); setRows(data.materials || []); }
    catch { toast.push('Failed to load materials', 'error'); }
    finally { setLoading(false); }
  }, [offeringId, toast]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!f.title) { toast.push('Title is required', 'error'); return; }
    setBusy(true);
    try {
      await saApi.lmsCreateMaterial({ offeringId, ...f });
      toast.push('Material published to students', 'success');
      setOpen(false); setF({ title: '', type: 'LINK', url: '', description: '' }); load();
    } catch (e) { toast.push(e.response?.data?.error || 'Failed to add material', 'error'); }
    finally { setBusy(false); }
  };
  const doDelete = async () => {
    setBusy(true);
    try { await saApi.lmsDeleteMaterial(delFor.id); toast.push('Material removed', 'success'); setDelFor(null); load(); }
    catch { toast.push('Failed to remove material', 'error'); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'title', header: 'Title', exportValue: (r) => r.title },
    { key: 'type', header: 'Type', render: (r) => <Badge color="blue">{r.type}</Badge>, exportValue: (r) => r.type },
    { key: 'url', header: 'Link', render: (r) => r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="sa-link">Open</a> : '—', exportValue: (r) => r.url },
    { key: '__a', header: '', render: (r) => (
      <button className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => setDelFor(r)}><i className="fas fa-trash" /></button>
    ), tdStyle: { textAlign: 'right' }, exportable: false },
  ];
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}><i className="fas fa-plus" /> Add material</button>
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} exportName="materials" exportTitle="Materials" searchKeys={['title']} emptyText="No materials yet." />
      {open && (
        <FormModal open title="Add material" submitLabel="Publish" loading={busy} onClose={() => setOpen(false)} onSubmit={submit}>
          <div className="sa-field"><label>Title *</label><input className="sa-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="sa-field"><label>Type</label>
            <select className="sa-select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="LINK">Link</option><option value="DOCUMENT">Document</option>
              <option value="VIDEO">Video</option><option value="SLIDES">Slides</option>
            </select>
          </div>
          <div className="sa-field"><label>URL</label><input className="sa-input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…" /></div>
          <div className="sa-field"><label>Description</label><textarea className="sa-textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        </FormModal>
      )}
      <ConfirmationModal open={!!delFor} danger title="Remove material?" message={`"${delFor?.title}" will be removed for all students.`} confirmLabel="Remove" loading={busy} onClose={() => setDelFor(null)} onConfirm={doDelete} />
    </>
  );
};

/* ============================== SECTIONS ============================== */
const SectionsTab = ({ offeringId }) => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await saApi.lmsSections(offeringId); setRows(data.sections || []); }
    catch { toast.push('Failed to load sections', 'error'); }
    finally { setLoading(false); }
  }, [offeringId, toast]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!name) { toast.push('Section name is required', 'error'); return; }
    setBusy(true);
    try { await saApi.lmsCreateSection({ offeringId, name }); toast.push('Section created', 'success'); setOpen(false); setName(''); load(); }
    catch (e) { toast.push(e.response?.data?.error || 'Failed to create section', 'error'); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'name', header: 'Section', exportValue: (r) => r.name },
    { key: 'students', header: 'Students', render: (r) => r._count?.registrations ?? '—', exportValue: (r) => r._count?.registrations },
    { key: 'teacher', header: 'Teacher', render: (r) => r.teacher?.username || '—', exportValue: (r) => r.teacher?.username },
  ];
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}><i className="fas fa-plus" /> New section</button>
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} exportName="sections" exportTitle="Sections" searchKeys={['name']} emptyText="No sections yet." />
      {open && (
        <FormModal open title="New section" submitLabel="Create" loading={busy} onClose={() => setOpen(false)} onSubmit={submit}>
          <div className="sa-field"><label>Section name *</label><input className="sa-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. A, B, Morning…" /></div>
        </FormModal>
      )}
    </>
  );
};

/* ============================== TEACHER ============================== */
const TeacherTab = ({ offeringId, offering }) => {
  const toast = useToast();
  const [teachers, setTeachers] = useState([]); const [loading, setLoading] = useState(true);
  const [teacherId, setTeacherId] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { const { data } = await saApi.listUsers({ system: 'lms', role: 'Teacher' }); setTeachers(data.users || []); }
      catch { toast.push('Failed to load teachers', 'error'); }
      finally { setLoading(false); }
    })();
  }, [toast]);

  const submit = async () => {
    if (!teacherId) { toast.push('Select a teacher', 'error'); return; }
    setBusy(true);
    try {
      await saApi.lmsAssignTeacher(offeringId, { teacherId, reason: reason || undefined });
      toast.push('Teacher assigned — recorded as a teacher replacement', 'success');
      setReason('');
    } catch (e) { toast.push(e.response?.data?.error || 'Failed to assign teacher', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="sa-card sa-card-pad" style={{ maxWidth: 560 }}>
      <p style={{ marginTop: 0, fontSize: 13, color: 'var(--sa-text-soft)' }}>
        Current teacher: <strong>{offering?.teacher?.username || 'Unassigned'}</strong>.
        Assigning a different teacher records a permanent <em>TeacherReplacement</em> and updates the offering.
      </p>
      <div className="sa-field"><label>Assign teacher</label>
        {loading ? <Skeleton h={38} /> : (
          <select className="sa-select" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">— Choose a teacher —</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.username} · {t.email}</option>)}
          </select>
        )}
      </div>
      <div className="sa-field"><label>Reason</label><input className="sa-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the (re)assignment" /></div>
      <button className="sa-btn sa-btn-primary" onClick={submit} disabled={busy}>{busy ? 'Assigning…' : 'Assign teacher'}</button>
    </div>
  );
};

export default TeachingActions;

import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import DocumentPreviewLink from './DocumentPreviewLink';
// §1.2(d)(e) — force an immediate system-wide re-check after any change
import { pingEducationWatcher } from '../../utils/educationWatcher';

// Phase 2: education draft autosave key (survives refresh via localStorage).
const EDU_DRAFT_KEY = 'aust:educationDraft';

/* ============================================================
   EDUCATION SECTION (Phase 9 — final unified flow)
   ------------------------------------------------------------
   • TWO cards only: Matric / SSC  AND  FSc / Intermediate.
   • The separate "FSc Part-I (11 years)" card has been REMOVED.
     Part-I is now handled INSIDE the FSc card via the
     "Result Status = Result Awaited" toggle.
   • Degree dropdowns:
       - Matric: predefined list (Science, Arts, Computer Science,
         General, Dars-e-Nizami, Technical Board, Vocational, Other)
       - FSc:    predefined list (FSc Pre-Medical, FSc Pre-Engineering,
         ICS Physics, ICS Statistics, ICom, FA, DAE, Dars-e-Nizami,
         General Science, Humanities, Commerce, Other)
     "Other" reveals a manual text input.
   • Backend storage stays as-is:
       - Matric         → level = '10years'
       - FSc / Result Declared → level = '12years', resultStatus = 'Completed'
       - FSc / Result Awaited  → level = '12years', resultStatus = 'Waiting'
                                 (Part-I marks + Part-I DMC are kept on the
                                  same record — no separate '11years' row.)
   ============================================================ */

// Visible cards (FSc Part-I removed)
const LEVELS = [
  { value: '10years', label: 'Matric / SSC (10 Years)',         short: 'Matric' },
  { value: '12years', label: 'FSc / Intermediate (12 Years)',   short: 'FSc' },
];

// Degree dropdowns — kept simple, with Other → manual input.
const MATRIC_DEGREES = [
  'Matric (Science)',
  'Matric (Arts)',
  'Matric (Computer Science)',
  'Matric (General)',
  'Dars-e-Nizami',
  'Technical Board',
  'Vocational',
  'Other',
];

const FSC_DEGREES = [
  'FSc Pre-Medical',
  'FSc Pre-Engineering',
  'ICS (Physics)',
  'ICS (Statistics)',
  'ICom',
  'FA',
  'DAE',
  'Dars-e-Nizami',
  'General Science',
  'Humanities',
  'Commerce',
  'Other',
];

const MATRIC_MAJORS = ['Science', 'Arts', 'Computer Science', 'General', 'Other'];
const FSC_MAJORS = [
  'Pre-Engineering', 'Pre-Medical', 'Computer Science (ICS)', 'Commerce (I.Com)',
  'Arts (FA)', 'General Science', 'Other',
];

const PK_BOARDS = [
  'BISE Abbottabad', 'BISE Peshawar', 'BISE Mardan', 'BISE Bannu', 'BISE Kohat',
  'BISE Swat', 'BISE D.I.Khan', 'BISE Malakand',
  'BISE Lahore', 'BISE Gujranwala', 'BISE Multan', 'BISE Faisalabad', 'BISE Sahiwal',
  'BISE Rawalpindi', 'BISE Sargodha', 'BISE Bahawalpur', 'BISE D.G.Khan',
  'BISE Karachi', 'BISE Hyderabad', 'BISE Sukkur', 'BISE Larkana', 'BISE Mirpurkhas',
  'BISE Quetta', 'AJK Mirpur', 'FBISE Islamabad', 'Other',
];

const computeGrade = (marks, total) => {
  if (!marks || !total || total <= 0) return '';
  const p = (parseFloat(marks) / parseFloat(total)) * 100;
  if (p >= 80) return 'A+';
  if (p >= 70) return 'A';
  if (p >= 60) return 'B';
  if (p >= 50) return 'C';
  if (p >= 40) return 'D';
  return 'F';
};

// Default degree value per level (chosen so the dropdown is never empty)
const defaultDegree = (level) =>
  level === '10years' ? 'Matric (Science)' : 'FSc Pre-Engineering';

const emptyForm = (level) => ({
  level,
  degree: defaultDegree(level),
  degreeOther: '',
  major: '',
  majorOther: '',
  rollNumber: '',
  marks: '',
  totalMarks: '',
  grade: '',
  partOneMarks: '',
  partOneTotalMarks: '',
  board: '',
  boardOther: '',
  passingYear: '',
  resultStatus: 'Completed',
});

// Classify a saved board string into a predefined option OR "Other" + raw text,
// so a custom board name typed previously re-appears correctly on reload.
const classifyBoard = (savedBoard) => {
  if (!savedBoard) return { board: '', boardOther: '' };
  if (PK_BOARDS.includes(savedBoard)) return { board: savedBoard, boardOther: '' };
  return { board: 'Other', boardOther: savedBoard };
};

// When loading an existing record, classify its stored "degree" string
// into either a predefined option OR fall through to "Other" + raw text,
// so the dropdown reflects the saved value correctly even for legacy rows.
const classifyDegree = (level, savedDegree) => {
  const list = level === '10years' ? MATRIC_DEGREES : FSC_DEGREES;
  if (!savedDegree) return { degree: defaultDegree(level), degreeOther: '' };
  // Direct match against the dropdown options
  if (list.includes(savedDegree)) return { degree: savedDegree, degreeOther: '' };
  // Legacy: "FSc / Intermediate" / "Matric (SSC)" → fall back to default
  if (/^matric/i.test(savedDegree) && level === '10years') {
    return { degree: 'Matric (General)', degreeOther: '' };
  }
  if (/intermediate|fsc|fa$/i.test(savedDegree) && level === '12years') {
    return { degree: 'FSc Pre-Engineering', degreeOther: '' };
  }
  // Anything else → treat as user-entered Other
  return { degree: 'Other', degreeOther: savedDegree };
};

const EducationSection = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [forms, setForms] = useState({});
  const [files, setFiles] = useState({});
  const [saving, setSaving] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [docErrors, setDocErrors] = useState({});
  // Phase 2: indicates one or more education drafts were restored from a
  // previous unsaved session (localStorage). File selections are not restored
  // (browsers cannot re-open local files) but all typed fields survive refresh.
  const [draftRestored, setDraftRestored] = useState(false);
  const [formsLoaded, setFormsLoaded] = useState(false);

  useEffect(() => { load(); }, []);

  // Phase 2: persist the open education form drafts (text fields only) so an
  // accidental refresh does not lose typed marks / board / year etc.
  useEffect(() => {
    if (!formsLoaded) return;
    try {
      if (forms && Object.keys(forms).length) {
        localStorage.setItem(EDU_DRAFT_KEY, JSON.stringify(forms));
      } else {
        localStorage.removeItem(EDU_DRAFT_KEY);
      }
    } catch { /* ignore */ }
  }, [forms, formsLoaded]);

  const load = async () => {
    try {
      const res = await api.get('/education');
      setRecords(res.data.educations || []);
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to load education records' });
    } finally {
      setLoading(false);
      // Phase 2: restore any unsaved education form drafts after initial load.
      try {
        const raw = localStorage.getItem(EDU_DRAFT_KEY);
        if (raw) {
          const draftForms = JSON.parse(raw);
          if (draftForms && Object.keys(draftForms).length) {
            setForms((prev) => ({ ...draftForms, ...prev }));
            setDraftRestored(true);
          }
        }
      } catch { /* ignore malformed draft */ }
      setFormsLoaded(true);
    }
  };

  // For the FSc card we prefer a 12years record, but if the legacy data
  // only has an 11years (Part-I standalone) record we surface it through
  // the same card so the user does not lose it. Saving from the merged
  // card always writes back as 12years/Waiting.
  const getRecord = (level) => {
    if (level === '12years') {
      const full = records.find(r => r.level === '12years');
      if (full) return full;
      // Show legacy Part-I in the FSc card as Result Awaited
      const partI = records.find(r => r.level === '11years');
      if (partI) {
        return { ...partI, _legacyPartI: true, level: '12years', resultStatus: 'Waiting' };
      }
      return null;
    }
    return records.find(r => r.level === level);
  };

  const startForm = (level) => {
    const existing = getRecord(level);
    if (existing) {
      const { degree, degreeOther } = classifyDegree(level, existing.degree);
      setForms(prev => ({
        ...prev,
        [level]: {
          level,
          degree,
          degreeOther,
          major: existing.major || '',
          majorOther: existing.majorOther || '',
          rollNumber: existing.rollNumber || '',
          marks: existing.marks ?? '',
          totalMarks: existing.totalMarks ?? '',
          grade: existing.grade || '',
          partOneMarks: existing.partOneMarks ?? '',
          partOneTotalMarks: existing.partOneTotalMarks ?? '',
          ...classifyBoard(existing.board || ''),
          passingYear: existing.passingYear || '',
          resultStatus: existing.resultStatus || 'Completed',
        },
      }));
      setEditingId(existing.id);
    } else {
      setForms(prev => ({ ...prev, [level]: emptyForm(level) }));
      setEditingId(null);
    }
  };

  const cancelForm = (level) => {
    setForms(prev => { const c = { ...prev }; delete c[level]; return c; });
    setFiles(prev => { const c = { ...prev }; delete c[level]; return c; });
    setEditingId(null);
  };

  const handleField = (level, name, value) => {
    setForms(prev => {
      const f = { ...(prev[level] || emptyForm(level)), [name]: value };
      if (name === 'marks' || name === 'totalMarks') {
        if (f.marks && f.totalMarks) f.grade = computeGrade(f.marks, f.totalMarks);
      }
      // Clear degreeOther when switching away from "Other"
      if (name === 'degree' && value !== 'Other') f.degreeOther = '';
      // Clear boardOther when switching away from "Other"
      if (name === 'board' && value !== 'Other') f.boardOther = '';
      return { ...prev, [level]: f };
    });
  };

  const handleFile = (level, key, file) => {
    if (file && file.size > 2 * 1024 * 1024) {
      return setMsg({ type: 'error', text: `${key} must be under 2 MB` });
    }
    setFiles(prev => ({ ...prev, [level]: { ...(prev[level] || {}), [key]: file } }));
    setDocErrors(prev => {
      if (!prev[level] || !prev[level][key]) return prev;
      const lvl = { ...prev[level] };
      delete lvl[key];
      const next = { ...prev };
      if (Object.keys(lvl).length === 0) delete next[level];
      else next[level] = lvl;
      return next;
    });
  };

  // Required-document validation (unchanged rules, just no 11years card).
  const computeDocErrors = (level, form) => {
    const errs = {};
    const picked = files[level] || {};
    const record = getRecord(level);
    const existing = (record?.documents || []).reduce((acc, d) => {
      acc[d.docType] = true; return acc;
    }, {});

    const need = (key, msg) => {
      if (!picked[key] && !existing[key]) errs[key] = msg;
    };

    if (level === '10years') {
      need('dmc',         'Matric DMC is required. Please upload the Matric / SSC DMC (Marks Sheet).');
      need('certificate', 'Matric Certificate is required. Please upload the Matric / SSC Certificate.');
    } else if (level === '12years') {
      if (form?.resultStatus === 'Waiting') {
        need('part1_dmc', 'Please upload FSc Part-I DMC.');
        need('char_cert', 'Character Certificate is required.');
      } else {
        need('dmc',       'FSc DMC is required. Please upload the FSc / Intermediate DMC.');
        need('char_cert', 'Character Certificate is required.');
      }
    }
    return errs;
  };

  const handleSave = async (level) => {
    const f = forms[level];
    if (!f) return;

    // Resolve final degree string (predefined OR user-typed "Other")
    const finalDegree = f.degree === 'Other'
      ? (f.degreeOther || '').trim()
      : f.degree;
    if (!finalDegree) {
      return setMsg({ type: 'error', text: 'Please select or specify a degree' });
    }

    if (level === '10years') {
      if (!f.marks || !f.totalMarks) return setMsg({ type: 'error', text: 'Matric: marks and total marks are required' });
    }
    if (level === '12years') {
      if (f.resultStatus === 'Completed' && (!f.marks || !f.totalMarks)) {
        return setMsg({ type: 'error', text: 'FSc Result Declared: final marks and total marks are required' });
      }
      if (f.resultStatus === 'Waiting' && (!f.partOneMarks || !f.partOneTotalMarks)) {
        return setMsg({ type: 'error', text: 'FSc Result Awaited: Part-I marks are required' });
      }
    }
    if (f.major === 'Other' && !f.majorOther) {
      return setMsg({ type: 'error', text: 'Please specify the major when "Other" is selected' });
    }
    if (f.board === 'Other' && !f.boardOther.trim()) {
      return setMsg({ type: 'error', text: 'Please enter the Board name when "Other" is selected' });
    }

    const dErrs = computeDocErrors(level, f);
    if (Object.keys(dErrs).length) {
      setDocErrors(prev => ({ ...prev, [level]: dErrs }));
      const first = Object.values(dErrs)[0];
      setMsg({
        type: 'error',
        text: `${LEVELS.find(l => l.value === level).short}: ${first}`,
      });
      return;
    }
    setDocErrors(prev => { const c = { ...prev }; delete c[level]; return c; });

    setSaving(prev => ({ ...prev, [level]: true }));
    setMsg({ type: '', text: '' });

    try {
      // Resolve final board string (predefined OR user-typed "Other")
      const finalBoard = f.board === 'Other' ? (f.boardOther || '').trim() : f.board;
      const payload = { ...f, degree: finalDegree, board: finalBoard };
      // degreeOther / boardOther are internal-only; never sent to the API
      delete payload.degreeOther;
      delete payload.boardOther;

      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) fd.append(k, v);
      });
      const lf = files[level] || {};
      if (lf.dmc)             fd.append('dmc', lf.dmc);
      if (lf.certificate)     fd.append('certificate', lf.certificate);
      if (lf.char_cert)       fd.append('char_cert', lf.char_cert);
      if (lf.provisional)     fd.append('provisional', lf.provisional);
      if (lf.additional)      fd.append('additional', lf.additional);
      if (lf.part1_dmc)       fd.append('part1_dmc', lf.part1_dmc);
      if (lf.migration_cert)  fd.append('migration_cert', lf.migration_cert);

      const existing = getRecord(level);
      // If the only existing record is a legacy 11years row, we should
      // create a new 12years record (the old one stays — admin can delete
      // it if needed) so the server validator accepts the merged save.
      const isLegacyPartIOnly = existing && existing._legacyPartI;
      if (existing && !isLegacyPartIOnly) {
        await api.put(`/education/${existing.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/education', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }

      setMsg({ type: 'success', text: `${LEVELS.find(l => l.value === level).short} record saved successfully.` });
      cancelForm(level);
      setDraftRestored(false);
      await load();
      // Phase 2: scroll to top so the success notification is clearly visible.
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.getElementById('education-section-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {}
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
      try { pingEducationWatcher(); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save record' });
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } finally {
      setSaving(prev => ({ ...prev, [level]: false }));
    }
  };

  const handleDelete = async (id, levelLabel) => {
    if (!window.confirm(`Delete ${levelLabel} record? All associated documents will also be removed.`)) return;
    try {
      await api.delete(`/education/${id}`);
      setMsg({ type: 'success', text: 'Record deleted successfully.' });
      await load();
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
      try { pingEducationWatcher(); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to delete' });
    }
  };

  const handleDeleteDoc = async (educationId, docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await api.delete(`/education/${educationId}/document/${docId}`);
      setMsg({ type: 'success', text: 'Document removed successfully.' });
      await load();
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
      try { pingEducationWatcher(); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to delete document' });
    }
  };

  // ============================================================
  // CARD RENDERER
  // ============================================================
  const renderCard = (level) => {
    const meta = LEVELS.find(l => l.value === level);
    const record = getRecord(level);
    const formOpen = !!forms[level];
    const f = forms[level];

    const isAwaiting = record && record.resultStatus === 'Waiting';
    const isFsc = level === '12years';
    const isMatric = level === '10years';
    const degreeList = isMatric ? MATRIC_DEGREES : FSC_DEGREES;
    const majorList  = isMatric ? MATRIC_MAJORS  : FSC_MAJORS;

    return (
      <div className="card edu-card" key={level} style={{ borderLeft: `4px solid ${record ? (isAwaiting ? '#f59e0b' : '#10b981') : '#94a3b8'}` }}>
        <div
          className="card-header edu-card-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            rowGap: 8,
          }}
        >
          <div
            className="edu-card-title"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              minWidth: 0,
            }}
          >
            <span style={{ fontWeight: 600, lineHeight: 1.25, whiteSpace: 'nowrap' }}>{meta.label}</span>
            {record && (
              isAwaiting ? (
                <span
                  className="badge"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: '#fef3c7', color: '#92400e',
                    padding: '4px 10px', borderRadius: 999,
                    fontSize: '0.72rem', fontWeight: 600, lineHeight: 1,
                    whiteSpace: 'nowrap', border: '1px solid #fcd34d',
                  }}
                >
                  <i className="fas fa-clock" style={{ fontSize: '0.65rem' }}></i> Result Awaited
                </span>
              ) : (
                <span
                  className="badge badge-approved"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600,
                    lineHeight: 1, borderRadius: 999, whiteSpace: 'nowrap',
                  }}
                >
                  <i className="fas fa-check" style={{ fontSize: '0.65rem' }}></i> Result Declared
                </span>
              )
            )}
          </div>
          <div
            className="edu-card-actions"
            style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
          >
            {!formOpen && (
              <button type="button" className="btn btn-sm btn-outline" onClick={() => startForm(level)}>
                {record ? 'Edit Record' : 'Add Record'}
              </button>
            )}
            {record && !formOpen && !record._legacyPartI && (
              <button type="button" className="btn btn-sm" style={{ background: '#dc2626', color: 'white', border: 0 }} onClick={() => handleDelete(record.id, meta.short)}>
                Delete
              </button>
            )}
          </div>
        </div>

        {/* ----- Read view ----- */}
        {record && !formOpen && (
          <div style={{ padding: '0.5rem 0' }}>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Detail label="Degree" value={record.degree} />
              <Detail label="Major / Group" value={record.major === 'Other' ? record.majorOther : record.major} />
              <Detail label="Board" value={record.board} />
              <Detail label="Passing Year" value={record.passingYear} />
              <Detail label="Roll Number" value={record.rollNumber} />
              {record.resultStatus === 'Completed' ? (
                <>
                  <Detail label="Total Marks" value={record.totalMarks} />
                  <Detail label="Obtained Marks" value={record.marks} />
                  <Detail label="Grade" value={record.grade} />
                </>
              ) : (
                <>
                  <Detail label="Part-I Marks" value={record.partOneMarks ? `${record.partOneMarks} / ${record.partOneTotalMarks}` : '—'} />
                  <Detail label="Result Status" value="Awaited" highlight />
                </>
              )}
            </div>

            {/* Uploaded documents */}
            {record.documents && record.documents.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Uploaded Documents</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                  {record.documents.map(d => (
                    <div key={d.id} style={{
                      border: '1px solid #e2e8f0', borderRadius: 8, padding: 10,
                      background: '#f8fafc',
                    }}>
                      <div style={{ fontSize: '0.78rem', color: '#0f172a', fontWeight: 600, marginBottom: 4 }}>
                        {docTypeLabel(d.docType)}
                      </div>
                      <DocumentPreviewLink scope="education" documentId={d.id} fileName={d.fileName} mimeType={d.mimeType} />
                      {!record._legacyPartI && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDoc(record.id, d.id)}
                          style={{
                            marginTop: 6, background: 'transparent', border: 0,
                            color: '#dc2626', fontSize: '0.7rem', cursor: 'pointer', padding: 0,
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----- Empty placeholder ----- */}
        {!record && !formOpen && (
          <div style={{ padding: '1rem 0', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>
            No record added yet. Click <strong>Add Record</strong> to enter qualification details and upload required documents in one place.
          </div>
        )}

        {/* ----- Edit form ----- */}
        {formOpen && f && (
          <div style={{ padding: '0.5rem 0' }}>
            <div className="form-grid">
              {/* Degree (predefined dropdown + "Other" reveal) */}
              <div className="form-group">
                <label>Degree <span className="required">*</span></label>
                <select
                  value={f.degree}
                  onChange={e => handleField(level, 'degree', e.target.value)}
                >
                  {degreeList.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {f.degree === 'Other' && (
                <div className="form-group">
                  <label>Specify Degree <span className="required">*</span></label>
                  <input
                    value={f.degreeOther}
                    onChange={e => handleField(level, 'degreeOther', e.target.value)}
                    placeholder="Enter degree name"
                  />
                </div>
              )}

              {/* Major / Group */}
              <div className="form-group">
                <label>Major / Group {isMatric ? '' : <span className="required">*</span>}</label>
                <select
                  value={f.major}
                  onChange={e => handleField(level, 'major', e.target.value)}
                  style={{ textOverflow: 'ellipsis' }}
                >
                  <option value="">Select</option>
                  {majorList.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {f.major === 'Other' && (
                <div className="form-group">
                  <label>Specify Major <span className="required">*</span></label>
                  <input value={f.majorOther} onChange={e => handleField(level, 'majorOther', e.target.value)} />
                </div>
              )}

              <div className="form-group">
                <label>Board</label>
                <select
                  value={f.board}
                  onChange={e => handleField(level, 'board', e.target.value)}
                  style={{ textOverflow: 'ellipsis' }}
                >
                  <option value="">Select Board</option>
                  {PK_BOARDS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              {f.board === 'Other' && (
                <div className="form-group">
                  <label>Board Name <span className="required">*</span></label>
                  <input
                    value={f.boardOther}
                    onChange={e => handleField(level, 'boardOther', e.target.value)}
                    placeholder="Enter your board name"
                  />
                </div>
              )}

              <div className="form-group">
                <label>Passing Year</label>
                <input value={f.passingYear} onChange={e => handleField(level, 'passingYear', e.target.value)} placeholder="2020" maxLength={4} />
              </div>

              <div className="form-group">
                <label>Roll Number</label>
                <input value={f.rollNumber} onChange={e => handleField(level, 'rollNumber', e.target.value)} />
              </div>

              {/* FSC Result Status — only on 12years */}
              {isFsc && (
                <div className="form-group">
                  <label>Result Status <span className="required">*</span></label>
                  <select
                    value={f.resultStatus}
                    onChange={e => handleField(level, 'resultStatus', e.target.value)}
                  >
                    <option value="Completed">Result Declared</option>
                    <option value="Waiting">Result Awaited</option>
                  </select>
                </div>
              )}

              {/* Marks fields */}
              {(isMatric || (isFsc && f.resultStatus === 'Completed')) && (
                <>
                  <div className="form-group">
                    <label>Total Marks <span className="required">*</span></label>
                    <input type="number" value={f.totalMarks} onChange={e => handleField(level, 'totalMarks', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Obtained Marks <span className="required">*</span></label>
                    <input type="number" value={f.marks} onChange={e => handleField(level, 'marks', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Grade</label>
                    <input value={f.grade} readOnly placeholder="Auto" style={{ background: '#f1f5f9' }} />
                  </div>
                </>
              )}

              {/* Part-I marks (FSC awaited) */}
              {isFsc && f.resultStatus === 'Waiting' && (
                <>
                  <div className="form-group">
                    <label>Part-I Total Marks <span className="required">*</span></label>
                    <input type="number" value={f.partOneTotalMarks} onChange={e => handleField(level, 'partOneTotalMarks', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Part-I Obtained Marks <span className="required">*</span></label>
                    <input type="number" value={f.partOneMarks} onChange={e => handleField(level, 'partOneMarks', e.target.value)} />
                  </div>
                </>
              )}
            </div>

            {/* Documents */}
            <div style={{ marginTop: 14, borderTop: '1px dashed #e2e8f0', paddingTop: 14 }}>
              <h4 style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Documents
              </h4>

              {docErrors[level] && Object.keys(docErrors[level]).length > 0 && (
                <div
                  className="alert alert-error"
                  style={{ marginTop: 0, marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}
                >
                  <i className="fas fa-triangle-exclamation" style={{ marginTop: 2 }}></i>
                  <div>
                    <strong>Required documents missing:</strong>
                    <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                      {Object.values(docErrors[level]).map((m) => (
                        <li key={m} style={{ fontSize: '0.85rem' }}>{m}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {/* Matric */}
                {isMatric && (
                  <>
                    <FileField label="DMC (Marks Sheet)" required onChange={file => handleFile(level, 'dmc', file)} value={files[level]?.dmc} error={docErrors[level]?.dmc} hasExisting={(record?.documents || []).some(d => d.docType === 'dmc')} />
                    <FileField label="Certificate" required onChange={file => handleFile(level, 'certificate', file)} value={files[level]?.certificate} error={docErrors[level]?.certificate} hasExisting={(record?.documents || []).some(d => d.docType === 'certificate')} />
                    <FileField label="Additional (optional)" onChange={file => handleFile(level, 'additional', file)} value={files[level]?.additional} hasExisting={(record?.documents || []).some(d => d.docType === 'additional')} />
                  </>
                )}
                {/* FSC — Result Declared */}
                {isFsc && f.resultStatus === 'Completed' && (
                  <>
                    <FileField label="FSc DMC (Marks Sheet)" required onChange={file => handleFile(level, 'dmc', file)} value={files[level]?.dmc} error={docErrors[level]?.dmc} hasExisting={(record?.documents || []).some(d => d.docType === 'dmc')} />
                    <FileField label="FSc Certificate (optional)" hint="Upload when issued by Board." onChange={file => handleFile(level, 'certificate', file)} value={files[level]?.certificate} hasExisting={(record?.documents || []).some(d => d.docType === 'certificate')} />
                    <FileField label="Character Certificate" required onChange={file => handleFile(level, 'char_cert', file)} value={files[level]?.char_cert} error={docErrors[level]?.char_cert} hasExisting={(record?.documents || []).some(d => d.docType === 'char_cert')} />
                    <FileField label="Migration Certificate (optional)" hint="Optional — upload when issued by your Board." onChange={file => handleFile(level, 'migration_cert', file)} value={files[level]?.migration_cert} hasExisting={(record?.documents || []).some(d => d.docType === 'migration_cert')} />
                  </>
                )}
                {/* FSC — Result Awaited (Part-I) */}
                {isFsc && f.resultStatus === 'Waiting' && (
                  <>
                    <FileField label="FSc Part-I DMC" required onChange={file => handleFile(level, 'part1_dmc', file)} value={files[level]?.part1_dmc} error={docErrors[level]?.part1_dmc} hasExisting={(record?.documents || []).some(d => d.docType === 'part1_dmc')} />
                    <FileField label="Character Certificate" required onChange={file => handleFile(level, 'char_cert', file)} value={files[level]?.char_cert} error={docErrors[level]?.char_cert} hasExisting={(record?.documents || []).some(d => d.docType === 'char_cert')} />
                    <FileField label="Provisional Certificate (optional)" onChange={file => handleFile(level, 'provisional', file)} value={files[level]?.provisional} hasExisting={(record?.documents || []).some(d => d.docType === 'provisional')} />
                    <FileField label="Migration Certificate (optional)" hint="Optional — upload when issued." onChange={file => handleFile(level, 'migration_cert', file)} value={files[level]?.migration_cert} hasExisting={(record?.documents || []).some(d => d.docType === 'migration_cert')} />
                  </>
                )}
              </div>

              {record?.documents?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <small style={{ color: '#64748b' }}>
                    Existing documents will be kept unless replaced by uploading the same type again.
                  </small>
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => cancelForm(level)}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving[level]}
                onClick={() => handleSave(level)}
              >
                {saving[level] ? 'Saving...' : 'Save Record'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="loading">Loading education records...</div>;

  return (
    <div id="education-section-top">
      <h2 className="section-title">Education Records</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Phase 2: draft-restored notice. */}
      {draftRestored && (
        <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-clock-rotate-left"></i>
          <span>We restored your unsaved education details from your last session. Please re-attach any documents, then click <strong>Save</strong>.</span>
        </div>
      )}

      <div className="alert" style={{ background: '#eff6ff', color: '#1e40af', borderLeft: '3px solid #3b82f6' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          <i className="fas fa-info-circle" style={{ marginRight: 6 }}></i>
          How to fill the Education section
        </div>
        Each qualification is a single unified card — enter details and upload required documents in one place.
        <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '0.88rem', lineHeight: 1.55 }}>
          <li><b>Matric</b>: pick your degree (Science, Arts, Computer Science, etc.) and upload DMC + Certificate.</li>
          <li><b>FSc → Result Declared</b>: enter the complete FSc result and upload FSc DMC + Character Certificate.</li>
          <li><b>FSc → Result Awaited</b>: enter <b>only Part-I marks</b> and upload Part-I DMC + Character Certificate. You can update the final result later from this same card.</li>
          <li><b>Migration Certificate</b> is optional at every stage.</li>
          <li>Pick <b>Other</b> in the Degree dropdown if your qualification isn't listed — a text input will appear.</li>
        </ul>
      </div>

      {LEVELS.map(l => renderCard(l.value))}
    </div>
  );
};

// ============================================================
// Helpers
// ============================================================
const Detail = ({ label, value, highlight }) => (
  <div>
    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
    <div style={{
      fontWeight: 600, color: highlight ? '#92400e' : '#0f172a', fontSize: '0.92rem',
      background: highlight ? '#fef3c7' : 'transparent',
      padding: highlight ? '2px 8px' : 0,
      borderRadius: highlight ? 6 : 0,
      display: 'inline-block',
      wordBreak: 'break-word',
    }}>
      {value || <span style={{ color: '#94a3b8', fontWeight: 400 }}>—</span>}
    </div>
  </div>
);

const FileField = ({ label, onChange, value, required, error, hasExisting, hint }) => (
  <div
    className="form-group"
    style={error ? { border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 10, padding: 10 } : {}}
  >
    <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
      <span>{label} {required && <span className="required">*</span>}</span>
      {hasExisting && !value && (
        <span className="badge badge-approved" style={{ fontSize: '0.65rem' }}>On File</span>
      )}
    </label>
    <label className="btn btn-sm btn-outline" style={{ cursor: 'pointer', display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {value ? `Selected: ${value.name}` : (hasExisting ? 'Replace File' : 'Choose File')}
      <input
        type="file"
        accept="image/*,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => onChange(e.target.files[0])}
      />
    </label>
    <small style={{ color: '#64748b', fontSize: '0.7rem' }}>Max 2 MB · PDF or Image</small>
    {hint && (
      <small style={{ color: '#94a3b8', fontSize: '0.68rem', display: 'block', marginTop: 2 }}>{hint}</small>
    )}
    {error && (
      <div className="error-text" style={{ marginTop: 6, color: '#b91c1c', fontSize: '0.78rem', fontWeight: 500 }}>
        <i className="fas fa-circle-exclamation" style={{ marginRight: 4 }}></i>
        {error}
      </div>
    )}
  </div>
);

const docTypeLabel = (t) => {
  const map = {
    dmc: 'DMC / Marks Sheet',
    certificate: 'Certificate',
    char_cert: 'Character Certificate',
    provisional: 'Provisional Certificate',
    additional: 'Additional Document',
    part1_dmc: 'Part-I DMC',
    migration_cert: 'Migration Certificate',
  };
  return map[t] || t;
};

export default EducationSection;

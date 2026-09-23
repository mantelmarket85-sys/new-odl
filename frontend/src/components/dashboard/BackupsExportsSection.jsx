import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

/* ════════════════ BACKUP & EXPORT — Shared Section ════════════════
 * One-click backup & export center, used by BOTH the Director (Admin)
 * Dashboard and the Coordinator Dashboard.
 *
 *   • Download All Applicants Backup (ZIP)  → /api/exports/all-applicants
 *   • Download All Enrolled Students (ZIP)  → /api/exports/enrolled-students
 *   • Download Merit List (Excel / CSV)     → /api/exports/merit-list?format=…
 *   • Download Enrolled List (Excel / CSV)  → /api/exports/enrolled-list?format=…
 *
 * Before each large ZIP, we fetch /api/exports/stats and show a confirmation
 * modal with the record count + a friendly size warning.
 * Per spec: missing files are skipped, streaming ZIP, role-guarded.
 * No existing flow is altered — this is a pure additive feature.
 * ───────────────────────────────────────────────────────────────────── */

// Backend base URL (port 5000 on sandbox / dev)
const _backendBase = () => {
  const host = window.location.host;
  if (host.startsWith('3000-')) {
    return `${window.location.protocol}//${host.replace(/^3000-/, '5000-')}`;
  }
  return window.location.origin.replace(/:3000$/, ':5000');
};

const triggerExportDownload = (path) => {
  try {
    const token = localStorage.getItem('token');
    const url = `${_backendBase()}/api/exports/${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token || '')}`;
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 1500);
  } catch (e) {
    alert('Failed to start download. Please try again.');
  }
};

const downloadAllApplicantsBackup = () => triggerExportDownload('all-applicants');
const downloadAllEnrolledBackup   = () => triggerExportDownload('enrolled-students');
const downloadMeritListExport     = (fmt = 'xlsx') => triggerExportDownload(`merit-list?format=${fmt}`);
const downloadEnrolledListExport  = (fmt = 'xlsx') => triggerExportDownload(`enrolled-list?format=${fmt}`);
const downloadAllApplicantsList   = (fmt = 'xlsx') => triggerExportDownload(`all-applicants-list?format=${fmt}`);
const downloadProgramZip          = (programId) => triggerExportDownload(`program-zip?programId=${programId}`);
const downloadFullBackup          = () => triggerExportDownload('full-backup');

const cardStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
  background: '#fff',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 200,
};

// Read the signed-in user's role from localStorage (set at login).
const _readRole = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return (JSON.parse(raw).role || '').toLowerCase();
  } catch { return null; }
};

const BackupsExportsSection = () => {
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState('');
  const role = _readRole();
  // Only Director / Super Admin may take a full system backup.
  const canFullBackup = role === 'director_admissions' || role === 'admin' || role === 'super_admin';

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const { data } = await api.get('/exports/stats');
      setStats(data);
    } catch (e) {
      console.error('Failed to load export stats', e);
      setStats({ error: true });
    } finally {
      setLoadingStats(false);
    }
  };

  const loadPrograms = async () => {
    try {
      // Coordinator sees only their dept programs; director/super see all.
      const { data } = await api.get('/departments');
      const list = [];
      (data.departments || []).forEach((d) => {
        (d.programs || []).forEach((p) => {
          list.push({ id: p.id, label: `${d.name} — ${p.shortForm || p.code || p.name}` });
        });
      });
      setPrograms(list);
      if (list.length) setSelectedProgram(String(list[0].id));
    } catch (e) {
      // Departments endpoint may 403 for some roles — fail silently, hide the card.
      setPrograms([]);
    }
  };

  useEffect(() => { loadStats(); loadPrograms(); }, []);

  const askConfirm = (cfg) => setConfirm(cfg);
  const closeConfirm = () => { if (!busy) setConfirm(null); };
  const proceed = () => {
    if (!confirm) return;
    setBusy(true);
    try { confirm.action(); }
    finally {
      setTimeout(() => { setBusy(false); setConfirm(null); }, 1800);
    }
  };

  // Backend returns: { cycle:{title,…}, totalApplicants, totalEnrolled, totalMerit? }
  // Be liberal in what we accept so a backend tweak doesn't break the UI.
  const cycleName      = stats?.cycle?.title || 'Current Cycle';
  const applicantCount = stats?.totalApplicants ?? stats?.applicants ?? 0;
  const enrolledCount  = stats?.totalEnrolled   ?? stats?.enrolled   ?? 0;
  const meritCount     = stats?.totalMerit      ?? stats?.merit      ?? 0;

  return (
    <div>
      <h2 style={{ marginBottom: 6 }}>
        <i className="fas fa-database" style={{ marginRight: 8, color: '#0B3C8C' }}></i>
        Backups &amp; Exports
      </h2>
      <p style={{ color: '#6b7280', marginTop: 0, marginBottom: 20 }}>
        Download bulk backups and roster exports. ZIP archives are streamed —
        safe for thousands of records. Missing files are skipped automatically.
      </p>

      {/* Stats summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={{ ...cardStyle, minHeight: 0, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Admission Cycle</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0B3C8C' }}>
            {loadingStats ? '…' : cycleName}
          </div>
        </div>
        <div style={{ ...cardStyle, minHeight: 0, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Applicants</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{loadingStats ? '…' : applicantCount}</div>
        </div>
        <div style={{ ...cardStyle, minHeight: 0, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>On Merit List</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{loadingStats ? '…' : meritCount}</div>
        </div>
        <div style={{ ...cardStyle, minHeight: 0, padding: 14 }}>
          <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Enrolled Students</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{loadingStats ? '…' : enrolledCount}</div>
        </div>
      </div>

      {/* Backup cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {/* All Applicants Backup */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              <i className="fas fa-file-archive" style={{ marginRight: 8, color: '#0B3C8C' }}></i>
              All Applicants Backup
            </h3>
            <p style={{ color: '#6b7280', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
              One ZIP containing every applicant's form, CNIC, profile photo,
              educational documents, and uploads. Each in a <code>Name_CNIC/</code> folder.
            </p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              disabled={loadingStats || applicantCount === 0}
              onClick={() => askConfirm({
                title: 'Download All Applicants Backup',
                count: applicantCount,
                sizeHint: 'This ZIP may be large (hundreds of MB to several GB) and can take a few minutes to build.',
                action: downloadAllApplicantsBackup,
              })}
            >
              <i className="fas fa-download" style={{ marginRight: 6 }}></i>
              Download ZIP ({applicantCount})
            </button>
          </div>
        </div>

        {/* Enrolled Students Backup */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              <i className="fas fa-graduation-cap" style={{ marginRight: 8, color: '#0B3C8C' }}></i>
              All Enrolled Students Backup
            </h3>
            <p style={{ color: '#6b7280', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
              One ZIP per enrolled student with their full admission package
              plus enrollment metadata (Student ID, Roll No., LMS username).
            </p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              disabled={loadingStats || enrolledCount === 0}
              onClick={() => askConfirm({
                title: 'Download All Enrolled Students Backup',
                count: enrolledCount,
                sizeHint: 'This ZIP may be large and can take a few minutes to build.',
                action: downloadAllEnrolledBackup,
              })}
            >
              <i className="fas fa-download" style={{ marginRight: 6 }}></i>
              Download ZIP ({enrolledCount})
            </button>
          </div>
        </div>

        {/* Merit List Export */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              <i className="fas fa-trophy" style={{ marginRight: 8, color: '#0B3C8C' }}></i>
              Merit List Export
            </h3>
            <p style={{ color: '#6b7280', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
              Tabular merit list with Name, CNIC, Program, Merit Score, Status,
              Remarks. Choose Excel (recommended) or CSV.
            </p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-success"
              disabled={loadingStats || meritCount === 0}
              onClick={() => downloadMeritListExport('xlsx')}
            >
              <i className="fas fa-file-excel" style={{ marginRight: 6 }}></i>
              Excel
            </button>
            <button
              className="btn btn-outline"
              disabled={loadingStats || meritCount === 0}
              onClick={() => downloadMeritListExport('csv')}
            >
              <i className="fas fa-file-csv" style={{ marginRight: 6 }}></i>
              CSV
            </button>
          </div>
        </div>

        {/* Enrolled List Export */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              <i className="fas fa-list-check" style={{ marginRight: 8, color: '#0B3C8C' }}></i>
              Enrolled Students List Export
            </h3>
            <p style={{ color: '#6b7280', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
              Roster with Student Name, CNIC, Student ID, Program, Semester,
              Fee Status, Enrollment Date. Excel or CSV.
            </p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-success"
              disabled={loadingStats || enrolledCount === 0}
              onClick={() => downloadEnrolledListExport('xlsx')}
            >
              <i className="fas fa-file-excel" style={{ marginRight: 6 }}></i>
              Excel
            </button>
            <button
              className="btn btn-outline"
              disabled={loadingStats || enrolledCount === 0}
              onClick={() => downloadEnrolledListExport('csv')}
            >
              <i className="fas fa-file-csv" style={{ marginRight: 6 }}></i>
              CSV
            </button>
          </div>
        </div>

        {/* All Applicants List Export (with Department / Program / Session columns) */}
        <div style={cardStyle}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17 }}>
              <i className="fas fa-table" style={{ marginRight: 8, color: '#0B3C8C' }}></i>
              All Applicants List (Excel / CSV)
            </h3>
            <p style={{ color: '#6b7280', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
              Tabular roster of every applicant with <strong>Department</strong>,
              <strong> Program</strong> and <strong>Session</strong> columns.
            </p>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-success"
              disabled={loadingStats || applicantCount === 0}
              onClick={() => downloadAllApplicantsList('xlsx')}
            >
              <i className="fas fa-file-excel" style={{ marginRight: 6 }}></i>
              Excel
            </button>
            <button
              className="btn btn-outline"
              disabled={loadingStats || applicantCount === 0}
              onClick={() => downloadAllApplicantsList('csv')}
            >
              <i className="fas fa-file-csv" style={{ marginRight: 6 }}></i>
              CSV
            </button>
          </div>
        </div>

        {/* Program-wise ZIP */}
        {programs.length > 0 && (
          <div style={cardStyle}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17 }}>
                <i className="fas fa-folder-tree" style={{ marginRight: 8, color: '#0B3C8C' }}></i>
                Program-wise Backup (ZIP)
              </h3>
              <p style={{ color: '#6b7280', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
                One ZIP per program (<code>ProgramShortForm_Session.zip</code>) with each
                applicant folder, the program merit list and an applicants summary.
              </p>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
                style={{ flex: 1, minWidth: 160, padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db' }}
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                disabled={loadingStats || !selectedProgram}
                onClick={() => askConfirm({
                  title: 'Download Program Backup',
                  count: applicantCount,
                  sizeHint: 'This ZIP includes every applicant document for the selected program — it may take a moment to build.',
                  action: () => downloadProgramZip(selectedProgram),
                })}
              >
                <i className="fas fa-download" style={{ marginRight: 6 }}></i>
                ZIP
              </button>
            </div>
          </div>
        )}

        {/* Full System Backup — Director / Super Admin only */}
        {canFullBackup && (
          <div style={cardStyle}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17 }}>
                <i className="fas fa-cloud-arrow-down" style={{ marginRight: 8, color: '#0B3C8C' }}></i>
                Full System Backup (ZIP)
              </h3>
              <p style={{ color: '#6b7280', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
                Complete backup of all applicants, departments, programs and cycles
                as <code>ODL_Backup_YYYY-MM-DD.zip</code>.
              </p>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                disabled={loadingStats}
                onClick={() => askConfirm({
                  title: 'Download Full System Backup',
                  count: applicantCount,
                  sizeHint: 'This is the entire system backup and may be very large (potentially several GB). It can take several minutes to build.',
                  action: downloadFullBackup,
                })}
              >
                <i className="fas fa-download" style={{ marginRight: 6 }}></i>
                Download Full Backup
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{
        marginTop: 24,
        padding: 12,
        background: '#fef3c7',
        border: '1px solid #fcd34d',
        borderRadius: 8,
        fontSize: 13,
        color: '#78350f',
      }}>
        <i className="fas fa-shield-halved" style={{ marginRight: 6 }}></i>
        <strong>Privacy notice:</strong> Backups contain CNICs and personal documents.
        Store the downloaded files securely and never share them outside authorised staff.
      </div>

      {/* Confirmation modal */}
      {confirm && (
        <div
          onClick={closeConfirm}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 480,
              width: '100%',
              padding: 24,
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ margin: 0, marginBottom: 12 }}>
              <i className="fas fa-circle-question" style={{ marginRight: 8, color: '#f59e0b' }}></i>
              {confirm.title}?
            </h3>
            <p style={{ color: '#374151', marginTop: 0 }}>
              You are about to download <strong>{confirm.count}</strong> record{confirm.count === 1 ? '' : 's'}.
            </p>
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              {confirm.sizeHint}
            </p>
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              Missing files will be skipped automatically — the export will not fail.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-outline" onClick={closeConfirm} disabled={busy}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={proceed} disabled={busy}>
                {busy ? (
                  <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Starting…</>
                ) : (
                  <><i className="fas fa-download" style={{ marginRight: 6 }}></i>Start Download</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupsExportsSection;

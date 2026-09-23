import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import api, { getFileUrl } from '../utils/api';
import StatusBadge from '../components/dashboard/StatusBadge';
import StatusTimeline from '../components/dashboard/StatusTimeline';
import DocumentPreviewLink from '../components/dashboard/DocumentPreviewLink';
import BackupsExportsSection from '../components/dashboard/BackupsExportsSection';
import { downloadCompleteApplicationPdf } from '../utils/applicationPdf';

const extractUrl = (text) => {
  if (!text) return null;
  const m = String(text).match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
};
const docTypeLabel = (t) => ({
  dmc: 'DMC / Marks Sheet', certificate: 'Certificate', char_cert: 'Character Certificate',
  provisional: 'Provisional Certificate', additional: 'Additional Document', part1_dmc: 'Part-I DMC',
}[t] || t);

const sidebarItems = [
  { key: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
  { key: 'applications', label: 'Applications', icon: 'fa-clipboard-list' },
  { key: 'initialmerit', label: 'Initial Merit List', icon: 'fa-list-check' },
  { key: 'interview', label: 'Interview', icon: 'fa-microphone-lines' },
  { key: 'appeals', label: 'Interview Appeals', icon: 'fa-gavel' },
  { key: 'merit', label: 'Merit List', icon: 'fa-trophy' },
  { key: 'enrollment', label: 'Enrollment', icon: 'fa-graduation-cap' },
  { key: 'backups', label: 'Backups & Exports', icon: 'fa-database' },
];

/* ════════════════ PDF Download Helper ════════════════
 * Coordinator-side PDF MUST be identical to the Director-side PDF:
 * same branded admission form (page 1+) → applicant declaration / affidavit
 * → all uploaded documents (Matric/FSc DMC, certificates, fee receipts).
 * Both views now share the single client-side builder so they stay in sync.
 * Filename pattern: FirstName_LastName_Application.pdf
 */
const downloadPdf = async (appId) => {
  try {
    await downloadCompleteApplicationPdf(appId);
  } catch (err) {
    console.error('Coordinator PDF export failed:', err);
    alert('Failed to generate complete application PDF. Please try again.');
  }
};

// Helper: backend base URL (port 5000 on sandbox / dev)
const _backendBase = () => {
  const host = window.location.host;
  if (host.startsWith('3000-')) {
    return `${window.location.protocol}//${host.replace(/^3000-/, '5000-')}`;
  }
  return window.location.origin.replace(/:3000$/, ':5000');
};

// Download complete admission package as ZIP (form + all uploaded docs)
// NOTE: Uses /api/exports/individual/:id so the ZIP file is named `Name_CNIC.zip`
// and contains a `/Name_CNIC/` folder (the "Individual Download Fix" from the
// Backup & Export feature spec).
const downloadAdmissionZip = (appId) => {
  try {
    const token = localStorage.getItem('token');
    const url = `${_backendBase()}/api/exports/individual/${appId}?token=${encodeURIComponent(token || '')}`;
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 1500);
  } catch (e) {
    alert('Failed to start admission package download');
  }
};

// Backup & export helpers live inside the shared BackupsExportsSection component.

// Open printable form in new tab
const openPrintForm = (appId) => {
  const token = localStorage.getItem('token');
  const url = `${_backendBase()}/print-application/${appId}?token=${encodeURIComponent(token || '')}`;
  window.open(url, '_blank');
};

/* ════════════════ COORDINATOR DASHBOARD ════════════════ */
const CoordinatorDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderSection = () => {
    switch (activeTab) {
      case 'dashboard': return <StatsSection />;
      case 'applications': return <ApplicationsSection />;
      case 'initialmerit': return <InitialMeritSection />;
      case 'interview': return <InterviewSection />;
      case 'appeals': return <CoordinatorAppealsSection />;
      case 'merit': return <MeritSection />;
      case 'enrollment': return <EnrollmentSection />;
      case 'backups': return <BackupsExportsSection />;
      default: return <StatsSection />;
    }
  };

  return (
    <div>
      <nav className="navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu"><i className="fas fa-bars"></i></button>
          <div className="navbar-brand">
            <img src="/assets/aust-logo.png" alt="AUST" className="brand-logo" />
            <div className="brand-text">
              <strong>AUST</strong>
              <small>Department Coordinator Panel</small>
            </div>
          </div>
        </div>
        <div className="navbar-user">
          <span>{user?.email}</span>
          <span className="role-badge"><i className="fas fa-user-gear" style={{ marginRight: 5 }}></i>Coordinator</span>
          <Link to="/" className="nav-link"><i className="fas fa-house"></i></Link>
          <button onClick={logout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <i className="fas fa-arrow-right-from-bracket"></i> Logout
          </button>
        </div>
      </nav>
      <div className="page-wrapper">
        <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-section-title">Coordinator Panel</div>
          {sidebarItems.map(item => (
            <div key={item.key} className={`sidebar-item ${activeTab === item.key ? 'active' : ''}`}
              onClick={() => { setActiveTab(item.key); setSidebarOpen(false); }}>
              <span className="icon"><i className={`fas ${item.icon}`}></i></span><span>{item.label}</span>
            </div>
          ))}
        </aside>
        <main className="main-content">{renderSection()}</main>
      </div>
    </div>
  );
};

/* ════════════════ STATS ════════════════ */
const StatsSection = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/coordinator/stats')
      .then(r => setStats(r.data.stats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h2 className="section-title">Coordinator Dashboard</h2>
        <div className="stats-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="skel-stat" key={i}>
              <div className="skeleton skel-circle" style={{ width: 38, height: 38, marginBottom: 12 }} />
              <div className="skeleton skel-line lg" style={{ width: '60%' }} />
              <div className="skeleton skel-line sm" style={{ width: '80%', marginBottom: 0 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!stats) return <div className="loading"><span className="spinner"></span></div>;

  const items = [
    { label: 'Forwarded Apps',       value: stats.forwarded,           icon: 'fa-share',            color: '#7c3aed' },
    { label: 'Interviews Scheduled', value: stats.interviewScheduled,  icon: 'fa-calendar-check',   color: '#be185d' },
    { label: 'Interviews Completed', value: stats.interviewCompleted,  icon: 'fa-circle-check',     color: '#059669' },
    { label: 'Merit Entries',        value: stats.totalMerit,          icon: 'fa-trophy',           color: '#0891b2' },
    { label: 'Fee Pending',          value: stats.feePending || 0,     icon: 'fa-hourglass-half',   color: '#ea580c' },
    { label: 'Fee Paid',             value: stats.feePaid || 0,        icon: 'fa-money-bill-wave',  color: '#0284c7' },
    { label: 'Enrolled',             value: stats.enrolled,            icon: 'fa-graduation-cap',   color: '#065f46' },
  ];
  return (
    <div>
      <h2 className="section-title">Coordinator Dashboard</h2>
      <div className="stats-grid stagger">{items.map((s, i) => (
        <div className="stat-card" key={i}>
          <div className="stat-top">
            <div className="stat-icon" style={{
              background: `linear-gradient(135deg, ${s.color}1a, ${s.color}33)`,
              color: s.color,
            }}>
              <i className={`fas ${s.icon}`}></i>
            </div>
          </div>
          <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}</div>
    </div>
  );
};

/* ════════════════ APPLICATIONS — full student data ════════════════ */
const ApplicationsSection = () => {
  const [apps, setApps] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedApp, setSelectedApp] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/coordinator/applications', { params: { status: filter } }); setApps(res.data.applications || []); }
    catch {} finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { loadApps(); }, [loadApps]);

  const filtered = useMemo(() => {
    if (!search.trim()) return apps;
    const s = search.trim().toLowerCase();
    return apps.filter(app => {
      const p = app.user?.profile;
      const enr = app.user?.enrollment;
      return (app.user?.email || '').toLowerCase().includes(s) ||
        (app.user?.username || '').toLowerCase().includes(s) ||
        (p?.firstName || '').toLowerCase().includes(s) ||
        (p?.lastName || '').toLowerCase().includes(s) ||
        (p?.cnic || '').includes(s) ||
        (enr?.rollNumber || '').toLowerCase().includes(s) ||
        (enr?.registrationNumber || '').toLowerCase().includes(s);
    });
  }, [apps, search]);

  const statuses = ['all', 'FORWARDED', 'INTERVIEWED', 'SELECTED', 'FEE_PENDING', 'FEE_PAID', 'FEE_APPROVED', 'ENROLLED'];

  return (
    <div>
      <h2 className="section-title">Applications</h2>
      <div className="filter-bar">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          {statuses.map(s => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace(/_/g, ' ')}</option>)}
        </select>
        <input placeholder="Search by name, CNIC, roll, reg no..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, maxWidth: '320px' }} />
      </div>
      {loading ? <div className="loading"><span className="spinner"></span></div> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Student</th><th>CNIC</th><th>Program</th>
                  <th>Reg #</th><th>Roll #</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(app => (
                  <tr key={app.id}>
                    <td>#{app.id}</td>
                    <td>
                      <strong>{app.user?.profile?.firstName} {app.user?.profile?.lastName}</strong><br />
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{app.user?.email}</span>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{app.user?.profile?.cnic || '-'}</td>
                    <td>{app.program?.name}</td>
                    <td><code style={{ fontSize: '0.78rem' }}>{app.user?.enrollment?.registrationNumber || '-'}</code></td>
                    <td><code style={{ fontSize: '0.78rem' }}>{app.user?.enrollment?.rollNumber || 'Pending'}</code></td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <StatusBadge status={app.status} size="sm" />
                        {app.resultStatus === 'Waiting' && app.status !== 'RESULT_AWAITED' && <StatusBadge status="RESULT_AWAITED" size="sm" />}
                        {app.interview?.decision === 'DISQUALIFIED' && <StatusBadge status="DISQUALIFIED" size="sm" />}
                      </div>
                    </td>
                    <td>
                      <div className="actions-bar">
                        <button className="btn btn-sm btn-info" onClick={() => setSelectedApp(app)}>View</button>
                        <button className="btn btn-sm btn-outline" onClick={() => downloadPdf(app.id)} title="Merged PDF (Form + Documents)">PDF</button>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#047857', color: '#fff', border: 0 }}
                          onClick={() => downloadAdmissionZip(app.id)}
                          title="ZIP package — Form + Photo + CNIC + All Documents"
                        >
                          <i className="fas fa-file-archive"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No applications found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedApp && <FullApplicationModal app={selectedApp} onClose={() => setSelectedApp(null)} />}
    </div>
  );
};

/* ════════════════ FULL APPLICATION MODAL — every field rendered ════════════════ */
const FullApplicationModal = ({ app, onClose }) => {
  const [fullApp, setFullApp] = useState(app);
  const p = fullApp.user?.profile || app.user?.profile;
  const enr = fullApp.user?.enrollment || app.user?.enrollment;
  const docs = fullApp.user?.documents || app.user?.documents || [];
  const edus = fullApp.user?.educations || app.user?.educations || [];
  const txns = fullApp.user?.transactions || app.user?.transactions || [];
  const events = fullApp.statusEvents || app.statusEvents || [];
  const appeals = fullApp.appeals || app.appeals || [];

  useEffect(() => {
    api.get(`/coordinator/applications/${app.id}`).then(r => {
      if (r.data?.application) setFullApp(r.data.application);
    }).catch(() => {});
  }, [app.id]);

  const safe = (v) => (v === null || v === undefined || v === '') ? '—' : v;
  const meetingUrl = extractUrl(fullApp.interview?.venue) || fullApp.interview?.meetingLink;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Application #{app.id} — {app.program?.name}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={fullApp.status} />
          {fullApp.resultStatus === 'Waiting' && <StatusBadge status="RESULT_AWAITED" />}
          {fullApp.interview?.decision === 'DISQUALIFIED' && <StatusBadge status="DISQUALIFIED" />}
          {fullApp.lastAppealStatus === 'PENDING' && <StatusBadge status="APPEAL_SUBMITTED" />}
          {/* Phase 7: Migration Certificate Pending badge \u2014 visible to the
              Coordinator once the student is enrolled but no migration_cert
              is on file. Read-only signal; does not change enrollment state. */}
          {(() => {
            const enrolled = fullApp.status === 'ENROLLED' || enr?.status === 'ENROLLED';
            if (!enrolled) return null;
            const eduDocs = edus.flatMap((e) => e.documents || []);
            const userDocsAll = fullApp.user?.documents || docs || [];
            const hasMig = [...eduDocs, ...userDocsAll].some((d) => {
              const t = (d.docType || d.type || '').toLowerCase();
              const n = (d.fileName || '').toLowerCase();
              return t === 'migration_cert' || t.includes('migration') || n.includes('migration');
            });
            if (hasMig) return null;
            return (
              <span
                title="Student is enrolled but Migration Certificate has not been uploaded yet"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#fff7ed', color: '#9a3412',
                  border: '1px solid #fed7aa',
                  padding: '3px 10px', borderRadius: 999,
                  fontSize: '0.7rem', fontWeight: 700,
                  letterSpacing: '.03em', textTransform: 'uppercase',
                }}
              >
                <i className="fas fa-file-circle-exclamation" style={{ fontSize: '0.7rem' }}></i>
                Migration Certificate Pending
              </span>
            );
          })()}
          <span style={{ color: '#64748b', fontSize: '0.82rem' }}>Submitted: {new Date(app.submittedAt).toLocaleString()}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-outline" onClick={() => openPrintForm(app.id)} title="View printable form">
              <i className="fas fa-eye" style={{ marginRight: 4 }}></i> View Form
            </button>
            <button className="btn btn-sm btn-outline" onClick={() => downloadPdf(app.id)} title="Merged PDF (Form + Documents)">
              <i className="fas fa-file-pdf" style={{ marginRight: 4 }}></i> Download PDF
            </button>
            <button
              className="btn btn-sm"
              style={{ background: '#047857', color: '#fff', border: 0 }}
              onClick={() => downloadAdmissionZip(app.id)}
              title="ZIP package — Form + Photo + CNIC + All Documents"
            >
              <i className="fas fa-file-archive" style={{ marginRight: 4 }}></i> Download ZIP Package
            </button>
          </div>
        </div>

        {/* Identifiers */}
        <div className="card">
          <div className="card-header">Identifiers</div>
          <div className="form-grid" style={{ gap: '0.4rem' }}>
            <div><strong>Registration Number:</strong> <code>{safe(enr?.registrationNumber)}</code></div>
            <div><strong>Roll Number:</strong> <code>{safe(enr?.rollNumber) === '—' ? 'Pending (after fee)' : enr.rollNumber}</code></div>
            <div><strong>User ID:</strong> {app.user?.id}</div>
            <div><strong>Username:</strong> {safe(app.user?.username)}</div>
            <div><strong>Email:</strong> {safe(app.user?.email)}</div>
            <div><strong>Account Created:</strong> {new Date(app.user?.createdAt).toLocaleDateString()}</div>
            <div><strong>Terms Accepted:</strong> {app.user?.termsAccepted ? `Yes — ${new Date(app.user?.termsAcceptedAt).toLocaleString()}` : 'No'}</div>
            <div><strong>Privacy Accepted:</strong> {app.user?.privacyAccepted ? `Yes — ${new Date(app.user?.privacyAcceptedAt).toLocaleString()}` : 'No'}</div>
          </div>
        </div>

        {/* Personal */}
        {p && (
          <div className="card">
            <div className="card-header">Personal Information</div>
            <div className="form-grid" style={{ gap: '0.4rem' }}>
              {p.photoPath && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <img src={getFileUrl(p.photoPath)} alt="Profile" style={{ width: '90px', height: '110px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #e2e8f0' }} />
                </div>
              )}
              <div><strong>First Name:</strong> {safe(p.firstName)}</div>
              <div><strong>Last Name:</strong> {safe(p.lastName)}</div>
              <div><strong>CNIC:</strong> {safe(p.cnic)}</div>
              <div><strong>Father's Name:</strong> {safe(p.fatherName)}</div>
              <div><strong>Father's CNIC:</strong> {safe(p.fatherCnic)}</div>
              <div><strong>Guardian Phone:</strong> {safe(p.guardianPhone)}</div>
              <div><strong>WhatsApp:</strong> {safe(p.whatsappNumber)}</div>
              <div><strong>Nationality:</strong> {safe(p.nationality)}</div>
              <div><strong>Country of Residence:</strong> {safe(p.countryOfResidence)}</div>
              <div><strong>Date of Birth:</strong> {safe(p.dateOfBirth)}</div>
              <div><strong>Gender:</strong> {safe(p.gender)}</div>
              <div><strong>Marital Status:</strong> {safe(p.maritalStatus)}</div>
              <div><strong>Religion:</strong> {safe(p.religion)}</div>
              <div><strong>Blood Group:</strong> {safe(p.bloodGroup)}</div>
              <div><strong>Phone:</strong> {safe(p.phone)}</div>
              <div><strong>Occupation:</strong> {safe(p.occupation)}</div>
              <div><strong>Domicile:</strong> {safe(p.domicileProvince)} — {safe(p.domicileDistrict)}</div>
              <div><strong>Profile Complete:</strong> {p.isComplete ? 'Yes' : 'No'}</div>
            </div>

            {/* Structured address */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e2e8f0' }}>
              <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Present Address</div>
              <div style={{ fontSize: '0.88rem', color: '#475569' }}>
                {[p.presStreet || p.address, p.presVillage, p.presTehsil, p.presDistrict || p.district, p.presPostalCode].filter(Boolean).join(', ') || '—'}
              </div>
              <div style={{ fontWeight: 600, color: '#1e293b', marginTop: 10, marginBottom: 6 }}>
                Permanent Address {p.permSameAsPresent && <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 400 }}>(same as present)</span>}
              </div>
              <div style={{ fontSize: '0.88rem', color: '#475569' }}>
                {[p.permStreet, p.permVillage, p.permTehsil, p.permDistrict, p.permPostalCode].filter(Boolean).join(', ') || '—'}
              </div>
            </div>
          </div>
        )}

        {/* Education */}
        {edus.length > 0 && (
          <div className="card">
            <div className="card-header">Academic Records</div>
            {edus.map(e => {
              const awaiting = e.resultStatus === 'Waiting';
              const marksLine = awaiting
                ? `Part-I: ${e.partOneMarks ?? '—'}/${e.partOneTotalMarks ?? '—'}`
                : `${e.marks ?? '—'}/${e.totalMarks ?? '—'} (${e.marks && e.totalMarks ? ((e.marks / e.totalMarks) * 100).toFixed(2) : 0}%) — Grade ${e.grade || '—'}`;
              return (
                <div key={e.id} style={{ marginBottom: 10, padding: 10, background: '#f8fafc', borderRadius: 8, borderLeft: `4px solid ${awaiting ? '#f59e0b' : '#10b981'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    <strong>{e.level === '10years' ? 'Matric / SSC' : e.level === '11years' ? 'FSc Part-I' : 'FSc / Intermediate'}</strong>
                    {awaiting
                      ? <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600 }}>Result Awaited</span>
                      : <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600 }}>Completed</span>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                    {e.degree} {e.major ? `· ${e.major === 'Other' ? e.majorOther : e.major}` : ''} · Board: {safe(e.board)} · Year: {safe(e.passingYear)} · Roll: {safe(e.rollNumber)}
                  </div>
                  <div style={{ fontSize: '0.88rem', color: '#0f172a', marginTop: 4, fontWeight: 600 }}>{marksLine}</div>
                  {e.documents && e.documents.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {e.documents.map(d => (
                        <div key={d.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6 }}>
                          <div style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600, marginBottom: 4 }}>{docTypeLabel(d.docType)}</div>
                          <DocumentPreviewLink scope="education" documentId={d.id} fileName={d.fileName} mimeType={d.mimeType} compact />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ============================================================
            PROFILE DOCUMENTS — STRICT MAPPING (Phase 9 fix)
            Same logic as AdminDashboard so coordinators see exactly the
            same correct, deduplicated, properly-labelled previews.
            ============================================================ */}
        {(() => {
          const sortedDocs = [...docs].sort((a, b) => b.id - a.id);
          const byType = new Map();
          for (const d of sortedDocs) {
            const t = (d.type || '').toLowerCase();
            if (!byType.has(t)) byType.set(t, d);
          }
          const profileItems = [
            { type: 'photo',           label: 'Student Photograph' },
            { type: 'cnic_front',      label: 'CNIC Front' },
            { type: 'cnic_back',       label: 'CNIC Back' },
            { type: 'father_cnic',     label: 'Father / Guardian CNIC' },
          ].filter(it => byType.has(it.type)).map(it => ({ ...it, doc: byType.get(it.type) }));

          const handledTypes = new Set([
            'photo', 'cnic_front', 'cnic_back', 'father_cnic',
            'application_fee_receipt', 'fee_receipt', 'admission_fee_receipt',
            'appeal_proof',
          ]);
          const extraItems = [];
          for (const [t, d] of byType.entries()) {
            if (handledTypes.has(t)) continue;
            const pretty = t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            extraItems.push({ type: t, label: pretty, doc: d });
          }

          if (profileItems.length === 0 && extraItems.length === 0) return null;
          return (
            <div className="card">
              <div className="card-header">Profile Documents (Photo, CNIC, etc.)</div>
              {profileItems.length > 0 && (
                <div className="doc-grid">
                  {profileItems.map(it => (
                    <div key={it.doc.id} className="doc-item">
                      <div className="doc-label">{it.label}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 4, wordBreak: 'break-word' }}>
                        {it.doc.fileName} ({(it.doc.fileSize / 1024).toFixed(0)} KB)
                      </div>
                      <DocumentPreviewLink
                        scope="user"
                        documentId={it.doc.id}
                        fileName={it.doc.fileName}
                        mimeType={it.doc.mimeType}
                      />
                    </div>
                  ))}
                </div>
              )}
              {extraItems.length > 0 && (
                <>
                  <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Additional Uploaded Documents</div>
                  <div className="doc-grid">
                    {extraItems.map(it => (
                      <div key={it.doc.id} className="doc-item">
                        <div className="doc-label">{it.label}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 4, wordBreak: 'break-word' }}>
                          {it.doc.fileName} ({(it.doc.fileSize / 1024).toFixed(0)} KB)
                        </div>
                        <DocumentPreviewLink
                          scope="user"
                          documentId={it.doc.id}
                          fileName={it.doc.fileName}
                          mimeType={it.doc.mimeType}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {(() => {
          const receiptDoc = docs
            .filter(d => d.type === 'application_fee_receipt' || d.type === 'fee_receipt')
            .sort((a, b) => b.id - a.id)[0];
          const hasReceipt = !!receiptDoc || !!fullApp.feeReceiptPath;
          if (!hasReceipt) return null;
          const fp = receiptDoc?.filePath || fullApp.feeReceiptPath || '';
          const inferredMime = (/\.(jpe?g|jfif|jpe|png|gif|webp|bmp|svg|tiff?|heic|heif)$/i).test(fp)
            ? 'image/jpeg'
            : (/\.pdf$/i).test(fp) ? 'application/pdf' : '';
          return (
            <div className="card">
              <div className="card-header">Application Processing Fee Receipt</div>
              {receiptDoc ? (
                <DocumentPreviewLink
                  scope="user"
                  documentId={receiptDoc.id}
                  fileName={receiptDoc.fileName}
                  mimeType={receiptDoc.mimeType || inferredMime}
                />
              ) : (
                <DocumentPreviewLink
                  filePath={fullApp.feeReceiptPath}
                  fileName={`processing-fee-receipt${fullApp.feeReceiptPath.match(/\.[a-z0-9]+$/i)?.[0] || ''}`}
                  mimeType={inferredMime}
                />
              )}
              {fullApp.procFeeMethod && (
                <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 6, wordBreak: 'break-word' }}>
                  Method: <strong>{fullApp.procFeeMethod}</strong>
                  {fullApp.procFeeTxnId ? ` · Txn: ${fullApp.procFeeTxnId}` : ''}
                </div>
              )}
            </div>
          );
        })()}

        {/* Interview */}
        {fullApp.interview && (
          <div className="card">
            <div className="card-header">Interview</div>
            <div className="form-grid" style={{ gap: '0.4rem' }}>
              <div><strong>Date:</strong> {fullApp.interview.scheduledDate}</div>
              <div><strong>Time:</strong> {fullApp.interview.scheduledTime}</div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>Venue:</strong>{' '}
                {meetingUrl
                  ? <a href={meetingUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>{fullApp.interview.venue || meetingUrl} ↗</a>
                  : safe(fullApp.interview.venue)}
              </div>
              <div><strong>Status:</strong> <StatusBadge status={fullApp.interview.status === 'COMPLETED' ? 'INTERVIEW_COMPLETED' : 'INTERVIEWED'} size="sm" /></div>
              <div><strong>Decision:</strong> {fullApp.interview.decision || 'PENDING'}</div>
              {fullApp.interview.marks !== null && fullApp.interview.marks !== undefined && <div><strong>Marks:</strong> {fullApp.interview.marks}/100</div>}
              {fullApp.interview.remarks && <div style={{ gridColumn: '1 / -1' }}><strong>Remarks:</strong> {fullApp.interview.remarks}</div>}
            </div>
          </div>
        )}

        {/* Merit */}
        {fullApp.meritEntry && (
          <div className="card">
            <div className="card-header">Merit Score</div>
            <div className="form-grid" style={{ gap: '0.4rem' }}>
              <div><strong>Matric %:</strong> {fullApp.meritEntry.matricPercent?.toFixed(2)}%</div>
              <div><strong>FSc %:</strong> {fullApp.meritEntry.fscPercent?.toFixed(2)}%</div>
              <div><strong>Interview Marks:</strong> {fullApp.meritEntry.interviewMarks?.toFixed(1)}</div>
              <div><strong>Total Merit:</strong> <strong>{fullApp.meritEntry.totalMerit?.toFixed(2)}%</strong></div>
              <div><strong>Rank:</strong> #{fullApp.meritEntry.rank || '—'}</div>
              <div><strong>Status:</strong> {fullApp.meritEntry.isFinalized ? 'Finalized' : 'Draft'}</div>
            </div>
          </div>
        )}

        {/* Fee Payment */}
        {fullApp.feePayment && (
          <div className="card">
            <div className="card-header">Fee Payment</div>
            <div className="form-grid" style={{ gap: '0.4rem' }}>
              <div><strong>Amount:</strong> PKR {fullApp.feePayment.amount}</div>
              <div><strong>Status:</strong> <span className={`badge badge-${fullApp.feePayment.status.toLowerCase()}`}>{fullApp.feePayment.status}</span></div>
              <div><strong>Method:</strong> {safe(fullApp.feePayment.paymentMethod)}</div>
              <div><strong>Txn ID:</strong> {safe(fullApp.feePayment.txnId)}</div>
              <div><strong>Paid At:</strong> {fullApp.feePayment.paidAt ? new Date(fullApp.feePayment.paidAt).toLocaleString() : '—'}</div>
              {fullApp.feePayment.adminRemarks && <div style={{ gridColumn: '1 / -1' }}><strong>Director Remarks:</strong> {fullApp.feePayment.adminRemarks}</div>}
              {fullApp.feePayment.receiptPath && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <DocumentPreviewLink
                    filePath={fullApp.feePayment.receiptPath}
                    fileName={`fee-receipt${fullApp.feePayment.receiptPath.match(/\.[a-z0-9]+$/i)?.[0] || ''}`}
                    mimeType={(/\.(jpe?g|jfif|jpe|png|gif|webp|bmp|svg|tiff?|heic|heif)$/i).test(fullApp.feePayment.receiptPath) ? 'image/jpeg' : (/\.pdf$/i).test(fullApp.feePayment.receiptPath) ? 'application/pdf' : ''}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Appeals */}
        {appeals.length > 0 && (
          <div className="card">
            <div className="card-header">Appeals on this Application</div>
            {appeals.map(a => (
              <div key={a.id} style={{ padding: 10, background: '#fffbeb', borderLeft: '3px solid #f59e0b', borderRadius: 6, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong>{a.subject}</strong>
                  <StatusBadge
                    status={a.status === 'ACCEPTED' || a.status === 'APPROVED' ? 'APPEAL_ACCEPTED' : a.status === 'REJECTED' ? 'APPEAL_REJECTED' : 'APPEAL_SUBMITTED'}
                    size="sm"
                  />
                </div>
                <div style={{ fontSize: '0.85rem', color: '#475569' }}>{a.message}</div>
                {a.adminResponse && <div style={{ fontSize: '0.82rem', marginTop: 6, color: '#1e3a8a' }}><strong>Response:</strong> {a.adminResponse}</div>}
              </div>
            ))}
          </div>
        )}

        {fullApp.rejectionReason && (
          <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
            <div className="card-header" style={{ color: '#991b1b' }}>Director Rejection Reason</div>
            <div style={{ fontSize: '0.9rem', color: '#475569' }}>{fullApp.rejectionReason}</div>
          </div>
        )}

        {/* Transactions */}
        {txns.length > 0 && (
          <div className="card">
            <div className="card-header">Online Payment Transaction History ({txns.length})</div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Date</th><th>Purpose</th><th>Method</th><th>Amount</th><th>Mobile</th><th>Txn ID</th><th>Status</th></tr></thead>
                <tbody>
                  {txns.map(t => (
                    <tr key={t.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{new Date(t.createdAt).toLocaleString()}</td>
                      <td>{t.purpose.replace(/_/g, ' ')}</td>
                      <td>{t.method}</td>
                      <td>PKR {t.amount}</td>
                      <td style={{ fontSize: '0.8rem' }}>{safe(t.mobileAccount)}</td>
                      <td><code style={{ fontSize: '0.78rem' }}>{t.txnId}{t.isMock ? ' (mock)' : ''}</code></td>
                      <td><span className={`badge badge-${t.status.toLowerCase()}`}>{t.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Status Timeline */}
        {events.length > 0 && (
          <div className="card">
            <div className="card-header">Status Timeline</div>
            <StatusTimeline events={events} />
          </div>
        )}
      </div>
    </div>
  );
};

/* ════════════════ INITIAL MERIT LIST — Coordinator eligibility marking (Master Prompt §5) ════════════════
   The Director forwards applications to the Admissions Coordinator. Here the
   Coordinator marks each applicant ELIGIBLE / NOT_ELIGIBLE for interview.
   Only ELIGIBLE applicants form the "Initial Merit List – Selected for Interview".
================================================================== */
const InitialMeritSection = () => {
  const [data, setData] = useState({ selected: [], notEligible: [], pending: [] });
  const [title, setTitle] = useState('Initial Merit List – Selected for Interview');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(null);
  const [checked, setChecked] = useState({});
  const [published, setPublished] = useState(false);
  const [cycleId, setCycleId] = useState(null);
  const [detail, setDetail] = useState(null); // applicant details modal (full profile + documents)

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/coordinator/initial-merit-list');
      setTitle(res.data.title || title);
      setPublished(!!res.data.published);
      setCycleId(res.data.cycleId || null);
      setData({
        selected: res.data.selected || [],
        notEligible: res.data.notEligible || [],
        pending: res.data.pending || [],
      });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to load initial merit list' });
    } finally { setLoading(false); }
  };
  // §2.1 Real-time: eligibility changes (Eligible / Not Eligible) must reflect
  // live on this screen, the merit list and for other roles — poll + refresh
  // on focus / global aust:refresh so no manual reload is needed.
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    const onFocus = () => load();
    const onRefresh = () => load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('aust:refresh', onRefresh);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('aust:refresh', onRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const publishList = async () => {
    setSaving('publish');
    try {
      const res = await api.put('/coordinator/initial-merit-list/publish', { publish: !published, cycleId });
      setPublished(res.data.published);
      setMsg({ type: 'success', text: res.data.published ? 'Initial Merit List published — students can now see their status.' : 'Initial Merit List unpublished.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Publish failed' });
    } finally { setSaving(null); }
  };

  // §2.2 View the COMPLETE applicant profile + ALL uploaded documents.
  // We open the same comprehensive FullApplicationModal used elsewhere so the
  // Coordinator sees full information & documents for BOTH Eligible and Not
  // Eligible applicants (no reduced view). The modal fetches the full record
  // (profile, educations + their documents, profile documents, fee, etc.).
  const viewDetails = (applicationRow) => {
    setDetail(applicationRow);
  };

  const mark = async (applicationId, eligibility) => {
    setSaving(applicationId);
    try {
      await api.put(`/coordinator/interview-eligibility/${applicationId}`, { eligibility });
      setMsg({ type: 'success', text: `Marked ${eligibility === 'ELIGIBLE' ? 'Eligible' : 'Not Eligible'} for interview` });
      load();
      // §2.1 Reflect the status change immediately for the Director / student.
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update eligibility' });
    } finally { setSaving(null); }
  };

  const markBulk = async (eligibility) => {
    const ids = Object.keys(checked).filter((k) => checked[k]).map(Number);
    if (!ids.length) return setMsg({ type: 'error', text: 'Select at least one applicant' });
    setSaving('bulk');
    try {
      await api.put('/coordinator/interview-eligibility-bulk', { applicationIds: ids, eligibility });
      setMsg({ type: 'success', text: `${ids.length} applicant(s) marked ${eligibility === 'ELIGIBLE' ? 'Eligible' : 'Not Eligible'}` });
      setChecked({});
      load();
      // §2.1 Reflect the status change immediately for the Director / student.
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Bulk update failed' });
    } finally { setSaving(null); }
  };

  const nameOf = (a) => `${a.user?.profile?.firstName || ''} ${a.user?.profile?.lastName || ''}`.trim() || a.user?.email || '—';

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 className="section-title" style={{ margin: 0 }}>{title}</h2>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`badge badge-${published ? 'open' : 'closed'}`}>
            {published ? 'Published' : 'Not Published'}
          </span>
          <button
            className={`btn btn-sm ${published ? 'btn-outline' : 'btn-primary'}`}
            disabled={saving === 'publish'}
            onClick={publishList}
          >
            <i className={`fas ${published ? 'fa-eye-slash' : 'fa-bullhorn'}`} style={{ marginRight: 6 }}></i>
            {published ? 'Unpublish' : 'Publish Initial Merit List'}
          </button>
        </span>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="alert alert-info">
        <i className="fas fa-circle-info" style={{ marginRight: 6 }}></i>
        Review each forwarded applicant and mark them <strong>Eligible</strong> or <strong>Not Eligible for Interview</strong>.
        Only Eligible applicants appear on the Initial Merit List (Selected for Interview) and proceed to the interview stage.
        Click <strong>Publish Initial Merit List</strong> so students can see whether they are Selected for Interview.
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><i className="fas fa-hourglass-half" style={{ marginRight: 6, color: '#c2410c' }}></i>Pending Review ({data.pending.length})</span>
          {data.pending.length > 0 && (
            <span style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-success" disabled={saving === 'bulk'} onClick={() => markBulk('ELIGIBLE')}>Mark selected Eligible</button>
              <button className="btn btn-sm btn-danger" disabled={saving === 'bulk'} onClick={() => markBulk('NOT_ELIGIBLE')}>Mark selected Not Eligible</button>
            </span>
          )}
        </div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th></th><th>Applicant</th><th>Program</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {data.pending.map((a) => (
                <tr key={a.id}>
                  <td><input type="checkbox" checked={!!checked[a.id]} onChange={(e) => setChecked({ ...checked, [a.id]: e.target.checked })} /></td>
                  <td><strong>{nameOf(a)}</strong><br /><span style={{ fontSize: '0.78rem', color: '#64748b' }}>{a.user?.email}</span></td>
                  <td>{a.program?.name}</td>
                  <td><span className={`badge badge-${a.status?.toLowerCase()}`}>{a.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-outline" onClick={() => viewDetails(a)}><i className="fas fa-id-card" style={{ marginRight: 4 }}></i>View Details</button>
                      <button className="btn btn-sm btn-success" disabled={saving === a.id} onClick={() => mark(a.id, 'ELIGIBLE')}>Eligible</button>
                      <button className="btn btn-sm btn-danger" disabled={saving === a.id} onClick={() => mark(a.id, 'NOT_ELIGIBLE')}>Not Eligible</button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.pending.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>Nothing pending review.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><i className="fas fa-check-circle" style={{ marginRight: 6, color: '#047857' }}></i>Selected for Interview ({data.selected.length})</div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>#</th><th>Applicant</th><th>Program</th><th>Action</th></tr></thead>
            <tbody>
              {data.selected.map((a, i) => (
                <tr key={a.id}>
                  <td>{i + 1}</td>
                  <td><strong>{nameOf(a)}</strong><br /><span style={{ fontSize: '0.78rem', color: '#64748b' }}>{a.user?.email}</span></td>
                  <td>{a.program?.name}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-outline" onClick={() => viewDetails(a)}><i className="fas fa-id-card" style={{ marginRight: 4 }}></i>View Details</button>
                      <button className="btn btn-sm btn-outline" disabled={saving === a.id} onClick={() => mark(a.id, 'NOT_ELIGIBLE')}>Move to Not Eligible</button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.selected.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>No applicants selected yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><i className="fas fa-times-circle" style={{ marginRight: 6, color: '#b91c1c' }}></i>Not Eligible for Interview ({data.notEligible.length})</div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Applicant</th><th>Program</th><th>Action</th></tr></thead>
            <tbody>
              {data.notEligible.map((a) => (
                <tr key={a.id}>
                  <td><strong>{nameOf(a)}</strong><br /><span style={{ fontSize: '0.78rem', color: '#64748b' }}>{a.user?.email}</span></td>
                  <td>{a.program?.name}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {/* §2.2 Not-Eligible applicants: full profile + all documents remain viewable. */}
                      <button className="btn btn-sm btn-outline" onClick={() => viewDetails(a)}><i className="fas fa-id-card" style={{ marginRight: 4 }}></i>View Details</button>
                      <button className="btn btn-sm btn-success" disabled={saving === a.id} onClick={() => mark(a.id, 'ELIGIBLE')}>Move to Eligible</button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.notEligible.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>None.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* §2.2 — Full applicant profile + ALL uploaded documents (same complete
          view for Eligible AND Not Eligible applicants). Uses the comprehensive
          FullApplicationModal which fetches the complete record and renders the
          profile, academic records with their documents, and profile documents
          (photo, CNIC, receipts, etc.). */}
      {detail && (
        <FullApplicationModal app={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
};

/* ════════════════ APPLICANT DETAIL MODAL — full student profile for the Initial Merit screen (§6) ════════════════ */
const ApplicantDetailModal = ({ detail, loading, onClose }) => {
  const p = detail?.user?.profile || detail?.profile || {};
  const fullName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || detail?.user?.email || 'Applicant';
  const educations = detail?.user?.educations || detail?.educations || [];
  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  );
  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div className="modal-box" style={{ background: '#fff', borderRadius: 12, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 0 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}><i className="fas fa-user-graduate" style={{ marginRight: 8, color: '#2563eb' }}></i>Applicant Details</h3>
          <button className="btn btn-sm btn-outline" onClick={onClose}><i className="fas fa-xmark"></i></button>
        </div>
        {loading || detail?.loading ? (
          <div className="loading" style={{ padding: '2rem' }}><span className="spinner"></span></div>
        ) : (
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 4 }}>{fullName}</div>
            <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 14 }}>
              {detail?.program?.name} {detail?.status && <span className={`badge badge-${detail.status?.toLowerCase()}`} style={{ marginLeft: 8 }}>{detail.status}</span>}
            </div>
            <h4 style={{ fontSize: '0.9rem', margin: '10px 0 4px' }}>Personal</h4>
            <Row label="Father Name" value={p.fatherName} />
            <Row label="CNIC" value={p.cnic} />
            <Row label="Date of Birth" value={p.dateOfBirth} />
            <Row label="Gender" value={p.gender} />
            <Row label="Religion" value={p.religion} />
            <Row label="Nationality" value={p.nationality} />
            <Row label="Domicile" value={p.domicile || [p.domicileDistrict, p.domicileProvince].filter(Boolean).join(', ')} />
            <h4 style={{ fontSize: '0.9rem', margin: '14px 0 4px' }}>Contact</h4>
            <Row label="Email" value={detail?.user?.email} />
            <Row label="Phone" value={p.phone || p.guardianPhone} />
            <Row label="WhatsApp" value={p.whatsappNumber || p.whatsapp} />
            <Row label="Address" value={p.address || [p.presStreet, p.presDistrict].filter(Boolean).join(', ')} />
            <h4 style={{ fontSize: '0.9rem', margin: '14px 0 4px' }}>Education</h4>
            {educations.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No education records.</div>}
            {educations.map((e) => (
              <div key={e.id} style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 8, fontSize: '0.82rem' }}>
                <div style={{ fontWeight: 600 }}>{e.degree} {e.resultStatus === 'Waiting' && <span className="badge badge-closed" style={{ marginLeft: 6 }}>Result Awaited</span>}</div>
                <div style={{ color: '#64748b' }}>
                  {e.major ? `${e.major} · ` : ''}{e.board || '—'} · {e.passingYear || '—'}
                  {e.marks != null && e.totalMarks != null ? ` · ${e.marks}/${e.totalMarks}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ════════════════ INTERVIEW — venue auto-detects online links; Qualified/Disqualified decision ════════════════ */
const InterviewSection = () => {
  const [apps, setApps] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({ applicationId: '', scheduledDate: '', scheduledTime: '', venue: 'AUST Campus', meetingLink: '', mode: 'PHYSICAL' });
  const [decisionForm, setDecisionForm] = useState({ interviewId: null, decision: '', marks: '', remarks: '' });
  const [bulkSelected, setBulkSelected] = useState([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/coordinator/applications'); setApps(res.data.applications || []); }
    catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { loadApps(); }, [loadApps]);

  const handleSchedule = async (e) => {
    e.preventDefault();
    try {
      const isOnline = scheduleForm.mode === 'ONLINE';
      // Auto-detect URL if pasted directly into venue
      const detected = extractUrl(scheduleForm.venue);
      const payload = { ...scheduleForm };
      if (isOnline && detected && !payload.meetingLink) payload.meetingLink = detected;
      // For online interviews a meeting link is required
      if (isOnline && !payload.meetingLink && !detected) {
        return setMsg({ type: 'error', text: 'For an ONLINE interview, please provide a meeting link (Zoom / Google Meet / Teams).' });
      }
      // For physical interviews a venue is required
      if (!isOnline && (!payload.venue || !payload.venue.trim())) {
        return setMsg({ type: 'error', text: 'For a PHYSICAL interview, please provide a venue / address.' });
      }

      if (bulkMode) {
        if (bulkSelected.length === 0) {
          return setMsg({ type: 'error', text: 'Select at least one application for bulk scheduling.' });
        }
        const bulkPayload = {
          applicationIds: bulkSelected,
          scheduledDate: payload.scheduledDate,
          scheduledTime: payload.scheduledTime,
          venue: payload.venue,
          meetingLink: payload.meetingLink,
          mode: payload.mode,
        };
        const res = await api.post('/coordinator/interview/bulk', bulkPayload);
        setMsg({ type: 'success', text: res.data.message || 'Bulk interview scheduling complete' });
        setBulkSelected([]);
      } else {
        // CRITICAL: detect whether this is a RETAKE (existing disqualified
        // interview after an accepted appeal) vs a fresh schedule. The
        // backend has dedicated /retake endpoint that resets the same
        // interview row (preserves history via statusEvent log).
        const target = apps.find(a => a.id === parseInt(payload.applicationId, 10));
        const isRetake = !!(target
          && target.interview
          && target.interview.decision === 'DISQUALIFIED'
          && Array.isArray(target.appeals)
          && target.appeals.some(x => x.appealType === 'INTERVIEW_DISQUALIFICATION' && x.status === 'ACCEPTED'));

        if (isRetake) {
          await api.post('/coordinator/interview/retake', payload);
          setMsg({ type: 'success', text: 'Retake interview scheduled — student notified with meeting details.' });
        } else {
          await api.post('/coordinator/interview', payload);
          setMsg({ type: 'success', text: 'Interview scheduled successfully — student notified' });
        }
      }
      setScheduleForm({ applicationId: '', scheduledDate: '', scheduledTime: '', venue: 'AUST Campus', meetingLink: '', mode: 'PHYSICAL' });
      loadApps();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };

  const toggleBulkSelect = (id) => {
    setBulkSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const toggleBulkAll = (list) => {
    const ids = list.map((a) => a.id);
    const allSelected = ids.every((id) => bulkSelected.includes(id));
    setBulkSelected(allSelected ? bulkSelected.filter((id) => !ids.includes(id)) : Array.from(new Set([...bulkSelected, ...ids])));
  };

  const handleDecision = async (e) => {
    e.preventDefault();
    if (!decisionForm.decision) return setMsg({ type: 'error', text: 'Please choose Qualified or Disqualified' });
    if (decisionForm.decision === 'QUALIFIED') {
      const m = parseFloat(decisionForm.marks);
      if (isNaN(m) || m < 0 || m > 100) return setMsg({ type: 'error', text: 'Enter valid interview marks (0–100)' });
    }
    if (decisionForm.decision === 'DISQUALIFIED' && (!decisionForm.remarks || decisionForm.remarks.trim().length < 5)) {
      return setMsg({ type: 'error', text: 'Disqualification remarks are required (min 5 characters). The student will see them.' });
    }
    try {
      await api.put(`/coordinator/interview/${decisionForm.interviewId}/evaluate`, {
        decision: decisionForm.decision,
        marks: decisionForm.decision === 'QUALIFIED' ? parseFloat(decisionForm.marks) : null,
        remarks: decisionForm.remarks,
      });
      setMsg({
        type: 'success',
        text: decisionForm.decision === 'QUALIFIED'
          ? 'Candidate qualified — merit calculated and student notified'
          : 'Candidate disqualified — removed from merit list and student notified',
      });
      setDecisionForm({ interviewId: null, decision: '', marks: '', remarks: '' });
      loadApps();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };

  // ====================================================================
  // CRITICAL FIX: Re-forwarded applications after appeal-accept must
  // appear in "Needs Scheduling" so the coordinator can reschedule a
  // retake. Previously the filter required `!a.interview`, which hid
  // any re-forwarded app that still carried its prior (DISQUALIFIED)
  // interview record. We now ALSO include FORWARDED apps whose
  // interview is COMPLETED + DISQUALIFIED + has an ACCEPTED appeal —
  // these are the "retake-eligible" pool.
  // ====================================================================
  const hasAcceptedInterviewAppeal = (a) =>
    Array.isArray(a.appeals) && a.appeals.some(
      x => x.appealType === 'INTERVIEW_DISQUALIFICATION' && x.status === 'ACCEPTED'
    );
  const needsScheduling = apps.filter(a => {
    if (a.status !== 'FORWARDED' && a.status !== 'UNDER_REVIEW') return false;
    // (a) Fresh application — no interview yet
    if (!a.interview) return true;
    // (b) Retake-eligible — previous interview was disqualified but appeal accepted
    //     and the interview is not currently scheduled (decision finalised).
    if (a.interview.decision === 'DISQUALIFIED' && hasAcceptedInterviewAppeal(a)) return true;
    return false;
  });
  const scheduled = apps.filter(a => a.interview?.status === 'SCHEDULED' && (!a.interview?.decision || a.interview.decision === 'PENDING'));
  // Completed shows interviews with a final decision EXCEPT those that have
  // since been re-opened by an accepted appeal (they belong in needsScheduling).
  const completed = apps.filter(a => {
    if (!a.interview) return false;
    if (a.interview.decision !== 'QUALIFIED' && a.interview.decision !== 'DISQUALIFIED') return false;
    // Hide from completed if a retake is pending (status was reset to FORWARDED + appeal accepted)
    if (a.status === 'FORWARDED' && a.interview.decision === 'DISQUALIFIED' && hasAcceptedInterviewAppeal(a)) return false;
    return true;
  });

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  const venueIsUrl = !!extractUrl(scheduleForm.venue);

  return (
    <div>
      <h2 className="section-title">Interview Management</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {needsScheduling.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span>Schedule Interview ({needsScheduling.length} pending)</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                className={`btn btn-sm ${bulkMode ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => { setBulkMode(!bulkMode); setBulkSelected([]); }}
              >
                <i className={`fas ${bulkMode ? 'fa-check-square' : 'fa-square'}`} style={{ marginRight: 4 }}></i>
                Bulk Mode {bulkMode ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {bulkMode && (
            <div className="table-wrapper" style={{ marginBottom: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={needsScheduling.length > 0 && needsScheduling.every((a) => bulkSelected.includes(a.id))}
                        onChange={() => toggleBulkAll(needsScheduling)}
                        title="Select all"
                      />
                    </th>
                    <th>App #</th><th>Student</th><th>Program</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {needsScheduling.map((a) => (
                    <tr key={a.id} style={{ background: bulkSelected.includes(a.id) ? '#eff6ff' : undefined }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={bulkSelected.includes(a.id)}
                          onChange={() => toggleBulkSelect(a.id)}
                        />
                      </td>
                      <td>#{a.id}</td>
                      <td>{a.user?.profile?.firstName} {a.user?.profile?.lastName}<br /><small style={{ color: '#64748b' }}>{a.user?.email}</small></td>
                      <td>{a.program?.name}</td>
                      <td><span className={`badge badge-${(a.status || '').toLowerCase()}`}>{a.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: '#475569' }}>
                <strong>{bulkSelected.length}</strong> of {needsScheduling.length} selected
              </div>
            </div>
          )}

          <form onSubmit={handleSchedule}>
            <div className="form-grid">
              {!bulkMode && (
                <div className="form-group full-width">
                  <label>Select Application <span className="required">*</span></label>
                  <select value={scheduleForm.applicationId} onChange={e => setScheduleForm({ ...scheduleForm, applicationId: e.target.value })} required={!bulkMode}>
                    <option value="">Choose student</option>
                    {needsScheduling.map(a => {
                      const isRetake = !!(a.interview && a.interview.decision === 'DISQUALIFIED' && hasAcceptedInterviewAppeal(a));
                      return (
                        <option key={a.id} value={a.id}>
                          {isRetake ? '🔁 RETAKE — ' : ''}
                          #{a.id} — {a.user?.profile?.firstName} {a.user?.profile?.lastName} — {a.program?.name}
                        </option>
                      );
                    })}
                  </select>
                  {needsScheduling.some(a => a.interview && a.interview.decision === 'DISQUALIFIED' && hasAcceptedInterviewAppeal(a)) && (
                    <small style={{ color: '#7c3aed', fontWeight: 600, display: 'block', marginTop: 4 }}>
                      <i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>
                      Some applications are <strong>retake-eligible</strong> after an accepted interview-disqualification appeal — their previous interview history will be preserved in the timeline.
                    </small>
                  )}
                </div>
              )}
              <div className="form-group full-width">
                <label>Interview Mode <span className="required">*</span></label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${scheduleForm.mode === 'PHYSICAL' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setScheduleForm({ ...scheduleForm, mode: 'PHYSICAL' })}
                  >
                    <i className="fas fa-building" style={{ marginRight: 6 }}></i>Physical (On-Campus)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${scheduleForm.mode === 'ONLINE' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setScheduleForm({ ...scheduleForm, mode: 'ONLINE' })}
                  >
                    <i className="fas fa-video" style={{ marginRight: 6 }}></i>Online (Video Call)
                  </button>
                </div>
              </div>

              {scheduleForm.mode === 'PHYSICAL' ? (
                <div className="form-group full-width">
                  <label>Venue / Physical Address <span className="required">*</span></label>
                  <input
                    value={scheduleForm.venue}
                    onChange={e => setScheduleForm({ ...scheduleForm, venue: e.target.value })}
                    placeholder='e.g. "AUST Main Campus — Conference Room 2"'
                  />
                  <small style={{ color: '#64748b', fontSize: '0.78rem' }}>
                    The student will see this address in their interview notification.
                  </small>
                </div>
              ) : (
                <div className="form-group full-width">
                  <label>Meeting Link <span className="required">*</span></label>
                  <input
                    value={scheduleForm.meetingLink}
                    onChange={e => setScheduleForm({ ...scheduleForm, meetingLink: e.target.value })}
                    placeholder="https://meet.google.com/abc-defg-hij  or  Zoom / Teams URL" />
                  <small style={{ color: (venueIsUrl || scheduleForm.meetingLink) ? '#0ea5e9' : '#64748b', fontSize: '0.78rem' }}>
                    🔗 Paste a Zoom / Google Meet / Teams URL — it will be clickable in the student's notification and dashboard.
                  </small>
                </div>
              )}
              <div className="form-group"><label>Date <span className="required">*</span></label><input type="date" value={scheduleForm.scheduledDate} onChange={e => setScheduleForm({ ...scheduleForm, scheduledDate: e.target.value })} required /></div>
              <div className="form-group"><label>Time <span className="required">*</span></label><input type="time" value={scheduleForm.scheduledTime} onChange={e => setScheduleForm({ ...scheduleForm, scheduledTime: e.target.value })} required /></div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={bulkMode && bulkSelected.length === 0}>
              {bulkMode ? `Schedule Interviews for ${bulkSelected.length} Student${bulkSelected.length === 1 ? '' : 's'}` : 'Schedule Interview'}
            </button>
          </form>
        </div>
      )}

      {scheduled.length > 0 && (
        <div className="card">
          <div className="card-header">Scheduled Interviews — Record Decision ({scheduled.length})</div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Student</th><th>Program</th><th>Date/Time</th><th>Venue</th><th>Decision</th></tr></thead>
              <tbody>
                {scheduled.map(a => {
                  const url = extractUrl(a.interview?.venue) || a.interview?.meetingLink;
                  const isOpen = decisionForm.interviewId === a.interview?.id;
                  return (
                    <tr key={a.id}>
                      <td><strong>{a.user?.profile?.firstName} {a.user?.profile?.lastName}</strong></td>
                      <td>{a.program?.name}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{a.interview?.scheduledDate}<br />{a.interview?.scheduledTime}</td>
                      <td style={{ maxWidth: 220 }}>
                        {url
                          ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>{a.interview?.venue || url} ↗</a>
                          : (a.interview?.venue || '—')}
                      </td>
                      <td>
                        {isOpen ? (
                          <form onSubmit={handleDecision} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 280 }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button type="button"
                                className={`btn btn-sm ${decisionForm.decision === 'QUALIFIED' ? 'btn-success' : 'btn-outline'}`}
                                onClick={() => setDecisionForm({ ...decisionForm, decision: 'QUALIFIED' })}>
                                ✓ Qualified
                              </button>
                              <button type="button"
                                className={`btn btn-sm ${decisionForm.decision === 'DISQUALIFIED' ? 'btn-danger' : 'btn-outline'}`}
                                onClick={() => setDecisionForm({ ...decisionForm, decision: 'DISQUALIFIED' })}>
                                ✕ Disqualified
                              </button>
                            </div>
                            {decisionForm.decision === 'QUALIFIED' && (
                              <input type="number" min="0" max="100" step="0.1" placeholder="Interview marks (0–100)"
                                value={decisionForm.marks}
                                onChange={e => setDecisionForm({ ...decisionForm, marks: e.target.value })} required />
                            )}
                            <textarea
                              placeholder={decisionForm.decision === 'DISQUALIFIED' ? 'Reason for disqualification (visible to director and student) *' : 'Remarks (optional)'}
                              value={decisionForm.remarks}
                              onChange={e => setDecisionForm({ ...decisionForm, remarks: e.target.value })}
                              rows={2}
                              required={decisionForm.decision === 'DISQUALIFIED'} />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button type="submit" className="btn btn-sm btn-primary">Submit Decision</button>
                              <button type="button" className="btn btn-sm btn-secondary"
                                onClick={() => setDecisionForm({ interviewId: null, decision: '', marks: '', remarks: '' })}>Cancel</button>
                            </div>
                          </form>
                        ) : (
                          <button className="btn btn-sm btn-primary"
                            onClick={() => setDecisionForm({ interviewId: a.interview?.id, decision: '', marks: '', remarks: '' })}>
                            Record Decision
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="card">
          <div className="card-header">Completed Interviews ({completed.length})</div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Student</th><th>Program</th><th>Decision</th><th>Marks</th><th>Merit</th><th>Remarks</th></tr></thead>
              <tbody>
                {completed.map(a => (
                  <tr key={a.id}>
                    <td><strong>{a.user?.profile?.firstName} {a.user?.profile?.lastName}</strong></td>
                    <td>{a.program?.name}</td>
                    <td>
                      <StatusBadge status={a.interview?.decision === 'DISQUALIFIED' ? 'DISQUALIFIED' : 'QUALIFIED'} size="sm" />
                    </td>
                    <td>{a.interview?.marks !== null && a.interview?.marks !== undefined ? <strong>{a.interview.marks}/100</strong> : '—'}</td>
                    <td>{a.meritEntry ? `${a.meritEntry.totalMerit.toFixed(2)}%` : '-'}</td>
                    <td style={{ maxWidth: 240 }}>{a.interview?.remarks || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {needsScheduling.length === 0 && scheduled.length === 0 && completed.length === 0 && (
        <div className="card"><div className="empty-state"><div className="empty-icon">🎤</div><p style={{ fontWeight: 600, color: '#1a2744' }}>No applications forwarded for interview yet.</p><p style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.4rem' }}>Applications appear here once the Director forwards them for interview scheduling.</p></div></div>
      )}
    </div>
  );
};

/* ════════════════ INTERVIEW APPEALS — Coordinator handles INTERVIEW_DISQUALIFICATION; Accept/Reject + Retake ════════════════ */
const CoordinatorAppealsSection = () => {
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [decideForm, setDecideForm] = useState({ appealId: null, decision: '', response: '' });
  const [retakeForm, setRetakeForm] = useState({
    applicationId: '', scheduledDate: '', scheduledTime: '', venue: 'AUST Campus', meetingLink: '',
  });
  const [retakeOpenFor, setRetakeOpenFor] = useState(null);

  const loadAppeals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/appeals');
      setAppeals(res.data.appeals || []);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to load appeals' });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadAppeals(); }, [loadAppeals]);

  const handleDecide = async (appealId, decision) => {
    if (decision === 'REJECTED' && (!decideForm.response || decideForm.response.trim().length < 5)) {
      return setMsg({ type: 'error', text: 'Rejection response is required (min 5 characters). The student will see it.' });
    }
    if (!window.confirm(`Are you sure you want to ${decision === 'ACCEPTED' ? 'ACCEPT' : 'REJECT'} this interview-disqualification appeal?`)) return;
    try {
      await api.put(`/appeals/${appealId}/decision`, {
        decision,
        response: decideForm.response || (decision === 'ACCEPTED' ? 'Appeal accepted — retake interview will be scheduled.' : ''),
      });
      setMsg({
        type: 'success',
        text: decision === 'ACCEPTED'
          ? 'Appeal accepted — student notified. You can now schedule a retake interview.'
          : 'Appeal rejected — student notified.',
      });
      setDecideForm({ appealId: null, decision: '', response: '' });
      loadAppeals();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };

  const handleRetake = async (e, appeal) => {
    e.preventDefault();
    try {
      const detected = extractUrl(retakeForm.venue);
      const payload = { ...retakeForm, applicationId: appeal.applicationId };
      if (detected && !payload.meetingLink) payload.meetingLink = detected;
      await api.post('/coordinator/interview/retake', payload);
      setMsg({ type: 'success', text: 'Retake interview scheduled — student notified with meeting details.' });
      setRetakeForm({ applicationId: '', scheduledDate: '', scheduledTime: '', venue: 'AUST Campus', meetingLink: '' });
      setRetakeOpenFor(null);
      loadAppeals();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to schedule retake' }); }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  const pending = appeals.filter(a => a.status === 'PENDING');
  const accepted = appeals.filter(a => a.status === 'ACCEPTED');
  const rejected = appeals.filter(a => a.status === 'REJECTED');

  const venueIsUrl = !!extractUrl(retakeForm.venue);

  const renderAppealCard = (a, showActions, showRetake) => (
    <div key={a.id} className="card" style={{ borderLeft: `4px solid ${a.status === 'PENDING' ? '#f59e0b' : a.status === 'ACCEPTED' ? '#10b981' : '#ef4444'}` }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span><i className="fas fa-gavel" style={{ marginRight: 8 }}></i>Appeal #{a.id} — {a.subject || 'Interview Disqualification Appeal'}</span>
        <StatusBadge status={`APPEAL_${a.status}`} size="sm" />
      </div>
      <div style={{ padding: '0.75rem 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase' }}>Student</div>
            <div><strong>{a.user?.profile?.firstName} {a.user?.profile?.lastName}</strong></div>
            <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{a.user?.email}</div>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase' }}>Application</div>
            <div>#{a.applicationId} — {a.application?.program?.name || '—'}</div>
            <div><StatusBadge status={a.application?.status} size="sm" /></div>
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase' }}>Submitted</div>
            <div>{new Date(a.createdAt).toLocaleString()}</div>
          </div>
        </div>

        <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: 6, marginBottom: '0.75rem' }}>
          <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: 4 }}>Student's Message</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{a.message || '—'}</div>
        </div>

        {a.proofFile && (
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: 4 }}>Supporting Document</div>
            <DocumentPreviewLink fileUrl={getFileUrl(a.proofFile)} label="View Proof" />
          </div>
        )}

        {a.application?.interview && (
          <div style={{ background: '#fef3c7', padding: '0.75rem', borderRadius: 6, marginBottom: '0.75rem', border: '1px solid #fde68a' }}>
            <div style={{ color: '#92400e', fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>
              <i className="fas fa-history" style={{ marginRight: 6 }}></i>Previous Interview
            </div>
            <div style={{ fontSize: '0.9rem' }}>
              Date: <strong>{a.application.interview.scheduledDate} {a.application.interview.scheduledTime}</strong><br />
              Decision: <StatusBadge status={a.application.interview.decision || 'PENDING'} size="sm" />
              {a.application.interview.marks !== null && a.application.interview.marks !== undefined && (
                <> &nbsp;|&nbsp; Marks: <strong>{a.application.interview.marks}/100</strong></>
              )}
              {a.application.interview.remarks && (
                <div style={{ marginTop: 4, fontStyle: 'italic', color: '#78350f' }}>"{a.application.interview.remarks}"</div>
              )}
            </div>
          </div>
        )}

        {a.response && (
          <div style={{ background: '#ecfdf5', padding: '0.75rem', borderRadius: 6, marginBottom: '0.75rem', border: '1px solid #a7f3d0' }}>
            <div style={{ color: '#065f46', fontSize: '0.78rem', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>Coordinator Response</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{a.response}</div>
          </div>
        )}

        {showActions && (
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
            <div style={{ marginBottom: 8, fontWeight: 600, color: '#1e293b' }}>Decide on this appeal:</div>
            <textarea
              placeholder="Response to student (required for rejection, optional for acceptance)"
              value={decideForm.appealId === a.id ? decideForm.response : ''}
              onChange={e => setDecideForm({ appealId: a.id, decision: '', response: e.target.value })}
              rows={2}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-success btn-sm"
                onClick={() => handleDecide(a.id, 'ACCEPTED')}>
                <i className="fas fa-check" style={{ marginRight: 6 }}></i>Accept Appeal
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDecide(a.id, 'REJECTED')}>
                <i className="fas fa-times" style={{ marginRight: 6 }}></i>Reject Appeal
              </button>
            </div>
            <small style={{ color: '#64748b', display: 'block', marginTop: 6 }}>
              Accepting will move the application back to <strong>FORWARDED</strong> status so you can schedule a retake interview on the same application — the previous interview history will be preserved.
            </small>
          </div>
        )}

        {showRetake && (
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
            {retakeOpenFor === a.id ? (
              <form onSubmit={(e) => handleRetake(e, a)}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: '#1e293b' }}>
                  <i className="fas fa-redo" style={{ marginRight: 6 }}></i>Schedule Retake Interview
                </div>
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label>Venue (Physical Address or Online Meeting Link)</label>
                    <input
                      value={retakeForm.venue}
                      onChange={e => setRetakeForm({ ...retakeForm, venue: e.target.value })}
                      placeholder='e.g. "AUST Main Campus" or "https://meet.google.com/abc-defg-hij"'
                    />
                    <small style={{ color: venueIsUrl ? '#0ea5e9' : '#64748b', fontSize: '0.78rem' }}>
                      {venueIsUrl
                        ? '🔗 Online meeting link auto-detected — it will be clickable in the student\'s notification.'
                        : 'Tip: paste a Zoom / Google Meet / Teams URL here for online retake interviews.'}
                    </small>
                  </div>
                  <div className="form-group">
                    <label>Meeting Link (optional)</label>
                    <input
                      value={retakeForm.meetingLink}
                      onChange={e => setRetakeForm({ ...retakeForm, meetingLink: e.target.value })}
                      placeholder="https://..." />
                  </div>
                  <div className="form-group">
                    <label>Date <span className="required">*</span></label>
                    <input type="date" value={retakeForm.scheduledDate}
                      onChange={e => setRetakeForm({ ...retakeForm, scheduledDate: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Time <span className="required">*</span></label>
                    <input type="time" value={retakeForm.scheduledTime}
                      onChange={e => setRetakeForm({ ...retakeForm, scheduledTime: e.target.value })} required />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="submit" className="btn btn-primary btn-sm">
                    <i className="fas fa-calendar-check" style={{ marginRight: 6 }}></i>Schedule Retake
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm"
                    onClick={() => { setRetakeOpenFor(null); setRetakeForm({ applicationId: '', scheduledDate: '', scheduledTime: '', venue: 'AUST Campus', meetingLink: '' }); }}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setRetakeOpenFor(a.id); setRetakeForm({ applicationId: a.applicationId, scheduledDate: '', scheduledTime: '', venue: 'AUST Campus', meetingLink: '' }); }}>
                <i className="fas fa-redo" style={{ marginRight: 6 }}></i>Schedule Retake Interview
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <h2 className="section-title">Interview Disqualification Appeals</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="card" style={{ background: '#eff6ff', borderLeft: '4px solid #3b82f6', marginBottom: '1rem' }}>
        <div style={{ padding: '0.75rem 1rem', fontSize: '0.9rem', color: '#1e40af' }}>
          <i className="fas fa-info-circle" style={{ marginRight: 8 }}></i>
          Students whose interviews you marked as <strong>Disqualified</strong> can submit an appeal here. If you accept the appeal, you can schedule a <strong>retake interview</strong> on the same application — the previous interview history is preserved in the audit trail.
        </div>
      </div>

      {pending.length > 0 && (
        <>
          <h3 style={{ color: '#92400e', marginTop: '1rem' }}><i className="fas fa-hourglass-half" style={{ marginRight: 6 }}></i>Pending Appeals ({pending.length})</h3>
          {pending.map(a => renderAppealCard(a, true, false))}
        </>
      )}

      {accepted.length > 0 && (
        <>
          <h3 style={{ color: '#065f46', marginTop: '1.5rem' }}><i className="fas fa-check-circle" style={{ marginRight: 6 }}></i>Accepted — Schedule Retake ({accepted.length})</h3>
          {accepted.map(a => renderAppealCard(a, false, a.application?.status === 'FORWARDED' || a.application?.status === 'INTERVIEWED'))}
        </>
      )}

      {rejected.length > 0 && (
        <>
          <h3 style={{ color: '#991b1b', marginTop: '1.5rem' }}><i className="fas fa-times-circle" style={{ marginRight: 6 }}></i>Rejected Appeals ({rejected.length})</h3>
          {rejected.map(a => renderAppealCard(a, false, false))}
        </>
      )}

      {appeals.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">⚖️</div>
            <p>No interview-disqualification appeals at the moment.</p>
          </div>
        </div>
      )}
    </div>
  );
};

/* ════════════════ MERIT (editable until finalized) ════════════════ */
const MeritSection = () => {
  const [entries, setEntries] = useState([]);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const loadMerit = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/merit'); setEntries(res.data.meritList || []); }
    catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { loadMerit(); }, [loadMerit]);

  const handleEdit = (entry) => {
    setEditingId(entry.id);
    setEditForm({ matricPercent: entry.matricPercent, fscPercent: entry.fscPercent, interviewMarks: entry.interviewMarks });
  };

  const handleSave = async () => {
    try {
      await api.put(`/merit/${editingId}`, editForm);
      setMsg({ type: 'success', text: 'Merit entry updated successfully' });
      setEditingId(null);
      loadMerit();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update' }); }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  const allFinalized = entries.length > 0 && entries.every(e => e.isFinalized);

  return (
    <div>
      <h2 className="section-title">Merit List (Coordinator View)</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {allFinalized
        ? <div className="alert alert-success"><i className="fas fa-lock" style={{ marginRight: 6 }}></i>The merit list has been finalized and locked. No further edits are allowed.</div>
        : entries.length > 0 && <div className="alert alert-info"><i className="fas fa-info-circle" style={{ marginRight: 6 }}></i>You can edit merit scores until the Director finalizes and locks the list.</div>
      }

      {entries.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-icon">🏆</div><p style={{ fontWeight: 600, color: '#1a2744' }}>No merit entries yet.</p><p style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.4rem' }}>Merit scores are calculated automatically once interview marks are recorded.</p></div></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>#</th><th>Student</th><th>Program</th><th>Matric %</th><th>FSc %</th><th>Interview</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id}>
                    <td><span className="merit-rank" style={{ width: '28px', height: '28px', fontSize: '0.8rem' }}>{e.rank || i + 1}</span></td>
                    <td><strong>{e.user?.profile?.firstName} {e.user?.profile?.lastName}</strong></td>
                    <td>{e.application?.program?.name}</td>
                    <td>{editingId === e.id ? <input type="number" step="0.1" value={editForm.matricPercent} onChange={ev => setEditForm({ ...editForm, matricPercent: ev.target.value })} style={{ width: '70px' }} /> : `${e.matricPercent.toFixed(1)}%`}</td>
                    <td>{editingId === e.id ? <input type="number" step="0.1" value={editForm.fscPercent} onChange={ev => setEditForm({ ...editForm, fscPercent: ev.target.value })} style={{ width: '70px' }} /> : `${e.fscPercent.toFixed(1)}%`}</td>
                    <td>{editingId === e.id ? <input type="number" step="0.1" value={editForm.interviewMarks} onChange={ev => setEditForm({ ...editForm, interviewMarks: ev.target.value })} style={{ width: '70px' }} /> : e.interviewMarks.toFixed(1)}</td>
                    <td><strong>{e.totalMerit.toFixed(2)}%</strong></td>
                    <td><span className={`badge badge-${e.isFinalized ? 'selected' : 'pending'}`}>{e.isFinalized ? 'Locked' : 'Draft'}</span></td>
                    <td>
                      {editingId === e.id ? (
                        <div className="actions-bar">
                          <button className="btn btn-sm btn-success" onClick={handleSave}>Save</button>
                          <button className="btn btn-sm btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      ) : !e.isFinalized ? (
                        <button className="btn btn-sm btn-outline" onClick={() => handleEdit(e)}>Edit</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/* ════════════════ ENROLLMENT — auto regNo + roll# only after fee paid ════════════════ */
const EnrollmentSection = () => {
  const [apps, setApps] = useState([]);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(null);
  const [savingRoll, setSavingRoll] = useState(null);
  const [savingReg, setSavingReg] = useState(null);
  const [overrides, setOverrides] = useState({}); // userId → { rollNumber, registrationNumber }

  const loadApps = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/enrollment/all'); setApps(res.data.applications || []); }
    catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { loadApps(); }, [loadApps]);

  const setOverride = (userId, key, value) =>
    setOverrides(prev => ({ ...prev, [userId]: { ...prev[userId], [key]: value } }));

  const handleEnroll = async (applicationId, userId) => {
    setEnrolling(applicationId);
    try {
      const body = {};
      const o = overrides[userId] || {};
      if (o.rollNumber?.trim()) body.rollNumber = o.rollNumber.trim();
      if (o.registrationNumber?.trim()) body.registrationNumber = o.registrationNumber.trim();
      const res = await api.post(`/coordinator/enroll/${applicationId}`, body);
      const enr = res.data.enrollment;
      setMsg({
        type: 'success',
        text: `Enrolled. Reg #: ${enr.registrationNumber || '—'} · Roll #: ${enr.rollNumber || 'Pending'} · Status: ${enr.status}`,
      });
      loadApps();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' });
    } finally { setEnrolling(null); }
  };

  const handleRollUpdate = async (userId) => {
    const value = overrides[userId]?.rollNumber?.trim();
    if (!value) return setMsg({ type: 'error', text: 'Roll number is required' });
    setSavingRoll(userId);
    try {
      await api.put(`/coordinator/enrollment/${userId}/roll-number`, { rollNumber: value });
      setMsg({ type: 'success', text: 'Roll number updated' });
      loadApps();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
    finally { setSavingRoll(null); }
  };

  const handleRegUpdate = async (userId) => {
    const value = overrides[userId]?.registrationNumber?.trim();
    if (!value) return setMsg({ type: 'error', text: 'Registration number is required' });
    setSavingReg(userId);
    try {
      await api.put(`/coordinator/enrollment/${userId}/registration-number`, { registrationNumber: value });
      setMsg({ type: 'success', text: 'Registration number updated' });
      loadApps();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
    finally { setSavingReg(null); }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  const feeApproved = apps.filter(a => a.status === 'FEE_APPROVED');
  const feePaid = apps.filter(a => a.status === 'FEE_PAID');
  const enrolled = apps.filter(a => a.status === 'ENROLLED' || a.user?.enrollment?.status === 'ENROLLED');

  return (
    <div>
      <div className="enroll-toolbar">
        <h2 className="section-title">Enrollment Management</h2>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="enroll-info-banner">
        <div className="ei-icon"><i className="fas fa-circle-info"></i></div>
        <div>
          <strong>Auto Generation Rules:</strong> Registration Number is generated immediately on enrollment
          (format <code>InstituteCode + Intake + Faculty + Department + Program + StudentNumber</code>, e.g.{' '}
          <code>001F26C0103001</code>). Roll Number (e.g. <code>ADCS-F26-101</code>) is only generated{' '}
          <strong>after the fee payment is approved</strong>; until then it shows as <code>Pending</code>.
          Both are unique and editable here by the Coordinator.
        </div>
      </div>

      <div className="enroll-stats">
        <div className="enroll-stat warn">
          <div className="es-icon"><i className="fas fa-clock"></i></div>
          <div>
            <div className="es-num">{feePaid.length}</div>
            <div className="es-lbl">Awaiting Confirmation</div>
          </div>
        </div>
        <div className="enroll-stat ready">
          <div className="es-icon"><i className="fas fa-check-circle"></i></div>
          <div>
            <div className="es-num">{feeApproved.length}</div>
            <div className="es-lbl">Ready to Enroll</div>
          </div>
        </div>
        <div className="enroll-stat done">
          <div className="es-icon"><i className="fas fa-graduation-cap"></i></div>
          <div>
            <div className="es-num">{enrolled.length}</div>
            <div className="es-lbl">Enrolled Students</div>
          </div>
        </div>
      </div>

      {feePaid.length > 0 && (
        <div className="enroll-card">
          <div className="enroll-card__header">
            <div className="enroll-card__title">
              <i className="fas fa-clock" style={{ color: '#c2410c' }}></i>
              Fee Paid — Awaiting Director Confirmation
              <span className="pill warn">{feePaid.length}</span>
            </div>
          </div>
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead><tr><th>Student</th><th>Program</th><th>Amount</th><th>Method</th><th>Txn ID</th><th>Paid At</th></tr></thead>
              <tbody>
                {feePaid.map(a => (
                  <tr key={a.id}>
                    <td className="enroll-student-cell">
                      <strong>{a.user?.profile?.firstName} {a.user?.profile?.lastName}</strong>
                    </td>
                    <td>{a.program?.name}</td>
                    <td><strong>PKR {a.feePayment?.amount}</strong></td>
                    <td>{a.feePayment?.paymentMethod}</td>
                    <td><code style={{ fontSize: '0.78rem' }}>{a.feePayment?.txnId || '-'}</code></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{a.feePayment?.paidAt ? new Date(a.feePayment.paidAt).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {feeApproved.length > 0 && (
        <div className="enroll-card">
          <div className="enroll-card__header">
            <div className="enroll-card__title">
              <i className="fas fa-user-check" style={{ color: '#047857' }}></i>
              Fee Approved — Ready to Enroll
              <span className="pill ready">{feeApproved.length}</span>
            </div>
          </div>
          <div className="enroll-card__hint">
            <i className="fas fa-lightbulb"></i>
            Click <strong>Enroll</strong> to auto-generate Registration &amp; Roll numbers. To override, type a custom value before clicking enroll.
          </div>
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead><tr><th>Student</th><th>Program</th><th>Merit</th><th>Reg # (override)</th><th>Roll # (override)</th><th>Action</th></tr></thead>
              <tbody>
                {feeApproved.map(a => (
                  <tr key={a.id}>
                    <td className="enroll-student-cell">
                      <strong>{a.user?.profile?.firstName} {a.user?.profile?.lastName}</strong>
                      <span className="em">{a.user?.email}</span>
                    </td>
                    <td>{a.program?.name}</td>
                    <td>{a.meritEntry?.totalMerit?.toFixed(2) || '-'}%</td>
                    <td>
                      <input type="text" className="enroll-input reg" placeholder="Auto-generate" value={overrides[a.user?.id]?.registrationNumber || ''}
                        onChange={e => setOverride(a.user?.id, 'registrationNumber', e.target.value)} />
                    </td>
                    <td>
                      <input type="text" className="enroll-input roll" placeholder="Auto-generate" value={overrides[a.user?.id]?.rollNumber || ''}
                        onChange={e => setOverride(a.user?.id, 'rollNumber', e.target.value)} />
                    </td>
                    <td>
                      <button className="btn btn-sm btn-success" onClick={() => handleEnroll(a.id, a.user?.id)} disabled={enrolling === a.id}>
                        {enrolling === a.id ? <>… Enrolling</> : <><i className="fas fa-graduation-cap" style={{ marginRight: 4 }}></i>Enroll</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {enrolled.length > 0 && (
        <div className="enroll-card">
          <div className="enroll-card__header">
            <div className="enroll-card__title">
              <i className="fas fa-graduation-cap" style={{ color: '#1d4ed8' }}></i>
              Enrolled Students
              <span className="pill done">{enrolled.length}</span>
            </div>
          </div>
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Student</th><th>Program</th><th>Reg # (editable)</th><th>Roll # (editable)</th>
                  <th>LMS Username</th><th>Status</th><th>Enrolled</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrolled.map(a => {
                  const enr = a.user?.enrollment;
                  const userId = a.user?.id;
                  const regVal = overrides[userId]?.registrationNumber !== undefined ? overrides[userId].registrationNumber : (enr?.registrationNumber || '');
                  const rollVal = overrides[userId]?.rollNumber !== undefined ? overrides[userId].rollNumber : (enr?.rollNumber || '');
                  return (
                    <tr key={a.id}>
                      <td className="enroll-student-cell">
                        <strong>{a.user?.profile?.firstName} {a.user?.profile?.lastName}</strong>
                        <span className="em">{a.user?.email}</span>
                      </td>
                      <td>{a.program?.name}</td>
                      <td>
                        <input type="text" className="enroll-input reg" value={regVal}
                          onChange={e => setOverride(userId, 'registrationNumber', e.target.value)} />
                      </td>
                      <td>
                        <input type="text" className="enroll-input roll" value={rollVal}
                          onChange={e => setOverride(userId, 'rollNumber', e.target.value)} />
                      </td>
                      <td><code style={{ fontSize: '0.78rem' }}>{enr?.lmsUsername || '-'}</code></td>
                      <td><span className={`badge badge-${(enr?.status || 'pending').toLowerCase()}`}>{enr?.status || 'PENDING'}</span></td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{enr?.enrolledAt ? new Date(enr.enrolledAt).toLocaleDateString() : '-'}</td>
                      <td>
                        <div className="enroll-actions">
                          <button className="btn btn-sm btn-outline" onClick={() => handleRegUpdate(userId)} disabled={savingReg === userId}>
                            {savingReg === userId ? '…' : 'Save Reg'}
                          </button>
                          <button className="btn btn-sm btn-outline" onClick={() => handleRollUpdate(userId)} disabled={savingRoll === userId}>
                            {savingRoll === userId ? '…' : 'Save Roll'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {feeApproved.length === 0 && feePaid.length === 0 && enrolled.length === 0 && (
        <div className="enroll-card">
          <div className="enroll-empty">
            <div className="ee-emoji">🎓</div>
            <div className="ee-title">No students ready for enrollment yet</div>
            <div className="ee-sub">Once students complete fee payment and the Director confirms, they'll appear here for enrollment.</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CoordinatorDashboard;


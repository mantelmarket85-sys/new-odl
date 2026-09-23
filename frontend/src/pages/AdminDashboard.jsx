import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import api, { getFileUrl } from '../utils/api';
import StatusBadge from '../components/dashboard/StatusBadge';
import StatusTimeline from '../components/dashboard/StatusTimeline';
import DocumentPreviewLink from '../components/dashboard/DocumentPreviewLink';
import BackupsExportsSection from '../components/dashboard/BackupsExportsSection';
// Phase 1 §3 — shared Admission Cycle panel (identical for Director & Super Admin).
import AdmissionCyclePanel from '../components/admissions/AdmissionCyclePanel';
import {
  downloadCompleteApplicationPdf,
  downloadMeritListPdf,
  downloadEnrolledStudentsPdf,
  downloadEnrolledStudentsCsv,
} from '../utils/applicationPdf';

// §2.1 — statuses considered "new" (i.e. not yet forwarded/decided by the
// Director). Mirrors NEW_APP_STATUSES in backend/src/routes/admin.js and is
// only used as a client-side fallback for the department card badge.
const NEW_APP_STATUSES_UI = ['SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'NEED_INFO', 'RESULT_AWAITED'];

const sidebarItems = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'departments', label: 'Departments', icon: '🏛️' },
  { key: 'announce', label: 'Announce Admissions Cycle', icon: '📣' },
  { key: 'applications', label: 'Applications', icon: '📋' },
  { key: 'initialmerit', label: 'Initial Merit List', icon: '🎯' },
  { key: 'merit', label: 'Final Merit List', icon: '🏆' },
  { key: 'feemanagement', label: 'Fee Management', icon: '💰' },
  { key: 'paymethods', label: 'Payment Methods', icon: '🏦' },
  { key: 'appeals', label: 'Appeals', icon: '📝' },
  { key: 'enrollment', label: 'Enrollment', icon: '🎓' },
  { key: 'backups', label: 'Backups & Exports', icon: '💾' },
];

// Auto-detect a URL inside a free-text venue
const extractUrl = (text) => {
  if (!text) return null;
  const m = String(text).match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
};

const docTypeLabel = (t) => ({
  dmc: 'DMC / Marks Sheet', certificate: 'Certificate', char_cert: 'Character Certificate',
  provisional: 'Provisional Certificate', additional: 'Additional Document', part1_dmc: 'Part-I DMC',
}[t] || t);

/* ════════════════ PDF Download Helper ════════════════
 * Generates ONE merged PDF containing:
 *   1. Professional AUST admission form (with logo / header / personal / academic / merit / fee / enrollment)
 *   2. Affidavit / applicant declaration page
 *   3. All uploaded documents (Matric DMC, FSc DMC, Character Cert, Fee receipts, etc.)
 *
 * Pure client-side via pdf-lib — backend is untouched.
 * Filename pattern: FirstName_LastName_Application.pdf
 */
const downloadPdf = async (appId) => {
  try {
    await downloadCompleteApplicationPdf(appId);
  } catch (err) {
    console.error('PDF export failed:', err);
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

// Download the complete admission package (form + all uploaded docs) as ZIP
// NOTE: Uses /api/exports/individual/:id so the ZIP file is named `Name_CNIC.zip`
// and contains a `/Name_CNIC/` folder (the "Individual Download Fix" from the
// Backup & Export feature spec). Falls back to legacy /admission-package/:id
// only if needed.
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

// Open the printable HTML form in a new tab
const openPrintForm = (appId) => {
  const token = localStorage.getItem('token');
  const url = `${_backendBase()}/print-application/${appId}?token=${encodeURIComponent(token || '')}`;
  window.open(url, '_blank');
};

/* ════════════════ ADMIN DASHBOARD ════════════════ */
const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderSection = () => {
    switch (activeTab) {
      case 'dashboard': return <StatsSection />;
      case 'departments': return <DepartmentsSection />;
      case 'announce': return <AnnounceCycleSection />;
      case 'applications': return <ApplicationsSection />;
      case 'initialmerit': return <InitialMeritListSection />;
      case 'merit': return <MeritListSection />;
      case 'feemanagement': return <FeeManagementSection />;
      case 'paymethods': return <PaymentMethodsSection />;
      case 'appeals': return <AppealsSection />;
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
              <small>Director Admissions Panel</small>
            </div>
          </div>
        </div>
        <div className="navbar-user">
          <span>{user?.email}</span>
          <span className="role-badge"><i className="fas fa-user-tie" style={{ marginRight: 5 }}></i>Director</span>
          <Link to="/" className="nav-link"><i className="fas fa-house"></i></Link>
          <button onClick={logout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <i className="fas fa-arrow-right-from-bracket"></i> Logout
          </button>
        </div>
      </nav>
      <div className="page-wrapper">
        <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-section-title">Director Panel</div>
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

/* ════════════════ DEPARTMENT APPLICATION CARDS (Phase 2) ════════════════ */
/* Director dashboard: one card per department showing NEW applications
   awaiting forward, with a one-click "Forward All to Coordinator" action. */
const DeptApplicationCards = () => {
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = async () => {
    try {
      const res = await api.get('/admin/dept-application-counts');
      setDepts(res.data.departments || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };
  // §1.2 Real-time: the per-department "new applications" count (and the badge)
  // must update live as new applications arrive — no manual refresh. We poll on
  // a short interval and also refresh on window focus / global aust:refresh.
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    const onFocus = () => load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const onRefresh = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('aust:refresh', onRefresh);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('aust:refresh', onRefresh);
    };
  }, []);

  const forwardAll = async (dept) => {
    if (!dept.newApplications) return;
    if (!window.confirm(`Forward all ${dept.newApplications} new application(s) in ${dept.departmentName} to the Department Coordinator?`)) return;
    setBusy(dept.departmentId);
    setMsg({ type: '', text: '' });
    try {
      const res = await api.put('/admin/applications/forward-department', { departmentId: dept.departmentId });
      setMsg({ type: 'success', text: res.data?.message || 'Applications forwarded.' });
      await load();
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to forward applications.' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return null;
  if (!depts.length) return null;

  return (
    <section id="dept-application-cards" style={{ marginTop: 28 }}>
      <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: 12 }}>
        <i className="fas fa-building-columns" style={{ marginRight: 8, color: '#0b3c8c' }}></i>
        New Applications by Department
      </h3>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="stats-grid stagger">
        {depts.map((d) => (
          <div className="stat-card" key={d.departmentId} style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', overflow: 'visible' }}>
            {/* §1.2 Live count badge — small colourful circular badge showing the
                number of NEW applications for this department. Updates in real
                time via the polling above. Hidden when there are none. */}
            {d.newApplications > 0 && (
              <span
                className="new-app-badge"
                title={`${d.newApplications} new application${d.newApplications === 1 ? '' : 's'} awaiting forward`}
                aria-label={`${d.newApplications} new applications`}
                style={{
                  position: 'absolute', top: -10, right: -10,
                  minWidth: 26, height: 26, padding: '0 7px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 999,
                  background: 'linear-gradient(135deg, #ef4444, #f97316)',
                  color: '#fff', fontSize: '0.8rem', fontWeight: 800,
                  boxShadow: '0 2px 8px rgba(239,68,68,0.5)',
                  border: '2px solid #fff',
                  zIndex: 2,
                }}
              >
                {d.newApplications > 99 ? '99+' : d.newApplications}
              </span>
            )}
            <div style={{ fontWeight: 700, color: '#0b3c8c', fontSize: '0.95rem' }}>{d.departmentName}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="stat-value" style={{ color: d.newApplications ? '#ea580c' : '#94a3b8', fontSize: '1.9rem' }}>
                {d.newApplications}
              </span>
              <span className="stat-label" style={{ marginBottom: 0 }}>new to forward</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>Total: <strong>{d.totalApplications}</strong></span>
              <span>Forwarded: <strong>{d.forwarded}</strong></span>
              <span>Enrolled: <strong>{d.enrolled}</strong></span>
            </div>
            {!d.hasCoordinator && (
              <div style={{ fontSize: '0.7rem', color: '#b45309' }}>
                <i className="fas fa-triangle-exclamation" style={{ marginRight: 4 }}></i>
                No coordinator assigned yet.
              </div>
            )}
            {/* §1.3 Forward to Coordinator — automatically ENABLED when this
                department has new applications, and automatically DISABLED when
                there are none. Forwarding routes only to THIS department's
                coordinator (backend scopes by this department's programs). */}
            <button
              className="btn btn-primary btn-sm"
              disabled={!d.newApplications || busy === d.departmentId}
              onClick={() => forwardAll(d)}
              title={d.newApplications
                ? `Forward ${d.newApplications} new application(s) to the ${d.departmentName} coordinator`
                : 'No applications available to forward'}
              style={{ marginTop: 'auto', opacity: d.newApplications ? 1 : 0.55, cursor: d.newApplications ? 'pointer' : 'not-allowed' }}
            >
              {busy === d.departmentId
                ? 'Forwarding…'
                : d.newApplications
                  ? <><i className="fas fa-share" style={{ marginRight: 6 }}></i>Forward All to Coordinator</>
                  : <><i className="fas fa-ban" style={{ marginRight: 6 }}></i>No Applications to Forward</>}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

/* ════════════════ STATS ════════════════ */
const StatsSection = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/admin/stats')
      .then(r => setStats(r.data.stats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h2 className="section-title">Director Dashboard</h2>
        <div className="stats-grid">
          {Array.from({ length: 8 }).map((_, i) => (
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

  // Task 1 — VISUAL redesign only. The numbers below are the SAME values from
  // /admin/stats; nothing about how they are fetched or computed changes. The
  // cards are simply grouped into three human-readable stories (the admission
  // journey, the money side, and where everyone ended up) with warmer copy and
  // a headline that reads like a person summarising the day.
  const n = (v) => Number(v || 0);
  const groups = [
    {
      key: 'journey',
      title: 'The Admission Journey',
      blurb: 'Where every applicant currently sits, from first submission to the final shortlist.',
      icon: 'fa-route',
      accent: '#0b3c8c',
      items: [
        { label: 'Applications received', value: stats.totalApplications, icon: 'fa-clipboard-list', color: '#0b3c8c', hint: 'Everything that has come in so far' },
        { label: 'Submitted & waiting',   value: stats.submitted,          icon: 'fa-paper-plane',      color: '#2563eb', hint: 'Complete and ready to be looked at' },
        { label: 'Currently under review', value: stats.underReview,       icon: 'fa-magnifying-glass', color: '#d97706', hint: 'On a reviewer’s desk right now' },
        { label: 'Forwarded to departments', value: stats.forwarded,       icon: 'fa-share',            color: '#7c3aed', hint: 'Handed over for a decision' },
        { label: 'Called for interview',  value: stats.interviewScheduled, icon: 'fa-microphone-lines', color: '#be185d', hint: 'Interview scheduled' },
        { label: 'Made the merit list',   value: stats.meritListed,        icon: 'fa-trophy',           color: '#059669', hint: 'Selected on merit' },
      ],
    },
    {
      key: 'fees',
      title: 'The Money Side',
      blurb: 'How the fee process is tracking — what is owed, what has arrived and what you have signed off.',
      icon: 'fa-wallet',
      accent: '#0891b2',
      items: [
        { label: 'Fee still pending',    value: stats.feePending || 0, icon: 'fa-hourglass-half',  color: '#ea580c', hint: 'Not paid yet' },
        { label: 'Fee paid, awaiting you', value: stats.feePaid || 0,  icon: 'fa-money-bill-wave', color: '#0891b2', hint: 'Received, needs approval' },
        { label: 'Fee approved by you',  value: stats.feeApproved,     icon: 'fa-circle-check',    color: '#16a34a', hint: 'Cleared and confirmed' },
      ],
    },
    {
      key: 'outcome',
      title: 'Where Everyone Landed',
      blurb: 'The bottom line — who is now a student, who did not make it, and the size of the community.',
      icon: 'fa-flag-checkered',
      accent: '#065f46',
      items: [
        { label: 'Now enrolled',       value: stats.enrolled,      icon: 'fa-graduation-cap', color: '#065f46', hint: 'Officially in' },
        { label: 'Not moving forward', value: stats.rejected,      icon: 'fa-circle-xmark',   color: '#dc2626', hint: 'Application closed' },
        { label: 'Students on the books', value: stats.totalStudents, icon: 'fa-users',       color: '#475569', hint: 'Total community size' },
      ],
    },
  ];

  // A friendly one-line summary, built entirely from the existing numbers.
  const enrolled = n(stats.enrolled);
  const inPipeline = n(stats.submitted) + n(stats.underReview) + n(stats.forwarded) + n(stats.interviewScheduled);
  const awaitingFee = n(stats.feePaid);

  return (
    <div>
      <h2 className="section-title">Director Dashboard</h2>

      {/* Human-sounding headline — pure presentation over the same stats */}
      <div style={{
        background: 'linear-gradient(135deg, #0b3c8c 0%, #123a7a 55%, #0891b2 100%)',
        color: '#fff', borderRadius: 16, padding: '20px 22px', marginBottom: 22,
        boxShadow: '0 10px 30px -12px rgba(11,60,140,0.55)', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: -30, top: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', right: 60, bottom: -50, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.85 }}>
          <i className="fas fa-chart-line"></i> Admissions at a glance
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '1.15rem', lineHeight: 1.5, maxWidth: 720, position: 'relative' }}>
          You’ve welcomed <b>{enrolled}</b> student{enrolled === 1 ? '' : 's'} so far, with{' '}
          <b>{inPipeline}</b> still working their way through the pipeline
          {awaitingFee > 0 ? <> and <b>{awaitingFee}</b> fee payment{awaitingFee === 1 ? '' : 's'} waiting on your approval</> : null}.
          Here’s the full picture.
        </p>
      </div>

      {/* Three grouped stories, each using the SAME underlying numbers */}
      {groups.map((g) => (
        <section key={g.key} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{
              width: 34, height: 34, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${g.accent}1a, ${g.accent}33)`, color: g.accent, fontSize: '0.95rem',
            }}>
              <i className={`fas ${g.icon}`}></i>
            </span>
            <div>
              <div style={{ fontWeight: 800, color: '#1a2744', fontSize: '1rem', lineHeight: 1.1 }}>{g.title}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{g.blurb}</div>
            </div>
          </div>
          <div className="stats-grid stagger">
            {g.items.map((s, i) => (
              <div className="stat-card" key={i} style={{
                borderTop: `3px solid ${s.color}`,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div className="stat-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="stat-icon" style={{
                    background: `linear-gradient(135deg, ${s.color}1a, ${s.color}33)`,
                    color: s.color,
                  }}>
                    <i className={`fas ${s.icon}`}></i>
                  </div>
                  <div className="stat-value" style={{ color: s.color, fontSize: '1.9rem', lineHeight: 1 }}>{s.value}</div>
                </div>
                <div className="stat-label" style={{ fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{s.hint}</div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Phase 2: per-department new-application cards + forward-all action */}
      <DeptApplicationCards />
    </div>
  );
};

/* ════════════════ APPLICATIONS ════════════════ */
const ApplicationsSection = () => {
  const [apps, setApps] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedApp, setSelectedApp] = useState(null);
  const [selected, setSelected] = useState([]);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);
  // Additional Fixes §9 — Department → Program navigation state.
  // activeDept / activeProgram hold the currently-drilled-into group keys.
  const [activeDept, setActiveDept] = useState(null);
  const [activeProgram, setActiveProgram] = useState(null);

  // §2.1 — live per-department "new applications" counts, used to draw the
  // small circular corner badge on each department card below. Keyed by
  // department NAME so it maps exactly onto the grouped card list.
  const [deptNewCounts, setDeptNewCounts] = useState({});

  const loadApps = async () => {
    try {
      const res = await api.get('/admin/applications', { params: { status: filter, search } });
      setApps(res.data.applications || []);
    } catch {} finally { setLoading(false); }
  };

  // §2.1 — independent of the status filter, so the badge always reflects the
  // true number of NEW applications for that specific department.
  const loadDeptCounts = async () => {
    try {
      const res = await api.get('/admin/dept-application-counts', { params: { _t: Date.now() } });
      const map = {};
      for (const d of (res.data.departments || [])) {
        map[d.departmentName] = d.newApplications || 0;
      }
      setDeptNewCounts(map);
    } catch { /* badge simply doesn't render if this fails */ }
  };
  // §1.2/§1.3 Real-time: keep the applications list (and therefore the
  // forwardable count / Forward-to-Coordinator button state) live as new
  // applications arrive or statuses change — no manual refresh needed.
  useEffect(() => {
    const refreshAll = () => { loadApps(); loadDeptCounts(); };
    refreshAll();
    const t = setInterval(refreshAll, 8000);
    const onFocus = () => refreshAll();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshAll(); };
    const onRefresh = () => refreshAll();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('aust:refresh', onRefresh);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('aust:refresh', onRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  // ── Additional Fixes §9 — group applications by Department → Program ──
  const grouped = useMemo(() => {
    const depts = {};
    for (const a of apps) {
      const deptName = a.program?.department?.name || 'Unassigned Department';
      const progId = a.program?.id ?? 'none';
      const progName = a.program?.name || 'Unassigned Program';
      const progShort = a.program?.shortForm || a.program?.code || '';
      if (!depts[deptName]) depts[deptName] = { name: deptName, programs: {}, count: 0 };
      if (!depts[deptName].programs[progId]) {
        depts[deptName].programs[progId] = { id: progId, name: progName, shortForm: progShort, apps: [] };
      }
      depts[deptName].programs[progId].apps.push(a);
      depts[deptName].count++;
    }
    return depts;
  }, [apps]);

  const deptList = Object.values(grouped).sort((x, y) => x.name.localeCompare(y.name));

  const handleDecision = async (id, status, remarks) => {
    try {
      await api.put(`/admin/applications/${id}/decision`, { status, remarks });
      setMsg({ type: 'success', text: `Application ${status.replace(/_/g, ' ').toLowerCase()} successfully` });
      setSelectedApp(null);
      loadApps();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };

  // Statuses that the Director can bulk-forward to the Coordinator
  const FORWARDABLE_STATUSES = ['SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'RESULT_AWAITED'];
  const isForwardable = (a) => FORWARDABLE_STATUSES.includes(a.status) && a.resultStatus !== 'Waiting';

  const handleBulkForward = async () => {
    const ids = selected.length > 0 ? selected : apps.filter(isForwardable).map(a => a.id);
    if (ids.length === 0) return setMsg({ type: 'error', text: 'No forwardable applications selected' });
    if (!window.confirm(`Forward ${ids.length} application(s) to Coordinator?`)) return;
    try {
      const res = await api.put('/admin/applications/forward-bulk', { applicationIds: ids });
      setMsg({ type: 'success', text: res.data?.message || `${ids.length} applications forwarded to coordinator` });
      setSelected([]);
      loadApps();
      // §1.3 Propagate to dept cards / stats / coordinator views in real time.
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => {
    const forwardableIds = apps.filter(isForwardable).map(a => a.id);
    setSelected(prev => prev.length === forwardableIds.length ? [] : forwardableIds);
  };

  const statuses = ['all', 'SUBMITTED', 'UNDER_REVIEW', 'NEED_INFO', 'FORWARDED', 'INTERVIEWED', 'SELECTED', 'FEE_PENDING', 'FEE_PAID', 'FEE_APPROVED', 'ENROLLED', 'REJECTED'];
  const forwardableCount = apps.filter(isForwardable).length;

  // Currently drilled-into program's applications (Additional Fixes §9)
  const activeProgramObj =
    activeDept && activeProgram && grouped[activeDept]
      ? grouped[activeDept].programs[activeProgram]
      : null;
  const visibleApps = activeProgramObj ? activeProgramObj.apps : [];

  const renderAppRow = (app) => (
    <tr key={app.id}>
      <td className="checkbox-cell">
        {isForwardable(app) && (
          <input type="checkbox" checked={selected.includes(app.id)} onChange={() => toggleSelect(app.id)} />
        )}
      </td>
      <td>#{app.id}</td>
      <td>
        <strong>{app.user?.profile?.firstName} {app.user?.profile?.lastName}</strong><br />
        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{app.user?.email}</span>
      </td>
      <td>{app.program?.name}</td>
      <td>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <StatusBadge status={app.status} size="sm" />
          {app.resultStatus === 'Waiting' && app.status !== 'RESULT_AWAITED' && (
            <StatusBadge status="RESULT_AWAITED" size="sm" />
          )}
          {app.lastAppealStatus === 'PENDING' && <StatusBadge status="APPEAL_SUBMITTED" size="sm" />}
        </div>
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>{app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : '—'}</td>
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
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>Applications Management</h2>
        {forwardableCount > 0 && (
          <button className="btn btn-primary" onClick={handleBulkForward}>
            <i className="fas fa-share-from-square" style={{ marginRight: 6 }}></i>
            Forward {selected.length > 0 ? selected.length : forwardableCount} to Coordinator
          </button>
        )}
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="filter-bar">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          {statuses.map(s => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace(/_/g, ' ')}</option>)}
        </select>
        <input placeholder="Search by name, email, CNIC..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, maxWidth: '300px' }} />
      </div>

      {/* Additional Fixes §9 — Department → Program breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '0.5rem 0 1rem', fontSize: '0.9rem' }}>
        <button className="btn btn-sm btn-outline" onClick={() => { setActiveDept(null); setActiveProgram(null); }}>
          <i className="fas fa-sitemap" style={{ marginRight: 5 }}></i>All Departments
        </button>
        {activeDept && (
          <>
            <i className="fas fa-chevron-right" style={{ color: '#94a3b8', fontSize: '0.7rem' }}></i>
            <button className="btn btn-sm btn-outline" onClick={() => setActiveProgram(null)}>{activeDept}</button>
          </>
        )}
        {activeProgramObj && (
          <>
            <i className="fas fa-chevron-right" style={{ color: '#94a3b8', fontSize: '0.7rem' }}></i>
            <span style={{ fontWeight: 700, color: '#1e40af' }}>{activeProgramObj.name}</span>
          </>
        )}
      </div>

      {loading ? <div className="loading"><span className="spinner"></span></div> : (
        <>
          {/* LEVEL 1 — Department cards */}
          {!activeDept && (
            <div className="card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
              {deptList.length === 0 && <div className="card" style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No applications found</div>}
              {deptList.map((d) => {
                // §2.1 — number of NEW (awaiting-forward) applications for THIS
                // department. Falls back to counting the loaded rows when the
                // counts endpoint is unavailable.
                const newCount = Object.prototype.hasOwnProperty.call(deptNewCounts, d.name)
                  ? deptNewCounts[d.name]
                  : Object.values(d.programs).reduce(
                      (sum, p) => sum + p.apps.filter((a) => NEW_APP_STATUSES_UI.includes(a.status)).length, 0);
                return (
                <button key={d.name} className="card" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid #e2e8f0', position: 'relative', overflow: 'visible' }}
                  onClick={() => { setActiveDept(d.name); setActiveProgram(null); }}>
                  {/* §2.1 — WhatsApp-style circular badge on the card corner with
                      the live count of NEW applications for this department. */}
                  {newCount > 0 && (
                    <span
                      className="new-app-badge"
                      title={`${newCount} new application${newCount === 1 ? '' : 's'} for ${d.name}`}
                      aria-label={`${newCount} new applications for ${d.name}`}
                      style={{
                        position: 'absolute', top: -10, right: -10,
                        minWidth: 26, height: 26, padding: '0 7px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 999,
                        background: 'linear-gradient(135deg, #ef4444, #f97316)',
                        color: '#fff', fontSize: '0.8rem', fontWeight: 800, lineHeight: 1,
                        boxShadow: '0 2px 8px rgba(239,68,68,0.5)',
                        border: '2px solid #fff',
                        zIndex: 3,
                      }}
                    >
                      {newCount > 99 ? '99+' : newCount}
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="fas fa-building" style={{ color: '#2563eb', fontSize: '1.2rem' }}></i>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{d.name}</div>
                      <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                        {Object.keys(d.programs).length} program{Object.keys(d.programs).length === 1 ? '' : 's'} · {d.count} application{d.count === 1 ? '' : 's'}
                      </div>
                      {newCount > 0 && (
                        <div style={{ fontSize: '0.74rem', color: '#ea580c', fontWeight: 700, marginTop: 2 }}>
                          <i className="fas fa-circle" style={{ fontSize: '0.5rem', marginRight: 5, verticalAlign: 'middle' }}></i>
                          {newCount} new
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
          )}

          {/* LEVEL 2 — Program cards within the selected department */}
          {activeDept && !activeProgram && grouped[activeDept] && (
            <div className="card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
              {Object.values(grouped[activeDept].programs).sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                <button key={p.id} className="card" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid #e2e8f0' }}
                  onClick={() => setActiveProgram(String(p.id))}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="fas fa-graduation-cap" style={{ color: '#16a34a', fontSize: '1.2rem' }}></i>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{p.name} {p.shortForm ? <span style={{ color: '#94a3b8', fontWeight: 500 }}>({p.shortForm})</span> : null}</div>
                      <div style={{ fontSize: '0.82rem', color: '#64748b' }}>{p.apps.length} application{p.apps.length === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* LEVEL 3 — Applications for the selected program */}
          {activeProgramObj && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th className="checkbox-cell">
                        <input type="checkbox" onChange={toggleAll}
                          checked={forwardableCount > 0 && selected.length === forwardableCount}
                          title="Select all forwardable applications" />
                      </th>
                      <th>ID</th><th>Student</th><th>Program</th><th>Status</th><th>Date</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleApps.map(renderAppRow)}
                    {visibleApps.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No applications in this program</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {selectedApp && <ApplicationModal app={selectedApp} onClose={() => setSelectedApp(null)} onDecision={handleDecision} />}
    </div>
  );
};

/* ════════════════ APPLICATION MODAL ════════════════ */
const ApplicationModal = ({ app, onClose, onDecision }) => {
  const [remarks, setRemarks] = useState('');
  const [fullApp, setFullApp] = useState(app);
  const profile = fullApp.user?.profile || app.user?.profile;
  const docs = fullApp.user?.documents || app.user?.documents || [];
  const edus = fullApp.user?.educations || app.user?.educations || [];
  const events = fullApp.statusEvents || app.statusEvents || [];
  const appeals = fullApp.appeals || app.appeals || [];

  // Re-fetch full record (with structured profile + education docs + timeline)
  useEffect(() => {
    api.get(`/admin/applications/${app.id}`).then(r => {
      if (r.data?.application) setFullApp(r.data.application);
    }).catch(() => {});
  }, [app.id]);

  const meetingUrl = extractUrl(fullApp.interview?.venue) || fullApp.interview?.meetingLink;

  const safeDecide = (status) => {
    if (status === 'REJECTED' && (!remarks || remarks.trim().length < 5)) {
      alert('Please provide a clear rejection reason (min 5 characters). The student will see this reason and may appeal.');
      return;
    }
    if (status === 'NEED_INFO' && (!remarks || remarks.trim().length < 5)) {
      alert('Please describe what additional information is needed.');
      return;
    }
    // Confirm advanced/downstream overrides to prevent accidents
    const downstream = ['INTERVIEWED', 'INTERVIEW_COMPLETED', 'QUALIFIED', 'DISQUALIFIED',
                        'SELECTED', 'FEE_PENDING', 'FEE_APPROVED', 'ENROLLED'];
    if (downstream.includes(status)) {
      const ok = window.confirm(
        `Director Override: change status to "${status.replace(/_/g, ' ')}"?\n\nThis bypasses the normal workflow. The action will be logged in the timeline and the student will be notified.`
      );
      if (!ok) return;
    }
    // Confirm reopening from terminal state
    if ((fullApp.status === 'REJECTED' || fullApp.status === 'DISQUALIFIED') &&
        status !== 'REJECTED' && status !== 'DISQUALIFIED') {
      const ok = window.confirm(
        `Reopen this previously ${fullApp.status.toLowerCase()} application?\n\nThe rejection/disqualification reason will be cleared and the student will be notified.`
      );
      if (!ok) return;
    }
    onDecision(app.id, status, remarks);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Application #{app.id} — {app.program?.name}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Phase 7: compute Migration Certificate pending flag inline so the
            badge below stays in sync with the latest fetched application data.
            "Pending" only matters once the student has been enrolled. */}
        {(() => null)()}
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={fullApp.status} />
          {fullApp.resultStatus === 'Waiting' && <StatusBadge status="RESULT_AWAITED" />}
          {fullApp.lastAppealStatus === 'PENDING' && <StatusBadge status="APPEAL_SUBMITTED" />}
          {/* Migration Certificate Pending badge \u2014 visible to Admin / Director
              once the student is enrolled but no migration_cert is on file. */}
          {(() => {
            const enrolled = fullApp.status === 'ENROLLED' || fullApp.user?.enrollment?.status === 'ENROLLED';
            if (!enrolled) return null;
            const eduDocs = edus.flatMap((e) => e.documents || []);
            const userDocsAll = fullApp.user?.documents || [];
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

        {profile && (
          <div className="card">
            <div className="card-header">Student Profile</div>
            <div className="form-grid" style={{ gap: '0.4rem' }}>
              {profile.photoPath && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-start' }}>
                  <img src={getFileUrl(profile.photoPath)} alt="Profile" style={{ width: '90px', height: '110px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #e2e8f0' }} />
                </div>
              )}
              <div><strong>Name:</strong> {profile.firstName} {profile.lastName}</div>
              <div><strong>CNIC:</strong> {profile.cnic}</div>
              <div><strong>Father's Name:</strong> {profile.fatherName}</div>
              <div><strong>Father's CNIC:</strong> {profile.fatherCnic || '—'}</div>
              <div><strong>Guardian Phone:</strong> {profile.guardianPhone || '—'}</div>
              <div><strong>WhatsApp:</strong> {profile.whatsappNumber || '—'}</div>
              <div><strong>Nationality:</strong> {profile.nationality || '—'}</div>
              <div><strong>Country of Residence:</strong> {profile.countryOfResidence || '—'}</div>
              <div><strong>DOB:</strong> {profile.dateOfBirth}</div>
              <div><strong>Phone:</strong> {profile.phone}</div>
              <div><strong>Gender:</strong> {profile.gender}</div>
              <div><strong>Blood Group:</strong> {profile.bloodGroup || '—'}</div>
              <div><strong>Religion:</strong> {profile.religion || '—'}</div>
              <div><strong>Marital Status:</strong> {profile.maritalStatus || '—'}</div>
              <div><strong>Occupation:</strong> {profile.occupation || '—'}</div>
              <div><strong>Domicile District:</strong> {profile.domicileDistrict || '—'}</div>
              <div><strong>Domicile Province:</strong> {profile.domicileProvince || '—'}</div>
            </div>

            {/* Structured address */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e2e8f0' }}>
              <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Present Address</div>
              <div style={{ fontSize: '0.88rem', color: '#475569' }}>
                {[profile.presStreet || profile.address, profile.presVillage, profile.presTehsil, profile.presDistrict || profile.district, profile.presPostalCode]
                  .filter(Boolean).join(', ') || '—'}
              </div>
              <div style={{ fontWeight: 600, color: '#1e293b', marginTop: 10, marginBottom: 6 }}>
                Permanent Address {profile.permSameAsPresent && <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 400 }}>(same as present)</span>}
              </div>
              <div style={{ fontSize: '0.88rem', color: '#475569' }}>
                {[profile.permStreet, profile.permVillage, profile.permTehsil, profile.permDistrict, profile.permPostalCode]
                  .filter(Boolean).join(', ') || '—'}
              </div>
            </div>
          </div>
        )}

        {edus.length > 0 && (
          <div className="card">
            <div className="card-header">Education Records</div>
            {edus.map(e => {
              const awaiting = e.resultStatus === 'Waiting';
              const marksLine = awaiting
                ? `Part-I: ${e.partOneMarks ?? '—'}/${e.partOneTotalMarks ?? '—'}`
                : `${e.marks ?? '—'}/${e.totalMarks ?? '—'} (${e.marks && e.totalMarks ? ((e.marks / e.totalMarks) * 100).toFixed(1) : 0}%) — Grade ${e.grade || '—'}`;
              return (
                <div key={e.id} style={{ marginBottom: 10, padding: 10, background: '#f8fafc', borderRadius: 8, borderLeft: `4px solid ${awaiting ? '#f59e0b' : '#10b981'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    <strong>{e.level === '10years' ? 'Matric / SSC' : e.level === '11years' ? 'FSc Part-I' : 'FSc / Intermediate'}</strong>
                    {awaiting
                      ? <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600 }}>Result Awaited</span>
                      : <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600 }}>Completed</span>}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                    {e.degree} {e.major ? `· ${e.major === 'Other' ? e.majorOther : e.major}` : ''} · Board: {e.board || '—'} · Year: {e.passingYear || '—'} · Roll: {e.rollNumber || '—'}
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
            ------------------------------------------------------------
            CRITICAL: Previously this card rendered the raw Document[]
            array, which mixed up multiple categories (photo, CNIC,
            fee receipts, appeal proofs) and showed leftover stale
            duplicates (e.g. an old photo before the latest one). That
            caused "PHOTO preview opens unrelated image", "CNIC opens
            another document", etc.
            We now:
              1. De-duplicate by `type` keeping the MOST RECENT entry only.
              2. Render documents in well-defined groups with explicit
                 human-readable labels so each View button is wired to
                 exactly the file shown.
              3. Skip categories rendered in their own dedicated cards
                 below (application_fee_receipt, appeal_proof) to avoid
                 the SAME file showing up twice with different labels.
            ============================================================ */}
        {(() => {
          // Sort by id DESC so the freshest upload of each type wins.
          const sortedDocs = [...docs].sort((a, b) => b.id - a.id);
          // Keep newest-per-type only.
          const byType = new Map();
          for (const d of sortedDocs) {
            const t = (d.type || '').toLowerCase();
            if (!byType.has(t)) byType.set(t, d);
          }
          // Define the order + label for each group.
          const profileItems = [
            { type: 'photo',           label: 'Student Photograph' },
            { type: 'cnic_front',      label: 'CNIC Front' },
            { type: 'cnic_back',       label: 'CNIC Back' },
            { type: 'father_cnic',     label: 'Father / Guardian CNIC' },
          ].filter(it => byType.has(it.type)).map(it => ({ ...it, doc: byType.get(it.type) }));

          // Anything else that isn't already handled by a dedicated card.
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

        {/* ============================================================
            APPLICATION PROCESSING FEE RECEIPT — dedicated card
            Resolves to: (1) Document table entry of type
            "application_fee_receipt" if present (preferred — has a
            proper id + filename), otherwise (2) the legacy
            Application.feeReceiptPath. Either way, the View button is
            wired to the SAME underlying file.
            ============================================================ */}
        {(() => {
          // Prefer the typed Document row (newest)
          const receiptDoc = docs
            .filter(d => d.type === 'application_fee_receipt' || d.type === 'fee_receipt')
            .sort((a, b) => b.id - a.id)[0];
          const hasReceipt = !!receiptDoc || !!fullApp.feeReceiptPath;
          if (!hasReceipt) return null;

          // Pick a sensible mime for the View modal
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

        {fullApp.interview && (
          <div className="card">
            <div className="card-header">Interview</div>
            <div className="form-grid" style={{ gap: '0.4rem' }}>
              <div><strong>Date:</strong> {fullApp.interview.scheduledDate} at {fullApp.interview.scheduledTime}</div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>Venue:</strong>{' '}
                {meetingUrl
                  ? <a href={meetingUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>{fullApp.interview.venue || meetingUrl} ↗</a>
                  : (fullApp.interview.venue || 'AUST Campus')}
              </div>
              <div><strong>Status:</strong> <StatusBadge status={fullApp.interview.status === 'COMPLETED' ? 'INTERVIEW_COMPLETED' : 'INTERVIEWED'} size="sm" /></div>
              <div><strong>Decision:</strong> {fullApp.interview.decision || 'PENDING'}</div>
              {fullApp.interview.marks !== null && fullApp.interview.marks !== undefined && <div><strong>Marks:</strong> {fullApp.interview.marks}/100</div>}
              {fullApp.interview.remarks && <div style={{ gridColumn: '1 / -1' }}><strong>Coordinator Remarks:</strong> {fullApp.interview.remarks}</div>}
            </div>
          </div>
        )}

        {fullApp.meritEntry && (
          <div className="card">
            <div className="card-header">Merit Score</div>
            <div className="form-grid" style={{ gap: '0.4rem' }}>
              <div><strong>Matric:</strong> {fullApp.meritEntry.matricPercent?.toFixed(2)}%</div>
              <div><strong>FSc:</strong> {fullApp.meritEntry.fscPercent?.toFixed(2)}%</div>
              <div><strong>Interview:</strong> {fullApp.meritEntry.interviewMarks?.toFixed(1)}</div>
              <div><strong>Total Merit:</strong> {fullApp.meritEntry.totalMerit.toFixed(2)}%</div>
              {fullApp.meritEntry.rank && <div><strong>Rank:</strong> #{fullApp.meritEntry.rank}</div>}
            </div>
          </div>
        )}

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
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>Filed: {new Date(a.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}

        {fullApp.rejectionReason && (
          <div className="card" style={{ borderLeft: '4px solid #dc2626' }}>
            <div className="card-header" style={{ color: '#991b1b' }}>Director Rejection Reason (visible to student)</div>
            <div style={{ fontSize: '0.9rem', color: '#475569' }}>{fullApp.rejectionReason}</div>
          </div>
        )}

        {events.length > 0 && (
          <div className="card">
            <div className="card-header">Status Timeline</div>
            <StatusTimeline events={events} />
          </div>
        )}

        {/* Director Actions — FULL OVERRIDE at any stage */}
        <div className="card">
          <div className="card-header">Director Actions (Full Override)</div>
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label>Remarks / Rejection Reason <span className="required" style={{ color: '#dc2626' }}>* required for Reject</span></label>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Required for Reject / Need-Info / overrides. Visible to the student." rows={3} />
            <small style={{ color: '#64748b' }}>
              Director has full authority to override at any stage. For rejections, provide a clear reason (min 5 chars). The student can submit an appeal on this same application.
            </small>
          </div>

          {/* Quick reopen banner if currently rejected/disqualified */}
          {(fullApp.status === 'REJECTED' || fullApp.status === 'DISQUALIFIED') && (
            <div className="alert" style={{ background: '#ecfeff', borderLeft: '3px solid #06b6d4', color: '#155e75', marginBottom: '0.75rem' }}>
              <strong>Re-accept this application?</strong> Reopen will clear the rejection reason and move the application back into the review queue.
            </div>
          )}

          {/* Primary stage actions */}
          <div className="actions-bar" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            <button className="btn btn-sm btn-info" onClick={() => safeDecide('UNDER_REVIEW')}>Under Review</button>
            <button className="btn btn-sm btn-primary" onClick={() => safeDecide('FORWARDED')}>Forward to Coordinator</button>
            <button className="btn btn-sm btn-warning" onClick={() => safeDecide('NEED_INFO')}>Request More Info</button>
            <button className="btn btn-sm" style={{ background: '#fef3c7', color: '#92400e', border: 0 }} onClick={() => safeDecide('RESULT_AWAITED')}>Mark Result Awaited</button>
            <button className="btn btn-sm btn-danger" onClick={() => safeDecide('REJECTED')}>Reject</button>
          </div>

          {/* Override controls — downstream stage overrides */}
          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
              Advanced Overrides (downstream stages)
            </summary>
            <div className="actions-bar" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <button className="btn btn-sm" style={{ background: '#cffafe', color: '#155e75', border: 0 }} onClick={() => safeDecide('INTERVIEWED')}>Set Interview Scheduled</button>
              <button className="btn btn-sm" style={{ background: '#bae6fd', color: '#075985', border: 0 }} onClick={() => safeDecide('INTERVIEW_COMPLETED')}>Mark Interview Completed</button>
              <button className="btn btn-sm btn-success" onClick={() => safeDecide('QUALIFIED')}>Force Qualified</button>
              <button className="btn btn-sm btn-danger" onClick={() => safeDecide('DISQUALIFIED')}>Force Disqualified</button>
              <button className="btn btn-sm btn-success" onClick={() => safeDecide('SELECTED')}>Force Merit Listed</button>
              <button className="btn btn-sm" style={{ background: '#fef3c7', color: '#92400e', border: 0 }} onClick={() => safeDecide('FEE_PENDING')}>Set Fee Pending</button>
              <button className="btn btn-sm" style={{ background: '#a7f3d0', color: '#065f46', border: 0 }} onClick={() => safeDecide('FEE_APPROVED')}>Force Fee Approved</button>
              <button className="btn btn-sm" style={{ background: '#10b981', color: 'white', border: 0 }} onClick={() => safeDecide('ENROLLED')}>Force Enrolled</button>
            </div>
            <small style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              These overrides bypass the normal sequence. Use only when necessary; the previous status is recorded in the timeline.
            </small>
          </details>
        </div>
      </div>
    </div>
  );
};

/* ════════════════ DEPARTMENTS (Master Prompt §2 — READ-ONLY for Director) ════════════════
   Per the Master Prompt, the Director of Admissions can VIEW departments &
   programs but CANNOT add / edit / delete them — that power belongs ONLY to
   the Super Admin (Super Admin Console → Institution → Dept & Program Mgmt).
   This section is therefore a read-only overview including the per-program
   Registration / Roll number configuration and the assigned staff.
================================================================== */
const DepartmentsSection = () => {
  const [departments, setDepartments] = useState([]);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = async () => {
    try {
      const d = await api.get('/departments');
      setDepartments(d.data.departments || []);
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to load departments' });
    }
  };
  useEffect(() => { load(); }, []);

  const staffLabel = (u) => (u ? (u.fullName || u.username || u.email) : '—');

  return (
    <div>
      <h2 className="section-title">Departments &amp; Programs</h2>
      <div className="alert alert-info" style={{ margin: '0 0 1rem' }}>
        <i className="fas fa-circle-info" style={{ marginRight: 6 }}></i>
        View-only. Departments &amp; Programs are created and managed exclusively by the
        <strong> Super Admin</strong>. You can announce cycles, manage applications,
        merit lists, fee approval and enrollment for these programs.
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {departments.length === 0 ? (
        <div className="card"><div className="empty-state">No departments have been created yet.</div></div>
      ) : (
        departments.map((d) => (
          <div className="card" key={d.id} style={{ marginBottom: '1rem' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{d.name}{d.faculty ? ` — ${d.faculty}` : ''}</span>
              <span className={`badge badge-${d.isActive ? 'open' : 'closed'}`}>{d.isActive ? 'Active' : 'Inactive'}</span>
            </div>
            {/* Additional Fixes §2 — Director Admissions sees ONLY the Admissions
                Coordinator. Course Coordinator & Focal Person are LMS-side roles
                and are intentionally NOT shown in the Admissions Portal. */}
            <div style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', color: '#475569', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8 }}>
              <div><strong>Admissions Coordinator:</strong> {staffLabel(d.coordinator)}</div>
            </div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Program</th><th>Short</th><th>Reg# format</th><th>Roll# format</th></tr></thead>
                <tbody>
                  {(d.programs || []).map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td><strong>{p.shortForm || p.code}</strong></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {`${p.instituteCode || '001'}·F26·${p.facultyCode || 'C'}·${p.deptCode || '01'}·${p.programNumericCode || '01'}·serial`}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{`${p.shortForm || p.code || 'XXXX'}-F26-serial`}</td>
                    </tr>
                  ))}
                  {(!d.programs || d.programs.length === 0) && <tr><td colSpan={4}><em>No programs</em></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

/* ════════════════ ANNOUNCE ADMISSIONS CYCLE (Section 5/6) ════════════════
   Single unified form replacing the old "Admission Control" + "Fee Management".
   Session name, dates, multi-select programs, and per-program merit criteria,
   min marks, seats, and fee breakdown line items (auto-totaled).
================================================================== */
// Phase 1 §3 — Director's Admission Cycle screen now renders the SHARED
// AdmissionCyclePanel so it is byte-for-byte identical to the Super Admin's
// screen and operates on the same /api/admission-cycle records.
const AnnounceCycleSection = AdmissionCyclePanel;

/* ════════════════ FEE MANAGEMENT (Fix 3A + 3C) ════════════════
   Director announces the semester / enrollment / tuition fee separately per
   department per program for each active cycle (line items + auto total).
   Plus a Pending Payments sub-section to approve / reject student payments.
================================================================== */
/* =========================================================================
 * §2.2 — FEE MANAGEMENT SMART FILTERS
 * Eleven filters (Semester, Program, Session, Batch, Section, Name, Roll No,
 * Class, CNIC, Phone Number, Email). Select filters draw their options from
 * the server-supplied filterOptions; text filters are live contains-matches.
 * Declared at module scope so React keeps the same component identity across
 * renders (an in-body definition would remount the inputs and steal focus).
 * ======================================================================= */
const FEE_FILTERS = [
  { key: 'semester', label: 'Semester', type: 'select', opt: 'semesters' },
  { key: 'program', label: 'Program', type: 'select', opt: 'programs' },
  { key: 'session', label: 'Session', type: 'select', opt: 'sessions' },
  { key: 'batch', label: 'Batch', type: 'select', opt: 'batches' },
  { key: 'section', label: 'Section', type: 'select', opt: 'sections' },
  { key: 'className', label: 'Class', type: 'select', opt: 'classes' },
  { key: 'studentName', label: 'Name', type: 'text', placeholder: 'Student name…' },
  { key: 'rollNumber', label: 'Roll No', type: 'text', placeholder: 'Roll number…' },
  { key: 'cnic', label: 'CNIC', type: 'text', placeholder: 'CNIC…' },
  { key: 'phone', label: 'Phone Number', type: 'text', placeholder: 'Phone…' },
  { key: 'email', label: 'Email', type: 'text', placeholder: 'Email…' },
];

const emptyFeeFilters = () => FEE_FILTERS.reduce((a, f) => { a[f.key] = ''; return a; }, {});

const feeContains = (value, needle) =>
  String(value || '').toLowerCase().includes(String(needle || '').trim().toLowerCase());

const FeeFilterPanel = ({ values, options, onChange, onReset, activeCount, shown, total }) => (
  <div className="card" style={{ marginBottom: '1rem' }}>
    <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <span><i className="fas fa-sliders-h" style={{ marginRight: 8 }}></i>Smart Filters</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, fontSize: '0.8rem' }}>
        {activeCount > 0 && <span className="badge badge-pending">{activeCount} active</span>}
        <span className="badge badge-open">{shown} / {total}</span>
        <button className="btn btn-sm btn-outline" disabled={activeCount === 0} onClick={onReset}>
          <i className="fas fa-undo" style={{ marginRight: 4 }}></i>Reset
        </button>
      </span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
      {FEE_FILTERS.map((f) => (
        <div key={f.key}>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>{f.label}</label>
          {f.type === 'select' ? (
            <select
              value={values[f.key] || ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.8rem' }}
            >
              <option value="">All</option>
              {(options[f.opt] || []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              value={values[f.key] || ''}
              onChange={(e) => onChange(f.key, e.target.value)}
              placeholder={f.placeholder || f.label}
              style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.8rem' }}
            />
          )}
        </div>
      ))}
    </div>
  </div>
);

const FEE_KIND_LABEL = {
  ADMISSION_FEE: 'Enrollment / Semester Fee',
  PROCESSING_FEE: 'Application Processing Fee',
  LMS_SEMESTER_FEE: 'Semester Fee (LMS Challan)',
  EXAMINATION_FEE: 'Examination Fee',
};

const feeStatusBadge = (s) => {
  const up = String(s || '').toUpperCase();
  if (up === 'APPROVED' || up === 'PAID') return 'badge-open';
  if (up === 'REJECTED') return 'badge-closed';
  if (up === 'WAIVED') return 'badge-info';
  return 'badge-pending';
};

/* §2.2 — the COMPLETE previous fee record for the student behind a payment:
   which student paid which semester's fee, through which platform, plus the
   full historical fee record. Shown while approving / rejecting. */
const FeeHistoryPanel = ({ loading, error, data, onRetry }) => {
  if (loading) {
    return (
      <div style={{ padding: '12px 0', color: '#475569', fontSize: '0.85rem' }}>
        <span className="spinner spinner-sm"></span> Loading the complete previous fee record…
      </div>
    );
  }
  if (error) {
    return (
      <div className="alert alert-error" style={{ marginBottom: 0 }}>
        {error} <button className="btn btn-sm btn-outline" style={{ marginLeft: 8 }} onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (!data) return null;

  const s = data.student || {};
  const sum = data.summary || {};
  const records = data.records || [];

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginTop: 10 }}>
      <div style={{ fontWeight: 700, color: '#1a2744', marginBottom: 10, fontSize: '0.92rem' }}>
        <i className="fas fa-history" style={{ marginRight: 6 }}></i>
        Complete Previous Fee Record — {s.name}
      </div>

      {/* Student identity block */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
        {[
          ['Roll No', s.rollNumber], ['Registration', s.registrationNumber],
          ['Program', s.program], ['Department', s.department],
          ['Session', s.session], ['Batch', s.batch],
          ['Email', s.email], ['Phone', s.phone], ['CNIC', s.cnic],
          ['Enrollment', s.enrollmentStatus],
        ].map(([k, v]) => (
          <div key={k} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b', fontWeight: 700 }}>{k}</div>
            <div style={{ fontSize: '0.78rem', color: '#1a2744', wordBreak: 'break-word' }}>{v || '—'}</div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span className="badge badge-info">{sum.totalRecords || 0} total records</span>
        <span className="badge badge-open">Paid: PKR {Number(sum.totalPaid || 0).toLocaleString()}</span>
        <span className="badge badge-pending">Outstanding: PKR {Number(sum.totalPending || 0).toLocaleString()}</span>
        {sum.rejectedCount > 0 && <span className="badge badge-closed">{sum.rejectedCount} rejected</span>}
        {(sum.platforms || []).length > 0 && (
          <span className="badge badge-info">Platforms: {(sum.platforms || []).join(', ')}</span>
        )}
      </div>

      {/* Full historical fee record */}
      {records.length === 0 ? (
        <div className="alert alert-info" style={{ marginBottom: 0 }}>No previous fee records for this student.</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Fee Type</th><th>Semester</th><th>Program</th>
                <th>Amount</th><th>Platform</th><th>Reference</th>
                <th>Status</th><th>Paid / Submitted</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} style={r.isCurrent ? { background: '#fff7ed' } : undefined}>
                  <td>
                    {FEE_KIND_LABEL[r.kind] || r.kind}
                    {r.isCurrent && <span className="badge badge-pending" style={{ marginLeft: 6 }}>This payment</span>}
                    {r.challanNo && <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#64748b' }}>{r.challanNo}</div>}
                  </td>
                  <td>{r.semester || '—'}</td>
                  <td>
                    {r.program || '—'}
                    {r.section ? <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Sec {r.section}</div> : null}
                    {r.session ? <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{r.session}</div> : null}
                  </td>
                  <td>PKR {Number(r.amount || 0).toLocaleString()}</td>
                  <td>{r.platform || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{r.txnId || '—'}</td>
                  <td><span className={`badge ${feeStatusBadge(r.status)}`}>{r.status}</span></td>
                  <td style={{ fontSize: '0.75rem' }}>
                    {r.paidAt ? new Date(r.paidAt).toLocaleDateString() : (r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—')}
                    {r.dueDate ? <div style={{ color: '#64748b' }}>Due {r.dueDate}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const FeeManagementSection = () => {
  const [overview, setOverview] = useState([]);
  const [pending, setPending] = useState([]);
  const [processed, setProcessed] = useState([]);
  const [procHistoryId, setProcHistoryId] = useState(null);
  const [feeOptions, setFeeOptions] = useState({});
  const [feeFilters, setFeeFilters] = useState(emptyFeeFilters);
  // §2.2 — history state per expanded payment
  const [historyId, setHistoryId] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ type: '', text: '' });
  // Fee editor modal target: { cycleId, departmentId, programId, programName, feeId, lineItems }
  const [editor, setEditor] = useState(null);
  const [savingFee, setSavingFee] = useState(false);
  // Per-payment action state
  const [actionId, setActionId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = async () => {
    try {
      const [o, p, pr] = await Promise.all([
        api.get('/fee-management/overview').catch(() => ({ data: { cycles: [] } })),
        api.get('/fee-management/payments/pending', { params: { _t: Date.now() } })
          .catch(() => ({ data: { payments: [], filterOptions: {} } })),
        // Task 2 — approved/rejected payments so the Director sees the complete fee history after approval
        api.get('/fee-management/payments/processed', { params: { _t: Date.now() } })
          .catch(() => ({ data: { payments: [] } })),
      ]);
      setOverview(o.data.cycles || []);
      setPending(p.data.payments || []);
      setFeeOptions(p.data.filterOptions || {});
      setProcessed(pr.data.payments || []);
    } catch {
      setMsg({ type: 'error', text: 'Failed to load fee management data' });
    } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    // §2.2 — the filters and the pending list stay live (real time).
    const t = setInterval(load, 8000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const onRefresh = () => load();
    window.addEventListener('focus', onRefresh);
    window.addEventListener('aust:refresh', onRefresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('aust:refresh', onRefresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  /* ---- §2.2 — smart filters (all eleven, applied live) ---- */
  const setFeeFilter = (key, value) => setFeeFilters((f) => ({ ...f, [key]: value }));
  const resetFeeFilters = () => setFeeFilters(emptyFeeFilters());
  const feeFilterCount = FEE_FILTERS.filter((f) => String(feeFilters[f.key] || '').trim() !== '').length;

  const filteredPending = useMemo(() => {
    let out = pending;
    const f = feeFilters;
    if (f.semester) out = out.filter((p) => p.semester === f.semester);
    if (f.program) out = out.filter((p) => p.program === f.program);
    if (f.session) out = out.filter((p) => p.session === f.session);
    if (f.batch) out = out.filter((p) => p.batch === f.batch);
    if (f.section) out = out.filter((p) => p.section === f.section);
    if (f.className) out = out.filter((p) => p.className === f.className);
    if (f.studentName) out = out.filter((p) => feeContains(p.studentName, f.studentName));
    if (f.rollNumber) out = out.filter((p) => feeContains(p.rollNumber, f.rollNumber) || feeContains(p.registrationNumber, f.rollNumber));
    if (f.cnic) out = out.filter((p) => feeContains(p.cnic, f.cnic));
    if (f.phone) out = out.filter((p) => feeContains(p.phone, f.phone));
    if (f.email) out = out.filter((p) => feeContains(p.email, f.email) || feeContains(p.studentEmail, f.email));
    return out;
  }, [pending, feeFilters]);

  /* ---- §2.2 — the complete previous fee record for one payment ---- */
  const loadHistory = async (paymentId) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await api.get(`/fee-management/payments/${paymentId}/history`);
      setHistory(res.data);
    } catch (err) {
      setHistory(null);
      setHistoryError(err.response?.data?.error || 'Failed to load the previous fee record');
    } finally { setHistoryLoading(false); }
  };
  const toggleHistory = (paymentId) => {
    if (historyId === paymentId) { setHistoryId(null); setHistory(null); setHistoryError(''); return; }
    setHistoryId(paymentId);
    setHistory(null);
    loadHistory(paymentId);
  };
  // Task 2 — same complete-history panel, toggled from the Approved/Processed table
  const toggleProcHistory = (paymentId) => {
    if (procHistoryId === paymentId) { setProcHistoryId(null); setHistory(null); setHistoryError(''); return; }
    setProcHistoryId(paymentId);
    setHistory(null);
    loadHistory(paymentId);
  };

  const openEditor = (cycleId, departmentId, prog) => {
    setMsg({ type: '', text: '' });
    setEditor({
      cycleId,
      departmentId,
      programId: prog.programId,
      programName: prog.programName,
      feeId: prog.feeId,
      isLocked: prog.isLocked,
      lineItems: (prog.lineItems && prog.lineItems.length)
        ? prog.lineItems.map((li) => ({ label: li.label, amount: li.amount }))
        : [{ label: 'Tuition Fee', amount: '' }],
    });
  };
  const closeEditor = () => { setEditor(null); setSavingFee(false); };

  const setLine = (idx, field, val) => {
    setEditor((prev) => {
      const lines = [...prev.lineItems];
      lines[idx] = { ...lines[idx], [field]: val };
      return { ...prev, lineItems: lines };
    });
  };
  const addLine = () => setEditor((prev) => ({ ...prev, lineItems: [...prev.lineItems, { label: '', amount: '' }] }));
  const removeLine = (idx) => setEditor((prev) => ({ ...prev, lineItems: prev.lineItems.filter((_, i) => i !== idx) }));
  const editorTotal = editor ? editor.lineItems.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0) : 0;

  const saveFee = async () => {
    if (!editor) return;
    const lineItems = editor.lineItems
      .map((li) => ({ label: String(li.label || '').trim(), amount: parseFloat(li.amount) }))
      .filter((li) => li.label);
    if (!lineItems.length) return setMsg({ type: 'error', text: 'Add at least one fee line item with a label' });
    if (lineItems.some((li) => isNaN(li.amount) || li.amount < 0)) {
      return setMsg({ type: 'error', text: 'Every line item needs a valid non-negative amount' });
    }
    setSavingFee(true);
    setMsg({ type: '', text: '' });
    try {
      if (editor.feeId) {
        await api.put(`/fee-management/${editor.feeId}`, { lineItems });
      } else {
        await api.post('/fee-management/', {
          cycleId: editor.cycleId,
          departmentId: editor.departmentId,
          programId: editor.programId,
          lineItems,
        });
      }
      setMsg({ type: 'success', text: `Fee announced for ${editor.programName}` });
      closeEditor();
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save fee' });
    } finally { setSavingFee(false); }
  };

  const approvePayment = async (id) => {
    setActionId(id);
    setMsg({ type: '', text: '' });
    try {
      const res = await api.patch(`/fee-management/payments/${id}/approve`);
      const roll = res.data?.enrollment?.rollNumber;
      setMsg({ type: 'success', text: `Payment approved.${roll ? ` Roll Number: ${roll}` : ''}` });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to approve payment' });
    } finally { setActionId(null); }
  };

  const submitReject = async (id) => {
    if (!rejectReason.trim()) return setMsg({ type: 'error', text: 'A rejection reason is required' });
    setActionId(id);
    setMsg({ type: '', text: '' });
    try {
      await api.patch(`/fee-management/payments/${id}/reject`, { reason: rejectReason.trim() });
      setMsg({ type: 'success', text: 'Payment rejected. The student has been notified and can resubmit.' });
      setRejectingId(null);
      setRejectReason('');
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to reject payment' });
    } finally { setActionId(null); }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      <h2 className="section-title">Fee Management</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* ── §2.2 Smart filters (applied to the pending payments below) ── */}
      <FeeFilterPanel
        values={feeFilters}
        options={feeOptions}
        onChange={setFeeFilter}
        onReset={resetFeeFilters}
        activeCount={feeFilterCount}
        shown={filteredPending.length}
        total={pending.length}
      />

      {/* ── Pending Payments ───────────────────────────────── */}
      <div className="card">
        <div className="card-header">Pending Payments {filteredPending.length > 0 && <span className="badge badge-pending" style={{ marginLeft: 8 }}>{filteredPending.length}</span>}</div>
        {pending.length === 0 ? (
          <div className="alert alert-info" style={{ marginBottom: 0 }}>No payments awaiting approval.</div>
        ) : filteredPending.length === 0 ? (
          <div className="alert alert-info" style={{ marginBottom: 0 }}>
            No payments match the current filters. <button className="btn btn-sm btn-outline" style={{ marginLeft: 8 }} onClick={resetFeeFilters}>Reset filters</button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Student</th><th>Roll #</th><th>Program / Class</th><th>Semester</th><th>Session / Batch</th><th>Amount</th><th>Platform / Ref</th><th>Proof</th><th>Action</th></tr>
              </thead>
              <tbody>
                {filteredPending.map((p) => (
                  <React.Fragment key={p.id}>
                    <tr>
                      <td>
                        {p.studentName}
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.studentEmail}</div>
                        {(p.cnic || p.phone) && (
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            {[p.cnic, p.phone].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td>{p.rollNumber || '—'}</td>
                      <td>
                        {p.program}
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.department}</div>
                        {p.className && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{p.className}</div>}
                      </td>
                      <td>{p.semester || '—'}{p.section ? <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Sec {p.section}</div> : null}</td>
                      <td>{p.session || '—'}{p.batch && p.batch !== p.session ? <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{p.batch}</div> : null}</td>
                      <td>PKR {Number(p.amount || 0).toLocaleString()}</td>
                      <td>{p.paymentMethod}{p.txnId ? <div style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{p.txnId}</div> : null}</td>
                      <td>
                        {p.receiptPath
                          ? <a href={getFileUrl(p.receiptPath)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">View</a>
                          : '—'}
                      </td>
                      <td>
                        {rejectingId === p.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                            <textarea
                              placeholder="Rejection reason (required)"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              rows={2}
                              style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm btn-danger" disabled={actionId === p.id} onClick={() => submitReject(p.id)}>
                                {actionId === p.id ? (<><span className="spinner spinner-sm"></span> …</>) : 'Confirm Reject'}
                              </button>
                              <button className="btn btn-sm btn-secondary" disabled={actionId === p.id} onClick={() => { setRejectingId(null); setRejectReason(''); }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {/* §2.2 — review the complete previous fee record before deciding */}
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => toggleHistory(p.id)}
                              title="Show the complete previous fee record for this student"
                            >
                              <i className={`fas fa-${historyId === p.id ? 'chevron-up' : 'history'}`} style={{ marginRight: 4 }}></i>
                              {historyId === p.id ? 'Hide Record' : 'Fee Record'}
                            </button>
                            <button className="btn btn-sm btn-success" disabled={actionId === p.id} onClick={() => approvePayment(p.id)}>
                              {actionId === p.id ? (<><span className="spinner spinner-sm"></span> …</>) : 'Approve'}
                            </button>
                            <button className="btn btn-sm btn-danger" disabled={actionId === p.id} onClick={() => { setRejectingId(p.id); setRejectReason(''); if (historyId !== p.id) toggleHistory(p.id); }}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {historyId === p.id && (
                      <tr>
                        <td colSpan={9} style={{ background: '#f1f5f9' }}>
                          <FeeHistoryPanel
                            loading={historyLoading}
                            error={historyError}
                            data={history}
                            onRetry={() => loadHistory(p.id)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Task 2 · Approved / Processed Payments ─────────────
           After a Director approves (or rejects) a payment it leaves the
           pending queue. This view keeps the COMPLETE processed fee history
           visible — with amount, processed date and final status — and each
           row can expand the student's full previous fee record. */}
      <div className="card">
        <div className="card-header">
          Approved / Processed Payments
          {processed.length > 0 && <span className="badge badge-open" style={{ marginLeft: 8 }}>{processed.length}</span>}
        </div>
        {processed.length === 0 ? (
          <div className="alert alert-info" style={{ marginBottom: 0 }}>No approved or rejected payments yet. Approved fees will appear here with their complete history.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Student</th><th>Roll #</th><th>Program / Class</th><th>Semester</th><th>Amount</th><th>Platform / Ref</th><th>Status</th><th>Processed</th><th>Proof</th><th>History</th></tr>
              </thead>
              <tbody>
                {processed.map((p) => (
                  <React.Fragment key={`proc-${p.id}`}>
                    <tr>
                      <td>
                        {p.studentName}
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.studentEmail}</div>
                        {(p.cnic || p.phone) && (
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            {[p.cnic, p.phone].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td>{p.rollNumber || '—'}</td>
                      <td>
                        {p.program}
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.department}</div>
                        {p.className && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{p.className}</div>}
                      </td>
                      <td>{p.semester || '—'}{p.section ? <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Sec {p.section}</div> : null}</td>
                      <td>PKR {Number(p.amount || 0).toLocaleString()}</td>
                      <td>{p.paymentMethod}{p.txnId ? <div style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{p.txnId}</div> : null}</td>
                      <td>
                        <span className={`badge ${feeStatusBadge(p.status)}`}>{p.status}</span>
                        {p.status === 'REJECTED' && p.adminRemarks && (
                          <div style={{ fontSize: '0.7rem', color: '#b91c1c', marginTop: 4, maxWidth: 180 }}>{p.adminRemarks}</div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.75rem' }}>
                        {p.processedAt ? new Date(p.processedAt).toLocaleDateString() : '—'}
                        {p.processedAt && <div style={{ color: '#64748b' }}>{new Date(p.processedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
                      </td>
                      <td>
                        {p.receiptPath
                          ? <a href={getFileUrl(p.receiptPath)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline">View</a>
                          : '—'}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => toggleProcHistory(p.id)}
                          title="Show the complete fee history for this student"
                        >
                          <i className={`fas fa-${procHistoryId === p.id ? 'chevron-up' : 'history'}`} style={{ marginRight: 4 }}></i>
                          {procHistoryId === p.id ? 'Hide' : 'History'}
                        </button>
                      </td>
                    </tr>
                    {procHistoryId === p.id && (
                      <tr>
                        <td colSpan={10} style={{ background: '#f1f5f9' }}>
                          <FeeHistoryPanel
                            loading={historyLoading}
                            error={historyError}
                            data={history}
                            onRetry={() => loadHistory(p.id)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Per-program fee announcement ───────────────────── */}
      {overview.length === 0 && (
        <div className="card"><div className="alert alert-info" style={{ marginBottom: 0 }}>No active admission cycles. Announce a cycle with programs first.</div></div>
      )}
      {overview.map((cycle) => (
        <div className="card" key={cycle.cycleId}>
          <div className="card-header">{cycle.cycleTitle} <span style={{ fontWeight: 400, fontSize: '0.8rem', color: '#64748b' }}>({cycle.startDate} — {cycle.endDate})</span></div>
          {cycle.departments.length === 0 ? (
            <div className="alert alert-info" style={{ marginBottom: 0 }}>No departments/programs in this cycle.</div>
          ) : cycle.departments.map((dept) => (
            <div key={dept.id} style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, margin: '8px 0', color: '#1a2744' }}>{dept.name}</div>
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Program</th><th>Status</th><th>Total</th><th>Action</th></tr></thead>
                  <tbody>
                    {dept.programs.map((prog) => (
                      <tr key={prog.programId}>
                        <td><strong>{prog.programName}</strong> <span style={{ color: '#64748b' }}>({prog.programShortForm})</span></td>
                        <td>
                          {prog.announced
                            ? <span className="badge badge-open">Announced</span>
                            : <span className="badge badge-closed">Fee Not Announced</span>}
                          {prog.isLocked && <span className="badge badge-pending" style={{ marginLeft: 6 }}><i className="fas fa-lock" style={{ marginRight: 4 }}></i>Locked</span>}
                        </td>
                        <td>{prog.announced ? `PKR ${Number(prog.totalAmount).toLocaleString()}` : '—'}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={prog.isLocked}
                            title={prog.isLocked ? 'A student has paid — fee is locked' : ''}
                            onClick={() => openEditor(cycle.cycleId, dept.id, prog)}
                          >
                            {prog.announced ? 'Edit Fee' : 'Set Fee'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* ── Fee editor modal ───────────────────────────────── */}
      {editor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={closeEditor}>
          <div className="card" style={{ maxWidth: 560, width: '100%', margin: 0, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header">{editor.feeId ? 'Edit Fee' : 'Set Fee'} — {editor.programName}</div>
            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
              Add the semester / enrollment fee line items below. The total is calculated automatically. Announcing makes it visible to students on the finalized merit list for this program.
            </p>
            {editor.lineItems.map((li, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <input style={{ flex: 2, minWidth: 160, padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db' }} placeholder="Label (e.g. Tuition Fee)" value={li.label} onChange={(e) => setLine(idx, 'label', e.target.value)} />
                <input style={{ flex: 1, minWidth: 100, padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db' }} type="number" placeholder="Amount" value={li.amount} onChange={(e) => setLine(idx, 'amount', e.target.value)} />
                {editor.lineItems.length > 1 && <button type="button" className="btn btn-sm btn-danger" onClick={() => removeLine(idx)}>×</button>}
              </div>
            ))}
            <button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 10 }} onClick={addLine}>+ Add Line Item</button>
            <div style={{ marginTop: 12, fontSize: '1rem' }}>Total: <strong>PKR {editorTotal.toLocaleString()}</strong></div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={savingFee} onClick={saveFee}>
                {savingFee ? (<><span className="spinner spinner-sm"></span> Announcing…</>) : 'Announce Fee'}
              </button>
              <button className="btn btn-secondary" disabled={savingFee} onClick={closeEditor}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AdmissionControlSection = () => {
  const [cycles, setCycles] = useState([]);
  const [form, setForm] = useState({
    title: '', startDate: '', endDate: '', minMarksPercent: 50,
    matricWeight: 30, fscWeight: 40, interviewWeight: 30,
    applicationFee: 1200, bankAccountTitle: '',
    bankAccountNumber: '', bankName: '',
  });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);

  const loadCycles = async () => {
    try { const res = await api.get('/admission-cycle'); setCycles(res.data.cycles || []); } catch {}
  };
  useEffect(() => { loadCycles(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Merit weightage is per-program now (Additional Fixes §3) — no cycle-level check.
    setSaving(true); setMsg({ type: '', text: '' });
    try {
      if (editing) {
        await api.put(`/admission-cycle/${editing}`, form);
        setMsg({ type: 'success', text: 'Cycle updated' });
      } else {
        await api.post('/admission-cycle', form);
        setMsg({ type: 'success', text: 'New admission cycle created' });
      }
      setShowForm(false); setEditing(null); loadCycles();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
    finally { setSaving(false); }
  };

  const toggleCycle = async (id) => {
    try { await api.put(`/admission-cycle/${id}/toggle`); loadCycles(); } catch {}
  };

  const editCycle = (c) => {
    setForm({
      title: c.title, startDate: c.startDate, endDate: c.endDate,
      minMarksPercent: c.minMarksPercent, matricWeight: c.matricWeight,
      fscWeight: c.fscWeight, interviewWeight: c.interviewWeight,
      applicationFee: c.applicationFee, bankAccountTitle: c.bankAccountTitle,
      bankAccountNumber: c.bankAccountNumber, bankName: c.bankName,
    });
    setEditing(c.id); setShowForm(true);
  };

  return (
    <div>
      <h2 className="section-title">Admission Control</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {cycles.length > 0 && (
        <div className="card">
          <div className="card-header">Admission Cycles</div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Title</th><th>Period</th><th>Status</th><th>Min %</th><th>Fee</th><th>Weights (M/F/I)</th><th>Actions</th></tr></thead>
              <tbody>
                {cycles.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.title}</strong></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.startDate} — {c.endDate}</td>
                    <td><span className={`badge badge-${c.isOpen ? 'open' : 'closed'}`}>{c.isOpen ? 'Open' : 'Closed'}</span></td>
                    <td>{c.minMarksPercent}%</td>
                    <td>PKR {c.applicationFee}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.matricWeight}/{c.fscWeight}/{c.interviewWeight}</td>
                    <td>
                      <div className="actions-bar">
                        <button className="btn btn-sm btn-outline" onClick={() => editCycle(c)}>Edit</button>
                        <button className={`btn btn-sm ${c.isOpen ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleCycle(c.id)}>
                          {c.isOpen ? 'Close' : 'Open'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!showForm ? (
        <button className="btn btn-primary" onClick={() => { setForm({ title: '', startDate: '', endDate: '', minMarksPercent: 50, matricWeight: 30, fscWeight: 40, interviewWeight: 30, applicationFee: 1200, bankAccountTitle: '', bankAccountNumber: '', bankName: '' }); setEditing(null); setShowForm(true); }}>
          + New Admission Cycle
        </button>
      ) : (
        <div className="card">
          <div className="card-header">{editing ? 'Edit' : 'Create'} Admission Cycle</div>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group full-width"><label>Title <span className="required">*</span></label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required /></div>
              <div className="form-group"><label>Start Date <span className="required">*</span></label><input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required /></div>
              <div className="form-group"><label>End Date <span className="required">*</span></label><input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} required /></div>
              <div className="form-group"><label>Min Marks %</label><input type="number" value={form.minMarksPercent} onChange={e => setForm({ ...form, minMarksPercent: e.target.value })} /></div>
              <div className="form-group"><label>Application Processing Fee (PKR)</label><input type="number" value={form.applicationFee} onChange={e => setForm({ ...form, applicationFee: e.target.value })} /></div>
              <div className="form-group full-width" style={{ padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.85rem', color: '#1e40af' }}>
                <i className="fas fa-circle-info" style={{ marginRight: 6 }} />
                Merit weightage (Matric / FSc / Interview) is configured <strong>per Program</strong> by the Super Admin — including Interview = 0%.
              </div>
              <div className="form-group"><label>Bank Name</label><input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} /></div>
              <div className="form-group"><label>Account Title</label><input value={form.bankAccountTitle} onChange={e => setForm({ ...form, bankAccountTitle: e.target.value })} /></div>
              <div className="form-group full-width"><label>Account Number</label><input value={form.bankAccountNumber} onChange={e => setForm({ ...form, bankAccountNumber: e.target.value })} /></div>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

/* ════════════════ INITIAL MERIT LIST (Master Prompt §5) ════════════════
   PRE-interview list. The Director forwards applications to the Admissions
   Coordinator, who marks each ELIGIBLE / NOT_ELIGIBLE for interview. Only
   interview-selected applicants appear here ("Selected for Interview").
   This Director view is READ-ONLY oversight — the eligibility marking is done
   by the Coordinator. Separate from the (post-interview) Final Merit List.
================================================================== */
const InitialMeritListSection = () => {
  const [data, setData] = useState({ selected: [], notEligible: [], pending: [] });
  const [title, setTitle] = useState('Initial Merit List – Selected for Interview');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/merit/initial');
      setTitle(res.data.title || title);
      setData({
        selected: res.data.selected || [],
        notEligible: res.data.notEligible || [],
        pending: res.data.pending || [],
      });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to load initial merit list' });
    } finally { setLoading(false); }
  };
  // §2.1 Real-time: the Director's Initial Merit List (incl. the Not Eligible
  // group) must reflect Coordinator eligibility decisions immediately — poll +
  // refresh on focus / global aust:refresh so no manual reload is required.
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

  const nameOf = (a) => `${a.user?.profile?.firstName || ''} ${a.user?.profile?.lastName || ''}`.trim() || a.user?.email || '—';

  const Table = ({ rows, emptyText }) => (
    <div className="table-wrapper">
      <table>
        <thead><tr><th>#</th><th>Applicant</th><th>Program</th><th>CNIC</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((a, i) => (
            <tr key={a.id}>
              <td>{i + 1}</td>
              <td><strong>{nameOf(a)}</strong><br /><span style={{ fontSize: '0.78rem', color: '#64748b' }}>{a.user?.email}</span></td>
              <td>{a.program?.name}{a.program?.department ? <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{a.program.department.name}</div> : null}</td>
              <td style={{ fontSize: '0.82rem' }}>{a.user?.profile?.cnic || '-'}</td>
              <td><span className={`badge badge-${a.status?.toLowerCase()}`}>{a.status}</span></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>{emptyText}</td></tr>}
        </tbody>
      </table>
    </div>
  );

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      <h2 className="section-title">{title}</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="alert alert-info">
        <i className="fas fa-circle-info" style={{ marginRight: 6 }}></i>
        Before interviews, forwarded applications are reviewed by the <strong>Admissions Coordinator</strong>,
        who marks each applicant <strong>Eligible</strong> or <strong>Not Eligible for Interview</strong>.
        Only interview-selected applicants appear on this Initial Merit List. (Read-only oversight for the Director.)
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><i className="fas fa-check-circle" style={{ color: '#047857', marginRight: 6 }}></i>Selected for Interview <span className="pill ready" style={{ marginLeft: 8 }}>{data.selected.length}</span></div>
        <Table rows={data.selected} emptyText="No applicants selected for interview yet." />
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><i className="fas fa-hourglass-half" style={{ color: '#c2410c', marginRight: 6 }}></i>Pending Coordinator Review <span className="pill warn" style={{ marginLeft: 8 }}>{data.pending.length}</span></div>
        <Table rows={data.pending} emptyText="Nothing pending review." />
      </div>

      <div className="card">
        <div className="card-header"><i className="fas fa-times-circle" style={{ color: '#b91c1c', marginRight: 6 }}></i>Not Eligible for Interview <span className="pill" style={{ marginLeft: 8, background: '#fee2e2', color: '#b91c1c' }}>{data.notEligible.length}</span></div>
        <Table rows={data.notEligible} emptyText="No applicants marked not-eligible." />
      </div>
    </div>
  );
};

/* ════════════════ FINAL MERIT LIST (Director Full-Control) ════════════════
   Director can: edit scores, add students, remove students, change ranks,
   finalize, and re-open the list — provided no student is already enrolled.
   The Coordinator workflow is preserved (read-only view of finalized list).
================================================================== */
const MeritListSection = () => {
  const [entries, setEntries] = useState([]);
  const [eligibleApps, setEligibleApps] = useState([]);
  const [lockStatus, setLockStatus] = useState({ enrollmentLocked: false, anyFinalized: false, allFinalized: false });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // entry being edited
  const [editForm, setEditForm] = useState({ matricPercent: '', fscPercent: '', interviewMarks: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ applicationId: '', matricPercent: '', fscPercent: '', interviewMarks: '' });

  const loadAll = async () => {
    try {
      const [meritRes, lockRes, eligRes] = await Promise.all([
        api.get('/merit'),
        api.get('/merit/lock-status').catch(() => ({ data: {} })),
        api.get('/merit/eligible-applications').catch(() => ({ data: { applications: [] } })),
      ]);
      setEntries(meritRes.data.meritList || []);
      setLockStatus(lockRes.data || {});
      setEligibleApps(eligRes.data.applications || []);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 15000); // keep merit data live
    return () => clearInterval(t);
  }, []);

  const handleFinalize = async () => {
    if (!window.confirm('Finalize the merit list?\n\n• Non-enrolled, eligible students move to FEE_PENDING and can pay\n• Already-enrolled students keep their existing rank and lock\n• You can still EDIT individual non-enrolled students after finalization\n• Use REOPEN to roll non-enrolled students back to SELECTED if needed')) return;
    try {
      const res = await api.post('/merit/finalize');
      setMsg({ type: 'success', text: res.data.message });
      loadAll();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };

  const handleReopen = async () => {
    if (!window.confirm('Reopen the merit list for editing?\n\n• Non-enrolled FEE_PENDING applications roll back to SELECTED\n• Already-enrolled students (FEE_APPROVED / ENROLLED) are NOT affected\n• You will need to re-finalize the non-enrolled portion when done')) return;
    try {
      const res = await api.post('/merit/reopen');
      setMsg({ type: 'success', text: res.data.message });
      loadAll();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };

  const beginEdit = (entry) => {
    setEditing(entry.id);
    setEditForm({
      matricPercent: entry.matricPercent ?? '',
      fscPercent: entry.fscPercent ?? '',
      interviewMarks: entry.interviewMarks ?? '',
    });
  };

  const saveEdit = async (id) => {
    try {
      await api.put(`/merit/${id}`, {
        matricPercent: parseFloat(editForm.matricPercent),
        fscPercent: parseFloat(editForm.fscPercent),
        interviewMarks: parseFloat(editForm.interviewMarks),
      });
      setMsg({ type: 'success', text: 'Merit entry updated' });
      setEditing(null);
      loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update' });
    }
  };

  const handleRemove = async (entry) => {
    if (!window.confirm(`Remove ${entry.user?.profile?.firstName || 'this student'} from the merit list?`)) return;
    try {
      await api.delete(`/merit/${entry.id}`);
      setMsg({ type: 'success', text: 'Student removed from merit list' });
      loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to remove' });
    }
  };

  const handleRankChange = async (entry, newRank) => {
    const r = parseInt(newRank);
    if (!r || r < 1) return;
    try {
      await api.put(`/merit/${entry.id}/rank`, { rank: r });
      setMsg({ type: 'success', text: `Rank set to #${r}` });
      loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to set rank' });
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.applicationId) return setMsg({ type: 'error', text: 'Select an application' });
    try {
      await api.post('/merit/add', {
        applicationId: parseInt(addForm.applicationId),
        matricPercent: parseFloat(addForm.matricPercent || 0),
        fscPercent: parseFloat(addForm.fscPercent || 0),
        interviewMarks: parseFloat(addForm.interviewMarks || 0),
      });
      setMsg({ type: 'success', text: 'Student added to merit list' });
      setShowAdd(false);
      setAddForm({ applicationId: '', matricPercent: '', fscPercent: '', interviewMarks: '' });
      loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to add' });
    }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  // Per-student lock: a row is locked only if THAT specific student has
  // reached FEE_APPROVED / ENROLLED. Other rows remain editable.
  const ENROLLED_STATUSES = ['FEE_APPROVED', 'ENROLLED'];
  const isRowLocked = (e) => e?.enrollmentLocked === true
    || ENROLLED_STATUSES.includes(e?.applicationStatus)
    || ENROLLED_STATUSES.includes(e?.application?.status);

  const editableEntries = entries.filter(e => !isRowLocked(e));
  const lockedEntries   = entries.filter(e =>  isRowLocked(e));
  const hasUnfinalized = editableEntries.some(e => !e.isFinalized);
  const allFinalized = editableEntries.length > 0 && editableEntries.every(e => e.isFinalized);
  // Director can ALWAYS perform global actions (Add / Finalize / Reopen) —
  // those operations only touch non-enrolled students under the new policy.
  const canEdit = true;
  const lockedCount = lockedEntries.length;

  // ── Section 7: group merit entries by Department → Program ──
  const groupKey = (e) => e.application?.program?.id ?? 'unknown';
  const programGroups = {};
  entries.forEach((e) => {
    const k = groupKey(e);
    if (!programGroups[k]) {
      const prog = e.application?.program || {};
      programGroups[k] = {
        programId: e.application?.programId ?? prog.id ?? null,
        programName: prog.name || 'Unassigned Program',
        shortForm: prog.shortForm || prog.code || '',
        departmentName: prog.department?.name || 'Unassigned Department',
        sessionName: e.application?.admissionCycle?.title || '',
        entries: [],
      };
    }
    programGroups[k].entries.push(e);
  });
  const groupList = Object.values(programGroups).sort((a, b) =>
    (a.departmentName || '').localeCompare(b.departmentName || '') ||
    (a.programName || '').localeCompare(b.programName || ''));

  // Per-program finalize / reopen — each program's list is independent.
  const finalizeProgram = async (g) => {
    if (!window.confirm(`Finalize the merit list for ${g.programName}?\n\nOnly this program's non-enrolled, eligible students are affected.`)) return;
    try {
      const res = await api.post('/merit/finalize', { programId: g.programId });
      setMsg({ type: 'success', text: res.data.message });
      loadAll();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };
  const reopenProgram = async (g) => {
    if (!window.confirm(`Reopen the merit list for ${g.programName}?\n\nOnly this program's non-enrolled FEE_PENDING students roll back to SELECTED.`)) return;
    try {
      const res = await api.post('/merit/reopen', { programId: g.programId });
      setMsg({ type: 'success', text: res.data.message });
      loadAll();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };
  const downloadProgramMerit = async (g) => {
    try {
      await downloadMeritListPdf(g.entries, {
        programName: g.programName,
        cycleTitle: g.sessionName,
        shortForm: g.shortForm,
        sessionName: g.sessionName,
      });
    } catch (err) {
      console.error(err);
      setMsg({ type: 'error', text: `Failed to generate merit list PDF for ${g.programName}` });
    }
  };
  // All-at-once: download every program's merit list as separate
  // MeritList_<ShortForm>_<Session>.pdf files (sequentially).
  const downloadAllMerit = async () => {
    if (groupList.length === 0) return;
    setMsg({ type: 'info', text: `Generating ${groupList.length} merit list PDF(s)…` });
    for (const g of groupList) {
      // eslint-disable-next-line no-await-in-loop
      await downloadProgramMerit(g);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 600)); // stagger browser downloads
    }
    setMsg({ type: 'success', text: `Downloaded ${groupList.length} merit list PDF(s).` });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>Merit List</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {entries.length > 0 && (
            <button
              className="btn btn-outline"
              onClick={downloadAllMerit}
              title="Download a separate MeritList_<ShortForm>_<Session>.pdf for every program"
            >
              <i className="fas fa-file-pdf"></i> Download All Merit Lists
            </button>
          )}
          {canEdit && (
            <button className="btn btn-secondary" onClick={() => setShowAdd(s => !s)}>
              <i className="fas fa-user-plus"></i> {showAdd ? 'Cancel' : 'Add Student'}
            </button>
          )}
          {entries.length > 0 && hasUnfinalized && canEdit && (
            <button className="btn btn-primary" onClick={handleFinalize}>
              <i className="fas fa-lock"></i> Finalize Merit List
            </button>
          )}
          {allFinalized && canEdit && (
            <button className="btn btn-warning" onClick={handleReopen}>
              <i className="fas fa-lock-open"></i> Reopen for Edits
            </button>
          )}
        </div>
      </div>

      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {lockedCount > 0 && (
        <div className="alert alert-info">
          <strong><i className="fas fa-shield-halved"></i> Per-student lock active.</strong>{' '}
          {lockedCount} student{lockedCount === 1 ? '' : 's'} {lockedCount === 1 ? 'has' : 'have'} completed enrollment — only those individual rows are locked.
          You retain full control over every other student in the list.
        </div>
      )}
      {allFinalized && (
        <div className="alert alert-success">
          Merit list is finalized for all non-enrolled students. Students with eligible scores have been notified and can pay the admission fee. You may still edit any non-enrolled student or re-open the list for revision.
        </div>
      )}

      {/* Add-Student form */}
      {showAdd && canEdit && (
        <div className="card">
          <div className="card-header"><i className="fas fa-user-plus"></i> Add Student to Merit List</div>
          <form onSubmit={handleAdd}>
            <div className="form-grid">
              <div className="form-group">
                <label>Application <span className="required">*</span></label>
                <select
                  value={addForm.applicationId}
                  onChange={e => setAddForm({ ...addForm, applicationId: e.target.value })}
                  required
                >
                  <option value="">— Select an eligible application —</option>
                  {eligibleApps.map(a => (
                    <option key={a.id} value={a.id}>
                      #{a.id} · {a.user?.profile?.firstName || ''} {a.user?.profile?.lastName || ''} · {a.program?.name} · {a.status}
                    </option>
                  ))}
                </select>
                {eligibleApps.length === 0 && (
                  <small style={{ color: '#94a3b8' }}>No eligible applications without merit entries.</small>
                )}
              </div>
              <div className="form-group">
                <label>Matric %</label>
                <input type="number" step="0.01" min="0" max="100" value={addForm.matricPercent}
                       onChange={e => setAddForm({ ...addForm, matricPercent: e.target.value })} />
              </div>
              <div className="form-group">
                <label>FSc %</label>
                <input type="number" step="0.01" min="0" max="100" value={addForm.fscPercent}
                       onChange={e => setAddForm({ ...addForm, fscPercent: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Interview Marks</label>
                <input type="number" step="0.01" min="0" max="100" value={addForm.interviewMarks}
                       onChange={e => setAddForm({ ...addForm, interviewMarks: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <button type="submit" className="btn btn-primary"><i className="fas fa-check"></i> Add to Merit</button>
            </div>
          </form>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-icon">🏆</div><p style={{ fontWeight: 600, color: '#1a2744' }}>No merit entries yet.</p><p style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '0.4rem' }}>Merit scores are calculated by the Coordinator after interviews, or you can add candidates manually.</p></div></div>
      ) : (
        groupList.map((g) => {
          const groupEditable = g.entries.filter(e => !isRowLocked(e));
          const groupHasUnfinalized = groupEditable.some(e => !e.isFinalized);
          const groupAllFinalized = groupEditable.length > 0 && groupEditable.every(e => e.isFinalized);
          return (
            <section className="card" style={{ padding: 0, marginBottom: '1.5rem' }} key={g.programId ?? g.programName}>
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>{g.departmentName}</span>
                  <div style={{ fontWeight: 700, color: '#1a2744' }}>
                    {g.programName}{g.shortForm ? ` (${g.shortForm})` : ''}
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 8 }}>{g.entries.length} candidate{g.entries.length === 1 ? '' : 's'}{g.sessionName ? ` · ${g.sessionName}` : ''}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm btn-outline" onClick={() => downloadProgramMerit(g)} title={`Download MeritList_${g.shortForm || 'Program'}_${g.sessionName || 'Session'}.pdf`}>
                    <i className="fas fa-file-pdf"></i> PDF
                  </button>
                  {g.programId && groupHasUnfinalized && (
                    <button className="btn btn-sm btn-primary" onClick={() => finalizeProgram(g)} title="Finalize this program's merit list">
                      <i className="fas fa-lock"></i> Finalize
                    </button>
                  )}
                  {g.programId && groupAllFinalized && (
                    <button className="btn btn-sm btn-warning" onClick={() => reopenProgram(g)} title="Reopen this program's merit list">
                      <i className="fas fa-lock-open"></i> Reopen
                    </button>
                  )}
                </div>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Student</th>
                      <th>Matric %</th>
                      <th>FSc %</th>
                      <th>Interview</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.entries.map((e, i) => {
                      const isEditing = editing === e.id;
                      const rowLocked = isRowLocked(e);
                      return (
                        <tr key={e.id} style={rowLocked ? { background: '#fafafa' } : undefined}>
                          <td>
                            {!rowLocked ? (
                              <input
                                type="number"
                                min="1"
                                defaultValue={e.rank || i + 1}
                                onBlur={(ev) => {
                                  const val = parseInt(ev.target.value);
                                  if (val && val !== (e.rank || i + 1)) handleRankChange(e, val);
                                }}
                                style={{ width: 50, textAlign: 'center' }}
                                title="Type a new rank and press Tab"
                              />
                            ) : (
                              <span
                                className="merit-rank"
                                style={{ width: '30px', height: '30px', fontSize: '0.85rem' }}
                                title="Locked — student has completed enrollment"
                              >
                                {e.rank || i + 1}
                              </span>
                            )}
                          </td>
                          <td>
                            <strong>{e.user?.profile?.firstName} {e.user?.profile?.lastName}</strong>
                            {rowLocked && (
                              <span
                                style={{
                                  marginLeft: 6, fontSize: '0.68rem', fontWeight: 700,
                                  background: '#fef3c7', color: '#92400e',
                                  padding: '1px 6px', borderRadius: 10, verticalAlign: 'middle',
                                }}
                                title="Enrollment completed — this row is locked"
                              >
                                <i className="fas fa-lock" style={{ marginRight: 3 }}></i>ENROLLED
                              </span>
                            )}
                            <br />
                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{e.user?.email}</span>
                          </td>
                          <td>
                            {isEditing && !rowLocked ? (
                              <input type="number" step="0.01" min="0" max="100" value={editForm.matricPercent}
                                     onChange={ev => setEditForm({ ...editForm, matricPercent: ev.target.value })}
                                     style={{ width: 70 }} />
                            ) : `${e.matricPercent.toFixed(1)}%`}
                          </td>
                          <td>
                            {isEditing && !rowLocked ? (
                              <input type="number" step="0.01" min="0" max="100" value={editForm.fscPercent}
                                     onChange={ev => setEditForm({ ...editForm, fscPercent: ev.target.value })}
                                     style={{ width: 70 }} />
                            ) : `${e.fscPercent.toFixed(1)}%`}
                          </td>
                          <td>
                            {isEditing && !rowLocked ? (
                              <input type="number" step="0.01" min="0" max="100" value={editForm.interviewMarks}
                                     onChange={ev => setEditForm({ ...editForm, interviewMarks: ev.target.value })}
                                     style={{ width: 70 }} />
                            ) : e.interviewMarks.toFixed(1)}
                          </td>
                          <td><strong>{e.totalMerit.toFixed(2)}%</strong></td>
                          <td><span className={`badge badge-${e.isFinalized ? 'selected' : 'pending'}`}>{e.isFinalized ? 'Locked' : 'Draft'}</span></td>
                          <td>
                            {rowLocked ? (
                              <span style={{ color: '#94a3b8', fontSize: '0.78rem' }} title="Editing disabled — student has completed enrollment">
                                <i className="fas fa-lock"></i> Locked
                              </span>
                            ) : isEditing ? (
                              <div className="actions-bar">
                                <button className="btn btn-sm btn-success" onClick={() => saveEdit(e.id)}><i className="fas fa-check"></i></button>
                                <button className="btn btn-sm btn-secondary" onClick={() => setEditing(null)}><i className="fas fa-xmark"></i></button>
                              </div>
                            ) : (
                              <div className="actions-bar">
                                <button className="btn btn-sm btn-secondary" onClick={() => beginEdit(e)} title="Edit scores"><i className="fas fa-pen"></i></button>
                                <button className="btn btn-sm btn-danger" onClick={() => handleRemove(e)} title="Remove from merit"><i className="fas fa-trash"></i></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
};

/* ════════════════ LEGACY FEE ANNOUNCEMENT (orphaned/unreferenced) ════════════════ */
// NOTE: This component is legacy dead code — it is not wired to any sidebar tab or
// route (the active Fee Management UI is the FeeManagementSection above, Fix 3A/3C).
// Renamed to avoid a duplicate-declaration collision; its behaviour is unchanged.
const LegacyFeeAnnouncementSection = () => {
  const [payments, setPayments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [announcement, setAnnouncement] = useState({ feeAmount: '', deadline: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);

  const loadPayments = async () => {
    try { const res = await api.get('/fee/all-payments', { params: { status: filter } }); setPayments(res.data.payments || []); } catch {} finally { setLoading(false); }
  };
  useEffect(() => { loadPayments(); }, [filter]);
  useEffect(() => {
    api.get('/fee/announcement').then(r => {
      if (r.data.announcement) {
        // Only carry amount and deadline — bank fields are intentionally ignored here
        setAnnouncement({
          feeAmount: r.data.announcement.feeAmount || '',
          deadline: r.data.announcement.deadline || '',
        });
      }
    }).catch(() => {});
  }, []);

  const handleAnnounce = async (e) => {
    e.preventDefault();
    try {
      // Backend retains compatible defaults for legacy bank fields; we send only amount + deadline
      await api.post('/fee/announce', {
        feeAmount: announcement.feeAmount,
        deadline: announcement.deadline,
      });
      setMsg({ type: 'success', text: 'Fee announced — students with finalized merit have been notified' });
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };

  const handleReview = async (paymentId, status, remarks) => {
    try {
      await api.put(`/fee/review/${paymentId}`, { status, remarks });
      setMsg({ type: 'success', text: `Fee payment ${status === 'APPROVED' ? 'confirmed' : status.toLowerCase().replace('_', ' ')}` });
      loadPayments();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };

  return (
    <div>
      <h2 className="section-title">Fee Management</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="alert alert-info" style={{ background: '#eff6ff', borderLeft: '3px solid #3b82f6', color: '#1e3a8a' }}>
        <i className="fas fa-info-circle" style={{ marginRight: 6 }}></i>
        Bank account details are now managed centrally under <strong>Payment Methods</strong>. Use the Payment Methods tab to add or update NBP / Bank of Khyber accounts shown to students.
      </div>

      <div className="card">
        <div className="card-header">Announce / Update Fee</div>
        <form onSubmit={handleAnnounce}>
          <div className="form-grid">
            <div className="form-group"><label>Fee Amount (PKR) <span className="required">*</span></label><input type="number" value={announcement.feeAmount} onChange={e => setAnnouncement({ ...announcement, feeAmount: e.target.value })} required /></div>
            <div className="form-group"><label>Deadline <span className="required">*</span></label><input type="date" value={announcement.deadline} onChange={e => setAnnouncement({ ...announcement, deadline: e.target.value })} required /></div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>Announce Fee</button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">Fee Payments</div>
        <div className="filter-bar">
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="NEEDS_INFO">Needs Info</option>
          </select>
        </div>
        {loading ? <div className="loading"><span className="spinner"></span></div> : (
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Student</th><th>Program</th><th>Amount</th><th>Status</th><th>Receipt</th><th>Actions</th></tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.user?.profile?.firstName} {p.user?.profile?.lastName}</strong><br />
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{p.user?.email}</span>
                    </td>
                    <td>{p.application?.program?.name}</td>
                    <td>PKR {p.amount}</td>
                    <td><span className={`badge badge-${p.status.toLowerCase()}`}>{p.status.replace('_', ' ')}</span></td>
                    <td>
                      {p.receiptPath ? (
                        <DocumentPreviewLink
                          filePath={p.receiptPath}
                          fileName={`fee-receipt-${p.id}${p.receiptPath.match(/\.[a-z0-9]+$/i)?.[0] || ''}`}
                          mimeType={(/\.(jpe?g|jfif|jpe|png|gif|webp|bmp|svg|tiff?|heic|heif)$/i).test(p.receiptPath) ? 'image/jpeg' : (/\.pdf$/i).test(p.receiptPath) ? 'application/pdf' : ''}
                          compact
                        />
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>No receipt</span>
                      )}
                    </td>
                    <td>
                      {p.status === 'PENDING' && (
                        <div className="actions-bar">
                          <button className="btn btn-sm btn-success" onClick={() => handleReview(p.id, 'APPROVED', '')}>Confirm</button>
                          <button className="btn btn-sm btn-danger" onClick={() => { const r = prompt('Rejection reason:'); if (r !== null) handleReview(p.id, 'REJECTED', r); }}>Reject</button>
                        </div>
                      )}
                      {p.status === 'APPROVED' && <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.82rem' }}>Confirmed</span>}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No payments found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

/* ════════════════ PAYMENT METHODS — Bank Transfer / Bank Payment Gateway / 1Bill / Bank Accounts ════════════════ */
const PaymentMethodsSection = () => {
  const [config, setConfig] = useState(null);
  const [banks, setBanks] = useState([]);
  const [cycle, setCycle] = useState(null);
  // (Master Prompt §5) EasyPaisa removed — online payments go through the generic Bank Payment Gateway.
  const [allowedMethods, setAllowedMethods] = useState({ BANK_TRANSFER: true, BANK_GATEWAY: true, ONEBILL_VOUCHER: true });
  const [bankForm, setBankForm] = useState({ bankName: '', accountTitle: '', iban: '', branchCode: '', isActive: true, sortOrder: 0 });
  const [editingBank, setEditingBank] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cfgRes, cycleRes] = await Promise.all([
        api.get('/payment-methods/admin'),
        api.get('/admission-cycle/active').catch(() => ({ data: { cycle: null } })),
      ]);
      setConfig(cfgRes.data.config);
      setBanks(cfgRes.data.bankAccounts || []);
      setCycle(cycleRes.data.cycle || null);
      if (cycleRes.data.cycle?.allowedPaymentMethods) {
        const list = cycleRes.data.cycle.allowedPaymentMethods.split(',').map(s => s.trim());
        setAllowedMethods({
          BANK_TRANSFER: list.includes('BANK_TRANSFER'),
          // Treat legacy EASYPAISA entry as BANK_GATEWAY
          BANK_GATEWAY: list.includes('BANK_GATEWAY') || list.includes('EASYPAISA'),
          ONEBILL_VOUCHER: list.includes('ONEBILL_VOUCHER'),
        });
      }
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to load payment configuration' });
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const handleConfigChange = (field, value) => setConfig(prev => ({ ...prev, [field]: value }));

  const saveConfig = async () => {
    setSaving(true); setMsg({ type: '', text: '' });
    try {
      await api.put('/payment-methods/admin', config);
      setMsg({ type: 'success', text: 'Payment methods configuration saved' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save configuration' });
    } finally { setSaving(false); }
  };

  const saveAllowedForCycle = async () => {
    if (!cycle) return setMsg({ type: 'error', text: 'No active admission cycle to update' });
    const list = Object.entries(allowedMethods).filter(([_, v]) => v).map(([k]) => k).join(',');
    setSaving(true); setMsg({ type: '', text: '' });
    try {
      await api.put(`/admission-cycle/${cycle.id}`, { allowedPaymentMethods: list });
      setMsg({ type: 'success', text: 'Cycle payment methods updated' });
      loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update cycle' });
    } finally { setSaving(false); }
  };

  const submitBank = async (e) => {
    e.preventDefault();
    if (!bankForm.bankName || !bankForm.accountTitle || !bankForm.iban) {
      return setMsg({ type: 'error', text: 'Bank name, account title, and IBAN are required' });
    }
    setSaving(true); setMsg({ type: '', text: '' });
    try {
      if (editingBank) {
        await api.put(`/payment-methods/bank-accounts/${editingBank}`, bankForm);
        setMsg({ type: 'success', text: 'Bank account updated' });
      } else {
        await api.post('/payment-methods/bank-accounts', bankForm);
        setMsg({ type: 'success', text: 'Bank account added' });
      }
      setBankForm({ bankName: '', accountTitle: '', iban: '', branchCode: '', isActive: true, sortOrder: 0 });
      setEditingBank(null);
      loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save bank account' });
    } finally { setSaving(false); }
  };

  const editBank = (b) => {
    setEditingBank(b.id);
    setBankForm({ bankName: b.bankName, accountTitle: b.accountTitle, iban: b.iban, branchCode: b.branchCode || '', isActive: b.isActive, sortOrder: b.sortOrder });
  };

  const deleteBank = async (id) => {
    if (!window.confirm('Delete this bank account? Students will no longer see it for new fee deposits.')) return;
    try {
      await api.delete(`/payment-methods/bank-accounts/${id}`);
      setMsg({ type: 'success', text: 'Bank account deleted' });
      loadAll();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to delete' });
    }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;
  if (!config) return <div className="alert alert-error">Failed to load configuration.</div>;

  return (
    <div>
      <h2 className="section-title">Payment Methods Configuration</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="card">
        <div className="card-header">Allowed Methods (per Admission Cycle)</div>
        {cycle ? (
          <>
            <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 10 }}>
              Active cycle: <strong>{cycle.title}</strong>. Toggle which methods students may choose when paying the processing fee.
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { code: 'BANK_TRANSFER', label: 'Bank Transfer / Deposit' },
                { code: 'BANK_GATEWAY', label: 'Bank Payment Gateway' },
                { code: 'ONEBILL_VOUCHER', label: '1Bill Voucher' },
              ].map(m => (
                <label key={m.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: allowedMethods[m.code] ? '#eff6ff' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!allowedMethods[m.code]}
                    onChange={(e) => setAllowedMethods(prev => ({ ...prev, [m.code]: e.target.checked }))} />
                  <span style={{ fontWeight: 600 }}>{m.label}</span>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button className="btn btn-primary btn-sm" onClick={saveAllowedForCycle} disabled={saving}>Save Cycle Methods</button>
            </div>
          </>
        ) : <div style={{ color: '#94a3b8' }}>No active admission cycle.</div>}
      </div>

      <div className="card">
        <div className="card-header">Global Method Toggles &amp; Account Details</div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Bank Transfer */}
          <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 8 }}>
              <input type="checkbox" checked={!!config.bankTransferEnabled} onChange={e => handleConfigChange('bankTransferEnabled', e.target.checked)} />
              Bank Transfer enabled
            </label>
            <label style={{ fontSize: '0.8rem', color: '#475569' }}>Instructions to students</label>
            <textarea value={config.bankTransferInstructions || ''} rows={3}
              onChange={e => handleConfigChange('bankTransferInstructions', e.target.value)} />
          </div>

          {/* Bank Payment Gateway */}
          <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 8 }}>
              <input type="checkbox" checked={config.bankGatewayEnabled ?? true} onChange={e => handleConfigChange('bankGatewayEnabled', e.target.checked)} />
              Bank Payment Gateway enabled
            </label>
            <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block' }}>Instructions</label>
            <textarea value={config.bankGatewayInstructions || ''} rows={3}
              onChange={e => handleConfigChange('bankGatewayInstructions', e.target.value)} />
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 6 }}>
              <i className="fas fa-circle-info" style={{ marginRight: 4 }} />
              Gateway credentials (API key, secret, merchant id, webhooks) are configured under Super Admin → Payment Gateway. See the developer guide (docs/PAYMENT_GATEWAY_INTEGRATION.md).
            </div>
          </div>

          {/* 1Bill */}
          <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 8 }}>
              <input type="checkbox" checked={!!config.onebillEnabled} onChange={e => handleConfigChange('onebillEnabled', e.target.checked)} />
              1Bill Voucher enabled
            </label>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569' }}>1Bill Company Code</label>
                <input value={config.onebillCompanyCode || ''} onChange={e => handleConfigChange('onebillCompanyCode', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#475569' }}>Consumer Number Prefix</label>
                <input value={config.onebillConsumerNumber || ''} onChange={e => handleConfigChange('onebillConsumerNumber', e.target.value)} />
              </div>
            </div>
            <label style={{ fontSize: '0.8rem', color: '#475569', marginTop: 6, display: 'block' }}>Instructions</label>
            <textarea value={config.onebillInstructions || ''} rows={2}
              onChange={e => handleConfigChange('onebillInstructions', e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button className="btn btn-primary" onClick={saveConfig} disabled={saving}>{saving ? 'Saving...' : 'Save Configuration'}</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">University Bank Accounts (centralised)</div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Bank</th><th>Account Title</th><th>IBAN</th><th>Branch</th><th>Active</th><th>Order</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {banks.map(b => (
                <tr key={b.id}>
                  <td><strong>{b.bankName}</strong></td>
                  <td>{b.accountTitle}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{b.iban}</td>
                  <td>{b.branchCode || '-'}</td>
                  <td>{b.isActive ? <span style={{ color: '#16a34a', fontWeight: 600 }}>Yes</span> : <span style={{ color: '#94a3b8' }}>No</span>}</td>
                  <td>{b.sortOrder}</td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => editBank(b)}>Edit</button>{' '}
                    <button className="btn btn-sm btn-danger" onClick={() => deleteBank(b.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {banks.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', color: '#94a3b8' }}>No bank accounts configured.</td></tr>}
            </tbody>
          </table>
        </div>

        <form onSubmit={submitBank} style={{ marginTop: 14, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: '#1e293b' }}>{editingBank ? 'Edit Bank Account' : 'Add Bank Account'}</h4>
          <div className="form-grid">
            <div className="form-group"><label>Bank Name *</label><input value={bankForm.bankName} onChange={e => setBankForm({ ...bankForm, bankName: e.target.value })} required /></div>
            <div className="form-group"><label>Account Title *</label><input value={bankForm.accountTitle} onChange={e => setBankForm({ ...bankForm, accountTitle: e.target.value })} required /></div>
            <div className="form-group"><label>IBAN *</label><input value={bankForm.iban} onChange={e => setBankForm({ ...bankForm, iban: e.target.value.toUpperCase() })} placeholder="PKxxXXXX0000000000000000" required /></div>
            <div className="form-group"><label>Branch Code</label><input value={bankForm.branchCode} onChange={e => setBankForm({ ...bankForm, branchCode: e.target.value })} /></div>
            <div className="form-group"><label>Sort Order</label><input type="number" value={bankForm.sortOrder} onChange={e => setBankForm({ ...bankForm, sortOrder: parseInt(e.target.value) || 0 })} /></div>
            <div className="form-group">
              <label>Active</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42 }}>
                <input type="checkbox" checked={bankForm.isActive} onChange={e => setBankForm({ ...bankForm, isActive: e.target.checked })} />
                Show to students
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>{editingBank ? 'Update Bank' : 'Add Bank'}</button>
            {editingBank && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setEditingBank(null); setBankForm({ bankName: '', accountTitle: '', iban: '', branchCode: '', isActive: true, sortOrder: 0 }); }}>Cancel</button>}
          </div>
        </form>
      </div>
    </div>
  );
};

/* ════════════════ APPEALS ════════════════ */
const AppealsSection = () => {
  const [appeals, setAppeals] = useState([]);
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);

  const loadAppeals = async () => {
    try { const res = await api.get('/appeals', { params: { status: filter } }); setAppeals(res.data.appeals || []); } catch {} finally { setLoading(false); }
  };
  useEffect(() => { loadAppeals(); }, [filter]);

  const handleDecision = async (id, status) => {
    const response = prompt(`${status === 'APPROVED' ? 'Approval' : 'Rejection'} response to student:`);
    if (response === null) return;
    try {
      await api.put(`/appeals/${id}/decision`, { status, response });
      setMsg({ type: 'success', text: `Appeal ${status.toLowerCase()}` });
      loadAppeals();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };

  return (
    <div>
      <h2 className="section-title">Appeals</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="filter-bar">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>
        </select>
      </div>
      {loading ? <div className="loading"><span className="spinner"></span></div> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>ID</th><th>Student</th><th>Type</th><th>Subject</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {appeals.map(a => (
                  <tr key={a.id}>
                    <td>#{a.id}</td>
                    <td>
                      <strong>{a.user?.profile?.firstName} {a.user?.profile?.lastName}</strong><br />
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{a.user?.email}</span>
                    </td>
                    <td>{a.appealType.replace(/_/g, ' ')}</td>
                    <td>
                      {a.subject}<br />
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{a.message.substring(0, 80)}{a.message.length > 80 ? '...' : ''}</span>
                    </td>
                    <td><span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span></td>
                    <td>
                      {a.status === 'PENDING' && (
                        <div className="actions-bar">
                          <button className="btn btn-sm btn-success" onClick={() => handleDecision(a.id, 'APPROVED')}>Approve</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDecision(a.id, 'REJECTED')}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {appeals.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No appeals found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/* ════════════════ ENROLLMENT — Director full control ════════════════ */
const EnrollmentSection = () => {
  const [apps, setApps] = useState([]);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState({});
  const [savingRoll, setSavingRoll] = useState(null);
  const [savingReg, setSavingReg] = useState(null);
  const [publishing, setPublishing] = useState(null); // key being published

  const loadApps = async () => {
    setLoading(true);
    try { const res = await api.get('/enrollment/all'); setApps(res.data.applications || []); }
    catch {} finally { setLoading(false); }
  };
  useEffect(() => { loadApps(); }, []);

  // ── SHOW TO STUDENT (Master Prompt §8) — publish generated credentials.
  //    Reg#, Roll#, LMS username/password were auto-generated on fee approval;
  //    publishing simply reveals them to the student (individual/program/dept).
  const publish = async (level, id, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const key = `${level}:${id}`;
    setPublishing(key);
    try {
      const res = await api.put(`/enrollment/publish/${level}/${id}`);
      const n = res.data?.published ?? 0;
      setMsg({ type: 'success', text: res.data?.message || `Credentials published for ${n} student(s).` });
      loadApps();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Publish failed' });
    } finally { setPublishing(null); }
  };

  const setOverride = (userId, key, value) =>
    setOverrides(prev => ({ ...prev, [userId]: { ...prev[userId], [key]: value } }));

  const handleForward = async () => {
    const feeApprovedApps = apps.filter(a => a.status === 'FEE_APPROVED');
    if (feeApprovedApps.length === 0) return setMsg({ type: 'error', text: 'No fee-approved applications to forward' });
    if (!window.confirm(`Forward ${feeApprovedApps.length} application(s) to Coordinator for enrollment?`)) return;
    try {
      await api.put('/admin/applications/forward-enrollment', { applicationIds: feeApprovedApps.map(a => a.id) });
      setMsg({ type: 'success', text: `${feeApprovedApps.length} applications forwarded for enrollment` });
      loadApps();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
  };

  const handleRollUpdate = async (userId) => {
    const value = overrides[userId]?.rollNumber?.trim();
    if (!value) return setMsg({ type: 'error', text: 'Roll number is required' });
    setSavingRoll(userId);
    try {
      await api.put(`/admin/enrollment/${userId}/roll-number`, { rollNumber: value });
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
      await api.put(`/admin/enrollment/${userId}/registration-number`, { registrationNumber: value });
      setMsg({ type: 'success', text: 'Registration number updated' });
      loadApps();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Failed' }); }
    finally { setSavingReg(null); }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  const feePaid = apps.filter(a => a.status === 'FEE_PAID');
  const feeApproved = apps.filter(a => a.status === 'FEE_APPROVED');
  const enrolled = apps.filter(a => a.status === 'ENROLLED' || a.user?.enrollment?.status === 'ENROLLED');

  return (
    <div>
      <div className="enroll-toolbar">
        <h2 className="section-title">Enrollment</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {enrolled.length > 0 && (
            <>
              <button
                className="btn btn-outline"
                onClick={async () => {
                  try {
                    const rows = enrolled.map(a => ({
                      name: `${a.user?.profile?.firstName || ''} ${a.user?.profile?.lastName || ''}`.trim(),
                      email: a.user?.email,
                      program: a.program?.name,
                      registrationNumber: a.user?.enrollment?.registrationNumber,
                      rollNumber: a.user?.enrollment?.rollNumber,
                      lmsUsername: a.user?.enrollment?.lmsUsername,
                      status: a.user?.enrollment?.status || a.status,
                      cnic: a.user?.profile?.cnic,
                      phone: a.user?.profile?.phone,
                    }));
                    await downloadEnrolledStudentsPdf(rows);
                  } catch (err) {
                    console.error(err);
                    setMsg({ type: 'error', text: 'Failed to generate enrolled-students PDF' });
                  }
                }}
                title="Download enrolled students as PDF"
              >
                <i className="fas fa-file-pdf"></i> Download PDF
              </button>
              <button
                className="btn btn-outline"
                onClick={() => {
                  const rows = enrolled.map(a => ({
                    name: `${a.user?.profile?.firstName || ''} ${a.user?.profile?.lastName || ''}`.trim(),
                    email: a.user?.email,
                    program: a.program?.name,
                    registrationNumber: a.user?.enrollment?.registrationNumber,
                    rollNumber: a.user?.enrollment?.rollNumber,
                    lmsUsername: a.user?.enrollment?.lmsUsername,
                    status: a.user?.enrollment?.status || a.status,
                    cnic: a.user?.profile?.cnic,
                    phone: a.user?.profile?.phone,
                  }));
                  downloadEnrolledStudentsCsv(rows);
                }}
                title="Download enrolled students as Excel/CSV"
              >
                <i className="fas fa-file-excel"></i> Download Excel
              </button>
            </>
          )}
          {feeApproved.length > 0 && (
            <button className="btn btn-primary" onClick={handleForward}>
              <i className="fas fa-paper-plane" style={{ marginRight: 6 }}></i>
              Forward {feeApproved.length} to Coordinator
            </button>
          )}
        </div>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="enroll-info-banner">
        <div className="ei-icon"><i className="fas fa-user-shield"></i></div>
        <div>
          <strong>Director Privileges:</strong> Edit any Registration Number (e.g. <code>001F26C0103001</code>) or
          Roll Number (e.g. <code>ADCS-F26-101</code>) below. Roll numbers are only auto-issued when the fee is approved.
          Both fields enforce uniqueness at the database level.
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
            <div className="es-lbl">Ready for Enrollment</div>
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
                      <span className="em">{a.user?.email}</span>
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
              <i className="fas fa-check-circle" style={{ color: '#047857' }}></i>
              Fee Confirmed — Ready for Enrollment
              <span className="pill ready">{feeApproved.length}</span>
            </div>
          </div>
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead><tr><th>Student</th><th>Program</th><th>CNIC</th><th>Merit</th><th>Fee Status</th></tr></thead>
              <tbody>
                {feeApproved.map(a => (
                  <tr key={a.id}>
                    <td className="enroll-student-cell">
                      <strong>{a.user?.profile?.firstName} {a.user?.profile?.lastName}</strong>
                      <span className="em">{a.user?.email}</span>
                    </td>
                    <td>{a.program?.name}</td>
                    <td style={{ fontSize: '0.82rem' }}>{a.user?.profile?.cnic || '-'}</td>
                    <td>{a.meritEntry?.totalMerit?.toFixed(2) || '-'}%</td>
                    <td><span className="badge badge-fee_approved">Fee Confirmed</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {enrolled.length > 0 && (() => {
        // Group enrolled students by Department → Program for bulk publishing.
        const byDept = {};
        enrolled.forEach((a) => {
          const dep = a.program?.department;
          const depId = dep?.id || a.program?.departmentId || 'none';
          const depName = dep?.name || 'Unassigned Department';
          if (!byDept[depId]) byDept[depId] = { id: depId, name: depName, programs: {} };
          const progId = a.program?.id || 'none';
          const progName = a.program?.name || 'Unassigned Program';
          if (!byDept[depId].programs[progId]) byDept[depId].programs[progId] = { id: progId, name: progName, rows: [] };
          byDept[depId].programs[progId].rows.push(a);
        });
        const depGroups = Object.values(byDept);

        return (
        <div className="enroll-card">
          <div className="enroll-card__header">
            <div className="enroll-card__title">
              <i className="fas fa-graduation-cap" style={{ color: '#1d4ed8' }}></i>
              Enrolled Students — organized by Department / Program
              <span className="pill done">{enrolled.length}</span>
            </div>
          </div>

          <div className="alert alert-info" style={{ margin: '0.5rem 1rem' }}>
            <i className="fas fa-eye" style={{ marginRight: 6 }}></i>
            <strong>Show to Student</strong> reveals the auto-generated Registration #, Roll #,
            LMS Username &amp; temporary Password to the student (they stay "Pending" until published).
            Publish per student, per program, or for the whole department.
          </div>

          {depGroups.map((dep) => (
            <div key={dep.id} style={{ borderTop: '2px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#f8fafc' }}>
                <strong><i className="fas fa-sitemap" style={{ marginRight: 6, color: '#475569' }}></i>{dep.name}</strong>
                {typeof dep.id === 'number' && (
                  <button className="btn btn-sm btn-primary" disabled={publishing === `department:${dep.id}`}
                    onClick={() => publish('department', dep.id, `Show credentials to ALL enrolled students in "${dep.name}"?`)}>
                    <i className="fas fa-eye" style={{ marginRight: 4 }}></i>
                    {publishing === `department:${dep.id}` ? 'Publishing…' : 'Show whole Department'}
                  </button>
                )}
              </div>

              {Object.values(dep.programs).map((prog) => (
                <div key={prog.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 24px', background: '#fff' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                      <i className="fas fa-graduation-cap" style={{ marginRight: 6, color: '#94a3b8' }}></i>{prog.name}
                      <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {prog.rows.length} student(s)</span>
                    </span>
                    {typeof prog.id === 'number' && (
                      <button className="btn btn-sm btn-outline" disabled={publishing === `program:${prog.id}`}
                        onClick={() => publish('program', prog.id, `Show credentials to all enrolled students in "${prog.name}"?`)}>
                        <i className="fas fa-eye" style={{ marginRight: 4 }}></i>
                        {publishing === `program:${prog.id}` ? 'Publishing…' : 'Show whole Program'}
                      </button>
                    )}
                  </div>
                  <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Student</th><th>Reg # (editable)</th><th>Roll # (editable)</th>
                          <th>LMS Username</th><th>Published</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prog.rows.map(a => {
                          const enr = a.user?.enrollment;
                          const userId = a.user?.id;
                          const regVal = overrides[userId]?.registrationNumber !== undefined ? overrides[userId].registrationNumber : (enr?.registrationNumber || '');
                          const rollVal = overrides[userId]?.rollNumber !== undefined ? overrides[userId].rollNumber : (enr?.rollNumber || '');
                          const pub = !!enr?.credentialsPublished;
                          return (
                            <tr key={a.id}>
                              <td className="enroll-student-cell">
                                <strong>{a.user?.profile?.firstName} {a.user?.profile?.lastName}</strong>
                                <span className="em">{a.user?.email}</span>
                              </td>
                              <td>
                                <input type="text" className="enroll-input reg" value={regVal}
                                  onChange={e => setOverride(userId, 'registrationNumber', e.target.value)} />
                              </td>
                              <td>
                                <input type="text" className="enroll-input roll" value={rollVal}
                                  onChange={e => setOverride(userId, 'rollNumber', e.target.value)} />
                              </td>
                              <td><code style={{ fontSize: '0.78rem' }}>{enr?.lmsUsername || '-'}</code></td>
                              <td>
                                <span className={`badge badge-${pub ? 'open' : 'closed'}`}>
                                  {pub ? 'Published' : 'Pending'}
                                </span>
                              </td>
                              <td>
                                <div className="enroll-actions">
                                  <button className="btn btn-sm btn-outline" onClick={() => handleRegUpdate(userId)} disabled={savingReg === userId}>
                                    {savingReg === userId ? '…' : 'Save Reg'}
                                  </button>
                                  <button className="btn btn-sm btn-outline" onClick={() => handleRollUpdate(userId)} disabled={savingRoll === userId}>
                                    {savingRoll === userId ? '…' : 'Save Roll'}
                                  </button>
                                  {!pub && (
                                    <button className="btn btn-sm btn-success" disabled={publishing === `user:${userId}`}
                                      onClick={() => publish('user', userId, null)} title="Show credentials to this student">
                                      <i className="fas fa-eye" style={{ marginRight: 4 }}></i>
                                      {publishing === `user:${userId}` ? '…' : 'Show'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        );
      })()}

      {feeApproved.length === 0 && enrolled.length === 0 && feePaid.length === 0 && (
        <div className="enroll-card">
          <div className="enroll-empty">
            <div className="ee-emoji">🎓</div>
            <div className="ee-title">No students ready for enrollment yet</div>
            <div className="ee-sub">Once students complete fee payment, they'll appear here for enrollment processing.</div>
          </div>
        </div>
      )}
    </div>
  );
};


export default AdminDashboard;

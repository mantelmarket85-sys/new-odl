import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/AuthContext';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { LMS_FRONTEND_URL } from '../utils/lmsConfig';
import ProfileSection from '../components/dashboard/ProfileSection';
import EducationSection from '../components/dashboard/EducationSection';
import ApplicationSection from '../components/dashboard/ApplicationSection';
import MeritSection from '../components/dashboard/MeritSection';
import FeeSection from '../components/dashboard/FeeSection';
import NotificationSection from '../components/dashboard/NotificationSection';
import AppealSection from '../components/dashboard/AppealSection';
import StatusTimeline from '../components/dashboard/StatusTimeline';
// §1.2(d)(e) — shared, system-wide real-time education-record change detector
import { startEducationWatcher } from '../utils/educationWatcher';

const sidebarItems = [
  { key: 'overview',      label: 'Overview',      icon: 'fa-gauge-high' },
  { key: 'profile',       label: 'Profile',       icon: 'fa-user' },
  { key: 'education',     label: 'Education',     icon: 'fa-book-open' },
  { key: 'applications',  label: 'Applications',  icon: 'fa-clipboard-list' },
  { key: 'merit',         label: 'Merit',         icon: 'fa-trophy' },
  { key: 'fee',           label: 'Fee',           icon: 'fa-credit-card' },
  { key: 'enrollment',    label: 'Enrollment',    icon: 'fa-graduation-cap' },
  { key: 'notifications', label: 'Notifications', icon: 'fa-bell' },
  { key: 'appeal',        label: 'Appeal',        icon: 'fa-file-pen' },
];

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Section 8: a Candidate sees the "Applicant Portal"; once enrolled they see
  // the "Student Transition Page" until the LMS takes over.
  const [isEnrolledStudent, setIsEnrolledStudent] = useState(false);

  // §1.2(e) — keep a single system-wide watcher alive for the whole student
  // portal so an education-record update is detected in real time without a
  // manual refresh, on whichever module the student happens to be viewing.
  useEffect(() => startEducationWatcher(), []);

  // §1.2(c) — allow any nested module to request a dashboard tab switch.
  useEffect(() => {
    const onNavigateRequest = (e) => {
      const tab = e?.detail?.tab;
      if (tab && sidebarItems.some((s) => s.key === tab)) setActiveTab(tab);
    };
    window.addEventListener('aust:navigate', onNavigateRequest);
    return () => window.removeEventListener('aust:navigate', onNavigateRequest);
  }, []);

  useEffect(() => {
    let on = true;
    api.get('/enrollment/my', { params: { _t: Date.now() } })
      .then(r => { if (on) setIsEnrolledStudent(r.data.enrollment?.status === 'ENROLLED'); })
      .catch(() => {});
    return () => { on = false; };
  }, []);
  const portalLabel = isEnrolledStudent ? 'Student Transition Page' : 'Applicant Portal';
  const roleLabel = isEnrolledStudent ? 'Student' : 'Applicant';

  const renderSection = () => {
    switch (activeTab) {
      case 'overview': return <StudentOverviewSection user={user} onNavigate={setActiveTab} />;
      case 'profile': return <ProfileSection />;
      case 'education': return <EducationSection />;
      case 'applications': return <ApplicationSection onNavigate={setActiveTab} />;
      case 'merit': return <MeritSection />;
      case 'fee': return <FeeSection />;
      case 'enrollment': return <StudentEnrollmentSection />;
      case 'notifications': return <NotificationSection />;
      case 'appeal': return <AppealSection />;
      default: return <StudentOverviewSection user={user} onNavigate={setActiveTab} />;
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
              <small>{portalLabel}</small>
            </div>
          </div>
        </div>
        <div className="navbar-user">
          <span>{user?.email}</span>
          <span className="role-badge"><i className="fas fa-user-graduate" style={{ marginRight: 5 }}></i>{roleLabel}</span>
          <Link to="/" className="nav-link"><i className="fas fa-house"></i></Link>
          <button onClick={logout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <i className="fas fa-arrow-right-from-bracket"></i> Logout
          </button>
        </div>
      </nav>
      <div className="page-wrapper">
        <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-section-title">{portalLabel}</div>
          {sidebarItems.map(item => (
            <div
              key={item.key}
              className={`sidebar-item ${activeTab === item.key ? 'active' : ''}`}
              onClick={() => { setActiveTab(item.key); setSidebarOpen(false); }}
            >
              <span className="icon"><i className={`fas ${item.icon}`}></i></span>
              <span>{item.label}</span>
            </div>
          ))}
        </aside>
        <main className="main-content">
          {renderSection()}
        </main>
      </div>
    </div>
  );
};

/* ════════════════ STUDENT OVERVIEW SECTION ════════════════ */
const StudentOverviewSection = ({ user, onNavigate }) => {
  const [data, setData] = useState({
    application: null,
    enrollment: null,
    profile: null,
    notifications: [],
    cycle: null,
    // Phase 7: lightweight flag fetched from /education so the Migration
    // Certificate pending banner / popup can react to uploads without forcing
    // every dashboard child to share state.
    hasMigrationCert: false,
  });
  const [loading, setLoading] = useState(true);

  // Phase 7: one-time dismissal of the pending-migration popup per browser
  // tab session.  The banner inside the dashboard stays visible until the
  // student actually uploads the document.
  const [migrationPopupDismissed, setMigrationPopupDismissed] = useState(() => {
    try { return sessionStorage.getItem('aust:migrationPopupDismissed') === '1'; }
    catch { return false; }
  });

  // Real-time refresh: poll every 8s + refetch on tab focus / window focus /
  // online event, and listen for the global `aust:refresh` signal so any
  // child component (Profile, Education, Fee, Appeal, etc.) can request an
  // immediate refetch right after a server-side action completes.
  //
  // This guarantees the timeline / progress tracker / status badges reflect
  // every Director or Coordinator action — including forced overrides
  // (forced merit changes, forced rejection, forwarding again, reopening,
  // manual status overrides, interview reschedules, appeal decisions) —
  // without requiring a manual page refresh.
  useEffect(() => {
    let cancelled = false;
    // Track the latest status + updatedAt so we can briefly accelerate
    // polling whenever a change is detected (catches multi-stage director
    // overrides that happen within a few seconds of each other).
    let lastFingerprint = '';
    let fastUntil = 0;

    const load = async () => {
      try {
        const [appsRes, enrRes, profRes, notifRes, cycleRes, eduRes] = await Promise.all([
          // cache-bust so stale 304s from middleware never freeze the UI
          api.get('/applications', { params: { _t: Date.now() } }).catch(() => ({ data: { applications: [] } })),
          api.get('/enrollment/my',          { params: { _t: Date.now() } }).catch(() => ({ data: { enrollment: null } })),
          api.get('/profile',                { params: { _t: Date.now() } }).catch(() => ({ data: { profile: null } })),
          api.get('/notifications',          { params: { _t: Date.now() } }).catch(() => ({ data: { notifications: [] } })),
          api.get('/admission-cycle/active', { params: { _t: Date.now() } }).catch(() => ({ data: { cycle: null } })),
          // Phase 7: pull education with documents to compute migration-cert presence.
          api.get('/education',              { params: { _t: Date.now() } }).catch(() => ({ data: { educations: [] } })),
        ]);
        if (cancelled) return;
        const apps = appsRes.data.applications || [];
        const app = apps[0] || null;

        // Detect any meaningful change → accelerate polling for the next 20s
        // so subsequent director actions land on the UI within ~3 seconds.
        const fp = JSON.stringify({
          s: app?.status,
          u: app?.updatedAt,
          ev: app?.statusEvents?.length,
          mr: app?.meritEntry?.rank,
          mt: app?.meritEntry?.totalMerit,
          mf: app?.meritEntry?.isFinalized,
          iv: app?.interview?.status,
          fe: app?.feePayment?.status,
          ap: app?.lastAppealStatus,
          en: enrRes.data.enrollment?.status,
          rl: enrRes.data.enrollment?.rollNumber,
          rg: enrRes.data.enrollment?.registrationNumber,
        });
        if (lastFingerprint && fp !== lastFingerprint) {
          fastUntil = Date.now() + 20000;
        }
        lastFingerprint = fp;

        // Phase 7: scan every education record's documents for a migration
        // certificate (docType === 'migration_cert' OR filename hint).
        const eds = eduRes.data.educations || [];
        const hasMigrationCert = eds.some((ed) =>
          (ed.documents || []).some((d) => {
            const t = (d.docType || '').toLowerCase();
            const n = (d.fileName || '').toLowerCase();
            return t === 'migration_cert' || t.includes('migration') || n.includes('migration');
          }),
        );

        setData({
          application: app,
          enrollment: enrRes.data.enrollment,
          profile: profRes.data.profile,
          notifications: notifRes.data.notifications || [],
          cycle: cycleRes.data.cycle,
          hasMigrationCert,
        });
      } catch {} finally { if (!cancelled) setLoading(false); }
    };

    load();
    // Tick every 3s; only actually call `load` once per 8s in normal mode
    // and once per 3s during a "fast" window right after a detected change.
    let lastCall = 0;
    const tick = () => {
      const now = Date.now();
      const interval = now < fastUntil ? 3000 : 8000;
      if (now - lastCall >= interval) {
        lastCall = now;
        load();
      }
    };
    const ticker = setInterval(tick, 3000);

    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const onFocus   = () => load();
    const onOnline  = () => load();
    const onRefresh = () => load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    // Custom signal — any child that mutates server state can fire this so
    // the overview repulls instantly instead of waiting for the next tick.
    window.addEventListener('aust:refresh', onRefresh);

    return () => {
      cancelled = true;
      clearInterval(ticker);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('aust:refresh', onRefresh);
    };
  }, []);

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ height: 140, borderRadius: 18, marginBottom: '1.25rem' }} />
        <div className="stats-grid">
          {[1,2,3,4].map(i => (
            <div className="skel-stat" key={i}>
              <div className="skeleton skel-line lg" style={{ width: '40%' }} />
              <div className="skeleton skel-line" style={{ width: '70%' }} />
            </div>
          ))}
        </div>
        <div className="skel-card" style={{ marginTop: '1rem' }}>
          <div className="skeleton skel-line lg" style={{ width: '30%' }} />
          <div className="skeleton skel-line" style={{ width: '90%' }} />
          <div className="skeleton skel-line" style={{ width: '80%' }} />
          <div className="skeleton skel-line" style={{ width: '70%' }} />
        </div>
      </div>
    );
  }

  const { application, enrollment, profile, notifications, cycle, hasMigrationCert } = data;
  const fullName = profile?.fullName || user?.username || user?.email?.split('@')[0] || 'Student';
  const status = application?.status || 'PENDING';

  const STATUS_LABEL = {
    PENDING: 'Not Started',
    SUBMITTED: 'Submitted',
    UNDER_REVIEW: 'Under Review',
    NEED_INFO: 'Needs Info',
    RESULT_AWAITED: 'Result Awaited',
    FORWARDED: 'Forwarded to Coordinator',
    INTERVIEWED: 'Interview Scheduled',
    INTERVIEW_COMPLETED: 'Interview Completed',
    QUALIFIED: 'Qualified',
    DISQUALIFIED: 'Disqualified',
    APPEAL_SUBMITTED: 'Appeal Submitted',
    APPEAL_ACCEPTED: 'Appeal Accepted',
    APPEAL_REJECTED: 'Appeal Rejected',
    SELECTED: 'Merit Listed',
    FEE_PENDING: 'Enrollment Pending',
    FEE_PAID: 'Fee Paid',
    FEE_APPROVED: 'Fee Approved',
    ENROLLED: 'Enrolled',
    REJECTED: 'Rejected',
  };

  // If the application has an outstanding appeal, surface that status to the
  // student so they always see the latest workflow state.
  const lastAppeal = application?.appeals?.[0] || application?.lastAppealStatus;
  const lastAppealStatus = application?.lastAppealStatus;
  let displayStatus = status;
  if (lastAppealStatus === 'PENDING' && status === 'DISQUALIFIED') {
    displayStatus = 'APPEAL_SUBMITTED';
  } else if (lastAppealStatus === 'ACCEPTED' && (status === 'FORWARDED' || status === 'INTERVIEWED')) {
    // Show a brief "Appeal Accepted" badge until next status change is logged
    // (kept as the actual stage for progress-bar maths).
  }

  // Phase 2: accurate, real-time progress percentage.
  // Every real application status is mapped to one of the 8 canonical stages so
  // the bar never falls back to a misleading flat value. Statuses that are not
  // forward-moving (UNDER_REVIEW / NEED_INFO / RESULT_AWAITED) map to the same
  // stage as SUBMITTED; QUALIFIED maps to the merit/SELECTED stage; terminal
  // states (REJECTED / DISQUALIFIED) hold at their current stage index.
  const PROGRESS = ['SUBMITTED','FORWARDED','INTERVIEWED','SELECTED','FEE_PENDING','FEE_PAID','FEE_APPROVED','ENROLLED'];
  const STATUS_TO_STAGE = {
    PENDING: 0, SUBMITTED: 0, UNDER_REVIEW: 0, NEED_INFO: 0, RESULT_AWAITED: 0,
    FORWARDED: 1,
    INTERVIEWED: 2, INTERVIEW_COMPLETED: 2,
    QUALIFIED: 3, SELECTED: 3, DISQUALIFIED: 3,
    FEE_PENDING: 4,
    FEE_PAID: 5,
    FEE_APPROVED: 6,
    ENROLLED: 7,
    REJECTED: 0,
  };
  const stageIdx = STATUS_TO_STAGE[status] ?? (application ? 0 : -1);
  const progressPct = !application
    ? 0
    : status === 'ENROLLED'
      ? 100
      : Math.round(((stageIdx + 1) / PROGRESS.length) * 100);
  const currentIdx = stageIdx;

  // Status card colours
  const appBadgeClass = `badge badge-${(status || 'pending').toLowerCase()}`;
  const feeStatus = ['FEE_APPROVED','ENROLLED'].includes(status) ? 'paid'
                  : ['FEE_PAID'].includes(status) ? 'verifying'
                  : ['FEE_PENDING'].includes(status) ? 'pending'
                  : 'na';
  const rollNumber = enrollment?.rollNumber && enrollment.rollNumber !== 'Pending' ? enrollment.rollNumber : null;
  const regNumber = enrollment?.registrationNumber && enrollment.registrationNumber !== 'Pending' ? enrollment.registrationNumber : null;
  const lmsUsername = enrollment?.lmsUsername || null;
  const lmsTempPassword = enrollment?.lmsTempPassword || null;
  const lmsPasswordChanged = !!enrollment?.lmsPasswordChanged;
  const isAdcsEnroll = !!enrollment?.isAdcs || !!(rollNumber && lmsUsername);
  // (Master Prompt §13) Published credentials stay visible permanently — the
  // card must never revert to "Pending" after the student logs into the LMS.
  const showCredentialsCard = enrollment?.showCredentialsCard ?? (isAdcsEnroll && !!enrollment?.credentialsPublished);
  const isEnrolled = enrollment?.status === 'ENROLLED';

  const unread = notifications.filter(n => !n.read).length;
  const recentNotifs = notifications.slice(0, 4);

  // Timeline steps
  const steps = [
    { key: 'apply', title: 'Application',  desc: 'Submit your online application', icon: 'fa-file-pen', done: !!application, active: !application },
    { key: 'review', title: 'Review',      desc: 'Director & coordinator review',  icon: 'fa-magnifying-glass', done: ['FORWARDED','INTERVIEWED','SELECTED','FEE_PENDING','FEE_PAID','FEE_APPROVED','ENROLLED'].includes(status), active: ['SUBMITTED','UNDER_REVIEW','NEED_INFO','RESULT_AWAITED'].includes(status) },
    { key: 'interview', title: 'Interview', desc: 'Attend scheduled interview',     icon: 'fa-microphone-lines', done: ['INTERVIEWED','SELECTED','FEE_PENDING','FEE_PAID','FEE_APPROVED','ENROLLED'].includes(status), active: status === 'FORWARDED' },
    { key: 'merit', title: 'Merit & Selection', desc: 'Merit list & selection',     icon: 'fa-trophy', done: ['SELECTED','FEE_PENDING','FEE_PAID','FEE_APPROVED','ENROLLED'].includes(status), active: status === 'INTERVIEWED' },
    { key: 'fee',  title: 'Fee Payment',   desc: 'Pay admission fee',              icon: 'fa-credit-card', done: ['FEE_APPROVED','ENROLLED'].includes(status), active: ['FEE_PENDING','FEE_PAID'].includes(status) },
    { key: 'enroll', title: 'Enrollment',  desc: 'Get your roll number',           icon: 'fa-graduation-cap', done: status === 'ENROLLED', active: status === 'FEE_APPROVED' },
  ];

  // Phase 2: Result Awaited reminder — shown on every login/visit while the
  // application is on hold pending the final FSc result. It cannot pass Initial
  // Merit until the result is declared and entered in the Education section.
  const isResultAwaited = status === 'RESULT_AWAITED' || application?.resultStatus === 'Waiting';

  return (
    <div className="slide-up">
      {/* Phase 2: Result Awaited persistent reminder */}
      {application && isResultAwaited && (
        <div
          className="alert alert-warning"
          role="status"
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, borderLeft: '4px solid #f59e0b' }}
        >
          <i className="fas fa-hourglass-half" style={{ marginTop: 2, color: '#b45309' }}></i>
          <div>
            <strong>Result Awaited — action needed.</strong>
            <div style={{ fontSize: '0.85rem', marginTop: 2 }}>
              Your application is on hold pending your final FSc result. You can continue,
              but you <strong>cannot pass the Initial Merit</strong> until your result is declared.
              As soon as your FSc result is announced, open the <strong>Education</strong> section,
              update your FSc record to <em>Result Declared</em>, and your application will
              automatically continue in the admission process.
            </div>
          </div>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="welcome-banner-card">
        <div className="welcome-banner-card__bg" />
        <div className="welcome-banner-card__content">
          <div>
            <div className="welcome-eyebrow">
              <i className="fas fa-hand-sparkles"></i> Welcome back
            </div>
            <h1 className="welcome-title">Hello, {fullName} 👋</h1>
            <p className="welcome-sub">
              {cycle?.title ? `${cycle.title} · ` : ''}Track your application, payments and enrollment in one place.
            </p>
            <div className="welcome-progress">
              <div className="welcome-progress__top">
                <span>Application Progress</span>
                <strong>{progressPct}%</strong>
              </div>
              <div className="welcome-progress__bar">
                <div className="welcome-progress__fill" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </div>
          <div className="welcome-actions">
            {!application && (
              <button className="btn btn-primary" onClick={() => onNavigate('applications')}>
                <i className="fas fa-rocket"></i> Apply Now
              </button>
            )}
            {application && (
              <button className="btn btn-outline" onClick={() => onNavigate('applications')} style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
                <i className="fas fa-clipboard-list"></i> View Application
              </button>
            )}
            {/* §1.2(b) — direct navigation to the Education Record module */}
            <button
              className="btn btn-outline"
              onClick={() => onNavigate('education')}
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
              title="Add or update your Matric / FSc education records"
            >
              <i className="fas fa-graduation-cap"></i> Update Education Record
            </button>
            <button className="btn btn-outline" onClick={() => onNavigate('profile')} style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
              <i className="fas fa-user"></i> Profile
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================
          PHASE 7 — PENDING MIGRATION CERTIFICATE WORKFLOW
          ------------------------------------------------------------
          Behaviour (per spec, all non-blocking):
            • Migration Certificate is OPTIONAL during application, merit,
              enrollment, and roll/registration number generation.
            • AFTER enrollment, if the student still has NOT uploaded a
              Migration Certificate, a dismissible modal popup appears the
              first time they land on the dashboard in this tab session, AND
              a persistent inline banner stays at the top of the dashboard
              until the document is uploaded.
            • The popup is dismissible (session-scoped); the inline banner
              is NOT — it remains visible until the upload happens.
            • Once uploaded, both the popup and the banner disappear
              automatically (hasMigrationCert flips to true and the polling
              loop picks it up).
            • Roll number, registration number, and enrollment status are
              NEVER mutated by this flow.
          ============================================================ */}
      {isEnrolled && !hasMigrationCert && (
        <>
          {/* Persistent inline dashboard banner */}
          <div
            className="card"
            role="status"
            aria-live="polite"
            style={{
              background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
              borderLeft: '4px solid #f97316',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <div style={{ fontSize: '1.5rem', lineHeight: 1, marginTop: 2, color: '#c2410c' }} aria-hidden="true">
              <i className="fas fa-file-circle-exclamation"></i>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#9a3412', fontSize: '1rem', marginBottom: 2 }}>
                Pending Required Document
                <span
                  className="badge"
                  style={{
                    marginLeft: 8,
                    background: '#fed7aa',
                    color: '#9a3412',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    letterSpacing: '.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Migration Certificate Pending
                </span>
              </div>
              <div style={{ fontSize: '0.86rem', color: '#7c2d12', marginBottom: 8 }}>
                Your <strong>Migration Certificate</strong> has not been uploaded yet.
                Please upload it after receiving it from your Board Office to
                complete your student record. This does <strong>not</strong> affect your
                roll number, registration number, enrollment, or LMS access.
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => onNavigate('education')}
                style={{ background: '#ea580c', borderColor: '#ea580c' }}
              >
                <i className="fas fa-upload" style={{ marginRight: 6 }}></i>
                Upload Migration Certificate
              </button>
            </div>
          </div>

          {/* One-time-per-session dismissible modal popup */}
          {!migrationPopupDismissed && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="migration-popup-title"
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(15, 23, 42, 0.55)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 9999, padding: 16,
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setMigrationPopupDismissed(true);
                  try { sessionStorage.setItem('aust:migrationPopupDismissed', '1'); } catch {}
                }
              }}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: 14,
                  maxWidth: 480, width: '100%',
                  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.35)',
                  overflow: 'hidden',
                  border: '1px solid #fed7aa',
                }}
              >
                <div style={{
                  background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                  padding: '18px 20px',
                  borderBottom: '1px solid #fed7aa',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ fontSize: '1.5rem', color: '#c2410c' }} aria-hidden="true">
                    <i className="fas fa-file-circle-exclamation"></i>
                  </span>
                  <h3 id="migration-popup-title" style={{ margin: 0, fontSize: '1.1rem', color: '#9a3412', fontWeight: 700 }}>
                    Pending Required Document
                  </h3>
                </div>
                <div style={{ padding: '18px 20px' }}>
                  <p style={{ margin: '0 0 10px', color: '#1f2937', lineHeight: 1.55, fontSize: '0.94rem' }}>
                    Your <strong>Migration Certificate</strong> has not been uploaded yet.
                  </p>
                  <p style={{ margin: '0 0 14px', color: '#475569', lineHeight: 1.55, fontSize: '0.88rem' }}>
                    Please upload your Migration Certificate after receiving it
                    from your Board Office to complete your student record.
                    Your roll number, registration number, enrollment status,
                    and LMS access remain unaffected.
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => {
                        setMigrationPopupDismissed(true);
                        try { sessionStorage.setItem('aust:migrationPopupDismissed', '1'); } catch {}
                      }}
                    >
                      Remind Me Later
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      style={{ background: '#ea580c', borderColor: '#ea580c' }}
                      onClick={() => {
                        setMigrationPopupDismissed(true);
                        try { sessionStorage.setItem('aust:migrationPopupDismissed', '1'); } catch {}
                        onNavigate('education');
                      }}
                    >
                      <i className="fas fa-upload" style={{ marginRight: 6 }}></i>
                      Upload Now
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Enrollment Credentials Banner — ADCS students only.
          Persists until the student completes their first LMS login. */}
      {isEnrolled && isAdcsEnroll && showCredentialsCard && (
        <div className="card" style={{
          background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
          borderLeft: '4px solid #10b981',
          marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.6rem' }}>✅</span>
            <div>
              <div style={{ fontWeight: 700, color: '#065f46', fontSize: '1.05rem' }}>Enrollment Confirmed</div>
              <div style={{ fontSize: '0.85rem', color: '#047857' }}>Save these credentials — you will use them throughout your studies. This card will disappear after your first LMS login.</div>
            </div>
          </div>
          <div className="form-grid" style={{ gap: '0.75rem' }}>
            {regNumber && (
              <div style={{ padding: '0.75rem', background: '#fff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Registration Number</div>
                <div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#1e3a8a', fontSize: '1.1rem', wordBreak: 'break-all' }}>{regNumber}</div>
              </div>
            )}
            {rollNumber && (
              <div style={{ padding: '0.75rem', background: '#fff', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Roll Number</div>
                <div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#065f46', fontSize: '1.1rem', wordBreak: 'break-all' }}>{rollNumber}</div>
              </div>
            )}
            {lmsUsername && (
              <div style={{ padding: '0.75rem', background: '#fff', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
                <div style={{ fontSize: '0.72rem', color: '#6d28d9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>LMS Username</div>
                <div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#4c1d95', fontSize: '1.1rem', wordBreak: 'break-all' }}>{lmsUsername}</div>
                <div style={{ fontSize: '0.7rem', color: '#7c3aed', marginTop: 2 }}>(same as your Roll Number)</div>
              </div>
            )}
            {!lmsPasswordChanged && lmsTempPassword && (
              <div style={{ padding: '0.75rem', background: '#fff', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Temporary LMS Password</div>
                <div style={{ fontWeight: 800, fontFamily: 'monospace', color: '#92400e', fontSize: '1.1rem', wordBreak: 'break-all' }}>{lmsTempPassword}</div>
                <div style={{ fontSize: '0.7rem', color: '#b45309', marginTop: 2 }}>You'll be asked to change this on first login.</div>
              </div>
            )}
            {lmsPasswordChanged && (
              <div style={{ padding: '0.75rem', background: '#fff', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>LMS Password</div>
                <div style={{ fontWeight: 700, color: '#065f46', fontSize: '0.95rem' }}>✅ Password updated</div>
                <div style={{ fontSize: '0.7rem', color: '#047857', marginTop: 2 }}>Use the password you set to log in to the LMS.</div>
              </div>
            )}
          </div>
          <div style={{ marginTop: '1rem' }}>
            <a href={`${LMS_FRONTEND_URL}/login`} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <i className="fas fa-right-to-bracket"></i> Login to LMS
            </a>
          </div>
        </div>
      )}

      {/* Enrolled but credentials NOT yet published (Master Prompt §7).
          Show "Congratulations! Successfully enrolled" with everything Pending
          until the Admissions Office clicks "Show to Student". */}
      {isEnrolled && !showCredentialsCard && (
        <div className="card" style={{
          background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
          borderLeft: '4px solid #10b981',
          marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.8rem' }}>🎉</span>
            <div>
              <div style={{ fontWeight: 800, color: '#065f46', fontSize: '1.15rem' }}>Congratulations! Successfully Enrolled</div>
              <div style={{ fontSize: '0.9rem', color: '#047857', marginTop: 4 }}>
                Your enrollment is confirmed. Your credentials are being prepared by the Admissions Office
                and will be published to you shortly. You will be notified when they are available.
              </div>
            </div>
          </div>
          <div className="form-grid" style={{ gap: '0.75rem' }}>
            {[
              { label: 'Registration Number' },
              { label: 'Roll Number' },
              { label: 'LMS Username' },
              { label: 'LMS Password' },
            ].map((f) => (
              <div key={f.label} style={{ padding: '0.75rem', background: '#fff', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>{f.label}</div>
                <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: '1rem' }}>
                  <i className="fas fa-clock" style={{ marginRight: 6 }}></i>Pending
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="overview-stats">
        <div className="overview-stat-card" onClick={() => onNavigate('applications')}>
          <div className="overview-stat-card__icon" style={{ background: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', color: '#1d4ed8' }}>
            <i className="fas fa-clipboard-list"></i>
          </div>
          <div className="overview-stat-card__body">
            <div className="overview-stat-card__label">Application Status</div>
            <div className="overview-stat-card__value">
              {application ? <span className={`badge badge-${(displayStatus || 'pending').toLowerCase()}`}>{STATUS_LABEL[displayStatus] || STATUS_LABEL[status] || status}</span> : <span className="badge badge-pending">Not Started</span>}
            </div>
            <div className="overview-stat-card__hint">
              {application ? `Applied · ${new Date(application.createdAt || Date.now()).toLocaleDateString()}` : 'Click to start your application'}
            </div>
          </div>
        </div>

        <div className="overview-stat-card" onClick={() => onNavigate('fee')}>
          <div className="overview-stat-card__icon" style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)', color: '#b45309' }}>
            <i className="fas fa-credit-card"></i>
          </div>
          <div className="overview-stat-card__body">
            <div className="overview-stat-card__label">Payment Status</div>
            <div className="overview-stat-card__value">
              {feeStatus === 'paid' && <span className="pay-pill success">Approved</span>}
              {feeStatus === 'verifying' && <span className="pay-pill pending">Verifying</span>}
              {feeStatus === 'pending' && <span className="pay-pill pending">Due</span>}
              {feeStatus === 'na' && <span className="pay-pill" style={{ background:'#f1f5f9', color:'#64748b' }}>Not Yet</span>}
            </div>
            <div className="overview-stat-card__hint">
              {feeStatus === 'paid' ? 'Payment confirmed' :
               feeStatus === 'verifying' ? 'Awaiting director verification' :
               feeStatus === 'pending' ? 'Pay your admission fee' :
               'Available after merit selection'}
            </div>
          </div>
        </div>

        <div className="overview-stat-card" onClick={() => onNavigate('enrollment')}>
          <div className="overview-stat-card__icon" style={{ background: 'linear-gradient(135deg,#dcfce7,#bbf7d0)', color: '#15803d' }}>
            <i className="fas fa-id-card"></i>
          </div>
          <div className="overview-stat-card__body">
            <div className="overview-stat-card__label">Roll Number</div>
            <div className="overview-stat-card__value" style={{ fontFamily: "'Poppins', monospace", fontSize: '1.25rem', fontWeight: 800, color: rollNumber ? 'var(--success)' : 'var(--text-soft)' }}>
              {rollNumber || 'Pending'}
            </div>
            <div className="overview-stat-card__hint">
              {rollNumber ? 'Use for class & exams' : 'Issued after enrollment'}
            </div>
          </div>
        </div>

        <div className="overview-stat-card" onClick={() => onNavigate('notifications')}>
          <div className="overview-stat-card__icon" style={{ background: 'linear-gradient(135deg,#ede9fe,#ddd6fe)', color: '#6d28d9' }}>
            <i className="fas fa-bell"></i>
          </div>
          <div className="overview-stat-card__body">
            <div className="overview-stat-card__label">Notifications</div>
            <div className="overview-stat-card__value" style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: "'Poppins', sans-serif" }}>
              {unread}
              <span style={{ fontSize: '0.85rem', color: 'var(--text-soft)', fontWeight: 600, marginLeft: 6 }}>unread</span>
            </div>
            <div className="overview-stat-card__hint">
              {notifications.length} total messages
            </div>
          </div>
        </div>
      </div>

      {/* Timeline + Sidebar info */}
      <div className="overview-grid">
        <div className="card">
          <div className="card-header">
            <span className="header-icon"><i className="fas fa-route"></i></span>
            Admission Timeline
            <span style={{
              marginLeft: 'auto', fontSize: '0.7rem', color: '#16a34a',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#16a34a', display: 'inline-block',
                animation: 'pulseGlow 2s ease-in-out infinite',
              }} />
              Live
            </span>
          </div>
          <div className="timeline-pro">
            {steps.map((s, i) => (
              <div key={s.key} className={`timeline-pro__item ${s.done ? 'done' : ''} ${s.active ? 'active' : ''}`}>
                <div className="timeline-pro__dot">
                  {s.done ? <i className="fas fa-check"></i> : <i className={`fas ${s.icon}`}></i>}
                </div>
                <div className="timeline-pro__content">
                  <div className="timeline-pro__title">
                    <span>{i + 1}. {s.title}</span>
                    {s.done && <span className="badge badge-enrolled" style={{ marginLeft: 8 }}>Done</span>}
                    {s.active && <span className="badge badge-pending" style={{ marginLeft: 8 }}>In Progress</span>}
                  </div>
                  <div className="timeline-pro__desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Live event log — every status change made by Director / Coordinator
              / Admin appears here within ~10s thanks to real-time polling. */}
          {application?.statusEvents && application.statusEvents.length > 0 && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px dashed #e2e8f0' }}>
              <div style={{
                fontSize: '0.78rem', fontWeight: 700, color: '#475569',
                textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '0.75rem',
              }}>
                <i className="fas fa-clock-rotate-left" style={{ marginRight: 6 }}></i>
                Recent Activity
              </div>
              <StatusTimeline
                events={[...application.statusEvents].slice(-6).reverse()}
              />
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="header-icon"><i className="fas fa-bell"></i></span>
            Recent Notifications
          </div>
          {recentNotifs.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.5rem 0.5rem' }}>
              <div className="empty-icon"><i className="fas fa-bell-slash"></i></div>
              <p style={{ fontWeight: 600, color: '#1a2744' }}>You're all caught up.</p>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>New alerts will appear here automatically.</p>
            </div>
          ) : (
            <div>
              {recentNotifs.map(n => (
                <div key={n.id} className={`notification-item ${!n.read ? 'unread' : ''}`} style={{ borderRadius: 8, marginBottom: 4 }}>
                  <div className="notif-dot" />
                  <div className="notif-content">
                    <div className="notif-title">{n.title || 'Notification'}</div>
                    <div className="notif-message" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.message}</div>
                    <div className="notif-time">{new Date(n.createdAt || Date.now()).toLocaleString()}</div>
                  </div>
                </div>
              ))}
              <button
                className="btn btn-ghost btn-sm btn-block"
                onClick={() => onNavigate('notifications')}
                style={{ marginTop: 8 }}
              >
                View all notifications <i className="fas fa-arrow-right"></i>
              </button>
            </div>
          )}

          {regNumber && (
            <div style={{
              marginTop: '1rem',
              padding: '0.85rem',
              background: 'linear-gradient(135deg, rgba(29,93,209,0.06), rgba(56,189,248,0.06))',
              border: '1px solid rgba(29,93,209,0.18)',
              borderRadius: 12,
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                <i className="fas fa-id-badge"></i> Registration Number
              </div>
              <div style={{ fontFamily: "'Poppins', monospace", fontWeight: 800, color: 'var(--primary-dark)', fontSize: '1.1rem' }}>
                {regNumber}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ════════════════ STUDENT ENROLLMENT SECTION ════════════════ */
const StudentEnrollmentSection = () => {
  const [enrollment, setEnrollment] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/enrollment/my')
      .then(r => setEnrollment(r.data.enrollment))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  if (!enrollment) {
    return (
      <div>
        <h2 className="section-title">Enrollment</h2>
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🎓</div>
            <p style={{ fontWeight: 600, color: '#1a2744' }}>You are not enrolled yet.</p>
            <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: 560, margin: '0.5rem auto 0' }}>
              Enrollment is completed after your application is approved, your admission fee is verified by the Director, and the Coordinator finalises your enrollment record. Your roll number and registration number will appear here once active.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isFullyEnrolled = enrollment.status === 'ENROLLED';
  const published = !!enrollment.credentialsPublished;
  const rollPending = !enrollment.rollNumber || enrollment.rollNumber === 'Pending';

  return (
    <div>
      <h2 className="section-title">Enrollment</h2>

      {isFullyEnrolled ? (
        <div className="enrollment-card">
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉</div>
          <h3>Congratulations! Successfully Enrolled</h3>
          <p style={{ color: '#065f46', marginBottom: '1rem' }}>
            {published
              ? 'Your admission process is complete. Your credentials are shown below — you can now log in to the LMS.'
              : 'Your admission process is complete. Your Registration Number, Roll Number and LMS credentials are being prepared by the Admissions Office and will be published to you shortly.'}
          </p>
        </div>
      ) : (
        <div className="card" style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div style={{ fontSize: '1.6rem' }}>⏳</div>
            <div>
              <div style={{ fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>Enrollment Pending</div>
              <div style={{ fontSize: '0.88rem', color: '#78350f' }}>
                Your enrollment record will be finalised once your admission fee is approved by the Director.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">Enrollment Details</div>
        <div className="form-grid" style={{ gap: '0.75rem' }}>
          <div style={{ padding: '0.85rem', background: '#eff6ff', borderRadius: '8px', borderLeft: '3px solid #2563eb' }}>
            <div style={{ fontSize: '0.78rem', color: '#1e40af', marginBottom: '2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Registration Number</div>
            <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: '1.15rem', fontFamily: 'monospace', letterSpacing: '.04em' }}>
              {enrollment.registrationNumber || 'Pending'}
            </div>
            <div style={{ fontSize: '.7rem', color: '#3b82f6', marginTop: '4px' }}>
              {enrollment.registrationNumber ? 'Permanent ID for university records' : 'Will be published by the Admissions Office'}
            </div>
          </div>

          <div style={{
            padding: '0.85rem',
            background: rollPending ? '#fffbeb' : '#ecfdf5',
            borderRadius: '8px',
            borderLeft: `3px solid ${rollPending ? '#f59e0b' : '#10b981'}`,
          }}>
            <div style={{ fontSize: '0.78rem', color: rollPending ? '#92400e' : '#065f46', marginBottom: '2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Roll Number</div>
            <div style={{ fontWeight: 700, color: rollPending ? '#92400e' : '#065f46', fontSize: '1.15rem', fontFamily: 'monospace', letterSpacing: '.04em' }}>
              {rollPending ? 'Pending' : enrollment.rollNumber}
            </div>
            <div style={{ fontSize: '.7rem', color: rollPending ? '#b45309' : '#10b981', marginTop: '4px' }}>
              {rollPending ? 'Will be published by the Admissions Office' : 'Use for class roll & exams'}
            </div>
          </div>

          {enrollment.lmsUsername && (
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '2px' }}>LMS Username</div>
              <div style={{ fontWeight: 700, color: '#1a2744', fontSize: '1.05rem', fontFamily: 'monospace' }}>{enrollment.lmsUsername}</div>
            </div>
          )}
          {enrollment.lmsPassword && (
            <div style={{ padding: '0.75rem', background: '#fff7ed', borderRadius: '8px', gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '0.78rem', color: '#9a3412', marginBottom: '2px' }}>LMS Password</div>
              <div style={{ fontWeight: 700, color: '#9a3412', fontSize: '1.05rem', fontFamily: 'monospace' }}>{enrollment.lmsPassword}</div>
              <div style={{ fontSize: '0.75rem', color: '#c2410c', marginTop: '4px' }}>Please change your password on first login</div>
            </div>
          )}
          {enrollment.enrolledAt && (
            <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '2px' }}>Enrolled Date</div>
              <div style={{ fontWeight: 600, color: '#1a2744' }}>{new Date(enrollment.enrolledAt).toLocaleDateString()}</div>
            </div>
          )}
          <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '2px' }}>Status</div>
            <span className={`badge ${isFullyEnrolled ? 'badge-enrolled' : 'badge-pending'}`}>{enrollment.status}</span>
          </div>
          <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '2px' }}>Fee Paid</div>
            <span className={`badge ${enrollment.feePaid ? 'badge-enrolled' : 'badge-pending'}`}>
              {enrollment.feePaid ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

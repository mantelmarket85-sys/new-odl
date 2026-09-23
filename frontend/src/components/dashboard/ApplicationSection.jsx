import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import StatusBadge from './StatusBadge';
import StatusTimeline from './StatusTimeline';
import DocumentPreviewLink from './DocumentPreviewLink';

// Linkify URLs in arbitrary text
const Linkify = ({ text }) => {
  if (!text) return null;
  const urlRe = /(https?:\/\/[^\s]+)/g;
  const parts = String(text).split(urlRe);
  return (
    <>
      {parts.map((p, i) =>
        urlRe.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer"
             style={{ color: '#0ea5e9', textDecoration: 'underline', wordBreak: 'break-all' }}>{p}</a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
};

// Full canonical progress flow (in order). The tracker dynamically derives the
// student's current step from `application.status`, plus `lastAppealStatus`,
// `resultStatus`, and any DISQUALIFIED / REJECTED terminal states.
const PROGRESS_STEPS = [
  { key: 'SUBMITTED',           label: 'Submitted' },
  { key: 'UNDER_REVIEW',        label: 'Under Director Review' },
  { key: 'FORWARDED',           label: 'Forwarded to Coordinator' },
  { key: 'INTERVIEWED',         label: 'Interview Scheduled' },
  { key: 'INTERVIEW_COMPLETED', label: 'Interview Completed' },
  { key: 'QUALIFIED',           label: 'Qualified' },
  { key: 'SELECTED',            label: 'Merit Listed' },
  { key: 'FEE_PENDING',         label: 'Enrollment Pending' },
  { key: 'FEE_PAID',            label: 'Fee Paid' },
  { key: 'ENROLLED',            label: 'Enrolled' },
];

// Map any status the API may return → the index it should highlight.
const STATUS_TO_STEP = {
  PENDING: 0, SUBMITTED: 0,
  UNDER_REVIEW: 1, NEED_INFO: 1, RESULT_AWAITED: 1,
  APPEAL_SUBMITTED: 1, APPEAL_ACCEPTED: 1, APPEAL_REJECTED: 1,
  FORWARDED: 2,
  INTERVIEWED: 3,
  INTERVIEW_COMPLETED: 4,
  QUALIFIED: 5, DISQUALIFIED: 5,
  SELECTED: 6,
  FEE_PENDING: 7,
  FEE_PAID: 8, FEE_APPROVED: 8,
  ENROLLED: 9,
};

const ProgressTracker = ({ application }) => {
  const status = application?.status;
  const isRejected = status === 'REJECTED';
  const isDisqualified = status === 'DISQUALIFIED';
  const idx = STATUS_TO_STEP[status] ?? -1;

  // §2.1 Initial Merit List — when the Coordinator marks the applicant
  // "Not Eligible" for interview (and the Initial Merit List is published so
  // the student may see it), surface a clear "Not Eligible" state on the
  // progress bar. This updates in real time (the student view polls) and
  // mirrors what the Coordinator / Director / Merit List show.
  const publishedInitialMerit = !!application?.admissionCycle?.initialMeritPublished;
  const isNotEligible = application?.interviewEligibility === 'NOT_ELIGIBLE'
    && publishedInitialMerit
    && !['ENROLLED', 'REJECTED', 'DISQUALIFIED'].includes(status);
  // The applicant stopped at the "Forwarded to Coordinator" review stage.
  const notEligibleIdx = STATUS_TO_STEP.FORWARDED;

  if (isNotEligible) {
    return (
      <div style={{ margin: '8px 0' }}>
        <div className="status-tracker" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PROGRESS_STEPS.map((step, i) => {
            let bg = '#cbd5e1', fg = '#475569', icon = i + 1;
            if (i < notEligibleIdx) { bg = '#10b981'; fg = 'white'; icon = '✓'; }
            else if (i === notEligibleIdx) { bg = '#dc2626'; fg = 'white'; icon = '✗'; }
            return (
              <div key={step.key} title={i === notEligibleIdx ? 'Not Eligible for Interview' : step.label} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', background: bg, color: fg,
                borderRadius: 14, fontSize: '0.7rem', fontWeight: 600,
              }}>
                {icon}. {i === notEligibleIdx ? 'Not Eligible' : step.label}
              </div>
            );
          })}
        </div>
        <div style={{
          marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6,
          background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca',
          padding: '4px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
        }}>
          <i className="fas fa-circle-xmark"></i> Not Eligible for Interview
        </div>
      </div>
    );
  }

  return (
    <div className="status-tracker" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '8px 0' }}>
      {PROGRESS_STEPS.map((step, i) => {
        let state = '';
        if (idx >= 0) {
          if (i < idx) state = 'completed';
          else if (i === idx) state = 'active';
        }
        // Terminal failure: show step where it stopped in red
        if ((isRejected || isDisqualified) && i === idx) state = 'failed';

        let bg = '#cbd5e1', fg = '#475569';
        if (state === 'completed') { bg = '#10b981'; fg = 'white'; }
        else if (state === 'active') { bg = '#3b82f6'; fg = 'white'; }
        else if (state === 'failed') { bg = '#dc2626'; fg = 'white'; }

        const icon = state === 'completed' ? '✓'
                   : state === 'failed'    ? '✗'
                   : (i + 1);

        return (
          <div key={step.key} title={step.label} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', background: bg, color: fg,
            borderRadius: 14, fontSize: '0.7rem', fontWeight: 600,
          }}>
            {icon}. {step.label}
          </div>
        );
      })}
    </div>
  );
};

const ApplicationSection = ({ onNavigate }) => {
  // §1.2(c) — "Update Record" must take the student to the Education Record
  // module. When the section is rendered inside the student dashboard we can
  // switch tabs directly; when rendered standalone we fall back to a hash nav.
  const goToEducationRecord = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('education');
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { window.scrollTo(0, 0); }
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent('aust:navigate', { detail: { tab: 'education' } }));
    } catch {}
    try { window.location.hash = '#education-section-top'; } catch {}
  };

  const [applications, setApplications] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [cycle, setCycle] = useState(null);
  const [profile, setProfile] = useState(null);
  const [educations, setEducations] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [selectedBankId, setSelectedBankId] = useState(''); // university bank chosen for Bank Transfer
  const [txnId, setTxnId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Appeal state
  const [appealOpen, setAppealOpen] = useState({}); // { [appId]: bool }
  const [appealForm, setAppealForm] = useState({}); // { [appId]: { subject, message, file } }
  const [submittingAppeal, setSubmittingAppeal] = useState({});

  // Timeline expansion
  const [expanded, setExpanded] = useState({});

  const [msg, setMsg] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
    // Auto-refresh every 10 s + on focus so the student timeline stays in sync
    // with coordinator/director/admin actions in real-time.
    const t = setInterval(() => { loadAll(); }, 10000);
    const onFocus = () => loadAll();
    const onVisible = () => { if (document.visibilityState === 'visible') loadAll(); };
    // §1.2(e) — react instantly when the education record changes anywhere in
    // the system (detected by the shared education watcher).
    const onEducationUpdated = () => loadAll();
    const onAppRefresh = () => loadAll();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('aust:education-updated', onEducationUpdated);
    window.addEventListener('aust:refresh', onAppRefresh);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('aust:education-updated', onEducationUpdated);
      window.removeEventListener('aust:refresh', onAppRefresh);
    };
  }, []);

  const loadAll = async () => {
    try {
      const [appsRes, progsRes, cycleRes, profRes, eduRes, methodsRes] = await Promise.all([
        api.get('/applications'),
        api.get('/programs'),
        api.get('/admission-cycle/active'),
        api.get('/profile'),
        api.get('/education'),
        api.get('/payment-methods/public').catch(() => ({ data: { methods: [], bankAccounts: [] } })),
      ]);
      setApplications(appsRes.data.applications || []);
      const activeCycle = cycleRes.data.cycle;
      setCycle(activeCycle);
      // §1.1 Student-facing rule: at application time students must ONLY see the
      // program(s) of the currently announced/active cycle. Any deselected or
      // inactive cycle/program must not be visible or selectable. We fetch the
      // active cycle's currently-open programs and restrict the dropdown to
      // those; if none is announced, no programs are offered.
      let visiblePrograms = [];
      if (activeCycle?.id) {
        try {
          const cpRes = await api.get(`/admission-cycle/${activeCycle.id}/programs`, { params: { activeOnly: 1 } });
          const openIds = new Set((cpRes.data.programs || []).map((cp) => cp.programId));
          visiblePrograms = (progsRes.data.programs || []).filter((p) => openIds.has(p.id));
        } catch {
          visiblePrograms = [];
        }
      }
      setPrograms(visiblePrograms);
      setProfile(profRes.data.profile);
      setEducations(eduRes.data.educations || []);
      setPaymentMethods(methodsRes.data.methods || []);
      setBankAccounts(methodsRes.data.bankAccounts || []);
      // Default payment method
      if (methodsRes.data.methods?.length > 0 && !paymentMethod) {
        setPaymentMethod(methodsRes.data.methods[0].code);
      }
    } catch {} finally { setLoading(false); }
  };

  const procFee = cycle?.applicationProcessingFee ?? cycle?.applicationFee ?? 1200;

  const canApply = () => {
    if (!cycle || !cycle.isOpen) return { ok: false, reason: 'Admissions are currently closed.' };
    if (!profile || !profile.isComplete) return { ok: false, reason: 'Please complete your profile first.' };
    const matric = educations.find(e => e.level === '10years');
    const fscFull = educations.find(e => e.level === '12years');
    const fscPartI = educations.find(e => e.level === '11years');
    if (!matric) return { ok: false, reason: 'Matric (10 years / SSC) record is required.' };
    if (!fscFull && !fscPartI) {
      return { ok: false, reason: 'Either FSc Part-I (11 years) or full FSc / Intermediate (12 years) record is required.' };
    }
    if (fscFull && fscFull.resultStatus === 'Completed' && fscFull.marks && fscFull.totalMarks) {
      const pct = (fscFull.marks / fscFull.totalMarks) * 100;
      if (pct < cycle.minMarksPercent) {
        return { ok: false, reason: `Minimum ${cycle.minMarksPercent}% marks required in FSc. Your marks: ${pct.toFixed(1)}%` };
      }
    }
    return { ok: true };
  };

  const willBeResultAwaited = () => {
    const fscFull = educations.find(e => e.level === '12years');
    const fscPartI = educations.find(e => e.level === '11years');
    const anyWaiting = educations.some(e => e.resultStatus === 'Waiting');
    return anyWaiting || (!!fscPartI && !fscFull);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProgram) return setMsg({ type: 'error', text: 'Please select a program' });
    if (!paymentMethod) return setMsg({ type: 'error', text: 'Please select a payment method' });

    // Validate proof depending on method
    if (paymentMethod === 'BANK_TRANSFER') {
      if (bankAccounts.length > 0 && !selectedBankId) {
        return setMsg({ type: 'error', text: 'Please select a university bank for the bank transfer' });
      }
      if (!receipt) return setMsg({ type: 'error', text: 'Please upload the bank deposit slip' });
    } else if (paymentMethod === 'BANK_GATEWAY') {
      if (!txnId.trim() && !receipt) return setMsg({ type: 'error', text: 'Enter the gateway transaction id or upload receipt' });
    } else if (paymentMethod === 'ONEBILL_VOUCHER') {
      if (!txnId.trim() && !receipt) return setMsg({ type: 'error', text: 'Enter 1Bill voucher reference or upload receipt' });
    }
    if (receipt && receipt.size > 2 * 1024 * 1024) return setMsg({ type: 'error', text: 'File must be < 2 MB' });

    setSubmitting(true);
    setMsg({ type: '', text: '' });
    try {
      const fd = new FormData();
      fd.append('programId', selectedProgram);
      fd.append('paymentMethod', paymentMethod);
      if (paymentMethod === 'BANK_TRANSFER' && selectedBankId) {
        fd.append('bankAccountId', selectedBankId);
      }
      if (txnId.trim()) fd.append('txnId', txnId.trim());
      if (receipt) fd.append('feeReceipt', receipt);

      const res = await api.post('/applications/apply', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const isAwaited = res.data?.application?.status === 'RESULT_AWAITED' || res.data?.application?.resultStatus === 'Waiting';
      setMsg({
        type: 'success',
        text: isAwaited
          ? 'Application submitted with status Result Awaited. The Director will review once your final result is uploaded.'
          : 'Application submitted successfully! Director will review.',
      });
      setShowForm(false);
      setReceipt(null);
      setSelectedProgram('');
      setTxnId('');
      setSelectedBankId('');
      loadAll();
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to submit application' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmit = async (appId) => {
    try {
      setMsg({ type: '', text: '' });
      await api.put(`/applications/${appId}/resubmit`);
      setMsg({ type: 'success', text: 'Application resubmitted successfully!' });
      loadAll();
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to resubmit.' });
    }
  };

  const handleUpdateResult = async (appId) => {
    try {
      setMsg({ type: '', text: '' });
      await api.put(`/applications/${appId}/update-result`);
      setMsg({ type: 'success', text: 'Final result submitted! Director will resume processing.' });
      loadAll();
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update result.' });
    }
  };

  const startAppeal = (app) => {
    let subject = 'Appeal Request';
    let appealType = 'GENERAL';
    if (app.status === 'REJECTED') {
      subject = 'Appeal Against Application Rejection';
      appealType = 'APPLICATION_REJECTION';
    } else if (app.status === 'DISQUALIFIED') {
      subject = 'Appeal Against Interview Disqualification';
      appealType = 'INTERVIEW_DISQUALIFICATION';
    }
    setAppealForm(prev => ({ ...prev, [app.id]: { subject, message: '', file: null, appealType } }));
    setAppealOpen(prev => ({ ...prev, [app.id]: true }));
  };

  const submitAppeal = async (app) => {
    const data = appealForm[app.id];
    if (!data || !data.message.trim()) {
      return setMsg({ type: 'error', text: 'Please write your appeal explanation' });
    }
    setSubmittingAppeal(prev => ({ ...prev, [app.id]: true }));
    try {
      const fd = new FormData();
      fd.append('applicationId', app.id);
      fd.append('appealType', data.appealType);
      fd.append('subject', data.subject);
      fd.append('message', data.message);
      if (data.file) fd.append('proof', data.file);
      await api.post('/appeals', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg({ type: 'success', text: 'Appeal submitted successfully and is under review.' });
      setAppealOpen(prev => ({ ...prev, [app.id]: false }));
      setAppealForm(prev => ({ ...prev, [app.id]: null }));
      loadAll();
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to submit appeal' });
    } finally {
      setSubmittingAppeal(prev => ({ ...prev, [app.id]: false }));
    }
  };

  // ----------------------------------------------------------------
  // Compute backend base URL (port 5000 on sandbox / dev)
  // ----------------------------------------------------------------
  const backendBase = () => {
    const host = window.location.host;
    if (host.startsWith('3000-')) {
      return `${window.location.protocol}//${host.replace(/^3000-/, '5000-')}`;
    }
    return window.location.origin.replace(/:3000$/, ':5000');
  };

  const downloadPdf = async (appId) => {
    try {
      const token = localStorage.getItem('token');
      const url = `${backendBase()}/print-application/${appId}?token=${encodeURIComponent(token || '')}`;
      const win = window.open(url, '_blank');
      if (!win) {
        setMsg({ type: 'error', text: 'Pop-up blocked. Please allow pop-ups to view the printable form.' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to open print view' });
    }
  };

  // ----------------------------------------------------------------
  // Download complete admission package as ZIP (form + all uploaded docs).
  // The ZIP is streamed by the backend; we trigger an anchor download.
  // ----------------------------------------------------------------
  const downloadZipPackage = async (appId) => {
    try {
      const token = localStorage.getItem('token');
      const url = `${backendBase()}/admission-package/${appId}?token=${encodeURIComponent(token || '')}`;
      // Use a hidden anchor so the browser preserves the streamed filename
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener noreferrer';
      a.target = '_self';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 1500);
      setMsg({ type: 'success', text: 'Preparing your admission package — your download will start shortly.' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Failed to start admission package download' });
    }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  const eligibility = canApply();
  const willAwait = willBeResultAwaited();

  return (
    <div>
      <h2 className="section-title">Applications</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Admission cycle banner */}
      <div className="card">
        <div className="card-header">Admission Cycle</div>
        {cycle ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <p style={{ fontWeight: 700, color: '#1a2744', fontSize: '1.05rem', marginBottom: '4px' }}>{cycle.title}</p>
                <p style={{ color: '#64748b', fontSize: '0.88rem' }}>{cycle.startDate} — {cycle.endDate}</p>
              </div>
              <span className={`badge badge-${cycle.isOpen ? 'open' : 'closed'}`} style={{
                padding: '4px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600,
                background: cycle.isOpen ? '#dcfce7' : '#fee2e2', color: cycle.isOpen ? '#166534' : '#991b1b',
              }}>
                {cycle.isOpen ? 'Admissions Open' : 'Closed'}
              </span>
            </div>
            <div className="stats-grid" style={{ marginTop: '1rem' }}>
              <div className="stat-card">
                <div className="stat-value" style={{ fontSize: '1.1rem' }}>PKR {procFee}</div>
                <div className="stat-label">Processing Fee</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ fontSize: '1.1rem' }}>{cycle.minMarksPercent}%</div>
                <div className="stat-label">Min Marks (FSc)</div>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: '#718096' }}>No active admission cycle at this time.</p>
        )}
      </div>

      {/* My applications */}
      {applications.length > 0 && (
        <div className="card">
          <div className="card-header">Your Applications</div>
          {applications.map(app => {
            const isResultAwaited = app.status === 'RESULT_AWAITED' || app.resultStatus === 'Waiting';
            const interview = app.interview;
            const canAppeal = ['REJECTED', 'DISQUALIFIED'].includes(app.status) && app.lastAppealStatus !== 'PENDING';

            return (
              <div key={app.id} style={{
                marginBottom: '1.25rem', padding: '1rem',
                border: '1px solid #e2e8f0', borderRadius: 10, background: '#fafbfc',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <div>
                    <p style={{ fontWeight: 700, color: '#1a2744', margin: 0 }}>
                      #{app.id} — {app.program?.name}
                    </p>
                    <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '2px 0 0 0' }}>
                      Submitted: {new Date(app.submittedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <StatusBadge status={app.status} />
                    {isResultAwaited && app.status !== 'RESULT_AWAITED' && <StatusBadge status="RESULT_AWAITED" />}
                    {/* §2.1 Show Not Eligible once the Initial Merit List is published. */}
                    {app.interviewEligibility === 'NOT_ELIGIBLE'
                      && app.admissionCycle?.initialMeritPublished
                      && !['ENROLLED', 'REJECTED', 'DISQUALIFIED'].includes(app.status)
                      && <StatusBadge status="NOT_ELIGIBLE" />}
                    {app.lastAppealStatus === 'PENDING' && <StatusBadge status="APPEAL_SUBMITTED" />}
                  </div>
                </div>

                <ProgressTracker application={app} />

                {/* Director rejection reason */}
                {app.status === 'REJECTED' && (app.rejectionReason || app.adminRemarks) && (
                  <div className="alert" style={{ background: '#fef2f2', borderLeft: '3px solid #dc2626', color: '#991b1b', marginBottom: 8 }}>
                    <strong>Rejection Reason:</strong> {app.rejectionReason || app.adminRemarks}
                  </div>
                )}

                {/* Disqualified reason */}
                {app.status === 'DISQUALIFIED' && interview?.remarks && (
                  <div className="alert" style={{ background: '#fef2f2', borderLeft: '3px solid #dc2626', color: '#991b1b', marginBottom: 8 }}>
                    <strong>Disqualified in Interview:</strong> {interview.remarks}
                  </div>
                )}

                {/* Director remarks (non-rejection) */}
                {app.adminRemarks && app.status !== 'REJECTED' && (
                  <div className="alert" style={{ background: '#fffbeb', borderLeft: '3px solid #f59e0b', color: '#92400e', marginBottom: 8, fontSize: '0.85rem' }}>
                    <strong>Director's Remarks:</strong> {app.adminRemarks}
                  </div>
                )}

                {/* Interview info */}
                {interview && (() => {
                  // Detect "retake pending" — appeal was accepted and the
                  // app has been moved back to FORWARDED, but the previous
                  // interview row still carries the DISQUALIFIED decision.
                  // In this case we should NOT mislead the student with a
                  // "Disqualified" badge; show "Retake Pending" instead.
                  const acceptedInterviewAppeal = (app.appeals || []).find(
                    x => x.appealType === 'INTERVIEW_DISQUALIFICATION' && x.status === 'ACCEPTED'
                  );
                  const isRetakePending = !!acceptedInterviewAppeal
                    && interview.decision === 'DISQUALIFIED'
                    && (app.status === 'FORWARDED' || app.status === 'UNDER_REVIEW');
                  return (
                    <div style={{
                      background: isRetakePending ? '#fef3c7' : '#f0f9ff',
                      borderLeft: `3px solid ${isRetakePending ? '#f59e0b' : '#0ea5e9'}`,
                      padding: 10, borderRadius: 6, fontSize: '0.85rem', marginBottom: 8,
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        <i className="fas fa-calendar-check" style={{ marginRight: 6 }}></i>
                        {isRetakePending
                          ? 'Retake Interview Pending — Coordinator will reschedule'
                          : interview.status === 'COMPLETED' ? 'Interview Completed' : 'Interview Scheduled'}
                      </div>
                      <div>📅 {interview.scheduledDate} at {interview.scheduledTime}</div>
                      <div>📍 Venue: {interview.venue || 'AUST Campus'}</div>
                      {interview.meetingLink && (
                        <div>
                          🔗 Meeting Link:{' '}
                          <a href={interview.meetingLink} target="_blank" rel="noopener noreferrer"
                             style={{ color: '#0ea5e9', textDecoration: 'underline', wordBreak: 'break-all' }}>
                            {interview.meetingLink}
                          </a>
                        </div>
                      )}
                      {interview.decision === 'QUALIFIED' && interview.marks !== null && (
                        <div style={{ marginTop: 4, color: '#166534', fontWeight: 600 }}>
                          ✓ Qualified — Marks: {interview.marks}/100
                        </div>
                      )}
                      {interview.decision === 'DISQUALIFIED' && !isRetakePending && (
                        <div style={{ marginTop: 4, color: '#991b1b', fontWeight: 600 }}>
                          ✗ Disqualified
                        </div>
                      )}
                      {isRetakePending && (
                        <div style={{
                          marginTop: 6, padding: 6, background: 'white',
                          borderRadius: 4, color: '#92400e', fontSize: '0.8rem',
                        }}>
                          <i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>
                          Your interview-disqualification appeal was <strong>accepted</strong>. The Coordinator will schedule a new interview shortly — previous interview details are kept above for reference only.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Appeal history — modernised tracker */}
                {app.appeals && app.appeals.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{
                      fontSize: '0.82rem', fontWeight: 700, color: '#0f172a',
                      marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <i className="fas fa-gavel" style={{ color: '#7c3aed' }}></i>
                      Appeal History ({app.appeals.length})
                    </div>
                    {app.appeals.map(a => {
                      const statusKey = a.status === 'ACCEPTED' ? 'APPEAL_ACCEPTED'
                                      : a.status === 'REJECTED' ? 'APPEAL_REJECTED'
                                      : 'APPEAL_PENDING';
                      const accent = a.status === 'ACCEPTED' ? '#10b981'
                                   : a.status === 'REJECTED' ? '#ef4444'
                                   : '#f59e0b';
                      return (
                        <div key={a.id} style={{
                          marginTop: 6, padding: 10, paddingLeft: 14,
                          background: a.status === 'ACCEPTED' ? '#f0fdf4' : a.status === 'REJECTED' ? '#fef2f2' : '#fef9c3',
                          borderRadius: 8, borderLeft: `4px solid ${accent}`,
                          fontSize: '0.85rem',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{a.subject}</div>
                              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                                Submitted {new Date(a.createdAt).toLocaleString()}
                                {a.decidedAt && <> · Decided {new Date(a.decidedAt).toLocaleString()} by {a.decidedBy || 'reviewer'}</>}
                              </div>
                            </div>
                            <StatusBadge status={statusKey} size="sm" />
                          </div>
                          <div style={{ color: '#475569', marginTop: 6, whiteSpace: 'pre-wrap' }}>{a.message}</div>
                          {a.adminResponse && (
                            <div style={{
                              marginTop: 8, padding: 8, background: 'white', borderRadius: 6,
                              borderLeft: `3px solid ${accent}`,
                            }}>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: accent, textTransform: 'uppercase', marginBottom: 4 }}>
                                Reviewer's Response
                              </div>
                              <div style={{ color: '#0f172a', whiteSpace: 'pre-wrap' }}>{a.adminResponse}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {app.status === 'NEED_INFO' && (
                    <button className="btn btn-sm" style={{ background: '#f59e0b', color: 'white', border: 0 }} onClick={() => handleResubmit(app.id)}>
                      Resubmit
                    </button>
                  )}
                  {isResultAwaited && (
                    <button className="btn btn-sm btn-primary" onClick={() => handleUpdateResult(app.id)}>
                      Update Final Result
                    </button>
                  )}
                  {/* §1.2(c) — takes the student straight to the Education Record module */}
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={goToEducationRecord}
                    title="Open the Education Record module to add or update your qualifications"
                  >
                    <i className="fas fa-graduation-cap" style={{ marginRight: 4 }}></i> Update Record
                  </button>
                  {canAppeal && !appealOpen[app.id] && (
                    <button
                      className="btn btn-sm"
                      style={{
                        background: 'linear-gradient(90deg, #7c3aed 0%, #6d28d9 100%)',
                        color: 'white',
                        border: 0,
                        fontWeight: 600,
                        boxShadow: '0 2px 6px rgba(124,58,237,0.3)',
                      }}
                      onClick={() => startAppeal(app)}
                      title={app.status === 'DISQUALIFIED'
                        ? 'Submit an appeal — will be reviewed by the Coordinator'
                        : 'Submit an appeal — will be reviewed by the Director'}>
                      <i className="fas fa-gavel" style={{ marginRight: 6 }}></i>
                      {app.status === 'DISQUALIFIED' ? 'Appeal Interview Decision' : 'Submit Appeal'}
                    </button>
                  )}
                  <button className="btn btn-sm btn-outline" onClick={() => setExpanded(prev => ({ ...prev, [app.id]: !prev[app.id] }))}>
                    {expanded[app.id] ? 'Hide Timeline' : 'View Timeline'}
                  </button>
                  <button className="btn btn-sm btn-outline" onClick={() => downloadPdf(app.id)} title="Open printable admission form (Print → Save as PDF)">
                    <i className="fas fa-file-pdf" style={{ marginRight: 4 }}></i> View / Print Form
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: '#047857', color: 'white', border: 0 }}
                    onClick={() => downloadZipPackage(app.id)}
                    title="Download complete admission package (Form + Photo + CNIC + All Documents)"
                  >
                    <i className="fas fa-file-archive" style={{ marginRight: 4 }}></i> Download Full Package (ZIP)
                  </button>
                </div>

                {/* Modern Appeal Modal */}
                {appealOpen[app.id] && (
                  <div
                    onClick={(e) => { if (e.target === e.currentTarget) setAppealOpen(prev => ({ ...prev, [app.id]: false })); }}
                    style={{
                      position: 'fixed', inset: 0, zIndex: 9999,
                      background: 'rgba(15,23,42,0.65)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '1rem',
                      animation: 'fadeIn 0.2s ease-out',
                    }}
                  >
                    <div style={{
                      background: 'white', borderRadius: 14,
                      maxWidth: 600, width: '100%', maxHeight: '90vh', overflow: 'auto',
                      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    }}>
                      {/* Header */}
                      <div style={{
                        background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                        color: 'white', padding: '1.1rem 1.4rem',
                        borderRadius: '14px 14px 0 0',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                            <i className="fas fa-gavel" style={{ marginRight: 8 }}></i>
                            {app.status === 'DISQUALIFIED' ? 'Appeal Interview Decision' : 'Submit Appeal'}
                          </h3>
                          <div style={{ fontSize: '0.78rem', opacity: 0.9, marginTop: 4 }}>
                            Application #{app.id} — {app.program?.name}
                          </div>
                        </div>
                        <button
                          onClick={() => setAppealOpen(prev => ({ ...prev, [app.id]: false }))}
                          style={{
                            background: 'rgba(255,255,255,0.18)', color: 'white',
                            border: 0, borderRadius: 6, width: 32, height: 32,
                            cursor: 'pointer', fontSize: '1.1rem',
                          }}
                          aria-label="Close"
                        >×</button>
                      </div>

                      {/* Routing info banner */}
                      <div style={{
                        background: app.status === 'DISQUALIFIED' ? '#eff6ff' : '#fef3c7',
                        borderLeft: `4px solid ${app.status === 'DISQUALIFIED' ? '#3b82f6' : '#f59e0b'}`,
                        padding: '0.75rem 1.4rem',
                        fontSize: '0.85rem',
                        color: app.status === 'DISQUALIFIED' ? '#1e40af' : '#92400e',
                      }}>
                        <i className={`fas ${app.status === 'DISQUALIFIED' ? 'fa-user-tie' : 'fa-shield-alt'}`} style={{ marginRight: 6 }}></i>
                        Your appeal will be reviewed by the{' '}
                        <strong>{app.status === 'DISQUALIFIED' ? 'Admissions Coordinator' : 'Director of Admissions'}</strong>.
                        {app.status === 'DISQUALIFIED' && ' If accepted, a retake interview will be scheduled.'}
                      </div>

                      {/* Form body */}
                      <div style={{ padding: '1.2rem 1.4rem' }}>
                        <div className="form-group" style={{ marginBottom: 14 }}>
                          <label style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>Subject</label>
                          <input
                            value={appealForm[app.id]?.subject || ''}
                            onChange={e => setAppealForm(prev => ({ ...prev, [app.id]: { ...prev[app.id], subject: e.target.value } }))}
                            style={{ marginTop: 4 }}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 14 }}>
                          <label style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>
                            Explanation <span className="required">*</span>
                          </label>
                          <textarea
                            rows={5}
                            value={appealForm[app.id]?.message || ''}
                            onChange={e => setAppealForm(prev => ({ ...prev, [app.id]: { ...prev[app.id], message: e.target.value } }))}
                            placeholder="Please explain in detail why your application should be reconsidered. Include any new information, clarifications, or supporting context that should be reviewed..."
                            style={{ marginTop: 4, resize: 'vertical' }}
                          />
                          <small style={{ color: '#64748b', fontSize: '0.75rem' }}>
                            Be clear and respectful. Your message will be visible to the reviewer.
                          </small>
                        </div>
                        <div className="form-group" style={{ marginBottom: 14 }}>
                          <label style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>
                            <i className="fas fa-paperclip" style={{ marginRight: 4 }}></i>
                            Supporting Document (optional)
                          </label>
                          <input
                            type="file" accept="image/*,.pdf"
                            onChange={e => setAppealForm(prev => ({ ...prev, [app.id]: { ...prev[app.id], file: e.target.files[0] } }))}
                            style={{ marginTop: 4 }}
                          />
                          <small style={{ color: '#64748b', fontSize: '0.75rem' }}>
                            Image or PDF only (max 5 MB). E.g. medical certificate, evidence document.
                          </small>
                        </div>
                      </div>

                      {/* Footer */}
                      <div style={{
                        padding: '0.9rem 1.4rem', borderTop: '1px solid #e2e8f0',
                        background: '#f8fafc', borderRadius: '0 0 14px 14px',
                        display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap',
                      }}>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => setAppealOpen(prev => ({ ...prev, [app.id]: false }))}>
                          Cancel
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={submittingAppeal[app.id]}
                          onClick={() => submitAppeal(app)}
                          style={{
                            background: 'linear-gradient(90deg, #7c3aed 0%, #6d28d9 100%)',
                            color: 'white', border: 0, fontWeight: 600,
                            opacity: submittingAppeal[app.id] ? 0.7 : 1,
                          }}
                        >
                          {submittingAppeal[app.id] ? (
                            <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, marginRight: 6 }}></span>Submitting…</>
                          ) : (
                            <><i className="fas fa-paper-plane" style={{ marginRight: 6 }}></i>Submit Appeal</>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timeline */}
                {expanded[app.id] && (
                  <div style={{ marginTop: 10, padding: 10, background: 'white', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <h4 style={{ marginTop: 0, marginBottom: 10, fontSize: '0.9rem', color: '#0f172a' }}>Application Timeline</h4>
                    <StatusTimeline events={app.statusEvents || []} />
                  </div>
                )}

                {app.status === 'ENROLLED' && (
                  <div className="alert alert-success" style={{ marginTop: 8, marginBottom: 0 }}>
                    <i className="fas fa-graduation-cap" style={{ marginRight: 6 }}></i>
                    <strong>Congratulations — you are officially enrolled.</strong> Open the <strong>Enrollment</strong> tab to view your roll number, registration number, and LMS credentials.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Submit new application */}
      {!showForm ? (
        <div>
          {eligibility.ok ? (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Submit New Application</button>
          ) : (
            <div className="alert alert-warning">{eligibility.reason}</div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="card-header">New Application</div>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Select Program <span className="required">*</span></label>
                <select value={selectedProgram} onChange={e => setSelectedProgram(e.target.value)} required disabled={programs.length === 0}>
                  <option value="">{programs.length === 0 ? 'No programs are currently announced' : 'Choose a program'}</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code}) — {p.duration}, {p.semesters} semesters</option>
                  ))}
                </select>
                {programs.length === 0 && (
                  <p style={{ marginTop: 6, fontSize: '0.82rem', color: '#b45309' }}>
                    Only programs announced in the current admission cycle can be selected. None are open right now.
                  </p>
                )}
              </div>
            </div>

            {willAwait && (
              <div style={{ marginTop: '0.5rem', padding: '0.85rem 1rem', background: '#fef3c7', borderRadius: 6, color: '#92400e', fontSize: '0.88rem' }}>
                <i className="fas fa-hourglass-half" style={{ marginRight: 6 }}></i>
                <strong>Note:</strong> Based on your education records, this application will be submitted with status <strong>Result Awaited</strong>. You can update the final result later.
              </div>
            )}

            {/* PAYMENT METHODS */}
            <div className="card-header" style={{ marginTop: 14, marginBottom: 8, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
              Application Processing Fee — PKR {procFee}
            </div>
            {paymentMethods.length === 0 ? (
              <div className="alert alert-warning"><i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }}></i>No payment methods are currently configured. Please contact the Admissions Office or check back shortly.</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {paymentMethods.map(m => (
                    <button
                      key={m.code}
                      type="button"
                      onClick={() => { setPaymentMethod(m.code); setReceipt(null); setTxnId(''); setSelectedBankId(''); }}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: paymentMethod === m.code ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                        background: paymentMethod === m.code ? '#dbeafe' : 'white',
                        color: paymentMethod === m.code ? '#1e40af' : '#475569',
                        fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {paymentMethod && (() => {
                  const m = paymentMethods.find(x => x.code === paymentMethod);
                  if (!m) return null;
                  return (
                    <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>
                        <i className="fas fa-info-circle" style={{ marginRight: 6, color: '#0ea5e9' }}></i>
                        {m.instructions}
                      </p>
                      {m.code === 'BANK_TRANSFER' && bankAccounts.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                            Select University Bank <span style={{ color: '#dc2626' }}>*</span>
                          </label>
                          <select
                            value={selectedBankId}
                            onChange={e => setSelectedBankId(e.target.value)}
                            style={{
                              width: '100%', padding: '8px 10px', borderRadius: 6,
                              border: '1px solid #cbd5e1', background: 'white', fontSize: '0.9rem',
                            }}
                          >
                            <option value="">-- Choose a bank --</option>
                            {bankAccounts.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.bankName}{b.accountTitle ? ` — ${b.accountTitle}` : ''}
                              </option>
                            ))}
                          </select>
                          {selectedBankId && (() => {
                            const sb = bankAccounts.find(b => String(b.id) === String(selectedBankId));
                            if (!sb) return null;
                            return (
                              <div style={{
                                marginTop: 10, padding: 10, background: 'white', borderRadius: 6,
                                fontSize: '0.85rem', border: '1px solid #93c5fd',
                              }}>
                                <div><strong>Bank Name:</strong> {sb.bankName}</div>
                                <div><strong>Account Title:</strong> {sb.accountTitle}</div>
                                <div style={{ fontFamily: 'monospace' }}><strong>IBAN:</strong> {sb.iban}</div>
                                {sb.branchCode && <div><strong>Branch Code:</strong> {sb.branchCode}</div>}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      {m.code === 'BANK_GATEWAY' && (
                        <div style={{ marginTop: 8, fontSize: '0.85rem' }}>
                          <i className="fas fa-shield-alt" style={{ marginRight: 6, color: '#059669' }}></i>
                          Secure online payment via the bank payment gateway.
                        </div>
                      )}
                      {m.code === 'ONEBILL_VOUCHER' && (
                        <div style={{ marginTop: 8, fontSize: '0.85rem' }}>
                          <strong>Company Code:</strong> {m.companyCode} &nbsp;
                          <strong>Consumer #:</strong> {m.consumerNumber}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Proof inputs */}
                <div className="form-grid">
                  {paymentMethod !== 'BANK_TRANSFER' && (
                    <div className="form-group">
                      <label>Transaction / Voucher Reference</label>
                      <input
                        value={txnId}
                        onChange={e => setTxnId(e.target.value)}
                        placeholder={paymentMethod === 'BANK_GATEWAY' ? 'Gateway Transaction ID' : '1Bill Reference'}
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>
                      Receipt / Slip {paymentMethod === 'BANK_TRANSFER' ? <span className="required">*</span> : '(optional)'}
                    </label>
                    <input type="file" accept="image/*,.pdf" onChange={e => setReceipt(e.target.files[0])} />
                    <small style={{ color: '#94a3b8' }}>Max 2 MB · PDF or Image</small>
                  </div>
                </div>
              </>
            )}

            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setReceipt(null); setTxnId(''); setSelectedBankId(''); }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ApplicationSection;

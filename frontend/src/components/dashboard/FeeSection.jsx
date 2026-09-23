import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';

const FeeSection = () => {
  const [announcement, setAnnouncement] = useState(null);
  // Map of applicationId → fee-management response { announced, eligible, fee }
  const [programFees, setProgramFees] = useState({});
  const [payments, setPayments] = useState([]);
  const [applications, setApplications] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [paymentConfig, setPaymentConfig] = useState({ enabled: false });
  const [bankAccounts, setBankAccounts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedApp, setSelectedApp] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_GATEWAY'); // BANK_GATEWAY | BANK
  const [selectedBankId, setSelectedBankId] = useState(''); // selected university bank for Bank Transfer
  const [receipt, setReceipt] = useState(null);
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [annRes, payRes, appRes, txnRes, cfgRes, pmRes] = await Promise.all([
        api.get('/fee/announcement').catch(() => ({ data: { announcement: null } })),
        api.get('/fee/my-payments').catch(() => ({ data: { payments: [] } })),
        api.get('/applications').catch(() => ({ data: { applications: [] } })),
        api.get('/payments/transactions').catch(() => ({ data: { transactions: [] } })),
        api.get('/payments/config').catch(() => ({ data: { enabled: false } })),
        api.get('/payment-methods/public').catch(() => ({ data: { methods: [], bankAccounts: [] } })),
      ]);
      setAnnouncement(annRes.data.announcement);
      setPayments(payRes.data.payments || []);
      const apps = appRes.data.applications || [];
      setApplications(apps);
      setTransactions(txnRes.data.transactions || []);
      setPaymentConfig(cfgRes.data || { enabled: false });
      setPaymentMethods(pmRes.data.methods || []);
      setBankAccounts(pmRes.data.bankAccounts || []);

      // Fetch the per-program semester fee (Fix 3) for any application that has
      // reached the merit/fee stage. The backend only returns details to
      // students who are actually on the finalized merit list.
      const meritApps = apps.filter((a) =>
        (a.meritEntry && a.meritEntry.isFinalized) ||
        ['SELECTED', 'QUALIFIED', 'FEE_PENDING', 'FEE_PAID', 'FEE_APPROVED', 'ENROLLED'].includes(a.status)
      );
      const feeEntries = await Promise.all(meritApps.map(async (a) => {
        try {
          const r = await api.get(`/fee-management/${a.admissionCycleId}/${a.programId}`);
          return [a.id, r.data];
        } catch {
          return [a.id, { announced: false, eligible: false, fee: null }];
        }
      }));
      setProgramFees(Object.fromEntries(feeEntries));
    } catch {} finally { setLoading(false); }
  }, []);

  // Real-time refresh: poll every 20s + on focus to keep fee status / payment
  // status synchronized with director approval actions.
  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 20000);
    const onFocus = () => loadAll();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [loadAll]);

  const handleGatewayPay = async (e) => {
    e.preventDefault();
    if (!selectedApp) return setMsg({ type: 'error', text: 'Please select an application' });
    setPaying(true);
    setMsg({ type: '', text: '' });
    try {
      const res = await api.post('/payments/gateway/admission-fee', {
        applicationId: parseInt(selectedApp),
        payerName: payerName || undefined,
        payerPhone: payerPhone || undefined,
      });
      // Hosted-checkout redirect (live bank gateway).
      if (res.data.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
        return;
      }
      setMsg({
        type: 'success',
        text: `Payment recorded! Transaction ID: ${res.data.txnId}. The Director will confirm shortly.`,
      });
      setPayerName('');
      setPayerPhone('');
      setSelectedApp('');
      loadAll();
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Payment failed' });
    } finally { setPaying(false); }
  };

  const handleBankPay = async (e) => {
    e.preventDefault();
    if (!selectedApp) return setMsg({ type: 'error', text: 'Please select an application' });
    if (bankAccounts.length > 0 && !selectedBankId) {
      return setMsg({ type: 'error', text: 'Please select the university bank you deposited the fee into' });
    }
    if (!receipt) return setMsg({ type: 'error', text: 'Please upload fee receipt' });
    if (receipt.size > 2 * 1024 * 1024) return setMsg({ type: 'error', text: 'File size must be less than 2 MB' });
    setSubmitting(true);
    setMsg({ type: '', text: '' });
    try {
      const fd = new FormData();
      fd.append('applicationId', selectedApp);
      fd.append('paymentMethod', 'BANK_TRANSFER');
      if (selectedBankId) fd.append('bankAccountId', selectedBankId);
      fd.append('receipt', receipt);
      await api.post('/fee/pay', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg({ type: 'success', text: 'Fee receipt uploaded successfully. It is now pending confirmation by the Director.' });
      setReceipt(null);
      setSelectedApp('');
      setSelectedBankId('');
      loadAll();
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to upload receipt' });
    } finally { setSubmitting(false); }
  };

  // Selected university bank details (for display after dropdown selection)
  const selectedBank = bankAccounts.find(b => String(b.id) === String(selectedBankId));

  const handleRetry = async (txnId) => {
    setMsg({ type: '', text: '' });
    try {
      const res = await api.post(`/payments/retry/${txnId}`);
      setMsg({ type: 'success', text: `Retry successful! Transaction ID: ${res.data.transaction.txnId}` });
      loadAll();
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Retry failed' });
    }
  };

  // ============================================================
  // ENROLLMENT FEE GATING:
  //   • Application status must be FEE_PENDING
  //     (set automatically after Director finalizes the merit list).
  //   • Student's FSC% on the merit entry must be ≥ 45%.
  //   • Merit entry must be finalized (isFinalized = true).
  // Anything else → fee section stays hidden / disabled.
  // ============================================================
  const MIN_FSC_PERCENT = 45;

  const isEligibleApp = (a) => {
    if (a.status !== 'FEE_PENDING') return false;
    if (!a.meritEntry || !a.meritEntry.isFinalized) return false;
    if ((a.meritEntry.fscPercent || 0) < MIN_FSC_PERCENT) return false;
    return true;
  };

  const eligibleApps = applications.filter(isEligibleApp);
  const paidAppIds = payments.filter(p => p.status === 'APPROVED' || p.status === 'PENDING').map(p => p.applicationId);
  const unpaidEligible = eligibleApps.filter(a => !paidAppIds.includes(a.id));

  const hasSelectedApps = applications.some(a => a.status === 'SELECTED' || a.status === 'QUALIFIED');
  const hasFeeApproved = applications.some(a => a.status === 'FEE_APPROVED');
  const hasFeePaid = applications.some(a => a.status === 'FEE_PAID');

  // Section 6: the fee schedule is shown to a student ONLY once they appear on
  // a finalized merit list (or have already advanced past selection). Before
  // that, no fee details / voucher are revealed even if a cycle fee exists.
  const isOnMeritList = applications.some(a =>
    (a.meritEntry && a.meritEntry.isFinalized) ||
    ['SELECTED', 'QUALIFIED', 'FEE_PENDING', 'FEE_PAID', 'FEE_APPROVED', 'ENROLLED'].includes(a.status)
  );

  // Detect a student who is FEE_PENDING but blocked by the 45% rule
  const belowThresholdApps = applications.filter(a =>
    a.status === 'FEE_PENDING' &&
    a.meritEntry && (a.meritEntry.fscPercent || 0) < MIN_FSC_PERCENT
  );

  // ── Fix 3B: pick the most relevant merit-listed application + its announced fee ──
  // Prefer an application that can still pay (FEE_PENDING), then any merit-stage app.
  const meritStageApps = applications.filter((a) =>
    (a.meritEntry && a.meritEntry.isFinalized) ||
    ['SELECTED', 'QUALIFIED', 'FEE_PENDING', 'FEE_PAID', 'FEE_APPROVED', 'ENROLLED'].includes(a.status)
  );
  const feeDisplayApp =
    meritStageApps.find((a) => a.status === 'FEE_PENDING') ||
    meritStageApps.find((a) => programFees[a.id]?.announced) ||
    meritStageApps[0] ||
    null;
  const feeData = feeDisplayApp ? programFees[feeDisplayApp.id] : null;
  const announcedFee = feeData?.announced ? feeData.fee : null;

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  const admissionTxns = transactions.filter(t => t.purpose === 'ADMISSION_FEE');

  return (
    <div>
      <h2 className="section-title">Fee Management</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {hasFeeApproved && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.2rem' }}>✅</span>
          <div>
            <strong>Fee Confirmed!</strong> Your fee has been approved by the Director. You will be forwarded for enrollment shortly.
          </div>
        </div>
      )}

      {hasFeePaid && !hasFeeApproved && (
        <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.2rem' }}>⏳</span>
          <div>
            <strong>Payment Under Review</strong> — Your fee payment has been submitted and is pending confirmation by the Director.
          </div>
        </div>
      )}

      {/* ── Fix 3B: Semester fee display ──────────────────────
          The fee shown here comes from the Director's Fee Management entry for
          THIS student's program + cycle (NOT the application processing fee). */}
      {announcedFee ? (
        <div className="card">
          <div className="card-header">
            Semester / Enrollment Fee
            {feeDisplayApp?.program?.name && <span style={{ fontWeight: 400, fontSize: '0.85rem', color: '#64748b' }}> — {feeDisplayApp.program.name}</span>}
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Fee Item</th><th style={{ textAlign: 'right' }}>Amount (PKR)</th></tr></thead>
              <tbody>
                {announcedFee.lineItems.map((li, i) => (
                  <tr key={i}>
                    <td>{li.label}</td>
                    <td style={{ textAlign: 'right' }}>{Number(li.amount).toLocaleString()}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: '2px solid #e5e7eb' }}>
                  <td>Total</td>
                  <td style={{ textAlign: 'right', color: '#059669' }}>PKR {Number(announcedFee.totalAmount).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {bankAccounts.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '1rem' }}>
              <strong style={{ fontSize: '0.95rem' }}>Approved Bank Accounts:</strong>
              {bankAccounts.map((b) => (
                <div key={b.id} className="alert alert-info" style={{ marginBottom: 0 }}>
                  <strong>{b.bankName}</strong> — {b.accountTitle}<br />
                  IBAN: <strong>{b.iban}</strong>
                  {b.branchCode && <><br />Branch Code: <strong>{b.branchCode}</strong></>}
                </div>
              ))}
            </div>
          ) : (
            <div className="alert alert-warning" style={{ marginTop: '1rem', marginBottom: 0 }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }}></i>
              Bank account details have not been configured yet. Please contact the Admissions Office or check back shortly.
            </div>
          )}
        </div>
      ) : isOnMeritList ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <p style={{ fontWeight: 600, color: '#1a2744' }}>Fee details will be announced shortly. You will be notified.</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <p style={{ fontWeight: 600, color: '#1a2744' }}>No fee details available yet.</p>
            <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: 520, margin: '0.5rem auto 0' }}>
              The fee schedule will appear here <strong>only after you are selected in the finalized merit list</strong>. You will also receive an in-app and email notification when that happens.
            </p>
          </div>
        </div>
      )}

      {/* Payment History */}
      {payments.length > 0 && (
        <div className="card">
          <div className="card-header">Your Fee Payments</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Program</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Remarks</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td>#{p.applicationId}</td>
                    <td>{p.application?.program?.name}</td>
                    <td>PKR {p.amount}</td>
                    <td>{p.paymentMethod || 'BANK_DEPOSIT'}</td>
                    <td><span className={`badge badge-${(p.status || '').toLowerCase()}`}>{(p.status || '').replace('_', ' ')}</span></td>
                    <td>{p.adminRemarks || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction History (Bank Gateway) */}
      {admissionTxns.length > 0 && (
        <div className="card">
          <div className="card-header">Online Payment History (Admission)</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {admissionTxns.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '.78rem' }}>{t.txnId}</td>
                    <td>PKR {t.amount}</td>
                    <td>{t.mobileAccount || '-'}</td>
                    <td>
                      <span className={`badge badge-${(t.status || '').toLowerCase()}`}>{t.status}</span>
                      {t.isMock && <span style={{ fontSize: '.65rem', marginLeft: 4, color: '#6b7280' }}>(sandbox)</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td>
                      {t.status === 'FAILED' && (
                        <button className="btn btn-sm btn-secondary" onClick={() => handleRetry(t.id)}>Retry</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Below-threshold notice — student qualified merit but FSC < 45% */}
      {belowThresholdApps.length > 0 && (
        <div className="alert alert-warning" style={{ borderLeft: '3px solid #f59e0b' }}>
          <strong>Enrollment fee not available.</strong> Your FSc score
          {' '}({belowThresholdApps[0].meritEntry?.fscPercent?.toFixed(2)}%) is below the
          minimum {MIN_FSC_PERCENT}% required for final merit qualification.
        </div>
      )}

      {/* Pay Fee — ONLY when FEE_PENDING + finalized merit + FSC ≥ 45% */}
      {unpaidEligible.length > 0 && announcedFee ? (
        <div className="card">
          <div className="card-header">Pay Admission Fee</div>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
            You have been selected in the merit list. Choose a payment method below.
          </p>

          {/* Method tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {(paymentConfig.bankGateway?.enabled ?? true) && (
              <button
                type="button"
                className={`btn ${paymentMethod === 'BANK_GATEWAY' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPaymentMethod('BANK_GATEWAY')}
              >
                💳 {paymentConfig.bankGateway?.name || 'Bank Payment Gateway'} {paymentConfig.gatewayMode !== 'live' && <small style={{ opacity: .8 }}>(Test Mode)</small>}
              </button>
            )}
            <button
              type="button"
              className={`btn ${paymentMethod === 'BANK' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPaymentMethod('BANK')}
            >
              🏦 Bank Deposit (Receipt Upload)
            </button>
          </div>

          {paymentMethod === 'BANK_GATEWAY' && (paymentConfig.bankGateway?.enabled ?? true) && (
            <form onSubmit={handleGatewayPay}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Select Application <span className="required">*</span></label>
                  <select value={selectedApp} onChange={e => setSelectedApp(e.target.value)} required>
                    <option value="">Choose application</option>
                    {unpaidEligible.map(a => (
                      <option key={a.id} value={a.id}>#{a.id} — {a.program?.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Payer Name</label>
                  <input
                    type="text"
                    value={payerName}
                    onChange={e => setPayerName(e.target.value)}
                    placeholder="Name on the bank account"
                  />
                </div>
                <div className="form-group">
                  <label>Contact Phone</label>
                  <input
                    type="tel"
                    value={payerPhone}
                    onChange={e => setPayerPhone(e.target.value)}
                    placeholder="03xx-xxxxxxx"
                  />
                </div>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                You will be securely redirected to the bank's checkout page (when live). In test mode the payment is recorded instantly.
              </p>
              <div style={{ marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" disabled={paying}>
                  {paying ? (<><span className="spinner spinner-sm"></span> Processing…</>) : `Pay PKR ${Number(announcedFee.totalAmount).toLocaleString()} online`}
                </button>
              </div>
            </form>
          )}

          {paymentMethod === 'BANK' && (
            <form onSubmit={handleBankPay}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Select Application <span className="required">*</span></label>
                  <select value={selectedApp} onChange={e => setSelectedApp(e.target.value)} required>
                    <option value="">Choose application</option>
                    {unpaidEligible.map(a => (
                      <option key={a.id} value={a.id}>#{a.id} — {a.program?.name}</option>
                    ))}
                  </select>
                </div>

                {/* Bank Selection Dropdown — shown when Bank Transfer is selected */}
                {bankAccounts.length > 0 && (
                  <div className="form-group">
                    <label>Select University Bank <span className="required">*</span></label>
                    <select
                      value={selectedBankId}
                      onChange={e => setSelectedBankId(e.target.value)}
                      required
                    >
                      <option value="">— Choose the bank you deposited to —</option>
                      {bankAccounts.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.bankName} — {b.accountTitle}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label>Fee Receipt Screenshot <span className="required">*</span></label>
                  <input type="file" accept="image/*,.pdf" onChange={e => setReceipt(e.target.files[0])} required />
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Image or PDF, max 2 MB</span>
                </div>
              </div>

              {/* Selected bank details panel */}
              {selectedBank && (
                <div className="alert alert-info" style={{ marginTop: 10, marginBottom: 0 }}>
                  <div style={{ marginBottom: 4 }}><strong>Bank Name:</strong> {selectedBank.bankName}</div>
                  <div style={{ marginBottom: 4 }}><strong>Account Title:</strong> {selectedBank.accountTitle}</div>
                  <div style={{ marginBottom: 4, fontFamily: 'monospace' }}><strong>IBAN:</strong> {selectedBank.iban}</div>
                  {selectedBank.branchCode && (
                    <div style={{ fontSize: '0.85rem' }}><strong>Branch Code:</strong> {selectedBank.branchCode}</div>
                  )}
                </div>
              )}

              {bankAccounts.length === 0 && (
                <div className="alert alert-warning" style={{ marginTop: 10, marginBottom: 0 }}>
                  No university bank accounts are configured yet. Please contact the admissions office.
                </div>
              )}

              <div style={{ marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? (<><span className="spinner spinner-sm"></span> Uploading…</>) : 'Submit Fee Receipt'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        !hasFeeApproved && !hasFeePaid && eligibleApps.length === 0 && belowThresholdApps.length === 0 && (
          <div className="card">
            <div className="card-header">Fee Payment Status</div>
            {hasSelectedApps ? (
              <div className="alert alert-warning" style={{ marginBottom: 0 }}>
                Your application is in the merit pool but the merit list has not been finalized yet. Once the Director finalizes the merit list, and provided your FSc score is at least {MIN_FSC_PERCENT}%, you will be able to pay the enrollment fee here.
              </div>
            ) : (
              <div className="alert alert-info" style={{ marginBottom: 0 }}>
                Enrollment fee will be available <strong>only after</strong> you are selected in the finalized merit list (FSc ≥ {MIN_FSC_PERCENT}% required). Please complete the earlier steps of the admission process first.
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};

export default FeeSection;

// ============================================================
//  SUPER ADMIN — SYSTEM PAGES
//  Announcements, Security & Password Policy, Configuration,
//  Maintenance Mode, Audit Trail, Override Log.
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import {
  PageHeader, Breadcrumb, Badge, FormModal, ConfirmationModal, useToast, Skeleton,
} from '../components/ui';

/* ---------------- Announcements ---------------- */
export const Announcements = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [del, setDel] = useState(null);
  const [form, setForm] = useState({ title: '', content: '', targetSystem: 'ALL', targetRole: 'ALL', priority: 'normal' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await saApi.listAnnouncements(); setRows(data.announcements || []); }
    catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.title || !form.content) { toast.push('Title & content required', 'error'); return; }
    setBusy(true);
    try { await saApi.createAnnouncement(form); toast.push('Announcement posted', 'success'); setOpen(false); setForm({ title: '', content: '', targetSystem: 'ALL', targetRole: 'ALL', priority: 'normal' }); load(); }
    catch { toast.push('Failed', 'error'); } finally { setBusy(false); }
  };
  const remove = async () => { setBusy(true); try { await saApi.deleteAnnouncement(del.id); toast.push('Deleted', 'success'); setDel(null); load(); } catch { toast.push('Failed', 'error'); } finally { setBusy(false); } };

  const columns = [
    { key: 'title', header: 'Title', render: (r) => <strong>{r.title}</strong> },
    { key: 'targetSystem', header: 'System', render: (r) => <Badge color="blue">{r.targetSystem}</Badge> },
    { key: 'priority', header: 'Priority', render: (r) => <Badge color={r.priority === 'critical' ? 'red' : r.priority === 'high' ? 'amber' : 'gray'}>{r.priority}</Badge> },
    { key: 'isActive', header: 'Status', render: (r) => <Badge color={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'createdAt', header: 'Posted', render: (r) => new Date(r.createdAt).toLocaleDateString() },
    { key: '__actions', header: '', render: (r) => <button className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => setDel(r)}><i className="fas fa-trash" /></button>, tdStyle: { textAlign: 'right' } },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'System' }, { label: 'Announcements' }]} />
      <PageHeader title="System Announcements" subtitle="Broadcast notices across the platform."
        actions={<button className="sa-btn sa-btn-primary" onClick={() => setOpen(true)}><i className="fas fa-bullhorn" /> New Announcement</button>} />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="announcements" searchKeys={['title', 'priority']} emptyText="No announcements yet." />
      <FormModal open={open} title="New Announcement" submitLabel="Post" loading={busy} onClose={() => setOpen(false)} onSubmit={create} size="lg">
        <div className="sa-field"><label>Title</label><input className="sa-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="sa-field"><label>Content</label><textarea className="sa-textarea" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="sa-field"><label>Target System</label><select className="sa-select" value={form.targetSystem} onChange={(e) => setForm({ ...form, targetSystem: e.target.value })}><option value="ALL">All</option><option value="admissions">Admissions</option><option value="lms">LMS</option></select></div>
          <div className="sa-field"><label>Priority</label><select className="sa-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
        </div>
      </FormModal>
      <ConfirmationModal open={!!del} danger title="Delete announcement?" message={del?.title} confirmLabel="Delete" loading={busy} onClose={() => setDel(null)} onConfirm={remove} />
    </>
  );
};

/* ---------------- Security & password policy ---------------- */
export const Security = () => {
  const toast = useToast();
  const [policy, setPolicy] = useState(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  useEffect(() => { (async () => { try { const { data } = await saApi.getPasswordPolicy(); setPolicy(data.policy); } catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); } })(); }, []); // eslint-disable-line
  const save = async () => { setBusy(true); try { const { data } = await saApi.updatePasswordPolicy(policy); setPolicy(data.policy); toast.push('Policy saved', 'success'); } catch { toast.push('Failed', 'error'); } finally { setBusy(false); } };
  const bools = [['requireUppercase', 'Require uppercase letter'], ['requireLowercase', 'Require lowercase letter'], ['requireNumber', 'Require number'], ['requireSpecial', 'Require special character'], ['twoFactorEnabled', 'Two-factor authentication']];

  return (
    <>
      <Breadcrumb items={[{ label: 'System' }, { label: 'Security & Policy' }]} />
      <PageHeader title="Security & Password Policy" subtitle="System-wide authentication and password rules." />
      {loading ? <Skeleton h={300} /> : (
        <div className="sa-card sa-card-pad" style={{ maxWidth: 620 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="sa-field"><label>Minimum Length</label><input className="sa-input" type="number" value={policy.minLength} onChange={(e) => setPolicy({ ...policy, minLength: +e.target.value })} /></div>
            <div className="sa-field"><label>Max Failed Attempts</label><input className="sa-input" type="number" value={policy.maxFailedAttempts} onChange={(e) => setPolicy({ ...policy, maxFailedAttempts: +e.target.value })} /></div>
            <div className="sa-field"><label>Session Timeout (min)</label><input className="sa-input" type="number" value={policy.sessionTimeout} onChange={(e) => setPolicy({ ...policy, sessionTimeout: +e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0 18px' }}>
            {bools.map(([k, label]) => (
              <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5 }}>
                <input type="checkbox" checked={!!policy[k]} onChange={(e) => setPolicy({ ...policy, [k]: e.target.checked })} /> {label}
              </label>
            ))}
          </div>
          <button className="sa-btn sa-btn-primary" onClick={save} disabled={busy}><i className="fas fa-shield-halved" /> {busy ? 'Saving…' : 'Save Policy'}</button>
        </div>
      )}
    </>
  );
};

/* ---------------- Configuration (key/value) ---------------- */
export const Configuration = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ key: '', value: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await saApi.listConfig(); setRows(data.config || []); }
    catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.key) { toast.push('Key required', 'error'); return; }
    setBusy(true);
    try { await saApi.setConfig(form); toast.push('Saved', 'success'); setOpen(false); setForm({ key: '', value: '', description: '' }); load(); }
    catch { toast.push('Failed', 'error'); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'key', header: 'Key', render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.key}</strong> },
    { key: 'value', header: 'Value' },
    { key: 'description', header: 'Description' },
    { key: '__actions', header: '', render: (r) => <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => { setForm({ key: r.key, value: r.value || '', description: r.description || '' }); setOpen(true); }}><i className="fas fa-pen" /></button>, tdStyle: { textAlign: 'right' } },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'System' }, { label: 'Configuration' }]} />
      <PageHeader title="System Configuration" subtitle="Global key/value settings."
        actions={<button className="sa-btn sa-btn-primary" onClick={() => { setForm({ key: '', value: '', description: '' }); setOpen(true); }}><i className="fas fa-plus" /> Add Setting</button>} />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="config" searchKeys={['key', 'value', 'description']} emptyText="No configuration entries yet." />
      <FormModal open={open} title="Configuration Setting" submitLabel="Save" loading={busy} onClose={() => setOpen(false)} onSubmit={save}>
        <div className="sa-field"><label>Key</label><input className="sa-input" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /></div>
        <div className="sa-field"><label>Value</label><input className="sa-input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
        <div className="sa-field"><label>Description</label><input className="sa-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      </FormModal>
    </>
  );
};

/* ---------------- Maintenance mode ---------------- */
export const Maintenance = () => {
  const toast = useToast();
  const [m, setM] = useState(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  useEffect(() => { (async () => { try { const { data } = await saApi.getMaintenance(); setM(data.maintenance); } catch { toast.push('Failed', 'error'); } finally { setLoading(false); } })(); }, []); // eslint-disable-line
  const apply = async () => {
    setBusy(true);
    try { const { data } = await saApi.setMaintenance({ isEnabled: !m.isEnabled, message: m.message }); setM(data.maintenance); toast.push('Updated', 'success'); setConfirm(false); }
    catch { toast.push('Failed', 'error'); } finally { setBusy(false); }
  };
  return (
    <>
      <Breadcrumb items={[{ label: 'System' }, { label: 'Maintenance' }]} />
      <PageHeader title="Maintenance Mode" subtitle="Temporarily restrict access during system maintenance." />
      {loading ? <Skeleton h={200} /> : (
        <div className="sa-card sa-card-pad" style={{ maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Badge color={m.isEnabled ? 'red' : 'green'}>{m.isEnabled ? 'MAINTENANCE ON' : 'System Online'}</Badge>
          </div>
          <div className="sa-field"><label>Maintenance Message</label><textarea className="sa-textarea" value={m.message || ''} onChange={(e) => setM({ ...m, message: e.target.value })} placeholder="We'll be back shortly…" /></div>
          <button className={`sa-btn ${m.isEnabled ? 'sa-btn-primary' : 'sa-btn-danger'}`} onClick={() => setConfirm(true)}>
            <i className={`fas ${m.isEnabled ? 'fa-play' : 'fa-pause'}`} /> {m.isEnabled ? 'Disable Maintenance' : 'Enable Maintenance'}
          </button>
        </div>
      )}
      <ConfirmationModal open={confirm} danger={!m?.isEnabled} title={m?.isEnabled ? 'Disable maintenance mode?' : 'Enable maintenance mode?'}
        message={m?.isEnabled ? 'The system will be accessible to all users.' : 'Access may be restricted while maintenance is on.'}
        confirmLabel={m?.isEnabled ? 'Disable' : 'Enable'} loading={busy} onClose={() => setConfirm(false)} onConfirm={apply} />
    </>
  );
};

/* ---------------- Payment Gateway configuration (Phase 1 §5) ---------------- */
export const PaymentGateway = () => {
  const toast = useToast();
  const [g, setG] = useState(null);
  const [methods, setMethods] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await saApi.getPaymentGateway();
      setG(data.gateway);
      setMethods(data.methods);
    } catch { toast.push('Failed to load payment gateway config', 'error'); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setG((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        gatewayName: g.gatewayName,
        mode: g.mode,
        enabled: g.enabled,
        apiUrl: g.apiUrl,
        apiKey: g.apiKey,
        merchantId: g.merchantId,
        callbackUrl: g.callbackUrl,
        returnUrl: g.returnUrl,
        supportedFees: g.supportedFees,
        bankGatewayEnabled: methods ? methods.bankGatewayEnabled : undefined,
      };
      // Only send secrets when the admin actually typed a new one (the loaded
      // value is a masked placeholder — sending it back is a no-op on the API,
      // but we skip it to be explicit and avoid ever transmitting the mask).
      if (g.secretKey && !g.secretKey.startsWith('•')) payload.secretKey = g.secretKey;
      if (g.webhookSecret && !g.webhookSecret.startsWith('•')) payload.webhookSecret = g.webhookSecret;
      const { data } = await saApi.updatePaymentGateway(payload);
      setG(data.gateway);
      toast.push('Payment gateway configuration saved', 'success');
    } catch { toast.push('Failed to save configuration', 'error'); }
    finally { setBusy(false); }
  };

  const toggleMethod = (k) => setMethods((prev) => ({ ...prev, [k]: !prev[k] }));

  if (loading) return (<><Breadcrumb items={[{ label: 'System' }, { label: 'Payment Gateway' }]} /><PageHeader title="Payment Gateway" subtitle="Configure the bank payment gateway used for online fee collection." /><Skeleton h={420} /></>);

  const modeBadge = g.mode === 'live' ? 'green' : g.mode === 'manual' ? 'amber' : 'blue';
  const liveReady = g.mode === 'live' && g.apiUrl && g.apiKey && g.merchantId;

  return (
    <>
      <Breadcrumb items={[{ label: 'System' }, { label: 'Payment Gateway' }]} />
      <PageHeader
        title="Payment Gateway"
        subtitle="Configure the bank payment gateway used for online fee collection."
        actions={<button className="sa-btn sa-btn-primary" onClick={save} disabled={busy}><i className="fas fa-floppy-disk" /> {busy ? 'Saving…' : 'Save Configuration'}</button>}
      />

      <section className="sa-card sa-card-pad" style={{ maxWidth: 760, marginBottom: 20 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15 }}><i className="fas fa-building-columns" style={{ marginRight: 8, color: '#2563eb' }} />Bank Gateway</h3>
          <Badge color={modeBadge}>{(g.mode || 'sandbox').toUpperCase()}</Badge>
          <Badge color={g.enabled ? 'green' : 'gray'}>{g.enabled ? 'Enabled' : 'Disabled'}</Badge>
          {g.mode === 'live' && !liveReady && <Badge color="red">Missing live credentials</Badge>}
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="sa-field"><label>Gateway Name</label><input className="sa-input" value={g.gatewayName || ''} onChange={(e) => set('gatewayName', e.target.value)} placeholder="Bank Payment Gateway" /></div>
          <div className="sa-field">
            <label>Environment</label>
            <select className="sa-select" value={g.mode || 'sandbox'} onChange={(e) => set('mode', e.target.value)}>
              <option value="sandbox">Sandbox (test)</option>
              <option value="live">Live (production)</option>
              <option value="manual">Manual (offline)</option>
            </select>
          </div>
          <div className="sa-field" style={{ gridColumn: '1 / -1' }}><label>API Base URL</label><input className="sa-input" value={g.apiUrl || ''} onChange={(e) => set('apiUrl', e.target.value)} placeholder="https://api.yourbank.com/v1" /></div>
          <div className="sa-field"><label>Merchant ID</label><input className="sa-input" value={g.merchantId || ''} onChange={(e) => set('merchantId', e.target.value)} placeholder="MERCHANT-001" /></div>
          <div className="sa-field"><label>API Key</label><input className="sa-input" value={g.apiKey || ''} onChange={(e) => set('apiKey', e.target.value)} placeholder="pk_live_…" /></div>
          <div className="sa-field">
            <label>Secret Key {g.secretKeySet && <span style={{ color: '#16a34a', fontSize: 11 }}>(configured)</span>}</label>
            <input className="sa-input" type="password" value={g.secretKey || ''} onChange={(e) => set('secretKey', e.target.value)} placeholder={g.secretKeySet ? 'Leave blank to keep current' : 'sk_live_…'} autoComplete="new-password" />
          </div>
          <div className="sa-field">
            <label>Webhook Secret {g.webhookSecretSet && <span style={{ color: '#16a34a', fontSize: 11 }}>(configured)</span>}</label>
            <input className="sa-input" type="password" value={g.webhookSecret || ''} onChange={(e) => set('webhookSecret', e.target.value)} placeholder={g.webhookSecretSet ? 'Leave blank to keep current' : 'whsec_…'} autoComplete="new-password" />
          </div>
          <div className="sa-field" style={{ gridColumn: '1 / -1' }}><label>Callback / Webhook URL</label><input className="sa-input" value={g.callbackUrl || ''} onChange={(e) => set('callbackUrl', e.target.value)} placeholder="https://yourdomain.com/api/payments/webhook" /></div>
          <div className="sa-field" style={{ gridColumn: '1 / -1' }}><label>Return URL</label><input className="sa-input" value={g.returnUrl || ''} onChange={(e) => set('returnUrl', e.target.value)} placeholder="https://yourdomain.com/payment/return" /></div>
          <div className="sa-field" style={{ gridColumn: '1 / -1' }}><label>Supported Fees (CSV)</label><input className="sa-input" value={g.supportedFees || ''} onChange={(e) => set('supportedFees', e.target.value)} placeholder="PROCESSING_FEE,SEMESTER_FEE" /></div>
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, marginTop: 6 }}>
          <input type="checkbox" checked={!!g.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Gateway enabled
        </label>
      </section>

      {methods && (
        <section className="sa-card sa-card-pad" style={{ maxWidth: 760 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15 }}><i className="fas fa-credit-card" style={{ marginRight: 8, color: '#2563eb' }} />Payment Methods (student-facing)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5 }}>
              <input type="checkbox" checked={!!methods.bankGatewayEnabled} onChange={() => toggleMethod('bankGatewayEnabled')} /> Online Bank Gateway checkout
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, opacity: 0.75 }}>
              <input type="checkbox" checked={!!methods.bankTransferEnabled} disabled /> Bank Transfer (deposit slip) <span style={{ fontSize: 11, color: '#64748b' }}>— managed under Payment Methods</span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, opacity: 0.75 }}>
              <input type="checkbox" checked={!!methods.onebillEnabled} disabled /> 1Bill Voucher <span style={{ fontSize: 11, color: '#64748b' }}>— managed under Payment Methods</span>
            </label>
          </div>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>
            The online gateway toggle here is saved together with the gateway configuration. Bank transfer &amp; 1Bill toggles are shown for reference.
          </p>
        </section>
      )}
    </>
  );
};

/* ---------------- Audit trail ---------------- */
export const Audit = () => {
  const toast = useToast();
  const [tab, setTab] = useState('activity');
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => {
    setLoading(true);
    try {
      if (tab === 'activity') { const { data } = await saApi.activityLogs({ pageSize: 100 }); setRows(data.logs || []); }
      else if (tab === 'login') { const { data } = await saApi.auditTrail({ type: 'login', pageSize: 100 }); setRows(data.logins || []); }
      else { const { data } = await saApi.auditTrail({ type: 'override', pageSize: 100 }); setRows(data.overrides || []); }
    } catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); }
  })(); }, [tab]); // eslint-disable-line

  const cols = {
    activity: [
      { key: 'actorName', header: 'Actor' },
      { key: 'module', header: 'Module', render: (r) => <Badge color="blue">{r.module}</Badge> },
      { key: 'action', header: 'Action' },
      { key: 'description', header: 'Description' },
      { key: 'ipAddress', header: 'IP' },
      { key: 'createdAt', header: 'When', render: (r) => new Date(r.createdAt).toLocaleString() },
    ],
    login: [
      { key: 'username', header: 'User', render: (r) => r.username || r.email || r.identifier || '—' },
      { key: 'success', header: 'Result', render: (r) => <Badge color={r.success ? 'green' : 'red'}>{r.success ? 'Success' : 'Failed'}</Badge> },
      { key: 'ipAddress', header: 'IP', render: (r) => r.ipAddress || r.ip || '—' },
      { key: 'createdAt', header: 'When', render: (r) => new Date(r.createdAt).toLocaleString() },
    ],
    override: [
      { key: 'overriddenByName', header: 'By' },
      { key: 'targetModule', header: 'Module', render: (r) => <Badge color="amber">{r.targetModule}</Badge> },
      { key: 'action', header: 'Action' },
      { key: 'reason', header: 'Reason' },
      { key: 'createdAt', header: 'When', render: (r) => new Date(r.createdAt).toLocaleString() },
    ],
  };

  return (
    <>
      <Breadcrumb items={[{ label: 'System' }, { label: 'Audit Trail' }]} />
      <PageHeader title="Audit Trail" subtitle="Activity logs, login history and override records." />
      <div className="sa-tabs">
        <div className={`sa-tab ${tab === 'activity' ? 'active' : ''}`} onClick={() => setTab('activity')}>Activity Log</div>
        <div className={`sa-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>Login History</div>
        <div className={`sa-tab ${tab === 'override' ? 'active' : ''}`} onClick={() => setTab('override')}>Overrides</div>
      </div>
      <DataTable columns={cols[tab]} rows={rows} loading={loading} exportName={`audit-${tab}`} />
    </>
  );
};

/* ---------------- Override log ---------------- */
export const OverrideLog = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [pg, setPg] = useState(null); const [loading, setLoading] = useState(true); const [page, setPage] = useState(1);
  useEffect(() => { (async () => {
    setLoading(true);
    try { const { data } = await saApi.systemOverrideLogs({ page, pageSize: 25 }); setRows(data.logs || []); setPg(data.pagination); }
    catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); }
  })(); }, [page]); // eslint-disable-line
  const columns = [
    { key: 'overriddenByName', header: 'Overridden By' },
    { key: 'targetModule', header: 'Module', render: (r) => <Badge color="amber">{r.targetModule}</Badge> },
    { key: 'targetId', header: 'Target' },
    { key: 'action', header: 'Action' },
    { key: 'reason', header: 'Reason' },
    { key: 'ipAddress', header: 'IP' },
    { key: 'createdAt', header: 'When', render: (r) => new Date(r.createdAt).toLocaleString() },
  ];
  return (
    <>
      <Breadcrumb items={[{ label: 'System' }, { label: 'Override Log' }]} />
      <PageHeader title="Override Log" subtitle="Permanent record of every override action (never deleted)." />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="override-log" pagination={pg} onPageChange={setPage} emptyText="No overrides recorded." />
    </>
  );
};

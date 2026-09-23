import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

const AppealSection = () => {
  const [appeals, setAppeals] = useState([]);
  const [applications, setApplications] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ applicationId: '', appealType: '', subject: '', message: '' });
  const [proof, setProof] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [appealsRes, appsRes] = await Promise.all([
        api.get('/appeals'),
        api.get('/appeals/my-applications'),
      ]);
      setAppeals(appealsRes.data.appeals || []);
      setApplications(appsRes.data.applications || []);
    } catch {} finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.appealType || !form.subject || !form.message) {
      return setMsg({ type: 'error', text: 'Please fill in all required fields' });
    }
    setSubmitting(true);
    setMsg({ type: '', text: '' });
    try {
      const fd = new FormData();
      fd.append('appealType', form.appealType);
      fd.append('subject', form.subject);
      fd.append('message', form.message);
      if (form.applicationId) fd.append('applicationId', form.applicationId);
      if (proof) fd.append('proof', proof);
      await api.post('/appeals', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg({ type: 'success', text: 'Your appeal has been submitted successfully and is now under review.' });
      setShowForm(false);
      setForm({ applicationId: '', appealType: '', subject: '', message: '' });
      setProof(null);
      loadAll();
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to submit appeal' });
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      <h2 className="section-title">Appeals</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {appeals.length > 0 && (
        <div className="card">
          <div className="card-header">Your Appeals</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Application</th>
                  <th>Status</th>
                  <th>Response</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {appeals.map(a => (
                  <tr key={a.id}>
                    <td>#{a.id}</td>
                    <td>{a.appealType.replace(/_/g, ' ')}</td>
                    <td>{a.subject}</td>
                    <td>{a.application ? `#${a.applicationId} — ${a.application.program?.name}` : '-'}</td>
                    <td><span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span></td>
                    <td>{a.adminResponse || '-'}</td>
                    <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!showForm ? (
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Submit New Appeal</button>
      ) : (
        <div className="card">
          <div className="card-header">New Appeal</div>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Appeal Type <span className="required">*</span></label>
                <select value={form.appealType} onChange={e => setForm({ ...form, appealType: e.target.value })} required>
                  <option value="">Select type</option>
                  <option value="APPLICATION_REJECTION">Application Rejection</option>
                  <option value="FEE_REJECTION">Fee Rejection</option>
                  <option value="GENERAL">General</option>
                </select>
              </div>
              <div className="form-group">
                <label>Related Application</label>
                <select value={form.applicationId} onChange={e => setForm({ ...form, applicationId: e.target.value })}>
                  <option value="">None (General appeal)</option>
                  {applications.map(a => (
                    <option key={a.id} value={a.id}>#{a.id} — {a.program?.name} ({a.status})</option>
                  ))}
                </select>
              </div>
              <div className="form-group full-width">
                <label>Subject <span className="required">*</span></label>
                <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Brief subject of your appeal" required />
              </div>
              <div className="form-group full-width">
                <label>Message <span className="required">*</span></label>
                <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Explain your appeal in detail..." rows={4} required />
              </div>
              <div className="form-group">
                <label>Proof / Screenshot (optional)</label>
                <input type="file" accept="image/*,.pdf" onChange={e => setProof(e.target.files[0])} />
                <span style={{ fontSize: '0.78rem', color: '#a0aec0' }}>Max 2 MB</span>
              </div>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Appeal'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setProof(null); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AppealSection;

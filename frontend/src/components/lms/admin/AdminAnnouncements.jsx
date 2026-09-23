import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const AdminAnnouncements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/lms/admin/announcements')
      .then(r => setAnnouncements(r.data.announcements || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const showMsg = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3000); };

  const broadcast = async (e) => {
    e.preventDefault();
    try {
      await api.post('/lms/admin/announcements', form);
      showMsg('Announcement broadcasted to all LMS users');
      setForm(null);
      load();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed');
    }
  };

  const del = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    await api.delete(`/lms/admin/announcements/${id}`);
    showMsg('Announcement deleted');
    load();
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      {msg && <div className="alert alert-success">{msg}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
        <div className="card-header" style={{ margin: 0, padding: 0, border: 'none' }}>📢 LMS Announcements</div>
        <button className="btn btn-primary btn-sm" onClick={() => setForm({ title: '', message: '' })}>+ Broadcast Announcement</button>
      </div>

      {announcements.length === 0 ? (
        <div className="card"><p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>No announcements yet.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {announcements.map(a => (
            <div key={a.id} className="card" style={{ marginBottom: 0, borderLeft: `4px solid ${a.courseId ? '#2563eb' : '#d97706'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                    {a.course ? (
                      <span style={{ background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                        {a.course.code}
                      </span>
                    ) : (
                      <span style={{ background: '#d97706', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                        LMS-WIDE
                      </span>
                    )}
                    <h4 style={{ color: '#1a2744', fontSize: '0.95rem', margin: 0 }}>{a.title}</h4>
                  </div>
                  <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6 }}>{a.message}</p>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '6px' }}>
                    By {a.author?.teacherProfile ? `${a.author.teacherProfile.firstName} ${a.author.teacherProfile.lastName}` : a.author?.email}
                    {' • '}{new Date(a.createdAt).toLocaleString()}
                  </div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => del(a.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }} onClick={() => setForm(null)}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', margin: 0 }} onClick={e => e.stopPropagation()}>
            <div className="card-header">📢 Broadcast LMS-Wide Announcement</div>
            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
              This message will be sent to all teachers and enrolled students in the LMS.
            </p>
            <form onSubmit={broadcast}>
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label>Title <span className="required">*</span></label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Message <span className="required">*</span></label>
                <textarea rows={5} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Broadcast</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAnnouncements;

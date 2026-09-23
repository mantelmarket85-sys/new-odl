import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

const LmsMessages = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/lms/messages')
      .then(r => setMessages(r.data.messages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    await api.put(`/lms/messages/${id}/read`);
    load();
  };

  const markAllRead = async () => {
    await api.put('/lms/messages/read-all');
    load();
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  const unread = messages.filter(m => !m.isRead).length;

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="card-header" style={{ margin: 0, padding: 0, border: 'none' }}>
            🔔 LMS Messages {unread > 0 && <span style={{ fontSize: '0.75rem', background: '#dc2626', color: '#fff', padding: '2px 8px', borderRadius: '10px', marginLeft: '6px' }}>{unread} unread</span>}
          </div>
          {unread > 0 && (
            <button className="btn btn-outline btn-sm" onClick={markAllRead}>Mark all read</button>
          )}
        </div>
        {messages.length === 0 ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>No messages yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {messages.map(m => (
              <div key={m.id} style={{
                padding: '0.85rem 1rem',
                background: m.isRead ? '#f8fafc' : '#eff6ff',
                border: `1px solid ${m.isRead ? '#e2e8f0' : '#bfdbfe'}`,
                borderRadius: '8px',
                cursor: m.isRead ? 'default' : 'pointer',
              }} onClick={() => !m.isRead && markRead(m.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#1a2744', fontSize: '0.92rem' }}>
                      {!m.isRead && <span style={{ color: '#2563eb', marginRight: '6px' }}>●</span>}
                      {m.title}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '4px', lineHeight: 1.5 }}>{m.message}</div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    {new Date(m.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LmsMessages;

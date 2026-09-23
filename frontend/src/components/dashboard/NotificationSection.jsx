import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

// Auto-detect URLs (http/https) inside notification messages and render them
// as clickable anchors. Used so interview meeting links (Google Meet, Zoom,
// Microsoft Teams, custom HTTPS) are clickable directly in the dashboard.
const URL_RE = /(https?:\/\/[^\s]+)/g;
const Linkify = ({ text }) => {
  if (!text) return null;
  const parts = String(text).split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        URL_RE.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer"
             onClick={e => e.stopPropagation()}
             style={{ color: '#0ea5e9', textDecoration: 'underline', wordBreak: 'break-all' }}>
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
};

const NotificationSection = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [savingPref, setSavingPref] = useState(false);
  const [prefMsg, setPrefMsg] = useState('');

  useEffect(() => {
    loadNotifications();
    loadPreference();
    // Real-time refresh — pick up new notifications from director / coordinator
    // / admin actions every 10 s, and immediately on tab/window focus.
    const t = setInterval(loadNotifications, 10000);
    const onFocus = () => loadNotifications();
    const onVisible = () => { if (document.visibilityState === 'visible') loadNotifications(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const loadNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
    } catch {} finally { setLoading(false); }
  };

  const loadPreference = async () => {
    try {
      const res = await api.get('/auth/me');
      if (typeof res.data?.user?.emailNotifications === 'boolean') {
        setEmailEnabled(res.data.user.emailNotifications);
      }
    } catch {}
  };

  const togglePreference = async () => {
    setSavingPref(true);
    setPrefMsg('');
    try {
      const next = !emailEnabled;
      await api.put('/auth/email-notifications', { enabled: next });
      setEmailEnabled(next);
      setPrefMsg(next ? 'Email notifications turned on.' : 'Email notifications turned off.');
      setTimeout(() => setPrefMsg(''), 3000);
    } catch {
      setPrefMsg('Could not update your notification preference. Please try again.');
    } finally {
      setSavingPref(false);
    }
  };

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {}
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          Notifications {unreadCount > 0 && <span className="badge badge-submitted" style={{ marginLeft: '8px' }}>{unreadCount} new</span>}
        </h2>
        {unreadCount > 0 && (
          <button className="btn btn-sm btn-outline" onClick={markAllRead}>Mark All Read</button>
        )}
      </div>

      {/* Email-mirror toggle */}
      <div className="card" style={{ marginBottom: '1rem', padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 600, color: '#1a2744' }}>
            <i className="fas fa-envelope" style={{ marginRight: 6, color: '#2563eb' }}></i>
            Email Notifications
          </div>
          <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
            Receive a copy of important in-app alerts by email — registration, application status, interview, fee, merit, and enrollment updates.
          </div>
          {prefMsg && <div style={{ fontSize: '0.78rem', color: '#16a34a', marginTop: '4px' }}>{prefMsg}</div>}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={emailEnabled}
            onChange={togglePreference}
            disabled={savingPref}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '0.88rem', color: emailEnabled ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
            {emailEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </label>
      </div>

      {notifications.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🔔</div>
            <p style={{ fontWeight: 600, color: '#1a2744' }}>You have no notifications.</p>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.4rem' }}>
              New alerts about your application, interview, merit, fee, and enrollment will appear here automatically.
            </p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {notifications.map(n => (
            <div
              key={n.id}
              className={`notification-item ${!n.isRead ? 'unread' : ''}`}
              onClick={() => !n.isRead && markRead(n.id)}
              style={{ cursor: !n.isRead ? 'pointer' : 'default' }}
            >
              <div className="notif-dot"></div>
              <div className="notif-content">
                <div className="notif-title">{n.title}</div>
                <div className="notif-message"><Linkify text={n.message} /></div>
                {n.link && (
                  <div style={{ marginTop: 4 }}>
                    <a href={n.link} target="_blank" rel="noopener noreferrer"
                       onClick={e => e.stopPropagation()}
                       style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                                background: '#0ea5e9', color: 'white', padding: '4px 10px',
                                borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
                                textDecoration: 'none' }}>
                      <i className="fas fa-video"></i> Join Meeting
                    </a>
                  </div>
                )}
                <div className="notif-time">{new Date(n.createdAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationSection;

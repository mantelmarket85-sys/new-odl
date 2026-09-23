import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../utils/AuthContext';
import api from '../../utils/api';

const LmsLayout = ({ children, sidebarItems, activeTab, setActiveTab, roleLabel, roleBadgeColor }) => {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    api.get('/lms/me').then(r => setUnreadCount(r.data.unreadMessages || 0)).catch(() => {});
  }, [activeTab]);

  return (
    <div>
      <nav className="navbar" style={{ background: '#0f172a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div className="navbar-brand">
            <span style={{ background: '#2563eb', padding: '4px 8px', borderRadius: '4px', fontSize: '0.9rem' }}>AUST</span>
            <span style={{ fontWeight: 400, fontSize: '0.82rem' }}>Learning Management System</span>
          </div>
        </div>
        <div className="navbar-user">
          <span style={{ fontSize: '0.8rem' }}>{user?.email}</span>
          <span className="role-badge" style={{ background: roleBadgeColor || 'rgba(255,255,255,0.15)' }}>{roleLabel}</span>
          <Link to="/" style={{ color: '#cbd5e0', fontSize: '0.82rem' }}>Home</Link>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: '#cbd5e0', cursor: 'pointer', fontSize: '0.82rem' }}>Logout</button>
        </div>
      </nav>
      <div className="page-wrapper">
        <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div style={{ padding: '0.5rem 1.25rem 1rem', borderBottom: '1px solid #e2e8f0', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>LMS Portal</div>
            <div style={{ fontSize: '0.85rem', color: '#1a2744', fontWeight: 700, marginTop: '2px' }}>{roleLabel} Dashboard</div>
          </div>
          {sidebarItems.map(item => (
            <div
              key={item.key}
              className={`sidebar-item ${activeTab === item.key ? 'active' : ''}`}
              onClick={() => { setActiveTab(item.key); setSidebarOpen(false); }}
            >
              <span className="icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.key === 'messages' && unreadCount > 0 && (
                <span style={{ marginLeft: 'auto', background: '#dc2626', color: '#fff', padding: '1px 7px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700 }}>
                  {unreadCount}
                </span>
              )}
            </div>
          ))}
        </aside>
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default LmsLayout;

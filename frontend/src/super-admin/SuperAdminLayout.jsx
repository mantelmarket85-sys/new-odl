// ============================================================
//  SUPER ADMIN — APP LAYOUT SHELL
//  Sidebar + sticky header (collapse toggle, theme switch, user
//  menu, logout) + routed <Outlet>. Light/dark persisted to
//  localStorage. Self-contained CSS scope via .sa-root.
// ============================================================
import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/ui';
import './superadmin.css';

const SuperAdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sa_collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('sa_theme') === 'dark');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { localStorage.setItem('sa_collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { localStorage.setItem('sa_theme', dark ? 'dark' : 'light'); }, [dark]);

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };
  const initials = (user?.username || user?.email || 'SA').slice(0, 2).toUpperCase();

  return (
    <div className={`sa-root ${dark ? 'sa-dark' : ''}`}>
      <ToastProvider>
        <div className="sa-shell">
          <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
          <div className={`sa-backdrop ${mobileOpen ? 'show' : ''}`} onClick={() => setMobileOpen(false)} />

          <div className={`sa-main ${collapsed ? 'collapsed' : ''}`}>
            <header className="sa-header">
              <button className="sa-icon-btn sa-desktop-only" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar"
                style={{ display: window.innerWidth <= 900 ? 'none' : 'grid' }}>
                <i className="fas fa-bars" />
              </button>
              <button className="sa-icon-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu"
                style={{ display: window.innerWidth <= 900 ? 'grid' : 'none' }}>
                <i className="fas fa-bars" />
              </button>

              <div className="sa-header-title">Super Admin Console</div>
              <div className="sa-header-spacer" />

              <button className="sa-icon-btn" onClick={() => setDark((d) => !d)} title="Toggle theme">
                <i className={`fas ${dark ? 'fa-sun' : 'fa-moon'}`} />
              </button>

              <div style={{ position: 'relative' }}>
                <div className="sa-header-user" style={{ cursor: 'pointer' }} onClick={() => setMenuOpen((m) => !m)}>
                  <div className="sa-avatar">{initials}</div>
                  <div style={{ lineHeight: 1.1 }}>
                    <div className="nm">{user?.username || 'Super Admin'}</div>
                    <div className="rl">Super Administrator</div>
                  </div>
                  <i className="fas fa-chevron-down" style={{ fontSize: 11, color: 'var(--sa-text-muted)' }} />
                </div>
                {menuOpen && (
                  <div className="sa-card" style={{ position: 'absolute', right: 0, top: '110%', minWidth: 200, padding: 6, zIndex: 80 }}
                    onMouseLeave={() => setMenuOpen(false)}>
                    <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--sa-text-muted)' }}>{user?.email}</div>
                    <button className="sa-nav-item" style={{ color: 'var(--sa-danger)', width: '100%' }} onClick={handleLogout}>
                      <i className="fas fa-right-from-bracket" /> <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            </header>

            <main className="sa-content">
              <Outlet />
            </main>
          </div>
        </div>
      </ToastProvider>
    </div>
  );
};

export default SuperAdminLayout;

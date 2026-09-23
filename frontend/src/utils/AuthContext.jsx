import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import api from './api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

/**
 * Decode a JWT payload without verifying the signature (signature verification
 * happens server-side). Returns null on malformed tokens.
 */
const decodeJwtPayload = (token) => {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const json = atob(padded);
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
};

const PUBLIC_PATH_PREFIXES = [
  '/', '/login', '/register', '/forgot-password', '/reset-password',
  '/terms', '/privacy', '/about', '/admissions', '/odl', '/faculties',
  '/programs', '/fee-structure', '/scholarships', '/news', '/contact',
  '/downloads', '/faq', '/course-scheme', '/why-choose-us', '/alumni',
];
const isPublicPath = () => {
  const p = window.location.pathname;
  return PUBLIC_PATH_PREFIXES.some((prefix) => p === prefix || (prefix !== '/' && p.startsWith(prefix + '/')));
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [sessionExpiredFlag, setSessionExpiredFlag] = useState(false);
  const expiryTimerRef = useRef(null);

  const clearExpiryTimer = () => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  };

  const logout = useCallback(() => {
    clearExpiryTimer();
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }, []);

  /**
   * Schedule a proactive auto-logout shortly before the JWT exp claim.
   * This catches the case where the user has the tab open past expiration
   * without making any API call.
   */
  const scheduleExpiry = useCallback((jwt) => {
    clearExpiryTimer();
    if (!jwt) return;
    const payload = decodeJwtPayload(jwt);
    if (!payload?.exp) return;
    const msUntilExpiry = (payload.exp * 1000) - Date.now();
    if (msUntilExpiry <= 0) {
      // Already expired
      handleSessionExpired();
      return;
    }
    // Fire 5 seconds before actual expiry to give a clean UX
    const fireIn = Math.max(1000, msUntilExpiry - 5000);
    expiryTimerRef.current = setTimeout(() => {
      handleSessionExpired();
    }, fireIn);
  }, []);

  const handleSessionExpired = useCallback(() => {
    // Soft logout + flag for UI to show "session expired" banner/toast
    logout();
    setSessionExpiredFlag(true);
    if (!isPublicPath()) {
      // Use history API for a soft navigation (no hard reload).
      // We don't have direct access to react-router's navigate here (outside <Routes>),
      // so we use the browser history + dispatch a popstate to trigger react-router.
      try {
        window.history.pushState({}, '', '/login');
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch {
        window.location.href = '/login';
      }
    }
  }, [logout]);

  // -------- Init: load saved session + listen for global expiry events ------
  useEffect(() => {
    // UNIFIED LOGIN — consume a Super Admin handoff session passed from the
    // LMS login UI as `#sa_session=<encoded {token,user}>`. This lets the one
    // Super Admin sign in from EITHER portal with the same credentials and
    // land here, on the Admissions-hosted Super Admin command center.
    try {
      const hash = window.location.hash || '';
      const m = hash.match(/sa_session=([^&]+)/);
      if (m && m[1]) {
        const parsed = JSON.parse(decodeURIComponent(m[1]));
        if (parsed && parsed.token && parsed.user) {
          localStorage.setItem('token', parsed.token);
          localStorage.setItem('user', JSON.stringify(parsed.user));
        }
        // Clean the hash so the token is not left in the address bar / history.
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (_) { /* ignore malformed handoff */ }

    const init = async () => {
      const savedToken = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');
      if (savedToken && savedUser) {
        // Quick check: is the token already expired before we even hit /auth/me?
        const payload = decodeJwtPayload(savedToken);
        if (payload?.exp && payload.exp * 1000 < Date.now()) {
          // Stale token in storage — purge and skip the /auth/me call
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setLoading(false);
          return;
        }
        try {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          scheduleExpiry(savedToken);
          const res = await api.get('/auth/me');
          setUser(res.data.user);
          localStorage.setItem('user', JSON.stringify(res.data.user));
        } catch {
          logout();
        }
      }
      setLoading(false);
    };
    init();

    // Listen for global session-expired events dispatched from api.js
    const onSessionExpired = () => handleSessionExpired();
    window.addEventListener('auth:session-expired', onSessionExpired);

    // Multi-tab sync: if another tab logs out, this tab should too
    const onStorage = (e) => {
      if (e.key === 'token' && !e.newValue) {
        // Token was cleared in another tab
        setToken(null);
        setUser(null);
        clearExpiryTimer();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('auth:session-expired', onSessionExpired);
      window.removeEventListener('storage', onStorage);
      clearExpiryTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Login — accepts either:
   *   login(identifier, password, captcha?)  // identifier = email OR username
   * Backward-compatible with the old (email, password, captcha) call.
   */
  const login = async (identifierOrEmail, password, captcha = {}) => {
    const res = await api.post('/auth/login', {
      identifier: identifierOrEmail,
      email: identifierOrEmail,   // backwards-compat for old backend
      password,
      captchaId: captcha?.captchaId,
      captchaAnswer: captcha?.captchaAnswer,
    });
    const { token: newToken, user: newUser } = res.data;
    setToken(newToken);
    setUser(newUser);
    setSessionExpiredFlag(false);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    scheduleExpiry(newToken);
    return newUser;
  };

  /**
   * Register — accepts either:
   *   register({ username, email, password, confirmPassword, acceptTerms, acceptPrivacy, captcha? })
   *   register(email, password, captcha)   // legacy positional form
   */
  const register = async (...args) => {
    let body = {};
    if (args.length === 1 && typeof args[0] === 'object') {
      const p = args[0];
      body = {
        username: p.username,
        email: p.email,
        password: p.password,
        confirmPassword: p.confirmPassword,
        acceptTerms: !!p.acceptTerms,
        acceptPrivacy: !!p.acceptPrivacy,
        captchaId: p.captcha?.captchaId,
        captchaAnswer: p.captcha?.captchaAnswer,
      };
    } else {
      const [email, password, captcha = {}] = args;
      body = {
        email,
        password,
        captchaId: captcha?.captchaId,
        captchaAnswer: captcha?.captchaAnswer,
      };
    }

    const res = await api.post('/auth/register', body);
    const { token: newToken, user: newUser } = res.data;
    setToken(newToken);
    setUser(newUser);
    setSessionExpiredFlag(false);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    scheduleExpiry(newToken);
    return newUser;
  };

  const isDirectorAdmissions = (u = user) => u && (u.role === 'director_admissions' || u.role === 'admin');
  const isLmsAdmin = (u = user) => u && u.role === 'lms_admin';

  const dismissSessionExpired = () => setSessionExpiredFlag(false);

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      sessionExpiredFlag, dismissSessionExpired,
      login, register, logout,
      isDirectorAdmissions, isLmsAdmin,
    }}>
      {children}
      {sessionExpiredFlag && (
        <div
          role="alert"
          aria-live="assertive"
          className="aust-session-toast"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(135deg,#0b3c8c,#1d5dd1)',
            color: '#fff',
            padding: '12px 18px',
            borderRadius: 12,
            boxShadow: '0 12px 28px -10px rgba(11,60,140,0.55)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: '92vw',
            fontSize: '0.92rem',
            fontWeight: 500,
          }}
        >
          <i className="fas fa-shield-halved" aria-hidden="true"></i>
          <span>Your session has expired. Please sign in again to continue.</span>
          <button
            type="button"
            onClick={dismissSessionExpired}
            aria-label="Dismiss"
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: 0,
              color: '#fff',
              width: 28,
              height: 28,
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            ×
          </button>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export default AuthContext;

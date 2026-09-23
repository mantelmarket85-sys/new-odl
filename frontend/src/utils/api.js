import axios from 'axios';

// When accessed via sandbox public URL, the Vite proxy doesn't work externally.
// Detect if we're on a sandbox URL and route API calls to the backend port directly.
const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  const host = window.location.hostname;
  // Preview sandboxes serve the admissions frontend from a port-prefixed host:
  //   3000-<id>.sandbox.novita.ai   or   3000-<id>.e2b.dev
  // The backend lives on the SAME host with the port prefix swapped to 5000.
  // Match the generic "<digits>-" prefix so both .sandbox.* and .e2b.dev work.
  if (/^\d+-/.test(host) && (host.includes('.sandbox.') || host.includes('.e2b.dev'))) {
    return `${window.location.protocol}//${host.replace(/^\d+-/, '5000-')}/api`;
  }
  return '/api';
};
const API_BASE = getApiBase();

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Public routes where a 401 must NOT trigger a session-expired redirect.
// These pages legitimately make unauthenticated API calls (e.g. captcha,
// active-cycle fetch, login attempt itself).
const PUBLIC_PATH_PREFIXES = [
  '/login', '/register', '/forgot-password', '/reset-password',
  '/terms', '/privacy', '/about', '/admissions', '/odl', '/faculties',
  '/programs', '/fee-structure', '/scholarships', '/news', '/contact',
  '/downloads', '/faq', '/course-scheme', '/why-choose-us', '/alumni',
];
const isOnPublicRoute = () => {
  const p = window.location.pathname;
  if (p === '/') return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
};

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let sessionExpiredDispatched = false;

/**
 * Centralized session-expired trigger.
 * Dispatches a CustomEvent that AuthContext listens for, enabling
 * a soft React-Router redirect (no hard reload) and a user-visible toast.
 * Debounced so a burst of 401s only fires ONE event.
 */
export const triggerSessionExpired = (reason = 'unauthorized') => {
  if (sessionExpiredDispatched) return;
  sessionExpiredDispatched = true;
  // Clear stored credentials immediately so any in-flight code sees logged-out state
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  try {
    window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { reason } }));
  } catch {
    // Old browsers without CustomEvent constructor — fall back to hard redirect
    if (!isOnPublicRoute()) window.location.href = '/login';
  }
  // Reset the debounce flag after a short delay so future expirations can fire again
  setTimeout(() => { sessionExpiredDispatched = false; }, 2000);
};

// Handle 401 responses globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only treat as session-expired if we actually had a token (i.e. were logged in)
      const hadToken = !!localStorage.getItem('token');
      if (hadToken && !isOnPublicRoute()) {
        triggerSessionExpired('token_expired');
      } else {
        // Public-route 401 (e.g. failed login) — let the form handle the error message;
        // do NOT clear anything or redirect.
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Helper to get the base URL for file uploads (without /api)
export const getFileUrl = (filePath) => {
  if (!filePath) return null;
  const base = API_BASE.replace('/api', '');
  // If API_BASE is relative (/api), use the file path directly from same origin
  if (base === '') return filePath.startsWith('/') ? filePath : `/${filePath}`;
  // Otherwise prefix with the base URL (sandbox/external)
  return `${base}${filePath.startsWith('/') ? filePath : `/${filePath}`}`;
};

// ============================================================
//  LMS AUTH SERVICE (Section 5.1)
//  ------------------------------------------------------------
//  Thin wrapper around the backend /api/lms/auth endpoints.
//  Token storage keys (Technical Checklist):
//    - localStorage 'lms_token'  → full session JWT
//    - localStorage 'lms_role'   → role string
//  The forced-password-change temp token lives in sessionStorage
//  under 'lms_temp_token'.
// ============================================================

// Resolve the API base URL.
//  - Honors VITE_API_URL when provided.
//  - In the sandbox the LMS frontend is served from 5174-<id>.sandbox.*
//    and the backend from 5000-<id>.sandbox.* — rewrite the host.
//  - Falls back to http://localhost:5000/api for local dev.
function getApiBase() {
  if (import.meta.env && import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    const { hostname, protocol, port } = window.location;
    // Port-prefixed proxy hosts used by the preview sandboxes:
    //   <port>-<id>.sandbox.<provider>   (e.g. 5174-...sandbox.novita.ai)
    //   <port>-<id>.e2b.dev              (e.g. 5174-...e2b.dev)
    // In all of these the backend is reachable on the SAME host with the
    // leading port swapped to 5000. Match the generic "<digits>-" prefix so
    // any such provider (.sandbox.*, .e2b.dev, etc.) works out of the box.
    if (/^\d+-/.test(hostname) && (hostname.includes('.sandbox.') || hostname.includes('.e2b.dev'))) {
      return `${protocol}//${hostname.replace(/^\d+-/, '5000-')}/api`;
    }
    // Local dev on a non-5000 port → talk to the backend on 5000.
    if (port && port !== '5000') {
      return `${protocol}//${hostname}:5000/api`;
    }
  }
  return 'http://localhost:5000/api';
}

const API_BASE = getApiBase();

const TOKEN_KEY = 'lms_token';
const ROLE_KEY = 'lms_role';
const TEMP_TOKEN_KEY = 'lms_temp_token';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// login(username, password)
//   → POST /api/lms/auth/login
//   → on full-token success: save token + role to localStorage
//   → returns the raw response so callers can branch on requiresPasswordChange
async function login(username, password) {
  const data = await request('/lms/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  if (data && data.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(ROLE_KEY, data.role);
  }
  return data;
}

// logout()
//   → remove lms_token + lms_role from localStorage, clear temp token,
//     and redirect to the LMS login page.
function logout(redirect = true) {
  // Record a logout activity for the student activity timeline (Req #7).
  // Uses fetch keepalive so the request survives the navigation away.
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const role = localStorage.getItem(ROLE_KEY);
    if (token && role === 'Student') {
      fetch(`${API_BASE}/lms/academic/student/logout-activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
        keepalive: true,
      }).catch(() => {});
    }
  } catch (_) { /* non-blocking */ }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  sessionStorage.removeItem(TEMP_TOKEN_KEY);
  if (redirect && typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getRole() {
  return localStorage.getItem(ROLE_KEY);
}

// changePassword(tempToken, newPassword)
//   → POST /api/lms/auth/change-password (Authorization: Bearer <tempToken>)
//   → on success: save full token + role to localStorage
async function changePassword(tempToken, newPassword) {
  const data = await request('/lms/auth/change-password', {
    method: 'POST',
    token: tempToken,
    body: { newPassword },
  });
  if (data && data.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(ROLE_KEY, data.role);
  }
  return data;
}

// getMe()
//   → GET /api/lms/auth/me using lms_token from localStorage.
async function getMe() {
  const token = getToken();
  if (!token) throw new Error('No LMS session token.');
  return request('/lms/auth/me', { token });
}

// getStudentProfile() → GET /api/lms/student/profile
async function getStudentProfile() {
  const token = getToken();
  if (!token) throw new Error('No LMS session token.');
  return request('/lms/student/profile', { token });
}

// Helpers for the temp (password-change) token.
function setTempToken(t) { sessionStorage.setItem(TEMP_TOKEN_KEY, t); }
function getTempToken() { return sessionStorage.getItem(TEMP_TOKEN_KEY); }
function clearTempToken() { sessionStorage.removeItem(TEMP_TOKEN_KEY); }

const authService = {
  login,
  logout,
  getToken,
  getRole,
  changePassword,
  getMe,
  getStudentProfile,
  setTempToken,
  getTempToken,
  clearTempToken,
  API_BASE,
  TOKEN_KEY,
  ROLE_KEY,
  TEMP_TOKEN_KEY,
};

export default authService;
export {
  login,
  logout,
  getToken,
  getRole,
  changePassword,
  getMe,
  getStudentProfile,
  setTempToken,
  getTempToken,
  clearTempToken,
  API_BASE,
};

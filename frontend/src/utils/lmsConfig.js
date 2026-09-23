// ============================================================
//  LMS FRONTEND URL (Section 8)
//  ------------------------------------------------------------
//  The dedicated LMS frontend is a separate app served on port 5174.
//  This helper resolves its base URL for redirects from the ODL
//  single login page.
//   - Honors VITE_LMS_URL when provided.
//   - In the sandbox the ODL frontend is on 3000-<id>.sandbox.* and
//     the LMS frontend on 5174-<id>.sandbox.* — rewrite the host.
//   - Local dev falls back to http://localhost:5174.
// ============================================================

function resolveLmsUrl() {
  if (import.meta.env && import.meta.env.VITE_LMS_URL) return import.meta.env.VITE_LMS_URL;
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    if (hostname.includes('.sandbox.') && /^\d+-/.test(hostname)) {
      return `${protocol}//${hostname.replace(/^\d+-/, '5174-')}`;
    }
  }
  return 'http://localhost:5174';
}

export const LMS_FRONTEND_URL = resolveLmsUrl();

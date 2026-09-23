import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/* =========================================================================
 * LmsProtectedRoute (Section 5.3)
 * --------------------------------------------------------------------------
 * Props:
 *   allowedRoles : string[]  (FRONTEND role keys, e.g. ["student"])
 *   children     : the route element to render when access is granted
 *
 * Behavior:
 *   - Not authenticated                 → redirect to /login
 *   - mustChangePassword === true        → redirect to /force-change-password
 *   - authenticated but role not allowed → 403 / unauthorized message
 *   - authenticated and role allowed     → render children
 *
 * This wrapper does NOT alter any page UI — it only gates access.
 * ======================================================================= */
const LmsProtectedRoute = ({ allowedRoles, children }) => {
  const { user, loading } = useAuth();

  // While verifying the session token, render a neutral placeholder.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Forced first-login password change takes precedence over everything.
  if (user.mustChangePassword === true) {
    return <Navigate to="/force-change-password" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app px-6">
        <div className="max-w-md w-full text-center rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-white/90 dark:bg-slate-900/80 shadow-xl p-8">
          <div className="text-5xl mb-3">🚫</div>
          <h1 className="text-xl font-bold text-app mb-2">403 — Access Denied</h1>
          <p className="text-sm text-muted-app">
            You are signed in as <strong>{user.username || user.role}</strong>, which does not have
            permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return children;
};

export default LmsProtectedRoute;

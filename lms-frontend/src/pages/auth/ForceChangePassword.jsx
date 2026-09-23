import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, ArrowRight, ShieldAlert, CheckCircle2 } from "lucide-react";
import Logo from "../../components/common/Logo";
import ThemeToggle from "../../components/common/ThemeToggle";
import { useToast } from "../../context/ToastContext";
import { useAuth, BACKEND_ROLE_TO_FRONTEND } from "../../context/AuthContext";
import authService from "../../services/authService";

/* =========================================================================
 * ForceChangePassword (Section 5.6)
 * --------------------------------------------------------------------------
 * The forced first-login password change. Reads the temp token from
 * sessionStorage, validates the new password client-side, then calls
 * authService.changePassword(tempToken, newPassword). On success the full
 * session token + role are stored and the user is routed to their dashboard.
 *
 * Errors are surfaced through the existing toast mechanism + an inline
 * error area on this page (no new global UI components).
 * ======================================================================= */
const ROLE_BASE = {
  student: "/student",
  teacher: "/teacher",
  admin: "/admin",
  focal_person: "/focal",
  exam_coordinator: "/exam",
  director_qec: "/qec",
  provost: "/provost",
};

// Mirror of the server-side password policy.
const POLICY = {
  length: (s) => s.length >= 8,
  upper: (s) => /[A-Z]/.test(s),
  number: (s) => /\d/.test(s),
  special: (s) => /[^A-Za-z0-9]/.test(s),
};

function validatePassword(pw) {
  if (!POLICY.length(pw)) return "Password must be at least 8 characters.";
  if (!POLICY.upper(pw)) return "Password must include at least one uppercase letter.";
  if (!POLICY.number(pw)) return "Password must include at least one number.";
  if (!POLICY.special(pw)) return "Password must include at least one special character.";
  return null;
}

const ForceChangePassword = () => {
  const [show, setShow] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    const tempToken = authService.getTempToken();
    if (!tempToken) {
      setError("Your session has expired. Please log in again.");
      toast("Session expired — please log in again.", { type: "error" });
      setTimeout(() => navigate("/login"), 1200);
      return;
    }

    if (pw !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    const policyError = validatePassword(pw);
    if (policyError) {
      setError(policyError);
      return;
    }

    setLoading(true);
    try {
      const data = await authService.changePassword(tempToken, pw);
      authService.clearTempToken();
      const frontendRole = BACKEND_ROLE_TO_FRONTEND[data.role] || "student";
      // Establish the session in the auth context (mustChangePassword now false).
      // Await so the real DB identity is hydrated before navigating.
      await login(frontendRole, {
        username: data.username,
        backendRole: data.role,
        mustChangePassword: false,
      });
      toast("Password updated successfully.", { type: "success", title: "Welcome to AUST LMS" });
      navigate(ROLE_BASE[frontendRole] || "/login", { replace: true });
    } catch (err) {
      setError(err.message || "Failed to change password.");
      toast(err.message || "Failed to change password.", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const checks = [
    { ok: POLICY.length(pw), label: "At least 8 characters" },
    { ok: POLICY.upper(pw), label: "One uppercase letter" },
    { ok: POLICY.number(pw), label: "One number" },
    { ok: POLICY.special(pw), label: "One special character" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-app">
      <div className="absolute top-5 right-5 z-50"><ThemeToggle /></div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md card-base p-8 shadow-2xl">
        <Logo size="md" />
        <div className="mt-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/30 flex items-center justify-center">
            <ShieldAlert size={28} className="text-white" />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-app mt-4">Set a New Password</h1>
          <p className="text-muted-app mt-1 text-sm">
            For your security, you must change the temporary password before continuing.
          </p>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/80 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">New Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input value={pw} onChange={(e) => setPw(e.target.value)} type={show ? "text" : "password"} className="input-base pl-10 pr-10" placeholder="••••••••" autoComplete="new-password" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Confirm Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type={show ? "text" : "password"} className="input-base pl-10" placeholder="••••••••" autoComplete="new-password" />
            </div>
            {confirm && (
              <p className={`text-xs mt-1.5 flex items-center gap-1 ${pw === confirm ? "text-emerald-600" : "text-rose-600"}`}>
                <CheckCircle2 size={12} /> {pw === confirm ? "Passwords match" : "Passwords don't match"}
              </p>
            )}
          </div>

          {pw && (
            <ul className="grid grid-cols-2 gap-1.5">
              {checks.map((c) => (
                <li key={c.label} className={`text-xs flex items-center gap-1.5 ${c.ok ? "text-emerald-600" : "text-muted-app"}`}>
                  <CheckCircle2 size={12} className={c.ok ? "text-emerald-500" : "text-slate-300 dark:text-slate-600"} />
                  {c.label}
                </li>
              ))}
            </ul>
          )}

          <button disabled={loading} className="w-full btn-primary flex items-center justify-center gap-2 py-3 disabled:opacity-60">
            {loading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>Change Password & Continue <ArrowRight size={16} /></>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default ForceChangePassword;

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  User, Lock, Eye, EyeOff, ArrowRight,
  CheckCircle2, ShieldCheck as ShieldIcon, Lock as LockIcon,
} from "lucide-react";
import ThemeToggle from "../../components/common/ThemeToggle";
import { useAuth, BACKEND_ROLE_TO_FRONTEND } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import authService from "../../services/authService";

/* Frontend role key → dashboard base path. */
const ROLE_BASE = {
  student: "/student",
  teacher: "/teacher",
  admin: "/admin",
  focal_person: "/focal",
  exam_coordinator: "/exam",
  director_qec: "/qec",
  provost: "/provost",
};

/* ------------------------------------------------------------------
 * UNIFIED LOGIN — resolve the Admissions app base URL so a Super Admin
 * signing in through the LMS UI can be handed off to the Admissions-hosted
 * Super Admin command center (/super-admin) on port 3000.
 * ---------------------------------------------------------------- */
function resolveAdmissionsUrl() {
  if (import.meta.env && import.meta.env.VITE_ADMISSIONS_URL) {
    return import.meta.env.VITE_ADMISSIONS_URL;
  }
  if (typeof window !== "undefined") {
    const { hostname, protocol } = window.location;
    if (hostname.includes(".sandbox.") && /^\d+-/.test(hostname)) {
      return `${protocol}//${hostname.replace(/^\d+-/, "3000-")}`;
    }
  }
  return "http://localhost:3000";
}

/* ------------------------------------------------------------------
 * AUST ODL — Premium Login Page (frontend-only redesign)
 * ------------------------------------------------------------------
 * • Fixed viewport — 100vh, no page scroll on desktop/laptop/tablet
 * • Perfectly symmetric 50/50 split with balanced spacing
 * • Mobile: stacks the form (image hidden) — still no scroll on
 *   typical mobile heights for the compact form
 * • Preserves all existing logic: useAuth, useToast, routing
 * ----------------------------------------------------------------*/
const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast("Please enter your username and password.", { type: "error" });
      return;
    }
    setLoading(true);
    try {
      const data = await authService.login(username.trim(), password);

      // Forced first-login password change.
      if (data && data.requiresPasswordChange) {
        authService.setTempToken(data.tempToken);
        toast("Please set a new password to continue.", { type: "info", title: "Password Change Required" });
        navigate("/force-change-password");
        return;
      }

      // UNIFIED LOGIN — Super Admin handoff. When the same credentials map to
      // the platform's Super Admin, the backend returns an Admissions token.
      // We hand off to the Admissions-hosted Super Admin command center.
      if (data && data.superAdmin && data.adminToken) {
        const base = resolveAdmissionsUrl();
        toast("Opening Super Admin Command Center…", { type: "success", title: "Welcome, Super Admin" });
        const payload = encodeURIComponent(
          JSON.stringify({ token: data.adminToken, user: data.adminUser })
        );
        // Hand off via URL hash; the Admissions app consumes & clears it.
        window.location.href = `${base}/super-admin#sa_session=${payload}`;
        return;
      }

      // Full session — backend determines the authoritative role.
      // Smart role detection: the role comes ONLY from the server response;
      // the user never selects a role on the login screen.
      const frontendRole = BACKEND_ROLE_TO_FRONTEND[data.role] || "student";
      // Await so the REAL DB identity (student name etc.) is hydrated from
      // /api/lms/auth/me BEFORE we navigate — guarantees the sidebar/dashboard
      // render the correct name on first paint (no placeholder flash).
      await login(frontendRole, {
        username: data.username,
        backendRole: data.role,
        mustChangePassword: false,
      });
      toast("Welcome back to AUST ODL", { type: "success", title: "Login Successful" });
      navigate(ROLE_BASE[frontendRole] || `/${frontendRole}`, { replace: true });
    } catch (err) {
      // Surface the backend error message through the existing toast UI.
      toast(err.message || "Invalid credentials.", { type: "error", title: "Login Failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    /* h-screen + overflow-hidden — guarantees zero page scroll. */
    <div className="h-screen w-screen overflow-hidden bg-app relative">
      {/* ===== Premium ambient background — refined, theme-aware ===== */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* Soft gradient base wash */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
        {/* Glow orbs */}
        <div className="absolute -top-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-blue-400/20 dark:bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 w-[32rem] h-[32rem] rounded-full bg-indigo-400/20 dark:bg-indigo-500/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] rounded-full bg-cyan-300/10 dark:bg-cyan-500/5 blur-3xl" />
        {/* Subtle grid texture for enterprise feel */}
        <div
          className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(15 23 42 / 0.5) 1px, transparent 1px), linear-gradient(to bottom, rgb(15 23 42 / 0.5) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      {/* Floating theme toggle */}
      <div className="absolute top-3 right-3 z-50">
        <ThemeToggle />
      </div>

      {/* ===== Main split layout — exact 50/50, full viewport height, NO scroll ===== */}
      <div className="h-full w-full grid grid-cols-1 lg:grid-cols-2 items-center justify-items-center gap-4 lg:gap-6 px-4 sm:px-6 lg:px-8 xl:px-10 py-2 sm:py-3 lg:py-4">

        {/* ============================================================
         *  LEFT — LOGIN FORM (equal-width frame)
         * ============================================================ */}
        <section className="w-full h-full flex items-center justify-center lg:justify-end order-2 lg:order-1">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-[620px]"
          >
            {/* Premium card */}
            <div className="relative">
              {/* Gradient halo — softer, more premium */}
              <div className="absolute -inset-[2px] rounded-3xl bg-gradient-to-br from-blue-500/40 via-cyan-400/20 to-indigo-500/40 opacity-70 blur-md" />

              <div className="relative rounded-3xl bg-white/95 dark:bg-slate-900/90 backdrop-blur-2xl border border-slate-200/90 dark:border-slate-700/60 shadow-[0_20px_60px_-15px_rgba(30,58,138,0.18)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] px-7 sm:px-9 py-5 sm:py-6 ring-1 ring-white/60 dark:ring-white/5">

                {/* Brand */}
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="relative mb-2">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/30 via-cyan-500/15 to-indigo-500/30 blur-lg" />
                    <div className="relative w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg shadow-blue-900/10 dark:shadow-black/40 p-1.5 flex items-center justify-center">
                      <img
                        src="/static/aust-logo-new.png"
                        alt="AUST official logo"
                        className="w-full h-full object-contain"
                        onError={(e) => { e.currentTarget.src = "/static/aust-logo.png"; }}
                      />
                    </div>
                  </div>

                  <h1 className="font-display font-extrabold text-[22px] sm:text-[26px] text-app leading-tight tracking-tight">
                    Welcome back to <span className="gradient-text">AUST</span>
                  </h1>
                  <p className="text-[12px] sm:text-[12.5px] text-muted-app mt-1 font-medium">
                    Open & Distance Learning · Enterprise Portal
                  </p>
                </div>

                {/* ===== Form ===== */}
                <form onSubmit={handleSubmit} className="space-y-2.5">
                  {/* Username */}
                  <div>
                    <label
                      htmlFor="username"
                      className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-app block mb-1"
                    >
                      Username
                    </label>
                    <div className="relative group">
                      <User
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-primary-500 transition-colors"
                      />
                      <input
                        id="username"
                        type="text"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        className="input-base pl-10 pr-3 py-2.5 rounded-xl shadow-sm focus:shadow-md focus:shadow-blue-500/10 transition-shadow"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label
                      htmlFor="password"
                      className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-app block mb-1"
                    >
                      Password
                    </label>
                    <div className="relative group">
                      <Lock
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-primary-500 transition-colors"
                      />
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="input-base pl-10 pr-11 py-2.5 rounded-xl shadow-sm focus:shadow-md focus:shadow-blue-500/10 transition-shadow"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-primary-500 transition-colors"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Remember + forgot */}
                  <div className="flex items-center justify-between text-[12.5px] pt-0.5">
                    <label className="flex items-center gap-1.5 text-app cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded text-primary-600 w-3.5 h-3.5 border-slate-300 dark:border-slate-600"
                        defaultChecked
                      />
                      Remember me
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-primary-600 dark:text-primary-400 font-semibold hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>

                  {/* Sign in button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full overflow-hidden rounded-xl py-3 px-4 font-semibold tracking-wide text-white shadow-lg shadow-blue-600/30 transition-all hover:shadow-xl hover:shadow-blue-600/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 ring-1 ring-blue-700/40 mt-1"
                    style={{
                      background:
                        "linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #1e40af 100%)",
                    }}
                  >
                    {/* Animated shine */}
                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent group-hover:translate-x-full transition-transform duration-700" />
                    {/* Inner top highlight for premium glass-button look */}
                    <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                    <span className="relative inline-flex items-center justify-center gap-2 text-[14px]">
                      {loading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Signing in…
                        </>
                      ) : (
                        <>
                          Sign In Securely
                          <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </span>
                  </button>
                </form>

                {/* Trust indicators — premium enterprise feel */}
                <div className="mt-3.5 pt-3 border-t border-slate-200/70 dark:border-slate-700/50">
                  <div className="flex items-center justify-center gap-3 text-[10.5px] font-semibold text-muted-app">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldIcon size={11} className="text-emerald-500" />
                      256-bit SSL
                    </span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                    <span className="inline-flex items-center gap-1.5">
                      <LockIcon size={11} className="text-blue-500" />
                      Secure Login
                    </span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 size={11} className="text-violet-500" />
                      Verified Portal
                    </span>
                  </div>
                </div>

                {/* Footer note */}
                <p className="text-center text-[10.5px] text-muted-app mt-2 leading-relaxed">
                  By signing in, you agree to AUST ODL's{" "}
                  <span className="underline cursor-pointer hover:text-primary-500">Terms</span> &{" "}
                  <span className="underline cursor-pointer hover:text-primary-500">Privacy Policy</span>.
                </p>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ============================================================
         *  RIGHT — CLEAN PREMIUM IMAGE CARD (equal width to form)
         * ============================================================ */}
        <section className="hidden lg:flex w-full h-full items-center justify-start order-1 lg:order-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="relative w-full max-w-[620px]"
          >
            {/* Soft outer glow */}
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-blue-500/30 via-cyan-400/20 to-indigo-500/30 blur-2xl opacity-80" />

            {/* Glass frame — uses clamp() so image always fits viewport without scroll */}
            <div className="relative rounded-[1.75rem] p-3.5 sm:p-4 bg-white/75 dark:bg-slate-900/60 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-[0_30px_80px_-20px_rgba(30,58,138,0.25)] dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/40 dark:ring-white/5">
              {/* Inner bordered image container — height clamps to viewport so the entire page is visible without scrolling */}
              <div className="relative rounded-2xl overflow-hidden ring-1 ring-slate-200/80 dark:ring-slate-700/60 shadow-xl shadow-blue-950/10">
                <img
                  src="/static/aust-campus-new.jpg"
                  alt="Abbottabad University of Science & Technology campus"
                  className="block w-full object-cover"
                  style={{ height: "clamp(440px, calc(100vh - 80px), 760px)" }}
                  onError={(e) => { e.currentTarget.src = "/static/aust-campus.jpg"; }}
                />
              </div>
            </div>

            {/* Decorative dots — outside the image, never overlapping it */}
            <div className="absolute -top-2 -right-2 w-3.5 h-3.5 rounded-full bg-cyan-400 shadow-md shadow-cyan-400/50" />
            <div className="absolute -bottom-2 -left-2 w-3.5 h-3.5 rounded-full bg-blue-500 shadow-md shadow-blue-500/50" />
          </motion.div>
        </section>
      </div>
    </div>
  );
};

export default Login;

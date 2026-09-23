import React, { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import {
  UserIcon, LockIcon, AlertIcon, EyeIcon, EyeOffIcon,
} from '../components/AuthIcons';
import AuthHeroImage from '../components/AuthHeroImage';
// §1.1 — math captcha shown on the STUDENT role's login page only.
import AuthCaptcha from '../components/AuthCaptcha';
import api from '../utils/api';
import { LMS_FRONTEND_URL } from '../utils/lmsConfig';
import '../styles/auth.css';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  // §1.1 — captcha challenge state. This is the applicant/student sign-in page,
  // so the captcha applies here. Staff portals are untouched.
  const [captcha, setCaptcha] = useState({ captchaId: '', captchaAnswer: '' });
  const captchaRef = useRef(null);
  const onCaptchaChange = useCallback((next) => setCaptcha(next), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!identifier.trim() || !password) {
      return setError('Please provide your username or registered email along with your password.');
    }
    // §1.1 — the captcha must be solved before the credentials are submitted.
    if (!captcha.captchaId) {
      captchaRef.current?.refresh();
      return setError('The security check could not be loaded. A new question has been issued — please solve it.');
    }
    if (!String(captcha.captchaAnswer).trim()) {
      return setError('Please solve the security check (captcha) to continue.');
    }
    setLoading(true);
    try {
      const user = await login(identifier.trim(), password, captcha);
      setSuccess('Authentication successful. Redirecting to your portal…');
      setTimeout(() => {
        // Smart role detection: the role is read from the authenticated user
        // record (never selected on the login screen). Each role maps to its
        // own dashboard; any future/unknown role falls back to the student
        // dashboard so new roles keep working without breaking this flow.
        const ROLE_DASHBOARD = {
          super_admin: '/super-admin',          // Admin → Super Admin Dashboard
          director_admissions: '/admin',        // Admission Officer → Admission Dashboard
          admin: '/admin',
          coordinator: '/coordinator',          // Course Coordinator → Coordinator Dashboard
          lms_admin: '/lms/admin',
          teacher: '/lms/teacher',
        };
        navigate(ROLE_DASHBOARD[user.role] || '/dashboard');
      }, 350);
    } catch (err) {
      const serverError = err.response?.data?.error || '';
      // §1.1 — a failed CAPTCHA must never fall through to the LMS login (that
      // would bypass the check). Show the captcha error and issue a fresh
      // question so the next attempt always gets a new challenge.
      const isCaptchaError = /captcha/i.test(serverError);
      if (isCaptchaError) {
        setCaptcha({ captchaId: '', captchaAnswer: '' });
        captchaRef.current?.refresh();
        setError(serverError || 'Incorrect captcha answer. A new question has been issued.');
      } else {
        // ----------------------------------------------------------------
        // Section 8, step 6 — LMS is the FINAL fallback. If admissions login
        // returns no match, try the same credentials against the LMS auth
        // endpoint and, on success, hand off to the dedicated LMS frontend.
        // ----------------------------------------------------------------
        const handledByLms = await tryLmsLogin(identifier.trim(), password);
        if (!handledByLms) {
          setError(serverError || 'Invalid credentials.');
        }
        // §1.1 — the challenge was consumed server-side on this attempt, so a
        // brand-new captcha is generated for the retry.
        if (!handledByLms) {
          setCaptcha({ captchaId: '', captchaAnswer: '' });
          captchaRef.current?.refresh();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Attempts an LMS login. Returns true if the LMS handled the credentials
  // (and a redirect has been initiated), false otherwise.
  const tryLmsLogin = async (username, pw) => {
    try {
      const res = await api.post('/lms/auth/login', { username, password: pw });
      const data = res.data || {};

      if (data.requiresPasswordChange && data.tempToken) {
        // Stash the temp token where the LMS frontend expects it, then redirect
        // to the LMS force-change-password page.
        sessionStorage.setItem('lms_temp_token', data.tempToken);
        setSuccess('LMS account found. Redirecting to set your new password…');
        setTimeout(() => {
          window.location.href = `${LMS_FRONTEND_URL}/force-change-password`;
        }, 400);
        return true;
      }

      if (data.token) {
        localStorage.setItem('lms_token', data.token);
        localStorage.setItem('lms_role', data.role);
        setSuccess('LMS authentication successful. Redirecting to the LMS…');
        setTimeout(() => {
          window.location.href = `${LMS_FRONTEND_URL}/`;
        }, 400);
        return true;
      }
      return false;
    } catch (e) {
      // LMS login also failed → fall through to the generic invalid message.
      return false;
    }
  };

  return (
    <main className="aust-auth">
      <section className="aust-auth__card" aria-label="Sign in">
        {/* LEFT — Form panel */}
        <div className="aust-auth__form-side">
          <div className="aust-auth__form-inner">
            <div className="aust-card__logo">
              <img src="/assets/aust-logo.png" alt="Abbottabad University Logo" decoding="async" />
              <h1 className="aust-card__title">Welcome back to AUST</h1>
              <p className="aust-card__subtitle">
                Sign in to continue managing your admission, programmes and academic records.
              </p>
            </div>

            {error && (
              <div className="aust-alert aust-alert--error" role="alert">
                <AlertIcon /> <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="aust-alert aust-alert--success" role="status">
                <span aria-hidden="true">✓</span> <span>{success}</span>
              </div>
            )}

            <form className="aust-form" onSubmit={handleSubmit} autoComplete="on">
              <div>
                <label className="aust-label" htmlFor="login-id">Username or Email</label>
                <div className="aust-input-wrap">
                  <UserIcon />
                  <input
                    id="login-id"
                    type="text"
                    className="aust-input"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. student@example.com"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="aust-label" htmlFor="login-pw">Password</label>
                <div className="aust-input-wrap">
                  <LockIcon />
                  <input
                    id="login-pw"
                    type={showPw ? 'text' : 'password'}
                    className="aust-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="aust-toggle-pw"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPw((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {/* §1.1 — student login math captcha */}
              <AuthCaptcha
                ref={captchaRef}
                value={captcha}
                onChange={onCaptchaChange}
                disabled={loading}
              />

              <div className="aust-card__between">
                <span />
                <Link to="/forgot-password">Forgot your password?</Link>
              </div>

              <button type="submit" className="aust-btn aust-btn--primary aust-btn--block" disabled={loading}>
                {loading ? (<><span className="aust-spinner" /> Authenticating…</>) : 'Sign In'}
              </button>
            </form>

            <div className="aust-card__links">
              New to the AUST portal? <Link to="/register">Create your account</Link>
            </div>

            <p className="aust-page-footer">
              © {new Date().getFullYear()} Abbottabad University of Science &amp; Technology · All rights reserved
            </p>
          </div>
        </div>

        {/* RIGHT — Image panel */}
        <div className="aust-auth__image-side" aria-hidden="true">
          <AuthHeroImage alt="" />
   





   
          <div className="aust-image-glass-header" aria-hidden="false">
            <div className="aust-image-glass-header__brand">
              <img src="/assets/aust-logo.png" alt="" width="32" height="32" decoding="async" />
              <span>AUST · Online Admissions Portal</span>
            </div>
            <div className="aust-image-glass-header__crumb">
              <Link to="/">Home</Link>
              <span className="sep">/</span>
              <span className="here">Sign In</span>
            </div>
          </div>

          

          <div className="aust-auth__hero-text">
            <span className="aust-auth__hero-kicker">Welcome Back</span>
            <h2>Where learning meets flexibility.</h2>
            <p>
              Sign in to manage your application and track admission progress online.
            </p>
            <div className="aust-auth__hero-stats">
              
              
              <div className="stat"><div className="num">Fast • Secure • Reliable.</div><div className="lbl"></div></div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Login;

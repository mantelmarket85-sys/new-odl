import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import api from '../utils/api';
import {
  UserIcon, MailIcon, LockIcon, AlertIcon, CheckIcon, EyeIcon, EyeOffIcon,
} from '../components/AuthIcons';
import AuthHeroImage from '../components/AuthHeroImage';
// §1.1 — math captcha shown on the STUDENT role's signup page only.
import AuthCaptcha from '../components/AuthCaptcha';
import '../styles/auth.css';

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [usernameMsg, setUsernameMsg] = useState('');

  // §1.1 — captcha challenge state for the student signup form.
  const [captcha, setCaptcha] = useState({ captchaId: '', captchaAnswer: '' });
  const captchaRef = useRef(null);
  const onCaptchaChange = useCallback((next) => setCaptcha(next), []);

  const passwordsMatch = useMemo(
    () => password.length > 0 && password === confirmPassword,
    [password, confirmPassword]
  );
  const passwordValid = password.length >= 6;
  const usernameValid = /^[a-zA-Z0-9_.-]{3,30}$/.test(username);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  // §1.1 — the captcha answer is part of the form-ready gate.
  const captchaFilled = !!captcha.captchaId && String(captcha.captchaAnswer).trim().length > 0;
  const formReady = agreeTerms && usernameValid && emailValid && passwordValid && passwordsMatch && captchaFilled && (usernameAvailable !== false);

  React.useEffect(() => {
    if (!usernameValid) { setUsernameAvailable(null); setUsernameMsg(''); return; }
    setUsernameMsg('Verifying availability…');
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/check-username?username=${encodeURIComponent(username)}`);
        setUsernameAvailable(!!res.data.available);
        setUsernameMsg(res.data.available ? 'Username is available' : 'This username is already taken');
      } catch {
        setUsernameAvailable(null); setUsernameMsg('');
      }
    }, 350);
    return () => clearTimeout(t);
  }, [username, usernameValid]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!usernameValid) return setError('Username must be 3–30 characters using letters, digits, underscore, dot or hyphen.');
    if (!emailValid) return setError('Please provide a valid email address.');
    if (!passwordValid) return setError('Password must contain at least 6 characters.');
    if (!passwordsMatch) return setError('Both passwords must match exactly.');
    if (!agreeTerms) return setError('You must accept the Terms and Privacy Policy to continue.');
    // §1.1 — captcha must be solved before the account is created.
    if (!captcha.captchaId) {
      captchaRef.current?.refresh();
      return setError('The security check could not be loaded. A new question has been issued — please solve it.');
    }
    if (!String(captcha.captchaAnswer).trim()) {
      return setError('Please solve the security check (captcha) to continue.');
    }

    setLoading(true);
    try {
      await register({
        username, email, password, confirmPassword,
        acceptTerms: true, acceptPrivacy: true,
        // §1.1 — server-side verification of the same challenge.
        captcha,
      });
      setSuccess('Account created successfully. Redirecting to your dashboard…');
      setTimeout(() => navigate('/dashboard'), 400);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Registration could not be completed.');
      // §1.1 — the challenge is single-use, so always issue a fresh one for the
      // next attempt (regenerates properly on every attempt).
      setCaptcha({ captchaId: '', captchaAnswer: '' });
      captchaRef.current?.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="aust-auth">
      <section className="aust-auth__card" aria-label="Create account">
        {/* LEFT — Form panel */}
        <div className="aust-auth__form-side">
          <div className="aust-auth__form-inner">
            <div className="aust-card__logo">
              <img src="/assets/aust-logo.png" alt="Abbottabad University Logo" decoding="async" />
              <h1 className="aust-card__title">Create your AUST account</h1>
              <p className="aust-card__subtitle">
                Begin your admission journey — registration takes less than a minute.
              </p>
            </div>

            {error && (
              <div className="aust-alert aust-alert--error" role="alert">
                <AlertIcon /> <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="aust-alert aust-alert--success" role="status">
                <CheckIcon /> <span>{success}</span>
              </div>
            )}

            <form className="aust-form" onSubmit={handleSubmit} autoComplete="off">
              <div>
                <label className="aust-label" htmlFor="reg-username">Username</label>
                <div className="aust-input-wrap">
                  <UserIcon />
                  <input
                    id="reg-username"
                    type="text"
                    className="aust-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.trim())}
                    placeholder="Choose a unique username"
                    autoComplete="off"
                    required
                    minLength={3}
                    maxLength={30}
                  />
                </div>
                {username.length > 0 && (
                  <div className={
                    'aust-help ' +
                    (usernameAvailable === false ? 'aust-help--error' :
                     usernameAvailable === true  ? 'aust-help--ok'    : '')
                  }>
                    {usernameMsg || (usernameValid ? '' : '3–30 characters: letters, digits, _, . or hyphen')}
                  </div>
                )}
              </div>

              <div>
                <label className="aust-label" htmlFor="reg-email">Email Address</label>
                <div className="aust-input-wrap">
                  <MailIcon />
                  <input
                    id="reg-email"
                    type="email"
                    className="aust-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="aust-row-2">
                <div>
                  <label className="aust-label" htmlFor="reg-pw">Password</label>
                  <div className="aust-input-wrap">
                    <LockIcon />
                    <input
                      id="reg-pw"
                      type={showPw ? 'text' : 'password'}
                      className="aust-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      autoComplete="new-password"
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

                <div>
                  <label className="aust-label" htmlFor="reg-cpw">Confirm Password</label>
                  <div className="aust-input-wrap">
                    <LockIcon />
                    <input
                      id="reg-cpw"
                      type={showCpw ? 'text' : 'password'}
                      className="aust-input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      className="aust-toggle-pw"
                      aria-label={showCpw ? 'Hide password' : 'Show password'}
                      onClick={() => setShowCpw((v) => !v)}
                      tabIndex={-1}
                    >
                      {showCpw ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && (
                    <div className={'aust-help ' + (passwordsMatch ? 'aust-help--ok' : 'aust-help--error')}>
                      {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                    </div>
                  )}
                </div>
              </div>

              {/* §1.1 — student signup math captcha */}
              <AuthCaptcha
                ref={captchaRef}
                value={captcha}
                onChange={onCaptchaChange}
                disabled={loading}
              />

              <label className="aust-check">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                />
                <span>
                  I acknowledge and agree to the&nbsp;
                  <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</Link>
                  &nbsp;and the&nbsp;
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>.
                </span>
              </label>

              <button
                type="submit"
                className="aust-btn aust-btn--primary aust-btn--block"
                disabled={loading || !formReady}
              >
                {loading ? (<><span className="aust-spinner" /> Creating account…</>) : 'Create Account'}
              </button>
            </form>

            <div className="aust-card__links">
              Already enrolled? <Link to="/login">Sign in here</Link>
            </div>

            <p className="aust-page-footer">
              © {new Date().getFullYear()} Abbottabad University of Science &amp; Technology · All rights reserved
            </p>
          </div>
        </div>

        {/* RIGHT — Image panel */}
        <div className="aust-auth__image-side" aria-hidden="true">
          <AuthHeroImage alt="" />

          <div className="" aria-hidden="false">
            <div className="aust-image-glass-header__brand">
              <img src="/assets/aust-logo.png" alt="" decoding="async" />
              <span>AUST · Online Admissions Portal</span>
            </div>
            <div className="aust-image-glass-header__crumb">
              <Link to="/">Home</Link>
              <span className="sep">/</span>
              <Link to="/login">Sign In</Link>
              <span className="sep">/</span>
              <span className="here">Register</span>
            </div>
          </div>

          

          <div className="aust-auth__hero-text">
            <span className="aust-auth__hero-kicker">Begin Your Admission Journey</span>
            <h2>Take the First Step Forward.</h2>
            <p>
              Create your student profile to apply for online programs across multiple faculties through a secure and merit-based admission process.
            </p>
            <div className="aust-auth__hero-stats">
              
              <div className="stat"><div className="num">Learn</div><div className="lbl">Anytime, Anywhere</div></div>
              
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Register;

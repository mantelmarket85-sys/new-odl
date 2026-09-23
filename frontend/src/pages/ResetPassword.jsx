import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import {
  MailIcon, LockIcon, AlertIcon, CheckIcon, EyeIcon, EyeOffIcon,
} from '../components/AuthIcons';
import AuthHeroImage from '../components/AuthHeroImage';
import '../styles/auth.css';

const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const emailFromUrl = params.get('email') || '';

  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !emailFromUrl) {
      setError('This recovery link is invalid or incomplete. Please request a new password reset.');
    }
  }, [token, emailFromUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    if (password !== confirmPassword) return setError('Both password fields must match exactly.');
    if (password.length < 6) return setError('Your new password must contain at least 6 characters.');

    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { email, token, password });
      setMessage(res.data.message || 'Password updated successfully. Redirecting to sign in…');
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(err.response?.data?.error || 'We could not update your password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="aust-auth">
      <section className="aust-auth__card" aria-label="Set new password">
        {/* LEFT — Form panel */}
        <div className="aust-auth__form-side">
          <div className="aust-auth__form-inner">
            <div className="aust-card__logo">
              <img src="/assets/aust-logo.png" alt="Abbottabad University Logo" decoding="async" />
              <h1 className="aust-card__title">Set a new password</h1>
              <p className="aust-card__subtitle">
                Choose a strong, memorable password to safeguard your AUST account.
              </p>
            </div>

            {error && (
              <div className="aust-alert aust-alert--error" role="alert">
                <AlertIcon /> <span>{error}</span>
              </div>
            )}
            {message && (
              <div className="aust-alert aust-alert--success" role="status">
                <CheckIcon /> <span>{message}</span>
              </div>
            )}

            <form className="aust-form" onSubmit={handleSubmit}>
              <div>
                <label className="aust-label" htmlFor="rp-email">Email Address</label>
                <div className="aust-input-wrap">
                  <MailIcon />
                  <input
                    id="rp-email"
                    type="email"
                    className="aust-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    readOnly={!!emailFromUrl}
                  />
                </div>
              </div>

              <div>
                <label className="aust-label" htmlFor="rp-pw">New Password</label>
                <div className="aust-input-wrap">
                  <LockIcon />
                  <input
                    id="rp-pw"
                    type={showPw ? 'text' : 'password'}
                    className="aust-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="aust-toggle-pw"
                    onClick={() => setShowPw(v => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                <div className="aust-help">
                  Tip: combine letters, numerals and a symbol for stronger protection.
                </div>
              </div>

              <div>
                <label className="aust-label" htmlFor="rp-cpw">Confirm New Password</label>
                <div className="aust-input-wrap">
                  <LockIcon />
                  <input
                    id="rp-cpw"
                    type={showCpw ? 'text' : 'password'}
                    className="aust-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="aust-toggle-pw"
                    onClick={() => setShowCpw(v => !v)}
                    aria-label={showCpw ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showCpw ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="aust-btn aust-btn--primary aust-btn--block"
                disabled={loading || !token}
              >
                {loading ? (<><span className="aust-spinner" /> Updating password…</>) : 'Update Password'}
              </button>
            </form>

            <div className="aust-card__links">
              <Link to="/login">Return to Sign In</Link>
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
              <img src="/assets/aust-logo.png" alt="" decoding="async" />
              <span>AUST · Online Admissions Portal</span>
            </div>
            <div className="aust-image-glass-header__crumb">
              <Link to="/">Home</Link>
              <span className="sep">/</span>
              <Link to="/login">Sign In</Link>
              <span className="sep">/</span>
              <span className="here">Reset</span>
            </div>
          </div>

          <span className="aust-image-frame__badge">
            <span className="live-dot" />
            Identity Verified · Finalise Update
          </span>

          <div className="aust-auth__hero-text">
            <span className="aust-auth__hero-kicker">Credential Lifecycle Management</span>
            <h2>Set a new password worthy of your academic record.</h2>
            <p>
              Your AUST credentials guard examination submissions, fee receipts, transcripts and graduation
              clearances. We recommend a passphrase of at least twelve characters combining upper- and
              lower-case letters, digits and a symbol — measurably stronger than the institutional minimum
              and aligned with NIST SP 800-63B guidance.
            </p>
            <div className="aust-auth__hero-trust">
              <div className="aust-auth__hero-trust__item">
                <span className="aust-auth__hero-trust__icon">✓</span>
                Stored as a salted bcrypt hash — never in plaintext
              </div>
              <div className="aust-auth__hero-trust__item">
                <span className="aust-auth__hero-trust__icon">✓</span>
                All active sessions are revoked the moment you confirm
              </div>
              <div className="aust-auth__hero-trust__item">
                <span className="aust-auth__hero-trust__icon">✓</span>
                Change recorded in the registrar's security audit ledger
              </div>
              <div className="aust-auth__hero-trust__item">
                <span className="aust-auth__hero-trust__icon">✓</span>
                Re-use of the previous five passwords is blocked by policy
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default ResetPassword;

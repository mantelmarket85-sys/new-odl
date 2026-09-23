import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { MailIcon, AlertIcon, CheckIcon } from '../components/AuthIcons';
import AuthHeroImage from '../components/AuthHeroImage';
import '../styles/auth.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');

    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setMessage(res.data.message || 'If an account exists for this email, a secure recovery link has been dispatched.');
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'We could not process your reset request. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="aust-auth">
      <section className="aust-auth__card" aria-label="Reset password">
        {/* LEFT — Form panel */}
        <div className="aust-auth__form-side">
          <div className="aust-auth__form-inner">
            <div className="aust-card__logo">
              <img src="/assets/aust-logo.png" alt="Abbottabad University Logo" decoding="async" />
              <h1 className="aust-card__title">Recover your account</h1>
              <p className="aust-card__subtitle">
                Enter the email address linked to your AUST profile and we will send a secure recovery link.
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
                <label className="aust-label" htmlFor="fp-email">Registered Email Address</label>
                <div className="aust-input-wrap">
                  <MailIcon />
                  <input
                    id="fp-email"
                    type="email"
                    className="aust-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter the email tied to your account"
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="aust-help">
                  We will dispatch a time-limited reset link valid for 15 minutes.
                </div>
              </div>

              <button
                type="submit"
                className="aust-btn aust-btn--primary aust-btn--block"
                disabled={loading || !email}
              >
                {loading ? (<><span className="aust-spinner" /> Dispatching link…</>) : 'Send Recovery Link'}
              </button>
            </form>

            <div className="aust-card__links">
              Recovered access? <Link to="/login">Return to Sign In</Link>
            </div>

            <p className="aust-page-footer">
              © {new Date().getFullYear()} Abbottabad University of Science &amp; Technology · All rights reserved
            </p>
          </div>
        </div>

        {/* RIGHT — Image panel */}
        <div className="aust-auth__image-side" aria-hidden="true">
          <AuthHeroImage alt="" />

          
          
          <div className="aust-auth__hero-text">
            <span className="aust-auth__hero-kicker">Your Privacy, Our Priority</span>
            <h2>Recover your AUST credentials securely..</h2>
            <p>
             Regain access through a secure, verified password reset process.
            </p>
            <div className="aust-auth__hero-trust">
              <div className="aust-auth__hero-trust__item">
               
              </div>
              <div className="aust-auth__hero-trust__item">
                
              </div>
              <div className="aust-auth__hero-trust__item">
                
              </div>
              <div className="aust-auth__hero-trust__item">
                
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default ForgotPassword;

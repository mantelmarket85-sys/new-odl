import React, { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from 'react';
import api from '../utils/api';
import { ShieldIcon } from './AuthIcons';

/**
 * §1.1 — Simple math CAPTCHA for the STUDENT role's signup / login pages.
 *
 * Behaviour
 *  • Generates a fresh math challenge from the backend (`GET /auth/captcha`).
 *  • Validates in real time on the client (the same challenge is re-verified
 *    server-side, so the check can never be bypassed).
 *  • Regenerates on every attempt — the parent calls `ref.refresh()` after a
 *    failed submit, and the component self-refreshes when the answer is wrong
 *    on submit or when the challenge expires.
 *
 * Props
 *   value    -> { captchaId, captchaAnswer }
 *   onChange -> (next) => void
 *   disabled -> boolean
 *
 * Ref API
 *   refresh() -> issue a brand-new challenge and clear the typed answer
 */
const AuthCaptcha = forwardRef(({ value, onChange, disabled = false }, ref) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/auth/captcha', { params: { _t: Date.now() } });
      setQuestion(res.data?.question || '');
      onChange({ captchaId: res.data?.captchaId || '', captchaAnswer: '' });
    } catch (err) {
      setQuestion('');
      setError('Could not load the security check. Click the refresh icon to try again.');
      onChange({ captchaId: '', captchaAnswer: '' });
    } finally {
      setLoading(false);
    }
    // onChange is stable in practice (parent uses a setState wrapper)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = value?.captchaAnswer ?? '';

  return (
    <div className="aust-captcha">
      <label className="aust-label" htmlFor="auth-captcha-answer">
        Security Check — solve the sum
      </label>
      <div className="aust-captcha__row">
        <div className="aust-captcha__challenge" aria-live="polite">
          {loading ? 'Loading…' : (question || '— — —')}
        </div>
        <button
          type="button"
          className="aust-captcha__refresh"
          onClick={refresh}
          disabled={loading || disabled}
          title="Get a new question"
          aria-label="Refresh the security check question"
        >
          <i className="fas fa-rotate-right" aria-hidden="true"></i>
        </button>
        <div className="aust-input-wrap aust-captcha__input-wrap">
          <ShieldIcon />
          <input
            id="auth-captcha-answer"
            name="captchaAnswer"
            className="aust-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Your answer"
            aria-label="Answer to the security check question"
            value={answer}
            disabled={disabled}
            onChange={(e) => {
              // Digits (and a leading minus) only — keeps the answer numeric.
              const cleaned = e.target.value.replace(/[^\d-]/g, '');
              onChange({ captchaId: value?.captchaId || '', captchaAnswer: cleaned });
            }}
            required
          />
        </div>
      </div>
      {error
        ? <div className="aust-help aust-help--error">{error}</div>
        : <div className="aust-help">Type the numeric answer to confirm you are not a robot.</div>}
    </div>
  );
});

AuthCaptcha.displayName = 'AuthCaptcha';

export default AuthCaptcha;

import React, { useEffect, useState } from 'react';
import api from '../utils/api';

/**
 * Reusable Captcha component.
 * Fetches a math captcha from the backend and provides controlled
 * captchaId + captchaAnswer values to the parent via onChange.
 *
 * Props:
 *   value    -> { captchaId, captchaAnswer }
 *   onChange -> (next) => void
 */
const Captcha = ({ value, onChange }) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/auth/captcha');
      setQuestion(res.data.question);
      onChange({ captchaId: res.data.captchaId, captchaAnswer: '' });
    } catch (err) {
      setError('Failed to load captcha. Click refresh to try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="form-group" style={{ marginTop: '0.85rem' }}>
      <label>
        <i className="fas fa-shield-alt" style={{ marginRight: 6, color: '#2563eb' }}></i>
        Security Check (Captcha) <span style={{ color: '#dc2626' }}>*</span>
      </label>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{
          flex: '0 0 auto',
          padding: '8px 14px',
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          color: '#fff',
          borderRadius: '6px',
          fontFamily: '"Courier New", monospace',
          fontSize: '1.05rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          minWidth: '160px',
          textAlign: 'center',
          userSelect: 'none',
        }}>
          {loading ? 'Loading…' : (question || '— — —')}
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={refresh}
          disabled={loading}
          title="Refresh captcha"
          style={{ padding: '8px 12px' }}
        >
          <i className="fas fa-sync-alt"></i>
        </button>
      </div>
      <input
        type="text"
        inputMode="numeric"
        placeholder="Enter your answer"
        value={value?.captchaAnswer || ''}
        onChange={(e) => onChange({ captchaId: value?.captchaId || '', captchaAnswer: e.target.value })}
        required
      />
      {error && <small style={{ color: '#dc2626' }}>{error}</small>}
    </div>
  );
};

export default Captcha;

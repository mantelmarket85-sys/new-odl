import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

const MeritSection = () => {
  const [myEntries, setMyEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMerit();
    // Real-time refresh — keep merit list & rank in sync with director edits
    const t = setInterval(loadMerit, 10000);
    const onFocus = () => loadMerit();
    const onVisible = () => { if (document.visibilityState === 'visible') loadMerit(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const loadMerit = async () => {
    try {
      const res = await api.get('/merit');
      setMyEntries(res.data.myEntries || []);
    } catch {} finally { setLoading(false); }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      <h2 className="section-title">My Merit</h2>
      <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 1rem' }}>
        <i className="fas fa-lock" style={{ marginRight: 6 }}></i>
        You can only see <strong>your own</strong> merit score, rank and status. Merit for each program you applied to is shown separately.
      </p>

      {myEntries.length > 0 ? (
        <div className="card">
          <div className="card-header">Your Merit Score</div>
          {myEntries.map(entry => (
            <div key={entry.id} style={{ marginBottom: '1rem', padding: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fafbfc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
                <div>
                  <p style={{ fontWeight: 700, color: '#1a2744', fontSize: '1rem', margin: 0 }}>{entry.application?.program?.name}</p>
                  {entry.application?.program?.department?.name && (
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '2px 0 0' }}>{entry.application.program.department.name}</p>
                  )}
                </div>
                <span className={`badge badge-${entry.isFinalized ? 'selected' : 'pending'}`}>
                  {entry.isFinalized ? 'FINALIZED' : 'DRAFT'}
                </span>
              </div>
              <div className="stats-grid" style={{ marginBottom: '0.75rem' }}>
                <div className="stat-card">
                  <div className="stat-value" style={{ fontSize: '1.3rem' }}>{entry.matricPercent.toFixed(1)}%</div>
                  <div className="stat-label">Matric</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Weighted: {entry.matricWeighted?.toFixed(2) || '-'}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ fontSize: '1.3rem' }}>{entry.fscPercent.toFixed(1)}%</div>
                  <div className="stat-label">FSc/Inter</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Weighted: {entry.fscWeighted?.toFixed(2) || '-'}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ fontSize: '1.3rem' }}>{entry.interviewMarks.toFixed(1)}</div>
                  <div className="stat-label">Interview</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>Weighted: {entry.interviewWeighted?.toFixed(2) || '-'}</div>
                </div>
                <div className="stat-card" style={{ border: '2px solid #059669' }}>
                  <div className="stat-value" style={{ color: '#059669', fontSize: '1.3rem' }}>{entry.totalMerit.toFixed(2)}%</div>
                  <div className="stat-label">Total Merit</div>
                </div>
              </div>
              {entry.rank && (
                <div style={{ marginTop: '1rem', textAlign: 'center', padding: '0.75rem', background: 'linear-gradient(135deg, #1a2744, #2563eb)', borderRadius: '8px' }}>
                  <span style={{ color: '#fff', fontSize: '0.85rem', opacity: 0.9 }}>Your Rank</span>
                  <div style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 700 }}>#{entry.rank}</div>
                </div>
              )}
              {!entry.isFinalized && (
                <div className="alert alert-info" style={{ marginTop: '1rem', marginBottom: 0 }}>
                  <i className="fas fa-info-circle" style={{ marginRight: 6 }}></i>
                  The merit list is currently in <strong>draft</strong>. Your final rank and fee payment eligibility will be confirmed once the Director publishes the official list. This page refreshes automatically.
                </div>
              )}
              {entry.isFinalized && (
                <div className="alert alert-success" style={{ marginTop: '1rem', marginBottom: 0 }}>
                  <i className="fas fa-check-circle" style={{ marginRight: 6 }}></i>
                  Congratulations — you have been selected for admission. Please open the <strong>Fee</strong> tab to complete your admission fee payment within the deadline.
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🏆</div>
            <p style={{ fontWeight: 600, color: '#1a2744' }}>Your merit score is not available yet.</p>
            <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: 520, margin: '0.5rem auto 0' }}>
              Merit is calculated automatically after the Coordinator completes your interview. Once published, your rank and total merit percentage will appear here.
            </p>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.75rem' }}>
              Admission workflow: Application → Interview → Merit Calculation → Merit List Finalization → Fee Payment → Enrollment
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeritSection;

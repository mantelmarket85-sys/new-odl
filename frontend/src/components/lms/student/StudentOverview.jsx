import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const StudentOverview = ({ onTabChange }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/lms/student/dashboard')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><span className="spinner"></span></div>;
  if (!data) return <div className="alert alert-error">Failed to load dashboard</div>;

  const { stats, recentSubmissions, announcements, enrollment } = data;

  return (
    <div>
      <div className="card" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)', color: '#fff', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>Welcome back,</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '4px 0' }}>{enrollment?.lmsUsername || 'Student'}</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Roll Number: <strong>{enrollment?.rollNumber || '—'}</strong></div>
          </div>
          <div style={{ fontSize: '3rem' }}>🎓</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onTabChange('courses')}>
          <div className="stat-value" style={{ color: '#2563eb' }}>{stats.coursesCount}</div>
          <div className="stat-label">Enrolled Courses</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => onTabChange('assignments')}>
          <div className="stat-value" style={{ color: '#d97706' }}>{stats.pendingAssignments}</div>
          <div className="stat-label">Pending Assignments</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{stats.submittedCount}</div>
          <div className="stat-label">Submitted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#1a2744' }}>{stats.totalAssignments}</div>
          <div className="stat-label">Total Assignments</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <div className="card-header">📋 Recent Submissions</div>
          {recentSubmissions.length === 0 ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '1rem' }}>No submissions yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentSubmissions.map(s => (
                <div key={s.id} style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 600, color: '#1a2744', fontSize: '0.88rem' }}>{s.assignment.title}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                    {s.assignment.course.code} — {s.assignment.course.title}
                  </div>
                  <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={`badge ${s.status === 'GRADED' ? 'badge-success' : s.status === 'LATE' ? 'badge-warning' : 'badge-info'}`}>
                      {s.status}
                    </span>
                    {s.marks !== null && <span style={{ fontWeight: 700, color: '#16a34a', fontSize: '0.85rem' }}>{s.marks}/{s.assignment.totalMarks}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">📢 Announcements</div>
          {announcements.length === 0 ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '1rem' }}>No announcements.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {announcements.map(a => (
                <div key={a.id} style={{ padding: '0.75rem', background: a.courseId ? '#f8fafc' : '#fef3c7', borderRadius: '6px', borderLeft: `3px solid ${a.courseId ? '#2563eb' : '#d97706'}` }}>
                  <div style={{ fontWeight: 600, color: '#1a2744', fontSize: '0.88rem' }}>{a.title}</div>
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px', lineHeight: 1.5 }}>{a.message}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px' }}>
                    {a.course ? `${a.course.code} • ` : 'LMS Admin • '}{new Date(a.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentOverview;

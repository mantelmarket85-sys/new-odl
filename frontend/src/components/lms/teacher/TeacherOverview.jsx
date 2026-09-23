import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const TeacherOverview = ({ onOpenCourse }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/lms/teacher/dashboard')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><span className="spinner"></span></div>;
  if (!data) return <div className="alert alert-error">Failed to load dashboard</div>;

  const { profile, stats, courses, recentSubmissions } = data;

  return (
    <div>
      <div className="card" style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>Welcome back,</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '4px 0' }}>
              {profile ? `${profile.firstName || ''} ${profile.lastName || ''}` : 'Teacher'}
            </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{profile?.designation || 'Faculty Member'} • {profile?.department || 'Computer Science'}</div>
          </div>
          <div style={{ fontSize: '3rem' }}>👨‍🏫</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{stats.coursesCount}</div>
          <div className="stat-label">My Courses</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{stats.totalStudents}</div>
          <div className="stat-label">Total Students</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#d97706' }}>{stats.pendingGrading}</div>
          <div className="stat-label">Pending Grading</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#1a2744' }}>{stats.totalSubmissions}</div>
          <div className="stat-label">Total Submissions</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <div className="card-header">📚 My Courses</div>
          {courses.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>No courses assigned.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {courses.map(c => (
                <div key={c.id} onClick={() => onOpenCourse(c.id)} style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '6px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#1a2744', fontSize: '0.9rem' }}>
                      <span style={{ background: '#16a34a', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', marginRight: '6px' }}>{c.code}</span>
                      {c.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                      👥 {c._count.enrollments} students • 📖 {c._count.lessons} lessons • 📝 {c._count.assignments} assignments
                    </div>
                  </div>
                  <span style={{ color: '#94a3b8' }}>→</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">⏱️ Recent Submissions</div>
          {recentSubmissions.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>No submissions yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentSubmissions.map(s => (
                <div key={s.id} style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a2744' }}>
                    {s.student.profile?.firstName || s.student.email}: {s.assignment.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                    {s.assignment.course.code} • <span className={`badge ${s.status === 'GRADED' ? 'badge-success' : s.status === 'LATE' ? 'badge-warning' : 'badge-info'}`}>{s.status}</span>
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

export default TeacherOverview;

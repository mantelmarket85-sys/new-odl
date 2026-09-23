import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const AdminLmsOverview = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/lms/admin/dashboard')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><span className="spinner"></span></div>;
  if (!data) return <div className="alert alert-error">Failed to load dashboard</div>;

  const { stats, recentEnrollments, recentSubmissions } = data;

  return (
    <div>
      <div className="card" style={{ background: 'linear-gradient(135deg, #1a2744 0%, #1e40af 100%)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>LMS Administration</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '4px 0' }}>System Overview</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Manage courses, teachers, and student enrollments</div>
          </div>
          <div style={{ fontSize: '3rem' }}>⚙️</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{stats.totalCourses}</div>
          <div className="stat-label">Total Courses</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{stats.activeCourses}</div>
          <div className="stat-label">Active Courses</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#d97706' }}>{stats.totalTeachers}</div>
          <div className="stat-label">Teachers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#0891b2' }}>{stats.totalStudents}</div>
          <div className="stat-label">LMS Students</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#1a2744' }}>{stats.totalEnrollments}</div>
          <div className="stat-label">Course Enrollments</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#7c3aed' }}>{stats.totalLessons}</div>
          <div className="stat-label">Lessons</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#dc2626' }}>{stats.totalAssignments}</div>
          <div className="stat-label">Assignments</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{stats.gradedSubmissions}</div>
          <div className="stat-label">Graded</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        <div className="card">
          <div className="card-header">🆕 Recent Enrollments</div>
          {recentEnrollments.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>None.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentEnrollments.map(e => (
                <div key={e.id} style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a2744' }}>
                    {e.student.profile ? `${e.student.profile.firstName || ''} ${e.student.profile.lastName || ''}` : e.student.email}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                    Enrolled in <strong>{e.course.code}</strong> — {e.course.title}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>{new Date(e.enrolledAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">📝 Recent Submissions</div>
          {recentSubmissions.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>None.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentSubmissions.map(s => (
                <div key={s.id} style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a2744' }}>{s.assignment.title}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                    {s.student.profile?.firstName || s.student.email} • {s.assignment.course.code}
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <span className={`badge ${s.status === 'GRADED' ? 'badge-success' : s.status === 'LATE' ? 'badge-warning' : 'badge-info'}`}>{s.status}</span>
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

export default AdminLmsOverview;

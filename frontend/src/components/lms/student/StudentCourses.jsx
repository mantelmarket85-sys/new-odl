import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const StudentCourses = ({ onOpenCourse }) => {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/lms/student/courses')
      .then(r => setEnrollments(r.data.enrollments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      <div className="card-header" style={{ marginBottom: '1rem' }}>📚 My Courses</div>
      {enrollments.length === 0 ? (
        <div className="card">
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>
            You are not enrolled in any courses yet. The admin will enroll you shortly.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {enrollments.map(e => {
            const c = e.course;
            const tp = c.teacher?.teacherProfile;
            return (
              <div key={e.id} className="card" style={{ cursor: 'pointer', transition: 'transform 0.2s' }} onClick={() => onOpenCourse(c.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                  <div style={{ background: '#2563eb', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {c.code}
                  </div>
                  <span className={`badge ${c.isActive ? 'badge-success' : 'badge-secondary'}`}>{c.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <h3 style={{ fontSize: '1rem', color: '#1a2744', marginBottom: '0.5rem' }}>{c.title}</h3>
                <p style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5, marginBottom: '0.75rem', minHeight: '2.5rem' }}>
                  {c.description || 'No description.'}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem' }}>
                  <span>👨‍🏫 {tp ? `${tp.firstName} ${tp.lastName}` : (c.teacher?.email || 'No teacher')}</span>
                  <span>{c.creditHours} CH</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                  <span>📖 {c._count?.lessons || 0} lessons</span>
                  <span>📝 {c._count?.assignments || 0} assignments</span>
                </div>
                {e.finalGrade && (
                  <div style={{ marginTop: '0.5rem', padding: '6px 10px', background: '#dcfce7', borderRadius: '6px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, color: '#15803d' }}>
                    Final Grade: {e.finalGrade}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentCourses;

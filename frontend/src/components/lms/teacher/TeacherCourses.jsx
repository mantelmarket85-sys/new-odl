import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const TeacherCourses = ({ onOpenCourse }) => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/lms/teacher/courses')
      .then(r => setCourses(r.data.courses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      <div className="card-header" style={{ marginBottom: '1rem' }}>📚 Courses I Teach</div>
      {courses.length === 0 ? (
        <div className="card">
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>
            No courses assigned to you yet. The admin will assign courses shortly.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {courses.map(c => (
            <div key={c.id} className="card" style={{ cursor: 'pointer' }} onClick={() => onOpenCourse(c.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                <div style={{ background: '#16a34a', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                  {c.code}
                </div>
                <span className={`badge ${c.isActive ? 'badge-success' : 'badge-secondary'}`}>{c.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <h3 style={{ fontSize: '1rem', color: '#1a2744', marginBottom: '0.5rem' }}>{c.title}</h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5, marginBottom: '0.75rem', minHeight: '2.5rem' }}>{c.description || 'No description.'}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', fontSize: '0.75rem', color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, color: '#1a2744' }}>{c._count?.enrollments || 0}</div>
                  <div style={{ color: '#94a3b8' }}>Students</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, color: '#1a2744' }}>{c._count?.lessons || 0}</div>
                  <div style={{ color: '#94a3b8' }}>Lessons</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, color: '#1a2744' }}>{c._count?.assignments || 0}</div>
                  <div style={{ color: '#94a3b8' }}>Assignments</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherCourses;

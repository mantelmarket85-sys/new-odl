import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const StudentAssignments = ({ onOpenCourse }) => {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.get('/lms/student/grades')
      .then(r => setEnrollments(r.data.enrollments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  // Flatten assignments across courses
  const allAssignments = [];
  enrollments.forEach(e => {
    (e.course.assignments || []).forEach(a => {
      const sub = (a.submissions || [])[0];
      allAssignments.push({ ...a, course: e.course, submission: sub });
    });
  });

  const filtered = allAssignments.filter(a => {
    if (filter === 'pending') return !a.submission;
    if (filter === 'submitted') return a.submission && a.submission.status !== 'GRADED';
    if (filter === 'graded') return a.submission && a.submission.status === 'GRADED';
    return true;
  }).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
        <div className="card-header" style={{ margin: 0, padding: 0, border: 'none' }}>📝 All Assignments</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { k: 'all', l: 'All' },
            { k: 'pending', l: 'Pending' },
            { k: 'submitted', l: 'Submitted' },
            { k: 'graded', l: 'Graded' },
          ].map(t => (
            <button key={t.k} className={`btn btn-sm ${filter === t.k ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(t.k)}>{t.l}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>No assignments found.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map(a => {
            const past = new Date() > new Date(a.deadline);
            return (
              <div key={a.id} className="card" style={{ marginBottom: 0, cursor: 'pointer' }} onClick={() => onOpenCourse(a.course.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                        {a.course.code}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{a.course.title}</span>
                    </div>
                    <h4 style={{ color: '#1a2744', fontSize: '0.95rem' }}>{a.title}</h4>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '0.78rem', color: '#64748b', flexWrap: 'wrap' }}>
                      <span>📅 {a.deadline}</span>
                      <span>🎯 {a.totalMarks} marks</span>
                      {past && !a.submission && <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠️ Past Deadline</span>}
                    </div>
                  </div>
                  <div style={{ minWidth: '110px', textAlign: 'right' }}>
                    {a.submission ? (
                      <>
                        <span className={`badge ${a.submission.status === 'GRADED' ? 'badge-success' : a.submission.status === 'LATE' ? 'badge-warning' : 'badge-info'}`}>
                          {a.submission.status}
                        </span>
                        {a.submission.marks !== null && (
                          <div style={{ marginTop: '4px', fontWeight: 700, color: '#16a34a' }}>{a.submission.marks}/{a.totalMarks}</div>
                        )}
                      </>
                    ) : (
                      <span className="badge badge-warning">PENDING</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentAssignments;

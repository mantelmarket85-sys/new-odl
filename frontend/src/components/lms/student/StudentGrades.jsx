import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const StudentGrades = () => {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/lms/student/grades')
      .then(r => setEnrollments(r.data.enrollments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      <div className="card-header" style={{ marginBottom: '1rem' }}>📊 My Grades</div>

      {enrollments.length === 0 ? (
        <div className="card"><p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>No courses enrolled.</p></div>
      ) : (
        enrollments.map(e => {
          const c = e.course;
          const assignments = c.assignments || [];
          const graded = assignments.filter(a => a.submissions[0]?.status === 'GRADED');
          const totalEarned = graded.reduce((s, a) => s + (a.submissions[0]?.marks || 0), 0);
          const totalPossible = graded.reduce((s, a) => s + a.totalMarks, 0);
          const percent = totalPossible > 0 ? ((totalEarned / totalPossible) * 100).toFixed(1) : null;

          return (
            <div key={e.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '2px solid #edf2f7' }}>
                <div>
                  <span style={{ background: '#2563eb', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, marginRight: '8px' }}>{c.code}</span>
                  <strong style={{ color: '#1a2744' }}>{c.title}</strong>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {percent !== null && (
                    <div style={{ background: '#f0fdf4', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#15803d' }}>
                      Avg: {percent}%
                    </div>
                  )}
                  {e.finalGrade && (
                    <div style={{ background: '#dcfce7', padding: '6px 12px', borderRadius: '6px', fontSize: '0.95rem', fontWeight: 700, color: '#15803d' }}>
                      Final: {e.finalGrade}
                    </div>
                  )}
                </div>
              </div>

              {assignments.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No assignments yet.</p>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Assignment</th>
                        <th>Deadline</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map(a => {
                        const sub = a.submissions[0];
                        return (
                          <tr key={a.id}>
                            <td>{a.title}</td>
                            <td>{a.deadline}</td>
                            <td>
                              {sub ? (
                                <span className={`badge ${sub.status === 'GRADED' ? 'badge-success' : sub.status === 'LATE' ? 'badge-warning' : 'badge-info'}`}>{sub.status}</span>
                              ) : <span className="badge badge-warning">PENDING</span>}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                              {sub?.marks !== null && sub?.marks !== undefined ? `${sub.marks}/${a.totalMarks}` : `—/${a.totalMarks}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default StudentGrades;

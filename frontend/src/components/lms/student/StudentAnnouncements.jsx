import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const StudentAnnouncements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/lms/student/announcements')
      .then(r => setAnnouncements(r.data.announcements || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      <div className="card-header" style={{ marginBottom: '1rem' }}>📢 All Announcements</div>
      {announcements.length === 0 ? (
        <div className="card"><p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>No announcements.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {announcements.map(a => (
            <div key={a.id} className="card" style={{ marginBottom: 0, borderLeft: `4px solid ${a.courseId ? '#2563eb' : '#d97706'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                    {a.course ? (
                      <span style={{ background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                        {a.course.code}
                      </span>
                    ) : (
                      <span style={{ background: '#d97706', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                        LMS-WIDE
                      </span>
                    )}
                    <h4 style={{ color: '#1a2744', fontSize: '0.95rem', margin: 0 }}>{a.title}</h4>
                  </div>
                  <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6 }}>{a.message}</p>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '6px' }}>
                    {a.author?.teacherProfile ? `${a.author.teacherProfile.firstName} ${a.author.teacherProfile.lastName}` : a.author?.email}
                    {' • '}{new Date(a.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentAnnouncements;

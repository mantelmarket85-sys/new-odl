import React, { useState, useEffect } from 'react';
import api, { getFileUrl } from '../../../utils/api';

const StudentCourseDetail = ({ courseId, onBack }) => {
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('lessons');
  const [openLesson, setOpenLesson] = useState(null);
  const [submitFor, setSubmitFor] = useState(null);
  const [submitForm, setSubmitForm] = useState({ content: '', file: null });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    api.get(`/lms/student/courses/${courseId}`)
      .then(r => setCourse(r.data.course))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [courseId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg('');
    try {
      const fd = new FormData();
      if (submitForm.content) fd.append('content', submitForm.content);
      if (submitForm.file) fd.append('file', submitForm.file);
      await api.post(`/lms/student/assignments/${submitFor.id}/submit`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMsg('Submitted successfully!');
      setSubmitFor(null);
      setSubmitForm({ content: '', file: null });
      load();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;
  if (!course) return <div className="alert alert-error">Course not found</div>;

  const tp = course.teacher?.teacherProfile;

  return (
    <div>
      <button className="btn btn-outline btn-sm" onClick={onBack} style={{ marginBottom: '1rem' }}>← Back to Courses</button>

      <div className="card" style={{ background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>{course.code} • Semester {course.semester} • {course.creditHours} Credit Hours</div>
            <h2 style={{ fontSize: '1.4rem', margin: '4px 0' }}>{course.title}</h2>
            <p style={{ fontSize: '0.85rem', opacity: 0.9 }}>{course.description}</p>
            <p style={{ fontSize: '0.82rem', marginTop: '8px' }}>👨‍🏫 {tp ? `${tp.firstName} ${tp.lastName} (${tp.designation || ''})` : (course.teacher?.email || 'No teacher assigned')}</p>
          </div>
        </div>
      </div>

      {msg && <div className={`alert ${msg.includes('success') ? 'alert-success' : 'alert-error'}`}>{msg}</div>}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', flexWrap: 'wrap', borderBottom: '2px solid #e2e8f0', paddingBottom: '4px' }}>
        {[
          { k: 'lessons', l: '📖 Lessons', n: course.lessons?.length },
          { k: 'assignments', l: '📝 Assignments', n: course.assignments?.length },
          { k: 'materials', l: '📎 Materials', n: course.materials?.length },
          { k: 'announcements', l: '📢 Announcements', n: course.announcements?.length },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className="btn btn-sm" style={{
            background: tab === t.k ? '#2563eb' : 'transparent',
            color: tab === t.k ? '#fff' : '#475569',
            border: 'none',
          }}>
            {t.l} {t.n > 0 && <span style={{ marginLeft: '4px', fontSize: '0.72rem', opacity: 0.85 }}>({t.n})</span>}
          </button>
        ))}
      </div>

      {tab === 'lessons' && (
        <div className="card">
          <div className="card-header">📖 Course Lessons</div>
          {(!course.lessons || course.lessons.length === 0) ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem 0' }}>No lessons posted yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {course.lessons.map(l => (
                <div key={l.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <div onClick={() => setOpenLesson(openLesson === l.id ? null : l.id)} style={{ padding: '0.85rem 1rem', background: openLesson === l.id ? '#eff6ff' : '#f8fafc', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ background: '#1a2744', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', marginRight: '8px' }}>Week {l.weekNumber}</span>
                      <span style={{ fontWeight: 600, color: '#1a2744' }}>{l.title}</span>
                    </div>
                    <span style={{ color: '#64748b' }}>{openLesson === l.id ? '▲' : '▼'}</span>
                  </div>
                  {openLesson === l.id && (
                    <div style={{ padding: '1rem', background: '#fff' }}>
                      {l.content && <div style={{ color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{l.content}</div>}
                      {l.videoUrl && (
                        <a href={l.videoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-info btn-sm" style={{ marginTop: '0.75rem', display: 'inline-flex' }}>
                          🎥 Watch Video
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'assignments' && (
        <div className="card">
          <div className="card-header">📝 Assignments</div>
          {(!course.assignments || course.assignments.length === 0) ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem 0' }}>No assignments posted yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {course.assignments.map(a => {
                const sub = a.submissions && a.submissions[0];
                const past = new Date() > new Date(a.deadline);
                return (
                  <div key={a.id} style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ color: '#1a2744', fontSize: '0.95rem' }}>{a.title}</h4>
                        <p style={{ fontSize: '0.82rem', color: '#475569', marginTop: '4px', lineHeight: 1.5 }}>{a.description}</p>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '0.78rem', color: '#64748b', flexWrap: 'wrap' }}>
                          <span>📅 Deadline: <strong>{a.deadline}</strong></span>
                          <span>🎯 Total Marks: <strong>{a.totalMarks}</strong></span>
                          {past && !sub && <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠️ Past Deadline</span>}
                        </div>
                      </div>
                      <div style={{ minWidth: '120px', textAlign: 'right' }}>
                        {sub ? (
                          <div>
                            <span className={`badge ${sub.status === 'GRADED' ? 'badge-success' : sub.status === 'LATE' ? 'badge-warning' : 'badge-info'}`}>{sub.status}</span>
                            {sub.marks !== null && (
                              <div style={{ marginTop: '6px', fontSize: '1rem', fontWeight: 700, color: '#16a34a' }}>{sub.marks}/{a.totalMarks}</div>
                            )}
                          </div>
                        ) : (
                          <button className="btn btn-primary btn-sm" onClick={() => setSubmitFor(a)}>Submit</button>
                        )}
                      </div>
                    </div>
                    {sub && sub.feedback && (
                      <div style={{ marginTop: '8px', padding: '8px 12px', background: '#fef3c7', borderRadius: '6px', fontSize: '0.82rem', color: '#92400e' }}>
                        <strong>Feedback:</strong> {sub.feedback}
                      </div>
                    )}
                    {sub && (
                      <div style={{ marginTop: '8px', fontSize: '0.78rem', color: '#64748b' }}>
                        Submitted: {new Date(sub.submittedAt).toLocaleString()}
                        {sub.fileName && <span> • 📎 {sub.fileName}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'materials' && (
        <div className="card">
          <div className="card-header">📎 Course Materials</div>
          {(!course.materials || course.materials.length === 0) ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem 0' }}>No materials yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {course.materials.map(m => (
                <div key={m.id} style={{ padding: '0.75rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#1a2744', fontSize: '0.9rem' }}>
                      {m.type === 'LINK' ? '🔗' : m.type === 'VIDEO' ? '🎥' : '📄'} {m.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                      {m.fileName || m.url}
                    </div>
                  </div>
                  {m.filePath ? (
                    <a href={getFileUrl(m.filePath)} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">Download</a>
                  ) : m.url ? (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">Open</a>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'announcements' && (
        <div className="card">
          <div className="card-header">📢 Course Announcements</div>
          {(!course.announcements || course.announcements.length === 0) ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem 0' }}>No announcements yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {course.announcements.map(a => (
                <div key={a.id} style={{ padding: '0.85rem 1rem', background: '#f8fafc', borderLeft: '3px solid #2563eb', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 600, color: '#1a2744' }}>{a.title}</div>
                  <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '4px', lineHeight: 1.5 }}>{a.message}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                    {a.author?.teacherProfile ? `${a.author.teacherProfile.firstName} ${a.author.teacherProfile.lastName}` : a.author?.email} • {new Date(a.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submit modal */}
      {submitFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }} onClick={() => setSubmitFor(null)}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', margin: 0 }} onClick={e => e.stopPropagation()}>
            <div className="card-header">Submit: {submitFor.title}</div>
            <form onSubmit={handleSubmit}>
              <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                <label>Text Submission (optional)</label>
                <textarea rows={5} value={submitForm.content} onChange={e => setSubmitForm({ ...submitForm, content: e.target.value })} placeholder="Type your answer or notes here..." />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>File Upload (optional)</label>
                <input type="file" onChange={e => setSubmitForm({ ...submitForm, file: e.target.files[0] })} />
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>PDF, DOC, ZIP, images up to 10MB</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setSubmitFor(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentCourseDetail;

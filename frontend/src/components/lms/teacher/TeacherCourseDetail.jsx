import React, { useState, useEffect } from 'react';
import api, { getFileUrl } from '../../../utils/api';

const emptyLesson = { title: '', content: '', videoUrl: '', weekNumber: 1, order: 0, isPublished: true };
const emptyAssignment = { title: '', description: '', totalMarks: 100, deadline: '', isPublished: true };
const emptyMaterial = { title: '', type: 'FILE', url: '', file: null };
const emptyAnnouncement = { title: '', message: '' };

const TeacherCourseDetail = ({ courseId, onBack }) => {
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('students');
  const [msg, setMsg] = useState('');

  // Modals/forms
  const [lessonForm, setLessonForm] = useState(null); // null | emptyLesson | existing
  const [assignmentForm, setAssignmentForm] = useState(null);
  const [materialForm, setMaterialForm] = useState(null);
  const [announcementForm, setAnnouncementForm] = useState(null);
  const [gradingFor, setGradingFor] = useState(null);

  const load = () => {
    setLoading(true);
    api.get(`/lms/teacher/courses/${courseId}`)
      .then(r => setCourse(r.data.course))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [courseId]);

  const showMsg = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3000); };

  // ─── Lesson handlers ─────────────────────────────────────
  const saveLesson = async (e) => {
    e.preventDefault();
    try {
      if (lessonForm.id) {
        await api.put(`/lms/teacher/lessons/${lessonForm.id}`, lessonForm);
        showMsg('Lesson updated');
      } else {
        await api.post(`/lms/teacher/courses/${courseId}/lessons`, lessonForm);
        showMsg('Lesson created');
      }
      setLessonForm(null);
      load();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed');
    }
  };

  const deleteLesson = async (id) => {
    if (!confirm('Delete this lesson?')) return;
    await api.delete(`/lms/teacher/lessons/${id}`);
    load();
  };

  // ─── Assignment handlers ─────────────────────────────────
  const saveAssignment = async (e) => {
    e.preventDefault();
    try {
      if (assignmentForm.id) {
        await api.put(`/lms/teacher/assignments/${assignmentForm.id}`, assignmentForm);
        showMsg('Assignment updated');
      } else {
        await api.post(`/lms/teacher/courses/${courseId}/assignments`, assignmentForm);
        showMsg('Assignment created');
      }
      setAssignmentForm(null);
      load();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed');
    }
  };

  const deleteAssignment = async (id) => {
    if (!confirm('Delete this assignment? All submissions will be removed.')) return;
    await api.delete(`/lms/teacher/assignments/${id}`);
    load();
  };

  // ─── Material handlers ───────────────────────────────────
  const saveMaterial = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('title', materialForm.title);
      fd.append('type', materialForm.type);
      if (materialForm.url) fd.append('url', materialForm.url);
      if (materialForm.file) fd.append('file', materialForm.file);
      await api.post(`/lms/teacher/courses/${courseId}/materials`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showMsg('Material added');
      setMaterialForm(null);
      load();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed');
    }
  };

  const deleteMaterial = async (id) => {
    if (!confirm('Delete this material?')) return;
    await api.delete(`/lms/teacher/materials/${id}`);
    load();
  };

  // ─── Announcement handlers ───────────────────────────────
  const saveAnnouncement = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/lms/teacher/courses/${courseId}/announcements`, announcementForm);
      showMsg('Announcement posted');
      setAnnouncementForm(null);
      load();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed');
    }
  };

  const deleteAnnouncement = async (id) => {
    if (!confirm('Delete announcement?')) return;
    await api.delete(`/lms/teacher/announcements/${id}`);
    load();
  };

  // ─── Final grade ─────────────────────────────────────────
  const setFinalGrade = async (enrollmentId, finalGrade) => {
    await api.put(`/lms/teacher/enrollments/${enrollmentId}/grade`, { finalGrade });
    showMsg('Final grade saved');
    load();
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;
  if (!course) return <div className="alert alert-error">Course not found</div>;

  return (
    <div>
      <button className="btn btn-outline btn-sm" onClick={onBack} style={{ marginBottom: '1rem' }}>← Back to Courses</button>

      <div className="card" style={{ background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)', color: '#fff' }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>{course.code} • Semester {course.semester} • {course.creditHours} CH</div>
        <h2 style={{ fontSize: '1.4rem', margin: '4px 0' }}>{course.title}</h2>
        <p style={{ fontSize: '0.85rem', opacity: 0.9 }}>{course.description}</p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', flexWrap: 'wrap', borderBottom: '2px solid #e2e8f0', paddingBottom: '4px' }}>
        {[
          { k: 'students', l: '👥 Students', n: course.enrollments?.length },
          { k: 'lessons', l: '📖 Lessons', n: course.lessons?.length },
          { k: 'assignments', l: '📝 Assignments', n: course.assignments?.length },
          { k: 'materials', l: '📎 Materials', n: course.materials?.length },
          { k: 'announcements', l: '📢 Announcements', n: course.announcements?.length },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className="btn btn-sm" style={{
            background: tab === t.k ? '#16a34a' : 'transparent',
            color: tab === t.k ? '#fff' : '#475569',
            border: 'none',
          }}>
            {t.l} {t.n > 0 && <span style={{ marginLeft: '4px', fontSize: '0.72rem', opacity: 0.85 }}>({t.n})</span>}
          </button>
        ))}
      </div>

      {/* STUDENTS / GRADEBOOK */}
      {tab === 'students' && (
        <div className="card">
          <div className="card-header">👥 Enrolled Students & Final Grades</div>
          {course.enrollments.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem 0' }}>No students enrolled yet.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Roll Number</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Final Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {course.enrollments.map(en => {
                    const p = en.student.profile;
                    return (
                      <tr key={en.id}>
                        <td>{p ? `${p.firstName || ''} ${p.lastName || ''}` : '—'}</td>
                        <td>{en.student.enrollment?.rollNumber || '—'}</td>
                        <td>{en.student.email}</td>
                        <td><span className={`badge ${en.status === 'ACTIVE' ? 'badge-info' : en.status === 'COMPLETED' ? 'badge-success' : 'badge-secondary'}`}>{en.status}</span></td>
                        <td>
                          <select
                            defaultValue={en.finalGrade || ''}
                            onChange={(e) => setFinalGrade(en.id, e.target.value)}
                            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e0' }}
                          >
                            <option value="">— Not graded —</option>
                            {['A', 'B+', 'B', 'C+', 'C', 'D', 'F'].map(g => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* LESSONS */}
      {tab === 'lessons' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ color: '#1a2744', fontSize: '1rem' }}>📖 Lessons</h3>
            <button className="btn btn-success btn-sm" onClick={() => setLessonForm({ ...emptyLesson })}>+ Add Lesson</button>
          </div>
          {course.lessons.length === 0 ? (
            <div className="card"><p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem 0' }}>No lessons yet. Click "Add Lesson" to create one.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {course.lessons.map(l => (
                <div key={l.id} className="card" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ background: '#1a2744', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem' }}>Week {l.weekNumber}</span>
                        <span style={{ background: l.isPublished ? '#dcfce7' : '#fee2e2', color: l.isPublished ? '#15803d' : '#b91c1c', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem' }}>
                          {l.isPublished ? 'Published' : 'Draft'}
                        </span>
                        <strong style={{ color: '#1a2744' }}>{l.title}</strong>
                      </div>
                      {l.content && <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{l.content}</p>}
                      {l.videoUrl && <a href={l.videoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', color: '#2563eb' }}>🎥 {l.videoUrl}</a>}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setLessonForm(l)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteLesson(l.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ASSIGNMENTS */}
      {tab === 'assignments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ color: '#1a2744', fontSize: '1rem' }}>📝 Assignments</h3>
            <button className="btn btn-success btn-sm" onClick={() => setAssignmentForm({ ...emptyAssignment })}>+ Add Assignment</button>
          </div>
          {course.assignments.length === 0 ? (
            <div className="card"><p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem 0' }}>No assignments yet.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {course.assignments.map(a => (
                <div key={a.id} className="card" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ color: '#1a2744', fontSize: '0.95rem' }}>{a.title}</h4>
                      <p style={{ fontSize: '0.82rem', color: '#475569', marginTop: '4px' }}>{a.description}</p>
                      <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '0.78rem', color: '#64748b', flexWrap: 'wrap' }}>
                        <span>📅 {a.deadline}</span>
                        <span>🎯 {a.totalMarks} marks</span>
                        <span>📥 {a._count?.submissions || 0} submissions</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <button className="btn btn-info btn-sm" onClick={() => setGradingFor(a)}>Grade</button>
                      <button className="btn btn-outline btn-sm" onClick={() => setAssignmentForm(a)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteAssignment(a.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MATERIALS */}
      {tab === 'materials' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ color: '#1a2744', fontSize: '1rem' }}>📎 Materials</h3>
            <button className="btn btn-success btn-sm" onClick={() => setMaterialForm({ ...emptyMaterial })}>+ Add Material</button>
          </div>
          {course.materials.length === 0 ? (
            <div className="card"><p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem 0' }}>No materials yet.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {course.materials.map(m => (
                <div key={m.id} className="card" style={{ marginBottom: 0, padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#1a2744' }}>
                        {m.type === 'LINK' ? '🔗' : m.type === 'VIDEO' ? '🎥' : '📄'} {m.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>{m.fileName || m.url}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {m.filePath && <a href={getFileUrl(m.filePath)} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">View</a>}
                      <button className="btn btn-danger btn-sm" onClick={() => deleteMaterial(m.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ANNOUNCEMENTS */}
      {tab === 'announcements' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ color: '#1a2744', fontSize: '1rem' }}>📢 Course Announcements</h3>
            <button className="btn btn-success btn-sm" onClick={() => setAnnouncementForm({ ...emptyAnnouncement })}>+ New Announcement</button>
          </div>
          {course.announcements.length === 0 ? (
            <div className="card"><p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem 0' }}>No announcements.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {course.announcements.map(a => (
                <div key={a.id} className="card" style={{ marginBottom: 0, borderLeft: '3px solid #16a34a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ color: '#1a2744', fontSize: '0.95rem' }}>{a.title}</h4>
                      <p style={{ fontSize: '0.85rem', color: '#475569', marginTop: '4px', lineHeight: 1.5 }}>{a.message}</p>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px' }}>{new Date(a.createdAt).toLocaleString()}</div>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteAnnouncement(a.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── MODALS ─── */}
      {lessonForm && (
        <Modal title={lessonForm.id ? 'Edit Lesson' : 'New Lesson'} onClose={() => setLessonForm(null)}>
          <form onSubmit={saveLesson}>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Title</label>
              <input value={lessonForm.title} onChange={e => setLessonForm({ ...lessonForm, title: e.target.value })} required />
            </div>
            <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
              <div className="form-group">
                <label>Week</label>
                <input type="number" min="1" value={lessonForm.weekNumber} onChange={e => setLessonForm({ ...lessonForm, weekNumber: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Order</label>
                <input type="number" min="0" value={lessonForm.order} onChange={e => setLessonForm({ ...lessonForm, order: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Content</label>
              <textarea rows={6} value={lessonForm.content || ''} onChange={e => setLessonForm({ ...lessonForm, content: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Video URL (optional)</label>
              <input type="url" value={lessonForm.videoUrl || ''} onChange={e => setLessonForm({ ...lessonForm, videoUrl: e.target.value })} placeholder="https://youtube.com/..." />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>
                <input type="checkbox" checked={lessonForm.isPublished} onChange={e => setLessonForm({ ...lessonForm, isPublished: e.target.checked })} /> Published (visible to students)
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={() => setLessonForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-success">{lessonForm.id ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {assignmentForm && (
        <Modal title={assignmentForm.id ? 'Edit Assignment' : 'New Assignment'} onClose={() => setAssignmentForm(null)}>
          <form onSubmit={saveAssignment}>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Title</label>
              <input value={assignmentForm.title} onChange={e => setAssignmentForm({ ...assignmentForm, title: e.target.value })} required />
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Description</label>
              <textarea rows={4} value={assignmentForm.description || ''} onChange={e => setAssignmentForm({ ...assignmentForm, description: e.target.value })} />
            </div>
            <div className="form-grid" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label>Total Marks</label>
                <input type="number" min="1" value={assignmentForm.totalMarks} onChange={e => setAssignmentForm({ ...assignmentForm, totalMarks: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Deadline</label>
                <input type="date" value={assignmentForm.deadline} onChange={e => setAssignmentForm({ ...assignmentForm, deadline: e.target.value })} required />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>
                <input type="checkbox" checked={assignmentForm.isPublished} onChange={e => setAssignmentForm({ ...assignmentForm, isPublished: e.target.checked })} /> Published
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={() => setAssignmentForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-success">{assignmentForm.id ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {materialForm && (
        <Modal title="Add Material" onClose={() => setMaterialForm(null)}>
          <form onSubmit={saveMaterial}>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Title</label>
              <input value={materialForm.title} onChange={e => setMaterialForm({ ...materialForm, title: e.target.value })} required />
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Type</label>
              <select value={materialForm.type} onChange={e => setMaterialForm({ ...materialForm, type: e.target.value })}>
                <option value="FILE">File Upload</option>
                <option value="LINK">External Link</option>
                <option value="VIDEO">Video URL</option>
              </select>
            </div>
            {materialForm.type === 'FILE' ? (
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>File</label>
                <input type="file" onChange={e => setMaterialForm({ ...materialForm, file: e.target.files[0] })} required />
              </div>
            ) : (
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>URL</label>
                <input type="url" value={materialForm.url} onChange={e => setMaterialForm({ ...materialForm, url: e.target.value })} placeholder="https://..." required />
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={() => setMaterialForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-success">Add</button>
            </div>
          </form>
        </Modal>
      )}

      {announcementForm && (
        <Modal title="New Announcement" onClose={() => setAnnouncementForm(null)}>
          <form onSubmit={saveAnnouncement}>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Title</label>
              <input value={announcementForm.title} onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })} required />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Message</label>
              <textarea rows={5} value={announcementForm.message} onChange={e => setAnnouncementForm({ ...announcementForm, message: e.target.value })} required />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={() => setAnnouncementForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-success">Post</button>
            </div>
          </form>
        </Modal>
      )}

      {gradingFor && (
        <GradingPanel assignment={gradingFor} onClose={() => { setGradingFor(null); load(); }} />
      )}
    </div>
  );
};

const Modal = ({ title, children, onClose }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }} onClick={onClose}>
    <div className="card" style={{ maxWidth: '550px', width: '100%', margin: 0, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
      <div className="card-header">{title}</div>
      {children}
    </div>
  </div>
);

const GradingPanel = ({ assignment, onClose }) => {
  const [data, setData] = useState({ submissions: [], enrolledStudents: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState({});

  const load = () => {
    setLoading(true);
    api.get(`/lms/teacher/assignments/${assignment.id}/submissions`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, [assignment.id]);

  const save = async (subId, marks, feedback) => {
    await api.put(`/lms/teacher/submissions/${subId}/grade`, { marks, feedback });
    setEditing({});
    load();
  };

  return (
    <Modal title={`📝 Grading: ${assignment.title}`} onClose={onClose}>
      {loading ? (
        <div className="loading"><span className="spinner"></span></div>
      ) : data.submissions.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem 0' }}>
          No submissions yet. {data.enrolledStudents.length} students are enrolled.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
          {data.submissions.map(s => {
            const p = s.student.profile;
            const e = editing[s.id] || { marks: s.marks ?? '', feedback: s.feedback ?? '' };
            return (
              <div key={s.id} style={{ padding: '0.85rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: s.status === 'GRADED' ? '#f0fdf4' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  <strong style={{ color: '#1a2744' }}>{p ? `${p.firstName || ''} ${p.lastName || ''}` : s.student.email}</strong>
                  <span className={`badge ${s.status === 'GRADED' ? 'badge-success' : s.status === 'LATE' ? 'badge-warning' : 'badge-info'}`}>{s.status}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '6px' }}>
                  Submitted: {new Date(s.submittedAt).toLocaleString()}
                  {s.fileName && <> • <a href={getFileUrl(s.filePath)} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb' }}>📎 {s.fileName}</a></>}
                </div>
                {s.content && <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '4px', fontSize: '0.82rem', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>{s.content}</div>}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="number"
                    placeholder={`/${assignment.totalMarks}`}
                    value={e.marks}
                    onChange={ev => setEditing({ ...editing, [s.id]: { ...e, marks: ev.target.value } })}
                    style={{ width: '90px', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                  />
                  <input
                    placeholder="Feedback (optional)"
                    value={e.feedback}
                    onChange={ev => setEditing({ ...editing, [s.id]: { ...e, feedback: ev.target.value } })}
                    style={{ flex: 1, minWidth: '150px', padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                  />
                  <button className="btn btn-success btn-sm" onClick={() => save(s.id, e.marks, e.feedback)} disabled={!e.marks}>Save</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button className="btn btn-outline" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
};

export default TeacherCourseDetail;

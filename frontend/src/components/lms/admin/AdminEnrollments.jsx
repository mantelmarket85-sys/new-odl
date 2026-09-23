import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const AdminEnrollments = () => {
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [bulkPicker, setBulkPicker] = useState(false);
  const [picked, setPicked] = useState([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/lms/admin/courses'),
      api.get('/lms/admin/students'),
    ])
      .then(([cr, sr]) => {
        setCourses(cr.data.courses || []);
        setStudents(sr.data.students || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (selectedCourse) {
      api.get(`/lms/admin/enrollments?courseId=${selectedCourse}`)
        .then(r => setEnrollments(r.data.enrollments || []))
        .catch(() => {});
    } else {
      api.get('/lms/admin/enrollments')
        .then(r => setEnrollments(r.data.enrollments || []))
        .catch(() => {});
    }
  }, [selectedCourse, courses.length]);

  const showMsg = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3000); };

  const removeEnrollment = async (id) => {
    if (!confirm('Remove this student from the course?')) return;
    await api.delete(`/lms/admin/enrollments/${id}`);
    showMsg('Enrollment removed');
    // reload current view
    if (selectedCourse) {
      const r = await api.get(`/lms/admin/enrollments?courseId=${selectedCourse}`);
      setEnrollments(r.data.enrollments || []);
    } else {
      const r = await api.get('/lms/admin/enrollments');
      setEnrollments(r.data.enrollments || []);
    }
  };

  const bulkEnroll = async () => {
    if (!selectedCourse || picked.length === 0) return;
    try {
      const r = await api.post(`/lms/admin/courses/${selectedCourse}/enroll-bulk`, { studentIds: picked });
      showMsg(r.data.message);
      setBulkPicker(false);
      setPicked([]);
      // reload
      const er = await api.get(`/lms/admin/enrollments?courseId=${selectedCourse}`);
      setEnrollments(er.data.enrollments || []);
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed');
    }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  const enrolledStudentIds = enrollments.map(e => e.studentId);
  const availableStudents = students.filter(s => !enrolledStudentIds.includes(s.id));

  return (
    <div>
      {msg && <div className="alert alert-success">{msg}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
        <div className="card-header" style={{ margin: 0, padding: 0, border: 'none' }}>🎓 Course Enrollments</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)} style={{ padding: '6px 12px', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '0.85rem' }}>
            <option value="">— All Courses —</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
          </select>
          {selectedCourse && availableStudents.length > 0 && (
            <button className="btn btn-success btn-sm" onClick={() => setBulkPicker(true)}>+ Enroll Students</button>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#2563eb' }}>{enrollments.length}</div>
          <div className="stat-label">{selectedCourse ? 'Enrolled in this Course' : 'Total Enrollments'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#16a34a' }}>{students.length}</div>
          <div className="stat-label">LMS-Eligible Students</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#1a2744' }}>{courses.length}</div>
          <div className="stat-label">Courses</div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll Number</th>
                <th>Email</th>
                <th>Course</th>
                <th>Enrolled</th>
                <th>Status</th>
                <th>Final Grade</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>No enrollments found.</td></tr>
              ) : enrollments.map(e => {
                const p = e.student.profile;
                return (
                  <tr key={e.id}>
                    <td><strong>{p ? `${p.firstName || ''} ${p.lastName || ''}` : '—'}</strong></td>
                    <td>{e.student.enrollment?.rollNumber || '—'}</td>
                    <td>{e.student.email}</td>
                    <td><strong>{e.course.code}</strong> — {e.course.title}</td>
                    <td>{new Date(e.enrolledAt).toLocaleDateString()}</td>
                    <td><span className={`badge ${e.status === 'ACTIVE' ? 'badge-info' : e.status === 'COMPLETED' ? 'badge-success' : 'badge-secondary'}`}>{e.status}</span></td>
                    <td>{e.finalGrade || '—'}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => removeEnrollment(e.id)}>Remove</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {bulkPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }} onClick={() => setBulkPicker(false)}>
          <div className="card" style={{ maxWidth: '600px', width: '100%', margin: 0, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="card-header">
              Enroll Students in {courses.find(c => c.id == selectedCourse)?.code}
            </div>
            {availableStudents.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0' }}>All eligible students are already enrolled.</p>
            ) : (
              <>
                <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#475569' }}>
                  Selected: {picked.length} of {availableStudents.length}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setPicked(picked.length === availableStudents.length ? [] : availableStudents.map(s => s.id))}
                    style={{ marginLeft: '8px' }}
                  >
                    {picked.length === availableStudents.length ? 'Clear All' : 'Select All'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '50vh', overflowY: 'auto', marginBottom: '1rem' }}>
                  {availableStudents.map(s => {
                    const p = s.profile;
                    return (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: picked.includes(s.id) ? '#eff6ff' : '#f8fafc', borderRadius: '6px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={picked.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) setPicked([...picked, s.id]);
                            else setPicked(picked.filter(x => x !== s.id));
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1a2744' }}>
                            {p ? `${p.firstName || ''} ${p.lastName || ''}` : '—'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {s.enrollment?.rollNumber || '—'} • {s.email}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={() => { setBulkPicker(false); setPicked([]); }}>Cancel</button>
              <button type="button" className="btn btn-success" onClick={bulkEnroll} disabled={picked.length === 0}>
                Enroll {picked.length} Student{picked.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminEnrollments;

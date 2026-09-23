import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const emptyCourse = { code: '', title: '', description: '', creditHours: 3, semester: 1, programCode: 'ADCS', teacherId: '', isActive: true };

const AdminCourses = () => {
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/lms/admin/courses'),
      api.get('/lms/admin/teachers'),
    ])
      .then(([cr, tr]) => {
        setCourses(cr.data.courses || []);
        setTeachers(tr.data.teachers || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const showMsg = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3000); };

  const save = async (e) => {
    e.preventDefault();
    try {
      if (form.id) {
        await api.put(`/lms/admin/courses/${form.id}`, form);
        showMsg('Course updated');
      } else {
        await api.post('/lms/admin/courses', form);
        showMsg('Course created');
      }
      setForm(null);
      load();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed');
    }
  };

  const del = async (id) => {
    if (!confirm('Delete this course? All lessons, assignments, and enrollments will be removed.')) return;
    await api.delete(`/lms/admin/courses/${id}`);
    showMsg('Course deleted');
    load();
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  const filtered = courses.filter(c =>
    !search ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {msg && <div className="alert alert-success">{msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
        <div className="card-header" style={{ margin: 0, padding: 0, border: 'none' }}>📚 Manage Courses ({courses.length})</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            placeholder="Search code or title..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '0.85rem' }}
          />
          <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...emptyCourse })}>+ New Course</button>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Title</th>
                <th>Program</th>
                <th>Sem</th>
                <th>CH</th>
                <th>Teacher</th>
                <th>Stats</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>No courses found.</td></tr>
              ) : filtered.map(c => {
                const tp = c.teacher?.teacherProfile;
                return (
                  <tr key={c.id}>
                    <td><strong>{c.code}</strong></td>
                    <td>{c.title}</td>
                    <td>{c.programCode || '—'}</td>
                    <td>{c.semester}</td>
                    <td>{c.creditHours}</td>
                    <td>{tp ? `${tp.firstName} ${tp.lastName}` : (c.teacher?.email || <span style={{ color: '#dc2626', fontSize: '0.78rem' }}>Unassigned</span>)}</td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      👥 {c._count?.enrollments || 0} • 📖 {c._count?.lessons || 0} • 📝 {c._count?.assignments || 0}
                    </td>
                    <td><span className={`badge ${c.isActive ? 'badge-success' : 'badge-secondary'}`}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => setForm({ ...c, teacherId: c.teacherId || '' })}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(c.id)} style={{ marginLeft: '4px' }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }} onClick={() => setForm(null)}>
          <div className="card" style={{ maxWidth: '600px', width: '100%', margin: 0, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="card-header">{form.id ? 'Edit Course' : 'New Course'}</div>
            <form onSubmit={save}>
              <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
                <div className="form-group">
                  <label>Course Code <span className="required">*</span></label>
                  <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} required placeholder="e.g., CS101" />
                </div>
                <div className="form-group">
                  <label>Program</label>
                  <select value={form.programCode || ''} onChange={e => setForm({ ...form, programCode: e.target.value })}>
                    <option value="">— Any —</option>
                    <option value="ADCS">Associate Degree in Computer Science (ADCS)</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label>Title <span className="required">*</span></label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label>Description</label>
                <textarea rows={3} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-grid three-col" style={{ marginBottom: '0.75rem' }}>
                <div className="form-group">
                  <label>Credit Hours</label>
                  <input type="number" min="1" value={form.creditHours} onChange={e => setForm({ ...form, creditHours: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Semester</label>
                  <input type="number" min="1" max="8" value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Active</label>
                  <select value={form.isActive ? '1' : '0'} onChange={e => setForm({ ...form, isActive: e.target.value === '1' })}>
                    <option value="1">Active</option>
                    <option value="0">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Assign Teacher</label>
                <select value={form.teacherId || ''} onChange={e => setForm({ ...form, teacherId: e.target.value })}>
                  <option value="">— Unassigned —</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.teacherProfile ? `${t.teacherProfile.firstName || ''} ${t.teacherProfile.lastName || ''}` : t.email} ({t.email})
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{form.id ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCourses;

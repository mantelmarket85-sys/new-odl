import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const emptyTeacher = {
  email: '', password: '',
  firstName: '', lastName: '', designation: '', department: 'Computer Science',
  qualification: '', phone: '', bio: '',
};

const AdminTeachers = () => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/lms/admin/teachers')
      .then(r => setTeachers(r.data.teachers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const showMsg = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3000); };

  const save = async (e) => {
    e.preventDefault();
    try {
      if (form.id) {
        await api.put(`/lms/admin/teachers/${form.id}`, form);
        showMsg('Teacher updated');
      } else {
        await api.post('/lms/admin/teachers', form);
        showMsg('Teacher created');
      }
      setForm(null);
      load();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Failed');
    }
  };

  const del = async (id) => {
    if (!confirm('Delete this teacher? They will be unassigned from all courses.')) return;
    await api.delete(`/lms/admin/teachers/${id}`);
    showMsg('Teacher deleted');
    load();
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div>
      {msg && <div className="alert alert-success">{msg}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
        <div className="card-header" style={{ margin: 0, padding: 0, border: 'none' }}>👨‍🏫 Manage Teachers ({teachers.length})</div>
        <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...emptyTeacher })}>+ New Teacher</button>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Designation</th>
                <th>Department</th>
                <th>Phone</th>
                <th>Courses</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>No teachers yet.</td></tr>
              ) : teachers.map(t => {
                const tp = t.teacherProfile;
                return (
                  <tr key={t.id}>
                    <td><strong>{tp ? `${tp.firstName || ''} ${tp.lastName || ''}` : '—'}</strong></td>
                    <td>{t.email}</td>
                    <td>{tp?.designation || '—'}</td>
                    <td>{tp?.department || '—'}</td>
                    <td>{tp?.phone || '—'}</td>
                    <td style={{ fontSize: '0.78rem' }}>
                      {t.taughtCourses && t.taughtCourses.length > 0
                        ? t.taughtCourses.map(c => c.code).join(', ')
                        : <span style={{ color: '#94a3b8' }}>None</span>}
                    </td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={() => setForm({
                        id: t.id,
                        email: t.email,
                        password: '',
                        firstName: tp?.firstName || '',
                        lastName: tp?.lastName || '',
                        designation: tp?.designation || '',
                        department: tp?.department || 'Computer Science',
                        qualification: tp?.qualification || '',
                        phone: tp?.phone || '',
                        bio: tp?.bio || '',
                      })}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(t.id)} style={{ marginLeft: '4px' }}>Delete</button>
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
            <div className="card-header">{form.id ? 'Edit Teacher' : 'New Teacher'}</div>
            <form onSubmit={save}>
              <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
                <div className="form-group">
                  <label>Email <span className="required">*</span></label>
                  <input type="email" value={form.email} disabled={!!form.id} onChange={e => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>{form.id ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!form.id} minLength={6} />
                </div>
              </div>
              <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
                <div className="form-group">
                  <label>First Name</label>
                  <input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
                <div className="form-group">
                  <label>Designation</label>
                  <input value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="e.g., Lecturer" />
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
                </div>
              </div>
              <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
                <div className="form-group">
                  <label>Qualification</label>
                  <input value={form.qualification} onChange={e => setForm({ ...form, qualification: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Bio</label>
                <textarea rows={3} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} />
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

export default AdminTeachers;

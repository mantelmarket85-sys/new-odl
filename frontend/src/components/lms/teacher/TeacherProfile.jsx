import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

const TeacherProfile = () => {
  const [profile, setProfile] = useState({
    firstName: '', lastName: '', designation: '', department: '',
    qualification: '', phone: '', bio: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/lms/teacher/profile')
      .then(r => { if (r.data.profile) setProfile(r.data.profile); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await api.put('/lms/teacher/profile', profile);
      setMsg('Profile saved successfully');
    } catch (err) {
      setMsg(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 3000);
    }
  };

  if (loading) return <div className="loading"><span className="spinner"></span></div>;

  return (
    <div className="card">
      <div className="card-header">👤 My Profile</div>
      {msg && <div className={`alert ${msg.includes('success') ? 'alert-success' : 'alert-error'}`}>{msg}</div>}
      <form onSubmit={save}>
        <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
          <div className="form-group">
            <label>First Name</label>
            <input value={profile.firstName || ''} onChange={e => setProfile({ ...profile, firstName: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Last Name</label>
            <input value={profile.lastName || ''} onChange={e => setProfile({ ...profile, lastName: e.target.value })} />
          </div>
        </div>
        <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
          <div className="form-group">
            <label>Designation</label>
            <input value={profile.designation || ''} onChange={e => setProfile({ ...profile, designation: e.target.value })} placeholder="e.g., Assistant Professor" />
          </div>
          <div className="form-group">
            <label>Department</label>
            <input value={profile.department || ''} onChange={e => setProfile({ ...profile, department: e.target.value })} />
          </div>
        </div>
        <div className="form-grid" style={{ marginBottom: '0.75rem' }}>
          <div className="form-group">
            <label>Qualification</label>
            <input value={profile.qualification || ''} onChange={e => setProfile({ ...profile, qualification: e.target.value })} placeholder="e.g., PhD in Computer Science" />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input value={profile.phone || ''} onChange={e => setProfile({ ...profile, phone: e.target.value })} />
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label>Bio</label>
          <textarea rows={4} value={profile.bio || ''} onChange={e => setProfile({ ...profile, bio: e.target.value })} placeholder="Brief introduction about yourself..." />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-success" disabled={saving}>
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TeacherProfile;

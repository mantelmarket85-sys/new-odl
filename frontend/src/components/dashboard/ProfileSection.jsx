import React, { useState, useEffect } from 'react';
import api, { getFileUrl } from '../../utils/api';
import DocumentPreviewLink from './DocumentPreviewLink';

const provinces = ['Punjab', 'Sindh', 'KPK', 'Balochistan', 'Islamabad', 'AJK', 'Gilgit-Baltistan'];
const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const religions = ['Islam', 'Christianity', 'Hinduism', 'Sikhism', 'Other'];

// Comprehensive country list (ISO common names)
const COUNTRIES = [
  'Pakistan', 'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia',
  'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus',
  'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil',
  'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada', 'Cape Verde',
  'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica',
  'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada',
  'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India',
  'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan',
  'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia',
  'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar',
  'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius',
  'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique',
  'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger',
  'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Palau', 'Palestine', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania',
  'Russia', 'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines',
  'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles',
  'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa',
  'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland',
  'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga',
  'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine',
  'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu',
  'Vatican City', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe', 'Other',
];

const cnicRegex = /^\d{5}-?\d{7}-?\d{1}$|^\d{13}$/;
const phoneRegex = /^\+?\d{10,15}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phase 2: draft autosave key (survives page refresh via localStorage).
const PROFILE_DRAFT_KEY = 'aust:profileDraft';

// Phase 2: mandatory Profile fields. Labels are used in the inline error banner.
const REQUIRED_PROFILE_FIELDS = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'cnic', label: 'CNIC' },
  { key: 'fatherName', label: "Father's Name" },
  { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'phone', label: 'Mobile Number' },
  { key: 'gender', label: 'Gender' },
  { key: 'domicileProvince', label: 'Domicile Province' },
  { key: 'presStreet', label: 'Present Address (Street)' },
  { key: 'presDistrict', label: 'Present Address (District)' },
];

const initialState = {
  // Order per master prompt:
  firstName: '', lastName: '', cnic: '',
  fatherName: '', fatherCnic: '', guardianPhone: '', whatsappNumber: '',
  nationality: 'Pakistani', countryOfResidence: 'Pakistan',
  dateOfBirth: '', phone: '', gender: '', bloodGroup: '',
  religion: '', maritalStatus: '', occupation: '',
  domicileDistrict: '', domicileProvince: '',
  // Present address
  presStreet: '', presPostalCode: '', presVillage: '', presTehsil: '', presDistrict: '',
  // Permanent address
  permStreet: '', permPostalCode: '', permVillage: '', permTehsil: '', permDistrict: '',
  permSameAsPresent: false,
  // Legacy
  address: '', district: '',
};

const ProfileSection = () => {
  const [profile, setProfile] = useState(initialState);
  const [nationalities, setNationalities] = useState([
    'Pakistani', 'Afghan', 'Indian', 'Bangladeshi', 'Chinese', 'British',
    'American', 'Canadian', 'Australian', 'Saudi Arabian', 'Emirati',
    'Turkish', 'Iranian', 'Other',
  ]);
  const [documents, setDocuments] = useState([]);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [uploading, setUploading] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  // Per-required-document inline errors (profile picture / CNIC front / CNIC back).
  // Surfaced as inline messages near each tile and as a single summary banner —
  // never via window.alert(). Cleared automatically as the user uploads.
  const [docErrors, setDocErrors] = useState({});

  const [user, setUser] = useState(null);
  const [newEmail, setNewEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [togglingNotif, setTogglingNotif] = useState(false);

  // Required applicant declaration — must be acknowledged before each Save.
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  // Phase 2: draft autosave state — indicates an unsaved local draft was restored.
  const [draftRestored, setDraftRestored] = useState(false);
  // Guard so we only start persisting drafts after the initial server load,
  // otherwise the empty initial state would overwrite a good draft.
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    loadProfile();
    loadDocuments();
    loadNationalities();
    loadUser();
  }, []);

  // Phase 2: persist an unsaved draft to localStorage on every change so the
  // form survives an accidental refresh / navigation. Cleared on successful save.
  useEffect(() => {
    if (!profileLoaded) return;
    try {
      localStorage.setItem(PROFILE_DRAFT_KEY, JSON.stringify(profile));
    } catch { /* storage full / disabled — ignore */ }
  }, [profile, profileLoaded]);

  const loadUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
      setNewEmail(res.data.user?.email || '');
      setEmailNotifications(!!res.data.user?.emailNotifications);
    } catch {}
  };

  const loadNationalities = async () => {
    try {
      const res = await api.get('/profile/nationalities');
      if (res.data.nationalities) setNationalities(res.data.nationalities);
    } catch {}
  };

  const loadProfile = async () => {
    try {
      const res = await api.get('/profile');
      let serverProfile = null;
      if (res.data.profile) {
        const p = res.data.profile;
        serverProfile = {
          firstName: p.firstName || '', lastName: p.lastName || '', cnic: p.cnic || '',
          fatherName: p.fatherName || '', fatherCnic: p.fatherCnic || '',
          guardianPhone: p.guardianPhone || '', whatsappNumber: p.whatsappNumber || '',
          nationality: p.nationality || 'Pakistani',
          countryOfResidence: p.countryOfResidence || 'Pakistan',
          dateOfBirth: p.dateOfBirth || '',
          phone: p.phone || '', gender: p.gender || '', bloodGroup: p.bloodGroup || '',
          religion: p.religion || '', maritalStatus: p.maritalStatus || '',
          occupation: p.occupation || '',
          domicileDistrict: p.domicileDistrict || '', domicileProvince: p.domicileProvince || '',
          presStreet: p.presStreet || '', presPostalCode: p.presPostalCode || '',
          presVillage: p.presVillage || '', presTehsil: p.presTehsil || '', presDistrict: p.presDistrict || '',
          permStreet: p.permStreet || '', permPostalCode: p.permPostalCode || '',
          permVillage: p.permVillage || '', permTehsil: p.permTehsil || '', permDistrict: p.permDistrict || '',
          permSameAsPresent: !!p.permSameAsPresent,
          address: p.address || '', district: p.district || '',
        };
        setProfile(serverProfile);
        if (p.photoPath) setPhotoPreview(getFileUrl(p.photoPath));
      }

      // Phase 2: restore an unsaved local draft if present. We only restore
      // when the draft actually differs from the server copy, so a stale draft
      // that matches the saved profile does not trigger a false "restored" note.
      try {
        const raw = localStorage.getItem(PROFILE_DRAFT_KEY);
        if (raw) {
          const draft = JSON.parse(raw);
          const base = serverProfile || initialState;
          const differs = Object.keys(draft || {}).some(
            (k) => String(draft[k] ?? '') !== String(base[k] ?? '')
          );
          if (differs) {
            setProfile((prev) => ({ ...prev, ...draft }));
            setDraftRestored(true);
          } else {
            localStorage.removeItem(PROFILE_DRAFT_KEY);
          }
        }
      } catch { /* ignore malformed draft */ }
    } catch {
    } finally {
      setProfileLoaded(true);
    }
  };

  const loadDocuments = async () => {
    try {
      const res = await api.get('/documents');
      setDocuments(res.data.documents || []);
    } catch {}
  };

  const validateField = (name, value) => {
    if (!value) return null;
    if (name === 'cnic' || name === 'fatherCnic') {
      return cnicRegex.test(value.replace(/[-\s]/g, '')) ? null : 'Invalid CNIC format. Use 13 digits.';
    }
    if (name === 'phone' || name === 'guardianPhone' || name === 'whatsappNumber') {
      return phoneRegex.test(value.replace(/[-\s]/g, '')) ? null : 'Invalid phone number (10–15 digits).';
    }
    return null;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const v = type === 'checkbox' ? checked : value;
    let next = { ...profile, [name]: v };

    // Same-as-present: instantly mirror present → permanent
    if (name === 'permSameAsPresent' && checked) {
      next = {
        ...next,
        permStreet: profile.presStreet,
        permPostalCode: profile.presPostalCode,
        permVillage: profile.presVillage,
        permTehsil: profile.presTehsil,
        permDistrict: profile.presDistrict,
      };
    }
    // If "same as present" is on, keep mirroring while present fields change
    if (
      next.permSameAsPresent &&
      ['presStreet', 'presPostalCode', 'presVillage', 'presTehsil', 'presDistrict'].includes(name)
    ) {
      const map = {
        presStreet: 'permStreet',
        presPostalCode: 'permPostalCode',
        presVillage: 'permVillage',
        presTehsil: 'permTehsil',
        presDistrict: 'permDistrict',
      };
      next[map[name]] = v;
    }

    setProfile(next);
    if (typeof v === 'string') {
      const err = validateField(name, v);
      setFieldErrors((prev) => ({ ...prev, [name]: err }));
    }
  };

  // ============================================================
  // REQUIRED-DOCUMENT VALIDATION  (Phase 6, Task 4)
  // ------------------------------------------------------------
  // Profile completion cannot proceed unless the applicant has uploaded:
  //   1. Profile Picture           (Profile.photoPath OR doc.type='photo')
  //   2. Student CNIC Front        (doc.type='cnic_front')
  //   3. Student CNIC Back         (doc.type='cnic_back')
  // Validation is inline-only (no browser alerts), uses .alert/.error-text
  // styles already established in Phase 5, and produces professional messages.
  // ============================================================
  const computeDocErrors = () => {
    const errs = {};
    if (!photoPreview && !getDoc('photo')) {
      errs.photo = 'Profile Picture is required.';
    }
    if (!getDoc('cnic_front')) {
      errs.cnic_front = 'Student CNIC Front is required.';
    }
    if (!getDoc('cnic_back')) {
      errs.cnic_back = 'Student CNIC Back is required.';
    }
    return errs;
  };

  // Live recompute as uploads complete — keeps inline errors in sync without
  // forcing the user to click Save again.
  useEffect(() => {
    if (Object.keys(docErrors).length) {
      setDocErrors(computeDocErrors());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoPreview, documents]);

  const handleSave = async (e) => {
    e.preventDefault();
    const errs = {};

    // Phase 2: mandatory field check — every required field must be filled.
    const missingRequired = [];
    REQUIRED_PROFILE_FIELDS.forEach(({ key, label }) => {
      const val = profile[key];
      if (val == null || String(val).trim() === '') {
        errs[key] = 'This field is required.';
        missingRequired.push(label);
      }
    });

    // Format checks on the fields that have a defined format.
    ['cnic', 'fatherCnic', 'phone', 'guardianPhone', 'whatsappNumber'].forEach((f) => {
      const err = validateField(f, profile[f]);
      if (err) errs[f] = err;
    });
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      const msgText = missingRequired.length
        ? `Please complete all required fields: ${missingRequired.join(', ')}.`
        : 'Please fix the highlighted errors before saving.';
      setMsg({ type: 'error', text: msgText });
      // Bring the first invalid field into view.
      try {
        const firstKey = missingRequired.length
          ? REQUIRED_PROFILE_FIELDS.find((f) => errs[f.key])?.key
          : Object.keys(errs)[0];
        document.querySelector(`[name="${firstKey}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {}
      return;
    }

    // Required documents must be present before profile can be completed.
    const dErrs = computeDocErrors();
    if (Object.keys(dErrs).length) {
      setDocErrors(dErrs);
      const missing = Object.values(dErrs);
      setMsg({
        type: 'error',
        text: 'Please upload all required documents before saving: ' + missing.join(' '),
      });
      // Bring the photo / CNIC card into view so the missing tiles are visible.
      try {
        document.getElementById('profile-required-docs')?.scrollIntoView({
          behavior: 'smooth', block: 'start',
        });
      } catch {}
      return;
    }

    // Mandatory applicant declaration — required before final submission/save.
    if (!declarationAccepted) {
      setMsg({
        type: 'error',
        text: 'Please tick the applicant declaration before saving your profile.',
      });
      // Smooth scroll into view so the user sees what is missing.
      try {
        document.getElementById('profile-declaration-block')?.scrollIntoView({
          behavior: 'smooth', block: 'center',
        });
      } catch {}
      return;
    }

    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const res = await api.post('/profile', profile);
      setMsg({ type: 'success', text: res.data.message || 'Profile saved successfully.' });
      // Phase 2: clear the local draft now that it is persisted on the server.
      try { localStorage.removeItem(PROFILE_DRAFT_KEY); } catch {}
      setDraftRestored(false);
      // Phase 2: scroll to top so the success notification is clearly visible.
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.getElementById('profile-section-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {}
      try { window.dispatchEvent(new Event('aust:refresh')); } catch {}
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save profile' });
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } finally {
      setSaving(false);
    }
  };

  const handleEmailChange = async (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    if (!emailRegex.test(newEmail)) {
      return setMsg({ type: 'error', text: 'Please enter a valid email address.' });
    }
    if (newEmail === user?.email) {
      return setMsg({ type: 'error', text: 'New email is the same as current.' });
    }
    setEmailSaving(true);
    try {
      const res = await api.put('/profile/email', { email: newEmail });
      setMsg({ type: 'success', text: res.data.message || 'Email updated. Please verify via the link sent.' });
      setUser(res.data.user);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to update email' });
    } finally {
      setEmailSaving(false);
    }
  };

  const toggleEmailNotifications = async () => {
    setTogglingNotif(true);
    try {
      const next = !emailNotifications;
      await api.put('/auth/email-notifications', { enabled: next });
      setEmailNotifications(next);
      setMsg({ type: 'success', text: `Email notifications ${next ? 'enabled' : 'disabled'}.` });
    } catch (err) {
      setMsg({ type: 'error', text: 'Failed to update notification preference' });
    } finally {
      setTogglingNotif(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 512 * 1024) return setMsg({ type: 'error', text: 'Photo must be under 512 KB' });
    if (!file.type.startsWith('image/')) return setMsg({ type: 'error', text: 'Only image files are allowed' });

    const fd = new FormData();
    fd.append('photo', file);
    setUploading(prev => ({ ...prev, photo: true }));
    try {
      const res = await api.post('/profile/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPhotoPreview(getFileUrl(res.data.filePath));
      setMsg({ type: 'success', text: 'Photo uploaded' });
      loadDocuments();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Photo upload failed' });
    } finally {
      setUploading(prev => ({ ...prev, photo: false }));
    }
  };

  const handleDocUpload = async (file, type, side) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setMsg({ type: 'error', text: 'File must be under 2 MB' });

    const fd = new FormData();
    fd.append('file', file);
    if (side) fd.append('side', side);
    if (type) fd.append('type', type);

    const endpoint = side ? '/documents/cnic' : '/documents/dmc';
    const key = side || type;
    setUploading(prev => ({ ...prev, [key]: true }));
    try {
      await api.post(endpoint, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg({ type: 'success', text: 'Document uploaded' });
      loadDocuments();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Upload failed' });
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  const getDoc = (type) => documents.find(d => d.type === type);
  const errStyle = (name) => fieldErrors[name] ? { borderColor: '#dc2626' } : {};

  return (
    <div id="profile-section-top">
      <h2 className="section-title">Personal Profile</h2>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Phase 2: draft-restored notice. */}
      {draftRestored && (
        <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-clock-rotate-left"></i>
          <span>We restored your unsaved changes from your last session. Review and click <strong>Save Profile</strong> to keep them.</span>
        </div>
      )}

      <div className="card" id="profile-required-docs">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>Profile Photo & CNIC <span className="required">*</span></span>
          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
            <i className="fas fa-circle-info" style={{ marginRight: 4, color: '#0ea5e9' }}></i>
            Profile Picture, CNIC Front and CNIC Back are required.
          </span>
        </div>

        {/* Inline summary banner — only when at least one required doc missing. */}
        {Object.keys(docErrors).length > 0 && (
          <div
            className="alert alert-error"
            style={{ marginTop: 0, marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}
          >
            <i className="fas fa-triangle-exclamation" style={{ marginTop: 2 }}></i>
            <div>
              <strong>Required documents missing:</strong>
              <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                {Object.values(docErrors).map((m) => (
                  <li key={m} style={{ fontSize: '0.85rem' }}>{m}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="profile-header">
          <div
            className="profile-photo-section"
            style={docErrors.photo ? { padding: 8, border: '1px solid #fecaca', borderRadius: 10, background: '#fef2f2' } : {}}
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Profile" className="photo-preview" />
            ) : (
              <div
                className="photo-preview"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: docErrors.photo ? '#b91c1c' : '#a0aec0',
                  fontSize: '0.8rem',
                  border: docErrors.photo ? '1px dashed #f87171' : undefined,
                }}
              >
                No Photo
              </div>
            )}
            <div style={{ marginTop: '0.5rem' }}>
              <label className="btn btn-sm btn-outline" style={{ cursor: 'pointer' }}>
                {uploading.photo ? 'Uploading...' : (photoPreview ? 'Replace Photo' : 'Upload Photo')}
                <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
              </label>
              <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '4px' }}>Max 512 KB, Passport size</div>
              {docErrors.photo && (
                <div className="error-text" style={{ marginTop: 6, color: '#b91c1c', fontSize: '0.78rem', fontWeight: 500 }}>
                  <i className="fas fa-circle-exclamation" style={{ marginRight: 4 }}></i>
                  {docErrors.photo}
                </div>
              )}
            </div>
          </div>

          <div className="doc-grid" style={{ flex: 1 }}>
            {['cnic_front', 'cnic_back'].map((t) => {
              const d = getDoc(t);
              const side = t === 'cnic_front' ? 'front' : 'back';
              const label = t === 'cnic_front' ? 'Student CNIC Front' : 'Student CNIC Back';
              const hasError = !!docErrors[t];
              return (
                <div
                  className="doc-item"
                  key={t}
                  style={hasError ? { border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 10, padding: 10 } : {}}
                >
                  <div className="doc-label">
                    {label} <span className="required">*</span>
                    {d && <span className="badge badge-approved" style={{ marginLeft: '6px' }}>Uploaded</span>}
                  </div>
                  {d && <DocumentPreviewLink scope="user" documentId={d.id} fileName={d.fileName} mimeType={d.mimeType} />}
                  <label className="btn btn-sm btn-outline" style={{ cursor: 'pointer', marginTop: 6 }}>
                    {uploading[side] ? 'Uploading...' : (d ? 'Replace File' : 'Choose File')}
                    <input type="file" accept="image/*,.pdf" onChange={e => handleDocUpload(e.target.files[0], null, side)} style={{ display: 'none' }} />
                  </label>
                  {hasError && (
                    <div className="error-text" style={{ marginTop: 6, color: '#b91c1c', fontSize: '0.78rem', fontWeight: 500 }}>
                      <i className="fas fa-circle-exclamation" style={{ marginRight: 4 }}></i>
                      {docErrors[t]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Email & notification preferences */}
      <div className="card">
        <div className="card-header">Account & Email</div>
        <form onSubmit={handleEmailChange}>
          <div className="form-grid">
            <div className="form-group">
              <label>
                Email Address {user?.emailVerified
                  ? <span className="badge badge-approved" style={{ marginLeft: 6 }}>Verified</span>
                  : <span className="badge" style={{ background: '#fef3c7', color: '#92400e', marginLeft: 6, padding: '2px 8px', borderRadius: '10px' }}>Not Verified</span>}
              </label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
              <small style={{ color: '#64748b' }}>Changing your email will require verification via a link sent to the new address.</small>
            </div>
            <div className="form-group">
              <label>Email Notifications</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '42px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={emailNotifications} onChange={toggleEmailNotifications} disabled={togglingNotif} />
                  <span>{emailNotifications ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>
              <small style={{ color: '#64748b' }}>Receive in-app notifications via email.</small>
            </div>
          </div>
          <div style={{ marginTop: '0.85rem' }}>
            <button type="submit" className="btn btn-sm btn-primary" disabled={emailSaving || newEmail === user?.email}>
              {emailSaving ? 'Updating...' : 'Update Email'}
            </button>
          </div>
        </form>
      </div>

      <form onSubmit={handleSave}>
        {/* ============================================================
            PERSONAL INFORMATION — fields ordered per master spec
            First Name, Last Name, CNIC, …, Occupation, District, Province
            ============================================================ */}
        <div className="card">
          <div className="card-header">Personal Information</div>
          <div className="form-grid">
            <div className="form-group">
              <label>First Name <span className="required">*</span></label>
              <input name="firstName" value={profile.firstName} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Last Name <span className="required">*</span></label>
              <input name="lastName" value={profile.lastName} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>CNIC Number <span className="required">*</span></label>
              <input name="cnic" value={profile.cnic} onChange={handleChange} placeholder="XXXXX-XXXXXXX-X" style={errStyle('cnic')} required />
              {fieldErrors.cnic && <small style={{ color: '#dc2626' }}>{fieldErrors.cnic}</small>}
            </div>
            <div className="form-group">
              <label>Father's Name <span className="required">*</span></label>
              <input name="fatherName" value={profile.fatherName} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Father's CNIC</label>
              <input name="fatherCnic" value={profile.fatherCnic} onChange={handleChange} placeholder="XXXXX-XXXXXXX-X" style={errStyle('fatherCnic')} />
              {fieldErrors.fatherCnic && <small style={{ color: '#dc2626' }}>{fieldErrors.fatherCnic}</small>}
            </div>
            <div className="form-group">
              <label>Guardian Phone Number</label>
              <input name="guardianPhone" value={profile.guardianPhone} onChange={handleChange} placeholder="03XX-XXXXXXX" style={errStyle('guardianPhone')} />
              {fieldErrors.guardianPhone && <small style={{ color: '#dc2626' }}>{fieldErrors.guardianPhone}</small>}
            </div>
            <div className="form-group">
              <label>WhatsApp Contact Number</label>
              <input name="whatsappNumber" value={profile.whatsappNumber} onChange={handleChange} placeholder="03XX-XXXXXXX" style={errStyle('whatsappNumber')} />
              {fieldErrors.whatsappNumber && <small style={{ color: '#dc2626' }}>{fieldErrors.whatsappNumber}</small>}
            </div>
            <div className="form-group">
              <label>Nationality <span className="required">*</span></label>
              <select name="nationality" value={profile.nationality} onChange={handleChange} required>
                {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Country of Residence <span className="required">*</span></label>
              <select name="countryOfResidence" value={profile.countryOfResidence} onChange={handleChange} required>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Date of Birth <span className="required">*</span></label>
              <input type="date" name="dateOfBirth" value={profile.dateOfBirth} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Phone <span className="required">*</span></label>
              <input name="phone" value={profile.phone} onChange={handleChange} placeholder="03XX-XXXXXXX" style={errStyle('phone')} required />
              {fieldErrors.phone && <small style={{ color: '#dc2626' }}>{fieldErrors.phone}</small>}
            </div>
            <div className="form-group">
              <label>Gender <span className="required">*</span></label>
              <select name="gender" value={profile.gender} onChange={handleChange} required>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Blood Group</label>
              <select name="bloodGroup" value={profile.bloodGroup} onChange={handleChange}>
                <option value="">Select</option>
                {bloodGroups.map(bg => <option key={bg} value={bg}>{bg}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Religion</label>
              <select name="religion" value={profile.religion} onChange={handleChange}>
                <option value="">Select</option>
                {religions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Marital Status</label>
              <select name="maritalStatus" value={profile.maritalStatus} onChange={handleChange}>
                <option value="">Select</option>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Divorced">Divorced</option>
                <option value="Widowed">Widowed</option>
              </select>
            </div>
            <div className="form-group">
              <label>Occupation</label>
              <input name="occupation" value={profile.occupation} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>District of Domicile</label>
              <input name="domicileDistrict" value={profile.domicileDistrict} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Province of Domicile</label>
              <select name="domicileProvince" value={profile.domicileProvince} onChange={handleChange}>
                <option value="">Select</option>
                {provinces.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ============================================================
            PRESENT ADDRESS
            ============================================================ */}
        <div className="card">
          <div className="card-header">Present Address</div>
          <div className="form-grid">
            <div className="form-group full-width">
              <label>Street / House / Block</label>
              <input name="presStreet" value={profile.presStreet} onChange={handleChange} placeholder="House #, Street, Block" />
            </div>
            <div className="form-group">
              <label>Postal Code</label>
              <input name="presPostalCode" value={profile.presPostalCode} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Village / Mohalla</label>
              <input name="presVillage" value={profile.presVillage} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Tehsil</label>
              <input name="presTehsil" value={profile.presTehsil} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>District</label>
              <input name="presDistrict" value={profile.presDistrict} onChange={handleChange} />
            </div>
          </div>
        </div>

        {/* ============================================================
            PERMANENT ADDRESS — with "Same as Present Address" checkbox
            ============================================================ */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Permanent Address</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 500 }}>
              <input
                type="checkbox"
                name="permSameAsPresent"
                checked={profile.permSameAsPresent}
                onChange={handleChange}
              />
              Same as Present Address
            </label>
          </div>
          <div className="form-grid" style={profile.permSameAsPresent ? { opacity: 0.6 } : {}}>
            <div className="form-group full-width">
              <label>Street / House / Block</label>
              <input name="permStreet" value={profile.permStreet} onChange={handleChange} disabled={profile.permSameAsPresent} />
            </div>
            <div className="form-group">
              <label>Postal Code</label>
              <input name="permPostalCode" value={profile.permPostalCode} onChange={handleChange} disabled={profile.permSameAsPresent} />
            </div>
            <div className="form-group">
              <label>Village / Mohalla</label>
              <input name="permVillage" value={profile.permVillage} onChange={handleChange} disabled={profile.permSameAsPresent} />
            </div>
            <div className="form-group">
              <label>Tehsil</label>
              <input name="permTehsil" value={profile.permTehsil} onChange={handleChange} disabled={profile.permSameAsPresent} />
            </div>
            <div className="form-group">
              <label>District</label>
              <input name="permDistrict" value={profile.permDistrict} onChange={handleChange} disabled={profile.permSameAsPresent} />
            </div>
          </div>
        </div>

        {/* ============ APPLICANT DECLARATION ============
            Required acknowledgement that must be ticked before each Save.
            Per university policy — applicant is responsible for any legal
            consequences arising from false information. */}
        <div
          id="profile-declaration-block"
          style={{
            marginTop: '1.75rem',
            padding: '14px 16px',
            background: declarationAccepted ? '#ecfdf5' : '#fff7ed',
            border: `1px solid ${declarationAccepted ? '#a7f3d0' : '#fed7aa'}`,
            borderRadius: 10,
            transition: 'background .2s, border-color .2s',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              cursor: 'pointer',
              margin: 0,
              fontWeight: 500,
              color: '#0f172a',
              lineHeight: 1.5,
            }}
          >
            <input
              type="checkbox"
              checked={declarationAccepted}
              onChange={(e) => setDeclarationAccepted(e.target.checked)}
              style={{
                marginTop: 3,
                width: 18,
                height: 18,
                flexShrink: 0,
                accentColor: '#059669',
                cursor: 'pointer',
              }}
              aria-required="true"
              aria-label="Applicant declaration"
            />
            <span style={{ fontSize: '0.88rem' }}>
              <strong style={{ color: '#065f46' }}>
                <i className="fas fa-shield-halved" style={{ marginRight: 6 }}></i>
                Applicant Declaration <span style={{ color: '#dc2626' }}>*</span>
              </strong>
              <br />
              <span style={{ color: '#334155' }}>
                ✓ All information provided is true and correct to the best of my knowledge,
                and I shall be responsible for any legal consequences arising from false information.
              </span>
            </span>
          </label>
        </div>

        <div
          style={{
            marginTop: '1.25rem',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {!declarationAccepted && (
            <span style={{ fontSize: '0.78rem', color: '#b45309' }}>
              <i className="fas fa-circle-exclamation" style={{ marginRight: 4 }}></i>
              Please accept the declaration to enable Save.
            </span>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || !declarationAccepted}
            title={!declarationAccepted ? 'Tick the applicant declaration first' : 'Save profile'}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProfileSection;

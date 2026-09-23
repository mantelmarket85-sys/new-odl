import { useState, useEffect, useRef, useMemo } from "react";
import { User, Bell, Globe, Save, Loader2, Camera, Shield, KeyRound, Eye, EyeOff } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import api, { fileUrl } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB (matches uploadLmsAvatar)
// Strong-password policy — mirrors the server-side rule in lmsAuthV2.js.
const STRONG_PW = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/* ---- Security (live change-password) ----
 * Calls PUT /lms/academic/teacher/me/password. After success the NEW password
 * is the only one accepted at the next login (real-time, stored immediately). */
const SecurityTab = ({ toast }) => {
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [saving, setSaving] = useState(false);

  const score = useMemo(() => {
    const p = pwd.next;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  }, [pwd.next]);
  const label = ["Too weak", "Fair", "Good", "Strong", "Excellent"][score];
  const barColor = ["bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"][score];

  const submit = async () => {
    if (!pwd.current) return toast("Enter your current password", { type: "error" });
    if (!STRONG_PW.test(pwd.next)) return toast("Password must be 8+ chars with uppercase, number & special character", { type: "error" });
    if (pwd.next !== pwd.confirm) return toast("Passwords do not match", { type: "error" });
    setSaving(true);
    try {
      await api.teacher.changePassword(pwd.current, pwd.next);
      toast("Password changed successfully. Use your new password next time you log in.", { type: "success" });
      setPwd({ current: "", next: "", confirm: "" });
    } catch (e) {
      toast(e.message || "Password change failed", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/15";

  return (
    <div>
      <h3 className="font-display font-bold text-xl mb-1 flex items-center gap-2"><KeyRound size={18} /> Security</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">Update your account password.</p>
      <div className="space-y-4 max-w-md">
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Current Password</label>
          <div className="relative">
            <input type={show.current ? "text" : "password"} value={pwd.current} onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))} className={inputCls} placeholder="••••••••" />
            <button type="button" onClick={() => setShow((s) => ({ ...s, current: !s.current }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{show.current ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">New Password</label>
          <div className="relative">
            <input type={show.next ? "text" : "password"} value={pwd.next} onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))} className={inputCls} placeholder="••••••••" />
            <button type="button" onClick={() => setShow((s) => ({ ...s, next: !s.next }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{show.next ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          {pwd.next && (
            <div className="mt-2">
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full ${barColor} transition-all`} style={{ width: `${(score / 4) * 100}%` }} />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Strength: <b className="text-slate-700 dark:text-slate-200">{label}</b></p>
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Confirm Password</label>
          <div className="relative">
            <input type={show.confirm ? "text" : "password"} value={pwd.confirm} onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))} className={inputCls} placeholder="••••••••" />
            <button type="button" onClick={() => setShow((s) => ({ ...s, confirm: !s.confirm }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{show.confirm ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-primary-50 dark:bg-primary-950/30 border border-primary-200/50 dark:border-primary-900/50 text-[11px] text-primary-800 dark:text-primary-200">
          Password must be at least 8 characters and include an uppercase letter, a number, and a special character.
        </div>
        <button onClick={submit} disabled={saving} className="btn-primary text-sm disabled:opacity-60 inline-flex items-center gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {saving ? "Saving…" : "Change Password"}
        </button>
      </div>
    </div>
  );
};
const blankProfileForm = {
  fullName: "", fatherName: "", cnic: "", dateOfBirth: "", gender: "",
  maritalStatus: "", address: "", phone: "", email: "", whatsapp: "",
};

const NOTIF_FIELDS = [
  { key: "emailEnabled", label: "Email notifications" },
  { key: "pushEnabled", label: "Push notifications" },
  { key: "assignmentAlerts", label: "Assignment submission alerts" },
  { key: "quizAlerts", label: "Quiz attempt alerts" },
  { key: "announcementAlerts", label: "Announcement alerts" },
];

const TeacherSettings = () => {
  const { toast } = useToast();
  const { refreshUser, updateUser } = useAuth();
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState(null);
  const [meta, setMeta] = useState({ username: "", role: "" });
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(blankProfileForm);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  const fillForm = (p) => setForm({
    fullName: p?.fullName || "",
    fatherName: p?.fatherName || "",
    cnic: p?.cnic || "",
    dateOfBirth: p?.dateOfBirth || "",
    gender: p?.gender || "",
    maritalStatus: p?.maritalStatus || "",
    address: p?.address || "",
    phone: p?.phone || "",
    email: p?.email || "",
    whatsapp: p?.whatsapp || "",
  });

  const load = () => {
    setLoading(true); setError("");
    Promise.all([api.teacher.profile(), api.teacher.settings()])
      .then(([p, s]) => {
        setProfile(p.profile);
        setMeta({ username: p.username, role: p.role });
        setSettings(s.settings);
        fillForm(p.profile);
      })
      .catch((e) => setError(e.message || "Failed to load settings"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
    if (!form.fullName.trim()) return toast("Full name is required", { type: "error" });
    setSavingProfile(true);
    try {
      const res = await api.teacher.updateProfile(form);
      setProfile(res.profile);
      fillForm(res.profile);
      // Real-time identity sync across ALL modules (header, sidebar, dashboard,
      // messages, etc.): optimistically update the global user, then confirm
      // against the authoritative /me record.
      updateUser({
        name: res.profile?.fullName || form.fullName,
        email: res.profile?.email || form.email,
        ...(res.profile?.photoUrl ? { avatar: fileUrl(res.profile.photoUrl) } : {}),
      });
      refreshUser();
      toast("Profile updated successfully", { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to update profile", { type: "error" });
    } finally { setSavingProfile(false); }
  };

  const onPhotoPick = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast("Please choose an image file", { type: "error" });
    if (file.size > MAX_PHOTO_BYTES) return toast("Photo must be 2MB or smaller", { type: "error" });
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await api.teacher.uploadProfilePhoto(fd);
      const newPhoto = res.photoUrl || res.profile?.photoUrl;
      setProfile((prev) => ({ ...(prev || {}), photoUrl: newPhoto }));
      // Real-time avatar sync everywhere.
      if (newPhoto) updateUser({ avatar: fileUrl(newPhoto) });
      refreshUser();
      toast("Profile photo updated ✓", { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to upload photo", { type: "error" });
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const saveSettings = async (next) => {
    setSettings(next); setSavingSettings(true);
    try {
      const res = await api.teacher.updateSettings(next);
      setSettings(res.settings);
      toast("Preferences saved", { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to save preferences", { type: "error" });
    } finally { setSavingSettings(false); }
  };
  const toggleNotif = (key) => saveSettings({ ...settings, [key]: !settings?.[key] });

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "security", label: "Security", icon: Shield },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "preferences", label: "Preferences", icon: Globe },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Manage your account and preferences" icon="Settings" breadcrumb={["Teacher", "Settings"]} />
        <div className="grid lg:grid-cols-4 gap-5"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="lg:col-span-3 h-96 rounded-2xl" /></div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Manage your account and preferences" icon="Settings" breadcrumb={["Teacher", "Settings"]} />
        <ErrorState description={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your account and preferences" icon="Settings" breadcrumb={["Teacher", "Settings"]} />
      <div className="grid lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 h-fit">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold ${tab === t.id ? "bg-primary-600 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"}`}>
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
          {tab === "profile" && (
            <div>
              <h3 className="font-display font-bold text-xl mb-1">Profile Information</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">Manage your personal details and contact information.</p>

              {/* Photo + identity */}
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  {profile?.photoUrl ? (
                    <img src={fileUrl(profile.photoUrl)} alt="Profile" className="w-20 h-20 rounded-2xl object-cover border border-slate-200 dark:border-slate-700" />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-600 to-blue-500 flex items-center justify-center text-white font-display font-extrabold text-2xl">
                      {(form.fullName || meta.username || "T").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    title="Change photo"
                    className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-lg hover:bg-primary-700 disabled:opacity-60"
                  >
                    {uploadingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  </button>
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPhotoPick(e.target.files?.[0] || null)} />
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100">{form.fullName || meta.username}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{meta.role} · {meta.username}</p>
                  {profile?.department && (
                    <p className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 mt-0.5">Department: {profile.department}</p>
                  )}
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">JPG/PNG/WebP · max 2MB</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Full Name</label>
                  <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900" placeholder="Your full name" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Father Name</label>
                  <input value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900" placeholder="Father's name" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">CNIC</label>
                  <input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900" placeholder="00000-0000000-0" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Date of Birth</label>
                  <input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Gender</label>
                  <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900">
                    <option value="">Select…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Marital Status</label>
                  <select value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900">
                    <option value="">Select…</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900" placeholder="03xx-xxxxxxx" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">WhatsApp</label>
                  <input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900" placeholder="03xx-xxxxxxx" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900" placeholder="you@example.com" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Address</label>
                  <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows="2" className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900" placeholder="Your address" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Department</label>
                  <input value={profile?.department || ""} disabled readOnly className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 cursor-not-allowed" placeholder="Assigned by administration" />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Your department is assigned by the administration and cannot be changed here.</p>
                </div>
              </div>
              <button onClick={saveProfile} disabled={savingProfile} className="btn-primary mt-5 inline-flex items-center gap-2 disabled:opacity-60">
                {savingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Changes
              </button>
            </div>
          )}

          {tab === "security" && <SecurityTab toast={toast} />}

          {tab === "notifications" && (
            <div>
              <h3 className="font-display font-bold text-xl mb-1">Notifications</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">Manage your notification preferences {savingSettings && <span className="text-primary-600">· saving…</span>}</p>
              <div className="space-y-3">
                {NOTIF_FIELDS.map((n) => (
                  <label key={n.key} className="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-800 rounded-xl cursor-pointer">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{n.label}</span>
                    <input type="checkbox" checked={!!settings?.[n.key]} onChange={() => toggleNotif(n.key)} className="w-5 h-5 rounded text-primary-600" />
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === "preferences" && (
            <div>
              <h3 className="font-display font-bold text-xl mb-1">Preferences</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">Customize your experience {savingSettings && <span className="text-primary-600">· saving…</span>}</p>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="text-xs font-semibold mb-1 block">Language</label>
                  <select value={settings?.language || "en"} onChange={(e) => saveSettings({ ...settings, language: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900">
                    <option value="en">English</option><option value="ur">Urdu</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Theme</label>
                  <select value={settings?.theme || "system"} onChange={(e) => saveSettings({ ...settings, theme: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900">
                    <option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeacherSettings;

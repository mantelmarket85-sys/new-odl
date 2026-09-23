import { useState, useEffect, useRef, useMemo } from "react";
import { User, Bell, Globe, Camera, Save, FileText, AlertTriangle, Download, Loader2, RefreshCw, ShieldCheck, ShieldAlert, BadgeCheck, Upload, CheckCircle2, FolderOpen, Shield, KeyRound, Eye, EyeOff } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import api, { fileUrl } from "../../services/api";
import { useToast } from "../../context/ToastContext";

// Strong-password policy — mirrors the server-side rule in lmsAuthV2.js.
const STRONG_PW = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/* ---- Security (live change-password) ----
 * Calls PUT /lms/academic/student/me/password. After success the NEW password
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
      await api.student.changePassword(pwd.current, pwd.next);
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

const NOTIF_FIELDS = [
  { key: "emailEnabled", label: "Email notifications" },
  { key: "pushEnabled", label: "Push notifications" },
  { key: "assignmentAlerts", label: "Assignment due alerts" },
  { key: "quizAlerts", label: "Quiz reminders" },
  { key: "resultAlerts", label: "Result published alerts" },
  { key: "announcementAlerts", label: "Announcement alerts" },
];

const Settings = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState("profile");

  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ phone: "", email: "", address: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(null); // label currently uploading
  const fileRef = useRef(null);
  const docFileRef = useRef(null);
  const pendingDocRef = useRef(null); // { docKey, label } awaiting file selection

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([api.student.profile(), api.student.settings()])
      .then(([p, s]) => {
        setProfile(p.profile);
        setSettings(s.settings);
        setForm({
          phone: p.profile?.phone || "",
          email: p.profile?.email || "",
          address: p.profile?.address || "",
        });
      })
      .catch((e) => setError(e.message || "Failed to load settings"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await api.student.updateProfile(form);
      setProfile(res.profile);
      toast("Profile updated successfully", { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to update profile", { type: "error" });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveSettings = async (next) => {
    setSettings(next);
    setSavingSettings(true);
    try {
      const res = await api.student.updateSettings(next);
      setSettings(res.settings);
      toast("Preferences saved", { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to save preferences", { type: "error" });
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleNotif = (key) => saveSettings({ ...settings, [key]: !settings?.[key] });

  // Re-pull the latest profile from the Admissions System.
  const syncFromAdmissions = async () => {
    setSyncing(true);
    try {
      const res = await api.student.syncProfile();
      setProfile(res.profile);
      setForm({ phone: res.profile?.phone || "", email: res.profile?.email || "", address: res.profile?.address || "" });
      toast("Profile synced with Admissions records", { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to sync profile", { type: "error" });
    } finally {
      setSyncing(false);
    }
  };

  // Upload a new profile picture.
  const onPickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await api.student.uploadProfilePhoto(fd);
      setProfile(res.profile);
      toast("Profile picture updated", { type: "success" });
    } catch (err) {
      toast(err.message || "Failed to upload picture", { type: "error" });
    } finally {
      setUploadingPhoto(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Trigger the hidden file picker for a specific missing document.
  const requestDocUpload = (docKey, label) => {
    pendingDocRef.current = { docKey, label };
    docFileRef.current?.click();
  };

  // Upload the selected file against the pending missing document.
  const onPickDocument = async (e) => {
    const file = e.target.files?.[0];
    const pending = pendingDocRef.current;
    if (!file || !pending) { if (docFileRef.current) docFileRef.current.value = ""; return; }
    setUploadingDoc(pending.label);
    try {
      const fd = new FormData();
      fd.append("document", file);
      fd.append("docKey", pending.docKey || "");
      fd.append("label", pending.label || "");
      const res = await api.student.submitDocument(fd);
      setProfile(res.profile);
      toast(`${pending.label} submitted successfully`, { type: "success" });
    } catch (err) {
      toast(err.message || "Failed to submit document", { type: "error" });
    } finally {
      setUploadingDoc(null);
      pendingDocRef.current = null;
      if (docFileRef.current) docFileRef.current.value = "";
    }
  };

  // Required document catalogue (label → backend field key). Used to render the
  // full checklist and to tell the upload endpoint which field each file fills.
  const REQUIRED_DOCS = [
    { key: "photoUrl", label: "Photo" },
    { key: "cnicDocUrl", label: "CNIC copy" },
    { key: "matricCertUrl", label: "Matric certificate" },
    { key: "intermediateCertUrl", label: "Intermediate / FA / FSc certificate" },
    { key: "migrationCertUrl", label: "Migration certificate" },
    { key: "domicileCertUrl", label: "Domicile certificate" },
  ];

  // Build a label → url map from the backend checklist (or raw profile fields).
  const checklistUrlByLabel = {};
  if (profile?.documentChecklist?.length) {
    for (const d of profile.documentChecklist) checklistUrlByLabel[d.label] = d.url;
  }
  const docFields = profile
    ? REQUIRED_DOCS.map((d) => ({
        key: d.key,
        label: d.label,
        url: checklistUrlByLabel[d.label] ?? profile[d.key] ?? null,
      }))
    : [];
  const uploadedDocs = docFields.filter((d) => d.url);
  const incompleteDocs = docFields.filter((d) => !d.url);
  const docUrl = (u) => (u && /^https?:\/\//.test(u) ? u : fileUrl(u));

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "documents", label: "Documents", icon: FolderOpen },
    { id: "security", label: "Security", icon: Shield },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "preferences", label: "Preferences", icon: Globe },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Manage your account and preferences" icon="Settings" breadcrumb={["Dashboard", "Settings"]} />
        <div className="grid lg:grid-cols-4 gap-5"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="lg:col-span-3 h-96 rounded-2xl" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Manage your account and preferences" icon="Settings" breadcrumb={["Dashboard", "Settings"]} />
        <ErrorState description={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your account and preferences" icon="Settings" breadcrumb={["Dashboard", "Settings"]} />

      {/* Hidden file picker shared by all missing-document upload buttons */}
      <input ref={docFileRef} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={onPickDocument} />

      <div className="grid lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-2 sm:p-3 h-fit flex lg:block gap-2 overflow-x-auto">
          {tabs.map((t) => {
            const isDocs = t.id === "documents";
            const hasMissing = incompleteDocs.length > 0;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 lg:w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tab === t.id ? "bg-primary-600 text-white shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                <t.icon size={16} /> <span className="whitespace-nowrap">{t.label}</span>
                {isDocs && hasMissing && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.id ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>{incompleteDocs.length}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6">
          {tab === "profile" && (
            <div>
              <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
                <div>
                  <h3 className="font-display font-bold text-xl mb-1">Profile Information</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Synchronized with the Admissions System. Academic fields are read-only.</p>
                </div>
                <button onClick={syncFromAdmissions} disabled={syncing} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60">
                  {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync with Admissions
                </button>
              </div>

              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  {profile?.photoUrl ? (
                    <img src={docUrl(profile.photoUrl)} alt="avatar" className="w-20 h-20 rounded-2xl border-2 border-white shadow object-cover" />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-600 to-blue-500 flex items-center justify-center text-white font-display font-extrabold text-2xl">
                      {(profile?.fullName || "S").charAt(0)}
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={onPickPhoto} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploadingPhoto} title="Change profile picture" className="absolute -bottom-1 -right-1 p-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow disabled:opacity-60">
                    {uploadingPhoto ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                  </button>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                    {profile?.fullName || "—"}
                    {profile?.verification && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        profile.verification.tone === "success"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      }`}>
                        {profile.verification.tone === "success" ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                        {profile.verificationStatus}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{profile?.rollNumber || ""}{profile?.registrationNumber ? ` · ${profile.registrationNumber}` : ""}</p>
                  {profile?.verification?.detail && <p className="text-[11px] text-slate-400 mt-0.5">{profile.verification.detail}</p>}
                </div>
              </div>

              {/* Academic & registration info (read-only, from Admissions) */}
              <div className="mb-6 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2"><BadgeCheck size={14} className="text-primary-600" /> Academic Information</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                  {[
                    ["Student ID / Roll No.", profile?.rollNumber],
                    ["Registration No.", profile?.registrationNumber],
                    ["Program", profile?.program],
                    ["Department", profile?.department],
                    ["Session", profile?.session],
                    ["Father Name", profile?.fatherName],
                    ["Date of Birth", profile?.dateOfBirth],
                    ["Gender", profile?.gender],
                    ["Domicile", profile?.domicile],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">{label}</p>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{val || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Full Name (read-only)</label>
                  <input value={profile?.fullName || ""} disabled className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 text-slate-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">CNIC (read-only)</label>
                  <input value={profile?.cnic || ""} disabled className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 text-slate-500" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Email</label>
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Phone</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">Address</label>
                  <textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows="2" className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" />
                </div>
              </div>
              <div className="mt-6 flex items-center gap-3 flex-wrap">
                <button onClick={saveProfile} disabled={savingProfile} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60">
                  {savingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Changes
                </button>
                {incompleteDocs.length > 0 && (
                  <button onClick={() => setTab("documents")} className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100">
                    <AlertTriangle size={15} /> {incompleteDocs.length} Incomplete Document{incompleteDocs.length !== 1 ? "s" : ""}
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "documents" && (
            <div>
              <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
                <div>
                  <h3 className="font-display font-bold text-xl mb-1 flex items-center gap-2"><FileText size={18} className="text-primary-600" /> Documents</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Your admission documents. Submit any outstanding items below — they are saved instantly and your verification status updates automatically.</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                  incompleteDocs.length === 0
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                }`}>
                  {incompleteDocs.length === 0 ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                  {uploadedDocs.length}/{docFields.length} Submitted
                </span>
              </div>

              {/* Incomplete Documents — submission section */}
              <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/20 p-4 sm:p-5 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={17} className="text-amber-600" />
                  <h4 className="font-display font-bold text-base text-amber-800 dark:text-amber-300">Incomplete Documents</h4>
                </div>
                {incompleteDocs.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                    <CheckCircle2 size={17} /> All required documents have been submitted. Nothing pending.
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mb-4">The following documents are missing. Click “Submit Documents” next to each item to upload it (PDF or image).</p>
                    <div className="space-y-2.5">
                      {incompleteDocs.map((d) => (
                        <div key={d.key} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-900/30 flex-wrap">
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                            <span className="truncate">{d.label}</span>
                          </span>
                          <button
                            onClick={() => requestDocUpload(d.key, d.label)}
                            disabled={!!uploadingDoc}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60 shrink-0"
                          >
                            {uploadingDoc === d.label ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Submit Documents
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Submitted documents */}
              <div>
                <h4 className="font-display font-bold text-base mb-3 flex items-center gap-2 text-slate-800 dark:text-slate-200"><CheckCircle2 size={16} className="text-emerald-500" /> Submitted Documents</h4>
                {uploadedDocs.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No documents submitted yet.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {uploadedDocs.map((d) => (
                      <a key={d.label} href={docUrl(d.url)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 min-w-0"><FileText size={14} className="text-emerald-500 shrink-0" /> <span className="truncate">{d.label}</span></span>
                        <Download size={15} className="text-primary-600 shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
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
                  <select value={settings?.language || "English"} onChange={(e) => saveSettings({ ...settings, language: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900">
                    <option>English</option><option>Urdu</option><option>Arabic</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block">Theme</label>
                  <select value={settings?.theme || "light"} onChange={(e) => saveSettings({ ...settings, theme: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900">
                    <option value="light">Light</option><option value="dark">Dark</option><option value="auto">Auto</option>
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

export default Settings;

import { useEffect, useRef, useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { Shield, User, Camera, Building2, Loader2 } from "lucide-react";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

const FocalSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    fullName: "", fatherName: "", email: "", address: "",
    phone: "", whatsapp: "", designation: "", employeeId: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await api.focal.myProfile();
      setAccount(res.account || null);
      setProfile(res.profile || null);
      setForm({
        fullName: res.profile?.fullName || "",
        fatherName: res.profile?.fatherName || "",
        email: res.profile?.email || res.account?.email || "",
        address: res.profile?.address || "",
        phone: res.profile?.phone || "",
        whatsapp: res.profile?.whatsapp || "",
        designation: res.profile?.designation || "",
        employeeId: res.profile?.employeeId || "",
      });
    } catch (e) {
      toast?.(e?.message || "Failed to load profile", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProfile(); /* eslint-disable-next-line */ }, []);

  const saveProfile = async () => {
    if (!form.fullName.trim()) { toast?.("Full name is required", { type: "warning" }); return; }
    setSavingProfile(true);
    try {
      const res = await api.focal.updateMyProfile(form);
      setProfile(res.profile);
      toast?.("Profile updated", { type: "success", title: "Saved" });
    } catch (e) {
      toast?.(e?.message || "Failed to update profile", { type: "error" });
    } finally { setSavingProfile(false); }
  };

  const onPickPhoto = () => fileRef.current?.click();

  const onPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast?.("Please choose an image file", { type: "warning" }); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await api.focal.uploadMyPhoto(fd);
      setProfile((p) => ({ ...(p || {}), photoUrl: res.photoUrl }));
      toast?.("Profile picture updated", { type: "success" });
    } catch (err) {
      toast?.(err?.message || "Failed to upload photo", { type: "error" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updatePassword = async () => {
    if (!pw.current || !pw.next) { toast?.("Enter your current and new password", { type: "warning" }); return; }
    if (pw.next !== pw.confirm) { toast?.("New passwords do not match", { type: "warning" }); return; }
    setSavingPw(true);
    try {
      await api.focal.changePassword(pw.current, pw.next);
      toast?.("Password updated successfully", { type: "success" });
      setPw({ current: "", next: "", confirm: "" });
    } catch (e) {
      toast?.(e?.message || "Failed to update password", { type: "error" });
    } finally { setSavingPw(false); }
  };

  const avatar = api.fileUrl(profile?.photoUrl) || user?.avatar;

  if (loading) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Manage your profile and security." icon="Settings" breadcrumb={["Focal Person", "Settings"]} />
        <div className="card-base p-10 flex items-center justify-center text-muted-app">
          <Loader2 className="animate-spin mr-2" size={18} /> Loading your profile…
        </div>
      </div>
    );
  }

  const field = (label, key, opts = {}) => (
    <div>
      <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">{label}</label>
      <input
        className="input-base py-2 text-sm w-full disabled:opacity-60"
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        disabled={opts.disabled}
        type={opts.type || "text"}
        placeholder={opts.placeholder || ""}
      />
    </div>
  );

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your profile, account and security." icon="Settings" breadcrumb={["Focal Person", "Settings"]} />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* PROFILE PICTURE + ACCOUNT */}
        <div className="card-base p-5">
          <h3 className="font-display font-bold text-lg text-app flex items-center gap-2 mb-3">
            <User size={18} className="text-primary-600 dark:text-primary-400" /> Profile
          </h3>
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <img
                src={avatar}
                alt={form.fullName || "Focal Person"}
                className="w-24 h-24 rounded-full mb-2 shadow border-2 border-white dark:border-slate-800 object-cover bg-slate-100"
              />
              <button
                onClick={onPickPhoto}
                disabled={uploading}
                title="Change photo"
                className="absolute bottom-2 right-0 bg-primary-600 text-white rounded-full p-2 shadow hover:bg-primary-700 disabled:opacity-50"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
            </div>
            <p className="font-bold text-app">{form.fullName || account?.username}</p>
            <p className="text-xs text-muted-app mt-0.5">{form.designation || "Focal Person"}</p>
            <p className="text-xs text-muted-app">{form.email}</p>
            <p className="text-[10px] text-muted-app font-mono mt-1">{form.employeeId}</p>
          </div>

          <div className="mt-4 space-y-2 text-sm border-t border-app pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-muted-app">Username</span>
              <span className="text-app font-mono text-xs">{account?.username}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-muted-app">Role</span>
              <span className="text-app text-xs">Focal Person</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase text-muted-app flex items-center gap-1"><Building2 size={12} /> Department</span>
              <span className="text-app text-xs text-right">{profile?.department || "—"}</span>
            </div>
            <p className="text-[10px] text-muted-app pt-1">Your department is assigned by the Provost and governs the records you can access.</p>
          </div>
        </div>

        {/* EDITABLE PROFILE */}
        <div className="card-base p-5 lg:col-span-2">
          <h3 className="font-display font-bold text-lg text-app flex items-center gap-2 mb-3">
            <User size={18} className="text-primary-600 dark:text-primary-400" /> Personal Information
          </h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {field("Full Name", "fullName")}
            {field("Father Name", "fatherName")}
            {field("Email", "email", { type: "email" })}
            {field("Phone", "phone")}
            {field("WhatsApp", "whatsapp")}
            {field("Designation", "designation")}
            {field("Employee ID", "employeeId")}
            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Address</label>
              <textarea
                className="input-base py-2 text-sm w-full"
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          <button onClick={saveProfile} disabled={savingProfile} className="btn-primary text-sm mt-4 disabled:opacity-50">
            {savingProfile ? "Saving…" : "Save Changes"}
          </button>
        </div>

        {/* SECURITY */}
        <div className="card-base p-5 lg:col-span-3">
          <h3 className="font-display font-bold text-lg text-app flex items-center gap-2 mb-3">
            <Shield size={18} className="text-primary-600 dark:text-primary-400" /> Security
          </h3>
          <div className="grid sm:grid-cols-3 gap-3 max-w-3xl">
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Current Password</label>
              <input type="password" className="input-base py-2 text-sm w-full" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">New Password</label>
              <input type="password" className="input-base py-2 text-sm w-full" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Confirm New Password</label>
              <input type="password" className="input-base py-2 text-sm w-full" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
            </div>
          </div>
          <p className="text-[10px] text-muted-app mt-2">Min 8 chars with an uppercase letter, a number, and a special character.</p>
          <button onClick={updatePassword} disabled={savingPw} className="btn-primary text-sm mt-3 disabled:opacity-50">
            {savingPw ? "Updating…" : "Change Password"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FocalSettings;

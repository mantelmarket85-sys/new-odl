import { useEffect, useState, useRef } from "react";
import PageHeader from "../../components/common/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { User, Shield, Camera, Save, Loader2, Trash2, Bell } from "lucide-react";
import api from "../../services/api";
import { API_BASE } from "../../services/authService";
import { useToast } from "../../context/ToastContext";

const ORIGIN = API_BASE.replace(/\/api$/, "");
const photoSrc = (url) => (url ? (url.startsWith("http") ? url : `${ORIGIN}${url}`) : "");

const EMPTY = {
  fullName: "", fatherName: "", cnic: "", email: "", phone: "",
  whatsapp: "", gender: "", maritalStatus: "", address: "",
};

const QECSettings = () => {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef(null);

  const [account, setAccount] = useState(null); // { username, email, role }
  const [form, setForm] = useState(EMPTY);
  const [photoUrl, setPhotoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await api.qec.profile();
      setAccount(res.user || null);
      const p = res.profile || {};
      setForm({
        fullName: p.fullName || "", fatherName: p.fatherName || "", cnic: p.cnic || "",
        email: p.email || res.user?.email || "", phone: p.phone || "", whatsapp: p.whatsapp || "",
        gender: p.gender || "", maritalStatus: p.maritalStatus || "", address: p.address || "",
      });
      setPhotoUrl(p.photoUrl || "");
    } catch (e) { toast?.(e?.message || "Failed to load profile", { type: "error" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadProfile(); /* eslint-disable-next-line */ }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    if (!form.fullName.trim()) { toast?.("Full Name is required", { type: "warning" }); return false; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast?.("Please enter a valid email address", { type: "warning" }); return false;
    }
    if (form.cnic && !/^\d{5}-?\d{7}-?\d$/.test(form.cnic.trim())) {
      toast?.("CNIC should be in the format 00000-0000000-0", { type: "warning" }); return false;
    }
    return true;
  };

  const saveProfile = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await api.qec.updateFullProfile(form);
      toast?.("Profile saved", { type: "success" });
      await loadProfile();
      // Propagate the new identity (name / email / phone) to the header,
      // sidebar, dashboard and everywhere `useAuth().user` is read — in real
      // time, no page refresh required.
      await refreshUser?.();
    } catch (e) { toast?.(e?.message || "Failed to save profile", { type: "error" }); }
    finally { setSaving(false); }
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
      const res = await api.qec.uploadProfilePhoto(fd);
      setPhotoUrl(res.photoUrl || "");
      toast?.("Profile picture updated", { type: "success" });
      // Reflect the new avatar everywhere (header / sidebar) immediately.
      await refreshUser?.();
    } catch (err) { toast?.(err?.message || "Upload failed", { type: "error" }); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const removePhoto = async () => {
    setRemoving(true);
    try {
      await api.qec.removeProfilePhoto();
      setPhotoUrl("");
      toast?.("Profile picture removed", { type: "info" });
      // Reflect the removed avatar everywhere (header / sidebar) immediately.
      await refreshUser?.();
    } catch (err) { toast?.(err?.message || "Failed to remove photo", { type: "error" }); }
    finally { setRemoving(false); }
  };

  const updatePassword = async () => {
    if (!pw.current || !pw.next) { toast?.("Enter your current and new password", { type: "warning" }); return; }
    if (pw.next !== pw.confirm) { toast?.("New passwords do not match", { type: "warning" }); return; }
    setSavingPw(true);
    try {
      await api.qec.changePassword({ currentPassword: pw.current, newPassword: pw.next });
      toast?.("Password updated successfully", { type: "success" });
      setPw({ current: "", next: "", confirm: "" });
    } catch (e) { toast?.(e?.message || "Failed to update password", { type: "error" }); }
    finally { setSavingPw(false); }
  };

  const roleLabel = "Director QEC";
  const initials = (form.fullName || account?.username || "QEC").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const Field = ({ label, k, type = "text", placeholder }) => (
    <div>
      <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">{label}</label>
      <input type={type} className="input-base py-2 text-sm w-full" value={form[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage your Director QEC profile, photo and security." icon="Settings" breadcrumb={["QEC", "Settings"]} />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* PROFILE PICTURE + ACCOUNT */}
        <div className="card-base p-5 lg:col-span-1 h-fit">
          <h3 className="font-bold text-app mb-4 flex items-center gap-2"><Camera size={16} /> Profile Picture</h3>
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-app bg-primary-100 dark:bg-primary-950/40 flex items-center justify-center">
                {photoUrl ? (
                  <img src={photoSrc(photoUrl)} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-primary-700 dark:text-primary-300">{initials}</span>
                )}
              </div>
              <button onClick={onPickPhoto} disabled={uploading} className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-lg disabled:opacity-50" title="Upload / Update photo">
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
            </div>
            <p className="mt-3 font-bold text-app">{form.fullName || account?.username || "—"}</p>
            <p className="text-xs text-muted-app">{roleLabel}</p>
            <p className="text-[11px] text-muted-app mt-1">{account?.username}</p>
            {photoUrl && (
              <button onClick={removePhoto} disabled={removing} className="mt-3 text-xs inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50">
                {removing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Remove photo
              </button>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-app space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-app">Username</span><span className="text-app font-semibold">{account?.username || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-app">Role</span><span className="text-app font-semibold">{roleLabel}</span></div>
          </div>
        </div>

        {/* PROFILE DETAILS */}
        <div className="card-base p-5 lg:col-span-2">
          <h3 className="font-bold text-app mb-4 flex items-center gap-2"><User size={16} /> Profile Details</h3>
          {loading ? (
            <div className="py-10 flex justify-center text-muted-app"><Loader2 size={20} className="animate-spin" /></div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Full Name" k="fullName" placeholder="Full name" />
                <Field label="Father Name" k="fatherName" placeholder="Father's name" />
                <Field label="CNIC" k="cnic" placeholder="00000-0000000-0" />
                <Field label="Email Address" k="email" type="email" placeholder="name@example.com" />
                <Field label="Mobile Number" k="phone" placeholder="03xx-xxxxxxx" />
                <Field label="WhatsApp Number" k="whatsapp" placeholder="03xx-xxxxxxx" />
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Gender</label>
                  <select className="input-base py-2 text-sm w-full" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                    <option value="">Select…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Marital Status</label>
                  <select className="input-base py-2 text-sm w-full" value={form.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)}>
                    <option value="">Select…</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Complete Address</label>
                  <textarea className="input-base py-2 text-sm w-full" rows={2} value={form.address} placeholder="Complete postal address" onChange={(e) => set("address", e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={saveProfile} disabled={saving} className="btn-primary text-sm py-2 px-5 inline-flex items-center gap-2 disabled:opacity-50">
                  <Save size={14} /> {saving ? "Saving…" : "Save Profile"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* NOTIFICATIONS (informational — delivered automatically) */}
        <div className="card-base p-5 lg:col-span-1 h-fit">
          <h3 className="font-bold text-app mb-3 flex items-center gap-2"><Bell size={16} /> Notifications</h3>
          <p className="text-xs text-muted-app">
            In-app notifications are delivered automatically for all QEC workflow events —
            new survey responses, compliance updates and quality alerts appear in your
            notification center in real time.
          </p>
        </div>

        {/* SECURITY */}
        <div className="card-base p-5 lg:col-span-2">
          <h3 className="font-bold text-app mb-4 flex items-center gap-2"><Shield size={16} /> Security</h3>
          <div className="grid sm:grid-cols-3 gap-3">
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
          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-muted-app">Min 8 chars with an uppercase letter, a number, and a special character.</p>
            <button onClick={updatePassword} disabled={savingPw} className="btn-primary text-sm py-2 px-5 disabled:opacity-50">
              {savingPw ? "Updating…" : "Update Password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QECSettings;

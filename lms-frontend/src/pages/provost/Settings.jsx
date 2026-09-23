import { useEffect, useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { Settings, Bell, Shield } from "lucide-react";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

const ProvostSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [me, setMe] = useState(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    let live = true;
    api.provost.me()
      .then((res) => {
        if (!live) return;
        setMe(res.user);
        setUsername(res.user?.username || user?.name || "");
        setEmail(res.user?.email || user?.email || "");
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const saveProfile = async () => {
    if (!username.trim() || username.trim().length < 3) {
      toast?.("Username must be at least 3 characters", { type: "warning" });
      return;
    }
    setSavingProfile(true);
    try {
      const res = await api.provost.updateProfile({ username: username.trim(), email: email.trim() });
      setMe((m) => ({ ...m, username: res.user?.username, email: res.user?.email }));
      toast?.("Profile updated", { type: "success" });
    } catch (e) {
      toast?.(e?.message || "Failed to update profile", { type: "error" });
    } finally { setSavingProfile(false); }
  };

  const updatePassword = async () => {
    if (!pw.current || !pw.next) { toast?.("Enter your current and new password", { type: "warning" }); return; }
    if (pw.next !== pw.confirm) { toast?.("New passwords do not match", { type: "warning" }); return; }
    setSavingPw(true);
    try {
      await api.provost.changePassword({ currentPassword: pw.current, newPassword: pw.next });
      toast?.("Password updated successfully", { type: "success" });
      setPw({ current: "", next: "", confirm: "" });
    } catch (e) {
      toast?.(e?.message || "Failed to update password", { type: "error" });
    } finally { setSavingPw(false); }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Profile, notifications, and security" icon="Settings" breadcrumb={["Provost", "Settings"]} />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-base p-5">
          <h3 className="font-bold text-app mb-3 flex items-center gap-2"><Settings size={16} /> Profile</h3>
          <div className="space-y-3 text-sm">
            <div><label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Name</label><input className="input-base py-2 text-sm w-full" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
            <div><label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Email</label><input className="input-base py-2 text-sm w-full" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Role</label><input className="input-base py-2 text-sm w-full" defaultValue="Provost" disabled /></div>
            <button onClick={saveProfile} disabled={savingProfile} className="btn-primary text-sm w-full disabled:opacity-50">{savingProfile ? "Saving…" : "Save Changes"}</button>
          </div>
        </div>
        <div className="card-base p-5">
          <h3 className="font-bold text-app mb-3 flex items-center gap-2"><Bell size={16} /> Notifications</h3>
          <div className="space-y-2 text-sm">
            {["Weekly executive digest", "Major financial events", "QEC alerts", "Compliance breaches"].map((t, i) => (
              <label key={i} className="flex items-center gap-2 text-app"><input type="checkbox" defaultChecked /> {t}</label>
            ))}
            <p className="text-[10px] text-muted-app pt-2">In-app notifications are delivered automatically for all Provost workflow events.</p>
          </div>
        </div>
        <div className="card-base p-5">
          <h3 className="font-bold text-app mb-3 flex items-center gap-2"><Shield size={16} /> Security</h3>
          <div className="space-y-3 text-sm">
            <div><label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Current Password</label><input type="password" className="input-base py-2 text-sm w-full" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></div>
            <div><label className="text-[10px] font-bold uppercase text-muted-app block mb-1">New Password</label><input type="password" className="input-base py-2 text-sm w-full" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></div>
            <div><label className="text-[10px] font-bold uppercase text-muted-app block mb-1">Confirm New Password</label><input type="password" className="input-base py-2 text-sm w-full" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></div>
            <p className="text-[10px] text-muted-app">Min 8 chars with an uppercase letter, a number, and a special character.</p>
            <button onClick={updatePassword} disabled={savingPw} className="btn-primary text-sm w-full disabled:opacity-50">{savingPw ? "Updating…" : "Update Password"}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProvostSettings;

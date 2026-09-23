import { useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Shield, Bell, Palette, KeyRound, Save, Sun, Moon, Check,
  Eye, EyeOff, ChevronRight, ShieldCheck, CheckCheck, BellRing, GraduationCap, Lock, Camera, Loader2,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { useToast } from "../../context/ToastContext";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";

/* =========================================================================
 * Course Coordinator → Settings (LIVE)
 *
 *  - Profile: real account info from the auth context (/auth/me)
 *  - Security: real password change via /lms/auth/change-password
 *  - Notifications: live feed via /coordinator/notifications + mark read
 *  - Appearance: real theme switching (ThemeContext)
 * No mock data, no fake toggles.
 * ======================================================================= */

const STRONG_PW = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const CoordinatorSettings = () => {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { user, updateUser, refreshUser } = useAuth();
  const [tab, setTab] = useState("profile");

  const tabs = [
    { id: "profile", label: "Profile", icon: User, hint: "Account details" },
    { id: "security", label: "Security", icon: Shield, hint: "Change password" },
    { id: "notifications", label: "Notifications", icon: Bell, hint: "Live alerts" },
    { id: "appearance", label: "Appearance", icon: Palette, hint: "Theme" },
  ];

  return (
    <div className="px-6 py-6">
      <PageHeader title="Settings" subtitle="Coordinator account settings" icon="Settings" breadcrumb={["Coordinator", "Settings"]} />

      <div className="grid lg:grid-cols-12 gap-5">
        <aside className="lg:col-span-3">
          <div className="card-base p-2 sticky top-20">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all mb-0.5 ${active ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/20" : "text-app hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${active ? "bg-white/15" : "bg-slate-100 dark:bg-slate-800"}`}>
                    <t.icon size={16} className={active ? "text-white" : "text-violet-600 dark:text-violet-400"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{t.label}</p>
                    <p className={`text-[11px] leading-tight ${active ? "text-white/80" : "text-muted-app"}`}>{t.hint}</p>
                  </div>
                  <ChevronRight size={14} className={active ? "text-white/70" : "text-muted-app"} />
                </button>
              );
            })}
            <div className="mx-2 mt-3 p-3 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40 border border-violet-200/40 dark:border-violet-800/40">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck size={14} className="text-violet-600" />
                <p className="text-xs font-bold text-app">Course Coordinator</p>
              </div>
              <p className="text-[11px] text-muted-app">{user?.username || "—"}</p>
            </div>
          </div>
        </aside>

        <main className="lg:col-span-9">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="card-base p-6">
              {tab === "profile" && <ProfileTab user={user} toast={toast} updateUser={updateUser} refreshUser={refreshUser} />}
              {tab === "security" && <SecurityTab toast={toast} />}
              {tab === "notifications" && <NotificationsTab toast={toast} />}
              {tab === "appearance" && <AppearanceTab theme={theme} setTheme={setTheme} toast={toast} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

/* ---- Shared bits ---- */
const SectionTitle = ({ title, subtitle, icon: Icon }) => (
  <div className="flex items-start gap-3 mb-5 pb-4 border-b border-app">
    {Icon && <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-md"><Icon size={18} /></div>}
    <div>
      <h3 className="font-bold text-app text-xl tracking-tight">{title}</h3>
      <p className="text-sm text-muted-app mt-0.5">{subtitle}</p>
    </div>
  </div>
);

const Field = ({ label, value }) => (
  <div className="surface border border-app rounded-xl p-3.5">
    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-app mb-1">{label}</p>
    <p className="text-sm font-semibold text-app break-words">{value || "—"}</p>
  </div>
);

/* ---- Profile (live, editable) ---- */
const PROFILE_FIELDS = [
  { key: "fullName", label: "Full Name", type: "text" },
  { key: "fatherName", label: "Father Name", type: "text" },
  { key: "cnic", label: "CNIC", type: "text", placeholder: "00000-0000000-0" },
  { key: "dateOfBirth", label: "Date of Birth", type: "date" },
  { key: "gender", label: "Gender", type: "select", options: ["", "Male", "Female", "Other"] },
  { key: "maritalStatus", label: "Marital Status", type: "select", options: ["", "Single", "Married", "Divorced", "Widowed"] },
  { key: "phone", label: "Phone Number", type: "text", placeholder: "03xx-xxxxxxx" },
  { key: "whatsapp", label: "WhatsApp Number", type: "text", placeholder: "03xx-xxxxxxx" },
  { key: "email", label: "Email", type: "email" },
  { key: "department", label: "Department", type: "text", placeholder: "e.g. Department of Computing" },
  { key: "address", label: "Address", type: "textarea", full: true },
];

const ProfileTab = ({ user, toast, updateUser, refreshUser }) => {
  const fileRef = useRef(null);
  const { data, loading, error, reload, setData } = useApi(() => api.coordinator.myProfile(), []);
  const profile = data?.profile || {};
  const account = data?.account || {};
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Initialise the editable form once the profile loads.
  const current = form ?? PROFILE_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: profile[f.key] ?? "" }), {});
  const set = (k, v) => setForm({ ...current, [k]: v });

  const roleLabel = (account.role || user?.role || "").replace(/([A-Z])/g, " $1").trim();
  const photoSrc = profile.photoUrl
    ? api.fileUrl(profile.photoUrl)
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.fullName || user?.username || "C")}&background=7c3aed&color=fff&bold=true&size=128`;

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.coordinator.updateMyProfile(current);
      setData((d) => ({ ...d, profile: res.profile }));
      setForm(null);
      // Propagate the updated identity (name, email, etc.) across the entire
      // LMS in real time: header, sidebar, dashboard, user menu, etc.
      const updated = res.profile || current;
      updateUser?.({
        name: updated.fullName || current.fullName,
        email: updated.email || current.email,
        phone: updated.phone || current.phone,
        department: updated.department || current.department,
      });
      // Confirm against the backend (/me) so every consumer is consistent.
      refreshUser?.();
      toast("Profile updated", { type: "success" });
    } catch (e) {
      toast(e.message || "Failed to update profile", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await api.coordinator.uploadMyPhoto(fd);
      setData((d) => ({ ...d, profile: { ...d.profile, photoUrl: res.photoUrl } }));
      // Update the global avatar in real time + confirm via /me.
      if (res.photoUrl) updateUser?.({ avatar: api.fileUrl(res.photoUrl) });
      refreshUser?.();
      toast("Profile picture updated", { type: "success" });
    } catch (err) {
      toast(err.message || "Failed to upload photo", { type: "error" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (error) return <ErrorState title="Couldn't load profile" description={error} onRetry={reload} />;
  if (loading) return <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div>
      <SectionTitle title="Profile" subtitle="Manage your coordinator profile details" icon={User} />
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <img src={photoSrc} alt="avatar" className="w-20 h-20 rounded-2xl shadow-md object-cover" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-lg hover:bg-violet-700 disabled:opacity-60">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
        </div>
        <div>
          <p className="text-lg font-bold text-app">{profile.fullName || account.username}</p>
          <p className="text-sm text-muted-app flex items-center gap-1"><GraduationCap size={13} /> {roleLabel || "Course Coordinator"}</p>
          <p className="text-[11px] text-muted-app mt-0.5">{account.username} · {account.isActive === false ? "Inactive" : "Active"}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {PROFILE_FIELDS.map((f) => (
          <div key={f.key} className={f.full ? "sm:col-span-2" : ""}>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-app mb-1 block">{f.label}</label>
            {f.type === "textarea" ? (
              <textarea value={current[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-xl surface border border-app text-sm text-app focus:outline-none focus:ring-2 focus:ring-violet-500/20" placeholder={f.placeholder} />
            ) : f.type === "select" ? (
              <select value={current[f.key] || ""} onChange={(e) => set(f.key, e.target.value)}
                className="w-full px-3 py-2 rounded-xl surface border border-app text-sm text-app focus:outline-none focus:ring-2 focus:ring-violet-500/20">
                {f.options.map((o) => <option key={o} value={o}>{o || "Select…"}</option>)}
              </select>
            ) : (
              <input type={f.type} value={current[f.key] || ""} onChange={(e) => set(f.key, e.target.value)}
                className="w-full px-3 py-2 rounded-xl surface border border-app text-sm text-app focus:outline-none focus:ring-2 focus:ring-violet-500/20" placeholder={f.placeholder} />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-5">
        {form && <button onClick={() => setForm(null)} className="btn-secondary text-sm">Cancel</button>}
        <button onClick={save} disabled={saving || !form} className="btn-primary text-sm disabled:opacity-50 inline-flex items-center gap-1.5">
          <Save size={14} /> {saving ? "Saving…" : "Save Profile"}
        </button>
      </div>
    </div>
  );
};

/* ---- Security (live change-password) ---- */
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
    if (!pwd.current) { toast("Enter your current password", { type: "error" }); return; }
    if (!STRONG_PW.test(pwd.next)) { toast("Password must be 8+ chars with uppercase, number & special character", { type: "error" }); return; }
    if (pwd.next !== pwd.confirm) { toast("Passwords do not match", { type: "error" }); return; }
    setSaving(true);
    try {
      await api.coordinator.changePassword(pwd.current, pwd.next);
      toast("Password changed successfully", { type: "success" });
      setPwd({ current: "", next: "", confirm: "" });
    } catch (e) {
      toast(e.message || "Password change failed", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionTitle title="Security" subtitle="Update your account password" icon={KeyRound} />
      <div className="space-y-4 max-w-md">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-app mb-1.5 block">Current Password</label>
          <div className="relative">
            <input type={show.current ? "text" : "password"} value={pwd.current} onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))}
              className="w-full px-3.5 py-2.5 pr-10 rounded-xl surface border border-app text-sm text-app focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/15" placeholder="••••••••" />
            <button type="button" onClick={() => setShow((s) => ({ ...s, current: !s.current }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-app">
              {show.current ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-app mb-1.5 block">New Password</label>
          <div className="relative">
            <input type={show.next ? "text" : "password"} value={pwd.next} onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))}
              className="w-full px-3.5 py-2.5 pr-10 rounded-xl surface border border-app text-sm text-app focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/15" placeholder="••••••••" />
            <button type="button" onClick={() => setShow((s) => ({ ...s, next: !s.next }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-app">
              {show.next ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {pwd.next && (
            <div className="mt-2">
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full ${barColor} transition-all`} style={{ width: `${(score / 4) * 100}%` }} />
              </div>
              <p className="text-[11px] text-muted-app mt-1">Strength: <b className="text-app">{label}</b></p>
            </div>
          )}
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-app mb-1.5 block">Confirm Password</label>
          <div className="relative">
            <input type={show.confirm ? "text" : "password"} value={pwd.confirm} onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))}
              className="w-full px-3.5 py-2.5 pr-10 rounded-xl surface border border-app text-sm text-app focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/15" placeholder="••••••••" />
            <button type="button" onClick={() => setShow((s) => ({ ...s, confirm: !s.confirm }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-app">
              {show.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200/50 dark:border-violet-900/50 text-[11px] text-violet-800 dark:text-violet-200">
          Password must be at least 8 characters and include an uppercase letter, a number, and a special character.
        </div>
        <button onClick={submit} disabled={saving} className="btn-primary text-sm disabled:opacity-60 inline-flex items-center gap-1.5">
          <Save size={14} /> {saving ? "Saving…" : "Change Password"}
        </button>
      </div>
    </div>
  );
};

/* ---- Notifications (live feed) ---- */
const NotificationsTab = ({ toast }) => {
  const { data, loading, error, reload, setData } = useApi(() => api.coordinator.notifications(), []);
  const notifications = data?.notifications || [];
  const unread = data?.unread ?? notifications.filter((n) => !n.isRead).length;
  const [busy, setBusy] = useState(false);

  const markRead = async (id) => {
    try {
      await api.coordinator.readNotification(id);
      setData((d) => ({ ...d, notifications: d.notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)), unread: Math.max(0, (d.unread || 1) - 1) }));
    } catch (e) {
      toast(e.message || "Failed to mark read", { type: "error" });
    }
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await api.coordinator.readAllNotifications();
      toast("All notifications marked read", { type: "success" });
      reload();
    } catch (e) {
      toast(e.message || "Failed", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle title="Notifications" subtitle="Your live academic & system alerts" icon={BellRing} />
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-app">
          {unread > 0 ? <><b className="text-app">{unread}</b> unread</> : "All caught up"}
        </p>
        <button onClick={markAll} disabled={busy || unread === 0} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50 inline-flex items-center gap-1">
          <CheckCheck size={13} /> Mark all read
        </button>
      </div>

      {error ? (
        <ErrorState title="Couldn't load notifications" description={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : notifications.length === 0 ? (
        <EmptyState icon="Bell" title="No notifications" description="You have no notifications yet." />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={`flex items-start gap-3 p-3 rounded-xl border ${n.isRead ? "surface border-app" : "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-900/60"}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${n.isRead ? "bg-slate-100 dark:bg-slate-800 text-muted-app" : "bg-violet-500 text-white"}`}>
                <Bell size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-app text-sm">{n.title}</p>
                  {!n.isRead && (
                    <button onClick={() => markRead(n.id)} className="text-[11px] font-bold text-violet-600 dark:text-violet-400 inline-flex items-center gap-1 flex-shrink-0">
                      <Check size={12} /> Read
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-app mt-0.5">{n.message}</p>
                <p className="text-[10px] text-muted-app mt-1">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ---- Appearance (real theme) ---- */
const AppearanceTab = ({ theme, setTheme, toast }) => {
  const options = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
  ];
  return (
    <div>
      <SectionTitle title="Appearance" subtitle="Choose how the LMS looks for you" icon={Palette} />
      <div className="grid sm:grid-cols-2 gap-3">
        {options.map((o) => {
          const active = theme === o.id;
          return (
            <button key={o.id} onClick={() => { setTheme(o.id); toast(`${o.label} theme applied`, { type: "success" }); }}
              className={`rounded-2xl p-5 border-2 text-left transition-all ${active ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-app surface hover:border-violet-300"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? "bg-violet-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-muted-app"}`}>
                  <o.icon size={18} />
                </div>
                {active && <Check size={18} className="text-violet-600" />}
              </div>
              <p className="font-bold text-app">{o.label}</p>
              <p className="text-xs text-muted-app">{o.id === "system" ? "Match device setting" : `${o.label} interface`}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CoordinatorSettings;

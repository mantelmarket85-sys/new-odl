import { useState, useRef, useEffect } from "react";
import { Bell, Search, Menu, MessageSquare, ChevronDown, LogOut, User, Settings, Command } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import ThemeToggle from "../common/ThemeToggle";
import api from "../../services/api";

// Map the frontend role key → the api.<role> namespace that exposes
// notifications(). Roles without their own feed simply show none.
const NOTIF_API = {
  student: () => api.student,
  teacher: () => api.teacher,
  admin: () => api.coordinator,
  focal_person: () => api.focal,
  exam_coordinator: () => api.exam,
  director_qec: () => api.qec,
  provost: () => api.provost,
};

const timeAgo = (d) => {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/* Initials fallback so we never show a broken image when a user (e.g. a
 * student without an uploaded admission photo) has no real avatar. */
const initialsOf = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "U";

const Avatar = ({ src, name, className }) =>
  src ? (
    <img src={src} alt={name || ""} className={className} />
  ) : (
    <span className={`${className} inline-flex items-center justify-center bg-gradient-to-br from-primary-600 to-indigo-600 text-white font-bold text-xs`}>
      {initialsOf(name)}
    </span>
  );

const Navbar = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const [openProfile, setOpenProfile] = useState(false);
  const [openNotif, setOpenNotif] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);
  const profileRef = useRef(null);
  const notifRef = useRef(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setOpenProfile(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setOpenNotif(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Keyboard shortcut ⌘K
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpenSearch(true);
      }
      if (e.key === "Escape") setOpenSearch(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const role = user?.role || "student";

  // Real, system-generated notifications for the authenticated user only.
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    let cancelled = false;
    const ns = NOTIF_API[role]?.();
    if (!ns || typeof ns.notifications !== "function") { setNotifications([]); return; }
    ns.notifications()
      .then((res) => { if (!cancelled) setNotifications(Array.isArray(res) ? res : (res?.notifications || [])); })
      .catch(() => { if (!cancelled) setNotifications([]); });
    return () => { cancelled = true; };
  }, [role]);

  const markAllRead = async () => {
    const ns = NOTIF_API[role]?.();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try { await ns?.readAllNotifications?.(); } catch (_) { /* ignore */ }
  };

  return (
    <>
      <header className="sticky top-0 z-30 glass border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-center justify-between px-4 lg:px-6 py-2.5 gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button onClick={onMenuClick} className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-app">
              <Menu size={20} />
            </button>

            {/* Search bar */}
            <button
              onClick={() => setOpenSearch(true)}
              className="hidden md:flex items-center gap-2 w-full max-w-md px-3.5 py-2 bg-slate-100/80 dark:bg-slate-800/60 hover:bg-slate-200/80 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-xl text-sm text-slate-500 dark:text-slate-400 transition"
            >
              <Search size={16} />
              <span className="flex-1 text-left">Search courses, lectures, library, appeals…</span>
              <kbd className="hidden lg:inline-flex items-center gap-0.5 text-[10px] bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded font-mono border border-slate-200 dark:border-slate-600 text-app">
                <Command size={10} />K
              </kbd>
            </button>

            <button onClick={() => setOpenSearch(true)} className="md:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-app">
              <Search size={18} />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <ThemeToggle size="sm" />

            <Link to={`/${role}/messages`} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 relative">
              <MessageSquare size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
            </Link>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => { setOpenNotif(!openNotif); setOpenProfile(false); }}
                className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 relative"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 ring-2 ring-white dark:ring-slate-900">{unreadCount}</span>
                )}
              </button>
              <AnimatePresence>
                {openNotif && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-[360px] card-base shadow-2xl overflow-hidden z-50"
                  >
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
                      <div>
                        <h4 className="font-bold text-app">Notifications</h4>
                        <p className="text-[11px] text-muted-app">{unreadCount} unread · {notifications.length} total</p>
                      </div>
                      {notifications.length > 0 && (
                        <button onClick={markAllRead} className="text-xs text-primary-600 dark:text-primary-400 font-semibold hover:underline">Mark all read</button>
                      )}
                    </div>
                    <div className="max-h-[420px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                          <Bell size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                          <p className="text-sm text-muted-app">No notifications yet</p>
                        </div>
                      ) : notifications.map((n) => (
                        <div key={n.id} className={`px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer flex gap-3 border-b border-slate-50 dark:border-slate-800/50 last:border-b-0 ${!n.isRead ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}>
                          <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-950/40 flex items-center justify-center shrink-0">
                            <Bell size={16} className="text-primary-600 dark:text-primary-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-sm text-app">{n.title}</p>
                              {!n.isRead && <span className="text-[9px] bg-primary-600 text-white font-bold px-1.5 py-0.5 rounded shrink-0">NEW</span>}
                            </div>
                            <p className="text-xs text-muted-app line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-muted-app mt-0.5">{timeAgo(n.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-slate-100 dark:border-slate-800 p-2">
                      <button className="w-full text-center py-2 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:bg-slate-50 dark:hover:bg-slate-900 dark:hover:bg-slate-800/50 rounded-lg">
                        View All Notifications
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => { setOpenProfile(!openProfile); setOpenNotif(false); }}
                className="flex items-center gap-2 pl-1 pr-2.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                <Avatar src={user?.avatar} name={user?.name} className="w-8 h-8 rounded-full ring-2 ring-white dark:ring-slate-800 shadow object-cover" />
                <div className="hidden md:block text-left">
                  <p className="text-xs font-bold text-app leading-tight">{user?.name}</p>
                  <p className="text-[10px] text-muted-app capitalize">{user?.role === "admin" ? "Course Coordinator" : user?.role}</p>
                </div>
                <ChevronDown size={14} className="text-slate-500 dark:text-slate-400 hidden md:block" />
              </button>
              <AnimatePresence>
                {openProfile && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-64 card-base shadow-2xl overflow-hidden z-50"
                  >
                    <div className="px-4 py-4 bg-gradient-to-br from-primary-600 via-blue-600 to-indigo-600 text-white">
                      <div className="flex items-center gap-3">
                        <Avatar src={user?.avatar} name={user?.name} className="w-12 h-12 rounded-full ring-2 ring-white/80 object-cover" />
                        <div className="min-w-0">
                          <p className="font-bold truncate">{user?.name}</p>
                          <p className="text-[11px] text-white/80 truncate">{user?.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-2">
                      <Link to={`/${role}/settings`} onClick={() => setOpenProfile(false)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 dark:hover:bg-slate-800/50 text-sm text-app">
                        <User size={15} /> My Profile
                      </Link>
                      <Link to={`/${role}/settings`} onClick={() => setOpenProfile(false)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 dark:hover:bg-slate-800/50 text-sm text-app">
                        <Settings size={15} /> Settings
                      </Link>
                      <hr className="my-1 border-slate-100 dark:border-slate-800" />
                      <button
                        onClick={() => { logout(); navigate("/login"); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-sm text-rose-600 dark:text-rose-400"
                      >
                        <LogOut size={15} /> Logout
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Command Palette Search Modal */}
      <AnimatePresence>
        {openSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenSearch(false)}
            className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-md flex items-start justify-center pt-24 px-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: -10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: -10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl card-base shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <Search size={20} className="text-slate-400 dark:text-slate-500" />
                <input autoFocus type="text" placeholder="Search anything in AUST ODL…" className="flex-1 bg-transparent outline-none text-app placeholder-slate-400 dark:placeholder-slate-500 text-base" />
                <kbd className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono text-app">ESC</kbd>
              </div>
              <div className="p-4 space-y-1">
                <p className="text-[10px] tracking-widest font-bold text-muted-app uppercase mb-2">Quick Actions</p>
                {[
                  { label: "Go to Dashboard", to: `/${role}` },
                  { label: "Open Course Library", to: `/${role === "admin" ? "admin" : role}/library` },
                  { label: "View Live Classes", to: `/${role}/live-classes` },
                  { label: "Check Messages", to: `/${role}/messages` },
                ].map((q, i) => (
                  <Link key={i} to={q.to} onClick={() => setOpenSearch(false)} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 dark:hover:bg-slate-800/50 text-sm text-app group">
                    <span>{q.label}</span>
                    <ChevronDown size={14} className="-rotate-90 text-slate-400 dark:text-slate-500 group-hover:text-primary-500" />
                  </Link>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;

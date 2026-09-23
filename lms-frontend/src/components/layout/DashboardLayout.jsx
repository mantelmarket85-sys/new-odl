import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { motion, AnimatePresence } from "framer-motion";

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("aust_sidebar_collapsed") === "true";
  });
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem("aust_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex bg-mesh">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-1 px-4 lg:px-8 py-6 max-w-[1700px] w-full mx-auto"
          >
            <Outlet />
          </motion.main>
        </AnimatePresence>
        <footer className="px-4 lg:px-8 py-4 text-center text-xs text-muted-app border-t border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/60 backdrop-blur">
          © 2025 Abbottabad University of Science & Technology · ODL Wing · All rights reserved.
        </footer>
      </div>
    </div>
  );
};

export default DashboardLayout;

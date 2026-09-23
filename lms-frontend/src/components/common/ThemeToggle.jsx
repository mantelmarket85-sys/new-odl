import { Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "../../context/ThemeContext";

const ThemeToggle = ({ size = "md", className = "" }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const sizes = {
    sm: "w-12 h-6",
    md: "w-14 h-7",
    lg: "w-16 h-8",
  };
  const knob = {
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-7 h-7",
  };
  return (
    <button
      onClick={toggleTheme}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className={`relative ${sizes[size]} rounded-full p-0.5 transition-colors duration-300 ${
        isDark
          ? "bg-gradient-to-r from-indigo-900 to-slate-900 border border-slate-700"
          : "bg-gradient-to-r from-blue-100 to-sky-100 border border-blue-200"
      } ${className}`}
    >
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 700, damping: 30 }}
        className={`${knob[size]} rounded-full shadow-lg flex items-center justify-center ${
          isDark
            ? "bg-gradient-to-br from-slate-700 to-slate-900 ml-auto"
            : "bg-gradient-to-br from-yellow-300 to-amber-500 mr-auto"
        }`}
      >
        {isDark ? <Moon size={12} className="text-blue-200" /> : <Sun size={12} className="text-white" />}
      </motion.div>
    </button>
  );
};

export default ThemeToggle;

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft, KeySquare, CheckCircle2 } from "lucide-react";
import Logo from "../../components/common/Logo";
import ThemeToggle from "../../components/common/ThemeToggle";
import { useToast } from "../../context/ToastContext";

const ResetPassword = () => {
  const [show, setShow] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  const strength =
    pw.length >= 12 ? 4 :
    pw.length >= 8 ? 3 :
    pw.length >= 5 ? 2 :
    pw.length > 0 ? 1 : 0;

  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["bg-slate-200 dark:bg-slate-700", "bg-rose-500", "bg-amber-500", "bg-blue-500", "bg-emerald-500"];

  const submit = (e) => {
    e.preventDefault();
    if (pw !== confirm) { toast("Passwords don't match", { type: "error" }); return; }
    toast("Password reset successful! Please sign in.", { type: "success" });
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-app">
      <div className="absolute top-5 right-5 z-50"><ThemeToggle /></div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md card-base p-8 shadow-2xl">
        <Logo size="md" />
        <div className="mt-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/30 flex items-center justify-center">
            <KeySquare size={28} className="text-white" />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-app mt-4">Set New Password</h1>
          <p className="text-muted-app mt-1 text-sm">Choose a strong password to secure your AUST ODL account.</p>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">New Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input value={pw} onChange={(e) => setPw(e.target.value)} type={show ? "text" : "password"} className="input-base pl-10 pr-10" placeholder="••••••••" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {pw && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= strength ? strengthColors[strength] : "bg-slate-200 dark:bg-slate-800"}`} />
                  ))}
                </div>
                <p className="text-xs mt-1 text-muted-app">Strength: <span className="font-bold text-app">{strengthLabels[strength]}</span></p>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Confirm Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type={show ? "text" : "password"} className="input-base pl-10" placeholder="••••••••" />
            </div>
            {confirm && (
              <p className={`text-xs mt-1.5 flex items-center gap-1 ${pw === confirm ? "text-emerald-600" : "text-rose-600"}`}>
                <CheckCircle2 size={12} /> {pw === confirm ? "Passwords match" : "Passwords don't match"}
              </p>
            )}
          </div>
          <button className="w-full btn-primary flex items-center justify-center gap-2 py-3">
            Reset Password <ArrowRight size={16} />
          </button>
        </form>
        <Link to="/login" className="flex items-center justify-center gap-2 text-sm text-primary-600 dark:text-primary-400 font-semibold mt-6 hover:underline">
          <ArrowLeft size={14} /> Back to Login
        </Link>
      </motion.div>
    </div>
  );
};

export default ResetPassword;

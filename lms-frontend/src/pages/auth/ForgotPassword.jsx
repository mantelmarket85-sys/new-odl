import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, ArrowRight, ArrowLeft, KeyRound } from "lucide-react";
import Logo from "../../components/common/Logo";
import ThemeToggle from "../../components/common/ThemeToggle";
import { useToast } from "../../context/ToastContext";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const submit = (e) => {
    e.preventDefault();
    toast("Verification code sent to your email", { type: "success" });
    navigate("/verify-otp");
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-app">
      <div className="absolute top-5 right-5 z-50"><ThemeToggle /></div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md card-base p-8 shadow-2xl">
        <Logo size="md" />
        <div className="mt-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 flex items-center justify-center">
            <KeyRound size={28} className="text-white" />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-app mt-4">Forgot Password?</h1>
          <p className="text-muted-app mt-1 text-sm">Enter your AUST email and we'll send you a verification code.</p>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input className="input-base pl-10" type="email" placeholder="you@aust.edu.pk" required />
            </div>
          </div>
          <button className="w-full btn-primary flex items-center justify-center gap-2 py-3">
            Send Verification Code <ArrowRight size={16} />
          </button>
        </form>
        <Link to="/login" className="flex items-center justify-center gap-2 text-sm text-primary-600 dark:text-primary-400 font-semibold mt-6 hover:underline">
          <ArrowLeft size={14} /> Back to Login
        </Link>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;

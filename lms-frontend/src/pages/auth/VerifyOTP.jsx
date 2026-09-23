import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, ShieldCheck, RefreshCw } from "lucide-react";
import Logo from "../../components/common/Logo";
import ThemeToggle from "../../components/common/ThemeToggle";
import { useToast } from "../../context/ToastContext";

const VerifyOTP = () => {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [countdown, setCountdown] = useState(60);
  const inputs = useRef([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    inputs.current[0]?.focus();
    const t = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const handleChange = (i, v) => {
    if (!/^\d?$/.test(v)) return;
    const newOtp = [...otp];
    newOtp[i] = v;
    setOtp(newOtp);
    if (v && i < 5) inputs.current[i + 1]?.focus();
  };

  const handleKey = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const submit = (e) => {
    e.preventDefault();
    toast("OTP verified successfully!", { type: "success" });
    navigate("/reset-password");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-app">
      <div className="absolute top-5 right-5 z-50"><ThemeToggle /></div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md card-base p-8 shadow-2xl">
        <Logo size="md" />
        <div className="mt-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30 flex items-center justify-center">
            <ShieldCheck size={28} className="text-white" />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-app mt-4">Verify Your Email</h1>
          <p className="text-muted-app mt-1 text-sm">We've sent a 6-digit code to <span className="font-bold text-app">ayesha.khan@aust.edu.pk</span></p>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="flex justify-center gap-2">
            {otp.map((d, i) => (
              <input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKey(i, e)}
                className="w-12 h-14 text-center text-xl font-bold border-2 border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-app focus:border-primary-500"
              />
            ))}
          </div>
          <button className="w-full btn-primary flex items-center justify-center gap-2 py-3">
            Verify Code <ArrowRight size={16} />
          </button>
        </form>
        <div className="mt-5 text-center text-sm text-muted-app">
          Didn't get the code?{" "}
          {countdown > 0 ? (
            <span className="font-bold text-app">Resend in {countdown}s</span>
          ) : (
            <button onClick={() => { setCountdown(60); toast("New code sent!"); }} className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 font-bold hover:underline">
              <RefreshCw size={12} /> Resend
            </button>
          )}
        </div>
        <Link to="/login" className="flex items-center justify-center gap-2 text-sm text-primary-600 dark:text-primary-400 font-semibold mt-6 hover:underline">
          <ArrowLeft size={14} /> Back to Login
        </Link>
      </motion.div>
    </div>
  );
};

export default VerifyOTP;

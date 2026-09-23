import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, User, Phone, GraduationCap, BookOpen, ShieldCheck, ArrowRight, ArrowLeft, CheckCircle2, IdCard, Sparkles } from "lucide-react";
import Logo from "../../components/common/Logo";
import ThemeToggle from "../../components/common/ThemeToggle";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

const Register = () => {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("student");
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const next = () => setStep((s) => Math.min(3, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const handleSubmit = (e) => {
    e.preventDefault();
    toast("Account created! Please verify your email.", { type: "success" });
    navigate("/verify-otp");
  };

  const roles = [
    { id: "student", label: "Student", icon: GraduationCap, desc: "Enrolled in ADCS program" },
    { id: "teacher", label: "Faculty", icon: BookOpen, desc: "Teach courses & assessments" },
    { id: "admin", label: "Course Coordinator", icon: ShieldCheck, desc: "Academic management & coordination" },
  ];

  return (
    <div className="min-h-screen flex bg-app">
      <div className="absolute top-5 right-5 z-50"><ThemeToggle /></div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <Logo size="md" />

          <div className="mt-8">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60">
              <Sparkles size={11} /> Get Started
            </span>
            <h1 className="font-display font-extrabold text-3xl text-app mt-3">Create your <span className="gradient-text">AUST ODL</span> account</h1>
            <p className="text-muted-app mt-1 text-sm">Step {step} of 3 — Join Pakistan's leading distance learning platform.</p>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-2 mt-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= step ? "bg-primary-600" : "bg-slate-200 dark:bg-slate-800"}`} />
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {step === 1 && (
              <>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-app mb-1.5">Select your role</p>
                <div className="space-y-2">
                  {roles.map((r) => {
                    const RIcon = r.icon;
                    const active = role === r.id;
                    return (
                      <button
                        key={r.id} type="button" onClick={() => setRole(r.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                          active ? "border-primary-500 bg-primary-50 dark:bg-primary-950/30" : "border-slate-200 dark:border-slate-800 hover:border-primary-300"
                        }`}
                      >
                        <div className={`p-2.5 rounded-lg ${active ? "bg-primary-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
                          <RIcon size={20} />
                        </div>
                        <div className="flex-1">
                          <p className={`font-bold text-sm ${active ? "text-primary-700 dark:text-primary-300" : "text-app"}`}>{r.label}</p>
                          <p className="text-xs text-muted-app">{r.desc}</p>
                        </div>
                        {active && <CheckCircle2 size={18} className="text-primary-600 dark:text-primary-400" />}
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={next} className="w-full btn-primary mt-2 flex items-center justify-center gap-2">
                  Continue <ArrowRight size={16} />
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">First Name</label>
                    <input className="input-base" placeholder="Ayesha" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Last Name</label>
                    <input className="input-base" placeholder="Khan" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input className="input-base pl-10" type="email" placeholder="you@aust.edu.pk" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input className="input-base pl-10" placeholder="+92 300 1234567" />
                  </div>
                </div>
                {role === "student" && (
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Student ID (ADCS Roll No.)</label>
                    <div className="relative">
                      <IdCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input className="input-base pl-10" placeholder="ADCS-23-101" />
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={back} className="btn-secondary flex items-center gap-2"><ArrowLeft size={16} /> Back</button>
                  <button type="button" onClick={next} className="flex-1 btn-primary flex items-center justify-center gap-2">Continue <ArrowRight size={16} /></button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input className="input-base pl-10" type="password" placeholder="••••••••" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-app block mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input className="input-base pl-10" type="password" placeholder="••••••••" />
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm text-app">
                  <input type="checkbox" className="mt-0.5 rounded text-primary-600" />
                  I agree to AUST ODL's Terms of Service and Privacy Policy
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={back} className="btn-secondary flex items-center gap-2"><ArrowLeft size={16} /> Back</button>
                  <button type="submit" className="flex-1 btn-primary flex items-center justify-center gap-2">Create Account <CheckCircle2 size={16} /></button>
                </div>
              </>
            )}
          </form>

          <p className="text-center text-sm text-muted-app mt-6">
            Already have an account? <Link to="/login" className="text-primary-600 dark:text-primary-400 font-bold hover:underline">Sign in</Link>
          </p>
        </motion.div>
      </div>

      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-indigo-900 via-blue-900 to-cyan-900">
        <div className="absolute inset-0 bg-mesh opacity-50" />
        <div className="absolute top-20 right-20 w-72 h-72 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl" />
        <div className="relative z-10 flex flex-col justify-center p-12 text-white max-w-xl">
          <h2 className="font-display font-extrabold text-5xl leading-tight">Begin your journey at <span className="gradient-text-dark">AUST</span></h2>
          <p className="text-white/85 mt-3 text-lg">Join the Associate Degree in Computer Science program — 100% online, BigBlueButton-powered live classes, AI learning insights.</p>
        </div>
      </div>
    </div>
  );
};

export default Register;

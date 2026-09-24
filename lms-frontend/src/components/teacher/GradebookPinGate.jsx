import { useEffect, useState } from "react";
import { Lock, Loader2, ShieldCheck } from "lucide-react";
import api from "../../services/api";
import { useToast } from "../../context/ToastContext";

const GB_KEY = "lmsGradebookToken";

export function getGradebookToken() {
  try { return sessionStorage.getItem(GB_KEY); } catch { return null; }
}

export function setGradebookToken(token) {
  try {
    if (token) sessionStorage.setItem(GB_KEY, token);
    else sessionStorage.removeItem(GB_KEY);
  } catch { /* ignore */ }
}

export default function GradebookPinGate({ children }) {
  const { toast } = useToast();
  const [ready, setReady] = useState(!!getGradebookToken());
  const [status, setStatus] = useState(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.teacher.pinStatus();
        if (!cancelled) setStatus(s);
      } catch (e) {
        if (!cancelled) toast(e.message || "Could not load Gradebook PIN status", { type: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const submit = async () => {
    if (!/^\d{5}$/.test(pin)) { toast("PIN must be exactly 5 digits", { type: "error" }); return; }
    setBusy(true);
    try {
      if (!status?.set) {
        if (pin !== confirmPin) { toast("PIN confirmation does not match", { type: "error" }); setBusy(false); return; }
        await api.teacher.setPin({ pin, confirmPin });
        setStatus({ set: true });
      }
      const res = await api.teacher.verifyPin(pin);
      setGradebookToken(res.token);
      setReady(true);
      setPin("");
      setConfirmPin("");
    } catch (e) {
      toast(e.message || "PIN verification failed", { type: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (ready) return children;
  if (!status) {
    return (
      <div className="card-base p-8 flex items-center justify-center gap-2 text-muted-app">
        <Loader2 size={16} className="animate-spin" /> Loading Gradebook PIN…
      </div>
    );
  }

  return (
    <div className="card-base p-6 max-w-md mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Lock size={18} className="text-primary-600" />
        <h3 className="font-bold text-app">{status.set ? "Enter Gradebook PIN" : "Set a 5-digit Gradebook PIN"}</h3>
      </div>
      <p className="text-xs text-muted-app">
        Marks, Gradebook and Result Review stay locked until you verify your PIN. The PIN is hashed on the server and required again to submit results to the Exam Controller.
      </p>
      <input
        type="password"
        inputMode="numeric"
        maxLength={5}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 5))}
        placeholder="•••••"
        className="input-base w-full tracking-[0.4em] text-center text-lg"
      />
      {!status.set && (
        <input
          type="password"
          inputMode="numeric"
          maxLength={5}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 5))}
          placeholder="Confirm PIN"
          className="input-base w-full tracking-[0.4em] text-center text-lg"
        />
      )}
      <button onClick={submit} disabled={busy} className="btn-primary w-full text-sm">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
        {status.set ? "Unlock Gradebook" : "Save PIN & Unlock"}
      </button>
    </div>
  );
}

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Users, RefreshCw, Save, CheckCircle2,
} from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import api from "../../services/api";
import useApi from "../../hooks/useApi";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { useToast } from "../../context/ToastContext";
import DeptSmartFilter, { ALL_DEPTS, filterByDept, collectDepartments } from "../../components/common/DeptSmartFilter";

const ATT_STATUS = ["PRESENT", "ABSENT", "LATE", "UFM", "EXEMPT"];

const Seating = () => {
  const { toast } = useToast();

  const { data: schedData } = useApi(() => api.exam.schedules(), []);
  const exams = useMemo(() => schedData?.schedules || [], [schedData]);

  /* ---- Attendance ---- */
  const [attExam, setAttExam] = useState("");
  const [att, setAtt] = useState(null);       // { exam, counts, records, total }
  const [attLoading, setAttLoading] = useState(false);
  const [attErr, setAttErr] = useState("");
  const [attBusy, setAttBusy] = useState(false);

  /* ----------------------- ATTENDANCE ----------------------- */
  const [dept, setDept] = useState(ALL_DEPTS);
  const departments = useMemo(
    () => collectDepartments({ options: schedData?.departments || [], rows: exams }),
    [schedData, exams],
  );
  const examsWithOffering = useMemo(
    () => filterByDept(exams, dept).filter((e) => e.offering || e.offeringId),
    [exams, dept],
  );

  const loadAttendance = useCallback(async (examId) => {
    if (!examId) { setAtt(null); return; }
    setAttLoading(true); setAttErr("");
    try {
      const res = await api.exam.attendance(examId);
      setAtt(res);
    } catch (e) { setAttErr(e?.message || "Failed to load attendance"); setAtt(null); }
    finally { setAttLoading(false); }
  }, []);

  useEffect(() => { if (attExam) loadAttendance(attExam); }, [attExam, loadAttendance]);

  const bootstrapAtt = async () => {
    if (!attExam) return;
    setAttBusy(true);
    try {
      const res = await api.exam.bootstrapAttendance(attExam);
      toast?.(`Roster ready: ${res.created} new of ${res.total} student(s)`, { type: "success" });
      await loadAttendance(attExam);
    } catch (e) { toast?.(e?.message || "Failed", { type: "error" }); } finally { setAttBusy(false); }
  };

  const setRecStatus = (studentId, status) => {
    setAtt((prev) => prev ? { ...prev, records: prev.records.map((r) => r.studentId === studentId ? { ...r, status } : r) } : prev);
  };
  const setRecRemark = (studentId, remarks) => {
    setAtt((prev) => prev ? { ...prev, records: prev.records.map((r) => r.studentId === studentId ? { ...r, remarks } : r) } : prev);
  };

  const saveAttendance = async () => {
    if (!attExam || !att?.records?.length) return;
    setAttBusy(true);
    try {
      const records = att.records.map((r) => ({ studentId: r.studentId, status: r.status, remarks: r.remarks || undefined, room: r.room || undefined, seatNo: r.seatNo || undefined }));
      const res = await api.exam.saveAttendance(attExam, { records });
      toast?.(`Verified ${res.updated} attendance record(s)`, { type: "success" });
      await loadAttendance(attExam);
    } catch (e) { toast?.(e?.message || "Failed", { type: "error" }); } finally { setAttBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Verify exam-day student attendance in real time." icon="ClipboardCheck" breadcrumb={["Exam Controller", "Attendance"]} />

      <div className="space-y-4">
        <div className="card-base p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs text-muted-app">Filter exams by department, then pick one to verify attendance.</p>
            <DeptSmartFilter value={dept} onChange={(v) => { setDept(v); setAttExam(""); }} departments={departments} />
          </div>
          <div className="grid md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="text-[10px] uppercase font-bold text-muted-app mb-1 block">Select Exam</label>
              <select value={attExam} onChange={(e) => setAttExam(e.target.value)} className="input-base w-full text-sm">
                <option value="">— Choose an exam (with linked course) —</option>
                {examsWithOffering.map((e) => <option key={e.id} value={e.id}>{(e.offering || e.title)}{e.department ? ` · ${e.department}` : ""} · {e.date}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => loadAttendance(attExam)} disabled={!attExam || attLoading} className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2 disabled:opacity-50"><RefreshCw size={14} className={attLoading ? "animate-spin" : ""} /> Reload</button>
              <button onClick={bootstrapAtt} disabled={!attExam || attBusy} className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-2 disabled:opacity-50" title="Create roster from enrolled students"><Users size={14} /> Build Roster</button>
            </div>
          </div>
        </div>

        {!attExam ? (
          <EmptyState message="Select an exam to verify student attendance. Only exams linked to a course offering can have a roster." />
        ) : attErr ? (
          <ErrorState message={attErr} onRetry={() => loadAttendance(attExam)} />
        ) : attLoading ? (
          <Skeleton className="h-96" />
        ) : !att || att.records.length === 0 ? (
          <EmptyState message="No attendance roster yet. Click “Build Roster” to generate it from enrolled students." />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {ATT_STATUS.map((st) => (
                <div key={st} className="card-base p-3 text-center">
                  <p className="text-lg font-bold text-app">{att.counts?.[st] || 0}</p>
                  <p className="text-[10px] uppercase text-muted-app">{st}</p>
                </div>
              ))}
            </div>
            <div className="card-base p-3 flex items-center justify-between">
              <span className="text-xs text-muted-app">{att.total} student(s) on roster</span>
              <button onClick={saveAttendance} disabled={attBusy} className="btn-primary text-sm py-2 px-4 inline-flex items-center gap-2 disabled:opacity-50"><Save size={14} /> {attBusy ? "Saving…" : "Save & Verify Attendance"}</button>
            </div>
            <div className="card-base overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="surface border-b border-app">
                    <tr>
                      {["Roll", "Student", "Status", "Remarks", "Verified"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-app">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {att.records.map((r) => (
                      <tr key={r.studentId} className="hover:surface">
                        <td className="px-3 py-1.5 font-mono text-app">{r.roll}</td>
                        <td className="px-3 py-1.5 font-semibold text-app">{r.student}</td>
                        <td className="px-3 py-1.5">
                          <select value={r.status} onChange={(e) => setRecStatus(r.studentId, e.target.value)} className="input-base text-xs py-1 px-2 w-28">
                            {ATT_STATUS.map((st) => <option key={st} value={st}>{st}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <input value={r.remarks || ""} onChange={(e) => setRecRemark(r.studentId, e.target.value)} placeholder="—" className="input-base text-xs py-1 px-2 w-40" />
                        </td>
                        <td className="px-3 py-1.5 text-muted-app">
                          {r.verifiedAt ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={12} /> {new Date(r.verifiedAt).toLocaleDateString()}</span> : <span className="text-[10px]">unverified</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Seating;

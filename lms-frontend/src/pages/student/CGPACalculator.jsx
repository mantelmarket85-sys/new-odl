import { motion } from "framer-motion";
import { useMemo, useState, useEffect } from "react";
import { Calculator, TrendingUp, GraduationCap, History, Sigma, Info, RotateCcw } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import api from "../../services/api";

// Standard 4.0 grade-point mapping (HEC scheme).
const GRADE_POINTS = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, F: 0.0,
};
const GRADE_OPTIONS = Object.keys(GRADE_POINTS);

// Convert a percentage mark → grade point + letter (HEC-style cutoffs).
const marksToGrade = (pct) => {
  const p = Number(pct);
  if (Number.isNaN(p)) return { gp: null, letter: "" };
  if (p >= 85) return { gp: 4.0, letter: "A" };
  if (p >= 80) return { gp: 3.7, letter: "A-" };
  if (p >= 75) return { gp: 3.3, letter: "B+" };
  if (p >= 71) return { gp: 3.0, letter: "B" };
  if (p >= 68) return { gp: 2.7, letter: "B-" };
  if (p >= 64) return { gp: 2.3, letter: "C+" };
  if (p >= 61) return { gp: 2.0, letter: "C" };
  if (p >= 58) return { gp: 1.7, letter: "C-" };
  if (p >= 54) return { gp: 1.3, letter: "D+" };
  if (p >= 50) return { gp: 1.0, letter: "D" };
  return { gp: 0.0, letter: "F" };
};

const CGPACalculator = () => {
  const [transcript, setTranscript] = useState(null);
  const [coursesData, setCoursesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Per-course input: { offeringId: { mode: 'grade'|'marks', grade, marks } }
  const [inputs, setInputs] = useState({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, c] = await Promise.all([api.student.transcript(), api.student.courses()]);
      setTranscript(t);
      setCoursesData(c);
    } catch (e) {
      setError(e.message || "Failed to load CGPA data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Enrolled courses → auto-loaded rows (Name, Code, Credit Hours).
  const enrolled = useMemo(() => {
    const list = coursesData?.courses || [];
    return list.map((c) => ({
      offeringId: c.offeringId,
      code: c.offering?.course?.code,
      title: c.offering?.course?.title,
      creditHours: Number(c.offering?.course?.creditHours) || 0,
    })).filter((c) => c.code);
  }, [coursesData]);

  // Previous CGPA — from published results (transcript).
  const previous = useMemo(() => {
    const cgpa = transcript?.cgpa != null ? Number(transcript.cgpa) : 0;
    const credits = Number(transcript?.totalCredits) || 0;
    return { cgpa, credits, qualityPoints: cgpa * credits };
  }, [transcript]);

  const setInput = (offeringId, patch) =>
    setInputs((prev) => ({ ...prev, [offeringId]: { ...prev[offeringId], ...patch } }));

  // Map a numeric grade point (0.0 - 4.0) → nearest letter grade for display.
  const gpToLetter = (gp) => {
    const g = Number(gp);
    if (Number.isNaN(g)) return "";
    let best = "";
    let bestDiff = Infinity;
    for (const [letter, val] of Object.entries(GRADE_POINTS)) {
      const d = Math.abs(val - g);
      if (d < bestDiff) { bestDiff = d; best = letter; }
    }
    return best;
  };

  // Resolve a row's grade point from its input.
  // Primary mode is "points" — student enters a real grade-point number (0.0-4.0)
  // or selects a letter grade. Marks (%) mode is an optional convenience.
  const rowGrade = (offeringId) => {
    const inp = inputs[offeringId];
    if (!inp) return { gp: null, letter: "" };
    if (inp.mode === "marks" && inp.marks !== "" && inp.marks != null) {
      return marksToGrade(inp.marks);
    }
    // Direct grade-point number input (real number).
    if (inp.points !== "" && inp.points != null) {
      let gp = Number(inp.points);
      if (Number.isNaN(gp)) return { gp: null, letter: "" };
      gp = Math.max(0, Math.min(4, gp)); // clamp to 0.0 - 4.0
      return { gp, letter: gpToLetter(gp) };
    }
    if (inp.grade) return { gp: GRADE_POINTS[inp.grade], letter: inp.grade };
    return { gp: null, letter: "" };
  };

  // Current GPA — from the courses the student has entered grades/marks for.
  const current = useMemo(() => {
    let qp = 0;
    let credits = 0;
    let counted = 0;
    for (const c of enrolled) {
      const { gp } = rowGrade(c.offeringId);
      if (gp != null && c.creditHours > 0) {
        qp += gp * c.creditHours;
        credits += c.creditHours;
        counted++;
      }
    }
    const gpa = credits > 0 ? qp / credits : 0;
    return { gpa, credits, qualityPoints: qp, counted };
  }, [enrolled, inputs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Final CGPA — combine previous quality points with current.
  const final = useMemo(() => {
    const totalQp = previous.qualityPoints + current.qualityPoints;
    const totalCredits = previous.credits + current.credits;
    const cgpa = totalCredits > 0 ? totalQp / totalCredits : 0;
    return { cgpa, totalCredits };
  }, [previous, current]);

  const resetInputs = () => setInputs({});

  if (loading) {
    return (
      <div>
        <PageHeader title="CGPA Calculator" subtitle="Calculate your semester GPA and projected CGPA" icon="Calculator" breadcrumb={["Dashboard", "CGPA Calculator"]} />
        <div className="grid lg:grid-cols-3 gap-4"><Skeleton className="lg:col-span-2 h-96 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="CGPA Calculator" subtitle="Auto-loaded from your enrolled courses — enter grade points to calculate" icon="Calculator" breadcrumb={["Dashboard", "CGPA Calculator"]} />

      {/* Prominent disclaimer note */}
      <div className="mb-5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-2xl px-5 py-3.5 flex items-center gap-3">
        <Info size={18} className="shrink-0 text-amber-600" />
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">This is only for information purpose.</p>
      </div>

      {error ? (
        <ErrorState description={error} onRetry={load} />
      ) : (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* ---- Left: enrolled course grade entry ---- */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2"><GraduationCap size={18} className="text-primary-600" /> Current Semester Courses</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Enter the grade point (real number 0.00 – 4.00) for each course. You can also pick a letter grade or enter marks.</p>
                </div>
                <button onClick={resetInputs} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"><RotateCcw size={13} /> Reset</button>
              </div>

              {enrolled.length === 0 ? (
                <div className="px-5 py-8"><EmptyState icon="GraduationCap" title="No enrolled courses" description="Your enrolled courses will appear here automatically." /></div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {enrolled.map((c) => {
                    const inp = inputs[c.offeringId] || { mode: "points" };
                    const { gp, letter } = rowGrade(c.offeringId);
                    return (
                      <div key={c.offeringId} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-mono font-bold text-primary-600">{c.code}</span>
                          <p className="font-semibold text-slate-900 dark:text-slate-100 leading-tight truncate">{c.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{c.creditHours} Credit Hour{c.creditHours !== 1 ? "s" : ""}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Mode toggle — Points (grade-point real number) is primary */}
                          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 text-[11px] font-semibold">
                            <button onClick={() => setInput(c.offeringId, { mode: "points" })} className={`px-2.5 py-2 ${inp.mode === "points" || inp.mode == null ? "bg-primary-600 text-white" : "text-slate-500"}`}>Points</button>
                            <button onClick={() => setInput(c.offeringId, { mode: "grade" })} className={`px-2.5 py-2 ${inp.mode === "grade" ? "bg-primary-600 text-white" : "text-slate-500"}`}>Grade</button>
                            <button onClick={() => setInput(c.offeringId, { mode: "marks" })} className={`px-2.5 py-2 ${inp.mode === "marks" ? "bg-primary-600 text-white" : "text-slate-500"}`}>Marks</button>
                          </div>
                          {inp.mode === "marks" ? (
                            <input type="number" min="0" max="100" value={inp.marks ?? ""} onChange={(e) => setInput(c.offeringId, { marks: e.target.value })} placeholder="%" className="w-24 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900" />
                          ) : inp.mode === "grade" ? (
                            <select value={inp.grade || ""} onChange={(e) => setInput(c.offeringId, { grade: e.target.value })} className="w-28 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900">
                              <option value="">Select</option>
                              {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g} ({GRADE_POINTS[g].toFixed(1)})</option>)}
                            </select>
                          ) : (
                            <input type="number" step="0.01" min="0" max="4" value={inp.points ?? ""} onChange={(e) => setInput(c.offeringId, { points: e.target.value })} placeholder="0.00 – 4.00" className="w-28 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-slate-900" />
                          )}
                          <div className="w-16 text-center">
                            {gp != null ? (
                              <>
                                <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">{letter}</p>
                                <p className="text-[10px] text-slate-400">{gp.toFixed(2)}</p>
                              </>
                            ) : <p className="text-xs text-slate-300">—</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Previous (completed) courses reference */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><History size={16} className="text-slate-500" /> Previously Completed Courses</h3>
              </div>
              {(transcript?.rows || []).length === 0 ? (
                <div className="px-5 py-6"><EmptyState icon="GraduationCap" title="No published results yet" description="Your previously graded courses contribute to your Previous CGPA." /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 dark:bg-slate-900 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                      <th className="px-4 py-2.5">Code</th><th className="px-4 py-2.5">Course</th><th className="px-4 py-2.5 text-center">CH</th><th className="px-4 py-2.5 text-center">Grade</th><th className="px-4 py-2.5 text-center">GP</th>
                    </tr></thead>
                    <tbody>
                      {transcript.rows.map((r) => (
                        <tr key={r.resultId} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-4 py-2.5 font-mono font-bold text-primary-700">{r.courseCode}</td>
                          <td className="px-4 py-2.5">{r.courseTitle}</td>
                          <td className="px-4 py-2.5 text-center">{r.creditHours}</td>
                          <td className="px-4 py-2.5 text-center font-bold">{r.letterGrade}</td>
                          <td className="px-4 py-2.5 text-center">{r.gradePoints != null ? Number(r.gradePoints).toFixed(2) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ---- Right: results panel ---- */}
          <div className="space-y-4">
            {/* Final CGPA hero */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-primary-600 to-blue-500 rounded-2xl p-6 text-white relative overflow-hidden">
              <div className="absolute -right-6 -top-6 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
              <Sigma size={26} className="mb-2" />
              <p className="text-sm opacity-90">Final CGPA</p>
              <p className="font-display text-5xl font-extrabold my-2">{final.cgpa.toFixed(2)}</p>
              <p className="text-xs opacity-90">Based on {final.totalCredits} total credit hours</p>
            </motion.div>

            {/* Previous / Current breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1"><History size={14} /><p className="text-xs font-semibold">Previous CGPA</p></div>
                <p className="font-display text-3xl font-extrabold text-slate-900 dark:text-slate-100">{previous.cgpa.toFixed(2)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{previous.credits} credits earned</p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
                <div className="flex items-center gap-1.5 text-emerald-600 mb-1"><TrendingUp size={14} /><p className="text-xs font-semibold">Current GPA</p></div>
                <p className="font-display text-3xl font-extrabold text-slate-900 dark:text-slate-100">{current.gpa.toFixed(2)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{current.counted} of {enrolled.length} graded</p>
              </div>
            </div>

            {/* Change indicator */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Change from Previous</span>
                <span className={`font-bold ${final.cgpa - previous.cgpa >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {(final.cgpa - previous.cgpa >= 0 ? "+" : "")}{(final.cgpa - previous.cgpa).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Info note */}
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-2xl p-4 text-xs text-blue-800 dark:text-blue-300 flex gap-2">
              <Info size={15} className="shrink-0 mt-0.5" />
              <p>Previous CGPA is loaded from your official published results. Current GPA is computed from the grades you enter for this semester. Final CGPA combines both weighted by credit hours.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CGPACalculator;

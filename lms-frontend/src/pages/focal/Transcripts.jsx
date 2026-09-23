import { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import ExportButtons from "../../components/enterprise/ExportButtons";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import { FileText, BookOpen, Search, Loader2, AlertTriangle } from "lucide-react";

const RISK_COLOR = { LOW: "emerald", MEDIUM: "amber", HIGH: "rose", CRITICAL: "rose" };

const Transcripts = () => {
  const { data, loading, error, reload } = useApi(() => api.focal.students("?pageSize=200"), []);
  const studentList = data?.items || [];

  const [selectedId, setSelectedId] = useState("");
  const [t, setT] = useState(null);
  const [loadingT, setLoadingT] = useState(false);

  useEffect(() => {
    if (studentList.length && !selectedId) setSelectedId(studentList[0].id);
  }, [studentList, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setLoadingT(true);
    api.focal.student(selectedId)
      .then((r) => { if (active) setT(r.student); })
      .catch(() => { if (active) setT(null); })
      .finally(() => { if (active) setLoadingT(false); });
    return () => { active = false; };
  }, [selectedId]);

  const cgpa = t?.gpa ?? 0;
  const totalCredits = (t?.results || []).reduce((s, r) => s + (r.creditHours || 0), 0);

  return (
    <div>
      <PageHeader
        title="Transcripts & History"
        subtitle="Full academic record: published results, GPA, and risk classification."
        icon="FileText"
        breadcrumb={["Focal Person", "Transcripts"]}
      />

      {error ? (
        <ErrorState title="Couldn't load students" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="card-base p-4 mb-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-1">Select Student</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="input-base pl-9 py-2.5 text-sm">
                    {studentList.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.roll}</option>)}
                  </select>
                </div>
              </div>
              {t && (t.results || []).length > 0 && (
                <ExportButtons
                  title={`Transcript — ${t.name}`}
                  columns={[
                    { key: "code", label: "Code" },
                    { key: "title", label: "Course" },
                    { key: "creditHours", label: "Credits" },
                    { key: "percent", label: "%" },
                    { key: "grade", label: "Grade" },
                    { key: "gradePoints", label: "GP" },
                  ]}
                  rows={t.results}
                  filename={`transcript_${t.roll}`}
                />
              )}
            </div>
          </div>

          {loadingT ? (
            <div className="card-base p-12 flex items-center justify-center"><Loader2 className="animate-spin text-primary-600" /></div>
          ) : !t ? (
            <div className="card-base p-12 text-center">
              <FileText size={48} className="mx-auto text-slate-300 dark:text-slate-700" />
              <p className="text-muted-app mt-3">No transcript data for this student.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="card-base p-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app">Student</p>
                  <p className="font-bold text-app">{t.name}</p>
                  <p className="text-xs text-muted-app font-mono">{t.roll}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app">CGPA</p>
                  <p className="font-display font-extrabold text-3xl text-primary-600 dark:text-primary-400">{cgpa.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app">Credits Earned</p>
                  <p className="font-bold text-app text-lg">{totalCredits}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-app">Risk</p>
                  <span className={`inline-block text-[10px] font-bold uppercase px-2 py-1 rounded-full mt-1 bg-${RISK_COLOR[t.risk] || "slate"}-100 text-${RISK_COLOR[t.risk] || "slate"}-700 dark:bg-${RISK_COLOR[t.risk] || "slate"}-950/40 dark:text-${RISK_COLOR[t.risk] || "slate"}-300`}>{t.risk}</span>
                  {t.failing > 0 && <p className="text-[10px] text-rose-500 mt-1 inline-flex items-center gap-1"><AlertTriangle size={10} /> {t.failing} failing</p>}
                </div>
              </div>

              <div>
                <h3 className="font-display font-bold text-lg text-app flex items-center gap-2 mb-3">
                  <BookOpen size={18} className="text-primary-600 dark:text-primary-400" /> Published Results
                </h3>
                {(t.results || []).length === 0 ? (
                  <div className="card-base p-8 text-center text-muted-app text-sm">No published results yet.</div>
                ) : (
                  <EnterpriseTable
                    searchable={false}
                    columns={[
                      { key: "code", label: "Code", render: (v) => <span className="font-mono text-xs">{v}</span> },
                      { key: "title", label: "Course" },
                      { key: "creditHours", label: "Credits" },
                      { key: "percent", label: "%", render: (v) => <span className="font-mono">{v}%</span> },
                      { key: "grade", label: "Grade", render: (v) => <b>{v}</b> },
                      { key: "gradePoints", label: "GP", render: (v) => <span className="font-mono">{v}</span> },
                    ]}
                    rows={t.results}
                    pageSize={10}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Transcripts;

import { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { formatCredits } from "../../utils/credit";
import { GraduationCap, BookOpen, CheckCircle2, Eye, Info } from "lucide-react";

const SchemeOfStudy = () => {
  const { data, loading, error, reload } = useApi(() => api.focal.scheme(), []);
  const programs = data?.programs || [];
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (programs.length && selectedId == null) setSelectedId(programs[0].id);
  }, [programs, selectedId]);

  const program = programs.find((p) => p.id === selectedId) || programs[0];
  const total = program?.totalCredits ?? 0;

  return (
    <div>
      <PageHeader
        title="Scheme of Study — View Only"
        subtitle="Approved schemes published by the Course Coordinator. Focal Person has read-only access."
        icon="GraduationCap"
        breadcrumb={["Focal Person", "Scheme of Study"]}
      />

      <div className="mb-4 p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60">
        <div className="flex items-start gap-3">
          <Info size={20} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-blue-900 dark:text-blue-200 text-sm flex items-center gap-2">
              <Eye size={14} /> Read-only Mode
            </p>
            <p className="text-xs text-blue-800 dark:text-blue-300 mt-1">
              Schemes of Study are owned and maintained by the <b>Course Coordinator</b>. As Focal Person, you can review approved schemes for advising,
              promotion and retake decisions, but cannot edit them. Request changes via Quick Messages.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState title="Couldn't load scheme" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : programs.length === 0 ? (
        <EmptyState icon="GraduationCap" title="No programs" description="No approved program schemes available." />
      ) : (
        <>
          <div className="card-base p-4 mb-4">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-app block mb-2">Select Program</label>
            <div className="flex flex-wrap gap-2">
              {programs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`text-xs font-bold px-3 py-2 rounded-xl border ${
                    program?.id === p.id
                      ? "bg-primary-600 text-white border-primary-600"
                      : "border-app text-app hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {p.code || p.shortForm}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-app mt-3">{program?.name}</p>
          </div>

          <div className="mb-4 p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={22} className="text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1">
                <p className="font-bold text-emerald-900 dark:text-emerald-200">
                  Total Credit Hours: {total} · {program?.totalCourses} courses · {program?.totalSemesters} semesters
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Approved scheme — published by Course Coordinator.</p>
              </div>
              <span className="text-2xl font-bold text-emerald-600">{total}</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {(program?.semesters || []).map((sem) => {
              const semTotal = sem.credits ?? (sem.courses || []).reduce((t, c) => t + (Number(c.creditHours) || 0), 0);
              return (
                <div key={sem.number} className="card-base p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg text-app flex items-center gap-2">
                        <GraduationCap size={18} className="text-primary-600 dark:text-primary-400" />
                        {sem.title}
                      </h3>
                      <p className="text-xs text-muted-app">{(sem.courses || []).length} courses · {semTotal} credits</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Locked</span>
                  </div>
                  <div className="space-y-2">
                    {(sem.courses || []).map((c, cIdx) => (
                      <div key={cIdx} className="grid grid-cols-12 gap-2 items-center p-2.5 rounded-xl surface border border-app">
                        <div className="col-span-3">
                          <span className="font-mono text-xs font-bold text-primary-700 dark:text-primary-400">{c.code}</span>
                        </div>
                        <div className="col-span-7">
                          <div className="flex items-center gap-1.5">
                            <BookOpen size={11} className="text-muted-app shrink-0" />
                            <span className="text-xs text-app">{c.title}</span>
                          </div>
                        </div>
                        <div className="col-span-2 text-right">
                          <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{formatCredits(c)} cr{c.hasLab ? " (T+L)" : ""}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default SchemeOfStudy;

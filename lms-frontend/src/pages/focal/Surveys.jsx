import { useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import EnterpriseTable from "../../components/enterprise/EnterpriseTable";
import ExportButtons from "../../components/enterprise/ExportButtons";
import StatCard from "../../components/common/StatCard";
import Modal from "../../components/common/Modal";
import useApi from "../../hooks/useApi";
import api from "../../services/api";
import { Skeleton } from "../../components/common/Skeleton";
import ErrorState from "../../components/common/ErrorState";
import EmptyState from "../../components/common/EmptyState";
import { Star, EyeOff, ClipboardList, MessageCircle, Loader2 } from "lucide-react";

const FocalSurveys = () => {
  const { data, loading, error, reload } = useApi(() => api.focal.surveys(), []);
  const [view, setView] = useState(null);
  const [results, setResults] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const rows = data?.surveys || [];

  const openResults = async (survey) => {
    setView(survey);
    setResults(null);
    setLoadingResults(true);
    try {
      const r = await api.focal.surveyResults(survey.id);
      setResults(r);
    } catch (e) {
      setResults({ error: e.message });
    } finally {
      setLoadingResults(false);
    }
  };

  const columns = [
    { key: "title", label: "Survey" },
    { key: "type", label: "Type", render: (v) => <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{v}</span> },
    { key: "questions", label: "Questions", render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: "responses", label: "Responses", render: (v) => <span className="font-mono text-xs">{v}</span> },
    { key: "status", label: "Status", render: (v) => (
      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
        v === "Active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
      }`}>{v}</span>
    )},
    { key: "actions", label: "Actions", sortable: false, render: (_, r) => (
      <button onClick={() => openResults(r)} className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" title="View Results">
        <MessageCircle size={13} />
      </button>
    )},
  ];

  const totalResponses = rows.reduce((t, r) => t + (r.responses || 0), 0);
  const activeCount = rows.filter((r) => r.status === "Active").length;

  return (
    <div>
      <PageHeader
        title="Surveys & QEC"
        subtitle="Monitor surveys, ratings and aggregated feedback. Student identities remain anonymous."
        icon="ClipboardList"
        breadcrumb={["Focal Person", "Surveys"]}
      />

      {error ? (
        <ErrorState title="Couldn't load surveys" description={error} onRetry={reload} />
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <div className="grid sm:grid-cols-4 gap-3 mb-4">
            <StatCard title="Total Surveys"   value={rows.length}    icon="ClipboardList" color="purple" />
            <StatCard title="Active"          value={activeCount}    icon="Power" color="emerald" delay={0.05} />
            <StatCard title="Total Responses" value={totalResponses} icon="MessageCircle" color="blue" delay={0.1} />
            <StatCard title="Question Sets"   value={rows.reduce((t, r) => t + (r.questions || 0), 0)} icon="Star" color="amber" delay={0.15} />
          </div>

          <div className="mb-4 p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/60 text-sm text-cyan-800 dark:text-cyan-200 flex items-center gap-2">
            <EyeOff size={14} /> All student feedback is <b>fully anonymous</b>. Student names and IDs are never displayed.
          </div>

          <div className="card-base p-3 mb-4 flex justify-end">
            <ExportButtons title="Surveys" columns={columns.filter((c) => c.key !== "actions")} rows={rows} filename="surveys" />
          </div>

          {rows.length === 0 ? (
            <EmptyState icon="ClipboardList" title="No surveys" description="No surveys have been created yet." />
          ) : (
            <EnterpriseTable columns={columns} rows={rows} pageSize={10} />
          )}
        </>
      )}

      <Modal open={!!view} onClose={() => { setView(null); setResults(null); }} title={view ? `Survey Results — ${view.title}` : ""} maxWidth="max-w-2xl">
        {view && (
          <div className="px-6 py-5">
            <div className="mb-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-app text-xs text-muted-app flex items-center gap-2">
              <EyeOff size={13} /> Student identities are hidden. Aggregated and anonymous.
            </div>
            {loadingResults ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="animate-spin text-primary-600" /></div>
            ) : results?.error ? (
              <p className="text-sm text-rose-600 text-center py-6">{results.error}</p>
            ) : (results?.summary || []).length === 0 ? (
              <p className="text-sm text-muted-app text-center py-6">No responses yet for this survey.</p>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {results.summary.map((q) => (
                  <div key={q.questionId} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-app">
                    <p className="text-sm font-bold text-app mb-2">{q.text}</p>
                    {q.type === "RATING" ? (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} size={12} className={i < Math.round(q.avg) ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-700"} />
                            ))}
                          </span>
                          <span className="font-bold text-app">{q.avg?.toFixed(1)}</span>
                          <span className="text-xs text-muted-app">({q.count} responses)</span>
                        </div>
                        <div className="space-y-1">
                          {(q.distribution || []).map((d) => (
                            <div key={d.rating} className="flex items-center gap-2 text-xs">
                              <span className="w-8 text-muted-app">{d.rating}★</span>
                              <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full">
                                <div className="h-full rounded-full bg-amber-400" style={{ width: `${q.count ? (d.count / q.count) * 100 : 0}%` }} />
                              </div>
                              <span className="w-6 text-right font-mono">{d.count}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-app">{q.count} text response(s) collected.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default FocalSurveys;

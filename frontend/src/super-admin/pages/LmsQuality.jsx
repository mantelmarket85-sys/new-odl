// ============================================================
//  SUPER ADMIN — QUALITY & SURVEYS GOVERNANCE  (QEC Coordinator effect)
//  ------------------------------------------------------------
//  • List surveys, open/close them (toggle isActive)
//  • View ANONYMIZED aggregated results — no student identity is
//    ever revealed (privacy-preserving, exactly as QEC sees them).
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import {
  PageHeader, Breadcrumb, Badge, useToast, ConfirmationModal, FormModal,
  Skeleton, EmptyState,
} from '../components/ui';

export const QualitySurveys = () => {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [toggleFor, setToggleFor] = useState(null); const [busy, setBusy] = useState(false);
  const [resultsFor, setResultsFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await saApi.lmsSurveys(); setRows(data.surveys || []); }
    catch { toast.push('Failed to load surveys', 'error'); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const doToggle = async () => {
    setBusy(true);
    try {
      await saApi.lmsToggleSurvey(toggleFor.id, !toggleFor.isActive);
      toast.push(`Survey ${!toggleFor.isActive ? 'opened' : 'closed'}`, 'success');
      setToggleFor(null); load();
    } catch { toast.push('Toggle failed', 'error'); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'title', header: 'Survey', exportValue: (r) => r.title },
    { key: 'questions', header: 'Questions', render: (r) => r._count?.questions ?? '—', exportValue: (r) => r._count?.questions },
    { key: 'responses', header: 'Responses', render: (r) => r._count?.responses ?? 0, exportValue: (r) => r._count?.responses },
    { key: 'isAnonymous', header: 'Anonymous', render: (r) => <Badge color={r.isAnonymous ? 'green' : 'gray'}>{r.isAnonymous ? 'Yes' : 'No'}</Badge>, exportValue: (r) => r.isAnonymous },
    { key: 'isActive', header: 'State', render: (r) => <Badge color={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'OPEN' : 'CLOSED'}</Badge>, exportValue: (r) => r.isActive ? 'OPEN' : 'CLOSED' },
    { key: '__a', header: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setResultsFor(r)}><i className="fas fa-chart-column" /> Results</button>
        <button className={`sa-btn sa-btn-sm ${r.isActive ? 'sa-btn-danger' : 'sa-btn-primary'}`} onClick={() => setToggleFor(r)}>{r.isActive ? 'Close' : 'Open'}</button>
      </div>
    ), tdStyle: { textAlign: 'right' }, exportable: false },
  ];

  return (
    <>
      <Breadcrumb items={[{ label: 'LMS Oversight' }, { label: 'Quality & Surveys' }]} />
      <PageHeader title="Quality & Surveys"
        subtitle="Open/close QEC surveys and review anonymized aggregated results — student identities are never revealed." />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="surveys" exportTitle="QEC Surveys" searchKeys={['title']} emptyText="No surveys yet." />

      <ConfirmationModal open={!!toggleFor} danger={toggleFor?.isActive}
        title={`${toggleFor?.isActive ? 'Close' : 'Open'} survey?`}
        message={`"${toggleFor?.title}" will be ${toggleFor?.isActive ? 'closed for new responses' : 'opened for responses'}.`}
        confirmLabel={toggleFor?.isActive ? 'Close survey' : 'Open survey'}
        loading={busy} onClose={() => setToggleFor(null)} onConfirm={doToggle} />

      {resultsFor && <SurveyResults survey={resultsFor} onClose={() => setResultsFor(null)} />}
    </>
  );
};

/* ----------------------------- Anonymized results ----------------------------- */
const SurveyResults = ({ survey, onClose }) => {
  const toast = useToast();
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { const res = await saApi.lmsSurveyResults(survey.id); setData(res.data); }
      catch { toast.push('Failed to load results', 'error'); }
      finally { setLoading(false); }
    })();
  }, [survey.id, toast]);

  return (
    <FormModal open size="lg" title={`Results — ${survey.title}`}
      subtitle={data ? `${data.totalResponses} responses · ${data.anonymous ? 'Anonymous' : 'Identified'}` : ''}
      submitLabel="Close" onClose={onClose} onSubmit={onClose}>
      {loading ? (
        <><Skeleton h={18} /><Skeleton h={60} style={{ marginTop: 10 }} /><Skeleton h={60} style={{ marginTop: 10 }} /></>
      ) : !data || !data.results?.length ? (
        <EmptyState text="No responses recorded yet." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {data.results.map((q, i) => (
            <div key={i} className="sa-card sa-card-pad" style={{ margin: 0 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{q.text}</div>
              <div style={{ fontSize: 12.5, color: 'var(--sa-text-soft)', marginBottom: 10 }}>
                {q.count} answers{q.average != null && <> · avg <strong>{q.average}</strong></>}
              </div>
              {Object.entries(q.answers || {}).sort((a, b) => b[1] - a[1]).map(([label, n]) => {
                const pct = q.count ? Math.round((n / q.count) * 100) : 0;
                return (
                  <div key={label} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                      <span>{label}</span><span>{n} ({pct}%)</span>
                    </div>
                    <div className="sa-bar"><div className="sa-bar-fill" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </FormModal>
  );
};

export default QualitySurveys;

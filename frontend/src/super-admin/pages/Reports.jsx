// ============================================================
//  SUPER ADMIN — REPORTS & EXPORTS
//  Summary analytics + one-click CSV exports.
// ============================================================
import React, { useEffect, useState } from 'react';
import saApi, { downloadExport } from '../saApi';
import {
  PageHeader, Breadcrumb, StatCard, SkeletonStats, Badge, useToast,
} from '../components/ui';

const EXPORTS = [
  { path: '/reports/export/users', file: 'users.csv', icon: 'fa-users', label: 'All Users', desc: 'Both systems, all roles' },
  { path: '/reports/export/applications', file: 'applications.csv', icon: 'fa-file-lines', label: 'Applications', desc: 'Admissions applications' },
  { path: '/reports/export/activity-log', file: 'activity-log.csv', icon: 'fa-clock-rotate-left', label: 'Activity Log', desc: 'Super admin actions' },
];

const Reports = () => {
  const toast = useToast();
  const [summary, setSummary] = useState(null);
  const [downloading, setDownloading] = useState('');

  useEffect(() => { (async () => {
    try { const { data } = await saApi.reportSummary(); setSummary(data); }
    catch { toast.push('Failed to load summary', 'error'); }
  })(); }, []); // eslint-disable-line

  const handleDownload = async (e) => {
    setDownloading(e.path);
    try { await downloadExport(e.path, e.file); toast.push('Export downloaded', 'success'); }
    catch { toast.push('Export failed', 'error'); } finally { setDownloading(''); }
  };

  const t = summary?.totals || {};

  return (
    <>
      <Breadcrumb items={[{ label: 'Reports' }]} />
      <PageHeader title="Reports & Exports" subtitle="System-wide analytics and downloadable data exports." />

      {summary ? (
        <div className="sa-stats-grid">
          <StatCard icon="fa-file-lines" color="blue" value={Number(t.totalApplications).toLocaleString()} label="Applications" />
          <StatCard icon="fa-user-check" color="green" value={Number(t.enrolled).toLocaleString()} label="Enrolled" />
          <StatCard icon="fa-user-graduate" color="navy" value={Number(t.totalStudents).toLocaleString()} label="Students" />
          <StatCard icon="fa-chalkboard-user" color="blue" value={Number(t.totalFaculty).toLocaleString()} label="Faculty" />
          <StatCard icon="fa-book" color="amber" value={Number(t.totalCourses).toLocaleString()} label="Courses" />
          <StatCard icon="fa-sitemap" color="navy" value={Number(t.totalDepartments).toLocaleString()} label="Departments" />
        </div>
      ) : <SkeletonStats count={6} />}

      <div className="sa-grid-2">
        <div className="sa-card">
          <div className="sa-card-head"><h3>Applications by Status</h3></div>
          <div className="sa-card-pad">
            {summary?.applicationsByStatus?.length ? summary.applicationsByStatus.map((s) => (
              <div key={s.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--sa-border)' }}>
                <span style={{ fontSize: 13.5 }}>{s.status}</span>
                <Badge color="blue">{s.count}</Badge>
              </div>
            )) : <div className="sa-empty"><i className="fas fa-chart-simple" />No data</div>}
          </div>
        </div>

        <div className="sa-card">
          <div className="sa-card-head"><h3>Data Exports</h3></div>
          <div className="sa-card-pad">
            <div className="sa-qa-grid">
              {EXPORTS.map((e) => (
                <button className="sa-qa" key={e.path} onClick={() => handleDownload(e)} disabled={downloading === e.path}>
                  <i className={`fas ${downloading === e.path ? 'fa-spinner fa-spin' : e.icon}`} />
                  <div className="t">{e.label}</div>
                  <div className="d">{e.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Reports;

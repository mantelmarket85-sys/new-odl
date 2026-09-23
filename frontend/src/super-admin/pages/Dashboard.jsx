// ============================================================
//  SUPER ADMIN — EXECUTIVE DASHBOARD
//  Summary stat cards, quick actions, pending-approvals widget,
//  recent activity feed, and distribution charts.
// ============================================================
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import saApi from '../saApi';
import { PageHeader, StatCard, SkeletonStats, Skeleton, Badge } from '../components/ui';
// Part C — live admissions overview grouped by Department → Program with filters.
import AdmissionsByDeptProgram from '../components/AdmissionsByDeptProgram';

const QUICK_ACTIONS = [
  { to: '/super-admin/users', icon: 'fa-user-plus', t: 'Manage Users', d: 'Create & manage accounts' },
  { to: '/super-admin/system/announcements', icon: 'fa-bullhorn', t: 'Announcement', d: 'Post system-wide notice' },
  { to: '/super-admin/institution/departments', icon: 'fa-sitemap', t: 'Departments', d: 'Institution structure' },
  { to: '/super-admin/academic/sessions', icon: 'fa-calendar-days', t: 'Sessions', d: 'Academic batches' },
  { to: '/super-admin/reports', icon: 'fa-chart-pie', t: 'Reports', d: 'Analytics & exports' },
  { to: '/super-admin/system/audit', icon: 'fa-clock-rotate-left', t: 'Audit Trail', d: 'Security & logins' },
];

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());
const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [charts, setCharts] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, c, a] = await Promise.all([
          saApi.dashboard(), saApi.charts(), saApi.recentActivity(8),
        ]);
        if (!alive) return;
        setData(d.data); setCharts(c.data); setActivity(a.data.activities || []);
      } catch (e) { /* handled by interceptor */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const s = data?.summary || {};
  const pa = data?.pendingApprovals || {};
  const maxDept = Math.max(1, ...(charts?.departmentDistribution || []).map((d) => d.value));

  return (
    <>
      <PageHeader
        title="Executive Dashboard"
        subtitle="System-wide overview of admissions, academics, users and LMS activity."
      />

      {loading ? <SkeletonStats count={6} /> : (
        <div className="sa-stats-grid">
          <StatCard icon="fa-user-graduate" color="blue" value={fmt(s.totalStudents)} label="Total Students (LMS)" />
          <StatCard icon="fa-chalkboard-user" color="green" value={fmt(s.totalFaculty)} label="Faculty Members" />
          <StatCard icon="fa-sitemap" color="navy" value={fmt(s.totalDepartments)} label="Departments" />
          <StatCard icon="fa-graduation-cap" color="blue" value={fmt(s.totalPrograms)} label="Active Programs" />
          <StatCard icon="fa-money-bill-trend-up" color="green" value={`${s.feeCollectionPct ?? 0}%`} label="Fee Collection" />
          <StatCard icon="fa-clipboard-list" color="amber" value={fmt(s.pendingApprovals)} label="Pending Approvals" />
        </div>
      )}

      {/* Part C — Admissions grouped by Department → Program, with live filters. */}
      <div style={{ marginBottom: 22 }}>
        <AdmissionsByDeptProgram
          onManage={(r) => navigate('/super-admin/admissions/applications')}
        />
      </div>

      {/* Quick actions */}
      <div className="sa-card" style={{ marginBottom: 22 }}>
        <div className="sa-card-head"><h3><i className="fas fa-bolt" style={{ color: 'var(--sa-blue)', marginRight: 8 }} />Quick Actions</h3></div>
        <div className="sa-card-pad">
          <div className="sa-qa-grid">
            {QUICK_ACTIONS.map((q) => (
              <Link className="sa-qa" to={q.to} key={q.to}>
                <i className={`fas ${q.icon}`} />
                <div className="t">{q.t}</div>
                <div className="d">{q.d}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="sa-grid-2">
        {/* Charts */}
        <div className="sa-card">
          <div className="sa-card-head"><h3>Department Distribution</h3></div>
          <div className="sa-card-pad">
            {loading ? <Skeleton h={180} /> : (charts?.departmentDistribution?.length ? (
              charts.departmentDistribution.slice(0, 8).map((d) => (
                <div className="sa-bar-row" key={d.name}>
                  <span className="nm" title={d.name}>{d.name}</span>
                  <span className="sa-bar-track"><span className="sa-bar-fill" style={{ width: `${(d.value / maxDept) * 100}%` }} /></span>
                  <span className="vl">{d.value}</span>
                </div>
              ))
            ) : <div className="sa-empty"><i className="fas fa-chart-column" />No data yet</div>)}
          </div>
        </div>

        {/* Pending approvals widget */}
        <div className="sa-card">
          <div className="sa-card-head"><h3>Pending Approvals</h3></div>
          <div className="sa-card-pad">
            {loading ? <Skeleton h={180} /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ApprovalRow label="Applications" value={pa.applications} icon="fa-file-lines" />
                <ApprovalRow label="Enrollments" value={pa.enrollments} icon="fa-user-plus" />
                <ApprovalRow label="Fee Verifications" value={pa.feeVerifications} icon="fa-money-check-dollar" />
                <ApprovalRow label="Marks Correction" value={pa.marksCorrection} icon="fa-pen" />
                <ApprovalRow label="Re-checking" value={pa.rechecking} icon="fa-rotate" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="sa-card" style={{ marginTop: 22 }}>
        <div className="sa-card-head">
          <h3>Recent Activity</h3>
          <Link to="/super-admin/system/audit" className="sa-btn sa-btn-ghost sa-btn-sm">View all</Link>
        </div>
        <div className="sa-card-pad">
          {loading ? <Skeleton h={120} /> : (activity?.length ? activity.map((a) => (
            <div className="sa-feed-item" key={a.id}>
              <div className="sa-feed-dot"><i className="fas fa-circle-info" /></div>
              <div className="txt">
                {a.description || `${a.action} in ${a.module}`}
                <div className="meta">{a.actorName || 'System'} · {a.module} · {timeAgo(a.createdAt)}</div>
              </div>
            </div>
          )) : <div className="sa-empty"><i className="fas fa-stream" />No recent activity</div>)}
        </div>
      </div>
    </>
  );
};

const ApprovalRow = ({ label, value, icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <div className="sa-feed-dot"><i className={`fas ${icon}`} /></div>
    <span style={{ flex: 1, fontSize: 13.5 }}>{label}</span>
    <Badge color={value > 0 ? 'amber' : 'gray'}>{value ?? 0}</Badge>
  </div>
);

export default Dashboard;

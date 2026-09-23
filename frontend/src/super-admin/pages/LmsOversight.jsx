// ============================================================
//  SUPER ADMIN — LMS OVERSIGHT PAGES (read-only views)
//  Enrollments, Courses & Offerings, Results, Fees, Exams, Quality.
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import saApi from '../saApi';
import DataTable from '../components/DataTable';
import {
  PageHeader, Breadcrumb, Badge, StatCard, SkeletonStats, useToast,
} from '../components/ui';

/* generic paginated list hook */
function usePaged(fetcher, deps = []) {
  const toast = useToast();
  const [rows, setRows] = useState([]); const [pg, setPg] = useState(null);
  const [loading, setLoading] = useState(true); const [page, setPage] = useState(1);
  const load = useCallback(async (p = page) => {
    setLoading(true);
    try { const { data } = await fetcher(p); const key = Object.keys(data).find((k) => Array.isArray(data[k])); setRows(data[key] || []); setPg(data.pagination); }
    catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); }
  }, deps); // eslint-disable-line
  useEffect(() => { load(page); }, [page]); // eslint-disable-line
  return { rows, pg, loading, page, setPage };
}

export const Enrollments = () => {
  const { rows, pg, loading, page, setPage } = usePaged((p) => saApi.lmsEnrollments({ page: p, pageSize: 25 }));
  const columns = [
    { key: 'rollNumber', header: 'Roll #', render: (r) => r.rollNumber || '—' },
    { key: 'user', header: 'Student', render: (r) => r.user?.username || r.user?.email || '—' },
    { key: 'lmsUsername', header: 'LMS Username' },
    { key: 'status', header: 'Status', render: (r) => <Badge color={r.status === 'ENROLLED' ? 'green' : 'amber'}>{r.status}</Badge> },
    { key: 'feePaid', header: 'Fee', render: (r) => <Badge color={r.feePaid ? 'green' : 'red'}>{r.feePaid ? 'Paid' : 'Unpaid'}</Badge> },
    { key: 'lmsActivated', header: 'LMS', render: (r) => <Badge color={r.lmsActivated ? 'green' : 'gray'}>{r.lmsActivated ? 'Active' : 'Pending'}</Badge> },
  ];
  return (
    <>
      <Breadcrumb items={[{ label: 'LMS Oversight' }, { label: 'Enrollments' }]} />
      <PageHeader title="Enrollments" subtitle="Admissions → LMS enrollment pipeline (read-only)." />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="enrollments" searchKeys={['rollNumber', 'lmsUsername', 'status']} pagination={pg} onPageChange={setPage} />
    </>
  );
};

export const Courses = () => {
  const { rows, pg, loading, page, setPage } = usePaged((p) => saApi.lmsCourses({ page: p, pageSize: 25 }));
  const columns = [
    { key: 'code', header: 'Code', render: (r) => <Badge color="blue">{r.code}</Badge> },
    { key: 'title', header: 'Title', render: (r) => <strong>{r.title}</strong> },
    { key: 'creditHours', header: 'Credits' },
    { key: 'program', header: 'Program', render: (r) => r.program?.name || '—' },
    { key: 'offerings', header: 'Offerings', render: (r) => r._count?.offerings ?? 0 },
    { key: 'isActive', header: 'Status', render: (r) => <Badge color={r.isActive ? 'green' : 'amber'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
  ];
  return (
    <>
      <Breadcrumb items={[{ label: 'LMS Oversight' }, { label: 'Courses' }]} />
      <PageHeader title="Courses & Offerings" subtitle="LMS course catalog (read-only)." />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="courses" searchKeys={['code', 'title']} pagination={pg} onPageChange={setPage} />
    </>
  );
};

export const Results = () => {
  const { rows, pg, loading, page, setPage } = usePaged((p) => saApi.lmsResults({ page: p, pageSize: 25 }));
  const columns = [
    { key: 'offering', header: 'Course', render: (r) => r.offering?.course?.code || `#${r.offeringId}` },
    { key: 'student', header: 'Student', render: (r) => r.student?.username || r.studentId },
    { key: 'totalPercent', header: 'Total %', render: (r) => `${Math.round(r.totalPercent)}%` },
    { key: 'letterGrade', header: 'Grade', render: (r) => r.letterGrade ? <Badge color="blue">{r.letterGrade}</Badge> : '—' },
    { key: 'gradePoints', header: 'GPA' },
    { key: 'status', header: 'Status', render: (r) => <Badge color={r.status === 'PUBLISHED' ? 'green' : 'amber'}>{r.status}</Badge> },
  ];
  return (
    <>
      <Breadcrumb items={[{ label: 'LMS Oversight' }, { label: 'Results' }]} />
      <PageHeader title="Course Results" subtitle="Gradebook results across all offerings (read-only)." />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="results" searchKeys={['letterGrade', 'status']} pagination={pg} onPageChange={setPage} />
    </>
  );
};

export const Fees = () => {
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const { rows, pg, loading, page, setPage } = usePaged((p) => saApi.lmsFeeChallans({ page: p, pageSize: 25 }));
  useEffect(() => { (async () => { try { const { data } = await saApi.lmsFeeOverview(); setOverview(data); } catch { /* */ } })(); }, []);
  const columns = [
    { key: 'challanNo', header: 'Challan #' },
    { key: 'title', header: 'Title' },
    { key: 'totalAmount', header: 'Amount', render: (r) => `Rs. ${Number(r.totalAmount).toLocaleString()}` },
    { key: 'feeType', header: 'Type' },
    { key: 'status', header: 'Status', render: (r) => <Badge color={r.status === 'PAID' ? 'green' : r.status === 'OVERDUE' ? 'red' : 'amber'}>{r.status}</Badge> },
  ];
  return (
    <>
      <Breadcrumb items={[{ label: 'LMS Oversight' }, { label: 'Fees' }]} />
      <PageHeader title="Fees" subtitle="LMS fee challans and collection overview (read-only)." />
      {overview ? (
        <div className="sa-stats-grid">
          <StatCard icon="fa-file-invoice" color="blue" value={Number(overview.totalChallans).toLocaleString()} label="Total Challans" />
          <StatCard icon="fa-coins" color="navy" value={`Rs. ${Number(overview.totalAmount).toLocaleString()}`} label="Total Billed" />
          <StatCard icon="fa-circle-check" color="green" value={Number(overview.byStatus?.PAID?.count || 0).toLocaleString()} label="Paid Challans" />
          <StatCard icon="fa-percent" color="amber" value={`${overview.collectionPct || 0}%`} label="Collection Rate" />
        </div>
      ) : <SkeletonStats count={4} />}
      <DataTable columns={columns} rows={rows} loading={loading} exportName="fee-challans" searchKeys={['challanNo', 'title', 'status']} pagination={pg} onPageChange={setPage} />
    </>
  );
};

export const Exams = () => {
  const { rows, pg, loading, page, setPage } = usePaged((p) => saApi.lmsExams({ page: p, pageSize: 25 }));
  const columns = [
    { key: 'title', header: 'Exam', render: (r) => <strong>{r.title}</strong> },
    { key: 'examType', header: 'Type', render: (r) => <Badge color="blue">{r.examType}</Badge> },
    { key: 'date', header: 'Date' },
    { key: 'startTime', header: 'Time', render: (r) => r.startTime ? `${r.startTime}–${r.endTime || ''}` : '—' },
    { key: 'room', header: 'Room' },
    { key: 'status', header: 'Status', render: (r) => <Badge color={r.status === 'PUBLISHED' || r.status === 'APPROVED' ? 'green' : 'amber'}>{r.status}</Badge> },
  ];
  return (
    <>
      <Breadcrumb items={[{ label: 'LMS Oversight' }, { label: 'Exams' }]} />
      <PageHeader title="Exams" subtitle="Examination schedules across terms (read-only)." />
      <DataTable columns={columns} rows={rows} loading={loading} exportName="exams" searchKeys={['title', 'examType', 'status']} pagination={pg} onPageChange={setPage} />
    </>
  );
};

export const Quality = () => {
  const toast = useToast();
  const [metrics, setMetrics] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => {
    try { const { data } = await saApi.lmsQuality(); setMetrics(data.metrics || []); }
    catch { toast.push('Failed to load', 'error'); } finally { setLoading(false); }
  })(); }, []); // eslint-disable-line
  const columns = [
    { key: 'metric', header: 'Metric', render: (r) => <strong>{r.metric}</strong> },
    { key: 'scope', header: 'Scope', render: (r) => <Badge color="blue">{r.scope}</Badge> },
    { key: 'value', header: 'Value' },
    { key: 'target', header: 'Target', render: (r) => r.target ?? '—' },
    { key: 'periodLabel', header: 'Period' },
  ];
  return (
    <>
      <Breadcrumb items={[{ label: 'LMS Oversight' }, { label: 'Quality (QEC)' }]} />
      <PageHeader title="Quality Metrics (QEC)" subtitle="Institutional quality and compliance metrics (read-only)." />
      <DataTable columns={columns} rows={metrics} loading={loading} exportName="quality-metrics" searchKeys={['metric', 'scope']} emptyText="No quality metrics recorded yet." />
    </>
  );
};

// ============================================================
//  SUPER ADMIN — ADMISSIONS BY DEPARTMENT → PROGRAM
//  ------------------------------------------------------------
//  Phase 1 Part C. A live, filterable overview of admissions
//  applications grouped by Department → Program (never mixed).
//  Filters: Department, Program, Session (admission cycle) and
//  Status. Department / Program / Cycle / Status filters are all
//  applied at the DB query level (see admissionsGovernance
//  controller) so the data is real-time and scalable — the client
//  only groups the already-scoped rows.
//
//  Actions are preserved: each row keeps its "Manage" affordance
//  via the onManage callback, and each program table exports
//  independently.
// ============================================================
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import saApi from '../saApi';
import DataTable from './DataTable';
import { Badge, Skeleton, useToast } from './ui';
import { groupByDeptProgram, DeptProgramGroups, slug } from './deptProgramGrouping';

const STATUSES = [
  'SUBMITTED', 'UNDER_REVIEW', 'FORWARDED', 'INTERVIEWED', 'INTERVIEW_COMPLETED',
  'QUALIFIED', 'DISQUALIFIED', 'SELECTED', 'FEE_PENDING', 'FEE_PAID', 'FEE_APPROVED',
  'ENROLLED', 'NEED_INFO', 'REJECTED',
];
const statusColor = (s) =>
  s === 'ENROLLED' || s === 'SELECTED' || s === 'FEE_APPROVED' ? 'green'
  : s === 'REJECTED' || s === 'DISQUALIFIED' ? 'red'
  : s === 'FEE_PAID' || s === 'QUALIFIED' ? 'blue' : 'amber';

const applicantName = (r) => {
  const p = r.user?.profile;
  const full = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
  return full || r.user?.username || r.user?.email || '—';
};

const AdmissionsByDeptProgram = ({ onManage }) => {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [cycles, setCycles] = useState([]);

  // Filters (all pushed to the backend query).
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [status, setStatus] = useState('');

  // Load filter option lists once.
  useEffect(() => {
    (async () => {
      try {
        const [dep, prog, cyc] = await Promise.all([
          saApi.listDepartments(), saApi.listPrograms(), saApi.admCycles(),
        ]);
        setDepartments(dep.data.departments || dep.data || []);
        setPrograms(prog.data.programs || prog.data || []);
        setCycles(cyc.data.cycles || cyc.data || []);
      } catch { /* non-fatal — filters just stay empty */ }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { pageSize: 100 };
      if (departmentId) params.departmentId = departmentId;
      if (programId) params.programId = programId;
      if (cycleId) params.cycleId = cycleId;
      if (status) params.status = status;
      const { data } = await saApi.admApplications(params);
      setRows(data.applications || []);
    } catch { toast.push('Failed to load admissions overview', 'error'); }
    finally { setLoading(false); }
  }, [departmentId, programId, cycleId, status, toast]);
  useEffect(() => { load(); }, [load]);

  // Programs shown in the Program filter are scoped to the chosen department.
  const programOptions = useMemo(() => {
    if (!departmentId) return programs;
    return programs.filter((p) => String(p.departmentId) === String(departmentId));
  }, [programs, departmentId]);

  const groups = groupByDeptProgram(
    rows,
    (r) => (r.program?.department ? { id: r.program.department.id, name: r.program.department.name } : null),
    (r) => (r.program ? { id: r.program.id, name: r.program.name } : null),
  );

  const columns = [
    { key: 'id', header: 'App #', render: (r) => `#${r.id}`, exportValue: (r) => r.id },
    { key: 'applicant', header: 'Applicant', render: applicantName, exportValue: applicantName },
    { key: 'session', header: 'Session', render: (r) => r.admissionCycle?.title || '—', exportValue: (r) => r.admissionCycle?.title },
    { key: 'status', header: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge>, exportValue: (r) => r.status },
    { key: 'submittedAt', header: 'Submitted', render: (r) => (r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'), exportValue: (r) => r.submittedAt },
    ...(onManage ? [{
      key: '__actions', header: '', exportable: false, tdStyle: { textAlign: 'right' },
      render: (r) => <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => onManage(r)}><i className="fas fa-gavel" /> Manage</button>,
    }] : []),
  ];

  const resetFilters = () => { setDepartmentId(''); setProgramId(''); setCycleId(''); setStatus(''); };
  const activeFilters = [departmentId, programId, cycleId, status].filter(Boolean).length;

  return (
    <div className="sa-card" id="admissions-by-dept-program">
      <div className="sa-card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3><i className="fas fa-layer-group" style={{ color: 'var(--sa-blue)', marginRight: 8 }} />Admissions by Department → Program</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          {activeFilters > 0 && <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={resetFilters}><i className="fas fa-filter-circle-xmark" /> Clear ({activeFilters})</button>}
          <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={load} disabled={loading}><i className={`fas fa-rotate ${loading ? 'fa-spin' : ''}`} /> Refresh</button>
        </div>
      </div>
      <div className="sa-card-pad">
        {/* Filter bar */}
        <div className="sa-toolbar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <select className="sa-filter-select" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setProgramId(''); }}>
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="sa-filter-select" value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">All Programs</option>
            {programOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="sa-filter-select" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            <option value="">All Sessions</option>
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <select className="sa-filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading ? (
          <><Skeleton h={48} /><Skeleton h={120} style={{ marginTop: 12 }} /></>
        ) : (
          <DeptProgramGroups
            groups={groups}
            emptyText="No applications match the selected filters."
            renderProgram={(d, p) => (
              <DataTable
                columns={columns} rows={p.rows} loading={false}
                exportName={`admissions-${slug(d.deptName)}-${slug(p.progName)}`}
                exportTitle={`Admissions — ${d.deptName} / ${p.progName}`}
                searchKeys={['status']} emptyText="No applications." />
            )}
          />
        )}
      </div>
    </div>
  );
};

export default AdmissionsByDeptProgram;

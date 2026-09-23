// ============================================================
//  SUPER ADMIN — SHARED Department → Program grouping helpers
//  ------------------------------------------------------------
//  Phase 1 Part C — one canonical implementation used by BOTH the
//  Admissions Governance pages (Applications / Merit) and the
//  Executive Dashboard so grouping behaviour is identical everywhere
//  and there is no duplicated logic.
//
//    groupByDeptProgram(rows, getDept, getProg)
//      getDept(row) → { id, name }   getProg(row) → { id, name }
//      Returns [{ deptId, deptName, programs: [{ progId, progName, rows }] }]
//      sorted alphabetically; never mixes programs across departments.
//
//    <DeptProgramGroups groups renderProgram emptyText />
//      Collapsible Department → Program section wrapper.
// ============================================================
import React, { useState } from 'react';
import { Badge, EmptyState } from './ui';

export const groupByDeptProgram = (rows, getDept, getProg) => {
  const depts = new Map();
  for (const r of rows) {
    const d = getDept(r) || { id: 0, name: 'Unassigned Department' };
    const p = getProg(r) || { id: 0, name: 'Unassigned Program' };
    const dKey = d.id ?? d.name;
    if (!depts.has(dKey)) depts.set(dKey, { deptId: d.id, deptName: d.name || 'Unassigned Department', progs: new Map() });
    const dept = depts.get(dKey);
    const pKey = p.id ?? p.name;
    if (!dept.progs.has(pKey)) dept.progs.set(pKey, { progId: p.id, progName: p.name || 'Unassigned Program', rows: [] });
    dept.progs.get(pKey).rows.push(r);
  }
  return [...depts.values()]
    .map((d) => ({
      deptId: d.deptId, deptName: d.deptName,
      programs: [...d.progs.values()].sort((a, b) => a.progName.localeCompare(b.progName)),
    }))
    .sort((a, b) => a.deptName.localeCompare(b.deptName));
};

// Collapsible Department → Program section wrapper. Each program renders its
// own table (children) so its export buttons download that program separately.
export const DeptProgramGroups = ({ groups, renderProgram, emptyText }) => {
  const [collapsed, setCollapsed] = useState({});
  if (!groups.length) return <EmptyState text={emptyText || 'Nothing to show yet.'} />;
  const toggle = (k) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));
  return (
    <div className="sa-dept-groups">
      {groups.map((d) => {
        const dKey = `d-${d.deptId}-${d.deptName}`;
        const total = d.programs.reduce((s, p) => s + p.rows.length, 0);
        const isCollapsed = collapsed[dKey];
        return (
          <section key={dKey} className="sa-dept-block" style={{ marginBottom: 22, border: '1px solid var(--sa-border, #e2e8f0)', borderRadius: 10, overflow: 'hidden' }}>
            <header
              onClick={() => toggle(dKey)}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--sa-surface-2, #f1f5f9)', fontWeight: 700, fontSize: 14 }}
            >
              <i className={`fas fa-chevron-${isCollapsed ? 'right' : 'down'}`} style={{ fontSize: 12, width: 14 }} />
              <i className="fas fa-building" style={{ color: 'var(--sa-primary, #1e3a5f)' }} />
              <span>{d.deptName}</span>
              <Badge color="blue">{d.programs.length} program{d.programs.length !== 1 ? 's' : ''}</Badge>
              <Badge color="gray">{total} record{total !== 1 ? 's' : ''}</Badge>
            </header>
            {!isCollapsed && (
              <div style={{ padding: '8px 16px 16px' }}>
                {d.programs.map((p) => (
                  <div key={`p-${p.progId}-${p.progName}`} style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0 8px', fontWeight: 600, fontSize: 13 }}>
                      <i className="fas fa-graduation-cap" style={{ color: 'var(--sa-text-muted, #64748b)' }} />
                      <span>{p.progName}</span>
                      <Badge color="gray">{p.rows.length}</Badge>
                    </div>
                    {renderProgram(d, p)}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

// Safe filename fragment for per-department/-program export naming.
export const slug = (s) => String(s || 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'all';

// ============================================================
//  SUPER ADMIN — PORTAL REGISTRY  (Future extensibility)
//  ------------------------------------------------------------
//  The Super Admin is the supreme governor: whenever a NEW portal
//  is added to the platform, it auto-inherits Super Admin access
//  without any schema or code restructuring. This registry shows
//  the portals the console governs today and reserves clearly
//  marked slots for future portals.
// ============================================================
import React from 'react';
import { PageHeader, Breadcrumb, Badge } from '../components/ui';

const ACTIVE_PORTALS = [
  {
    key: 'admissions', name: 'Admissions Portal', icon: 'fa-file-signature', color: 'blue',
    roles: ['Director Admissions', 'Coordinator'],
    powers: 'Applications, decisions & overrides, document verification, merit lists, cycle configuration, stats & reports.',
    governedAt: '/super-admin/admissions/applications',
  },
  {
    key: 'lms', name: 'Learning Management System', icon: 'fa-graduation-cap', color: 'green',
    roles: ['Student', 'Teacher', 'Course Coordinator', 'Focal Person', 'Exam Controller', 'QEC Coordinator', 'Provost'],
    powers: 'Marks, attendance, assignments, materials, sections, teacher assignment, fees & fines, drops/restores, exams & rechecks, surveys.',
    governedAt: '/super-admin/lms/students',
  },
  {
    key: 'governance', name: 'Institution & Security', icon: 'fa-building-shield', color: 'amber',
    roles: ['Super Admin (exclusive)'],
    powers: 'Institution management, complete user management, audit & override logs, announcements, system configuration, maintenance mode, branding.',
    governedAt: '/super-admin/institution/profile',
  },
];

// Reserved, clearly-marked slots — auto-inherit access when implemented.
const FUTURE_PORTALS = [
  { key: 'finance', name: 'Finance & Accounts Portal', icon: 'fa-coins', hint: 'Ledger, vouchers, payroll' },
  { key: 'hr', name: 'HR & Faculty Portal', icon: 'fa-id-badge', hint: 'Recruitment, leave, appraisals' },
  { key: 'library', name: 'Library Portal', icon: 'fa-book-open-reader', hint: 'Catalog, circulation, fines' },
  { key: 'hostel', name: 'Hostel & Transport', icon: 'fa-bus', hint: 'Rooms, routes, allocations' },
];

export const PortalRegistry = () => (
  <>
    <Breadcrumb items={[{ label: 'Future Portals' }, { label: 'Portal Registry' }]} />
    <PageHeader title="Portal Registry"
      subtitle="The Super Admin Console auto-inherits authority over every platform portal. New portals slot in here with no re-architecture." />

    <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '.04em', color: 'var(--sa-text-soft)', margin: '6px 0 12px' }}>
      ACTIVE PORTALS · GOVERNED NOW
    </div>
    <div className="sa-gov-grid">
      {ACTIVE_PORTALS.map((p) => (
        <div key={p.key} className="sa-gov-tile">
          <div className={`sa-gov-ic ${p.color}`}><i className={`fas ${p.icon}`} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong>{p.name}</strong>
              <Badge color="green">GOVERNED</Badge>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--sa-text-soft)', margin: '6px 0' }}>{p.powers}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {p.roles.map((r) => <span key={r} className="sa-chip">{r}</span>)}
            </div>
            <a className="sa-link" href={`#${p.governedAt}`} onClick={(e) => { e.preventDefault(); window.location.hash = ''; window.history.pushState({}, '', p.governedAt); window.dispatchEvent(new PopStateEvent('popstate')); }}>
              Open command center →
            </a>
          </div>
        </div>
      ))}
    </div>

    <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '.04em', color: 'var(--sa-text-soft)', margin: '26px 0 12px' }}>
      RESERVED · AUTO-INHERIT ON LAUNCH
    </div>
    <div className="sa-gov-grid">
      {FUTURE_PORTALS.map((p) => (
        <div key={p.key} className="sa-gov-tile sa-future">
          <div className="sa-gov-ic gray"><i className={`fas ${p.icon}`} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong>{p.name}</strong>
              <Badge color="gray">RESERVED</Badge>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--sa-text-muted)', marginTop: 6 }}>{p.hint}</div>
            <div style={{ fontSize: 12, color: 'var(--sa-text-muted)', marginTop: 8, fontStyle: 'italic' }}>
              <i className="fas fa-puzzle-piece" /> Will inherit Super Admin access automatically — no schema or code restructuring required.
            </div>
          </div>
        </div>
      ))}
    </div>

    <div className="sa-card sa-card-pad" style={{ marginTop: 24 }}>
      <strong><i className="fas fa-circle-info" /> How auto-inheritance works</strong>
      <p style={{ fontSize: 13, color: 'var(--sa-text-soft)', marginBottom: 0 }}>
        Governance controllers are additive and write to each portal's own existing tables using the impersonated role.
        A new portal exposes its service layer; the Super Admin Console mounts a governance module that calls those
        services and records every action to the shared audit trail (SaActivityLog), the portal's own audit log, and the
        permanent override log — so the new portal is governed the day it ships, with zero changes to existing portals.
      </p>
    </div>
  </>
);

export default PortalRegistry;

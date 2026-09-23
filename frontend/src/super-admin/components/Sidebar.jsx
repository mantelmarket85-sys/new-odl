// ============================================================
//  SUPER ADMIN — COLLAPSIBLE SIDEBAR
//  Navigation grouped by category (DASHBOARD, INSTITUTION,
//  ADMISSIONS MANAGEMENT, ACADEMIC CONFIGURATION, USER MANAGEMENT,
//  LMS OVERSIGHT, SYSTEM, REPORTS).
// ============================================================
import React from 'react';
import { NavLink } from 'react-router-dom';

export const NAV_GROUPS = [
  {
    label: 'Dashboard',
    items: [{ to: '/super-admin', icon: 'fa-gauge-high', label: 'Overview', end: true }],
  },
  {
    label: 'Institution',
    items: [
      { to: '/super-admin/institution/profile', icon: 'fa-building-columns', label: 'University Profile' },
      { to: '/super-admin/institution/departments', icon: 'fa-sitemap', label: 'Departments' },
      { to: '/super-admin/institution/department-management', icon: 'fa-diagram-project', label: 'Dept & Program Mgmt' },
      { to: '/super-admin/institution/programs', icon: 'fa-graduation-cap', label: 'Programs' },
    ],
  },
  {
    label: 'Admissions Management',
    items: [
      { to: '/super-admin/admissions/applications', icon: 'fa-file-lines', label: 'Applications' },
      { to: '/super-admin/admissions/merit', icon: 'fa-ranking-star', label: 'Merit Lists' },
      { to: '/super-admin/admissions/cycles', icon: 'fa-calendar-check', label: 'Admission Cycles' },
      { to: '/super-admin/admissions/overrides', icon: 'fa-shield-halved', label: 'Status Overrides' },
    ],
  },
  {
    label: 'Academic Configuration',
    items: [
      { to: '/super-admin/academic/sessions', icon: 'fa-calendar-days', label: 'Academic Sessions' },
      { to: '/super-admin/academic/grading', icon: 'fa-percent', label: 'Grading Scale' },
      { to: '/super-admin/academic/terms', icon: 'fa-calendar-week', label: 'Academic Terms' },
    ],
  },
  {
    label: 'User Management',
    items: [
      { to: '/super-admin/users', icon: 'fa-users-gear', label: 'All Users' },
      { to: '/super-admin/users/bulk', icon: 'fa-layer-group', label: 'Bulk Operations' },
      { to: '/super-admin/users/transfer', icon: 'fa-people-arrows', label: 'Transfer Duties' },
      { to: '/super-admin/users/sessions', icon: 'fa-right-to-bracket', label: 'Login Sessions' },
    ],
  },
  {
    label: 'LMS Oversight',
    items: [
      { to: '/super-admin/lms/students', icon: 'fa-id-card', label: 'Student Control' },
      { to: '/super-admin/lms/enrollments', icon: 'fa-user-graduate', label: 'Enrollments' },
      { to: '/super-admin/lms/courses', icon: 'fa-book', label: 'Courses & Offerings' },
      { to: '/super-admin/lms/academic', icon: 'fa-chalkboard-user', label: 'Teaching Actions' },
      { to: '/super-admin/lms/results', icon: 'fa-award', label: 'Results' },
      { to: '/super-admin/lms/fees', icon: 'fa-money-bill-wave', label: 'Fees & Finance' },
      { to: '/super-admin/lms/exams', icon: 'fa-pen-ruler', label: 'Exams & Rechecks' },
      { to: '/super-admin/lms/quality', icon: 'fa-clipboard-check', label: 'Quality & Surveys' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/super-admin/system/announcements', icon: 'fa-bullhorn', label: 'Announcements' },
      { to: '/super-admin/system/security', icon: 'fa-lock', label: 'Security & Policy' },
      { to: '/super-admin/system/config', icon: 'fa-sliders', label: 'Configuration' },
      { to: '/super-admin/system/maintenance', icon: 'fa-screwdriver-wrench', label: 'Maintenance' },
      { to: '/super-admin/system/payment-gateway', icon: 'fa-money-check-dollar', label: 'Payment Gateway' },
      { to: '/super-admin/system/audit', icon: 'fa-clock-rotate-left', label: 'Audit Trail' },
      { to: '/super-admin/system/overrides', icon: 'fa-file-shield', label: 'Override Log' },
    ],
  },
  {
    label: 'Reports',
    items: [{ to: '/super-admin/reports', icon: 'fa-chart-pie', label: 'Reports & Exports' }],
  },
  {
    label: 'Future Portals',
    items: [{ to: '/super-admin/portals', icon: 'fa-puzzle-piece', label: 'Portal Registry' }],
  },
];

const Sidebar = ({ collapsed, mobileOpen, onNavigate }) => (
  <aside className={`sa-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
    <div className="sa-brand">
      <div className="sa-brand-logo">AU</div>
      {!collapsed && (
        <div className="sa-brand-text">
          <strong>AUST ODL</strong>
          <span>Super Admin Console</span>
        </div>
      )}
    </div>
    <nav className="sa-nav">
      {NAV_GROUPS.map((group) => (
        <div className="sa-nav-group" key={group.label}>
          <div className="sa-nav-group-label">{collapsed ? '•' : group.label}</div>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sa-nav-item ${isActive ? 'active' : ''}`}
              onClick={onNavigate}
              title={item.label}
            >
              <i className={`fas ${item.icon}`} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  </aside>
);

export default Sidebar;

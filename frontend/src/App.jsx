import React, { Suspense, lazy, useLayoutEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './utils/AuthContext';

// --- Eager (small / always-needed) -----------------------------------------
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';

// --- Lazy-loaded (heavier or rarely-visited) -------------------------------
const ForgotPassword       = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword        = lazy(() => import('./pages/ResetPassword'));
const Terms                = lazy(() => import('./pages/Terms'));
const Privacy              = lazy(() => import('./pages/Privacy'));
const Dashboard            = lazy(() => import('./pages/Dashboard'));
const AdminDashboard       = lazy(() => import('./pages/AdminDashboard'));
// Super Admin Console (new module) — nested layout + routed pages.
const SuperAdminLayout     = lazy(() => import('./super-admin/SuperAdminLayout'));
const SaDashboard          = lazy(() => import('./super-admin/pages/Dashboard'));
const SaUsers              = lazy(() => import('./super-admin/pages/Users'));
const SaLoginSessions      = lazy(() => import('./super-admin/pages/LoginSessions'));
const SaReports            = lazy(() => import('./super-admin/pages/Reports'));
// Named-export pages → wrap as default for React.lazy.
const SaProfile      = lazy(() => import('./super-admin/pages/Institution').then(m => ({ default: m.Profile })));
const SaDepartments  = lazy(() => import('./super-admin/pages/Institution').then(m => ({ default: m.Departments })));
const SaDeptManage   = lazy(() => import('./super-admin/pages/DepartmentManagement'));
const SaPrograms     = lazy(() => import('./super-admin/pages/Institution').then(m => ({ default: m.Programs })));
// (Master Prompt §2) Campuses module removed — this is a single-campus ODL platform.
const SaSessions     = lazy(() => import('./super-admin/pages/Academic').then(m => ({ default: m.Sessions })));
const SaGrading      = lazy(() => import('./super-admin/pages/Academic').then(m => ({ default: m.Grading })));
const SaTerms        = lazy(() => import('./super-admin/pages/Academic').then(m => ({ default: m.Terms })));
const SaEnrollments  = lazy(() => import('./super-admin/pages/LmsOversight').then(m => ({ default: m.Enrollments })));
const SaCourses      = lazy(() => import('./super-admin/pages/LmsOversight').then(m => ({ default: m.Courses })));
const SaResults      = lazy(() => import('./super-admin/pages/LmsOversight').then(m => ({ default: m.Results })));
const SaFees         = lazy(() => import('./super-admin/pages/LmsOversight').then(m => ({ default: m.Fees })));
const SaExams        = lazy(() => import('./super-admin/pages/LmsOversight').then(m => ({ default: m.Exams })));
const SaQuality      = lazy(() => import('./super-admin/pages/LmsOversight').then(m => ({ default: m.Quality })));
const SaAnnouncements= lazy(() => import('./super-admin/pages/System').then(m => ({ default: m.Announcements })));
const SaSecurity     = lazy(() => import('./super-admin/pages/System').then(m => ({ default: m.Security })));
const SaConfig       = lazy(() => import('./super-admin/pages/System').then(m => ({ default: m.Configuration })));
const SaMaintenance  = lazy(() => import('./super-admin/pages/System').then(m => ({ default: m.Maintenance })));
const SaPaymentGateway = lazy(() => import('./super-admin/pages/System').then(m => ({ default: m.PaymentGateway })));
const SaAudit        = lazy(() => import('./super-admin/pages/System').then(m => ({ default: m.Audit })));
const SaOverrideLog  = lazy(() => import('./super-admin/pages/System').then(m => ({ default: m.OverrideLog })));
const SaAdmOverrides = lazy(() => import('./super-admin/pages/Admissions').then(m => ({ default: m.Overrides })));
// --- Super Admin GOVERNANCE (Full Enhancement) — act-as-any-role command center ---
const SaApplications   = lazy(() => import('./super-admin/pages/AdmissionsGov').then(m => ({ default: m.Applications })));
const SaMerit          = lazy(() => import('./super-admin/pages/AdmissionsGov').then(m => ({ default: m.Merit })));
const SaCycles         = lazy(() => import('./super-admin/pages/AdmissionsGov').then(m => ({ default: m.Cycles })));
const SaStudentControl = lazy(() => import('./super-admin/pages/LmsStudents').then(m => ({ default: m.StudentControl })));
const SaTeaching       = lazy(() => import('./super-admin/pages/LmsAcademic').then(m => ({ default: m.TeachingActions })));
const SaFeesFinance    = lazy(() => import('./super-admin/pages/LmsFinance').then(m => ({ default: m.FeesFinance })));
const SaExamsRechecks  = lazy(() => import('./super-admin/pages/LmsExams').then(m => ({ default: m.ExamsRechecks })));
const SaQualitySurveys = lazy(() => import('./super-admin/pages/LmsQuality').then(m => ({ default: m.QualitySurveys })));
const SaBulkOps        = lazy(() => import('./super-admin/pages/UsersBulk').then(m => ({ default: m.BulkOperations })));
const SaTransferDuties = lazy(() => import('./super-admin/pages/UsersTransfer').then(m => ({ default: m.TransferDuties })));
const SaPortals        = lazy(() => import('./super-admin/pages/Portals').then(m => ({ default: m.PortalRegistry })));
const CoordinatorDashboard = lazy(() => import('./pages/CoordinatorDashboard'));
const LmsEntry             = lazy(() => import('./pages/lms/LmsEntry'));
const CourseScheme         = lazy(() => import('./pages/CourseScheme'));
const WhyChooseUs          = lazy(() => import('./pages/WhyChooseUs'));
const Alumni               = lazy(() => import('./pages/Alumni'));
const About                = lazy(() => import('./pages/About'));
const Admissions           = lazy(() => import('./pages/Admissions'));
const ODL                  = lazy(() => import('./pages/ODL'));
const Faculties            = lazy(() => import('./pages/Faculties'));
const Programs             = lazy(() => import('./pages/Programs'));
const FeeStructure         = lazy(() => import('./pages/FeeStructure'));
const Scholarships         = lazy(() => import('./pages/Scholarships'));
const News                 = lazy(() => import('./pages/News'));
const Contact              = lazy(() => import('./pages/Contact'));
const Downloads            = lazy(() => import('./pages/Downloads'));
const FAQ                  = lazy(() => import('./pages/FAQ'));

const normalizeRole = (role) => (role === 'admin' ? 'director_admissions' : role);

const homeForRole = (role) => {
  const r = normalizeRole(role);
  if (r === 'super_admin') return '/super-admin';
  if (r === 'director_admissions') return '/admin';
  if (r === 'coordinator') return '/coordinator';
  return '/dashboard';
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading"><span className="spinner"></span></div>;
  if (!user) return <Navigate to="/login" replace />;
  const role = normalizeRole(user.role);
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }
  return children;
};

/**
 * Reset scroll position to the top on every route change.
 * Uses useLayoutEffect so the scroll happens BEFORE the new page paints,
 * which fixes the "landing page opens scrolled down" bug.
 *
 * If a hash (#section) is present, smooth-scroll to it instead — this preserves
 * in-page anchor navigation for e.g. /#admission-steps deep links.
 */
const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (hash) {
      // Defer hash-scroll to after the new page renders
      const id = hash.replace(/^#/, '');
      const tryScroll = () => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo(0, 0);
        }
      };
      // Small delay so the lazy chunk has time to mount
      const t = setTimeout(tryScroll, 50);
      return () => clearTimeout(t);
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
};

const RouteFallback = () => (
  <div className="loading" style={{ marginTop: '30vh' }} aria-busy="true" aria-live="polite">
    <span className="spinner"></span>
  </div>
);

const App = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading" style={{ marginTop: '40vh' }}><span className="spinner"></span></div>;
  }

  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />

          {/* Auth */}
          <Route path="/login" element={user ? <Navigate to={homeForRole(user.role)} replace /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
          <Route path="/forgot-password" element={user ? <Navigate to={homeForRole(user.role)} replace /> : <ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Legal — accessible to anyone */}
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />

          {/* Public marketing pages */}
          <Route path="/course-scheme" element={<CourseScheme />} />
          <Route path="/why-choose-us" element={<WhyChooseUs />} />
          <Route path="/alumni" element={<Alumni />} />
          <Route path="/about" element={<About />} />
          <Route path="/admissions" element={<Admissions />} />
          <Route path="/odl" element={<ODL />} />
          <Route path="/faculties" element={<Faculties />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/fee-structure" element={<FeeStructure />} />
          <Route path="/scholarships" element={<Scholarships />} />
          <Route path="/news" element={<News />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/faq" element={<FAQ />} />

          {/* Admission Portal */}
          <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['student']}><Dashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['director_admissions']}><AdminDashboard /></ProtectedRoute>} />
          {/* Super Admin Console — nested layout with grouped module pages */}
          <Route path="/super-admin" element={<ProtectedRoute allowedRoles={['super_admin']}><SuperAdminLayout /></ProtectedRoute>}>
            <Route index element={<SaDashboard />} />
            {/* Institution */}
            <Route path="institution/profile" element={<SaProfile />} />
            <Route path="institution/departments" element={<SaDepartments />} />
            <Route path="institution/department-management" element={<SaDeptManage />} />
            <Route path="institution/programs" element={<SaPrograms />} />
            {/* (Master Prompt §2) Campuses route removed — single-campus ODL platform. */}
            {/* Admissions — governance (act as Director + Coordinator) */}
            <Route path="admissions/applications" element={<SaApplications />} />
            <Route path="admissions/merit" element={<SaMerit />} />
            <Route path="admissions/cycles" element={<SaCycles />} />
            <Route path="admissions/overrides" element={<SaAdmOverrides />} />
            {/* Academic */}
            <Route path="academic/sessions" element={<SaSessions />} />
            <Route path="academic/grading" element={<SaGrading />} />
            <Route path="academic/terms" element={<SaTerms />} />
            {/* User management */}
            <Route path="users" element={<SaUsers />} />
            <Route path="users/bulk" element={<SaBulkOps />} />
            <Route path="users/transfer" element={<SaTransferDuties />} />
            <Route path="users/sessions" element={<SaLoginSessions />} />
            {/* LMS oversight + governance (act as any LMS role) */}
            <Route path="lms/students" element={<SaStudentControl />} />
            <Route path="lms/enrollments" element={<SaEnrollments />} />
            <Route path="lms/courses" element={<SaCourses />} />
            <Route path="lms/academic" element={<SaTeaching />} />
            <Route path="lms/results" element={<SaResults />} />
            <Route path="lms/fees" element={<SaFeesFinance />} />
            <Route path="lms/fees/overview" element={<SaFees />} />
            <Route path="lms/exams" element={<SaExamsRechecks />} />
            <Route path="lms/exams/overview" element={<SaExams />} />
            <Route path="lms/quality" element={<SaQualitySurveys />} />
            {/* System */}
            <Route path="system/announcements" element={<SaAnnouncements />} />
            <Route path="system/security" element={<SaSecurity />} />
            <Route path="system/config" element={<SaConfig />} />
            <Route path="system/maintenance" element={<SaMaintenance />} />
            <Route path="system/payment-gateway" element={<SaPaymentGateway />} />
            <Route path="system/audit" element={<SaAudit />} />
            <Route path="system/overrides" element={<SaOverrideLog />} />
            {/* Reports */}
            <Route path="reports" element={<SaReports />} />
            {/* Future portals — extensible registry */}
            <Route path="portals" element={<SaPortals />} />
          </Route>
          <Route path="/coordinator" element={<ProtectedRoute allowedRoles={['coordinator']}><CoordinatorDashboard /></ProtectedRoute>} />

          {/* LMS — redirects to the standalone LMS frontend (Section 8 & 12) */}
          <Route path="/lms" element={<LmsEntry />} />
          <Route path="/lms/*" element={<LmsEntry />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
};

export default App;

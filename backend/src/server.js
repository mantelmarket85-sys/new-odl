require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const educationRoutes = require('./routes/education');
const applicationRoutes = require('./routes/application');
const paymentsRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const coordinatorRoutes = require('./routes/coordinator');
const documentRoutes = require('./routes/documents');
const notificationRoutes = require('./routes/notifications');
const appealRoutes = require('./routes/appeals');
const programRoutes = require('./routes/programs');
const admissionCycleRoutes = require('./routes/admissionCycle');
const meritRoutes = require('./routes/merit');
const feeRoutes = require('./routes/fee');
const feeManagementRoutes = require('./routes/feeManagement');
const enrollmentRoutes = require('./routes/enrollment');
const paymentMethodsRoutes = require('./routes/paymentMethods');
const documentViewRoutes = require('./routes/documentView');
const printApplicationRoutes = require('./routes/printApplication');
const exportRoutes = require('./routes/exports');
const departmentRoutes = require('./routes/departments');
const superAdminRoutes = require('./routes/superAdmin');
// Super Admin MODULE (new, additive) — comprehensive institution / academic /
// user / LMS-oversight / system / reports endpoints. Mounted AFTER the legacy
// superAdmin router so existing endpoints (/users, /departments, /stats) win.
const superAdminModuleRoutes = require('./modules/super-admin/superAdmin.routes');
// LMS — legacy enrollment-based auth (kept for back-compat; mounted at /api/lms-auth).
const lmsAuthRoutes = require('./routes/lms/lmsAuth');
// LMS — new LmsUser-based auth + student endpoints for the dedicated LMS frontend.
const lmsAuthV2Routes = require('./routes/lms/lmsAuthV2');
const lmsStudentV2Routes = require('./routes/lms/lmsStudentV2');
// LMS ACADEMIC CORE (Student + Teacher modules) — keyed on LmsUser/lmsAuth.
const lmsAcademicStructureRoutes = require('./routes/lms/academic/structure');
const lmsAcademicTeacherRoutes = require('./routes/lms/academic/teacher');
const lmsAcademicStudentRoutes = require('./routes/lms/academic/student');
const lmsAcademicCoordinatorRoutes = require('./routes/lms/academic/coordinator');
// Course Coordinator — enhanced modules (Teacher Replacement, Students,
// Enrollment, Appeals, Announcements/Messages real-time) — additive router.
const lmsAcademicCoordinatorPlusRoutes = require('./routes/lms/academic/coordinatorPlus');
// Course Coordinator — Scheme of Study drag & drop builder.
const lmsAcademicSchemeRoutes = require('./routes/lms/academic/scheme');
// PHASE 4 — Focal Person (department oversight + governance workflows).
const lmsAcademicFocalRoutes = require('./routes/lms/academic/focal');
// PHASE 5 — Exam Controller (examination management + results + transcripts).
const lmsAcademicExamRoutes = require('./routes/lms/academic/exam');
// PHASE 5 — Public transcript verification (no auth).
const lmsAcademicExamPublicRoutes = require('./routes/lms/academic/examPublic');
// PHASE 6 — Director QEC (Quality Enhancement Cell: quality assurance, surveys, accreditation).
const lmsAcademicQecRoutes = require('./routes/lms/academic/directorqec');
// PHASE 7 — Provost (University Executive: analytics, finance, governance oversight).
const lmsAcademicProvostRoutes = require('./routes/lms/academic/provost');
// LMS Support & Grievances — unified staff management router (additive).
const lmsAcademicGrievancesRoutes = require('./routes/lms/academic/grievances');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow localhost dev
    if (origin.includes('localhost')) return callback(null, true);
    // Allow sandbox URLs
    if (origin.includes('.sandbox.novita.ai') || origin.includes('.sandbox.e2b.dev')) return callback(null, true);
    // Allow configured frontend URL
    const allowed = process.env.FRONTEND_URL || 'http://localhost:3000';
    if (origin === allowed) return callback(null, true);
    callback(null, true); // Allow all in dev
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Static uploads. Express.static already honours HTTP Range requests
// (so video <video> seeking / streaming works); we additionally set
// Accept-Ranges + correct video content-types and permissive CORS so
// the separate LMS frontend origin can stream uploaded lectures.
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'), {
    acceptRanges: true,
    setHeaders: (res, filePath) => {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const ext = path.extname(filePath).toLowerCase();
      const videoTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.ogv': 'video/ogg',
        '.mov': 'video/quicktime',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.m4v': 'video/x-m4v',
        '.3gp': 'video/3gpp',
      };
      if (videoTypes[ext]) res.setHeader('Content-Type', videoTypes[ext]);
    },
  }),
);

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/education', educationRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/coordinator', coordinatorRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/appeals', appealRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/admission-cycle', admissionCycleRoutes);
app.use('/api/merit', meritRoutes);
app.use('/api/fee', feeRoutes);
// Fee Management (Fix 3) — per-department/per-program semester fee + payment approval
app.use('/api/fee-management', feeManagementRoutes);
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/payment-methods', paymentMethodsRoutes);
app.use('/api/files', documentViewRoutes);
// Mounted at root so the URL is `/print-application/:id?token=...` (opens in a new tab)
app.use('/', printApplicationRoutes);
// Backup & Export endpoints (admin/coordinator/director-only, role-guarded inside router)
app.use('/api/exports', exportRoutes);
// Department & Program management (Director / Super Admin) + Super Admin system control
app.use('/api/departments', departmentRoutes);
app.use('/api/super-admin', superAdminRoutes);
// Additive: comprehensive Super Admin module (new namespaced sub-paths only).
app.use('/api/super-admin', superAdminModuleRoutes);

// LMS auth — legacy enrollment-based flow (kept for back-compat).
app.use('/api/lms-auth', lmsAuthRoutes);

// ============================================================
// LMS (new LmsUser-based system) — the dedicated LMS frontend
// authenticates here. All /api/lms/* routes EXCEPT auth/login and
// auth/change-password require a valid LMS session (system: 'lms').
// ============================================================
app.use('/api/lms/auth', lmsAuthV2Routes);
app.use('/api/lms/student', lmsStudentV2Routes);

// ------------------------------------------------------------
// LMS ACADEMIC CORE — Student + Teacher modules. All routes are
// protected by lmsAuth (system:'lms') + role guards inside each router.
//   /api/lms/academic/*          → academic structure (programs,
//                                   semesters, terms, courses,
//                                   offerings, sections)
//   /api/lms/academic/teacher/*  → Teacher module
//   /api/lms/academic/student/*  → Student module
// ------------------------------------------------------------
// Safety-net response sanitizer: strips sensitive LmsUser fields
// (passwordHash, lock/security columns) from every academic response,
// even if an individual query forgot to narrow its select.
const { sanitize: sanitizeAcademic } = require('./utils/lmsHelpers');
app.use('/api/lms/academic', (req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (body) => origJson(sanitizeAcademic(body));
  next();
});

app.use('/api/lms/academic/teacher', lmsAcademicTeacherRoutes);
app.use('/api/lms/academic/student', lmsAcademicStudentRoutes);
// Enhanced coordinator modules + scheme builder MUST be mounted BEFORE the
// base coordinator router so their dedicated paths (and the SSE /events
// stream, which is unauthenticated at the header level) take precedence.
app.use('/api/lms/academic/coordinator', lmsAcademicCoordinatorPlusRoutes);
app.use('/api/lms/academic/coordinator', lmsAcademicSchemeRoutes);
app.use('/api/lms/academic/coordinator', lmsAcademicCoordinatorRoutes);
app.use('/api/lms/academic/focal', lmsAcademicFocalRoutes);
// Public transcript verification (no auth) — must be mounted before the
// authenticated exam router so it isn't caught by lmsAuth.
app.use('/api/lms/academic/exam-verify', lmsAcademicExamPublicRoutes);
app.use('/api/lms/academic/exam', lmsAcademicExamRoutes);
app.use('/api/lms/academic/qec', lmsAcademicQecRoutes);
app.use('/api/lms/academic/provost', lmsAcademicProvostRoutes);
// Support & Grievances staff management surface (all staff roles).
app.use('/api/lms/academic/grievances', lmsAcademicGrievancesRoutes);
app.use('/api/lms/academic', lmsAcademicStructureRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'AUST ODL Backend is running' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File size exceeds the allowed limit' });
  }
  // Typed HTTP errors thrown via httpError() carry a status + safe message.
  if (err.status && err.expose) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message || 'Request failed' });
  }
  // Prisma known errors → friendlier messages.
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'A record with these unique values already exists.' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found.' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// STARTUP CLEANUP — remove stale duplicate Document rows
// ------------------------------------------------------------
// Historically, the photo upload route did not dedup old rows. As
// a result some users had multiple `type=photo` entries in the
// Document table → admin / coordinator dashboards would render the
// stale image AS WELL as the current one, giving the impression
// that "photo preview opens an unrelated file".
// We now keep only the NEWEST row per (userId, type) and delete
// the rest. This is safe + idempotent — files on disk are NOT
// touched, only the duplicate database references.
// ============================================================
(async () => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const _prisma = new PrismaClient();
    const docs = await _prisma.document.findMany({
      orderBy: [{ userId: 'asc' }, { type: 'asc' }, { id: 'desc' }],
      select: { id: true, userId: true, type: true },
    });
    const seen = new Set();
    const toDelete = [];
    for (const d of docs) {
      const key = `${d.userId}::${(d.type || '').toLowerCase()}`;
      if (seen.has(key)) toDelete.push(d.id);
      else seen.add(key);
    }
    if (toDelete.length > 0) {
      await _prisma.document.deleteMany({ where: { id: { in: toDelete } } });
      console.log(`[startup-cleanup] Removed ${toDelete.length} stale duplicate Document row(s).`);
    }
    await _prisma.$disconnect();
  } catch (e) {
    console.warn('[startup-cleanup] Skipped:', e.message);
  }
})();

// ============================================================
// STARTUP INITIALIZER — provision role-based LMS demo accounts
// ------------------------------------------------------------
// Idempotently upserts the seven demo logins (student/teacher/
// coordinator/focal/exam-controller/QEC/provost) into the REAL
// LmsUser table so they always exist after boot. Re-running never
// creates duplicates (upsert keyed on the unique username) and it
// leaves all real user/role data untouched. This is the same logic
// exposed via `npm run prisma:seed:demo`; wiring it here means the
// accounts auto-exist without a manual seed step.
// Disable with DISABLE_DEMO_SEED=1 if ever undesired in production.
// ============================================================
(async () => {
  if (process.env.DISABLE_DEMO_SEED === '1') return;
  try {
    const { PrismaClient } = require('@prisma/client');
    const { seedDemoAccounts } = require('../prisma/seedDemoAccounts');
    const _prisma = new PrismaClient();
    const results = await seedDemoAccounts(_prisma, { verbose: false });
    console.log(`[startup-demo-seed] Ensured ${results.length} role-based demo account(s).`);
    await _prisma.$disconnect();
  } catch (e) {
    console.warn('[startup-demo-seed] Skipped:', e.message);
  }
})();

// ============================================================
// STARTUP INITIALIZER — UNIFIED LOGIN super-admin mirror.
// ------------------------------------------------------------
// Mirrors the Admissions super_admin (User table) into the LmsUser
// table as role 'SuperAdmin' so the SAME credentials authenticate
// through the LMS login UI as well. Idempotent + additive.
// ============================================================
(async () => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const { seedSuperAdminLms } = require('../prisma/seedSuperAdminLms');
    const _prisma = new PrismaClient();
    const results = await seedSuperAdminLms(_prisma, { verbose: false });
    console.log(`[startup-sa-lms-seed] Mirrored ${results.length} super admin account(s) into the LMS login.`);
    await _prisma.$disconnect();
  } catch (e) {
    console.warn('[startup-sa-lms-seed] Skipped:', e.message);
  }
})();

// ============================================================
// STARTUP INITIALIZER — DEPARTMENT-ISOLATION SELF-HEAL.
// ------------------------------------------------------------
// Normalises LmsProgram.department to the canonical admissions
// Department name (by program code) and re-binds every LMS Focal
// Person / Course Coordinator that is linked via the admissions
// Department FK to its correct department. Idempotent & non-
// destructive — guarantees strict isolation survives redeploys.
// ============================================================
(async () => {
  try {
    const { repairDeptIsolation } = require('./utils/repairDeptIsolation');
    const out = await repairDeptIsolation({ log: false });
    console.log(`[startup-dept-isolation] Normalised ${out.programsFixed} program(s), bound ${out.staffBound} staff.`);
  } catch (e) {
    console.warn('[startup-dept-isolation] Skipped:', e.message);
  }
})();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AUST ODL Backend running on port ${PORT}`);
});

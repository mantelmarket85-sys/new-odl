// ============================================================
//  SUPER ADMIN — MODULE ROUTES
//  ------------------------------------------------------------
//  Mounted ADDITIVELY at /api/super-admin (after the legacy
//  routes/superAdmin.js router). All paths here are NEW namespaced
//  sub-paths (/dashboard, /institution/*, /academic/*, /lms/*,
//  /system/*, /reports/*, /user-management/*) so they NEVER collide
//  with the legacy endpoints (/users, /departments, /stats).
//
//  Every route is protected by authenticate + requireSuperAdmin.
// ============================================================
const express = require('express');
const { authenticate, requireSuperAdmin } = require('../../middleware/auth');

const core = require('./superAdmin.controller');
const users = require('./userManagement.controller');
const usersPlus = require('./userManagementPlus.controller');
const inst = require('./institution.controller');
const academic = require('./academicConfig.controller');
const lms = require('./lmsOversight.controller');
const sys = require('./systemConfig.controller');
const reports = require('./superAdminReports.service');
// --- Governance controllers (real cross-system write actions) ---
const adm = require('./admissionsGovernance.controller');
const lmsAct = require('./lmsAcademicActions.controller');
const lmsGov = require('./lmsGovernance.controller');

const router = express.Router();

// Global guard — every super-admin module endpoint requires super_admin.
router.use(authenticate, requireSuperAdmin);

// ---- Dashboard & audit --------------------------------------------------
router.get('/dashboard', core.getDashboard);
router.get('/dashboard/charts', core.getDashboardCharts);
router.get('/dashboard/recent-activity', core.getRecentActivity);
router.get('/activity-logs', core.getActivityLogs);
router.get('/audit-trail', core.getAuditTrail);
router.get('/override-logs', core.getOverrideLogs);

// ---- User management (full, both systems) -------------------------------
router.get('/user-management', users.listUsers);
router.post('/user-management', users.createUser);
router.patch('/user-management/:system/:id/status', users.setUserStatus);
router.post('/user-management/:system/:id/reset-password', users.resetPassword);
router.patch('/user-management/:system/:id/role', users.changeRole);
// Assign / reassign an LMS staff user's department (strict isolation key).
router.patch('/user-management/lms/:id/department', users.setLmsUserDepartment);
router.post('/user-management/:system/:id/unlock', users.unlockUser);
router.get('/user-management/deactivated', users.listDeactivated);
router.get('/user-management/login-history', users.loginHistory);
router.get('/user-management/active-sessions', users.activeSessions);
// Enhanced bulk + lifecycle operations
router.post('/user-management/bulk/reset-password', usersPlus.bulkResetPassword);
router.post('/user-management/bulk/status', usersPlus.bulkSetStatus);
router.post('/user-management/bulk/notify', usersPlus.bulkNotify);
router.post('/user-management/:system/:id/force-logout', usersPlus.forceLogout);
router.post('/user-management/transfer-responsibilities', usersPlus.transferResponsibilities);

// ---- Institution setup --------------------------------------------------
router.get('/institution/profile', inst.getUniversityProfile);
router.put('/institution/profile', inst.updateUniversityProfile);
router.get('/institution/departments', inst.listDepartments);
router.post('/institution/departments', inst.createDepartment);
router.patch('/institution/departments/:id', inst.updateDepartment);
router.get('/institution/programs', inst.listPrograms);
router.patch('/institution/programs/:id', inst.updateProgram);
// (Master Prompt §2) Campuses endpoints removed — single-campus ODL platform.

// ---- Academic configuration ---------------------------------------------
router.get('/academic/sessions', academic.listSessions);
router.post('/academic/sessions', academic.createSession);
router.patch('/academic/sessions/:id', academic.updateSession);
router.post('/academic/sessions/:id/archive', academic.archiveSession);
router.get('/academic/grading', academic.listGradingScales);
router.post('/academic/grading', academic.createGradingScale);
router.patch('/academic/grading/:id', academic.updateGradingScale);
router.delete('/academic/grading/:id', academic.deleteGradingScale);
router.get('/academic/terms', academic.listTerms);
router.get('/academic/calendar', academic.listCalendarEvents);

// ---- LMS oversight (read-only) ------------------------------------------
router.get('/lms/enrollments', lms.listEnrollments);
router.get('/lms/courses', lms.listCourses);
router.get('/lms/offerings', lms.listOfferings);
router.get('/lms/attendance/overview', lms.attendanceOverview);
router.get('/lms/results', lms.listResults);
router.get('/lms/fees/overview', lms.feeOverview);
router.get('/lms/fees/challans', lms.listFeeChallans);
router.get('/lms/exams', lms.listExams);
router.get('/lms/quality', lms.qualityMetrics);

// ---- System configuration & security ------------------------------------
router.get('/system/config', sys.listConfig);
router.post('/system/config', sys.setConfig);
router.get('/system/password-policy', sys.getPasswordPolicy);
router.put('/system/password-policy', sys.updatePasswordPolicy);
router.get('/system/announcements', sys.listAnnouncements);
router.post('/system/announcements', sys.createAnnouncement);
router.patch('/system/announcements/:id', sys.updateAnnouncement);
router.delete('/system/announcements/:id', sys.deleteAnnouncement);
router.get('/system/maintenance', sys.getMaintenanceMode);
router.put('/system/maintenance', sys.setMaintenanceMode);
router.get('/system/payment-gateway', sys.getPaymentGateway);
router.put('/system/payment-gateway', sys.updatePaymentGateway);
router.get('/system/override-logs', sys.listOverrideLogs);

// ---- Reports & exports & overrides --------------------------------------
router.get('/reports/summary', reports.reportSummary);
router.get('/reports/applications', reports.listApplications);
router.get('/reports/export/users', reports.exportUsers);
router.get('/reports/export/applications', reports.exportApplications);
router.get('/reports/export/activity-log', reports.exportActivityLog);
router.post('/reports/override/application/:id', reports.overrideApplicationStatus);
router.post('/reports/override/course-result/:id', reports.overrideCourseResult);
router.post('/reports/override/fee-challan/:id', reports.overrideFeeChallan);

// ============================================================
//  GOVERNANCE — real cross-system write actions (Super Admin can do
//  everything every role can do, with the same DB effect).
// ============================================================

// ---- Admissions governance (Director + Coordinator effect) --------------
router.get('/admissions/applications', adm.listApplications);
router.get('/admissions/applications/:id', adm.getApplication);
router.post('/admissions/applications/:id/decision', adm.decideApplication);
router.get('/admissions/candidates/:userId/documents', adm.listCandidateDocuments);
router.post('/admissions/documents/:id/verify', adm.verifyDocument);
router.get('/admissions/merit', adm.listMerit);
router.get('/admissions/stats', adm.admissionsStats);
router.get('/admissions/cycles', adm.listCycles);
router.patch('/admissions/cycles/:id', adm.updateCycle);
router.post('/admissions/cycles/:id/toggle', adm.toggleCycle);

// ---- LMS academic actions (Teacher + Course Coordinator effect) ---------
router.get('/lms/offerings/:offeringId/roster', lmsAct.offeringRoster);
router.post('/lms/offerings/:offeringId/results', lmsAct.upsertResult);
router.post('/lms/results/:id/publish', lmsAct.publishResult);
router.get('/lms/attendance/sessions', lmsAct.listAttendanceSessions);
router.post('/lms/offerings/:offeringId/attendance', lmsAct.markAttendance);
router.get('/lms/assignments', lmsAct.listAssignments);
router.post('/lms/assignments', lmsAct.createAssignment);
router.patch('/lms/assignments/:id', lmsAct.updateAssignment);
router.get('/lms/materials', lmsAct.listMaterials);
router.post('/lms/materials', lmsAct.createMaterial);
router.delete('/lms/materials/:id', lmsAct.deleteMaterial);
router.get('/lms/sections', lmsAct.listSections);
router.post('/lms/sections', lmsAct.createSection);
router.post('/lms/sections/move-student', lmsAct.moveStudentSection);
router.post('/lms/offerings/:offeringId/assign-teacher', lmsAct.assignTeacher);

// ---- LMS governance (Focal + Exam + Provost + QEC effect) ---------------
router.get('/lms/students/search', lmsGov.searchStudents);
router.post('/lms/students/:studentId/drop', lmsGov.dropStudent);
router.post('/lms/students/:studentId/restore', lmsGov.restoreStudent);
router.post('/lms/students/:studentId/fine', lmsGov.issueFine);
router.post('/lms/students/:studentId/block', lmsGov.blockStudent);
router.post('/lms/students/:studentId/unblock', lmsGov.unblockStudent);
router.post('/lms/students/:studentId/promotion', lmsGov.setPromotion);
router.post('/lms/fees/announce', lmsGov.announceFee);
router.post('/lms/fees/challans/:id/review', lmsGov.reviewFeeChallan);
router.post('/lms/exams/:examId/attendance', lmsGov.setExamAttendance);
router.get('/lms/rechecks', lmsGov.listRechecks);
router.patch('/lms/rechecks/:id', lmsGov.updateRecheck);
router.get('/lms/surveys', lmsGov.listSurveys);
router.patch('/lms/surveys/:id/toggle', lmsGov.toggleSurvey);
router.get('/lms/surveys/:id/results', lmsGov.surveyResults);

module.exports = router;

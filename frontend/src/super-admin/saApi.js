// ============================================================
//  SUPER ADMIN — API CLIENT
//  Thin wrapper around the shared admissions axios instance,
//  scoped to the /super-admin/* endpoints. Reuses the same JWT
//  interceptor + session-expiry handling already configured.
// ============================================================
import api from '../utils/api';

const BASE = '/super-admin';

const saApi = {
  // Dashboard & audit
  dashboard: () => api.get(`${BASE}/dashboard`),
  charts: () => api.get(`${BASE}/dashboard/charts`),
  recentActivity: (limit = 20) => api.get(`${BASE}/dashboard/recent-activity?limit=${limit}`),
  activityLogs: (params) => api.get(`${BASE}/activity-logs`, { params }),
  auditTrail: (params) => api.get(`${BASE}/audit-trail`, { params }),
  overrideLogs: () => api.get(`${BASE}/override-logs`),

  // User management
  listUsers: (params) => api.get(`${BASE}/user-management`, { params }),
  createUser: (body) => api.post(`${BASE}/user-management`, body),
  setUserStatus: (system, id, isActive) => api.patch(`${BASE}/user-management/${system}/${id}/status`, { isActive }),
  resetPassword: (system, id) => api.post(`${BASE}/user-management/${system}/${id}/reset-password`),
  changeRole: (system, id, role) => api.patch(`${BASE}/user-management/${system}/${id}/role`, { role }),
  // Assign / reassign an LMS staff user's department (strict isolation key).
  setLmsUserDepartment: (id, department) => api.patch(`${BASE}/user-management/lms/${id}/department`, { department }),
  unlockUser: (system, id) => api.post(`${BASE}/user-management/${system}/${id}/unlock`),
  loginHistory: () => api.get(`${BASE}/user-management/login-history`),
  activeSessions: () => api.get(`${BASE}/user-management/active-sessions`),

  // Institution
  getProfile: () => api.get(`${BASE}/institution/profile`),
  updateProfile: (body) => api.put(`${BASE}/institution/profile`, body),
  listDepartments: () => api.get(`${BASE}/institution/departments`),
  createDepartment: (body) => api.post(`${BASE}/institution/departments`, body),
  updateDepartment: (id, body) => api.patch(`${BASE}/institution/departments/${id}`, body),
  listPrograms: () => api.get(`${BASE}/institution/programs`),
  updateProgram: (id, body) => api.patch(`${BASE}/institution/programs/${id}`, body),
  // (Master Prompt §2) Campuses API removed — single-campus ODL platform.

  // Academic
  listSessions: () => api.get(`${BASE}/academic/sessions`),
  createSession: (body) => api.post(`${BASE}/academic/sessions`, body),
  updateSession: (id, body) => api.patch(`${BASE}/academic/sessions/${id}`, body),
  archiveSession: (id) => api.post(`${BASE}/academic/sessions/${id}/archive`),
  listGrading: (programId) => api.get(`${BASE}/academic/grading`, { params: programId ? { programId } : {} }),
  createGrade: (body) => api.post(`${BASE}/academic/grading`, body),
  updateGrade: (id, body) => api.patch(`${BASE}/academic/grading/${id}`, body),
  deleteGrade: (id) => api.delete(`${BASE}/academic/grading/${id}`),
  listTerms: () => api.get(`${BASE}/academic/terms`),

  // LMS oversight
  lmsEnrollments: (params) => api.get(`${BASE}/lms/enrollments`, { params }),
  lmsCourses: (params) => api.get(`${BASE}/lms/courses`, { params }),
  lmsOfferings: (params) => api.get(`${BASE}/lms/offerings`, { params }),
  lmsAttendance: () => api.get(`${BASE}/lms/attendance/overview`),
  lmsResults: (params) => api.get(`${BASE}/lms/results`, { params }),
  lmsFeeOverview: () => api.get(`${BASE}/lms/fees/overview`),
  lmsFeeChallans: (params) => api.get(`${BASE}/lms/fees/challans`, { params }),
  lmsExams: (params) => api.get(`${BASE}/lms/exams`, { params }),
  lmsQuality: () => api.get(`${BASE}/lms/quality`),

  // System
  listConfig: () => api.get(`${BASE}/system/config`),
  setConfig: (body) => api.post(`${BASE}/system/config`, body),
  getPasswordPolicy: () => api.get(`${BASE}/system/password-policy`),
  updatePasswordPolicy: (body) => api.put(`${BASE}/system/password-policy`, body),
  listAnnouncements: () => api.get(`${BASE}/system/announcements`),
  createAnnouncement: (body) => api.post(`${BASE}/system/announcements`, body),
  updateAnnouncement: (id, body) => api.patch(`${BASE}/system/announcements/${id}`, body),
  deleteAnnouncement: (id) => api.delete(`${BASE}/system/announcements/${id}`),
  getMaintenance: () => api.get(`${BASE}/system/maintenance`),
  setMaintenance: (body) => api.put(`${BASE}/system/maintenance`, body),
  // Payment Gateway configuration (Phase 1 §5)
  getPaymentGateway: () => api.get(`${BASE}/system/payment-gateway`),
  updatePaymentGateway: (body) => api.put(`${BASE}/system/payment-gateway`, body),
  systemOverrideLogs: (params) => api.get(`${BASE}/system/override-logs`, { params }),

  // Reports & overrides
  reportSummary: () => api.get(`${BASE}/reports/summary`),
  listApplications: (params) => api.get(`${BASE}/reports/applications`, { params }),
  overrideApplication: (id, body) => api.post(`${BASE}/reports/override/application/${id}`, body),
  overrideResult: (id, body) => api.post(`${BASE}/reports/override/course-result/${id}`, body),
  overrideFee: (id, body) => api.post(`${BASE}/reports/override/fee-challan/${id}`, body),

  // ---- User management ENHANCEMENTS (bulk + lifecycle) ----
  bulkResetPassword: (system, ids) => api.post(`${BASE}/user-management/bulk/reset-password`, { system, ids }),
  bulkSetStatus: (system, ids, isActive, reason) => api.post(`${BASE}/user-management/bulk/status`, { system, ids, isActive, reason }),
  bulkNotify: (body) => api.post(`${BASE}/user-management/bulk/notify`, body),
  forceLogout: (system, id) => api.post(`${BASE}/user-management/${system}/${id}/force-logout`),
  transferResponsibilities: (body) => api.post(`${BASE}/user-management/transfer-responsibilities`, body),

  // ---- ADMISSIONS GOVERNANCE (Director + Coordinator effect) ----
  admApplications: (params) => api.get(`${BASE}/admissions/applications`, { params }),
  admApplication: (id) => api.get(`${BASE}/admissions/applications/${id}`),
  admDecision: (id, body) => api.post(`${BASE}/admissions/applications/${id}/decision`, body),
  admCandidateDocs: (userId) => api.get(`${BASE}/admissions/candidates/${userId}/documents`),
  admVerifyDoc: (id, body) => api.post(`${BASE}/admissions/documents/${id}/verify`, body),
  admMerit: (params) => api.get(`${BASE}/admissions/merit`, { params }),
  admStats: () => api.get(`${BASE}/admissions/stats`),
  admCycles: () => api.get(`${BASE}/admissions/cycles`),
  admUpdateCycle: (id, body) => api.patch(`${BASE}/admissions/cycles/${id}`, body),
  admToggleCycle: (id, isOpen) => api.post(`${BASE}/admissions/cycles/${id}/toggle`, { isOpen }),

  // ---- LMS ACADEMIC ACTIONS (Teacher + Course Coordinator effect) ----
  lmsRoster: (offeringId) => api.get(`${BASE}/lms/offerings/${offeringId}/roster`),
  lmsUpsertResult: (offeringId, body) => api.post(`${BASE}/lms/offerings/${offeringId}/results`, body),
  lmsPublishResult: (id) => api.post(`${BASE}/lms/results/${id}/publish`),
  lmsAttendanceSessions: (offeringId) => api.get(`${BASE}/lms/attendance/sessions`, { params: { offeringId } }),
  lmsMarkAttendance: (offeringId, body) => api.post(`${BASE}/lms/offerings/${offeringId}/attendance`, body),
  lmsAssignments: (offeringId) => api.get(`${BASE}/lms/assignments`, { params: offeringId ? { offeringId } : {} }),
  lmsCreateAssignment: (body) => api.post(`${BASE}/lms/assignments`, body),
  lmsUpdateAssignment: (id, body) => api.patch(`${BASE}/lms/assignments/${id}`, body),
  lmsMaterials: (offeringId) => api.get(`${BASE}/lms/materials`, { params: offeringId ? { offeringId } : {} }),
  lmsCreateMaterial: (body) => api.post(`${BASE}/lms/materials`, body),
  lmsDeleteMaterial: (id) => api.delete(`${BASE}/lms/materials/${id}`),
  lmsSections: (offeringId) => api.get(`${BASE}/lms/sections`, { params: offeringId ? { offeringId } : {} }),
  lmsCreateSection: (body) => api.post(`${BASE}/lms/sections`, body),
  lmsMoveStudent: (body) => api.post(`${BASE}/lms/sections/move-student`, body),
  lmsAssignTeacher: (offeringId, body) => api.post(`${BASE}/lms/offerings/${offeringId}/assign-teacher`, body),

  // ---- LMS GOVERNANCE (Focal + Exam + Provost + QEC effect) ----
  lmsSearchStudents: (params) => api.get(`${BASE}/lms/students/search`, { params }),
  lmsDropStudent: (id, reason) => api.post(`${BASE}/lms/students/${id}/drop`, { reason }),
  lmsRestoreStudent: (id, reason) => api.post(`${BASE}/lms/students/${id}/restore`, { reason }),
  lmsIssueFine: (id, body) => api.post(`${BASE}/lms/students/${id}/fine`, body),
  lmsBlockStudent: (id, reason) => api.post(`${BASE}/lms/students/${id}/block`, { reason }),
  lmsUnblockStudent: (id, note) => api.post(`${BASE}/lms/students/${id}/unblock`, { note }),
  lmsSetPromotion: (id, body) => api.post(`${BASE}/lms/students/${id}/promotion`, body),
  lmsAnnounceFee: (body) => api.post(`${BASE}/lms/fees/announce`, body),
  lmsReviewFee: (id, body) => api.post(`${BASE}/lms/fees/challans/${id}/review`, body),
  lmsSetExamAttendance: (examId, body) => api.post(`${BASE}/lms/exams/${examId}/attendance`, body),
  lmsRechecks: (params) => api.get(`${BASE}/lms/rechecks`, { params }),
  lmsUpdateRecheck: (id, body) => api.patch(`${BASE}/lms/rechecks/${id}`, body),
  lmsSurveys: () => api.get(`${BASE}/lms/surveys`),
  lmsToggleSurvey: (id, isActive) => api.patch(`${BASE}/lms/surveys/${id}/toggle`, { isActive }),
  lmsSurveyResults: (id) => api.get(`${BASE}/lms/surveys/${id}/results`),
};

// CSV exports are file downloads — build absolute URLs with auth header via fetch.
export async function downloadExport(path, filename) {
  const token = localStorage.getItem('token');
  const base = api.defaults.baseURL || '/api';
  const res = await fetch(`${base}${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default saApi;

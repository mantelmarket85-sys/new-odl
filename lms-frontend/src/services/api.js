// ============================================================
//  LMS ACADEMIC API CLIENT
//  ------------------------------------------------------------
//  Central fetch wrapper + typed helpers for the LMS academic-core
//  backend (/api/lms/academic/*). Reuses the same API base + token
//  resolution as authService so there is a single source of truth.
//
//  All methods return parsed JSON (or throw an Error with .status).
//  On 401 the session is cleared and the user is redirected to login.
// ============================================================
import authService, { API_BASE } from './authService';

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const token = authService.getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (isForm) {
    payload = body; // FormData — let the browser set Content-Type
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!res.ok) {
    if (res.status === 401) {
      // Session expired — clear and bounce to login.
      authService.logout(true);
    }
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const get = (p) => request(p);
const post = (p, body) => request(p, { method: 'POST', body });
const put = (p, body) => request(p, { method: 'PUT', body });
const del = (p) => request(p, { method: 'DELETE' });
const postForm = (p, formData) => request(p, { method: 'POST', body: formData, isForm: true });

/**
 * Download a file/CSV from an authenticated endpoint. Fetches as a blob
 * (adding the bearer token) and triggers a browser download.
 */
async function download(path, filename = 'download') {
  const token = authService.getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    if (res.status === 401) authService.logout(true);
    const err = new Error(`Download failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// Resolve an uploaded file path (e.g. "/uploads/..") to an absolute URL.
function fileUrl(relPath) {
  if (!relPath) return null;
  if (/^https?:\/\//.test(relPath)) return relPath;
  const origin = API_BASE.replace(/\/api$/, '');
  return `${origin}${relPath.startsWith('/') ? '' : '/'}${relPath}`;
}

// ============================================================
// ACADEMIC STRUCTURE (shared)
// ============================================================
const structure = {
  terms: () => get('/lms/academic/terms'),
  currentTerm: () => get('/lms/academic/terms/current'),
  programs: () => get('/lms/academic/programs'),
  program: (id) => get(`/lms/academic/programs/${id}`),
  programSemesters: (programId) => get(`/lms/academic/programs/${programId}/semesters`),
  courses: (params = '') => get(`/lms/academic/courses${params}`),
  offerings: (params = '') => get(`/lms/academic/offerings${params}`),
  offering: (id) => get(`/lms/academic/offerings/${id}`),
  offeringSections: (offeringId) => get(`/lms/academic/offerings/${offeringId}/sections`),
  updateSection: (id, body) => put(`/lms/academic/sections/${id}`, body),
  deleteSection: (id) => del(`/lms/academic/sections/${id}`),
};

// ============================================================
// STUDENT MODULE
// ============================================================
const student = {
  dashboard: () => get('/lms/academic/student/dashboard'),
  availableOfferings: () => get('/lms/academic/student/offerings/available'),
  registrations: () => get('/lms/academic/student/registrations'),
  register: (offeringId, sectionId, registrationType) =>
    post('/lms/academic/student/register', { offeringId, sectionId, registrationType }),
  withdraw: (registrationId) => put(`/lms/academic/student/registrations/${registrationId}/withdraw`),
  // Client requirement 4.1 — read the Focal-set withdrawal deadline (real-time).
  withdrawDeadline: () => get('/lms/academic/student/withdraw-deadline'),
  // Req 3.5 — auto-enroll into 1st-semester Scheme of Study courses (idempotent).
  autoEnroll: () => post('/lms/academic/student/auto-enroll', {}),
  courses: () => get('/lms/academic/student/courses'),
  course: (offeringId) => get(`/lms/academic/student/courses/${offeringId}`),
  attendance: () => get('/lms/academic/student/attendance'),
  courseAttendance: (offeringId) => get(`/lms/academic/student/courses/${offeringId}/attendance`),
  markLectureWatched: (offeringId, lectureKey) => post(`/lms/academic/student/attendance/recorded/${offeringId}/watch`, { lectureKey }),
  // Point 6 — report real watch progress; backend auto-marks attendance at >=70%.
  reportLectureProgress: (offeringId, lectureKey, watchedSeconds, durationSeconds) =>
    post(`/lms/academic/student/attendance/recorded/${offeringId}/progress`, { lectureKey, watchedSeconds, durationSeconds }),
  assignments: () => get('/lms/academic/student/assignments'),
  assignment: (id) => get(`/lms/academic/student/assignments/${id}`),
  submitAssignment: (id, formData) => postForm(`/lms/academic/student/assignments/${id}/submit`, formData),
  quizzes: () => get('/lms/academic/student/quizzes'),
  startQuiz: (id) => post(`/lms/academic/student/quizzes/${id}/start`),
  submitQuiz: (id, answers) => post(`/lms/academic/student/quizzes/${id}/submit`, { answers }),
  results: () => get('/lms/academic/student/results'),
  // Task 4 — auto-generated results table for ALL enrolled courses
  // (weightage-driven, zero-state before publish).
  resultsAll: () => get('/lms/academic/student/results/all'),
  courseGradebook: (offeringId) => get(`/lms/academic/student/courses/${offeringId}/gradebook`),
  transcript: () => get('/lms/academic/student/transcript'),
  // Req 3.2 — Lab Tasks (view lab tasks per lab course, submit lab work, view grade)
  labTasks: () => get('/lms/academic/student/lab-tasks'),
  labTask: (id) => get(`/lms/academic/student/lab-tasks/${id}`),
  submitLabTask: (id, formData) => postForm(`/lms/academic/student/lab-tasks/${id}/submit`, formData),
  // Req 3.4 — Download (instead of Print) across the Results module
  downloadTranscript: (filename = 'transcript.pdf') => download('/lms/academic/student/transcript/download', filename),
  downloadResults: (filename = 'results-cumulative.pdf') => download('/lms/academic/student/results/download', filename),
  downloadTermResult: (termCode, filename) => download(`/lms/academic/student/results/download/term/${encodeURIComponent(termCode)}`, filename || `result-${termCode}.pdf`),
  // Profile (synchronized with the Admissions System)
  profile: () => get('/lms/academic/student/profile'),
  syncProfile: () => get('/lms/academic/student/profile/sync'),
  updateProfile: (body) => put('/lms/academic/student/profile', body),
  uploadProfilePhoto: (formData) => postForm('/lms/academic/student/profile/photo', formData),
  submitDocument: (formData) => postForm('/lms/academic/student/profile/documents', formData),
  // Communication & content
  announcements: () => get('/lms/academic/student/announcements'),
  viewAnnouncement: (id) => post(`/lms/academic/student/announcements/${id}/view`, {}),
  schedule: () => get('/lms/academic/student/schedule'),
  liveClasses: () => get('/lms/academic/student/live-classes'),
  joinLiveClass: (id) => get(`/lms/academic/student/live-classes/${id}/join`),
  leaveLiveClass: (id, attendanceId) => post(`/lms/academic/student/live-classes/${id}/leave`, { attendanceId }),
  liveClassRecordings: (id) => get(`/lms/academic/student/live-classes/${id}/recordings`),
  recordedLectures: () => get('/lms/academic/student/recorded-lectures'),
  materials: () => get('/lms/academic/student/materials'),
  // Course Library — enrolled-course cards + per-course resources
  library: () => get('/lms/academic/student/library'),
  libraryCourse: (offeringId) => get(`/lms/academic/student/library/${offeringId}`),
  scheme: () => get('/lms/academic/student/scheme'),
  // Notes (CRUD)
  notes: () => get('/lms/academic/student/notes'),
  createNote: (body) => post('/lms/academic/student/notes', body),
  updateNote: (id, body) => put(`/lms/academic/student/notes/${id}`, body),
  deleteNote: (id) => del(`/lms/academic/student/notes/${id}`),
  // Support & Grievances (formerly Appeals) — existing methods preserved.
  appeals: () => get('/lms/academic/student/appeals'),
  appealRecipients: () => get('/lms/academic/student/appeals/recipients'),
  createAppeal: (formData) => postForm('/lms/academic/student/appeals', formData),
  // New Support & Grievances portal methods (additive).
  grievanceCategories: () => get('/lms/academic/student/appeals/categories'),
  grievanceStats: () => get('/lms/academic/student/appeals/stats'),
  grievanceCase: (id) => get(`/lms/academic/student/appeals/${id}`),
  grievanceReply: (id, formData) => postForm(`/lms/academic/student/appeals/${id}/reply`, formData),
  grievanceReopen: (id, body = {}) => post(`/lms/academic/student/appeals/${id}/reopen`, body),
  grievanceFeedback: (id, body) => post(`/lms/academic/student/appeals/${id}/feedback`, body),
  // Surveys
  surveys: () => get('/lms/academic/student/surveys'),
  submitSurvey: (id, answers) => post(`/lms/academic/student/surveys/${id}/submit`, { answers }),
  // Fees / account
  fees: () => get('/lms/academic/student/fees'),
  payFee: (id, body = {}) => post(`/lms/academic/student/fees/${id}/pay`, body),
  // Notifications
  notifications: () => get('/lms/academic/student/notifications'),
  readNotification: (id) => put(`/lms/academic/student/notifications/${id}/read`),
  readAllNotifications: () => put('/lms/academic/student/notifications/read-all'),
  // Settings
  settings: () => get('/lms/academic/student/settings'),
  updateSettings: (body) => put('/lms/academic/student/settings', body),
  // Account security — change own password (new password active immediately)
  changePassword: (currentPassword, newPassword) => put('/lms/academic/student/me/password', { currentPassword, newPassword }),
  // AI Tutor (self-hosted)
  aiTutorChat: (body) => post('/lms/academic/student/ai-tutor/chat', body),
  aiTutorHistory: () => get('/lms/academic/student/ai-tutor/history'),
  // Course access logging (Requirement #7)
  logCourseAccess: (offeringId) => post(`/lms/academic/student/courses/${offeringId}/access`, {}),
  // Activity, badges, insights
  activity: (params = '') => get(`/lms/academic/student/activity${params}`),
  logLogout: () => post('/lms/academic/student/logout-activity', {}),
  badges: () => get('/lms/academic/student/badges'),
  insights: () => get('/lms/academic/student/insights'),
  // Messages
  eventsUrl: () => `${API_BASE}/lms/academic/student/events?token=${encodeURIComponent(authService.getToken() || '')}`,
  messageContacts: () => get('/lms/academic/student/messages/contacts'),
  conversation: (userId) => get(`/lms/academic/student/messages/${userId}`),
  sendMessage: (userId, payload) => post(`/lms/academic/student/messages/${userId}`, typeof payload === 'string' ? { body: payload } : payload),
  groupConversation: (groupId) => get(`/lms/academic/student/messages/group/${groupId}`),
  sendGroupMessage: (groupId, payload) => post(`/lms/academic/student/messages/group/${groupId}`, payload),
  uploadMessageAttachment: (formData) => postForm('/lms/academic/student/messages/attachment', formData),
};

// ============================================================
// TEACHER MODULE
// ============================================================
const teacher = {
  dashboard: () => get('/lms/academic/teacher/dashboard'),
  // Real-time SSE stream (assignment stats, messages, profile sync, …).
  // EventSource cannot set Authorization headers, so the token is passed
  // as a query param and verified server-side.
  eventsUrl: () => `${API_BASE}/lms/academic/teacher/events?token=${encodeURIComponent(authService.getToken() || '')}`,
  offerings: (params = '') => get(`/lms/academic/teacher/offerings${params}`),
  offering: (id) => get(`/lms/academic/teacher/offerings/${id}`),
  students: (offeringId) => get(`/lms/academic/teacher/offerings/${offeringId}/students`),
  // Attendance
  sessions: (offeringId) => get(`/lms/academic/teacher/offerings/${offeringId}/attendance/sessions`),
  createSession: (offeringId, body) => post(`/lms/academic/teacher/offerings/${offeringId}/attendance/sessions`, body),
  session: (sessionId) => get(`/lms/academic/teacher/attendance/sessions/${sessionId}`),
  markAttendance: (sessionId, records) => post(`/lms/academic/teacher/attendance/sessions/${sessionId}/mark`, { records }),
  attendanceSummary: (offeringId) => get(`/lms/academic/teacher/offerings/${offeringId}/attendance/summary`),
  // Assignments
  assignments: (offeringId) => get(`/lms/academic/teacher/offerings/${offeringId}/assignments`),
  createAssignment: (offeringId, body) => post(`/lms/academic/teacher/offerings/${offeringId}/assignments`, body),
  updateAssignment: (assignmentId, body) => put(`/lms/academic/teacher/assignments/${assignmentId}`, body),
  deleteAssignment: (assignmentId) => del(`/lms/academic/teacher/assignments/${assignmentId}`),
  submissions: (assignmentId) => get(`/lms/academic/teacher/assignments/${assignmentId}/submissions`),
  gradeSubmission: (submissionId, body) => put(`/lms/academic/teacher/submissions/${submissionId}/grade`, body),
  // Assignment questions (MCQ / SHORT / DESCRIPTIVE) + AI generator
  assignmentQuestions: (assignmentId) => get(`/lms/academic/teacher/assignments/${assignmentId}/questions`),
  addAssignmentQuestion: (assignmentId, body) => post(`/lms/academic/teacher/assignments/${assignmentId}/questions`, body),
  deleteAssignmentQuestion: (questionId) => del(`/lms/academic/teacher/assignment-questions/${questionId}`),
  aiGenerateAssignment: (assignmentId, body) => post(`/lms/academic/teacher/assignments/${assignmentId}/ai-generate`, body),
  // Quizzes
  quizzes: (offeringId) => get(`/lms/academic/teacher/offerings/${offeringId}/quizzes`),
  createQuiz: (offeringId, body) => post(`/lms/academic/teacher/offerings/${offeringId}/quizzes`, body),
  quiz: (quizId) => get(`/lms/academic/teacher/quizzes/${quizId}`),
  addQuestion: (quizId, body) => post(`/lms/academic/teacher/quizzes/${quizId}/questions`, body),
  deleteQuestion: (questionId) => del(`/lms/academic/teacher/quiz-questions/${questionId}`),
  publishQuiz: (quizId, isPublished) => put(`/lms/academic/teacher/quizzes/${quizId}/publish`, { isPublished }),
  quizAttempts: (quizId) => get(`/lms/academic/teacher/quizzes/${quizId}/attempts`),
  gradeAttempt: (attemptId, score) => put(`/lms/academic/teacher/quiz-attempts/${attemptId}/grade`, { score }),
  aiGenerateQuiz: (quizId, body) => post(`/lms/academic/teacher/quizzes/${quizId}/ai-generate`, body),
  // Gradebook + Results
  gradebook: (offeringId) => get(`/lms/academic/teacher/offerings/${offeringId}/gradebook`),
  saveResults: (offeringId, results) => post(`/lms/academic/teacher/offerings/${offeringId}/results`, { results }),
  publishResults: (offeringId) => put(`/lms/academic/teacher/offerings/${offeringId}/results/publish`),
  // Marks — real-time per-student CRUD
  saveStudentMarks: (offeringId, studentId, body) => put(`/lms/academic/teacher/offerings/${offeringId}/marks/${studentId}`, body),
  deleteStudentMarks: (offeringId, studentId) => del(`/lms/academic/teacher/offerings/${offeringId}/marks/${studentId}`),
  // ---- Lab Tasks (Lab Management — Req 1.2) ----
  // Cross-offering list for the Lab Tasks module (only lab courses).
  allLabTasks: () => get('/lms/academic/teacher/lab-tasks'),
  labTasks: (offeringId) => get(`/lms/academic/teacher/offerings/${offeringId}/lab-tasks`),
  createLabTask: (offeringId, formData) => postForm(`/lms/academic/teacher/offerings/${offeringId}/lab-tasks`, formData),
  updateLabTask: (labTaskId, formData) => request(`/lms/academic/teacher/lab-tasks/${labTaskId}`, { method: 'PUT', body: formData, isForm: true }),
  deleteLabTask: (labTaskId) => del(`/lms/academic/teacher/lab-tasks/${labTaskId}`),
  labTaskSubmissions: (labTaskId) => get(`/lms/academic/teacher/lab-tasks/${labTaskId}/submissions`),
  saveLabTaskMarks: (labTaskId, studentId, body) => put(`/lms/academic/teacher/lab-tasks/${labTaskId}/marks/${studentId}`, body),
  gradeLabSubmission: (submissionId, body) => put(`/lms/academic/teacher/lab-submissions/${submissionId}/grade`, body),
  // Student exports (Excel / PDF) — params is a query string e.g. "?section=A"
  exportStudentsExcel: (offeringId, params = '', filename = 'students.xlsx') => download(`/lms/academic/teacher/offerings/${offeringId}/students/export/excel${params}`, filename),
  exportStudentsPdf: (offeringId, params = '', filename = 'students.pdf') => download(`/lms/academic/teacher/offerings/${offeringId}/students/export/pdf${params}`, filename),
  exportAllStudentsExcel: (params = '', filename = 'all-students.xlsx') => download(`/lms/academic/teacher/students/export/excel${params}`, filename),
  // Materials
  materials: (offeringId) => get(`/lms/academic/teacher/offerings/${offeringId}/materials`),
  createMaterial: (offeringId, formData) => postForm(`/lms/academic/teacher/offerings/${offeringId}/materials`, formData),
  deleteMaterial: (materialId) => del(`/lms/academic/teacher/materials/${materialId}`),
  // Announcements
  announcements: (offeringId) => get(`/lms/academic/teacher/offerings/${offeringId}/announcements`),
  createAnnouncement: (offeringId, body) => post(`/lms/academic/teacher/offerings/${offeringId}/announcements`, body),
  // ---- Phase 2 aggregate (cross-offering) views ----
  history: () => get('/lms/academic/teacher/history'),
  lectures: () => get('/lms/academic/teacher/lectures'),
  createLecture: (formData) => postForm('/lms/academic/teacher/lectures', formData),
  updateLecture: (id, formData) => request(`/lms/academic/teacher/lectures/${id}`, { method: 'PUT', body: formData, isForm: true }),
  deleteLecture: (id) => del(`/lms/academic/teacher/lectures/${id}`),
  library: () => get('/lms/academic/teacher/library'),
  createLibraryResource: (formData) => postForm('/lms/academic/teacher/library', formData),
  updateLibraryResource: (id, formData) => request(`/lms/academic/teacher/library/${id}`, { method: 'PUT', body: formData, isForm: true }),
  deleteLibraryResource: (id) => del(`/lms/academic/teacher/library/${id}`),
  liveClasses: () => get('/lms/academic/teacher/live-classes'),
  createLiveClass: (body) => post('/lms/academic/teacher/live-classes', body),
  updateLiveClass: (id, body) => put(`/lms/academic/teacher/live-classes/${id}`, body),
  deleteLiveClass: (id) => del(`/lms/academic/teacher/live-classes/${id}`),
  rescheduleLiveClass: (id, body) => put(`/lms/academic/teacher/live-classes/${id}/reschedule`, body),
  joinLiveClass: (id) => get(`/lms/academic/teacher/live-classes/${id}/join`),
  endLiveClass: (id) => put(`/lms/academic/teacher/live-classes/${id}/end`),
  appeals: () => get('/lms/academic/teacher/appeals'),
  updateAppeal: (id, body) => put(`/lms/academic/teacher/appeals/${id}`, body),
  allAssignments: () => get('/lms/academic/teacher/assignments'),
  allQuizzes: () => get('/lms/academic/teacher/quizzes'),
  messageContacts: () => get('/lms/academic/teacher/messages/contacts'),
  conversation: (userId) => get(`/lms/academic/teacher/messages/${userId}`),
  sendMessage: (userId, payload) => post(`/lms/academic/teacher/messages/${userId}`, typeof payload === 'string' ? { body: payload } : payload),
  groupConversation: (groupId) => get(`/lms/academic/teacher/messages/group/${groupId}`),
  sendGroupMessage: (groupId, payload) => post(`/lms/academic/teacher/messages/group/${groupId}`, payload),
  uploadMessageAttachment: (formData) => postForm('/lms/academic/teacher/messages/attachment', formData),
  profile: () => get('/lms/academic/teacher/profile'),
  updateProfile: (body) => put('/lms/academic/teacher/profile', body),
  uploadProfilePhoto: (formData) => postForm('/lms/academic/teacher/profile/photo', formData),
  settings: () => get('/lms/academic/teacher/settings'),
  updateSettings: (body) => put('/lms/academic/teacher/settings', body),
  // Account security — change own password (new password active immediately)
  changePassword: (currentPassword, newPassword) => put('/lms/academic/teacher/me/password', { currentPassword, newPassword }),
};

// ============================================================
// COURSE COORDINATOR MODULE  (/admin)
// ============================================================
const coordinator = {
  dashboard: () => get('/lms/academic/coordinator/dashboard'),
  // Course management
  planning: (programId) => get(`/lms/academic/coordinator/planning${programId ? `?programId=${programId}` : ''}`),
  curriculum: () => get('/lms/academic/coordinator/curriculum'),
  allocation: (termId) => get(`/lms/academic/coordinator/allocation${termId ? `?termId=${termId}` : ''}`),
  // Unified semester-wise Student Allocation & Section Management
  semesterAllocation: (params = '') => get(`/lms/academic/coordinator/semester-allocation${params}`),
  autoAllocateSemester: (body) => post('/lms/academic/coordinator/semester-allocation/auto', body),
  // Section management (roster / auto-create / drag&drop transfer)
  offeringRoster: (offeringId) => get(`/lms/academic/coordinator/offerings/${offeringId}/roster`),
  autoCreateSections: (offeringId, capacity) => post(`/lms/academic/coordinator/offerings/${offeringId}/sections/auto`, { capacity }),
  transferStudentSection: (registrationId, sectionId) => put(`/lms/academic/coordinator/registrations/${registrationId}/section`, { sectionId }),
  // Weekly schedule / timetable
  schedule: (termId) => get(`/lms/academic/coordinator/schedule${termId ? `?termId=${termId}` : ''}`),
  scheduleClashCheck: (body) => post('/lms/academic/coordinator/schedule/clash-check', body),
  createSlot: (body) => post('/lms/academic/coordinator/schedule', body),
  updateSlot: (id, body) => put(`/lms/academic/coordinator/schedule/${id}`, body),
  deleteSlot: (id) => del(`/lms/academic/coordinator/schedule/${id}`),
  autoGenerateSchedule: (body) => post('/lms/academic/coordinator/schedule/auto-generate', body),
  // Weightage module (Req 3) — assessment weightage per course, filtered by program+semester
  weightageCourses: (programId, semesterId) => get(`/lms/academic/coordinator/weightage/courses${programId ? `?programId=${programId}` : ''}${semesterId ? `${programId ? '&' : '?'}semesterId=${semesterId}` : ''}`),
  weightage: (courseId) => get(`/lms/academic/coordinator/weightage/${courseId}`),
  saveWeightage: (courseId, body) => put(`/lms/academic/coordinator/weightage/${courseId}`, body),
  // Teacher management
  teachers: () => get('/lms/academic/coordinator/teachers'),
  assignTeacher: (offeringId, teacherId) => put(`/lms/academic/coordinator/offerings/${offeringId}/assign-teacher`, { teacherId }),
  replaceTeacher: (body) => post('/lms/academic/coordinator/teachers/replace', body),
  teacherOfferings: (teacherId, sessionId) => get(`/lms/academic/coordinator/teachers/${teacherId}/offerings${sessionId ? `?sessionId=${sessionId}` : ''}`),
  workload: () => get('/lms/academic/coordinator/workload'),
  // Course Distribution (cascading dropdowns + assign teacher)
  distributionOptions: () => get('/lms/academic/coordinator/distribution/options'),
  distributionCourses: (programId, semesterId) => get(`/lms/academic/coordinator/distribution/courses?programId=${programId}${semesterId ? `&semesterId=${semesterId}` : ''}`),
  distributions: (params = '') => get(`/lms/academic/coordinator/distribution${params}`),
  createDistribution: (body) => post('/lms/academic/coordinator/distribution', body),
  // §3.2 — New Distribution: create many manually-entered courses (each with
  // its own teacher / semester / batch) in a single call.
  createDistributionBatch: (body) => post('/lms/academic/coordinator/distribution/batch', body),
  updateDistribution: (offeringId, body) => put(`/lms/academic/coordinator/distribution/${offeringId}`, body),
  assignDistributionTeacher: (offeringId, teacherId) => put(`/lms/academic/coordinator/distribution/${offeringId}/assign`, { teacherId }),
  deleteDistribution: (offeringId, force = false) => del(`/lms/academic/coordinator/distribution/${offeringId}${force ? '?force=true' : ''}`),
  // Course Instructor management (Add/Edit/Delete/View profiles + assignments)
  instructors: (params = '') => get(`/lms/academic/coordinator/instructors${params}`),
  instructor: (id) => get(`/lms/academic/coordinator/instructors/${id}`),
  createInstructor: (body) => post('/lms/academic/coordinator/instructors', body),
  updateInstructor: (id, body) => put(`/lms/academic/coordinator/instructors/${id}`, body),
  uploadInstructorPhoto: (id, formData) => postForm(`/lms/academic/coordinator/instructors/${id}/photo`, formData),
  deleteInstructor: (id, hard = false) => del(`/lms/academic/coordinator/instructors/${id}${hard ? '?hard=true' : ''}`),
  // Monitoring
  monitorAttendance: () => get('/lms/academic/coordinator/monitoring/attendance'),
  monitorAssessments: () => get('/lms/academic/coordinator/monitoring/assessments'),
  monitorResults: () => get('/lms/academic/coordinator/monitoring/results'),
  monitorProgress: () => get('/lms/academic/coordinator/monitoring/progress'),
  monitorClasses: () => get('/lms/academic/coordinator/monitoring/classes'),
  // Live class scheduling (coordinator OWNS the live-class timetable — req 2.1)
  liveClassOfferings: () => get('/lms/academic/coordinator/live-classes/offerings'),
  createLiveClass: (body) => post('/lms/academic/coordinator/live-classes', body),
  updateLiveClass: (id, body) => put(`/lms/academic/coordinator/live-classes/${id}`, body),
  deleteLiveClass: (id) => del(`/lms/academic/coordinator/live-classes/${id}`),
  // Results
  offeringResults: (offeringId) => get(`/lms/academic/coordinator/offerings/${offeringId}/results`),
  approveResults: (offeringId) => post(`/lms/academic/coordinator/offerings/${offeringId}/results/approve`),
  // Approvals
  approvals: (params = '') => get(`/lms/academic/coordinator/approvals${params}`),
  approval: (id) => get(`/lms/academic/coordinator/approvals/${id}`),
  createApproval: (body) => post('/lms/academic/coordinator/approvals', body),
  decideApproval: (id, body) => put(`/lms/academic/coordinator/approvals/${id}/decide`, body),
  // Escalations
  escalations: (params = '') => get(`/lms/academic/coordinator/escalations${params}`),
  escalation: (id) => get(`/lms/academic/coordinator/escalations/${id}`),
  createEscalation: (body) => post('/lms/academic/coordinator/escalations', body),
  escalationAction: (id, body) => put(`/lms/academic/coordinator/escalations/${id}/action`, body),
  // Communication
  announcements: () => get('/lms/academic/coordinator/announcements'),
  createAnnouncement: (body) => post('/lms/academic/coordinator/announcements', body),
  deleteAnnouncement: (id) => del(`/lms/academic/coordinator/announcements/${id}`),
  messageContacts: () => get('/lms/academic/coordinator/messages/contacts'),
  conversation: (userId) => get(`/lms/academic/coordinator/messages/${userId}`),
  sendMessage: (userId, body) => post(`/lms/academic/coordinator/messages/${userId}`, { body }),
  // Reports & analytics
  report: (kind) => get(`/lms/academic/coordinator/reports/${kind}`),
  analytics: () => get('/lms/academic/coordinator/analytics'),
  // Audit
  audit: (params = '') => get(`/lms/academic/coordinator/audit${params}`),
  // Notifications
  notifications: () => get('/lms/academic/coordinator/notifications'),
  readNotification: (id) => put(`/lms/academic/coordinator/notifications/${id}/read`),
  readAllNotifications: () => put('/lms/academic/coordinator/notifications/read-all'),
  // Students
  students: (params = '') => get(`/lms/academic/coordinator/students${params}`),
  // Account & profile (Settings module — proper authenticated flow)
  myProfile: () => get('/lms/academic/coordinator/me/profile'),
  updateMyProfile: (body) => put('/lms/academic/coordinator/me/profile', body),
  uploadMyPhoto: (formData) => postForm('/lms/academic/coordinator/me/photo', formData),
  changePassword: (currentPassword, newPassword) => put('/lms/academic/coordinator/me/password', { currentPassword, newPassword }),
  // Department-scoped programs (ADCS module)
  scopedPrograms: () => get('/lms/academic/coordinator/programs'),
  // Shared structure helpers (catalog CRUD live in structure routes)
  createTerm: (body) => post('/lms/academic/terms', body),
  setCurrentTerm: (id) => put(`/lms/academic/terms/${id}/set-current`),
  createProgram: (body) => post('/lms/academic/programs', body),
  updateProgram: (id, body) => put(`/lms/academic/programs/${id}`, body),
  deleteProgram: (id) => del(`/lms/academic/programs/${id}`),
  program: (id) => get(`/lms/academic/programs/${id}`),
  createCourse: (body) => post('/lms/academic/courses', body),
  createCoursesBulk: (body) => post('/lms/academic/courses/bulk', body),
  updateCourse: (id, body) => put(`/lms/academic/courses/${id}`, body),
  deleteCourse: (id) => del(`/lms/academic/courses/${id}`),
  createOffering: (body) => post('/lms/academic/offerings', body),
  updateOffering: (id, body) => put(`/lms/academic/offerings/${id}`, body),
  createSection: (offeringId, body) => post(`/lms/academic/offerings/${offeringId}/sections`, body),

  // ========================================================
  // PHASE 5 — COORDINATOR PLUS (real-data modules)
  // Mounted at /lms/academic/coordinator via coordinatorPlus.js
  // ========================================================

  // ---- Real-time (SSE) ----
  // EventSource cannot set Authorization headers, so the token is
  // passed as a query param and verified server-side.
  eventsUrl: () => `${API_BASE}/lms/academic/coordinator/events?token=${encodeURIComponent(authService.getToken() || '')}`,

  // ---- Teacher Replacement ----
  replacements: (params = '') => get(`/lms/academic/coordinator/replacements${params}`),
  createReplacement: (body) => post('/lms/academic/coordinator/replacements', body),
  updateReplacement: (id, body) => put(`/lms/academic/coordinator/replacements/${id}`, body),
  decideReplacement: (id, body) => put(`/lms/academic/coordinator/replacements/${id}/decide`, body),
  deleteReplacement: (id) => del(`/lms/academic/coordinator/replacements/${id}`),
  checkReplacementConflict: (body) => post('/lms/academic/coordinator/replacements/check-conflict', body),

  // ---- Students (rich search / filters / tabs / profile / transfer) ----
  studentsList: (params = '') => get(`/lms/academic/coordinator/students-list${params}`),
  studentsFilters: () => get('/lms/academic/coordinator/students-filters'),
  studentsCounts: (params = '') => get(`/lms/academic/coordinator/students-counts${params}`),
  studentProfile: (id) => get(`/lms/academic/coordinator/students/${id}/profile`),
  transferStudent: (id, body) => put(`/lms/academic/coordinator/students/${id}/transfer`, body),

  // ---- Enrollment ----
  enrollmentRequests: (params = '') => get(`/lms/academic/coordinator/enrollment/requests${params}`),
  decideEnrollment: (id, body) => put(`/lms/academic/coordinator/enrollment/requests/${id}/decide`, body),
  enrollmentStats: () => get('/lms/academic/coordinator/enrollment/statistics'),

  // ---- Cross-department Instructor Loan workflow (Req 4) ----
  loanDepartments: () => get('/lms/academic/coordinator/instructor-loans/departments'),
  loanDepartmentInstructors: (department) => get(`/lms/academic/coordinator/instructor-loans/department-instructors?department=${encodeURIComponent(department)}`),
  instructorLoans: (params = '') => get(`/lms/academic/coordinator/instructor-loans${params}`),
  createInstructorLoan: (body) => post('/lms/academic/coordinator/instructor-loans', body),
  approveInstructorLoan: (id, body) => put(`/lms/academic/coordinator/instructor-loans/${id}/approve`, body),
  rejectInstructorLoan: (id, body) => put(`/lms/academic/coordinator/instructor-loans/${id}/reject`, body),
  cancelInstructorLoan: (id) => del(`/lms/academic/coordinator/instructor-loans/${id}`),

  // ---- Appeals (StudentAppeal) ----
  studentAppeals: (params = '') => get(`/lms/academic/coordinator/student-appeals${params}`),
  decideAppeal: (id, body) => put(`/lms/academic/coordinator/student-appeals/${id}/decide`, body),
  appealCounts: () => get('/lms/academic/coordinator/student-appeals/counts'),

  // ---- Announcements (edit / publish / real-time) ----
  updateAnnouncement: (id, body) => put(`/lms/academic/coordinator/announcements/${id}`, body),
  publishAnnouncement: (id) => post(`/lms/academic/coordinator/announcements/${id}/publish`),

  // ---- Quick Messages (unread / send / read receipts) ----
  messagesUnread: () => get('/lms/academic/coordinator/messages-unread'),
  sendQuickMessage: (userId, body) => post(`/lms/academic/coordinator/messages-send/${userId}`, { body }),
  markMessagesRead: (userId) => put(`/lms/academic/coordinator/messages-read/${userId}`),

  // ---- Scheme of Study (drag & drop builder + version history) ----
  schemes: (params = '') => get(`/lms/academic/coordinator/schemes${params}`),
  scheme: (id) => get(`/lms/academic/coordinator/schemes/${id}`),
  schemeHistory: (id) => get(`/lms/academic/coordinator/schemes/${id}/history`),
  createScheme: (body) => post('/lms/academic/coordinator/schemes', body),
  updateScheme: (id, body) => put(`/lms/academic/coordinator/schemes/${id}`, body),
  deleteScheme: (id) => del(`/lms/academic/coordinator/schemes/${id}`),
  addSchemeItem: (id, body) => post(`/lms/academic/coordinator/schemes/${id}/items`, body),
  moveSchemeItem: (id, itemId, body) => put(`/lms/academic/coordinator/schemes/${id}/items/${itemId}/move`, body),
  reorderScheme: (id, body) => put(`/lms/academic/coordinator/schemes/${id}/reorder`, body),
  removeSchemeItem: (id, itemId) => del(`/lms/academic/coordinator/schemes/${id}/items/${itemId}`),
};

// ============================================================
// FOCAL PERSON MODULE  (/focal)  — Phase 4
// ============================================================
const focal = {
  dashboard: () => get('/lms/academic/focal/dashboard'),
  // Real-time SSE stream — lets the Focal Person receive live lab-task and
  // assessment activity (Req 2). Token passed as query param (EventSource).
  eventsUrl: () => `${API_BASE}/lms/academic/focal/events?token=${encodeURIComponent(authService.getToken() || '')}`,
  // Department monitoring
  monitorProgress: () => get('/lms/academic/focal/monitoring/progress'),
  monitorAcademic: () => get('/lms/academic/focal/monitoring/academic'),
  monitorResources: () => get('/lms/academic/focal/monitoring/resources'),
  monitorFaculty: () => get('/lms/academic/focal/monitoring/faculty'),
  // Student affairs
  studentCases: (params = '') => get(`/lms/academic/focal/student-affairs/cases${params}`),
  studentRequests: (params = '') => get(`/lms/academic/focal/student-affairs/requests${params}`),
  decideRequest: (id, body) => put(`/lms/academic/focal/student-affairs/requests/${id}/decide`, body),
  complaints: (params = '') => get(`/lms/academic/focal/student-affairs/complaints${params}`),
  // Escalations / matrix
  escalationMatrix: () => get('/lms/academic/focal/escalation-matrix'),
  escalations: (params = '') => get(`/lms/academic/focal/escalations${params}`),
  escalation: (id) => get(`/lms/academic/focal/escalations/${id}`),
  createEscalation: (body) => post('/lms/academic/focal/escalations', body),
  escalationAction: (id, body) => put(`/lms/academic/focal/escalations/${id}/action`, body),
  // Faculty coordination
  facultyPerformance: () => get('/lms/academic/focal/faculty/performance'),
  facultyIssues: (params = '') => get(`/lms/academic/focal/faculty/issues${params}`),
  facultyWorkload: () => get('/lms/academic/focal/faculty/workload'),
  // Enrollment lifecycle
  enrollments: () => get('/lms/academic/focal/enrollments'),
  enrollmentAction: (id, body) => put(`/lms/academic/focal/enrollments/${id}/action`, body),
  promotions: () => get('/lms/academic/focal/promotions'),
  retakes: () => get('/lms/academic/focal/retakes'),
  withdraws: () => get('/lms/academic/focal/withdraws'),
  restoreWithdraw: (id) => put(`/lms/academic/focal/withdraws/${id}/restore`),
  // Client requirement 4.1 — withdrawal deadline control (Focal Person).
  getWithdrawDeadline: () => get('/lms/academic/focal/withdraw-deadline'),
  setWithdrawDeadline: (deadline) => put('/lms/academic/focal/withdraw-deadline', { deadline }),
  restoreStudent: (id) => put(`/lms/academic/focal/students/${id}/restore`),
  droppedStudents: () => get('/lms/academic/focal/dropped-students'),
  // Students directory
  students: (params = '') => get(`/lms/academic/focal/students${params}`),
  student: (id) => get(`/lms/academic/focal/students/${id}`),
  // §4.2 — full student directory + filter options for the Discipline "New Case" search.
  studentSearch: () => get('/lms/academic/focal/student-search'),
  setStudentActive: (id, body) => put(`/lms/academic/focal/students/${id}/active`, body),
  deactivations: () => get('/lms/academic/focal/deactivations'),
  discipline: () => get('/lms/academic/focal/discipline'),
  createDiscipline: (body) => post('/lms/academic/focal/discipline', body),
  fines: () => get('/lms/academic/focal/fines'),
  // Monitoring extras
  assessmentMonitor: () => get('/lms/academic/focal/assessment-monitor'),
  attendance: () => get('/lms/academic/focal/attendance'),
  scheme: (programId) => get(`/lms/academic/focal/scheme${programId ? `?programId=${programId}` : ''}`),
  // Surveys
  surveys: () => get('/lms/academic/focal/surveys'),
  surveyResults: (id) => get(`/lms/academic/focal/surveys/${id}/results`),
  // Approvals
  approvals: (params = '') => get(`/lms/academic/focal/approvals${params}`),
  approval: (id) => get(`/lms/academic/focal/approvals/${id}`),
  createApproval: (body) => post('/lms/academic/focal/approvals', body),
  decideApproval: (id, body) => put(`/lms/academic/focal/approvals/${id}/decide`, body),
  // Reports & analytics
  report: (kind) => get(`/lms/academic/focal/reports/${kind}`),
  // Comprehensive Reports & Analytics module (Requirement #5).
  // tab ∈ enrollment|attendance|assignment|quizzes|midterm|semester|course|section|program|performance
  report2: (tab, params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '' && v !== 'all'),
    ).toString();
    return get(`/lms/academic/focal/reports2/${tab}${qs ? `?${qs}` : ''}`);
  },
  analytics: () => get('/lms/academic/focal/analytics'),
  // Communication
  announcements: () => get('/lms/academic/focal/announcements'),
  createAnnouncement: (body) => post('/lms/academic/focal/announcements', body),
  deleteAnnouncement: (id) => del(`/lms/academic/focal/announcements/${id}`),
  messageContacts: () => get('/lms/academic/focal/messages/contacts'),
  conversation: (userId) => get(`/lms/academic/focal/messages/${userId}`),
  sendMessage: (userId, body) => post(`/lms/academic/focal/messages/${userId}`, { body }),
  messagesUnreadCount: () => get('/lms/academic/focal/messages-unread/count'),
  // Audit / risk / notifications
  audit: (params = '') => get(`/lms/academic/focal/audit${params}`),
  risk: () => get('/lms/academic/focal/risk'),
  notifications: () => get('/lms/academic/focal/notifications'),
  readNotification: (id) => put(`/lms/academic/focal/notifications/${id}/read`),
  readAllNotifications: () => put('/lms/academic/focal/notifications/read-all'),
  // Settings (Account & profile — proper authenticated flow)
  myProfile: () => get('/lms/academic/focal/me/profile'),
  updateMyProfile: (body) => put('/lms/academic/focal/me/profile', body),
  uploadMyPhoto: (formData) => postForm('/lms/academic/focal/me/photo', formData),
  changePassword: (currentPassword, newPassword) => put('/lms/academic/focal/me/password', { currentPassword, newPassword }),
};

// ============================================================
// EXAM CONTROLLER MODULE  (/exam)  — Phase 5
// ============================================================
const exam = {
  dashboard: () => get('/lms/academic/exam/dashboard'),
  // Scheduling
  schedules: (params = '') => get(`/lms/academic/exam/schedules${params}`),
  calendar: () => get('/lms/academic/exam/calendar'),
  createSchedule: (body) => post('/lms/academic/exam/schedules', body),
  updateSchedule: (id, body) => put(`/lms/academic/exam/schedules/${id}`, body),
  setScheduleStatus: (id, body) => put(`/lms/academic/exam/schedules/${id}/status`, body),
  deleteSchedule: (id) => del(`/lms/academic/exam/schedules/${id}`),
  // Seating
  seating: () => get('/lms/academic/exam/seating'),
  createSeating: (body) => post('/lms/academic/exam/seating', body),
  updateSeating: (id, body) => put(`/lms/academic/exam/seating/${id}`, body),
  deleteSeating: (id) => del(`/lms/academic/exam/seating/${id}`),
  // Invigilators
  invigilators: () => get('/lms/academic/exam/invigilators'),
  availableInvigilators: () => get('/lms/academic/exam/invigilators/available'),
  assignInvigilator: (body) => post('/lms/academic/exam/invigilators', body),
  removeInvigilator: (id) => del(`/lms/academic/exam/invigilators/${id}`),
  // Papers
  papers: (params = '') => get(`/lms/academic/exam/papers${params}`),
  createPaper: (body) => post('/lms/academic/exam/papers', body),
  reviewPaper: (id, body) => put(`/lms/academic/exam/papers/${id}/review`, body),
  uploadPaper: (formData) => postForm('/lms/academic/exam/papers/upload', formData),
  downloadPaper: (id, fileName) => download(`/lms/academic/exam/papers/${id}/download`, fileName || `paper-${id}`),
  // Results
  results: (params = '') => get(`/lms/academic/exam/results${params}`),
  publishResult: (id) => put(`/lms/academic/exam/results/${id}/publish`),
  // Live sidebar counts (dynamic badges)
  counts: () => get('/lms/academic/exam/counts'),
  // Offerings picker (current term)
  offerings: () => get('/lms/academic/exam/offerings'),
  // Clash detection
  clashCheck: (params = '') => get(`/lms/academic/exam/schedules/clash-check${params}`),
  // Marks collection engine
  marksheet: (offeringId) => get(`/lms/academic/exam/offerings/${offeringId}/marksheet`),
  compileMarks: (offeringId) => post(`/lms/academic/exam/offerings/${offeringId}/compile`),
  // Seating auto-generation
  roomsSuggestion: () => get('/lms/academic/exam/seating/rooms-suggestion'),
  autoSeat: (examId, body) => post(`/lms/academic/exam/seating/auto/${examId}`, body),
  seatingAllocations: (seatingId) => get(`/lms/academic/exam/seating/${seatingId}/allocations`),
  // Exam attendance / absentee verification
  attendance: (examId) => get(`/lms/academic/exam/exams/${examId}/attendance`),
  bootstrapAttendance: (examId) => post(`/lms/academic/exam/exams/${examId}/attendance/bootstrap`),
  saveAttendance: (examId, body) => put(`/lms/academic/exam/exams/${examId}/attendance`, body),
  // Transcript system
  issueTranscript: (studentId, body) => post(`/lms/academic/exam/transcript/${studentId}/issue`, body),
  transcripts: (params = '') => get(`/lms/academic/exam/transcripts${params}`),
  transcriptRecord: (id) => get(`/lms/academic/exam/transcripts/${id}`),
  transcriptAction: (id, body) => put(`/lms/academic/exam/transcripts/${id}/action`, body),
  verifyTranscript: (code) => get(`/lms/academic/exam-verify/${code}`),
  // Report exports (CSV)
  exportReport: (kind) => download(`/lms/academic/exam/reports/${kind}/export`, `${kind}-report.csv`),
  // Account settings
  me: () => get('/lms/academic/exam/me'),
  updateProfile: (body) => put('/lms/academic/exam/me/profile', body),
  changePassword: (body) => put('/lms/academic/exam/me/password', body),
  // Rechecks
  rechecks: (params = '') => get(`/lms/academic/exam/rechecks${params}`),
  createRecheck: (body) => post('/lms/academic/exam/rechecks', body),
  recheckAction: (id, body) => put(`/lms/academic/exam/rechecks/${id}/action`, body),
  // Result batches (freeze/lock/publish)
  batches: () => get('/lms/academic/exam/batches'),
  createBatch: (body) => post('/lms/academic/exam/batches', body),
  batchAction: (id, body) => put(`/lms/academic/exam/batches/${id}/action`, body),
  // Transcripts
  students: (params = '') => get(`/lms/academic/exam/students${params}`),
  transcript: (id) => get(`/lms/academic/exam/transcript/${id}`),
  // UFM (Unfair Means) cases
  ufm: (params = '') => get(`/lms/academic/exam/ufm${params}`),
  createUfm: (body) => post('/lms/academic/exam/ufm', body),
  ufmAction: (id, body) => put(`/lms/academic/exam/ufm/${id}/action`, body),
  // Reports & analytics
  report: (kind, params = '') => get(`/lms/academic/exam/reports/${kind}${params}`),
  analytics: () => get('/lms/academic/exam/analytics'),
  // Audit / notifications
  audit: (params = '') => get(`/lms/academic/exam/audit${params}`),
  notifications: () => get('/lms/academic/exam/notifications'),
  readNotification: (id) => put(`/lms/academic/exam/notifications/${id}/read`),
  readAllNotifications: () => put('/lms/academic/exam/notifications/read-all'),

  // ---- Updated Exam Controller modules ----
  // Shared filter source (programs / semesters / sections / departments / courses / sessions)
  filters: () => get('/lms/academic/exam/filters'),
  // Date sheets (auto-generate + manual)
  datesheets: (params = '') => get(`/lms/academic/exam/datesheets${params}`),
  autoGenerateDatesheet: (body) => post('/lms/academic/exam/datesheets/auto-generate', body),
  createDatesheet: (body) => post('/lms/academic/exam/datesheets', body),
  addDatesheetEntry: (id, body) => post(`/lms/academic/exam/datesheets/${id}/entries`, body),
  updateDatesheetEntry: (id, entryId, body) => put(`/lms/academic/exam/datesheets/${id}/entries/${entryId}`, body),
  deleteDatesheetEntry: (id, entryId) => del(`/lms/academic/exam/datesheets/${id}/entries/${entryId}`),
  datesheetClashCheck: (id) => get(`/lms/academic/exam/datesheets/${id}/clash-check`),
  setDatesheetStatus: (id, body) => put(`/lms/academic/exam/datesheets/${id}/status`, body),
  lockDatesheet: (id) => put(`/lms/academic/exam/datesheets/${id}/lock`),
  deleteDatesheet: (id) => del(`/lms/academic/exam/datesheets/${id}`),
  // Quick messages (teacher reminders)
  quickMessages: () => get('/lms/academic/exam/quick-messages'),
  pendingTeachers: () => get('/lms/academic/exam/quick-messages/pending'),
  sendQuickMessage: (body) => post('/lms/academic/exam/quick-messages', body),
  // Results Compilation (was Marks Correction)
  compilationResults: (params = '') => get(`/lms/academic/exam/compilation/results${params}`),
  compileResults: (body) => post('/lms/academic/exam/compilation/compile', body),
  finalizeResults: (body) => post('/lms/academic/exam/compilation/finalize', body),
  publishResults: (body) => post('/lms/academic/exam/compilation/publish', body),
  // Gazette
  gazettes: () => get('/lms/academic/exam/gazettes'),
  buildGazette: (body) => post('/lms/academic/exam/gazettes/build', body),
  approveGazette: (id) => put(`/lms/academic/exam/gazettes/${id}/approve`),
  publishGazette: (id) => put(`/lms/academic/exam/gazettes/${id}/publish`),
  deleteGazette: (id) => del(`/lms/academic/exam/gazettes/${id}`),
  downloadGazette: (params = '', fileName) => download(`/lms/academic/exam/gazettes/download${params}`, fileName || 'gazette.csv'),
  // Rich profile (Settings)
  profile: () => get('/lms/academic/exam/profile'),
  saveProfile: (body) => put('/lms/academic/exam/profile', body),
  uploadProfilePhoto: (formData) => postForm('/lms/academic/exam/profile/photo', formData),
  // Teachers list (for quick-message recipient picker)
  examTeachers: (params = '') => get(`/lms/academic/exam/students${params}`),
};

// ============================================================
// DIRECTOR QEC MODULE  (/qec)  — Phase 6
// Quality Enhancement Cell: surveys, course/faculty evaluation,
// student feedback, quality monitoring, compliance/accreditation,
// improvement plans, program evaluation, analytics, reports.
// ============================================================
const qec = {
  // Dashboard & live counts
  dashboard: () => get('/lms/academic/qec/dashboard'),
  counts: () => get('/lms/academic/qec/counts'),
  // Survey management
  surveys: (params = '') => get(`/lms/academic/qec/surveys${params}`),
  survey: (id) => get(`/lms/academic/qec/surveys/${id}`),
  createSurvey: (body) => post('/lms/academic/qec/surveys', body),
  updateSurvey: (id, body) => put(`/lms/academic/qec/surveys/${id}`, body),
  setSurveyStatus: (id, body) => put(`/lms/academic/qec/surveys/${id}/status`, body),
  deleteSurvey: (id) => del(`/lms/academic/qec/surveys/${id}`),
  // Evaluation & feedback
  courseEvaluation: (params = '') => get(`/lms/academic/qec/course-evaluation${params}`),
  facultyEval: (params = '') => get(`/lms/academic/qec/faculty-eval${params}`),
  ratings: () => get('/lms/academic/qec/ratings'),
  feedback: (params = '') => get(`/lms/academic/qec/feedback${params}`),
  // Quality monitoring
  qualityMetrics: () => get('/lms/academic/qec/quality-metrics'),
  createQualityMetric: (body) => post('/lms/academic/qec/quality-metrics', body),
  // Compliance / accreditation
  compliance: () => get('/lms/academic/qec/compliance'),
  createCompliance: (body) => post('/lms/academic/qec/compliance', body),
  updateCompliance: (id, body) => put(`/lms/academic/qec/compliance/${id}`, body),
  // Improvement plans
  improvementPlans: () => get('/lms/academic/qec/improvement-plans'),
  createPlan: (body) => post('/lms/academic/qec/improvement-plans', body),
  updatePlan: (id, body) => put(`/lms/academic/qec/improvement-plans/${id}`, body),
  // Program evaluation & self-assessment
  programEval: () => get('/lms/academic/qec/program-eval'),
  selfAssessment: () => get('/lms/academic/qec/self-assessment'),
  // Departments & analytics
  departments: () => get('/lms/academic/qec/departments'),
  analytics: (params = '') => get(`/lms/academic/qec/analytics${params}`),
  // Reports (JSON + CSV export)
  report: (kind) => get(`/lms/academic/qec/reports/${kind}`),
  exportReport: (kind) => download(`/lms/academic/qec/reports/${kind}/export`, `qec-${kind}-report.csv`),
  // Communication
  announcements: () => get('/lms/academic/qec/announcements'),
  createAnnouncement: (body) => post('/lms/academic/qec/announcements', body),
  deleteAnnouncement: (id) => del(`/lms/academic/qec/announcements/${id}`),
  notifications: () => get('/lms/academic/qec/notifications'),
  readNotification: (id) => put(`/lms/academic/qec/notifications/${id}/read`),
  readAllNotifications: () => put('/lms/academic/qec/notifications/read-all'),
  // Audit / activity
  audit: (params = '') => get(`/lms/academic/qec/audit${params}`),
  // Account settings
  me: () => get('/lms/academic/qec/me'),
  updateProfile: (body) => put('/lms/academic/qec/me/profile', body),
  changePassword: (body) => put('/lms/academic/qec/me/password', body),
  // Rich profile (Settings) — full personal fields + photo
  profile: () => get('/lms/academic/qec/profile'),
  updateFullProfile: (body) => put('/lms/academic/qec/profile', body),
  uploadProfilePhoto: (formData) => postForm('/lms/academic/qec/profile/photo', formData),
  removeProfilePhoto: () => del('/lms/academic/qec/profile/photo'),
};

const provost = {
  // Dashboard, analytics & live counts
  dashboard: () => get('/lms/academic/provost/dashboard'),
  analytics: () => get('/lms/academic/provost/analytics'),
  counts: () => get('/lms/academic/provost/counts'),
  // University structure
  departments: () => get('/lms/academic/provost/departments'),
  faculty: () => get('/lms/academic/provost/faculty'),
  students: () => get('/lms/academic/provost/students'),
  programs: () => get('/lms/academic/provost/programs'),
  // Finance (Finance role merged into Provost)
  finance: () => get('/lms/academic/provost/finance'),
  feeApprovals: () => get('/lms/academic/provost/fee-approvals'),
  decideFee: (rawId, body) => put(`/lms/academic/provost/fee-approvals/${rawId}`, body),
  defaulters: () => get('/lms/academic/provost/defaulters'),
  notifyDefaulter: (rawId) => post(`/lms/academic/provost/defaulters/${rawId}/notify`),
  // Fee announcements
  feeAnnouncements: () => get('/lms/academic/provost/fee-announcements'),
  createFeeAnnouncement: (body) => post('/lms/academic/provost/fee-announcements', body),
  deleteFeeAnnouncement: (id) => del(`/lms/academic/provost/fee-announcements/${id}`),
  // Exam fee announcements
  examFeeAnnouncements: () => get('/lms/academic/provost/exam-fee-announcements'),
  createExamFeeAnnouncement: (body) => post('/lms/academic/provost/exam-fee-announcements', body),
  deleteExamFeeAnnouncement: (id) => del(`/lms/academic/provost/exam-fee-announcements/${id}`),
  // Fines
  fines: (params = '') => get(`/lms/academic/provost/fines${params}`),
  createFine: (body) => post('/lms/academic/provost/fines', body),
  updateFine: (rawId, body) => put(`/lms/academic/provost/fines/${rawId}`, body),
  // Strategic initiatives & policies
  initiatives: () => get('/lms/academic/provost/initiatives'),
  createInitiative: (body) => post('/lms/academic/provost/initiatives', body),
  updateInitiative: (id, body) => put(`/lms/academic/provost/initiatives/${id}`, body),
  policies: () => get('/lms/academic/provost/policies'),
  updatePolicy: (id, body) => put(`/lms/academic/provost/policies/${id}`, body),
  // Reports (JSON + CSV export)
  report: (kind) => get(`/lms/academic/provost/reports/${kind}`),
  exportReport: (kind) => download(`/lms/academic/provost/reports/${kind}/export`, `provost-${kind}-report.csv`),
  // Audit / activity
  audit: (params = '') => get(`/lms/academic/provost/audit${params}`),
  // Account settings
  me: () => get('/lms/academic/provost/me'),
  updateProfile: (body) => put('/lms/academic/provost/me/profile', body),
  changePassword: (body) => put('/lms/academic/provost/me/password', body),

  // ----------------------------------------------------------
  // FEE MANAGEMENT MODULE (real-time fee management)
  // Namespaced as `feeMgmt` to avoid colliding with the existing
  // `finance()` snapshot endpoint above.
  // ----------------------------------------------------------
  feeMgmt: {
    dashboard: () => get('/lms/academic/provost/finance/dashboard'),
    filterOptions: () => get('/lms/academic/provost/finance/filter-options'),
    announcements: (feeType = '') => get(`/lms/academic/provost/finance/announcements${feeType ? `?feeType=${feeType}` : ''}`),
    createAnnouncement: (body) => post('/lms/academic/provost/finance/announcements', body),
    deleteAnnouncement: (id) => del(`/lms/academic/provost/finance/announcements/${id}`),
    records: (params = '') => get(`/lms/academic/provost/finance/records${params}`),
    pending: (params = '') => get(`/lms/academic/provost/finance/pending${params}`),
    submitted: (params = '') => get(`/lms/academic/provost/finance/submitted${params}`),
    students: (params = '') => get(`/lms/academic/provost/finance/students${params}`),
    studentProfile: (id) => get(`/lms/academic/provost/finance/students/${id}/profile`),
    cards: () => get('/lms/academic/provost/finance/cards'),
    blocked: () => get('/lms/academic/provost/finance/blocked'),
    block: (id, body) => post(`/lms/academic/provost/finance/students/${id}/block`, body),
    unblock: (id, body) => post(`/lms/academic/provost/finance/students/${id}/unblock`, body),
    bulkBlock: (body) => post('/lms/academic/provost/finance/students/bulk-block', body),
    bulkUnblock: (body) => post('/lms/academic/provost/finance/students/bulk-unblock', body),
    report: (kind, params = '') => get(`/lms/academic/provost/finance/reports/${kind}${params}`),
    exportReport: (kind, format = 'csv') => download(
      `/lms/academic/provost/finance/reports/${kind}/export?format=${format}`,
      `${kind}-fee-report.${format === 'pdf' ? 'html' : 'csv'}`,
    ),
  },
};

// ============================================================
// SUPPORT & GRIEVANCES — UNIFIED STAFF CLIENT
// ------------------------------------------------------------
// Consumes the additive staff router mounted at
// /lms/academic/grievances/*. Every LMS staff role (Teacher,
// Course Coordinator, Focal Person, Exam Coordinator, QEC
// Coordinator, Provost) shares this single client — server-side
// authorization scopes what each role can see and act on.
// ============================================================
const grievances = {
  // Role-scoped list. `params` is a query string, e.g.
  //   "?status=OPEN&priority=HIGH&caseType=GRIEVANCE&q=GRV-2025".
  list: (params = '') => get(`/lms/academic/grievances${params}`),
  // Dashboard metrics + analytics groupings for the current role.
  stats: () => get('/lms/academic/grievances/stats'),
  // Vocabulary (case types / categories / priorities / statuses / roles).
  config: () => get('/lms/academic/grievances/meta/config'),
  // Full case: { case, messages, internalNotes, history }.
  case: (id) => get(`/lms/academic/grievances/${id}`),
  // Conversation reply (visible to the student).
  reply: (id, body) => post(`/lms/academic/grievances/${id}/reply`, { body }),
  // Internal note (staff-only — never surfaced to students).
  internalNote: (id, body) => post(`/lms/academic/grievances/${id}/internal-note`, { body }),
  // Status transition (optionally attach a response to the student).
  setStatus: (id, status, response) => put(`/lms/academic/grievances/${id}/status`, { status, response }),
  // Priority override (recomputes SLA on the server).
  setPriority: (id, priority) => put(`/lms/academic/grievances/${id}/priority`, { priority }),
  // Assign / reassign to a role queue and/or a specific staff user.
  assign: (id, body) => put(`/lms/academic/grievances/${id}/assign`, body),
  // Escalate up the ladder (defaults to next level when toRole omitted).
  escalate: (id, body = {}) => post(`/lms/academic/grievances/${id}/escalate`, body),
};

const api = { base: API_BASE, request, get, post, put, del, postForm, download, fileUrl, structure, student, teacher, coordinator, focal, exam, qec, provost, grievances };
export default api;
export { fileUrl };

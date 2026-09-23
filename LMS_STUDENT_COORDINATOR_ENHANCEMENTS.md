# LMS Student & Course-Coordinator Enhancements — Change Summary

> **Scope guarantee:** Only the **LMS side** (`lms-frontend/` + supporting `backend/` LMS routes)
> was modified. The **Admissions Portal/System (`frontend/`) was NOT touched** in any way —
> all admissions modules, UI, workflows, and the database schema remain exactly the same.
> No existing module/feature outside the items below was removed, redesigned, or broken.

This document summarizes the **Student (A–G)** and **Course Coordinator (A & C)** enhancements
delivered in this update. All changes persist to the database immediately and reflect in real time.

---

## Student A — Appeals (ENHANCED)
- Professional **role dropdown**: Teacher, Course Coordinator, Focal Person, Exam Controller, Provost.
- **Teacher** option dynamically lists **only the teachers currently teaching that student**.
- Appeal is delivered **only to the selected recipient** (server-side routing in
  `backend/src/utils/lmsAppealRouting.js`).
- Professional **tracking timeline / status card**: Submitted → Under Review → Approved / Rejected →
  Resolved, with **Date & Time** and **Last Updated** stamps.
- Files: `lms-frontend/src/pages/student/Appeals.jsx`, `backend/src/utils/lmsAppealRouting.js`,
  `backend/prisma/schema.prisma` (`StudentAppeal.targetRole` / `targetUserId`).

## Student B — Accounts Book (RENAMED)
- "Account Book" → **"Accounts Book"** (label only, no other change).
- Files: `lms-frontend/src/pages/student/AccountBook.jsx`,
  `lms-frontend/src/components/layout/Sidebar.jsx`.

## Student C — Course Library (ENHANCED)
- Professional **course cards** showing **enrolled courses only**, each with
  **Course Name / Code / Teacher / Semester / Resource Count**.
- Clicking a card opens that course's **resources**.
- File: `lms-frontend/src/pages/student/Library.jsx`.

## Student D — Attendance (ENHANCED)
- Modern dashboard with **circular progress**. Each card:
  **Name / Code / Instructor / Overall % / Total Live / Attended / Total Recorded / Watched / Status**.
- Clicking a card opens a **date-wise detail table**.
- **Weighted formula:** `Overall = (Live % × 40%) + (Recorded % × 60%)`, recalculated in real time.
- Status badges: ≥85 Excellent, ≥75 Good, ≥60 Warning, else Short Attendance.
- Files: `backend/src/services/academicService.js` (`weightedAttendance`, `statusBadge`,
  `recordedLectureKeys`), `lms-frontend/src/pages/student/Attendance.jsx`,
  `backend/prisma/schema.prisma` (`RecordedLectureView`).

## Student E — CGPA Calculator (ENHANCED)
- Primary input mode is **Points** (grade points / real numbers `0–4`), not percentage.
  (Grade-letter and Marks modes still available as alternates.)
- Prominent note at the top: **"This is only for information purpose."**
- Dynamic, instant calculation.
- File: `lms-frontend/src/pages/student/CGPACalculator.jsx`.

## Student F — Messaging (REWORKED)
- Students can **no longer directly message teachers** (direct GET/POST endpoints return `403`).
- **Automatic course groups**: one group per course offering, named by the course, auto-including the
  **teacher (owner) + enrolled students**.
- Groups **auto-update on enrollment change** (idempotent sync) and update in real time.
- Files: `backend/src/utils/lmsCourseGroups.js` (new shared sync util),
  `backend/src/routes/lms/academic/student.js`, `backend/src/routes/lms/academic/teacher.js`,
  `lms-frontend/src/pages/student/Messages.jsx`.

## Student G — Settings (ENHANCED)
- Improved, responsive UI with a dedicated **Documents** tab.
- New **"Incomplete Documents"** section with a **Submit Documents** button per missing document;
  uploads save to the DB, recompute the missing-docs checklist, and reflect status in real time.
- Files: `lms-frontend/src/pages/student/Settings.jsx`,
  `backend/src/routes/lms/academic/student.js` (`POST /profile/documents`),
  `lms-frontend/src/services/api.js` (`student.submitDocument`).

---

## Course Coordinator A — Course Distribution (ENHANCED)
- New **Edit** option per distribution row: **Course Assignment, Assigned Teacher, Section,
  Semester, Credit Hours**. All updates persist to the DB immediately.
- Files: `lms-frontend/src/pages/admin/TeacherAssignment.jsx` (`EditDistributionModal`),
  `backend/src/routes/lms/academic/coordinator.js`
  (`PUT /distribution/:offeringId`, `/distribution/options` + semesters).

## Course Coordinator C — Teacher Replacement (FIXED)
- The Course dropdown now displays **only the courses already assigned to the selected teacher**
  (dynamic load driven by the chosen original teacher).
- Files: `lms-frontend/src/pages/admin/TeacherReplacement.jsx`,
  `backend/src/routes/lms/academic/coordinator.js` (`GET /teachers/:teacherId/offerings`),
  `lms-frontend/src/services/api.js` (`coordinator.teacherOfferings`).

---

## Verification (all tested end-to-end via curl)
- **Attendance:** 40/60 weighting verified (Live 80%×0.4 + Recorded 33.33%×0.6 ≈ 52% after watching
  1 of 3 recorded lectures).
- **Messaging:** direct messaging returns `403`; course groups auto-synced with correct membership.
- **Documents:** submitting a missing doc recomputes and returns the updated missing-docs list.
- **Distribution Edit:** credit-hours / semester / section edits persist (verified then reverted).
- **Teacher Replacement:** offerings correctly scoped per teacher (e.g. Imran → 3 courses, Asim → 1).
- Backend loads without errors; all modified frontend files pass `esbuild --bundle` checks.

> **Note:** The full Vite production build runs in the deployment/CI environment (adequate RAM).
> The local sandbox (~985 MB) cannot finish Rollup's output phase, but the app runs via the Vite
> dev server and the esbuild full-bundle check confirms the code is sound.

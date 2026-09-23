# AI-Driven Open & Distance Learning Platform For Aust

## Project Overview
- **Name**:  AI-Driven Open & Distance Learning Platform For Aust

- **Institution**: Abbottabad University of Science & Technology — Open & Distance Learning
- **Department**: Computer Science
- **Goal**: Complete admission management system with multi‑role workflows (Super Admin, Director Admissions, Department Coordinator, Applicant/Student) including dynamic department & program management, a unified admissions-cycle announcement, per-program merit finalization, ADCS roll/registration & LMS credential issuance, online EasyPaisa payments, FSc Part-I "Result Awaited" workflow, and a full interview‑appeal lifecycle.
- **Programs**: Associate Degree in Computer Science — **ADCS** (Full name: "Associate Degree in Computer Science", Short form: "ADCS"). Departments & additional programs are now created dynamically by the Director.

## 🟢 Phase 1 Issue-Fix Round (2026-07 — LATEST)

Fourteen reported Phase-1 issues were resolved by **extending the existing
architecture only** — no redesign, no module rewrites, no duplicate tables. All
prior functionality is preserved; the root cause across the LMS issues was
missing/incorrect **department isolation enforced at the backend/DB query level**.

### Part A — Super Admin
1. **Staff Assignment dropdowns are role-filtered.** In Department create/edit the
   three staff pickers (Admissions Coordinator, Course Coordinator, Department Focal
   Person) now list **only users of that specific role** (via the `User.staffRole`
   tag + the strict `/staff-candidates` filter).
2. **Multiple staff per role.** Each of the three roles is now a **multi-select**.
   Assignments are stored in the new `DepartmentStaff` join model (legacy single-FK
   `coordinatorId`/`courseCoordinatorId`/`focalPersonId` retained as the "primary").
   Each selected user stays an independent account — only the department link is shared.
3. **Admission Cycle parity.** The Super Admin's Admission Cycle screen now renders the
   **exact same** `AdmissionCyclePanel` component the Director Admissions dashboard uses,
   operating on the **same `/api/admission-cycle` records** (real-time shared sync, no
   duplicate module/table).
4. **Temporary password now shown.** New User Creation **and** Password Reset
   auto-generate a secure temporary password, store it, **display it to the Super Admin**,
   and force a password change on first login (`mustChangePassword`). The UI reads the
   backend's `temporaryPassword` field.
5. **Payment Gateway config module.** New Super Admin screen at
   **System → Payment Gateway** to configure the Bank Gateway (name, environment/mode,
   API URL, API key, secret key, merchant ID, callback/return URLs, webhook secret,
   supported fees) plus the online-gateway payment-method toggle. Backed by the existing
   `PaymentGatewayConfig` singleton (DB overrides env). Secrets are **never returned in
   clear** (masked with a "configured" flag) and re-saving with the mask keeps them intact.

### Part B — LMS (department isolation)
6. **Dynamic user info.** The LMS profile now loads Name / Email / Username / Department /
   Role from the **logged-in DB record** (`/lms/auth/me` always returns the real profile).
   The old hardcoded `ROLE_PROFILES` names are treated as organisation metadata only.
7. **Sidebar "Programs".** The Course Coordinator sidebar item is now **"Programs"**
   (was "ADCS Program") and lists only the coordinator's own department programs.
8-14. **Department isolation at the query level.** Courses, Scheme of Study, Weekly
   Schedule, Student Allocation and Enrollment are all scoped to the staff member's own
   department for Course Coordinators **and** Focal Persons. Legacy cross-department
   ("mixed") records no longer appear because filtering happens in the Prisma `where`
   clause (`backend/src/routes/lms/academic/structure.js` now scopes
   `GET /courses`, `/offerings`, `/programs` via `buildDeptScope`; `focal.js` was already
   scoped).

### Part C — Super Admin Executive Dashboard
- New **"Admissions by Department → Program"** panel on the Executive Dashboard,
  grouping applications by **Department then Program** (never mixed) with live filters:
  **Department, Program, Session (admission cycle), Status**. Department/Program/Cycle/Status
  filtering is applied at the **DB query level** (`admissionsGovernance.listApplications`
  gained a `departmentId` filter). Grouping logic is extracted to one shared module
  (`super-admin/components/deptProgramGrouping.jsx`) reused by both the dashboard and the
  Admissions Governance pages — cleaner and scalable, with row actions preserved.

**Key files touched (Phase 1):** `backend/src/routes/departments.js`,
`backend/prisma/schema.prisma` (`DepartmentStaff`),
`backend/src/modules/super-admin/systemConfig.controller.js` (+ payment-gateway routes),
`backend/src/modules/super-admin/admissionsGovernance.controller.js` (departmentId filter),
`backend/src/routes/lms/academic/structure.js`, `backend/src/routes/lms/lmsAuthV2.js`,
`frontend/src/super-admin/pages/{DepartmentManagement,Users,System,Dashboard,AdmissionsGov}.jsx`,
`frontend/src/super-admin/components/{deptProgramGrouping,AdmissionsByDeptProgram}.jsx`,
`frontend/src/components/admissions/AdmissionCyclePanel.jsx`,
`lms-frontend/src/context/AuthContext.jsx`, `lms-frontend/src/components/layout/Sidebar.jsx`.

---

## 🔧 Additional Fixes & Enhancements (Update to the Master Prompt — 2026)
The following 10 bug-fixes/enhancements were implemented **without breaking the
existing workflow**, preserving all current functionality and strict department
isolation:

1. **Department Edit Bug (Super Admin) — FIXED.** The `PUT /api/departments/:id`
   handler now fully reconciles the `programs` array (name, short forms, Reg#/Roll#
   numbering formats, merit criteria) in addition to name/faculty/staff, and re-syncs
   to the LMS. Previously program edits were silently discarded so old values
   reappeared. Changes now save to the DB, appear in the UI immediately and sync
   everywhere.
2. **Department Staff Separation.** Director Admissions (Admissions Portal) now sees
   **only the Admissions Coordinator** — Course Coordinator & Department Focal Person
   are scrubbed from the director/admin `GET /api/departments` payload. When the Super
   Admin assigns/creates them they are provisioned as **LMS users** (`CourseCoordinator`
   / `FocalPerson` roles) via `syncStaffToLms()`. Department-isolated.
3. **Merit Criteria Per Program.** Matric/FSc/Interview weightage was **removed from
   the Admission Cycle**. Every Program now carries its own independent weights
   (`matricWeight`, `fscWeight`, `interviewWeight`). Setting Interview Weightage = 0%
   drops interview marks from the calculation and merit auto-computes from the
   remaining criteria (see `backend/src/utils/meritWeights.js`).
4. **Education Form Board "Other".** Selecting Board = "Other" reveals a manual
   **Board Name** input; hidden for predefined boards.
5. **Result Awaited Workflow.** "Result Awaited" candidates may submit and appear in
   Applications but are **blocked from progressing** beyond Initial Merit — they are
   not made Interview Eligible, not scheduled, and don't reach Final Merit/Enrollment
   until the result is declared. When the result is updated the application continues
   from the same stage (no reapplication) — see `backend/src/utils/resultAwaited.js`
   and the auto-continue logic in `education.js`.
6. **Initial Merit List Publishing.** The Admissions Coordinator prepares the list and
   must click **"Publish Initial Merit List"** (`PUT /api/coordinator/initial-merit-list/publish`).
   Only after publishing can students see Selected for Interview / Not Selected. A
   **"View Applicant Details"** modal shows the complete student profile without
   leaving the Initial Merit screen.
7. **Interview Management.** Only Interview-Eligible (and non-result-awaited) students
   appear. The coordinator can invite **Individual OR Multiple (Bulk)** students and
   choose **Physical (on-campus)** or **Online (video call)** mode. Existing workflow
   preserved.
8. **LMS Pending Status Bug — FIXED.** Once the Director publishes enrollment
   ("Show to Student"), `deriveVerification()` treats `credentialsPublished` (and an
   assigned Reg#/Roll#) as authoritative, so the "Pending" banner **permanently
   disappears**. The temporary LMS password is shown once and **never displayed again**
   after the first login / password change.
9. **Application Management UI.** Director Admissions → Application Management now
   **groups applications by Department → Program** (drill-down cards + breadcrumb).
   Selecting a Program shows only that Program's applications.
10. **Automatic Course Enrollment in LMS.** On LMS login, students are auto-enrolled
    into all first-semester courses per that Program's **approved Course Scheme**
    (Course Coordinator's `SchemeOfStudy` → `SchemeCourse`), for **every department**
    with isolation (falls back to the semester template if no scheme). Sets
    `Enrollment.lmsCoursesEnrolled = true`. No manual enrollment
    (`backend/src/services/autoEnrollService.js`).

### Schema additions for the above
- `Program.matricWeight / fscWeight / interviewWeight` (Float, defaults 30/40/30)
- `AdmissionCycle.initialMeritPublished` (Boolean) + `initialMeritPublishedAt` (DateTime?)
- `Enrollment.lmsCoursesEnrolled` (Boolean, default false)

## 🆕 Admissions Portal Enhancements (2026)
These enhancements apply **only** to the Admissions Portal. The LMS is unchanged
except for the required automatic synchronization of new departments/programs and
LMS accounts/credentials.

1. **Department & Program Management is Super Admin ONLY.**
   - Super Admin Console → **Institution → Dept & Program Mgmt**.
   - Create/edit/delete departments & programs.
   - Assign **three staff roles** — Admissions Coordinator, Course Coordinator,
     Department Focal Person — each either an existing user or created inline
     (Name / Email / Username / Temp Password).
   - **Per-program Registration & Roll number format** config with live preview.
     - Reg# example: `001F26C0106101` = institute `001` + term `F26` + faculty `C`
       + dept `01` + program `06` + serial `101`.
     - Roll# example: `ADCS-F26-101` = shortForm-term-serial.
     - Serial auto-increments (101, 102, 103…) and is **identical** in Reg# & Roll#.
   - On save, everything persists in real-time and **auto-syncs to the LMS**.
2. **Director Admissions permissions restricted** — Departments/Programs are now
   **read-only** for the Director (view formats & staff). Backend enforces
   `requireSuperAdmin` on all dept/program writes (Director gets HTTP 403). The
   Director keeps: announce cycles, applications, merit lists, fee approval,
   enrollment & publishing.
3. **Initial Merit List (NEW, pre-interview)** — Director forwards applications to
   the Admissions Coordinator, who marks each **Eligible / Not Eligible for
   Interview** (single or bulk). Only interview-selected applicants appear on the
   *"Initial Merit List – Selected for Interview"*. Students see they are shortlisted.
   Final Merit List workflow is unchanged → the portal now has **two lists**.
4. **Fee Approval & Auto-Enrollment (all programs)** — After fee approval, the
   system auto-generates Reg#, Roll#, LMS account (username = roll number) and an
   Enrollment record for **any** program (previously ADCS-only). The student
   immediately sees *"Congratulations! Successfully enrolled"* with **Reg#, Roll#,
   LMS Username & LMS Password all showing "Pending"**.
5. **Enrollment Publishing — "Show to Student"** — In the Director's Enrollment
   module, enrolled students are organized by **Department → Program**. A new
   **Show to Student** action publishes credentials at **Individual / Program /
   Department** level. Publishing only *reveals* the already-generated credentials;
   the student then sees full Reg#, Roll#, LMS Username & temp Password and can log
   into the LMS.
6. **Automatic Synchronization** — New departments/programs and LMS accounts are
   provisioned automatically; no manual LMS account creation is ever required.
7. **Department Isolation** — Coordinators remain scoped to their own department's
   programs across the Admissions Portal.

### New / changed API endpoints (Admissions)
| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET/POST/PUT/DELETE | `/api/departments*` | **Super Admin** (writes) / read for Director+Coordinator | Dept & program CRUD, 3 staff roles, per-program numbering, LMS sync |
| GET | `/api/departments/staff-candidates` | Super Admin | Selectable existing staff users |
| PUT | `/api/coordinator/interview-eligibility/:applicationId` | Coordinator | Mark one applicant Eligible/Not Eligible |
| PUT | `/api/coordinator/interview-eligibility-bulk` | Coordinator | Bulk mark eligibility |
| GET | `/api/coordinator/initial-merit-list` | Coordinator | Coordinator's Initial Merit List queue |
| GET | `/api/merit/initial` | Student / Coordinator / Director / Super Admin | Initial Merit List (role-aware) |
| PUT | `/api/enrollment/publish/user/:userId` | Director / Super Admin | Show to Student — individual |
| PUT | `/api/enrollment/publish/program/:programId` | Director / Super Admin | Show to Student — whole program |
| PUT | `/api/enrollment/publish/department/:departmentId` | Director / Super Admin | Show to Student — whole department |
| GET | `/api/enrollment/my` | Student | Credentials gated by `credentialsPublished` (Pending until published) |

### Data model additions
- **Program**: `instituteCode`, `facultyCode`, `deptCode`, `programNumericCode`, `regNextSerial`, `regConfigured`.
- **Department**: `courseCoordinatorId`, `focalPersonId` (+ relations).
- **Application**: `interviewEligibility` (`PENDING | ELIGIBLE | NOT_ELIGIBLE`).
- **Enrollment**: `credentialsPublished`, `credentialsPublishedAt`.

## Scoped Admission and LMS Update (2026-08-30)

### Completed features
- Admission **Fee Management** remains fully DB-backed and operational, including overview, fee creation/update, payment locking, pending/processed queues, full fee history, approval/rejection, and automatic 8-second/focus refresh.
- Student **View Marks Breakdown** displays configured assessment components as weighted marks (`earned / configured weight`) for assignments, quizzes, exams, labs, projects, and all returned configured categories.
- Course Distribution **New Distribution** no longer accepts or creates Room; Room remains available in edit/timetable workflows.
- Focal Person Lab Task Monitor and Exam Controller filters enforce real-time **Department → Program → Semester** cascading selection.
- Provost QEC Summary route, navigation item, client method, and backend endpoint were removed without changing other Provost features.
- UFM creation persists validated Student, Department, Program, Semester, Course, Reason, evidence, severity, and exam type context.
- Exam Controller Marks Collection is read-only in both frontend and backend.
- Result workflow is staged: **Compile → Marks Collection → Finalize → Result Publishing → Publish → transcript issuance**. Teacher mark mutations lock at the Result Publishing (`FINALIZED`) stage.
- Director QEC Survey Management includes Department/Program cascaded filters; Faculty Evaluation response counts and department-scoped statistics are repaired.

### Functional entry URIs
- Admissions UI: `/` (local port `3000`); Fee Management is available in the Director dashboard.
- LMS UI: `/` (local port `3001`).
- API health: `GET /api/health` (local port `5000`).
- Admission Fee Management API: `/api/fee-management/*`.
- Exam result workflow: `/api/lms/academic/exam/compilation/{results,compile,finalize,publish}`.
- UFM: `/api/lms/academic/exam/ufm`.
- Director QEC: `/api/lms/academic/qec/{surveys,faculty-eval}`.

### Data architecture and deployment
- Storage remains Prisma 5 + SQLite at `backend/prisma/prisma/dev.db`; no schema migration was required for this update.
- Runtime remains the existing Express backend plus two Vite React frontends under PM2.
- Genspark Hosted/Cloudflare Workers cannot run this project unchanged because it requires a persistent Node/Express process, Prisma local SQLite, runtime filesystem uploads, and Node-only libraries. A Hosted deployment would require a framework/storage rewrite, intentionally excluded by the requirement to preserve the architecture.

### Recommended next steps
- For production without architectural changes, deploy the Express/Prisma application to a persistent Node host with durable disk/database and object storage for uploads.
- If Genspark Hosted becomes mandatory, plan a separate migration from Express/Prisma/filesystem services to Workers-compatible handlers, managed D1, and R2.

## Tech Stack
- **Frontend**: React 18 + React Router 6 + Axios (Vite dev server, port 3000)
- **Backend**: Node.js + Express.js (port 5000)
- **Database**: Prisma ORM + SQLite (`backend/prisma/dev.db`) — one-line switch to PostgreSQL
- **File Upload**: Multer (local storage in `backend/uploads/`)
- **Authentication**: JWT + bcryptjs + Captcha
- **PDF / ZIP**: Server-rendered A4 HTML (Print → Save as PDF) + `archiver` v7.0.1 streaming ZIP
- **Email**: Nodemailer (logs to console when SMTP not configured)
- **Validation**: express-validator
- **Payments**: EasyPaisa REST API (with mock fallback for sandbox)
- **Process Manager**: PM2 (`ecosystem.config.cjs`)

## Demo Accounts
| Role | Email | Username | Password | Lands on |
|------|-------|----------|----------|----------|
| Super Admin | superadmin@aust.edu.pk | superadmin | superadmin123 | Super Admin Dashboard (`/super-admin`) |
| Director Admissions | director@aust.edu.pk | director | director123 | Director Dashboard (`/admin`) |
| Director Admissions (legacy) | admin@aust.edu.pk | — | admin123 | Director Dashboard |
| Coordinator | coordinator@aust.edu.pk | coordinator | coord123 | Coordinator Dashboard (`/coordinator`) |
| Applicant / Student | student@example.com | student | student123 | Applicant Portal / Student Transition Page (`/dashboard`) |

> **Unified login**: there is a single login page. The backend issues a role
> on authentication and the frontend routes Super Admin → Director →
> Coordinator → Applicant/Student automatically. Login by email **or** username.

---

## 🎓 Super Admin Governance — Full Enhancement (Act-as-Any-Role Command Center) — LATEST

The Super Admin is now the **supreme governor**: from one centralized console it can do
**everything every other role can do** — and every action reflects **immediately and
correctly** across the entire system, exactly as if the original role had performed it.

This enhancement is **purely additive** (Golden Rule honored): **no existing Admissions or
LMS file was modified, and no existing DB table was altered.** New governance controllers
write to the **same existing tables** the original roles use, and each action is recorded to
**three audit systems** — `SaActivityLog` (every SA action), `LmsAuditLog` (with the
impersonated `actorRole`, so it appears in the LMS audit trail like the real role did it), and
`OverrideLog` (permanent, mandatory-reason log when overriding a published/existing decision).

### What was added

**Backend — additive governance controllers** (`backend/src/modules/super-admin/`):
- `admissionsGovernance.controller.js` — Director + Coordinator effect: applications list/detail,
  approve/reject/set-any-status (real write-through to `Application` + `StatusEvent`), document
  verification, merit lists, stats, cycle open/close + merit/qualification configuration.
- `lmsAcademicActions.controller.js` — Teacher + Course Coordinator effect: upload/publish marks
  (weighted grade auto-computed → appears in student result cards), mark attendance, manage
  assignments, materials, sections, and assign/replace teacher (`TeacherReplacement`).
- `lmsGovernance.controller.js` — Focal + Exam + Provost + QEC effect: search students, drop
  (revokes LMS access) / restore (re-grants), issue fine + announce fee (creates
  `LmsFeeChallan` in each student's account book), review challans, block/unblock, exam
  attendance, promotion/detain, recheck processing, survey open/close + **anonymized** results.
- `userManagementPlus.controller.js` — bulk password reset / activate-deactivate / notify,
  force-logout, and **transfer responsibilities** (re-assigns offerings + sections with zero data loss).
- `superAdmin.service.js` — added `logLmsAudit()` helper (mirrors SA actions into the LMS audit trail).
- `superAdmin.routes.js` — all new routes wired additively under `/api/super-admin/*`.

**Frontend — governance command-center pages** (`frontend/src/super-admin/`):
- `pages/AdmissionsGov.jsx` — Applications (decide + verify docs), Merit Lists, Admission Cycles.
- `pages/LmsStudents.jsx` — Student Control (drop / restore / fine / block / promote).
- `pages/LmsAcademic.jsx` — Teaching Actions (offering → roster → marks / attendance / assignments / materials / sections / teacher).
- `pages/LmsFinance.jsx` — Fees & Finance (announce fee → instant challans, review challans).
- `pages/LmsExams.jsx` — Exams & Rechecks (process recheck requests, exam schedule oversight).
- `pages/LmsQuality.jsx` — Quality & Surveys (open/close surveys, anonymized aggregated results).
- `pages/UsersBulk.jsx` — Bulk Operations (multi-select reset / activate / deactivate / notify / force-logout).
- `pages/UsersTransfer.jsx` — Transfer Responsibilities (move all teaching duties between staff).
- `pages/Portals.jsx` — **Portal Registry** (future extensibility — new portals auto-inherit SA access).
- `utils/exporters.js` — zero-dependency **CSV / Excel / PDF** exporters used by every table.
- `components/DataTable.jsx` — enhanced with column **sorting**, **filter dropdowns**, **export menu**, skeleton loading.
- `components/Sidebar.jsx` — collapsible groups + a marked **Future Portals** section.

### Reflection (Golden-Rule write-through, verified)
| Super Admin action | Real effect (same as original role) |
|---|---|
| Approve / reject / set application status | `Application` + `StatusEvent` updated (Director path) |
| Verify document | `verificationStatus` updated (Coordinator path) |
| Upload & publish marks | `CourseResult` (weighted grade) → appears in student result card |
| Mark attendance | `AttendanceSession` + `AttendanceRecord` |
| Issue fine / announce fee | `LmsFeeChallan` created in student account book |
| Drop student | `LmsUser.isActive=false` + registrations → `DROPPED` (LMS access revoked) |
| Restore student | reversed — access & registrations restored |
| Assign teacher | `CourseOffering.teacherId` + permanent `TeacherReplacement` |
| Transfer duties | offerings + sections re-assigned (zero data loss) |
| Override published decision | applied **and** logged permanently with mandatory reason |

### New functional entry URIs (all under `/super-admin`, role `super_admin`)
```
/super-admin/admissions/applications   Manage every application (decide + verify docs)
/super-admin/admissions/merit          Merit lists per program/batch
/super-admin/admissions/cycles         Open/close cycles + merit/qualification config
/super-admin/lms/students              Student Control (drop/restore/fine/block/promote)
/super-admin/lms/academic              Teaching Actions (marks/attendance/materials/...)
/super-admin/lms/fees                  Fees & Finance (announce fee, review challans)
/super-admin/lms/exams                 Exams & Rechecks (process recheck requests)
/super-admin/lms/quality               Quality & Surveys (toggle + anonymized results)
/super-admin/users/bulk                Bulk Operations (reset/status/notify/force-logout)
/super-admin/users/transfer            Transfer Responsibilities (zero data loss)
/super-admin/portals                   Portal Registry (future extensibility)
```
Corresponding API: `GET/POST/PATCH /api/super-admin/admissions/*`, `/api/super-admin/lms/*`,
`/api/super-admin/user-management/bulk/*`, `/api/super-admin/user-management/transfer-responsibilities`.

### UX / quality
Skeleton screens (no spinners), every table with search + filter dropdowns + column sorting +
pagination + CSV/Excel/PDF export, confirmation modals on destructive actions, mandatory-reason
override modals, success/error toasts, light + dark themes, anonymized survey charts, empty
states, collapsible category-grouped sidebar, breadcrumbs on every page.

### Verification (this release)
- All new pages compile (esbuild) and render authenticated with **zero console JS errors** (Playwright).
- All governance endpoints return **200** with the seeded Super Admin token.
- **Golden Rule intact**: `/api/admin/stats`, `/api/super-admin/stats`, `/api/super-admin/dashboard`
  all 200; unified LMS login still returns `superAdmin: true` + admin handoff token.

---

## 🆕 Super Admin Console — Comprehensive Institution Command Center

A complete, premium **Super Admin module** has been added **without modifying any
existing Admissions System or LMS behavior** (Golden Rule preserved). Every existing
route, component, DB table, and API endpoint remains exactly as-is. The module is
purely **additive**.

### Unified Login (single credential, any portal)
There is now **one login system for the entire ODL platform**. The Super Admin can
sign in from **either** the Admissions login page **or** the LMS login page using the
**same credentials**:
- **Admissions login** (`/login`) → authenticates against the `User` table → lands on `/super-admin`.
- **LMS login** → the super admin account is mirrored into `LmsUser` (idempotent seed `seedSuperAdminLms.js`), and on success the LMS API mints an Admissions handoff token returned as `superAdmin:true` + `adminToken`. The LMS frontend redirects to the Admissions-hosted console via `#sa_session=<encoded {token,user}>`, which `AuthContext` consumes on load.
- **Demo**: `superadmin` / `superadmin123` (email `superadmin@aust.edu.pk`).

### Backend — `/api/super-admin/*` (additive, namespaced)
Mounted **after** the legacy `routes/superAdmin.js` so legacy endpoints
(`/users`, `/stats`, `/departments`) are untouched. All routes guarded by
`authenticate + requireSuperAdmin`. Module lives in `backend/src/modules/super-admin/`.

| Area | Endpoints |
|------|-----------|
| Dashboard & Audit | `GET /dashboard`, `/dashboard/charts`, `/dashboard/recent-activity`, `/activity-logs`, `/audit-trail`, `/override-logs` |
| User Management | `GET/POST /user-management`, `PATCH /user-management/:system/:id/status`, `POST .../reset-password`, `PATCH .../role`, `POST .../unlock`, `/user-management/login-history`, `/active-sessions` |
| Institution | `GET/PUT /institution/profile`, `GET/POST/PATCH /institution/departments`, `GET/PATCH /institution/programs`, `GET/POST/PATCH/DELETE /institution/campuses` |
| Academic | `GET/POST/PATCH /academic/sessions`, `POST /academic/sessions/:id/archive`, `GET/POST/PATCH/DELETE /academic/grading`, `GET /academic/terms` |
| LMS Oversight (read-only) | `/lms/enrollments`, `/lms/courses`, `/lms/offerings`, `/lms/attendance/overview`, `/lms/results`, `/lms/fees/overview`, `/lms/fees/challans`, `/lms/exams`, `/lms/quality` |
| System | `GET/POST /system/config`, `GET/PUT /system/password-policy`, `GET/POST/PATCH/DELETE /system/announcements`, `GET/PUT /system/maintenance`, `GET /system/override-logs` |
| Reports & Overrides | `GET /reports/summary`, `/reports/applications`, `GET /reports/export/{users,applications,activity-log}` (CSV), `POST /reports/override/{application,course-result,fee-challan}/:id` (reason required → permanent OverrideLog) |

Every action is logged to **`SaActivityLog`**; every override is logged permanently
to **`OverrideLog`** with a mandatory reason.

### Frontend — `/super-admin/*` (premium console)
Self-contained module in `frontend/src/super-admin/` with a scoped design system
(`superadmin.css`) — deep navy primary, clean blue accent, off-white background,
white cards, **light/dark mode**, skeleton screens (no spinners), collapsible
sidebar grouped by category, breadcrumbs on every page, searchable/exportable
tables with pagination, confirmation modals on destructive actions, and **override
modals that require a reason**.

| Group | Pages |
|-------|-------|
| Dashboard | Executive overview (stat cards, quick actions, pending-approvals widget, recent activity feed, department chart) |
| Institution | University Profile · Departments · Programs · Campuses |
| Admissions | Applications (read) · Status Overrides (override + reason) |
| Academic | Academic Sessions · Grading Scale · Academic Terms |
| User Management | All Users (both systems, create/activate/reset/role/unlock) · Login Sessions |
| LMS Oversight | Enrollments · Courses · Results · Fees · Exams · Quality (QEC) |
| System | Announcements · Security & Policy · Configuration · Maintenance · Audit Trail · Override Log |
| Reports | Summary analytics + one-click CSV exports |

### Database additions (non-destructive, all nullable/defaulted)
- **New models**: `UniversityProfile`, `Campus`, `AcademicSession`, `SaAdmissionCycle`, `SaGradingScale`, `SystemConfiguration`, `PasswordPolicy`, `SystemAnnouncement`, `OverrideLog`, `SystemMaintenanceMode`, `SaActivityLog`. (Names prefixed `Sa…`/`System…` to avoid collisions with existing models.)
- **New `User` fields**: `lastLoginIp`, `isLocked`, `lockedAt`, `forcePasswordReset` (in addition to pre-existing `lastLoginAt`, `failedLoginAttempts`, `lockedUntil`).
- Applied via `prisma db push` (zero data loss verified). PostgreSQL migration remains a one-line provider change.

### Extensibility
Additional Super Admins can be created at any time from **User Management → Add User**
(role `super_admin` / `SuperAdmin`) with no schema changes — they automatically
inherit the unified login and full console access.

---

## 🆕 LMS Real-Time Synchronization — Name · Password · Profile Photo (Latest)

This release adds **real-time, DB-persisted synchronization across the entire LMS**
for the three identity attributes required by the spec. **No Admissions Portal
files (`frontend/`) or Admissions backend routes/DB structure were modified** —
all changes are strictly LMS-side (`lms-frontend/` + `backend/src/routes/lms/`).

### What was added / changed

**1. Password Change (every LMS role)**
- New secure endpoints:
  - `PUT /api/lms/academic/teacher/me/password`
  - `PUT /api/lms/academic/student/me/password`
  - (Coordinator already had `PUT /api/lms/academic/coordinator/me/password` — used as the reference pattern.)
- Behaviour (verified end-to-end):
  - Verifies the **current password** with `bcrypt.compare` against `LmsUser.passwordHash`.
  - Rejects when the current password is wrong (`Current password is incorrect`).
  - Enforces the strong-password policy: `8+ chars, 1 uppercase, 1 number, 1 special character`.
  - Rejects when the new password equals the old one.
  - Hashes the new password with `bcrypt` (saltRounds 12) and persists it immediately to the DB.
  - **Old password stops working instantly; only the new password is accepted on the next login.**
  - Writes an audit log entry (`PASSWORD_CHANGE`).
  - Student endpoint also syncs the linked **Admissions enrollment** flags
    (`lmsPasswordChanged`, `lmsMustChangePassword`, clears `lmsPassword`) via
    `linkedRollNumber` — read-only sync of LMS state, no Admissions logic changed.
- Frontend: a new **Security** tab on both **Teacher Settings** and **Student Settings**
  with a full change-password form (current/new/confirm, show/hide toggles, live
  password-strength meter, inline validation).

**2. Profile Photo — propagated everywhere it is displayed**
- When a teacher uploads a new photo it is stored on `LmsStudentProfile.photoUrl`
  and a real-time SSE event is emitted. The new picture now appears immediately in:
  - **Course Instructor module** (student `CourseDetail.jsx` — new instructor card)
  - **Teacher Profile / Teacher Cards** (admin `Teachers.jsx` — already correct)
  - **Student Course cards** (`Courses.jsx`)
  - **Student Dashboard** course tiles (`Dashboard.jsx`)
  - **Admin Dashboard** faculty list (`admin/Dashboard.jsx`)
- Backend: student `teacherInfo()` now returns `photoUrl`; the student dashboard
  course card now returns `teacherPhotoUrl`; the coordinator `/teachers` endpoint
  now returns `photoUrl`.

**3. Name Change — already real-time**
- Handled by the existing `AuthContext` identity layer
  (`refreshUser()`, `updateUser(patch)`, `buildProfileFromMe(me)`) which re-hydrates
  the signed-in user from `/me`. A changed name appears everywhere instantly. No
  changes were required; verified working.

### Real-time mechanism
- SSE bus `backend/src/utils/lmsRealtime.js` (`emitTo(userIds, event, data)`).
- `AuthContext` performs optimistic updates and re-fetches `/me` so identity
  fields stay in sync across all open views with no manual refresh.

### Verification status
- ✅ Backend curl tests passed (wrong password rejected, weak rejected, valid
  accepted, old password rejected on next login, new password accepted; dashboard
  returns real `teacherPhotoUrl`).
- ✅ All modified frontend files compile via Vite (200 OK, no syntax errors).
- ✅ App loads with no console errors.

---

## 🆕 LMS Exam Controller Module — Full Overhaul (Latest)

The **Exam Controller (EC)** role inside the LMS (`lms-frontend/` + backend
`backend/src/routes/lms/academic/exam.js`) was completely reworked to be
**100% real-time and database-driven — all dummy/mock data removed**.

> ⚠️ **Scope guarantee:** This overhaul touched **only** the Exam Controller
> module. The **Admissions Portal (`frontend/`) was NOT modified in any way**,
> and the other LMS roles (Student, Teacher, Course Coordinator, Focal Person)
> were left untouched.

### EC Login
| Username | Password | DB Role |
|----------|----------|---------|
| `exam1` | `Lms@1234` | `ExamController` |

(The `examcontroller_demo` / `Exam@123` account also maps to the same role.)

### Module-by-module changes (22 requirements)
| # | Module | Status / Change |
|---|--------|-----------------|
| 1 | **Dashboard** | Real-time stats, cards & charts (no dummy) |
| 2 | **Exam Calendar** | ❌ Removed completely |
| 3 | **Online Exam Management** | Real-time + Program/Semester/Section dropdown filters, date-wise searchable/filterable table |
| 4 | **Date Sheet** | Kept + Auto-Generate (Exam Type, Program, Semester, Start Date, Duration, GAP Day, Slots/Day; one/multiple/all semesters → saves to DB) + manual entry saved real-time |
| 5 | **Seating & Attendance** | Seating ❌ removed; **Attendance kept exactly as-is** |
| 6 | **Invigilators** | ❌ Removed completely |
| 7 | **Paper Management** | ❌ Removed completely |
| 8 | **UFM Cases** | Real-time (no dummy) |
| 9 | **Absentee Verification** | Real-time (no dummy) |
| 10 | **Rechecking Request** | ❌ Removed completely |
| 11 | **Results Compilation** | Renamed from "Marks Correction"; shows teacher-uploaded results real-time; filters Dept/Program/Semester/Section/Course; **Compile Results** button → transcripts auto-available |
| 12 | **Incomplete Results** | Real-time + **Quick Messages** to remind teachers with pending marks |
| 13 | **Result Hold & Release** | Real-time; filters Dept/Program/Semester/Section/Student; Hold (PUBLISHED→DRAFT) / Release (→PUBLISHED) → transcripts auto-visible after release |
| 14 | **Transcript** | ❌ Removed completely |
| 15 | **Gazette Review** | Filters (Dept/Program/Semester/Section) + scope-wise Download + Approve & Publish (publish only after approval) |
| 16 | **Probation Flagging** | Real-time (no dummy) |
| 17 | **Mid Term & Final Term** | DB-driven dropdown filters (Session/Dept/Program/Semester/Section/Course), real-time |
| 18 | **Exam Tracking** | Real-time (no dummy) |
| 19 | **Exam Reports** | Real-time, auto-update |
| 20 | **Results & Analytics** | Real-time (no dummy) |
| 21 | **Activity Logs** | Real-time; EC activities stored in DB |
| 22 | **Settings** | Full profile system: profile picture upload + fields (Name, Father Name, CNIC, Email, Phone, WhatsApp, Gender, Marital Status, Address) — all persisted/displayed from DB |

### New / changed backend endpoints (`/api/lms/academic/exam/...`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/filters` | Dropdown metadata (departments/programs/semesters/sections/courses) |
| GET | `/results` | Enhanced: returns + filters on program/semester/section/department/roll; accepts `session`, `component` (mid/final) |
| GET/POST | `/datesheets`, `/datesheets/auto-generate` | Date sheet list + auto-generation |
| GET | `/compilation/results` | Teacher-uploaded results for compilation view |
| POST | `/compilation/compile` | Compile results by program/semester/section |
| GET | `/quick-messages/pending` | Teachers with pending (enrolled − published) marks |
| POST | `/quick-messages` | Send reminder message to teacher(s) |
| POST | `/results/hold` | Hold results (PUBLISHED→DRAFT); supports `resultIds[]` or scope filters |
| POST | `/results/release` | Release results (→PUBLISHED); notifies students |
| GET/POST | `/gazette`, `/gazette/build`, `/gazette/:id/approve`, `/gazette/:id/publish` | Gazette lifecycle (build → approve → publish) |
| GET | `/gazette/download` | Scope-wise gazette download |
| GET/PUT | `/profile` | EC profile read / update |
| POST | `/profile/photo` | Upload/replace EC profile picture (multipart, field `photo`) |
| GET | `/reports/:kind` | Real-time reports (incomplete, absentees, probation, gazette, …) |
| GET | `/analytics`, `/audit` | Analytics + activity logs |

### New / changed Prisma models
`LmsExamProfile`, `DateSheet`, `DateSheetEntry`, `Gazette`, plus a
`category` field on `LmsThreadMessage`. Existing models reused:
`CourseResult` (status `DRAFT`/`PUBLISHED` drives transcript visibility),
`CourseOffering`, `LmsProgram`, `LmsSemester`, `LmsCourse`, `Section`,
`LmsStudentProfile`, `AcademicTerm`, `ResultBatch`.

> **Transcript visibility rule:** Student transcripts render `CourseResult`
> rows with `status = 'PUBLISHED'`. Compiling/releasing sets them PUBLISHED;
> holding reverts to DRAFT (hidden).

---

## 🆕 LMS Role-Based Demo Login System (Latest)

A full set of **seven** role-based demo accounts for the **LMS** is provisioned
**permanently in the real database** (`LmsUser` table) — no fake frontend auth,
no hardcoded React users, no mock login. They authenticate through the existing
LMS login endpoint (`POST /api/lms/auth/login`), receive a real JWT, and are
routed to their own role panel by the existing RBAC + routing layer.

### Demo credentials
Login works with **either the username OR the email**, plus the password.
Passwords are **bcrypt-hashed (saltRounds 12)** in the DB.

| # | Username | Email | Password | DB Role (`LmsUser.role`) | Frontend role | Lands on |
|---|----------|-------|----------|--------------------------|---------------|----------|
| 1 | `student_demo` | `student@lms.com` | `Student@123` | `Student` | student | `/student` |
| 2 | `teacher_demo` | `teacher@lms.com` | `Teacher@123` | `Teacher` | teacher | `/teacher` |
| 3 | `coordinator_demo` | `coordinator@lms.com` | `Coordinator@123` | `CourseCoordinator` | admin | `/admin` |
| 4 | `focal_demo` | `focal@lms.com` | `Focal@123` | `FocalPerson` | focal_person | `/focal` |
| 5 | `examcontroller_demo` | `examcontroller@lms.com` | `Exam@123` | `ExamController` | exam_coordinator | `/exam` |
| 6 | `qec_demo` | `qec@lms.com` | `QEC@123` | `QECCoordinator` | director_qec | `/qec` |
| 7 | `provost_demo` | `provost@lms.com` | `Provost@123` | `Provost` | provost | `/provost` |

> **Route mapping note:** the canonical DB roles (PascalCase) map to frontend
> role keys via `BACKEND_ROLE_TO_FRONTEND` (in `AuthContext.jsx`), and each
> frontend role maps to its panel base via `ROLE_BASE` (in `Login.jsx`). The
> existing route bases (`/admin`, `/exam`, `/qec`, …) are preserved unchanged.

### How it works (additive, non-breaking)
- **Username OR email login** — `lmsAuthV2.js` now resolves the submitted
  identifier by `username` first, then falls back to `email` (case-insensitive).
  Existing username-only logins are unaffected.
- **Schema** — added an **optional, nullable, unique** `email` field to
  `LmsUser`. Existing rows (all `email = NULL`) remain valid and still log in by
  username. No data loss.
- **Idempotent seeding** — `backend/prisma/seedDemoAccounts.js` upserts the
  seven accounts keyed on the unique `username`. Re-running never creates
  duplicates and never touches real user/role data. Demo accounts are created
  with `mustChangePassword = false` so they enter their panel immediately.
- **Auto-provision on boot** — `server.js` runs the same seed as a startup
  initializer, so the demo accounts always exist after the backend boots.
  Disable with `DISABLE_DEMO_SEED=1` if ever undesired.
- **RBAC isolation** — each role can access **only** its own panel.
  `LmsProtectedRoute` redirects unauthenticated users to `/login`, users with
  `mustChangePassword` to `/force-change-password`, and authenticated users
  hitting another role's routes to a **403 Access Denied** page.

### Run the seed manually
```bash
cd backend
npm run prisma:seed:demo   # idempotent — safe to re-run any time
```

### Verification ✅
- All **7** accounts present in the real DB (`LmsUser`), bcrypt-hashed.
- All **7** log in successfully by **username** and by **email** → valid JWT +
  correct role returned.
- Negative cases (wrong password / unknown user) correctly rejected with
  `Invalid Username or Password`.
- Idempotency confirmed — re-seeding (and startup re-seed) keeps exactly 7 rows.
- RBAC confirmed — wrong-role access yields the 403 Access Denied page.

---

## 🆕 Phase 5 — Exam Controller Module: 100% Complete (Latest)

The **Exam Controller** role (frontend base `/exam`, LMS user `exam1` / `Lms@1234`,
DB role `ExamController`) is now **fully implemented and verified** — every module has a
real backend, Prisma-backed persistence, JWT auth, RBAC, validation, audit logging,
notifications and a fully wired UI. **No mock data, placeholders, disabled buttons or
disconnected screens remain.** The **Provost** keeps read-only oversight via
`lmsRequireRole('ExamController','Provost')`.

### Exam Controller modules (all live)
| Module (route) | Capability |
| --- | --- |
| Dashboard (`/exam`) | Live KPIs from real tables |
| Exam Scheduling (`/exam/schedule`) | Create/publish/approve/lock + **offering picker + live clash detection** (room/teacher/student/offering) |
| Seating & Attendance (`/exam/seating`) | **Auto seat-generation** with capacity validation + per-room allocation viewer + **attendance verification** (PRESENT/ABSENT/LATE/UFM/EXEMPT) |
| Invigilators (`/exam/invigilators`) | Assign/remove invigilators |
| Paper Management (`/exam/papers`) | **Secure upload/download**, auto version tracking, review/approve/reject/lock chain |
| Marks Management (`/exam/marks-correction`) | **Editable marksheet per offering**, live %-preview, save+grade recompute, **compile from gradebook**, plus result publishing |
| Result Hold/Release, Gazette, Probation | Result lifecycle + freeze/lock enforcement |
| Transcripts (`/exam/transcripts`) | **Generate, verify, approve/revoke, QR/verification code**, semester-wise viewer + print/PDF |
| Rechecking (`/exam/rechecks`), UFM (`/exam/ufm`), Absentees (`/exam/absentees`) | Full case workflows |
| Reports (`/exam/reports`), Analytics (`/exam/analytics`) | **CSV exports** (gazette/probation/incomplete/absentees) |
| Activity Logs (`/exam/activity-logs`) | Audit trail |
| Settings (`/exam/settings`) | **Profile update + secure password change** (current-pw verify, strong-pw policy) |

### APIs implemented (this phase) — `/api/lms/academic/exam/*`
`GET /counts` · `GET /offerings` · `GET /schedules/clash-check` ·
`GET /offerings/:id/marksheet` · `PUT /offerings/:id/marks` · `POST /offerings/:id/compile` ·
`GET /seating/rooms-suggestion` · `POST /seating/auto/:examId` · `GET /seating/:id/allocations` ·
`POST /papers/upload` · `GET /papers/:id/download` ·
`POST /exams/:examId/attendance/bootstrap` · `GET /exams/:examId/attendance` · `PUT /exams/:examId/attendance` ·
`POST /transcript/:id/issue` · `GET /transcripts` · `GET /transcripts/:id` · `PUT /transcripts/:id/action` ·
`GET /reports/:kind/export` · `GET/PUT /me`, `/me/profile`, `/me/password` ·
**Public:** `GET /api/lms/academic/exam-verify/:code` (no-auth transcript verification)

### New DB tables
- **ExamAttendance** — per-exam attendance/UFM verification (unique `examId+studentId`)
- **TranscriptRecord** — issued transcripts with unique `verificationCode`, status chain, JSON snapshot

### Verification ✅
- Marks save+recompute: 18/20·12/15·20/25·35/40 (weights 20/15/25/40) → **85% = A = 4.0 GP**
- Auto-seat: 7 students → Hall-1(4)+Hall-2(3) with capacity validation
- Attendance bootstrap: 7 PRESENT; clash-check correctly flags room conflicts
- Transcript issue → public verify `valid=true`; CSV export OK
- RBAC: Provost read 200 / write 403; Teacher 403; no token 401
- Frontend `npm run build` ✅ (2702 modules); dynamic sidebar badges replace hardcoded `3`/`5`

---

## 🆕 Phase 3 — Course Coordinator Module: 20 Admin Pages Wired to Real APIs

The **Course Coordinator** role (frontend base `/admin`, LMS user `coord1`) is now
**100% complete** — every one of the **20 routed admin pages** renders live data from
the production backend (`/api/lms/academic/coordinator/*` and `/api/lms/academic/*`).
**All mock data, placeholders and TODO stubs removed** from the routed admin surface.

### Completed Modules (20 routed admin pages, all live)
| Page (route) | Backend source | Capability |
|---|---|---|
| Dashboard `/admin` | `dashboard`, `teachers`, `analytics` | KPIs, enrolment & grade charts, course progress, faculty load, alerts |
| Course Management `/admin/courses` | `structure.courses` CRUD + `curriculum` | Catalog CRUD + per-program curriculum view |
| Degrees/Programs `/admin/degrees` | `programs` + `createProgram`/`updateProgram` | Program CRUD |
| Subjects/Schemes `/admin/subjects`,`/admin/schemes` | → `AdminCourses` | Catalog (shared) |
| Sections `/admin/sections` | `structure.offerings` + `createSection`/`updateSection`/`deleteSection` | Per-offering section CRUD |
| Teacher Management `/admin/teachers` | `teachers` + `workload` | Read-only faculty + workload modal |
| Teacher Assignment `/admin/teacher-assignment` | `allocation` + `assignTeacher` | Reassign instructor per offering |
| Teacher Replacement `/admin/teacher-replacement` | `allocation` + `teachers` + `replaceTeacher` | Atomic instructor replacement (data auto-transfer) |
| Students `/admin/students` | `students` | Live roster, search, pagination, CSV |
| Enrollments `/admin/enrollments` | `allocation` | Enrolment per offering grouped by semester |
| Student Allocation `/admin/student-allocation` | `allocation` + `students` | Section fill / capacity distribution |
| Class Monitoring `/admin/class-monitoring` | `monitorAttendance` + `monitorAssessments` | Attendance & assessment monitoring |
| Reports `/admin/reports` | `analytics` + `report(kind)` | KPI charts + 5 tabular reports + CSV |
| Approvals & Escalations `/admin/appeals` | `approvals`/`decideApproval` + `escalations`/`escalationAction` | Unified decision console |
| Announcements `/admin/announcements` | `announcements` CRUD | Create/delete announcements (ALL/STUDENTS/TEACHERS) |
| Quick Messages `/admin/quick-messages` | `messageContacts`/`conversation`/`sendMessage` | Live DM console |
| Course Load Board `/admin/schedule` | `allocation` | Teaching load by semester (live, no fake timetable) |
| Settings `/admin/settings` | `auth/me` + `changePassword` + `notifications`/`readNotification`/`readAllNotifications` | Profile, password change, live notifications, theme |

### APIs Implemented / Consumed (coordinator namespace, all HTTP 200)
`dashboard, planning, curriculum, allocation, teachers, assignTeacher, replaceTeacher, workload, monitorAttendance, monitorAssessments, monitorResults, monitorProgress, offeringResults, approveResults, approvals, approval, createApproval, decideApproval, escalations, escalation, createEscalation, escalationAction, announcements, createAnnouncement, deleteAnnouncement, messageContacts, conversation, sendMessage, report, analytics, audit, notifications, readNotification, readAllNotifications, students, changePassword`
+ structure: `programs, createProgram, updateProgram, courses (CRUD), offerings, offeringSections, createSection, updateSection, deleteSection`.

### Database Tables Used
`LmsUser, Program, Semester, Course, CourseOffering, Section, Registration, AttendanceSession, AttendanceRecord, Assignment, AssignmentSubmission, Quiz, QuizAttempt, Result, Approval, Escalation, Announcement, Message, Notification, AuditLog`.

### Permissions / RBAC
- All reads guarded by `COORD_OR_GOV`; all mutations by `COORD` (CourseCoordinator). Structure CRUD by `MANAGE` (CourseCoordinator/Provost/FocalPerson).
- Verified: **student → 403**, **no-token → 401** on coordinator endpoints.

### Notifications / Workflows
- **replaceTeacher** atomically moves offering + sections and notifies both outgoing & incoming teachers.
- **createAnnouncement** fans out notifications to the chosen audience.
- **Approvals** workflow (PENDING→IN_REVIEW→APPROVED/REJECTED/ESCALATED) and **Escalations** workflow (OPEN→IN_PROGRESS→ESCALATED→RESOLVED/CLOSED) both wired with decision notes + audit logging.
- All coordinator mutations write to **AuditLog**.

### Testing Results ✅
- `npm run build` (lms-frontend): **2699 modules transformed, success** (bundle shrank 2,328→2,271 kB after mock removal).
- Endpoint smoke test (real `coord1` JWT): allocation, offerings, students, teachers, messageContacts, notifications → **all 200**.
- Mutations verified end-to-end: createSection/updateSection/deleteSection (201/200/200), readNotification + read-all (200), **replaceTeacher round-trip** (reassign + revert, data preserved).
- RBAC: student→403, anonymous→401.
- **Zero** `from "../../data/*"` mock imports in any of the 20 routed admin pages.

### Bugs Fixed
- Corrected coordinator API base confusion (routes mounted at `/api/lms/academic/coordinator`, not `/api/lms/coordinator`).
- Added missing `structure.offeringSections/updateSection/deleteSection` + `coordinator.changePassword` helpers to `api.js`.
- Removed non-functional theme "System" option (ThemeContext only models light/dark).

### Remaining Work
- **Phase 4 Focal Person** (`/focal`), **Phase 5 Exam Controller** (`/exam`), **Phase 6 Director QEC** (`/qec`), **Phase 7 Provost** (`/provost`) — backend + frontend + tests.
- `pages/admin/Subjects.jsx` is dead code (not routed; `subjects` route uses `AdminCourses`) — left untouched to avoid restructuring.

---

## 🆕 Phase 14 — LMS Academic Core: Frontend Wired to Real APIs

The Student + Teacher **Academic Core** of the new LMS is now fully functional
end-to-end. The LMS frontend (`lms-frontend/`, React 19 + Vite, dev port **5174**)
no longer uses **any** mock data for the academic-core pages — every page renders
live data from the production backend (`/api/lms/academic/*`).

### Architecture (extends existing system — no new project/DB/auth)
- Reuses the existing **SQLite + Prisma** database and the new **`LmsUser` / `lmsAuth`** JWT system (token `{userId, role, system:'lms'}`, 30-min TTL; stored in `localStorage` as `lms_token` + `lms_role`).
- 7 LMS roles (canonical → frontend base): `Student→/student`, `Teacher→/teacher`, `CourseCoordinator→/admin`, `FocalPerson→/focal`, `ExamController→/exam`, `QECCoordinator→/qec`, `Provost→/provost`.
- Grading on **AUST 4.0 GPA scale** (A=85+→4.0 … F→0.0, PASS=50%); weighted totals (assignment/quiz/mid/final default 20/15/25/40). MCQ/TRUEFALSE quizzes **auto-graded** (answer = option index string); SHORT answers flagged for manual review.

### Frontend data pattern
- `useApi(fetcher, deps)` → `{data, loading, error, reload, setData}`.
- Every page renders **Skeleton** (loading) → **ErrorState** (error) → **EmptyState** (empty) → real data. Shared components in `lms-frontend/src/components/common/`.
- API client: `lms-frontend/src/services/api.js` (`api.student.*`, `api.teacher.*`, `fileUrl()`); host auto-rewrite maps the sandbox `5174-…` host → `5000-…` backend.

### Student pages (all live)
- **Dashboard** `/student` — stats (active courses, pending assignments, upcoming quizzes, results, attendance %, CGPA) + enrolled courses.
- **Courses** `/student/courses` + **Course Detail** `/student/courses/:offeringId` (attendance summary, weights, materials w/ download, announcements).
- **Registration** `/student/registration` — available offerings + register / registered state.
- **Attendance** `/student/attendance` — per-course %, bar + pie charts, detailed table.
- **Assignments** `/student/assignments` — list + filter + **real file-upload submit** (FormData).
- **Quizzes** `/student/quizzes` — quiz-taking modal; answers posted as `{questionId: optionIndex}`; auto-grade result shown.
- **Results** `/student/results` — transcript: CGPA, per-term GPA, GPA progression chart.

### Teacher pages (all live)
- **Dashboard** `/teacher` + **My Courses** `/teacher/subjects`.
- **Manage Offering** `/teacher/offerings/:offeringId` — comprehensive 6-tab manager: **Students · Attendance · Assignments · Quizzes · Gradebook · Announcements** (create sessions + mark roster, create/grade assignments, create quizzes + questions + publish, editable gradebook → save + publish results, post announcements). Supports `?tab=` deep-linking.
- Legacy sidebar items (**Assignments / Quizzes / Marks / Attendance / Students / Announcements**) are now API-driven **course-picker landing pages** (`OfferingPicker`) that list the teacher's real offerings and deep-link into the matching Manage-Offering tab — **all mock data removed**.

### Backend hardening (this phase)
- **Security**: added recursive response **sanitizer** (`backend/src/utils/lmsHelpers.js` → `sanitize()` + `SENSITIVE_KEYS`) mounted as middleware on `/api/lms/academic/*` in `server.js` — strips `passwordHash`, `failedLoginAttempts`, `lockedUntil`, `resetToken*` from **all** academic responses. Verified: **0** `passwordHash` leaks.
- **Upload fix**: `backend/src/middleware/upload.js` now resolves the uploader id via `req.user?.id || req.lmsUser?.id || 'anon'` (was `req.user.id`, undefined on LMS routes) — assignment submissions now save correctly to `/uploads/lms-submissions/`.

### Verification ✅
- `npm run build` (lms-frontend): **2700 modules transformed, success**.
- Smoke test of **18 academic endpoints** (10 teacher + 8 student) via real JWT: **all HTTP 200**.
- Login page renders clean in browser (no console errors). Backend + frontend both online under PM2 (`aust-backend:5000`, `lms-frontend:5174`).

### Test LMS accounts (password `Lms@1234`, `mustChangePassword=false`)
| Username | Role |
|----------|------|
| `teacher1` | Teacher |
| `coord1` | CourseCoordinator |
| `ADCS-001` (Ali Khan), `ADCS-002`, `ADCS-003` | Student |

### Next phases
- Coordinator/Admin academic modules, then complete all remaining LMS roles (focal_person, exam_coordinator, director_qec, provost, finance).

---

## 🆕 Phase 12 — Multi-Role Platform, Dynamic Departments, Unified Cycle, LMS Credentials

This round added a full **Super Admin** tier, **dynamic department/program
management**, a **single unified admissions-cycle announcement**, **per-program
merit finalization**, and the **ADCS roll/registration & LMS credential** flow —
all **without breaking** the existing login, landing, application form,
shortlisting, interview scheduling, or appeals workflows.

### Role naming (Section 8)
The word "Admin" is never shown in the UI except for **"Super Admin"**. Roles map to:
| Role (DB) | Dashboard label |
|---|---|
| `super_admin` | **Super Admin Dashboard** |
| `director_admissions` (+ legacy `admin`) | **Director Dashboard** |
| `coordinator` | **Coordinator Dashboard** |
| `student` (no enrollment) | **Applicant Portal** |
| `student` (enrolled) | **Student Transition Page** |

### Super Admin Dashboard (Section 9) — `frontend/src/pages/SuperAdminDashboard.jsx`
- **Overview**: system-wide stats (total/active/inactive users, applications, enrolled, departments), users-by-role table, and per-department / per-program stats.
- **Users**: list & filter by role/search, activate/deactivate (with self-deactivation guard), reset password (shows a one-time temporary password), and change role assignment for non–Super-Admin users.
- **Departments**: read-only overview of every department, its coordinator, and its programs.
- Backed by `GET/PATCH/POST /api/super-admin/*` — guarded so only `super_admin` may call (other roles get **403**).

### Dynamic Departments & Programs (Section 4)
- The **Director** creates and manages departments dynamically: Name, Programs (each with **Full name + Short form**), and exactly **one Coordinator** (chosen from existing users or created on the spot).
- A **Coordinator** sees **only their own department's** applicants, merit, and exports — enforced at the **backend API level** (`attachCoordinatorScope` middleware → 403 on out-of-scope access), not just hidden in the UI.

### Unified Admissions Cycle (Sections 5 & 6)
- The separate "Admissions Control" and "Fee Management" menus are gone. A single **"Announce Admissions Cycle"** form captures: Session Name, open/close dates, multi-select programs, and **per-program** merit criteria, minimum marks %, total seats, and a fee breakdown with an **auto-calculated total**.
- **Fee is shown to a student only once they appear on the finalized merit list** (`FeeSection` `isOnMeritList` gate).

### Per-Program Merit (Section 7)
- Director Applications/Merit are grouped **Department → Program**. Each program is **finalized / reopened independently** (`POST /api/merit/finalize` & `/reopen` accept a `programId`).
- Merit lists download **per program** and **all-at-once**, named **`MeritList_<ProgramShortForm>_<SessionName>.pdf`**.
- Coordinators only see/act on their own department's programs.

### ADCS Roll/Registration & LMS Credentials (Fix #6 & Fix #7)
- **ADCS only** receives auto-generated identifiers: Registration `001f26c0106101`, Roll `ADCS-f26-101` (format-preserved).
- **Non-ADCS** enrollments show: *"Your enrollment is confirmed. Roll Number and Registration Number will be assigned shortly. You will be notified."* — and get **no LMS** access.
- ADCS students see an **Enrollment Confirmed card** with ✅ status, Registration Number, Roll Number, **LMS Username (= Roll Number)**, and an 8–12 char alphanumeric **temporary password**. The card persists until first LMS login.
- **LMS login** (`/api/lms-auth/*`, username = Roll Number) forces a **strong password change** (≥8 chars, uppercase + number + special) on first login, then shows an **"Under Construction"** page. The LMS uses a separate `scope:'lms'` JWT.

---

## 🔥 Critical Bug-Fix Round

This patch round resolved **9 specific defects** reported against the prior release. All fixes are surgical — no schema changes, no permission changes, LMS / merit / enrollment flows untouched.

### Fix #1 — Document Preview Mapping
- **Bug**: CNIC preview showed unrelated file; receipt preview showed photo; photo showed AUST logo.
- **Root cause**: `POST /api/profile/photo` created a new `Document(type=photo)` row on every upload without deleting the previous one, so the same user accumulated multiple `type=photo` rows that ZIP routing then mis-classified as "Additional_Documents".
- **Fix**: `backend/src/routes/profile.js` now calls `prisma.document.deleteMany({ where: { userId, type: 'photo' } })` **before** creating a fresh row. CNIC/DMC routes already had this dedup.

### Fix #2 — AUST Logo Missing in PDFs
- **Bug**: Logo absent from Director/Coordinator/Admin downloads.
- **Root cause**: The file `aust-logo.png` had a `.png` extension but its bytes were JPEG (`FF D8 FF`). Headless-Chrome PDF renderers reject `data:image/png;base64,<jpeg-bytes>`.
- **Fix**: In `backend/src/routes/printApplication.js` added `sniffImageMime()` magic-byte detector and `LOGO_CANDIDATES` array (tries `aust-logo.jpg`, `aust-logo.jpeg`, `aust-logo.png`, then dir scan). Also created `backend/uploads/branding/aust-logo.jpg` with the correct extension. Verified: PDF now embeds `data:image/jpeg;base64,/9j/4AAQ…` (real JPEG magic bytes).

### Fix #3 — PDF Alignment & Document Order
- **Bug**: Misaligned text/images, missing documents, no clear order.
- **Fix**: Document checklist rebuilt with explicit ordering helper:
  `Form → Declaration → CNIC F → CNIC B → Photo → Father CNIC → Matric DMC → Matric Cert → FSC DMC → FSC Cert → Migration → Char Cert → Receipts → Additional`.
  Uses `pushDoc(section, label, file, sortKey)` + `orderLevel/orderDocType` for deterministic sort. No more page-numbered "1/9" footers.

### Fix #4 — Re-forwarded Application Not Showing to Coordinator
- **Bug**: After Director accepted a Coordinator appeal and re-forwarded, the application stayed labeled "Interview Disqualified" in the Coordinator panel and was invisible in "Needs Scheduling".
- **Root cause**: Backend re-forward already worked (resets `interview.decision=PENDING`, status `FORWARDED`). But frontend `needsScheduling` filter required `!a.interview`, so apps with stale `DISQUALIFIED` interview + accepted appeal fell through every filter and were hidden.
- **Fix**: `frontend/src/pages/CoordinatorDashboard.jsx` `needsScheduling` filter now also includes apps where `status === 'FORWARDED'` + `interview.decision === 'DISQUALIFIED'` + accepted `INTERVIEW_DISQUALIFICATION` appeal exists.

### Fix #5 — Interview-Appeal Routing
- **Spec**: `INTERVIEW_DISQUALIFICATION` appeals must go **only** to the Coordinator, never to the Director.
- **Verification**: `backend/src/routes/appeals.js` lines 43-48 already filter correctly. API smoke test confirmed:
  - Coordinator `GET /api/appeals` → `{ INTERVIEW_DISQUALIFICATION: 1 }` only
  - Director `GET /api/appeals` → `{ APPLICATION_REJECTION: 2 }`, zero INTERVIEW_DISQUALIFICATION
- No code change required; the bug was elsewhere (Fix #4).

### Fix #6 — Re-Interview on Same Application
- **Spec**: When Coordinator ACCEPTS an interview appeal, "Reschedule Interview" must operate on the same application (no duplicate apps, history preserved).
- **Fix**: `handleSchedule()` in `CoordinatorDashboard.jsx` auto-detects retake (`interview.decision==='DISQUALIFIED'` + accepted appeal) and posts to `/coordinator/interview/retake` instead of `/coordinator/interview`. The retake endpoint updates the **same `Interview` row** (resets `status=SCHEDULED`, `decision=PENDING`, `marks=null`) and logs the prior outcome to `StatusEvent`. Dropdown shows 🔁 **RETAKE** prefix and an info banner.
- **Verified**: `POST /api/coordinator/interview/retake` returned `{ interview: { id: 2, status: SCHEDULED, decision: PENDING } }` — same row (id 2) reused.

### Fix #7 — Interview Status Reset (Visual)
- **Bug**: "Interview Disqualified" badge stayed red after appeal accepted.
- **Fix**: `frontend/src/components/dashboard/ApplicationSection.jsx` computes `isRetakePending` and renders a **yellow** "Retake Interview Pending" card instead of the red "Disqualified" one when an accepted `INTERVIEW_DISQUALIFICATION` appeal exists on a `FORWARDED` application.

### Fix #8 — System Safety
- No DB schema changes
- No permission/role changes
- No removed endpoints
- LMS, merit list, enrollment, payments, captcha, notifications — all untouched
- All edits are surgical and non-breaking

### Fix #9 — End-to-End Verification ✅

| Check | Result |
|---|---|
| `POST /api/auth/login` (Coordinator/Student/Director) | ✅ All 200 |
| `GET /api/coordinator/applications` shows retake-eligible app #1 | ✅ `status=FORWARDED`, `interview.decision=DISQUALIFIED`, `accepted_interview_appeals=1` → `isRetakeEligible: true` |
| `GET /api/applications` (student) embeds accepted appeal | ✅ `isRetakePending: true` → UI shows 🟡 "Retake Interview Pending" |
| `GET /api/appeals` role isolation | ✅ Coordinator sees only INTERVIEW_DISQUALIFICATION; Director sees no INTERVIEW_DISQUALIFICATION |
| `POST /api/coordinator/interview/retake` | ✅ Same Interview row id reused, decision reset to PENDING |
| `/print-application/1` | ✅ HTTP 200, 131,699 bytes, logo embedded as `data:image/jpeg` |
| `/admission-package/1` ZIP | ✅ HTTP 200, 372,631 bytes, 9 files in correct folders (Student_Photo/, CNIC/, Matric/, FSC/) — no cross-wiring |
| Backend `/api/health` | ✅ HTTP 200 |
| Frontend `/` | ✅ HTTP 200 |

---

## 🆕 Phase 11 — Backup & Export Center (Latest)

Pure **additive** feature — **no existing workflow, form, admission flow, or
enrollment flow was modified**. A new "Backups & Exports" tab is now available
inside both the Director and Coordinator dashboards.

### Endpoints (mounted at `/api/exports/*`, role-guarded)
| Path | Output | Description |
|---|---|---|
| `GET /api/exports/stats` | JSON | `{ cycle, totalApplicants, totalEnrolled, totalMerit }` — used to power the confirmation modal |
| `GET /api/exports/all-applicants` | ZIP (streamed) | `<Cycle>_All_Applicants_Backup.zip` — every applicant in their own `Name_CNIC/` folder |
| `GET /api/exports/enrolled-students` | ZIP (streamed) | `<Cycle>_Enrolled_Students_Backup.zip` — every enrolled student in their own `Student_Name_CNIC/` folder |
| `GET /api/exports/individual/:applicationId` | ZIP | `Name_CNIC.zip` (folder inside: `Name_CNIC/`) — replaces the legacy name-only download |
| `GET /api/exports/merit-list?format=xlsx\|csv` | Excel / CSV | Name, CNIC, Program, Merit Score, Status, Remarks |
| `GET /api/exports/enrolled-list?format=xlsx\|csv` | Excel / CSV | Student Name, CNIC, Student ID, Program, Semester, Fee Status, Enrollment Date |

### Key properties
- **Streaming ZIP** via `archiver` — server doesn't buffer; safe for 1000+ records.
- **Paginated DB reads** — 50 applicants per batch via Prisma `skip/take` → bounded memory.
- **Per-record `try/catch`** — one corrupted record cannot abort the whole archive.
- **Missing files are skipped**, not fatal (per spec).
- **Role-guarded** — only `director_admissions` / legacy `admin` / `coordinator`.
- **Token-via-query supported** (`?token=…`) so plain `<a href>` clicks stream downloads — matches the existing `/print-application/:id` pattern.
- **Confirmation modal** in the UI before kicking off a bulk ZIP (shows record count + size warning).
- **Per-applicant folder layout** inside the ZIP:
  - `application_data.json` — full structured snapshot
  - `Profile_Photo/photo.*`
  - `CNIC/cnic_front.*`, `CNIC/cnic_back.*`
  - `Father_CNIC/…`
  - `Matric/dmc.*`, `Matric/certificate.*`, `Matric/char_cert.*`
  - `FSC/dmc.*`, `FSC/certificate.*`, `FSC/char_cert.*`, `FSC_Part1/part1_dmc.*`
  - `Receipts/processing_fee_receipt.*`, `Receipts/admission_fee_receipt.*`
  - `Appeals/appeal_proof_*.pdf`
  - `Additional_Documents/…`
  - `README.txt` (per-applicant summary)
- **Individual Download Fix** — the existing per-row "Download ZIP Package" button is now repointed from `/admission-package/:id` to `/api/exports/individual/:id`, so the file is named `Name_CNIC.zip` (was `Name.zip`).

### Files added / modified
- **NEW**: `backend/src/routes/exports.js` (~38 KB, 6 endpoints, streaming ZIP + Excel/CSV)
- **NEW**: `frontend/src/components/dashboard/BackupsExportsSection.jsx` (shared section + confirmation modal)
- **MODIFIED**: `backend/src/server.js` — mount `app.use('/api/exports', exportRoutes)`
- **MODIFIED**: `backend/package.json` — added `exceljs ^4.4.0`
- **MODIFIED**: `frontend/src/pages/AdminDashboard.jsx` — sidebar entry, section switch, individual-download repoint
- **MODIFIED**: `frontend/src/pages/CoordinatorDashboard.jsx` — sidebar entry, section switch, individual-download repoint

---

## 🆕 Latest Release — Highlights

This release ships **9 critical improvements** requested by the user:

### 1️⃣ Professional Admission-Form PDF Layout
- Complete rewrite of `backend/src/routes/printApplication.js`
- A4-sized HTML with `@page` rules, `page-break-inside: avoid` on every section
- 3-column header grid: **University Logo (96×96) | Title (centered) | Student Photo (110×132 passport)**
- Gradient section headers `linear-gradient(90deg, #1e3a8a, #2563eb)` for visual clarity
- Aligned tables for Personal, Education, Documents and Payment sections
- Page numbering, consistent typography, responsive small-screen fallback
- Print-media overrides hide all browser chrome on print

### 2️⃣ University Logo in PDF & Print Mode
- AUST logo stored at `backend/uploads/branding/aust-logo.png` (40 KB)
- Embedded as `base64 data: URL` so the saved PDF/HTML carries the image **offline**
- Renders in HTML preview, the ZIP-package's HTML, and on physical printouts

### 3️⃣ Complete ZIP-Package Download
- New endpoint: **`GET /admission-package/:id?token=...`** (streams via `archiver`)
- Folder structure:
  ```
  Admission_Package_<FirstName>_<LastName>_App<id>/
  ├── Admission_Form.html       ← Self-contained printable form
  ├── README.txt                ← Package contents manifest
  ├── Student_Photo/            ← Passport-size photo
  ├── CNIC/                     ← CNIC front + back
  ├── Matric/                   ← Matric DMC + certificate + character cert
  ├── FSC/                      ← FSc DMC + character cert (declared result)
  ├── FSC_Part1/                ← FSc Part-I DMC (when result awaited)
  ├── Additional_Documents/     ← Domicile, Migration cert (if uploaded)
  ├── Receipts/                 ← Processing fee + Admission fee proofs
  └── Appeals/                  ← Appeal proofs (if any)
  ```
- Action buttons added in:
  - **Student** dashboard → `ApplicationSection.jsx` (`Download Full Package (ZIP)`)
  - **Coordinator** dashboard → table & modal action bars
  - **Admin/Director** dashboard → table & modal action bars

### 4️⃣ Updated FSc Section Logic
- **"Result Waiting"** → shows ONLY FSc Part-I fields (group, marks, percentage, board, year, DMC, character cert)
- **"Result Declared"** → shows complete FSc fields (group, total/obtained marks, percentage, board, year, DMC, character cert)
- Header info banner updated with clearer bullet-list instructions

### 5️⃣ Removed FSC Certificate Field
- Removed from frontend `EducationSection.jsx` form rendering
- Removed from `computeDocErrors()` validation — no longer required
- Backend whitelist (`VALID_DOC_TYPES`) kept for backward-compat but never validated as required
- Existing student records that already uploaded a certificate remain intact

### 6️⃣ Migration Certificate Stays Optional
- Slot exists in backend `VALID_DOC_TYPES` but never required
- Students can apply without it
- If uploaded, it is saved and included in the ZIP package under `Additional_Documents/`

### 7️⃣ PDF System Improvements
- A4 page sizing with proper margins
- `page-break-inside: avoid` on tables/lists
- Print-media overrides for clean physical output
- Consistent typography across sections
- Gradient section headers for visual hierarchy
- Responsive fallback for small-screen previews

### 8️⃣ Existing Workflow Preserved
- No breaking changes to existing student records
- Legacy `frontend/src/utils/applicationPdf.js` (client-side pdf-lib) kept intact for admin merged PDFs
- All existing API endpoints unchanged
- Prisma schema unchanged

### 9️⃣ Interview Appeal Management System
- **Student-only Appeal Button**
  - Shown only when `app.status` is `REJECTED` or `DISQUALIFIED`
  - Hidden once an appeal is `PENDING` (prevents duplicate submissions)
- **Modern Modal UI** — gradient header, routing banner, file upload with hint, spinner during submission, animated fade-in
- **Coordinator-only Routing**
  - `INTERVIEW_DISQUALIFICATION` appeals → Coordinator only
  - `APPLICATION_REJECTION`, `FEE_REJECTION`, `GENERAL` → Director only
  - Enforced both in `GET /api/appeals` (list filtering) and `PUT /api/appeals/:id/decision` (permission check)
- **Coordinator Dashboard** — `CoordinatorAppealsSection` with:
  - Pending appeals queue with student info, previous interview details, proof file preview
  - Accept / Reject with required response message
  - Retake-interview scheduling form (date, time, venue, meeting link — auto-detects Zoom/Meet/Teams URLs)
  - Student receives notification with meeting link on retake schedule
- **Status Colours (matches spec)**
  - 🟡 Pending → `#fef9c3` / `#854d0e` (yellow)
  - 🔵 Under Review → `#dbeafe` / `#1e40af` (blue)
  - 🟢 Accepted → `#dcfce7` / `#166534` (green)
  - 🔴 Rejected → `#fee2e2` / `#991b1b` (red)
- **Notifications** — student notified on submission, on coordinator decision, and on retake scheduling
- **Appeal History Timeline** — each appeal card shows submitted date, decided date, reviewer role, message, and response

---

## Currently Completed Features

### Authentication & Security
- Email + password login with bcrypt-hashed passwords
- JWT token-based session (24h expiry) with role-based middleware (`requireStudent`, `requireCoordinator`, `requireDirectorAdmissions`)
- Math CAPTCHA on register / login
- Token-via-query-param support (`?token=...`) for printable PDF/ZIP links

### Student Workflow
- Register → verify email (logged to console if SMTP not configured)
- Build profile (personal, address, parents/guardian)
- Upload CNIC front+back, student photo
- Add Matric record + upload DMC, certificate, character cert
- Add FSc record:
  - **Result Waiting** → FSc Part-I only (group, marks, %, board, year, DMC, char cert)
  - **Result Declared** → full FSc fields
- Optional: upload Domicile / Migration Certificate
- Apply to ADP CS program
- Pay processing fee via EasyPaisa or upload manual receipt
- View application status with progress tracker
- Submit appeal when REJECTED or DISQUALIFIED
- Update final FSc result when declared
- Pay admission fee on selection (FEE_PENDING)
- Receive enrollment with roll number, registration number, LMS credentials

### Director Workflow
- Review submitted applications
- Forward to coordinator OR reject with reason OR ask for more info
- Decide non-interview appeals (APPLICATION_REJECTION, FEE_REJECTION, GENERAL)
- Verify admission-fee receipts → enrollment finalised
- View all applications, students, programs, bank accounts
- Configure cycle (open/close, fee, min marks)

### Coordinator Workflow
- Receive FORWARDED applications
- Schedule interviews (date/time/venue/meeting link)
- Record interview decision (QUALIFIED with marks 0-100 / DISQUALIFIED with mandatory reason)
- Auto-generate merit list
- **Decide INTERVIEW_DISQUALIFICATION appeals** (Accept → schedule retake; Reject with reason)
- Schedule retake interviews (preserves previous interview history)

### Document & PDF System
- Server-rendered printable admission form (`/print-application/:id`) — A4 HTML, ready to Print → Save as PDF
- ZIP-package endpoint (`/admission-package/:id`) — streams all documents in foldered structure
- Logo + student photo embedded as base64 in HTML for offline use
- Legacy client-side pdf-lib merger (kept for admin)

---

## Functional Entry URIs (Path → Method → Purpose)

### Auth (`/api/auth`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/register` | Create student account |
| POST | `/login` | Login (returns JWT) |
| GET | `/me` | Current user profile |
| POST | `/verify-email` | Verify email token |
| GET | `/captcha` | Math captcha |

### Profile / Documents (`/api/profile`, `/api/documents`)
| Method | Path | Purpose |
|--------|------|---------|
| GET / PUT | `/api/profile` | Read / update student profile |
| POST | `/api/documents/upload` | Upload CNIC front/back, DMC, certificates |
| GET | `/api/documents` | List uploaded documents |
| DELETE | `/api/documents/:id` | Delete a document |

### Education (`/api/education`)
| Method | Path | Purpose |
|--------|------|---------|
| GET / POST / PUT / DELETE | `/api/education` | Manage Matric & FSc records (incl. FSc Part-I) |
| POST | `/api/education/:id/documents` | Upload education-related docs (DMC, char cert, migration, domicile) |

### Applications (`/api/applications`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/applications` | List my applications (student) |
| POST | `/api/applications` | Submit new application |
| PUT | `/api/applications/:id/resubmit` | Resubmit after NEED_INFO |
| PUT | `/api/applications/:id/update-result` | Submit final result (Result Awaited → Submitted) |

### Director (`/api/admin`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/applications` | List all applications |
| PUT | `/api/admin/applications/:id/forward` | Forward to coordinator |
| PUT | `/api/admin/applications/:id/reject` | Reject with reason |
| PUT | `/api/admin/applications/:id/need-info` | Ask student for more info |
| PUT | `/api/admin/applications/:id/verify-fee` | Verify admission fee → enrol |

### Coordinator (`/api/coordinator`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/coordinator/applications` | List forwarded/scheduled/completed |
| POST | `/api/coordinator/interview` | Schedule interview |
| PUT | `/api/coordinator/interview/:id/decision` | Record decision (QUALIFIED/DISQUALIFIED) |
| POST | `/api/coordinator/interview/retake` | Schedule retake after appeal accepted |

### Appeals (`/api/appeals`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/appeals` | List appeals (filtered by role: coordinator sees only INTERVIEW_DISQUALIFICATION, director sees others) |
| POST | `/api/appeals` | Submit appeal (`appealType`, `subject`, `message`, `proof` multipart) |
| PUT | `/api/appeals/:id/decision` | Decide appeal (`decision: ACCEPTED|REJECTED`, `response` required for rejection) — role-checked |

### Super Admin (`/api/super-admin`) — `super_admin` only (else 403)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/super-admin/stats` | System-wide stats `{ summary, usersByRole, departmentStats[] }` |
| GET | `/api/super-admin/users` | All users (`?role=`, `?q=`) with `roleLabel`, `managedDepartment` |
| PATCH | `/api/super-admin/users/:id/status` | Activate / deactivate a user (self-deactivation blocked) |
| POST | `/api/super-admin/users/:id/reset-password` | Reset password → returns one-time `temporaryPassword` |
| PATCH | `/api/super-admin/users/:id/role` | Change role assignment (non–super-admin targets) |
| GET | `/api/super-admin/departments` | All departments with coordinator + programs |

### Departments & Admissions Cycle (`/api/departments`, `/api/admission-cycle`) — Director / scoped Coordinator
| Method | Path | Purpose |
|--------|------|---------|
| GET / POST | `/api/departments` | List / create department (name, programs[Full+Short], one coordinator existing or `newCoordinator{email,username,password}`) |
| POST | `/api/admission-cycle/announce` | Announce unified cycle (`title`, dates, weights, `programs[]` with `meritCriteria`, `minMarksPercent`, `totalSeats`, `feeBreakdown`) |

### Merit (`/api/merit`) — Director (all) / Coordinator (own dept, scoped)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/merit` | Merit entries (program → department included) for grouping Dept→Program |
| POST | `/api/merit/finalize` | Finalize merit; pass `{ programId }` to finalize a single program independently |
| POST | `/api/merit/reopen` | Reopen merit; pass `{ programId }` to reopen a single program |

### Enrollment (`/api/enrollment`) — Student
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/enrollment/my` | My enrollment + ADCS credentials card data (`isAdcs`, `rollNumber`, `registrationNumber`, `lmsUsername`, `lmsTempPassword`, `showCredentialsCard`) |

### LMS Auth (`/api/lms-auth`) — ADCS students (separate `scope:'lms'` JWT)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/lms-auth/login` | Login with `username = Roll Number` + temp/permanent password; returns `mustChangePassword` flag |
| POST | `/api/lms-auth/change-password` | Forced first-login strong-password change (≥8, uppercase+number+special) |
| GET | `/api/lms-auth/me` | Current LMS session |

### Print & Package (root mounted)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/print-application/:id?token=...` | Printable A4 HTML admission form (~130 KB with embedded base64 images) |
| GET | `/admission-package/:id?token=...` | Streaming ZIP with all docs (~370 KB+, depends on uploads) |

### Notifications (`/api/notifications`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/notifications` | List notifications |
| PUT | `/api/notifications/:id/read` | Mark read |
| PUT | `/api/notifications/read-all` | Mark all read |

---

## Data Architecture

### Storage Service
- **Database**: SQLite via Prisma at `backend/prisma/dev.db`
- **File Uploads**: Local filesystem at `backend/uploads/{photos,cnic,dmc,education,receipts,branding}/`
- **Static Branding**: AUST logo at `backend/uploads/branding/aust-logo.png` (embedded as base64 in PDFs/ZIPs)

### Core Data Models (Prisma)
- **User** — id, email, password (bcrypt), role (`student | coordinator | director_admissions | admin`), isVerified
- **Profile** — firstName, lastName, fatherName, dob, cnic, gender, religion, nationality, phone, address, photoPath, etc.
- **Education** — level (`matric | fsc | fsc_part1`), group, board, year, total/obtained marks, percentage, resultStatus (`Declared | Waiting`)
- **EducationDocument** — type (`dmc | certificate | char_cert | migration_cert | domicile`), filePath
- **Document** — type (`cnic_front | cnic_back | photo`), filePath
- **Application** — userId, programId, cycleId, status (full lifecycle), rejectionReason, adminRemarks, lastAppealStatus
- **Interview** — applicationId, scheduledDate/Time, venue, meetingLink, status, decision (`QUALIFIED | DISQUALIFIED`), marks, remarks
- **Appeal** — appealType (`APPLICATION_REJECTION | INTERVIEW_DISQUALIFICATION | FEE_REJECTION | GENERAL`), subject, message, proofPath, status (`PENDING | ACCEPTED | REJECTED`), adminResponse, decidedBy, decidedAt
- **StatusEvent** — audit trail of every status change
- **FeePayment** — processing fee + admission fee tracking with EasyPaisa transaction IDs

### Application Status Lifecycle
```
SUBMITTED → UNDER_REVIEW ─┬─ NEED_INFO ─┐
                           ├─ REJECTED ──┴─ (Appeal → Director) ─→ UNDER_REVIEW (restored)
                           └─ FORWARDED → INTERVIEWED → INTERVIEW_COMPLETED ─┬─ QUALIFIED → SELECTED → FEE_PENDING → FEE_PAID → FEE_APPROVED → ENROLLED
                                                                              └─ DISQUALIFIED ─ (Appeal → Coordinator) ─→ FORWARDED (retake)
RESULT_AWAITED ─ (Update Result) ─→ SUBMITTED
```

---

## User Guide

### For Students
1. Register at `/register` with email and password
2. Verify email (or use demo account `student@example.com` / `student123`)
3. Build your profile → upload photo & CNIC front/back
4. Add Matric record + upload DMC, certificate, character cert
5. Add FSc record:
   - If result declared → fill complete marks + DMC + char cert
   - If awaiting result → fill Part-I only + Part-I DMC + char cert
6. (Optional) Upload Domicile / Migration Certificate
7. Apply to ADP Computer Science → pay processing fee
8. Track status via dashboard
9. If REJECTED or DISQUALIFIED → click **Appeal Interview Decision / Submit Appeal**, write your explanation, optionally upload proof
10. Download **Full Package (ZIP)** anytime for offline records
11. Once SELECTED → upload admission-fee receipt → ENROLLED with roll number

### For Director
1. Login at `/login` with director credentials
2. Review submitted applications in dashboard
3. Forward to coordinator / reject with reason / ask for more info
4. Review non-interview appeals → Accept or Reject
5. Verify admission-fee receipts → student becomes ENROLLED
6. View / Download any application's PDF or ZIP

### For Coordinator
1. Login at `/login` with coordinator credentials
2. See FORWARDED applications → schedule interviews
3. Record decisions (QUALIFIED with marks or DISQUALIFIED with reason)
4. Review INTERVIEW_DISQUALIFICATION appeals → Accept (schedule retake) or Reject
5. View merit list

---

## Deployment

- **Platform**: Self-hosted (Node + PM2)
- **Status**: ✅ Active (backend `aust-backend` :5000, frontend `aust-frontend` :3000)
- **Tech Stack**: Express.js + Prisma + SQLite + React + Vite
- **Last Updated**: 2026-07-05 (Phase 1 issue-fix round — role-filtered multi-select staff assignment, SA admission-cycle parity, temp-password display, Payment Gateway config module, LMS dynamic profile + department isolation at query level, SA dashboard Department→Program grouping with filters)

### Quick Start
```bash
# 1. Install dependencies
cd /home/user/webapp/backend && npm install
cd /home/user/webapp/frontend && npm install

# 2. Setup database & seed
cd /home/user/webapp/backend
cp .env.example .env
npx prisma db push --skip-generate
node prisma/seed.js

# 3. Start with PM2 (from project root)
cd /home/user/webapp
pm2 start ecosystem.config.cjs
pm2 list

# 4. Open in browser
# Frontend: http://localhost:3000
# Backend:  http://localhost:5000
```

### Quick Health Check
```bash
curl http://localhost:3000                # Frontend → 200 OK
curl http://localhost:5000/api/health     # Backend  → {"status":"ok"}
pm2 logs --nostream                       # View logs without blocking
```

### Restart Services
```bash
pm2 restart aust-backend --update-env
pm2 restart aust-frontend --update-env
```

---

## Pending / Future Work
- Add automated unit + integration tests (jest + supertest)
- WebSocket-based real-time notifications (currently polled)
- Migrate dev SQLite to PostgreSQL for production
- Export merit list as Excel (currently CSV)
- Add explicit `UNDER_REVIEW` intermediate appeal status (currently appeals go PENDING → ACCEPTED/REJECTED directly)
- E2E tests with Playwright

---

## Recommended Next Steps for Development
1. **Tests** — wire up jest for backend, vitest for frontend
2. **PostgreSQL switch** — change `provider` in `prisma/schema.prisma` from `sqlite` to `postgresql`, set `DATABASE_URL` in `.env`, run `prisma migrate dev`
3. **Real SMTP** — set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` in `.env` for production email
4. **Object storage** — move from local `uploads/` to S3/R2 for scale
5. **Realtime** — add Socket.IO so coordinator sees new appeals instantly

---

## Changelog — Targeted Fixes (Admission Cycle Edit · Department Edit · Fee Management)

Three scoped enhancements were added without altering any existing flow (login,
landing, application form, shortlisting, interview, appeals, merit logic,
roll/registration generation, LMS, exports, or the existing payment submission
flow).

### Fix 1 — Admission Cycle Edit
- **UI**: An **Edit** button next to every cycle in the Director's *Announce
  Admissions Cycle* list. It opens the announce form pre-filled with every
  existing value (session name, start/end dates, and per-program merit criteria,
  minimum marks/%, total seats, and application processing fee). A **Save
  Changes** button shows a loading state, success toast, and inline field errors.
- **API**: `PUT /api/admission-cycle/:id`
  - Validates `title`, dates, and weights; `404` if the cycle is missing;
    `400 { error, field }` on invalid input.
  - Accepts an optional `programs[]` array — each entry upserts its matching
    `CycleProgram` row (`@@unique([admissionCycleId, programId])`), so
    **already-submitted applications are never touched**.
  - Body (per program): `{ programId, meritCriteria, minMarksPercent, totalSeats, feeBreakdown:[{label,amount}] }`

### Fix 2 — Department Edit
- **UI**: An **Edit** button next to every department. Editable: Department Name,
  Assigned Coordinator (chosen from existing coordinator-role users), and each
  program's Full Name + Short Form. Save shows loading/success/error states.
- **API** (already present, now wired to the UI):
  - `PUT /api/departments/:id` — body `{ name, faculty, coordinatorId }`
  - `PUT /api/departments/programs/:programId` — body `{ name, shortForm }`
  - `POST /api/departments/:id/programs` — body `{ name, shortForm }`
- Existing applications, cycles, and merit lists are unaffected.

### Fix 3 — Fee Management (separate from the application processing fee)
A brand-new **Fee Management** tab (💰) for the Director / Coordinator. The
**semester/enrollment fee** managed here is a *distinct* fee from the cycle's
application processing fee.

- **3A — Director side**: Active cycles → departments → programs, each with
  *Set Fee / Edit Fee*. The fee form supports multiple line items (free-text
  label + numeric amount) with an auto-calculated, read-only total, and an
  **Announce Fee** button. Status badges show *Fee Not Announced* / *Announced*
  (with total). A fee stays editable **until any student pays**, after which it
  is **LOCKED**.
- **3B — Student portal**: The previous dead-end (“No fee details available
  yet.”) is fixed. If a fee is announced, the student sees the breakdown table +
  total + the existing **Pay Fee** flow. If on the finalized merit list but no
  fee is announced yet, they see only *“Fee details will be announced shortly.
  You will be notified.”* The amount comes from the Fee Management entry — **not**
  the application processing fee.
- **3C — Payment approval**: A *Pending Payments* sub-section lists student name,
  roll number, program, cycle, amount, and payment proof. **Approve** runs the
  existing enrollment flow (`confirmEnrollment` → roll/registration/LMS
  credentials, status `ENROLLED`). **Reject** requires a reason, notifies the
  student, and lets them resubmit (status back to `FEE_PENDING`). Both show
  loading states and success confirmation.
- **3D — Backend** (`/api/fee-management`):
  - `GET /overview` — Director: all; Coordinator: own department only.
  - `POST /` — create/announce a fee (validates line items, computes total,
    notifies eligible finalized-merit students).
  - `PUT /:id` — update (only while **unlocked**; `400` once locked).
  - `GET /:cycleId/:programId` — student view; only reveals details to students
    on the finalized merit list → `{ announced, eligible, fee:{ lineItems, totalAmount } }`.
  - `GET /payments/pending` — Director (all) / Coordinator (department-scoped).
  - `PATCH /payments/:paymentId/approve` — approve → enrollment.
  - `PATCH /payments/:paymentId/reject` — body `{ reason }`.
- **Data model**: new `FeeStructure { id, cycleId, departmentId, programId,
  lineItems(JSON [{label,amount}]), totalAmount, isLocked(default false),
  createdAt, updatedAt }` with `@@unique([cycleId, programId])` and cascade
  relations to `AdmissionCycle`, `Department`, `Program`. The student fee payment
  (`/api/fee/pay` and `/api/payments/easypaisa/admission-fee`) now reads its
  amount from `FeeStructure.totalAmount` (falling back to the legacy
  announcement) and locks the `FeeStructure` on payment submission.

---

## LMS Integration (Sections 4–12)

The **AUST Learning Management System (LMS)** is integrated as a **separate React
application** living inside this repo at `lms-frontend/`. Its UI/layout/components/CSS
are **unchanged** — only authentication has been wired up. The ODL admissions
frontend (`frontend/`) and its login page are **also unchanged in appearance**.

### Architecture
| App | Path | Port | Role |
| --- | --- | --- | --- |
| Backend (Express + Prisma) | `backend/` | 5000 | Admissions **and** LMS APIs |
| ODL Admissions frontend | `frontend/` | 3000 | Applicant portal, single login page |
| **LMS frontend (separate app)** | `lms-frontend/` | **5174** | 7-role LMS UI |

Run all three with PM2: `pm2 start ecosystem.config.cjs`.

### LMS Roles (7)
`Student`, `Teacher`, `CourseCoordinator`, `FocalPerson`, `ExamController`,
`QECCoordinator`, `Provost`. Backend roles map to the LMS frontend's internal role
keys via `backend/src/utils/lmsRoles.js` and `lms-frontend/src/context/AuthContext.jsx`.

### LMS Auth Endpoints (prefix `/api/lms/`)
- `POST /api/lms/auth/login` → either `{ requiresPasswordChange:true, tempToken }`
  (5-min temp JWT) on first login, or `{ token, role, username }` (30-min session JWT).
- `POST /api/lms/auth/change-password` → requires the temp token; enforces strong
  password (≥8 chars, upper + number + special, bcrypt saltRounds 12); returns a
  full session token. For students it syncs `Enrollment.lmsPasswordChanged=true`.
- `GET /api/lms/auth/me` → current LMS user (rejects temp/purpose tokens).
- `GET /api/lms/student/profile` → student profile + computed `missingDocs`.
- Middleware: `backend/src/middleware/lmsAuth.js` (verifies `system:'lms'` JWTs,
  blocks deactivated users, `lmsRequireRole(...)` for role guards). The admissions
  JWT middleware is untouched — LMS uses its own.

### Token storage (LMS frontend)
- `localStorage.lms_token` — session JWT (never the admissions `token` key)
- `localStorage.lms_role` — role string
- `sessionStorage.lms_temp_token` — forced-password-change temp token

### Single login page fallback (Section 8)
The ODL login page (`frontend/src/pages/Login.jsx`) tries admissions auth first; if
that fails it falls back to `POST /api/lms/auth/login`. On success it stores the LMS
token(s) and redirects to the LMS frontend (`LMS_FRONTEND_URL`, resolved by
`frontend/src/utils/lmsConfig.js`). No login-page UI was changed.

### Enrollment → LMS provisioning (Sections 9–10)
On **ADCS** enrollment confirmation, `backend/src/utils/lmsProvision.js` idempotently
creates an `LmsUser` (username = Roll Number, role `Student`, `mustChangePassword=true`,
random temp password) and an `LmsStudentProfile` (copied profile + missing-document
detection). Roll/Registration number generation is **unchanged**.

### Student portal credentials card (Section 11)
The dashboard's Enrollment Confirmed card shows Roll Number, Registration Number,
LMS Username and the **temporary LMS password until `lmsPasswordChanged`**, then a
"✅ Password updated" message. Its "Login to LMS" button opens the LMS frontend.

### Section 12
The old in-portal "Under Construction / Coming Soon" LMS page was removed; the
ODL `/lms` route now redirects to the live LMS frontend login.

### Prisma models (Section 7)
- `LmsUser` — `role` stored as **String** (SQLite has no native enums; values
  validated against `lmsRoles.js`).
- `LmsStudentProfile` — copied student profile + `missingDocs`.
- `Enrollment` extended with `lmsPasswordChanged`, `lmsAccountCreated`, `lmsUserId`.
- Schema applied with `prisma db push` (preserves data); a portable
  `prisma/migrations/20260601000000_add_lms_users/migration.sql` is included for
  PostgreSQL deployments.

### Demo accounts (seeded)
All temp password `Temp@1234`, `mustChangePassword=true`:
`ADCS-F26-101` (Student), `teacher01`, `coordinator01`, `focal01`, `examctrl01`,
`qec01`, `provost01`. Re-seed with `node backend/scripts/seedLmsUsers.js`.

### Verified end-to-end
All 7 role logins → `requiresPasswordChange`; weak password → 400; strong password
→ session token; `/me` → user; `/student/profile` → profile + missing docs; cross-role
access → 403; invalid login → 401; temp token on protected route → 401; student
password change syncs `Enrollment.lmsPasswordChanged`; ODL `/lms` redirects to the
LMS frontend.

---

# LMS Phase 1 — Student Module (COMPLETE ✅)

Implemented sequentially as the **first** role of the role-by-role LMS build
(order: **Student → Teacher → Course Coordinator → Focal Person → Exam
Controller → Director QEC → Provost**). Every Student page is wired to a real
backend endpoint backed by the SQLite database — **no mock data, no
placeholders, no hardcoded responses**.

## Auth (LMS)
- Login: `POST /api/lms/auth/login` with `{ username, password }` (Student
  username = roll number, e.g. `ADCS-001`; password `Lms@1234`). Returns
  `{ token, role, username }`.
- All student routes guarded by `lmsAuth` + `lmsRequireRole('Student')`;
  `req.lmsUser.id` identifies the student.

## Completed Student Modules (frontend pages → real APIs)
| Page | Endpoint(s) | Notes |
|------|-------------|-------|
| Dashboard | `/student/dashboard` | KPIs from real data |
| Profile / Settings | `GET/PUT /profile`, `GET/PUT /settings` | Editable contact fields + notification prefs + documents |
| Courses / Registered | `/student/courses`, registration APIs | Enrollment + registered courses |
| Semester Registration | registration endpoints | Real offerings |
| Attendance | `/student/attendance` | Per-course %, charts |
| Assignments | assignment list/submit (`postForm`) | File submission |
| Quizzes | quiz list/start/submit | Attempts with grading |
| Results / Mid / Final | `/student/results` | Published results |
| Grades / Transcript / CGPA | `GET /transcript` | CGPACalculator projects CGPA client-side from real transcript |
| Course Materials / Library | `GET /materials` | Categorized by course, search + filter |
| Recorded Lectures | `GET /recorded-lectures` | In-page video player + downloads |
| Live Classes | `GET /live-classes` | Join live / watch recording |
| Discussion / Messages | `GET /messages/contacts`, `GET/POST /messages/:userId` | Teacher chat, unread counts, RBAC (only own teachers) |
| Notifications | `GET /notifications`, `PUT /:id/read`, `PUT /read-all` | Real notifications |
| Academic Calendar | `GET /calendar` | Month grid + upcoming list |
| Announcements | `GET /announcements` | Offering-scoped + global |
| Timetable / Schedule | `GET /schedule` | Mon-first weekly grid |
| Fee Status / Account Book | `GET /fees` | Challans, line items, paid/outstanding summary |
| Student Requests / Appeals | `GET /appeals`, `POST /appeals` (multer) | File-backed appeals, status tabs |
| Feedback / Surveys | `GET /surveys`, `POST /surveys/:id/submit` | Rating / MCQ / text questions, anonymity, completed state |
| Sticky Notes | `GET/POST/PUT/DELETE /notes` | Full CRUD |
| Study Scheme | `GET /scheme` | Degree roadmap with completion % |
| Activity Timeline | `GET /activity` | Derived from submissions/attempts/regs/results/appeals |
| Badges | `GET /badges` | Derived achievements |
| AI Insights | `GET /insights` | Derived analytics (GPA trend, per-course stats, recommendations) |

## Backend additions for Phase 1
- **Schema** (`prisma/schema.prisma`): 11 new models — `CalendarEvent`,
  `ScheduleSlot`, `LiveClass`, `StudentNote`, `StudentAppeal`, `Survey`,
  `SurveyQuestion`, `SurveyResponse`, `NotificationPref`, `LmsNotification`,
  `LmsFeeChallan` + back-relations on `LmsUser` and `CourseOffering`.
- **Routes** (`src/routes/lms/academic/student.js`): ~30 endpoints (profile,
  announcements, calendar, schedule, live-classes, recorded-lectures, materials,
  scheme, notes CRUD, appeals, surveys, fees, notifications, settings, activity,
  badges, insights, messages).
- **Helper** (`src/utils/lmsNotify.js`): `notify` / `notifyMany`.
- **Seed** (`prisma/seedLmsAcademic.js`): Phase-1 seed block (schedule slots,
  calendar events, live classes with recording, materials, fee challans,
  course-evaluation survey, sticky notes, appeal, notifications).

## DB tables used (Student)
`LmsUser`, `LmsStudentProfile`, `CourseOffering`, `Course`, `Term`,
`CourseRegistration`, `Enrollment`, `Attendance*`, `Assignment`,
`AssignmentSubmission`, `Quiz`, `QuizAttempt`, `CourseResult`,
`LmsAnnouncement`, `LmsThreadMessage`, plus the 11 new models above.

## Testing results (verified via curl, real DB)
- 14/14 student GET endpoints → **200** with real data.
- `PUT /settings` → 200; `PUT /profile` → 200.
- `POST /surveys/:id/submit` → 201 (required-field validation enforced).
- `POST /messages/:userId` → 201 (RBAC: only own course teachers); conversation
  fetch marks messages read.
- `PUT /notifications/read-all` → 200.
- Frontend `npm run build` → **success** (2700 modules, no errors); no remaining
  `mockData` / `enterpriseData` / `lmsUpgradeData` imports in `src/pages/student/`.

## Cross-cutting (all student pages)
Backend API integration · DB connectivity · express-validator validation ·
JWT auth + `lmsRequireRole` authorization · RBAC (e.g. messaging restricted to
own teachers) · error handling (`ErrorState` + retry) · loading states
(`Skeleton`) · empty states (`EmptyState`) · success/error toasts · audit
logging on writes (`audit(...)`).

## Remaining work
- **Phase 2 — Teacher** (next), then Course Coordinator, Focal Person, Exam
  Controller, Director QEC, Provost. Not started until Student sign-off.

---

# LMS Phase 2 — Teacher Module (COMPLETE ✅)

Implemented sequentially as the **second** role (order: Student → **Teacher** →
Course Coordinator → Focal Person → Exam Controller → Director QEC → Provost).
Every routed Teacher page is wired to a real backend endpoint backed by the
SQLite database — **no mock data, no placeholders, no hardcoded responses**.

## Auth (LMS — Teacher)
- Login: `POST /api/lms/auth/login` with `{ username, password }`
  (Teacher username e.g. `teacher1`; password `Lms@1234`). Returns
  `{ token, role, username }`.
- All teacher routes guarded by `lmsAuth` + `lmsRequireRole('Teacher',
  'CourseCoordinator')`. Ownership enforced per offering via
  `getOwnedOffering(req, offeringId)` / `offeringWhereForTeacher(req)` /
  `myOfferings(req)` so a teacher only ever sees/mutates their own offerings.

## Completed Teacher Modules (frontend pages → real APIs)
| Page | Endpoint(s) | Notes |
|------|-------------|-------|
| Dashboard | `/academic/teacher/offerings` + dashboard aggregates | KPIs from real offerings |
| Subjects / My Courses | `GET /offerings` | Active + past offerings |
| Manage Offering (6 tabs) | students / attendance / assignments / quizzes / gradebook / announcements | 606-line fully API-driven hub; deep-linked via `?tab=` |
| Offering Picker | `GET /offerings` | Reusable picker → `/teacher/offerings/:id?tab=` |
| Course History | `GET /history` | Past offerings + outcomes |
| Assignments (aggregate) | `GET /assignments` | Cross-course dashboard; rows → ManageOffering assignments tab |
| Quizzes (aggregate) | `GET /quizzes` | Cross-course dashboard; rows → ManageOffering quizzes tab |
| Mid / Final Term Exams | `GET /history` + `GET /assignments` | `TeacherExam kind="Mid"/"Final"` — aggregate; routes into per-course Author Paper / Gradebook / Quizzes |
| Recorded Lectures / Uploads | `GET /lectures`, `POST /lectures` (multer), `DELETE /lectures/:id` | Grouped by subject→week; YouTube + file upload |
| Library / Materials | `GET /library`, `POST /offerings/:id/materials` (multer), `DELETE /materials/:id` | FILE / LINK / VIDEO; filter + search |
| Live Classes | `GET /live-classes`, `POST/PUT/DELETE /live-classes/:id` | Schedule / Go Live / End / Cancel; live classroom UI (host-only participants) |
| Messages / Discussion | `GET /messages/contacts`, `GET/POST /messages/:userId` | Student chat, unread counts, RBAC (only own students) |
| Appeals / Requests | `GET /appeals`, `PUT /appeals/:id` | Review + resolve student appeals |
| Settings / Profile | `GET/PUT /profile`, `GET/PUT /settings` | Editable contact + notification prefs |

## Backend additions for Phase 2
- **Routes** (`src/routes/lms/academic/teacher.js`): ~20 cross-offering
  aggregate endpoints layered on the existing per-offering CRUD —
  `/history`, `/assignments`, `/quizzes`, `/lectures` (GET/POST/DELETE),
  `/library`, `/live-classes` (GET/POST/PUT/DELETE), `/appeals` (GET/PUT),
  `/messages/contacts`, `/messages/:userId` (GET/POST). All scoped to the
  authenticated teacher's owned offerings.
- **API client** (`lms-frontend/src/services/api.js`): extended the `teacher`
  helper object with 20 methods covering all aggregate + CRUD endpoints
  (multipart via `postForm` for lecture/material uploads).

## DB tables used (Teacher)
`LmsUser`, `CourseOffering`, `Course`, `Term`, `CourseRegistration`,
`Enrollment`, `AttendanceSession`, `Attendance`, `Assignment2`,
`AssignmentSubmission`, `Quiz`, `QuizQuestion`, `QuizAttempt`, `Gradebook`,
`CourseResult`, `CourseMaterial`, `LiveClass`, `LmsAnnouncement`,
`LmsThreadMessage`, `StudentAppeal`, `NotificationPref`.

## Testing results (verified via curl, real DB)
- Login `teacher1` → 200, JWT issued (220-char token).
- 8/8 aggregate GET endpoints → **200** with real data:
  `history`, `assignments` (`{assignments:[1]}`), `quizzes`, `lectures`
  (`{subjects:[1]}`), `library` (`{categories, total:3}`), `appeals`,
  `live-classes` (`{offerings:[4], liveClasses:[3]}`), `messages/contacts`
  (`{contacts:[3]}`).
- Per-offering CRUD (assignments, quizzes, attendance, gradebook, materials,
  announcements, live-classes) → 200/201; ownership enforced (cross-teacher
  access blocked).
- Frontend `npm run build` → **success** (2700 modules, 0 errors, ~11.9s); no
  remaining `mockData` / `enterpriseData` / `lmsUpgradeData` / `mockExams` /
  `mockSubmissions` references in `src/pages/teacher/`.
- Removed 4 orphaned (unrouted) hardcoded files: `TeacherStudents.jsx`,
  `MarksUpload.jsx`, `TeacherAnnouncements.jsx`, `TeacherAttendance.jsx` —
  confirmed zero imports/routes referencing them before deletion.

## Cross-cutting (all teacher pages)
Backend API integration · DB connectivity · express-validator validation ·
JWT auth + `lmsRequireRole('Teacher','CourseCoordinator')` authorization ·
RBAC (offering ownership; messaging restricted to own students) · error
handling (`ErrorState` + retry) · loading states (`Skeleton`) · empty states
(`EmptyState`) · success/error toasts · audit logging on writes (`audit(...)`).

## Remaining work
- **Phase 3 — Course Coordinator** (next), then Focal Person, Exam Controller,
  Director QEC, Provost. Not started until Teacher sign-off.

---

# Phase 6 — Director QEC (Quality Enhancement Cell)

**Status: ✅ COMPLETE & VERIFIED** — purely additive; no existing role/route/UI touched.

## Scope delivered
Backend + DB integration and mock→live frontend conversion for the entire
Director QEC role. All 5 prior roles (Student, Teacher, Course Coordinator,
Focal Person, Exam Controller) remain untouched. All QEC UI design, layouts,
sidebars, navigation, colors and component styling are unchanged.

## Backend (new file, additive)
- `backend/src/routes/lms/academic/directorqec.js` — full QEC router mounted at
  `/api/lms/academic/qec/*` in `server.js`. RBAC: `QEC = lmsRequireRole('QECCoordinator')`
  for all mutations; `QEC_OR_GOV = lmsRequireRole('QECCoordinator','Provost')` for
  read-only oversight. Audit logging + notifications on every write.
- `backend/prisma/seedQecData.js` — additive, idempotent QEC data enrichment
  (course-eval surveys, teacher-eval responses, historical quality metrics,
  PEC/NCEAC/HEC/INTERNAL compliance items, improvement plans).

## Functional entry URIs (Director QEC, all under `/api/lms/academic/qec`)
- `GET /dashboard`, `GET /counts`
- `GET /surveys`, `GET /surveys/:id`, `POST /surveys`, `PUT /surveys/:id`,
  `PUT /surveys/:id/status`, `DELETE /surveys/:id`
- `GET /course-evaluation`, `GET /faculty-eval`, `GET /ratings`, `GET /feedback`
- `GET /quality-metrics`, `POST /quality-metrics`
- `GET /compliance`, `POST /compliance`, `PUT /compliance/:id`
- `GET /improvement-plans`, `POST /improvement-plans`, `PUT /improvement-plans/:id`
- `GET /program-eval`, `GET /self-assessment`, `GET /departments`, `GET /analytics`
- `GET /reports/:kind` (surveys|feedback|faculty|courses|depts),
  `GET /reports/:kind/export` (CSV)
- `GET /announcements`, `POST /announcements`, `DELETE /announcements/:id`
- `GET /notifications`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`
- `GET /audit`
- `GET /me`, `PUT /me/profile`, `PUT /me/password`

## Frontend (mock→live, UI identical)
`lms-frontend/src/services/api.js` extended with a `qec` namespace (~35 methods).
All 17 QEC pages converted from `enterpriseData` mock to live API:
Dashboard, Analytics, Surveys (kept AppSettings global toggles), FacultyEval,
CourseEvaluation, ProgramEval, SelfAssessment, Feedback, Departments, Compliance,
Reports, ActivityLogs, Ratings, Settings. Each page uses `useApi` + loading
(`Skeleton`) / error (`ErrorState` + retry) / empty (`EmptyState`) states.

## DB tables used (Director QEC)
`Survey`, `SurveyQuestion`, `SurveyResponse`, `QualityMetric`, `ComplianceItem`,
`ImprovementPlan`, `LmsProgram`, `AcademicTerm`, `CourseOffering`, `Course`,
`CourseRegistration`, `CourseResult`, `LmsAnnouncement`, `LmsNotification`,
`LmsAuditLog`, `LmsUser`.

## Testing results (verified via curl, real DB)
- Login `qec@lms.com` / `QEC@123` → 200, JWT issued.
- All QEC GET endpoints → **200** with real data (dashboard, surveys, analytics,
  faculty-eval, ratings, feedback, compliance, reports/*, audit, me, etc.).
- Mutations (POST/PUT/DELETE on surveys, metrics, compliance, plans,
  announcements) → 200/201; audit + notify recorded.
- CSV export (`/reports/:kind/export`) → valid CSV with BOM-safe escaping.
- RBAC verified: Student/Teacher → **403** (read + write); Provost → **200**
  read / **403** write (oversight is read-only by design).
- Seed `seedQecData.js` → idempotent (re-run adds 0 rows).
- Frontend `npm run build` → **success** (2702 modules, 0 errors, ~7–9s).
- Zero remaining `enterpriseData` mock imports in `src/pages/qec/`.

## Demo credentials
`qec_demo` / `qec@lms.com` / `QEC@123` (role `QECCoordinator` → `director_qec`).

## Remaining work
- **Phase 7 — Provost** (next; deferred until Director QEC sign-off, now complete).

**Last Updated (Phase 6): 2026-06-03**

---

# Phase 7 — Provost (FINAL ROLE) — COMPLETE

The Provost (University Executive, with **Finance Coordinator merged in**) is the
final active role of the LMS. It provides university-wide oversight, executive
analytics, finance governance, strategic planning, and the institutional audit
trail. All data is **database-driven** (no mock APIs, no hardcoded responses,
no frontend-only data) and every mutation is **audited + notification-wired**.

## Provost — backend (`backend/src/routes/lms/academic/provost.js`)
Mounted at `/api/lms/academic/provost/*`, guarded by `lmsAuth` +
`PROVOST = lmsRequireRole('Provost')` on every route.

| Module | Endpoint(s) | Notes |
|---|---|---|
| Dashboard | `GET /dashboard`, `GET /counts` | University KPIs, departments, monthly collection, pending approvals — all live counts |
| Analytics | `GET /analytics` | Strategic KPIs, growth (QualityMetric-driven), faculty/student ratios, monthly collection |
| University Oversight | `GET /departments`, `/faculty`, `/students`, `/programs` | Real rosters aggregated from Program→Course→Offering→Registration |
| Finance | `GET /finance` | Revenue vs target, fee-type breakdown, latest challans |
| Fee Approvals | `GET /fee-approvals`, `PUT /fee-approvals/:id` | Approve/reject real `LmsFeeChallan` records (audit + student notify) |
| Defaulters | `GET /defaulters`, `POST /defaulters/:id/notify` | Overdue/unpaid students; reminder notification |
| Fee / Exam-Fee Announcements | `GET/POST/DELETE /fee-announcements`, `…/exam-fee-announcements` | Stored as tagged `LmsAnnouncement` (audience ALL) |
| Fines | `GET /fines`, `POST /fines`, `PUT /fines/:id` | Stored as `ApprovalRequest(type=FEE,entity=FINE)`; paid/waive workflow |
| QEC Snapshot | `GET /qec` | Read-only quality overview (surveys, ratings, compliance, top faculty) |
| Strategic Initiatives | `GET/POST /initiatives`, `PUT /initiatives/:id` | `StrategicInitiative` lifecycle (status/progress/budget) |
| Policies | `GET /policies`, `PUT /policies/:id` | `Policy` publish workflow (sets approvedById/approvedAt) |
| Reports | `GET /reports/:kind`, `GET /reports/:kind/export` | kinds: departments, finance, fees, qec; CSV export w/ BOM + audit |
| Activity Logs | `GET /audit` | Paginated university-wide `LmsAuditLog` trail |
| Account Settings | `GET /me`, `PUT /me/profile`, `PUT /me/password` | Profile + strong-password change (bcrypt, audited) |

## Provost — frontend (`lms-frontend/src/pages/provost/`)
16 pages, all routed under `/provost/*` in `App.jsx`, all wired to
`api.provost.*` (`src/services/api.js`):
Dashboard, Analytics, Departments, Programs, Faculty, Students, Finance,
FeeAnnouncements, ExamFeeAnnouncements, FeeApprovals, Fines, Defaulters,
Reports, QEC, ActivityLogs, **Settings**.

## Phase 7 work done this session (additive only)
- **Fixed: Provost Settings page was disconnected** (frontend-only, dead buttons).
  Wired it to `api.provost.me()` / `updateProfile()` / `changePassword()` using
  the exact same proven pattern as the completed QEC Settings page (toast feedback,
  loading states, confirm-password validation). **UI/layout/styling unchanged.**
- Verified all 22 Provost GET endpoint variants → **HTTP 200** with real data.
- Verified write workflows: fee approve, defaulter notify, fee/exam-fee announce
  create+delete, fine create/paid/waive, initiative create/update, policy publish,
  profile update, report CSV export — all succeed and write to DB.
- Verified **audit trail**: 10+ `PROVOST_*` actions recorded (`PROVOST_FEE_APPROVE`,
  `PROVOST_FINE_CREATE/UPDATE`, `PROVOST_INITIATIVE_*`, `PROVOST_POLICY_UPDATE`,
  `PROVOST_REPORT_EXPORT`, `PROVOST_PROFILE_UPDATE`, …).
- Verified **notifications**: fee-approval / fine / reminder notifications persisted
  to `LmsNotification` (87 total in DB).
- Verified **RBAC**: Provost → 200, Student → **403**, no token → **401**.
  Wrong-current-password → **401**. CORS origin reflection confirmed on public URL.
- Frontend `npm run build` → **success** (2700 modules, 0 errors).

## Demo credentials (Provost)
`provost_demo` / `provost@lms.com` / `Provost@123` (role `Provost` → `/provost`).

## Data models / storage used (Phase 7)
`LmsUser`, `LmsProgram`, `LmsCourse`, `CourseOffering`, `CourseRegistration`,
`AcademicTerm`, `LmsFeeChallan`, `ApprovalRequest`, `LmsAnnouncement`,
`LmsNotification`, `LmsAuditLog`, `StrategicInitiative`, `Policy`, `Survey`,
`SurveyResponse`, `QualityMetric`, `ComplianceItem`. **No schema changes** — all
additive on the existing Prisma + SQLite database.

## LMS final status
All 7 roles complete: Student, Teacher, Course Coordinator, Focal Person,
Exam Controller, Director QEC, **Provost**. All modules are database-driven,
RBAC-enforced, audited, and notification-wired. No mock APIs, no placeholders,
no disconnected UI remaining.

**Last Updated (Phase 7 — Provost, FINAL): 2026-06-03**

---

## 🎓 Student Role — Real-Data Overhaul (Latest)

This update reworks the **Student role only**. The Admissions System/Portal,
the LMS theme/layout/routing, and all other roles (Teacher, Coordinator, Focal
Person, Exam Controller, QEC, Provost) are **untouched**. All dummy / mock /
placeholder data was removed from the Student role; every screen now reads real,
real-time data from the database.

### New backend files
- `backend/src/services/autoEnrollService.js` — **Automatic course enrollment**
  by *semester + scheme* (req #2). Resolves the student's `LmsProgram`,
  determines the current semester (lowest semester with unfinished published
  results; Semester 1 for new students), and enrolls them into **ACTIVE**
  `CourseOffering`s of the scheme courses in the current term. Idempotent
  (skips existing registrations), auto-assigns the first section. Exposes
  `autoEnrollStudent`, `determineCurrentSemester`, `resolveProgram`.
- `backend/src/services/admissionsSync.js` — **Live Admissions profile sync**
  (req #16). Reads the admissions `User`/`Profile`/`Document`/`Education`/
  `Application`/`Enrollment` via the `Enrollment.lmsUserId` link, computes
  verification status, missing documents and a document checklist, and **never
  writes to Admissions**. Falls back to the `LmsStudentProfile` snapshot when no
  enrollment link exists. Exposes `buildLiveStudentProfile`, `REQUIRED_DOCS`.

### Modified backend files
- `backend/src/routes/lms/lmsAuthV2.js` — non-blocking `autoEnrollStudent()`
  hook on Student login.
- `backend/src/utils/lmsProvision.js` — auto-enroll call after profile
  provisioning (lazy require to avoid circular deps).
- `backend/src/routes/lms/academic/student.js`
  - `GET /dashboard` — now returns, **per course**: `progress` (real blend of
    assessment completion 70% + attendance 30%), `assessmentsDone/Total`,
    `attendancePct`, `liveNow`, and a `liveClass` object (next/live class with
    `scheduledAt`, `durationMin`, `status`).
  - `GET /profile` — live Admissions sync via `buildLiveStudentProfile`.
  - `GET /profile/sync` — force re-sync from Admissions.
  - `PUT /profile` — upsert.
  - `POST /profile/photo` — profile picture upload (multer `uploadPhoto`).
  - `GET /live-classes/:id/join` — validates registration, returns
    BigBlueButton join metadata (`provider: "BigBlueButton"`, attendee name
    appended to `joinUrl`).

### Frontend changes (LMS Student pages — same theme, no redesign)
- `lms-frontend/src/pages/student/Dashboard.jsx` — **rich course cards (req #1)**:
  course name, teacher, **progress bar**, **next live class date/time**, a red
  **LIVE button** when a class is currently live (deep-links straight into the
  in-app classroom), and six **module shortcut buttons** — Assignments, Quizzes,
  Attendance, Announcements, Live Class, Materials — each navigating to the
  matching module scoped to that course.
- `lms-frontend/src/pages/student/LiveClasses.jsx` — full in-app **BigBlueButton
  classroom** (iframe + feature rail + attendee/duration overlay), plus
  `?join=<id>` deep-link auto-open from the dashboard LIVE button.
- `lms-frontend/src/pages/student/Settings.jsx` — auto-fetches the full
  Admissions profile (academic info grid, verification badge, document
  checklist + missing docs), **profile photo upload**, and a **Sync with
  Admissions** button.
- `lms-frontend/src/pages/student/Withdrawal.jsx` — **Course Withdrawal (req #17)**:
  view eligible (ENROLLED) courses, submit a withdrawal request, and track
  status/history. Wired into routing + sidebar.
- Deep-link query params added (non-breaking, preset existing filters):
  `Assignments.jsx`, `Quizzes.jsx`, `Announcements.jsx`, `Library.jsx`
  read `?course=<code>`; `LiveClasses.jsx` reads `?join=<id>`.
- `lms-frontend/src/services/api.js` — added `syncProfile`, `uploadProfilePhoto`,
  `joinLiveClass` student methods.
- `lms-frontend/src/App.jsx` + `components/layout/Sidebar.jsx` — Course
  Withdrawal route + nav item.

### Student functional entry URIs
- `GET /api/lms/academic/student/dashboard` — stats + enriched course cards
- `GET /api/lms/academic/student/profile` · `GET …/profile/sync` ·
  `PUT …/profile` · `POST …/profile/photo`
- `GET /api/lms/academic/student/live-classes/:id/join` — BBB join metadata
- Existing: `…/assignments`, `…/quizzes`, `…/attendance`, `…/results`,
  `…/registrations`, `…/offerings/available`, `…/materials`, `…/announcements`,
  withdraw endpoint (Course Withdrawal)

### Verification
- Auto-enroll verified: demo student (`student@lms.com` / `Student@123`) is
  enrolled in CS-101, CS-102, MT-101, EN-101 on login.
- Dashboard endpoint returns real `progress`, `liveNow`, and `liveClass` data
  (LIVE flag confirmed by flipping a live class to `LIVE`).
- `live-classes/:id/join` returns HTTP 200 with `provider: "BigBlueButton"`.
- All changed frontend files pass esbuild parse; login page renders with 0
  console errors.

**No schema changes** — every change is additive on the existing Prisma + SQLite
database and consumes Admissions data read-only.

**Last Updated (Student Role real-data overhaul): 2026-06-05**

---

## 🧑‍🏫 Teacher Role — Real-Data Module Overhaul (Latest)

The **Teacher Role** of the LMS has been fully reworked to remove **all** dummy,
mock, placeholder, hardcoded, sample and fake data. Every module now fetches
live data from the backend / database and renders proper **empty states** when
no data exists. The Admissions System / Portal (`frontend/`) was **not touched**.

> **Demo teacher account:** `teacher1` / `Lms@1234`
> (LMS login field is `username`, not email.)

### ✅ Completed Modules (14)

| # | Module | What it now does (real data only) |
|---|--------|-----------------------------------|
| 1 | **My Courses** | Course cards showing Semester, Section, Credit Hours and live Enrolled count, with Manage / Live Class / Lectures / Library actions. |
| 2 | **Live Classes** | Real **self-hosted BigBlueButton** join flow + End class + **Reschedule** (notifies all enrolled students). Graceful fallback when BBB not yet configured. |
| 3 | **Recorded Lectures** | YouTube/URL embedding with Semester · Course · Week · Title · URL · Duration · Lecture Number · Description; filters + course-wise, week-grouped cards. |
| 4 | **Course Library** | Per-teacher uploads ≤ 5 MB, resource types (Books / Slides / Notes / PDFs / Other), drag & drop, filters, course-wise week-grouped cards. |
| 5 | **Assignments** | Semester + course cards with live stats, View / Grade / Publish; marks auto-appear for the student; Create New (manual MCQ / Short / Descriptive) + AI Generator UI. |
| 6 | **Quizzes** | Same as Assignments incl. AI Generator UI and MCQ / Short / Descriptive question types. |
| 7 | **Marks** | Real-time add / edit / delete, persisted to DB. |
| 8 | **Attendance** | Real-time status dropdowns + filters, persisted to DB. |
| 9 | **Students** | Only real enrolled students; View / Search / Profile, Export PDF / Excel, filters. |
| 10 | **Course History** | Real session cards (no mock). |
| 11 | **Announcements** | Real-time create / list. |
| 12 | **Messages** | Real-time contacts + send. |
| 13 | **Appeals** | Real-time list + status update. |
| 14 | **Settings** | Full editable profile — Photo, Name, Father Name, CNIC, DOB, Address, Phone, Email, Gender, Marital Status, WhatsApp. |

### 🤖 AI Generators (Tutor / Assignment / Quiz) — frontend-ready

The AI question generators and AI Tutor are **frontend-complete**. They call the
existing backend endpoint, which returns a **clean HTTP 503** (`"AI generation is
unavailable on this account (no LLM credits)"`) until the team wires in their own
LLM model. **No mock questions are ever returned** — the UI surfaces the 503 as a
friendly message.

### 📹 BigBlueButton — self-hosted, config-driven

BBB is **self-hosted** on the team's own server and configured entirely via env:

```bash
BBB_URL=https://your-bbb-server/bigbluebutton/
BBB_SECRET=your-shared-secret
```

- When **configured** → the backend builds a real SHA1-checksum-signed moderator
  join URL, ensures the meeting, and persists an attendee URL for students.
- When **not configured** → `/join` returns `{ provider: "manual", bbbConfigured: false }`
  and falls back to any stored join URL (no simulation, no fake classroom).

### 🔌 New / changed Teacher endpoints

All under `/api/lms/academic/teacher/*`:

- `POST /live/:id/join`, `POST /live/:id/end`, `PUT /live/:id/reschedule`
- `POST /library`, `DELETE /library/:id` (≤ 5 MB, resourceType + description)
- `PUT /profile`, `POST /profile/photo` (auto-creates a **blank** profile row for
  teachers who never had one — empty fields they fill in, not fake data)
- `GET /lectures`, `GET /library` now include the **Semester** of each course
- `POST /ai/generate` (assignments / quizzes) → real questions when a model is
  available, else clean 503

### 🗄️ Data architecture (additive only)

- `CourseMaterial` extended with `description`, `durationMin`, `lectureNumber`,
  `resourceType`, `fileSize`, `uploadedById`.
- `LmsStudentProfile` extended with `whatsapp`, `maritalStatus`.
- `Assignment2` extended with `startTime`, `endTime`; new `Assignment2Question`.
- DOB stored as `YYYY-MM-DD` string (compatible with `<input type="date">`).

### 🧪 Live-test verification

- Profile upsert (blank-profile teacher) → ✅ all fields persisted.
- Library upload (≤ 5 MB) → ✅ created & listed.
- Reschedule → ✅ notified **9** enrolled students.
- Live join (BBB unconfigured) → ✅ clean manual fallback.
- AI generate → ✅ clean 503, **no mock**.
- Frontend smoke test → ✅ **0 console errors**, cross-origin login (5174 → 5000) HTTP 200.
- Production build → ✅ 2699 modules transformed, built in ~5.8s.

**Constraints honoured:** Admissions Portal untouched · no architecture changes ·
no file rename/move/delete · no other LMS roles modified · UI/UX design language
preserved · **zero mock/dummy data** in the Teacher Role.

**Last Updated (Teacher Role real-data overhaul): 2026-06-05**

---

## 🧑‍💼 Focal Person Role — Real-Data + Department-Scoped Overhaul (Latest)

The **Focal Person role only** has been fully reworked to remove **all** dummy /
mock / static data and to make every module **strictly department-specific**.
Each Focal Person now sees and acts on **only their own assigned department's
data** — there is **no cross-department access** anywhere. The Admissions System /
Portal (`frontend/`) was **NOT touched**, and **no** existing LMS module, DB
table, route, feature, workflow or UI was broken, renamed, deleted or
restructured. All changes are **LMS-side, additive, and surgical**.

> **Demo focal account:** `focal_demo` / `Focal@123`
> (LMS login field is `username`, not email.) Seeded department:
> *Department of Computing*.

### 🔒 Department Scoping (the core requirement)

There is **no `departmentId` foreign key** in the schema; department is a
**string** on `LmsStudentProfile.department`. A new, purely additive helper
`backend/src/utils/lmsDeptScope.js` resolves the focal user's department into the
full set of IDs they are allowed to touch:

```
department (string) → programIds → courseIds → offeringIds → teacherIds → studentIds
```

- `buildDeptScope(lmsUser)` → `{ unscoped, department, programIds, shortForms,
  courseIds, offeringIds, teacherIds, studentIds }`.
- Seven where-fragment builders (`programWhere`, `courseWhere`, `offeringWhere`,
  `studentWhere`, `teacherWhere`, `byOfferingWhere`, `byStudentWhere`) return
  `{}` when unscoped, else `{ id: { in: [...] } }` (with a `[-1]` / `['__none__']`
  sentinel when the set is empty, so an empty department can never leak other
  departments' rows).
- A `withScope` middleware (`router.use(withScope)`) attaches `req.scope` to
  every focal request.
- **Back-compat:** the **Provost** is always `unscoped` (university-wide
  oversight), and a focal with an empty department also falls back to unscoped —
  so no existing oversight behaviour is changed.

**Proven isolation:** a Computing focal sees 14 students / 8 courses / 3 teachers;
an Electrical-Engineering focal sees 0 / 0 / 0. Cross-department actions
(viewing a student detail, fining a student, messaging a non-department user)
return **HTTP 403**.

### ✅ 17 Focal Person modules (all live, all department-scoped)

| # | Module | Capability (real-time DB) |
|---|--------|---------------------------|
| 1 | Dashboard | Live department KPIs |
| 2 | Department Overview | Programs / courses / offerings of the focal's department only |
| 3 | Manage Enrollment | Department-scoped enrollment management |
| 4 | Semester Promotion | Promote eligible department students |
| 5 | Retake & Improvement | Department retake/improvement cases |
| 6 | Withdraw Cases | Department withdrawal cases |
| 7 | Search Students | Search **within department** only |
| 8 | Drop Students | **Mandatory reason + remarks**; student notification on drop |
| 9 | Discipline & Fine | Select student **by name**, case title + description, **fine amount/description/remarks**, real-time student notification with fine details |
| 10 | Attendance & Analytics | Department attendance analytics |
| 11 | Results & Analytics | Department results analytics |
| 12 | Quick Messages | Department individuals / groups / sections / semesters / programs (+ governance roles) |
| 13 | Surveys & QEC | Department survey / QEC view |
| 14 | Teacher Deactivation | Department faculty monitoring |
| 15 | Reports & Analytics | Department reports + CSV |
| 16 | Activity Logs | Department-scoped audit trail |
| 17 | Settings | Profile picture, name, father name, email, address, phone, **department (read-only)**, designation, employee ID, username, secure password change |

### 🔌 New / changed Focal endpoints (`/api/lms/academic/focal/*`)

- **Discipline & Fine**
  - `GET /discipline` — department-scoped list; each case returns
    `caseDescription`, `studentName`, `raisedByName`, and a parsed
    `fine: { fineDescription, fineAmount, remarks }`.
  - `POST /discipline` — dept guard (**403** if the student isn't in the focal's
    department); validates fine amount; creates an `Escalation`
    (`category='DISCIPLINE'`, `currentRole='FocalPerson'`) + `EscalationEvent`,
    writes a `DISCIPLINE_CASE_CREATE` audit log, and **notifies the student** with
    the full fine details (notification type `WARNING`).
  - **Fine modeling (table-safe / additive):** there is **no new Fine table** —
    fine details are embedded in `Escalation.description` via a parseable
    `[FINE]{json}` tag, parsed back out with `parseFineTag()` / `stripFineTag()`.
- **Settings (account self-service)**
  - `GET /me/profile` — focal profile + account (auto-initialises an
    `LmsStudentProfile` staff row keyed on `lmsUserId`, designation
    `Focal Person`, employee ID `FP-<id>`, on first access).
  - `PUT /me/profile` — edit name, father name, email, phone, whatsapp,
    designation, employee ID, address (**department is intentionally read-only**
    so a focal can't move themselves between departments); syncs account email;
    `FOCAL_PROFILE_UPDATE` audit.
  - `POST /me/photo` — profile-picture upload (`uploadPhoto.single('photo')` →
    `/uploads/photos/...`).
  - `PUT /me/password` — bcrypt-verified current password + strong-password policy
    (`≥8`, uppercase + number + special).
- **Quick Messages (now department-scoped)**
  - `messages/contacts` — focal sees **only** their department's students +
    teachers, **plus** governance roles (Provost / QECCoordinator / ExamController).
    (Bug fixed: previously returned *all* university users.)
  - `POST /messages/:userId` — dept guard: **403** if the recipient is neither in
    the focal's department nor a governance role.

### 🖥️ Frontend changes (LMS Focal pages — same theme, no redesign)

- `lms-frontend/src/pages/focal/Settings.jsx` — **fully rewritten** from static
  dummy data to real DB-backed profile: photo upload, editable fields, department
  shown **read-only** (with an explanatory note), and a password-change section.
- `lms-frontend/src/pages/focal/Discipline.jsx` — student picker **by name**,
  case title + description, fine description / amount / remarks, severity; a
  **Total Fines** stat card; case cards render the fine badge (Rs amount +
  description + remarks).
- `lms-frontend/src/pages/focal/StudentDrop.jsx` — added a **remarks** field to
  the drop form/modal (reason was already mandatory, "Other" requires free text).
- `lms-frontend/src/services/api.js` — added focal methods `createDiscipline`,
  `myProfile`, `updateMyProfile`, `uploadMyPhoto`, `changePassword`.

### 🛠️ Toolchain fix (dev only)

The `lms-frontend` Vite dev server was crash-looping because an earlier
interrupted install left **125 empty `.js` files** under `node_modules/d3-shape`
(pulled in by `recharts`/`victory-vendor`), which Vite 8's rolldown optimizer
could not resolve. Fixed by a clean reinstall (`rm -rf node_modules
package-lock.json && npm install`) and pinning **Vite 7** (`^7.1.0`, esbuild
optimizer) + `@vitejs/plugin-react@^4.3.4` in `lms-frontend/package.json`. No app
code or design was changed by this fix.

### 🧪 Verification

- Focal dashboard scoped (1 program for `focal_demo` vs Provost's 7 university-wide).
- Department isolation proven (Computing 14 students vs EE 0); cross-department
  guards → **403**.
- `messages/contacts` scoped (Computing 23 / EE 6 governance-only / Provost 28).
- Profile update keeps department unchanged; weak / wrong-current passwords rejected.
- Discipline + fine create works end-to-end; student notification delivered with
  fine details.
- **Regression:** all 6 other roles still log in + load their dashboards (200);
  Provost stays unscoped (7 programs); all 25 focal GET endpoints → 200.
- `lms-frontend` Vite 7.3.5 starts cleanly; all focal pages load with **0 console
  errors**.

### 🗄️ Data architecture (additive only — no schema rename/delete)

- `LmsStudentProfile` reused as a generic **staff-profile** store for the focal
  (keyed on `lmsUserId`); `designation` + `employeeId` (`String?`) are the only
  schema additions (made in a prior session, back-compatible).
- Discipline cases = `Escalation` rows (`category='DISCIPLINE'`); fines embedded
  in `Escalation.description` via the `[FINE]` JSON tag — **no new tables**.
- Notifications via the existing `LmsNotification` flow; audit via `LmsAuditLog`.

**Constraints honoured:** Admissions Portal untouched · FocalPerson is the **only**
role modified · **strict department scoping, no cross-department access** · no
architecture changes · no module/table/route/feature rename·move·delete · no extra
features beyond the requirements · UI/UX design language preserved · **zero
mock/dummy/static data** in the Focal Person role.

**Last Updated (Focal Person Role real-data + department-scoped overhaul): 2026-06-06**

---

## LMS — Director QEC (Quality Enhancement Cell) Role — Real-Time Overhaul

The **Director QEC** role (`QECCoordinator`) was upgraded so that **all 12 modules
run on live database data** (no dummy/hardcoded values). The role is served by
`backend/src/routes/lms/academic/directorqec.js` and the `lms-frontend/src/pages/qec/*`
pages, consumed through `api.qec.*` (see `lms-frontend/src/services/api.js`).

### Modules (all real-time)
1. **Dashboard** — quality/evaluation/accreditation KPIs, rating distribution, recent feedback (`GET /dashboard`).
2. **Survey Management** — MCQ Question Builder with a **5-point Likert scale** (Strongly Agree / Agree / Not Sure / Disagree / Strongly Disagree), full **CRUD** (create/edit/delete), **enable/disable** (lock/unlock — UI unchanged), and a **View Responses** modal with per-question MCQ distribution bars + text comments.
3. **Anonymous Feedback** — smart filters: Department · Program · Semester · Course · Teacher · Survey · Rating · Status · Date Range; options come from the backend `filterOptions`.
4. **Faculty Evaluation** · 5. **Course Evaluation** · 6. **Program Evaluation** · 7. **Self-Assessment** · 8. **Department Performance** · 9. **QA Reports** · 10. **Compliance** · 11. **Activity Logs** — all driven by `api.qec.*`.
12. **Settings** — full profile fields (Full Name, Father Name, CNIC, Mobile, Email, WhatsApp, Gender, Marital Status, Address) + **profile-picture upload / change / remove**, plus password/security.

### Key QEC API entry points (prefix `/api/lms/academic/qec`)
- `GET /dashboard`, `GET /surveys`, `GET /surveys/:id` (accepts `11` or `SV-011`)
- `POST /surveys`, `PUT /surveys/:id` (full question replace/reorder), `PUT /surveys/:id/status` (`{action:"lock"|"unlock"}`), `DELETE /surveys/:id`
- `GET /feedback?department=&program=&semester=&course=&teacher=&status=&from=&to=` → returns `items` + `filterOptions`
- `GET /faculty-eval`, `GET /course-evaluation`, `GET /program-eval`, `GET /self-assessment`, `GET /departments`, `GET /analytics`, `GET /reports/:kind`, `GET /compliance`, `GET /audit`
- `GET /profile`, `PUT /profile`, `POST /profile/photo` (multipart `photo`), `DELETE /profile/photo`

### Data & storage
- **Models reused (no schema changes to other roles):** `Survey`, `SurveyQuestion` (`optionsJson` holds Likert options), `SurveyResponse`, `LmsExamProfile` (generic staff profile), `LmsProgram`/`LmsSemester`/`LmsCourse`/`CourseOffering`, `LmsNotification`, `LmsAuditLog`.
- **Likert scoring:** MCQ Likert answers are mapped to 1–5 (Strongly Agree=5 … Strongly Disagree=1) so they feed the existing rating/analytics pipeline without breaking `RATING` questions.
- **Profile photos:** stored under `backend/uploads/qec-profiles/` (Multer, 2 MB, image-only).
- **Survey visibility:** enabling a survey makes it appear for **Students** (verified via `/lms/academic/student/surveys`) and notifies **Teachers** via `LmsNotification` (TEACHERS-audience surveys), all at the data level — no Student/Teacher route code was modified.

**Constraints honoured (QEC overhaul):** Admissions Portal **untouched** · **only the
Director QEC role modified** (Student / Teacher / Course Coordinator / Focal Person /
Exam Controller left as-is) · **zero mock/dummy/static data** — every module fetches
from the DB in real time · Survey enable/disable UI preserved · UI/UX design language
consistent with the rest of the LMS · no architecture/table/route renames.

**Last Updated (LMS Director QEC full real-time overhaul — 12 modules): 2026-06-06**

---

## Deployment & Status
- **Platform**: Node.js + Express backend (port 5000) · React + Vite LMS frontend (port 5174) · React admissions frontend
- **Process Manager**: PM2 (`ecosystem.config.cjs`) — `aust-backend` + `lms-frontend`
- **Status**: ✅ Active (backend `/api/health` 200, LMS frontend 200)
- **Database**: Prisma ORM + SQLite (`backend/prisma/dev.db`)
- **Constraints honoured (EC overhaul):** Admissions Portal (`frontend/`) **untouched** · only the **Exam Controller** LMS role modified (Student/Teacher/Course Coordinator/Focal Person left as-is) · **zero mock/dummy/static data** — everything fetched from the DB in real time · removed modules (Exam Calendar, Invigilators, Paper Management, Rechecking, Transcript, Seating) deleted cleanly · DB integrity preserved (additive models only).

**Last Updated (LMS Exam Controller full real-time overhaul — 22 modules): 2026-06-06**

---

## LMS Provost — Fee Management Module (real-time, additive)

Implements the full **Provost Fee Management** suite (17 requirements) as an
**additive extension** of the existing Provost role. **No** existing module,
role, table, route, component, or completed functionality was modified, renamed,
moved, or removed; the **Admissions Portal (`frontend/`) is untouched**.

### Completed features (all 17 requirements, 100% real DB data — no dummy data)
1. **Real-time Dashboard** — Total Students, Collected/Pending fees, Semester &
   Exam fee records, Submitted/Pending payments, Blocked/Unblocked counts,
   Department/Program/Semester-wise stats, Recent Activities & Announcements.
2. **Complete Finance Management** — unified fee data over the Student Account Book.
3. **Semester Fee Announcement** — scope = University / Department / Program /
   Semester / Section, auto-generates Account Book challans + notifies students.
4. **Examination Fee Announcement** — same scopes, auto Account Book integration.
5. **Complete Student Fee Records** — Department/Program/Semester/Section-wise.
6. **Advanced Student Search** — Name / Roll / CNIC / Program / Semester / Section / Department.
7. **Complete Student Profile** — full info + semester/exam fee history + transactions + block history.
8. **Pending Fees Module** · 9. **Submitted Fees Module**.
10. **Professional Cards** — Department / Program / Semester summary cards.
11. **Account Book Integration** — announcing a fee auto-creates `LmsFeeChallan` rows.
12. **Online Payment** — students pay from the Account Book (**Pay Now**); status &
    Provost records update in real time.
13. **Student Blocking** (reason + date + history) · 14. **Student Unblocking** (history).
15. **Continuation After Unblock** — same semester/section/enrollment preserved (position snapshot).
16. **Reports & Analytics** — Department/Program/Semester/Section/Submitted/Pending/
    Examination/Semester/Blocked/Unblocked reports + **Excel (CSV)** & **PDF (printable HTML)** export.
17. **Real-Time Working** — every figure is derived live from the DB.

### Provost finance API (all guarded by `lmsRequireRole('Provost')`)
Base: `/api/lms/academic/provost/finance`
- `GET  /dashboard` — real-time KPIs + dept/program/semester stats + recent activity/announcements
- `GET  /filter-options` — `{departments, programs, semesters, sections}`
- `GET  /announcements?feeType=SEMESTER|EXAMINATION` · `POST /announcements` · `DELETE /announcements/:id`
- `GET  /records` · `GET /pending` · `GET /submitted` (filters: `department,program,semester,section,status,q`)
- `GET  /students` (advanced search) · `GET /students/:id/profile`
- `GET  /cards`
- `POST /students/:id/block` · `POST /students/:id/unblock` · `GET /blocked`
- `GET  /reports/:kind` · `GET /reports/:kind/export?format=csv|pdf`
  (`kind` ∈ department, program, semester, section, submitted, pending, examination, semesterfee, blocked, unblocked)

Student online payment: `POST /api/lms/academic/student/fees/:id/pay`

### Frontend (LMS, `/provost`)
- `/provost/fee-management` — dashboard + professional cards (`FeeManagement.jsx`)
- `/provost/fee-announce` — Semester + Examination announcement forms with scope selection (`FeeAnnounce.jsx`)
- `/provost/fee-records` — Students / All Records / Pending / Submitted / Blocked tabs +
  advanced search + student profile modal + block/unblock (`FeeRecords.jsx`)
- `/provost/fee-reports` — report selector + Excel/PDF export (`FeeReports.jsx`)
- Sidebar: new **FEE MANAGEMENT** section (existing menu items unchanged)
- Student `AccountBook.jsx` — **Pay Now** button on unpaid challans (existing display preserved)
- API service: `api.provost.feeMgmt.*` (namespaced to avoid colliding with the
  existing `api.provost.finance()` snapshot endpoint) + `api.student.payFee()`.

### Data model (additive only)
- `LmsFeeChallan` **extended** with nullable fields: `feeType, program, department,
  semester, section, description, sourceAnnouncementId` (no existing field changed).
- New free-standing models (no FK into existing tables): `LmsFeeAnnouncement`, `LmsStudentBlock`.
- Student academic position resolved from real data
  (`CourseRegistration → CourseOffering → LmsCourse → LmsSemester/LmsProgram`, Section),
  with `LmsStudentProfile` snapshot fallback.

### Constraints honoured (Provost Fee Management)
Admissions Portal **untouched** · only the **Provost** LMS role extended (Student/
Teacher/Course Coordinator/Focal Person/Exam Controller/Director QEC left as-is) ·
**zero dummy data** · all new schema additive (nullable/defaulted fields + standalone
models) · existing Provost routes/pages/components unchanged · existing
`api.provost.finance()` endpoint preserved.

**Last Updated (LMS Provost Fee Management — 17 requirements): 2026-06-06**

---

# LMS — Course Coordinator Role (Full Module Completion)

> Deliverable completed 2026-06-08. All modules are **LMS-side only**, backed by
> **real database data** (no mock/dummy/fallback data), and introduce **no UI / theme /
> navigation changes**. The Admissions, Auth, Student, and Teacher roles were **not
> touched** beyond the shared student-name single-source-of-truth fix (documented at
> the end of this section).

## Overview
The Course Coordinator role (frontend key `admin`, backend role `CourseCoordinator`)
gained a full suite of production-grade, real-data modules:

1. **Teacher Replacement** — CRUD + approve/reject workflow + chronological history
   timeline + timetable-conflict validation + duplicate guard + search/filter/paginate/sort.
2. **Students** — global instant search, advanced combinable filters, status tabs
   (Active / Suspended / Blocked / Enrolled), full student profile (personal / academic /
   program / enrollment history / attendance summary / academic performance / contact),
   and capacity-validated section transfer with history.
3. **Appeals** — view / approve / reject / history, approval workflow, status tracking,
   audit trail, search / filters / pagination / sorting, real-time updates.
4. **Enrollment** — view requests / approve / reject, statistics (total / approved /
   rejected / pending) + 6-month trend chart (recharts) driven from real timestamps.
5. **Announcements** — create / edit / delete / publish, audience scoping, **real-time**
   broadcast (SSE), persistent in DB.
6. **Quick Messages** — real-time chat (SSE), read receipts, unread counter, conversation
   threading, persistence.
7. **Courses & Scheme of Study** — (A) Course management CRUD with semester dropdown,
   duplicate-code prevention and credit-hours validation; (B) Scheme of Study with a
   **drag & drop** semester builder (auto-loaded course pool, reorder, instant DB updates,
   version history, referential integrity + duplicate-assignment guard).

## Architecture additions

### Real-time (Server-Sent Events)
Implemented with **SSE** (not WebSockets) to avoid extra Express dependencies.
- `backend/src/utils/lmsRealtime.js` — singleton event bus (`Map<userId, Set<res>>`)
  exposing `addClient`, `removeClient`, `emitTo`, `emitAll`, `connectionCount`.
- Stream endpoint: `GET /api/lms/academic/coordinator/events?token=<jwt>` (token is passed
  as a query param because `EventSource` cannot set Authorization headers; it is verified
  server-side). Sends a heartbeat every 25s.
- Event names emitted: `replacement`, `appeal`, `announcement`, `message`.
- Frontend pages subscribe via `new EventSource(api.coordinator.eventsUrl())` and refresh
  on the relevant event.

### Database (Prisma schema additions — all additive)
Appended to `backend/prisma/schema.prisma` (pushed via `prisma db push`):
- **`TeacherReplacement`** — originalTeacherId, replacementTeacherId, offeringId, sectionId,
  courseLabel, sectionLabel, termLabel, date, timeSlot, reason, status (default `PENDING`),
  decisionNote, decidedById, decidedAt, applied, createdById, isDeleted.
- **`SchemeOfStudy`** — programId, name, description, version, isActive, isDeleted,
  createdById (+ relations: program, items, versions).
- **`SchemeCourse`** — schemeId, courseId, semester, orderIndex, `@@unique([schemeId, courseId])`.
- **`SchemeVersion`** — schemeId, version, snapshotJson, changedById, changeNote.
- Relations added: `LmsProgram.schemes`, `LmsCourse.schemeItems`.

### Backend routers (additive, mounted before the base coordinator router)
- `backend/src/routes/lms/academic/coordinatorPlus.js` — Teacher Replacement, Students,
  Enrollment, Appeals, Announcement edit/publish, Quick Messages real-time.
- `backend/src/routes/lms/academic/scheme.js` — Scheme of Study drag & drop endpoints.
- Mounted in `backend/src/server.js` at `/api/lms/academic/coordinator`.

## API endpoints (all under `/api/lms/academic/coordinator`)
Role guard: `CourseCoordinator` for mutations; reads also allow `Provost` / `FocalPerson`.

**Real-time**
- `GET  /events?token=` — SSE stream.

**Teacher Replacement**
- `GET    /replacements?status=&search=&page=&pageSize=&sortBy=&sortDir=`
- `POST   /replacements` — { originalTeacherId, replacementTeacherId, offeringId?, sectionId?, date?, timeSlot?, reason }
- `PUT    /replacements/:id` — edit (only while PENDING)
- `PUT    /replacements/:id/decide` — { action: approve|reject, note? }
- `DELETE /replacements/:id` — soft delete
- `POST   /replacements/check-conflict` — { replacementTeacherId, date?, timeSlot? }

**Students**
- `GET /students-list?search=&status=&program=&batch=&section=&page=&pageSize=`
- `GET /students-filters` — distinct programs / batches / sections
- `GET /students-counts` — { all, active, suspended, blocked, enrolled }
- `GET /students/:id/profile` — personal / academic / contact / enrollmentHistory / attendanceSummary / academicPerformance
- `PUT /students/:id/transfer` — { registrationId, toSectionId } (capacity-validated)

**Enrollment**
- `GET /enrollment/requests?status=&search=&page=&pageSize=`
- `PUT /enrollment/requests/:id/decide` — { action: approve|reject, note? }
- `GET /enrollment/statistics` — { totals, trend[6 months] }

**Appeals**
- `GET /student-appeals?status=&search=&page=&pageSize=&sortDir=`
- `PUT /student-appeals/:id/decide` — { action: approve|reject, response? }
- `GET /student-appeals/counts` — { all, pending, approved, rejected }

**Announcements (extra)**
- `PUT  /announcements/:id` — edit
- `POST /announcements/:id/publish` — real-time broadcast + (re)notify

**Quick Messages (extra)**
- `GET /messages-unread` — { total, byContact }
- `POST /messages-send/:userId` — { body } (real-time delivery)
- `PUT  /messages-read/:userId` — read receipts

**Scheme of Study**
- `GET    /schemes?programId=`
- `GET    /schemes/:id` — semester columns + auto-loaded unassigned pool + totalCourses
- `GET    /schemes/:id/history` — version snapshots
- `POST   /schemes` — { programId, name, description? }
- `PUT    /schemes/:id` — edit metadata
- `DELETE /schemes/:id` — soft delete
- `POST   /schemes/:id/items` — { courseId, semester } (duplicate + integrity guards)
- `PUT    /schemes/:id/items/:itemId/move` — { semester, orderIndex? }
- `PUT    /schemes/:id/reorder` — { semester, order: [schemeCourseId...] }
- `DELETE /schemes/:id/items/:itemId`

## Frontend pages (consume the new endpoints; theme unchanged)
- `pages/admin/TeacherReplacement.jsx` — CRUD, decision actions, history timeline, live conflict pre-check, SSE refresh.
- `pages/admin/AdminStudents.jsx` — debounced global search, advanced filters, status tabs with counts, full profile modal, pagination.
- `pages/admin/Enrollments.jsx` — statistics cards + recharts trend, tabs, search, approve/reject, pagination.
- `pages/admin/AdminAppeals.jsx` — tabs, search, sort, view/approve/reject modal, SSE refresh.
- `pages/admin/AdminAnnouncements.jsx` — create/edit/delete/publish, SSE live indicator.
- `pages/admin/QuickMessages.jsx` — real-time chat, unread badges, read-receipt ticks.
- `pages/admin/Schemes.jsx` — scheme list + native HTML5 **drag & drop** semester builder + version history. Route `/admin/schemes` now renders this dedicated page.
- New API methods added to `lms-frontend/src/services/api.js` under `coordinator` (incl. `eventsUrl()` SSE helper).

## Student Name Consistency Fix (single source of truth = database)
- `lms-frontend/src/context/AuthContext.jsx` — removed the hardcoded student name; added
  exported `buildProfileFromMe(me)` which maps the live `GET /api/lms/auth/me` response to
  the displayed profile (`name`, `studentId`, program, etc.). The mount effect and `login()`
  (now async) both hydrate from `/me`.
- `pages/auth/Login.jsx` and `pages/auth/ForceChangePassword.jsx` — `await login(...)` so the
  real DB identity is loaded before navigation.
- Result: sidebar, navbar, dashboard, and profile all render `user?.name` sourced solely from
  the database — no localStorage user-name, no admissions snapshot, no hardcoded/fallback names.

## Testing summary (all passing)
- Backend endpoints verified via curl with a real `CourseCoordinator` token:
  students-list/counts/filters, enrollment statistics+trend, teacher-replacement full
  lifecycle (create → list with name decoration → approve → delete), duplicate guard,
  appeals list/counts, scheme full drag-drop lifecycle (create → auto-pool → add → duplicate
  guard → move → 3-version history → remove → delete), SSE connect (`: connected`) + 401 when
  unauthenticated.
- `/api/lms/auth/me` confirmed returning real DB names (e.g. `ADCS-001` → "Ali Khan").
- All 8 new/updated frontend files transform cleanly (esbuild JSX check) and the Vite dev
  server serves with no console errors.

## Deployment notes
- Dev: backend on `:5000`, LMS frontend (Vite) on `:5174`, both under PM2 (`ecosystem.config.cjs`).
  **Do not run a production `vite build` in the constrained sandbox** (OOM); use the dev server.
- Schema change applied with `npx prisma db push` (additive — safe for existing data).

**Last Updated (LMS Course Coordinator — full module completion + student-name fix): 2026-06-08**

---

# LMS Student Role — Full Enhancement (8 Requirements, 2026-06-09)

> **Scope guarantee:** ALL changes are **LMS-side only** (`lms-frontend/` + LMS-scoped backend
> routes under `/api/lms/...`). The **Admissions Portal (`frontend/`) was NOT modified in any
> way** — verified: `git status frontend/` reports zero changed source files. No Admissions UI,
> workflow, DB structure, API, routing, or functionality was touched.

## What was delivered

### 1. Dashboard — Premium University Course Cards
- Replaced placeholder "Teacher 1 / Teacher 2" with **real teacher names** resolved from
  `teacher.profile.fullName` (verified live: Dr.Naeem, Dr. Zeeshan, Dr. Imran Malik, Dr. Asim
  Shezad, Dr.Fahad).
- Each card shows **Course Name, Code, Credit Hours, Teacher(s), Semester, Section, Progress Bar**.
- Quick-access buttons in **every** card — **Assignment, Quiz, Attendance, Announcements** — that
  deep-link into that specific course's view (`?course=<code>`).
- Premium responsive UI (gradient cards, framer-motion).

### 2. Live Classes — BigBlueButton (self-hosted) Integration
- Backend: meeting **create / join / end**, **attendance tracking** (join/leave/duration via new
  `LiveClassAttendance` model), **recording sync** (`bbb.getRecordings`), event logging, analytics,
  secure role-based access, full error handling + graceful degradation when `BBB_URL`/`BBB_SECRET`
  are unset.
- Routes: `POST /live-classes/:id/join`, `POST /live-classes/:id/leave`,
  `GET /live-classes/:id/recordings`.
- Frontend: signed-join flow, Leave button + `beforeunload` beacon to close attendance sessions.

### 3. AI Tutor (self-hosted) — UI/UX Enhancement Only
- Backend `chatTutor()` with conversation persistence (`AiTutorMessage` model), course-specific
  context, and graceful fallback study-guidance when the LLM has no credits (`aiConfigured:false`).
- Routes: `GET /ai-tutor/history`, `POST /ai-tutor/chat`.
- Frontend rewrite: modern chat, typing indicator, conversation history, per-course rail,
  AI-availability banner, mobile-responsive academic theme.

### 4. Assignment — Course-wise Workflow
- Course card grid (enrolled courses only) → click → that course's assignments.
- Categories: **Pending / Submitted / Graded** with counts; search + filters.
- Details: Title, Description, Due Date, Total Marks, Obtained Marks, Submission Status, Teacher
  Name, Attachments. Features: **Upload, Replace Submission, View, Download** (graded cannot resubmit).
- Deep-link `?course=<code>`. Premium responsive UI.

### 5. CGPA Calculator — Redesigned
- Auto-loads all **enrolled courses** (Name, Code, Credit Hours) + transcript.
- Per-course **Marks or Grade** entry (auto marks→grade conversion).
- Computes **Previous CGPA** (from transcript), **Current GPA** (entered grades), **Final CGPA**
  (combined, credit-hour weighted). Shows previously completed courses.

### 6. Automatic First-Semester Enrollment
- On onboarding (`lmsProvision.js`) **and** first login (`lmsAuthV2.js`): resolves
  Program/Department/Session → reads approved Scheme of Study → loads **Semester 1** courses →
  auto-enrolls into active offerings. Idempotent; never duplicates. No manual enrollment.
- Verified live: test student auto-enrolled into 6 Semester-1 courses.

### 7. Activity Module — Repaired & Real-time
- New `StudentActivity` model + centralized fire-and-forget `logActivity()` util.
- Tracks: **login, logout, assignment submissions, quiz attempts, attendance, live-class
  participation, course access, announcement views, AI Tutor usage** (+ derived results/appeals).
- `GET /activity` supports `type`, `q` (search), `from`, `to`, `limit`; returns
  `{timeline, total, typeCounts}`. Verified live: 19 entries across LOGIN/AI_TUTOR/LIVE_CLASS/
  COURSE_ACCESS/RESULT types.
- Frontend: professional day-grouped timeline, type filter chips with counts, search, date range.

### 8. Calendar Module — Removed
- Removed: student `Calendar.jsx` page, sidebar nav link, `App.jsx` route+import, dashboard
  widget (none remained), backend `/calendar` route (now **404**), and the unused `student.calendar`
  API method. No other functionality affected (Schedule module is separate and untouched).

## New / changed data models (additive `prisma db push`)
- `LiveClassAttendance` — id, liveClassId, studentId, joinedAt, leftAt, durationSec, role, meetingId.
- `StudentActivity` — id, studentId, type, title, description, courseCode, courseTitle, refType,
  refId, metadata(JSON), ipAddress, createdAt (indexed on studentId, type, createdAt).
- `AiTutorMessage` — id, studentId, role, content, courseCode, courseTitle, createdAt.

## Key LMS Student API endpoints (under `/api/lms/academic/student`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/dashboard` | Course cards w/ real teacher names, progress, quick-access targets |
| GET | `/courses` | Enrolled courses (auto-enrolled) |
| POST | `/live-classes/:id/join` | Signed BBB join + attendance open |
| POST | `/live-classes/:id/leave` | Close attendance, compute duration |
| GET | `/live-classes/:id/recordings` | Stored + BBB recordings |
| GET | `/ai-tutor/history` | Persisted chat history |
| POST | `/ai-tutor/chat` | Course-aware tutor chat (graceful fallback) |
| GET | `/assignments` …`/:id/submit` | Course-wise assignments + submit/replace |
| GET | `/activity?type=&q=&from=&to=&limit=` | Real-time filterable timeline |
| POST | `/logout-activity` | Logout event log |
| POST | `/announcements/:id/view` | Announcement-view log |

## Verification (live, this session)
- Build: all 7 rewritten student pages transform cleanly via Vite (HTTP 200, zero error markers)
  and pass standalone esbuild JSX checks. Full production `vite build` is **OOM-constrained in the
  985 MB sandbox** (sandbox limit, not a code defect) — use the dev server here; the bundle builds
  fine in a normal-memory CI/deploy environment.
- Backend health `{"status":"ok"}`; login (ADCS-001) succeeds; auto-enroll → 6 courses; dashboard
  → real teacher names; activity → 19 real-time entries w/ filters; AI tutor → graceful fallback;
  live-classes → 3 classes; `/calendar` → 404.
- Admissions `frontend/` source: **0 changes**.

**Last Updated (LMS Student Role — 8-requirement enhancement): 2026-06-09**

---

## 🚀 Phase 2 — Enhancement & Optimization (2026-07-04)

This phase **enhanced and optimized the existing system only** — no rebuild, no
redesign, and no existing functionality was broken. All changes are additive and
preserve strict department/role isolation.

### 1. Merit Visibility — student sees ONLY their own result
- `GET /api/merit` (student) now returns `{ myEntries, meritList: [] }`. The full
  finalized merit list is **never** sent to a student. Each entry includes the
  student's own **per-program rank** (computed server-side by counting higher
  `totalMerit` in the same program) plus score/status.
- Frontend `MeritSection.jsx` removed the "Published Merit List" table entirely;
  students only see a private "My Merit" card with a privacy note.
- **Files**: `backend/src/routes/merit.js`, `frontend/src/components/dashboard/MeritSection.jsx`.

### 2. Payment Gateway — EasyPaisa removed, generic Bank Payment Gateway added
- New generic gateway abstraction `backend/src/utils/bankGateway.js`
  (config/isConfigured/initiatePayment/verifyWebhookSignature/recordTransaction).
  Works in **sandbox** mode out-of-the-box; going live only needs API credentials.
- New Prisma model **`PaymentGatewayConfig`** (mode/apiUrl/apiKey/secretKey/
  merchantId/callbackUrl/webhookSecret/returnUrl). `PaymentMethodConfig` gained
  `bankGatewayEnabled` + `bankGatewayInstructions`; `easypaisaEnabled` defaults false.
- New endpoints: `POST /api/payments/gateway/processing-fee`,
  `POST /api/payments/gateway/admission-fee`, signature-verified
  `POST /api/payments/gateway/webhook`, browser `GET /api/payments/gateway/callback`.
  Legacy `/easypaisa/*` paths are kept as **aliases** for backward compatibility.
- `BANK_GATEWAY` is a first-class payment method everywhere (admin config,
  student fee UI, application display). Legacy `EASYPAISA` entries auto-map to it.
- **Developer guide**: `docs/PAYMENT_GATEWAY_INTEGRATION.md` (config, flows,
  request/response contract, webhook verification, testing, go-live checklist).
- **Files**: `backend/src/utils/bankGateway.js`, `backend/src/routes/payments.js`,
  `backend/src/routes/paymentMethods.js`, `backend/prisma/schema.prisma`,
  `frontend/src/components/dashboard/FeeSection.jsx`,
  `frontend/src/components/dashboard/ApplicationSection.jsx`,
  `frontend/src/pages/AdminDashboard.jsx`.

### 3. Admission Cycle — Semester Fee removed (Fee Management only)
- The Fee Breakdown block was removed from the Admission Cycle announcement form;
  the cycle upsert **preserves** existing fee data when omitted. Semester/admission
  fees now live exclusively in **Fee Management**.
- Valid cycle payment methods: `BANK_TRANSFER`, `BANK_GATEWAY`, `ONEBILL_VOUCHER`
  (with `EASYPAISA → BANK_GATEWAY` mapping).
- **Files**: `backend/src/routes/admissionCycle.js`, `frontend/src/pages/AdminDashboard.jsx`.

### 4. Backup & Export — structured ZIP + accurate master spreadsheets
- All bulk ZIP exports now organise files as
  **`Department / Program / <StudentName_CNIC>/`** (full-backup uses
  `applicants/<Dept>/<Program>/…`), each with `application_data.json`, a per-student
  README and all documents.
- Every master spreadsheet + tabular list now includes the full required column set:
  **Name, Father Name, CNIC, Department, Program, Merit Score, Merit Rank,
  Roll Number, Reg. Number, Enrollment Number, Status, Email**.
  Applied to `all-applicants`, `enrolled-students`, `full-backup`,
  `merit-list`, `enrolled-list`, `all-applicants-list` and `program-zip`.
- **Files**: `backend/src/routes/exports.js`.
- **Export endpoints** (staff only — Super Admin / Director / Coordinator, dept-scoped):
  | Method | Path | Output |
  |--------|------|--------|
  | GET | `/api/exports/all-applicants` | ZIP (Dept/Program/Student) + `Master_Applicants.xlsx` |
  | GET | `/api/exports/enrolled-students` | ZIP + `Master_Enrolled.xlsx` |
  | GET | `/api/exports/full-backup` | Full system ZIP + `All_Applicants_Master.xlsx` |
  | GET | `/api/exports/program-zip?programId=&cycleId=` | Program ZIP + applicants + merit list |
  | GET | `/api/exports/merit-list?format=xlsx\|csv` | Merit list (Father Name, Merit Score, Reg/Roll) |
  | GET | `/api/exports/enrolled-list?format=xlsx\|csv` | Enrolled roster w/ enrollment numbers |
  | GET | `/api/exports/all-applicants-list?format=xlsx\|csv` | Full tabular applicant roster |
  | GET | `/api/exports/stats` | Live dept-scoped counts for the export UI |

### 5. Student improvements — mandatory fields, draft autosave, save UX
- **Mandatory Profile fields** enforced on save (First/Last name, CNIC, Father's
  name, DoB, mobile, gender, domicile province, present address street + district)
  with a clear inline banner and auto-scroll to the first invalid field.
- **Draft autosave** to `localStorage` for both Profile and Education forms — an
  accidental refresh no longer loses typed data; a "restored" banner appears and
  the draft is cleared on successful save. (Education file selections must be
  re-attached, as browsers cannot restore local file handles.)
- After a successful save the page **scrolls to top** and shows a success
  notification.
- **Files**: `frontend/src/components/dashboard/ProfileSection.jsx`,
  `frontend/src/components/dashboard/EducationSection.jsx`.

### 6. Director Dashboard — per-department cards + forwarding
- New **"New Applications by Department"** cards on the Director dashboard show,
  per department, the count of new applications awaiting forward plus totals
  (forwarded / enrolled) and a coordinator-assignment warning.
- One-click **"Forward All to Coordinator"** per department; single/multi
  forwarding remains available via row selection + select-all on the Applications
  screen.
- New endpoints: `GET /api/admin/dept-application-counts`,
  `PUT /api/admin/applications/forward-department`.
- **Files**: `backend/src/routes/admin.js`, `frontend/src/pages/AdminDashboard.jsx`.

### 7. Result Awaited + accurate progress %
- A persistent **Result Awaited reminder banner** now shows on every dashboard
  visit while the application is on hold, explaining the student can apply but
  cannot pass Initial Merit until the FSc result is declared — and that updating
  the Education record auto-continues the application (existing backend logic).
- The **application progress percentage** was fixed: every real status is mapped
  to one of the 8 canonical stages (no more misleading 8% fallback), and an
  enrolled application reads a true 100%.
- **Files**: `frontend/src/pages/Dashboard.jsx`.

### 8. Performance optimization (HIGH priority)
- **Database indexing** — added indexes on every hot admissions table:
  `Application` (status, userId, programId, admissionCycleId, composite
  program+status / cycle+status, submittedAt), `StatusEvent`, `MeritEntry`
  (userId, totalMerit, isFinalized), `Profile.cnic`, `Education`,
  `EducationDocument`, `Document`, `Interview`, `FeePayment`, `Enrollment`,
  `Transaction`, `Appeal`, and `Notification` (incl. `userId+isRead`).
  Shipped as idempotent migration
  `prisma/migrations/20260704000000_phase2_performance_indexes/`.
- **Caching** — lightweight in-memory TTL cache `backend/src/utils/cache.js`;
  the high-traffic public `GET /api/programs` is cached 60s and invalidated on any
  department/program write.
- **Pagination** — `GET /api/admin/applications` now supports optional
  `?page=&pageSize=` (returns `total`, `page`, `pageSize`, `totalPages`) while
  remaining fully backward-compatible when those params are omitted.
- **Files**: `backend/prisma/schema.prisma`,
  `backend/prisma/migrations/20260704000000_phase2_performance_indexes/migration.sql`,
  `backend/src/utils/cache.js`, `backend/src/routes/programs.js`,
  `backend/src/routes/departments.js`, `backend/src/routes/admin.js`.

### Running locally (sandbox)
```bash
# Backend + both frontends run under PM2 (see ecosystem.config.cjs):
pm2 start ecosystem.config.cjs      # aust-backend :5000, admissions :3000, lms :5174
pm2 logs --nostream                 # inspect logs

# Apply DB migrations / indexes:
cd backend && npx prisma migrate deploy   # or: npx prisma db push
```
The admissions frontend auto-rewrites the sandbox host (`3000-… → 5000-…`) so a
single port-3000 preview URL drives the whole application.

**Phase 2 Last Updated: 2026-07-04**

---

## 🚀 Phase 3 — Department Isolation, Payment Gateway & LMS Sync Finalization (2026-07-04)

This phase **completed the remaining Master-Prompt requirements** on top of the
existing system. All changes are **additive and non-breaking** — no workflow was
redesigned and backward compatibility (legacy roles, legacy `EASYPAISA` data) is
preserved.

### §1 — Role-isolated Department Staff dropdowns
- Added an additive, non-breaking `User.staffRole` tag
  (`admissions_coordinator | course_coordinator | focal_person`). The auth
  `role` column stays `coordinator` so **every existing auth check / workflow
  keeps working**.
- `GET /api/departments/staff-candidates` now returns a `candidatesByRole`
  object partitioned into the three roles. The Super Admin's assignment
  dropdowns each show **ONLY** users of the correct role and never mix them.
  Untagged legacy coordinators remain assignable everywhere the first time, then
  get tagged on assignment.
- **Files**: `backend/prisma/schema.prisma`, `backend/src/routes/departments.js`,
  `frontend/src/super-admin/pages/DepartmentManagement.jsx`.

### §2 — Campuses module removed (single-campus ODL platform)
- Removed the Campuses & Study Centers screen, its route, sidebar entry, API
  client methods, backend routes and controller functions. The `Campus` Prisma
  model is retained only for migration safety (no longer exposed by any API).
- **Files**: `frontend/src/App.jsx`,
  `frontend/src/super-admin/components/Sidebar.jsx`,
  `frontend/src/super-admin/pages/Institution.jsx`,
  `frontend/src/super-admin/saApi.js`,
  `backend/src/modules/super-admin/superAdmin.routes.js`,
  `backend/src/modules/super-admin/institution.controller.js`.

### §5 — EasyPaisa removed completely
- Deleted the dead `backend/src/utils/easypaisa.js`, removed the legacy
  `/api/payments/easypaisa/*` alias routes, and dropped EasyPaisa from the
  admin config surface (the redundant "EasyPaisa Config" dashboard tab and
  `EasypaisaConfigSection` component were deleted — the Bank Payment Gateway is
  configured under **Payment Methods**).
- All method allow-lists / defaults now use `BANK_GATEWAY`. A legacy `EASYPAISA`
  value (in old cycle data or submissions) is still **accepted and normalised to
  `BANK_GATEWAY`** so nothing breaks. All user-facing "EasyPaisa" wording across
  public pages (FAQ, Fee Structure, Programs, Privacy, Terms, News, Downloads,
  Admissions steps) was replaced with "Bank Payment Gateway".
- **Files**: `backend/src/routes/payments.js`, `admissionCycle.js`,
  `application.js`, `fee.js`, `paymentMethods.js`,
  `frontend/src/pages/AdminDashboard.jsx`, `CoordinatorDashboard.jsx`,
  and the public content pages listed above.

### §13 — LMS credentials no longer revert to "Pending"
- Fixed `GET /api/enrollment/my`: once the Director has **published**
  credentials they stay visible **permanently**. The credentials card no longer
  disappears (reverting to "Pending") after the student logs into the LMS.
  Only the **temporary password** is hidden after the first LMS login / password
  change; Registration Number, Roll Number and LMS Username remain visible.
- **Files**: `backend/src/routes/enrollment.js`,
  `frontend/src/pages/Dashboard.jsx`.

### Already in place (verified this phase)
The following Master-Prompt items were confirmed already implemented and working:
§3 (Super Admin ↔ Director admission-cycle parity), §4 (per-program merit with 3
separate Matric/FSc/Interview weights, interview may be 0%), §6 (generic Bank
Payment Gateway + `docs/PAYMENT_GATEWAY_INTEGRATION.md`), §7 (live
per-department new-application counters), §8 (single/multi/all bulk forwarding),
§9 (automatic result sync — no manual "Update Result"), §10 (View Details in
Initial Merit), §11 (Not Eligible workflow with stored reason), §12 (admission
cycle controls student-visible programs), §14 (`lmsDeptScope.js` absolute
department isolation), §15 (`autoEnrollService.js` automatic first-semester
enrollment), §16 (Focal Person department-only authority), §17 (LMS self
profile management).

**Phase 3 Last Updated: 2026-07-04**

---

## LMS Support & Grievances Portal (Upgrade)

The LMS-side **Appeals** module has been upgraded into a full **Support & Grievances Portal**. The Admissions Appeal module (`backend/src/routes/appeals.js`, `Appeal` model) is **completely unchanged**.

### What changed (all additive, no data loss)
- **Schema**: `StudentAppeal` extended with nullable columns (caseCode, caseType, category, priority, context links, SLA, assignment, escalation, feedback). New additive models: `GrievanceMessage`, `GrievanceInternalNote`, `GrievanceStatusHistory`. Existing appeal records preserved (verified) and get an immutable public `GRV-YYYY-NNNNNN` code lazily.
- **Case types**: Grievance | Support Request | Appeal | Suggestion | Feedback.
- **Categories**: Academic / Technical / Administrative / Quality-Service / Other (configurable catalog in `backend/src/utils/lmsGrievance.js`).
- **Priority + SLA**: LOW/MEDIUM/HIGH/URGENT with env-configurable SLA budgets; breach computed on read.
- **Routing**: category → default role, reuses existing dept-scoped routing; adds QEC + Finance targets.

### Student endpoints (`/api/lms/academic/student/appeals`)
`GET /` list · `GET /categories` · `GET /stats` · `GET /recipients` · `POST /` submit · `GET /:id` (conversation+timeline, no internal notes) · `POST /:id/reply` · `POST /:id/reopen` · `POST /:id/feedback`

### Staff endpoints (`/api/lms/academic/grievances`, all LMS staff roles)
`GET /` (filters: status/caseType/category/priority/q/sla) · `GET /stats` (analytics) · `GET /:id` (full, incl. internal notes) · `POST /:id/reply` · `POST /:id/internal-note` · `PUT /:id/status` · `PUT /:id/priority` · `PUT /:id/assign` (assign/reassign) · `POST /:id/escalate` · `GET /meta/config`

### Security (server-enforced)
Role-based visibility per case, object-level ownership (IDOR-protected), internal notes never returned to students (verified), full audit log + case-scoped timeline.

### Frontend (staff + student portal — complete)
LMS menu renamed **Appeals → Support & Grievances** across all sidebars (student, teacher, course coordinator, focal person, exam coordinator, QEC coordinator, provost).

- **Staff portal (all 6 roles)** — reusable `components/grievance/StaffGrievancePortal.jsx` (stats strip, search + status/type/priority/SLA-breach filters, case list) driving `components/grievance/GrievanceCaseDrawer.jsx` (Conversation / Internal Notes / Timeline tabs; action rail for status, priority, assign/reassign, escalate, resolve/close). Consumes `api.grievances.*`. Routes: `/teacher/appeals`, `/admin/appeals` (Course Coordinator), `/focal/grievances`, `/exam/grievances`, `/qec/grievances`, `/provost/grievances` (Provost handles finance-routed cases — Finance is merged into the Provost office; there is no separate finance frontend role).
- **Student page** (`pages/student/Appeals.jsx`) — submit form has Case Type + Priority; the case view is now a full modal that consumes the new endpoints: **Conversation** (view thread + reply with attachment via `grievanceCase`/`grievanceReply`), **Details** (GRV code, category, SLA target), **Timeline** (status history), **Reopen** for RESOLVED/CLOSED/REJECTED (`grievanceReopen`), and **satisfaction feedback** (resolved yes/no, 1–5 rating, comment via `grievanceFeedback`). List shows the immutable `GRV-YYYY-NNNNNN` code.
- Shared client vocabulary/colour helpers in `components/grievance/grievanceShared.js`. All changes additive; legacy appeal endpoints, Admissions Appeal, and unrelated pages remain fully functional (verified: zero diff on `backend/src/routes/appeals.js` and `frontend/`).

---

# System Update — Implementation Record (12 Requirements)

All 12 requirements from the System Update Prompt are implemented, tested and verified.
Scope was strictly limited to the listed items; no other frontend, backend or database
behaviour was altered.

## §1 ADMISSION SYSTEM

### §1.1 Student signup + login math captcha — DONE
- **New**: `frontend/src/components/AuthCaptcha.jsx` — `forwardRef` component with
  `useImperativeHandle({ refresh })`, fetches `GET /api/auth/captcha`, real-time
  generate / validate / refresh.
- Wired into `frontend/src/pages/Login.jsx` and `frontend/src/pages/Register.jsx`
  **only** (Student role). No other role's auth pages touched.
- `frontend/src/components/AuthIcons.jsx` — appended `ShieldIcon`.
- `frontend/src/styles/auth.css` — `.aust-captcha*` block.
- Closed a pre-existing LMS-fallback captcha-bypass hole in the login path.
- **Verified**: wrong answer → `{"error":"Incorrect captcha answer. Please try again."}`;
  correct answer → successful login with token.

### §1.2 Education Record flow — DONE
- (a) Existing Education Record module + result-awaited workflow **unchanged**.
- (b) `frontend/src/pages/Dashboard.jsx` — new **"Update Education Record"** button on
  the Student **Overview** tab, navigating to Education Record.
- (c) `frontend/src/components/dashboard/ApplicationSection.jsx` — the **"Update Record"**
  button in *Education Record and Applications* now navigates correctly
  (`goToEducationRecord()` + `onNavigate` prop + `aust:navigate` channel).
- (d)(e) **New**: `frontend/src/utils/educationWatcher.js` — a shared, ref-counted,
  system-wide real-time watcher. `buildSignature()` fingerprints the education records
  **including attached documents**; adaptive polling (8 s normal / 3 s fast window) plus
  `visibilitychange`, `focus` and `online` triggers; broadcasts `aust:education-updated`
  and `aust:refresh`. `pingEducationWatcher()` is called after all 3 mutation sites in
  `EducationSection.jsx`, so an update is detected **without any manual refresh**.

## §2 DIRECTOR ROLE (ADMISSION)

### §2.1 Applications module — per-department new-application badge — DONE
- `frontend/src/pages/AdminDashboard.jsx` → `ApplicationsSection`: WhatsApp-style
  **circular badge on the card corner** of each department card.
- Counts sourced from `GET /api/admin/dept-application-counts` (`NEW_APP_STATUSES`),
  correctly mapped per department, with a client-side fallback (`NEW_APP_STATUSES_UI`).
- Real time: 8 s poll + `focus` + `visibilitychange` + `aust:refresh`.
- **Verified**: endpoint returns `departments[{departmentId, departmentName,
  newApplications, totalApplications, ...}], totalNewApplications`.

### §2.2 Fee Management — full previous fee record + 11 smart filters — DONE
**Backend** (`backend/src/routes/feeManagement.js`):
- `GET /api/fee-management/payments/pending` — rewritten. Joins `LmsStudentProfile`
  and `LmsFeeChallan` to derive **11 new row fields**: `userId`, `programShortForm`,
  `registrationNumber`, `session`, `batch`, `section`, `semester`, `semesterNumber`,
  `className`, `cnic`, `phone`, `email`. Also returns `filterOptions` with 8 option
  lists (`programs`, `departments`, `sessions`, `batches`, `sections`, `semesters`,
  `classes`, `methods`).
- **New** `GET /api/fee-management/payments/:paymentId/history` — returns the
  **complete previous fee record**: `student` (16 fields), `current` payment, and a
  merged, date-sorted `records[]` drawn from three sources —
  `ADMISSION_FEE` (FeePayment), `PROCESSING_FEE` (Application `procFee*` +
  `AdmissionCycle.applicationProcessingFee`), and `LMS_SEMESTER_FEE` /
  `EXAMINATION_FEE` (LmsFeeChallan, incl. `challanNo`, `section`, `lineItems`) —
  each carrying **which semester**, **which platform**, amount, txn ref, status and
  dates. Plus a `summary` (`totalPaid`, `totalPending`, approved/rejected/pending
  counts, `platforms[]`, `semestersPaid[]`).
- Coordinator department-scope guard applied; `/:cycleId/:programId` still declared last.

**Frontend** (`frontend/src/pages/AdminDashboard.jsx` → `FeeManagementSection`):
- Module-scope `FeeFilterPanel` with all **11 required filters**: Semester, Program,
  Session, Batch, Section, Class, Name, Roll No, CNIC, Phone Number, Email — applied
  live via a `filteredPending` memo.
- `FeeHistoryPanel` — student identity grid, summary badges and an 8-column records
  table; opened by a new **"Fee Record"** toggle and **auto-opened when Reject is
  pressed**, so the approver always sees the full history before deciding.
- Real time: polling tightened 20 s → 8 s plus `focus` / `visibilitychange` /
  `aust:refresh`; cache-busted requests.
- **Verified** end-to-end with a temporary seeded payment: `/payments/pending`
  returned all 11 fields + all 8 filter lists; `/payments/1/history` returned the
  student block, a 2-record history (ADMISSION_FEE `isCurrent:true` + PROCESSING_FEE)
  and a correct summary. Fixture then **fully reverted**.

## §3 LMS

### §3.1 Course Coordinator Weightage — auto-scroll bug fixed — DONE
- Root cause: `ItemRows`, `CountField` and `ITEM_PREFIX` were declared **inside** the
  parent's render body, so each keystroke produced new component identities → React
  unmounted/remounted the subtree → the focused input was destroyed and the scroll
  container reset.
- Fix: hoisted all three to **module scope** and pass state via props
  (`lms-frontend/src/pages/admin/Weightage.jsx`).
- **All existing fields, content, labels and calculation logic are unchanged.**

### §3.2 Course Distribution — "New Distribution" page — DONE
- **New**: `lms-frontend/src/pages/admin/NewDistribution.jsx` (26 KB) — professional
  table-style page implementing the exact required sequence:
  **(1) Program → (2) Semester → (3) Batch → (4) "Add Course" (entered manually) →
  (5) assign Teacher → (6) "Add Another Course"** for multiple courses, each with its
  own teacher and its own (same or different) semester / batch.
- Sequential step gating via `StepChips`, per-row live validation, review table and
  per-row result reporting.
- `TeacherAssignment.jsx` — **"New Distribution"** now navigates to
  `/admin/teacher-assignment/new`; route registered in `App.jsx` (L78 import, L372 route).
- **Backend**: `POST /api/lms/academic/coordinator/distribution/batch` — accepts the
  multi-course payload with department isolation. Reflected in real time.

### §3.3 Borrow Instructor → New Request — DONE
- `lms-frontend/src/pages/admin/Teachers.jsx` — *"Request Instructor from Department"*
  now renders a **department-names-only** select (`deptNames` projection); the
  **which course** field is **mandatory** in the UI; **"Send Request"** works and
  reloads the outgoing list in real time.
- **Backend** `coordinatorPlus.js` (L1358–1362) — the course is now enforced
  server-side too: a request with no course is rejected with
  *"Please select the course this instructor is needed for."*

## §4 FOCAL PERSON ROLE

### §4.1 "Student Drop" → "Student Block" — DONE (labels only)
- Renamed across sidebar, dashboard tile, page title, breadcrumb, modal, buttons,
  policy text, table column, export header, empty state and toasts —
  15 replacements in `StudentDrop.jsx`, plus `Sidebar.jsx` L130 and
  `focal/Dashboard.jsx` L155. Page title is now **"Student Block & Restore"**.
- **Zero logic change.** Verified: a repo-wide grep finds no remaining user-facing
  "Drop" label in the module.

### §4.2 Discipline and Fines → New Case — student search filters — DONE
- **Backend**: new `GET /api/lms/academic/focal/student-search` (declared *before*
  `/students/:id` so it is not swallowed) — returns the full department student
  directory with every required attribute: **Program, Semester, Session, Batch, Name,
  Roll Number, Email, CNIC, Phone Number** (plus section, registration no., father's
  name, active flag, enrolled courses) and a `filterOptions` block.
- **Frontend** `lms-frontend/src/pages/focal/Discipline.jsx`: module-scope
  `StudentSearchPanel` with all **9 filters** applied live, a scrollable
  click-to-select result list, a selected-student detail grid, filters reset on submit,
  and the modal widened `max-w-xl` → `max-w-3xl`.
- `services/api.js` — added `focal.studentSearch()`.
- **Verified**: `total: 13` students, all 9 filterable fields populated, option lists
  correct.

### §4.3 Lab Task Monitor — lab-only courses + 10 pre-result filters — DONE
- **Backend** `focal.js` `GET /assessment-monitor`: enriched the `course` include with
  `program` + `semester`, added the `term` include and teacher profile, and added two
  queries (`courseRegistration`, `labTaskSubmission`). Each `labTasks` row now carries
  program / semester / session / batch / courseCode / credits, and a **new
  `labStudents[]`** array gives **lab details individually per student** (name, roll,
  registration no., email, CNIC, phone, program, semester, session, batch, section,
  task counts, obtained / total marks, percent, plus a per-task `details[]` with
  status, marks, due date, submission time and feedback). Lab-scoped
  `filterOptions.lab` is returned separately.
- **Only courses with a real lab component are displayed** — enforced by the
  `o.course.hasLab === true` guard.
- **Frontend** `lms-frontend/src/pages/focal/AssessmentMonitor.jsx` (rewritten):
  `LAB_FILTERS` with all **10 required filters** (Program, Semester, Session, Batch,
  Name, Roll No, Email, Course, Phone Number, CNIC) rendered **BEFORE** the results,
  plus an expandable `StudentLabCard` per student per lab course and a dedicated export.
- **Verified** with a temporary lab fixture: with 8 offerings and 1 lab-flagged course,
  `labTasks` returned exactly **1** row and `labStudents` **7** rows;
  `filterOptions.lab.courses` listed only the lab course; `credits: "3+1"`; per-student
  `details[]` showed `GRADED / 17 / 20 / "Good work"`, `percent: 85`.
  Fixture then **fully reverted** (`hasLab:false`, labTasks 0, labSubs 0).

### §4.4 Results and Analytics — 5 smart filters — DONE
- `RESULT_FILTERS` — **Program, Semester, Course, Session, Batch** for
  `variant="results"`, with enriched columns (program / semester / session / batch).
- Real time via the existing SSE `result` event (`api.focal.eventsUrl()`).
- **Verified**: 8 result rows, each with full program / semester / session / batch
  metadata and correct `students` / `published` / `passRate`.

> The four untouched AssessmentMonitor variants (`assignments`, `quizzes`, `midterm`,
> `finalterm`) receive `filterDefs = null`, so their render path is byte-for-byte the
> original — per the strict scope rule.

## New / changed API endpoints

| Method | Path | Requirement |
|---|---|---|
| GET  | `/api/auth/captcha` | §1.1 |
| GET  | `/api/admin/dept-application-counts` | §2.1 |
| GET  | `/api/fee-management/payments/pending` (enriched) | §2.2 |
| GET  | `/api/fee-management/payments/:paymentId/history` (new) | §2.2 |
| POST | `/api/lms/academic/coordinator/distribution/batch` (new) | §3.2 |
| POST | `/api/lms/academic/coordinator/instructor-loans` (course now mandatory) | §3.3 |
| GET  | `/api/lms/academic/focal/student-search` (new) | §4.2 |
| GET  | `/api/lms/academic/focal/assessment-monitor` (enriched + `labStudents`) | §4.3 / §4.4 |

## Verification summary

- **Builds**: `frontend` `vite build` ✅ · `lms-frontend` `vite build` ✅
- **Backend syntax**: `focal.js`, `feeManagement.js`, `coordinator.js`,
  `coordinatorPlus.js`, `auth.js`, `admin.js`, `education.js` — all load cleanly ✅
- **Services (PM2)**: `aust-backend` :5000, `admissions-frontend` :3000,
  `lms-frontend` :5174 — all `online`, health **200 / 200 / 200** ✅
- **Route registration**: all 6 new/changed protected endpoints return **401**
  unauthenticated (not 404) ✅
- **Authenticated integration tests**: captcha reject + accept, dept badge counts,
  fee pending + fee history, student-search, assessment-monitor
  (lab-only + per-student detail + results filters) — all pass ✅
- **Database**: all temporary verification fixtures **reverted** —
  `feePayment: 0`, `application: 0`, `labTask: 0`, `labTaskSubmission: 0`,
  `CS-101.hasLab: false` ✅

## Real-time mechanisms used

- **Admissions**: `window.dispatchEvent(new Event('aust:refresh'))` + listeners,
  adaptive interval polling (8 s / 3 s fast window), `visibilitychange`, `focus`,
  `online`; plus the dedicated `educationWatcher` fingerprint poller for §1.2.
- **LMS**: Server-Sent Events via `new EventSource(api.focal.eventsUrl())` with named
  events (`labtask-monitor`, `labtask`, `assignment`, `result`, `instructor-loan`),
  emitted server-side through `realtime.emitAll(...)`.

**Last updated**: 2026-08-28

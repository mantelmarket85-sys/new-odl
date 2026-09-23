# AUST ODL — Learning Management System

## Project Overview
- **Name**: Abbottabad University of Science & Technology — Open and Distance Learning (AUST ODL) LMS
- **Goal**: A frontend-only, mock-data-driven LMS demonstrating a complete multi-role university experience (Student, Teacher, Course Coordinator, Focal Person, Exam Controller, Director QEC, Provost) — without any backend or database.
- **Primary Student Personas**: `FAHAD KHALID` (ADCS-23-102) and `HAMZA YOUSAF` (ADCS-23-103) — featured throughout the LMS data.

## Live URL
- **Sandbox Preview**: https://3000-iqrkq7v7zr4ipes2mszdq-ad490db5.sandbox.novita.ai

## Tech Stack
- React 19 + Vite 8 + React Router 7
- Tailwind CSS 3.4 (custom utility layer + CSS variables for dark/light theming)
- Framer Motion (page transitions, micro-animations)
- Lucide React (icons)
- Recharts (charts)
- PM2 + Vite preview (production serving in sandbox)

---

## Latest Upgrades (May 2026 build)

### ✅ Update #1 — Professional Dark/Light Visibility System
- ✅ Added **Theme Fix Pack v4 — Final Polish** layer in `src/index.css` covering remaining edge cases without touching layout or branding
- ✅ Comprehensive WCAG-AA compliant contrast in BOTH themes for: tabs (active/inactive), `kbd`/`code`/`pre`, toggle switches, tooltips, alert banners (blue/emerald/amber/rose/violet/indigo/purple/cyan/pink/teal/orange), sidebar/topbar icons & subtitles, empty-state placeholders, avatar initials, table hover rows, pagination buttons, icon-only action buttons, date pickers, scrollbars inside cards, focus rings (2px outline), heading colors, form labels, toast surfaces, slate-700/800 text, border tones, range/checkbox/radio accent colors
- ✅ Smooth 0.25s theme-toggle transition on key surfaces (cards, inputs, nav, headers)
- ✅ Existing branding, sidebar, navigation, routing, workflow, dashboard structure — all UNCHANGED

### ✅ Update #2 — Course Coordinator Student Allocation (Complete Redesign)
File: `src/pages/admin/StudentAllocation.jsx` (route: `/admin/student-allocation`)
- ✅ **Modern card/table hybrid UI** inspired by Canvas LMS, Google Classroom, Moodle, Blackboard
- ✅ **Auto-organized Sections (A, B, C…)** rendered as colorful gradient-headed cards in a responsive 2-column grid
- ✅ **Native HTML5 Drag & Drop** to move students between sections — with drop-target ring highlight, scale/opacity animation on the dragged chip
- ✅ **Bulk multi-select** with picker checkboxes + sticky blue gradient bulk-move bar with destination dropdown
- ✅ **Quick-move arrow** popover on every student card to jump to any other section without dragging
- ✅ **Section management menu** (⋮) — Rename, Change Color, Capacity ±5, Delete (with empty-check guard)
- ✅ **Per-section stats** — Capacity fill % bar (animated), Avg GPA, Male/Female count, capacity chip
- ✅ **Unassigned Pool** sticky sidebar with auto-distribute (GPA round-robin) button
- ✅ **Rebalance** action — redistributes all allocated students evenly by GPA across sections
- ✅ **Filter toolbar** — Search (name/roll/program), Program dropdown (5 programs), GPA pill filter (All / ≥3.70 / 3.00–3.69 / <3.00)
- ✅ **KPI strip** — Total Students, Allocated, Unassigned Pool, Section Fill Avg
- ✅ **Student details modal** with avatar gradient header, program/semester/GPA/section info, distinction badge
- ✅ **CSV Export** of full allocation snapshot
- ✅ **Section accent stripe** (gradient bar at top), 6-color palette (blue/emerald/violet/amber/rose/cyan)
- ✅ Fully responsive (mobile / tablet / desktop), framer-motion animations throughout, dark/light themed
- ✅ All other admin modules, routes, sidebar, navigation — UNCHANGED

## Completed Upgrades (previous builds)

### 🎨 Branding & Theming
- ✅ Official AUST PNG logo used in Sidebar/Topbar/Login (`public/aust-logo.png` + `src/assets/`)
- ✅ Global Dark/Light Mode CSS contrast fix — semantic tokens (`--bg-app`, `--bg-card`, `--text-primary`, `--text-muted`, `--border`) with custom utility classes (`card-base`, `card-premium`, `input-base`, `btn-primary`, `text-app`, `text-muted-app`, `border-app`)

### 🔐 Cross-Role Global Settings (`AppSettingsContext`)
- ✅ QEC global flags persisted to `localStorage`: `surveysEnabled`, `feedbackReleased`, `resultsDeclared`
- ✅ Per-user survey completion tracking (students + teachers)
- ✅ Derived helpers: `canStudentTakeExam(name)`, `canTeacherUploadFinalResults(name)`, `canTeacherViewFeedback()`

### 👨‍🎓 Student Module
- ✅ **Student Surveys** (`/student/surveys`) — QEC-gated; visibility tied to `surveysEnabled` flag
- ✅ **Course Library** — rating displays removed; cleaner cards
- ✅ **Mid Term Exam** (`/student/midterm`) — gated by `canStudentTakeExam("FAHAD KHALID")`; locked screen with redirect to surveys
- ✅ **Final Term Exam** (`/student/finalterm`) — same gating; locked screen with QEC policy notice

### 👩‍🏫 Teacher Module
- ✅ **Recorded Lectures** — organized Semester → Subject → Week
- ✅ **Upload Marks** (`/teacher/marksupload`) — Quiz/Assign./Midterm always editable; **Final /50 column locked** until `canTeacherUploadFinalResults` returns true; lock icon + warning banner
- ✅ **Final Term Management** (`/teacher/finalterm`) — full lock screen until teacher survey completed

### 🧑‍💼 Course Coordinator Module
- ✅ **Sections** — minimal columns (Section Name / Semester / Batch / Total Students only)
- ✅ **Student Allocation** — semester-wise grouping, multi-select checkboxes, bulk move bar with destination dropdown, GPA round-robin auto-allocation, FAHAD/HAMZA pre-seeded across semesters 1-5
- ✅ **Quick Messages** — custom message composer with audience selector (students-all / students-section / teachers-all / teacher-direct), 6-teacher dropdown, multi-channel checkboxes (email/in-app/SMS)
- ✅ **Students** — replaced cards with professional table (Name + avatar, Roll No, Semester badge, Section badge, Batch, Program, color-coded CGPA, Status, Actions), 6 filters, pagination with ellipsis, CSV export
- ✅ **Course / Teacher Distribution** — added Semester + Batch dropdowns to form, removed Status field from form

### 🛡️ QEC (Director QEC) Module
- ✅ **Surveys** dashboard — three live toggle cards: Surveys Module enable/disable, Results Declared, Feedback Visibility (cascading)
- ✅ Cascading effect notice banner explaining downstream gating

### 🏛️ Provost Module
- ✅ **Activity Logs** — categorized with 14 categories (enrollment, result, attendance, teacher, student, finance, fee, exam, survey, qec, library, discipline, system, all), counter chip strip, search + user filter, CSV export
- ✅ **Fee Announcements** (semester) — added Program dropdown (BSCS / BSSE / BSIT / ADCS / ADIT / ADBA / ADMM) + Type field
- ✅ **Exam Fee Announcements** (`/provost/exam-fee-announcements`) — NEW module, fields: Title / Exam Type (Mid/Final/Re-Sit/Special) / Program / Batch / Semester / Amount / Deadline, type & status filters, search

### 📝 Exam Controller Module
- ✅ **Removed** Seating Plan + Invigilators routes (replaced with `Navigate` redirects to Schedule)
- ✅ **Online Exam Management** (`/exam/schedule`) — Program/Semester/Section/Type/Status filters, grouped by date, proctored ON/OFF indicator, create modal
- ✅ **Datesheets** — two separate sheets (Mid Term / Final Term) with 4-filter panel, per-sheet CSV download

### 📊 Focal Person Module
- ✅ **Reports & Analytics** — fully dynamic with **13 tabs** (enrollment, attendance, assignment, quiz, mid, final, overall, semester, course, section, program, performance, studentwise)
- ✅ 6 filters: Search / Instructor dropdown (6 teachers) / Semester / Section / Program / Status
- ✅ KPI strip (total / avg score / pass rate) computed from filtered set
- ✅ Charts: Avg Score by Instructor (BarChart) + Status Distribution (PieChart) + tab-specific Area/Bar charts
- ✅ Mock data arrays (`assignmentsData`, `quizzesData`, `midTermData`, `finalTermData`) all seeded with FAHAD KHALID and HAMZA YOUSAF
- ✅ Detail modal + CSV export

---

## Functional Entry URIs (Routes)

### Student
- `/student/dashboard` — main dashboard
- `/student/courses`, `/student/library`, `/student/live-classes`, `/student/recorded`
- `/student/assignments`, `/student/quizzes`, `/student/midterm` (🔒 gated), `/student/finalterm` (🔒 gated)
- `/student/surveys` — QEC surveys (visible when `surveysEnabled=true`)
- `/student/attendance`, `/student/results`, `/student/calendar`, `/student/messages`, `/student/appeals`
- `/student/account-book`, `/student/study-scheme`, `/student/badges`, `/student/cgpa-calculator`

### Teacher
- `/teacher/dashboard`, `/teacher/subjects`, `/teacher/students`
- `/teacher/lectures` — Semester → Subject → Week organization
- `/teacher/assignments`, `/teacher/quizzes`, `/teacher/midterm`, `/teacher/finalterm` (🔒 gated)
- `/teacher/marksupload` (🔒 final column gated), `/teacher/attendance`, `/teacher/live-classes`
- `/teacher/library`, `/teacher/messages`, `/teacher/announcements`, `/teacher/appeals`
- `/teacher/course-history`, `/teacher/settings`

### Admin / Course Coordinator
- `/admin/dashboard`, `/admin/students`, `/admin/teachers`
- `/admin/sections`, `/admin/student-allocation`, `/admin/teacher-assignment`
- `/admin/messages` — Quick Messages with custom typing + teacher DM
- `/admin/announcements`, `/admin/fees`, `/admin/reports`

### Focal Person
- `/focal/dashboard`, `/focal/reports` — fully dynamic Reports & Analytics

### Exam Controller
- `/exam/dashboard`, `/exam/schedule` — Online Exam Management
- `/exam/datesheets`, `/exam/results`, `/exam/grade-sheets`, `/exam/transcripts`
- `/exam/seating` & `/exam/invigilators` → redirected to `/exam/schedule`

### QEC (Director QEC)
- `/qec/dashboard`, `/qec/surveys` — Global Controls + cascading toggles
- `/qec/audit`, `/qec/reports`, `/qec/policies`, `/qec/accreditation`

### Provost
- `/provost/dashboard`, `/provost/activity-logs`
- `/provost/fee-announcements`, `/provost/exam-fee-announcements` ← NEW
- `/provost/fee-approvals`, `/provost/enrollment-requests`, `/provost/policies`

---

## Data Architecture

### Mock Data Files
- `src/data/mockData.js` (~66 KB) — student roster, profile, study scheme, assignments, quizzes, attendance, results, announcements, fees, messages, smart notifications
- `src/data/enterpriseData.js` (~33 KB) — provost activity logs, enrollment requests, attendance analytics, results monitor, system metrics
- `src/data/lmsUpgradeData.js` (~54 KB) — student surveys, semester-wise recorded lectures, provost fee announcements, **exam fee announcements**, **online exam schedules**, featured student names

### Data Flow
- All data is in-memory JS arrays (no fetch / no DB)
- `AppSettingsContext` provides cross-role global state via `localStorage`
- `ToastContext` provides global toast notifications
- React Router 7 handles all role-based navigation

### Featured Students
- **FAHAD KHALID** — `ADCS-23-102`, used across attendance, assignments, quizzes, sections, results, messages, surveys, fee approvals, activity logs, focal reports
- **HAMZA YOUSAF** — `ADCS-23-103`, same coverage as above

---

## User Guide

### Try the QEC Gating Flow
1. Log in as **Director QEC** → go to `/qec/surveys` → toggle "Surveys Module" OFF
2. Log in as **Student** → `/student/midterm` and `/student/finalterm` will become **available** (gating bypassed)
3. Toggle "Surveys Module" back ON in QEC → Student exam pages show **Locked screen with redirect to surveys**
4. As Student, complete the surveys at `/student/surveys` → exam pages unlock
5. Same flow works for **Teacher Final Term Upload** at `/teacher/marksupload` (Final column locks) and `/teacher/finalterm`

### Try the Course Coordinator Workflow
1. Log in as **Course Coordinator** → `/admin/student-allocation`
2. Select multiple students via checkbox → choose destination section from dropdown → click "Move Student"
3. Try `/admin/messages` → "Compose Custom" → switch audience to "Teacher Direct" → pick a teacher from the dropdown

### Try Focal Person Analytics
1. Log in as **Focal Person** → `/focal/reports`
2. Switch between 13 report tabs
3. Filter by Instructor / Semester / Section / Program / Status
4. Watch the "Avg Score by Instructor" BarChart and "Status Distribution" PieChart update live

---

## Deployment

### Local Development
```bash
cd /home/user/webapp
npm install
npm run dev          # Vite dev server on :5173
# OR for production preview:
npm run build
pm2 start ecosystem.config.cjs   # Vite preview on :3000
```

### PM2 Status
```bash
pm2 list
pm2 logs webapp --nostream
pm2 restart webapp
```

### Build Output
- `dist/index.html` — 0.73 KB (0.46 KB gzip)
- `dist/assets/index-*.css` — 158 KB (25 KB gzip)
- `dist/assets/index-*.js` — 2.53 MB (599 KB gzip)
- `dist/assets/aust-logo-*.png` — 41 KB

### Deployment Status
- ✅ **Active** in sandbox at port 3000
- ✅ Build: **success** (4.93s, 2694 modules)
- ✅ Smoke test: HTTP 200
- **Platform**: Vite preview via PM2 (development sandbox); frontend-only — deployable to any static host (Cloudflare Pages, Vercel, Netlify)

### Last Updated
- **Date**: 2026-05-22
- **Build duration**: ~6s
- **Total modules transformed**: 2,694
- **CSS bundle**: 174 KB (27.5 KB gzip) — includes Theme Fix Pack v4
- **JS bundle**: 2.55 MB (603 KB gzip) — includes redesigned StudentAllocation

---

## Features Not Yet Implemented (Out of Scope)
- Real backend / database integration (project is frontend-mock-only by design)
- Real-time messaging with WebSockets
- Live BBB / Jitsi video conferencing (links are mocked)
- Email/SMS dispatch (Quick Messages UI is illustrative)
- Authentication / session management beyond role-based mock login

## Recommended Next Steps for Development
1. Add real authentication (NextAuth / Clerk / Auth0)
2. Wire a backend (Cloudflare D1 / Supabase / PlanetScale) behind the mock layer
3. Add unit tests with Vitest + React Testing Library
4. Code-split large bundle (currently 2.5 MB) using `React.lazy` for role-based routes
5. Add an admin UI to manage the QEC global flags from the Provost side too
6. Internationalization (i18n) for Urdu/English language switching

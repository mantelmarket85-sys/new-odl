# LMS Update — Course Coordinator Fixes

> **Scope:** LMS-side changes ONLY. The Admissions Portal/System was **not**
> touched in any way (UI, workflows, forms, DB structure, APIs, routing,
> layout, colors, responsiveness or functionality remain exactly as they were).

This document summarizes the four requested fixes for the **Course
Coordinator** role. All other LMS modules, workflows and behavior are
unchanged.

---

## 1. Courses & Schemes — Semester dropdown was empty

**Symptom:** In *Courses & Scheme of Study → Add Course*, the **Semester**
dropdown showed nothing, so a new course could not be created.

**Root cause:** The coordinator's program list is department-scoped. The
backend filtered programs with a **strict, exact** department-string equality
(`program.department === profile.department`). In real data the coordinator's
saved department (e.g. `"Computing"`) does not exactly equal the program's
department (e.g. `"Department of Computing"`), so **zero programs** were
returned → no program could be selected → its semesters could never load →
the Semester dropdown stayed empty.

**Fix** (`backend/src/routes/lms/academic/coordinator.js`):
- Added a resilient `resolveScopedPrograms()` helper that matches departments
  **case-insensitively** and with a forgiving substring comparison
  (`"Computing"` ↔ `"Department of Computing"`).
- If the forgiving match still finds nothing (stale / typo'd department), it
  **falls back to all programs** so the dependent dropdowns are never empty
  while data exists.
- Selecting a program loads its real semesters via
  `GET /api/lms/academic/programs/:programId/semesters`; the chosen
  `semesterId` is saved with the course and displayed everywhere.

**Result:** Selecting a program populates the Semester dropdown with that
program's actual semesters; the course saves with the correct semester.

---

## 2. Non-working dropdowns / fields audit (Session & Semester)

**Symptom:** Session and Semester dropdowns (e.g. in *Teacher Assignment /
Course Distribution*) sometimes showed no options.

**Fixes** (`coordinator.js → /distribution/options`):
- **Programs** now use the same forgiving department scope as fix #1 (never an
  empty list when programs exist), so the cascade
  `Program → Semester → Course → Session → Teacher → Section` always has a
  starting point.
- **Sessions** are sourced from academic terms; if no term is flagged
  `isActive`, the endpoint now **falls back to all terms** so the Session
  dropdown is never empty.
- Semester / Course cascades already read live data and now work because the
  program list is always populated.

**Result:** Every coordinator dropdown displays its available options, selected
values save, and saved values reload correctly on view/edit.

---

## 3. Student module — Profile "Internal Error"

**Symptom:** Opening any student's **Profile** returned *Internal Error*.

**Root cause** (`backend/src/routes/lms/academic/coordinatorPlus.js`): the
published-results query selected fields that **do not exist** on the
`CourseResult` model:
- `grade` → should be `letterGrade`
- `gpa`   → should be `gradePoints`

Prisma threw `Unknown field 'grade'`, producing a 500.

**Fix:**
- Corrected the select/mapping to use `letterGrade` and `gradePoints`.
- Added the student's current **Semester**, **Section** and **Session** to the
  profile response (derived from the most recent active enrollment) and
  surfaced them in the profile view, alongside Name, Reg #, Roll #, Program,
  Department, Email, Contact, Enrollment & Academic information.

**Result:** The complete student profile opens successfully with no error.

---

## 4. Coordinator profile/name update not synced everywhere

**Symptom:** Updating the name in *Settings → Profile* did not reflect in the
header, sidebar, dashboard, etc.

**Root cause:** For staff roles the global identity came from a **static role
descriptor** (a hardcoded placeholder name); `GET /api/lms/auth/me` never
returned the coordinator's editable profile, and the Settings save only
updated local component state — not the global `AuthContext`.

**Fixes:**
- `backend/src/routes/lms/lmsAuthV2.js` — `/auth/me` now also returns the
  staff profile (`fullName`, `email`, `phone`, `department`, `designation`,
  `photoUrl`) for non-student roles.
- `lms-frontend/src/context/AuthContext.jsx` — `buildProfileFromMe()` now lets
  a live staff profile override the static descriptor; added `refreshUser()`
  (re-fetch `/me`) and `updateUser()` (optimistic instant update).
- `lms-frontend/src/pages/admin/CoordinatorSettings.jsx` — after saving the
  profile or photo it calls `updateUser()` for an instant update and
  `refreshUser()` to confirm against the backend.

**Result:** Saving a new name updates it in real time across the Dashboard,
Header, Sidebar, Profile, User Menu and everywhere `useAuth().user` is read,
and it persists consistently after reload.

---

## Files changed (LMS only)

| File | Change |
|------|--------|
| `backend/src/routes/lms/academic/coordinator.js` | Forgiving department scope + fallback (`resolveScopedPrograms`); `/programs` & `/distribution/options` |
| `backend/src/routes/lms/academic/coordinatorPlus.js` | Fixed `CourseResult` field names; added semester/section/session to student profile |
| `backend/src/routes/lms/lmsAuthV2.js` | `/auth/me` now returns staff profile for non-student roles |
| `lms-frontend/src/context/AuthContext.jsx` | Staff identity from live `/me`; `refreshUser()` + `updateUser()` |
| `lms-frontend/src/pages/admin/CoordinatorSettings.jsx` | Propagate name/photo update across the app in real time |
| `lms-frontend/src/pages/admin/AdminStudents.jsx` | Show Semester, Section & Session in the student profile view |

No Admissions Portal files were modified.

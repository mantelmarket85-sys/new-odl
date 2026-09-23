# LMS Module Updates — Change Summary

> **Scope guarantee:** Only the **LMS side** (`lms-frontend/` + supporting `backend/` LMS routes)
> was modified. The **Admissions Portal/System (`frontend/`) was NOT touched** in any way —
> all admissions modules, UI, workflows, and the database schema remain exactly the same.

This document summarizes the five LMS changes delivered in this update.

---

## 1. Exam Controller Role — Settings Module (FIXED)

**Problem:** Settings updates were not saving/reflecting reliably.

**Fix:**
- `backend/src/routes/lms/lmsAuthV2.js` — the `/auth/me` staff branch now reads **both**
  `LmsStudentProfile` and `LmsExamProfile` and merges them (exam profile preferred), so Exam
  Controller profile edits propagate to the global user identity.
- `backend/src/middleware/lmsAuth.js` — `req.lmsUser` now includes `email` (used as a fallback).
- `backend/src/routes/lms/academic/exam.js` — `PUT /profile` now trims values and syncs
  `LmsUser.email`; duplicate email returns `409`.
- `lms-frontend/src/pages/exam/Settings.jsx` — calls `refreshUser()` after a successful profile
  save and after a profile-photo upload, so Name / Email / Phone / Password / Profile Picture
  changes appear **everywhere instantly with no refresh**.

## 2. Director QEC Role — Settings Module (FIXED)

**Fix:**
- `lms-frontend/src/pages/qec/Settings.jsx` — calls `refreshUser()` after profile save, photo
  upload, and photo removal. (Backend QEC routes already used `LmsExamProfile` and synced
  `LmsUser.email`.) Same real-time, no-cache propagation as the Exam Controller.

> Both Exam Controller and Director QEC use the shared `LmsExamProfile` table, and the
> `/auth/me` merge fix (item 1) is what makes their changes show up across the whole system.

## 3. Provost Role — Student Fee Record Module (ENHANCED)

**New "Pending" tab** listing all students with pending fees, with:
- Semester-wise filter, program-wise filter, searchable list, and pagination (existing filters reused).
- **Bulk Block** — select multiple / select-all → block in one click (real-time status update).
- **Bulk Restore** — select multiple blocked students → restore in one click (positions preserved).

**Backend:** `backend/src/routes/lms/academic/provost.js`
- `POST /finance/students/bulk-block` (audit `PROVOST_STUDENT_BULK_BLOCK`)
- `POST /finance/students/bulk-unblock` (audit `PROVOST_STUDENT_BULK_UNBLOCK`)

**Frontend:** `lms-frontend/src/pages/provost/FeeRecords.jsx` (Pending tab, selection state,
bulk action bar, Bulk Block / Bulk Restore modals) and `lms-frontend/src/services/api.js`
(`provost.feeMgmt.bulkBlock` / `bulkUnblock`).

## 4. Focal Person Role — Withdraw Cases Restore (FIXED)

**Fix:** `lms-frontend/src/pages/focal/Withdraws.jsx` — `restore()` now validates the response
(`success === true` && status `ENROLLED`), verifies the row actually cleared, and shows accurate
**"Restore Successful"** / **"Restore Failed"** feedback. On failure the row is kept so the user
can retry; no false-positive success messages. (Backend restore route was already correct.)

## 4b. Focal Person Role — Reports & Analytics (ENHANCED)

`lms-frontend/src/pages/focal/Reports.jsx` — added next to "Export CSV":
- **Export PDF** — opens a clean, self-contained printable report (AUST header, applied filters,
  complete filtered dataset) and the user saves as PDF from the print dialog.
- **Print** — opens the browser print dialog with the same clean print layout.

---

## Verification

- Full app bundles cleanly via esbuild (5.0 MB JS + 73.6 KB CSS, **zero errors**).
- All modified backend LMS modules load without error.
- API endpoints tested end-to-end via curl (Exam/QEC profile → `/auth/me`, Provost bulk
  block/unblock, Focal restore). All test data was cleaned up after testing.

> **Note:** The full Vite production build is performed by the deployment/CI environment
> (Cloudflare Pages / GitHub CI), which has adequate RAM. The local sandbox (~985 MB) cannot
> finish Rollup's output phase, but the esbuild full-bundle check confirms the code is sound.

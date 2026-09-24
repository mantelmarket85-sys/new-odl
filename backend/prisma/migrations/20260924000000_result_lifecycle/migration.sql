-- Additive LMS result-lifecycle fields. Safe on existing production data.

-- LmsUser Gradebook PIN
ALTER TABLE "LmsUser" ADD COLUMN "gradebookPinHash" TEXT;
ALTER TABLE "LmsUser" ADD COLUMN "gradebookPinSetAt" DATETIME;

-- Student admission batch vs current session
ALTER TABLE "LmsStudentProfile" ADD COLUMN "admissionBatch" TEXT;
ALTER TABLE "LmsStudentProfile" ADD COLUMN "currentSemester" INTEGER;
ALTER TABLE "LmsStudentProfile" ADD COLUMN "currentSession" TEXT;

-- CourseResult lifecycle
ALTER TABLE "CourseResult" ADD COLUMN "projectMarks" REAL NOT NULL DEFAULT 0;
ALTER TABLE "CourseResult" ADD COLUMN "projectMax" REAL NOT NULL DEFAULT 100;
ALTER TABLE "CourseResult" ADD COLUMN "academicStatus" TEXT;
ALTER TABLE "CourseResult" ADD COLUMN "submittedAt" DATETIME;
ALTER TABLE "CourseResult" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "CourseResult" ADD COLUMN "lockedAt" DATETIME;
ALTER TABLE "CourseResult" ADD COLUMN "compiledAt" DATETIME;
ALTER TABLE "CourseResult" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Per-student semester compilation record
CREATE TABLE IF NOT EXISTS "SemesterResult" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "studentId" TEXT NOT NULL,
  "programId" INTEGER,
  "programShortForm" TEXT,
  "department" TEXT,
  "admissionBatch" TEXT,
  "semesterNumber" INTEGER NOT NULL,
  "termId" INTEGER,
  "sessionLabel" TEXT,
  "gpa" REAL NOT NULL DEFAULT 0,
  "cgpa" REAL NOT NULL DEFAULT 0,
  "totalCredits" REAL NOT NULL DEFAULT 0,
  "earnedCredits" REAL NOT NULL DEFAULT 0,
  "academicStanding" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPILED',
  "compiledAt" DATETIME,
  "unofficialDeclaredAt" DATETIME,
  "unofficialDeclaredById" TEXT,
  "officialFinalizedAt" DATETIME,
  "officialDeclaredAt" DATETIME,
  "officialDeclaredById" TEXT,
  "archivedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "SemesterResult_studentId_semesterNumber_programShortForm_key"
  ON "SemesterResult"("studentId", "semesterNumber", "programShortForm");
CREATE INDEX IF NOT EXISTS "SemesterResult_studentId_idx" ON "SemesterResult"("studentId");
CREATE INDEX IF NOT EXISTS "SemesterResult_status_idx" ON "SemesterResult"("status");
CREATE INDEX IF NOT EXISTS "SemesterResult_department_programShortForm_semesterNumber_idx"
  ON "SemesterResult"("department", "programShortForm", "semesterNumber");

CREATE TABLE IF NOT EXISTS "GradebookPinAttempt" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" TEXT NOT NULL,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" DATETIME,
  "lastAttemptAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "GradebookPinAttempt_userId_key" ON "GradebookPinAttempt"("userId");

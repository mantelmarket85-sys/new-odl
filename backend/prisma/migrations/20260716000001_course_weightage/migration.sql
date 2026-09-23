-- Course Coordinator: Weightage module. One row per course capturing
-- assessment weightage config (mid/final/quiz/assignment/lab), configurable
-- counts, and per-item weightage JSON arrays. Additive — no existing table
-- is modified. labTask* only meaningful when LmsCourse.hasLab is true.
CREATE TABLE "CourseWeightage" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "courseId" INTEGER NOT NULL UNIQUE,
  "midWeight" REAL NOT NULL DEFAULT 25,
  "finalWeight" REAL NOT NULL DEFAULT 40,
  "quizWeight" REAL NOT NULL DEFAULT 15,
  "assignmentWeight" REAL NOT NULL DEFAULT 20,
  "labTaskWeight" REAL NOT NULL DEFAULT 0,
  "quizCount" INTEGER NOT NULL DEFAULT 0,
  "assignmentCount" INTEGER NOT NULL DEFAULT 0,
  "labTaskCount" INTEGER NOT NULL DEFAULT 0,
  "quizItems" TEXT,
  "assignmentItems" TEXT,
  "labTaskItems" TEXT,
  "updatedById" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CourseWeightage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "LmsCourse" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CourseWeightage_courseId_idx" ON "CourseWeightage"("courseId");

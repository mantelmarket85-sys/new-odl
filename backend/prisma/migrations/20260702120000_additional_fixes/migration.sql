-- Additional Fixes & Enhancements migration
-- §3 Per-program merit criteria
ALTER TABLE "Program" ADD COLUMN "matricWeight" REAL NOT NULL DEFAULT 30;
ALTER TABLE "Program" ADD COLUMN "fscWeight" REAL NOT NULL DEFAULT 40;
ALTER TABLE "Program" ADD COLUMN "interviewWeight" REAL NOT NULL DEFAULT 30;

-- §6 Initial Merit List publishing gate (on AdmissionCycle)
ALTER TABLE "AdmissionCycle" ADD COLUMN "initialMeritPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdmissionCycle" ADD COLUMN "initialMeritPublishedAt" DATETIME;

-- §10 Track automatic first-semester course enrollment
ALTER TABLE "Enrollment" ADD COLUMN "lmsCoursesEnrolled" BOOLEAN NOT NULL DEFAULT false;

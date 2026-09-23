-- Master Prompt: Admissions Portal Enhancements (additive, non-breaking)

-- Program: per-program registration/roll number config
ALTER TABLE "Program" ADD COLUMN "instituteCode" TEXT NOT NULL DEFAULT '001';
ALTER TABLE "Program" ADD COLUMN "facultyCode" TEXT NOT NULL DEFAULT 'C';
ALTER TABLE "Program" ADD COLUMN "deptCode" TEXT NOT NULL DEFAULT '01';
ALTER TABLE "Program" ADD COLUMN "regNextSerial" INTEGER NOT NULL DEFAULT 101;
ALTER TABLE "Program" ADD COLUMN "regConfigured" BOOLEAN NOT NULL DEFAULT false;

-- Department: additional staff roles
ALTER TABLE "Department" ADD COLUMN "courseCoordinatorId" INTEGER;
ALTER TABLE "Department" ADD COLUMN "focalPersonId" INTEGER;

-- Application: interview eligibility (Initial Merit List)
ALTER TABLE "Application" ADD COLUMN "interviewEligibility" TEXT NOT NULL DEFAULT 'PENDING';

-- Enrollment: publishing gate
ALTER TABLE "Enrollment" ADD COLUMN "credentialsPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Enrollment" ADD COLUMN "credentialsPublishedAt" DATETIME;

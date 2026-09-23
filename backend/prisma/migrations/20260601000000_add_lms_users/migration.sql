-- ============================================================
-- Migration: add_lms_users
-- ------------------------------------------------------------
-- Adds the LmsUser + LmsStudentProfile models for the new
-- LmsUser-based LMS authentication system, and extends the
-- existing Enrollment model with LMS account-linkage fields.
--
-- NOTE: This project's working database is SQLite, applied via
-- `prisma db push`. This SQL file documents the schema change in
-- migration form so the change is portable when the database is
-- promoted to PostgreSQL (`npx prisma migrate dev`).
-- ============================================================

-- CreateTable
CREATE TABLE "LmsUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "linkedRollNumber" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LmsStudentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lmsUserId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "fatherName" TEXT NOT NULL,
    "cnic" TEXT NOT NULL,
    "dateOfBirth" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "religion" TEXT,
    "nationality" TEXT,
    "domicile" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "program" TEXT NOT NULL,
    "programShortForm" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "rollNumber" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "enrollmentDate" DATETIME NOT NULL,
    "photoUrl" TEXT,
    "cnicDocUrl" TEXT,
    "matricCertUrl" TEXT,
    "intermediateCertUrl" TEXT,
    "migrationCertUrl" TEXT,
    "domicileCertUrl" TEXT,
    "otherDocsJson" TEXT,
    "missingDocs" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LmsStudentProfile_lmsUserId_fkey" FOREIGN KEY ("lmsUserId") REFERENCES "LmsUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (Enrollment): add LMS account-linkage columns
ALTER TABLE "Enrollment" ADD COLUMN "lmsPasswordChanged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Enrollment" ADD COLUMN "lmsAccountCreated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Enrollment" ADD COLUMN "lmsUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LmsUser_username_key" ON "LmsUser"("username");
CREATE UNIQUE INDEX "LmsStudentProfile_lmsUserId_key" ON "LmsStudentProfile"("lmsUserId");
CREATE UNIQUE INDEX "Enrollment_lmsUserId_key" ON "Enrollment"("lmsUserId");

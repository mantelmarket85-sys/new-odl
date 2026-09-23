-- Phase 2 performance: add indexes on hot admissions tables.
-- Uses IF NOT EXISTS so it is safe to re-apply on databases where the
-- indexes were already created via `prisma db push`.

-- Application
CREATE INDEX IF NOT EXISTS "Application_status_idx" ON "Application"("status");
CREATE INDEX IF NOT EXISTS "Application_userId_idx" ON "Application"("userId");
CREATE INDEX IF NOT EXISTS "Application_programId_idx" ON "Application"("programId");
CREATE INDEX IF NOT EXISTS "Application_admissionCycleId_idx" ON "Application"("admissionCycleId");
CREATE INDEX IF NOT EXISTS "Application_programId_status_idx" ON "Application"("programId", "status");
CREATE INDEX IF NOT EXISTS "Application_admissionCycleId_status_idx" ON "Application"("admissionCycleId", "status");
CREATE INDEX IF NOT EXISTS "Application_submittedAt_idx" ON "Application"("submittedAt");

-- StatusEvent
CREATE INDEX IF NOT EXISTS "StatusEvent_applicationId_idx" ON "StatusEvent"("applicationId");
CREATE INDEX IF NOT EXISTS "StatusEvent_userId_idx" ON "StatusEvent"("userId");
CREATE INDEX IF NOT EXISTS "StatusEvent_createdAt_idx" ON "StatusEvent"("createdAt");

-- MeritEntry
CREATE INDEX IF NOT EXISTS "MeritEntry_userId_idx" ON "MeritEntry"("userId");
CREATE INDEX IF NOT EXISTS "MeritEntry_totalMerit_idx" ON "MeritEntry"("totalMerit");
CREATE INDEX IF NOT EXISTS "MeritEntry_isFinalized_idx" ON "MeritEntry"("isFinalized");

-- Profile
CREATE INDEX IF NOT EXISTS "Profile_cnic_idx" ON "Profile"("cnic");

-- Education
CREATE INDEX IF NOT EXISTS "Education_userId_idx" ON "Education"("userId");
CREATE INDEX IF NOT EXISTS "EducationDocument_educationId_idx" ON "EducationDocument"("educationId");

-- Document
CREATE INDEX IF NOT EXISTS "Document_userId_idx" ON "Document"("userId");
CREATE INDEX IF NOT EXISTS "Document_type_idx" ON "Document"("type");

-- Interview
CREATE INDEX IF NOT EXISTS "Interview_userId_idx" ON "Interview"("userId");
CREATE INDEX IF NOT EXISTS "Interview_decision_idx" ON "Interview"("decision");

-- FeePayment
CREATE INDEX IF NOT EXISTS "FeePayment_userId_idx" ON "FeePayment"("userId");
CREATE INDEX IF NOT EXISTS "FeePayment_status_idx" ON "FeePayment"("status");

-- Enrollment (non-unique status index)
CREATE INDEX IF NOT EXISTS "Enrollment_status_idx" ON "Enrollment"("status");

-- Transaction
CREATE INDEX IF NOT EXISTS "Transaction_userId_idx" ON "Transaction"("userId");
CREATE INDEX IF NOT EXISTS "Transaction_applicationId_idx" ON "Transaction"("applicationId");
CREATE INDEX IF NOT EXISTS "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX IF NOT EXISTS "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- Appeal
CREATE INDEX IF NOT EXISTS "Appeal_userId_idx" ON "Appeal"("userId");
CREATE INDEX IF NOT EXISTS "Appeal_applicationId_idx" ON "Appeal"("applicationId");
CREATE INDEX IF NOT EXISTS "Appeal_status_idx" ON "Appeal"("status");

-- Notification
CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

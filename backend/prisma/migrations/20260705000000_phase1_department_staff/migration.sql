-- Phase 1 §2 — Multiple staff assignment per department.
-- Additive & non-breaking: introduces a many-to-many join table so a
-- department may hold MULTIPLE Admissions Coordinators, Course Coordinators
-- and Department Focal Persons. The legacy single-FK columns on Department
-- (coordinatorId / courseCoordinatorId / focalPersonId) are preserved as the
-- "primary" of each role for full back-compat.

CREATE TABLE IF NOT EXISTS "DepartmentStaff" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "departmentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "staffRole" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DepartmentStaff_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepartmentStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DepartmentStaff_departmentId_userId_staffRole_key" ON "DepartmentStaff"("departmentId", "userId", "staffRole");
CREATE INDEX IF NOT EXISTS "DepartmentStaff_departmentId_idx" ON "DepartmentStaff"("departmentId");
CREATE INDEX IF NOT EXISTS "DepartmentStaff_userId_idx" ON "DepartmentStaff"("userId");
CREATE INDEX IF NOT EXISTS "DepartmentStaff_staffRole_idx" ON "DepartmentStaff"("staffRole");

-- QEC department-wise survey scoping (additive, nullable — existing rows stay valid).
-- scope: UNIVERSITY (overall / all departments) | DEPARTMENT (one specific department)
-- department: target department name when scope = DEPARTMENT
ALTER TABLE "Survey" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'UNIVERSITY';
ALTER TABLE "Survey" ADD COLUMN "department" TEXT;

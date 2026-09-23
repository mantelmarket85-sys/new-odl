/*
 * Lab Management schema migration (Req 1/2/3) — additive, non-destructive.
 * ------------------------------------------------------------------
 * The dev.db was never baselined for `prisma migrate deploy` (P3005), so we
 * apply the additive DDL directly with guarded raw SQL, mirroring the pattern
 * used for the prior Course Coordinator changes. Everything here is:
 *   - a NEW nullable/defaulted column on CourseWeightage, or
 *   - a brand-new table (LabTask / LabTaskSubmission).
 * No existing column or table is modified or dropped. Safe to run repeatedly.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}
async function tableExists(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table,
  );
  return rows.length > 0;
}

async function main() {
  // 1) CourseWeightage.semesterProjectWeight (Float, default 0)
  if (!(await columnExists('CourseWeightage', 'semesterProjectWeight'))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "CourseWeightage" ADD COLUMN "semesterProjectWeight" REAL NOT NULL DEFAULT 0`,
    );
    console.log('✓ Added CourseWeightage.semesterProjectWeight');
  } else {
    console.log('• CourseWeightage.semesterProjectWeight already present');
  }

  // 2) LabTask table
  if (!(await tableExists('LabTask'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "LabTask" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "offeringId" INTEGER NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "totalMarks" REAL NOT NULL DEFAULT 100,
        "dueDate" TEXT NOT NULL,
        "sectionId" INTEGER,
        "allowLate" BOOLEAN NOT NULL DEFAULT true,
        "isPublished" BOOLEAN NOT NULL DEFAULT true,
        "filePath" TEXT,
        "fileName" TEXT,
        "isDeleted" BOOLEAN NOT NULL DEFAULT false,
        "deletedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "LabTask_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE INDEX "LabTask_offeringId_idx" ON "LabTask"("offeringId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "LabTask_sectionId_idx" ON "LabTask"("sectionId")`);
    console.log('✓ Created LabTask table');
  } else {
    console.log('• LabTask table already present');
  }

  // 3) LabTaskSubmission table
  if (!(await tableExists('LabTaskSubmission'))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "LabTaskSubmission" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "labTaskId" INTEGER NOT NULL,
        "studentId" TEXT NOT NULL,
        "content" TEXT,
        "filePath" TEXT,
        "fileName" TEXT,
        "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
        "marks" REAL,
        "feedback" TEXT,
        "gradedById" TEXT,
        "gradedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "LabTaskSubmission_labTaskId_fkey" FOREIGN KEY ("labTaskId") REFERENCES "LabTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "LabTaskSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "LmsUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "LabTaskSubmission_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "LmsUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "LabTaskSubmission_labTaskId_studentId_key" ON "LabTaskSubmission"("labTaskId", "studentId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "LabTaskSubmission_labTaskId_idx" ON "LabTaskSubmission"("labTaskId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "LabTaskSubmission_studentId_idx" ON "LabTaskSubmission"("studentId")`);
    console.log('✓ Created LabTaskSubmission table');
  } else {
    console.log('• LabTaskSubmission table already present');
  }

  console.log('Lab Management schema migration complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

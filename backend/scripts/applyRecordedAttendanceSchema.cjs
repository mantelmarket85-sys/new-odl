/*
 * Recorded-lecture watch-progress schema migration (Point 6) — additive,
 * non-destructive.
 * ------------------------------------------------------------------
 * The dev.db was never baselined for `prisma migrate deploy` (P3005), so we
 * apply the additive DDL directly with guarded raw SQL, mirroring the pattern
 * used for the Lab Management changes (applyLabManagementSchema.cjs).
 *
 * Everything here is a NEW nullable/defaulted column on RecordedLectureView.
 * No existing column or table is modified or dropped. Safe to run repeatedly.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function columnExists(table, column) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

async function addColumn(table, column, ddl) {
  if (!(await columnExists(table, column))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
    console.log(`✓ Added ${table}.${column}`);
  } else {
    console.log(`• ${table}.${column} already present`);
  }
}

async function main() {
  await addColumn('RecordedLectureView', 'watchedSeconds', '"watchedSeconds" REAL NOT NULL DEFAULT 0');
  await addColumn('RecordedLectureView', 'durationSeconds', '"durationSeconds" REAL NOT NULL DEFAULT 0');
  await addColumn('RecordedLectureView', 'progressPercent', '"progressPercent" REAL NOT NULL DEFAULT 0');
  console.log('Recorded-lecture watch-progress migration complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

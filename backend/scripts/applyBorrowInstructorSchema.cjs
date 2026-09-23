/*
 * Borrow-Instructor "Other" free-text schema migration (Point 13) — additive,
 * non-destructive.
 * ------------------------------------------------------------------
 * Adds two NEW nullable columns on InstructorLoanRequest so a coordinator can
 * request an instructor from a department / for a course that is NOT in the
 * existing dropdowns ("Other" option + custom entry).
 *
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
  await addColumn('InstructorLoanRequest', 'customDepartment', '"customDepartment" TEXT');
  await addColumn('InstructorLoanRequest', 'customCourse', '"customCourse" TEXT');
  console.log('Borrow-instructor custom-entry migration complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

// ============================================================
//  PRISMA SINGLETON
//  ------------------------------------------------------------
//  A single shared PrismaClient instance for the whole process.
//  The existing routes each instantiate their own client; new LMS
//  academic-core modules import this shared instance to avoid
//  opening dozens of SQLite connections.
// ============================================================
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const prisma = globalForPrisma.__lmsPrisma || new PrismaClient();

if (!globalForPrisma.__lmsPrisma) {
  globalForPrisma.__lmsPrisma = prisma;
}

module.exports = prisma;

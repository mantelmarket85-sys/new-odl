// ============================================================
//  UNIFIED LOGIN — SUPER ADMIN LMS MIRROR  (additive, idempotent)
//  ------------------------------------------------------------
//  The platform has ONE login system from the user's perspective:
//  the Super Admin must be able to sign in from EITHER the
//  Admissions login UI (User table) OR the LMS login UI (LmsUser
//  table) using the SAME credentials.
//
//  The Admissions super_admin already exists in the `User` table.
//  This seed mirrors that account into the `LmsUser` table with
//  role 'SuperAdmin' so the LMS /api/lms/auth/login endpoint accepts
//  the same username/email + password. It is fully idempotent and
//  never touches any other row.
//
//  Source of truth for the password is the Admissions User row
//  (its bcrypt hash is copied verbatim — we never store a plaintext
//  default). If for some reason the hash cannot be copied we fall
//  back to the documented seed password 'superadmin123'.
// ============================================================
const bcrypt = require('bcryptjs');

async function seedSuperAdminLms(prisma, { verbose = false } = {}) {
  const log = (...a) => { if (verbose) console.log(...a); };

  // Find every Admissions super_admin (architecture allows >1 later).
  const supers = await prisma.user.findMany({ where: { role: 'super_admin' } });
  if (!supers.length) {
    log('[sa-lms-seed] No super_admin in User table — nothing to mirror.');
    return [];
  }

  const results = [];
  for (const su of supers) {
    const username = (su.username || `superadmin_${su.id}`).toLowerCase().trim();
    const email = su.email ? su.email.toLowerCase().trim() : null;

    // Prefer copying the existing bcrypt hash so credentials match exactly.
    let passwordHash = su.password && su.password.startsWith('$2')
      ? su.password
      : await bcrypt.hash('superadmin123', 12);

    // Upsert keyed on username (unique). Never creates a duplicate.
    const existing = await prisma.lmsUser.findUnique({ where: { username } });
    const data = {
      email,
      passwordHash,
      role: 'SuperAdmin',
      isActive: true,
      mustChangePassword: false,
    };
    let row;
    if (existing) {
      row = await prisma.lmsUser.update({ where: { username }, data });
    } else {
      row = await prisma.lmsUser.create({ data: { username, ...data } });
    }
    results.push(row);
    log(`[sa-lms-seed] Mirrored super admin → LmsUser '${username}' (SuperAdmin).`);
  }
  return results;
}

module.exports = { seedSuperAdminLms };

// Allow running directly: `node prisma/seedSuperAdminLms.js`
if (require.main === module) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  seedSuperAdminLms(prisma, { verbose: true })
    .then((r) => console.log(`Done. Mirrored ${r.length} super admin account(s).`))
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}

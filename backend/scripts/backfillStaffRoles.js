// ============================================================
//  BACKFILL STAFF ROLES (Phase 1 §1)
//  ------------------------------------------------------------
//  Assigns User.staffRole for legacy department-staff accounts so the
//  Super Admin's role-filtered assignment dropdowns show each user in
//  ONLY the correct dropdown. Rules (in priority order):
//    1. If the user already holds a department relation, tag by that.
//    2. Else infer from a matching LmsUser role (CourseCoordinator /
//       FocalPerson) — these were mirrored from admissions staff.
//    3. Else, a plain `coordinator` with no signal stays as an
//       admissions_coordinator (the Admissions-Portal default role).
//  Idempotent & non-destructive.
// ============================================================
const prisma = require('../src/utils/prisma');

async function backfill({ log = true } = {}) {
  const users = await prisma.user.findMany({
    where: { role: { in: ['coordinator'] }, staffRole: null },
    select: {
      id: true, email: true, username: true,
      managedDepartment: { select: { id: true } },
      courseCoordinatedDepartment: { select: { id: true } },
      focalDepartment: { select: { id: true } },
    },
  });

  let tagged = 0;
  for (const u of users) {
    let role = null;
    if (u.courseCoordinatedDepartment) role = 'course_coordinator';
    else if (u.focalDepartment) role = 'focal_person';
    else if (u.managedDepartment) role = 'admissions_coordinator';

    if (!role) {
      // Infer from a mirrored LmsUser (matched by username/email).
      const lms = await prisma.lmsUser.findFirst({
        where: {
          OR: [
            u.username ? { username: u.username.toLowerCase() } : undefined,
            u.email ? { email: u.email.toLowerCase() } : undefined,
          ].filter(Boolean),
        },
        select: { role: true },
      }).catch(() => null);
      if (lms?.role === 'CourseCoordinator') role = 'course_coordinator';
      else if (lms?.role === 'FocalPerson') role = 'focal_person';
    }

    // Default: an admissions coordinator (the Admissions-Portal staff role).
    if (!role) role = 'admissions_coordinator';

    await prisma.user.update({ where: { id: u.id }, data: { staffRole: role } });
    tagged += 1;
    if (log) console.log(`  tagged ${u.username || u.email} -> ${role}`);
  }
  if (log) console.log(`[backfillStaffRoles] tagged ${tagged} user(s).`);
  return { tagged };
}

module.exports = { backfill };

if (require.main === module) {
  backfill().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

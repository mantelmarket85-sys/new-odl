// ============================================================
//  LMS DEMO ACCOUNTS SEED  (idempotent, additive, NON-breaking)
//  ------------------------------------------------------------
//  Permanently provisions the seven role-based demo logins inside
//  the REAL database (LmsUser table) so they authenticate through
//  the existing /api/lms/auth/login endpoint and land on their own
//  role dashboard via the existing RBAC + routing.
//
//  • Passwords are hashed with bcrypt (saltRounds 12).
//  • Login works with EITHER the username OR the email.
//  • mustChangePassword = false so demo users enter their panel
//    immediately (no forced password-change step).
//  • Idempotent: re-running upserts by username and never creates
//    duplicates; existing role/teacher/student data is untouched.
//
//  Prompt role name        →  Canonical DB role (LmsUser.role)
//  ------------------------------------------------------------
//  student                 →  Student
//  teacher                 →  Teacher
//  course_coordinator      →  CourseCoordinator
//  focal_person            →  FocalPerson
//  exam_controller         →  ExamController
//  director_qec            →  QECCoordinator
//  provost                 →  Provost
//
//  Demo credentials
//  ------------------------------------------------------------
//    student_demo         / student@lms.com        / Student@123
//    teacher_demo         / teacher@lms.com        / Teacher@123
//    coordinator_demo     / coordinator@lms.com    / Coordinator@123
//    focal_demo           / focal@lms.com          / Focal@123
//    examcontroller_demo  / examcontroller@lms.com / Exam@123
//    qec_demo             / qec@lms.com            / QEC@123
//    provost_demo         / provost@lms.com        / Provost@123
// ============================================================
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// The canonical demo account matrix. `role` values MUST match the
// canonical LMS_ROLES list in backend/src/utils/lmsRoles.js.
const DEMO_ACCOUNTS = [
  { username: 'student_demo',        email: 'student@lms.com',        password: 'Student@123',     role: 'Student',           fullName: 'Demo Student' },
  { username: 'teacher_demo',        email: 'teacher@lms.com',        password: 'Teacher@123',     role: 'Teacher',           fullName: 'Demo Teacher' },
  { username: 'coordinator_demo',    email: 'coordinator@lms.com',    password: 'Coordinator@123', role: 'CourseCoordinator', fullName: 'Demo Course Coordinator' },
  { username: 'focal_demo',          email: 'focal@lms.com',          password: 'Focal@123',       role: 'FocalPerson',       fullName: 'Demo Focal Person' },
  { username: 'examcontroller_demo', email: 'examcontroller@lms.com', password: 'Exam@123',        role: 'ExamController',    fullName: 'Demo Exam Controller' },
  { username: 'qec_demo',            email: 'qec@lms.com',            password: 'QEC@123',         role: 'QECCoordinator',    fullName: 'Demo Director QEC' },
  { username: 'provost_demo',        email: 'provost@lms.com',        password: 'Provost@123',     role: 'Provost',           fullName: 'Demo Provost' },
];

async function upsertDemoAccount(acc, client = prisma) {
  const email = acc.email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(acc.password, 12);

  // Idempotent: keyed on the unique username. On re-run we refresh the
  // role/email/password/flags but never create a duplicate row.
  const user = await client.lmsUser.upsert({
    where: { username: acc.username },
    update: {
      email,
      passwordHash,
      role: acc.role,
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      username: acc.username,
      email,
      passwordHash,
      role: acc.role,
      isActive: true,
      mustChangePassword: false,
    },
  });

  // Give the Student demo a minimal profile so the Student dashboard
  // renders a name (other roles do not require LmsStudentProfile).
  if (acc.role === 'Student') {
    const existing = await client.lmsStudentProfile.findUnique({ where: { lmsUserId: user.id } });
    if (!existing) {
      await client.lmsStudentProfile.create({
        data: {
          lmsUserId: user.id,
          fullName: acc.fullName,
          fatherName: 'Demo Guardian',
          cnic: '00000-0000000-0',
          dateOfBirth: '2004-01-01',
          gender: 'Other',
          nationality: 'Pakistani',
          domicile: 'Khyber Pakhtunkhwa',
          program: 'Associate Degree in Computer Science',
          programShortForm: 'ADCS',
          department: 'Department of Computing',
          rollNumber: 'DEMO-STU-001',
          registrationNumber: 'REG-DEMO-STU-001',
          session: 'Fall 2026',
          enrollmentDate: new Date(),
          email,
          phone: '0300-0000000',
        },
      });
    }
  }

  // Focal Persons are DEPARTMENT-SPECIFIC. Provision a generic staff
  // profile (reusing LmsStudentProfile as the staff-profile store, the
  // same convention used by the Course Coordinator role) carrying the
  // assigned `department`. This is what every focal endpoint scopes by.
  // Idempotent: only creates the profile if one does not already exist,
  // and never overwrites a department an admin may have set later.
  if (acc.role === 'FocalPerson') {
    const existing = await client.lmsStudentProfile.findUnique({ where: { lmsUserId: user.id } });
    if (!existing) {
      await client.lmsStudentProfile.create({
        data: {
          lmsUserId: user.id,
          fullName: acc.fullName || 'Focal Person',
          fatherName: '',
          cnic: '',
          dateOfBirth: '',
          gender: '',
          program: 'N/A',
          programShortForm: 'N/A',
          // Assigned department — matches the seeded ADCS / Computing data
          // so the demo focal person sees real, department-scoped records.
          department: 'Department of Computing',
          designation: 'Focal Person',
          employeeId: `FP-${user.id.slice(-6).toUpperCase()}`,
          rollNumber: `FOCAL-${user.id.slice(-6)}`,
          registrationNumber: `FOCAL-${user.id.slice(-6)}`,
          session: 'N/A',
          enrollmentDate: new Date(),
          email,
        },
      });
    } else if (!existing.department) {
      await client.lmsStudentProfile.update({
        where: { lmsUserId: user.id },
        data: { department: 'Department of Computing' },
      });
    }
  }

  return user;
}

// Core seeding routine. Reusable from both the CLI entry point below and
// from the server startup initializer (see backend/src/server.js).
// Accepts an optional Prisma client so callers can share a connection;
// when omitted it uses this module's own client.
async function seedDemoAccounts(client = prisma, { verbose = true } = {}) {
  const log = verbose ? (...a) => console.log(...a) : () => {};
  log('Seeding LMS role-based demo accounts (idempotent)...');
  const results = [];
  for (const acc of DEMO_ACCOUNTS) {
    const user = await upsertDemoAccount(acc, client);
    results.push({ username: acc.username, email: acc.email, role: user.role, id: user.id });
  }

  if (verbose) {
    log('\n--- Demo Accounts Ready (password as listed) ---');
    for (const r of results) {
      log(`  ${r.role.padEnd(18)}  ${r.username.padEnd(20)}  ${r.email}`);
    }
    log(`\nTotal demo accounts provisioned/refreshed: ${results.length}`);
    log('Login works with username OR email + the listed password.');
  }
  return results;
}

// Export for the startup initializer + tests. Importing this module does NOT
// run any seeding (side-effect free) — only the CLI branch below does.
module.exports = { seedDemoAccounts, DEMO_ACCOUNTS };

// CLI entry point: `node prisma/seedDemoAccounts.js` (npm run prisma:seed:demo)
if (require.main === module) {
  seedDemoAccounts()
    .catch((e) => { console.error('Demo accounts seed failed:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}

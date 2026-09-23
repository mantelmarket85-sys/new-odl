// ============================================================
//  SEED TEACHER NAMES (LMS-side, additive)
//  ------------------------------------------------------------
//  Ensures every LMS Teacher (LmsUser, role='Teacher') has a real
//  full name stored in their LmsStudentProfile.fullName so the
//  Focal Person Reports & Analytics modules display ACTUAL teacher
//  names (never dummy/humanized usernames).
//
//  Safe to run repeatedly: only fills in missing names, never
//  overwrites an existing teacher full name. Does NOT touch the
//  Admissions System.
// ============================================================
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// A pool of realistic faculty names (assigned deterministically by
// username so the same teacher always gets the same name).
const NAME_POOL = [
  'Dr. Ahmed Raza',
  'Prof. Sara Khan',
  'Dr. Bilal Hussain',
  'Ms. Ayesha Siddiqui',
  'Dr. Imran Malik',
  'Mr. Usman Tariq',
  'Dr. Fatima Noor',
  'Prof. Hassan Javed',
  'Ms. Zainab Ali',
  'Dr. Kamran Shah',
  'Mr. Faisal Mehmood',
  'Dr. Nadia Aslam',
];

function hashIndex(str, mod) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

async function main() {
  console.log('Ensuring real teacher names…');
  const teachers = await prisma.lmsUser.findMany({
    where: { role: 'Teacher' },
    include: { profile: true },
    orderBy: { username: 'asc' },
  });

  const used = new Set(
    teachers.map((t) => t.profile && t.profile.fullName).filter(Boolean),
  );

  let assigned = 0;
  for (const t of teachers) {
    if (t.profile && t.profile.fullName) continue; // already named

    // Pick a deterministic, unused name.
    let idx = hashIndex(t.username, NAME_POOL.length);
    let name = NAME_POOL[idx];
    let attempts = 0;
    while (used.has(name) && attempts < NAME_POOL.length) {
      idx = (idx + 1) % NAME_POOL.length;
      name = NAME_POOL[idx];
      attempts += 1;
    }
    used.add(name);

    if (t.profile) {
      await prisma.lmsStudentProfile.update({
        where: { lmsUserId: t.id },
        data: { fullName: name },
      });
    } else {
      await prisma.lmsStudentProfile.create({
        data: {
          lmsUserId: t.id,
          fullName: name,
          fatherName: 'N/A',
          cnic: 'N/A',
          dateOfBirth: 'N/A',
          gender: 'N/A',
          program: 'Associate Degree in Computer Science',
          programShortForm: 'ADCS',
          department: 'Department of Computing',
          rollNumber: t.username,
          registrationNumber: 'FAC-' + t.username,
          session: 'Faculty',
          enrollmentDate: new Date(),
          email: t.username.toLowerCase() + '@faculty.aust.edu.pk',
        },
      });
    }
    assigned += 1;
    console.log(`  ${t.username} → ${name}`);
  }

  console.log(`\nDone. Named ${assigned} teacher(s). Total teachers: ${teachers.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

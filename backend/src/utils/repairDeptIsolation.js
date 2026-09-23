// ============================================================
//  DEPARTMENT-ISOLATION DATA REPAIR (idempotent, non-destructive)
//  ------------------------------------------------------------
//  Fixes legacy data that broke strict LMS department isolation:
//
//   1. Normalises LmsProgram.department to the CANONICAL admissions
//      Department name (matched by Program.code). Previously some
//      LmsPrograms carried a different free-text department string
//      (e.g. "Department of Computing" vs the admissions
//      "Department of Computer Science"), which broke name-based
//      scope matching.
//
//   2. Re-binds every LMS Focal Person / Course Coordinator to the
//      correct department (writes LmsStudentProfile.department):
//        a. If the staff user is linked to an admissions Department via
//           the Department FK (focalPersonId / courseCoordinatorId /
//           coordinatorId), use that department name (authoritative).
//        b. Otherwise, if the staff profile already holds a department
//           string, canonicalise it to a real admissions Department name
//           when a case-insensitive / fuzzy match exists.
//
//  Safe to run repeatedly (idempotent) and at every boot.
// ============================================================
const prisma = require('./prisma');

function norm(v) { return String(v || '').trim().toLowerCase(); }

async function repairDeptIsolation({ log = false } = {}) {
  const out = { programsFixed: 0, staffBound: 0, staffUnresolved: 0 };

  // --- Load canonical admissions departments + their program codes ---
  const admDepts = await prisma.department.findMany({
    select: {
      id: true, name: true,
      coordinatorId: true, courseCoordinatorId: true, focalPersonId: true,
      coordinator: { select: { username: true, email: true } },
      courseCoordinator: { select: { username: true, email: true } },
      focalPerson: { select: { username: true, email: true } },
      programs: { select: { code: true } },
    },
  });
  const deptNames = admDepts.map((d) => d.name);

  // Map program code → canonical department name.
  const codeToDept = new Map();
  admDepts.forEach((d) => d.programs.forEach((p) => { if (p.code) codeToDept.set(p.code, d.name); }));

  // 1. Normalise LmsProgram.department by code.
  const lmsPrograms = await prisma.lmsProgram.findMany({ select: { id: true, code: true, department: true } });
  for (const lp of lmsPrograms) {
    const canonical = codeToDept.get(lp.code);
    if (canonical && String(lp.department || '').trim() !== canonical) {
      await prisma.lmsProgram.update({ where: { id: lp.id }, data: { department: canonical } }).catch(() => {});
      out.programsFixed += 1;
    }
  }

  // 2a. Bind staff linked via the admissions Department FK.
  //     username/email on LMS user matches the admissions staff user.
  const bindByIdentity = async (staff, deptName, role) => {
    if (!staff) return false;
    const uname = norm(staff.username);
    const email = staff.email ? norm(staff.email) : null;
    let lmsUser = uname ? await prisma.lmsUser.findUnique({ where: { username: uname } }).catch(() => null) : null;
    if (!lmsUser && email) lmsUser = await prisma.lmsUser.findUnique({ where: { email } }).catch(() => null);
    if (!lmsUser) return false;
    await upsertStaffDept(lmsUser.id, deptName, lmsUser.role);
    return true;
  };
  for (const d of admDepts) {
    if (d.courseCoordinator) { if (await bindByIdentity(d.courseCoordinator, d.name, 'CourseCoordinator')) out.staffBound += 1; }
    if (d.focalPerson) { if (await bindByIdentity(d.focalPerson, d.name, 'FocalPerson')) out.staffBound += 1; }
  }

  // 2b. Canonicalise remaining staff whose profile has a (possibly stale) dept.
  const staff = await prisma.lmsUser.findMany({
    where: { role: { in: ['FocalPerson', 'CourseCoordinator'] } },
    select: { id: true, username: true, role: true, profile: { select: { department: true } } },
  });
  for (const s of staff) {
    const cur = s.profile?.department ? String(s.profile.department).trim() : '';
    if (!cur) { out.staffUnresolved += 1; continue; }
    // Already canonical?
    if (deptNames.some((n) => n === cur)) continue;
    // Fuzzy match to a real department name.
    const match = deptNames.find((n) => norm(n) === norm(cur))
      || deptNames.find((n) => norm(n).includes(norm(cur)) || norm(cur).includes(norm(n)));
    if (match && match !== cur) {
      await upsertStaffDept(s.id, match, s.role);
      out.staffBound += 1;
    }
  }

  if (log) console.log('[repairDeptIsolation]', JSON.stringify(out));
  return out;
}

async function upsertStaffDept(lmsUserId, department, role) {
  const dept = String(department || '').trim();
  const designation = role === 'FocalPerson' ? 'Department Focal Person'
    : role === 'CourseCoordinator' ? 'Course Coordinator' : null;
  const existing = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId } }).catch(() => null);
  if (existing) {
    if (String(existing.department || '').trim() !== dept) {
      await prisma.lmsStudentProfile.update({ where: { lmsUserId }, data: { department: dept } }).catch(() => {});
    }
    return;
  }
  await prisma.lmsStudentProfile.create({
    data: {
      lmsUserId, fullName: '', fatherName: '', cnic: '', dateOfBirth: '',
      gender: '', program: '', programShortForm: '', department: dept, rollNumber: '',
      registrationNumber: '', session: '', enrollmentDate: new Date(), designation,
    },
  }).catch(() => {});
}

module.exports = { repairDeptIsolation };

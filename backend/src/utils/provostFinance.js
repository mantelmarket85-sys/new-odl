// ============================================================
//  PROVOST FINANCE HELPERS  — shared, real-time finance logic.
// ------------------------------------------------------------
//  Pure data helpers used by the Provost finance routes:
//    - resolveStudentPositions(): map each student → their current
//      academic position (program / department / semester / section)
//      derived from real CourseRegistration → CourseOffering →
//      LmsCourse → LmsSemester / Section data, with a fallback to the
//      LmsStudentProfile snapshot.
//    - generateChallansForAnnouncement(): create one LmsFeeChallan per
//      matching student when a fee announcement is raised.
//    - getActiveBlocks(): latest open LmsStudentBlock per student.
//
//  All functions are additive and read existing models only — they do
//  NOT modify the Student / Teacher / other completed roles.
// ============================================================
const prisma = require('./prisma');

function safeParse(str, fallback) {
  try { const v = JSON.parse(str); return v ?? fallback; } catch { return fallback; }
}

// ------------------------------------------------------------
// Resolve every student's current academic position from REAL data.
// Returns a Map<studentId, {
//   studentId, rollNumber, fullName, cnic, fatherName,
//   program, programShortForm, department, semester, section,
//   email, phone
// }>
// ------------------------------------------------------------
async function resolveStudentPositions() {
  const students = await prisma.lmsUser.findMany({
    where: { role: 'Student' },
    select: {
      id: true, username: true, email: true,
      profile: {
        select: {
          fullName: true, fatherName: true, cnic: true, rollNumber: true,
          program: true, programShortForm: true, department: true,
          phone: true, email: true, whatsapp: true, gender: true,
          maritalStatus: true, address: true, registrationNumber: true,
          session: true, photoUrl: true,
        },
      },
    },
  });

  // Pull each student's ENROLLED registrations with the semester/section info.
  const regs = await prisma.courseRegistration.findMany({
    where: { status: 'ENROLLED' },
    include: {
      section: { select: { name: true } },
      offering: {
        select: {
          term: { select: { isCurrent: true, id: true } },
          course: { select: { semester: { select: { number: true } }, program: { select: { code: true, department: true } } } },
        },
      },
    },
  });

  // For each student pick the "current" position: prefer the current term;
  // otherwise the highest semester number seen. Section = most common section.
  const byStudent = {};
  for (const r of regs) {
    const sid = r.studentId;
    const semNum = r.offering?.course?.semester?.number ?? null;
    const secName = r.section?.name ?? null;
    const progCode = r.offering?.course?.program?.code ?? null;
    const deptName = r.offering?.course?.program?.department ?? null;
    const isCurrent = !!r.offering?.term?.isCurrent;
    if (!byStudent[sid]) byStudent[sid] = { positions: [], sections: {} };
    byStudent[sid].positions.push({ semNum, isCurrent, progCode, deptName });
    if (secName) byStudent[sid].sections[secName] = (byStudent[sid].sections[secName] || 0) + 1;
  }

  const map = new Map();
  for (const s of students) {
    const p = s.profile || {};
    const agg = byStudent[s.id];
    let semester = null; let section = null; let progCode = null; let deptName = null;

    if (agg) {
      // Prefer current-term positions.
      const current = agg.positions.filter((x) => x.isCurrent);
      const pool = current.length ? current : agg.positions;
      // Semester = max semester number in the chosen pool.
      semester = pool.reduce((m, x) => (x.semNum != null && x.semNum > (m ?? -1) ? x.semNum : m), null);
      progCode = pool.find((x) => x.progCode)?.progCode || null;
      deptName = pool.find((x) => x.deptName)?.deptName || null;
      // Section = most-registered section name.
      const secEntries = Object.entries(agg.sections);
      if (secEntries.length) section = secEntries.sort((a, b) => b[1] - a[1])[0][0];
    }

    map.set(s.id, {
      studentId: s.id,
      rollNumber: p.rollNumber || s.username || '',
      username: s.username || '',
      fullName: p.fullName || s.username || '',
      fatherName: p.fatherName || '',
      cnic: p.cnic || '',
      program: progCode || p.programShortForm || '',
      programName: p.program || '',
      department: deptName || p.department || '',
      semester: semester != null ? semester : null,
      section: section || null,
      email: p.email || s.email || '',
      phone: p.phone || '',
      whatsapp: p.whatsapp || '',
      gender: p.gender || '',
      maritalStatus: p.maritalStatus || '',
      address: p.address || '',
      registrationNumber: p.registrationNumber || '',
      session: p.session || '',
      photoUrl: p.photoUrl || null,
    });
  }
  return map;
}

// ------------------------------------------------------------
// Decide whether a student (their resolved position) matches an
// announcement's scope.
// ------------------------------------------------------------
function studentMatchesScope(pos, ann) {
  const scope = (ann.scope || 'UNIVERSITY').toUpperCase();
  if (scope === 'UNIVERSITY') return true;
  if (scope === 'DEPARTMENT') return ann.department && pos.department === ann.department;
  if (scope === 'PROGRAM') return ann.program && pos.program === ann.program;
  if (scope === 'SEMESTER') {
    // Semester scope may optionally be narrowed by program.
    const semOk = ann.semester != null && Number(pos.semester) === Number(ann.semester);
    const progOk = !ann.program || pos.program === ann.program;
    return semOk && progOk;
  }
  if (scope === 'SECTION') {
    const secOk = ann.section && pos.section === ann.section;
    const progOk = !ann.program || pos.program === ann.program;
    const semOk = ann.semester == null || Number(pos.semester) === Number(ann.semester);
    return secOk && progOk && semOk;
  }
  return false;
}

// ------------------------------------------------------------
// Generate a LmsFeeChallan in each matching student's Account Book
// for a freshly created LmsFeeAnnouncement. Returns { count, totalBilled }.
// Idempotency: skips students that already have a challan from THIS
// announcement (sourceAnnouncementId).
// ------------------------------------------------------------
async function generateChallansForAnnouncement(ann, positionsMap) {
  const positions = positionsMap || (await resolveStudentPositions());
  const term = await prisma.academicTerm.findFirst({ where: { isCurrent: true } })
    || await prisma.academicTerm.findFirst({ orderBy: { id: 'desc' } });

  // Find existing challans for this announcement to avoid duplicates.
  const existing = await prisma.lmsFeeChallan.findMany({
    where: { sourceAnnouncementId: ann.id },
    select: { studentId: true },
  });
  const already = new Set(existing.map((c) => c.studentId));

  const matches = [...positions.values()].filter((pos) => studentMatchesScope(pos, ann) && !already.has(pos.studentId));

  let count = 0; let totalBilled = 0;
  const feeLabel = ann.feeType === 'EXAMINATION' ? 'Examination Fee' : 'Semester Fee';

  for (const pos of matches) {
    const challanNo = `CH-${ann.id}-${pos.studentId.slice(-6)}-${Date.now().toString().slice(-5)}`;
    await prisma.lmsFeeChallan.create({
      data: {
        studentId: pos.studentId,
        termId: term ? term.id : null,
        challanNo,
        title: ann.title,
        lineItems: JSON.stringify([{ label: feeLabel, amount: ann.amount }]),
        totalAmount: ann.amount,
        dueDate: ann.dueDate || null,
        status: 'UNPAID',
        feeType: ann.feeType,
        program: pos.program || null,
        department: pos.department || null,
        semester: pos.semester != null ? pos.semester : null,
        section: pos.section || null,
        description: ann.description || null,
        sourceAnnouncementId: ann.id,
      },
    });
    count += 1;
    totalBilled += ann.amount;
  }
  return { count, totalBilled };
}

// ------------------------------------------------------------
// Latest OPEN block per student → Map<studentId, blockRow>.
// ------------------------------------------------------------
async function getActiveBlocks() {
  const open = await prisma.lmsStudentBlock.findMany({
    where: { unblockedAt: null },
    orderBy: { blockedAt: 'desc' },
  });
  const map = new Map();
  for (const b of open) if (!map.has(b.studentId)) map.set(b.studentId, b);
  return map;
}

module.exports = {
  safeParse,
  resolveStudentPositions,
  studentMatchesScope,
  generateChallansForAnnouncement,
  getActiveBlocks,
};

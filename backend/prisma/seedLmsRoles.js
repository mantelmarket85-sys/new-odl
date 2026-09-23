// ============================================================
//  LMS GOVERNANCE-ROLES SEED  (idempotent, additive)
//  ------------------------------------------------------------
//  Provisions the remaining LMS role accounts (CourseCoordinator
//  already exists from seedLmsAcademic) and ENRICHES the academic
//  dataset so the Coordinator / Focal / Exam / QEC / Provost
//  dashboards render meaningful live data.
//
//  This DOES NOT modify or delete any existing Student/Teacher data
//  produced by seedLmsAcademic.js — it only adds more teachers,
//  students, registrations, results, approvals, escalations, exams,
//  quality metrics, etc.
//
//  Demo credentials (password "Lms@1234", mustChangePassword=false):
//    coord1     CourseCoordinator   (existing)
//    teacher1   Teacher             (existing)
//    teacher2   Teacher             (new)
//    teacher3   Teacher             (new)
//    focal1     FocalPerson         (new)
//    exam1      ExamController      (new)
//    qec1       QECCoordinator      (new)
//    provost1   Provost             (new)
//    ADCS-001..ADCS-012  Student    (3 existing + 9 new)
// ============================================================
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { buildResultGrades } = require('../src/utils/lmsGrading');

const prisma = new PrismaClient();
const PW = 'Lms@1234';

async function upsertUser(username, role, linkedRollNumber = null) {
  const passwordHash = await bcrypt.hash(PW, 12);
  return prisma.lmsUser.upsert({
    where: { username },
    update: { role, isActive: true, mustChangePassword: false },
    create: { username, passwordHash, role, isActive: true, mustChangePassword: false, linkedRollNumber },
  });
}

async function ensureProfile(user, fullName, roll, semesterNum = 1) {
  const exists = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: user.id } });
  if (exists) return exists;
  return prisma.lmsStudentProfile.create({
    data: {
      lmsUserId: user.id,
      fullName,
      fatherName: 'Guardian ' + fullName.split(' ')[0],
      cnic: '17301-' + String(1000000 + parseInt(roll.slice(-3), 10)).padStart(7, '0') + '-' + roll.slice(-1),
      dateOfBirth: '2004-0' + ((semesterNum % 9) + 1) + '-15',
      gender: parseInt(roll.slice(-1), 10) % 2 === 0 ? 'Female' : 'Male',
      nationality: 'Pakistani',
      domicile: 'Khyber Pakhtunkhwa',
      program: 'Associate Degree in Computer Science',
      programShortForm: 'ADCS',
      department: 'Department of Computing',
      rollNumber: roll,
      registrationNumber: 'REG-' + roll,
      session: 'Fall 2026',
      enrollmentDate: new Date(),
      email: roll.toLowerCase() + '@student.aust.edu.pk',
      phone: '0300-' + String(1000000 + parseInt(roll.slice(-3), 10)).slice(0, 7),
    },
  });
}

async function main() {
  console.log('Seeding LMS governance roles + enriched academic data...');

  // ----- Role users -----
  const coordinator = await upsertUser('coord1', 'CourseCoordinator');
  const teacher1 = await prisma.lmsUser.findUnique({ where: { username: 'teacher1' } });
  const teacher2 = await upsertUser('teacher2', 'Teacher');
  const teacher3 = await upsertUser('teacher3', 'Teacher');
  const focal = await upsertUser('focal1', 'FocalPerson');
  const exam = await upsertUser('exam1', 'ExamController');
  const qec = await upsertUser('qec1', 'QECCoordinator');
  const provost = await upsertUser('provost1', 'Provost');
  console.log('Role users ready: coord1, teacher1/2/3, focal1, exam1, qec1, provost1');

  // ----- Program / semesters / courses (reuse or extend ADCS) -----
  const program = await prisma.lmsProgram.findUnique({ where: { code: 'ADCS' } });
  if (!program) throw new Error('ADCS program not found — run seedLmsAcademic.js first.');
  const semesters = await prisma.lmsSemester.findMany({ where: { programId: program.id }, orderBy: { number: 'asc' } });

  // Add a few semester-2 courses so the catalog is richer.
  const extraCourseDefs = [
    { code: 'CS-201', title: 'Object Oriented Programming', creditHours: 3, semIdx: 1 },
    { code: 'CS-202', title: 'Data Structures', creditHours: 3, semIdx: 1 },
    { code: 'MT-201', title: 'Discrete Mathematics', creditHours: 3, semIdx: 1 },
    { code: 'DB-201', title: 'Database Systems', creditHours: 3, semIdx: 1 },
  ];
  for (const c of extraCourseDefs) {
    await prisma.lmsCourse.upsert({
      where: { code: c.code },
      update: {},
      create: { code: c.code, title: c.title, creditHours: c.creditHours, programId: program.id, semesterId: semesters[c.semIdx] ? semesters[c.semIdx].id : semesters[0].id },
    });
  }

  const term = await prisma.academicTerm.findFirst({ where: { isCurrent: true } });
  const allCourses = await prisma.lmsCourse.findMany({ where: { programId: program.id, isDeleted: false }, orderBy: { code: 'asc' } });

  // ----- Offerings: spread courses across the 3 teachers -----
  const teachers = [teacher1, teacher2, teacher3].filter(Boolean);
  const offerings = [];
  for (let i = 0; i < allCourses.length; i += 1) {
    const t = teachers[i % teachers.length];
    const off = await prisma.courseOffering.upsert({
      where: { courseId_termId: { courseId: allCourses[i].id, termId: term.id } },
      update: { teacherId: t.id },
      create: { courseId: allCourses[i].id, termId: term.id, teacherId: t.id, status: 'ACTIVE' },
    });
    offerings.push(off);
    // Ensure a section A exists.
    await prisma.section.upsert({
      where: { offeringId_name: { offeringId: off.id, name: 'A' } },
      update: { teacherId: t.id },
      create: { offeringId: off.id, name: 'A', capacity: 50, teacherId: t.id, room: `CS-${100 + i}` },
    });
  }

  // ----- Students: ensure ADCS-001..012 with profiles -----
  const students = [];
  const names = ['Ali Khan', 'Sara Ahmed', 'Bilal Hussain', 'Ayesha Tariq', 'Hamza Sheikh', 'Fatima Noor',
    'Usman Ali', 'Zainab Malik', 'Omar Farooq', 'Hira Riaz', 'Saad Iqbal', 'Mariam Javed'];
  for (let i = 1; i <= 12; i += 1) {
    const roll = `ADCS-${String(i).padStart(3, '0')}`;
    const u = await upsertUser(roll, 'Student', roll);
    await ensureProfile(u, names[i - 1], roll, ((i - 1) % 4) + 1);
    students.push(u);
  }

  // ----- Register students into offerings (distribute) -----
  for (let i = 0; i < students.length; i += 1) {
    const su = students[i];
    // Each student registers into 4 offerings (round-robin window).
    for (let k = 0; k < 4; k += 1) {
      const off = offerings[(i + k) % offerings.length];
      const sec = await prisma.section.findFirst({ where: { offeringId: off.id, name: 'A' } });
      await prisma.courseRegistration.upsert({
        where: { offeringId_studentId: { offeringId: off.id, studentId: su.id } },
        update: { status: 'ENROLLED', sectionId: sec ? sec.id : null },
        create: { offeringId: off.id, studentId: su.id, sectionId: sec ? sec.id : null, status: 'ENROLLED' },
      });
    }
  }

  // ----- Attendance sessions + records for first 4 offerings -----
  const dates = ['2026-09-02', '2026-09-04', '2026-09-09', '2026-09-11', '2026-09-16'];
  for (const off of offerings.slice(0, 4)) {
    const regs = await prisma.courseRegistration.findMany({ where: { offeringId: off.id, status: 'ENROLLED' } });
    for (let di = 0; di < dates.length; di += 1) {
      const session = await prisma.attendanceSession.upsert({
        where: { offeringId_date: { offeringId: off.id, date: dates[di] } },
        update: {},
        create: { offeringId: off.id, date: dates[di], topic: `Lecture ${di + 1}` },
      });
      for (let ri = 0; ri < regs.length; ri += 1) {
        // Deterministic pseudo-random presence (~85% present).
        const seed = (ri * 7 + di * 3 + off.id) % 10;
        const status = seed === 0 ? 'ABSENT' : seed === 1 ? 'LATE' : 'PRESENT';
        await prisma.attendanceRecord.upsert({
          where: { sessionId_studentId: { sessionId: session.id, studentId: regs[ri].studentId } },
          update: { status },
          create: { sessionId: session.id, studentId: regs[ri].studentId, status },
        });
      }
    }
  }

  // ----- Results: publish results for first 4 offerings -----
  for (const off of offerings.slice(0, 4)) {
    const fullOff = await prisma.courseOffering.findUnique({ where: { id: off.id } });
    const regs = await prisma.courseRegistration.findMany({ where: { offeringId: off.id, status: 'ENROLLED' } });
    for (let ri = 0; ri < regs.length; ri += 1) {
      // Vary marks deterministically across a realistic spread.
      const base = 55 + ((ri * 13 + off.id * 7) % 40); // 55..94
      const componentMarks = {
        assignmentMarks: Math.min(100, base + 5), assignmentMax: 100,
        quizMarks: Math.min(100, base), quizMax: 100,
        midMarks: Math.max(0, base - 5), midMax: 100,
        finalMarks: Math.max(0, base - 2), finalMax: 100,
      };
      const grades = buildResultGrades(componentMarks, fullOff);
      // First offering keeps everything published; others mix DRAFT/PUBLISHED.
      const status = off.id === offerings[0].id || ri % 3 !== 0 ? 'PUBLISHED' : 'DRAFT';
      await prisma.courseResult.upsert({
        where: { offeringId_studentId: { offeringId: off.id, studentId: regs[ri].studentId } },
        update: { ...componentMarks, ...grades, status, publishedAt: status === 'PUBLISHED' ? new Date() : null },
        create: { offeringId: off.id, studentId: regs[ri].studentId, ...componentMarks, ...grades, status, publishedAt: status === 'PUBLISHED' ? new Date() : null },
      });
    }
  }

  // ----- Approval requests (varied types + statuses) -----
  const approvalCount = await prisma.approvalRequest.count();
  if (approvalCount === 0) {
    const reqs = [
      { type: 'COURSE', title: 'New course: AI Fundamentals', description: 'Proposed addition to Semester 3.', requestedById: teacher2.id, requestedRole: 'Teacher', assignedRole: 'CourseCoordinator', priority: 'NORMAL', entity: 'LmsCourse', entityId: 'new' },
      { type: 'GRADE_CHANGE', title: 'Grade change request — CS-101', description: 'Student ADCS-002 final marks re-tabulation.', requestedById: teacher1.id, requestedRole: 'Teacher', assignedRole: 'CourseCoordinator', priority: 'HIGH' },
      { type: 'FACULTY', title: 'Teacher replacement for DB-201', description: 'Requesting reassignment due to workload.', requestedById: teacher3.id, requestedRole: 'Teacher', assignedRole: 'CourseCoordinator', priority: 'NORMAL' },
      { type: 'RESULT', title: 'Result approval — CS-201', description: 'Final results compiled, awaiting coordinator approval.', requestedById: teacher2.id, requestedRole: 'Teacher', assignedRole: 'CourseCoordinator', priority: 'HIGH' },
      { type: 'ACADEMIC', title: 'Curriculum revision proposal', description: 'Update credit hours for MT-201.', requestedById: coordinator.id, requestedRole: 'CourseCoordinator', assignedRole: 'FocalPerson', priority: 'NORMAL' },
      { type: 'POLICY', title: 'Attendance policy revision', description: 'Raise minimum attendance to 80%.', requestedById: focal.id, requestedRole: 'FocalPerson', assignedRole: 'Provost', priority: 'NORMAL' },
      { type: 'EXAM_SCHEDULE', title: 'Final datesheet approval', description: 'Fall 2026 final examinations datesheet.', requestedById: exam.id, requestedRole: 'ExamController', assignedRole: 'CourseCoordinator', priority: 'URGENT' },
    ];
    for (const r of reqs) {
      const ar = await prisma.approvalRequest.create({ data: r });
      await prisma.approvalHistory.create({ data: { requestId: ar.id, action: 'SUBMITTED', actorId: r.requestedById, actorRole: r.requestedRole, toStatus: 'PENDING', note: 'Request submitted.' } });
    }
  }

  // ----- Escalations -----
  const escCount = await prisma.escalation.count();
  if (escCount === 0) {
    const escs = [
      { category: 'STUDENT_CASE', subject: 'Repeated absences — ADCS-007', description: 'Attendance below 60% in two courses.', severity: 'HIGH', currentRole: 'CourseCoordinator', raisedById: teacher1.id, raisedRole: 'Teacher', studentId: students[6].id },
      { category: 'FACULTY_ISSUE', subject: 'Late grade submission', description: 'CS-202 grades overdue by 5 days.', severity: 'MEDIUM', currentRole: 'CourseCoordinator', raisedById: coordinator.id, raisedRole: 'CourseCoordinator' },
      { category: 'COMPLAINT', subject: 'Student grievance on quiz marking', description: 'Disputed MCQ key in Quiz 1.', severity: 'MEDIUM', currentRole: 'FocalPerson', raisedById: students[1].id, raisedRole: 'Student', studentId: students[1].id },
      { category: 'RISK', subject: 'At-risk cohort — Semester 1', description: '4 students with GPA < 1.5 projected.', severity: 'CRITICAL', currentRole: 'FocalPerson', raisedById: focal.id, raisedRole: 'FocalPerson' },
    ];
    for (const e of escs) {
      const es = await prisma.escalation.create({ data: e });
      await prisma.escalationEvent.create({ data: { escalationId: es.id, action: 'CREATED', actorId: e.raisedById, actorRole: e.raisedRole, toRole: e.currentRole, note: 'Escalation opened.' } });
    }
  }

  // ----- Exam schedules + seating + invigilation -----
  const examCount = await prisma.examSchedule.count();
  if (examCount === 0) {
    for (let i = 0; i < offerings.slice(0, 4).length; i += 1) {
      const off = offerings[i];
      const course = allCourses.find((c) => c.id === off.courseId);
      const ex = await prisma.examSchedule.create({
        data: {
          termId: term.id, offeringId: off.id, examType: 'FINAL',
          title: `${course.code} Final Exam`, date: `2027-01-${String(5 + i).padStart(2, '0')}`,
          startTime: '09:00', endTime: '12:00', room: `Hall-${i + 1}`, totalMarks: 100,
          status: i < 2 ? 'PUBLISHED' : 'DRAFT', createdById: exam.id,
        },
      });
      await prisma.examSeating.create({ data: { examId: ex.id, room: `Hall-${i + 1}`, capacity: 40, allocated: 30 } });
      await prisma.examInvigilation.create({ data: { examId: ex.id, invigilatorId: teachers[(i + 1) % teachers.length].id, room: `Hall-${i + 1}`, role: 'INVIGILATOR' } });
    }
  }

  // ----- Exam papers -----
  if ((await prisma.examPaper.count()) === 0) {
    await prisma.examPaper.create({ data: { offeringId: offerings[0].id, title: 'CS-101 Final Paper v1', version: 1, submittedById: teacher1.id, status: 'APPROVED', reviewedById: exam.id, reviewedAt: new Date() } });
    await prisma.examPaper.create({ data: { offeringId: offerings[1].id, title: 'CS-102 Final Paper v1', version: 1, submittedById: teacher1.id, status: 'UNDER_REVIEW' } });
  }

  // ----- Recheck requests -----
  if ((await prisma.recheckRequest.count()) === 0) {
    await prisma.recheckRequest.create({ data: { studentId: students[1].id, offeringId: offerings[0].id, component: 'FINAL', reason: 'Total marks seem miscounted.', status: 'SUBMITTED', feeChallanNo: 'RC-0001' } });
  }

  // ----- Result batch -----
  if ((await prisma.resultBatch.count()) === 0) {
    const total = await prisma.courseResult.count({ where: { status: 'PUBLISHED' } });
    const passC = await prisma.courseResult.count({ where: { status: 'PUBLISHED', totalPercent: { gte: 50 } } });
    await prisma.resultBatch.create({ data: { termId: term.id, title: 'Fall 2026 Results', status: 'COMPILED', totalResults: total, passCount: passC, failCount: total - passC } });
  }

  // ----- Surveys: a teacher-eval + general (QEC) -----
  if ((await prisma.survey.count({ where: { type: 'TEACHER_EVAL' } })) === 0) {
    const s = await prisma.survey.create({
      data: { title: 'Fall 2026 Teacher Evaluation', description: 'Evaluate your instructors.', type: 'TEACHER_EVAL', audience: 'STUDENTS', isAnonymous: true, isActive: true, authorId: qec.id },
    });
    await prisma.surveyQuestion.createMany({
      data: [
        { surveyId: s.id, text: 'The instructor was well prepared.', type: 'RATING', order: 1 },
        { surveyId: s.id, text: 'The instructor explained concepts clearly.', type: 'RATING', order: 2 },
        { surveyId: s.id, text: 'Assessments were fair.', type: 'RATING', order: 3 },
        { surveyId: s.id, text: 'Comments', type: 'TEXT', required: false, order: 4 },
      ],
    });
    // A few responses so QEC analytics has data.
    const qs = await prisma.surveyQuestion.findMany({ where: { surveyId: s.id } });
    for (let i = 0; i < 6; i += 1) {
      const ans = {};
      qs.forEach((q) => { ans[q.id] = q.type === 'RATING' ? String(3 + (i % 3)) : 'Good teaching.'; });
      await prisma.surveyResponse.upsert({
        where: { surveyId_studentId: { surveyId: s.id, studentId: students[i].id } },
        update: { answersJson: JSON.stringify(ans) },
        create: { surveyId: s.id, studentId: students[i].id, answersJson: JSON.stringify(ans) },
      });
    }
  }

  // ----- Quality metrics -----
  if ((await prisma.qualityMetric.count()) === 0) {
    await prisma.qualityMetric.createMany({
      data: [
        { scope: 'INSTITUTION', metric: 'AvgCourseEvalScore', value: 4.1, target: 4.0, termId: term.id, periodLabel: 'Fall 2026' },
        { scope: 'INSTITUTION', metric: 'AvgTeacherRating', value: 4.0, target: 4.0, termId: term.id, periodLabel: 'Fall 2026' },
        { scope: 'PROGRAM', refId: String(program.id), metric: 'CompletionRate', value: 88, target: 90, termId: term.id, periodLabel: 'Fall 2026' },
        { scope: 'PROGRAM', refId: String(program.id), metric: 'PassRate', value: 82, target: 85, termId: term.id, periodLabel: 'Fall 2026' },
      ],
    });
  }

  // ----- Compliance items -----
  if ((await prisma.complianceItem.count()) === 0) {
    await prisma.complianceItem.createMany({
      data: [
        { category: 'NCEAC', title: 'OBE-aligned course files', status: 'IN_PROGRESS', dueDate: '2027-02-01', ownerRole: 'QECCoordinator' },
        { category: 'HEC', title: 'Faculty PhD ratio report', status: 'COMPLIANT', ownerRole: 'QECCoordinator' },
        { category: 'INTERNAL', title: 'Mid-term student feedback collected', status: 'PENDING', dueDate: '2026-11-15', ownerRole: 'QECCoordinator' },
      ],
    });
  }

  // ----- Improvement plans -----
  if ((await prisma.improvementPlan.count()) === 0) {
    await prisma.improvementPlan.create({ data: { title: 'Raise CS-102 pass rate', area: 'CS-102', finding: 'Pass rate below 80%.', actionPlan: 'Add weekly tutorials + practice quizzes.', status: 'IN_PROGRESS', ownerRole: 'CourseCoordinator', targetDate: '2027-01-01', progress: 40 } });
  }

  // ----- Strategic initiatives + policies (Provost) -----
  if ((await prisma.strategicInitiative.count()) === 0) {
    await prisma.strategicInitiative.createMany({
      data: [
        { title: 'Launch BS Computer Science (4-year)', category: 'ACADEMIC', status: 'PROPOSED', priority: 'HIGH', ownerRole: 'Provost', targetDate: '2027-09-01', progress: 10 },
        { title: 'Digital exam infrastructure upgrade', category: 'INFRASTRUCTURE', status: 'IN_PROGRESS', priority: 'NORMAL', ownerRole: 'ExamController', budget: 5000000, progress: 35 },
        { title: 'Faculty development program', category: 'STRATEGIC', status: 'APPROVED', priority: 'NORMAL', ownerRole: 'QECCoordinator', progress: 20 },
      ],
    });
  }
  if ((await prisma.policy.count()) === 0) {
    await prisma.policy.createMany({
      data: [
        { code: 'POL-ATT-01', title: 'Minimum Attendance Policy', category: 'ACADEMIC', body: 'Students must maintain at least 75% attendance.', status: 'PUBLISHED', effectiveDate: '2026-09-01', version: 1 },
        { code: 'POL-EXM-01', title: 'Examination Conduct Policy', category: 'EXAMINATION', body: 'Rules governing the conduct of examinations.', status: 'PUBLISHED', effectiveDate: '2026-09-01', version: 1 },
        { code: 'POL-GRD-01', title: 'Grading & GPA Policy', category: 'ACADEMIC', body: 'AUST 4.0 GPA scale.', status: 'UNDER_REVIEW', version: 2 },
      ],
    });
  }

  // ----- A few cross-role notifications -----
  for (const u of [coordinator, focal, exam, qec, provost]) {
    const exists = await prisma.lmsNotification.findFirst({ where: { userId: u.id } });
    if (!exists) {
      await prisma.lmsNotification.create({ data: { userId: u.id, title: 'Welcome to the AUST LMS', message: 'Your role dashboard is ready.', type: 'INFO' } });
    }
  }

  console.log('\n--- Governance Roles Seed Complete ---');
  console.log(`Offerings: ${offerings.length} | Students: ${students.length} | Teachers: ${teachers.length}`);
  console.log('Logins (pw Lms@1234): coord1, teacher1, teacher2, teacher3, focal1, exam1, qec1, provost1, ADCS-001..012');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

// ============================================================
//  LMS ACADEMIC CORE SEED  (idempotent)
//  ------------------------------------------------------------
//  Provisions a realistic teaching scenario for the Student +
//  Teacher modules WITHOUT touching admissions data:
//    - 1 Teacher LmsUser + 1 CourseCoordinator LmsUser
//    - 3 Student LmsUsers (with LmsStudentProfile)
//    - 1 LmsProgram (ADCS) + semesters + 4 courses
//    - 1 current AcademicTerm (Fall 2026) + offerings + sections
//    - registrations, attendance sessions/records, assignments +
//      submissions, a quiz + questions + attempts, and draft results.
//
//  Demo credentials (all use password "Lms@1234" after seeding;
//  mustChangePassword is set false so you can log in directly):
//    teacher1   / Lms@1234   (Teacher)
//    coord1     / Lms@1234   (CourseCoordinator)
//    ADCS-001   / Lms@1234   (Student)
//    ADCS-002   / Lms@1234   (Student)
//    ADCS-003   / Lms@1234   (Student)
// ============================================================
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const PW = 'Lms@1234';

async function upsertLmsUser(username, role, linkedRollNumber = null) {
  const passwordHash = await bcrypt.hash(PW, 12);
  return prisma.lmsUser.upsert({
    where: { username },
    update: { role, isActive: true, mustChangePassword: false, linkedRollNumber },
    create: { username, passwordHash, role, isActive: true, mustChangePassword: false, linkedRollNumber },
  });
}

async function ensureStudentProfile(lmsUser, fullName, roll) {
  const exists = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: lmsUser.id } });
  if (exists) return exists;
  return prisma.lmsStudentProfile.create({
    data: {
      lmsUserId: lmsUser.id,
      fullName,
      fatherName: 'Guardian ' + fullName.split(' ')[0],
      cnic: '17301-0000000-' + roll.slice(-1),
      dateOfBirth: '2004-01-15',
      gender: 'Male',
      nationality: 'Pakistani',
      program: 'Associate Degree in Computer Science',
      programShortForm: 'ADCS',
      department: 'Department of Computing',
      rollNumber: roll,
      registrationNumber: 'REG-' + roll,
      session: 'Fall 2026',
      enrollmentDate: new Date(),
      email: roll.toLowerCase() + '@student.aust.edu.pk',
      phone: '0300-0000000',
    },
  });
}

async function main() {
  console.log('Seeding LMS academic core...');

  // --- Users ---
  const teacher = await upsertLmsUser('teacher1', 'Teacher');
  const coordinator = await upsertLmsUser('coord1', 'CourseCoordinator');
  const studentUsers = [];
  for (let i = 1; i <= 3; i += 1) {
    const roll = `ADCS-00${i}`;
    const u = await upsertLmsUser(roll, 'Student', roll);
    await ensureStudentProfile(u, ['Ali Khan', 'Sara Ahmed', 'Bilal Hussain'][i - 1], roll);
    studentUsers.push(u);
  }
  console.log(`Users: teacher1, coord1, ${studentUsers.map((s) => s.username).join(', ')} (pw ${PW})`);

  // --- Program + semesters ---
  const program = await prisma.lmsProgram.upsert({
    where: { code: 'ADCS' },
    update: {},
    create: { code: 'ADCS', name: 'Associate Degree in Computer Science', shortForm: 'ADCS', department: 'Department of Computing', totalSemesters: 4 },
  });
  const semesters = [];
  for (let n = 1; n <= 4; n += 1) {
    const s = await prisma.lmsSemester.upsert({
      where: { programId_number: { programId: program.id, number: n } },
      update: {},
      create: { programId: program.id, number: n, title: `Semester ${n}` },
    });
    semesters.push(s);
  }

  // --- Courses (semester 1) ---
  const courseDefs = [
    { code: 'CS-101', title: 'Introduction to Programming', creditHours: 3 },
    { code: 'CS-102', title: 'Computer Fundamentals', creditHours: 3 },
    { code: 'MT-101', title: 'Calculus I', creditHours: 3 },
    { code: 'EN-101', title: 'English Composition', creditHours: 2 },
  ];
  const courses = [];
  for (const c of courseDefs) {
    const course = await prisma.lmsCourse.upsert({
      where: { code: c.code },
      update: {},
      create: { ...c, programId: program.id, semesterId: semesters[0].id },
    });
    courses.push(course);
  }

  // --- Current term ---
  await prisma.academicTerm.updateMany({ data: { isCurrent: false } });
  const term = await prisma.academicTerm.upsert({
    where: { code: 'F26' },
    update: { isCurrent: true, isActive: true },
    create: { code: 'F26', title: 'Fall 2026', isCurrent: true, startDate: '2026-09-01', endDate: '2027-01-15' },
  });

  // --- Offerings: assign first two courses to teacher1 ---
  const offerings = [];
  for (let i = 0; i < courses.length; i += 1) {
    const off = await prisma.courseOffering.upsert({
      where: { courseId_termId: { courseId: courses[i].id, termId: term.id } },
      update: { teacherId: teacher.id },
      create: { courseId: courses[i].id, termId: term.id, teacherId: teacher.id },
    });
    offerings.push(off);
  }

  // --- Section A for each offering ---
  const sections = [];
  for (const off of offerings) {
    const sec = await prisma.section.upsert({
      where: { offeringId_name: { offeringId: off.id, name: 'A' } },
      update: { teacherId: teacher.id },
      create: { offeringId: off.id, name: 'A', capacity: 50, teacherId: teacher.id, room: 'CS-Lab-1' },
    });
    sections.push(sec);
  }

  // --- Register all 3 students into the first 2 offerings ---
  for (const off of offerings.slice(0, 2)) {
    const sec = sections.find((s) => s.offeringId === off.id);
    for (const su of studentUsers) {
      await prisma.courseRegistration.upsert({
        where: { offeringId_studentId: { offeringId: off.id, studentId: su.id } },
        update: { status: 'ENROLLED', sectionId: sec.id },
        create: { offeringId: off.id, studentId: su.id, sectionId: sec.id, status: 'ENROLLED' },
      });
    }
  }

  const cs101 = offerings[0]; // CS-101 offering

  // --- Attendance: 3 sessions with records ---
  const dates = ['2026-09-02', '2026-09-04', '2026-09-09'];
  for (const d of dates) {
    const session = await prisma.attendanceSession.upsert({
      where: { offeringId_date: { offeringId: cs101.id, date: d } },
      update: {},
      create: { offeringId: cs101.id, date: d, topic: `Lecture on ${d}` },
    });
    for (let i = 0; i < studentUsers.length; i += 1) {
      const status = (i === 2 && d === '2026-09-04') ? 'ABSENT' : (i === 1 && d === '2026-09-09' ? 'LATE' : 'PRESENT');
      await prisma.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId: studentUsers[i].id } },
        update: { status },
        create: { sessionId: session.id, studentId: studentUsers[i].id, status },
      });
    }
  }

  // --- Assignment + submissions ---
  let assignment = await prisma.assignment2.findFirst({ where: { offeringId: cs101.id, title: 'Assignment 1: Variables' } });
  if (!assignment) {
    assignment = await prisma.assignment2.create({
      data: { offeringId: cs101.id, title: 'Assignment 1: Variables', description: 'Write a program using variables and types.', totalMarks: 50, dueDate: '2026-09-20', isPublished: true },
    });
  }
  // Student 1 submitted + graded; student 2 submitted ungraded.
  await prisma.assignmentSubmission.upsert({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: studentUsers[0].id } },
    update: { marks: 45, status: 'GRADED', feedback: 'Good work', gradedById: teacher.id, gradedAt: new Date() },
    create: { assignmentId: assignment.id, studentId: studentUsers[0].id, content: 'My solution', status: 'GRADED', marks: 45, feedback: 'Good work', gradedById: teacher.id, gradedAt: new Date() },
  });
  await prisma.assignmentSubmission.upsert({
    where: { assignmentId_studentId: { assignmentId: assignment.id, studentId: studentUsers[1].id } },
    update: { status: 'SUBMITTED' },
    create: { assignmentId: assignment.id, studentId: studentUsers[1].id, content: 'My solution 2', status: 'SUBMITTED' },
  });

  // --- Quiz + questions ---
  let quiz = await prisma.quiz.findFirst({ where: { offeringId: cs101.id, title: 'Quiz 1' } });
  if (!quiz) {
    quiz = await prisma.quiz.create({
      data: { offeringId: cs101.id, title: 'Quiz 1', description: 'Basics of programming', durationMin: 15, isPublished: true },
    });
    const q1 = await prisma.quizQuestion.create({
      data: { quizId: quiz.id, text: 'Which keyword declares a constant in JavaScript?', type: 'MCQ', optionsJson: JSON.stringify(['var', 'let', 'const', 'static']), correctAnswer: '2', marks: 2, order: 1 },
    });
    const q2 = await prisma.quizQuestion.create({
      data: { quizId: quiz.id, text: 'JavaScript is a compiled language.', type: 'TRUEFALSE', optionsJson: JSON.stringify(['True', 'False']), correctAnswer: '1', marks: 1, order: 2 },
    });
    await prisma.quiz.update({ where: { id: quiz.id }, data: { totalMarks: 3 } });
    // Student 1 attempts and gets full marks.
    await prisma.quizAttempt.upsert({
      where: { quizId_studentId: { quizId: quiz.id, studentId: studentUsers[0].id } },
      update: {},
      create: {
        quizId: quiz.id, studentId: studentUsers[0].id,
        answersJson: JSON.stringify({ [q1.id]: '2', [q2.id]: '1' }),
        score: 3, maxScore: 3, status: 'GRADED', submittedAt: new Date(), gradedAt: new Date(),
      },
    });
  }

  // --- Course materials ---
  const existingMat = await prisma.courseMaterial.findFirst({ where: { offeringId: cs101.id } });
  if (!existingMat) {
    await prisma.courseMaterial.create({ data: { offeringId: cs101.id, title: 'Lecture 1 Slides', type: 'LINK', url: 'https://example.com/slides1.pdf', weekNumber: 1 } });
  }

  // --- Announcement ---
  const existingAnn = await prisma.lmsAnnouncement.findFirst({ where: { offeringId: cs101.id } });
  if (!existingAnn) {
    await prisma.lmsAnnouncement.create({ data: { offeringId: cs101.id, authorId: teacher.id, title: 'Welcome to CS-101', message: 'Classes begin Sep 2. Check materials weekly.' } });
  }

  // --- A published result for student 1 in CS-101 (so transcript shows data) ---
  const { buildResultGrades } = require('../src/utils/lmsGrading');
  const componentMarks = { assignmentMarks: 90, assignmentMax: 100, quizMarks: 100, quizMax: 100, midMarks: 80, midMax: 100, finalMarks: 85, finalMax: 100 };
  const grades = buildResultGrades(componentMarks, cs101);
  await prisma.courseResult.upsert({
    where: { offeringId_studentId: { offeringId: cs101.id, studentId: studentUsers[0].id } },
    update: { ...componentMarks, ...grades, status: 'PUBLISHED', publishedAt: new Date() },
    create: { offeringId: cs101.id, studentId: studentUsers[0].id, ...componentMarks, ...grades, status: 'PUBLISHED', publishedAt: new Date() },
  });

  // ============================================================
  // PHASE-1 STUDENT MODULE SEED DATA (additive, idempotent)
  // ============================================================
  const cs102 = offerings[1];

  // --- Schedule slots (weekly timetable) for the two enrolled offerings ---
  const slotDefs = [
    { offeringId: cs101.id, dayOfWeek: 1, startTime: '09:00', endTime: '10:30', room: 'CS-Lab-1', mode: 'ONSITE' },
    { offeringId: cs101.id, dayOfWeek: 3, startTime: '09:00', endTime: '10:30', room: 'CS-Lab-1', mode: 'ONSITE' },
    { offeringId: cs102.id, dayOfWeek: 2, startTime: '11:00', endTime: '12:30', room: 'Room-204', mode: 'ONLINE' },
    { offeringId: cs102.id, dayOfWeek: 4, startTime: '11:00', endTime: '12:30', room: 'Room-204', mode: 'ONLINE' },
  ];
  for (const s of slotDefs) {
    const existing = await prisma.scheduleSlot.findFirst({ where: { offeringId: s.offeringId, dayOfWeek: s.dayOfWeek, startTime: s.startTime } });
    if (!existing) await prisma.scheduleSlot.create({ data: s });
  }

  // --- Calendar events (global + offering-scoped) ---
  const eventDefs = [
    { title: 'Fall 2026 Semester Begins', type: 'EVENT', date: '2026-09-01', audience: 'ALL', authorId: coordinator.id },
    { title: 'Mid-Term Examinations', type: 'EXAM', date: '2026-11-02', endDate: '2026-11-08', audience: 'STUDENTS', authorId: coordinator.id },
    { title: 'Final Examinations', type: 'EXAM', date: '2027-01-05', endDate: '2027-01-15', audience: 'STUDENTS', authorId: coordinator.id },
    { title: 'CS-101 Lab Demo', type: 'CLASS', date: '2026-09-15', startTime: '09:00', endTime: '10:30', location: 'CS-Lab-1', offeringId: cs101.id, audience: 'STUDENTS', authorId: teacher.id },
    { title: 'Winter Break', type: 'HOLIDAY', date: '2026-12-25', endDate: '2027-01-01', audience: 'ALL', authorId: coordinator.id },
  ];
  for (const e of eventDefs) {
    const existing = await prisma.calendarEvent.findFirst({ where: { title: e.title, date: e.date } });
    if (!existing) await prisma.calendarEvent.create({ data: e });
  }

  // --- Live classes ---
  const liveDefs = [
    { offeringId: cs101.id, title: 'CS-101 Live: Variables Recap', scheduledAt: new Date(Date.now() + 2 * 86400000), durationMin: 60, status: 'SCHEDULED', joinUrl: 'https://meet.example.com/cs101-recap', hostId: teacher.id },
    { offeringId: cs101.id, title: 'CS-101 Live: Functions', scheduledAt: new Date(Date.now() - 5 * 86400000), durationMin: 60, status: 'ENDED', recordingUrl: 'https://video.example.com/cs101-functions.mp4', hostId: teacher.id },
    { offeringId: cs102.id, title: 'CS-102 Live: Hardware Basics', scheduledAt: new Date(Date.now() + 4 * 86400000), durationMin: 90, status: 'SCHEDULED', joinUrl: 'https://meet.example.com/cs102-hw', hostId: teacher.id },
  ];
  for (const lc of liveDefs) {
    const existing = await prisma.liveClass.findFirst({ where: { offeringId: lc.offeringId, title: lc.title } });
    if (!existing) await prisma.liveClass.create({ data: lc });
  }

  // --- Recorded lecture material (VIDEO) ---
  const vidExisting = await prisma.courseMaterial.findFirst({ where: { offeringId: cs101.id, type: 'VIDEO' } });
  if (!vidExisting) {
    await prisma.courseMaterial.create({ data: { offeringId: cs101.id, title: 'Recorded: Intro Lecture', type: 'VIDEO', url: 'https://video.example.com/cs101-intro.mp4', weekNumber: 1 } });
    await prisma.courseMaterial.create({ data: { offeringId: cs101.id, title: 'Week 2 Notes (PDF)', type: 'FILE', url: 'https://example.com/cs101-week2.pdf', fileName: 'cs101-week2.pdf', weekNumber: 2 } });
  }

  // --- Fee challan for each student ---
  for (let i = 0; i < studentUsers.length; i += 1) {
    const su = studentUsers[i];
    const challanNo = `CH-F26-${su.username}`;
    const existing = await prisma.lmsFeeChallan.findUnique({ where: { challanNo } });
    if (!existing) {
      await prisma.lmsFeeChallan.create({
        data: {
          studentId: su.id, termId: term.id, challanNo, title: 'Fall 2026 Semester Fee',
          lineItems: JSON.stringify([
            { label: 'Tuition Fee', amount: 45000 },
            { label: 'Examination Fee', amount: 5000 },
            { label: 'Library Fee', amount: 2000 },
          ]),
          totalAmount: 52000, dueDate: '2026-09-30',
          status: i === 0 ? 'PAID' : 'UNPAID',
          paidAt: i === 0 ? new Date() : null,
          paymentRef: i === 0 ? 'TXN-100001' : null,
        },
      });
    }
  }

  // --- Survey (course evaluation) ---
  let survey = await prisma.survey.findFirst({ where: { title: 'CS-101 Course Evaluation' } });
  if (!survey) {
    survey = await prisma.survey.create({
      data: {
        title: 'CS-101 Course Evaluation', description: 'Help us improve this course.', type: 'COURSE_EVAL',
        offeringId: cs101.id, audience: 'STUDENTS', isAnonymous: true, isActive: true,
        authorId: coordinator.id,
      },
    });
    await prisma.surveyQuestion.createMany({
      data: [
        { surveyId: survey.id, text: 'How would you rate the course content?', type: 'RATING', order: 1 },
        { surveyId: survey.id, text: 'How would you rate the teacher?', type: 'RATING', order: 2 },
        { surveyId: survey.id, text: 'Was the pace appropriate?', type: 'YESNO', order: 3 },
        { surveyId: survey.id, text: 'Any additional comments?', type: 'TEXT', required: false, order: 4 },
      ],
    });
  }

  // --- Sticky notes for student 1 ---
  const noteExists = await prisma.studentNote.findFirst({ where: { studentId: studentUsers[0].id } });
  if (!noteExists) {
    await prisma.studentNote.create({ data: { studentId: studentUsers[0].id, title: 'Reminder', content: 'Submit CS-101 Assignment 2 before Friday.', color: 'yellow', tag: 'CS-101', pinned: true } });
    await prisma.studentNote.create({ data: { studentId: studentUsers[0].id, content: 'Read chapter 3 for the quiz.', color: 'green', tag: 'Study' } });
  }

  // --- An appeal/request from student 1 ---
  const appealExists = await prisma.studentAppeal.findFirst({ where: { studentId: studentUsers[0].id } });
  if (!appealExists) {
    await prisma.studentAppeal.create({ data: { studentId: studentUsers[0].id, type: 'DOCUMENT', subject: 'Request for transcript copy', description: 'I need an official transcript for a scholarship application.', status: 'OPEN' } });
  }

  // --- Notifications for student 1 ---
  const notifExists = await prisma.lmsNotification.findFirst({ where: { userId: studentUsers[0].id } });
  if (!notifExists) {
    await prisma.lmsNotification.createMany({
      data: [
        { userId: studentUsers[0].id, title: 'Result published', message: 'Your CS-101 result is now available.', type: 'RESULT', link: '/student/results' },
        { userId: studentUsers[0].id, title: 'Assignment graded', message: 'Assignment 1: Variables has been graded (45/50).', type: 'ASSIGNMENT', link: '/student/assignments' },
        { userId: studentUsers[0].id, title: 'Welcome to AUST LMS', message: 'Explore your dashboard to get started.', type: 'INFO' },
      ],
    });
  }

  console.log('\n--- LMS Academic Seed Complete ---');
  console.log(`Teacher:      teacher1 / ${PW}`);
  console.log(`Coordinator:  coord1 / ${PW}`);
  console.log(`Students:     ADCS-001, ADCS-002, ADCS-003 / ${PW}`);
  console.log(`Term: ${term.title} (${term.code}) | Program: ${program.shortForm} | Offerings: ${offerings.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

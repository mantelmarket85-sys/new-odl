// ============================================================
//  VERIFICATION SEED (additive, idempotent) — seedVerifyScenario.js
//  ------------------------------------------------------------
//  Provisions a COMPLETE end-to-end LMS scenario wired to the
//  existing role-based *_demo accounts so the six scoped changes
//  in this task can be verified end to end:
//
//    • coordinator_demo  → bound to "Department of Computing" (so the
//                          Course Distribution + Weightage scopes resolve).
//    • teacher_demo      → assigned a LAB course offering (Task 5) plus a
//                          regular course offering.
//    • student_demo      → enrolled in both offerings (Task 4).
//    • A lab course + 2 lab tasks, one WITH a real uploaded submission
//      file on disk so the teacher's "View" button opens the exact file.
//    • CourseWeightage configured as 3 quizzes + 2 assignments + mid +
//      final + lab tasks (Task 4 dynamic results table).
//    • Scheme of Study for semester 1 (Task 6 — scheme-driven course
//      dropdown in the redesigned New Distribution page).
//
//  IMPORTANT: This script ONLY inserts/updates TEST DATA. It changes no
//  application logic and touches no admissions data. Safe to re-run.
// ============================================================
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEPARTMENT = 'Department of Computing';

async function main() {
  // ---- 1. Resolve the demo LmsUsers (created by seedDemoAccounts.js) ----
  const [teacher, coordinator, student] = await Promise.all([
    prisma.lmsUser.findFirst({ where: { username: 'teacher_demo' } }),
    prisma.lmsUser.findFirst({ where: { username: 'coordinator_demo' } }),
    prisma.lmsUser.findFirst({ where: { username: 'student_demo' } }),
  ]);
  if (!teacher || !coordinator || !student) {
    throw new Error('Demo accounts missing — run: node prisma/seedDemoAccounts.js first');
  }

  // ---- 2. Program + semesters (reuse ADCS if present) ----
  const program = await prisma.lmsProgram.upsert({
    where: { code: 'ADCS' },
    update: { department: DEPARTMENT },
    create: { code: 'ADCS', name: 'Associate Degree in Computer Science', shortForm: 'ADCS', department: DEPARTMENT, totalSemesters: 4 },
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
  const sem1 = semesters[0];

  // ---- 3. Bind coordinator_demo to the department (drives scope) ----
  // LmsStudentProfile has several required fields; supply safe placeholders
  // on create (a coordinator profile is only used here for department scope).
  await prisma.lmsStudentProfile.upsert({
    where: { lmsUserId: coordinator.id },
    update: { department: DEPARTMENT, program: program.name, programShortForm: program.shortForm },
    create: {
      lmsUserId: coordinator.id, fullName: 'Demo Course Coordinator',
      fatherName: 'N/A', cnic: '00000-0000000-0', dateOfBirth: '1985-01-01', gender: 'N/A',
      program: program.name, programShortForm: program.shortForm, department: DEPARTMENT,
      rollNumber: 'COORD-DEMO', registrationNumber: 'COORD-DEMO', session: 'Fall 2026',
      enrollmentDate: new Date(),
    },
  });

  // ---- 4. Ensure student_demo profile is on this program/department ----
  const existingStudentProfile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: student.id } });
  if (existingStudentProfile) {
    await prisma.lmsStudentProfile.update({
      where: { lmsUserId: student.id },
      data: { department: DEPARTMENT, program: program.name, programShortForm: program.shortForm },
    });
  }

  // ---- 5. Courses: one LAB course + one regular course ----
  const labCourse = await prisma.lmsCourse.upsert({
    where: { code: 'CS-110L' },
    update: { programId: program.id, semesterId: sem1.id, hasLab: true },
    create: {
      code: 'CS-110L', title: 'Programming Fundamentals (with Lab)', creditHours: 4,
      hasLab: true, theoryCredit: 3, labCredit: 1, programId: program.id, semesterId: sem1.id,
    },
  });
  const regCourse = await prisma.lmsCourse.upsert({
    where: { code: 'CS-120' },
    update: { programId: program.id, semesterId: sem1.id },
    create: {
      code: 'CS-120', title: 'Discrete Structures', creditHours: 3,
      hasLab: false, theoryCredit: 3, programId: program.id, semesterId: sem1.id,
    },
  });
  // A couple of extra scheme courses (unassigned) so the redesigned
  // distribution page shows scheme-driven course choices to pick from.
  const extraDefs = [
    { code: 'CS-130', title: 'Object Oriented Programming', creditHours: 3 },
    { code: 'MT-110', title: 'Applied Mathematics', creditHours: 3 },
  ];
  const extras = [];
  for (const c of extraDefs) {
    extras.push(await prisma.lmsCourse.upsert({
      where: { code: c.code },
      update: { programId: program.id, semesterId: sem1.id },
      create: { ...c, hasLab: false, theoryCredit: c.creditHours, programId: program.id, semesterId: sem1.id },
    }));
  }

  // ---- 6. Scheme of Study for semester 1 (Task 6 course source) ----
  const scheme = await prisma.schemeOfStudy.findFirst({ where: { programId: program.id, isActive: true, isDeleted: false } });
  let activeScheme = scheme;
  if (!activeScheme) {
    activeScheme = await prisma.schemeOfStudy.create({
      data: { programId: program.id, version: 1, isActive: true, name: 'ADCS Scheme v1' },
    });
  }
  const schemeCourses = [labCourse, regCourse, ...extras];
  for (const c of schemeCourses) {
    const existing = await prisma.schemeCourse.findFirst({ where: { schemeId: activeScheme.id, courseId: c.id } });
    if (!existing) {
      await prisma.schemeCourse.create({ data: { schemeId: activeScheme.id, courseId: c.id, semester: 1 } });
    }
  }

  // ---- 7. Current term ----
  await prisma.academicTerm.updateMany({ data: { isCurrent: false } });
  const term = await prisma.academicTerm.upsert({
    where: { code: 'F26' },
    update: { isCurrent: true, isActive: true },
    create: { code: 'F26', title: 'Fall 2026', isCurrent: true, isActive: true, startDate: '2026-09-01', endDate: '2027-01-15' },
  });

  // ---- 8. Offerings assigned to teacher_demo ----
  const labOffering = await prisma.courseOffering.upsert({
    where: { courseId_termId: { courseId: labCourse.id, termId: term.id } },
    update: { teacherId: teacher.id, status: 'ACTIVE', isDeleted: false },
    create: { courseId: labCourse.id, termId: term.id, teacherId: teacher.id, status: 'ACTIVE' },
  });
  const regOffering = await prisma.courseOffering.upsert({
    where: { courseId_termId: { courseId: regCourse.id, termId: term.id } },
    update: { teacherId: teacher.id, status: 'ACTIVE', isDeleted: false },
    create: { courseId: regCourse.id, termId: term.id, teacherId: teacher.id, status: 'ACTIVE' },
  });

  // ---- 9. Section A + register student_demo ----
  const labSection = await prisma.section.upsert({
    where: { offeringId_name: { offeringId: labOffering.id, name: 'A' } },
    update: { teacherId: teacher.id },
    create: { offeringId: labOffering.id, name: 'A', capacity: 50, teacherId: teacher.id, room: 'CS-Lab-1' },
  });
  await prisma.section.upsert({
    where: { offeringId_name: { offeringId: regOffering.id, name: 'A' } },
    update: { teacherId: teacher.id },
    create: { offeringId: regOffering.id, name: 'A', capacity: 50, teacherId: teacher.id, room: 'Room-204' },
  });
  await prisma.courseRegistration.upsert({
    where: { offeringId_studentId: { offeringId: labOffering.id, studentId: student.id } },
    update: { status: 'ENROLLED', sectionId: labSection.id },
    create: { offeringId: labOffering.id, studentId: student.id, sectionId: labSection.id, status: 'ENROLLED' },
  });
  await prisma.courseRegistration.upsert({
    where: { offeringId_studentId: { offeringId: regOffering.id, studentId: student.id } },
    update: { status: 'ENROLLED' },
    create: { offeringId: regOffering.id, studentId: student.id, status: 'ENROLLED' },
  });

  // ---- 10. Weightage config: 3 quizzes + 2 assignments + mid + final + lab ----
  await prisma.courseWeightage.upsert({
    where: { courseId: labCourse.id },
    update: {
      midWeight: 20, finalWeight: 40, quizWeight: 10, assignmentWeight: 15, labTaskWeight: 15, semesterProjectWeight: 0,
      quizCount: 3, assignmentCount: 2, labTaskCount: 2,
      quizItems: JSON.stringify([{ label: 'Quiz 1', weight: 3.33 }, { label: 'Quiz 2', weight: 3.33 }, { label: 'Quiz 3', weight: 3.34 }]),
      assignmentItems: JSON.stringify([{ label: 'Assignment 1', weight: 7.5 }, { label: 'Assignment 2', weight: 7.5 }]),
    },
    create: {
      courseId: labCourse.id,
      midWeight: 20, finalWeight: 40, quizWeight: 10, assignmentWeight: 15, labTaskWeight: 15, semesterProjectWeight: 0,
      quizCount: 3, assignmentCount: 2, labTaskCount: 2,
      quizItems: JSON.stringify([{ label: 'Quiz 1', weight: 3.33 }, { label: 'Quiz 2', weight: 3.33 }, { label: 'Quiz 3', weight: 3.34 }]),
      assignmentItems: JSON.stringify([{ label: 'Assignment 1', weight: 7.5 }, { label: 'Assignment 2', weight: 7.5 }]),
    },
  });
  // Regular course: 3 quizzes + 2 assignments + mid + final (no lab).
  await prisma.courseWeightage.upsert({
    where: { courseId: regCourse.id },
    update: {
      midWeight: 25, finalWeight: 40, quizWeight: 15, assignmentWeight: 20, labTaskWeight: 0,
      quizCount: 3, assignmentCount: 2,
    },
    create: {
      courseId: regCourse.id,
      midWeight: 25, finalWeight: 40, quizWeight: 15, assignmentWeight: 20, labTaskWeight: 0,
      quizCount: 3, assignmentCount: 2,
    },
  });

  // ---- 11. Lab tasks (one graded-with-file, one ungraded) ----
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'lms-materials');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const subFileName = 'student_demo_lab1_submission.txt';
  const subFileOnDisk = `verify-${subFileName}`;
  fs.writeFileSync(
    path.join(uploadsDir, subFileOnDisk),
    'Demo Student — Lab Task 1 submission.\nThis is the EXACT file uploaded by student_demo for verifying the teacher View button.\n',
  );

  let labTask1 = await prisma.labTask.findFirst({ where: { offeringId: labOffering.id, title: 'Lab Task 1 — Hello World' } });
  if (!labTask1) {
    labTask1 = await prisma.labTask.create({
      data: {
        offeringId: labOffering.id, title: 'Lab Task 1 — Hello World',
        description: 'Write and run your first program.', totalMarks: 20, dueDate: '2026-09-25',
        isPublished: true, allowLate: true,
      },
    });
  }
  let labTask2 = await prisma.labTask.findFirst({ where: { offeringId: labOffering.id, title: 'Lab Task 2 — Loops' } });
  if (!labTask2) {
    labTask2 = await prisma.labTask.create({
      data: {
        offeringId: labOffering.id, title: 'Lab Task 2 — Loops',
        description: 'Implement looping constructs.', totalMarks: 20, dueDate: '2026-10-05',
        isPublished: true, allowLate: true,
      },
    });
  }

  // Student's submission for lab task 1 — carries the real file, ungraded so
  // the teacher can View it and then enter marks.
  await prisma.labTaskSubmission.upsert({
    where: { labTaskId_studentId: { labTaskId: labTask1.id, studentId: student.id } },
    update: { status: 'SUBMITTED', filePath: `/uploads/lms-materials/${subFileOnDisk}`, fileName: subFileName },
    create: {
      labTaskId: labTask1.id, studentId: student.id, status: 'SUBMITTED',
      content: 'Submitted via verification seed', filePath: `/uploads/lms-materials/${subFileOnDisk}`, fileName: subFileName,
    },
  });

  // ---- 12. A published CourseResult for the lab course (so the dynamic
  //          breakdown renders on the student Results page) ----
  await prisma.courseResult.upsert({
    where: { offeringId_studentId: { offeringId: labOffering.id, studentId: student.id } },
    update: {
      assignmentMarks: 0, assignmentMax: 100, quizMarks: 0, quizMax: 100,
      midMarks: 0, midMax: 100, finalMarks: 0, finalMax: 100,
      totalPercent: 0, letterGrade: 'F', gradePoints: 0, status: 'PUBLISHED', publishedAt: new Date(),
    },
    create: {
      offeringId: labOffering.id, studentId: student.id,
      assignmentMarks: 0, assignmentMax: 100, quizMarks: 0, quizMax: 100,
      midMarks: 0, midMax: 100, finalMarks: 0, finalMax: 100,
      totalPercent: 0, letterGrade: 'F', gradePoints: 0, status: 'PUBLISHED', publishedAt: new Date(),
    },
  });

  console.log('\n--- Verification scenario ready ---');
  console.log(`  Program        : ${program.name} (${program.shortForm}) · ${DEPARTMENT}`);
  console.log(`  Coordinator    : coordinator_demo → ${DEPARTMENT}`);
  console.log(`  Teacher        : teacher_demo → offerings: ${labCourse.code} (LAB), ${regCourse.code}`);
  console.log(`  Student        : student_demo → enrolled in ${labCourse.code}, ${regCourse.code}`);
  console.log(`  Lab tasks      : "${labTask1.title}" (has student file), "${labTask2.title}"`);
  console.log(`  Weightage      : ${labCourse.code} = 3 quizzes + 2 assignments + mid + final + lab`);
  console.log(`  Scheme (sem 1) : ${schemeCourses.map((c) => c.code).join(', ')}`);
  console.log('  Submission file:', `/uploads/lms-materials/${subFileOnDisk}`);
  console.log('-----------------------------------\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

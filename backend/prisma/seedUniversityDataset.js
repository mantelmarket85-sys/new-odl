const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const people = [
  'Ayesha Khan', 'Bilal Ahmed', 'Hira Shah', 'Usman Ali', 'Sana Malik',
  'Hamza Iqbal', 'Zainab Noor', 'Fahad Hussain', 'Maham Raza', 'Talha Siddiqui',
  'Iqra Javed', 'Saad Qureshi', 'Maryam Tariq', 'Danish Aslam', 'Laiba Sheikh',
  'Ahmed Rauf', 'Amna Farooq', 'Waleed Akram', 'Mehwish Anwar', 'Omer Saleem',
];

const programs = [
  {
    department: { name: 'Computer Science', code: 'CS' },
    program: { name: 'BS Computer Science', code: 'BSCS' },
    courses: [
      ['CS-101', 'Programming Fundamentals'], ['CS-102', 'Discrete Mathematics'],
      ['CS-103', 'Calculus and Analytical Geometry'], ['CS-104', 'Digital Logic Design'],
      ['CS-105', 'Information and Communication Technologies'], ['CS-106', 'English Composition'],
      ['CS-201', 'Object Oriented Programming'], ['CS-202', 'Data Structures and Algorithms'],
      ['CS-203', 'Database Management Systems'], ['CS-204', 'Linear Algebra'],
      ['CS-205', 'Computer Organization and Assembly Language'], ['CS-206', 'Probability and Statistics'],
      ['CS-301', 'Operating Systems'], ['CS-302', 'Computer Networks'],
      ['CS-303', 'Software Engineering'], ['CS-304', 'Web Application Development'],
      ['CS-305', 'Design and Analysis of Algorithms'], ['CS-306', 'Theory of Automata'],
      ['CS-401', 'Artificial Intelligence'], ['CS-402', 'Machine Learning'],
      ['CS-403', 'Information Security'], ['CS-404', 'Cloud Computing'],
      ['CS-405', 'Human Computer Interaction'], ['CS-406', 'Final Year Project'],
    ],
  },
  {
    department: { name: 'Business Administration', code: 'BBA' },
    program: { name: 'BBA', code: 'BBA' },
    courses: [
      ['BBA-101', 'Principles of Management'], ['BBA-102', 'Financial Accounting'],
      ['BBA-103', 'Microeconomics'], ['BBA-104', 'Business Communication'],
      ['BBA-105', 'Business Mathematics'], ['BBA-106', 'Introduction to Business'],
      ['BBA-201', 'Principles of Marketing'], ['BBA-202', 'Human Resource Management'],
      ['BBA-203', 'Macroeconomics'], ['BBA-204', 'Business Statistics'],
      ['BBA-205', 'Cost and Management Accounting'], ['BBA-206', 'Business Ethics'],
      ['BBA-301', 'Corporate Finance'], ['BBA-302', 'Organizational Behavior'],
      ['BBA-303', 'Business Law'], ['BBA-304', 'Operations Management'],
      ['BBA-305', 'Consumer Behavior'], ['BBA-306', 'Research Methods in Business'],
      ['BBA-401', 'Strategic Management'], ['BBA-402', 'Entrepreneurship'],
      ['BBA-403', 'International Business'], ['BBA-404', 'Management Information Systems'],
      ['BBA-405', 'Investment Analysis'], ['BBA-406', 'Business Project'],
    ],
  },
];

const designationPlan = [
  ...Array(4).fill('Lecturer'),
  ...Array(3).fill('Assistant Professor'),
  ...Array(2).fill('Associate Professor'),
  'Professor',
];

async function main() {
  const passwordHash = await bcrypt.hash('SeedAdmin@123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'test+superadmin@example.com' },
    update: { role: 'super_admin', isActive: true },
    create: {
      email: 'test+superadmin@example.com',
      username: 'seed_super_admin',
      password: passwordHash,
      role: 'super_admin',
      isActive: true,
      emailVerified: true,
    },
  });

  // Rebuild only this isolated test dataset; live Admission/LMS rows are untouched.
  await prisma.$transaction([
    prisma.seedStudent.deleteMany(),
    prisma.seedTeacher.deleteMany(),
    prisma.seedCourse.deleteMany(),
    prisma.seedSemester.deleteMany(),
    prisma.seedProgram.deleteMany(),
    prisma.seedDepartment.deleteMany(),
  ]);

  let studentNumber = 1;
  let teacherNumber = 1;

  for (const definition of programs) {
    const department = await prisma.seedDepartment.create({
      data: {
        name: definition.department.name,
        code: definition.department.code,
        createdById: superAdmin.id,
      },
    });
    const program = await prisma.seedProgram.create({
      data: {
        name: definition.program.name,
        code: definition.program.code,
        departmentId: department.id,
        durationSemesters: 4,
        totalCredits: 72,
      },
    });

    const semesters = [];
    for (let semesterNumber = 1; semesterNumber <= 4; semesterNumber += 1) {
      semesters.push(await prisma.seedSemester.create({
        data: { programId: program.id, semesterNumber, creditHours: 18 },
      }));
    }

    for (let index = 0; index < definition.courses.length; index += 1) {
      const semesterNumber = Math.floor(index / 6) + 1;
      const previousCourse = index % 6 === 0 ? null : definition.courses[index - 1][0];
      await prisma.seedCourse.create({
        data: {
          courseCode: definition.courses[index][0],
          title: definition.courses[index][1],
          creditHours: 3,
          semesterNumber,
          programId: program.id,
          prerequisite: semesterNumber === 1 ? null : previousCourse,
        },
      });
    }

    for (let semesterIndex = 0; semesterIndex < semesters.length; semesterIndex += 1) {
      for (let withinSemester = 1; withinSemester <= 20; withinSemester += 1) {
        const programSequence = semesterIndex * 20 + withinSemester;
        const name = people[(studentNumber - 1) % people.length];
        const suffix = studentNumber > people.length ? ` ${Math.ceil(studentNumber / people.length)}` : '';
        await prisma.seedStudent.create({
          data: {
            name: `${name}${suffix}`,
            rollNo: `${definition.department.code}-${definition.program.code}-2024-${String(programSequence).padStart(3, '0')}`,
            email: `test+student${studentNumber}@example.com`,
            departmentId: department.id,
            programId: program.id,
            semesterId: semesters[semesterIndex].id,
            status: 'active',
            enrollmentDate: new Date(Date.UTC(2024, 7 + semesterIndex, 15)),
          },
        });
        studentNumber += 1;
      }
    }

    for (let index = 0; index < 10; index += 1) {
      const name = people[(teacherNumber + 6) % people.length];
      const designation = designationPlan[index];
      await prisma.seedTeacher.create({
        data: {
          name: `Dr. ${name}${teacherNumber > people.length ? ` ${Math.ceil(teacherNumber / people.length)}` : ''}`,
          email: `test+teacher${teacherNumber}@example.com`,
          departmentId: department.id,
          designation,
          qualification: designation === 'Lecturer' ? (index % 2 === 0 ? 'MS' : 'PhD') : 'PhD',
          joiningDate: new Date(Date.UTC(2014 + index, index % 12, 1)),
        },
      });
      teacherNumber += 1;
    }
  }

  const [departments, programCount, semesters, students, teachers, courses] = await Promise.all([
    prisma.seedDepartment.findMany({ include: { programs: true, students: true, teachers: true } }),
    prisma.seedProgram.count(),
    prisma.seedSemester.findMany({ include: { students: true } }),
    prisma.seedStudent.count(),
    prisma.seedTeacher.count(),
    prisma.seedCourse.findMany(),
  ]);

  const invalidSemester = semesters.find((semester) => semester.creditHours !== 18 || semester.students.length !== 20);
  const creditsByProgram = courses.reduce((totals, course) => {
    totals[course.programId] = (totals[course.programId] || 0) + course.creditHours;
    return totals;
  }, {});
  const invalidCredits = Object.values(creditsByProgram).some((credits) => credits !== 72);
  const valid = departments.length === 2 && programCount === 2 && semesters.length === 8
    && students === 160 && teachers === 20 && courses.length === 48
    && !invalidSemester && !invalidCredits
    && departments.every((department) => department.programs.length === 1
      && department.students.length === 80 && department.teachers.length === 10
      && department.createdById === superAdmin.id);

  if (!valid) throw new Error('University seed validation failed');
  console.log(JSON.stringify({ departments: 2, programs: 2, semesters: 8, students: 160, teachers: 20, courses: 48, creditsPerProgram: 72, createdBy: superAdmin.email }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

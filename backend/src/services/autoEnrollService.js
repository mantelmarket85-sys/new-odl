// ============================================================
//  AUTOMATIC COURSE ENROLLMENT SERVICE  (Requirement #2)
//  ------------------------------------------------------------
//  Students never self-enroll. When a student is provisioned from
//  Admissions (or on first LMS login) the system:
//    1. Resolves the student's program from their LmsStudentProfile.
//    2. Determines the CURRENT semester number (default = 1 for a
//       freshly admitted student; advances as published results
//       complete earlier semesters).
//    3. Reads the approved Scheme of Study (LmsSemester -> LmsCourse)
//       for that program + semester.
//    4. Enrolls the student into every ACTIVE CourseOffering of those
//       scheme courses in the CURRENT AcademicTerm.
//
//  Fully idempotent — safe to run on every login. Never creates
//  duplicate registrations (CourseRegistration is unique per
//  offering+student). Only ADDS enrollments; never removes the
//  student's existing registrations.
// ============================================================
const prisma = require('../utils/prisma');

/**
 * Resolve the LmsProgram for a student profile (by shortForm or name).
 */
async function resolveProgram(profile) {
  if (!profile) return null;
  return prisma.lmsProgram.findFirst({
    where: {
      isDeleted: false,
      OR: [
        { shortForm: profile.programShortForm || '___none___' },
        { name: profile.program || '___none___' },
      ],
    },
  });
}

/**
 * Determine the student's CURRENT semester number within their program.
 *
 * Logic (real-data driven, no hardcoding):
 *  - Build the set of course codes the student has PASSED (published
 *    result with a passing grade / gradePoints > 0).
 *  - Walk the program's semesters in order. The current semester is the
 *    lowest-numbered semester that still has unfinished courses. If every
 *    course up to semester N is passed, the student is in semester N+1.
 *  - Brand-new student with no results → Semester 1.
 */
async function determineCurrentSemester(studentId, programId) {
  const semesters = await prisma.lmsSemester.findMany({
    where: { programId, isDeleted: false },
    include: { courses: { where: { isDeleted: false } } },
    orderBy: { number: 'asc' },
  });
  if (!semesters.length) return { number: 1, semesters: [] };

  // Passed course codes from published results.
  const results = await prisma.courseResult.findMany({
    where: { studentId, status: 'PUBLISHED' },
    include: { offering: { include: { course: true } } },
  });
  const passed = new Set();
  for (const r of results) {
    const code = r.offering?.course?.code;
    const isPass = (r.gradePoints != null ? r.gradePoints > 0 : true) && (r.letterGrade || '').toUpperCase() !== 'F';
    if (code && isPass) passed.add(code);
  }

  // Lowest semester with at least one not-yet-passed course.
  for (const s of semesters) {
    const allDone = s.courses.length > 0 && s.courses.every((c) => passed.has(c.code));
    if (!allDone) return { number: s.number, semesters };
  }
  // All defined semesters complete → cap at the last semester number.
  return { number: semesters[semesters.length - 1].number, semesters };
}

/**
 * Auto-enroll a single student into the scheme courses for their current
 * semester (in the current academic term). Returns a summary object.
 *
 * @param {string} studentId  - LmsUser.id (role Student)
 * @returns {Promise<{enrolled:number, semesterNumber:number|null, skipped:number, reason?:string}>}
 */
/**
 * Resolve the list of course IDs the student should be enrolled into for a
 * given semester number in a program. Additional Fixes §10 — the AUTHORITATIVE
 * source is the approved Scheme of Study (SchemeOfStudy → SchemeCourse, filtered
 * by semester) that the Course Coordinator prepared. If no active scheme exists
 * we fall back to the LmsSemester → LmsCourse template so the behaviour never
 * regresses for programs still using the older structure.
 *
 * @returns {Promise<{courseIds:number[], source:'scheme'|'semester-template'|'none'}>}
 */
async function resolveSemesterCourseIds(programId, semesterNumber, semesterTemplate) {
  // 1. Prefer the active approved Scheme of Study for this program.
  const scheme = await prisma.schemeOfStudy.findFirst({
    where: { programId, isActive: true, isDeleted: false },
    orderBy: [{ version: 'desc' }, { id: 'desc' }],
    include: {
      items: {
        where: { semester: semesterNumber },
        include: { course: true },
        orderBy: { orderIndex: 'asc' },
      },
    },
  });
  if (scheme && scheme.items.length) {
    const ids = scheme.items
      .filter((it) => it.course && !it.course.isDeleted)
      .map((it) => it.courseId);
    if (ids.length) return { courseIds: ids, source: 'scheme' };
  }

  // 2. Fall back to the numbered semester template's courses.
  if (semesterTemplate && semesterTemplate.courses && semesterTemplate.courses.length) {
    return { courseIds: semesterTemplate.courses.map((c) => c.id), source: 'semester-template' };
  }
  return { courseIds: [], source: 'none' };
}

async function autoEnrollStudent(studentId) {
  const profile = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: studentId } });
  if (!profile) return { enrolled: 0, semesterNumber: null, skipped: 0, reason: 'no_profile' };

  const program = await resolveProgram(profile);
  if (!program) return { enrolled: 0, semesterNumber: null, skipped: 0, reason: 'no_program' };

  const term = await prisma.academicTerm.findFirst({ where: { isCurrent: true, isActive: true } });
  if (!term) return { enrolled: 0, semesterNumber: null, skipped: 0, reason: 'no_current_term' };

  const { number: semesterNumber, semesters } = await determineCurrentSemester(studentId, program.id);
  const semester = semesters.find((s) => s.number === semesterNumber);

  // Additional Fixes §10 — resolve the courses for this semester from the
  // approved Course Scheme first (Course Coordinator's scheme), falling back
  // to the semester template. Works for EVERY department with isolation.
  const { courseIds, source } = await resolveSemesterCourseIds(program.id, semesterNumber, semester);
  if (!courseIds.length) {
    return { enrolled: 0, semesterNumber, skipped: 0, reason: 'no_scheme_courses' };
  }

  // Find ACTIVE offerings of those scheme courses in the current term.
  const offerings = await prisma.courseOffering.findMany({
    where: {
      termId: term.id,
      isDeleted: false,
      status: 'ACTIVE',
      courseId: { in: courseIds },
    },
    include: { sections: { where: { isDeleted: false }, orderBy: { id: 'asc' } } },
  });

  let enrolled = 0;
  let skipped = 0;
  for (const off of offerings) {
    // Already registered (any status)? Skip — never duplicate or override.
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.courseRegistration.findUnique({
      where: { offeringId_studentId: { offeringId: off.id, studentId } },
    });
    if (existing) { skipped += 1; continue; }

    // Default to the first available section (auto placement).
    const sectionId = off.sections.length ? off.sections[0].id : null;
    // eslint-disable-next-line no-await-in-loop
    await prisma.courseRegistration.create({
      data: {
        offeringId: off.id,
        sectionId,
        studentId,
        registrationType: 'REGULAR',
        status: 'ENROLLED',
      },
    });
    enrolled += 1;
  }

  // Additional Fixes §10 — flag the admissions Enrollment record so we know the
  // student has been auto-provisioned into their program's courses. This is the
  // signal the LMS uses to stop showing manual-enrollment prompts. We only flip
  // it once at least one registration exists (fresh enroll now, or from a prior
  // run) so a term with no offerings yet doesn't lock the flag prematurely.
  try {
    if (enrolled > 0 || skipped > 0) {
      await prisma.enrollment.updateMany({
        where: { lmsUserId: studentId },
        data: { lmsCoursesEnrolled: true },
      });
    }
  } catch (e) {
    console.warn('[auto-enroll] could not set lmsCoursesEnrolled:', e.message);
  }

  return { enrolled, semesterNumber, skipped, source, program: program.shortForm };
}

module.exports = { autoEnrollStudent, determineCurrentSemester, resolveProgram, resolveSemesterCourseIds };

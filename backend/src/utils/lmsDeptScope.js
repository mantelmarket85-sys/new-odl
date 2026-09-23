// ============================================================
//  LMS DEPARTMENT SCOPE HELPER
//  ------------------------------------------------------------
//  Focal Persons are DEPARTMENT-SPECIFIC. A focal person must only
//  ever see data belonging to their assigned department. This helper
//  resolves a single, consistent department "scope" for a given LMS
//  user (read from their LmsStudentProfile.department — the same
//  generic-staff-profile store used by the Course Coordinator role).
//
//  From the department name it derives the full set of:
//    - programIds      (LmsProgram in that department)
//    - programShortForms (e.g. ADCS) — used to match student profiles
//    - courseIds       (LmsCourse under those programs)
//    - offeringIds     (CourseOffering for those courses)
//    - studentIds      (LmsUser Students whose profile.department or
//                       programShortForm belongs to the department)
//    - teacherIds      (LmsUser Teachers who teach any of the offerings)
//
//  Every focal endpoint composes its Prisma `where` clauses from these
//  ID sets so the response is strictly limited to the focal person's
//  department. When a focal person has NO department set (legacy / not
//  yet configured) the scope is `unscoped:true` and the caller may fall
//  back to university-wide reads (back-compat). Provost (university
//  oversight) is always unscoped.
//
//  Additive & non-breaking: no schema change, no impact on other roles.
// ============================================================

const prisma = require('./prisma');

/**
 * Resolve the department a given LMS user is scoped to.
 * Returns the trimmed department string, or '' if none.
 */
async function getUserDepartment(userId) {
  const profile = await prisma.lmsStudentProfile
    .findUnique({ where: { lmsUserId: userId }, select: { department: true } })
    .catch(() => null);
  return profile && profile.department ? String(profile.department).trim() : '';
}

/**
 * Build the full department scope for a focal/coordinator user.
 *
 * @param {object} lmsUser  req.lmsUser (must have id + role)
 * @returns {Promise<object>} scope:
 *   {
 *     unscoped: boolean,        // true → no department restriction
 *     department: string|null,  // resolved department name
 *     programIds: number[],
 *     shortForms: string[],
 *     courseIds: number[],
 *     offeringIds: number[],
 *     studentIds: string[],
 *     teacherIds: string[],
 *   }
 */
/**
 * Resolve the authoritative set of LmsPrograms for a department, resilient to
 * free-text department-name mismatches between the admissions and LMS sides.
 *
 * Resolution order (union of all that match — never leaks other departments):
 *   A. Admissions Department (matched by exact/case-insensitive name) → its
 *      Program.code list → LmsPrograms with those codes. This is the CANONICAL
 *      link because syncProgramToLms mirrors admissions Programs by code.
 *   B. LmsPrograms whose own `department` string equals the department (case-
 *      insensitive, trimmed).
 *
 * Returns { programs: [{ id, shortForm, code }], deptNameVariants: string[] }.
 */
async function resolveDepartmentPrograms(department) {
  const target = String(department || '').trim().toLowerCase();
  if (!target) return [];

  const byId = new Map();
  const deptNameVariants = new Set([department]);

  // A. Canonical: admissions Department → program codes → LmsPrograms by code.
  try {
    const admDepts = await prisma.department.findMany({
      where: {},
      select: { name: true, programs: { select: { code: true } } },
    });
    const matchDept = admDepts.find((d) => String(d.name || '').trim().toLowerCase() === target);
    const codes = matchDept ? matchDept.programs.map((p) => p.code).filter(Boolean) : [];
    if (codes.length) {
      const lmsProgs = await prisma.lmsProgram.findMany({
        where: { isDeleted: false, code: { in: codes } },
        select: { id: true, shortForm: true, code: true, department: true },
      });
      lmsProgs.forEach((p) => {
        byId.set(p.id, { id: p.id, shortForm: p.shortForm, code: p.code });
        if (p.department) deptNameVariants.add(String(p.department).trim());
      });
    }
  } catch (e) {
    // non-fatal — fall through to name match
  }

  // B. Direct name match on LmsProgram.department (exact, case-insensitive).
  try {
    const all = await prisma.lmsProgram.findMany({
      where: { isDeleted: false },
      select: { id: true, shortForm: true, code: true, department: true },
    });
    all.forEach((p) => {
      if (String(p.department || '').trim().toLowerCase() === target) {
        byId.set(p.id, { id: p.id, shortForm: p.shortForm, code: p.code });
        if (p.department) deptNameVariants.add(String(p.department).trim());
      }
    });
  } catch (e) {
    // non-fatal
  }

  return { programs: [...byId.values()], deptNameVariants: [...deptNameVariants] };
}

async function buildDeptScope(lmsUser) {
  // Provost / QEC / ExamController get university-wide oversight — never scoped.
  if (['Provost', 'QECCoordinator', 'ExamController'].includes(lmsUser.role)) {
    return emptyScope(true, null);
  }

  const department = await getUserDepartment(lmsUser.id);
  if (!department) {
    // SECURE DEFAULT (Critical Requirement — Department Isolation is the
    // highest priority): a Focal Person / Course Coordinator who is NOT bound
    // to a department must see NOTHING — never the whole university. Returning
    // a scoped-but-empty result guarantees strict isolation instead of the old
    // insecure "unscoped = see everything" fallback that leaked other
    // departments' students.
    return emptyScope(false, null);
  }

  // 1. Programs in this department. Resolve ROBUSTLY so that data-entry
  //    variations in the free-text department string never break isolation
  //    (e.g. LmsProgram.department "Department of Computing" vs the admissions
  //    Department "Department of Computer Science"). We resolve the canonical
  //    program set via the admissions Department → its Program codes, then
  //    union with a direct name match. This keeps the scope authoritative.
  const { programs, deptNameVariants } = await resolveDepartmentPrograms(department);
  const programIds = programs.map((p) => p.id);
  const shortForms = [
    ...new Set(programs.flatMap((p) => [p.shortForm, p.code].filter(Boolean).map((s) => String(s).trim()))),
  ];

  // 2. Courses under those programs.
  const courses = programIds.length
    ? await prisma.lmsCourse.findMany({
        where: { isDeleted: false, programId: { in: programIds } },
        select: { id: true },
      })
    : [];
  const courseIds = courses.map((c) => c.id);

  // 3. Offerings for those courses.
  const offerings = courseIds.length
    ? await prisma.courseOffering.findMany({
        where: { courseId: { in: courseIds } },
        select: { id: true, teacherId: true },
      })
    : [];
  const offeringIds = offerings.map((o) => o.id);

  // 4. Teachers who teach any of those offerings.
  const teacherIds = [...new Set(offerings.map((o) => o.teacherId).filter(Boolean))];

  // 5. Students belonging to the department. A student profile may store
  //    the department either by full name (e.g. "Department of Computing")
  //    or by program short-form (e.g. "ADCS"). Match on either to be robust.
  const studentProfiles = await prisma.lmsStudentProfile.findMany({
    where: {
      OR: [
        { department: { in: deptNameVariants } },
        ...(shortForms.length ? [{ programShortForm: { in: shortForms } }] : []),
      ],
    },
    select: { lmsUserId: true },
  });
  let studentIds = studentProfiles.map((p) => p.lmsUserId);

  // Also include any student who is registered in one of the department's
  // offerings, even if their profile department string differs (data-entry
  // resilience). Keeps the scope inclusive of real enrolments.
  if (offeringIds.length) {
    const regStudents = await prisma.courseRegistration.findMany({
      where: { offeringId: { in: offeringIds } },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    studentIds = [...new Set([...studentIds, ...regStudents.map((r) => r.studentId)])];
  }

  // Restrict to actual Student-role users only.
  if (studentIds.length) {
    const realStudents = await prisma.lmsUser.findMany({
      where: { id: { in: studentIds }, role: 'Student' },
      select: { id: true },
    });
    studentIds = realStudents.map((s) => s.id);
  }

  return {
    unscoped: false,
    department,
    programIds,
    shortForms,
    courseIds,
    offeringIds,
    teacherIds,
    studentIds,
  };
}

/**
 * Resolve the set of INSTRUCTOR (Teacher) user-ids that belong to a
 * department. An instructor "belongs" to a department when their staff
 * profile (LmsStudentProfile, reused as a generic staff-profile store)
 * has a `department` matching one of the department's name variants, OR a
 * `programShortForm` matching one of the department's program short-forms.
 * We ALSO include any Teacher who currently teaches an offering in the
 * department (data-entry resilience — a borrowed/legacy teacher without a
 * department string on their profile still shows where they actually teach).
 *
 * This is intentionally BROADER than `scope.teacherIds` (which only lists
 * teachers with offerings) so the Instructors module can list a department's
 * own instructors even before any course is assigned to them.
 *
 * @param {object} scope  a scope object from buildDeptScope()
 * @returns {Promise<string[]>} teacher user-ids in this department
 */
async function resolveDepartmentInstructorIds(scope) {
  if (!scope || scope.unscoped) return null; // null → no restriction (governance)
  const deptNameVariants = scope.department ? [scope.department] : [];
  const shortForms = scope.shortForms || [];

  // Match teacher staff-profiles by department name OR program short-form.
  const orClauses = [];
  if (deptNameVariants.length) orClauses.push({ department: { in: deptNameVariants } });
  if (shortForms.length) orClauses.push({ programShortForm: { in: shortForms } });

  let ids = new Set(scope.teacherIds || []);
  if (orClauses.length) {
    const profs = await prisma.lmsStudentProfile.findMany({
      where: { OR: orClauses },
      select: { lmsUserId: true },
    });
    profs.forEach((p) => ids.add(p.lmsUserId));
  }

  if (!ids.size) return [];

  // Restrict to real Teacher-role accounts only.
  const teachers = await prisma.lmsUser.findMany({
    where: { id: { in: [...ids] }, role: 'Teacher' },
    select: { id: true },
  });
  return teachers.map((t) => t.id);
}

function emptyScope(unscoped, department) {
  return {
    unscoped,
    department,
    programIds: [],
    shortForms: [],
    courseIds: [],
    offeringIds: [],
    teacherIds: [],
    studentIds: [],
  };
}

// --- Prisma `where` fragment builders ---------------------------------
// Each returns an object suitable to spread into a `where`. When the scope
// is unscoped they return {} (no restriction).

/** Restrict an LmsProgram query to the department. */
function programWhere(scope) {
  if (scope.unscoped) return {};
  return { id: { in: scope.programIds.length ? scope.programIds : [-1] } };
}

/** Restrict an LmsCourse query to the department. */
function courseWhere(scope) {
  if (scope.unscoped) return {};
  return { id: { in: scope.courseIds.length ? scope.courseIds : [-1] } };
}

/** Restrict a CourseOffering query to the department. */
function offeringWhere(scope) {
  if (scope.unscoped) return {};
  return { id: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
}

/** Restrict a Student (LmsUser) query to the department. */
function studentWhere(scope) {
  if (scope.unscoped) return {};
  return { id: { in: scope.studentIds.length ? scope.studentIds : ['__none__'] } };
}

/** Restrict a Teacher (LmsUser) query to the department. */
function teacherWhere(scope) {
  if (scope.unscoped) return {};
  return { id: { in: scope.teacherIds.length ? scope.teacherIds : ['__none__'] } };
}

/** Restrict any model with an `offeringId` column to the department. */
function byOfferingWhere(scope) {
  if (scope.unscoped) return {};
  return { offeringId: { in: scope.offeringIds.length ? scope.offeringIds : [-1] } };
}

/** Restrict any model with a `studentId` column to the department. */
function byStudentWhere(scope) {
  if (scope.unscoped) return {};
  return { studentId: { in: scope.studentIds.length ? scope.studentIds : ['__none__'] } };
}

module.exports = {
  getUserDepartment,
  buildDeptScope,
  resolveDepartmentPrograms,
  resolveDepartmentInstructorIds,
  programWhere,
  courseWhere,
  offeringWhere,
  studentWhere,
  teacherWhere,
  byOfferingWhere,
  byStudentWhere,
};

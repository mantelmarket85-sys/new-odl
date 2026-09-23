// ============================================================
//  DEPARTMENT & PROGRAM MANAGEMENT (Master Prompt Section 1 & 2)
//  ------------------------------------------------------------
//  Only the SUPER ADMIN can create / edit / delete departments and
//  programs. The Director Admissions has READ-ONLY access (view
//  departments & programs). Coordinators may READ their own department.
//
//  While creating a department the Super Admin:
//    - names the department
//    - adds one or more programs (Full Name + Short Name) and, per program,
//      configures the Registration / Roll Number numbering scheme
//    - assigns three staff members (Admissions Coordinator, Course
//      Coordinator, Department Focal Person), each either an EXISTING user
//      or a brand-new account created inline.
//    - everything is saved immediately and synchronised with the LMS.
// ============================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { notify } = require('../utils/notify');
const { syncDepartmentToLms, syncProgramToLms, syncStaffToLms } = require('../services/admissionsSync');
const cache = require('../utils/cache');

const router = express.Router();
const prisma = new PrismaClient();

// Phase 2: drop cached public program/department lists after any write so the
// registration page reflects new/edited/removed programs within one request.
function invalidatePublicCaches() {
  cache.invalidatePrefix('programs');
  cache.invalidatePrefix('departments');
}

const STAFF_SELECT = { id: true, email: true, username: true, role: true, isActive: true };
const DEPT_INCLUDE = {
  coordinator: { select: STAFF_SELECT },
  courseCoordinator: { select: STAFF_SELECT },
  focalPerson: { select: STAFF_SELECT },
  // Phase 1 §2 — the full multi-staff set (all assigned users per role).
  staffAssignments: {
    include: { user: { select: STAFF_SELECT } },
    orderBy: { id: 'asc' },
  },
  programs: { orderBy: { name: 'asc' } },
};

// ------------------------------------------------------------
// GET /api/departments — list departments (with programs + staff)
//   Super Admin / Director → all departments (read)
//   Coordinator            → only their own department
// ------------------------------------------------------------
router.get('/', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    if (role === 'coordinator') {
      const dept = await prisma.department.findUnique({
        where: { coordinatorId: req.user.id },
        include: DEPT_INCLUDE,
      });
      return res.json({ departments: dept ? [dept] : [] });
    }
    if (!['director_admissions', 'admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const departments = await prisma.department.findMany({
      include: DEPT_INCLUDE,
      orderBy: { name: 'asc' },
    });
    // Additional Fixes §2 — Department Staff Separation. The Director Admissions
    // (Admissions Portal) may only see the Admissions Coordinator. The Course
    // Coordinator & Department Focal Person are LMS-side roles and must NOT be
    // exposed in the Admissions Portal. The Super Admin sees everyone.
    if (role === 'director_admissions' || role === 'admin') {
      const scrubbed = departments.map((d) => {
        const { courseCoordinator, focalPerson, courseCoordinatorId, focalPersonId, ...rest } = d;
        // Also strip LMS-side staff (CC/FP) from the multi-assignment set.
        rest.staffAssignments = (rest.staffAssignments || [])
          .filter((s) => s.staffRole === 'admissions_coordinator');
        return rest;
      });
      return res.json({ departments: scrubbed });
    }
    res.json({ departments });
  } catch (error) {
    console.error('List departments error:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// ------------------------------------------------------------
// GET /api/departments/staff-candidates — users available for staff
// assignment (for the "select existing user" dropdowns). Returns coordinators
// and other staff-eligible users. Super Admin only.
// ------------------------------------------------------------
router.get('/staff-candidates', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: ['coordinator', 'director_admissions', 'admin'] } },
      select: {
        id: true, email: true, username: true, role: true, staffRole: true, isActive: true,
        profile: { select: { firstName: true, lastName: true } },
        managedDepartment: { select: { id: true, name: true } },
        courseCoordinatedDepartment: { select: { id: true, name: true } },
        focalDepartment: { select: { id: true, name: true } },
      },
      orderBy: { username: 'asc' },
    });

    // Resolve the authoritative staff role of every candidate user. Priority:
    //   1. explicit `staffRole` tag (set on creation / backfilled)
    //   2. any department relation the user already holds
    //   3. a mirrored LmsUser role (CourseCoordinator / FocalPerson)
    // A user with none of the above defaults to admissions_coordinator (the
    // Admissions-Portal staff role). This guarantees STRICT role separation —
    // each dropdown lists ONLY users of its own role and never mixes them.
    const lmsStaff = await prisma.lmsUser.findMany({
      where: { role: { in: ['CourseCoordinator', 'FocalPerson'] } },
      select: { username: true, email: true, role: true },
    });
    const lmsRoleByKey = new Map();
    for (const l of lmsStaff) {
      const key = (l.username || l.email || '').toLowerCase();
      if (key) lmsRoleByKey.set(key, l.role);
    }
    const lmsRoleOf = (u) => {
      const byUser = u.username ? lmsRoleByKey.get(u.username.toLowerCase()) : null;
      const byEmail = u.email ? lmsRoleByKey.get(u.email.toLowerCase()) : null;
      const r = byUser || byEmail;
      if (r === 'CourseCoordinator') return 'course_coordinator';
      if (r === 'FocalPerson') return 'focal_person';
      return null;
    };
    const roleOf = (u) => {
      if (u.staffRole) return u.staffRole;
      if (u.managedDepartment) return 'admissions_coordinator';
      if (u.courseCoordinatedDepartment) return 'course_coordinator';
      if (u.focalDepartment) return 'focal_person';
      const lms = lmsRoleOf(u);
      if (lms) return lms;
      return 'admissions_coordinator';
    };

    const fullName = (u) => [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || null;
    const shape = (u) => ({
      id: u.id, email: u.email, username: u.username, role: u.role,
      staffRole: roleOf(u), fullName: fullName(u), isActive: u.isActive,
    });

    // STRICT: each dropdown shows ONLY users of that exact resolved role.
    const forRole = (role) => users.filter((u) => roleOf(u) === role).map(shape);
    const candidatesByRole = {
      admissions_coordinator: forRole('admissions_coordinator'),
      course_coordinator: forRole('course_coordinator'),
      focal_person: forRole('focal_person'),
    };

    res.json({ users: users.map(shape), coordinators: users.map(shape), candidatesByRole });
  } catch (error) {
    console.error('List staff candidates error:', error);
    res.status(500).json({ error: 'Failed to fetch staff candidates' });
  }
});

// Backward-compatible alias (older frontend called /coordinators).
router.get('/coordinators', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const coordinators = await prisma.user.findMany({
      where: { role: 'coordinator' },
      select: {
        id: true, email: true, username: true, isActive: true,
        managedDepartment: { select: { id: true, name: true } },
      },
      orderBy: { username: 'asc' },
    });
    res.json({ coordinators });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch coordinators' });
  }
});

// ------------------------------------------------------------
// Resolve a staff member for a role — either an existing user id or a new
// inline-created account. Returns { userId } or throws { status, error }.
//   spec = { mode: 'existing'|'new'|'none', userId?, newUser?: {name,email,username,password} }
//   role = the User.role to assign to a NEWLY created account.
//   staffRole = (Master Prompt §1) the department-staff role tag
//     (admissions_coordinator | course_coordinator | focal_person). Applied to
//     both new AND existing selected users so the dropdowns filter correctly.
// ------------------------------------------------------------
async function resolveStaff(spec, role, staffRole = null) {
  if (!spec || spec.mode === 'none' || (!spec.mode && !spec.userId && !spec.newUser)) {
    return { userId: null };
  }
  if (spec.mode === 'existing') {
    if (!spec.userId) throw { status: 400, error: 'Select an existing user for the staff role.' };
    const u = await prisma.user.findUnique({ where: { id: parseInt(spec.userId) } });
    if (!u) throw { status: 400, error: 'Selected staff user was not found.' };
    // Backfill / confirm the staffRole tag on the chosen existing user so it
    // stays visible in the correct dropdown next time (non-breaking — role
    // itself is left untouched).
    if (staffRole && u.staffRole !== staffRole) {
      await prisma.user.update({ where: { id: u.id }, data: { staffRole } });
    }
    return { userId: u.id, plainPassword: null };
  }
  // mode === 'new'
  const nu = spec.newUser || {};
  if (!nu.email || !nu.username || !nu.password) {
    throw { status: 400, error: 'New staff member needs name, email, username and a temporary password.' };
  }
  const email = String(nu.email).toLowerCase().trim();
  const username = String(nu.username).toLowerCase().trim();
  const [byEmail, byUser] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { username } }),
  ]);
  if (byEmail) throw { status: 400, error: `A user with email ${email} already exists.` };
  if (byUser) throw { status: 400, error: `The username "${username}" is already taken.` };
  if (String(nu.password).length < 6) throw { status: 400, error: 'Temporary password must be at least 6 characters.' };
  const hash = await bcrypt.hash(nu.password, 10);
  const created = await prisma.user.create({
    data: {
      email, username, password: hash, role, staffRole,
      emailVerified: true, isActive: true,
      mustChangePassword: true,
      termsAccepted: true, termsAcceptedAt: new Date(),
      privacyAccepted: true, privacyAcceptedAt: new Date(),
    },
  });
  // Return the plaintext temp password so LMS staff provisioning can reuse it.
  return { userId: created.id, plainPassword: nu.password };
}

// ------------------------------------------------------------
// MULTI-STAFF ASSIGNMENT (Phase 1 §2)
// ------------------------------------------------------------
// A department may hold MANY staff per role. The frontend may send, per role,
// either the legacy single spec { mode, userId?, newUser? } OR a `*List` array:
//   admissionsCoordinators: [{ mode:'existing', userId } | { mode:'new', newUser }]
// This resolves every entry to a userId (creating inline accounts as needed),
// returning [{ userId, plainPassword }]. The legacy single field is treated as
// the first entry so old clients keep working unchanged.
async function resolveStaffList(list, singleSpec, role, staffRole) {
  const specs = [];
  if (Array.isArray(list)) specs.push(...list);
  else if (singleSpec) specs.push(singleSpec);
  const resolved = [];
  const seen = new Set();
  for (const spec of specs) {
    if (!spec || spec.mode === 'none') continue;
    // Skip empty "new" specs (no data entered).
    if (spec.mode === 'new') {
      const n = spec.newUser || {};
      if (!n.email && !n.username && !n.name) continue;
    }
    if (spec.mode === 'existing' && !spec.userId) continue;
    // eslint-disable-next-line no-await-in-loop
    const r = await resolveStaff(spec, role, staffRole);
    if (r.userId && !seen.has(r.userId)) {
      seen.add(r.userId);
      resolved.push(r);
    }
  }
  return resolved;
}

// Persist the complete DepartmentStaff set for a role, then mirror the FIRST
// entry to the legacy single FK column (the department "primary" of that role).
// Returns { primaryId, entries }.
async function persistDepartmentStaff(departmentId, staffRole, relationFk, entries) {
  // Replace the existing set for this (department, role).
  await prisma.departmentStaff.deleteMany({ where: { departmentId, staffRole } });
  for (const e of entries) {
    // eslint-disable-next-line no-await-in-loop
    await prisma.departmentStaff.create({
      data: { departmentId, userId: e.userId, staffRole },
    }).catch((err) => {
      if (err.code !== 'P2002') throw err; // ignore duplicate
    });
  }
  const primaryId = entries.length ? entries[0].userId : null;
  return { primaryId, entries };
}

// Build a unique program code from the short form.
async function makeProgramCode(shortForm) {
  let base = String(shortForm).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PROG';
  let code = base;
  let i = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.program.findUnique({ where: { code } })) code = `${base}-${i++}`;
  return code;
}

// Normalise per-program numbering config with sensible defaults.
function normaliseNumbering(p) {
  const serialSource = p.startSerial != null ? p.startSerial : p.regNextSerial;
  return {
    instituteCode: String(p.instituteCode || '001').trim() || '001',
    facultyCode: String(p.facultyCode || 'C').trim().toUpperCase() || 'C',
    deptCode: String(p.deptCode || '01').trim() || '01',
    programNumericCode: String(p.programNumericCode || '06').trim() || '06',
    regNextSerial: (serialSource != null && parseInt(serialSource) >= 1)
      ? parseInt(serialSource)
      : 101,
    regConfigured: true,
  };
}

// Normalise per-program merit criteria (Additional Fixes §3). Only applied
// when the caller sends at least one weight; otherwise the schema defaults
// (30/40/30) are kept. Interview weight of 0 is fully supported.
function normaliseMerit(p) {
  const has = ['matricWeight', 'fscWeight', 'interviewWeight'].some((k) => p[k] !== undefined && p[k] !== null && p[k] !== '');
  if (!has) return {};
  const num = (v, def) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : def;
  };
  return {
    matricWeight: num(p.matricWeight, 30),
    fscWeight: num(p.fscWeight, 40),
    interviewWeight: num(p.interviewWeight, 30),
  };
}

// ------------------------------------------------------------
// POST /api/departments — SUPER ADMIN creates a department with programs,
// per-program numbering config, and three assigned staff members.
// Body: {
//   name, faculty?,
//   programs: [{ name, shortForm, duration?, semesters?,
//                instituteCode?, facultyCode?, deptCode?, programNumericCode?, startSerial? }],
//   admissionsCoordinator: { mode, userId?, newUser? },
//   courseCoordinator:     { mode, userId?, newUser? },
//   focalPerson:           { mode, userId?, newUser? }
// }
// ------------------------------------------------------------
router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const {
      name, faculty,
      programs = [],
      admissionsCoordinator, courseCoordinator, focalPerson,
      // Legacy single-coordinator fields (back-compat).
      coordinatorMode, coordinatorId, newCoordinator,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Department name is required.' });
    }
    const cleanName = String(name).trim();

    const existsDept = await prisma.department.findUnique({ where: { name: cleanName } });
    if (existsDept) return res.status(400).json({ error: 'A department with this name already exists.' });

    if (!Array.isArray(programs) || programs.length === 0) {
      return res.status(400).json({ error: 'Add at least one program for this department.' });
    }
    for (const p of programs) {
      if (!p.name || !String(p.name).trim()) return res.status(400).json({ error: 'Each program needs a full name.' });
      if (!p.shortForm || !String(p.shortForm).trim()) return res.status(400).json({ error: 'Each program needs a short name.' });
    }

    // Resolve the three staff roles. Fall back to the legacy single-coordinator
    // payload for the Admissions Coordinator when the new field isn't provided.
    let admSpec = admissionsCoordinator;
    if (!admSpec && (coordinatorMode || coordinatorId || newCoordinator)) {
      admSpec = {
        mode: coordinatorMode,
        userId: coordinatorId,
        newUser: newCoordinator ? { ...newCoordinator, name: newCoordinator.username } : undefined,
      };
    }

    // Resolve MULTIPLE staff per role (Phase 1 §2). Accepts either the legacy
    // single spec or the new `*List` arrays. Each entry may be an existing user
    // or a brand-new inline account.
    let admList, ccList, fpList;
    try {
      admList = await resolveStaffList(req.body.admissionsCoordinators, admSpec, 'coordinator', 'admissions_coordinator');
      ccList = await resolveStaffList(req.body.courseCoordinators, courseCoordinator, 'coordinator', 'course_coordinator');
      fpList = await resolveStaffList(req.body.focalPersons, focalPerson, 'coordinator', 'focal_person');
    } catch (e) {
      if (e && e.status) return res.status(e.status).json({ error: e.error });
      throw e;
    }

    // The legacy single FK columns are @unique (one department per user per
    // role). Guard the PRIMARY (first) of each list against clashes; additional
    // staff live only in the DepartmentStaff join table so they are not limited
    // by the single-FK uniqueness.
    const guardUnique = async (userId, relation, label) => {
      if (!userId) return;
      const clash = await prisma.department.findFirst({ where: { [relation]: userId } });
      if (clash) throw { status: 400, error: `Selected ${label} is already the primary for "${clash.name}".` };
    };
    const admPrimary = admList[0]?.userId || null;
    const ccPrimary = ccList[0]?.userId || null;
    const fpPrimary = fpList[0]?.userId || null;
    try {
      await guardUnique(admPrimary, 'coordinatorId', 'Admissions Coordinator');
      await guardUnique(ccPrimary, 'courseCoordinatorId', 'Course Coordinator');
      await guardUnique(fpPrimary, 'focalPersonId', 'Department Focal Person');
    } catch (e) {
      if (e && e.status) return res.status(e.status).json({ error: e.error });
      throw e;
    }

    const dept = await prisma.department.create({
      data: {
        name: cleanName,
        faculty: faculty ? String(faculty).trim() : null,
        coordinatorId: admPrimary,
        courseCoordinatorId: ccPrimary,
        focalPersonId: fpPrimary,
        isActive: true,
      },
    });

    // Persist the full multi-assignment set to the join table.
    await persistDepartmentStaff(dept.id, 'admissions_coordinator', 'coordinatorId', admList);
    await persistDepartmentStaff(dept.id, 'course_coordinator', 'courseCoordinatorId', ccList);
    await persistDepartmentStaff(dept.id, 'focal_person', 'focalPersonId', fpList);

    // Back-compat aliases used later in this handler.
    const admStaff = { userId: admPrimary };
    const ccStaff = { userId: ccPrimary, plainPassword: ccList[0]?.plainPassword || null };
    const fpStaff = { userId: fpPrimary, plainPassword: fpList[0]?.plainPassword || null };

    const createdPrograms = [];
    for (const p of programs) {
      const code = await makeProgramCode(p.shortForm);
      const numbering = normaliseNumbering(p);
      const merit = normaliseMerit(p);
      const program = await prisma.program.create({
        data: {
          name: String(p.name).trim(),
          shortForm: String(p.shortForm).trim().toUpperCase(),
          code,
          departmentId: dept.id,
          duration: p.duration || '2 Years',
          semesters: p.semesters ? parseInt(p.semesters) : 4,
          fee: 0,
          minMarksPercent: 50,
          isActive: true,
          ...numbering,
          ...merit,
        },
      });
      createdPrograms.push(program);
    }

    // Notify assigned staff.
    const notifyStaff = async (userId, roleLabel) => {
      if (!userId) return;
      await notify(userId, 'Department Assignment',
        `You have been assigned as the ${roleLabel} for ${cleanName}.`).catch(() => {});
    };
    await notifyStaff(admStaff.userId, 'Admissions Coordinator');
    await notifyStaff(ccStaff.userId, 'Course Coordinator');
    await notifyStaff(fpStaff.userId, 'Department Focal Person');

    // Automatic LMS synchronisation (Master Prompt Section 9 & 11).
    try {
      await syncDepartmentToLms(dept, createdPrograms);
    } catch (e) {
      console.error('[departments] LMS sync failed (non-fatal):', e.message);
    }
    // Course Coordinator & Focal Person become LMS users (Additional Fixes §2).
    try {
      const deptWithStaff = await prisma.department.findUnique({
        where: { id: dept.id },
        include: { courseCoordinator: true, focalPerson: true },
      });
      await syncStaffToLms(deptWithStaff, {
        courseCoordinator: ccStaff.plainPassword,
        focalPerson: fpStaff.plainPassword,
      });
    } catch (e) {
      console.error('[departments] LMS staff sync failed (non-fatal):', e.message);
    }

    const full = await prisma.department.findUnique({ where: { id: dept.id }, include: DEPT_INCLUDE });
    invalidatePublicCaches();
    res.status(201).json({ message: 'Department created and synced with LMS', department: full });
  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ error: 'Failed to create department' });
  }
});

// ------------------------------------------------------------
// PUT /api/departments/:id — SUPER ADMIN edits department name/faculty/staff/active
// Body may include: name, faculty, isActive,
//   admissionsCoordinator/courseCoordinator/focalPerson { mode, userId?, newUser? }
// ------------------------------------------------------------
router.put('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dept = await prisma.department.findUnique({ where: { id } });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const data = {};
    if (req.body.name != null) {
      const nm = String(req.body.name).trim();
      if (!nm) return res.status(400).json({ error: 'Department name cannot be empty.' });
      const clash = await prisma.department.findFirst({ where: { name: nm, id: { not: id } } });
      if (clash) return res.status(400).json({ error: 'Another department already uses this name.' });
      data.name = nm;
    }
    if (req.body.faculty !== undefined) data.faculty = req.body.faculty ? String(req.body.faculty).trim() : null;
    if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive;

    // Track plaintext temp passwords of inline-created CC/FP so we can
    // provision matching LMS accounts (Additional Fixes §2).
    const staffCreds = {};

    // ------------------------------------------------------------
    // MULTI-STAFF REASSIGNMENT (Phase 1 §2) — mirror of the POST handler.
    // Each role may hold MANY staff. The frontend may send, per role, either
    // the legacy single spec { mode, userId?, newUser? } OR a `*List` array.
    // We only touch a role when the client actually sends something for it, so
    // partial edits (e.g. only renaming the department) leave staff untouched.
    // ------------------------------------------------------------
    const roleSpecs = [
      { key: 'admissions_coordinator', relation: 'coordinatorId', label: 'Admissions Coordinator',
        list: req.body.admissionsCoordinators,
        single: req.body.admissionsCoordinator !== undefined
          ? req.body.admissionsCoordinator
          : (req.body.coordinatorId !== undefined
              ? (req.body.coordinatorId ? { mode: 'existing', userId: req.body.coordinatorId } : { mode: 'none' })
              : undefined) },
      { key: 'course_coordinator', relation: 'courseCoordinatorId', label: 'Course Coordinator',
        list: req.body.courseCoordinators, single: req.body.courseCoordinator },
      { key: 'focal_person', relation: 'focalPersonId', label: 'Department Focal Person',
        list: req.body.focalPersons, single: req.body.focalPerson },
    ];

    // Resolve every role that the client sent. `resolvedByRole[key] = { entries, touched }`.
    const resolvedByRole = {};
    try {
      for (const spec of roleSpecs) {
        const touched = Array.isArray(spec.list) || spec.single !== undefined;
        if (!touched) { resolvedByRole[spec.key] = { entries: [], touched: false }; continue; }
        // eslint-disable-next-line no-await-in-loop
        const entries = await resolveStaffList(spec.list, spec.single, 'coordinator', spec.key);
        // Guard the PRIMARY (first) entry against the legacy single-FK unique
        // constraint held by OTHER departments. Extra staff live only in the
        // join table so they are not bound by that uniqueness.
        const primary = entries[0]?.userId || null;
        if (primary) {
          // eslint-disable-next-line no-await-in-loop
          const clash = await prisma.department.findFirst({ where: { [spec.relation]: primary, id: { not: id } } });
          if (clash) throw { status: 400, error: `Selected ${spec.label} is already the primary for "${clash.name}".` };
        }
        resolvedByRole[spec.key] = { entries, touched: true };
        data[spec.relation] = primary;
        if (spec.key === 'course_coordinator') staffCreds.courseCoordinator = entries[0]?.plainPassword || null;
        if (spec.key === 'focal_person') staffCreds.focalPerson = entries[0]?.plainPassword || null;
      }
    } catch (e) {
      if (e && e.status) return res.status(e.status).json({ error: e.error });
      throw e;
    }

    await prisma.department.update({ where: { id }, data });

    // Persist the full multi-assignment set for each role the client touched.
    for (const spec of roleSpecs) {
      const r = resolvedByRole[spec.key];
      if (!r || !r.touched) continue;
      // eslint-disable-next-line no-await-in-loop
      await persistDepartmentStaff(id, spec.key, spec.relation, r.entries);
    }

    // Re-provision LMS staff accounts for Course Coordinator & Focal Person
    // whenever they are (re)assigned (Additional Fixes §2).
    try {
      const deptWithStaff = await prisma.department.findUnique({
        where: { id }, include: { courseCoordinator: true, focalPerson: true },
      });
      await syncStaffToLms(deptWithStaff, staffCreds);
    } catch (e) {
      console.error('[departments] LMS staff re-sync failed (non-fatal):', e.message);
    }

    // ------------------------------------------------------------
    // PROGRAM SYNC (Additional Fixes §1). Previously the PUT handler
    // ignored the `programs` array, so edits to program name / short
    // name / numbering / merit criteria were silently discarded and the
    // old values "reappeared". We now fully reconcile the programs:
    //   • existing programs (with id)  → UPDATE editable fields
    //   • new programs (no id)         → CREATE under this department
    // Deletion of programs is handled by the dedicated delete endpoint
    // to stay safe with applications, so we do NOT auto-delete here.
    // ------------------------------------------------------------
    if (Array.isArray(req.body.programs)) {
      const updatedPrograms = [];
      for (const p of req.body.programs) {
        if (!p || !p.name || !String(p.name).trim() || !p.shortForm || !String(p.shortForm).trim()) continue;
        const numbering = normaliseNumbering(p);
        const merit = normaliseMerit(p);
        if (p.id) {
          const existing = await prisma.program.findUnique({ where: { id: parseInt(p.id) } });
          if (existing && existing.departmentId === id) {
            const prog = await prisma.program.update({
              where: { id: parseInt(p.id) },
              data: {
                name: String(p.name).trim(),
                shortForm: String(p.shortForm).trim().toUpperCase(),
                ...(p.duration ? { duration: String(p.duration) } : {}),
                ...(p.semesters ? { semesters: parseInt(p.semesters) } : {}),
                ...numbering,
                ...merit,
              },
            });
            updatedPrograms.push(prog);
          }
        } else {
          const code = await makeProgramCode(p.shortForm);
          const prog = await prisma.program.create({
            data: {
              name: String(p.name).trim(),
              shortForm: String(p.shortForm).trim().toUpperCase(),
              code,
              departmentId: id,
              duration: p.duration || '2 Years',
              semesters: p.semesters ? parseInt(p.semesters) : 4,
              fee: 0, minMarksPercent: 50, isActive: true,
              ...numbering, ...merit,
            },
          });
          updatedPrograms.push(prog);
        }
      }
      // Re-sync the department (and its programs) to the LMS so the change
      // is reflected everywhere immediately (Additional Fixes §1 & §2).
      try {
        const deptForSync = await prisma.department.findUnique({ where: { id }, include: { programs: true } });
        await syncDepartmentToLms(deptForSync, deptForSync?.programs || updatedPrograms);
      } catch (e) {
        console.error('[departments] LMS re-sync after edit failed (non-fatal):', e.message);
      }
    }

    const full = await prisma.department.findUnique({ where: { id }, include: DEPT_INCLUDE });
    invalidatePublicCaches();
    res.json({ message: 'Department updated', department: full });
  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// ------------------------------------------------------------
// DELETE /api/departments/:id — SUPER ADMIN deletes a department (only when it
// has no programs with applications — defensive). Non-destructive by default:
// deactivates when it still has data, hard-deletes when empty.
// ------------------------------------------------------------
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dept = await prisma.department.findUnique({
      where: { id },
      include: { programs: { include: { applications: { select: { id: true }, take: 1 } } } },
    });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const hasApplications = dept.programs.some((p) => p.applications.length > 0);
    if (hasApplications) {
      await prisma.department.update({ where: { id }, data: { isActive: false } });
      invalidatePublicCaches();
      return res.json({ message: 'Department has applications; it was deactivated instead of deleted.' });
    }

    // Delete programs then the department.
    await prisma.program.deleteMany({ where: { departmentId: id } });
    await prisma.department.delete({ where: { id } });
    invalidatePublicCaches();
    res.json({ message: 'Department deleted' });
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

// ------------------------------------------------------------
// POST /api/departments/:id/programs — SUPER ADMIN adds a program (with its
// own numbering config) to a department.
// ------------------------------------------------------------
router.post('/:id/programs', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dept = await prisma.department.findUnique({ where: { id } });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const { name, shortForm } = req.body;
    if (!name || !shortForm) return res.status(400).json({ error: 'Program full name and short name are required.' });

    const code = await makeProgramCode(shortForm);
    const numbering = normaliseNumbering(req.body);
    const merit = normaliseMerit(req.body);
    const program = await prisma.program.create({
      data: {
        name: String(name).trim(),
        shortForm: String(shortForm).trim().toUpperCase(),
        code,
        departmentId: id,
        duration: req.body.duration || '2 Years',
        semesters: req.body.semesters ? parseInt(req.body.semesters) : 4,
        fee: 0, minMarksPercent: 50,
        isActive: true,
        ...numbering,
        ...merit,
      },
    });
    try { await syncProgramToLms(program, dept); } catch (e) { console.error('[programs] LMS sync failed:', e.message); }
    invalidatePublicCaches();
    res.status(201).json({ message: 'Program added and synced with LMS', program });
  } catch (error) {
    console.error('Add program error:', error);
    res.status(500).json({ error: 'Failed to add program' });
  }
});

// ------------------------------------------------------------
// PUT /api/departments/programs/:programId — SUPER ADMIN edits a program,
// including its numbering config.
// ------------------------------------------------------------
router.put('/programs/:programId', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const pid = parseInt(req.params.programId);
    const program = await prisma.program.findUnique({ where: { id: pid } });
    if (!program) return res.status(404).json({ error: 'Program not found' });

    const data = {};
    if (req.body.name != null) data.name = String(req.body.name).trim();
    if (req.body.shortForm != null) data.shortForm = String(req.body.shortForm).trim().toUpperCase();
    if (req.body.duration != null) data.duration = String(req.body.duration);
    if (req.body.semesters != null) data.semesters = parseInt(req.body.semesters);
    if (req.body.isActive !== undefined) data.isActive = !!req.body.isActive;
    // Numbering config (each optional).
    if (req.body.instituteCode != null) data.instituteCode = String(req.body.instituteCode).trim();
    if (req.body.facultyCode != null) data.facultyCode = String(req.body.facultyCode).trim().toUpperCase();
    if (req.body.deptCode != null) data.deptCode = String(req.body.deptCode).trim();
    if (req.body.programNumericCode != null) data.programNumericCode = String(req.body.programNumericCode).trim();
    if (req.body.startSerial != null && parseInt(req.body.startSerial) >= 1) {
      data.regNextSerial = parseInt(req.body.startSerial);
    } else if (req.body.regNextSerial != null && parseInt(req.body.regNextSerial) >= 1) {
      data.regNextSerial = parseInt(req.body.regNextSerial);
    }
    if (Object.keys(data).some((k) => ['instituteCode', 'facultyCode', 'deptCode', 'programNumericCode', 'regNextSerial'].includes(k))) {
      data.regConfigured = true;
    }
    // Per-program merit criteria (Additional Fixes §3). Interview weight 0 OK.
    const meritEdit = normaliseMerit(req.body);
    Object.assign(data, meritEdit);

    const updated = await prisma.program.update({ where: { id: pid }, data });
    invalidatePublicCaches();
    res.json({ message: 'Program updated', program: updated });
  } catch (error) {
    console.error('Update program error:', error);
    res.status(500).json({ error: 'Failed to update program' });
  }
});

// ------------------------------------------------------------
// DELETE /api/departments/programs/:programId — SUPER ADMIN deletes a program
// (deactivates when it has applications).
// ------------------------------------------------------------
router.delete('/programs/:programId', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const pid = parseInt(req.params.programId);
    const program = await prisma.program.findUnique({
      where: { id: pid },
      include: { applications: { select: { id: true }, take: 1 } },
    });
    if (!program) return res.status(404).json({ error: 'Program not found' });
    if (program.applications.length > 0) {
      await prisma.program.update({ where: { id: pid }, data: { isActive: false } });
      invalidatePublicCaches();
      return res.json({ message: 'Program has applications; it was deactivated instead of deleted.' });
    }
    await prisma.program.delete({ where: { id: pid } });
    invalidatePublicCaches();
    res.json({ message: 'Program deleted' });
  } catch (error) {
    console.error('Delete program error:', error);
    res.status(500).json({ error: 'Failed to delete program' });
  }
});

module.exports = router;

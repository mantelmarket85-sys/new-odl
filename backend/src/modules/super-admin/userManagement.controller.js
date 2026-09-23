// ============================================================
//  SUPER ADMIN — USER MANAGEMENT CONTROLLER
//  Create / list / deactivate / reactivate / reset-password / role
//  assignment / unlock / login-history for BOTH user systems:
//    - Admissions `User` (super_admin, director_admissions, coordinator,
//      student, teacher, lms_admin)
//    - LMS `LmsUser` (Student, Teacher, CourseCoordinator, FocalPerson,
//      ExamController, QECCoordinator, Provost, SuperAdmin)
//  All writes are logged via logSaActivity. Nothing in the existing
//  admissions/LMS auth files is modified.
// ============================================================
const bcrypt = require('bcryptjs');
const prisma = require('../../utils/prisma');
const { randomPassword, logSaActivity } = require('./superAdmin.service');

const ADMISSIONS_ROLES = {
  super_admin: 'Super Admin',
  director_admissions: 'Director Admissions',
  coordinator: 'Admissions Coordinator',
  student: 'Student',
  teacher: 'Teacher',
  lms_admin: 'LMS Admin',
};
const LMS_ROLES = {
  Student: 'Student',
  Teacher: 'Teacher',
  CourseCoordinator: 'Course Coordinator',
  FocalPerson: 'Focal Person',
  ExamController: 'Exam Controller',
  QECCoordinator: 'QEC Coordinator',
  Provost: 'Provost',
  SuperAdmin: 'Super Admin',
};

// ---- List all users (both systems, unified shape) -----------------------
async function listUsers(req, res) {
  try {
    const { system, role, q } = req.query;
    const out = [];

    if (!system || system === 'admissions') {
      const where = {};
      if (role && ADMISSIONS_ROLES[role]) where.role = role;
      if (q) where.OR = [{ email: { contains: q } }, { username: { contains: q } }];
      const users = await prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, username: true, role: true, isActive: true,
          isLocked: true, lockedUntil: true, lastLoginAt: true, lastLoginIp: true,
          failedLoginAttempts: true, createdAt: true,
          profile: { select: { firstName: true, lastName: true } },
          managedDepartment: { select: { name: true } },
        },
      });
      users.forEach((u) => out.push({
        system: 'admissions',
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role,
        roleLabel: ADMISSIONS_ROLES[u.role] || u.role,
        isActive: u.isActive,
        isLocked: u.isLocked || (u.lockedUntil && new Date(u.lockedUntil) > new Date()),
        lastLoginAt: u.lastLoginAt,
        lastLoginIp: u.lastLoginIp,
        failedLoginAttempts: u.failedLoginAttempts,
        department: u.managedDepartment?.name || null,
        fullName: [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || null,
        createdAt: u.createdAt,
      }));
    }

    if (!system || system === 'lms') {
      const where = {};
      if (role && LMS_ROLES[role]) where.role = role;
      if (q) where.OR = [{ email: { contains: q } }, { username: { contains: q } }];
      const lms = await prisma.lmsUser.findMany({
        where, orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, username: true, role: true, isActive: true,
          lockedUntil: true, lastLoginAt: true, failedLoginAttempts: true,
          mustChangePassword: true, createdAt: true, linkedRollNumber: true,
          profile: { select: { department: true, fullName: true } },
        },
      });
      lms.forEach((u) => out.push({
        system: 'lms',
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role,
        roleLabel: LMS_ROLES[u.role] || u.role,
        isActive: u.isActive,
        isLocked: !!(u.lockedUntil && new Date(u.lockedUntil) > new Date()),
        lastLoginAt: u.lastLoginAt,
        failedLoginAttempts: u.failedLoginAttempts,
        mustChangePassword: u.mustChangePassword,
        rollNumber: u.linkedRollNumber,
        // Department binding (strict isolation key for Focal Person / Course Coordinator).
        department: u.profile?.department || null,
        fullName: u.profile?.fullName || null,
        createdAt: u.createdAt,
      }));
    }

    res.json({ users: out, roles: { admissions: ADMISSIONS_ROLES, lms: LMS_ROLES } });
  } catch (e) {
    console.error('SA listUsers error:', e);
    res.status(500).json({ error: 'Failed to load users' });
  }
}

// ---- Create a user account for ANY role ---------------------------------
async function createUser(req, res) {
  try {
    const { system, role, email, username, password, fullName, department } = req.body;
    if (!system || !['admissions', 'lms'].includes(system)) {
      return res.status(400).json({ error: 'system must be "admissions" or "lms".' });
    }
    if (!email && !username) return res.status(400).json({ error: 'Email or username is required.' });

    const tempPassword = (password && password.length >= 8) ? password : randomPassword(10);

    if (system === 'admissions') {
      if (!ADMISSIONS_ROLES[role]) return res.status(400).json({ error: 'Invalid admissions role.' });
      const hash = await bcrypt.hash(tempPassword, 10);
      const cleanUser = (username || email.split('@')[0]).toLowerCase().trim();
      const [firstName, ...rest] = (fullName || '').trim().split(' ');
      const created = await prisma.user.create({
        data: {
          email: (email || `${cleanUser}@aust.edu.pk`).toLowerCase(),
          username: cleanUser,
          password: hash,
          role,
          isActive: true,
          mustChangePassword: true,
          forcePasswordReset: true,
          profile: { create: { firstName: firstName || null, lastName: rest.join(' ') || null } },
        },
        select: { id: true, email: true, username: true, role: true },
      });
      await logSaActivity({ req, module: 'users', action: 'create_user', description: `Created admissions ${role} ${created.email}`, metadata: { system, role, id: created.id } });
      return res.status(201).json({ user: created, temporaryPassword: tempPassword });
    }

    // LMS user
    if (!LMS_ROLES[role]) return res.status(400).json({ error: 'Invalid LMS role.' });
    const hash = await bcrypt.hash(tempPassword, 12);
    const cleanUser = (username || email.split('@')[0]).toLowerCase().trim();
    const created = await prisma.lmsUser.create({
      data: {
        username: cleanUser,
        email: email ? email.toLowerCase() : null,
        passwordHash: hash,
        role,
        isActive: true,
        mustChangePassword: true,
      },
      select: { id: true, email: true, username: true, role: true },
    });
    // Minimal profile for name display AND — crucially — department binding.
    // For DEPARTMENT-BOUND LMS staff roles (Focal Person / Course Coordinator)
    // the `department` string is the STRICT isolation key. It must be stored so
    // the staff member only ever sees their own department's data. Multiple
    // focal persons / coordinators may share the same department string — each
    // remains an independent, isolated account (Critical Requirement §4 & §7).
    const deptStr = department ? String(department).trim() : '';
    const isDeptStaff = ['FocalPerson', 'CourseCoordinator'].includes(role);
    if (fullName || deptStr || isDeptStaff) {
      const designation = role === 'FocalPerson' ? 'Department Focal Person'
        : role === 'CourseCoordinator' ? 'Course Coordinator' : null;
      await prisma.lmsStudentProfile.create({
        data: {
          lmsUserId: created.id, fullName: fullName || '', fatherName: '', cnic: '', dateOfBirth: '',
          gender: '', program: '', programShortForm: '', department: deptStr, rollNumber: '',
          registrationNumber: '', session: '', enrollmentDate: new Date(),
          designation,
        },
      }).catch(() => {});
    }
    await logSaActivity({ req, module: 'users', action: 'create_user', description: `Created LMS ${role} ${created.username}${deptStr ? ` (${deptStr})` : ''}`, metadata: { system, role, id: created.id, department: deptStr || null } });
    return res.status(201).json({ user: created, temporaryPassword: tempPassword });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'A user with this email or username already exists.' });
    console.error('SA createUser error:', e);
    res.status(500).json({ error: 'Failed to create user' });
  }
}

// ---- Toggle active status -----------------------------------------------
async function setUserStatus(req, res) {
  try {
    const { system, id } = req.params;
    const { isActive, reason } = req.body;
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive (boolean) required.' });

    if (system === 'admissions') {
      const numId = parseInt(id, 10);
      if (numId === req.user.id && isActive === false) {
        return res.status(400).json({ error: 'You cannot deactivate your own account.' });
      }
      const updated = await prisma.user.update({ where: { id: numId }, data: { isActive }, select: { id: true, email: true, isActive: true } });
      await logSaActivity({ req, module: 'users', action: isActive ? 'activate_user' : 'deactivate_user', description: `${isActive ? 'Activated' : 'Deactivated'} admissions user ${updated.email}. ${reason || ''}`.trim() });
      return res.json({ user: updated, message: `Account ${isActive ? 'activated' : 'deactivated'}.` });
    }
    const updated = await prisma.lmsUser.update({ where: { id }, data: { isActive }, select: { id: true, username: true, isActive: true } });
    await logSaActivity({ req, module: 'users', action: isActive ? 'activate_user' : 'deactivate_user', description: `${isActive ? 'Activated' : 'Deactivated'} LMS user ${updated.username}. ${reason || ''}`.trim() });
    res.json({ user: updated, message: `Account ${isActive ? 'activated' : 'deactivated'}.` });
  } catch (e) {
    console.error('SA setUserStatus error:', e);
    res.status(500).json({ error: 'Failed to update status' });
  }
}

// ---- Reset password ------------------------------------------------------
async function resetPassword(req, res) {
  try {
    const { system, id } = req.params;
    let newPassword = (req.body.newPassword || '').trim();
    if (newPassword && newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!newPassword) newPassword = randomPassword(10);

    if (system === 'admissions') {
      const hash = await bcrypt.hash(newPassword, 10);
      const u = await prisma.user.update({ where: { id: parseInt(id, 10) }, data: { password: hash, mustChangePassword: true, forcePasswordReset: true, resetPasswordToken: null, resetPasswordExpires: null }, select: { email: true } });
      await logSaActivity({ req, module: 'users', action: 'reset_password', description: `Reset password for admissions user ${u.email}` });
    } else {
      const hash = await bcrypt.hash(newPassword, 12);
      const u = await prisma.lmsUser.update({ where: { id }, data: { passwordHash: hash, mustChangePassword: true }, select: { username: true } });
      await logSaActivity({ req, module: 'users', action: 'reset_password', description: `Reset password for LMS user ${u.username}` });
    }
    res.json({ message: 'Password reset successfully.', temporaryPassword: newPassword });
  } catch (e) {
    console.error('SA resetPassword error:', e);
    res.status(500).json({ error: 'Failed to reset password' });
  }
}

// ---- Change role ---------------------------------------------------------
async function changeRole(req, res) {
  try {
    const { system, id } = req.params;
    const { role } = req.body;
    if (system === 'admissions') {
      if (!ADMISSIONS_ROLES[role]) return res.status(400).json({ error: 'Invalid admissions role.' });
      const numId = parseInt(id, 10);
      if (numId === req.user.id && role !== 'super_admin') return res.status(400).json({ error: 'You cannot change your own Super Admin role.' });
      const updated = await prisma.user.update({ where: { id: numId }, data: { role }, select: { id: true, email: true, role: true } });
      await logSaActivity({ req, module: 'users', action: 'change_role', description: `Changed role of ${updated.email} to ${role}` });
      return res.json({ user: updated, message: 'Role updated.' });
    }
    if (!LMS_ROLES[role]) return res.status(400).json({ error: 'Invalid LMS role.' });
    const updated = await prisma.lmsUser.update({ where: { id }, data: { role }, select: { id: true, username: true, role: true } });
    await logSaActivity({ req, module: 'users', action: 'change_role', description: `Changed role of ${updated.username} to ${role}` });
    res.json({ user: updated, message: 'Role updated.' });
  } catch (e) {
    console.error('SA changeRole error:', e);
    res.status(500).json({ error: 'Failed to change role' });
  }
}

// ---- Unlock account ------------------------------------------------------
async function unlockUser(req, res) {
  try {
    const { system, id } = req.params;
    if (system === 'admissions') {
      const u = await prisma.user.update({ where: { id: parseInt(id, 10) }, data: { failedLoginAttempts: 0, lockedUntil: null, isLocked: false, lockedAt: null }, select: { email: true } });
      await logSaActivity({ req, module: 'users', action: 'unlock_user', description: `Unlocked admissions user ${u.email}` });
    } else {
      const u = await prisma.lmsUser.update({ where: { id }, data: { failedLoginAttempts: 0, lockedUntil: null }, select: { username: true } });
      await logSaActivity({ req, module: 'users', action: 'unlock_user', description: `Unlocked LMS user ${u.username}` });
    }
    res.json({ message: 'Account unlocked.' });
  } catch (e) {
    console.error('SA unlockUser error:', e);
    res.status(500).json({ error: 'Failed to unlock account' });
  }
}

// ---- Deactivated accounts list ------------------------------------------
async function listDeactivated(req, res) {
  try {
    const [admUsers, lmsUsers] = await Promise.all([
      prisma.user.findMany({ where: { isActive: false }, select: { id: true, email: true, username: true, role: true }, orderBy: { updatedAt: 'desc' } }),
      prisma.lmsUser.findMany({ where: { isActive: false }, select: { id: true, email: true, username: true, role: true }, orderBy: { updatedAt: 'desc' } }),
    ]);
    res.json({
      users: [
        ...admUsers.map((u) => ({ ...u, system: 'admissions', roleLabel: ADMISSIONS_ROLES[u.role] || u.role })),
        ...lmsUsers.map((u) => ({ ...u, system: 'lms', roleLabel: LMS_ROLES[u.role] || u.role })),
      ],
    });
  } catch (e) {
    console.error('SA listDeactivated error:', e);
    res.status(500).json({ error: 'Failed to load deactivated accounts' });
  }
}

// ---- Login history -------------------------------------------------------
async function loginHistory(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 30, 200);
    const where = {};
    if (req.query.success === 'false') where.success = false;
    if (req.query.success === 'true') where.success = true;
    const [total, items] = await Promise.all([
      prisma.loginAudit.count({ where }).catch(() => 0),
      prisma.loginAudit.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }).catch(() => []),
    ]);
    res.json({ history: items, total, page, pageSize });
  } catch (e) {
    console.error('SA loginHistory error:', e);
    res.status(500).json({ error: 'Failed to load login history' });
  }
}

// ---- Active sessions (recent logins as proxy) ---------------------------
async function activeSessions(req, res) {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [admUsers, lmsUsers] = await Promise.all([
      prisma.user.findMany({ where: { lastLoginAt: { gte: since } }, select: { id: true, email: true, username: true, role: true, lastLoginAt: true, lastLoginIp: true }, orderBy: { lastLoginAt: 'desc' } }),
      prisma.lmsUser.findMany({ where: { lastLoginAt: { gte: since } }, select: { id: true, email: true, username: true, role: true, lastLoginAt: true }, orderBy: { lastLoginAt: 'desc' } }),
    ]);
    res.json({
      sessions: [
        ...admUsers.map((u) => ({ ...u, system: 'admissions' })),
        ...lmsUsers.map((u) => ({ ...u, system: 'lms' })),
      ],
    });
  } catch (e) {
    console.error('SA activeSessions error:', e);
    res.status(500).json({ error: 'Failed to load active sessions' });
  }
}

// ---- Assign / reassign an LMS staff user's DEPARTMENT --------------------
//  The department string is the STRICT isolation key for Focal Person /
//  Course Coordinator LMS roles. This lets the Super Admin bind (or move) an
//  existing LMS staff member to a department — including assigning MULTIPLE
//  focal persons / coordinators to the same department (each stays isolated).
//  Idempotent: creates the profile if missing, else updates only `department`.
async function setLmsUserDepartment(req, res) {
  try {
    const { id } = req.params;
    const department = req.body.department != null ? String(req.body.department).trim() : '';

    const user = await prisma.lmsUser.findUnique({ where: { id }, select: { id: true, username: true, role: true } });
    if (!user) return res.status(404).json({ error: 'LMS user not found.' });
    if (!['FocalPerson', 'CourseCoordinator', 'Teacher', 'Student'].includes(user.role)) {
      // Governance roles (Provost/QEC/ExamController) are intentionally NOT
      // department-bound — they keep university-wide oversight.
      return res.status(400).json({ error: `Role "${user.role}" is not department-bound.` });
    }

    const existing = await prisma.lmsStudentProfile.findUnique({ where: { lmsUserId: id } });
    if (existing) {
      await prisma.lmsStudentProfile.update({ where: { lmsUserId: id }, data: { department } });
    } else {
      const designation = user.role === 'FocalPerson' ? 'Department Focal Person'
        : user.role === 'CourseCoordinator' ? 'Course Coordinator' : null;
      await prisma.lmsStudentProfile.create({
        data: {
          lmsUserId: id, fullName: '', fatherName: '', cnic: '', dateOfBirth: '',
          gender: '', program: '', programShortForm: '', department, rollNumber: '',
          registrationNumber: '', session: '', enrollmentDate: new Date(), designation,
        },
      });
    }
    await logSaActivity({ req, module: 'users', action: 'assign_department', description: `Assigned LMS ${user.role} ${user.username} to department "${department}"`, metadata: { id, department } });
    res.json({ message: 'Department assignment updated', id, department });
  } catch (e) {
    console.error('SA setLmsUserDepartment error:', e);
    res.status(500).json({ error: 'Failed to assign department' });
  }
}

module.exports = {
  listUsers, createUser, setUserStatus, resetPassword, changeRole,
  unlockUser, listDeactivated, loginHistory, activeSessions,
  setLmsUserDepartment,
  ADMISSIONS_ROLES, LMS_ROLES,
};

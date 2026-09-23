const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Every route in this module is Super Admin only.
router.use(authenticate, requireSuperAdmin);

// ============================================================
// ROLE LABELS — single source of truth for valid role values.
// "Admin" is never used except "Super Admin".
// ============================================================
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  director_admissions: 'Director Admissions',
  coordinator: 'Admissions Coordinator',
  student: 'Student',
  teacher: 'Teacher',
  lms_admin: 'LMS Admin',
};
const ASSIGNABLE_ROLES = Object.keys(ROLE_LABELS);

function generateRandomPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// ============================================================
// GET /api/super-admin/users — list every user account
// ============================================================
router.get('/users', async (req, res) => {
  try {
    const { role, q } = req.query;
    const where = {};
    if (role && ASSIGNABLE_ROLES.includes(role)) where.role = role;
    if (q) {
      where.OR = [
        { email: { contains: q } },
        { username: { contains: q } },
      ];
    }
    const users = await prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        profile: { select: { firstName: true, lastName: true } },
        managedDepartment: { select: { id: true, name: true } },
      },
    });
    const data = users.map((u) => ({
      ...u,
      roleLabel: ROLE_LABELS[u.role] || u.role,
      fullName: [u.profile?.firstName, u.profile?.lastName].filter(Boolean).join(' ') || null,
    }));
    res.json({ users: data });
  } catch (e) {
    console.error('super-admin list users error:', e);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// ============================================================
// PATCH /api/super-admin/users/:id/status — activate / deactivate
// ============================================================
router.patch('/users/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive (boolean) is required' });
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user.id && isActive === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, email: true, username: true, role: true, isActive: true },
    });
    res.json({ user: updated, message: `Account ${isActive ? 'activated' : 'deactivated'}.` });
  } catch (e) {
    console.error('super-admin status error:', e);
    res.status(500).json({ error: 'Failed to update account status' });
  }
});

// ============================================================
// POST /api/super-admin/users/:id/reset-password — reset to new/random password
// ============================================================
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    let newPassword = (req.body.newPassword || '').trim();
    if (!newPassword) {
      newPassword = generateRandomPassword(10);
    } else if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id },
      data: { password: hash, resetPasswordToken: null, resetPasswordExpires: null },
    });
    res.json({ message: 'Password reset successfully.', temporaryPassword: newPassword });
  } catch (e) {
    console.error('super-admin reset password error:', e);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ============================================================
// PATCH /api/super-admin/users/:id/role — change role assignment
// ============================================================
router.patch('/users/:id/role', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { role } = req.body;
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role value.' });
    }
    const target = await prisma.user.findUnique({
      where: { id },
      include: { managedDepartment: true },
    });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user.id && role !== 'super_admin') {
      return res.status(400).json({ error: 'You cannot change your own Super Admin role.' });
    }
    // If demoting a coordinator who manages a department, unlink it first.
    if (target.role === 'coordinator' && role !== 'coordinator' && target.managedDepartment) {
      await prisma.department.update({
        where: { id: target.managedDepartment.id },
        data: { coordinatorId: null },
      });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, username: true, role: true, isActive: true },
    });
    res.json({ user: { ...updated, roleLabel: ROLE_LABELS[updated.role] }, message: 'Role updated.' });
  } catch (e) {
    console.error('super-admin role error:', e);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// ============================================================
// GET /api/super-admin/departments — departments with coordinators
// ============================================================
router.get('/departments', async (req, res) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: {
        coordinator: {
          select: { id: true, email: true, username: true, isActive: true,
            profile: { select: { firstName: true, lastName: true } } },
        },
        programs: { select: { id: true, name: true, shortForm: true, code: true, isActive: true } },
      },
    });
    const data = departments.map((d) => ({
      id: d.id,
      name: d.name,
      faculty: d.faculty,
      isActive: d.isActive,
      programs: d.programs,
      coordinator: d.coordinator
        ? {
            id: d.coordinator.id,
            email: d.coordinator.email,
            username: d.coordinator.username,
            isActive: d.coordinator.isActive,
            fullName: [d.coordinator.profile?.firstName, d.coordinator.profile?.lastName]
              .filter(Boolean)
              .join(' ') || null,
          }
        : null,
    }));
    res.json({ departments: data });
  } catch (e) {
    console.error('super-admin departments error:', e);
    res.status(500).json({ error: 'Failed to load departments' });
  }
});

// ============================================================
// GET /api/super-admin/stats — system-wide stats per dept/program
// ============================================================
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalApplications,
      enrolledCount,
      departments,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.application.count(),
      prisma.application.count({ where: { status: 'ENROLLED' } }),
      prisma.department.findMany({
        orderBy: { name: 'asc' },
        include: {
          programs: { select: { id: true, name: true, shortForm: true } },
        },
      }),
    ]);

    // Role distribution
    const roleGroups = await prisma.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    });
    const usersByRole = {};
    roleGroups.forEach((g) => { usersByRole[g.role] = g._count._all; });

    // Application counts grouped by program
    const appGroups = await prisma.application.groupBy({
      by: ['programId', 'status'],
      _count: { _all: true },
    });
    const programStatsMap = {};
    appGroups.forEach((g) => {
      if (!programStatsMap[g.programId]) {
        programStatsMap[g.programId] = { total: 0, enrolled: 0, byStatus: {} };
      }
      programStatsMap[g.programId].total += g._count._all;
      programStatsMap[g.programId].byStatus[g.status] = g._count._all;
      if (g.status === 'ENROLLED') programStatsMap[g.programId].enrolled += g._count._all;
    });

    const departmentStats = departments.map((d) => {
      const programs = d.programs.map((p) => ({
        id: p.id,
        name: p.name,
        shortForm: p.shortForm,
        applications: programStatsMap[p.id]?.total || 0,
        enrolled: programStatsMap[p.id]?.enrolled || 0,
        byStatus: programStatsMap[p.id]?.byStatus || {},
      }));
      return {
        id: d.id,
        name: d.name,
        applications: programs.reduce((s, p) => s + p.applications, 0),
        enrolled: programs.reduce((s, p) => s + p.enrolled, 0),
        programs,
      };
    });

    res.json({
      summary: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        totalApplications,
        enrolledCount,
        totalDepartments: departments.length,
      },
      usersByRole,
      departmentStats,
    });
  } catch (e) {
    console.error('super-admin stats error:', e);
    res.status(500).json({ error: 'Failed to load system stats' });
  }
});

module.exports = router;

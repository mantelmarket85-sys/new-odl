// ============================================================
//  SUPER ADMIN — CORE CONTROLLER
//  Dashboard, activity logs, audit trail, override logs, pending approvals.
//  Reads from EXISTING models; never mutates other modules' data.
// ============================================================
const prisma = require('../../utils/prisma');
const { logSaActivity } = require('./superAdmin.service');

// ---- Executive dashboard summary ----------------------------------------
async function getDashboard(req, res) {
  try {
    const [
      totalStudentsLms, totalFaculty, totalDepartments, totalProgramsActive,
      totalUsers, activeUsers, totalApplications, enrolledCount,
      activeSession, pendingApplications, lmsChallans,
    ] = await Promise.all([
      prisma.lmsUser.count({ where: { role: 'Student' } }),
      prisma.lmsUser.count({ where: { role: 'Teacher', isActive: true } }),
      prisma.department.count(),
      prisma.program.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.application.count(),
      prisma.application.count({ where: { status: 'ENROLLED' } }),
      prisma.academicSession.findFirst({ where: { isActive: true } }).catch(() => null),
      prisma.application.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'FORWARDED', 'FEE_PENDING', 'FEE_PAID'] } } }),
      prisma.lmsFeeChallan.findMany({ select: { totalAmount: true, status: true } }).catch(() => []),
    ]);

    const totalFee = lmsChallans.reduce((s, c) => s + (c.totalAmount || 0), 0);
    const collectedFee = lmsChallans
      .filter((c) => c.status === 'PAID')
      .reduce((s, c) => s + (c.totalAmount || 0), 0);
    const feeCollectionPct = totalFee > 0 ? Math.round((collectedFee / totalFee) * 100) : 0;

    // Pending approvals across modules (best-effort; missing tables → 0).
    const safeCount = (p) => p.then((n) => n).catch(() => 0);
    const [
      pendingEnrollments, pendingFeeVerifications, pendingDeactivations,
      pendingMarksCorrection, pendingRecheck,
    ] = await Promise.all([
      safeCount(prisma.approvalRequest.count({ where: { status: 'PENDING' } })),
      safeCount(prisma.lmsFeeChallan.count({ where: { status: 'UNPAID' } })),
      safeCount(prisma.teacherReplacement.count({ where: { status: 'PENDING' } })),
      safeCount(prisma.recheckRequest.count({ where: { status: 'PENDING' } })),
      safeCount(prisma.recheckRequest.count({ where: { status: 'PENDING' } })),
    ]);

    const pendingTotal = pendingApplications + pendingEnrollments + pendingFeeVerifications +
      pendingDeactivations + pendingMarksCorrection;

    res.json({
      summary: {
        totalStudents: totalStudentsLms,
        totalFaculty,
        totalDepartments,
        totalPrograms: totalProgramsActive,
        activeSession: activeSession ? activeSession.name : null,
        feeCollectionPct,
        totalUsers,
        activeUsers,
        totalApplications,
        enrolledCount,
        pendingApprovals: pendingTotal,
        systemAlerts: pendingDeactivations + pendingMarksCorrection,
      },
      pendingApprovals: {
        applications: pendingApplications,
        enrollments: pendingEnrollments,
        feeVerifications: pendingFeeVerifications,
        deactivations: pendingDeactivations,
        marksCorrection: pendingMarksCorrection,
        rechecking: pendingRecheck,
      },
      fee: { totalFee, collectedFee, feeCollectionPct },
    });
  } catch (e) {
    console.error('SA dashboard error:', e);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
}

// ---- Charts data ---------------------------------------------------------
async function getDashboardCharts(req, res) {
  try {
    // Department-wise student distribution (from LmsStudentProfile snapshots).
    const profiles = await prisma.lmsStudentProfile.findMany({
      select: { department: true, session: true },
    }).catch(() => []);
    const byDept = {};
    const bySession = {};
    profiles.forEach((p) => {
      const d = p.department || 'Unassigned';
      byDept[d] = (byDept[d] || 0) + 1;
      const s = p.session || 'Unknown';
      bySession[s] = (bySession[s] || 0) + 1;
    });

    // Role distribution from User + LmsUser.
    const [userRoles, lmsRoles] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }).catch(() => []),
      prisma.lmsUser.groupBy({ by: ['role'], _count: { _all: true } }).catch(() => []),
    ]);

    res.json({
      departmentDistribution: Object.entries(byDept).map(([name, value]) => ({ name, value })),
      enrollmentTrend: Object.entries(bySession).map(([name, value]) => ({ name, value })),
      userRoles: userRoles.map((r) => ({ role: r.role, count: r._count._all })),
      lmsRoles: lmsRoles.map((r) => ({ role: r.role, count: r._count._all })),
    });
  } catch (e) {
    console.error('SA charts error:', e);
    res.status(500).json({ error: 'Failed to load chart data' });
  }
}

// ---- Recent activity feed ------------------------------------------------
async function getRecentActivity(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const items = await prisma.saActivityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ activities: items });
  } catch (e) {
    console.error('SA activity feed error:', e);
    res.status(500).json({ error: 'Failed to load activity feed' });
  }
}

// ---- Activity logs (filterable) -----------------------------------------
async function getActivityLogs(req, res) {
  try {
    const { module, actorId, q, from, to } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 25, 200);
    const where = {};
    if (module) where.module = module;
    if (actorId) where.actorId = parseInt(actorId, 10);
    if (q) where.OR = [{ description: { contains: q } }, { action: { contains: q } }, { actorName: { contains: q } }];
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const [total, items] = await Promise.all([
      prisma.saActivityLog.count({ where }),
      prisma.saActivityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ logs: items, total, page, pageSize });
  } catch (e) {
    console.error('SA activity logs error:', e);
    res.status(500).json({ error: 'Failed to load activity logs' });
  }
}

// ---- Audit trail: combines login audits + override logs -----------------
async function getAuditTrail(req, res) {
  try {
    const { type } = req.query; // login | override | all
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 25, 200);

    if (type === 'override') {
      const [total, items] = await Promise.all([
        prisma.overrideLog.count(),
        prisma.overrideLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      return res.json({ overrides: items, total, page, pageSize });
    }

    // Default: login audit
    const [total, items] = await Promise.all([
      prisma.loginAudit.count().catch(() => 0),
      prisma.loginAudit.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }).catch(() => []),
    ]);
    res.json({ logins: items, total, page, pageSize });
  } catch (e) {
    console.error('SA audit trail error:', e);
    res.status(500).json({ error: 'Failed to load audit trail' });
  }
}

// ---- Override logs (read) -----------------------------------------------
async function getOverrideLogs(req, res) {
  try {
    const items = await prisma.overrideLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ overrides: items });
  } catch (e) {
    console.error('SA override logs error:', e);
    res.status(500).json({ error: 'Failed to load override logs' });
  }
}

module.exports = {
  getDashboard, getDashboardCharts, getRecentActivity,
  getActivityLogs, getAuditTrail, getOverrideLogs,
};

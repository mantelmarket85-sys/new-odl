// ============================================================
//  SUPER ADMIN — LMS OVERSIGHT CONTROLLER (read-only)
//  ------------------------------------------------------------
//  System-wide read access into the LMS: enrollments, courses,
//  attendance, results, fees, exams and quality (QEC) metrics.
//  These are observational endpoints — the Super Admin sees
//  everything but normal LMS workflows remain untouched. Where a
//  super admin needs to override a record, that goes through the
//  dedicated override endpoints (systemConfig / reports), which log
//  to OverrideLog.
// ============================================================
const prisma = require('../../utils/prisma');

function pageArgs(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// ---- Enrollments (admissions → LMS pipeline) ----------------------------
async function listEnrollments(req, res) {
  try {
    const { page, pageSize, skip, take } = pageArgs(req);
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const [rows, total] = await Promise.all([
      prisma.enrollment.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true, username: true } } },
      }),
      prisma.enrollment.count({ where }),
    ]);
    res.json({ enrollments: rows, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) {
    console.error('SA listEnrollments error:', e);
    res.status(500).json({ error: 'Failed to load enrollments' });
  }
}

// ---- Courses + offerings ------------------------------------------------
async function listCourses(req, res) {
  try {
    const { page, pageSize, skip, take } = pageArgs(req);
    const where = { isDeleted: false };
    if (req.query.search) {
      where.OR = [
        { code: { contains: req.query.search } },
        { title: { contains: req.query.search } },
      ];
    }
    const [rows, total] = await Promise.all([
      prisma.lmsCourse.findMany({
        where, skip, take, orderBy: { code: 'asc' },
        include: {
          program: { select: { id: true, name: true } },
          _count: { select: { offerings: true } },
        },
      }),
      prisma.lmsCourse.count({ where }),
    ]);
    res.json({ courses: rows, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) {
    console.error('SA listCourses error:', e);
    res.status(500).json({ error: 'Failed to load courses' });
  }
}

async function listOfferings(req, res) {
  try {
    const { page, pageSize, skip, take } = pageArgs(req);
    const where = { isDeleted: false };
    if (req.query.termId) where.termId = parseInt(req.query.termId, 10);
    const [rows, total] = await Promise.all([
      prisma.courseOffering.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: {
          course: { select: { code: true, title: true } },
          term: { select: { code: true, title: true } },
          teacher: { select: { id: true, username: true, email: true } },
          _count: { select: { registrations: true, sections: true } },
        },
      }),
      prisma.courseOffering.count({ where }),
    ]);
    res.json({ offerings: rows, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) {
    console.error('SA listOfferings error:', e);
    res.status(500).json({ error: 'Failed to load offerings' });
  }
}

// ---- Attendance (aggregated overview) -----------------------------------
async function attendanceOverview(req, res) {
  try {
    const sessions = await prisma.attendanceSession.count();
    const records = await prisma.attendanceRecord.groupBy({ by: ['status'], _count: { _all: true } });
    const byStatus = {};
    records.forEach((r) => { byStatus[r.status] = r._count._all; });
    const totalRecords = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const present = (byStatus.PRESENT || 0) + (byStatus.LATE || 0);
    res.json({
      totalSessions: sessions,
      totalRecords,
      byStatus,
      overallAttendancePct: totalRecords ? Math.round((present / totalRecords) * 100) : 0,
    });
  } catch (e) {
    console.error('SA attendanceOverview error:', e);
    res.status(500).json({ error: 'Failed to load attendance overview' });
  }
}

// ---- Results ------------------------------------------------------------
async function listResults(req, res) {
  try {
    const { page, pageSize, skip, take } = pageArgs(req);
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.offeringId) where.offeringId = parseInt(req.query.offeringId, 10);
    const [rows, total] = await Promise.all([
      prisma.courseResult.findMany({
        where, skip, take, orderBy: { updatedAt: 'desc' },
        include: {
          offering: { select: { id: true, course: { select: { code: true, title: true } } } },
          student: { select: { id: true, username: true, email: true, linkedRollNumber: true } },
        },
      }),
      prisma.courseResult.count({ where }),
    ]);
    res.json({ results: rows, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) {
    console.error('SA listResults error:', e);
    res.status(500).json({ error: 'Failed to load results' });
  }
}

// ---- Fees (LMS fee challans) --------------------------------------------
async function feeOverview(req, res) {
  try {
    const grouped = await prisma.lmsFeeChallan.groupBy({
      by: ['status'], _count: { _all: true }, _sum: { totalAmount: true },
    });
    const summary = { totalChallans: 0, totalAmount: 0, byStatus: {} };
    grouped.forEach((g) => {
      summary.byStatus[g.status] = { count: g._count._all, amount: g._sum.totalAmount || 0 };
      summary.totalChallans += g._count._all;
      summary.totalAmount += g._sum.totalAmount || 0;
    });
    const paid = summary.byStatus.PAID?.amount || 0;
    summary.collectionPct = summary.totalAmount ? Math.round((paid / summary.totalAmount) * 100) : 0;
    res.json(summary);
  } catch (e) {
    console.error('SA feeOverview error:', e);
    res.status(500).json({ error: 'Failed to load fee overview' });
  }
}

async function listFeeChallans(req, res) {
  try {
    const { page, pageSize, skip, take } = pageArgs(req);
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const [rows, total] = await Promise.all([
      prisma.lmsFeeChallan.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.lmsFeeChallan.count({ where }),
    ]);
    res.json({ challans: rows, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) {
    console.error('SA listFeeChallans error:', e);
    res.status(500).json({ error: 'Failed to load fee challans' });
  }
}

// ---- Exams --------------------------------------------------------------
async function listExams(req, res) {
  try {
    const { page, pageSize, skip, take } = pageArgs(req);
    const where = { isDeleted: false };
    if (req.query.examType) where.examType = req.query.examType;
    if (req.query.status) where.status = req.query.status;
    const [rows, total] = await Promise.all([
      prisma.examSchedule.findMany({ where, skip, take, orderBy: { date: 'desc' } }),
      prisma.examSchedule.count({ where }),
    ]);
    res.json({ exams: rows, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) {
    console.error('SA listExams error:', e);
    res.status(500).json({ error: 'Failed to load exams' });
  }
}

// ---- QEC / quality metrics ----------------------------------------------
async function qualityMetrics(req, res) {
  try {
    const metrics = await prisma.qualityMetric.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    let compliance = [];
    try { compliance = await prisma.complianceItem.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }); } catch (_) {}
    res.json({ metrics, compliance });
  } catch (e) {
    console.error('SA qualityMetrics error:', e);
    res.status(500).json({ error: 'Failed to load quality metrics' });
  }
}

module.exports = {
  listEnrollments,
  listCourses, listOfferings,
  attendanceOverview,
  listResults,
  feeOverview, listFeeChallans,
  listExams,
  qualityMetrics,
};

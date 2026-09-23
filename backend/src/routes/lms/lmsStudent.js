const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireStudent } = require('../../middleware/auth');
const { uploadLmsSubmission } = require('../../middleware/upload');

const router = express.Router();
const prisma = new PrismaClient();

// Helper: ensure student is LMS-enrolled (admission complete)
const requireLmsAccess = async (req, res, next) => {
  const enrollment = await prisma.enrollment.findUnique({ where: { userId: req.user.id } });
  if (!enrollment || enrollment.status !== 'ENROLLED') {
    return res.status(403).json({ error: 'You are not enrolled in the LMS yet.' });
  }
  req.enrollment = enrollment;
  next();
};

// GET /api/lms/student/dashboard — overview stats
router.get('/dashboard', authenticate, requireStudent, requireLmsAccess, async (req, res) => {
  try {
    const userId = req.user.id;
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { studentId: userId, status: 'ACTIVE' },
      include: { course: { include: { teacher: { include: { teacherProfile: true } } } } },
    });
    const courseIds = enrollments.map(e => e.courseId);

    const [pendingAssignments, totalAssignments, submissions, announcements] = await Promise.all([
      prisma.assignment.count({
        where: {
          courseId: { in: courseIds },
          isPublished: true,
          submissions: { none: { studentId: userId } },
        },
      }),
      prisma.assignment.count({ where: { courseId: { in: courseIds }, isPublished: true } }),
      prisma.submission.findMany({
        where: { studentId: userId },
        include: { assignment: { include: { course: true } } },
        orderBy: { submittedAt: 'desc' },
        take: 5,
      }),
      prisma.announcement.findMany({
        where: { OR: [{ courseId: { in: courseIds } }, { courseId: null }] },
        include: { course: true, author: { select: { email: true, role: true, teacherProfile: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    res.json({
      enrollment: req.enrollment,
      stats: {
        coursesCount: enrollments.length,
        pendingAssignments,
        totalAssignments,
        submittedCount: totalAssignments - pendingAssignments,
      },
      recentSubmissions: submissions,
      announcements,
    });
  } catch (e) {
    console.error('LMS student dashboard error:', e);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET /api/lms/student/courses — my courses
router.get('/courses', authenticate, requireStudent, requireLmsAccess, async (req, res) => {
  try {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { studentId: req.user.id },
      include: {
        course: {
          include: {
            teacher: { include: { teacherProfile: true } },
            _count: { select: { lessons: true, assignments: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
    res.json({ enrollments });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// GET /api/lms/student/courses/:id — course details (lessons, assignments, materials, announcements)
router.get('/courses/:id', authenticate, requireStudent, requireLmsAccess, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    const enrolled = await prisma.courseEnrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId: req.user.id } },
    });
    if (!enrolled) return res.status(403).json({ error: 'You are not enrolled in this course' });

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        teacher: { include: { teacherProfile: true } },
        lessons: { where: { isPublished: true }, orderBy: [{ weekNumber: 'asc' }, { order: 'asc' }] },
        assignments: {
          where: { isPublished: true },
          include: { submissions: { where: { studentId: req.user.id } } },
          orderBy: { deadline: 'asc' },
        },
        materials: { orderBy: { createdAt: 'desc' } },
        announcements: {
          include: { author: { select: { email: true, teacherProfile: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!course) return res.status(404).json({ error: 'Course not found' });
    res.json({ course });
  } catch (e) {
    console.error('LMS course details error:', e);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
});

// POST /api/lms/student/assignments/:id/submit — submit assignment
router.post('/assignments/:id/submit', authenticate, requireStudent, requireLmsAccess, uploadLmsSubmission.single('file'), async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id);
    const { content } = req.body;

    const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    // verify enrollment
    const enrolled = await prisma.courseEnrollment.findUnique({
      where: { courseId_studentId: { courseId: assignment.courseId, studentId: req.user.id } },
    });
    if (!enrolled) return res.status(403).json({ error: 'You are not enrolled in this course' });

    const isLate = new Date() > new Date(assignment.deadline);
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    const fileName = req.file ? req.file.originalname : null;

    const submission = await prisma.submission.upsert({
      where: { assignmentId_studentId: { assignmentId, studentId: req.user.id } },
      update: {
        content: content || null,
        filePath: filePath || undefined,
        fileName: fileName || undefined,
        status: isLate ? 'LATE' : 'SUBMITTED',
        submittedAt: new Date(),
      },
      create: {
        assignmentId,
        studentId: req.user.id,
        content: content || null,
        filePath,
        fileName,
        status: isLate ? 'LATE' : 'SUBMITTED',
      },
    });

    res.json({ message: 'Assignment submitted', submission });
  } catch (e) {
    console.error('Submit assignment error:', e);
    res.status(500).json({ error: 'Failed to submit assignment' });
  }
});

// GET /api/lms/student/grades — all grades across courses
router.get('/grades', authenticate, requireStudent, requireLmsAccess, async (req, res) => {
  try {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { studentId: req.user.id },
      include: {
        course: {
          include: {
            assignments: {
              include: { submissions: { where: { studentId: req.user.id } } },
            },
          },
        },
      },
    });
    res.json({ enrollments });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch grades' });
  }
});

// GET /api/lms/student/announcements
router.get('/announcements', authenticate, requireStudent, requireLmsAccess, async (req, res) => {
  try {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { studentId: req.user.id },
      select: { courseId: true },
    });
    const courseIds = enrollments.map(e => e.courseId);
    const announcements = await prisma.announcement.findMany({
      where: { OR: [{ courseId: { in: courseIds } }, { courseId: null }] },
      include: { course: true, author: { select: { email: true, role: true, teacherProfile: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ announcements });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

module.exports = router;

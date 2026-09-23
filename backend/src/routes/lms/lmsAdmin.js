const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireLmsAdmin } = require('../../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/lms/admin/dashboard — overview stats
router.get('/dashboard', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const [
      totalCourses, activeCourses,
      totalTeachers, totalStudents,
      totalEnrollments, totalLessons,
      totalAssignments, totalSubmissions, gradedSubmissions,
      recentEnrollments, recentSubmissions,
    ] = await Promise.all([
      prisma.course.count(),
      prisma.course.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: 'teacher' } }),
      prisma.user.count({ where: { role: 'student', enrollment: { status: 'ENROLLED' } } }),
      prisma.courseEnrollment.count(),
      prisma.lesson.count(),
      prisma.assignment.count(),
      prisma.submission.count(),
      prisma.submission.count({ where: { status: 'GRADED' } }),
      prisma.courseEnrollment.findMany({
        take: 5,
        orderBy: { enrolledAt: 'desc' },
        include: { student: { select: { email: true, profile: true } }, course: true },
      }),
      prisma.submission.findMany({
        take: 5,
        orderBy: { submittedAt: 'desc' },
        include: {
          student: { select: { email: true, profile: true } },
          assignment: { include: { course: true } },
        },
      }),
    ]);

    res.json({
      stats: {
        totalCourses, activeCourses, totalTeachers, totalStudents,
        totalEnrollments, totalLessons, totalAssignments,
        totalSubmissions, gradedSubmissions,
        pendingSubmissions: totalSubmissions - gradedSubmissions,
      },
      recentEnrollments,
      recentSubmissions,
    });
  } catch (e) {
    console.error('Admin LMS dashboard error:', e);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ─── Courses CRUD ───────────────────────────────────────────
router.get('/courses', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      include: {
        teacher: { include: { teacherProfile: true } },
        _count: { select: { enrollments: true, lessons: true, assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ courses });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

router.post('/courses', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const { code, title, description, creditHours, semester, programCode, teacherId, isActive } = req.body;
    const course = await prisma.course.create({
      data: {
        code,
        title,
        description: description || null,
        creditHours: parseInt(creditHours) || 3,
        semester: parseInt(semester) || 1,
        programCode: programCode || null,
        teacherId: teacherId ? parseInt(teacherId) : null,
        isActive: isActive !== false,
      },
    });
    res.json({ message: 'Course created', course });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(400).json({ error: 'Course code already exists' });
    }
    console.error('Create course error:', e);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

router.put('/courses/:id', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { code, title, description, creditHours, semester, programCode, teacherId, isActive } = req.body;
    const course = await prisma.course.update({
      where: { id },
      data: {
        code, title, description,
        creditHours: creditHours !== undefined ? parseInt(creditHours) : undefined,
        semester: semester !== undefined ? parseInt(semester) : undefined,
        programCode,
        teacherId: teacherId === '' || teacherId === null ? null : (teacherId ? parseInt(teacherId) : undefined),
        isActive,
      },
    });
    res.json({ message: 'Course updated', course });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update course' });
  }
});

router.delete('/courses/:id', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    await prisma.course.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Course deleted' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

router.get('/courses/:id', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        teacher: { include: { teacherProfile: true } },
        enrollments: { include: { student: { select: { id: true, email: true, profile: true, enrollment: true } } } },
        lessons: { orderBy: [{ weekNumber: 'asc' }, { order: 'asc' }] },
        assignments: { include: { _count: { select: { submissions: true } } } },
        announcements: { include: { author: { select: { email: true, role: true } } } },
      },
    });
    if (!course) return res.status(404).json({ error: 'Not found' });
    res.json({ course });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch course' });
  }
});

// ─── Teachers CRUD ──────────────────────────────────────────
router.get('/teachers', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const teachers = await prisma.user.findMany({
      where: { role: 'teacher' },
      select: {
        id: true, email: true, createdAt: true,
        teacherProfile: true,
        taughtCourses: { select: { id: true, code: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ teachers });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

router.post('/teachers', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const { email, password, firstName, lastName, designation, department, qualification, phone, bio } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'User with this email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const teacher = await prisma.user.create({
      data: {
        email,
        password: hash,
        role: 'teacher',
        teacherProfile: {
          create: {
            firstName: firstName || null,
            lastName: lastName || null,
            designation: designation || null,
            department: department || 'Computer Science',
            qualification: qualification || null,
            phone: phone || null,
            bio: bio || null,
          },
        },
      },
      select: { id: true, email: true, role: true, teacherProfile: true },
    });
    res.json({ message: 'Teacher created', teacher });
  } catch (e) {
    console.error('Create teacher error:', e);
    res.status(500).json({ error: 'Failed to create teacher' });
  }
});

router.put('/teachers/:id', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { firstName, lastName, designation, department, qualification, phone, bio, password } = req.body;

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await prisma.user.update({ where: { id }, data: { password: hash } });
    }

    const profile = await prisma.teacherProfile.upsert({
      where: { userId: id },
      update: { firstName, lastName, designation, department, qualification, phone, bio },
      create: { userId: id, firstName, lastName, designation, department, qualification, phone, bio },
    });
    res.json({ message: 'Teacher updated', profile });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update teacher' });
  }
});

router.delete('/teachers/:id', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    // Unassign teacher from courses
    await prisma.course.updateMany({ where: { teacherId: id }, data: { teacherId: null } });
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'Teacher deleted' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete teacher' });
  }
});

// ─── Enrollments management ─────────────────────────────────
router.get('/enrollments', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const { courseId } = req.query;
    const where = courseId ? { courseId: parseInt(courseId) } : {};
    const enrollments = await prisma.courseEnrollment.findMany({
      where,
      include: {
        student: { select: { id: true, email: true, profile: true, enrollment: true } },
        course: true,
      },
      orderBy: { enrolledAt: 'desc' },
    });
    res.json({ enrollments });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

// GET LMS-eligible students (those with admission Enrollment.status = ENROLLED)
router.get('/students', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const students = await prisma.user.findMany({
      where: { role: 'student', enrollment: { status: 'ENROLLED' } },
      select: {
        id: true, email: true,
        profile: true,
        enrollment: true,
        courseEnrollments: { include: { course: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ students });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

router.post('/enrollments', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const { courseId, studentId } = req.body;
    const exists = await prisma.courseEnrollment.findUnique({
      where: { courseId_studentId: { courseId: parseInt(courseId), studentId: parseInt(studentId) } },
    });
    if (exists) return res.status(400).json({ error: 'Student already enrolled in this course' });

    const enrollment = await prisma.courseEnrollment.create({
      data: { courseId: parseInt(courseId), studentId: parseInt(studentId) },
      include: { course: true, student: { select: { email: true, profile: true } } },
    });

    await prisma.lmsMessage.create({
      data: {
        userId: parseInt(studentId),
        title: 'Enrolled in Course',
        message: `You have been enrolled in ${enrollment.course.code} — ${enrollment.course.title}.`,
      },
    });

    res.json({ message: 'Student enrolled', enrollment });
  } catch (e) {
    console.error('Enroll error:', e);
    res.status(500).json({ error: 'Failed to enroll student' });
  }
});

router.delete('/enrollments/:id', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    await prisma.courseEnrollment.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Enrollment removed' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to remove enrollment' });
  }
});

// Bulk enroll students in a course
router.post('/courses/:id/enroll-bulk', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'No students selected' });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    let created = 0;
    for (const sid of studentIds) {
      const existing = await prisma.courseEnrollment.findUnique({
        where: { courseId_studentId: { courseId, studentId: parseInt(sid) } },
      });
      if (!existing) {
        await prisma.courseEnrollment.create({ data: { courseId, studentId: parseInt(sid) } });
        await prisma.lmsMessage.create({
          data: {
            userId: parseInt(sid),
            title: 'Enrolled in Course',
            message: `You have been enrolled in ${course.code} — ${course.title}.`,
          },
        });
        created++;
      }
    }

    res.json({ message: `Enrolled ${created} students`, count: created });
  } catch (e) {
    console.error('Bulk enroll error:', e);
    res.status(500).json({ error: 'Failed to enroll students' });
  }
});

// ─── Global announcement ────────────────────────────────────
router.post('/announcements', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const { title, message } = req.body;
    const ann = await prisma.announcement.create({
      data: { authorId: req.user.id, title, message, courseId: null },
    });

    // Notify all LMS users (enrolled students + teachers)
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'teacher' },
          { role: 'student', enrollment: { status: 'ENROLLED' } },
        ],
      },
      select: { id: true },
    });
    for (const u of users) {
      await prisma.lmsMessage.create({
        data: { userId: u.id, title: `LMS: ${title}`, message },
      });
    }

    res.json({ message: 'Announcement broadcasted', announcement: ann });
  } catch (e) {
    res.status(500).json({ error: 'Failed to broadcast announcement' });
  }
});

router.get('/announcements', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    const announcements = await prisma.announcement.findMany({
      include: {
        course: true,
        author: { select: { email: true, role: true, teacherProfile: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ announcements });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.delete('/announcements/:id', authenticate, requireLmsAdmin, async (req, res) => {
  try {
    await prisma.announcement.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Announcement deleted' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

module.exports = router;

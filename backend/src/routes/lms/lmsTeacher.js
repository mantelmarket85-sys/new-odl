const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireTeacher } = require('../../middleware/auth');
const { uploadLmsMaterial } = require('../../middleware/upload');

const router = express.Router();
const prisma = new PrismaClient();

// Helper: ensure teacher owns the course
const ownsCourse = async (teacherId, courseId) => {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  return course && course.teacherId === teacherId;
};

// GET /api/lms/teacher/dashboard — overview
router.get('/dashboard', authenticate, requireTeacher, async (req, res) => {
  try {
    const userId = req.user.id;
    const courses = await prisma.course.findMany({
      where: { teacherId: userId },
      include: {
        _count: { select: { enrollments: true, lessons: true, assignments: true } },
      },
    });
    const courseIds = courses.map(c => c.id);

    const [totalStudents, pendingGrading, totalSubmissions, recentSubmissions] = await Promise.all([
      prisma.courseEnrollment.count({ where: { courseId: { in: courseIds } } }),
      prisma.submission.count({
        where: {
          assignment: { courseId: { in: courseIds } },
          status: { in: ['SUBMITTED', 'LATE'] },
          marks: null,
        },
      }),
      prisma.submission.count({ where: { assignment: { courseId: { in: courseIds } } } }),
      prisma.submission.findMany({
        where: { assignment: { courseId: { in: courseIds } } },
        include: {
          student: { select: { email: true, profile: true } },
          assignment: { include: { course: true } },
        },
        orderBy: { submittedAt: 'desc' },
        take: 8,
      }),
    ]);

    const profile = await prisma.teacherProfile.findUnique({ where: { userId } });

    res.json({
      profile,
      stats: {
        coursesCount: courses.length,
        totalStudents,
        pendingGrading,
        totalSubmissions,
      },
      courses,
      recentSubmissions,
    });
  } catch (e) {
    console.error('Teacher dashboard error:', e);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET /api/lms/teacher/profile
router.get('/profile', authenticate, requireTeacher, async (req, res) => {
  try {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user.id } });
    res.json({ profile });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/lms/teacher/profile
router.put('/profile', authenticate, requireTeacher, async (req, res) => {
  try {
    const { firstName, lastName, designation, department, qualification, phone, bio } = req.body;
    const profile = await prisma.teacherProfile.upsert({
      where: { userId: req.user.id },
      update: { firstName, lastName, designation, department, qualification, phone, bio },
      create: { userId: req.user.id, firstName, lastName, designation, department, qualification, phone, bio },
    });
    res.json({ message: 'Profile updated', profile });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/lms/teacher/courses — courses I teach
router.get('/courses', authenticate, requireTeacher, async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      where: { teacherId: req.user.id },
      include: {
        _count: { select: { enrollments: true, lessons: true, assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ courses });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// GET /api/lms/teacher/courses/:id — full course details (with students, lessons, assignments)
router.get('/courses/:id', authenticate, requireTeacher, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    if (!(await ownsCourse(req.user.id, courseId))) {
      return res.status(403).json({ error: 'You do not own this course' });
    }
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        enrollments: { include: { student: { select: { id: true, email: true, profile: true, enrollment: true } } } },
        lessons: { orderBy: [{ weekNumber: 'asc' }, { order: 'asc' }] },
        assignments: { include: { _count: { select: { submissions: true } } }, orderBy: { deadline: 'asc' } },
        materials: { orderBy: { createdAt: 'desc' } },
        announcements: { orderBy: { createdAt: 'desc' } },
      },
    });
    res.json({ course });
  } catch (e) {
    console.error('Teacher course details error:', e);
    res.status(500).json({ error: 'Failed to fetch course details' });
  }
});

// ─── Lessons ───────────────────────────────────────────────
router.post('/courses/:id/lessons', authenticate, requireTeacher, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    if (!(await ownsCourse(req.user.id, courseId))) return res.status(403).json({ error: 'Forbidden' });
    const { title, content, videoUrl, weekNumber, order, isPublished } = req.body;
    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        title,
        content: content || null,
        videoUrl: videoUrl || null,
        weekNumber: parseInt(weekNumber) || 1,
        order: parseInt(order) || 0,
        isPublished: isPublished !== false,
      },
    });
    res.json({ message: 'Lesson created', lesson });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create lesson' });
  }
});

router.put('/lessons/:lessonId', authenticate, requireTeacher, async (req, res) => {
  try {
    const lesson = await prisma.lesson.findUnique({ where: { id: parseInt(req.params.lessonId) } });
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (!(await ownsCourse(req.user.id, lesson.courseId))) return res.status(403).json({ error: 'Forbidden' });
    const { title, content, videoUrl, weekNumber, order, isPublished } = req.body;
    const updated = await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        title: title ?? lesson.title,
        content: content ?? lesson.content,
        videoUrl: videoUrl ?? lesson.videoUrl,
        weekNumber: weekNumber !== undefined ? parseInt(weekNumber) : lesson.weekNumber,
        order: order !== undefined ? parseInt(order) : lesson.order,
        isPublished: isPublished !== undefined ? isPublished : lesson.isPublished,
      },
    });
    res.json({ message: 'Lesson updated', lesson: updated });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update lesson' });
  }
});

router.delete('/lessons/:lessonId', authenticate, requireTeacher, async (req, res) => {
  try {
    const lesson = await prisma.lesson.findUnique({ where: { id: parseInt(req.params.lessonId) } });
    if (!lesson) return res.status(404).json({ error: 'Not found' });
    if (!(await ownsCourse(req.user.id, lesson.courseId))) return res.status(403).json({ error: 'Forbidden' });
    await prisma.lesson.delete({ where: { id: lesson.id } });
    res.json({ message: 'Lesson deleted' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete lesson' });
  }
});

// ─── Assignments ───────────────────────────────────────────
router.post('/courses/:id/assignments', authenticate, requireTeacher, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    if (!(await ownsCourse(req.user.id, courseId))) return res.status(403).json({ error: 'Forbidden' });
    const { title, description, totalMarks, deadline, isPublished } = req.body;
    const assignment = await prisma.assignment.create({
      data: {
        courseId,
        title,
        description: description || null,
        totalMarks: parseFloat(totalMarks) || 100,
        deadline,
        isPublished: isPublished !== false,
      },
    });
    res.json({ message: 'Assignment created', assignment });
  } catch (e) {
    console.error('Create assignment error:', e);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

router.put('/assignments/:assignmentId', authenticate, requireTeacher, async (req, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({ where: { id: parseInt(req.params.assignmentId) } });
    if (!assignment) return res.status(404).json({ error: 'Not found' });
    if (!(await ownsCourse(req.user.id, assignment.courseId))) return res.status(403).json({ error: 'Forbidden' });
    const { title, description, totalMarks, deadline, isPublished } = req.body;
    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        title: title ?? assignment.title,
        description: description ?? assignment.description,
        totalMarks: totalMarks !== undefined ? parseFloat(totalMarks) : assignment.totalMarks,
        deadline: deadline ?? assignment.deadline,
        isPublished: isPublished !== undefined ? isPublished : assignment.isPublished,
      },
    });
    res.json({ message: 'Assignment updated', assignment: updated });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

router.delete('/assignments/:assignmentId', authenticate, requireTeacher, async (req, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({ where: { id: parseInt(req.params.assignmentId) } });
    if (!assignment) return res.status(404).json({ error: 'Not found' });
    if (!(await ownsCourse(req.user.id, assignment.courseId))) return res.status(403).json({ error: 'Forbidden' });
    await prisma.assignment.delete({ where: { id: assignment.id } });
    res.json({ message: 'Assignment deleted' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

// GET submissions for an assignment
router.get('/assignments/:assignmentId/submissions', authenticate, requireTeacher, async (req, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({ where: { id: parseInt(req.params.assignmentId) } });
    if (!assignment) return res.status(404).json({ error: 'Not found' });
    if (!(await ownsCourse(req.user.id, assignment.courseId))) return res.status(403).json({ error: 'Forbidden' });

    const [submissions, course] = await Promise.all([
      prisma.submission.findMany({
        where: { assignmentId: assignment.id },
        include: { student: { select: { id: true, email: true, profile: true, enrollment: true } } },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.course.findUnique({
        where: { id: assignment.courseId },
        include: { enrollments: { include: { student: { select: { id: true, email: true, profile: true, enrollment: true } } } } },
      }),
    ]);
    res.json({ assignment, submissions, enrolledStudents: course.enrollments });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// PUT grade a submission
router.put('/submissions/:submissionId/grade', authenticate, requireTeacher, async (req, res) => {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: parseInt(req.params.submissionId) },
      include: { assignment: true },
    });
    if (!submission) return res.status(404).json({ error: 'Not found' });
    if (!(await ownsCourse(req.user.id, submission.assignment.courseId))) return res.status(403).json({ error: 'Forbidden' });

    const { marks, feedback } = req.body;
    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: {
        marks: parseFloat(marks),
        feedback: feedback || null,
        status: 'GRADED',
        gradedAt: new Date(),
      },
    });

    // Notify student
    await prisma.lmsMessage.create({
      data: {
        userId: submission.studentId,
        title: 'Assignment Graded',
        message: `Your submission for "${submission.assignment.title}" has been graded. Marks: ${marks}/${submission.assignment.totalMarks}.`,
      },
    });

    res.json({ message: 'Submission graded', submission: updated });
  } catch (e) {
    console.error('Grade error:', e);
    res.status(500).json({ error: 'Failed to grade' });
  }
});

// ─── Materials ─────────────────────────────────────────────
router.post('/courses/:id/materials', authenticate, requireTeacher, uploadLmsMaterial.single('file'), async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    if (!(await ownsCourse(req.user.id, courseId))) return res.status(403).json({ error: 'Forbidden' });
    const { title, type, url } = req.body;
    const material = await prisma.material.create({
      data: {
        courseId,
        title,
        type: type || (req.file ? 'FILE' : 'LINK'),
        filePath: req.file ? `/uploads/lms-materials/${req.file.filename}` : null,
        fileName: req.file ? req.file.originalname : null,
        url: url || null,
      },
    });
    res.json({ message: 'Material added', material });
  } catch (e) {
    console.error('Add material error:', e);
    res.status(500).json({ error: 'Failed to add material' });
  }
});

router.delete('/materials/:materialId', authenticate, requireTeacher, async (req, res) => {
  try {
    const material = await prisma.material.findUnique({ where: { id: parseInt(req.params.materialId) } });
    if (!material) return res.status(404).json({ error: 'Not found' });
    if (!(await ownsCourse(req.user.id, material.courseId))) return res.status(403).json({ error: 'Forbidden' });
    await prisma.material.delete({ where: { id: material.id } });
    res.json({ message: 'Material deleted' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// ─── Announcements ─────────────────────────────────────────
router.post('/courses/:id/announcements', authenticate, requireTeacher, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    if (!(await ownsCourse(req.user.id, courseId))) return res.status(403).json({ error: 'Forbidden' });
    const { title, message } = req.body;
    const ann = await prisma.announcement.create({
      data: { courseId, authorId: req.user.id, title, message },
    });

    // Notify enrolled students
    const enrollments = await prisma.courseEnrollment.findMany({ where: { courseId } });
    for (const enr of enrollments) {
      await prisma.lmsMessage.create({
        data: { userId: enr.studentId, title: `Announcement: ${title}`, message },
      });
    }

    res.json({ message: 'Announcement posted', announcement: ann });
  } catch (e) {
    res.status(500).json({ error: 'Failed to post announcement' });
  }
});

router.delete('/announcements/:annId', authenticate, requireTeacher, async (req, res) => {
  try {
    const ann = await prisma.announcement.findUnique({ where: { id: parseInt(req.params.annId) } });
    if (!ann) return res.status(404).json({ error: 'Not found' });
    if (ann.authorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await prisma.announcement.delete({ where: { id: ann.id } });
    res.json({ message: 'Announcement deleted' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ─── Students in course (gradebook) ────────────────────────
router.get('/courses/:id/gradebook', authenticate, requireTeacher, async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);
    if (!(await ownsCourse(req.user.id, courseId))) return res.status(403).json({ error: 'Forbidden' });

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        enrollments: {
          include: { student: { select: { id: true, email: true, profile: true, enrollment: true } } },
        },
        assignments: {
          include: { submissions: true },
          orderBy: { deadline: 'asc' },
        },
      },
    });
    res.json({ course });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch gradebook' });
  }
});

// PUT final grade for a student in a course
router.put('/enrollments/:enrollmentId/grade', authenticate, requireTeacher, async (req, res) => {
  try {
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: { id: parseInt(req.params.enrollmentId) },
    });
    if (!enrollment) return res.status(404).json({ error: 'Not found' });
    if (!(await ownsCourse(req.user.id, enrollment.courseId))) return res.status(403).json({ error: 'Forbidden' });

    const { finalGrade, status } = req.body;
    const updated = await prisma.courseEnrollment.update({
      where: { id: enrollment.id },
      data: { finalGrade: finalGrade || null, status: status || enrollment.status },
    });
    res.json({ message: 'Grade updated', enrollment: updated });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update grade' });
  }
});

module.exports = router;

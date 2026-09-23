// ============================================================
//  SUPER ADMIN — LMS ACADEMIC ACTIONS CONTROLLER
//  ------------------------------------------------------------
//  Lets the Super Admin perform every TEACHER and COURSE-COORDINATOR
//  action with the SAME effect the original role produces — writing to
//  the exact same LMS tables (CourseResult, AttendanceSession/Record,
//  Assignment2, CourseMaterial, Section, CourseRegistration,
//  CourseOffering, TeacherReplacement). Every action is logged to
//  SaActivityLog and to the LMS LmsAuditLog so it reflects in LMS
//  audit trails too. Overrides of published results write OverrideLog.
//
//  Purely additive — no existing LMS file/route/table is modified.
// ============================================================
const { prisma, logSaActivity, logOverride, logLmsAudit } = require('./superAdmin.service');

function pageArgs(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// Grade computation mirrors the standard LMS scheme letter mapping.
function computeGrade(pct) {
  if (pct >= 85) return { letterGrade: 'A', gradePoints: 4.0 };
  if (pct >= 80) return { letterGrade: 'A-', gradePoints: 3.7 };
  if (pct >= 75) return { letterGrade: 'B+', gradePoints: 3.3 };
  if (pct >= 70) return { letterGrade: 'B', gradePoints: 3.0 };
  if (pct >= 65) return { letterGrade: 'B-', gradePoints: 2.7 };
  if (pct >= 60) return { letterGrade: 'C+', gradePoints: 2.3 };
  if (pct >= 55) return { letterGrade: 'C', gradePoints: 2.0 };
  if (pct >= 50) return { letterGrade: 'D', gradePoints: 1.0 };
  return { letterGrade: 'F', gradePoints: 0.0 };
}

// ==================================================================
//  RESULTS / MARKS  (Teacher effect)
// ==================================================================
// Upsert marks for a student in an offering — appears in the student's
// result records exactly like teacher-uploaded marks. Computes weighted
// total + letter grade from the offering's weightage.
async function upsertResult(req, res) {
  try {
    const offeringId = parseInt(req.params.offeringId, 10);
    const { studentId, assignmentMarks, quizMarks, midMarks, finalMarks,
      assignmentMax, quizMax, midMax, finalMax, status, remarks } = req.body || {};
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });

    const offering = await prisma.courseOffering.findUnique({ where: { id: offeringId } });
    if (!offering) return res.status(404).json({ error: 'Offering not found' });

    const aMax = Number(assignmentMax ?? 100), qMax = Number(quizMax ?? 100);
    const mMax = Number(midMax ?? 100), fMax = Number(finalMax ?? 100);
    const aM = Number(assignmentMarks ?? 0), qM = Number(quizMarks ?? 0);
    const mM = Number(midMarks ?? 0), fM = Number(finalMarks ?? 0);

    // Weighted percentage from offering weightage (component% of its max).
    const pct =
      (aMax ? (aM / aMax) * offering.assignmentWeight : 0) +
      (qMax ? (qM / qMax) * offering.quizWeight : 0) +
      (mMax ? (mM / mMax) * offering.midWeight : 0) +
      (fMax ? (fM / fMax) * offering.finalWeight : 0);
    const totalPercent = Math.round(pct * 100) / 100;
    const grade = computeGrade(totalPercent);

    const existing = await prisma.courseResult.findUnique({
      where: { offeringId_studentId: { offeringId, studentId } },
    }).catch(() => null);

    const data = {
      offeringId, studentId,
      assignmentMarks: aM, quizMarks: qM, midMarks: mM, finalMarks: fM,
      assignmentMax: aMax, quizMax: qMax, midMax: mMax, finalMax: fMax,
      totalPercent, letterGrade: grade.letterGrade, gradePoints: grade.gradePoints,
      status: status || 'DRAFT', remarks: remarks || null,
      publishedAt: (status === 'PUBLISHED') ? new Date() : (existing?.publishedAt || null),
    };

    const result = await prisma.courseResult.upsert({
      where: { offeringId_studentId: { offeringId, studentId } },
      update: data,
      create: data,
    });

    await logLmsAudit({ req, action: 'RESULT_UPSERT', entity: 'CourseResult', entityId: result.id, before: existing || undefined, after: result, actorRole: 'Teacher' });
    await logSaActivity({ req, module: 'lms', action: 'result_upsert', description: `Set marks for student ${studentId} in offering #${offeringId} (${totalPercent}% ${grade.letterGrade})`, metadata: { offeringId, studentId } });

    // Overriding a PUBLISHED result is a governance override → permanent log.
    if (existing && existing.status === 'PUBLISHED') {
      await logOverride({ req, targetModule: 'lms.courseResult', targetId: result.id, action: 'edit_published_result', originalValue: { totalPercent: existing.totalPercent, letterGrade: existing.letterGrade }, newValue: { totalPercent, letterGrade: grade.letterGrade }, reason: req.body.reason || 'Super Admin marks correction' });
    }

    res.json({ success: true, result });
  } catch (e) {
    console.error('SA upsertResult error:', e);
    res.status(500).json({ error: 'Failed to upsert result' });
  }
}

async function publishResult(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.courseResult.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Result not found' });
    const result = await prisma.courseResult.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    await logLmsAudit({ req, action: 'RESULT_PUBLISH', entity: 'CourseResult', entityId: id, before: existing, after: result, actorRole: 'Teacher' });
    await logSaActivity({ req, module: 'lms', action: 'result_publish', description: `Published result #${id}`, metadata: { resultId: id } });
    res.json({ success: true, result });
  } catch (e) {
    console.error('SA publishResult error:', e);
    res.status(500).json({ error: 'Failed to publish result' });
  }
}

// ==================================================================
//  ATTENDANCE  (Teacher effect)
// ==================================================================
async function listAttendanceSessions(req, res) {
  try {
    const offeringId = parseInt(req.query.offeringId, 10);
    if (!offeringId) return res.status(400).json({ error: 'offeringId is required' });
    const sessions = await prisma.attendanceSession.findMany({
      where: { offeringId }, orderBy: { date: 'desc' },
      include: { _count: { select: { records: true } } },
    });
    res.json({ sessions });
  } catch (e) {
    console.error('SA listAttendanceSessions error:', e);
    res.status(500).json({ error: 'Failed to load attendance sessions' });
  }
}

// Create/get a session for a date, then mark records for students.
async function markAttendance(req, res) {
  try {
    const offeringId = parseInt(req.params.offeringId, 10);
    const { date, topic, records } = req.body || {};
    if (!date || !Array.isArray(records)) {
      return res.status(400).json({ error: 'date and records[] are required' });
    }
    const offering = await prisma.courseOffering.findUnique({ where: { id: offeringId } });
    if (!offering) return res.status(404).json({ error: 'Offering not found' });

    const session = await prisma.attendanceSession.upsert({
      where: { offeringId_date: { offeringId, date } },
      update: { topic: topic || undefined },
      create: { offeringId, date, topic: topic || null },
    });

    let marked = 0;
    for (const r of records) {
      if (!r.studentId) continue;
      const status = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'].includes(r.status) ? r.status : 'PRESENT';
      await prisma.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId: r.studentId } },
        update: { status, remarks: r.remarks || null },
        create: { sessionId: session.id, studentId: r.studentId, status, remarks: r.remarks || null },
      });
      marked += 1;
    }
    await logLmsAudit({ req, action: 'ATTENDANCE_MARK', entity: 'AttendanceSession', entityId: session.id, after: { date, marked }, actorRole: 'Teacher' });
    await logSaActivity({ req, module: 'lms', action: 'attendance_mark', description: `Marked attendance for offering #${offeringId} on ${date} (${marked} students)`, metadata: { offeringId, date, marked } });
    res.json({ success: true, sessionId: session.id, marked });
  } catch (e) {
    console.error('SA markAttendance error:', e);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
}

// ==================================================================
//  ASSIGNMENTS  (Teacher effect)
// ==================================================================
async function listAssignments(req, res) {
  try {
    const offeringId = parseInt(req.query.offeringId, 10);
    const where = { isDeleted: false };
    if (offeringId) where.offeringId = offeringId;
    const assignments = await prisma.assignment2.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ assignments });
  } catch (e) {
    console.error('SA listAssignments error:', e);
    res.status(500).json({ error: 'Failed to load assignments' });
  }
}

async function createAssignment(req, res) {
  try {
    const { offeringId, title, description, totalMarks, dueDate, allowLate } = req.body || {};
    if (!offeringId || !title || !dueDate) {
      return res.status(400).json({ error: 'offeringId, title and dueDate are required' });
    }
    const a = await prisma.assignment2.create({
      data: {
        offeringId: parseInt(offeringId, 10), title,
        description: description || null,
        totalMarks: Number(totalMarks ?? 100),
        dueDate, allowLate: allowLate !== false,
      },
    });
    await logLmsAudit({ req, action: 'ASSIGNMENT_CREATE', entity: 'Assignment2', entityId: a.id, after: a, actorRole: 'Teacher' });
    await logSaActivity({ req, module: 'lms', action: 'assignment_create', description: `Created assignment "${title}" in offering #${offeringId}`, metadata: { offeringId, assignmentId: a.id } });
    res.json({ success: true, assignment: a });
  } catch (e) {
    console.error('SA createAssignment error:', e);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
}

async function updateAssignment(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.assignment2.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Assignment not found' });
    const b = req.body || {};
    const data = {};
    ['title', 'description', 'dueDate'].forEach((f) => { if (b[f] !== undefined) data[f] = b[f]; });
    if (b.totalMarks !== undefined) data.totalMarks = Number(b.totalMarks);
    if (b.allowLate !== undefined) data.allowLate = !!b.allowLate;
    if (b.isPublished !== undefined) data.isPublished = !!b.isPublished;
    const a = await prisma.assignment2.update({ where: { id }, data });
    await logLmsAudit({ req, action: 'ASSIGNMENT_UPDATE', entity: 'Assignment2', entityId: id, before: existing, after: a, actorRole: 'Teacher' });
    await logSaActivity({ req, module: 'lms', action: 'assignment_update', description: `Updated assignment #${id}`, metadata: { assignmentId: id } });
    res.json({ success: true, assignment: a });
  } catch (e) {
    console.error('SA updateAssignment error:', e);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
}

// ==================================================================
//  RECORDED LECTURES / COURSE MATERIAL  (Teacher effect)
// ==================================================================
async function listMaterials(req, res) {
  try {
    const offeringId = parseInt(req.query.offeringId, 10);
    const where = { isDeleted: false };
    if (offeringId) where.offeringId = offeringId;
    const materials = await prisma.courseMaterial.findMany({ where, orderBy: [{ weekNumber: 'asc' }, { createdAt: 'desc' }] });
    res.json({ materials });
  } catch (e) {
    console.error('SA listMaterials error:', e);
    res.status(500).json({ error: 'Failed to load materials' });
  }
}

async function createMaterial(req, res) {
  try {
    const { offeringId, title, type, url, weekNumber, description, lectureNumber, resourceType } = req.body || {};
    if (!offeringId || !title) return res.status(400).json({ error: 'offeringId and title are required' });
    const m = await prisma.courseMaterial.create({
      data: {
        offeringId: parseInt(offeringId, 10), title,
        type: type || 'LINK', url: url || null,
        weekNumber: Number(weekNumber ?? 1),
        description: description || null,
        lectureNumber: lectureNumber != null ? Number(lectureNumber) : null,
        resourceType: resourceType || null,
      },
    });
    await logLmsAudit({ req, action: 'MATERIAL_CREATE', entity: 'CourseMaterial', entityId: m.id, after: m, actorRole: 'Teacher' });
    await logSaActivity({ req, module: 'lms', action: 'material_create', description: `Uploaded material "${title}" to offering #${offeringId}`, metadata: { offeringId, materialId: m.id } });
    res.json({ success: true, material: m });
  } catch (e) {
    console.error('SA createMaterial error:', e);
    res.status(500).json({ error: 'Failed to create material' });
  }
}

async function deleteMaterial(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.courseMaterial.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Material not found' });
    await prisma.courseMaterial.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
    await logLmsAudit({ req, action: 'MATERIAL_DELETE', entity: 'CourseMaterial', entityId: id, before: existing, actorRole: 'Teacher' });
    await logSaActivity({ req, module: 'lms', action: 'material_delete', description: `Deleted material #${id}`, metadata: { materialId: id } });
    res.json({ success: true });
  } catch (e) {
    console.error('SA deleteMaterial error:', e);
    res.status(500).json({ error: 'Failed to delete material' });
  }
}

// ==================================================================
//  SECTIONS  (Course Coordinator effect)
// ==================================================================
async function listSections(req, res) {
  try {
    const offeringId = parseInt(req.query.offeringId, 10);
    const where = { isDeleted: false };
    if (offeringId) where.offeringId = offeringId;
    const sections = await prisma.section.findMany({
      where, orderBy: { name: 'asc' },
      include: { teacher: { select: { id: true, username: true, email: true } }, _count: { select: { registrations: true } } },
    });
    res.json({ sections });
  } catch (e) {
    console.error('SA listSections error:', e);
    res.status(500).json({ error: 'Failed to load sections' });
  }
}

async function createSection(req, res) {
  try {
    const { offeringId, name, capacity, teacherId, room } = req.body || {};
    if (!offeringId || !name) return res.status(400).json({ error: 'offeringId and name are required' });
    const s = await prisma.section.create({
      data: { offeringId: parseInt(offeringId, 10), name, capacity: Number(capacity ?? 50), teacherId: teacherId || null, room: room || null },
    });
    await logLmsAudit({ req, action: 'SECTION_CREATE', entity: 'Section', entityId: s.id, after: s, actorRole: 'CourseCoordinator' });
    await logSaActivity({ req, module: 'lms', action: 'section_create', description: `Created section "${name}" in offering #${offeringId}`, metadata: { offeringId, sectionId: s.id } });
    res.json({ success: true, section: s });
  } catch (e) {
    console.error('SA createSection error:', e);
    res.status(500).json({ error: 'Failed to create section' });
  }
}

// Move a student between sections (Course Coordinator effect).
async function moveStudentSection(req, res) {
  try {
    const { registrationId, sectionId } = req.body || {};
    if (!registrationId) return res.status(400).json({ error: 'registrationId is required' });
    const reg = await prisma.courseRegistration.findUnique({ where: { id: parseInt(registrationId, 10) } });
    if (!reg) return res.status(404).json({ error: 'Registration not found' });
    const updated = await prisma.courseRegistration.update({
      where: { id: reg.id },
      data: { sectionId: sectionId ? parseInt(sectionId, 10) : null },
    });
    await logLmsAudit({ req, action: 'STUDENT_SECTION_MOVE', entity: 'CourseRegistration', entityId: reg.id, before: { sectionId: reg.sectionId }, after: { sectionId: updated.sectionId }, actorRole: 'CourseCoordinator' });
    await logSaActivity({ req, module: 'lms', action: 'student_section_move', description: `Moved registration #${reg.id} to section ${sectionId || 'none'}`, metadata: { registrationId: reg.id, sectionId } });
    res.json({ success: true, registration: updated });
  } catch (e) {
    console.error('SA moveStudentSection error:', e);
    res.status(500).json({ error: 'Failed to move student' });
  }
}

// ==================================================================
//  TEACHER ASSIGNMENT / REPLACEMENT  (Course Coordinator effect)
// ==================================================================
// Assign or replace the teacher on an offering. When replacing, all
// the offering's data (attendance, results, assessments, material)
// stays attached to the offering — only the teacherId pointer changes,
// so there is zero data loss. A TeacherReplacement audit row is kept.
async function assignTeacher(req, res) {
  try {
    const offeringId = parseInt(req.params.offeringId, 10);
    const { teacherId, reason } = req.body || {};
    const offering = await prisma.courseOffering.findUnique({ where: { id: offeringId } });
    if (!offering) return res.status(404).json({ error: 'Offering not found' });
    const prevTeacher = offering.teacherId;

    const updated = await prisma.courseOffering.update({ where: { id: offeringId }, data: { teacherId: teacherId || null } });

    // Permanent replacement record (best-effort — model is additive).
    if (prevTeacher && teacherId && prevTeacher !== teacherId) {
      await prisma.teacherReplacement.create({
        data: {
          originalTeacherId: prevTeacher,
          replacementTeacherId: teacherId,
          offeringId,
          reason: reason || 'Super Admin reassignment',
          status: 'APPROVED',
          applied: true,
          createdById: String(req.user?.id || 'super_admin'),
        },
      }).catch(() => {});
    }
    await logLmsAudit({ req, action: 'TEACHER_ASSIGN', entity: 'CourseOffering', entityId: offeringId, before: { teacherId: prevTeacher }, after: { teacherId }, actorRole: 'CourseCoordinator' });
    await logSaActivity({ req, module: 'lms', action: 'teacher_assign', description: `Assigned teacher ${teacherId} to offering #${offeringId} (was ${prevTeacher || 'none'})`, metadata: { offeringId, from: prevTeacher, to: teacherId } });
    res.json({ success: true, offering: updated });
  } catch (e) {
    console.error('SA assignTeacher error:', e);
    res.status(500).json({ error: 'Failed to assign teacher' });
  }
}

// Roster of students for an offering (for marks / attendance UIs).
async function offeringRoster(req, res) {
  try {
    const offeringId = parseInt(req.params.offeringId, 10);
    const regs = await prisma.courseRegistration.findMany({
      where: { offeringId, status: { in: ['ENROLLED', 'COMPLETED'] } },
      include: { student: { select: { id: true, username: true, email: true, linkedRollNumber: true } }, section: { select: { id: true, name: true } } },
      orderBy: { registeredAt: 'asc' },
    });
    res.json({ roster: regs });
  } catch (e) {
    console.error('SA offeringRoster error:', e);
    res.status(500).json({ error: 'Failed to load roster' });
  }
}

module.exports = {
  upsertResult, publishResult,
  listAttendanceSessions, markAttendance,
  listAssignments, createAssignment, updateAssignment,
  listMaterials, createMaterial, deleteMaterial,
  listSections, createSection, moveStudentSection,
  assignTeacher, offeringRoster,
};

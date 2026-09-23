// ============================================================
//  SUPER ADMIN — LMS GOVERNANCE CONTROLLER
//  ------------------------------------------------------------
//  Lets the Super Admin perform every FOCAL PERSON, EXAM CONTROLLER,
//  PROVOST and QEC COORDINATOR action with the SAME effect as the
//  original role — writing to the exact same LMS tables:
//    - drop / restore students (LmsUser.isActive + CourseRegistration)
//    - issue fines (LmsFeeChallan)  → appears in student account book
//    - announce fees (LmsFeeAnnouncement → LmsFeeChallan per student)
//    - approve / reject fee submissions (LmsFeeChallan.status)
//    - block / unblock students (LmsStudentBlock)
//    - exam attendance / UFM (ExamAttendance), recheck (RecheckRequest)
//    - promotion / detention (CourseRegistration status)
//    - surveys enable/disable + anonymized results (Survey)
//
//  Every action → SaActivityLog + LmsAuditLog. Destructive overrides
//  (drop / restore / result holds) also write OverrideLog with reason.
//  Purely additive — no existing LMS file/route/table is modified.
// ============================================================
const { prisma, logSaActivity, logOverride, logLmsAudit } = require('./superAdmin.service');

function pageArgs(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function challanNo() {
  return `CH-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

// ==================================================================
//  STUDENT SEARCH (Focal Person multi-filter)
// ==================================================================
async function searchStudents(req, res) {
  try {
    const { page, pageSize, skip, take } = pageArgs(req);
    const where = { role: 'Student' };
    const q = req.query.q;
    if (q) {
      where.OR = [
        { username: { contains: q } },
        { email: { contains: q } },
        { linkedRollNumber: { contains: q } },
      ];
    }
    if (req.query.isActive !== undefined && req.query.isActive !== '') {
      where.isActive = req.query.isActive === 'true';
    }
    const [rows, total] = await Promise.all([
      prisma.lmsUser.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        select: {
          id: true, username: true, email: true, role: true, isActive: true,
          linkedRollNumber: true, lastLoginAt: true, createdAt: true,
          profile: { select: { fullName: true, programShortForm: true, department: true, rollNumber: true, fatherName: true, cnic: true, phone: true } },
        },
      }),
      prisma.lmsUser.count({ where }),
    ]);
    res.json({ students: rows, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) {
    console.error('SA searchStudents error:', e);
    res.status(500).json({ error: 'Failed to search students' });
  }
}

// ==================================================================
//  DROP / RESTORE STUDENT  (Focal Person effect)
// ==================================================================
// Drop: deactivate LMS access + mark current registrations DROPPED.
async function dropStudent(req, res) {
  try {
    const studentId = req.params.studentId;
    const { reason } = req.body || {};
    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({ error: 'A drop reason is required' });
    }
    const student = await prisma.lmsUser.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    await prisma.lmsUser.update({ where: { id: studentId }, data: { isActive: false } });
    const upd = await prisma.courseRegistration.updateMany({
      where: { studentId, status: 'ENROLLED' },
      data: { status: 'DROPPED' },
    });

    await logLmsAudit({ req, action: 'STUDENT_DROP', entity: 'LmsUser', entityId: studentId, before: { isActive: true }, after: { isActive: false, reason }, actorRole: 'FocalPerson' });
    await logOverride({ req, targetModule: 'lms.student', targetId: studentId, action: 'drop', originalValue: 'active', newValue: 'dropped', reason });
    await logSaActivity({ req, module: 'lms', action: 'student_drop', description: `Dropped student ${student.username} (${upd.count} registrations) — ${reason}`, metadata: { studentId, reason, droppedRegistrations: upd.count } });
    res.json({ success: true, studentId, droppedRegistrations: upd.count });
  } catch (e) {
    console.error('SA dropStudent error:', e);
    res.status(500).json({ error: 'Failed to drop student' });
  }
}

// Restore: re-activate LMS access + restore DROPPED registrations.
async function restoreStudent(req, res) {
  try {
    const studentId = req.params.studentId;
    const { reason } = req.body || {};
    const student = await prisma.lmsUser.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    await prisma.lmsUser.update({ where: { id: studentId }, data: { isActive: true } });
    const upd = await prisma.courseRegistration.updateMany({
      where: { studentId, status: 'DROPPED' },
      data: { status: 'ENROLLED' },
    });
    await logLmsAudit({ req, action: 'STUDENT_RESTORE', entity: 'LmsUser', entityId: studentId, before: { isActive: false }, after: { isActive: true }, actorRole: 'FocalPerson' });
    await logOverride({ req, targetModule: 'lms.student', targetId: studentId, action: 'restore', originalValue: 'dropped', newValue: 'active', reason: reason || 'Super Admin restore' });
    await logSaActivity({ req, module: 'lms', action: 'student_restore', description: `Restored student ${student.username} (${upd.count} registrations)`, metadata: { studentId, restoredRegistrations: upd.count } });
    res.json({ success: true, studentId, restoredRegistrations: upd.count });
  } catch (e) {
    console.error('SA restoreStudent error:', e);
    res.status(500).json({ error: 'Failed to restore student' });
  }
}

// ==================================================================
//  ISSUE FINE  (Focal Person / Provost effect)
//  Creates a LmsFeeChallan that appears in the student's account book.
// ==================================================================
async function issueFine(req, res) {
  try {
    const studentId = req.params.studentId;
    const { title, reason, amount, dueDate } = req.body || {};
    if (!title || amount == null) return res.status(400).json({ error: 'title and amount are required' });
    const student = await prisma.lmsUser.findUnique({ where: { id: studentId }, include: { profile: true } });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const amt = Number(amount);
    const challan = await prisma.lmsFeeChallan.create({
      data: {
        studentId, challanNo: challanNo(), title,
        lineItems: JSON.stringify([{ label: title, amount: amt }]),
        totalAmount: amt, dueDate: dueDate || null, status: 'UNPAID',
        feeType: 'OTHER', description: reason || null,
        program: student.profile?.programShortForm || null,
        department: student.profile?.department || null,
      },
    });
    await logLmsAudit({ req, action: 'FINE_ISSUE', entity: 'LmsFeeChallan', entityId: challan.id, after: challan, actorRole: 'FocalPerson' });
    await logSaActivity({ req, module: 'lms', action: 'fine_issue', description: `Issued fine "${title}" (Rs ${amt}) to ${student.username}`, metadata: { studentId, challanId: challan.id, amount: amt } });
    res.json({ success: true, challan });
  } catch (e) {
    console.error('SA issueFine error:', e);
    res.status(500).json({ error: 'Failed to issue fine' });
  }
}

// ==================================================================
//  ANNOUNCE FEE  (Provost effect)
//  Creates a LmsFeeAnnouncement and a LmsFeeChallan in every matching
//  student's account book — exactly as a Provost announcement does.
// ==================================================================
async function announceFee(req, res) {
  try {
    const { feeType, title, description, amount, dueDate, scope, department, program, semester, section } = req.body || {};
    if (!feeType || !title || amount == null) {
      return res.status(400).json({ error: 'feeType, title and amount are required' });
    }
    const amt = Number(amount);

    // Resolve matching students by scope from their LMS profile.
    const profWhere = {};
    if (scope === 'DEPARTMENT' && department) profWhere.department = department;
    if (scope === 'PROGRAM' && program) profWhere.programShortForm = program;
    // Note: LmsStudentProfile tracks department & programShortForm; finer
    // semester/section scoping is preserved on the announcement + challan
    // records (the profile model does not store current semester/section).

    const students = await prisma.lmsUser.findMany({
      where: { role: 'Student', isActive: true, ...(Object.keys(profWhere).length ? { profile: profWhere } : {}) },
      include: { profile: true },
    });

    const ann = await prisma.lmsFeeAnnouncement.create({
      data: {
        feeType, title, description: description || null, amount: amt,
        dueDate: dueDate || null, scope: scope || 'UNIVERSITY',
        department: department || null, program: program || null,
        semester: semester != null ? Number(semester) : null, section: section || null,
        status: 'ACTIVE', createdById: String(req.user?.id || 'super_admin'),
        studentCount: students.length, totalBilled: amt * students.length,
      },
    });

    let created = 0;
    for (const s of students) {
      await prisma.lmsFeeChallan.create({
        data: {
          studentId: s.id, challanNo: challanNo(), title,
          lineItems: JSON.stringify([{ label: title, amount: amt }]),
          totalAmount: amt, dueDate: dueDate || null, status: 'UNPAID',
          feeType, description: description || null,
          program: s.profile?.programShortForm || null,
          department: s.profile?.department || null,
          semester: semester != null ? Number(semester) : null,
          section: section || null,
          sourceAnnouncementId: ann.id,
        },
      }).catch(() => {});
      created += 1;
    }
    await logLmsAudit({ req, action: 'FEE_ANNOUNCE', entity: 'LmsFeeAnnouncement', entityId: ann.id, after: { ann, challans: created }, actorRole: 'Provost' });
    await logSaActivity({ req, module: 'lms', action: 'fee_announce', description: `Announced ${feeType} fee "${title}" (Rs ${amt}) → ${created} challans`, metadata: { announcementId: ann.id, challans: created } });
    res.json({ success: true, announcement: ann, challansCreated: created });
  } catch (e) {
    console.error('SA announceFee error:', e);
    res.status(500).json({ error: 'Failed to announce fee' });
  }
}

// Approve / reject a fee challan submission (Provost effect).
async function reviewFeeChallan(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { action, reason } = req.body || {};
    const challan = await prisma.lmsFeeChallan.findUnique({ where: { id } });
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    let status;
    if (action === 'approve') status = 'PAID';
    else if (action === 'reject') status = 'UNPAID';
    else if (action === 'waive') status = 'WAIVED';
    else return res.status(400).json({ error: 'action must be approve|reject|waive' });

    if (action === 'reject' && (!reason || String(reason).trim().length < 3)) {
      return res.status(400).json({ error: 'A rejection reason is required' });
    }

    const updated = await prisma.lmsFeeChallan.update({
      where: { id },
      data: { status, paidAt: action === 'approve' ? new Date() : null },
    });
    await logLmsAudit({ req, action: `FEE_${action.toUpperCase()}`, entity: 'LmsFeeChallan', entityId: id, before: { status: challan.status }, after: { status }, actorRole: 'Provost' });
    await logSaActivity({ req, module: 'lms', action: 'fee_review', description: `${action} fee challan #${id} → ${status}`, metadata: { challanId: id, action, reason: reason || null } });
    res.json({ success: true, challan: updated });
  } catch (e) {
    console.error('SA reviewFeeChallan error:', e);
    res.status(500).json({ error: 'Failed to review fee challan' });
  }
}

// ==================================================================
//  BLOCK / UNBLOCK STUDENT  (Provost finance effect)
// ==================================================================
async function blockStudent(req, res) {
  try {
    const studentId = req.params.studentId;
    const { reason } = req.body || {};
    if (!reason) return res.status(400).json({ error: 'A block reason is required' });
    const student = await prisma.lmsUser.findUnique({ where: { id: studentId }, include: { profile: true } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const block = await prisma.lmsStudentBlock.create({
      data: {
        studentId, reason,
        program: student.profile?.programShortForm || null,
        department: student.profile?.department || null,
        blockedById: String(req.user?.id || 'super_admin'),
      },
    });
    await logLmsAudit({ req, action: 'STUDENT_BLOCK', entity: 'LmsStudentBlock', entityId: block.id, after: block, actorRole: 'Provost' });
    await logSaActivity({ req, module: 'lms', action: 'student_block', description: `Blocked student ${student.username} — ${reason}`, metadata: { studentId, blockId: block.id } });
    res.json({ success: true, block });
  } catch (e) {
    console.error('SA blockStudent error:', e);
    res.status(500).json({ error: 'Failed to block student' });
  }
}

async function unblockStudent(req, res) {
  try {
    const studentId = req.params.studentId;
    const { note } = req.body || {};
    const active = await prisma.lmsStudentBlock.findFirst({ where: { studentId, unblockedAt: null }, orderBy: { blockedAt: 'desc' } });
    if (!active) return res.status(404).json({ error: 'No active block found' });
    const upd = await prisma.lmsStudentBlock.update({
      where: { id: active.id },
      data: { unblockedAt: new Date(), unblockedById: String(req.user?.id || 'super_admin'), unblockNote: note || null },
    });
    await logLmsAudit({ req, action: 'STUDENT_UNBLOCK', entity: 'LmsStudentBlock', entityId: active.id, after: upd, actorRole: 'Provost' });
    await logSaActivity({ req, module: 'lms', action: 'student_unblock', description: `Unblocked student ${studentId}`, metadata: { studentId, blockId: active.id } });
    res.json({ success: true, block: upd });
  } catch (e) {
    console.error('SA unblockStudent error:', e);
    res.status(500).json({ error: 'Failed to unblock student' });
  }
}

// ==================================================================
//  EXAM ATTENDANCE / UFM  (Exam Controller effect)
// ==================================================================
async function setExamAttendance(req, res) {
  try {
    const examId = parseInt(req.params.examId, 10);
    const { studentId, status, remarks } = req.body || {};
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });
    const allowed = ['PRESENT', 'ABSENT', 'LATE', 'UFM', 'EXEMPT'];
    const st = allowed.includes(status) ? status : 'PRESENT';
    const rec = await prisma.examAttendance.upsert({
      where: { examId_studentId: { examId, studentId } },
      update: { status: st, remarks: remarks || null, verifiedById: String(req.user?.id || 'super_admin'), verifiedAt: new Date() },
      create: { examId, studentId, status: st, remarks: remarks || null, verifiedById: String(req.user?.id || 'super_admin'), verifiedAt: new Date() },
    });
    await logLmsAudit({ req, action: 'EXAM_ATTENDANCE', entity: 'ExamAttendance', entityId: rec.id, after: rec, actorRole: 'ExamController' });
    if (st === 'UFM') {
      await logOverride({ req, targetModule: 'lms.examAttendance', targetId: rec.id, action: 'ufm_flag', newValue: 'UFM', reason: remarks || 'UFM case flagged by Super Admin' });
    }
    await logSaActivity({ req, module: 'lms', action: 'exam_attendance', description: `Set exam #${examId} attendance for ${studentId} → ${st}`, metadata: { examId, studentId, status: st } });
    res.json({ success: true, attendance: rec });
  } catch (e) {
    console.error('SA setExamAttendance error:', e);
    res.status(500).json({ error: 'Failed to set exam attendance' });
  }
}

// ==================================================================
//  PROMOTION / DETENTION  (Exam Controller effect)
//  Marks a student's term registrations COMPLETED (promote) or keeps
//  them ENROLLED while flagging detention via audit.
// ==================================================================
async function setPromotion(req, res) {
  try {
    const studentId = req.params.studentId;
    const { decision, reason } = req.body || {}; // PROMOTE | DETAIN
    if (!['PROMOTE', 'DETAIN'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be PROMOTE or DETAIN' });
    }
    const student = await prisma.lmsUser.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (decision === 'PROMOTE') {
      await prisma.courseRegistration.updateMany({ where: { studentId, status: 'ENROLLED' }, data: { status: 'COMPLETED' } });
    }
    await logLmsAudit({ req, action: `STUDENT_${decision}`, entity: 'LmsUser', entityId: studentId, after: { decision, reason }, actorRole: 'ExamController' });
    await logOverride({ req, targetModule: 'lms.promotion', targetId: studentId, action: decision.toLowerCase(), newValue: decision, reason: reason || `Super Admin ${decision}` });
    await logSaActivity({ req, module: 'lms', action: 'promotion', description: `${decision} student ${student.username}`, metadata: { studentId, decision } });
    res.json({ success: true, decision });
  } catch (e) {
    console.error('SA setPromotion error:', e);
    res.status(500).json({ error: 'Failed to set promotion' });
  }
}

// ==================================================================
//  RECHECK REQUESTS  (Exam Controller effect)
// ==================================================================
async function listRechecks(req, res) {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const rows = await prisma.recheckRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    res.json({ rechecks: rows });
  } catch (e) {
    console.error('SA listRechecks error:', e);
    res.status(500).json({ error: 'Failed to load recheck requests' });
  }
}

async function updateRecheck(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, newMarks, resolution } = req.body || {};
    const existing = await prisma.recheckRequest.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Recheck request not found' });
    const data = { status: status || existing.status, resolution: resolution || existing.resolution, handledById: String(req.user?.id || 'super_admin') };
    if (newMarks != null) data.newMarks = Number(newMarks);
    if (status && status.startsWith('RESOLVED')) data.resolvedAt = new Date();
    const upd = await prisma.recheckRequest.update({ where: { id }, data });
    await logLmsAudit({ req, action: 'RECHECK_UPDATE', entity: 'RecheckRequest', entityId: id, before: existing, after: upd, actorRole: 'ExamController' });
    await logSaActivity({ req, module: 'lms', action: 'recheck_update', description: `Updated recheck #${id} → ${data.status}`, metadata: { recheckId: id } });
    res.json({ success: true, recheck: upd });
  } catch (e) {
    console.error('SA updateRecheck error:', e);
    res.status(500).json({ error: 'Failed to update recheck' });
  }
}

// ==================================================================
//  SURVEYS  (QEC Coordinator effect)
// ==================================================================
async function listSurveys(req, res) {
  try {
    const surveys = await prisma.survey.findMany({
      where: { isDeleted: false }, orderBy: { createdAt: 'desc' },
      include: { _count: { select: { responses: true, questions: true } } },
    });
    res.json({ surveys });
  } catch (e) {
    console.error('SA listSurveys error:', e);
    res.status(500).json({ error: 'Failed to load surveys' });
  }
}

async function toggleSurvey(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const { isActive } = req.body || {};
    const existing = await prisma.survey.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Survey not found' });
    const upd = await prisma.survey.update({ where: { id }, data: { isActive: !!isActive } });
    await logLmsAudit({ req, action: 'SURVEY_TOGGLE', entity: 'Survey', entityId: id, after: { isActive: !!isActive }, actorRole: 'QECCoordinator' });
    await logSaActivity({ req, module: 'lms', action: 'survey_toggle', description: `${isActive ? 'Enabled' : 'Disabled'} survey #${id}`, metadata: { surveyId: id, isActive: !!isActive } });
    res.json({ success: true, survey: upd });
  } catch (e) {
    console.error('SA toggleSurvey error:', e);
    res.status(500).json({ error: 'Failed to toggle survey' });
  }
}

// Anonymized aggregated survey results — no student identity revealed.
async function surveyResults(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const survey = await prisma.survey.findUnique({ where: { id }, include: { questions: true } });
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    const responses = await prisma.surveyResponse.findMany({ where: { surveyId: id }, select: { answersJson: true } });
    // Aggregate per question — identity intentionally omitted.
    const agg = {};
    for (const q of survey.questions) agg[q.id] = { text: q.text, type: q.type, count: 0, sum: 0, answers: {} };
    for (const r of responses) {
      let parsed = {};
      try { parsed = JSON.parse(r.answersJson || '{}'); } catch (_) {}
      for (const [qid, ans] of Object.entries(parsed)) {
        if (!agg[qid]) continue;
        agg[qid].count += 1;
        const num = Number(ans);
        if (!Number.isNaN(num)) agg[qid].sum += num;
        const key = String(ans);
        agg[qid].answers[key] = (agg[qid].answers[key] || 0) + 1;
      }
    }
    const results = Object.values(agg).map((a) => ({ ...a, average: a.count ? Math.round((a.sum / a.count) * 100) / 100 : null }));
    res.json({ surveyId: id, title: survey.title, totalResponses: responses.length, anonymous: survey.isAnonymous, results });
  } catch (e) {
    console.error('SA surveyResults error:', e);
    res.status(500).json({ error: 'Failed to load survey results' });
  }
}

module.exports = {
  searchStudents,
  dropStudent, restoreStudent,
  issueFine, announceFee, reviewFeeChallan,
  blockStudent, unblockStudent,
  setExamAttendance, setPromotion,
  listRechecks, updateRecheck,
  listSurveys, toggleSurvey, surveyResults,
};

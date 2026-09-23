// ============================================================
//  FEE MANAGEMENT (Fix 3) — Semester / enrollment / tuition fee announced
//  by the Director Admissions separately PER department PER program for a
//  given admission cycle. This is DISTINCT from the application processing
//  fee set at cycle-announce time and from the legacy FeeAnnouncement.
//
//  All routes live under the /api/fee-management/ prefix and do not modify
//  any existing route. A new FeeStructure model backs this feature.
//
//  Visibility rule (enforced on the student-facing GET): only students who
//  appear on the FINALIZED merit list for that specific program+cycle may
//  see the fee.
// ============================================================

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const {
  authenticate,
  requireAdmin,
  requireAdminOrCoordinator,
  attachCoordinatorScope,
} = require('../middleware/auth');
const { confirmEnrollment } = require('../utils/enrollmentCredentials');
const { notify } = require('../utils/notify');
const {
  sendFeeStatusEmail,
  sendEnrollmentConfirmedEmail,
} = require('../utils/email');

const router = express.Router();
const prisma = new PrismaClient();

function safeParseJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// Normalise + validate a lineItems array; returns { items, total } or throws.
function buildLineItems(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    const err = new Error('At least one fee line item is required');
    err.field = 'lineItems';
    throw err;
  }
  const items = [];
  for (const li of lineItems) {
    const label = String(li.label || '').trim();
    const amount = parseFloat(li.amount);
    if (!label) {
      const err = new Error('Each fee line item needs a label');
      err.field = 'lineItems';
      throw err;
    }
    if (isNaN(amount) || amount < 0) {
      const err = new Error(`Amount for "${label}" must be a non-negative number`);
      err.field = 'lineItems';
      throw err;
    }
    items.push({ label, amount });
  }
  const total = items.reduce((s, li) => s + li.amount, 0);
  return { items, total };
}

// Has any fee payment been submitted for this cycle+program? Used to lock edits.
async function hasAnyPayment(cycleId, programId) {
  const count = await prisma.feePayment.count({
    where: { application: { admissionCycleId: cycleId, programId } },
  });
  return count > 0;
}

// Notify students on the finalized merit list for a program+cycle that the fee
// is now available. Best-effort; failures are swallowed by the caller.
async function notifyEligibleStudents(cycleId, programId, programName, total) {
  const apps = await prisma.application.findMany({
    where: {
      admissionCycleId: cycleId,
      programId,
      meritEntry: { is: { isFinalized: true } },
    },
    select: { userId: true },
  });
  for (const a of apps) {
    await prisma.notification.create({
      data: {
        userId: a.userId,
        title: 'Semester Fee Announced',
        message: `The semester/enrollment fee (PKR ${Number(total).toLocaleString()}) for ${programName} has been announced. View the breakdown and pay it from the Fee tab in your dashboard.`,
      },
    }).catch(() => {});
  }
}

// ------------------------------------------------------------
// GET /api/fee-management/overview — Director/Coordinator management view.
// Returns active cycles → departments → programs with the fee status for each
// department-program combination (Set / Announced + total + locked flag).
// Coordinators are scoped to their own department only.
// ------------------------------------------------------------
router.get('/overview', authenticate, requireAdminOrCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const cycles = await prisma.admissionCycle.findMany({
      where: { isOpen: true },
      orderBy: { createdAt: 'desc' },
    });

    const result = [];
    for (const cycle of cycles) {
      // Programs that belong to this cycle (via CycleProgram), with dept info.
      const cyclePrograms = await prisma.cycleProgram.findMany({
        where: { admissionCycleId: cycle.id },
        include: { program: { include: { department: true } } },
      });

      // Group by department.
      const deptMap = new Map();
      for (const cp of cyclePrograms) {
        const prog = cp.program;
        if (!prog || !prog.department) continue;
        const dept = prog.department;

        // Coordinator scope: skip departments the coordinator doesn't own.
        if (req.user.role === 'coordinator' && req.coordinatorDepartmentId !== dept.id) continue;

        if (!deptMap.has(dept.id)) {
          deptMap.set(dept.id, { id: dept.id, name: dept.name, programs: [] });
        }

        const fee = await prisma.feeStructure.findUnique({
          where: { cycleId_programId: { cycleId: cycle.id, programId: prog.id } },
        });
        const paymentSubmitted = await hasAnyPayment(cycle.id, prog.id);

        deptMap.get(dept.id).programs.push({
          programId: prog.id,
          programName: prog.name,
          programShortForm: prog.shortForm || prog.code,
          feeId: fee?.id || null,
          announced: !!fee,
          totalAmount: fee?.totalAmount || 0,
          lineItems: fee ? safeParseJson(fee.lineItems, []) : [],
          isLocked: fee ? (fee.isLocked || paymentSubmitted) : false,
        });
      }

      result.push({
        cycleId: cycle.id,
        cycleTitle: cycle.title,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        departments: Array.from(deptMap.values()),
      });
    }

    res.json({ cycles: result });
  } catch (error) {
    console.error('Fee management overview error:', error);
    res.status(500).json({ error: 'Failed to load fee management overview' });
  }
});

// ------------------------------------------------------------
// POST /api/fee-management/ — create a fee for a program+cycle combination.
// Body: { cycleId, departmentId, programId, lineItems: [{ label, amount }] }
// ------------------------------------------------------------
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const cycleId = parseInt(req.body.cycleId);
    const departmentId = parseInt(req.body.departmentId);
    const programId = parseInt(req.body.programId);

    if (!cycleId) return res.status(400).json({ error: 'cycleId is required', field: 'cycleId' });
    if (!departmentId) return res.status(400).json({ error: 'departmentId is required', field: 'departmentId' });
    if (!programId) return res.status(400).json({ error: 'programId is required', field: 'programId' });

    const [cycle, dept, program] = await Promise.all([
      prisma.admissionCycle.findUnique({ where: { id: cycleId } }),
      prisma.department.findUnique({ where: { id: departmentId } }),
      prisma.program.findUnique({ where: { id: programId } }),
    ]);
    if (!cycle) return res.status(404).json({ error: 'Admission cycle not found' });
    if (!dept) return res.status(404).json({ error: 'Department not found' });
    if (!program) return res.status(404).json({ error: 'Program not found' });
    if (program.departmentId !== departmentId) {
      return res.status(400).json({ error: 'Program does not belong to the given department', field: 'programId' });
    }

    let built;
    try { built = buildLineItems(req.body.lineItems); }
    catch (e) { return res.status(400).json({ error: e.message, field: e.field || 'lineItems' }); }

    // If a fee already exists for this cycle+program, treat as create-or-update,
    // but block when locked / payments exist.
    const existing = await prisma.feeStructure.findUnique({
      where: { cycleId_programId: { cycleId, programId } },
    });
    if (existing) {
      if (existing.isLocked || (await hasAnyPayment(cycleId, programId))) {
        return res.status(400).json({ error: 'This fee is locked because a student has already submitted payment. It can no longer be edited.' });
      }
    }

    const fee = await prisma.feeStructure.upsert({
      where: { cycleId_programId: { cycleId, programId } },
      update: {
        departmentId,
        lineItems: JSON.stringify(built.items),
        totalAmount: built.total,
      },
      create: {
        cycleId,
        departmentId,
        programId,
        lineItems: JSON.stringify(built.items),
        totalAmount: built.total,
        isLocked: false,
      },
    });

    // Notify eligible (finalized merit) students for this program+cycle.
    await notifyEligibleStudents(cycleId, programId, program.name, built.total).catch(() => {});

    res.status(201).json({
      message: 'Fee announced successfully',
      fee: { ...fee, lineItems: safeParseJson(fee.lineItems, []) },
    });
  } catch (error) {
    console.error('Create fee error:', error);
    res.status(500).json({ error: 'Failed to announce fee' });
  }
});

// ------------------------------------------------------------
// PUT /api/fee-management/:id — update a fee (blocked once any payment exists)
// ------------------------------------------------------------
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const fee = await prisma.feeStructure.findUnique({ where: { id } });
    if (!fee) return res.status(404).json({ error: 'Fee structure not found' });

    if (fee.isLocked || (await hasAnyPayment(fee.cycleId, fee.programId))) {
      return res.status(400).json({ error: 'This fee is locked because a student has already submitted payment. It can no longer be edited.' });
    }

    let built;
    try { built = buildLineItems(req.body.lineItems); }
    catch (e) { return res.status(400).json({ error: e.message, field: e.field || 'lineItems' }); }

    const updated = await prisma.feeStructure.update({
      where: { id },
      data: {
        lineItems: JSON.stringify(built.items),
        totalAmount: built.total,
      },
    });

    const program = await prisma.program.findUnique({ where: { id: fee.programId } });
    await notifyEligibleStudents(fee.cycleId, fee.programId, program?.name || 'your program', built.total).catch(() => {});

    res.json({
      message: 'Fee updated successfully',
      fee: { ...updated, lineItems: safeParseJson(updated.lineItems, []) },
    });
  } catch (error) {
    console.error('Update fee error:', error);
    res.status(500).json({ error: 'Failed to update fee' });
  }
});

// ------------------------------------------------------------
// GET /api/fee-management/payments/pending — pending payment submissions.
//   Director / Super Admin → all pending payments
//   Coordinator            → only their department's programs
// NOTE: declared BEFORE the /:cycleId/:programId route so "payments" is not
// captured as a cycleId param.
// ------------------------------------------------------------
router.get('/payments/pending', authenticate, requireAdminOrCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const where = { status: 'PENDING' };
    if (req.user.role === 'coordinator') {
      const ids = req.coordinatorProgramIds || [];
      where.application = { is: { programId: { in: ids.length ? ids : [-1] } } };
    }

    const payments = await prisma.feePayment.findMany({
      where,
      include: {
        application: {
          include: {
            program: { include: { department: true } },
            admissionCycle: true,
          },
        },
        user: {
          select: {
            id: true, email: true,
            enrollment: { select: { rollNumber: true, registrationNumber: true, lmsUserId: true, status: true } },
            profile: { select: { firstName: true, lastName: true, cnic: true, phone: true, whatsappNumber: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // §2.2 — pull the LMS-side academic snapshot (semester / batch / section /
    // roll) for every student in the list so the Director can filter on
    // Semester, Batch, Section and Class as well.
    const lmsUserIds = payments.map((p) => p.user?.enrollment?.lmsUserId).filter(Boolean);
    const lmsProfiles = lmsUserIds.length
      ? await prisma.lmsStudentProfile.findMany({
        where: { lmsUserId: { in: lmsUserIds } },
        select: {
          lmsUserId: true, rollNumber: true, registrationNumber: true, session: true,
          program: true, programShortForm: true, department: true, phone: true, cnic: true, email: true,
        },
      })
      : [];
    const lmsProfileMap = {};
    for (const lp of lmsProfiles) lmsProfileMap[lp.lmsUserId] = lp;

    // Latest known semester + section per LMS student (from their fee challans,
    // which carry a point-in-time semester/section snapshot).
    const challans = lmsUserIds.length
      ? await prisma.lmsFeeChallan.findMany({
        where: { studentId: { in: lmsUserIds } },
        select: { studentId: true, semester: true, section: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      })
      : [];
    const academicMap = {};
    for (const c of challans) {
      if (!academicMap[c.studentId]) academicMap[c.studentId] = { semester: c.semester, section: c.section };
    }

    const programs = new Set(); const departments = new Set(); const sessions = new Set();
    const batches = new Set(); const sections = new Set(); const semesters = new Set();
    const classes = new Set(); const methods = new Set();

    const data = payments.map((p) => {
      const prof = p.user?.profile || {};
      const enr = p.user?.enrollment || null;
      const lp = enr && enr.lmsUserId ? lmsProfileMap[enr.lmsUserId] : null;
      const acad = enr && enr.lmsUserId ? academicMap[enr.lmsUserId] : null;

      const programName = p.application?.program?.name || '';
      const programShort = lp ? (lp.programShortForm || '') : '';
      const cycleTitle = p.application?.admissionCycle?.title || '';
      // A fresh admission has no LMS semester yet — it is the 1st semester fee.
      const semesterNumber = acad && acad.semester ? acad.semester : 1;
      const semesterLabel = `Semester ${semesterNumber}`;
      const sectionName = acad && acad.section ? acad.section : '';
      // Batch = the admission session the student belongs to.
      const batch = (lp && lp.session) || cycleTitle || '';
      // Class = the teaching class grouping (Program · Semester · Section).
      const classLabel = [programShort || programName, semesterLabel, sectionName ? `Sec ${sectionName}` : '']
        .filter(Boolean).join(' · ');

      if (programName) programs.add(programName);
      if (p.application?.program?.department?.name) departments.add(p.application.program.department.name);
      if (cycleTitle) sessions.add(cycleTitle);
      if (batch) batches.add(batch);
      if (sectionName) sections.add(sectionName);
      semesters.add(semesterLabel);
      if (classLabel) classes.add(classLabel);
      if (p.paymentMethod) methods.add(p.paymentMethod);

      return {
        id: p.id,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        txnId: p.txnId,
        receiptPath: p.receiptPath,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        studentName: [prof.firstName, prof.lastName].filter(Boolean).join(' ') || p.user?.email,
        studentEmail: p.user?.email,
        rollNumber: (enr && enr.rollNumber) || (lp && lp.rollNumber) || null,
        program: programName,
        department: p.application?.program?.department?.name || null,
        cycle: cycleTitle,
        applicationId: p.applicationId,
        // ---- §2.2 filterable metadata ----
        userId: p.userId,
        programShortForm: programShort,
        registrationNumber: (enr && enr.registrationNumber) || (lp && lp.registrationNumber) || null,
        session: cycleTitle,
        batch,
        section: sectionName,
        semester: semesterLabel,
        semesterNumber,
        className: classLabel,
        cnic: prof.cnic || (lp && lp.cnic) || '',
        phone: prof.phone || prof.whatsappNumber || (lp && lp.phone) || '',
        email: p.user?.email || (lp && lp.email) || '',
      };
    });

    const sortedList = (set) => Array.from(set).filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

    res.json({
      payments: data,
      filterOptions: {
        programs: sortedList(programs),
        departments: sortedList(departments),
        sessions: sortedList(sessions),
        batches: sortedList(batches),
        sections: sortedList(sections),
        semesters: sortedList(semesters),
        classes: sortedList(classes),
        methods: sortedList(methods),
      },
    });
  } catch (error) {
    console.error('Pending payments error:', error);
    res.status(500).json({ error: 'Failed to fetch pending payments' });
  }
});

// ------------------------------------------------------------
// §2.2 — GET /api/fee-management/payments/:paymentId/history
// The COMPLETE previous fee record for the student behind a pending payment:
// which student paid which semester's fee, through which platform, plus the
// full historical fee record (admission fees, processing fees, LMS semester /
// examination challans). Read-only; shown when approving or rejecting a fee.
// Declared BEFORE /:cycleId/:programId so it is matched first.
// ------------------------------------------------------------
router.get('/payments/:paymentId/history', authenticate, requireAdminOrCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const paymentId = parseInt(req.params.paymentId, 10);
    if (!paymentId) return res.status(400).json({ error: 'Invalid payment id' });

    const payment = await prisma.feePayment.findUnique({
      where: { id: paymentId },
      include: { application: { include: { program: { include: { department: true } }, admissionCycle: true } } },
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    // Coordinator department guard (same rule as the approve/reject routes).
    if (req.user.role === 'coordinator') {
      const ids = req.coordinatorProgramIds || [];
      if (!ids.includes(payment.application.programId)) {
        return res.status(403).json({ error: 'This payment is outside your department.' });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: payment.userId },
      select: {
        id: true, email: true, createdAt: true,
        profile: { select: { firstName: true, lastName: true, cnic: true, phone: true, whatsappNumber: true, fatherName: true } },
        enrollment: { select: { rollNumber: true, registrationNumber: true, lmsUserId: true, status: true, enrolledAt: true, feePaid: true } },
      },
    });

    // ---- 1. Every admission-side fee payment this student has ever made ----
    const feePayments = await prisma.feePayment.findMany({
      where: { userId: payment.userId },
      include: {
        application: {
          include: { program: { include: { department: true } }, admissionCycle: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // ---- 2. Processing (application) fees paid per application ----
    const applications = await prisma.application.findMany({
      where: { userId: payment.userId },
      select: {
        id: true, status: true, submittedAt: true,
        procFeePaid: true, procFeeMethod: true, procFeeTxnId: true, procFeePaidAt: true,
        program: { select: { name: true, department: { select: { name: true } } } },
        admissionCycle: { select: { title: true, applicationProcessingFee: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    // ---- 3. LMS semester / examination fee challans ----
    const lmsUserId = user?.enrollment?.lmsUserId || null;
    const lmsProfile = lmsUserId
      ? await prisma.lmsStudentProfile.findFirst({
        where: { lmsUserId },
        select: {
          fullName: true, rollNumber: true, registrationNumber: true, session: true,
          program: true, programShortForm: true, department: true, cnic: true, phone: true, email: true,
        },
      })
      : null;
    const challans = lmsUserId
      ? await prisma.lmsFeeChallan.findMany({
        where: { studentId: lmsUserId },
        orderBy: { createdAt: 'desc' },
      })
      : [];

    const semesterFees = feePayments.map((fp) => ({
      kind: 'ADMISSION_FEE',
      id: fp.id,
      isCurrent: fp.id === paymentId,
      semester: 'Semester 1 (Enrollment)',
      title: `Enrollment / Semester Fee — ${fp.application?.program?.name || ''}`,
      program: fp.application?.program?.name || '',
      department: fp.application?.program?.department?.name || '',
      session: fp.application?.admissionCycle?.title || '',
      amount: fp.amount,
      platform: fp.paymentMethod,
      txnId: fp.txnId || '',
      status: fp.status,
      paidAt: fp.paidAt,
      submittedAt: fp.createdAt,
      receiptPath: fp.receiptPath || null,
      remarks: fp.adminRemarks || '',
    }));

    const processingFees = applications
      .filter((a) => a.procFeePaid || a.procFeeTxnId)
      .map((a) => ({
        kind: 'PROCESSING_FEE',
        id: `app-${a.id}`,
        isCurrent: false,
        semester: 'Application Processing',
        title: `Application Processing Fee — ${a.program?.name || ''}`,
        program: a.program?.name || '',
        department: a.program?.department?.name || '',
        session: a.admissionCycle?.title || '',
        amount: a.admissionCycle?.applicationProcessingFee ?? 0,
        platform: a.procFeeMethod || 'N/A',
        txnId: a.procFeeTxnId || '',
        status: a.procFeePaid ? 'PAID' : 'PENDING',
        paidAt: a.procFeePaidAt,
        submittedAt: a.submittedAt,
        receiptPath: null,
        remarks: '',
      }));

    const lmsFees = challans.map((c) => ({
      kind: c.feeType === 'EXAMINATION' ? 'EXAMINATION_FEE' : 'LMS_SEMESTER_FEE',
      id: `challan-${c.id}`,
      isCurrent: false,
      semester: c.semester ? `Semester ${c.semester}` : (c.feeType || 'Semester'),
      title: c.title || c.challanNo,
      challanNo: c.challanNo,
      program: c.program || '',
      department: c.department || '',
      session: '',
      section: c.section || '',
      amount: c.totalAmount,
      platform: c.paymentRef ? `Challan (${c.paymentRef})` : 'Bank Challan',
      txnId: c.paymentRef || '',
      status: c.status,
      paidAt: c.paidAt,
      submittedAt: c.createdAt,
      dueDate: c.dueDate || null,
      lineItems: safeParseJson(c.lineItems, []),
      receiptPath: null,
      remarks: c.description || '',
    }));

    const records = [...semesterFees, ...processingFees, ...lmsFees].sort((a, b) => {
      const at = new Date(a.submittedAt || 0).getTime();
      const bt = new Date(b.submittedAt || 0).getTime();
      return bt - at;
    });

    const paidRecords = records.filter((r) => r.status === 'APPROVED' || r.status === 'PAID');
    const summary = {
      totalRecords: records.length,
      totalPaid: paidRecords.reduce((a, r) => a + (Number(r.amount) || 0), 0),
      totalPending: records.filter((r) => r.status === 'PENDING' || r.status === 'UNPAID')
        .reduce((a, r) => a + (Number(r.amount) || 0), 0),
      approvedCount: records.filter((r) => r.status === 'APPROVED' || r.status === 'PAID').length,
      rejectedCount: records.filter((r) => r.status === 'REJECTED').length,
      pendingCount: records.filter((r) => r.status === 'PENDING' || r.status === 'UNPAID').length,
      platforms: Array.from(new Set(records.map((r) => r.platform).filter(Boolean))).sort(),
      semestersPaid: Array.from(new Set(paidRecords.map((r) => r.semester).filter(Boolean))).sort(),
    };

    const prof = user?.profile || {};
    res.json({
      student: {
        userId: payment.userId,
        name: [prof.firstName, prof.lastName].filter(Boolean).join(' ') || (lmsProfile && lmsProfile.fullName) || user?.email || '',
        fatherName: prof.fatherName || '',
        email: user?.email || (lmsProfile && lmsProfile.email) || '',
        cnic: prof.cnic || (lmsProfile && lmsProfile.cnic) || '',
        phone: prof.phone || prof.whatsappNumber || (lmsProfile && lmsProfile.phone) || '',
        rollNumber: user?.enrollment?.rollNumber || (lmsProfile && lmsProfile.rollNumber) || null,
        registrationNumber: user?.enrollment?.registrationNumber || (lmsProfile && lmsProfile.registrationNumber) || null,
        program: payment.application?.program?.name || '',
        programShortForm: (lmsProfile && lmsProfile.programShortForm) || '',
        department: payment.application?.program?.department?.name || '',
        session: payment.application?.admissionCycle?.title || '',
        batch: (lmsProfile && lmsProfile.session) || payment.application?.admissionCycle?.title || '',
        enrollmentStatus: user?.enrollment?.status || 'NOT_ENROLLED',
        enrolledAt: user?.enrollment?.enrolledAt || null,
        registeredAt: user?.createdAt || null,
      },
      current: {
        id: payment.id,
        amount: payment.amount,
        platform: payment.paymentMethod,
        txnId: payment.txnId || '',
        status: payment.status,
        paidAt: payment.paidAt,
        submittedAt: payment.createdAt,
        receiptPath: payment.receiptPath || null,
      },
      records,
      summary,
    });
  } catch (error) {
    console.error('Fee history error:', error);
    res.status(500).json({ error: 'Failed to fetch fee history' });
  }
});

// Shared loader + coordinator scope guard for a single payment.
async function loadPaymentForReview(req, res) {
  const payment = await prisma.feePayment.findUnique({
    where: { id: parseInt(req.params.paymentId) },
    include: {
      application: { include: { program: true, admissionCycle: true } },
      user: { select: { id: true, email: true, emailNotifications: true, enrollment: true } },
    },
  });
  if (!payment) { res.status(404).json({ error: 'Payment not found' }); return null; }
  if (req.user.role === 'coordinator') {
    const ids = req.coordinatorProgramIds || [];
    if (!ids.includes(payment.application.programId)) {
      res.status(403).json({ error: 'This payment is outside your department.' });
      return null;
    }
  }
  return payment;
}

// ------------------------------------------------------------
// PATCH /api/fee-management/payments/:paymentId/approve
// Approve a payment → continue the existing enrollment flow.
// ------------------------------------------------------------
router.patch('/payments/:paymentId/approve', authenticate, requireAdminOrCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const payment = await loadPaymentForReview(req, res);
    if (!payment) return;

    const updated = await prisma.feePayment.update({
      where: { id: payment.id },
      data: { status: 'APPROVED', adminRemarks: null },
    });

    // Existing enrollment flow (roll/registration/LMS credential generation).
    const enrollment = await confirmEnrollment({
      application: { ...payment.application, userId: payment.userId },
      existingEnrollment: payment.user.enrollment,
    });

    await prisma.application.update({
      where: { id: payment.applicationId },
      data: { status: 'ENROLLED' },
    });

    await prisma.notification.create({
      data: {
        userId: payment.userId,
        title: 'Fee Payment Confirmed — Enrolled',
        message: `Your fee payment for ${payment.application.program.name} has been confirmed by the Director.${enrollment?.rollNumber ? ` Your Roll Number is ${enrollment.rollNumber}.` : ''} Welcome to AUST!`,
      },
    });

    try {
      if (payment.user?.emailNotifications && payment.user?.email) {
        sendFeeStatusEmail(payment.user.email, payment.application.program.name, 'APPROVED', null).catch(() => {});
        if (enrollment) {
          sendEnrollmentConfirmedEmail(
            payment.user.email,
            payment.application.program.name,
            enrollment.rollNumber,
            enrollment.registrationNumber,
            enrollment.lmsUsername,
          ).catch(() => {});
        }
      }
    } catch (_) {}

    res.json({
      message: 'Payment approved',
      payment: updated,
      enrollment: enrollment ? {
        rollNumber: enrollment.rollNumber,
        registrationNumber: enrollment.registrationNumber,
        lmsUsername: enrollment.lmsUsername,
        status: enrollment.status,
      } : null,
    });
  } catch (error) {
    console.error('Approve payment error:', error);
    res.status(500).json({ error: 'Failed to approve payment' });
  }
});

// ------------------------------------------------------------
// PATCH /api/fee-management/payments/:paymentId/reject
// Body: { reason: "string" } (required). Student is notified + can resubmit.
// ------------------------------------------------------------
router.patch('/payments/:paymentId/reject', authenticate, requireAdminOrCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required', field: 'reason' });

    const payment = await loadPaymentForReview(req, res);
    if (!payment) return;

    const updated = await prisma.feePayment.update({
      where: { id: payment.id },
      data: { status: 'REJECTED', adminRemarks: reason },
    });

    // Allow the student to resubmit.
    await prisma.application.update({
      where: { id: payment.applicationId },
      data: { status: 'FEE_PENDING' },
    });

    await prisma.notification.create({
      data: {
        userId: payment.userId,
        title: 'Fee Payment Rejected',
        message: `Your fee payment for ${payment.application.program.name} has been rejected. Reason: ${reason}. Please review and resubmit your payment.`,
      },
    });

    try {
      if (payment.user?.emailNotifications && payment.user?.email) {
        sendFeeStatusEmail(payment.user.email, payment.application.program.name, 'REJECTED', reason).catch(() => {});
      }
    } catch (_) {}

    res.json({ message: 'Payment rejected', payment: updated });
  } catch (error) {
    console.error('Reject payment error:', error);
    res.status(500).json({ error: 'Failed to reject payment' });
  }
});

// ------------------------------------------------------------
// §2.2 (Task 2) — GET /api/fee-management/payments/processed
// The list of payments the Director has ALREADY acted on (APPROVED or
// REJECTED), so the complete fee history per student is visible AFTER a
// decision — who paid, when, how much, the decision status, and any remark.
// This is a read/reporting endpoint only; it does NOT change the approval
// logic. It mirrors /payments/pending but filters on the decided statuses and
// adds the decision fields (status, adminRemarks, processedAt).
// Declared BEFORE /:cycleId/:programId so it is matched first.
// ------------------------------------------------------------
router.get('/payments/processed', authenticate, requireAdminOrCoordinator, attachCoordinatorScope, async (req, res) => {
  try {
    const statusParam = String(req.query.status || '').toUpperCase();
    const allowed = ['APPROVED', 'REJECTED'];
    const where = {
      status: allowed.includes(statusParam) ? statusParam : { in: allowed },
    };
    if (req.user.role === 'coordinator') {
      const ids = req.coordinatorProgramIds || [];
      where.application = { is: { programId: { in: ids.length ? ids : [-1] } } };
    }

    const payments = await prisma.feePayment.findMany({
      where,
      include: {
        application: {
          include: {
            program: { include: { department: true } },
            admissionCycle: true,
          },
        },
        user: {
          select: {
            id: true, email: true,
            enrollment: { select: { rollNumber: true, registrationNumber: true, lmsUserId: true, status: true } },
            profile: { select: { firstName: true, lastName: true, cnic: true, phone: true, whatsappNumber: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const lmsUserIds = payments.map((p) => p.user?.enrollment?.lmsUserId).filter(Boolean);
    const lmsProfiles = lmsUserIds.length
      ? await prisma.lmsStudentProfile.findMany({
        where: { lmsUserId: { in: lmsUserIds } },
        select: {
          lmsUserId: true, rollNumber: true, registrationNumber: true, session: true,
          program: true, programShortForm: true, department: true, phone: true, cnic: true, email: true,
        },
      })
      : [];
    const lmsProfileMap = {};
    for (const lp of lmsProfiles) lmsProfileMap[lp.lmsUserId] = lp;

    const challans = lmsUserIds.length
      ? await prisma.lmsFeeChallan.findMany({
        where: { studentId: { in: lmsUserIds } },
        select: { studentId: true, semester: true, section: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      })
      : [];
    const academicMap = {};
    for (const c of challans) {
      if (!academicMap[c.studentId]) academicMap[c.studentId] = { semester: c.semester, section: c.section };
    }

    const programs = new Set(); const departments = new Set(); const sessions = new Set();
    const batches = new Set(); const sections = new Set(); const semesters = new Set();
    const classes = new Set(); const methods = new Set();

    const data = payments.map((p) => {
      const prof = p.user?.profile || {};
      const enr = p.user?.enrollment || null;
      const lp = enr && enr.lmsUserId ? lmsProfileMap[enr.lmsUserId] : null;
      const acad = enr && enr.lmsUserId ? academicMap[enr.lmsUserId] : null;

      const programName = p.application?.program?.name || '';
      const programShort = lp ? (lp.programShortForm || '') : '';
      const cycleTitle = p.application?.admissionCycle?.title || '';
      const semesterNumber = acad && acad.semester ? acad.semester : 1;
      const semesterLabel = `Semester ${semesterNumber}`;
      const sectionName = acad && acad.section ? acad.section : '';
      const batch = (lp && lp.session) || cycleTitle || '';
      const classLabel = [programShort || programName, semesterLabel, sectionName ? `Sec ${sectionName}` : '']
        .filter(Boolean).join(' · ');

      if (programName) programs.add(programName);
      if (p.application?.program?.department?.name) departments.add(p.application.program.department.name);
      if (cycleTitle) sessions.add(cycleTitle);
      if (batch) batches.add(batch);
      if (sectionName) sections.add(sectionName);
      semesters.add(semesterLabel);
      if (classLabel) classes.add(classLabel);
      if (p.paymentMethod) methods.add(p.paymentMethod);

      return {
        id: p.id,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        txnId: p.txnId,
        receiptPath: p.receiptPath,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        // ---- Task 2: decision metadata (post-approval reporting) ----
        status: p.status,
        adminRemarks: p.adminRemarks || null,
        processedAt: p.updatedAt,
        studentName: [prof.firstName, prof.lastName].filter(Boolean).join(' ') || p.user?.email,
        studentEmail: p.user?.email,
        rollNumber: (enr && enr.rollNumber) || (lp && lp.rollNumber) || null,
        program: programName,
        department: p.application?.program?.department?.name || null,
        cycle: cycleTitle,
        applicationId: p.applicationId,
        userId: p.userId,
        programShortForm: programShort,
        registrationNumber: (enr && enr.registrationNumber) || (lp && lp.registrationNumber) || null,
        session: cycleTitle,
        batch,
        section: sectionName,
        semester: semesterLabel,
        semesterNumber,
        className: classLabel,
        cnic: prof.cnic || (lp && lp.cnic) || '',
        phone: prof.phone || prof.whatsappNumber || (lp && lp.phone) || '',
        email: p.user?.email || (lp && lp.email) || '',
      };
    });

    const sortedList = (set) => Array.from(set).filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

    res.json({
      payments: data,
      filterOptions: {
        programs: sortedList(programs),
        departments: sortedList(departments),
        sessions: sortedList(sessions),
        batches: sortedList(batches),
        sections: sortedList(sections),
        semesters: sortedList(semesters),
        classes: sortedList(classes),
        methods: sortedList(methods),
        statuses: ['APPROVED', 'REJECTED'],
      },
    });
  } catch (error) {
    console.error('Processed payments error:', error);
    res.status(500).json({ error: 'Failed to fetch processed payments' });
  }
});

// ------------------------------------------------------------
// GET /api/fee-management/:cycleId/:programId — fee details for a program in a
// cycle. Used by the student portal. A student may only see it once they are
// on the FINALIZED merit list for this exact program+cycle.
// Declared LAST so the more specific /payments/* routes match first.
// ------------------------------------------------------------
router.get('/:cycleId/:programId', authenticate, async (req, res) => {
  try {
    const cycleId = parseInt(req.params.cycleId);
    const programId = parseInt(req.params.programId);
    if (!cycleId || !programId) return res.status(400).json({ error: 'Invalid cycle or program' });

    // Eligibility check for students.
    if (req.user.role === 'student') {
      const app = await prisma.application.findFirst({
        where: { userId: req.user.id, admissionCycleId: cycleId, programId },
        include: { meritEntry: true },
      });
      const onFinalizedMerit = !!(app && app.meritEntry && app.meritEntry.isFinalized);
      const advanced = !!(app && ['FEE_PENDING', 'FEE_PAID', 'FEE_APPROVED', 'ENROLLED'].includes(app.status));
      if (!onFinalizedMerit && !advanced) {
        // Not eligible — never reveal fee details.
        return res.json({ announced: false, eligible: false, fee: null });
      }
    }

    const fee = await prisma.feeStructure.findUnique({
      where: { cycleId_programId: { cycleId, programId } },
    });
    if (!fee) return res.json({ announced: false, eligible: true, fee: null });

    res.json({
      announced: true,
      eligible: true,
      fee: {
        id: fee.id,
        cycleId: fee.cycleId,
        programId: fee.programId,
        departmentId: fee.departmentId,
        lineItems: safeParseJson(fee.lineItems, []),
        totalAmount: fee.totalAmount,
        isLocked: fee.isLocked,
      },
    });
  } catch (error) {
    console.error('Get fee error:', error);
    res.status(500).json({ error: 'Failed to fetch fee details' });
  }
});

module.exports = router;

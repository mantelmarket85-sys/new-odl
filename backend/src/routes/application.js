const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireStudent } = require('../middleware/auth');
const { uploadReceipt } = require('../middleware/upload');
const { notify } = require('../utils/notify');
const { sendApplicationSubmittedEmail } = require('../utils/email');

const router = express.Router();
const prisma = new PrismaClient();

// (Master Prompt §5) EasyPaisa removed. BANK_GATEWAY is the online method.
// Legacy 'EASYPAISA' is still accepted (and normalised to BANK_GATEWAY below)
// so older submissions / existing DB rows remain valid.
const VALID_PAYMENT_METHODS = ['BANK_TRANSFER', 'BANK_GATEWAY', 'EASYPAISA', 'ONEBILL_VOUCHER', 'BANK_DEPOSIT'];

async function logStatus(applicationId, userId, status, remarks, actorRole) {
  try {
    await prisma.statusEvent.create({
      data: { applicationId, userId, status, remarks: remarks || null, actorRole: actorRole || null },
    });
  } catch (e) { /* non-fatal */ }
}

// GET /api/applications
router.get('/', authenticate, async (req, res) => {
  try {
    const applications = await prisma.application.findMany({
      where: { userId: req.user.id },
      include: {
        program: true,
        admissionCycle: true,
        interview: true,
        meritEntry: true,
        feePayment: true,
        appeals: { orderBy: { createdAt: 'desc' } },
        statusEvents: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    res.json({ applications });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// POST /api/applications/apply
// Student submits → ALWAYS lands at Director first (status = SUBMITTED or RESULT_AWAITED)
router.post('/apply', authenticate, requireStudent, uploadReceipt.single('feeReceipt'), async (req, res) => {
  try {
    const { programId, paymentMethod: rawMethod, txnId } = req.body;
    if (!programId) return res.status(400).json({ error: 'Program selection is required' });

    // Active admission cycle
    const cycle = await prisma.admissionCycle.findFirst({ where: { isOpen: true }, orderBy: { createdAt: 'desc' } });
    if (!cycle) return res.status(400).json({ error: 'Admissions are currently closed. Please check back later.' });

    const now = new Date().toISOString().split('T')[0];
    if (now < cycle.startDate || now > cycle.endDate) {
      return res.status(400).json({ error: `Admission period: ${cycle.startDate} to ${cycle.endDate}` });
    }

    // Profile completeness
    const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
    if (!profile || !profile.isComplete) {
      return res.status(400).json({ error: 'Please complete your profile before submitting an application' });
    }

    // Education records
    const educations = await prisma.education.findMany({ where: { userId: req.user.id } });
    const matric = educations.find((e) => e.level === '10years');
    const fscFull = educations.find((e) => e.level === '12years');
    const fscPartI = educations.find((e) => e.level === '11years');

    if (!matric) {
      return res.status(400).json({ error: 'Matric (10 years / SSC) education record is required' });
    }
    if (!fscFull && !fscPartI) {
      return res.status(400).json({ error: 'Either FSc Part-I (11 years) or full FSc / Intermediate (12 years) education record is required' });
    }

    // Determine result-awaited status
    const anyWaiting = educations.some((e) => e.resultStatus === 'Waiting');
    const onlyPartI = !!fscPartI && !fscFull;
    const isResultAwaited = anyWaiting || onlyPartI;
    const applicationResultStatus = isResultAwaited ? 'Waiting' : 'Completed';

    // Min-marks check ONLY when full FSc result available and Completed
    if (fscFull && fscFull.resultStatus === 'Completed' && fscFull.marks && fscFull.totalMarks) {
      const pct = (fscFull.marks / fscFull.totalMarks) * 100;
      if (pct < cycle.minMarksPercent) {
        return res.status(400).json({ error: `Minimum ${cycle.minMarksPercent}% marks required in FSc/Intermediate. Your marks: ${pct.toFixed(1)}%` });
      }
    }

    const program = await prisma.program.findUnique({ where: { id: parseInt(programId) } });
    if (!program || !program.isActive) return res.status(404).json({ error: 'Selected program not found or not active' });

    // Duplicate check (excluding REJECTED so student can re-apply if a previous one was rejected and not appealed)
    const existing = await prisma.application.findFirst({
      where: {
        userId: req.user.id,
        programId: parseInt(programId),
        admissionCycleId: cycle.id,
        status: { notIn: ['REJECTED'] },
      },
    });
    if (existing) return res.status(400).json({ error: 'You already have an active application for this program in this cycle' });

    // Payment method
    let paymentMethod = (rawMethod || '').toUpperCase();
    // Normalise legacy EASYPAISA → BANK_GATEWAY.
    if (paymentMethod === 'EASYPAISA') paymentMethod = 'BANK_GATEWAY';
    if (paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    // Allowed-by-cycle check (accepting a legacy EASYPAISA entry as BANK_GATEWAY)
    const cycleAllowed = (cycle.allowedPaymentMethods || 'BANK_TRANSFER,BANK_GATEWAY,ONEBILL_VOUCHER')
      .split(',').map(s => s.trim())
      .map(s => (s === 'EASYPAISA' ? 'BANK_GATEWAY' : s));
    if (paymentMethod && !cycleAllowed.includes(paymentMethod) && paymentMethod !== 'BANK_DEPOSIT') {
      return res.status(400).json({ error: `${paymentMethod} is not currently allowed by the admission cycle` });
    }

    // Fee proof: receipt upload OR a transaction id (for digital methods)
    if (!req.file && !txnId) {
      return res.status(400).json({ error: 'Application processing fee proof is required. Upload deposit slip OR enter transaction id.' });
    }

    let receiptPath = null;
    if (req.file) {
      receiptPath = `/uploads/receipts/${req.file.filename}`;
      await prisma.document.create({
        data: {
          userId: req.user.id,
          type: 'application_fee_receipt',
          filePath: receiptPath,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
        },
      });
    }

    // Auto-classify method if not given (online txn → Bank Payment Gateway)
    if (!paymentMethod) {
      paymentMethod = txnId ? 'BANK_GATEWAY' : 'BANK_TRANSFER';
    }

    const application = await prisma.application.create({
      data: {
        userId: req.user.id,
        programId: parseInt(programId),
        admissionCycleId: cycle.id,
        feeReceiptPath: receiptPath,
        // FIRST GOES TO DIRECTOR — UNDER_REVIEW so Director sees in queue, OR RESULT_AWAITED if pending
        status: isResultAwaited ? 'RESULT_AWAITED' : 'UNDER_REVIEW',
        resultStatus: applicationResultStatus,
        procFeePaid: !!txnId || !!req.file,
        procFeeTxnId: txnId || null,
        procFeeMethod: paymentMethod,
        procFeePaidAt: (txnId || req.file) ? new Date() : null,
      },
      include: { program: true },
    });

    await logStatus(application.id, req.user.id, application.status, 'Application submitted by student', 'student');

    // Notification (in-app + email)
    const baseMsg = `Your application for ${program.name} has been submitted and is under Director's review. Application ID: #${application.id}. Application Processing Fee: PKR ${cycle.applicationProcessingFee}.`;
    const message = isResultAwaited
      ? `${baseMsg} Status: Result Awaited — please update your final FSc result when available.`
      : baseMsg;
    await notify(req.user.id, isResultAwaited ? 'Application Submitted (Result Awaited)' : 'Application Submitted', message);

    const userRow = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true } });
    if (userRow?.email) {
      sendApplicationSubmittedEmail(userRow.email, program.name, application.id, isResultAwaited).catch(() => {});
    }

    res.status(201).json({ message: 'Application submitted successfully', application });
  } catch (error) {
    console.error('Apply error:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// PUT /api/applications/:id/resubmit — student resubmits after NEED_INFO
router.put('/:id/resubmit', authenticate, requireStudent, async (req, res) => {
  try {
    const application = await prisma.application.findFirst({
      where: { id: parseInt(req.params.id), userId: req.user.id },
      include: { program: true },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (application.status !== 'NEED_INFO') {
      return res.status(400).json({ error: 'Only applications with "Needs Update" status can be resubmitted' });
    }

    const profile = await prisma.profile.findUnique({ where: { userId: req.user.id } });
    if (!profile || !profile.isComplete) {
      return res.status(400).json({ error: 'Please complete your profile before resubmitting' });
    }
    const educations = await prisma.education.findMany({ where: { userId: req.user.id } });
    const matric = educations.find((e) => e.level === '10years');
    const hasFsc = educations.some((e) => e.level === '11years' || e.level === '12years');
    if (!matric || !hasFsc) {
      return res.status(400).json({ error: 'Matric and FSc (Part-I or full) education records are required' });
    }

    const updated = await prisma.application.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'UNDER_REVIEW', adminRemarks: null },
    });
    await logStatus(updated.id, req.user.id, 'UNDER_REVIEW', 'Resubmitted with updated info', 'student');

    await notify(req.user.id, 'Application Resubmitted',
      `Your application #${application.id} for ${application.program.name} has been resubmitted with updated information and is pending Director review.`);

    res.json({ message: 'Application resubmitted successfully', application: updated });
  } catch (error) {
    console.error('Resubmit error:', error);
    res.status(500).json({ error: 'Failed to resubmit application' });
  }
});

// PUT /api/applications/:id/update-result — student updates final result
router.put('/:id/update-result', authenticate, requireStudent, async (req, res) => {
  try {
    const application = await prisma.application.findFirst({
      where: { id: parseInt(req.params.id), userId: req.user.id },
      include: { program: true },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });

    const educations = await prisma.education.findMany({ where: { userId: req.user.id } });
    const fscFull = educations.find((e) => e.level === '12years' && e.resultStatus === 'Completed');
    if (!fscFull) {
      return res.status(400).json({ error: 'Please add your FSc / Intermediate (12 years) record with status Completed first.' });
    }

    const updated = await prisma.application.update({
      where: { id: application.id },
      data: {
        resultStatus: 'Completed',
        // RESULT_AWAITED auto-flips to UNDER_REVIEW (Director re-evaluates)
        status: application.status === 'RESULT_AWAITED' ? 'UNDER_REVIEW' : application.status,
      },
    });
    if (application.status === 'RESULT_AWAITED') {
      await logStatus(updated.id, req.user.id, 'UNDER_REVIEW', 'Final FSc result submitted by student', 'student');
    }

    await notify(req.user.id, 'Result Updated',
      `Your final FSc/Intermediate result has been updated for application #${application.id}. The Director Admissions will resume processing your application.`);

    res.json({ message: 'Result updated successfully', application: updated });
  } catch (error) {
    console.error('Update result error:', error);
    res.status(500).json({ error: 'Failed to update result' });
  }
});

// ============================================================
// GET /api/applications/:id/timeline — return status events for student's own app
// ============================================================
router.get('/:id/timeline', authenticate, async (req, res) => {
  try {
    const app = await prisma.application.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { id: true, userId: true },
    });
    if (!app) return res.status(404).json({ error: 'Application not found' });
    if (req.user.role === 'student' && app.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const events = await prisma.statusEvent.findMany({
      where: { applicationId: app.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

module.exports = router;

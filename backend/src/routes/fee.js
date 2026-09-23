const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin, requireStudent } = require('../middleware/auth');
const { uploadReceipt } = require('../middleware/upload');
const { generateRollNumber } = require('../utils/rollNumber');
const { generateRegistrationNumber } = require('../utils/registrationNumber');
const { confirmEnrollment } = require('../utils/enrollmentCredentials');
const { notify } = require('../utils/notify');
const {
  sendFeeStatusEmail,
  sendEnrollmentConfirmedEmail,
} = require('../utils/email');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/fee/announcement — get current fee announcement
router.get('/announcement', authenticate, async (req, res) => {
  try {
    const cycle = await prisma.admissionCycle.findFirst({
      where: { isOpen: true },
      orderBy: { createdAt: 'desc' },
      include: { feeAnnouncement: true },
    });
    res.json({ announcement: cycle?.feeAnnouncement || null, cycle });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fee announcement' });
  }
});

// POST /api/fee/announce — admin announces fee
router.post('/announce', authenticate, requireAdmin, async (req, res) => {
  try {
    const { feeAmount, deadline, bankAccountTitle, bankAccountNumber, bankName, admissionCycleId } = req.body;
    if (!feeAmount || !deadline) {
      return res.status(400).json({ error: 'Fee amount and deadline are required' });
    }

    const cycleId = admissionCycleId || (await prisma.admissionCycle.findFirst({ where: { isOpen: true }, orderBy: { createdAt: 'desc' } }))?.id;
    if (!cycleId) return res.status(400).json({ error: 'No active admission cycle found' });

    const announcement = await prisma.feeAnnouncement.upsert({
      where: { admissionCycleId: parseInt(cycleId) },
      update: {
        feeAmount: parseFloat(feeAmount),
        deadline,
        bankAccountTitle: bankAccountTitle || '',
        bankAccountNumber: bankAccountNumber || '',
        bankName: bankName || '',
        isAnnounced: true,
      },
      create: {
        admissionCycleId: parseInt(cycleId),
        feeAmount: parseFloat(feeAmount),
        deadline,
        bankAccountTitle: bankAccountTitle || '',
        bankAccountNumber: bankAccountNumber || '',
        bankName: bankName || '',
        isAnnounced: true,
      },
    });

    // Notify students with FEE_PENDING status (set after merit finalization)
    const apps = await prisma.application.findMany({
      where: {
        status: { in: ['FEE_PENDING', 'SELECTED'] },
        admissionCycleId: parseInt(cycleId),
      },
      include: { program: true },
    });

    for (const app of apps) {
      if (app.status === 'SELECTED') {
        await prisma.application.update({ where: { id: app.id }, data: { status: 'FEE_PENDING' } });
      }
      await prisma.notification.create({
        data: {
          userId: app.userId,
          title: 'Admission Fee Announced',
          message: `Admission fee of PKR ${feeAmount} has been announced for ${app.program.name}. Deadline: ${deadline}. Please pay and upload the receipt from the Fee tab in your dashboard.`,
        },
      });
    }

    res.json({ message: 'Fee announced successfully', announcement });
  } catch (error) {
    console.error('Announce fee error:', error);
    res.status(500).json({ error: 'Failed to announce fee' });
  }
});

// POST /api/fee/pay — student submits fee payment
// Accepts: receipt upload (Bank Transfer) OR txnId (Bank Payment Gateway / 1Bill Voucher)
router.post('/pay', authenticate, requireStudent, uploadReceipt.single('receipt'), async (req, res) => {
  try {
    const { applicationId, paymentMethod: rawMethod, txnId, bankAccountId } = req.body;
    if (!applicationId) return res.status(400).json({ error: 'Application ID is required' });

    // (Master Prompt §5) EasyPaisa removed — BANK_GATEWAY is the online method.
    // Legacy EASYPAISA is accepted and normalised to BANK_GATEWAY.
    const VALID_METHODS = ['BANK_TRANSFER', 'BANK_GATEWAY', 'EASYPAISA', 'ONEBILL_VOUCHER', 'BANK_DEPOSIT'];
    let paymentMethod = (rawMethod || '').toUpperCase();
    if (paymentMethod === 'EASYPAISA') paymentMethod = 'BANK_GATEWAY';
    if (paymentMethod && !VALID_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
    if (!paymentMethod) paymentMethod = req.file ? 'BANK_TRANSFER' : 'BANK_GATEWAY';

    if (paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'BANK_DEPOSIT') {
      if (!req.file) return res.status(400).json({ error: 'Fee receipt is required for Bank Transfer' });
    } else {
      if (!txnId || !String(txnId).trim()) {
        return res.status(400).json({ error: 'Transaction ID is required for ' + paymentMethod });
      }
    }

    const application = await prisma.application.findFirst({
      where: { id: parseInt(applicationId), userId: req.user.id },
      include: {
        admissionCycle: { include: { feeAnnouncement: true } },
        meritEntry: true,
        feePayment: true,
      },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });

    // STATUS-BASED CHECK: Must be FEE_PENDING (set after merit list finalized by Director)
    if (application.status !== 'FEE_PENDING') {
      return res.status(400).json({
        error: 'You are not eligible to pay fee at this stage. Fee payment is only available after you are selected in the finalized merit list.',
      });
    }

    // Must have finalized merit entry
    if (!application.meritEntry || !application.meritEntry.isFinalized) {
      return res.status(400).json({
        error: 'Your merit entry must be finalized before you can pay the fee.',
      });
    }

    // Defense-in-depth: minimum FSC% policy (45%) — applies to enrollment fee
    const MIN_FSC_PERCENT_FOR_ENROLLMENT = 45;
    const fscPct = application.meritEntry.fscPercent || 0;
    if (fscPct < MIN_FSC_PERCENT_FOR_ENROLLMENT) {
      return res.status(400).json({
        error: `Your FSc score of ${fscPct.toFixed(2)}% is below the minimum ${MIN_FSC_PERCENT_FOR_ENROLLMENT}% required for enrollment fee payment.`,
      });
    }

    // Check if already paid and approved
    if (application.feePayment && application.feePayment.status === 'APPROVED') {
      return res.status(400).json({ error: 'Fee has already been approved for this application.' });
    }

    let receiptPath = null;
    if (req.file) {
      receiptPath = `/uploads/receipts/${req.file.filename}`;
      await prisma.document.create({
        data: {
          userId: req.user.id,
          type: 'fee_receipt',
          filePath: receiptPath,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
        },
      });
    }

    // Fee amount comes from the per-program FeeStructure (Fix 3) when present.
    // Fall back to the legacy per-cycle FeeAnnouncement, then 0.
    const feeStructure = await prisma.feeStructure.findUnique({
      where: { cycleId_programId: { cycleId: application.admissionCycleId, programId: application.programId } },
    }).catch(() => null);
    const announcement = application.admissionCycle?.feeAnnouncement;
    const feeAmount = (feeStructure && feeStructure.totalAmount) || announcement?.feeAmount || 0;

    // Lock the fee structure once a payment is submitted — it can no longer be edited.
    if (feeStructure && !feeStructure.isLocked) {
      await prisma.feeStructure.update({ where: { id: feeStructure.id }, data: { isLocked: true } }).catch(() => {});
    }

    const payment = await prisma.feePayment.upsert({
      where: { applicationId: parseInt(applicationId) },
      update: {
        amount: feeAmount,
        receiptPath,
        paymentMethod,
        txnId: txnId || null,
        bankAccountId: bankAccountId ? parseInt(bankAccountId) : null,
        status: 'PENDING',
        paidAt: new Date(),
        adminRemarks: null,
      },
      create: {
        userId: req.user.id,
        applicationId: parseInt(applicationId),
        amount: feeAmount,
        receiptPath,
        paymentMethod,
        txnId: txnId || null,
        bankAccountId: bankAccountId ? parseInt(bankAccountId) : null,
        paidAt: new Date(),
        status: 'PENDING',
      },
    });

    await prisma.application.update({
      where: { id: parseInt(applicationId) },
      data: { status: 'FEE_PAID' },
    });

    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: 'Fee Receipt Uploaded',
        message: `Your fee receipt for application #${applicationId} has been uploaded and is pending confirmation by the Director.`,
      },
    });

    res.json({ message: 'Fee receipt uploaded successfully', payment });
  } catch (error) {
    console.error('Pay fee error:', error);
    res.status(500).json({ error: 'Failed to upload fee receipt' });
  }
});

// GET /api/fee/my-payments — student's fee payments
router.get('/my-payments', authenticate, async (req, res) => {
  try {
    const payments = await prisma.feePayment.findMany({
      where: { userId: req.user.id },
      include: { application: { include: { program: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// GET /api/fee/all-payments — admin views all payments
router.get('/all-payments', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = status;

    const payments = await prisma.feePayment.findMany({
      where,
      include: {
        application: { include: { program: true } },
        user: {
          select: {
            id: true, email: true,
            profile: { select: { firstName: true, lastName: true, cnic: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// PUT /api/fee/review/:paymentId — admin reviews fee payment
// On APPROVE: automatically auto-generate Registration Number AND Roll Number,
//             upsert the Enrollment row and set application.status = ENROLLED.
router.put('/review/:paymentId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, remarks } = req.body;
    if (!['APPROVED', 'REJECTED', 'NEEDS_INFO'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const payment = await prisma.feePayment.findUnique({
      where: { id: parseInt(req.params.paymentId) },
      include: {
        application: {
          include: {
            program: true,
            admissionCycle: true,
          },
        },
        user: { select: { id: true, enrollment: true } },
      },
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const updated = await prisma.feePayment.update({
      where: { id: parseInt(req.params.paymentId) },
      data: { status, adminRemarks: remarks || null },
    });

    // Update application status based on fee review
    let appStatus;
    let enrollment = null;
    let regNumber = null;
    let rollNumber = null;

    if (status === 'APPROVED') {
      appStatus = 'ENROLLED';

      // Roll/registration/LMS credential generation lives in one shared helper
      // so every enrollment path behaves identically. Credentials are generated
      // now but stay HIDDEN from the student (credentialsPublished=false) until
      // the Director clicks "Show to Student".
      enrollment = await confirmEnrollment({
        application: { ...payment.application, userId: payment.userId },
        existingEnrollment: payment.user.enrollment,
      });
      rollNumber = enrollment.rollNumber || null;
      regNumber = enrollment.registrationNumber || null;
    } else {
      appStatus = 'FEE_PENDING'; // Allow student to re-upload
    }

    await prisma.application.update({
      where: { id: payment.applicationId },
      data: { status: appStatus },
    });

    const messages = {
      APPROVED: `🎉 Congratulations! Your fee for ${payment.application.program.name} has been approved and you are successfully enrolled. Your Registration Number, Roll Number and LMS credentials are being prepared and will be published by the Admissions Office shortly.`,
      REJECTED: `Your fee payment for ${payment.application.program.name} has been rejected.${remarks ? ' Reason: ' + remarks : ''} Please re-upload a valid receipt.`,
      NEEDS_INFO: `Additional information is required regarding your fee payment for ${payment.application.program.name}.${remarks ? ' Details: ' + remarks : ''}`,
    };

    await prisma.notification.create({
      data: {
        userId: payment.userId,
        title: `Fee Payment ${status === 'APPROVED' ? 'Confirmed — Enrolled' : status === 'REJECTED' ? 'Rejected' : 'Needs Info'}`,
        message: messages[status],
      },
    });

    // Dedicated email templates for fee status + enrollment confirmation
    try {
      const userRow = await prisma.user.findUnique({
        where: { id: payment.userId },
        select: { email: true, emailNotifications: true },
      });
      if (userRow?.emailNotifications && userRow?.email) {
        sendFeeStatusEmail(userRow.email, payment.application.program.name, status, remarks).catch(() => {});
        // Enrollment-confirmed email (with credentials) is deferred until the
        // Director publishes the credentials via "Show to Student" — see the
        // enrollment publish endpoint. This keeps credentials hidden until then.
      }
    } catch (_) {}

    res.json({
      message: 'Fee review updated',
      payment: updated,
      enrollment: enrollment ? {
        rollNumber: enrollment.rollNumber,
        registrationNumber: enrollment.registrationNumber,
        lmsUsername: enrollment.lmsUsername,
        status: enrollment.status,
      } : null,
    });
  } catch (error) {
    console.error('Review fee error:', error);
    res.status(500).json({ error: 'Failed to review fee payment' });
  }
});

module.exports = router;

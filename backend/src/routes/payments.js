/**
 * /api/payments router
 *
 * Reconstructed stub — the original payments.js was empty after archive
 * extraction. This implementation provides exactly the three endpoints
 * documented in the AdminDashboard "Payment Endpoints" panel:
 *
 *   GET  /api/payments/config                       — public-safe payment config
 *   POST /api/payments/gateway/processing-fee       — student pays application processing fee
 *   POST /api/payments/gateway/admission-fee        — student pays admission/enrollment fee
 *
 * (Master Prompt §5) EasyPaisa has been fully removed. All online payments now
 * go exclusively through the generic Bank Payment Gateway abstraction
 * (src/utils/bankGateway.js). The legacy /easypaisa/* alias routes have also
 * been removed.
 *
 * Behaviour mirrors the rest of the codebase:
 *   - JWT-protected (student-only) for the two payment endpoints.
 *   - /config is unauthenticated and only exposes non-secret fields.
 *   - The live Bank Payment Gateway is used when credentials are configured
 *     (PaymentGatewayConfig or .env). Otherwise we fall back to a deterministic
 *     sandbox mock so the flow works end-to-end without live credentials.
 *   - Every attempt (success or failure) is persisted via recordTransaction
 *     so admins/coordinators see the full payment history.
 *   - Audit trail StatusEvents are written so the student timeline reflects
 *     fee payments in real time.
 */
const express = require('express');
const { PrismaClient } = require('@prisma/client');
// EasyPaisa has been removed in Phase 2. All online payments now go through
// the generic Bank Payment Gateway abstraction.
const {
  isConfigured,
  getGatewayMode,
  getConfig: getGatewayConfig,
  initiatePayment,
  recordTransaction,
  verifyWebhookSignature,
} = require('../utils/bankGateway');
const { authenticate, requireStudent } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getActiveCycle() {
  // Prefer an open cycle, fall back to the most recent.
  return (
    (await prisma.admissionCycle.findFirst({
      where: { isOpen: true },
      orderBy: { id: 'desc' },
    })) ||
    (await prisma.admissionCycle.findFirst({ orderBy: { id: 'desc' } }))
  );
}

async function logStatus(applicationId, status, actorRole, remarks) {
  try {
    if (!applicationId) return;
    await prisma.statusEvent.create({
      data: { applicationId, status, actorRole, remarks: remarks || null },
    });
  } catch (e) {
    // non-fatal — the timeline is best-effort
    console.error('[payments] logStatus failed:', e.message);
  }
}

// ---------------------------------------------------------------------------
// GET /api/payments/config  (public-safe)
// ---------------------------------------------------------------------------
router.get('/config', async (req, res) => {
  try {
    const cycle = await getActiveCycle();
    const fee = cycle
      ? await prisma.feeAnnouncement.findUnique({
          where: { admissionCycleId: cycle.id },
        })
      : null;

    const configured = await isConfigured();
    const mode = await getGatewayMode();
    const gwCfg = await getGatewayConfig();

    res.json({
      configured,
      mock: !configured,
      gatewayMode: mode, // 'live' | 'sandbox' | 'manual'
      cycle: cycle
        ? { id: cycle.id, title: cycle.title, isOpen: cycle.isOpen }
        : null,
      // Generic Bank Payment Gateway (replaces EasyPaisa)
      bankGateway: {
        enabled: gwCfg.enabled !== false,
        name: gwCfg.gatewayName || 'Bank Payment Gateway',
        mode,
        supportedFees: ['PROCESSING_FEE', 'SEMESTER_FEE'],
      },
      admissionFee: fee && fee.isAnnounced ? Number(fee.feeAmount) : null,
      applicationProcessingFee: cycle?.applicationProcessingFee || 1200,
      // Processing fee defaults to the cycle value if present.
      processingFee: cycle?.applicationProcessingFee || 1500,
    });
  } catch (err) {
    console.error('[payments] /config failed:', err);
    res.status(500).json({ error: 'Failed to load payment config' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments/gateway/processing-fee  (Bank Payment Gateway)
// ---------------------------------------------------------------------------
async function handleProcessingFee(req, res) {
  try {
    const { applicationId, payerName, payerPhone } = req.body || {};

    const cycle = await getActiveCycle();
    const amount = cycle?.applicationProcessingFee || 1500; // application processing fee
    const orderRefId = `PROC-${req.user.id}-${Date.now()}`;

    const result = await initiatePayment({
      amount,
      email: req.user.email,
      orderRefId,
      purpose: 'Application Processing Fee',
      payerName,
      payerPhone,
    });

    await recordTransaction({
      userId: req.user.id,
      applicationId: applicationId || null,
      txnId: result.txnId,
      orderRefId,
      purpose: 'Application Processing Fee',
      amount,
      status: result.success ? (result.checkoutUrl ? 'PENDING' : 'COMPLETED') : 'FAILED',
      method: 'BANK_GATEWAY',
      payerRef: payerPhone || payerName || null,
      errorMessage: result.success ? null : result.error,
      isMock: !!result.mock,
      rawResponse: result.raw || null,
      paidAt: result.paidAt || null,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Payment failed' });
    }

    // Only mark paid when there's no hosted-checkout redirect pending.
    if (applicationId && !result.checkoutUrl) {
      await logStatus(
        applicationId,
        'PROCESSING_FEE_PAID',
        'student',
        `Bank gateway txn ${result.txnId}${result.mock ? ' (sandbox)' : ''}`,
      );
    }

    res.json({
      success: true,
      mock: !!result.mock,
      txnId: result.txnId,
      amount,
      method: 'BANK_GATEWAY',
      checkoutUrl: result.checkoutUrl || null,
      message: result.message || 'Processing fee payment recorded successfully.',
    });
  } catch (err) {
    console.error('[payments] processing-fee failed:', err);
    res.status(500).json({ error: 'Failed to process payment' });
  }
}

router.post('/gateway/processing-fee', authenticate, requireStudent, handleProcessingFee);

// ---------------------------------------------------------------------------
// POST /api/payments/gateway/admission-fee   (Bank Payment Gateway)
// ---------------------------------------------------------------------------
async function handleAdmissionFee(req, res) {
  try {
    const { applicationId, payerName, payerPhone } = req.body || {};
    if (!applicationId) {
      return res
        .status(400)
        .json({ error: 'applicationId is required for admission fee payment' });
    }

    // Verify the application belongs to this student and is in a fee-payable state.
    const application = await prisma.application.findUnique({
      where: { id: Number(applicationId) },
    });
    if (!application || application.userId !== req.user.id) {
      return res.status(404).json({ error: 'Application not found' });
    }
    if (!['SELECTED', 'FEE_PENDING'].includes(application.status)) {
      return res.status(400).json({
        error: `Admission fee cannot be paid in current status: ${application.status}`,
      });
    }

    const cycle = await getActiveCycle();
    // Prefer the per-program FeeStructure (Fix 3); fall back to legacy FeeAnnouncement.
    const feeStructure = await prisma.feeStructure.findUnique({
      where: { cycleId_programId: { cycleId: application.admissionCycleId, programId: application.programId } },
    }).catch(() => null);
    const fee = cycle
      ? await prisma.feeAnnouncement.findUnique({
          where: { admissionCycleId: cycle.id },
        })
      : null;
    const amount = (feeStructure && feeStructure.totalAmount > 0)
      ? Number(feeStructure.totalAmount)
      : (fee && fee.isAnnounced ? Number(fee.feeAmount) : null);
    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: 'Admission fee has not been announced yet. Please contact the admissions office.',
      });
    }
    // Lock the fee structure once a payment is submitted.
    if (feeStructure && !feeStructure.isLocked) {
      await prisma.feeStructure.update({ where: { id: feeStructure.id }, data: { isLocked: true } }).catch(() => {});
    }

    const orderRefId = `ADMIT-${req.user.id}-${application.id}-${Date.now()}`;

    const result = await initiatePayment({
      amount,
      email: req.user.email,
      orderRefId,
      purpose: 'Semester Fee',
      payerName,
      payerPhone,
    });

    await recordTransaction({
      userId: req.user.id,
      applicationId: application.id,
      txnId: result.txnId,
      orderRefId,
      purpose: 'Semester Fee',
      amount,
      status: result.success ? (result.checkoutUrl ? 'PENDING' : 'COMPLETED') : 'FAILED',
      method: 'BANK_GATEWAY',
      payerRef: payerPhone || payerName || null,
      errorMessage: result.success ? null : result.error,
      isMock: !!result.mock,
      rawResponse: result.raw || null,
      paidAt: result.paidAt || null,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Payment failed' });
    }

    // If the bank returns a hosted-checkout URL, do NOT mark paid yet — the
    // webhook/callback finalises the payment. Return the redirect URL.
    if (result.checkoutUrl) {
      return res.json({
        success: true,
        pending: true,
        txnId: result.txnId,
        amount,
        method: 'BANK_GATEWAY',
        checkoutUrl: result.checkoutUrl,
        message: 'Redirecting to secure bank checkout…',
      });
    }

    // Persist a FeePayment row (or update if it already exists) so the
    // admin/coordinator review pipeline picks it up.
    try {
      await prisma.feePayment.upsert({
        where: { applicationId: application.id },
        update: {
          amount,
          paymentMethod: 'BANK_GATEWAY',
          txnId: result.txnId,
          paidAt: result.paidAt || new Date(),
          status: 'PENDING', // pending admin review
        },
        create: {
          userId: req.user.id,
          applicationId: application.id,
          amount,
          paymentMethod: 'BANK_GATEWAY',
          txnId: result.txnId,
          paidAt: result.paidAt || new Date(),
          status: 'PENDING',
        },
      });
    } catch (e) {
      console.error('[payments] feePayment upsert failed:', e.message);
    }

    // Update application status to FEE_PAID and emit a StatusEvent so the
    // student timeline reflects the change in real time.
    try {
      await prisma.application.update({
        where: { id: application.id },
        data: { status: 'FEE_PAID' },
      });
    } catch (e) {
      console.error('[payments] application status update failed:', e.message);
    }

    await logStatus(
      application.id,
      'FEE_PAID',
      'student',
      `Bank gateway txn ${result.txnId}${result.mock ? ' (sandbox)' : ''} — PKR ${amount}`,
    );

    res.json({
      success: true,
      mock: !!result.mock,
      txnId: result.txnId,
      amount,
      method: 'BANK_GATEWAY',
      message: result.message || 'Semester fee payment recorded successfully. Pending admin review.',
    });
  } catch (err) {
    console.error('[payments] admission-fee failed:', err);
    res.status(500).json({ error: 'Failed to process payment' });
  }
}

router.post('/gateway/admission-fee', authenticate, requireStudent, handleAdmissionFee);

// ---------------------------------------------------------------------------
// POST /api/payments/gateway/callback  — bank redirect return (browser)
// POST /api/payments/gateway/webhook   — server-to-server payment result
// ---------------------------------------------------------------------------
// These endpoints finalise a payment that used the hosted-checkout flow.
// The webhook is signature-verified; the browser callback is best-effort.
async function finalizeGatewayPayment({ orderRefId, txnId, status }) {
  // Locate the pending transaction by orderRefId (preferred) or txnId.
  const txn = await prisma.transaction.findFirst({
    where: orderRefId ? { orderRefId } : { txnId },
    orderBy: { id: 'desc' },
  });
  if (!txn) return { ok: false, reason: 'transaction not found' };

  const success = String(status || '').toLowerCase() === 'success'
    || String(status || '').toLowerCase() === 'completed'
    || String(status || '').toLowerCase() === 'paid';

  await prisma.transaction.update({
    where: { id: txn.id },
    data: { status: success ? 'COMPLETED' : 'FAILED', paidAt: success ? new Date() : null },
  });

  if (success && txn.applicationId) {
    if ((txn.purpose || '').toLowerCase().includes('processing')) {
      await logStatus(txn.applicationId, 'PROCESSING_FEE_PAID', 'system', `Gateway confirmed ${txn.txnId}`);
    } else {
      await prisma.feePayment.upsert({
        where: { applicationId: txn.applicationId },
        update: { amount: txn.amount, paymentMethod: 'BANK_GATEWAY', txnId: txn.txnId, paidAt: new Date(), status: 'PENDING' },
        create: { userId: txn.userId, applicationId: txn.applicationId, amount: txn.amount, paymentMethod: 'BANK_GATEWAY', txnId: txn.txnId, paidAt: new Date(), status: 'PENDING' },
      }).catch(() => {});
      await prisma.application.update({ where: { id: txn.applicationId }, data: { status: 'FEE_PAID' } }).catch(() => {});
      await logStatus(txn.applicationId, 'FEE_PAID', 'system', `Gateway confirmed ${txn.txnId} — PKR ${txn.amount}`);
    }
  }
  return { ok: true, success };
}

router.post('/gateway/webhook', async (req, res) => {
  try {
    const cfg = await getGatewayConfig();
    const signature = req.headers['x-signature'] || req.headers['x-webhook-signature'];
    const valid = verifyWebhookSignature(req.body, signature, cfg.webhookSecret);
    if (!valid) return res.status(401).json({ error: 'Invalid signature' });

    const { orderId, transactionId, status } = req.body || {};
    const result = await finalizeGatewayPayment({ orderRefId: orderId, txnId: transactionId, status });
    res.json({ received: true, ...result });
  } catch (err) {
    console.error('[payments] webhook failed:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.get('/gateway/callback', async (req, res) => {
  try {
    const { orderId, transactionId, status } = req.query || {};
    await finalizeGatewayPayment({ orderRefId: orderId, txnId: transactionId, status });
    const cfg = await getGatewayConfig();
    const target = cfg.returnUrl || (process.env.FRONTEND_URL || 'http://localhost:3000') + '/dashboard';
    res.redirect(`${target}?payment=${encodeURIComponent(status || 'unknown')}`);
  } catch (err) {
    console.error('[payments] callback failed:', err);
    res.status(500).send('Payment callback error');
  }
});

module.exports = router;

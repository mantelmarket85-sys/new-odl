const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Helper — singleton config (auto-create on first read)
async function getConfig() {
  let cfg = await prisma.paymentMethodConfig.findFirst();
  if (!cfg) {
    cfg = await prisma.paymentMethodConfig.create({
      data: {
        // (Master Prompt §5) EasyPaisa removed — the online method is the
        // generic Bank Payment Gateway. EasyPaisa stays disabled.
        bankTransferEnabled: true,
        easypaisaEnabled: false,
        bankGatewayEnabled: true,
        onebillEnabled: true,
        onebillCompanyCode: 'AUST01',
        onebillConsumerNumber: '0001234567',
      },
    });
  }
  return cfg;
}

// ============================================================
// GET /api/payment-methods/public — student-facing visible methods + bank accounts
// ============================================================
router.get('/public', authenticate, async (req, res) => {
  try {
    const cfg = await getConfig();
    const banks = await prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    // Also factor in admission cycle's allowed list
    const cycle = await prisma.admissionCycle.findFirst({
      where: { isOpen: true },
      orderBy: { createdAt: 'desc' },
    });
    const allowedFromCycle = cycle && cycle.allowedPaymentMethods
      ? cycle.allowedPaymentMethods.split(',').map((s) => s.trim())
      : ['BANK_TRANSFER', 'BANK_GATEWAY', 'ONEBILL_VOUCHER'];
    // Backward-compat: treat legacy EASYPAISA allow-entry as BANK_GATEWAY.
    if (allowedFromCycle.includes('EASYPAISA') && !allowedFromCycle.includes('BANK_GATEWAY')) {
      allowedFromCycle.push('BANK_GATEWAY');
    }

    const methods = [];
    if (cfg.bankTransferEnabled && allowedFromCycle.includes('BANK_TRANSFER')) {
      methods.push({
        code: 'BANK_TRANSFER',
        label: 'Bank Transfer',
        instructions: cfg.bankTransferInstructions,
      });
    }
    // Generic Bank Payment Gateway (replaces EasyPaisa)
    if ((cfg.bankGatewayEnabled ?? true) && allowedFromCycle.includes('BANK_GATEWAY')) {
      methods.push({
        code: 'BANK_GATEWAY',
        label: 'Bank Payment Gateway',
        instructions: cfg.bankGatewayInstructions,
      });
    }
    if (cfg.onebillEnabled && allowedFromCycle.includes('ONEBILL_VOUCHER')) {
      methods.push({
        code: 'ONEBILL_VOUCHER',
        label: '1Bill Voucher',
        instructions: cfg.onebillInstructions,
        companyCode: cfg.onebillCompanyCode,
        consumerNumber: cfg.onebillConsumerNumber,
      });
    }

    res.json({ methods, bankAccounts: banks });
  } catch (error) {
    console.error('Public payment methods error:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
});

// ============================================================
// GET /api/payment-methods/admin — full config (Director Admissions)
// ============================================================
router.get('/admin', authenticate, requireAdmin, async (req, res) => {
  try {
    const cfg = await getConfig();
    const banks = await prisma.bankAccount.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ config: cfg, bankAccounts: banks });
  } catch (error) {
    console.error('Admin payment methods error:', error);
    res.status(500).json({ error: 'Failed to fetch payment methods configuration' });
  }
});

// ============================================================
// PUT /api/payment-methods/admin — update config
// ============================================================
router.put('/admin', authenticate, requireAdmin, async (req, res) => {
  try {
    const cfg = await getConfig();
    const data = {};
    // (Master Prompt §5) EasyPaisa fields removed from the accepted config set.
    const fields = [
      'bankTransferEnabled', 'onebillEnabled', 'bankGatewayEnabled',
      'onebillCompanyCode', 'onebillConsumerNumber', 'onebillInstructions',
      'bankTransferInstructions', 'bankGatewayInstructions',
    ];
    const boolFields = ['bankTransferEnabled', 'onebillEnabled', 'bankGatewayEnabled'];
    for (const k of fields) {
      if (req.body[k] !== undefined) {
        if (boolFields.includes(k)) {
          data[k] = !!req.body[k];
        } else {
          data[k] = req.body[k] || null;
        }
      }
    }
    const updated = await prisma.paymentMethodConfig.update({
      where: { id: cfg.id },
      data,
    });
    res.json({ message: 'Payment methods configuration updated', config: updated });
  } catch (error) {
    console.error('Update payment methods config error:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// ============================================================
// BANK ACCOUNT CRUD
// ============================================================
router.get('/bank-accounts', authenticate, async (req, res) => {
  try {
    const where = {};
    if (req.user.role === 'student') where.isActive = true;
    const banks = await prisma.bankAccount.findMany({ where, orderBy: { sortOrder: 'asc' } });
    res.json({ bankAccounts: banks });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
});

router.post('/bank-accounts', authenticate, requireAdmin, async (req, res) => {
  try {
    const { bankName, accountTitle, iban, branchCode, isActive, sortOrder } = req.body;
    if (!bankName || !accountTitle || !iban) {
      return res.status(400).json({ error: 'Bank name, account title, and IBAN are required' });
    }
    const created = await prisma.bankAccount.create({
      data: {
        bankName: String(bankName).trim(),
        accountTitle: String(accountTitle).trim(),
        iban: String(iban).trim().replace(/\s+/g, '').toUpperCase(),
        branchCode: branchCode ? String(branchCode).trim() : null,
        isActive: isActive !== false,
        sortOrder: sortOrder ? parseInt(sortOrder) : 0,
      },
    });
    res.status(201).json({ message: 'Bank account added', bankAccount: created });
  } catch (error) {
    console.error('Add bank account error:', error);
    res.status(500).json({ error: 'Failed to add bank account' });
  }
});

router.put('/bank-accounts/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { bankName, accountTitle, iban, branchCode, isActive, sortOrder } = req.body;
    const data = {};
    if (bankName !== undefined) data.bankName = String(bankName).trim();
    if (accountTitle !== undefined) data.accountTitle = String(accountTitle).trim();
    if (iban !== undefined) data.iban = String(iban).trim().replace(/\s+/g, '').toUpperCase();
    if (branchCode !== undefined) data.branchCode = branchCode ? String(branchCode).trim() : null;
    if (isActive !== undefined) data.isActive = !!isActive;
    if (sortOrder !== undefined) data.sortOrder = parseInt(sortOrder) || 0;

    const updated = await prisma.bankAccount.update({
      where: { id: parseInt(id) },
      data,
    });
    res.json({ message: 'Bank account updated', bankAccount: updated });
  } catch (error) {
    console.error('Update bank account error:', error);
    res.status(500).json({ error: 'Failed to update bank account' });
  }
});

router.delete('/bank-accounts/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.bankAccount.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Bank account deleted' });
  } catch (error) {
    console.error('Delete bank account error:', error);
    res.status(500).json({ error: 'Failed to delete bank account' });
  }
});

module.exports = router;

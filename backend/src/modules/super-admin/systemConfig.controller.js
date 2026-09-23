// ============================================================
//  SUPER ADMIN — SYSTEM CONFIGURATION & SECURITY CONTROLLER
//  ------------------------------------------------------------
//  System key/value config, password policy, system-wide
//  announcements, maintenance mode, and the override log viewer.
//  Every mutation logged via logSaActivity(); override viewing is
//  read-only here (overrides are *written* from the modules that
//  perform the override, using superAdmin.service.logOverride).
// ============================================================
const prisma = require('../../utils/prisma');
const { logSaActivity } = require('./superAdmin.service');

// ---- Generic key/value system configuration -----------------------------
async function listConfig(req, res) {
  try {
    const config = await prisma.systemConfiguration.findMany({ orderBy: { key: 'asc' } });
    res.json({ config });
  } catch (e) {
    console.error('SA listConfig error:', e);
    res.status(500).json({ error: 'Failed to load system configuration' });
  }
}

async function setConfig(req, res) {
  try {
    const { key, value, description } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required.' });
    const entry = await prisma.systemConfiguration.upsert({
      where: { key },
      update: { value: value != null ? String(value) : null, description, updatedBy: req.user.id },
      create: { key, value: value != null ? String(value) : null, description, updatedBy: req.user.id },
    });
    await logSaActivity({ req, module: 'system', action: 'set_config', description: `Set config ${key}` });
    res.json({ entry, message: 'Configuration saved.' });
  } catch (e) {
    console.error('SA setConfig error:', e);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
}

// ---- Password policy (single row) ---------------------------------------
async function getPasswordPolicy(req, res) {
  try {
    let policy = await prisma.passwordPolicy.findFirst();
    if (!policy) policy = await prisma.passwordPolicy.create({ data: {} });
    res.json({ policy });
  } catch (e) {
    console.error('SA getPasswordPolicy error:', e);
    res.status(500).json({ error: 'Failed to load password policy' });
  }
}

async function updatePasswordPolicy(req, res) {
  try {
    let policy = await prisma.passwordPolicy.findFirst();
    const data = { updatedBy: req.user.id };
    const intFields = ['minLength', 'maxFailedAttempts', 'sessionTimeout'];
    const boolFields = ['requireUppercase', 'requireLowercase', 'requireNumber', 'requireSpecial', 'twoFactorEnabled'];
    intFields.forEach((k) => { if (req.body[k] !== undefined) data[k] = parseInt(req.body[k], 10); });
    boolFields.forEach((k) => { if (typeof req.body[k] === 'boolean') data[k] = req.body[k]; });
    if (!policy) policy = await prisma.passwordPolicy.create({ data });
    else policy = await prisma.passwordPolicy.update({ where: { id: policy.id }, data });
    await logSaActivity({ req, module: 'system', action: 'update_password_policy', description: 'Updated password policy' });
    res.json({ policy, message: 'Password policy updated.' });
  } catch (e) {
    console.error('SA updatePasswordPolicy error:', e);
    res.status(500).json({ error: 'Failed to update password policy' });
  }
}

// ---- System-wide announcements ------------------------------------------
async function listAnnouncements(req, res) {
  try {
    const announcements = await prisma.systemAnnouncement.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ announcements });
  } catch (e) {
    console.error('SA listAnnouncements error:', e);
    res.status(500).json({ error: 'Failed to load announcements' });
  }
}

async function createAnnouncement(req, res) {
  try {
    const { title, content, targetRole, targetSystem, priority, scheduledAt } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title and content are required.' });
    const scheduled = scheduledAt ? new Date(scheduledAt) : null;
    const announcement = await prisma.systemAnnouncement.create({
      data: {
        title, content,
        targetRole: targetRole || 'ALL',
        targetSystem: targetSystem || 'ALL',
        priority: priority || 'normal',
        scheduledAt: scheduled,
        sentAt: scheduled ? null : new Date(),
        createdBy: req.user.id,
      },
    });
    await logSaActivity({ req, module: 'system', action: 'create_announcement', description: `Posted announcement "${title}"` });
    res.status(201).json({ announcement, message: 'Announcement posted.' });
  } catch (e) {
    console.error('SA createAnnouncement error:', e);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
}

async function updateAnnouncement(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    const data = {};
    ['title', 'content', 'targetRole', 'targetSystem', 'priority'].forEach((k) => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    if (req.body.scheduledAt !== undefined) data.scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
    if (typeof req.body.isActive === 'boolean') data.isActive = req.body.isActive;
    const announcement = await prisma.systemAnnouncement.update({ where: { id }, data });
    await logSaActivity({ req, module: 'system', action: 'update_announcement', description: `Updated announcement #${id}` });
    res.json({ announcement, message: 'Announcement updated.' });
  } catch (e) {
    console.error('SA updateAnnouncement error:', e);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
}

async function deleteAnnouncement(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.systemAnnouncement.delete({ where: { id } });
    await logSaActivity({ req, module: 'system', action: 'delete_announcement', description: `Deleted announcement #${id}` });
    res.json({ message: 'Announcement deleted.' });
  } catch (e) {
    console.error('SA deleteAnnouncement error:', e);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
}

// ---- Maintenance mode (single active row) -------------------------------
async function getMaintenanceMode(req, res) {
  try {
    let mode = await prisma.systemMaintenanceMode.findFirst({ orderBy: { id: 'desc' } });
    if (!mode) mode = await prisma.systemMaintenanceMode.create({ data: {} });
    res.json({ maintenance: mode });
  } catch (e) {
    console.error('SA getMaintenanceMode error:', e);
    res.status(500).json({ error: 'Failed to load maintenance mode' });
  }
}

async function setMaintenanceMode(req, res) {
  try {
    const { isEnabled, message } = req.body;
    let mode = await prisma.systemMaintenanceMode.findFirst({ orderBy: { id: 'desc' } });
    const data = {
      isEnabled: !!isEnabled,
      message: message || null,
      enabledBy: req.user.id,
      enabledAt: isEnabled ? new Date() : (mode?.enabledAt || null),
      disabledAt: !isEnabled ? new Date() : null,
    };
    if (!mode) mode = await prisma.systemMaintenanceMode.create({ data });
    else mode = await prisma.systemMaintenanceMode.update({ where: { id: mode.id }, data });
    await logSaActivity({ req, module: 'system', action: 'set_maintenance', description: `Maintenance mode ${isEnabled ? 'ENABLED' : 'disabled'}` });
    res.json({ maintenance: mode, message: `Maintenance mode ${isEnabled ? 'enabled' : 'disabled'}.` });
  } catch (e) {
    console.error('SA setMaintenanceMode error:', e);
    res.status(500).json({ error: 'Failed to update maintenance mode' });
  }
}

// ============================================================
// ---- Payment Gateway configuration (Phase 1 §5) -------------------------
//  Single-row PaymentGatewayConfig table (mirrors password-policy /
//  maintenance-mode singleton pattern). The Super Admin UI configures the
//  Bank Gateway credentials, API/secret keys, callback/return URLs,
//  environment (mode) and supported payment methods here. The bankGateway
//  util already reads this row (DB overrides env), so this closes the loop
//  between the prepared backend and the missing Super Admin config screen.
// ============================================================
const GATEWAY_STRING_FIELDS = [
  'gatewayName', 'mode', 'apiUrl', 'apiKey', 'secretKey', 'merchantId',
  'callbackUrl', 'webhookSecret', 'returnUrl', 'supportedFees',
];
const GATEWAY_MODES = ['sandbox', 'live', 'manual'];

// Never leak the raw secrets back to the browser — return a masked marker so
// the UI can show "configured" without ever re-exposing the value.
function maskSecret(v) {
  if (!v) return '';
  return '••••••••'; // presence indicator only
}

function serialiseGatewayConfig(cfg) {
  return {
    id: cfg.id,
    gatewayName: cfg.gatewayName,
    mode: cfg.mode,
    enabled: cfg.enabled,
    apiUrl: cfg.apiUrl,
    apiKey: cfg.apiKey, // API key is a public-ish identifier, safe to display
    merchantId: cfg.merchantId,
    callbackUrl: cfg.callbackUrl,
    returnUrl: cfg.returnUrl,
    supportedFees: cfg.supportedFees,
    // Secrets: never returned in clear — only presence flags + mask.
    secretKeySet: !!cfg.secretKey,
    secretKey: maskSecret(cfg.secretKey),
    webhookSecretSet: !!cfg.webhookSecret,
    webhookSecret: maskSecret(cfg.webhookSecret),
    updatedAt: cfg.updatedAt,
  };
}

async function getGatewayConfigRow() {
  let cfg = await prisma.paymentGatewayConfig.findFirst({ orderBy: { id: 'asc' } });
  if (!cfg) cfg = await prisma.paymentGatewayConfig.create({ data: {} });
  return cfg;
}

async function getPaymentGateway(req, res) {
  try {
    const cfg = await getGatewayConfigRow();
    // Also surface the student-facing payment-method toggles so the Super Admin
    // sees "Payment Methods" in one screen (they live in PaymentMethodConfig).
    let methods = await prisma.paymentMethodConfig.findFirst();
    if (!methods) methods = await prisma.paymentMethodConfig.create({ data: {} });
    res.json({
      gateway: serialiseGatewayConfig(cfg),
      methods: {
        id: methods.id,
        bankTransferEnabled: methods.bankTransferEnabled,
        bankGatewayEnabled: methods.bankGatewayEnabled,
        onebillEnabled: methods.onebillEnabled,
      },
    });
  } catch (e) {
    console.error('SA getPaymentGateway error:', e);
    res.status(500).json({ error: 'Failed to load payment gateway configuration' });
  }
}

async function updatePaymentGateway(req, res) {
  try {
    const cfg = await getGatewayConfigRow();
    const data = {};
    // String fields — for secrets, only overwrite when a real (non-masked,
    // non-empty) value is supplied so re-saving the form never wipes them.
    GATEWAY_STRING_FIELDS.forEach((k) => {
      if (req.body[k] === undefined) return;
      let val = req.body[k] == null ? '' : String(req.body[k]);
      if (k === 'mode') {
        val = val.toLowerCase();
        if (!GATEWAY_MODES.includes(val)) return; // ignore invalid mode
      }
      if (k === 'secretKey' || k === 'webhookSecret') {
        // Skip the masked placeholder so we keep the stored secret intact.
        if (val === '' || val.startsWith('•')) return;
      }
      data[k] = val;
    });
    if (typeof req.body.enabled === 'boolean') data.enabled = req.body.enabled;

    const updated = await prisma.paymentGatewayConfig.update({ where: { id: cfg.id }, data });

    // Optionally sync the student-facing gateway toggle when provided.
    if (typeof req.body.bankGatewayEnabled === 'boolean') {
      let methods = await prisma.paymentMethodConfig.findFirst();
      if (!methods) methods = await prisma.paymentMethodConfig.create({ data: {} });
      await prisma.paymentMethodConfig.update({
        where: { id: methods.id },
        data: { bankGatewayEnabled: req.body.bankGatewayEnabled },
      });
    }

    await logSaActivity({ req, module: 'system', action: 'update_payment_gateway', description: `Updated payment gateway config (${updated.gatewayName}, mode=${updated.mode})` });
    res.json({ gateway: serialiseGatewayConfig(updated), message: 'Payment gateway configuration saved.' });
  } catch (e) {
    console.error('SA updatePaymentGateway error:', e);
    res.status(500).json({ error: 'Failed to save payment gateway configuration' });
  }
}

// ---- Override log viewer (read-only) ------------------------------------
async function listOverrideLogs(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const where = {};
    if (req.query.module) where.targetModule = req.query.module;
    const [logs, total] = await Promise.all([
      prisma.overrideLog.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
      prisma.overrideLog.count({ where }),
    ]);
    res.json({ logs, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) {
    console.error('SA listOverrideLogs error:', e);
    res.status(500).json({ error: 'Failed to load override logs' });
  }
}

module.exports = {
  listConfig, setConfig,
  getPasswordPolicy, updatePasswordPolicy,
  listAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  getMaintenanceMode, setMaintenanceMode,
  getPaymentGateway, updatePaymentGateway,
  listOverrideLogs,
};

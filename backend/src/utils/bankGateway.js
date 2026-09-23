/**
 * Generic Bank Payment Gateway Utility
 * ============================================================
 * This module replaces the previous EasyPaisa integration with a
 * PROVIDER-AGNOSTIC bank payment gateway abstraction. The whole system
 * (frontend, backend, database) is wired so that going live only requires
 * populating the gateway credentials in the environment / DB — no code
 * changes.
 *
 * Exposed helpers:
 *   - isConfigured()            : true when live gateway credentials exist.
 *   - getGatewayMode()          : 'live' | 'sandbox' | 'manual'.
 *   - initiatePayment(opts)     : starts a payment (or returns a hosted
 *                                 checkout URL when the bank provides one).
 *   - verifyWebhookSignature()  : HMAC verification for webhook callbacks.
 *   - recordTransaction(data)   : persists a Transaction row (full history).
 *
 * Configuration precedence:  DB PaymentGatewayConfig  →  process.env.
 *   BANK_GATEWAY_API_URL, BANK_GATEWAY_API_KEY, BANK_GATEWAY_SECRET_KEY,
 *   BANK_GATEWAY_MERCHANT_ID, BANK_GATEWAY_CALLBACK_URL,
 *   BANK_GATEWAY_WEBHOOK_SECRET, BANK_GATEWAY_RETURN_URL,
 *   PAYMENT_GATEWAY_MODE (sandbox|live|manual), BANK_GATEWAY_NAME
 *
 * When not configured for LIVE, the helper falls back to a deterministic
 * sandbox transaction so the full flow works end-to-end in dev.
 *
 * See docs/PAYMENT_GATEWAY_INTEGRATION.md for the full developer guide.
 */
const crypto = require('crypto');
const prisma = require('./prisma');

// ------------------------------------------------------------
// Configuration resolution (DB overrides env).
// ------------------------------------------------------------
async function loadDbConfig() {
  try {
    return await prisma.paymentGatewayConfig.findFirst({ orderBy: { id: 'asc' } });
  } catch (_) {
    return null; // model may not exist on very old DBs; fall back to env.
  }
}

function envConfig() {
  return {
    mode: (process.env.PAYMENT_GATEWAY_MODE || 'sandbox').toLowerCase(),
    gatewayName: process.env.BANK_GATEWAY_NAME || 'Bank Payment Gateway',
    apiUrl: process.env.BANK_GATEWAY_API_URL || '',
    apiKey: process.env.BANK_GATEWAY_API_KEY || '',
    secretKey: process.env.BANK_GATEWAY_SECRET_KEY || '',
    merchantId: process.env.BANK_GATEWAY_MERCHANT_ID || '',
    callbackUrl: process.env.BANK_GATEWAY_CALLBACK_URL || '',
    webhookSecret: process.env.BANK_GATEWAY_WEBHOOK_SECRET || '',
    returnUrl: process.env.BANK_GATEWAY_RETURN_URL || '',
  };
}

/**
 * Return the effective gateway config (DB row merged over env fallbacks).
 */
async function getConfig() {
  const env = envConfig();
  const db = await loadDbConfig();
  if (!db) return env;
  return {
    mode: (db.mode || env.mode || 'sandbox').toLowerCase(),
    gatewayName: db.gatewayName || env.gatewayName,
    apiUrl: db.apiUrl || env.apiUrl,
    apiKey: db.apiKey || env.apiKey,
    secretKey: db.secretKey || env.secretKey,
    merchantId: db.merchantId || env.merchantId,
    callbackUrl: db.callbackUrl || env.callbackUrl,
    webhookSecret: db.webhookSecret || env.webhookSecret,
    returnUrl: db.returnUrl || env.returnUrl,
    enabled: db.enabled !== false,
  };
}

/** True when the gateway has enough credentials to run in LIVE mode. */
function isConfiguredFromCfg(cfg) {
  return !!(cfg && cfg.apiUrl && cfg.apiKey && cfg.merchantId && cfg.mode === 'live');
}

async function isConfigured() {
  const cfg = await getConfig();
  return isConfiguredFromCfg(cfg);
}

async function getGatewayMode() {
  const cfg = await getConfig();
  if (isConfiguredFromCfg(cfg)) return 'live';
  return cfg.mode === 'manual' ? 'manual' : 'sandbox';
}

function generateTxnId(prefix = 'BNK') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * Verify a webhook signature using HMAC-SHA256 over the raw body.
 * Banks typically send an `X-Signature` header; adapt as needed.
 */
function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret) return true; // no secret configured → accept (sandbox)
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {}))
      .digest('hex');
    // constant-time compare
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

/**
 * Initiate a payment against the bank gateway.
 * @param {Object} opts
 *   amount     : number (PKR)
 *   email      : string
 *   orderRefId : string
 *   purpose    : string ("Application Processing Fee" | "Admission Fee" | "Semester Fee")
 *   payerName  : string (optional)
 *   payerPhone : string (optional)
 *   returnUrl  : string (optional override)
 *
 * @returns {Promise<{success, txnId, mock, checkoutUrl?, message?, error?, raw?, paidAt?}>}
 *
 * NOTE: The exact request/response shape depends on the bank. The LIVE
 * branch below is written as a clearly-marked TEMPLATE so a developer only
 * needs to adjust the fetch payload and response parsing once credentials
 * are provided.
 */
async function initiatePayment(opts) {
  const { amount, email, orderRefId, purpose, payerName, payerPhone, returnUrl } = opts || {};
  if (!amount || amount <= 0) {
    return { success: false, error: 'Invalid amount' };
  }

  const cfg = await getConfig();

  // ---- SANDBOX / MANUAL fallback (deterministic, always succeeds) --------
  if (!isConfiguredFromCfg(cfg)) {
    const txnId = generateTxnId('SBX');
    return {
      success: true,
      mock: true,
      txnId,
      paidAt: new Date(),
      message: `Sandbox payment accepted for "${purpose}" (PKR ${amount}). Configure live bank credentials to process real payments.`,
      raw: { sandbox: true, orderRefId, gatewayName: cfg.gatewayName },
    };
  }

  // ---- LIVE gateway call (TEMPLATE — adapt to your bank's API) -----------
  try {
    const payload = {
      merchantId: cfg.merchantId,
      orderId: orderRefId,
      amount: Number(amount).toFixed(2),
      currency: 'PKR',
      description: purpose,
      customerEmail: email,
      customerName: payerName || undefined,
      customerPhone: payerPhone || undefined,
      callbackUrl: cfg.callbackUrl,
      returnUrl: returnUrl || cfg.returnUrl,
    };
    const signature = crypto
      .createHmac('sha256', cfg.secretKey || '')
      .update(JSON.stringify(payload))
      .digest('hex');

    const resp = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
        'X-Signature': signature,
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return { success: false, error: data.message || `Gateway error (${resp.status})`, raw: data };
    }
    // Typical bank response: { transactionId, status, redirectUrl }
    return {
      success: (data.status || '').toLowerCase() === 'success' || !!data.redirectUrl,
      txnId: data.transactionId || generateTxnId(),
      checkoutUrl: data.redirectUrl || null,
      paidAt: data.status && data.status.toLowerCase() === 'success' ? new Date() : null,
      message: data.message || 'Payment initiated.',
      raw: data,
    };
  } catch (err) {
    return { success: false, error: `Gateway request failed: ${err.message}` };
  }
}

/**
 * Persist a Transaction row so admins/coordinators see full payment history.
 * Safe: never throws — a failure to log must not break the payment response.
 */
async function recordTransaction(data) {
  try {
    return await prisma.transaction.create({
      data: {
        userId: data.userId,
        applicationId: data.applicationId || null,
        txnId: data.txnId || generateTxnId(),
        orderRefId: data.orderRefId || null,
        purpose: data.purpose,
        method: data.method || 'BANK_GATEWAY',
        amount: data.amount,
        status: data.status || 'PENDING',
        // We reuse the mobileAccount column to store the payer reference so
        // the schema stays backward-compatible without a migration.
        mobileAccount: data.payerRef || data.mobileAccount || null,
        errorMessage: data.errorMessage || null,
        isMock: !!data.isMock,
        rawResponse: data.rawResponse ? JSON.stringify(data.rawResponse) : null,
        paidAt: data.paidAt || null,
      },
    });
  } catch (err) {
    console.error('[bankGateway] recordTransaction failed:', err.message);
    return null;
  }
}

module.exports = {
  getConfig,
  isConfigured,
  getGatewayMode,
  generateTxnId,
  verifyWebhookSignature,
  initiatePayment,
  recordTransaction,
};

// ============================================================
//  SUPER ADMIN — SHARED SERVICE
//  ------------------------------------------------------------
//  Cross-cutting helpers used by every Super Admin controller:
//    - logSaActivity()  → write to SaActivityLog (every action)
//    - logOverride()    → write to OverrideLog (permanent, never deleted)
//    - getClientIp()    → resolve request IP
//    - randomPassword() → generate a temporary password
//
//  These NEVER throw in a way that breaks the calling request — audit
//  writes are best-effort (logged on failure).
// ============================================================
const prisma = require('../../utils/prisma');

function getClientIp(req) {
  if (!req) return null;
  const xf = req.headers && req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.ip || req.connection?.remoteAddress || '').replace('::ffff:', '') || null;
}

function randomPassword(len = 10) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const num = '23456789';
  const spec = '@#$%&*';
  const all = upper + lower + num + spec;
  // Guarantee policy compliance: 1 upper, 1 lower, 1 number, 1 special.
  let out =
    upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    num[Math.floor(Math.random() * num.length)] +
    spec[Math.floor(Math.random() * spec.length)];
  for (let i = out.length; i < len; i += 1) {
    out += all[Math.floor(Math.random() * all.length)];
  }
  // shuffle
  return out.split('').sort(() => Math.random() - 0.5).join('');
}

async function logSaActivity({ req, module, action, description, metadata }) {
  try {
    const actor = req && req.user ? req.user : {};
    await prisma.saActivityLog.create({
      data: {
        actorId: actor.id || null,
        actorName: actor.username || actor.email || null,
        actorRole: actor.role || null,
        module: module || 'system',
        action: action || 'action',
        description: description || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress: getClientIp(req),
      },
    });
  } catch (e) {
    console.warn('[sa-activity] failed:', e.message);
  }
}

async function logOverride({ req, targetModule, targetId, action, originalValue, newValue, reason }) {
  const actor = req && req.user ? req.user : {};
  // Override logging is required (mandatory reason) — it should surface errors
  // to the caller so we never silently lose an override audit. But we still
  // guard so a serialization issue cannot 500 the whole request.
  try {
    return await prisma.overrideLog.create({
      data: {
        overriddenBy: actor.id || 0,
        overriddenByName: actor.username || actor.email || null,
        targetModule: targetModule || 'unknown',
        targetId: targetId != null ? String(targetId) : null,
        action: action || null,
        originalValue: originalValue !== undefined ? JSON.stringify(originalValue) : null,
        newValue: newValue !== undefined ? JSON.stringify(newValue) : null,
        reason: reason || 'No reason provided',
        ipAddress: getClientIp(req),
      },
    });
  } catch (e) {
    console.error('[override-log] failed:', e.message);
    return null;
  }
}

// ------------------------------------------------------------
// logLmsAudit — write to the SAME LmsAuditLog table the LMS roles use,
// so a Super Admin action appears in LMS audit trails exactly as if the
// original role (Teacher / Focal / Exam etc.) had performed it. The
// actorRole carries the role being impersonated for full traceability.
// Best-effort — never breaks the calling request.
// ------------------------------------------------------------
async function logLmsAudit({ req, action, entity, entityId, before, after, actorRole }) {
  try {
    await prisma.lmsAuditLog.create({
      data: {
        actorId: null, // Super Admin is an admissions User, not an LmsUser
        actorRole: actorRole || 'super_admin',
        action: action || 'ACTION',
        entity: entity || 'Unknown',
        entityId: entityId != null ? String(entityId) : null,
        beforeJson: before !== undefined ? JSON.stringify(before) : null,
        afterJson: after !== undefined ? JSON.stringify(after) : null,
        ip: getClientIp(req),
        userAgent: req && req.headers ? req.headers['user-agent'] || null : null,
      },
    });
  } catch (e) {
    console.warn('[lms-audit] failed:', e.message);
  }
}

module.exports = { getClientIp, randomPassword, logSaActivity, logOverride, logLmsAudit, prisma };

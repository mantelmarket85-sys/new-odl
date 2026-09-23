// ============================================================
//  LOGIN SECURITY HELPERS
//  ------------------------------------------------------------
//  Shared, dependency-light helpers used by the authentication
//  routes (admissions + LMS) to implement:
//    - account lockout after repeated failed attempts
//    - audit logging of every login attempt
//  Everything here is best-effort and wrapped so a logging/lock
//  failure can NEVER break the actual login flow.
// ============================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Lockout policy.
const MAX_FAILED_ATTEMPTS = 5;          // lock after this many consecutive failures
const LOCK_WINDOW_MINUTES = 15;         // how long the account stays locked

/** Extract client IP + user-agent from an Express request (safe). */
function clientMeta(req) {
  try {
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      null;
    const userAgent = (req.headers['user-agent'] || '').slice(0, 300) || null;
    return { ip, userAgent };
  } catch (_) {
    return { ip: null, userAgent: null };
  }
}

/** Is the account currently locked? Returns remaining seconds (0 if not locked). */
function lockRemainingSeconds(lockedUntil) {
  if (!lockedUntil) return 0;
  const ms = new Date(lockedUntil).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/**
 * Write a login-audit row. Best-effort: never throws.
 */
async function recordLoginAttempt({
  system, actorType, actorId, username, role, success, reason, req,
}) {
  try {
    const { ip, userAgent } = clientMeta(req || {});
    await prisma.loginAudit.create({
      data: {
        system,
        actorType,
        actorId: actorId != null ? String(actorId) : null,
        username: username || null,
        role: role || null,
        success: !!success,
        reason: reason || null,
        ip,
        userAgent,
      },
    });
  } catch (e) {
    // Audit logging must never block authentication.
    console.warn('[loginSecurity] audit write failed:', e.message);
  }
}

module.exports = {
  MAX_FAILED_ATTEMPTS,
  LOCK_WINDOW_MINUTES,
  clientMeta,
  lockRemainingSeconds,
  recordLoginAttempt,
  prisma,
};

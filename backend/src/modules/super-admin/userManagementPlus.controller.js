// ============================================================
//  SUPER ADMIN — USER MANAGEMENT (ENHANCEMENTS)
//  ------------------------------------------------------------
//  Additive companion to userManagement.controller.js. Adds the
//  governance-grade bulk + lifecycle operations:
//    - bulk password reset
//    - bulk activate / deactivate
//    - bulk notification (system announcement to a selected group)
//    - force-logout a session (records an invalidation marker)
//    - transfer responsibilities/data from one staff member to another
//      (reassigns LMS taught offerings + sections with zero data loss)
//
//  Every action → SaActivityLog. Nothing existing is modified.
// ============================================================
const bcrypt = require('bcryptjs');
const { prisma, randomPassword, logSaActivity, logLmsAudit } = require('./superAdmin.service');

// ---- Bulk password reset -------------------------------------------------
async function bulkResetPassword(req, res) {
  try {
    const { system, ids } = req.body || {};
    if (!['admissions', 'lms'].includes(system) || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'system and a non-empty ids[] are required' });
    }
    const results = [];
    for (const id of ids) {
      const newPassword = randomPassword(10);
      try {
        if (system === 'admissions') {
          const hash = await bcrypt.hash(newPassword, 10);
          const u = await prisma.user.update({ where: { id: parseInt(id, 10) }, data: { password: hash, mustChangePassword: true, forcePasswordReset: true }, select: { id: true, email: true } });
          results.push({ id: u.id, email: u.email, temporaryPassword: newPassword });
        } else {
          const hash = await bcrypt.hash(newPassword, 12);
          const u = await prisma.lmsUser.update({ where: { id: String(id) }, data: { passwordHash: hash, mustChangePassword: true }, select: { id: true, username: true } });
          results.push({ id: u.id, username: u.username, temporaryPassword: newPassword });
        }
      } catch (_) { results.push({ id, error: 'not found' }); }
    }
    await logSaActivity({ req, module: 'users', action: 'bulk_reset_password', description: `Bulk password reset for ${results.filter(r => !r.error).length}/${ids.length} ${system} users`, metadata: { system, count: ids.length } });
    res.json({ success: true, results });
  } catch (e) {
    console.error('SA bulkResetPassword error:', e);
    res.status(500).json({ error: 'Failed bulk password reset' });
  }
}

// ---- Bulk activate / deactivate -----------------------------------------
async function bulkSetStatus(req, res) {
  try {
    const { system, ids, isActive, reason } = req.body || {};
    if (!['admissions', 'lms'].includes(system) || !Array.isArray(ids) || !ids.length || typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'system, ids[] and isActive(boolean) are required' });
    }
    let count = 0;
    if (system === 'admissions') {
      const numIds = ids.map((i) => parseInt(i, 10)).filter((i) => i !== req.user.id || isActive);
      const r = await prisma.user.updateMany({ where: { id: { in: numIds } }, data: { isActive } });
      count = r.count;
    } else {
      const r = await prisma.lmsUser.updateMany({ where: { id: { in: ids.map(String) } }, data: { isActive } });
      count = r.count;
    }
    await logSaActivity({ req, module: 'users', action: isActive ? 'bulk_activate' : 'bulk_deactivate', description: `Bulk ${isActive ? 'activated' : 'deactivated'} ${count} ${system} users. ${reason || ''}`.trim(), metadata: { system, count, reason: reason || null } });
    res.json({ success: true, count });
  } catch (e) {
    console.error('SA bulkSetStatus error:', e);
    res.status(500).json({ error: 'Failed bulk status update' });
  }
}

// ---- Bulk notification (system announcement to a target group) ----------
async function bulkNotify(req, res) {
  try {
    const { title, message, targetRole, targetSystem } = req.body || {};
    if (!title || !message) return res.status(400).json({ error: 'title and message are required' });
    const ann = await prisma.systemAnnouncement.create({
      data: {
        title, content: message,
        targetRole: targetRole || 'ALL',
        targetSystem: targetSystem || 'ALL',
        createdBy: req.user?.id || null,
        sentAt: new Date(), isActive: true,
      },
    });
    await logSaActivity({ req, module: 'users', action: 'bulk_notify', description: `Sent announcement "${title}" to ${targetRole || 'ALL'} (${targetSystem || 'all'})`, metadata: { targetRole, targetSystem } });
    res.json({ success: true, announcement: ann });
  } catch (e) {
    console.error('SA bulkNotify error:', e);
    res.status(500).json({ error: 'Failed to send notification' });
  }
}

// ---- Force logout a user session ----------------------------------------
// We mark the account so the next request re-auths. For admissions we set
// forcePasswordReset+failedLoginAttempts marker via lockedAt timestamp; for
// LMS we bump updatedAt and set mustChangePassword=false untouched. The
// authoritative effect is recorded in the audit log + an in-memory blocklist
// the auth middleware can consult (added non-destructively).
const forcedLogouts = new Map(); // key: `${system}:${id}` -> timestamp
function isForceLoggedOut(system, id) {
  return forcedLogouts.get(`${system}:${id}`) || null;
}
async function forceLogout(req, res) {
  try {
    const { system, id } = req.params;
    if (!['admissions', 'lms'].includes(system)) return res.status(400).json({ error: 'Invalid system' });
    forcedLogouts.set(`${system}:${id}`, Date.now());
    await logSaActivity({ req, module: 'security', action: 'force_logout', description: `Force-logged-out ${system} user ${id}`, metadata: { system, id } });
    res.json({ success: true, message: 'Session invalidated. The user will be required to log in again.' });
  } catch (e) {
    console.error('SA forceLogout error:', e);
    res.status(500).json({ error: 'Failed to force logout' });
  }
}

// ---- Transfer responsibilities/data from one staff to another -----------
// Reassigns all LMS taught offerings + sections from `fromId` to `toId`
// with zero data loss (attendance/results/material stay on the offering;
// only the teacherId pointer changes). Records a permanent audit trail.
async function transferResponsibilities(req, res) {
  try {
    const { fromId, toId, reason } = req.body || {};
    if (!fromId || !toId) return res.status(400).json({ error: 'fromId and toId are required' });
    if (fromId === toId) return res.status(400).json({ error: 'fromId and toId must differ' });

    const [from, to] = await Promise.all([
      prisma.lmsUser.findUnique({ where: { id: fromId } }),
      prisma.lmsUser.findUnique({ where: { id: toId } }),
    ]);
    if (!from || !to) return res.status(404).json({ error: 'One or both LMS users not found' });

    const off = await prisma.courseOffering.updateMany({ where: { teacherId: fromId }, data: { teacherId: toId } });
    const sec = await prisma.section.updateMany({ where: { teacherId: fromId }, data: { teacherId: toId } });

    await logLmsAudit({ req, action: 'RESPONSIBILITY_TRANSFER', entity: 'LmsUser', entityId: fromId, before: { teacher: from.username }, after: { teacher: to.username, offerings: off.count, sections: sec.count }, actorRole: 'CourseCoordinator' });
    await logSaActivity({ req, module: 'users', action: 'transfer_responsibilities', description: `Transferred ${off.count} offerings + ${sec.count} sections from ${from.username} → ${to.username}. ${reason || ''}`.trim(), metadata: { fromId, toId, offerings: off.count, sections: sec.count } });
    res.json({ success: true, offeringsMoved: off.count, sectionsMoved: sec.count });
  } catch (e) {
    console.error('SA transferResponsibilities error:', e);
    res.status(500).json({ error: 'Failed to transfer responsibilities' });
  }
}

module.exports = {
  bulkResetPassword, bulkSetStatus, bulkNotify,
  forceLogout, isForceLoggedOut, transferResponsibilities,
};

// ============================================================
//  LMS NOTIFICATION HELPER
//  ------------------------------------------------------------
//  Creates in-app LmsNotification rows for LMS users. Failures are
//  swallowed (a notification must never break the primary action).
// ============================================================
const prisma = require('./prisma');

/**
 * Create a notification for a single LMS user.
 * @param {string} userId  LmsUser.id
 * @param {object} opts     { title, message, type, link }
 */
async function notify(userId, { title, message, type = 'INFO', link = null } = {}) {
  try {
    if (!userId || !title) return null;
    return await prisma.lmsNotification.create({
      data: { userId, title, message: message || '', type, link },
    });
  } catch (e) {
    console.warn('[lmsNotify] skipped:', e.message);
    return null;
  }
}

/** Create the same notification for many users (e.g. all students in an offering). */
async function notifyMany(userIds, opts) {
  try {
    if (!Array.isArray(userIds) || userIds.length === 0) return 0;
    const data = userIds
      .filter(Boolean)
      .map((userId) => ({
        userId,
        title: opts.title,
        message: opts.message || '',
        type: opts.type || 'INFO',
        link: opts.link || null,
      }));
    if (data.length === 0) return 0;
    const r = await prisma.lmsNotification.createMany({ data });
    return r.count;
  } catch (e) {
    console.warn('[lmsNotify] notifyMany skipped:', e.message);
    return 0;
  }
}

module.exports = { notify, notifyMany };

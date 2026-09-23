const { PrismaClient } = require('@prisma/client');
const { sendNotificationEmail } = require('./email');

const prisma = new PrismaClient();

/**
 * Unified notify helper — creates in-app notification and (if user has
 * emailNotifications enabled) also sends an email.
 *
 * Usage:
 *   await notify(userId, 'Title', 'Message body');
 *   await notify({ userId, title, message, skipEmail: true, link: '...' });
 */
async function notify(userIdOrOptions, title, message, link = null) {
  let userId, _title, _message, _link = null, skipEmail = false;
  if (typeof userIdOrOptions === 'object') {
    ({ userId, title: _title, message: _message, link: _link = null, skipEmail = false } = userIdOrOptions);
  } else {
    userId = userIdOrOptions;
    _title = title;
    _message = message;
    _link = link;
  }

  // 1) In-app notification (always)
  const created = await prisma.notification.create({
    data: { userId, title: _title, message: _message, link: _link || null },
  });

  // 2) Email notification (best-effort, only if user has it enabled)
  if (!skipEmail) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, emailNotifications: true },
      });
      if (user && user.emailNotifications && user.email) {
        // fire-and-forget — don't block API response
        sendNotificationEmail(user.email, _title, _message, _link).catch((e) =>
          console.error('[notify] email send failed:', e.message)
        );
      }
    } catch (e) {
      console.error('[notify] failed to fetch user for email:', e.message);
    }
  }

  return created;
}

module.exports = { notify };

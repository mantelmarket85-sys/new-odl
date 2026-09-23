// ============================================================
//  STUDENT ACTIVITY LOGGER (Requirement #7)
//  ------------------------------------------------------------
//  Centralised, fire-and-forget helper to record meaningful
//  student events into the StudentActivity table for the
//  real-time activity timeline. Failures are swallowed (logged
//  to console) so activity logging never breaks the main flow.
//
//  Activity types:
//    LOGIN | LOGOUT | ASSIGNMENT_SUBMIT | QUIZ_ATTEMPT |
//    ATTENDANCE | LIVE_CLASS | COURSE_ACCESS |
//    ANNOUNCEMENT_VIEW | AI_TUTOR | RESULT | OTHER
// ============================================================
const prisma = require('./prisma');

const ACTIVITY_TYPES = [
  'LOGIN', 'LOGOUT', 'ASSIGNMENT_SUBMIT', 'QUIZ_ATTEMPT', 'ATTENDANCE',
  'LIVE_CLASS', 'COURSE_ACCESS', 'ANNOUNCEMENT_VIEW', 'AI_TUTOR', 'RESULT', 'OTHER',
];

/**
 * Record a student activity. Never throws.
 * @param {Object} opts
 * @param {string} opts.studentId   LmsUser.id (required)
 * @param {string} opts.type        one of ACTIVITY_TYPES
 * @param {string} opts.title       short human-readable title
 * @param {string} [opts.description]
 * @param {string} [opts.courseCode]
 * @param {string} [opts.courseTitle]
 * @param {string} [opts.refType]
 * @param {string|number} [opts.refId]
 * @param {Object} [opts.metadata]  serialised to JSON
 * @param {Object} [opts.req]       express req (to capture IP)
 */
async function logActivity(opts = {}) {
  try {
    const {
      studentId, type, title, description,
      courseCode, courseTitle, refType, refId, metadata, req,
    } = opts;
    if (!studentId || !type || !title) return null;
    const safeType = ACTIVITY_TYPES.includes(type) ? type : 'OTHER';
    let ipAddress = null;
    if (req) {
      ipAddress = (req.headers && (req.headers['x-forwarded-for'] || '').split(',')[0].trim())
        || req.ip || (req.connection && req.connection.remoteAddress) || null;
    }
    return await prisma.studentActivity.create({
      data: {
        studentId,
        type: safeType,
        title: String(title).slice(0, 300),
        description: description ? String(description).slice(0, 1000) : null,
        courseCode: courseCode || null,
        courseTitle: courseTitle || null,
        refType: refType || null,
        refId: refId != null ? String(refId) : null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        ipAddress,
      },
    });
  } catch (err) {
    // Fire-and-forget: never break the calling request.
    // eslint-disable-next-line no-console
    console.error('[activityLog] failed:', err.message);
    return null;
  }
}

module.exports = { logActivity, ACTIVITY_TYPES };

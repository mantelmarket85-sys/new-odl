// ============================================================
//  LMS WORKFLOW HELPERS  (Phases 3–7)
//  ------------------------------------------------------------
//  Shared logic for the governance roles: the escalation matrix
//  (who an item escalates to next), approval transitions, and a
//  display-name resolver for LmsUsers (students have a profile;
//  staff fall back to a humanized username).
// ============================================================
const prisma = require('./prisma');

// Canonical escalation chain (academic hierarchy, low → high authority).
const ESCALATION_CHAIN = [
  'Teacher',
  'CourseCoordinator',
  'FocalPerson',
  'ExamController',
  'QECCoordinator',
  'Provost',
];

/** The next role above `role` in the chain (or null if already top). */
function nextRole(role) {
  const idx = ESCALATION_CHAIN.indexOf(role);
  if (idx === -1 || idx === ESCALATION_CHAIN.length - 1) return null;
  return ESCALATION_CHAIN[idx + 1];
}

/** Humanize a staff username e.g. "teacher2" → "Teacher 2", "coord1" → "Coord 1". */
function humanizeUsername(username) {
  if (!username) return 'User';
  const m = username.match(/^([a-zA-Z]+)(\d+)$/);
  if (m) {
    const word = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    return `${word} ${m[2]}`;
  }
  return username;
}

/** Display name for an LmsUser-like object that may include a `profile`. */
function displayName(user) {
  if (!user) return '—';
  if (user.profile && user.profile.fullName) return user.profile.fullName;
  return humanizeUsername(user.username);
}

/**
 * Build a name lookup map { lmsUserId: displayName } for a set of ids.
 * One query — used to decorate workflow lists with actor/student names.
 */
async function nameMap(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length === 0) return {};
  const users = await prisma.lmsUser.findMany({
    where: { id: { in: unique } },
    select: { id: true, username: true, role: true, profile: { select: { fullName: true } } },
  });
  const map = {};
  for (const u of users) map[u.id] = displayName(u);
  return map;
}

module.exports = {
  ESCALATION_CHAIN,
  nextRole,
  humanizeUsername,
  displayName,
  nameMap,
};

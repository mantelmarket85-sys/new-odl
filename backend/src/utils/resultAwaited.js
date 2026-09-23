// ============================================================
//  RESULT AWAITED GATE (Additional Fixes §5)
//  ------------------------------------------------------------
//  A candidate whose FSc / required qualification result is still
//  "Result Awaited" MAY submit an application and appear in
//  Applications, but MUST NOT progress beyond the Initial Merit
//  stage until the declared result is entered. Concretely they must
//  not be marked Interview-Eligible, receive an interview schedule,
//  appear on the Final Merit List, or complete enrollment.
//
//  This helper centralises the "is this applicant still awaiting a
//  result?" decision so every gate uses the same rule. It inspects
//  the student's Education rows (the FSc / 12-year record) and the
//  application's own resultStatus flag.
// ============================================================
const prisma = require('./prisma');

/**
 * Returns true when the given user still has an awaited (undeclared) result
 * that should block them from progressing past the Initial Merit stage.
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
async function isResultAwaited(userId) {
  if (!userId) return false;
  try {
    const educations = await prisma.education.findMany({
      where: { userId: Number(userId) },
      select: { level: true, resultStatus: true },
    });
    // Any FSc / 12-year (or 11-year Part-I) record still "Waiting" blocks progress.
    return educations.some(
      (e) => (e.level === '12years' || e.level === '11years') && e.resultStatus === 'Waiting',
    );
  } catch {
    return false;
  }
}

/**
 * Convenience: given an application object (must include userId + resultStatus),
 * decide if it is blocked. Uses the application's own resultStatus first
 * (fast path) then falls back to inspecting education rows.
 * @param {{userId:number, resultStatus?:string}} application
 */
async function applicationResultAwaited(application) {
  if (!application) return false;
  if ((application.resultStatus || '').toLowerCase() === 'waiting') return true;
  if ((application.status || '') === 'RESULT_AWAITED') return true;
  return isResultAwaited(application.userId);
}

module.exports = { isResultAwaited, applicationResultAwaited };

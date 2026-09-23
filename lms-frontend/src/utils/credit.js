// ============================================================
//  CREDIT-HOUR DISPLAY HELPERS (Course Coordinator credit breakdown)
//  ------------------------------------------------------------
//  A course may be theory-only or carry a distinct Lab component.
//  When it has a lab, credit hours are shown in the standard
//  "Theory+Lab" notation (e.g. 3 theory + 1 lab → "3+1"). Otherwise a
//  plain total is shown (e.g. "3"). This keeps the display consistent
//  everywhere the Scheme of Study / course credits appear (student,
//  teacher, coordinator, focal person, …).
//
//  Back-compat: legacy courses (no hasLab / breakdown) fall back to
//  the plain creditHours total.
// ============================================================

/**
 * @param {object} course  A course-like object with any of:
 *   { creditHours, hasLab, theoryCredit, labCredit, creditLabel }
 * @returns {string} e.g. "3+1" or "3"
 */
export function formatCredits(course) {
  if (!course) return "0";
  // Prefer a server-provided label when present.
  if (course.creditLabel) return String(course.creditLabel);
  const total = Number(course.creditHours) || 0;
  const hasLab = course.hasLab === true;
  if (hasLab) {
    const lab = course.labCredit != null ? Number(course.labCredit) : 0;
    const theory = course.theoryCredit != null ? Number(course.theoryCredit) : Math.max(0, total - lab);
    return `${theory}+${lab}`;
  }
  const theory = course.theoryCredit != null ? Number(course.theoryCredit) : total;
  return `${theory}`;
}

/** Total numeric credit hours (theory + lab), for GPA / credit sums. */
export function totalCredits(course) {
  if (!course) return 0;
  const total = Number(course.creditHours);
  if (!Number.isNaN(total) && total > 0) return total;
  const theory = Number(course.theoryCredit) || 0;
  const lab = Number(course.labCredit) || 0;
  return theory + lab;
}

/** True when the course carries a distinct Lab component. */
export function courseHasLab(course) {
  return !!course && course.hasLab === true;
}

// ============================================================
//  CREDIT-HOUR FORMATTING (Course Coordinator credit breakdown)
//  ------------------------------------------------------------
//  A course's credit hours may be a simple total (theory-only) or a
//  Theory+Lab split. This helper produces the standard "Theory+Lab"
//  display label (e.g. "3+1") plus the structured breakdown so every
//  view across the system renders credit hours consistently.
//
//  Back-compat: legacy courses (hasLab false / null theoryCredit) fall
//  back to the total creditHours and render as a plain number ("3").
// ============================================================

/**
 * Build the credit-hour presentation for a course-like object.
 * @param {{creditHours?:number, hasLab?:boolean, theoryCredit?:number|null, labCredit?:number|null}} course
 * @returns {{creditHours:number, hasLab:boolean, theoryCredit:number, labCredit:number, creditLabel:string}}
 */
function creditInfo(course) {
  if (!course) {
    return { creditHours: 0, hasLab: false, theoryCredit: 0, labCredit: 0, creditLabel: '0' };
  }
  const total = Number(course.creditHours) || 0;
  const hasLab = course.hasLab === true;
  if (hasLab) {
    const theory = course.theoryCredit != null ? Number(course.theoryCredit) : Math.max(0, total - (Number(course.labCredit) || 0));
    const lab = course.labCredit != null ? Number(course.labCredit) : Math.max(0, total - theory);
    return { creditHours: total || theory + lab, hasLab: true, theoryCredit: theory, labCredit: lab, creditLabel: `${theory}+${lab}` };
  }
  const theory = course.theoryCredit != null ? Number(course.theoryCredit) : total;
  return { creditHours: total || theory, hasLab: false, theoryCredit: theory, labCredit: 0, creditLabel: `${theory}` };
}

/** Just the display string, e.g. "3+1" or "3". */
function creditLabel(course) {
  return creditInfo(course).creditLabel;
}

/**
 * Merge the credit breakdown fields (+ creditLabel) onto a plain object that
 * carries the raw course credit columns. Non-destructive: returns a new object.
 */
function withCreditLabel(obj) {
  if (!obj) return obj;
  const info = creditInfo(obj);
  return {
    ...obj,
    hasLab: info.hasLab,
    theoryCredit: info.theoryCredit,
    labCredit: info.labCredit,
    creditLabel: info.creditLabel,
  };
}

module.exports = { creditInfo, creditLabel, withCreditLabel };

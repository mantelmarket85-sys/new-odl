// ============================================================
//  MERIT WEIGHTS (Additional Fixes §3)
//  ------------------------------------------------------------
//  Merit criteria (Matric / FSc / Interview weightage) are now
//  configured PER PROGRAM rather than per Admission Cycle. This
//  helper resolves the effective weights for a given program,
//  falling back to legacy cycle-level weights (and finally to the
//  historical 30/40/30 defaults) so old data keeps working.
//
//  KEY BEHAVIOUR (§3 — Interview Weightage = 0%):
//    When a program sets interviewWeight = 0, interview marks are
//    ignored and merit is computed using ONLY the remaining
//    configured criteria (matric + fsc), automatically.
//
//  The weighted merit is computed as:
//      matricWeighted    = matricPercent   * matricW / 100
//      fscWeighted       = fscPercent      * fscW    / 100
//      interviewWeighted = interviewMarks  * intW    / 100   (0 when intW=0)
//      totalMerit        = sum of the above
//  If the three weights do not sum to 100 we normalise them so the
//  score is always on a comparable 0–100 scale.
// ============================================================

/**
 * Resolve the effective merit weights for a program.
 * @param {object} program  Prisma Program row (may be null)
 * @param {object} cycle    Prisma AdmissionCycle row (legacy fallback, may be null)
 * @returns {{matricWeight:number, fscWeight:number, interviewWeight:number}}
 */
function resolveWeights(program, cycle) {
  const pick = (progVal, cycleVal, def) => {
    if (progVal !== undefined && progVal !== null && !Number.isNaN(Number(progVal))) return Number(progVal);
    if (cycleVal !== undefined && cycleVal !== null && !Number.isNaN(Number(cycleVal))) return Number(cycleVal);
    return def;
  };
  // Program is authoritative when it exists (it always does for new data,
  // and defaults to 30/40/30 for legacy rows thanks to the schema default).
  const matricWeight = pick(program?.matricWeight, cycle?.matricWeight, 30);
  const fscWeight = pick(program?.fscWeight, cycle?.fscWeight, 40);
  const interviewWeight = pick(program?.interviewWeight, cycle?.interviewWeight, 30);
  return { matricWeight, fscWeight, interviewWeight };
}

/**
 * Compute the weighted merit breakdown for an applicant.
 * @param {object} params
 * @param {number} params.matricPercent
 * @param {number} params.fscPercent
 * @param {number} params.interviewMarks   raw interview marks (treated as a 0–100 score)
 * @param {object} params.program          Prisma Program row
 * @param {object} [params.cycle]          Prisma AdmissionCycle row (fallback)
 * @returns {{matricWeighted,fscWeighted,interviewWeighted,totalMerit,weights}}
 */
function computeMerit({ matricPercent = 0, fscPercent = 0, interviewMarks = 0, program, cycle }) {
  let { matricWeight, fscWeight, interviewWeight } = resolveWeights(program, cycle);

  // If interview weight is 0, interview marks must NOT contribute. We keep the
  // remaining weights as configured (they should already sum to 100 without the
  // interview slice). Normalisation below guards against misconfiguration.
  const sum = matricWeight + fscWeight + interviewWeight;
  let mW = matricWeight;
  let fW = fscWeight;
  let iW = interviewWeight;
  if (sum > 0 && Math.abs(sum - 100) > 0.01) {
    // Normalise to 100 so scores stay comparable across programs.
    mW = (matricWeight / sum) * 100;
    fW = (fscWeight / sum) * 100;
    iW = (interviewWeight / sum) * 100;
  }

  const matricWeighted = (Number(matricPercent) || 0) * (mW / 100);
  const fscWeighted = (Number(fscPercent) || 0) * (fW / 100);
  const interviewWeighted = interviewWeight === 0
    ? 0
    : (Number(interviewMarks) || 0) * (iW / 100);
  const totalMerit = matricWeighted + fscWeighted + interviewWeighted;

  return {
    matricWeighted,
    fscWeighted,
    interviewWeighted,
    totalMerit,
    weights: { matricWeight, fscWeight, interviewWeight },
  };
}

/** True when interview does not contribute to this program's merit. */
function interviewDisabled(program, cycle) {
  return resolveWeights(program, cycle).interviewWeight === 0;
}

module.exports = { resolveWeights, computeMerit, interviewDisabled };

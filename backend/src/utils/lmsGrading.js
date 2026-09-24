// ============================================================
//  LMS GRADING SERVICE
//  ------------------------------------------------------------
//  Central, single source of truth for converting a weighted
//  percentage into a letter grade + grade points, and for
//  computing the weighted total of a CourseResult given the
//  offering's component weights.
//
//  Grading scheme (AUST-style 4.0 GPA). Adjust thresholds in ONE
//  place and the whole system (gradebook, transcript, analytics)
//  stays consistent.
// ============================================================

const policy = require('./academicPolicy');

// Ordered high → low. First threshold whose `min` <= percent wins.
// Kept for callers that still read GRADE_SCALE; calculations use academicPolicy.
const GRADE_SCALE = [
  { min: 90, letter: 'A+', points: 4.0 },
  { min: 85, letter: 'A',  points: 4.0 },
  { min: 80, letter: 'A-', points: 4.0 },
  { min: 75, letter: 'B',  points: 3.5 },
  { min: 70, letter: 'B-', points: 3.0 },
  { min: 65, letter: 'C',  points: 2.5 },
  { min: 60, letter: 'C-', points: 2.0 },
  { min: 50, letter: 'D',  points: 1.0 },
  { min: 0,  letter: 'F',  points: 0.0 },
];

const PASS_PERCENT = policy.PASS_PERCENT;

/** Map a percentage (0..100) to { letter, points } using the AUST 4.00 table. */
function gradeFromPercent(percent, opts) {
  const g = policy.gradeFromPercent(percent, opts);
  return { letter: g.letter, points: g.points };
}

/**
 * Compute the weighted total percentage for a CourseResult-like object.
 * Each component contributes (marks / max) * weight. Weights come from
 * the offering and are expected to total ~100.
 *
 * @param {object} r   component marks + maxes
 * @param {object} w   { assignmentWeight, quizWeight, midWeight, finalWeight }
 * @returns {number}   total percentage rounded to 2 decimals
 */
function computeWeightedPercent(r, w) {
  return policy.computeWeightedPercent(r, w);
}

/**
 * Given component marks + offering weights, return the full computed
 * result fields ready to persist: { totalPercent, letterGrade, gradePoints }.
 */
function buildResultGrades(componentMarks, offeringWeights) {
  const totalPercent = computeWeightedPercent(componentMarks, offeringWeights);
  const { letter, points } = gradeFromPercent(totalPercent);
  return { totalPercent, letterGrade: letter, gradePoints: points };
}

/** Compute GPA from a list of { gradePoints, creditHours }. */
function computeGPA(results) {
  let totalPoints = 0;
  let totalCredits = 0;
  for (const r of results) {
    const ch = Number(r.creditHours) || 0;
    totalPoints += (Number(r.gradePoints) || 0) * ch;
    totalCredits += ch;
  }
  if (totalCredits === 0) return 0;
  return Math.round((totalPoints / totalCredits) * 100) / 100;
}

// ============================================================
// resolveOfferingWeights — SINGLE SOURCE OF TRUTH for assessment weightage
// (client requirement 2.3).
// ------------------------------------------------------------
// The Course Coordinator configures weightage per course in the
// CourseWeightage table (Mid / Final / Quiz / Assignment / Lab Task). Both the
// Gradebook and the Marks module MUST use exactly these values and show
// exactly the components the coordinator gave a weight to.
//
// Returns:
//   - weights:    { assignmentWeight, quizWeight, midWeight, finalWeight, labWeight }
//   - components: ordered [{ key, label, weight, marksField, maxField }] — the
//                 Lab column is included ONLY when it carries a weight.
// Falls back to the offering's own *Weight columns (legacy) when the
// coordinator has not configured CourseWeightage yet.
// ============================================================
const COMPONENT_DEFS = [
  { key: 'assignment', label: 'Assignment', weightKey: 'assignmentWeight', marksField: 'assignmentMarks', maxField: 'assignmentMax' },
  { key: 'quiz',       label: 'Quiz',       weightKey: 'quizWeight',       marksField: 'quizMarks',       maxField: 'quizMax' },
  { key: 'mid',        label: 'Mid',        weightKey: 'midWeight',        marksField: 'midMarks',        maxField: 'midMax' },
  { key: 'final',      label: 'Final',      weightKey: 'finalWeight',      marksField: 'finalMarks',      maxField: 'finalMax' },
  { key: 'lab',        label: 'Lab',        weightKey: 'labWeight',        marksField: 'labMarks',        maxField: 'labMax' },
];

async function resolveOfferingWeights(prisma, offering) {
  let cw = null;
  try {
    if (offering && offering.courseId) {
      cw = await prisma.courseWeightage.findUnique({ where: { courseId: offering.courseId } });
    }
  } catch (_) { cw = null; }

  const slotInfo = policy.slotsFromWeightage(cw, offering || {});
  const weights = {
    assignmentWeight: slotInfo.weights.assignmentWeight,
    quizWeight: slotInfo.weights.quizWeight,
    midWeight: slotInfo.weights.midWeight,
    finalWeight: slotInfo.weights.finalWeight,
    labWeight: slotInfo.weights.labWeight,
    projectWeight: slotInfo.weights.projectWeight,
  };

  const components = COMPONENT_DEFS
    .filter((d) => (weights[d.weightKey] || 0) > 0)
    .map((d) => ({ key: d.key, label: d.label, weight: weights[d.weightKey] || 0, marksField: d.marksField, maxField: d.maxField }));
  if ((weights.projectWeight || 0) > 0) {
    components.push({ key: 'project', label: 'Project', weight: weights.projectWeight, marksField: 'projectMarks', maxField: 'projectMax' });
  }

  return {
    weights,
    components,
    source: cw ? 'coordinator' : 'offering',
    slots: slotInfo.slots,
    counts: slotInfo.counts,
    totalWeight: slotInfo.totalWeight,
  };
}

module.exports = {
  GRADE_SCALE,
  PASS_PERCENT,
  gradeFromPercent,
  computeWeightedPercent,
  buildResultGrades,
  computeGPA,
  resolveOfferingWeights,
  COMPONENT_DEFS,
  slotsFromWeightage: policy.slotsFromWeightage,
  isImmutableStatus: policy.isImmutableStatus,
};

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

// Ordered high → low. First threshold whose `min` <= percent wins.
const GRADE_SCALE = [
  { min: 85, letter: 'A',  points: 4.0 },
  { min: 80, letter: 'A-', points: 3.7 },
  { min: 75, letter: 'B+', points: 3.3 },
  { min: 71, letter: 'B',  points: 3.0 },
  { min: 68, letter: 'B-', points: 2.7 },
  { min: 64, letter: 'C+', points: 2.3 },
  { min: 61, letter: 'C',  points: 2.0 },
  { min: 58, letter: 'C-', points: 1.7 },
  { min: 54, letter: 'D+', points: 1.3 },
  { min: 50, letter: 'D',  points: 1.0 },
  { min: 0,  letter: 'F',  points: 0.0 },
];

const PASS_PERCENT = 50;

/** Map a percentage (0..100) to { letter, points }. */
function gradeFromPercent(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const hit = GRADE_SCALE.find((g) => p >= g.min);
  return { letter: hit.letter, points: hit.points };
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
  const pct = (marks, max) => {
    const m = Number(max) || 0;
    if (m <= 0) return 0;
    return (Number(marks) || 0) / m;
  };
  const total =
    pct(r.assignmentMarks, r.assignmentMax) * (Number(w.assignmentWeight) || 0) +
    pct(r.quizMarks, r.quizMax) * (Number(w.quizWeight) || 0) +
    pct(r.midMarks, r.midMax) * (Number(w.midWeight) || 0) +
    pct(r.finalMarks, r.finalMax) * (Number(w.finalWeight) || 0) +
    // Lab / Semester-Project component (client requirement 2.3) — only
    // contributes when the coordinator assigned it a weight.
    pct(r.labMarks, r.labMax) * (Number(w.labWeight) || 0);
  return Math.round(total * 100) / 100;
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

  // Lab task weight and semester-project weight both feed the single "Lab"
  // component in the gradebook/marks table.
  const labWeightFromCw = cw ? ((Number(cw.labTaskWeight) || 0) + (Number(cw.semesterProjectWeight) || 0)) : 0;

  const weights = cw
    ? {
        assignmentWeight: Number(cw.assignmentWeight) || 0,
        quizWeight: Number(cw.quizWeight) || 0,
        midWeight: Number(cw.midWeight) || 0,
        finalWeight: Number(cw.finalWeight) || 0,
        labWeight: labWeightFromCw,
      }
    : {
        assignmentWeight: Number(offering.assignmentWeight) || 0,
        quizWeight: Number(offering.quizWeight) || 0,
        midWeight: Number(offering.midWeight) || 0,
        finalWeight: Number(offering.finalWeight) || 0,
        labWeight: 0,
      };

  const components = COMPONENT_DEFS
    .filter((d) => d.key !== 'lab' || weights.labWeight > 0)
    .map((d) => ({ key: d.key, label: d.label, weight: weights[d.weightKey] || 0, marksField: d.marksField, maxField: d.maxField }));

  return { weights, components, source: cw ? 'coordinator' : 'offering' };
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
};

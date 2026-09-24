// ============================================================
//  AUST academic policy — single source of truth
//  ------------------------------------------------------------
//  Letter grade / GP, GPA, CGPA, academic standing, assessment
//  slots from Course Coordinator weightage, result state machine.
//  Do NOT copy these formulas into controllers or the frontend.
// ============================================================

const ROUND = (v, d = 2) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** Integer percent 50–79 → AUST 4.00 scale (exact table). */
const AUST_50_79 = {
  79: { letter: 'B+', points: 3.9, remark: 'Good' },
  78: { letter: 'B+', points: 3.8, remark: 'Good' },
  77: { letter: 'B+', points: 3.7, remark: 'Good' },
  76: { letter: 'B+', points: 3.6, remark: 'Good' },
  75: { letter: 'B', points: 3.5, remark: 'Good' },
  74: { letter: 'B', points: 3.4, remark: 'Good' },
  73: { letter: 'B', points: 3.3, remark: 'Good' },
  72: { letter: 'B-', points: 3.2, remark: 'Good' },
  71: { letter: 'B-', points: 3.1, remark: 'Good' },
  70: { letter: 'B-', points: 3.0, remark: 'Good' },
  69: { letter: 'C+', points: 2.9, remark: 'Satisfactory' },
  68: { letter: 'C+', points: 2.8, remark: 'Satisfactory' },
  67: { letter: 'C+', points: 2.7, remark: 'Satisfactory' },
  66: { letter: 'C+', points: 2.6, remark: 'Satisfactory' },
  65: { letter: 'C', points: 2.5, remark: 'Satisfactory' },
  64: { letter: 'C', points: 2.4, remark: 'Satisfactory' },
  63: { letter: 'C', points: 2.3, remark: 'Satisfactory' },
  62: { letter: 'C-', points: 2.2, remark: 'Satisfactory' },
  61: { letter: 'C-', points: 2.1, remark: 'Satisfactory' },
  60: { letter: 'C-', points: 2.0, remark: 'Satisfactory' },
  59: { letter: 'D', points: 1.9, remark: 'Pass' },
  58: { letter: 'D', points: 1.8, remark: 'Pass' },
  57: { letter: 'D', points: 1.7, remark: 'Pass' },
  56: { letter: 'D', points: 1.6, remark: 'Pass' },
  55: { letter: 'D', points: 1.5, remark: 'Pass' },
  54: { letter: 'D', points: 1.4, remark: 'Pass' },
  53: { letter: 'D', points: 1.3, remark: 'Pass' },
  52: { letter: 'D', points: 1.2, remark: 'Pass' },
  51: { letter: 'D', points: 1.1, remark: 'Pass' },
  50: { letter: 'D', points: 1.0, remark: 'Pass' },
};

const RESULT_STATES = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'SUBMITTED',
  'LOCKED',
  'COMPILED',
  'UNOFFICIAL_DECLARED',
  'OFFICIAL_FINALIZED',
  'ARCHIVED',
];

const IMMUTABLE_STATES = new Set([
  'SUBMITTED', 'LOCKED', 'COMPILED', 'UNOFFICIAL_DECLARED',
  'OFFICIAL_FINALIZED', 'ARCHIVED', 'FINALIZED', 'PUBLISHED',
]);

const STUDENT_VISIBLE_STATES = new Set([
  'UNOFFICIAL_DECLARED', 'OFFICIAL_FINALIZED', 'ARCHIVED', 'PUBLISHED',
]);

const OFFICIAL_STATES = new Set(['OFFICIAL_FINALIZED', 'ARCHIVED']);

function programLevelFromName(name = '') {
  const s = String(name || '').toLowerCase();
  if (/\bph\.?d\b/.test(s) || s.includes('doctor')) return 'phd';
  if (s.includes('mphil') || s.includes('m.phil') || /\bms\b/.test(s) || s.includes('master') || s.includes('graduate')) return 'graduate';
  return 'bachelor';
}

function failThreshold(programLevel) {
  if (programLevel === 'phd') return 65;
  if (programLevel === 'graduate') return 60;
  return 50;
}

function graduationCgpaMin(programLevel) {
  return programLevel === 'bachelor' ? 2.0 : 2.5;
}

function probationGpaMin(programLevel) {
  return programLevel === 'bachelor' ? 2.0 : 2.5;
}

/**
 * Map final course percentage → letter + GP.
 * Special statuses W / I are never converted to F.
 */
function gradeFromPercent(percent, opts = {}) {
  const status = String(opts.academicStatus || '').toUpperCase();
  if (status === 'W') return { letter: 'W', points: 0, remark: 'Withdrawn' };
  if (status === 'I') return { letter: 'I', points: 0, remark: 'Incomplete' };

  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const level = opts.programLevel || 'bachelor';
  const failAt = failThreshold(level);
  if (p < failAt) return { letter: 'F', points: 0, remark: 'Fail' };

  if (p >= 90) return { letter: 'A+', points: 4.0, remark: 'Excellent' };
  if (p >= 85) return { letter: 'A', points: 4.0, remark: 'Very Good' };
  if (p >= 80) return { letter: 'A-', points: 4.0, remark: 'Very Good' };

  const n = Math.min(79, Math.max(50, Math.floor(p)));
  return AUST_50_79[n] || { letter: 'F', points: 0, remark: 'Fail' };
}

/** Weighted marks = (obtained / max) × item weight, capped at the weight. */
function weightedMarks(obtained, max, weight) {
  if (obtained == null || obtained === '' || max == null || Number(max) <= 0) return null;
  const cap = Number(weight) || 0;
  const converted = (Number(obtained) / Number(max)) * cap;
  return ROUND(Math.min(Math.max(converted, 0), cap));
}

function computeWeightedPercent(r, w) {
  const contrib = (marks, max, weight) => {
    const wt = Number(weight) || 0;
    if (wt <= 0) return 0;
    const m = Number(max) || 0;
    if (m <= 0) return 0;
    return (Number(marks) || 0) / m * wt;
  };
  const total =
    contrib(r.assignmentMarks, r.assignmentMax, w.assignmentWeight) +
    contrib(r.quizMarks, r.quizMax, w.quizWeight) +
    contrib(r.midMarks, r.midMax, w.midWeight) +
    contrib(r.finalMarks, r.finalMax, w.finalWeight) +
    contrib(r.labMarks, r.labMax, w.labWeight) +
    contrib(r.projectMarks, r.projectMax, w.projectWeight);
  return ROUND(total);
}

function buildResultGrades(componentMarks, weights, opts = {}) {
  const totalPercent = computeWeightedPercent(componentMarks, weights);
  const g = gradeFromPercent(totalPercent, opts);
  return {
    totalPercent,
    letterGrade: g.letter,
    gradePoints: g.points,
    gradeRemark: g.remark,
  };
}

/** Credit-hour weighted GPA. W / I rows are excluded. */
function computeGPA(results) {
  let qp = 0;
  let credits = 0;
  for (const r of results || []) {
    const letter = String(r.letterGrade || '').toUpperCase();
    if (letter === 'W' || letter === 'I') continue;
    const ch = Number(r.creditHours) || 0;
    if (ch <= 0) continue;
    qp += (Number(r.gradePoints) || 0) * ch;
    credits += ch;
  }
  if (credits === 0) return 0;
  return ROUND(qp / credits);
}

function academicStanding({ gpa, cgpa, semesterNumber, programLevel }) {
  const level = programLevel || 'bachelor';
  const threshold = probationGpaMin(level);
  const g = Number(gpa) || 0;
  const c = Number(cgpa) || 0;
  if (Number(semesterNumber) === 1 && g < threshold) {
    return { status: 'PROBATION', label: 'First Probation', threshold };
  }
  if (g < threshold || c < threshold) {
    return { status: 'PROBATION', label: 'Probation', threshold };
  }
  return { status: 'GOOD', label: 'Good Standing', threshold };
}

function isImmutableStatus(status) {
  return IMMUTABLE_STATES.has(String(status || '').toUpperCase());
}

function isStudentVisibleStatus(status) {
  return STUDENT_VISIBLE_STATES.has(String(status || '').toUpperCase());
}

function isOfficialStatus(status) {
  return OFFICIAL_STATES.has(String(status || '').toUpperCase());
}

function parseItemWeights(raw) {
  if (!raw) return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map((n) => Number(n) || 0) : [];
  } catch {
    return [];
  }
}

function equalShares(total, count) {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 0) return [];
  const each = ROUND((Number(total) || 0) / n);
  const arr = Array.from({ length: n }, () => each);
  const drift = ROUND((Number(total) || 0) - arr.reduce((s, x) => s + x, 0));
  if (arr.length) arr[arr.length - 1] = ROUND(arr[arr.length - 1] + drift);
  return arr;
}

/**
 * Build assessment slots from Course Coordinator CourseWeightage.
 * Teacher never defines counts or weights.
 */
function slotsFromWeightage(cw, offering = {}) {
  const assignmentWeight = Number(cw?.assignmentWeight ?? offering.assignmentWeight) || 0;
  const quizWeight = Number(cw?.quizWeight ?? offering.quizWeight) || 0;
  const midWeight = Number(cw?.midWeight ?? offering.midWeight) || 0;
  const finalWeight = Number(cw?.finalWeight ?? offering.finalWeight) || 0;
  const labTaskWeight = Number(cw?.labTaskWeight) || 0;
  const projectWeight = Number(cw?.semesterProjectWeight) || 0;

  const assignmentCount = Math.max(0, Math.trunc(Number(cw?.assignmentCount) || 0)) || (assignmentWeight > 0 ? 1 : 0);
  const quizCount = Math.max(0, Math.trunc(Number(cw?.quizCount) || 0)) || (quizWeight > 0 ? 1 : 0);
  const labCount = Math.max(0, Math.trunc(Number(cw?.labTaskCount) || 0)) || (labTaskWeight > 0 ? 1 : 0);
  const projectCount = projectWeight > 0 ? 1 : 0;
  const midCount = midWeight > 0 ? 1 : 0;
  const finalCount = finalWeight > 0 ? 1 : 0;

  const assignItems = parseItemWeights(cw?.assignmentItems);
  const quizItems = parseItemWeights(cw?.quizItems);
  const labItems = parseItemWeights(cw?.labTaskItems);

  const mk = (kind, count, totalWeight, custom, labelFn, editable) => {
    if (count <= 0 || totalWeight <= 0) return [];
    const shares = custom.length === count ? custom.map((n) => ROUND(n)) : equalShares(totalWeight, count);
    return shares.map((itemWeight, i) => ({
      key: `${kind}:${i + 1}`,
      kind,
      index: i + 1,
      label: labelFn(i + 1),
      itemWeight,
      categoryWeight: totalWeight,
      editable: !!editable,
      marksField: editable ? `${kind}Marks` : null,
      maxField: editable ? `${kind}Max` : null,
    }));
  };

  const slots = [
    ...mk('assignment', assignmentCount, assignmentWeight, assignItems, (i) => `Assignment ${i}`, false),
    ...mk('quiz', quizCount, quizWeight, quizItems, (i) => `Quiz ${i}`, false),
    ...mk('lab', labCount, labTaskWeight, labItems, (i) => `Lab ${i}`, false),
    ...mk('project', projectCount, projectWeight, [], () => 'Project', true),
    ...mk('mid', midCount, midWeight, [], () => 'Midterm', true),
    ...mk('final', finalCount, finalWeight, [], () => 'Final', true),
  ];

  const weights = {
    assignmentWeight,
    quizWeight,
    midWeight,
    finalWeight,
    labWeight: labTaskWeight,
    projectWeight,
  };
  const totalWeight = ROUND(
    assignmentWeight + quizWeight + midWeight + finalWeight + labTaskWeight + projectWeight
  );

  return {
    weights,
    slots,
    counts: {
      assignment: assignmentCount,
      quiz: quizCount,
      lab: labCount,
      project: projectCount,
      mid: midCount,
      final: finalCount,
    },
    totalWeight,
  };
}

function admissionBatchOf(profile) {
  if (!profile) return null;
  return profile.admissionBatch || profile.session || null;
}

/**
 * Annual-system % → GPA conversion. For admission merit ONLY.
 * Never used for normal semester GPA/CGPA.
 */
const ANNUAL_SYSTEM_TO_GPA = [
  { min: 80, gpa: 4.0 },
  { min: 70, gpa: 3.5 },
  { min: 60, gpa: 3.0 },
  { min: 50, gpa: 2.5 },
  { min: 40, gpa: 2.0 },
  { min: 0, gpa: 0 },
];

function annualSystemToGpa(percent) {
  const p = Number(percent) || 0;
  const hit = ANNUAL_SYSTEM_TO_GPA.find((r) => p >= r.min);
  return hit ? hit.gpa : 0;
}

module.exports = {
  ROUND,
  RESULT_STATES,
  IMMUTABLE_STATES,
  STUDENT_VISIBLE_STATES,
  OFFICIAL_STATES,
  programLevelFromName,
  failThreshold,
  graduationCgpaMin,
  probationGpaMin,
  gradeFromPercent,
  weightedMarks,
  computeWeightedPercent,
  buildResultGrades,
  computeGPA,
  academicStanding,
  isImmutableStatus,
  isStudentVisibleStatus,
  isOfficialStatus,
  parseItemWeights,
  equalShares,
  slotsFromWeightage,
  admissionBatchOf,
  annualSystemToGpa,
  PASS_PERCENT: 50,
};

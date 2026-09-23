// ============================================================
//  PHASE 6 — Director QEC : additive demo-data enrichment.
//  ------------------------------------------------------------
//  PURELY ADDITIVE & IDEMPOTENT. Adds course-evaluation surveys
//  for each current-term offering (with anonymous student
//  responses), extra teacher-evaluation responses, a richer set
//  of compliance items, improvement plans, and HISTORICAL quality
//  metrics (multiple periodLabels) so QEC analytics / trend charts
//  have meaningful data. Re-running will NOT duplicate rows — it
//  checks for existing markers before inserting.
//
//  Does NOT modify or delete any existing record. Safe to run on
//  the live dev.db. No schema changes.
// ============================================================
const prisma = require('../src/utils/prisma');

// Standard course-evaluation question set (RATING x2, YESNO, TEXT).
const COURSE_EVAL_QUESTIONS = [
  { text: 'How would you rate the overall quality of this course?', type: 'RATING', order: 1 },
  { text: 'How would you rate the instructor\'s teaching effectiveness?', type: 'RATING', order: 2 },
  { text: 'Were the course objectives clearly met?', type: 'YESNO', order: 3 },
  { text: 'Additional comments / suggestions for improvement', type: 'TEXT', required: false, order: 4 },
];

const POSITIVE_COMMENTS = [
  'Excellent course, very well organized and the instructor explained concepts clearly.',
  'Loved the practical examples. Assignments were challenging but fair.',
  'Great teaching pace and the labs really helped me understand the material.',
  'Very supportive instructor who was always available during office hours.',
  'Content was up-to-date and relevant to industry needs.',
];
const NEUTRAL_COMMENTS = [
  'The course was good overall, but the workload felt a bit heavy at times.',
  'Lectures were fine; I would appreciate more worked examples in class.',
  'Decent course. Some topics could use more depth.',
  'Good content but the grading turnaround could be faster.',
];
const CRITICAL_COMMENTS = [
  'The pace was too fast in some weeks and hard to keep up with.',
  'More feedback on assignments would help me improve.',
  'Some lecture slides were unclear and needed better explanation.',
];

function pick(arr, i) { return arr[i % arr.length]; }

// Weighted rating generator — produces a 1..5 rating skewed toward
// the given centre, so different offerings get distinct averages.
function ratingNear(centre, seed) {
  const jitter = ((seed * 13) % 5) - 2; // -2..+2 deterministic
  let v = Math.round(centre + jitter * 0.5);
  if (v < 1) v = 1;
  if (v > 5) v = 5;
  return v;
}

function commentFor(rating, seed) {
  if (rating >= 4) return pick(POSITIVE_COMMENTS, seed);
  if (rating === 3) return pick(NEUTRAL_COMMENTS, seed);
  return pick(CRITICAL_COMMENTS, seed);
}

async function ensureCourseEvalSurveys(term, author) {
  const offerings = await prisma.courseOffering.findMany({
    where: { termId: term.id, isDeleted: false },
    include: { course: true },
    orderBy: { id: 'asc' },
  });

  // Distinct rating "centre" per offering so analytics show spread.
  const centres = [4.6, 4.2, 3.8, 4.4, 3.5, 4.8, 4.0, 3.9, 4.3, 3.7];

  let createdSurveys = 0;
  let createdResponses = 0;

  for (let idx = 0; idx < offerings.length; idx += 1) {
    const off = offerings[idx];
    const title = `${off.course.code} Course Evaluation`;

    // Skip if a (non-deleted) course-eval survey already exists for this offering.
    const existing = await prisma.survey.findFirst({
      where: { offeringId: off.id, type: 'COURSE_EVAL', isDeleted: false },
      include: { questions: true, responses: true },
    });

    let survey = existing;
    if (!survey) {
      survey = await prisma.survey.create({
        data: {
          title,
          description: `Student evaluation of ${off.course.title} for ${term.title}.`,
          type: 'COURSE_EVAL',
          offeringId: off.id,
          audience: 'STUDENTS',
          isAnonymous: true,
          isActive: true,
          authorId: author ? author.id : null,
        },
      });
      await prisma.surveyQuestion.createMany({
        data: COURSE_EVAL_QUESTIONS.map((q) => ({
          surveyId: survey.id,
          text: q.text,
          type: q.type,
          optionsJson: '[]',
          required: q.required !== false,
          order: q.order,
        })),
      });
      createdSurveys += 1;
      survey = await prisma.survey.findUnique({
        where: { id: survey.id },
        include: { questions: { orderBy: { order: 'asc' } }, responses: true },
      });
    }

    // Question id lookup by order.
    const ratingQ = survey.questions.filter((q) => q.type === 'RATING').sort((a, b) => a.order - b.order);
    const yesnoQ = survey.questions.find((q) => q.type === 'YESNO');
    const textQ = survey.questions.find((q) => q.type === 'TEXT');
    if (ratingQ.length < 2 || !textQ) continue; // malformed, skip

    // Enrolled students for this offering.
    const regs = await prisma.courseRegistration.findMany({
      where: { offeringId: off.id, status: { in: ['ENROLLED', 'COMPLETED'] } },
      select: { studentId: true },
    });

    const centre = centres[idx % centres.length];
    // Target ~70% response rate (at least 3 if possible).
    const targetCount = Math.max(3, Math.round(regs.length * 0.7));

    for (let r = 0; r < regs.length && r < targetCount; r += 1) {
      const studentId = regs[r].studentId;
      // Skip if this student already responded (unique [surveyId, studentId]).
      const already = await prisma.surveyResponse.findFirst({
        where: { surveyId: survey.id, studentId },
        select: { id: true },
      });
      if (already) continue;

      const seed = idx * 7 + r * 3 + 1;
      const r1 = ratingNear(centre, seed);
      const r2 = ratingNear(centre, seed + 1);
      const overall = (r1 + r2) / 2;
      const answers = {};
      answers[String(ratingQ[0].id)] = r1;
      answers[String(ratingQ[1].id)] = r2;
      if (yesnoQ) answers[String(yesnoQ.id)] = overall >= 3 ? 'yes' : 'no';
      answers[String(textQ.id)] = commentFor(Math.round(overall), seed);

      await prisma.surveyResponse.create({
        data: {
          surveyId: survey.id,
          studentId,
          answersJson: JSON.stringify(answers),
          submittedAt: new Date(Date.now() - (idx * 3 + r) * 3600 * 1000),
        },
      });
      createdResponses += 1;
    }
  }
  return { createdSurveys, createdResponses };
}

async function enrichTeacherEvalResponses(term) {
  const survey = await prisma.survey.findFirst({
    where: { type: 'TEACHER_EVAL', isDeleted: false },
    include: { questions: { orderBy: { order: 'asc' } }, responses: true },
  });
  if (!survey) return { createdResponses: 0 };
  const ratingQ = survey.questions.filter((q) => q.type === 'RATING');
  const textQ = survey.questions.find((q) => q.type === 'TEXT');
  if (!ratingQ.length) return { createdResponses: 0 };

  const students = await prisma.lmsUser.findMany({
    where: { role: 'Student', isActive: true }, select: { id: true },
  });

  let created = 0;
  for (let i = 0; i < students.length; i += 1) {
    const studentId = students[i].id;
    const already = await prisma.surveyResponse.findFirst({
      where: { surveyId: survey.id, studentId }, select: { id: true },
    });
    if (already) continue;
    const seed = i * 5 + 2;
    const answers = {};
    for (let q = 0; q < ratingQ.length; q += 1) {
      answers[String(ratingQ[q].id)] = ratingNear(4.1, seed + q);
    }
    if (textQ) answers[String(textQ.id)] = pick(POSITIVE_COMMENTS, seed);
    await prisma.surveyResponse.create({
      data: {
        surveyId: survey.id, studentId,
        answersJson: JSON.stringify(answers),
        submittedAt: new Date(Date.now() - i * 1800 * 1000),
      },
    });
    created += 1;
  }
  return { createdResponses: created };
}

async function ensureHistoricalMetrics(author) {
  // Historical trend metrics across several periods. Idempotent by
  // (metric, periodLabel).
  const history = [
    { metric: 'AvgCourseEvalScore', periodLabel: 'Fall 2024', value: 3.7, target: 4.0, scope: 'INSTITUTION' },
    { metric: 'AvgCourseEvalScore', periodLabel: 'Spring 2025', value: 3.9, target: 4.0, scope: 'INSTITUTION' },
    { metric: 'AvgCourseEvalScore', periodLabel: 'Fall 2025', value: 4.0, target: 4.2, scope: 'INSTITUTION' },
    { metric: 'AvgCourseEvalScore', periodLabel: 'Spring 2026', value: 4.2, target: 4.2, scope: 'INSTITUTION' },
    { metric: 'AvgTeacherRating', periodLabel: 'Fall 2024', value: 3.6, target: 4.0, scope: 'INSTITUTION' },
    { metric: 'AvgTeacherRating', periodLabel: 'Spring 2025', value: 3.8, target: 4.0, scope: 'INSTITUTION' },
    { metric: 'AvgTeacherRating', periodLabel: 'Fall 2025', value: 3.9, target: 4.0, scope: 'INSTITUTION' },
    { metric: 'AvgTeacherRating', periodLabel: 'Spring 2026', value: 4.1, target: 4.2, scope: 'INSTITUTION' },
    { metric: 'CompletionRate', periodLabel: 'Fall 2025', value: 86, target: 90, scope: 'PROGRAM' },
    { metric: 'CompletionRate', periodLabel: 'Spring 2026', value: 88, target: 90, scope: 'PROGRAM' },
    { metric: 'StudentEngagement', periodLabel: 'Fall 2026', value: 74, target: 80, scope: 'INSTITUTION' },
    { metric: 'ResearchOutput', periodLabel: 'Fall 2026', value: 12, target: 15, scope: 'INSTITUTION' },
  ];
  let created = 0;
  for (const h of history) {
    const exists = await prisma.qualityMetric.findFirst({
      where: { metric: h.metric, periodLabel: h.periodLabel },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.qualityMetric.create({
      data: { ...h, recordedById: author ? author.id : null },
    });
    created += 1;
  }
  return { created };
}

async function ensureCompliance(author) {
  const items = [
    { category: 'PEC', title: 'Program Outcomes (PLO) defined & mapped', status: 'COMPLIANT', ownerRole: 'QECCoordinator' },
    { category: 'PEC', title: 'OBE course files maintained for all courses', status: 'IN_PROGRESS', ownerRole: 'QECCoordinator' },
    { category: 'PEC', title: 'Complaint redressal mechanism documented', status: 'COMPLIANT', ownerRole: 'FocalPerson' },
    { category: 'NCEAC', title: 'Faculty-to-student ratio within prescribed limit', status: 'COMPLIANT', ownerRole: 'Provost' },
    { category: 'NCEAC', title: 'Laboratory & infrastructure adequacy report', status: 'IN_PROGRESS', ownerRole: 'Provost' },
    { category: 'HEC', title: 'Self-Assessment Report (SAR) submitted', status: 'IN_PROGRESS', ownerRole: 'QECCoordinator' },
    { category: 'HEC', title: 'Annual Quality Report uploaded to HEC portal', status: 'PENDING', ownerRole: 'QECCoordinator' },
    { category: 'HEC', title: 'Faculty PhD percentage threshold met', status: 'NON_COMPLIANT', ownerRole: 'Provost' },
    { category: 'INTERNAL', title: 'Course evaluation surveys conducted each term', status: 'COMPLIANT', ownerRole: 'QECCoordinator' },
    { category: 'INTERNAL', title: 'Teacher evaluation feedback shared with faculty', status: 'IN_PROGRESS', ownerRole: 'QECCoordinator' },
    { category: 'INTERNAL', title: 'Plagiarism policy enforced (Turnitin)', status: 'COMPLIANT', ownerRole: 'CourseCoordinator' },
    { category: 'GENERAL', title: 'Continuous Quality Improvement (CQI) loop closed', status: 'IN_PROGRESS', ownerRole: 'QECCoordinator' },
  ];
  let created = 0;
  for (const it of items) {
    const exists = await prisma.complianceItem.findFirst({
      where: { title: it.title }, select: { id: true },
    });
    if (exists) continue;
    await prisma.complianceItem.create({
      data: {
        category: it.category, title: it.title,
        description: `${it.category} accreditation criterion.`,
        status: it.status, ownerRole: it.ownerRole,
        createdById: author ? author.id : null,
      },
    });
    created += 1;
  }
  return { created };
}

async function ensureImprovementPlans(author, program) {
  const code = program ? program.code : 'PROG';
  const plans = [
    { title: 'Improve course-evaluation response rate', area: `${code} · Surveys`, finding: 'Average survey response rate below 70%.', actionPlan: 'In-class reminders and LMS push notifications before survey closing.', status: 'IN_PROGRESS', progress: 60, ownerRole: 'QECCoordinator' },
    { title: 'Faculty development on OBE assessment', area: `${code} · Faculty`, finding: 'Inconsistent CLO assessment across sections.', actionPlan: 'Workshop series on rubric design and CLO mapping.', status: 'IN_PROGRESS', progress: 40, ownerRole: 'QECCoordinator' },
    { title: 'Raise PhD faculty ratio', area: `${code} · HR`, finding: 'PhD faculty below NCEAC threshold.', actionPlan: 'Hiring plan and study-leave support for existing faculty.', status: 'OPEN', progress: 15, ownerRole: 'Provost' },
    { title: 'Close the loop on Spring 2026 findings', area: `${code} · CQI`, finding: 'Prior-term corrective actions not fully verified.', actionPlan: 'Re-audit corrective actions and document outcomes.', status: 'COMPLETED', progress: 100, ownerRole: 'QECCoordinator' },
  ];
  let created = 0;
  for (const p of plans) {
    const exists = await prisma.improvementPlan.findFirst({
      where: { title: p.title }, select: { id: true },
    });
    if (exists) continue;
    await prisma.improvementPlan.create({
      data: { ...p, createdById: author ? author.id : null },
    });
    created += 1;
  }
  return { created };
}

async function main() {
  const term = await prisma.academicTerm.findFirst({ where: { isCurrent: true, isActive: true } });
  if (!term) { console.error('No current term — aborting.'); process.exit(1); }
  const author = await prisma.lmsUser.findFirst({ where: { role: 'QECCoordinator' } });
  const program = await prisma.lmsProgram.findFirst({ where: { isDeleted: false } });

  console.log(`Seeding QEC data for term "${term.title}" (author: ${author ? author.username : 'none'})`);

  const ce = await ensureCourseEvalSurveys(term, author);
  console.log(`Course-eval surveys: +${ce.createdSurveys} surveys, +${ce.createdResponses} responses`);

  const te = await enrichTeacherEvalResponses(term);
  console.log(`Teacher-eval responses: +${te.createdResponses}`);

  const hm = await ensureHistoricalMetrics(author);
  console.log(`Historical quality metrics: +${hm.created}`);

  const cm = await ensureCompliance(author);
  console.log(`Compliance items: +${cm.created}`);

  const ip = await ensureImprovementPlans(author, program);
  console.log(`Improvement plans: +${ip.created}`);

  console.log('QEC data enrichment complete.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

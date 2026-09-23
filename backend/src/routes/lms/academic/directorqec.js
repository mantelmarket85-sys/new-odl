// ============================================================
//  DIRECTOR QEC ROUTES  — /api/lms/academic/qec/*
//  ------------------------------------------------------------
//  Phase 6 — Director QEC (Quality Enhancement Cell). Production-
//  ready, fully DB-backed quality-assurance APIs. RBAC:
//  QECCoordinator (Provost may also READ for university oversight
//  where noted). Every mutating action writes an LmsAuditLog row
//  and (where relevant) notifies affected user(s).
//
//  Modules: Dashboard · Survey Management · Course Evaluation ·
//  Teacher/Faculty Evaluation · Student Feedback · Quality
//  Monitoring · Compliance/Accreditation · Improvement Plans ·
//  Program Evaluation · Departments · Reports (+CSV) · Analytics ·
//  Self-Assessment · Communication · Audit/Activity · Account.
//
//  PURELY ADDITIVE. Reuses existing models (Survey, SurveyQuestion,
//  SurveyResponse, QualityMetric, ComplianceItem, ImprovementPlan,
//  CourseResult, CourseOffering, LmsAnnouncement, LmsNotification,
//  LmsAuditLog) — no schema changes required.
// ============================================================
const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const prisma = require('../../../utils/prisma');
const { lmsAuth, lmsRequireRole } = require('../../../middleware/lmsAuth');
const { validate } = require('../../../middleware/validate');
const { uploadQecProfilePhoto } = require('../../../middleware/upload');
const {
  asyncHandler, parseListQuery, paginated, httpError, safeJson,
} = require('../../../utils/lmsHelpers');
const { audit } = require('../../../utils/lmsAudit');
const { notify, notifyMany } = require('../../../utils/lmsNotify');
const { displayName, nameMap } = require('../../../utils/lmsWorkflow');

const router = express.Router();
router.use(lmsAuth);

// QEC area guard. Provost gets read-only oversight where noted.
const QEC = lmsRequireRole('QECCoordinator');
const QEC_OR_GOV = lmsRequireRole('QECCoordinator', 'Provost');

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function currentTerm() {
  return prisma.academicTerm.findFirst({ where: { isCurrent: true, isActive: true } });
}

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

function surveyTypeLabel(type) {
  switch (type) {
    case 'COURSE_EVAL': return 'Course Evaluation';
    case 'TEACHER_EVAL': return 'Teacher Evaluation';
    case 'QEC': return 'QEC / Quality';
    default: return 'General';
  }
}

function surveyStatus(s, now = new Date()) {
  if (!s.isActive) return 'Locked';
  if (s.opensAt && new Date(s.opensAt) > now) return 'Scheduled';
  if (s.closesAt && new Date(s.closesAt) < now) return 'Closed';
  return 'Active';
}

// 5-point Likert scale → numeric score so MCQ quality questions feed
// the same rating/analytics pipeline as legacy RATING questions.
const LIKERT_SCORE = {
  'strongly agree': 5,
  agree: 4,
  'not sure': 3,
  neutral: 3,
  disagree: 2,
  'strongly disagree': 1,
};

function likertToNumber(value) {
  if (value === undefined || value === null) return null;
  // Already numeric (legacy RATING answers or numeric MCQ index).
  const num = Number(value);
  if (Number.isFinite(num) && num >= 1 && num <= 5 && String(value).trim() !== '') {
    return num;
  }
  const key = String(value).trim().toLowerCase();
  return LIKERT_SCORE[key] ?? null;
}

// RATING (legacy 1-5) and MCQ (5-point Likert) questions both contribute
// to the numeric rating/analytics pipeline.
function isScored(q) {
  return q.type === 'RATING' || q.type === 'MCQ';
}

// Accepts either a raw integer id (e.g. 11) or the display id ("SV-011")
// and returns the numeric survey id, or NaN if it cannot be parsed.
function parseSurveyId(raw) {
  if (raw === undefined || raw === null) return NaN;
  const str = String(raw).trim().replace(/^SV-/i, '');
  return parseInt(str, 10);
}

function responseRating(answersJson, ratingQuestionIds) {
  const answers = safeJson(answersJson, {});
  let sum = 0;
  let n = 0;
  for (const qid of ratingQuestionIds) {
    const v = likertToNumber(answers[qid] ?? answers[String(qid)]);
    if (v != null) { sum += v; n += 1; }
  }
  return n ? sum / n : null;
}

function responseComments(answersJson, textQuestionIds) {
  const answers = safeJson(answersJson, {});
  const out = [];
  for (const qid of textQuestionIds) {
    const v = answers[qid] ?? answers[String(qid)];
    if (v && typeof v === 'string' && v.trim()) out.push(v.trim());
  }
  return out;
}

async function expectedRespondents(survey, termId) {
  if (survey.type === 'TEACHER_EVAL' && !survey.offeringId) {
    return prisma.lmsUser.count({ where: { role: 'Teacher', isActive: true } });
  }
  if (survey.offeringId) {
    return prisma.courseRegistration.count({
      where: { offeringId: survey.offeringId, status: { in: ['ENROLLED', 'COMPLETED'] } },
    });
  }
  const regs = await prisma.courseRegistration.findMany({
    where: { offering: { termId }, status: { in: ['ENROLLED', 'COMPLETED'] } },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  return regs.length;
}

async function decorateSurvey(s, termId) {
  const ratingQ = s.questions.filter(isScored).map((q) => q.id);
  const responses = s.responses || [];
  let sum = 0; let n = 0;
  for (const r of responses) {
    const rate = responseRating(r.answersJson, ratingQ);
    if (rate != null) { sum += rate; n += 1; }
  }
  const totalExpected = await expectedRespondents(s, termId);
  return {
    id: `SV-${String(s.id).padStart(3, '0')}`,
    rawId: s.id,
    title: s.title,
    description: s.description || '',
    type: surveyTypeLabel(s.type),
    rawType: s.type,
    target: s.audience === 'TEACHERS' ? 'All Teachers' : 'All Students',
    audience: s.audience,
    anonymous: !!s.isAnonymous,
    questions: s.questions.length,
    responses: responses.length,
    totalExpected,
    ratingAvg: n ? round2(sum / n) : 0,
    status: surveyStatus(s),
    deadline: s.closesAt ? new Date(s.closesAt).toISOString().slice(0, 10) : '—',
    lockedAfter: s.type === 'TEACHER_EVAL' ? 'Final Result Upload' : 'Result Release',
    opensAt: s.opensAt,
    closesAt: s.closesAt,
    isActive: s.isActive,
    createdAt: s.createdAt,
    offeringId: s.offeringId,
    scope: s.scope || 'UNIVERSITY',
    department: s.department || null,
  };
}

const SURVEY_INCLUDE = {
  questions: { orderBy: { order: 'asc' } },
  responses: { select: { id: true, answersJson: true, studentId: true, submittedAt: true } },
};

// ============================================================
//  DASHBOARD
// ============================================================
router.get('/dashboard', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  const [surveys, qualityMetrics, complianceItems, improvementPlans] = await Promise.all([
    prisma.survey.findMany({ where: { isDeleted: false }, include: SURVEY_INCLUDE }),
    prisma.qualityMetric.findMany(),
    prisma.complianceItem.findMany(),
    prisma.improvementPlan.findMany(),
  ]);

  const now = new Date();
  const activeSurveys = surveys.filter((s) => surveyStatus(s, now) === 'Active').length;
  const scheduledSurveys = surveys.filter((s) => surveyStatus(s, now) === 'Scheduled').length;
  const closedSurveys = surveys.filter((s) => ['Closed', 'Locked'].includes(surveyStatus(s, now))).length;
  const totalResponses = surveys.reduce((acc, s) => acc + (s.responses?.length || 0), 0);

  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let ratingSum = 0; let ratingN = 0;
  const recentFeedback = [];
  for (const s of surveys) {
    const ratingQ = s.questions.filter(isScored).map((q) => q.id);
    const textQ = s.questions.filter((q) => q.type === 'TEXT').map((q) => q.id);
    for (const r of s.responses) {
      const rate = responseRating(r.answersJson, ratingQ);
      if (rate != null) {
        const bucket = Math.round(rate);
        if (dist[bucket] !== undefined) dist[bucket] += 1;
        ratingSum += rate; ratingN += 1;
      }
      for (const text of responseComments(r.answersJson, textQ)) {
        recentFeedback.push({
          id: `FB-${r.id}`,
          anonymous: `Anonymous #${(r.id % 9000) + 1000}`,
          rating: rate != null ? Math.round(rate) : 0,
          text,
          submittedAt: r.submittedAt,
        });
      }
    }
  }
  recentFeedback.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  const avgRating = ratingN ? round2(ratingSum / ratingN) : 0;

  const compliant = complianceItems.filter((c) => c.status === 'COMPLIANT').length;
  const compliancePct = complianceItems.length
    ? Math.round((compliant / complianceItems.length) * 100) : 0;

  const openPlans = improvementPlans.filter((p) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED');
  const nonCompliant = complianceItems.filter((c) => c.status === 'NON_COMPLIANT' || c.status === 'PENDING');

  const auditRows = await prisma.lmsAuditLog.findMany({
    where: { OR: [{ actorRole: 'QECCoordinator' }, { entity: { in: ['Survey', 'QualityMetric', 'ComplianceItem', 'ImprovementPlan'] } }] },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });
  const actorIds = auditRows.map((a) => a.actorId).filter(Boolean);
  const actorNames = await nameMap(actorIds);
  const activity = auditRows.map((a) => ({
    id: a.id,
    actor: a.actorId ? (actorNames[a.actorId] || a.actorRole || 'System') : (a.actorRole || 'System'),
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    time: a.createdAt,
  }));

  res.json({
    term: term ? term.title : null,
    qualityKpis: {
      avgRating,
      overallScorePct: Math.round((avgRating / 5) * 100),
      totalSurveys: surveys.length,
      totalResponses,
      qualityMetrics: qualityMetrics.length,
      improvementPlans: improvementPlans.length,
      openImprovementPlans: openPlans.length,
    },
    evaluationKpis: {
      activeSurveys,
      scheduledSurveys,
      closedSurveys,
      courseEvals: surveys.filter((s) => s.type === 'COURSE_EVAL').length,
      teacherEvals: surveys.filter((s) => s.type === 'TEACHER_EVAL').length,
    },
    accreditationKpis: {
      compliancePct,
      compliant,
      total: complianceItems.length,
      nonCompliant: complianceItems.filter((c) => c.status === 'NON_COMPLIANT').length,
      partial: complianceItems.filter((c) => c.status === 'IN_PROGRESS').length,
      pending: complianceItems.filter((c) => c.status === 'PENDING').length,
    },
    ratingDistribution: [
      { stars: '5★', rating: 5, count: dist[5], fill: '#10b981' },
      { stars: '4★', rating: 4, count: dist[4], fill: '#3b82f6' },
      { stars: '3★', rating: 3, count: dist[3], fill: '#f59e0b' },
      { stars: '2★', rating: 2, count: dist[2], fill: '#ef4444' },
      { stars: '1★', rating: 1, count: dist[1], fill: '#991b1b' },
    ],
    recentFeedback: recentFeedback.slice(0, 6),
    pendingActions: {
      openPlans: openPlans.slice(0, 5).map((p) => ({ id: p.id, title: p.title, status: p.status, progress: p.progress })),
      nonCompliant: nonCompliant.slice(0, 5).map((c) => ({ id: c.id, title: c.title, category: c.category, status: c.status })),
      count: openPlans.length + nonCompliant.length,
    },
    activity,
  });
}));

// ============================================================
//  SURVEY MANAGEMENT
// ============================================================
router.get('/surveys', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const surveys = await prisma.survey.findMany({
    where: { isDeleted: false },
    include: SURVEY_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  const allItems = [];
  for (const s of surveys) allItems.push(await decorateSurvey(s, termId));
  const offeringIds = [...new Set(surveys.map((s) => s.offeringId).filter(Boolean))];
  const offeringPrograms = offeringIds.length ? await prisma.courseOffering.findMany({
    where: { id: { in: offeringIds } }, include: { course: { include: { program: true } } },
  }) : [];
  const programByOffering = Object.fromEntries(offeringPrograms.map((o) => [o.id, {
    program: o.course?.program?.shortForm || o.course?.program?.code || '',
    department: o.course?.program?.department || '',
  }]));
  allItems.forEach((item) => {
    const meta = item.offeringId ? programByOffering[item.offeringId] : null;
    item.program = meta?.program || '';
    if (!item.department && meta?.department) item.department = meta.department;
  });

  // Department option list for the smart filter (from all departments + any
  // department already tagged on a survey). Additive, no schema/other-role change.
  const deptRows = await prisma.lmsProgram.findMany({ select: { department: true, shortForm: true, code: true } });
  const deptSet = new Set();
  deptRows.forEach((p) => { if (p.department && p.department.trim()) deptSet.add(p.department.trim()); });
  allItems.forEach((s) => { if (s.department && String(s.department).trim()) deptSet.add(String(s.department).trim()); });
  const departments = [...deptSet].sort((a, b) => a.localeCompare(b));
  const programs = deptRows.map((p) => ({ department: p.department || '', value: p.shortForm || p.code })).filter((p) => p.value);

  // Optional server-side department scoping (real-time filter also done client-side).
  const deptFilter = (req.query.department || '').toString().trim();
  const items = deptFilter
    ? allItems.filter((s) => (s.department || '') === deptFilter)
    : allItems;

  const stats = {
    active: items.filter((s) => s.status === 'Active').length,
    scheduled: items.filter((s) => s.status === 'Scheduled').length,
    locked: items.filter((s) => ['Locked', 'Closed'].includes(s.status)).length,
    responses: items.reduce((acc, s) => acc + s.responses, 0),
  };
  res.json({ items, departments, programs, stats });
}));

router.get('/surveys/:id', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const id = parseSurveyId(req.params.id);
  if (!Number.isInteger(id)) throw httpError(404, 'Survey not found');
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const s = await prisma.survey.findFirst({ where: { id, isDeleted: false }, include: SURVEY_INCLUDE });
  if (!s) throw httpError(404, 'Survey not found');
  const summary = await decorateSurvey(s, termId);

  const questionStats = s.questions.map((q) => {
    const options = safeJson(q.optionsJson, []);
    if (q.type === 'RATING' || q.type === 'MCQ') {
      let sum = 0; let n = 0;
      const qdist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      // Tally raw option selections for MCQ (Likert) display.
      const optionCounts = {};
      for (const o of options) optionCounts[o] = 0;
      for (const r of s.responses) {
        const answers = safeJson(r.answersJson, {});
        const raw = answers[q.id] ?? answers[String(q.id)];
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
          optionCounts[raw] = (optionCounts[raw] || 0) + 1;
        }
        const v = likertToNumber(raw);
        if (v != null) { sum += v; n += 1; qdist[Math.round(v)] += 1; }
      }
      return {
        id: q.id, text: q.text, type: q.type, options,
        avg: n ? round2(sum / n) : 0, count: n, dist: qdist, optionCounts,
      };
    }
    if (q.type === 'YESNO') {
      let yes = 0; let no = 0;
      for (const r of s.responses) {
        const answers = safeJson(r.answersJson, {});
        const v = String(answers[q.id] ?? answers[String(q.id)] ?? '').toLowerCase();
        if (v === 'yes' || v === 'true' || v === '1') yes += 1;
        else if (v === 'no' || v === 'false' || v === '0') no += 1;
      }
      return { id: q.id, text: q.text, type: q.type, yes, no };
    }
    const comments = [];
    for (const r of s.responses) {
      const answers = safeJson(r.answersJson, {});
      const v = answers[q.id] ?? answers[String(q.id)];
      if (v && String(v).trim()) comments.push(String(v).trim());
    }
    return { id: q.id, text: q.text, type: q.type, comments };
  });

  // Raw editable question definitions (used by the QEC edit form).
  const questionDefs = s.questions.map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type,
    options: safeJson(q.optionsJson, []),
    required: q.required,
    order: q.order,
  }));

  res.json({ survey: summary, questions: questionStats, questionDefs });
}));

router.post('/surveys', QEC, validate([
  body('title').isString().trim().isLength({ min: 3 }).withMessage('Title is required (min 3 chars).'),
  body('type').optional().isIn(['COURSE_EVAL', 'TEACHER_EVAL', 'GENERAL', 'QEC']),
  body('audience').optional().isIn(['STUDENTS', 'TEACHERS', 'ALL']),
]), asyncHandler(async (req, res) => {
  const {
    title, description, type = 'QEC', audience = 'STUDENTS',
    isAnonymous = true, opensAt, closesAt, offeringId, questions = [],
    scope, department,
  } = req.body;

  // Department scoping (Req 1): a survey is either for ONE specific department
  // (scope=DEPARTMENT + department name) or an OVERALL survey for all
  // departments (scope=UNIVERSITY, department=null).
  const deptName = department ? String(department).trim() : '';
  const surveyScope = (scope === 'DEPARTMENT' || (deptName && scope !== 'UNIVERSITY'))
    ? 'DEPARTMENT'
    : 'UNIVERSITY';
  const surveyDept = surveyScope === 'DEPARTMENT' && deptName ? deptName : null;

  const survey = await prisma.survey.create({
    data: {
      title: String(title).trim(),
      description: description ? String(description) : null,
      type,
      audience,
      isAnonymous: !!isAnonymous,
      opensAt: opensAt ? new Date(opensAt) : null,
      closesAt: closesAt ? new Date(closesAt) : null,
      offeringId: offeringId ? parseInt(offeringId, 10) : null,
      scope: surveyScope,
      department: surveyDept,
      authorId: req.lmsUser.id,
      isActive: true,
    },
  });

  // 5-point Likert scale used for every MCQ quality question.
  const LIKERT = ['Strongly Agree', 'Agree', 'Not Sure', 'Disagree', 'Strongly Disagree'];
  const qList = Array.isArray(questions) && questions.length ? questions : [
    { text: 'The overall quality met my expectations.', type: 'MCQ', options: LIKERT, order: 1 },
    { text: 'Communication and support were effective.', type: 'MCQ', options: LIKERT, order: 2 },
    { text: 'Learning objectives were clearly achieved.', type: 'MCQ', options: LIKERT, order: 3 },
    { text: 'Additional comments / suggestions', type: 'TEXT', required: false, order: 4 },
  ];
  await prisma.surveyQuestion.createMany({
    data: qList.map((q, i) => {
      const type = ['RATING', 'MCQ', 'TEXT', 'YESNO'].includes(q.type) ? q.type : 'MCQ';
      // MCQ questions default to the 5-point Likert scale when no options sent.
      const options = Array.isArray(q.options) && q.options.length
        ? q.options
        : (type === 'MCQ' ? LIKERT : []);
      return {
        surveyId: survey.id,
        text: String(q.text || `Question ${i + 1}`).trim(),
        type,
        optionsJson: JSON.stringify(options),
        required: q.required !== false,
        order: q.order != null ? q.order : i + 1,
      };
    }),
  });

  await audit(req, 'QEC_SURVEY_CREATE', 'Survey', survey.id, { after: { title: survey.title, type, audience, scope: surveyScope, department: surveyDept } });

  const audienceRole = audience === 'TEACHERS' ? 'Teacher' : 'Student';
  const recipients = await prisma.lmsUser.findMany({
    where: { role: audience === 'ALL' ? { in: ['Student', 'Teacher'] } : audienceRole, isActive: true },
    select: { id: true },
  });
  await notifyMany(recipients.map((u) => u.id), {
    title: 'New Quality Survey',
    message: `A new survey "${survey.title}" is now open. Your feedback is confidential.`,
    type: 'ANNOUNCEMENT',
    link: '/surveys',
  });

  const full = await prisma.survey.findUnique({ where: { id: survey.id }, include: SURVEY_INCLUDE });
  const term = await currentTerm();
  res.status(201).json({ survey: await decorateSurvey(full, term ? term.id : -1) });
}));

router.put('/surveys/:id', QEC, asyncHandler(async (req, res) => {
  const id = parseSurveyId(req.params.id);
  const existing = await prisma.survey.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw httpError(404, 'Survey not found');
  const data = {};
  if (req.body.title !== undefined) data.title = String(req.body.title).trim();
  if (req.body.description !== undefined) data.description = req.body.description ? String(req.body.description) : null;
  if (req.body.type !== undefined && ['COURSE_EVAL', 'TEACHER_EVAL', 'GENERAL', 'QEC'].includes(req.body.type)) data.type = req.body.type;
  if (req.body.audience !== undefined) data.audience = req.body.audience;
  if (req.body.isAnonymous !== undefined) data.isAnonymous = !!req.body.isAnonymous;
  if (req.body.opensAt !== undefined) data.opensAt = req.body.opensAt ? new Date(req.body.opensAt) : null;
  if (req.body.closesAt !== undefined) data.closesAt = req.body.closesAt ? new Date(req.body.closesAt) : null;
  // Department scoping edit (Req 1): switch between one-department and overall.
  if (req.body.scope !== undefined || req.body.department !== undefined) {
    const deptName = req.body.department ? String(req.body.department).trim() : '';
    const surveyScope = (req.body.scope === 'DEPARTMENT' || (deptName && req.body.scope !== 'UNIVERSITY'))
      ? 'DEPARTMENT'
      : 'UNIVERSITY';
    data.scope = surveyScope;
    data.department = surveyScope === 'DEPARTMENT' && deptName ? deptName : null;
  }

  // Optional full-replacement of the MCQ question set (add / edit / remove /
  // reorder all in one transaction). Only applied when `questions` is sent.
  const hasQuestions = Array.isArray(req.body.questions);

  if (!Object.keys(data).length && !hasQuestions) throw httpError(400, 'Nothing to update');

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) {
      await tx.survey.update({ where: { id }, data });
    }
    if (hasQuestions) {
      await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
      if (req.body.questions.length) {
        await tx.surveyQuestion.createMany({
          data: req.body.questions.map((q, i) => ({
            surveyId: id,
            text: String(q.text || `Question ${i + 1}`).trim(),
            type: ['RATING', 'MCQ', 'TEXT', 'YESNO'].includes(q.type) ? q.type : 'MCQ',
            optionsJson: JSON.stringify(Array.isArray(q.options) ? q.options : []),
            required: q.required !== false,
            order: q.order != null ? q.order : i + 1,
          })),
        });
      }
    }
  });

  await audit(req, 'QEC_SURVEY_UPDATE', 'Survey', id, { before: existing, after: { ...data, questionsReplaced: hasQuestions } });
  const full = await prisma.survey.findUnique({ where: { id }, include: SURVEY_INCLUDE });
  const term = await currentTerm();
  res.json({ survey: await decorateSurvey(full, term ? term.id : -1) });
}));

router.put('/surveys/:id/status', QEC, validate([
  body('action').isIn(['lock', 'unlock']).withMessage('action must be lock|unlock'),
]), asyncHandler(async (req, res) => {
  const id = parseSurveyId(req.params.id);
  const existing = await prisma.survey.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw httpError(404, 'Survey not found');
  const isActive = req.body.action === 'unlock';
  await prisma.survey.update({ where: { id }, data: { isActive } });
  await audit(req, isActive ? 'QEC_SURVEY_UNLOCK' : 'QEC_SURVEY_LOCK', 'Survey', id, { after: { isActive } });
  const full = await prisma.survey.findUnique({ where: { id }, include: SURVEY_INCLUDE });
  const term = await currentTerm();
  res.json({ survey: await decorateSurvey(full, term ? term.id : -1) });
}));

router.delete('/surveys/:id', QEC, asyncHandler(async (req, res) => {
  const id = parseSurveyId(req.params.id);
  const existing = await prisma.survey.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw httpError(404, 'Survey not found');
  await prisma.survey.update({ where: { id }, data: { isDeleted: true, isActive: false } });
  await audit(req, 'QEC_SURVEY_DELETE', 'Survey', id, { before: { title: existing.title } });
  res.json({ success: true });
}));

// ============================================================
//  COURSE EVALUATION
// ============================================================
router.get('/course-evaluation', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const surveys = await prisma.survey.findMany({
    where: { isDeleted: false, type: 'COURSE_EVAL' },
    include: SURVEY_INCLUDE,
  });

  const offeringIds = [...new Set(surveys.map((s) => s.offeringId).filter(Boolean))];
  const offerings = offeringIds.length ? await prisma.courseOffering.findMany({
    where: { id: { in: offeringIds } },
    include: { course: { include: { program: true, semester: true } }, teacher: { select: { id: true, username: true, profile: { select: { fullName: true } } } } },
  }) : [];
  const offMap = Object.fromEntries(offerings.map((o) => [o.id, o]));

  const rows = [];
  for (const s of surveys) {
    const ratingQ = s.questions.filter(isScored).map((q) => q.id);
    let sum = 0; let n = 0;
    for (const r of s.responses) {
      const rate = responseRating(r.answersJson, ratingQ);
      if (rate != null) { sum += rate; n += 1; }
    }
    const off = s.offeringId ? offMap[s.offeringId] : null;
    const prog = off?.course?.program || null;
    rows.push({
      course: off?.course ? off.course.code : s.title,
      courseTitle: off?.course ? off.course.title : '',
      teacher: off?.teacher ? displayName(off.teacher) : '—',
      // Real department from the offering's program, else the survey's own tag.
      department: (prog ? prog.department : null) || s.department || '',
      // Real program (short form) and semester number for cascading filters.
      program: prog ? (prog.shortForm || prog.code || '') : '',
      semester: off?.course?.semester ? off.course.semester.number : null,
      responses: s.responses.length,
      avg: n ? round2(sum / n) : 0,
    });
  }

  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.course]) grouped[r.course] = { course: r.course, courseTitle: r.courseTitle, teacher: r.teacher, department: r.department, program: r.program, semester: r.semester, surveys: 0, responses: 0, sum: 0, n: 0 };
    const g = grouped[r.course];
    if (!g.department && r.department) g.department = r.department;
    if (!g.program && r.program) g.program = r.program;
    if (g.semester == null && r.semester != null) g.semester = r.semester;
    g.surveys += 1; g.responses += r.responses;
    if (r.avg > 0) { g.sum += r.avg; g.n += 1; }
  }
  const items = Object.values(grouped).map((g) => ({
    course: g.course,
    courseTitle: g.courseTitle,
    teacher: g.teacher,
    department: g.department || '',
    program: g.program || '',
    semester: g.semester,
    surveys: g.surveys,
    responses: g.responses,
    avg: (g.n ? round2(g.sum / g.n) : 0).toFixed(2),
  }));

  const departments = [...new Set(items.map((i) => i.department).filter(Boolean))].sort();
  res.json({ items, departments, term: term ? term.title : null });
}));

// ============================================================
//  TEACHER / FACULTY EVALUATION
// ============================================================
async function buildFacultyEval(termId) {
  const teachers = await prisma.lmsUser.findMany({
    where: { role: 'Teacher', isActive: true },
    select: { id: true, username: true, profile: { select: { fullName: true } } },
  });
  const offerings = await prisma.courseOffering.findMany({
    where: { termId, isDeleted: false },
    include: { course: { include: { program: true, semester: true } } },
  });
  const teacherOfferings = {};
  for (const o of offerings) {
    if (o.teacherId) {
      if (!teacherOfferings[o.teacherId]) teacherOfferings[o.teacherId] = [];
      teacherOfferings[o.teacherId].push(o);
    }
  }

  const surveys = await prisma.survey.findMany({
    where: { isDeleted: false, type: { in: ['COURSE_EVAL', 'TEACHER_EVAL'] } },
    include: SURVEY_INCLUDE,
  });

  const offeringRating = {};
  let globalSum = 0; let globalN = 0;
  for (const s of surveys) {
    const ratingQ = s.questions.filter(isScored).map((q) => q.id);
    for (const r of s.responses) {
      const rate = responseRating(r.answersJson, ratingQ);
      if (rate == null) continue;
      globalSum += rate; globalN += 1;
      if (s.offeringId) {
        if (!offeringRating[s.offeringId]) offeringRating[s.offeringId] = { sum: 0, n: 0 };
        offeringRating[s.offeringId].sum += rate; offeringRating[s.offeringId].n += 1;
      }
    }
  }
  const globalAvg = globalN ? globalSum / globalN : 0;

  const rows = teachers.map((t) => {
    const offs = teacherOfferings[t.id] || [];
    let sum = 0; let n = 0; let evals = 0;
    // Derive the teacher's department from their taught courses' programs
    // (most-frequent department across their offerings). No hardcoding.
    const deptCount = {};
    const progCount = {};
    const semSet = new Set();
    for (const o of offs) {
      const d = o.course?.program?.department;
      if (d && d.trim()) deptCount[d.trim()] = (deptCount[d.trim()] || 0) + 1;
      const prog = o.course?.program;
      const pf = prog ? (prog.shortForm || prog.code || '') : '';
      if (pf && pf.trim()) progCount[pf.trim()] = (progCount[pf.trim()] || 0) + 1;
      if (o.course?.semester?.number != null) semSet.add(o.course.semester.number);
      const r = offeringRating[o.id];
      if (r && r.n) { sum += r.sum; n += r.n; evals += r.n; }
    }
    const department = Object.keys(deptCount).sort((a, b) => deptCount[b] - deptCount[a])[0] || '';
    const program = Object.keys(progCount).sort((a, b) => progCount[b] - progCount[a])[0] || '';
    const semesters = [...semSet].sort((a, b) => a - b);
    const avgRating = n ? sum / n : (globalAvg || 0);
    if (!evals && globalN) evals = globalN;
    const selfRating = round1(Math.min(5, avgRating + 0.3));
    return {
      id: t.id,
      faculty: displayName(t),
      department,
      // Real program (short form) + the set of semesters this instructor teaches,
      // used for cascading Department → Program → Semester filtering.
      program,
      semesters,
      courses: offs.length,
      avgRating: round1(avgRating),
      selfRating,
      evaluations: evals,
      trend: avgRating >= globalAvg ? 'up' : 'flat',
    };
  });

  return { rows, globalAvg: round2(globalAvg), totalEvals: globalN };
}

router.get('/faculty-eval', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const { rows, globalAvg, totalEvals } = await buildFacultyEval(term ? term.id : -1);
  const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort();
  const requestedDepartment = String(req.query.department || '').trim();
  const items = requestedDepartment ? rows.filter((r) => r.department === requestedDepartment) : rows;
  res.json({
    items,
    departments,
    stats: {
      facultyEvaluated: items.filter((r) => r.evaluations > 0).length,
      avgRating: globalAvg,
      totalEvaluations: totalEvals,
      trendingUp: items.filter((r) => r.trend === 'up').length,
    },
  });
}));

router.get('/ratings', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const { rows, globalAvg } = await buildFacultyEval(termId);

  const offerings = await prisma.courseOffering.findMany({
    where: { termId, isDeleted: false },
    include: { course: true },
  });
  const courseByTeacher = {};
  for (const o of offerings) {
    if (!o.teacherId) continue;
    if (!courseByTeacher[o.teacherId]) courseByTeacher[o.teacherId] = [];
    courseByTeacher[o.teacherId].push(o.course.code);
  }

  const items = rows.map((r) => ({
    teacher: r.faculty,
    courses: (courseByTeacher[r.id] || []).join(', ') || '—',
    surveys: r.courses,
    responses: r.evaluations,
    avg: r.avgRating.toFixed(2),
  }));
  const top = [...items].sort((a, b) => Number(b.avg) - Number(a.avg))[0] || { avg: '0' };
  res.json({
    items,
    stats: {
      facultyRated: items.length,
      topRated: top.avg,
      avgUniversity: globalAvg.toFixed(2),
      surveys: rows.reduce((acc, r) => acc + r.courses, 0),
    },
  });
}));

// ============================================================
//  STUDENT FEEDBACK
// ============================================================
router.get('/feedback', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const surveys = await prisma.survey.findMany({
    where: { isDeleted: false },
    include: SURVEY_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  // Resolve offering → course / teacher / program / department metadata so the
  // anonymous feedback can be sliced by real smart filters (the response itself
  // stays anonymous — we only attach the survey's own scope, never the student).
  const offeringIds = [...new Set(surveys.map((s) => s.offeringId).filter(Boolean))];
  const offerings = offeringIds.length ? await prisma.courseOffering.findMany({
    where: { id: { in: offeringIds } },
    include: {
      course: { include: { program: true, semester: true } },
      teacher: { select: { id: true, username: true, profile: { select: { fullName: true } } } },
    },
  }) : [];
  const offMap = Object.fromEntries(offerings.map((o) => [o.id, o]));

  const feedback = [];
  const surveyList = [];
  for (const s of surveys) {
    surveyList.push({ id: s.id, title: s.title });
    const off = s.offeringId ? offMap[s.offeringId] : null;
    const course = off?.course ? off.course.code : null;
    const courseTitle = off?.course ? off.course.title : null;
    const teacher = off?.teacher ? displayName(off.teacher) : null;
    const program = off?.course?.program ? off.course.program.code : null;
    // Prefer the offering's real department; otherwise fall back to the survey's
    // own department tag (dept-scoped survey without a linked offering).
    const department = (off?.course?.program ? off.course.program.department : null) || s.department || null;
    const semester = off?.course?.semester ? off.course.semester.number : null;

    const ratingQ = s.questions.filter(isScored).map((q) => q.id);
    const textQ = s.questions.filter((q) => q.type === 'TEXT').map((q) => q.id);
    for (const r of s.responses) {
      const rate = responseRating(r.answersJson, ratingQ);
      const comments = responseComments(r.answersJson, textQ);
      const ratingValue = rate != null ? Math.round(rate) : 0;
      feedback.push({
        id: `FB-${r.id}`,
        surveyId: s.id,
        surveyTitle: s.title,
        anonymous: `Anonymous #${(r.id % 9000) + 1000}`,
        rating: ratingValue,
        status: ratingValue >= 4 ? 'Positive' : ratingValue === 3 ? 'Neutral' : ratingValue > 0 ? 'Negative' : 'No Rating',
        text: comments[0] || '(No written comment)',
        course, courseTitle, teacher, program, department, semester,
        submittedAt: r.submittedAt,
      });
    }
  }

  // --- Smart-filter query params (all optional) ---
  const { department, program, semester, course, teacher, status, from, to } = req.query;
  const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());
  let items = feedback.filter((f) => {
    if (department && norm(f.department) !== norm(department)) return false;
    if (program && norm(f.program) !== norm(program)) return false;
    if (semester && String(f.semester ?? '') !== String(semester)) return false;
    if (course && norm(f.course) !== norm(course)) return false;
    if (teacher && norm(f.teacher) !== norm(teacher)) return false;
    if (status && norm(f.status) !== norm(status)) return false;
    if (from && new Date(f.submittedAt) < new Date(from)) return false;
    if (to && new Date(f.submittedAt) > new Date(`${to}T23:59:59`)) return false;
    return true;
  });
  items.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  // Distinct filter option lists derived from the real data set.
  const distinct = (key) => [...new Set(feedback.map((f) => f[key]).filter((v) => v != null && v !== ''))].sort();
  const filterOptions = {
    departments: distinct('department'),
    programs: distinct('program'),
    semesters: distinct('semester'),
    courses: distinct('course'),
    teachers: distinct('teacher'),
    statuses: ['Positive', 'Neutral', 'Negative'],
  };

  res.json({ items, surveys: surveyList, filterOptions });
}));

// ============================================================
//  QUALITY MONITORING
// ============================================================
router.get('/quality-metrics', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const metrics = await prisma.qualityMetric.findMany({ orderBy: { createdAt: 'desc' } });
  const items = metrics.map((m) => ({
    id: m.id,
    scope: m.scope,
    metric: m.metric,
    value: m.value,
    target: m.target,
    onTarget: m.target != null ? m.value >= m.target : null,
    periodLabel: m.periodLabel,
    notes: m.notes,
    createdAt: m.createdAt,
  }));
  res.json({ items });
}));

router.post('/quality-metrics', QEC, validate([
  body('metric').isString().trim().isLength({ min: 2 }),
  body('value').isNumeric(),
]), asyncHandler(async (req, res) => {
  const { scope = 'INSTITUTION', refId, metric, value, target, periodLabel, notes } = req.body;
  const m = await prisma.qualityMetric.create({
    data: {
      scope, refId: refId ? String(refId) : null, metric: String(metric).trim(),
      value: Number(value), target: target != null ? Number(target) : null,
      periodLabel: periodLabel || null, notes: notes || null, recordedById: req.lmsUser.id,
    },
  });
  await audit(req, 'QEC_METRIC_CREATE', 'QualityMetric', m.id, { after: { metric: m.metric, value: m.value } });
  res.status(201).json({ metric: m });
}));

// ============================================================
//  COMPLIANCE / ACCREDITATION
// ============================================================
const COMPLIANCE_LABEL = {
  PENDING: 'Pending', IN_PROGRESS: 'Partial', COMPLIANT: 'Compliant',
  NON_COMPLIANT: 'Non-Compliant', NA: 'N/A',
};
const COMPLIANCE_SCORE = {
  COMPLIANT: 100, IN_PROGRESS: 65, NON_COMPLIANT: 30, PENDING: 45, NA: 100,
};

router.get('/compliance', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const items = await prisma.complianceItem.findMany({ orderBy: { createdAt: 'asc' } });
  const mapped = items.map((c) => ({
    id: c.id,
    category: c.category,
    criterion: c.title,
    description: c.description,
    status: COMPLIANCE_LABEL[c.status] || c.status,
    rawStatus: c.status,
    score: COMPLIANCE_SCORE[c.status] ?? 50,
    dueDate: c.dueDate,
    ownerRole: c.ownerRole,
    notes: c.notes,
  }));
  const compliant = mapped.filter((c) => c.rawStatus === 'COMPLIANT').length;
  const partial = mapped.filter((c) => c.rawStatus === 'IN_PROGRESS').length;
  const noncomp = mapped.filter((c) => c.rawStatus === 'NON_COMPLIANT').length;
  const pending = mapped.filter((c) => c.rawStatus === 'PENDING').length;
  const overall = mapped.length
    ? round1(mapped.reduce((acc, c) => acc + c.score, 0) / mapped.length) : 0;
  res.json({
    items: mapped,
    stats: { overall, compliant, partial, noncomp, pending, total: mapped.length },
  });
}));

router.post('/compliance', QEC, validate([
  body('title').isString().trim().isLength({ min: 3 }),
]), asyncHandler(async (req, res) => {
  const { category = 'GENERAL', title, description, status = 'PENDING', dueDate, ownerRole, notes } = req.body;
  const c = await prisma.complianceItem.create({
    data: {
      category, title: String(title).trim(), description: description || null,
      status: ['PENDING', 'IN_PROGRESS', 'COMPLIANT', 'NON_COMPLIANT', 'NA'].includes(status) ? status : 'PENDING',
      dueDate: dueDate || null, ownerRole: ownerRole || null, notes: notes || null,
      createdById: req.lmsUser.id,
    },
  });
  await audit(req, 'QEC_COMPLIANCE_CREATE', 'ComplianceItem', c.id, { after: { title: c.title, status: c.status } });
  res.status(201).json({ item: c });
}));

router.put('/compliance/:id', QEC, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.complianceItem.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'Compliance item not found');
  const data = {};
  for (const f of ['category', 'title', 'description', 'dueDate', 'ownerRole', 'notes', 'evidenceUrl']) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  if (req.body.status !== undefined) {
    if (!['PENDING', 'IN_PROGRESS', 'COMPLIANT', 'NON_COMPLIANT', 'NA'].includes(req.body.status)) {
      throw httpError(400, 'Invalid status');
    }
    data.status = req.body.status;
  }
  if (!Object.keys(data).length) throw httpError(400, 'Nothing to update');
  const c = await prisma.complianceItem.update({ where: { id }, data });
  await audit(req, 'QEC_COMPLIANCE_UPDATE', 'ComplianceItem', id, { before: existing, after: data });
  res.json({ item: c });
}));

// ============================================================
//  IMPROVEMENT PLANS
// ============================================================
router.get('/improvement-plans', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const items = await prisma.improvementPlan.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({
    items,
    stats: {
      total: items.length,
      open: items.filter((p) => p.status === 'OPEN').length,
      inProgress: items.filter((p) => p.status === 'IN_PROGRESS').length,
      completed: items.filter((p) => p.status === 'COMPLETED').length,
    },
  });
}));

router.post('/improvement-plans', QEC, validate([
  body('title').isString().trim().isLength({ min: 3 }),
]), asyncHandler(async (req, res) => {
  const { title, area, finding, actionPlan, ownerRole, targetDate, progress = 0 } = req.body;
  const p = await prisma.improvementPlan.create({
    data: {
      title: String(title).trim(), area: area || null, finding: finding || null,
      actionPlan: actionPlan || null, ownerRole: ownerRole || null,
      targetDate: targetDate || null, progress: Math.max(0, Math.min(100, parseInt(progress, 10) || 0)),
      createdById: req.lmsUser.id, status: 'OPEN',
    },
  });
  await audit(req, 'QEC_PLAN_CREATE', 'ImprovementPlan', p.id, { after: { title: p.title } });
  res.status(201).json({ plan: p });
}));

router.put('/improvement-plans/:id', QEC, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.improvementPlan.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'Improvement plan not found');
  const data = {};
  for (const f of ['title', 'area', 'finding', 'actionPlan', 'ownerRole', 'targetDate']) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }
  if (req.body.progress !== undefined) data.progress = Math.max(0, Math.min(100, parseInt(req.body.progress, 10) || 0));
  if (req.body.status !== undefined) {
    if (!['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(req.body.status)) throw httpError(400, 'Invalid status');
    data.status = req.body.status;
  }
  if (!Object.keys(data).length) throw httpError(400, 'Nothing to update');
  const p = await prisma.improvementPlan.update({ where: { id }, data });
  await audit(req, 'QEC_PLAN_UPDATE', 'ImprovementPlan', id, { before: existing, after: data });
  res.json({ plan: p });
}));

// ============================================================
//  PROGRAM EVALUATION
// ============================================================
router.get('/program-eval', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;

  const program = await prisma.lmsProgram.findFirst({ where: { isActive: true, isDeleted: false } });

  const [results, metrics, totalStudents, totalTeachers, plans] = await Promise.all([
    prisma.courseResult.findMany({ where: { status: 'PUBLISHED', offering: { termId } }, select: { totalPercent: true, gradePoints: true } }),
    prisma.qualityMetric.findMany(),
    prisma.lmsUser.count({ where: { role: 'Student', isActive: true } }),
    prisma.lmsUser.count({ where: { role: 'Teacher', isActive: true } }),
    prisma.improvementPlan.findMany(),
  ]);

  const passing = results.filter((r) => r.totalPercent >= 50).length;
  const cloAttainment = results.length ? Math.round((passing / results.length) * 100) : 0;
  const goodAttain = results.filter((r) => r.totalPercent >= 60).length;
  const ploAttainment = results.length ? Math.round((goodAttain / results.length) * 100) : 0;

  const evalMetric = metrics.find((m) => m.metric === 'AvgCourseEvalScore');
  const studentSatisfaction = evalMetric ? round1(evalMetric.value) : 0;
  const completionMetric = metrics.find((m) => m.metric === 'CompletionRate');
  const graduationRate = completionMetric ? Math.round(completionMetric.value) : cloAttainment;
  const industryReadiness = Math.round((ploAttainment + (studentSatisfaction / 5) * 100) / 2);

  const recommendations = [];
  if (ploAttainment < 80) recommendations.push('Strengthen PLO mapping and add formative assessments to lift attainment above 80%.');
  if (studentSatisfaction < 4) recommendations.push('Run targeted faculty-development sessions to improve student satisfaction scores.');
  if (graduationRate < 90) recommendations.push('Introduce early-warning advising for at-risk cohorts to raise completion rate.');
  recommendations.push('Maintain continuous OBE course files and close the loop on course-evaluation findings.');

  const correctiveActions = plans.length;
  const completedActions = plans.filter((p) => p.status === 'COMPLETED').length;

  res.json({
    program: program ? `${program.code} — ${program.name}` : 'Program Evaluation',
    cohort: term ? term.title : '—',
    facultyCount: totalTeachers,
    totalStudents,
    ploAttainment,
    cloAttainment,
    studentSatisfaction,
    graduationRate,
    industryReadiness,
    recommendations,
    correctiveActions,
    completedActions,
    selfAssessmentStatus: completedActions >= correctiveActions && correctiveActions > 0 ? 'Completed' : 'In Progress',
  });
}));

// ============================================================
//  DEPARTMENTS
// ============================================================
router.get('/departments', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const programs = await prisma.lmsProgram.findMany({
    where: { isDeleted: false },
    include: { _count: { select: { courses: true } } },
  });
  const { globalAvg } = await buildFacultyEval(termId);
  const complianceItems = await prisma.complianceItem.findMany();
  const compliant = complianceItems.filter((c) => c.status === 'COMPLIANT').length;
  const compliancePct = complianceItems.length ? Math.round((compliant / complianceItems.length) * 100) : 90;

  const deptMap = {};
  for (const p of programs) {
    const name = p.department || 'General';
    if (!deptMap[name]) deptMap[name] = { name, programs: 0, courses: 0 };
    deptMap[name].programs += 1;
    deptMap[name].courses += p._count.courses;
  }

  const [students, teachers] = await Promise.all([
    prisma.lmsUser.count({ where: { role: 'Student', isActive: true } }),
    prisma.lmsUser.count({ where: { role: 'Teacher', isActive: true } }),
  ]);

  const depts = Object.values(deptMap);
  const items = depts.map((d) => ({
    name: d.name,
    chair: '—',
    students: depts.length === 1 ? students : Math.round(students / depts.length),
    faculty: depts.length === 1 ? teachers : Math.round(teachers / depts.length),
    programs: d.programs,
    rating: (globalAvg || 4).toFixed(1),
    compliance: `${compliancePct}%`,
  }));
  res.json({ items });
}));

// ============================================================
//  ANALYTICS
// ============================================================
router.get('/analytics', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const termId = term ? term.id : -1;
  const surveys = await prisma.survey.findMany({
    where: { isDeleted: false },
    include: SURVEY_INCLUDE,
  });

  const offeringIds = [...new Set(surveys.map((s) => s.offeringId).filter(Boolean))];
  const offerings = offeringIds.length ? await prisma.courseOffering.findMany({
    where: { id: { in: offeringIds } }, include: { course: { include: { program: true } } },
  }) : [];
  const offMap = Object.fromEntries(offerings.map((o) => [o.id, o]));

  // Resolve each survey's department (offering's program, else its own tag).
  const surveyDept = (s) => {
    const off = s.offeringId ? offMap[s.offeringId] : null;
    return (off?.course?.program ? off.course.program.department : null) || s.department || '';
  };

  // Department option list + optional real-time server-side scoping.
  const deptRows = await prisma.lmsProgram.findMany({ select: { department: true } });
  const deptSet = new Set();
  deptRows.forEach((p) => { if (p.department && p.department.trim()) deptSet.add(p.department.trim()); });
  surveys.forEach((s) => { const d = surveyDept(s); if (d) deptSet.add(d); });
  const departments = [...deptSet].sort((a, b) => a.localeCompare(b));

  const deptFilter = (req.query.department || '').toString().trim();
  const scoped = deptFilter ? surveys.filter((s) => surveyDept(s) === deptFilter) : surveys;

  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let ratingSum = 0; let ratingN = 0;
  let totalResponses = 0; let totalExpected = 0;
  const byCourse = [];
  // Per-department roll-up so the frontend can show data separated by dept.
  const deptAgg = {};

  for (const s of scoped) {
    const ratingQ = s.questions.filter(isScored).map((q) => q.id);
    totalResponses += s.responses.length;
    totalExpected += await expectedRespondents(s, termId);
    const d = surveyDept(s) || 'Unassigned';
    if (!deptAgg[d]) deptAgg[d] = { department: d, responses: 0, sum: 0, n: 0, surveys: 0 };
    deptAgg[d].surveys += 1;
    deptAgg[d].responses += s.responses.length;
    for (const r of s.responses) {
      const rate = responseRating(r.answersJson, ratingQ);
      if (rate != null) {
        dist[Math.round(rate)] += 1; ratingSum += rate; ratingN += 1;
        deptAgg[d].sum += rate; deptAgg[d].n += 1;
      }
    }
    byCourse.push({
      course: s.offeringId && offMap[s.offeringId] ? offMap[s.offeringId].course.code : s.title.slice(0, 12),
      responses: s.responses.length,
    });
  }

  const byDepartment = Object.values(deptAgg).map((g) => ({
    department: g.department,
    surveys: g.surveys,
    responses: g.responses,
    avgRating: g.n ? round2(g.sum / g.n) : 0,
  })).sort((a, b) => b.responses - a.responses);

  const avgRating = ratingN ? round2(ratingSum / ratingN) : 0;
  const engagement = pct(totalResponses, totalExpected);

  const trendMetrics = await prisma.qualityMetric.findMany({
    where: { metric: { in: ['AvgCourseEvalScore', 'AvgTeacherRating'] } },
    orderBy: { createdAt: 'asc' },
  });
  let trend = trendMetrics
    .filter((m) => m.periodLabel)
    .map((m) => ({ semester: m.periodLabel, rating: round2(m.value) }));
  if (trend.length === 0) {
    trend = [{ semester: term ? term.title : 'Current', rating: avgRating }];
  }

  res.json({
    ratingDistribution: [
      { name: '5★', value: dist[5], color: '#10b981' },
      { name: '4★', value: dist[4], color: '#3b82f6' },
      { name: '3★', value: dist[3], color: '#f59e0b' },
      { name: '2★', value: dist[2], color: '#ef4444' },
      { name: '1★', value: dist[1], color: '#991b1b' },
    ].filter((d) => d.value > 0),
    trend,
    responsesByCourse: byCourse,
    departments,
    byDepartment,
    stats: {
      totalSurveys: scoped.length,
      engagement,
      avgRating,
      totalResponses,
    },
  });
}));

// ============================================================
//  REPORTS (+ CSV export)
// ============================================================
async function buildReport(kind) {
  const surveys = await prisma.survey.findMany({
    where: { isDeleted: false }, include: SURVEY_INCLUDE, orderBy: { createdAt: 'desc' },
  });

  const offeringIds = [...new Set(surveys.map((s) => s.offeringId).filter(Boolean))];
  const offerings = offeringIds.length ? await prisma.courseOffering.findMany({
    where: { id: { in: offeringIds } },
    include: { course: true, teacher: { select: { id: true, username: true, profile: { select: { fullName: true } } } } },
  }) : [];
  const offMap = Object.fromEntries(offerings.map((o) => [o.id, o]));

  const decorated = surveys.map((s) => {
    const ratingQ = s.questions.filter(isScored).map((q) => q.id);
    let sum = 0; let n = 0;
    for (const r of s.responses) {
      const rate = responseRating(r.answersJson, ratingQ);
      if (rate != null) { sum += rate; n += 1; }
    }
    const off = s.offeringId ? offMap[s.offeringId] : null;
    return {
      title: s.title,
      teacher: off?.teacher ? displayName(off.teacher) : '—',
      course: off?.course ? off.course.code : '—',
      responses: s.responses.length,
      ratingAvg: n ? round2(sum / n) : 0,
      status: surveyStatus(s),
    };
  });

  if (kind === 'surveys') return decorated;

  if (kind === 'feedback') {
    const rows = [];
    for (const s of surveys) {
      const ratingQ = s.questions.filter(isScored).map((q) => q.id);
      const textQ = s.questions.filter((q) => q.type === 'TEXT').map((q) => q.id);
      for (const r of s.responses) {
        const rate = responseRating(r.answersJson, ratingQ);
        const comments = responseComments(r.answersJson, textQ);
        rows.push({
          anonymous: `Anonymous #${(r.id % 9000) + 1000}`,
          rating: rate != null ? Math.round(rate) : 0,
          text: comments[0] || '(No written comment)',
        });
      }
    }
    return rows;
  }

  if (kind === 'faculty') {
    const map = {};
    for (const d of decorated) {
      if (d.teacher === '—') continue;
      if (!map[d.teacher]) map[d.teacher] = { teacher: d.teacher, total: 0, sum: 0, responses: 0 };
      map[d.teacher].total += 1; map[d.teacher].sum += d.ratingAvg; map[d.teacher].responses += d.responses;
    }
    return Object.values(map).map((m) => ({ teacher: m.teacher, total: m.total, responses: m.responses, avg: round2(m.total ? m.sum / m.total : 0) }));
  }

  if (kind === 'courses') {
    const map = {};
    for (const d of decorated) {
      if (d.course === '—') continue;
      if (!map[d.course]) map[d.course] = { course: d.course, total: 0, sum: 0, responses: 0 };
      map[d.course].total += 1; map[d.course].sum += d.ratingAvg; map[d.course].responses += d.responses;
    }
    return Object.values(map).map((m) => ({ course: m.course, total: m.total, responses: m.responses, avg: round2(m.total ? m.sum / m.total : 0) }));
  }

  if (kind === 'depts') {
    const items = await prisma.complianceItem.findMany();
    return items.map((c) => ({ category: c.category, criterion: c.title, status: COMPLIANCE_LABEL[c.status] || c.status, score: COMPLIANCE_SCORE[c.status] ?? 50 }));
  }

  throw httpError(400, 'Unknown report kind');
}

router.get('/reports/:kind', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const rows = await buildReport(req.params.kind);
  res.json({ items: rows });
}));

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
  return lines.join('\n');
}

router.get('/reports/:kind/export', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const kind = req.params.kind;
  const rows = await buildReport(kind);
  const csv = toCsv(rows);
  await audit(req, 'QEC_REPORT_EXPORT', 'Report', kind, { after: { count: rows.length } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="qec-${kind}-report.csv"`);
  res.send(csv || 'No data');
}));

// ============================================================
//  SELF-ASSESSMENT
// ============================================================
router.get('/self-assessment', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const term = await currentTerm();
  const programs = await prisma.lmsProgram.findMany({ where: { isDeleted: false } });
  const plans = await prisma.improvementPlan.findMany();

  const items = programs.map((p) => {
    const programPlans = plans.filter((pl) => (pl.area || '').includes(p.code));
    let progress;
    if (programPlans.length) {
      progress = Math.round(programPlans.reduce((acc, pl) => acc + pl.progress, 0) / programPlans.length);
    } else {
      progress = 0;
    }
    let status = 'Not Started';
    if (progress >= 100) status = 'Completed';
    else if (progress >= 90) status = 'Pending Review';
    else if (progress > 0) status = 'In Progress';
    return {
      id: p.id,
      name: `${p.code} — ${p.name}`,
      status,
      progress,
      sections: 12,
      completed: Math.round((progress / 100) * 12),
      dueDate: term?.endDate || '—',
      lead: p.department || 'QEC',
    };
  });

  res.json({
    items,
    stats: {
      total: items.length,
      completed: items.filter((p) => p.status === 'Completed').length,
      inProgress: items.filter((p) => p.status === 'In Progress').length,
      correctiveActions: plans.length,
      completedActions: plans.filter((p) => p.status === 'COMPLETED').length,
    },
  });
}));

// ============================================================
//  COMMUNICATION
// ============================================================
router.get('/announcements', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const items = await prisma.lmsAnnouncement.findMany({
    where: { isDeleted: false, author: { role: 'QECCoordinator' } },
    include: { author: { select: { username: true, role: true, profile: { select: { fullName: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({
    items: items.map((a) => ({
      id: a.id, title: a.title, message: a.message, audience: a.audience,
      author: displayName(a.author), createdAt: a.createdAt,
    })),
  });
}));

router.post('/announcements', QEC, validate([
  body('title').isString().trim().isLength({ min: 3 }),
  body('message').isString().trim().isLength({ min: 1 }),
]), asyncHandler(async (req, res) => {
  const { title, message, audience = 'ALL' } = req.body;
  const a = await prisma.lmsAnnouncement.create({
    data: { authorId: req.lmsUser.id, title: String(title).trim(), message: String(message).trim(), audience },
  });
  await audit(req, 'QEC_ANNOUNCEMENT_CREATE', 'LmsAnnouncement', a.id, { after: { title: a.title, audience } });

  const where = audience === 'TEACHERS' ? { role: 'Teacher' }
    : audience === 'STUDENTS' ? { role: 'Student' }
      : { role: { in: ['Student', 'Teacher'] } };
  const recipients = await prisma.lmsUser.findMany({ where: { ...where, isActive: true }, select: { id: true } });
  await notifyMany(recipients.map((u) => u.id), { title: `QEC: ${a.title}`, message: a.message, type: 'ANNOUNCEMENT' });

  res.status(201).json({ announcement: { id: a.id, title: a.title, message: a.message, audience: a.audience, createdAt: a.createdAt } });
}));

router.delete('/announcements/:id', QEC, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = await prisma.lmsAnnouncement.findUnique({ where: { id } });
  if (!existing) throw httpError(404, 'Announcement not found');
  await prisma.lmsAnnouncement.update({ where: { id }, data: { isDeleted: true } });
  await audit(req, 'QEC_ANNOUNCEMENT_DELETE', 'LmsAnnouncement', id, {});
  res.json({ success: true });
}));

router.get('/notifications', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const items = await prisma.lmsNotification.findMany({
    where: { userId: req.lmsUser.id }, orderBy: { createdAt: 'desc' }, take: 50,
  });
  const unread = items.filter((n) => !n.isRead).length;
  res.json({ items, unread });
}));

router.put('/notifications/:id/read', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await prisma.lmsNotification.updateMany({ where: { id, userId: req.lmsUser.id }, data: { isRead: true } });
  res.json({ success: true });
}));

router.put('/notifications/read-all', QEC_OR_GOV, asyncHandler(async (req, res) => {
  await prisma.lmsNotification.updateMany({ where: { userId: req.lmsUser.id, isRead: false }, data: { isRead: true } });
  res.json({ success: true });
}));

// ============================================================
//  AUDIT / ACTIVITY LOG
// ============================================================
router.get('/audit', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const { skip, take, page, pageSize } = parseListQuery(req.query);
  const where = {
    OR: [
      { actorRole: 'QECCoordinator' },
      { entity: { in: ['Survey', 'QualityMetric', 'ComplianceItem', 'ImprovementPlan', 'LmsAnnouncement'] } },
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.lmsAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.lmsAuditLog.count({ where }),
  ]);
  const names = await nameMap(rows.map((r) => r.actorId).filter(Boolean));
  const items = rows.map((r) => ({
    id: r.id,
    user: r.actorId ? (names[r.actorId] || r.actorRole || 'System') : (r.actorRole || 'System'),
    role: r.actorRole,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    detail: `${r.action} · ${r.entity}${r.entityId ? ` #${r.entityId}` : ''}`,
    time: r.createdAt,
    timestamp: r.createdAt,
  }));
  res.json(paginated(items, total, { page, pageSize }));
}));

// ============================================================
//  ACCOUNT SETTINGS
// ============================================================
router.get('/me', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const u = await prisma.lmsUser.findUnique({
    where: { id: req.lmsUser.id },
    select: { id: true, username: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true, profile: true },
  });
  res.json({ user: u });
}));

router.put('/me/profile', QEC_OR_GOV, validate([
  body('username').optional().isString().trim().isLength({ min: 3 }),
  body('email').optional().isEmail().withMessage('A valid email is required.'),
]), asyncHandler(async (req, res) => {
  const data = {};
  if (req.body.username !== undefined) data.username = String(req.body.username).trim();
  if (req.body.email !== undefined) data.email = req.body.email ? String(req.body.email).toLowerCase().trim() : null;
  if (!Object.keys(data).length) throw httpError(400, 'Nothing to update');
  try {
    const u = await prisma.lmsUser.update({
      where: { id: req.lmsUser.id }, data,
      select: { id: true, username: true, email: true, role: true },
    });
    await audit(req, 'QEC_PROFILE_UPDATE', 'LmsUser', req.lmsUser.id, { after: data });
    res.json({ user: u });
  } catch (e) {
    if (e.code === 'P2002') throw httpError(409, 'That username or email is already taken.');
    throw e;
  }
}));

const STRONG_PW = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
router.put('/me/password', QEC_OR_GOV, validate([
  body('currentPassword').isString().notEmpty(),
  body('newPassword').isString().notEmpty(),
]), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.lmsUser.findUnique({ where: { id: req.lmsUser.id } });
  if (!user) throw httpError(404, 'Account not found');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw httpError(401, 'Current password is incorrect.');
  if (!STRONG_PW.test(newPassword)) {
    throw httpError(400, 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.');
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.lmsUser.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
  await audit(req, 'QEC_PASSWORD_CHANGE', 'LmsUser', user.id, {});
  res.json({ success: true });
}));

// ============================================================
//  PROFILE (Settings) — rich editable Director QEC profile incl.
//  photo upload. Stored on the dedicated LmsExamProfile model
//  (a generic staff-profile model reused here; no schema change).
// ============================================================
router.get('/profile', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const u = await prisma.lmsUser.findUnique({
    where: { id: req.lmsUser.id },
    select: { id: true, username: true, email: true, role: true, examProfile: true },
  });
  res.json({ user: u, profile: u?.examProfile || null });
}));

router.put('/profile', QEC, validate([
  body('fullName').optional().isString(),
  body('email').optional().isString(),
]), asyncHandler(async (req, res) => {
  const allowed = ['fullName', 'fatherName', 'cnic', 'email', 'phone', 'whatsapp', 'gender', 'maritalStatus', 'address'];
  const data = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k] === '' ? null : String(req.body[k]).trim();

  // Keep the login email (LmsUser.email) in sync when a profile email is set.
  if (req.body.email !== undefined) {
    try {
      await prisma.lmsUser.update({
        where: { id: req.lmsUser.id },
        data: { email: req.body.email ? String(req.body.email).toLowerCase().trim() : null },
      });
    } catch (e) {
      if (e.code === 'P2002') throw httpError(409, 'That email is already in use by another account.');
      throw e;
    }
  }

  const profile = await prisma.lmsExamProfile.upsert({
    where: { lmsUserId: req.lmsUser.id },
    update: data,
    create: { lmsUserId: req.lmsUser.id, ...data },
  });
  await audit(req, 'QEC_PROFILE_FULL_UPDATE', 'LmsExamProfile', String(profile.id), { after: data });
  res.json({ profile });
}));

router.post('/profile/photo', QEC, uploadQecProfilePhoto.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, 'No photo uploaded');
  const photoUrl = `/uploads/qec-profiles/${req.file.filename}`;
  const profile = await prisma.lmsExamProfile.upsert({
    where: { lmsUserId: req.lmsUser.id },
    update: { photoUrl },
    create: { lmsUserId: req.lmsUser.id, photoUrl },
  });
  await audit(req, 'QEC_PROFILE_PHOTO', 'LmsExamProfile', String(profile.id), {});
  res.json({ photoUrl, profile });
}));

router.delete('/profile/photo', QEC, asyncHandler(async (req, res) => {
  const profile = await prisma.lmsExamProfile.upsert({
    where: { lmsUserId: req.lmsUser.id },
    update: { photoUrl: null },
    create: { lmsUserId: req.lmsUser.id, photoUrl: null },
  });
  await audit(req, 'QEC_PROFILE_PHOTO_REMOVE', 'LmsExamProfile', String(profile.id), {});
  res.json({ success: true, profile });
}));

// Live sidebar counts (dynamic badges).
router.get('/counts', QEC_OR_GOV, asyncHandler(async (req, res) => {
  const now = new Date();
  const [surveys, compliance, plans, unread] = await Promise.all([
    prisma.survey.findMany({ where: { isDeleted: false }, select: { isActive: true, opensAt: true, closesAt: true } }),
    prisma.complianceItem.count({ where: { status: { in: ['PENDING', 'NON_COMPLIANT'] } } }),
    prisma.improvementPlan.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.lmsNotification.count({ where: { userId: req.lmsUser.id, isRead: false } }),
  ]);
  const activeSurveys = surveys.filter((s) => surveyStatus(s, now) === 'Active').length;
  res.json({ surveys: activeSurveys, compliance, plans, notifications: unread });
}));

module.exports = router;

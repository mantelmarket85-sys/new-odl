// ============================================================
//  ACADEMIC SERVICE
//  ------------------------------------------------------------
//  Business logic shared by Teacher + Student modules:
//    - attendance percentage summary for an offering/student
//    - quiz auto-grading (MCQ / TRUEFALSE)
//    - recomputing a CourseResult's weighted grade
//    - student GPA / transcript aggregation
//
//  Pure-ish functions that operate via the shared Prisma client.
// ============================================================
const prisma = require('../utils/prisma');
const { buildResultGrades, computeGPA } = require('../utils/lmsGrading');
const { safeJson } = require('../utils/lmsHelpers');

// ------------------------------------------------------------
// Attendance: compute present/absent/late counts + percentage for
// a given offering, optionally scoped to one student.
// ------------------------------------------------------------
async function attendanceSummary(offeringId, studentId = null) {
  const sessions = await prisma.attendanceSession.findMany({
    where: { offeringId },
    include: { records: studentId ? { where: { studentId } } : true },
    orderBy: { date: 'asc' },
  });
  const totalSessions = sessions.length;
  let present = 0;
  let absent = 0;
  let late = 0;
  let leave = 0;
  const byDate = [];
  for (const s of sessions) {
    const recs = s.records || [];
    for (const r of recs) {
      if (r.status === 'PRESENT') present += 1;
      else if (r.status === 'ABSENT') absent += 1;
      else if (r.status === 'LATE') late += 1;
      else if (r.status === 'LEAVE') leave += 1;
    }
    if (studentId) {
      const rec = recs[0];
      byDate.push({ date: s.date, topic: s.topic, status: rec ? rec.status : 'NOT_MARKED' });
    }
  }
  // For a single student, "marked" = sessions with a record. Percentage
  // counts PRESENT + LATE as attended.
  const marked = present + absent + late + leave;
  const attended = present + late;
  const percentage = marked > 0 ? Math.round((attended / marked) * 10000) / 100 : 0;
  return { totalSessions, present, absent, late, leave, marked, attended, percentage, byDate };
}

// ------------------------------------------------------------
// WEIGHTED ATTENDANCE (40% Live Classes + 60% Recorded Lectures)
// ------------------------------------------------------------
//   Live Classes attendance  = attended live sessions / total live sessions
//   Recorded Lectures        = watched lectures / total recorded lectures
//   Overall = (live% × 40%) + (recorded% × 60%)
//
//  Live sessions are sourced from AttendanceSession + AttendanceRecord
//  (teacher-marked) for the offering/student. Recorded lectures are the
//  union of CourseMaterial VIDEO/RECORDING + LiveClass recordings;
//  "watched" is tracked per-student in RecordedLectureView.
// ------------------------------------------------------------
const LIVE_WEIGHT = 0.4;
const RECORDED_WEIGHT = 0.6;

function statusBadge(pct) {
  if (pct >= 85) return 'Excellent';
  if (pct >= 75) return 'Good';
  if (pct >= 60) return 'Warning';
  return 'Short Attendance';
}

// Collect the recorded-lecture keys available for an offering.
async function recordedLectureKeys(offeringId) {
  const [mats, recs] = await Promise.all([
    prisma.courseMaterial.findMany({
      where: { offeringId, isDeleted: false, type: { in: ['VIDEO', 'RECORDING'] } },
      select: { id: true, title: true, createdAt: true, weekNumber: true },
      orderBy: [{ weekNumber: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.liveClass.findMany({
      where: { offeringId, isDeleted: false, recordingUrl: { not: null } },
      select: { id: true, title: true, scheduledAt: true },
      orderBy: { scheduledAt: 'desc' },
    }),
  ]);
  const lectures = [
    ...mats.map((m) => ({ key: `m${m.id}`, title: m.title, week: m.weekNumber, date: m.createdAt })),
    ...recs.map((r) => ({ key: `lc${r.id}`, title: r.title, week: null, date: r.scheduledAt })),
  ];
  return lectures;
}

// Full weighted attendance summary for one offering + student.
async function weightedAttendance(offeringId, studentId) {
  // --- Live classes (40%) ---
  const live = await attendanceSummary(offeringId, studentId);
  const totalLive = live.marked;          // sessions actually marked for the student
  const attendedLive = live.attended;     // PRESENT + LATE
  const livePct = totalLive > 0 ? Math.round((attendedLive / totalLive) * 10000) / 100 : 0;

  // --- Recorded lectures (60%) ---
  const lectures = await recordedLectureKeys(offeringId);
  const totalRecorded = lectures.length;
  const lectureKeys = lectures.map((l) => l.key);
  // Point 6 — pull ALL views (not just watched) so the UI can show live
  // watch-progress %, and derive the watched set from the `watched` flag
  // (auto-granted once >= threshold, or legacy manual marks).
  const allViews = lectureKeys.length
    ? await prisma.recordedLectureView.findMany({
        where: { studentId, lectureKey: { in: lectureKeys } },
        select: { lectureKey: true, watchedAt: true, watched: true, progressPercent: true },
      })
    : [];
  const viewByKey = new Map(allViews.map((v) => [v.lectureKey, v]));
  const watchedSet = new Set(allViews.filter((v) => v.watched).map((v) => v.lectureKey));
  const watchedRecorded = watchedSet.size;
  const recordedPct = totalRecorded > 0 ? Math.round((watchedRecorded / totalRecorded) * 10000) / 100 : 0;

  // --- Weighted overall ---
  // When a component has no data it contributes 0 to its weighted share,
  // but we still divide by the active weights so the percentage stays
  // meaningful (e.g. only live data → overall == live%).
  let overall;
  if (totalLive > 0 && totalRecorded > 0) {
    overall = livePct * LIVE_WEIGHT + recordedPct * RECORDED_WEIGHT;
  } else if (totalLive > 0) {
    overall = livePct;
  } else if (totalRecorded > 0) {
    overall = recordedPct;
  } else {
    overall = 0;
  }
  overall = Math.round(overall * 100) / 100;

  return {
    offeringId,
    livePercentage: livePct,
    recordedPercentage: recordedPct,
    overallPercentage: overall,
    status: statusBadge(overall),
    totalLiveClasses: totalLive,
    attendedLiveClasses: attendedLive,
    totalRecordedLectures: totalRecorded,
    watchedRecordedLectures: watchedRecorded,
    liveWeight: LIVE_WEIGHT * 100,
    recordedWeight: RECORDED_WEIGHT * 100,
    // Per-session breakdown for the detailed view.
    present: live.present, absent: live.absent, late: live.late, leave: live.leave,
    byDate: live.byDate,
    lectures: lectures.map((l) => ({
      ...l,
      watched: watchedSet.has(l.key),
      progressPercent: viewByKey.has(l.key) ? (Number(viewByKey.get(l.key).progressPercent) || 0) : 0,
    })),
  };
}

// ------------------------------------------------------------
// Quiz auto-grading: grade objective questions (MCQ / TRUEFALSE).
// SHORT answers are left ungraded (teacher reviews) — they contribute
// 0 to the auto score and are flagged needsManual.
// answers: map of questionId(string) -> answer (option index string or text)
// ------------------------------------------------------------
function gradeQuizAttempt(questions, answers) {
  let score = 0;
  let maxScore = 0;
  let needsManual = false;
  const breakdown = [];
  for (const q of questions) {
    maxScore += Number(q.marks) || 0;
    const given = answers ? answers[String(q.id)] : undefined;
    let correct = false;
    if (q.type === 'SHORT') {
      needsManual = true;
      breakdown.push({ questionId: q.id, type: q.type, awarded: 0, needsManual: true });
      continue;
    }
    // MCQ / TRUEFALSE: compare against correctAnswer (string index or value).
    if (given != null && String(given) === String(q.correctAnswer)) {
      correct = true;
      score += Number(q.marks) || 0;
    }
    breakdown.push({
      questionId: q.id,
      type: q.type,
      awarded: correct ? Number(q.marks) || 0 : 0,
      correct,
    });
  }
  return { score, maxScore, needsManual, breakdown };
}

// ------------------------------------------------------------
// Recompute and persist a CourseResult's weighted total + grade.
// ------------------------------------------------------------
async function recomputeResult(resultId) {
  const result = await prisma.courseResult.findUnique({
    where: { id: resultId },
    include: { offering: true },
  });
  if (!result) return null;
  const grades = buildResultGrades(result, result.offering);
  return prisma.courseResult.update({
    where: { id: resultId },
    data: grades,
  });
}

// Compute grades object for given component marks without persisting.
async function previewResultGrades(offeringId, componentMarks) {
  const offering = await prisma.courseOffering.findUnique({ where: { id: offeringId } });
  if (!offering) return null;
  return buildResultGrades(componentMarks, offering);
}

// ------------------------------------------------------------
// Student transcript: published results across all offerings, with
// course/term info + GPA per term and CGPA.
// ------------------------------------------------------------
async function studentTranscript(studentId) {
  const results = await prisma.courseResult.findMany({
    where: { studentId, status: 'PUBLISHED' },
    include: {
      offering: {
        include: { course: true, term: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  const terms = {};
  const rows = [];
  for (const r of results) {
    const course = r.offering.course;
    const term = r.offering.term;
    const ch = course ? course.creditHours : 3;
    const row = {
      resultId: r.id,
      courseCode: course ? course.code : '—',
      courseTitle: course ? course.title : '—',
      creditHours: ch,
      termCode: term ? term.code : '—',
      termTitle: term ? term.title : '—',
      totalPercent: r.totalPercent,
      letterGrade: r.letterGrade,
      gradePoints: r.gradePoints,
    };
    rows.push(row);
    const key = term ? term.code : 'NA';
    if (!terms[key]) terms[key] = { termCode: key, termTitle: row.termTitle, rows: [] };
    terms[key].rows.push(row);
  }
  const termSummaries = Object.values(terms).map((t) => ({
    termCode: t.termCode,
    termTitle: t.termTitle,
    gpa: computeGPA(t.rows),
    totalCredits: t.rows.reduce((s, x) => s + (x.creditHours || 0), 0),
    rows: t.rows,
  }));
  const cgpa = computeGPA(rows);
  const totalCredits = rows.reduce((s, x) => s + (x.creditHours || 0), 0);
  return { cgpa, totalCredits, terms: termSummaries, rows };
}

// ------------------------------------------------------------
// Point 7 — DYNAMIC result breakdown.
// Build a per-course result structure driven by the Course
// Coordinator's configured CourseWeightage (categories + per-item
// weights). Falls back to the offering's stored weights when the
// coordinator has not configured a CourseWeightage row, so nothing
// is hard-coded and existing published results still display.
//
// Returns { categories:[{ key,label,weight,obtainedPercent,
//   weightedMarks,items:[{label,weight}] }], totalPercent,
//   letterGrade, gradePoints, configured }.
// ------------------------------------------------------------
function safeItems(raw) {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

async function legacyResultBreakdown(offeringId, studentId) {
  const result = await prisma.courseResult.findUnique({
    where: { offeringId_studentId: { offeringId, studentId } },
    include: { offering: { include: { course: true } } },
  });
  if (!result || result.status !== 'PUBLISHED') return null;
  const offering = result.offering;
  const course = offering ? offering.course : null;
  const hasLab = !!(course && course.hasLab);

  // Coordinator config (authoritative source of category weights); may be null.
  const w = course
    ? await prisma.courseWeightage.findUnique({ where: { courseId: course.id } })
    : null;

  // Resolve each category weight: coordinator config wins, else offering fallback.
  const midWeight = w && w.midWeight != null ? w.midWeight : (offering ? offering.midWeight : 25);
  const finalWeight = w && w.finalWeight != null ? w.finalWeight : (offering ? offering.finalWeight : 40);
  const quizWeight = w && w.quizWeight != null ? w.quizWeight : (offering ? offering.quizWeight : 15);
  const assignmentWeight = w && w.assignmentWeight != null ? w.assignmentWeight : (offering ? offering.assignmentWeight : 20);
  const labTaskWeight = hasLab && w && w.labTaskWeight != null ? w.labTaskWeight : 0;
  const semesterProjectWeight = hasLab && w && w.semesterProjectWeight != null ? w.semesterProjectWeight : 0;

  // Obtained percentage per component from the stored CourseResult marks.
  const pct = (marks, max) => {
    const m = Number(max) || 0;
    if (m <= 0) return 0;
    return Math.round(Math.min(100, ((Number(marks) || 0) / m) * 100) * 100) / 100;
  };
  const assignmentPct = pct(result.assignmentMarks, result.assignmentMax);
  const quizPct = pct(result.quizMarks, result.quizMax);
  const midPct = pct(result.midMarks, result.midMax);
  const finalPct = pct(result.finalMarks, result.finalMax);

  // Lab task marks (only meaningful for lab courses) — average across published tasks.
  let labTaskPct = 0;
  let labTaskItems = [];
  if (hasLab && (labTaskWeight > 0 || semesterProjectWeight > 0)) {
    const tasks = await prisma.labTask.findMany({
      where: { offeringId, isDeleted: false, isPublished: true },
      include: { submissions: { where: { studentId } } },
      orderBy: { id: 'asc' },
    });
    let got = 0, total = 0;
    labTaskItems = tasks.map((t) => {
      const sub = t.submissions[0];
      const marks = sub ? sub.marks : null;
      if (marks != null) { got += Number(marks) || 0; total += Number(t.totalMarks) || 0; }
      return { label: t.title, totalMarks: t.totalMarks, marks, status: sub ? sub.status : 'NOT_SUBMITTED' };
    });
    labTaskPct = total > 0 ? Math.round(Math.min(100, (got / total) * 100) * 100) / 100 : 0;
  }

  const weighted = (obtainedPercent, weight) => Math.round(((obtainedPercent / 100) * weight) * 100) / 100;

  // Build the dynamic category list. Categories with weight 0 are omitted so
  // the table reflects exactly what the coordinator configured.
  const raw = [
    { key: 'assignment', label: 'Assignments', weight: assignmentWeight, obtainedPercent: assignmentPct, items: safeItems(w && w.assignmentItems) },
    { key: 'quiz', label: 'Quizzes', weight: quizWeight, obtainedPercent: quizPct, items: safeItems(w && w.quizItems) },
    { key: 'mid', label: 'Midterm', weight: midWeight, obtainedPercent: midPct, items: [] },
    { key: 'final', label: 'Final', weight: finalWeight, obtainedPercent: finalPct, items: [] },
  ];
  if (hasLab && labTaskWeight > 0) {
    raw.push({ key: 'labTask', label: 'Lab Tasks', weight: labTaskWeight, obtainedPercent: labTaskPct, items: labTaskItems.map((it) => ({ label: it.label, weight: null })), labTaskItems });
  }
  if (hasLab && semesterProjectWeight > 0) {
    raw.push({ key: 'semesterProject', label: 'Semester Project', weight: semesterProjectWeight, obtainedPercent: labTaskPct, items: [] });
  }

  const categories = raw
    .filter((c) => Number(c.weight) > 0)
    .map((c) => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      obtainedPercent: c.obtainedPercent,
      weightedMarks: weighted(c.obtainedPercent, c.weight),
      items: Array.isArray(c.items) ? c.items : [],
      ...(c.labTaskItems ? { labTaskItems: c.labTaskItems } : {}),
    }));

  const totalWeight = categories.reduce((s, c) => s + (Number(c.weight) || 0), 0);

  return {
    resultId: result.id,
    offeringId,
    courseCode: course ? course.code : '—',
    courseTitle: course ? course.title : '—',
    hasLab,
    configured: !!w,
    categories,
    totalWeight,
    totalPercent: result.totalPercent,
    letterGrade: result.letterGrade,
    gradePoints: result.gradePoints,
  };
}

// ------------------------------------------------------------
// ZERO-STATE / PRE-PUBLISH breakdown (Task 4).
// ------------------------------------------------------------
// Builds the SAME dynamic category table as resultBreakdown() — driven purely
// by the Course Coordinator's weightage config (exact # of quizzes /
// assignments / mid / final / lab) — but WITHOUT requiring a PUBLISHED result.
// This lets the student Results page auto-generate the results table the
// moment a course is registered: every configured component shows 0% until
// marks are entered, then reflects any DRAFT marks that already exist.
//
// It does NOT change any grading or weightage logic; it only READS the same
// config and any marks that happen to be stored, defaulting to 0.
async function legacyResultBreakdownPreview(offeringId, studentId) {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: { course: true },
  });
  if (!offering || offering.isDeleted) return null;
  const course = offering.course;
  const hasLab = !!(course && course.hasLab);

  // Any stored result (DRAFT or PUBLISHED) contributes live marks; absent → 0.
  const result = await prisma.courseResult.findUnique({
    where: { offeringId_studentId: { offeringId, studentId } },
  }).catch(() => null);
  const published = !!(result && result.status === 'PUBLISHED');

  const w = course
    ? await prisma.courseWeightage.findUnique({ where: { courseId: course.id } })
    : null;

  const midWeight = w && w.midWeight != null ? w.midWeight : (offering ? offering.midWeight : 25);
  const finalWeight = w && w.finalWeight != null ? w.finalWeight : (offering ? offering.finalWeight : 40);
  const quizWeight = w && w.quizWeight != null ? w.quizWeight : (offering ? offering.quizWeight : 15);
  const assignmentWeight = w && w.assignmentWeight != null ? w.assignmentWeight : (offering ? offering.assignmentWeight : 20);
  const labTaskWeight = hasLab && w && w.labTaskWeight != null ? w.labTaskWeight : 0;
  const semesterProjectWeight = hasLab && w && w.semesterProjectWeight != null ? w.semesterProjectWeight : 0;

  const pct = (marks, max) => {
    const m = Number(max) || 0;
    if (m <= 0) return 0;
    return Math.round(Math.min(100, ((Number(marks) || 0) / m) * 100) * 100) / 100;
  };
  // Marks default to 0 when no result row exists yet (zero-state).
  const assignmentPct = result ? pct(result.assignmentMarks, result.assignmentMax) : 0;
  const quizPct = result ? pct(result.quizMarks, result.quizMax) : 0;
  const midPct = result ? pct(result.midMarks, result.midMax) : 0;
  const finalPct = result ? pct(result.finalMarks, result.finalMax) : 0;

  let labTaskPct = 0;
  let labTaskItems = [];
  if (hasLab && (labTaskWeight > 0 || semesterProjectWeight > 0)) {
    const tasks = await prisma.labTask.findMany({
      where: { offeringId, isDeleted: false, isPublished: true },
      include: { submissions: { where: { studentId } } },
      orderBy: { id: 'asc' },
    });
    let got = 0, total = 0;
    labTaskItems = tasks.map((t) => {
      const sub = t.submissions[0];
      const marks = sub ? sub.marks : null;
      if (marks != null) { got += Number(marks) || 0; total += Number(t.totalMarks) || 0; }
      return { label: t.title, totalMarks: t.totalMarks, marks: marks != null ? marks : 0, status: sub ? sub.status : 'NOT_SUBMITTED' };
    });
    labTaskPct = total > 0 ? Math.round(Math.min(100, (got / total) * 100) * 100) / 100 : 0;
  }

  const weighted = (obtainedPercent, weight) => Math.round(((obtainedPercent / 100) * weight) * 100) / 100;

  const raw = [
    { key: 'assignment', label: 'Assignments', weight: assignmentWeight, obtainedPercent: assignmentPct, items: safeItems(w && w.assignmentItems) },
    { key: 'quiz', label: 'Quizzes', weight: quizWeight, obtainedPercent: quizPct, items: safeItems(w && w.quizItems) },
    { key: 'mid', label: 'Midterm', weight: midWeight, obtainedPercent: midPct, items: [] },
    { key: 'final', label: 'Final', weight: finalWeight, obtainedPercent: finalPct, items: [] },
  ];
  if (hasLab && labTaskWeight > 0) {
    raw.push({ key: 'labTask', label: 'Lab Tasks', weight: labTaskWeight, obtainedPercent: labTaskPct, items: labTaskItems.map((it) => ({ label: it.label, weight: null })), labTaskItems });
  }
  if (hasLab && semesterProjectWeight > 0) {
    raw.push({ key: 'semesterProject', label: 'Semester Project', weight: semesterProjectWeight, obtainedPercent: labTaskPct, items: [] });
  }

  const categories = raw
    .filter((c) => Number(c.weight) > 0)
    .map((c) => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      obtainedPercent: c.obtainedPercent,
      weightedMarks: weighted(c.obtainedPercent, c.weight),
      items: Array.isArray(c.items) ? c.items : [],
      ...(c.labTaskItems ? { labTaskItems: c.labTaskItems } : {}),
    }));

  const totalWeight = categories.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const totalPercent = published && result && result.totalPercent != null
    ? result.totalPercent
    : Math.round(categories.reduce((s, c) => s + (Number(c.weightedMarks) || 0), 0) * 100) / 100;

  return {
    resultId: result ? result.id : `pending-${offeringId}`,
    offeringId,
    courseCode: course ? course.code : '—',
    courseTitle: course ? course.title : '—',
    creditHours: course ? course.creditHours : null,
    hasLab,
    configured: !!w,
    published,
    pending: !published,
    categories,
    totalWeight,
    totalPercent,
    letterGrade: published && result ? result.letterGrade : '—',
    gradePoints: published && result ? result.gradePoints : 0,
  };
}

// Build the Student Results marks-breakdown table from the coordinator's
// configured plan and the student's actual assessment records. Values are
// always weighted marks: (raw obtained / raw total) * configured weight.
function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function weightedFromRaw(obtained, total, weight) {
  if (obtained == null || total == null || Number(total) <= 0) return null;
  return round2((Number(obtained) / Number(total)) * Number(weight || 0));
}

function configuredItemPlan(rawItems, configuredCount, fallbackLabel, categoryWeight, actualItems) {
  const configured = safeItems(rawItems);
  const count = Math.max(configured.length, Number(configuredCount) || 0, actualItems.length);
  if (count === 0) return [];
  const defaultWeight = count > 0 ? Number(categoryWeight || 0) / count : 0;
  return Array.from({ length: count }, (_, index) => {
    const spec = configured[index] || {};
    const actual = actualItems[index] || null;
    const explicitWeight = Number(spec.weight);
    const weight = Number.isFinite(explicitWeight) && explicitWeight > 0 ? explicitWeight : defaultWeight;
    return {
      key: `${fallbackLabel.toLowerCase().replace(/\s+/g, '-')}-${index + 1}`,
      label: spec.label || (actual && actual.label) || `${fallbackLabel} ${index + 1}`,
      weight: round2(weight),
      weightedMarks: actual ? weightedFromRaw(actual.obtained, actual.total, weight) : null,
      status: actual && actual.obtained != null ? 'GRADED' : 'PENDING',
    };
  });
}

async function buildStudentResultBreakdown(offeringId, studentId, publishedOnly) {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: { course: true },
  });
  if (!offering || offering.isDeleted || !offering.course) return null;

  const result = await prisma.courseResult.findUnique({
    where: { offeringId_studentId: { offeringId, studentId } },
  }).catch(() => null);
  if (publishedOnly && (!result || result.status !== 'PUBLISHED')) return null;

  const course = offering.course;
  const hasLab = !!course.hasLab;
  const [weightage, assignments, quizzes, labTasks] = await Promise.all([
    prisma.courseWeightage.findUnique({ where: { courseId: course.id } }),
    prisma.assignment2.findMany({
      where: { offeringId, isDeleted: false, isPublished: true },
      include: { submissions: { where: { studentId } } },
      orderBy: { id: 'asc' },
    }),
    prisma.quiz.findMany({
      where: { offeringId, isDeleted: false, isPublished: true },
      include: { attempts: { where: { studentId } } },
      orderBy: { id: 'asc' },
    }),
    hasLab
      ? prisma.labTask.findMany({
          where: { offeringId, isDeleted: false, isPublished: true },
          include: { submissions: { where: { studentId } } },
          orderBy: { id: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  const weight = (configured, fallback) => configured != null ? Number(configured) : Number(fallback || 0);
  const assignmentWeight = weight(weightage && weightage.assignmentWeight, offering.assignmentWeight);
  const quizWeight = weight(weightage && weightage.quizWeight, offering.quizWeight);
  const midWeight = weight(weightage && weightage.midWeight, offering.midWeight);
  const finalWeight = weight(weightage && weightage.finalWeight, offering.finalWeight);
  const labWeight = hasLab ? weight(weightage && weightage.labTaskWeight, 0) : 0;
  const projectWeight = hasLab ? weight(weightage && weightage.semesterProjectWeight, 0) : 0;

  const assignmentActual = assignments.map((item) => ({
    label: item.title,
    obtained: item.submissions[0] ? item.submissions[0].marks : null,
    total: item.totalMarks,
  }));
  const quizActual = quizzes.map((item) => ({
    label: item.title,
    obtained: item.attempts[0] ? item.attempts[0].score : null,
    total: item.attempts[0] && Number(item.attempts[0].maxScore) > 0
      ? item.attempts[0].maxScore
      : item.totalMarks,
  }));
  const labActual = labTasks.map((item) => ({
    label: item.title,
    obtained: item.submissions[0] ? item.submissions[0].marks : null,
    total: item.totalMarks,
  }));

  const components = [];
  const appendAggregate = (key, label, componentWeight, marks, max) => {
    if (Number(componentWeight) <= 0) return;
    const hasMarks = !!result;
    components.push({
      key,
      label,
      weight: round2(componentWeight),
      weightedMarks: hasMarks ? weightedFromRaw(marks, max, componentWeight) : null,
      status: hasMarks ? 'GRADED' : 'PENDING',
    });
  };
  const appendPlanned = (key, label, componentWeight, rawItems, configuredCount, actualItems, aggregateMarks, aggregateMax) => {
    if (Number(componentWeight) <= 0) return;
    const plan = configuredItemPlan(rawItems, configuredCount, label, componentWeight, actualItems);
    if (plan.length) components.push(...plan.map((item) => ({ ...item, key: `${key}-${item.key}` })));
    else appendAggregate(key, label, componentWeight, aggregateMarks, aggregateMax);
  };

  appendPlanned('assignment', 'Assignment', assignmentWeight, weightage && weightage.assignmentItems,
    weightage && weightage.assignmentCount, assignmentActual,
    result && result.assignmentMarks, result && result.assignmentMax);
  appendPlanned('quiz', 'Quiz', quizWeight, weightage && weightage.quizItems,
    weightage && weightage.quizCount, quizActual,
    result && result.quizMarks, result && result.quizMax);
  appendAggregate('mid', 'Mid', midWeight, result && result.midMarks, result && result.midMax);
  appendPlanned('lab', 'Lab', labWeight, weightage && weightage.labTaskItems,
    weightage && weightage.labTaskCount, labActual, null, null);
  appendAggregate('final', 'Final / Terminal', finalWeight, result && result.finalMarks, result && result.finalMax);
  if (projectWeight > 0) {
    components.push({
      key: 'semester-project',
      label: 'Semester Project',
      weight: round2(projectWeight),
      weightedMarks: null,
      status: 'PENDING',
    });
  }

  const totalWeight = round2(components.reduce((sum, component) => sum + Number(component.weight || 0), 0));
  const weightedTotal = round2(components.reduce(
    (sum, component) => sum + (component.weightedMarks == null ? 0 : Number(component.weightedMarks)),
    0
  ));
  const published = !!(result && result.status === 'PUBLISHED');

  return {
    resultId: result ? result.id : `pending-${offeringId}`,
    offeringId,
    courseCode: course.code,
    courseTitle: course.title,
    creditHours: course.creditHours,
    hasLab,
    configured: !!weightage,
    published,
    pending: !published,
    components,
    // Retained for callers that still consume the previous response contract.
    categories: components.map((component) => ({
      ...component,
      obtainedPercent: null,
      items: [],
    })),
    totalWeight,
    weightedTotal,
    totalPercent: published && result ? result.totalPercent : weightedTotal,
    letterGrade: published && result ? result.letterGrade : '—',
    gradePoints: published && result ? result.gradePoints : 0,
  };
}

async function resultBreakdown(offeringId, studentId) {
  return buildStudentResultBreakdown(offeringId, studentId, true);
}

async function resultBreakdownPreview(offeringId, studentId) {
  return buildStudentResultBreakdown(offeringId, studentId, false);
}

// ------------------------------------------------------------
// Build a quiz "public" view for a student (hides correct answers).
// ------------------------------------------------------------
function publicQuizQuestions(questions) {
  return questions.map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type,
    options: safeJson(q.optionsJson, []),
    marks: q.marks,
    order: q.order,
  }));
}

module.exports = {
  attendanceSummary,
  weightedAttendance,
  recordedLectureKeys,
  statusBadge,
  gradeQuizAttempt,
  recomputeResult,
  previewResultGrades,
  resultBreakdown,
  resultBreakdownPreview,
  studentTranscript,
  publicQuizQuestions,
};

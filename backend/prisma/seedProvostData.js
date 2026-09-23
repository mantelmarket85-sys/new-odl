// ============================================================
//  PHASE 7 — Provost : additive demo-data enrichment.
//  ------------------------------------------------------------
//  PURELY ADDITIVE & IDEMPOTENT. Enriches the dev.db so the
//  Provost (university executive) dashboards / analytics / finance
//  views have meaningful real data:
//    - Fee challans across several months (PAID for revenue trend,
//      UNPAID/OVERDUE for defaulters) — distinct titles → fee types.
//    - Historical StudentBody growth quality metrics (multi-year).
//    - Extra LmsPrograms (department-tagged) for catalogue/dept views.
//    - A couple of disciplinary fines (ApprovalRequest entity=FINE).
//    - Fee + exam-fee announcements (LmsAnnouncement tagged).
//
//  Re-running NEVER duplicates rows — each block checks for an
//  existing marker before inserting. Does NOT modify/delete any
//  existing record. No schema changes.
// ============================================================
const prisma = require('../src/utils/prisma');

function monthDate(monthsAgo, day = 12) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(day);
  d.setHours(10, 0, 0, 0);
  return d;
}

async function ensureFeeChallans() {
  let created = 0;
  const students = await prisma.lmsUser.findMany({
    where: { role: 'Student' }, select: { id: true, username: true }, orderBy: { username: 'asc' },
  });
  if (!students.length) return created;

  // Deterministic set of challans. Marker = challanNo (unique).
  const FEE_TYPES = [
    { title: 'Spring 2026 Semester Fee', amount: 52000 },
    { title: 'Fall 2025 Semester Fee', amount: 50000 },
    { title: 'Hostel Fee — Block A', amount: 28000 },
    { title: 'Transport Fee — Route 3', amount: 15000 },
    { title: 'Library Fee (Annual)', amount: 6000 },
    { title: 'Examination Fee — Mid Term', amount: 8000 },
  ];

  // Build a deterministic plan: each student gets a couple of challans
  // spread across the last 6 months with mixed statuses.
  const plan = [];
  students.forEach((s, idx) => {
    const t1 = FEE_TYPES[idx % FEE_TYPES.length];
    const t2 = FEE_TYPES[(idx + 2) % FEE_TYPES.length];
    // PAID challan (drives revenue trend) — spread across months.
    plan.push({
      challanNo: `CH-PROV-${s.username}-A`,
      studentId: s.id,
      title: t1.title,
      totalAmount: t1.amount,
      status: 'PAID',
      monthsAgo: idx % 6,
      paid: true,
    });
    // Second challan: mostly UNPAID, some OVERDUE (drives defaulters/pending).
    const overdue = idx % 3 === 0;
    plan.push({
      challanNo: `CH-PROV-${s.username}-B`,
      studentId: s.id,
      title: t2.title,
      totalAmount: t2.amount,
      status: overdue ? 'OVERDUE' : 'UNPAID',
      monthsAgo: 0,
      paid: false,
      overdue,
    });
  });

  for (const c of plan) {
    const exists = await prisma.lmsFeeChallan.findUnique({ where: { challanNo: c.challanNo } });
    if (exists) continue;
    const createdAt = monthDate(c.monthsAgo);
    const due = new Date(createdAt);
    due.setDate(due.getDate() + (c.overdue ? -10 : 20));
    await prisma.lmsFeeChallan.create({
      data: {
        studentId: c.studentId,
        challanNo: c.challanNo,
        title: c.title,
        lineItems: JSON.stringify([{ label: c.title, amount: c.totalAmount }]),
        totalAmount: c.totalAmount,
        dueDate: due.toISOString().slice(0, 10),
        status: c.status,
        paidAt: c.paid ? createdAt : null,
        paymentRef: c.paid ? `ONELINK-${c.challanNo}` : null,
        createdAt,
      },
    });
    created += 1;
  }
  return created;
}

async function ensureGrowthMetrics() {
  let created = 0;
  const years = [
    { periodLabel: '2021', value: 4200 },
    { periodLabel: '2022', value: 4620 },
    { periodLabel: '2023', value: 5010 },
    { periodLabel: '2024', value: 5380 },
    { periodLabel: '2025', value: 5720 },
    { periodLabel: '2026', value: 6010 },
  ];
  for (const y of years) {
    const exists = await prisma.qualityMetric.findFirst({
      where: { scope: 'INSTITUTION', metric: 'StudentBody', periodLabel: y.periodLabel },
    });
    if (exists) continue;
    await prisma.qualityMetric.create({
      data: { scope: 'INSTITUTION', metric: 'StudentBody', value: y.value, periodLabel: y.periodLabel, notes: 'Total enrolled student body (year-end).' },
    });
    created += 1;
  }
  return created;
}

async function ensurePrograms() {
  let created = 0;
  const PROGS = [
    { code: 'BSCS', name: 'BS Computer Science', shortForm: 'BSCS', department: 'Computer Science', durationYears: 4, totalSemesters: 8 },
    { code: 'BSSE', name: 'BS Software Engineering', shortForm: 'BSSE', department: 'Software Engineering', durationYears: 4, totalSemesters: 8 },
    { code: 'BBA', name: 'Bachelor of Business Administration', shortForm: 'BBA', department: 'Business Administration', durationYears: 4, totalSemesters: 8 },
    { code: 'MBA', name: 'Master of Business Administration', shortForm: 'MBA', department: 'Business Administration', durationYears: 2, totalSemesters: 4 },
    { code: 'BSEE', name: 'BS Electrical Engineering', shortForm: 'BSEE', department: 'Electrical Engineering', durationYears: 4, totalSemesters: 8 },
    { code: 'MSCS', name: 'MS Computer Science', shortForm: 'MSCS', department: 'Computer Science', durationYears: 2, totalSemesters: 4 },
  ];
  for (const p of PROGS) {
    const exists = await prisma.lmsProgram.findUnique({ where: { code: p.code } });
    if (exists) {
      // backfill department only if missing (non-destructive).
      if (!exists.department) {
        await prisma.lmsProgram.update({ where: { id: exists.id }, data: { department: p.department } });
      }
      continue;
    }
    await prisma.lmsProgram.create({ data: { ...p, isActive: true } });
    created += 1;
  }
  return created;
}

async function ensureFines() {
  let created = 0;
  const students = await prisma.lmsUser.findMany({
    where: { role: 'Student' }, select: { id: true, username: true }, orderBy: { username: 'asc' }, take: 3,
  });
  const FINES = [
    { title: 'Library Book Overdue Penalty', reason: 'Returned 3 books 18 days late.', amount: 1500 },
    { title: 'Plagiarism Penalty', reason: 'Assignment flagged for similarity > 40%.', amount: 5000 },
    { title: 'Lab Equipment Damage', reason: 'Damaged oscilloscope in EE lab.', amount: 12000 },
  ];
  for (let i = 0; i < FINES.length && i < students.length; i += 1) {
    const s = students[i];
    const f = FINES[i];
    const marker = `PROV-FINE:${s.id}:${f.title}`;
    const exists = await prisma.approvalRequest.findFirst({
      where: { type: 'FEE', entity: 'FINE', entityId: s.id, title: f.title },
    });
    if (exists) continue;
    await prisma.approvalRequest.create({
      data: {
        type: 'FEE', entity: 'FINE', entityId: s.id,
        title: f.title, description: f.reason,
        payloadJson: JSON.stringify({ amount: f.amount, roll: s.username, reason: f.reason, marker }),
        requestedById: s.id, requestedRole: 'Student',
        assignedRole: 'Provost', status: i === 0 ? 'APPROVED' : 'PENDING',
        dueDate: monthDate(0, 28).toISOString().slice(0, 10),
      },
    });
    created += 1;
  }
  return created;
}

async function ensureAnnouncements() {
  let created = 0;
  const provost = await prisma.lmsUser.findFirst({ where: { role: 'Provost' }, select: { id: true } });
  if (!provost) return created;
  const future = monthDate(-1, 15).toISOString().slice(0, 10);
  const past = monthDate(2, 10).toISOString().slice(0, 10);

  const ANN = [
    { tag: '[FEE]', title: 'Spring 2026 Semester Fee Notice', desc: 'Semester fee for all programs is now due.', meta: { amount: 52000, program: 'All Programs', batch: 'All Batches', semester: 'All Semesters', deadline: future } },
    { tag: '[FEE]', title: 'Fall 2025 Final Reminder', desc: 'Final reminder for outstanding Fall 2025 dues.', meta: { amount: 50000, program: 'All Programs', batch: 'Fall 2024', semester: 'Sem 3', deadline: past } },
    { tag: '[EXAMFEE]', title: 'Mid-Term Examination Fee', desc: 'Examination fee for mid-term assessments.', meta: { amount: 8000, program: 'All Programs', batch: 'All Batches', semester: 'All Semesters', deadline: future, examType: 'Mid Term' } },
    { tag: '[EXAMFEE]', title: 'Final-Term Examination Fee', desc: 'Examination fee for final-term assessments.', meta: { amount: 9000, program: 'BS Computer Science', batch: 'Fall 2024', semester: 'Sem 3', deadline: future, examType: 'Final Term' } },
  ];

  for (const a of ANN) {
    const fullTitle = `${a.tag} ${a.title}`;
    const exists = await prisma.lmsAnnouncement.findFirst({ where: { title: fullTitle, isDeleted: false } });
    if (exists) continue;
    await prisma.lmsAnnouncement.create({
      data: {
        authorId: provost.id,
        title: fullTitle,
        message: `${a.desc} ||META:${JSON.stringify(a.meta)}`,
        audience: 'ALL',
      },
    });
    created += 1;
  }
  return created;
}

async function main() {
  console.log('— Phase 7 Provost data enrichment (idempotent) —');
  const challans = await ensureFeeChallans();
  const metrics = await ensureGrowthMetrics();
  const programs = await ensurePrograms();
  const fines = await ensureFines();
  const announcements = await ensureAnnouncements();
  console.log(`  + ${challans} fee challans`);
  console.log(`  + ${metrics} growth metrics`);
  console.log(`  + ${programs} programs`);
  console.log(`  + ${fines} fines`);
  console.log(`  + ${announcements} fee/exam-fee announcements`);
  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

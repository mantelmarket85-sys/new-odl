// ============================================================
//  DATA EXPORT / BACKUP MODULE
//  ------------------------------------------------------------
//  Pure read-only endpoints for bulk backups & list exports.
//  This module DOES NOT modify any application data. It is built
//  for: disaster recovery, audit support, administrative reports.
//
//  Endpoints (all require Director Admissions OR Coordinator):
//
//   GET  /api/exports/all-applicants
//        → Streams Fall_2026_All_Applicants_Backup.zip
//          (one folder per applicant: Name_CNIC/)
//
//   GET  /api/exports/enrolled-students
//        → Streams Fall_2026_Enrolled_Students_Backup.zip
//          (one folder per enrolled student: Name_CNIC/)
//
//   GET  /api/exports/individual/:applicationId
//        → Streams Name_CNIC.zip
//          (single applicant, fixes existing name-only filename bug)
//
//   GET  /api/exports/merit-list?format=xlsx|csv|pdf&programId=...
//        → Excel / CSV / PDF download of merit list
//
//   GET  /api/exports/enrolled-list?format=xlsx|csv
//        → Excel / CSV download of enrolled-student roster
//
//  Performance:
//   - Streaming ZIP (archiver) — never holds full content in memory
//   - Streaming Excel (exceljs workbook.xlsx.write)
//   - Per-applicant try/catch — a single bad record CANNOT abort the
//     whole archive; missing files are silently skipped.
//   - Token can be passed in Authorization header OR as ?token=...
//     (so a plain <a href> click can stream the download).
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const ExcelJS = require('exceljs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

// ------------------------------------------------------------
// Auth — accepts Bearer header OR ?token=... (query string)
// because bulk downloads are usually triggered by a plain link.
// ------------------------------------------------------------
async function authFlexible(req, res, next) {
  try {
    const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const token = req.query.token || headerToken;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ error: 'Invalid user' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

// Role guard: only Super Admin, Director Admissions ('admin' legacy) or Coordinator can bulk-export
function requireExporter(req, res, next) {
  const role = req.user?.role;
  const allowed = ['super_admin', 'director_admissions', 'admin', 'coordinator'];
  if (!allowed.includes(role)) {
    return res.status(403).json({ error: 'Access denied. Bulk export is restricted to staff accounts.' });
  }
  next();
}

// ------------------------------------------------------------
// Coordinator department scoping for exports.
// Loads req.coordinatorProgramIds (number[] | null). For a coordinator it is
// the list of program ids in their department (or [] when unassigned). For
// director/super it is null (unrestricted). Apply scopeWhere() to every
// application query so a coordinator can only ever export their department.
// ------------------------------------------------------------
async function attachExportScope(req, res, next) {
  try {
    if (req.user.role === 'coordinator') {
      const dept = await prisma.department.findUnique({
        where: { coordinatorId: req.user.id },
        include: { programs: { select: { id: true } } },
      });
      req.coordinatorProgramIds = dept ? dept.programs.map((p) => p.id) : [];
      req.coordinatorDepartmentName = dept ? dept.name : null;
    } else {
      req.coordinatorProgramIds = null; // unrestricted
      req.coordinatorDepartmentName = null;
    }
    next();
  } catch (e) {
    console.error('[exports] attachExportScope error:', e.message);
    res.status(500).json({ error: 'Failed to resolve export scope' });
  }
}

// Merge a coordinator's program scope into a Prisma `where` object.
function scopeWhere(req, where = {}) {
  if (req.user.role === 'coordinator') {
    const ids = req.coordinatorProgramIds || [];
    return { ...where, programId: { in: ids.length ? ids : [-1] } };
  }
  return where;
}

// ------------------------------------------------------------
// Helpers (shared with printApplication.js semantics)
// ------------------------------------------------------------
const safeSlug = (s) => String(s || 'unknown')
  .replace(/[^a-z0-9_-]+/gi, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 80) || 'file';

// CNIC may contain dashes (35202-1234567-1). Keep dashes — they're
// valid in folder/file names and they make the ID human-readable.
const safeCnic = (cnic) => String(cnic || 'NO-CNIC')
  .replace(/[^0-9\-]+/g, '')
  .slice(0, 20) || 'NO-CNIC';

const toAbsoluteUploadPath = (filePath) => {
  if (!filePath) return null;
  const clean = String(filePath).replace(/^\/+/, '').replace(/^uploads[\\/]/i, '');
  return path.join(UPLOAD_ROOT, clean);
};

const dash = (v) => (v == null || v === '' ? '—' : v);

// Format cycle title for filenames: "Fall 2026 Admissions" → "Fall_2026"
const cycleSlug = (cycle) => {
  if (!cycle?.title) return 'Admissions';
  const t = String(cycle.title)
    .replace(/admissions?/i, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]+/g, '');
  return t || 'Admissions';
};

// Build the per-applicant folder name: "Ali_Khan_35202-1234567-1"
function buildApplicantFolderName(profile, user) {
  const first = profile?.firstName?.trim() || '';
  const last  = profile?.lastName?.trim()  || '';
  const nameRaw = [first, last].filter(Boolean).join('_') || (user?.username || `user_${user?.id}`);
  const cnic = safeCnic(profile?.cnic);
  return `${safeSlug(nameRaw)}_${cnic}`;
}

// ------------------------------------------------------------
// Phase 2: Structured ZIP organisation —
//   Department / Program / <Student_Name_CNIC> /
// This helper builds the nested folder PREFIX (department + program) for an
// application. Falls back gracefully when department/program are missing.
// ------------------------------------------------------------
function buildDeptProgramPrefix(app) {
  const dept = app.program?.department?.name
    ? safeSlug(app.program.department.name)
    : 'No_Department';
  const prog = app.program
    ? safeSlug(app.program.shortForm || app.program.code || app.program.name)
    : 'No_Program';
  return `${dept}/${prog}`;
}

// Full nested folder path for an applicant inside a structured backup.
function buildStructuredApplicantPath(app) {
  const p = app.user?.profile || {};
  const leaf = buildApplicantFolderName(p, app.user);
  return `${buildDeptProgramPrefix(app)}/${leaf}_app${app.id}`;
}

// Build the application_data.json payload (sanitised, no internal IDs leaking
// beyond what's already visible in the admin dashboard).
function buildApplicationDataJson(app) {
  const u = app.user || {};
  const p = u.profile || {};
  return {
    exportedAt: new Date().toISOString(),
    application: {
      id: app.id,
      status: app.status,
      submittedAt: app.submittedAt,
      updatedAt: app.updatedAt,
      adminRemarks: app.adminRemarks,
      rejectionReason: app.rejectionReason,
      resultStatus: app.resultStatus,
      feeReceiptPath: app.feeReceiptPath,
      appealCount: app.appealCount,
      lastAppealStatus: app.lastAppealStatus,
    },
    program: app.program ? {
      id: app.program.id,
      code: app.program.code,
      name: app.program.name,
    } : null,
    admissionCycle: app.admissionCycle ? {
      id: app.admissionCycle.id,
      title: app.admissionCycle.title,
      termCode: app.admissionCycle.termCode,
    } : null,
    user: {
      id: u.id,
      email: u.email,
      username: u.username,
    },
    profile: p ? {
      firstName: p.firstName,
      lastName: p.lastName,
      cnic: p.cnic,
      fatherName: p.fatherName,
      fatherCnic: p.fatherCnic,
      guardianPhone: p.guardianPhone,
      whatsappNumber: p.whatsappNumber,
      nationality: p.nationality,
      countryOfResidence: p.countryOfResidence,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      bloodGroup: p.bloodGroup,
      religion: p.religion,
      maritalStatus: p.maritalStatus,
      occupation: p.occupation,
      domicileProvince: p.domicileProvince,
      domicileDistrict: p.domicileDistrict,
      address: p.address,
      district: p.district,
      phone: p.phone,
      presStreet: p.presStreet,
      presPostalCode: p.presPostalCode,
      presVillage: p.presVillage,
      presTehsil: p.presTehsil,
      presDistrict: p.presDistrict,
      permStreet: p.permStreet,
      permPostalCode: p.permPostalCode,
      permVillage: p.permVillage,
      permTehsil: p.permTehsil,
      permDistrict: p.permDistrict,
      permSameAsPresent: p.permSameAsPresent,
      isComplete: p.isComplete,
    } : null,
    educations: (u.educations || []).map(ed => ({
      level: ed.level,
      degree: ed.degree,
      major: ed.major,
      majorOther: ed.majorOther,
      rollNumber: ed.rollNumber,
      marks: ed.marks,
      totalMarks: ed.totalMarks,
      grade: ed.grade,
      partOneMarks: ed.partOneMarks,
      partOneTotalMarks: ed.partOneTotalMarks,
      board: ed.board,
      passingYear: ed.passingYear,
      resultStatus: ed.resultStatus,
      documents: (ed.documents || []).map(d => ({
        docType: d.docType,
        fileName: d.fileName,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
      })),
    })),
    documents: (u.documents || []).map(d => ({
      type: d.type,
      fileName: d.fileName,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
    })),
    interview: app.interview ? {
      scheduledDate: app.interview.scheduledDate,
      scheduledTime: app.interview.scheduledTime,
      venue: app.interview.venue,
      meetingLink: app.interview.meetingLink,
      decision: app.interview.decision,
      marks: app.interview.marks,
      remarks: app.interview.remarks,
      status: app.interview.status,
    } : null,
    meritEntry: app.meritEntry ? {
      matricPercent: app.meritEntry.matricPercent,
      fscPercent: app.meritEntry.fscPercent,
      interviewMarks: app.meritEntry.interviewMarks,
      matricWeighted: app.meritEntry.matricWeighted,
      fscWeighted: app.meritEntry.fscWeighted,
      interviewWeighted: app.meritEntry.interviewWeighted,
      totalMerit: app.meritEntry.totalMerit,
      rank: app.meritEntry.rank,
      isFinalized: app.meritEntry.isFinalized,
    } : null,
    feePayment: app.feePayment ? {
      amount: app.feePayment.amount,
      method: app.feePayment.method,
      txnId: app.feePayment.txnId,
      status: app.feePayment.status,
      paidAt: app.feePayment.paidAt,
      receiptPath: app.feePayment.receiptPath,
    } : null,
    enrollment: u.enrollment ? {
      rollNumber: u.enrollment.rollNumber,
      registrationNumber: u.enrollment.registrationNumber,
      lmsUsername: u.enrollment.lmsUsername,
      enrolledAt: u.enrollment.enrolledAt,
      feePaid: u.enrollment.feePaid,
      status: u.enrollment.status,
    } : null,
    appeals: (app.appeals || []).map(a => ({
      id: a.id,
      appealType: a.appealType,
      subject: a.subject,
      message: a.message,
      status: a.status,
      adminResponse: a.adminResponse,
      decidedBy: a.decidedBy,
      decidedAt: a.decidedAt,
      createdAt: a.createdAt,
    })),
    statusHistory: (app.statusEvents || []).map(s => ({
      status: s.status,
      remarks: s.remarks,
      actorRole: s.actorRole,
      at: s.createdAt,
    })),
  };
}

// Add all files belonging to ONE applicant into the archive,
// rooted at `baseFolder/`. Missing files are silently skipped.
function appendApplicantFiles(archive, app, baseFolder) {
  const u = app.user || {};
  const p = u.profile || {};

  // 1. application_data.json
  try {
    const json = JSON.stringify(buildApplicationDataJson(app), null, 2);
    archive.append(json, { name: `${baseFolder}/application_data.json` });
  } catch (e) {
    // never fail the whole archive over one record
    archive.append(`{"error":"Failed to serialise application data: ${e.message}"}`,
      { name: `${baseFolder}/application_data.json` });
  }

  // 2. Profile photo (from Profile.photoPath)
  if (p.photoPath) {
    try {
      const abs = toAbsoluteUploadPath(p.photoPath);
      if (abs && fs.existsSync(abs)) {
        const ext = path.extname(abs) || '.jpg';
        archive.file(abs, { name: `${baseFolder}/Profile_Photo/photo${ext}` });
      }
    } catch (_) { /* skip on error */ }
  }

  // 3. User-level documents (CNIC front/back, father CNIC, photo, fee receipts,
  //    appeal proofs, additional, domicile). Dedup by type (newest wins).
  const newestPerType = new Map();
  [...(u.documents || [])]
    .sort((a, b) => (b.id || 0) - (a.id || 0))
    .forEach(d => {
      const t = (d.type || '').toLowerCase();
      if (!t) return;
      if (!newestPerType.has(t)) newestPerType.set(t, d);
    });

  for (const d of newestPerType.values()) {
    try {
      const abs = toAbsoluteUploadPath(d.filePath);
      if (!abs || !fs.existsSync(abs)) continue;
      const ext = path.extname(abs) || path.extname(d.fileName || '') || '';
      const t = (d.type || '').toLowerCase();

      if (t === 'cnic_front' || t === 'cnic_back') {
        archive.file(abs, { name: `${baseFolder}/CNIC/${t}${ext}` });
      } else if (t === 'father_cnic' || t === 'guardian_cnic') {
        archive.file(abs, { name: `${baseFolder}/Father_CNIC/${t}${ext}` });
      } else if (t === 'photo') {
        // already handled above via profile.photoPath
      } else if (t === 'appeal_proof') {
        archive.file(abs, { name: `${baseFolder}/Appeals/appeal_proof_${d.id}${ext}` });
      } else if (t === 'application_fee_receipt' || t === 'fee_receipt') {
        archive.file(abs, { name: `${baseFolder}/Receipts/processing_fee_receipt_${d.id}${ext}` });
      } else if (t === 'admission_fee_receipt') {
        archive.file(abs, { name: `${baseFolder}/Receipts/admission_fee_receipt${ext}` });
      } else if (t === 'domicile' || t === 'domicile_cert') {
        archive.file(abs, { name: `${baseFolder}/Additional_Documents/domicile_certificate${ext}` });
      } else {
        archive.file(abs, { name: `${baseFolder}/Additional_Documents/${safeSlug(t)}_${d.id}${ext}` });
      }
    } catch (_) { /* skip on error */ }
  }

  // 4. Education documents (per qualification: Matric, FSC, FSC_Part1, …)
  (u.educations || []).forEach(ed => {
    try {
      const folder = ed.level === '10years' ? 'Matric'
        : ed.level === '12years' ? 'FSC'
        : ed.level === '11years' ? 'FSC_Part1'
        : `Education_${safeSlug(ed.level)}`;
      const sortedDocs = [...(ed.documents || [])].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      const seenDocTypes = new Set();
      sortedDocs.forEach(doc => {
        try {
          const abs = toAbsoluteUploadPath(doc.filePath);
          if (!abs || !fs.existsSync(abs)) return;
          const dt = doc.docType || 'document';
          if (seenDocTypes.has(dt)) return;
          seenDocTypes.add(dt);
          const ext = path.extname(abs) || path.extname(doc.fileName || '') || '';
          archive.file(abs, { name: `${baseFolder}/${folder}/${safeSlug(dt)}${ext}` });
        } catch (_) { /* per-doc safe */ }
      });
    } catch (_) { /* per-education safe */ }
  });

  // 5. Receipts from path fields on Application / FeePayment
  try {
    if (app.feeReceiptPath) {
      const abs = toAbsoluteUploadPath(app.feeReceiptPath);
      if (abs && fs.existsSync(abs)) {
        const ext = path.extname(abs) || '.pdf';
        archive.file(abs, { name: `${baseFolder}/Receipts/processing_fee_receipt${ext}` });
      }
    }
    if (app.feePayment?.receiptPath) {
      const abs = toAbsoluteUploadPath(app.feePayment.receiptPath);
      if (abs && fs.existsSync(abs)) {
        const ext = path.extname(abs) || '.pdf';
        archive.file(abs, { name: `${baseFolder}/Receipts/admission_fee_receipt${ext}` });
      }
    }
  } catch (_) { /* skip */ }

  // 6. Appeal proofs
  (app.appeals || []).forEach(a => {
    try {
      if (!a.proofPath) return;
      const abs = toAbsoluteUploadPath(a.proofPath);
      if (!abs || !fs.existsSync(abs)) return;
      const ext = path.extname(abs) || '.pdf';
      archive.file(abs, { name: `${baseFolder}/Appeals/appeal_${a.id}_proof${ext}` });
    } catch (_) { /* skip */ }
  });

  // 7. Per-applicant README summary
  try {
    const readme = buildPerApplicantReadme(app, baseFolder);
    archive.append(readme, { name: `${baseFolder}/README.txt` });
  } catch (_) { /* skip */ }
}

function buildPerApplicantReadme(app, folderName) {
  const u = app.user || {};
  const p = u.profile || {};
  const lines = [];
  lines.push('AUST — Abbottabad University of Science & Technology');
  lines.push('Open & Distance Learning — Application Backup');
  lines.push('====================================================');
  lines.push('');
  lines.push(`Folder        : ${folderName}`);
  lines.push(`Name          : ${dash(p.firstName)} ${dash(p.lastName)}`);
  lines.push(`CNIC          : ${dash(p.cnic)}`);
  lines.push(`Email         : ${dash(u.email)}`);
  lines.push(`Username      : ${dash(u.username)}`);
  lines.push(`Application # : ${app.id}`);
  lines.push(`Status        : ${dash(app.status)}`);
  lines.push(`Program       : ${dash(app.program?.name)}`);
  lines.push(`Cycle         : ${dash(app.admissionCycle?.title)}`);
  if (u.enrollment) {
    lines.push(`Roll Number   : ${dash(u.enrollment.rollNumber)}`);
    lines.push(`Reg. Number   : ${dash(u.enrollment.registrationNumber)}`);
    lines.push(`Enrolled At   : ${dash(u.enrollment.enrolledAt)}`);
  }
  lines.push(`Submitted At  : ${dash(app.submittedAt)}`);
  lines.push(`Last Update   : ${dash(app.updatedAt)}`);
  lines.push('');
  lines.push('Folder Contents');
  lines.push('---------------');
  lines.push('  application_data.json   Full structured snapshot');
  lines.push('  Profile_Photo/          Student photograph');
  lines.push('  CNIC/                   CNIC front + back');
  lines.push('  Father_CNIC/            Father / guardian CNIC');
  lines.push('  Matric/                 Matric DMC + certificate + character cert');
  lines.push('  FSC/                    FSc DMC + certificate + character cert + migration');
  lines.push('  FSC_Part1/              FSc Part-I DMC (when result awaited)');
  lines.push('  Receipts/               Application processing + admission fee receipts');
  lines.push('  Appeals/                Any appeals filed + proofs uploaded');
  lines.push('  Additional_Documents/   Domicile, extra uploads');
  lines.push('');
  lines.push(`Exported at  : ${new Date().toISOString()}`);
  return lines.join('\n');
}

// ------------------------------------------------------------
// Prisma include for full applicant snapshot
// ------------------------------------------------------------
const FULL_INCLUDE = {
  program: { include: { department: true } },
  admissionCycle: true,
  interview: true,
  meritEntry: true,
  feePayment: true,
  appeals: { orderBy: { createdAt: 'desc' } },
  statusEvents: { orderBy: { createdAt: 'asc' } },
  user: {
    select: {
      id: true, email: true, username: true,
      profile: true,
      educations: { include: { documents: true } },
      documents: true,
      enrollment: true,
    },
  },
};

// ============================================================
// GET /api/exports/all-applicants
// → Fall_2026_All_Applicants_Backup.zip (or current cycle name)
// ============================================================
router.get('/all-applicants', authFlexible, requireExporter, attachExportScope, async (req, res) => {
  try {
    // Filter by current cycle when available; otherwise include every applicant.
    let cycleFilter = {};
    let cycle = null;
    if (req.query.cycleId) {
      const cid = parseInt(req.query.cycleId);
      cycle = await prisma.admissionCycle.findUnique({ where: { id: cid } });
      if (cycle) cycleFilter = { admissionCycleId: cycle.id };
    } else {
      cycle = await prisma.admissionCycle.findFirst({
        where: { isOpen: true },
        orderBy: { id: 'desc' },
      });
      if (cycle) cycleFilter = { admissionCycleId: cycle.id };
    }

    const zipName = `${cycleSlug(cycle)}_All_Applicants_Backup.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => { if (err.code !== 'ENOENT') console.error('[exports/all-applicants] warning:', err); });
    archive.on('error', (err) => {
      console.error('[exports/all-applicants] error:', err);
      try { res.status(500).end(); } catch (_) { /* ignore */ }
    });
    archive.pipe(res);

    // Stream applicants in chunks of 50 to keep memory low even for 1000+ records.
    const PAGE = 50;
    let cursor = 0;
    let processed = 0;
    const summary = [];

    // Top-level README
    archive.append(
      [
        'AUST — Abbottabad University of Science & Technology',
        'All Applicants Backup',
        '====================================================',
        '',
        `Cycle      : ${cycle?.title || 'All cycles'}`,
        `Generated  : ${new Date().toISOString()}`,
        `Exporter   : ${req.user.email} (${req.user.role})`,
        '',
        'Structure (Phase 2):',
        '  <Department>/<Program>/<First_Last_CNIC>_app<id>/',
        '',
        'Each applicant folder contains:',
        '  - application_data.json (full structured snapshot)',
        '  - Profile_Photo/, CNIC/, Father_CNIC/',
        '  - Matric/, FSC/, FSC_Part1/',
        '  - Receipts/, Appeals/, Additional_Documents/',
        '',
        'A master spreadsheet "Master_Applicants.xlsx" at the root lists',
        'every application field and the current application status.',
        '  - README.txt',
        '',
        'Files that were missing on disk have been silently',
        'skipped — the archive will never fail because of a',
        'missing upload.',
      ].join('\n'),
      { name: 'README.txt' }
    );

    /* eslint-disable no-await-in-loop */
    while (true) {
      const batch = await prisma.application.findMany({
        where: scopeWhere(req, cycleFilter),
        include: FULL_INCLUDE,
        orderBy: { id: 'asc' },
        skip: cursor,
        take: PAGE,
      });
      if (!batch.length) break;

      for (const app of batch) {
        try {
          const p = app.user?.profile || {};
          // Phase 2: structured path — Department/Program/<Name_CNIC>/
          const uniqueFolder = buildStructuredApplicantPath(app);
          appendApplicantFiles(archive, app, uniqueFolder);
          summary.push({
            applicationId: app.id,
            folder: uniqueFolder,
            department: app.program?.department?.name || '',
            program: app.program?.name || '',
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
            cnic: p.cnic || '',
            status: app.status,
          });
          processed += 1;
        } catch (e) {
          // never let one applicant's failure abort the whole archive
          console.error(`[exports/all-applicants] skipping app ${app.id}:`, e.message);
        }
      }
      cursor += batch.length;
      if (batch.length < PAGE) break;
    }
    /* eslint-enable no-await-in-loop */

    // ------------------------------------------------------------
    // Master Excel — every application field + current status, grouped by
    // Department then Program (Phase 2 requirement).
    // ------------------------------------------------------------
    try {
      const allApps = await prisma.application.findMany({
        where: scopeWhere(req, cycleFilter),
        include: FULL_INCLUDE,
        orderBy: [{ programId: 'asc' }, { id: 'asc' }],
      });
      const wb = new ExcelJS.Workbook();
      wb.creator = 'AUST ODL';
      wb.created = new Date();
      const ws = wb.addWorksheet('Master Applicants', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = APPLICANT_COLUMNS;
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3C8C' } };
      ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
      allApps.forEach((a, i) => ws.addRow(buildApplicantRow(a, i)));
      const buf = await wb.xlsx.writeBuffer();
      archive.append(Buffer.from(buf), { name: 'Master_Applicants.xlsx' });
    } catch (e) {
      console.error('[exports/all-applicants] master excel failed:', e.message);
    }

    // Index/summary at the top of the archive
    archive.append(JSON.stringify({
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.email,
      role: req.user.role,
      cycle: cycle ? { id: cycle.id, title: cycle.title, termCode: cycle.termCode } : null,
      totalApplicants: processed,
      structure: 'Department/Program/<Name_CNIC>',
      entries: summary,
    }, null, 2), { name: 'INDEX.json' });

    await archive.finalize();
  } catch (err) {
    console.error('[exports/all-applicants] fatal:', err);
    try { res.status(500).end('Failed to generate applicants backup'); } catch (_) { /* ignore */ }
  }
});

// ============================================================
// GET /api/exports/enrolled-students
// → Fall_2026_Enrolled_Students_Backup.zip
// ============================================================
router.get('/enrolled-students', authFlexible, requireExporter, attachExportScope, async (req, res) => {
  try {
    let cycle = null;
    let where = { status: 'ENROLLED' };
    if (req.query.cycleId) {
      const cid = parseInt(req.query.cycleId);
      cycle = await prisma.admissionCycle.findUnique({ where: { id: cid } });
      if (cycle) where.admissionCycleId = cycle.id;
    } else {
      cycle = await prisma.admissionCycle.findFirst({
        where: { isOpen: true }, orderBy: { id: 'desc' },
      });
      if (cycle) where.admissionCycleId = cycle.id;
    }

    const zipName = `${cycleSlug(cycle)}_Enrolled_Students_Backup.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => { if (err.code !== 'ENOENT') console.error('[exports/enrolled] warning:', err); });
    archive.on('error', (err) => {
      console.error('[exports/enrolled] error:', err);
      try { res.status(500).end(); } catch (_) { /* ignore */ }
    });
    archive.pipe(res);

    archive.append(
      [
        'AUST — Abbottabad University of Science & Technology',
        'Enrolled Students Backup',
        '====================================================',
        '',
        `Cycle      : ${cycle?.title || 'All cycles'}`,
        `Generated  : ${new Date().toISOString()}`,
        `Exporter   : ${req.user.email} (${req.user.role})`,
        '',
        'Structure (Phase 2):',
        '  <Department>/<Program>/<First_Last_CNIC>_app<id>/',
        '  containing the full record + uploads.',
        '',
        'A master spreadsheet "Master_Enrolled.xlsx" at the root lists',
        'every enrolled student with their identifiers and status.',
      ].join('\n'),
      { name: 'README.txt' }
    );

    const PAGE = 50;
    let cursor = 0;
    let processed = 0;
    const summary = [];

    /* eslint-disable no-await-in-loop */
    while (true) {
      const batch = await prisma.application.findMany({
        where: scopeWhere(req, where),
        include: FULL_INCLUDE,
        orderBy: { id: 'asc' },
        skip: cursor,
        take: PAGE,
      });
      if (!batch.length) break;

      for (const app of batch) {
        try {
          const p = app.user?.profile || {};
          // Phase 2: structured path — Department/Program/<Name_CNIC>/
          const uniqueFolder = buildStructuredApplicantPath(app);
          appendApplicantFiles(archive, app, uniqueFolder);
          summary.push({
            applicationId: app.id,
            folder: uniqueFolder,
            department: app.program?.department?.name || '',
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
            cnic: p.cnic || '',
            rollNumber: app.user?.enrollment?.rollNumber || '',
            registrationNumber: app.user?.enrollment?.registrationNumber || '',
            program: app.program?.name || '',
          });
          processed += 1;
        } catch (e) {
          console.error(`[exports/enrolled] skipping app ${app.id}:`, e.message);
        }
      }
      cursor += batch.length;
      if (batch.length < PAGE) break;
    }
    /* eslint-enable no-await-in-loop */

    // Master Excel of enrolled students.
    try {
      const enrolled = await prisma.application.findMany({
        where: scopeWhere(req, where),
        include: FULL_INCLUDE,
        orderBy: [{ programId: 'asc' }, { id: 'asc' }],
      });
      const wb = new ExcelJS.Workbook();
      wb.creator = 'AUST ODL';
      const ws = wb.addWorksheet('Enrolled Students', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = APPLICANT_COLUMNS;
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3C8C' } };
      enrolled.forEach((a, i) => ws.addRow(buildApplicantRow(a, i)));
      const buf = await wb.xlsx.writeBuffer();
      archive.append(Buffer.from(buf), { name: 'Master_Enrolled.xlsx' });
    } catch (e) {
      console.error('[exports/enrolled] master excel failed:', e.message);
    }

    archive.append(JSON.stringify({
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.email,
      role: req.user.role,
      cycle: cycle ? { id: cycle.id, title: cycle.title, termCode: cycle.termCode } : null,
      totalEnrolled: processed,
      structure: 'Department/Program/<Name_CNIC>',
      entries: summary,
    }, null, 2), { name: 'INDEX.json' });

    await archive.finalize();
  } catch (err) {
    console.error('[exports/enrolled] fatal:', err);
    try { res.status(500).end('Failed to generate enrolled-students backup'); } catch (_) { /* ignore */ }
  }
});

// ============================================================
// GET /api/exports/individual/:applicationId
// → Name_CNIC.zip (single applicant; fixes the existing name-only bug)
// ============================================================
router.get('/individual/:applicationId', authFlexible, attachExportScope, async (req, res) => {
  try {
    const appId = parseInt(req.params.applicationId);
    if (!appId) return res.status(400).json({ error: 'Invalid application id' });

    const app = await prisma.application.findUnique({
      where: { id: appId },
      include: FULL_INCLUDE,
    });
    if (!app) return res.status(404).json({ error: 'Application not found' });

    // Role guard: student can only download their OWN application;
    // super admin / director / coordinator / admin can download (subject to dept scope).
    const role = req.user.role;
    const isStaff = ['super_admin', 'director_admissions', 'admin', 'coordinator'].includes(role);
    if (!isStaff && app.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    // Coordinator department scoping — cannot export other departments' applicants.
    if (role === 'coordinator') {
      const ids = req.coordinatorProgramIds || [];
      if (!ids.includes(app.programId)) {
        return res.status(403).json({ error: 'Access denied. This application belongs to another department.' });
      }
    }

    const p = app.user?.profile || {};
    const folderName = buildApplicantFolderName(p, app.user);
    const zipName = `${folderName}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => { if (err.code !== 'ENOENT') console.error('[exports/individual] warning:', err); });
    archive.on('error', (err) => {
      console.error('[exports/individual] error:', err);
      try { res.status(500).end(); } catch (_) { /* ignore */ }
    });
    archive.pipe(res);
    appendApplicantFiles(archive, app, folderName);
    await archive.finalize();
  } catch (err) {
    console.error('[exports/individual] fatal:', err);
    try { res.status(500).end('Failed to generate individual backup'); } catch (_) { /* ignore */ }
  }
});

// ============================================================
// GET /api/exports/merit-list?format=xlsx|csv&programId=...
// Director / Coordinator / Admin only.
// ============================================================
router.get('/merit-list', authFlexible, requireExporter, attachExportScope, async (req, res) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const where = {};
    if (req.query.programId) {
      const pid = parseInt(req.query.programId);
      // A coordinator cannot request another department's program.
      if (req.user.role === 'coordinator' && !(req.coordinatorProgramIds || []).includes(pid)) {
        return res.status(403).json({ error: 'Access denied. This program belongs to another department.' });
      }
      where.programId = pid;
    } else if (req.user.role === 'coordinator') {
      // No specific program requested → restrict to the coordinator's department.
      const ids = req.coordinatorProgramIds || [];
      where.programId = { in: ids.length ? ids : [-1] };
    }
    if (req.query.cycleId) {
      where.application = { admissionCycleId: parseInt(req.query.cycleId) };
    }

    const entries = await prisma.meritEntry.findMany({
      where,
      include: {
        user: { include: { profile: true, enrollment: true } },
        application: { include: { program: { include: { department: true } }, admissionCycle: true } },
      },
      orderBy: [{ totalMerit: 'desc' }, { id: 'asc' }],
    });

    const cycle = entries[0]?.application?.admissionCycle || null;
    const baseName = `${cycleSlug(cycle)}_Merit_List`;

    const rows = entries.map((e, i) => {
      const p = e.user?.profile || {};
      const en = e.user?.enrollment || {};
      const app = e.application || {};
      return {
        sNo: i + 1,
        rank: e.rank || (i + 1),
        name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        fatherName: p.fatherName || '',
        cnic: p.cnic || '',
        department: app.program?.department?.name || '',
        program: app.program?.name || '',
        matricPercent: Number(e.matricPercent || 0).toFixed(2),
        fscPercent: Number(e.fscPercent || 0).toFixed(2),
        interviewMarks: Number(e.interviewMarks || 0).toFixed(2),
        totalMerit: Number(e.totalMerit || 0).toFixed(2),
        rollNumber: en.rollNumber || '',
        registrationNumber: en.registrationNumber || '',
        status: app.status || '',
        remarks: app.adminRemarks || '',
        finalized: e.isFinalized ? 'YES' : 'NO',
      };
    });

    const MERIT_COLS = [
      { header: 'S.No',         key: 'sNo',                width: 6 },
      { header: 'Rank',         key: 'rank',               width: 8 },
      { header: 'Name',         key: 'name',               width: 28 },
      { header: 'Father Name',  key: 'fatherName',         width: 28 },
      { header: 'CNIC',         key: 'cnic',               width: 20 },
      { header: 'Department',   key: 'department',         width: 26 },
      { header: 'Program',      key: 'program',            width: 32 },
      { header: 'Matric %',     key: 'matricPercent',      width: 12 },
      { header: 'FSc %',        key: 'fscPercent',         width: 12 },
      { header: 'Interview',    key: 'interviewMarks',     width: 12 },
      { header: 'Merit Score',  key: 'totalMerit',         width: 14 },
      { header: 'Roll Number',  key: 'rollNumber',         width: 18 },
      { header: 'Reg. Number',  key: 'registrationNumber', width: 22 },
      { header: 'Status',       key: 'status',             width: 18 },
      { header: 'Remarks',      key: 'remarks',            width: 30 },
      { header: 'Finalized',    key: 'finalized',          width: 12 },
    ];

    if (format === 'csv') {
      const head = MERIT_COLS.map((c) => c.header);
      const csvRows = [head.join(',')];
      rows.forEach(r => {
        const cells = MERIT_COLS.map((c) => r[c.key]);
        csvRows.push(cells.map(c => {
          const s = String(c ?? '');
          return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(','));
      });
      const csv = csvRows.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
      return res.send(csv);
    }

    // Default: xlsx (streaming write)
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AUST ODL';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Merit List', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = MERIT_COLS;
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3C8C' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    rows.forEach(r => sheet.addRow(r));
    sheet.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      row.alignment = { vertical: 'middle' };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exports/merit-list] fatal:', err);
    try { res.status(500).json({ error: 'Failed to generate merit list' }); } catch (_) { /* ignore */ }
  }
});

// ============================================================
// GET /api/exports/enrolled-list?format=xlsx|csv
// ============================================================
router.get('/enrolled-list', authFlexible, requireExporter, attachExportScope, async (req, res) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();
    let where = { status: 'ENROLLED' };
    if (req.query.cycleId) where.admissionCycleId = parseInt(req.query.cycleId);
    if (req.query.programId) where.programId = parseInt(req.query.programId);

    const apps = await prisma.application.findMany({
      where: scopeWhere(req, where),
      include: {
        program: { include: { department: true } },
        admissionCycle: true,
        feePayment: true,
        meritEntry: true,
        user: { include: { profile: true, enrollment: true } },
      },
      orderBy: { id: 'asc' },
    });

    const cycle = apps[0]?.admissionCycle || null;
    const baseName = `${cycleSlug(cycle)}_Enrolled_Students`;

    const rows = apps.map((a, i) => {
      const p = a.user?.profile || {};
      const en = a.user?.enrollment || {};
      const fp = a.feePayment || {};
      const m = a.meritEntry || {};
      return {
        sNo: i + 1,
        studentName: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        fatherName: p.fatherName || '',
        cnic: p.cnic || '',
        department: a.program?.department?.name || '',
        program: a.program?.name || '',
        meritScore: m.totalMerit != null ? Number(m.totalMerit).toFixed(2) : '',
        rollNumber: en.rollNumber || '',
        registrationNumber: en.registrationNumber || '',
        enrollmentNumber: en.registrationNumber || en.rollNumber || '',
        semester: a.admissionCycle?.termCode || '',
        feeStatus: fp.status || (en.feePaid ? 'PAID' : 'PENDING'),
        feeAmount: fp.amount != null ? fp.amount : '',
        enrollmentDate: en.enrolledAt ? new Date(en.enrolledAt).toISOString().slice(0, 10) : '',
        email: a.user?.email || '',
      };
    });

    const ENROLLED_COLS = [
      { header: 'S.No',               key: 'sNo',                 width: 6 },
      { header: 'Student Name',       key: 'studentName',         width: 28 },
      { header: 'Father Name',        key: 'fatherName',          width: 28 },
      { header: 'CNIC',               key: 'cnic',                width: 20 },
      { header: 'Department',         key: 'department',          width: 26 },
      { header: 'Program',            key: 'program',             width: 32 },
      { header: 'Merit Score',        key: 'meritScore',          width: 12 },
      { header: 'Roll Number',        key: 'rollNumber',          width: 18 },
      { header: 'Reg. Number',        key: 'registrationNumber',  width: 22 },
      { header: 'Enrollment Number',  key: 'enrollmentNumber',    width: 22 },
      { header: 'Semester',           key: 'semester',            width: 12 },
      { header: 'Fee Status',         key: 'feeStatus',           width: 14 },
      { header: 'Fee Amount',         key: 'feeAmount',           width: 14 },
      { header: 'Enrollment Date',    key: 'enrollmentDate',      width: 16 },
      { header: 'Email',              key: 'email',               width: 30 },
    ];

    if (format === 'csv') {
      const head = ENROLLED_COLS.map((c) => c.header);
      const csvRows = [head.join(',')];
      rows.forEach(r => {
        const cells = ENROLLED_COLS.map((c) => r[c.key]);
        csvRows.push(cells.map(c => {
          const s = String(c ?? '');
          return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(','));
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
      return res.send(csvRows.join('\n'));
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AUST ODL';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Enrolled Students', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = ENROLLED_COLS;
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3C8C' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    rows.forEach(r => sheet.addRow(r));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exports/enrolled-list] fatal:', err);
    try { res.status(500).json({ error: 'Failed to generate enrolled list' }); } catch (_) { /* ignore */ }
  }
});

// ============================================================
// GET /api/exports/stats — quick counts (for UI confirmation modal)
// ============================================================
router.get('/stats', authFlexible, requireExporter, attachExportScope, async (req, res) => {
  try {
    let cycle = null;
    if (req.query.cycleId) {
      cycle = await prisma.admissionCycle.findUnique({ where: { id: parseInt(req.query.cycleId) } });
    } else {
      cycle = await prisma.admissionCycle.findFirst({ where: { isOpen: true }, orderBy: { id: 'desc' } });
    }
    const cycleFilter = cycle ? { admissionCycleId: cycle.id } : {};
    // Apply coordinator department scope to the counts so the UI shows live,
    // dept-scoped numbers (and the buttons enable correctly).
    const scopedCycle = scopeWhere(req, cycleFilter);
    // MeritEntry is linked via application → cycle, so filter through the relation
    const meritAppFilter = scopeWhere(req, cycleFilter);
    const meritFilter = Object.keys(meritAppFilter).length ? { application: meritAppFilter } : {};
    const [totalApplicants, totalEnrolled, totalMerit] = await Promise.all([
      prisma.application.count({ where: scopedCycle }),
      prisma.application.count({ where: { ...scopedCycle, status: 'ENROLLED' } }),
      prisma.meritEntry.count({ where: meritFilter }).catch(() => 0),
    ]);
    res.json({
      cycle: cycle ? { id: cycle.id, title: cycle.title, termCode: cycle.termCode } : null,
      totalApplicants,
      totalEnrolled,
      totalMerit,
    });
  } catch (err) {
    console.error('[exports/stats] error:', err);
    res.status(500).json({ error: 'Failed to load export stats' });
  }
});

// ------------------------------------------------------------
// Program short-form slug for filenames (e.g. "ADCS").
// ------------------------------------------------------------
function programShort(program) {
  const sf = program?.shortForm && String(program.shortForm).trim();
  if (sf) return safeSlug(sf);
  if (program?.code) return safeSlug(program.code);
  return safeSlug(program?.name || 'PROGRAM');
}

// Build a one-row record for tabular applicant exports (Excel/CSV).
function buildApplicantRow(app, i) {
  const p = app.user?.profile || {};
  const en = app.user?.enrollment || {};
  const m = app.meritEntry || {};
  // Enrollment number: prefer explicit registrationNumber (used as the
  // permanent enrollment number in this system), else fall back to rollNumber.
  const enrollmentNumber = en.registrationNumber || en.rollNumber || '';
  return {
    sNo: i + 1,
    name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
    fatherName: p.fatherName || '',
    cnic: p.cnic || '',
    department: app.program?.department?.name || '—',
    program: app.program?.name || '',
    programShort: app.program?.shortForm || app.program?.code || '',
    session: app.admissionCycle?.title || '',
    status: app.status || '',
    meritScore: m.totalMerit != null ? Number(m.totalMerit).toFixed(2) : '',
    meritRank: m.rank != null ? m.rank : '',
    rollNumber: en.rollNumber || '',
    registrationNumber: en.registrationNumber || '',
    enrollmentNumber,
    email: app.user?.email || '',
    submittedAt: app.submittedAt ? new Date(app.submittedAt).toISOString().slice(0, 10) : '',
  };
}

const APPLICANT_COLUMNS = [
  { header: 'S.No',              key: 'sNo',                width: 6 },
  { header: 'Name',              key: 'name',               width: 28 },
  { header: 'Father Name',       key: 'fatherName',         width: 28 },
  { header: 'CNIC',              key: 'cnic',               width: 20 },
  { header: 'Department',        key: 'department',         width: 28 },
  { header: 'Program',           key: 'program',            width: 34 },
  { header: 'Program (Short)',   key: 'programShort',       width: 16 },
  { header: 'Session',           key: 'session',            width: 22 },
  { header: 'Status',            key: 'status',             width: 18 },
  { header: 'Merit Score',       key: 'meritScore',         width: 12 },
  { header: 'Merit Rank',        key: 'meritRank',          width: 10 },
  { header: 'Roll Number',       key: 'rollNumber',         width: 18 },
  { header: 'Reg. Number',       key: 'registrationNumber', width: 22 },
  { header: 'Enrollment Number', key: 'enrollmentNumber',   width: 22 },
  { header: 'Email',             key: 'email',              width: 30 },
  { header: 'Submitted',         key: 'submittedAt',        width: 14 },
];

// ============================================================
// GET /api/exports/all-applicants-list?format=xlsx|csv
// Tabular roster of every applicant WITH department / program / session
// columns (Fix 1.3). Coordinator-scoped automatically.
// ============================================================
router.get('/all-applicants-list', authFlexible, requireExporter, attachExportScope, async (req, res) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();
    let cycle = null;
    let where = {};
    if (req.query.cycleId) {
      const cid = parseInt(req.query.cycleId);
      cycle = await prisma.admissionCycle.findUnique({ where: { id: cid } });
      if (cycle) where.admissionCycleId = cycle.id;
    }
    const apps = await prisma.application.findMany({
      where: scopeWhere(req, where),
      include: FULL_INCLUDE,
      orderBy: { id: 'asc' },
    });
    const rows = apps.map((a, i) => buildApplicantRow(a, i));
    const baseName = `${cycleSlug(cycle)}_All_Applicants`;

    if (format === 'csv') {
      const head = APPLICANT_COLUMNS.map((c) => c.header);
      const csvRows = [head.join(',')];
      rows.forEach((r) => {
        const cells = APPLICANT_COLUMNS.map((c) => r[c.key]);
        csvRows.push(cells.map((c) => {
          const s = String(c ?? '');
          return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(','));
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
      return res.send(csvRows.join('\n'));
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AUST ODL';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('All Applicants', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = APPLICANT_COLUMNS;
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3C8C' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    rows.forEach((r) => sheet.addRow(r));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exports/all-applicants-list] fatal:', err);
    try { res.status(500).json({ error: 'Failed to generate applicants list' }); } catch (_) { /* ignore */ }
  }
});

// ============================================================
// GET /api/exports/program-zip?programId=…&cycleId=…
// Program-wise ZIP named ProgramShortForm_SessionName.zip.
// Contains, per applicant, a folder ApplicantFullName_CNIC with their
// documents + an application_data.json summary; plus a program-level
// applicants summary Excel + a merit list Excel for the program.
// Coordinator-scoped (403 for other departments).
// ============================================================
router.get('/program-zip', authFlexible, requireExporter, attachExportScope, async (req, res) => {
  try {
    const programId = parseInt(req.query.programId);
    if (!programId) return res.status(400).json({ error: 'programId is required' });

    // Coordinator dept scoping.
    if (req.user.role === 'coordinator' && !(req.coordinatorProgramIds || []).includes(programId)) {
      return res.status(403).json({ error: 'Access denied. This program belongs to another department.' });
    }

    const program = await prisma.program.findUnique({
      where: { id: programId },
      include: { department: true },
    });
    if (!program) return res.status(404).json({ error: 'Program not found' });

    let cycle = null;
    const where = { programId };
    if (req.query.cycleId) {
      const cid = parseInt(req.query.cycleId);
      cycle = await prisma.admissionCycle.findUnique({ where: { id: cid } });
      if (cycle) where.admissionCycleId = cycle.id;
    } else {
      cycle = await prisma.admissionCycle.findFirst({ where: { isOpen: true }, orderBy: { id: 'desc' } });
      if (cycle) where.admissionCycleId = cycle.id;
    }

    const zipName = `${programShort(program)}_${cycleSlug(cycle)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => { if (err.code !== 'ENOENT') console.error('[exports/program-zip] warning:', err); });
    archive.on('error', (err) => { console.error('[exports/program-zip] error:', err); try { res.status(500).end(); } catch (_) {} });
    archive.pipe(res);

    const apps = await prisma.application.findMany({
      where, include: FULL_INCLUDE, orderBy: { id: 'asc' },
    });

    // README
    archive.append([
      'AUST — Abbottabad University of Science & Technology',
      `Program Backup: ${program.name} (${program.shortForm || program.code})`,
      `Department    : ${program.department?.name || '—'}`,
      `Session       : ${cycle?.title || 'All cycles'}`,
      `Generated     : ${new Date().toISOString()}`,
      `Exporter      : ${req.user.email} (${req.user.role})`,
      '',
      'Each applicant has a folder <Name_CNIC>/ with their documents and a',
      'summary (application_data.json). The program merit list and applicants',
      'summary spreadsheets are at the root.',
    ].join('\n'), { name: 'README.txt' });

    // Per-applicant folders.
    for (const app of apps) {
      try {
        const p = app.user?.profile || {};
        const folder = `${buildApplicantFolderName(p, app.user)}_app${app.id}`;
        appendApplicantFiles(archive, app, folder);
      } catch (e) {
        console.error(`[exports/program-zip] skipping app ${app.id}:`, e.message);
      }
    }

    // Applicants summary Excel.
    try {
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet('Applicants', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = APPLICANT_COLUMNS;
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3C8C' } };
      apps.forEach((a, i) => sheet.addRow(buildApplicantRow(a, i)));
      const buf = await wb.xlsx.writeBuffer();
      archive.append(Buffer.from(buf), { name: `${programShort(program)}_Applicants_Summary.xlsx` });
    } catch (e) {
      console.error('[exports/program-zip] applicants summary failed:', e.message);
    }

    // Merit list Excel for the program.
    try {
      const meritWhere = { programId };
      if (cycle) meritWhere.application = { admissionCycleId: cycle.id };
      const entries = await prisma.meritEntry.findMany({
        where: meritWhere,
        include: { user: { include: { profile: true, enrollment: true } }, application: { include: { program: true } } },
        orderBy: [{ totalMerit: 'desc' }, { id: 'asc' }],
      });
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet('Merit List', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = [
        { header: 'Rank', key: 'rank', width: 8 },
        { header: 'Name', key: 'name', width: 28 },
        { header: 'Father Name', key: 'fatherName', width: 28 },
        { header: 'CNIC', key: 'cnic', width: 20 },
        { header: 'Matric %', key: 'matricPercent', width: 12 },
        { header: 'FSc %', key: 'fscPercent', width: 12 },
        { header: 'Interview', key: 'interviewMarks', width: 12 },
        { header: 'Merit Score', key: 'totalMerit', width: 14 },
        { header: 'Roll Number', key: 'rollNumber', width: 18 },
        { header: 'Reg. Number', key: 'registrationNumber', width: 22 },
        { header: 'Finalized', key: 'finalized', width: 12 },
      ];
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3C8C' } };
      entries.forEach((e, i) => {
        const p = e.user?.profile || {};
        const en = e.user?.enrollment || {};
        sheet.addRow({
          rank: e.rank || (i + 1),
          name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
          fatherName: p.fatherName || '',
          cnic: p.cnic || '',
          matricPercent: Number(e.matricPercent || 0).toFixed(2),
          fscPercent: Number(e.fscPercent || 0).toFixed(2),
          interviewMarks: Number(e.interviewMarks || 0).toFixed(2),
          totalMerit: Number(e.totalMerit || 0).toFixed(2),
          rollNumber: en.rollNumber || '',
          registrationNumber: en.registrationNumber || '',
          finalized: e.isFinalized ? 'YES' : 'NO',
        });
      });
      const buf = await wb.xlsx.writeBuffer();
      archive.append(Buffer.from(buf), { name: `MeritList_${programShort(program)}_${cycleSlug(cycle)}.xlsx` });
    } catch (e) {
      console.error('[exports/program-zip] merit list failed:', e.message);
    }

    await archive.finalize();
  } catch (err) {
    console.error('[exports/program-zip] fatal:', err);
    try { res.status(500).end('Failed to generate program backup'); } catch (_) { /* ignore */ }
  }
});

// ============================================================
// GET /api/exports/full-backup
// Full system backup → ODL_Backup_YYYY-MM-DD.zip.
// Director / Super Admin only (a coordinator may not back up the whole
// system). Contains every applicant folder + a master applicants Excel +
// a departments/programs manifest JSON.
// ============================================================
router.get('/full-backup', authFlexible, requireExporter, attachExportScope, async (req, res) => {
  try {
    if (req.user.role === 'coordinator') {
      return res.status(403).json({ error: 'Full system backup is restricted to the Director and Super Admin.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    const zipName = `ODL_Backup_${today}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err) => { if (err.code !== 'ENOENT') console.error('[exports/full-backup] warning:', err); });
    archive.on('error', (err) => { console.error('[exports/full-backup] error:', err); try { res.status(500).end(); } catch (_) {} });
    archive.pipe(res);

    // Manifest of departments + programs + cycles.
    const [departments, cycles] = await Promise.all([
      prisma.department.findMany({ include: { programs: true, coordinator: { select: { email: true, username: true } } } }),
      prisma.admissionCycle.findMany({ orderBy: { id: 'asc' } }),
    ]);
    archive.append(JSON.stringify({
      generatedAt: new Date().toISOString(),
      exportedBy: req.user.email,
      departments: departments.map((d) => ({
        id: d.id, name: d.name, faculty: d.faculty,
        coordinator: d.coordinator?.email || null,
        programs: d.programs.map((p) => ({ id: p.id, name: p.name, shortForm: p.shortForm, code: p.code })),
      })),
      cycles: cycles.map((c) => ({ id: c.id, title: c.title, isOpen: c.isOpen })),
    }, null, 2), { name: 'MANIFEST.json' });

    // README
    archive.append([
      'AUST — Abbottabad University of Science & Technology',
      'FULL SYSTEM BACKUP',
      `Generated : ${new Date().toISOString()}`,
      `Exporter  : ${req.user.email} (${req.user.role})`,
      '',
      'Contains: MANIFEST.json (departments/programs/cycles),',
      'All_Applicants_Master.xlsx, and an applicants/ folder with every',
      "applicant's documents in <Name_CNIC>/ sub-folders.",
    ].join('\n'), { name: 'README.txt' });

    // Master applicants spreadsheet + per-applicant folders (streamed in batches).
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('All Applicants', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = APPLICANT_COLUMNS;
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3C8C' } };

    const PAGE = 50;
    let cursor = 0;
    let idx = 0;
    /* eslint-disable no-await-in-loop */
    while (true) {
      const batch = await prisma.application.findMany({
        include: FULL_INCLUDE, orderBy: { id: 'asc' }, skip: cursor, take: PAGE,
      });
      if (!batch.length) break;
      for (const app of batch) {
        try {
          const p = app.user?.profile || {};
          // Phase 2: structured path — applicants/<Department>/<Program>/<Name_CNIC>/
          const folder = `applicants/${buildStructuredApplicantPath(app)}`;
          appendApplicantFiles(archive, app, folder);
          sheet.addRow(buildApplicantRow(app, idx));
          idx += 1;
        } catch (e) {
          console.error(`[exports/full-backup] skipping app ${app.id}:`, e.message);
        }
      }
      cursor += batch.length;
      if (batch.length < PAGE) break;
    }
    /* eslint-enable no-await-in-loop */

    const buf = await wb.xlsx.writeBuffer();
    archive.append(Buffer.from(buf), { name: 'All_Applicants_Master.xlsx' });

    await archive.finalize();
  } catch (err) {
    console.error('[exports/full-backup] fatal:', err);
    try { res.status(500).end('Failed to generate full backup'); } catch (_) { /* ignore */ }
  }
});

module.exports = router;

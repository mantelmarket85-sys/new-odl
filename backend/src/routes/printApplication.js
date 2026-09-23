// ============================================================
//  PRINT APPLICATION + DOWNLOAD ADMISSION PACKAGE
//  ------------------------------------------------------------
//  Endpoints:
//    GET  /print-application/:id?token=...     → professional A4 HTML
//                                                (Browser → Print → Save as PDF)
//    GET  /admission-package/:id?token=...     → ZIP archive containing
//                                                form HTML + ALL uploaded docs
//                                                (photo, CNIC, education
//                                                 documents, receipts, etc.)
//
//  All file lookups use absolute filesystem paths derived from each
//  document's stored `filePath`. The form's <img> tags are embedded as
//  base64 `data:` URLs so the printed PDF carries the logo and student
//  photo even when opened offline / from a saved file.
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const router = express.Router();
const prisma = new PrismaClient();

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const BRANDING_DIR = path.join(UPLOAD_ROOT, 'branding');
// Try multiple logo filenames — historical naming has been .png and .jpg.
// We pick the first one that exists on disk.
const LOGO_CANDIDATES = [
  path.join(BRANDING_DIR, 'aust-logo.jpg'),
  path.join(BRANDING_DIR, 'aust-logo.jpeg'),
  path.join(BRANDING_DIR, 'aust-logo.png'),
  path.join(BRANDING_DIR, 'logo.jpg'),
  path.join(BRANDING_DIR, 'logo.png'),
];

// ------------------------------------------------------------
//  Auth — token can come from `?token=` (we open in new tab)
// ------------------------------------------------------------
async function authQuery(req, res, next) {
  try {
    const token = req.query.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).send('Unauthorised');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).send('Invalid user');
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).send('Authentication failed');
  }
}

// ------------------------------------------------------------
//  Prisma include payload — single source of truth for both endpoints
// ------------------------------------------------------------
const FULL_INCLUDE = {
  program: true,
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

// ------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------
const esc = (v) => (v == null ? '' : String(v))
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const dash = (v) => (v == null || v === '' ? '—' : v);

const fmtDate = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' }); }
  catch { return String(d); }
};

const fmtDateTime = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-GB'); } catch { return String(d); }
};

// Convert a stored `filePath` like "/uploads/photos/x.jpg" → absolute path
const toAbsoluteUploadPath = (filePath) => {
  if (!filePath) return null;
  const clean = String(filePath).replace(/^\/+/, '').replace(/^uploads[\\/]/i, '');
  return path.join(UPLOAD_ROOT, clean);
};

// Detect the real image MIME from the file's magic bytes so we never
// emit `data:image/png` when the bytes are actually JPEG (some renderers
// — notably headless chrome / print-to-pdf — reject mismatched mime+bytes
// and the image silently disappears from the PDF). This is the root cause
// of "logo still missing in PDF" bugs even when the file is on disk.
const sniffImageMime = (buf) => {
  if (!buf || buf.length < 4) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  // GIF87a / GIF89a
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  // WEBP: "RIFF"....WEBP
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  // BMP: "BM"
  if (buf[0] === 0x42 && buf[1] === 0x4D) return 'image/bmp';
  // PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  return null;
};

// Load any file from disk as base64 data URL (used for inline images in the form).
// Sniffs bytes first, then falls back to extension, then to a caller-provided default.
const fileToDataUrl = (absPath, fallbackMime) => {
  try {
    if (!absPath || !fs.existsSync(absPath)) return null;
    const buf = fs.readFileSync(absPath);
    // 1) byte-sniff (definitive)
    const sniffed = sniffImageMime(buf);
    if (sniffed) return `data:${sniffed};base64,${buf.toString('base64')}`;
    // 2) extension fallback
    const ext = path.extname(absPath).toLowerCase();
    const mime =
      ext === '.png' ? 'image/png' :
      ext === '.jpg' || ext === '.jpeg' || ext === '.jfif' ? 'image/jpeg' :
      ext === '.gif' ? 'image/gif' :
      ext === '.webp' ? 'image/webp' :
      ext === '.pdf' ? 'application/pdf' :
      fallbackMime || 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) { return null; }
};

// Pick the logo (returns base64 data url or null). Tries multiple known
// filenames + falls back to scanning the branding directory for the first
// image file. Guarantees the logo renders in PDF preview and print mode
// whenever ANY branding image exists on disk.
const loadLogoDataUrl = () => {
  for (const p of LOGO_CANDIDATES) {
    if (fs.existsSync(p)) {
      const url = fileToDataUrl(p);
      if (url) return url;
    }
  }
  try {
    if (fs.existsSync(BRANDING_DIR)) {
      const files = fs.readdirSync(BRANDING_DIR).filter(f => /\.(png|jpe?g|gif|webp|bmp)$/i.test(f));
      for (const f of files) {
        const url = fileToDataUrl(path.join(BRANDING_DIR, f));
        if (url) return url;
      }
    }
  } catch (_) { /* ignore */ }
  return null;
};

// Pick the student photo from profile.photoPath → base64 data url or null
const loadPhotoDataUrl = (profile) => {
  if (!profile?.photoPath) return null;
  const abs = toAbsoluteUploadPath(profile.photoPath);
  return fileToDataUrl(abs, 'image/jpeg');
};

// Human-friendly document type labels
const DOC_LABELS = {
  dmc: 'DMC (Marks Sheet)',
  certificate: 'Certificate',
  char_cert: 'Character Certificate',
  provisional: 'Provisional Certificate',
  additional: 'Additional Document',
  part1_dmc: 'Part-I DMC',
  migration_cert: 'Migration Certificate',
  cnic_front: 'CNIC Front',
  cnic_back: 'CNIC Back',
  appeal_proof: 'Appeal Proof',
};
const docTypeLabel = (t) => DOC_LABELS[t] || (t || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const LEVEL_LABEL = {
  '10years': 'Matric / SSC',
  '11years': 'FSc Part-I',
  '12years': 'FSc / Intermediate',
};

// Sanitise a name fragment for the ZIP file name / inner paths
const safeSlug = (s) => String(s || 'unknown')
  .replace(/[^a-z0-9_-]+/gi, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 60) || 'file';

// ============================================================
//  GET /print-application/:id?token=...
//  Professional, print-ready single-file HTML (A4) with logo & photo.
// ============================================================
router.get('/print-application/:id', authQuery, async (req, res) => {
  try {
    const app = await prisma.application.findUnique({
      where: { id: parseInt(req.params.id) },
      include: FULL_INCLUDE,
    });
    if (!app) return res.status(404).send('Application not found');

    const u = app.user;
    if (req.user.role === 'student' && app.userId !== req.user.id) {
      return res.status(403).send('Access denied');
    }

    const html = renderApplicationHtml(app);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Print application error:', error);
    res.status(500).send('Failed to generate application form');
  }
});

// ============================================================
//  GET /admission-package/:id?token=...
//  Streams a ZIP archive containing:
//    /Admission_Package_<id>/
//      Admission_Form.html        ← printable application form (with logo)
//      README.txt                 ← summary of contents
//      Student_Photo/...
//      CNIC/cnic_front.* / cnic_back.*
//      Matric/dmc.*, certificate.*, ...
//      FSC/dmc.*, certificate.*, char_cert.*, part1_dmc.*, ...
//      Certificates/migration_cert.*, char_cert.*, provisional.*, ...
//      Additional_Documents/...
//      Receipts/fee_receipt.*
//      Appeals/appeal_<id>_proof.*
// ============================================================
router.get('/admission-package/:id', authQuery, async (req, res) => {
  try {
    const app = await prisma.application.findUnique({
      where: { id: parseInt(req.params.id) },
      include: FULL_INCLUDE,
    });
    if (!app) return res.status(404).send('Application not found');

    if (req.user.role === 'student' && app.userId !== req.user.id) {
      return res.status(403).send('Access denied');
    }

    const u = app.user;
    const p = u.profile || {};
    const fullName = `${p.firstName || ''}_${p.lastName || ''}`.trim() || `student_${u.id}`;
    const baseFolder = `Admission_Package_${safeSlug(fullName)}_App${app.id}`;
    const zipName = `${baseFolder}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') console.error('Archive warning:', err);
    });
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      try { res.status(500).end(); } catch (_) { /* ignore */ }
    });

    archive.pipe(res);

    // 1) The printable HTML form (with logo + photo embedded)
    const formHtml = renderApplicationHtml(app, { hideActions: true });
    archive.append(formHtml, { name: `${baseFolder}/Admission_Form.html` });

    // 2) README inside the ZIP
    const readme = buildReadme(app, fullName);
    archive.append(readme, { name: `${baseFolder}/README.txt` });

    // 3) Student photo
    if (p.photoPath) {
      const abs = toAbsoluteUploadPath(p.photoPath);
      if (abs && fs.existsSync(abs)) {
        const ext = path.extname(abs) || '.jpg';
        archive.file(abs, { name: `${baseFolder}/Student_Photo/student_photo${ext}` });
      }
    }

    // 4) Documents from the Document table — routed by type into proper
    //    sub-folders. This is the CRITICAL document-mapping fix: every
    //    upload type goes into ONE specific folder, never cross-wired.
    //    Photo is NOT included here (already added in Student_Photo/ from
    //    Profile.photoPath), and fee receipts are NOT included here
    //    (they are added below in Receipts/).
    //
    //    DEDUP: Keep only the NEWEST Document per type — old stale rows
    //    from before the upload-time dedup fix must not leak into the ZIP.
    const seenTypes = new Set();
    const _newestPerType = new Map();
    [...(u.documents || [])]
      .sort((a, b) => (b.id || 0) - (a.id || 0))
      .forEach((d) => {
        const t = (d.type || '').toLowerCase();
        if (!t) return;
        if (!_newestPerType.has(t)) _newestPerType.set(t, d);
      });
    Array.from(_newestPerType.values()).forEach((d) => {
      const abs = toAbsoluteUploadPath(d.filePath);
      if (!abs || !fs.existsSync(abs)) return;
      const ext = path.extname(abs) || path.extname(d.fileName || '') || '';
      const t = d.type || '';

      // Skip duplicate types (only keep most recent per type — Document
      // rows are returned newest-first by default, but legacy data may
      // have leftover stale rows that we must not include).
      if (seenTypes.has(t)) return;
      seenTypes.add(t);

      // CNIC front / back
      if (t === 'cnic_front' || t === 'cnic_back') {
        archive.file(abs, { name: `${baseFolder}/CNIC/${t}${ext}` });
        return;
      }
      // Father / Guardian CNIC
      if (t === 'father_cnic' || t === 'guardian_cnic') {
        archive.file(abs, { name: `${baseFolder}/Father_CNIC/${t}${ext}` });
        return;
      }
      // Photo — already handled above from Profile.photoPath; skip to
      // avoid the photo accidentally landing in Additional_Documents.
      if (t === 'photo') {
        return;
      }
      // Appeal proof
      if (t === 'appeal_proof') {
        archive.file(abs, { name: `${baseFolder}/Appeals/appeal_proof_${d.id}${ext}` });
        return;
      }
      // Application processing fee receipt → Receipts folder
      if (t === 'application_fee_receipt' || t === 'fee_receipt' || t === 'admission_fee_receipt') {
        const name = t === 'admission_fee_receipt'
          ? `admission_fee_receipt${ext}`
          : `processing_fee_receipt_${d.id}${ext}`;
        archive.file(abs, { name: `${baseFolder}/Receipts/${name}` });
        return;
      }
      // Domicile certificate
      if (t === 'domicile' || t === 'domicile_cert') {
        archive.file(abs, { name: `${baseFolder}/Additional_Documents/domicile_certificate${ext}` });
        return;
      }
      // Anything else → Additional_Documents (clearly named)
      archive.file(abs, { name: `${baseFolder}/Additional_Documents/${safeSlug(t)}_${d.id}${ext}` });
    });

    // 5) Education documents (per qualification level)
    //    Each EducationDocument has a docType: dmc, certificate, char_cert,
    //    provisional, additional, part1_dmc, migration_cert. We route them
    //    into the correct level folder (Matric/FSC/FSC_Part1) with the
    //    correct filename — never cross-wired.
    (u.educations || []).forEach((ed) => {
      const folder = ed.level === '10years' ? 'Matric'
        : ed.level === '12years' ? 'FSC'
        : ed.level === '11years' ? 'FSC_Part1'
        : `Education_${safeSlug(ed.level)}`;
      // Track docTypes already added per education so a stale duplicate
      // never replaces the latest. EducationDocuments are returned
      // newest-first by `orderBy: createdAt desc` in education.js GET, but
      // we re-sort here defensively to keep the newest entry per type.
      const sortedDocs = [...(ed.documents || [])].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      const seenDocTypes = new Set();
      sortedDocs.forEach((doc) => {
        const abs = toAbsoluteUploadPath(doc.filePath);
        if (!abs || !fs.existsSync(abs)) return;
        const dt = doc.docType || 'document';
        if (seenDocTypes.has(dt)) return; // only the most recent file per docType
        seenDocTypes.add(dt);
        const ext = path.extname(abs) || path.extname(doc.fileName || '') || '';
        // Migration cert is conceptually "additional" — keep it in the
        // FSC folder where it was uploaded so it appears next to FSc DMC.
        archive.file(abs, { name: `${baseFolder}/${folder}/${safeSlug(dt)}${ext}` });
      });
    });

    // 6) Fee receipts (from Application.feeReceiptPath + FeePayment.receiptPath)
    //    These are intentionally added IN ADDITION to anything from Document
    //    table because legacy applications stored only the path field.
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

    // 7) Appeal proofs (Appeal.proofPath)
    (app.appeals || []).forEach((a) => {
      if (!a.proofPath) return;
      const abs = toAbsoluteUploadPath(a.proofPath);
      if (!abs || !fs.existsSync(abs)) return;
      const ext = path.extname(abs) || '.pdf';
      archive.file(abs, { name: `${baseFolder}/Appeals/appeal_${a.id}_proof${ext}` });
    });

    await archive.finalize();
  } catch (error) {
    console.error('Admission package error:', error);
    try { res.status(500).end('Failed to build admission package'); } catch (_) { /* ignore */ }
  }
});

// ============================================================
//  README content (plain text, lists contents + summary)
// ============================================================
function buildReadme(app, fullName) {
  const lines = [];
  lines.push('AUST — Abbottabad University of Science & Technology');
  lines.push('Open & Distance Learning (ODL) — Admission Package');
  lines.push('==================================================');
  lines.push('');
  lines.push(`Student      : ${fullName.replace(/_/g, ' ')}`);
  lines.push(`Email        : ${app.user.email}`);
  lines.push(`Application  : #${app.id}`);
  lines.push(`Programme    : ${app.program?.name || '—'} (${app.program?.code || '—'})`);
  lines.push(`Cycle        : ${app.admissionCycle?.title || '—'}`);
  lines.push(`Status       : ${app.status}`);
  lines.push(`Submitted    : ${fmtDateTime(app.submittedAt)}`);
  lines.push(`Generated at : ${fmtDateTime(new Date())}`);
  lines.push('');
  lines.push('Contents of this ZIP');
  lines.push('--------------------');
  lines.push('• Admission_Form.html      — Printable admission form (open in browser → Print → Save as PDF)');
  lines.push('• Student_Photo/           — Passport-size student photograph');
  lines.push('• CNIC/                    — CNIC front & back scans');
  lines.push('• Matric/                  — Matric DMC, certificate, etc.');
  lines.push('• FSC/                     — FSc DMC, certificate, character certificate');
  lines.push('• FSC_Part1/               — Part-I DMC (if Result Awaited)');
  lines.push('• Additional_Documents/    — Migration certificate / Domicile / extras');
  lines.push('• Receipts/                — Fee deposit slips / payment receipts');
  lines.push('• Appeals/                 — Any supporting documents attached to appeals');
  lines.push('');
  lines.push('NOTE: This ZIP is generated dynamically — only documents that were');
  lines.push('actually uploaded by the student will appear in their respective folders.');
  return lines.join('\n');
}

// ============================================================
//  HTML BUILDER — A4 form, professional layout, embedded images
// ============================================================
function renderApplicationHtml(app, opts = {}) {
  const u = app.user;
  const p = u.profile || {};
  const eds = u.educations || [];
  const intv = app.interview;
  const me = app.meritEntry;
  const en = u.enrollment;

  const logoSrc = loadLogoDataUrl();
  const photoSrc = loadPhotoDataUrl(p);

  // ---- Personal info row helper
  const row = (label, value) => `
    <tr>
      <th class="lbl">${esc(label)}</th>
      <td class="val">${esc(dash(value))}</td>
    </tr>`;

  // ---- Education rows (use new FSC logic)
  const eduRows = eds.length === 0
    ? `<tr><td colspan="6" class="empty">No education records added.</td></tr>`
    : eds.map((ed) => {
        const isAwaiting = ed.resultStatus === 'Waiting';
        const marksCell = (isAwaiting && (ed.level === '12years' || ed.level === '11years'))
          ? `Part-I: ${dash(ed.partOneMarks)} / ${dash(ed.partOneTotalMarks)}`
          : `${dash(ed.marks)} / ${dash(ed.totalMarks)}` +
            (ed.grade ? ` <span class="muted">(${esc(ed.grade)})</span>` : '');
        const statusBadge = isAwaiting
          ? `<span class="pill pill-warn">Result Awaited</span>`
          : `<span class="pill pill-ok">Result Declared</span>`;
        const majorTxt = ed.major === 'Other' ? (ed.majorOther || 'Other') : (ed.major || '—');
        return `
          <tr>
            <td>${esc(LEVEL_LABEL[ed.level] || ed.level)}<div class="muted small">${esc(ed.degree || '')}</div></td>
            <td>${esc(majorTxt)}</td>
            <td>${esc(ed.board || '—')}</td>
            <td>${esc(ed.passingYear || '—')}</td>
            <td>${marksCell}</td>
            <td>${statusBadge}</td>
          </tr>`;
      }).join('');

  // ---- Document checklist (what was uploaded across the whole package).
  // Order matches the user-spec final PDF order:
  //   CNIC F → CNIC B → Photo → Father CNIC → Matric DMC/Cert → FSC DMC/Cert
  //   → Migration → Character Cert → Receipts → Additional
  // We dedup by type so stale rows don't appear twice.
  const allUploadedDocs = [];
  const seenDocChecklist = new Set();

  // Helper: push only if not duplicate of (section + label)
  const pushDoc = (section, label, file, sortKey) => {
    const key = `${section}::${label}`;
    if (seenDocChecklist.has(key)) return;
    seenDocChecklist.add(key);
    allUploadedDocs.push({ section, label, file, sortKey });
  };

  // 1) Identity (CNIC + Father CNIC) — explicit ordering.
  // DEDUP: only keep the NEWEST Document per type so stale rows from
  // before the upload-time dedup fix don't show up twice in the
  // checklist.
  const _userDocsRaw = (u.documents || []).slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const _seenUserDocTypes = new Set();
  const userDocs = [];
  for (const d of _userDocsRaw) {
    const t = (d.type || '').toLowerCase();
    if (!t) continue;
    if (_seenUserDocTypes.has(t)) continue;
    _seenUserDocTypes.add(t);
    userDocs.push(d);
  }
  userDocs.forEach((d) => {
    if (d.type === 'cnic_front') pushDoc('Identity', 'CNIC Front', d.fileName, 1);
    else if (d.type === 'cnic_back') pushDoc('Identity', 'CNIC Back', d.fileName, 2);
    else if (d.type === 'father_cnic') pushDoc('Identity', 'Father / Guardian CNIC', d.fileName, 3);
  });
  // Student photo
  if (p.photoPath) pushDoc('Identity', 'Student Photograph', path.basename(p.photoPath), 4);

  // 2) Education docs (Matric first, then FSC)
  const orderLevel = (lv) => lv === '10years' ? 10 : lv === '11years' ? 21 : lv === '12years' ? 22 : 99;
  const orderDocType = (dt) => ({
    dmc: 1, certificate: 2, char_cert: 3, provisional: 4,
    migration_cert: 5, part1_dmc: 1, additional: 9,
  })[dt] || 8;

  const eduCopy = [...eds].sort((a, b) => orderLevel(a.level) - orderLevel(b.level));
  eduCopy.forEach((ed) => {
    const levelSort = orderLevel(ed.level);
    const sortedDocs = [...(ed.documents || [])].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    const seenPerLevel = new Set();
    sortedDocs.forEach((d) => {
      if (seenPerLevel.has(d.docType)) return;
      seenPerLevel.add(d.docType);
      pushDoc(LEVEL_LABEL[ed.level] || ed.level, docTypeLabel(d.docType), d.fileName,
        levelSort + orderDocType(d.docType) / 10);
    });
  });

  // 3) Receipts (processing fee + admission fee)
  if (app.feeReceiptPath) pushDoc('Receipts', 'Processing Fee Receipt', path.basename(app.feeReceiptPath), 90);
  if (app.feePayment?.receiptPath) pushDoc('Receipts', 'Admission Fee Receipt', path.basename(app.feePayment.receiptPath), 91);
  userDocs.forEach((d) => {
    if (d.type === 'application_fee_receipt' || d.type === 'fee_receipt') {
      pushDoc('Receipts', 'Processing Fee Receipt', d.fileName, 90);
    } else if (d.type === 'admission_fee_receipt') {
      pushDoc('Receipts', 'Admission Fee Receipt', d.fileName, 91);
    }
  });

  // 4) Any other Document-table extras
  userDocs.forEach((d) => {
    if (['cnic_front', 'cnic_back', 'father_cnic', 'guardian_cnic', 'photo',
         'application_fee_receipt', 'fee_receipt', 'admission_fee_receipt',
         'appeal_proof'].includes(d.type)) return;
    pushDoc('Additional', docTypeLabel(d.type), d.fileName, 99);
  });

  // Final sort by computed sortKey so the checklist mirrors the file order
  allUploadedDocs.sort((a, b) => (a.sortKey || 99) - (b.sortKey || 99));

  const docsRows = allUploadedDocs.length === 0
    ? `<tr><td colspan="3" class="empty">No documents uploaded yet.</td></tr>`
    : allUploadedDocs.map((d, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(d.section)}</td>
          <td>${esc(d.label)}<div class="muted small">${esc(d.file || '')}</div></td>
        </tr>`).join('');

  // ---- Timeline list
  const timelineHtml = (app.statusEvents || []).map(ev => `
    <li>
      <strong>${esc((ev.status || '').replace(/_/g, ' '))}</strong>
      ${ev.actorRole ? `<span class="muted small"> · by ${esc(ev.actorRole)}</span>` : ''}
      <span class="muted small"> · ${fmtDateTime(ev.createdAt)}</span>
      ${ev.remarks ? `<div class="muted">${esc(ev.remarks)}</div>` : ''}
    </li>`).join('');

  // ---- Appeals list
  const appealsHtml = (app.appeals || []).map(a => `
    <li>
      <strong>${esc(a.subject)}</strong>
      <span class="pill pill-${(a.status || '').toLowerCase()}">${esc(a.status)}</span>
      <div class="muted small">${esc((a.appealType || '').replace(/_/g, ' '))} · ${fmtDateTime(a.createdAt)}</div>
      <div>${esc(a.message)}</div>
      ${a.adminResponse ? `<div class="resp"><strong>Response:</strong> ${esc(a.adminResponse)}</div>` : ''}
    </li>`).join('');

  const hideActions = !!opts.hideActions;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Admission Form — Application #${app.id} — ${esc(p.firstName || '')} ${esc(p.lastName || '')}</title>
<style>
  /* ============================================================
     PROFESSIONAL A4 ADMISSION FORM — clean, aligned, print-safe
     ============================================================ */
  @page { size: A4; margin: 12mm 12mm 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body { padding: 0; margin: 0; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #0f172a;
    background: #f1f5f9;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    background: #fff;
    max-width: 210mm;
    margin: 14px auto;
    padding: 18mm 14mm 18mm 14mm;
    box-shadow: 0 2px 14px rgba(15,23,42,.08);
  }
  /* --- ACTION BAR (hidden in print) --- */
  .actions {
    max-width: 210mm; margin: 14px auto 0; padding: 0 14mm;
    display: flex; gap: 8px; flex-wrap: wrap;
  }
  .actions button, .actions a {
    background: #1e3a8a; color: #fff; border: 0;
    padding: 8px 16px; border-radius: 6px; cursor: pointer;
    font-size: 13px; text-decoration: none; display: inline-block;
  }
  .actions .secondary { background: #475569; }
  .actions .success { background: #047857; }

  /* --- HEADER --- */
  .form-header {
    display: grid;
    grid-template-columns: 96px 1fr 110px;
    align-items: center;
    gap: 14px;
    border-bottom: 3px solid #1e3a8a;
    padding-bottom: 10px;
    margin-bottom: 4px;
  }
  .form-header .logo-box {
    width: 96px; height: 96px;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid #e2e8f0; border-radius: 50%;
    overflow: hidden; background: #fff;
  }
  .form-header .logo-box img {
    width: 100%; height: 100%; object-fit: contain;
  }
  .form-header .logo-fallback {
    width: 100%; height: 100%; display: flex; align-items: center;
    justify-content: center; font-size: 11px; color: #94a3b8; text-align: center;
    padding: 6px;
  }
  .form-header .title {
    text-align: center;
  }
  .form-header h1 {
    font-size: 17px; color: #1e3a8a; margin: 0 0 4px; letter-spacing: .3px;
    font-weight: 700;
  }
  .form-header h2.sub {
    font-size: 12.5px; color: #1e293b; margin: 0; font-weight: 600;
    border: none; padding: 0; letter-spacing: .2px;
    background: none;
  }
  .form-header .tagline {
    font-size: 10.5px; color: #64748b; margin-top: 3px;
  }
  .form-header .photo-box {
    width: 110px; height: 132px;
    border: 1.5px solid #1e3a8a;
    background: #fff;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    border-radius: 4px;
  }
  .form-header .photo-box img {
    width: 100%; height: 100%; object-fit: cover;
  }
  .form-header .photo-fallback {
    font-size: 10px; color: #94a3b8; text-align: center; padding: 6px;
    line-height: 1.3;
  }

  /* --- META STRIP --- */
  .meta-strip {
    margin: 8px 0 16px;
    display: flex; flex-wrap: wrap; justify-content: space-between;
    gap: 6px; font-size: 11px; color: #475569;
    border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px;
  }
  .meta-strip .badge-status {
    display: inline-block; padding: 3px 10px; background: #1e40af;
    color: #fff; border-radius: 4px; font-weight: 600; font-size: 10.5px;
    letter-spacing: .3px;
  }

  /* --- SECTION HEADING --- */
  h2.section {
    font-size: 12.5px;
    color: #fff;
    background: linear-gradient(90deg, #1e3a8a 0%, #2563eb 100%);
    padding: 6px 10px;
    margin: 14px 0 8px;
    text-transform: uppercase;
    letter-spacing: .6px;
    border-left: 4px solid #f59e0b;
    page-break-after: avoid; break-after: avoid;
  }
  h3.sub-section {
    font-size: 11.5px;
    color: #1e3a8a;
    margin: 10px 0 4px;
    padding-bottom: 3px;
    border-bottom: 1px solid #e2e8f0;
    page-break-after: avoid; break-after: avoid;
  }

  /* --- TABLES (key/value) --- */
  table.kv {
    width: 100%; border-collapse: collapse; font-size: 11px;
    margin-bottom: 6px; table-layout: fixed;
    page-break-inside: avoid; break-inside: avoid;
  }
  table.kv th, table.kv td {
    border: 1px solid #e2e8f0;
    padding: 5px 8px;
    vertical-align: top;
    text-align: left;
    word-wrap: break-word; overflow-wrap: anywhere;
  }
  table.kv th.lbl {
    background: #f1f5f9;
    color: #1e293b;
    font-weight: 600;
    width: 38%;
  }
  table.kv td.val { background: #fff; color: #0f172a; }

  /* Two-column key/value (compact) */
  .kv-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 12px;
  }
  .kv-2col table.kv { margin-bottom: 0; }

  /* --- DATA TABLE (education / docs) --- */
  table.data {
    width: 100%; border-collapse: collapse; font-size: 11px;
    margin: 4px 0 8px;
    page-break-inside: avoid; break-inside: avoid;
  }
  table.data th, table.data td {
    border: 1px solid #e2e8f0;
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
  }
  table.data th {
    background: #1e3a8a; color: #fff;
    font-weight: 600; font-size: 10.5px;
    text-transform: uppercase; letter-spacing: .4px;
  }
  table.data tr:nth-child(even) td { background: #f8fafc; }
  table.data td.empty { text-align: center; color: #94a3b8; font-style: italic; padding: 14px; }

  /* --- PILLS --- */
  .pill {
    display: inline-block; padding: 2px 8px; font-size: 10px;
    border-radius: 10px; font-weight: 600; letter-spacing: .3px;
    border: 1px solid transparent;
  }
  .pill-ok { background: #dcfce7; color: #166534; border-color: #86efac; }
  .pill-warn, .pill-pending { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
  .pill-accepted { background: #dbeafe; color: #1e40af; border-color: #93c5fd; }
  .pill-rejected { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }

  /* --- MISC --- */
  .muted { color: #64748b; }
  .small { font-size: 10px; }
  ul.timeline, ul.appeals {
    list-style: none; padding: 0; margin: 0;
    font-size: 11px;
  }
  ul.timeline li {
    padding: 6px 0 6px 16px;
    border-bottom: 1px dashed #e2e8f0;
    position: relative;
    page-break-inside: avoid; break-inside: avoid;
  }
  ul.timeline li::before {
    content: ''; position: absolute; left: 0; top: 12px;
    width: 8px; height: 8px; border-radius: 50%;
    background: #1e3a8a;
  }
  ul.appeals li {
    background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;
    padding: 8px 10px; margin-bottom: 6px;
    page-break-inside: avoid; break-inside: avoid;
  }
  ul.appeals .resp {
    margin-top: 4px; padding: 4px 8px; background: #ecfdf5;
    border-left: 3px solid #10b981; border-radius: 3px;
    font-size: 10.5px;
  }

  /* --- DECLARATION / SIGNATURE --- */
  .declaration {
    margin-top: 12px; padding: 8px 12px;
    background: #f8fafc; border-left: 4px solid #1e3a8a;
    font-size: 11px; color: #334155;
    page-break-inside: avoid; break-inside: avoid;
  }
  .signatures {
    display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
    margin-top: 18px;
    page-break-inside: avoid; break-inside: avoid;
  }
  .sig-box {
    border-top: 1.5px solid #334155;
    padding-top: 6px;
    text-align: center;
    font-size: 11px;
    color: #475569;
  }
  .sig-box strong { color: #1e3a8a; }

  /* --- FOOTER --- */
  .form-footer {
    margin-top: 18px; border-top: 2px solid #1e3a8a;
    padding-top: 8px;
    display: flex; justify-content: space-between;
    font-size: 10px; color: #64748b;
  }

  /* --- PRINT OVERRIDES --- */
  @media print {
    body { background: #fff; }
    .actions { display: none !important; }
    .page {
      box-shadow: none;
      margin: 0;
      max-width: none;
      padding: 0;
    }
    h2.section { page-break-after: avoid; }
    table, ul.timeline li, ul.appeals li { page-break-inside: avoid; }
    .kv-2col { display: grid; }
  }

  /* --- SCREEN (small viewports) --- */
  @media (max-width: 700px) {
    .form-header {
      grid-template-columns: 70px 1fr 84px;
      gap: 8px;
    }
    .form-header .logo-box { width: 70px; height: 70px; }
    .form-header .photo-box { width: 84px; height: 100px; }
    .form-header h1 { font-size: 14px; }
    .kv-2col { grid-template-columns: 1fr; }
    .page { padding: 12mm 8mm; }
  }
</style>
</head>
<body>

${hideActions ? '' : `
  <div class="actions">
    <button onclick="window.print()">🖨 Print / Save as PDF</button>
    <a class="success" href="/admission-package/${app.id}?token=${esc(loadTokenFromLocation())}" id="zipLink">⬇ Download ZIP Package</a>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>
  <script>
    // Inject token into the ZIP link from URL (?token=…)
    (function(){
      try {
        var qs = new URLSearchParams(window.location.search);
        var t = qs.get('token');
        var link = document.getElementById('zipLink');
        if (link && t) link.href = '/admission-package/${app.id}?token=' + encodeURIComponent(t);
      } catch(e) {}
    })();
  </script>
`}

<div class="page">

  <!-- ============ HEADER ============ -->
  <div class="form-header">
    <div class="logo-box">
      ${logoSrc
        ? `<img src="${logoSrc}" alt="AUST Logo" />`
        : `<div class="logo-fallback"><strong>AUST</strong><br/>Logo</div>`}
    </div>
    <div class="title">
      <h1>ABBOTTABAD UNIVERSITY OF SCIENCE &amp; TECHNOLOGY</h1>
      <h2 class="sub">Open &amp; Distance Learning (ODL) — Admission Application Form</h2>
      <div class="tagline">Application&nbsp;ID: <strong>#${app.id}</strong> &nbsp;·&nbsp; Submitted: ${fmtDate(app.submittedAt)} &nbsp;·&nbsp; Cycle: ${esc(app.admissionCycle?.title || '—')}</div>
    </div>
    <div class="photo-box">
      ${photoSrc
        ? `<img src="${photoSrc}" alt="Student Photo" />`
        : `<div class="photo-fallback">Affix recent passport-size photograph</div>`}
    </div>
  </div>

  <!-- ============ META STRIP ============ -->
  <div class="meta-strip">
    <div><strong>Programme:</strong> ${esc(app.program?.name || '—')} (${esc(app.program?.code || '—')})</div>
    <div><strong>Status:</strong> <span class="badge-status">${esc((app.status || '').replace(/_/g, ' '))}</span></div>
    <div><strong>Result:</strong> ${app.resultStatus === 'Waiting' ? '<span class="pill pill-warn">Awaited</span>' : '<span class="pill pill-ok">Declared</span>'}</div>
  </div>

  <!-- ============ PROGRAMME & CYCLE ============ -->
  <h2 class="section">A. Programme &amp; Cycle</h2>
  <div class="kv-2col">
    <table class="kv">
      <tbody>
        ${row('Programme', `${app.program?.name || '—'} (${app.program?.code || '—'})`)}
        ${row('Duration', `${app.program?.duration || '—'} · ${app.program?.semesters || '—'} semesters`)}
      </tbody>
    </table>
    <table class="kv">
      <tbody>
        ${row('Admission Cycle', app.admissionCycle?.title)}
        ${row('Period', `${app.admissionCycle?.startDate || '—'} → ${app.admissionCycle?.endDate || '—'}`)}
      </tbody>
    </table>
  </div>

  <!-- ============ PERSONAL INFORMATION ============ -->
  <h2 class="section">B. Personal Information</h2>
  <div class="kv-2col">
    <table class="kv">
      <tbody>
        ${row('Full Name', `${p.firstName || ''} ${p.lastName || ''}`.trim() || '—')}
        ${row('Father\'s Name', p.fatherName)}
        ${row('CNIC', p.cnic)}
        ${row('Father\'s CNIC', p.fatherCnic)}
        ${row('Date of Birth', p.dateOfBirth)}
        ${row('Gender', p.gender)}
        ${row('Marital Status', p.maritalStatus)}
        ${row('Blood Group', p.bloodGroup)}
        ${row('Religion', p.religion)}
      </tbody>
    </table>
    <table class="kv">
      <tbody>
        ${row('Email', u.email)}
        ${row('Phone', p.phone)}
        ${row('WhatsApp', p.whatsappNumber)}
        ${row('Guardian Phone', p.guardianPhone)}
        ${row('Nationality', p.nationality)}
        ${row('Country of Residence', p.countryOfResidence)}
        ${row('Occupation', p.occupation)}
        ${row('Domicile District', p.domicileDistrict)}
        ${row('Domicile Province', p.domicileProvince)}
      </tbody>
    </table>
  </div>

  <!-- ============ ADDRESS ============ -->
  <h2 class="section">C. Address</h2>
  <h3 class="sub-section">Present Address</h3>
  <table class="kv">
    <tbody>
      ${row('Street / House', p.presStreet || p.address)}
      ${row('Village / Mohalla', p.presVillage)}
      ${row('Tehsil', p.presTehsil)}
      ${row('District', p.presDistrict || p.district)}
      ${row('Postal Code', p.presPostalCode)}
    </tbody>
  </table>
  <h3 class="sub-section">Permanent Address ${p.permSameAsPresent ? '<span class="pill pill-accepted">Same as Present</span>' : ''}</h3>
  <table class="kv">
    <tbody>
      ${row('Street / House', p.permStreet)}
      ${row('Village / Mohalla', p.permVillage)}
      ${row('Tehsil', p.permTehsil)}
      ${row('District', p.permDistrict)}
      ${row('Postal Code', p.permPostalCode)}
    </tbody>
  </table>

  <!-- ============ EDUCATION ============ -->
  <h2 class="section">D. Education Records</h2>
  <table class="data">
    <thead>
      <tr>
        <th style="width:18%">Level</th>
        <th style="width:18%">Major / Group</th>
        <th style="width:16%">Board</th>
        <th style="width:10%">Year</th>
        <th style="width:20%">Marks</th>
        <th style="width:18%">Result</th>
      </tr>
    </thead>
    <tbody>${eduRows}</tbody>
  </table>

  <!-- ============ PAYMENT ============ -->
  <h2 class="section">E. Payment Information</h2>
  <div class="kv-2col">
    <table class="kv">
      <tbody>
        ${row('Processing Fee', `PKR ${app.admissionCycle?.applicationProcessingFee ?? '—'}`)}
        ${row('Method', app.procFeeMethod)}
        ${row('Transaction ID', app.procFeeTxnId)}
        ${row('Receipt', app.feeReceiptPath ? 'Uploaded' : 'Not uploaded')}
      </tbody>
    </table>
    <table class="kv">
      <tbody>
        ${app.feePayment ? `
          ${row('Admission Fee (PKR)', app.feePayment.amount)}
          ${row('Fee Status', app.feePayment.status)}
          ${row('Fee Method', app.feePayment.paymentMethod)}
          ${row('Paid At', app.feePayment.paidAt ? fmtDate(app.feePayment.paidAt) : '—')}
        ` : `
          ${row('Admission Fee', 'Not yet generated')}
          ${row('Fee Status', '—')}
          ${row('Fee Method', '—')}
          ${row('Paid At', '—')}
        `}
      </tbody>
    </table>
  </div>

  ${intv ? `
    <!-- ============ INTERVIEW ============ -->
    <h2 class="section">F. Interview</h2>
    <div class="kv-2col">
      <table class="kv">
        <tbody>
          ${row('Date', intv.scheduledDate)}
          ${row('Time', intv.scheduledTime)}
          ${row('Venue', intv.venue)}
          ${row('Meeting Link', intv.meetingLink)}
        </tbody>
      </table>
      <table class="kv">
        <tbody>
          ${row('Status', intv.status)}
          ${row('Decision', intv.decision)}
          ${row('Marks', intv.marks != null ? `${intv.marks} / 100` : '—')}
          ${row('Remarks', intv.remarks)}
        </tbody>
      </table>
    </div>
  ` : ''}

  ${me ? `
    <!-- ============ MERIT ============ -->
    <h2 class="section">G. Merit Calculation</h2>
    <div class="kv-2col">
      <table class="kv">
        <tbody>
          ${row('Matric %', me.matricPercent != null ? me.matricPercent.toFixed(2) : '—')}
          ${row('FSc %', me.fscPercent != null ? me.fscPercent.toFixed(2) : '—')}
          ${row('Interview Marks', me.interviewMarks != null ? me.interviewMarks : '—')}
        </tbody>
      </table>
      <table class="kv">
        <tbody>
          ${row('Total Merit', me.totalMerit != null ? me.totalMerit.toFixed(2) : '—')}
          ${row('Rank', me.rank ?? '—')}
          ${row('Finalised', me.isFinalized ? 'Yes' : 'No')}
        </tbody>
      </table>
    </div>
  ` : ''}

  ${en ? `
    <!-- ============ ENROLLMENT ============ -->
    <h2 class="section">H. Enrollment</h2>
    <div class="kv-2col">
      <table class="kv">
        <tbody>
          ${row('Roll Number', en.rollNumber)}
          ${row('Registration Number', en.registrationNumber)}
        </tbody>
      </table>
      <table class="kv">
        <tbody>
          ${row('Status', en.status)}
          ${row('Enrolled At', en.enrolledAt ? fmtDate(en.enrolledAt) : '—')}
        </tbody>
      </table>
    </div>
  ` : ''}

  <!-- ============ DOCUMENTS UPLOADED ============ -->
  <h2 class="section">I. Documents Submitted</h2>
  <table class="data">
    <thead>
      <tr>
        <th style="width:8%">#</th>
        <th style="width:34%">Category</th>
        <th>Document</th>
      </tr>
    </thead>
    <tbody>${docsRows}</tbody>
  </table>

  ${app.rejectionReason ? `
    <!-- ============ DIRECTOR DECISION ============ -->
    <h2 class="section">J. Director's Decision</h2>
    <div style="padding:10px 12px;background:#fef2f2;border-left:4px solid #dc2626;font-size:11.5px;">
      <strong>Rejection Reason:</strong> ${esc(app.rejectionReason)}
    </div>
  ` : ''}

  ${(app.appeals && app.appeals.length > 0) ? `
    <!-- ============ APPEALS ============ -->
    <h2 class="section">K. Appeals</h2>
    <ul class="appeals">${appealsHtml}</ul>
  ` : ''}

  <!-- ============ STATUS TIMELINE ============ -->
  <h2 class="section">L. Status Timeline</h2>
  <ul class="timeline">${timelineHtml || '<li class="muted">No events recorded yet.</li>'}</ul>

  <!-- ============ DECLARATION ============ -->
  <h2 class="section">M. Applicant's Declaration</h2>
  <div class="declaration">
    I solemnly declare that the information furnished above is true and correct to the best of my
    knowledge. I understand that any wrong / misleading information may result in cancellation of
    my admission at any stage and forfeiture of fees deposited. I will abide by all rules and
    regulations of the University.
  </div>

  <div class="signatures">
    <div class="sig-box"><strong>Applicant's Signature</strong><br/><span class="small">${esc(`${p.firstName || ''} ${p.lastName || ''}`.trim() || '—')}</span></div>
    <div class="sig-box"><strong>Date</strong><br/><span class="small">${fmtDate(app.submittedAt)}</span></div>
  </div>

  <div class="form-footer">
    <div>AUST · Open &amp; Distance Learning · Admission Portal</div>
    <div>Generated: ${fmtDateTime(new Date())}</div>
    <div>Application&nbsp;#${app.id}</div>
  </div>

</div>
</body>
</html>`;
}

// Used by the inline action-bar script — we just return a sentinel here,
// the real value is injected client-side from `location.search`.
function loadTokenFromLocation() {
  return '';
}

module.exports = router;

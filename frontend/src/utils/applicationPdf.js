/**
 * Complete Application PDF builder — Phase 6.
 *
 * Strict output structure:
 *   PAGE 1 — AUST admission form front page (matches attached
 *            AUST_Admission_Form.pdf template: header band with logo and
 *            university name, tick-boxes for program/semester/year,
 *            departments priority table, personal information grid,
 *            academic qualifications table, addresses table, applicant
 *            photo box, recommendation/receipt footer block).
 *   PAGE 2 — Certificate / declaration (numbered i-vi clauses, attested
 *            copies list, conditions for admission, signature blocks)
 *            mirroring the attached back page exactly.
 *   PAGE 3+ — Uploaded student documents, each appearing EXACTLY ONCE,
 *            in fixed order, with NO cover pages, NO 'Page X of Y',
 *            NO system-generated headers / footers / titles.
 *
 * Document order (de-duplicated):
 *   1. Student CNIC Front
 *   2. Student CNIC Back
 *   3. Student Profile Picture
 *   4. Father / Guardian CNIC (front, then back if present)
 *   5. Matric DMC
 *   6. Matric Certificate
 *   7. FSc Part-I DMC
 *   8. FSc Part-II DMC
 *   9. FSc Certificate
 *  10. Character Certificate
 *  11. Fee Receipt(s)
 *  12. Additional uploaded documents
 *
 * Pure client-side — uses pdf-lib + /files/preview/:id and
 * /files/preview-path. Never touches backend logic.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import api from './api';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const safe = (v) => (v === null || v === undefined || v === '' ? '' : String(v));
const fmtDate = (d) => {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(d); }
};
const dobParts = (d) => {
  if (!d) return { day: '', month: '', year: '' };
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return { day: '', month: '', year: '' };
    return {
      day: String(dt.getDate()).padStart(2, '0'),
      month: String(dt.getMonth() + 1).padStart(2, '0'),
      year: String(dt.getFullYear()),
    };
  } catch { return { day: '', month: '', year: '' }; }
};
const sanitizeFilename = (s) =>
  (s || 'student').toString().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');

const wrapText = (text, font, size, maxWidth) => {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    const width = font.widthOfTextAtSize(test, size);
    if (width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
};

// Fetch document blob via /files/preview/:id
// CRITICAL: `scope` MUST be passed ('user' for Document table — photos,
// CNIC, fee receipts; 'education' for EducationDocument table — DMC,
// certificate, char_cert, migration_cert). Without scope, the backend
// would fall through to legacy resolution and could serve the WRONG
// file when ids collide across tables (both tables have independent
// autoincrement sequences so Document.id=5 and EducationDocument.id=5
// are valid simultaneously).
const fetchDocBlob = async (documentId, scope) => {
  try {
    const q = scope ? `?scope=${encodeURIComponent(scope)}` : '';
    const res = await api.get(`/files/preview/${documentId}${q}`, { responseType: 'blob' });
    return res.data;
  } catch { return null; }
};

// Fetch document blob via /files/preview-path?p=/uploads/...
const fetchPathBlob = async (filePath) => {
  try {
    const res = await api.get(`/files/preview-path?p=${encodeURIComponent(filePath)}`, { responseType: 'blob' });
    return res.data;
  } catch { return null; }
};

// Detect real image kind from the first bytes of an ArrayBuffer.
// CRITICAL: many "logo.png" files in the wild are actually JPEG bytes
// (file was renamed but never re-encoded). pdf-lib's embedPng() refuses
// JPEG bytes which is the #1 reason the AUST logo silently disappears
// from generated PDFs. We must always pick the embedder based on the
// real bytes, not the filename.
const sniffArrayBufferKind = (ab) => {
  if (!ab || ab.byteLength < 4) return 'unknown';
  const v = new Uint8Array(ab);
  // JPEG: FF D8 FF
  if (v[0] === 0xFF && v[1] === 0xD8 && v[2] === 0xFF) return 'jpg';
  // PNG: 89 50 4E 47
  if (v[0] === 0x89 && v[1] === 0x50 && v[2] === 0x4E && v[3] === 0x47) return 'png';
  // GIF87a / GIF89a → treat as jpg (pdf-lib can't embed gif, jpg fallback fails)
  return 'unknown';
};

// Load AUST logo for the PDF header. Tries the canonical path first,
// then a few common alternates, and returns { bytes, kind } where
// `kind` is 'png' or 'jpg' based on a real byte sniff — so the caller
// can pick the right embedder (embedPng vs embedJpg).
const loadLogoBytes = async () => {
  const candidates = [
    '/assets/aust-logo.png',
    '/assets/aust-logo.jpg',
    '/assets/aust-logo.jpeg',
    '/assets/logo.png',
    '/assets/logo.jpg',
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) continue;
      const bytes = await r.arrayBuffer();
      const kind = sniffArrayBufferKind(bytes);
      if (kind === 'unknown') continue;
      return { bytes, kind };
    } catch { /* try next */ }
  }
  return null;
};

const detectImageKind = (mimeType, fileName) => {
  const m = (mimeType || '').toLowerCase();
  const n = (fileName || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg') || /\.(jpe?g|jfif)$/.test(n)) return 'jpg';
  if (m.includes('png')  || /\.png$/.test(n))  return 'png';
  if (m.includes('pdf')  || /\.pdf$/.test(n))  return 'pdf';
  return 'unknown';
};

// Embed PDF/image blob into the output document — no titles, no cover pages.
const appendBlobAsPages = async (pdfDoc, blob, mimeType, fileName) => {
  if (!blob) return false;
  const ab = await blob.arrayBuffer();
  const kind = detectImageKind(mimeType, fileName);
  try {
    if (kind === 'pdf') {
      const src = await PDFDocument.load(ab, { ignoreEncryption: true });
      const copied = await pdfDoc.copyPages(src, src.getPageIndices());
      copied.forEach((pg) => pdfDoc.addPage(pg));
      return true;
    }
    if (kind === 'jpg' || kind === 'png') {
      const img = kind === 'jpg' ? await pdfDoc.embedJpg(ab) : await pdfDoc.embedPng(ab);
      const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
      const margin = 36;
      const maxW = page.getWidth()  - margin * 2;
      const maxH = page.getHeight() - margin * 2;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width  * ratio;
      const h = img.height * ratio;
      const x = (page.getWidth()  - w) / 2;
      const y = (page.getHeight() - h) / 2;
      page.drawImage(img, { x, y, width: w, height: h });
      return true;
    }
  } catch { /* swallow */ }
  return false;
};

// ----------------------------------------------------------------------------
// Brand colours
// ----------------------------------------------------------------------------
const COLORS = {
  ink:     rgb(0.07, 0.10, 0.18),   // body text
  thin:    rgb(0.40, 0.45, 0.52),   // muted helper text
  border:  rgb(0.20, 0.24, 0.32),   // form table borders
  borderL: rgb(0.55, 0.60, 0.66),   // light inner border
  fill:    rgb(0.93, 0.95, 0.97),   // light row fill
  navy:    rgb(0.10, 0.15, 0.27),   // university accent
};

// ----------------------------------------------------------------------------
// Form painter
// ----------------------------------------------------------------------------
class FormPainter {
  constructor(pdfDoc, fonts, logoImg, photoImg) {
    this.pdf   = pdfDoc;
    this.fonts = fonts;     // { reg, bold }
    this.logo  = logoImg;
    this.photo = photoImg;
    this.page  = null;
    this.W     = 595.28;
    this.H     = 841.89;
    this.M     = 28;        // page margin (a bit tighter so the form fits)
  }

  newPage() {
    this.page = this.pdf.addPage([this.W, this.H]);
    return this.page;
  }

  // Generic primitives -------------------------------------------------------

  line(x1, y1, x2, y2, thickness = 0.6, color = COLORS.border) {
    this.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
  }

  rect(x, y, w, h, opts = {}) {
    this.page.drawRectangle({
      x, y, width: w, height: h,
      borderColor: opts.borderColor || COLORS.border,
      borderWidth: opts.borderWidth ?? 0.6,
      color: opts.fill || undefined,
    });
  }

  text(s, x, y, opts = {}) {
    const font = opts.bold ? this.fonts.bold : this.fonts.reg;
    const size = opts.size || 9;
    this.page.drawText(String(s || ''), {
      x, y, size, font, color: opts.color || COLORS.ink,
    });
  }

  // Centered text within [x, x+w]
  textC(s, x, y, w, opts = {}) {
    const font = opts.bold ? this.fonts.bold : this.fonts.reg;
    const size = opts.size || 9;
    const tw = font.widthOfTextAtSize(String(s || ''), size);
    this.page.drawText(String(s || ''), {
      x: x + (w - tw) / 2, y,
      size, font, color: opts.color || COLORS.ink,
    });
  }

  // Empty tick-box (8x8 by default).
  tickBox(x, y, ticked = false, size = 8) {
    this.rect(x, y, size, size, { borderWidth: 0.7, borderColor: COLORS.border });
    if (ticked) {
      // Draw a check mark (two strokes)
      this.line(x + 1.2, y + size / 2,     x + size / 2 - 0.5, y + 1.5, 1.1, COLORS.navy);
      this.line(x + size / 2 - 0.5, y + 1.5, x + size - 1, y + size - 1, 1.1, COLORS.navy);
    }
  }

  // Labelled tick-box: [☐] Label
  tickWithLabel(label, x, y, ticked = false, opts = {}) {
    const size = opts.size || 8;
    this.tickBox(x, y, ticked, size);
    this.text(label, x + size + 4, y, { size: opts.fontSize || 8.5, bold: opts.bold });
  }

  // Header band ------------------------------------------------------------
  drawHeader() {
    // Header occupies the top ~78pt — left logo, centered title.
    const headerH = 78;
    const top = this.H - this.M;
    const left = this.M;
    const right = this.W - this.M;

    // Outer border for the whole form (page-level)
    this.rect(left, this.M, right - left, top - this.M, { borderWidth: 0.8, borderColor: COLORS.border });

    // Logo box (left)
    const logoW = 60, logoH = 60;
    const logoX = left + 6;
    const logoY = top - logoH - 8;
    if (this.logo) {
      // Preserve aspect.
      const r = Math.min(logoW / this.logo.width, logoH / this.logo.height);
      const w = this.logo.width * r;
      const h = this.logo.height * r;
      this.page.drawImage(this.logo, {
        x: logoX + (logoW - w) / 2,
        y: logoY + (logoH - h) / 2,
        width: w, height: h,
      });
    } else {
      // Fallback "AUST LOGO" placeholder.
      this.text('AUST', logoX + 18, logoY + logoH - 22, { bold: true, size: 12, color: COLORS.navy });
      this.text('LOGO', logoX + 18, logoY + logoH - 38, { bold: true, size: 10, color: COLORS.thin });
    }

    // Title block (centered, takes the middle ~70% of the header width)
    const titleX = logoX + logoW + 6;
    const titleW = right - titleX - 110;   // leave room for "Attach photos" box on the right
    this.textC('ABBOTTABAD UNIVERSITY OF', titleX, top - 22, titleW, { bold: true, size: 14, color: COLORS.navy });
    this.textC('SCIENCE & TECHNOLOGY',       titleX, top - 38, titleW, { bold: true, size: 14, color: COLORS.navy });
    this.textC('(Havelian, KPK, Pakistan)',  titleX, top - 52, titleW, { size: 8.5, color: COLORS.thin });
    this.textC('ADMISSION FORM',             titleX, top - 66, titleW, { bold: true, size: 11, color: COLORS.ink });

    // ── Photo box (TOP-RIGHT corner, clearly bordered) ──────────────
    // FIX 1.1 — the photo MUST sit in a bordered box in the top-right
    // and must NEVER overlap the form text. We give it its own padded
    // box and ALWAYS push the content cursor below the LOWER of the
    // header band and the photo box.
    const phoW = 92, phoH = 108;
    const phoX = right - phoW - 6;
    const phoY = top - phoH - 4;
    // Double-stroke bordered box for a crisp, print-ready frame.
    this.rect(phoX, phoY, phoW, phoH, { borderWidth: 1.2, borderColor: COLORS.navy });
    this.rect(phoX + 2, phoY + 2, phoW - 4, phoH - 4, { borderWidth: 0.5, borderColor: COLORS.border });
    if (this.photo) {
      const pad = 4;
      const r = Math.min((phoW - 2 * pad) / this.photo.width, (phoH - 2 * pad) / this.photo.height);
      const w = this.photo.width * r;
      const h = this.photo.height * r;
      this.page.drawImage(this.photo, {
        x: phoX + (phoW - w) / 2,
        y: phoY + (phoH - h) / 2,
        width: w, height: h,
      });
    } else {
      this.textC('Affix recent',     phoX, phoY + phoH - 34, phoW, { size: 7.5, color: COLORS.thin });
      this.textC('passport-size',    phoX, phoY + phoH - 46, phoW, { size: 7.5, color: COLORS.thin });
      this.textC('photograph',       phoX, phoY + phoH - 58, phoW, { size: 7.5, color: COLORS.thin });
    }

    // Cursor for content area — start below the LOWEST of header / photo
    // box so the first content section can never overlap the photo.
    this._photoBottomY = phoY;
    const headerBottom = top - headerH - 6;
    this.y = Math.min(headerBottom, phoY - 10);
  }

  // ---- Sub-section helpers ----------------------------------------------

  /**
   * Outlined row used for the "Tick Your Option / Semester / Year / Sr #" strip
   * directly below the header.  Returns the bottom y.
   */
  drawTopOptionsStrip(app) {
    const left = this.M;
    const right = this.W - this.M;
    const stripY = this.y - 70;
    const stripH = 64;
    // Outer rectangle
    this.rect(left, stripY, right - left, stripH);

    // Sr #
    const srW = 70;
    this.line(left + srW, stripY, left + srW, stripY + stripH);
    this.text('Sr #', left + 6, stripY + stripH - 14, { bold: true, size: 8 });
    this.text(String(app.id || ''), left + 6, stripY + stripH - 32, { bold: true, size: 14, color: COLORS.navy });

    // "Tick Your Option" column
    const tickColX = left + srW;
    const tickColW = 180;
    this.text('Tick Your Option:', tickColX + 8, stripY + stripH - 12, { bold: true, size: 8 });
    const progName = (app.program?.name || '').toLowerCase();
    const isAdcs   = /(adcs|associate)/.test(progName);
    const isBs     = /bs|bachelor/.test(progName);
    const isPharm  = /pharm/.test(progName);
    const isDip    = /diploma|adcs|associate/.test(progName);
    // Three checkbox lines
    this.tickWithLabel('BS',               tickColX + 8,  stripY + stripH - 26, isBs);
    this.tickWithLabel('Pharm-D',          tickColX + 8,  stripY + stripH - 40, isPharm);
    this.tickWithLabel('Associate Degree', tickColX + 8,  stripY + stripH - 54, isAdcs);
    this.line(tickColX + tickColW, stripY, tickColX + tickColW, stripY + stripH);

    // Semester / Year column
    const semX = tickColX + tickColW;
    const semW = 150;
    this.text('Semester', semX + 8, stripY + stripH - 12, { bold: true, size: 8 });
    // Try to detect spring/fall from admission cycle title.
    const cyc = (app.admissionCycle?.title || '').toLowerCase();
    const isSpring = /spring/.test(cyc);
    const isFall   = /fall|autumn/.test(cyc);
    this.tickWithLabel('Spring',      semX + 8, stripY + stripH - 26, isSpring);
    this.tickWithLabel('Autumn/Fall', semX + 8, stripY + stripH - 40, isFall);
    // Year extraction
    const yrMatch = (app.admissionCycle?.title || '').match(/(20\d{2})/);
    const yr = yrMatch ? yrMatch[1] : '';
    this.text('Year', semX + 8, stripY + stripH - 56, { bold: true, size: 8 });
    this.text(yr, semX + 40, stripY + stripH - 56, { size: 10, bold: true, color: COLORS.navy });
    this.line(semX + semW, stripY, semX + semW, stripY + stripH);

    // Departments (Priority wise)
    const depX = semX + semW;
    const depW = right - depX;
    this.text('Departments (Priority wise)', depX + 8, stripY + stripH - 12, { bold: true, size: 8 });
    const prog = app.program?.name || '';
    this.text('Option 1', depX + 8,  stripY + stripH - 26, { size: 8 });
    this.text(prog,       depX + 60, stripY + stripH - 26, { size: 8.5, bold: true, color: COLORS.navy });
    this.text('Option 2', depX + 8,  stripY + stripH - 40, { size: 8, color: COLORS.thin });
    this.text('Option 3', depX + 8,  stripY + stripH - 54, { size: 8, color: COLORS.thin });
    // Tiny "Open Merit / Self Support / Quota" labels at the bottom-right
    const tagY = stripY + 4;
    this.tickWithLabel('Open Merit',  depX + 8,   tagY, true,  { size: 7, fontSize: 7 });
    this.tickWithLabel('Self Support',depX + 75,  tagY, false, { size: 7, fontSize: 7 });
    this.tickWithLabel('Quota',       depX + 145, tagY, false, { size: 7, fontSize: 7 });

    this.y = stripY - 6;
  }

  /**
   * Section bar — "1.  PERSONAL INFORMATIONS" style header used in the
   * attached template (light grey fill, bold black text).
   */
  sectionBar(text) {
    const left = this.M;
    const right = this.W - this.M;
    const h = 14;
    this.rect(left, this.y - h, right - left, h, { fill: COLORS.fill, borderWidth: 0.6 });
    this.text(text, left + 6, this.y - h + 4, { bold: true, size: 9, color: COLORS.navy });
    this.y -= h;
  }

  /**
   * Render a single grid row: pairs = [{ label, value, w }] where w is the
   * fractional column width (must sum to 1).  Row height is fixed.
   */
  gridRow(pairs, rowH = 22) {
    const left = this.M;
    const right = this.W - this.M;
    const total = right - left;
    this.rect(left, this.y - rowH, total, rowH);
    let cx = left;
    pairs.forEach((p, i) => {
      const w = total * (p.w || 1 / pairs.length);
      if (i > 0) this.line(cx, this.y - rowH, cx, this.y, 0.6, COLORS.border);
      this.text((p.label || '').toUpperCase(), cx + 4, this.y - 8, { bold: true, size: 6.5, color: COLORS.thin });
      const lines = wrapText(safe(p.value), this.fonts.reg, 9, w - 8);
      lines.slice(0, 1).forEach((ln) => {
        this.text(ln, cx + 4, this.y - rowH + 6, { size: 9, color: COLORS.ink });
      });
      cx += w;
    });
    this.y -= rowH;
  }

  // Personal information block (matches the attached template layout)
  drawPersonalInformation(p, email) {
    const dob = dobParts(p.dateOfBirth);
    // Row 1: Full Name (full width)
    this.gridRow([{ label: 'Full Name', value: `${p.firstName || ''} ${p.lastName || ''}`.trim(), w: 1 }]);
    // Row 2: DOB (D / M / Y) + Gender (M/F/T tick row)
    {
      const left = this.M;
      const right = this.W - this.M;
      const total = right - left;
      const rowH = 24;
      this.rect(left, this.y - rowH, total, rowH);
      // DOB area (left ~55%)
      const dobW = total * 0.55;
      const dobLabelY = this.y - 8;
      this.text('DATE OF BIRTH', left + 4, dobLabelY, { bold: true, size: 6.5, color: COLORS.thin });
      const colW = (dobW - 110) / 3;
      ['DAY','MONTH','YEAR'].forEach((lbl, i) => {
        const x = left + 110 + i * colW;
        this.line(x, this.y - rowH, x, this.y, 0.6, COLORS.borderL);
        this.text(lbl, x + 4, this.y - 8, { bold: true, size: 6.5, color: COLORS.thin });
        const val = i === 0 ? dob.day : i === 1 ? dob.month : dob.year;
        this.textC(val, x, this.y - rowH + 7, colW, { size: 10, bold: true });
      });
      // Divider before gender block
      this.line(left + dobW, this.y - rowH, left + dobW, this.y, 0.6, COLORS.border);
      // Gender block
      this.text('GENDER', left + dobW + 6, dobLabelY, { bold: true, size: 6.5, color: COLORS.thin });
      const g = (p.gender || '').toLowerCase();
      this.tickWithLabel('Male',        left + dobW + 6,   this.y - rowH + 7, g === 'male',        { size: 8, fontSize: 8.5 });
      this.tickWithLabel('Female',      left + dobW + 70,  this.y - rowH + 7, g === 'female',      { size: 8, fontSize: 8.5 });
      this.tickWithLabel('Transgender', left + dobW + 140, this.y - rowH + 7, g === 'transgender', { size: 8, fontSize: 8.5 });
      this.y -= rowH;
    }
    // Row 3
    this.gridRow([
      { label: "Candidate's CNIC #", value: p.cnic, w: 0.5 },
      { label: "Father's Name",       value: p.fatherName, w: 0.5 },
    ]);
    // Row 4
    this.gridRow([
      { label: "Father's CNIC #", value: p.fatherCnic, w: 0.5 },
      { label: 'Domicile',         value: [p.domicileDistrict, p.domicileProvince].filter(Boolean).join(', '), w: 0.5 },
    ]);
    // Row 5
    this.gridRow([
      { label: 'Nationality', value: p.nationality, w: 0.5 },
      { label: 'Religion',    value: p.religion, w: 0.5 },
    ]);
    // Row 6
    this.gridRow([
      { label: 'Guardian Phone #',  value: p.guardianPhone, w: 0.5 },
      { label: 'Candidate Phone #', value: p.phone, w: 0.5 },
    ]);
    // Row 7
    this.gridRow([
      { label: 'Email', value: email, w: 1 },
    ]);
  }

  // Academic qualifications — matches attached template (5 rows: Matric / Inter / BA-BSc-AD / BS-MA-MSc / Any Other)
  drawAcademicTable(eds) {
    const left = this.M;
    const right = this.W - this.M;
    const total = right - left;
    // Column widths (sum = total)
    const colDefs = [
      { key: 'qual',  label: 'QUALIFICATION',     w: 0.20 },
      { key: 'board', label: 'BOARD/UNIVERSITY',  w: 0.22 },
      { key: 'year',  label: 'YEAR',              w: 0.07 },
      { key: 'roll',  label: 'ROLL NO.',          w: 0.13 },
      { key: 'mo',    label: 'MARKS OBTAINED',    w: 0.10 },
      { key: 'tm',    label: 'TOTAL MARKS',       w: 0.10 },
      { key: 'cgpa',  label: 'CGPA',              w: 0.08 },
      { key: 'pct',   label: '% AGE',             w: 0.10 },
    ];
    const widths = colDefs.map((c) => c.w * total);

    const headerH = 16;
    this.rect(left, this.y - headerH, total, headerH, { fill: COLORS.fill, borderWidth: 0.6 });
    // header text + vertical separators
    let cx = left;
    colDefs.forEach((c, i) => {
      if (i > 0) this.line(cx, this.y - headerH, cx, this.y, 0.6, COLORS.border);
      this.textC(c.label, cx, this.y - headerH + 5, widths[i], { bold: true, size: 7, color: COLORS.navy });
      cx += widths[i];
    });
    this.y -= headerH;

    // Build the row data from `eds` array
    const rowMap = {
      'Matric / SSC':       eds.find((e) => e.level === '10years'),
      'Inter / HSSC':       eds.find((e) => e.level === '12years' || e.level === '11years'),
      'BA / BSc / AD':      null,
      'BS (4 year)/MA/MSc': null,
      'Any Other':          null,
    };

    const rows = Object.entries(rowMap);
    const rowH = 18;
    rows.forEach(([label, ed]) => {
      this.rect(left, this.y - rowH, total, rowH, { borderWidth: 0.6 });
      cx = left;
      colDefs.forEach((c, i) => {
        if (i > 0) this.line(cx, this.y - rowH, cx, this.y, 0.6, COLORS.borderL);
        let val = '';
        if (c.key === 'qual') val = label;
        else if (ed) {
          if      (c.key === 'board') val = ed.board || '';
          else if (c.key === 'year')  val = ed.passingYear ? String(ed.passingYear) : '';
          else if (c.key === 'roll')  val = ed.rollNumber || '';
          else if (c.key === 'mo')    val = ed.marks ? String(ed.marks) : (ed.partOneMarks ? String(ed.partOneMarks) : '');
          else if (c.key === 'tm')    val = ed.totalMarks ? String(ed.totalMarks) : (ed.partOneTotalMarks ? String(ed.partOneTotalMarks) : '');
          else if (c.key === 'cgpa')  val = ed.cgpa ? String(ed.cgpa) : '';
          else if (c.key === 'pct')   val = (ed.marks && ed.totalMarks)
            ? `${((ed.marks / ed.totalMarks) * 100).toFixed(1)}%` : '';
        }
        // Render value
        const bold = c.key === 'qual';
        const align = c.key === 'qual' ? 'left' : 'center';
        if (align === 'left') {
          this.text(val, cx + 4, this.y - rowH + 5, { size: 8.5, bold });
        } else {
          this.textC(val, cx, this.y - rowH + 5, widths[i], { size: 8.5, bold });
        }
        cx += widths[i];
      });
      this.y -= rowH;
    });
  }

  // Addresses table (Present / Permanent) — 5 columns matching the template
  drawAddressesTable(p) {
    const left = this.M;
    const right = this.W - this.M;
    const total = right - left;
    const cols = [
      { label: 'ADDRESS',           w: 0.16 },
      { label: 'MOHALLAH, STREET',  w: 0.26 },
      { label: 'VILLAGE/TOWN',      w: 0.20 },
      { label: 'TEHSIL',            w: 0.18 },
      { label: 'DISTRICT',          w: 0.20 },
    ];
    const widths = cols.map((c) => c.w * total);
    const headerH = 16;
    this.rect(left, this.y - headerH, total, headerH, { fill: COLORS.fill });
    let cx = left;
    cols.forEach((c, i) => {
      if (i > 0) this.line(cx, this.y - headerH, cx, this.y, 0.6, COLORS.border);
      this.textC(c.label, cx, this.y - headerH + 5, widths[i], { bold: true, size: 7, color: COLORS.navy });
      cx += widths[i];
    });
    this.y -= headerH;

    const rows = [
      { label: 'PRESENT',   street: p.presStreet, village: p.presVillage, tehsil: p.presTehsil, district: p.presDistrict },
      { label: 'PERMANENT', street: p.permStreet, village: p.permVillage, tehsil: p.permTehsil, district: p.permDistrict },
    ];
    const rowH = 22;
    rows.forEach((r) => {
      this.rect(left, this.y - rowH, total, rowH);
      cx = left;
      const cells = [r.label, r.street, r.village, r.tehsil, r.district];
      cells.forEach((val, i) => {
        if (i > 0) this.line(cx, this.y - rowH, cx, this.y, 0.6, COLORS.borderL);
        const bold = i === 0;
        const lines = wrapText(safe(val), this.fonts.reg, 8.5, widths[i] - 6);
        lines.slice(0, 2).forEach((ln, j) => {
          this.text(ln, cx + 4, this.y - rowH + 12 - j * 9, { size: 8.5, bold });
        });
        cx += widths[i];
      });
      this.y -= rowH;
    });
  }

  // Footer block: recommendations + receipt
  drawFormFooter(app, p) {
    const left = this.M;
    const right = this.W - this.M;
    const total = right - left;

    // Recommendations & signatures
    const recH = 64;
    this.rect(left, this.y - recH, total, recH);
    this.text('Recommendations / Signature of Members of Admission Committee:',
      left + 6, this.y - 12, { bold: true, size: 8, color: COLORS.navy });
    const sigY1 = this.y - 30;
    const sigY2 = this.y - 50;
    const sigCol = (total - 12) / 3;
    for (let i = 0; i < 6; i++) {
      const col = i % 3;
      const row = i < 3 ? sigY1 : sigY2;
      this.text(`${i + 1})`, left + 6 + col * sigCol, row, { size: 8 });
      this.line(left + 24 + col * sigCol, row - 1, left + sigCol * (col + 1) - 4, row - 1, 0.5, COLORS.borderL);
    }
    this.text('Signature of the Chairman / HoD', left + 6, this.y - recH + 6, { bold: true, size: 8 });
    this.line(left + 168, this.y - recH + 7, right - 6, this.y - recH + 7, 0.5, COLORS.borderL);
    this.y -= recH;

    // Receipt block
    const recH2 = 52;
    this.rect(left, this.y - recH2, total, recH2);
    this.text('Abbottabad University of Science & Technology — Receipt',
      left + 6, this.y - 12, { bold: true, size: 8.5, color: COLORS.navy });
    this.text(`Sr #   ${app.id || ''}`,                left + 6,   this.y - 26, { size: 8 });
    this.text(`Dated   ${fmtDate(app.submittedAt || app.createdAt)}`, left + 110, this.y - 26, { size: 8 });
    this.text(`From Mr/Mrs   ${(p.firstName || '') + ' ' + (p.lastName || '')}`.trim(),
                                                       left + 6,   this.y - 40, { size: 8 });
    this.text(`Program   ${app.program?.name || ''}`,  left + 280, this.y - 40, { size: 8 });
    this.text('Dealing Assistant: ____________________', right - 200, this.y - recH2 + 6, { size: 8, color: COLORS.thin });
    this.y -= recH2;

    // Inline enrollment line (only if available)
    const en = app.user?.enrollment;
    if (en && (en.rollNumber || en.registrationNumber)) {
      this.y -= 4;
      const rowH = 18;
      this.rect(left, this.y - rowH, total, rowH, { fill: COLORS.fill });
      this.text(`Roll #: ${en.rollNumber || '—'}`,             left + 8,   this.y - rowH + 5, { bold: true, size: 9 });
      this.text(`Registration #: ${en.registrationNumber || '—'}`, left + 180, this.y - rowH + 5, { bold: true, size: 9 });
      if (en.lmsUsername) this.text(`LMS: ${en.lmsUsername}`, left + 400, this.y - rowH + 5, { size: 9 });
      this.y -= rowH;
    }

    // Inline fee line (only if available)
    const fee = app.feePayment;
    if (fee && (fee.amount || fee.status)) {
      this.y -= 4;
      const rowH = 18;
      this.rect(left, this.y - rowH, total, rowH, { fill: COLORS.fill });
      this.text(`Fee: PKR ${fee.amount ?? '—'}`,  left + 8,   this.y - rowH + 5, { bold: true, size: 9 });
      this.text(`Status: ${fee.status || '—'}`,   left + 130, this.y - rowH + 5, { size: 9 });
      this.text(`Method: ${fee.paymentMethod || '—'}`, left + 260, this.y - rowH + 5, { size: 9 });
      if (fee.txnId) this.text(`Txn: ${fee.txnId}`, left + 400, this.y - rowH + 5, { size: 9 });
      this.y -= rowH;
    }

    // Final footer note
    this.text('NOTE: Please read the instructions on the overleaf carefully.',
      left + 6, this.M + 6, { size: 8, color: COLORS.thin });
  }
}

// ----------------------------------------------------------------------------
// Page 1 — admission form front page
// ----------------------------------------------------------------------------
const renderAdmissionForm = (painter, app) => {
  const p = app.user?.profile || {};
  const eds = app.user?.educations || [];

  painter.newPage();
  painter.drawHeader();
  painter.drawTopOptionsStrip(app);

  // 1. PERSONAL INFORMATIONS
  painter.sectionBar('1.   PERSONAL INFORMATIONS');
  painter.drawPersonalInformation(p, app.user?.email);

  // 2. ACADEMIC QUALIFICATIONS
  painter.sectionBar('2.   ACADEMIC QUALIFICATIONS');
  painter.drawAcademicTable(eds);

  // 3. ADDRESSES
  painter.sectionBar('3.   ADDRESSES');
  painter.drawAddressesTable(p);

  // Footer (recommendations + receipt + enrollment/fee inline)
  painter.drawFormFooter(app, p);
};

// ----------------------------------------------------------------------------
// Page 2 — Certificate / Declaration (matches attached back page)
// ----------------------------------------------------------------------------
const renderCertificate = (painter, app) => {
  const p = app.user?.profile || {};
  const fullName = `${p.firstName || ''} ${p.lastName || ''}`.trim();

  painter.newPage();
  const left = painter.M;
  const right = painter.W - painter.M;
  const total = right - left;
  const top = painter.H - painter.M;

  // Page-level outer border
  painter.rect(left, painter.M, total, top - painter.M, { borderWidth: 0.8 });

  // "CERTIFICATE" heading bar
  const titleY = top - 22;
  painter.textC('CERTIFICATE', left, titleY, total, { bold: true, size: 14, color: COLORS.navy });
  // underline
  painter.line(left + total / 2 - 50, titleY - 3, left + total / 2 + 50, titleY - 3, 0.7, COLORS.navy);

  // Intro paragraph (verbatim, slightly compacted to fit the page)
  painter.y = titleY - 18;
  const intro =
    'I hereby certify that I have separately submitted the undertaking as required in the section of documents below. ' +
    'I further certify that all entries made in this application form are correct and that I shall abide by the Rules ' +
    '& Regulations of Abbottabad University of Science & Technology in vogue and to be framed subsequently. ' +
    'If admitted, I shall also comply with the order of the University Authorities during my studentship. ' +
    'I understand that my admission in the University is provisional and liable to cancellation if any irregularity ' +
    'is found in my admission form / documents / eligibility etc.';
  const introLines = wrapText(intro, painter.fonts.reg, 9.5, total - 20);
  introLines.forEach((ln) => {
    painter.text(ln, left + 10, painter.y, { size: 9.5 });
    painter.y -= 13;
  });
  painter.y -= 6;

  // Numbered i-vi clauses
  const clauses = [
    'I have read and understood the admission form of Abbottabad UST.',
    'The particulars given in the Application form are correct to the best of my knowledge.',
    'I am applying for admission with the consent of my parents / guardians / organization.',
    'I will not join any union or political party during my studentship in Abbottabad UST.',
    'I will devote myself to my studies and maintain the dignity and prestige of the University within and outside the University and will be liable to any penalty including rustication / expulsion in case of any violation on my part.',
    'I will have no objection, if detained either before or at the time of University Examinations due to shortage of attendance, fee default, misconduct or any other disciplinary irregularity.',
  ];
  const romans = ['i-', 'ii-', 'iii-', 'iv-', 'v-', 'vi-'];
  clauses.forEach((c, i) => {
    painter.text(romans[i], left + 12, painter.y, { bold: true, size: 9.5, color: COLORS.navy });
    const lines = wrapText(c, painter.fonts.reg, 9.5, total - 50);
    lines.forEach((ln, j) => {
      painter.text(ln, left + 30, painter.y - j * 12, { size: 9.5 });
    });
    painter.y -= 12 * lines.length + 4;
  });

  // Signature lines
  painter.y -= 6;
  const drawSigLine = (label, value, x, y, lineLen = 220) => {
    painter.text(label, x, y, { bold: true, size: 9 });
    painter.line(x + 200, y - 1, x + 200 + lineLen, y - 1, 0.6, COLORS.border);
    if (value) painter.text(value, x + 204, y + 2, { size: 9 });
  };
  drawSigLine('SIGNATURE OF THE APPLICANT:', '', left + 10, painter.y);
  painter.y -= 18;
  drawSigLine("SIGNATURE OF THE APPLICANT'S FATHER / GUARDIAN:", '', left + 10, painter.y, 140);
  painter.y -= 18;
  drawSigLine('Date:', fmtDate(new Date()), left + 10, painter.y, 140);
  painter.y -= 22;

  // Attested copies list bar
  painter.rect(left + 6, painter.y - 14, total - 12, 14, { fill: COLORS.fill });
  painter.text('ATTESTED COPIES OF ACADEMIC CERTIFICATES / DEGREES ARE ATTACHED',
    left + 10, painter.y - 10, { bold: true, size: 8.5, color: COLORS.navy });
  painter.y -= 14 + 4;

  const items = [
    'Attested copy of Secondary School Certificate (SSC).',
    'Attested copy of Intermediate (HSSC).',
    'Attested copy of Transcript / Degree (for diploma applicants).',
    'Character Certificate.',
    'Original Migration Certificate.',
    'Original Undertaking (complete in all respect).',
    'Attested copies of Domicile & CNIC / Form B.',
    '04 passport size photographs (attested).',
  ];
  items.forEach((it, i) => {
    painter.text(`${i + 1}-`, left + 14, painter.y, { bold: true, size: 9 });
    painter.text(it, left + 30, painter.y, { size: 9 });
    painter.y -= 12;
  });
  painter.y -= 4;

  // Conditions for admission
  painter.rect(left + 6, painter.y - 14, total - 12, 14, { fill: COLORS.fill });
  painter.text('CONDITIONS FOR ADMISSION',
    left + 10, painter.y - 10, { bold: true, size: 8.5, color: COLORS.navy });
  painter.y -= 14 + 4;
  const condA =
    'A:  Applying for admission to Honors programs the applicant must have passed the intermediate ' +
    '(FA / F.Sc / HSSC or equivalent) examinations at least in 2nd division (minimum 45% marks) or ' +
    '2.50 / 4.00 CGPA in semester system and holds its certificate / degree.';
  const condB = 'B:  Judicial appeals can only be filed in the Courts at Abbottabad.';
  [condA, condB].forEach((c) => {
    const lines = wrapText(c, painter.fonts.reg, 9, total - 28);
    lines.forEach((ln) => { painter.text(ln, left + 14, painter.y, { size: 9 }); painter.y -= 11; });
    painter.y -= 2;
  });

  // Rejection notes
  painter.text('ADMISSION FORM WILL NOT BE ACCEPTABLE IN CASE THE:',
    left + 10, painter.y, { bold: true, size: 9, color: COLORS.navy });
  painter.y -= 12;
  ['Form is incomplete', 'Fee amount is less', 'Form is received after due date',
   'Attested copies of the Academic Certificates are not attached']
    .forEach((it, i) => {
      painter.text(`${String.fromCharCode(97 + i)}.`, left + 14, painter.y, { bold: true, size: 9 });
      painter.text(it, left + 28, painter.y, { size: 9 });
      painter.y -= 11;
    });
  painter.y -= 6;

  // Closing applicant name + signature + date
  painter.text('I have read and understood all the information given in this form and responded by me to the best of my knowledge and faith.',
    left + 10, painter.y, { size: 9 });
  painter.y -= 18;

  const colW = (total - 30) / 3;
  // Applicant name
  painter.text("Applicant's Name", left + 10, painter.y, { bold: true, size: 9 });
  painter.line(left + 10, painter.y - 12, left + 10 + colW, painter.y - 12, 0.6, COLORS.border);
  if (fullName) painter.text(fullName, left + 12, painter.y - 10, { size: 9 });
  // Signature
  painter.text('Signature', left + 20 + colW, painter.y, { bold: true, size: 9 });
  painter.line(left + 20 + colW, painter.y - 12, left + 20 + 2 * colW, painter.y - 12, 0.6, COLORS.border);
  // Date
  painter.text('Date:', left + 30 + 2 * colW, painter.y, { bold: true, size: 9 });
  painter.line(left + 30 + 2 * colW, painter.y - 12, right - 10, painter.y - 12, 0.6, COLORS.border);
  painter.text(fmtDate(new Date()), left + 32 + 2 * colW, painter.y - 10, { size: 9 });
};

// ----------------------------------------------------------------------------
// Document collection & strict de-duplication
// ----------------------------------------------------------------------------

/**
 * Returns documents in the exact required order, every doc appearing EXACTLY
 * ONCE (de-duplicated by document.id, by filePath, by (fileName+size)
 * signature, AND by type — so stale leftover rows from old uploads never
 * appear in the merged PDF).
 */
const collectOrderedDocuments = (app) => {
  // CRITICAL DEDUP: keep only the newest Document per `type` so an old
  // photo / CNIC / receipt that lingers from before the dedup-on-upload
  // fix doesn't get included in the PDF. We mirror the same approach
  // used by AdminDashboard's "Profile Documents" card.
  const rawUserDocs = app.user?.documents || [];
  const sortedByIdDesc = [...rawUserDocs].sort((a, b) => (b.id || 0) - (a.id || 0));
  const newestPerType = new Map();
  for (const d of sortedByIdDesc) {
    const t = (d.type || d.docType || '').toLowerCase();
    if (!t) continue;
    if (!newestPerType.has(t)) newestPerType.set(t, d);
  }
  const userDocs   = Array.from(newestPerType.values());
  const educations = app.user?.educations || [];
  const profile    = app.user?.profile || {};

  const ordered = [];
  // CRITICAL: scope-qualified id dedup so Document.id=5 and
  // EducationDocument.id=5 (independent sequences) don't collide.
  // Keys are strings like "user:5" / "education:5".
  const seenById   = new Set();   // `${source}:${id}`
  const seenByPath = new Set();   // /uploads/... paths
  const seenByName = new Set();   // fileName|size signatures

  // `source` MUST be 'user' (Document table) or 'education'
  // (EducationDocument table). It's used both for scoped dedup AND
  // for the preview-endpoint scope query string (so the right file
  // is fetched at PDF-assembly time).
  const tryPush = (d, source) => {
    if (!d) return false;
    const id   = d.id;
    const path = d.filePath;
    const sig  = `${(d.fileName || '').toLowerCase()}|${d.fileSize || ''}`;
    const idKey = id ? `${source}:${id}` : null;
    if (idKey && seenById.has(idKey)) return false;
    if (path  && seenByPath.has(path)) return false;
    if (sig.length > 1 && seenByName.has(sig)) return false;
    if (idKey) seenById.add(idKey);
    if (path)  seenByPath.add(path);
    if (sig.length > 1) seenByName.add(sig);
    ordered.push({
      id,
      source,                  // 'user' | 'education' — drives the `scope` query string
      fileName: d.fileName || '',
      mimeType: d.mimeType || '',
      filePath: d.filePath || null,
    });
    return true;
  };

  // Find a user document by predicate.
  const findUserDoc = (matchFn) =>
    userDocs.find((d) => {
      if (d.id && seenById.has(`user:${d.id}`)) return false;
      const t = (d.type || d.docType || '').toLowerCase();
      const f = (d.fileName || '').toLowerCase();
      return matchFn(t, f);
    });

  // ==========================================================================
  // STRICT ATTACHMENT ORDER (master spec):
  //   1. Student Photograph
  //   2. CNIC Front
  //   3. CNIC Back
  //   4. Father / Guardian CNIC
  //   5. Matric DMC
  //   6. Matric Certificate
  //   7. FSc DMC (with Part-I DMC if Result Awaited)
  //   8. FSc Certificate
  //   9. Character Certificate
  //  10. Migration Certificate (if uploaded)
  //  11. Application Fee Receipt
  //  12. Enrollment Fee Receipt
  //  13. Additional Uploaded Documents
  // ==========================================================================

  // 1. Student Photograph — from Document table or Profile.photoPath
  const photoDoc = findUserDoc((t) => t === 'photo' || t.includes('photograph'));
  if (photoDoc) {
    tryPush(photoDoc, 'user');
  } else if (profile.photoPath && !seenByPath.has(profile.photoPath)) {
    seenByPath.add(profile.photoPath);
    ordered.push({
      id: null,
      source: 'path',
      fileName: profile.photoPath.split('/').pop(),
      mimeType: '',
      filePath: profile.photoPath,
    });
  }

  // 2. CNIC Front
  tryPush(findUserDoc((t) => t === 'cnic_front' || (t.includes('cnic') && t.includes('front') && !t.includes('father'))), 'user');
  // 3. CNIC Back
  tryPush(findUserDoc((t) => t === 'cnic_back'  || (t.includes('cnic') && t.includes('back')  && !t.includes('father'))), 'user');

  // 4. Father / Guardian CNIC (front/back variants — legacy types kept for
  // forward compat; the system today does not upload these but if any
  // future doc lands with a matching type it gets slotted here.)
  tryPush(findUserDoc((t) => t === 'father_cnic_front' || (t.includes('father') && t.includes('front'))), 'user');
  tryPush(findUserDoc((t) => t === 'father_cnic_back'  || (t.includes('father') && t.includes('back'))), 'user');
  tryPush(findUserDoc((t) => t.includes('father') && t.includes('cnic')), 'user');

  // 5. Matric DMC + 6. Matric Certificate
  const matric = educations.find((e) => e.level === '10years');
  const partI  = educations.find((e) => e.level === '11years');
  const fsc    = educations.find((e) => e.level === '12years');

  const findEduDoc = (ed, pred) => {
    if (!ed) return null;
    return (ed.documents || []).find((d) =>
      !(d.id && seenById.has(`education:${d.id}`))
      && pred((d.docType || '').toLowerCase(), (d.fileName || '').toLowerCase())
    );
  };

  tryPush(findEduDoc(matric, (t) => t === 'dmc' || t.includes('dmc') || t.includes('marks')), 'education');
  tryPush(findEduDoc(matric, (t) => t === 'certificate' || t.includes('cert')), 'education');

  // 7. FSc DMC (Part-I DMC then Part-II DMC — both appear together when
  //    FSc result is still awaited)
  tryPush(findEduDoc(partI,  (t) => t === 'part1_dmc' || t.includes('part') || t === 'dmc' || t.includes('dmc')), 'education');
  tryPush(findEduDoc(fsc,    (t) => t === 'part1_dmc' || (t.includes('part') && t.includes('1'))), 'education');
  tryPush(findEduDoc(fsc,    (t) => t === 'dmc' || t.includes('dmc') || t.includes('marks')), 'education');
  // 8. FSc Certificate
  tryPush(findEduDoc(fsc,    (t) => t === 'certificate' || t.includes('cert')), 'education');

  // 9. Character Certificate — search across all educations and user docs
  let charPushed = false;
  for (const ed of educations) {
    const charDoc = findEduDoc(ed, (t, f) => t === 'char_cert' || t.includes('character') || f.includes('character'));
    if (charDoc && tryPush(charDoc, 'education')) { charPushed = true; break; }
  }
  if (!charPushed) {
    const charU = findUserDoc((t, f) => t === 'char_cert' || t.includes('character') || f.includes('character'));
    if (charU) tryPush(charU, 'user');
  }

  // 10. Migration Certificate (optional but must appear before receipts).
  for (const ed of educations) {
    const mig = findEduDoc(ed, (t, f) => t === 'migration_cert' || t.includes('migration') || f.includes('migration'));
    if (mig && tryPush(mig, 'education')) break;
  }

  // 11. Application/Processing Fee Receipt — typed Document rows + legacy path
  const appFeeDoc = userDocs.find((d) => {
    const t = (d.type || d.docType || '').toLowerCase();
    return t === 'application_fee_receipt' || t === 'fee_receipt';
  });
  if (appFeeDoc) tryPush(appFeeDoc, 'user');
  if (app.feeReceiptPath && !seenByPath.has(app.feeReceiptPath)) {
    seenByPath.add(app.feeReceiptPath);
    ordered.push({
      id: null,
      source: 'path',
      fileName: app.feeReceiptPath.split('/').pop(),
      mimeType: '',
      filePath: app.feeReceiptPath,
    });
  }

  // 12. Enrollment / Admission Fee Receipt
  const enrollFeeDoc = userDocs.find((d) => {
    const t = (d.type || d.docType || '').toLowerCase();
    return t === 'admission_fee_receipt' || t === 'enrollment_fee_receipt';
  });
  if (enrollFeeDoc) tryPush(enrollFeeDoc, 'user');
  if (app.feePayment?.receiptPath && !seenByPath.has(app.feePayment.receiptPath)) {
    seenByPath.add(app.feePayment.receiptPath);
    ordered.push({
      id: null,
      source: 'path',
      fileName: app.feePayment.receiptPath.split('/').pop(),
      mimeType: '',
      filePath: app.feePayment.receiptPath,
    });
  }

  // 13. Additional uploaded documents (everything not yet emitted) — strictly
  //     excludes photo (already in form header), appeal_proof (administrative),
  //     and any remaining receipts (already emitted above).
  educations.forEach((ed) => {
    (ed.documents || []).forEach((d) => tryPush(d, 'education'));
  });
  userDocs.forEach((d) => {
    const t = (d.type || d.docType || '').toLowerCase();
    if (t === 'photo') return;
    if (t === 'appeal_proof') return;
    if (t === 'application_fee_receipt' || t === 'fee_receipt'
        || t === 'admission_fee_receipt' || t === 'enrollment_fee_receipt') return;
    tryPush(d, 'user');
  });

  return ordered;
};

const appendDocuments = async (pdfDoc, app, onProgress) => {
  const docs = collectOrderedDocuments(app);
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    if (onProgress) onProgress(`Embedding document ${i + 1}/${docs.length}: ${d.fileName || ''}`);
    let blob = null;
    // Pass `source` as scope so the preview endpoint queries the right
    // table — prevents the cross-table ID-collision bug where the same
    // numeric id existed in both Document and EducationDocument tables.
    if (d.id) blob = await fetchDocBlob(d.id, d.source);
    if (!blob && d.filePath) blob = await fetchPathBlob(d.filePath);
    if (!blob) continue;
    await appendBlobAsPages(pdfDoc, blob, d.mimeType, d.fileName);
  }
};

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Build a complete merged PDF for one application and trigger download.
 */
export const downloadCompleteApplicationPdf = async (appId, options = {}) => {
  const { fetchData, onProgress } = options;
  const tell = (m) => { if (onProgress) onProgress(m); };

  tell('Fetching application data\u2026');
  const res = fetchData
    ? await fetchData(appId)
    : await api.get(`/admin/application/${appId}/pdf-data`);
  const app = res?.data?.application || res?.application || res;
  if (!app) throw new Error('No application data');

  tell('Preparing PDF\u2026');
  const pdf = await PDFDocument.create();
  const reg  = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Embed AUST logo (if available).
  // We pick the embedder based on the REAL byte signature, not the
  // filename extension — many "logo.png" files are actually JPEGs and
  // pdf-lib's embedPng() throws on JPEG bytes (root cause of "logo
  // missing in PDF").
  let logoImg = null;
  const lb = await loadLogoBytes();
  if (lb && lb.bytes) {
    const tryEmbed = async (kind) => {
      try {
        return kind === 'png'
          ? await pdf.embedPng(lb.bytes)
          : await pdf.embedJpg(lb.bytes);
      } catch { return null; }
    };
    logoImg = await tryEmbed(lb.kind);
    // Fallback to the OTHER embedder if the first one fails (defensive)
    if (!logoImg) logoImg = await tryEmbed(lb.kind === 'png' ? 'jpg' : 'png');
  }

  // Embed applicant photo (Profile.photoPath)
  // CRITICAL: pick the embedder by SNIFFING the bytes, not by the
  // filename extension. Users frequently upload JPEGs renamed to
  // .png (especially WhatsApp / mobile screenshots) which would
  // cause pdf-lib.embedPng() to throw silently — that's why the
  // student photo was missing from the PDF header.
  let photoImg = null;
  const photoPath = app.user?.profile?.photoPath;
  if (photoPath) {
    try {
      const blob = await fetchPathBlob(photoPath);
      if (blob) {
        const ab = await blob.arrayBuffer();
        const kind = sniffArrayBufferKind(ab);
        const tryEmbedPhoto = async (k) => {
          try {
            return k === 'png' ? await pdf.embedPng(ab) : await pdf.embedJpg(ab);
          } catch { return null; }
        };
        // Use sniffed kind first, fall back to the other embedder.
        if (kind === 'png' || kind === 'jpg') {
          photoImg = await tryEmbedPhoto(kind);
          if (!photoImg) photoImg = await tryEmbedPhoto(kind === 'png' ? 'jpg' : 'png');
        } else {
          // Unknown bytes — try JPEG first (most photos), then PNG.
          photoImg = await tryEmbedPhoto('jpg');
          if (!photoImg) photoImg = await tryEmbedPhoto('png');
        }
      }
    } catch { photoImg = null; }
  }

  const painter = new FormPainter(pdf, { reg, bold }, logoImg, photoImg);

  tell('Rendering admission form\u2026');
  renderAdmissionForm(painter, app);

  tell('Rendering certificate / declaration\u2026');
  renderCertificate(painter, app);

  tell('Embedding uploaded documents\u2026');
  await appendDocuments(pdf, app, tell);

  tell('Saving file\u2026');
  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const p = app.user?.profile || {};
  // FIX 1.2 — every individual student form PDF MUST be named
  // StudentFullName_CNIC.pdf  (e.g. Ahmad_Raza_3520112345671.pdf).
  // Both name and CNIC are always present — CNIC dashes are stripped.
  const nameParts = [p.firstName, p.lastName].filter(Boolean).join('_')
    || (app.user?.username || `Applicant_${app.id || ''}`);
  const cnicDigits = String(p.cnic || '').replace(/\D/g, '') || 'NO-CNIC';
  const fname = sanitizeFilename(`${nameParts}_${cnicDigits}`);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fname || 'Application'}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);

  tell('Done');
  return { ok: true };
};

// ============================================================================
// Merit List PDF (unchanged styling)
// ============================================================================

export const downloadMeritListPdf = async (entries, meta = {}) => {
  const pdf = await PDFDocument.create();
  const reg  = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImg = null;
  const lb = await loadLogoBytes();
  if (lb && lb.bytes) {
    const tryEmbed = async (kind) => {
      try {
        return kind === 'png'
          ? await pdf.embedPng(lb.bytes)
          : await pdf.embedJpg(lb.bytes);
      } catch { return null; }
    };
    const primary = lb.kind === 'png' ? 'png' : 'jpg';
    logoImg = await tryEmbed(primary);
    if (!logoImg) logoImg = await tryEmbed(primary === 'png' ? 'jpg' : 'png');
  }

  const sorted = [...(entries || [])].sort(
    (a, b) => (a.rank || 9999) - (b.rank || 9999) || (b.totalMerit || 0) - (a.totalMerit || 0),
  );

  const margin = 32;
  const pageW = 595.28, pageH = 841.89;
  const headerH = 64;
  const rowH = 22;
  const cols = [
    { key: 'rank',    label: '#',        w: 32, align: 'center' },
    { key: 'name',    label: 'Student',  w: 170 },
    { key: 'cnic',    label: 'CNIC',     w: 95 },
    { key: 'program', label: 'Program',  w: 90 },
    { key: 'matric',  label: 'Matric%',  w: 50, align: 'right' },
    { key: 'fsc',     label: 'FSc%',     w: 45, align: 'right' },
    { key: 'intv',    label: 'Intv',     w: 40, align: 'right' },
    { key: 'total',   label: 'Total%',   w: 55, align: 'right' },
  ];
  const tableW = cols.reduce((a, c) => a + c.w, 0);
  const startX = (pageW - tableW) / 2;

  let page = null;
  let y = 0;

  const drawHeader = () => {
    page = pdf.addPage([pageW, pageH]);
    page.drawRectangle({ x: 0, y: pageH - headerH, width: pageW, height: headerH, color: COLORS.navy });
    if (logoImg) page.drawImage(logoImg, { x: margin, y: pageH - headerH + 10, width: 44, height: 44 });
    page.drawText('Abbottabad University of Science & Technology', {
      x: margin + 56, y: pageH - 26, size: 13, font: bold, color: rgb(1, 1, 1),
    });
    page.drawText('Open & Distance Learning  •  Official Merit List', {
      x: margin + 56, y: pageH - 44, size: 9, font: reg, color: rgb(0.85, 0.90, 0.97),
    });
    let yy = pageH - headerH - 18;
    page.drawText('MERIT LIST', { x: margin, y: yy, size: 14, font: bold, color: COLORS.navy });
    yy -= 14;
    const sub = [
      meta.programName ? `Program: ${meta.programName}` : null,
      meta.cycleTitle  ? `Intake: ${meta.cycleTitle}` : null,
      `Total Candidates: ${sorted.length}`,
    ].filter(Boolean).join('   |   ');
    page.drawText(sub, { x: margin, y: yy, size: 9, font: reg, color: COLORS.thin });
    y = yy - 14;

    let xx = startX;
    page.drawRectangle({ x: startX, y: y - rowH + 4, width: tableW, height: rowH, color: COLORS.navy });
    cols.forEach((c) => {
      const tx = c.align === 'center' ? xx + c.w / 2 - bold.widthOfTextAtSize(c.label, 8) / 2
        : c.align === 'right' ? xx + c.w - bold.widthOfTextAtSize(c.label, 8) - 6
        : xx + 6;
      page.drawText(c.label, { x: tx, y: y - 10, size: 8, font: bold, color: rgb(1, 1, 1) });
      xx += c.w;
    });
    y -= rowH + 2;
  };

  drawHeader();
  sorted.forEach((e, i) => {
    if (y < 60) drawHeader();
    if (i % 2 === 0) page.drawRectangle({ x: startX, y: y - rowH + 4, width: tableW, height: rowH, color: rgb(0.96, 0.97, 0.98) });
    const profile = e.user?.profile || {};
    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || (e.user?.email || '—');
    const row = {
      rank: String(e.rank || i + 1),
      name: fullName,
      cnic: profile.cnic || '—',
      program: e.application?.program?.name || '—',
      matric: e.matricPercent != null ? e.matricPercent.toFixed(1) : '—',
      fsc: e.fscPercent != null ? e.fscPercent.toFixed(1) : '—',
      intv: e.interviewMarks != null ? e.interviewMarks.toFixed(1) : '—',
      total: e.totalMerit != null ? e.totalMerit.toFixed(2) : '—',
    };
    let xx = startX;
    cols.forEach((c) => {
      let txt = String(row[c.key] || '');
      while (reg.widthOfTextAtSize(txt, 8.5) > c.w - 8 && txt.length > 4) txt = txt.slice(0, -2);
      if (txt !== row[c.key] && txt.length > 0) txt = txt.slice(0, -1) + '\u2026';
      const tx = c.align === 'center' ? xx + c.w / 2 - reg.widthOfTextAtSize(txt, 8.5) / 2
        : c.align === 'right' ? xx + c.w - reg.widthOfTextAtSize(txt, 8.5) - 6
        : xx + 6;
      page.drawText(txt, { x: tx, y: y - 9, size: 8.5, font: reg, color: COLORS.ink });
      xx += c.w;
    });
    page.drawLine({
      start: { x: startX, y: y - rowH + 4 }, end: { x: startX + tableW, y: y - rowH + 4 },
      thickness: 0.3, color: COLORS.borderL,
    });
    y -= rowH;
  });

  const bytes = await pdf.save();
  // Filename: MeritList_<ShortForm>_<SessionName>.pdf when provided, otherwise
  // a sensible date-stamped default.
  const slug = (s) => String(s || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  let fileName = meta.fileName;
  if (!fileName) {
    if (meta.shortForm && meta.sessionName) {
      fileName = `MeritList_${slug(meta.shortForm)}_${slug(meta.sessionName)}.pdf`;
    } else {
      fileName = `AUST_Merit_List_${new Date().toISOString().slice(0, 10)}.pdf`;
    }
  }
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

// ============================================================================
// Enrolled Students PDF (unchanged styling)
// ============================================================================

export const downloadEnrolledStudentsPdf = async (rows) => {
  const pdf = await PDFDocument.create();
  const reg  = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logoImg = null;
  const lb = await loadLogoBytes();
  if (lb && lb.bytes) {
    const tryEmbed = async (kind) => {
      try {
        return kind === 'png'
          ? await pdf.embedPng(lb.bytes)
          : await pdf.embedJpg(lb.bytes);
      } catch { return null; }
    };
    const primary = lb.kind === 'png' ? 'png' : 'jpg';
    logoImg = await tryEmbed(primary);
    if (!logoImg) logoImg = await tryEmbed(primary === 'png' ? 'jpg' : 'png');
  }

  const pageW = 841.89, pageH = 595.28;
  const margin = 32;
  const headerH = 60;
  const rowH = 22;
  const cols = [
    { key: 'no',    label: '#',              w: 28, align: 'center' },
    { key: 'name',  label: 'Student',        w: 170 },
    { key: 'email', label: 'Email',          w: 170 },
    { key: 'prog',  label: 'Program',        w: 110 },
    { key: 'reg',   label: 'Registration #', w: 130 },
    { key: 'roll',  label: 'Roll #',         w: 100 },
    { key: 'lms',   label: 'LMS User',       w: 90 },
  ];
  const tableW = cols.reduce((a, c) => a + c.w, 0);
  const startX = (pageW - tableW) / 2;
  let page = null;
  let y = 0;
  const drawHeader = () => {
    page = pdf.addPage([pageW, pageH]);
    page.drawRectangle({ x: 0, y: pageH - headerH, width: pageW, height: headerH, color: COLORS.navy });
    if (logoImg) page.drawImage(logoImg, { x: margin, y: pageH - headerH + 8, width: 44, height: 44 });
    page.drawText('Abbottabad University of Science & Technology', {
      x: margin + 56, y: pageH - 24, size: 13, font: bold, color: rgb(1, 1, 1),
    });
    page.drawText('Open & Distance Learning  •  Enrolled Students Roster', {
      x: margin + 56, y: pageH - 42, size: 9, font: reg, color: rgb(0.85, 0.90, 0.97),
    });
    let yy = pageH - headerH - 16;
    page.drawText('ENROLLED STUDENTS', { x: margin, y: yy, size: 13, font: bold, color: COLORS.navy });
    yy -= 12;
    page.drawText(`Total: ${rows.length}`, { x: margin, y: yy, size: 9, font: reg, color: COLORS.thin });
    y = yy - 12;
    let xx = startX;
    page.drawRectangle({ x: startX, y: y - rowH + 4, width: tableW, height: rowH, color: COLORS.navy });
    cols.forEach((c) => {
      const tx = c.align === 'center' ? xx + c.w / 2 - bold.widthOfTextAtSize(c.label, 8) / 2 : xx + 6;
      page.drawText(c.label, { x: tx, y: y - 10, size: 8, font: bold, color: rgb(1, 1, 1) });
      xx += c.w;
    });
    y -= rowH + 2;
  };

  drawHeader();
  rows.forEach((r, i) => {
    if (y < 50) drawHeader();
    if (i % 2 === 0) page.drawRectangle({ x: startX, y: y - rowH + 4, width: tableW, height: rowH, color: rgb(0.96, 0.97, 0.98) });
    const data = {
      no: String(i + 1), name: r.name || '—', email: r.email || '—',
      prog: r.program || '—', reg: r.registrationNumber || '—',
      roll: r.rollNumber || '—', lms: r.lmsUsername || '—',
    };
    let xx = startX;
    cols.forEach((c) => {
      let txt = String(data[c.key] || '');
      while (reg.widthOfTextAtSize(txt, 8.5) > c.w - 8 && txt.length > 4) txt = txt.slice(0, -2);
      if (txt !== data[c.key] && txt.length > 0) txt = txt.slice(0, -1) + '\u2026';
      const tx = c.align === 'center' ? xx + c.w / 2 - reg.widthOfTextAtSize(txt, 8.5) / 2 : xx + 6;
      page.drawText(txt, { x: tx, y: y - 9, size: 8.5, font: reg, color: COLORS.ink });
      xx += c.w;
    });
    page.drawLine({
      start: { x: startX, y: y - rowH + 4 }, end: { x: startX + tableW, y: y - rowH + 4 },
      thickness: 0.3, color: COLORS.borderL,
    });
    y -= rowH;
  });

  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AUST_Enrolled_Students_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

// ============================================================================
// Enrolled Students CSV (unchanged)
// ============================================================================

export const downloadEnrolledStudentsCsv = (rows) => {
  const headers = ['#', 'Name', 'Email', 'Program', 'Registration #', 'Roll #', 'LMS Username', 'Status', 'CNIC', 'Phone'];
  const escapeCell = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  rows.forEach((r, i) => {
    lines.push([
      i + 1, r.name || '', r.email || '', r.program || '', r.registrationNumber || '',
      r.rollNumber || '', r.lmsUsername || '', r.status || '', r.cnic || '', r.phone || '',
    ].map(escapeCell).join(','));
  });
  const csv = '\ufeff' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `AUST_Enrolled_Students_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

export default {
  downloadCompleteApplicationPdf,
  downloadMeritListPdf,
  downloadEnrolledStudentsPdf,
  downloadEnrolledStudentsCsv,
};

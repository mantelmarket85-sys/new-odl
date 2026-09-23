const express = require('express');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const UPLOAD_BASE = path.join(__dirname, '..', '..', 'uploads');

// Helper — check authorisation: owner, director_admissions, or coordinator
function canAccess(user, ownerId) {
  if (!user) return false;
  if (user.role === 'director_admissions' || user.role === 'admin' || user.role === 'coordinator') return true;
  return user.id === ownerId;
}

function sanitiseRel(rel) {
  // strip leading /uploads/ if present
  let s = rel.replace(/^\//, '');
  if (s.startsWith('uploads/')) s = s.slice('uploads/'.length);
  // disallow path traversal
  if (s.includes('..')) return null;
  return s;
}

function resolveAbs(rel) {
  const safe = sanitiseRel(rel);
  if (!safe) return null;
  const abs = path.join(UPLOAD_BASE, safe);
  if (!abs.startsWith(UPLOAD_BASE)) return null;
  return abs;
}

function detectMime(p) {
  const ext = path.extname(p).toLowerCase();
  const map = {
    '.pdf':  'application/pdf',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    // ".jfif" is JPEG-File-Interchange-Format and is uploaded by Windows users
    // for fee receipts. It MUST be served as image/jpeg or browsers refuse to
    // render it inline (the View button used to fall through to a download).
    '.jfif': 'image/jpeg',
    '.jpe':  'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.bmp':  'image/bmp',
    '.svg':  'image/svg+xml',
    '.tif':  'image/tiff',
    '.tiff': 'image/tiff',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
  };
  return map[ext] || 'application/octet-stream';
}

// Sniff the first bytes of a file to detect its real type when the extension
// is missing or wrong. Covers JPEG, PNG, GIF, WEBP and PDF — every receipt
// format we care about. Falls back to extension-based detection on miss.
function sniffMimeFromBytes(absPath) {
  try {
    const fd = fs.openSync(absPath, 'r');
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (bytesRead < 4) return null;

    // PDF: "%PDF"
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
    // JPEG: FF D8 FF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
    // PNG: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
    // GIF: "GIF8"
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
    // WEBP: "RIFF" .... "WEBP"
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
        && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
    // BMP: "BM"
    if (buf[0] === 0x42 && buf[1] === 0x4D) return 'image/bmp';
  } catch (_) {}
  return null;
}

function resolveMime(storedMime, absPath) {
  // Always prefer a real, specific mime over a generic / wildcard one.
  const m = (storedMime || '').toLowerCase();
  const isGeneric = !m
    || m === 'application/octet-stream'
    || m === 'application/*'
    || m === 'image/*'
    || m === '*/*';
  if (!isGeneric) return storedMime;
  // 1) extension first (cheap)
  const byExt = detectMime(absPath);
  if (byExt && byExt !== 'application/octet-stream') return byExt;
  // 2) byte sniff (handles missing/wrong extensions)
  const sniffed = sniffMimeFromBytes(absPath);
  if (sniffed) return sniffed;
  return 'application/octet-stream';
}

// ============================================================
// CRITICAL: ID collision fix
// ------------------------------------------------------------
// Both `Document` (photos / CNIC / receipts) and `EducationDocument`
// (DMC / Certificate / Char-cert) use SEPARATE autoincrement
// sequences, so the SAME numeric id can exist in BOTH tables.
//
// Example real data:
//   Document        id=1 → cnic_front
//   EducationDocument id=1 → Matric DMC
//
// Previously this resolver tried `educationDocument` FIRST and
// returned it whenever the id existed there, which silently
// served the WRONG file when a profile-document card was clicked.
// Reported symptoms:
//   * PHOTO opens DMC
//   * CNIC Front opens Character Certificate
//   * CNIC Back opens unrelated document
//
// Fix: a caller-supplied `scope` parameter (`user` | `education`)
// makes the lookup strict. When omitted we fall back to the old
// behaviour but `Document` (user-doc) wins first — that matches
// what the dashboards expect for profile-doc cards.
// ============================================================
async function locateDocument(id, scope) {
  const numId = parseInt(id);
  if (!Number.isFinite(numId)) return null;

  const lookupUserDoc = async () => {
    const doc = await prisma.document.findUnique({ where: { id: numId } });
    if (!doc) return null;
    return {
      ownerId: doc.userId,
      filePath: doc.filePath,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      _source: 'user',
    };
  };

  const lookupEduDoc = async () => {
    const eduDoc = await prisma.educationDocument.findUnique({
      where: { id: numId },
      include: { education: { select: { userId: true } } },
    });
    if (!eduDoc) return null;
    return {
      ownerId: eduDoc.education.userId,
      filePath: eduDoc.filePath,
      fileName: eduDoc.fileName,
      mimeType: eduDoc.mimeType,
      _source: 'education',
    };
  };

  // STRICT mode: caller knows which table the id belongs to.
  if (scope === 'user' || scope === 'document')   return await lookupUserDoc();
  if (scope === 'education' || scope === 'edu')   return await lookupEduDoc();

  // BACKWARD-COMPAT fallback (legacy callers): prefer user-doc first
  // so the profile-doc cards never mis-resolve to an EducationDocument
  // sharing the same numeric id.
  const userDoc = await lookupUserDoc();
  if (userDoc) return userDoc;
  return await lookupEduDoc();
}

// ============================================================
// GET /api/files/preview/:id   → serves file inline (preview in browser)
// GET /api/files/preview-edu/:id → preview education-doc (fast path)
// GET /api/files/download/:id  → forces download
// ============================================================
async function serve(req, res, asAttachment) {
  try {
    // Accept ?scope=user|education to strictly pick the source table.
    // Defaults to legacy fallback resolution (user-doc first).
    const scope = (req.query.scope || '').toLowerCase() || null;
    const info = await locateDocument(req.params.id, scope);
    if (!info) return res.status(404).json({ error: 'Document not found' });

    if (!canAccess(req.user, info.ownerId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const abs = resolveAbs(info.filePath);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ error: 'File missing on server' });
    }

    // Resolve a real, specific mime: prefer a stored non-generic value,
    // otherwise extension-based detection, otherwise a byte-level sniff.
    // Generic types (application/octet-stream, image/*, etc.) are NEVER
    // sent inline — browsers refuse to preview them and force a download.
    const mime = resolveMime(info.mimeType, abs);
    res.setHeader('Content-Type', mime);
    const dispoType = asAttachment ? 'attachment' : 'inline';
    const safeName = (info.fileName || path.basename(abs)).replace(/"/g, '');
    res.setHeader('Content-Disposition', `${dispoType}; filename="${safeName}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    // nosniff prevents the browser from second-guessing our Content-Type, so
    // a properly-typed image/PDF will render inline instead of downloading.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Allow the dashboards (which fetch via XHR/fetch) to read this resource
    // even when the API base host is different from the frontend host
    // (sandbox split-port deployment).
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
    fs.createReadStream(abs).pipe(res);
  } catch (error) {
    console.error('Serve document error:', error);
    res.status(500).json({ error: 'Failed to serve document' });
  }
}

router.get('/preview/:id', authenticate, (req, res) => serve(req, res, false));
router.get('/download/:id', authenticate, (req, res) => serve(req, res, true));

// ============================================================
// Generic by-path preview/download (for legacy paths stored on application/feeReceiptPath etc.)
// GET /api/files/preview-path?p=/uploads/receipts/foo.png
// ============================================================
async function servePath(req, res, asAttachment) {
  try {
    const p = req.query.p || '';
    if (!p) return res.status(400).json({ error: 'Missing path' });

    // Authorisation: only directors/coordinators see arbitrary; students only their own.
    if (req.user.role !== 'director_admissions' && req.user.role !== 'admin' && req.user.role !== 'coordinator') {
      // verify ownership: check if any of student's records reference this path
      const own = await prisma.$transaction([
        prisma.application.findFirst({ where: { userId: req.user.id, feeReceiptPath: p }, select: { id: true } }),
        prisma.feePayment.findFirst({ where: { userId: req.user.id, receiptPath: p }, select: { id: true } }),
        prisma.document.findFirst({ where: { userId: req.user.id, filePath: p }, select: { id: true } }),
        prisma.profile.findFirst({ where: { userId: req.user.id, photoPath: p }, select: { id: true } }),
        prisma.appeal.findFirst({ where: { userId: req.user.id, proofPath: p }, select: { id: true } }),
      ]);
      if (!own.some(Boolean)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const abs = resolveAbs(p);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ error: 'File missing' });
    }
    // Use the same robust resolution chain so legacy receipts (.jfif, files
    // without extensions, etc.) get a real image/* or application/pdf mime
    // and render inline instead of triggering a download.
    const mime = resolveMime(null, abs);
    res.setHeader('Content-Type', mime);
    const dispoType = asAttachment ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${dispoType}; filename="${path.basename(abs)}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
    fs.createReadStream(abs).pipe(res);
  } catch (error) {
    console.error('Serve path error:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
}

router.get('/preview-path', authenticate, (req, res) => servePath(req, res, false));
router.get('/download-path', authenticate, (req, res) => servePath(req, res, true));

module.exports = router;

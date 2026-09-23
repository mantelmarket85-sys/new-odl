const express = require('express');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireStudent } = require('../middleware/auth');
const { uploadEducation } = require('../middleware/upload');

const router = express.Router();
const prisma = new PrismaClient();

const VALID_LEVELS = ['10years', '11years', '12years']; // 11years = FSC Part-I
const VALID_RESULT_STATUS = ['Completed', 'Waiting'];
const VALID_DOC_TYPES = [
  'dmc', 'certificate', 'char_cert', 'provisional', 'additional', 'part1_dmc',
  // Phase 7 additive: Migration Certificate is optional during application/
  // enrollment but ultimately required. Adding it here does NOT change any
  // existing route behaviour \u2014 existing types still upload exactly as before;
  // this only widens the whitelist so the new optional slot is accepted.
  'migration_cert',
];

const levelLabel = (level) => {
  if (level === '10years') return 'Matric / SSC';
  if (level === '11years') return 'FSc Part-I';
  if (level === '12years') return 'FSc / Intermediate';
  return level;
};

// Helper — strip nullable empties / parse floats safely
const f = (v) => (v === undefined || v === null || v === '') ? null : parseFloat(v);
const s = (v) => (v === undefined || v === null) ? null : String(v).trim() || null;

// ============================================================
// GET /api/education — list student's records WITH attached documents
// ============================================================
router.get('/', authenticate, async (req, res) => {
  try {
    const educations = await prisma.education.findMany({
      where: { userId: req.user.id },
      include: { documents: { orderBy: { createdAt: 'desc' } } },
      orderBy: { level: 'asc' },
    });
    res.json({ educations });
  } catch (error) {
    console.error('Get education error:', error);
    res.status(500).json({ error: 'Failed to fetch education records' });
  }
});

// ============================================================
// POST /api/education — create one unified education record
// (details + multiple optional document uploads in a single call)
//
// Multipart fields:
//   level, degree, major, majorOther, rollNumber,
//   marks, totalMarks, grade,
//   partOneMarks, partOneTotalMarks,
//   board, passingYear, resultStatus
// Multipart files (any subset, all optional):
//   dmc, certificate, char_cert, provisional, additional, part1_dmc
// ============================================================
const educationFields = uploadEducation.fields([
  { name: 'dmc',             maxCount: 1 },
  { name: 'certificate',     maxCount: 1 },
  { name: 'char_cert',       maxCount: 1 },
  { name: 'provisional',     maxCount: 1 },
  { name: 'additional',      maxCount: 1 },
  { name: 'part1_dmc',       maxCount: 1 },
  // Phase 7 additive optional slot (Migration Certificate).
  { name: 'migration_cert',  maxCount: 1 },
]);

router.post('/', authenticate, requireStudent, educationFields, async (req, res) => {
  try {
    const {
      level, degree, major, majorOther, rollNumber,
      marks, totalMarks, grade,
      partOneMarks, partOneTotalMarks,
      board, passingYear, resultStatus,
    } = req.body;

    if (!level || !degree) {
      return res.status(400).json({ error: 'Level and degree are required' });
    }
    if (!VALID_LEVELS.includes(level)) {
      return res.status(400).json({ error: 'Invalid education level' });
    }

    const status = VALID_RESULT_STATUS.includes(resultStatus) ? resultStatus : 'Completed';

    // Validation by level + status
    if (level === '10years') {
      if (!marks || !totalMarks) {
        return res.status(400).json({ error: 'Matric: marks and total marks are required' });
      }
    }
    if (level === '12years') {
      if (status === 'Completed') {
        if (!marks || !totalMarks) {
          return res.status(400).json({ error: 'FSc Result Declared: final marks and total marks are required' });
        }
      } else {
        // Waiting — must have Part-I marks
        if (!partOneMarks || !partOneTotalMarks) {
          return res.status(400).json({ error: 'FSc Result Awaited: Part-I marks and Part-I total marks are required' });
        }
      }
    }
    if (level === '11years') {
      if (!partOneMarks || !partOneTotalMarks) {
        return res.status(400).json({ error: 'FSc Part-I: marks and total marks are required' });
      }
    }

    const existing = await prisma.education.findFirst({
      where: { userId: req.user.id, level },
    });
    if (existing) {
      return res.status(400).json({
        error: `Education record for ${levelLabel(level)} already exists. Please update instead.`,
      });
    }

    const edu = await prisma.education.create({
      data: {
        userId: req.user.id,
        level,
        degree,
        major: s(major),
        majorOther: (major === 'Other') ? s(majorOther) : null,
        rollNumber: s(rollNumber),
        marks: f(marks),
        totalMarks: f(totalMarks),
        grade: s(grade),
        partOneMarks: f(partOneMarks),
        partOneTotalMarks: f(partOneTotalMarks),
        board: s(board),
        passingYear: s(passingYear),
        resultStatus: status,
      },
    });

    // Save attached documents (if any)
    const docs = [];
    const filesObj = req.files || {};
    for (const docType of VALID_DOC_TYPES) {
      const arr = filesObj[docType];
      if (arr && arr[0]) {
        const f0 = arr[0];
        const filePath = `/uploads/education/${f0.filename}`;
        const doc = await prisma.educationDocument.create({
          data: {
            educationId: edu.id,
            docType,
            filePath,
            fileName: f0.originalname,
            fileSize: f0.size,
            mimeType: f0.mimetype,
          },
        });
        docs.push(doc);
      }
    }

    const out = await prisma.education.findUnique({
      where: { id: edu.id },
      include: { documents: true },
    });

    res.status(201).json({ message: 'Education record saved', education: out });
  } catch (error) {
    console.error('Add education error:', error);
    res.status(500).json({ error: 'Failed to add education record' });
  }
});

// ============================================================
// PUT /api/education/:id — update details and optionally upload more documents
// ============================================================
router.put('/:id', authenticate, requireStudent, educationFields, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      level, degree, major, majorOther, rollNumber,
      marks, totalMarks, grade,
      partOneMarks, partOneTotalMarks,
      board, passingYear, resultStatus,
    } = req.body;

    const existing = await prisma.education.findFirst({
      where: { id: parseInt(id), userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Education record not found' });

    if (level && !VALID_LEVELS.includes(level)) {
      return res.status(400).json({ error: 'Invalid education level' });
    }

    const status = resultStatus !== undefined
      ? (VALID_RESULT_STATUS.includes(resultStatus) ? resultStatus : existing.resultStatus)
      : existing.resultStatus;

    const updated = await prisma.education.update({
      where: { id: parseInt(id) },
      data: {
        level: level || existing.level,
        degree: degree || existing.degree,
        major: major !== undefined ? s(major) : existing.major,
        majorOther: major !== undefined
          ? (major === 'Other' ? s(majorOther) : null)
          : existing.majorOther,
        rollNumber: rollNumber !== undefined ? s(rollNumber) : existing.rollNumber,
        marks: marks !== undefined ? f(marks) : existing.marks,
        totalMarks: totalMarks !== undefined ? f(totalMarks) : existing.totalMarks,
        grade: grade !== undefined ? s(grade) : existing.grade,
        partOneMarks: partOneMarks !== undefined ? f(partOneMarks) : existing.partOneMarks,
        partOneTotalMarks: partOneTotalMarks !== undefined ? f(partOneTotalMarks) : existing.partOneTotalMarks,
        board: board !== undefined ? s(board) : existing.board,
        passingYear: passingYear !== undefined ? s(passingYear) : existing.passingYear,
        resultStatus: status,
      },
    });

    // Append new documents (replace existing same docType if provided)
    const filesObj = req.files || {};
    for (const docType of VALID_DOC_TYPES) {
      const arr = filesObj[docType];
      if (arr && arr[0]) {
        // remove old of same type for this education record
        await prisma.educationDocument.deleteMany({
          where: { educationId: existing.id, docType },
        });
        const f0 = arr[0];
        await prisma.educationDocument.create({
          data: {
            educationId: existing.id,
            docType,
            filePath: `/uploads/education/${f0.filename}`,
            fileName: f0.originalname,
            fileSize: f0.size,
            mimeType: f0.mimetype,
          },
        });
      }
    }

    // Auto-complete: if a "Waiting" FSc record is updated to "Completed",
    // the application status auto-flips RESULT_AWAITED → SUBMITTED elsewhere.
    if (existing.resultStatus === 'Waiting' && status === 'Completed' && existing.level === '12years') {
      try {
        const apps = await prisma.application.findMany({
          where: { userId: req.user.id, status: 'RESULT_AWAITED' },
        });
        for (const app of apps) {
          await prisma.application.update({
            where: { id: app.id },
            data: { status: 'SUBMITTED', resultStatus: 'Completed' },
          });
          await prisma.statusEvent.create({
            data: {
              applicationId: app.id,
              userId: req.user.id,
              status: 'SUBMITTED',
              remarks: 'FSc final result updated — application moved to under review',
              actorRole: 'system',
            },
          });
          await prisma.notification.create({
            data: {
              userId: req.user.id,
              title: 'Final Result Submitted',
              message: 'Your FSc final result has been recorded. Your application is now under review.',
            },
          });
        }
      } catch (e) { /* non-fatal */ }
    }

    const out = await prisma.education.findUnique({
      where: { id: existing.id },
      include: { documents: true },
    });

    res.json({ message: 'Education record updated', education: out });
  } catch (error) {
    console.error('Update education error:', error);
    res.status(500).json({ error: 'Failed to update education record' });
  }
});

// ============================================================
// DELETE /api/education/:id  (cascades documents)
// ============================================================
router.delete('/:id', authenticate, requireStudent, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.education.findFirst({
      where: { id: parseInt(id), userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ error: 'Education record not found' });

    // also delete physical files (best-effort)
    const docs = await prisma.educationDocument.findMany({ where: { educationId: existing.id } });
    for (const d of docs) {
      try {
        const abs = path.join(__dirname, '..', '..', d.filePath.replace(/^\//, ''));
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch (_) { /* ignore */ }
    }

    await prisma.education.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Education record deleted' });
  } catch (error) {
    console.error('Delete education error:', error);
    res.status(500).json({ error: 'Failed to delete education record' });
  }
});

// ============================================================
// DELETE /api/education/:eduId/document/:docId — remove a single document
// ============================================================
router.delete('/:eduId/document/:docId', authenticate, requireStudent, async (req, res) => {
  try {
    const { eduId, docId } = req.params;
    const edu = await prisma.education.findFirst({
      where: { id: parseInt(eduId), userId: req.user.id },
    });
    if (!edu) return res.status(404).json({ error: 'Education record not found' });

    const doc = await prisma.educationDocument.findFirst({
      where: { id: parseInt(docId), educationId: edu.id },
    });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    try {
      const abs = path.join(__dirname, '..', '..', doc.filePath.replace(/^\//, ''));
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (_) { /* ignore */ }

    await prisma.educationDocument.delete({ where: { id: doc.id } });
    res.json({ message: 'Document removed' });
  } catch (error) {
    console.error('Delete edu doc error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;

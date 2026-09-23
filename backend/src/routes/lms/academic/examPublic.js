// ============================================================
//  EXAM CONTROLLER — PUBLIC (unauthenticated) endpoints
//  ------------------------------------------------------------
//  Only the transcript verification lookup is public. It accepts a
//  verification code and returns a minimal, safe verification result
//  (no sensitive fields) so a third party can confirm a transcript's
//  authenticity. Mounted BEFORE the authenticated exam router.
// ============================================================
const express = require('express');
const prisma = require('../../../utils/prisma');
const { asyncHandler } = require('../../../utils/lmsHelpers');

const router = express.Router();

// GET /api/lms/academic/exam-verify/:code
router.get('/:code', asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ valid: false, error: 'Verification code required.' });
  const t = await prisma.transcriptRecord.findUnique({ where: { verificationCode: code } });
  if (!t) return res.status(404).json({ valid: false, error: 'No transcript matches this code.' });

  let payload = null;
  try { payload = JSON.parse(t.payloadJson); } catch (_) { payload = null; }

  const valid = t.status === 'ISSUED' || t.status === 'APPROVED';
  res.json({
    valid,
    status: t.status,
    verificationCode: t.verificationCode,
    kind: t.kind,
    issuedAt: t.createdAt,
    approvedAt: t.approvedAt,
    cgpa: t.cgpa,
    totalCredits: t.totalCredits,
    student: payload?.student
      ? { name: payload.student.name, roll: payload.student.roll, program: payload.student.program, session: payload.student.session }
      : null,
    semesters: payload?.semesters || [],
  });
}));

module.exports = router;

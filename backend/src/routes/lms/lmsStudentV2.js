// ============================================================
//  LMS STUDENT (Section 9.4)
//  ------------------------------------------------------------
//  Authenticated student endpoints for the new LMS frontend.
//
//    GET /api/lms/student/profile   Bearer <lmsToken>  (role: Student)
//      → returns the full LmsStudentProfile record copied from the
//        admissions system at enrollment confirmation.
//      → 404 if no profile exists for the authenticated student.
// ============================================================

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { lmsAuth, lmsRequireRole } = require('../../middleware/lmsAuth');

const router = express.Router();
const prisma = new PrismaClient();

// All routes here require an authenticated LMS user.
router.use(lmsAuth);

// GET /api/lms/student/profile
router.get('/profile', lmsRequireRole('Student'), async (req, res) => {
  try {
    const profile = await prisma.lmsStudentProfile.findUnique({
      where: { lmsUserId: req.lmsUser.id },
    });
    if (!profile) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }

    // Parse JSON fields for convenience.
    let missingDocs = [];
    let otherDocs = [];
    try { missingDocs = profile.missingDocs ? JSON.parse(profile.missingDocs) : []; } catch (_) { missingDocs = []; }
    try { otherDocs = profile.otherDocsJson ? JSON.parse(profile.otherDocsJson) : []; } catch (_) { otherDocs = []; }

    return res.json({
      profile: {
        ...profile,
        missingDocs,
        otherDocs,
      },
    });
  } catch (error) {
    console.error('LMS student profile error:', error);
    return res.status(500).json({ error: 'Failed to load student profile.' });
  }
});

module.exports = router;

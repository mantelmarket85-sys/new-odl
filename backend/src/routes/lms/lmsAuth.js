// ============================================================
//  LMS AUTH (Fix 7)
//  ------------------------------------------------------------
//  The LMS uses the student's Roll Number as the username and a
//  temporary system-generated password issued on enrollment.
//
//  Flow:
//   1. POST /api/lms-auth/login { username (=rollNumber), password }
//      → on first login (lmsMustChangePassword) returns mustChangePassword:true
//        plus a short-lived LMS token scoped to the change-password step.
//   2. POST /api/lms-auth/change-password { newPassword }  (Bearer lms token)
//      → enforces strong policy, hashes the new password, clears the
//        temporary password, marks lmsActivated, returns full LMS token.
//   3. GET /api/lms-auth/me  → current LMS session info.
//
//  Until the LMS is fully built, the frontend shows an "Under
//  Construction" page after a successful (post-change) login.
// ============================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const STRONG_PW = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function signLmsToken(payload, expiresIn = '7d') {
  return jwt.sign({ ...payload, scope: 'lms' }, process.env.JWT_SECRET, { expiresIn });
}

async function lmsAuthenticate(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'LMS authentication required.' });
    const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.scope !== 'lms') return res.status(401).json({ error: 'Invalid LMS session.' });
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: decoded.enrollmentId },
      include: { user: { select: { id: true, isActive: true, role: true } } },
    });
    if (!enrollment) return res.status(401).json({ error: 'LMS account not found.' });
    if (enrollment.user?.isActive === false) return res.status(403).json({ error: 'Account deactivated.' });
    req.lms = enrollment;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired LMS session.' });
  }
}

// ------------------------------------------------------------
// POST /api/lms-auth/login
// ------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

    const enrollment = await prisma.enrollment.findFirst({
      where: { lmsUsername: username, status: 'ENROLLED' },
      include: { user: { select: { id: true, email: true, isActive: true } } },
    });
    if (!enrollment) return res.status(401).json({ error: 'Invalid LMS credentials.' });
    if (enrollment.user?.isActive === false) {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact the Super Admin.' });
    }

    // Validate password — against the plaintext temp password (pre-change)
    // OR the stored hash (post-change).
    let ok = false;
    if (enrollment.lmsMustChangePassword) {
      ok = enrollment.lmsPassword && password === enrollment.lmsPassword;
    } else if (enrollment.lmsPasswordHash) {
      ok = await bcrypt.compare(password, enrollment.lmsPasswordHash);
    }
    if (!ok) return res.status(401).json({ error: 'Invalid LMS credentials.' });

    const token = signLmsToken({ enrollmentId: enrollment.id, userId: enrollment.userId });

    if (enrollment.lmsMustChangePassword) {
      return res.json({
        message: 'Password change required',
        mustChangePassword: true,
        token,
        lmsUsername: enrollment.lmsUsername,
      });
    }

    return res.json({
      message: 'LMS login successful',
      mustChangePassword: false,
      token,
      lmsUsername: enrollment.lmsUsername,
      rollNumber: enrollment.rollNumber,
    });
  } catch (error) {
    console.error('LMS login error:', error);
    res.status(500).json({ error: 'LMS login failed. Please try again.' });
  }
});

// ------------------------------------------------------------
// POST /api/lms-auth/change-password  (Bearer LMS token)
// ------------------------------------------------------------
router.post('/change-password', lmsAuthenticate, async (req, res) => {
  try {
    const newPassword = String(req.body.newPassword || '');
    if (!STRONG_PW.test(newPassword)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.',
      });
    }
    // Prevent reusing the temporary password.
    if (req.lms.lmsPassword && newPassword === req.lms.lmsPassword) {
      return res.status(400).json({ error: 'New password must be different from the temporary password.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const updated = await prisma.enrollment.update({
      where: { id: req.lms.id },
      data: {
        lmsPasswordHash: hash,
        lmsPassword: null,
        lmsMustChangePassword: false,
        lmsActivated: true,
      },
    });

    const token = signLmsToken({ enrollmentId: updated.id, userId: updated.userId });
    res.json({
      message: 'Password changed successfully',
      mustChangePassword: false,
      token,
      lmsUsername: updated.lmsUsername,
      rollNumber: updated.rollNumber,
    });
  } catch (error) {
    console.error('LMS change-password error:', error);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// ------------------------------------------------------------
// GET /api/lms-auth/me  (Bearer LMS token)
// ------------------------------------------------------------
router.get('/me', lmsAuthenticate, async (req, res) => {
  res.json({
    lms: {
      lmsUsername: req.lms.lmsUsername,
      rollNumber: req.lms.rollNumber,
      registrationNumber: req.lms.registrationNumber,
      mustChangePassword: req.lms.lmsMustChangePassword,
      activated: req.lms.lmsActivated,
    },
  });
});

module.exports = router;

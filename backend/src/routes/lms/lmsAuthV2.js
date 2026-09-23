// ============================================================
//  LMS AUTH — V2 (Section 5 / Section 6)
//  ------------------------------------------------------------
//  The dedicated LMS frontend (separate React app) authenticates
//  against the new LmsUser model through these endpoints, all
//  mounted under the /api/lms/auth prefix:
//
//    POST /api/lms/auth/login            { username, password }
//    POST /api/lms/auth/change-password  Bearer <tempToken> { newPassword }
//    GET  /api/lms/auth/me               Bearer <lmsToken>
//
//  Tokens:
//    - Full session token  → 30 minutes, payload { userId, role, system:'lms' }
//    - Temp change token    → 5 minutes,  payload { userId, system:'lms', purpose:'password-change' }
//
//  Password policy (server-side): min 8 chars, ≥1 uppercase, ≥1 number,
//  ≥1 special character.
// ============================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { lmsAuth } = require('../../middleware/lmsAuth');
const {
  MAX_FAILED_ATTEMPTS,
  LOCK_WINDOW_MINUTES,
  lockRemainingSeconds,
  recordLoginAttempt,
} = require('../../utils/loginSecurity');
const { autoEnrollStudent } = require('../../services/autoEnrollService');
const { logActivity } = require('../../utils/activityLog');

const router = express.Router();
const prisma = new PrismaClient();

// Strong-password policy: min 8, at least one uppercase, one number, one special.
const STRONG_PW = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// Token lifetimes (per Technical Checklist): 30-min session, 5-min temp token.
const SESSION_TTL = '30m';
const TEMP_TTL = '5m';

function signSessionToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, system: 'lms' },
    process.env.JWT_SECRET,
    { expiresIn: SESSION_TTL }
  );
}

function signTempToken(user) {
  return jwt.sign(
    { userId: user.id, system: 'lms', purpose: 'password-change' },
    process.env.JWT_SECRET,
    { expiresIn: TEMP_TTL }
  );
}

// ------------------------------------------------------------
// UNIFIED LOGIN — Super Admin handoff.
// When a SuperAdmin LmsUser authenticates through the LMS login UI we
// additionally mint an ADMISSIONS-system token (the same shape the
// /api/auth/login endpoint issues) for the matching `User` row, so the
// browser can be handed off to the Admissions app's /super-admin command
// center using the platform's single sign-in. Returns null if no matching
// Admissions super_admin exists.
// ------------------------------------------------------------
async function buildSuperAdminHandoff(lmsUser) {
  try {
    let adminUser = null;
    if (lmsUser.email) {
      adminUser = await prisma.user.findUnique({ where: { email: lmsUser.email.toLowerCase() } });
    }
    if (!adminUser && lmsUser.username) {
      adminUser = await prisma.user.findUnique({ where: { username: lmsUser.username.toLowerCase() } });
    }
    if (!adminUser || adminUser.role !== 'super_admin') return null;

    const adminToken = jwt.sign(
      { userId: adminUser.id, role: adminUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    return {
      adminToken,
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        username: adminUser.username,
        role: adminUser.role,
        mustChangePassword: !!adminUser.mustChangePassword,
      },
    };
  } catch (e) {
    console.error('[unified-login] super admin handoff failed:', e.message);
    return null;
  }
}

// ------------------------------------------------------------
// POST /api/lms/auth/login
// ------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    // Accept the identifier from `username` (preferred) or `email` for clients
    // that send an explicit email field. The same field may itself contain an
    // email address — the lookup below resolves either form.
    const identifier = String(req.body.username || req.body.email || '').trim();
    const username = identifier; // keep variable name for audit logging below
    const password = String(req.body.password || '');
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    // 1. Find LmsUser by username OR email (case-insensitive email match) → 401
    //    if not found. Username lookup preserves the exact original behaviour.
    let user = await prisma.lmsUser.findUnique({ where: { username: identifier } });
    if (!user) {
      const byEmail = identifier.toLowerCase();
      user = await prisma.lmsUser.findUnique({ where: { email: byEmail } });
    }
    if (!user) {
      await recordLoginAttempt({
        system: 'lms', actorType: 'lms_user', username,
        success: false, reason: 'no_such_user', req,
      });
      return res.status(401).json({ error: 'Invalid Username or Password' });
    }

    // 2. Account lockout: refuse while a lock is active
    const lockSecs = lockRemainingSeconds(user.lockedUntil);
    if (lockSecs > 0) {
      await recordLoginAttempt({
        system: 'lms', actorType: 'lms_user', actorId: user.id,
        username: user.username, role: user.role, success: false, reason: 'locked', req,
      });
      const mins = Math.ceil(lockSecs / 60);
      return res.status(429).json({
        error: `Too many failed attempts. Your account is temporarily locked. Please try again in ${mins} minute(s).`,
      });
    }

    // 3. Check isActive → 403 if deactivated
    if (user.isActive === false) {
      await recordLoginAttempt({
        system: 'lms', actorType: 'lms_user', actorId: user.id,
        username: user.username, role: user.role, success: false, reason: 'inactive', req,
      });
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
    }

    // 4. Verify bcrypt password → 401 if wrong (with lockout tracking)
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
      await prisma.lmsUser.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : attempts,
          lockedUntil: shouldLock ? new Date(Date.now() + LOCK_WINDOW_MINUTES * 60 * 1000) : null,
        },
      }).catch(() => {});
      await recordLoginAttempt({
        system: 'lms', actorType: 'lms_user', actorId: user.id,
        username: user.username, role: user.role,
        success: false, reason: shouldLock ? 'locked_now' : 'invalid_password', req,
      });
      if (shouldLock) {
        return res.status(429).json({
          error: `Too many failed attempts. Your account has been locked for ${LOCK_WINDOW_MINUTES} minutes.`,
        });
      }
      return res.status(401).json({ error: 'Invalid Username or Password' });
    }

    // 5. Success: reset lockout counters + record last login + audit
    await prisma.lmsUser.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    }).catch(() => {});

    // 6. Forced first-login password change
    if (user.mustChangePassword === true) {
      await recordLoginAttempt({
        system: 'lms', actorType: 'lms_user', actorId: user.id,
        username: user.username, role: user.role, success: true, reason: 'ok_pw_change', req,
      });
      return res.json({
        requiresPasswordChange: true,
        tempToken: signTempToken(user),
      });
    }

    await recordLoginAttempt({
      system: 'lms', actorType: 'lms_user', actorId: user.id,
      username: user.username, role: user.role, success: true, reason: 'ok', req,
    });

    // 6b. AUTOMATIC COURSE ENROLLMENT (Requirement #2) — Students never
    // self-enroll. On every student login we (idempotently) ensure they are
    // enrolled in the scheme courses for their current semester in the current
    // term. Non-blocking: an enrollment failure must never break the login.
    if (user.role === 'Student') {
      try {
        await autoEnrollStudent(user.id);
      } catch (enrollErr) {
        console.error('[auto-enroll] failed for', user.username, enrollErr.message);
      }
      // Activity timeline (Requirement #7) — record login. Non-blocking.
      try {
        await logActivity({ studentId: user.id, type: 'LOGIN', title: 'Signed in', req });
      } catch (_) { /* ignore */ }
    }

    // 7. Full login
    const response = {
      token: signSessionToken(user),
      role: user.role,
      username: user.username,
    };

    // UNIFIED LOGIN — Super Admin signs in through the LMS UI and is handed
    // off to the Admissions-hosted Super Admin command center.
    if (user.role === 'SuperAdmin') {
      const handoff = await buildSuperAdminHandoff(user);
      if (handoff) {
        response.superAdmin = true;
        response.adminToken = handoff.adminToken;
        response.adminUser = handoff.adminUser;
      }
    }

    return res.json(response);
  } catch (error) {
    console.error('LMS login error:', error);
    return res.status(500).json({ error: 'LMS login failed. Please try again.' });
  }
});

// ------------------------------------------------------------
// POST /api/lms/auth/change-password   (Bearer tempToken)
// ------------------------------------------------------------
router.post('/change-password', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required.' });
    }
    const token = header.slice('Bearer '.length).trim();

    // 1. Verify tempToken (must have system: 'lms', not expired)
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }
    if (decoded.system !== 'lms') {
      return res.status(401).json({ error: 'Invalid session.' });
    }

    const newPassword = String(req.body.newPassword || '');

    // 2. Validate password policy server-side
    if (!STRONG_PW.test(newPassword)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.',
      });
    }

    const user = await prisma.lmsUser.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(401).json({ error: 'LMS account not found.' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Your account has been deactivated.' });
    }

    // 3. Hash new password (bcrypt, saltRounds: 12)
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // 4. Update LmsUser
    const updated = await prisma.lmsUser.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    // 5. If user is Student and linkedRollNumber exists → mark Admissions Enrollment
    if (updated.role === 'Student' && updated.linkedRollNumber) {
      try {
        await prisma.enrollment.updateMany({
          where: { lmsUserId: updated.id },
          data: { lmsPasswordChanged: true },
        });
        // Also reflect it on the legacy fields used by the transition card.
        await prisma.enrollment.updateMany({
          where: { rollNumber: updated.linkedRollNumber },
          data: { lmsPasswordChanged: true, lmsActivated: true, lmsMustChangePassword: false, lmsPassword: null },
        });
      } catch (e) {
        console.warn('LMS change-password: could not sync Enrollment flag:', e.message);
      }
    }

    // 6. Return full login token
    return res.json({
      token: signSessionToken(updated),
      role: updated.role,
      username: updated.username,
    });
  } catch (error) {
    console.error('LMS change-password error:', error);
    return res.status(500).json({ error: 'Failed to change password.' });
  }
});

// ------------------------------------------------------------
// GET /api/lms/auth/me   (Bearer lmsToken)
// ------------------------------------------------------------
//  For the Student role we also surface the REAL identity fields sourced
//  from the Admission System (via buildLiveStudentProfile) so that every
//  place in the LMS that reads the authenticated user shows the same real
//  name / registration / program / photo — never hardcoded placeholders.
router.get('/me', lmsAuth, async (req, res) => {
  const payload = {
    userId: req.lmsUser.id,
    username: req.lmsUser.username,
    // Phase 1 §6 — always expose the DB login email so the frontend can render
    // the REAL identity even when no editable profile row exists yet.
    // (LmsUser has no fullName column; the display name comes from the profile
    // row's fullName, falling back to the username on the frontend.)
    email: req.lmsUser.email || null,
    role: req.lmsUser.role,
    isActive: req.lmsUser.isActive,
    mustChangePassword: req.lmsUser.mustChangePassword,
  };

  if (req.lmsUser.role === 'Student') {
    try {
      const { buildLiveStudentProfile } = require('../../services/admissionsSync');
      const { profile } = await buildLiveStudentProfile(req.lmsUser);
      if (profile) {
        payload.profile = {
          fullName: profile.fullName || null,
          rollNumber: profile.rollNumber || null,
          registrationNumber: profile.registrationNumber || null,
          program: profile.program || null,
          programShortForm: profile.programShortForm || null,
          department: profile.department || null,
          session: profile.session || null,
          semester: profile.semester || null,
          email: profile.email || null,
          phone: profile.phone || null,
          photoUrl: profile.photoUrl || null,
          verificationStatus: profile.verificationStatus || null,
          enrollmentStatus: profile.enrollmentStatus || null,
        };
      }
    } catch (e) {
      // Non-fatal: fall back to the base payload (frontend will fetch /profile).
      console.error('[auth/me] student profile hydrate failed:', e.message);
    }
  } else {
    // Staff roles (Course Coordinator, Exam Controller, Director QEC, etc.) —
    // hydrate the editable name / contact / photo so the global identity
    // (header, sidebar, dashboard) reflects the latest saved profile in real
    // time. Some staff (Course Coordinator / Focal Person) store their profile
    // on LmsStudentProfile, while the Exam Controller and Director QEC store
    // theirs on the dedicated LmsExamProfile row. We read BOTH and merge so a
    // profile update from any of those Settings pages propagates everywhere
    // immediately after refreshUser().
    try {
      const prisma = require('../../utils/prisma');
      const [sp, ep] = await Promise.all([
        prisma.lmsStudentProfile
          .findUnique({ where: { lmsUserId: req.lmsUser.id } })
          .catch(() => null),
        prisma.lmsExamProfile
          .findUnique({ where: { lmsUserId: req.lmsUser.id } })
          .catch(() => null),
      ]);
      // Phase 1 §6 — ALWAYS return a profile for staff (even when neither a
      // student-style nor exam-style profile row exists yet) so the frontend
      // never has to fall back to a hardcoded identity. Prefer the dedicated
      // staff profile (LmsExamProfile) fields, then the LmsStudentProfile
      // snapshot, then the base LmsUser fields (username / login email).
      payload.profile = {
        fullName: (ep && ep.fullName) || (sp && sp.fullName) || req.lmsUser.username || null,
        email: (ep && ep.email) || (sp && sp.email) || req.lmsUser.email || null,
        phone: (ep && ep.phone) || (sp && sp.phone) || null,
        department: (sp && sp.department) || null,
        designation: (sp && sp.designation) || null,
        photoUrl: (ep && ep.photoUrl) || (sp && sp.photoUrl) || null,
      };
    } catch (e) {
      // Non-fatal: base payload still works.
      console.error('[auth/me] staff profile hydrate failed:', e.message);
    }
  }

  return res.json(payload);
});

module.exports = router;

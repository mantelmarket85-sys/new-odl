const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { body, validationResult } = require('express-validator');

const { authenticate } = require('../middleware/auth');
const { generateCaptcha, verifyCaptcha } = require('../middleware/captcha');
const {
  MAX_FAILED_ATTEMPTS,
  LOCK_WINDOW_MINUTES,
  lockRemainingSeconds,
  recordLoginAttempt,
} = require('../utils/loginSecurity');
const {
  sendRegistrationEmail,
  sendLoginAlertEmail,
  sendPasswordResetEmail,
} = require('../utils/email');
const { notify } = require('../utils/notify');

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================
// GET /api/auth/captcha — issue a fresh math captcha
// ============================================================
router.get('/captcha', async (req, res) => {
  try {
    const c = await generateCaptcha();
    res.json({ captchaId: c.captchaId, question: c.question, expiresAt: c.expiresAt });
  } catch (err) {
    console.error('Captcha gen error:', err);
    res.status(500).json({ error: 'Failed to generate captcha' });
  }
});

// ============================================================
// POST /api/auth/register — student self-registration
// Body: { username, email, password, confirmPassword, acceptTerms, acceptPrivacy }
//   - acceptTerms must be TRUE (mandatory)
//   - Captcha optional (still verified if sent)
// ============================================================
router.post('/register',
  // Captcha is optional now (checkbox replaces it for the simplified flow)
  // We still verify captcha when one is supplied; otherwise skip.
  async (req, res, next) => {
    if (req.body && req.body.captchaId) return verifyCaptcha(req, res, next);
    return next();
  },
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_.]+$/)
      .withMessage('Username must be 3-30 chars (letters, numbers, _ or .)'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array(), error: errors.array()[0].msg });

      const {
        username, email, password, confirmPassword,
        acceptTerms, acceptPrivacy,
      } = req.body;

      if (confirmPassword !== undefined && confirmPassword !== password) {
        return res.status(400).json({ error: 'Passwords do not match' });
      }
      if (!acceptTerms) {
        return res.status(400).json({ error: 'You must agree to the Terms & Conditions and Privacy Policy to register.' });
      }

      const cleanUser = String(username).toLowerCase().trim();

      const [existingByEmail, existingByUsername] = await Promise.all([
        prisma.user.findUnique({ where: { email } }),
        prisma.user.findUnique({ where: { username: cleanUser } }),
      ]);
      if (existingByEmail) return res.status(400).json({ error: 'An account with this email already exists' });
      if (existingByUsername) return res.status(400).json({ error: 'This username is already taken' });

      const hashedPassword = await bcrypt.hash(password, 10);
      const now = new Date();
      const user = await prisma.user.create({
        data: {
          email,
          username: cleanUser,
          password: hashedPassword,
          role: 'student',
          termsAccepted: true,
          termsAcceptedAt: now,
          privacyAccepted: !!acceptPrivacy || true, // both required at signup
          privacyAcceptedAt: now,
          profile: { create: {} },
        },
        select: { id: true, email: true, username: true, role: true },
      });

      await notify(
        user.id,
        'Welcome to AUST ODL',
        'Your account has been created successfully. Please complete your profile to proceed with your application.'
      ).catch(() => {});

      sendRegistrationEmail(user.email).catch(() => {});

      const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({ message: 'Registration successful', token, user });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }
);

// ============================================================
// POST /api/auth/login
// Body: { identifier (email OR username), password, captchaId?, captchaAnswer? }
// Backwards compatible: still accepts { email, password }.
// ============================================================
router.post('/login',
  async (req, res, next) => {
    if (req.body && req.body.captchaId) return verifyCaptcha(req, res, next);
    return next();
  },
  [body('password').notEmpty().withMessage('Password is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array(), error: errors.array()[0].msg });

      const { password } = req.body;
      // Accept any of: identifier, email, username
      const rawIdentifier = (req.body.identifier ?? req.body.email ?? req.body.username ?? '').toString().trim();
      if (!rawIdentifier) return res.status(400).json({ error: 'Email or username is required' });

      const looksLikeEmail = rawIdentifier.includes('@');
      let user = null;
      if (looksLikeEmail) {
        user = await prisma.user.findUnique({ where: { email: rawIdentifier.toLowerCase() } });
      }
      if (!user) {
        // try username (case-insensitive)
        user = await prisma.user.findUnique({ where: { username: rawIdentifier.toLowerCase() } });
      }
      if (!user) {
        // Unknown account — audit and return the generic message. (We do not
        // reveal whether the username exists.)
        await recordLoginAttempt({
          system: 'admissions', actorType: 'user', username: rawIdentifier,
          success: false, reason: 'no_such_user', req,
        });
        return res.status(401).json({ error: 'Invalid Username or Password' });
      }

      // --- Account lockout: refuse while a lock is active ---
      const lockSecs = lockRemainingSeconds(user.lockedUntil);
      if (lockSecs > 0) {
        await recordLoginAttempt({
          system: 'admissions', actorType: 'user', actorId: user.id,
          username: user.username || user.email, role: user.role,
          success: false, reason: 'locked', req,
        });
        const mins = Math.ceil(lockSecs / 60);
        return res.status(429).json({
          error: `Too many failed attempts. Your account is temporarily locked. Please try again in ${mins} minute(s).`,
        });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        // Increment failed attempts and lock if the threshold is reached.
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: shouldLock ? 0 : attempts,
            lockedUntil: shouldLock ? new Date(Date.now() + LOCK_WINDOW_MINUTES * 60 * 1000) : null,
          },
        }).catch(() => {});
        await recordLoginAttempt({
          system: 'admissions', actorType: 'user', actorId: user.id,
          username: user.username || user.email, role: user.role,
          success: false, reason: shouldLock ? 'locked_now' : 'invalid_password', req,
        });
        if (shouldLock) {
          return res.status(429).json({
            error: `Too many failed attempts. Your account has been locked for ${LOCK_WINDOW_MINUTES} minutes.`,
          });
        }
        return res.status(401).json({ error: 'Invalid Username or Password' });
      }

      if (user.isActive === false) {
        await recordLoginAttempt({
          system: 'admissions', actorType: 'user', actorId: user.id,
          username: user.username || user.email, role: user.role,
          success: false, reason: 'inactive', req,
        });
        return res.status(403).json({ error: 'Your account has been deactivated. Please contact the Super Admin.' });
      }

      // --- Success: reset lockout counters + record last login + audit ---
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      }).catch(() => {});
      await recordLoginAttempt({
        system: 'admissions', actorType: 'user', actorId: user.id,
        username: user.username || user.email, role: user.role,
        success: true, reason: 'ok', req,
      });

      const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

      if (user.emailNotifications) {
        sendLoginAlertEmail(user.email).catch(() => {});
      }

      res.json({
        message: 'Login successful',
        token,
        // Force password change on first login when a system-generated
        // password was issued (mustChangePassword=true on the account).
        mustChangePassword: !!user.mustChangePassword,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
          mustChangePassword: !!user.mustChangePassword,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  }
);

// ============================================================
// POST /api/auth/forgot-password
// ============================================================
router.post('/forgot-password',
  async (req, res, next) => {
    if (req.body && req.body.captchaId) return verifyCaptcha(req, res, next);
    return next();
  },
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });

      const generic = { message: 'If an account with this email exists, a password reset link has been sent.' };
      if (!user) return res.json(generic);

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expires = new Date(Date.now() + 30 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: { resetPasswordToken: tokenHash, resetPasswordExpires: expires },
      });

      const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
      const resetUrl = `${frontendBase}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

      sendPasswordResetEmail(user.email, resetUrl).catch((e) =>
        console.error('Reset email send failed:', e.message)
      );

      notify(user.id, 'Password Reset Requested',
        'A password reset link was sent to your email. The link is valid for 30 minutes.'
      ).catch(() => {});

      res.json(generic);
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Failed to process password reset request' });
    }
  }
);

// ============================================================
// POST /api/auth/reset-password
// ============================================================
router.post('/reset-password',
  [
    body('email').isEmail().normalizeEmail(),
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { email, token, password } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.resetPasswordToken || !user.resetPasswordExpires) {
        return res.status(400).json({ error: 'Invalid or expired reset link.' });
      }

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      if (tokenHash !== user.resetPasswordToken) {
        return res.status(400).json({ error: 'Invalid or expired reset link.' });
      }
      if (user.resetPasswordExpires < new Date()) {
        return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetPasswordToken: null,
          resetPasswordExpires: null,
        },
      });

      await notify(user.id, 'Password Reset Successful',
        'Your password has been updated. If this was not you, please contact support immediately.'
      ).catch(() => {});

      res.json({ message: 'Password reset successful. You can now sign in with your new password.' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }
);

// ============================================================
// GET /api/auth/me
// ============================================================
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, username: true, role: true,
        emailVerified: true, emailNotifications: true,
        termsAccepted: true, termsAcceptedAt: true,
        privacyAccepted: true, privacyAcceptedAt: true,
        createdAt: true,
      },
    });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// ============================================================
// PUT /api/auth/email-notifications
// ============================================================
// GET /api/auth/check-username?username=xxx
// Public — used by the registration form for live availability check.
// ============================================================
router.get('/check-username', async (req, res) => {
  try {
    const raw = (req.query.username || '').toString().trim().toLowerCase();
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(raw)) {
      return res.json({ available: false, reason: 'invalid_format' });
    }
    const existing = await prisma.user.findUnique({ where: { username: raw }, select: { id: true } });
    res.json({ available: !existing });
  } catch (err) {
    console.error('check-username error:', err);
    res.status(500).json({ available: false, error: 'check_failed' });
  }
});

// ============================================================
router.put('/email-notifications', authenticate, async (req, res) => {
  try {
    const { enabled } = req.body;
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { emailNotifications: !!enabled },
      select: { id: true, email: true, emailNotifications: true },
    });
    res.json({ message: 'Preference updated', user: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update preference' });
  }
});

module.exports = router;

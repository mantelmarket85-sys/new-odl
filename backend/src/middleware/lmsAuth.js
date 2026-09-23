// ============================================================
//  LMS AUTH MIDDLEWARE (Section 6)
//  ------------------------------------------------------------
//  Verifies a JWT issued by the new LmsUser-based LMS auth system.
//
//  Rules:
//   - Token must be present in the Authorization header (Bearer).
//   - Token payload MUST contain system === 'lms'.
//   - The referenced LmsUser must exist.
//   - The LmsUser must be active (isActive === true), else 403.
//   - Attaches req.lmsUser = { id, username, role, isActive, mustChangePassword }.
//
//  Applied to all /api/lms/ routes EXCEPT login + change-password.
//  (login is unauthenticated; change-password uses a short-lived
//   temp token validated inside its own handler.)
// ============================================================

const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function lmsAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'LMS authentication required.' });
    }
    const token = header.slice('Bearer '.length).trim();

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired LMS session.' });
    }

    // Reject any token not minted for the LMS system.
    if (decoded.system !== 'lms') {
      return res.status(401).json({ error: 'Invalid LMS session.' });
    }
    // A temp (password-change) token must not be usable for protected routes.
    if (decoded.purpose === 'password-change') {
      return res.status(401).json({ error: 'Password change required before continuing.' });
    }

    const user = await prisma.lmsUser.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(401).json({ error: 'LMS account not found.' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact the administrator.' });
    }

    req.lmsUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      linkedRollNumber: user.linkedRollNumber,
    };
    next();
  } catch (error) {
    console.error('LMS auth middleware error:', error);
    return res.status(401).json({ error: 'Invalid or expired LMS session.' });
  }
}

// Role guard helper — usage: lmsRequireRole('Student'), lmsRequireRole('Teacher','Provost')
function lmsRequireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.lmsUser) return res.status(401).json({ error: 'LMS authentication required.' });
    if (allowedRoles.length && !allowedRoles.includes(req.lmsUser.role)) {
      return res.status(403).json({ error: 'You do not have permission to access this resource.' });
    }
    next();
  };
}

module.exports = { lmsAuth, lmsRequireRole };

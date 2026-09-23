const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ error: 'Invalid token. User not found.' });
    // Deactivated accounts cannot use the API at all.
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact the Super Admin.' });
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

// ============================================================
// Role guards (strict route-protection)
// Roles: super_admin | director_admissions | coordinator | student | teacher | lms_admin
// Legacy: 'admin' is treated as 'director_admissions' for backward compatibility
// ============================================================

const isSuperAdmin = (role) => role === 'super_admin';
const isDirectorAdmissions = (role) => role === 'director_admissions' || role === 'admin';
const isLmsAdmin = (role) => role === 'lms_admin';

// Strict: only Super Admin
const requireSuperAdmin = (req, res, next) => {
  if (!isSuperAdmin(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. Super Admin privileges required.' });
  }
  next();
};

// Director Admissions OR Super Admin (super admin has system-wide authority)
const requireDirectorAdmissions = (req, res, next) => {
  if (!isDirectorAdmissions(req.user.role) && !isSuperAdmin(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. Director Admissions privileges required.' });
  }
  next();
};

// Backward-compatible alias for older routes that referenced requireAdmin
const requireAdmin = requireDirectorAdmissions;

const requireCoordinator = (req, res, next) => {
  if (req.user.role !== 'coordinator') {
    return res.status(403).json({ error: 'Access denied. Coordinator privileges required.' });
  }
  next();
};

const requireAdminOrCoordinator = (req, res, next) => {
  if (!isDirectorAdmissions(req.user.role) && req.user.role !== 'coordinator' && !isSuperAdmin(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. Director Admissions or Coordinator privileges required.' });
  }
  next();
};

const requireStudent = (req, res, next) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Access denied. Student account required.' });
  }
  next();
};

const requireTeacher = (req, res, next) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: 'Access denied. Teacher account required.' });
  }
  next();
};

// Strict: only LMS Admin can access LMS-admin-only routes
const requireLmsAdmin = (req, res, next) => {
  if (!isLmsAdmin(req.user.role) && !isSuperAdmin(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. LMS Admin privileges required.' });
  }
  next();
};

// LMS access — students, teachers, and LMS admin only.
const requireLmsRole = (req, res, next) => {
  if (!['student', 'teacher', 'lms_admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. LMS access required.' });
  }
  next();
};

// ============================================================
// COORDINATOR DEPARTMENT SCOPING
// ------------------------------------------------------------
// Loads the coordinator's assigned department and exposes:
//   req.coordinatorDepartmentId  → number | null
//   req.coordinatorProgramIds    → number[] (programs in that department)
// Director Admissions / Super Admin are NOT scoped (see-all).
// This MUST be used (or its inline equivalent) on every coordinator
// data endpoint so a coordinator can never read another department.
// ============================================================
async function attachCoordinatorScope(req, res, next) {
  try {
    if (req.user.role === 'coordinator') {
      const dept = await prisma.department.findUnique({
        where: { coordinatorId: req.user.id },
        include: { programs: { select: { id: true } } },
      });
      if (!dept) {
        // A coordinator with no department assigned can see nothing.
        req.coordinatorDepartmentId = null;
        req.coordinatorProgramIds = [];
      } else {
        req.coordinatorDepartmentId = dept.id;
        req.coordinatorProgramIds = dept.programs.map((p) => p.id);
      }
    } else {
      req.coordinatorDepartmentId = null;
      req.coordinatorProgramIds = null; // null = unrestricted (director/super)
    }
    next();
  } catch (e) {
    console.error('attachCoordinatorScope error:', e.message);
    res.status(500).json({ error: 'Failed to resolve department scope' });
  }
}

/**
 * Build a Prisma `where.programId` clause that restricts a coordinator to
 * their own department's programs. Returns {} for director/super (unrestricted).
 * Returns { programId: { in: [] } } when a coordinator has no department
 * (matches nothing) so they never accidentally see global data.
 */
function coordinatorProgramFilter(req) {
  if (req.user.role === 'coordinator') {
    const ids = req.coordinatorProgramIds || [];
    return { programId: { in: ids.length ? ids : [-1] } };
  }
  return {};
}

/**
 * Guard a single application/program access by a coordinator. Throws a 403 via
 * res when the requested programId is outside the coordinator's department.
 * Returns true when access is allowed.
 */
function coordinatorCanAccessProgram(req, programId) {
  if (req.user.role !== 'coordinator') return true;
  const ids = req.coordinatorProgramIds || [];
  return ids.includes(programId);
}

module.exports = {
  authenticate,
  requireAdmin,                   // alias kept for backward compatibility
  requireSuperAdmin,
  requireDirectorAdmissions,
  requireLmsAdmin,
  requireCoordinator,
  requireAdminOrCoordinator,
  requireStudent,
  requireTeacher,
  requireLmsRole,
  isSuperAdmin,
  isDirectorAdmissions,
  attachCoordinatorScope,
  coordinatorProgramFilter,
  coordinatorCanAccessProgram,
};

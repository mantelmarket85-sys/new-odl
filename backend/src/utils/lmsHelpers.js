// ============================================================
//  LMS SHARED HELPERS
//  ------------------------------------------------------------
//  Small, dependency-free utilities reused across LMS academic
//  routes: pagination parsing, async route wrapping, JSON-field
//  parsing, and a consistent error responder.
// ============================================================

/** Parse standard list query params: page, pageSize, search, sortBy, sortDir. */
function parseListQuery(query = {}, { defaultSort = 'createdAt', maxPageSize = 100 } = {}) {
  let page = parseInt(query.page, 10);
  let pageSize = parseInt(query.pageSize, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > maxPageSize) pageSize = maxPageSize;
  const sortBy = (query.sortBy && String(query.sortBy)) || defaultSort;
  const sortDir = String(query.sortDir).toLowerCase() === 'asc' ? 'asc' : 'desc';
  const search = query.search ? String(query.search).trim() : '';
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    sortBy,
    sortDir,
    search,
    orderBy: { [sortBy]: sortDir },
  };
}

/** Build a paginated response envelope. */
function paginated(items, total, { page, pageSize }) {
  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

/** Wrap an async express handler so thrown errors hit the error middleware. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Safe JSON.parse with a fallback. */
function safeJson(str, fallback) {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch (_) {
    return fallback;
  }
}

/** Throw a typed HTTP error caught by the error middleware. */
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

/**
 * Reusable Prisma `select` for exposing an LmsUser safely (no passwordHash,
 * no lock/security fields). Includes profile when present.
 */
const SAFE_USER_SELECT = {
  id: true,
  username: true,
  role: true,
  isActive: true,
  linkedRollNumber: true,
  createdAt: true,
  profile: true,
};

/**
 * Recursively strip sensitive keys from any plain object / array before it
 * leaves the API. Acts as a safety net even if a query forgot to use a
 * narrow select. Mutates a shallow clone, returns sanitized value.
 */
const SENSITIVE_KEYS = new Set([
  'passwordHash',
  'failedLoginAttempts',
  'lockedUntil',
  'resetToken',
  'resetTokenExpiry',
]);

function sanitize(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, seen));
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(k)) continue;
    out[k] = sanitize(v, seen);
  }
  return out;
}

module.exports = {
  parseListQuery,
  paginated,
  asyncHandler,
  safeJson,
  httpError,
  SAFE_USER_SELECT,
  sanitize,
};

// ============================================================
// Lightweight in-memory TTL cache (Phase 2 performance).
// ------------------------------------------------------------
// A tiny, dependency-free cache for hot, rarely-changing reads
// (departments, programs, public payment config, open cycle …).
// This process is a single long-running Node server (PM2 fork),
// so a module-level Map is a perfectly good process cache.
//
// Usage:
//   const cache = require('../utils/cache');
//   const data = await cache.wrap('departments:public', 60_000, async () => {
//     return prisma.department.findMany(...);
//   });
//   cache.invalidate('departments:public');           // exact key
//   cache.invalidatePrefix('departments');            // all department keys
//
// Keep TTLs short (30–120s) so admins never see very stale data,
// and always invalidate on the corresponding write path.
// ============================================================

const store = new Map(); // key -> { value, expiresAt }

function get(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt !== 0 && hit.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

function set(key, value, ttlMs = 60_000) {
  store.set(key, { value, expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0 });
  return value;
}

// Fetch-through helper: returns cached value or computes+caches it.
async function wrap(key, ttlMs, producer) {
  const cached = get(key);
  if (cached !== undefined) return cached;
  const value = await producer();
  // Never cache null/undefined producer results (avoids caching errors).
  if (value !== undefined && value !== null) set(key, value, ttlMs);
  return value;
}

function invalidate(key) {
  store.delete(key);
}

function invalidatePrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function clear() {
  store.clear();
}

module.exports = { get, set, wrap, invalidate, invalidatePrefix, clear };

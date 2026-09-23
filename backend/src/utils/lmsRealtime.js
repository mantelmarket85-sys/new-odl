// ============================================================
//  LMS REAL-TIME EVENT BUS  (Server-Sent Events)
//  ------------------------------------------------------------
//  Lightweight, dependency-free real-time layer used by the
//  Course Coordinator modules (Announcements + Quick Messages).
//  Works inside the existing Express/Cloudflare-free Node server
//  without adding a WebSocket dependency.
//
//  Clients open an EventSource to GET /api/lms/academic/coordinator/events
//  (token via ?token=). The server keeps the connection open and pushes
//  named events (`announcement`, `message`, `replacement`, ...). Each
//  connection is tagged with the authenticated LmsUser id so events can
//  be targeted to specific recipients (direct messages) or broadcast.
//
//  This is a singleton module — a single shared bus per server process.
// ============================================================

// Map<userId, Set<res>> — open SSE response streams per user.
const clients = new Map();

function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
}

function removeClient(userId, res) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(userId);
}

function writeEvent(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (_) {
    /* stream closed — ignore; cleanup handled on 'close' */
  }
}

/** Push an event to specific user ids. */
function emitTo(userIds, event, data) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  for (const id of ids) {
    const set = clients.get(id);
    if (!set) continue;
    for (const res of set) writeEvent(res, event, data);
  }
}

/** Broadcast an event to every connected client. */
function emitAll(event, data) {
  for (const set of clients.values()) {
    for (const res of set) writeEvent(res, event, data);
  }
}

/** Number of currently connected clients (for diagnostics). */
function connectionCount() {
  let n = 0;
  for (const set of clients.values()) n += set.size;
  return n;
}

/** True if the given user has at least one open SSE connection (online). */
function isOnline(userId) {
  const set = clients.get(userId);
  return !!(set && set.size > 0);
}

/** List of currently-online user ids. */
function onlineUsers() {
  return Array.from(clients.keys());
}

module.exports = { addClient, removeClient, writeEvent, emitTo, emitAll, connectionCount, isOnline, onlineUsers };

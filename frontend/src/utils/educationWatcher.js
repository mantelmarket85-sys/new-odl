/* ============================================================
   §1.2(d)(e) — SYSTEM-WIDE REAL-TIME EDUCATION RECORD WATCHER
   ------------------------------------------------------------
   A single shared poller that watches the signed-in student's
   education records and broadcasts a DOM event the moment
   anything changes — no manual refresh required anywhere in the
   system.

   It deliberately does NOT change any Education Record logic:
   it only READS `GET /education` and re-broadcasts.

   Events dispatched on `window`:
     • 'aust:education-updated'  → detail = { records, signature, previous }
     • 'aust:refresh'            → the app-wide refresh signal already
                                    used by the dashboard sections.

   Any component can subscribe:
     window.addEventListener('aust:education-updated', handler)
   ============================================================ */

import api from './api';

const NORMAL_INTERVAL = 8000; // steady-state polling
const FAST_INTERVAL = 3000;   // "fast window" right after a change
const FAST_WINDOW_MS = 30000; // how long the fast window lasts

let subscribers = 0;
let timer = null;
let currentInterval = 0;
let fastUntil = 0;
let lastSignature = null;
let lastRecords = [];
let inFlight = false;
let listenersBound = false;

/**
 * Build a stable fingerprint of the education records so we can tell
 * — cheaply and reliably — whether anything at all has changed.
 */
function buildSignature(records) {
  if (!Array.isArray(records)) return '';
  return records
    .map((r) => [
      r.id,
      r.level,
      r.resultStatus,
      r.degreeName,
      r.boardUniversity,
      r.passingYear,
      r.obtainedMarks,
      r.totalMarks,
      r.percentage,
      r.dmcPath,
      r.certificatePath,
      r.migrationCertificatePath,
      r.characterCertificatePath,
      r.partOneDmcPath,
      r.partOneObtainedMarks,
      r.partOneTotalMarks,
      r.updatedAt,
      // attached documents are part of the record's state
      Array.isArray(r.documents)
        ? r.documents.map((d) => `${d.id}:${d.documentType || ''}:${d.updatedAt || d.createdAt || ''}`).sort().join(',')
        : '',
    ].join('|'))
    .sort()
    .join('~');
}

function broadcast(records, signature, previous) {
  try {
    window.dispatchEvent(new CustomEvent('aust:education-updated', {
      detail: { records, signature, previous },
    }));
  } catch {}
  try {
    window.dispatchEvent(new Event('aust:refresh'));
  } catch {}
}

async function poll({ silent = true } = {}) {
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await api.get('/education', { params: { _t: Date.now() } });
    const records = res.data?.educations || res.data?.educationRecords || res.data?.records || res.data || [];
    const list = Array.isArray(records) ? records : [];
    const signature = buildSignature(list);

    if (lastSignature === null) {
      // First read — establish the baseline without shouting about it.
      lastSignature = signature;
      lastRecords = list;
      return;
    }

    if (signature !== lastSignature) {
      const previous = lastRecords;
      lastSignature = signature;
      lastRecords = list;
      // Something changed → enter the fast window so every dependent
      // view converges within a couple of seconds.
      fastUntil = Date.now() + FAST_WINDOW_MS;
      applyInterval();
      broadcast(list, signature, previous);
    }
  } catch {
    if (!silent) { /* stay quiet — this watcher must never break the UI */ }
  } finally {
    inFlight = false;
  }
}

function applyInterval() {
  const desired = Date.now() < fastUntil ? FAST_INTERVAL : NORMAL_INTERVAL;
  if (desired === currentInterval && timer) return;
  if (timer) clearInterval(timer);
  currentInterval = desired;
  timer = setInterval(() => {
    // Drop back out of the fast window when it expires.
    if (currentInterval === FAST_INTERVAL && Date.now() >= fastUntil) applyInterval();
    poll();
  }, currentInterval);
}

function onWake() {
  if (document.visibilityState === 'hidden') return;
  poll();
}

function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;
  window.addEventListener('focus', onWake);
  window.addEventListener('online', onWake);
  document.addEventListener('visibilitychange', onWake);
}

function unbindListeners() {
  if (!listenersBound) return;
  listenersBound = false;
  window.removeEventListener('focus', onWake);
  window.removeEventListener('online', onWake);
  document.removeEventListener('visibilitychange', onWake);
}

/**
 * Start the shared watcher. Returns a stop function.
 * Reference-counted, so it is safe to call from several components.
 */
export function startEducationWatcher() {
  subscribers += 1;
  if (subscribers === 1) {
    bindListeners();
    applyInterval();
    poll();
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      currentInterval = 0;
      unbindListeners();
    }
  };
}

/**
 * Force an immediate check — call this right after a save/delete so the
 * change is detected instantly rather than on the next tick.
 */
export function pingEducationWatcher() {
  fastUntil = Date.now() + FAST_WINDOW_MS;
  applyInterval();
  poll();
}

export function getLastEducationRecords() {
  return lastRecords;
}

export default { startEducationWatcher, pingEducationWatcher, getLastEducationRecords };

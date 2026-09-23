// ============================================================
// BigBlueButton (BBB) helper utility
// ------------------------------------------------------------
// Provides checksum-based BBB API access for the LMS live-class
// feature. Teachers create/join meetings as moderators; students
// join as attendees (handled on the student side).
//
// Configuration (environment variables):
//   BBB_URL    -> base API URL, e.g. https://bbb.example.com/bigbluebutton/api
//   BBB_SECRET -> shared secret used to compute the request checksum
//
// When BBB is NOT configured the helper degrades gracefully:
//   isConfigured() -> false
//   Callers should then fall back to a manually-published joinUrl
//   stored on the LiveClass record (the existing behaviour).
// ============================================================

const crypto = require('crypto');

function getConfig() {
  let base = (process.env.BBB_URL || '').trim();
  const secret = (process.env.BBB_SECRET || '').trim();
  // Normalise: ensure the base ends at ".../api" without a trailing slash.
  if (base.endsWith('/')) base = base.slice(0, -1);
  return { base, secret };
}

function isConfigured() {
  const { base, secret } = getConfig();
  return Boolean(base && secret);
}

// Compute the BBB checksum for a given API call.
// checksum = SHA1(callName + queryString + secret)
function checksum(callName, queryString, secret) {
  return crypto.createHash('sha1').update(callName + queryString + secret).digest('hex');
}

// Build a fully-signed BBB API URL for a given call.
function buildUrl(callName, params) {
  const { base, secret } = getConfig();
  if (!base || !secret) throw new Error('BigBlueButton is not configured');
  const qs = new URLSearchParams(params).toString();
  const cs = checksum(callName, qs, secret);
  return `${base}/${callName}?${qs}&checksum=${cs}`;
}

// Minimal XML field extractor (BBB returns small XML payloads).
function xmlField(xml, tag) {
  if (!xml) return null;
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

async function bbbGet(callName, params) {
  const url = buildUrl(callName, params);
  const resp = await fetch(url, { method: 'GET' });
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, xml: text };
}

// Derive a stable BBB meeting id from a LiveClass id.
function meetingIdFor(liveClassId) {
  return `lms-class-${liveClassId}`;
}

// Ensure a meeting exists. Idempotent: BBB's create returns the same
// meeting if it already exists (with the same meetingID).
// Returns { meetingID, moderatorPW, attendeePW }.
async function ensureMeeting({ liveClassId, name, moderatorPW, attendeePW, durationMin, record = true }) {
  const meetingID = meetingIdFor(liveClassId);
  const params = {
    meetingID,
    name: name || `Class ${liveClassId}`,
    moderatorPW: moderatorPW || `mod-${liveClassId}`,
    attendeePW: attendeePW || `att-${liveClassId}`,
    record: record ? 'true' : 'false',
    autoStartRecording: 'false',
    allowStartStopRecording: 'true',
    welcome: 'Welcome to the live class. Audio, webcam, chat, whiteboard, polls and screen sharing are available.',
    muteOnStart: 'false',
    webcamsOnlyForModerator: 'false',
    allowModsToUnmuteUsers: 'true',
    lockSettingsDisableCam: 'false',
    lockSettingsDisableMic: 'false',
    lockSettingsDisablePrivateChat: 'false',
    lockSettingsDisablePublicChat: 'false',
    lockSettingsDisableNotes: 'false',
    lockSettingsLockedLayout: 'false',
  };
  if (durationMin && Number(durationMin) > 0) params.duration = String(durationMin);

  const { xml } = await bbbGet('create', params);
  const returncode = xmlField(xml, 'returncode');
  if (returncode && returncode.toUpperCase() === 'FAILED') {
    const key = xmlField(xml, 'messageKey');
    // idempotent: "idNotUnique" means the meeting already exists -> treat as ok
    if (key && key.toLowerCase() !== 'idnotunique') {
      throw new Error(`BBB create failed: ${xmlField(xml, 'message') || key}`);
    }
  }
  return { meetingID, moderatorPW: params.moderatorPW, attendeePW: params.attendeePW };
}

// Build a signed join URL for a participant.
//   role: 'moderator' | 'attendee'
function joinUrl({ liveClassId, fullName, role = 'attendee', moderatorPW, attendeePW, userId }) {
  const meetingID = meetingIdFor(liveClassId);
  const password = role === 'moderator'
    ? (moderatorPW || `mod-${liveClassId}`)
    : (attendeePW || `att-${liveClassId}`);
  const params = {
    meetingID,
    fullName: fullName || 'Participant',
    password,
    redirect: 'true',
  };
  if (userId) params.userID = String(userId);
  return buildUrl('join', params);
}

// Check whether a meeting is currently running.
async function isMeetingRunning(liveClassId) {
  if (!isConfigured()) return false;
  try {
    const { xml } = await bbbGet('isMeetingRunning', { meetingID: meetingIdFor(liveClassId) });
    return (xmlField(xml, 'running') || '').toLowerCase() === 'true';
  } catch (_) {
    return false;
  }
}

// Retrieve recordings for a live class. Returns an array of
// { recordID, name, state, startTime, endTime, playbackUrl, type }.
// Returns [] gracefully when BBB is not configured or on error.
async function getRecordings(liveClassId) {
  if (!isConfigured()) return [];
  try {
    const { xml } = await bbbGet('getRecordings', { meetingID: meetingIdFor(liveClassId) });
    if ((xmlField(xml, 'returncode') || '').toUpperCase() !== 'SUCCESS') return [];
    const recordings = [];
    // Each <recording> block.
    const blocks = xml.match(/<recording>[\s\S]*?<\/recording>/gi) || [];
    for (const block of blocks) {
      const recordID = xmlField(block, 'recordID');
      const state = xmlField(block, 'state');
      const startTime = xmlField(block, 'startTime');
      const endTime = xmlField(block, 'endTime');
      const name = xmlField(block, 'name');
      // playback format(s)
      const playbacks = block.match(/<format>[\s\S]*?<\/format>/gi) || [];
      let playbackUrl = null;
      let type = null;
      if (playbacks.length) {
        playbackUrl = xmlField(playbacks[0], 'url');
        type = xmlField(playbacks[0], 'type');
      }
      recordings.push({ recordID, name, state, startTime, endTime, playbackUrl, type });
    }
    return recordings.filter((r) => (r.state || '').toLowerCase() === 'published' || !r.state);
  } catch (_) {
    return [];
  }
}

// End a meeting (moderator action).
async function endMeeting({ liveClassId, moderatorPW }) {
  if (!isConfigured()) return false;
  try {
    const { xml } = await bbbGet('end', {
      meetingID: meetingIdFor(liveClassId),
      password: moderatorPW || `mod-${liveClassId}`,
    });
    return (xmlField(xml, 'returncode') || '').toUpperCase() === 'SUCCESS';
  } catch (_) {
    return false;
  }
}

module.exports = {
  isConfigured,
  ensureMeeting,
  joinUrl,
  isMeetingRunning,
  endMeeting,
  getRecordings,
  meetingIdFor,
};

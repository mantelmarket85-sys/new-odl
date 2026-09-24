# BigBlueButton private-server setup (A–Z)

This LMS hosts live classes on **your own BigBlueButton (BBB) server**.
The LMS never depends on a third-party meeting vendor. Physical server
provisioning is done by the client; this guide covers install, wiring
the LMS, classroom features, and day-to-day operations.

---

## A. What you get

When BBB is configured, the LMS:

| Role | What happens |
| --- | --- |
| Course Coordinator | Schedules a class. The LMS **creates** a BBB meeting automatically (no manual join URL required). |
| Teacher | Clicks **Go Live** / **Enter Class**. Opens a signed **moderator** URL (host). The class is marked LIVE so students can join. |
| Student | Clicks **Join Live** / **Join Classroom**. The LMS opens an in-app BBB classroom (iframe) as an **attendee**, with camera, mic, chat, whiteboard, polls, screen share and breakout rooms. |

If BBB is **not** configured, a coordinator can still paste a fallback Join URL on the class.

Classroom tools unlocked for every meeting:

- Audio join / listen-only
- Webcam
- Public & private chat
- Participants panel
- Raise hand
- Multi-user whiteboard
- Presentation viewer
- Screen sharing
- Polls
- Reactions & emojis
- Breakout rooms
- Recording (teacher/moderator start/stop)

---

## B. Server requirements (client-owned)

BBB is designed to run on a **dedicated Ubuntu server**, not as a
sidecar container next to the LMS.

Recommended baseline (small faculty):

- Ubuntu 22.04 LTS (x86_64)
- 8+ vCPU, 16 GB RAM, 100+ GB SSD
- Public IPv4, ports **80 / 443 / 16384–32768 UDP** open
- A hostname with a valid DNS A record, e.g. `bbb.youruniversity.edu`
- Ports **80/443 TCP** for HTTPS; **16384–32768 UDP** for media (WebRTC)

Larger concurrent classes need more CPU/RAM. Follow the official
[BBB install notes](https://docs.bigbluebutton.org/) for sizing.

The LMS application server is **separate**. It only talks to BBB over
HTTPS using the shared secret.

---

## C. Install BigBlueButton

SSH to the dedicated host as root (or a sudo user).

1. Point DNS:

   ```
   bbb.youruniversity.edu.  A  <server-public-ip>
   ```

   Wait until `dig +short bbb.youruniversity.edu` returns that IP.

2. Run the official installer (Ubuntu 22.04):

   ```bash
   wget -qO- https://raw.githubusercontent.com/bigbluebutton/bbb-install/v3.0.x-release/bbb-install.sh | bash -s -- \
     -w -v jammy-300 \
     -s bbb.youruniversity.edu \
     -e admin@youruniversity.edu
   ```

   `-w` enables the HTML5 client. `-s` is the hostname. `-e` is the
   Let's Encrypt contact. The script installs Nginx, Coturn/FreeSWITCH,
   Redis, Mongo, and the BBB HTML5 client.

3. Confirm:

   ```bash
   bbb-conf --status
   bbb-conf --secret
   ```

   `--secret` prints:

   ```
   URL: https://bbb.youruniversity.edu/bigbluebutton/api
   Secret: <long-hex-string>
   ```

   Keep the **URL** and **Secret**. They go into the LMS `.env`.

4. Optional firewall (ufw):

   ```bash
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw allow 16384:32768/udp
   ufw enable
   ```

---

## D. Configure the LMS

On the **LMS backend** host, set:

```bash
# Full BBB API root, no trailing slash
BBB_URL=https://bbb.youruniversity.edu/bigbluebutton/api
BBB_SECRET=<the shared secret from bbb-conf --secret>
```

Restart the LMS API process after changing env vars.

The helper lives at `backend/src/utils/bbb.js`. When both values are
set, `isConfigured()` is true and every live-class join:

1. Calls BBB `create` (idempotent — existing meetings are reused).
2. Signs a `join` URL (`role=moderator` for teachers, `role=attendee`
   for students) with SHA-1 checksum.
3. Returns that URL to the frontend.

No extra database migration is required.

---

## E. How each LMS surface uses BBB

### Course Coordinator — Live Class Schedule

`lms-frontend` page: **Live Class Schedule**.

- Create / reschedule / delete classes.
- Leave **Join URL** blank when BBB is configured — the backend
  (`POST /api/lms/academic/coordinator/live-classes`) calls
  `bbb.ensureMeeting` and stores an attendee join URL.
- A fallback Join URL is only needed if BBB is not installed yet.

### Teacher — Live Classes

`lms-frontend` page: **Live Classes** (teacher).

- **Go Live** / **Enter Class** → `GET /api/lms/academic/teacher/live-classes/:id/join`
  creates the meeting (if needed) and opens a **moderator** window.
- **End** → `PUT .../end` calls BBB `end` and marks the class ENDED.
- Teachers cannot schedule or delete classes.

### Student — Live Classes

`lms-frontend` page: **Live Classes** (student).

- **Join Live** / **Join Classroom** works even when no stored
  `joinUrl` exists, as long as BBB is configured.
- `GET /api/lms/academic/student/live-classes/:id/join` signs an
  attendee URL, records attendance, and the page embeds BBB in an
  iframe (`allow="camera; microphone; fullscreen; display-capture"`).
- **Leave** records leave time + duration.
- Recordings: stored `recordingUrl` plus BBB `getRecordings`.

---

## F. Features the LMS unlocks on `create`

`ensureMeeting` sends:

```
muteOnStart=false
webcamsOnlyForModerator=false
allowModsToUnmuteUsers=true
lockSettingsDisableCam=false
lockSettingsDisableMic=false
lockSettingsDisablePrivateChat=false
lockSettingsDisablePublicChat=false
lockSettingsDisableNotes=false
lockSettingsLockedLayout=false
record=true
allowStartStopRecording=true
```

Students can therefore use camera, microphone, chat, notes/whiteboard
and screen share. Moderators (teachers) can unmute users and start
recording.

The student UI also lists these tools in the classroom side rail.

---

## G. Recordings

1. Teacher starts recording from the BBB toolbar (or it can be started
   from the meeting).
2. After the meeting ends, BBB processes the recording (often 5–20
   minutes).
3. Students see it via:
   - a URL the teacher pastes on the class (**Add Recording**), and/or
   - `GET /live-classes/:id/recordings` which calls BBB `getRecordings`.

Published playback URLs are served by the BBB host
(`https://bbb.youruniversity.edu/playback/...`).

---

## H. Smoke test (end-to-end)

1. Confirm `bbb-conf --status` is all running.
2. Set `BBB_URL` + `BBB_SECRET` on the LMS backend and restart it.
3. Coordinator: schedule a class for an offering with an assigned teacher
   (Join URL empty).
4. Teacher: open **Live Classes** → **Go Live**. A BBB room should open
   as moderator. Allow camera/mic.
5. Student (enrolled in that course): **Live Classes** → **Join Live**.
   The in-app classroom should load; allow camera/mic when prompted.
6. Teacher: **End**. Students can no longer join. Recording (if started)
   appears after BBB finishes processing.

---

## I. Troubleshooting

| Symptom | Check |
| --- | --- |
| Student/teacher sees “No meeting link” | `BBB_URL` / `BBB_SECRET` missing or LMS not restarted. |
| BBB create failed / checksum error | Secret mismatch. Re-copy from `bbb-conf --secret`. URL must end with `/bigbluebutton/api` (no trailing slash). |
| iframe blank / “refused to connect” | BBB hostname TLS; LMS preview host must be allowed to iframe BBB (same HTTPS site, or BBB `content_security_policy` / `X-Frame-Options`). Opening **new tab** still works. |
| No camera / mic | Browser permission; iframe `allow` attributes (already set); client must use HTTPS. UDP 16384–32768 blocked on the BBB host. |
| Audio works, video does not | Coturn / firewall UDP range. |
| Students cannot share webcam | Confirm `webcamsOnlyForModerator=false` (set by LMS create). |
| Meeting already exists | Harmless — `create` is idempotent (`idNotUnique` is treated as success). |

Useful BBB commands:

```bash
bbb-conf --check
bbb-conf --secret
bbb-conf --restart
journalctl -u bbb-html5 -f
```

---

## J. Security notes

- Treat `BBB_SECRET` like a password. Anyone with it can create meetings
  and forge join URLs.
- LMS join URLs are signed per user (`fullName`, `userID`, role password).
- Teachers receive the **moderator** password; students receive the
  **attendee** password.
- Do not put the secret in the frontend. Only the backend signs URLs.

---

## K. Fallback (BBB not yet installed)

Until the private server is live:

1. Leave `BBB_URL` / `BBB_SECRET` unset.
2. Coordinator pastes a Join URL on the class (any HTTPS meeting link).
3. Teachers/students use that URL. In-app BBB tools are unavailable;
   the link opens as a generic meeting.

Once BBB is configured, new classes no longer need a pasted URL.

---

## L. File map (for operators)

| Path | Role |
| --- | --- |
| `backend/src/utils/bbb.js` | Checksum API: create, join, end, recordings |
| `backend/src/routes/lms/academic/student.js` | Student list + join + leave + recordings |
| `backend/src/routes/lms/academic/teacher.js` | Teacher list + moderator join + end |
| `backend/src/routes/lms/academic/coordinator.js` | Schedule + auto-create meeting |
| `lms-frontend/src/pages/student/LiveClasses.jsx` | In-app classroom + tools rail |
| `lms-frontend/src/pages/teacher/TeacherLiveClasses.jsx` | Host join (new window) |
| `lms-frontend/src/pages/admin/LiveClassSchedule.jsx` | Coordinator timetable |

The Admissions System (`frontend/`) is not involved.

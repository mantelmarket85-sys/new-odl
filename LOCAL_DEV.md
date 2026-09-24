# Running the Project Locally (laptop runbook)

Everything you need to run the whole project (backend + LMS frontend +
admissions frontend) on your laptop. Tested flow: three terminals.

## Ports

| App               | Command (in that folder)  | URL                      |
|-------------------|---------------------------|--------------------------|
| `backend`         | `npm run dev`             | http://localhost:5000    |
| `lms-frontend`    | `npm run dev`             | http://localhost:5174    |
| `frontend` (ODL admissions) | `npm run dev` | http://localhost:3000    |

## Prerequisites

- Node.js 18+ (Node 20/22 recommended)
- No external database needed — the app uses **SQLite**, and a pre-seeded
  database ships with the repo (`backend/prisma/prisma/dev.db`).

## 1. Backend (terminal 1)

```bash
cd backend
npm install
```

A `.env` file ships with the repo (also see `.env.example`). If you ever
delete it or pull a repo that only has the template:

```bash
cp .env.example .env   # then set a long random JWT_SECRET in it
```

`.env` contains everything the app needs:

```
DATABASE_URL="file:./prisma/dev.db"   # the pre-seeded SQLite DB (relative to backend/prisma/)
JWT_SECRET="<long random string>"     # required — JWT signing fails without it
PORT=5000
FRONTEND_URL="http://localhost:5174"
```

Start it:

```bash
npm run dev
# → AUST ODL Backend running on port 5000
```

On first boot it runs idempotent startup initializers (demo-account upserts,
startup cleanup). On a slow laptop this can take a few seconds.

> **If `npm install` / `prisma generate` complains about downloading engine
> files from `binaries.prisma.sh`** (TLS errors): just re-run the command —
> Prisma retries and caches successful downloads. The schema now only builds
> the `native` engine (one download, for your OS) instead of a pinned extra
> Linux target, which removed the flaky extra download. If your network
> blocks that domain entirely, ask a colleague for a copy of their
> `backend/node_modules/.prisma/client` + `node_modules/@prisma/engines`
> folders, or use a mirror:
> `PRISMA_ENGINES_MIRROR=https://your-mirror/path npx prisma generate`.

## 2. LMS frontend (terminal 2)

```bash
cd lms-frontend
npm install
npm run dev
# → Vite ready on http://localhost:5174
```

Open **http://localhost:5174** — you should land on the LMS login page.

Useful scripts:

```bash
npm run smoke   # headless boot test: bundles the app and mounts it in jsdom.
                # Exits non-zero and prints the exact error if anything that
                # would cause a blank white screen is present.
npm run build   # production build sanity check
```

## 3. Admissions (ODL) frontend (terminal 3, optional)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

This app proxies `/api` and `/uploads` to the backend on 5000 automatically.

## Demo logins (already in the shipped database)

**LMS frontend (port 5174):**

| Role             | Email                    | Password        |
|------------------|--------------------------|-----------------|
| Student          | student@lms.com          | Student@123     |
| Teacher          | teacher@lms.com          | Teacher@123     |
| Course Coordinator | coordinator@lms.com     | Coordinator@123 |
| Focal Person     | focal@lms.com            | Focal@123       |
| Exam Controller  | examcontroller@lms.com   | Exam@123        |
| QEC Director     | qec@lms.com              | QEC@123         |
| Provost          | provost@lms.com          | Provost@123     |

**Admissions frontend (port 3000):**

| Role             | Email / username         | Password       |
|------------------|--------------------------|----------------|
| Super Admin      | superadmin@aust.edu.pk / "superadmin" | superadmin123 |
| Director Admissions | director@aust.edu.pk / "director" | director123  |
| Coordinator      | coordinator@aust.edu.pk / "coordinator" | coord123   |
| Student          | student@example.com / "student"   | student123     |

## Troubleshooting

**Blank white screen on the LMS frontend (5174)**
1. Open the browser DevTools console — the first red error names the file.
2. Run `npm run smoke` in `lms-frontend` — it reproduces boot errors without
   a browser and prints the stack.
3. Make sure you have the latest code (`git pull`); a corrupted duplicate
   block in `api.js` / `ManageOffering.jsx` / `MarksCorrection.jsx` was the
   cause of the white screen and is fixed.

**`prisma generate` fails with "Environment variable not found: DATABASE_URL"**
You're missing `backend/.env` — create it from `.env.example`.

**Backend starts but login returns 500**
Missing/empty `JWT_SECRET` in `backend/.env`.

**"Port 5174 is in use" / server won't start**
Both Vite apps use `strictPort`, so they fail instead of silently picking
another port. Close the other app (or `npx kill-port 5174` etc.).

**I want a fresh database (wipes demo data)**
```bash
cd backend
rm prisma/prisma/dev.db          # the committed pre-seeded DB (git-tracked!)
DATABASE_URL="file:./prisma/dev.db" npx prisma db push   # recreate empty schema
npm run dev                                                              # demo LMS accounts auto-seed on boot
```
(Prefer not deleting the tracked DB? Point `DATABASE_URL` in `.env` at a new
file, e.g. `file:./prisma/local-dev.db`, and run `npx prisma db push`.)

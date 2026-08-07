# Pulse — real-time product analytics

A full-stack event analytics platform: think a minimal, self-hosted Mixpanel.
Client apps send events over a simple HTTP API, and a live dashboard shows
them arriving in real time over WebSockets, with in-memory time-series
aggregation so the charts don't hammer the database on every refresh.

Built to demonstrate backend systems design (custom rate limiting, custom
aggregation, real-time transport, layered architecture, auth with token
rotation) rather than another CRUD-with-a-form-builder app.

## Live demo flow

1. Register an account, create a project → get an API key.
2. `curl` a test event at the API key (snippet is in the dashboard).
3. Watch it land in the live chart and activity feed within milliseconds,
   pushed over a WebSocket — no polling required for the update itself
   (polling is kept as a resilience fallback, see below).

## Architecture

```
┌─────────────┐        HTTPS/REST         ┌──────────────────────┐
│   React SPA │ ─────────────────────────▶ │   Express API layer   │
│  (Vite)     │ ◀───────────────────────── │  routes → services →  │
│             │                            │  repositories → SQLite│
│             │        WebSocket           │                        │
│             │ ◀════════push updates═════ │  In-memory aggregator │
└─────────────┘                            └──────────────────────┘
```

**Layered backend** — routes only parse/validate input (Zod) and call a
service; services hold business logic and are the only thing that touches
more than one repository; repositories are the only thing that touches
SQL. This keeps route handlers thin and testable, and means the SQL layer
could be swapped (e.g. SQLite → Postgres) by rewriting only `repositories/`.

**Two hand-built data structures**, because using an off-the-shelf
rate-limit or analytics library would defeat the point of a portfolio piece:

- **`lib/rateLimiter.js`** — a sliding-window-log rate limiter. Unlike a
  fixed-window counter, it can't be burst-doubled at window boundaries
  (100 req at :59 + 100 req at :01 with a naive fixed-minute window =
  200 req in 2 seconds even under a "100/min" cap). Eviction of
  timestamps that aged out of the window uses binary search, and a
  background sweep bounds memory for idle keys.

- **`lib/timeSeriesAggregator.js`** — a per-minute bucketed ring buffer
  per (project, event) pair, kept in memory. Recording an event is O(1);
  reading the last hour of a chart is O(60) instead of a `GROUP BY` scan
  over a growing events table. Buckets expire lazily (checked on next
  write to that ring slot) instead of on a timer, so idle series cost
  nothing.

**Real-time transport** — a `WebSocketServer` in `noServer` mode attaches
to the same HTTP server's `upgrade` event, authenticates the connection
with the same JWT used for REST calls, and keeps a `Map<projectId,
Set<WebSocket>>` so broadcasts only iterate actual subscribers, not every
open socket on the process. Dead connections are reaped with a ping/pong
heartbeat. The client's `useLiveEvents` hook reconnects with exponential
backoff on drop, and the dashboard also polls every 15s as a belt-and-braces
fallback in case a push is ever missed.

**Auth** — bcrypt-hashed passwords, short-lived (15 min) JWT access tokens,
longer-lived refresh tokens that are hashed before storage and rotated
(the old one is revoked) on every refresh, so a leaked refresh token has a
single use before the rotation invalidates it.

## Stack

| Layer      | Choice                                                      |
|------------|---------------------------------------------------------------|
| Frontend   | React 19, Vite, React Router, Recharts                       |
| Backend    | Node.js, Express 5, `ws`, Zod, JWT, bcrypt                   |
| Storage    | SQLite via `better-sqlite3` (sync, embedded, zero ops burden) |
| Testing    | Vitest + Supertest (29 tests: unit + integration)             |
| Infra      | Docker, docker-compose                                       |

SQLite was a deliberate choice for a project of this scope: it removes an
entire class of "did I configure the connection pool right" concerns
during a demo, while `better-sqlite3`'s synchronous API keeps the
repository layer simple. The schema (see `config/db.js`) is normalized
and indexed for the query patterns the dashboard actually uses
(`project_id, occurred_at` and `project_id, name, occurred_at`), so
swapping in Postgres later would be a connection-layer change, not a
redesign.

## Running locally

### With Docker

```bash
docker compose up --build
# client → http://localhost:5173
# server → http://localhost:4000
```

### Without Docker

```bash
# Terminal 1
cd server
npm install
cp .env.example .env
npm run dev

# Terminal 2
cd client
npm install
npm run dev
```

## Tests

```bash
cd server
npm test
```

29 tests covering:
- Rate limiter correctness (window-boundary burst prevention, per-key
  isolation, memory sweep)
- Aggregator correctness (bucket rollover, ring-buffer wraparound
  staleness, momentum calculation)
- Auth integration (registration validation, login, refresh rotation,
  token reuse rejection)
- Event ingestion integration (API key auth, batch insert, validation,
  rate-limit enforcement under load)

## Project structure

```
server/
  src/
    routes/        # HTTP layer: parse + validate + delegate
    services/       # business logic (auth, analytics)
    repositories/    # SQL access, one file per table
    middleware/      # auth guards, error handling
    lib/            # rate limiter, aggregator, JWT helpers
    ws/             # WebSocket hub
  tests/           # unit + integration tests

client/
  src/
    pages/          # Dashboard, Auth
    components/     # StatCard, LiveChart, PulseMark, ProtectedRoute
    context/        # AuthContext
    lib/            # API client, WebSocket hook
```

## What I'd do next with more time

- Move the in-memory aggregator to Redis so it survives process restarts
  and works across multiple server instances (right now it's correct for
  a single-instance deployment, and a horizontally scaled deployment
  would need subscribers to fan out via a pub/sub broker instead of an
  in-process `Map`).
- Add cursor-based pagination to the recent-events feed for very high
  volume projects.
- Property-level filtering/segmentation in the dashboard (currently only
  event-name breakdown).

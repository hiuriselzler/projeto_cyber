# 02 — Architecture

## 1. The shape of the system

```
┌─────────────────────────────────────────────┐
│  Expo / React Native app  (the real client) │
│                                             │
│  UI ── TanStack Query ── local SQLite ◄──┐  │   ← every read & write lands here
│                             │            │  │
│                        sync outbox ──────┘  │
└────────────────────────────┬────────────────┘
                             │  HTTPS, batched, background
                             ▼
┌─────────────────────────────────────────────┐
│  FastAPI                                    │
│    routers ─► services ─► repositories      │
│                  │                          │
│                  └─► domain/  (pure)        │
└────────────────────────────┬────────────────┘
                             ▼
                     PostgreSQL 16
```

The load-bearing idea: **the phone's SQLite database is the working copy, and Postgres is the
durable shared copy.** The UI never awaits the network. See [ADR-001](decisions/ADR-001.md).

## 2. Repository layout

A single repo, three workspaces:

```
projeto_SHS/
├── apps/
│   ├── mobile/                  # Expo app
│   │   ├── app/                 # expo-router file-based routes
│   │   ├── src/
│   │   │   ├── features/        # strength/, cardio/, planning/, profile/
│   │   │   ├── account/         # sign-in, registration, password flows — calls sync/ and crypto/ (ADR-012)
│   │   │   ├── domain/          # the core, client side — wraps core-rs, or mirrors it in TS (ADR-004)
│   │   │   ├── db/              # Drizzle schema, migrations, queries
│   │   │   ├── sync/            # outbox, pull/push, conflict resolution
│   │   │   ├── recording/       # GPS task, location pipeline, live session store
│   │   │   ├── crypto/          # privacy key, argon2id, XChaCha20 — the only crypto (ADR-007)
│   │   │   ├── platform/        # the ONLY code that knows the OS — Android now (ADR-009)
│   │   │   └── ui/              # design system primitives
│   │   └── assets/
│   └── api/                     # FastAPI service
│       ├── app/
│       │   ├── main.py
│       │   ├── core/            # config, logging, security primitives
│       │   ├── api/v1/          # routers — HTTP only
│       │   ├── services/        # orchestration, transactions
│       │   ├── repositories/    # SQLAlchemy queries
│       │   ├── models/          # SQLAlchemy ORM
│       │   ├── schemas/         # Pydantic request/response
│       │   └── domain/          # PURE: the core, server side — wraps core-rs, or mirrors it in Python (ADR-004)
│       ├── alembic/
│       ├── seeds/               # exercise catalog
│       └── tests/
├── core-rs/                     # the pure domain core — ADR-004
│   ├── src/{progression,strength,gps,codec,zones}/
│   └── bindings/{pyo3,uniffi}/  # uniffi/ is a workspace package; only src/domain/ imports it (ADR-012)
├── infra/
│   └── postgres/roles.sql       # the two database roles, one idempotent script — ADR-011
├── packages/
│   └── shared/                  # TS types from OpenAPI, domain fixtures, i18n catalogs
├── docker-compose.yml           # postgres:16 + adminer, local development only
└── docs/                        # you are here
```

Folder-level rules are in [responsibility-map.md](responsibility-map.md).

## 3. The domain core — the most important boundary

The core contains the progression engine, e1RM, HR zones, the GPS pipeline, the stream codecs and
volume aggregation. It is **pure**: no database, no HTTP, no clock, no randomness (INV-10).

Both sides need it. The phone must project the next cycle's numbers while offline; the server must be
able to recompute authoritatively. If the two implementations ever disagree, sync thrashes.

**How it is implemented is [ADR-004](decisions/ADR-004.md)** — accepted, subject to a two-day
toolchain spike in [task 001](tasks/001-project-bootstrap.md):

- **Primary:** one Rust crate, `core-rs`, exposed to FastAPI via PyO3 and to the Expo app via
  UniFFI. Written once, tested once, structurally identical on both sides.
- **Fallback, if the spike fails:** the logic is written twice — Python in the API, TypeScript in
  the app — and policed by shared JSON fixtures in `packages/shared/fixtures/`, run by both the
  pytest and Jest suites, so a divergence fails CI on both sides.

Either way the fixtures exist and every suite runs them; under the Rust core they are regression
tests rather than the only thing standing between two copies.

The surface stays tiny on purpose: pure functions over plain data, no classes, no framework
types. That is what keeps the FFI boundary pleasant if ADR-004 is accepted, and what makes the
duplication survivable if it is not.

Rejected outright: **server-only projection** (breaks offline planning, [ADR-001](decisions/ADR-001.md)).

## 4. Mobile app

| Concern | Choice | Note |
|---|---|---|
| Navigation | `expo-router` | File-based, deep-linkable |
| Native projects | Continuous native generation | `android/` is generated by `expo prebuild` and never committed; native settings live in config plugins (INV-28) |
| Local DB | `expo-sqlite` + Drizzle ORM | Typed queries, real migrations |
| Server state | TanStack Query | Reads local DB; sync is separate |
| Ephemeral UI state | Zustand | Small stores, not a global bucket |
| Active workout | **SQLite, not a store** | INV-09 |
| Background GPS | `expo-location` + `expo-task-manager` | §6 |
| Maps | `react-native-maps` | Native provider — Google Maps on Android, Apple Maps when iOS ships; no tile bill |
| Charts | `victory-native` (Skia) | Smooth on large series |
| Forms | `react-hook-form` + `zod` | Zod schemas shared with API types |
| Language | `expo-localization` + `i18next`, ICU MessageFormat | Catalogs in `packages/shared/i18n/`, read by the API too (INV-27, [ADR-008](decisions/ADR-008.md)) |
| Units and numbers | `Intl`, behind one formatting module in `src/ui/` | SI in, unit system and locale out — the only place a unit is converted (INV-01) |

**One platform now, two by design** ([ADR-009](decisions/ADR-009.md)). The app targets Android
first. Everything that differs by operating system lives in `src/platform/` and the Expo config
plugins, and no other folder may know which OS it runs on (INV-28) — so iOS is added, not ported.

**Rendering the plan.** Planned cycles come out of the local DB already materialised, so the
calendar is a plain query — no computation on the render path.

**The set row is the product.** One row: `[ 40 kg ][ 6 ][ RIR 2 ][ ✓ ]`, previous performance
greyed behind it, number pads that never cover the row being edited. This gets more design
attention than anything else in the app.

## 5. API

FastAPI, async throughout, SQLAlchemy 2.0 async sessions over psycopg 3 with server-side prepared
statements off, so a transaction-mode pooler can sit in front of Postgres (NFR-12).

**Layer discipline** — each layer may only call the one below it:

```
router      HTTP: parse, validate, authorize, serialize.  No business rules. No ORM.
  ↓
service     Orchestration + transaction boundary. Calls domain for decisions.
  ↓
repository  SQLAlchemy queries. Always user-scoped (INV-15). No business rules.
  ↓
model       ORM tables. Data shape only.

domain      Pure. Called by services. Imports nothing from the layers above.
```

Import-linter enforces this in CI, so it stays true.

**Endpoint groups** (`/api/v1`):

```
auth/        register, login, refresh, logout, me
exercises/   catalog + custom CRUD
routines/    templates CRUD
workouts/    CRUD, sets, history, PRs
mesocycles/  CRUD, generate, reconcile, cycle/session/set edits
activities/  CRUD, stream upload, splits
cardio-plans/ CRUD, generate, reconcile
analytics/   volume by muscle, RIR trend, zone distribution, totals
sync/        pull (changes since cursor), push (batched upsert)
```

**Sync is the primary write path.** The per-entity POST/PATCH endpoints exist for correctness and
for future clients, but the mobile app writes almost exclusively through `sync/push`.

## 6. Recording pipeline (cardio)

**Only GPS sports use this pipeline.** Pool swim is lap-entered and indoor row is interval-entered
(INV-19); they produce an activity and its segments directly, with no track, no polyline and no
streams. The recorder chooses its path from `sport_profiles.recording_mode`, and the code below
is the `gps` branch:

```
expo-location background task
    ↓  every point, immediately
local SQLite  (raw points, unmodified — INV-13)
    ↓  on tick, for the live display
in-memory accumulator (distance, pace, elevation)
    ↓  on finish
GPS pipeline v1:  accuracy filter → outlier rejection → elevation smoothing → accumulate → splits
    ↓
activity row (derived columns) + encoded polyline + streams
    ↓  when online
sync push (streams compressed, uploaded separately from the row)
```

Raw points are kept until the activity has synced, then trimmed to the streams. Keeping raw data
until derivation is confirmed is what makes INV-13's "recompute and reproduce" claim honest.

Track storage format — polyline + typed streams rather than one row per point — is
[ADR-003](decisions/ADR-003.md).

## 7. Sync protocol

- Every syncable row: UUIDv7 PK (INV-16), `updated_at`, `deleted_at`, `sync_version`.
- **Pull:** `GET /sync/changes?since=<cursor>` returns rows changed after the cursor, grouped by
  entity, plus a new cursor.
- **Push:** `POST /sync/push` with a batch of upserts. Idempotent because the client owns the IDs.
- **Conflicts:** last-write-wins per row, by `updated_at`, with three carve-outs —
  - Sets and activities are **append-only in practice**; a row present on either side is never
    dropped (NFR-4).
  - A plan edited on two devices resolves by taking the newer *microcycle*, not the newer field,
    so a cycle can't end up half from each device.
  - **Within plan data, who wrote a microcycle decides before the clock does**
    ([ADR-004](decisions/ADR-004.md)). Every microcycle carries `engine_version` and
    `last_write_kind` (`engine` | `user`). When two copies of the same microcycle meet:

    | Incoming vs stored | Winner |
    |---|---|
    | engine vs engine, **different** `engine_version` | **The higher engine version**, whatever the timestamps say |
    | engine vs engine, same version | The newer `updated_at` — ordinary last-write-wins |
    | user vs engine | **The user write.** An edit is the baseline the engine projects *from* (FR-3.14); the server then re-projects the cycle's engine-owned rows at its own version |
    | user vs user | The newer `updated_at` — two genuine human edits, accepted as last-write-wins |

    **An older engine's projection never overwrites a newer one** (INV-06). A device running an
    older engine yields rather than fights: it does not re-project a cycle last projected by a newer
    engine, and a push that tries is answered `superseded` — an expected outcome, not an error.
- Outbox rows carry a retry count and back off exponentially. Sync failures are invisible to the
  user unless they persist past a threshold.

## 8. What this architecture is optimised for, and what it costs

**Optimised for:** working with no signal, instant logging, a plan you can see and trust, and
being able to change the projection algorithm later without rewriting history.

**Costs we are accepting, explicitly:**
- A native domain core compiled for both sides — or, if ADR-004's spike fails, two implementations of
  it policed by shared fixtures (§3).
- A real sync protocol, which is more work than a CRUD API and where the subtle bugs will be.
- Local migrations must be versioned as carefully as server migrations, because a device can be
  many app versions behind.

**Designed to grow into:** hundreds of users active at the same time (NFR-12). No number is committed
yet, but the API holds no state that correctness depends on and its database access is pooling-safe
from the first commit, so scaling out is a deploy setting rather than a rewrite.

**Not optimised for:** social graph reads or real-time anything. Neither is a v1 goal
([00-project-context.md](00-project-context.md) § Non-goals), and the design should be revisited if
either becomes one.

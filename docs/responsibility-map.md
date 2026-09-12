# Responsibility Map

What belongs where, and — more usefully — what must **not**. These rules are enforced in CI, not by
memory: `import-linter` and ruff for the API, ESLint for the mobile app, each rule proven by a known-bad
fixture ([task 001](tasks/001-project-bootstrap.md), [06 §3](06-operations.md)).

> Replaces an earlier map that described a Telegram attendance bot. That project is unrelated to
> this one; the old file is not a source of truth for anything here.

---

## core-rs/ — the pure domain core

*Subject to [ADR-004](decisions/ADR-004.md). If that ADR is rejected, the same responsibilities
and prohibitions apply to `apps/api/app/domain/` and `apps/mobile/src/domain/` instead, in
duplicate.*

**Responsible for:**
- the progression engine (generation + reconciliation, all six strategies)
- **the XP scorer** (INV-21, INV-22) — it lives here, beside the planner, because its required
  input is a *prescription*; a "points service" that could see raw volume would be a safety bug
- e1RM (INV-07), volume aggregation, PR detection, `is_counted_set()` (INV-04), and **per-muscle
  attribution** — primary muscle 1.0 set, each secondary 0.2 (FR-2.16) — so the weighting exists in
  exactly one place
- the GPS pipeline (filter, outlier reject, smooth, accumulate, split)
- stream encoding and decoding ([ADR-003](decisions/ADR-003.md))
- HR zone computation (INV-14)
- load rounding (INV-02)

**Must NOT contain:**
- any I/O whatsoever — no database, no filesystem, no network
- a clock (`SystemTime`) or a random number generator
- anything that knows about HTTP, SQL, React, or a screen

**Rule:** pure functions over plain data. "Now" is a parameter, never a call (INV-10). The
boundary test is simple — **if it does I/O, it does not belong here.** That keeps the FFI surface
to data in, data out.

**Bindings** (`bindings/pyo3`, `bindings/uniffi`) contain *only* type marshalling. No logic ever
lives in a binding, because logic there would exist once per binding and defeat the entire point.
The UniFFI binding is a workspace package that only `apps/mobile/src/domain/` may import
([ADR-012](decisions/ADR-012.md)).

---

## apps/api/app/api/v1/ — routers

**Responsible for:** routes, request/response schemas, authentication, authorization checks,
HTTP status codes, serialization.

**Must NOT contain:** business rules, ORM queries, transaction management, calls into `domain/`.
A router calls exactly one service method and shapes the result.

---

## apps/api/app/services/ — orchestration

**Responsible for:** use cases, transaction boundaries, calling `domain/` for decisions and
`repositories/` for data, emitting derived updates (PR recalculation, reconciliation triggers).

**Must NOT contain:** raw SQL or ORM query construction (that is the repository's job), HTTP
concepts (status codes, headers), or the decision logic itself — a service that computes next
cycle's weight inline has stolen work from `domain/`.

---

## apps/api/app/repositories/ — data access

**Responsible for:** SQLAlchemy queries, eager-loading strategy, pagination, upserts for sync.

**Must NOT contain:** business rules, or **any method that does not take a user scope** (INV-15).

**The one exception:** calls to the unscoped `SECURITY DEFINER` functions allowlisted in
[ADR-011](decisions/ADR-011.md) live in a single module, `repositories/unscoped.py`, importable only by
the authentication and maintenance services — enforced by import-linter. Nothing else in the API reads
a row without a user.

---

## apps/api/app/models/ — ORM

**Responsible for:** table definitions, relationships, column constraints.

**Must NOT contain:** computed business properties, validation beyond DB constraints, or query
methods. A model is a shape, not a service.

---

## apps/api/app/core/ — infrastructure

**Responsible for:** settings, logging config, password hashing, JWT encode/decode, the DB session
factory — which sets `app.user_id` with `SET LOCAL` in every transaction and checks the connecting role
at boot ([ADR-011](decisions/ADR-011.md)) — rate limiting, dependency-injection wiring.

**Must NOT contain:** anything domain-specific. Nothing in `core/` should know what a mesocycle is.

---

## apps/api/alembic/ · seeds/ · tests/

- **alembic/** — migrations only, expand/contract, hand-reviewed ([06 §4](06-operations.md)).
- **seeds/** — the global exercise catalog and muscle groups. Idempotent, re-runnable.
- **tests/** — `unit/` (domain, no I/O, fast), `integration/` (real Postgres), and
  `fixtures/` (shared JSON cases, loaded from `packages/shared/`).

---

## apps/mobile/app/ — routes

**Responsible for:** `expo-router` screens and layouts. Thin. A screen composes feature
components and nothing else.

**Must NOT contain:** business logic, direct database queries, or fetch calls.

**Rule:** the root layout calls exactly two entry points below it — `src/db/`'s migration and
`src/account/`'s bootstrap ([ADR-012](decisions/ADR-012.md)). No other route imports either folder.

---

## apps/mobile/src/features/ — feature modules

One folder per feature (`strength/`, `cardio/`, `planning/`, `profile/`), each with its own
`components/`, `hooks/`, and `queries/`.

**Responsible for:** UI composition and feature-local state.

**Must NOT contain:** duplicated domain logic (import it from `src/domain/`), raw SQL (use
`src/db/`), direct calls to the sync layer or to `src/crypto/` — account flows go through
`src/account/` — **a literal user-facing string** (INV-27), or a unit
conversion — that belongs to the formatting module in `src/ui/` (INV-01).

**Rule:** features may not import from each other. Anything shared moves down into `src/domain/`,
`src/db/`, or `src/ui/`.

---

## apps/mobile/src/domain/ — the core, from the client's side

Under [ADR-004](decisions/ADR-004.md) this is a thin typed wrapper over the `core-rs` native
module — marshalling and nothing else — and the only folder that imports the binding package
([ADR-012](decisions/ADR-012.md)). If that ADR is rejected, it is a full TypeScript mirror of
the Python core, verified against the same fixtures ([02 §3](02-architecture.md)).

**Must NOT contain:** anything React, anything from `expo-*`, anything async — and under ADR-004,
**no domain logic at all**. A calculation that appears here rather than in `core-rs` is the exact
divergence the ADR exists to prevent.

---

## apps/mobile/src/db/ — local database

**Responsible for:** the Drizzle schema, local migrations, typed queries, the pre-migration
backup step ([06 §4](06-operations.md)).

**Must NOT contain:** network calls, or React components.

---

## apps/mobile/src/sync/ — the sync layer

**Responsible for:** the outbox, push/pull, cursors, retry and backoff, conflict resolution.

**Must NOT contain:** UI, or business rules — conflict *policy* is described in
[02 §7](02-architecture.md) and lives here; conflict *decisions* about training data belong in
`domain/`.

**Rule:** this is the only folder that talks to the API. Nothing else issues an HTTP request.

---

## apps/mobile/src/account/ — account flows

**Responsible for:** registration, sign-in (including unwrapping the privacy key on a new device),
session bootstrap on launch, password change and reset, email verification and change, logout, and the
session list. It decides **when** the privacy key is generated, wrapped, unwrapped or re-wrapped, and
calls `src/crypto/` to do it ([ADR-012](decisions/ADR-012.md)).

**Must NOT contain:** an HTTP client (it calls `src/sync/`), a crypto library or `expo-secure-store`
(it calls `src/crypto/`), screens or UI components, or `console` output — passwords pass through it.

**Rule:** routes and features reach the network and the privacy key only through this folder.
`src/sync/` never imports it: session-token storage and automatic refresh stay in `src/sync/`. Its
bootstrap entry point — restore the session, start `src/sync/` — is what the root layout calls at launch.

---

## apps/mobile/src/recording/ — activity capture, per sport

**Responsible for:** dispatching on `sport_profiles.recording_mode` (INV-19) to one of three
recorders — GPS, lap, or manual — plus the background location task, permission flows, writing
raw points, the live accumulator, and invoking the pipeline on finish.

**Must NOT contain:** the pipeline maths (that is the core), or **any hardcoded sport
assumption** — no `min/km` literal, no assumption a track exists, no branch on a sport enum where
a profile field would do. A new sport must not require editing this folder's shared code.

**Rule:** one entry component per sport (`recorders/PoolSwim.tsx`, `recorders/IndoorRow.tsx`, …).
Sports differ in their capture UX by design; that difference lives in separate components, not in
conditionals inside one.

---

## apps/mobile/src/platform/ — the only code that knows the operating system

**Responsible for:** everything that differs between Android and iOS — background-location service
configuration, notification channels, haptics and store specifics behind RevenueCat — exposed through
interfaces the rest of the app calls without knowing which OS answers ([ADR-009](decisions/ADR-009.md)).

**Must NOT contain:** feature logic, domain logic, or SQL. It adapts; it does not decide.

**Rule:** the one folder where `Platform.OS`, `Platform.select` and `.android.*` / `.ios.*` files are
allowed (INV-28). Today it holds Android implementations only — and that is exactly why the rule is
enforced by lint: with one platform, an OS assumption anywhere else breaks nothing and would otherwise
go unnoticed until iOS is added.

---

## apps/mobile/src/crypto/ — client-side cryptography

**Responsible for:** the privacy key's whole lifecycle ([ADR-007](decisions/ADR-007.md)) —
generating it from the OS CSPRNG, deriving the wrapping key with argon2id, wrapping and unwrapping it,
sealing and opening privacy zones with XChaCha20-Poly1305, and keeping the key in `expo-secure-store`.

**Must NOT contain:** network calls, SQL, UI, or the decision of *when* to wrap or re-wrap —
`src/account/` decides that and calls in. Callers receive plaintext zones and wrapped blobs, never the key. And
no KDF parameter below the login hash's cost ([04 §6](04-security-and-auth.md)).

**Rule:** the only folder that may import a crypto library, enforced by lint. `expo-secure-store` is
importable only here and in `src/sync/` (for session tokens), and the privacy key's storage name is
private to this folder. Not in `core-rs`: the core may not hold randomness (INV-10), and the server never
decrypts, so a shared implementation would buy nothing.

---

## apps/mobile/src/ui/ — design system

**Responsible for:** the token source (INV-23) and primitives — button, chip, sheet, numeric
keypad, set row, metric tile, cycle cell, the octopus mark. Theming, typography, motion. **The one
formatting module** that turns SI values into the user's unit system and locale — kg to lb, a
decimal comma in pt-BR — and is the only place a unit is ever converted (INV-01, ADR-008).

**Must NOT contain:**
- feature knowledge. A `SetRow` takes props; it does not know what a mesocycle is
- **any literal hex value, font size, or animation duration** — those live in the token file
  (INV-23), and a hardcoded colour is how dark mode silently breaks
- **any literal user-facing string** — every label is a catalog key (INV-27). A hardcoded English
  string is how the Portuguese build silently ships half-translated

**Rule:** every value a designer might change is a token. See
[07-brand-and-ui.md](07-brand-and-ui.md).

---

## infra/ — provisioning

**Responsible for:** `postgres/roles.sql`, the one idempotent script that creates `cyberathlete_migrator`
and `cyberathlete_app` — run by the compose init step locally, and once by hand per managed environment
([ADR-011](decisions/ADR-011.md)).

**Must NOT contain:** a password, a connection string, or any schema object — tables belong to Alembic.

---

## packages/shared/

**Responsible for:** TypeScript types generated from the API's OpenAPI schema, the shared domain
fixtures consumed by both test suites, and **the message catalogs** — `i18n/en.json` and
`i18n/pt-BR.json` — read by the app for its UI and by the API for emails and exports, so the two
cannot drift into separate wording (INV-27, [ADR-008](decisions/ADR-008.md)).

**Must NOT contain:** hand-written types that duplicate generated ones, or any runtime code.
Catalogs and fixtures are data.

---

## docs/

**Responsible for:** the documents indexed in [00-project-context.md](00-project-context.md).

**Rule:** a decision that was argued over belongs in an ADR, not in a commit message. If code
contradicts a doc, one of them is a bug — say which.

# Task 001 — Project Bootstrap

**Depends on:** nothing · **Blocks:** everything · **Size:** L

> **Complete (2026-09-12).** Everything that needed administrator rights moved to
> [task 017](017-local-toolchain-device-spike.md), word for word: the local Docker run, the development
> build and every on-device check, the Rust CI proofs, and the ADR-004 spike. What remains here is what
> CI proves.
>
> **Resized M → L (2026-09-11).** Three toolchains, boundary rules each proven by a known-bad fixture,
> and a two-day spike did not fit a medium task.

## Goal
A monorepo where the API and the mobile app build and pass their tests, CI is green on an empty
project, and every boundary rule is proven by breaking it. No features. The point is that every later
task starts from a working baseline instead of fighting tooling. The development build on a real phone
is [task 017](017-local-toolchain-device-spike.md).

**Android first** ([ADR-009](../decisions/ADR-009.md)). Nothing in this task builds for iOS — but the
structure that keeps iOS an *addition* rather than a port is set up here, because it is only free while
there is nothing yet to untangle.

## Prerequisites

Python 3.12, **Node 24 LTS**, `uv`, `pnpm` and git — all installable without administrator rights. (Node
20 reached end of life in April 2026. If the pinned Expo SDK requires a newer Node, that requirement
wins.) Docker Desktop, Android Studio, Rust and a physical phone are
[task 017](017-local-toolchain-device-spike.md)'s prerequisites.

**Not needed:** a Mac, Xcode, or an Apple Developer membership. Those belong to
[task 016](016-ios-platform.md).

## Scope

**Repository**
- `git init` (this directory is not yet a repo), pushed to a **private GitHub repository**; `.gitignore`,
  `.editorconfig`, `README.md`.
- pnpm workspace: `apps/mobile`, `packages/shared`. `apps/api` managed by `uv`. Node pinned in `.nvmrc`
  and `engines`, pnpm in `packageManager`; CI reads the same pins.
- Directory skeleton exactly as [02 §2](../02-architecture.md), **including `apps/mobile/src/platform/`**.
  `core-rs/` arrives with the spike in task 017.
- **`docker-compose.yml` at the repository root**, not inside `apps/api`: `postgres:16` + adminer. It is
  shared infrastructure, and [06 §1](../06-operations.md) runs `docker compose up` from the root before
  changing into `apps/api`. Its init script creates **the two database roles**
  ([ADR-011](../decisions/ADR-011.md)) — `cyberathlete_migrator` and `cyberathlete_app` — and nothing
  connects as `postgres` afterwards. The same idempotent SQL later provisions staging and production, so
  write it as a standalone script, `infra/postgres/roles.sql`, that the init step calls — not inline in the
  compose file.
  Its grants use `ALTER DEFAULT PRIVILEGES FOR ROLE cyberathlete_migrator`: without `FOR ROLE` they
  apply to tables created by whoever runs the script, and the app role would never receive grants on
  the tables Alembic creates.

**API** — `apps/api`
- FastAPI + uvicorn, `uv` project, Python 3.12.
- `app/core/config.py`: Pydantic `Settings`, env-driven, with the boot-time assertion that
  required secrets exist and `JWT_SECRET` is not a dev default ([04 §8](../04-security-and-auth.md)).
- Two connection strings: `DATABASE_URL` as `cyberathlete_app` for the API, and
  `MIGRATION_DATABASE_URL` as `cyberathlete_migrator` for Alembic only. **The API refuses to boot if its
  role is a superuser, has `BYPASSRLS`, owns any table, or is a member of a role that does** — and,
  outside local development, if the migrator's URL is in its environment
  ([ADR-011](../decisions/ADR-011.md)). There are no user tables yet, which is exactly when the check is
  cheapest to write.
- SQLAlchemy 2.0 async over **psycopg 3**, with server-side prepared statements off, so the API works
  behind a transaction-mode pooler ([ADR-011](../decisions/ADR-011.md), NFR-12).
- Structured JSON logging (`structlog`) with request-ID propagation through `X-Request-ID`
  ([04 §9](../04-security-and-auth.md)).
- `GET /health` and `GET /health/ready` as separate endpoints. Readiness means the database is reachable
  **and** the schema is at the latest Alembic revision ([06 §5](../06-operations.md)), so `cyberathlete_app`
  holds `SELECT` on `alembic_version`.
- Alembic initialised against an empty schema.

**Mobile** — `apps/mobile`
- Expo SDK — latest stable when the task starts, **then pinned** — TypeScript strict, `expo-router`.
- **Continuous native generation.** `android/` is not committed: `expo prebuild` generates it locally, in CI
  and in EAS, and every native setting lives in a config plugin — the one place besides `src/platform/`
  that INV-28 lets know the OS. The release-cleartext check runs against the prebuilt configuration.
- **A development build, never Expo Go** — background location needs one ([05 §1](../05-integrations.md)),
  and discovering that in task 007 would be painful. Building it on a physical Android device is
  [task 017](017-local-toolchain-device-spike.md).
- `expo-sqlite` + Drizzle wired up with one throwaway table, migrating at startup.
- TanStack Query, Zustand, `expo-secure-store` installed.
- **`src/platform/`** — the only folder allowed to know the operating system (INV-28). It holds an
  Android implementation of one trivial interface now, so the pattern exists before anything needs it.
  **A lint rule rejects `Platform.OS`, `Platform.select` and `.android.*` / `.ios.*` files anywhere
  else** — by banning the `Platform` import itself (§ Boundary rules).
- **Cleartext to `localhost` only, in debug only** ([04 §5](../04-security-and-auth.md)). An Expo config
  plugin writes a debug-only Android network security config permitting `http://localhost`; release
  builds permit no cleartext. The device reaches the API through `adb reverse`, and the API client
  refuses a non-`https` base URL in any non-debug build.
- **A debug-only diagnostics screen** for the on-device checks, through the allowed paths
  ([ADR-012 § Amendment](../decisions/ADR-012.md)): server reachability, the LAN-address refusal and the
  secure-storage round trip through `src/account/`; the SQLite migration through `src/db/`; and, during the
  spike, `round_to_increment` through `src/domain/`. It is absent from release builds, and runs on a
  device in task 017.

**Shared** — `packages/shared`
- Package that builds; OpenAPI type-generation script (`openapi-typescript`) wired even though
  the schema is nearly empty.
- `fixtures/` directory created, with the loader used by both test suites
  ([06 §3](../06-operations.md)).

**Rust core spike** — moved to [task 017](017-local-toolchain-device-spike.md) (2026-09-12). It needs
Android Studio, the NDK and a physical device. The lint rule for the binding it produces is written here
(§ Boundary rules).

**CI** — GitHub Actions, on the private repository.
- API: ruff (including `banned-api`), mypy, **import-linter**, pytest, pip-audit.
- Mobile: tsc, eslint — **including every boundary rule below** — jest, `pnpm audit --audit-level high`
  (`npm audit` needs a `package-lock.json`, which a pnpm workspace never has).
- Rust: `cargo deny`, clippy, fmt and the Android cross-compilation check arrive with the spike in task
  017. Cache the Cargo and Gradle builds, so CI stays inside the plan's included minutes.

**Boundary rules — written now, while there is nothing to fix.** They encode
[responsibility-map.md](../responsibility-map.md), and several are what turn security decisions already
taken — [ADR-011](../decisions/ADR-011.md), [ADR-007](../decisions/ADR-007.md), INV-28 — from intentions
into gates. Create every module they name as an empty placeholder (`app/services/auth/`,
`app/services/maintenance/`, `app/repositories/unscoped.py`, `src/crypto/`, `src/account/`, …), so each
rule binds to something real from the first commit.

*API — import-linter* (`include_external_packages = true`). It sees imports, not calls, so it cannot
catch a clock read; that half belongs to ruff, below.

| Contract | Rule |
|---|---|
| Layers | `app.api` → `app.services` → `app.repositories` → `app.models`; no layer imports one above it |
| Routers skip nothing | `app.api` imports none of `app.repositories`, `app.models`, `sqlalchemy` |
| Domain is pure | `app.domain` imports no other `app.*` package, and none of `sqlalchemy`, `fastapi`, `pydantic`, `httpx`, `socket`, `os`, `time`, `random`, `secrets` |
| Core knows no domain | `app.core` imports none of `app.domain`, `app.services`, `app.repositories`, `app.api`, `app.models` |
| **Unscoped reads are fenced** | Only `app.services.auth` and `app.services.maintenance` import `app.repositories.unscoped` ([ADR-011](../decisions/ADR-011.md)) |

*API — ruff `banned-api`*, in a `ruff.toml` under `app/domain/` that extends the root config. It bans
`datetime.datetime.now`, `datetime.datetime.utcnow`, `datetime.datetime.today`, `datetime.date.today`,
`time.time`, `time.monotonic`, `uuid.uuid1`, `uuid.uuid4`, `os.environ` and `os.getenv` (INV-10: "now" and
identifiers are parameters). It resolves qualified names, so an aliased import is caught too.

*Mobile — ESLint* (flat config). Folder rules through `eslint-plugin-boundaries`; package rules through
`no-restricted-imports`; globals through `no-restricted-globals` and `no-restricted-properties`.

| Folder | May import from `src/` | Also |
|---|---|---|
| `app/` (routes) | `features/`, `ui/`; the root layout also imports **only** `db/`'s migration entry point and `account/`'s bootstrap entry point | — |
| `features/<name>` | its **own** feature, `account/`, `domain/`, `db/`, `recording/`, `ui/`, `platform/` | never another feature, never `sync/` or `crypto/` |
| `account/` | `sync/`, `crypto/`, `db/`, `domain/`, `platform/` | sign-in, registration and password flows ([ADR-012](../decisions/ADR-012.md)); `sync/` never imports it |
| `domain/` | nothing | no `react`, `react-native` or `expo-*`; no `Date.now`, argument-less `new Date()`, `Math.random` or `performance.now` (INV-10) |
| `db/` | `domain/` | no `react` or `react-native` |
| `sync/` | `db/`, `domain/`, `crypto/`, `platform/` | — |
| `recording/` | `db/`, `domain/`, `ui/`, `platform/` | — |
| `crypto/` | nothing | — |
| `ui/` | `platform/` | — |
| `platform/` | nothing | — |

Each sensitive capability has exactly one home, and is banned everywhere else:

| Only in | What | Why |
|---|---|---|
| `src/platform/` | `Platform` from `react-native` (named or namespace access), `expo-device`; `*.android.*` / `*.ios.*` files, by a CI glob check | INV-28. Banning the import, not only `Platform.OS`, also catches `Platform.select` and `Platform.Version` |
| `src/sync/` | `fetch`, `XMLHttpRequest`, `WebSocket`, any HTTP client package | The only folder that talks to the network |
| `src/db/` | `expo-sqlite`, `drizzle-orm` | No SQL anywhere else |
| `src/crypto/` | `react-native-libsodium` and every other crypto library (`libsodium-wrappers`, `tweetnacl`, `@noble/*`, `crypto-js`) | [ADR-007](../decisions/ADR-007.md): one place for cryptography |
| `src/crypto/`, `src/sync/` | `expo-secure-store` | The privacy key and the session tokens — nothing else belongs in secure storage |
| `src/recording/`, `src/platform/` | `expo-location`, `expo-task-manager` | Location is the most sensitive asset ([04 §1](../04-security-and-auth.md)); no feature can request it on its own |
| `src/domain/` | the `core-rs` UniFFI binding package | [ADR-012](../decisions/ADR-012.md): one importer of the core, so a calculation cannot appear beside the wrapper |

Plus `no-console` in `src/crypto/`, `src/sync/` and `src/account/`, where keys, passwords and tokens pass through
([04 §9](../04-security-and-auth.md)).

The rule for the `core-rs` binding is permanent: only `src/domain/` imports the binding package
([ADR-012](../decisions/ADR-012.md)). Under option A the package never exists, and the rule is deleted.

**Rules are tested, not trusted.** A mistyped glob turns a rule off and CI stays green. So every rule has a
known-bad fixture — `apps/mobile/lint-fixtures/` for ESLint, a small fixture package with its own contract
file for import-linter, a fixture module for `banned-api` — and CI fails unless each fixture is reported,
by exactly the rule it targets.

## Deliverables
The API and the mobile app build and pass their tests · CI green · API integration tests against a real
Postgres, in CI · mobile Jest tests · `README.md` with the commands from [06 §1](../06-operations.md),
verified on Windows in task 017.

## Acceptance criteria

Every scope item above has a criterion here or in [task 017](017-local-toolchain-device-spike.md). A scope
item without one can quietly not happen, and [PROJECT-STATUS](../PROJECT-STATUS.md) defines "done" as
these boxes ticked.

**It runs**
- [x] `/health/ready` returns 503 when Postgres is stopped, and when the schema is behind the latest
      Alembic revision
- [x] The API **refuses to boot** when `JWT_SECRET` is missing or equals a known development default
- [x] The API **refuses to boot** when `DATABASE_URL` connects as `postgres`, as `cyberathlete_migrator`,
      or as any role with `BYPASSRLS` — try each. `alembic upgrade head` runs as the migrator, and the
      API's role cannot run DDL
- [x] `cyberathlete_app` can read `alembic_version`, created by the migrator, with no manual grant — the
      default privileges `FOR ROLE cyberathlete_migrator` work
- [x] Every request produces one structured JSON log line with a request ID, and a request ID sent by
      the client is the one logged

**Shared**
- [x] `openapi-typescript` regenerates the types in `packages/shared` from the API's OpenAPI schema —
      exactly what it serves at `/openapi.json`, exported from the application without a server or a
      database — and CI fails if the committed schema or types are stale
- [x] One fixture in `packages/shared/fixtures/` is loaded and asserted by **both** pytest and Jest

**Every gate proven by breaking it**
- [x] CI fails if a file in `app/domain/` imports `sqlalchemy` — **write that import, watch CI fail**,
      then remove it
- [x] CI fails if a feature contains `Platform.OS` — **write it, watch CI fail**, then remove it
      (INV-28)
- [x] **Every boundary rule has a known-bad fixture that CI proves is caught** — each import-linter
      contract, the `banned-api` list, and each ESLint folder, package and global rule, with the
      unscoped-reads fence, `fetch` outside `src/sync/`, `expo-location` in a feature, a feature importing
      `src/crypto/`, and the core binding imported outside `src/domain/` among them.
      Then break one rule's configuration on purpose (a wrong glob), watch its fixture go unreported and
      CI fail, and revert
- [x] CI fails if the release build's Android configuration permits cleartext traffic — **allow it, watch
      CI fail**, then revert
- [x] No secret is committed; `.env.example` documents every key, including both database URLs

**Moved to [task 017](017-local-toolchain-device-spike.md) on 2026-09-12**, word for word: the local
Docker run; the four on-device criteria (the dev build over `adb reverse`, hot reload, the SQLite
migration, the smoke tests and secure storage); a non-debug build refusing an `http://` base URL; the
`core-rs` CI proofs; `round_to_increment` on a device; and ADR-004's outcome.

## Notes and risks
- **Set up the boundary rules now, while there is nothing to fix.** Retrofitting any of them after code
  exists costs a day of untangling — and the platform rule in particular is invisible
  while only Android exists, which is exactly when it is cheapest to hold.
- Pin the Expo SDK version. Upgrades are scheduled work ([05 §10](../05-integrations.md)).
- The notes on EAS, `cargo-ndk` and Windows path length moved to task 017 with the work they concern.

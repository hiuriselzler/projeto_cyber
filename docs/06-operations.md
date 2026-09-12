# 06 — Operations

How to build it, test it, ship it, and not lose data. Written for a one-developer project, so it
favours things that stay correct while unattended over things that need a team to maintain.

## 1. Local development

**Prerequisites:** Python 3.12, Node 24 LTS, Docker Desktop, `uv`, `pnpm`, EAS CLI, and **Android
Studio** with the Android SDK and NDK. Plus, if [ADR-004](decisions/ADR-004.md) is accepted, a Rust
toolchain with the Android targets installed and `cargo-ndk` — on Windows, natively or in WSL2
([ADR-004](decisions/ADR-004.md) § Decision procedure). All of it runs on Windows, macOS or Linux.
**Xcode and a Mac are not needed until [task 016](tasks/016-ios-platform.md)** — Android ships first
([ADR-009](decisions/ADR-009.md)).

Every line below runs unchanged in PowerShell and in bash. Start at the repository root, with `.env`
created from `.env.example`.

```sh
# Terminal 1 — database and API, from the repository root
docker compose up -d                      # postgres:16 on 5432, adminer on 8080
cd apps/api
uv sync
uv run alembic upgrade head               # connects as cyberathlete_migrator
uv run python -m seeds                    # seed the reference data, from apps/api/seeds/
uv run uvicorn app.main:app --reload      # http://localhost:8000/docs

# Terminal 2 — mobile, from the repository root
corepack enable                           # pnpm, at the version pinned in package.json
pnpm install
adb reverse tcp:8000 tcp:8000             # the phone's localhost:8000 → this machine's API
adb reverse tcp:8081 tcp:8081             # Metro
cd apps/mobile
pnpm android                              # first time: builds and installs the development build
pnpm start                                # afterwards: `expo start --dev-client --localhost`
```

Metro is served on `localhost` too, not on the LAN address Expo would otherwise advertise: a debug
build may use cleartext to `localhost` and nothing else, so a LAN address would be refused.

`docker compose` provides Postgres only. The API runs on the host so the debugger and reloader
work without container gymnastics.

**Without Docker:** until [task 017](tasks/017-local-toolchain-device-spike.md), a portable PostgreSQL in
the user profile stands in for it, with the same roles and the same `.env` — see the README. On Windows,
run `uvicorn` with `--reload`: psycopg's async driver cannot use the event loop a plain `uvicorn` process
gets there.

**Two database roles, locally exactly as in production** ([ADR-011](decisions/ADR-011.md)). The
compose init step runs `infra/postgres/roles.sql`, which creates `cyberathlete_migrator`, used by
Alembic, seeds and backfills through `MIGRATION_DATABASE_URL`, and `cyberathlete_app`, used by the API
through `DATABASE_URL`. Developing as
the `postgres` superuser would make every RLS policy pass trivially on the one machine where RLS bugs
are cheapest to find. Staging and production run the same script once, by hand, with the provider's
admin user — whose credentials never reach the API or CI — and the running API's environment never
holds `MIGRATION_DATABASE_URL`.

**Device note:** Expo Go will not work — background location and (later) BLE need a development
build (`npx expo run:android`, or `eas build --profile development --platform android`). Build it
once during [task 017](tasks/017-local-toolchain-device-spike.md); after that, JS changes hot-reload normally.

**Reaching the API from the phone:** over USB with `adb reverse`, so the device's `localhost` is this
machine's. Debug builds may use `http://` to `localhost` and nothing else; release builds allow no
cleartext at all ([04 §5](04-security-and-auth.md)). uvicorn stays bound to `127.0.0.1` — never
`0.0.0.0` on a shared network. Re-run the `adb reverse` lines after reconnecting the phone.

## 2. Environments

| | Local | Staging | Production |
|---|---|---|---|
| Database | Docker Postgres | Managed, small | Managed, PITR on |
| API | uvicorn --reload | Auto-deploy from `main` | Deploy from a tag |
| Mobile | dev build + Metro | EAS internal channel | Play internal (TestFlight from task 016) |
| Sentry | off | on | on |
| Seed data | full | full | catalog only |

Staging exists mainly to rehearse migrations against realistic data before they touch the
production database. It is worth its cost for exactly that.

## 3. Quality gates

**API**
- `ruff check` + `ruff format --check`
- `mypy --strict` on `app/domain/` and `app/services/`; standard elsewhere
- `import-linter` — enforces the layering in [02 §5](02-architecture.md), the purity of
  `domain/` (INV-10), and the fence around unscoped reads ([ADR-011](decisions/ADR-011.md)). This is a
  real gate, not decoration: it is what stops the progression engine from quietly acquiring a database
  call. It sees imports, not calls, so ruff's `banned-api` covers clock, identifier and environment reads
  in `domain/`. The full contract list is in [task 001](tasks/001-project-bootstrap.md).
- `pytest` with `pytest-asyncio`; integration tests against a real Postgres in a container, never
  SQLite-as-a-stand-in (the schema uses enums, `citext`, `jsonb` and `bytea`).
- `pip-audit`

**Mobile**
- `tsc --noEmit`, Prettier, and ESLint with the folder and package boundary rules from
  [task 001](tasks/001-project-bootstrap.md) — INV-28, and exactly one home each for network access,
  cryptography, secure storage and location
- Every boundary rule in both apps has a known-bad fixture that CI proves is caught — otherwise a mistyped
  glob turns a rule off while CI stays green
- Jest for domain logic and sync reducers
- `pnpm audit --audit-level high` — the workspace uses pnpm, and `npm audit` needs a
  `package-lock.json` it will never have

**Rust core** — if [ADR-004](decisions/ADR-004.md) is accepted
- `cargo clippy -- -D warnings`, `cargo fmt --check`
- `cargo test` including `proptest` suites for the invariants (INV-02, INV-05, INV-10)
- `cargo deny` — forbids I/O, clock and RNG crates in the core — and clippy's `disallowed-methods`,
  banning `std::time::SystemTime::now`, because `cargo deny` sees crates and not standard-library calls.
  Together they are how INV-10 is enforced structurally rather than by review
- Cross-compilation check for every Android target on every PR (iOS targets join in task 016); a
  core that builds on the dev machine and not for `aarch64-linux-android` is discovered at release
  time otherwise

**Shared**
- The domain fixtures in `packages/shared/fixtures/` run in **every** suite
  ([02 §3](02-architecture.md)). Under ADR-004 they are regression tests over one implementation;
  if that ADR is rejected they are the only thing preventing the Python and TypeScript engines
  from silently diverging, and a mismatch must fail CI on both sides.

## 4. Migrations

**Server (Alembic).** Every migration is reviewed by hand — autogenerate drafts, humans decide.

Rules:
- **Expand / contract, always.** Add nullable → backfill → start writing both → switch reads →
  drop the old column in a *later* release. Never in one migration.
- No destructive change ships in the same release as the code that depends on it. An old client
  version must survive against the new schema, because a phone with unsynced workouts may be
  weeks behind (NFR-1).
- Every migration has a tested `downgrade`, rehearsed on staging.
- Backfills that touch many rows run as batched scripts, not inside the migration.

**Client (Drizzle).** The dangerous one.

- Local migrations run at app start, before any UI, inside a transaction.
- **Before migrating, if the outbox is non-empty, back up the SQLite file.** A failed migration
  on a device holding unsynced workouts loses data that exists nowhere else (NFR-8). This is the
  worst realistic failure in the whole system.
- Migrations must be forward-only and tolerate skipped versions — a user can jump from app
  version 3 to version 11 in one store update.
- A local migration **never** ships over OTA ([05 §9](05-integrations.md)).

**Compatibility rule between the two streams:** the client schema may lag the server schema; the
sync protocol ignores unknown fields on both sides and never treats a missing column as a
deletion.

## 5. Deploy

**API** — container, deploy on tag:
```
build image → run migrations as a release step (as cyberathlete_migrator) → health check → shift traffic → keep previous revision for rollback
```
`GET /health` (process alive) and `GET /health/ready` (database reachable, migrations current)
are separate; the platform gates traffic on the latter.

Rollback: redeploy the previous image. Because migrations are expand/contract (§4), the previous
image is always compatible with the current schema. That property is the entire reason for the
discipline.

**Mobile** — `eas build` → `eas submit` → internal track → promote. JS-only fixes go out with
`eas update` on the same channel.

Versioning: API is SemVer-tagged; the mobile app uses a monotonic build number and a SemVer
display version. The API version and the app version are independent and must stay compatible
across at least two app releases.

## 6. Backups and recovery

- Managed Postgres with **PITR**, 7-day window minimum.
- Nightly `pg_dump` to object storage, 30-day retention, in a different account/region from the
  database.
- **A restore is rehearsed quarterly into staging.** A backup that has never been restored is a
  hypothesis, not a backup. Record the restore time; that number is the real RTO.
- Targets: **RPO ≈ 5 min** (PITR), **RTO ≈ 1 hour**.
- The user-facing data export ([04 §7](04-security-and-auth.md)) doubles as a personal backup and
  should be advertised as one.
- Every device holding a local SQLite copy is an incidental extra replica — genuinely useful in a
  catastrophe, but never counted as a backup, because sync would happily overwrite it.

## 7. Monitoring

- Sentry for errors on both sides, release-tagged so a regression points at a deploy.
- Uptime check against `/health/ready` every minute.
- Structured JSON logs with a propagated request ID; no PII ([04 §9](04-security-and-auth.md)).
- Alert on: readiness failing 2× consecutively · error rate spike · p95 latency on
  `POST /sync/push` · **outbox rejection rate**, which is the early warning that client and
  server have diverged, and the one metric most likely to catch a real bug before the user does.
  **`superseded` results are excluded from that rate** ([02 §7](02-architecture.md)): an older
  engine's projection losing to a newer one is the sync design working as intended, and counting it
  would bury the real divergence signal under every app release.
- Metrics worth a dashboard even at one user: sync push size and latency, activities recorded
  with detectable GPS gaps, reconciliation runs per day.

## 8. Runbooks

| Situation | Action |
|---|---|
| Sync push failing for one user | Inspect their outbox rejections; the payload is in the client DB and in the 4xx response body. Never hand-edit rows to "fix" a client — fix the merge and let it retry |
| Bad projection shipped | Reconciliation is pure and idempotent (INV-10). Fix the engine and **bump `ENGINE_VERSION`** — the fix changes a fixture, so it must — then redeploy and re-run reconciliation for affected mesocycles. The higher version is what lets corrected projections supersede faulty ones on every device (INV-06); without the bump, devices still on the old build would keep overwriting the fix. Only `projected` microcycles change, so history is safe |
| GPS pipeline bug | Raw points are retained until sync (INV-13). Bump `pipeline_version`, recompute derived columns, backfill. Old activities keep their old version until deliberately migrated |
| Duplicate workouts appear | Client IDs are UUIDv7 (INV-16), so duplicates mean a client minted two IDs for one logical workout. Fix on the client; server-side dedup is a bandage |
| Lost local database | Reinstall and pull from the server. Anything in the outbox at that moment is gone — this is why §4's pre-migration backup exists |
| Need to revoke everything | Delete all `refresh_tokens` rows; rotate `JWT_SECRET`. Access tokens die within 15 minutes |

## 9. Cost and scale — revised for multi-user

**Fixed costs** (independent of users): API host ~$10–25/mo · Sentry ~$0–26/mo ·
EAS $0–29/mo · Google $25 once · Apple $99/yr from task 016. Maps stay **$0** by using native providers
([05 §4](05-integrations.md)) — that decision looks much better at scale than it did at one user.

**Per-user costs** are dominated by one thing: **GPS streams.** From
[ADR-003](decisions/ADR-003.md), an hour-long activity is ~40 KB of streams. An active user doing
six sessions a week generates roughly **12 MB/year**. Training logs are negligible beside that —
a year of workouts is well under 1 MB of rows.

| Users | Stream + row storage/yr | Realistic monthly total |
|---|---|---|
| 100 | ~1.5 GB | ~$40–70 |
| 1 000 | ~15 GB | ~$70–150 |
| 10 000 | ~150 GB | ~$300–800 |

Read/write load stays modest because the clients are offline-first
([ADR-001](decisions/ADR-001.md)): a user syncs in batches a few times a day rather than chatting
constantly. That architecture is now a cost decision as well as a correctness one.

**What to watch as users grow**
- Analytics queries ([task 010](tasks/010-unified-calendar-and-analytics.md)) run on-device
  against local SQLite, so they cost nothing server-side. Keep it that way.
- `sync/push` is the hot endpoint. It is the first thing to need horizontal scaling, and its
  latency is already an alert (§7).
- **Concurrency.** Hundreds of users active at once is a design goal (NFR-12). The API is stateless
  and pooling-safe from the first commit, so the first response to load is a second API instance and a
  transaction-mode pooler. The target number and the load test that proves it are set before launch.
- Backup size grows with streams; the nightly `pg_dump` (§6) will eventually need to become
  incremental.
- **Support time becomes the real cost long before infrastructure does.** One developer, a
  thousand users, and no support tooling (§12 of [04](04-security-and-auth.md)) is the actual
  scaling constraint.

### Unit economics

Settled: subscription, three months free, then Free or Pro
([09-business-model.md](09-business-model.md), [ADR-006](decisions/ADR-006.md)).

| | Per Pro user, per year |
|---|---|
| Gross — annual plan at **$59.99** ([09 §2](09-business-model.md)) | $59.99 |
| Less store fee (15 %, small-business tier — **enrol before launch**) | **~$51 net** |
| Less storage and compute (streams dominate) | ~$0.30–1.00 |

| | |
|---|---|
| Fixed costs (§9 above) | ~$50–100/month |
| **Break-even** | **≈ 25 annual subscribers** |
| 500 annual subscribers | ~$25,000/yr net |

So **one annual subscriber covers roughly 50–150 free users' storage**, and twenty-five of them
cover the entire infrastructure. Infrastructure is not the constraint at any plausible scale for
this project — **acquisition and support are**, exactly as §9 already warned.

Two consequences worth planning for:
- Every user costs three months of full Pro-tier usage before any revenue is possible, and many
  never convert. Cheap here; re-check if acquisition ever becomes paid.
- The Free tier is deliberately generous (INV-26), so free-user storage is a permanent line item,
  not a trial expense. It is small, but it never goes away.

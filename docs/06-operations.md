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

### Building the Android development build — what actually works

Three things cost hours in [task 004](tasks/004-exercise-catalog-and-logging.md) stage 3 and none of them were
guessable from an error message. Written down so the next rebuild is minutes instead.

- **⚠ Do not build with Android Studio's bundled JDK.** It now ships **JDK 25**, and JDK 24+ refuses the restricted
  `System.load` calls AGP's CMake tasks make: every `configureCMakeDebug[<abi>]` task fails with the bare line
  *"WARNING: A restricted method in java.lang.System has been called"*, which names neither the JDK nor the cause.
  Build with **JDK 17** — `JAVA_HOME=".../Eclipse Adoptium/jdk-17.x-hotspot"`. This is new: the same machine built
  fine on 2026-09-18, and the IDE moved the JDK underneath the project.
- **The native build is done in WSL2, not on Windows** ([ADR-004](decisions/ADR-004.md) allows it). Even under
  JDK 17, `react-native-libsodium`'s CMake configure fails on Windows inside pnpm's content-addressed store path.
  The WSL2 clone builds it: `pnpm install --frozen-lockfile`, `pnpm prebuild`, `./gradlew :app:assembleDebug`, then
  copy the APK out and `adb install` it from Windows. Expect roughly **30 minutes** cold — it compiles four ABIs
  while the phone needs one, and `-PreactNativeArchitectures=arm64-v8a` is the lever if that matters.
- **⚠ `packages/core-native`'s three `.so` files are gitignored, so they do not travel with a commit.** A second
  checkout gets the generated C++ and TypeScript binding surface without the matching binary and fails at link time:
  `ld.lld: error: undefined symbol: uniffi_cyberathlete_core_ffi_checksum_func_volume_kg`. The guarantee that the
  surface and the library cannot drift holds **only on the machine that ran `ubrn build android --and-generate`**.
  Either regenerate them in the new checkout, or copy `packages/core-native/android/src/main/jniLibs/*/…so` from a
  machine whose binary matches the committed bindings. Task 006 or a CI step should close this properly; until then
  it is a trap with a one-line symptom.
- **Reinstalling over a build from another machine fails** with `INSTALL_FAILED_UPDATE_INCOMPATIBLE` — different debug
  keystores. `adb uninstall com.cyberathlete.app` first, and know that it takes the local database with it.

**The loop that worked for a core change** (task 004 stage 6, 2026-09-24). The WSL2 clone is `~/projeto_cyber` in the
`Ubuntu` distribution, with `origin` pointing at this Windows checkout (`/mnt/c/...`), so it takes commits by `git fetch`:
1. Bring the clone to the branch head (`git merge --ff-only origin/<branch>`); to try uncommitted core changes, `rsync`
   `core-rs/` over it — then normalise the copies to LF and back to mode 644, or every file shows as modified.
2. `pnpm ubrn:android` in `packages/core-native` regenerates the bindings and the three `.so` files — a few minutes.
   Copy the four generated files and the `.so` files back to Windows, and check the diff is only what the change adds.
3. `./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a` under JDK 17: **under two minutes** incremental,
   against ~30 cold. Check the packaged `.so` carries the new symbol (`unzip`, then `grep` the function name) before
   installing. `adb install -r` keeps the phone's data.

What it cost to learn, each once:
- **From Git Bash, `wsl.exe` arguments are mangled**: `$vars` in the command string arrive empty and `/mnt/c/...` becomes
  `C:/Program Files/Git/mnt/c/...`. Put multi-step work in a script and run it with `MSYS_NO_PATHCONV=1 wsl.exe -d
  Ubuntu -- bash -lc "bash /mnt/c/.../script.sh"`.
- **Run it as a login shell** (`bash -lc`): `node`, `cargo` and the SDK are on the login PATH only. And **stop the
  Gradle daemon first** (`./gradlew --stop`): a daemon started from a shell without `node` keeps that PATH, and every
  later build fails on *"A problem occurred starting process 'command 'node''"* however the shell is fixed.
- **A development build takes its JavaScript from Metro**, so a JS-only change (a migration included) reaches the phone
  without a rebuild; only a native change — the core, a native dependency — needs the APK. `adb reverse tcp:8081
  tcp:8081` for Metro as well as the API's port, and again after the phone reconnects: the forward silently disappears.
- **Driving the phone over adb**: `uiautomator dump` returns a *stale* tree while anything animates — the rest bar
  ticks every 250 ms — so read state from the database copy (`run-as … cat files/SQLite/cyberathlete.db`), not from
  the dump, while a rest runs. And the development client's floating *Tools* button sits over every header's right-hand
  action; tap the left edge of *Encerrar*.
- **A draft PR's CI may not start**: PR #17's `pull_request` event was never delivered. Closing and reopening the PR
  re-sends it (and the late original then cancels the first run, which is harmless).
- **After step 2 the clone holds the generated files as local changes** (task 004 stage 7, 2026-09-25), so step 1's
  fast-forward refuses next time. They are the files you committed: `git checkout -- core-rs
  packages/core-native/cpp/generated packages/core-native/src/generated` and `git clean -fd core-rs` first. The `.so`
  files are gitignored and stay.
- **Launching the development build at Metro from adb**: `adb shell am start -a android.intent.action.VIEW -d
  "exp+cyberathlete://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.cyberathlete.app`, and then any
  route by deep link — `cyberathlete://history`, `cyberathlete://workouts/<id>`, `cyberathlete://exercise/<id>` — with the
  ids read from the pulled database. Faster and steadier than tapping through the diagnostics screen.
- **Fast refresh does not re-fire `onLayout`.** A fix that depends on measured layout — the chart's label gutter — looked
  unfixed after a refresh. Force-stop and relaunch before judging a layout change.
- **Predict before you look.** Stage 7's pass read the pulled database first and wrote down every number a screen should
  show; each screen was then a yes or a no, not an impression.
- **Typed routes go stale** whenever a route is added: `tsc` fails on the new `href` until `.expo/types/router.d.ts` is
  regenerated, which `npx expo start` does within seconds — start it, wait for the file to change, stop it (the CI gap
  is listed in PROJECT-STATUS § Gaps).
- **The integration suite needs Docker Desktop running** before `docker compose up -d` at the repository root; it does
  not start with Windows. Without it the integration tests skip locally, and CI is the only run.
- **The integration suite runs in its own database**, `cyberathlete_test`, created beside the development one on first
  use and granted from `infra/postgres/roles.sql` (task 004 stage 8). Until then it ran in the development database and
  its readiness test migrated that down and back up — every run deleted the accounts a phone signs in with, and a phone
  whose refresh is refused signs out.

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
- **Read every generated migration, and never ship a table rebuild over a table with children.** For anything SQLite
  cannot `ALTER` in place — a table-level CHECK, a changed column — `drizzle-kit generate` writes a rebuild: create
  `__new_x`, copy, `DROP TABLE x`, rename, bracketed by `PRAGMA foreign_keys=OFF/ON`. Under the expo migrator that
  pragma is a **no-op**, because every pending migration runs inside one `BEGIN … COMMIT`, and with foreign keys on
  (`src/db/client.ts`) the `DROP` is an implicit `DELETE` that cascades. Task 004 stage 5's first draft of
  `0002` would have deleted every `set_logs` row on the device — and its copy step also selected columns the old
  table did not have. Prefer `ALTER TABLE … ADD COLUMN`, which accepts a column-level CHECK; keep Drizzle's snapshot,
  which describes the result; and prove the hand-written file against a database holding children before it ships.

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

**Scheduled jobs** — one command, run once a day by the host's scheduler
([task 019](tasks/019-account-deletion.md)):

```
uv run python -m app.jobs.daily        # in apps/api
```

It deletes every account whose deletion was requested seven days ago or more, then purges revoked
refresh tokens older than 90 days and rate-limit windows older than one
([04 §7](04-security-and-auth.md)). It runs with the API's own environment — `DATABASE_URL` as
`cyberathlete_app`, `JWT_SECRET` and the email settings — refuses to start on a role that could
skip row-level security ([ADR-011](decisions/ADR-011.md)), and logs counts, never an address. Every
step is safe to repeat: a missed day is caught up by the next run, and two runs at once delete
nothing twice. **Which scheduler runs it is chosen with the host** (Fly.io or Railway,
[05 §5](05-integrations.md)); until then it runs by hand.

**Rebuilding a user's records** — by hand, not scheduled ([task 004](tasks/004-exercise-catalog-and-logging.md)
stage 7):

```
uv run python -m app.jobs.rebuild_records <user-id>        # in apps/api
```

`personal_records` is a derived cache ([03 §4](03-database-schema.md)), so this is its repair: it folds the user's
finished sets through the core's `standing_records()` and replaces that user's rows in one transaction, inside the
user's own scope — same role, same refusal as the daily command. It is safe to repeat: a second run writes the same
rows. **One user at a time, deliberately**: rebuilding everyone would need an unscoped function on
[ADR-011](decisions/ADR-011.md)'s allowlist, and nothing needs that until the server holds sets (task 006).

**Since stage 8 the cache is kept current without it**: a `PUT /workouts/{id}` that changes a finished workout rebuilds
the exercises that workout touches, in the same transaction. The command is the repair for a cache that was damaged
some other way, and it takes the same per-user write lock as the `PUT`, so running it while the user syncs is safe.

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

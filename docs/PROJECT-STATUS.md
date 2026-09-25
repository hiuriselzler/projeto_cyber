# PROJECT-STATUS — CyberAthlete

> The live to-do list. [00 § Document map](00-project-context.md) held this file empty until the
> documentation structure was agreed. It is agreed; this is what replaces it.
>
> Product: **CyberAthlete**. Directory codename `projeto_SHS` stays — the paths are not worth churning.

**How to use this file.** It tracks *which task is in flight and what is left*, not every acceptance
criterion — those live in each task file and are the real definition of done. A task is complete
when its own criteria are ticked. Tick the box here only then.

---

## Where the project is

| | |
|---|---|
| **Phase** | **Tasks 001, 002, 011, 003, 019 and 017 complete; [task 004](tasks/004-exercise-catalog-and-logging.md) in progress.** The schema exists in Postgres and SQLite, seeded and enforcing itself; the design system exists in `src/ui/`, token-driven and tested in both languages, both unit systems and both themes; accounts, sessions and the privacy key exist on both sides, with row-level security proven under the API's own role; a user can delete their account, from the app or the web; and [ADR-004](decisions/ADR-004.md) has its answer — **option B, the single Rust core**, proven through both bindings on the device. Task 004 has stages 0–6 built — the core's first residents, the seeded catalog, the set row, the catalog screen, routines, the rest timer, set types, every tracking mode, and the finish flow with its records — with stages 7–8 to go (*updated 2026-09-24*) |
| **Repository** | Private GitHub repository `hiuriselzler/projeto_cyber`. `main` holds the documentation and tasks 001, 002, 011, 003, 019 and 017, each merged by pull request (#1; #5; #7 and #8; #9; #11; #16); each further piece arrives the same way, with CI green before merge. Task 004 is on `feat/task-004-catalog-and-logging`, pushed 2026-09-23, not yet merged |
| **Docs** | 49 files, internally consistent, all cross-links resolving |
| **Decisions** | 15 ADRs, **all now accepted**. [ADR-004](decisions/ADR-004.md)'s spike passed on 2026-09-18 and its outcome is recorded: **option B, the single Rust core**. Its four pre-launch conditions remain outstanding, in tasks 005 and 006 |
| **Tasks** | 18 for v1 (Android) — one of them, task 018, drawn by hand rather than built — and 2 after launch — iOS platform, Coach tier. **6 complete** (001, 002, 011, 003, 019, 017) |
| **Platform** | **Android first**; iOS a structural addition ([ADR-009](decisions/ADR-009.md)) |
| **Next action** | **[Task 004](tasks/004-exercise-catalog-and-logging.md) — the core loop, in progress since 2026-09-19. Stages 0–6 are built and green locally on every gate CI runs; stages 7–8 remain** (history and charts, the API mirror and the closing device pass). **Next: one device pass over stages 5a–6, on a fresh APK, then stage 7.** Stage 6 was built before the 5a–5c pass was run, so one build covers both lists in the task file: routines on the phone, supersets, the refused notification permission, TalkBack, ✓ latency on a routine session, 5c's modes and migration `0003`, and stage 6's finish flow, records, past workout and discard. The APK needs the `.so` files rebuilt on 2026-09-24 for `personal_bests`. Already proven on the Galaxy S21 FE: the ✓ at p50 10.5 ms against NFR-2's 100 ms (stage 3), migration `0002` against real logged sets, every cold start reopening the workout in progress, and a force-quit mid-rest coming back to the same rest (2026-09-23). **Still open from earlier stages:** stage 4's own device pass (accessibility, font scale); from stage 3's, the imperial half of the 200 % font check, TalkBack actually switched on, and `Sheet`'s lost exit animation, which needs a `reanimated`-based fix. Whether the set row's numbers must hold one line at default scale is an open design question in [07 §6](07-brand-and-ui.md). Separately: a native speaker who trains reviews the Portuguese before launch — an AI pre-check is done — and the project owner draws the mark, [task 018](tasks/018-brand-mark.md), whenever ready |

### The decision that was open is closed — option B

**[ADR-004](decisions/ADR-004.md) — the Rust domain core. Settled 2026-09-18: the chain works, and the
core is Rust.** All four conditions of the bar fixed before the clock started are met — PyO3 from
FastAPI, UniFFI from a physical Android device, and the Android artefacts built by CI on Linux *and*
by EAS, the last read out of the built APK rather than inferred from a green build. The core is
adopted from [task 004](tasks/004-exercise-catalog-and-logging.md) onward, which is now unblocked.

**The timebox is recorded honestly rather than glossed.** The clock started 2026-09-16 and the bar
closed on the evening of 2026-09-18 — at or just past two days by the calendar, against an ADR that
says *do not extend the timebox*. It is still option B because the clause exists to catch a *hostile
toolchain*, and the toolchain was never hostile: both bindings were proven on day one, hours apart.
What consumed the rest was a missing Expo account and two bugs in a build hook written on the last
day — neither of them the FFI chain. The full argument is in the ADR, not in a commit message.

**Still open, and not decided by this.** The four conditions ADR-004 requires before the first
external user — the kill switch, the engine version on every projection, server reconciliation as
authoritative, the minimum engine version — are untouched by the spike and remain a launch blocker,
built in tasks 005 and 006. *A working toolchain was always necessary and never sufficient.* The iOS
half stays gate 1 of [task 016](tasks/016-ios-platform.md).

---

## Build order

Numbered by when each task was *written*; ordered here by when it should be *built*
([tasks/README.md](tasks/README.md) is the authority and explains the two non-obvious placements).

### Milestone 1 — Usable alone
*Plan a block and train it, offline, on one device.*

#### ☑ 001 — Project bootstrap · **L** · depends: nothing · blocks: everything
> **Complete (2026-09-12).** What needed administrator rights — the local Docker run, the device, the
> ADR-004 spike — moved to [task 017](tasks/017-local-toolchain-device-spike.md).
- [x] `git init` and a **private GitHub repository**, `.gitignore`, `.editorconfig`, `README.md`; pnpm workspace + `uv` for the API
- [x] Directory skeleton exactly as [02 §2](02-architecture.md); `core-rs/` arrives with the spike, task 017
- [x] API: config with a **boot-time assertion that `JWT_SECRET` is not a dev default**,
      structured JSON logging with request-ID propagation, `/health` and `/health/ready` separate —
      readiness includes migrations at head. Booted against a local database: task 017
- [x] **Two database roles** — `cyberathlete_migrator` owns the schema, `cyberathlete_app` runs the API;
      the API **refuses to boot** as a superuser, a `BYPASSRLS` role or a table owner ([04 §4](04-security-and-auth.md));
      grants through `ALTER DEFAULT PRIVILEGES FOR ROLE cyberathlete_migrator`
- [x] **Release builds permit no cleartext, proven by CI** ([04 §5](04-security-and-auth.md)); debug builds
      reaching the API over `adb reverse` on a device: task 017
- [x] Node 24 LTS pinned (`.nvmrc`, `engines`); CI runs `pnpm audit`, not `npm audit`
- [x] `docker-compose.yml` with `postgres:16` at the **repository root**; Alembic initialised against an empty schema. First run locally: task 017
- [x] Mobile: Expo pinned, TypeScript strict, `expo-router`; a development build, never Expo Go. On a
      physical Android device: task 017. iOS: task 016
- [x] **`src/platform/` created, with a lint rule forbidding OS checks anywhere else** — prove it by
      writing `Platform.OS` into a feature and watching CI fail (INV-28)
- [x] **`src/account/` created** as the only route from screens to the network and the privacy key, and
      **only `src/domain/` imports the core binding** ([ADR-012](decisions/ADR-012.md))
- [x] **`android/` generated, never committed** (`expo prebuild`); native settings in config plugins; a
      debug-only diagnostics screen for the on-device checks, run in task 017
- [x] **Every scope item has an acceptance criterion** (logging, OpenAPI codegen, fixtures in both
      suites, smoke tests, `cargo deny` + clippy)
- [x] `expo-sqlite` + Drizzle wired to migrate at startup; idempotent on a device: task 017
- [x] `packages/shared` builds; OpenAPI type generation wired; `fixtures/` loader used by both suites
- [x] CI green both sides, with **the boundary rules written now, while there is nothing to fix** —
      import-linter + ruff `banned-api` (API), ESLint folder and package fences (mobile), including the
      ADR-011 fence on unscoped reads and one home each for network, crypto, secure storage and location
- [x] Prove the gates: write a `sqlalchemy` import into `domain/` and watch CI fail; **every rule has a
      known-bad fixture that CI proves is caught**

#### ☑ 002 — Database and schema · **L** · depends: 001 · blocks: 003–009
> **The last chance to change the schema freely.** Schema churn is far cheaper before there is data.
> **Complete (2026-09-12).** Every criterion in the task file is proven by a test, and CI was green on
> all four jobs of pull request #5. The two device checks remain in task 017.
- [x] Postgres: all of [03](03-database-schema.md) in one pass, cardio and planning tables included
- [x] Enums → users/auth → catalog → routines → workouts/sets → planner → **`gamification_tracks`**
      → **`sport_profiles`** → cardio → cardio plans → remaining gamification tables
      (`sport_profiles.xp_track` is an FK into the track catalog, so the catalog must exist first)
- [x] Every CHECK from the doc, especially `rir BETWEEN 0 AND 10` (INV-03) and `max_reps >= min_reps`
- [x] FK delete semantics per [03 §10](03-database-schema.md) — `exercises` is **NO ACTION**, not CASCADE
      and not `RESTRICT` ([ADR-013](decisions/ADR-013.md))
- [x] `‹sync›` applied by mixin to every **root** in [03 §11](03-database-schema.md) and to nothing else
- [x] **DB trigger backstop for INV-06**; `day_index` trigger against the parent's `length_days`
- [x] **RLS enabled and `FORCE`d, failing closed** on user-owned tables — every child table included
      ([ADR-013](decisions/ADR-013.md)); pre-authentication lookups as `SECURITY DEFINER` functions,
      never a bypass role ([04 §4](04-security-and-auth.md))
- [x] SQLite mirror per [03 §8](03-database-schema.md), including its documented differences
- [x] Seeds: muscle groups, **~200 exercises** (201), increment defaults, **all `sport_profiles`
      including deferred sports**
- [x] Seeds exported as a JSON asset the app can seed from before it has ever synced
- [x] **Increments for both unit systems at `numeric(10,6)`; every reference row keyed; both
      catalogs complete** ([ADR-008](decisions/ADR-008.md)) — prove an imperial block stays on the
      5 lb grid
- [x] **Schema-comparison script**: Alembic vs Drizzle names, *plus* [§11](03-database-schema.md)
      enforcement. Prove it fails when `‹sync›` is misplaced

#### ☑ 011 — Brand assets and design system · **L** · depends: 001
> Numbered late, built third. Task 004 builds the set row, and it should come out of a system
> rather than be retrofitted into one. The mark itself moved to [task 018](tasks/018-brand-mark.md).
> **Complete (2026-09-14).** Every criterion in the task file is proven by a test, a lint fixture or a script, each
> run in CI on the task's pull request. The device checks — 200 % font scale, the keypad beside the row, plurals under
> Hermes, TalkBack — are task 017's.
- [x] **Every slot the mark fills holds a plainly marked placeholder** — icon, splash, notification icon, favicon —
      rendered by a step CI runs again; never a stand-in octopus
- [x] Token file `src/ui/tokens.ts` (INV-23), both themes end to end with a device-only override, **lint banning
      literal colour, size and duration, and every spring** ([ADR-014](decisions/ADR-014.md))
- [x] The set row · the custom numeric keypad · RIR chips · metric tile · cycle cell · sheet · chip
- [x] **Track row** — the whole Progress screen is a list of these; works at 6 rows and at 15
- [x] **i18n wired, literal-string lint rule, catalog key- and argument-parity check in CI**; every component
      tested in both languages and both unit systems, in both themes (INV-27)
- [x] Damped house easing `cubic-bezier(0.18, 0, 0.06, 1)`, **no spring**; reduce-motion gives 120 ms cross-fades
- [x] Contrast **proven by a test over the corrected palette**: body 4.5:1, UI 3:1, **workout numerals 7:1**;
      tabular figures in every numeric style

#### ☑ 003 — Authentication and authorization · **L** · depends: 002 · blocks: 006, 012, 014
> The authorization half matters more than the authentication half.
> **Complete (2026-09-14).** Every criterion in the task file is proven by a test or a lint fixture, and CI was green on
> all four jobs of pull request #9, merged to `main` as `425a970`. The device checks — libsodium, offline sign-in, the
> privacy-key flows, the derivation timing — are task 017's; tuning argon2id to ~250 ms waits for a deploy target.
- [x] Auth endpoints + **v1 account lifecycle**: password reset and change, enforced email verification,
      email change, session list, security notification emails — every one in both languages
- [x] argon2id ~250 ms; the bundled breach list; **constant-time login** whether or not the email exists
- [x] Access JWT 15 min with no PII; opaque refresh token 60 days, rotated, **with reuse detection** and a
      60-second grace window for a lost response ([ADR-015](decisions/ADR-015.md))
- [x] Rate limits per IP and per account, **counted in Postgres** so they hold across instances (ADR-015)
- [x] **Base repository whose every method requires `user_id`, as a type error not a runtime one**
- [x] `SET LOCAL app.user_id` per transaction so RLS engages; **404 never 403** for someone else's row
- [x] **⚠ Privacy key lifecycle ([ADR-007](decisions/ADR-007.md))** — generate at registration, wrap
      client-side, unwrap on new-device sign-in, re-wrap on password change. Build it here even
      though nothing encrypts anything until task 007; retrofitting it is a migration with no
      derivable answer
- [x] **Wrapping KDF argon2id `m=64 MiB, t=3, p=1`, never cheaper than the login hash**, parameters in
      `users.privacy_key_kdf`; all crypto in `src/crypto/` on libsodium, confirmed on a device in task 017
- [x] Offline sign-in: a returning user with a valid refresh token reaches the app with no network —
      built here, proven on a device in task 017
- [x] **Account flows in `src/account/`** — no screen imports `src/sync/` or `src/crypto/`
      ([ADR-012](decisions/ADR-012.md))
- [x] **Prove RLS**: break the repository scope deliberately and assert 0 rows come back (NFR-9)

#### ☑ 019 — Account deletion · **M** · depends: 003 · blocks: the store listing
> Added 2026-09-14, closing open question 11. Needs no administrator rights, so it goes ahead while task 017 waits.
> **Planned 2026-09-14:** other devices stay signed in; the web page's link opens a page, and only its button schedules
> the deletion. **Complete (2026-09-18).** Built on `feat/task-019-account-deletion`, rebased onto `main` after task
> 017's core-rs merge, and merged as [PR #11](https://github.com/hiuriselzler/projeto_cyber/pull/11) with all five CI
> jobs green. Still open, neither blocking: which scheduler runs the daily command, chosen with the host; what a
> device keeps of training data, moved to task 006.
- [x] Deletion requested with the password, cancellable for 7 days from any signed-in device, announced by email in the
      user's language
- [x] **The sweep deletes every row of the account, inside its own scope** — a test over 03 §11 covers tables added later
- [x] The web deletion page Google Play links to, answering identically for any address; **opening its link schedules
      nothing**
- [x] One scheduled command, in `app/jobs/`, for the deletion sweep and the retention purges, documented in 06

#### ☑ 017 — Local toolchain, device and core spike · **L** · depends: 001, administrator rights · blocks: 004 onward
> Everything that needs administrator rights on the development machine, and every check only a phone
> can settle. **Must finish before task 004**: its spike decides how domain logic is written.
> **Complete (2026-09-19).** All 23 criteria in the task file are ticked, each proven on the machine, on a Galaxy
> S21 FE, or in CI. **[ADR-004](decisions/ADR-004.md) has its answer — option B, the single Rust core** — with all
> four bar conditions met: PyO3 from FastAPI, UniFFI from the physical device, and the Android artefacts built by CI
> on Linux *and* by EAS, the last read out of the built APK. The machine held none of the local environment tasks
> 001–003 built and was rebuilt on Docker; **the native build does not work on Windows** and is done in WSL2, which
> ADR-004 allows; five task-011 criteria moved to tasks 004 and 007, which build the screens they name.
> **Found and fixed along the way**, none of it predicted: the README's first command failed on a stock Windows
> install, the API's export scripts wrote CRLF here and not in CI, a comment claiming the key derivation took "about
> a second" was never measured and is 177 ms, and every screen drew under the status bar because no safe-area inset
> was ever applied. Built on `feat/task-017-device-checks` ([PR #16](https://github.com/hiuriselzler/projeto_cyber/pull/16)).
> **Task 004 is unblocked.**
- [x] Administrator installs: Windows long paths, WSL2, Docker Desktop, Android Studio (SDK, NDK,
      platform tools), Visual Studio Build Tools and Rust with the Android targets and `cargo-ndk`
- [x] Local stack: `docker compose up`, roles created by the init hook, integration tests run locally,
      every README command verified on Windows
- [x] **Development build on a physical Android device**, with hot reload; the API over `adb reverse`;
      a LAN address refused; the SQLite migration idempotent; secure storage surviving a restart
- [x] A release build refuses an `http://` API base URL, and its bundle carries no diagnostics code
- [x] Device checks moved from tasks 002, 011 and 003 — the Drizzle schema on a device, token changes,
      live numerals and TalkBack, the libsodium binding, offline sign-in, the key-derivation timing
- [x] **⚠ ADR-004 spike — 2 days, hard timebox** (moved from task 001). `round_to_increment()` through
      both bindings, called from FastAPI *and* from a physical Android device: `41.6 → 42.5`, and the tie
      `41.25 → 40`. Success defined in advance; WSL2 allowed locally; **the clock starts once a dev build
      runs on the device**. The iOS half is gate 1 of task 016
- [x] Rust CI job — `cargo deny`, clippy, fmt, Android cross-compilation — with `rand` and
      `SystemTime::now` each watched failing
- [x] **⚠ ADR-004 outcome written into the ADR.** Task 004 does not start while it is open

#### ☐ 004 — Exercise catalog and workout logging · **XL** · depends: 002 · blocks: 005, 009
> The core loop. Local-only, no sync. **This deserves more care than any other UI in the project.**
- [ ] Catalog: seed locally, browse/search/filter, custom exercises, **fork-on-edit** of globals,
      archive that never orphans history (INV-11)
- [ ] Routines with supersets; start-from-routine pre-fills targets and last-used weights
- [ ] **The set row** — `[weight] [reps] [RIR] [✓]` with last time's performance behind it
- [ ] **Custom numeric keypad** that never covers the row being edited, handling `,` and `.`
- [ ] **RIR as a chip row, never a keyboard.** Blank stores NULL, never 0 (INV-03)
- [ ] Set types, rest timer with haptics, notes, retroactive logging
- [ ] **Every mutation writes to SQLite synchronously** (INV-09) — no React state is the only copy
- [ ] History, charts, PR detection; `e1rm()` and `is_counted_set()` implemented **once**
- [ ] Mirror API endpoints so task 006 has something to sync against

#### ☐ 005 — Strength progression planner · **XL** · depends: 004 · blocks: 009, 010, 013, 014
> **The reason the product exists.**
- [ ] Engine: five v1 strategies (`cycle_pattern` is v2 — leave the arm unimplemented, not half-done)
- [ ] Generation + reconciliation as one **pure, deterministic, idempotent** function, `now` a parameter
- [ ] **Every projection stamped with `engine_version`; an older engine never re-projects a newer
      one's cycle**; user edits marked `last_write_kind = 'user'` (INV-06, ADR-004)
- [ ] `percent_1rm` carries `baseline_e1rm_kg` so generation is **total**; holds the baseline and
      reports open-loop when a cycle yields no e1RM (FR-3.2c, INV-07)
- [ ] **Per-set RIR = target + offset, clamped and marked `was_clamped`**; percentages in basis
      points; bodyweight e1RM over body weight on the set's date (ADR-010)
- [ ] Property tests: liftable loads (INV-02) · bounds respected (INV-05) · idempotence (INV-10) ·
      **only `projected` cycles ever differ** (INV-06) · `user_edited` / `is_pinned` never touched
- [ ] Variable cycle lengths throughout — **no `7` as a constant anywhere** (INV-25)
- [ ] Bulk generation as one batched insert (~1 500 rows), not a loop
- [ ] Date re-derivation in one transaction when a cycle's `length_days` changes
- [ ] **Two views that must agree**: cycle view (microcycle × day index) and calendar view (real dates)
- [ ] Plain post-session diff — the user must always see *why* a number changed
- [ ] **Fixture #1 is the user's own 40 → 62.5 kg example.** If it disagrees with what they meant,
      that surfaces here, cheaply
- [ ] `round_to_increment`: `nearest | down | up`, **a tie goes to the lighter load**, identical in every
      suite ([ADR-010](decisions/ADR-010.md))
- [ ] **⚠ ADR-004's conditions, under option B:** a kill switch per strategy and for local re-projection,
      over the air; a minimum engine version that gates re-projection and nothing else

### Milestone 2 — Multi-device
*Train on a phone and a tablet.*

#### ☐ 006 — Sync layer · **L** · depends: 003, 004 (005 if it lands first)
> **The hardest task in the project.** A separate task precisely so it is not rushed into feature work.
- [ ] `GET /sync/changes` with a `(updated_at, id)` cursor — **not a bare timestamp**, which drops
      rows sharing a millisecond — grouped in dependency order
- [ ] `POST /sync/push`, idempotent by client-owned IDs, **ownership checked per row** (INV-15)
- [ ] **Per-row results** so one bad row rejects itself instead of failing the batch
- [ ] Unknown fields tolerated in both directions; reject-rate metric exposed
- [ ] Outbox written **in the same transaction as the mutation** — no window where they disagree
- [ ] Drain worker: batched, exponential backoff, resumable, triggered on connectivity and foreground
- [ ] **Never sync a workout while `ended_at IS NULL`**
- [ ] Conflict resolution: **last-write-wins per row** (NFR-4), with all three carve-outs — a set or
      activity present on either side is never dropped; plans resolve at **microcycle** granularity;
      and within a cycle **a higher engine version beats a lower one, a user write beats an engine write**
- [ ] `superseded` returned per row and excluded from the rejection-rate alert; a device offline for
      a month on an older engine converges with no lost set and no lost edit
- [ ] **Test with two real devices**, not two simulators against one database
- [ ] **⚠ ADR-004 condition 3 — server reconciliation is authoritative.** Decide how it combines with
      same-version last-write-wins in [02 §7](02-architecture.md) *before* building conflict resolution
- [ ] ⚠ If this task overruns badly, that is [ADR-001 § Revisit if](decisions/ADR-001.md) — evaluate
      PowerSync/ElectricSQL over the existing Postgres rather than pushing on

### Milestone 3 — Both halves
*Run, ride, swim and lift, planned.*

#### ☐ 007 — Sport profiles and GPS recording · **XL** · depends: 002, 006 · blocks: 008, 009
> Two deliverables, and the framework matters more than it looks. **The technical risk of the whole
> project is concentrated here:** background location on Android is the least reliable thing in it.
- [ ] **Sport-profile framework first** — recorder dispatch, profile-driven live and detail screens
- [ ] **Gate: adding `walk` must be a profile row and nothing else.** Add it last, to prove it
- [ ] GPS recording surviving screen-off and backgrounding for an hour, on Android
- [ ] **Android foreground service with a persistent notification** — non-optional
- [ ] Permission at first tap of "record", foreground first, background only after one success
- [ ] **Every point written to SQLite as it arrives** — a crash mid-run costs nothing
- [ ] Pipeline, pure and versioned: accuracy filter → outlier rejection → elevation smoothing →
      accumulation → moving mask → splits. **Do not skip the cold-start filter** — it invents a
      phantom 100 m that becomes a bogus PR and poisons the personal bests
- [ ] Polyline + typed streams with **round-trip property tests** for all six kinds
- [ ] **Privacy trimming on-device before upload**, and zone CRUD sealed on the way out ([ADR-007](decisions/ADR-007.md))
- [ ] Per-sport personal bests; client-rendered thumbnails (no tiles, no network); **GPX export**
- [ ] Test on an aggressive-battery-manager device (Xiaomi or similar), not only a Pixel

#### ☐ 008 — Non-GPS sports · **M** · depends: 007
> Pool swim proves the framework. It shares almost nothing with running.
- [ ] **Acceptance gate: building this required no edit to task 007's shared components.** If it
      did, INV-19 was not achieved — say so and fix the framework, not the symptom
- [ ] Pool length asked before starting, stored per activity
- [ ] Both entry paths: live length counter **and** post-hoc set entry
- [ ] Distance **computed** as `lengths × pool_length_m`, never typed; pace/100 m; SWOLF
- [ ] **Wet-hands UI** — huge targets, high contrast, no precise gestures. Test at an actual pool
- [ ] No map, no elevation, no `min/km` on a swim — enforced by profile, not by a conditional
- [ ] Treadmill and indoor bike: manual entry with intervals. **No location prompt, ever**

#### ☐ 009 — Cardio planner · **L** · depends: 007, 008 (swim), 005 (engine shape)
- [ ] Plan structure mirroring the mesocycle, same three-mode deload policy including `none`
- [ ] Per-sport volume targets, **never summed across sports** (INV-20)
- [ ] **⚠ The +10 % rail normalised to cycle length** (FR-6.5a) **through the frozen integer table**
      (FR-6.5b). A flat +10 % on a 5-day cycle ramps ~40 % faster than intended, and the old stored
      rail tripped on its own default — this is the single most important test in the task
- [ ] Session types from the sport profile; intensity in the sport's own pace unit
- [ ] Interval `structure` JSONB editor, rendered as one readable line
- [ ] Activity↔session matching, **conservative** — a wrong match corrupts reconciliation input
- [ ] Resist merging the two engines into one abstraction; share the fixture harness only

### Milestone 4 — Feature complete
*One calendar, and tracks for the sports you actually do.*

#### ☐ 013 — Gamification · **L** · depends: 005, 007, 011
> **Must follow 005**, structurally: the scorer's input is a *prescription*. Built earlier it could
> only score volume — the one thing INV-22 forbids.
- [ ] Scorer in the core, pure and idempotent. **The signature is the safety mechanism** — it cannot
      see raw volume without a prescription
- [ ] Awards keyed `(user_id, source_kind, source_id, reason)`; **verify the constraint stops a
      double award, do not assume it** (INV-21)
- [ ] `xp_awards` source of truth; `user_track_progress` a rebuildable cache that **does not sync**
      — ship the rebuild command, fold on-device from local awards
- [ ] **Adaptive track set** — quality tracks from account creation; a discipline track created by
      the **first log of that sport**, resolved via `sport_profiles.xp_track` (INV-19)
- [ ] **A gym-and-swim user sees six tracks and no Ride placeholder.** No setting creates a track
- [ ] Rebuild restores the same *set* of tracks, not only the same totals
- [ ] **Streaks in microcycles** — "7 cycles", never "7 weeks"; grace cycle shown as remaining
- [ ] A session at 150 % of target scores **no more** than one at 100 % (INV-22)
- [ ] **Levels from the frozen 30-row threshold table**, in integer arithmetic; `level_scale_bp` may
      only decrease ([08 §2](08-gamification.md))
- [ ] A deload cycle completed as prescribed pays **more than three ordinary sessions**
- [ ] Progress is **a list**, not a figure — no octopus, no arms, no radial chart
- [ ] Full disable switch — off means gone, with no nagging
- [ ] **The ban list ([08 §6](08-gamification.md)) is a PR review checklist**, not advice

#### ☐ 010 — Unified calendar and analytics · **M** · depends: 005, 007, 008, 009
> Until this task, the two halves are two products sharing a login.
- [ ] One calendar, both halves, planned vs done vs missed, on real dates
- [ ] Drag a planned session to another day — a plan edit, so the row becomes `user_edited`
- [ ] **Today screen**, < 2 s cold start from local data. Nothing else competes for space
- [ ] Combined load view in **time**; distance per sport, never summed
- [ ] Sets per muscle per microcycle — **secondary muscles credited 0.2 of a set** by the core,
      never in SQL — plus RIR trend and adherence, all through the **shared** predicates
- [ ] "Sets this cycle" and "sets this week" shown as clearly different questions (INV-25)
- [ ] Measure the four-table join against a year of seeded history **before** optimising
- [ ] Resist building many charts. Three numbers the user acts on beat a dashboard nobody reads

### Milestone 5 — Sellable

#### ☐ 014 — Subscriptions and entitlements · **M** · depends: 003, 005
- [ ] Server-side trial from `created_at`; effective tier a pure function in the core
- [ ] RevenueCat over Play Billing (StoreKit 2 joins in task 016); webhooks are the source of truth;
      entitlement keyed to the account, not the store
- [ ] `pro_annual_founding` as **a separate store product with its own renewal price** — not a
      discount code or promotional offer, neither of which survives renewal
- [ ] **One gating boundary.** Scattered `if (isPro)` is how INV-26 gets violated by accident
- [ ] **Entitlement fails open** on network error (FR-9.7)
- [ ] Lapse → mesocycle read-only, never deleted, never hidden
- [ ] Paywall leads with the replacement comparison; **no countdown, no expiring offer, no loss framing**
- [ ] **⚠ The single most important test:** an expired account can still open its history, log a full
      workout, record an activity, sync it, and export everything (INV-26)

### Milestone 6 — Ready for strangers

#### ☐ 020 — Data export · **M** · depends: 006, 007, 013, 014 · blocks: the store listing
> Added 2026-09-14, closing open question 11. Built late so it holds every kind of data the app keeps.
- [ ] Needs a verified email, never an entitlement — **an expired account can export** (INV-26)
- [ ] **Every user-owned table in the archive**, SI units in field names, a GPX file per GPS activity
- [ ] A signed, expiring link to object storage, and an "export ready" email in the user's language
- [ ] Object storage chosen at the start of the task, free tier first

#### ☐ 018 — The mark · **M** · made by the project owner, by hand · blocks: the store listing
> Split from 011 on 2026-09-12. Outside the build sequence: task 011 leaves a placeholder in every slot, so nothing
> waits on the drawing but the launch.
- [ ] **The octopus drawn as a 19th-century engraved plate** — a drawn creature, never a logo shape ([07 §1](07-brand-and-ui.md))
- [ ] **Tone gate before anything else** — analytical, not cute. If it would work on a cereal box, restart
- [ ] 07's ladder by rendered size, **black on white first**; the glyph recognisable at 16 px
- [ ] Every placeholder replaced; the wordmark; the store icon and feature graphic
- [ ] **One canonical drawing, never personalised.** No per-user octopus is built at all ([07 §2](07-brand-and-ui.md))

#### ☐ 012 — Onboarding and first run · **M** · depends: 003, 004, 011
> **Last, deliberately** — you cannot onboard someone into features that do not exist.
- [ ] Ask only units, what they train, and optionally experience. **Not a seven-screen wizard**
- [ ] Straight to a workout; the planner offered only *after* a first completed workout
- [ ] One-sentence contextual explainers, each shown once, dismissible, re-readable
- [ ] Permissions asked honestly and late; **no location prompt for a user who only lifts**
- [ ] Empty states as technical line diagrams — **never spot illustrations of smiling people**
- [ ] **Install → first logged set in under three minutes, timed with a real stranger** (NFR-10)
- [ ] Tested with someone who does not know what RIR is, and who is not corrected by the tester

### After launch

#### ☐ 016 — iOS platform · **L** · after the Android launch
> [ADR-009](decisions/ADR-009.md): Android first; iOS is added, not ported. **The measure of this task
> is how little existing code it touches.**
- [ ] Prerequisites: Apple Developer Program, macOS access, Apple Small Business Program before the
      App Store launch
- [ ] **Gate 1 — the iOS half of the ADR-004 spike** on a physical iPhone, before any other iOS work
- [ ] Gate 2 — background location with the screen locked, and App Store review justification
- [ ] Gate 3 — StoreKit 2 through RevenueCat; entitlement crosses platforms in both directions
- [ ] **Adding iOS edited nothing outside `src/platform/`, config plugins and build configuration** (INV-28)
- [ ] VoiceOver, and Dynamic Type to 200 %; engine skew rules hold between an Android and an iOS build

#### ☐ 015 — Coach tier · **XL** · v1.1
> Priced as a tier, but **it is a second product.** It breaks the single-owner model INV-15 depends
> on, needs a real permission layer with athlete consent, and carries the project's worst privacy
> risk. **Announce the tier when it exists; do not sell it before.**
- [ ] Permission model and threat model **first, alone, reviewed hard** — before any UI
- [ ] Athlete grants access; revocable instantly by the athlete without asking the coach
- [ ] **GPS traces excluded by default**; every coach read audit-logged
- [ ] A dedicated security review — **not optional for this task**

---

## Cross-cutting, owned by no single task

These are real blockers scattered across the docs. Nothing will surface them at the right moment.

### Launch blockers
- [ ] **Privacy policy and terms of service** ([04 §7](04-security-and-auth.md)) — required by both
      stores *and* by GDPR/LGPD. Must state what is collected including location, where it is
      stored, retention, and how to export or delete. **In English and in Portuguese**, the
      Portuguese reviewed against LGPD in its own right
- [ ] **Everything user-facing exists in both languages** ([ADR-008](decisions/ADR-008.md)) — ~200
      exercise names, every explainer, every email template, both store listings, the paywall and
      the subscription disclosure. Content work on the critical path, not a polish pass
- [ ] **Portuguese terminology reviewed by a native speaker who trains** ([07 §9](07-brand-and-ui.md)) — an AI
      pre-check was run on 2026-09-14; this review is still the bar before strangers
- [ ] **Google Play's reduced-fee tier — enrol *before* launch.** 15 % vs 30 %, and **not
      retroactive**. (The Apple Small Business Program has the same rule and moves to task 016.)
- [ ] Google Play Console registration ($25 once). (Apple Developer Program: task 016.)
- [ ] Storage region chosen and stated in the privacy policy
- [ ] Transactional email live — **Resend**, chosen for the prototype (2026-09-14). Before real users: a verified
      sending domain, the key in every deployed environment, and the free tier's limits checked against volume
- [ ] **Account deletion and data export (FR-1.4)** — [task 019](tasks/019-account-deletion.md) and
      [task 020](tasks/020-data-export.md), the web deletion page Google Play requires included
- [ ] Google Maps API key restricted by package name + signing certificate
- [ ] **ADR-004's four conditions in place before the first user who is not the developer** — under
      option B; tasks 005 and 006 ([ADR-004](decisions/ADR-004.md))
- [ ] **The mark drawn, with no placeholder left in a store build** ([task 018](tasks/018-brand-mark.md)) — the render
      step reports every level still holding one

### Operations, from first deploy
- [ ] Staging environment, for rehearsing migrations against realistic data
- [ ] Managed Postgres with **PITR**, 7-day minimum; nightly `pg_dump` to a different account/region
- [ ] Choose a Postgres provider only if its admin user can create a non-owner, non-`BYPASSRLS` app role
      **and** a `BYPASSRLS` migrator role ([ADR-011](decisions/ADR-011.md))
- [ ] **Quarterly restore rehearsal into staging.** A backup that has never been restored is a
      hypothesis. Record the restore time — that number is the real RTO
- [ ] Sentry both sides with PII scrubbing and **coordinate fields explicitly denylisted**
- [ ] Uptime check on `/health/ready`; alert on **outbox rejection rate** — the earliest signal that
      client and server have diverged
- [ ] Dependabot both ecosystems; lockfiles committed; CI fails on high/critical audit findings
- [ ] Decide product analytics: **self-hosted PostHog with an allowlist, or none.** A hosted SDK is
      not the fallback ([05 §6](05-integrations.md))

### Gaps the task 004 stage-3 device pass opened, owned by no single task
- [ ] **No gate runs the React Compiler the shipped app runs with.** `Sheet` was broken for nine days with `tsc`,
      `eslint`, 597 Jest tests and every lint fixture green, because the compiler is applied by the Metro bundle and
      not by the test environment. Either run the suite under it, or ban render-phase `setState` by lint
      ([ADR-014 § Amendment](decisions/ADR-014.md)). Until then a phone is the only gate
- [ ] **A module can be written, tested, CI-gated and never called.** `seedReferenceData()` was all four for a
      stage, and the device ran with 0 exercises. Worth a check that every exported entry point of `src/db/` has a
      caller, or a smoke test that boots the app's startup path rather than its pieces
- [ ] **`packages/core-native`'s `.so` files are gitignored and do not travel with a commit** — a second checkout
      links a newer binding surface against an older binary and fails on `undefined symbol`. Commit them, or have
      CI regenerate and compare ([06 §1](06-operations.md))
- [ ] **Typed routes are not a CI gate.** `.expo/types/router.d.ts` is gitignored and generated only by `expo start`, so
      CI's `tsc` accepts any `href` while a developer's `tsc` checks against whatever stale copy they last generated
      (found in task 004 stage 5, 2026-09-23). Generate it in CI before `tsc`, or accept that routes are unchecked

### Standing review checklist
- [ ] Every PR touching entitlements is checked against INV-26
- [ ] Every PR touching rewards is checked against the [08 §6](08-gamification.md) ban list — every
      item on it is something a reasonable person would add in good faith
- [ ] No `if sport ===` in shared cardio code (INV-19)
- [ ] No literal hex, font size or duration outside the token file (INV-23)
- [ ] No `7` as a cycle constant in any planner (INV-25)

---

## Open questions

None are blocking; each has a stated assumption that will be built unless corrected.

| # | Question | Assumption | Decide by |
|---|---|---|---|
| 1 | Family / multi-athlete household plan? | Deferred — overlaps the Coach seat model | After 015 |
| 2 | Other territories beyond US and BR? | Add with real purchasing-power adjustment, **never exchange-rate conversion** | Post-launch |
| 3 | Lifetime plan? | **No** — trades away the revenue that funds development | Settled unless challenged |
| 4 | Exact prices, including BRL | Structure settled, numbers provisional | Task 014 |
| 6 | How many users at once ([NFR-12](01-business-requirements.md)), and the load test that proves it | Design goal only: stateless API and pooling-safe database access from the first commit | Before launch |
| 7 | The Android application id. **Permanent after the first Play Store upload** | `com.cyberathlete.app`, a placeholder in `apps/mobile/app.json` | Before the first Play upload |
| 8 | Android backups: the generated manifest has `allowBackup="true"`, so local data — raw GPS points included — would reach device backups | Unchanged for now | Before [task 007](tasks/007-cardio-recording.md) |
| 12 | Which address the per-IP rate limits count ([04 §5](04-security-and-auth.md)). The API reads the socket's peer, `request.client.host`; behind a hosting platform's proxy that is the proxy for everyone, so registration would allow 5 an hour across all users | The client address comes from the platform's forwarded header, trusted only when the request arrives from the platform's own proxy — configured once the host is chosen ([05 §5](05-integrations.md)) | Before the first deploy |
| 13 | Is a rest notification ~22–40 s late with the screen off acceptable, or does the app ask for `SCHEDULE_EXACT_ALARM`? One clean sample on the S21 FE: ~39 s on a 2:00 rest | Inexact alarms; the on-screen timer and its haptic are exact | Before launch, with more samples ([task 004](tasks/004-exercise-catalog-and-logging.md)) |
| 14 | A target time or distance on a routine exercise — a schema addition | None: holds and carries get sets and rest, and pre-fill from last time | Task 005, where prescriptions live |
| 15 | Personal records for time and distance — longest hold, farthest carry | Not built; such sets count as sets, with zero tonnage and no PR | Stages 6–7 of task 004 |
| 16 | Short imperial distances in feet or yards (sleds are often yards in US gyms) | Feet, following ADR-008's m/ft pair | The imperial pass of task 004's device checks |
| 17 | The Portuguese set-type letters — `Aq D B A` | As written, catalog content | The native-speaker review ([07 §9](07-brand-and-ui.md)) |
| 18 | **Who builds body-weight entry?** `body_weight_log` exists on both sides and every bodyweight e1RM, tonnage and PR reads it (INV-07, FR-2.15a), but no task gives the user a way to write to it — task 010 only charts it. Until something does, a pull-up or dip has no load, no e1RM and no record | Not built in task 004; bodyweight sets count as sets and celebrate nothing | Before launch — likely task 010 or 012 |

**Closed 2026-09-09** — target RIR granularity (now `rir_mode` on the progression rule);
cardio intensity (both zones and pace ranges); bodyweight volume (summed); and the octopus
dashboard (dropped — the mark is brand-only). See the decision log.

**Closed 2026-09-10** — engine version skew, specified in [02 §7](02-architecture.md) and INV-06.

**Closed 2026-09-11** — the founding-price window opens once, at the Android launch, and **does not
reopen for iOS** ([09 §2](09-business-model.md)).

**Closed 2026-09-14** — the email provider (Resend, for the prototype), and who builds FR-1.4 (tasks 019 and 020). See the decision log.

**Closed 2026-09-19** — question 9, the RIR `5+` chip: it opens a second row of 5–10 and stores
nothing itself ([task 004](tasks/004-exercise-catalog-and-logging.md) § Scope). See the decision log.

---

## Decision log

| Date | Decision |
|---|---|
| 2026-09-07 | [ADR-001](decisions/ADR-001.md) Phone owns a full local database; server is a sync target |
| 2026-09-07 | [ADR-002](decisions/ADR-002.md) Plans are materialised rows, re-projected by a pure engine |
| 2026-09-07 | [ADR-003](decisions/ADR-003.md) GPS tracks as typed streams + polyline, not point rows |
| 2026-09-07 | [ADR-004](decisions/ADR-004.md) Single Rust core — **conditional, pending the spike (task 017)** |
| 2026-09-08 | [ADR-005](decisions/ADR-005.md) Gamification rewards adherence and recovery, never volume |
| 2026-09-08 | [ADR-006](decisions/ADR-006.md) Subscription monetisation, and the line the paywall never crosses |
| 2026-09-08 | [ADR-007](decisions/ADR-007.md) Privacy zones sync as ciphertext under a key the server never stores (claim narrowed 2026-09-11) |
| 2026-09-10 | [ADR-008](decisions/ADR-008.md) Two languages and two unit systems, from the first release |
| 2026-09-10 | [ADR-009](decisions/ADR-009.md) Android first; iOS as a structural addition, not a port |
| 2026-09-11 | [ADR-010](decisions/ADR-010.md) Exact numbers — bodyweight e1RM, per-set RIR, basis points, the safety rail, the XP curve |
| 2026-09-11 | [ADR-011](decisions/ADR-011.md) Database roles — the API connects as a role that cannot skip RLS; unscoped reads are allowlisted functions |
| 2026-09-11 | [ADR-012](decisions/ADR-012.md) Mobile boundaries before bootstrap — an account layer, one importer of the core, INV-10's gates |
| 2026-09-12 | [ADR-013](decisions/ADR-013.md) The schema enforces itself — `user_id` on every child row, `NO ACTION` for exercises, the INV-06 marker carried by the row, INV-21's key with no NULL hole |
| 2026-09-12 | [ADR-014](decisions/ADR-014.md) The design system enforces itself — tokens, contrast, motion and strings by gate |
| 2026-09-14 | [ADR-015](decisions/ADR-015.md) Account security in practice — rate limits in Postgres, a 60-second rotation grace window, a bundled breach list, registration's `409` |
| 2026-09-18 | **[ADR-004](decisions/ADR-004.md) settled — option B, the single Rust core.** The spike's bar is met in full; task 004 is unblocked. The four pre-launch conditions are untouched and still required |
| 2026-09-19 | [ADR-012](decisions/ADR-012.md) **amended** — `src/db/` mints row ids through `src/crypto/`'s identifier entry point, and nothing else in that folder. INV-16 had no legal path to a UUIDv7 from the folder that creates training rows |
| 2026-09-19 | [ADR-014](decisions/ADR-014.md) **amended** — a design-system component with a state prop is tested by **moving** it, not by rendering each value. `Sheet` never opened for nine days and every gate stayed green |
| 2026-09-23 | Task 004 stage 5 re-cut into 5a/5b/5c; the live session carries its own rest and targets; the rest timer is derived; a routine pre-fills weight and reps, never RIR — see the dated entry below |
| 2026-09-24 | Task 004 stage 6 planned: the previous bests folded in the core; a record is the current best; a past workout's `completed_at` is its chosen end while `updated_at` stays real — see the dated entry below |

### 2026-09-08 — documentation reconciliation pass

Run before task 001, because four of the findings were schema and
[task 002](tasks/002-database.md) declares itself the last cheap moment to change it.

- `adherence_streaks` was defined twice, incompatibly. Resolved to **microcycles**, and the
  streak unit corrected in FR-8.4 and ADR-005.
- `xp_awards.amount` regained its `CHECK (amount >= 0)` — INV-22 expressed in the database.
- **Privacy zones had no storage defined anywhere.** Resolved by [ADR-007](decisions/ADR-007.md).
- INV-03 extended: `perceived_fatigue` and `perceived_effort` are **never** engine inputs. A 1–10
  subjective field not spelled `rpe` but fed into autoregulation is the same bug with better naming.
- `‹sync›` turned from a checklist item into a classification ([03 §11](03-database-schema.md)),
  with CI enforcement in task 002. Fixed `hr_zone_overrides` (missing) and `personal_records`
  (present on a table that never syncs); confirmed `cardio_plan_cycle_targets` must **not** have it.
- `percent_1rm` given a defined, total behaviour when e1RM is NULL.
- Conflict granularity settled as **per row**; NFR-4's "per field" removed.
- **"Week" no longer names a training unit anywhere.** 67 replacements, including the schema
  identifiers `week_pattern` → `cycle_pattern` and `plan_week` → `plan_cycle`. "Week" now appears
  only where a literal calendar week is meant.
- Stale single-user leftovers cleared from [05 §5](05-integrations.md) and task 010.
- All 36 doc cross-links verified resolving.

### 2026-09-09 — the track set adapts, and the mark stops being a dashboard

Four open questions closed, and two of them turned out to be one decision.

- **Gamification tracks match what the user actually trains** (FR-8.1, FR-8.1a,
  [08 §2](08-gamification.md)). Four quality tracks are always on; discipline tracks are **one per
  sport**, each created automatically by the first log of that sport. Nothing is configured, and a
  sport the user does not do has no row and no placeholder.
  - Recorded as a **safety** change, not a cosmetic one
    ([ADR-005 § Amendment 2](decisions/ADR-005.md)): a permanent level-1 Ride track is an
    unfinished task, and the only way to finish it is to train a sport nobody prescribed. That is
    volume pressure arriving through layout, which the XP rules do not cover.
  - Mechanism is INV-19's: `sport_profiles.xp_track` declares the mapping, so the scorer never
    branches on a sport and a new sport stays "a profile row plus a track row".
  - **Accepted consequence:** an outdoor run and a treadmill run level separately. If that reads
    badly in use, the fix is a grouping column, never a hardcoded merge.
- **The personal octopus is dropped** ([07 §2](07-brand-and-ui.md)). The mark is a brand figure
  only — never personalised, never data-driven, never a progress readout. It could not have
  survived the change above in any case: eight arms cannot render a track set whose size is not
  eight. Progress is a plain list of the user's own tracks.
- **Target RIR granularity is the user's**, as `progression_rules.rir_mode`
  (`per_exercise` | `per_set`), inheriting the FR-3.6 cascade. Authoring only — storage stays
  per-set, so switching mid-block is a re-projection, not a migration (FR-3.8a).
- **Cardio intensity targets are both** HR zones and pace ranges, per session; **bodyweight and
  added load sum into one volume figure**. Both were already the working assumption and are now
  settled.

Schema effects for [task 002](tasks/002-database.md): `progression_rules.rir_mode`,
`sport_profiles.xp_track`, `user_track_progress.activated_at`, and `gamification_tracks` loses
`radial_degrees` and gains a row per sport.

### 2026-09-09 — one rule for caches, instead of two exceptions

`user_track_progress` was a sync **root** while `personal_records`, the same shape of thing, was
**derived** and never synced. Nothing recorded why, so the next cache would have been classified by
coin flip.

- **`user_track_progress` is now derived** ([03 §11](03-database-schema.md)): no `‹sync›`, omitted
  from the device schema, folded on demand from local `xp_awards`. It gains `computed_at`, like
  `personal_records`.
- **The rule, written down where the next person will look:** *a cache is never a sync root — its
  ledger is.* Both folds are over tables that already sync, so every device can compute them
  itself. Replicating the fold as well would create a second, weaker source of truth for the same
  fact, and under last-write-wins a stale device could overwrite a fresher total with an older one.
  It would self-heal on the next rebuild — which is the argument against replicating it at all.
- **A constraint this surfaced:** XP is monotonic (`amount >= 0`), but *level* is a function of XP
  under the scoring curve, so a steeper curve would lower somebody's level on the next fold.
  **INV-22 forbids that.** A curve change must be level-preserving or level-raising for every
  existing user, replayed against real ledgers before it ships. Task 013 carries that as an
  acceptance criterion.

### 2026-09-10 — two languages, two unit systems, and a precision bug nobody had seen

[ADR-008](decisions/ADR-008.md). Started as "imperial increments are unspecified"; turned out to be
three problems, one of them serious.

- **English and Português (Brasil) from the first release.** No language had ever been specified,
  while the first paying market is Brazilian. `users.locale`, independent of unit system, both
  defaulted from the device. New **INV-27**: no user-facing string is hardcoded; reference content is
  translated through keys; user content never is. Catalogs live in `packages/shared/i18n/` and are
  read by the app *and* the API.
- **Full metric/imperial, one setting.** kg/lb, km/mi, m/ft, pace and speed, °C/°F. Storage stays SI.
  Swim pace follows the pool's unit; rowing is `/500 m` everywhere; race distances are universal and
  the mile joins the running PBs.
- **INV-02 was only true in kilograms.** Every seeded increment was metric, so an imperial user
  would have been prescribed 93.7 lb. Now `modality_increments` seeds both systems, lb plates stored
  as exact kg equivalents.
- **The serious one — a storage precision defect.** Even with correct lb increments, `numeric(5,2)`
  stores 5 lb as 2.27 kg. Simulated over a 52-cycle block from 135 lb: **52 of 52 prescriptions off
  the 5 lb grid, the first at cycle 1.** At `numeric(10,6)` increments and `numeric(9,4)` loads:
  **0 of 52.** INV-02 now states the precision requirement and the evidence for it.
- Auto-splits are written in both km and mi, so switching units recomputes nothing (INV-13).
- Cleared in passing, because they sat in the rows being rewritten: `users.gamification_enabled`
  existed only in prose and is now in the table; `uses_bodyweight` cited a nonexistent open question.

### 2026-09-10 — ADR-004 re-argued for real users; secondary muscles weighted

- **ADR-004's case for the Rust core no longer rests on "the only user is the developer."**
  **Option B still stands**, on four reasons — OTA reaches offline users last anyway; the server's
  engine hotfixes by ordinary deploy; the JS wrapper can switch a faulty strategy off over the air;
  this is the least-changing code in the project — and **only with four conditions** in place before
  the first external user: a client kill switch, an engine version on every projection, server
  reconciliation treated as authoritative, and a minimum engine version that gates re-projection and
  nothing else. If the spike works but those conditions cannot be met, option A wins.
- **A requirement both options share, surfaced by re-arguing it: engine version skew.** Devices run
  many engine versions at once; two versions are two different functions, and under last-write-wins
  they overwrite each other forever — INV-10's own failure mode. An older engine's projection must
  never overwrite a newer one. **Not yet specified** into [02 §7](02-architecture.md) or the schema;
  tracked as open question 5.
- **Secondary muscles count as 20 % of a set** (FR-2.16). Primary 1.0, each secondary 0.2, applied by
  one attribution function in the core and never in SQL. Per-muscle figures are not additive into
  totals. A trigger stops an exercise listing its primary muscle as secondary, which would credit
  1.2 per set.
- Stale "single-user" phrasing cleared from [03 §9](03-database-schema.md),
  [09 §3](09-business-model.md) and task 015 — where it meant *single-owner*, it now says so.

### 2026-09-10 — engine version skew, specified

The rule: **a projection from an older engine never overwrites one from a newer engine.** Now in
INV-06, [02 §7](02-architecture.md), the schema, and tasks 002, 005, 006 and 009.

- Every microcycle, strength and cardio, carries `engine_version` and `last_write_kind`
  (`engine` | `user`).
- **The rule could not be applied naively.** "Newer engine wins" on its own would silently delete a
  user's hand edit made on an older build whenever the server re-projected the same cycle —
  breaking FR-3.14. So sync decides by *who wrote* before *when*: higher engine version beats lower;
  a user write beats an engine write; only same-kind, same-version writes fall back to the
  timestamp.
- An older device yields rather than fights: it will not re-project a cycle a newer engine owns, and a
  push that tries is answered `superseded` — a normal result, excluded from the rejection-rate alert.
- `ENGINE_VERSION` is bumped **exactly when a shared fixture's expected output changes**. The
  "bad projection shipped" runbook now requires the bump; without it, devices on the old build would
  keep overwriting the fix.

### 2026-09-10 — Android first, and the task 001 blockers cleared

[ADR-009](decisions/ADR-009.md). The development machine is Windows, iOS native builds need macOS, and
the ADR-004 spike demanded both platforms in two days — so its iOS half would have measured build-queue
patience rather than the toolchain.

- **Android only for initial development and the first release.** The first paying market, Brazil, is
  overwhelmingly Android. The US is majority iOS, and its half of the business model is materially
  weaker until iOS ships — stated in the ADR, not hidden.
- **iOS is a structural addition, not a port.** New **INV-28**: only `src/platform/` may know the
  operating system, enforced by lint from task 001. The rule matters most *because* there is one
  platform — with nothing to break, an Android assumption in shared code would go unnoticed until the
  port.
- **New [task 016](tasks/016-ios-platform.md)**, gated: the iOS half of the ADR-004 spike first, then
  background location, StoreKit, App Store requirements. Its first acceptance criterion is that adding
  iOS touched no shared code.
- **The deferred risk, named:** if UniFFI's React Native bindings fail on iOS, the iOS app needs a
  TypeScript mirror of the engine for that platform alone. The most expensive thing ADR-009 defers.
- **Task 001 rewritten** — every former blocker resolved. No Apple account or Mac needed; Windows fully
  supported. `docker-compose.yml` at the repository root. **Every scope item now has an acceptance
  criterion**, including three gates proven by breaking them: import-linter, the INV-28 platform rule,
  and `cargo deny` plus clippy for INV-10.
- **Found while rewriting it:** INV-10 says `cargo deny` enforces "no `SystemTime`", but `cargo deny`
  inspects crates, not standard-library calls. Task 001 adds clippy's `disallowed-methods` for the
  clock; INV-10's own wording is not yet corrected.

### 2026-09-11 — exact numbers, and the last open specs closed

[ADR-010](decisions/ADR-010.md). Five items settled, and four of them turned out to share a single
failure mode: a number client and server must agree on, held in a form that cannot be exact.

- **Founding pricing does not reopen for iOS.** The window opens once, at the Android launch.
- **Bodyweight e1RM counts the lifter:** body weight plus added load, with body weight taken from the
  log **on or before the set's date**, so weighing in never rewrites history. No body weight by then
  means no e1RM — the same rule as a missing RIR.
- **Per-set RIR is a sum, clamped:** exercise target plus per-set offset, each result held inside the
  rule's bounds and marked `was_clamped`. INV-05 unchanged.
- **Percentages are integer basis points.** At two decimal places 2.5 % was stored as 3 %, so a 2.5 %
  step from a 140 kg squat would have prescribed 145 kg instead of 142.5 kg. Seven columns renamed.
- **The cardio safety rail failed on its own default plan.** Its stored rate sat below its own formula,
  so the default +10 % per 7 days already exceeded it, and nothing said whether it compounds. Now it
  compounds, is computed once per cycle length, rounded down and frozen as an integer table — the
  default passes by construction, and the 7-day entry is exactly 1000 bp.
- **The XP curve exists:** a frozen 30-row threshold table — level 5 in about nine days, level 10 in
  under three months, each level past 25 taking months — **started steep on purpose**, because INV-22
  lets a curve be loosened and never tightened.
- **INV-10's enforcement wording is corrected:** `cargo deny` bans crates; clippy's `disallowed-methods`
  bans `SystemTime::now`.

### 2026-09-11 — security reconciliation before task 001

Found in a pre-code review and settled now, because tasks 001–003 would otherwise have built the weaker
version.

- **RLS could have been skipped silently.** Postgres exempts superusers, `BYPASSRLS` roles and table
  owners, and the Docker default user is a superuser — every RLS test would have passed against a
  defence doing nothing. Now: two roles (`cyberathlete_migrator`, `cyberathlete_app`), RLS `FORCE`d
  and failing closed, pre-authentication lookups through `SECURITY DEFINER` functions rather than a
  bypass role, and an API that refuses to boot on a role that could skip RLS. Recorded as
  **[ADR-011](decisions/ADR-011.md)** ([04 §4](04-security-and-auth.md), INV-15, tasks 001–003).
- **ADR-007 claimed more than it delivered.** Nothing the server *stores* opens a zone; the *running*
  server sees the password at login, so a compromised API could. The claim is narrowed and the residual
  risk written down. Keeping the password off the server entirely (a client-derived credential or
  OPAQUE) was considered and declined for v1 ([ADR-007 § Amendment](decisions/ADR-007.md)).
- **The wrapping KDF had no parameters**, and a wrapped key is a password-guessing oracle. Now argon2id
  `m=64 MiB, t=3, p=1`, never cheaper than the login hash, with parameters in the new
  `users.privacy_key_kdf`.
- **Client-side crypto had no home.** New `apps/mobile/src/crypto/`, on libsodium through a native
  binding — not `core-rs`, which may not hold randomness.
- **The dev HTTPS rule could not be followed and guaranteed nothing.** Debug builds use `http://` to
  `localhost` only, over `adb reverse`; release builds permit no cleartext, enforced by CI and by an API
  client that refuses a non-`https` base URL ([04 §5](04-security-and-auth.md)).
- **Tooling.** Node 20 reached end of life in April 2026 → Node 24 LTS. `npm audit` cannot run in a
  pnpm workspace, so that gate would never have fired → `pnpm audit`.

INV-15's enforcement changed, with ADR-011 as its record. INV-28 only gained `crypto/` in its list of
shared folders, under the ADR-007 amendment.

### 2026-09-11 — task 001's boundary rules, specified

Task 001's lint gates were one sentence, and part of it could not work: import-linter sees imports, not
calls, so "`domain/` must not import `datetime.now`" named a rule it cannot enforce; and "features must
not import each other" is a TypeScript rule that no Python tool checks.

- **API:** five import-linter contracts — layers, routers, domain purity, core, and **the ADR-011 fence:
  only the auth and maintenance services may import `repositories/unscoped`** — plus ruff `banned-api`
  for clock, identifier and environment reads in `domain/`.
- **Mobile:** an ESLint folder matrix taken from the responsibility map, and package fences that give
  each sensitive capability exactly one home — network in `src/sync/`, crypto libraries in
  `src/crypto/`, `expo-secure-store` in those two, location in `src/recording/` and `src/platform/`, the
  `Platform` import in `src/platform/`. `no-console` where keys and tokens pass through.
- **Rules are tested, not trusted:** each has a known-bad fixture CI must see caught, because a mistyped
  glob disables a rule silently.
- The `core-rs` binding's import rule waits for the decision on which folder loads the native module.

No invariant's wording changed. INV-28's rule is implemented by banning the `Platform` import, which
rejects everything the invariant names. INV-10 still says that, under option A, "the equivalent gate is an
import-linter rule" — the same import-versus-call mistake — and is corrected with the INV-10 enforcement
ADR.

### 2026-09-11 — decisions before bootstrap

Settled with the user after a pre-code review of task 001, in one pass.

- **The spike's bar is set before it starts** ([ADR-004](decisions/ADR-004.md) § Decision procedure):
  PyO3 from FastAPI and UniFFI from a physical Android device, with the Android artefacts built by CI on
  Linux and by EAS. WSL2 is acceptable locally; a native-Windows build that fights back is not a failure.
- **Sign-in had no legal import path.** Features could reach neither `sync/` nor `crypto/`, and sign-in
  needs both. New **`src/account/`** owns the account flows and calls both; features still never import
  `sync/` ([ADR-012](decisions/ADR-012.md)). INV-28's folder list gains `account/`.
- **Only `src/domain/` imports the `core-rs` binding**, a workspace package; `src/platform/` no longer
  claims to load it (ADR-012, [ADR-009](decisions/ADR-009.md) amended).
- **INV-10's option-A gate corrected** — an import rule plus a call ban for each copy — and
  `invariants.md` put back in numeric order, both through ADR-012. This closes the item left open in the
  entry above.
- **Loads cross the core as `f64` kilograms.** `round_to_increment` has modes `nearest | down | up`, and
  **a tie goes to the lighter load**, implemented explicitly rather than with a language's `round()`
  ([ADR-010 § Amendment](decisions/ADR-010.md)).
- **ADR-004's four conditions have owners:** the kill switch and the minimum engine version in task 005,
  server authority in task 006, and all four together a launch blocker.
- **Found while assigning them:** condition 3 was in no task, and [02 §7](02-architecture.md) still lets
  a device's engine write beat the server's at the same engine version. Flagged in task 006, to settle
  before that task starts.
- **Concurrency is a design goal:** hundreds of users active at once (NFR-12), with no number yet — open
  question 6. From the first commit the API holds no state correctness depends on, rate-limit counters
  included ([04 §5](04-security-and-auth.md)), and its database access stays pooling-safe. 02 §8 revised.
- **Private GitHub repository**; task 001 resized **M → L**.
- `.agents/AGENTS.md` created — the reading order and working rules for any agent.
- Fixed in passing: seeds live in `apps/api/seeds/`, and 06 §1's commands now run in PowerShell and bash;
  task 003 no longer claims to block 011; task 005's blocks list matches this file; stale option-A
  wording in 00, 02 and 06 §3; task 001 gained readiness at migration head,
  `ALTER DEFAULT PRIVILEGES FOR ROLE`, expected values for the spike, and a Windows path-length note.

### 2026-09-11 — task 001 kickoff

- **The startup path** ([ADR-012 § Amendment](decisions/ADR-012.md)): the root layout may import
  `account/`'s bootstrap as well as `db/`'s migration, so the session is restored and sync started at
  launch. Debug-only diagnostics reach `sync/` and `crypto/` through `account/`, never through a lint
  exemption.
- **Continuous native generation:** `android/` is generated by `expo prebuild` and never committed; every
  native setting is a config plugin.
- **The spike's clock starts once a dev build runs on the physical device** — installing the toolchain is
  not part of the two days.
- **No admin rights on the development machine yet.** Long paths, WSL2, Docker Desktop and Android Studio
  are installed last, and with them come local Postgres tests, the dev build, the on-device criteria and
  the spike. The repository, the code, and the gates that need none of them come first.
- Defaults taken: SQLAlchemy async over psycopg 3 with server-side prepared statements off (pooling-safe);
  `structlog` with `X-Request-ID`; the role script at `infra/postgres/roles.sql`.

### 2026-09-11 — task 001 in progress: what the build settled

The repository, the API, the shared package, the mobile app and CI exist; everything that needs admin
rights, a database, a device or Rust is still ahead. Settled while building, and worth knowing:

- **Readiness is "not behind", not "exactly at head".** A schema at a revision this build does not know
  counts as ready: a later release applied it, expand/contract keeps this build compatible, and treating
  it as not ready would make rolling back impossible (06 §4, §5).
- **The migrator takes back the app role's write access to `alembic_version` after every migration.**
  Default privileges would otherwise let the API rewrite its own schema version.
- **Configuration errors never echo values.** Pydantic's own message repeats the input, which holds
  `DATABASE_URL` and its password; boot errors name the setting instead.
- **The OpenAPI types come from the application's schema** — what the API serves at `/openapi.json` —
  exported without a server or a database. The two can only differ if routes were added at runtime,
  which this codebase does not do; CI still fails on a stale copy. Task 001's criterion was reworded to
  match (2026-09-12).
- **Toolchain as resolved for Expo SDK 57:** React Native 0.86, TypeScript 6, **Jest 29 and ESLint 9**
  (Expo's own lint plugins do not yet support ESLint 10), eslint-plugin-boundaries 7 with its new
  `boundaries/dependencies` rule and file categories for the root layout's two entry points.
- **pnpm 12 runs no dependency install script unless allowed.** Two are: `esbuild` (drizzle-kit) and
  `unrs-resolver` (eslint-config-expo). pnpm's supply-chain age check also recorded exclusions for the
  just-released Expo 57 packages in `pnpm-workspace.yaml`.
- **Found, not yet acted on:** Android backups (open question 8), and the application id, a placeholder
  until the first Play upload (open question 7). React Native's new `debugOptimized` variant also takes
  the release network rules, so only the plain `debug` build reaches `localhost`.
- **Git:** commits as `hiuriselzler`; the remote is the private `hiuriselzler/projeto_cyber` on GitHub.
  `main` holds the agreed documentation; task 001's work sits on its own branch, so CI runs on its pull
  request before anything reaches `main`.
- **First CI run:** the API job passed — integration tests included, against a real Postgres. The three
  Node jobs failed before any check ran (setup-node looked for pnpm before it was installed), fixed by
  installing pnpm first. The second run passed all four jobs, and the criteria it proves are ticked
  in task 001 — the "watch CI fail" proofs, the device and the spike are still open.
- **The gates fail when broken — in CI, not only locally.** Four throwaway `proof/…` branches each
  broke one rule: an `sqlalchemy` import in `app/domain`, `Platform.OS` in a feature, a typo in one
  folder's lint glob, and a release network config allowing cleartext. Each turned exactly its own
  job red at the expected step, with every other job green. The glob typo left real code passing
  lint and was caught only by the fixture self-test — which is what that check exists for. The
  branches were deleted afterwards. Still open: a non-debug build refusing an `http://` base URL on a
  device, and the two Rust proofs that come with the spike.

### 2026-09-12 — task 001 closed; the work needing administrator rights becomes task 017

The development machine has no administrator rights yet, and everything left in task 001 needed them.
Rather than hold every later task behind that, the work was split.

- **Task 001 is complete.** Its remaining criteria moved, word for word, to [task 017](tasks/017-local-toolchain-device-spike.md):
  the local Docker run, the development build and every on-device check, a non-debug build refusing
  `http://`, the Rust CI proofs, and the ADR-004 spike.
- **Task 017 comes before task 004, not at the end.** The spike decides whether domain logic is written
  once in Rust or twice in Python and TypeScript, and task 004 writes the first of it. ADR-004 carries a
  dated note; its procedure is otherwise unchanged. Tasks 002, 011 and 003 hold no shared domain logic.
- **The new order:** 001 → 002 → 011 → 003 → **017** → 004 onward.
- **Device-only criteria from tasks 002, 011 and 003 moved to 017 as well**, so those tasks can close on
  what CI proves: the Drizzle schema on a device; token changes, live numerals and TalkBack; the libsodium
  binding, offline sign-in, the privacy-key flows and the key-derivation timing.
- **Risks accepted:** database tests run only in CI until Docker is available, a few minutes per push;
  and nothing has run on a real phone yet, so a native-build problem would surface in 017, after 011 and
  003 exist. Task 003's mobile flows are built against `src/crypto/`'s interface and tested in Jest; 017
  confirms the native binding before anything relies on it.
- **Decided since:** the portable Postgres (next entry). **Still open:** an early development build
  through Expo's cloud service, to find native-build problems before 017.

### 2026-09-12 — a local PostgreSQL without Docker

- **PostgreSQL 16.15 runs from the user profile**, with no administrator rights: binaries in
  `%LOCALAPPDATA%\Programs\pgsql-16.15`, data in `%LOCALAPPDATA%\cyberathlete\postgres-16`, listening on
  `127.0.0.1` only with password authentication, and the two roles applied from
  `infra/postgres/roles.sql`. `.env` holds freshly generated secrets and is git-ignored. Start and stop
  commands are in the README.
- **Only a verified build was kept.** EDB publishes no checksum and no signed executables for this zip,
  and its download page served a third build, 16.15-3, that no independent source confirms. Build
  16.15-1 is installed instead: its zip matches the hash in Scoop's manifest, and its programs are
  byte-identical to zonky's copy on Maven Central, itself checked against Maven Central's checksums. Both
  copies come from EDB in the end, so this rules out tampering on the way, not at the source.
- **Found: psycopg's async driver cannot run on the event loop Windows uses by default.** Every
  integration test failed locally while CI, on Linux, passed. The test suite now selects the compatible
  loop on Windows (`apps/api/tests/conftest.py`), and all 51 API tests pass locally with none skipped.
- **The API starts on Windows only under `uvicorn --reload`** — already the documented command. A plain
  `uvicorn` refuses to start, and its message blames an unreachable database. Linux is unaffected, so the
  API code is unchanged and the README says so.
- **The whole API ran on this machine for the first time:** under `--reload`, `/health/ready` answered 200
  against the local database, after the boot-time role check passed as `cyberathlete_app`.
- **Two audit findings accepted, by id.** `pnpm audit --audit-level high` reports two advisories in
  `image-size` (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq): denial of service from a crafted image, with no
  patched version. It is reached only through Metro at build time and never ships in the app. The gate
  stays at "high" and ignores only those two ids, with the reason beside them in `pnpm-workspace.yaml`;
  revisit when a patch exists.

### 2026-09-12 — task 002 built: the schema, in both databases, enforcing itself

- **[ADR-013](decisions/ADR-013.md)**, from planning the task. Thirteen child tables had no owner column, so
  row-level security had nothing to compare — and Postgres checks foreign keys without RLS, so a guessed
  UUID could attach a row to another user's workout. Every child now carries `user_id`, and its reference
  to the parent is composite, so a cross-user reference fails as a foreign-key violation. Exercise
  references are `NO ACTION` rather than `RESTRICT`, which would have failed account deletion depending
  on cascade order. The INV-06 trigger reads a marker the row already carries (`origin`,
  `last_write_kind`), because SQLite has no session variables and replication must pass it. And
  `xp_awards`' key treats a NULL `source_id` as equal. `invariants.md` is unchanged.
- **Gaps closed in [03](03-database-schema.md)**, each small, each found building: `users.deletion_requested_at`
  (the grace-period sweep had no column to read); treadmill `incline_bp`, not `incline_pct` (ADR-010);
  swim `pool_length_unit`, since a 25 yd pool stored as 22.86 m cannot say it was yards; `rounding` gains
  `up` (ADR-010 amendment); the catch-all `other` sport gets a track and the neutral hue; unique token
  hashes; a 24-byte nonce check; `level_scale_bp` capped at its default; a planned cardio session's type
  checked against its sport's profile; and the device omits all three auth tables and `users.password_hash`.
- **The schema check** (`apps/api/scripts/check_schema.py`, in CI after migrating and seeding): the 03 §11
  classification, sync columns (`created_at` alone is allowed anywhere — the token tables use it),
  RLS enabled, `FORCE`d and scoped in `USING` and `WITH CHECK` alike, an owner index, read-only reference
  tables, ADR-011's function allowlist, no `day_of_week`, `_pct` or non-integer `_bp`, INV-02 precision,
  and Postgres vs Drizzle names. **Every rule is seen failing** in tests; the ones task 002 names are also
  broken for real, in rolled-back DDL against the live schema.
- **The device schema is proven without a device.** pytest applies the committed Drizzle migrations to an
  in-memory SQLite and exercises the same triggers. A device run is still task 017's.
- **Seeds:** `uv run python -m seeds` (was `seeds.exercises`) — 201 exercises, 21 muscle groups, both
  unit systems' increments, all 11 sport profiles, 16 tracks and 16 achievements, idempotent (a second run
  writes nothing). The message catalogs now exist, nested JSON in `packages/shared/i18n/`, and the app's
  first-launch export is `packages/shared/seeds/reference.json`, which CI regenerates and diffs. **The
  Portuguese names are a draft**: the native-speaker review in the launch blockers covers them.
- **Found, and worked round:** drizzle-kit 0.31 splits an index expression on its commas, so
  `coalesce(source_id, '')` produced an invalid index; SQLite gets a second, partial unique index instead.
  The precision test needs `round_to_increment` before task 017 decides where it lives, so it uses a
  test-only oracle checked against the shared fixture — not domain code.
- **Also:** the models are checked against the migrated schema by a drift test; task 001's throwaway
  `launches` table is gone, and the diagnostics screen shows the migration count and the table count (36).

### 2026-09-12 — task 011 planning: the mark as 07 draws it, and a palette that passes its own rule

- **The mark is a drawn creature, as [07 §1](07-brand-and-ui.md) says:** a 19th-century engraved plate, not
  a geometric abstraction. Task 011 and this file had drifted to "a strict radial grid", "one slot-pupil
  eye" and "one symmetric mark" — the logo shape 07 bans. Both are corrected.
- **The project owner draws it, by hand, later.** Task 011 fills every slot the mark occupies with a
  plainly marked placeholder, never a stand-in octopus, which would become the mark by default. Its
  acceptance criteria are split in two: the system's, and the mark's, ticked once the drawing exists.
- **The reduction ladder is 07's, stated by rendered size** — dp on a device, px on the web. Task 011's
  version had no full drawing, and split 16–32 px from the favicon with no different form between them.
  One use moved: **the launcher icon is silhouette + eyes**, not the reduced drawing, because it is shown
  about 48 dp across, where engraved hatching is noise. The Play Store icon matches it, the splash takes
  the reduced drawing, and the notification icon and favicon take the glyph.
- **The palette failed INV-24 as written**, and 07 §3 is corrected — by computation, not by eye. Dark
  `text-muted` was 3.50:1 on `bg-elevated`, where the set row's previous-performance line sits; `danger`,
  `ride` and `row` could not be text on an active row; `border-strong` could not mark a control; and light
  mode lacked five tokens. Each failing colour moved in lightness only, hue and chroma kept (OKLCH), to
  clear its floor by 0.1; nothing that passed changed, and no seeded hue token was renamed. Two tokens
  are new, `text-on-accent` and `shadow-elevated`. The rule is now exact: every token against every
  background of its theme, `text-primary` the only colour for a live numeral, and a selected state always
  a fill, an edge and a label.
- **Still to settle before task 011's code:** where the theme override is stored; spacing, radii and the
  easing curve, which 07 does not yet give; the debug diagnostics screen under the literal-string rule;
  and ADR-014, because INV-23 and INV-24 have no *Enforced* line. All settled the next day — next entry.

### 2026-09-13 — task 011: the open questions settled, and the design system built

- **[ADR-014](decisions/ADR-014.md)** — the design system enforces itself. INV-23 and INV-24 gain *Enforced* lines. The
  token file is `apps/mobile/src/ui/tokens.ts`; lint fences `design-tokens` (literal colours, type sizes, durations)
  and `no-bounce` (every spring API, with no exception); INV-27's literal-string rule exempts
  `src/features/diagnostics/` by name, and nothing else. Exemptions are lint sub-scopes, and the fixture check proves
  each lifts only its own rule.
- **The mark is [task 018](tasks/018-brand-mark.md)**, drawn by the project owner, outside the build sequence and
  blocking only the store listing. Task 011 built its slots: SVG sources holding a crossed-box placeholder, a render
  step (`pnpm render:brand`) that CI re-runs and diffs, and a `Mark` component drawing the same sources.
- **07 gained the values it lacked:** spacing on a 4 dp base; radii 4, 8 and 12; sizes (48 and 56 dp targets, 24 dp
  icons, 1 and 2 dp edges); a face for each type style; and the house easing, `cubic-bezier(0.18, 0, 0.06, 1)` — a
  fit to a critically damped step response, within 2.6 % and without overshoot. Under reduce motion, 120 ms
  cross-fades and a static emphasis.
- **The theme override lives on the device**, in expo-sqlite's key-value store, never synced. Language and units come
  from the device (ADR-008's rule) until task 003 gives the account `users.locale` and `users.unit_system`.
- **Fonts:** Inter 4.1's static cuts — Regular, Medium, SemiBold and Display SemiBold — bundled by the `expo-font`
  plugin. The release publishes no checksum: the zip came from `rsms/inter`'s v4.1 GitHub release over HTTPS, with
  SHA-256 `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e`. Committed files: Inter-Regular
  `40d692fc…0c82`, Inter-Medium `97ad806f…a872`, Inter-SemiBold `78a843fa…cde3`, InterDisplay-SemiBold
  `0310d7a3…4e02`, LICENSE `262481e8…935a`.
- **Numbers are formatted by hand for the two locales, not through `Intl.NumberFormat`**, so a test under Node and
  the app under Hermes print the same characters. ICU plurals load the `@formatjs` polyfills Hermes needs, only where
  the engine lacks them — proven in Jest by deleting `Intl.PluralRules`; on a phone, in task 017.
- **The catalog check is a script, `pnpm check:catalogs`** — keys, each message's ICU arguments, and every key the app
  names literally. It is not a Jest test because the app's TypeScript config deliberately has no Node types.
- **The Portuguese interface strings are a draft**, like the exercise names, for the native-speaker review. The
  spoken unit names in English use US spelling; they are read aloud, never shown.
- **Found while building:** the React Compiler's lint rules reject reading a ref during render and setting state
  synchronously in an effect, so animated values live in state; and a literal-string rule that searched a whole prop
  expression flagged the catalog keys inside `t('…')` — it now looks only at strings shown as they stand.
- **pnpm added release-age exclusions on its own**, in `pnpm-workspace.yaml`: `intl-messageformat` 11.2.15 and six
  `@formatjs` packages it and the polyfills pull in were newer than pnpm's minimum release age when installed.
  Recorded, not yet decided — the alternative is pinning versions old enough to pass the check.
- **Components are tested in all eight combinations** of language, unit system and theme. The first matrix paired
  English with kilograms and Portuguese with pounds, which crossed both axes but never rendered the pairs users
  actually see — Portuguese with kilograms, English with pounds. Task 011's criterion was reworded to match.

### 2026-09-14 — task 003 planning: four mechanisms 04 left open, and two features nobody owned

- **[ADR-015](decisions/ADR-015.md)**, from planning the task against [04](04-security-and-auth.md). `invariants.md` is
  unchanged.
  - **Rate limits are counted in Postgres**, in `rate_limit_buckets`: fixed windows, one atomic upsert per hit, the IP
    and the email held only as an HMAC. No Redis — a second stateful service for a few counters. The table holds
    nobody's data, so it has no owner and no row-level security, and [ADR-011](decisions/ADR-011.md) gains a note
    saying so rather than an allowlist entry.
  - **Refresh rotation gets a 60-second grace window.** Strict reuse detection signed out anyone whose refresh response
    was lost — ordinary in a gym — and told them their token was stolen. A replaced token is accepted once more only
    while its successor is unused and under 60 s old; theft is still caught at the legitimate device's next refresh.
  - **The breach list is the NCSC's top 100 000**, cut to the 9 248 distinct entries of 10 or more characters and stored as
    SHA-1 digests. 04 §2's "k-anonymity offline set" named two different things. The NCSC's own URL now serves a
    "site currently unavailable" page, so the source is SecLists' mirror (MIT),
    `Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt`: 99 840 lines, SHA-256
    `c2e5696882c603b76bb67a47ee970897e5a76fc4c3f5547abe3d0ca340c576e0`.
  - **Registration discloses an existing account with `409`**, behind its rate limit: an enumeration-safe registration
    could not hand a new user a session at once, which the offline first set needs.
- **Task 003 corrected before building.** It had no password-change endpoint, though the privacy key's re-wrap needs
  one; now `POST /auth/password/change`, plus `POST /auth/email/verification` to send a link again. Routes sit under
  `/api/v1` as [02 §5](02-architecture.md) says. Verification links last 24 hours. The reuse notification, required by
  04 §3, joins the task's email list. **A password change leaves other devices signed in** — signing them out would
  strand an offline device's queued workouts.
- **The first owned routes arrive here:** a minimal `POST` and `GET /workouts/{id}`, so "404 for someone else's workout"
  and "an unverified user can log a workout" test a real route. Task 004 extends them.
- **Found: the data export and account deletion (FR-1.4) belong to no task.** Both are legal and store requirements.
  Added to the launch blockers as open question 11; task 003 builds only the verified-email gate, proven on a route its
  test mounts, and its criterion is reworded to say so.
- **The email provider is still open** (question 10). Task 003 sends through one interface — in memory in tests, a
  git-ignored folder locally — and a deployed API refuses to boot without a provider. Email messages take plain
  arguments only, because the API carries no ICU plural engine.
- **The login hash's cost is recorded once**, in `packages/shared/security/password-kdf.json`, so a test on each side
  holds the client's wrapping KDF at or above it (ADR-007).
- Fixed in passing: ADR-014 was missing from the decision-log table above.
- **Branching:** task 011's pull request is not merged yet, and task 003 builds on its design system and i18n, so
  `feat/task-003-authentication` starts from task 011's branch.

### 2026-09-14 — task 003 built: accounts, sessions and the privacy key, on both sides

- **API:** seventeen routes under `/api/v1` — the auth lifecycle, and a minimal workouts read and write. Every lookup
  before a user is known goes through ADR-011's existing functions; no new one was needed. argon2id runs off the event
  loop; migration `0003` adds `rate_limit_buckets`; a retention service purges revoked tokens and old windows, not yet
  scheduled. A deployed API refuses to boot until an email provider exists (open question 10).
- **Mobile:** `src/crypto` wraps, unwraps and re-wraps the privacy key on libsodium; `src/sync` keeps the refresh token
  in secure storage and the access token in memory, with single-flight refresh; `src/account` holds the flows and
  restores a session from the device with no network; `src/ui` gains a text field and a button; the account screens
  and their routes — the email links included — are in `src/features/account`. Language and units follow the account
  once someone signs in.
- **Proven locally:** 279 API tests, integration included, against the local Postgres — the constant-time login with
  the production hasher among them; the schema check (39 tables); mypy, ruff and the five import contracts; 427 Jest
  tests; ESLint and all 47 lint fixtures; both catalogs at 445 messages. **Task 003's criteria are ticked once CI
  passes on its pull request**, as for 002 and 011.
- **Found while building:**
  - FastAPI 0.141 keeps included routers lazily, so `app.routes` no longer lists their routes; the route-table test
    reads `iter_route_contexts`.
  - `react-native-libsodium` has one install script, which unpacks the prebuilt libsodium shipped in its own package
    and downloads nothing. Allowed in `pnpm-workspace.yaml`, with the reason beside it.
  - Jest maps the native binding onto `libsodium-wrappers-sumo`, so the privacy-key tests run the real algorithms — a
    64 MiB argon2id takes a second or two there.
  - The email-sending routes get their own limit, and task 017's re-wrap criterion says "password change"; both, with
    the reset-request timing and the 15-minute access token, are in task 003's *Settled while building*.
- **The Portuguese account screens and emails are a draft**, for the native-speaker review with the rest.

### 2026-09-14 — three decisions: Resend, two tasks for FR-1.4, an AI pre-check of the Portuguese

- **Email: Resend**, for its free tier. The prototype is to cost nothing at first. Resend is one adapter behind the
  sender interface, so Postmark or SES can replace it without touching a flow. A deployed API now boots only with
  `EMAIL_TRANSPORT=resend` and `RESEND_API_KEY`. Resend's shared test sender reaches only the account owner's own
  address, so a verified domain comes before real users ([05 §5](05-integrations.md)).
- **FR-1.4 is two tasks.** [Task 019](tasks/019-account-deletion.md), account deletion, needs only task 003 and goes next,
  with the web deletion page Google Play requires and the project's first scheduled job.
  [Task 020](tasks/020-data-export.md), data export, comes after 013 and 014, so it holds every kind of data. Each carries
  its open questions. v1 now has 18 tasks.
- **Portuguese: an AI pre-check**, run over both catalogs against 07 §9's glossary and Brazilian gym usage
  ([07 §9](07-brand-and-ui.md)). Fixed: *Rosca direta com halteres* (it is not alternated), *Rosca inclinada com
  halteres*, *Voador inverso* to match *Voador*, *Paralelas na máquina*, *Ponte glútea*, *Slam com medicine ball* (no
  longer confusable with *Arremesso*, the clean and jerk), nouns for the sled and bear-crawl names, *Válida* for a
  working set as the glossary says, "mês do calendário" in the two monthly achievements, and four account messages —
  one of them gendered, now neutral. Found and left open: the gamification track and the sport *hike* are both
  *Trilha*. **The native-speaker review stays a launch blocker**; the pre-check does not replace it.
- 07 §9's glossary gains *aparelho* (a device, never a gym machine), *entrar* and *sair*, *zona de privacidade* and
  *carga*.

### 2026-09-14 — task 003 closed, the documents brought up to date, and task 019 planned

- **Task 003 is complete.** CI was green on all four jobs of pull request #9, confirmed by the project owner, and the
  work is merged to `main` as `425a970`. All 19 criteria are ticked. One is proven partly by construction: a password
  shorter than ten characters is refused at change and reset by the one check registration uses, unit-tested for length,
  while the breach list is refused at each route in integration — accepted.
- **Found by the closing review, and recorded:**
  - **The per-IP rate limits count the socket's peer**, which behind a hosting platform's proxy is the proxy for
    everyone: registration would allow 5 an hour across all users. Open question 12, before the first deploy; 04 §5
    points to it.
  - **Only one lost refresh response is forgiven.** A second retry of the same token inside the window is reuse. Added
    to [ADR-015](decisions/ADR-015.md)'s accepted consequences; the rotation id under its *Revisit if* covers it.
  - **Revoking a session from a list older than that device's last refresh answers 404**, because the list names each
    device's newest token. Recorded in task 003.
- **Stale text corrected:** 00's status line still said nothing was implemented; [ADR-007](decisions/ADR-007.md) still
  sent the libsodium check and the key-derivation timing to task 003, both moved to task 017 on 2026-09-12; 02 §5's list
  of auth routes; and this file's Phase, Repository, Tasks and Next action rows.
- **Task 019 planned**, before any of it is built:
  - **Other devices stay signed in** when deletion is requested, so any of them can cancel — the task's first open
    question, closed by the project owner. 04 §2a says so.
  - **The web page's link opens a page; only its button schedules the deletion.** Mail providers and link scanners open
    links on their own.
  - **The link's token has its own table**, `account_deletion_tokens` (03 §1, §8, §11), **and its own allowlisted
    lookup**, `auth_redeem_deletion_token` — [ADR-011](decisions/ADR-011.md)'s seventh function, noted there. A purpose
    column on an existing token table was rejected: a reset or verification link could then be replayed at the deletion
    route.
  - **The in-app request counts against the login limit**, as a password change does; the web page's link shares the
    email-sending limit ([04 §5](04-security-and-auth.md)).
  - **"Account deleted" is sent after the deletion commits**, like every email since task 003. The task had said "before
    the row is gone", which could announce a deletion that then failed.
  - **Scheduled commands get a folder, `app/jobs/`**, standing where a router does (02 §5, the responsibility map). The
    web page is the one router outside `v1/`, in `app/api/web/`, and the only route besides `/health` outside `/api/v1`.
  - Still open in the task: what a device does with its local data once the account is gone, and which scheduler runs
    the daily command.
- No invariant changed and no ADR was added: 49 documents, 15 ADRs.

### 2026-09-14 — task 019 built: account deletion, in the app and on the web

- **Decided with the project owner before building:** the pull request holding the plan merged first; when a session
  ends on a device, the privacy key and the account's local row go with it, and what a device keeps of training data is
  task 006's to settle ([task 006](tasks/006-sync-layer.md) carries it); a pending deletion shows on the home route,
  with a "Delete account" link there until a settings screen exists; dates are written in numbers, in each language's
  order.
- **API:** `POST` and `DELETE /api/v1/auth/deletion`; the web page Google Play links to, at `/account-deletion`, whose
  emailed link opens a page and schedules nothing until its button is pressed; migration `0004` adds
  `account_deletion_tokens` and `auth_redeem_deletion_token`, ADR-011's seventh function; the sweep deletes each due
  account inside its own scope and emails only after the commit; and one daily command,
  `uv run python -m app.jobs.daily`, runs the sweep and the retention purges ([06 §5](06-operations.md)). Which scheduler
  runs it is chosen with the host.
- **Mobile:** the delete-account screen and its route; a pending deletion shown on the home route, with the way to keep
  the account.
- **Proven locally:** 332 API tests, integration included, against the local Postgres; the schema check (40 tables);
  mypy, ruff and the five import contracts, which now place `app.jobs` beside `app.api`; 437 Jest tests; ESLint and all
  47 lint fixtures; both catalogs at 474 messages. **Task 019's criteria are ticked once CI passes on its pull
  request.**
- **Found while building:**
  - **Postgres returns a timestamp in the connection's time zone**, so the API answered one instant in two spellings —
    `Z` and `-03:00` locally. Deletion timestamps are normalised to UTC; the session list's `last_active_at` is left for
    task 006, which reads timestamps from the database throughout.
  - **A deleted account's still-valid access token** got `404` from `/auth/me` and a misleading `409 id_unavailable` from
    `POST /workouts`. Both now answer `401`, so the device signs out.
  - **The email sender's selection moved into `app/core/email.py`**, so the daily command, which may not import a
    router, sends through the same transport.
  - A design-system sheet test failed once while pytest ran beside it, then passed alone and in the next full run: load,
    not this change.
- **The Portuguese emails, web page and delete screen are a draft**, for the native-speaker review with the rest.

### 2026-09-16 — administrator rights arrived; task 017's prerequisites installed

Task 017 is under way. **Not one of its acceptance criteria is ticked**: there is no local stack yet, nothing has run
on a phone, and the ADR-004 spike has not started — its two-day clock starts only once a development build runs on
the device.

- **The machine holds none of the local environment tasks 001–003 built.** `.env`, `apps/api/.venv`, and the portable
  PostgreSQL 16.15 of 2026-09-12 with its data directory are all absent; Node was 18.4.0, off the pinned 24.21.0, and
  pnpm was not installed at all. The repository and its history are intact, so nothing is lost — but task 017's
  § 1 is a **first setup, not a verification**, and `.env` has been regenerated from `.env.example` with fresh
  secrets. The README's portable-Postgres section describes a stand-in that is no longer on this machine; it is
  revisited once Docker runs.
- **Already in place, and not reinstalled:** Windows long paths (`LongPathsEnabled=1`, task 017's step 1) and Visual
  Studio Build Tools 2026 with the C++ workload (step 5).
- **Installed:** Android Studio 2026.1.4.7 · Android SDK command-line tools 16111833, platform-tools 37.0.1,
  `platforms;android-36`, `build-tools;36.0.0` · Rust 1.98.0 with `aarch64-linux-android`,
  `armv7-linux-androideabi`, `x86_64-linux-android` and `cargo-ndk` 4.1.2 · Node 24.21.0 through nvm, pnpm 12.4.1
  through corepack, and the workspace's 1081 packages · EAS CLI 24.6.0 · Python 3.12 through uv.
- **WSL2 needs no BIOS change.** Ubuntu was already registered as a version 2 distribution but the optional Windows
  components were off, and `HyperVisorPresent` was already true — so firmware virtualization is enabled.
  `VirtualMachinePlatform` and `Microsoft-Windows-Subsystem-Linux` are now enabled and **the machine is waiting on a
  restart**. Until it restarts, WSL2 cannot start and Docker Desktop's installer fails with `-5`.
- **Docker Desktop is installed rather than dropped**, decided with the project owner. Task 017's
  `docker compose up -d` criterion stands and local development keeps parity with CI; the portable PostgreSQL stays
  documented as the fallback for a machine without administrator rights.
- **`sdkmanager` is deprecated.** In command-line tools 16111833 it warns and delegates to a new `android` CLI;
  packages install with `android sdk install <package>`. The exact Android setup goes into `README.md` once a build
  has actually run, as task 017 requires.
- **The NDK is deliberately not installed yet.** Nothing in the repository pins one — there is no
  `expo-build-properties` — so the version is Expo SDK 57 / React Native 0.86.3's default, and Gradle names it on the
  first Android build. Installing a guess is several gigabytes of the wrong thing.
- **Two harmless oddities, recorded so they are not re-diagnosed:** `android sdk install platform-tools` exits
  `0xC0000409` after unpacking correctly — adb runs and the package is sound; and `Invoke-WebRequest` on Windows
  PowerShell 5.1 downloaded the 148 MB command-line tools at roughly 5 MB/min, where `curl.exe` took under a minute.
- No invariant changed and no ADR was added: 49 documents, 15 ADRs.

### 2026-09-16 — the local stack runs, and a test gate that was never trustworthy

The restart landed and **task 017's first two acceptance criteria are ticked**: the stack comes up on Docker, and the
API suite runs locally with nothing skipped. Everything still open in that task needs the phone.

- **The `-5` was misdiagnosed, and the entry above is corrected in the task file.** It was recorded as Docker's
  installer failing "until the restart". After the restart, with WSL2 working, it still returned `-5`. The elevated
  log names the real cause: `C:\ProgramData\DockerDesktop` must be owned by an elevated account. An earlier Docker
  Desktop 4.76.0 had been removed incompletely, leaving that directory owned by the ordinary account, an orphaned
  `com.docker.service` pointing at a `C:\Program Files\Docker` that no longer existed, and no uninstall entry.
  Deleting the directory was the whole fix. **Worth keeping because the wrong cause was the plausible one** — a
  pending restart explained the symptom perfectly and would have sent the next person after WSL2.
- **The stack, first run on Windows:** `docker compose up -d`; the init hook creating `cyberathlete_app` with no
  `BYPASSRLS` and `cyberathlete_migrator` with it, exactly as [ADR-011](decisions/ADR-011.md) requires; migrations
  `0001–0003`; 622 seeded rows; the schema check at 39 tables; `/health/ready` **200** after the boot-time role
  assertion; **285 API tests passed, none skipped**; `ruff`, `mypy` and all five import contracts; every mobile static
  check, including the 47 lint fixtures and both catalogs at 445 messages. The API count is **285**, not the 279
  recorded when task 003 was built.
- **The Jest suite was flaky, and only CI's speed hid it.** `pnpm test` failed 1 to 3 tests of 427 depending on
  machine load — always `MATRIX[0]`, always `Exceeded timeout of 5000 ms`, **never an assertion**. Jest's default
  timeout had never been overridden, and the first test of each matrix suite pays the providers, i18next, the
  `@formatjs` polyfills and a cold transform; warm, the same 427 ran in 8 seconds. **CI was green because its runners
  are faster, not because the suite was sound**, so this is a gate that could not be trusted rather than a Windows
  quirk. Fixed with `testTimeout: 15000` in `apps/mobile/jest.config.js` — no test logic touched — and proven by two
  cold-cache runs at 427 of 427.
- **Found, not yet fixed:** `.env.example` never gained task 003's `EMAIL_TRANSPORT`, `EMAIL_FOLDER` and
  `APP_LINK_BASE`, so a setup following the README gets no email settings. It is corrected with the README's
  remaining commands, once the phone settles § 2.
- **Also:** nvm held the pinned Node 24.21.0 but 24.20.0 was active, below the repository's own `engines` gate; and
  the README's portable-PostgreSQL section is now marked as the no-administrator-rights fallback rather than the
  current stand-in, since Docker replaces it.
- No invariant changed and no ADR was added: 49 documents, 15 ADRs.

### 2026-09-16 — the app runs on a phone; the native build moves to WSL2; five criteria move to 004 and 007

The first time this project has run on hardware. A Galaxy S21 FE, Android 16, API 36 — **ten of task 017's
criteria are now ticked**. Three of task 001's device items are still open here: the non-debug build's `http://`
refusal, the diagnostics-free release bundle, and the EAS build.

- **The native Android build does not work on native Windows, and that is not a failure.**
  `react-native-libsodium`'s `android/build.gradle` computes `NODE_MODULES_DIR` with `Path.toString()`, which on
  Windows yields backslashes, and hands it to a *quoted* CMake string at its `CMakeLists.txt:34`. CMake then rejects
  `\h` as an invalid character escape. **No path avoids this** — every Windows absolute path is full of backslashes,
  and nearly any letter after one is an invalid escape — so it is an upstream bug, not a path-length or pnpm
  problem. `react-native-screens` and `react-native-worklets` failed the same step with their real error swallowed
  behind a JDK 25 "restricted method" warning.
  - **Resolved in WSL2**, as [ADR-004](decisions/ADR-004.md) and this file already permit: *a native-Windows build
    that fights back while WSL2, CI and EAS work is not a failure.* All three modules build on Linux.
  - **The shape of local development on Windows, decided here:** a **second, build-only checkout inside WSL2**
    produces the APK, which is installed from Windows with `adb install`; Metro runs on Windows over `adb reverse`,
    so day-to-day JS work stays where it was. One `node_modules` cannot serve both systems, which is why the
    checkout is separate rather than `/mnt/c`. A native rebuild is needed only when native dependencies change.
  - WSL2 runs JDK 17, **matching CI**, rather than Android Studio's bundled JDK 25.
  - **The NDK version is settled: `27.1.12297006`**, named and installed by Gradle on the first build, exactly as
    task 017 planned by refusing to guess. It is what `cargo-ndk` will need for the spike.
- **Five task-011 device criteria moved** — four to [task 004](tasks/004-exercise-catalog-and-logging.md), one to
  [task 007](tasks/007-cardio-recording.md). Each named UI that does not exist: `SetRow` and `NumericKeypad` are
  built and unit-tested but **no route renders either**, and the live pace readout is task 007's. Since task 017
  must finish *before* task 004, and a task is ticked only when every criterion is, **task 017 as written could
  never have closed**. The set-row criterion merged into one task 004 already had, which gains "in pounds" and
  "every control usable".
- **`pnpm start` is broken on Windows**, silently. `expo start --dev-client --localhost` binds Metro to `::1` only,
  because Node 17+ resolves `localhost` to IPv6 first, while `adb reverse` forwards to IPv4 — so the bundle request
  never arrives and the app sits on its splash screen with no error on either side.
  `NODE_OPTIONS=--dns-result-order=ipv4first` fixes it. **Not yet applied** to the script or the README.
- **Proven on the device:** the API over `adb reverse`; an `http://` LAN address refused *twice over*, by the app's
  guard and by Android's network-security policy; 36 of 36 SQLite tables; migration idempotence; secure storage
  across a restart; hot reload; the theme override persisting; libsodium; and **offline sign-in with airplane mode
  and the port forward both removed** — signed in, no spinner, the API surfacing as a typed `ApiUnreachableError`.
  Registration including the 64 MiB argon2id wrap took **2.6 s** with no frozen screen. The verification email came
  out in Portuguese from the device locale.
- **Found on the device, not yet fixed:** screen titles are drawn behind the status bar, so `Entrar` overlaps the
  clock — a safe-area inset bug Jest cannot see; `EMAIL_FOLDER=apps/api/.mail` is relative while the API runs *from*
  `apps/api`, so mail landed in `apps/api/apps/api/.mail/`; and `apps/mobile/.gitignore`, generated by
  `expo prebuild`, is neither committed nor ignored.
- No invariant changed and no ADR was added: 49 documents, 15 ADRs.

### 2026-09-16 — the ADR-004 spike begins: `core-rs` built, its PyO3 half proven; UniFFI blocked on native Windows

Later the same day as the device run above, on `feat/task-017-core-spike`. **The clock had already started** — the
task file's note claiming otherwise was wrong and is corrected there. Nothing here is committed yet.

- **`core-rs/` now exists**, exactly as [02 §2](02-architecture.md) lays it out: a workspace crate `cyberathlete-core`
  holding `progression::rounding`, with `bindings/pyo3` and `bindings/uniffi` as members. `#![forbid(unsafe_code)]`
  on the core only — both binding crates carry generated `unsafe extern "C"` glue by design, and ADR-004's ban
  belongs on the logic, not the plumbing.
- **`round_to_increment()` is built**, exactly the dozen-line function task 017 asks for: `RoundingMode` is
  `Nearest | Down | Up`, a tie goes to the lighter load (ADR-010 § Amendment), and the function is **total** — an
  unusable increment (zero, negative, non-finite) or a non-finite weight leaves the load unchanged rather than
  panicking, because a panic crossing two FFI boundaries is far more expensive than a defined answer. Five unit
  tests pass, including the spike's own two named cases (`41.6 → 42.5`, `41.25 → 40.0`) and an idempotence check
  (INV-10 in miniature: re-anchoring an anchored load must land in the same place).
- **The shared fixture passes from Rust**: `tests/shared_fixtures.rs` reads
  `packages/shared/fixtures/round_to_increment.json` directly and checks all nine cases — the same file the Python
  and TypeScript suites read, so this is now a fourth language agreeing with it, not three.
- **INV-10's two gates, both written**: `clippy.toml` bans `SystemTime::now`, `Instant::now`, both types' `elapsed`,
  and (new, beyond what the invariant's text names) `HashMap`/`HashSet`, whose iteration order is process-seeded and
  would make two runs of the same function disagree — exactly the failure INV-10 exists to rule out. `cargo deny` is
  now installed but its ban list (`deny.toml`, banning `rand` and other I/O/clock/RNG crates) is **not yet written**.
- **`cargo clippy --workspace --all-targets -- -D warnings` is clean**, after two Windows-only fixes neither of
  which touched behaviour: PyO3 0.29 deprecates deriving `FromPyObject` implicitly for a `Clone` pyclass, so
  `RoundingMode` now opts in with `from_py_object` explicitly; and MSVC's linker prints its own success message to
  stdout, which rustc surfaces as a warning and `-D warnings` then fails on — CI links with GNU ld and never emits
  it, so `linker_messages = "allow"` is scoped to the two binding crates with a comment saying why.
- **The PyO3 half is proven end to end — the FastAPI side of "chain works" ([ADR-004](decisions/ADR-004.md) §
  Decision procedure).**
  - `bindings/pyo3` exposes `RoundingMode`, `round_to_increment` and `core_version` through a `_core` extension
    module, built against Python's stable ABI (`abi3-py312`) so one wheel serves 3.12 and later.
  - `apps/api/pyproject.toml` now depends on it through a `uv` path source into `core-rs/bindings/pyo3`; `uv sync`
    compiled and installed it clean. **A Rust toolchain is now part of setting the API up**, here and in CI — the
    cost ADR-004 already named.
  - `app/domain/rounding.py` re-exports the core; nothing else may import `cyberathlete_core` directly — a new
    import-linter contract, `core-binding-fenced`, mirrors ADR-012 §2's client-side rule on the server, with a
    known-bad fixture in every other package and the one legal import proven *not* caught.
  - **Task 002's placeholder oracle is retired.** `tests/integration/test_reference_data.py` carried a hand-written
    `round_to_increment` marked "a test oracle for ADR-010's rounding, not domain code: the real one arrives in
    task 017" — INV-02's 52-cycle precision property now runs against the function that actually ships, not a
    stand-in.
  - New `tests/unit/test_domain_rounding.py` runs the spike's two named values, the full shared fixture, idempotence,
    and asserts an unknown mode name raises rather than silently falling back to `nearest`.
  - **Verified:** `ruff check` clean, `ruff format --check` clean (106 files), `mypy --strict` clean (103 files, up
    from 101 — the two new files), `lint-imports` **6 contracts kept, 0 broken** (was 5), and the affected suites
    **11 passed**.
- **The UniFFI half is not proven, and here is exactly where it stopped:** `bindings/uniffi` compiles cleanly on
  native Windows (`cargo build --workspace` succeeds for both binding crates), so the Rust side is not the problem.
  `uniffi-bindgen-react-native` — pinned to `0.31.0-5` to match the `uniffi` crate's `0.31`, since the two version
  numbers must track each other — **fails to build itself on native Windows**: `pnpm dlx` compiles it from source,
  and MSVC's `link.exe` returns `LNK1104` ("cannot open the output file") linking its own build-script binaries for
  `quote`, `proc-macro2`, `serde` and `serde_core`. A different symptom from the `react-native-libsodium` CMake
  backslash bug found earlier the same day, but the same class of problem, and covered by the same standing
  allowance: *a native-Windows build that fights back while WSL2, CI and EAS work is not a failure.*
  - **Moving to WSL2, matching the pattern already set for the Android build.** The build-only checkout at
    `/root/projeto_cyber` (on `main`, from earlier today's device work) has Node, pnpm and Java, and the NDK at
    `/opt/android-sdk/ndk` — but **no Rust toolchain**: `which cargo rustc` found neither. Unlike the Android build,
    which only needed JDK and the NDK inside WSL2, the spike's UniFFI half needs `rustup`, the Android targets and
    `cargo-ndk` installed there too, before `uniffi-bindgen-react-native` or the cross-compilation can run.
- **What is still open, precisely:** `deny.toml`'s ban list; the Rust CI job (`cargo deny`, clippy, fmt, Android
  cross-compilation); a Rust toolchain inside WSL2; `uniffi-bindgen-react-native` actually generating the TypeScript
  bindings; `cargo-ndk` cross-compilation for the three Android targets; the call from the Expo app on the physical
  device; and **the ADR-004 outcome itself**, which stays unrecorded while any of that is open. None of task 017's
  acceptance criteria under "The decision" are ticked yet — the named-values criterion asks for *both* Python and
  the device, and only Python is proven.
- No invariant changed and no ADR was added: 49 documents, 15 ADRs. `core-rs/` is untracked; nothing from today is
  committed.

  **Superseded within the same day** — see the two entries below: this work was committed and pushed as `0a2071d`
  on `feat/task-017-core-spike`, and the UniFFI half went on to be proven for real, on the device.

### 2026-09-16 — committed and pushed: `core-rs`, the PyO3 half, and the corrected doc claims

`0a2071d` on `feat/task-017-core-spike`, pushed to `origin`. Nothing beyond what the two entries above describe —
`core-rs/`, the PyO3 binding wired into the API, the new `core-binding-fenced` import-linter contract and its
fixtures, and the header/count corrections to this file and the task file. No pull request opened: the spike was
still incomplete (UniFFI unproven, no ADR-004 outcome), so this was recorded as work in progress, not a
finished slice. `apps/api/apps/` (the `EMAIL_FOLDER` bug's stray output) and `apps/mobile/.gitignore` (still the
open decision from 2026-09-16's device-run entry) were deliberately left out of the commit.

### 2026-09-16 — the UniFFI half is proven: a device call, on hardware, later the same day

Continued on `feat/task-017-core-spike`, not yet committed. Full account in
[task 017](tasks/017-local-toolchain-device-spike.md) under the same heading; this is the short version.

- **A Rust toolchain now exists in the WSL2 checkout** — `rustup` 1.98.0 matching Windows exactly, the three
  Android targets, `cargo-ndk` 4.1.2 — and `cargo ndk build` cross-compiled the UniFFI binding for all three
  targets in about 12 seconds. `uniffi-bindgen-react-native` built and ran cleanly there too, confirming the
  earlier native-Windows `LNK1104` was exactly what it looked like: a Windows-only linker problem, not a Rust
  or a UniFFI problem.
- **`packages/core-native/` now exists** — a new pnpm workspace package built from `core-rs/bindings/uniffi/`,
  exactly as [ADR-012 §2](decisions/ADR-012.md) describes. `apps/mobile/src/domain/index.ts` is the thin
  wrapper ADR-004 always intended, exporting `roundLoadToIncrement()`; the `core-binding` ESLint fence that
  ADR-012's planning had already written — pointed at a placeholder package name nothing had ever built — is
  corrected to the package that now exists.
- **Found and fixed: a copied config flag exactly inverted the intent.** `codegenConfig.includesGeneratedCode:
  true`, copied from a reference scaffold without reading what it does, told React Native's Gradle plugin this
  package already ships its generated code — skip regenerating it. For a package with no committed spec
  classes, that is backwards, and it silently skipped Codegen outright. The first build failed on
  `Unresolved reference 'NativeCoreNativeSpec'`; found by reading `@react-native/gradle-plugin`'s own Kotlin
  source after two wrong guesses (an unread `outputDir` config key; a missing `"react-native"` field) cost more
  time than just reading the plugin would have. Removing the flag was the whole fix.
- **`./gradlew assembleDebug` succeeded** — 19m 48s, 571 tasks, a from-scratch native build across three ABIs
  for every module in the app. `libcyberathlete_core_ffi.so` is in the built APK for `arm64-v8a`,
  `armeabi-v7a` and `x86_64`.
- **Installed on the Galaxy S21 FE, launched, and it ran** — no crash on either of the two points where a
  broken binding would have taken the app down immediately (`System.loadLibrary`, `installRustCrate()`).
  Metro, on Windows over `adb reverse`, bundled 1867 modules in 47.9 s.
- **The diagnostics screen — home in a dev build — shows, live, on the device:**
  `round_to_increment(41.6, 2.5, nearest) = 42.5` and `round_to_increment(41.25, 2.5, nearest) = 40`. The
  spike's own two named values, computed by the Rust core, crossing UniFFI, JSI and the C++ turbo-module
  bridge, on physical hardware. Screenshotted.
- **Found and fixed in passing:** the `pnpm start` IPv6 bug recorded earlier today as "not yet applied" —
  `cross-env NODE_OPTIONS=--dns-result-order=ipv4first` on the `start` script, confirmed on this same device
  session: Metro bound `127.0.0.1:8081`, and the app reached it over `adb reverse` on the first try.
- **Both acceptance-criterion values are now proven from Python *and* the device — that criterion is ticked.**
  The `rand`-dependency gate is proven too, but only locally: `rand` was added to `cyberathlete-core`,
  `cargo deny check bans` failed on it and the transitive `rand_core`, then passed clean again once removed —
  the exact mechanism the Rust CI job now runs, but that job has not executed even once, since nothing has
  been pushed since it was written. That criterion, and the ADR-004 outcome itself, stay unticked for that
  reason alone: **the toolchain risk the spike exists to answer is, as far as a physical phone can show it,
  answered.** What is left — a real CI run, an EAS build, an Expo account that does not exist yet — is process,
  not risk.
- No invariant changed and no ADR was added: 49 documents, 15 ADRs. Not yet committed.

### 2026-09-18 — merged, and the Rust CI job's first two real runs both did exactly what they should

Committed as `2d14194`, merged as [PR #12](https://github.com/hiuriselzler/projeto_cyber/pull/12), merge commit
`e5148f2`. Full account in [task 017](tasks/017-local-toolchain-device-spike.md), same date.

- **CI ran on the Rust job for the first time and passed clean** — all five jobs, `core-rs` included:
  `cargo fmt`, `cargo clippy -D warnings`, `cargo deny check`, `cargo test --workspace`, and `cargo-ndk`
  cross-compilation for all three Android targets, on GitHub's own Linux runners. Only pushing a branch
  with an open pull request triggers `.github/workflows/ci.yml` — a bare push does not — which is the
  entire reason the PR existed before the spike itself was finished.
- **A green run does not prove a gate catches anything**, and task 017's own README says so in as many
  words: *"a mistyped glob disables a rule while CI stays green."* So, matching
  [task 001](tasks/001-project-bootstrap.md)'s own proof method — a throwaway branch, a deliberate
  violation, watch the real CI fail, delete the branch — `rand` was added to `cyberathlete-core` on
  `proof/rand-ban-in-ci`, opened as [PR #13](https://github.com/hiuriselzler/projeto_cyber/pull/13)
  (draft, never meant to merge) to trigger a run. **The `core-rs` job failed, precisely and only on
  `EmbarkStudios/cargo-deny-action@v2`** — every other job and every other step of that job stayed green.
  The PR was closed and the branch deleted the moment the failure was confirmed. `SystemTime::now` got
  the same treatment locally with `cargo clippy` — caught with the exact message `clippy.toml` names,
  removed, clippy clean again — not re-run through CI, since clippy is a deterministic static check with
  no plausible local/CI gap, unlike `cargo deny`'s crate-graph resolution.
- **ADR-004's bar now stands at three of four.** PyO3 from FastAPI, UniFFI from the physical device, and
  the Android artefacts built by CI on Linux are all proven — the last one twice over. **Only the EAS
  build is outstanding.** The toolchain risk the spike exists to retire is retired; what is left is an
  account and a build, not an engineering question.
- No invariant changed and no ADR was added: 49 documents, 15 ADRs.

### 2026-09-18 — task 019 closed: PR #11 merged, CI green

`feat/task-019-account-deletion` had been built and reviewed before task 017's core-rs work landed on `main`
([PR #12](https://github.com/hiuriselzler/projeto_cyber/pull/12)), so it needed a rebase rather than a plain merge.

- **Rebased onto `main`** at `e5148f2`. The only conflict was in this file's own prose — both branches had narrated
  the project's status at the same lines — resolved by keeping both threads rather than picking one: task 019's real
  outcome, and task 017's real progress as `main` already had it.
- **Verified before pushing**, matching what CI runs: API — `ruff`, `mypy --strict`, `ruff format --check`, all five
  import contracts, 337 tests (146 unit, the rest integration) against a real local Postgres, the schema check at 40
  tables; mobile — `tsc`, `eslint`, all 47 lint fixtures, the platform-file check, both catalogs at 474 messages,
  `db:generate` against the committed migrations (36 tables, no drift), `render:brand` byte-identical to the
  committed assets, and 437 of 437 Jest tests (one `surfaces.test.tsx` timeout reproduced under load and confirmed a
  flake — passes clean alone — exactly as the branch's own build notes had already found); shared — the OpenAPI
  schema and generated TypeScript types regenerate identical to what is committed.
- **Pushed with `--force-with-lease`** (the rebase rewrote history) as [PR #11](https://github.com/hiuriselzler/projeto_cyber/pull/11), merged the same day with all five CI jobs green: Shared types are current, `core-rs`, Release build permits no
  cleartext, API, Mobile.
- **Task 019's criteria are now ticked**, per its own task file's rule. Its two open notes stay open, neither
  blocking: what a device keeps of training data once its account is gone, moved to [task 006](tasks/006-sync-layer.md); which scheduler runs the daily command, chosen with the host.
- No invariant changed and no ADR was added: 49 documents, 15 ADRs.

### 2026-09-19 — task 004 planning: three stale docs, two decisions, and the order the work goes in

Reading the mandatory context before touching code found **three documents that ADR-004's outcome had
left behind**. All three said the spike was still pending, five days after it closed.

- **[02 §3](02-architecture.md) still offered the fallback as live** — "written twice, Python and
  TypeScript, policed by fixtures" — as though the choice were open. Rewritten to record option B as
  settled, with the fallback kept as rejected-and-explained rather than deleted: it is still why the
  fixtures exist. Under the Rust core they prove **the two bindings agree**; they are no longer the
  only thing standing between two copies.
- **[Task 004](tasks/004-exercise-catalog-and-logging.md) named the wrong file for e1RM** —
  `src/domain/e1rm.ts`, which is exactly the TypeScript implementation ADR-004 § Outcome exists to
  prevent, and which the responsibility map forbids (`src/domain/` is marshalling and *no domain logic
  at all*). Corrected to `core-rs/src/strength/`, reached through both bindings. `is_counted_set()`
  said only "in domain" and now names the same crate.
- **[00 § Chosen stack](00-project-context.md) still called the core "accepted conditionally"** and
  described the spike in the future tense. Rewritten to record the outcome, and to name the four
  pre-launch conditions that genuinely *are* still outstanding — which is the part of "conditional"
  that survived.
- The task file was the stale one against the ADR, not the reverse: ADR-004 § Outcome names e1RM and
  `is_counted_set()` as **the core's first real residents**, and that sentence postdates the task file.

**Open question 9 is closed: `5+` opens a second row, `5 6 7 8 9 10`.** The chip stores nothing by
itself; what is stored is whichever chip the user then taps. The alternatives were storing a flat 5,
which silently discards a distinction the schema carries, and a keyboard, which FR-2.10 forbids
outright. A second row keeps the common case at one tap, keeps INV-03's full `0..10` reachable in two,
and — the reason it wins — **writes no number the user did not choose**, which is the same rule that
makes a blank chip store NULL rather than 0. [Task 011](tasks/011-design-system.md)'s `RirChips` carried
the question as a prop comment; it is now answerable.

**Fork-on-edit naming, decided rather than discovered later.** [ADR-008](decisions/ADR-008.md) says a
forked global's translated name is copied into the fork, which leaves two things open that a unique
index will otherwise settle by crashing:

- **Which translation:** the UI language at the moment of forking — what the user was looking at when
  they chose to edit. After that it is user content, shown exactly as stored and never re-translated
  (INV-27).
- **A second fork of the same global** reuses the first rather than creating another; `forked_from_id`
  already makes that lookup free.
- **A collision** with one of the user's own live exercises — `exercises_owner_name_key`, unique on
  `lower(name)` where not archived — is a validation error on the field they are already editing. Not
  an auto-suffix: `(2)` is a name nobody typed, and INV-27's promise is that user content reads back
  exactly as written.

**Three findings about what the task actually has to build**, none of them obvious from the task file:

- **The device has no `personal_records` table and must not gain one.** [03 §4](03-database-schema.md)
  is explicit — it is a derived cache, the device does not have it, and recomputes locally. So client
  PR detection is a core function over local `set_logs`; only the server keeps the cache and its
  rebuild command. Adding the table locally would break the schema parity `check_schema.py` enforces.
- **First-launch seeding does not exist yet.** `packages/shared/seeds/reference.json` is generated and
  committed (201 exercises, matching both catalogs), but nothing on the device reads it — `src/db/`
  has migrations and no seed. That is task 004's first criterion and it starts from zero.
- **Neither `expo-haptics` nor `expo-notifications` is a dependency.** The rest timer needs both, and
  Android notification channels put them in `src/platform/` and nowhere else (INV-28).

**The order the work goes in**, recorded because the task is XL and the sequence is a decision:
docs (this entry), then the Rust core and its fixtures, then local data, **then the set row on a real
phone with its ✓ latency measured** — before the catalog, the routines, the finish flow, the charts,
the mirror API and the device pass. The task file's own note is the reason: *if it is not faster than
Hevy there is no reason for this app to exist*, and that is cheapest to find out fourth rather than
last. Charts come last deliberately.

**One risk named now rather than met later:** INV-09 requires a synchronous SQLite write before the UI
updates, and NFR-2 gives the ✓ under 100 ms, with an FFI hop for e1RM on top. If the budget cannot be
met, that tension is an ADR, not a quiet compromise — which is why the set-row stage measures it on the
Galaxy S21 FE rather than assuming.

- A fifth correction, found while checking the others: **[tasks/README](tasks/README.md) still had 017
  "in progress since 2026-09-16"** and task 004 unstarted. Both rows and the ordering rule beneath them
  now match what happened.
- No invariant changed and no ADR was added: 49 documents, 15 ADRs. Five documents corrected
  ([00](00-project-context.md), [02](02-architecture.md),
  [task 004](tasks/004-exercise-catalog-and-logging.md), [tasks/README](tasks/README.md), this file),
  two decisions recorded, one open question closed — **8 remain, none blocking**.

### 2026-09-19 — task 004 stage 1: the core's first real residents, through both bindings

`core-rs/src/strength/` exists. **e1RM (INV-07), `is_counted_set()` (INV-04), tonnage and PR
detection (FR-2.15) are written once, in Rust**, and reached from Python and TypeScript through the
two bindings — ADR-004 option B doing the job it was accepted for, on the first task that needed it.

- **The named acceptance case passes in Rust and in Python**: body weight 80 kg + 20 kg × 5 @ RIR 2
  is 100 kg × (1 + 7/30) = **123.3 kg** displayed; a later weigh-in leaves it untouched (body weight
  is resolved per set, on or before its own date — INV-17); and with no body weight logged by that
  date it is NULL, the same no-guessing rule as a missing RIR.
- **Three new shared fixtures** — `e1rm.json`, `is_counted_set.json`, `pr_detection.json` — read by
  all three suites. **No expectation is a computed float**: e1RM's cases state a load and an
  effective rep count so each runtime applies Epley itself, because `100 × 37/30` has no exact
  decimal form and writing one would test this file's rounding rather than the code's.
- **The fixture was watched failing**, the way task 017 watched `cargo deny` bite: the Epley divisor
  changed 30 → 29, `every_e1rm_case_agrees` failed on the first case, divisor restored.
- **The UniFFI bindings were regenerated in WSL2**, all three ABIs plus the TypeScript from one
  `ubrn build android --and-generate`, so the generated surface and the shipped `.so` cannot drift.
  NDK 27.1.12297006. Native Windows remains unable to build the tool, exactly as ADR-004 allows.

**Two decisions the code forced, both small and both recorded rather than left implicit.**

- **A blank added load on a bodyweight exercise is zero, not missing.** An unweighted pull-up is the
  common case and leaving the weight field alone is how it gets logged; the lifter moved their body
  weight whatever the field says. Nothing is invented, so INV-07's no-guessing rule is not bent — it
  still refuses to invent a *body weight*. On an ordinary exercise a blank weight stays "not
  recorded".
- **`is_counted_set()` asks two questions, not one.** INV-04's own rule is the set *type*; the second
  is completion, because a `set_logs` row exists from the moment a set is pre-filled from a routine.
  Counting an untouched row would inflate every total on the screen the user is reading mid-workout.
  The type-only half is exported separately as `is_counted_type()` for a UI drawing a badge.

**A limit worth stating before it is mistaken for a pass.** Task 004's criterion *"the e1RM fixture
produces identical results in Python and TypeScript"* is **not** provable in Jest: the core reaches
the app as a JSI turbo-module, which does not load under Node — the same reason task 011's rounding
fixture test checks shape rather than calling the function. Jest holds the three files to their own
spec (49 cases); Rust and Python run them; **the client half is settled on the device**, as task 017
settled the spike's two values on the Galaxy S21 FE. It is listed with the device criteria, not
ticked by a green Jest run.

**Verified, matching what CI runs**: `core-rs` — fmt, clippy `-D warnings` over the workspace, 41
unit + 5 fixture tests, `cargo deny` clean on advisories, bans, licenses and sources. API — `ruff`,
`ruff format`, `mypy --strict` over 107 files, all **six** import contracts kept (including "only the
domain reaches the core", which the new `app/domain/strength.py` passes through), **156** unit tests,
up from 146. Mobile — `tsc`, `eslint`, 47 lint fixtures, the platform-file check, both catalogs at
474 messages, and **489** Jest tests, up from 437.

- **Also found, not fixed, not mine to fix here:** `packages/core-native` has a `typecheck` script
  and no `tsconfig.json`, so it has never run. CI does not invoke it, and the generated bindings are
  type-checked through the app's own `tsc`. Noted for whoever touches that package next.
- No invariant changed and no ADR was added.

### 2026-09-19 — task 004 stage 2: the catalog seeds itself, and a defect task 002 could not have seen

The device gets its catalog before it has ever synced ([ADR-001](decisions/ADR-001.md)): 201 exercises,
21 muscle groups, the increments, tracks, sport profiles and achievements, out of the committed
`reference.json` and into SQLite on first launch. Reference rows carry **a key and no translated
text** (INV-27), so one seed serves both languages.

**A defect found while writing it, and it is task 002's, not this task's.** SQLite has foreign keys
**off by default** — every connection must ask — and nothing ever asked. The device schema declares
**58 `FOREIGN KEY` clauses** that Postgres enforces and the phone was silently ignoring, against a
schema whose own ADR is titled *the schema enforces itself* ([ADR-013](decisions/ADR-013.md)). Fixed
in `src/db/client.ts` with `PRAGMA foreign_keys = ON`, which must run on the open connection and
outside a transaction — inside one it is a no-op, which is the usual way this is got wrong. **Nothing
proved it before and nothing proves it now except a device**, so it joins the stage-8 checks rather
than being called done.

**Three decisions the seed forced.**

- **Seeded globals carry a fixed timestamp, not `Date.now()`.** Two devices seeding the same bundled
  file must produce identical rows; a wall-clock reading would make them differ by install date, and
  sync would then have to hold an opinion about data that is byte-identical on both. The server
  stamps its own copies with `now()`, so the two sides will not agree on those columns — noted for
  [task 006](tasks/006-sync-layer.md) rather than guessed at here.
- **Rows are upserted, and `deleted_at` is never in the update.** An app update shipping a corrected
  exercise must reach an install that has the old one; a global the user archived stays archived,
  because re-seeding is not a reason to hand somebody back an exercise they put away (INV-11).
- **Seeding is keyed on a SHA-256 of the file**, held in `sync_state` in the same transaction as the
  rows. So it runs on first launch and after an app update that ships a new catalog, and never
  otherwise — and a half-finished seed leaves a database that seeds again rather than one holding
  half a catalog and claiming to hold all of it. Comparing a fingerprint rather than counting rows is
  what lets a *corrected* exercise reach an existing install.
  **`pnpm check:seed-version` is the gate**, in CI beside the catalog check: change the data without
  bumping the constant and it fails, naming the value to paste. **Watched failing** before being
  restored, like the e1RM fixture and task 017's `cargo deny`.

**Bilingual search works, and the criterion has a test.** `foldForSearch` drops case and accents —
*tríceps* and *triceps* are one search — and `matchesSearch` matches every word of a query against
any of the names a row is known by. A global is known by its name in **both** catalogs, a user
exercise by the one name its owner typed and never a translation (INV-27). So **a pt-BR user finds
the bench press by typing *supino* or *bench***, and "supino incline" finds it too, because that is
how Brazilian gym vocabulary actually runs (ADR-008). The combining-mark range is written out rather
than matched with `\p{Diacritic}`: Unicode property escapes are not something to assume of Hermes,
and `String.prototype.normalize` itself is guarded and listed for the device pass.

**Scope moved, deliberately.** Stage 2 was planned as the seed *plus* query modules for catalog,
routines, workouts, sets and history. The seed and the search matcher are here; the query modules
move to the stages that build the screens using them. Designing a query API before its only consumer
exists is how it ends up shaped for nothing.

**Verified**: `tsc`, `eslint`, 47 lint fixtures, the platform-file check, catalogs at 474 messages,
the new seed-version gate, `db:generate` showing no schema drift, and **512** Jest tests, up from 489.

- No invariant changed and no ADR was added. One CI step added.

### 2026-09-19 — task 004 stage 3: the set row is built, and INV-16 had no legal way to mint an id

The live workout exists. A signed-in user starts one, adds an exercise, types a weight on the app's own
keypad, taps reps, taps a RIR chip and ticks the set — and **every one of those taps is a synchronous
SQLite write that the screen then re-reads** (INV-09). React holds no copy of anything that matters:
the hook writes first and renders what actually landed, which is the difference between surviving a
force-quit and merely intending to.

**The defect this stage found, and it is a rule's, not a line of code's. [INV-16](invariants.md) had no
enforcement path for training data.** Every user-data primary key is a client-minted UUIDv7; `uuidV7`
lives in `src/crypto/identifiers.ts` because randomness has one home; and
[ADR-012](decisions/ADR-012.md)'s matrix let neither `features/` nor `db/` import `crypto/`. Until this
stage the only caller was `src/account/`, which may — so an invariant with no route to its own
enforcement cost nothing and was invisible. The first workout row is what surfaced it. **Amended in
ADR-012, before any code**: `src/db/` may import `crypto/`'s identifier entry point and **nothing else
in that folder**, narrowed by the same file-category mechanism that already holds the root layout to two
entry points. Threading a `newId` parameter through every future call site was rejected as a lot of
plumbing to avoid one import; a second RNG inside `db/` was rejected for keeping the matrix intact by
breaking the rule the matrix exists to express. `features/` still may not import `crypto/` at all.
**Watched failing**: `lint-fixtures/src/db/imports-crypto-barrel.ts` proves the barrel is still refused,
and the app's own lint proves the one permitted file is not.

**Open question 9 is now built, not just decided.** `5+` opens a second row, `5 6 7 8 9 10`, and the
chip **stores nothing by itself** — six tests say so, in both languages and both themes, including that
pressing it calls `onChange` not at all. A stored 7 shows its own row without being asked, so a set
restored from the database reads back as the user left it. `5+` is a **button**, not a radio: it is a
disclosure, and a screen reader must not hear a press that stores nothing as though it stored something.
`Chip` gained an `expanded` state for exactly that.

**Three decisions the code forced.**

- **A set row exists from the moment it appears on screen**, empty and incomplete. That is what makes
  the ✓ an `UPDATE` with no id to mint and no promise to await — and it is why stage 1 made
  `is_counted_set()` ask about completion as well as type. The two halves were designed for each other
  a stage apart, and they met correctly.
- **Un-ticking a set clears `completed_at`** rather than keeping the moment of a tick the user took
  back. A set that is not complete was not completed at any time, and a stale timestamp is a small lie
  some later aggregate would eventually read as truth.
- **The exercise picker is deliberately the minimum**: the catalog in name order, in a sheet. Browse,
  search and filter go to stage 4 with the screen that owns them — stage 2's own reasoning, reapplied.
  The bilingual matcher it will use already exists and is untouched here.

**What is measured, and what is not — stated so the number is not read as more than it is.**
`measureTickLatency()` times the two things the ✓ actually does, on the real schema: the synchronous
`UPDATE` and the re-read of the whole open workout the screen renders from, 60 taps across a
five-exercise, twenty-set session, reported p50 / p95 / worst. **It does not measure React's commit or
the paint.** That half is settled by using the screen on the phone. This half is the one that can
regress silently as a session grows, because it is the half that re-reads every row.

**⚠ The stage is not finished.** Its entire purpose — *the set row measured on a real phone* — needs the
Galaxy S21 FE, and none of it has been run: the ✓ latency, the force-quit restore, the keypad never
covering the row it edits, TalkBack, the 200 % font pass in Portuguese in pounds, and whether
`PRAGMA foreign_keys = ON` actually bites. **Nothing above may be called done until those are run**, and
the task file's device criteria are where they are recorded.

**Verified, matching what CI runs**: `tsc`, `eslint`, **48** lint fixtures, the platform-file check,
catalogs at **488** messages, the seed-version gate, `db:generate` showing no schema drift, and **597**
Jest tests, up from 512. API — 156 unit tests still green, since both catalogs gained the same keys.

- **Also found, not fixed:** the Jest harness's known Windows flake bit once in a full run — a timeout
  on `MATRIX[0]` of `surfaces.test.tsx`, never on an assertion, passing alone immediately after. It is
  the behaviour `jest.config.js` already documents from task 017, and it is still a harness problem
  rather than a test one.
- No invariant changed. **One ADR amended** (ADR-012), so the counts are unchanged: 49 documents,
  15 ADRs. One dependency added, `expo-haptics`, which puts the ✓'s haptic in `src/platform/` and
  nowhere else (INV-28) and needs a fresh prebuild on the device.

### 2026-09-19 — task 004 stage 3 on the phone: the ✓ is 10 ms, and three things were quietly broken

The stage-3 device pass ran on a **Galaxy S21 FE (SM-G990E), Android 16, locale pt-BR, metric, dark,
font scale 0.86**. It is the reason the plan put the set row on a phone before building anything around
it, and it paid for itself three times over.

**The number the task asked for, measured rather than assumed.** Tapping ✓ — the synchronous SQLite
write plus the re-read the screen renders from — is **p50 10.5 ms, p95 12.4 ms, worst 20.1 ms** over 60
taps across a five-exercise, twenty-set session, reproduced on a second run. NFR-2 allows 100 ms for the
whole tap, so the data path uses about a tenth of it and leaves the rest to React's commit and the paint,
**which this number does not include** and which are judged by using the screen.

**A full set was logged in Portuguese, end to end**: 40 kg × 6 @ RIR 7 on *Crossover na polia*, a global
exercise named through its key (INV-27). The keypad's separator key renders `,` and is disabled for reps;
the row speaks *"40 quilogramas"*, *"6 repetições"* — so the Hermes `Intl` plural and decimal-comma
criterion is met. A blank chip reads *"RIR não registrado"*, never 0 (INV-03). **`5+` opened `5 6 7 8 9 10`
and stored nothing by itself** — the row still read "não registrado" until 7 was tapped — and the
accessibility tree carries the distinction the decision turns on: `RIR 7` is `checked`, `RIR 5 ou mais`
is `selected` and **not** `checked`. Force-stopping mid-workout and cold-launching brought the row back
exactly (INV-09), and `PRAGMA foreign_keys = 1` with an orphan insert rejected closes **stage 2's one
honestly-open criterion**.

**Three defects, none of them in stage 3's own logic, and none findable without a phone.**

- **⚠ `seedReferenceData()` had no callers.** Stage 2 wrote the seed, tested its pure half, and gated it
  in CI — and **nothing ever called it**. The phone was running with 36 tables and **0 exercises**, which
  is why the exercise picker had nothing to show. Stage 2's entry above says the catalog reaches the
  device "on first launch"; **on a real first launch it did not**, and every suite stayed green because
  they exercise `referenceSeedRows()` and never the wiring. Now called from the root layout's
  post-migration effect through `src/db/migrate.ts` — the entry point [ADR-012](decisions/ADR-012.md)
  already allows, so no rule changed. Verified on the device afterwards: **201 exercises, 21 muscle
  groups, 11 sport profiles, 14 increments, 16 tracks, 16 achievements**, each with a key and a null
  name, and the fingerprint in `sync_state`.
- **⚠ `Sheet` never opened** — task 011's, and the subject of
  [ADR-014 § Amendment](decisions/ADR-014.md). It set `mounted` during render; with the React Compiler
  enabled the sibling `setLastVisible` took and `setMounted` was lost. Its two tests both pass `visible`
  as a constant, so the `false → true` path had never run anywhere. Repaired by mounting straight from
  the prop; **the cost is the 240 ms exit fade**, recorded as a decision rather than absorbed quietly.
  **The uncomfortable half, checked rather than assumed:** the transition test added with the fix was run
  against the broken code and **passed in all eight matrix settings**, and `eslint` is silent on it too —
  **Jest does not apply the React Compiler that the shipped bundle applies**. So the new test encodes a
  good rule but would not have caught this. Until the suite runs under the compiler or the pattern is
  banned by lint, a phone is the only gate this class of defect has.
- **The set row reflows at font scale 0.86** — the ✓ wraps below the numbers as soon as the row holds
  `40 kg × 6 RIR 7`. Nothing truncates and every target stays 56 dp, so the reflow is doing its job; it
  is [07 §6](07-brand-and-ui.md)'s *one line* picture that no longer matches. Left open deliberately:
  whether the spec or the layout gives way is a design call, and the 200 % pass should inform it.

**The toolchain moved underneath the project, and that is now written down** ([06 §1](06-operations.md)).
Android Studio ships **JDK 25**, and JDK 24+ refuses the restricted `System.load` calls AGP's CMake tasks
make — every native task fails with one unattributed line. JDK 17 fixes it. The Windows build then still
dies in `react-native-libsodium`'s CMake, so the APK is built in WSL2 as ADR-004 allows (~30 minutes
cold, four ABIs for a phone that needs one). And **`packages/core-native`'s `.so` files are gitignored**,
so stage 1's claim that the generated surface and the shipped library *"cannot drift"* holds **only on the
machine that ran `ubrn build`**: a second checkout links stage-1 bindings against a pre-stage-1 binary and
fails on `undefined symbol: …volume_kg`. Worth closing with a CI step rather than a paragraph.

**Also fixed:** `expo-haptics` was committed as `^57.0.3` against a lockfile saying `~57.0.3`, which
`pnpm install --frozen-lockfile` refuses — the command CI runs, so it would have failed there.

**What stage 3 still owes**, and what stage 4 waits on: the 200 % font pass, the imperial pass, TalkBack
with the screen reader actually on, a short screen for the keypad, and airplane mode. The task file's
device list says which are ticked and which are not.

**Verified after the pass, matching what CI runs**: `tsc`, `eslint`, 48 lint fixtures, the platform-file
check, catalogs at 488 messages, the seed-version gate, and **613** Jest tests, up from 597 — the 16 new
ones being `Sheet` opened and closed by a caller that moves the prop, across the whole matrix.

- No invariant changed. **One ADR amended** (ADR-014, joining ADR-012 earlier in the day): 49 documents,
  15 ADRs. Three cross-cutting gaps recorded above, none of them owned by a task.

### 2026-09-21 — task 004's stages are written down, and the catalog screen forces three decisions

**The stage plan existed nowhere in `docs/`.** Four stages were built against a decomposition that
lived only in the conversation that made it: this file cites "stage 4", "stage 5's" and "the stage-8
checks", the task file cites "stages 4–6", and no document ever said what any of them were.
`.agents/AGENTS.md` makes `docs/` the source of truth, and the decomposition of the project's largest
task is exactly the kind of thing that rule is for. It is now a table in
[task 004](tasks/004-exercise-catalog-and-logging.md) § Stages — **stages 0–3 as a record,
reconstructed from what each stage wrote about itself, and stages 4–8 as a plan** that may be re-cut
in that file when a stage learns something. Nothing about the built stages changed; what changed is
that the next person can read the shape of the task without asking.

**Three decisions stage 4 forces, settled before the code rather than inside it.**

- **Archiving a *global* exercise is local to the device, and the UI says *hide*, not *delete*.**
  Stage 2 recorded that "a global the user archived stays archived", which is right on one phone and
  unexamined past it: `deleted_at` sits on a row whose `owner_user_id` is NULL — a row every user
  shares — so replicating that write is one user putting an exercise away for everybody. It stays a
  local act, and **how a per-user opinion about a shared row travels is an input to
  [task 006](tasks/006-sync-layer.md)**, stated there rather than guessed at now. The wording matters
  as much as the mechanism: *hide* is a claim about one person's list, and *delete* is a claim about
  the catalog.
- **Re-forking a global reuses an archived fork and un-archives it.** The task file already says a
  second fork is never made; what it did not say is what happens when the first one was archived.
  Refusing to reuse it means the save collides with `exercises_owner_name_key` against a row the user
  cannot see — an error message about something invisible, which is the worst kind. Reuse is also the
  honest reading of INV-11: the row was put away, not destroyed, and editing the global it came from
  is the user asking for it back.
- **The create form offers only `weight_reps` and `reps_only`.** FR-2.3's `duration` and
  `distance_duration` stay in the schema and arrive with the set row that can log them (stage 5).
  Offering all four now would let a user build an exercise the app cannot log — a dead end they would
  reasonably read as a bug.

- No invariant changed and no ADR was added. Counts unchanged: 49 documents, 15 ADRs.

### 2026-09-23 — task 004 stage 5 planned: re-cut in three, and seven decisions before the code

**Stage 5 is re-cut into 5a, 5b and 5c** ([task 004](tasks/004-exercise-catalog-and-logging.md) § Stages). Reading the
task against the code found four promises no stage owned: ✓ advancing focus (never built), removing and reordering
exercises mid-session (FR-2.8 — only adding exists), reopening the workout in progress on relaunch (the force-quit
criterion — relaunch lands on home), and the two tracking modes stage 4 deferred "to stage 5" when stage 5's row did not
mention them. **5a** is routines, supersets and start-from-routine; **5b** finishes the live session — set types, the
rest timer, focus, remove and reorder, resume; **5c** is the `duration` and `distance_duration` set row, before stage 6.

**Seven decisions**, each in the task file where the code will read them:

- **`workout_exercises` gains `rest_seconds`, `target_min_reps`, `target_max_reps` and `target_rir`**
  ([03 §4](03-database-schema.md)), in both schemas. They are *copied* from the routine at start, so a routine edited
  afterwards never moves a timer that is already running; `rest_seconds` NULL is **no timer**, not an invented default.
  A schema change after task 002, made while no user holds data — the cheap moment 002 names, still open.
- **The running rest timer is derived** — the last completed set's `completed_at` plus its exercise's rest — so it
  survives a force-quit with no state of its own (INV-09). Skipping it is a device-local record, never synced; `±15 s`
  edits that exercise's rest for the rest of the session.
- **A routine pre-fills the weight and the reps, never the RIR.** The target RIR is shown beside the row, not written
  into it: a RIR stored before the user looked is an e1RM input they did not choose — the rule `5+` and the blank chip
  already follow (INV-03). FR-2.10's plan default is task 005's.
- **A superset alternates and rests once per round** (FR-2.6).
- **A set's type changes from a visible control** — the set number is a button, long-press a shortcut, no swipe — and
  a non-working set shows `W`/`D`/`B`/`A` and says its type (07 §5–6, INV-24).
- **Notification permission is asked at the first rest timer**, never at launch, and never again once refused.
- **`expo-haptics` and `expo-notifications` get a lint fence** (`device-feedback`, allowed in `src/platform/` only).
  `expo-haptics` was confined by convention alone since stage 3; the fence makes it a rule, with a known-bad fixture.

- No invariant changed and no ADR was added: the decisions sit inside INV-03, INV-09 and INV-24 rather than changing
  them. Counts unchanged: 49 documents, 15 ADRs.

### 2026-09-23 — task 004 stages 5a and 5b built: routines, and the live session finished off

**Built, green in CI, and not yet on the phone.** Routines exist — build, rename, file in folders, reorder their
exercises, superset neighbours, set targets and rest, duplicate, archive and restore — and starting one writes the whole
pre-filled workout in **one synchronous transaction** after the ids are minted, refusing if a workout is already open.
The live session gained set types, a rest timer with its haptic and notification, ✓ advancing focus (superset-aware),
removing and reordering exercises, removing a set, and **a cold start reopening the workout in progress**.

**⚠ The finding worth the entry: the generated migration would have deleted every logged set.** Adding four columns to
`workout_exercises` — one with a CHECK — made `drizzle-kit generate` write a table rebuild. The expo migrator runs every
pending migration inside one `BEGIN … COMMIT`, where the rebuild's `PRAGMA foreign_keys=OFF` is a no-op; with foreign
keys on since stage 2, its `DROP TABLE` is an implicit `DELETE` that cascades into `set_logs`. (Its copy step also
selected the four new columns from a table that did not have them, so it would have failed — on a device, at launch.)
Replaced by hand with `ADD COLUMN`s, the snapshot kept, and proven against `node:sqlite` with foreign keys on: the logged
set survives, the CHECK bites, `foreign_key_check` is empty. The rule is now in [06 §4](06-operations.md), because the
next migration will meet the same generator.

**Four smaller things found on the way:**
- **A hidden exercise showed a blank name mid-workout.** The live block looked its exercise up in the *live* catalog
  list, which excludes hidden rows — so hiding one mid-session, or starting a routine holding one, drew an empty
  heading. Now `readExercise`, which does not filter; the routine editor uses the same.
- **`expo-haptics` had no fence.** Confined to `src/platform/` by convention since stage 3; now the `device-feedback`
  fence covers it and `expo-notifications`, with a known-bad fixture (49 fixtures).
- **The local typed-routes file was stale** (2026-09-21), and `tsc` rejected the new routes against it. It is
  gitignored and CI has no copy, so typed routes are **not enforced in CI at all** — regenerated here by starting Expo.
  Noted, not fixed: a CI step that generates it would make typed routes a gate rather than a local courtesy.
- **A rest-bar test that proved nothing** was caught by mutation before it was committed: the haptic guard's test
  passed with the guard removed. Rewritten around the case the guard exists for, and watched failing (8 of 8).

**Decided while building**, each in the task file: a routine's `reorder` in FR-2.5 is its exercises' order — the
routines list keeps creation order, and a reorder function nobody called was deleted rather than left as another
"written, tested, never called"; a removed routine exercise becomes a tombstone parked **below** every live index, so
the two-pass renumber never meets it; and the set-type letters are catalog content — `W D B A` in English, `Aq D B A`
in Portuguese — for the native-speaker review to settle.

**Verified, matching what CI runs**: mobile — `tsc`, `eslint`, **49** lint fixtures, the platform-file check, catalogs
at **614** messages, the seed-version gate, `db:generate` with no drift, **877** Jest tests, up from 737 at 5a and 613
before the stage. API — `ruff`, `ruff format`, `mypy`, six import contracts, `alembic upgrade`/`downgrade`/`upgrade`
through `0005`, the seed, `check_schema` (40 tables), **347** pytest tests. Three key rules watched failing: a RIR
pre-filled from the target (4 failures), rest mid-superset (1), the stale-clock buzz (8).

- No invariant changed and no ADR was added. One document gained a rule (06 §4). Counts unchanged: 49 documents,
  15 ADRs. One dependency added, `expo-notifications`, which needs a fresh prebuild on the device.

### 2026-09-23 — task 004 stage 5 on the phone: the migration holds, and the notification was being thrown away

First device pass for stages 5a–5b, on the Galaxy S21 FE, with a development build of `228069e` installed **over** the
previous one so the phone kept its data — one open workout, two completed sets — for the migration to meet.

**Proven on the phone:** migration `0002` against real logged sets (rehearsed first on a copy pulled off the device,
then run by the app: both sets intact, `foreign_key_check` empty); **every cold start landing in the open workout**; and
**a force-quit mid-rest coming back to the same rest** — ticked at 21:00:37 with a 2:00 rest, force-stopped, relaunched,
reading 1:43 seventeen seconds later. The task file's stage-5 device list says what is ticked and what is not.

**Two defects, both in the notification, both fixed and both invisible to every gate:**

- **⚠ The rest notification was dropped whenever the screen was off** — the one case it exists for. The foreground
  handler returned "show nothing" unconditionally, believing it is only consulted while the app is on screen; it is
  consulted whenever the process is alive. The alarm fired, reached the handler, and was discarded. Now it asks
  `AppState`; the next screen-off rest was delivered.
- **A force-quit mid-rest lost the notification**, because Android cancels a force-stopped app's alarms and only a
  mutation rescheduled one. The notification now follows the workout from an effect that runs on mount too.

**Not settled:** how late the notification is. One clean delivery was ~39 s late on a 2:00 rest, the first alarm ~22 s —
Android deferring an inexact alarm. The later timing runs were disturbed by hand on the phone and were abandoned at the
owner's request, so whether `SCHEDULE_EXACT_ALARM` is worth asking for stays open. **Also not run:** routines on the
device, supersets, the refused-permission path, TalkBack, and ✓ latency on a routine session.

**Carried into stage 5c**, both found during the pass: the ✓ completes a set with no weight and no reps — 03 §4's
"completion requires the tracking mode's fields" is enforced nowhere — and 15 seeded `duration` / `distance_duration`
exercises are pickable today and logged as weight × reps, while the 31 `reps_only` ones show a weight field.

- No invariant changed and no ADR was added. Counts unchanged: 49 documents, 15 ADRs.

### 2026-09-23 — task 004 stage 5c planned: the row follows what the exercise tracks

Seven decisions, in the task file where the code reads them, closing the two gaps the stage 5 device pass carried
forward. **Each tracking mode gets its own row** — a plank logs a time and no RIR, a carry logs weight, distance and
time — so the 15 seeded time and distance exercises stop being logged as weight × reps. **The ✓ no longer completes a
row missing its mode's required field**; it opens the keypad on that field — 03 §4's "enforced in the service layer",
finally enforced. **`set_logs.distance_m` becomes `numeric(9,3)`** ([03 §4](03-database-schema.md)): as an integer, an
imperial user's 100 ft read back as 98 ft — INV-02's precision lesson, arriving through distance, and a schema change
made while no user holds data. Records for time and distance (longest hold, farthest carry) are left as an open question
for stages 6–7, and a target time or distance on a routine as another.

- No invariant changed and no ADR was added: 3 applies INV-01 exactly rather than changing it. Counts unchanged:
  49 documents, 15 ADRs.

### 2026-09-23 — task 004 stage 5c built: every tracking mode logs as itself

**Built, green in CI, not yet on the phone.** The set row draws what its exercise tracks — weight × reps with RIR; reps
with RIR; a time alone; weight · distance · time — so the 15 seeded holds and carries stop being logged as weight × reps,
and the 31 reps-only exercises lose a weight field they never had a use for. A time is typed on the app's keypad,
filling from the right (`130` → 1:30), and spoken as "1 minute 30 seconds". **The ✓ no longer completes a row missing
what its mode needs** — it opens the keypad on that field. The create form offers all four modes; the targets sheet
drops the rep range and RIR for a hold or a carry, and clears them on save. A routine start pre-fills last time's time
and distance.

**`set_logs.distance_m` holds decimals now** — `numeric(9,3)`, Alembic `0006` and device `0003`. As an integer, 100 ft
read back as 98 ft; a test now round-trips every tenth of a foot from 1 to 300. The device migration is a table rebuild
Drizzle generated, **kept as generated because it was read and proven first** (06 §4): nothing on the device references
`set_logs`, so its `DROP` cascades into nothing, and against a copy of the test phone's own database every set
survived, both CHECKs still bit after the rename, and 30.48 stored exactly.

**Two things found on the way:**
- **⚠ "Duplicate routine" could never have worked.** Stage 5a passed a whole routine exercise to the row builder as its
  targets, and the builder spreads targets *after* setting `id` — so every copy carried the original's id and failed on
  the primary key. The write half runs only on a device and the 5a device checklist never reached it. Fixed with
  `targetsOf()`, which picks the five targets and nothing else, and a test that the copy keeps its own id.
- **The INV-23 fence reads any `duration: <literal>` as an animation timing** — including a string such as a translation
  key, and a tracking mode named `duration`. Worked *within* rather than around: the row's field is called `time`, and
  the two lookups keyed by the tracking value are `switch` functions. Narrowing the selector to numeric literals would
  change how INV-23 is enforced, which [`.agents/AGENTS.md`](../.agents/AGENTS.md) routes through an ADR, so it is
  recorded here and not done.

**Verified, matching what CI runs**: mobile — `tsc`, `eslint`, 49 lint fixtures, the platform-file check, catalogs at
**630** messages, the seed-version gate, `db:generate` with no drift, **942** Jest tests, up from 879. API — `ruff`,
`ruff format`, `mypy`, six import contracts, `alembic` up/down/up through `0006`, `check_schema`, **347** pytest tests.
Watched failing: the completion rule (1) and whole-metre storage (2).

- No invariant changed and no ADR was added. Counts unchanged: 49 documents, 15 ADRs.

### 2026-09-23 — the status rows caught up

A check of every document against the day's work found this file's own summary behind itself, in places older than
task 004: the **Phase** row still described task 017 as under way, days after it merged; the **Tasks** row counted
5 complete rather than 6; the **Repository** row left out PR #16; and task 017's checklist here showed six unticked
boxes under a ☑ while its own file has all 23 criteria ticked. The **Next action** row said "stages 0–4" beside a
paragraph about 5a–5c. All corrected. Five open questions the stage-5 work raised were in the task file but not in the
table above — rest-notification lateness, a target time or distance, records for time and distance, feet or yards, and
the Portuguese set-type letters — now numbered 13–17 there, each with the assumption being built.

- No invariant changed and no ADR was added. Counts unchanged: 49 documents, 15 ADRs.

### 2026-09-24 — task 004 stage 6 planned: the finish flow, and the half of PR detection nobody owned

Nine decisions, in [task 004](tasks/004-exercise-catalog-and-logging.md) § Stages where the code reads them. Three are
worth stating here.

- **The previous bests move into the core.** `detect_prs` has taken an exercise's standing bests as an argument since
  stage 1, and `src/domain/`'s comment said the caller "folds them from local `set_logs`". But folding them *is* PR
  logic: it applies INV-04 and INV-08 exactly as detection does, so a TypeScript fold would be the second copy INV-04
  forbids. It becomes `personal_bests()`, beside `detect_prs`, through both bindings, with a shared fixture and a
  property test that the two functions agree. The server's `personal_records` rebuild in stage 7 is the same function.
- **A record is the current best**, judged against every other finished workout of any date. A retroactively logged
  workout that beat what came before it, but not what came after, is not celebrated: it would be celebrating a number
  that is not the best today. This matches the server cache, which keeps the current best only.
- **A past workout's sets carry its chosen end as `completed_at`, while `updated_at` stays the real time**
  ([03 §4](03-database-schema.md)). Until now `completionPatch` wrote both from one `now`, which was harmless while they
  meant the same moment. Backdating `updated_at` would make a retroactive write lose to any stale copy under
  last-write-wins (NFR-4). The chosen end lives on the device until the workout is finished, which is safe because an
  open workout never syncs, so the schema does not change.

**Open question 18 added:** no task builds body-weight entry, so every bodyweight exercise has no load, no e1RM and no
record, however it is logged. Stage 6 does not build it; it is recorded rather than discovered at launch.

- No invariant changed and no ADR was added: the decisions apply INV-03, INV-04, INV-07, INV-08, INV-09 and INV-17
  rather than changing them. Counts unchanged: 49 documents, 15 ADRs.

### 2026-09-24 — task 004 stage 6 built: the finish flow, and a record that means the current best

**Built, green locally on every gate CI runs, and not yet on the phone.**
- *Finish* opens a sheet instead of ending the workout. It counts ticked and unticked sets, takes perceived fatigue
  as one tap (a second tap clears it), and takes the workout's note.
- It then lands on a **summary**: counted sets and volume, and each new record stated as a fact, with one emphasis
  and one haptic.
- With nothing ticked, the sheet offers only *Discard*.
- An exercise's note lives in its options sheet.
- *Log a past workout* opens the ordinary live screen dated to a chosen day and time: no rest timer, sets stamped
  with the chosen end, rows written at the real time.

**The core gained `personal_bests()`, built as a fold of `detect_prs` itself**, so the bests and the records cannot
disagree about what a record is. A property test checks it from both directions: what a session broke is exactly
what it moved, and a session folded into the bests breaks nothing against them. The new shared fixture
`personal_bests.json` runs in Rust and Python, and Jest checks its shape. **Watched failing**: folding the history
as one lifetime session instead of one session per workout failed three unit tests and the fixture's
session-volume case.

**The UniFFI bindings were regenerated in WSL2** — 69 lines, all additions, in the four generated files — and the
three `.so` files copied back beside them, which stage 3's entry says is the only way they match. The WSL2 clone
was fast-forwarded to the branch head first; it now carries this stage's `core-rs` as uncommitted changes.

**Found on the way:**
- **"Last time" could come from a workout with nothing ticked.** `readPreviousPerformance` picked the latest workout
  that *contained* the exercise. Finishing and discarding made that reachable, so it now picks the latest
  **finished** workout with a **completed** set. Routine pre-fill uses the same function and inherits the fix. It
  is a query, so only the device can prove it.
- **`completionPatch` wrote `completed_at` and `updated_at` from one `now`.** They are split now; a test fails if a
  past workout's `updated_at` is backdated (**watched failing**).
- **The live screen must not load the core.** The first cut put the finish sheet's tick count beside the summary's
  arithmetic, which imports `@/domain`, so the live workout would have loaded a native module to count ticks.
  `finish.ts` is now the only module in the feature that reaches the core, and only the summary screen imports it.
- **Typed routes**: the new `/summary/[id]` needed `.expo/types/router.d.ts` regenerated locally, which is the CI gap
  already listed under *Gaps*.

**Verified**:
- Mobile: `tsc`, `eslint`, 49 lint fixtures, the platform-file check, catalogs at **673** messages, the seed-version
  gate, `db:generate` with no drift, and **1105** Jest tests, up from 942.
- Core: fmt, clippy `-D warnings`, 49 unit tests and 6 fixture tests.
- API: `ruff`, `ruff format`, `mypy`, six import contracts, and 158 unit tests. The integration suite needs the
  local Postgres and was not run, but nothing the API touches changed except `app/domain/strength.py`'s re-export.

- No invariant changed and no ADR was added. Counts unchanged: 49 documents, 15 ADRs.

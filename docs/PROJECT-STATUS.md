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
| **Phase** | **Tasks 001, 002, 011 and 003 complete; task 019 next.** The schema exists in Postgres and SQLite, seeded and enforcing itself; the design system exists in `src/ui/`, token-driven and tested in both languages, both unit systems and both themes; and accounts, sessions and the privacy key exist on both sides, with row-level security proven under the API's own role. Everything that needs administrator rights — Docker, the device, the ADR-004 spike — is [task 017](tasks/017-local-toolchain-device-spike.md), which must finish before task 004 |
| **Repository** | Private GitHub repository `hiuriselzler/projeto_cyber`. `main` holds the documentation and tasks 001, 002, 011 and 003, each merged by pull request (#1; #5; #7 and #8; #9); each further piece arrives the same way, with CI green before merge |
| **Docs** | 49 files, internally consistent, all cross-links resolving |
| **Decisions** | 15 ADRs. Fourteen accepted outright; [ADR-004](decisions/ADR-004.md) accepted *conditionally* |
| **Tasks** | 18 for v1 (Android) — one of them, task 018, drawn by hand rather than built — and 2 after launch — iOS platform, Coach tier. **4 complete** (001, 002, 011, 003) |
| **Platform** | **Android first**; iOS a structural addition ([ADR-009](decisions/ADR-009.md)) |
| **Next action** | [Task 019](tasks/019-account-deletion.md), account deletion — planned 2026-09-14, with two questions left open inside it, neither blocking the API half. Then [task 017](tasks/017-local-toolchain-device-spike.md) once administrator rights are available, before task 004. Separately: a native speaker who trains reviews the Portuguese before launch — an AI pre-check is done — and the project owner draws the mark, [task 018](tasks/018-brand-mark.md), whenever ready |

### The one decision still genuinely open

**[ADR-004](decisions/ADR-004.md) — the Rust domain core.** Accepted subject to a **two-day
timeboxed spike** in task 017 — moved from task 001, still before task 004: prove UniFFI + PyO3 + EAS cross-compilation works by calling one
trivial function from FastAPI and from the Expo app on a *physical* Android device. Its iOS half is
moved, not dropped — it is gate 1 of task 016 ([ADR-009](decisions/ADR-009.md)).

- Chain works → **option B**, one Rust crate, adopted from task 004 onward.
- Timebox blown → **option A**, the domain written twice in Python and TypeScript, policed by
  shared fixtures as a hard CI gate on both suites.
- **"Chain works" is defined in advance:** PyO3 from FastAPI and UniFFI from a physical Android device,
  with the Android artefacts built by CI on Linux and by EAS. WSL2 is fine locally; a native-Windows build
  that fights back is not a failure.

Everything before task 004 is unaffected either way, which is why the spike sits where it does.
**Do not extend the timebox.** An FFI chain that takes a week to stand up has already answered.

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

#### ☐ 019 — Account deletion · **M** · depends: 003 · blocks: the store listing
> Added 2026-09-14, closing open question 11. Needs no administrator rights, so it goes ahead while task 017 waits.
> **Planned 2026-09-14:** other devices stay signed in; the web page's link opens a page, and only its button schedules
> the deletion. Two questions stay open in the task file, neither blocking the API half.
- [ ] Deletion requested with the password, cancellable for 7 days from any signed-in device, announced by email in the
      user's language
- [ ] **The sweep deletes every row of the account, inside its own scope** — a test over 03 §11 covers tables added later
- [ ] The web deletion page Google Play links to, answering identically for any address; **opening its link schedules
      nothing**
- [ ] One scheduled command, in `app/jobs/`, for the deletion sweep and the retention purges, documented in 06

#### ☐ 017 — Local toolchain, device and core spike · **L** · depends: 001, administrator rights · blocks: 004 onward
> Everything that needs administrator rights on the development machine, and every check only a phone
> can settle. **Must finish before task 004**: its spike decides how domain logic is written.
- [ ] Administrator installs: Windows long paths, WSL2, Docker Desktop, Android Studio (SDK, NDK,
      platform tools), Visual Studio Build Tools and Rust with the Android targets and `cargo-ndk`
- [ ] Local stack: `docker compose up`, roles created by the init hook, integration tests run locally,
      every README command verified on Windows
- [ ] **Development build on a physical Android device**, with hot reload; the API over `adb reverse`;
      a LAN address refused; the SQLite migration idempotent; secure storage surviving a restart
- [ ] A release build refuses an `http://` API base URL, and its bundle carries no diagnostics code
- [ ] Device checks moved from tasks 002, 011 and 003 — the Drizzle schema on a device, token changes,
      live numerals and TalkBack, the libsodium binding, offline sign-in, the key-derivation timing
- [ ] **⚠ ADR-004 spike — 2 days, hard timebox** (moved from task 001). `round_to_increment()` through
      both bindings, called from FastAPI *and* from a physical Android device: `41.6 → 42.5`, and the tie
      `41.25 → 40`. Success defined in advance; WSL2 allowed locally; **the clock starts once a dev build
      runs on the device**. The iOS half is gate 1 of task 016
- [ ] Rust CI job — `cargo deny`, clippy, fmt, Android cross-compilation — with `rand` and
      `SystemTime::now` each watched failing
- [ ] **⚠ ADR-004 outcome written into the ADR.** Task 004 does not start while it is open

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
| 9 | What the RIR `5+` chip stores: 5, or a choice from 5 to 10 (the schema allows 0–10, INV-03) | Nothing yet — task 011's chips take their values as a prop and store nothing | [Task 004](tasks/004-exercise-catalog-and-logging.md) |
| 12 | Which address the per-IP rate limits count ([04 §5](04-security-and-auth.md)). The API reads the socket's peer, `request.client.host`; behind a hosting platform's proxy that is the proxy for everyone, so registration would allow 5 an hour across all users | The client address comes from the platform's forwarded header, trusted only when the request arrives from the platform's own proxy — configured once the host is chosen ([05 §5](05-integrations.md)) | Before the first deploy |

**Closed 2026-09-09** — target RIR granularity (now `rir_mode` on the progression rule);
cardio intensity (both zones and pace ranges); bodyweight volume (summed); and the octopus
dashboard (dropped — the mark is brand-only). See the decision log.

**Closed 2026-09-10** — engine version skew, specified in [02 §7](02-architecture.md) and INV-06.

**Closed 2026-09-11** — the founding-price window opens once, at the Android launch, and **does not
reopen for iOS** ([09 §2](09-business-model.md)).

**Closed 2026-09-14** — the email provider (Resend, for the prototype), and who builds FR-1.4 (tasks 019 and 020). See the decision log.

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

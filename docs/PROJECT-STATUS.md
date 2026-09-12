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
| **Phase** | **Task 001 in progress.** The API, the mobile app, the shared package and CI exist, and CI is green; the device, the local Docker run and the ADR-004 spike are still ahead |
| **Repository** | Private GitHub repository `hiuriselzler/projeto_cyber`. `main` holds the agreed documentation; task 001's work is pull request #1 from `task/001-bootstrap` |
| **Docs** | 42 files, internally consistent, all cross-links resolving |
| **Decisions** | 12 ADRs. Eleven accepted outright; [ADR-004](decisions/ADR-004.md) accepted *conditionally* |
| **Tasks** | 14 for v1 (Android), 2 after launch — iOS platform, Coach tier. **0 complete** |
| **Platform** | **Android first**; iOS a structural addition ([ADR-009](decisions/ADR-009.md)) |
| **Next action** | [Task 001](tasks/001-project-bootstrap.md) — prove the gates by watching CI fail; then, with admin rights, Docker, the development build on a device and the ADR-004 spike |

### The one decision still genuinely open

**[ADR-004](decisions/ADR-004.md) — the Rust domain core.** Accepted subject to a **two-day
timeboxed spike** in task 001: prove UniFFI + PyO3 + EAS cross-compilation works by calling one
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

#### ☐ 001 — Project bootstrap · **L** · depends: nothing · blocks: everything
- [x] `git init` and a **private GitHub repository**, `.gitignore`, `.editorconfig`, `README.md`; pnpm workspace + `uv` for the API
- [ ] Directory skeleton exactly as [02 §2](02-architecture.md)
- [ ] API boots: config with a **boot-time assertion that `JWT_SECRET` is not a dev default**,
      structured JSON logging with request-ID propagation, `/health` and `/health/ready` separate —
      readiness includes migrations at head
- [x] **Two database roles** — `cyberathlete_migrator` owns the schema, `cyberathlete_app` runs the API;
      the API **refuses to boot** as a superuser, a `BYPASSRLS` role or a table owner ([04 §4](04-security-and-auth.md));
      grants through `ALTER DEFAULT PRIVILEGES FOR ROLE cyberathlete_migrator`
- [ ] **Debug builds reach the API over `adb reverse`, cleartext to `localhost` only**; release builds
      permit no cleartext, proven by CI ([04 §5](04-security-and-auth.md))
- [x] Node 24 LTS pinned (`.nvmrc`, `engines`); CI runs `pnpm audit`, not `npm audit`
- [ ] `docker-compose.yml` with `postgres:16` at the **repository root**; Alembic initialised against an empty schema
- [ ] Mobile: Expo pinned, TypeScript strict, `expo-router`; **development build installed on a
      physical Android device** (not Expo Go — background location needs it). iOS: task 016
- [ ] **`src/platform/` created, with a lint rule forbidding OS checks anywhere else** — prove it by
      writing `Platform.OS` into a feature and watching CI fail (INV-28)
- [x] **`src/account/` created** as the only route from screens to the network and the privacy key, and
      **only `src/domain/` imports the core binding** ([ADR-012](decisions/ADR-012.md))
- [ ] **`android/` generated, never committed** (`expo prebuild`); native settings in config plugins; a
      debug-only diagnostics screen runs the on-device checks through `src/account/`
- [x] **Every scope item has an acceptance criterion** (logging, OpenAPI codegen, fixtures in both
      suites, smoke tests, `cargo deny` + clippy)
- [ ] `expo-sqlite` + Drizzle proving migrations run at startup and are idempotent on second launch
- [x] `packages/shared` builds; OpenAPI type generation wired; `fixtures/` loader used by both suites
- [ ] **⚠ ADR-004 spike — 2 days, hard timebox.** `round_to_increment()` through both bindings,
      called from FastAPI *and* from a physical Android device: `41.6 → 42.5`, and the tie `41.25 → 40`.
      Success defined in advance; WSL2 allowed locally; **the clock starts once a dev build runs on the
      device**. The iOS half is gate 1 of task 016
- [ ] **⚠ ADR-004 outcome written into the ADR.** This task is not done while that is open
- [x] CI green both sides, with **the boundary rules written now, while there is nothing to fix** —
      import-linter + ruff `banned-api` (API), ESLint folder and package fences (mobile), including the
      ADR-011 fence on unscoped reads and one home each for network, crypto, secure storage and location
- [ ] Prove the gates: write a `sqlalchemy` import into `domain/` and watch CI fail; **every rule has a
      known-bad fixture that CI proves is caught**

#### ☐ 002 — Database and schema · **L** · depends: 001 · blocks: 003–009
> **The last chance to change the schema freely.** Schema churn is far cheaper before there is data.
- [ ] Postgres: all of [03](03-database-schema.md) in one pass, cardio and planning tables included
- [ ] Enums → users/auth → catalog → routines → workouts/sets → planner → **`gamification_tracks`**
      → **`sport_profiles`** → cardio → cardio plans → remaining gamification tables
      (`sport_profiles.xp_track` is an FK into the track catalog, so the catalog must exist first)
- [ ] Every CHECK from the doc, especially `rir BETWEEN 0 AND 10` (INV-03) and `max_reps >= min_reps`
- [ ] FK delete semantics per [03 §10](03-database-schema.md) — `exercises` is **RESTRICT**, not CASCADE
- [ ] `‹sync›` applied by mixin to every **root** in [03 §11](03-database-schema.md) and to nothing else
- [ ] **DB trigger backstop for INV-06**; `day_index` trigger against the parent's `length_days`
- [ ] **RLS enabled and `FORCE`d, failing closed** on user-owned tables; pre-authentication lookups as
      `SECURITY DEFINER` functions, never a bypass role ([04 §4](04-security-and-auth.md))
- [ ] SQLite mirror per [03 §8](03-database-schema.md), including the five documented differences
- [ ] Seeds: muscle groups, **~200 exercises** (real data-entry work — do it properly once),
      increment defaults, **all `sport_profiles` including deferred sports**
- [ ] Seeds exported as a JSON asset the app can seed from before it has ever synced
- [ ] **Increments for both unit systems at `numeric(10,6)`; every reference row keyed; both
      catalogs complete** ([ADR-008](decisions/ADR-008.md)) — prove an imperial block stays on the
      5 lb grid
- [ ] **Schema-comparison script**: Alembic vs Drizzle names, *plus* [§11](03-database-schema.md)
      enforcement. Prove it fails when `‹sync›` is misplaced

#### ☐ 011 — Brand assets and design system · **M** · depends: 001
> Numbered late, built third. Task 004 builds the set row, and it should come out of a system
> rather than be retrofitted into one.
- [ ] The octopus mark on a strict radial grid, four reduction levels, **black on white first**
- [ ] **Tone gate before anything else** — analytical, not cute. If it would work on a cereal box, restart
- [ ] Token source (INV-23), both themes end to end, **lint rule banning literal hex / size / duration**
- [ ] The set row · the custom numeric keypad · RIR chips · metric tile · cycle cell · sheet · chip
- [ ] **Track row** — the whole Progress screen is a list of these; works at 6 rows and at 15
- [ ] **i18n wired, literal-string lint rule, catalog key-parity check in CI**; every component
      tested in pt-BR and in pounds (INV-27)
- [ ] Damped house easing, **no spring bounce**; reduce-motion honoured
- [ ] Contrast: body 4.5:1, UI 3:1, **workout numerals 7:1**; tabular figures everywhere
- [ ] **One symmetric mark, never personalised.** No per-user octopus is built at all ([07 §2](07-brand-and-ui.md))

#### ☐ 003 — Authentication and authorization · **L** · depends: 002 · blocks: 006, 012, 014
> The authorization half matters more than the authentication half.
- [ ] Auth endpoints + **v1 account lifecycle**: password reset, enforced email verification,
      email change, session list, security notification emails
- [ ] argon2id ~250 ms; breach-list check; **constant-time login** whether or not the email exists
- [ ] Access JWT 15 min with no PII; opaque refresh token 60 days, rotated, **with reuse detection**
- [ ] **Base repository whose every method requires `user_id`, as a type error not a runtime one**
- [ ] `SET LOCAL app.user_id` per transaction so RLS engages; **404 never 403** for someone else's row
- [ ] **⚠ Privacy key lifecycle ([ADR-007](decisions/ADR-007.md))** — generate at registration, wrap
      client-side, unwrap on new-device sign-in, re-wrap on password change. Build it here even
      though nothing encrypts anything until task 007; retrofitting it is a migration with no
      derivable answer
- [ ] **Wrapping KDF argon2id `m=64 MiB, t=3, p=1`, never cheaper than the login hash**, parameters in
      `users.privacy_key_kdf`; all crypto in `src/crypto/` on libsodium, confirmed on-device first
- [ ] Offline sign-in: a returning user with a valid refresh token reaches the app with no network
- [ ] **Account flows in `src/account/`** — no screen imports `src/sync/` or `src/crypto/`
      ([ADR-012](decisions/ADR-012.md))
- [ ] **Prove RLS**: break the repository scope deliberately and assert 0 rows come back (NFR-9)

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
- [ ] **Portuguese terminology reviewed by a native speaker who trains** ([07 §9](07-brand-and-ui.md))
- [ ] **Google Play's reduced-fee tier — enrol *before* launch.** 15 % vs 30 %, and **not
      retroactive**. (The Apple Small Business Program has the same rule and moves to task 016.)
- [ ] Google Play Console registration ($25 once). (Apple Developer Program: task 016.)
- [ ] Storage region chosen and stated in the privacy policy
- [ ] Transactional email provider live — **on the critical path for task 003**, not later
- [ ] Google Maps API key restricted by package name + signing certificate
- [ ] **ADR-004's four conditions in place before the first user who is not the developer** — under
      option B; tasks 005 and 006 ([ADR-004](decisions/ADR-004.md))

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

**Closed 2026-09-09** — target RIR granularity (now `rir_mode` on the progression rule);
cardio intensity (both zones and pace ranges); bodyweight volume (summed); and the octopus
dashboard (dropped — the mark is brand-only). See the decision log.

**Closed 2026-09-10** — engine version skew, specified in [02 §7](02-architecture.md) and INV-06.

**Closed 2026-09-11** — the founding-price window opens once, at the Android launch, and **does not
reopen for iOS** ([09 §2](09-business-model.md)).

---

## Decision log

| Date | Decision |
|---|---|
| 2026-09-07 | [ADR-001](decisions/ADR-001.md) Phone owns a full local database; server is a sync target |
| 2026-09-07 | [ADR-002](decisions/ADR-002.md) Plans are materialised rows, re-projected by a pure engine |
| 2026-09-07 | [ADR-003](decisions/ADR-003.md) GPS tracks as typed streams + polyline, not point rows |
| 2026-09-07 | [ADR-004](decisions/ADR-004.md) Single Rust core — **conditional, pending the task 001 spike** |
| 2026-09-08 | [ADR-005](decisions/ADR-005.md) Gamification rewards adherence and recovery, never volume |
| 2026-09-08 | [ADR-006](decisions/ADR-006.md) Subscription monetisation, and the line the paywall never crosses |
| 2026-09-08 | [ADR-007](decisions/ADR-007.md) Privacy zones sync as ciphertext under a key the server never stores (claim narrowed 2026-09-11) |
| 2026-09-10 | [ADR-008](decisions/ADR-008.md) Two languages and two unit systems, from the first release |
| 2026-09-10 | [ADR-009](decisions/ADR-009.md) Android first; iOS as a structural addition, not a port |
| 2026-09-11 | [ADR-010](decisions/ADR-010.md) Exact numbers — bodyweight e1RM, per-set RIR, basis points, the safety rail, the XP curve |
| 2026-09-11 | [ADR-011](decisions/ADR-011.md) Database roles — the API connects as a role that cannot skip RLS; unscoped reads are allowlisted functions |
| 2026-09-11 | [ADR-012](decisions/ADR-012.md) Mobile boundaries before bootstrap — an account layer, one importer of the core, INV-10's gates |

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
- **Two audit findings accepted, by id.** `pnpm audit --audit-level high` reports two advisories in
  `image-size` (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq): denial of service from a crafted image, with no
  patched version. It is reached only through Metro at build time and never ships in the app. The gate
  stays at "high" and ignores only those two ids, with the reason beside them in `pnpm-workspace.yaml`;
  revisit when a patch exists.

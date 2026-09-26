# Task 005 — Strength Progression Planner

**Depends on:** 004 · **Blocks:** 009, 010, 013, 014 · **Size:** XL

> Renamed from `005-attendance.md`, which belonged to an unrelated project.

## Goal
The feature the app exists for. Define microcycle 1, generate a whole block, follow it, and have
it adjust to what actually happened.

**The repeating unit is a microcycle of user-chosen length** — 5 days, 7, 9, whatever (INV-25).
Nothing in this task may assume 7.

Implements [01 §3](../01-business-requirements.md) on the storage model of
[ADR-002](../decisions/ADR-002.md).

## Scope

### Phase A — the engine (build this first, and alone)

The progression core, in the single Rust crate `core-rs` that [ADR-004](../decisions/ADR-004.md) settled on
(option B, 2026-09-18), beside the existing `round_to_increment` in `core-rs/src/progression/`. **Pure: no I/O,
no clock, no randomness** (INV-10). `now` is a parameter wherever a function needs one. The server reaches it
through PyO3 (`app/domain/`), the app through UniFFI (`src/domain/`); both wrappers hold no logic.

```
generate(mesocycle_spec, cycle_one)           -> planned microcycles 2..N, dated and stamped
reconcile(plan, logs, now)                    -> re-projected plan
classify(planned_exercise, logs)              -> Exceeded | Met | Under | Missed
round_to_increment(weight_kg, increment_kg, mode)
                                              -> the ONLY rounding (INV-02); nearest | down | up,
                                                 a tie goes to the lighter load (ADR-010)
resolve_dates(start_day, length_days[])       -> starts_on for every cycle, walking length_days
ENGINE_VERSION                                -> integer; bumped exactly when a fixture's output changes
```

`generate` takes no `now`: nothing it produces depends on the day it runs. `reconcile` does, to know which
cycles have started. **Dates cross the core as whole days since 1970-01-01** (`i32`) — `deny.toml` bans the
date crates with the clock, and a date here is only ever a start plus a number of days (stage 1, decision 6).

**Five strategies in v1** per [01 §3.2](../01-business-requirements.md): `linear_load`,
`double_progression`, `percent_1rm`, `rir_autoregulated`, `fixed`. The user picks; there is no
default.

`cycle_pattern` is **v2** — its 3-up-1-down use case is already covered by `linear_load` with a
deload every four microcycles, and what it uniquely adds (undulating reps) is niche. The enum
value and the `cycle_pattern` column exist from day one, so adding it later is a new match arm in the strategy
dispatch, not a migration. **Leave the arm unimplemented rather than half-implemented.**

Block length is 2–52 microcycles; microcycle length is 1–28 days, defaulted per mesocycle and
**overridable per cycle**; deload policy is `none` / `every_n_microcycles` / `manual` (FR-3.1b).
**`none` must be exercised in tests as thoroughly as the others** — a 24-cycle block with no deload
at all is a legitimate configuration, not an edge case to warn about. So is a block of 9-day
cycles with one 5-day cycle in the middle.

Switching strategy mid-block (FR-3.6a) re-projects from the user's *achieved* state, not from the
original cycle-1 baseline. Preview before commit.

Non-negotiable properties, tested as properties over randomised inputs, not just examples:
- every generated weight is an exact multiple of its increment (INV-02) — **in both unit
  systems**: for an imperial rule, every prescription converts back to an exact lb multiple after
  storage rounding, across at least 52 cycles ([ADR-008](../decisions/ADR-008.md));
- every generated rep and RIR target is inside its rule's bounds (INV-05) — **including every
  per-set RIR sum**, which is clamped and marked `was_clamped` whenever target + offset leaves them;
- `reconcile(reconcile(p, l)) == reconcile(p, l)` (INV-10);
- only `projected` microcycles ever differ between input and output (INV-06);
- **a cycle last projected by a newer engine is never re-projected by an older one** — the output
  is unchanged when the input carries a higher `engine_version` (INV-06, ADR-004);
- `origin = user_edited` and `is_pinned` rows are never modified (FR-3.14);
- **every `day_index` is within its own cycle's `length_days`** (INV-25);
- **dates are contiguous**: each cycle starts exactly `length_days` after the previous one, for
  every mix of cycle lengths.

Shared fixtures in `packages/shared/fixtures/`, flat beside task 004's, run by every suite: `cargo test`
directly, pytest through PyO3, and the app on the device through UniFFI. Jest cannot load the core
(`apps/mobile/test/strength-fixtures.test.ts` says why), so it holds the files to their own shape. **The user's own
example is fixture #1**: 40 kg, 3×6, 2.5 kg step, 12 microcycles, deloads at 6 and 12 → 62.5 kg
at cycle 11. If that fixture disagrees with what the user meant, this is where it surfaces, cheaply.

### Phase B — persistence and API
- Bulk generation into `microcycles → planned_sessions → planned_exercises → planned_sets`
  (~1 500 rows — one batched insert, not a loop, per [ADR-002](../decisions/ADR-002.md)).
- `mesocycles/` CRUD, `POST /mesocycles/{id}/generate`, `POST /mesocycles/{id}/reconcile`.
- Cycle status transitions with the INV-06 guard at the single entry point.
- **Every projection is stamped** `engine_version = ENGINE_VERSION`, `last_write_kind = 'engine'`;
  every user edit sets `last_write_kind = 'user'` on its microcycle. The same entry-point guard
  refuses to re-project a cycle whose `engine_version` is higher than the running engine's
  ([02 §7](../02-architecture.md)).
- **Date re-derivation in one transaction** when a cycle's `length_days` changes: every later
  cycle's `starts_on` shifts, and only cycles that have not started may move
  ([03 §5](../03-database-schema.md)).
- Reconciliation triggers on workout completion, both locally and server-side; because it is
  idempotent, firing twice is harmless.

### Engine safety controls — [ADR-004](../decisions/ADR-004.md)'s conditions 1 and 4
Required before the first user who is not the developer, and built here because they live in the
`src/domain/` wrapper. The engine is native code and cannot be patched over the air; these are what can be
changed over the air instead.
- **Kill switch.** Each progression strategy, and local re-projection as a whole, can be switched off
  by configuration delivered over the air. A switched-off strategy leaves its cycles as last projected
  and defers to the server's projection; logging, history, recording and sync are untouched.
- **Minimum engine version, for re-projection only.** A device below it stops re-projecting locally
  and shows the plan as the server last projected it. It is never blocked from logging, reading
  history, recording or syncing (INV-26, NFR-1).

### Phase C — the UI
- **Mesocycle builder:** name, goal, number of cycles, **microcycle length**, deload policy; build
  cycle 1's sessions on a day-index grid; attach a progression rule per exercise (with mesocycle
  and user defaults, FR-3.6); preview the whole generated block *before* committing.
- **Two block views that must agree** (FR-3.3a):
  - **Cycle view** — microcycle × day index. How the programme is authored. A 9-day cycle is nine
    columns, not "a week and a bit".
  - **Calendar view** — real dates. How life is lived, and what answers "what am I doing
    Thursday". With a non-7-day cycle these look very different, and both are needed.
- **Editing a future cycle:** ordinary row edits; the row is marked `user_edited` and the engine
  projects from it afterwards. Changing its `length_days` shifts every later cycle's dates.
- **Today:** the prescribed session, one tap to start, pre-filled from `planned_sets`, each logged
  set carrying `planned_set_id` (FR-3.15).
- **After a session:** a plain diff — "Cycle 4 squat: 47.5 kg → 50 kg (met target)" or "held at
  47.5 kg (missed reps on set 3)". The user must always be able to see *why* a number changed.
- Two consecutive `Under` outcomes surfaces a deload suggestion; **advice, never a silent
  rewrite** (FR-3.12).
- Adherence reporting per microcycle and per block (FR-3.17).
- **RIR trend chart** (FR-2.17): average logged RIR per exercise per microcycle. A block where
  cycle 8 looks like cycle 1 is not progressing, and the app should say so plainly.

## Stages

> **Proposed 2026-09-26, at the end of task 004; started 2026-09-26** on `feat/task-005-progression-planner`, cut from
> the `main` that merged PR #17. A plan, to be re-cut here whenever a stage learns something — task 004's lesson was
> that a decomposition living only in a conversation is lost with it.

Each stage ends green on what CI runs, and **every stage that builds a screen ends on the phone** too: every device
pass in task 004 found a defect that `tsc`, ESLint and a green Jest suite had missed. Stages 1–3 are pure Rust and need
no phone.

| # | What it lands | State |
|---|---|---|
| **0** | The task file catches up with [ADR-004](../decisions/ADR-004.md)'s option B — see below | ☑ |
| **1** | **The engine's foundation:** the plan's types, `resolve_dates`, `ENGINE_VERSION`, `generate` for `linear_load` and `fixed`, the three deload policies, the property-test harness, **fixture #1** | ☑ |
| **2** | The other three v1 strategies — `double_progression`, `percent_1rm` (total, via `baseline_e1rm_kg`), `rir_autoregulated` — and the per-set RIR ladder, clamped and marked (INV-05) | ☑ |
| **3a** | `classify` and `reconcile`: the INV-06 guard, the older engine yielding, outcomes and `failure_policy`, user edits and pins surviving (FR-3.14) | ☑ |
| **3b** | Block edits: extending and shortening a block, a cycle's length changing with date re-derivation, a strategy switched mid-block from the load achieved (FR-3.6a) with its preview | ☑ |
| **4a** | The phone: the engine through UniFFI, `src/db/planner.ts` (create, read, write back only what changed), reconciliation after a workout and at start-up, the diagnostics proof — **built; the device pass is next** | ◐ |
| **4b** | The API: the `mesocycles/` endpoints, the Postgres batched insert, server reconciliation when a workout arrives | ☐ |
| **5** | The engine safety controls: the per-strategy kill switch and the minimum engine version | ☐ |
| **6** | The mesocycle builder, with the whole block previewed before it is committed — device pass | ☐ |
| **7** | The cycle view and the calendar view, which must agree, and editing a future cycle — device pass | ☐ |
| **8** | Today's session pre-filled from the plan, the after-session diff, the deload suggestion, adherence and the RIR trend chart; the 500 ms and airplane-mode criteria; the closing pass | ☐ |

**Before stage 0:** the owner merged [PR #17](https://github.com/hiuriselzler/projeto_cyber/pull/17) (task 004) on
2026-09-26, and `feat/task-005-progression-planner` was cut from the `main` that resulted.

**Stage 0 — the docs catch up** *(the same move as task 004's stage 0). Done 2026-09-26.* This file was written before
[ADR-004](../decisions/ADR-004.md) answered **option B**, so:
- Criteria that say "identically in Python and TypeScript" become **the Rust core, run by all three suites through its
  bindings**: `cargo test` directly, pytest through PyO3, and the app on the device through UniFFI. Jest cannot load the
  core (`apps/mobile/test/strength-fixtures.test.ts` says why), so it checks the fixture files' shape instead.
- The fixtures live flat in `packages/shared/fixtures/` like task 004's, not in a `progression/` folder.
- Phase A's "in whichever form the spike settled on" and the *(option B)* markers become plain statements.
- Stage 1's six decisions are recorded where they belong: decision 1 in [ADR-012](../decisions/ADR-012.md) § Amendment
  2026-09-26 and INV-10's enforcement line; decision 2 in [ADR-002](../decisions/ADR-002.md) § Amendment 2026-09-26;
  decision 3 in [01 FR-3.9](../01-business-requirements.md) and `was_clamped` in [03 §5](../03-database-schema.md);
  decisions 4–6 here and in PROJECT-STATUS's decision log.

**Stage 1 — the engine's foundation. Planned and approved 2026-09-26, every decision as recommended.** Pure Rust in
`core-rs/src/progression/`, beside the existing `round_to_increment`.
- *What it builds:* the input and output types; `resolve_dates` (each cycle starts `length_days` after the one
  before, for any mix of lengths); `ENGINE_VERSION = 1`; `generate` for `linear_load` (step in kg, or in basis points of
  cycle 1's load) and `fixed`; deload policies `none`, `every_n_microcycles` (with or without the final cycle) and
  `manual`, applying the mesocycle's `deload_set_bp`, `deload_load_bp` and `deload_rir_bump`.
- *The fixtures:* **#1, the owner's example** (40 kg, 3×6, 2.5 kg step, 12 cycles, deloads at 6 and 12 → 62.5 kg at
  cycle 11); a 9-day block whose cycle 3 starts 18 days after cycle 1; a 7-day block with one 5-day cycle; and a
  24-cycle `deload_mode = 'none'` block with no deload anywhere in it.
- *The properties:* every load a multiple of its increment in both unit systems over 52 cycles (INV-02); every
  `day_index` within its own cycle (INV-25); contiguous dates; the same output twice from the same input (INV-10).
- *The criteria it closes:* fixture #1 · the 9-day block · the 24-cycle `none` block · `round_to_increment`'s tie (already
  proven in task 004, ticked here) · the date half of the 5-day-cycle criterion. The 10 000-rule property waits for stage
  2, when every strategy that generates a load exists.
- *Bindings:* stage 1 exposes `generate` through **PyO3** (cheap, and CI runs it); UniFFI waits for stage 4, when the app
  first calls the engine, so the WSL2 rebuild happens once rather than every stage.

Stage 1 carried six decisions, each the owner's. **All six were taken as recommended on 2026-09-26**; the options
weighed are kept below because the reasoning is what a later stage will need:

1. **How to property-test under INV-10's gate.** `core-rs/deny.toml` bans `rand`, and cargo-deny checks dev-dependencies
   unless told otherwise, so `proptest`, which depends on `rand`, would fail `cargo deny check`. The options are:
   - **Recommended:** `proptest` as a **dev-dependency**, with `exclude-dev = true` in `deny.toml`'s `[graph]`, and a
     comment saying why. Dev-dependencies never reach the library the API and the app load. INV-10's call bans in
     `clippy.toml` still cover the library, and `cargo deny` still covers every crate that ships. Proptest's
     **shrinking** matters most exactly where this task is riskiest, regeneration against user edits: a failure comes
     back as the smallest case that breaks, not a 24-cycle block.
   - A hand-written seeded generator in the test tree: no crate and no gate change, but no shrinking.
   - Hypothesis in pytest through PyO3: shrinking, but a new Python dependency, and the core's own suite would not hold
     its own properties.
2. **Identity: who mints the plan's ids.** `generate` creates ~1 500 rows, each needing a UUIDv7 (INV-16), and the
   engine may use neither a clock nor randomness (INV-10). **Recommended:** the engine speaks **natural keys**, not
   ids: (cycle index, day index, exercise order, set index). The wrappers in `src/domain/` and `app/domain/` mint ids
   for new rows, and `reconcile` matches existing rows by natural key, so a row keeps its id, its `user_edited` origin
   and its pin through every re-projection. The alternative, passing a pool of pre-minted ids into the engine, makes
   the engine's output depend on the pool's order, which is an idempotence hazard for no gain.
3. **What a deload cycle prescribes, and whether it advances the load.** Fixture #1 already implies half the answer:
   62.5 kg at cycle 11 needs cycle 7 to resume at 52.5 kg, one step past cycle 5's 50 kg. **The deload does not consume
   a step.** **Recommended** for the other half: the deload multiplies **the last working prescription** (cycle 6 =
   50 kg × 6000 bp = 30 kg, through `round_to_increment`, `nearest`); target RIR + 2, **clamped into the rule's bounds**
   (INV-05); and sets × 5000 bp with **ties to the lighter**, the same rule ADR-010 gives loads, so 3 sets become 1.
   The alternative for sets is ties to the heavier (3 → 2), a gentler deload at the cost of a second rounding rule. The
   owner confirms, and fixture #1 is then written with its deload cycles spelled out.
   **Added when it was taken:** a deload's RIR that had to be clamped is marked `was_clamped` too, not only a per-set
   ladder's sum, so the plan can always say why a number reads as it does. The flag's meaning widens to *the engine
   bent this set's target to fit its rule* ([03 §5](../03-database-schema.md)).
4. **Where the increment is resolved.** INV-02 resolves it as exercise override → modality default for the user's unit
   system → 2.5 kg / 5 lb, which means reading tables. **Recommended:** the wrappers resolve it and pass one exact
   `increment_kg` per planned exercise; the engine never knows about units or modalities. That keeps unit handling
   out of the core, where INV-01 says it does not belong.
5. **The input's shape.** **Recommended:** plain records shaped like the rows, one level each: mesocycle spec →
   microcycles → sessions → exercises → sets, plus the rules. Each carries its natural key, status, origin, pin and
   `engine_version`, so a fixture reads as the plan it describes and each wrapper is a thin mapper. `perceived_fatigue`
   is **not** in them (INV-03). *As built in stage 1:* `generate`'s input carries only what generation reads — the
   spec and cycle 1's sessions, with each exercise's resolved rule and increment inline — and its output carries the
   natural keys and `engine_version`. Status, origin and pin arrive on the plan `reconcile` reads, in stage 3.
6. **How dates cross the core** *(found while planning; not in the original five).* `deny.toml` bans `chrono` and
   `time` with the clock. **Recommended:** a date crosses as an `i32` count of days since 1970-01-01, and each wrapper
   converts it to and from its own `date`. `resolve_dates` only ever adds days, so integers are exact and there is no
   calendar code in the core to get wrong.

**Fixture #1, as the owner confirmed it** — a `linear_load` rule with a 2.5 kg step, reps bounded 6–6, RIR bounded
0–4, a target of RIR 3, and `every_n_microcycles` with N = 6:

| Cycle | 1 | 2 | 3 | 4 | 5 | **6** | 7 | 8 | 9 | 10 | 11 | **12** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Prescription | 3×6 @ 40 | 42.5 | 45 | 47.5 | 50 | **1×6 @ 30, RIR 4\*** | 52.5 | 55 | 57.5 | 60 | **62.5** | **1×6 @ 37.5, RIR 4\*** |

\* 3 + 2 = 5, clamped to the rule's maximum of 4 and marked `was_clamped`. Every working cycle is 3×6 at RIR 3.

**Stage 1 — built 2026-09-26.** `core-rs/src/progression/` gains `plan.rs` (the records), `dates.rs` (`resolve_dates`,
`EpochDay`), `deload.rs` (`deload_schedule`) and `generate.rs`, with `ENGINE_VERSION = 1` in `mod.rs`. PyO3 exposes
`generate`, `resolve_dates` and `ENGINE_VERSION`, and `app/domain/progression.py` re-exports them with the only date
conversion on the server (`epoch_day`, `from_epoch_day`).
- *Fixtures* — `generate.json`, nine cases: fixture #1; the 9-day block; one 5-day cycle among 7s; 24 cycles under
  `none`; the 2.5 % step (142.5 kg); every second cycle with the final one too; a manual deload on a `fixed` exercise
  with a warm-up; targets from cycle 1 outside the rule; and a 135 lb block on the 5 lb grid, written in steps.
  `resolve_dates.json`, five cases, including a leap day and a year end. Run by `cargo test` and by pytest through PyO3
  (each watched failing on a wrong load and a wrong date); Jest checks both files against the invariants they
  illustrate.
- *Properties* — `core-rs/tests/progression_properties.rs`, 512 cases each: INV-02 over 52 cycles in both unit
  systems after `numeric(9,4)` storage; INV-05 bounds, deloads included; day indices inside their own cycle and
  contiguous dates; unique natural keys with no session dropped; the same plan from the same input in any order; and
  `none` never deloading. Two deliberate breaks — no load rounding, no deload clamp — each failed exactly the property
  that guards it.
- **Decided while building, the owner to confirm:** *a session that no longer fits a shorter cycle moves to the
  cycle's last day, after the sessions already there.* A 7-day template with sessions on days 1, 3, 5 and 7 becomes
  1, 3, 5 and 5 in a 5-day travel cycle. Nothing is dropped, and the order is kept. The alternatives were dropping the
  session, which silently removes training, and refusing to generate, which would make a legitimate length (FR-3.1a)
  fail. The session's natural key in that cycle is `(5, 1)`. Stage 3 must keep a user's edit to it if the cycle's
  length changes again — noted in ADR-002's amendment.
- **Found while building:** *a warm-up survives a deload's set cut, but its load is deloaded.* As first written, 01
  FR-3.9 kept warm-up, drop and back-off sets "as they are", which would leave a back-off set heavier than the working
  sets it follows. Corrected in FR-3.9 before the code was committed.
- **Found by shrinking:** a **1 lb** increment stored at `numeric(10,6)` is 3.7 × 10⁻⁷ kg short per step. That adds up
  to 0.001 lb by 1 120 lb: invisible at the two places the app shows, and within INV-02's own precision argument. The
  INV-02 property therefore asks what the user reads — the pounds at two places are a whole number of steps — not a
  tighter bound on the raw quotient.
- *Criteria:* ticked — the 9-day block, and `round_to_increment`'s tie (proven in every suite by tasks 017 and 004).
  **Not yet ticked, and why:** fixture #1 and the 2.5 % step pass in Rust and Python, but the device half waits for
  UniFFI in stage 4. The 5-day cycle's dates are proven, but refusing to move a completed cycle is stage 3's. The
  24-cycle `none` block generates correctly, but "never nags about one" waits for stage 8's deload suggestion — see
  the open question below.

**Open question for stage 8, found in stage 1:** under `deload_mode = 'none'`, does FR-3.12's suggestion still appear?
FR-3.12 asks for a visible suggestion to deload after two consecutive `Under` outcomes. FR-3.1b says `none` "must not be
second-guessed by any 'we recommend a deload' nag". *Assumption until then:* under `none` the suggestion offers to end
the block early and never proposes a deload. Two failures in a row are still worth saying, but a deload is exactly what
the user declined.

*Confirmed by the owner, 2026-09-26:* the rule that a session past a shorter cycle's end moves to its last day.

**Stage 2 — the other three v1 strategies. Proposed and approved 2026-09-26, every decision as recommended; built
the same day (below the decisions).** `generate` learns `double_progression`,
`percent_1rm` and `rir_autoregulated`, and the per-set RIR ladder (FR-3.8a). Generation is **open-loop**: no logs exist
yet, so every strategy projects as if each working cycle were `Met`. What logged performance changes — the size of
`rir_autoregulated`'s jump, `percent_1rm`'s new e1RM, `failure_policy` — is stage 3's `reconcile`.
- *What it builds:* `Strategy` gains the three variants, each carrying what it needs, so a rule missing its step, wave
  or baseline cannot be expressed. `Rule` gains `rir_mode` with its offsets. `ExerciseSpec` gains `uses_bodyweight` and
  `body_weight_kg`, for `percent_1rm` (decision 3). `PlannedSet` gains `target_min_reps` and `target_max_reps`, which the
  schema already has for double progression's range. The PyO3 rule constructor takes the schema's remaining columns
  and refuses a rule missing what its strategy needs. `cycle_pattern` stays refused by name, as v2.
- *The fixtures:* the double-progression criterion; the two per-set ladder cases; a `percent_1rm` wave tiled across a
  block with a deload in it; `percent_1rm` on a bodyweight exercise, with and without a body weight; `rir_autoregulated`
  descending 3 → 0 across a block with a deload; a rep step that would overshoot the range; double progression through
  a deload.
- *The properties:* the INV-02 property over **10 000 random rules of all five strategies**; INV-05 across all five,
  every per-set sum included; the stage-1 properties extended to the new strategies.
- *The criteria it closes:* the per-set ladder · double progression's `3×6@40 → … → 3×6@42.5` · 10 000 random rules.
- *No ENGINE_VERSION bump:* no existing fixture's output changes. The two new columns are written out as `null` in
  the stage-1 cases, which is their value there, not a change in behaviour.

Stage 2 carries six decisions, each the owner's, each with a recommendation:

1. **How double progression moves.** 01 §3.2 (b) gives the rule for one rep count; an exercise has several sets.
   **Recommended:** *the exercise moves as one.* Every counted set below the top of the range gains `rep_step` reps,
   **capped at the top**. When every counted set is at the top, the load takes one step and every counted set drops
   back to the bottom. Warm-up, drop and back-off sets hold their reps, and their loads follow the exercise's steps.
   A rep step that would overshoot the top stops at it rather than turning the excess into load — every rep count
   in the range is prescribed once. The load rounds by the rule's own `rounding`: 01's `round_up` predates that column.
   A `load_step_bp` is a share of cycle 1's load, as for `linear_load`. The alternative, each set moving on its own,
   splits one exercise across two loads in the same session.
2. **What `percent_1rm` prescribes for each set.** **Recommended:** every counted set prescribes
   `baseline_e1rm_kg × wave`, rounded by the rule. The wave is tiled across the working cycles, cycle 1 first, and a
   deload consumes no wave step. Warm-up, drop and back-off sets are **held as authored**. An empty wave holds cycle
   1's loads, so the strategy stays total. The alternative scales every set by the wave's ratio to its first value,
   which keeps a back-off set in proportion but makes cycle 1's typed loads, not the baseline, the real reference. The
   cost of the recommendation: under `percent_1rm`, a pyramid of different working loads is not expressible in v1.
3. **`percent_1rm` on a bodyweight exercise.** e1RM is over body weight plus added load (INV-07, ADR-010), but a
   planned set prescribes the added load. **Recommended:** the wrapper passes the latest body weight. The prescription
   is `baseline × wave − body weight`, never below zero. With no body weight, the exercise holds cycle 1's loads:
   the no-guessing rule of INV-07, running open-loop. Until open question 18 gives body weight an entry point, that
   second branch is the one that runs.
4. **How `rir_autoregulated` descends at generation.** **Recommended:** the target RIR moves from `rir_start` at cycle 1
   to `rir_end` at the last working cycle, in integer arithmetic across the working cycles, a tie rounding to **the
   higher RIR** — the same side ADR-010's tie rule takes for loads. Deloads consume no step. The load climbs by the
   rule's step each working cycle, as if every cycle were `Met`. With no `rir_start`, cycle 1's RIRs are held; with no
   `rir_end`, the target holds at `rir_start`.
5. **Where the per-set ladder applies.** Under `rir_mode = 'per_set'`, a set's target is the exercise target plus its
   offset, clamped and marked (INV-05, ADR-010). **Recommended:** the engine applies the ladder wherever a strategy
   *moves* the exercise-level target, which in v1 is `rir_autoregulated`. The other four hold RIR constant, so cycle 1's
   per-set RIRs — the ladder as the user authored it — are held and clamped. Offsets go to counted sets in `set_index`
   order; a set past the end of the array takes 0; an offset may be negative. Non-counted sets keep cycle 1's RIR.
6. **ENGINE_VERSION stays 1**, for the reason above.

**Stage 2 — built 2026-09-26.** The rules above are now written into [01 §3.2](../01-business-requirements.md) as
*Exactly what (b)–(d) generate*.
- *Code:* each strategy's working-cycle prescription is in a new `core-rs/src/progression/strategies.rs`, one function
  per strategy. `generate.rs` keeps the block walk, the session layout and the deload. `Strategy` carries each
  strategy's parameters, and `Rule` gains `rir_mode` (`RirMode`); neither is `Copy` any more. `ExerciseSpec` gains
  `uses_bodyweight` and `body_weight_kg`, and `PlannedSet` gains `target_min_reps` and `target_max_reps`.
- *Bindings:* the PyO3 rule takes every `progression_rules` column the engine reads. It refuses a stepping rule
  without exactly one step and a `percent_1rm` without its baseline, and refuses `cycle_pattern` by name as v2.
- *Fixtures:* `generate.json` now has 21 cases, 12 of them new. Every rule column is written out, null where unread.
  The new cases: double progression's criterion, an overshooting rep step, and double progression through a deload;
  a 70/75/80 % wave with a deload; `percent_1rm` on a bodyweight exercise with a body weight, without one, and below
  zero; `rir_autoregulated` 3 → 0 through two deloads, and a RIR tie; and the per-set ladder's two criteria plus
  negative and past-the-end offsets.
- *Properties:* the rule generator now covers all five strategies, both RIR modes, empty waves, missing RIR ends,
  a zero rep step, and bodyweight exercises with and without a body weight. A new property holds INV-02 over
  **10 000 random rules** (about 20 s in a debug build). INV-05 now also checks that a rep range rides on exactly the
  counted sets of double progression. Two deliberate breaks each failed the property that guards them: an uncapped
  rep step, and a negative added load.
- *Counts:* 88 core unit tests, 4 fixture tests, 7 properties; 35 pytest; 111 Jest checks on the fixture files.

**Stage 3 — `classify` and `reconcile`. Proposed and approved 2026-09-26, every decision as recommended: split into 3a
and 3b; 3a built the same day (below the decisions).** The riskiest code in the task: a bug here silently
destroys a user's deliberate changes (§ Notes and risks).

*The model that makes it safe.* Generation already works as *cycle 1, plus N steps, rounded once*. Reconciliation
generalises it: each exercise progresses from its latest **anchor**, and a projected cycle is the anchor plus the
working steps since it, rounded once. An anchor is a prescription or performance that is fixed:
- cycle 1;
- a logged session, adjusted by its outcome;
- a locked cycle;
- a user-edited or pinned set.

With no logs and no edits, the only anchor is cycle 1, so **reconciling a freshly generated plan must return it
unchanged**. That becomes a property, and it is what stops the first reconciliation from rewriting a whole block.
`generate` is rebuilt on the same machinery — each strategy as a state, a step and a prescription — so the two cannot
drift apart.

**Recommended split**, as task 004 split its stage 5 when one stage held too much:
- **3a:** `classify`; `reconcile` with the INV-06 guard and the older engine yielding; outcomes applied, `failure_policy`
  included; user edits and pins surviving.
- **3b:** extending and shortening a block, a cycle's length changing with date re-derivation, and a strategy switched
  mid-block with its preview. 3b gets its own plan after 3a lands.

*Stage 3a would close:*
- editing cycle 9's squat then completing cycle 4 leaves the edit untouched;
- met targets advance the next cycle, missed reps apply `failure_policy`;
- reconciliation never alters a `completed`, `in_progress` or `locked` cycle — the engine half; task 002's trigger is
  the other half, already proven;
- reconciling twice gives identical output;
- the older engine yields;
- a user edit made under an older engine survives a newer projection.

Its properties: idempotence; only `projected` cycles differ; `user_edited` and pinned sets never change; reconciling
a generated plan with no logs changes nothing; a plan holding any newer `engine_version` is returned unchanged.

Stage 3a carries seven decisions, each the owner's, each with a recommendation:

1. **Split stage 3 into 3a and 3b**, as above. **Recommended.**
2. **How `reconcile` knows "the same exercise" from one cycle to the next.** Sessions can move within a shorter cycle,
   and stage 7 will let a user add a session to one future cycle, so neither the session's natural key nor its position
   is stable. **Recommended:** each planned exercise carries its `exercise_id` as an **opaque reference** the engine
   compares and never interprets. An exercise's slot is its `exercise_id` plus which occurrence it is within its cycle,
   in canonical order, so a squat on day 1 and a squat on day 4 are two slots. This is a reference to the catalog, not
   an id the engine mints, so ADR-002's amendment is unchanged. The alternative, position alone, silently re-anchors
   the wrong exercise the first time a cycle's structure is edited.
3. **What `classify` counts** (01 §3.4). Only counted sets (INV-04), and only sets matched to a planned set through
   `planned_set_id`. Extra sets and swapped exercises are recorded and never read (FR-3.16). A planned counted set with
   no completed log, in a session that was logged, fell short. **The table has a gap**: reps below the target but
   at or above `min_reps` fit no row. **Recommended: `Met` needs every counted set at its target reps; anything short is
   `Under`.** So the rule's `failure_policy`, `hold` by default, applies — what a lifter does after a missed rep. The
   alternative, only a set below `min_reps` counting as `Under`, would let the plan progress past a missed rep.
   - `Exceeded`: every set met its target and every set's logged RIR is at least target + 2.
   - `Under`, also: any set logged at RIR 0 when its target was 2 or more.
   - A missing RIR is no signal: it can never make an outcome `Exceeded`, and never `Under` by the RIR clause (INV-03).
   - `Missed`: a session whose date has passed — this is what `reconcile`'s `now` is for — with nothing logged.
4. **What each outcome does next.** `Met` takes one step from **the achieved state**: the loads and reps actually
   logged, which is how FR-3.6a's "from where the user actually is" works. `Exceeded` takes two steps. `Under`
   applies `failure_policy`:
   - `hold` repeats the prescription;
   - `reduce_load` prescribes it at `failure_load_bp`;
   - **`repeat_cycle` repeats the failed cycle's prescriptions for every exercise in it in the next working cycle**,
     without inserting a cycle, so the block keeps its length and end date. Inserting one would move every later date
     for one bad session.

   Per strategy:
   - a step is a load step for `linear_load` and `rir_autoregulated`, a rep step for `double_progression` (capped as
     in stage 2), and nothing for `fixed`;
   - `percent_1rm` instead **re-reads the best e1RM of the session's counted sets** (INV-07), so `Exceeded` needs no
     second step. It holds the last one when the session yields none, running open-loop (FR-3.2c).
   - That e1RM lives in the anchor, never written back to the rule, because a rule can be a shared preset.

   `Missed` changes nothing: the block continues as projected, which is the "skip" of 01 §3.4. "Shift the block" is
   a user action on dates and belongs with 3b.
5. **User edits and pins** (FR-3.14). **Recommended:** a `user_edited` or pinned set is never changed. In the cycle
   that holds it, its exercise's prescription as it now stands — edited rows as edited, the rest as projected — becomes
   that exercise's anchor, assumed `Met`. The cycle's other rows are re-projected as usual. A locked cycle anchors every
   exercise in it the same way.
6. **The guard and the stamp** (INV-06, 02 §7).
   - **If any cycle carries an `engine_version` above this engine's, the whole plan comes back unchanged**: the older
     engine yields.
   - Otherwise only `projected` cycles are rewritten, each stamped with `ENGINE_VERSION` and `last_write_kind =
     'engine'`; their user-edited and pinned rows are untouched, as 02 §7 describes.
   - **Belt and braces:** a cycle holding any logged set is treated as started even if its status still says
     `projected`, so a lagging status can never let the engine rewrite a workout in flight.
7. **The input and output.** Input: the mesocycle spec, every cycle as rows (status, `engine_version`,
   `last_write_kind`, and sets carrying `origin` and `is_pinned`), each exercise with its rule, increment, body weight
   and `exercise_id`. Logs are task 004's `LoggedSet`, keyed by the planned set's natural key, with body weight
   already resolved for its date. Output: the whole plan, plus **the outcomes it acted on** — cycle, exercise slot,
   outcome, and whether `percent_1rm` ran open-loop — which the after-session diff and FR-3.12's two-`Under`s
   suggestion read in stage 8.

**Stage 3a — built 2026-09-26.** The rules are written into [01 §3.4](../01-business-requirements.md) as *Exactly how
the table is read*, and into FR-3.11.
- *Code:*
  - `core-rs/src/progression/` gains `classify.rs` and `reconcile.rs`.
  - `strategies.rs` now prescribes from an **anchor** through one `project` function, which `generate` calls with
    cycle 1 as the anchor. The deload arithmetic moved into `deload.rs` so both paths share it.
  - `plan.rs` gains the plan as rows (`PlanCycle` down to `PlanSet`), the schema's status, write-kind and origin enums,
    `PlanLog`, `Outcome`, `SlotOutcome` and `Reconciled`. `Rule` gains `failure_policy`.
  - PyO3 exposes `classify` and `reconcile`, and the rule takes `failure_policy` and `failure_load_bp`.
- *Fixtures:* `reconcile.json` holds 18 cases, each also reconciled a second time to prove idempotence:
  - Met from the load lifted; Exceeded's two steps; Under under `hold` and under `reduce_load`;
  - `repeat_cycle` holding a whole cycle; failure against a planned reserve; no RIR logged; a missed session;
  - the cycle-9 criterion; a pin; a lock; an edit under an older engine; the older engine yielding;
  - a logged set in a cycle still marked projected;
  - `percent_1rm` re-reading its e1RM, and running open-loop;
  - double progression from the reps done; a deload re-projected from the new last working cycle.

  `generate.json` gains the two failure columns on every rule and no change of output.
- *Properties:* `core-rs/tests/reconcile_properties.rs` runs over random blocks with random histories — started
  cycles with random logs, locks, skips, user edits and pins, older stamps, stray logs, a random today. The generators
  moved to `tests/common/` for both property files to share. The properties:
  - reconciling a generated plan changes nothing;
  - reconciling twice is reconciling once;
  - only projected cycles with nothing logged differ, and a user's rows never do;
  - what the engine writes is liftable and inside its rule;
  - a newer stamp anywhere returns the plan as given.

  Deliberately rewriting locked or completed cycles, dropping a user's rows, or lifting the version guard each
  failed a property.
- **Found by the properties, and fixed before commit:**
  - *A deload after cycle 1 read cycle 1 differently in the two paths.* `generate` multiplies cycle 1 as the engine
    reads it — on the grid, clamped, a double progression's range attached. `reconcile` multiplied the raw rows, so
    a fresh plan with a deload at cycle 2 did not reconcile to itself. Shrinking cut it to a 2-cycle block.
    `reconcile` now reads an exercise's first appearance as `generate` does, which changes no fixture.
  - *A deload after a user's edit could repeat reps outside the rule*, because the deload copied the reps it
    multiplied. It now clamps them too, and marks `was_clamped` (INV-05).
- **Noted for stage 4:** the engine's output is idempotent. Stage 4 must write only the rows that changed, or
  `updated_at` alone would make "byte-identical plan rows" false in the database.
- **Noted for stage 7:** a user's *deletion* of a generated set in a projected cycle is not an edit the engine can
  see, so reconciliation would regenerate the set. Editing a future cycle is stage 7's, which will need a
  representation for it — a pinned tombstone, say — before it ships.
- *Counts:* 95 core unit tests, 5 fixture tests, 12 properties; 55 pytest; 183 Jest checks on the fixture files.

**Stage 3b — block edits. Proposed and approved 2026-09-26, every decision as recommended; built the same day (below
the decisions).** Four pure functions in `core-rs/src/progression/`, each returning the
edited plan or a typed refusal, and never a half-edited one:
- `extend(mesocycle, plan, logs, today, to)` — FR-3.1c;
- `shorten(plan, to)` — FR-3.1c;
- `relength(plan, cycle, days)` — FR-3.1a and 03 §5 *Dates are derived*;
- `switch_rule(mesocycle, plan, logs, today, exercise, from_cycle, rule)` — FR-3.6a; its **preview** is the same call,
  not persisted.

The wrappers archive what a shorten drops (INV-11) and persist the rest in stage 4.

*Stage 3b would close:*
- the 5-day cycle criterion — later dates re-derived, and a completed cycle refused;
- extending 12 → 18 changing nothing before cycle 13, and shortening refusing to drop a completed cycle;
- a switch to `double_progression` in cycle 5 continuing from the load achieved.

*Its properties:*
- extending a generated block agrees with generating the longer block, from the first new cycle on;
- an extension changes nothing before the first new cycle;
- a relength moves only later cycles, and keeps every date contiguous;
- a refusal leaves nothing half-done;
- reconciling after any edit is still idempotent.

Stage 3b carries seven decisions, each the owner's, each with a recommendation:

1. **What an extension appends.** **Recommended:** new cycles laid out from **cycle 1's structure**, by stage 1's rule
   for a shorter cycle. Each exercise takes the rule, increment and body weight of **its latest row**, so a strategy
   switched mid-block carries forward. Lengths come from the default and any override; deload flags from the
   policy, for the new cycles only. Their prescriptions come from the same walk as `reconcile`, so they step from
   each exercise's anchor. Nothing before them changes — not even the old last cycle's final-cycle deload flag. The
   alternative, copying the last working cycle, would carry a one-off short cycle's compressed layout into every new
   one.
2. **Shortening.** **Recommended:** it drops trailing cycles and refuses if any of them is not a projected cycle with
   nothing logged. **A locked cycle is refused too**: the user unlocks it first, since a pin means "the engine keeps
   its hands off". Never below 2 cycles (FR-3.1). No existing flag changes, so the new last cycle does not become a
   deload under `final_cycle`. It returns the kept plan and the dropped cycle numbers, for the wrapper to archive.
3. **Changing one cycle's length.** Every later cycle's start shifts. **Recommended refusals:**
   - the cycle itself is `completed` or `skipped` — its length is history;
   - a cycle that would move has started (`in_progress`, `completed`, `skipped`, or holding a log);
   - the new length is outside 1–28;
   - **a session would fall past the new end.** This is 03 §5's trigger rule; the user moves that session first,
     which stage 7's editor offers.

   Moving a session needs the wrapper to know which row moved, and the engine speaks natural keys, so it refuses
   rather than guesses.

   Allowed: an `in_progress` cycle's own length — the travel case, where this cycle becomes 5 days — and moving a
   **locked** later cycle, because the move is the user's own action. Every cycle it changes is written as
   `last_write_kind = 'user'`, and no load changes: a cycle's length is not a progression step.
4. **Switching strategy mid-block** (FR-3.6a). **Recommended:** `switch_rule` puts the new rule on one exercise's
   rows in every projected cycle with nothing logged from `from_cycle` on, and reconciles. Because every exercise
   already projects from its anchor, the new strategy starts **from the load actually achieved** with no special
   case. Locked and started cycles keep their rule. The preview is the same call, not persisted.
5. **Refusals are typed.** A `Refusal` names its reason and the cycle; PyO3 raises a `PlanRefused` exception (a
   `ValueError`) carrying both, so the API can answer 409 with a reason rather than parse a message.
6. **A newer engine's stamp.** **Recommended:** `extend` and `switch_rule` project, so they refuse on a plan holding
   a newer stamp, as `reconcile` yields. `shorten` and `relength` project nothing — they are the user's own edits to
   rows and dates — and are allowed.
7. **"Shift the block" after a missed session** (01 §3.4). **Recommended: decided in stage 8**, where `Missed` is shown
   and the user chooses. It is either lengthening the missed cycle with `relength`, or something new; the choice
   belongs with the screen that asks.

**Stage 3b — built 2026-09-26.** The rules are written into [01 FR-3.1c](../01-business-requirements.md).
- *Code:* a new `core-rs/src/progression/edits.rs` holds `extend`, `shorten`, `relength` and `switch_rule`, with
  `Refusal` / `RefusalReason` and `Shortened`. Stage 1's rule for fitting sessions into a shorter cycle became a shared
  `place` function, so an extension is laid out exactly as generation lays a cycle out. PyO3 exposes the four
  functions and a `PlanRefused` exception (a `ValueError`) whose `args` are `(reason, cycle_number, day_index)`.
- *Fixtures:* `edits.json`, 18 cases:
  - the owner's block extended 12 → 18; an extension carrying a mid-block switch; a newer stamp; past 52 cycles;
  - shortening 6 → 4; refused on a completed cycle, on a locked one, and below 2 cycles;
  - one 5-day cycle moving a locked cycle with it; the in-progress travel case;
  - length changes refused: history, a completed later cycle, a session past the new end, 29 days;
  - `linear_load` → `double_progression` at cycle 5 from the 50 kg actually lifted; a switch keeping a locked
    cycle's rule; a newer stamp; an unknown exercise.
- *Properties* (in `reconcile_properties.rs`, over random histories):
  - extending a generated block agrees with generating it longer, from the first new cycle on;
  - an extension changes nothing before it;
  - a shorten drops only what never started;
  - a relength moves only later starts and keeps dates contiguous;
  - a switch touches only projected cycles and returns a reconciliation fixed point.

  Three deliberate breaks each failed a property: a shorten dropping started cycles, a relength moving them, and an
  extension copying the last cycle instead of cycle 1.
- **A consequence to know about.** Extending a block changes `rir_autoregulated`'s descent — the RIR now reaches
  `rir_end` at the new last working cycle — but "nothing before them changes" holds. So the projected cycles before
  the extension keep the old descent until the next reconciliation re-projects them. The extension's own cycles
  already follow the new one. The same is true of any projected cycle made stale by a log the plan was not yet
  reconciled against: an extension adds cycles; it does not reconcile the old ones.
- *Counts:* 95 core unit tests, 6 fixture tests, 17 properties; 74 pytest; 237 Jest checks on the fixture files.

**Stage 4 — persistence, the API and UniFFI. Proposed and approved 2026-09-26, all seven decisions as recommended: split
into 4a (the phone) and 4b (the API). 4a is built and waits on its device pass (below the decisions).** The engine leaves the test suites. Blocks are written
to both databases, reconciliation runs when a workout completes, and the engine reaches the phone.

Stage 4 carries seven decisions, each the owner's, each with a recommendation:

1. **Split it**, as stage 3 was.
   - **4a — the phone:**
     - the UniFFI surface for the whole engine, and `src/domain/progression.ts`;
     - `src/db/planner.ts` — create and generate a block in one transaction, read a plan for the engine, write back
       only what changed, archive what a shorten drops;
     - local reconciliation when a workout completes;
     - a device pass.
   - **4b — the API:**
     - the `mesocycles/` endpoints, `POST …/generate` and `POST …/reconcile`, with 409 for a `PlanRefused`;
     - the batched insert in Postgres;
     - server reconciliation when a workout arrives carrying planned-set links.

   **Recommended, 4a first**, while the phone is connected. 4b needs no phone and follows it.
2. **Cycle status transitions live in the core**, as a pure `settle_statuses(plan, logs, today)`, so the phone and the
   server move a cycle through its statuses identically, and the INV-06 guard's entry point has one definition.
   **Recommended rule:**
   - `projected` → `in_progress` at the first set logged against the cycle;
   - `in_progress` → `completed` when every session is logged or the cycle's last day has passed;
   - `locked` and `skipped` are the user's and never moved;
   - nothing ever moves backwards.

   The entry point is *settle, then reconcile, then write*. The alternative, each wrapper deciding statuses itself,
   is two implementations of a rule that must agree.
3. **Writing a reconciled plan back: only what changed.** The wrapper diffs the engine's output against the rows by
   natural key. It updates a changed row in place (keeping its id, so `user_edited` and pins stay attached), inserts
   new rows with ids minted through `src/crypto/identifiers.ts` (ADR-012's amendment already allows it), and archives
   what an edit removed (INV-11). All of it happens in one transaction. This is what keeps "reconciling twice produces
   byte-identical rows" true in the database, `updated_at` included (stage 3a's note).
4. **When the phone reconciles.** **Recommended:**
   - after a workout that holds planned-set links has finished and committed, in a transaction of its own, so a
     failure can never cost the workout (INV-09);
   - again at app start for the active mesocycle, since it is idempotent and cheap, so a crash between the two never
     leaves the plan stale.
5. **FR-3.6's rule cascade has no storage for its last tier.** It is exercise → mesocycle default → **user default**,
   and no table holds a user default. **Recommended:** stage 4 resolves exercise → mesocycle default and refuses to
   generate an exercise with neither — there is no product default to fall back on (FR-3.2). The user tier becomes an
   open question for stage 6's builder, which is where it would be set, and it needs a column: a migration best
   decided with the screen.
6. **The device proof.** **Recommended:** a debug-only *Planner* check on the diagnostics screen. It runs every shared
   progression fixture through UniFFI on the phone and reports each case, which is the device half of fixture #1 and
   the 2.5 % step. It also times generating and inserting a 24-cycle × 5-session block, task 005's 500 ms criterion,
   measured here where the insert is built rather than in stage 8.
7. **Dates on the phone** are `YYYY-MM-DD` text in SQLite. "Today" is the device's local date (INV-17). Conversion to
   and from the core's days since 1970 lives in `src/domain/` and nowhere else.

*Stage 4a would close:*
- fixture #1 and the 2.5 % step in every suite;
- the 24 × 5 block under 500 ms on the device;
- the engine half of "the whole flow works in airplane mode" — the phone generates and reconciles with no network.
  The screens are stages 6–8.

*Stage 4b would close* the batched insert and date re-derivation in one transaction on the server, and reconciliation
on workout completion on both sides.

**Stage 4a — built 2026-09-26; the device pass is still to run.** Everything below passes on the Windows machine, and
nothing below has run on the phone yet.
- *The core* gains `settle_statuses(plan, logs, today)` in `core-rs/src/progression/status.rs` (decision 2). It has
  three unit tests and three `edits.json` cases (op `settle_statuses`), runs in `cargo test` and pytest, and is
  exported through PyO3 for 4b. A status that moves is written as the user's, because 03 §5's trigger refuses an
  engine write to a cycle that is no longer projected.
- *UniFFI* (`core-rs/bindings/uniffi/src/lib.rs`) exposes the whole planner:
  - `generate`, `resolve_dates`, `classify`, `settle_statuses`, `reconcile`, `extend`, `shorten`, `relength`,
    `switch_rule` and `engine_version`;
  - a `PlanError::Refused` thrown to JavaScript.

  **It uses `uniffi::remote`**, redeclaring the core's own types rather than mirroring them by hand, so nothing is
  copied and a mismatch fails to compile. `RoundingMode`, `SetType` and `LoggedSet` moved from task 004's hand-made
  mirrors to `remote` as well, and their generated TypeScript is unchanged.
- *The bindings were regenerated in WSL2* with `ubrn build android --and-generate`. The four generated files and the
  three `.so` files were copied to this checkout. An arm64 debug APK was built, and its packaged `.so` carries
  `reconcile`, `generate`, `settle_statuses`, `switch_rule` and `engine_version`. **That APK is installed on the
  phone** — `adb install -r`, data kept, 2026-09-26.
- *`src/domain/`*: a new `progression.ts` holds schema-shaped types (string enums, `null`, `YYYY-MM-DD`) marshalled
  to the binding. It is the only date ↔ day-count conversion on the phone (decision 7), and it throws
  `PlanRefusedError` and `IncompleteRuleError`. A new `marshal.ts` holds what it shares with `index.ts`: `LoggedSet`,
  `SetType`, and the `null` ↔ `undefined` translation.
- *`src/db/planner.ts`*:
  - `prepareBlock` (reads, generation, ids) and `insertBlock` (batched, 500 rows a statement), with `createBlock`
    doing both;
  - `readPlan` resolves FR-3.6 exercise → mesocycle default and INV-02's increment, reads the latest body weight,
    and places every log on its planned set's natural key with its day's body weight;
  - `diffPlan` and `writePlan` write only what changed, and revive an archived row that still holds a unique position
    rather than inserting beside it;
  - `reconcileBlock` settles, reconciles, then writes; `reconcileBlocks` never lets one block's failure escape.

  Ids come from a new `uuidV7Batch` in `src/crypto/identifiers.ts`: one draw of the CSPRNG for a whole block.
- *The triggers* (decision 4):
  - `useLiveWorkout`'s finish reconciles the workout's blocks after `endWorkout` has committed;
  - `restoreAccountSession` reconciles every active block after the session is restored, which keeps the root
    layout's two entry points (ADR-012).
- *The device proof* (decision 6), on the diagnostics screen:
  - **Run the planner fixtures** runs every `generate.json`, `reconcile.json` and `edits.json` case through UniFFI and
    lists any failure;
  - **Measure a 24 × 5 block** prepares, inserts, reads back and reconciles a 24-cycle × 5-session × 5-exercise ×
    4-set block for the signed-in user inside one rolled-back transaction. It reports the rows, the generate and
    insert times against 500 ms, and how many rows a first reconciliation would rewrite, which must be 0. Its rule is
    one archived row, reused.
- *Tests:* `src/db/__tests__/planner.test.ts` covers the cascades and the diff — 8 cases, among them that a no-op
  writes nothing. Totals: 1 633 Jest tests, lint and 52 lint fixtures, `tsc`; the core's full suite and pytest.
- **Found on the way:** my fixture generator's `simple(..., statuses={})` meant "cycle 1 completed", because an empty
  dict is falsy in Python. The cases that meant "nothing started" now start with nothing started. They had passed
  before, since input and expectation were wrong together, but they were not testing what their notes said.

**Next session — the stage 4a device pass, then 4b.** The phone holds the new APK and the account
`stage8-device@example.com`. A copy of its database from before the install is at
`scratchpad/device/before-4a.db` — a session scratchpad, so treat it as gone and pull a fresh copy first.
1. Pull a copy of the phone's database (the memory rule: its data has no other copy until task 006).
2. `adb reverse tcp:8081 tcp:8081` (and 8000), `pnpm exec expo start --dev-client` in `apps/mobile`, and open the
   build at Metro (06 §1's deep link).
3. On the diagnostics screen: **Run the planner fixtures** — expect every case passed in all three files. Then
   **Measure a 24 × 5 block** — expect about 3 000 rows, a total under 500 ms, `rows a first reconciliation would
   rewrite: 0`, and first loads of `60, 62.5, 65, deload 40, 67.5` **if** the first exercise the check picks has a
   2.5 kg increment. Cycle 4 is the every-4 deload, 65 × 0.6 = 39 → 40; cycle 5 is the third step. A different
   increment gives different loads, so check that exercise's modality in the pulled database before judging.
4. Prove a real block end to end: create one on the device (a debug button, or from the diagnostics screen), log a
   session against it, finish, and read the pulled database. The reconciled rows must have moved, their `updated_at`
   must be new, and nothing else may have changed. Relaunch, and nothing may be written at start-up.
5. If all holds: tick fixture #1, the 2.5 % step and the 500 ms criteria; record the numbers here and in
   PROJECT-STATUS; commit and push. Then plan 4b.
- **Still open from decision 5:** where FR-3.6's *user default* rule is stored. No column exists; it is open question
  20 in PROJECT-STATUS, decided with stage 6's builder.

## Acceptance criteria
- [ ] Fixture #1 (the user's 40 → 62.5 kg example) passes in every suite — `cargo test`, pytest through PyO3, and
      the app on the device through UniFFI
- [x] A per-set ladder `[2, 1, 0]` on a rule with `max_rir = 3` produces RIR `3, 3, 3` marked
      clamped at target 3, and `3, 2, 1` unclamped at target 1 (FR-3.8a) — *stage 2: `generate.json`, in `cargo test`
      and pytest*
- [ ] A 2.5 % step (`load_step_bp = 250`) from a 140 kg squat prescribes **142.5 kg** — the former
      two-decimal fraction, stored as 3 %, gave 145 kg — and every suite agrees on every
      percentage-derived load in the fixture set
- [x] Double progression with range 6–8 and a 2.5 kg step produces
      `3×6@40 → 3×7@40 → 3×8@40 → 3×6@42.5` — *stage 2: `generate.json` and a core unit test*
- [x] No generated weight is ever a non-multiple of the increment, over 10 000 random rules — *stage 2:
      `no_load_is_ever_off_the_grid_over_ten_thousand_rules`, all five strategies*
- [x] Editing cycle 9's squat, then completing cycle 4, leaves cycle 9's edit untouched — *stage 3a:
      `reconcile.json`, and a property over random edits*
- [x] A block of **9-day microcycles** generates correctly, and cycle 3 starts 18 days after
      cycle 1 — no weekday assumption anywhere (INV-25) — *stage 1: `generate.json` and `resolve_dates.json`, in
      `cargo test` and pytest*
- [x] A block of mostly 7-day cycles with **one 5-day cycle** in the middle re-derives every
      later start date correctly, and refuses to move a completed cycle — *stage 1 (generation) and stage 3b
      (`relength`), in `edits.json` and a property*
- [ ] The cycle view and the calendar view show the same sessions for the same block
- [x] Completing a cycle with all targets met advances the next cycle; missing reps applies
      `failure_policy` instead — *stage 3a: `reconcile.json`, all three policies*
- [x] Reconciliation never alters a `completed`, `in_progress` or `locked` cycle — asserted by the
      DB trigger from task 002 as well as by the engine — *the trigger proven in task 002's suite; the engine by
      stage 3a's property over random histories*
- [x] Running reconciliation twice produces byte-identical plan rows — *stage 3a: every `reconcile.json` case and a
      property. Stage 4 must write only changed rows to keep it true in the database*
- [x] A plan projected at engine version N+1, reconciled by an engine at version N, is left
      byte-identical — the older engine yields (INV-06) — *stage 3a: `reconcile.json` and a property*
- [x] A user edit to a projected cycle, made under an older engine, survives a projection from a
      newer one, and the newer engine re-projects the cycle's other rows from that edit (FR-3.14) — *stage 3a*
- [ ] A 24-cycle block with `deload_mode = 'none'` generates 24 working cycles and never inserts
      a deload or nags about one
- [x] Extending a 12-cycle block to 18 appends projected cycles and changes nothing before them;
      shortening it refuses to drop a completed cycle (FR-3.1c, INV-06) — *stage 3b: `edits.json` and properties*
- [x] Switching an exercise from `linear_load` to `double_progression` in cycle 5 continues from
      the load actually achieved, not from cycle 1 — *stage 3b: `edits.json`, from the 50 kg lifted in cycle 4*
- [ ] A 24-cycle × 5-session block generates in < 500 ms on-device
- [ ] The whole flow — build, generate, browse to the final cycle — works in airplane mode
- [x] `round_to_increment` in `nearest` mode sends a load exactly halfway between two steps to the
      lighter one — 41.25 kg on a 2.5 kg grid gives 40 kg — identically in every suite — *`round_to_increment.json`
      in `cargo test` and pytest, and on the Galaxy S21 FE through UniFFI (task 017's spike); ticked in stage 1*
- [ ] With a strategy switched off by over-the-air configuration, its cycles stay as last
      projected, and the device still logs, records and syncs
- [ ] A device below the minimum engine version does not re-project locally, shows the
      server's projection, and is blocked from nothing else

## Notes and risks
- **Build the engine before any UI**, with fixtures, in isolation. It is pure, it is fully
  testable without a database or a phone, and every hour spent on it is repaid.
- The riskiest interaction is regeneration versus user edits. Property-test it hard; a bug here
  silently destroys a user's deliberate changes, which is the fastest way to lose their trust in
  the whole planner.
- Reconciliation running on both client and server is where divergence will bite. If the two ever
  disagree in practice, treat it as a P0 and add the failing case to the shared fixtures.
- Strategy choice and deload policy are **user settings, not product decisions** — the builder
  asks, and `none` is as valid an answer as any other. Resist adding a "recommended" badge that
  quietly becomes a default.

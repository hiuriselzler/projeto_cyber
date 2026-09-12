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

The progression core, in whichever form [ADR-004](../decisions/ADR-004.md)'s task-017 spike
settled on — one Rust crate, or Python mirrored in TypeScript. **Pure: no I/O, no clock, no
randomness** (INV-10). `now` is a parameter.

> That decision is already made by the time this task starts ([task 017](017-local-toolchain-device-spike.md)
> is not complete until ADR-004 has a recorded outcome, and task 004 waits for it). Do not reopen it here.

```
generate(mesocycle_spec, cycle1, rules, now)  -> planned microcycles 2..N
reconcile(plan, logs, now)                    -> re-projected plan
classify(planned_exercise, logs)              -> Exceeded | Met | Under | Missed
round_to_increment(weight_kg, increment_kg, mode)
                                              -> the ONLY rounding (INV-02); nearest | down | up,
                                                 a tie goes to the lighter load (ADR-010)
resolve_dates(mesocycle)                      -> starts_on for every cycle, walking length_days
ENGINE_VERSION                                -> integer; bumped exactly when a fixture's output changes
```

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

Shared fixtures in `packages/shared/fixtures/progression/`, run by both suites. **The user's own
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

### Engine safety controls — [ADR-004](../decisions/ADR-004.md)'s conditions, under option B
Required before the first user who is not the developer, and built here because they live in the
`src/domain/` wrapper. Under option A the engine itself ships over the air and these are not needed.
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

## Acceptance criteria
- [ ] Fixture #1 (the user's 40 → 62.5 kg example) passes identically in Python and TypeScript
- [ ] A per-set ladder `[2, 1, 0]` on a rule with `max_rir = 3` produces RIR `3, 3, 3` marked
      clamped at target 3, and `3, 2, 1` unclamped at target 1 (FR-3.8a)
- [ ] A 2.5 % step (`load_step_bp = 250`) from a 140 kg squat prescribes **142.5 kg** — the former
      two-decimal fraction, stored as 3 %, gave 145 kg — and Python and TypeScript agree on every
      percentage-derived load in the fixture set
- [ ] Double progression with range 6–8 and a 2.5 kg step produces
      `3×6@40 → 3×7@40 → 3×8@40 → 3×6@42.5`
- [ ] No generated weight is ever a non-multiple of the increment, over 10 000 random rules
- [ ] Editing cycle 9's squat, then completing cycle 4, leaves cycle 9's edit untouched
- [ ] A block of **9-day microcycles** generates correctly, and cycle 3 starts 18 days after
      cycle 1 — no weekday assumption anywhere (INV-25)
- [ ] A block of mostly 7-day cycles with **one 5-day cycle** in the middle re-derives every
      later start date correctly, and refuses to move a completed cycle
- [ ] The cycle view and the calendar view show the same sessions for the same block
- [ ] Completing a cycle with all targets met advances the next cycle; missing reps applies
      `failure_policy` instead
- [ ] Reconciliation never alters a `completed`, `in_progress` or `locked` cycle — asserted by the
      DB trigger from task 002 as well as by the engine
- [ ] Running reconciliation twice produces byte-identical plan rows
- [ ] A plan projected at engine version N+1, reconciled by an engine at version N, is left
      byte-identical — the older engine yields (INV-06)
- [ ] A user edit to a projected cycle, made under an older engine, survives a projection from a
      newer one, and the newer engine re-projects the cycle's other rows from that edit (FR-3.14)
- [ ] A 24-cycle block with `deload_mode = 'none'` generates 24 working cycles and never inserts
      a deload or nags about one
- [ ] Extending a 12-cycle block to 18 appends projected cycles and changes nothing before them;
      shortening it refuses to drop a completed cycle (FR-3.1c, INV-06)
- [ ] Switching an exercise from `linear_load` to `double_progression` in cycle 5 continues from
      the load actually achieved, not from cycle 1
- [ ] A 24-cycle × 5-session block generates in < 500 ms on-device
- [ ] The whole flow — build, generate, browse to the final cycle — works in airplane mode
- [ ] `round_to_increment` in `nearest` mode sends a load exactly halfway between two steps to the
      lighter one — 41.25 kg on a 2.5 kg grid gives 40 kg — identically in every suite
- [ ] *(option B)* With a strategy switched off by over-the-air configuration, its cycles stay as last
      projected, and the device still logs, records and syncs
- [ ] *(option B)* A device below the minimum engine version does not re-project locally, shows the
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

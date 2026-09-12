# Task 009 — Cardio Planner

**Depends on:** 005 (reuse its engine patterns), 007, 008 · **Blocks:** 010 · **Size:** L

## Goal
The cardio half of the planning story: a training block with per-microcycle volume progression,
session types, interval structures, and the same reconciliation loop as the strength planner.
Microcycles are user-length here too (INV-25) — nothing assumes 7 days.

Implements [01 §6](../01-business-requirements.md). Deliberately built **after** task 005 so it
can reuse that engine's shape rather than inventing a second one.

## Scope

### Engine — `domain/cardio_plan/`, pure (INV-10)
Same contract as the strength engine, different unit of progression: **volume per microcycle**
rather than per-set load.

```
generate(plan_spec, cycle1_template, now) -> planned microcycles 2..N
reconcile(plan, activities, now)          -> re-projected plan
classify(plan_cycle, activities)          -> Exceeded | Met | Under | Missed
```

- **Volume is per sport** (FR-6.2, INV-20). A plan may target 40 km running and 4 km swimming in
  the same cycle; those progress independently and are never added. Cross-sport load is
  expressed in time.
- Volume steps by `volume_step_bp` (default `RAIL_BP[default_microcycle_days]` — **+10 %, exactly 1000 bp, for a 7-day cycle**, and scaled for any other length; FR-6.5, FR-6.5b).
- **The safety rail is a *daily* rate, not a per-cycle percentage** (FR-6.5a, INV-25). The 10 %
  rule is a per-*week* heuristic; applied flat to a 5-day cycle it ramps ~40 % faster in real time
  than intended, which is precisely the injury the rail exists to prevent. Normalise by
  `length_days` and check against the frozen rail table `RAIL_BP[length_days]` (FR-6.5b). **Get this wrong and the rail silently
  becomes a hazard for anyone using a short microcycle.** Exceeding it requires a conscious
  override with a warning.
- **Block length 2–52 microcycles, microcycle length 1–28 days, deload policy `none` /
  `every_n_microcycles` / `manual`** — all the user's choice (FR-6.1), exactly as in
  [task 005](005-strength-progression-planner.md). Deload cycles, where they exist, scale volume
  by `deload_volume_bp` and drop intensity sessions (FR-6.6).
- **Session types come from the sport profile** (FR-6.3a) — a swim plan offers `technique` and
  `drill`; a running plan does not. Intensity targets render in the sport's own pace unit
  (INV-19).
- Within a microcycle, volume is distributed across sessions by type: the long run takes a defined
  share, easy runs the rest, quality sessions hold duration and increase intensity instead.
- Reconciliation on per-cycle volume (FR-6.7): a cycle well under target **holds** the next one
  rather than compounding the miss onto a base that was never actually run. This is the specific
  behaviour that makes plans survive an illness instead of becoming fiction.
- INV-06 applies unchanged: only `projected` cycles are ever rewritten, and **never by an older
  engine** — `cardio_plan_microcycles` carry `engine_version` and `last_write_kind` and resolve in
  sync exactly as strength microcycles do ([02 §7](../02-architecture.md)).

Shared fixtures, in the same core as the strength engine ([ADR-004](../decisions/ADR-004.md)).

### Persistence and API
- `cardio_plans → cardio_plan_microcycles → planned_cardio_sessions`
  ([03 §7](../03-database-schema.md)), with per-sport targets in `cardio_plan_cycle_targets`.
- CRUD, `generate`, `reconcile`.
- **Activity matching** (FR-6.8): a completed activity auto-matches a planned session on same day
  + same sport; the user can re-match, unmatch, or match across days manually. Auto-matching must
  be conservative — a wrong match corrupts the reconciliation input.

### Interval structures (FR-6.4)
- Editor for the `structure` JSONB tree: warm-up, `repeat` blocks, cool-down.
- Rendered in one readable line: *"10 min WU, 6 × (3 min Z4 / 90 s Z1), 10 min CD"*.
- Total planned duration and distance derived from the structure, not entered twice.
- **Not in v1:** live guided execution of an interval session (audio cues, step advancement).
  It is a genuinely separate feature; the structure is stored so it can be built later.

### UI
- Plan builder: goal, length, start date, cycle-1 template, volume step, deload policy.
- Block view mirroring the mesocycle grid, so both planners feel like one app.
- Today's prescribed session on the home screen, one tap to start recording with the target
  visible during the activity.
- Post-cycle summary: planned versus actual volume, and what changed next cycle and why.

## Acceptance criteria
- [ ] A 12-cycle half-marathon block generates with sane volumes and correctly placed deloads
- [ ] An 18-cycle block with `deload_mode = 'none'` generates 18 cycles and inserts no deload
- [ ] **A 5-day microcycle produces a smaller per-cycle step than a 9-day one**, such that both
      land on the same daily rate (FR-6.5a, INV-25) — the single most important test here
- [ ] No generated cycle exceeds `RAIL_BP[length_days]` over its predecessor, at any cycle length —
      an integer comparison with no tolerance (FR-6.5b)
- [ ] **The default plan passes its own rail at every cycle length from 1 to 28 days**, and the 7-day
      default step is exactly 1000 bp
- [ ] The frozen rail table in the core matches FR-6.5b value for value, and changing it bumps
      `ENGINE_VERSION`
- [ ] A plan mixing running and swimming progresses each sport's volume independently and never
      sums their distances (INV-20)
- [ ] A swim session offers `technique` as a session type and a run session does not (FR-6.3a)
- [ ] A cycle completed at 50 % of target holds the next cycle's volume rather than stepping up
- [ ] An interval structure round-trips through JSONB and renders as the expected one-line summary
- [ ] A recorded run auto-matches the same day's planned session of the same sport, and only that
- [ ] Editing cycle 8 then completing cycle 3 leaves cycle 8 untouched (INV-06, FR-3.14 analogue)
- [ ] Reconciliation is idempotent, verified as in task 005
- [ ] Strength and cardio plans run concurrently without interfering

## Notes and risks
- Resist merging the two engines into one abstraction. They share *shape* (generate, classify,
  reconcile, respect INV-06) but their progression units are genuinely different — per-set load
  versus per-cycle volume. A premature shared abstraction here would make both harder to read. Share
  the fixtures' harness and the cycle-status guard; duplicate the rest.
- Volume distribution across sessions is the part with the most product judgement in it. Start
  simple and explicit — a fixed share per session type — rather than clever.
- Pace targets versus zone targets ([01 § Open questions](../01-business-requirements.md) 4): the
  schema supports both. Confirm which the user actually wants to see on the live screen before
  building the UI for both.

# Task 013 — Gamification

**Depends on:** 005 (needs prescriptions), 007, 011 · **Blocks:** nothing · **Size:** L

## Goal
The progression-track system: XP, levels, achievements, microcycle-based adherence streaks
(INV-25 — never weeks, see §Scope), and a Progress screen that lists **only the tracks this user
has actually earned**.
Implements [08-gamification.md](../08-gamification.md) under
[ADR-005](../decisions/ADR-005.md).

**Depends on task 005 for a structural reason, not a scheduling one:** the scorer takes *the
prescription* as an input (INV-22). Without a planner there is nothing to be adherent to, and any
scoring built before it would necessarily score volume — the one thing this system must not do.

## Scope

### Phase A — the scorer (pure, in the domain core)
```
score(prescription, logs, now)   -> [XpAward]
classify_cycle(microcycle, logs) -> Kept | Missed | Rest | Deload
```
- Pure, deterministic, idempotent (INV-10, INV-21). Lives beside the progression engine and
  obeys the same rules.
- **The function signature is the safety mechanism.** It takes a prescription and cannot see raw
  volume without one, so INV-22 is structurally enforced rather than remembered.
- Award table from [08 §3](../08-gamification.md). Per-day and per-microcycle caps per track.
- **Levels from the frozen threshold table** ([08 §2](../08-gamification.md)) — `level_for(xp,
  level_scale_bp)` in integer arithmetic. The table is a constant in the core and a shared fixture;
  the `12 × (L − 1)^2.7` formula it came from is never evaluated at runtime.
- Shared fixtures, as with the progression engine.

### Phase B — persistence
- Tables from [08 §8](../08-gamification.md) / [03 §7a](../03-database-schema.md).
- `xp_awards` is the source of truth; `user_track_progress` is a **rebuildable cache that does not
  sync** ([03 §11](../03-database-schema.md)) — the ledger replicates, the fold does not. Ship the
  rebuild command with it, exactly as for `personal_records`, and compute it on the device from
  local `xp_awards` rather than pulling it.
- The `UNIQUE (user_id, source_kind, source_id, reason)` constraint is what makes replay safe
  (INV-21). Verify it stops a double award, do not assume it.
- Scoring runs on workout/activity completion and on cycle close, on both client and server —
  idempotence is what lets both run without coordination.
- **Track activation** ([08 §2](../08-gamification.md)): the four quality tracks get a
  `user_track_progress` row at account creation; a discipline track gets one the first time an
  award lands for it. The track is resolved through `sport_profiles.xp_track` — **never a `match`
  on the sport in the scorer** (INV-19). Rebuild must reconstruct *which* tracks exist, not only
  their totals, from `MIN(awarded_at)`.

### Phase C — the surface
- **Progress screen: a list of the user's active tracks and nothing else** — name, level, XP to
  next, and the last award stated as a fact. No figure, no arms, no radial chart
  ([07 §2](../07-brand-and-ui.md), [07 §6](../07-brand-and-ui.md)).
- **A sport the user has never logged has no row and no placeholder**, and there is no way to add
  one by hand. Training is the only thing that creates a track.
- Track detail: level, XP, recent awards with their reasons stated plainly.
- Achievements list, dated, with locked ones visible and honestly described.
- **Adherence streak, in microcycles** (INV-25) — displayed as "7 cycles", not "7 weeks" — with
  the quarterly grace cycle shown as remaining rather than spent.
- Celebration: one damped 600 ms emphasis, a haptic, a plain statement of fact
  ([07 §7](../07-brand-and-ui.md)). **No confetti, no fanfare.**
- The disable switch (FR-8.9): off means gone, not hidden, with no re-enable nagging.

## Acceptance criteria
- [ ] A session logged at **150 % of prescribed volume scores no more than one at 100 %** (INV-22)
- [ ] A prescribed rest day respected awards Recovery XP
- [ ] A **deload microcycle completed as prescribed awards more than three ordinary sessions**
- [ ] Streaks and caps are computed per microcycle, correctly, for a 9-day cycle (INV-25)
- [ ] Re-syncing a workout, editing a set, or re-running the scorer never double-awards (INV-21)
- [ ] Deleting and re-logging a workout does not re-award
- [ ] Back-dating a fabricated month does not farm XP
- [ ] A microcycle whose prescription was rest **keeps** the streak
- [ ] No mechanic anywhere reduces a level or expires XP — verified by the `CHECK (amount >= 0)`
      constraint and by searching the codebase for any subtraction from a track total
- [ ] Turning gamification off removes it entirely, with no prompts to turn it back on
- [ ] Scoring works fully offline and reconciles on sync
- [ ] Nothing in [08 §6](../08-gamification.md)'s ban list exists in the build
- [ ] **A user who only lifts and swims sees exactly six tracks** — Strength, Pool swim and the
      four quality tracks — with **no Ride row, no Run row, and no placeholder for either**
- [ ] Logging a first ride creates the Ride track automatically, with no prompt and no setting
- [ ] A treadmill run and an outdoor run award **different** tracks, resolved through
      `sport_profiles.xp_track` — grep the scorer for a sport name and find nothing (INV-19)
- [ ] Rebuilding `user_track_progress` from `xp_awards` restores the same **set** of tracks, not
      just the same totals
- [ ] `user_track_progress` never crosses the wire — it is absent from both sync payloads, and two
      devices reach identical totals by each folding the ledger they already have
- [ ] A proposed scoring-curve change is replayed over a real ledger and **lowers nobody's level**
      before it ships (INV-22)
- [ ] Python and TypeScript compute the same level for every XP value from 0 to 110 000, at every
      `level_scale_bp` in the fixture set
- [ ] Raising any track's `level_scale_bp` is rejected — it could only ever lower a level (INV-22)

## Notes and risks
- **The ban list ([08 §6](../08-gamification.md)) is a review checklist, not advice.** Every item
  on it is something a reasonable person would add in good faith to improve engagement. That is
  precisely why it is written down.
- Award values are guesses until real use. Tune them by replaying `xp_awards` against a changed
  curve — cheap, because the ledger is the source of truth. Do **not** tune by adding new reward
  categories, which is how a clean value system turns into a slot machine.
- **Do not reintroduce a fixed track grid, and do not show a sport at zero.** Both are natural
  instincts — a grid looks tidier, and a greyed-out Ride row looks like helpful discoverability.
  Both put an unfinished task on the screen of someone who never asked to cycle, which is volume
  pressure arriving through layout instead of scoring ([ADR-005 § Amendment 2](../decisions/ADR-005.md)).
- Watch for the quiet failure: a user who writes themselves a trivially easy plan and farms
  perfect adherence. The answer is weighting by the plan's own progression
  ([ADR-005 § Revisit if](../decisions/ADR-005.md)) — **never** reintroducing volume rewards.

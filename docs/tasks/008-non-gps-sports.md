# Task 008 — Non-GPS Sports: Pool Swim, Treadmill, Indoor Bike

**Depends on:** 007 · **Blocks:** 009 (only for swim plans) · **Size:** M

## Goal
Complete the v1 sport set (FR-4.0c) with the three sports that have no GPS track: **pool swim**,
entered by lengths and sets, plus **treadmill** and **indoor bike**, entered manually.

Pool swim is also the proof that the framework works — it shares almost nothing with running.

Implements [01 §4.2–4.4](../01-business-requirements.md).

> **Indoor row is deferred**, not in this task. Its `/500 m` erg-monitor UX is genuinely
> distinctive work for a sport that has not been asked for. It is a `sport_profiles` row plus one
> entry component whenever it is wanted — which is the whole point of task 007's framework, and
> the segment model in [03 §6](../03-database-schema.md) already accommodates its intervals.

## Why this is a separate task
A pool swim has no GPS, no route, no elevation, no pace-per-kilometre, no auto-pause and no
splits in the running sense. Almost every assumption in [task 007](007-cardio-recording.md) is
false for it. Building it separately, *after* the framework, is what forces the framework to
actually be one — and if this task requires editing task 007's shared components, INV-19 was not
achieved and that is the finding.

## Scope

### 1. Pool swim (FR-4.8–4.13)
- **Setup sheet before starting:** pool length (25 m / 50 m / 25 yd / custom), stored per
  activity because the user's pool changes.
- **Two entry paths, both required:**
  - **Live length counter** — one enormous button, tapped per length or per wall touch, with a
    rest timer between sets.
  - **Post-hoc set entry** — `4 × 100 m freestyle @ 1:45, 20 s rest`, the way a swim set is
    actually written down.
- Per-set fields (FR-4.11): stroke (freestyle / backstroke / breaststroke / butterfly / medley /
  kick / pull / drill), distance, duration, rest, stroke count. Stored as `activity_segments` of
  kind `swim_set`.
- **Derived, never typed:** total distance = `lengths × pool_length_m`; pace per 100 m or per 100 yd
  — **following the pool's unit, not the user's setting** (INV-01), so a 25 yd pool is paced per
  100 yd for a metric user too; **SWOLF** (`seconds per length + strokes per length`) where stroke
  count was entered.
- **Wet-hands UI** (FR-4.13): very large targets, high contrast, no gesture needing precision, no
  small close buttons. Test it with actually wet hands — this is not a figure of speech.
- The detail screen shows a set table, stroke breakdown, per-100 m pace and SWOLF. **No map, no
  elevation chart, no min/km** — enforced by the profile, not by a conditional.

### 2. Treadmill and indoor bike (FR-4.14–4.15, FR-4.17)
- Distance, duration, average speed/pace, incline or resistance, optional watts.
- Simple single-screen manual entry. These are the cheap ones; do them last and quickly.
- Interval entry: `N × (distance or duration, rest)` with per-interval results as
  `activity_segments` of kind `interval` — not one lump total.
- **No GPS track is ever fabricated**, and **no location permission is ever requested**
  (FR-4.17, [05 §1a](../05-integrations.md)).

### 3. Common
- Retroactive entry with a chosen date and time (FR-4.19).
- Sport-specific personal bests (FR-5.2): fastest 100 m / 400 m and best SWOLF for swimming.
- These activities sync like any other; they have no streams and no polyline, and
  `has_track = false` must not be treated as an incomplete upload ([ADR-003](../decisions/ADR-003.md)).

## Acceptance criteria
- [ ] **Building both sports required no edit to task 007's shared live/detail components** — if
      it did, say so explicitly and fix the framework rather than the symptom (INV-19)
- [ ] A pool swim activity displays no map, no elevation and no `min/km` anywhere
- [ ] 20 lengths of a 25 m pool records as exactly 500 m, computed, never typed
- [ ] A 25 yd pool is paced per 100 yd for a **metric** user, and a 25 m pool per 100 m for an
      imperial one
- [ ] SWOLF matches a hand calculation for a known set
- [ ] A swim set entered post-hoc and one counted live produce identical stored rows
- [ ] The live swim counter is operable with wet hands and one thumb — tested, not assumed
- [ ] A manual treadmill activity has `has_track = false`, no polyline, no streams, and syncs
      cleanly
- [ ] Starting a pool swim or a treadmill activity **never triggers a location permission prompt**
- [ ] All six v1 sports (FR-4.0c) are recordable end to end
- [ ] Weekly totals show swim distance and run distance separately and never summed (INV-20)

## Notes and risks
- **The pool-swim UI is the interesting design problem in this task.** Everything else is forms.
  The user is wet, cold, wearing goggles, and has about two seconds at the wall. Prototype the
  length counter first and test it at an actual pool before building the rest.
- Resist making pool swim "a run with a different unit". Every shortcut of that shape leads back
  to a map on a swim screen.
- Stroke count entry is tedious and many swimmers will skip it. SWOLF must degrade to "not
  available" rather than showing a wrong number — same discipline as e1RM without RIR (INV-07).
- Treadmill and indoor bike are close to free once pool swim is done. If schedule pressure
  appears, they are the parts to cut, not the swim.

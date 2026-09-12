# Task 010 — Unified Calendar and Analytics

**Depends on:** 005, 007, 008, 009 · **Blocks:** nothing · **Size:** M

## Goal
Make the two halves one app. Until this task, the strength and cardio sections are two products
sharing a login. Implements [01 §7](../01-business-requirements.md) and the analytics
requirements left over from §2.4 and §5.

## Scope

### Unified calendar (FR-7.1)
- One month/week view showing planned and completed sessions from **both** halves, visually
  distinguished: strength versus cardio, planned versus done versus missed.
- **This is the calendar view** — real dates (INV-25). A strength block on 9-day microcycles and a
  cardio block on 7-day ones will drift against each other and against the calendar, and this
  screen is where that becomes visible and manageable. It is the reason FR-3.3a demands both views
  exist.
- Tap a planned day to start it; tap a completed day to review it.
- Drag a planned session to another day — which is a plan edit, so the row becomes `user_edited`
  and the engine projects from it (FR-3.14 / INV-06).

### Today (FR-7.2)
- The home screen: what is prescribed today from either half, one tap to start. If both, both,
  ordered by the user's preference.
- Nothing else competes for space. This is the screen the app opens to every day.

### Combined load view (FR-7.3)
- A weekly view putting strength volume and cardio volume side by side, so a hard leg day sitting
  the day before a long run is *visible* before it is painful.
- **Cross-modality and cross-sport totals are in time** (INV-20). Distance is shown per sport and
  never summed across sports.
- No fancy unified "training load" score. Honest separate series beat one invented number.

### Analytics
- **Working sets per muscle group, per microcycle** (FR-2.16) — the number that actually drives
  hypertrophy programming, and the one Hevy makes hard to see. Uses `is_counted_set()` (INV-04),
  never a re-implemented filter. A calendar-week view is also offered, **clearly labelled as a
  different question** — "sets this cycle" and "sets this week" are not the same number unless the
  cycle is 7 days (INV-25).
  **Secondary muscles are credited 0.2 of a set** (FR-2.16) by the core's attribution function; the
  SQL returns set–muscle–role rows and never applies the weight itself. Fractional sets display to
  one decimal ("5.6 sets", "5,6 séries"), and per-muscle figures are never summed into a total.
- **RIR trend** (FR-2.17), promoted here from task 005 into a first-class view: average logged RIR
  per exercise per microcycle across the block. Flat RIR across a block means the block is not
  progressing, and the app should say that in words, not just draw a line.
- Plan adherence, strength and cardio (FR-3.17, FR-6.7).
- Cardio weekly/monthly totals and HR zone distribution (FR-5.3, FR-5.4).
- Body weight over time from `body_weight_log`.

### Performance
- The per-microcycle volume-per-muscle query is a four-table join over a date range
  ([03 §9](../03-database-schema.md)). Measure it on-device against a realistic history
  (a year, ~250 workouts, ~15 000 sets) before optimising. If it is genuinely slow, the answer is
  a materialised view refreshed on workout completion — not an ad-hoc denormalisation and not a
  hand-rolled cache.

## Acceptance criteria
- [ ] The calendar shows strength and cardio, planned and completed, in one view
- [ ] Dragging a planned session to another day persists and marks the row `user_edited`
- [ ] The Today screen renders in < 2 s from cold start on local data (NFR-5)
- [ ] Sets per muscle group matches a hand count for a known microcycle — verify by hand once
- [ ] Four counted sets of bench press credit chest **4.0**, triceps **0.8** and front delts **0.8**,
      and a warm-up set credits nothing to any muscle (INV-04)
- [ ] No analytics query contains the 0.2 weight — grep the SQL and find nothing; it exists only in
      the core's attribution function
- [ ] With a 9-day microcycle, "sets this cycle" and "sets this week" show different numbers and
      are labelled so it is obvious why (INV-25)
- [ ] Two concurrent blocks on different cycle lengths render correctly on one calendar
- [ ] Warm-up and deload sets are excluded exactly where the invariants say (INV-04, INV-08)
- [ ] Every analytics query runs against local SQLite and works offline
- [ ] Analytics over a year of seeded history renders without a visible stall

## Notes and risks
- The temptation here is to build many charts. Resist it. Three numbers the user will actually
  act on — sets per muscle per cycle, RIR trend, cardio volume per cycle — beat a dashboard nobody
  reads. Everything else can wait until it is asked for.
- Every aggregate must go through the shared domain predicates. An analytics screen that
  re-implements "which sets count" will eventually disagree with the workout screen, and then
  neither can be trusted.
- This task is where the product either feels like one app or does not. Budget design time for
  the calendar and the Today screen specifically; they are the two screens seen most often.

---

## After 010

Not tasks yet, listed so they are not forgotten. Order is a guess; revisit once the app has been
used for a real block.

- **HealthKit / Health Connect** ([05 §7](../05-integrations.md)) — cheapest way to feel native.
- **BLE heart rate** ([05 §2](../05-integrations.md)).
- **Guided interval execution** — audio cues and step advancement (task 009 § Not in v1).
- **More sports** — each is a `sport_profiles` row plus an entry component (INV-19), which is the
  whole point of task 007's framework.
- **Strava import** ([05 §8](../05-integrations.md)) — after GPX export exists.
- Watch companions, plate calculator, warm-up set generator, exercise demo media.

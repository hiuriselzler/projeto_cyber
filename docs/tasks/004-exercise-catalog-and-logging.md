# Task 004 — Exercise Catalog and Workout Logging

**Depends on:** 002 · **Blocks:** 005, 009 · **Size:** XL

> Renamed from `004-team-selection.md`, which belonged to an unrelated project.

## Goal
The first genuinely usable version of the app: start a workout, log sets with weight, reps and
**RIR**, finish, and see the history. Local only — no sync yet (that is task 006). Thanks to
[ADR-001](../decisions/ADR-001.md) the entire strength half can be built and used against SQLite
before the server is involved, and that is the fastest route to something worth using tomorrow.

This is the core loop. It deserves more care than any other UI in the project.

## Scope

**Catalog (FR-2.1–2.4)**
- Seed the local catalog from the JSON asset on first launch.
- Browse, search, filter by muscle and modality. **Search matches the translated name *and* the
  English one** ([ADR-008](../decisions/ADR-008.md)) — Brazilian gyms mix the two freely, so a
  pt-BR user typing either *supino* or *bench* must find the exercise.
- Global exercises display through their translation key; user exercises display exactly as typed,
  never translated (INV-27).
- Create, edit, archive custom exercises. Editing a global exercise **forks** it into a user copy
  (`forked_from_id`), never mutates the global row.
- **What a fork is named** *(decided 2026-09-19)*. ADR-008 says the translated name is copied into the
  fork; this task settles which translation and what a collision does. The name copied is the one in
  **the UI language at the moment of forking** — what the user was looking at when they chose to edit
  — and from then on it is user content, shown exactly as stored and never re-translated (INV-27).
  Forking a global the user has **already** forked reuses that fork rather than making a second one.
  A name colliding with one of the user's own live exercises — the `exercises_owner_name_key` unique
  index on `lower(name)` — is a **validation error on the field the user is already editing**, never
  an auto-suffix: `(2)` is a name nobody typed.
- Archive never deletes; historical sets keep resolving (INV-11).

**Routines (FR-2.5–2.7)**
- Build, edit, reorder, duplicate, folder-organise.
- Supersets via `superset_group`.
- Start-from-routine pre-fills targets and last-used weights.

**Live workout (FR-2.8–2.13) — the heart of it**
- Add/remove/reorder exercises and sets mid-session.
- **The set row.** One line: `[weight] [reps] [RIR] [✓]`, with last time's performance behind it
  ("40 kg × 6 @2"). Custom numeric keypad that does not cover the row being edited. Tapping ✓
  advances focus to the next set.
- **RIR entry is a chip row `0 1 2 3 4 5+`, never a keyboard** (FR-2.10). One tap. Optional —
  skipping it stores NULL, not 0 (INV-03).
- **`5+` opens a second row, `5 6 7 8 9 10`** *(open question 9, decided 2026-09-19)*. It stores
  nothing by itself: the value stored is whichever chip the user then taps. The common case — RIR 0–5
  — stays one tap; the schema's full `0..10` range (INV-03) stays reachable in two; and no number the
  user did not choose is ever written, which is the same rule as a blank chip storing NULL.
- Set types: warmup / working / drop / backoff / amrap, changed by long-press or swipe.
- Rest timer auto-starts on ✓, with haptics and a local notification on completion.
- Notes per exercise and per workout; perceived fatigue on finish.
- **Every mutation writes to SQLite immediately** (INV-09, NFR-2 < 100 ms). No React state holds
  the only copy of anything.
- Retroactive logging with a chosen date/time (FR-2.13).

**History and PRs (FR-2.14–2.15)**
- Workout list, workout detail.
- Per-exercise history and charts: top-set weight, e1RM, total volume.
- e1RM from the one canonical formula (INV-07), implemented **once in `core-rs/src/strength/`** and
  reached through the bindings — `src/domain/` on the client, `app/domain/` on the server, both
  marshalling only ([ADR-004](../decisions/ADR-004.md) § Outcome, [02 §3](../02-architecture.md)). The
  shared fixture stays, now proving the two bindings agree rather than policing two implementations.
  Includes **bodyweight exercises**, where the load is body weight on or before the set's date plus
  added load (FR-2.15a).
- PR detection on finish, with a celebration. Warm-ups excluded (INV-04); deload cycles excluded
  (INV-08) — the deload check is a no-op until task 005 but wire the predicate now.
- `is_counted_set()` implemented **once**, in `core-rs/src/strength/` beside e1RM, and used by every
  total on every screen (INV-04). Never re-expressed as a `set_type` filter in a query or a chart.

**API** — the mirror endpoints (`exercises/`, `routines/`, `workouts/`) so task 006 has something
to sync against. Built server-side in this task, wired to the client in 006.

## Stages

> **Written down 2026-09-21, four stages late.** Stages 0–3 were built against a plan that lived only in
> the conversation that made it: PROJECT-STATUS cites "stage 4", "stage 5's" and "the stage-8 checks",
> and nothing in `docs/` ever said what they were. `.agents/AGENTS.md` makes `docs/` the source of
> truth, so the decomposition of the project's largest task belongs here. **Stages 0–3 are a record**,
> reconstructed from what each stage wrote about itself; **stages 4–8 are a plan** and may be
> re-cut, in this file, when a stage learns something.

Each stage ends green on what CI runs, and the stages that build a screen end on the phone as well
— a stage-3 lesson worth keeping: three of its defects were invisible to `tsc`, `eslint` and 597
Jest tests, and none was findable without a device.

| # | What it lands | State |
|---|---|---|
| **0** | The docs catch up with [ADR-004](../decisions/ADR-004.md) — the core is Rust, and `src/domain/` marshals | ☑ 2026-09-19 |
| **1** | `core-rs/src/strength/` gets its first real residents — `e1rm()`, `is_counted_set()`, `volume_kg()` — through both bindings, against the shared fixture | ☑ 2026-09-19 |
| **2** | The catalog seeds itself from the committed `reference.json`, fingerprinted; the bilingual search matcher | ☑ 2026-09-19 |
| **3** | **The set row** and the live workout, every mutation a synchronous SQLite write (INV-09); the minimum exercise picker | ☑ 2026-09-19, device pass part-run |
| **4** | **The catalog screen** — browse, search, filter by muscle and modality; custom exercises; fork-on-edit of a global; archive that never orphans history | ☑ 2026-09-22, device pass not yet run |
| **5a** | Routines — build, edit, reorder, duplicate, folders, archive; supersets; start-from-routine pre-filling last-used weights and carrying the routine's targets and rest | ☑ 2026-09-23, device pass not yet run |
| **5b** | The live session finished off — set types; the rest timer with haptics and its notification; ✓ advancing focus (superset-aware); removing and reordering exercises mid-session; reopening the workout in progress on relaunch | ☑ 2026-09-23, device pass part-run the same evening |
| **5c** | The `duration` and `distance_duration` tracking modes — the set row that logs them, and the create form offering them | ☑ 2026-09-23, device pass not yet run |
| **6** | The finish flow — PR detection and its celebration, perceived fatigue, notes, retroactive logging | ☑ 2026-09-24, device pass run the same evening (TalkBack not) |
| **7** | History and per-exercise charts; `personal_records` as a cache, with its rebuild command | ☑ 2026-09-25, device pass run the same evening (imperial and TalkBack not) |
| **8** | The API mirror endpoints, and the closing device pass over the whole loop | ☑ built 2026-09-25; device pass part-run — the data loss it found fixed and proven on the phone, the owner's checks left to *Closing task 004*, below |

**Stage 4 carries three decisions the catalog screen forces**, recorded in PROJECT-STATUS's decision
log on 2026-09-21 and repeated here because the code reads this file:

- **Archiving a global is local to the device, and is worded as *hiding* it.** `deleted_at` on a row
  whose `owner_user_id` is NULL is a column on a row every user shares, so replicating it would be one
  user putting an exercise away for everybody. It stays a local act until
  [task 006](006-sync-layer.md) decides how a per-user opinion about a shared row travels — an input
  to that task, not a guess made here.
- **Re-forking reuses an archived fork and un-archives it.** The alternative is a uniqueness
  violation on `exercises_owner_name_key` against a row the user cannot see, which is an error message
  about something invisible.
- **The create form offers only the tracking modes the set row can log** — `weight_reps` and
  `reps_only`. `duration` and `distance_duration` are FR-2.3's and stay in the schema; offering them
  before stage 5c's set row handles them would create an exercise the app cannot log.

**Closed 2026-09-22, before the stage's device pass.** Landing the screen surfaced three loose ends,
found by reading the stage against its own code rather than by a new requirement:

- **`listArchivedExercises()` was written, tested at the pure-function level, and never called.**
  The i18n catalogs already carried `catalog.unhide`, `hidden_title`, `hidden_note` and
  `hidden_global_note` with nothing behind them — the exact "written, tested, CI-gated, and never
  called" trap PROJECT-STATUS names from this same task's stage 3. Fixed with a "Hidden" toggle on
  the catalog screen that lists archived rows and unhides them; a hidden global carries
  `hidden_global_note` explaining that hiding it was device-local (FR-2.4, INV-11). A new key,
  `catalog.hidden_empty`, covers the toggle's own empty state.
- **`ExercisePicker`'s own comment admitted search wasn't wired in yet** — *"browse, search and
  filter are stage 4's... plugs in there"*, written in the future tense in stage 3. A real workout
  start scrolled a flat, unfiltered 201-row list. Fixed by reusing `filterCatalog` in the picker, the
  same bilingual matcher the catalog screen uses, so a hidden exercise (already excluded by
  `listExercises`) and a mistyped search both behave identically in both places. The reset-on-close
  is done in the close and pick handlers, not an effect on `visible` — `react-hooks/set-state-in-effect`
  is an error in this project for the reason `Sheet` already paid for, and nothing here needed one.
- **A real typecheck bug**: `catalogFilter.test.ts`'s `CATALOGS` type
  (`Record<string, Record<string, string>>`) does not hold against the real catalogs — the
  `achievement` namespace holds `{name, description}` objects, not flat strings. Loosened to
  `unknown` leaves with a runtime `typeof` check at the lookup, which is what the test actually needs.

Two i18n keys stay intentionally unused for now: `catalog.open` (no nav entry exists yet — the home
screen is a placeholder until [task 010](010-unified-calendar-and-analytics.md)) and
`catalog.field_notes` (no acceptance criterion asks for a notes field on the create form; noted, not
built, to avoid scope creep into stage 5).

**Stage 5 was re-cut on 2026-09-23, before any of it was built**, into 5a, 5b and 5c above. Reading the task against
the code found four things this file promises that no stage owned: ✓ advancing focus (§ Scope, 07 §6 — never built),
removing and reordering exercises mid-session (FR-2.8 — only adding exists), reopening the workout in progress on
relaunch (the force-quit criterion below — relaunch lands on home), and the two tracking modes stage 4 deferred "to
stage 5" when stage 5's row did not mention them. 5c comes before stage 6.

**Stage 5 carries seven decisions**, recorded in PROJECT-STATUS's decision log on 2026-09-23 and repeated here because
the code reads this file:

1. **The live session carries its own rest and targets.** `workout_exercises` gains `rest_seconds`, `target_min_reps`,
   `target_max_reps` and `target_rir` ([03 §4](../03-database-schema.md)), mirroring `routine_exercises` and
   `planned_exercises`. They are **copied** when a workout starts from a routine and editable during the session, so
   editing the routine afterwards never moves a timer that is already running. `rest_seconds` NULL means **no timer** —
   not an invented default: a rest period is the user's number, not the app's.
2. **The running rest timer is derived, not stored.** It ends at the latest completed set's `completed_at` plus its
   exercise's `rest_seconds`, so it survives a force-quit with no state of its own (INV-09). *Skipping* it is the one
   extra fact, and it is device-local — a small record in the key-value store beside the theme override, never synced —
   so a skipped timer does not reappear after a relaunch. `−15 s` and `+15 s` on a running timer change that exercise's
   `rest_seconds` for the rest of the session, which is both what keeps the timer derivable and what a lifter who
   needed longer on this exercise actually meant.
3. **Start-from-routine pre-fills the weight and the reps, never the RIR.** The weight and reps are last time's for
   the same set index (FR-2.7), falling back to last time's nearest *earlier* set — a fourth set after a three-set
   pyramid starts from the third, not the first — and the reps to the routine's `target_min_reps` when there is no last
   time at all. A set takes last time's **type** only from the same index: a warm-up stays a warm-up, and a fallback
   never turns a new set into one. The number of sets is the routine's `target_sets`, else last time's count, else
   one. **RIR stays blank**, and the routine's `target_rir` is shown beside the
   row as a target, not written into it: a RIR the user never looked at, stored and then ticked, is an e1RM input
   they did not choose — the rule that makes `5+` store nothing and a blank chip store NULL (INV-03). FR-2.10's "defaults
   to the target RIR" is scoped to a *plan* and is task 005's to build.
4. **A superset alternates, and rests once per round.** ✓ moves focus to the same set of the next exercise in the group,
   and after the group's last exercise back to the first one's next set. The rest timer starts only after the last
   exercise of a round; ticking an earlier one moves straight on (FR-2.6).
5. **A set's type is changed from a visible control.** The task's own "long-press or swipe" meets
   [07 §5](../07-brand-and-ui.md)'s rule against hidden-only actions, so the set number is a button that opens a
   set-type sheet, and long-press is a shortcut to the same sheet. No swipe. A non-working set shows a letter in place of
   its number — `W`, `D`, `B`, `A` — and says its type aloud, so the type is never colour alone (INV-24).
6. **Notification permission is asked at the first rest timer**, never at launch. Refused, the timer still runs on
   screen with its haptic, and the app does not ask again.
7. **The re-cut above.**

**Stage 5c carries seven decisions** *(2026-09-23, before the code)*, closing two gaps the stage 5 device pass found — the
✓ completing an empty set, and 15 seeded time and distance exercises logged as weight × reps:

1. **Each tracking mode has its own row** (FR-2.3). `weight_reps`: weight × reps, RIR. `reps_only`: reps, RIR — no
   weight field. `duration`: time, **no RIR** — reps in reserve is undefined for a hold, so it stays NULL (INV-03).
   `distance_duration`: weight · distance · time, no RIR — the load is what a carry progresses. A weighted plank is a
   `weight_reps` exercise of the user's own, not a fifth mode.
2. **A time is typed on the app's keypad, filling from the right** — `1`, `3`, `0` reads **1:30** — and stored as
   seconds. A live hold stopwatch is a later nicety, not 5c.
3. **`set_logs.distance_m` holds decimals** — `numeric(9,3)` on the server, `real` on the device ([03 §4](../03-database-schema.md)).
   As an integer, 100 ft typed became 30.48 m, stored 30, read back **98 ft**: the class of defect INV-02's precision
   work fixed for pounds, arriving through distance. Short distances show in m or **ft** (ADR-008's m/ft pairing); whether
   US lifters want yards for sleds is for the imperial review.
4. **The ✓ does not complete a row missing its tracking mode's required field** — reps for the two rep modes, time for
   `duration`, distance for `distance_duration`; weight is never required, because blank is bodyweight or "not
   recorded". It opens the keypad on the missing field instead: one tap to the fix, no error. The rule is 03 §4's
   "enforced in the service layer" — a pure predicate in `src/db`, and the API's in stage 8.
5. **Routines**: the targets sheet hides the rep range for a time or distance exercise (sets and rest still apply). No
   target-time or target-distance column is added — an open question, not 5c. A routine start pre-fills last time's
   time and distance by the same nearest-earlier rule as weight and reps.
6. **The create form offers all four modes**, ending stage 4's deferral.
7. **Records and charts for time and distance are not 5c's.** A plank set counts as a set (INV-04's predicate is type
   and completion) with zero tonnage and no PR; "longest hold" or "farthest carry" would be new PR kinds, and that is an
   open question for stages 6–7. *(Corrected 2026-09-24: a **loaded** carry does take a heaviest-weight record — the
   core's rule asks only for a load. Found on the phone and kept by decision; open question 15.)*

**Stage 6 carries nine decisions** *(2026-09-24, before the code)*, recorded in PROJECT-STATUS's decision log:

1. **The previous bests are folded in the core.** `detect_prs` takes an exercise's standing bests as an argument, and
   working them out from history is PR logic: it applies INV-04 and INV-08 exactly as detection does. Written in
   TypeScript it would be the second copy INV-04 forbids, so it is `personal_bests(sessions)` in
   `core-rs/src/strength/prs.rs`, beside `detect_prs`, through both bindings and a shared fixture. Each session is one
   workout's sets of one exercise, because a session-volume best belongs to a session. The server's `personal_records`
   rebuild (stage 7) is the same function.
2. **A record is the current best.** A finished workout is judged against **every other finished workout** of that
   exercise, whatever its date: not the open one, not an archived one, not itself. A past workout that beat everything
   before it but not what came after is not celebrated. It *was* a record, but celebrating a number that is not the
   best today would be telling the user something false. This is the same question `personal_records` answers on the
   server, where only the current best is kept (03 §4).
3. **Records are recomputed from the rows every time the summary opens, and never stored on the device** (03 §8). A
   force-quit loses nothing, and reopening shows the same records, because a tie is not a record (INV-10). The two
   resolved inputs are resolved per set by `src/db`: **body weight** is the latest `body_weight_log` entry on or before
   the workout's `local_date` (INV-07, INV-17), and **`is_deload`** is the flag of the microcycle its
   `planned_session_id` belongs to. It is always false until task 005, but it is a real query now, not a constant.
4. **A past workout** (FR-2.13). The empty workout screen offers *Log a past workout* beside *Start a workout*, which
   asks for a day and a start and end time. The times start blank and are required, the end must be after the start
   and not in the future, and the day steps back from today. It opens the ordinary live screen, so every part of the
   set row works unchanged. While it is open:
   - `local_date` comes from the chosen start, and `tz` is the zone the device is in as it is recorded (INV-17).
   - The chosen end is kept **on the device**, in the key-value store beside a skipped rest. That is safe because an
     open workout is never synced (task 006), and it keeps the schema unchanged.
   - A ✓ stamps `completed_at` with the chosen end, which is the honest upper bound on when the set was done. It stamps
     `updated_at` with the **real** time, because last-write-wins sync compares `updated_at` (NFR-4). A backdated one
     would lose to any stale copy.
   - **No rest timer runs, and no notification is scheduled**: nobody is resting for a set done yesterday.
   - Finishing writes the chosen end as `ended_at` and forgets the device-local record.
   - It is refused while another workout is open, exactly as a routine start is.
5. **Perceived fatigue** is a chip row `1`–`10` in the finish sheet. It is optional, tapping the chosen chip again
   clears it, and blank stores NULL, never 0. Each tap is written as it happens (INV-09). The sheet says what it is for:
   the user's own history. **It never reaches the core**: `LoggedSet` has no field for it, which is INV-03's structural
   guard, and nothing in this stage widens it.
6. **Notes**: the workout's in the finish sheet, each exercise's in its options sheet. They are written on every
   change, not held in the field (INV-09), and stored exactly as typed. A note that is empty or only whitespace is
   stored as NULL rather than as an empty string. They are never translated (INV-27).
7. **Finishing never deletes or blocks on an unticked set.** The finish sheet counts them ("2 sets not ticked"), and
   they stay as they are, counting for nothing (INV-04), because deleting a row the user did not ask to delete breaks
   INV-11's spirit. **With nothing ticked at all**, the sheet offers *Discard this workout* instead of *Finish*:
   discarding sets `deleted_at` and `ended_at`, so an empty session never becomes somebody's "last time".
8. **The celebration is a summary screen**, reached by finishing. It shows the counted sets and the volume (through the
   core, INV-04), then each record stated as a fact: "Heaviest weight · Bench press · 110 kg". *(Grouped by exercise
   since 2026-09-24 — the name once, its records beneath it; a first session set four per exercise.)* There is **one** 600 ms
   emphasis for the whole list and **one** haptic, a static state under reduce motion, and no confetti, fanfare or
   count-up (07 §7, 08 §6). With no records it says so plainly and shows the totals. Time and distance records are still
   open question 15.
9. **"Last time" needs a completed set** (FR-2.12). `readPreviousPerformance` took the most recent workout that
   *contained* the exercise, so a discarded or abandoned one hid the real last time behind an empty hint. It now takes
   the most recent **finished** workout with at least one **completed** set of that exercise.

**Stage 7 — proposed 2026-09-24, planned 2026-09-25.** What it builds:

- *The screens.* A workout list (finished workouts, newest first, with date, counted sets and volume); a workout
  detail (every set as logged — warm-ups included and marked — with notes, fatigue and the records it still holds under
  stage 6's decision 2); a per-exercise history (its sessions, and three charts: top-set weight, e1RM, volume, by date).
  On the server, a user-scoped `personal_records` repository and a rebuild service folding `personal_bests()` per
  exercise, tested against real Postgres.
- *The core gains `session_metrics()`* in `core-rs/src/strength/` — per session: top load, best e1RM, volume, counted
  sets. "Top set" and "best e1RM of a session" are aggregations over what counts (INV-04, INV-07), so they are the core's,
  through both bindings and a shared fixture, and the bindings are regenerated in WSL2 again (06 §1). A blank RIR is a
  gap in the e1RM chart, never a zero.
- *The acceptance criteria it should close:* warm-ups appear in the log; RIR blank never read as 0 by a chart; an
  exercise archived after use still displays its history; the imperial round trip end to end.
- *Every screen reads through `useDatabaseRead`* — the compiler-proof pattern — and reads per exercise and per page.

**Stage 7 carries six decisions** *(2026-09-25, before the code — the owner took each recommendation)*, recorded in
PROJECT-STATUS's decision log:

1. **Charts are drawn with `react-native-svg`**, already a dependency, by one `LineChart` in `src/ui/`. `victory-native`
   (02 §4 until now) meant two native dependencies on Skia, a fresh APK and a larger bundle for three charts. A chart plots
   by `local_date` (INV-17, INV-25 — no week buckets), a missing value is a gap and never a zero (INV-03, INV-07), and
   every chart carries a text summary so it is never the only way to read its numbers (INV-24).
2. **The rebuild is one user at a time** — a service, and `python -m app.jobs.rebuild_records <user-id>` (06 §5).
   Rebuilding every user needs a new unscoped function on ADR-011's allowlist, and buys nothing until the server holds
   sets (stage 8, task 006).
3. **Where history is reached.** The release home is blank until task 010, so: a history entry on the development
   build's diagnostics screen, a link from the finish summary to that workout's detail, and from each exercise in a
   workout's detail to that exercise's history.
4. **`personal_records` keeps one reps record per load.** Its key was `UNIQUE (user_id, exercise_id, kind)`, which can
   hold `max_reps_at_weight` for one load only, while the core keeps one per load. Now two partial unique indexes — one row
   per kind for the other three, one per load for reps — and a CHECK that a reps record names its load (03 §4, migration
   `0007`). The device has no such table and is unaffected.
5. **The core says where a standing record came from.** The table needs `achieved_at`, `set_log_id` and `workout_id`, and
   `personal_bests()` returns values only. `standing_records(sessions)` is the same fold returning each standing best with
   the session and set that set it, and `personal_bests` becomes its projection, so the two cannot disagree. Sessions go in
   oldest first and a tie keeps the earliest, so the server credits whoever got there first. **The workout detail does not
   use it**: it names the records a workout holds the way the summary does — against every other finished workout,
   strictly — so reopening an old workout says what its summary would say today, and a record since tied or beaten is not
   named (stage 6, decision 2).
6. **Open question 15 stays open, moved to task 010.** Longest hold and farthest carry would be new record kinds — an enum
   migration, core kinds, the summary. Here a `duration` or `distance_duration` exercise's history lists each session's
   time and distance, with no chart and no record.

**The core also gains `session_metrics(sessions)`**: per session, the top load, the best e1RM, the volume and the counted
sets — each over what counts (INV-04) and in one crossing of the boundary per exercise. Deload sets are charted normally
(INV-08 excludes them from records only).

**Stage 8 — proposed 2026-09-25, planned the same day.** The proposal below is kept as written; the decisions as taken
follow it, three of them adjusted by reading the proposal against 02 §7, 03 §11 and the code.

- *What exists.* `/api/v1/workouts` has `POST` (idempotent by the client's id) and `GET /{id}` for the workout row only,
  from task 003. There is no `exercises/` or `routines/` route. The models, RLS policies and the scoped repository base
  exist for every table (task 002–003); the records rebuild exists (stage 7).
- *What it should build.* The mirror endpoints [02 §5](../02-architecture.md) lists for `exercises/`, `routines/` and
  `workouts/`, so task 006 has something to sync against. 02 §5 says sync is the primary write path and these exist for
  correctness and future clients, so they stay small. Every write is idempotent by the client's id (INV-16), scoped
  (INV-15) and answers 404 for someone else's row. The OpenAPI export and `packages/shared` types are regenerated, which
  CI's *Shared types are current* job checks.
- *The acceptance criteria it should close:* **a full workout in airplane mode**, **the 5-exercise, 20-set workout in
  under 30 taps beyond the weights**, **the imperial round trip**, **archiving leaves history displayable** (the device
  half), and the open device items: TalkBack (stages 3, 5, 6 and 7), ✓ latency under a ticking rest bar, stage 4's
  accessibility and font-scale pass.

1. **The shape of the workout write.** Recommended: **`PUT /workouts/{id}` takes the whole aggregate** — the workout, its
   exercise entries and their sets — as one document, applied in one transaction. A set cannot be valid apart from its
   exercise's tracking mode, a finished workout is the unit task 006 syncs ("never sync a workout while `ended_at IS
   NULL`"), and one document is one idempotent retry. The alternative, per-row `POST`/`PATCH` for sets, triples the
   routes for a path the app will not use.
2. **Where "a completed set has its mode's fields" lives.** Stage 5c decision 4 put `missingForCompletion` in `src/db`
   and promised "the API's in stage 8". A second copy in Python is the drift ADR-004 exists to prevent. Recommended:
   **move the predicate into `core-rs/src/strength/`**, with a shared fixture, and call it from both sides; the bindings
   are regenerated in WSL2 as in stages 6 and 7. The alternative is two copies policed by one fixture.
3. **Globals on the server.** Stage 4 decided hiding a global is device-local, and a fork is a user row. Recommended: the
   API **lists globals and the user's own rows, and refuses any write to a global** as a 404, as if it were someone
   else's. A fork arrives as an ordinary create with `forked_from_id`.
4. **When the records cache is rebuilt.** Recommended: **in the same transaction as a workout write that finishes or
   changes a finished workout**, rebuilding that user (stage 7's service), so the cache is never stale by construction.
   The command stays as the repair. The alternative, rebuilding only by hand, leaves a table that is wrong until someone
   notices.
5. **How the imperial pass runs without touching the phone's database.** `updateAccount` in `src/account/flows.ts`
   `PATCH`es `unit_system` and is tested, but **no screen calls it** — the "written, tested, never called" trap again,
   and the reason stage 7's imperial pass was skipped. Recommended: **a unit-system and language switch on the
   development build's diagnostics screen**, calling `updateAccount` against the local API (Docker up, `adb reverse
   tcp:8000`). The product's own settings screen is not in any task yet — worth an open question in PROJECT-STATUS.

The closing device pass needs the local stack up, which stage 7 showed takes Docker Desktop started first (06 §1).

**Stage 8 carries six decisions** *(2026-09-25, before the code — the owner took each recommendation, adjustments
included)*, recorded in PROJECT-STATUS's decision log:

1. **Every write is a `PUT` of the whole aggregate, applied as an upsert.** `PUT /exercises/{id}` (with its secondary
   muscles), `PUT /routines/{id}` (with its exercises) and `PUT /workouts/{id}` (with its exercises and their sets), each
   in one transaction. *Adjusted:* `workout_exercises`, `set_logs` and `routine_exercises` are sync roots in their own
   right (03 §11), and 02 §7 says a set present on either side is never dropped — so **a row absent from the document is
   left as it is**, and removal travels as `deleted_at` (INV-11). Each row resolves by 02 §7's rule, the newer
   `updated_at` winning and a tie or an older one changing nothing, on **the client's** timestamps: stage 6 made
   `updated_at` the real moment of the write, and a server clock would overwrite that fact. A child cannot move to
   another parent. `POST /workouts` (task 003) is retired in favour of the `PUT` — nothing in the app called it — and its
   two proofs, ownership and the deleted account's `401`, move onto the `PUT`.
2. **"A completed set has its mode's fields" lives in the core**, as `missing_for_completion` in `core-rs/src/strength/`,
   with a shared fixture, called by `src/domain/` on the phone and by the workout service on the server. `src/db` loses
   its copy. The server answers `422` naming the field.
3. **Globals on the server.** `GET /exercises` lists the global catalog and the user's own rows; a fork is an ordinary
   create with `forked_from_id`. *Adjusted:* a write to a global answers **`409 id_unavailable`** — the answer a `PUT` to
   someone else's id already gets, since it collides on a key the user cannot see — so a global and a stranger's row are
   indistinguishable, which is what "as if it were someone else's" means for a write. Reads of someone else's row stay
   `404`. Hiding a global stays device-local (stage 4) and has no server form.
4. **The records cache is rebuilt in the same transaction as a workout write** that finishes a workout or changes a
   finished one. *Adjusted:* only **the exercises that write touches**, before and after it — records are per exercise,
   and a whole-history fold on every `PUT` grows with the user's history. The user's writes are serialised by a
   transaction-level advisory lock, because the rebuild deletes and re-inserts and two concurrent finishes would
   otherwise collide on `personal_records`' unique indexes. `python -m app.jobs.rebuild_records` stays as the repair.
5. **The imperial pass runs from a unit-system and language switch on the diagnostics screen**, calling `updateAccount`
   against the local API. The product's settings screen stays open question 19.
6. **Out of scope:** history, record and analytics reads on the server (the app reads its own SQLite, ADR-001), and
   `sync/` (task 006). Lists are keyset-paged, newest first.

**Built in this order:** 8a the core predicate, bindings regenerated in WSL2 · 8b exercises · 8c routines · 8d workouts
and the in-transaction rebuild · 8e the OpenAPI export, shared types and docs · 8f the diagnostics switch · 8g the closing
device pass, then PR #17 marked ready. **8a–8f built and 8g part-run on 2026-09-25** (`706005e`, `21b6c71`, `ed121e7`;
CI green on all five jobs at `ed121e7`); the pass found the sign-out data loss recorded below, fixed the same evening.

**Closing task 004 — proposed 2026-09-25, planned the same day** (its five decisions follow the proposal). Everything left is a check, a tick or a deferral: no stage 9 of
code. Written at the end of stage 8's session so the next one starts from here.

- *What is left.* Three acceptance criteria are open — the airplane-mode workout, the weighted pull-up, the 30 taps — and
  the device list's TalkBack items (stages 3, 5, 6, 7), the 200 % check in pounds, stage 4's accessibility and font-scale
  pass, the rest notification's timing, and ✓ latency under a ticking rest bar. The phone is signed in to the throwaway
  account `stage8-device@example.com` on the local API (the test suite's password), holding one finished imperial
  workout; its own history was lost (below). Stage 8's device section lists what ran.
- *What only the owner can do, at the phone:* TalkBack switched on, airplane mode, the tap count with real hands, and
  the 200 % font in pounds. The next session prepares each — routines to start from, data predicted from the pulled
  database — and reads the database back after.
- *When it is done:* every criterion below ticked or explicitly deferred with a reason, PROJECT-STATUS's task 004 box
  ticked, and PR #17 marked ready for the owner to merge.

Five decisions are the owner's before the pass, each with a recommendation:

1. **The weighted pull-up.** Nothing in the app writes a body weight (open question 18), so the phone cannot show it.
   The arithmetic is proven where it lives: `test_the_case_task_004_names` gives 123.3 kg and NULL with no body weight,
   and `test_personal_records.py` proves the body weight read is the one on the workout's day, not today's.
   Recommended: **tick it on those proofs**, saying the device half waits for open question 18.
2. **The rest notification "on time".** One clean sample was ~39 s late, and whether to ask for
   `SCHEDULE_EXACT_ALARM` is already open question 13, decided before launch. Recommended: **defer the criterion to open
   question 13** — arrival is proven, timing is a launch decision, not task 004's.
3. **✓ latency under a ticking rest bar.** "Measure, do not assume": the stage-3 number came from a synthetic session.
   Recommended: **a development-only timer around the ✓'s write and re-read in the live screen**, logged to the console
   and read from logcat over ~20 real ticks with the bar running — a few lines behind `__DEV__`, no product change.
4. **`Sheet`'s lost exit animation and the ✓'s missing accessible name.** Neither is one of this task's criteria, and
   the second is the TalkBack pass's to settle. Recommended: **settle the ✓'s name in the TalkBack pass; move the exit
   animation to PROJECT-STATUS § Gaps** as a design-system follow-up, so it neither blocks task 004 nor gets lost.
5. **The 30-tap count's workout.** A 5-exercise, 20-set session needs something to start from. Recommended: **a routine
   of five exercises × four sets, built on the phone beforehand** so the count measures logging, not setup — taps counted
   from *Iniciar* to *Finalizar*, weights excluded as the criterion says.

**Closing carries five decisions** *(2026-09-25, before the pass — the owner took each recommendation)*, recorded in
PROJECT-STATUS's decision log:

1. **The weighted pull-up is ticked on its proofs.** The core's `test_the_case_task_004_names` gives 123.3 kg, a
   different e1RM for a different body weight, and NULL with none; the server's rebuild (`test_personal_records.py`)
   weighs a pull-up at 70 kg — the entry on or before its workout's day — while today's is 80; and the device's query
   is pinned to `measured_on <= local_date` (`qualified.test.ts`). **The device half waits for open question 18**:
   nothing in the app writes a body weight.
2. **The rest notification's timing moves to open question 13.** Arrival with the screen off is proven; whether to ask
   for `SCHEDULE_EXACT_ALARM` is a launch decision, not task 004's.
3. **✓ latency is measured by a development-only timer on the live screen** around the ✓'s write and re-read, and to
   the next frame after it — an approximation of React's commit, not the paint. Logged under `__DEV__` and read from
   logcat over ~20 real ticks with the rest bar running. It stays in the code, so the number can be taken again when
   task 005 puts plan work on the same path.
4. **The ✓'s accessible name is the TalkBack pass's to settle; `Sheet`'s exit animation moves to PROJECT-STATUS §
   Gaps.** The development client's *Tools* button and the console error on signing out are development-only and are
   closed with no action.
5. **The 30 taps are counted on a routine of five exercises × four sets**, built on the phone beforehand, from
   *Iniciar* to *Finalizar*, weights excluded.

## Acceptance criteria
- [ ] A full workout can be logged start to finish in airplane mode. *(Stage 3 logged one set start to finish with
      no network involved, but airplane mode itself was not switched on, and "full" means routines, set types and
      the finish flow, which are stages 5–6 in the table above.)*
- [x] Force-quitting mid-workout and reopening restores the exact state, including the set in
      progress and the running rest timer (INV-09). *(Stage 3: the **state** survives a force-stop and comes back
      exactly — see the device list. **Stage 5b built the rest of it** (2026-09-23): a cold start with a workout open
      lands in it, and the rest timer is derived from the rows, so there is nothing of it to lose. **On the phone the same
      evening**: ticked at 21:00:37 with a 2:00 rest, force-stopped, cold-started, and the bar read 1:43 at 21:00:54 — the
      stage 5 device list. Stage 6's pass added a note surviving a force-stop with the finish sheet open. Ticked
      2026-09-24, when this note was found still saying "not yet on the phone")*
- [x] Tapping ✓ renders in < 100 ms on a mid-range Android device (measure, do not assume) —
      **p50 10.5 ms, p95 12.4 ms, worst 20.1 ms** on a Galaxy S21 FE, 2026-09-19, for the write and the re-read
- [x] RIR left blank stores NULL; a chart or total never treats it as 0. *(Storage half proven on the device — a
      blank row reads "RIR não registrado" and `5+` writes nothing. **Chart half on the phone, stage 7 (2026-09-25):** the
      bench press's e1RM chart runs 80 → 82,3 → 83,3 and stops at "Treino A", whose sets have no RIR, with the note saying
      why — no point at zero; its top-set and volume charts carry that session normally)*
- [x] Warm-up sets appear in the log but are excluded from volume, PRs and set counts. *(Stage 6, on the phone: a 100 kg
      warm-up before a 62,5 kg working set celebrated nothing, and the summary counted 1 set and 500 kg. **Stage 7, on the
      phone:** the same warm-up appears in the workout's detail and the exercise's history as "Aq · Aquecimento", while
      the list counts that workout as 1 set and 500 kg and the top-set chart reads 62,5 kg, not 100)*
- [x] Archiving an exercise leaves every historical set intact and displayable. *(Stage 7: the exercise history reads
      through an archived exercise and says it is hidden — in Jest (`historyScreens.test.tsx`) and by construction,
      `readExercise` and `readExerciseSessions` not filtering on `deleted_at`. **On the phone, stage 8 (2026-09-25):** the
      bench press hidden from the catalog took `deleted_at`; the finished workout's detail still showed "100 lb × 5
      repetições" and its three records, and *Histórico deste exercício* opened with "Oculto do seletor de exercícios. O
      histórico dele continua como estava.", both charts and the session listed)*
- [x] The e1RM fixture produces identical results in Python and TypeScript — Rust and Python run the shared fixtures;
      the TypeScript half runs through the same core on the phone, where stage 6's finishes showed exactly the e1RMs
      Epley gives — 80 kg for 60 × 8 @ 2, 83,33 kg for 62,5 × 8 @ 2 — and none past 12 effective reps (2026-09-24)
- [x] A weighted pull-up at body weight 80 kg + 20 kg × 5 @ RIR 2 has an e1RM of **123.3 kg**
      (100 kg × (1 + 7/30)); logging a new body weight a week later leaves that e1RM unchanged; and with
      no body weight logged by the set's date, its e1RM is NULL. *(Ticked 2026-09-25 on its proofs, closing decision
      1: the core's `test_the_case_task_004_names`, the server's `test_personal_records.py` weighing a pull-up at the
      body weight on its own day and not today's, and the device's `measured_on <= local_date` in `qualified.test.ts`.
      **The device half waits for open question 18** — nothing in the app writes a body weight yet)*
- [x] A pt-BR user finds the bench press by typing either *supino* or *bench* — proven against the **real**
      `en.json`/`pt-BR.json` catalogs in `catalogFilter.test.ts`, 2026-09-22, not a stub catalog
- [x] A custom exercise named in Portuguese appears exactly as typed in an English UI — same suite, same date;
      "Supino do João" is never translated and a global still reads in whichever language is on screen
- [x] An imperial user logs and reads pounds end to end, and the stored `weight_kg` round-trips to
      exactly the lb value they entered. *(On the phone, stage 8, 2026-09-25: switched to imperial through the
      diagnostics switch's `PATCH /auth/me`; **100** typed on the keypad stored `weight_kg` **45.359237** — 100.0 lb
      exactly — and read back as "100 lb × 5" on the row, "500 lb" of volume and records of 100 lb in the summary, the
      same in the workout's detail, and charts with lb axes. The API keeps four places, 45.3592, which reads 100.0 lb at
      display precision — `test_strength_api.py`)*
- [ ] Logging a 5-exercise, 20-set workout takes fewer than 30 taps beyond the weights themselves

**On a physical device** *(moved from [task 017](017-local-toolchain-device-spike.md) on 2026-09-16 — each needs the
set-logging UI this task builds; `SetRow` and `NumericKeypad` existed from task 011 but no route rendered either)*

> **First device pass run 2026-09-19**, stage 3, on a **Galaxy S21 FE (SM-G990E), Android 16, device locale pt-BR,
> metric, dark theme, font scale 0.86**. What is ticked below was observed on that phone; what is not was not run.
- [ ] The set row in Portuguese, **in pounds**, at 200 % system font size keeps every value readable and every
      control usable — reflowed, never truncated *(absorbs this task's earlier 200 %-font criterion)*.
      **The 200 % half is run and passes** (2026-09-21): at scale 2.0 in pt-BR the row reflows to two lines,
      `1 40 kg × 6` over `RIR 7`, with the ✓ anchored beside them at full size — nothing truncated, every target
      still 56 dp. **The imperial half is not run**: units come from the signed-in account and the API is not
      running locally, so an imperial pass needs either the stack up or the cached `users` row flipped
- [x] The numeric keypad never covers the set row it is editing, on a short screen as well as a tall one —
      *tall screen: row at y 479–683, keypad from y 1282 on a 2340 px screen.* **Short screen run 2026-09-21 at
      1080×1600, and it failed: the keypad covered the edited row completely**, only the row's top border showing.
      The cause was not the reveal geometry, which was right, but a `ScrollView` clamp — with one exercise logged the
      content is barely taller than the viewport, so `scrollTo` clamped to about zero and the row never moved.
      **Fixed** by reserving the keypad's height as list padding while editing; the edited field is now fully visible
      above the keypad. *A two-line row is still clipped on its second line* — see the 07 §6 open question, which
      decides this too: a one-line 56 dp row clears with room over, a wrapped ~124 dp row cannot on a 1600 px screen
- [x] **A full set logs end to end in airplane mode** (2026-09-21) — radio off, exercise chosen from the seeded
      catalog in the picker sheet, 60 kg × 8 @ RIR 2 written and ticked, every value read back from SQLite. The
      *acceptance* criterion above stays open because "a full workout" means routines, set types and the finish flow,
      which are stages 5–6
- [ ] TalkBack can complete a full set-logging flow (VoiceOver: [task 016](016-ios-platform.md)).
      **Partly:** the accessibility tree is right — the row is one element reading
      *"Série 1, 40 quilogramas, 6 repetições, RIR 7, concluída"*, `RIR 7` is `checked`, and the `5+` disclosure is
      `selected` but **not** `checked`. Navigating it with TalkBack actually switched on is not done
- [x] **Foreign keys are actually enforced on the device** — `PRAGMA foreign_keys = ON` takes effect on the open
      connection, and a violating insert is rejected rather than accepted. *(Added 2026-09-19: SQLite defaults the
      pragma off, nothing had ever set it, and the device was ignoring all 58 of the schema's foreign keys.)*
      **Proven:** `PRAGMA foreign_keys = 1`, and an orphan `set_logs` insert was rejected
- [x] Portuguese plurals and the decimal comma render correctly under Hermes — the `Intl` polyfills are loaded.
      The catalogs' nine plural messages are the `unit_spoken.*` names, so this is first testable once a screen
      shows a quantity. **Proven:** the keypad's separator key renders `,` and is disabled for reps; the row speaks
      *"40 quilogramas"* and *"6 repetições"*
- [x] **Tapping ✓ is inside NFR-2's 100 ms** — measured, not assumed: 60 taps across a five-exercise, twenty-set
      session gave **p50 10.5 ms, p95 12.4 ms, worst 20.1 ms** for the synchronous write plus the re-read the screen
      renders from, reproduced on a second run. React's commit and the paint are on top of that and are not in the
      number
- [x] **A set survives a force-quit** (INV-09) — `am force-stop` mid-workout, cold relaunch, and the row came back
      as *"Série 1, 40 quilogramas, 6 repetições, RIR 7, concluída"*. **The data half only:** the app reopens at its
      home route, not into the workout in progress, because nothing offers to resume one yet. The rest timer is
      stage 5's and is not covered
- [x] **`5+` stores nothing by itself** (open question 9) — tapping it opened `RIR 5 6 7 8 9 10` while the row still
      read *"RIR não registrado"*; the 7 tapped afterwards is what was stored

**Stage 5 on the device** *(added 2026-09-23; first pass run the same evening on the Galaxy S21 FE, Android 16, pt-BR,
metric, dark — a development build carrying commit `228069e`, installed **over** the previous build so its data stayed)*
- [x] **Migration `0002` on a device already holding logged sets** — the phone held one open workout, two exercises and
      two completed sets. Rehearsed first against a copy of that database pulled off the phone, then run by the app
      itself: **3 migrations applied, both sets intact, `foreign_key_check` empty, `integrity_check` ok**, and the CHECK
      on `target_rir` present on the column ([06 §4](../06-operations.md))
- [x] A routine is built, reordered (the two-pass renumber clearing SQLite's row-by-row unique check), supersetted,
      duplicated, archived and restored — and started, with weights and reps pre-filled and every RIR blank. *(2026-09-24,
      after two fixes found by this very check — below. Started, "Treino A" wrote exactly what 5a's rules predict: the bench's
      set 1 a warm-up 100 × 5 because last time's set 1 was one, set 3 falling back to set 2's 62,5 × 8 as a working set, the
      row's 8 reps from `target_min_reps` with no history, the rest and targets copied — and every RIR NULL)*
- [x] **The rest notification arrives with the screen off**, on time. **Arrives: yes, after a fix (below). On time:
      moved to open question 13 on 2026-09-25** (closing decision 2) — a launch decision, not this task's. One clean screen-off delivery was **~39 s late** on a 2:00 rest, and the first alarm fired ~22 s late —
      Android deferring a non-exact alarm. The timing runs after that were disturbed by hand on the phone and are not
      evidence either way, so they were abandoned at the owner's request; whether `SCHEDULE_EXACT_ALARM` is worth asking
      for is still open
- [x] Notification permission is asked at the first rest timer and not at launch; refused, the timer still runs with
      its haptic and the app never asks again. *(2026-09-24: the permission reset to unasked with `pm revoke` and its flags
      cleared; a cold start asked nothing; the first rest asked; "Não permitir" left the bar counting; the next round's rest
      asked nothing — one refusal is final on Android 16, as `canAskAgain` reports it. Permission restored afterwards. The
      haptic itself cannot be observed over adb)*
- [x] **Force-quit mid-rest**: the cold start reopens the workout, and the bar is counting the same rest — set ticked at
      21:00:37 with a 2:00 rest, force-stopped five seconds later, cold-started, and the bar read **1:43** at 21:00:54:
      the same rest, where it should be. **Every cold start of the pass landed in the open workout by itself**, and every
      set ticked before a force-stop was there afterwards
- [x] A superset alternates on the ✓ and rests once per round; ✓ with the keypad open moves it to the next set's weight.
      *(2026-09-24: bench set 1 moved focus to the row's set 1 with no bar; the row's set 1 started one 1:30 rest and sent
      focus back to the bench's set 2; with the keypad open on the bench's set 2, its ✓ moved the keypad to the row's set 2
      weight, revealed above it, with no bar — mid-round)*
- [ ] TalkBack reaches the set type through the row's "Change set type" action, and the timer bar reads its time left
- [ ] ✓ latency re-measured on a routine-started session, with the timer bar ticking beside the rows. *Not run: the
      stage-3 number came from `measureTickLatency()` on a synthetic session; measuring under a ticking bar needs the same
      instrument pointed at a real one*
- [x] **5c on the phone** (2026-09-24): a plank's row is a time alone; its ✓ on an empty time opened the keypad on *Tempo*
      instead of completing it; `130` read "1 minuto e 30 segundos" and stored 90 s with no weight, reps or RIR. A farmer's
      walk's empty ✓ opened the keypad on *Distância* — its required field — and 24 kg · 30 m · 40 s stored exactly, RIR NULL.
      Migration `0003` was already applied on this phone (the development build takes its JavaScript from Metro)

**Found by the stage 5 device list, run 2026-09-24** *(after stage 6's pass, the same evening; both fixed and verified)*
- [x] **⚠ Three screens never showed their own writes: the routines list, the routine editor and the catalog.** Each
      re-read through `useMemo(() => { void revision; return read(); }, [revision])`. The React Compiler — applied by the
      bundle, not by Jest — memoizes by what a computation *uses*, and a `void` read uses nothing: **compiled, the cache was
      keyed on `userId` alone** (checked by compiling the pattern with the app's own `babel-plugin-react-compiler`). A routine
      created, three exercises added, a catalog row hidden: all in SQLite, none on screen until a remount. Stages 4 and 5a
      shipped it; stage 3's `Sheet` was the same class. Fixed with `useDatabaseRead` — the read held in state and put back
      into state after each write and on focus — and **a lint fence, `void-dependency`, refusing `void <name>;`**, with a
      known-bad fixture. The ADR-014 gap stands: the suite still does not run under the compiler; this closes one pattern
- [x] **Every routine read "0 exercícios".** The count was a correlated subquery in a raw `sql` fragment, and Drizzle writes
      a bare column there when the query around it has no join — `"routine_id" = "id"`, with `id` bound to
      `routine_exercises` itself. Fixed with `src/db/qualified.ts`, which writes `"table"."column"` whatever the query; stage
      6's body-weight subquery rendered correctly only because its query joins, and now uses it too. A test renders both in a
      query with no join, and was watched failing against the original fragment

**Found by the stage 5 device pass** *(2026-09-23 — two fixed the same evening, two carried into stage 5c)*
- [x] **⚠ The rest notification was silently dropped with the screen off.** The alarm fired, `expo-notifications` handed
      it to the app's handler — which returned "show nothing", unconditionally, on the belief that it is only consulted in
      the foreground. It is consulted whenever the process is alive, and a gym phone with its screen off usually has one.
      Now it suppresses only while the app is actually on screen (`AppState`), in `src/platform/notifications.ts`; the
      next screen-off rest was delivered. A regression test, `src/platform/__tests__/notifications.test.ts`, fails against
      the old handler
- [x] **A force-quit mid-rest lost the notification.** Android cancels an app's alarms when it is force-stopped, and only
      a mutation rescheduled one, so the relaunched app showed the bar counting and would never have announced its end.
      The notification now follows the workout from an effect that also runs on mount — which also moves the scheduling
      off the ✓'s path. Watched: after the relaunch the alarm was pending again
- [x] **The ✓ completes an empty set.** Sets 2–8 of the pass were ticked with no weight and no reps and stored as
      completed. 03 §4 says "`is_completed = true` requires the fields its tracking mode needs — enforced in the service
      layer", and nothing enforced it. **Fixed in stage 5c**: `missingForCompletion` in `src/db`'s pure half, and a ✓ on
      such a row opens the keypad on the missing field. In CI, not yet on the phone
- [x] **15 seeded exercises can be picked and are logged as weight × reps** — 10 `duration` (plank, dead hang, wall sit…)
      and 5 `distance_duration` (farmer's walk, sled push…) — and the 31 `reps_only` globals show a weight field, because
      the set row ignored `tracking` entirely. **Fixed in stage 5c**: the row draws each mode's own fields. In CI, not yet
      on the phone

**Stage 6 on the device** *(run 2026-09-24 on the Galaxy S21 FE, Android 16, pt-BR, metric, dark — a development
build of `a662add` built in WSL2 with the `.so` files rebuilt for `personal_bests`, installed **over** the previous build
so the phone kept its data. Every value below was read back from the phone's SQLite, not only from the screen)*
- [x] **The e1RM and records fixtures agree on the phone** — the client half of "identical results in Python and
      TypeScript" that stage 1 said only a device could settle. Three finishes, each predicted from the fixture's rules
      before the tap and matched exactly:
      - a first-ever session: seven records, none for an e1RM past 12 effective reps (100 × 12 @ 10), and 80 kg for
        60 × 8 @ 2;
      - 62,5 × 8 @ 2 against it: heaviest weight, **83,33 kg** e1RM, 8 reps at 62,5 kg and 500 kg of volume;
      - a past workout dated *before* that one, 65 × 6 @ 2: heaviest weight and 6 reps at 65 kg only, with no e1RM
        record (≈ 82,33 < 83,33) and no volume record (390 < 500). The current best, whatever the date (decision 2).
- [x] Finishing: the sheet counted "9 séries marcadas" and, later, "2 séries marcadas" with "1 série não marcada"; fatigue 7
      stored 7, a second tap stored **NULL, not 0**, and 6 stored 6; the note, typed and then force-stopped with the sheet
      open, was in the row and back in the field after the cold start, which reopened the workout. *Finalizar* landed on
      the summary; *Concluir* went home
- [x] **A 100 kg warm-up before a 62,5 kg working set celebrated nothing**, and the summary counted **1** set and 500 kg —
      the PR and set-count half of the warm-up criterion above
- [x] Nothing ticked: the sheet offered only *Descartar*; the row took `ended_at` and `deleted_at` and stayed; the cold start
      landed on home, not in it; and the next bench session's "last time" still came from the last finished one
- [x] A past workout for yesterday, 18:00–19:30, on an exercise given a 1:00 rest: after the ✓ only the target caption
      showed — no bar, no *Pular*, and no alarm registered for the app. The set's `completed_at` read **19:30 on the 23rd**
      and its `updated_at` the real time; `local_date` 2026-09-23; after finishing `ended_at` read 19:30 and the device
      store was empty again. The exercise's note and rest were in `workout_exercises`
- [ ] The summary with TalkBack on: the heading, each record as one element, *Done*; under reduce motion, no rise. *Not
      run: switching TalkBack on is a phone setting. The tree gives the heading its role; whether each record reads as
      one element needs the screen reader itself*
- [x] *Stage 7's, recorded here so it is not lost:* nothing reopens an older summary until workout detail exists. Once
      it does, an old workout must name the same records, and none that a later workout has since beaten (decision 2).
      **On the phone, 2026-09-25:** the past workout of the 23rd names "Maior carga: 65 kg" and "Mais repetições com 65
      kg: 6" — the records stage 6's pass saw it take — and not its 82,33 kg e1RM, which the next day's 83,33 beat

**Found by the stage 6 device pass** *(2026-09-24 — four fixed the same evening, and verified on the phone after the fix;
three recorded)*
- [x] **⚠ Every tall sheet ran off the top of the screen — the exercise picker could be neither searched nor closed.**
      Stage 4's, and invisible until its device pass: `Sheet` neither kept out of the system insets (the modal is drawn edge
      to edge) nor shrank, so the picker grew to the height of 201 rows and pushed its own title, close button and search
      field above the top edge; only the system back button left it. Fixed in `Sheet`: the frame keeps the top inset plus a
      strip of backdrop to tap, the bottom inset pads the sheet, and the sheet shrinks so a list inside scrolls. Two tests
      pin it (`surfaces.test.tsx`), one watched failing
- [x] **Search results sat under the keyboard.** The same edge-to-edge modal is not resized for the keyboard, so typing
      in the picker hid everything it found, and a tap meant for a result typed a letter. Fixed with a
      `KeyboardAvoidingView` in `Sheet`, one behaviour on every OS (INV-28); the results now sit above the keyboard
- [x] **The past-workout sheet hid its own button**: *Dia seguinte* wrapped alone onto a line, and *Registrar* sat below
      the keypad, off-screen. The day now has its own line with its two steps side by side, and *Registrar* is above the
      keypad
- [x] **"0 série marcada"** in the finish sheet with nothing ticked — CLDR's Portuguese rule puts 0 with the singular, which
      reads wrong in Brazil, and the sentence beneath already says nothing was ticked. The count is no longer shown at
      zero. *Other `{count, plural}` messages can meet a zero too; the native-speaker review should look at them as a set*
- [x] **The development client's floating *Tools* button covers the right edge of *Encerrar*.** A tap there opens the dev
      menu. Development builds only, so not a product defect — but it is the workout's primary action, and it cost this
      pass a tap. *Closed with no action, 2026-09-25 (closing decision 4): no release build carries the button*
- [ ] **The ✓ has no accessible name of its own** in the tree: the row is one element carrying the sentence, and the ✓
      inside it is an unlabelled button. Whether TalkBack reaches it through the row is the open TalkBack criterion's to
      settle
- [x] **A forked global and the global itself read identically in the picker** — "Abdominal bicicleta" twice, one of
      them the user's own copy. Stage 4's fork-on-edit, working as decided. **Decided 2026-09-24: mark it.** Every
      exercise of the user's own — a fork or one they made — carries "Seu"/"Yours" in the picker and in the catalog's
      caption, and says it aloud ("Abdominal bicicleta, seu"), so the mark is never visual alone (INV-24)

**Stage 7 on the device** *(run 2026-09-25 on the Galaxy S21 FE, Android 16, pt-BR, metric, dark — a development build
of `d6354d3` built in WSL2 with the regenerated `.so`, `session_metrics` and `standing_records` checked in the packaged
library, installed over the previous build so the phone kept the data of every earlier pass. Every number was predicted
from the pulled SQLite copy before the screen was opened)*
- [x] **The list**: four finished workouts, newest first — "Treino A" 7 sets 1.000 kg, "Treino" 1 set 500 kg, the past
      workout of the 23rd 1 set 390 kg, and the 19th 9 sets 1.680 kg — and neither discarded one. A reps-only row and a
      hold count as sets with no tonnage (INV-04, 5c decision 1)
- [x] **The detail**: every set as logged, eight unticked rows marked "não marcada", the warm-up as "Aq · Aquecimento",
      a hold as "1:30" and a carry as "24 kg · 30 m · 0:40", notes as typed; "Treino A" holds only "Maior volume em uma
      sessão: 1.000 kg" for the bench — its 62,5 × 8 only ties the other workout's — and the carry's 24 kg
- [x] **The charts**: the bench's top set 60 → 65 → 62,5, e1RM 80 → 82,3 → 83,3 with the gap and its note, volume ending
      at 1.000; each opens on its latest value, and a tap moved the e1RM readout to "23/09/2026 · 82,3 kg" and nothing
      else. The crossover draws one lone dot and no e1RM chart (12 reps at RIR 10 is past Epley's range); the row says
      there is nothing to chart; the plank lists 1:30 and says time is not charted yet
- [x] **200 % font**: after the two fixes below, every axis value stays inside its plot and the line starts clear of the
      widest one. The phone's scale was restored to 0.86 afterwards
- [x] **Imperial**: not run in stage 7. **Run in stage 8** (2026-09-25): after the switch, the history's axes read 90 / 100 /
      110 lb and 450 / 500 / 550 lb, and the readouts "25/09/2026 · 100 lb" and "· 500 lb"
- [ ] **TalkBack** on the chart's adjustable actions: not run (a phone setting); the tree gives the plot `adjustable`
      and the summary as its label

**Found by the stage 7 device pass** *(2026-09-25 — all three fixed and verified on the phone)*
- [x] **The oldest point ran through its own axis label.** The values sit on their gridlines at the left edge, and when
      the oldest session is also the lowest, the line started under "60 kg". The labels now have a gutter measured from
      their own layout, so it grows with the font; a test lays the labels out and checks where the line starts, watched
      failing with the gutter switched off
- [x] **At 200 % the top axis value rose over the readout.** It stands on the top gridline, which sat a dot's radius from
      the plot's top. The top gridline is now one measured label-height down
- [x] **"0 série contada"** under a workout whose sets were all unticked — the zero-plural stage 6 found in the finish
      sheet, in a new message. There a zero could be hidden; here it is the information, so the message has an explicit
      `=0` case in both languages: "nenhuma série contada", "no counted sets". *The native-speaker review should look at
      every `{count, plural}` message for the same thing*

**Stage 8 on the device** *(2026-09-25, resumed after the fixes below, on a throwaway account registered against the
local API — `stage8-device@example.com` — since the phone's own account and history were gone. pt-BR, dark. Every
value was predicted before the tap and read back from the phone's SQLite)*
- [x] **The ✓ on an empty row asks the core, and still opens the keypad on the missing field**: a bench press row with
      nothing typed opened *Repetições*, and the set stayed `is_completed = 0`. The rule now crosses the FFI boundary;
      the behaviour is stage 5c's
- [x] **The units switch**: *imperial* answered "saved: imperial · pt-BR", `PATCH /auth/me` answered 200, and the
      phone's cached `users` row read `imperial`
- [x] The imperial round trip and a hidden exercise's history — the two acceptance criteria above, ticked from this pass
- [x] **The fix below, on the path that caused the loss**: the account's refresh tokens revoked on the server, the
      15-minute access token left to run out, then a `PATCH` from the switch — the refresh answered `401` and the app
      signed out, exactly as before. **The phone kept 1 user row, 1 workout and its set, `45.359237 × 5`.** Signing back in
      listed "Treino, 25/09/2026, 1 série contada, 500 lb" in the history
- [ ] **Not run, and the owner's at the phone:** TalkBack (stages 3, 5, 6, 7), a full workout in airplane mode, the
      30-tap count, the 200 % font check in pounds, stage 4's accessibility pass, ✓ latency under a ticking rest bar
- [x] **A development-only console error on signing out**: *"Can't perform a React state update on a component that
      hasn't mounted yet"*, raised inside `expo-router`'s `ContextNavigator` as the session gate swapped to the sign-in
      screen. Not the app's code by its stack, and harmless on screen; recorded rather than chased. *Closed with no
      action, 2026-09-25 (closing decision 4)*

**Found by the stage 8 device pass** *(2026-09-25, on the Galaxy S21 FE — a development build with the regenerated core,
`missing_for_completion` checked in both packaged libraries, installed over the previous build. The pass stopped here)*
- [x] **⚠ Ending a session deleted every set on the device.** `forgetLocalAccount` (`src/db/account.ts`) deletes the
      account's `users` row when a session ends, and every training table references `users` with `ON DELETE CASCADE`,
      which bites since stage 3 turned `PRAGMA foreign_keys` on. Its comment says a device holds no training data before
      task 006, which has been false since stage 3. **What set it off:** the diagnostics switch's first `PATCH /auth/me`
      needed a refresh, the local API refused the token with `401`, the session ended, and the phone's database was
      left with 201 catalog rows and **0 users, 0 workouts, 0 sets, 0 routines** — every earlier pass's record, with no
      server copy to restore. For a real user before task 006 the same path is a password change or a *sign out
      everywhere* from another device. **Fixed the same evening, by the owner's decision:** a session's end takes the
      tokens and the privacy key and nothing else — the account's row, and the training it anchors, stay. This amends
      task 019's "the device erases the privacy key and the account's local row"; what a device keeps for good once an
      account is gone is still task 006's. `forgetLocalAccount` is gone, the account services have no `forget`, and a new
      lint fence, `account-row-deletion`, refuses `delete(users)` and an SQL delete on `users` anywhere in the app, with
      two known-bad fixtures. The phone's lost history is not recoverable
- [x] **The integration suite emptied the development database.** It ran against the same local Postgres the API
      serves, and the readiness test migrates down and back up, so every account created before a test run was
      gone afterwards. All 97 users present were under a day old, and the phone's account was not among them, which is
      why its refresh token was refused. **Fixed:** the suite now creates `<name>_test` beside the database its URLs
      name, grants it from `infra/postgres/roles.sql`'s own per-database half, and points every URL there — locally and in
      CI alike. A full run left the development database's 97 users exactly as they were

**Found on the device, and not yet fixed**
- [x] **The set row reflows at font scale 0.86** — *half answered 2026-09-21, and the half that was a defect is
      fixed.* **The ✓ no longer takes part in the wrap**: it was inside the wrapping line with `marginLeft: 'auto'`
      and lost by about three dp, dropping to a second line with a third of the row empty beside it. It is now a
      fixed column that never wraps, at every scale. **What is left is a design call, not a bug**, and it is now an
      open question in [07 §6](../07-brand-and-ui.md) with the measurements attached: the *numbers* still wrap at
      default scale — `40 kg × 6 RIR 7` misses one line by ~2 dp, and the realistic `100 kg × 12 RIR 10` misses it at
      every scale — so "always one line" needs something dropped from the row. Tightening the gap was tried on the
      phone and reverted: it wins the line at 0.86 and still loses at 1.0
- [x] **Moved to PROJECT-STATUS § Gaps on 2026-09-25** (closing decision 4) — a design-system follow-up, not one of
      this task's criteria. **`Sheet` lost its exit animation** in the stage-3 repair ([ADR-014 § Amendment 2026-09-19](../decisions/ADR-014.md)).
      **Attempted and reverted 2026-09-21, and the attempt is worth recording because it narrows the problem.**
      Keeping the sheet mounted through its fade needs one state write at the instant `visible` goes true → false.
      During render is the original defect. In an effect is `react-hooks/set-state-in-effect`, which is an **error**
      in this project and is right in general. From the animation's completion callback is allowed, and closes only
      half of it — something must still turn mounting *on*. A working version therefore needs a different mechanism:
      driving the transition from the caller, or **`react-native-reanimated`'s `exiting` animations, which exist for
      exactly this and whose library is already a dependency**. Deliberately not done behind an `eslint-disable`: the
      rule that blocks it was added because this component shipped broken for nine days

## Notes and risks
- **The set row is the product.** Prototype it in isolation, on a real phone, with sweaty hands,
  before building anything around it. If it is not faster than Hevy there is no reason for this
  app to exist.
- Number entry on React Native is a known source of pain (keyboard avoidance, decimal separators
  — note that a Brazilian locale uses `,`). Build a custom keypad rather than fighting the OS one.
- Do not build charts before logging feels right. Charts are satisfying to build and worth far
  less than the set row.
- `personal_records` is a cache. Ship the rebuild command alongside it (task 002 notes).

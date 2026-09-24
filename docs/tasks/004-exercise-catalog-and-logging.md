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
| **5b** | The live session finished off — set types; the rest timer with haptics and its notification; ✓ advancing focus (superset-aware); removing and reordering exercises mid-session; reopening the workout in progress on relaunch | ☑ 2026-09-23, device pass not yet run |
| **5c** | The `duration` and `distance_duration` tracking modes — the set row that logs them, and the create form offering them | ☑ 2026-09-23, device pass not yet run |
| **6** | The finish flow — PR detection and its celebration, perceived fatigue, notes, retroactive logging | ☐ |
| **7** | History and per-exercise charts; `personal_records` as a cache, with its rebuild command | ☐ |
| **8** | The API mirror endpoints, and the closing device pass over the whole loop | ☐ |

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
   open question for stages 6–7.

## Acceptance criteria
- [ ] A full workout can be logged start to finish in airplane mode. *(Stage 3 logged one set start to finish with
      no network involved, but airplane mode itself was not switched on, and "full" means routines, set types and
      the finish flow, which are stages 5–6 in the table above.)*
- [ ] Force-quitting mid-workout and reopening restores the exact state, including the set in
      progress and the running rest timer (INV-09). *(Stage 3: the **state** survives a force-stop and comes back
      exactly — see the device list. **Stage 5b built the rest of it** (2026-09-23): a cold start with a workout open
      lands in it, and the rest timer is derived from the rows, so there is nothing of it to lose — proven by
      `liveFlow.test.ts` against the rows, **not yet on the phone**, so this stays open.)*
- [x] Tapping ✓ renders in < 100 ms on a mid-range Android device (measure, do not assume) —
      **p50 10.5 ms, p95 12.4 ms, worst 20.1 ms** on a Galaxy S21 FE, 2026-09-19, for the write and the re-read
- [ ] RIR left blank stores NULL; a chart or total never treats it as 0. *(Storage half proven on the device — a
      blank row reads "RIR não registrado" and `5+` writes nothing. No chart or total exists to check yet.)*
- [ ] Warm-up sets appear in the log but are excluded from volume, PRs and set counts
- [ ] Archiving an exercise leaves every historical set intact and displayable
- [ ] The e1RM fixture produces identical results in Python and TypeScript
- [ ] A weighted pull-up at body weight 80 kg + 20 kg × 5 @ RIR 2 has an e1RM of **123.3 kg**
      (100 kg × (1 + 7/30)); logging a new body weight a week later leaves that e1RM unchanged; and with
      no body weight logged by the set's date, its e1RM is NULL
- [x] A pt-BR user finds the bench press by typing either *supino* or *bench* — proven against the **real**
      `en.json`/`pt-BR.json` catalogs in `catalogFilter.test.ts`, 2026-09-22, not a stub catalog
- [x] A custom exercise named in Portuguese appears exactly as typed in an English UI — same suite, same date;
      "Supino do João" is never translated and a global still reads in whichever language is on screen
- [ ] An imperial user logs and reads pounds end to end, and the stored `weight_kg` round-trips to
      exactly the lb value they entered
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
- [ ] A routine is built, reordered (the two-pass renumber clearing SQLite's row-by-row unique check), supersetted,
      duplicated, archived and restored — and started, with weights and reps pre-filled and every RIR blank
- [ ] **The rest notification arrives with the screen off**, on time. **Arrives: yes, after a fix (below). On time: not
      settled.** One clean screen-off delivery was **~39 s late** on a 2:00 rest, and the first alarm fired ~22 s late —
      Android deferring a non-exact alarm. The timing runs after that were disturbed by hand on the phone and are not
      evidence either way, so they were abandoned at the owner's request; whether `SCHEDULE_EXACT_ALARM` is worth asking
      for is still open
- [ ] Notification permission is asked at the first rest timer and not at launch; refused, the timer still runs with
      its haptic and the app never asks again. *Half: nothing was asked at launch; at the first rest the permission was
      granted by hand on the phone (`USER_SET`) and the channel was created, named "Cronômetro de descanso". The refused
      path was not run*
- [x] **Force-quit mid-rest**: the cold start reopens the workout, and the bar is counting the same rest — set ticked at
      21:00:37 with a 2:00 rest, force-stopped five seconds later, cold-started, and the bar read **1:43** at 21:00:54:
      the same rest, where it should be. **Every cold start of the pass landed in the open workout by itself**, and every
      set ticked before a force-stop was there afterwards
- [ ] A superset alternates on the ✓ and rests once per round; ✓ with the keypad open moves it to the next set's weight
- [ ] TalkBack reaches the set type through the row's "Change set type" action, and the timer bar reads its time left
- [ ] ✓ latency re-measured on a routine-started session, with the timer bar ticking beside the rows

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

**Found on the device, and not yet fixed**
- [x] **The set row reflows at font scale 0.86** — *half answered 2026-09-21, and the half that was a defect is
      fixed.* **The ✓ no longer takes part in the wrap**: it was inside the wrapping line with `marginLeft: 'auto'`
      and lost by about three dp, dropping to a second line with a third of the row empty beside it. It is now a
      fixed column that never wraps, at every scale. **What is left is a design call, not a bug**, and it is now an
      open question in [07 §6](../07-brand-and-ui.md) with the measurements attached: the *numbers* still wrap at
      default scale — `40 kg × 6 RIR 7` misses one line by ~2 dp, and the realistic `100 kg × 12 RIR 10` misses it at
      every scale — so "always one line" needs something dropped from the row. Tightening the gap was tried on the
      phone and reverted: it wins the line at 0.86 and still loses at 1.0
- [ ] **`Sheet` lost its exit animation** in the stage-3 repair ([ADR-014 § Amendment 2026-09-19](../decisions/ADR-014.md)).
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

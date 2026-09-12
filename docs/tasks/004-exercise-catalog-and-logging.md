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
- Set types: warmup / working / drop / backoff / amrap, changed by long-press or swipe.
- Rest timer auto-starts on ✓, with haptics and a local notification on completion.
- Notes per exercise and per workout; perceived fatigue on finish.
- **Every mutation writes to SQLite immediately** (INV-09, NFR-2 < 100 ms). No React state holds
  the only copy of anything.
- Retroactive logging with a chosen date/time (FR-2.13).

**History and PRs (FR-2.14–2.15)**
- Workout list, workout detail.
- Per-exercise history and charts: top-set weight, e1RM, total volume.
- e1RM from the one canonical formula (INV-07), implemented in `src/domain/e1rm.ts` with the
  shared fixture ([02 §3](../02-architecture.md)) — including **bodyweight exercises**, where the load
  is body weight on or before the set's date plus added load (FR-2.15a).
- PR detection on finish, with a celebration. Warm-ups excluded (INV-04); deload cycles excluded
  (INV-08) — the deload check is a no-op until task 005 but wire the predicate now.
- `is_counted_set()` implemented **once**, in domain, and used by every total on every screen
  (INV-04).

**API** — the mirror endpoints (`exercises/`, `routines/`, `workouts/`) so task 006 has something
to sync against. Built server-side in this task, wired to the client in 006.

## Acceptance criteria
- [ ] A full workout can be logged start to finish in airplane mode
- [ ] Force-quitting mid-workout and reopening restores the exact state, including the set in
      progress and the running rest timer (INV-09)
- [ ] Tapping ✓ renders in < 100 ms on a mid-range Android device (measure, do not assume)
- [ ] RIR left blank stores NULL; a chart or total never treats it as 0
- [ ] Warm-up sets appear in the log but are excluded from volume, PRs and set counts
- [ ] Archiving an exercise leaves every historical set intact and displayable
- [ ] The e1RM fixture produces identical results in Python and TypeScript
- [ ] A weighted pull-up at body weight 80 kg + 20 kg × 5 @ RIR 2 has an e1RM of **123.3 kg**
      (100 kg × (1 + 7/30)); logging a new body weight a week later leaves that e1RM unchanged; and with
      no body weight logged by the set's date, its e1RM is NULL
- [ ] A pt-BR user finds the bench press by typing either *supino* or *bench*
- [ ] A custom exercise named in Portuguese appears exactly as typed in an English UI
- [ ] An imperial user logs and reads pounds end to end, and the stored `weight_kg` round-trips to
      exactly the lb value they entered
- [ ] The set row renders without truncation in pt-BR at 200 % system font scale
- [ ] Logging a 5-exercise, 20-set workout takes fewer than 30 taps beyond the weights themselves

## Notes and risks
- **The set row is the product.** Prototype it in isolation, on a real phone, with sweaty hands,
  before building anything around it. If it is not faster than Hevy there is no reason for this
  app to exist.
- Number entry on React Native is a known source of pain (keyboard avoidance, decimal separators
  — note that a Brazilian locale uses `,`). Build a custom keypad rather than fighting the OS one.
- Do not build charts before logging feels right. Charts are satisfying to build and worth far
  less than the set row.
- `personal_records` is a cache. Ship the rebuild command alongside it (task 002 notes).

# Task 002 — Database and Schema

**Depends on:** 001 · **Blocks:** 003–009 · **Size:** L

## Goal
Both schemas exist, in both engines, with the seeded exercise catalog, and with the invariants
that *can* be enforced by the database actually enforced there.

## Scope

**Postgres (Alembic)** — implement [03-database-schema.md](../03-database-schema.md) in full.
All of it, in one pass, including the cardio and planning tables that no code will touch until
task 007. Schema churn is far cheaper before there is data than after.

Order: enums → `users`/auth → `muscle_groups`/`exercises` → routines → workouts/sets →
progression rules and mesocycles → **`gamification_tracks`** → **`sport_profiles`** →
cardio activities/streams/segments → cardio plans → the remaining gamification tables
(`user_track_progress`, `xp_awards`, `achievements`, `user_achievements`, `adherence_streaks`).

**`sport_profiles` is seeded reference data and comes before the cardio tables** — every cardio
column and every cardio screen resolves through it (INV-19). Seeding it properly here is what
makes "a new sport is a row plus a component" true later.

**`gamification_tracks` comes before `sport_profiles`, which is not where you would expect it.**
`sport_profiles.xp_track` is an FK into it ([03 §6](../03-database-schema.md)) — that is the column
that keeps the scorer from branching on a sport — so the track catalog has to exist first. The rest
of the gamification tables have no such dependency and stay at the end.

Non-negotiable in this task:
- All CHECK constraints from the schema doc, especially `rir BETWEEN 0 AND 10` (INV-03) and
  `max_reps >= min_reps` (INV-05).
- FK delete semantics per [03 §10](../03-database-schema.md) — in particular `exercises` is
  **RESTRICT**, not CASCADE (INV-11). Getting this wrong is discovered a year later.
- `user_id` indexed on every owned table (INV-15).
- The `‹sync›` column set (`created_at`, `updated_at`, `deleted_at`, `sync_version`) on every
  table classified **root** in [03 §11](../03-database-schema.md), applied by a mixin so it cannot
  be forgotten — and on **no** dependent, reference, derived or local-only table, because a sync
  column on a table that never syncs implies a conflict question that does not exist.
- A DB trigger backstop for INV-06: reject an UPDATE to a `planned_set` whose microcycle status is
  not `projected`, unless the session flags itself as a user edit — **and reject an engine write that
  would lower a microcycle's `engine_version`** ([ADR-004](../decisions/ADR-004.md)). Both triggers
  exist in SQLite as well as Postgres, because an offline device on an older engine is exactly where
  the second one earns its keep.
- **No `day_of_week` column on any planning table** (INV-25). `planned_sessions.day_index` and
  `planned_cardio_sessions.day_index` are validated by trigger against their parent cycle's
  `length_days` — a CHECK cannot reach the parent row.
- Row-level security **enabled and `FORCE`d** on every user-owned table, with policies that **fail
  closed** when `app.user_id` is unset ([04 §4](../04-security-and-auth.md)). Tables are created by
  `cyberathlete_migrator`; `cyberathlete_app` receives DML grants and owns nothing.
- **Unscoped lookups as `SECURITY DEFINER` functions**, exactly the list in
  [ADR-011](../decisions/ADR-011.md) — user by email (login), refresh token by hash, reset and
  verification token by hash, and the two retention sweeps. Each returns only the columns its flow
  needs, pins `search_path`, and has `EXECUTE` granted to `cyberathlete_app` alone. They are the only
  path by which the API reads a row with no user scope; there is no bypass role to fall back on.
- Policies carry the same expression in `USING` and `WITH CHECK`, so a row can be neither read from nor
  written into another user's scope. The exercise catalog's mixed policy — global rows readable by all,
  custom rows by their owner — is the one variation.
- **The schema-comparison script holds the function allowlist**: a `SECURITY DEFINER` function not on it
  fails CI.

**SQLite (Drizzle)** — the mirror per [03 §8](../03-database-schema.md): type mappings, no enums
(text + CHECK), omit `refresh_tokens` and **both derived caches** (`personal_records`,
`user_track_progress`), add `raw_gps_points`, `outbox`,
and `sync_state`.

**Seeds** — `apps/api/seeds/`:
- Muscle groups.
- ~200 global exercises with modality, primary and secondary muscles, tracking mode, and default
  rep ranges. This is data-entry work; do it properly once.
- **`modality_increments`** — the INV-02 fallback, seeded for **both unit systems**
  ([ADR-008](../decisions/ADR-008.md)): metric in kg, imperial as exact kg equivalents of lb plates,
  at the declared `numeric(10,6)`. At the former `numeric(5,2)`, every imperial prescription drifts
  off the 5 lb grid from the first cycle.
- **Every seeded reference row carries a translation key, never a translated name** (INV-27):
  exercises, muscle groups, sports, session types, strokes, set types, achievements. The text lives in
  `packages/shared/i18n/en.json` and `pt-BR.json`. **~200 exercise names in two languages is data
  entry of its own**, on the critical path, and both catalogs must be complete.
- **`sport_profiles`** — one row per sport from [01 §4.0](../01-business-requirements.md), with
  its recording mode, **metric and imperial** pace units and split distances, live fields, detail
  sections, session types, and the JSON Schema validating its `sport_metrics`. Seed **all** sports
  including the deferred ones (FR-4.0c) — a deferred sport is a profile row without an entry
  component yet, never a missing enum value.
  Getting `swim_pool` right here is what stops [task 007](007-cardio-recording.md) from becoming
  a pile of `if sport == 'run'`.
- Idempotent and re-runnable; also exported as a JSON asset the mobile app can seed from on first
  launch, since a new install must have a catalog before it has ever synced.

**Migration discipline** — the expand/contract rules in [06 §4](../06-operations.md) apply from
the very first migration after this one. This task is the last chance to change the schema freely.

## Acceptance criteria
- [ ] `alembic upgrade head` then `downgrade base` runs clean on an empty database
- [ ] Seeds run twice with no duplicates and no errors
- [ ] Attempting to delete an exercise that has `set_logs` fails with a FK violation
- [ ] `INSERT` with `rir = 11` is rejected by the database, not just by Pydantic
- [ ] A `swim_pool` activity validates with `{pool_length_m, lengths, swolf}` in `sport_metrics`
      and is rejected with a running-shaped payload, per its profile's schema (INV-19)
- [ ] A mesocycle of 24 microcycles with `deload_mode = 'none'` is valid and produces no deload
- [ ] A microcycle with `length_days = 9` accepts a session at `day_index = 9` and rejects one at
      `day_index = 10` (INV-25)
- [ ] A grep for `day_of_week` across the schema returns nothing
- [ ] With RLS on and `app.user_id` set to user A, a query for user B's workouts returns 0 rows
      even with an explicitly wrong `WHERE`
- [ ] With `app.user_id` **unset**, `cyberathlete_app` reads 0 rows from every user-owned table — the
      policies fail closed, never open
- [ ] The schema-comparison script fails on any user-owned table without both RLS **and** `FORCE ROW
      LEVEL SECURITY` — remove one, watch it fail, revert
- [ ] `cyberathlete_app` cannot read `users` without a scope; login finds a user only through its
      `SECURITY DEFINER` lookup
- [ ] Inserting a row whose `user_id` is not the scoped user is rejected by the policy's `WITH CHECK`
- [ ] A `SECURITY DEFINER` function **not** on the [ADR-011](../decisions/ADR-011.md) allowlist fails the
      schema script — add one, watch it fail, remove it
- [ ] The Drizzle schema creates successfully on-device and every table in [03 §8](../03-database-schema.md) exists
- [ ] A round-trip test writes a workout + exercise + 3 sets to SQLite and reads them back with
      correct types (booleans as 0/1, timestamps as epoch ms)
- [ ] The schema-comparison script **fails** when `‹sync›` is added to `cardio_plan_cycle_targets`
      or removed from `hr_zone_overrides` — verify by doing both and watching it break, then revert
- [ ] `SELECT *` on `privacy_zones` yields an id, a user id, a blob and a nonce, and nothing that
      is or implies a coordinate, a radius or a label ([ADR-007](../decisions/ADR-007.md))
- [ ] **An imperial user's 52-cycle linear block stays on the 5 lb grid** after storage rounding —
      run the INV-02 precision property against the real columns, not against in-memory numbers
- [ ] A metric and an imperial user resolve **different** default increments for the same global
      barbell exercise, from `modality_increments`, with no increment set on the exercise itself
- [ ] Every seeded reference row has a key, and **both** `en.json` and `pt-BR.json` resolve every
      one of them — no seed may reference a string missing from either catalog (INV-27)
- [ ] An exercise cannot list its own primary muscle as a secondary muscle — the insert is rejected
      by trigger, because it would credit that muscle 1.2 sets per set (FR-2.16)
- [ ] **No percentage is stored as `numeric`** — every percentage column is an integer `_bp`, and the
      schema-comparison script fails on any column ending in `_pct` (ADR-010)

## Notes and risks
- **The trigger backstop for INV-06 is worth the effort.** The application will enforce it too,
  but this is the invariant whose violation destroys history irreversibly.
- The two schemas will drift. The only defence is writing them in the same sitting, from the same
  document, and a CI check that both have the same table and column names — worth writing as a
  small script. **Extend that same script to enforce [03 §11](../03-database-schema.md):** every
  root has all four sync columns and, if user-owned, a `user_id` index; nothing else has any of
  them. It is roughly twenty extra lines and it converts "somebody forgot one" from a review
  question into a build failure.
- Do not model either derived cache as a source of truth. `personal_records` folds `set_logs` and
  `user_track_progress` folds `xp_awards` ([03 §11](../03-database-schema.md)); **neither syncs**,
  and each needs a rebuild command from day one. The rule to hold onto — *a cache is never a sync
  root, its ledger is* — is what stops the next one being replicated by reflex.

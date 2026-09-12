# Invariants

Rules that must hold everywhere, in every layer, forever. A change to this file is a breaking
change and needs an ADR. Each invariant names where it is enforced — an invariant with no
enforcement point is a wish, not an invariant.

---

### INV-01 — Storage is SI. Display converts.
Weights are stored in **kilograms**, distances in **metres**, durations in **seconds**,
elevation in **metres**, temperature in **°C**. `users.unit_system` (`metric` | `imperial`) affects
presentation only — and it affects **all** of it: weight, distance, pace and speed, elevation,
temperature and body weight switch together ([ADR-008](decisions/ADR-008.md)).

Two presentation rules that do not follow the setting, because they are facts about the activity:
- **Swim pace follows the pool's unit.** A 25 yd pool is paced per 100 yd and a 50 m pool per
  100 m, whatever the user's setting — lengths are what the swimmer counts.
- **Rowing is `/500 m` everywhere**, because that is what every erg monitor shows.

*Why:* mixed-unit storage is the single most reliable way to corrupt a fitness database. A user
who switches to imperial mid-block must not see their history change.

*Enforced:* column naming carries the unit (`weight_kg`, `distance_m`, `duration_s`). Conversion
lives only in the formatting module of the mobile presentation layer; data exports stay SI, with the
unit in every field name. No `_lb` or `_mi` column may ever exist.

---

### INV-02 — Every prescribed load is liftable, in the unit the equipment is made in.
A generated or displayed target weight must be a multiple of that exercise's
`load_increment_kg`, resolved as: exercise override → the modality default **for the user's unit
system** (`modality_increments`) → 2.5 kg metric / 5 lb imperial.

**Liftable is a property of the plates, and plates have a unit.** An imperial user's barbell moves
in 5 lb steps. Their increments are seeded lb-native and stored as exact kg equivalents
([ADR-008](decisions/ADR-008.md)), so every prescription is a whole number of steps in the unit the
user actually loads — never 93.7 lb.

*Why:* "add 2.5 %" produces 41.667 kg. No such barbell exists. Machine stacks, fixed dumbbells
and barbells all have different granularity — and a 2.5 kg step shown to someone holding 5 lb
plates produces loads no bar can carry.

*Why precision belongs in this invariant:* rounding to a multiple of an increment is a ratio, so it
is unit-invariant — but only if the stored increment is precise enough that one step cannot cross a
half-increment boundary. `round_to_increment()` re-anchors every load to an exact multiple, so error
never accumulates, **provided** increments are `numeric(10,6)` and loads `numeric(9,4)`. Simulated
over a 52-cycle linear block from 135 lb in 5 lb steps, with storage rounding on every write: at the
former `numeric(5,2)` / `numeric(6,2)`, **52 of 52** prescriptions land off the 5 lb grid, the first
at cycle 1 (140.1 lb). At the required precision, none do.

*Enforced:* the progression engine's single `round_to_increment()` helper. No other code rounds
loads. Property test: every generated set's weight is an exact multiple of the increment **in both
unit systems, after storage rounding, across at least 52 cycles.** A load or increment column
narrower than the declared precision fails the task-002 schema check.

---

### INV-03 — RIR is a count of reps left in the tank. It is `0..10` or NULL.
RIR is **only** "how many more reps were available before failure". `0` = failure, `3` = three
reps left. NULL means "not recorded", and is never coerced to 0.

**RIR has no relationship to RPE.** The app does not store RPE, does not display RPE, and never
converts between the two. The common `RIR = 10 − RPE` identity is *not* an assumption this
codebase makes — do not reintroduce it in a chart, a tooltip, an import, or a comment.

*Why (NULL vs 0):* `RIR = 0` and `RIR = unknown` mean opposite things for progression. Conflating
them makes the engine deload a user who simply did not tap the chip.

*Why (no RPE):* RPE is a subjective effort scale that happens to correlate with proximity to
failure. Treating them as interchangeable smuggles a scale the user never chose into the
progression maths. RIR is a countable quantity; that is exactly why it is the one we log.

**The two subjective fields are not RPE by another name, and never reach the maths.**
`workouts.perceived_fatigue` and `cardio_activities.perceived_effort` (both `1..10`) exist so a
user can annotate their own history. They are **never** converted to or from RIR, and they are
**never** an input to the progression engine, to e1RM, to PR detection, or to the XP scorer.
`rir_autoregulated` (FR-3.2d) reads logged RIR and nothing else.

*Why this needs saying:* the rule is about what reaches the arithmetic, not about identifiers. A
1–10 subjective field that is not spelled `rpe` but is fed into autoregulation is the same bug
with better naming, and it would pass every check above.

*Enforced:* DB `CHECK (rir IS NULL OR rir BETWEEN 0 AND 10)`; Pydantic; the engine treats NULL
as "no signal" and falls back to rep-based outcome classification. No identifier in the codebase
contains `rpe`. And the domain core's input types **do not carry** `perceived_fatigue` or
`perceived_effort` at all — a strategy that wanted them would have to widen the FFI surface to get
them, which is a visible change rather than a quiet one.

---

### INV-04 — Only working sets count.
`warmup`, `drop` and `backoff` sets are recorded but excluded from volume totals, PR detection,
per-microcycle set counts per muscle, and every progression decision. `working` and `amrap` count.

*Enforced:* one shared `is_counted_set()` predicate in the domain layer. Never re-implemented in
a query or a chart.

---

### INV-05 — Generated prescriptions respect their bounds.
No engine-generated set may have `reps` outside `[min_reps, max_reps]` or target RIR outside
`[min_rir, max_rir]` of its rule. If a strategy wants to exceed a bound, it must convert the
excess into load (double progression) or clamp and flag.

*Why:* this is what the user asked for by name ("settings for minimum and maximum rep limits").

*Enforced:* engine post-condition assertion + property test over randomised rules.
A **user-edited** set may sit outside its bounds — the human overrides the machine — but the
engine may never generate one.

*Per-set RIR ladders* (`rir_mode: per_set`, FR-3.8a) are no exception: each set's target is the
exercise target plus that set's offset, and **every sum is clamped into `[min_rir, max_rir]`** and
marked `was_clamped` ([ADR-010](decisions/ADR-010.md)). The ladder bends to the bounds; the bounds
never bend to the ladder.

---

### INV-06 — The engine only rewrites *projected* microcycles, and never with an older engine.
Microcycle status is one of `projected | locked | in_progress | completed | skipped`.
Reconciliation may rewrite `projected` microcycles only. Everything else is immutable to the
engine; only the user may change it.

**A projection from an older engine never overwrites one from a newer engine**
([ADR-004](decisions/ADR-004.md)). Every microcycle records the `engine_version` that last projected
it, and an engine write carrying a lower version is refused, whatever its timestamp. A user edit is
not an engine write and is not subject to this rule (FR-3.14).

*Why:* a training log is a historical record. Silently rewriting last cycle's prescription
destroys the ability to ask "did I do what I planned?".

*Why the version rule:* a multi-user product runs many engine versions at once. INV-10 makes two runs
of *the same* engine agree; two versions are two different functions, and under plain
last-write-wins they overwrite each other on every reconciliation, indefinitely.

*Enforced:* a guard at the single entry point of the re-projection service, which also refuses to
re-project a cycle last projected by a newer engine; sync resolution per [02 §7](02-architecture.md);
and a DB trigger backstop — in Postgres and in SQLite — rejecting both a rewrite of a
non-`projected` cycle and an engine write that would lower `engine_version`.

---

### INV-07 — One canonical e1RM formula.
```
if rir IS NULL:  e1RM = NULL          -- no guessing; see INV-03
load_kg        = weight_kg                                      -- ordinary exercise
               | body_weight_on_or_before(local_date) + weight_kg   -- uses_bodyweight
if load_kg IS NULL:  e1RM = NULL      -- bodyweight exercise with no body weight logged by that date
effective_reps = reps + rir           -- reps that WOULD have been done at failure
e1RM           = load_kg × (1 + effective_reps / 30)            # Epley over effective reps
```
Valid only for `effective_reps ≤ 12`; beyond that e1RM is not computed and is reported as NULL.

*Why:* every chart, PR, and `percent_1rm` prescription must agree. Two formulas in a codebase
means the strength graph and the plan disagree and nobody can tell which is lying.

*Why RIR belongs in it:* `reps + rir` is not an RPE conversion — it is the literal definition of
RIR (INV-03) doing arithmetic. Five reps with three left in the tank is a set that would have hit
eight at failure, and Epley wants the failure rep count. 100 kg × 5 @ RIR 3 really is a stronger
performance than 100 kg × 5 @ RIR 0, and the formula must say so.

*Consequence, accepted deliberately:* **a set logged without RIR has no e1RM.** It appears in
history and in volume totals, but not on the e1RM chart and not as a `best_e1rm` PR. Substituting
a guess would poison every `percent_1rm` prescription derived from it. This is the one place
where skipping the RIR chip visibly costs the user something, and that is the correct incentive.

*And what `percent_1rm` does when it meets that NULL:* it holds its existing `baseline_e1rm_kg`
and re-projects from it unchanged, reporting that it is running open-loop (FR-3.2c). It does not
estimate, does not skip the cycle, and does not fail to generate. "No e1RM" must be a defined,
total case in the engine — never an exception it can raise.

*For bodyweight exercises* (`exercises.uses_bodyweight`), the load is **body weight plus added load**,
and the body weight is the latest `body_weight_log` entry **on or before the set's `local_date`** —
never today's, or every historical pull-up's e1RM would change each time the user weighs in (INV-17).
With no entry by that date, e1RM is NULL: the same no-guessing rule as a missing RIR
([ADR-010](decisions/ADR-010.md)).

*Enforced:* one function in the domain core, called by both client and server, with a shared
fixture asserting agreement.

---

### INV-08 — Deload sets never trigger PR celebration.
Sets performed in a microcycle flagged `is_deload` are stored and charted normally but are excluded
from PR detection and from "best ever" comparisons.

---

### INV-09 — An in-progress workout lives in the database, not in memory.
Every set completion is written to local SQLite synchronously before the UI updates. Killing the
app mid-workout must lose nothing.

*Why:* NFR-8. This is the failure users never forgive.

---

### INV-10 — The progression engine is pure and idempotent.
`project(plan, logs) -> plan'` performs no I/O, reads no clock, uses no randomness, and
`project(project(p, l), l) == project(p, l)`.

*Why:* the client and the server both run it. If it is not deterministic they will disagree and
sync will thrash forever.

*Enforced:* the core crate depends on no I/O, no clock, and no RNG — `#![forbid(unsafe_code)]`;
`cargo deny` bans I/O, clock and RNG **crates** such as `rand`; and clippy's `disallowed-methods` bans
`std::time::SystemTime::now`, because `cargo deny` inspects dependencies, not standard-library calls.
"Now" is always passed in as a parameter. If [ADR-004](decisions/ADR-004.md) is rejected and the domain
stays duplicated in Python and TypeScript, each copy needs two gates, because an import rule sees imports
and not calls: an import rule keeping I/O packages out — import-linter for `app/domain/`, ESLint for
`src/domain/` — and a call ban on the clock, randomness and identifiers — ruff `banned-api` in Python,
`no-restricted-globals` and `no-restricted-properties` in TypeScript ([ADR-012](decisions/ADR-012.md)).
This invariant then additionally requires the shared fixtures to pass in both languages.

*Exact numbers* ([ADR-010](decisions/ADR-010.md)): determinism also needs arithmetic that means the
same thing in every runtime. **Percentages are integer basis points**, and any value that needs a power
or a logarithm — the cycle-length safety rail, the XP level thresholds — is **computed once, rounded on
the safe side and frozen as an integer table** in the core. The table, never the formula, is what
runs.

---

### INV-11 — Nothing that has history is hard-deleted.
Exercises, routines, workouts, activities and plans are **archived** (`deleted_at` set), never
`DELETE`d. Historical sets keep pointing at the exercise that produced them.

*Exception:* account deletion (FR-1.4), which is a genuine cascade.

---

### INV-12 — Elapsed and moving time are separate, always.
`elapsed_s` (wall clock, start to finish) and `moving_s` (auto-pause excluded) are stored
separately. Pace is computed from **moving** time; training load from **moving** time;
"how long was I out" from elapsed.

*Why:* conflating them makes every paused run look slow and every coffee stop look like training.

---

### INV-13 — The GPS pipeline is deterministic and applied exactly once.
Raw points are stored raw. Distance, elevation gain, moving time and splits are computed by one
pipeline (accuracy filter → outlier rejection → elevation smoothing → accumulate) and stored as
derived columns. The pipeline is versioned; recomputation from raw points must reproduce the
stored values exactly for a given version.

*Why:* users compare runs across years. If the algorithm changes silently, old runs become
incomparable. A version column lets us change it deliberately and backfill.

---

### INV-14 — HR zones come from one place.
Zone boundaries derive from `user.max_hr` (or explicit per-user overrides) via a single function.
If `max_hr` is unset, zones are not shown — never silently estimated from age without saying so.

---

### INV-15 — Every row is owned, and every query is scoped.
Every user-owned table carries `user_id`. Every read and write path filters on the authenticated
user. There is no endpoint that returns a row by ID without an ownership check.

*Enforced:* a shared repository base class that requires a user scope, plus Postgres row-level
security as a second line of defence — `FORCE`d, failing closed when no user is set, and applied to an
API database role that is neither superuser, `BYPASSRLS`, nor table owner, which the API asserts at
boot. RLS that the connecting role can skip is not a second line of defence at all. See
[04 §4](04-security-and-auth.md) and [ADR-011](decisions/ADR-011.md), which also names the only functions
allowed to read a row without a user scope.

---

### INV-16 — Primary keys are client-generatable UUIDs.
All user-data primary keys are UUIDv7, minted by whichever device creates the row. The server
never allocates an ID for user data.

*Why:* a workout logged offline must have its final, permanent identity immediately, so children
(exercises, sets) can reference it and so re-sending a sync batch is a harmless upsert rather
than a duplicate. See [ADR-001](decisions/ADR-001.md).

*Corollary:* sync push is idempotent by construction. Retrying is always safe.

---

### INV-17 — Local time is a stored fact, not a computation.
Timestamps are `timestamptz` in UTC. Additionally, every workout and activity stores
`local_date` (a plain `date`) and the IANA `tz` it was recorded in.

*Why:* "which day was that workout" must not change when the user flies to another timezone. A
23:00 session in São Paulo belongs to that day, permanently.

---

### INV-18 — Deleting a plan never deletes logs.
A workout created from a plan survives the plan's deletion; the reference simply goes NULL. The
log is the record of what happened; the plan is only intent.

---

### INV-19 — A sport is never rendered or entered through another sport's assumptions.
Every sport resolves to a **sport profile** that declares its recording mode (GPS / lap / manual),
its primary metric, its pace unit, and its per-sport fields. Nothing in the UI or the analytics
layer may hardcode `min/km`, assume a GPS track exists, or assume `distance_m` is the meaningful
number.

*Why:* pace in `min/km` is meaningless for a pool swim (`min/100 m`), for a ride (`km/h`), and
for an indoor row (`/500 m`). A 25 m pool session has no route and no elevation. Building the
cardio half around running and bolting the rest on afterwards produces an app that is bad at
every sport except one.

*Enforced:* `sport_profiles` is a single table-driven definition ([03 §6](03-database-schema.md)),
consumed by the recorder, the live screen, the detail screen, and every aggregate. A new sport is
a new profile row plus its entry component — never a change to shared logic.

---

### INV-20 — Cross-sport aggregates use time, never distance.
"How much did I train this week" across running, swimming and cycling is summed in **seconds**.
Distance is only ever summed within a single sport.

*Why:* 5 km of swimming, 5 km of running and 5 km of cycling are not comparable quantities, and
adding them produces a number that looks meaningful and is not.

---

### INV-21 — XP is awarded exactly once per logical event, by a pure function.
Scoring is a pure function of prescription and log (INV-10). Every award is keyed on
`(user_id, source_kind, source_id, reason)` with a UNIQUE constraint. Re-running the scorer,
re-syncing a workout, or editing a logged set never double-awards.

*Why:* client and server both score, offline-first ([ADR-001](decisions/ADR-001.md)). Without
idempotence, sync duplicates XP and the ledger becomes fiction.

*Enforced:* the DB constraint, plus `xp_awards` as the source of truth with
`user_track_progress` a rebuildable cache that is **never synced** — the ledger replicates, the
fold does not ([03 §11](03-database-schema.md), [08 §8](08-gamification.md)). Two devices
therefore cannot hold competing totals for one track.

---

### INV-22 — No reward for exceeding a prescription; no penalty for rest.
Volume or intensity beyond target earns **zero**, never a bonus. A prescribed rest day and a
deload cycle completed as prescribed earn full credit. Nothing decays, expires, or is deducted, and
levels never decrease.

*Why:* **this is a safety property, not a design preference.** The planner prescribes rest; a
reward system that paid for exceeding it would pay users to disobey their own programme, and the
known result is injury. See [ADR-005](decisions/ADR-005.md).

*Enforced:* the scorer takes the prescription as a required input and cannot compute a reward from
raw volume alone; tests assert that a session at 150 % of target scores no more than one at 100 %;
and the ban list in [08 §6](08-gamification.md) is a review checklist item.

---

### INV-23 — The design system has one source of truth for tokens.
Colour, type scale, spacing and easing live in one token file consumed by `src/ui/`
([07 §9](07-brand-and-ui.md)). No component contains a literal hex value, font size, or duration.

*Why:* two themes (light and dark), a per-discipline hue set that grows as sports are added, and an
accessibility contract (INV-24) are unmaintainable if values are scattered. A hardcoded colour is
also how dark mode silently breaks.

---

### INV-24 — Colour is never the only signal, and workout numerals are legible.
Every state carries an icon, a label, or a shape as well as a colour. Body text meets 4.5:1,
UI and large text 3:1, and live-workout numerals target 7:1. All changing numbers use tabular
figures.

*Why:* the app is read mid-effort, in a dark gym or bright sun, by tired people, roughly 8 % of
whom (among men) have a colour vision deficiency. Proportional digits in a live pace readout shift
on every update and are measurably harder to read while moving.

---

### INV-25 — The microcycle is the training unit. The calendar week is not.
A microcycle is 1–28 days, chosen by the user and overridable per cycle. Planned sessions are
placed by **day index within the cycle** (1..N), never by weekday. No planner, engine, aggregate or
chart may assume 7.

*Why:* a 9-day microcycle drifts across the calendar by design — cycle 1 starts Monday, cycle 2
starts Wednesday. That decoupling is the reason to choose 9 in the first place, and any code that
assumes a week silently destroys it.

*Consequences that are easy to miss:*
- **Rate heuristics must be normalised by cycle length.** The cardio +10 % rule is a *per-week*
  guideline; applying it flat to a 5-day cycle ramps ~40 % faster in real time than intended
  (FR-6.5a). The rail is compounded per day and frozen as an integer table indexed by cycle length —
  `volume_step_bp ≤ RAIL_BP[length_days]` (FR-6.5b) — and never compared as a floating-point daily
  rate.
- **"Volume per microcycle" and "volume per calendar week" are different questions.** Both may be
  shown; they must be labelled distinctly and never conflated in one number.
- **Two views must agree**: the cycle view (microcycle × day index) is how a programme is authored;
  the calendar view (real dates) is how it is lived and is what answers "what am I doing Thursday".

*Enforced:* no schema column named `day_of_week` on any planning table; `day_index` with a CHECK
against the owning cycle's length. A grep for `7` as a cycle constant in the planner is a review
failure.

---

### INV-26 — The paywall never touches the user's own data or their safety.
Permanently free at every tier, including a lapsed one:

- reading, charting and **exporting** one's own training history;
- **logging a workout or recording an activity** — the core loop always works;
- multi-device sync of one's own data;
- account deletion and every privacy control (privacy zones included);
- the cardio volume safety rails (FR-6.5a).

A lapsed subscription **downgrades features, never revokes data**. An in-progress mesocycle becomes
read-only; it is never deleted and never hidden.

Related and equally binding: **money buys features, never progress.** No streak protection, XP,
level, or achievement may ever be purchased (INV-22).

*Why:* holding somebody's three years of training history hostage to a payment is indefensible,
and it is the promise most often broken in this category. See [ADR-006](decisions/ADR-006.md).

*Enforced:* entitlement checks gate *features*, never *reads of a user's own rows*. A review
checklist item, and a test that a fully expired account can still open its history, log a set, and
export.

---

### INV-27 — No user-facing string is hardcoded. Reference content is translated; user content never is.
Every piece of text the user reads — labels, explainers, errors, emails, notifications, the
paywall, exercise and sport names — is a **key** into a message catalog that exists in every
supported language ([ADR-008](decisions/ADR-008.md)). Reference rows in the database carry keys,
never translated names.

What the user wrote is the opposite case: a custom exercise name, an activity title, a note or a
routine name is stored and shown **exactly as typed**, and never passes through translation.

*Why:* a hardcoded English string is how a Portuguese build ships half-translated — noticed only when
a Brazilian user screenshots it. And translating somebody's own words ("Treino A", "Leg day do João")
would be both wrong and faintly insulting.

*Enforced:* a lint rule rejecting literal user-facing strings in `src/ui/` and `src/features/`; a CI
check that `en.json` and `pt-BR.json` have **identical key sets**; seeded reference rows hold a key
and no translated text; and the API reads the same catalogs for emails and exports, so the server
cannot drift into wording of its own.

---

### INV-28 — Shared code never knows the operating system.
Only `apps/mobile/src/platform/` and the Expo config plugins may branch on, or be selected by, the
operating system. `features/`, `account/`, `domain/`, `db/`, `sync/`, `recording/`, `crypto/` and `ui/` call platform
interfaces and never ask which OS is answering ([ADR-009](decisions/ADR-009.md)).

*Why:* the app ships on Android first. With a single platform, an Android assumption in shared code
fails no test, trips no build and looks exactly like working code — until iOS is added and every one of
them has to be found by hand. The cheapest moment to hold this line is while holding it costs nothing,
which is also the moment nobody would notice it slipping.

*Enforced:* a lint rule rejecting `Platform.OS`, `Platform.select` and `.android.*` / `.ios.*` files
outside `src/platform/`, proven in [task 001](tasks/001-project-bootstrap.md) by writing a
`Platform.OS` check into a feature and watching CI fail; and the first acceptance criterion of
[task 016](tasks/016-ios-platform.md) — adding iOS must not require editing shared code.

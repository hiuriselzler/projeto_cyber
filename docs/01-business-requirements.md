# 01 — Business Requirements

Requirements are numbered `FR-x.y` (functional) and `NFR-x` (non-functional) so tasks and tests
can cite them. "Must" is binding for v1; "should" is v1 if cheap, v2 otherwise.

---

## 1. Accounts and onboarding

- **FR-1.1** A user must be able to register with email + password, and sign in on multiple devices.
- **FR-1.1a** **Password reset, email verification, email change, session list and security
  notifications are v1** ([04 §2a](04-security-and-auth.md)). Multi-user retired the old
  justification for deferring them.
- **FR-1.1b** **Onboarding** must get a new user to a first logged set fast, asking only for
  units and what they train. Everything else — RIR, mesocycles, deloads, HR zones — is introduced
  in context, the first time it is relevant, and is skippable. A user who never opens the planner
  must still have a working workout logger.
- **FR-1.1c** **Progressive disclosure is a requirement, not a style.** No advanced feature may be
  removed to accommodate beginners, and no beginner may be blocked by vocabulary
  ([07 §5](07-brand-and-ui.md)).
- **FR-1.2** A user profile holds: display name, unit system (metric/imperial), **language**, body
  weight, birth date, sex, max HR, resting HR. All optional except unit system and language, both
  of which default from the device.
- **FR-1.3** Unit system is a **display preference only**. Storage is always SI — see INV-01. It is
  **one setting for every unit**: kg/lb, km/mi, m/ft, min/km ↔ min/mi, km/h ↔ mph, °C/°F
  ([ADR-008](decisions/ADR-008.md)).
  - **Prescribed loads are liftable in the user's own unit** (INV-02). An imperial user's barbell
    moves in 5 lb steps — not 2.5 kg steps rendered as 5.5 lb.
  - **Switching unit system mid-block never changes history.** Projected microcycles re-project
    against the new unit's increments, previewed before the user commits (INV-06, FR-3.6a).
- **FR-1.4** A user must be able to export all their data and to delete their account
  permanently. See [04-security-and-auth.md](04-security-and-auth.md) §7.
- **FR-1.5** The app must be fully usable offline after first sign-in, including on a device that
  has been offline for weeks.
- **FR-1.6** **English and Brazilian Portuguese are both fully supported from the first release**
  ([ADR-008](decisions/ADR-008.md)). Language is independent of unit system and can be changed at
  any time. Reference content — exercise names, sports, explainers, emails — is translated; anything
  the user typed is shown exactly as typed, in whatever language they typed it (INV-27).

---

## 2. Strength — catalog and logging

### 2.1 Exercise catalog
- **FR-2.1** Ships with a seeded global catalog (~200 exercises) carrying: name, modality
  (barbell / dumbbell / machine / cable / bodyweight / band / other), primary muscle, secondary
  muscles, unilateral flag, and a **default load increment** (INV-02).
- **FR-2.2** A user must be able to create custom exercises, and to edit or archive them.
  Global catalog entries are read-only; "editing" one forks it into a user copy.
- **FR-2.3** Exercises declare what they track: `weight+reps` (default), `reps only`
  (bodyweight), `time` (plank), `distance+time` (farmer's carry). The set-logging UI adapts.
- **FR-2.4** Archiving an exercise must never delete or orphan historical sets (INV-11).

### 2.2 Routines (templates)
- **FR-2.5** A user must be able to build reusable routines: an ordered list of exercises, each
  with target sets, a target rep range, target RIR, and rest timer.
- **FR-2.6** Routines support **supersets** — exercises grouped so the UI alternates between them.
- **FR-2.7** Starting a routine creates a workout pre-filled with the routine's targets and the
  weights used last time for those exercises.

### 2.3 Logging a session
- **FR-2.8** A live workout must support: add/remove exercise, reorder, add/remove set, per-set
  entry of **weight, reps, and RIR**, mark set complete, rest timer auto-starting on completion,
  per-exercise and per-workout notes.
- **FR-2.9** Set types must be distinguishable: `warmup`, `working`, `drop`, `backoff`, `amrap`.
  Only `working` and `amrap` sets count toward volume, PRs, and progression (INV-04).
- **FR-2.10** **RIR is optional per set but first-class**: one tap on a 0–5+ chip row, never a
  keyboard. It defaults to the planned target RIR when the set came from a plan.
- **FR-2.11** A workout in progress must survive app kill, phone restart, and days of elapsed
  time. It lives in the local database, not in memory (INV-09).
- **FR-2.12** Previous-performance hints must be shown inline per set ("last time: 40 kg × 6 @2").
- **FR-2.13** A user must be able to log a workout retroactively with a chosen date/time.

### 2.4 History and analysis
- **FR-2.14** Per exercise: a history list and charts for top-set weight, estimated 1RM, and
  total volume over time.
- **FR-2.15** Personal records must be detected and surfaced: heaviest weight, best e1RM, best
  volume in one session, best reps at a given weight. Sets from deload cycles are excluded from
  PR celebration but still recorded (INV-08).
- **FR-2.15a** **Bodyweight exercises count the lifter.** For an exercise with `uses_bodyweight`, e1RM,
  tonnage and weight PRs use **body weight plus added load**, where body weight is the latest logged
  entry **on or before the set's date** — so weighing in never rewrites history. With no body weight
  logged by that date, e1RM is not computed, exactly as for a set without RIR (INV-07). Displayed as
  "BW + 20 kg".
- **FR-2.16** Volume per muscle group (working sets) must be reportable **per microcycle** — this
  is the number that drives hypertrophy programming, and it belongs to the training cycle, not the
  calendar. A calendar-week view is also offered for people whose microcycle is 7 days or who
  simply think that way, and the two must be clearly labelled as different questions (INV-25).
  - **Secondary muscles count as 20 % of a set.** Each counted set (INV-04) credits its exercise's
    primary muscle with **1.0** set and each secondary muscle with **0.2**. Four sets of bench press
    are 4.0 sets of chest and 0.8 sets each of triceps and front delts. The same weighting applies
    to tonnage wherever tonnage is attributed per muscle.
  - **Per-muscle figures are not additive.** Summed across muscles they exceed the sets actually
    performed — those four bench sets are 5.6 muscle-sets — so they are never added into a workout
    or microcycle total. Total sets and tonnage are counted once, per set.
  - **Analytics only.** The weighting never reaches the progression engine or the XP scorer, both of
    which work per exercise rather than per muscle.
- **FR-2.17** **RIR-specific analysis** — the differentiator. Average RIR per exercise per
  microcycle, showing whether the block is actually getting harder. A block where microcycle 8 is
  logged at the same RIR as microcycle 1 is a block that is not progressing, and the app must say
  so.

---

## 3. Strength — the progression planner

This section is the core of the product. Read it carefully; disagreement here is expensive later.

### 3.1 Structure

> **The training cycle is not the calendar week.** A microcycle is whatever length the user says
> it is — 5 days, 7, 9, 10. This is the unit the whole planner is built on (INV-25).

- **FR-3.1** A **mesocycle** has a name, a goal (hypertrophy / strength / peaking / maintenance),
  a start date, a **user-chosen number of microcycles (2–52)**, a **default microcycle length in
  days (1–28)**, and a **user-chosen deload policy**. The app offers presets but decides nothing
  on the user's behalf.
- **FR-3.1a** A **microcycle** is the repeating training unit. Its length is set per mesocycle and
  **overridable per microcycle** — a block of mostly 7-day cycles with one 5-day cycle during a
  travel week is a legitimate, supported thing.
  - 7 days is a **default, never an assumption.** A 9-day microcycle drifts across the calendar by
    design: cycle 1 might start on a Monday and cycle 2 on a Wednesday. That is the point of
    choosing 9 — the training rhythm is decoupled from the working week.
  - Sessions are placed by **day index within the cycle** (day 1..N), never by weekday.
- **FR-3.1b** Deload policy is one of three explicit modes, chosen by the user:
  `none` · `every_n_microcycles` (with N, and whether the final cycle is also a deload) ·
  `manual` (the user flags specific microcycles). `none` is a first-class option, not the absence
  of a setting, and must not be second-guessed by any "we recommend a deload" nag.
- **FR-3.1c** Block length, microcycle length and deload policy remain editable after generation.
  Extending a block appends projected microcycles; shortening it drops trailing **projected**
  microcycles only, and refuses to drop a `completed` or `in_progress` one (INV-06).
  **Changing a microcycle's length re-projects only the microcycles that have not started**, and
  shifts the start dates of everything after it.
- **FR-3.2** A mesocycle contains **microcycles**; each microcycle contains **planned sessions**
  (assigned to a **day index**, 1..cycle length); each session contains **planned exercises**;
  each planned exercise contains **planned sets** carrying a target weight, target reps, and
  target RIR.
- **FR-3.3** The user defines **microcycle 1 only** — its length, its session structure and its
  starting loads. The engine generates microcycles 2..N.
- **FR-3.3a** Both views must exist and must agree: a **cycle view** (microcycle × day index — how
  the programme is authored) and a **calendar view** (real dates — how life is actually lived).
  With a non-7-day microcycle these look very different, and the calendar view is the one that
  answers "what am I doing Thursday".
- **FR-3.4** Every planned set is **materialised as a row** at generation time, not computed on
  read. The whole block is visible and editable on day one. See [ADR-002](decisions/ADR-002.md).

### 3.2 Progression strategies
Each planned exercise carries exactly one **progression rule**, chosen by the user and
**switchable at any time, including mid-block** — changing it re-projects the remaining projected
microcycles and nothing else (INV-06). There is no product-imposed default; the mesocycle builder asks.

**Rounding.** Every prescribed load passes through `round_to_increment(weight_kg, increment_kg, mode)`,
the only rounding in the codebase (INV-02), with `mode` one of `nearest`, `down` or `up`. A value exactly
halfway between two steps goes to the **lighter** one — 41.25 kg on a 2.5 kg grid prescribes 40 kg
([ADR-010 § Amendment](decisions/ADR-010.md)).

Six strategies are specified; **five are v1** and `cycle_pattern` is v2 (see below):

**(a) `linear_load`** — fixed sets × reps, add load each microcycle.
```
next_weight = round_to_increment(current_weight + load_step_kg)
```
Or `load_step_bp` (integer basis points; 250 = 2.5 %) of the cycle-1 weight, if the user prefers percentages. This is the strategy in
the user's 40 kg → 62.5 kg example.

**(b) `double_progression`** — the reason min/max rep limits exist. Hold the load, add reps until
the top of the range, then add load and drop back to the bottom.
```
if current_reps < max_reps:  next = (weight, current_reps + rep_step)
else:                        next = (round_up(weight + load_step), min_reps)
```
Range 6–8, step 2.5 kg: `3×6@40 → 3×7@40 → 3×8@40 → 3×6@42.5 → …`

**(c) `percent_1rm`** — each cycle prescribes a % of the exercise's e1RM, following a wave the
user defines (e.g. 70/75/80/deload). Recomputed against the *latest* e1RM at reconciliation.

**When there is no e1RM.** INV-07 makes e1RM NULL whenever RIR was not logged, and for anything
past `effective_reps = 12`. A strategy defined as "a percentage of a number" needs an answer for
"there is no number", and INV-07 forbids inventing one:

- **At generation**, the rule carries `baseline_e1rm_kg`, supplied when the user chooses the
  strategy — pre-filled from history where an e1RM exists, typed in where it does not. The user
  already defines microcycle 1 by hand (FR-3.3), so this asks nothing new of them, and it makes
  generation **total**: `percent_1rm` can always produce a block.
- **At reconciliation**, if the completed sets yield no e1RM, the engine **holds the existing
  baseline** and re-projects from it unchanged. It does not estimate from reps, and it does not
  skip the cycle.
- It says so, once, plainly: the strategy is running open-loop because RIR was not logged. That is
  a cost INV-07 deliberately imposes, and the right response is to state it — not to substitute a
  guess that would then propagate into every prescription derived from it.

This keeps the engine total, pure and idempotent (INV-10) without a clock, an estimate, or a
special case for the empty block.

**(d) `rir_autoregulated`** — the RIR-native strategy. Target RIR descends across the block
(e.g. cycle 1 @ RIR 3 → final cycle @ RIR 0/1) while load climbs; the actual RIR logged last
cycle determines how big this cycle's jump is. See §3.4.

**(e) `cycle_pattern`** — **v2, not v1.** The user defines a repeating pattern of microcycles and
the engine tiles it across the block. A pattern step is a multiplier or delta applied to the running
baseline:
```
pattern = [ {load:+2.5kg}, {load:+2.5kg}, {load:+2.5kg}, {load:×0.85, sets:×0.5} ]
```
tiled over 24 microcycles gives six 3-up-1-down waves; `[{load:+2.5},{reps:+1},{load:+2.5},{reps:-1}]`
undulates. The baseline advances only on steps that change it, so a down cycle does not compound.

**Why it is deferred:** its headline use case — *three cycles up, one cycle easy, repeat* — is
**already covered** by `linear_load` with `deload_mode = 'every_n_microcycles', n = 4` (FR-3.1b). What
`cycle_pattern` uniquely adds is **undulation**: varying reps cycle to cycle (heavy 5s → light 12s →
medium 8s) rather than only load. That is a real training style but a niche one, and it is the
most complex of the six to design correctly. Build it after a real block has been run in the app,
when there is evidence about what the pattern editor actually needs to express.

*The schema carries `cycle_pattern jsonb` from day one* ([03 §5](03-database-schema.md)) so adding
it later is a strategy branch in the engine, not a migration.

- **FR-3.5** A sixth pseudo-strategy `fixed` must exist: never change anything (for accessories
  and rehab work).
- **FR-3.6** Rules are attachable at three levels, most specific winning:
  exercise-in-this-mesocycle → mesocycle default → user default.
- **FR-3.6a** Changing an exercise's strategy mid-block must show a preview of the re-projected
  remaining microcycles **before** committing. Switching from `linear_load` to
  `double_progression` in cycle 5 is a legitimate thing to do and must not silently discard
  cycle 5's achieved load — the new strategy starts from where the user actually is.

### 3.3 Bounds, deloads and rounding
- **FR-3.7** Every rule carries `min_reps` and `max_reps`. No generated prescription may fall
  outside them (INV-05).
- **FR-3.8** Rules carry `min_rir` and `max_rir` bounds with the same guarantee.
- **FR-3.8a** **Target RIR granularity is the user's choice, carried on the progression rule**
  (`rir_mode`: `per_exercise` | `per_set`). `per_exercise` sets one target for every set of that
  exercise; `per_set` allows a descending ladder — earlier sets at RIR 2, the last set to failure.
  Because it lives on the rule, it inherits the FR-3.6 cascade: a user default, overridable per
  mesocycle, overridable per exercise.
  - **Storage is unaffected.** `planned_sets.target_rir` exists per set either way; `rir_mode`
    governs *authoring*, not the shape of the data. Switching modes mid-block is therefore an
    ordinary re-projection, not a migration.
  - Default is `per_exercise` — the simpler surface. `per_set` is a control an advanced user
    reaches for, never one a beginner is asked about (FR-1.1c).
  - **Under `per_set`, each set's target is a sum:** the exercise target RIR, which the engine
    progresses, plus that set's offset from a ladder the user authors once (`[2, 1, 0]`). **Every sum
    is clamped into `[min_rir, max_rir]`** and the set is marked as clamped, so the plan can say why a
    set reads RIR 3 rather than 5. A ladder wider than its bounds is flattened until the user widens
    them — the engine never generates a set outside the rule (INV-05, ADR-010).
- **FR-3.9** Deloads follow the policy chosen in FR-3.1b. When a microcycle is a deload it applies
  multipliers — default: sets × 0.5, load × 0.6, target RIR + 2 — all user-overridable per
  mesocycle. Under policy `none` no microcycle is ever a deload and the engine must not insert one.
  A deload microcycle may also be given a **different length** from the rest of the block, which is
  a common and legitimate way to programme one.
  - *Exactly what a deload prescribes* (settled 2026-09-26, [task 005](tasks/005-strength-progression-planner.md)):
    it multiplies **each set's last working prescription** — the cycle before it, or the last one that was not a
    deload — and **does not consume a progression step**, so the cycle after it resumes one step past the last
    working cycle. That is what the worked example in [00](00-project-context.md) already says: 50 kg at cycle 5,
    **30 kg** at cycle 6, **52.5 kg** at cycle 7.
  - The load is `round_to_increment(load × deload_load_bp, nearest)` (INV-02). The working-set count is
    multiplied by `deload_set_bp` with **a tie going to the fewer sets** — the rule ADR-010 gives loads, so 3 sets
    become 1 — and **never below one**, so a deload never removes an exercise. Warm-up, drop and back-off sets are
    not counted sets (INV-04), so the cut leaves them in place — but their loads and RIR are deloaded like every
    other set's, or a back-off set would outweigh the working sets it follows.
  - The target RIR is raised by `deload_rir_bump` and **clamped into the rule's bounds** (INV-05); a clamped set
    is marked `was_clamped`, so the plan can say why it reads RIR 4 rather than 5.
  - Under `every_n_microcycles`, every N-th cycle is a deload, and "the final cycle too" adds the last cycle
    when N does not already land on it. Cycle 1 is never a deload: it is the user's own baseline (FR-3.3).
  - A deload applies to every exercise in the cycle, `fixed` ones included: `fixed` holds the progression still,
    and the deload is the cycle's, not the exercise's.
- **FR-3.10** Every generated load must be rounded to a **liftable** value for that exercise's
  equipment (INV-02). 41.6667 kg must never reach the screen.

### 3.4 Reconciliation — the feedback loop
When a planned session is completed, the engine compares prescription to reality and re-projects
the remaining **projected** microcycles. It must never rewrite a completed, in-progress, or
user-locked microcycle (INV-06).

Outcome classification per planned exercise:

| Outcome | Condition | Effect on next microcycle |
|---|---|---|
| **Exceeded** | all sets hit target reps, and logged RIR > target RIR + 1 | Apply a double step |
| **Met** | all sets hit target reps within RIR tolerance | Apply the normal step |
| **Under** | any working set fell short of `min_reps`, or RIR was 0 when target ≥ 2 | Apply `failure_policy` |
| **Missed** | session not logged at all | Shift the block, or skip — user's choice |

- **FR-3.11** `failure_policy` per rule, one of: `hold` (repeat the same prescription),
  `repeat_cycle` (re-run the whole microcycle), `reduce_load` (back off by a configured %).
- **FR-3.12** Two consecutive `Under` outcomes on the same exercise must raise a visible
  suggestion to deload or end the block early. The app advises; it never silently rewrites a
  block out from under the user.
- **FR-3.13** Reconciliation must be **deterministic and idempotent** — same inputs, same output,
  and running it twice changes nothing (INV-10). It is a pure function; this is what makes it
  testable and what lets the client and server agree.
- **FR-3.14** The user must always be able to hand-edit any planned set. A hand-edited set is
  marked `user_edited`; the engine treats it as the new baseline rather than overwriting it.

### 3.5 Plan ↔ log linkage
- **FR-3.15** Starting today's planned session must create a workout pre-filled with the
  prescription, each logged set carrying a reference back to its planned set.
- **FR-3.16** A user may deviate freely — swap exercises, add sets, skip. Deviation is recorded,
  not blocked.
- **FR-3.17** Plan adherence (% of prescribed working sets actually completed) must be reportable
  per microcycle and per block.

---

## 4. Cardio — recording

**Every sport gets its own experience.** A pool swim is not a slow run. This section is
deliberately organised per sport rather than as one generic recorder with exceptions, because
building for running and bolting the rest on afterwards produces an app that is bad at everything
except running (INV-19).

### 4.0 Sport profiles — the mechanism
- **FR-4.0** Each sport resolves to a **sport profile** declaring:
  recording mode (`gps` / `lap` / `manual`) · primary metric · pace unit · which live fields are
  shown and in what order · which per-sport fields exist · which summary metrics are computed ·
  what the auto-split unit is.
- **FR-4.0a** The recorder, the live screen, the finish screen, the detail screen and every
  aggregate read the profile. **Adding a sport is a new profile plus its entry component, never
  a change to shared logic** (INV-19).
- **FR-4.0b** Cross-sport totals are summed in **time**, never distance (INV-20).

**FR-4.0c — The v1 sport set is the classic three disciplines plus their indoor equivalents plus
walking.** Six sports, seeded and fully built:

| # | Sport | Mode | Primary metric | Pace unit | Task |
|---|---|---|---|---|---|
| 1 | **Run** | GPS | distance | min/km | 007 |
| 2 | **Ride** (bike) | GPS | distance | km/h | 007 |
| 3 | **Walk** | GPS | distance + elevation | min/km | 007 |
| 4 | **Pool swim** | **Lap** | lengths × pool length | **min/100 m** | 008 |
| 5 | **Treadmill** | Manual | distance or duration | min/km | 008 |
| 6 | **Indoor bike** | Manual | distance or duration | km/h | 008 |

**Deferred sports** — each is a `sport_profiles` row plus an entry component (INV-19), added when
the user actually wants it, never speculatively:

| Sport | Mode | Pace unit | Why deferred |
|---|---|---|---|
| Trail run | GPS | min/km | Run's profile with different elevation weighting — nearly free |
| Hike | GPS | min/km | As above |
| Open-water swim | GPS | min/100 m | Needs its own GPS filter tuning (submerged device) |
| Indoor row | Manual | /500 m | A distinctive erg-monitor UX; real work for a sport not yet requested |
| Others (ski, elliptical, …) | — | — | On request |

The framework is what makes this list cheap to extend. **Deferring a sport must never mean the
architecture assumes it does not exist** — that is exactly what INV-19 prevents.

### 4.1 GPS sports — run, ride, walk (v1); trail run, hike, open-water swim (deferred)
- **FR-4.1** Recording must capture GPS continuously **with the screen off and the app
  backgrounded**, surviving hours in the background.
- **FR-4.2** Live screen per the profile's field list: elapsed, moving, distance, current pace in
  the profile's unit, average pace, elevation, HR if paired. Pause / resume / lap / finish /
  discard.
- **FR-4.3** **Auto-pause** at a configurable speed threshold, defaulting per sport (a ride's
  threshold is not a walk's). Moving and elapsed time stored separately, never conflated (INV-12).
- **FR-4.4** Auto-splits at the profile's unit **in the user's unit system** — 1 km or 1 mi for run
  and walk, 5 km or 5 mi for ride, 100 m for open-water swim — plus manual laps. Splits are computed
  in both bases at finish, so changing unit system never recomputes an activity (ADR-008).
- **FR-4.5** GPS noise filtered before distance accumulates: drop poor-accuracy points, reject
  implausible jumps, smooth elevation. Raw unfiltered GPS overstates both distance and elevation.
- **FR-4.6** A crashed or killed recording must be recoverable — points written to the local
  database as they arrive, never buffered only in memory.
- **FR-4.7** *(deferred sport)* Open-water swim is a GPS sport with a caveat: the device is
  submerged most of the time, so the track is sparse and noisy. Its filter needs separate tuning
  and its distance is presented as an estimate. Do not add it by reusing the run filter.

### 4.2 Pool swim — lap-based, no GPS
- **FR-4.8** Pool swimming is **not** recorded by GPS and must never be shown a map, an elevation
  chart, or a `min/km` pace.
- **FR-4.9** Setup asks for **pool length** (25 m / 50 m / 25 yd / custom) before starting. It is
  stored per activity, because the user's pool changes.
- **FR-4.10** Entry is by **length or set**, not by continuous recording:
  - a big lap button to count lengths live, *or*
  - post-hoc set entry: `4 × 100 m freestyle @ 1:45, 20 s rest`.
- **FR-4.11** Per-set fields: **stroke** (freestyle / backstroke / breaststroke / butterfly /
  medley / kick / pull / drill), distance, duration, rest, stroke count.
- **FR-4.12** Swim-specific derived metrics: **pace per 100 of the pool's unit** — per 100 m in a
  metre pool, per 100 yd in a yard pool, regardless of the user's unit setting (INV-01) — and
  **SWOLF** (`seconds per length + strokes per length`) where stroke count was entered. Total
  distance is `lengths × pool_length`, computed — never typed as a distance the user has to work
  out.
- **FR-4.13** The screen must be usable with wet hands and glare: very large targets, high
  contrast, and no gesture that needs precision.

### 4.3 Treadmill and indoor bike — manual entry (v1)
- **FR-4.14** Treadmill and indoor bike: distance, duration, average speed/pace, incline or
  resistance, optional watts. Single-screen manual entry; these are the simple ones.
- **FR-4.15** Interval entry for indoor sports: `N × (distance or duration, rest)` with
  per-interval results, rather than one lump total.
- **FR-4.16** *(deferred sport)* Indoor row uses **/500 m split** as its pace unit, with stroke
  rate (spm) and optional average watts. These are the numbers on the erg monitor; entry should
  mirror the monitor's layout so the user transcribes rather than translates.
- **FR-4.17** Manual entry must never require inventing a GPS track or a location, and must never
  request location permission ([05 §1a](05-integrations.md)).

### 4.4 Common to all sports
- **FR-4.18** After finishing: title, perceived effort, notes, privacy setting; then save.
- **FR-4.19** Every sport supports **retroactive entry** with a chosen date and time.
- **FR-4.20** HR, where a monitor is paired, applies to every sport including pool swim (v2 —
  see [05 §2](05-integrations.md)).

## 5. Cardio — history and analysis

- **FR-5.1** Activity detail is **rendered from the sport profile** (INV-19): a run shows map,
  splits and elevation; a pool swim shows a set-by-set table, stroke breakdown, pace per 100 m and
  SWOLF — and no map at all; an erg piece shows intervals and /500 m splits.
- **FR-5.2** Personal bests **per sport, in that sport's own terms**: fastest 1 k / **1 mi** / 5 k /
  10 k and biggest climb for running — race distances are the same in every unit system, and the
  mile is one of them; fastest 100 m / 400 m and best SWOLF for swimming; best 2 k and 5 k
  split for rowing; longest ride and biggest climb for cycling. A single shared PR list across
  sports is meaningless.
- **FR-5.3** Weekly and monthly totals: time (cross-sport, INV-20), plus distance and elevation
  **within** each sport.
- **FR-5.4** HR zone distribution per activity and per week, from the user's max HR (INV-14).

## 6. Cardio — planning

- **FR-6.1** A **cardio plan** mirrors the mesocycle exactly, including its cycle model: name,
  goal (base / 5 k / 10 k / half / marathon / swim / triathlon / custom), start date, a
  **user-chosen number of microcycles (2–52)**, a **user-chosen microcycle length (1–28 days,
  overridable per cycle)**, and the same three-mode deload policy as FR-3.1b, including `none`.
- **FR-6.2** Each plan microcycle carries a target volume. **Volume is per sport** — a plan may
  target 40 km running and 4 km swimming in the same cycle, and those numbers are never added
  together (INV-20). Cross-sport load is expressed in time.
- **FR-6.3** Each planned session carries a sport, a **session type** (easy / long / tempo /
  interval / recovery / technique / race), a **day index** within the microcycle, a target distance
  or duration, and a target intensity expressed as an HR zone or a pace range **in that sport's
  pace unit** (INV-19).
- **FR-6.3a** Session types are per-sport: a swim plan needs `technique` and `drill` sessions
  that a running plan does not, and the session-type list comes from the sport profile.
- **FR-6.4** Interval sessions need structure, not just a total: warm-up, N × (work, recovery),
  cool-down. Stored as a small structured tree, and rendered as "10 min WU, 6 × (3 min Z4 /
  90 s Z1), 10 min CD".
- **FR-6.5** Progressive overload for cardio is **volume per microcycle**, with a safety rail:
  default +10 % per cycle, and a hard cap the user must consciously override.
- **FR-6.5a** **The 10 % rule is a per-*week* heuristic, so it must be normalised by cycle length.**
  A +10 % step applied to a 5-day microcycle is a far steeper ramp in real time than the same step
  on a 9-day one. The rail is therefore checked against the **daily average rate**, not the raw
  per-cycle percentage, and the default step is scaled from the user's cycle length. Applying a
  flat +10 % to a 5-day cycle would quietly ramp ~40 % faster than the heuristic intends — exactly
  the injury the rail exists to prevent (INV-25).
- **FR-6.5b** **The rail is exact.** The rule is +10 % per 7 days, **compounded**: a cycle of `n` days
  may raise volume by at most `1.10^(n/7) − 1`. That is computed once for every cycle length, rounded
  **down** to whole basis points, and frozen in the domain core; the check is the integer comparison
  `volume_step_bp ≤ RAIL_BP[length_days]` ([ADR-010](decisions/ADR-010.md)). The default step for a
  cycle is the table's own value, so a default plan can never trip its own rail. Overriding the rail is
  a deliberate, recorded user action (FR-6.5); rounding never loosens it.

  | Days | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | Max step (bp) | 137 | 276 | 416 | 559 | 704 | 851 | **1000** | 1150 | 1303 | 1458 | 1615 | 1774 | 1936 | 2100 |

  | Days | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | Max step (bp) | 2265 | 2434 | 2604 | 2777 | 2952 | 3130 | 3310 | 3492 | 3677 | 3864 | 4055 | 4247 | 4443 | 4641 |

- **FR-6.6** Deload microcycles, when the policy has any, reduce volume (default × 0.6) and drop
  intensity sessions. Under policy `none`, no microcycle is ever a deload.
- **FR-6.7** Reconciliation as in §3.4, on per-cycle volume: a completed microcycle well under
  target holds the next one's volume rather than compounding the miss.
- **FR-6.8** Completed activities must be matchable to planned sessions (same day + same sport
  auto-matches; the user can re-match manually).

## 7. Cross-cutting

- **FR-7.1** One unified calendar showing strength and cardio sessions — planned and completed —
  side by side. Both plans can run concurrently; this is where they meet.
- **FR-7.2** A "today" home screen: what is prescribed today, from either half, one tap to start.
- **FR-7.3** Combined load view over a rolling window, so the user can see a hard leg day sitting the day before
  a long run.

## 8. Gamification

Specified in full in [08-gamification.md](08-gamification.md); the binding requirements are:

- **FR-8.1** **Independent progression tracks, matched to what the user actually trains.** Four
  **quality** tracks — consistency, recovery, precision, progression — are active for everyone from
  day one. **Discipline** tracks are one per sport plus `strength`, and each **comes into existence
  the first time its sport is logged**. A user who lifts and swims has six tracks and never sees a
  Ride track at zero. Each levels separately; there is no single overall score.
- **FR-8.1a** A track is **never** created by configuration, a prompt, or an onboarding choice —
  only by training. And a track that would sit permanently at level 1 must not be displayed at all:
  an unused track reads as an unfinished task, and the only way to "finish" it is to train a sport
  nobody prescribed ([08 §2](08-gamification.md)).
- **FR-8.2** XP is awarded **only** by comparing what was prescribed with what was logged.
  Unplanned training earns at a reduced rate, never zero.
- **FR-8.3** **Exceeding a prescribed volume or intensity earns nothing** (INV-22). A prescribed
  rest day and a deload cycle completed as prescribed earn full credit — a deload cycle is worth
  more than three ordinary sessions.
- **FR-8.4** Streaks are counted in **microcycles** (INV-25) — never in days, and never in calendar
  weeks. A cycle whose prescription was rest or deload **keeps** the streak, and one free cycle per
  quarter is carried. A broken streak is reported once, plainly, with no alarm. Displayed as
  "7 cycles", never "7 weeks" ([08 §5](08-gamification.md)).
- **FR-8.5** Levels never decrease. Nothing decays, expires or is deducted (INV-22).
- **FR-8.6** Achievements are milestone facts, never based on one extreme session, and never
  revoked.
- **FR-8.7** Progress renders as **a plain list of the user's active tracks** — name, level, XP,
  and what earned the last award ([07 §6](07-brand-and-ui.md)). The octopus is a brand mark only;
  it is never personalised, never driven by user data, and never a progress readout
  ([07 §2](07-brand-and-ui.md)).
- **FR-8.8** No public leaderboards, no daily login rewards, no loss-aversion mechanics, no
  purchasable progress. The full ban list is [08 §6](08-gamification.md).
- **FR-8.9** Gamification must be **fully disableable** in settings. A user who wants a plain
  training log gets one, with no nagging to turn it back on.

---

## 9. Subscription

Specified in [09-business-model.md](09-business-model.md) under
[ADR-006](decisions/ADR-006.md); the binding requirements are:

- **FR-9.1** Every new account gets **three months of Pro, with no payment method required.** At
  the end it becomes Free. Nobody is charged without explicitly choosing to subscribe.
- **FR-9.2** Tiers are Trial → Free → Pro (monthly or discounted annual) → Coach (v1.1).
- **FR-9.3** **Pro buys the planner** — mesocycles, cardio plans, reconciliation, advanced
  analytics. Free keeps logging, full history, all six sports, sync, export and gamification.
- **FR-9.4 (INV-26)** The paywall never touches a user's own data or their safety. Reading,
  charting and exporting history; logging a workout; recording an activity; syncing; deleting an
  account; privacy controls; and the cardio volume rails are free **at every tier, including an
  expired one**.
- **FR-9.5** A lapsed subscription **downgrades features, never revokes data**. An in-progress
  mesocycle becomes read-only — visible and manually completable, never deleted or hidden.
- **FR-9.6** **Money buys features, never progress.** No XP, level, streak protection or
  achievement may be purchased (INV-22).
- **FR-9.7** Entitlement is checked offline-first like everything else: a cached entitlement with
  a grace period, so a Pro user with no signal is never locked out of their planner at the gym.
- **FR-9.8** Upgrade prompts state the reason plainly ("Consistency measures completed planned
  sessions — Pro includes the planner") and never manufacture urgency, decay, or loss.
- **FR-9.9** Cancelling is as easy as subscribing, and reachable from within the app.

---

## Non-functional requirements

- **NFR-1 — Offline first.** Every read and write in the app must work with the network off.
  Sync is a background reconciliation, never a blocking gate. See [ADR-001](decisions/ADR-001.md).
- **NFR-2 — Set logging latency.** Tapping a set complete must render in < 100 ms, writing to
  local SQLite. No network call is on that path, ever.
- **NFR-3 — Recording battery.** GPS recording should cost ≲ 10 %/hour on a mid-range phone.
  This constrains GPS sample rate and screen-on behaviour.
- **NFR-4 — Sync correctness.** Concurrent edits on two devices must converge without data loss.
  Resolution is **last-write-wins per row**, by `updated_at` ([02 §7](02-architecture.md),
  [ADR-001](decisions/ADR-001.md)) — *not* per field, which would require per-field timestamps the
  schema does not carry and never will. Two carve-outs: sets and activities are append-only in
  practice, so a row present on either side is never dropped; and plan data resolves at
  **microcycle** granularity ([03 §11](03-database-schema.md),
  [ADR-002](decisions/ADR-002.md)) so a cycle is never assembled half from each device — where a
  higher engine version beats a lower one, and a user edit beats a projection, before any timestamp
  is consulted ([ADR-004](decisions/ADR-004.md)). A lost duplicate is acceptable. A lost *set* is
  not, and neither is a lost user edit.
- **NFR-5 — Cold start** to the "today" screen < 2 s from local data.
- **NFR-6 — Progression engine is pure.** No I/O, no clock, no randomness inside it. Given the
  same plan and the same logs it returns the same projection (INV-10).
- **NFR-7 — Test coverage** on the progression engine and the GPS distance/elevation pipeline
  must be high and case-driven. These are the two places where silent wrongness is worst: a bad
  projection ruins a training block, a bad distance calculation ruins every run retroactively.
- **NFR-8 — Data durability.** Losing a logged workout is the worst possible failure. Local
  writes are synchronous and durable before the UI acknowledges them.
- **NFR-9 — Multi-tenant isolation.** With many users, a missed query scope is a data breach, not
  a bug. INV-15 is enforced twice: in the repository layer's typed interface *and* by Postgres RLS
  ([04 §4](04-security-and-auth.md)). A test must prove the second line works with the first
  deliberately broken.
- **NFR-10 — Onboarding time-to-value.** A new user reaches their first logged set in under three
  minutes from opening the app, without reading anything they did not choose to read.
- **NFR-11 — Platform.** Android first ([ADR-009](decisions/ADR-009.md)). iOS is a planned addition
  ([task 016](tasks/016-ios-platform.md)), so no shared code may assume the operating system
  (INV-28): adding iOS must be an addition to `src/platform/`, not a port of the app.
- **NFR-12 — Concurrency (design goal).** The service is built to carry **hundreds of users active at
  the same time** as the product grows. No number is committed yet: the concrete target and the load
  test that proves it are set before launch ([PROJECT-STATUS](PROJECT-STATUS.md) open question 6).
  Two things hold from the first commit, because they are free while there is no code and expensive
  afterwards: **the API keeps no state that correctness depends on** — rate-limit counters and caches
  live in shared storage, never in process memory — so a second instance is a deploy setting, not a
  rewrite; and **database access stays compatible with transaction-mode pooling**
  ([ADR-011](decisions/ADR-011.md)). Offline-first keeps the load modest: hundreds of people training
  at once produce far fewer simultaneous requests, because devices sync in batches
  ([ADR-001](decisions/ADR-001.md)).

---

## Answered by the user

- **Progression strategy is chosen, not defaulted** (FR-3.2, FR-3.6a). Six strategies, switchable
  per exercise at any time, including mid-block. Added `cycle_pattern` to cover waves and
  undulating structures.
- **Block length and deload policy are the user's** (FR-3.1, FR-3.1a). 2–52 microcycles; deload policy
  `none` / `every_n_microcycles` / `manual`, with `none` a first-class option. Microcycle length is the user's too (INV-25).
- **RIR is not RPE** and is never converted (INV-03). Consequence: a set logged without RIR has
  no e1RM at all, rather than a guessed one (INV-07).
- **Each sport gets its own recording experience** (§4, INV-19). Sport profiles drive entry,
  display and analytics; a pool swim never sees a map or a `min/km` pace.

- **v1 sports are run, ride, walk, pool swim, treadmill, indoor bike** (FR-4.0c) — the three
  disciplines plus their indoor equivalents plus walking. Trail run, hike, open-water swim and
  indoor row are deferred, each a profile row away.
- **`cycle_pattern` is v2** (§3.2e). Its main use case is already served by `linear_load` plus a
  deload every four microcycles; the column exists so adding it later is not a migration.
- **The Rust core is conditionally accepted** — a two-day spike in
  [task 017](tasks/017-local-toolchain-device-spike.md) decides it, before task 004 ([ADR-004](decisions/ADR-004.md)).

*Answered 2026-09-09 — the four questions that were open:*

- **Gamification tracks match what the user trains** (FR-8.1, FR-8.1a). One discipline track per
  sport plus `strength`, each created automatically by the first log of that sport; the four
  quality tracks are always on. Nobody is shown a sport they do not do.
- **The octopus is a brand mark, not a dashboard** (FR-8.7, [07 §2](07-brand-and-ui.md)). The
  personal-octopus visualisation is dropped outright; Progress is a plain list of the user's own
  tracks.
- **Target RIR granularity is the user's choice**, carried on the progression rule as `rir_mode`
  and inheriting the FR-3.6 cascade (FR-3.8a).
- **Cardio intensity targets are both** HR zones and pace ranges, chosen per session (FR-6.3).
- **Bodyweight and added load sum into one volume figure**, using the user's logged body weight
  (`exercises.uses_bodyweight`).
- **Secondary muscles count as 20 % of a set** toward per-muscle volume (FR-2.16), answered
  2026-09-10. Primary 1.0, each secondary 0.2; analytics only, never the engine or the scorer.

*Answered 2026-09-11* ([ADR-010](decisions/ADR-010.md)):

- **Bodyweight e1RM uses body weight plus added load** (FR-2.15a), body weight taken on or before the
  set's date.
- **Per-set RIR is the exercise target plus a per-set offset, clamped into the rule's bounds**
  (FR-3.8a).
- **Percentages are integer basis points**, and the cycle-length safety rail is a frozen integer table
  (FR-6.5b).
- **The XP curve is a frozen 30-level table, started deliberately steep**, because INV-22 lets it be
  loosened but never tightened ([08 §2](08-gamification.md)).
- **The founding-price window does not reopen for iOS** ([09 §2](09-business-model.md)).

## Remaining open questions

None are blocking; each has a stated assumption that will be built unless corrected.

1. **Exact prices, including BRL** ([09 §6](09-business-model.md)). The structure is settled; the
   numbers are provisional.

Two things worth carrying forward from the questions that closed on 2026-09-09:

- **HR zones need `max_hr` or they are hidden entirely** (INV-14), and **swimming zones do not
  transfer from running zones** — HR runs roughly 10 bpm lower in water. A single zone set applied
  across sports would be quietly wrong for the pool.
- **One track per sport means an outdoor run and a treadmill run level separately**
  ([08 §2](08-gamification.md)). Accepted deliberately, as the consequence of INV-19. If it reads
  badly in real use, the fix is a grouping column on `sport_profiles` — never a hardcoded merge in
  the scorer.

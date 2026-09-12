# 08 — Gamification

The reward system. Its central rule is set in [ADR-005](decisions/ADR-005.md) and everything here
descends from it:

> **The app rewards doing what the plan says — including resting when it says rest.
> It never rewards volume for its own sake.**

The octopus mark ([07 §1](07-brand-and-ui.md)) is the brand's figure for a multi-sport app, and
nothing more. **It is not a progress visualisation**, and the tracks below do not map to its arms
— see [07 §2](07-brand-and-ui.md) for why that idea was dropped.

---

## 1. The problem this must not create

Fitness gamification has a well-known failure mode: it rewards *more*, so users do *more*, and
more is how people get injured. A daily streak is the sharpest version — it punishes rest days,
and rest days are prescribed **by this app's own planner**. A naive streak would have the product
rewarding users for disobeying it.

So the design constraint is unusual and it is the whole point:

| Rewarded | Not rewarded |
|---|---|
| Completing a prescribed session | Adding unprescribed volume |
| Taking a prescribed rest day | Training through a rest day |
| Completing a **deload cycle as prescribed** | "Beating" the deload |
| Logging RIR honestly | Logging RIR that flatters |
| Measurable progression over a block | A single heroic session |
| Finishing a block | Abandoning a block for a fresh start |

A deload cycle is one of the highest-value cycles in the system (§3, Recovery track). Doing less,
on purpose, on schedule, is an achievement — and this app is unusual in being able to say so,
because it knows what was prescribed.

---

## 2. Structure: tracks that match what the user actually trains

Each track levels independently. There is no single overall score that could be maxed by grinding
one dimension — and, equally important, **no track a user never trains sits on their screen at
level 1 forever.**

### The track set is per user, and it assembles itself

A user who lifts and swims has a **Strength** track and a **Pool swim** track. Not a Ride track at
zero, not a greyed-out Run slot, not an empty space where a sport they do not do would go. Nothing
is configured and nothing is chosen: a discipline track **comes into existence the first time its
sport is logged**, and stays for good afterwards.

*Why it works this way, and why it is a safety property rather than tidiness:* a permanently
level-1 Ride track is not neutral. It reads as an unfinished set, and the obvious way to complete
an unfinished set is to go and do a sport you had no plan to do. That is volume pressure arriving
through the back door — the same harm [ADR-005](decisions/ADR-005.md) exists to prevent, wearing a
different costume. A track the user never sees cannot nag them into a sport their programme never
asked for.

### Discipline tracks — what you train

**One per sport**, declared by the sport's own profile (`sport_profiles.xp_track`, INV-19), plus
`strength` for gym training. Adding a sport adds its track; no shared code decides the mapping.

| Track | Earns from |
|---|---|
| **Strength** | Completed gym sessions, working sets logged, blocks finished |
| **Run** · **Ride** · **Walk** · **Pool swim** · **Treadmill** · **Indoor bike** | Completed sessions of that sport; per-cycle volume *targets met* (never exceeded) |
| *Deferred sports* — trail run, hike, open-water swim, indoor row | Seeded as track rows from day one, activated if and when the sport is ever logged |

A discipline track only levels when there is a plan or a routine to compare against, or — for
unplanned training — at a reduced rate. **Unplanned work still counts**; it simply counts less
than deliberate work, because deliberate work is what the product is for.

**One track per sport, and the consequence, stated plainly:** an outdoor run and a treadmill run
level *separately*. That follows from INV-19 — they are different sports, with different profiles,
different data and different recording experiences — but it does mean someone who alternates
between them sees two tracks each moving at roughly half the rate of one. If that reads badly in
real use, the fix is a grouping column on `sport_profiles`, **not** a hardcoded merge in the
scorer.

### Quality tracks — how you train

Sport-agnostic, so **all four are active for every account from the first day**. They are the only
tracks a brand-new user has, and they are the ones that fill in first.

| Track | Earns from |
|---|---|
| **Consistency** | Microcycles where planned sessions were completed. Measured in **training cycles, never days** |
| **Recovery** | Prescribed rest days respected; deload cycles completed as prescribed |
| **Precision** | Sets logged with RIR; sessions completed as prescribed rather than improvised; plan adherence % |
| **Progression** | Verified improvement: e1RM gains, pace improvements, blocks completed with targets met |

The quality tracks are the ones a serious trainee will find hardest and most meaningful, and they
are what separates this from a step-counter with confetti.

### Levels
- Each track: **level 1–30**, on a curve that flattens deliberately. Early levels arrive in days;
  level 25+ takes months. There is no level cap race to run. The curve is the frozen table below.
- **Levels never decrease.** Detraining shows as a stale track, not a punishment. Loss aversion
  is the mechanism that drives injury, and it is banned ([ADR-005](decisions/ADR-005.md)).
- Progress is read as **a plain list of the user's own tracks** ([07 §6](07-brand-and-ui.md)) —
  name, level, XP, and what earned the last award. No avatar, no figure, no arms.

### The curve

**XP needed to reach each level** — a frozen integer table in the domain core, and the source of truth
([ADR-010](decisions/ADR-010.md)):

| L | XP | L | XP | L | XP | L | XP | L | XP |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 7 | 1510 | 13 | 9840 | 19 | 29400 | 25 | 63940 |
| 2 | 10 | 8 | 2300 | 14 | 12210 | 20 | 34030 | 26 | 71390 |
| 3 | 80 | 9 | 3290 | 15 | 14920 | 21 | 39080 | 27 | 79360 |
| 4 | 230 | 10 | 4530 | 16 | 17970 | 22 | 44580 | 28 | 87870 |
| 5 | 510 | 11 | 6010 | 17 | 21390 | 23 | 50550 | 29 | 96940 |
| 6 | 930 | 12 | 7780 | 18 | 25200 | 24 | 57000 | 30 | 106580 |

Designed as `12 × (L − 1)^2.7`, rounded to the nearest 10 — but **the table runs, not the formula**, so a
floating-point power can never put a user on level 12 on their phone and level 11 on the server. A
track's thresholds are multiplied by its `level_scale_bp / 10000` in integer arithmetic.

What that means for someone completing four prescribed sessions a week (about 400 XP a week on that
track):

| Level 2 | Level 5 | Level 10 | Level 15 | Level 20 | Level 25 | Level 30 |
|---|---|---|---|---|---|---|
| first session | ~9 days | ~11 weeks | ~9 months | ~1.6 years | ~3 years | ~5 years |

**Why it starts steep.** INV-22 forbids lowering anyone's level, so the curve can only ever be loosened,
never tightened. A curve launched too easy is permanent; one launched slightly hard can be relaxed on
evidence. So the early levels are fast — where motivation is won or lost — and everything past the
middle sits at the demanding end of reasonable.

---

## 3. Earning

XP is awarded by a **pure function of what the plan prescribed and what was logged** — the same
inputs the reconciliation engine already has ([ADR-002](decisions/ADR-002.md)), and subject to the
same purity and idempotence rules (INV-10, and INV-21 below).

Indicative awards, to be tuned against real use:

| Event | Track | XP |
|---|---|---|
| Prescribed strength session completed | Strength | 100 |
| …with every working set at or inside its target RIR | Precision | +40 |
| Unplanned workout logged | Strength | 40 |
| Prescribed cardio session completed | that sport | 100 |
| Cycle volume target met (within ±10 %) | that sport | 60 |
| Cycle volume **exceeded by > 25 %** | — | **0 — and a gentle note** |
| Prescribed rest day respected | Recovery | 25 |
| **Deload cycle completed as prescribed** | Recovery | **300** |
| Full training block completed | Consistency | 500 |
| Every set in a session logged with RIR | Precision | 30 |
| Verified e1RM improvement on a main lift | Progression | 150 |
| Verified pace improvement over a standard distance | Progression | 150 |

Note the shape: **a deload cycle pays more than three ordinary sessions**, and exceeding a volume
target pays nothing at all. That is the value system, expressed in numbers.

### Anti-farming
- XP is capped per day and per microcycle per track. Grinding cannot outperform following the plan.
- Retroactive logging earns XP; back-dating a fabricated month does not — awards are computed
  once per logical session and are idempotent (INV-21).
- Deleting and re-logging a workout does not re-award.

---

## 4. Achievements

Milestones, not a grind. Each is a single fact about training, stated plainly.

**Method** — the ones this app can uniquely award
`First block completed` · `First deload taken as prescribed` · `Four blocks completed` ·
`100 sets logged with RIR` · `A block finished with ≥ 90 % adherence` ·
`A cycle where every prescribed rest day was respected`

**Discipline**
`First 5 k` · `Sub-25:00 5 k` · `First 100 km month` · `Bodyweight bench` ·
`Double-bodyweight deadlift` · `1 km swum in one session`

**Race distances are universal; round-number milestones are not** ([ADR-008](decisions/ADR-008.md)).
A 5 k is a 5 k in every unit system, so `First 5 k` and `Sub-25:00 5 k` are shown to everyone, and
`Bodyweight bench` is a ratio that no unit changes. `First 100 km month` and `1 km swum in one
session` are metric milestones with imperial twins — `First 100 mi month`, `1 mi swum in one
session` — and each user sees the set for their own system (`achievements.unit_system`). One already
earned is never revoked by a later switch (FR-8.6).

**Longevity**
`12 consecutive microcycles with a completed plan` · `One year of training logged`

Rules: achievements are **never** based on a single extreme session; they are dated and never
revoked; and they are private by default like everything else
([04 §6](04-security-and-auth.md)).

---

## 5. Streaks, done responsibly

The word is kept but the mechanic is rebuilt.

- **The unit is the microcycle, not the day — and not the calendar week either** (INV-25).
  Training is programmed in cycles of the user's own length; a daily streak is a category error
  that manufactures anxiety about rest, and a calendar-week streak would be wrong for anyone
  running a 9-day cycle.
- A cycle counts as kept when the *prescribed* sessions were completed — **including a cycle whose
  prescription was rest or deload**.
- **One free cycle per quarter.** Illness, travel, and life do not break a streak. This is not
  generosity; it removes the incentive to train sick, which is the exact harm streaks cause.
- A broken streak is reported as a fact, once, without alarm — no red, no flame, no "don't lose
  your streak!" notification. Ever.
- Displayed as "**7 cycles**", never "7 weeks", unless the user's cycle happens to be 7 days.

---

## 6. Explicitly banned

Non-negotiable, and enforced in review ([ADR-005](decisions/ADR-005.md)):

- ❌ Daily login rewards, or anything paying for opening the app rather than training
- ❌ Loss-aversion mechanics — decaying points, expiring progress, "you're about to lose…"
- ❌ Any reward for exceeding a prescribed volume or intensity
- ❌ Any penalty for a rest day or a deload
- ❌ Public leaderboards in v1 (§7)
- ❌ Streak-protection or XP sold for money
- ❌ Notifications engineered around fear of loss
- ❌ Confetti, cartoon fanfare, or anything that violates the tone in [07 §1](07-brand-and-ui.md)

Celebration exists, but it is quiet and earned: a single damped 600 ms emphasis
([07 §7](07-brand-and-ui.md)), a haptic, and a clear statement of the fact.

---

## 7. Social — deliberately absent from v1

The app is now multi-user, which makes leaderboards and challenges tempting. They stay out of v1,
and the reason is not scope:

**Comparative gamification is where fitness apps cause harm.** A leaderboard rewards whoever
trained most, which is precisely the behaviour §1 exists to avoid, and it does so with social
pressure attached. Every user's optimal programme is different — comparing a 12-cycle hypertrophy
block against someone's marathon build is meaningless as well as unhealthy.

The v2 shape, if it happens, is **private groups with shared goals rather than public ranking**,
and comparison on *adherence* rather than *volume*. Two people both hitting 100 % of their own
different plans are equals, and that is a comparison worth making.

Until then the schema keeps `visibility` on activities and achievements
([03 §6](03-database-schema.md)), defaulting to private, and no read path exists.

---

## 8. Data model

```sql
gamification_tracks (            -- seeded: one row per sport (deferred sports included), plus
                                 -- `strength` and the four quality tracks
  track track_enum PK,
      -- discipline: strength | run | ride | walk | swim_pool | treadmill | indoor_bike
      --             | trail_run | hike | open_water_swim | row_indoor
      -- quality:    consistency | recovery | precision | progression
  kind  track_kind_enum NOT NULL,-- discipline | quality
  hue_token text NOT NULL,       -- related sports share a hue (07 §3); no per-track rainbow
  level_scale_bp integer NOT NULL DEFAULT 10000   -- multiplies thresholds (§2); may only decrease
)
-- No radial position column. There is no radial layout — the mark is not a dashboard (07 §2).

-- Derived (03 §11), NOT a sync root: a fold over xp_awards, kept server-side for read speed and
-- recomputed on demand on the device. A cache is never replicated; its ledger is.
user_track_progress (            -- a row exists ONLY for a track this user has activated
  user_id uuid → users, track track_enum → gamification_tracks,
  xp bigint NOT NULL DEFAULT 0,
  level smallint NOT NULL DEFAULT 1,
  activated_at    timestamptz NOT NULL,   -- quality tracks: account creation.
                                          -- discipline tracks: first award for that sport.
  last_awarded_at timestamptz NULL,
  computed_at     timestamptz NOT NULL,
  PRIMARY KEY (user_id, track)
)

xp_awards (                      -- the ledger; user_track_progress is a derivable cache
  id uuid PK, user_id uuid NOT NULL → users,
  track track_enum NOT NULL,
  amount int NOT NULL CHECK (amount >= 0),   -- INV-22: never negative. There is no schema-level
                                             -- way to deduct XP, so a decay mechanic cannot be
                                             -- added by accident.
  reason text NOT NULL,
  source_kind xp_source_enum NOT NULL,      -- workout|activity|plan_cycle|achievement|manual
  source_id uuid NULL,
  awarded_at timestamptz NOT NULL,
  ‹sync›,
  UNIQUE (user_id, source_kind, source_id, reason)   -- idempotence, INV-21
)

achievements (                   -- seeded catalog
  code text PK,
  name_key text NOT NULL, description_key text NOT NULL,     -- INV-27: keys, never text
  track track_enum NULL, tier smallint NOT NULL DEFAULT 1,
  unit_system unit_system_enum NULL   -- NULL = universal; set for round-number milestones (§4)
)

user_achievements (
  user_id uuid → users, achievement_code text → achievements,
  achieved_at timestamptz NOT NULL, source_id uuid NULL,
  ‹sync›,
  PRIMARY KEY (user_id, achievement_code)
)

adherence_streaks (
  user_id uuid PK → users,
  current_cycles int NOT NULL DEFAULT 0, longest_cycles int NOT NULL DEFAULT 0,
  last_kept_cycle_id uuid NULL,          -- the microcycle, not a date (INV-25)
  grace_used_in_quarter smallint NOT NULL DEFAULT 0,   -- §5, one free cycle per quarter
  ‹sync›
)
```

`xp_awards` is the source of truth and `user_track_progress` is a rebuildable cache, exactly like
`personal_records` ([03 §4](03-database-schema.md)). A scoring-curve change is then a replay, not
a migration — and the `UNIQUE` constraint is what makes replay safe.

**Activation stays derivable, which is what keeps the cache honest.** A discipline track's
`activated_at` is `MIN(awarded_at)` over that user's awards for it; the four quality tracks
activate at account creation. So a rebuild reconstructs *which* tracks a user has, not merely their
totals — and the track set can never drift away from the ledger that justifies it.

**Neither the totals nor the track set are synced** ([03 §11](03-database-schema.md)). `xp_awards`
syncs; the fold does not. Every device recomputes from the ledger it already has, so two devices
cannot hold different XP for the same track and race to overwrite each other.

**One constraint this puts on scoring-curve changes.** XP is monotonic by construction —
`amount >= 0`, nothing is ever deducted — but *level* is a function of XP under the curve, so a
curve made steeper would lower somebody's level on the next fold. **INV-22 forbids that.** A curve
change must therefore be level-preserving or level-raising for every existing user, and the replay
must be checked against real ledgers before it ships. Deriving the level rather than storing it
authoritatively is what makes this checkable at all: run the new curve over the old awards and
compare, before anyone sees it.

---

## 9. New invariants

These belong in [invariants.md](invariants.md) and are stated here in full because they are the
reason this system is safe.

### INV-21 — XP is awarded exactly once per logical event, by a pure function.
Scoring is a pure function of prescription and log (INV-10), and every award is keyed on
`(user_id, source_kind, source_id, reason)`. Re-running the scorer, re-syncing a workout, or
editing a logged set never double-awards.

*Why:* the client and server both score (offline-first, [ADR-001](decisions/ADR-001.md)). Without
idempotence, sync duplicates XP and the whole ledger becomes fiction.

### INV-22 — No reward is ever given for exceeding a prescription, and none is withheld for rest.
Volume beyond target earns zero, never a bonus. A prescribed rest day or deload cycle earns full
credit. No mechanic may decay, expire, or deduct progress.

*Why:* this is a safety property, not a design preference. See
[ADR-005](decisions/ADR-005.md).

*Enforced:* the scorer takes the prescription as an input and cannot see "total volume" without it;
a review checklist item; and tests asserting that a session at 150 % of target scores no more than
one at 100 %.

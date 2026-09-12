# 00 — Project Context

> # CyberAthlete
>
> Status: pre-code. Nothing in this repo is implemented yet.
> The directory is still `projeto_SHS`; the paths are not worth churning.

## What we are building

**CyberAthlete** — a mobile fitness app with two co-equal halves that share one user, one calendar,
and one planning philosophy:

1. **Strength** — a workout logger in the spirit of Hevy, extended with **RIR (Reps In
   Reserve)** on every set, and a **mesocycle planner** that writes a whole training block in
   advance and progresses load/reps cycle over cycle.
2. **Cardio** — a GPS activity tracker in the spirit of Strava, with an equivalent **plan**
   feature (per-microcycle volume progression, session types, deloads).

The thesis: existing apps do *logging* well and *planning* badly. Hevy records what you did.
Strava records where you ran. Neither tells you what to do next cycle and then adjusts when you
under- or over-perform. That adjustment loop is the product.

## Who it is for

**A multi-user product**, built for people who train seriously and follow structure — but not only
for people who already know the vocabulary.

The core user is an intermediate trainee who lifts and does cardio 3–6 days a week and wants a
programme rather than a diary. Around them are people arriving with less: someone who has heard of
progressive overload but has never run a block, someone who logs sets but has never used RIR.

The consequences we hold to:

- **The gym has no signal.** Offline logging is not a feature, it is the baseline.
- **Mid-set interaction budget is ~3 seconds.** Logging a set is one tap on a pre-filled row.
- **Progressive disclosure, not dumbing down.** RIR, mesocycles, deloads, e1RM and zones are
  *optional surfaces*. A newcomer logs weight and reps and is never blocked by a term they do not
  know; an advanced user reaches every control without digging. Nothing is removed to make room
  for beginners.
- **Other people's data is other people's.** Every row is owned and every query is scoped
  (INV-15), and a GPS trace reveals where someone lives — see
  [04-security-and-auth.md](04-security-and-auth.md) §6.

> **Note on history.** These documents were first written for a single-user app whose only user
> was the author. That premise is retired. Anywhere a doc still leans on "there is only one user"
> — cost estimates, the deferral of password reset, the absence of analytics — it has been
> revised, and the revision is flagged in place.

## The two loops

### Strength loop
```
Plan a mesocycle  →  Today's session is already prescribed (3×6 @ 40 kg, RIR 3)
      ↑                            ↓
Re-project future cycles  ←   Log actual sets (weight, reps, RIR)
```

### Cardio loop
```
Plan a block  →  Today is prescribed (easy 6 km, Z2)
      ↑                     ↓
Re-project    ←    Record GPS activity (distance, pace, HR)
```

The arrow back up — reconciliation — is the part no competitor does well and the part most
likely to be got wrong. It is specified in [01-business-requirements.md](01-business-requirements.md)
and locked down in [ADR-002](decisions/ADR-002.md).

## Worked example (the user's own, made concrete)

> "Week 1: Squats 3×6 at 40 kg, progressing weekly, leading to Week 12: Squats 3×6 at 63 kg."

Under a **linear load** rule with a 2.5 kg step (the smallest honest barbell jump), in a block the
user configured as 12 microcycles with deloads on 6 and 12:

| Cycle | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|----|---|---|---|---|---|---|---|---|---|----|----|----|
| kg | 40 | 42.5 | 45 | 47.5 | 50 | *DL 30* | 52.5 | 55 | 57.5 | 60 | 62.5 | *DL 37.5* |

Ten working cycles, nine steps, ending at **62.5 kg** — 63 kg rounded to real plates.

Every part of that is a **user choice, not a product default**: the block could be 18 or 24 cycles,
carry no deloads at all, advance by a repeating pattern instead of a flat step — and **each
microcycle could be 5, 9 or 10 days rather than 7**. The word "week" survives above only because
it is the user's own phrasing, quoted verbatim. **These documents never use it for a training
unit** — the unit is the microcycle, whatever length the user gives it, and it is called that
everywhere (INV-25). "Week" appears only where a literal calendar week is meant.

Six progression strategies are specified in [01-business-requirements.md](01-business-requirements.md) §3
and any of them can be swapped per exercise, mid-block.

## Scope

### In scope for v1
- Strength: exercise catalog, routines, live session logging with RIR, history, PRs, e1RM.
- Strength: mesocycle planner of any user-chosen length, five v1 progression strategies (six specified), optional
  deloads, min/max rep bounds, reconciliation against actual performance.
- Cardio: **per-sport recording experiences** — a pool swim is not a run and must not be logged
  like one. Six v1 sports: **run, ride, walk** (GPS), **pool swim** (lap-counted), **treadmill,
  indoor bike** (manual). Trail run, hike, open-water swim and indoor row are each one profile row
  away when wanted. See [01 §4](01-business-requirements.md).
- Cardio: plan blocks with per-microcycle volume targets, session types, optional deloads.
- Accounts, multi-device sync, offline-first operation, onboarding, password reset.
- **Two languages and two unit systems**: English and Português (Brasil); metric and imperial, one
  setting switching every unit, with loads liftable in the user's own plates. Storage stays SI.
  See [ADR-008](decisions/ADR-008.md).
- **Subscription**: three months free (no card), then a Free tier or Pro
  ([09-business-model.md](09-business-model.md), [ADR-006](decisions/ADR-006.md)). Logging,
  history, sync and export are **never** paywalled (INV-26); the planner is what Pro buys.
- **Gamification**: progression tracks that reward following the plan — including resting when it
  says rest. **The track set matches what the user actually trains**: four always-on quality tracks
  plus one discipline track per sport, each created by the first log of that sport. Someone who
  lifts and swims is never shown a Ride track at zero. See
  [08-gamification.md](08-gamification.md) and [ADR-005](decisions/ADR-005.md).
- **A brand and design system** built on an octopus mark — eight arms, one creature, many
  disciplines under one training life. It is a **brand figure only**: never personalised, never
  driven by user data, never a progress readout. See [07-brand-and-ui.md](07-brand-and-ui.md).

### Explicitly NOT in v1 (non-goals)
- **Social feed, kudos, comments, following.** The Strava half is a *tracker*, not a network.
  This removes an enormous surface (privacy, moderation, abuse, notifications) for v1.
- **Segments and public leaderboards.** Now a considered decision rather than a scope cut:
  comparative ranking rewards whoever trained most, which is the behaviour the gamification design
  exists to avoid ([ADR-005](decisions/ADR-005.md) §7).
- Nutrition, macros, bodyweight-photo tracking.
- Apple Watch / Wear OS companion apps (phone-only recording in v1).
- **Coach/client features — moved from non-goal to v1.1.** A Coach tier is part of the business
  model ([09 §3](09-business-model.md)) but is deliberately not a launch feature: it breaks the
  single-owner data model, needs a real permission layer with athlete consent, and needs its own
  security review. [Task 015](tasks/015-coach-tier.md).
- Web app. Mobile only.
- **iOS in initial development.** Android ships first; iOS is added afterwards, and the codebase is
  built from the first commit so that adding it touches only the platform layer (INV-28,
  [ADR-009](decisions/ADR-009.md), [task 016](tasks/016-ios-platform.md)).
- Strava/HealthKit import — designed for in [05-integrations.md](05-integrations.md), built later.

## Chosen stack

Decided with the user before writing these docs:

| Layer | Choice |
|---|---|
| Mobile | React Native + Expo (TypeScript) — **Android first**; iOS a planned addition ([ADR-009](decisions/ADR-009.md)) |
| Backend | FastAPI (Python 3.12), Pydantic v2, SQLAlchemy 2.0, Alembic |
| Database | PostgreSQL 16 |
| On-device DB | SQLite via `expo-sqlite` + Drizzle ORM |
| **Domain core** | **Rust** — one implementation, consumed by both ([ADR-004](decisions/ADR-004.md)) |

Rationale and the layering that follows from it: [02-architecture.md](02-architecture.md).

The Rust core is **accepted conditionally**. The progression engine and the GPS pipeline must
produce identical results on the phone and on the server; written twice (Python + TypeScript)
they will eventually disagree. One Rust crate compiled for both removes that class of bug — at
the cost of a native module and no over-the-air updates for domain changes.

The only real unknown is whether the UniFFI + PyO3 + EAS toolchain behaves, so
[task 001](tasks/001-project-bootstrap.md) spends **two days** proving the chain on one trivial
function and then records a go/no-go in [ADR-004](decisions/ADR-004.md). Nothing else waits on it.

The one tension to name up front: a **custom backend** was chosen, but a gym has no signal. The
resolution is that the phone owns a full local database and the server is a *sync target*, not
the source of truth during a workout. That is [ADR-001](decisions/ADR-001.md) and it is the most
consequential decision in the project.

## Glossary

| Term | Meaning |
|---|---|
| **RIR** | Reps In Reserve — how far the set stopped short of failure. `0` = failure, `3` = three more reps were available. **It is not RPE and is never converted to or from it.** |
| **e1RM** | Estimated 1-rep max. Our canonical formula uses RIR — see [invariants.md](invariants.md) INV-07. |
| **Microcycle** | The repeating training unit. **Any length the user chooses, 1–28 days** — 5, 7, 9, whatever. Not the calendar week (INV-25). |
| **Mesocycle** | A training block: a sequence of microcycles, often ending in a deload. |
| **Deload** | A planned easy microcycle to shed fatigue. Reduced sets and load, raised RIR. |
| **Day index** | A session's position *within* its microcycle (1..length). Never a weekday. |
| **Double progression** | Add reps until the top of a rep range, then add load and reset to the bottom. |
| **Working set** | A set that counts for volume and progression. Warm-ups do not. |
| **Prescription** | What the plan says to do: sets × reps @ load, target RIR. |
| **Reconciliation** | Recomputing future prescriptions after logging actual performance. |
| **Track** | An independently levelling strand of progress. Four *quality* tracks are always active; one *discipline* track exists per sport the user has actually logged ([08 §2](08-gamification.md)). |
| **Unit system** | `metric` or `imperial` — one setting that switches every displayed unit (kg/lb, km/mi, m/ft). Storage is always SI (INV-01). |
| **Projected cycle** | A future microcycle the engine may still rewrite. |
| **Locked cycle** | A microcycle the user has pinned; the engine will not rewrite it. |
| **Stream** | A per-sample time series from a GPS activity (lat/lng, altitude, HR, …). |

## Document map

| Doc | Answers |
|---|---|
| [00-project-context.md](00-project-context.md) | What and why (this file) |
| [01-business-requirements.md](01-business-requirements.md) | What it must do, in detail |
| [02-architecture.md](02-architecture.md) | How it is put together |
| [03-database-schema.md](03-database-schema.md) | Every table and column |
| [04-security-and-auth.md](04-security-and-auth.md) | Identity, ownership, GPS privacy |
| [05-integrations.md](05-integrations.md) | Everything external we touch |
| [06-operations.md](06-operations.md) | Build, test, deploy, run, back up |
| [07-brand-and-ui.md](07-brand-and-ui.md) | The octopus mark, colour, type, interaction, screens |
| [08-gamification.md](08-gamification.md) | Tracks, XP, achievements, and what is banned |
| [09-business-model.md](09-business-model.md) | Tiers, pricing, and what the paywall never touches |
| [invariants.md](invariants.md) | Rules no code may break |
| [responsibility-map.md](responsibility-map.md) | What belongs in which folder |
| [decisions/](decisions/) | ADRs for the twelve contested decisions |
| [tasks/README.md](tasks/README.md) | Build order and dependencies |
| [tasks/](tasks/) | Ordered implementation slices |
| [PROJECT-STATUS.md](PROJECT-STATUS.md) | **The live to-do list** — what is done, what is next, what blocks launch |

# Tasks — build order

> **CyberAthlete.** Directory stays `projeto_SHS`.
>
> This file explains the *order and why*. Live status, per-task checklists, the cross-cutting
> launch blockers and the decision log live in [PROJECT-STATUS.md](../PROJECT-STATUS.md).

File numbers reflect the order tasks were *written*, not the order they should be *built* — two
were added after the multi-user, gamification and brand requirements arrived. This is the real
order.

## Recommended sequence

| # | Task | Size | Why here |
|---|---|---|---|
| 1 | [001 Project bootstrap](001-project-bootstrap.md) | L | Everything depends on it. Contains the [ADR-004](../decisions/ADR-004.md) Rust spike — a 2-day go/no-go |
| 2 | [002 Database](002-database.md) | L | Last chance to change the schema freely |
| 3 | [011 Design system](011-design-system.md) | M | **Before any feature UI.** Task 004 builds the set row — the most important component in the app — and it should be built from a system, not retrofitted into one |
| 4 | [003 Authentication](003-authentication.md) | L | Includes password reset and email verification, now v1 blockers |
| 5 | [004 Catalog and logging](004-exercise-catalog-and-logging.md) | XL | The core loop. Usable, offline, local-only |
| 6 | [005 Progression planner](005-strength-progression-planner.md) | XL | The reason the product exists |
| 7 | [006 Sync layer](006-sync-layer.md) | L | Turns on multi-device. The hardest task |
| 8 | [007 Sport profiles + GPS](007-cardio-recording.md) | XL | The framework, then run/ride/walk |
| 9 | [008 Non-GPS sports](008-non-gps-sports.md) | M | Pool swim, treadmill, indoor bike. Proves the framework |
| 10 | [009 Cardio planner](009-cardio-planner.md) | L | Reuses the 005 engine's shape |
| 11 | [013 Gamification](013-gamification.md) | L | **Must follow 005** — the scorer takes a prescription as input (INV-22) |
| 12 | [010 Calendar and analytics](010-unified-calendar-and-analytics.md) | M | Makes the two halves feel like one app |
| 13 | [014 Subscriptions](014-subscriptions.md) | M | **After 005** — the planner is what Pro gates. Nothing to sell before it exists |
| 14 | [012 Onboarding](012-onboarding.md) | M | **Last, deliberately** — you cannot onboard someone into features that do not exist yet |

## Two ordering rules worth stating

**Design system early (position 3).** [Task 004](004-exercise-catalog-and-logging.md) builds the
set row, and [07 §6](../07-brand-and-ui.md) calls it "the product". Building it against ad-hoc
styles and retrofitting a token system later is the expensive path, and it is how dark mode ends
up broken.

**Gamification late, and never before the planner (position 11).** The scorer's input is *the
prescription* ([ADR-005](../decisions/ADR-005.md)). Any scoring built before a planner exists
would have to score volume — the single thing INV-22 forbids. The dependency is structural, not
scheduling convenience.

## Milestones

| Milestone | Through | You can… |
|---|---|---|
| **Usable alone** | 001–005 + 011 | Plan a block and train it, offline, on one device |
| **Multi-device** | + 006 | Train on a phone and a tablet |
| **Both halves** | + 007–009 | Run, ride, swim and lift, planned |
| **Feature complete** | + 010, 013 | One calendar, and tracks for the sports you actually do |
| **Sellable** | + 014 | Three months free, then Pro |
| **Ready for strangers** | + 012 | Ship it — on Android |
| **Both platforms** | + 016 | CyberAthlete on iPhone, added rather than ported |

Everything before *Ready for strangers* assumes a user who already knows the app. Onboarding is what
makes it a product rather than a tool.

## After launch

**[016 iOS platform](016-ios-platform.md) — L.** Android ships first
([ADR-009](../decisions/ADR-009.md)); iOS is then *added*. The structure for it — INV-28 and
`src/platform/` — exists from task 001, the task's first acceptance criterion is that adding iOS
touched no shared code, and its first gate is the iOS half of the ADR-004 spike.

**[015 Coach tier](015-coach-tier.md) — v1.1, XL.** Priced in the business model
([09 §3](../09-business-model.md)) but deliberately not a launch feature: it breaks the
single-owner data model, needs a real permission layer with athlete consent, carries the project's
worst privacy risk (athlete GPS traces), and is a second interface. **Announce the tier when it
exists; do not sell it before.**

[010 § After](010-unified-calendar-and-analytics.md) lists the rest: HealthKit / Health Connect,
BLE heart rate, guided interval execution, Strava import, more sports, and private-group
comparison (which needs its own ADR — see [ADR-005 §7](../decisions/ADR-005.md)).

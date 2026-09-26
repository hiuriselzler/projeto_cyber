# Tasks — build order

> **CyberAthlete.** Directory stays `projeto_SHS`.
>
> This file explains the *order and why*. Live status, per-task checklists, the cross-cutting
> launch blockers and the decision log live in [PROJECT-STATUS.md](../PROJECT-STATUS.md).

File numbers reflect the order tasks were *written*, not the order they should be *built* — six
were added late: two after the multi-user, gamification and brand requirements arrived, one when the
development machine turned out to lack administrator rights, one when the mark was split from the design system,
and two when account deletion and data export turned out to belong to no task.
This is the real order.

## Recommended sequence

| # | Task | Size | Why here |
|---|---|---|---|
| 1 | [001 Project bootstrap](001-project-bootstrap.md) | L | Everything depends on it. **Complete** |
| 2 | [002 Database](002-database.md) | L | Last chance to change the schema freely. **Complete** |
| 3 | [011 Design system](011-design-system.md) | L | **Before any feature UI.** Task 004 builds the set row — the most important component in the app — and it should be built from a system, not retrofitted into one. **Complete** |
| 4 | [003 Authentication](003-authentication.md) | L | Includes password reset and email verification, now v1 blockers. **Complete** |
| 5 | [019 Account deletion](019-account-deletion.md) | M | A legal and a store requirement. Needed only 003 and no administrator rights, so it went ahead while 017 waited for them. **Complete** |
| 6 | [017 Local toolchain, device and core spike](017-local-toolchain-device-spike.md) | L | Everything that needs administrator rights, and every check only a phone can settle. **Must come before 004** — it held the [ADR-004](../decisions/ADR-004.md) Rust spike, a 2-day go/no-go. **Complete** |
| 7 | [004 Catalog and logging](004-exercise-catalog-and-logging.md) | XL | The core loop. Usable, offline, local-only. **Complete** (2026-09-26) |
| 8 | [005 Progression planner](005-strength-progression-planner.md) | XL | The reason the product exists |
| 9 | [006 Sync layer](006-sync-layer.md) | L | Turns on multi-device. The hardest task |
| 10 | [007 Sport profiles + GPS](007-cardio-recording.md) | XL | The framework, then run/ride/walk |
| 11 | [008 Non-GPS sports](008-non-gps-sports.md) | M | Pool swim, treadmill, indoor bike. Proves the framework |
| 12 | [009 Cardio planner](009-cardio-planner.md) | L | Reuses the 005 engine's shape |
| 13 | [013 Gamification](013-gamification.md) | L | **Must follow 005** — the scorer takes a prescription as input (INV-22) |
| 14 | [010 Calendar and analytics](010-unified-calendar-and-analytics.md) | M | Makes the two halves feel like one app |
| 15 | [014 Subscriptions](014-subscriptions.md) | M | **After 005** — the planner is what Pro gates. Nothing to sell before it exists |
| 16 | [020 Data export](020-data-export.md) | M | **After 013 and 014** — an export holds every kind of data the app keeps, and those are the last to arrive |
| 17 | [012 Onboarding](012-onboarding.md) | M | **Last, deliberately** — you cannot onboard someone into features that do not exist yet |

**Outside the sequence: [018 The mark](018-brand-mark.md) — M.** Drawn by the project owner, by hand, whenever it is
ready. Task 011 leaves a placeholder in every slot the mark fills, so no task waits on it; it blocks only the store
listing, and so *Ready for strangers*.

## Three ordering rules worth stating

**Design system early (position 3).** [Task 004](004-exercise-catalog-and-logging.md) builds the
set row, and [07 §6](../07-brand-and-ui.md) calls it "the product". Building it against ad-hoc
styles and retrofitting a token system later is the expensive path, and it is how dark mode ends
up broken.

**The administrator-rights task before task 004 (position 6), not at the end.**
[Task 017](017-local-toolchain-device-spike.md) was split out of task 001 because the development
machine had no administrator rights. It could wait while 002, 011, 003 and 019 were built — none of them holds
shared domain logic — but not past them: its spike decided whether task 004 writes e1RM and the set
logic once, in Rust, or twice, in Python and TypeScript. **The rights arrived on 2026-09-16, the spike
passed, and [ADR-004](../decisions/ADR-004.md) answered option B — once, in Rust.** Task 004 began on
2026-09-19, and that is where the sequence stands.

**Gamification late, and never before the planner (position 13).** The scorer's input is *the
prescription* ([ADR-005](../decisions/ADR-005.md)). Any scoring built before a planner exists
would have to score volume — the single thing INV-22 forbids. The dependency is structural, not
scheduling convenience.

## Milestones

| Milestone | Through | You can… |
|---|---|---|
| **Usable alone** | 001–005, 011, 017, 019 | Plan a block and train it, offline, on one device — and delete the account |
| **Multi-device** | + 006 | Train on a phone and a tablet |
| **Both halves** | + 007–009 | Run, ride, swim and lift, planned |
| **Feature complete** | + 010, 013 | One calendar, and tracks for the sports you actually do |
| **Sellable** | + 014 | Three months free, then Pro |
| **Ready for strangers** | + 012, 018, 020 | Ship it — on Android |
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

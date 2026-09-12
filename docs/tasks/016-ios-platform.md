# Task 016 — iOS Platform

**Depends on:** the Android launch (012, 014) · **Blocks:** nothing · **Size:** L ·
**Target: after the Android launch**

> Decided in [ADR-009](../decisions/ADR-009.md): Android ships first; iOS is *added*, not ported.

## Goal
CyberAthlete on iPhone, reached by adding a platform rather than porting an app. **The measure of this
task is how little of the existing codebase it touches.**

## Prerequisites
- **Apple Developer Program** membership ($99/yr).
- **Access to macOS** for native iOS work — a Mac, or a rented cloud Mac. EAS cloud builds cover
  release builds, but iterating on native iOS problems needs local Xcode.
- **Apple Small Business Program** enrolment before the App Store launch — 15 % instead of 30 %, and
  not retroactive ([09 §2](../09-business-model.md)).
- **No founding pricing on iOS.** The window opened once, at the Android launch, and does not reopen
  ([09 §2](../09-business-model.md)). The App Store carries the standard products only; a founding
  subscriber from Android keeps their price on iOS through their account.

## Gates — in order, each before the next

1. **The iOS half of the ADR-004 spike.** `round_to_increment()` from `core-rs`, through UniFFI,
   called from the app on a **physical iPhone**. Timebox: two days, as the original spike.
   **If it fails, stop and decide before writing anything else.** The fallback is a TypeScript mirror
   of the engine for iOS alone, policed by the shared fixtures ([ADR-009](../decisions/ADR-009.md)
   § Consequences) — expensive, and a decision, never a default.
2. **Background location on iOS.** `UIBackgroundModes: location`, the "Always" permission flow, and App
   Store review notes justifying it ([05 §1](../05-integrations.md), [05 §10](../05-integrations.md)).
   A one-hour run recorded with the screen locked.
3. **StoreKit 2 through RevenueCat.** Entitlement belongs to the account, so a purchase on either
   platform grants Pro on the other ([05 §5a](../05-integrations.md)).
4. **App Store submission requirements.** Privacy nutrition labels, subscription disclosure in both
   languages ([ADR-008](../decisions/ADR-008.md)), account deletion reachable in-app.

## Scope
- iOS implementations inside `apps/mobile/src/platform/` and the Expo config plugins — **and nowhere
  else** (INV-28).
- `core-rs` iOS targets in CI, and the native module packaged for iOS.
- Accessibility: VoiceOver across the set-logging flow; Dynamic Type to 200 %.
- Apple Maps as the native map provider (no API key needed).
- TestFlight internal track in the release pipeline.
- App Store listing in both languages, and App Store name availability confirmed
  ([07 §1](../07-brand-and-ui.md)).

## Acceptance criteria
- [ ] **Adding iOS required no edit to `features/`, `domain/`, `db/`, `sync/`, `recording/` or `ui/`**
      — only `src/platform/`, config plugins and build configuration. If it did, say so explicitly
      and fix the structure rather than the symptom (INV-28)
- [ ] The ADR-004 iOS gate has a recorded outcome **before** any other iOS work began
- [ ] A one-hour run records with the screen locked on a physical iPhone
- [ ] Engine version skew rules hold between an Android build and an iOS build on different engine
      versions ([02 §7](../02-architecture.md))
- [ ] VoiceOver completes a full set-logging flow, and the set row survives 200 % Dynamic Type in pt-BR
- [ ] A purchase on iOS grants Pro on the same account on Android, and the reverse
- [ ] Every INV-26 guarantee holds on iOS: an expired account can read history, log, record, sync and
      export
- [ ] Local SQLite migrations, including the pre-migration backup, behave identically to Android
      ([06 §4](../06-operations.md))

## Notes and risks
- **Gate 1 is the most expensive risk deferred in the whole project.** If a Mac becomes available
  before this task, run gate 1 then ([ADR-009](../decisions/ADR-009.md) § Revisit if).
- The first acceptance criterion is the point of the task, in the way that "adding `walk` is a profile
  row and nothing else" is the point of [task 007](007-cardio-recording.md). Treat any edit to shared
  code as a finding about INV-28, not as part of the work.

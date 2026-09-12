# 05 — Integrations

Every external dependency, why it is there, what happens when it fails, and what it would cost to
replace. The bias is toward **few integrations**: each one is a permission prompt, a privacy
question, an outage we do not control, and a store-review risk.

Legend: **v1** = built now · **v2** = designed for, built later · **maybe** = not committed.

---

## 1. Device — location · **v1** · critical

`expo-location` + `expo-task-manager`.

- Foreground: `watchPositionAsync` at `Accuracy.BestForNavigation`, ~1 Hz.
- Background: a registered `TaskManager` task so recording survives screen-off and app-backgrounded
  (FR-4.2). This is the single hardest technical requirement in the app.
- iOS *([task 016](tasks/016-ios-platform.md), [ADR-009](decisions/ADR-009.md))*:
  `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: [location]`.
- Android: `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION` + a **foreground service** with
  a persistent notification. Without the foreground service, Android will kill the recording.
- **Failure modes to handle explicitly:** permission denied or downgraded to "while in use";
  aggressive OEM battery savers (Xiaomi, Huawei, OnePlus) killing the service — detect gaps in
  the point stream and warn; GPS cold start giving 30 s of garbage accuracy at the beginning of
  a run, which the accuracy filter (INV-13) must discard rather than count as distance.
- Requires a **development build**, not Expo Go. This is a bootstrap decision — see
  [tasks/001](tasks/001-project-bootstrap.md).

### 1a. Sports that need no location at all
Pool swim, indoor row, treadmill and indoor bike are `lap` or `manual` recording modes
([01 §4](01-business-requirements.md), INV-19) and **must never request location permission**.
A permission prompt for logging a pool swim is both a bad experience and a needless privacy ask.
The recorder checks `sport_profiles.recording_mode` before touching `expo-location` at all.

## 2. Device — heart rate · **v2**

Bluetooth LE chest straps / armbands via `react-native-ble-plx` (standard BLE Heart Rate Service,
UUID `0x180D`). Requires a development build and Android 12+ `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT`.

Deferred because HR is optional everywhere it appears (FR-4.3, FR-5.4) and BLE pairing UX is a
project of its own. Schema already carries `avg_hr`/`max_hr` and an HR stream, so adding it later
is additive.

## 3. Device — other · **v1**

| Package | Use |
|---|---|
| `expo-secure-store` | Refresh token and the privacy key in Keychain / Keystore (04 §3, §6) |
| libsodium via a native binding (candidate: `react-native-libsodium`) | argon2id, XChaCha20-Poly1305 and the OS CSPRNG for privacy zones. Imported only by `src/crypto/` ([ADR-007](decisions/ADR-007.md)); native, so a change to it is a store release, not OTA |
| `expo-sqlite` | Local database ([ADR-001](decisions/ADR-001.md)) |
| `expo-notifications` | Local reminders for planned sessions. **Local only in v1** — no push server, no device tokens, nothing to leak |
| `expo-keep-awake` | Keep the screen on during a live workout, user-toggleable |
| `expo-haptics` | Rest-timer completion, set logged |
| `expo-image-picker` | Activity and progress photos (v2) |

## 4. Maps · **v1**

`react-native-maps` with the **native** provider — Apple Maps on iOS, Google Maps on Android.

- No tile bill, no API key on iOS. Android needs a Google Maps API key in the build config
  (restricted by package name + signing certificate).
- Routes render as a `Polyline` decoded from the stored encoded polyline ([ADR-003](decisions/ADR-003.md)).
- **Rejected for v1:** Mapbox (better-looking, but a paid MAU-metered dependency and a heavier
  native module) and MapLibre + a tile provider (a tile bill and a hosting decision). Revisit if
  map styling becomes a product differentiator; the polyline storage format makes switching cheap.
- Static map thumbnails for history lists are rendered **client-side** from the simplified
  polyline onto a plain canvas — no tiles, no network, no per-request cost, and no coordinate
  ever leaves the device to fetch an image.

## 5. Backend infrastructure · **v1**

| Service | Choice | Notes |
|---|---|---|
| Postgres | Managed (Neon / Supabase Postgres / RDS) | Managed, for PITR backups. We use it as a plain database — no vendor SDK, no lock-in |
| API hosting | Fly.io or Railway | Container deploy, cheap, region-pinned (04 §7) |
| Object storage | Cloudflare R2 or S3 | Data exports, activity photos (v2). Presigned URLs only; the API never proxies bytes |
| Email | Resend or Postmark | Verification, password reset, export-ready. Transactional only. Templates in **both languages**, chosen by `users.locale` ([ADR-008](decisions/ADR-008.md)) |

**Email flows are v1, not v2.** An earlier version of this paragraph deferred them, on the grounds
that the only user was the author and could be recovered by direct database access. Multi-user
retired that argument: password reset, enforced email verification, email change and security
notifications are all v1 blockers ([04 §2a](04-security-and-auth.md), FR-1.1a,
[task 003](tasks/003-authentication.md)). The transactional email provider is therefore **on the
critical path for task 003** — not infrastructure sitting idle until a flow needs it.

## 5a. Billing and subscriptions · **v1**

**RevenueCat** in front of Google Play Billing at launch, and StoreKit 2 when iOS ships
([ADR-009](decisions/ADR-009.md)). That future is part of why RevenueCat is used from day one rather
than Play Billing directly: the iOS phase then adds a store, not a second billing integration.

- Both stores must be used for digital subscriptions; there is no choice about the 30 % / 15 % fee
  ([09 §2](09-business-model.md)). Both platforms' small-business programmes apply at this scale
  and should be enrolled in before launch.
- RevenueCat rather than raw StoreKit + Play Billing: receipt validation, cross-platform
  entitlement, subscription state webhooks and renewal handling are all things that are tedious to
  get right twice and dangerous to get wrong once. Its free tier covers early revenue.
- **Entitlement is cached locally with a grace period** (FR-9.7). A Pro user in a basement gym with
  no signal must never be locked out of their planner because an entitlement check failed. Fail
  **open** on a network error, always — the worst case is a few days of unpaid Pro, which is
  vastly cheaper than a paying user locked out mid-workout.
- The server verifies entitlements via RevenueCat webhooks and stores subscription state; the
  client never decides its own entitlement in a way the server would trust.
- **Nothing here may gate an INV-26 item.** Entitlement checks guard *features*, never a user's
  read of their own rows.
- **No card is taken for the three-month trial** ([ADR-006](decisions/ADR-006.md)), so the trial is
  tracked server-side from `created_at` — not as a store introductory offer.

**Not used:** Stripe or any web checkout. Both stores require their own billing for in-app digital
goods, and adding a second payment path is a rejection risk for no benefit.

## 6. Observability · **v1**

- **Sentry** (`sentry-expo` + `sentry-sdk`) — crashes and errors, both sides, with PII scrubbing
  on and coordinate fields explicitly denylisted (04 §9).
- **Product analytics — reconsidered for multi-user.** The original reasoning ("there is one user,
  the value is nil") no longer holds: with real users, knowing whether anyone finishes a block or
  ever taps the RIR chip is genuinely needed to build the right thing.

  The privacy reasoning stands unchanged, so the conditions are strict: **self-hosted PostHog**,
  no third-party SDK, event properties on an explicit allowlist, and **no coordinate, no route, no
  activity title, and no exercise name may ever be an event property** (04 §6). Analytics is
  opt-out in settings and disabled entirely for anyone who has not accepted the privacy policy.
  If self-hosting is not worth the operational cost at launch, ship with none — a hosted SDK is
  not the fallback.

## 7. Health platforms · **v2**

Apple **HealthKit** and Android **Health Connect**, via `react-native-health` /
`react-native-health-connect` (both require a development build).

- *Write:* completed workouts and activities, so the phone's rings/Health app agree with the app.
- *Read:* body weight, resting HR, and sleep, to enrich the profile.

Deferred because HealthKit entitlements add App Store review friction and the value is
convenience, not capability. Worth doing early in v2 — it is the cheapest way to make the app
feel native.

## 8. Strava import · **v2**

OAuth 2.0 against Strava's API, `activity:read_all` scope, to backfill history and optionally
sync new activities.

- Their rate limits are strict (200 requests/15 min, 2 000/day) so import must be a resumable
  background job, not a request-scoped loop.
- Their terms restrict what may be stored and displayed — read them before building, not after.
- Refresh tokens are encrypted at rest and stored per-user.
- **Export first:** GPX/TCX export from our app is v1-cheap and gives the user an exit door. Do
  that before building an import path, on principle.

## 9. App distribution · **v1**

**EAS** (Expo Application Services):

- `eas build` — cloud native builds, **Android now**; iOS joins in task 016
  ([ADR-009](decisions/ADR-009.md)). Required from day one because of §1's development-build
  dependency, though a local `npx expo run:android` is often faster while iterating.
- `eas submit` — Play Console internal track (TestFlight from task 016).
- `eas update` — OTA JS updates. **Rule: OTA carries JS only.** Any change touching a native
  module, a permission, or a local SQLite migration requires a real build. Shipping a schema
  migration over OTA to a device holding unsynced workouts is the single most dangerous thing
  this project can do.
- **If [ADR-004](decisions/ADR-004.md) is accepted**, the Rust core is a native module, so a
  domain-logic fix is a store release rather than an OTA push. That trade-off is the ADR's main
  cost and is argued there. EAS builds must cross-compile `core-rs` for the Android targets now, and
  for the iOS targets in task 016.

## 10. Integration risk register

| Risk | Impact | Mitigation |
|---|---|---|
| OEM battery managers kill background GPS | Lost activity — unforgivable (NFR-8) | Foreground service, point-gap detection, in-app guidance per manufacturer, raw points persisted continuously |
| Expo SDK upgrade breaks a native module | Blocked releases | Pin the SDK; upgrade on a schedule with a device-test pass; keep native modules to the listed minimum |
| Apple rejects background location use *(task 016)* | Cannot ship the cardio half on iOS | Justify clearly in review notes; ensure the app is fully usable without background permission (degraded, foreground-only recording). Surfaces in the iOS phase, not before ([ADR-009](decisions/ADR-009.md)) |
| Managed Postgres outage | No sync | Offline-first means the app keeps working entirely; sync resumes. This is [ADR-001](decisions/ADR-001.md) paying for itself |
| Google Maps key leaks from the Android build | Quota abuse | Key restricted to package name + signing cert; it is not a secret and must not be treated as one |
| Strava changes terms or shuts off the API (v2) | Import breaks | Never make imported data load-bearing; own the export path first (§8) |

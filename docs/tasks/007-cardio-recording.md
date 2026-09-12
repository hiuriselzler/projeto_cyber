# Task 007 — Sport Profiles and GPS Recording

**Depends on:** 002, 006 · **Blocks:** 008, 009 · **Size:** XL

## Goal
Two things, and the first one matters more than it looks:

1. **The sport-profile framework** (INV-19) — the mechanism that makes every sport get its own
   experience. Built here because it must exist before the first sport is built, not after.
2. **The v1 GPS sports** — **run, ride, walk** (FR-4.0c). Press record, pocket the phone, run for
   an hour, get back an accurate activity with a map, splits and charts.

Pool swim, treadmill and indoor bike are [task 008](008-non-gps-sports.md) — separate because
they share almost nothing with this task except the framework, and because pool swim is the proof
that the framework works. Trail run, hike, open-water swim and indoor row are deferred sports:
seed their profile rows, build no UI for them.

Implements [01 §4.0–4.1, §5](../01-business-requirements.md).

The technical risk is concentrated here: background location on Android is the least reliable
thing in the entire project.

## Scope

### Sport-profile framework (FR-4.0) — build first
- Load `sport_profiles` (seeded in [task 002](002-database.md)) and expose it to the UI.
- **Recorder dispatch** on `recording_mode`, with the `gps` recorder implemented here and `lap` /
  `manual` stubbed for task 008.
- **Profile-driven live screen**: fields, order and units all come from `live_fields` and the
  profile's pace unit **for the user's unit system** — `pace_unit_metric` or `pace_unit_imperial`
  ([ADR-008](../decisions/ADR-008.md)). Speed is stored unit-neutral as `avg_speed_mps` and
  formatted per profile.
- **Profile-driven detail screen**: sections from `detail_sections`; a profile with
  `has_route = false` renders no map component at all rather than an empty one.
- `sport_metrics` validated against the profile's `metrics_schema`.
- **Acceptance gate for the framework:** adding a sport must require zero edits to shared code.
  Prove it by adding `walk` last, as a profile row and nothing else.

### GPS recording (FR-4.1–4.7)
- `expo-location` foreground watch + `expo-task-manager` background task
  ([05 §1](../05-integrations.md)).
- **Android foreground service with a persistent notification.** Without it, the OS kills the
  recording. Non-optional.
- Permission flow requested at the moment of first record, foreground first, background only
  after foreground recording has worked once ([04 §6](../04-security-and-auth.md)).
- **Every point written to `raw_gps_points` in SQLite as it arrives** (FR-4.7). Nothing is
  buffered only in memory. A crash mid-run must cost nothing.
- Live screen driven by the profile — a ride shows km/h and a run shows min/km, and that is a
  profile field, not a conditional in the screen (INV-19).
  Pause / resume / lap / finish / discard.
- Auto-pause at the profile's `autopause_threshold_mps`; `elapsed_s` and `moving_s` stored
  separately and never conflated (INV-12).
- Auto-splits in **both** bases — `split_unit_m_metric` and `split_unit_m_imperial` (1 km and 1 mi
  for run and walk, 5 km and 5 mi for ride) — written as `activity_segments` of kind `auto_split`
  with `split_basis` `km` or `mi`. The detail screen shows the user's system, and switching it
  recomputes nothing ([ADR-008](../decisions/ADR-008.md)).
- Crash recovery: an unfinished activity is detected on launch and offered for resume or save.

### The GPS pipeline — `domain/gps/`, pure, versioned (INV-13)
```
accuracy filter (drop points worse than N metres, and the GPS cold-start garbage)
  → outlier rejection (implausible speed between consecutive points)
  → elevation smoothing (raw barometric/GPS altitude wildly overstates gain)
  → distance accumulation (haversine over surviving points)
  → moving-time mask
  → auto splits, per km and per mile
```
Pure, deterministic, `pipeline_version` stamped on every activity. Shared fixtures with recorded
real-world traces, including deliberately nasty ones: a tunnel, a stationary five minutes, a
cold start, a track session with tight laps.

### Storage — [ADR-003](../decisions/ADR-003.md)
- Derived scalars onto `cardio_activities`.
- Simplified encoded polyline (Douglas–Peucker) for maps and thumbnails.
- Typed binary streams per kind, with encode/decode in Python and TypeScript and **round-trip
  property tests** (encode → decode → compare within tolerance).
- **Privacy trimming on-device before upload** (FR/04 §6): points inside a user privacy zone are
  removed from the polyline and streams, and `start_lat/lng` set to the first surviving point.
  The server must never receive the user's front door.
- **Zone CRUD, encrypted on the way out** ([ADR-007](../decisions/ADR-007.md)): zones are stored
  decrypted in local SQLite and sealed in `src/sync/` with the privacy key that
  [task 003](003-authentication.md) already provisioned. Trimming reads the local plaintext; the
  server only ever carries the blob between the user's own devices.
- Raw points retained until the activity has synced, then trimmed.

### History and analysis (FR-5.1–5.4)
- Activity list with client-rendered polyline thumbnails — no tiles, no network
  ([05 §4](../05-integrations.md)). A profile with `has_route = false` gets a non-map card.
- Detail: map, splits table, elevation / pace / HR charts — assembled from `detail_sections`.
- **Personal bests per sport, in that sport's own terms** (FR-5.2): fastest 1 k / 1 mi / 5 k / 10 k and
  biggest climb for running, longest ride and biggest climb for cycling. There is no shared
  cross-sport PR list, because there is no meaningful one.
- Weekly and monthly totals: **time across sports, distance only within a sport** (INV-20).
- HR zone distribution, from one zone function, hidden entirely if `max_hr` is unset (INV-14).
- **GPX export** — cheap, and it gives the user an exit door before we ever build an import
  ([05 §8](../05-integrations.md)).

## Acceptance criteria
- [ ] A one-hour run records with the screen off and the app backgrounded on Android (iOS:
      [task 016](016-ios-platform.md))
- [ ] Recording survives an app crash; the activity is recoverable from raw points
- [ ] Distance on a known 5 km loop is within 2 % of truth
- [ ] Elevation gain on a known route is within 10 % — unsmoothed GPS will not be, which is the
      point of the smoothing step
- [ ] A five-minute stop produces `moving_s` ≈ `elapsed_s − 300`, and pace is unaffected (INV-12)
- [ ] Battery use over a one-hour recording is ≲ 10 % on a mid-range device (NFR-3)
- [ ] An activity starting inside a privacy zone uploads no coordinate within that zone — verified
      by inspecting the server row, not the UI
- [ ] Stream encode → decode round-trips within tolerance for all six kinds
- [ ] The pipeline reproduces stored scalars exactly when re-run from raw points at the same
      `pipeline_version` (INV-13)
- [ ] Tested on a Xiaomi or similar aggressive-battery-manager device, not only a Pixel
- [ ] A ride's live screen shows km/h and a run's shows min/km, with **no sport conditional in
      the screen component** (INV-19) — and an imperial user sees mph and min/mi from the same
      component, with **no unit conditional** in it either
- [ ] Switching unit system shows existing runs split per mile without recomputing them
- [ ] Adding `walk` is a `sport_profiles` row and nothing else — no shared code touched
- [ ] Weekly totals sum time across sports and never add a swim distance to a run distance (INV-20)

## Notes and risks
- **Budget generously.** Background location is where estimates go wrong. Test on real hardware,
  outdoors, repeatedly. Simulator location is useless for validating any of this.
- OEM battery managers ([05 §10](../05-integrations.md)) will kill the service on some devices no
  matter what. Detect gaps in the point stream, warn the user, and offer manufacturer-specific
  guidance. This cannot be fully solved, only mitigated.
- Do not skip the cold-start filter. The first 20–30 seconds of GPS routinely adds a phantom
  100 m, which shows up as a bogus fastest-kilometre PR that then poisons the personal bests.
- HR (`react-native-ble-plx`) is explicitly **v2** ([05 §2](../05-integrations.md)). The schema
  and charts should degrade cleanly when HR is absent, which is the normal case in v1.
- **The framework is the deliverable that outlives this task.** Every hour spent making the live
  and detail screens genuinely profile-driven is repaid in task 008, and every `if sport ===` left
  in shared code is a bug that only surfaces when the pool swim screen shows a map.

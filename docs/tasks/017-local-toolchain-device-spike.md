# Task 017 — Local Toolchain, Device and Core Spike

**Depends on:** 001, and administrator rights on the development machine · **Blocks:** 004 onward ·
**Size:** L

> **Added 2026-09-12.** Task 001 was built without administrator rights, and everything CI could prove
> was proven there. What was left needs those rights, so it is gathered here — together with the checks
> from tasks 002, 011 and 003 that only a physical device can settle.
>
> **Built after 003 and before 004, not at the end.** The ADR-004 spike decides whether task 004 writes
> its domain logic once, in Rust, or twice, in Python and TypeScript. Tasks 002, 011 and 003 contain no
> shared domain logic, which is why they can go first.

## Goal
The whole stack runs on the development machine, the app runs on a physical Android phone, and
[ADR-004](../decisions/ADR-004.md) has an answer.

## Prerequisites — administrator rights

Install in this order:

1. **Windows long paths** (`LongPathsEnabled`). React Native's native build inside pnpm's store can pass
   the 260-character limit. `git config core.longpaths true` is already set for the repository.
2. **WSL2** — `wsl --install`, then restart. Docker Desktop needs it, and it is the accepted place for
   the Android cross-compile if native Windows fights back ([ADR-004](../decisions/ADR-004.md)).
3. **Docker Desktop.**
4. **Android Studio** with the Android SDK, the **NDK**, the platform tools and the JDK the pinned Expo
   SDK requires — plus the phone's USB driver, if Windows asks for one.
5. **Visual Studio Build Tools** with the C++ workload, then **Rust** through rustup, with the Android
   targets (`aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`) and **`cargo-ndk`**.
6. **EAS CLI**, and an Expo account.
7. A **physical Android phone** with USB debugging enabled. An emulator settles nothing here.

## Scope

### 1. The local stack
- `docker compose up -d` from the repository root. On first start, the init hook creates the two
  database roles from `infra/postgres/roles.sql` ([ADR-011](../decisions/ADR-011.md)).
- The API against that database, following [06 §1](../06-operations.md) and the README exactly. Any
  step that turns out different on Windows is corrected in both.
- The API integration tests, locally — until now they have run only in CI.

### 2. The development build on a phone
- `pnpm android` (`expo run:android`) builds and installs the development build. Build it once more
  through `eas build --profile development --platform android`, to prove the cloud path works.
- The debug-only diagnostics screen written in task 001 runs the on-device checks: API readiness over
  `adb reverse`, the refusal of a LAN address, the SQLite migration, secure storage across a restart,
  TanStack Query and Zustand.
- A **release** build refuses to start with an `http://` API base URL, and its JavaScript bundle carries
  no diagnostics code.

### 3. Device checks from later tasks
Tasks 002, 011 and 003 moved the criteria below here because they need a phone. Each runs once its
task's code exists.

### 4. The ADR-004 spike — moved from task 001

`core-rs`, the [ADR-004](../decisions/ADR-004.md) go/no-go. **Timebox: 2 days.**

This is a decision-making exercise, not a feature. The output is an answer, not code.

**The clock starts** when the prerequisites are installed and a dev build already runs on the physical
device. Installing Android Studio is not the spike; the two days measure the binding chain.

- Cargo workspace, `#![forbid(unsafe_code)]`, `cargo deny` banning I/O, clock and RNG crates, and
  clippy's `disallowed-methods` banning `std::time::SystemTime::now` — `cargo deny` sees crates, not
  standard-library calls, so the clock needs both.
- Implement exactly one trivial function — `round_to_increment(weight_kg: f64, increment_kg: f64, mode)`,
  with modes `nearest | down | up` and a tie going to the lighter load (INV-02,
  [ADR-010 § Amendment](../decisions/ADR-010.md)). A dozen lines. The shared fixture
  `packages/shared/fixtures/round_to_increment.json` already holds its cases.
- Expose it through **both** bindings (PyO3 and UniFFI). The UniFFI binding is the workspace package only
  `src/domain/` may import — the lint rule exists since task 001 ([ADR-012](../decisions/ADR-012.md)).
- Call it successfully from FastAPI **and** from the Expo app on a **physical Android device**.
- Wire cross-compilation for the Android targets: in CI on Linux, in EAS, and locally with `cargo-ndk` —
  natively on Windows or in WSL2.
- **The Rust CI job**: `cargo deny`, `cargo clippy -D warnings`, `cargo fmt --check`, and the Android
  cross-compilation check, with the Cargo build cached.
- **The iOS half is not part of this spike.** It is gate 1 of [task 016](016-ios-platform.md)
  ([ADR-009](../decisions/ADR-009.md)).

**What counts as "chain works"** is fixed before the clock starts
([ADR-004](../decisions/ADR-004.md) § Decision procedure): the function is called through PyO3 from
FastAPI and through UniFFI from a dev build on a physical Android device, with the Android artefacts built
by CI on Linux and by EAS. A native-Windows build that fights back while WSL2, CI and EAS work is **not** a
failure.

**At the end of two days, write the outcome into ADR-004 and stop deliberating:**

- *Chain works* → option B for Android and the server. The core is adopted from
  [task 004](004-exercise-catalog-and-logging.md) onward, and `apps/*/domain/` become thin binding
  wrappers.
- *Timebox blown, or the toolchain fights back* → option A. Delete `core-rs`, write the domain twice,
  and make the shared fixtures a hard CI gate on both suites.

**Do not half-build it and do not extend the timebox.** The value here is a fast, cheap answer;
an FFI chain that takes a week to stand up has already answered the question.

## Acceptance criteria

**The local stack**
- [ ] `docker compose up -d` from the repository root, then `uv run uvicorn app.main:app` in
      `apps/api`, serves `/health/ready` → 200 *(from task 001)*
- [ ] `uv run pytest` in `apps/api` runs the integration tests against the local database, none skipped
- [ ] Every command in `README.md` works on Windows as written

**The app on a phone** *(from task 001)*
- [ ] The dev build on a physical device reaches `http://localhost:8000/health/ready` through
      `adb reverse`, and an `http://` request to the machine's LAN IP is refused by the app
- [ ] The dev build opens on a physical Android device and hot-reloads a JS change
- [ ] A local SQLite migration runs on first launch and is idempotent on the second
- [ ] TanStack Query, Zustand and `expo-secure-store` each have a smoke test that passes on-device,
      and a value written to secure storage survives an app restart
- [ ] A non-debug build given an `http://` API base URL refuses to start
- [ ] The release bundle carries no diagnostics code — a search of it for `DiagnosticsScreen` finds
      nothing
- [ ] The development build also builds through EAS

**From task 002**
- [ ] The Drizzle schema creates successfully on-device and every table in
      [03 §8](../03-database-schema.md) exists
- [ ] A round-trip test writes a workout + exercise + 3 sets to SQLite and reads them back with
      correct types (booleans as 0/1, timestamps as epoch ms)

**From task 011**
- [ ] Changing one token value visibly updates every screen using it
- [ ] All changing numbers use tabular figures — verified by watching a live pace readout not jitter
- [ ] TalkBack can complete a full set-logging flow (VoiceOver: [task 016](016-ios-platform.md))

**From task 003**
- [ ] `react-native-libsodium` — argon2id, XChaCha20-Poly1305 and `randombytes` — works in the
      development build
- [ ] Airplane mode, app killed and reopened: the user is still signed in and lands on the home
      screen with no spinner and no error
- [ ] A privacy key created on device A is unwrapped correctly by device B after sign-in, and the
      server never receives it in the clear — verified by inspecting the request bodies
- [ ] Changing the password leaves existing encrypted rows decryptable; resetting it does not, and
      the reset screen warned about that before the user confirmed
- [ ] `privacy_key_kdf` is stored with every wrap; a key wrapped under older parameters still
      unwraps, and is re-wrapped under the current ones at the next password entry
- [ ] The key derivation on a mid-range Android phone does not freeze the screen, and its measured
      duration is written into task 003's notes

**The decision** *(from task 001)*
- [ ] CI fails if `core-rs` depends on `rand`, or calls `SystemTime::now` — **add each, watch CI fail**,
      then remove them (INV-10)
- [ ] `round_to_increment(41.6, 2.5, nearest)` returns **42.5** and `round_to_increment(41.25, 2.5, nearest)`
      returns **40.0** — the tie goes to the lighter load — called from Python and from the app on a
      **physical Android device**
- [ ] **ADR-004 has a recorded outcome** — option A or option B, with the reason. **Task 004 does not
      start while this is open**

## Notes and risks
- **Nothing has run on a real phone until this task.** A problem in the native build — the Expo SDK, the
  React Native version, pnpm's layout on Windows — surfaces here, after tasks 002, 011 and 003 are built.
  An early development build through EAS, installed on the phone from a download link, needs no
  administrator rights and would find it sooner.
- **If administrator rights stay out of reach**, the spike is still possible: "chain works" is defined
  by CI on Linux, EAS and a physical phone, none of which needs local administrator rights. The
  iteration is slower, and the clock still starts only once a development build runs on the phone.
- **Try the set row on a real phone, with sweaty hands, before task 004 builds around it**
  ([task 011](011-design-system.md) notes). This is the first moment a phone is available.
- A first EAS build is slow. A local `npx expo run:android` is usually faster while iterating on the dev
  client; use EAS once to prove the cloud path works.
- `cargo-ndk` on Windows needs the NDK location set (`ANDROID_NDK_HOME`). Write the exact setup into
  `README.md` the first time it works — it is the step most likely to cost the next person an hour.
- **Windows path length.** Enable long paths before the first Android build; switch pnpm to hoisted
  installs only if Metro or the build requires it.
- The device check "device A and device B" in the task 003 criteria needs two installs of the app — a
  second phone, or the same phone after a reinstall with its data cleared.

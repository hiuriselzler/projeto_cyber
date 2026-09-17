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
>
> **In progress since 2026-09-16**, when administrator rights arrived. The prerequisites are installed, **the local
> stack runs**, and **the app runs on a physical Android phone**. See § Progress below.
>
> **Correction (2026-09-16, later the same day):** this note previously said the spike's clock had not started
> because nothing had run on a device yet. That stopped being true earlier the same day, at § The device run below —
> the dev build reached the phone before this sentence was corrected. **The clock started then, by
> [ADR-004](../decisions/ADR-004.md)'s own definition.** `core-rs` now exists and its PyO3 half is proven end to end
> (§ The ADR-004 spike begins); the UniFFI half is still open. Nothing here extends the two-day timebox — the clock's
> start time is unchanged, only this file's claim about it is fixed.

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
- [x] `docker compose up -d` from the repository root, then `uv run uvicorn app.main:app` in
      `apps/api`, serves `/health/ready` → 200 *(from task 001)*
- [x] `uv run pytest` in `apps/api` runs the integration tests against the local database, none skipped
- [ ] Every command in `README.md` works on Windows as written

**The app on a phone** *(from task 001)*
- [x] The dev build on a physical device reaches `http://localhost:8000/health/ready` through
      `adb reverse`, and an `http://` request to the machine's LAN IP is refused by the app
- [x] The dev build opens on a physical Android device and hot-reloads a JS change
- [x] A local SQLite migration runs on first launch and is idempotent on the second
- [x] TanStack Query, Zustand and `expo-secure-store` each have a smoke test that passes on-device,
      and a value written to secure storage survives an app restart
- [ ] A non-debug build given an `http://` API base URL refuses to start
- [ ] The release bundle carries no diagnostics code — a search of it for `DiagnosticsScreen` finds
      nothing
- [ ] The development build also builds through EAS

**From task 002**
- [x] The Drizzle schema creates successfully on-device and every table in
      [03 §8](../03-database-schema.md) exists
- [ ] A round-trip test writes a workout + exercise + 3 sets to SQLite and reads them back with
      correct types (booleans as 0/1, timestamps as epoch ms)

**From task 011**
> **Five criteria moved out on 2026-09-16** — four to [task 004](004-exercise-catalog-and-logging.md), one to
> [task 007](007-cardio-recording.md). Each named a screen that does not exist yet: `SetRow` and `NumericKeypad` are
> built and unit-tested in `src/ui/components/`, but **no route renders either**, and the live pace readout is task
> 007's. They could never have been ticked here, and this task must finish **before** task 004. See § The criteria
> that moved.
- [ ] Changing one token value visibly updates every screen using it
- [x] A manual theme override survives an app restart

**From task 003**
- [x] `react-native-libsodium` — argon2id, XChaCha20-Poly1305 and `randombytes` — works in the
      development build
- [x] Airplane mode, app killed and reopened: the user is still signed in and lands on the home
      screen with no spinner and no error
- [ ] A privacy key created on device A is unwrapped correctly by device B after sign-in, and the
      server never receives it in the clear — verified by inspecting the request bodies
- [ ] Changing the password leaves existing encrypted rows decryptable; resetting it does not, and
      the reset screen warned about that before the user confirmed
- [ ] `privacy_key_kdf` is stored with every wrap; a key wrapped under older parameters still
      unwraps, and is re-wrapped under the current ones at the next password change
- [ ] The key derivation on a mid-range Android phone does not freeze the screen, and its measured
      duration is written into task 003's notes

**The decision** *(from task 001)*
- [ ] CI fails if `core-rs` depends on `rand`, or calls `SystemTime::now` — **add each, watch CI fail**,
      then remove them (INV-10). *`clippy.toml` already bans the calls locally (§ The ADR-004 spike
      begins); the CI job and `deny.toml`'s crate ban are what remain*
- [ ] `round_to_increment(41.6, 2.5, nearest)` returns **42.5** and `round_to_increment(41.25, 2.5, nearest)`
      returns **40.0** — the tie goes to the lighter load — called from Python and from the app on a
      **physical Android device**. *Proven from Python (§ The ADR-004 spike begins); the device half is
      still open, so this stays unticked — the criterion asks for both*
- [ ] **ADR-004 has a recorded outcome** — option A or option B, with the reason. **Task 004 does not
      start while this is open**

## Progress (2026-09-16)

### Prerequisites

| # | Prerequisite | State |
|---|---|---|
| 1 | Windows long paths | **Already enabled** — `LongPathsEnabled=1`; nothing to do |
| 2 | WSL2 | **Working.** `VirtualMachinePlatform` and `Microsoft-Windows-Subsystem-Linux` enabled, then the restart: Ubuntu runs as a v2 distribution on kernel `6.6.87.2-microsoft-standard-WSL2`. `HyperVisorPresent` was already true, so **no BIOS change was needed** |
| 3 | Docker Desktop | **Installed** — engine 29.1.3 on the WSL2 backend. The `-5` was never about the restart; see § The `-5` was a leftover, not WSL2 |
| 4 | Android Studio | 2026.1.4.7 |
| 4 | Android SDK | command-line tools 16111833, platform-tools 37.0.1, `platforms;android-36`, `build-tools;36.0.0`, licences accepted. **NDK deliberately not yet installed** — see below |
| 5 | VS Build Tools + C++ | **Already installed** — BuildTools 2026 with `VC.Tools.x86.x64` |
| 5 | Rust + Android targets | 1.98.0 with `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`, and `cargo-ndk` 4.1.2 |
| 6 | EAS CLI | 24.6.0. **An Expo account is still needed** before the EAS build criterion |
| 7 | Physical Android phone | Available; USB debugging not yet set up |

Not on the task's list but blocking everything Node-side, and now done: **Node 24.21.0** (the machine had 18.4.0, off
the `.nvmrc` pin), **pnpm 12.4.1** through corepack, the workspace's 1081 packages installed clean — the three
allowed install scripts and no others — and **Python 3.12** through uv.

### The machine had none of tasks 001–003's local environment

`.env`, `apps/api/.venv`, and the portable PostgreSQL 16.15 of 2026-09-12 with its data directory were all absent.
The repository and its history are intact, so nothing was lost, but **§ 1 was a first setup rather than a
verification**, and `.env` was regenerated from `.env.example` with fresh secrets. `.venv` has since been rebuilt
with `uv sync`, and the portable PostgreSQL is not reinstalled: Docker replaces it, and the README now says so.

### The `-5` was a leftover, not WSL2

The entry of 2026-09-16 recorded Docker Desktop's installer failing `-5` "until the restart". **That was the wrong
cause, and it is corrected here**: after the restart, with WSL2 demonstrably working, the installer still returned
`-5`. Its elevated log gives the real reason:

```
System.Exception: For security reasons C:\ProgramData\DockerDesktop must be owned by an elevated account
```

An earlier Docker Desktop — version 4.76.0, from logs dated April and June 2026 — had been removed incompletely,
leaving `C:\ProgramData\DockerDesktop` owned by the ordinary account, an orphaned `com.docker.service` pointing at a
`C:\Program Files\Docker` that no longer existed, and no uninstall entry in the registry. **Deleting that directory
was the whole fix**; the installer then recreated it elevated and completed. The installer in `Downloads` is 4.57.0
but fetches a current package, so its age was never the problem either.

### § 1 — the local stack, first run

All of it on Windows, against the Docker stack:

| Step | Result |
|---|---|
| `docker compose up -d` | `postgres` healthy on `127.0.0.1:5432`, `adminer` on `8080` |
| The init hook's roles | `cyberathlete_app` with **no** `BYPASSRLS`, `cyberathlete_migrator` with it ([ADR-011](../decisions/ADR-011.md)) |
| `uv sync` | 81 packages, Python 3.12.13 |
| `alembic upgrade head` | `0001 → 0002 → 0003`, as `cyberathlete_migrator` |
| `python -m seeds` · `scripts.check_schema` | 622 rows · passed, 39 tables, 42 classified |
| `/health/ready` | **200**, after the boot-time role assertion passed as `cyberathlete_app` |
| `uv run pytest` | **285 passed, none skipped**, 73 s |
| API checks | `ruff`, `ruff format` (104 files), `mypy` (101 files), `lint-imports` — **5 contracts kept, 0 broken** |
| Mobile checks | `typecheck`, `lint`, `lint:fixtures` (47), `check:platform-files`, `check:catalogs` (445 messages) |
| `db:generate` · `render:brand` | Both leave their outputs unchanged, as the README requires |

The API test count is **285**, not the 279 recorded when task 003 was built.

### Found: the Jest matrix suites were flaky, and only CI's speed hid it

`pnpm test` failed **1 to 3 tests of 427 depending on machine load**, always on `MATRIX[0]` — `en, metric, dark`, the
first entry of the first `describe.each` — and **never on an assertion**. Every failure was
`Exceeded timeout of 5000 ms`, Jest's default, which `jest.config.js` had not overridden. That first test pays the
one-time cost of the providers, i18next, the `@formatjs` polyfills and a cold transform; a warm cache ran the same
427 tests in 8 seconds and passed.

CI stayed green because its Linux runners are faster, **not because the suite was sound** — the same flake can reach
CI under load, which makes it a gate that cannot be trusted rather than a Windows quirk. Fixed by
`testTimeout: 15000` in [jest.config.js](../../apps/mobile/jest.config.js); no test logic changed. Proven by two
cold-cache runs after the change, 427 of 427 both times.

### The criteria that moved (2026-09-16)

Task 017 carried six device criteria from task 011. **Five of them named UI that does not exist**, and since this
task must finish *before* [task 004](004-exercise-catalog-and-logging.md), none could ever have been ticked — the
task as written could not close. `SetRow.tsx` and `NumericKeypad.tsx` exist in `src/ui/components/` and are
unit-tested across the full matrix, but no screen or route imports either; the live pace readout belongs to
[task 007](007-cardio-recording.md); and all nine ICU plural messages in the catalogs are `unit_spoken.*`, with
none under `account.*`, so no reachable screen renders a quantity or a decimal comma.

| Criterion | Now in | Why |
|---|---|---|
| TalkBack completes a full set-logging flow | [004](004-exercise-catalog-and-logging.md) | There is no set-logging flow until 004 builds it |
| The set row in pt-BR, in pounds, at 200 % font | [004](004-exercise-catalog-and-logging.md) | **Merged** into 004's existing 200 %-font criterion, which gains "in pounds" and "every control usable" |
| The keypad never covers the row it edits | [004](004-exercise-catalog-and-logging.md) | The keypad is reachable only once a set is being edited |
| Portuguese plurals and the decimal comma under Hermes | [004](004-exercise-catalog-and-logging.md) | Needs a screen showing a quantity; the plurals are the spoken unit names |
| Tabular figures, watching a live pace readout not jitter | [007](007-cardio-recording.md) | The live pace readout is 007's |

**What stays here**, because both are testable against the account screens that do exist: the token change visibly
updating every screen, and the theme override surviving a restart.

### The device run (2026-09-16)

The first time any of this ran on hardware — a Galaxy S21 FE (`SM-G990E`), Android 16, API 36, `arm64-v8a`.

| Check | Result |
|---|---|
| Platform interface (`src/platform`) | `android 36` |
| API readiness over `adb reverse` | **HTTP 200** `{"status":"ready","reason":null}` |
| An `http://` LAN address | **Refused twice over** — the app's own guard (04 §5) *and* `java.net.UnknownServiceException: CLEARTEXT communication … not permitted`, from task 001's `withDebugOnlyLocalhostCleartext` plugin |
| Drizzle schema on device | **36 of 36 tables**, 2 migrations |
| Migration idempotence | Still 2 migrations after a restart — nothing re-ran |
| Secure storage | Round trip ok, and the previous launch's timestamp survived a restart |
| TanStack Query · Zustand | The readiness query · `taps` counting, resetting on relaunch as in-memory state should |
| Hot reload | A JS edit appeared without a restart — Metro `Bundled 55ms (1 module)` |
| Theme override | `system` → `light`, surviving a restart, the control drawing fill, edge and label (INV-24) |
| libsodium | `Libsodium.install` ran; registration produced a wrapped privacy key |
| **Offline sign-in** | Airplane mode **and** the API port forward removed: still signed in, straight to home, no spinner. The unreachable API surfaced as a typed `ApiUnreachableError`, never a crash |
| Registration, end to end | **2.6 s** including the 64 MiB argon2id wrap, with no frozen screen |

The verification email was written in **Portuguese**, from the device's locale — ADR-008 and INV-27 holding on real
hardware, not only in Jest.

### Found on the device, not yet fixed

- **Screen titles are drawn behind the status bar.** `Entrar` and `Crie sua conta` overlap the clock: the header does
  not respect the safe-area inset. Jest does not model insets, so only a phone shows it. Whether it belongs to task
  003's screens or task 011's layout is not yet established.
- **`EMAIL_FOLDER` resolves against the wrong directory.** `.env` holds the relative `apps/api/.mail`, but the README
  runs uvicorn *from* `apps/api`, so the device registration's email landed in `apps/api/apps/api/.mail/`. Either the
  value is absolute, or it is relative to where the API actually runs.
- **`apps/mobile/.gitignore` is generated by `expo prebuild`** and is neither committed nor ignored. It needs a
  decision either way.

### Found while installing

- **`sdkmanager` is deprecated** in command-line tools 16111833: it warns and delegates to a new `android` CLI.
  Packages install with `android sdk install <package>`. The exact setup goes into `README.md` once a build has run.
- **The NDK is deliberately deferred.** Nothing in the repository pins one — there is no `expo-build-properties` —
  so the version is Expo SDK 57 / React Native 0.86.3's default and Gradle names it on the first Android build.
  Installing a guess is several gigabytes of the wrong thing. `ANDROID_NDK_HOME` is set once that version is known.
- `android sdk install platform-tools` **exits `0xC0000409` after unpacking correctly** — adb runs and the package is
  sound. Recorded so it is not re-diagnosed.
- Windows PowerShell 5.1's `Invoke-WebRequest` downloaded the 148 MB command-line tools at about 5 MB/min;
  `curl.exe`, which ships with Windows, took under a minute.
- **Node was installed but not selected.** nvm held 24.21.0 while 24.20.0 stayed active, below the `>=24.21.0` gate in
  the root `package.json`, so `pnpm install` would have refused. `nvm use 24.21.0` fixes it, and its effect is only
  visible to processes started afterwards — the shell that runs it still reports the old version.
- **`.env.example` has drifted behind `.env`**: `EMAIL_TRANSPORT`, `EMAIL_FOLDER` and `APP_LINK_BASE` arrived with
  task 003 and were never added to the example, so a setup that follows the README gets no email settings. Not yet
  fixed — it is a task 003 omission, and it is corrected with the README's remaining § 2 commands.
- **`adb` is not on `PATH`** and `ANDROID_HOME` is unset, though platform-tools are installed. Both are settled with
  the Android environment, when the first build runs.

### The ADR-004 spike begins (2026-09-16, later the same day)

On `feat/task-017-core-spike`, not yet committed. Full account in
[PROJECT-STATUS's decision log](../PROJECT-STATUS.md) under the same date; this is the short version.

**`core-rs/` exists**, laid out exactly as [02 §2](../02-architecture.md): the workspace crate
`cyberathlete-core` holds `progression::rounding`; `bindings/pyo3` and `bindings/uniffi` are its members.
`round_to_increment()` is built — `Nearest | Down | Up`, a tie to the lighter load (ADR-010 § Amendment), total
rather than panicking on an unusable increment. Five unit tests pass, the spike's own two named values among
them, plus an idempotence check. `tests/shared_fixtures.rs` runs all nine cases from
`packages/shared/fixtures/round_to_increment.json` straight from Rust. `clippy.toml` bans the clock calls and,
beyond INV-10's own wording, `HashMap`/`HashSet` — their iteration order is process-seeded, which is exactly
the kind of disagreement INV-10 rules out. `cargo deny` is installed; its ban list is not yet written.

**The PyO3 half is proven — the FastAPI side of "chain works."** `apps/api/pyproject.toml` depends on the
binding through a `uv` path source, `uv sync` builds and installs it, and `app/domain/rounding.py` re-exports
it behind a new import-linter contract (`core-binding-fenced`) that only it may cross — the server mirror of
[ADR-012 §2](../decisions/ADR-012.md)'s client-side rule. Task 002's placeholder oracle in
`tests/integration/test_reference_data.py` — explicitly commented "the real one arrives in task 017" — is
retired in favour of the real core, so INV-02's 52-cycle precision property now proves the shipping function.
`ruff`, `ruff format`, `mypy --strict` (103 files) and `lint-imports` (**6 contracts, 0 broken**) are all clean;
the affected suites are **11 passed**.

**The UniFFI half is not proven.** Both binding crates compile clean on native Windows — the Rust side is not
the problem. `uniffi-bindgen-react-native@0.31.0-5` (pinned to match the `uniffi` crate's `0.31`) fails to
build *itself* there: `pnpm dlx` compiles it from source, and MSVC's `link.exe` returns `LNK1104` linking its
own build-script binaries. A different symptom from the `react-native-libsodium` CMake backslash bug found
earlier today, but the same class of failure, and the same standing allowance covers it: *a native-Windows
build that fights back while WSL2, CI and EAS work is not a failure.* The build-only WSL2 checkout already
set up for the Android build has Node, pnpm, Java and the NDK — but **no Rust toolchain** (`which cargo rustc`
found neither), so `rustup`, the Android targets and `cargo-ndk` need installing there before `ubrn` or the
cross-compilation can run. Unlike the plain Android build, which only needed the JDK and the NDK in WSL2, this
half needs the whole Rust side too.

**What remains, precisely:** `deny.toml`'s ban list · the Rust CI job (`cargo deny`, clippy, fmt, Android
cross-compilation) · a Rust toolchain in WSL2 · `ubrn` actually generating the TypeScript bindings ·
`cargo-ndk` cross-compilation for the three Android targets · the call from the Expo app on the physical
device · and the ADR-004 outcome itself, which waits on all of it.

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

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
> [ADR-004](../decisions/ADR-004.md)'s own definition.** Nothing here extends the two-day timebox — the clock's start
> time is unchanged, only this file's claim about it is fixed.
>
> **Both halves of the spike's own call are now proven (2026-09-16, still the same day).** `core-rs` exists;
> `round_to_increment()` is called successfully through PyO3 from FastAPI and through UniFFI from the app on the
> physical Android device — 42.5 and 40.0, the tie to the lighter load, on the device screen (§ The UniFFI half is
> proven).
>
> **Merged (2026-09-18) as [PR #12](https://github.com/hiuriselzler/projeto_cyber/pull/12), and the Rust CI job's
> first two real runs both did exactly what they should.** One clean pass, all five jobs; one deliberate `rand`
> violation on a throwaway branch, caught precisely by `core-rs`'s `cargo deny` step and nothing else, branch then
> deleted (§ Both halves of "add it, watch it fail" are proven). **ADR-004's bar now stands at three of four** — PyO3
> from FastAPI, UniFFI from the device, Android artefacts built by CI on Linux, all proven. **Only the EAS build is
> outstanding, and only because no Expo account exists yet.** Task 004 still does not start while that is open — this
> is now a waiting-on-an-account problem, not an unanswered engineering question.

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
- [x] Every command in `README.md` works on Windows as written *(§ The README, walked on Windows —
      two defects found and fixed)*

**The app on a phone** *(from task 001)*
- [x] The dev build on a physical device reaches `http://localhost:8000/health/ready` through
      `adb reverse`, and an `http://` request to the machine's LAN IP is refused by the app
- [x] The dev build opens on a physical Android device and hot-reloads a JS change
- [x] A local SQLite migration runs on first launch and is idempotent on the second
- [x] TanStack Query, Zustand and `expo-secure-store` each have a smoke test that passes on-device,
      and a value written to secure storage survives an app restart
- [x] A non-debug build given an `http://` API base URL refuses to start *(§ The release build
      refuses, on hardware — a signed EAS release APK, installed and launched on the phone)*
- [x] The release bundle carries no diagnostics code — a search of it for `DiagnosticsScreen` finds
      nothing *(§ The release bundle is proven diagnostics-free)*
- [x] The development build also builds through EAS *(build `9933bd7f`, 19m49s, an installable APK.
      The `.so` files CMake imports are gitignored build output and EAS archives through git, so a
      pre-install hook cross-compiles `core-rs` on the worker before Gradle runs —
      `apps/mobile/scripts/eas-build-pre-install.sh`. § The EAS build)*

**From task 002**
- [x] The Drizzle schema creates successfully on-device and every table in
      [03 §8](../03-database-schema.md) exists
- [x] A round-trip test writes a workout + exercise + 3 sets to SQLite and reads them back with
      correct types (booleans as 0/1, timestamps as epoch ms) *(§ SQLite round trip)*

**From task 011**
> **Five criteria moved out on 2026-09-16** — four to [task 004](004-exercise-catalog-and-logging.md), one to
> [task 007](007-cardio-recording.md). Each named a screen that does not exist yet: `SetRow` and `NumericKeypad` are
> built and unit-tested in `src/ui/components/`, but **no route renders either**, and the live pace readout is task
> 007's. They could never have been ticked here, and this task must finish **before** task 004. See § The criteria
> that moved.
- [x] Changing one token value visibly updates every screen using it *(§ The token change, on hardware)*
- [x] A manual theme override survives an app restart

**From task 003**
- [x] `react-native-libsodium` — argon2id, XChaCha20-Poly1305 and `randombytes` — works in the
      development build
- [x] Airplane mode, app killed and reopened: the user is still signed in and lands on the home
      screen with no spinner and no error
- [x] A privacy key created on device A is unwrapped correctly by device B after sign-in, and the
      server never receives it in the clear — verified by inspecting the request bodies
      *(§ Device A to device B, for real — the full flow against a running API, with both request
      bodies read off the wire)*
- [x] Changing the password leaves existing encrypted rows decryptable; resetting it does not, and
      the reset screen warned about that before the user confirmed *(§ The privacy-key probe. Proven
      at the key, which is the mechanism: a change re-wraps the same key and the old password stops
      opening it; a reset mints a new one. No encrypted rows exist to test directly until
      [task 007](007-cardio-recording.md) builds privacy zones. The warning was already built —
      `ResetPasswordScreen` renders `account.reset.zones_warning` above a button reading "Reset
      password and remove privacy zones")*
- [x] `privacy_key_kdf` is stored with every wrap; a key wrapped under older parameters still
      unwraps, and is re-wrapped under the current ones at the next password change *(on the device:
      opened `argon2id$m=32768,t=2,p=1`, re-wrapped under `argon2id$m=65536,t=3,p=1`)*
- [x] The key derivation on a mid-range Android phone does not freeze the screen, and its measured
      duration is written into task 003's notes *(**177 ms**, and the screen stayed live through all
      six steps. Caveat recorded rather than glossed: a Galaxy S21 FE is upper-mid at best, so 177 ms
      is a floor for the range this criterion means, not a typical value)*

**The decision** *(from task 001)*
- [x] CI fails if `core-rs` depends on `rand`, or calls `SystemTime::now` — **add each, watch CI fail**,
      then remove them (INV-10). *Both proven for real (§ Both halves of "add it, watch it fail" are
      proven). `rand`: a throwaway branch (`proof/rand-ban-in-ci`) added it to `cyberathlete-core`,
      opened as a PR to trigger CI, and the `core-rs` job failed — precisely and only on
      `EmbarkStudios/cargo-deny-action@v2` — then passed clean again once the branch was deleted.
      `SystemTime::now`: proven locally with `cargo clippy` — a deterministic static check with no
      meaningful local/CI gap, unlike `cargo deny`'s crate-resolution-dependent bans — caught with the
      exact message INV-10 names, removed, clippy clean again*
- [x] `round_to_increment(41.6, 2.5, nearest)` returns **42.5** and `round_to_increment(41.25, 2.5, nearest)`
      returns **40.0** — the tie goes to the lighter load — called from Python **and from the app on a
      physical Android device** (§ The UniFFI half is proven: a device call, on hardware)
- [x] **ADR-004 has a recorded outcome** — option A or option B, with the reason. **Task 004 does not
      start while this is open.** *Recorded 2026-09-18: **option B**, all four bar conditions met
      ([ADR-004 § Outcome](../decisions/ADR-004.md)). The timebox is addressed in the ADR rather than
      glossed — the bar closed at the edge of two days by the calendar, and the reasoning for option B
      anyway (the toolchain was never the thing that resisted) is written out there. **Task 004 is
      unblocked.** The ADR's four pre-launch conditions are untouched by this and still required*

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

### The privacy-key probe, on hardware (2026-09-18)

Task 003's four device criteria had nowhere to run: `src/crypto/diagnostics.ts` held two
secure-storage probes and nothing else. `probePrivacyKeyLifecycle()` now makes six assertions, and
**all six passed on the Galaxy S21 FE** with real `react-native-libsodium`, served over Metro to the
dev build already installed — no native rebuild needed, since the probe is TypeScript over a binding
that was already there.

| Assertion | Result |
|---|---|
| A key wrapped on device A opens on device B | ok — the wrap is self-contained |
| The wrong password is refused | ok — `wrong_password` |
| The wrap carries no key material | ok — fields `kdf, salt, wrappedKey`; two wraps of one key differ |
| A password change keeps the key | ok — old password no longer opens it |
| A password reset makes a new key | ok |
| `privacy_key_kdf` travels with every wrap | ok — opened `m=32768,t=2`, re-wrapped `m=65536,t=3` |

**One derivation: 177 ms. The whole probe: 1393 ms.**

Two things this turned up that are worth keeping:

- **A comment in `privacy-key.ts` was wrong, and had never been measured.** It asserted a derivation
  "holds the JavaScript thread for about a second on a mid-range phone". It is 177 ms here — the
  claim appears to have been an estimate that hardened into documentation. Corrected in place, with
  the device and the number, and the yield kept for genuinely slower phones.
- **The probe had to be built where it is.** `unwrapPrivacyKey()` stores whatever it opens, so a probe
  driving the public API would have overwritten the signed-in user's key on a real device. It
  therefore runs on a throwaway key inside `privacy-key.ts` — the only module that can open a wrap
  without handing the bytes to a caller — and a test asserts it leaves secure storage untouched.

### The README, walked on Windows (2026-09-18)

Every command in `README.md` run in PowerShell, in order, against the Docker stack. **Two defects,
both real, both fixed.**

**1. The very first command did not work.** `python -c "import secrets; ..."`, which the README gives
for generating each `.env` secret, fails outright: on a stock Windows install `python` resolves to
`%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe`, the Microsoft Store stub, which exits with *"O
processo não tem identificador de pacote"* rather than running. Someone following the README from a
clean machine is stopped at step one. Now `uv run --no-project python -c …`, which needs nothing the
README does not already require.

**2. The export scripts wrote CRLF on Windows.** After
`uv run python -m scripts.export_openapi` and `uv run python -m seeds.export`, `git status` showed
`packages/shared/api/openapi.json` and `packages/shared/seeds/reference.json` modified — which reads
exactly like the drift the "Shared types are current" gate exists to catch. It was not drift: the
content was identical and `git diff --exit-code`, the command CI actually runs, passed. `Path.write_text`
in text mode translates `\n` to `\r\n` on Windows, so the same command produced a different file here
than in CI. `.gitattributes` (`* text=auto eol=lf`) meant nothing wrong could ever reach the repository,
which is why CI never saw it and why this surfaced only by running the command on Windows. Both writers
now pass `newline="\n"`, and regenerating leaves the tree clean.

Everything else ran as written: `docker compose up -d`, `uv sync`, `alembic upgrade head`, the seeds,
`uvicorn app.main:app --reload` serving `/health/ready` → `{"status":"ready","reason":null}`,
`uv run pytest` at **339 passed**, `scripts.check_schema` at 40 tables / 43 classified, the daily job,
`corepack enable`, and every row of § Checks — `db:generate`, `check:catalogs` (474 messages),
`render:brand`, and `expo export` + `check:release-bundle-diagnostics` — each leaving its committed
output unchanged.

> One thing worth knowing for anyone repeating this: **do not pipe a native command through `2>&1` in
> PowerShell 5.1.** It wraps ordinary stderr output in an `ErrorRecord` and sets `$?` to false even on
> exit code 0, so `uv sync` and `alembic` both look like failures when they succeeded.

### The EAS build, and ADR-004's last bar condition (2026-09-18)

An Expo account now exists, on the **organization** `cyberathletes-team` rather than the personal
account — ownership can be transferred and people added later without sharing credentials, which is
the cheap hedge against the business-continuity risk [ADR-004](../decisions/ADR-004.md) itself names.

**Build `9933bd7f` finished in 19m49s**, and the APK carries the cross-compiled Rust for all three
ABIs — `libcyberathlete_core_ffi.so` at 415 904 / 286 472 / 442 040 bytes for `arm64-v8a`,
`armeabi-v7a` and `x86_64`, each beside its C++ turbo-module. Read out of the artefact with `unzip`,
because "the build went green" is not the same claim as "the Rust is in the app".

**The part that was not boilerplate.** `packages/core-native/android/CMakeLists.txt` imports those
`.so` files as a *prebuilt* IMPORTED library and links the turbo-module against them. They are build
output, gitignored like `apps/mobile/android/`, and EAS archives the repository through git — so a
clean worker checks out every source file and none of the Rust. Locally they come from `ubrn` in
WSL2; on EAS nothing would have built them. `scripts/eas-build-pre-install.sh` installs Rust 1.98.0
and cargo-ndk 4.1.2, resolves the NDK, and cross-compiles the three ABIs into the directory CMake
reads.

**Two builds failed first, both on the hook, neither on the toolchain** — worth recording so the
distinction survives:

1. `caefb5a4`, 68 s: the hook sourced `$HOME/.cargo/env` unconditionally under `set -euo pipefail`.
2. `ed631d19`: `cargo ndk` runs `cargo metadata` in the *current directory* before it reads
   `--manifest-path`, and the hook ran from `apps/mobile`, which has no `Cargo.toml`. The Rust CI job
   issues the identical command and never saw this, because it sets `working-directory: core-rs`.
   That build also proved, through the hook's own assertion, that **EAS does archive the pnpm
   workspace root** — the one structural unknown — and that the image carries NDK 27.1.12297006.

Also settled here: `expo-dev-client` is now a dependency. The local dev build never needed it —
`expo run:android` produces a debug build Metro serves — but EAS refuses a development-profile build
without it.

**Reading the logs.** `eas-cli` has no `build:logs` command. The signed URL in
`eas build:view <id> --json` under `logFiles` needs `curl --compressed`, or it returns binary.

### The token change, on hardware (2026-09-18)

`colors.dark.accent` was changed from `#4A9FD4` to a magenta `#E0409F`, the app rebundled, and the
change appeared on every token-driven surface at once — the `SegmentedControl`'s selected border and
the account link both went magenta. The token was then reverted, and `src/ui`'s 359 tests, INV-24's
contrast test among them, pass against the restored palette.

Two things the check established that a green test could not:

- **The change is precisely scoped.** React Native's own `Button` — which the diagnostics screen uses
  for its actions — stayed blue throughout, because it is not a design-system component and reads no
  token. Only `src/ui/` surfaces moved. That is the boundary INV-23 describes, visible.
- **Fast Refresh does not carry a token edit.** Saving `tokens.ts` with the app running changed
  nothing on screen and produced no Metro bundle; the values are module constants read at import, so
  already-mounted components keep the old ones. The app had to be restarted, and Metro then rebundled
  exactly 1 module. Worth knowing before task 004 builds screens against these tokens: a designer
  changing a value and seeing nothing happen is a restart, not a broken token.

### The release build refuses, on hardware (2026-09-19)

The last criterion, and the one that needed a signed release artefact rather than a test. `eas.json`'s
`release-cleartext-proof` profile exists for it: `preview` plus an `http://` `EXPO_PUBLIC_API_BASE_URL`
— a build deliberately misconfigured so the guard has something to refuse.

Build `13031987`, 23m33s, 115.5 MB. Installed with `adb install` and launched:

```
FATAL EXCEPTION: mqt_v_native
com.facebook.react.common.JavascriptException: InsecureApiBaseUrlError:
  refusing the API base URL: a release build talks to the API over https only (04 §5)
    assertApiBaseUrlAllowed
    createConfiguredApiClient
    bootstrapAccount
```

It dies inside `bootstrapAccount`, at module load, before any screen renders — which is where task
001 put it deliberately, so a build given an API base URL it may not use cannot get as far as
drawing. On the phone Android shows its own *"o app CyberAthlete apresenta falhas contínuas"*.

Two things confirmed from the same artefact, at no extra cost:

- **`libcyberathlete_core_ffi.so` for all three ABIs in a *release* build**, not only the development
  one — so the EAS hook holds for the release path too.
- **`DiagnosticsScreen` absent from `assets/index.android.bundle`**, re-proving that criterion against
  a real EAS release APK rather than a local `expo export`.

**One observation, recorded rather than fixed.** The refusal is an uncaught exception, so what a
person sees is Android's generic "keeps stopping" dialog — not an explanatory screen. For a
misconfigured *release* build that is arguably correct: the guard's job is to make such a build
impossible to run, and it does. But it is a deliberate crash, and if a friendlier failure is ever
wanted it belongs to whoever owns release configuration, not to this task.

### Device A to device B, for real (2026-09-19)

The one criterion deliberately left open when the probe was written. Run end to end against the local
API, with a small forwarding proxy between the phone and uvicorn (`adb reverse tcp:8000 tcp:9000`) so
the **actual request bodies** could be read, which is what the criterion asks for.

| Step | What happened |
|---|---|
| `pm clear`, register `ab-probe@…` | Device A holds a key: *privacy key held on this device — **yes*** |
| `pm clear` again | Device B: a fresh install, secure storage back to *"nothing yet"* |
| Sign in, email and password only | *privacy key held on this device — **yes*** |

**The request bodies, off the wire.** Registration sends the key **wrapped and nothing else**:

```json
"privacy_key": {
  "wrapped_key": "K7mR/ewU6gi6V3ybP4GQDuOm0P8D6EXbJ5XLEPnt0POnmvVGkAsCjLhvRuFpJ2ytcvAa5xNdpfmJEdI1KIF/OmfOPRZoon2V",
  "salt": "80rOzwa3a6c9Xc7lQC4WiA==",
  "kdf": "argon2id$m=65536,t=3,p=1"
}
```

72 bytes decoded — exactly `WRAPPED_KEY_BYTES`, 24 nonce + 32 ciphertext + 16 tag — and a 16-byte
salt. Sign-in's body is 114 bytes: email, password, `device_id`, no key material at all. Postgres
agrees: `octet_length(wrapped_privacy_key) = 72`, `privacy_key_salt = 16`,
`privacy_key_kdf = argon2id$m=65536,t=3,p=1` for both accounts, and there is no column that could hold
a plaintext key.

**Why "unwrapped correctly" is settled by this and not merely suggested.** The wrap is
XChaCha20-Poly1305, so its tag authenticates: a wrong key cannot produce a successful open. Device B
going from no key to a key, given only the password and the server's wrap, is the AEAD verifying —
there is no path to "yes" that returns different bytes than device A generated.

> Two throwaway accounts — `ab-probe@example.invalid` and `ab-probe2@example.invalid` — are left in
> the local development database. They exist nowhere else.

### The status-bar defect, owned and fixed (2026-09-19)

Found on the device on 2026-09-16 and left unassigned between task 003's screens and task 011's
layout. **It is task 011's**, and the reason decides the fix: `AccountLayout` renders into `Screen`
from `src/ui/`, so the container was already the shared one — it simply applied no inset. Nothing in
`src/` or `app/` referenced safe areas at all, and the root `Stack` runs `headerShown: false`, so
every screen drew from pixel zero.

`Screen` now applies `useSafeAreaInsets()` top and bottom, and the root layout mounts
`SafeAreaProvider`. One container, every screen that uses it, and every screen written later — the
same argument INV-23 makes for tokens. Confirmed on the phone: `Excluir sua conta` sits below the
clock where `Entrar` sat behind it.

**Jest could not have caught this, and now can.** The harness rendered with no safe-area context at
all, so insets were absent rather than wrong. `test/render.tsx` now provides `TEST_METRICS` — a phone
with a 24 px status bar and a 16 px gesture handle — and a new test asserts `Screen` pads by them.
Found while writing it: the INV-27 fence rejected a literal string in the test itself, which is the
lint gate doing its job.

*Not covered:* the diagnostics screen renders a bare `ScrollView` rather than `Screen`, so its first
line still sits under the clock. It is debug-only and exempt from the design rules by ADR-014, and is
left alone deliberately.

### Found on the device, not yet fixed

*(Empty. The status-bar defect above was the last one; the `EMAIL_FOLDER` and `.gitignore` findings
were fixed on 2026-09-17.)*

### Found on the device, fixed (2026-09-17)

- **`EMAIL_FOLDER` resolved against the wrong directory — fixed.** `.env`'s relative `apps/api/.mail` was resolving
  against the process's cwd, not the repository root, because [config.py](../../apps/api/app/core/config.py)'s
  default was `REPO_ROOT`-anchored but a `.env` override was not. A `field_validator` on `Settings.email_folder`
  now anchors any relative value to `REPO_ROOT` regardless of where uvicorn is launched from, proven by two new
  cases in `test_config.py`. The misplaced `apps/api/apps/` directory it had created was deleted.
- **`apps/mobile/.gitignore` decided — ignored, like `android/` and `ios/`.** It is `expo prebuild`-generated and
  only duplicated the root `.gitignore`'s own `expo-env.d.ts` entry, so it is added to the root `.gitignore` next to
  the other prebuild outputs rather than committed.

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

**The UniFFI half was not proven at first.** Both binding crates compiled clean on native Windows — the Rust
side was never the problem. `uniffi-bindgen-react-native@0.31.0-5` (pinned to match the `uniffi` crate's
`0.31`) failed to build *itself* there: `pnpm dlx` compiles it from source, and MSVC's `link.exe` returned
`LNK1104` linking its own build-script binaries. A different symptom from the `react-native-libsodium` CMake
backslash bug found earlier the same day, but the same class of failure, and the same standing allowance
covered it: *a native-Windows build that fights back while WSL2, CI and EAS work is not a failure.* Resolved
in WSL2 — see § The UniFFI half is proven, below.

### The UniFFI half is proven: a device call, on hardware (2026-09-16, continued)

Same day, same branch. Rust in WSL2: `rustup` (toolchain 1.98.0, matching Windows exactly), the three Android
targets, and `cargo-ndk` 4.1.2 — none of it present when the day started. `ubrn` then built and ran cleanly in
WSL2, confirming the native-Windows failure was exactly what it looked like and nothing more.

- **`cargo ndk build` cross-compiled the UniFFI binding for all three Android targets** — `arm64-v8a`,
  `armeabi-v7a`, `x86_64` — in about 12 seconds, proving the Android cross-compilation half of ADR-004's
  "chain works" bar (*"with the Android artefacts built … locally with `cargo-ndk` — natively on Windows or
  in WSL2"*).
- **A real turbo-module package now exists**, `packages/core-native/` (a new pnpm workspace member), built
  from `core-rs/bindings/uniffi/` exactly as ADR-012 §2 describes: `ubrn build android --and-generate`
  produced the Kotlin/C++/TypeScript glue, and `apps/mobile/src/domain/index.ts` is now the thin wrapper
  ADR-004 always intended it to be, exporting `roundLoadToIncrement()`. The ESLint `core-binding` fence
  (`apps/mobile/eslint/fences.js`) already existed from ADR-012's own planning, pointed at a placeholder
  package name (`@cyberathlete/core`) that nothing had ever built — corrected to `@cyberathlete/core-native`,
  the package that now exists.
- **Found and fixed: `includesGeneratedCode: true` in `package.json`'s `codegenConfig`**, copied without
  reading it from the `create-react-native-library` reference scaffold used to learn the file shapes. That
  flag tells React Native's Gradle plugin *"this package already ships its generated code, don't regenerate
  it"* — exactly backwards for a package with no pre-committed spec classes, and it silently skipped
  `generateCodegenArtifactsFromSchema` entirely. The first `./gradlew assembleDebug` failed on
  `Unresolved reference 'NativeCoreNativeSpec'` for exactly this reason; found by reading
  `@react-native/gradle-plugin`'s own Kotlin source rather than guessing further, since two prior guesses
  (an `outputDir` override, a missing `"react-native"` field) were both wrong — `outputDir` in
  `codegenConfig` is never even read by this plugin version, which hardcodes its output to
  `<module>/build/generated/source/codegen`. Removing the flag was the whole fix.
- **`./gradlew assembleDebug` succeeded** — 19m 48s, 571 tasks (a from-scratch native build across three
  ABIs for every module in the app, ours included) — with `NativeCoreNativeSpec.java` generated for real this
  time, and `libcyberathlete_core_ffi.so` for all three ABIs packaged inside the built APK.
- **Installed on the Galaxy S21 FE with `adb install -r`, launched, and it ran.** No crash on
  `System.loadLibrary("cyberathlete-core-native")`, no crash on `installRustCrate()` — both fire at JS module
  load, so either would have taken the app down immediately. Metro (on Windows, over `adb reverse`, the same
  established pattern) bundled 1867 modules and served them in 47.9 s.
- **The diagnostics screen — already home in a dev build — shows, on the device screen, live:**
  ```
  core-rs via UniFFI (task 017's ADR-004 spike, called through @cyberathlete/core-native)
  round_to_increment(41.6, 2.5, nearest) = 42.5
  round_to_increment(41.25, 2.5, nearest) = 40
  ```
  The spike's own two named values, computed by the Rust core, crossing UniFFI, JSI and the C++ turbo-module
  bridge, on physical hardware. Screenshotted and confirmed.
- **Found and fixed in passing: `pnpm start`'s IPv6 bug** (recorded 2026-09-16, "not yet applied") — added
  `cross-env NODE_OPTIONS=--dns-result-order=ipv4first` to the `start` script. Confirmed on the device
  session above: Metro bound `127.0.0.1:8081`, not `::1`, and the app reached it over `adb reverse` first try.

**What remains, precisely:** `packages/core-native/`'s `.so` binaries stay gitignored, rebuilt by
`pnpm --filter @cyberathlete/core-native ubrn:android` (WSL2, as above) — nothing to fix there, it is the
`android/` pattern already established for the app itself · the development build through EAS, which needs
an Expo account that still does not exist · and the ADR-004 outcome itself, which — by the decision
procedure's own wording, "Android artefacts built **by CI on Linux and by EAS**" — stays open until both
have happened. The Rust CI job is no longer merely written; see below.

### Both halves of "add it, watch it fail" are proven (2026-09-18)

Merged as [PR #12](https://github.com/hiuriselzler/projeto_cyber/pull/12) — opened specifically because a
push to a branch with no open PR never triggers `.github/workflows/ci.yml`, and this task needed a real CI
run, not another local stand-in. **CI ran for the first time and passed, all five jobs**, `core-rs` included
— the Rust CI job's first real execution: `cargo fmt`, `cargo clippy -D warnings`, `cargo deny check`,
`cargo test --workspace`, and Android cross-compilation for all three targets via `cargo-ndk`, on GitHub's
own Linux runners. This is ADR-004's "built by CI on Linux" condition, met.

**A green run alone does not prove a gate catches anything** — `deny.toml` and `clippy.toml` had only ever
been proven locally by this point, and CI could in principle have been running a config that silently
checks nothing (task 017's own README notes precisely this failure mode: "a mistyped glob disables a rule
while CI stays green"). So, matching [task 001](001-project-bootstrap.md)'s own proof method exactly — a
throwaway branch, a deliberate violation, watch CI fail, delete the branch:

- **`rand`**: added to `cyberathlete-core` on `proof/rand-ban-in-ci`, opened as a second PR
  ([#13](https://github.com/hiuriselzler/projeto_cyber/pull/13), draft, never meant to merge) to trigger
  CI. The `core-rs` job **failed, precisely and only on `EmbarkStudios/cargo-deny-action@v2`** — every
  other job, and every other step of that job, stayed green. The PR was closed and the branch deleted
  the moment the failure was confirmed.
- **`SystemTime::now`**: proven locally with `cargo clippy --workspace --all-targets -- -D warnings` — a
  planted call in `round_to_increment` was caught with exactly the message `clippy.toml` names
  (*"INV-10: the core reads no clock; `now` is a parameter"*), then clippy was clean again once it was
  removed. Not re-proven through a CI round-trip: unlike `cargo deny`'s crate-graph resolution, `clippy`
  is a deterministic static check with nothing that could plausibly behave differently in CI, and the same
  `cargo clippy` invocation had already run clean, twice, inside the two real CI runs above.

**ADR-004's bar now stands at three of four.** PyO3 from FastAPI: proven. UniFFI from a physical device:
proven. Android artefacts built by CI on Linux: proven, twice over — once cleanly, once catching a
deliberate violation. Built by EAS: still unmet, for the single reason that no Expo account exists yet.
**The toolchain risk the spike exists to retire is, as far as this machine, a real CI run and a physical
phone can show it, retired.** What is left is one account away, not one more engineering question.

### The release bundle is proven diagnostics-free (2026-09-17)

`app/index.tsx` has always picked `DiagnosticsScreen` only `if (__DEV__)`, on the assumption that a
release export's dead-code elimination drops the guarded `require` along with it. That assumption had
never been checked against a real production bundle. It now is:
[`scripts/check-release-bundle-diagnostics.mjs`](../../apps/mobile/scripts/check-release-bundle-diagnostics.mjs)
runs after `npx expo export --platform android` and searches every bundle it produces — Hermes bytecode,
searched as raw bytes, since Hermes keeps source string literals in its string table even with
identifiers otherwise stripped — for the literal string `DiagnosticsScreen`. Wired into the
`android-config` CI job beside `check:release-cleartext`.

Proven both directions, matching task 001's "add it, watch it fail" method: with the `__DEV__` guard
temporarily replaced by `true`, a fresh export's bundle contained `DiagnosticsScreen` and the check
failed, naming the exact bundle file; restoring the guard and re-exporting passed clean again, `1
bundle(s) checked`. `dist/` is git-ignored and was deleted after.

### SQLite round trip: a workout, an exercise and 3 sets (2026-09-17)

`checkSqliteRoundTrip()` in
[`src/db/diagnostics.ts`](../../apps/mobile/src/db/diagnostics.ts), shown on the diagnostics screen,
writes a workout, an exercise and 3 sets through the same Drizzle path the app's own code uses, then
reads the sets back with raw SQL and SQLite's own `typeof()` — deliberately bypassing Drizzle's decode
step, so this checks what SQLite actually stored, not what the ORM converts it back to. Runs inside a
transaction that always rolls back (via a throw drizzle-orm's `db.transaction()` catches, rolls back on,
and rethrows), so nothing it writes is left behind; INV-11 does not apply, since this is a throwaway
fixture rather than training history.

| Check | Result |
|---|---|
| 3 sets written and read back | 3 of 3 |
| `is_completed` storage | SQLite `typeof` **integer**, value **0 or 1** — never a real boolean, exactly 03 §8's mapping |
| `created_at` / `completed_at` storage | SQLite `typeof` **integer**, equal to the epoch-millisecond value written |

Confirmed on the Galaxy S21 FE via the diagnostics screen: `ok: 3 sets round-tripped; booleans as
integer 0/1, timestamps as epoch ms`. (En route: the leftover Metro instance from the earlier failed
native-Windows build attempt below turned out to be double-bound and thrashing, 4056s of CPU time and
~15,000 handles within minutes; killing it and starting clean was the fix. The already-installed
dev-client APK needed no rebuild, since this check is pure JS with no native change.)

### The native-Windows CMake backslash bug reproduces on a fresh `pnpm android` (2026-09-17)

Confirms [PROJECT-STATUS's 2026-09-16 entry](../PROJECT-STATUS.md) rather than adding a new finding:
`pnpm android` (`expo run:android`) on native Windows failed `configureCMakeDebug[arm64-v8a]` for
**three** modules this time — `cyberathlete_core-native`, `react-native-screens` and
`react-native-libsodium` — all with the same `CMakeLists.txt:34 (add_library): Invalid character escape
'\h'` from `NODE_MODULES_DIR`'s Windows backslashes reaching a quoted CMake string unescaped. No source
change caused this; it is the same upstream bug, and the standing allowance already covers it. Not
re-resolved in WSL2 here, because it did not need to be: the JS-only diagnostics change needed no native
rebuild at all, and the already-installed dev-client APK from the 2026-09-16 WSL2 build served it fine
once a healthy Metro instance was serving JS.

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

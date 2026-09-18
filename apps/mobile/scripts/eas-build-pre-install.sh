#!/usr/bin/env bash
#
# EAS build hook — cross-compiles core-rs for Android before Gradle runs (task 017, ADR-004).
#
# Why this exists: packages/core-native/android/CMakeLists.txt imports
#   src/main/jniLibs/<abi>/libcyberathlete_core_ffi.so
# as a *prebuilt* IMPORTED library and links the turbo-module against it. Those binaries are
# gitignored — they are build output, like apps/mobile/android/ — and EAS archives the repository
# through git, so a clean EAS worker checks out every source file and none of the Rust artefacts.
# Locally they come from `pnpm --filter @cyberathlete/core-native ubrn:android` in WSL2; on EAS
# nothing would build them, and the native link would fail. This is that step.
#
# Runs from apps/mobile (the EAS project directory) before the JavaScript dependency install.
set -euo pipefail

RUST_VERSION=1.98.0
CARGO_NDK_VERSION=4.1.2
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
JNI_LIBS="$REPO_ROOT/packages/core-native/android/src/main/jniLibs"
UNIFFI_MANIFEST="$REPO_ROOT/core-rs/bindings/uniffi/Cargo.toml"

echo "--- core-rs Android cross-compilation (task 017) ---"

# 1. Rust, pinned to the same toolchain CI and the development machine use.
if ! command -v cargo > /dev/null 2>&1; then
  echo "Installing Rust $RUST_VERSION"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain "$RUST_VERSION" --profile minimal
fi
# shellcheck disable=SC1091
source "$HOME/.cargo/env"
rustup toolchain install "$RUST_VERSION" --profile minimal
rustup default "$RUST_VERSION"
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android

# 2. cargo-ndk, which drives the NDK toolchain for each ABI.
if ! command -v cargo-ndk > /dev/null 2>&1; then
  cargo install cargo-ndk --version "$CARGO_NDK_VERSION" --locked
fi

# 3. The NDK. EAS sets ANDROID_NDK_HOME on most images; fall back to the newest one the SDK holds,
#    preferring r27 (27.x) — the version Gradle named on this project's first Android build, and
#    the one .github/workflows/ci.yml pins.
if [ -z "${ANDROID_NDK_HOME:-}" ]; then
  NDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}/ndk"
  if [ -d "$NDK_ROOT" ]; then
    ANDROID_NDK_HOME="$(ls -d "$NDK_ROOT"/27.* 2> /dev/null | sort -V | tail -1 || true)"
    if [ -z "$ANDROID_NDK_HOME" ]; then
      ANDROID_NDK_HOME="$(ls -d "$NDK_ROOT"/* | sort -V | tail -1)"
    fi
    export ANDROID_NDK_HOME
  fi
fi
if [ -z "${ANDROID_NDK_HOME:-}" ] || [ ! -d "$ANDROID_NDK_HOME" ]; then
  echo "No Android NDK found: set ANDROID_NDK_HOME, or install one under \$ANDROID_HOME/ndk." >&2
  exit 1
fi
echo "NDK: $ANDROID_NDK_HOME"

# 4. Build, straight into the directory CMakeLists.txt reads. Same three ABIs as ubrn.config.yaml
#    and the Rust CI job; no x86, which nobody on this project runs.
cargo ndk \
  -t arm64-v8a -t armeabi-v7a -t x86_64 \
  -o "$JNI_LIBS" \
  --manifest-path "$UNIFFI_MANIFEST" \
  build --release

echo "--- jniLibs ---"
ls -R "$JNI_LIBS"

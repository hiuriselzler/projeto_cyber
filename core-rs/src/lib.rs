//! The CyberAthlete domain core — [ADR-004](../../docs/decisions/ADR-004.md).
//!
//! One implementation of the logic the phone and the server must agree on exactly, compiled for
//! both: PyO3 into FastAPI, UniFFI into the Expo app. The boundary rule is *if it does I/O, it is
//! not in here* — plain data in, plain data out.
//!
//! INV-10: pure, deterministic and idempotent. No I/O, no clock, no randomness. "Now" is always a
//! parameter. `deny.toml` keeps the crates out and `clippy.toml` keeps the standard-library calls
//! out; an import rule alone would see the first and miss the second.
//!
//! During the ADR-004 spike this crate holds exactly one function. The modules 02 §2 names —
//! `strength`, `gps`, `codec`, `zones` — arrive with the tasks that need them, once the spike has
//! an answer.

#![forbid(unsafe_code)]

pub mod progression;

pub use progression::{RoundingMode, round_to_increment};

"""INV-02 — the one place a load is rounded on the server.

Under ADR-004 option B this module is deliberately almost empty: it re-exports the Rust core reached
through PyO3, so that the server and the phone run the *same* arithmetic rather than two
implementations that agree until a float boundary says otherwise (INV-10).

Import `round_to_increment` from here, never `cyberathlete_core` directly. The fence in
`.importlinter` enforces that, and the reason is INV-02's: a second caller is how a second rounding
rule eventually appears, and a 0.5 kg disagreement makes every downstream cycle diverge.
"""

from cyberathlete_core import RoundingMode, core_version, round_to_increment

__all__ = ["RoundingMode", "core_version", "round_to_increment"]

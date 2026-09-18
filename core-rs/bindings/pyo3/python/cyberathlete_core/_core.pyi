"""Types for the compiled module, so the API's `mypy --strict` sees the core as typed.

Kept beside `src/lib.rs` deliberately: a signature changed there and not here is a type error in the
API, which is the earliest place the mismatch can be caught.

`RoundingMode` is declared as a plain class with class-level members, not as an `enum.Enum`: a PyO3
`#[pyclass]` enum is its own type and does not inherit from Python's `Enum`, and a stub that claimed
otherwise would type-check code that fails at runtime.
"""

class RoundingMode:
    """Which way a load between two steps is moved (INV-02, ADR-010 § Amendment)."""

    Nearest: RoundingMode
    Down: RoundingMode
    Up: RoundingMode

    @staticmethod
    def from_name(name: str) -> RoundingMode:
        """The mode's name in the shared fixtures. Raises `ValueError` for anything else."""

    @property
    def name(self) -> str:
        """The inverse of `from_name`."""

def round_to_increment(weight_kg: float, increment_kg: float, mode: RoundingMode) -> float:
    """Round a load to an exact multiple of an increment (INV-02)."""

def core_version() -> str:
    """The version of the core crate this module was built from. Not `ENGINE_VERSION`."""

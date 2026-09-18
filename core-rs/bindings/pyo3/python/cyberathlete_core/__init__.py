"""The CyberAthlete domain core, on the server side — ADR-004 option B.

One implementation of the logic the phone and the server must agree on exactly, compiled from
`core-rs/` and reached through PyO3. Import it from `app.domain`, never from a service or a router:
the fence in `.importlinter` says so, and the reason is that a second caller is how a second
rounding rule eventually appears.

Everything here is pure (INV-10): no I/O, no clock, no randomness, and `now` is always a parameter.
"""

from ._core import RoundingMode, core_version, round_to_increment

__all__ = ["RoundingMode", "core_version", "round_to_increment"]

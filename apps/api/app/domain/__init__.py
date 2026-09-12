"""Pure domain logic — no I/O, no clock, no randomness (INV-10).

Under ADR-004 option B this is a thin wrapper over core-rs through PyO3; under option A, the Python
implementation. Either way import-linter and ruff's banned-api keep it pure.
"""

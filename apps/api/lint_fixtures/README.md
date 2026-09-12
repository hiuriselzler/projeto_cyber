# Lint fixtures — known-bad code

Every boundary rule in the API has code here that breaks it on purpose. `tests/lint/` runs each rule
against its fixture and fails unless the rule reports every violation planted for it — so a mistyped
module name or path that silently switches a rule off fails CI instead
([task 001](../../../docs/tasks/001-project-bootstrap.md) § Boundary rules).

- `importlinter/fixture_app/` — one package, breaking every contract in `../.importlinter`. The test
  builds its contract file from the real one, renaming `app` to `fixture_app`, so it checks the
  contracts that actually run.
- `banned_api/` — every call INV-10 bans inside `app/domain/`, linted under that folder's own ruff
  config.

Nothing here is imported by the application, and ruff, mypy and pytest skip this folder in normal runs.

# Lint fixtures — known-bad code

Every mobile boundary rule has a file here that breaks it on purpose, with `// expect:` lines naming
the rule (and fence) that must report it. `pnpm lint:fixtures` lints them with the real configuration
and fails unless each is reported exactly as expected — so a mistyped glob that silently switches a
rule off fails CI ([task 001](../../../docs/tasks/001-project-bootstrap.md) § Boundary rules).

The folders mirror `app/` and `src/`, because the rules classify files by path. `platform-files/` is
the fixture for the `*.android.*` / `*.ios.*` check. The regular `pnpm lint`, `tsc` and Jest skip this
folder.

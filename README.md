# CyberAthlete

A mobile fitness app with two co-equal halves — a strength logger and planner, and a GPS cardio tracker
and planner — built on one offline-first core. Android first.

**Start with the docs.** [docs/00-project-context.md](docs/00-project-context.md) explains what and why,
[docs/PROJECT-STATUS.md](docs/PROJECT-STATUS.md) is the live to-do list, and
[.agents/AGENTS.md](.agents/AGENTS.md) holds the rules for anyone — human or agent — changing this
repository.

| Path | What |
|---|---|
| `apps/api` | FastAPI service (Python 3.12, uv) |
| `apps/mobile` | Expo app (React Native, TypeScript, pnpm) — Android |
| `packages/shared` | Generated API types, shared domain fixtures, message catalogs |
| `infra/postgres` | The database-role script for every environment ([ADR-011](docs/decisions/ADR-011.md)) |
| `docs` | Requirements, architecture, invariants, ADRs, tasks |

## Prerequisites

Python 3.12, **Node 24 LTS** (`.nvmrc`), `pnpm` through corepack, `uv`, Docker Desktop, and Android
Studio with the SDK and NDK. A physical Android device with USB debugging. No Mac is needed
([ADR-009](docs/decisions/ADR-009.md)). The Rust toolchain joins with the ADR-004 spike.

On Windows, enable long paths before the first Android build — React Native's native build inside
pnpm's store can pass the 260-character limit — and `git config core.longpaths true`.

## Local development

Every command below runs unchanged in PowerShell and in bash. Start at the repository root with `.env`
created from [.env.example](.env.example); generate each secret with
`python -c "import secrets; print(secrets.token_urlsafe(48))"`.

```sh
# Terminal 1 — database and API, from the repository root
docker compose up -d                      # postgres:16 on 5432, adminer on 8080
cd apps/api
uv sync
uv run alembic upgrade head               # connects as cyberathlete_migrator
uv run python -m seeds                    # seed the reference data: catalog, sports, tracks
uv run uvicorn app.main:app --reload      # http://localhost:8000/docs

# Terminal 2 — mobile, from the repository root
corepack enable
pnpm install
adb reverse tcp:8000 tcp:8000             # the phone's localhost:8000 → this machine's API
adb reverse tcp:8081 tcp:8081             # Metro
cd apps/mobile
pnpm android                              # first time: builds and installs the development build
pnpm start                                # afterwards: Metro for the installed development build
```

The API refuses to start with a development `JWT_SECRET`, or on a database role that could skip
row-level security. The development build talks `http://` to `localhost` only; a release build talks
`https://` only ([04 §5](docs/04-security-and-auth.md)).

### A local PostgreSQL without Docker (Windows, no administrator rights)

**Docker is the supported setup and the one above is what to use.** This section is the fallback for a
machine where Docker Desktop cannot be installed — it needs administrator rights, and for the first part
of this project there were none ([task 017](docs/tasks/017-local-toolchain-device-spike.md)). Nothing here
is installed by default; set it up only if you need it.

A portable PostgreSQL 16 stands in. The binaries go in `%LOCALAPPDATA%\Programs\pgsql-16.15` — EDB build
16.15-1, whose zip matches the hash in Scoop's manifest and whose programs match zonky's copy on Maven
Central — and the data in `%LOCALAPPDATA%\cyberathlete\postgres-16`. It listens on `127.0.0.1:5432`
only, with password authentication, and holds the same two roles as the Docker setup, so `.env` and the
commands above stay exactly the same. It does not start with Windows; in PowerShell:

```powershell
$pg   = "$env:LOCALAPPDATA\Programs\pgsql-16.15\bin"
$home16 = "$env:LOCALAPPDATA\cyberathlete\postgres-16"
& "$pg\pg_ctl.exe" --pgdata "$home16\data" --log "$home16\server.log" start   # before working
& "$pg\pg_ctl.exe" --pgdata "$home16\data" stop                               # when done
```

Stop it before `docker compose up`: both use port 5432.

**On Windows, run the API with `--reload`**, as above. psycopg's async driver cannot use the event loop a
plain `uvicorn` process gets on Windows, and the API then refuses to start — with a message that blames
an unreachable database. Under `--reload` it runs with a compatible loop. The tests select that loop
themselves (`apps/api/tests/conftest.py`). Linux, and so CI and production, is unaffected.

## Checks

| | Command |
|---|---|
| API | `uv run ruff check .` · `uv run ruff format --check .` · `uv run mypy app tests scripts seeds alembic/env.py` · `uv run lint-imports` · `uv run pytest` |
| Schema | `uv run alembic upgrade head` · `uv run python -m seeds` · `uv run python -m scripts.check_schema` (in `apps/api`) |
| Mobile | `pnpm typecheck` · `pnpm lint` · `pnpm lint:fixtures` · `pnpm check:platform-files` · `pnpm test` · `pnpm db:generate` must leave `src/db/migrations` unchanged · `pnpm check:catalogs` · `pnpm render:brand` must leave `assets/images` and `src/ui/brand` unchanged |
| Shared | `uv run python -m scripts.export_openapi` and `uv run python -m seeds.export` (in `apps/api`), then `pnpm --filter @cyberathlete/shared generate:api` |
| Release config | `pnpm prebuild` then `pnpm check:release-cleartext`; `npx expo export --platform android` then `pnpm check:release-bundle-diagnostics` (in `apps/mobile`) |
| Daily job | `uv run python -m app.jobs.daily` (in `apps/api`) — the account-deletion sweep and the retention purges, run once a day in a deployed environment ([06 §5](docs/06-operations.md)) |

API integration tests need the local Postgres and skip without it; CI runs them against a real one.

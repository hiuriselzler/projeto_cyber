"""Boundary rules are tested, not trusted (task 001).

A mistyped module name or path switches a rule off while CI stays green. So every rule runs against
a known-bad fixture in lint_fixtures/, and these tests fail unless the rule reports every violation
planted for it — under that rule, and no other.
"""

import configparser
import json
import os
import re
import subprocess
import sysconfig
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = API_ROOT / "lint_fixtures"
REAL_CONTRACTS = API_ROOT / ".importlinter"


def tool(name: str) -> str:
    executable = f"{name}.exe" if os.name == "nt" else name
    return str(Path(sysconfig.get_path("scripts")) / executable)


def run(*command: str, cwd: Path = API_ROOT) -> str:
    environment = {
        **os.environ,
        # A wide terminal keeps long contract names and import chains on one line each.
        "COLUMNS": "1000",
        # Contract names contain "§"; without UTF-8, Windows reports them in its legacy code page.
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
    }
    result = subprocess.run(
        command,
        cwd=cwd,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        env=environment,
        check=False,
    )
    return result.stdout + result.stderr


# --- import-linter -------------------------------------------------------------------------------

PLANTED_IMPORTS = {
    "layers": [
        "fixture_app.services.imports_router -> fixture_app.api.things",
        "fixture_app.services.imports_job -> fixture_app.jobs.things",
        "fixture_app.api.imports_job -> fixture_app.jobs.things",
        "fixture_app.repositories.imports_service -> fixture_app.services.things",
        "fixture_app.models.imports_repository -> fixture_app.repositories.things",
    ],
    "routers-skip-nothing": [
        f"fixture_app.{package}.skips_layers -> {module}"
        for package in ["api", "jobs"]
        for module in ["fixture_app.repositories.things", "fixture_app.models.things", "sqlalchemy"]
    ],
    "domain-is-pure": [
        f"fixture_app.domain.impure -> {module}"
        for module in [
            "fixture_app.api",
            "fixture_app.core",
            "fixture_app.jobs",
            "fixture_app.main",
            "fixture_app.models",
            "fixture_app.repositories",
            "fixture_app.schemas",
            "fixture_app.services",
            "sqlalchemy",
            "fastapi",
            "pydantic",
            "httpx",
            "socket",
            "os",
            "time",
            "random",
            "secrets",
        ]
    ],
    "core-knows-no-domain": [
        f"fixture_app.core.knows_domain -> fixture_app.{package}.things"
        for package in ["api", "domain", "models", "repositories", "services"]
    ],
    "unscoped-reads-fenced": [
        "fixture_app.services.reads_unscoped -> fixture_app.repositories.unscoped",
    ],
}

ALLOWED_IMPORTS = [
    "fixture_app.services.auth -> fixture_app.repositories.unscoped",
    "fixture_app.services.maintenance -> fixture_app.repositories.unscoped",
]


def real_contracts() -> dict[str, str]:
    """Contract id → contract name, from the configuration CI actually runs."""
    parser = configparser.ConfigParser()
    parser.read(REAL_CONTRACTS, encoding="utf-8")
    prefix = "importlinter:contract:"
    return {
        section.removeprefix(prefix): parser[section]["name"]
        for section in parser.sections()
        if section.startswith(prefix)
    }


def fixture_contracts(directory: Path) -> Path:
    """The real contracts, pointed at fixture_app instead of app."""
    lines = []
    for line in REAL_CONTRACTS.read_text(encoding="utf-8").splitlines():
        module = line.strip()
        if module == "app" or module.startswith("app."):
            # One layer line may name independent siblings: `app.api | app.jobs`.
            line = re.sub(r"\bapp\b", "fixture_app", line)
        lines.append(line)
    path = directory / "fixture.importlinter"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def broken_contract_sections(output: str, names: list[str]) -> dict[str, str]:
    """Splits the report's "Broken contracts" part into one block of text per contract."""
    broken = output[output.index("Broken contracts") :]
    starts = sorted((broken.index(name), name) for name in names)
    ends = [start for start, _ in starts[1:]] + [len(broken)]
    return {name: broken[start:end] for (start, name), end in zip(starts, ends, strict=True)}


def test_every_import_contract_has_planted_violations():
    assert sorted(real_contracts()) == sorted(PLANTED_IMPORTS)


def test_every_import_contract_reports_its_planted_violations(tmp_path):
    contracts = real_contracts()
    output = run(
        tool("lint-imports"),
        "--config",
        str(fixture_contracts(tmp_path)),
        "--no-cache",
        cwd=FIXTURES / "importlinter",
    )

    for name in contracts.values():
        assert f"{name} BROKEN" in output, output
    sections = broken_contract_sections(output, list(contracts.values()))
    for contract_id, planted in PLANTED_IMPORTS.items():
        section = sections[contracts[contract_id]]
        for planted_import in planted:
            assert planted_import in section, f"{contract_id} missed {planted_import}\n{output}"
    for allowed in ALLOWED_IMPORTS:
        assert allowed not in output, output


# --- ruff banned-api (INV-10) --------------------------------------------------------------------

BANNED_CALLS = [
    "datetime.datetime.now",
    "datetime.datetime.utcnow",
    "datetime.datetime.today",
    "datetime.date.today",
    "time.time",
    "time.monotonic",
    "uuid.uuid1",
    "uuid.uuid4",
    "os.environ",
    "os.getenv",
]


def test_the_banned_api_list_reports_every_planted_call():
    output = run(
        tool("ruff"),
        "check",
        "--no-cache",
        "--output-format",
        "json",
        str(FIXTURES / "banned_api" / "reads_the_world.py"),
    )
    messages = [item["message"] for item in json.loads(output) if item["code"] == "TID251"]

    for call in BANNED_CALLS:
        assert any(f"`{call}` is banned" in message for message in messages), (call, messages)


def test_a_repository_call_without_its_user_scope_fails_mypy():
    """INV-15 as a type error: a call that leaves out `user_id`, or passes any other UUID for it."""
    fixture = FIXTURES / "mypy" / "unscoped_repository_calls.py"
    expected = {
        (number, code)
        for number, line in enumerate(fixture.read_text(encoding="utf-8").splitlines(), start=1)
        for code in re.findall(r"# expect: ([a-z-]+)", line)
    }
    output = run(
        tool("mypy"),
        "--no-incremental",
        "--show-error-codes",
        str(fixture.relative_to(API_ROOT)),
    )
    reported = {
        (int(match.group(1)), match.group(2))
        for match in re.finditer(
            r"unscoped_repository_calls\.py:(\d+): error: .*\[([a-z-]+)\]", output
        )
    }

    assert len(expected) == 2
    assert expected <= reported, output


def test_files_in_app_domain_are_linted_with_the_banned_api_list():
    settings = run(
        tool("ruff"), "check", "--show-settings", str(API_ROOT / "app" / "domain" / "__init__.py")
    )

    for call in BANNED_CALLS:
        assert call in settings, call

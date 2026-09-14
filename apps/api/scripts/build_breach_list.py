"""Rebuilds app/core/data/breached_passwords.sha1 from the NCSC's top-100 000 list (ADR-015 §3).

    uv run python -m scripts.build_breach_list path/to/100k-most-used-passwords-NCSC.txt

The NCSC no longer serves the list; SecLists mirrors it under the MIT licence (SOURCE_URL). The file
is checked against the SHA-256 recorded in the decision log before anything is written. Only entries
a user could choose survive — MIN_LENGTH characters or more — stored as sorted SHA-1 digests, so the
repository and the container carry no plaintext password list, and a rebuild diffs cleanly.
"""

import hashlib
import sys
from pathlib import Path

from app.core.passwords import BREACH_LIST, MIN_LENGTH, breach_digest

SOURCE_URL = (
    "https://raw.githubusercontent.com/danielmiessler/SecLists/master/"
    "Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt"
)
SOURCE_SHA256 = "c2e5696882c603b76bb67a47ee970897e5a76fc4c3f5547abe3d0ca340c576e0"


def build(source: bytes) -> list[str]:
    actual = hashlib.sha256(source).hexdigest()
    if actual != SOURCE_SHA256:
        raise SystemExit(f"source SHA-256 is {actual}, expected {SOURCE_SHA256} (ADR-015)")
    entries = source.decode("utf-8").splitlines()
    return sorted({breach_digest(entry) for entry in entries if len(entry) >= MIN_LENGTH})


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    source = Path(argv[0]).read_bytes()
    digests = build(source)
    header = [
        "# The NCSC's 100 000 most common passwords in Pwned Passwords (2019), via SecLists (MIT).",
        f"# Source: {SOURCE_URL}",
        f"# Source SHA-256: {SOURCE_SHA256}",
        f"# Entries of {MIN_LENGTH} characters or more, as SHA-1 hex digests. ADR-015, section 3.",
    ]
    BREACH_LIST.parent.mkdir(parents=True, exist_ok=True)
    BREACH_LIST.write_text("\n".join([*header, *digests]) + "\n", encoding="ascii", newline="\n")
    print(f"wrote {len(digests)} digests to {BREACH_LIST}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

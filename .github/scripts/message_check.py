#!/usr/bin/env python3
import re
import sys
from pathlib import Path

PATTERN = re.compile(
    r"^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)"
    r"(\([a-z0-9._-]+\))?"
    r"!?: "
    r".{1,72}$"
)


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: check_commit_msg.py <commit_msg_file>", file=sys.stderr)
        return 2

    msg_file = Path(sys.argv[1])
    text = msg_file.read_text(encoding="utf-8", errors="replace")

    subject = text.splitlines()[0].strip()

    if not subject:
        print("ERROR: Empty commit message subject.", file=sys.stderr)
        return 1

    if not PATTERN.match(subject):
        print("ERROR: Commit message does not match required pattern.", file=sys.stderr)
        print(f"Got: {subject}", file=sys.stderr)
        print(
            "Expected (example): feat(api): add OpenWebUI endpoints\n"
            "Allowed types: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert\n"
            "Max subject length: 72\n",
            file=sys.stderr,
        )
        print(f"Regex: {PATTERN.pattern}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

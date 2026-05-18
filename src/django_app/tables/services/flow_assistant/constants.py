from __future__ import annotations

import re

_TITLE_MAX_CHARS = 50
_MAX_TOOL_ITERATIONS = 10  # hard cap on tool-call rounds per user turn

_MD_TABLE_PATTERN = re.compile(
    r"(?:^|\n)"  # start of line
    r"\|[^\n]*\|\s*\n"  # header row with pipes
    r"\|[\s\-:|]+\|\s*\n"  # separator row like |---|---|
    r"(?:\|[^\n]*\|\s*\n?)*",  # zero or more body rows
    re.MULTILINE,
)

_CANCEL_KEY = "fa:cancel:{conv_id}"
_CANCEL_TTL_SECONDS = 300

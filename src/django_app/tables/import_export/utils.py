import re
from typing import List


def ensure_unique_identifier(base_name: str, existing_names: List[str]) -> str:
    """
    Creates new unique name from base_name.
    """
    if base_name not in existing_names:
        return base_name

    match = re.match(r"^(.+?)\s*\(\d+\)$", base_name.strip())
    if match:
        clean_base = match.group(1)
    else:
        clean_base = base_name.strip()

    if clean_base not in existing_names:
        return clean_base

    existing_numbers = set()
    pattern = re.compile(rf"^{re.escape(clean_base)}\s*\((\d+)\)$")

    for name in existing_names:
        if name == clean_base:
            existing_numbers.add(1)
        else:
            match = pattern.match(name)
            if match:
                existing_numbers.add(int(match.group(1)))

    i = 2
    while i in existing_numbers:
        i += 1

    return f"{clean_base} ({i})"


def create_filters(data: dict) -> tuple[dict, dict]:
    """Get fields from given data and separate filters for isnull fields and actual values"""
    filters, null_filters = {}, {}

    for field, value in data.items():
        if value is None:
            null_filters[f"{field}__isnull"] = True
        else:
            filters[field] = value

    return filters, null_filters


def python_code_equal(a, b):
    """Compares 2 instances of PythonCode, returns True if they are equal"""
    return all(
        [
            a.libraries == b.libraries,
            (a.code.rstrip() + "\n") == (b.code.rstrip() + "\n"),
            a.entrypoint == b.entrypoint,
            a.global_kwargs == b.global_kwargs,
        ]
    )

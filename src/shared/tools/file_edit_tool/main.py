# Tool: EditFileTool

import os
from pathlib import Path
from textwrap import dedent

class RouteTool:
    @staticmethod
    def _is_path_within_path(source_path: Path, dest_path: Path) -> bool:
        source_path = source_path.resolve()
        dest_path = dest_path.resolve()
        return dest_path in source_path.parents or source_path == dest_path

    @staticmethod
    def is_path_has_permission(path: Path | str) -> bool:
        save_file_path = os.getenv("CONTAINER_SAVEFILES_PATH", ".")
        return RouteTool._is_path_within_path(path, Path(save_file_path))

    def construct_savepath(self, *, frompath: Path | str) -> Path:
        save_file_path = os.getenv("CONTAINER_SAVEFILES_PATH", ".")
        return Path(save_file_path) / Path(frompath)


def main(file_path: str, line_number: int, expected_text: str, new_text: str):
    full_path = RouteTool().construct_savepath(frompath=file_path)
    if not RouteTool.is_path_has_permission(full_path):
        return "Given filepath doesn't have access to the specified directory."

    try:
        with open(full_path, "r", encoding="utf-8") as file:
            lines = file.read().splitlines()
    except Exception as e:
        return f"There was an error reading the file {file_path}: {e}"

    if not 1 <= line_number <= len(lines):
        return dedent(
            f"""
                There is an error: Line number {line_number} is out of the file's range. 
                The file has {len(lines)} lines. The first line is line 1."""
        )

    current_line = lines[line_number - 1]
    if expected_text is not None and current_line != expected_text:
        return f"There is an error: Expected text does not match the text on line {line_number}."

    lines[line_number - 1] = new_text
    text = "\n".join(lines)

    try:
        with open(full_path, "w", encoding="utf-8") as file:
            file.write(text)
    except Exception as e:
        return f"There was an error writing to file {file_path}: {e}"

    return f"Line {line_number} in the file {file_path} edited successfully."

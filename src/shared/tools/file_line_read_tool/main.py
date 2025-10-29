# FileLineReadTool
import os
from pathlib import Path
from typing import Optional, List


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


def format_lines(lines: List[str], line_number: int) -> str:
    return "".join([f"{idx + line_number}: {line}" for idx, line in enumerate(lines)])


def main(file_path: str, line_number: int, num_lines: Optional[int] = None):
    full_path = RouteTool().construct_savepath(frompath=file_path)
    if not RouteTool.is_path_has_permission(full_path):
        return "Given filepath doesn't have access to the specified directory."

    if line_number < 1:
        return f"Line number should be at least 1, because it's 1-based, but {line_number} was given instead."

    if num_lines is not None:
        if num_lines == 0:
            num_lines = None
        elif num_lines < 1:
            return f"Number of lines argument has to be positive, num_lines = {num_lines} given instead."

    try:
        with open(full_path, "r", encoding="utf-8") as file:
            lines = file.readlines()
    except FileNotFoundError:
        return f"File {file_path} not found."
    except PermissionError:
        return "Given filepath doesn't have access to the specified directory."
    except Exception as e:
        return f"Didn't manage to read the file. Unexpected exception occurred: {e}"

    if line_number > len(lines):
        return f"Line number {line_number} is out of the {file_path} range, so I cannot retrieve this line"

    end_index = (line_number - 1) + num_lines if num_lines else len(lines)
    selected_lines = lines[line_number - 1 : end_index]

    if not selected_lines:
        return f"No lines found starting from the specified line number in {file_path}."

    return format_lines(selected_lines, line_number)

# FileCountLinesTool

import os
import encodings
from pathlib import Path

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


def _get_sorted_encodings():
    common_encodings = [
        "utf-8", "ascii", "utf-16", "utf-32",
        "cp1251", "cp1252", "latin-1", "iso-8859-1", "iso-8859-2"
    ]
    low_freq = list(set(encodings.aliases.aliases.values()) - set(common_encodings))
    return common_encodings + low_freq

def _retrieve_encoding(file_path: Path | str):
    for encoding in _get_sorted_encodings():
        try:
            with open(file_path, "r", encoding=encoding):
                return encoding
        except (UnicodeDecodeError, LookupError):
            continue
    raise ValueError("Failed to decode the file with any available decoding")


def main(file_path: str):
    full_path = RouteTool().construct_savepath(frompath=file_path)
    if not RouteTool.is_path_has_permission(full_path):
        return "Given filepath doesn't have access to the specified directory."

    if not os.path.exists(full_path):
        return "The file cannot be found, probably it doesn't exist"
    if os.path.isdir(full_path):
        return "The provided path is a directory, not a file name"
    try:
        encoding = _retrieve_encoding(full_path)
        with open(full_path, "r", encoding=encoding) as file:
            return f"Total lines: {sum(1 for _ in file)}"
    except ValueError:
        return "The file cannot be read as it may be a binary or non-text file"
    except PermissionError:
        return "Given filepath doesn't have access to the specified directory."
    except Exception as e:
        return f"Didn't manage to read a file. Unexpected exception occurred: {e}"

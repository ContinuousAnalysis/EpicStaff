import io
import os
import tarfile
import zipfile

from rest_framework import serializers


class FileValidator:
    """
    Validates uploaded files against a blocklist of executable extensions.
    Inspects archive contents (ZIP/TAR) without extracting file data.
    """

    BLOCKED_EXTENSIONS: frozenset[str] = frozenset(
        {
            # Windows executables & installers
            ".exe",
            ".msi",
            ".com",
            ".scr",
            ".pif",
            # Windows scripting
            ".bat",
            ".cmd",
            ".vbs",
            ".vbe",
            ".wsh",
            ".wsf",
            ".ps1",
            ".psm1",
            ".psd1",
            # Unix/macOS executables
            ".sh",
            ".bash",
            ".csh",
            ".ksh",
            ".zsh",
            ".app",
            ".command",
            ".elf",
            # Java archives (executable)
            ".jar",
            ".war",
            ".ear",
            # Shared libraries
            ".dll",
            ".so",
            ".dylib",
        }
    )

    def is_executable_filename(self, filename: str) -> bool:
        return os.path.splitext(filename)[1].lower() in self.BLOCKED_EXTENSIONS

    def scan_archive_for_executables(self, file_obj) -> list[str]:
        """
        Inspect a ZIP or TAR archive in memory and return entry paths that
        have blocked extensions.  Only reads the directory listing — no
        content is extracted.  Resets file position after inspection.
        """
        pos = file_obj.tell()
        data = file_obj.read()
        file_obj.seek(pos)

        blocked: list[str] = []
        buf = io.BytesIO(data)

        if zipfile.is_zipfile(buf):
            buf.seek(0)
            with zipfile.ZipFile(buf, "r") as zf:
                for name in zf.namelist():
                    if not name.endswith("/") and self.is_executable_filename(name):
                        blocked.append(name)
            return blocked

        buf.seek(0)
        try:
            is_tar = tarfile.is_tarfile(buf)
        except Exception:
            is_tar = False

        if is_tar:
            buf.seek(0)
            with tarfile.open(fileobj=buf, mode="r:*") as tf:
                for member in tf.getmembers():
                    if member.isfile() and self.is_executable_filename(member.name):
                        blocked.append(member.name)
            return blocked

        return blocked

    def validate(self, files: list) -> list:
        """
        Validate a list of uploaded files.  Raises
        ``serializers.ValidationError`` if any file (or archive entry) has a
        blocked executable extension.
        """
        all_problems: dict[str, list[str]] = {}

        for f in files:
            if self.is_executable_filename(f.name):
                all_problems[f.name] = [f.name]
                continue
            archive_blocked = self.scan_archive_for_executables(f)
            if archive_blocked:
                all_problems[f.name] = archive_blocked

        if all_problems:
            detail_lines = []
            for fname, entries in all_problems.items():
                if len(entries) == 1 and entries[0] == fname:
                    detail_lines.append(f"'{fname}' has a blocked executable extension")
                else:
                    detail_lines.append(
                        f"Archive '{fname}' contains executable files: "
                        + ", ".join(entries)
                    )
            raise serializers.ValidationError(
                "Executable files are not allowed. " + "; ".join(detail_lines)
            )

        return files

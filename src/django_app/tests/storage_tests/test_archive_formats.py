import tarfile
import zipfile
from io import BytesIO

import pytest

from tables.services.storage_service.archive_formats import (
    assert_zip_is_extractable,
    is_archive_content,
    is_archive_name,
)


def test_routing():
    assert is_archive_name("a.zip")
    assert is_archive_name("a.tar.gz")
    assert is_archive_name("a.TGZ")
    assert is_archive_name("a.tbz")
    assert is_archive_name("a.taz")
    assert not is_archive_name("a.txt")
    assert not is_archive_name("a.docx")
    assert not is_archive_name("a.jar")


def test_every_tar_alias_the_content_sniffing_path_accepted_is_still_routed():
    # the non-streaming upload detected archives by content, so these aliases used to
    # be extracted; extension routing has to name them explicitly or they regress
    for name in ("x.tar", "x.tgz", "x.taz", "x.tar.gz", "x.tar.bz2", "x.tbz", "x.tbz2", "x.tar.xz", "x.txz"):
        assert is_archive_name(name), name


def _zip(name: str, body: str) -> BytesIO:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(name, body)
    buf.seek(0)
    return buf


class TestIsArchiveContent:
    """Moved from the StorageManager suite when the sniffing left the manager."""

    def test_true_for_zip(self):
        assert is_archive_content(_zip("a.txt", "data"), "archive.zip") is True

    def test_true_for_tar(self):
        buf = BytesIO()
        with tarfile.open(fileobj=buf, mode="w") as tf:
            info = tarfile.TarInfo("a.txt")
            info.size = 4
            tf.addfile(info, BytesIO(b"data"))
        buf.seek(0)
        assert is_archive_content(buf, "archive.tar") is True

    def test_false_for_docx(self):
        # a .docx really is a ZIP but must never be extracted
        assert is_archive_content(_zip("[Content_Types].xml", "<Types/>"), "document.docx") is False

    def test_false_for_xlsx(self):
        assert is_archive_content(_zip("sheet.xml", "<data/>"), "spreadsheet.xlsx") is False

    def test_false_for_plain_text(self):
        assert is_archive_content(BytesIO(b"just plain text"), "readme.txt") is False

    def test_restores_the_file_position(self):
        buf = _zip("a.txt", "data")
        is_archive_content(buf, "archive.zip")
        assert buf.tell() == 0


def _encrypted_zip() -> BytesIO:
    """A ZIP with the encryption flag set on the entry and the directory record."""
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("secret.txt", "data")
    raw = bytearray(buf.getvalue())
    raw[6] |= 0x01
    cd = raw.find(b"PK\x01\x02")
    if cd >= 0:
        raw[cd + 8] |= 0x01
    return BytesIO(bytes(raw))


class TestAssertZipIsExtractable:
    """Pre-flight that survived the removal of the multipart upload's
    _check_archive_password: extraction must not start on an archive it cannot
    finish, or the members before the bad one get written and rolled back."""

    def test_passes_a_healthy_zip(self):
        assert_zip_is_extractable(_zip("a.txt", "data"), "a.zip") is None

    def test_ignores_non_zip_input(self):
        assert_zip_is_extractable(BytesIO(b"plain text"), "a.txt") is None

    def test_rejects_an_encrypted_zip(self):
        with pytest.raises(ValueError, match="password-protected"):
            assert_zip_is_extractable(_encrypted_zip(), "secret.zip")

    def test_rejects_an_unreadable_central_directory(self):
        buf = _zip("a.txt", "data")
        raw = bytearray(buf.getvalue())
        cd = raw.find(b"PK\x01\x02")
        raw[cd + 4 : cd + 40] = b"\xff" * 36  # keep the EOCD, wreck the entry
        with pytest.raises(ValueError, match="damaged or unreadable"):
            assert_zip_is_extractable(BytesIO(bytes(raw)), "broken.zip")

    def test_restores_the_file_position(self):
        buf = _zip("a.txt", "data")
        assert_zip_is_extractable(buf, "a.zip")
        assert buf.tell() == 0

"""
Unit tests for NaiveRagPreviewChunkBulkByIdsView.

These tests exercise the view in isolation:
- No URL routing (APIRequestFactory, view called via .as_view()).
- No database (NaiveRagService.get_preview_chunks_by_ids is patched).
- No DRF middleware/auth pipeline beyond what APIView itself runs.

They verify only the view's own responsibilities: request body parsing,
validation, mapping service results / exceptions to HTTP responses, and
the shape of the response payload. Dedup / scoping semantics belong to
service-level tests.
"""

from types import SimpleNamespace
from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APIRequestFactory, force_authenticate

from tables.exceptions import DocumentConfigNotFoundException
from tables.views.knowledge_views.naive_rag_views import (
    NaiveRagPreviewChunkBulkByIdsView,
)


BY_IDS_PATH = "/dummy/"  # APIRequestFactory bypasses URL routing; path is unused.

view = NaiveRagPreviewChunkBulkByIdsView.as_view()

SERVICE_PATH = (
    "tables.views.knowledge_views.naive_rag_views."
    "NaiveRagService.get_preview_chunks_by_ids"
)


_AUTH_USER = SimpleNamespace(is_authenticated=True, is_active=True)


def _post(body=None, *, naive_rag_id=1, document_config_id=2):
    """Build a POST request and invoke the view directly."""
    factory = APIRequestFactory()
    request = factory.post(BY_IDS_PATH, body or {}, format="json")
    force_authenticate(request, user=_AUTH_USER)
    return view(
        request,
        naive_rag_id=naive_rag_id,
        document_config_id=document_config_id,
    )


def _fake_chunk(preview_chunk_id, text="text", chunk_index=0):
    """
    Build a stand-in for a NaiveRagPreviewChunk that the serializer can read.
    NaiveRagPreviewChunkSerializer is a ModelSerializer, but with attribute
    access on the source object it serializes fine for unit tests.
    """
    return SimpleNamespace(
        preview_chunk_id=preview_chunk_id,
        text=text,
        chunk_index=chunk_index,
        token_count=None,
        overlap_start_index=None,
        overlap_end_index=None,
        metadata=None,
        created_at=None,
    )


class TestByIdsViewSuccess:
    """View correctly forwards the body to the service and shapes the response."""

    def test_returns_payload_from_service(self):
        chunks = [_fake_chunk(20, "alpha"), _fake_chunk(21, "beta")]
        with patch(SERVICE_PATH, return_value=chunks) as mock_fetch:
            resp = _post(
                {"preview_chunk_ids": [20, 21]},
                naive_rag_id=7,
                document_config_id=42,
            )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["naive_rag_id"] == 7
        assert resp.data["document_config_id"] == 42
        assert resp.data["total"] == 2
        assert [c["preview_chunk_id"] for c in resp.data["chunks"]] == [20, 21]
        mock_fetch.assert_called_once_with(
            naive_rag_id=7,
            document_config_id=42,
            preview_chunk_ids=[20, 21],
        )

    def test_passes_duplicate_ids_to_service_unchanged(self):
        # Dedup is the service's responsibility, not the view's.
        with patch(SERVICE_PATH, return_value=[]) as mock_fetch:
            _post({"preview_chunk_ids": [1, 1, 2, 2, 3]})

        assert mock_fetch.call_args.kwargs["preview_chunk_ids"] == [1, 1, 2, 2, 3]

    def test_empty_service_result_returns_zero_total(self):
        with patch(SERVICE_PATH, return_value=[]):
            resp = _post({"preview_chunk_ids": [999]})

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data["total"] == 0
        assert resp.data["chunks"] == []


class TestByIdsViewValidation:
    """View-level validation runs before the service is invoked."""

    def test_missing_body_returns_400(self):
        with patch(SERVICE_PATH) as mock_fetch:
            resp = _post({})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        mock_fetch.assert_not_called()

    def test_empty_ids_list_returns_400(self):
        with patch(SERVICE_PATH) as mock_fetch:
            resp = _post({"preview_chunk_ids": []})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        mock_fetch.assert_not_called()

    def test_non_integer_id_returns_400(self):
        with patch(SERVICE_PATH) as mock_fetch:
            resp = _post({"preview_chunk_ids": ["abc"]})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        mock_fetch.assert_not_called()

    def test_non_positive_id_returns_400(self):
        with patch(SERVICE_PATH) as mock_fetch:
            resp = _post({"preview_chunk_ids": [0, -5]})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        mock_fetch.assert_not_called()


class TestByIdsViewExceptionMapping:
    """Service exceptions are translated to the right HTTP status codes."""

    def test_document_config_not_found_returns_404(self):
        exc = DocumentConfigNotFoundException(42)
        with patch(SERVICE_PATH, side_effect=exc):
            resp = _post({"preview_chunk_ids": [1]}, document_config_id=42)

        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert resp.data == {"error": str(exc)}

    def test_unexpected_exception_returns_500(self):
        with patch(SERVICE_PATH, side_effect=RuntimeError("boom")):
            resp = _post({"preview_chunk_ids": [1]})

        assert resp.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "boom" in resp.data["error"]

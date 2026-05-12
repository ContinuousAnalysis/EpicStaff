"""
Unit tests for NaiveRagChunkSearchView.

They verify only the view's own responsibilities: query-param parsing,
validation, mapping service results / exceptions to HTTP responses, and
the shape of the response payload. Search semantics (case-insensitive
substring match, ordering) belong to service-level tests.
"""

from types import SimpleNamespace
from unittest.mock import patch

from rest_framework import status
from rest_framework.test import APIRequestFactory, force_authenticate

from tables.exceptions import DocumentConfigNotFoundException
from tables.views.knowledge_views.naive_rag_views import NaiveRagChunkSearchView


SEARCH_PATH = "/dummy/"  # APIRequestFactory bypasses URL routing; path is unused.

view = NaiveRagChunkSearchView.as_view()


_AUTH_USER = SimpleNamespace(is_authenticated=True, is_active=True)


def _get(query_params=None, *, naive_rag_id=1, document_config_id=2):
    """Build a GET request and invoke the view directly."""
    factory = APIRequestFactory()
    request = factory.get(SEARCH_PATH, query_params or {})
    force_authenticate(request, user=_AUTH_USER)
    return view(
        request,
        naive_rag_id=naive_rag_id,
        document_config_id=document_config_id,
    )


SERVICE_PATH = (
    "tables.views.knowledge_views.naive_rag_views.NaiveRagService.search_chunks"
)


class TestChunkSearchViewSuccess:
    """View correctly forwards params to the service and shapes the response."""

    def test_returns_payload_from_service(self):
        service_result = {
            "total_matches": 1,
            "preview_chunk_ids": [20],
        }
        with patch(SERVICE_PATH, return_value=service_result) as mock_search:
            resp = _get(
                {"q": "hello world"},
                naive_rag_id=7,
                document_config_id=42,
            )

        assert resp.status_code == status.HTTP_200_OK
        assert resp.data == {
            "naive_rag_id": 7,
            "document_config_id": 42,
            "query": "hello world",
            "total_matches": 1,
            "limit": NaiveRagChunkSearchView.DEFAULT_LIMIT,
            "offset": 0,
            "preview_chunk_ids": [20],
        }
        mock_search.assert_called_once_with(
            naive_rag_id=7,
            document_config_id=42,
            query="hello world",
            limit=NaiveRagChunkSearchView.DEFAULT_LIMIT,
            offset=0,
        )

    def test_strips_whitespace_around_query(self):
        with patch(SERVICE_PATH, return_value=_empty_result()) as mock_search:
            _get({"q": "  banana  "})

        assert mock_search.call_args.kwargs["query"] == "banana"

    def test_passes_custom_limit_and_offset_to_service(self):
        with patch(SERVICE_PATH, return_value=_empty_result()) as mock_search:
            _get({"q": "foo", "limit": 5, "offset": 10})

        kwargs = mock_search.call_args.kwargs
        assert kwargs["limit"] == 5
        assert kwargs["offset"] == 10

    def test_caps_limit_at_max_limit(self):
        with patch(SERVICE_PATH, return_value=_empty_result()) as mock_search:
            _get({"q": "foo", "limit": 10_000})

        assert (
            mock_search.call_args.kwargs["limit"] == NaiveRagChunkSearchView.MAX_LIMIT
        )

    def test_uses_default_limit_when_omitted(self):
        with patch(SERVICE_PATH, return_value=_empty_result()) as mock_search:
            _get({"q": "foo"})

        assert (
            mock_search.call_args.kwargs["limit"]
            == NaiveRagChunkSearchView.DEFAULT_LIMIT
        )


class TestChunkSearchViewValidation:
    """View-level validation runs before the service is invoked."""

    def test_missing_q_returns_400(self):
        with patch(SERVICE_PATH) as mock_search:
            resp = _get()
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        mock_search.assert_not_called()

    def test_blank_q_returns_400(self):
        with patch(SERVICE_PATH) as mock_search:
            resp = _get({"q": "   "})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        mock_search.assert_not_called()

    def test_non_integer_limit_returns_400(self):
        with patch(SERVICE_PATH) as mock_search:
            resp = _get({"q": "foo", "limit": "abc"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        mock_search.assert_not_called()

    def test_non_integer_offset_returns_400(self):
        with patch(SERVICE_PATH) as mock_search:
            resp = _get({"q": "foo", "offset": "abc"})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        mock_search.assert_not_called()

    def test_negative_limit_returns_400(self):
        with patch(SERVICE_PATH) as mock_search:
            resp = _get({"q": "foo", "limit": -1})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        mock_search.assert_not_called()

    def test_negative_offset_returns_400(self):
        with patch(SERVICE_PATH) as mock_search:
            resp = _get({"q": "foo", "offset": -1})
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        mock_search.assert_not_called()


class TestChunkSearchViewExceptionMapping:
    """Service exceptions are translated to the right HTTP status codes."""

    def test_document_config_not_found_returns_404(self):
        exc = DocumentConfigNotFoundException(42)
        with patch(SERVICE_PATH, side_effect=exc):
            resp = _get({"q": "foo"}, document_config_id=42)

        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert resp.data == {"error": str(exc)}

    def test_unexpected_exception_returns_500(self):
        with patch(SERVICE_PATH, side_effect=RuntimeError("boom")):
            resp = _get({"q": "foo"})

        assert resp.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "boom" in resp.data["error"]


def _empty_result():
    return {
        "total_matches": 0,
        "preview_chunk_ids": [],
    }

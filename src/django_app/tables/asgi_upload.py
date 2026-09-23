import json
import logging

from asgiref.sync import sync_to_async
from django.conf import settings
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    MethodNotAllowed,
    NotAuthenticated,
    PermissionDenied,
    ValidationError,
)
from rest_framework.request import Request

# Reused so this endpoint renders errors exactly like every DRF view in the
# project; duplicating the flattening would let the two envelopes drift apart.
from utils.exception_handler import _flatten_detail

from tables.models.rbac_models.rbac_enums import Permission, ResourceType
from tables.services.rbac.authentication import ApiKeyAuthentication, JwtAuthentication
from tables.services.rbac.org_context_service import OrgContextService
from tables.services.rbac.permissions import HasOrgPermission
from tables.services.storage_service import upload_stream_service as svc
from tables.services.storage_service.archive_formats import is_archive_name
from tables.validators.file_upload_validator import FileValidator

logger = logging.getLogger(__name__)

UPLOAD_STREAM_PATH = "/api/storage/upload/stream"


class _StreamUploadView:
    rbac_resource_type = ResourceType.FILES
    rbac_action_map = {"upload_stream": Permission.CREATE}
    action = "upload_stream"
    kwargs: dict = {}


def _build_drf_request(scope) -> Request:
    from django.http import HttpRequest, QueryDict

    dj = HttpRequest()
    dj.method = scope.get("method", "POST")
    dj.path = scope.get("path", "")
    meta: dict[str, str] = {}
    for raw_name, raw_value in scope.get("headers", []):
        name = raw_name.decode("latin1").upper().replace("-", "_")
        value = raw_value.decode("latin1")
        if name in ("CONTENT_TYPE", "CONTENT_LENGTH"):
            meta[name] = value
        else:
            meta["HTTP_" + name] = value
    dj.META = meta
    dj.GET = QueryDict(scope.get("query_string", b"").decode("latin1"))
    return Request(dj, authenticators=[JwtAuthentication(), ApiKeyAuthentication()])


def _authenticate_and_authorize(drf_request: Request) -> int:
    user = drf_request.user
    if not user or not user.is_authenticated:
        raise NotAuthenticated()
    view = _StreamUploadView()
    permission = HasOrgPermission()
    if not permission.has_permission(drf_request, view):
        raise PermissionDenied(getattr(permission, "message", "Permission denied."))
    return OrgContextService().resolve(request=drf_request, view_kwargs={})


def _body_stream(receive):
    async def gen():
        while True:
            event = await receive()
            event_type = event.get("type")
            if event_type == "http.disconnect":
                raise ClientDisconnectedError()
            if event_type == "http.request":
                chunk = event.get("body", b"")
                if chunk:
                    yield chunk
                if not event.get("more_body", False):
                    return

    return gen()


class ClientDisconnectedError(Exception):
    pass


class UploadFailedError(APIException):
    """Catch-all for unexpected failures; 4xx so nothing 5xx reaches the wire."""

    status_code = 400
    default_detail = "Upload failed."
    default_code = "upload_failed"


def _scope_header(scope, name: bytes) -> str | None:
    for raw_name, raw_value in scope.get("headers", []):
        if raw_name.lower() == name:
            return raw_value.decode("latin1")
    return None


def _cors_headers(scope) -> list[tuple[bytes, bytes]]:
    """Mirror what CorsMiddleware would have added to a DRF response.

    Bypassing the Django middleware chain also bypasses corsheaders, which
    would leave a cross-origin frontend (the ng-serve setup CORS_ALLOWED_ORIGINS
    exists for) unable to read the response even though the upload succeeded.
    """
    origin = _scope_header(scope, b"origin")
    if not origin:
        return []
    allowed = getattr(settings, "CORS_ALLOWED_ORIGINS", None) or []
    if not (getattr(settings, "CORS_ALLOW_ALL_ORIGINS", False) or origin in allowed):
        return []
    headers = [
        (b"access-control-allow-origin", origin.encode("latin1")),
        (b"vary", b"Origin"),
    ]
    if getattr(settings, "CORS_ALLOW_CREDENTIALS", False):
        headers.append((b"access-control-allow-credentials", b"true"))
    return headers


async def _send_json(send, status: int, payload: dict, scope=None) -> None:
    body = json.dumps(payload).encode()
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body)).encode()),
    ]
    if scope is not None:
        headers.extend(_cors_headers(scope))
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


def _error_payload(exc: APIException) -> dict:
    detail = exc.detail if exc.detail else exc.default_detail
    return {
        "status_code": exc.status_code,
        "code": exc.default_code,
        "message": _flatten_detail(detail),
    }


async def _send_error(send, exc: APIException, scope) -> None:
    await _send_json(send, exc.status_code, _error_payload(exc), scope)


async def upload_stream_asgi(scope, receive, send) -> None:
    try:
        method = scope.get("method")
        if method != "POST":
            raise MethodNotAllowed(method or "")

        drf_request = _build_drf_request(scope)
        org_id = await sync_to_async(_authenticate_and_authorize)(drf_request)

        params = drf_request.query_params
        path = params.get("path", "")
        filename = params.get("filename", "")
        if not filename:
            raise ValidationError({"filename": "Query param 'filename' is required."})

        FileValidator().validate_name(filename, None)

        declared_size = None
        content_length = drf_request.META.get("CONTENT_LENGTH")
        if content_length and content_length.isdigit():
            declared_size = int(content_length)

        body = _body_stream(receive)
        if is_archive_name(filename):
            result = await svc.ingest_archive(org_id, path, filename, body)
        else:
            result = await svc.ingest_flat(org_id, path, filename, body, declared_size)

        await _send_json(send, 200, {"status": "DONE", **result}, scope)

    except (AuthenticationFailed, NotAuthenticated) as exc:
        await _send_error(send, exc, scope)
    except APIException as exc:
        await _send_error(send, exc, scope)
    except ClientDisconnectedError:
        logger.info("Streaming upload aborted: client disconnected")
    except Exception:
        logger.exception("Streaming upload failed")
        await _send_error(send, UploadFailedError(), scope)

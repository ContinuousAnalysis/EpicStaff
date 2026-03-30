import io
import zipfile

from django.http import HttpResponse
from drf_yasg.utils import swagger_auto_schema
from rest_framework import status
from rest_framework.decorators import action, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from tables.storage_mock_data import (
    MOCK_FOLDER_TREE,
    MOCK_FILE_INFO,
    MOCK_SAMPLE_FILE_CONTENT,
    MOCK_SESSION_OUTPUTS,
)
from tables.storage_permissions import StoragePermission
from tables.swagger_schemas.storage_schema import (
    STORAGE_ADD_TO_FLOW_SWAGGER,
    STORAGE_COPY_SWAGGER,
    STORAGE_DELETE_SWAGGER,
    STORAGE_DOWNLOAD_SWAGGER,
    STORAGE_DOWNLOAD_ZIP_SWAGGER,
    STORAGE_INFO_SWAGGER,
    STORAGE_LIST_SWAGGER,
    STORAGE_MKDIR_SWAGGER,
    STORAGE_MOVE_SWAGGER,
    STORAGE_RENAME_SWAGGER,
    STORAGE_SESSION_OUTPUTS_SWAGGER,
    STORAGE_UPLOAD_ARCHIVE_SWAGGER,
    STORAGE_UPLOAD_SWAGGER,
)


class StorageAPIView(ViewSet):
    permission_classes = [StoragePermission]

    @action(detail=False, methods=["get"], url_path="list")
    @swagger_auto_schema(**STORAGE_LIST_SWAGGER)
    def list_files(self, request):
        path = request.query_params.get("path", "/")
        data = {**MOCK_FOLDER_TREE, "path": path}
        return Response(data)

    @action(detail=False, methods=["get"], url_path="info")
    @swagger_auto_schema(**STORAGE_INFO_SWAGGER)
    def info(self, request):
        path = request.query_params.get("path", "/")
        name = path.rstrip("/").split("/")[-1] if path else "unknown"
        data = {**MOCK_FILE_INFO, "path": path, "name": name}
        return Response(data)

    @action(detail=False, methods=["get"], url_path="download")
    @swagger_auto_schema(**STORAGE_DOWNLOAD_SWAGGER)
    def download(self, request):
        path = request.query_params.get("path", "/")
        filename = path.rstrip("/").split("/")[-1] if path else "file.txt"
        response = HttpResponse(MOCK_SAMPLE_FILE_CONTENT, content_type="text/plain")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=["post"], url_path="upload")
    @swagger_auto_schema(**STORAGE_UPLOAD_SWAGGER)
    @parser_classes([MultiPartParser])
    def upload(self, request):
        path = request.data.get("path", "/")
        uploaded_file = request.FILES.get("file")
        file_name = uploaded_file.name if uploaded_file else "unnamed"
        file_size = uploaded_file.size if uploaded_file else 0
        return Response(
            {"path": f"{path.rstrip('/')}/{file_name}", "size": file_size},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="upload-archive")
    @swagger_auto_schema(**STORAGE_UPLOAD_ARCHIVE_SWAGGER)
    @parser_classes([MultiPartParser])
    def upload_archive(self, request):
        path = request.data.get("path", "/")
        return Response(
            {
                "extracted": [
                    f"{path.rstrip('/')}/document.txt",
                    f"{path.rstrip('/')}/data/report.csv",
                    f"{path.rstrip('/')}/data/summary.json",
                ]
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="download-zip")
    @swagger_auto_schema(**STORAGE_DOWNLOAD_ZIP_SWAGGER)
    def download_zip(self, request):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("sample_file_1.txt", "Sample content for file 1")
            zf.writestr("sample_file_2.txt", "Sample content for file 2")
        buffer.seek(0)
        response = HttpResponse(buffer.read(), content_type="application/zip")
        response["Content-Disposition"] = 'attachment; filename="download.zip"'
        return response

    @action(detail=False, methods=["post"], url_path="mkdir")
    @swagger_auto_schema(**STORAGE_MKDIR_SWAGGER)
    def mkdir(self, request):
        path = request.data.get("path", "")
        return Response(
            {"path": path, "created": True},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["delete"], url_path="delete")
    @swagger_auto_schema(**STORAGE_DELETE_SWAGGER)
    def delete_file(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="rename")
    @swagger_auto_schema(**STORAGE_RENAME_SWAGGER)
    def rename(self, request):
        from_path = request.data.get("from", "")
        to_path = request.data.get("to", "")
        return Response({"from": from_path, "to": to_path, "success": True})

    @action(detail=False, methods=["post"], url_path="move")
    @swagger_auto_schema(**STORAGE_MOVE_SWAGGER)
    def move(self, request):
        from_path = request.data.get("from", "")
        to_path = request.data.get("to", "")
        return Response({"from": from_path, "to": to_path, "success": True})

    @action(detail=False, methods=["post"], url_path="copy")
    @swagger_auto_schema(**STORAGE_COPY_SWAGGER)
    def copy(self, request):
        from_path = request.data.get("from", "")
        to_path = request.data.get("to", "")
        return Response({"from": from_path, "to": to_path, "success": True})

    @action(detail=False, methods=["post"], url_path="add-to-flow")
    @swagger_auto_schema(**STORAGE_ADD_TO_FLOW_SWAGGER)
    def add_to_flow(self, request):
        path = request.data.get("path", "")
        flow_id = request.data.get("flow_id")
        variable_name = request.data.get("variable_name", "")
        return Response(
            {"path": path, "flow_id": flow_id, "variable_name": variable_name}
        )

    @action(detail=False, methods=["get"], url_path="session-outputs")
    @swagger_auto_schema(**STORAGE_SESSION_OUTPUTS_SWAGGER)
    def session_outputs(self, request):
        return Response(MOCK_SESSION_OUTPUTS)

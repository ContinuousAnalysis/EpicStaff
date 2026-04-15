from django.http import HttpResponse
from drf_yasg.utils import swagger_auto_schema
from rest_framework import status
from rest_framework.decorators import action, parser_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from tables.models import GraphStorageFile, Organization, OrganizationUser, StorageFile
from tables.models.graph_models import Graph
from tables.serializers.storage_serializers import (
    GraphStorageFileSerializer,
    StorageAddToGraphSerializer,
    StorageBulkDeleteSerializer,
    StorageCopySerializer,
    StorageDownloadZipSerializer,
    StorageGraphFilesQuerySerializer,
    StorageMkdirSerializer,
    StorageMoveSerializer,
    StoragePathQuerySerializer,
    StorageRemoveFromGraphSerializer,
    StorageRenameSerializer,
    StorageSessionOutputsQuerySerializer,
    StorageUploadSerializer,
)
from tables.services.storage_service import get_storage_manager
from tables.services.storage_service.dataclasses import FolderInfo
from tables.storage_permissions import StoragePermission
from tables.swagger_schemas.storage_schema import (
    STORAGE_ADD_TO_GRAPH_SWAGGER,
    STORAGE_COPY_SWAGGER,
    STORAGE_DELETE_SWAGGER,
    STORAGE_DOWNLOAD_SWAGGER,
    STORAGE_DOWNLOAD_ZIP_SWAGGER,
    STORAGE_GRAPH_FILES_SWAGGER,
    STORAGE_INFO_SWAGGER,
    STORAGE_LIST_SWAGGER,
    STORAGE_MKDIR_SWAGGER,
    STORAGE_MOVE_SWAGGER,
    STORAGE_REMOVE_FROM_GRAPH_SWAGGER,
    STORAGE_RENAME_SWAGGER,
    STORAGE_SESSION_OUTPUTS_SWAGGER,
    STORAGE_UPLOAD_SWAGGER,
)


class StorageAPIView(ViewSet):
    permission_classes = [StoragePermission]

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.manager = get_storage_manager()

    def _resolve_context(self, request) -> tuple[str, int]:
        """Return hardcoded default user and org, auto-created on first use."""
        org, _ = Organization.objects.get_or_create(name="default")
        OrganizationUser.objects.get_or_create(name="default", organization=org)
        return "default", org.id

    @action(detail=False, methods=["get"], url_path="list")
    @swagger_auto_schema(**STORAGE_LIST_SWAGGER)
    def list_files(self, request):
        user_name, org_id = self._resolve_context(request)
        params = StoragePathQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        prefix = params.validated_data["path"]
        items = self.manager.list_(user_name, org_id, prefix)
        return Response({"path": prefix, "items": [i.to_dict() for i in items]})

    @action(detail=False, methods=["get"], url_path="info")
    @swagger_auto_schema(**STORAGE_INFO_SWAGGER)
    def info(self, request):
        user_name, org_id = self._resolve_context(request)
        params = StoragePathQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        path = params.validated_data["path"]

        try:
            data = self.manager.info(user_name, org_id, path)
        except FileNotFoundError:
            raise ValidationError({"path": f"File does not exist: {path}"})

        response = data.to_dict()
        response["graphs"] = list(
            Graph.objects.filter(
                storage_files__storage_file__path=path,
                storage_files__storage_file__org_id=org_id,
            ).values("id", "name")
        )
        return Response(response)

    @action(detail=False, methods=["get"], url_path="download")
    @swagger_auto_schema(**STORAGE_DOWNLOAD_SWAGGER)
    def download(self, request):
        user_name, org_id = self._resolve_context(request)
        params = StoragePathQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        path = params.validated_data["path"]

        try:
            file_bytes = self.manager.download(user_name, org_id, path)
        except FileNotFoundError:
            raise ValidationError({"path": f"File does not exist: {path}"})

        filename = path.rstrip("/").split("/")[-1] if path else "file"
        response = HttpResponse(file_bytes, content_type="application/octet-stream")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=["post"], url_path="upload")
    @swagger_auto_schema(**STORAGE_UPLOAD_SWAGGER)
    @parser_classes([MultiPartParser])
    def upload(self, request):
        user_name, org_id = self._resolve_context(request)
        serializer = StorageUploadSerializer(
            data={**request.data.dict(), "files": request.FILES.getlist("files")}
        )
        serializer.is_valid(raise_exception=True)
        path = serializer.validated_data["path"]
        files = serializer.validated_data["files"]

        try:
            results = [
                self.manager.upload_file(user_name, org_id, path, f) for f in files
            ]
        except ValueError as e:
            raise ValidationError({"detail": str(e)})

        return Response(
            {"uploaded": [r.to_dict() for r in results]},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="download-zip")
    @swagger_auto_schema(**STORAGE_DOWNLOAD_ZIP_SWAGGER)
    def download_zip(self, request):
        user_name, org_id = self._resolve_context(request)
        serializer = StorageDownloadZipSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        paths = serializer.validated_data["paths"]

        try:
            zip_chunks = self.manager.download_zip(user_name, org_id, paths)
            response = HttpResponse(
                b"".join(zip_chunks), content_type="application/zip"
            )
        except FileNotFoundError as e:
            raise ValidationError({"paths": str(e)})

        response["Content-Disposition"] = 'attachment; filename="download.zip"'
        return response

    @action(detail=False, methods=["post"], url_path="mkdir")
    @swagger_auto_schema(**STORAGE_MKDIR_SWAGGER)
    def mkdir(self, request):
        user_name, org_id = self._resolve_context(request)
        serializer = StorageMkdirSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        path = serializer.validated_data["path"]
        self.manager.mkdir(user_name, org_id, path)
        return Response({"path": path, "created": True}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["delete"], url_path="delete")
    @swagger_auto_schema(**STORAGE_DELETE_SWAGGER)
    def delete_file(self, request):
        user_name, org_id = self._resolve_context(request)
        serializer = StorageBulkDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        for path in serializer.validated_data["paths"]:
            self.manager.delete(user_name, org_id, path)

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="rename")
    @swagger_auto_schema(**STORAGE_RENAME_SWAGGER)
    def rename(self, request):
        user_name, org_id = self._resolve_context(request)
        serializer = StorageRenameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from_path = serializer.validated_data["from"]
        to_path = serializer.validated_data["to"]

        try:
            self.manager.rename(user_name, org_id, from_path, to_path)
        except FileNotFoundError:
            raise ValidationError({"from": f"Source path does not exist: {from_path}"})
        except FileExistsError:
            raise ValidationError({"to": f"Destination already exists: {to_path}"})
        except ValueError as e:
            raise ValidationError({"detail": str(e)})

        return Response({"from": from_path, "to": to_path, "success": True})

    @action(detail=False, methods=["post"], url_path="move")
    @swagger_auto_schema(**STORAGE_MOVE_SWAGGER)
    def move(self, request):
        user_name, org_id = self._resolve_context(request)
        serializer = StorageMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from_path = serializer.validated_data["from"]
        to_path = serializer.validated_data["to"]
        src_org_id = serializer.validated_data.get("source_org_id")
        dst_org_id = serializer.validated_data.get("destination_org_id")

        try:
            if src_org_id and dst_org_id and int(src_org_id) != int(dst_org_id):
                self.manager.move_cross_org(
                    user_name, int(src_org_id), from_path, int(dst_org_id), to_path
                )
            else:
                self.manager.move(user_name, org_id, from_path, to_path)
        except FileNotFoundError:
            raise ValidationError({"from": f"Source path does not exist: {from_path}"})
        except ValueError as e:
            raise ValidationError({"detail": str(e)})

        return Response({"from": from_path, "to": to_path, "success": True})

    @action(detail=False, methods=["post"], url_path="copy")
    @swagger_auto_schema(**STORAGE_COPY_SWAGGER)
    def copy(self, request):
        user_name, org_id = self._resolve_context(request)
        serializer = StorageCopySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from_path = serializer.validated_data["from"]
        to_path = serializer.validated_data["to"]
        src_org_id = serializer.validated_data.get("source_org_id")
        dst_org_id = serializer.validated_data.get("destination_org_id")

        try:
            if src_org_id and dst_org_id and int(src_org_id) != int(dst_org_id):
                self.manager.copy_cross_org(
                    user_name, int(src_org_id), from_path, int(dst_org_id), to_path
                )
            else:
                self.manager.copy(user_name, org_id, from_path, to_path)
        except FileNotFoundError:
            raise ValidationError({"from": f"Source path does not exist: {from_path}"})
        except ValueError as e:
            raise ValidationError({"detail": str(e)})

        return Response({"from": from_path, "to": to_path, "success": True})

    @action(detail=False, methods=["post"], url_path="add-to-graph")
    @swagger_auto_schema(**STORAGE_ADD_TO_GRAPH_SWAGGER)
    def add_to_graph(self, request):
        user_name, org_id = self._resolve_context(request)
        serializer = StorageAddToGraphSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        path = serializer.validated_data["path"]
        graph_ids = serializer.validated_data["graph_ids"]

        try:
            path_info = self.manager.info(user_name, org_id, path)
        except FileNotFoundError:
            raise ValidationError({"path": f"Path does not exist: {path}"})

        if isinstance(path_info, FolderInfo) and not path.endswith("/"):
            path = path + "/"

        results = []
        sf, _ = StorageFile.objects.get_or_create(org_id=org_id, path=path)

        for graph_id in graph_ids:
            obj, _ = GraphStorageFile.objects.get_or_create(
                graph_id=graph_id, storage_file=sf
            )
            results.append(obj)

        return Response(
            GraphStorageFileSerializer(results, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["delete"], url_path="remove-from-graph")
    @swagger_auto_schema(**STORAGE_REMOVE_FROM_GRAPH_SWAGGER)
    def remove_from_graph(self, request):
        _, org_id = self._resolve_context(request)
        serializer = StorageRemoveFromGraphSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        path = serializer.validated_data["path"]
        graph_ids = serializer.validated_data["graph_ids"]
        GraphStorageFile.objects.filter(
            graph_id__in=graph_ids,
            storage_file__path=path,
            storage_file__org_id=org_id,
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="graph-files")
    @swagger_auto_schema(**STORAGE_GRAPH_FILES_SWAGGER)
    def graph_files(self, request):
        params = StorageGraphFilesQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        graph_id = params.validated_data["graph_id"]
        qs = (
            GraphStorageFile.objects.filter(graph_id=graph_id)
            .select_related("storage_file")
            .order_by("added_at")
        )
        return Response(GraphStorageFileSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"], url_path="session-outputs")
    @swagger_auto_schema(**STORAGE_SESSION_OUTPUTS_SWAGGER)
    def session_outputs(self, request):
        user_name, org_id = self._resolve_context(request)
        params = StorageSessionOutputsQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        session_id = params.validated_data["session_id"]
        prefix = f"sessions/{session_id}" if session_id else "sessions/"
        items = self.manager.list_(user_name, org_id, prefix)
        return Response({"items": [i.to_dict() for i in items]})

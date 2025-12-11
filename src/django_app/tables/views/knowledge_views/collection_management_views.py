from rest_framework import viewsets, status
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
from utils.logger import logger
from rest_framework.response import Response
from rest_framework.decorators import action

from tables.models.knowledge_models.collection_models import SourceCollection

from tables.serializers.knowledge_serializers import (
    SourceCollectionListSerializer,
    SourceCollectionDetailSerializer,
    SourceCollectionCreateSerializer,
    SourceCollectionUpdateSerializer,
    CopySourceCollectionSerializer,
)

from tables.services.redis_service import RedisService
from tables.services.knowledge_services.collection_management_service import (
    CollectionManagementService,
)

from tables.exceptions import CollectionNotFoundException

redis_service = RedisService()


class SourceCollectionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for SourceCollection CRUD operations.

    Endpoints:
    - GET /source-collections/ - List all collections
    - GET /source-collections/{id}/ - Retrieve a specific collection
    - POST /source-collections/ - Create a new empty collection
    - POST /source-collections/{id}/copy/ - Copy collection (shares content)
    - PATCH /source-collections/{id}/ - Update collection name
    - PUT /source-collections/{id}/ - Update collection name
    - DELETE /source-collections/{id}/ - Delete collection (cleans unreferenced content)
    """

    http_method_names = ["get", "post", "patch", "put", "delete"]

    def get_queryset(self):
        """Optimize queries based on action."""
        queryset = SourceCollection.objects.all()

        if self.action == "list" or self.action == "retrieve":
            queryset = queryset.prefetch_related("documents")

        return queryset

    def get_serializer_class(self):
        """Return appropriate serializer based on action."""
        if self.action == "list":
            return SourceCollectionListSerializer
        elif self.action == "retrieve":
            return SourceCollectionDetailSerializer
        elif self.action == "create":
            return SourceCollectionCreateSerializer
        elif self.action in ["update", "partial_update"]:
            return SourceCollectionUpdateSerializer
        elif self.action == "copy":
            return CopySourceCollectionSerializer

        return SourceCollectionListSerializer

    def list(self, request, *args, **kwargs):
        """List all source collections for the user."""
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        """Retrieve a specific source collection by ID."""
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """
        Create a new empty source collection.

        Body:
        {
            "collection_name": "My Collection",  # Optional
            "user_id": "user123"  # Optional
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            collection = CollectionManagementService.create_collection(
                collection_name=serializer.validated_data.get("collection_name"),
                user_id=serializer.validated_data.get("user_id"),
                collection_origin=serializer.validated_data.get("collection_origin"),
            )

            output_serializer = SourceCollectionDetailSerializer(collection)
            return Response(output_serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response(
                {"error": f"Failed to create collection: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def update(self, request, *args, **kwargs):
        """Full update (same as partial_update)."""
        return self.partial_update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        """
        Update collection name.

        Body:
        {
            "collection_name": "New Collection Name"
        }
        """
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        try:
            updated_collection = CollectionManagementService.update_collection(
                collection_id=instance.collection_id,
                collection_name=serializer.validated_data["collection_name"],
            )

            output_serializer = SourceCollectionDetailSerializer(updated_collection)
            return Response(output_serializer.data)

        except CollectionNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response(
                {"error": f"Failed to update collection: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def destroy(self, request, *args, **kwargs):
        """
        Delete collection and all its documents.
        Cleans up unreferenced DocumentContent automatically.
        """
        instance = self.get_object()

        try:
            result = CollectionManagementService.delete_collection(
                collection_id=instance.collection_id
            )

            return Response(
                {"message": "Collection deleted successfully", **result},
                status=status.HTTP_200_OK,
            )

        except CollectionNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response(
                {"error": f"Failed to delete collection: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @swagger_auto_schema(
        method="post",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            required=["collection_ids"],
            properties={
                "collection_ids": openapi.Schema(
                    type=openapi.TYPE_ARRAY,
                    items=openapi.Schema(type=openapi.TYPE_INTEGER),
                    description="List of collection IDs to delete",
                    example=[1, 2, 3],
                )
            },
        ),
    )
    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """
        Bulk delete collections with automatic unreferenced content cleanup.

        URL: POST /source-collections/bulk-delete/
        """
        collection_ids = request.data.get("collection_ids", [])

        if not collection_ids:
            return Response(
                {"error": "collection_ids is required and must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(collection_ids, list):
            return Response(
                {"error": "collection_ids must be a list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = CollectionManagementService.bulk_delete_collections(collection_ids)

            return Response(
                {
                    "message": f"Successfully deleted {result['deleted_count']} collection(s)",
                    **result,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {"error": f"Failed to delete collections: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["post"])
    def copy(self, request, pk=None):
        """
        Copy collection without duplicating binary content.
        New metadata records point to same DocumentContent.

        URL: POST /source-collections/{id}/copy/

        Body (optional):
        {
            "new_collection_name": "My Copy"
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            new_collection = CollectionManagementService.copy_collection(
                source_collection_id=int(pk),
                new_collection_name=serializer.validated_data.get(
                    "new_collection_name"
                ),
            )

            output_serializer = SourceCollectionDetailSerializer(new_collection)

            return Response(
                {
                    "message": "Collection copied successfully",
                    "collection": output_serializer.data,
                },
                status=status.HTTP_201_CREATED,
            )

        except CollectionNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response(
                {"error": f"Failed to copy collection: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

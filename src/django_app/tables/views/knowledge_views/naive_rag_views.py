from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema
from django.http import Http404
from rest_framework.exceptions import ValidationError


from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.viewsets import ReadOnlyModelViewSet
from rest_framework.views import APIView

from tables.models.knowledge_models import (
    NaiveRag,
    NaiveRagDocumentConfig,
    NaiveRagChunk,
)
from tables.serializers.naive_rag_serializers import (
    NaiveRagSerializer,
    NaiveRagCreateUpdateSerializer,
    NaiveRagDetailSerializer,
    DocumentConfigSerializer,
    DocumentConfigUpdateSerializer,
    DocumentConfigBulkUpdateSerializer,
    DocumentConfigBulkDeleteSerializer,
    NaiveRagChunkSerializer,
    ProcessNaiveRagDocumentChunkingSerializer,
)
from tables.services.knowledge_services.naive_rag_service import NaiveRagService
from tables.services.redis_service import RedisService
from tables.exceptions import (
    RagException,
    NaiveRagNotFoundException,
    DocumentConfigNotFoundException,
    EmbedderNotFoundException,
    InvalidChunkParametersException,
    DocumentsNotFoundException,
    CollectionNotFoundException,
)


redis_service = RedisService()


class NaiveRagViewSet(viewsets.GenericViewSet):
    """
    ViewSet for NaiveRag operations.

    Endpoints:
    - POST /collections/{collection_id}/naive-rag/ - Create or update NaiveRag
    - GET /collections/{collection_id}/naive-rag/ - Get NaiveRag for collection
    - DELETE /naive-rag/{id}/ - Delete NaiveRag
    - GET /naive-rag/{id}/ - Get NaiveRag details with configs
    """

    queryset = NaiveRag.objects.all()
    serializer_class = NaiveRagSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return NaiveRag.objects.none()
        return super().get_queryset()

    def get_serializer_class(self):
        if self.action in ["create_or_update", "update_naive_rag"]:
            return NaiveRagCreateUpdateSerializer
        elif self.action == "retrieve":
            return NaiveRagDetailSerializer
        return NaiveRagSerializer

    @action(
        detail=False,
        methods=["post"],
        url_path="collections/(?P<collection_id>[^/.]+)/naive-rag",
    )
    def create_or_update(self, request, collection_id=None):
        """
        Create new NaiveRag or update existing one for a collection.
        Creates BaseRagType + NaiveRag in one step.

        URL: POST /naive-rag/collections/{collection_id}/naive-rag/

        Body:
        {
            "embedder_id": 1
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        embedder_id = serializer.validated_data["embedder_id"]

        try:
            naive_rag = NaiveRagService.create_or_update_naive_rag(
                collection_id=int(collection_id), embedder_id=embedder_id
            )

            response_serializer = NaiveRagSerializer(naive_rag)

            return Response(
                {
                    "message": "NaiveRag configured successfully",
                    "naive_rag": response_serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        except CollectionNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except EmbedderNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except RagException as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(
        detail=False,
        methods=["get"],
        url_path="collections/(?P<collection_id>[^/.]+)/naive-rag",
    )
    def get_by_collection(self, request, collection_id=None):
        """
        Get NaiveRag for a collection.

        URL: GET /naive-rag/collections/{collection_id}/naive-rag/
        """
        try:
            naive_rag = NaiveRagService.get_or_none_naive_rag_by_collection(
                int(collection_id)
            )

            if not naive_rag:
                return Response(
                    {"error": f"NaiveRag not found for collection {collection_id}"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            serializer = NaiveRagSerializer(naive_rag)
            return Response(serializer.data)

        except Exception as e:
            return Response(
                {"error": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def retrieve(self, request, pk=None):
        """
        Get detailed NaiveRag info including all document configs.

        Business Logic:
        - Auto-initializes document configs for documents without configs
        - Ensures all documents in the collection have default configs
        - Idempotent: safe to call multiple times

        URL: GET /naive-rag/{id}/
        """
        try:
            naive_rag = NaiveRagService.get_naive_rag(int(pk))

            # Auto-initialize configs for documents without configs
            # This ensures all documents have configs before returning the response
            NaiveRagService.init_document_configs(naive_rag_id=int(pk))

            serializer = NaiveRagDetailSerializer(naive_rag)
            return Response(serializer.data)

        except NaiveRagNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response(
                {"error": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def destroy(self, request, pk=None):
        """
        Delete NaiveRag and all its configurations.

        URL: DELETE /naive-rag/{id}/
        """
        try:
            result = NaiveRagService.delete_naive_rag(int(pk))

            return Response(
                {"message": "NaiveRag deleted successfully", **result},
                status=status.HTTP_200_OK,
            )

        except NaiveRagNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response(
                {"error": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class NaiveRagDocumentConfigViewSet(
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    ViewSet for NaiveRag document configuration operations.

    All operations are scoped to a specific NaiveRag instance.
    Configs are validated to belong to the specified naive_rag_id.

    Endpoints:
    - GET /api/naive-rag/{naive_rag_id}/document-configs/ - List all configs
    - GET /api/naive-rag/{naive_rag_id}/document-configs/{pk}/ - Get single config
    - PUT /api/naive-rag/{naive_rag_id}/document-configs/{pk}/ - Update single config
    - DELETE /api/naive-rag/{naive_rag_id}/document-configs/{pk}/ - Delete single config
    - PUT /api/naive-rag/{naive_rag_id}/document-configs/bulk-update/ - Bulk update configs
    - POST /api/naive-rag/{naive_rag_id}/document-configs/bulk-delete/ - Bulk delete configs
    """

    queryset = NaiveRagDocumentConfig.objects.select_related("document")

    def get_serializer_class(self):
        if self.action == "bulk_update":
            return DocumentConfigBulkUpdateSerializer
        elif self.action == "bulk_delete":
            return DocumentConfigBulkDeleteSerializer
        elif self.action == "update":
            return DocumentConfigUpdateSerializer
        return DocumentConfigSerializer

    def get_queryset(self):
        """
        Filter queryset by naive_rag_id from URL.
        This ensures all operations are scoped to the specific NaiveRag.
        """
        queryset = super().get_queryset()
        naive_rag_id = self.kwargs.get("naive_rag_id")

        if naive_rag_id is not None:
            # Filter configs that belong to this naive_rag
            queryset = queryset.filter(naive_rag_id=naive_rag_id)

        return queryset

    def initial(self, request, *args, **kwargs):
        """
        Validate naive_rag_id before processing request.
        """
        super().initial(request, *args, **kwargs)

        naive_rag_id = self.kwargs.get("naive_rag_id")

        if naive_rag_id is not None:
            try:
                self.kwargs["naive_rag_id"] = int(naive_rag_id)
            except (ValueError, TypeError):
                raise ValidationError(
                    {
                        "naive_rag_id": f"Invalid value '{naive_rag_id}'. Must be an integer."
                    }
                )


    @action(detail=False, methods=["put"], url_path="bulk-update")
    def bulk_update(self, request, naive_rag_id=None):
        """
        Bulk update multiple document configs.
        Apply same parameters to selected configs by their config IDs.

        URL: PUT /api/naive-rag/{naive_rag_id}/document-configs/bulk-update/

        Body:
        {
            "config_ids": [1, 2, 3],  // Required: naive_rag_document_config IDs
            "chunk_size": 1500,       // Optional
            "chunk_overlap": 200,     // Optional
            "chunk_strategy": "character",  // Optional
            "additional_params": {}   // Optional
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        config_ids = serializer.validated_data.pop("config_ids")

        try:
            configs = NaiveRagService.bulk_update_document_configs(
                naive_rag_id=int(naive_rag_id),
                config_ids=config_ids,
                **serializer.validated_data,
            )

            response_serializer = DocumentConfigSerializer(configs, many=True)

            return Response(
                {
                    "message": f"Successfully updated {len(configs)} config(s)",
                    "updated_count": len(configs),
                    "configs": response_serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        except DocumentConfigNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except InvalidChunkParametersException as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except RagException as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request, naive_rag_id=None):
        """
        Bulk delete multiple document configs by their config IDs.

        URL: POST /api/naive-rag/{naive_rag_id}/document-configs/bulk-delete/

        Body:
        {
            "config_ids": [1, 2, 3]  // Required: naive_rag_document_config IDs
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        config_ids = serializer.validated_data["config_ids"]

        try:
            result = NaiveRagService.bulk_delete_document_configs(
                naive_rag_id=int(naive_rag_id), config_ids=config_ids
            )

            return Response(
                {
                    "message": f"Successfully deleted {result['deleted_count']} config(s)",
                    **result,
                },
                status=status.HTTP_200_OK,
            )

        except DocumentConfigNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except InvalidChunkParametersException as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except RagException as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["get"])
    def list_configs(self, request, naive_rag_id=None):
        """
        List all document configs for a NaiveRag.

        URL: GET /api/naive-rag/{naive_rag_id}/document-configs/
        """
        try:
            configs = NaiveRagService.get_document_configs_for_naive_rag(
                int(naive_rag_id)
            )

            serializer = DocumentConfigSerializer(configs, many=True)

            return Response(
                {
                    "naive_rag_id": int(naive_rag_id),
                    "total_configs": len(configs),
                    "configs": serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        except NaiveRagNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response(
                {"error": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def retrieve(self, request, pk=None, naive_rag_id=None):
        """
        Get single document config.

        URL: GET /api/naive-rag/{naive_rag_id}/document-configs/{pk}/
        """
        try:
            config = self.get_object()
            serializer = DocumentConfigSerializer(config)
            return Response(serializer.data)

        except Http404:
            return Response(
                {
                    "error": f"Document config [{pk}] for naive_rag_id [{naive_rag_id}] not found"
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            return Response(
                {"error": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def update(self, request, pk=None, naive_rag_id=None):
        """
        Update single document config.

        URL: PUT /api/naive-rag/{naive_rag_id}/document-configs/{pk}/

        Body (all fields optional):
        {
            "chunk_size": 1500,
            "chunk_overlap": 200,
            "chunk_strategy": "character",
            "additional_params": {}
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            config = NaiveRagService.update_document_config(
                config_id=int(pk),
                naive_rag_id=naive_rag_id,
                **serializer.validated_data,
            )

            response_serializer = DocumentConfigSerializer(config)

            return Response(
                {
                    "message": "Document config updated successfully",
                    "config": response_serializer.data,
                },
                status=status.HTTP_200_OK,
            )

        except DocumentConfigNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except InvalidChunkParametersException as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except RagException as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def destroy(self, request, pk=None, naive_rag_id=None):
        """
        Delete a single document config.

        URL: DELETE /api/naive-rag/{naive_rag_id}/document-configs/{pk}/
        """
        try:
            result = NaiveRagService.delete_document_config(
                config_id=int(pk), naive_rag_id=int(naive_rag_id)
            )

            return Response(
                {
                    "message": f"Document config deleted successfully",
                    **result,
                },
                status=status.HTTP_200_OK,
            )

        except DocumentConfigNotFoundException as e:
            return Response({"error": str(e)}, status=status.HTTP_404_NOT_FOUND)
        except RagException as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {"error": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class NaiveRagChunkViewSet(ReadOnlyModelViewSet):
    queryset = NaiveRagChunk.objects.all()
    serializer_class = NaiveRagChunkSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["naive_rag_document_config"]


class ProcessNaiveRagDocumentChunkingView(APIView):
    @swagger_auto_schema(request_body=ProcessNaiveRagDocumentChunkingSerializer)
    def post(self, request):
        serializer = ProcessNaiveRagDocumentChunkingSerializer(data=request.data)
        if serializer.is_valid():
            naive_rag_document_id = serializer["naive_rag_document_id"].value

            if not NaiveRagDocumentConfig.objects.filter(
                naive_rag_document_id=naive_rag_document_id
            ).exists():
                return Response(status=status.HTTP_404_NOT_FOUND)

            redis_service.publish_process_document_chunking(
                naive_rag_document_id=naive_rag_document_id
            )
            return Response(status=status.HTTP_202_ACCEPTED)

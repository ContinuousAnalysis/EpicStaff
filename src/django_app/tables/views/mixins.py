from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response


class CopyActionMixin:
    """Mixin that adds a ``copy`` action to a ViewSet.

    Requires two class attributes:
        copy_service_class: Copy service to instantiate.
        copy_serializer_class: Serializer for the response.
    """

    copy_service_class = None
    copy_serializer_class = None

    @action(detail=True, methods=["post"], url_path="copy")
    def copy(self, request, pk: int):
        instance = self.get_object()
        name = request.data.get("name") if isinstance(request.data, dict) else None
        try:
            with transaction.atomic():
                new_instance = self.copy_service_class().copy(instance, name=name)
        except Exception as e:
            return Response({"message": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            self.copy_serializer_class(new_instance).data,
            status=status.HTTP_201_CREATED,
        )

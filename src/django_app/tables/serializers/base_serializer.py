from rest_framework import serializers


class TimestampMixin(serializers.Serializer):
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        common_fields = ["created_at", "updated_at"]


class ContentHashMixin(serializers.Serializer):
    content_hash = serializers.CharField(required=False, allow_null=True)

    class Meta:
        common_fields = ["content_hash"]


class ContentHashWritableMixin:
    """Makes content_hash writable in ModelSerializer subclasses.

    ModelSerializer marks content_hash read_only because editable=False on the model.
    This mixin overrides that so Swagger shows the field as an optional input,
    allowing clients to pass it for optimistic-locking (ContentHashPreconditionMixin).
    """

    def get_extra_kwargs(self):
        kwargs = super().get_extra_kwargs()
        kwargs.setdefault("content_hash", {}).update(
            {"read_only": False, "required": False}
        )
        return kwargs


class MetadataMixin(serializers.Serializer):
    metadata = serializers.JSONField()

    class Meta:
        common_fields = ["metadata"]


class BaseGraphEntityMixin(TimestampMixin, ContentHashMixin, MetadataMixin):
    class Meta:
        common_fields = (
            TimestampMixin.Meta.common_fields
            + ContentHashMixin.Meta.common_fields
            + MetadataMixin.Meta.common_fields
        )

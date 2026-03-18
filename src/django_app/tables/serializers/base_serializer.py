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
    """Adds content_hash as an optional writable field.

    content_hash is a computed property on the model (not a DB column), so
    ModelSerializer won't include it automatically. get_fields() injects it
    so Swagger shows it and clients can pass it. validate() removes it from
    validated_data — the view-level ContentHashPreconditionMixin is
    responsible for setting instance._expected_hash before save().
    """

    def get_fields(self):
        fields = super().get_fields()
        fields["content_hash"] = serializers.CharField(required=False, allow_null=True)
        return fields

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs.pop("content_hash", None)
        return attrs


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

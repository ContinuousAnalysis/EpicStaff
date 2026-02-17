from rest_framework import serializers

class BaseMetadataSerializer(serializers.ModelSerializer):

    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    content_hash = serializers.CharField(read_only=True)

    class Meta:
        common_fields = [
            "created_at",
            "updated_at",
            "content_hash",
            # "metadata"  # Если нужно выводить весь json целиком
        ]
        abstract = True
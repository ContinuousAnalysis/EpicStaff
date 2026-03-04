import os
import re

from rest_framework import serializers

from tables.models.matrix_bot_models import MatrixBot


class MatrixBotSerializer(serializers.ModelSerializer):
    class Meta:
        model = MatrixBot
        fields = [
            "id",
            "flow",
            "matrix_user_id",
            "input_variable",
            "output_variable",
            "enabled",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "matrix_user_id"]

    def create(self, validated_data):
        flow = validated_data["flow"]
        slug = re.sub(r"[^a-z0-9]+", "_", flow.name.lower()).strip("_")
        domain = os.getenv("DOMAIN_NAME", "localhost")
        validated_data["matrix_user_id"] = (
            f"@_epicstaff_flow_{slug}_{flow.pk}:{domain}"
        )
        return super().create(validated_data)

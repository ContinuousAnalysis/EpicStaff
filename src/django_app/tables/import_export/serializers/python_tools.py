from rest_framework import serializers

from tables.models import PythonCode, PythonCodeTool


class PythonCodeSerializer(serializers.ModelSerializer):

    libraries = serializers.CharField(allow_blank=True)

    class Meta:
        model = PythonCode
        exclude = ["id"]


class PythonCodeToolSerializer(serializers.ModelSerializer):

    python_code = PythonCodeSerializer(required=False)
    python_code_id = serializers.PrimaryKeyRelatedField(
        queryset=PythonCode.objects.all(),
        source="python_code",
        write_only=True,
    )

    class Meta:
        model = PythonCodeTool
        exclude = ["favorite"]

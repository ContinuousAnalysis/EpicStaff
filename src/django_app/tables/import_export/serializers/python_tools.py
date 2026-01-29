from rest_framework import serializers

from tables.models import PythonCode, PythonCodeTool


class PythonCodeSerializer(serializers.ModelSerializer):

    libraries = serializers.CharField(allow_blank=True)

    class Meta:
        model = PythonCode
        fields = "__all__"


class PythonCodeToolSerializer(serializers.ModelSerializer):

    python_code = serializers.PrimaryKeyRelatedField(
        queryset=PythonCode.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = PythonCodeTool
        exclude = ["favorite"]

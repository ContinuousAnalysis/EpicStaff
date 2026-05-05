from rest_framework import serializers

from django_app.tables.models.vector_models import MemoryDatabase


class MemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MemoryDatabase
        fields = ["id", "payload"]

from rest_framework import serializers

from django_app.tables.models.provider import Provider


class ProviderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Provider
        fields = "__all__"

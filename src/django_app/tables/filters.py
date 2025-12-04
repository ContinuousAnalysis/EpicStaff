from django_filters import rest_framework as filters
from tables.models.session_models import Session
from tables.models import SourceCollection, Provider

class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class SessionFilter(filters.FilterSet):
    status = CharInFilter(field_name="status", lookup_expr="in")

    class Meta:
        model = Session
        fields = ["graph_id", "status"]
        

class CollectionFilter(filters.FilterSet):
    collection_id = filters.CharFilter(field_name="collection_id", lookup_expr="exact")

    class Meta:
        model = SourceCollection
        fields = ["collection_id"]

class ProviderFilter(filters.FilterSet):
    model_type = filters.CharFilter(method='filter_by_model_type')

    class Meta:
        model = Provider
        fields = ['name', 'model_type']

    def filter_by_model_type(self, queryset, name, value):
        mapping = {
            "llm": "llmmodel",
            "embedding": "embeddingmodel",
            "realtime": "realtimemodel",
            "transcription": "realtimetranscriptionmodel",
        }

        relation = mapping.get(value)
        if relation:
            return queryset.filter(**{f"{relation}__isnull": False}).distinct()
        
        return queryset
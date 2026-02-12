from django.db.models import OuterRef, Exists
from django_filters import rest_framework as filters
from tables.models import GraphSessionMessage
from tables.models.session_models import Session
from tables.models import Provider  # SourceCollection,


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class SessionFilter(filters.FilterSet):
    status = CharInFilter(field_name="status", lookup_expr="in")
    node_name = filters.CharFilter(
        field_name="graphsessionmessage__name", lookup_expr="exact"
    )
    is_error_cause = filters.BooleanFilter(method="filter_by_error_cause")

    class Meta:
        model = Session
        fields = ["graph_id", "status", "node_name"]

    def filter_by_error_cause(self, queryset, name, value):
        """Returns sessions that finished with error on specific node"""
        if not value:
            return queryset

        node_name = self.data.get("node_name")

        messages = GraphSessionMessage.objects.filter(
            session=OuterRef("pk"), message_data__message_type="error"
        )
        if node_name:
            messages = messages.filter(name=node_name)

        return queryset.filter(Exists(messages)).distinct()


# class CollectionFilter(filters.FilterSet):
#     collection_id = filters.CharFilter(field_name="collection_id", lookup_expr="exact")

#     class Meta:
#         model = SourceCollection
#         fields = ["collection_id"]


class ProviderFilter(filters.FilterSet):
    model_type = filters.CharFilter(method="filter_by_model_type")

    class Meta:
        model = Provider
        fields = ["name", "model_type"]

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

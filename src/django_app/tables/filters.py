from django_filters import rest_framework as filters
from tables.models.session_models import Session
from tables.models import SourceCollection

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

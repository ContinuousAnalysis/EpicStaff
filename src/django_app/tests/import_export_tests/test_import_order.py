import pytest

from tables.import_export.services.import_service import ImportService
from tables.import_export.registry import entity_registry
from tables.import_export.enums import EntityType, NodeType


@pytest.mark.django_db
class TestResolveImportOrder:
    def setup_method(self):
        self.service = ImportService(entity_registry)

    def test_filters_to_present_keys(self):
        data = {
            EntityType.AGENT: [{"id": 1}],
            EntityType.LLM_CONFIG: [{"id": 2}],
        }
        order = self.service._resolve_import_order(data)
        assert set(order) == {EntityType.AGENT, EntityType.LLM_CONFIG}

    def test_preserves_dependency_ordering(self):
        data = {
            EntityType.AGENT: [{"id": 1}],
            EntityType.LLM_CONFIG: [{"id": 2}],
            EntityType.PYTHON_CODE_TOOL: [{"id": 3}],
        }
        order = self.service._resolve_import_order(data)
        assert order.index(EntityType.LLM_CONFIG) < order.index(EntityType.AGENT)
        assert order.index(EntityType.PYTHON_CODE_TOOL) < order.index(EntityType.AGENT)

    def test_empty_data(self):
        order = self.service._resolve_import_order({})
        assert order == []

    def test_ignores_unknown_keys(self):
        data = {
            "UnknownEntity": [{"id": 1}],
            EntityType.AGENT: [{"id": 2}],
        }
        order = self.service._resolve_import_order(data)
        assert order == [EntityType.AGENT]


@pytest.mark.django_db
class TestResolveGraphOrder:
    def setup_method(self):
        self.service = ImportService(entity_registry)

    def test_no_subgraphs(self):
        graphs = [
            {"id": 1, "nodes": []},
            {"id": 2, "nodes": []},
        ]
        result = self.service._resolve_graph_order(graphs)
        assert [g["id"] for g in result] == [1, 2]

    def test_subgraph_dependency(self):
        graphs = [
            {
                "id": 2,
                "nodes": [{"node_type": NodeType.SUBGRAPH_NODE, "subgraph": 1}],
            },
            {"id": 1, "nodes": []},
        ]
        result = self.service._resolve_graph_order(graphs)
        ids = [g["id"] for g in result]
        assert ids.index(1) < ids.index(2)

    def test_circular_dependency_raises(self):
        graphs = [
            {
                "id": 1,
                "nodes": [{"node_type": NodeType.SUBGRAPH_NODE, "subgraph": 2}],
            },
            {
                "id": 2,
                "nodes": [{"node_type": NodeType.SUBGRAPH_NODE, "subgraph": 1}],
            },
        ]
        with pytest.raises(ValueError, match="Circular"):
            self.service._resolve_graph_order(graphs)

    def test_diamond_dependency(self):
        """A depends on B and C, both depend on D."""
        graphs = [
            {
                "id": 1,
                "nodes": [
                    {"node_type": NodeType.SUBGRAPH_NODE, "subgraph": 2},
                    {"node_type": NodeType.SUBGRAPH_NODE, "subgraph": 3},
                ],
            },
            {
                "id": 2,
                "nodes": [{"node_type": NodeType.SUBGRAPH_NODE, "subgraph": 4}],
            },
            {
                "id": 3,
                "nodes": [{"node_type": NodeType.SUBGRAPH_NODE, "subgraph": 4}],
            },
            {"id": 4, "nodes": []},
        ]
        result = self.service._resolve_graph_order(graphs)
        ids = [g["id"] for g in result]
        assert ids.index(4) < ids.index(2)
        assert ids.index(4) < ids.index(3)
        assert ids.index(2) < ids.index(1)
        assert ids.index(3) < ids.index(1)

    def test_external_subgraph_reference_ignored(self):
        """Subgraph ID not in the export payload — should not affect ordering."""
        graphs = [
            {
                "id": 1,
                "nodes": [{"node_type": NodeType.SUBGRAPH_NODE, "subgraph": 999}],
            },
        ]
        result = self.service._resolve_graph_order(graphs)
        assert [g["id"] for g in result] == [1]

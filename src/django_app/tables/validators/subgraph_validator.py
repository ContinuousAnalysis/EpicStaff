from tables.exceptions import SubGraphValidationError
from tables.models import Graph, SubGraphNode


class SubGraphValidator:
    """
    Validates that no Graph instances are involved in recursive (cyclic) subgraph relationships.
    """

    def validate(self, graph: Graph):
        """
        Checks graph for cyclic references via SubGraphNode relations.
        Raises SubGraphValidationError if any recursion is detected.
        """
        if self._has_cycle(graph):
            raise SubGraphValidationError(
                f"Recursive reference detected in Flow {graph.name})"
            )

    def _has_cycle(self, root_graph):
        """
        Detects cycles using DFS.
        Returns True if a cycle leads back to the root_graph.
        """
        visited = set()
        stack = [root_graph.id]

        while stack:
            graph_id = stack.pop()
            if graph_id in visited:
                continue
            visited.add(graph_id)

            subgraphs = SubGraphNode.objects.filter(graph_id=graph_id).values_list(
                "subgraph_id", flat=True
            )

            for sub_id in subgraphs:
                if sub_id == root_graph.id:
                    return True
                stack.append(sub_id)
        return False

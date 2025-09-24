from .base_node import *
from models.state import *
from utils.map_variables import map_variables_to_input


class EndNode(BaseNode):
    TYPE = "END"

    def __init__(
        self,
        session_graph_builder_instance,  # SessionGraphBuilder
        session_id: int,
        output_map: dict,
    ):
        super().__init__(
            session_id=session_id,
            node_name="__end_node__",
        )
        self.output_map = output_map
        self.session_graph_builder_instance = session_graph_builder_instance

    async def execute(self, state: State, writer: StreamWriter, **kwargs):

        result = map_variables_to_input(
            variables=state.get("variables"),
            map=self.output_map,
            set_missing_variables=True,
        )

        # set result as a end_node_result attribute of SessionGraphBuilder instance
        self.session_graph_builder_instance.end_node_result = result

        graph_message = GraphMessage(
            session_id=self.session_id,
            name=self.node_name,
            execution_order=0,
            message_data=result,
        )
        writer(graph_message)

        return result

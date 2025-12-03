from tables.services.session_manager_service import SessionManagerService
from tables.models.graph_models import WebhookTriggerNode, GraphOrganization
from utils.singleton_meta import SingletonMeta


class WebhookTriggerService(metaclass=SingletonMeta):
    def __init__(self, session_manager_service: SessionManagerService):
        self.session_manager_service = session_manager_service

    def handle_webhook_trigger(self, path: str, payload: dict) -> None:
        webhook_trigger_node_list = WebhookTriggerNode.objects.filter(
            webhook_trigger__path=path
        )

        for webhook_trigger_node in webhook_trigger_node_list:
            graph_organization = GraphOrganization.objects.filter(
                graph=webhook_trigger_node.graph
            ).first()
            variables: dict = {"trigger_payload": payload}
            if graph_organization:
                variables.update(graph_organization.persistent_variables)
            self.session_manager_service.run_session(
                graph_id=webhook_trigger_node.graph.pk,
                variables=variables,
                entrypoint=webhook_trigger_node.node_name,
            )

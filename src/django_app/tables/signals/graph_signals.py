from django.db.models.signals import post_save
from django.dispatch import receiver
from loguru import logger
from tables.models import StartNode, GraphOrganization, GraphOrganizationUser


@receiver(post_save, sender=StartNode)
def update_organization_objects(sender, instance, created, **kwargs):
    """
    Updates persistent_variables for organizations and users if they were removed from domain.
    """
    if created:
        return

    graph = instance.graph
    current_variables = instance.variables

    graph_organization = GraphOrganization.objects.filter(graph=graph).first()
    graph_organization_user = GraphOrganizationUser.objects.filter(graph=graph).first()

    if graph_organization:
        updated_vars = {
            key: value
            for key, value in graph_organization.persistent_variables.items()
            if key in current_variables
        }
        if updated_vars != graph_organization.persistent_variables:
            graph_organization.persistent_variables = updated_vars
            graph_organization.save(update_fields=["persistent_variables"])
            logger.info(
                f"Some persistent variables for organization {graph_organization.organization.name} were removed because initial domain was changed."
            )

    if graph_organization_user:
        updated_vars = {
            key: value
            for key, value in graph_organization_user.persistent_variables.items()
            if key in current_variables
        }
        if updated_vars != graph_organization_user.persistent_variables:
            graph_organization_user.persistent_variables = updated_vars
            graph_organization_user.save(update_fields=["persistent_variables"])
            logger.info(
                f"Some persistent variables for user {graph_organization_user.user.name} were removed because initial domain was changed."
            )

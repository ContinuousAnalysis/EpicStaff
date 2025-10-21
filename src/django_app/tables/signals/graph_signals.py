from django.db.models.signals import post_save
from django.dispatch import receiver
from loguru import logger
from tables.models import StartNode, GraphOrganization, GraphOrganizationUser


def prune_variables(
    instance,
    field_name,
    display_name,
    object_type="organization",
    current_variables=None,
):
    """
    Keep only keys in current_variables for a given JSON field on the instance.
    Save and log if anything was removed.
    """
    if not current_variables:
        return

    original_vars = getattr(instance, field_name, {})
    updated_vars = {k: v for k, v in original_vars.items() if k in current_variables}

    if updated_vars != original_vars:
        setattr(instance, field_name, updated_vars)
        instance.save(update_fields=[field_name])
        logger.info(
            f"Some persistent {object_type} variables for {display_name} were removed "
            "because initial domain was changed."
        )


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
    graph_organization_users = GraphOrganizationUser.objects.filter(graph=graph).all()

    if graph_organization:
        prune_variables(
            graph_organization,
            "persistent_variables",
            graph_organization.organization.name,
            "organization",
            current_variables,
        )
        prune_variables(
            graph_organization,
            "user_variables",
            graph_organization.organization.name,
            "user",
            current_variables,
        )

    for graph_user in graph_organization_users:
        prune_variables(
            graph_user,
            "persistent_variables",
            graph_user.user.name,
            "user",
            current_variables,
        )

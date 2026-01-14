from django.db.models.signals import post_delete
from django.dispatch import receiver
from tables.models import (
    GraphOrganization,
    GraphOrganizationUser,
    OrganizationUser,
)


@receiver(post_delete, sender=GraphOrganization)
def delete_related_graph_organization_users(sender, instance, **kwargs):
    """
    Delete all GraphOrganizationUser records with the same organization
    when a GraphOrganization is deleted.
    """
    org_users = OrganizationUser.objects.filter(organization=instance.organization)

    GraphOrganizationUser.objects.filter(
        graph=instance.graph, user__in=org_users
    ).delete()

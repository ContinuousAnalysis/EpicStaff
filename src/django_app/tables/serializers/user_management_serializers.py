from rest_framework import serializers

from tables.models.rbac_models import OrganizationUser, User


class OrganizationNestedSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)


class RoleNestedSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)


class MembershipNestedSerializer(serializers.Serializer):
    """Nested under UserResponseSerializer (cross-org list)."""

    id = serializers.IntegerField(read_only=True)
    organization = OrganizationNestedSerializer(source="org", read_only=True)
    role = RoleNestedSerializer(read_only=True)
    joined_at = serializers.DateTimeField(read_only=True)


class UserResponseSerializer(serializers.ModelSerializer):
    """Cross-org user payload. Used by /api/admin/users/* endpoints."""

    memberships = MembershipNestedSerializer(
        source="organization_memberships", many=True, read_only=True
    )

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "display_name",
            "is_superadmin",
            "is_active",
            "created_at",
            "updated_at",
            "memberships",
        ]
        read_only_fields = fields


class _OrgMemberMembershipSerializer(serializers.Serializer):
    """Flat membership block embedded in OrgMemberResponseSerializer."""

    id = serializers.IntegerField(read_only=True)
    role = RoleNestedSerializer(read_only=True)
    joined_at = serializers.DateTimeField(read_only=True)


class OrgMemberResponseSerializer(serializers.Serializer):
    """Per-org membership payload. Used by
    /api/admin/organizations/{org_id}/users/* endpoints. Source is an
    OrganizationUser instance; we pull the user fields off `.user` and
    flatten the membership block."""

    id = serializers.IntegerField(source="user.id", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    display_name = serializers.CharField(source="user.display_name", read_only=True)
    is_superadmin = serializers.BooleanField(
        source="user.is_superadmin", read_only=True
    )
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    membership = serializers.SerializerMethodField()

    def get_membership(self, instance: OrganizationUser):
        return _OrgMemberMembershipSerializer(instance).data


# ---- request serializers (schema-only; real validation in
#      UserValidationService) ----


class UserCreateRequestSerializer(serializers.Serializer):
    """`POST /api/admin/users/` — schema for drf-spectacular."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    organization_id = serializers.IntegerField(required=False)
    role_id = serializers.IntegerField(required=False)


class MembershipCreateRequestSerializer(serializers.Serializer):
    """`POST /api/admin/organizations/{org_id}/users/` — dual-mode."""

    user_id = serializers.IntegerField(required=False)
    email = serializers.EmailField(required=False)
    password = serializers.CharField(required=False, write_only=True)
    role_id = serializers.IntegerField(required=False)


class MembershipUpdateRequestSerializer(serializers.Serializer):
    """`PATCH /api/admin/organizations/{org_id}/users/{user_id}/`."""

    role_id = serializers.IntegerField()

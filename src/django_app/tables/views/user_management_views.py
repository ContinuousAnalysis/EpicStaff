from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from tables.serializers.user_management_serializers import (
    MembershipCreateRequestSerializer,
    MembershipUpdateRequestSerializer,
    OrgMemberResponseSerializer,
    UserCreateRequestSerializer,
    UserResponseSerializer,
)
from tables.services.rbac.authentication import JwtOrApiKeyAuthentication
from tables.services.rbac.permissions import IsSuperadmin, IsSuperadminOrOrgAdmin
from tables.services.rbac.user_management_service import UserManagementService
from tables.services.rbac.user_validation_service import UserValidationService


class UserPagination(PageNumberPagination):
    """Cross-org user list pagination."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class UserAdminViewSet(viewsets.ViewSet):
    """Superadmin-only management of Users.

    GET (list paginated), POST (create with optional initial org+role),
    POST {id}/grant-superadmin/, POST {id}/revoke-superadmin/.

    Domain errors raised by the service surface through the project's
    custom_exception_handler envelope; the view layer does not catch
    or translate them.
    """

    authentication_classes = [JwtOrApiKeyAuthentication]
    permission_classes = [IsAuthenticated, IsSuperadmin]
    pagination_class = UserPagination
    lookup_value_regex = "[0-9]+"

    _service = UserManagementService()
    _validator = UserValidationService()

    @extend_schema(
        summary="List users (superadmin)",
        responses={200: UserResponseSerializer(many=True)},
    )
    def list(self, request):
        cleaned = self._validator.validate_list_users_query(request.query_params)
        qs = self._service.list_users(
            actor=request.user,
            email=cleaned["email"],
            is_superadmin=cleaned["is_superadmin"],
            organization_id=cleaned["organization_id"],
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = UserResponseSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @extend_schema(
        summary="Create a user (superadmin)",
        request=UserCreateRequestSerializer,
        responses={
            201: UserResponseSerializer,
            400: OpenApiResponse(description="Validation error or duplicate email"),
            404: OpenApiResponse(description="Organization or role not found"),
        },
    )
    def create(self, request):
        cleaned = self._validator.validate_create_user(request.data)
        user = self._service.create_user(
            actor=request.user,
            email=cleaned["email"],
            password=cleaned["password"],
            organization_id=cleaned["organization_id"],
            role_id=cleaned["role_id"],
        )
        # Re-fetch via the read queryset so memberships[] is prefetched.
        user = self._service.list_users(actor=request.user).get(pk=user.pk)
        return Response(
            UserResponseSerializer(user).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"], url_path="grant-superadmin")
    @extend_schema(
        summary="Grant superadmin (superadmin)",
        responses={
            200: UserResponseSerializer,
            404: OpenApiResponse(description="User not found"),
        },
    )
    def grant_superadmin(self, request, pk=None):
        user = self._service.grant_superadmin(
            actor=request.user, target_user_id=int(pk)
        )
        user = self._service.list_users(actor=request.user).get(pk=user.pk)
        return Response(UserResponseSerializer(user).data)

    @action(detail=True, methods=["post"], url_path="revoke-superadmin")
    @extend_schema(
        summary="Revoke superadmin (superadmin)",
        responses={
            200: UserResponseSerializer,
            400: OpenApiResponse(description="Cannot revoke last superadmin"),
            404: OpenApiResponse(description="User not found"),
        },
    )
    def revoke_superadmin(self, request, pk=None):
        user = self._service.revoke_superadmin(
            actor=request.user, target_user_id=int(pk)
        )
        user = self._service.list_users(actor=request.user).get(pk=user.pk)
        return Response(UserResponseSerializer(user).data)


class OrganizationMembershipAdminViewSet(viewsets.ViewSet):
    """Per-org membership management. Nested under
    /api/admin/organizations/{org_id}/users/...

    Allowed for superadmin globally OR Org Admin of the org_id in the URL.
    """

    authentication_classes = [JwtOrApiKeyAuthentication]
    permission_classes = [IsAuthenticated, IsSuperadminOrOrgAdmin]

    _service = UserManagementService()
    _validator = UserValidationService()

    # GET /api/admin/organizations/{org_id}/users/
    @extend_schema(
        summary="List members of an organization",
        responses={200: OrgMemberResponseSerializer(many=True)},
    )
    def list(self, request, org_id=None):
        cleaned = self._validator.validate_list_org_members_query(request.query_params)
        qs = self._service.list_org_members(
            actor=request.user,
            org_id=int(org_id),
            email=cleaned["email"],
            role_name=cleaned["role_name"],
        )
        return Response(OrgMemberResponseSerializer(qs, many=True).data)

    # POST /api/admin/organizations/{org_id}/users/
    @extend_schema(
        summary="Add user to organization (link existing or create + link)",
        request=MembershipCreateRequestSerializer,
        responses={
            201: OrgMemberResponseSerializer,
            400: OpenApiResponse(
                description="Validation error, duplicate email, or duplicate (user, org)"
            ),
            404: OpenApiResponse(description="Organization, role, or user not found"),
        },
    )
    def create(self, request, org_id=None):
        cleaned = self._validator.validate_add_membership(request.data)
        membership = self._service.add_membership(
            actor=request.user,
            org_id=int(org_id),
            role_id=cleaned["role_id"],
            user_id=cleaned["user_id"],
            email=cleaned["email"],
            password=cleaned["password"],
        )
        return Response(
            OrgMemberResponseSerializer(membership).data,
            status=status.HTTP_201_CREATED,
        )

    # PATCH /api/admin/organizations/{org_id}/users/{user_id}/
    @extend_schema(
        summary="Change a user's role in an organization",
        request=MembershipUpdateRequestSerializer,
        responses={
            200: OrgMemberResponseSerializer,
            400: OpenApiResponse(
                description="Validation error or last Org Admin demotion"
            ),
            404: OpenApiResponse(description="Membership or role not found"),
        },
    )
    def partial_update(self, request, org_id=None, user_id=None):
        cleaned = self._validator.validate_change_role(request.data)
        membership = self._service.change_role(
            actor=request.user,
            org_id=int(org_id),
            user_id=int(user_id),
            role_id=cleaned["role_id"],
        )
        return Response(OrgMemberResponseSerializer(membership).data)

    # DELETE /api/admin/organizations/{org_id}/users/{user_id}/
    @extend_schema(
        summary="Remove user from organization",
        responses={
            204: OpenApiResponse(description="Removed"),
            400: OpenApiResponse(description="Cannot remove last Org Admin"),
            404: OpenApiResponse(description="Membership not found"),
        },
    )
    def destroy(self, request, org_id=None, user_id=None):
        self._service.remove_membership(
            actor=request.user, org_id=int(org_id), user_id=int(user_id)
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from tables.services.rbac.authentication import JwtOrApiKeyAuthentication
from tables.models.rbac_models import ApiKey
from tables.serializers.rbac_serializers import (
    LoginSerializer,
    LogoutRequestSerializer,
    TokenIntrospectRequestSerializer,
)
from tables.services.rbac.auth_service import AuthService, TokenPair
from tables.services.rbac.auth_validation_service import AuthValidationService
from tables.services.rbac.first_setup_service import FirstSetupService
from tables.services.rbac.rbac_exceptions import InvalidRefreshTokenError
from tables.services.rbac.reset_user_service import ResetUserService
from tables.services.rbac.sse_ticket_service import SseTicketService
from tables.swagger_schemas.auth_schema import (
    API_KEY_VALIDATE_GET,
    AUTH_ME_GET,
    FIRST_SETUP_GET,
    FIRST_SETUP_POST,
    LOGIN_POST,
    LOGOUT_POST,
    RESET_USER_POST,
    SSE_TICKET_POST,
    SWAGGER_TOKEN_POST,
    TOKEN_INTROSPECT_POST,
)
from tables.throttles import LoginThrottle


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    throttle_classes = [LoginThrottle]

    _validator = AuthValidationService()

    @extend_schema(**LOGIN_POST)
    def post(self, request, *args, **kwargs):
        # Shape-check both fields and aggregate missing/blank errors
        # before delegating to simplejwt. Wrong-credential errors stay a
        # flat 401 to avoid user-enumeration leaks.
        self._validator.validate_login(request.data)
        return super().post(request, *args, **kwargs)


class LogoutView(APIView):
    authentication_classes = [JwtOrApiKeyAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(**LOGOUT_POST)
    def post(self, request):
        serializer = LogoutRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data["refresh"])
            # Ownership check: a leaked refresh token must not let a third
            # party log the owner out. Mismatch is reported with the same
            # exception as malformed/expired tokens so the caller cannot
            # distinguish "real but not yours" from "garbage".
            token_user_id = token.payload.get("user_id")
            if token_user_id is None or int(token_user_id) != request.user.id:
                raise InvalidRefreshTokenError()
            token.blacklist()
        except TokenError as exc:
            raise InvalidRefreshTokenError() from exc
        return Response(
            {"detail": "Logged out."},
            status=status.HTTP_205_RESET_CONTENT,
        )


class SseTicketView(APIView):
    authentication_classes = [JwtOrApiKeyAuthentication]
    permission_classes = [IsAuthenticated]

    _service = SseTicketService()

    @extend_schema(**SSE_TICKET_POST)
    def post(self, request):
        if not getattr(request.user, "is_authenticated", False) or not hasattr(
            request.user, "email"
        ):
            return Response(
                {"detail": "This endpoint requires a user context."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ticket, ttl = self._service.issue(request.user)
        return Response({"ticket": ticket, "expires_in": ttl})


class FirstSetupView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    _service = FirstSetupService()
    _validator = AuthValidationService()

    @extend_schema(**FIRST_SETUP_GET)
    def get(self, request):
        return Response({"needs_setup": self._service.is_setup_required()})

    @extend_schema(**FIRST_SETUP_POST)
    def post(self, request):
        cleaned = self._validator.validate_first_setup(request.data)

        result = self._service.setup(
            email=cleaned["email"],
            password=cleaned["password"],
        )
        tokens = TokenPair.for_user(result.user)

        return Response(
            {
                "user": {
                    "id": result.user.id,
                    "email": result.user.email,
                    "display_name": result.user.display_name,
                    "is_superadmin": result.user.is_superadmin,
                },
                "organization": {
                    "id": result.organization.id,
                    "name": result.organization.name,
                    "is_active": result.organization.is_active,
                },
                "access": tokens.access,
                "refresh": tokens.refresh,
            },
            status=status.HTTP_201_CREATED,
        )


class AuthMeView(APIView):
    authentication_classes = [JwtOrApiKeyAuthentication]
    permission_classes = [IsAuthenticated]

    _service = AuthService()

    @extend_schema(**AUTH_ME_GET)
    def get(self, request):
        if not getattr(request.user, "is_authenticated", False) or not hasattr(
            request.user, "email"
        ):
            # API keys with no `created_by` resolve to AnonymousUser.
            return Response(
                {"detail": "This endpoint requires a user context."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return Response(self._service.build_me_payload(request.user, request=request))


class TokenIntrospectView(APIView):
    authentication_classes = [JwtOrApiKeyAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(**TOKEN_INTROSPECT_POST)
    def post(self, request):
        if not isinstance(request.auth, ApiKey):
            return Response(
                {"detail": "API key required"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = TokenIntrospectRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["token"]

        try:
            access = AccessToken(token)
        except TokenError:
            return Response({"active": False}, status=status.HTTP_200_OK)

        return Response(
            {
                "active": True,
                "user_id": access.get("user_id"),
                "email": access.get("email"),
                "scopes": access.get("scopes", []),
            },
            status=status.HTTP_200_OK,
        )


class ApiKeyValidateView(APIView):
    authentication_classes = [JwtOrApiKeyAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(**API_KEY_VALIDATE_GET)
    def get(self, request):
        key = request.auth
        if not isinstance(key, ApiKey):
            return Response(
                {"detail": "API key required"},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(
            {
                "active": True,
                "name": key.name,
                "prefix": key.prefix,
                "scopes": key.scopes or [],
                "owner_user_id": key.created_by_id,
            },
            status=status.HTTP_200_OK,
        )


class SwaggerTokenView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginThrottle]

    @extend_schema(**SWAGGER_TOKEN_POST)
    def post(self, request):
        serializer = LoginSerializer(
            data={
                "email": request.data.get("username"),
                "password": request.data.get("password"),
            }
        )
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        return Response(
            {
                "access_token": serializer.validated_data["access"],
                "token_type": "bearer",
            }
        )


class ResetUserView(APIView):
    authentication_classes = [JwtOrApiKeyAuthentication]
    permission_classes = [IsAuthenticated]

    _service = ResetUserService()
    _validator = AuthValidationService()

    @extend_schema(**RESET_USER_POST)
    def post(self, request):
        cleaned = self._validator.validate_reset_user(request.data)

        user, raw_key = self._service.reset(
            email=cleaned["email"],
            password=cleaned["password"],
        )
        tokens = TokenPair.for_user(user)

        return Response(
            {
                "access": tokens.access,
                "refresh": tokens.refresh,
                "api_key": raw_key,
            },
            status=status.HTTP_201_CREATED,
        )

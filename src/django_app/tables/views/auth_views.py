from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model

from tables.authentication import JwtOrApiKeyAuthentication
from tables.models.auth_models import ApiKey


class AuthMeView(APIView):
    authentication_classes = [JwtOrApiKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "id": getattr(user, "id", None),
                "username": getattr(user, "username", None),
                "email": getattr(user, "email", None),
            }
        )


class TokenIntrospectView(APIView):
    authentication_classes = [JwtOrApiKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not isinstance(request.user, ApiKey):
            return Response(
                {"detail": "API key required"},
                status=status.HTTP_403_FORBIDDEN,
            )
        token = request.data.get("token")
        if not token:
            return Response(
                {"active": False, "error": "token is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            access = AccessToken(token)
        except TokenError:
            return Response({"active": False}, status=status.HTTP_200_OK)

        user_id = access.get("user_id")
        username = access.get("username")
        scopes = access.get("scopes", [])

        return Response(
            {
                "active": True,
                "user_id": user_id,
                "username": username,
                "scopes": scopes,
            },
            status=status.HTTP_200_OK,
        )


class ApiKeyValidateView(APIView):
    authentication_classes = [JwtOrApiKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not isinstance(request.user, ApiKey):
            return Response(
                {"detail": "API key required"},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(
            {
                "active": True,
                "name": request.user.name,
                "prefix": request.user.prefix,
                "scopes": request.auth.get("scopes", [])
                if isinstance(request.auth, dict)
                else [],
            },
            status=status.HTTP_200_OK,
        )


class FirstSetupView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        user_model = get_user_model()
        needs_setup = not user_model.objects.exists()
        return Response({"needs_setup": needs_setup})

    def post(self, request):
        user_model = get_user_model()
        if user_model.objects.exists():
            return Response(
                {"detail": "Setup already completed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        username = request.data.get("username")
        password = request.data.get("password")
        email = request.data.get("email", "")

        if not username or not password:
            return Response(
                {"detail": "username and password are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = user_model.objects.create_superuser(
            username=username, password=password, email=email
        )

        raw_key = ApiKey.generate_raw_key()
        key = ApiKey(name="realtime-default")
        key.set_key(raw_key)
        key.save()

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "api_key": raw_key,
            },
            status=status.HTTP_201_CREATED,
        )

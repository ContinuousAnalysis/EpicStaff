from typing import Any

from tables.services.rbac.base_rbac_validator import BaseRBACValidator, FieldError


class UserValidationService(BaseRBACValidator):
    """Validates request payloads for Story 5 user-management endpoints.

    Each public method runs every applicable check, accumulates failures as
    `FieldError`, and raises a single `FormValidationError` carrying the
    structured `errors[]` list. Returns the cleaned payload on success.

    Sensitive submitted values (password) are redacted from the echoed
    error responses; non-sensitive values (email, role_id, user_id) are
    echoed as-is so the FE can highlight the offending input.
    """

    _redacted_fields = frozenset({"password"})

    # ---- create_user ----

    def validate_create_user(self, data: dict) -> dict:
        """`POST /api/admin/users/`. Body: email, password, optional
        organization_id, optional role_id (only meaningful when
        organization_id is given)."""
        email = data.get("email")
        password = data.get("password")
        organization_id = data.get("organization_id")
        role_id = data.get("role_id")

        errors: list[FieldError] = []
        errors.extend(self._validate_email_field(email))
        errors.extend(
            self._validate_password_field(password, user_hints={"email": email})
        )
        if organization_id is not None:
            errors.extend(
                self._validate_positive_int_field("organization_id", organization_id)
            )
            if role_id is not None:
                errors.extend(self._validate_positive_int_field("role_id", role_id))

        self._raise_if_any(errors)
        return {
            "email": email,
            "password": password,
            "organization_id": int(organization_id)
            if organization_id is not None
            else None,
            "role_id": int(role_id) if role_id is not None else None,
        }

    # ---- add_membership (POST /admin/organizations/{org_id}/users/) ----

    def validate_add_membership(self, data: dict) -> dict:
        """Body has two valid modes:
          Mode A (link existing): {user_id, role_id?}
          Mode B (create + link): {email, password, role_id?}
        Validator rejects mixed payloads. role_id is optional; the service
        substitutes the built-in Member role if absent.
        """
        user_id = data.get("user_id")
        email = data.get("email")
        password = data.get("password")
        role_id = data.get("role_id")

        errors: list[FieldError] = []

        has_user_id = user_id is not None and user_id != ""
        has_email = email is not None and email != ""
        has_password = password is not None and password != ""

        if has_user_id and (has_email or has_password):
            errors.append(
                FieldError(
                    "user_id",
                    user_id,
                    "Provide either user_id (link existing) or "
                    "email+password (create new), not both.",
                )
            )
        elif not has_user_id and not (has_email and has_password):
            errors.append(
                FieldError(
                    "user_id",
                    user_id,
                    "Provide user_id (link existing) or email+password "
                    "(create new). Both are missing.",
                )
            )

        if has_user_id:
            errors.extend(self._validate_positive_int_field("user_id", user_id))
        elif has_email or has_password:
            errors.extend(self._validate_email_field(email))
            errors.extend(
                self._validate_password_field(password, user_hints={"email": email})
            )

        if role_id is not None:
            errors.extend(self._validate_positive_int_field("role_id", role_id))

        self._raise_if_any(errors)

        return {
            "user_id": int(user_id) if has_user_id else None,
            "email": email if not has_user_id else None,
            "password": password if not has_user_id else None,
            "role_id": int(role_id) if role_id is not None else None,
        }

    # ---- change_role ----

    def validate_change_role(self, data: dict) -> dict:
        """Body: {role_id}. role_id is required."""
        role_id = data.get("role_id")
        errors: list[FieldError] = []
        errors.extend(self._validate_positive_int_field("role_id", role_id))
        self._raise_if_any(errors)
        return {"role_id": int(role_id)}

    # ---- list-users query params ----

    def validate_list_users_query(self, params: dict) -> dict:
        """Optional filters: ?email=substr&is_superadmin=bool&organization_id=N."""
        email = params.get("email")
        is_superadmin_raw = params.get("is_superadmin")
        organization_id_raw = params.get("organization_id")

        errors: list[FieldError] = []

        is_superadmin: Any = None
        if is_superadmin_raw is not None and is_superadmin_raw != "":
            normalized = str(is_superadmin_raw).strip().lower()
            if normalized in ("true", "1"):
                is_superadmin = True
            elif normalized in ("false", "0"):
                is_superadmin = False
            else:
                errors.append(
                    FieldError(
                        "is_superadmin",
                        is_superadmin_raw,
                        "Must be one of: true, false, 1, 0.",
                    )
                )

        organization_id: Any = None
        if organization_id_raw is not None and organization_id_raw != "":
            errors.extend(
                self._validate_positive_int_field(
                    "organization_id", organization_id_raw
                )
            )
            if not errors or errors[-1].field != "organization_id":
                organization_id = int(organization_id_raw)

        self._raise_if_any(errors)
        return {
            "email": email if email else None,
            "is_superadmin": is_superadmin,
            "organization_id": organization_id,
        }

    # ---- list-org-members query params ----

    def validate_list_org_members_query(self, params: dict) -> dict:
        """Optional filters: ?email=substr&role=<name>."""
        email = params.get("email")
        role_name = params.get("role")
        return {
            "email": email if email else None,
            "role_name": role_name if role_name else None,
        }

from typing import Any

from django.core.files.uploadedfile import UploadedFile

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

    _redacted_fields = frozenset(
        {"password", "new_password", "current_password", "ticket"}
    )

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
        """Body: {email, password, role_id?}. Creates a new User and links
        them to the org. Linking existing users moved to the batch
        assign-users endpoint. role_id is optional; the service
        substitutes the built-in Member role if absent.
        """
        email = data.get("email")
        password = data.get("password")
        role_id = data.get("role_id")

        errors: list[FieldError] = []
        errors.extend(self._validate_email_field(email))
        errors.extend(
            self._validate_password_field(password, user_hints={"email": email})
        )
        if role_id is not None:
            errors.extend(self._validate_positive_int_field("role_id", role_id))

        self._raise_if_any(errors)
        return {
            "email": email,
            "password": password,
            "role_id": int(role_id) if role_id is not None else None,
        }

    # ---- assign_users (POST /admin/organizations/{org_id}/assign-users/) ----

    _ASSIGN_USERS_MAX_ITEMS = 100

    def validate_assign_users(self, data: dict) -> list[dict]:
        """Body: {"assignments": [{"user_id": int, "role_id": int}, ...]}.

          - assignments must be a non-empty list of <= 100 items.
          - each item requires positive-int user_id and role_id.
          - duplicate user_id within the batch is rejected.

        Returns the cleaned list of {user_id: int, role_id: int} dicts in
        submission order. The service is responsible for existence checks
        and (user, org) conflict detection.
        """
        assignments = data.get("assignments")

        if assignments is None:
            self._raise_if_any(
                [FieldError("assignments", None, "This field is required.")]
            )
        if not isinstance(assignments, list):
            self._raise_if_any(
                [FieldError("assignments", assignments, "Must be a list.")]
            )
        if len(assignments) == 0:
            self._raise_if_any(
                [FieldError("assignments", assignments, "Must not be empty.")]
            )
        if len(assignments) > self._ASSIGN_USERS_MAX_ITEMS:
            self._raise_if_any(
                [
                    FieldError(
                        "assignments",
                        len(assignments),
                        f"Must contain at most {self._ASSIGN_USERS_MAX_ITEMS} items.",
                    )
                ]
            )

        errors: list[FieldError] = []
        seen_user_ids: set[int] = set()
        cleaned: list[dict] = []

        for index, item in enumerate(assignments):
            if not isinstance(item, dict):
                errors.append(
                    FieldError(
                        f"assignments[{index}]",
                        item,
                        "Must be an object with user_id and role_id.",
                    )
                )
                continue

            user_id = item.get("user_id")
            role_id = item.get("role_id")

            row_errors: list[FieldError] = []
            row_errors.extend(
                self._validate_positive_int_field(
                    f"assignments[{index}].user_id", user_id
                )
            )
            row_errors.extend(
                self._validate_positive_int_field(
                    f"assignments[{index}].role_id", role_id
                )
            )

            if row_errors:
                errors.extend(row_errors)
                continue

            user_id_int = int(user_id)
            role_id_int = int(role_id)

            if user_id_int in seen_user_ids:
                errors.append(
                    FieldError(
                        f"assignments[{index}].user_id",
                        user_id,
                        "Duplicate user_id within the batch.",
                    )
                )
                continue

            seen_user_ids.add(user_id_int)
            cleaned.append({"user_id": user_id_int, "role_id": role_id_int})

        self._raise_if_any(errors)
        return cleaned

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

    # ---- Story 6: profile ----

    def validate_profile_patch(self, data: dict) -> dict:
        """`PATCH /api/profile/`.

        Returns a cleaned dict containing only the keys that were in
        `data` and that passed validation. Unknown keys are silently
        ignored — they cannot reach the service.

        Now: display_name is the only mutable field. Future fields
        land here as additional branches.
        """
        cleaned: dict = {}
        errors: list[FieldError] = []

        if "display_name" in data:
            value = data["display_name"]
            if value is None:
                cleaned["display_name"] = None
            elif not isinstance(value, str):
                errors.append(
                    FieldError(
                        "display_name",
                        self._echo("display_name", value),
                        "Must be a string or null.",
                    )
                )
            else:
                trimmed = value.strip()
                if len(trimmed) == 0:
                    errors.append(
                        FieldError(
                            "display_name",
                            self._echo("display_name", value),
                            "Must not be blank. Use null to clear.",
                        )
                    )
                elif len(trimmed) > 255:
                    errors.append(
                        FieldError(
                            "display_name",
                            self._echo("display_name", value),
                            "Must be 255 characters or fewer.",
                        )
                    )
                else:
                    cleaned["display_name"] = trimmed

        self._raise_if_any(errors)
        return cleaned

    def validate_avatar_upload(self, data) -> UploadedFile:
        """`POST /api/profile/avatar/`.

        Shape only: `avatar` key present and is an UploadedFile. Size and
        content validation live in UserAvatarStorageService and raise
        their own typed exceptions.
        """
        file = data.get("avatar") if hasattr(data, "get") else None
        errors: list[FieldError] = []
        if file is None:
            errors.append(FieldError("avatar", None, "This field is required."))
        elif not isinstance(file, UploadedFile):
            errors.append(FieldError("avatar", "<non-file>", "Must be a file upload."))
        self._raise_if_any(errors)
        return file

    def validate_password_change_request(self, data: dict) -> dict:
        """`POST /api/profile/password-change/request/`. Body: current_password."""
        current_password = data.get("current_password")
        errors: list[FieldError] = []
        errors.extend(
            self._require_nonblank_string("current_password", current_password)
        )
        self._raise_if_any(errors)
        return {"current_password": current_password}

    def validate_password_change_confirm(self, data: dict) -> dict:
        """`POST /api/profile/password-change/confirm/`. Body: ticket, new_password."""
        ticket = data.get("ticket")
        new_password = data.get("new_password")
        errors: list[FieldError] = []
        errors.extend(self._require_nonblank_string("ticket", ticket))
        errors.extend(
            self._validate_password_field(new_password, field_name="new_password")
        )
        self._raise_if_any(errors)
        return {"ticket": ticket, "new_password": new_password}

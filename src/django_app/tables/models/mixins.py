from django.contrib.auth.hashers import make_password, check_password


class HashedFieldMixin:
    """
    Mixin to add hashed field functionality to any model.

    The model using this mixin should define which field to hash by setting
    the HASHED_FIELD_NAME class attribute.
    """

    HASHED_FIELD_NAME = "secret_key"

    def set_secret_key(self, raw_value, field_name=None):
        """
        Hash and store a value in the specified field.

        Args:
            raw_value: The plain text value to hash
            field_name: The field to store the hash in (optional)
        """
        field_name = field_name or self.HASHED_FIELD_NAME
        setattr(self, field_name, make_password(raw_value))

    def check_secret_key(self, raw_value, field_name=None):
        """
        Check if the provided value matches the stored hash.

        Args:
            raw_value: The plain text value to verify
            field_name: The field containing the hash (optional)

        Returns:
            bool: True if the value matches, False otherwise
        """
        field_name = field_name or self.HASHED_FIELD_NAME
        hashed_value = getattr(self, field_name)
        return check_password(raw_value, hashed_value)

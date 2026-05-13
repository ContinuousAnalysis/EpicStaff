import pathlib
import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from tables.models.rbac_models.managers import UserManager


def _avatar_upload_path(instance, filename):
    """Compute the storage path for a user's avatar upload.

    Discards the original filename to remove a filename-injection surface
    and to avoid leaking what the uploader called the file. The random
    uuid prevents collisions when the same user re-uploads after a delete
    while the on_commit cleanup of the previous file is still pending.
    """
    ext = pathlib.Path(filename).suffix.lower() or ".bin"
    return f"avatars/{instance.id}/{uuid.uuid4().hex}{ext}"


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    display_name = models.CharField(max_length=255, blank=True, null=True)
    avatar = models.ImageField(upload_to=_avatar_upload_path, blank=True, null=True)
    is_superadmin = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        db_table = "rbac_user"

    def __str__(self) -> str:
        return self.email

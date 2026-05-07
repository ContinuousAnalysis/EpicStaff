import os
import sys

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Seed the system API key from the DJANGO_API_KEY environment variable."

    def handle(self, *args, **options):
        from tables.models.rbac_models import ApiKey

        raw_key = os.environ.get("DJANGO_API_KEY", "")
        if not raw_key:
            self.stdout.write("DJANGO_API_KEY not set — skipping system API key seeding.")
            return

        name = os.environ.get("DJANGO_API_KEY_NAME", "system")
        prefix = raw_key[:8]

        existing = ApiKey.objects.filter(prefix=prefix, revoked_at__isnull=True, name=name).first()
        if existing:
            if not existing.check_key(raw_key):
                self.stderr.write(
                    f"ERROR: ApiKey with prefix {prefix!r} exists but does not match DJANGO_API_KEY."
                )
                sys.exit(1)
            self.stdout.write(f"System API key {existing.name!r} already seeded and valid.")
            return

        key = ApiKey(name=name)
        key.set_key(raw_key)
        key.save()

        fetched = ApiKey.objects.get(pk=key.pk)
        if not fetched.check_key(raw_key):
            self.stderr.write("ERROR: Seeded API key failed check_key round-trip.")
            sys.exit(1)

        self.stdout.write(f"System API key {name!r} seeded (prefix={prefix}).")

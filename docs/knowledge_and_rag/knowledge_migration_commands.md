# Knowledge Migration Commands

Run these commands after migrations 0130-0133 complete.

## 1. Index Migrated Collections

```bash
# Preview
docker exec -it django_app python manage.py index_migrated_collections --dry-run

# Execute
docker exec -it django_app python manage.py index_migrated_collections
```

## 2. Remove Migration Prefix

```bash
# Preview
docker exec -it django_app python manage.py remove_migration_prefix --dry-run

# Execute
docker exec -it django_app python manage.py remove_migration_prefix
```

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tables", "0147_merge_20260219_1541"),
    ]

    operations = [
        # Remove the global unique constraint on path
        migrations.AlterField(
            model_name="webhooktrigger",
            name="path",
            field=models.CharField(
                max_length=255,
                validators=[
                    django.core.validators.RegexValidator(
                        regex=r"^[a-zA-Z0-9]{1}[a-zA-Z0-9-_]*$",
                        message="Path may only contain letters, numbers, hyphens, and underscores, and must start with a letter or number.",
                    )
                ],
            ),
        ),
        # Add unique_together on (path, ngrok_webhook_config) so each
        # (path, config) pair still maps to exactly one WebhookTrigger row,
        # while multiple flows can share the same path with different configs.
        migrations.AlterUniqueTogether(
            name="webhooktrigger",
            unique_together={("path", "ngrok_webhook_config")},
        ),
    ]

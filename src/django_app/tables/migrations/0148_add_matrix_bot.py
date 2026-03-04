# Generated migration for MatrixBot model

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("tables", "0147_merge_chunk_preview_migrations_2"),
    ]

    operations = [
        migrations.CreateModel(
            name="MatrixBot",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "matrix_user_id",
                    models.CharField(max_length=255, unique=True),
                ),
                (
                    "input_variable",
                    models.CharField(
                        default="message",
                        help_text="Flow variable that receives the incoming Matrix message text.",
                        max_length=255,
                    ),
                ),
                (
                    "output_variable",
                    models.CharField(
                        default="context",
                        help_text="Flow variable whose value is sent back as the Matrix reply.",
                        max_length=255,
                    ),
                ),
                ("enabled", models.BooleanField(default=True)),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "flow",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="matrix_bot",
                        to="tables.graph",
                    ),
                ),
            ],
            options={
                "verbose_name": "Matrix Bot",
                "verbose_name_plural": "Matrix Bots",
            },
        ),
    ]

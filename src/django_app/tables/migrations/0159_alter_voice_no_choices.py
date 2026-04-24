import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tables", "0158_merge_20260320_1738"),
    ]

    operations = [
        migrations.AlterField(
            model_name="realtimeagent",
            name="voice",
            field=models.CharField(default="alloy", max_length=100),
        ),
        migrations.AlterField(
            model_name="realtimeagentchat",
            name="voice",
            field=models.CharField(default="alloy", max_length=100),
        ),
        migrations.AlterField(
            model_name="defaultrealtimeagentconfig",
            name="voice",
            field=models.CharField(default="alloy", max_length=100),
        ),
        migrations.CreateModel(
            name="VoiceSettings",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("twilio_account_sid", models.CharField(blank=True, default="", max_length=255)),
                ("twilio_auth_token", models.CharField(blank=True, default="", max_length=255)),
                (
                    "voice_agent",
                    models.ForeignKey(
                        blank=True,
                        default=None,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to="tables.realtimeagent",
                    ),
                ),
                (
                    "ngrok_config",
                    models.ForeignKey(
                        blank=True,
                        default=None,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to="tables.ngrokwebhookconfig",
                    ),
                ),
            ],
            options={
                "db_table": "voice_settings",
            },
        ),
    ]

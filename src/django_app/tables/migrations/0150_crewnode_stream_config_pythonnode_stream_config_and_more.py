from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tables", "0149_codeagentnode_session_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="crewnode",
            name="stream_config",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="pythonnode",
            name="stream_config",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="codeagentnode",
            name="stream_config",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]

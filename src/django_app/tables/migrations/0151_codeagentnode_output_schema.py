from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tables", "0150_crewnode_stream_config_pythonnode_stream_config_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="codeagentnode",
            name="output_schema",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]

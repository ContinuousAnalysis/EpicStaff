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
    ]

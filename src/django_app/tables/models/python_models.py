from django.db import models


class PythonCode(models.Model):
    code = models.TextField()
    entrypoint = models.TextField(default="main")
    libraries = models.TextField(default="")  # sep: space
    global_kwargs = models.JSONField(default=dict)

    def get_libraries_list(self):
        return list(filter(None, self.libraries.split(" ")))


class PythonCodeTool(models.Model):
    name = models.TextField(unique=True)
    description = models.TextField()
    args_schema = models.JSONField()
    python_code = models.ForeignKey("PythonCode", on_delete=models.CASCADE, null=False)
    favorite = models.BooleanField(default=False)
    built_in = models.BooleanField(default=False)

    def get_tool_config_fields(self) -> dict[str, "PythonCodeToolConfigField"]:
        if hasattr(self, "prefetched_config_fields"):
            return {field.name: field for field in self.prefetched_config_fields}

        return {
            field.name: field
            for field in PythonCodeToolConfigField.objects.filter(tool=self)
        }


class PythonCodeToolConfigField(models.Model):
    class FieldType(models.TextChoices):
        LLM_CONFIG = "llm_config"
        EMBEDDING_CONFIG = "embedding_config"
        STRING = "string"
        BOOLEAN = "boolean"
        ANY = "any"
        INTEGER = "integer"
        FLOAT = "float"

    tool = models.ForeignKey(
        "PythonCodeTool",
        on_delete=models.CASCADE,
        null=False,
        related_name="tool_fields",
    )

    name = models.CharField(blank=False, null=False, max_length=255)
    description = models.TextField(blank=True)
    data_type = models.CharField(
        choices=FieldType.choices,
        max_length=255,
        blank=False,
        null=False,
        default=FieldType.STRING,
    )
    default_value = models.JSONField(null=True, blank=True)
    required = models.BooleanField(default=True)
    secret = models.BooleanField(default=False)

    def get_default_value(self):
        value = self.default_value
        if value is None:
            return None

        match self.data_type:
            case self.FieldType.STRING:
                return str(value)
            case self.FieldType.BOOLEAN:
                return bool(value)
            case (
                self.FieldType.INTEGER
                | self.FieldType.LLM_CONFIG
                | self.FieldType.EMBEDDING_CONFIG
            ):
                return int(value)
            case self.FieldType.FLOAT:
                return float(value)
            case self.FieldType.ANY:
                return value

    class Meta:
        unique_together = (
            "tool",
            "name",
        )


class PythonCodeToolConfig(models.Model):
    name = models.CharField(blank=False, null=False, max_length=255)
    tool = models.ForeignKey("PythonCodeTool", on_delete=models.CASCADE)
    configuration = models.JSONField(default=dict)

    def get_field(self, name: str) -> PythonCodeToolConfigField:
        if hasattr(self.tool, "prefetched_config_fields"):
            for field in self.tool.prefetched_config_fields:
                if field.name == name:
                    return field
            return None

        return PythonCodeToolConfigField.objects.filter(
            tool=self.tool, name=name
        ).first()


class PythonCodeResult(models.Model):
    execution_id = models.CharField(max_length=255, primary_key=True)
    result_data = models.TextField(null=True, default=None)
    stderr = models.TextField(default="")
    stdout = models.TextField(default="")
    returncode = models.IntegerField(default=0)

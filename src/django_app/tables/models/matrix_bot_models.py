from django.db import models


class MatrixBot(models.Model):
    flow = models.OneToOneField(
        "Graph", on_delete=models.CASCADE, related_name="matrix_bot"
    )
    matrix_user_id = models.CharField(max_length=255, unique=True)
    input_variable = models.CharField(
        max_length=255,
        default="message",
        help_text="Flow variable that receives the incoming Matrix message text.",
    )
    output_variable = models.CharField(
        max_length=255,
        default="context",
        help_text="Flow variable whose value is sent back as the Matrix reply.",
    )
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Matrix Bot"
        verbose_name_plural = "Matrix Bots"

from django.db import models


class FlowAssistant(models.Model):
    graph = models.OneToOneField(
        "Graph",
        on_delete=models.CASCADE,
        related_name="flow_assistant",
    )
    llm_config = models.ForeignKey(
        "LLMConfig",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tables_flowassistant"

    def __str__(self):
        return f"FlowAssistant(graph_id={self.graph_id})"


class FlowAssistantConversation(models.Model):
    flow_assistant = models.ForeignKey(
        FlowAssistant,
        on_delete=models.CASCADE,
        related_name="conversations",
    )
    organization_user = models.ForeignKey(
        "OrganizationUser",
        on_delete=models.CASCADE,
        related_name="flow_assistant_conversations",
    )
    title = models.CharField(max_length=200, blank=True, default="")
    messages = models.JSONField(default=list)
    started_at = models.DateTimeField(auto_now_add=True)
    last_message_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "tables_flowassistantconversation"
        ordering = ["-started_at"]

    def __str__(self):
        return f"FlowAssistantConversation(id={self.pk}, org_user_id={self.organization_user_id})"

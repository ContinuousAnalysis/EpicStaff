import uuid

from django.core.validators import RegexValidator
from django.db import models

from tables.models.base_models import DefaultBaseModel


class NgrokWebhookConfig(models.Model):
    class Region(models.TextChoices):
        US = ("us",)
        EU = ("eu",)
        AP = ("ap",)

    name = models.CharField(
        max_length=50,
        unique=True,
    )

    auth_token = models.CharField(
        max_length=255, help_text="Token from dashboard.ngrok.com", unique=True
    )

    domain = models.CharField(
        max_length=255, blank=True, null=True, help_text="Your domain"
    )

    region = models.CharField(max_length=2, choices=Region.choices, default=Region.EU)

    def get_webhook_url(self):
        if self.domain:
            return f"https://{self.domain}"
        return None


class WebhookTrigger(models.Model):
    path = models.CharField(
        max_length=255,
        validators=[
            RegexValidator(
                regex=r"^[a-zA-Z0-9]{1}[a-zA-Z0-9-_]*$",
                message="Path may only contain letters, numbers, hyphens, and underscores, and must start with a letter or number.",
            )
        ],
    )
    ngrok_webhook_config = models.ForeignKey(
        NgrokWebhookConfig,
        on_delete=models.SET_DEFAULT,
        default=None,
        null=True,
    )

    class Meta:
        unique_together = [("path", "ngrok_webhook_config")]

    def __str__(self):
        return self.path


# ---------------------------------------------------------------------------
# Generic communication channel models
# ---------------------------------------------------------------------------

class RealtimeChannel(models.Model):
    """
    A named, typed communication channel linked to a RealtimeAgent.

    The `token` (UUID) uniquely identifies this channel and is used in
    webhook URLs (e.g. /voice/{token}/) so that incoming calls can be
    routed to the correct agent without enumeration risk.

    Designed to be extensible: add a new ChannelType and a corresponding
    detail model (e.g. WhatsAppChannel, TelegramChannel) following the
    same OneToOneField pattern as TwilioChannel.
    """

    class ChannelType(models.TextChoices):
        TWILIO = "twilio", "Twilio"
        # future: WHATSAPP = "whatsapp", "WhatsApp"
        # future: TELEGRAM = "telegram", "Telegram"

    class Meta:
        db_table = "realtime_channel"

    name = models.CharField(max_length=250)
    channel_type = models.CharField(
        max_length=50, choices=ChannelType.choices, default=ChannelType.TWILIO
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    realtime_agent = models.ForeignKey(
        "RealtimeAgent",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="channels",
    )
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.channel_type})"

    @property
    def webhook_token(self) -> str:
        return str(self.token)


class TwilioChannel(models.Model):
    """
    Twilio-specific settings for a RealtimeChannel.

    One TwilioChannel per RealtimeChannel (OneToOneField).
    The Twilio webhook URL should be configured as:
        POST  /voice/{channel.token}/
        WS    /voice/{channel.token}/stream
    """

    class Meta:
        db_table = "twilio_channel"

    channel = models.OneToOneField(
        RealtimeChannel,
        on_delete=models.CASCADE,
        related_name="twilio",
        primary_key=True,
    )
    account_sid = models.CharField(max_length=255)
    auth_token = models.CharField(max_length=255)
    phone_number = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        unique=True,
        help_text="E.164 format, e.g. +15551234567",
    )
    ngrok_config = models.ForeignKey(
        NgrokWebhookConfig,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    def __str__(self):
        return f"Twilio/{self.phone_number or self.account_sid}"


# ---------------------------------------------------------------------------
# VoiceSettings — DEPRECATED
# Superseded by RealtimeChannel + TwilioChannel.
# Kept temporarily for backward compatibility; remove after full migration.
# ---------------------------------------------------------------------------

class VoiceSettings(DefaultBaseModel):
    """
    DEPRECATED: global singleton Twilio config.
    Use RealtimeChannel + TwilioChannel instead.
    """

    class Meta:
        db_table = "voice_settings"

    twilio_account_sid = models.CharField(max_length=255, blank=True, default="")
    twilio_auth_token = models.CharField(max_length=255, blank=True, default="")
    voice_agent = models.ForeignKey(
        "RealtimeAgent", on_delete=models.SET_NULL, null=True, blank=True, default=None
    )
    ngrok_config = models.ForeignKey(
        NgrokWebhookConfig,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        default=None,
    )

"""
Management command: setup_elevenlabs

Automatically wires an existing Agent to use ElevenLabs Conversational AI
as its realtime provider.

Usage (run from project root)
-----------------------------
  # Configure a single agent
  make setup-elevenlabs AGENT_ID=42 EL_API_KEY=sk-el-...

  # Configure all agents that have a RealtimeAgent record
  make setup-elevenlabs-all EL_API_KEY=sk-el-...

  # Or via django-manage target directly:
  make django-manage CMD="setup_elevenlabs --agent-id 42 --el-api-key sk-el-..."

  # Preview what would be created/updated without saving
  make django-manage CMD="setup_elevenlabs --agent-id 42 --el-api-key sk-el-... --dry-run"

What the command does
---------------------
1.  Ensures a Provider("elevenlabs") exists.
2.  Ensures a RealtimeModel(name="", provider=elevenlabs) exists.
    Empty name = auto-provision mode: the ElevenLabsAgentProvisioner will
    create the real EL agent on first WebSocket connection.
3.  Creates (or reuses) a RealtimeConfig with the supplied EL API key.
4.  Creates a placeholder RealtimeTranscriptionConfig so that the existing
    validation in RealtimeService passes (EL handles transcription internally
    and these values are never actually used for the EL provider).
5.  Updates the RealtimeAgent for each target agent with the new configs.
6.  Prints a summary of everything created/updated.
"""

from django.core.management.base import BaseCommand, CommandError

from tables.models import Provider
from tables.models.crew_models import Agent
from tables.models.llm_models import (
    RealtimeConfig,
    RealtimeModel,
    RealtimeTranscriptionConfig,
    RealtimeTranscriptionModel,
)
from tables.models.realtime_models import RealtimeAgent

_EL_PROVIDER_NAME = "elevenlabs"
# Empty model name → ElevenLabsAgentProvisioner creates the real agent on demand
_EL_REALTIME_MODEL_NAME = ""
_EL_TRANSCRIPTION_MODEL_NAME = "elevenlabs-internal"


class Command(BaseCommand):
    help = "Configure one or all RealtimeAgents to use ElevenLabs as the realtime provider."

    def add_arguments(self, parser):
        target = parser.add_mutually_exclusive_group(required=True)
        target.add_argument(
            "--agent-id",
            type=int,
            metavar="AGENT_ID",
            help="Primary key of the Agent to configure.",
        )
        target.add_argument(
            "--all-agents",
            action="store_true",
            help="Configure every Agent that has a RealtimeAgent record.",
        )
        parser.add_argument(
            "--el-api-key",
            required=True,
            metavar="KEY",
            help="ElevenLabs API key (xi-api-key).",
        )
        parser.add_argument(
            "--config-name",
            default="",
            metavar="NAME",
            help="Optional human-readable name for the created RealtimeConfig.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be created/updated without committing to the DB.",
        )

    # ------------------------------------------------------------------

    def handle(self, *args, **options):
        el_api_key: str = options["el_api_key"]
        dry_run: bool = options["dry_run"]
        config_name: str = options["config_name"]

        if dry_run:
            self.stdout.write(
                self.style.WARNING("--- DRY RUN — no changes will be saved ---\n")
            )

        # ── 1. Provider ───────────────────────────────────────────────
        provider = self._get_or_create(
            Provider,
            lookup={"name": _EL_PROVIDER_NAME},
            defaults={},
            label="Provider",
            dry_run=dry_run,
        )

        # ── 2. RealtimeModel ──────────────────────────────────────────
        rt_model = self._get_or_create(
            RealtimeModel,
            lookup={"name": _EL_REALTIME_MODEL_NAME, "provider": provider},
            defaults={"is_custom": True},
            label="RealtimeModel",
            dry_run=dry_run,
        )

        # ── 3. RealtimeConfig ─────────────────────────────────────────
        resolved_config_name = (
            config_name or f"ElevenLabs ({_EL_REALTIME_MODEL_NAME or 'auto'})"
        )
        rt_config, rt_config_created = RealtimeConfig.objects.get_or_create(
            realtime_model=rt_model,
            defaults={
                "custom_name": resolved_config_name,
                "api_key": el_api_key,
            },
        )
        if not rt_config_created and rt_config.api_key != el_api_key:
            if not dry_run:
                rt_config.api_key = el_api_key
                rt_config.save(update_fields=["api_key"])
            self.stdout.write(
                self.style.WARNING(
                    f"  Updated api_key on existing RealtimeConfig id={rt_config.pk}"
                )
            )
        else:
            verb = (
                "DRY-RUN: would create"
                if (dry_run and rt_config_created)
                else ("Created" if rt_config_created else "Reusing")
            )
            self.stdout.write(
                f"  {verb} RealtimeConfig id={rt_config.pk!r} name={rt_config.custom_name!r}"
            )

        # ── 4. Placeholder transcription config ───────────────────────
        # EL handles transcription internally; this config satisfies the
        # RealtimeService.validate_rt_agent() check but its values are never
        # actually used when rt_provider == "elevenlabs".
        transcript_model = self._get_or_create(
            RealtimeTranscriptionModel,
            lookup={"name": _EL_TRANSCRIPTION_MODEL_NAME, "provider": provider},
            defaults={"is_custom": True},
            label="RealtimeTranscriptionModel (placeholder)",
            dry_run=dry_run,
        )
        transcript_config = self._get_or_create(
            RealtimeTranscriptionConfig,
            lookup={"realtime_transcription_model": transcript_model},
            defaults={
                "custom_name": "ElevenLabs Transcription (placeholder)",
                "api_key": el_api_key,
            },
            label="RealtimeTranscriptionConfig (placeholder)",
            dry_run=dry_run,
        )

        # ── 5. Update RealtimeAgents ──────────────────────────────────
        if options["all_agents"]:
            rt_agents = list(RealtimeAgent.objects.select_related("agent").all())
        else:
            agent_id: int = options["agent_id"]
            try:
                agent = Agent.objects.get(pk=agent_id)
            except Agent.DoesNotExist:
                raise CommandError(f"Agent with id={agent_id} does not exist.")
            rt_agent, created = RealtimeAgent.objects.get_or_create(agent=agent)
            if created:
                self.stdout.write(f"  Created RealtimeAgent for Agent id={agent_id}")
            rt_agents = [rt_agent]

        if not rt_agents:
            self.stdout.write(
                self.style.WARNING("No RealtimeAgents found — nothing to update.")
            )
            return

        for rt_agent in rt_agents:
            self._update_rt_agent(rt_agent, rt_config, transcript_config, dry_run)

        # ── Summary ───────────────────────────────────────────────────
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("✓ ElevenLabs setup complete."))
        self.stdout.write("")
        self.stdout.write("  Provider          : elevenlabs")
        self.stdout.write(
            f"  RealtimeModel     : id={rt_model.pk} name={rt_model.name!r} (empty = auto-provision)"
        )
        self.stdout.write(
            f"  RealtimeConfig    : id={rt_config.pk} name={rt_config.custom_name!r}"
        )
        self.stdout.write(f"  Agents configured : {len(rt_agents)}")
        if dry_run:
            self.stdout.write(
                self.style.WARNING("\n  Dry run — no changes were saved.")
            )
        else:
            self.stdout.write("")
            self.stdout.write(
                "  On first WebSocket connection the system will automatically:\n"
                "    • Call POST /v1/convai/tools for each registered tool\n"
                "    • Call POST /v1/convai/agents with the system prompt and tool IDs\n"
                "    • Cache the agent_id in Redis (TTL 7 days)\n"
                "  Subsequent connections reuse the cached agent_id.\n"
            )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_or_create(
        self, model_class, lookup: dict, defaults: dict, label: str, dry_run: bool
    ):
        obj, created = model_class.objects.get_or_create(**lookup, defaults=defaults)
        if dry_run and created:
            # Roll back: delete the just-created object so dry-run is clean
            obj.delete()
            obj.pk = None
            self.stdout.write(f"  DRY-RUN: would create {label} {lookup}")
        elif created:
            self.stdout.write(f"  Created {label} id={obj.pk} {lookup}")
        else:
            self.stdout.write(f"  Reusing {label} id={obj.pk} {lookup}")
        return obj

    def _update_rt_agent(
        self,
        rt_agent: RealtimeAgent,
        rt_config: RealtimeConfig,
        transcript_config: RealtimeTranscriptionConfig,
        dry_run: bool,
    ):
        agent_label = (
            f"Agent id={rt_agent.agent_id} ({getattr(rt_agent.agent, 'role', '?')})"
        )
        changed = []

        if rt_agent.realtime_config_id != rt_config.pk:
            changed.append(f"realtime_config → id={rt_config.pk}")
            if not dry_run:
                rt_agent.realtime_config = rt_config

        if rt_agent.realtime_transcription_config_id != transcript_config.pk:
            changed.append(f"realtime_transcription_config → id={transcript_config.pk}")
            if not dry_run:
                rt_agent.realtime_transcription_config = transcript_config

        if changed:
            if not dry_run:
                rt_agent.save(
                    update_fields=["realtime_config", "realtime_transcription_config"]
                )
            verb = "DRY-RUN: would update" if dry_run else "Updated"
            self.stdout.write(
                f"  {verb} RealtimeAgent for {agent_label}: {', '.join(changed)}"
            )
        else:
            self.stdout.write(
                f"  No changes for RealtimeAgent of {agent_label} (already configured)"
            )

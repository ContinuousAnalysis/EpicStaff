# Voice / Twilio Integration

This document covers the end-to-end implementation of inbound voice call handling via Twilio MediaStream, including the frontend configuration UI, Django backend API, and the FastAPI realtime audio bridge.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup & Configuration](#setup--configuration)
4. [Data Model](#data-model)
5. [Django Backend API](#django-backend-api)
6. [FastAPI Realtime Service](#fastapi-realtime-service)
7. [Frontend: Voice Settings Tab](#frontend-voice-settings-tab)
8. [Audio Bridge: VoiceCallService](#audio-bridge-voicecallservice)
9. [Cache Invalidation Flow](#cache-invalidation-flow)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The voice feature allows an AI realtime agent to answer inbound phone calls routed through Twilio. When a user calls the configured Twilio phone number:

1. Twilio sends a webhook `POST /voice` to the realtime service.
2. The realtime service returns TwiML directing Twilio to open a MediaStream WebSocket at `/voice/stream`.
3. `VoiceCallService` bridges g711-ulaw audio between Twilio and the configured AI realtime provider.

The feature is configured entirely through the **Voice Settings** tab in the application's settings dialog.

---

## Architecture

```
Browser (UI)
  └─ Voice Settings Tab
       ├─ Stores credentials & agent selection → Django (voice-settings/)
       └─ Triggers webhook setup             → Django (twilio/configure-webhook/)

Twilio
  └─ Inbound call
       ├─ POST /voice          → FastAPI (webhook + TwiML response)
       └─ WS  /voice/stream    → FastAPI (audio bridge)

FastAPI (realtime service)
  └─ /voice/stream
       ├─ Reads voice_agent from cached VoiceSettings
       ├─ Calls Django init-realtime to create a session
       ├─ Polls ConnectionRepository for agent config (via Redis pub/sub)
       └─ VoiceCallService: bridges Twilio audio ↔ AI realtime provider

Django
  ├─ GET/PATCH voice-settings/  — CRUD for VoiceSettings model
  ├─ GET  twilio/phone-numbers/ — lists phone numbers via Twilio REST API
  └─ POST twilio/configure-webhook/ — sets VoiceUrl on a Twilio phone number
```

---

## Setup & Configuration

### Prerequisites

| Requirement | Notes |
|---|---|
| Twilio account | Account SID + Auth Token |
| Twilio phone number | Must be an inbound voice-capable number |
| ngrok (or other tunnel) | Exposes the realtime service to the public internet |
| Configured RealtimeAgent | Must have a realtime configuration (provider + API key) |

### Step-by-step

1. **Start the ngrok tunnel** that points to the realtime service port. Configure the tunnel in the **ngrok tunnels** section of the settings dialog — note the public URL (e.g. `https://abc123.ngrok-free.app`).

2. **Open Voice Settings** (Settings → Voice / Twilio Settings).

3. **Fill in credentials:**
   - *Twilio Account SID* — `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - *Twilio Auth Token* — from the Twilio Console

4. **Select Default Voice Agent** — the realtime agent that handles all inbound calls.

5. **Select Webhook Tunnel** — the ngrok config created in step 1. The WebSocket URL shown in the dropdown (`wss://…/voice/stream`) must be reachable by Twilio.

6. **Save**.

7. **Configure Phone Number Webhook:**
   - Click the *Twilio Phone Number* dropdown — numbers are fetched from Twilio (60 s cache).
   - Select the number to route.
   - Click **Configure Webhook** — this updates the number's `VoiceUrl` in Twilio to `https://…/voice`.

8. Call the number. The AI agent answers.

---

## Data Model

### `VoiceSettings`

Singleton model (one row per installation). Stored in `voice_settings` table.

| Field | Type | Description |
|---|---|---|
| `twilio_account_sid` | `CharField(255)` | Twilio account identifier |
| `twilio_auth_token` | `CharField(255)` | Twilio auth token (used for webhook signature validation) |
| `voice_agent` | `ForeignKey(RealtimeAgent)` | The agent that handles inbound voice calls |
| `ngrok_config` | `ForeignKey(NgrokWebhookConfig)` | Tunnel that provides the public webhook URL |

`voice_stream_url` is **not** a database field — it is a computed `SerializerMethodField` that constructs `wss://<tunnel-domain>/voice/stream` at serialization time using `WebhookTriggerService.get_tunnel_url()`.

---

## Django Backend API

### `GET /voice-settings/`

Returns the current `VoiceSettings` singleton.

**Response:**

```json
{
  "twilio_account_sid": "ACxxxxx",
  "twilio_auth_token": "••••••",
  "voice_agent": 42,
  "ngrok_config": 7,
  "voice_stream_url": "wss://abc123.ngrok-free.app/voice/stream"
}
```

### `PATCH /voice-settings/`

Partial-update the settings. After saving, Django publishes a message to the Redis channel `voice_settings:invalidate` so the realtime service drops its local cache immediately.

---

### `GET /twilio/phone-numbers/`

Fetches all incoming phone numbers from the Twilio REST API using the credentials stored in `VoiceSettings`. Requires both `twilio_account_sid` and `twilio_auth_token` to be set.

**Response:**

```json
[
  {
    "sid": "PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "phone_number": "+15551234567",
    "friendly_name": "Support Line",
    "voice_url": "https://abc123.ngrok-free.app/voice"
  }
]
```

`voice_url` shows the current webhook URL configured on the number in Twilio. Empty string means no webhook is set.

---

### `POST /twilio/configure-webhook/`

Updates the `VoiceUrl` on a Twilio phone number to point to the application's `/voice` endpoint.

**Request:**

```json
{
  "phone_sid": "PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Response:**

```json
{
  "webhook_url": "https://abc123.ngrok-free.app/voice"
}
```

The webhook URL is derived from `voice_stream_url` by replacing `wss://` with `https://` and stripping the `/stream` suffix:

```
wss://abc123.ngrok-free.app/voice/stream
  → https://abc123.ngrok-free.app/voice
```

**Errors:**

| Status | Reason |
|---|---|
| 400 | `phone_sid` missing, or Twilio credentials not configured |
| 400 | No ngrok tunnel configured (no `voice_stream_url`) |
| 502 | Twilio REST API error |

---

## FastAPI Realtime Service

### `POST /voice` — Twilio Webhook

Twilio calls this endpoint when an inbound call arrives.

**Security:** Requests are validated using Twilio's `X-Twilio-Signature` header and the stored `twilio_auth_token`. If validation fails the endpoint returns `403`. Validation is skipped only if no auth token is stored (dev/testing).

The URL used for validation is reconstructed from `x-forwarded-proto` and `x-forwarded-host` headers (necessary when the service sits behind nginx or another reverse proxy).

**Response:** TwiML XML directing Twilio to open a MediaStream WebSocket:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://abc123.ngrok-free.app/voice/stream" />
  </Connect>
</Response>
```

The stream URL comes from the cached `VoiceSettings.voice_stream_url`. If it is not set, the endpoint falls back to the `VOICE_STREAM_URL` environment variable. If neither is available, it returns `503`.

---

### `WebSocket /voice/stream` — Twilio MediaStream Bridge

Twilio opens this WebSocket immediately after the TwiML response. The handler:

1. **Accepts** the WebSocket.
2. **Reads VoiceSettings** from local cache (TTL 60 s) to resolve `voice_agent`.
3. **Reads the first Twilio event** (`connected` / `start`) to capture the `streamSid` before main processing begins. This message is passed to `VoiceCallService` as `initial_message` so the `streamSid` is available from the very first audio frame.
4. **Calls Django `init-realtime`** with the agent ID and forces audio formats to `g711_ulaw`.
5. **Polls `ConnectionRepository`** (up to 2 s) for the agent configuration delivered asynchronously via Redis pub/sub.
6. **Instantiates `VoiceCallService`** and calls `execute()`.

---

### Voice Settings Cache

The realtime service keeps an in-process cache of `VoiceSettings` (TTL = 60 s) to avoid a Django HTTP round-trip on every call.

```
┌──────────────┐    HTTP GET    ┌──────────┐
│ FastAPI      │ ─────────────► │  Django  │
│ (cache miss) │ ◄───────────── │          │
└──────────────┘                └──────────┘

┌──────────────┐  Redis publish ┌──────────┐
│  FastAPI     │ ◄────────────  │  Django  │
│  (invalidate)│  voice_settings│  (PATCH) │
└──────────────┘  :invalidate   └──────────┘
```

Cache invalidation is push-based: Django publishes to the `voice_settings:invalidate` Redis channel after every successful settings update, and `voice_settings_invalidation_listener` sets the cache to `None` immediately.

---

### Redis Listener — Singleton Note

`RedisService` uses `SingletonMeta`. Both `redis_listener` (agent schema updates) and `voice_settings_invalidation_listener` share the same instance.

`connect()` is **idempotent** — it checks `aioredis_client is not None` and skips reconnection if already connected. This prevents the second subscriber from overwriting the connection and silently breaking the first subscriber's pub/sub channel.

Both background tasks are wrapped in `_run_forever()` which restarts them with a 2 s delay if they crash or exit unexpectedly.

---

## Frontend: Voice Settings Tab

**Component:** `VoiceSettingsTabComponent`
**Location:** `frontend/src/app/features/settings-dialog/components/voice-settings-tab/`

### State

| Signal | Type | Description |
|---|---|---|
| `status` | `LoadingState` | Loading state of the initial settings fetch |
| `saving` | `boolean` | Save in progress |
| `configuringWebhook` | `boolean` | Webhook configure in progress |
| `loadingPhoneNumbers` | `boolean` | Phone numbers fetch in progress |
| `voiceStreamUrl` | `string \| null` | Current computed WebSocket URL |
| `selectedPhoneSid` | `string \| null` | Currently selected phone number SID |
| `phoneNumbers` | `TwilioPhoneNumber[]` | Phone numbers list (loaded lazily) |
| `canConfigureWebhook` | `computed` | `true` when phone SID and stream URL are both set |

`canConfigureWebhook` is a `computed()` signal (not a form value check) because Angular's reactive forms `.value` is not a signal and would not trigger re-evaluation.

### Phone Number Lazy Loading

Phone numbers are **not** fetched on page load — only when the user opens the phone number dropdown (`onPhoneSelectOpen()`). This avoids unnecessary Twilio API calls and does not expose credentials in network traffic until the user explicitly requests the list.

**Cache:** Results are cached in `phoneCache` for 60 seconds, keyed by `{twilio_account_sid, twilio_auth_token}`. The cache is invalidated:
- When the user saves settings.
- After a successful webhook configuration.

If either credential field is empty the phone list is cleared and no fetch is made.

### `voiceStreamUrl` Computation

The stream URL is built from `ngrok_config.webhook_full_url` (the live tunnel URL, not the static `domain` field):

```typescript
private _streamUrlFromConfig(webhookFullUrl?: string | null): string | null {
    if (!webhookFullUrl) return null;
    return webhookFullUrl
        .replace(/^https?:\/\//, 'wss://')
        .replace(/\/$/, '')
        + '/voice/stream';
}
```

It is updated both on initial load and whenever the `ngrok_config` dropdown value changes.

### `patchValue` and `emitEvent: false`

`patchValue` during initial load passes `{ emitEvent: false }` to prevent triggering `valueChanges` subscriptions used for detecting user-initiated credential changes. Without this, loading the page would invalidate the phone cache and trigger a spurious numbers fetch.

---

## Audio Bridge: VoiceCallService

**File:** `src/realtime/application/voice_call_service.py`

`VoiceCallService` bridges audio between Twilio and the AI realtime provider. It is **provider-agnostic** — all format conversion is handled inside provider adapters.

### Audio Flow

```
Twilio → /voice/stream (WS)
  │
  │  base64 g711-ulaw chunks (8 kHz)
  │  accumulated until ≥ 2000 bytes
  │
  ▼
client.send_audio(b64)          ← IRealtimeAgentClient
  │
  │  OpenAI adapter: pass through (OpenAI accepts g711_ulaw natively)
  │  ElevenLabs adapter: ulaw → pcm16k conversion inside adapter
  │
  ▼
AI provider WebSocket

AI provider WebSocket
  │
  │  response.audio.delta event
  │  (adapter pre-converts output to g711_ulaw when is_twilio=True)
  │
  ▼
_send_audio_to_twilio()
  │
  ▼
Twilio MediaStream (base64 g711-ulaw)
```

### Interruption Handling

When the AI provider emits `input_audio_buffer.speech_started` (OpenAI) or `interruption` (ElevenLabs), `_clear_twilio_buffer()` sends a `clear` event to Twilio to stop playback of any buffered TTS audio, preventing the AI speaking over itself.

### Factory / Provider Flag

`VoiceCallService` calls `factory.create(..., is_twilio=True)`. The `is_twilio=True` flag signals provider adapters to:
- Force audio format to `g711_ulaw` for OpenAI (overriding any per-agent config).
- Enable PCM→g711_ulaw output conversion inside the ElevenLabs server event handler.

This is the only place the `is_twilio` distinction is made — `VoiceCallService` itself has zero `if provider == "..."` branches.

---

## Cache Invalidation Flow

```
User saves Voice Settings in UI
  │
  ▼
PATCH /voice-settings/ (Django)
  │
  ├─ Saves to DB
  └─ redis_client.publish("voice_settings:invalidate", "{}")
         │
         ▼
  voice_settings_invalidation_listener (FastAPI)
  sets _voice_settings_cache = None
         │
         ▼
  next call to /voice or /voice/stream
  fetches fresh settings from Django
```

---

## Troubleshooting

### "No voice stream URL configured"

The `ngrok_config` field in `VoiceSettings` is not set or the ngrok tunnel is not running. Set it in Voice Settings → Webhook Tunnel.

### "Invalid Twilio signature"

The `X-Twilio-Signature` check failed. Most common causes:
- Wrong `twilio_auth_token` stored in Voice Settings.
- The URL reconstructed for validation does not match what Twilio signed. Ensure `x-forwarded-proto` and `x-forwarded-host` headers are forwarded by your reverse proxy (nginx).
- The webhook URL in Twilio does not exactly match the path Twilio POSTs to (query string, trailing slash).

### "No voice agent configured in Voice Settings"

The `voice_agent` field in `VoiceSettings` is not set. Select a realtime agent in the Voice Settings tab and save.

### "No agent data found for connection_key=..."

`VoiceCallService` polled for up to 2 s but the agent configuration never appeared in `ConnectionRepository`. This is usually caused by the Redis pub/sub connection being broken.

Checklist:
1. Both `redis_listener` and `voice_settings_invalidation_listener` run as background tasks. Check realtime service logs for `"redis_listener: connected to Redis"` and `"Subscribed to channel 'voice_settings:invalidate'"` on startup.
2. `RedisService.connect()` is idempotent — both listeners share the same underlying connection. If this log is absent, the Redis host/port/password environment variables may be wrong.
3. `_run_forever` wraps both tasks and will restart them after 2 s on crash — check logs for `"crashed: …"` messages.
4. Verify Django and the realtime service connect to the same Redis instance (same host, port, and database index).

### Phone numbers not loading

- Twilio Account SID and Auth Token must both be present.
- Numbers are fetched lazily — click the phone number dropdown to trigger the fetch.
- Cache TTL is 60 s; if credentials were recently changed and the cache is stale, the fetch uses the old credentials. The cache is keyed by `{sid, token}` so changing either field immediately invalidates it.

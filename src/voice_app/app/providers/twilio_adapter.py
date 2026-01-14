import json
import base64
from .base import BaseVoiceProvider

class TwilioAdapter(BaseVoiceProvider):
    def get_init_response(self, stream_url: str) -> str:
        return f"""<?xml version="1.0" encoding="UTF-8"?>
        <Response><Connect><Stream url="{stream_url}" /></Connect></Response>"""

    def extract_audio(self, message: str) -> bytes:
        data = json.loads(message)
        if data.get("event") == "media":
            return base64.b64decode(data["media"]["payload"])
        return None

    def format_response(self, mu_law_audio: bytes) -> str:
        payload = base64.b64encode(mu_law_audio).decode("utf-8")
        return json.dumps({"event": "media", "media": {"payload": payload}})
import os
import sys
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, Dict, Any

# --- New Simplified Logic ---

# 1. Check for the --debug flag *immediately*
IS_DEBUG = "--debug" in sys.argv

# 2. Build the configuration dictionary based on the flag
config_dict: Dict[str, Any] = {
    'env_file_encoding': 'utf-8',
    'extra': 'ignore'  # Ignore extra env vars
}

if IS_DEBUG:
    env_file_path = "../debug.env"
    print(f"--- DEBUG MODE: Loading settings from {env_file_path} ---")
    config_dict['env_file'] = env_file_path
else:
    print("--- STANDARD MODE: Loading settings from system environment ---")
    # We do *not* set 'env_file', so pydantic loads *only* from env vars.
# --- End of New Logic ---


class Settings(BaseSettings):
    """
    Defines the application's configuration settings.
    All settings are loaded from the config_dict defined above.
    """
    # --- Tunnel Config ---
    # Defaults are now "off" for safety. Enable them in your .env
    USE_TUNNEL: bool = False
    WEBHOOK_TUNNEL: Optional[str] = None
    WEBHOOK_AUTH: Optional[str] = None

    # --- Redis Config ---
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    
    # 3. Load the config_dict we just built
    model_config = SettingsConfigDict(**config_dict)

    # 4. Add a validator to fix your auth_token error
    @model_validator(mode='after')
    def check_tunnel_config(self) -> 'Settings':
        """
        Validates that if the tunnel is enabled, all required
        settings for it are also present.
        """
        if self.USE_TUNNEL:
            if not self.WEBHOOK_TUNNEL:
                raise ValueError(
                    "Configuration error: USE_TUNNEL is True, "
                    "but WEBHOOK_TUNNEL is not set."
                )
            if not self.WEBHOOK_AUTH:
                raise ValueError(
                    f"Configuration error for provider '{self.WEBHOOK_TUNNEL}': "
                    "USE_TUNNEL is True, but WEBHOOK_AUTH (the auth token) is not set."
                )
        return self


# 5. Instantiate 'settings' ONCE.
#    All other files will just import this single object.
try:
    settings = Settings()
except (ValueError, FileNotFoundError) as e:
    # Catches missing debug.env file, auth token errors, or bad values
    print(f"\nFATAL CONFIGURATION ERROR:\n{e}", file=sys.stderr)
    sys.exit(1)

# NO load_settings function is needed anymore.


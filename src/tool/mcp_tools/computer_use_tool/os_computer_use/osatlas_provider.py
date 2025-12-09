from os_computer_use.logging import logger
from os_computer_use.grounding import extract_bbox_midpoint

import os
from gradio_client import Client, handle_file


# Try different Hugging Face Spaces that host OS-Atlas
OSATLAS_SPACES = [
    "maxiw/OS-ATLAS",  # Original space
    "skylerwastaken/OS-ATLAS",  # Alternative space
    "johnisafridge/OS-ATLAS",  # Alternative space
    "ejli/OS-Atlas",  # Alternative space
]
OSATLAS_MODEL = "OS-Copilot/OS-Atlas-Base-7B"
OSATLAS_API = "/run_example"
HF_TOKEN = os.getenv("HF_TOKEN")  # Optional: helps with rate limits


class OSAtlasProvider:
    """
    The OS-Atlas provider uses Hugging Face Spaces API (Gradio) for remote inference.
    Works without HF_TOKEN but may be rate-limited.
    Tries multiple spaces if one is down.
    """

    def __init__(self):
        # Lazy initialization: don't connect until first use
        self.client = None
        self.space_url = None
        self._initialized = False

    def _ensure_connected(self):
        """Lazy connection: only connect when actually needed"""
        if self._initialized and self.client is not None:
            return True

        # Try each space until one works
        for space in OSATLAS_SPACES:
            try:
                logger.log(f"Trying to connect to OS-Atlas space: {space}...", "gray")
                self.client = Client(
                    space,
                    hf_token=HF_TOKEN if HF_TOKEN else None,
                )
                self.space_url = space
                logger.log(f"Successfully connected to {space}", "gray")
                self._initialized = True
                return True
            except Exception as e:
                error_msg = str(e)
                if "RUNTIME_ERROR" in error_msg or "invalid state" in error_msg.lower():
                    logger.log(
                        f"Space {space} is down or in error state, trying next...",
                        "yellow",
                    )
                    continue
                else:
                    logger.log(f"Error connecting to {space}: {error_msg}", "yellow")
                    continue

        # If all spaces failed, log warning but don't raise (allows graceful fallback)
        if self.client is None:
            logger.log(
                "Warning: Could not connect to any OS-Atlas Hugging Face Space. "
                "Will return None for grounding calls. Spaces may be down.",
                "yellow",
            )
            self._initialized = (
                True  # Mark as initialized to avoid retrying on every call
            )
            return False
        return True

    def call(self, prompt, image_data):
        # Lazy connection: try to connect if not already connected
        if not self._ensure_connected() or self.client is None:
            return None

        try:
            # Ensure image_data is bytes or file path
            if isinstance(image_data, str):
                # If it's a file path, use it directly with handle_file
                image_input = handle_file(image_data)
            elif isinstance(image_data, bytes):
                # If it's bytes, save to temp file first
                import tempfile

                with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                    tmp.write(image_data)
                    tmp_path = tmp.name
                try:
                    image_input = handle_file(tmp_path)
                finally:
                    # Clean up temp file
                    try:
                        os.unlink(tmp_path)
                    except:
                        pass
            else:
                logger.log(
                    f"Error: image_data must be bytes or file path, got {type(image_data)}",
                    "red",
                )
                return None

            # Call the Gradio Space API
            result = self.client.predict(
                image=image_input,
                text_input=prompt + "\nReturn the response in the form of a bbox",
                model_id=OSATLAS_MODEL,
                api_name=OSATLAS_API,
            )

            # Handle different response formats
            if not result or len(result) < 2:
                logger.log(
                    f"Error: OS-Atlas returned unexpected result format: {result}",
                    "red",
                )
                return None

            bbox_response = result[1] if isinstance(result[1], str) else str(result[1])
            position = extract_bbox_midpoint(bbox_response)

            if len(result) > 2:
                image_url = result[2]
                logger.log(f"bbox {image_url}", "gray")

            if position:
                logger.log(
                    f"OS-Atlas found position: {position} for '{prompt}'", "gray"
                )

            return position
        except Exception as e:
            logger.log(f"Error calling OS-Atlas: {str(e)}", "red")
            # If the current space fails, try to reconnect to a different one
            if "RUNTIME_ERROR" in str(e) or "invalid state" in str(e).lower():
                logger.log(
                    "Current space is down, will try a different one on next call",
                    "yellow",
                )
                self.client = None  # Force reconnection on next call
            return None

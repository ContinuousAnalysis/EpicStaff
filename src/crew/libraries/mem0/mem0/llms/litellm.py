import json
from typing import Dict, List, Optional

try:
    import litellm
except ImportError:
    raise ImportError("The 'litellm' library is required. Please install it using 'pip install litellm'.")

from mem0.configs.llms.base import BaseLlmConfig
from mem0.llms.base import LLMBase


class LiteLLM(LLMBase):
    def __init__(self, config: Optional[BaseLlmConfig] = None):
        super().__init__(config)

        if not self.config.model:
            self.config.model = "gpt-4o-mini"

    def _parse_response(self, response, tools):
        """
        Process the response based on whether tools are used or not.

        Args:
            response: The raw response from API.
            tools: The list of tools provided in the request.

        Returns:
            str or dict: The processed response.
        """
        if tools:
            processed_response = {
                "content": response.choices[0].message.content,
                "tool_calls": [],
            }

            if response.choices[0].message.tool_calls:
                for tool_call in response.choices[0].message.tool_calls:
                    processed_response["tool_calls"].append(
                        {
                            "name": tool_call.function.name,
                            "arguments": json.loads(tool_call.function.arguments),
                        }
                    )

            return processed_response
        else:
            return response.choices[0].message.content

    def generate_response(
        self,
        messages: List[Dict[str, str]],
        response_format=None,
        tools: Optional[List[Dict]] = None,
        tool_choice: str = "auto",
    ):
        """
        Generate a response based on the given messages using Litellm.

        Args:
            messages (list): List of message dicts containing 'role' and 'content'.
            response_format (str or object, optional): Format of the response. Defaults to "text".
            tools (list, optional): List of tools that the model can call. Defaults to None.
            tool_choice (str, optional): Tool choice method. Defaults to "auto".

        Returns:
            str: The generated response.
        """
        if not litellm.supports_function_calling(self.config.model):
            raise ValueError(f"Model '{self.config.model}' in litellm does not support function calling.")

        # LiteLLM's Ollama prompt templating can crash with `IndexError: list index out of range`
        # when tool-calling message payloads are present. As a defensive workaround, strip tool_calls
        # from messages and avoid passing tools/tool_choice to LiteLLM for ollama/* models.
        if isinstance(self.config.model, str) and self.config.model.startswith("ollama/"):
            sanitized_messages = []
            for msg in messages:
                if isinstance(msg, dict) and "tool_calls" in msg:
                    msg = {k: v for k, v in msg.items() if k != "tool_calls"}
                sanitized_messages.append(msg)
            messages = sanitized_messages
            tools = None

            # LiteLLM's Ollama prompt template expects at least one user message.
            if not any(isinstance(m, dict) and m.get("role") == "user" for m in messages):
                messages.append({"role": "user", "content": ""})

            # Work around a LiteLLM Ollama prompt-template bug where an assistant-final
            # message can cause an out-of-range index access.
            if messages and isinstance(messages[-1], dict) and messages[-1].get("role") == "assistant":
                messages.append({"role": "user", "content": ""})

        params = {
            "model": self.config.model,
            "messages": messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "top_p": self.config.top_p,
        }
        if response_format:
            params["response_format"] = response_format
        if tools:  # TODO: Remove tools if no issues found with new memory addition logic
            params["tools"] = tools
            params["tool_choice"] = tool_choice

        response = litellm.completion(**params)
        return self._parse_response(response, tools)

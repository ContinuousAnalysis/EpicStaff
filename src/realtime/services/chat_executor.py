import asyncio
import base64
import json
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger

from ai.summarization.openai_summarization_client import OpenaiSummarizationClient
from src.shared.models import RealtimeAgentChatData
from ai.agent.openai_realtime_agent_client import (
    TurnDetectionMode,
)
from services.summarize_buffer import ChatSummarizedBufferClient
from services.chat_buffer import ChatSummarizedBuffer
from utils.shorten import shorten_dict
from services.python_code_executor_service import PythonCodeExecutorService
from services.redis_service import RedisService
from services.tool_manager_service import ToolManagerService
from ai.transcription.realtime_transcription import (
    OpenaiRealtimeTranscriptionClient,
)
from ai.agent.openai_realtime_agent_client import (
    OpenaiRealtimeAgentClient,
)
from ai.agent.elevenlabs_realtime_agent_client import ElevenLabsRealtimeAgentClient
from ai.agent.elevenlabs_agent_provisioner import ElevenLabsAgentProvisioner
from services.chat_mode import ChatMode
from utils.tokenizer import Tokenizer


class ChatExecutor:
    def __init__(
        self,
        client_websocket: WebSocket,
        realtime_agent_chat_data: RealtimeAgentChatData,
        instructions: str,
        redis_service: RedisService,
        python_code_executor_service: PythonCodeExecutorService,
        tool_manager_service: ToolManagerService,
        connections: dict[
            WebSocket,
            tuple[OpenaiRealtimeAgentClient, OpenaiRealtimeTranscriptionClient],
        ],
        elevenlabs_agent_provisioner: ElevenLabsAgentProvisioner | None = None,
    ):
        self.client_websocket = client_websocket
        self.realtime_agent_chat_data = realtime_agent_chat_data
        self.instructions = instructions
        self.redis_service = redis_service
        self.python_code_executor_service = python_code_executor_service
        self.tool_manager_service = tool_manager_service
        self.connections = connections
        self.elevenlabs_agent_provisioner = elevenlabs_agent_provisioner
        self.wake_word = realtime_agent_chat_data.wake_word
        self.current_chat_mode = ChatMode.CONVERSATION
        # ElevenLabs handles VAD/transcription internally — stop/listen mode not supported
        chat_executor_ref = (
            None if realtime_agent_chat_data.rt_provider == "elevenlabs" else self
        )
        self.tool_manager_service.register_tools_from_rt_agent_chat_data(
            realtime_agent_chat_data=realtime_agent_chat_data,
            chat_executor=chat_executor_ref,
        )

    def initialize_buffer(
        self, max_buffer_tokens, max_chunks_tokens, model="gpt-4o"
    ) -> (ChatSummarizedBuffer, ChatSummarizedBufferClient):
        tokenizer: Tokenizer = Tokenizer(model)
        buffer: ChatSummarizedBuffer = ChatSummarizedBuffer(
            tokenizer,
            max_buffer_tokens,
            max_chunks_tokens,
        )

        # Note! Summarization works only when you pass openai api key
        # in 'self.realtime_agent_chat_data.rt_api_key' param
        summ_client = OpenaiSummarizationClient(
            api_key=self.realtime_agent_chat_data.rt_api_key, model=model
        )

        summ_buffer_client = ChatSummarizedBufferClient(
            buffer=buffer, summ_client=summ_client
        )
        return buffer, summ_buffer_client

    async def initialize_clients(
        self,
        buffer: ChatSummarizedBuffer,
    ) -> tuple[
        OpenaiRealtimeAgentClient | ElevenLabsRealtimeAgentClient,
        OpenaiRealtimeTranscriptionClient | None,
    ]:
        rt_tools = await self.tool_manager_service.get_realtime_tool_models(
            connection_key=self.realtime_agent_chat_data.connection_key
        )

        if self.realtime_agent_chat_data.rt_provider == "elevenlabs":
            llm_model = (
                self.realtime_agent_chat_data.llm.config.model
                if self.realtime_agent_chat_data.llm
                else None
            )
            if llm_model is None:
                print("Ebat', kak ti tak drug?")
            else:
                print(f"Okak, using {llm_model}")
            rt_agent_client = ElevenLabsRealtimeAgentClient(
                api_key=self.realtime_agent_chat_data.rt_api_key,
                connection_key=self.realtime_agent_chat_data.connection_key,
                agent_id="",
                agent_provisioner=self.elevenlabs_agent_provisioner,
                on_server_event=self._elevenlabs_frontend_event,
                tool_manager_service=self.tool_manager_service,
                rt_tools=rt_tools,
                voice=self.realtime_agent_chat_data.voice,
                instructions=self.instructions,
                temperature=self.realtime_agent_chat_data.temperature,
                llm_model=llm_model,
                language=self.realtime_agent_chat_data.language,
            )
            # ElevenLabs has built-in STT/VAD — no separate transcription client needed
            return rt_agent_client, None

        rt_agent_client = OpenaiRealtimeAgentClient(
            api_key=self.realtime_agent_chat_data.rt_api_key,
            connection_key=self.realtime_agent_chat_data.connection_key,
            on_server_event=self.client_websocket.send_json,
            tool_manager_service=self.tool_manager_service,
            rt_tools=rt_tools,
            model=self.realtime_agent_chat_data.rt_model_name,
            voice=self.realtime_agent_chat_data.voice,
            instructions=self.instructions,
            temperature=self.realtime_agent_chat_data.temperature,
            input_audio_format=self.realtime_agent_chat_data.input_audio_format,
            output_audio_format=self.realtime_agent_chat_data.output_audio_format,
            turn_detection_mode=TurnDetectionMode.SERVER_VAD,
        )

        rt_transcription_client = OpenaiRealtimeTranscriptionClient(
            api_key=self.realtime_agent_chat_data.transcript_api_key,
            connection_key=self.realtime_agent_chat_data.connection_key,
            on_server_event=self.client_websocket.send_json,
            model="whisper-1",
            temperature=self.realtime_agent_chat_data.temperature,
            language=self.realtime_agent_chat_data.language,
            voice_recognition_prompt=self.realtime_agent_chat_data.voice_recognition_prompt,
            buffer=buffer,
        )

        return rt_agent_client, rt_transcription_client

    async def _elevenlabs_frontend_event(self, data: dict) -> None:
        """Forward ElevenLabs events to the frontend WebSocket.

        Upsamples audio delta from 16kHz to 24kHz expected by the browser,
        leaving all other events unchanged.
        """
        if data.get("type") == "response.audio.delta":
            try:
                pcm_data = base64.b64decode(data["delta"])
                audio_16k = np.frombuffer(pcm_data, dtype=np.int16)
                if len(audio_16k) > 0:
                    x_16k = np.arange(len(audio_16k))
                    x_24k = np.linspace(
                        0, len(audio_16k) - 1, int(len(audio_16k) * 1.5)
                    )
                    audio_24k = np.interp(x_24k, x_16k, audio_16k).astype("<i2")
                    data = {
                        **data,
                        "delta": base64.b64encode(audio_24k.tobytes()).decode(),
                    }
            except Exception as e:
                logger.error(f"ElevenLabs audio upsample error: {e}")

        await self.client_websocket.send_json(data)

    async def execute(self):
        try:
            await self.client_websocket.accept(subprotocol="openai-beta.realtime-v1")

            rt_agent_client_message_handler = None
            rt_transcription_client_message_handler = None

            # Initialize buffer
            buffer, summ_buffer_client = self.initialize_buffer(
                max_buffer_tokens=2000, max_chunks_tokens=4000
            )

            # Initialize OpenAI handler with callbacks
            rt_agent_client, rt_transcription_client = await self.initialize_clients(
                buffer
            )

            await rt_agent_client.connect()
            if rt_transcription_client is not None:
                await rt_transcription_client.connect()

            self.connections[self.client_websocket] = (
                rt_agent_client,
                rt_transcription_client,
            )
            rt_agent_client_message_handler = asyncio.create_task(
                rt_agent_client.handle_messages()
            )
            if rt_transcription_client is not None:
                rt_transcription_client_message_handler = asyncio.create_task(
                    rt_transcription_client.handle_messages()
                )

            logger.info("WebSocket connection established")

            previous_input = ""
            wake_words: list[str] = [
                w.strip("!?., ") for w in self.wake_word.lower().split()
            ]
            # Main communication loop
            while True:
                if (
                    self.current_chat_mode == ChatMode.LISTEN
                    and rt_transcription_client is not None
                ):
                    client = rt_transcription_client
                    last_input: list[str] = buffer.get_last_input()
                    # logger.debug(f"Last input: {last_input}")
                    # logger.debug(f"ALL TRIGGERS: {wake_words}")

                    if last_input != previous_input:
                        # Cheks for triggers in the last input only once when last input was changed
                        logger.debug(f"Last input was changed: {last_input}")
                        previous_input = last_input  # cache last input
                        if any(trigger in last_input for trigger in wake_words):
                            final_buffer = buffer.get_final_buffer()

                            await rt_agent_client.send_conversation_item_to_server(
                                final_buffer
                            )
                            await rt_agent_client.request_response()

                            buffer.flush()
                            self.current_chat_mode = ChatMode.CONVERSATION

                    # Only for logger
                    buffer_data: list[str] = buffer.get_buffer()
                    chunks_data: list[str] = buffer.get_chunks()
                    logger.debug(
                        f"Current buffer ({len(buffer)} tokens): {buffer_data}"
                        f"\n"
                        f"Current chunks ({len(chunks_data)} chunks, {buffer._chunks_tokens_count} tokens): {chunks_data}"
                    )
                    # Only for logger

                    if not buffer.check_free_buffer():
                        # Summarize buffer
                        logger.debug("Starting summarization of the buffer process...")
                        await summ_buffer_client.summarize_buffer()

                else:
                    client = rt_agent_client

                try:
                    # Receive JSON message
                    message: dict = await self.client_websocket.receive_json()
                    logger.debug(f"Received message: {shorten_dict(message)}")

                    # Process message through OpenAI handler
                    response = await client.process_message(message)
                    if response:
                        logger.debug(f"Sending response: {response}")
                        await self.client_websocket.send_json(response)

                except json.JSONDecodeError:
                    logger.error("Invalid JSON format")
                    await self.client_websocket.send_json(
                        {"type": "error", "message": "Invalid JSON format"}
                    )

                except WebSocketDisconnect:
                    raise

                except Exception as e:
                    logger.exception(f"Error processing message: {e}")
                    await self.client_websocket.send_json(
                        {"type": "error", "message": str(e)}
                    )

        except WebSocketDisconnect:
            logger.info("Client disconnected")
        except Exception:
            logger.exception("Unexpected exception")
        finally:
            # Clean up
            if (
                rt_agent_client_message_handler is not None
                and not rt_agent_client_message_handler.done()
            ):
                rt_agent_client_message_handler.cancel()

            if (
                rt_transcription_client_message_handler is not None
                and not rt_transcription_client_message_handler.done()
            ):
                rt_transcription_client_message_handler.cancel()

            if self.client_websocket in self.connections:
                await client.close()
                del self.connections[self.client_websocket]

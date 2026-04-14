from loguru import logger

from domain.ports.i_summarization_client import ISummarizationClient
from domain.services.chat_buffer import ChatSummarizedBuffer


class ChatSummarizedBufferClient:
    """
    Client for managing and summarizing chat buffers.
    """

    def __init__(
        self,
        buffer: ChatSummarizedBuffer,
        summ_client: ISummarizationClient,
    ):
        self.buffer = buffer
        self.summ_client = summ_client

    async def summarize_buffer(self) -> None:
        """
        Summarizes the current buffer content and appends the result to the chunks.
        """
        buffer_data = self.buffer.get_buffer()
        buffer_text = " ".join(buffer_data)

        free_chunks = self.buffer.check_free_chunks()
        if not free_chunks:
            await self.summarize_chunks()

        logger.debug("Preparing to summarize the buffer")
        summarized_text: str = await self.summ_client.summarize_buffer(buffer_text)
        if not summarized_text:
            logger.error("Couldn't summarize the buffer")
            return

        logger.debug("Buffer was successfully summarized")
        self.buffer.flush_buffer()
        self.buffer.append_chunk(summarized_text)

    async def summarize_chunks(self):
        """
        Summarizes all current chunks and appends the result as a new chunk.
        """
        chunks_data = self.buffer.get_chunks()
        chunks_text = " ".join(chunks_data)

        logger.debug("Preparing to summarize the chunks")
        summarized_chunks = await self.summ_client.summarize_chunks(chunks_text)
        if not summarized_chunks:
            logger.error("Couldn't summarize the chunks")
            return

        logger.debug("Chunks were successfully summarized")
        self.buffer.flush_chunks()
        self.buffer.append_chunk(summarized_chunks)

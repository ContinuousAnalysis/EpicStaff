from chonkie import TokenChunker as ChonkieTokenChunker

from chunkers.base_chunker import BaseChunker, BaseChunkData


class TokenChunker(BaseChunker):
    def __init__(self, chunk_size, chunk_overlap, additional_params):
        self.text_splitter = ChonkieTokenChunker(
            tokenizer="gpt2", chunk_size=chunk_size, chunk_overlap=chunk_overlap
        )

    def chunk(self, text: str) -> list[BaseChunkData]:
        chunks = self.text_splitter.chunk(text)
        token_chunks = []
        for i, chunk in enumerate(chunks):
            overlap_end_index = None
            if i > 0:
                overlap_end_index = chunks[i - 1].end_index - chunk.start_index
            token_chunks.append(
                BaseChunkData(
                    text=chunk.text,
                    token_count=chunk.token_count,
                    overlap_end_index=overlap_end_index,
                )
            )
        return token_chunks

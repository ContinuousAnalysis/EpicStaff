import pytest
from tests.fixtures import FakeTokenizer
from domain.services.chat_buffer import ChatBuffer, ChatSummarizedBuffer


@pytest.fixture
def tokenizer():
    return FakeTokenizer()


@pytest.fixture
def buffer(tokenizer):
    return ChatBuffer(tokenizer, max_buffer_tokens=10)


@pytest.fixture
def summ_buffer(tokenizer):
    return ChatSummarizedBuffer(tokenizer, max_buffer_tokens=10, max_chunks_tokens=20)


# ---------------------------------------------------------------------------
# ChatBuffer
# ---------------------------------------------------------------------------


def test_initial_length_is_zero(buffer):
    assert len(buffer) == 0


def test_append_increases_token_count(buffer):
    buffer.append("hello")  # 5 chars → 5 tokens with FakeTokenizer
    assert len(buffer) == 5


def test_append_multiple(buffer):
    buffer.append("ab")   # 2 tokens
    buffer.append("cde")  # 3 tokens
    assert len(buffer) == 5


def test_check_free_buffer_true_when_under_limit(buffer):
    buffer.append("hi")   # 2 tokens, limit=10
    assert buffer.check_free_buffer() is True


def test_check_free_buffer_false_when_at_limit(buffer):
    buffer.append("a" * 10)  # 10 tokens == limit
    assert buffer.check_free_buffer() is False


def test_check_free_buffer_false_when_over_limit(buffer):
    buffer.append("a" * 15)
    assert buffer.check_free_buffer() is False


def test_get_buffer_returns_appended_items(buffer):
    buffer.append("foo")
    buffer.append("bar")
    result = buffer.get_buffer()
    assert result == ["foo", "bar"]


def test_get_buffer_returns_copy(buffer):
    buffer.append("foo")
    result = buffer.get_buffer()
    result.append("mutated")
    assert buffer.get_buffer() == ["foo"]  # internal state unchanged


def test_get_last_input_returns_cleaned_words(buffer):
    buffer.append("hello, world!")
    words = buffer.get_last_input()
    assert "hello" in words
    assert "world" in words


def test_get_last_input_strips_punctuation(buffer):
    buffer.append("stop! please.")
    words = buffer.get_last_input()
    assert "stop" in words
    assert "please" in words
    assert "stop!" not in words


def test_flush_buffer_resets_length(buffer):
    buffer.append("hello world")
    buffer.flush_buffer()
    assert len(buffer) == 0


def test_flush_buffer_clears_items(buffer):
    buffer.append("item1")
    buffer.flush_buffer()
    assert buffer.get_buffer() == []


def test_flush_buffer_resets_last_input(buffer):
    buffer.append("some text")
    buffer.flush_buffer()
    assert buffer.get_last_input() == []


# ---------------------------------------------------------------------------
# ChatSummarizedBuffer
# ---------------------------------------------------------------------------


def test_summ_buffer_inherits_append(summ_buffer):
    summ_buffer.append("hello")
    assert len(summ_buffer) == 5


def test_append_chunk_adds_to_chunks(summ_buffer):
    summ_buffer.append_chunk("summary text")
    chunks = summ_buffer.get_chunks()
    assert chunks == ["summary text"]


def test_append_chunk_increases_chunks_token_count(summ_buffer):
    summ_buffer.append_chunk("abc")  # 3 tokens
    assert summ_buffer._chunks_tokens_count == 3


def test_check_free_chunks_true_when_under_limit(summ_buffer):
    summ_buffer.append_chunk("short")  # 5 tokens, limit=20
    assert summ_buffer.check_free_chunks() is True


def test_check_free_chunks_false_when_at_limit(summ_buffer):
    summ_buffer.append_chunk("a" * 20)  # 20 tokens == limit
    assert summ_buffer.check_free_chunks() is False


def test_append_chunk_ignored_when_chunks_full(summ_buffer):
    summ_buffer.append_chunk("a" * 20)  # fills chunks
    summ_buffer.append_chunk("overflow")
    chunks = summ_buffer.get_chunks()
    assert len(chunks) == 1  # overflow was ignored


def test_get_final_buffer_no_chunks(summ_buffer):
    summ_buffer.append("line one")
    summ_buffer.append("line two")
    result = summ_buffer.get_final_buffer()
    assert "line one" in result
    assert "line two" in result


def test_get_final_buffer_with_chunks(summ_buffer):
    summ_buffer.append_chunk("chunk summary")
    summ_buffer.append("current input")
    result = summ_buffer.get_final_buffer()
    # chunks come first, then buffer
    chunk_pos = result.index("chunk summary")
    input_pos = result.index("current input")
    assert chunk_pos < input_pos


def test_get_final_buffer_empty(summ_buffer):
    result = summ_buffer.get_final_buffer()
    assert result == ""


def test_flush_clears_buffer_and_chunks(summ_buffer):
    summ_buffer.append("data")
    summ_buffer.append_chunk("summary")
    summ_buffer.flush()
    assert len(summ_buffer) == 0
    assert summ_buffer.get_chunks() == []


def test_flush_chunks_only_clears_chunks(summ_buffer):
    summ_buffer.append("data")
    summ_buffer.append_chunk("summary")
    summ_buffer.flush_chunks()
    assert summ_buffer.get_chunks() == []
    assert summ_buffer.get_buffer() == ["data"]

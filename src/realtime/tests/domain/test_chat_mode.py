from domain.models.chat_mode import ChatMode


def test_listen_value():
    assert ChatMode.LISTEN.value == "listen"


def test_conversation_value():
    assert ChatMode.CONVERSATION.value == "conversation"


def test_chat_mode_members():
    members = {m.value for m in ChatMode}
    assert members == {"listen", "conversation"}

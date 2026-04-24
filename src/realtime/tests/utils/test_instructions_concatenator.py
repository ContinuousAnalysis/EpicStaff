from utils.instructions_concatenator import generate_instruction


def test_contains_role():
    result = generate_instruction(role="Support Agent", goal="help users", backstory="expert")
    assert "Support Agent" in result


def test_contains_goal():
    result = generate_instruction(role="Bot", goal="resolve tickets", backstory="trained")
    assert "resolve tickets" in result


def test_contains_backstory():
    result = generate_instruction(role="Bot", goal="help", backstory="experienced helper")
    assert "experienced helper" in result


def test_strips_whitespace_from_role():
    result = generate_instruction(role="  Trimmed Role  ", goal="g", backstory="b")
    assert "Trimmed Role" in result
    assert "  Trimmed Role  " not in result


def test_strips_whitespace_from_goal():
    result = generate_instruction(role="r", goal="  trimmed goal  ", backstory="b")
    assert "trimmed goal" in result


def test_strips_whitespace_from_backstory():
    result = generate_instruction(role="r", goal="g", backstory="  trimmed backstory  ")
    assert "trimmed backstory" in result


def test_output_is_string():
    result = generate_instruction(role="r", goal="g", backstory="b")
    assert isinstance(result, str)


def test_output_contains_guidelines():
    result = generate_instruction(role="r", goal="g", backstory="b")
    assert "Be clear and concise" in result

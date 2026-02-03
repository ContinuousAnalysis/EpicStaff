import pytest
from tables.exceptions import PythonCodeToolConfigSerializerError
from tables.models.python_models import PythonCodeToolConfigField
from tables.validators.python_code_tool_config_validator import (
    PythonCodeToolConfigValidator,
)
from tests.fixtures import *


@pytest.mark.django_db
def test_validate_invalid_configuration_type(validator, mock_tool):
    """Test that validation fails if configuration is not a dictionary."""
    with pytest.raises(PythonCodeToolConfigSerializerError, match="must be an object"):
        validator.validate("test_tool", mock_tool, configuration=[1, 2, 3])


@pytest.mark.django_db
def test_validate_happy_path_string(validator, mock_tool):
    """Test successful validation of a simple string field."""
    # Setup
    field_name = "api_key"
    mock_field = create_mock_field(
        field_name, PythonCodeToolConfigField.FieldType.STRING, required=True
    )
    mock_tool.get_tool_config_fields.return_value = {field_name: mock_field}

    config = {field_name: "secret_123"}

    # Execute
    result = validator.validate("tool", mock_tool, config)

    # Assert
    assert result[field_name] == "secret_123"


@pytest.mark.django_db
def test_validate_missing_required_field_raises_error(validator, mock_tool):
    """Test that missing a required field raises an error."""
    # Setup
    field_name = "api_key"
    mock_field = create_mock_field(
        field_name, PythonCodeToolConfigField.FieldType.STRING, required=True
    )
    mock_tool.get_tool_config_fields.return_value = {field_name: mock_field}

    config = {}  # Empty config

    # Execute & Assert
    with pytest.raises(
        PythonCodeToolConfigSerializerError, match=f"Field '{field_name}' is required"
    ):
        validator.validate("tool", mock_tool, config)


@pytest.mark.django_db
def test_validate_missing_required_field_allowed_flag(mock_tool):
    """Test that missing required fields are allowed if the validator is configured so."""
    # Setup validator with flag=False
    validator = PythonCodeToolConfigValidator(validate_missing_required_fields=False)

    field_name = "api_key"
    mock_field = create_mock_field(
        field_name, PythonCodeToolConfigField.FieldType.STRING, required=True
    )
    mock_tool.get_tool_config_fields.return_value = {field_name: mock_field}

    config = {}

    # Execute
    result = validator.validate("tool", mock_tool, config)

    # Assert: Should pass, but value should be None (or absent depending on logic, here it will be None)
    assert result[field_name] is None


@pytest.mark.django_db
def test_validate_ignores_extra_config_fields(validator, mock_tool):
    """Test that fields in config that aren't in the tool definition are ignored."""
    # Setup: Tool has NO fields
    mock_tool.get_tool_config_fields.return_value = {}

    config = {"random_extra_field": "should_be_ignored"}

    # Execute
    result = validator.validate("tool", mock_tool, config)

    # Assert
    assert "random_extra_field" not in result
    assert result == {}


# --- Type Casting Tests ---


@pytest.mark.parametrize(
    "data_type, input_val, expected_val",
    [
        (PythonCodeToolConfigField.FieldType.INTEGER, "10", 10),
        (PythonCodeToolConfigField.FieldType.INTEGER, 10, 10),
        (PythonCodeToolConfigField.FieldType.FLOAT, "10.5", 10.5),
        (PythonCodeToolConfigField.FieldType.FLOAT, 10, 10.0),
        (PythonCodeToolConfigField.FieldType.STRING, 123, "123"),
        (PythonCodeToolConfigField.FieldType.BOOLEAN, 1, True),
        (PythonCodeToolConfigField.FieldType.BOOLEAN, 0, False),
        # Note: Python's bool("False") is True. This tests the specific implementation provided.
        (PythonCodeToolConfigField.FieldType.BOOLEAN, "False", True),
        (PythonCodeToolConfigField.FieldType.ANY, {"a": 1}, {"a": 1}),
        (
            PythonCodeToolConfigField.FieldType.LLM_CONFIG,
            "5",
            5,
        ),  # Mapped to int in code
    ],
)
@pytest.mark.django_db
def test_casting_success(validator, mock_tool, data_type, input_val, expected_val):
    """Test successful type casting for various field types."""
    field_name = "test_field"
    mock_field = create_mock_field(field_name, data_type, required=True)
    mock_tool.get_tool_config_fields.return_value = {field_name: mock_field}

    config = {field_name: input_val}

    result = validator.validate("tool", mock_tool, config)
    assert result[field_name] == expected_val


@pytest.mark.django_db
def test_casting_failure_raises_error(validator, mock_tool):
    """Test that providing an invalid value for a type raises an error."""
    field_name = "max_tokens"
    # Integer field
    mock_field = create_mock_field(
        field_name, PythonCodeToolConfigField.FieldType.INTEGER, required=True
    )
    mock_tool.get_tool_config_fields.return_value = {field_name: mock_field}

    # Pass a non-integer string
    config = {field_name: "not_a_number"}

    with pytest.raises(
        PythonCodeToolConfigSerializerError, match="Error casting value"
    ):
        validator.validate("tool", mock_tool, config)


@pytest.mark.django_db
def test_validate_none_value_not_cast(validator, mock_tool):
    """Test that if value is None (and allowed via missing_fields=False), casting is skipped."""
    validator.validate_missing_required_fields = False

    field_name = "count"
    # Even if it's an INTEGER field
    mock_field = create_mock_field(
        field_name, PythonCodeToolConfigField.FieldType.INTEGER, required=True
    )
    mock_tool.get_tool_config_fields.return_value = {field_name: mock_field}

    config = {}  # Missing input

    result = validator.validate("tool", mock_tool, config)

    # Should remain None, not cast to int(None) which would raise TypeError
    assert result[field_name] is None

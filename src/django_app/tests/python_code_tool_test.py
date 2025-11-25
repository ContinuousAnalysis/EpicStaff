import pytest
from rest_framework.exceptions import ValidationError as DRFValidationError
from tables.exceptions import PythonCodeToolConfigSerializerError
from tables.serializers.model_serializers import (
    PythonCodeSerializer,
    PythonCodeToolConfigFieldSerializer,
    PythonCodeToolConfigSerializer,
    PythonCodeToolSerializer,
)
from tables.models import (
    PythonCode,
    PythonCodeTool,
    PythonCodeToolConfig,
    PythonCodeToolConfigField,
)


@pytest.mark.django_db
def test_python_code_serializer_basic():
    code = PythonCode.objects.create(code="print('Hello')", libraries="requests numpy")
    serializer = PythonCodeSerializer(code)
    data = serializer.data
    assert "libraries" in data
    assert data["libraries"] == ["requests", "numpy"]


@pytest.mark.django_db
def test_python_code_serializer_to_internal_value():
    data = {"code": "print('ok')", "libraries": ["pandas", "pytest"]}
    serializer = PythonCodeSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    obj = serializer.save()
    assert obj.libraries == "pandas pytest"


@pytest.mark.django_db
def test_python_code_tool_serializer_create_and_update():
    code = PythonCode.objects.create(code="def main(): pass", libraries="requests")
    tool_data = {
        "name": "MyTool",
        "description": "test tool",
        "args_schema": {},
        "python_code": {
            "code": code.code,
            "entrypoint": code.entrypoint,
            "libraries": ["requests"],
            "global_kwargs": {},
        },
        "favorite": False,
    }

    serializer = PythonCodeToolSerializer(data=tool_data)
    serializer.is_valid(raise_exception=True)
    tool = serializer.save()
    assert tool.python_code.code == "def main(): pass"

    update_data = {
        "description": "updated",
        "python_code": {"code": "def main(): return 1"},
    }
    serializer = PythonCodeToolSerializer(instance=tool, data=update_data, partial=True)
    serializer.is_valid(raise_exception=True)
    updated_tool = serializer.save()
    assert updated_tool.description == "updated"
    assert updated_tool.python_code.code == "def main(): return 1"


@pytest.mark.django_db
def test_python_code_tool_serializer_prevents_built_in_update():
    code = PythonCode.objects.create(code="print('ok')")
    tool = PythonCodeTool.objects.create(
        name="BuiltIn",
        description="desc",
        args_schema={},
        python_code=code,
        built_in=True,
    )

    update_data = {
        "description": "update attempt",
        "python_code": {"code": "print('no')"},
    }
    serializer = PythonCodeToolSerializer(instance=tool, data=update_data, partial=True)
    with pytest.raises(Exception):
        serializer.is_valid(raise_exception=True)
        serializer.save()


@pytest.mark.django_db
def test_python_code_tool_config_serializer_validation():
    code = PythonCode.objects.create(code="def main(): pass")
    tool = PythonCodeTool.objects.create(
        name="Tool1", description="desc", args_schema={}, python_code=code
    )

    field1 = PythonCodeToolConfigField.objects.create(
        tool=tool,
        name="arg1",
        data_type=PythonCodeToolConfigField.FieldType.STRING,
        required=True,
    )
    field2 = PythonCodeToolConfigField.objects.create(
        tool=tool,
        name="arg2",
        data_type=PythonCodeToolConfigField.FieldType.INTEGER,
        required=False,
    )

    config_data = {
        "name": "config1",
        "tool": tool.pk,
        "configuration": {"arg1": "value1", "arg2": 10},
    }
    serializer = PythonCodeToolConfigSerializer(data=config_data)
    serializer.is_valid(raise_exception=True)
    obj = serializer.save()
    assert obj.name == "config1"
    assert obj.tool == tool

    invalid_data = {
        "name": "config2",
        "tool": tool.pk,
        "configuration": {"arg23": 10},
    }
    serializer = PythonCodeToolConfigSerializer(data=invalid_data)
    with pytest.raises(PythonCodeToolConfigSerializerError):
        serializer.is_valid(raise_exception=True)


@pytest.mark.django_db
def test_python_code_tool_config_field_serializer():
    field = PythonCodeToolConfigField.objects.create(
        tool=None,
        name="field1",
        data_type=PythonCodeToolConfigField.FieldType.STRING,
        default_value="abc",
    )
    serializer = PythonCodeToolConfigFieldSerializer(field)
    data = serializer.data
    assert data["default_value"] == "abc"

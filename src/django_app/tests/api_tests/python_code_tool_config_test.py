import pytest
import json
from django.urls import reverse
from tables.models.python_models import (
    PythonCode,
    PythonCodeTool,
    PythonCodeToolConfig,
    PythonCodeToolConfigField,
)

from tests.fixtures import *



@pytest.mark.django_db
def test_field_viewset_list(api_client, tool_config_field_int):
    """Test retrieving the list of config fields."""
    url = reverse("pythoncodetoolconfigfield-list") 
    
    response = api_client.get(url)
    
    assert response.status_code == 200
    
    if "results" in response.data:
        results = response.data["results"]
    else:
        results = response.data
        
    assert len(results) == 1
    assert results[0]["name"] == "batch_size"
    assert results[0]["default_value"] == 10

@pytest.mark.django_db
def test_field_viewset_create(api_client, python_code_tool):
    """Test creating a new configuration field definition."""
    url = reverse("pythoncodetoolconfigfield-list")
    
    payload = {
        "tool": python_code_tool.id,
        "name": "temperature",
        "data_type": "float",
        "required": True,
        "description": "LLM Temperature"
    }
    
    response = api_client.post(url, payload, format="json")
    
    assert response.status_code == 201
    assert PythonCodeToolConfigField.objects.count() == 1
    assert PythonCodeToolConfigField.objects.get().name == "temperature"



@pytest.mark.django_db
def test_config_viewset_create_success(api_client, python_code_tool, tool_config_field_int):
    """Happy Path: Create a config."""
    url = reverse("pythoncodetoolconfig-list")
    
    payload = {
        "name": "dev_settings",
        "tool": python_code_tool.id,
        "configuration": {
            "batch_size": 100
        }
    }
    
    response = api_client.post(url, payload, format="json")
    
    assert response.status_code == 201
    assert response.data["configuration"]["batch_size"] == 100
    assert PythonCodeToolConfig.objects.count() == 1

@pytest.mark.django_db
def test_config_viewset_create_validation_missing_required(api_client, python_code_tool):

    PythonCodeToolConfigField.objects.create(
        tool=python_code_tool,
        name="mandatory_field",
        data_type=PythonCodeToolConfigField.FieldType.STRING,
        required=True,
        default_value=None
    )

    url = reverse("pythoncodetoolconfig-list")
    
    payload = {
        "name": "broken_settings",
        "tool": python_code_tool.id,
        "configuration": {
            "some_other_key": "irrelevant"
        }
    }
    
    response = api_client.post(url, payload, format="json")
    
    assert response.status_code == 400
    assert "required" in str(response.data) or "mandatory_field" in str(response.data)

@pytest.mark.django_db
def test_config_viewset_create_validation_type_casting(api_client, python_code_tool, tool_config_field_int):
    """Happy Path with Casting: Send a string '500' for an Integer field."""
    url = reverse("pythoncodetoolconfig-list")
    
    payload = {
        "name": "string_input_settings",
        "tool": python_code_tool.id,
        "configuration": {
            "batch_size": "500"
        }
    }
    
    response = api_client.post(url, payload, format="json")
    
    assert response.status_code == 201
    config_obj = PythonCodeToolConfig.objects.get(name="string_input_settings")
    assert config_obj.configuration["batch_size"] == 500
    assert isinstance(config_obj.configuration["batch_size"], int)

@pytest.mark.django_db
def test_config_viewset_create_validation_type_error(api_client, python_code_tool, tool_config_field_int):
    """Failure Path: Send a non-numeric string for an Integer field."""
    url = reverse("pythoncodetoolconfig-list")
    
    payload = {
        "name": "bad_type_settings",
        "tool": python_code_tool.id,
        "configuration": {
            "batch_size": "not_a_number"
        }
    }
    
    response = api_client.post(url, payload, format="json")
    
    assert response.status_code == 400
    assert "Error casting value" in str(response.data)

@pytest.mark.django_db
def test_config_viewset_filtering(api_client, python_code_tool, existing_config):
    """Test that the filter backend works (filtering by tool)."""
    other_code = PythonCode.objects.create(code="pass")
    other_tool = PythonCodeTool.objects.create(name="other_tool", python_code=other_code, args_schema={})
    PythonCodeToolConfig.objects.create(name="other_config", tool=other_tool, configuration={})

    url = reverse("pythoncodetoolconfig-list")
    
    response = api_client.get(f"{url}?tool={python_code_tool.id}")
    
    assert response.status_code == 200
    
    if "results" in response.data:
        results = response.data["results"]
    else:
        results = response.data
        
    assert len(results) == 1
    assert results[0]["name"] == existing_config.name


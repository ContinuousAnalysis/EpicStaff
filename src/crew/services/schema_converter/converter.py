import json
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory
from typing import Type
import uuid
from datamodel_code_generator import InputFileType, generate
from datamodel_code_generator.parser.base import title_to_class_name
from datamodel_code_generator import DataModelType
from types import ModuleType
from pydantic import BaseModel


def generate_model_from_schema(schema_dict: dict) -> Type[BaseModel]:
    class_name=title_to_class_name(schema_dict["title"])
    module_name = make_module_name(f"{schema_dict["title"]}_{uuid.uuid4().hex[:6]}")
    with TemporaryDirectory() as temporary_directory_name:
        temporary_directory = Path(temporary_directory_name)
        output = Path(temporary_directory / "model.py")
        generate(
            json.dumps(schema_dict),
            input_file_type=InputFileType.JsonSchema,
            output=output,
            # set up the output model types
            output_model_type=DataModelType.PydanticV2BaseModel,
            class_name=class_name
        )
        class_definition: str = output.read_text()

    dynamic_module = ModuleType(module_name)
    exec(class_definition, dynamic_module.__dict__)
    sys.modules[module_name] = dynamic_module
    model: Type[BaseModel] = getattr(dynamic_module, class_name)
    model.model_rebuild()
    return model

def make_module_name(name: str) -> str:
    name = name.lower()
    name = re.sub(r'[^a-z0-9_]', '_', name)
    name = re.sub(r'_+', '_', name).strip('_')
    if re.match(r'^\d', name):
        name = f"m_{name}"
    return name
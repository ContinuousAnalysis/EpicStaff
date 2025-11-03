import json
from io import BytesIO


def data_to_json_file(data, filename):
    json_bytes = json.dumps(data, indent=4).encode("utf-8")
    file_obj = BytesIO(json_bytes)
    file_obj.name = filename
    file_obj.seek(0)
    return file_obj

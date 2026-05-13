import io
import json
import csv
from abc import ABC, abstractmethod

from django.http import HttpResponse

from tables.utils.helpers import generate_file_name


class ExportFormatStrategy(ABC):
    @abstractmethod
    def render(
        self, data: dict, entity_type: str, prefix: str, base_name: str
    ) -> HttpResponse: ...


class JsonExportFormatStrategy(ExportFormatStrategy):
    def render(
        self, data: dict, entity_type: str, prefix: str, base_name: str
    ) -> HttpResponse:
        filename = generate_file_name(base_name, prefix=prefix)
        response = HttpResponse(
            json.dumps(data, indent=4), content_type="application/json"
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class CsvExportFormatStrategy(ExportFormatStrategy):
    """
    Extracts data[entity_type], flattens list-of-lists (e.g. session messages),
    applies row_mapper and writes CSV.
    """

    def __init__(self, fields: list[str], row_mapper=None):
        self.fields = fields
        self.row_mapper = row_mapper or (lambda row: row)

    def render(
        self, data: dict, entity_type: str, prefix: str, base_name: str
    ) -> HttpResponse:
        rows = []
        for item in data.get(entity_type, []):
            if isinstance(item, list):
                rows.extend(item)
            else:
                rows.append(item)

        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=self.fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(self.row_mapper(row))

        filename = generate_file_name(base_name, prefix=prefix).replace(".json", ".csv")
        response = HttpResponse(buf.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

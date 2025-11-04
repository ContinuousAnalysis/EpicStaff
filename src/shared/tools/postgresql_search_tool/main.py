# PostgreSQL Search Tool

from sqlalchemy import create_engine, text
from decimal import Decimal
import sqlparse

class PostgresqlSearchTool:
    def __init__(self):
        self.db_uri = state["variables"]["DB_URI"]
        self.engine = create_engine(self.db_uri)

    def _is_safe_query(self, query):
        stripped = query.strip().rstrip(";")
        if ";" in stripped:
            return False, "Multiple statements are not allowed."

        parsed = sqlparse.parse(stripped)
        if not parsed:
            return False, "Empty or invalid SQL query."

        command = parsed[0].get_type().upper()
        if command != "SELECT":
            return False, f"Only SELECT queries are allowed, not {command}."

        return True, ""

    def _convert_json_safe(self, row_dict):
        safe_row = {}
        for k, v in row_dict.items():
            if isinstance(v, Decimal):
                safe_row[k] = float(v)
            else:
                safe_row[k] = v
        return safe_row

    def run_query(self, sql_query: str):
        is_safe, error_msg = self._is_safe_query(sql_query)
        if not is_safe:
            return {"error": error_msg}
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(sql_query))
                rows = [self._convert_json_safe(dict(row)) for row in result.mappings().all()]
                return rows
        except Exception as e:
            return {"error": str(e)}

def main(sql_query: str):
    executor = PostgresqlSearchTool()
    return executor.run_query(sql_query)


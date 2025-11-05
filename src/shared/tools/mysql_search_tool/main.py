# MySQL Search Tool

from sqlalchemy import create_engine, text
import simplejson as json
import sqlparse

class MySQLSearchTool:
    def __init__(self):
        self.db_uri = state["variables"]["DB_URI"] 
        self.engine = create_engine(self.db_uri)

    def _is_safe_query(self, query):
        statements = sqlparse.split(query)
        if len(statements) != 1:
            return False, "Multiple statements are not allowed."
        
        parsed = sqlparse.parse(statements[0])
        if not parsed:
            return False, "Empty or invalid SQL query."
        
        command = parsed[0].get_type().upper()
        if command != "SELECT":
            return False, f"Only SELECT queries are allowed, not {command}."
        
        return True, ""

    def run_query(self, sql_query: str):
        is_safe, error_msg = self._is_safe_query(sql_query)
        if not is_safe:
            return {"error": error_msg}

        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(sql_query))
                rows = [dict(r) for r in result.mappings()]

                return json.loads(json.dumps(rows, default=str))
        except Exception as e:
            return {"error": str(e)}


def main(sql_query: str):
    executor = MySQLSearchTool()
    return executor.run_query(sql_query)

# NL2SQL Tool

from langchain_openai import ChatOpenAI
from langchain_community.utilities import SQLDatabase
from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain.agents import create_agent


class NL2SQLTool:
    def __init__(self):
        self.db_uri = state["variables"]["DB_URI"]
        self.openai_api_key = state["variables"]["OPENAI_API_KEY"]
        self.read_only = state["variables"]["READ_ONLY"]

    def _build_system_prompt(self) -> str:
        crud_policy = (
            "You may execute SELECT, INSERT, UPDATE, DELETE, and DROP statements as needed."
            if not self.read_only
            else "You must NEVER execute INSERT, UPDATE, DELETE, or DROP statements."
        )

        return f"""
You are an intelligent SQL assistant connected to a live database.
        {crud_policy}
Always generate syntactically correct SQL queries using the correct SQL dialect.
If a query fails, analyze the error and retry with a corrected query.
If the question is unrelated to the database, reply with: "I don't know"."""

    def _create_agent(self):
        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
            api_key=self.openai_api_key,
        )

        db = SQLDatabase.from_uri(self.db_uri)
        toolkit = SQLDatabaseToolkit(db=db, llm=llm)

        system_prompt = self._build_system_prompt()

        agent = create_agent(
            model=llm,
            tools=toolkit.get_tools(),
            system_prompt=system_prompt,
            debug=True,
        )
        return agent

    def run_query(self, query_text: str) -> str:
        agent = self._create_agent()
        result = agent.invoke({"messages": [{"role": "user", "content": query_text}]})
        return result["messages"][-1].content


def main(query_text):
    nl2sql = NL2SQLTool()
    result = nl2sql.run_query(query_text)
    return result



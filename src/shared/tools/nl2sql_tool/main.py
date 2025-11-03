# NL2SQL Tool

from langchain_community.utilities import SQLDatabase
from langchain_community.agent_toolkits import create_sql_agent
from langchain_openai import ChatOpenAI

class NL2SQLTool:
    def __init__(
        self,
        db_uri: str,
        openai_api_key: str
    ):
        self.db_uri = state["variables"]["DB_URI"] 
        self.openai_api_key = state["variables"]["OPENAI_API_KEY"] 

    def _create_agent(self):

        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
            api_key=self.openai_api_key
        )
        db = SQLDatabase.from_uri(self.db_uri)
        agent_executor = create_sql_agent(
            llm=llm,
            db=db
        )
        return agent_executor

    def run_query(self, query_text: str) -> str:
        agent = self._create_agent()
        result = agent.invoke({"input": query_text})
        return result["output"]

def main(db_uri, query_text):
    nl2sql = NL2SQLTool(db_uri)
    result = nl2sql.run_query(query_text)
    return result


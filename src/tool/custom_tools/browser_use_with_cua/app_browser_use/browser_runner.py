from browser_use import Browser, Agent
from browser_use.llm.deepseek.chat import ChatDeepSeek
from config import DEEPSEEK_API_KEY, DEEPSEEK_MODEL, DEEPSEEK_BASE_URL, DEEPSEEK_TEMPERATURE

_SESSIONS: dict[str, dict] = {}

async def run_browser_task(
    prompt: str,
    model: str | None = None,
    temperature: float | None = None,
    session_id: str = "default",
    reset: bool = False,
):

    if reset and session_id in _SESSIONS:
        try:
            _SESSIONS[session_id]["browser"].close()  
        except Exception:
            pass
        _SESSIONS.pop(session_id, None)

    if session_id not in _SESSIONS:
        browser = Browser(headless=False)  
        llm = ChatDeepSeek(
            api_key=DEEPSEEK_API_KEY,
            model=model or DEEPSEEK_MODEL,
            base_url=DEEPSEEK_BASE_URL,
            temperature=DEEPSEEK_TEMPERATURE if temperature is None else temperature,
        )
        _SESSIONS[session_id] = {"browser": browser, "llm": llm}

    sess = _SESSIONS[session_id]
    agent = Agent(task=prompt, browser=sess["browser"], llm=sess["llm"])
    return await agent.run()

# Open Interpreter Tool

## Setup
1. Add the following to `src/.env`:

~~~text
API_KEY=<your_api_key>
LLM=<your_llm_choice>
~~~

2. Navigate to the `mcp_tools` folder and start the server:

~~~bash
docker compose up --build
~~~

---

## Ports
After startup, the server exposes two ports:  

- `7001` – HTTP API for requests to the tool  
- `6080` – Streaming of container’s GUI to the browser  

---

## Access

- **GUI:** Open in browser:  
~~~text
http://localhost:6080/vnc.html
~~~

- **HTTP requests:** You can send requests via:

**Curl example:**
~~~bash
curl -X POST http://localhost:7001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "open_interpreter",
      "arguments": {
        "instruction": "Your prompt"
      }
    },     
    "id": 1
  }'
~~~

**Python example (as custom tool in UI):**
Wasn't able to test if this method works due to networking problem on Linux. Should work fine on Windows.
~~~python
import asyncio
import json
from fastmcp import Client

def serialize_response(resp) -> str:
    try:
        return json.dumps(resp.model_dump(), ensure_ascii=False, indent=2)
    except AttributeError:
        pass
    try:
        return json.dumps(resp.dict(), ensure_ascii=False, indent=2)
    except AttributeError:
        pass
    try:
        return json.dumps(resp, ensure_ascii=False, indent=2)
    except TypeError:
        return str(resp)

async def call_open_interpreter(instruction: str):
     url = "http://host.docker.internal:7001/mcp"
    async with Client(transport=url, timeout=300, init_timeout=300) as client:
        response = await client.call_tool(
            "open_interpreter",
            {"instruction": instruction}
        )
        return serialize_response(response)

def main(instruction: str):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(call_open_interpreter(instruction))
    loop.close()
    return result
~~~

---

## Functionality
The Open Interpreter Tool can:  
- Execute Python code interactively  
- Return code outputs and errors  
- Interract with container's GUI


## Tests
To run unit tests go to /tools/ folder. Create venv(if you don't have one already):
~~~bash
python -m venv venv
venv/Source/Activate # for Windows
source venv/bin/activate # for Linux
pip install poetry
poetry install
~~~
Then, inside venv run
~~~bash
pytest ./tests/mcp_tools_tests/open_interpreter_test.py
~~~

### Note
Test test_ai_behavior[Divide 100 by 0.-expected_outputs0]. Sometimes fails due to how expected text is parsed. If all other tests have passed, this one should also be ok
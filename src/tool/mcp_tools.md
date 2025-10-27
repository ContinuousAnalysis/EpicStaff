# Open Interpreter Tools

## Setup
1. Copy the template env file:

~~~bash
cp src/tool/mcp_tools/template.env src/tool/mcp_tools/.env
~~~

2. Fill in this fields in .env file with actual info

~~~text
API_KEY=<your_api_key>
LLM=<your_llm_choice>
~~~

3. Navigate to the `mcp_tools` folder and start the server:

~~~bash
docker compose up --build
~~~

or

For CLI tool only
~~~bash
docker compose up cli_oi_tool --build
~~~

For Browser Use tool only
~~~bash
docker compose up browser_oi_tool up --build
~~~

---

## Ports
After startup, this ports are exposed:  

- `7001` – CLI tool API
- `7002` - Browser Use tool API
- `6080` - VNC server for browser GUI (Browser tool)
---

## Access

- **HTTP requests:** You can send manual requests via:

**CLI tool request:**
~~~bash
curl -N -X POST http://localhost:7002/mcp   -H "Content-Type: application/json"   -H "Accept: application/json, text/event-stream"   -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "cli_tool",
      "arguments": {
        "input_data": {
          "context": "Optional context",
          "command": "Your command"
        }
      }
    },
    "id": 1
  }'
~~~
**Browser Use tool request:**
~~~bash
curl -N -X POST http://localhost:7002/mcp   -H "Content-Type: application/json"   -H "Accept: application/json, text/event-stream"   -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "browser_tool",
      "arguments": {
        "input_data": {
          "context": "Optional context",
          "instructions": ["List of your instructions"]
        }
      }
    },
    "id": 1
  }'
~~~

**Python example (as custom tool in UI):**

**CLI tool:**
Python code for tool
~~~python
import asyncio
import json
from fastmcp import Client

def serialize_response(resp) -> str:
    """Safely serialize MCP response to a readable string."""
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

async def call_cli_tool(command: str, context: str = None):
    """Call the Open Interpreter CLI tool via FastMCP client."""
    url = "http://host.docker.internal:7001/mcp"
    payload = {
        "input_data": {
            "command": command
        }
    }
    if context:
        payload["input_data"]["context"] = context

    async with Client(transport=url, timeout=300, init_timeout=300) as client:
        response = await client.call_tool("cli_tool", payload)
        return serialize_response(response)

def main(command: str, context: str = None):
    """Run async call synchronously."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(call_cli_tool(command, context))
    loop.close()
    return result
~~~

Input Description
~~~json
{
  "properties": {
    "context": {
      "type": "string",
      "description": "High-level context or goal"
    },
    "command": {
      "type": "string",
      "description": "Action that needs to be performed"
    }
  },
  "required": [
    "command"
  ]
}
~~~

**Browser Use tool:**
Python code for tool
~~~python
import asyncio
import json
from fastmcp import Client

def serialize_response(resp) -> str:
    """Safely serialize MCP response to a readable string."""
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

async def call_browser_tool(context: str, instructions: list):
    """Call the Open Interpreter browser tool via FastMCP client."""
    url = "http://host.docker.internal:7002/mcp"
    async with Client(transport=url, timeout=300, init_timeout=300) as client:
        response = await client.call_tool(
            "browser_tool",
            {
                "input_data": {
                    "context": context,
                    "instructions": instructions
                }
            }
        )
        return serialize_response(response)

def main(context: str, instructions: list):
    """Run async call synchronously."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(call_browser_tool(context, instructions))
    loop.close()
    return result
~~~

Input Description
~~~json
{
  "properties": {
    "context": {
      "type": "string",
      "description": "High-level context or goal for the browser session (e.g., 'Check Python website functionality')"
    },
    "instructions": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Ordered list of instructions the browser tool must perform"
    }
  },
  "required": [
    "context",
    "instructions"
  ]
}
~~~
---

## Functionality
**CLI Tool**
- Converts natural-language instructions into shell commands or Python code
- Executes commands and returns output and errors

**Browser Tool**
- Automates browser interactions in headful mode
- Executes a sequence of instructions
- GUI available at http://127.0.0.1:6080/vnc.html

# Notes

These tools do **not have any guardrails** regarding the code they execute. All commands are executed automatically, without any confirmation.

While the tools are containerized, they **can still modify or delete files within the container, interact with the network, or use any credentials provided**.

Be careful with what you ask the agent to do. These tools **can and will execute destructive commands** if instructed to do so.

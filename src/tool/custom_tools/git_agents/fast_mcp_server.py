import asyncio
import os
import sys
from typing import Optional
from fastmcp import FastMCP
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

mcp = FastMCP("Git Agents")

AGENTS = {
    'code_reviewer': {
        'name': 'code_reviewer',
        'description': 'Analyze pull requests for security, performance, and code quality issues using GPT-4o',
        'path': 'agents/code_reviewer/main.py'
    },
    'pr_summarizer': {
        'name': 'pr_summarizer',
        'description': 'Generate comprehensive PR descriptions automatically using GPT-4o',
        'path': 'agents/pr_summarizer/main.py'
    },
    'release_notes': {
        'name': 'release_notes',
        'description': 'Create professional release notes from merged PRs using GPT-4o',
        'path': 'agents/release_notes/main.py'
    },
    'doc_support': {
        'name': 'doc_support',
        'description': 'Check if documentation updates are needed for code changes using GPT-4o',
        'path': 'agents/doc_support/main.py'
    },
    'auto_labeler': {
        'name': 'auto_labeler',
        'description': 'Automatically label GitLab merge requests using GPT-4o (GitLab only)',
        'path': 'agents/auto_labeler/main.py'
    }
}

async def run_agent(agent_name: str, pr_id: Optional[int] = None) -> str:
    if agent_name not in AGENTS:
        return f"Unknown agent: {agent_name}"
    
    agent = AGENTS[agent_name]
    agent_path = agent['path']
    
    if not os.path.exists(agent_path):
        return f"Agent file not found: {agent_path}"
    
    logger.info(f"Running {agent_name} agent...")
    
    output_lines = []
    output_lines.append(f"{'='*60}")
    output_lines.append(f"{agent_name.replace('_', ' ').title()} Agent")
    output_lines.append(f"{'='*60}")
    output_lines.append(f"Agent: {agent_path}")
    output_lines.append(f"Provider: {os.getenv('PROVIDER', 'github')}")
    output_lines.append(f"Repository: {os.getenv('REPO_OWNER')}/{os.getenv('REPO_NAME')}")
    output_lines.append(f"LLM Model: GPT-4o")
    
    if pr_id:
        output_lines.append(f"Target PR: #{pr_id}")
    
    output_lines.append("")
    
    try:
        from io import StringIO
        
        old_stdout = sys.stdout
        sys.stdout = captured_output = StringIO()
        
        exec(open(agent_path).read(), {'__name__': '__main__'}) #переписати
        
        sys.stdout = old_stdout
        agent_output = captured_output.getvalue()
        
        output_lines.append(agent_output)
        output_lines.append("")
        output_lines.append("Agent execution completed successfully")
        
        logger.info(f"{agent_name} completed")
        
    except Exception as e:
        output_lines.append(f"Agent failed with error: {e}")
        logger.error(f"{agent_name} failed: {e}", exc_info=True)
    
    return "\n".join(output_lines)

@mcp.tool()
async def code_reviewer(pr_id: Optional[int] = None) -> str:
    """Analyze pull requests for security, performance, and code quality issues using GPT-4o."""
    return await run_agent('code_reviewer', pr_id)

@mcp.tool()
async def pr_summarizer(pr_id: Optional[int] = None) -> str:
    """Generate comprehensive PR descriptions automatically using GPT-4o."""
    return await run_agent('pr_summarizer', pr_id)

@mcp.tool()
async def release_notes(pr_id: Optional[int] = None) -> str:
    """Create professional release notes from merged PRs using GPT-4o."""
    return await run_agent('release_notes', pr_id)

@mcp.tool()
async def doc_support(pr_id: Optional[int] = None) -> str:
    """Check if documentation updates are needed for code changes using GPT-4o."""
    return await run_agent('doc_support', pr_id)

@mcp.tool()
async def auto_labeler(pr_id: Optional[int] = None) -> str:
    """Automatically label GitLab merge requests using GPT-4o (GitLab only)."""
    return await run_agent('auto_labeler', pr_id)

if __name__ == "__main__":
    logger.info("Starting Git Agents MCP Server...")
    logger.info(f"Provider: {os.getenv('PROVIDER', 'github')}")
    logger.info(f"Repository: {os.getenv('REPO_OWNER')}/{os.getenv('REPO_NAME')}")
    logger.info("")
    logger.info("Available tools:")
    for agent in AGENTS.values():
        logger.info(f"  - {agent['name']}: {agent['description']}")
    logger.info("")
    logger.info("FastMCP Server ready!")
    
    mcp.run(transport="stdio")
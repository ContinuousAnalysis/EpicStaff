import sys
import asyncio
import os
from pathlib import Path

sys.path.append(str(Path(__file__).parent))

AGENTS = {
    'code_reviewer': 'agents/code_reviewer/main.py',
    'pr_summarizer': 'agents/pr_summarizer/main.py',
    'release_notes': 'agents/release_notes/main.py',
    'doc_support': 'agents/doc_support/main.py',
    'auto_labeler': 'agents/auto_labeler/main.py',
}

def print_usage():
    print("""
Git Agents Client

Usage: python client.py <agent_name> [options]

Available agents:
  code_reviewer   - Analyze PRs for security, performance, and code quality issues
  pr_summarizer   - Generate comprehensive PR descriptions
  release_notes   - Create release notes from merged PRs
  doc_support     - Check if documentation updates are needed
  auto_labeler    - Auto-label GitLab merge requests

Options:
  --pr-id <id>    - Target specific PR/MR ID

Examples:
  python client.py code_reviewer
  python client.py pr_summarizer --pr-id 123
  python client.py release_notes

Docker Usage:
  # Run inside container
  docker exec -it git-agents python client.py code_reviewer
  
  # Run from host
  python client.py code_reviewer

MCP Server:
  The MCP server runs automatically in the container on port 8080
  This client is for direct one-time executions

Environment:
  Configure .env file with:
  - GITHUB_TOKEN / GITLAB_TOKEN
  - REPO_OWNER / REPO_NAME
  - OPENAI_API_KEY
  - PROVIDER (github/gitlab)

VNC Access:
  Connect to localhost:5900
  Password: secret
  Resolution: 1600x900
""")

async def run_agent(agent_name: str, pr_id: int = None):
    if agent_name not in AGENTS:
        print(f"Unknown agent: {agent_name}")
        print_usage()
        return 1
    
    agent_path = AGENTS[agent_name]
    
    if not os.path.exists(agent_path):
        print(f"Agent file not found: {agent_path}")
        return 1
    
    print(f"\n{'='*60}")
    print(f"Starting {agent_name.replace('_', ' ').title()} Agent")
    print(f"{'='*60}\n")
    
    print(f"Agent: {agent_path}")
    print(f"Provider: {os.getenv('PROVIDER', 'github')}")
    print(f"Repository: {os.getenv('REPO_OWNER')}/{os.getenv('REPO_NAME')}")
    print(f"LLM Model: GPT-4o")
    
    if pr_id:
        print(f"Target PR: #{pr_id}")
    
    print(f"VNC: localhost:5900 (password: secret)")
    print(f"MCP Server: localhost:8080\n")
    
    try:
        exec(open(agent_path).read(), {'__name__': '__main__'})
        return 0
    except KeyboardInterrupt:
        print("\n\n⚠️  Agent interrupted by user")
        return 130
    except Exception as e:
        print(f"\n❌ Agent failed with error: {e}")
        import traceback
        traceback.print_exc()
        return 1

def main():
    if len(sys.argv) < 2:
        print_usage()
        return 1
    
    agent_name = sys.argv[1].lower()
    
    if agent_name in ['help', '-h', '--help']:
        print_usage()
        return 0
    
    if agent_name == 'list':
        print("\n📋 Available agents:")
        for name in AGENTS.keys():
            print(f"  - {name}")
        return 0
    
    pr_id = None
    if len(sys.argv) > 2 and sys.argv[2] == '--pr-id':
        try:
            pr_id = int(sys.argv[3])
        except (IndexError, ValueError):
            print("Invalid PR ID")
            return 1
    
    required_env = ['REPO_OWNER', 'REPO_NAME', 'OPENAI_API_KEY']
    missing = [var for var in required_env if not os.getenv(var)]
    
    if missing:
        print(f"Missing required environment variables: {', '.join(missing)}")
        print("Make sure to set them in .env file or export them")
        return 1
    
    provider = os.getenv('PROVIDER', 'github')
    if provider == 'github' and not os.getenv('GITHUB_TOKEN'):
        print("GITHUB_TOKEN is required when PROVIDER=github")
        return 1
    if provider == 'gitlab' and not os.getenv('GITLAB_TOKEN'):
        print("GITLAB_TOKEN is required when PROVIDER=gitlab")
        return 1
    
    return asyncio.run(run_agent(agent_name, pr_id))

if __name__ == "__main__":
    sys.exit(main())

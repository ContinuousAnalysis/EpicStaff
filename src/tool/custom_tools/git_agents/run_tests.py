import subprocess
import sys
import os
import asyncio
from pathlib import Path

async def run_single_agent(agent_name):
    print(f"\n{'='*60}")
    print(f"Testing {agent_name.replace('_', ' ').title()} Agent")
    print(f"{'='*60}")
    
    try:
        print("Running unit tests...")
        result = subprocess.run([
            sys.executable, '-m', 'pytest', f'agents/{agent_name}/test_{agent_name}.py', '-v'
        ], capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            print("Unit tests passed")
        else:
            print(f"Unit tests failed:\n{result.stdout}\n{result.stderr}")
        
        print(f"Running {agent_name} agent...")
        result = subprocess.run([
            sys.executable, f'agents/{agent_name}/main.py'
        ], capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0:
            print("Agent executed successfully")
            if result.stdout:
                print(f"Output: {result.stdout[-300:]}")
        else:
            print(f"Agent execution issues:\n{result.stderr}")
            
    except subprocess.TimeoutExpired:
        print(f"{agent_name} timed out")
    except Exception as e:
        print(f"Error running {agent_name}: {e}")

async def run_all_tests():
    agents = ['code_reviewer', 'pr_summarizer', 'release_notes', 'doc_support', 'auto_labeler']
    
    print("🧪 Running all Git Agents with GPT-4o integration...")
    print(f"Found {len(agents)} agents to test")
    
    if not os.getenv('OPENAI_API_KEY'):
        print("OPENAI_API_KEY not set - agents will fail")
    
    if not os.getenv('REPO_OWNER') or not os.getenv('REPO_NAME'):
        print("REPO_OWNER and REPO_NAME must be set")
    
    for agent in agents:
        await run_single_agent(agent)
    
    print(f"\nTesting completed for all {len(agents)} agents!")

if __name__ == "__main__":
    asyncio.run(run_all_tests())
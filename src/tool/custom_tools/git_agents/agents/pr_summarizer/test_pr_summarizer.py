import pytest
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from agents.pr_summarizer.main import PRSummarizerAgent

from dotenv import load_dotenv
load_dotenv()

@pytest.mark.asyncio
async def test_pr_summarizer_with_gpt4o():
    agent = PRSummarizerAgent()
    
    assert agent.llm.model == "gpt-4o"
    
    class MockClient:
        async def get_recent_pull_requests(self):
            return [{
                'id': 1,
                'title': 'Add user authentication system',
                'description': ''
            }]
        
        async def get_diff(self, pr_id):
            return "+def login(username, password):\n+    return authenticate(username, password)\n+class AuthMiddleware:\n+    pass"
        
        async def get_changed_files(self, pr_id):
            return ['auth.py', 'middleware.py']
        
        async def update_description(self, pr_id, description):
            assert "GPT-4o" in description
            assert len(description) > 100
            print(f"Updated description: {description[:150]}...")
    
    class MockLLM:
        model = "gpt-4o"
        
        async def summarize_pr(self, title, diff, files):
            return """## Summary
Implements user authentication system with login functionality and middleware.

## Type of Change
- New Feature

## Key Changes
- Added login function with username/password authentication
- Created AuthMiddleware class for request handling
- Enhanced security with proper authentication flow

## Files Modified
- `auth.py` - Core authentication logic
- `middleware.py` - Authentication middleware"""
    
    agent.client = MockClient()
    agent.llm = MockLLM()
    await agent.run()
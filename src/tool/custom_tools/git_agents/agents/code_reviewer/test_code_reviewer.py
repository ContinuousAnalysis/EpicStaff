import pytest
import asyncio
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from playwright.async_api import async_playwright
from agents.code_reviewer.main import CodeReviewAgent

from dotenv import load_dotenv
load_dotenv()

@pytest.mark.asyncio
async def test_code_review_agent_with_gpt4o():
    agent = CodeReviewAgent()
    
    assert agent.llm.model == "gpt-4o"
    
    class MockClient:
        async def get_open_pull_requests(self):
            return [{
                'id': 1,
                'title': 'Test PR with potential issues',
                'description': 'Testing code review'
            }]
        
        async def get_diff(self, pr_id):
            return """
+def slow_function():
+    for user in User.objects.all():
+        user.profile.save()  # N+1 query
+    password = "hardcoded123"  # Security issue
+    eval(user_input)  # Security vulnerability
            """
        
        async def get_changed_files(self, pr_id):
            return ['models.py', 'views.py']
        
        async def add_review_comment(self, pr_id, comment):
            assert "GPT-4o" in comment
            print(f"Review comment: {comment[:200]}...")
    
    class MockLLM:
        model = "gpt-4o"
        
        async def analyze_code(self, diff, pr_context):
            return [
                "Potential N+1 query detected in user loop",
                "Hardcoded password found - use environment variables",
                "eval() usage is dangerous - avoid dynamic code execution"
            ]
    
    agent.client = MockClient()
    agent.llm = MockLLM()
    await agent.run()

@pytest.mark.asyncio
async def test_browser_integration():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        await page.goto('https://github.com')
        title = await page.title()
        assert 'GitHub' in title
        
        await browser.close()
import pytest
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from agents.auto_labeler.main import AutoLabelerAgent

from dotenv import load_dotenv
load_dotenv()

@pytest.mark.asyncio
async def test_auto_labeler_with_gpt4o():
    agent = AutoLabelerAgent()
    
    assert agent.llm.model == "gpt-4o"
    
    class MockClient:
        async def get_unlabeled_pull_requests(self):
            return [
                {'id': 1, 'title': 'fix: Critical security vulnerability in auth system'},
                {'id': 2, 'title': 'feat: Add user dashboard with performance metrics'},
                {'id': 3, 'title': 'docs: Update API documentation and examples'}
            ]
        
        async def get_diff(self, pr_id):
            diffs = {
                1: "-    if password == stored_password:\n+    if bcrypt.checkpw(password, stored_password):",
                2: "+def render_dashboard():\n+    metrics = get_performance_data()\n+    return render_template('dashboard.html')",
                3: "# API Documentation\n+## New Endpoints\n+### GET /api/users"
            }
            return diffs.get(pr_id, "")
        
        async def add_label(self, pr_id, label):
            expected_labels = {
                1: ['bug', 'security'],
                2: ['feature', 'performance'],
                3: ['documentation']
            }
            assert label in expected_labels.get(pr_id, [])
            print(f"Added label '{label}' to MR !{pr_id}")
    
    class MockLLM:
        model = "gpt-4o"
        
        async def suggest_labels(self, title, diff):
            if 'fix' in title.lower() and 'security' in title.lower():
                return ['bug', 'security']
            elif 'feat' in title.lower() and 'performance' in title.lower():
                return ['feature', 'performance']
            elif 'docs' in title.lower():
                return ['documentation']
            return ['enhancement']
    
    agent.client = MockClient()
    agent.llm = MockLLM()
    await agent.run()
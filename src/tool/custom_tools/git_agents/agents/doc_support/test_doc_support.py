import pytest
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from agents.doc_support.main import DocSupportAgent

from dotenv import load_dotenv
load_dotenv()

@pytest.mark.asyncio
async def test_doc_support_with_gpt4o():
    agent = DocSupportAgent()
    
    assert agent.llm.model == "gpt-4o"
    
    class MockClient:
        async def get_open_pull_requests(self):
            return [{'id': 1, 'title': 'Add new REST API endpoints for user management'}]
        
        async def get_changed_files(self, pr_id):
            return ['api/users.py', 'api/auth.py', 'models/user.py']
        
        async def get_diff(self, pr_id):
            return """
+class UserAPI:
+    def create_user(self, data):
+        '''Create a new user account'''
+        pass
+    
+    def update_user(self, user_id, data):
+        '''Update existing user information'''
+        pass
+
+@app.route('/api/v2/users', methods=['POST'])
+def create_user_endpoint():
+    pass
            """
        
        async def add_label(self, pr_id, label):
            assert label == 'needs-docs'
            print(f"Added label: {label}")
        
        async def add_comment(self, pr_id, comment):
            assert 'Documentation Update Needed' in comment
            assert 'Documentation Support Agent' in comment
            assert 'API Reference' in comment
            print(f"Doc reminder: {comment[:200]}...")
    
    class MockLLM:
        model = "gpt-4o"
        
        async def check_doc_needs(self, files, diff):
            return {
                'needs_update': True,
                'reason': 'New public API endpoints added that require documentation',
                'suggested_sections': ['API Reference', 'User Management Guide', 'Authentication'],
                'priority': 'high'
            }
    
    agent.client = MockClient()
    agent.llm = MockLLM()
    await agent.run()
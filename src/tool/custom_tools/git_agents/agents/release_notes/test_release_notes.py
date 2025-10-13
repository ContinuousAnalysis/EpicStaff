import pytest
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from agents.release_notes.main import ReleaseNotesAgent

from dotenv import load_dotenv
load_dotenv()

@pytest.mark.asyncio
async def test_release_notes_with_gpt4o():
    agent = ReleaseNotesAgent()
    
    assert agent.llm.model == "gpt-4o"
    
    class MockClient:
        async def get_merged_since_last_release(self):
            return [
                {'id': 1, 'title': 'feat: Add user dashboard with analytics'},
                {'id': 2, 'title': 'fix: Resolve critical login timeout issue'},
                {'id': 3, 'title': 'BREAKING: Change API response format to v2'},
                {'id': 4, 'title': 'docs: Update API documentation'},
                {'id': 5, 'title': 'refactor: Optimize database queries'}
            ]
        
        async def create_draft_release(self, notes):
            assert "GPT-4o" in notes
            assert "Breaking Changes" in notes or "Features" in notes
            assert len(notes) > 200
            print(f"Release notes created: {notes[:300]}...")
    
    class MockLLM:
        model = "gpt-4o"
        
        async def generate_release_notes(self, prs):
            return """# Release Notes v2.1.0

This release introduces exciting new features, critical bug fixes, and important API changes.

## Breaking Changes
- **API Format Update**: Changed API response format to v2 for better consistency (#3)
  - Update your client code to handle new response structure
  - Migration guide available in documentation

## New Features  
- **User Dashboard**: Added comprehensive analytics dashboard with real-time metrics (#1)
  - Interactive charts and graphs
  - Customizable widgets
  - Export functionality

## Bug Fixes
- **Login System**: Resolved critical timeout issue affecting user sessions (#2)
  - Improved session handling
  - Better error messages

## Documentation
- Updated API documentation with new endpoints and examples (#4)

## Internal Improvements
- Optimized database queries for 40% better performance (#5)"""
    
    agent.client = MockClient()
    agent.llm = MockLLM()
    await agent.run()
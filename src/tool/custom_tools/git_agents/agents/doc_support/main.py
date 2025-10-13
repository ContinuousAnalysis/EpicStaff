import asyncio
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from agents.doc_support.config import Config, Provider
from shared.github_client import GitHubClient
from shared.gitlab_client import GitLabClient
from shared.llm_client import LLMClient
from shared.cli_args import parse_pr_args

class DocSupportAgent:
    def __init__(self):
        self.config = Config()
        self.llm = LLMClient(self.config.openai_api_key, model="gpt-4o")
        
        if self.config.provider == Provider.GITHUB:
            self.client = GitHubClient(
                self.config.github_token,
                self.config.repo_owner,
                self.config.repo_name
            )
        else:
            self.client = GitLabClient(
                self.config.gitlab_token,
                self.config.gitlab_url,
                self.config.repo_owner,
                self.config.repo_name
            )
    
    async def run(self):
        pr_numbers = parse_pr_args()
        
        if pr_numbers:
            print(f"Starting Documentation Support Agent for PRs: {', '.join(map(str, pr_numbers))}")
        else:
            print("Starting Documentation Support Agent for all open PRs...")
        prs = await self.client.get_pull_requests(pr_numbers)
        
        if not prs:
            print("No open pull requests found")
            return
        
        for pr in prs:
            await self._process_pr(pr)
    
    async def _process_pr(self, pr):
        print(f"\nChecking docs for PR #{pr['id']}: {pr['title']}")
        
        files = await self.client.get_changed_files(pr['id'])
        diff = await self.client.get_diff(pr['id'])
        
        if not diff.strip():
            print("No diff found, skipping...")
            return
        
        print("Analyzing documentation needs...")
        doc_analysis = await self.llm.check_doc_needs(files, diff)
        
        if doc_analysis['needs_update']:
            await self.client.add_label(pr['id'], 'needs-docs')
            
            priority = doc_analysis.get('priority', 'medium')
            priority_emoji = {
                'high': '🚨',
                'medium': '⚠️', 
                'low': 'ℹ️'
            }.get(priority, '📚')
            
            sections = doc_analysis.get('suggested_sections', ['Documentation'])
            sections_text = '\n'.join(f'- {section}' for section in sections)
            
            comment = f"""## {priority_emoji} Documentation Update Needed

**Reason:** {doc_analysis['reason']}

**Priority:** {priority.upper()}

**Suggested sections to update:**
{sections_text}

*Analysis performed by Documentation Support Agent*"""
            
            await self.client.add_comment(pr['id'], comment)
            print(f"✓ Documentation reminder added (Priority: {priority})")
        else:
            print("✓ No documentation updates needed")

if __name__ == "__main__":
    agent = DocSupportAgent()
    asyncio.run(agent.run())

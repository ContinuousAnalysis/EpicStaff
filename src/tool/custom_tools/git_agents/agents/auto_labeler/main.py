import asyncio
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from agents.auto_labeler.config import Config, Provider
from shared.gitlab_client import GitLabClient
from shared.llm_client import LLMClient
from shared.cli_args import parse_pr_args

class AutoLabelerAgent:
    def __init__(self):
        self.config = Config()
        self.llm = LLMClient(self.config.openai_api_key, model="gpt-4o")
        
        if self.config.provider != Provider.GITLAB:
            print("Auto Labeler only works with GitLab, switching provider...")
            self.config.provider = Provider.GITLAB
            
        self.client = GitLabClient(
            self.config.gitlab_token,
            self.config.gitlab_url,
            self.config.repo_owner,
            self.config.repo_name
        )
    
    async def run(self):
        pr_numbers = parse_pr_args()
        
        if pr_numbers:
            print(f"Starting Auto Labeler Agent for MRs: {', '.join(map(str, pr_numbers))}")
            prs = await self.client.get_pull_requests(pr_numbers)
        else:
            print("Starting Auto Labeler Agent for unlabeled MRs...")
            prs = await self.client.get_unlabeled_pull_requests()
        
        if not prs:
            print("No merge requests found")
            return
        
        for pr in prs:
            await self._process_pr(pr)
    
    async def _process_pr(self, pr):
        print(f"\nLabeling MR !{pr['id']}: {pr['title']}")
        
        diff = await self.client.get_diff(pr['id'])
        
        if not diff.strip():
            print("No diff found, using title-based labeling...")
            diff = "No code changes"
        
        print("Suggesting labels...")
        labels = await self.llm.suggest_labels(pr['title'], diff)
        
        for label in labels:
            try:
                await self.client.add_label(pr['id'], label)
            except Exception as e:
                print(f"Failed to add label '{label}': {e}")
        
        print(f"✓ Added labels: {', '.join(labels)}")

if __name__ == "__main__":
    agent = AutoLabelerAgent()
    asyncio.run(agent.run())
import openai
from pydantic import BaseModel
from typing import List, Dict, Any
import json

class LLMClient:
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.client = openai.OpenAI(api_key=api_key)
        self.model = model
        print(f"Initialized LLM Client with {model}")
    
    async def analyze_code(self, diff: str, pr_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Analyze code and return structured issues with location info."""
        prompt = f"""
You are an expert code reviewer. Analyze this code diff for issues and provide actionable feedback.

Context:
- Title: {pr_context.get('title', '')}
- Files: {', '.join(pr_context.get('files', []))}

Code diff:
{diff}

Analyze for:
1. Performance issues (N+1 queries, blocking operations, memory leaks)
2. Security vulnerabilities (hardcoded secrets, unsafe operations, injection risks)
3. Code quality (complexity, maintainability, best practices)
4. Style violations (line length, naming conventions)

Return ONLY valid JSON array of issue objects. Each issue must have this structure:
{{
  "type": "inline",
  "file": "path/to/file.py",
  "line": 45,
  "issue": "Hardcoded password detected - use environment variables",
  "severity": "high"
}}

OR for general issues without specific line:
{{
  "type": "general",
  "issue": "Overall code complexity is high - consider refactoring",
  "severity": "medium"
}}

Severity levels: critical, high, medium, low
IMPORTANT: Only include "file" and "line" if you can EXACTLY identify them from the diff.
If no issues found, return empty array [].

Example response:
[
  {{
    "type": "inline",
    "file": "auth.py",
    "line": 23,
    "issue": "Hardcoded password 'admin123' - use environment variables",
    "severity": "critical"
  }},
  {{
    "type": "general",
    "issue": "Missing error handling for database operations",
    "severity": "medium"
  }}
]
"""
        response = await self._call_llm(prompt)
        
        response = response.strip()
        if response.startswith('```'):
            lines = response.split('\n')
            response = '\n'.join(lines[1:-1]) if len(lines) > 2 else response
            response = response.replace('```json', '').replace('```', '').strip()
        
        try:
            issues = json.loads(response)
            if isinstance(issues, list):
                validated_issues = []
                for issue in issues:
                    if isinstance(issue, dict) and 'type' in issue and 'issue' in issue:
                        validated_issues.append(issue)
                    elif isinstance(issue, str):
                        validated_issues.append({
                            'type': 'general',
                            'issue': issue,
                            'severity': 'medium'
                        })
                return validated_issues
            return []
        except json.JSONDecodeError as e:
            print(f"Warning: Could not parse LLM response as JSON: {e}")
            return []
    
    async def summarize_pr(self, title: str, diff: str, files: List[str]) -> str:
        prompt = f"""
        Create a comprehensive PR summary for this pull request.

        Title: {title}
        Files changed: {', '.join(files[:10])}
        Code changes preview:
        {diff[:2000]}

        Generate a markdown summary with:
        1. ## Summary - Brief description of what this PR does
        2. ## Type of Change - (feature/bugfix/documentation/refactor/breaking)
        3. ## Key Changes - Bullet list of main modifications
        4. ## Files Modified - List of key files changed
        5. ## Testing - Notes about testing needs or coverage

        Keep it concise but informative. Focus on what reviewers need to know.
        """
        return await self._call_llm(prompt)
    
    async def generate_release_notes(self, prs: List[Dict]) -> str:
        pr_list = '\n'.join([f"- {pr['title']} (#{pr['id']})" for pr in prs])
        
        prompt = f"""
        Generate professional release notes from these merged pull requests:

        {pr_list}

        Create sections for:
        - **Breaking Changes** (PRs with "BREAKING" or major API changes)
        - **New Features** (new functionality, enhancements)
        - **Bug Fixes** (fixes, patches)
        - **Documentation** (docs, readme updates)
        - **Internal Changes** (refactoring, deps)

        Use clear, user-facing language. Group similar changes together.
        Start with a brief release summary paragraph.
        """
        return await self._call_llm(prompt)
    
    async def check_doc_needs(self, files: List[str], diff: str) -> Dict[str, Any]:
        prompt = f"""
        Analyze if this code change requires documentation updates.

        Changed files: {', '.join(files)}
        Code changes:
        {diff[:1500]}

        Consider:
        - New public APIs, classes, or methods
        - Changed function signatures or behavior
        - New configuration options
        - Breaking changes
        - New features requiring user guidance

        Return ONLY valid JSON with this exact structure:
        {{
        "needs_update": true,
        "reason": "Brief explanation in plain text without JSON formatting",
        "suggested_sections": ["API Reference", "User Guide"],
        "priority": "high"
        }}

        Priority must be one of: high, medium, low
        If no doc updates needed, return:
        {{
        "needs_update": false,
        "reason": "No public API changes detected",
        "suggested_sections": [],
        "priority": "none"
        }}
        """
        response = await self._call_llm(prompt)
        
        response = response.strip()
        if response.startswith('```'):
            lines = response.split('\n')
            response = '\n'.join(lines[1:-1]) if len(lines) > 2 else response
            response = response.replace('```json', '').replace('```', '').strip()
        
        try:
            result = json.loads(response)
            
            if not isinstance(result, dict):
                raise ValueError("Response is not a dictionary")
            
            return {
                "needs_update": bool(result.get("needs_update", True)),
                "reason": str(result.get("reason", "Documentation review recommended")),
                "suggested_sections": result.get("suggested_sections", ["Documentation"]),
                "priority": result.get("priority", "medium")
            }
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Warning: Could not parse LLM response as JSON: {e}")
            return {
                "needs_update": True,
                "reason": "Documentation review recommended based on code changes",
                "suggested_sections": ["Documentation"],
                "priority": "medium"
            }
    
    async def suggest_labels(self, title: str, diff: str) -> List[str]:
        prompt = f"""
        Suggest appropriate GitLab labels for this merge request.

        Title: {title}
        Code changes:
        {diff[:1000]}

        Available labels: bug, feature, documentation, testing, refactoring, security, performance, breaking-change, enhancement

        Analyze the title and changes to suggest 1-3 most relevant labels.
        Return JSON array of labels.

        Examples:
        - "fix: resolve login issue" → ["bug"]
        - "feat: add user dashboard" → ["feature", "enhancement"]
        - "docs: update API guide" → ["documentation"]
        - "refactor: improve performance" → ["refactoring", "performance"]
        """
        response = await self._call_llm(prompt)
        try:
            import json
            labels = json.loads(response)
            return labels if isinstance(labels, list) else ["enhancement"]
        except:
            title_lower = title.lower()
            if 'fix' in title_lower or 'bug' in title_lower:
                return ['bug']
            elif 'feat' in title_lower or 'add' in title_lower:
                return ['feature']
            elif 'doc' in title_lower:
                return ['documentation']
            return ['enhancement']
    
    async def _call_llm(self, prompt: str) -> str:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=2000
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"LLM API error: {e}")
            return f"Error calling {self.model}: {str(e)}"
        
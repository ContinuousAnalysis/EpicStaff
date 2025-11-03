import os
import subprocess
import json
from typing import Any, Dict, Optional
import asyncio


class GitHubMCPClient:
    """Client for communicating with GitHub MCP Server."""
    
    def __init__(self):
        self.container_name = os.getenv('GITHUB_MCP_CONTAINER', 'github-mcp')
        self.request_id = 0
    
    def _get_next_id(self) -> int:
        """Get next request ID."""
        self.request_id += 1
        return self.request_id
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Call MCP tool via docker exec.
        
        Args:
            tool_name: Name of the MCP tool
            arguments: Tool arguments
            
        Returns:
            Tool result
        """
        request = {
            "jsonrpc": "2.0",
            "id": self._get_next_id(),
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        
        request_json = json.dumps(request)
        
        # Execute docker exec to communicate with MCP server
        cmd = [
            "docker", "exec", "-i", self.container_name,
            "/bin/sh", "-c", f"echo '{request_json}'"
        ]
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                raise Exception(f"MCP call failed: {result.stderr}")
            
            response = json.loads(result.stdout)
            
            if "error" in response:
                raise Exception(f"MCP error: {response['error']}")
            
            return response.get("result", {})
            
        except subprocess.TimeoutExpired:
            raise Exception("MCP call timeout")
        except json.JSONDecodeError as e:
            raise Exception(f"Invalid MCP response: {e}")
    
    async def list_tools(self) -> list:
        """List all available MCP tools.
        
        Returns:
            List of available tools
        """
        request = {
            "jsonrpc": "2.0",
            "id": self._get_next_id(),
            "method": "tools/list",
            "params": {}
        }
        
        request_json = json.dumps(request)
        
        cmd = [
            "docker", "exec", "-i", self.container_name,
            "/bin/sh", "-c", f"echo '{request_json}'"
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            response = json.loads(result.stdout)
            return response.get("result", {}).get("tools", [])
        except Exception as e:
            raise Exception(f"Failed to list tools: {e}")


# Convenience functions for common operations

async def get_pr_info(pr_number: int, owner: str, repo: str) -> Dict[str, Any]:
    """Get pull request information.
    
    Args:
        pr_number: PR number
        owner: Repository owner
        repo: Repository name
        
    Returns:
        PR information
    """
    client = GitHubMCPClient()
    return await client.call_tool("get_pull_request", {
        "owner": owner,
        "repo": repo,
        "pull_number": pr_number
    })


async def get_pr_files(pr_number: int, owner: str, repo: str) -> list:
    """Get list of changed files in PR.
    
    Args:
        pr_number: PR number
        owner: Repository owner
        repo: Repository name
        
    Returns:
        List of changed files
    """
    client = GitHubMCPClient()
    return await client.call_tool("list_pull_request_files", {
        "owner": owner,
        "repo": repo,
        "pull_number": pr_number
    })


async def create_pr_review_comment(
    pr_number: int,
    owner: str,
    repo: str,
    body: str,
    commit_id: str,
    path: str,
    line: int
) -> Dict[str, Any]:
    """Create inline review comment on PR.
    
    Args:
        pr_number: PR number
        owner: Repository owner
        repo: Repository name
        body: Comment text
        commit_id: Commit SHA
        path: File path
        line: Line number
        
    Returns:
        Created comment
    """
    client = GitHubMCPClient()
    return await client.call_tool("create_review_comment", {
        "owner": owner,
        "repo": repo,
        "pull_number": pr_number,
        "body": body,
        "commit_id": commit_id,
        "path": path,
        "line": line
    })


async def create_issue_comment(
    pr_number: int,
    owner: str,
    repo: str,
    body: str
) -> Dict[str, Any]:
    """Create general comment on PR.
    
    Args:
        pr_number: PR number
        owner: Repository owner
        repo: Repository name
        body: Comment text
        
    Returns:
        Created comment
    """
    client = GitHubMCPClient()
    return await client.call_tool("create_issue_comment", {
        "owner": owner,
        "repo": repo,
        "issue_number": pr_number,
        "body": body
    })


async def add_labels_to_pr(
    pr_number: int,
    owner: str,
    repo: str,
    labels: list
) -> Dict[str, Any]:
    """Add labels to PR.
    
    Args:
        pr_number: PR number
        owner: Repository owner
        repo: Repository name
        labels: List of label names
        
    Returns:
        Updated labels
    """
    client = GitHubMCPClient()
    return await client.call_tool("add_labels", {
        "owner": owner,
        "repo": repo,
        "issue_number": pr_number,
        "labels": labels
    })
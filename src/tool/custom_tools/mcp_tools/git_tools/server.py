from typing import Any, Dict, List, Literal, Optional
from fastmcp import FastMCP

from src import BaseClient, GitLabClient, GitHubClient, ClientFactory

mcp = FastMCP("GitTools")


@mcp.tool
async def get_open_pull_requests(
    client_type: Literal["github", "gitlab"], token: str, owner: str, repo_name: str
) -> List[Dict[str, Any]]:
    """Get all opened pull requests"""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.get_open_pull_requests()


@mcp.tool
async def get_pull_requests_by_numbers(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
    pr_numbers: List[int],
) -> List[Dict[str, Any]]:
    """Get specific PRs by their numbers."""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.get_pull_requests_by_numbers(pr_numbers)


@mcp.tool
async def get_recent_pull_requests(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
) -> List[Dict[str, Any]]:
    """Get recent pull requests."""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.get_recent_pull_requests()


@mcp.tool
async def get_merged_since_last_release(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
) -> List[Dict[str, Any]]:
    "Get merged pull requests since last release"
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.get_merged_since_last_release()


@mcp.tool
async def get_unlabeled_pull_requests(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
) -> List[Dict[str, Any]]:
    """Get unlabeled pull requests"""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.get_unlabeled_pull_requests()


@mcp.tool
async def get_diff(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
    pr_id: int,
) -> List[Dict[str, Any]]:
    """Get diff by pull request"""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.get_diff(pr_id)


@mcp.tool
async def get_changed_files(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
    pr_id: int,
) -> List[str]:
    """Get changed files by pull request id"""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.get_changed_files(pr_id)


@mcp.tool
async def add_review_comment(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
    pr_id: int,
    comment: str,
):
    """Add comment to pull request"""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.add_review_comment(pr_id, comment)


@mcp.tool
async def add_inline_comment(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
    pr_id: int,
    file_path: str,
    line: int,
    comment: str,
):
    """Add inline comment to pull request in specific file and line"""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.add_inline_comment(
        pr_id=pr_id, file_path=file_path, line=line, comment=comment
    )


@mcp.tool
async def add_comment(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
    pr_id: int,
    comment: str,
):
    """Add comment to pull request"""

    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.add_comment(pr_id=pr_id, comment=comment)


@mcp.tool
async def add_label(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
    pr_id: int,
    label: str,
):
    """Add label to pull request"""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.add_label(pr_id=pr_id, label=label)


@mcp.tool
async def update_description(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
    pr_id: int,
    description: str,
):
    """Update pull request description"""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.update_description(pr_id=pr_id, description=description)


@mcp.tool
async def create_draft_release(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
    notes: str,
    release_type: Literal["major", "minor", "patch"] = "patch",
):
    """Create draft release with notes"""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.create_draft_release(notes=notes, release_type=release_type)


@mcp.tool
async def get_pull_requests(
    client_type: Literal["github", "gitlab"],
    token: str,
    owner: str,
    repo_name: str,
    pr_numbers: Optional[List[int]] = None,
) -> List[Dict[str, Any]]:
    """Get pull reuqests."""
    client = ClientFactory.create_client(
        client_type=client_type, token=token, owner=owner, repo_name=repo_name
    )
    return await client.get_pull_requests(pr_numbers=pr_numbers)


if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=8000)

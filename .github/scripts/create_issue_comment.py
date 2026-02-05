import os
import requests
from requests.auth import HTTPBasicAuth
import json


class JiraAPIError(Exception):
    """Exception raised for Jira API errors"""

    pass


def create_issue_comment(
    domain: str,
    auth: HTTPBasicAuth,
    jira_issue_key: str,
    github_comment_body: str,
    github_comment_author: str,
    github_comment_url: str,
):
    url = f"https://{domain}/rest/api/2/issue/{jira_issue_key}/comment"
    headers = {"Accept": "application/json", "Content-Type": "application/json"}

    author = f"Author: {github_comment_author}\n\n"
    body = f"Body:\n{github_comment_body}\n\n"
    link = f"Comment link: {github_comment_url}"

    payload = json.dumps({"body": author + body + link})

    try:
        response = requests.request(
            "POST", url, data=payload, headers=headers, auth=auth
        )
        print(response)
    except requests.exceptions.RequestException as e:
        raise JiraAPIError(f"Network error while creating Jira issue: {e}")
    except json.JSONDecodeError as e:
        raise JiraAPIError(f"Invalid JSON response from Jira API: {e}")
    except Exception as e:
        print(f"Exception: {e}")


def main():
    jira_domain = os.getenv("JIRA_BASE_URL")
    jira_api_token = os.getenv("JIRA_API_TOKEN")
    jira_email = os.getenv("JIRA_USER_EMAIL")
    action_type = os.getenv("ACTION_TYPE")
    jira_issue_key = os.getenv("JIRA_ISSUE_KEY")
    github_comment_body = os.getenv("GITHUB_COMMENT_BODY")
    github_comment_author = os.getenv("GITHUB_COMMENT_AUTHOR")
    github_comment_url = os.getenv("GITHUB_COMMENT_URL")

    if not jira_domain or not jira_api_token or not jira_email:
        raise ValueError("One or more required environment variables are missing.")
    auth = HTTPBasicAuth(jira_email, jira_api_token)

    if action_type == "create_issue_comment":
        create_issue_comment(
            domain=jira_domain,
            auth=auth,
            jira_issue_key=jira_issue_key,
            github_comment_body=github_comment_body,
            github_comment_author=github_comment_author,
            github_comment_url=github_comment_url,
        )


if __name__ == "__main__":
    main()

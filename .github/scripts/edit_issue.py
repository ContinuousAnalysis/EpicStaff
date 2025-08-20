import os
import requests
from requests.auth import HTTPBasicAuth
import json
from typing import Optional


class JiraAPIError(Exception):
    """Exception raised for Jira API errors"""

    pass


def sync_edit_issue(
    domain: str,
    auth: HTTPBasicAuth,
    jira_issue_key: str,
    github_issue_title: str,
    github_issue_body: str,
    github_issue_url: str,
) -> Optional[str]:

    url = f"https://{domain}/rest/api/3/issue/{jira_issue_key}"
    headers = {"Accept": "application/json", "Content-Type": "application/json"}

    payload = {
        "fields": {
            "description": {
                "content": [
                    {
                        "content": [
                            {
                                "text": github_issue_body + "\n\n",
                                "type": "text",
                            },
                            {
                                "type": "text",
                                "text": "Open GitHub Issue",
                                "marks": [
                                    {
                                        "type": "link",
                                        "attrs": {"href": github_issue_url},
                                    }
                                ],
                            },
                        ],
                        "type": "paragraph",
                    }
                ],
                "type": "doc",
                "version": 1,
            },
            "summary": github_issue_title,
        },
        "update": {},
    }

    try:
        response = requests.request(
            "PUT", url, data=json.dumps(payload), headers=headers, auth=auth, timeout=30
        )

        print(response)

    except requests.exceptions.RequestException as e:
        raise JiraAPIError(f"Network error while creating Jira issue: {e}")
    except json.JSONDecodeError as e:
        raise JiraAPIError(f"Invalid JSON response from Jira API: {e}")


def main():
    jira_domain = os.getenv("JIRA_BASE_URL")
    jira_api_token = os.getenv("JIRA_API_TOKEN")
    jira_email = os.getenv("JIRA_USER_EMAIL")
    action_type = os.getenv("ACTION_TYPE")
    jira_issue_key = os.getenv("JIRA_ISSUE_KEY")
    github_issue_title = os.getenv("GITHUB_ISSUE_TITLE")
    github_issue_body = os.getenv("GITHUB_ISSUE_BODY")
    github_issue_url = os.getenv("GITHUB_ISSUE_URL")

    if not jira_domain or not jira_api_token or not jira_email:
        raise ValueError("One or more required environment variables are missing.")
    auth = HTTPBasicAuth(jira_email, jira_api_token)

    if action_type == "edit_issue":
        sync_edit_issue(
            domain=jira_domain,
            auth=auth,
            jira_issue_key=jira_issue_key,
            github_issue_title=github_issue_title,
            github_issue_body=github_issue_body,
            github_issue_url=github_issue_url,
        )


if __name__ == "__main__":
    main()

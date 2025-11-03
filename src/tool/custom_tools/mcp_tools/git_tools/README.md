## Run command
`docker compose up`

### Available methods:
- get_open_pull_requests
- get_pull_requests_by_numbers
- get_recent_pull_requests
- get_merged_since_last_release
- get_unlabeled_pull_requests
- get_diff
- get_changed_files
- add_review_comment
- add_inline_comment
- add_comment
- add_label
- update_description
- create_draft_release
- get_pull_requests

## How to run project in Epicstaff

1. Generate Github/Gitlab tokens
-Github token scopes: repo, workflow
-Gitlab token scopes: api, write_repository, read_api
2. Fill in next info in Domain Variables:
"platform": "gitlab", # or github
"pull_number": "", #number of PR/MR you want to work with
"gitlab_url": "https://gitlab.com",
"gitlab_owner": "", #name of your gitlab profile
"gitlab_repo": "", #name of your gitlab repo
"github_owner": "", #name of your github profile
"github_repo": "", name of your gitlab repo
"github_token": "",
"gitlab_token": ""
3. Run the agent

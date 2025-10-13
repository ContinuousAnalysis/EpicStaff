from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from enum import Enum

class Provider(str, Enum):
    GITHUB = "github"
    GITLAB = "gitlab"

class Config(BaseSettings):
    model_config = ConfigDict(extra='ignore', env_file='.env')
    provider: Provider = Provider.GITHUB
    github_token: str = ""
    gitlab_token: str = ""
    gitlab_url: str = "https://gitlab.com"
    repo_owner: str
    repo_name: str
    openai_api_key: str
    
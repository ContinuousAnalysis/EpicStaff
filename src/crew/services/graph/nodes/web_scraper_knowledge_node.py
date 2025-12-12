from services.graph.events import StopEvent
from services.graph.nodes.python_node import PythonNode
from models.request_models import PythonCodeData
from services.run_python_code_service import RunPythonCodeService


class WebScraperKnowledgeNode(PythonNode):
    TYPE = "WEB_SCRAPER"

    def __init__( 
        self, 
        session_id: int, 
        node_name: str, 
        stop_event: StopEvent, 
        input_map: dict, 
        output_variable_path: str, 
        python_code_executor_service: RunPythonCodeService, 
        collection_name: str,
        time_to_expired: int,
        embedder: int
        ):
            self.embedder = embedder 

            urls = list(input_map.keys())
            code_data = PythonCodeData(
                venv_name="default",
                code=self._get_extractor_code(urls, collection_name, time_to_expired, embedder),
                entrypoint="main",
                libraries = ["loguru", "requests", "tldextract", "aiohttp", "beautifulsoup4", "readability-lxml"],
            )

            super().__init__(
                session_id=session_id,
                node_name=node_name,
                stop_event=stop_event,
                input_map=input_map,
                output_variable_path=output_variable_path,
                python_code_executor_service=python_code_executor_service,
                python_code_data=code_data,
            )

    def _get_extractor_code(self, urls: list[str], collection_name: str, time_to_expired: int, embedder: int):
        return f"""
import os
import time
import json
import random
import asyncio
from loguru import logger
from datetime import datetime, timezone
import requests
import tldextract
import shutil
import aiohttp
from readability import Document
from bs4 import BeautifulSoup

HEADERS_LIST = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
]
API_BASE = "http://host.docker.internal:8000/api"

def get_collection_by_name(name: str):
    r = requests.get(f"{{API_BASE}}/source-collections/")
    r.raise_for_status()
    results = r.json().get("results", [])
    matched = [col for col in results if col.get("collection_name") == name]
    return matched[0] if matched else None

def create_collection(collection_name: str, file_names: list[str], embedder: int, urls: list[str]):
    data = {{
        "collection_name": collection_name,
        "embedder": embedder,
        "description": json.dumps(urls),
        "chunk_sizes": [1000] * len(file_names),
        "chunk_strategies": ["token"] * len(file_names),
        "chunk_overlaps": [200] * len(file_names),
        "additional_params": [{{}} for _ in file_names],
    }}

    opened_files = []
    for fpath in file_names:
        f = open(fpath, "rb")
        opened_files.append(("files", (os.path.basename(fpath), f, "text/plain")))
    
    try:
        r = requests.post(f"{{API_BASE}}/source-collections/", data=data, files=opened_files)
        r.raise_for_status()
        return wait_collection(collection_name)
    except Exception as e:
        logger.error(e)
    finally:
        for _, (_, file_obj, _) in opened_files:
            file_obj.close()

def wait_collection(collection_name: str, max_wait: int= 60, wait_interval: int= 2):
    waited = 0
    collection = get_collection_by_name(collection_name)
    while collection is None:
        if waited >= max_wait:
            result = f"Collection '{{collection_name}}' did not appear after {{max_wait}} seconds"
            logger.error(result)
            return result
        time.sleep(wait_interval)
        waited += wait_interval
        collection = get_collection_by_name(collection_name)
    return collection

def wait_completed(collection_name: str, max_wait: int= 60, wait_interval: int= 2):
    waited = 0
    collection = get_collection_by_name(collection_name)
    url = f"{{API_BASE}}/collection_statuses/?collection_id={{collection['collection_id']}}"
    while True:
        if waited >= max_wait:
            result = f"Collection '{{collection_name}}' was not completed after {{max_wait}} seconds"
            logger.error(result)
            return result
        r = requests.get(url).json()
        if r["results"][0]["collection_status"] == "completed":
            return r["results"][0]
        waited += wait_interval
        time.sleep(wait_interval)

    

def is_collection_expired(collection: dict, time_to_expired: int):
    if time_to_expired == -1:
        return False
    try:
        dt = datetime.fromisoformat(collection["created_at"].replace("Z", "+00:00"))
    except Exception as e:
        logger.error(f"Failed to parse created_at '{{collection.get('created_at')}}': {{e}}")
        return True
    return (datetime.now(timezone.utc) - dt).total_seconds() / 60 > time_to_expired

def prepare_save_folder(collection_name: str):
    base_dir = os.path.join("savefiles", collection_name)
    os.makedirs(base_dir, exist_ok=True)
    return base_dir

def save_scraped_file(base_dir: str, url: str, content: str):
    parsed = tldextract.extract(url)
    filename = f"scraped_file_{{parsed.domain}}_{{datetime.now().strftime('%Y%m%d')}}.txt"
    filepath = os.path.join(base_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    return filepath

async def fetch(session: aiohttp.ClientSession, url: str):
    headers = {{"User-Agent": random.choice(HEADERS_LIST)}}
    try:
        async with session.get(url, headers=headers, timeout=30) as response:
            return await response.text()
    except Exception as e:
        logger.error(f"Failed to extract text from URL '{{url}}': {{e}}")
        return None

def extract_text(html: str):
    try:
        doc = Document(html)
        content_html = doc.summary()
        soup = BeautifulSoup(content_html, "html.parser")
        return soup.get_text(separator="\\n", strip=True)
    except:
        soup = BeautifulSoup(html, "html.parser")
        return soup.get_text(separator="\\n", strip=True)

async def scrape_url(url: str, session: aiohttp.ClientSession):
    html = await fetch(session, url)
    if html:
        text = await asyncio.to_thread(extract_text, html)
        return text
    return None

async def scrape_all_urls(urls: list[str]):
    async with aiohttp.ClientSession() as session:
        tasks = [scrape_url(url, session) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if r and not isinstance(r, Exception)]

def urls_match(existing: dict, new_urls: list[str]):
    try:
        old_urls = json.loads(existing.get("description", "[]"))
        return sorted(old_urls) == sorted(new_urls)
    except:
        return False
    
def if_exists(collection_name, time_to_expired, urls):
    existing = get_collection_by_name(collection_name)

    if existing:
        if not is_collection_expired(existing, time_to_expired) and urls_match(existing, urls):
            return existing
        try:
            requests.delete(f"{{API_BASE}}/source-collections/{{existing['collection_id']}}/")
        except Exception as e:
            logger.error(f"Failed to delete collection: {{e}}")
    return False

def main(urls: list[str] = {urls}):
    collection_name = {collection_name!r}
    time_to_expired = {time_to_expired!r}
    embedder = {embedder!r}

    existing_collection = if_exists(collection_name, time_to_expired, urls)
    if existing_collection:
        return existing_collection

    base_dir = prepare_save_folder(collection_name)
    scraped_contents = asyncio.run(scrape_all_urls(urls))
    file_names = [save_scraped_file(base_dir, url, content) for url, content in zip(urls, scraped_contents)]
    response = create_collection(collection_name, file_names, embedder, urls)
    wait_completed(collection_name)

    try:
        shutil.rmtree(base_dir)
    except Exception as e:
        logger.error(f"Failed to remove folder {{base_dir}}: {{e}}")

    return response
"""

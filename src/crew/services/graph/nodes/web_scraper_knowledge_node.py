import os
import sys
import time
import json
import random
import asyncio
import subprocess
import shutil
from loguru import logger
from datetime import datetime, timezone

import requests
import tldextract
from playwright.async_api import async_playwright

API_BASE = "http://127.0.0.1:8000/api"


def get_collection_by_name(name: str):
    r = requests.get(f"{API_BASE}/source-collections/")
    r.raise_for_status()
    return next((col for col in r.json().get("results", []) if col.get("collection_name") == name), None)


def create_collection(collection_name: str, base_dir: str, file_names: list[str], embedder: int, urls: list[str]):
    data = {
        "collection_name": collection_name,
        "embedder": embedder,
        "description": json.dumps(urls),
        "chunk_sizes": [1000] * len(file_names),
        "chunk_strategies": ["token"] * len(file_names),
        "chunk_overlaps": [200] * len(file_names),
        "additional_params": [{} for _ in file_names],
    }
    files = []
    for fname in file_names:
        path = os.path.join(base_dir, fname)
        if os.path.exists(path):
            files.append(("files", open(path, "rb")))

    try:
        r = requests.post(f"{API_BASE}/source-collections/", data=data, files=files)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.error(e)
    finally:
        for _, file in files:
            file.close()


def wait_completed(collection_name: str):
    collection = get_collection_by_name(collection_name)
    url = f"{API_BASE}/collection_statuses/?collection_id={collection['collection_id']}"
    while True:
        r = requests.get(url).json()
        if r["results"][0]["collection_status"] == "completed":
            return r["results"][0]
        time.sleep(2)


def is_collection_expired(collection: dict, time_to_expired: int) -> bool:
    try:
        dt = datetime.fromisoformat(collection["created_at"].replace("Z", "+00:00"))
    except Exception as e:
        logger.error(f"Failed to parse created_at '{collection.get('created_at')}': {e}")
        return True
    return (datetime.now(timezone.utc) - dt).total_seconds() / 60 > time_to_expired


def prepare_save_folder(collection_name: str) -> str:
    base_dir = f"savefiles/{collection_name}"
    os.makedirs(base_dir, exist_ok=True)
    return base_dir


def save_scraped_file(base_dir: str, url: str, content: str) -> str:
    parsed = tldextract.extract(url)
    file_name = f"scrape_result_{parsed.domain}_{datetime.now().strftime('%Y%m%d')}.txt"
    with open(os.path.join(base_dir, file_name), "w", encoding="utf-8") as f:
        f.write(content)
    return file_name


async def light_scroll(page):
    for _ in range(random.randint(2, 5)):
        await page.evaluate(f"window.scrollBy(0, {random.randint(200,600)})")
        await asyncio.sleep(random.uniform(0.1, 0.25))


async def scrape_url_async(url: str):
    p = await async_playwright().start()
    browser = await p.chromium.launch(
        headless=True,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--no-sandbox",
            "--disable-dev-shm-usage"
        ],
    )

    context = await browser.new_context(
        user_agent=f"Mozilla/5.0 ... Chrome/{random.randint(120,130)}.0.0.0 Safari/537.36",
        viewport={"width": random.randint(1200,1920), "height": random.randint(700,1080)},
        locale="en-US"
    )

    await context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>false})")

    page = await context.new_page()
    await page.goto(url, timeout=45000, wait_until="domcontentloaded")
    await light_scroll(page)
    await asyncio.sleep(random.uniform(0.2, 0.5))

    text = await page.inner_text("body")

    await browser.close()
    await p.stop()
    return text


async def scrape_all_urls(urls: list[str]):
    results = await asyncio.gather(*(scrape_url_async(url) for url in urls), return_exceptions=True)
    for r in results:
        if isinstance(r, Exception):
            logger.error(r)
    return [r for r in results if not isinstance(r, Exception)]


def urls_match(existing: dict, new_urls: list[str]) -> bool:
    try:
        old_urls = json.loads(existing.get("description", "[]"))
        return sorted(old_urls) == sorted(new_urls)
    except:
        return False


def main(collection_name: str, urls: list[str], time_to_expired: int, embedder: int):
    subprocess.run([sys.executable, "-m", "playwright", "install"], check=True)

    existing = get_collection_by_name(collection_name)
    if existing:
        print(is_collection_expired(existing, time_to_expired))
        if not is_collection_expired(existing, time_to_expired) and urls_match(existing, urls):
            return {"status": "exists", "collection": existing}
        try:
            requests.delete(f"{API_BASE}/source-collections/{existing['collection_id']}/")
        except Exception as e:
            logger.error(f"Failed to delete collection: {e}")
    print('build')
    base_dir = prepare_save_folder(collection_name)
    scraped_contents = asyncio.run(scrape_all_urls(urls))
    file_names = [save_scraped_file(base_dir, url, content) for url, content in zip(urls, scraped_contents)]
    response = create_collection(collection_name, base_dir, file_names, embedder, urls)

    wait_completed(collection_name)

    try:
        shutil.rmtree(base_dir)
    except Exception as e:
        logger.error(f"Error deleting temp folder {base_dir}: {e}")

    return {"status": "created", "collection": response}

args = ["test2", ["https://uk.wikipedia.org/wiki/%D0%9F%D1%80%D0%B8%D1%80%D0%BE%D0%B4%D0%BD%D0%B8%D1%87%D1%96_%D0%BD%D0%B0%D1%83%D0%BA%D0%B8", "https://pidru4niki.com/12461220/prirodoznavstvo/zarodzhennya_stanovlennya_rozvitok_prirodoznavstva", "https://pidru4niki.com/14170120/prirodoznavstvo/prirodoznavstvo_nauka_naukoviy_metod_piznannya_yogo_struktura#460"]]
collection_name = main(*args, time_to_expired=20, embedder=2)
print(collection_name)

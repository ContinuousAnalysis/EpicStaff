import requests
from pathlib import Path
from openai import OpenAI

class PictureTool:
    def __init__(self):
        self.api_key = state["variables"]["OPENAI_API_KEY"]
        self.save_path = Path(state["variables"]["SAVEFILES_PATH"])
        self.save_path.mkdir(parents=True, exist_ok=True)
        self.client = OpenAI(api_key=self.api_key)

    def _download_image(self, url, filename):
        response = requests.get(url)
        response.raise_for_status()
        file_path = self.save_path / filename
        with open(file_path, "wb") as f:
            f.write(response.content)
        return str(file_path)

    def _save_base64(self, b64data, filename):
        import base64
        file_path = self.save_path / filename
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(b64data))
        return str(file_path)

    def generate_image(self, prompt, model, size, quality, n):
        try:
            response = self.client.images.generate(
                model=model,
                prompt=prompt,
                size=size,
                quality=quality,
                n=n,
            )
            
            saved_files = []
            for idx, data in enumerate(response.data):
                filename = f"EpicStaff_Image_{idx+1}.png"
                if hasattr(data, "url") and data.url:
                    saved_files.append(self._download_image(data.url, filename))
                else:
                    saved_files.append(self._save_base64(data.b64_json, filename))

            return f"{saved_files}\n\nGenerated images successfully saved in {self.save_path}"

        except Exception as e:
            return f"Failed to generate image: {e}"

def main(prompt, model="dall-e-3", size="1024x1024", quality="standard", n=1):
    tool = PictureTool()
    return tool.generate_image(prompt, model, size, quality, n)



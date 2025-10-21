# Base Python image
FROM python:3.12.10-slim

# --- System dependencies ---
RUN apt-get update && apt-get install -y \
    curl git wget unzip procps \
    && rm -rf /var/lib/apt/lists/*

# --- Poetry ---
RUN pip install poetry
ENV PATH="/root/.local/bin:$PATH" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1

# --- App setup ---
WORKDIR /app
COPY pyproject.toml poetry.lock* /app/
RUN poetry install --no-root --only main -vvv
COPY . /app/

# --- Data volume (optional if needed) ---
VOLUME /app/data

# --- Environment variables ---
ENV CLI_TOOL_MODE=true

# --- Expose port for MCP API ---
EXPOSE 7001

# --- Entrypoint ---
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

CMD ["poetry", "run", "python", "cli_mcp.py"]


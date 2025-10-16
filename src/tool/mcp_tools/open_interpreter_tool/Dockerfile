# Base Python image
FROM python:3.12.10-slim

# --- System dependencies ---
RUN apt-get update && apt-get install -y \
    curl git x11vnc xvfb x11-utils x11-apps libx11-6 libgtk-3-0 libgl1-mesa-glx \
    tigervnc-standalone-server wget unzip \
    chromium chromium-driver \
    novnc websockify scrot\
    libnss3 libxss1 libasound2 fonts-liberation libcups2 \
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

# --- Data volume ---
VOLUME /app/data

# --- Environment variables ---
ENV DISPLAY=:99
EXPOSE 7001 
EXPOSE 5900
EXPOSE 6080

# --- Start Xvfb and VNC + MCP entrypoint ---
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

CMD ["/app/entrypoint.sh"]

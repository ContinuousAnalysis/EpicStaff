FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Etc/UTC \
    DISPLAY=:99 \
    VNC_GEOMETRY=1600x900 \
    VNC_PASS=secret \
    PYTHONUNBUFFERED=1 \
    LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl wget gnupg git \
    xvfb x11vnc xfce4 xfce4-goodies x11-apps \
    dbus-x11 xdg-utils fonts-liberation locales \
    libnss3 libxss1 libasound2 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libxcomposite1 libxrandr2 libgbm1 libpango-1.0-0 libpangocairo-1.0-0 \
    xdotool imagemagick \
    chromium \
  && rm -rf /var/lib/apt/lists/*

RUN sed -i 's/# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && locale-gen

WORKDIR /app

RUN x11vnc -storepasswd "${VNC_PASS}" /root/.vncpass

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

COPY . /app
RUN chmod +x /app/start_all_servers.sh

EXPOSE 5900 8080 8000

CMD ["/app/start_all_servers.sh"]
#!/usr/bin/env bash
set -e

echo "Starting Xvfb virtual display..."
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

echo "Starting x11vnc..."
x11vnc -display :99 -forever -nopw -shared &

echo "Starting noVNC on port 6080..."
websockify --web /usr/share/novnc 6080 0.0.0.0:5900 &

sleep 2

echo "Starting MCP server with Open Interpreter..."
exec poetry run python mcp_server.py

#!/bin/bash

Xvfb :99 -screen 0 ${VNC_GEOMETRY}x24 &
sleep 2

export DISPLAY=:99
startxfce4 &
sleep 3

x11vnc -display :99 -rfbauth /root/.vncpass -rfbport 5900 -forever -shared -bg

echo "VNC Server started on port 5900"
echo "VNC Password: ${VNC_PASS}"
echo "Resolution: ${VNC_GEOMETRY}"
echo ""
echo "Starting MCP Server on port 8080..."
echo ""

python -u /app/fast_mcp_server.py
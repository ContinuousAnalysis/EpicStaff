#!/bin/bash
set -e

echo "Starting Git Agents..."

echo "Starting webhook server..."
python /app/webhook_server.py &
WEBHOOK_PID=$!
sleep 2
echo "✓ Webhook ready on port 8000"

echo "Starting MCP server..."
python /app/fast_mcp_server.py

kill $WEBHOOK_PID 2>/dev/null || true
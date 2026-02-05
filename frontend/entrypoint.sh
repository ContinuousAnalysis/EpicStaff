#!/bin/sh
set -e

CONFIG_PATH="/usr/share/nginx/html/config.json"

echo "Generating config.json..."

cat <<EOF > $CONFIG_PATH
{
  "apiUrl": "${API_URL:-http://127.0.0.1/api/}",
  "realtimeApiUrl": "${REALTIME_API_URL:-http://127.0.0.1/realtime/}"
}
EOF

echo "Config generated:"
cat $CONFIG_PATH

exec "$@"
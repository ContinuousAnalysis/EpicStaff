#!/bin/bash
# Create a Synapse admin user via the Admin API
# Usage: ./create_admin.sh <username> <password>
set -e

DOMAIN_NAME="${DOMAIN_NAME:-localhost}"
SYNAPSE_URL="http://localhost/_matrix"

USERNAME="${1:-admin}"
PASSWORD="${2:-adminpassword}"

echo "Creating admin user @${USERNAME}:${DOMAIN_NAME} on ${SYNAPSE_URL}..."

# Register using the Synapse admin API (requires registration_shared_secret or open registration)
curl -s -X POST "${SYNAPSE_URL}/client/v3/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"${USERNAME}\", \"password\": \"${PASSWORD}\", \"auth\": {\"type\": \"m.login.dummy\"}}"

echo ""
echo "User created. To make admin, use synapse_admin CLI or the Admin API."
echo "Grant admin: POST /_synapse/admin/v1/users/@${USERNAME}:${DOMAIN_NAME}/admin"

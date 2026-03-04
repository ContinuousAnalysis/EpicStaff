#!/bin/bash
set -e
envsubst < /templates/homeserver.yaml.template > /data/homeserver.yaml
envsubst < /templates/epicstaff_bridge.yaml.template > /data/epicstaff_bridge.yaml
exec python -m synapse.app.homeserver --config-path /data/homeserver.yaml "$@"

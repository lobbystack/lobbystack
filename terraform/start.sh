#!/usr/bin/env bash
# Starts the SIP server's VM again after stop.sh. The static IP is kept, so Zadarma and the firewall rules need no
# change. Docker restarts Asterisk by itself, which takes a minute after the VM is up.
#
#   ./start.sh [resource-group]     default: lobbystack-sip-rg, or $RESOURCE_GROUP
set -euo pipefail

export AZURE_AUTO_UPGRADE_ENABLE=no
group="${1:-${RESOURCE_GROUP:-lobbystack-sip-rg}}"

az group show -n "$group" >/dev/null 2>&1 || { echo "No resource group named $group." >&2; exit 1; }

ids=$(az vm list -g "$group" --query "[].id" -o tsv)
if [ -z "$ids" ]; then echo "No VM in $group." >&2; exit 1; fi

echo "Starting, which takes about a minute:"
# shellcheck disable=SC2086
az vm start --ids $ids

echo
az vm list -g "$group" -d --query "[].{vm:name, state:powerState, ip:publicIps}" -o table
echo
echo "Asterisk needs another minute or so. To check it, run on the VM:"
echo "  sudo docker compose -f /opt/lobbystack-sip/docker-compose.yml logs --tail 5 asterisk   # ends with \"Asterisk Ready.\""

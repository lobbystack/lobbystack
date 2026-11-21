#!/usr/bin/env bash
# Stops the compute bill for the SIP server by deallocating its VM. The disk, the static IP and the rest stay,
# so the address is the same when start.sh brings the VM back. Calls to the number fail while it is stopped.
#
#   ./stop.sh [resource-group]      default: lobbystack-sip-rg, or $RESOURCE_GROUP
set -euo pipefail

export AZURE_AUTO_UPGRADE_ENABLE=no
group="${1:-${RESOURCE_GROUP:-lobbystack-sip-rg}}"

az group show -n "$group" >/dev/null 2>&1 || { echo "No resource group named $group." >&2; exit 1; }

ids=$(az vm list -g "$group" --query "[].id" -o tsv)
if [ -z "$ids" ]; then echo "No VM in $group."; exit 0; fi

echo "Deallocating, which takes about a minute:"
# shellcheck disable=SC2086
az vm deallocate --ids $ids --no-wait
# shellcheck disable=SC2086
az vm wait --ids $ids --custom "instanceView.statuses[?code=='PowerState/deallocated']" --interval 5 --timeout 600

echo
az vm list -g "$group" -d --query "[].{vm:name, state:powerState}" -o table
echo
echo "Compute is no longer billed. The disk and the static IP still are, for a few euros a month."
echo "Run ./start.sh to bring the server back at the same address."

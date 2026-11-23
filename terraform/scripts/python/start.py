#!/usr/bin/env python3
"""
Starts the SIP server's VM again after stop.py. The static IP is kept, so Zadarma and the firewall rules need no
change. Docker restarts Asterisk by itself, which takes a minute after the VM is up.

    python3 start.py [environment]    dev, sandbox or prod. Default dev. $RESOURCE_GROUP names a group directly.
"""

import sys

from resources.components.vm import az, fail, parse_environment, resolve, say, show_state, vm_ids


def main():
    args = parse_environment("Start the SIP server's VM again.")
    group, sub_args = resolve(args.environment)
    ids = vm_ids(group, sub_args)
    if not ids:
        fail(f"No VM in {group}.")

    say("Starting, which takes about a minute:")
    if az(["vm", "start", "--ids", *ids]).returncode != 0:
        fail("Couldn't start the VM.")

    show_state(group, sub_args, with_ip=True)
    print()
    say("Asterisk needs another minute or so. To check it, run on the VM:")
    say('  sudo docker compose -f /opt/lobbystack-sip/docker-compose.yml logs --tail 5 asterisk   # ends with "Asterisk Ready."')


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)

#!/usr/bin/env python3
"""
Stops the compute bill for a server by deallocating its VM, the SIP server's unless --target says the web app's. The disk, the static IP and the rest stay, so the
address is the same when start.py brings the VM back. Calls to the number fail while the SIP server is stopped, and the site is down while the web app is.

    python3 stop.py [environment] [--target sip|app|all]
                                      dev or prod. Default dev. $RESOURCE_GROUP names a group directly.
"""

import sys

from resources.components.vm import az, confirm_production, fail, parse_environment, resolve, say, show_state, vm_ids


def main():
    args = parse_environment("Deallocate the SIP server's VM, which ends its compute bill.")
    group, sub_args = resolve(args.environment)
    ids = vm_ids(group, sub_args, args.target)
    if not ids:
        say(f"No {args.target} VM in {group}.")
        return
    confirm_production(args.environment, "Stop", args.yes)

    say("Deallocating, which takes about a minute:")
    if az(["vm", "deallocate", "--ids", *ids, "--no-wait"]).returncode != 0:
        fail("Couldn't start the deallocation.")
    waited = az(["vm", "wait", "--ids", *ids, "--custom", "instanceView.statuses[?code=='PowerState/deallocated']", "--interval", "5", "--timeout", "600"])
    if waited.returncode != 0:
        fail("The VM didn't report deallocated in time. Check its state in the portal.")

    show_state(group, sub_args, with_ip=False)
    print()
    say("Compute is no longer billed. The disk and the static IP still are, for a few euros a month.")
    say(f"Run python3 start.py {args.environment} to bring the server back at the same address.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)

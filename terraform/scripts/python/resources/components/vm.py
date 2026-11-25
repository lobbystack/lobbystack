import argparse
import os
import subprocess
import sys

from .config import GUID, list_environments, read_tfvar, resource_group_name
from .ui import BOLD, DIM, RED, RESET, confirm


def az(args: list[str], capture: bool = False) -> subprocess.CompletedProcess:
    """Run the Azure CLI. On Windows it is az.cmd, which needs a shell to start."""
    return subprocess.run(
        ["az", *args], capture_output=capture, text=True, shell=(os.name == "nt"), check=False
    )


def fail(message: str, code: int = 1):
    print(f"  {RED}{message}{RESET}", file=sys.stderr)
    sys.exit(code)


def parse_environment(description: str) -> argparse.Namespace:
    """The command line start.py and stop.py share: an environment, and --yes to skip prod's question."""
    environments = list_environments()
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "environment",
        nargs="?",
        default="dev",
        choices=environments or None,
        help="Which environment's VM. Default dev. $RESOURCE_GROUP names a resource group directly.",
    )
    parser.add_argument(
        "--target",
        choices=["sip", "app", "all"],
        default="sip",
        help="Which VM: the SIP server (default), the web app, or both. The VM's purpose tag says which is which.",
    )
    parser.add_argument("--yes", "-y", action="store_true", help="Don't ask before touching prod.")
    return parser.parse_args()


def resolve(environment: str) -> tuple[str, list[str]]:
    """The resource group and the `az --subscription` arguments for an environment, from its tfvars file.

    The subscription comes from environments/<environment>.tfvars, so prod's commands never reach the NPD
    subscription. A placeholder id stops the run.
    """
    group = os.environ.get("RESOURCE_GROUP") or resource_group_name(environment)
    if not group:
        fail(f"environments/{environment}.tfvars sets no app_name, and RESOURCE_GROUP isn't set.")

    subscription = read_tfvar(environment, "subscription_id")
    if not subscription:
        print(f"  {DIM}environments/{environment}.tfvars sets no subscription_id, so az uses the subscription it has selected.{RESET}", file=sys.stderr)
        return group, []
    if not GUID.match(subscription):
        fail(f"subscription_id in environments/{environment}.tfvars isn't a subscription id yet. Set it first.")
    return group, ["--subscription", subscription]


def confirm_production(environment: str, action: str, yes: bool):
    """Stopping prod ends real customers' calls, so it asks first unless --yes says not to."""
    if environment == "prod" and not yes:
        if not confirm(f"{action} the PRODUCTION server? Callers can't reach it while it's down.", default=False):
            fail("Cancelled.")


# The purpose tag main.tf puts on each VM: locals.tf sets sip-server on the SIP server and web-app on the web app.
PURPOSES = {"sip": "sip-server", "app": "web-app"}


def vm_ids(group: str, sub_args: list[str], target: str = "all") -> list[str]:
    """The ids of the VMs in the resource group, narrowed to the target's. Exits when the group doesn't exist."""
    if az(["group", "show", *sub_args, "-n", group], capture=True).returncode != 0:
        fail(f"No resource group named {group}.")
    query = "[].id" if target == "all" else f"[?tags.purpose=='{PURPOSES[target]}'].id"
    result = az(["vm", "list", *sub_args, "-g", group, "--query", query, "-o", "tsv"], capture=True)
    if result.returncode != 0:
        fail(f"Couldn't list the VMs in {group}.\n{result.stderr.strip()}")
    return result.stdout.split()


def show_state(group: str, sub_args: list[str], with_ip: bool):
    query = "[].{vm:name, state:powerState, ip:publicIps}" if with_ip else "[].{vm:name, state:powerState}"
    print(flush=True)
    az(["vm", "list", *sub_args, "-g", group, "-d", "--query", query, "-o", "table"])


def say(text: str, bold: bool = False):
    print(f"{BOLD}{text}{RESET}" if bold else text, flush=True)

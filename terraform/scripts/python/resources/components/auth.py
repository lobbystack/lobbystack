import json
import os
import subprocess

from .config import GUID
from .ui import BOLD, DIM, GREEN, RED, RESET, banner, confirm, pause


def _az(args: list[str]) -> tuple[int, str]:
    # On Windows the Azure CLI is az.cmd, which needs a shell to start.
    result = subprocess.run(
        ["az", *args], capture_output=True, text=True, shell=(os.name == "nt"), check=False
    )
    return result.returncode, result.stdout


def _account(subscription_id: str = "") -> dict | None:
    """The signed-in account, for one subscription when an id is given, otherwise the CLI's selected one."""
    args = ["account", "show", "--output", "json"]
    if subscription_id:
        args += ["--subscription", subscription_id]
    code, out = _az(args)
    if code != 0:
        return None
    try:
        return json.loads(out)
    except ValueError:
        return None


def ensure_azure_login(subscription_id: str = "") -> bool:
    """Check that the Azure CLI can reach the environment's subscription, and show which one it is.

    Terraform builds everything in the subscription environments/<environment>.tfvars names: dev and sandbox in NPD,
    prod in PRD. That choice is made in the file, so nothing asks about it here. A subscription the CLI can't reach, or
    a placeholder id, stops the run.
    """
    banner()
    print(f"  {BOLD}[ Login ]{RESET} Checking the Azure CLI session...")

    if subscription_id and not GUID.match(subscription_id):
        print(f"  {RED}subscription_id isn't a subscription id yet: {subscription_id}{RESET}")
        print(f"  {DIM}Set it in the environment's tfvars file. `az account list --query \"[].[name,id]\" -o tsv` lists them.{RESET}")
        pause()
        return False

    account = _account(subscription_id)
    if account is None:
        print(f"  {RED}The Azure CLI can't see {'subscription ' + subscription_id if subscription_id else 'a subscription'}.{RESET}")
        if not confirm("Run `az login` now?"):
            pause()
            return False
        if subprocess.run(["az", "login", "--output", "none"], shell=(os.name == "nt"), check=False).returncode != 0:
            print(f"  {RED}az login failed.{RESET}")
            pause()
            return False
        account = _account(subscription_id)
        if account is None:
            print(f"  {RED}Still can't see it. Sign in with an account that has access to this subscription.{RESET}")
            pause()
            return False

    print(f"  {DIM}Subscription : {account.get('name', '')}{RESET}")
    print(f"  {DIM}Id           : {account.get('id', '')}{RESET}")
    print(f"  {DIM}Signed in as : {account.get('user', {}).get('name', '')}{RESET}")
    if not subscription_id:
        print(f"  {DIM}The environment sets no subscription_id, so Terraform uses this one.{RESET}")
    if os.environ.get("ARM_SUBSCRIPTION_ID") or os.environ.get("TF_VAR_subscription_id"):
        print(f"  {DIM}Note: ARM_SUBSCRIPTION_ID or TF_VAR_subscription_id is set, and may override the file.{RESET}")
    print(f"  {GREEN}Authenticated.{RESET}")
    return True

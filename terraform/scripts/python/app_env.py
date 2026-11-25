#!/usr/bin/env python3
"""
Builds the web app VM's .env for an environment from your local .env, and can copy it to the VM and start the stack.

    python3 app_env.py [environment]                 writes .generated/<environment>.app.env and prints the next steps
    python3 app_env.py [environment] --send          also copies it to the VM and runs lobbystack-update there
    python3 app_env.py [environment] --source FILE   reads FILE instead of the repository's .env
    python3 app_env.py [environment] --out FILE      writes FILE instead of .generated/<environment>.app.env

It keeps your provider keys and settings, points the URLs at the environment's app_domain, turns on HTTPS in Compose, and
makes fresh secrets for the database and the app. The secrets are made once: running it again keeps the ones already on
the VM, or in the file it wrote, because Postgres keeps the passwords it was first started with.
"""

import argparse
import os
import secrets
import subprocess
import sys

from resources.components.config import TERRAFORM_DIR, list_environments, read_tfvar
from resources.components.vm import az, fail, resolve, say

REPOSITORY_ENV = os.path.abspath(os.path.join(TERRAFORM_DIR, "..", ".env"))
GENERATED_DIR = os.path.join(TERRAFORM_DIR, ".generated")

# Values that belong to this server alone. Your laptop's must never reach it.
SECRETS = [
    "POSTGRES_PASSWORD",
    "LOBBYSTACK_MIGRATOR_PASSWORD",
    "LOBBYSTACK_APP_PASSWORD",
    "LOBBYSTACK_AUTH_PASSWORD",
    "LOBBYSTACK_WORKER_PASSWORD",
    "LOBBYSTACK_DISPATCHER_PASSWORD",
    "LOBBYSTACK_READONLY_PASSWORD",
    "BETTER_AUTH_SECRET",
    "ENCRYPTION_KEY",
    "INTERNAL_SERVICE_SECRET",
    "INTERNAL_SERVICE_TOKEN",
    "OTP_HASH_SECRET",
    "LOCAL_STORAGE_SIGNING_SECRET",
    "WIDGET_SESSION_SECRET",
]


def parse_text(text: str) -> dict[str, str]:
    """KEY=value lines of an env file. Comments, blank lines and anything else are skipped."""
    values: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            values[key.strip()] = value
    return values


def parse(path: str) -> dict[str, str]:
    try:
        with open(path, encoding="utf-8") as f:
            return parse_text(f.read())
    except OSError:
        return {}


def vm_secrets(login: str, ssh: list[str]) -> dict[str, str]:
    """The secrets in the .env already on the VM, or nothing when it has none or can't be reached.

    Postgres keeps the passwords it was first started with, so new secrets for a VM that already has a database lock the
    migrator out. Reading the VM's own file means a lost local file never makes that mistake.
    """
    result = subprocess.run(
        ["ssh", *ssh, "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", login, "cat /opt/lobbystack-app/.env 2>/dev/null"],
        capture_output=True, text=True, check=False,
    )
    found = parse_text(result.stdout) if result.returncode == 0 else {}
    return {key: found[key] for key in SECRETS if found.get(key)}


def build(source_lines: list[str], overrides: dict[str, str]) -> str:
    """The source file with each overridden key removed from where it was, and the overrides added at the end."""
    kept = []
    for line in source_lines:
        key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else None
        if key not in overrides:
            kept.append(line.rstrip("\n"))
    while kept and not kept[-1].strip():
        kept.pop()
    block = ["", "# ---- Set by scripts/python/app_env.py for this server ----"] + [f"{key}={value}" for key, value in overrides.items()]
    return "\n".join(kept + block) + "\n"


def marketing_settings(domain: str, app_url: str) -> dict[str, str]:
    """What the admin needs to serve the marketing site on `domain`, or nothing when there is none.

    The pages are built into the image, so MARKETING_SITE and the origins are build arguments in docker-compose.yml,
    and MARKETING_HOSTS is read while the server runs. A registered domain such as lobbystack.com also answers on www, which
    redirects to it, since the first host is the canonical one. The voice demo on the pages calls the app, which only
    answers the origins WEB_CALL_ALLOWED_ORIGINS lists.
    """
    if not domain:
        return {}
    hosts = [domain] + ([f"www.{domain}"] if domain.count(".") == 1 else [])
    return {
        "MARKETING_SITE": "true",
        "MARKETING_HOSTS": ",".join(hosts),
        "NEXT_PUBLIC_LANDING_SITE_URL": f"https://{domain}",
        # The hero's demo call goes to the app. A laptop's .env points it at localhost.
        "NEXT_PUBLIC_LIVE_CALL_ENDPOINT": f"{app_url}/api/voice/live/session",
        "WEB_CALL_ALLOWED_ORIGINS": ",".join([f"https://{host}" for host in hosts] + [app_url]),
    }


def app_vm_address(environment: str) -> str:
    """The web app VM's public address, found by its purpose tag."""
    group, sub_args = resolve(environment)
    result = az(["vm", "list", *sub_args, "-g", group, "-d", "--query", "[?tags.purpose=='web-app'].publicIps | [0]", "-o", "tsv"], capture=True)
    address = result.stdout.strip()
    if result.returncode != 0 or not address:
        fail(f"No web app VM in {group}. Set deploy_app = true in environments/{environment}.tfvars and apply first.")
    return address


def main():
    parser = argparse.ArgumentParser(description="Build the web app VM's .env, and optionally send it and start the stack.")
    parser.add_argument("environment", nargs="?", default="dev", choices=list_environments() or None)
    parser.add_argument("--source", default=REPOSITORY_ENV, help="The .env to start from. Default: the repository's .env.")
    parser.add_argument("--send", action="store_true", help="Copy the file to the VM and run lobbystack-update there.")
    parser.add_argument("--out", default=None, help="Where to write the file. Default: .generated/<environment>.app.env. Use another path to try the script without touching the real file.")
    parser.add_argument("--key", default=os.environ.get("SSH_KEY", os.path.expanduser("~/.ssh/terraform")), help="The SSH private key. Default: $SSH_KEY or ~/.ssh/terraform.")
    args = parser.parse_args()

    domain = read_tfvar(args.environment, "app_domain")
    if not domain:
        fail(f"environments/{args.environment}.tfvars sets no app_domain.")
    if not os.path.isfile(args.source):
        fail(f"No file at {args.source}. Pass the .env to start from with --source.")

    target = args.out or os.path.join(GENERATED_DIR, f"{args.environment}.app.env")
    address = app_vm_address(args.environment)
    ssh = ["-i", args.key, "-o", "StrictHostKeyChecking=accept-new"]
    login = f"azureuser@{address}"
    # The VM's secrets win over a local file that differs: they're the ones its database was started with.
    earlier = {**parse(target), **vm_secrets(login, ssh)}
    url = f"https://{domain}"
    overrides = {
        "COMPOSE_FILE": "docker-compose.yml:docker-compose.tls.yml",
        "HTTP_BIND_ADDRESS": "0.0.0.0",
        "CADDY_ON_DEMAND_TLS": "true",
        "APP_HOSTNAME": domain,
        "APP_BASE_URL": url,
        "NEXT_PUBLIC_APP_URL": url,
        **{key: earlier.get(key) or secrets.token_hex(32) for key in SECRETS},
        **marketing_settings(read_tfvar(args.environment, "marketing_domain"), url),
    }
    with open(args.source, encoding="utf-8") as f:
        text = build(f.readlines(), overrides)

    os.makedirs(os.path.dirname(os.path.abspath(target)), exist_ok=True)
    with open(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
        f.write(text)
    say(f"Wrote {os.path.relpath(target, TERRAFORM_DIR)} for {url}. It holds secrets, and git ignores it.", bold=True)

    if not args.send:
        say(f"\nNext, once cloud-init has finished on the VM:")
        say(f"  scp -i {args.key} {target} {login}:/opt/lobbystack-app/.env")
        say(f"  ssh -i {args.key} {login} lobbystack-update")
        say("Or run this again with --send to do both.")
        return

    say(f"\nCopying it to {address} and waiting for the VM's first boot to finish:")
    if subprocess.run(["ssh", *ssh, login, "cloud-init status --wait"], check=False).returncode not in (0, 2):
        fail("Couldn't reach the VM. Check that ssh_allowed_cidrs allows your address and that --key is the right key.")
    if subprocess.run(["scp", *ssh, target, f"{login}:/opt/lobbystack-app/.env"], check=False).returncode != 0:
        fail("Couldn't copy the file.")
    say("\nBuilding and starting the stack, which takes several minutes the first time:")
    if subprocess.run(["ssh", "-t", *ssh, login, "lobbystack-update"], check=False).returncode != 0:
        fail("lobbystack-update failed. Read its output above, or run `docker compose logs` in /opt/lobbystack-app.")
    say(f"\nDone. Once the DNS record for {domain} resolves, Caddy gets the certificate and {url} opens.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)

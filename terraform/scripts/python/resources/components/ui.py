import getpass
import os
import subprocess

RESET = "\033[0m"
BOLD = "\033[1m"
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
DIM = "\033[2m"


def clear():
    subprocess.run("cls" if os.name == "nt" else "clear", shell=True, check=False)


def banner():
    print(f"{CYAN}{BOLD}")
    print("  ╔════════════════════════════════════════════╗")
    print("  ║ LobbyStack SIP Server Terraform Deployment ║")
    print("  ╚════════════════════════════════════════════╝")
    print(f"{RESET}")


def prompt(label: str, default: str = "") -> str:
    default_hint = f" [{default}]" if default else ""
    value = input(f"  {YELLOW}▸ {label}{default_hint}: {RESET}").strip()
    return value if value else default


def prompt_secret(label: str) -> str:
    return getpass.getpass(f"  {YELLOW}▸ {label}: {RESET}")


def confirm(label: str, default: bool = True) -> bool:
    hint = "[Y/n]" if default else "[y/N]"
    value = input(f"  {YELLOW}▸ {label} {DIM}{hint}{RESET}: ").strip().lower()
    if not value:
        return default
    return value in ("y", "yes")


def pause():
    input(f"\n  {DIM}Press Enter to return to menu...{RESET}")


def status(code: int):
    if code == 0:
        print(f"  {GREEN}{BOLD}✔ Done.{RESET}")
    else:
        print(f"  {RED}{BOLD}✘ Command failed (exit {code}).{RESET}")
    pause()

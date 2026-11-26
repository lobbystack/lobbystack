#!/usr/bin/env python3
"""
LobbyStack SIP Server Terraform Deployment Tool
Interactive menu for provisioning the SIP server's Azure infrastructure.
"""

import os
import sys

from resources.components.actions import (
    action_apply,
    action_destroy,
    action_drift,
    action_import,
    action_init,
    action_plan,
)
from resources.components.config import TERRAFORM_DIR
from resources.components.ui import BOLD, CYAN, DIM, RESET, banner, prompt

MENU = [
    ("Plan", "Preview changes.", action_plan),
    ("Apply", "Provision resources to Azure.", action_apply),
    ("Drift", "Detect out-of-band infrastructure changes.", action_drift),
    ("Destroy", "Tear down all infrastructure.", action_destroy),
    ("Import", "Import existing resources into state.", action_import),
    ("Init", "Initialize Terraform only.", action_init),
    ("Exit", "Quit.", None),
]


def main():
    while True:
        banner()
        print(f"  {DIM}Terraform: {os.path.relpath(TERRAFORM_DIR)}{RESET}\n")
        for i, (label, desc, _) in enumerate(MENU, 1):
            marker = f"{CYAN}{i}{RESET}"
            print(f"    {marker}. {BOLD}{label:<12}{RESET}  {DIM}{desc}{RESET}")
        print()
        choice = prompt("Select option")
        try:
            idx = int(choice) - 1
            _, _, fn = MENU[idx]
        except (ValueError, IndexError):
            continue
        if fn is None:
            print(f"\n  {DIM}Goodbye.{RESET}")
            sys.exit(0)
        fn()


if __name__ == "__main__":
    main()

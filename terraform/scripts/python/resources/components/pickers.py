from .config import list_environments
from .ui import BOLD, CYAN, DIM, RED, RESET, prompt


def pick_environment() -> str | None:
    """Pick an environment from environments/*.tfvars."""
    envs = list_environments()
    if not envs:
        print(f"  {RED}No environments found. Add environments/<environment>.tfvars.{RESET}")
        return None
    print(f"\n  {BOLD}Available environments:{RESET}")
    for i, env in enumerate(envs, 1):
        print(f"    {CYAN}{i}{RESET}. {env}")
    choice = prompt("Select environment (number)")
    try:
        return envs[int(choice) - 1]
    except (ValueError, IndexError):
        print(f"  {RED}Invalid selection.{RESET}")
        return None

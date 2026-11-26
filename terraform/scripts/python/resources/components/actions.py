import json
import os
import time

from .auth import ensure_azure_login
from .config import (
    DRIFT_PLAN_FILE,
    IMPORT_DIR,
    PLAN_FILE,
    TERRAFORM_DIR,
    read_tfvar,
    resource_group_name,
    var_file,
    workspace_for,
)
from .pickers import pick_environment
from .runner import run, run_capture
from .ui import BOLD, CYAN, DIM, GREEN, RED, RESET, banner, confirm, pause, prompt, status


def _print_summary(environment: str, action: str):
    """Print what is about to happen, so a wrong environment is seen before anything runs."""
    rows = [
        ("Action", action),
        ("Environment", environment),
        ("Workspace", workspace_for(environment)),
        ("Subscription id", read_tfvar(environment, "subscription_id")),
        ("Variables", var_file(environment)),
        ("Resource group", resource_group_name(environment)),
        ("Region", read_tfvar(environment, "location")),
        ("VM size", read_tfvar(environment, "vm_size")),
    ]
    width = max(len(label) for label, _ in rows)
    print(f"\n  {BOLD}Summary:{RESET}")
    for label, value in rows:
        if value:
            print(f"    {DIM}{label:<{width}}{RESET}  {value}")


def _cancelled():
    print(f"  {RED}Cancelled.{RESET}")
    pause()


def _terraform_init() -> int:
    """Install the providers and modules. It keeps the versions the lock file holds."""
    return run(["terraform", "init", "-input=false"], cwd=TERRAFORM_DIR)


def _select_workspace(environment: str) -> int:
    """Each environment keeps its state in its own workspace, so applying one never plans to remove another."""
    return run(["terraform", "workspace", "select", "-or-create", workspace_for(environment)], cwd=TERRAFORM_DIR)


def _prepare(environment: str) -> bool:
    """Sign in, initialise and select the environment's workspace. Returns False when any step fails."""
    if not ensure_azure_login(read_tfvar(environment, "subscription_id")):
        return False
    if _terraform_init() != 0:
        status(1)
        return False
    code = _select_workspace(environment)
    if code != 0:
        status(code)
        return False
    return True


def _format_duration(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    minutes, secs = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {secs}s"
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins}m {secs}s"


def _timed(cmd: list[str]) -> int:
    start = time.time()
    code = run(cmd, cwd=TERRAFORM_DIR)
    print(f"\n  {DIM}Duration: {_format_duration(int(time.time() - start))}{RESET}")
    return code


def _remove(path: str):
    try:
        os.remove(path)
    except OSError:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Actions
# ─────────────────────────────────────────────────────────────────────────────


def action_plan():
    banner()
    print(f"  {BOLD}[ Plan ]{RESET} Preview changes")
    environment = pick_environment()
    if not environment:
        return

    _print_summary(environment, "Plan")
    if not confirm("Proceed?"):
        return _cancelled()
    if not _prepare(environment):
        return

    status(_timed(["terraform", "plan", "-input=false", f"-var-file={var_file(environment)}"]))


def action_apply():
    banner()
    print(f"  {BOLD}[ Apply ]{RESET} Provision resources")
    environment = pick_environment()
    if not environment:
        return

    _print_summary(environment, "Apply")
    if not confirm("Plan first?"):
        return _cancelled()
    if not _prepare(environment):
        return

    # The plan is saved and applied as it is, so what you read is what runs.
    code = _timed(["terraform", "plan", "-input=false", f"-var-file={var_file(environment)}", f"-out={PLAN_FILE}"])
    if code != 0:
        _remove(PLAN_FILE)
        return status(code)

    try:
        print(f"\n  {BOLD}Read the plan above. Watch for resources marked 'must be replaced' or 'destroyed'.{RESET}")
        if not confirm(f"Apply this plan to {environment}?", default=False):
            return _cancelled()
        code = _timed(["terraform", "apply", "-input=false", PLAN_FILE])
    finally:
        _remove(PLAN_FILE)

    if code == 0:
        run(["terraform", "output"], cwd=TERRAFORM_DIR)
    status(code)


def action_destroy():
    banner()
    print(f"  {BOLD}[ Destroy ]{RESET} Tear down all infrastructure\n")
    environment = pick_environment()
    if not environment:
        return

    _print_summary(environment, "Destroy")
    print(f"  {RED}{BOLD}⚠ This will DESTROY every resource of {environment}, including its static public IP.{RESET}")
    print(f"  {DIM}Numbers routed to that address stop working until you route them somewhere else.{RESET}")
    if prompt(f"Type the environment name '{environment}' to confirm") != environment:
        return _cancelled()
    if not _prepare(environment):
        return

    status(_timed(["terraform", "destroy", "-input=false", "-auto-approve", f"-var-file={var_file(environment)}"]))


def action_import():
    banner()
    print(f"  {BOLD}[ Import ]{RESET} Import existing resources into state")
    environment = pick_environment()
    if not environment:
        return

    import_file = os.path.join(IMPORT_DIR, f"{environment}.json")
    if not os.path.isfile(import_file):
        print(f"  {RED}Import file not found: {os.path.relpath(import_file)}{RESET}")
        print(f"  {DIM}Copy scripts/python/resources/import/environment.template.json to that name and list the resources.{RESET}")
        return pause()

    try:
        with open(import_file, encoding="utf-8") as f:
            resources = json.load(f)
        entries = [(entry["address"], entry["id"]) for entry in resources]
    except (ValueError, KeyError, TypeError):
        print(f"  {RED}The import file must be a list of objects with an address and an id.{RESET}")
        return pause()

    _print_summary(environment, "Import")
    print(f"  {DIM}{len(entries)} resource(s) in {os.path.relpath(import_file)}{RESET}")
    if not confirm("Proceed?"):
        return _cancelled()
    if not _prepare(environment):
        return

    print(f"\n  {BOLD}Importing {len(entries)} resource(s)...{RESET}")
    for i, (address, resource_id) in enumerate(entries, 1):
        print(f"\n  {CYAN}[{i}/{len(entries)}]{RESET} {address}")
        code = run(["terraform", "import", "-input=false", f"-var-file={var_file(environment)}", address, resource_id], cwd=TERRAFORM_DIR)
        if code != 0:
            print(f"  {RED}Failed to import: {address}{RESET}")
            return status(code)
    status(0)


def action_init():
    banner()
    print(f"  {BOLD}[ Init ]{RESET} Initialize Terraform only")
    environment = pick_environment()
    if not environment:
        return

    if not ensure_azure_login(read_tfvar(environment, "subscription_id")):
        return
    code = _terraform_init()
    if code == 0:
        code = _select_workspace(environment)
    status(code)


def _normalize(obj):
    """Recursively strip fields Azure changes by itself, so only real out-of-band changes are compared.

    Extend the sets below when a drift check keeps reporting a field that nobody changed.
    """
    strip = {"zones"}
    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            if key in strip:
                continue
            if key == "tags" and isinstance(value, dict):
                result[key] = {tag: tag_value for tag, tag_value in value.items() if "hidden-link" not in tag}
            else:
                result[key] = _normalize(value)
        return result
    if isinstance(obj, list):
        return [_normalize(item) for item in obj]
    return obj


def action_drift():
    banner()
    print(f"  {BOLD}[ Drift ]{RESET} Detect out-of-band infrastructure changes")
    environment = pick_environment()
    if not environment:
        return

    _print_summary(environment, "Drift")
    if not confirm("Proceed?"):
        return _cancelled()
    if not _prepare(environment):
        return

    code = _timed([
        "terraform", "plan", "-input=false", "-refresh-only", "-detailed-exitcode",
        f"-out={DRIFT_PLAN_FILE}", f"-var-file={var_file(environment)}",
    ])

    try:
        if code == 0:
            print(f"\n  {GREEN}{BOLD}✔ No drift detected.{RESET} Infrastructure matches the state.")
            return pause()
        if code != 2:
            return status(code)

        # Exit code 2: the refresh found differences. The JSON plan tells real ones from Azure's own changes.
        show_code, show_output = run_capture(["terraform", "show", "-json", DRIFT_PLAN_FILE], cwd=TERRAFORM_DIR)
        if show_code != 0:
            print(f"  {RED}Failed to read the drift plan.{RESET}")
            return status(show_code)

        plan = json.loads(show_output)
        drifted = [
            entry["address"]
            for entry in plan.get("resource_drift", [])
            if _normalize(entry["change"]["before"]) != _normalize(entry["change"]["after"])
        ]
        if not drifted:
            print(f"\n  {GREEN}{BOLD}✔ No real drift detected.{RESET} Only attributes Azure manages itself changed.")
        else:
            print(f"\n  {RED}{BOLD}⚠  Drift detected in {len(drifted)} resource(s):{RESET}")
            for address in drifted:
                print(f"    {CYAN}~{RESET} {address}")
        pause()
    finally:
        _remove(DRIFT_PLAN_FILE)
